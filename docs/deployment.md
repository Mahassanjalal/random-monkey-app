# Deployment & 1M-user scale

## Compose (single host)

`docker compose -f infra/docker/docker-compose.yml up -d --build` → web :8080, api :3001, postgres, redis. `api` waits for healthy db/redis; `web` waits for healthy api. Set `JWT_SECRET`, `STRIPE_*`, `TURN_*`, `CORS_ORIGINS` from `.env.example`.

## Scaling past one API replica

Blockers: `RealtimeService` match/user socket maps + rate buckets + resume timers are in-process.

1. Add `@socket.io/redis-adapter` and sticky sessions at the LB (ALB target stickiness / NGINX `ip_hash`).
2. Move grace timers + rate buckets to Redis; run a single elected `MatchmakingWorker` (or shard by mode/region).
3. Postgres: managed PG + PgBouncer + read replica + PITR; Redis: managed with persistence/Cluster.
4. TURN: `coturn` cluster per region; frontend uses server-provided `iceServers`.
5. CDN for frontend assets; HPA on CPU + queue depth + WS conns; `/health/ready` 503 drives restarts.
6. Load test with `scripts/k6-matchmaking.js` before raising replicas.
