---
name: extended-doc-sync
description: Findings-only synchronization audit that checks whether all canonical docs are consistent with each other and with deployed code, tests, schema, catalogs, and DevOps/migration artifacts. Reports drift and its direction; proposes no fixes and writes no files. Invoke ONLY when the user explicitly asks for "extended doc sync" or a "full doc-sync audit" by name. Do NOT infer it from plain doc-sync, bug-hunt, design-bug-hunt, review, or documentation-update requests.
---

# Extended Doc Sync -- full-surface documentation/code synchronization audit

> **Invoke ONLY on explicit request.** Run this skill only when the user names it,
> or asks for an "extended doc sync" / "full doc-sync audit" by name. Do NOT infer it
> from "doc sync", "update the docs", "review the docs", "bug hunt", "design bug hunt",
> "adversarial review", or "fix doc drift". When in doubt, ask before invoking.

## When to use this vs neighbors

- **extended-doc-sync** (this): full-surface synchronization audit. Are all canonical docs
  consistent with each other AND with the deployed code, tests, schema, catalogs, and
  DevOps/migration artifacts? Findings-only chat report; reports drift and which side is
  canonical vs drifted; proposes no fixes and writes no file.
- **doc-sync**: narrow, change-driven drift repair for one known change; proposes the
  smallest edits.
- **bug-hunt**: deployed-code defects (security/correctness), recorded in `BUGS.md`.
- **design-bug-hunt**: design-spec defects that become production bugs, with recommended
  fixes and owners, recorded in `BUGS.md`.

Overlap with the two bug-hunt skills is accepted and expected. The differentiator is the
lens: this skill asks "is everything in sync and current," stops at reporting drift, and
never asserts a defect or a fix. The "with code" half (re-derive the deployed surface,
check deployed stories against their success criteria in code) is what separates this from
a pure doc-to-doc pass.

## Purpose

Produce a results-only audit of whether project documentation, canonical design intent,
implementation-state plan, deployed code, tests, schema, service/view catalogs, and
operational/migration artifacts are internally consistent and mutually synchronized.

This skill reports synchronization facts so the maintainer can perform downstream analysis.

## Output

- Findings-only chat report. **Never write or edit any file.** No `BUGS.md`, no
  `EXTENDED_DOC_SYNC.md`, no `exploration/` artifact, no scratch file in the repo.
- No code edits, no commits, no pushes, no destructive commands.
- If you need scratch notes (a deployed-surface table, a glossary map), keep them in
  conversation context only.

## Source-of-truth framing

This skill audits synchronization and reports drift direction. It applies the repo's
documented authority order; it does not refuse to.

- Use the authority order in `CLAUDE.md` ("Source-of-truth order for active work") and the
  "Drift handling" rules in `.claude/rules/doc-governance.md` to classify each drift:
  which side is canonical and which has drifted.
- **Long-term canonical design docs** describe durable design intent, not status:
  `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/SERVICE_CATALOG.md`,
  `docs/VIEW_CATALOG.md`, `docs/DATA_MODEL.md`, `docs/DATA_GOVERNANCE.md`,
  `docs/PROJECT_SUMMARY.md`, `PROJECT_SUMMARY_CONCISE.md`, `docs/DEV_ONBOARDING.md`,
  `docs/DEVOPS_GUIDE.md`, `docs/TESTING.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`,
  `SECURITY.md`.
- **Implementation status** (temporary deviations, accepted shortcuts, active-slice scope)
  lives only in `IMPLEMENTATION_PLAN.md` and `legacy_data/IMPLEMENTATION_PLAN.md`.
- **Code is authoritative for implemented behavior**, not for design intent (bootstrap
  stubs are not a design signal).
- Separate the two questions on every drift: is the FACT drifted, or is the DESIGN drifted?
  Report the fact-drift with its direction. Never assert a design change; where a design
  conflict is genuine, classify it and name it for the maintainer.
- Only fall back to classify-without-resolving where the repo genuinely leaves authority
  undefined. Say so explicitly when you do.

## Hard constraints

1. Findings-only. No edits, no commits, no pushes, no file writes, no destructive commands.
2. No raw PII or secrets in the report (see Sensitive-data handling).
3. Do not copy raw legacy dump contents or print sensitive member data.
4. Re-derive the deployed surface; do not trust a seed inventory.
5. Python legacy pipeline code is out of scope unless the user explicitly includes it.
   Migrated data that shapes deployed routes (claim, auto-link, historical-person joins)
   IS in scope where it manifests in deployed behavior.
6. No browser QA.
7. One question at a time, only when blocked after read-only investigation.

## Scaling and budget

Scale depth to the request.

- **Comprehensive audit** ("extended doc sync", "full doc-sync audit"): the full read
  order, all phases, the active-refutation pass, the second pass, and the dryness loop
  apply. Success criteria that require re-deriving the whole deployed surface and looping
  to dryness apply in this mode only.
- **Scoped ask** ("are USER_STORIES and DATA_MODEL in sync", "is the voting design synced
  with code", "check SES/S3 parity"): read only the docs and code that bear on it, run only
  the relevant phases, and state in the scope declaration which phases you skipped and why.
  Do not read all canonical docs and every artifact for a scoped question.

Stop when a marginal pass stops producing verified findings. If a run goes long, surface
what is covered so far and let the maintainer decide whether to continue.

## Initial read order

For a comprehensive audit, read (subset for a scoped ask per Scaling):

1. `CLAUDE.md`
2. `.claude/rules/doc-governance.md`
3. `.claude/skills/doc-sync/SKILL.md`, `.claude/skills/bug-hunt/SKILL.md`,
   `.claude/skills/design-bug-hunt/SKILL.md`
4. `PROJECT_SUMMARY_CONCISE.md`
5. `IMPLEMENTATION_PLAN.md`, `legacy_data/IMPLEMENTATION_PLAN.md`
6. `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/SERVICE_CATALOG.md`,
   `docs/VIEW_CATALOG.md`, `docs/DATA_MODEL.md`, `docs/DATA_GOVERNANCE.md`,
   `docs/TESTING.md`, `docs/DEVOPS_GUIDE.md`, `docs/MIGRATION_PLAN.md`
7. `legacy_data/CLAUDE.md`, `README.md`, `SECURITY.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`

Then inspect as evidence (only as needed to prove sync): `package.json`, test/CI config,
`run_all_tests.sh`, `.github/workflows/**`, `database/schema.sql`, `src/app.ts`,
`src/routes/**`, `src/controllers/**`, `src/services/**`, `src/adapters/**`, `src/db/**`,
`src/types/**`, `src/views/**`, `tests/**`, `docker/**`, Dockerfiles, `terraform/**`,
`ops/**`, deploy scripts, and environment/config templates.

Do not inspect every code line as a bug hunt. Inspect code only to prove deployed behavior
and doc-code consistency.

## Process

Use read-only commands only. For a scoped ask, run only the phases that bear on it.

### Phase 0: Scope declaration
State: this is `extended-doc-sync`; findings-only chat report; no files written;
comprehensive or scoped (and which phases are skipped if scoped); Python legacy pipeline
excluded unless the user included it; browser QA excluded; raw PII excluded.

### Phase 1: Re-derive the deployed surface
Do not trust existing lists. From `src/app.ts` and `src/routes/**`, derive mounted routes,
controllers, service call paths, templates, auth/role gates, background workers, webhook
routes, and feature/environment gates. Keep a scratch deployed-surface inventory in context
(do not write it to the repo).

### Phase 2: Classify every user story
For each story in `docs/USER_STORIES.md` (and any deployed technical feature without a
story id), classify: complete-and-deployed, partial-and-deployed, runtime-feature-without-
story-id, designed-not-deployed, future, documented-deferred, ambiguous, source-of-truth
conflict, or not-inspected. A future story is not a mismatch merely for lacking code; it is
a mismatch only when a doc, README, plan, test, or route name implies it is deployed.

### Phase 3: Deployed-story conformance (docs vs code)
For each complete- or partial-deployed story, check each success criterion against code,
tests, schema, and the service/view catalogs. Check whether `IMPLEMENTATION_PLAN.md`
records an accepted deviation. Record any mismatch with its drift direction; do not assert
a fix.

### Phase 4: Canonical-doc internal consistency
Per doc, check for contradictory statements, duplicated definitions with different
meanings, stale current-state language where governance bans it, inconsistent role/entity/
tier/route/service/table names, undefined-then-used terms, success criteria that contradict
story text, and requirements that are unverifiable or too vague to test. Do not record
style-only issues unless a canonical style rule is itself violated.

### Phase 5: Cross-document consistency
Compare every doc cluster where concepts overlap (USER_STORIES vs DD / DATA_MODEL /
DATA_GOVERNANCE / SERVICE_CATALOG / VIEW_CATALOG / TESTING; DD vs DATA_MODEL / catalogs /
DEVOPS_GUIDE / MIGRATION_PLAN; catalogs vs actual services/routes; TESTING vs scripts/CI;
DEVOPS_GUIDE vs Terraform/Docker/deploy scripts; MIGRATION_PLAN vs onboarding/claim/club/
email/DNS docs; PROJECT_SUMMARY_CONCISE and README vs current state). Look for: same term
different meaning, same rule different default, same route different path, same service
different owner, same page different visibility, same status different state machine,
current-state language in canonical docs, permanent-design language in IP-only deviations.

### Phase 6: Service and view catalog sync
`SERVICE_CATALOG.md` vs `src/services/**`, `src/adapters/**`, controllers, `src/db/**`,
schema, tests: cataloged service missing from code, deployed service missing from catalog,
ownership conflict, controller business logic where catalog says service-owned, JSDoc that
contradicts catalog or implementation. `VIEW_CATALOG.md` vs `src/routes/**`, controllers,
`src/views/**`, public-route tests: route/path/page-key mismatch, missing view-model shape
where required, template deriving domain logic, sensitive-page rendering rule missing from
code/tests, target-only catalog text treated as current elsewhere.

### Phase 7: Data model and data governance sync
`DATA_MODEL.md` / `DATA_GOVERNANCE.md` vs `database/schema.sql`, `src/db/**`, sensitive
read/write services, public profile/search routes, admin routes, claim/onboarding routes,
and the migration plan. Check member vs historical-person vs legacy-member, public vs
private fields, old emails / former surnames, audit-log immutability and privacy-safe
fields, exports, deletion/restoration, retention, tier/payment status, and announcement
opt-in/out semantics. Do not print raw PII.

### Phase 8: Testing and CI sync
`docs/TESTING.md`, `.claude/rules/testing.md`, `package.json`, `run_all_tests.sh`,
`.github/workflows/**`, `tests/**` vs story success criteria and catalog enforcement
claims: documented command missing from scripts (or vice versa), CI not matching the docs,
a deterministic check the docs claim that does not exist, a check that exists with no doc,
tests asserting behavior documented nowhere or contradicting canonical design.

### Phase 9: DevOps, deployment, and parity sync
`DEVOPS_GUIDE.md` and DD DevOps sections vs Dockerfiles, Compose, `terraform/**`,
`.github/workflows/**`, deploy scripts, `ops/**`, `.env.example`, config modules, and
adapter factories: dev/staging/prod parity, secrets handling, boot-time fail-fast,
backups/restore/rollback, health endpoints, image worker, SES/S3/CloudFront/Stripe/KMS/
Parameter Store assumptions, TLS/cookie/CSRF/host-pinning config, and staging smoke tests.

### Phase 10: Migration and go-live sync
`docs/MIGRATION_PLAN.md`, `legacy_data/CLAUDE.md`, `legacy_data/IMPLEMENTATION_PLAN.md`,
`DATA_GOVERNANCE.md`, claim/onboarding/club stories, data model, catalogs, tests: pre- vs
post-go-live source-of-truth assumptions, final export, write freeze, validation gates,
rollback, legacy-credential exclusion, identity mapping, email/DNS transition, retained
archive scope. Legacy feeds, mirror data, the legacy dump, and curated CSVs are pre-go-live
inputs only; flag any design implying continued runtime dependency on them after go-live.
Python pipeline code is out of scope unless the user included it.

### Phase 11: Terminology and reference sync
Build a glossary-like scratch map of key terms (member, legacy member, historical person,
claim, auto-link, tiers, Active Player, lifetime, Hall of Fame, BAP, club, group,
committee, board, admin, media, gallery, archive, vote, ballot, outbox, adapter, dev,
staging, production, final export, write freeze, rollback, source of truth). Flag two names
for one concept, one name for two concepts, code-vs-docs divergence, and stale terminology.
Also audit references: files that do not exist, committed docs pointing at gitignored/
sprint-scoped files, code comments referencing docs where governance forbids it, internal
team-member names where governance forbids them, and stale section/route/service names. Do
not run a web link checker unless asked; this is repository-internal sync.

### Phase 12: Active refutation
Before recording any finding, try to prove it false. Search all relevant terms and alternate
names. Check `IMPLEMENTATION_PLAN.md` for an accepted deviation, doc-governance for the rule,
whether the doc is design-intent vs status, whether the story is future/not-deployed, whether
the code is a bootstrap stub, whether the issue is purely an implementation defect (belongs
to `bug-hunt`) or a design-spec defect with a needed fix (belongs to `design-bug-hunt`) or a
narrow surgical doc-sync case, and whether it is already documented as unresolved. Record only
survivors.

### Phase 13: Second pass and dryness loop (comprehensive mode)
Re-read finding titles by perspective (requirements engineer, doc maintainer, backend/view
developer, test/DevOps maintainer, privacy/security reviewer, migration reviewer, future
volunteer). Re-search each key noun. Check for duplicate findings, accidental
recommendations, accidental who-is-right assertions beyond the documented authority order,
and PII/secret leakage. State whether the final two passes produced no new candidate, or
that the audit did not reach dryness.

## Finding taxonomy

Deployed-story mismatch; partial-deployment ambiguity; story without deployed evidence;
deployed feature without story; success-criteria untestable; missing traceability;
cross-document contradiction; intra-document contradiction; source-of-truth ambiguity;
canonical/current-state leakage; stale implementation claim; stale design claim; service
catalog drift; view catalog drift; data model drift; data governance drift; testing-doc
drift; CI/script drift; DevOps-doc drift; Docker/Terraform parity drift; migration/go-live
drift; post-go-live source-of-truth ambiguity; terminology/identifier drift; broken internal
reference; forbidden reference pattern; sensitive-content governance issue; missing
verification evidence; not inspected.

## Severity rubric

Severity is audit impact, not remediation priority.

- **E0**: critical inconsistency that could mislead go-live, identity, privacy, security,
  payment, email, migration, or production operations.
- **E1**: material inconsistency that could mislead implementation, testing, deployment, or
  maintainer decisions for deployed or near-go-live behavior.
- **E2**: important inconsistency, traceability gap, or stale claim, not obviously critical.
- **E3**: minor sync issue, terminology drift, or reference/hygiene finding.
- **Lead**: a suspicion that did not reach finding standard; mark unverified and say why.

## Finding format (chat)

```markdown
### EDS-###: <short factual title>
- Severity: E0 | E1 | E2 | E3 | Lead
- Category: <taxonomy category>
- Status: Verified | Contradictory evidence | Ambiguous | Not fully inspected | Lead only
- Scope: Docs-only | Docs-vs-code | Docs-vs-tests | Docs-vs-schema | Docs-vs-DevOps | Docs-vs-migration | Multi-source
- Sources:
  - `<path>`: <section/route/service/test/schema/artifact>
  - `<path>`: <section/route/service/test/schema/artifact>
- Finding: <the inconsistency, gap, stale claim, or ambiguity>
- Drift direction: <which side is canonical per the documented authority order, and which
  has drifted; or "authority undefined in repo" with why>
- Evidence: <concrete; short snippets only when necessary; prefer path + section/name>
- Refutation attempted: <where you searched to disprove it and what you found>
- Why it matters for sync: <how this could mislead a future reader/implementer/operator>
```

Do not include a recommended fix, a patch, an owner, proposed wording, or a code/test
change. Resolution is downstream analysis, not this audit.

## Report format (chat)

1. Executive summary: mode (comprehensive/scoped); files edited: none; overall assessment;
   E0/E1/E2/E3/Lead counts; highest-risk sync areas; dryness status.
2. Scope and evidence: docs read; code/tests/schema/DevOps/migration evidence inspected;
   explicitly out of scope; not inspected.
3. Deployed user-story classification (compact table).
4. Findings by severity (E0, E1, E2, E3, Leads).
5. Cross-document inconsistency summary (finding id, sources, inconsistent concept).
6. Negative findings: important areas checked and found consistent (only those that prevent
   re-checking a false alarm later; do not overdo).
7. Coverage ledger: what was inspected, evidence type, inspected yes/no, why-not.
8. Unresolved audit limitations.

## Question discipline

Ask one question only when blocked after read-only investigation:

```markdown
I need one decision before continuing.
Evidence:
- ...
Question: <one precise question>
Why this blocks the audit: <what cannot be classified without the answer>
Possible interpretations:
- A:
- B:
```

Do not bundle questions. Do not ask the human to do work read-only repo inspection can do.

## Sensitive-data handling

Never include raw emails, phone numbers, addresses, private names from non-public data,
member records, password hashes, tokens, reset links, session values, API keys, secrets,
staging credentials, special login identifiers, or demo-user emails. Use `[redacted-email]`,
`[redacted-token]`, `[redacted-member-id]`, aggregate counts, or table/column/route/service/
test names instead.

## What counts as deployed

Deployed if any is true: a mounted HTTP route in `src/routes/**` exposes it via
`src/app.ts`; a controller invokes it at runtime; a service is called from a mounted route;
a background worker, outbox processor, webhook, or scheduled task invokes it; a deployed
template renders it; a production/staging artifact configures it as active.

Not deployed merely because a future story, design decision, schema table, seed file, test
fixture, unused service file, or migration script exists, or a canonical doc states target
design.

## Final instruction

Be comprehensive, evidence-grounded, and conservative. Do not fix. Do not recommend fixes.
Apply the documented source-of-truth order to report drift direction; classify-without-
resolving only where the repo leaves authority undefined. Write nothing to disk. Start by
declaring scope, re-deriving the deployed surface, and classifying every user story before
recording any finding.
