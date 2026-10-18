import { Injectable, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import type { MatchFoundPayload } from '@bundle/shared';

export type Phase =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'matched'
  | 'in-call'
  | 'reconnecting'
  | 'peer-left'
  | 'error';

export interface IncomingChat {
  id: string;
  matchId: string;
  fromUserId: string;
  text: string;
  kind: 'text' | 'emoji' | 'reaction';
  sentAt: string;
}

const ICE_SERVERS_FALLBACK = [{ urls: ['stun:stun.l.google.com:19302'] }];

/**
 * Realtime + WebRTC peer connection orchestration.
 * All server events are typed to @bundle/shared contracts.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket: Socket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private currentMatchId: string | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private reconnectWatchdog: ReturnType<typeof setTimeout> | null = null;

  readonly connected = signal(false);
  readonly phase = signal<Phase>('idle');
  readonly matchInfo = signal<MatchFoundPayload | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly remoteState = signal<RTCPeerConnectionState | null>(null);
  readonly errorMessage = signal<string | null>(null);
  /** True while the server tells us the peer dropped and may come back. */
  readonly peerReconnecting = signal(false);
  /** Set when the server flags media from this user during a call. */
  readonly mediaWarning = signal<{ blocked: boolean; reason: string } | null>(null);

  /** Public read access to the local camera stream (for PiP self-view). */
  get localStreamView(): MediaStream | null {
    return this.localStream;
  }

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) return resolve();
      this.socket = io(window.location.origin, {
        auth: { token },
        // polling fallback first: survives proxies/LBs that block pure-websocket upgrades.
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionAttempts: 10,
      });
      this.socket.on('connect', () => {
        this.connected.set(true);
        // If we dropped mid-match, ask the server to re-attach this socket to
        // the still-active match (grace window on the server side).
        if (this.currentMatchId && (this.phase() === 'reconnecting' || this.phase() === 'in-call')) {
          this.socket?.emit('match:resume', { matchId: this.currentMatchId }, (r: { ok: boolean; error?: string }) => {
            if (r?.ok) {
              this.phase.set(this.remoteStream() ? 'in-call' : 'matched');
              if (this.reconnectWatchdog) {
                clearTimeout(this.reconnectWatchdog);
                this.reconnectWatchdog = null;
              }
            } else {
              this.phase.set('peer-left');
            }
          });
        }
        resolve();
      });
      this.socket.on('connect_error', (e) => {
        this.errorMessage.set(e.message);
        if (!this.connected()) reject(e);
      });
      this.socket.on('disconnect', () => {
        this.connected.set(false);
        if (this.phase() === 'in-call' || this.phase() === 'matched' || this.phase() === 'reconnecting') {
          // Don't end the call on a blip: socket.io will auto-reconnect and
          // we'll send match:resume on 'connect'. Grace UI with a watchdog —
          // if we never reconnect, fall back to peer-left like before.
          this.phase.set('reconnecting');
          if (this.reconnectWatchdog) clearTimeout(this.reconnectWatchdog);
          this.reconnectWatchdog = setTimeout(() => {
            if (!this.connected() && this.phase() === 'reconnecting') {
              this.phase.set('peer-left');
            }
          }, 20_000);
        }
      });
      this.socket.on('queue:waiting', (p: { waitedMs: number }) => {
        if (this.phase() !== 'waiting') this.phase.set('waiting');
      });
      this.socket.on('queue:error', (p: { error: string }) => {
        this.errorMessage.set(p.error);
        this.phase.set('error');
      });
      this.socket.on('match:found', (p: MatchFoundPayload) => this.onMatchFound(p));
      this.socket.on('rtc:offer', (p: { matchId: string; sdp: string }) => this.onRemoteOffer(p));
      this.socket.on('rtc:answer', (p: { matchId: string; sdp: string }) => this.onRemoteAnswer(p));
      this.socket.on('rtc:ice', (p: { matchId: string; candidate: string; sdpMid?: string; sdpMLineIndex?: number }) =>
        this.onRemoteIce(p),
      );
      this.socket.on('rtc:peer_state', (p: { state: string }) => {
        this.remoteState.set(p.state as RTCPeerConnectionState);
        if (p.state === 'connected' || p.state === 'checking') {
          if (this.phase() !== 'in-call') this.phase.set('in-call');
        }
      });
      this.socket.on('match:skipped', () => {
        this.peerReconnecting.set(false);
        this.resetToIdle();
      });
      this.socket.on('match:ended', () => {
        this.peerReconnecting.set(false);
        this.resetToIdle();
      });
      this.socket.on('match:peer_left', () => {
        this.peerReconnecting.set(false);
        this.phase.set('peer-left');
      });
      this.socket.on('match:peer_reconnecting', () => {
        this.peerReconnecting.set(true);
      });
      this.socket.on('match:peer_reconnected', () => {
        this.peerReconnecting.set(false);
        if (this.phase() === 'reconnecting' || this.phase() === 'matched') {
          this.phase.set(this.remoteStream() ? 'in-call' : 'matched');
        }
      });
      this.socket.on('moderation:warning', (p: { message: string }) => {
        this.errorMessage.set(p.message);
      });
      this.socket.on('media:warning', (p: { matchId: string; blocked: boolean; reason: string }) => {
        if (p.matchId === this.currentMatchId) {
          this.mediaWarning.set({ blocked: p.blocked, reason: p.reason });
        }
      });
      this.socket.on('error', (p: { message: string }) => {
        this.errorMessage.set(p.message);
        if (!this.connected()) reject(new Error(p.message));
      });
    });
  }

  disconnectSocket() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
  }

  on<T extends keyof SocketEventMap>(event: T, handler: SocketEventMap[T]) {
    this.socket?.on(event, handler as never);
  }

  off<T extends keyof SocketEventMap>(event: T, handler?: SocketEventMap[T]) {
    this.socket?.off(event, handler as never);
  }

  // ---------- queue ----------

  joinQueue(mode: 'VIDEO' | 'TEXT'): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('queue:join', { mode }, (r: { ok: boolean; error?: string }) => resolve(r));
      setTimeout(() => resolve({ ok: false, error: 'timeout' }), 10000);
    });
  }

  leaveQueue(): Promise<void> {
    return new Promise((resolve) => {
      this.socket?.emit('queue:leave', () => resolve());
      this.resetToIdle();
    });
  }

  // ---------- WebRTC ----------

  async ensureLocalMedia(video: boolean): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: video
          ? isMobile
            ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
          : false,
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      // Fallback: low-bandwidth profile for weak devices/cameras.
      if (video) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
      } else throw e;
    }
    return this.localStream;
  }

  private buildPeer(): RTCPeerConnection {
    const cfg: RTCConfiguration = { iceServers: this.matchInfo()?.iceServers ?? ICE_SERVERS_FALLBACK };
    const pc = new RTCPeerConnection(cfg);
    pc.onicecandidate = (e) => {
      if (e.candidate && this.currentMatchId) {
        this.socket?.emit('rtc:ice', {
          matchId: this.currentMatchId,
          candidate: e.candidate.toJSON().candidate,
          sdpMid: e.candidate.sdpMid ?? undefined,
          sdpMLineIndex: e.candidate.sdpMLineIndex ?? undefined,
        });
      }
    };
    pc.ontrack = (e) => {
      this.remoteStream.set(e.streams[0] ?? null);
    };
    pc.onconnectionstatechange = () => {
      this.remoteState.set(pc.connectionState);
      if (pc.connectionState === 'connected' && this.phase() !== 'in-call') {
        this.phase.set('in-call');
      } else if (pc.connectionState === 'failed') {
        this.phase.set('error');
        this.errorMessage.set('Media connection failed. Check your network or try again.');
      }
    };
    return pc;
  }

  private async onMatchFound(p: MatchFoundPayload) {
    this.matchInfo.set(p);
    this.currentMatchId = p.matchId;
    this.pendingIce = [];
    this.phase.set('matched');
    if (p.mode === 'VIDEO') {
      await this.setupVideoPeer(p.role === 'caller');
    }
  }

  private async setupVideoPeer(initiate: boolean) {
    this.pc = this.buildPeer();
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) this.pc.addTrack(track, this.localStream);
    }
    if (initiate) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.socket?.emit('rtc:offer', { matchId: this.currentMatchId!, sdp: offer.sdp! });
    }
    // callee waits for offer
  }

  private async onRemoteOffer(p: { matchId: string; sdp: string }) {
    if (p.matchId !== this.currentMatchId) return;
    if (!this.pc) await this.setupVideoPeer(false);
    await this.pc!.setRemoteDescription({ type: 'offer', sdp: p.sdp });
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    this.socket?.emit('rtc:answer', { matchId: this.currentMatchId!, sdp: answer.sdp! });
    for (const c of this.pendingIce) {
      try { await this.pc!.addIceCandidate(c); } catch { /* stale */ }
    }
    this.pendingIce = [];
  }

  private async onRemoteAnswer(p: { matchId: string; sdp: string }) {
    if (!this.pc || p.matchId !== this.currentMatchId) return;
    await this.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
    for (const c of this.pendingIce) {
      try { await this.pc.addIceCandidate(c); } catch { /* stale */ }
    }
    this.pendingIce = [];
  }

  private async onRemoteIce(p: { matchId: string; candidate: string; sdpMid?: string; sdpMLineIndex?: number }) {
    if (p.matchId !== this.currentMatchId) return;
    const cand: RTCIceCandidateInit = {
      candidate: p.candidate,
      sdpMid: p.sdpMid ?? null,
      sdpMLineIndex: p.sdpMLineIndex ?? null,
    };
    if (this.pc?.remoteDescription) {
      try { await this.pc.addIceCandidate(cand); } catch { /* stale */ }
    } else {
      this.pendingIce.push(cand);
    }
  }

  // ---------- chat ----------

  sendMessage(text: string, kind: 'text' | 'emoji' | 'reaction' = 'text'): Promise<{ ok: boolean; id?: string; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('chat:message', { matchId: this.currentMatchId!, text, kind }, (r: { ok: boolean; id?: string; error?: string }) =>
        resolve(r),
      );
    });
  }

  sendTyping(typing: boolean) {
    if (this.currentMatchId) {
      this.socket?.emit('chat:typing', { matchId: this.currentMatchId, typing });
    }
  }

  // ---------- lifecycle ----------

  skip(): Promise<void> {
    return new Promise((resolve) => {
      if (this.currentMatchId) {
        this.socket?.emit('match:skip', { matchId: this.currentMatchId }, () => resolve());
      } else resolve();
      this.teardownPeer();
      this.resetToIdle();
    });
  }

  endCall(): Promise<void> {
    return new Promise((resolve) => {
      if (this.currentMatchId) {
        this.socket?.emit('match:end', { matchId: this.currentMatchId }, () => resolve());
      } else resolve();
      this.teardownPeer();
      this.resetToIdle();
    });
  }

  /** Attempts a rematch right away after skip/peer-left. */
  rejoin(mode: 'VIDEO' | 'TEXT') {
    this.resetToIdle();
    return this.joinQueue(mode);
  }

  reportPeer(reportedUserId: string, reason: string, details?: string): Promise<{ ok: boolean; caseId?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit(
        'match:report',
        { matchId: this.currentMatchId, reportedUserId, reason, details, severityHint: 'MEDIUM' },
        (r: { ok: boolean; caseId?: string }) => resolve(r),
      );
    });
  }

  blockPeer(reportedUserId: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      this.socket?.emit('match:block', { matchId: this.currentMatchId, reportedUserId }, (r: { ok: boolean }) =>
        resolve(r),
      );
    });
  }

  /** Send a captured media frame for moderation during an active match. */
  sendMediaFrame(matchId: string, kind: 'VIDEO_FRAME' | 'AUDIO_SEGMENT' | 'SCREENSHOT', dataUrl: string): Promise<{ ok: boolean; blocked: boolean; labels: string[] }> {
    return new Promise((resolve) => {
      this.socket?.emit(
        'media:frame',
        { matchId, kind, dataUrl },
        (r: { ok: boolean; blocked: boolean; labels: string[] }) => resolve(r),
      );
    });
  }

  toggleMic(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  toggleCam(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
  }

  async switchCamera() {
    if (!this.localStream) return;
    const track = this.localStream.getVideoTracks()[0];
    if (!track) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const current = track.getSettings().deviceId;
      const idx = cams.findIndex((d) => d.deviceId === current);
      const next = cams[(idx + 1) % cams.length];
      if (!next) return;
      this.localStream.getVideoTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } });
      const newTrack = stream.getVideoTracks()[0];
      const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      this.localStream.removeTrack(track);
      this.localStream.addTrack(newTrack);
    } catch {
      /* ignore unsupported */
    }
  }

  stopLocalMedia() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  private teardownPeer() {
    this.pc?.close();
    this.pc = null;
    this.remoteStream.set(null);
    this.currentMatchId = null;
  }

  resetToIdle() {
    this.teardownPeer();
    this.matchInfo.set(null);
    this.remoteState.set(null);
    this.errorMessage.set(null);
    this.peerReconnecting.set(false);
    this.phase.set('idle');
  }

  get peer() {
    return this.pc;
  }
}

interface SocketEventMap {
  'chat:message': (msg: IncomingChat) => void;
  'chat:typing': (p: { matchId: string; typing: boolean }) => void;
  'media:warning': (p: { matchId: string; blocked: boolean; reason: string }) => void;
}
