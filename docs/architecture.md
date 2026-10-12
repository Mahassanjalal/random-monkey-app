# Architecture

Monorepo: `shared/` (zod contracts + socket maps), `backend/` (NestJS + Prisma + Socket.IO + Redis), `frontend/` (Angular standalone + Tailwind).

- Auth: argon2id, short JWT access (issuer `buddy-api`), opaque rotated refresh with family revocation.
- Matchmaking: Redis ZSET queues per mode + Lua atomic reservation (`pre` set + `res` hash, both TTL'd) + background `MatchmakingWorker` tick. `tryPair` enforces mutual gender prefs, 24h no-repeat, block exclusion.
- Realtime: Socket.IO gateway, per-match sockets in-process (single-instance; Redis adapter + sticky LB required for >1 replica — see `docs/deployment.md`).
- Data: SQLite dev, Postgres prod (`migrations-postgres/`), Redis presence/queues.
- Observability: pino logs, `/health/live` (200), `/health/ready` (200/503), `/health/metrics` (Prometheus text).
