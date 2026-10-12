import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService, KEY_PREFIX } from '../redis/redis.service';
import type { MatchMode } from '@bundle/shared';

// Atomic match reservation via Redis primitives.
// Keys:
//   buddy:mgmt:<mode>

const RESERVE_LUA = `
-- KEYS[1] = pre-users set: buddy:mgm:pre
-- KEYS[2] = reserved map: buddy:mgm:res
-- ARGV[1] = matchId, ARGV[2] = userA, ARGV[3] = userB, ARGV[4] = ttlSec
local pre = KEYS[1]
local res = KEYS[2]
local matchId = ARGV[1]
if redis.call('SISMEMBER', pre, ARGV[2]) == 1 then return 0 end
if redis.call('SISMEMBER', pre, ARGV[3]) == 1 then return 0 end
redis.call('SADD', pre, ARGV[2], ARGV[3])
redis.call('HSET', res, ARGV[2], matchId)
redis.call('HSET', res, ARGV[3], matchId)
redis.call('EXPIRE', res, ARGV[4])
redis.call('EXPIRE', pre, ARGV[4])
return 1
`;

const RELEASE_LUA = `
-- KEYS[1] = pre set; KEYS[2] = reserved hash
-- ARGV[1] = matchId, ARGV[2] = userA, ARGV[3] = userB
redis.call('SREM', KEYS[1], ARGV[2], ARGV[3])
redis.call('HDEL', KEYS[2], ARGV[2], ARGV[3])
return 1
`;

export interface Reservation {
  matchId: string;
  userA: string;
  userB: string;
  mode: MatchMode;
}

@Injectable()
export class ReservationService {
  constructor(private redis: RedisService) {}

  private preKey(mode: string): string {
    return `${KEY_PREFIX}mgm:pre:${mode}`;
  }
  private resKey(mode: string): string {
    return `${KEY_PREFIX}mgm:res:${mode}`;
  }

  async reserve(
    userA: string,
    userB: string,
    mode: MatchMode,
    ttlSec = 60,
  ): Promise<Reservation | null> {
    if (userA === userB) return null;
    if (!this.redis.ready) return null;
    const matchId = randomUUID();
    const res = (await this.redis.client!.eval(
      RESERVE_LUA,
      2,
      this.preKey(mode),
      this.resKey(mode),
      matchId,
      userA,
      userB,
      ttlSec,
    )) as number;
    if (res !== 1) return null;
    return { matchId, userA, userB, mode };
  }

  async release(userA: string, userB: string, mode: MatchMode): Promise<void> {
    if (!this.redis.ready) return;
    await this.redis.client!.eval(
      RELEASE_LUA,
      2,
      this.preKey(mode),
      this.resKey(mode),
      'x',
      userA,
      userB,
    );
  }

  /** Reaper for crashed/disconnected reservations — prevents permanent exclusion. */
  async forceReleaseStale(userId: string, mode: MatchMode): Promise<void> {
    if (!this.redis.ready || !this.redis.client) return;
    // Best-effort: remove user from pre-set and reserved hash for this mode.
    await this.redis.client.srem(this.preKey(mode), userId).catch(() => 0);
    await this.redis.client.hdel(this.resKey(mode), userId).catch(() => 0);
  }
}
