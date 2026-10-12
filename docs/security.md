# Security

- 18+ gate enforced server-side at register; age-assurance provider required before public launch (`docs/age-assurance.md`).
- JWT: strong `JWT_SECRET` required (>=32 chars; fatal in production), issuer `buddy-api`, 30s clock tolerance.
- Passwords argon2id; `authKey` is random opaque, dev-only login path (disabled in production).
- Refresh rotation with family revocation on reuse.
- IPs stored as SHA-256 hash only; soft-delete purges PII; chat kept per retention policy.
- Socket signaling asserts `activeMatchId` membership; spoofed matchIds rejected.
- Stripe webhook signature-verified + idempotent via `event.id`.
- Admin RBAC server-side; sessions revoked on ban/suspend.
- Rate limits: HTTP Throttler (120/min, auth 10/min), socket chat 12/10s + signaling 60/2s (bounded in-memory; move to Redis/edge at scale).
