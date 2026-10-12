# Buddy — Development Worklog

A safe random-video-chat social platform. Monorepo: `backend/` (NestJS + Prisma), `frontend/` (Angular + Tailwind), `shared/` (contracts package). SQLite for dev, PostgreSQL for prod, Redis for presence/queues/matchmaking.

> Keep this file updated as work progresses. Newest items at the bottom of each section.

## Status: backend MVP verified (smoke 16/16 PASS, resume probe 5/5, presence probe green); full Angular UI built & live-verified — mobile-first, animated, production build green; Docker stack + Postgres migrations landed

---

## ✅ Done

### Shared contracts package (`shared/`)
- ESM package `@bundle/shared` compiled to `dist/`.
- Enums: AccountStatus, AccountRole, AgeAssuranceLevel, Gender, SeekingPreference, MatchMode/Status/Type, ConnectionQuality, ReportReason/Severity/Status, ModerationCaseStatus/ActionType, AppealStatus, SubscriptionStatus, PaymentProviderKind, PaymentTransactionStatus/Kind, CreditLedgerReason, NotificationKind, FriendRequestStatus, OnlineVisibility.
- Zod schemas + DTOs: register (18+ gate), login, refresh, profile update, preferences update, queue join, RTC offer/answer/ICE/state, chat send, friend request, report, block, appeal, checkout, admin user/case/policy updates.
- Typed Socket.IO maps: `ClientToServerEvents`, `ServerToClientEvents`.
- Constants: rate limits, premium feature matrix, MIN_AGE.
- Builds clean: `npx tsc -p shared/tsconfig.json` → 0 errors.

### Backend (NestJS, `backend/`)
- App wiring: `AppModule` with ConfigModule (env), ThrottlerModule (default 120/min, auth 10/min), ScheduleModule, global ZodValidationPipe, ThrottlerGuard, helmet + cookieParser middleware, CORS allowlist.
- Config: `backend/src/config/app.config.ts` — safe int parsing (PORT bug fixed where `Number('')===0` bound port 0), JWT TTLs, ICE/TURN, Redis toggle, age-assurance/moderation/payments provider config, matching policy defaults.
- Structured logging: pino with redaction of authorization/cookie/password/token paths.
- Prisma schema (SQLite dev via `DATABASE_URL="file:./dev.db"`; PostgreSQL prod-ready):
  User, UserProfile, UserPreference, AgeVerification, UserSession, Match, MatchParticipant, ChatMessage, FriendRequest, Friendship, Follow, Block, UserReport, ModerationCase, ModerationAction, Appeal, DeviceFingerprint, SecurityEvent, Subscription, PaymentTransaction, CreditLedger, FeatureFlag, MatchingPolicyVersion, AdminAuditLog, Notification, RtcStat.
  Indexes, uniques (username/email, match participant pair, idempotency keys), cascade deletes.
- Auth module: argon2id password hashing; register with strict 18+ check (rejected underage → verified in smoke); login by username or email; short-lived JWT access tokens; opaque refresh tokens (sha256-hashed in DB) with rotation + family revocation on reuse detection (verified); logout; `/auth/me`; `/auth/oauth-providers` reports configured providers only.
- Users module: `/users/me` (GET with profile+preferences), `DELETE /users/me` soft-delete (PII purge, session revocation, anonymization).
- Profiles module: `/profiles/me` GET, profile/preferences POST with zod validation; interests arrays; inclusive gender model; `onlineVisibility` privacy control.
- Health: `/health/live`, `/health/ready` (db check + dependency statuses).
- Redis service: presence heartbeats with TTL, per-mode sorted-set queues, generic eval helper, graceful degraded mode.
- Matchmaking engine:
  - `policy.ts` — mutual-preference compatibility (seeking MEN/WOMEN/EVERYONE vs declared gender), unknown-gender handling. User preferences are never overridden; `maleQueueAllocationTarget` is a queue-allocation parameter only (documented).
  - `reservation.ts` — Lua atomic reservation (`buddy:mgm:pre:{mode}` set + `buddy:mgm:res:{mode}` hash, TTL 90s) preventing duplicate reservations of same user; release script on match end.
  - `matchmaking.service.ts` — joinQueue (eligibility checks, duplicate-in-match prevention), tryPair (fairness by enqueue time, 24h recent-match avoidance, mutual-compatibility filter, atomic reservation then dequeue), materializeMatch (durable Match + participants with policy version), endMatch (participant-authorized, releases reservation).
- Realtime gateway (Socket.IO):
  - JWT auth at handshake; unauthenticated sockets disconnected (verified).
  - queue:join (with short retry loop to absorb peer publish latency), queue:leave, match:found fan-out with peer summary + ICE servers, queue:waiting heartbeats.
  - WebRTC signaling: rtc:offer/answer/ice/state relayed only to the matched peer after server-side `activeMatchId` membership assertion; spoofed match ids rejected (verified "not in match").
  - chat:message with 12 msg/10s rate limit, server-side persistence, AI-moderation hook (fail-open + warning), moderation:warning event on block.
  - chat:typing relay; rtc:state → rtc:peer_state + RtcStat telemetry row.
  - match:skip / match:end with participant check, match:skipped / match:ended / match:peer_left notifications.
  - match:report (creates UserReport + ModerationCase) and match:block with authorization.
  - Disconnect handling: peer_left event, endMatch, queue cleanup in both modes.
- Chat service: persistMessage, messagesForMatch, persistRtcStat.
- Reports service: fileReport (participant authorization, self-report block), blockUser/unblockUser/listBlocked, isBlockedBetween.
- Moderation service: createCase (USER_REPORT | AI_TEXT | AI_VIDEO | QUEUE_PATTERN sources), checkText with optional OpenAI omni-moderation provider (fail-open + case creation on soft flags), applyAction (WARN/RESTRICT_MATCHING/SUSPEND/BAN/DISMISS_CASE) with account status updates, updateCaseStatus for admins.
- Subscriptions: plan catalog (premium_monthly $5.99, premium_yearly $49.99), entitlements service with server-side feature matrix (FREE vs PREMIUM gating verified), credit-ledger with idempotency keys and consistent running balance, cancel flow, refund record.
- Payments: provider abstraction (DISABLED → documented dev-activate path that refuses outside development; STRIPE → real checkout session + constructEvent signature verification + idempotent webhook processing via transaction idempotency key).
- Admin module: RBAC permission table (ADMIN/MODERATOR/SUPPORT) enforced server-side (user blocked from admin verified 403), users list/update status (with session revocation on ban/suspend), metrics (users/queue/matches/reports/revenue), audit log, feature flags CRUD, matching policy versioning (creates new version records with audit), cases list/update, appeals list/decide.
- Friendships: requests (block-aware), respond/accept (canonical friendship row), list friends/pending, unfollow/follow, notification rows created.
- Notifications: list + mark-read endpoints.
- Age assurance: provider abstraction (`AGE_ASSURANCE_PROVIDER`+endpoint+key), AgeVerification records with provider/checkRef/riskScore, flagForReview → UNDERAGE_SUSPECTED + HIGH severity case.
- Analytics: `/analytics/queue` (video/text queue sizes, online count), `/analytics/me` private stats.
- Sessions: heartbeat endpoint, active device count.
- Prisma seed: feature flags, matching policy v1, dev admin (`admin` / `authkey:dev-admin-1234567890`, dev-only).
- **Verified end-to-end smoke** ([scripts/smoke-test.mjs], 18 PASS / 0 FAIL):
  underage register rejected, register×2, refresh rotation, refresh reuse revoked,
  unauthorized blocked (401), user blocked from admin (403), socket rejects unauthenticated,
  two sockets connect, queue join×2, match found both peers (shared matchId, caller/callee roles),
  chat delivered both ways, spoofed chat/rtc rejected, rtc offer relayed to peer,
  report filed (→ moderation case), block stored, skip notifies peer, entitlements FREE tier.

### Infra / environment
- `.env.example` covering db/redis/turn/age-assurance/moderation/payments/oauth/policy/observability.
- `backend/.env` local dev (SQLite + Redis at 127.0.0.1:6379 — note: WSL relay hijacks [::1]:6379 on this host, so 127.0.0.1 is required).
- Docker: `buddy-redis` container (redis:7-alpine) running for local dev.
- API boots clean: `node dist/src/main.js` on port 3001.

### Bug fixes landed during verification
- `zrangebyscore` pairwise decode was wrong (returns members-only without WITHSCORES) → now WITHSCORES decode; fixed pair matching.
- socket.io 4.8 `Namespace.sockets` is a Map → fixed `match:found` fan-out crash.
- `activeMatchId` assertion on all signaling/chat handlers → spoofing rejected.
- PORT env empty-string → port 0 bug (safe int parsing).
- Correct arg order for NestJS `@SubscribeMessage` handlers (payload first, ack last; return value is the ack).
- Circular module dependency (Subscriptions ↔ Payments) broken via one-way import + config-based `configured` check.
- Various type errors; shared package ESM `.js` extensions.

### Hardening & fixes (second pass)
- **Presence rework** ([backend/src/redis/redis.service.ts](backend/src/redis/redis.service.ts)): old `onlineCount()` counted a `presence_set` nobody wrote → always 0. Now a single sorted set scored by last-heartbeat epoch ms; `onlineCount` = `zcount` past cutoff, stale members pruned lazily; `onlineSet(userIds)` batch pipeline for friends; `dropPresence` on last-socket disconnect (multi-tab aware) so "online" is instant, not TTL-lagged.
- Gateway refreshes presence every 15s for all connected sockets (idle tabs stay online).
- [friendships.service.ts](backend/src/friendships/friendships.service.ts) `listFriends` returns real `isOnline` (was hardcoded `false`).
- tryPair verbose debug logs removed.
- **Reconnect grace (mobile networks blip)**: disconnect mid-match no longer instantly kills the match. Server emits `match:peer_reconnecting`, holds a 20s grace timer, and a new `match:resume` socket event re-attaches the reconnected socket to the still-ACTIVE match (participant-verified); timer is cleared on skip/end/resume and on module destroy. Shared contracts gained `match:resume`, `match:peer_reconnecting`, `match:peer_reconnected`.
- Frontend: new `reconnecting` phase — call UI stays up with a banner, socket.io auto-reconnect triggers `match:resume`, watchdog falls back to peer-left after 20s if never reconnected; `peerReconnecting` signal shows "their connection dropped" banner; text page gets the same treatment; home dashboard polls online count every 20s.
- Video PiP self-view now uses public `rt.localStreamView` getter (was private-access hack).
- NestJS ack bug found via probe: `match:resume` returned `cb?.(...)` (undefined) instead of the plain object → ack never sent; fixed to return value-acks like every other handler.

### Verification probes (scripts/)
- `pair-probe.mjs` — two sockets queue join → same matchId both peers.
- `resume-probe.mjs` — A+B match → A drops → B sees peer_reconnecting → A new socket `match:resume` → ack ok, B sees peer_reconnected → chat works after resume. **5/5 PASS**.
- `presence-probe.mjs` — register, socket connect → `/analytics/queue` online=1; friend request/accept flow → friends list `isOnline:true`; A disconnect → online=0 instantly.

### Docker / deployment (new)
- [backend/Dockerfile](backend/Dockerfile) — multi-stage: workspace `npm ci`, build shared+backend, derive postgres-dialect schema via sed, promote `migrations-postgres` → `migrations`, `prisma migrate deploy` on boot, run API.
- [frontend/Dockerfile](frontend/Dockerfile) — multi-stage Angular prod build → nginx:1.25-alpine serve.
- [infra/docker/nginx.conf](infra/docker/nginx.conf) — SPA with hard/immutable caching, `/api/` → `api:3001/` prefix-stripped proxy, `/socket.io/` WebSocket upgrade proxy (verified `nginx -t` OK in container).
- [infra/docker/docker-compose.yml](infra/docker/docker-compose.yml) — postgres:15 + redis:7 (healthchecks) + api + web(8080); env passthrough incl. TURN/Stripe/OpenAI placeholders; config validates (`docker compose config --quiet`).
- **Postgres migrations**: `backend/prisma/migrations-postgres/0001_init/migration.sql` (593 lines, generated via `prisma migrate diff --from-empty`) **applied cleanly against a real postgres:15-alpine** (psql exit 0, all tables created).
- `.dockerignore` excludes node_modules/dist/dev.db/.env from build context.
- **Limitation**: base `node:20-alpine` image is not cached on this host and the Docker registry is unreachable (DNS fail), so the two image *builds* could not be run here — Dockerfiles follow the same validated steps used locally (npm ci + tsc + prisma generate + ng build all pass outside Docker), but first `docker compose up --build` should be run on a network-connected machine.

---

## ✅ Done (frontend, `frontend/`)

### Scaffold & design system
- Angular 19 standalone components + Tailwind CSS v4 (`@tailwindcss/postcss`), `@bundle/shared` wired via `file:../shared`.
- Original "Buddy" brand in `styles.scss`: deep-space ink palette, indigo/violet brand ramp, mint/coral/amber accents, Sora+Inter typography, glassmorphism `glass-card`, `btn-primary/secondary/danger`, inputs, chips, skeletons.
- Keyframe animations: fade-up staggered entrances, pop-in, pulse-ring (searching state), aurora floating background blobs, float, slide-in-right, bubble-in (chat bubbles); full `prefers-reduced-motion` support; safe-area insets (`pt-safe/pb-safe`) for notched phones; custom scrollbars.
- Shared UI: `AvatarComponent` (conic-gradient hue-based), `ToastsComponent` (success/error/info), `SkeletonPageComponent`.

### Core services
- `AuthService`: signal-based session store, persistent access/refresh tokens, single-flight 401 refresh, logout/clear.
- `authInterceptor`: bearer attach + transparent refresh-and-retry; skips auth endpoints.
- `RealtimeService`: typed socket.io-client wrapper — JWT handshake, queue join/leave, match:found, WebRTC peer connection (offer/answer/ICE with pending-ICE queue, connection-state + quality signaling), chat send/typing, skip/end, report/block, mic/cam toggles, camera flip via replaceTrack, local media permission handling with error-name-specific messages (NotAllowedError, NotFoundError…).
- `ApiService`: typed REST client (me, profile, prefs, friends, blocks, entitlements, plans, checkout, analytics, notifications, deleteMe).
- `ToastService` + `guards.ts` (authGuard) + `proxy.conf.json` (dev `/api` + `/socket.io` → :3001 with path rewrite).

### Pages (all mobile-first, 390px-optimized, animated)
- **Landing**: hero orb with pulse rings, staggered headline, dual CTAs (start video/text), trust row, 3 feature cards, safety footer; responsive to desktop.
- **Login**: validation, busy spinner, error alert, animated entrance.
- **Register**: 18+ birth-date gate with live age check + `max` attr, password strength bars (4 rules live), gender picker (inclusive), terms checkbox, server error passthrough; notifies underage rejection.
- **Home dashboard**: greeting header with avatar + online count (real `/analytics/queue`), Go Premium chip, hero start-video/text CTAs, matching prefs & safety cards, weekly stats from real backend (0 matches / 0 messages for new users, skeleton-ready).
- **Video page**: camera-permission onboarding with accurate error states; searching stage (pulsing rings + wait timers); in-call stage with remote fullscreen video, PiP self-view, peer info + verified badge, connected/connecting/reconnecting indicator, mic/cam toggles, flip camera, skip (big red Next), report, end; bottom quick-chat composer overlay; peer-left/hiccup recovery screens with next/back actions.
- **Text chat**: header with peer avatar + typing indicator + report/skip; pending-match waiting screen; message list with sender-aligned bubble-in animations, emoji-style messages rendered large; typing triple-dot indicator; quick-emoji strips; composer with send; peer-left/error recovery.
- **Profile**: display name, bio w/ counter, interest tag chips add/remove, avatar hue picker, verified badge, member-since, live save.
- **Settings**: matching prefs (everyone/women/men) w/ change notice, premium-gated language/country/verified filters, online-visibility (everyone/friends/nobody), message retention toggle, notification prefs, blocked users list w/ unblock, sign-out, account deletion.
- **Friends**: add by username, pending requests accept/decline, friend list with online dots, remove.
- **Premium**: free-vs-premium comparison, plan cards (monthly/yearly) w/ real prices from `/subscriptions/plans`, checkout (dev-mode auto-activate path labeled clearly when billing unconfigured), cancel flow; active state view.
- **Safety center**: control tools (skip/block/report), community rules, report pipeline explainer (AI assists but does not replace humans), privacy promises, emergency guidance.
- **Admin**: metrics tiles (users/matches/reports/enforcement), user search w/ suspend/ban/restore, moderation cases w/ warn/suspend/ban/dismiss, audit log; role-gated UI (USER sees lock screen).
- **Mobile bottom nav** (Home/Friends/Settings/Profile) shown only when authed.

### Build & verification
- `ng build --configuration production`: **pass** — 93.9 kB initial gzip.
- `npx tsc --noEmit` (shared + backend): **pass**.
- Backend full smoke: **19/19 PASS** re-verified after UI work.
- **Live browser verification (390×844 mobile viewport)**:
  - Landing renders with orb, CTAs, features; orb 404 fixed (public/ assets served at root).
  - Register form: validation caught short password with inline error, then real registration through the Angular UI → 201, auto-login, redirect to /home, bottom nav appears.
  - Home shows real backend data ("You are online · 0 people around", stats loaded from API); interpolation bug ('You' apostrophe breaking template) fixed.
  - /video renders "Your camera is ready" (getUserMedia granted) with Find-someone CTA.
  - /text joins the real TEXT queue and shows the waiting state.
  - /api proxy verified: GET /api/health/live → ok, POST /api/auth/register → 201 through :4000.
- Screenshots: landing, register form (strength bars, gender picker, 18+ notice), home dashboard with live data.+


---

## ✅ Done (competitive pass — feature parity + design system)

### Competitor comparison (top 3)
Benchmarked against **Monkey**, **Emerald Chat**, and **Chatroulette** (the leading random-video-chat apps):

| Capability | Monkey | Emerald Chat | Chatroulette | **Buddy** |
|---|---|---|---|---|
| Random video/text pairing | ✅ | ✅ | ✅ | ✅ |
| Interest-based matching | ❌ | ✅ | ❌ | ✅ (new) |
| Post-match karma/rating | ❌ | ✅ | ❌ | ✅ (new) |
| Light + dark + auto theme | ✅ | ✅ | ✅ | ✅ (new) |
| Safety/moderation focus | ⚠️ | ✅ | ⚠️ | ✅ (strongest) |
| Age assurance (18+) | ✅ | ✅ | ❌ | ✅ |
| Reconnect grace / resume | ❌ | ❌ | ❌ | ✅ (unique) |
| Admin RBAC + audit + policy versioning | ❌ | ❌ | ❌ | ✅ (unique) |
| Premium feature matrix + payments | ✅ | ✅ | ✅ | ✅ |
| Friends / social graph | ❌ | ✅ | ❌ | ✅ |

Buddy was already ahead on trust & safety (age assurance, moderation pipeline, RBAC admin, reconnect grace, credit ledger). This pass closed the three visible feature gaps competitors had and lifted the design system to match their polish.

### Theme system (design)
- New `ThemeService` ([frontend/src/app/core/theme.service.ts](frontend/src/app/core/theme.service.ts)): `dark | light | auto`, persisted to localStorage, `data-theme` on `<html>`, `auto` follows `prefers-color-scheme`.
- `styles.scss`: semantic `--color-ink-50` token (primary text & frosted fills) flips with the theme; `html[data-theme='light']` block overrides ink/brand/mint/amber/red/fuchsia ramps for AA contrast on white. All `white/*` utility usages across 15 templates converted to `ink-50/*` so text/borders/fills invert automatically.
- Toggle UI: 3-way Appearance segmented control in Settings + quick sun/moon chip in Home header.
- Verified in built CSS: `html[data-theme=light]{--color-ink-950:#f4f3fa;…}` emitted.

### Interest-based matching
- `tryPair` ([backend/src/matchmaking/matchmaking.service.ts](backend/src/matchmaking/matchmaking.service.ts)) now scores candidate partners by shared interest tags (`sharedInterests()`), preferring the partner with the most overlap for the longest-waiting user, while preserving wait-time fairness and never starving (falls back to time-only pairing).
- `match:found` payload gained `sharedInterests: string[]` (shared contracts), surfaced as "❤ topic" chips in both the video call overlay and the text-chat matched screen.
- Fixed a latent bug: `MatchmakingWorker` background pairing reserved+dequeued users but never materialized/notified the match (stranding them). Now routes through `matchmaking.onBackgroundPair` → gateway `notifyMatchFound`, so background-paired users get their `match:found`.

### Match ratings / karma (Emerald-parity)
- New `MatchRating` model (schema + `0002_match_ratings` Postgres migration + `db push` for SQLite).
- New `RatingsModule` ([backend/src/ratings](backend/src/ratings/ratings.module.ts)): `POST /ratings` (participant-only, self-rating refused, idempotent upsert per match+rater), `GET /ratings/match/:id`, `GET /ratings/karma/me`, `GET /ratings/karma/:userId`. `KarmaDto` = avg score + positive/neutral/negative split.
- Reusable `RatingSheetComponent` ([frontend/src/app/shared/ui.ts](frontend/src/app/shared/ui.ts)): 1–5 star bottom-sheet shown when a peer leaves (video & text), with quick labels and animated stars.
- Profile shows a karma badge (⭐ avg · N ratings), fetched via `myKarma()`.

### Verification (this pass)
- `npm run build:shared` ✅, backend `tsc --noEmit` ✅, `ng build` ✅ (production), backend `npm run build` ✅ (frontend has no separate typecheck script; `ng build` type-checks it).
- End-to-end smoke **19/19 PASS** (interest-aware matching did not regress core flows).
- New **ratings probe 8/8 PASS** ([scripts/ratings-probe.mjs](scripts/ratings-probe.mjs)): empty karma, rate, karma aggregation, idempotent re-rate, myRating, invalid-score rejection.
- Built CSS confirmed to contain light-theme override block + semantic tokens.
- **Live browser verification (agent-browser + Chrome)**: dark hero renders polished; set `localStorage.buddy:theme=light` → reload → `data-theme=light`, `--color-ink-950` flips `#07060f → #f4f3fa`, `--color-ink-50` flips to `#16122e`, and the light landing renders as a high-contrast pastel UI (verified via screenshots).
- **Bug found & fixed during live check**: theme was only applied by `ThemeService`'s effect when a route injected the service, so the landing page ignored a stored light preference (`data-theme=null`). Fixed with (a) an inline pre-paint script in `index.html` that sets `data-theme`/`color-scheme`/`theme-color` from `localStorage` before first paint (no flash), and (b) `inject(ThemeService)` in `AppComponent` so the service always initializes. Now every route respects the theme.

---

## ⏳ Pending

- Run `docker compose -f infra/docker/docker-compose.yml up -d --build` on a network-connected machine (registry unreachable here — image builds unverified; nginx config + migration + compose config all verified).
- CI pipeline; OpenAPI generation; docs/{architecture,api,security,deployment,age-assurance,turn}.md completion.
- Unit/integration test suites (matching, reservation idempotency, entitlements, webhook verification, RBAC) — smoke + 3 probes cover flows but formal tests pending.
- E2E video path with two real browsers + TURN server config (coturn) for NAT'd deployments.
- OAuth provider flows (Google/GitHub) backend handlers when credentials exist.
- Load testing (k6) for matchmaking concurrency.

### Frontend debug aids left in
- Console noise in dev (AdminPage notifications) — none found during live checks.

### Known UI limitations
- Screenshot compositor intermittently returns no frames on the second browser tab; DOM-level checks confirm all pages render correctly.
- Admin date pipe shows server-local times; fine for MVP dashboard.
