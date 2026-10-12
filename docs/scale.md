# 1M-user playbook

Assumptions: 1M registered, ~5-10% concurrent (50-100k sockets), ~5-10k queued, ~10k P2P matches. P2P media avoids SFU bandwidth; signaling/matchmaking/presence/DB are the bottlenecks.

Targets: p95 API <200ms, match p95 <3s, WS drops <1%.

- Matchmaking: background tick 1s, batch profile loads, block + 24h-repeat exclusion, reservation TTL on both keys + reaper.
- DB: cache `/admin/metrics` 10-30s, `pg_trgm` for username search, cursor pagination for chat, interests normalized (no per-row `JSON.parse` at scale), `CreditLedger` transactional + unique idempotency catch, PgBouncer.
- Redis: managed, Cluster/Sentinel, circuit-breaker metrics, DB fallback documented as degraded.
- Edge: WAF + NGINX `limit_req` + Cloudflare; move throttling to Redis/edge.
- Observe: Prometheus `/health/metrics`, Grafana, Loki, Alertmanager (`infra/monitoring/`); SLOs: queue wait, match success %, WS disconnect rate, p95.
