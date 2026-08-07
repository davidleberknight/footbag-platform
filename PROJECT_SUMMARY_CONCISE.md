# Footbag Website Modernization : Project Summary for AI

## Purpose

Quick orientation and document routing. For implemented behavior, current code is deployed surface only; the canonical documents define intended design and requirements.

## Routing : what to read for what

| Need | Read |
|---|---|
| Members, historical persons, search, contact fields, records, stats, exports, or auth and privacy boundaries | `docs/DATA_GOVERNANCE.md`, before anything else |
| Feature behavior, acceptance criteria, functional scope | targeted sections of `docs/USER_STORIES.md`, plus the owning service's file-header JSDoc when flow or UI context matters |
| Current scope, known deviations, sequencing | the maintainers' private tracker (`tracker-ops` skill; skip in one line if unwired) |
| Public-page rendering patterns, route audience and auth, view-model contracts, sensitive-page invariants | `.claude/rules/view-layer.md` and the owning service's file-header JSDoc |
| Service ownership, service-layer patterns, service-level error semantics | the service's file-header JSDoc and `.claude/rules/service-layer.md`; pair with code, tests, and types for current method shapes |
| Entity relationships, persisted state conventions, schema invariants, exact SQL surface | `docs/DATA_MODEL.md` and `database/schema.sql` |
| Rationale, trade-offs, long-term commitments, security architecture | targeted sections of `docs/DESIGN_DECISIONS.md`; read when entering a new code area or unwinding a temporary simplification, not by default |
| Deriving, layering, or verifying tests | `docs/TESTING.md` |
| Legacy migration scope, operational-readiness gates, pipeline validation gates | `docs/MIGRATION_PLAN.md`; the go-live gate index, cutover sequencing, and stakeholder coordination live in GO_LIVE_PLAN.md (private GitHub repo) |
| Deployment, backups, recovery, infrastructure, CI/CD | DEVOPS_GUIDE.md (private GitHub repo), reached through the private checkout when wired; `docs/DEV_ONBOARDING.md` for blank-machine setup |
| Big-picture human context or document relationships | the full Project Summary |

## Mission

- Modernize footbag.org into a long-lived community platform for the sport, organized by discipline (freestyle, net, sideline), with member functionality, admin tools, and operational flows.
- Optimize for volunteer maintainability: standard, widely understood technologies, and simplicity, transparency, and explicitness over clever abstractions.
- Major areas: members and authentication; authenticated non-directory member search; membership tiers and dues; clubs and events; the discipline content sections; the freestyle trick dictionary; media galleries and curated tutorial media; public historical surfaces (competition results, world records, Hall of Fame, Big Add Posse, historical persons); official rules and IFPA governance documents; news; payments, donations, and subscriptions; email delivery via outbox and worker; voting and elections with ballot confidentiality and auditability; the admin work queue; and authenticated legacy archive access.

## Target architecture

- Server-rendered Handlebars with TypeScript enhancements; controllers, then services, then infrastructure adapters.
- SQLite holds all application data, S3 holds media objects; a single DB access module using prepared statements and transaction helpers.
- Authenticated sessions with per-request DB validation; the session token is not sole authority.
- Email outbox plus worker, so core writes are not coupled to send success; isolated media-processing workers for image variants and video transcoding, separate from the web container.
- Single Lightsail origin behind CloudFront; maintenance page served by CloudFront and S3 when the origin is unavailable.

## High-impact invariants

Architecture:

- Business rules live in services, never in controllers or templates; external integrations stay behind infrastructure adapters.
- Differences between dev, staging, and production are enforced with adapter patterns.
- Prefer small, explicit changes that preserve readability for volunteer maintainers.

Data and integrity:

- DB transactions are architecture, not an implementation convenience: multi-step workflows that change related state preserve transactional consistency.
- Historical, audit, and ledger-style records that are append-only or immutable stay that way.
- Effective membership tier and eligibility use the project's canonical read-model logic, never ad hoc derivation in feature code.

Operational:

- Dev and production parity matters for infrastructure adapters and workflows.
- Simplicity is intentional: no distributed components or added operational complexity without explicit approval.
- Operator shell access to Lightsail uses hardened per-operator SSH to named host accounts; runtime AWS API access is separate and uses assumed IAM roles.

## Documentation model

Canonical documents state design intent and are timeless: user stories for functional scope and acceptance criteria, design decisions for rationale and commitments, data model for persisted entities and schema conventions, data governance for privacy boundaries and sensitivity tiers. Implementation contracts live at their enforcement site instead: the per-service and per-page contract in each service's file-header JSDoc, cross-cutting rules in `.claude/rules/*`, procedures in `.claude/skills/*`. A canonical document never restates a contract a JSDoc, rule, or skill already owns. Pre-load the relevant rules before writing code or tests.
