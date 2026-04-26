# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/MIGRATION_PLAN.md`; anything narrower than those docs is implicit future work and is not enumerated here.

## Active slice now

### Parallel tracks

Two developers work in parallel. **AI assistants: read only the track section matching the active developer; other tracks are out-of-scope noise.** Identify the developer from the git user, the prompt, or by asking.

| Dev | Handle | Track | Section |
|---|---|---|---|
| Dave | (primary maintainer) | Tier 2 hardening (backup/restore + `TRUST_PROXY` explicit-set) | "Sprint: Tier 2 hardening" |
| James | JamesLeberknight | Historical pipeline completion (data import / legacy migration) | "James's track" (routing only; detail in `legacy_data/IMPLEMENTATION_PLAN.md`) |

Cross-track changes require explicit human coordination.

### Sprint: Tier 2 hardening

Pre-cutover revert / rotation / scrub checklist lives in `docs/MIGRATION_PLAN.md` §28.8 (permanent gate; 8 items). Do not duplicate here.

**In scope (review tasks first, then build):**

- **Backup/restore workflow** (M). Per MP §28.1. Must land before prod data is at risk.
- **Set `TRUST_PROXY=2` explicitly in `docker/docker-compose.prod.yml`.** Currently relies on `src/config/env.ts` default; correct today but invisible to operators. The integer-hop-count vs subnet-allow-list re-evaluation tracks with MP §28.3 (origin-bypass hardening) separately.

---

## James's track: Historical pipeline completion (parallel)

Tracked in `legacy_data/IMPLEMENTATION_PLAN.md`. Load only when working in that subtree.

---

## Accepted temporary deviations

### Feature deviations

1. **Avatar pipeline is local-only.** No server-side processing; raw uploads stored as-is (Busboy streaming, 5 MB limit); stable path + `?v={media_id}` cache-bust. `PhotoStorageAdapter` boot-time/parity/staging-smoke trio still to complete for S3 impl. Unblock: S3/media pipeline.
2. **Cache-Control at app layer, not CloudFront cache policy.** DD §6.7 target is the AWS managed `CachingDisabled` policy; current is Express middleware for authenticated responses. Same behavior, different surface. Don't refactor the middleware away expecting CloudFront takeover. Unblock: CloudFront managed policy attached.

### Infrastructure deviations

3. **CI/CD partial.** App CI active; deploys are operator-driven via `scripts/`. Unblock: build out a deploy pipeline.
4. **Operator + host access uses bootstrap-grade posture.** `footbag-operator` IAM user holds `AdministratorAccess`; long-lived access keys on the operator workstation and on the staging host. Scope-down and key-rotation procedure: `docs/DEVOPS_GUIDE.md` §17.9 + DEV_ONBOARDING Path H §8.7. Unblock: pre-launch security pass.
5. **`/internal` routes gated at member-level only.** All `/internal/*` routes (persons QC, net QC decision POSTs, candidate approve/reject) use `requireAuth` with no role check. Any registered member can approve/reject QC curation decisions that alter public Net data. Intentional dev/staging shortcut to unblock QC reviewers without a role system. Unblock: admin/operator role gate before go-live. Files: `src/routes/internalRoutes.ts`, `src/middleware/auth.ts`.
