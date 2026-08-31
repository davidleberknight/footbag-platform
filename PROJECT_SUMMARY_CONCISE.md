# Footbag Website Modernization : Project Summary for AI

## Purpose

Orientation and routing for progressive disclosure of details to ground all design and coding in the canonical documents. For implemented behavior, current code is deployed surface only and might have bugs. The documents (including Claude rules and header comments) define intended design and functionality. Assume these documents might be stale or incomplete, and ask human about any drift or gaps found.

## Routing : what to read for what


| Need                                                                                                         | Read                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Members, historical persons, search, contact fields, records, stats, exports, or auth and privacy boundaries | `docs/DATA_GOVERNANCE.md`                                                                                                        |
| Feature behavior, acceptance criteria, functional scope                                                      | targeted sections of `docs/USER_STORIES.md`, plus the owning service's file-header JSDoc                                         |
| Current scope, known deviations, go-live planning                                                            | the maintainers' private issue tracker (`tracker-ops` skill; skip if the private GitHub repo is unwired).                        |
| Public-page rendering patterns, routes and auth, view-model contracts, page invariants                       | `.claude/rules/view-layer.md` and the owning service's file-header JSDoc                                                         |
| Service ownership, service-layer patterns, service-level error semantics                                     | the service's file-header JSDoc and `.claude/rules/service-layer.md`; pair with code, tests, and types for current method shapes |
| Entity relationships, persisted state conventions, schema invariants, exact SQL surface                      | `docs/DATA_MODEL.md` and `database/schema.sql`                                                                                   |
| Rationale, security, design intent                                                                           | targeted sections of `docs/DESIGN_DECISIONS.md`; read for intent and details before design or code tasks.                        |
| Deriving, layering, or verifying tests                                                                       | `docs/TESTING.md`                                                                                                                |
| Legacy migration scope, pipeline validation gates                               | go-live gate index, cutover sequencing, rollback posture, operational-readiness gates, and stakeholder coordination live in GO_LIVE_PLAN.md (private GitHub repo)               |
| Deployment, operations, infrastructure, CI/CD                                                                | DEVOPS_GUIDE.md and AWS_OPERATIONS.md (private GitHub repo when wired); `docs/DEV_ONBOARDING.md` for new dev setup               |
| Big-picture human context or document relationships                                                          | the full Project Summary                                                                                                         |


## High-impact invariants

Architecture:

- Business rules live in services, never in controllers or templates.
- External integrations stay behind infrastructure adapters.
- Differences between dev, staging, and production are enforced with adapter patterns.

## Documentation model

Canonical documents state design intent and are timeless: user stories for functional scope and acceptance criteria, design decisions for rationale and details, data model for schema conventions, data governance for privacy boundaries. Implementation contracts live at their enforcement site: the per-service and per-page contract in each service's file-header JSDoc, cross-cutting rules in `.claude/rules/*`, procedures in `.claude/skills/*`. Pre-load the relevant docs or rules before writing code or tests.