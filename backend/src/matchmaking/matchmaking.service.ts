import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReservationService } from './reservation';
import { mutuallyCompatible, type CandidatePrefs } from './policy';
import { appConfig } from '../config/app.config';
import { logger } from '../common/logger';
import type { MatchMode } from '@bundle/shared';

export interface QueueEntrySnapshot {
  userId: string;
  prefs: CandidatePrefs;
  enqueuedAt: number;
  isPremium: boolean;
  interests: string[];
  recentMatchUserIds: string[];
}

/**
 * Interest affinity: count of shared tags (case-insensitive). Two users with no
 * tags score 0, which is treated as "no signal" rather than a negative.
 */
export function sharedInterests(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((s) => s.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of a) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag && setB.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

function parseInterestList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

type UserWithPrefProfile = Prisma.UserGetPayload<{
  include: {
    preferences: true;
    profile: true;
    subscriptions: true;
    matchesParticipant: { include: { match: true } };
  };
}>;

@Injectable()
export class MatchmakingService {
  /**
   * Registered by the realtime gateway so background pairing passes (worker) can
   * materialize + notify a match they create. Inline pairing in the gateway calls
   * notifyMatchFound directly; the worker has no gateway reference (avoids a DI
   * cycle), so it routes through this callback instead.
   */
  onBackgroundPair:
    | ((pair: { a: string; b: string; matchId: string; sharedInterests: string[] }, mode: MatchMode) => Promise<void>)
    | null = null;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private reservation: ReservationService,
  ) {}

  private get cfg() {
    return appConfig();
  }

  /**
   * Join queue. Returns error info when the user is ineligible.
   */
  async joinQueue(userId: string, mode: MatchMode): Promise<{ ok: boolean; error?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true, profile: true },
    });
    if (!user || user.deletedAt) return { ok: false, error: 'User not found' };
    if (user.status !== 'ACTIVE') return { ok: false, error: 'Account not active' };

    if (!user.preferences) {
      await this.prisma.userPreference.create({ data: { userId, seeking: 'EVERYONE' } });
    }

    const alreadyReserved = await this.redis.client?.hget(`buddy:mgm:res:${mode}`, userId);
    if (alreadyReserved) return { ok: false, error: 'Already in a match or reserved' };

    const okEnq = this.redis.ready ? await this.redis.enqueue(mode, userId) : false;
    if (!okEnq) return { ok: false, error: 'Queue unavailable' };
    logger.info({ userId, mode }, 'queue join');
    return { ok: true };
  }

  async leaveQueue(userId: string, mode: string): Promise<void> {
    if (!this.redis.ready) return;
    await this.redis.dequeue(mode, userId);
    logger.info({ userId, mode }, 'queue leave');
  }

  /**
   * Attempt one pairing pass for a mode. Called on joins and on a timer.
   */
  async tryPair(mode: MatchMode): Promise<{
    a: string;
    b: string;
    matchId: string;
    roleA: 'caller' | 'callee';
    sharedInterests: string[];
  } | null> {
    if (!this.redis.ready) {
      logger.warn('tryPair: redis not ready');
      return null;
    }
    const members = await this.redis.queueRangeFrom(mode, 30);
    if (members.length < 2) return null;

    const users: UserWithPrefProfile[] = await this.prisma.user.findMany({
      where: { id: { in: members.map((m) => m.member) }, deletedAt: null, status: 'ACTIVE' },
      include: {
        preferences: true,
        profile: true,
        subscriptions: true,
        matchesParticipant: { include: { match: true } },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const entries: QueueEntrySnapshot[] = members
      .filter((m) => byId.has(m.member))
      .map((m) => {
        const u = byId.get(m.member)!;
        return {
          userId: u.id,
          prefs: {
            userId: u.id,
            gender: (u.profile?.gender as CandidatePrefs['gender']) ?? null,
            seeking: (u.preferences?.seeking as CandidatePrefs['seeking']) ?? 'EVERYONE',
            preferVerified: !!u.preferences?.preferVerified,
          },
          enqueuedAt: m.score,
          isPremium: u.subscriptions.some(
            (s) => s.status === 'ACTIVE' && (s.currentPeriodEnd?.getTime() ?? 0) > Date.now(),
          ),
          interests: parseInterestList(u.profile?.interests),
          recentMatchUserIds: [],
        };
      });

    const parts = await this.prisma.matchParticipant.findMany({
      where: { userId: { in: entries.map((e) => e.userId) } },
      include: { match: { include: { participants: true } } },
    });
    const recentMap = new Map<string, Set<string>>();
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    for (const p of parts) {
      if (p.match.createdAt.getTime() < dayAgo) continue;
      const others = p.match.participants.filter((o) => o.userId !== p.userId).map((o) => o.userId);
      const set = recentMap.get(p.userId) ?? new Set<string>();
      for (const o of others) set.add(o);
      recentMap.set(p.userId, set);
    }
    for (const e of entries) e.recentMatchUserIds = [...(recentMap.get(e.userId) ?? [])];

    // Blocks are hard-exclusion: blocked pairs must never be matched.
    const userIds = entries.map((e) => e.userId);
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [{ userId: { in: userIds } }, { blockedId: { in: userIds } }],
      },
      select: { userId: true, blockedId: true },
    });
    const blockedPairs = new Set(blocks.flatMap((b) => [`${b.userId}|${b.blockedId}`, `${b.blockedId}|${b.userId}`]));

    // Fairness: longest-waiting users pair first. Recent matches within 24h are avoided.
    // For the longest-waiting user we scan all eligible partners and prefer the one
    // with the most shared interests (tie-broken by longest wait), so matching is both
    // fair and interest-aware. If nobody shares interests we still pair (no starvation).
    const sorted = [...entries].sort((x, y) => x.enqueuedAt - y.enqueuedAt);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      let best: { entry: QueueEntrySnapshot; shared: string[] } | null = null;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (blockedPairs.has(`${a.userId}|${b.userId}`)) continue;
        if (a.recentMatchUserIds.includes(b.userId)) continue;
        if (!mutuallyCompatible(a.prefs, b.prefs)) continue;
        const shared = sharedInterests(a.interests, b.interests);
        // sorted by enqueue time ascending, so an earlier `b` has waited longer.
        if (!best || shared.length > best.shared.length) {
          best = { entry: b, shared };
        }
      }
      if (!best) continue;
      const b = best.entry;
      const res = await this.reservation.reserve(a.userId, b.userId, mode, 90);
      if (!res) continue; // lock contention; next pass will retry
      await this.redis.dequeue(mode, a.userId);
      await this.redis.dequeue(mode, b.userId);
      logger.info(
        { a: a.userId, b: b.userId, matchId: res.matchId, mode, shared: best.shared },
        'pair reserved',
      );
      return {
        a: a.userId,
        b: b.userId,
        matchId: res.matchId,
        roleA: 'caller',
        sharedInterests: best.shared,
      };
    }
    return null;
  }

  async getUserProfileSummary(userId: string) {
    const view = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        profile: { select: { displayName: true, avatarHue: true, interests: true } },
        preferences: { select: { country: true } },
        ageAssurance: true,
      },
    });
    if (!view) {
      return {
        userId: '',
        username: 'unknown',
        displayName: 'unknown',
        avatarHue: 210,
        interests: [] as string[],
        country: null,
        isVerified: false,
      };
    }
    return {
      userId: view.id,
      username: view.username,
      displayName: view.profile?.displayName ?? view.username,
      avatarHue: view.profile?.avatarHue ?? 210,
      interests: view.profile ? (JSON.parse(view.profile.interests) as string[]) : [],
      country: view.preferences?.country ?? null,
      isVerified: view.ageAssurance === 'VERIFIED',
    };
  }

  async materializeMatch(res: {
    matchId: string;
    userA: string;
    userB: string;
    mode: MatchMode;
  }): Promise<{ matchDbId: string; policyVersion: number }> {
    const policyVersion = await this.getActivePolicyVersion();
    const match = await this.prisma.match.create({
      data: {
        id: res.matchId,
        mode: res.mode,
        status: 'ACTIVE',
        channelId: res.matchId,
        policyVersion,
        createdById: res.userA,
      },
    });
    await this.prisma.matchParticipant.createMany({
      data: [
        { matchId: match.id, userId: res.userA, role: 'caller' },
        { matchId: match.id, userId: res.userB, role: 'callee' },
      ],
    });
    logger.info({ matchId: match.id, mode: res.mode }, 'match materialized');
    return { matchDbId: match.id, policyVersion };
  }

  private async getActivePolicyVersion(): Promise<number> {
    const cfg = this.cfg;
    const found = await this.prisma.matchingPolicyVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    if (found) return found.version;
    const v1 = await this.prisma.matchingPolicyVersion.create({
      data: {
        version: 1,
        configJson: JSON.stringify({
          maleQueueAllocationTargetPct: cfg.maleQueueAllocationTargetPct,
          fairWaitBoostEnabled: cfg.fairWaitBoostEnabled,
          sparsePoolThreshold: cfg.sparsePoolThreshold,
        }),
        note: 'env defaults',
        activeSince: new Date(),
      },
    });
    return v1.version;
  }

  async getMatchWithParticipants(matchId: string) {
    return this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    });
  }

  async endMatch(matchId: string, byUserId: string, reason: string): Promise<void> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    });
    if (!match || match.status !== 'ACTIVE') return;
    const isParticipant = match.participants.some((p) => p.userId === byUserId);
    if (!isParticipant) return;
    await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'ENDED', endedAt: new Date(), endReason: reason },
    });
    const caller = match.participants.find((p) => p.role === 'caller');
    const callee = match.participants.find((p) => p.role === 'callee');
    if (caller && callee) {
      await this.reservation.release(caller.userId, callee.userId, match.mode as MatchMode);
    }
    logger.info({ matchId, byUserId, reason }, 'match ended');
  }
}
