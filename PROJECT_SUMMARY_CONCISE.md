# Footbag Website Modernization - Project Summary for AI (Context Refresh)

## Project identity

- **Repo:** github.com/davidleberknight/footbag-platform
- **Maintainer:** David Leberknight (@davidleberknight, davidleberknight@gmail.com) 
- **Target domain:** footbag.org (replacing/modernizing)
- **Institutional context:** Developed under IFPA auspices (International Footbag Players Association)
- **Licence:** Apache-2.0 (code) 

## Project mission and operating philosophy

- Modernize footbag.org into a long-lived community platform.
- Optimize for **volunteer maintainability** and low operational complexity.
- Prefer **simplicity, transparency, and explicitness** over clever abstractions.
- Use standard, widely understood technologies and patterns so future contributors can onboard quickly.
- Keep code and docs aligned so the project remains maintainable over time.

## Big-picture architecture (mental model to preserve)

- **Server-rendered web application** (Handlebars templates + TypeScript enhancements).
- **Layered architecture**: controllers -> services -> infrastructure adapters.
- **SQLite-first** for application data; S3 for photos/media object storage.
- **Single DB access module/pattern** (`db.ts` style) using prepared statements and transaction helpers.
- **JWT cookie auth with per-request DB validation** (session token is not sole authority).
- **Email outbox + worker pattern** (core writes are not coupled to direct send success).
- **Single origin deployment** behind CloudFront; maintenance page served by CloudFront/S3 when origin is unavailable.

## Project scope snapshot (AI useful summary)

This project is building a community website with member functionality, admin tools, and operational flows. 
Major areas include:

- members and authentication
- membership tiers/dues and eligibility-related state
- clubs and events
- media galleries/photos/video links/tags
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
- JWT session cookies are **not sufficient authority** on their own; current DB state must be checked.
- Password changes invalidate sessions via the project’s password-version mechanism.
- State-changing behavior must follow the documented CSRF / HTTP semantics patterns.
- Ballot confidentiality is required; voting is auditable but not fully anonymous.

### Data / integrity invariants
- SQLite is the source of truth for app data (except photo/media objects in S3).
- DB transactions are architecture, not an implementation convenience.
- Multi-step workflows that change related state must preserve transactional consistency.
- Historical/audit/ledger-style records that are append-only or immutable must remain so.
- Effective membership tier / eligibility must use the project’s canonical read-model logic, not ad hoc derivation in feature code.

### Operational invariants
- Dev/prod parity matters for infrastructure adapters and workflows.
- Simplicity is intentional: do not introduce distributed components or operational complexity without explicit approval.

## Conceptual code map (paths may vary)

Use this as a reasoning map; exact structure may differ in the repo:

- **presentation / templates / view-models** - rendered pages and client-side enhancements
- **controllers** - HTTP request/response handling, validation, session extraction
- **services** - business logic, authorization, orchestration, domain invariants
- **infrastructure adapters** - Stripe and AWS integrations
- **database access module** - prepared SQL, transactions, connection helpers
- **workers / background jobs** - outbox sending, reconciliation, maintenance tasks
- **docs** - project documentation suite (specs, decisions, diagrams, DevOps, onboarding)
- **infrastructure-as-code** - deployment/infrastructure configuration (Terraform)

## Documentation map (project doc suite categories)

This project uses a documentation suite. The AI should treat it as a modular knowledge base and load documents selectively.

### Core requirements and architecture documents
- **User Stories** - functional scope and acceptance criteria (what must exist / what users must be able to do).
- **Project Summary** - human-oriented big picture, solution architecture, and overall context.
- **Design Decisions** - rationale and non-negotiable design commitments / trade-offs.
- **Data Model** - canonical persisted entities, relationships, schema conventions, storage structure.

### Implementation specification documents
- **View Catalog** - user-facing views, flows, actors, and authorization at flow level.
- **UI Specification** - UI layer implementation (views/controllers/templates/view-model flow).
- **Service Catalog** - service boundaries, contracts, business logic expectations, error semantics.
- **Server Specification** - route behavior, validation, HTTP semantics, jobs, data access patterns.
- **DevOps guide** - build, test, release, operate, recover, CI/CD, infrastructure procedures.

## When to load more detail (recommended wording / agent rule)

If the task requires details that could materially affect **correctness, security, data integrity, user-visible behavior, or architectural consistency**, and those details are not certain from this summary, the agent should **pause and read the relevant project documents before making recommendations or changes**.

In other words: use this file for orientation, but **escalate to the authoritative docs whenever guessing would be risky**.

Also: the agent may read the **full human-oriented documents** when needed; it is not limited to AI-only summaries.

## Document routing heuristics (what to read next)

- Need exact feature behavior or acceptance criteria -> **User Stories** (+ View Catalog when flow/UI context matters)
- Need route/controller behavior, validation, HTTP status semantics, jobs/webhooks -> **Server Specification**
- Need business rules, service boundaries, contracts, error semantics -> **Service Catalog**
- Need entity relationships, persisted state conventions, schema invariants -> **Data Model** and , **Schema SQL** (for exact detail)
- Need rationale / trade-offs / "why was it done this way" -> **Design Decisions**
- Need UI implementation conventions or page composition details -> **UI Specification** (+ View Catalog)
- Need deployment, backups, recovery, infrastructure changes, CI/CD -> **DevOps guide** (+ diagrams if topology matters)
- Need terminology clarification -> **Glossary**
- Need big-picture human context or document relationships -> **Project Summary** (full version)

## Agent operating rules for this project (human-in-the-loop)

### 1) Keep the human in the loop on uncertainty
If there is **any uncertainty, ambiguity, or doubt** about what to do, what was intended, or which interpretation is correct, the agent should **ask the human before proceeding**.

### 2) Require approval for non-trivial changes
For anything other than a clearly trivial change, the agent should:
- explain the proposed approach briefly
- identify any assumptions
- ask for human approval before applying the change

Examples of **non-trivial** changes include (not exhaustive):
- behavior changes affecting users/admins
- schema/migration changes
- auth/security/session changes
- payments/voting/email workflow changes
- refactors crossing module boundaries
- infrastructure / deployment / CI changes

### 3) Prefer smallest safe change
Make the smallest change that solves the task while preserving documented invariants, unless a human approves otherwise.

### 4) Verify before claiming done
Use the project’s preferred tests/checks (as appropriate to the change) and report what was verified vs not verified.

### 5) Keep docs in sync (suggest updates proactively)
When a human decision or code change alters behavior, architecture, contracts, terminology, or operational procedures, the agent should:
- check whether relevant project docs still match reality
- **suggest updates to the affected documents** so documentation stays in sync, if drift is detected
- If a requested design change departs from current docs, the agent must stop and call that out explicitly.


