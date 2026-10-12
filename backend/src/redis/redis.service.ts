import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { appConfig } from '../config/app.config';
import { logger } from '../common/logger';

export const KEY_PREFIX = 'buddy:';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  client: Redis | null = null;
  private connected = false;

  constructor() {
    const cfg = appConfig();
    if (cfg.redisEnabled && cfg.redisUrl) {
      try {
        this.client = new Redis(cfg.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
          retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 4000)),
        });
      } catch (e) {
        logger.warn({ err: String(e) }, 'redis init failed; running degraded');
      }
    }
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.client.connect();
      this.connected = true;
      logger.info('redis connected');
    } catch (e) {
      logger.warn({ err: String(e) }, 'redis unreachable; running degraded (no presence/queue)');
      this.connected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  get ready(): boolean {
    return this.connected && this.client !== null;
  }

  async exec(script?: string, ...args: (string | number)[]): Promise<unknown> {
    if (!this.ready || !this.client) return null;
    try {
      if (script) return await this.client.eval(script, (args as string[]).length, ...args);
      return null;
    } catch (e) {
      logger.warn({ err: String(e) }, 'redis exec failed');
      return null;
    }
  }

  // Queues: a sorted set per mode so we can compute wait rank and cleanup atomically.
  queueKey(mode: string): string {
    return `${KEY_PREFIX}queue:${mode}`;
  }

  // member value = userId, score = enqueue epoch ms
  async enqueue(mode: string, userId: string, score = Date.now()) {
    if (!this.ready || !this.client) return false;
    await this.client.zadd(this.queueKey(mode), score, userId);
    return true;
  }

  async dequeue(mode: string, userId: string): Promise<boolean> {
    if (!this.ready || !this.client) return false;
    const n = await this.client.zrem(this.queueKey(mode), userId);
    return n > 0;
  }

  async queueSize(mode: string): Promise<number> {
    if (!this.ready || !this.client) return 0;
    return this.client.zcard(this.queueKey(mode));
  }

  async queueRangeFrom(mode: string, count: number): Promise<{ member: string; score: number }[]> {
    if (!this.ready || !this.client) return [];
    // WITHSCORES: returns [member, score, member, score, ...]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientAny = this.client as any;
    const arr: string[] = await clientAny.zrangebyscore(
      this.queueKey(mode),
      '-inf',
      '+inf',
      'LIMIT',
      0,
      count,
      'WITHSCORES',
    );
    const out: { member: string; score: number }[] = [];
    for (let i = 0; i < arr.length; i += 2) {
      out.push({ member: arr[i], score: Number(arr[i + 1]) });
    }
    return out;
  }

  async queueWaitMs(member: string, mode: string): Promise<number | null> {
    if (!this.ready || !this.client) return null;
    const s = await this.client.zscore(this.queueKey(mode), member);
    return s ? Date.now() - Number(s) : null;
  }

  // Presence: a sorted set scored by last heartbeat epoch ms. "Online" = heartbeat
  // within the TTL window; stale members are pruned lazily on read (self-cleaning,
  // so no background reaper is needed and counts stay accurate across restarts).
  static readonly PRESENCE_TTL_MS = 45_000;
  private static readonly PRESENCE_KEY = `${KEY_PREFIX}presence`;

  async heartbeat(userId: string, ttlSec?: number): Promise<void> {
    if (!this.ready || !this.client) return;
    const ttlMs = (ttlSec ?? RedisService.PRESENCE_TTL_MS / 1000) * 1000;
    const now = Date.now();
    await this.client.zadd(RedisService.PRESENCE_KEY, now, userId);
    // Opportunistic prune keeps the set small without a reaper loop.
    await this.client.zremrangebyscore(RedisService.PRESENCE_KEY, 0, now - ttlMs);
  }

  /** Remove presence immediately (socket disconnect) instead of waiting for TTL. */
  async dropPresence(userId: string): Promise<void> {
    if (!this.ready || !this.client) return;
    await this.client.zrem(RedisService.PRESENCE_KEY, userId);
  }

  async isOnline(userId: string): Promise<boolean> {
    if (!this.ready || !this.client) return false;
    const s = await this.client.zscore(RedisService.PRESENCE_KEY, userId);
    return s !== null && Date.now() - Number(s) < RedisService.PRESENCE_TTL_MS;
  }

  /** Presence for many users at once (friends list). Returns only online ids. */
  async onlineSet(userIds: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (!this.ready || !this.client || userIds.length === 0) return out;
    const pipe = this.client.pipeline();
    for (const id of userIds) pipe.zscore(RedisService.PRESENCE_KEY, id);
    const replies = (await pipe.exec()) ?? [];
    const now = Date.now();
    replies.forEach(([err, val], i) => {
      if (!err && val !== null && now - Number(val) < RedisService.PRESENCE_TTL_MS) {
        out.add(userIds[i]);
      }
    });
    return out;
  }

  async onlineCount(): Promise<number> {
    if (!this.ready || !this.client) return 0;
    const cutoff = Date.now() - RedisService.PRESENCE_TTL_MS;
    return this.client.zcount(RedisService.PRESENCE_KEY, `(${cutoff}`, '+inf');
  }
}
