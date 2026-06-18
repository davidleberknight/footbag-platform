# Footbag Website Modernization -- Project Summary for AI

## Purpose

Use this file for quick orientation and document routing. For implemented behavior, current code is the source of truth; this file points to the canonical documents that define intended design and requirements.

## Fast routing
- **For tasks touching members, historical persons, search, contact fields, records, stats, exports, or auth/privacy:** load `docs/DATA_GOVERNANCE.md` first.
- For functional requirements and user stories with acceptance criteria, load `docs/USER_STORIES.md` first.
- For current slice/scope, known drift, and sequencing, read the top active-slice/status block in `IMPLEMENTATION_PLAN.md`; for sequencing, dependency analysis, or phased planning, read the full document in Plan Mode.
- For required public-page rendering patterns, view-model contracts, and sensitive-page invariants, load `.claude/rules/view-layer.md` and the owning service's file-header JSDoc.
- For required service-layer ownership and patterns, read the service's file-header JSDoc and the path-scoped `.claude/rules/*.md`; pair with code/tests/types for current method shapes; use the plan to determine current scope.
- For database schema explanation, load `docs/DATA_MODEL.md` or `database/schema.sql`.
- For rationale, trade-offs, and long-term design commitments, load targeted sections of `docs/DESIGN_DECISIONS.md`: read when entering a new code area or unwinding a temporary simplification; do not load by default.
- For go-live readiness, legacy data migration scope, operational-readiness gates, phasing, or cutover planning, load `docs/MIGRATION_PLAN.md`.
- The platform serves from a single Lightsail origin behind CloudFront; for operational procedures load `docs/DEVOPS_GUIDE.md`.

## Project identity

- **Repo:** github.com/davidleberknight/footbag-platform
- **Institutional context:** Developed under IFPA auspices (International Footbag Players Association)

## Project mission and operating philosophy

- Modernize footbag.org into a long-lived community platform.
- Optimize for **volunteer maintainability** and low operational complexity.
- Prefer **simplicity, transparency, and explicitness** over clever abstractions.
- Use standard, widely understood technologies and patterns so future contributors can onboard quickly.
- Keep code and docs aligned so the project remains maintainable over time.
- Route and integration tests are the first verification path; browser verification is explicit-human-request-only.

## Target system architecture

- **Server-rendered web application** (Handlebars templates + TypeScript enhancements).
- **Layered architecture**: controllers -> services -> infrastructure adapters.
- **SQLite-first** for application data; S3 for photos/media object storage.
- **Single DB access module/pattern** (`db.ts` style) using prepared statements and transaction helpers.
- **Authenticated sessions with per-request DB validation** (session token is not sole authority).
- **Email outbox + worker pattern** (core writes are not coupled to direct send success).
- **Isolated media-processing workers** for image variant generation and video transcoding, separate from the web container.
- **Single origin deployment** behind CloudFront; maintenance page served by CloudFront/S3 when origin is unavailable.

## Project scope snapshot (AI useful summary)

This project modernizes footbag.org into the sport's community hub, organized by discipline (freestyle, net, sideline), with member functionality, admin tools, and operational flows.
Major areas include:

- members and authentication
- authenticated member search (anti-enumeration, non-directory)
- membership tiers/dues and eligibility-related state (including Active Player status)
- clubs and events (creation, leadership, registration, year archives)
- discipline content sections: freestyle, net, sideline
- freestyle trick dictionary (tricks, sets, modifiers, glossary, notation, add/combo analysis)
- media galleries/photos/video links/tags
- curated freestyle tutorial media (separate intake from member uploads)
- public historical surfaces: competition results, world records, Hall of Fame, Big Add Posse, historical-person pages
- official rules and IFPA governance documents
- news feed
- payments, donations, subscriptions, and reconciliation
- email delivery via outbox/worker
- voting/elections with ballot confidentiality and auditability
- admin work queue / operational admin capabilities
- authenticated legacy archive access

## High-impact invariants (reasoning guardrails)

### Architecture invariants
- Preserve the server-rendered model unless a task explicitly requires a documented architectural change.
- Put business rules in **services**, not controllers/templates.
- Keep external integrations behind infrastructure adapters.
- Prefer small, explicit changes that preserve readability for volunteer maintainers.

### Auth / security invariants
Auth architecture: `docs/DESIGN_DECISIONS.md` §3 (session model, CSRF, password invalidation, ballot encryption). Privacy boundaries: `docs/DATA_GOVERNANCE.md` §3-6. Current-slice auth behavior: `IMPLEMENTATION_PLAN.md`.

### Data / integrity invariants
- SQLite is the source of truth for app data (except photo/media objects in S3).
- DB transactions are architecture, not an implementation convenience.
- Multi-step workflows that change related state must preserve transactional consistency.
- Historical/audit/ledger-style records that are append-only or immutable must remain so.
- Effective membership tier / eligibility must use the project's canonical read-model logic, not ad hoc derivation in feature code.

### Operational invariants
- Dev/prod parity matters for infrastructure adapters and workflows.
- Simplicity is intentional: do not introduce distributed components or operational complexity without explicit approval.
- For Lightsail environments, operator shell access uses hardened per-operator SSH to named host accounts; runtime AWS API access remains separate and uses assumed IAM roles.

## Conceptual code map (paths may vary)

Use this as a reasoning map; exact structure may differ in the repo:

- **presentation / templates / view-models** - rendered pages and client-side enhancements
- **controllers** - HTTP request/response handling, validation, session extraction
- **services** - business logic, authorization, orchestration, domain invariants
- **infrastructure adapters** - Stripe and AWS integrations
- **database access module** - prepared SQL, transactions, connection helpers
- **workers / background jobs** - outbox sending, reconciliation, maintenance tasks, isolated image/video media processing
- **docs** - project documentation suite (specs, decisions, diagrams, DevOps, onboarding)
- **infrastructure-as-code** - deployment/infrastructure configuration (Terraform)

## Documentation map (project doc suite categories)

This project uses a documentation suite. The AI should treat it as a modular knowledge base and load documents selectively.

### Canonical documents
- **User Stories** - functional scope and acceptance criteria (what must exist / what users must be able to do).
- **Project Summary** - human-oriented big picture and solution architecture; its §1 maps the full document suite.
- **Design Decisions** - rationale and non-negotiable design commitments / trade-offs.
- **Data Model** - canonical persisted entities, relationships, schema conventions, storage structure.

### Implementation contracts (enforcement-site)

The standards and patterns the canonical docs defer to live at their enforcement site, not in a canonical document, and auto-attach as the relevant code is touched: per-service and per-page contract in each service's file-header JSDoc, cross-cutting rules in `.claude/rules/*`, procedures in `.claude/skills/*`, and code comments. A canonical doc never restates a contract a JSDoc, rule, or skill already owns.

- **View-layer rules** - the public-rendering standard (page contract, reusable primitives, CSS-vocabulary discipline, visual standard) lives in `.claude/rules/view-layer.md`; each page's rendering contract, audience, and sensitive-page invariants live in the owning service's file-header JSDoc; the route list lives in `src/routes/publicRoutes.ts`; durable view design intent lives in DESIGN_DECISIONS.md §4.
- **Service-layer rules** - ownership and required patterns live in each service's file-header JSDoc and the path-scoped `.claude/rules/*.md`; non-negotiable invariants in DESIGN_DECISIONS.md §3-§4 and schema triggers.

## When to load more detail (recommended wording / agent rule)

If the task requires details that could materially affect **correctness, security, data integrity, user-visible behavior, or architectural consistency**, and those details are not certain from this summary, the agent should **pause and read the relevant project documents before making recommendations or changes**.

In other words: use this file for orientation, but **escalate to the authoritative docs whenever guessing would be risky**.

Also: the agent may read the **full human-oriented documents** when needed; it is not limited to AI-only summaries.

## Document routing heuristics (what to read next)

- Need exact feature behavior or acceptance criteria -> **User Stories** (+ the owning service's JSDoc when flow/UI context matters)
- Need required rendering patterns, route audience/auth, view-model contracts, or sensitive-page invariants -> `.claude/rules/view-layer.md` + the owning service's file-header JSDoc
- Need service ownership, required service-layer patterns, or service-level error semantics -> the service's file-header JSDoc and `.claude/rules/service-layer.md`
- Need entity relationships, persisted state conventions, schema invariants, or exact SQL surface -> **Data Model** + `database/schema.sql`
- Need rationale / trade-offs / "why was it done this way" -> **Design Decisions**
- Need to derive, layer, or verify tests -> **Testing Strategy** (`docs/TESTING.md`)
- Need deployment, backups, recovery, infrastructure changes, or CI/CD -> **DevOps guide**. Use **Developer Onboarding** for blank-machine setup and first-pass bootstrap guidance.
- Need go-live readiness, legacy data migration scope, operational-readiness gates, or cutover sequencing -> **Migration Plan** (`docs/MIGRATION_PLAN.md`)
- Need big-picture human context or document relationships -> **Project Summary** (full version)

