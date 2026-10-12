# Age assurance

- Register enforces 18+ via birth date (self-declared). Production must set `AGE_ASSURANCE_PROVIDER` + endpoint/key.
- `AgeVerification` rows store provider/checkRef/riskScore; `flagForReview` marks `UNDERAGE_SUSPECTED` + HIGH case.
- Wire `joinQueue` to provider checks before public launch; keep audit trail for appeals.
