import type {
  ChatMessagePayload,
  MatchFoundPayload,
  PeerStatePayload,
  QueueWaitingPayload,
} from './api-contracts.js';
import type { ConnectionQuality, MatchMode } from './enums.js';

// Typed Socket.IO event maps. Frontend and backend must import these, never redefine.

export interface ClientToServerEvents {
  'queue:join': (p: { mode: MatchMode }, ack: (r: { ok: boolean; error?: string }) => void) => void;
  'queue:leave': (ack: (r: { ok: boolean }) => void) => void;
  'rtc:offer': (
    p: { matchId: string; sdp: string },
    ack?: (r: { ok: boolean; error?: string }) => void,
  ) => void;
  'rtc:answer': (
    p: { matchId: string; sdp: string },
    ack?: (r: { ok: boolean; error?: string }) => void,
  ) => void;
  'rtc:ice': (
    p: {
      matchId: string;
      candidate: string;
      sdpMid?: string;
      sdpMLineIndex?: number;
    },
    ack?: (r: { ok: boolean }) => void,
  ) => void;
  'rtc:state': (p: { matchId: string; state: string; quality?: string }) => void;
  'chat:message': (
    p: { matchId: string; text: string; kind?: string },
    ack: (r: { ok: boolean; id?: string; error?: string }) => void,
  ) => void;
  'chat:typing': (p: { matchId: string; typing: boolean }) => void;
  'match:resume': (
    p: { matchId: string },
    ack?: (r: { ok: boolean; error?: string }) => void,
  ) => void;
  'match:skip': (p: { matchId: string }, ack?: (r: { ok: boolean }) => void) => void;
  'match:end': (p: { matchId: string }, ack?: (r: { ok: boolean }) => void) => void;
  'match:report': (
    p: { matchId: string; reportedUserId: string; reason: string; details?: string; severityHint?: string },
    ack: (r: { ok: boolean; caseId?: string; error?: string }) => void,
  ) => void;
  'match:block': (
    p: { matchId: string; reportedUserId: string },
    ack: (r: { ok: boolean; error?: string }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'queue:waiting': (p: QueueWaitingPayload) => void;
  'queue:timed_out': (p: { message: string }) => void;
  'queue:error': (p: { error: string }) => void;
  'match:found': (p: MatchFoundPayload) => void;
  'rtc:offer': (p: { matchId: string; sdp: string }) => void;
  'rtc:answer': (p: { matchId: string; sdp: string }) => void;
  'rtc:ice': (p: {
    matchId: string;
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  }) => void;
  'rtc:peer_state': (p: PeerStatePayload) => void;
  'chat:message': (p: ChatMessagePayload) => void;
  'chat:typing': (p: { matchId: string; typing: boolean }) => void;
  'match:skipped': (p: { matchId: string }) => void;
  'match:ended': (p: { matchId: string }) => void;
  'match:peer_left': (p: { matchId: string }) => void;
  /** Peer's socket dropped mid-match; the match stays alive for a grace period. */
  'match:peer_reconnecting': (p: { matchId: string; graceMs: number }) => void;
  /** Peer reconnected and is back in the match. */
  'match:peer_reconnected': (p: { matchId: string }) => void;
  'moderation:warning': (p: { message: string }) => void;
  error: (p: { message: string }) => void;
}
