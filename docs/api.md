# API surface

REST under `/api` (see `shared/src/api-contracts.ts` for zod schemas):

- `POST /auth/register|login|refresh|logout`, `GET /auth/me|oauth-providers`
- `GET /users/me`, `DELETE /users/me`, `GET|POST /profiles/me`, `POST /profiles/preferences`
- `GET /sessions/heartbeat|active`
- `GET /friends`, `/friends/requests`, `/friends/following`
- `GET /subscriptions/entitlements|plans|me`, `POST /subscriptions/checkout|me/cancel`
- `POST /payments/checkout|dev-activate`, `POST /payments/webhook` (Stripe, signature-verified)
- `GET /notifications`, `POST /notifications/:id/read`
- `GET /analytics/queue|me`
- `GET /health/live|ready|metrics`
- `GET /admin/*` (RBAC ADMIN/MODERATOR/SUPPORT)

Sockets: `queue:join|leave`, `rtc:offer|answer|ice|state`, `chat:message|typing`, `match:resume|skip|end|report|block`, server `match:found|peer_reconnecting|peer_reconnected|peer_left`, `moderation:warning`.
