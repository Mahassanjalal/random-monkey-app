const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');

const RESERVE_LUA = `
local pre = KEYS[1]
local res = KEYS[2]
local matchId = ARGV[1]
if redis.call('SISMEMBER', pre, ARGV[2]) == 1 then return 0 end
if redis.call('SISMEMBER', pre, ARGV[3]) == 1 then return 0 end
redis.call('SADD', pre, ARGV[2], ARGV[3])
redis.call('HSET', res, ARGV[2], matchId)
redis.call('HSET', res, ARGV[3], matchId)
redis.call('EXPIRE', res, ARGV[4])
return 1
`;

(async () => {
  await r.zadd('buddy:queue:TEXT', Date.now(), 'ua');
  await r.zadd('buddy:queue:TEXT', Date.now(), 'ub');
  console.log('queue before:', await r.zrange('buddy:queue:TEXT', 0, -1));
  const n = await r.eval(RESERVE_LUA, 2, 'buddy:mgm:pre:TEXT', 'buddy:mgm:res:TEXT', 'match-x', 'ua', 'ub', 90);
  console.log('reserve result:', n);
  console.log('pre:', await r.smembers('buddy:mgm:pre:TEXT'));
  console.log('res:', await r.hgetall('buddy:mgm:res:TEXT'));
  console.log('queue after:', await r.zrange('buddy:queue:TEXT', 0, -1));
  r.disconnect();
})();
