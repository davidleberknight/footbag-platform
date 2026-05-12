# IMPLEMENTATION_PLAN.md

Active deviations from design intent and security follow-ups. Long-term design: `docs/`. Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a code or infra change is needed to close the gap. Each entry states an unblock condition. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional staging-vs-prod asymmetries are not deviations; they do not belong here or in MP.

## Accepted temporary deviations

### System health deviations

1. **Readiness probe limited to SQLite + memory pressure.** SERVICE_CATALOG.md `OperationsPlatformService.checkReadiness()` composes the readiness signal for `/health/ready`. Current implementation probes SQLite and container memory pressure only; KMS, SES, and S3 backup health are not included. Unblock: when a downstream system's failure mode requires inclusion in readiness.

### Auto-link classifier deviations

2. **Auto-link classifier is email-anchored only.** `getAutoLinkClassificationForMember` resolves the legacy candidate via `legacy_email` against the requesting member's `login_email`. The three-key (legacy_email + legacy_user_id + legacy_member_id) classification described in MIGRATION_PLAN.md §7 depends on the legacy data dump landing. Unblock: legacy data dump.

3. **`name_variants` table unseeded.** Every successful auto-link match is currently `confidence: 'high'` (exact normalized name). The `confidence: 'medium'` branch (name-variant-aware) produces no hits because the name_variants table has no rows yet. Unblock: ~290-pair name_variants seed from legacy data.

