# random-monkey-app

**Buddy** — a safe, mobile-first random video & text chat platform. Meet someone new in one tap, skip anytime, with safety built in from the ground up (18+ age assurance, block & report, AI-assisted moderation).

## Features

- **Random video & text chat** — WebRTC video and realtime text with one-tap skip.
- **Interest-based matching** — get paired with people who share your interests.
- **Match ratings & karma** — rate a chat afterwards; karma reflects how you treat others.
- **Trust & safety** — 18+ gate, block/report in one tap, AI text moderation with human review.
- **Light / dark / auto theme** — polished, accessible design system.
- **Friends & social graph** — add friends, follow, online presence.
- **Premium** — feature matrix, subscriptions, payments abstraction (Stripe-ready).
- **Admin console** — RBAC (admin/moderator/support), user & case management, audit log, matching-policy versioning.
- **Resilient realtime** — reconnect grace so a network blip doesn't drop the call.

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Angular 19 (standalone) · Tailwind CSS v4 · socket.io-client · WebRTC |
| Backend | NestJS · Prisma · Socket.IO · Redis (presence/queues/matchmaking) |
| Shared | `@bundle/shared` — Zod contracts, typed socket events, enums |
| Data | SQLite (dev) · PostgreSQL (prod) · Redis |
| Infra | Docker Compose, nginx reverse proxy, multi-stage builds |

## Getting started

```bash
# 1. Install workspace dependencies
npm install

# 2. Start Redis (dev)
docker compose -f infra/docker/docker-compose.yml up -d redis

# 3. Configure backend env
cp .env.example backend/.env        # then edit as needed

# 4. Build shared contracts, push the schema, seed
npm run build:shared
npm run --workspace backend prisma:push
npm run --workspace backend prisma:seed

# 5. Run the apps (separate terminals)
npm run dev:backend    # API on :3001
npm run dev:frontend   # web on :4000
```

## Repository structure

```
backend/   NestJS API, Prisma schema, realtime gateway, matchmaking engine
frontend/  Angular app (landing, video, text, profile, settings, admin, ...)
shared/    Shared TypeScript contracts & enums used by both sides
infra/     Docker Compose + nginx config
docs/      Architecture, API, security, deployment notes
scripts/   Smoke test & verification probes
```

## Verification

```bash
npm run smoke            # end-to-end API + matchmaking smoke test
node scripts/ratings-probe.mjs
```

See [WORKLOG.md](./WORKLOG.md) for the full development log and a competitor comparison.
