# Footbag Website Modernization : Routing for AI

## Purpose

Which document to read for which need. Which source wins in a conflict is the authority order in root `CLAUDE.md`.

## Routing : what to read for what

| Need | Read |
| --- | --- |
| What design intent is, when it is clear, and conflicts between code, documents and intent | the `design-intent` skill |
| Members, historical persons, search, contact fields, records, stats, exports, or auth and privacy boundaries | `docs/DATA_GOVERNANCE.md` |
| Feature behavior, success criteria, functional scope | targeted sections of `docs/USER_STORIES.md`, plus the owning service's file-header JSDoc |
| Background jobs: what each must do, its cadence, alarms and run record | targeted sections of `docs/BACKGROUND_JOBS.md`, plus `src/services/jobRegistry.ts` |
| Technical and non-functional requirements, rationale, security, layer boundaries | targeted sections of `docs/DESIGN_DECISIONS.md` |
| Entity relationships, persisted state conventions, schema invariants, exact SQL surface | `docs/DATA_MODEL.md` and `database/schema.sql` |
| Public-page rendering patterns, view-model contracts, page invariants | `.claude/rules/view-layer.md` and the owning service's file-header JSDoc |
| Service ownership, service-layer patterns, service-level error semantics | the service's file-header JSDoc and `.claude/rules/service-layer.md`; pair with code, tests, and types for current method shapes |
| Deriving, layering, or verifying tests | `docs/TESTING.md` for the doctrine; `.claude/rules/testing.md` and the `write-tests` skill when writing or fixing tests |
| Current scope, tracked deviations, known bugs | the maintainers' private tracker (`tracker-ops` skill) |
| Legacy data migration and the historical pipeline | the Legacy Data Migration decision in `docs/DESIGN_DECISIONS.md`; `legacy_data/CLAUDE.md` and the `pipeline-invariant-enforcer` skill for pipeline work; the pipeline validation gates in `docs/TESTING.md` |
| Go-live gates, cutover sequencing, rollback, stakeholder coordination | GO_LIVE_PLAN.md (private GitHub repo) |
| Freestyle tricks, dictionary, browse views and curated media | `docs/FREESTYLE.md`; the `footbag-freestyle-dictionary`, `freestyle-dictionary-surface` and `footbag-curated-media` skills |
| Deployment, operations, infrastructure, CI/CD | DEVOPS_GUIDE.md and AWS_OPERATIONS.md (private GitHub repo, required for any AWS work); `docs/DEV_ONBOARDING.md` for new dev setup |
| How this Claude Code harness works, or changing it | `docs/CLAUDE_CODE_GUIDE.md` and the `update-config` skill |
| Big-picture human context or document relationships | `docs/PROJECT_SUMMARY.md` |
