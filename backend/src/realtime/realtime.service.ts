import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

export interface AuthedSocket extends Socket {
  userId?: string;
  username?: string;
  role?: string;
  activeMatchId?: string;
}

// In-memory registry of active matchId → Set<socketId>. Single-instance only;
// for horizontal scale replace with Redis sets keyed per match (documented in docs/deployment.md).
@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  private matchSockets = new Map<string, Set<string>>();
  private typingState = new Map<string, Set<string>>();

  setServer(s: Server) {
    this.server = s;
  }

  get io(): Server | null {
    return this.server;
  }

  private userSockets = new Map<string, Set<string>>();

  registerUserSocket(userId: string, socketId: string): void {
    const set = this.userSockets.get(userId) ?? new Set<string>();
    set.add(socketId);
    this.userSockets.set(userId, set);
  }

  unregisterUserSocket(userId: string, socketId: string): void {
    this.userSockets.get(userId)?.delete(socketId);
    if (this.userSockets.get(userId)?.size === 0) this.userSockets.delete(userId);
  }

  socketsForUser(userId: string): string[] {
    return [...(this.userSockets.get(userId) ?? [])];
  }

  /** All userIds with at least one live socket (for presence refresh). */
  connectedUserIds(): string[] {
    return [...this.userSockets.keys()];
  }

  joinMatch(socketId: string, matchId: string): void {
    const s = this.matchSockets.get(matchId) ?? new Set<string>();
    s.add(socketId);
    this.matchSockets.set(matchId, s);
  }

  leaveMatch(socketId: string, matchId: string): void {
    this.matchSockets.get(matchId)?.delete(socketId);
  }

  socketsInMatch(matchId: string): string[] {
    return [...(this.matchSockets.get(matchId) ?? [])];
  }

  emitToMatch(matchId: string, event: string, payload: unknown, exceptSocketId?: string): void {
    const room = this.socketsInMatch(matchId);
    for (const sid of room) {
      if (sid === exceptSocketId) continue;
      this.server?.to(sid).emit(event, payload);
    }
  }

  emitToSocket(socketId: string, event: string, payload: unknown): void {
    this.server?.to(socketId).emit(event, payload);
  }

  setTyping(matchId: string, socketId: string, isTyping: boolean): void {
    const set = this.typingState.get(matchId) ?? new Set<string>();
    if (isTyping) {
      set.add(socketId);
    } else {
      set.delete(socketId);
    }
    this.typingState.set(matchId, set);
  }

  isTyping(matchId: string, socketId: string): boolean {
    return this.typingState.get(matchId)?.has(socketId) ?? false;
  }
}
