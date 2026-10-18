# AGENTS.md

Agent context for **Buddy** — a safe, mobile-first random video & text chat platform.
Read this before changing code; pair it with `WORKLOG.md` (dev log + competitor comparison).

## Project

One-tap random video & text chat with safety built in: 18+ age assurance, skip, block &
report in one tap, AI-assisted text moderation with human review, interest-based matching,
and post-match ratings/karma.

## Stack & layout (npm workspaces monorepo)

| Workspace | Role |
|---|---|
| `shared/` | Zod contracts, typed Socket.IO event maps, enums (`@bundle/shared`) |
| `backend/` | NestJS + Prisma + Socket.IO + Redis (ioredis) |
| `frontend/` | Angular 19 (standalone) + Tailwind CSS v4 + socket.io-client + WebRTC |
| `infra/` | Docker Compose (multi-stage), nginx, Prometheus/alerting |
| `docs/` | architecture, api, security, deployment, age-assurance, turn, scale |
| `scripts/` | smoke test + verification probes (run from repo root) |

## Architecture

- **Auth:** argon2id hashing; short-lived JWT access token (issuer `buddy-api`); opaque
  rotated refresh token with family revocation; httpOnly cookie transport.
- **Matchmaking:** Redis ZSET queues per mode + Lua atomic reservation (`pre` set + `res`
  hash, both TTL'd) + background `MatchmakingWorker` tick. `tryPair` enforces mutual
  gender prefs, 24h no-repeat, block exclusion, and now **scores by shared interests**
  while preserving wait-time fairness (never starves — falls back to time-only pairing).
- **Realtime:** Socket.IO gateway; per-match sockets in-process (single-instance; for >1
  replica use the Redis adapter + sticky LB — see `docs/deployment.md`). `match:found`
  payload carries `sharedInterests: string[]`.
- **Match lifecycle:** 1:1 match namespace, reconnect grace (resume a dropped call),
  leave events.
- **Safety:** block/report, text moderation (AI provider + human review queue),
  age-assurance re-verification, 18+ gate.
- **Social:** friends & social graph (add/accept/decline, presence, mutual friends).
- **Premium:** feature matrix + entitlements, subscriptions, Stripe-ready payments, credit ledger.
- **Ratings/karma:** post-match 1–5 star rating (idempotent per match+rater), karma
  aggregation (avg + positive/neutral/negative split).
- **Theme:** light/dark/auto design system (`ThemeService`); semantic `--color-*` tokens
  flip via `html[data-theme]`; pre-paint inline script in `index.html` applies the stored
  theme before first paint.
- **Admin:** RBAC (admin/moderator/support), user & case management, audit log,
  matching-policy versioning.
- **Data:** SQLite (dev) · Postgres (prod, `migrations-postgres/`) · Redis (presence/queues).
- **Observability:** pino structured logs; `/health/live` (200), `/health/ready` (200/503),
  `/health/metrics` (Prometheus text).

## Commands

```bash
npm install                 # installs workspaces + links @bundle/shared (postinstall)
npm run build:shared        # build shared contracts first (backend/frontend depend on it)
npm run dev:backend         # API + gateway on :3001
npm run dev:frontend        # web on :4000 (proxies /api + socket to :3001)
npm run typecheck           # tsc --noEmit per workspace (--if-present; frontend type-checks via ng build)
npm run test:backend        # jest
npm run build               # shared + backend + frontend (production)
npm run smoke               # end-to-end API + matchmaking smoke test (needs Redis + API on :3001)
node scripts/ratings-probe.mjs   # ratings/karma feature probe
```

Redis must be running for matchmaking/presence (dev: `docker compose -f infra/docker/docker-compose.yml up -d redis`).

## Conventions

- Build `shared/` before typechecking/building the other workspaces.
- Contracts live in `shared/src`; never duplicate a payload shape in backend or frontend.
- Mirror the existing module pattern (module/controller/service) when adding a backend feature
  (e.g. `ratings/` mirrors `reports/`).
- Keep UI text/colors on semantic tokens (`ink-*`, `brand-*`, `mint-*`) so the theme flips
  automatically; reserve literal `white` only for solid gradients.
- Run the relevant probe/smoke after touching realtime or matchmaking.

## Feature status

### ✅ Done

- Auth (register/login, argon2id, JWT access + rotated opaque refresh, cookie transport, session rotation)
- Users & profiles (avatar, display name, bio, age, gender, looking-for, interests, online presence)
- Realtime gateway (namespaced Socket.IO, Zod-validated events, typing indicators)
- Interest-based matchmaking (Redis queues, atomic reservations, mutual prefs, 24h no-repeat,
  block exclusion, shared-interest scoring with wait-time fairness)
- Match lifecycle (1:1 namespace, reconnect grace/resume, leave events)
- Video chat (WebRTC signaling) & text chat (history via chat service)
- Safety (block/report, AI text moderation + human review queue, age-assurance re-verify, 18+ gate)
- Friends & social graph (add/accept/decline, presence, mutual friends)
- Premium (feature matrix, entitlements, subscriptions, Stripe-ready payments, credit ledger)
- Match ratings & karma (1–5 star post-match sheet, idempotent, karma badge on profile)
- Light / dark / auto theme system (semantic tokens, pre-paint theme, 3-way toggle in Settings + quick toggle on Home)
- Admin console (RBAC, user & case management, audit log, matching-policy versioning)
- Notifications, analytics, health/observability endpoints
- Infra: Docker Compose multi-stage builds, nginx reverse proxy, Redis, Postgres migrations, monitoring

### ⏳ Pending (in progress / blocked on environment)

- Run `docker compose -f infra/docker/docker-compose.yml up -d --build` on a network-connected
  machine (image builds unverified here; nginx config + migration + compose config verified).
- Formal unit/integration suites (matching, reservation idempotency, entitlements, webhook
  verification, RBAC) — smoke + probes cover flows but tests pending.
- E2E video path with two real browsers + TURN server (coturn) for NAT'd deployments.
- OAuth provider flows (Google/GitHub) backend handlers when credentials exist.
- OpenAPI generation; finish `docs/{api,deployment,age-assurance,turn}.md`.
- Load testing (k6) for matchmaking concurrency; chaos testing; accessibility audit.
- Wire a real LLM moderation provider, real email/SMS OTP, production secrets & TLS.
- Premium payment provider in test mode (Stripe).

### 🔮 Future roadmap (not started)

- Real-time in-call translation; voice messages; icebreaker prompts
- Group / party chat; reaction stickers & GIFs
- Location-based matching (geo radius); verification badges (photo/ID)
- AI safety scoring (deepfake / minor detection); anti-bot & fraud detection
- Push notifications (FCM/APNs); moderation appeal system
- Internationalization (i18n); optional E2E-encrypted chats
- Match analytics for users; mobile app (React Native)
- Multi-replica scaling: Redis Socket.IO adapter + sticky LB (required beyond one instance)

## Verification

```bash
npm run smoke                      # 19 checks (core + interest-aware matching)
node scripts/ratings-probe.mjs     # 8 checks (ratings/karma)
node scripts/resume-probe.mjs      # reconnect grace
node scripts/presence-probe.mjs    # presence
```
