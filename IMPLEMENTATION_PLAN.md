# IMPLEMENTATION_PLAN.md

Active deviations from design intent and security follow-ups. Long-term design: `docs/`. Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## Accepted temporary deviations

### Member upload + gallery write deviations

1. **Tier 1 gating not enforced on member upload + gallery writes.** `POST /members/:memberKey/galleries{,/...}` and `POST /members/:memberKey/media/upload` admit any authenticated member; USER_STORIES M_Upload_Photo / M_Submit_Video / M_Organize_Media_Galleries reserve these for Tier 1. Unblock: platform-wide tier enforcement + tier gate on these routes.

### Adapter parity deviations

1. **SecretsAdapter not yet implemented (DD §3.6).** No consumer in current code; `SESSION_SECRET` is host-env, JWT/ballot keys are KMS. Unblock: first Parameter-Store-bound secret needed (Stripe / admin bootstrap).

### System health deviations

1. **Readiness probe limited to SQLite + memory pressure.** SERVICE_CATALOG.md `OperationsPlatformService.checkReadiness()` composes the readiness signal for `/health/ready`. Current implementation probes SQLite and container memory pressure only; KMS, SES, and S3 backup health are not included. Unblock: when a downstream system's failure mode requires inclusion in readiness.

### Legacy claim deviations

1. **`/history/claim` runs the direct-lookup shortcut.** VIEW_CATALOG.md route-rules block specifies a two-step token flow (lookup form, emailed token, confirm-and-merge handler). Current implementation is the early-test shortcut: direct lookup + confirm + merge in-session, no emailed token. Unblock: production-readiness work; cutover prerequisite per MP Phase 4.

### URL validation deviations

1. **External-URL validator: redirect-follow + reachability cache + safe-link helper deferred (DD §3.17).** Current `src/lib/externalUrlValidator.ts` covers scheme allowlist, SSRF block, Safe Browsing. Unblock: first public surface accepting user URLs at scale, or first template needing external-href helper.
