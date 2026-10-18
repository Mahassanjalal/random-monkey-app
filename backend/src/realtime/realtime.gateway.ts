import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verify } from 'jsonwebtoken';
import Redis from 'ioredis';
import { appConfig } from '../config/app.config';
import { RedisService } from '../redis/redis.service';
import { RealtimeService, type AuthedSocket } from './realtime.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { ChatService } from '../chat/chat.service';
import { ModerationService } from '../moderation/moderation.service';
import { ReportsService } from '../reports/reports.service';
import { logger } from '../common/logger';
import {
  chatSendSchema,
  matchResumeSchema,
  mediaFrameSchema,
  parse,
  queueJoinSchema,
  rtcAnswerSchema,
  rtcIceSchema,
  rtcOfferSchema,
  rtcStateSchema,
} from '../common/socket.schemas';
import type { MatchMode } from '@bundle/shared';
import { createHmac } from 'crypto';

const SIGNAL_RATE = { windowMs: 2000, max: 60 };
const CHAT_RATE = { windowMs: 10000, max: 12 };
/** How long a dropped socket may resume its match before it is treated as left. */
export const MATCH_RESUME_GRACE_MS = 20_000;

interface RateBucket {
  count: number;
  resetAt: number;
}

type Ack = (r: Record<string, unknown>) => void;

function ackOf(args: unknown[]): Ack | undefined {
  const last = args[args.length - 1];
  return typeof last === 'function' ? (last as Ack) : undefined;
}

@Injectable()
@WebSocketGateway({ cors: { origin: appConfig().corsOrigins, credentials: true }, namespace: '/' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(RealtimeGateway.name);
  private rate = new Map<string, RateBucket>();
  /** Redis pub/sub clients for the Socket.IO adapter (multi-replica scaling). */
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    private realtime: RealtimeService,
    private redis: RedisService,
    private matchmaking: MatchmakingService,
    private chat: ChatService,
    private moderation: ModerationService,
    private reports: ReportsService,
  ) {}

  private presenceTimer: ReturnType<typeof setInterval> | null = null;

  afterInit(server: Server) {
    this.realtime.setServer(server);
    // Attach the Redis adapter so Socket.IO rooms/events work across multiple API replicas.
    const cfg = appConfig();
    if (cfg.redisEnabled && cfg.redisUrl) {
      try {
        this.pubClient = new Redis(cfg.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });
        this.subClient = this.pubClient.duplicate();
        void this.pubClient.connect();
        void this.subClient.connect();
        server.adapter(createAdapter(this.pubClient, this.subClient));
        logger.info('socket.io redis adapter attached');
      } catch (e) {
        logger.warn({ err: String(e) }, 'socket.io redis adapter failed; single-instance only');
      }
    }
    // Let the background matcher materialize + notify matches it creates.
    this.matchmaking.onBackgroundPair = async (pair, mode) => {
      await this.notifyMatchFound(pair, mode);
    };
    // Keep presence fresh for idle-but-connected sockets (TTL is 45s; refresh at ~1/3).
    this.presenceTimer = setInterval(() => {
      for (const userId of this.realtime.connectedUserIds()) {
        void this.redis.heartbeat(userId);
      }
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    for (const t of this.resumeTimers.values()) clearTimeout(t);
    this.resumeTimers.clear();
    void this.pubClient?.quit().catch(() => undefined);
    void this.subClient?.quit().catch(() => undefined);
  }

  private clearResumeTimer(matchId: string) {
    const t = this.resumeTimers.get(matchId);
    if (t) {
      clearTimeout(t);
      this.resumeTimers.delete(matchId);
    }
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string) ??
      (client.handshake.headers.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.slice(7)
        : undefined);
    if (!token) {
      client.emit('error', { message: 'Auth required' });
      client.disconnect(true);
      return;
    }
    try {
      const payload = verify(token, appConfig().jwtSecret, {
        issuer: 'buddy-api',
        clockTolerance: 30,
      }) as {
        sub: string;
        username: string;
        role: string;
      };
      client.userId = payload.sub;
      client.username = payload.username;
      client.role = payload.role;
    } catch {
      client.emit('error', { message: 'Invalid token' });
      client.disconnect(true);
      return;
    }
    this.realtime.registerUserSocket(client.userId!, client.id);
    await this.redis.heartbeat(client.userId!);
  }

  /** matchId → timer for sockets that dropped mid-match and may still resume. */
  private resumeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    if (!client.userId) return;
    this.realtime.unregisterUserSocket(client.userId, client.id);
    // Last socket gone → drop presence immediately (multi-tab aware).
    if (this.realtime.socketsForUser(client.userId).length === 0) {
      await this.redis.dropPresence(client.userId);
    }
    if (client.activeMatchId) {
      const matchId = client.activeMatchId;
      this.realtime.leaveMatch(client.id, matchId);
      // Mobile networks blip. Give this user a grace window to resume on a new
      // socket; only finalize as "peer_left" if they never come back.
      const stillHasSockets = this.realtime.socketsForUser(client.userId).length > 0;
      if (!stillHasSockets) {
        this.realtime.emitToMatch(
          matchId,
          'match:peer_reconnecting',
          { matchId, graceMs: MATCH_RESUME_GRACE_MS },
          client.id,
        );
        const timer = setTimeout(() => void this.finalizeResumeTimeout(matchId, client.userId!), MATCH_RESUME_GRACE_MS);
        this.resumeTimers.set(matchId, timer);
      }
    }
    for (const mode of ['VIDEO', 'TEXT']) {
      try {
        await this.matchmaking.leaveQueue(client.userId, mode);
      } catch {
        // queue cleanup is best-effort on disconnect
      }
    }
  }

  private async finalizeResumeTimeout(matchId: string, userId: string): Promise<void> {
    this.resumeTimers.delete(matchId);
    // The user may have resumed on another socket in the meantime.
    const resumed = this.realtime.socketsInMatch(matchId).some(
      (sid) => this.socketUserId(sid) === userId,
    );
    if (resumed) return;
    this.realtime.emitToMatch(matchId, 'match:peer_left', { matchId });
    await this.matchmaking.endMatch(matchId, userId, 'peer_left');
  }

  private socketUserId(sid: string): string | undefined {
    const socketMap = this.server?.sockets as unknown as Map<string, AuthedSocket> | undefined;
    return socketMap?.get(sid)?.userId;
  }

  /** Client reconnected after a blip and asks to rejoin its still-active match. */
  @SubscribeMessage('match:resume')
  async onMatchResume(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    try {
      if (!client.userId) return { ok: false, error: 'Not authenticated' };
      const p = parse(matchResumeSchema, dto);
      const match = await this.matchmaking.getMatchWithParticipants(p.matchId);
      if (!match || match.status !== 'ACTIVE') {
        return { ok: false, error: 'Match no longer active' };
      }
      const isParticipant = match.participants.some((pt) => pt.userId === client.userId);
      if (!isParticipant) return { ok: false, error: 'Not a participant' };

      const timer = this.resumeTimers.get(p.matchId);
      if (timer) {
        clearTimeout(timer);
        this.resumeTimers.delete(p.matchId);
      }
      client.activeMatchId = p.matchId;
      this.realtime.joinMatch(client.id, p.matchId);
      this.realtime.emitToMatch(p.matchId, 'match:peer_reconnected', { matchId: p.matchId }, client.id);
      await this.redis.heartbeat(client.userId);
      logger.info({ userId: client.userId, matchId: p.matchId }, 'match resumed after reconnect');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  private allow(key: string, limit: typeof SIGNAL_RATE): boolean {
    const now = Date.now();
    const b = this.rate.get(key);
    if (!b || b.resetAt < now) {
      this.rate.set(key, { count: 1, resetAt: now + limit.windowMs });
      // Bound memory at scale: opportunistic eviction of expired buckets.
      if (this.rate.size > 20000) {
        for (const [k, v] of this.rate) {
          if (v.resetAt < now) this.rate.delete(k);
          if (this.rate.size <= 15000) break;
        }
      }
      return true;
    }
    b.count++;
    return b.count <= limit.max;
  }

  private assertMatchMember(socket: AuthedSocket, matchId: string): boolean {
    return !!socket.userId && socket.activeMatchId === matchId;
  }

  @SubscribeMessage('queue:join')
  async onQueueJoin(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    try {
      if (!client.userId) return { ok: false, error: 'Not authenticated' };
      const parsed = parse(queueJoinSchema, dto ?? {});
      const mode = parsed.mode as MatchMode;
      const res = await this.matchmaking.joinQueue(client.userId, mode);
      if (!res.ok) {
        client.emit('queue:error', { error: res.error ?? 'join failed' });
        return { ok: false, error: res.error };
      }
      const waitedMsFallback = (await this.redis.queueWaitMs(client.userId, mode)) ?? 0;
      let pair = await this.matchmaking.tryPair(mode);
      // Retry briefly: the other peer's queue PUBLISH may still be in flight.
      for (let i = 0; i < 3 && !pair; i++) {
        await new Promise((r) => setTimeout(r, 250));
        pair = await this.matchmaking.tryPair(mode);
      }
      if (pair) {
        await this.notifyMatchFound(pair, mode);
      } else {
        const waitedMs = waitedMsFallback;
        client.emit('queue:waiting', { position: null, waitedMs });
      }
      return { ok: true };
    } catch (e) {
      logger.warn({ err: String(e) }, 'queue:join error');
      return { ok: false, error: String(e) };
    }
  }

  @SubscribeMessage('queue:leave')
  async onQueueLeave(client: AuthedSocket) {
    if (!client.userId) return { ok: false };
    for (const mode of ['VIDEO', 'TEXT']) {
      await this.matchmaking.leaveQueue(client.userId, mode);
    }
    return { ok: true };
  }

  /** Haversine distance in km between two lat/lng points. */
  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  private async notifyMatchFound(
    pair: { a: string; b: string; matchId: string; sharedInterests?: string[] },
    mode: MatchMode,
  ): Promise<void> {
    const { matchId } = pair;
    const shared = pair.sharedInterests ?? [];
    await this.matchmaking.materializeMatch({ matchId, userA: pair.a, userB: pair.b, mode });
    const ice = this.buildIceServers();

    // Load both users' locations to compute distance.
    const users = await this.matchmaking.getUsersWithLocations([pair.a, pair.b]);
    const locById = new Map(users.map((u) => [u.id, u.locations]));

    for (const [userId, role] of [
      [pair.a, 'caller'],
      [pair.b, 'callee'],
    ] as const) {
      const peerId = userId === pair.a ? pair.b : pair.a;
      const peer = await this.matchmaking.getUserProfileSummary(peerId);
      const peerLoc = locById.get(peerId);
      const selfLoc = locById.get(userId);
      let distanceKm: number | null = null;
      if (
        peerLoc?.lat !== null &&
        peerLoc?.lng !== null &&
        selfLoc?.lat !== null &&
        selfLoc?.lng !== null
      ) {
        distanceKm = this.haversineKm(
          selfLoc!.lat,
          selfLoc!.lng,
          peerLoc!.lat,
          peerLoc!.lng,
        );
      }
      const peerSummary = {
        userId: peer.userId,
        username: peer.username,
        displayName: peer.displayName,
        avatarHue: peer.avatarHue,
        interests: peer.interests,
        country: peer.country,
        isVerified: peer.isVerified,
        badges: peer.badges ?? [],
        distanceKm,
      };
      for (const sid of this.realtime.socketsForUser(userId)) {
        this.realtime.emitToSocket(sid, 'match:found', {
          matchId,
          mode,
          role,
          peer: peerSummary,
          sharedInterests: shared,
          iceServers: ice,
        });
        // socket.io v4.8: namespace.sockets is a Map<sid, Socket>
        const socketMap = this.server?.sockets as unknown as Map<string, AuthedSocket> | undefined;
        const sock = socketMap?.get(sid);
        if (sock) {
          sock.activeMatchId = matchId;
        }
        this.realtime.joinMatch(sid, matchId);
      }
    }
  }

  /**
   * Generate time-limited TURN credentials using the shared TURN_SECRET.
   * Username = expiry timestamp; password = HMAC-SHA1(secret, username).
   * coturn validates these via --use-auth-secret.
   */
  private generateTurnCredentials(): { username: string; credential: string; ttlSec: number } | null {
    const cfg = appConfig();
    if (!cfg.turnSecret) return null;
    const ttlSec = cfg.turnTtlSec;
    const username = String(Math.floor(Date.now() / 1000) + ttlSec);
    const credential = createHmac('sha1', cfg.turnSecret).update(username).digest('base64');
    return { username, credential, ttlSec };
  }

  private buildIceServers() {
    const cfg = appConfig();
    const servers: { urls: string[]; username?: string; credential?: string }[] = [];
    if (cfg.iceServers.length) servers.push({ urls: cfg.iceServers });

    // Prefer dynamic credentials when TURN_SECRET is configured; fall back to static.
    const dynamic = this.generateTurnCredentials();
    if (cfg.turnUrl) {
      if (dynamic) {
        servers.push({
          urls: [cfg.turnUrl],
          username: dynamic.username,
          credential: dynamic.credential,
        });
      } else if (cfg.turnUsername || cfg.turnCredential) {
        servers.push({
          urls: [cfg.turnUrl],
          username: cfg.turnUsername || undefined,
          credential: cfg.turnCredential || undefined,
        });
      }
    }
    return servers;
  }

  @SubscribeMessage('rtc:offer')
  async onRtcOffer(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    if (!this.allow(`sig:${client.userId}`, SIGNAL_RATE)) return { ok: false };
    try {
      const p = parse(rtcOfferSchema, dto);
      if (!this.assertMatchMember(client, p.matchId)) {
        logger.warn({ userId: client.userId, matchId: p.matchId }, 'rtc:offer not member');
        return { ok: false, error: 'not in match' };
      }
      this.realtime.emitToMatch(p.matchId, 'rtc:offer', { matchId: p.matchId, sdp: p.sdp }, client.id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  @SubscribeMessage('rtc:answer')
  async onRtcAnswer(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    if (!this.allow(`sig:${client.userId}`, SIGNAL_RATE)) return { ok: false };
    try {
      const p = parse(rtcAnswerSchema, dto);
      if (!this.assertMatchMember(client, p.matchId)) {
        logger.warn({ userId: client.userId, matchId: p.matchId }, 'rtc:answer not member');
        return { ok: false, error: 'not in match' };
      }
      this.realtime.emitToMatch(p.matchId, 'rtc:answer', { matchId: p.matchId, sdp: p.sdp }, client.id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  @SubscribeMessage('rtc:ice')
  async onRtcIce(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    if (!this.allow(`sig:${client.userId}`, SIGNAL_RATE)) return { ok: false };
    try {
      const p = parse(rtcIceSchema, dto);
      if (!this.assertMatchMember(client, p.matchId)) return { ok: false, error: 'not in match' };
      this.realtime.emitToMatch(
        p.matchId,
        'rtc:ice',
        { matchId: p.matchId, candidate: p.candidate, sdpMid: p.sdpMid, sdpMLineIndex: p.sdpMLineIndex },
        client.id,
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  @SubscribeMessage('rtc:state')
  async onRtcState(client: AuthedSocket, dto: unknown) {
    if (!this.allow(`sig:${client.userId}`, SIGNAL_RATE)) return { ok: false };
    try {
      const p = parse(rtcStateSchema, dto);
      if (!this.assertMatchMember(client, p.matchId)) return { ok: false, error: 'not in match' };
      this.realtime.emitToMatch(
        p.matchId,
        'rtc:peer_state',
        { state: p.state, quality: p.quality },
        client.id,
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  @SubscribeMessage('chat:message')
  async onChatMessage(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    const cb = ackOf(ackArgs);
    if (!client.userId) return cb?.({ ok: false, error: 'Not authenticated' });
    if (!this.allow(`chat:${client.userId}`, CHAT_RATE)) {
      return cb?.({ ok: false, error: 'Slow down' });
    }
    try {
      const p = parse(chatSendSchema, dto);
      if (!this.assertMatchMember(client, p.matchId)) {
        return cb?.({ ok: false, error: 'Not in match' });
      }
      const verdict = await this.moderation.checkText(p.text);
      if (verdict.blocked) {
        client.emit('moderation:warning', { message: 'Message blocked by moderation' });
        return cb?.({ ok: false, error: 'blocked' });
      }
      const msg = await this.chat.persistMessage(p.matchId, client.userId!, p.text, p.kind ?? 'text');
      this.realtime.emitToMatch(p.matchId, 'chat:message', msg, client.id);
      cb?.({ ok: true, id: msg.id });
      return { ok: true, id: msg.id };
    } catch (e) {
      return cb?.({ ok: false, error: String(e) });
    }
  }

  @SubscribeMessage('chat:typing')
  async onChatTyping(client: AuthedSocket, dto: unknown) {
    try {
      const p = parse(rtcIceSchema.pick({ matchId: true }), dto);
      if (!this.assertMatchMember(client, p.matchId)) return { ok: false };
      const typing = !!(dto as { typing?: boolean })?.typing;
      this.realtime.emitToMatch(p.matchId, 'chat:typing', { matchId: p.matchId, typing }, client.id);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('match:skip')
  async onMatchSkip(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    const cb = ackOf(ackArgs);
    try {
      const p = parse(rtcIceSchema.pick({ matchId: true }), dto);
      if (!p.matchId || !this.assertMatchMember(client, p.matchId)) {
        cb?.({ ok: false, error: 'not in match' });
        return { ok: false };
      }
      await this.matchmaking.endMatch(p.matchId, client.userId!, 'skipped');
      this.clearResumeTimer(p.matchId);
      this.realtime.emitToMatch(p.matchId, 'match:skipped', { matchId: p.matchId }, client.id);
      this.realtime.leaveMatch(client.id, p.matchId);
      client.activeMatchId = undefined;
      cb?.({ ok: true });
      return { ok: true };
    } catch (e) {
      cb?.({ ok: false, error: String(e) });
      return { ok: false };
    }
  }

  @SubscribeMessage('match:end')
  async onMatchEnd(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    const cb = ackOf(ackArgs);
    try {
      const p = parse(rtcIceSchema.pick({ matchId: true }), dto);
      if (!p.matchId || !this.assertMatchMember(client, p.matchId)) {
        cb?.({ ok: false, error: 'not in match' });
        return { ok: false };
      }
      await this.matchmaking.endMatch(p.matchId, client.userId!, 'ended');
      this.clearResumeTimer(p.matchId);
      this.realtime.emitToMatch(p.matchId, 'match:ended', { matchId: p.matchId }, client.id);
      this.realtime.leaveMatch(client.id, p.matchId);
      client.activeMatchId = undefined;
      cb?.({ ok: true });
      return { ok: true };
    } catch (e) {
      cb?.({ ok: false, error: String(e) });
      return { ok: false };
    }
  }

  @SubscribeMessage('match:report')
  async onMatchReport(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    const cb = ackOf(ackArgs);
    try {
      const p = dto as {
        matchId?: string;
        reportedUserId?: string;
        reason?: string;
        details?: string;
        severityHint?: string;
      };
      if (!p.matchId || !p.reportedUserId || !this.assertMatchMember(client, p.matchId)) {
        return cb?.({ ok: false, error: 'Not in match' });
      }
      const r = await this.reports.fileReport({
        matchId: p.matchId,
        reporterId: client.userId!,
        reportedUserId: p.reportedUserId,
        reason: p.reason ?? 'OTHER',
        details: p.details,
        severityHint: p.severityHint,
      });
      cb?.({ ok: true, caseId: r.caseId });
      return { ok: true };
    } catch (e) {
      return cb?.({ ok: false, error: String(e) });
    }
  }

  @SubscribeMessage('match:block')
  async onMatchBlock(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    const cb = ackOf(ackArgs);
    try {
      const p = dto as { matchId?: string; reportedUserId?: string };
      if (!p.matchId || !p.reportedUserId || !this.assertMatchMember(client, p.matchId)) {
        return cb?.({ ok: false, error: 'Not in match' });
      }
      await this.reports.blockUser(client.userId!, p.reportedUserId);
      cb?.({ ok: true });
      return { ok: true };
    } catch (e) {
      return cb?.({ ok: false, error: String(e) });
    }
  }

  @SubscribeMessage('media:frame')
  async onMediaFrame(client: AuthedSocket, dto: unknown, ...ackArgs: unknown[]) {
    const cb = ackOf(ackArgs);
    try {
      const p = parse(mediaFrameSchema, dto);
      if (!client.userId || !this.assertMatchMember(client, p.matchId)) {
        return cb?.({ ok: false, error: 'Not in match' });
      }
      const verdict = await this.moderation.checkMedia(
        p.matchId,
        client.userId,
        p.kind as import('@bundle/shared').MediaModerationKind,
        p.dataUrl,
      );
      if (verdict.blocked) {
        // Warn only the sender; the peer continues unaffected unless they also send flagged media.
        client.emit('media:warning', {
          matchId: p.matchId,
          blocked: true,
          reason: verdict.flaggedLabels.join(', ') || 'Media flagged',
        });
      }
      cb?.({ ok: true, blocked: verdict.blocked, labels: verdict.flaggedLabels });
      return { ok: true, blocked: verdict.blocked };
    } catch (e) {
      return cb?.({ ok: false, error: String(e) });
    }
  }
}
