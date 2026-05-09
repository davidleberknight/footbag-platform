# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted temporary dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`. The go-live migration detail is here: `docs/MIGRATION_PLAN.md`; anything narrower than these docs is implicit future work and is not enumerated here. See also `legacy_data/IMPLEMENTATION_PLAN.md` for data preparation / James' sprint planning. For all of these files, do not read unless necessary for current work.

## Accepted temporary deviations

### Member upload + gallery write deviations

1. **Tier 1 gating not enforced on member upload + gallery writes.** `POST /members/:memberKey/galleries{,/...}` and `POST /members/:memberKey/media/upload` admit any authenticated member; USER_STORIES M_Upload_Photo / M_Submit_Video / M_Organize_Media_Galleries reserve these for Tier 1. Unblock: platform-wide tier enforcement + tier gate on these routes.

### Adapter parity deviations

1. **SecretsAdapter not yet implemented.** DD §3.6 specifies `SecretsAdapter` (SSM GetParameter in production, local JSON file in development) for Stripe keys, Stripe webhook secrets, admin bootstrap tokens, and other exportable credentials. No such consumer exists in the current code: `SESSION_SECRET` lives in the host env file per DD (not in scope for `SecretsAdapter`); JWT signing and ballot encryption are KMS-backed via their own adapters. Unblock: first time a Parameter-Store-bound secret is needed (likely Stripe integration or the admin bootstrap path).

### System health deviations

1. **Readiness probe limited to SQLite + memory pressure.** SERVICE_CATALOG.md `OperationsPlatformService.checkReadiness()` composes the readiness signal for `/health/ready`. Current implementation probes SQLite and container memory pressure only; KMS, SES, and S3 backup health are not included. Unblock: when a downstream system's failure mode requires inclusion in readiness.

### Legacy claim deviations

1. **`/history/claim` runs the direct-lookup shortcut.** VIEW_CATALOG.md route-rules block specifies a two-step token flow (lookup form, emailed token, confirm-and-merge handler). Current implementation is the early-test shortcut: direct lookup + confirm + merge in-session, no emailed token. Unblock: production-readiness work; cutover prerequisite per MP Phase 4.

### URL validation deviations

1. **Slim external-URL validator only; full DD §3.17 pipeline deferred.** `src/lib/externalUrlValidator.ts` implements scheme allowlist (http/https), length cap (2048), and `URL` parse. DD §3.17 also mandates: private-IP/SSRF block, redirect-follow re-resolution at each hop, Safe Browsing dataset lookup, optional reachability HEAD with 24-hour cache. None implemented yet. Unblock: when the first user-facing surface needs SSRF/Safe Browsing protection (likely member profile URLs or gallery URLs going public). Build the full pipeline behind the existing `validateExternalUrl` signature so existing callers don't change.

