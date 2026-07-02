---
name: design-bug-hunt
disable-model-invocation: true
description: Run a disciplined adversarial design bug hunt across canonical docs, all user stories, design decisions, service and view-layer contracts (file-header JSDoc and the view-layer rule), migration/go-live design, testing/DevOps standards, and environment parity artifacts. Invoke ONLY when the user explicitly asks for a "design bug hunt" or "design bug sweep" by name. Do NOT infer it from "adversarial review", "design review", "review the docs", or any general review phrasing - those mean a general findings-only review done in plan mode, not this skill. This complements bug-hunt: it focuses on bugs in the intended design and specifications, not primarily implementation bugs.
---

# Design Bug Hunt Skill

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a "design bug hunt" or "design bug sweep" by name. Do NOT infer it from "adversarial review", "design review", "review the docs", or any general review phrasing — those mean a general findings-only review done in plan mode, not this skill. When in doubt, ask before invoking.

This skill performs an adversarial design-level bug hunt for `footbag-platform`.

It complements `.claude/skills/bug-hunt/SKILL.md`.

Use this skill to find bugs that can survive go-live because the design, requirements, operational plan, migration plan, service/view contracts, or environment parity rules are incomplete, ambiguous, contradictory, untestable, unsafe, or missing.

This is not a general documentation polish pass. This is a bug hunt.

A design bug is any gap, contradiction, omission, ambiguity, unverifiable requirement, wrong source-of-truth assumption, missing lifecycle rule, missing acceptance criterion, missing security/privacy/ops constraint, missing parity rule, or unresolved migration/cutover behavior that could reasonably lead to wrong production behavior even if the eventual code is competently implemented.

## Relationship to `bug-hunt`

The existing `bug-hunt` skill focuses on deployed code, route/service behavior, implemented user stories, security/correctness bugs, and implementation evidence.

This skill focuses on the design layer:

* all user stories, including stories not yet delivered
* design decisions and design rationale
* service ownership boundaries and target contracts
* view/page/rendering standards and target page models
* data model semantics
* data governance and privacy boundaries
* testing standards and acceptance criteria
* DevOps/deployment/runtime parity requirements
* migration and go-live design
* post-go-live source-of-truth rules
* environment parity between dev, staging, and production
* documentation gaps that would force future implementers to guess

When a finding is implementation-only, hand it off to `bug-hunt`.

When a finding is a design/specification problem that will cause future implementation ambiguity or production risk, keep it here.

Overlap with `bug-hunt` is intentional and accepted. The two skills sweep overlapping surface from different perspectives — `bug-hunt` from deployed-code reality, this skill from design/specification intent — and that redundancy is a feature: each vantage point catches what the other misses. Do not suppress a real design finding merely because `bug-hunt` might also surface a related code finding. The boundary is by nature, not by territory: a finding that reduces purely to deployed-code behavior with no design-spec defect goes to `bug-hunt`; everything with a specification-layer defect stays here.

A third neighbor, `freestyle-bug-hunt`, owns the freestyle-domain invariants (dictionary layer separation, ADD math, slot governance, naming/slug/hashtag conventions, the trick-tag invariant, cross-surface propagation). This skill still audits the DESIGN quality of freestyle stories and contracts (the high-risk checklist has a freestyle section); a finding whose substance is a freestyle domain-rule violation hands off there.

## Absolute rules

1. Do not implement code.
2. Do not silently rewrite design docs.
3. Do not change `.claude`, `docs`, `.github`, infrastructure, tests, source, schema, or migration files unless the human explicitly asks for edits after the design-bug report. Recording findings in `BUGS.md` happens only when the human asks for findings to be recorded.
4. Do not run destructive commands.
5. Do not inspect or dump raw PII unnecessarily.
6. Do not print raw member PII, emails, addresses, phone numbers, passwords, password hashes, reset tokens, sessions, secrets, or credential-like values.
7. Do not audit the Python legacy pipeline as code unless the human explicitly expands scope.
8. Do not treat legacy CSVs, mirror feeds, or the legacy data dump as post-go-live runtime sources of truth. After go-live, the production database and live platform become the source of truth unless a canonical doc explicitly says otherwise.
9. Do not treat "not currently implemented" as a design bug by itself. Documented future work is design intent, not audit drift. A missing service, view, schema, governance, or test contract for an undelivered story is reportable ONLY when the intended behavior is ambiguous, contradictory, unsafe, unverifiable, or missing required acceptance criteria. Mere absence of an unbuilt feature is never a finding, and the hunt never proposes building the feature.
10. Do not treat existing design rationale as automatically correct. Good rationale can still hide edge-case bugs.
11. Do not guess. Use `UNKNOWN`, `NOT SPECIFIED`, `NOT FOUND`, `CONTRADICTED`, or `NEEDS HUMAN DECISION`.
12. Ask at most one question at a time, only when truly blocked after collecting available evidence; follow `.claude/rules/asking.md` (one self-contained question with a recommended answer, no codes the maintainer was not given).
13. Findings must be evidence-grounded and actively refuted before recording.
14. Continue until no new candidate design bugs appear after at least two independent passes, subject to the scaling rule below.

## Output target

Default output is a design-bug report in chat.

If the human explicitly asks for findings to be recorded, the single sink is `BUGS.md` at the repo root — the same file the `bug-hunt` skill uses. Do not create `DESIGN_BUGS.md` or any other file.

Design findings go in a dedicated **Design bugs (specification/design layer)** group, added after the existing groups (security severity sections, Design-divergence and hygiene, Testing and CI/CD verification gaps, Leads). The group follows `bug-hunt`'s §4.6 discipline:

* It is ephemeral. Remove each finding once its design fix lands; the corrected canonical doc is then authoritative. No closures, no dates, no `RESOLVED` markers, no emojis.
* Design findings use their own `DBH-###` sub-sequence with a `Next design finding ID:` pointer at the top of the group. This is a deliberate divergence from bug-hunt's single `B-###` sequence: a different skill, cadence, and owner set produce these, so a separate counter prevents the two skills contending over one ID.
* Before any write, audit every existing entry in the Design-bugs group and re-verify it still stands, exactly as bug-hunt's §4.5 step-0 audit requires. Audit only the Design-bugs group.
* Never edit, renumber, or remove entries in the code severity / hygiene / testing / Leads groups. This skill owns only the Design-bugs group.

## Read order

Start with the repo guidance and source-of-truth rules.

Read:

1. `CLAUDE.md`
2. all path-scoped rules in `.claude/rules/*.md` — enumerate the directory fresh and read every rule; the set changes, so never trust an embedded list
3. the `.claude/skills/*` procedures (this skill, `bug-hunt`, and any domain skill bearing on the area under review)
4. `PROJECT_SUMMARY_CONCISE.md`
5. `IMPLEMENTATION_PLAN.md`
6. `docs/USER_STORIES.md`
7. `docs/DESIGN_DECISIONS.md`
8. `docs/DATA_GOVERNANCE.md`
9. `docs/DATA_MODEL.md`
10. per-service file-header JSDoc (the service contracts)
11. `docs/TESTING.md`
12. `docs/DEVOPS_GUIDE.md`
13. `docs/MIGRATION_PLAN.md`
14. `legacy_data/CLAUDE.md`
15. `ifpa/BYLAWS.md`, `ifpa/IFPAMembershipStructure_2026.md`, `ifpa/ArticlesOfIncorporation.md`, `ifpa/rules/**` — required before any finding touching membership tiers, Active Player status, voting eligibility, or published rules; the governing documents `docs/USER_STORIES.md` defers to as the authority of record.

This full read-order applies to a comprehensive design audit. For a scoped ask, read only the subset that bears on the request (see Scaling and budget).

Then inspect parity and deployment artifacts as design evidence:

* `package.json`
* `tsconfig.json`
* Docker files
* Docker Compose files
* Terraform files
* GitHub Actions workflows
* deployment scripts and runbooks
* environment templates
* production/staging config documentation
* database schema
* seed data contracts
* adapter interfaces
* service and view-layer contracts (JSDoc + view-layer rule)
* route catalogs or route discovery scripts
* test scripts and CI commands

Do not perform a code-first review. Use code and deployment artifacts only as evidence for:

* current implementation status when docs claim it
* environment parity
* artifact availability
* service/view boundary enforcement
* testability
* schema/design alignment
* runtime source-of-truth assumptions
* deployment/cutover risk

## Scaling and budget

Scale depth to the request. The full read-order, the two-pass loop, all sixteen phases, the 30-scenario tabletop, and the dryness loop apply to an explicit comprehensive design audit.

For a narrowly scoped ask ("design-review the migration plan", "check parity for SES/S3", "is the voting design testable"), read only the docs and artifacts that bear on it, run only the relevant phases, and state in the scope declaration which phases you skipped and why. Do not read all 18 docs and every infrastructure artifact for a scoped question.

Stop when a marginal pass stops producing verified findings, not on an arbitrary count. If a run is going long, surface what is covered so far and let the maintainer decide whether to continue rather than silently grinding through every phase.

## Scope

In scope:

* all user stories, not just completed stories
* all roles and personas in the user stories
* all success criteria
* all negative/edge cases implied by success criteria
* design decisions and settled rationale
* contradictions between design decisions and user stories
* contradictions between migration plan and design decisions
* contradictions between the page services' JSDoc or view-layer rule and user stories
* contradictions between service contracts (JSDoc) and user stories
* contradictions between data governance and data model
* missing service contracts for required user-story behavior
* missing view/page contracts for required user-story behavior
* missing lifecycle states
* missing authorization rules
* missing privacy rules
* missing audit rules
* missing test requirements
* missing operational runbooks
* missing failure behavior
* migration/go-live/cutover design
* final export and write-freeze design
* legacy archive boundaries
* legacy data source retirement after go-live
* dev/staging/prod parity
* Docker/Terraform/deployment artifact parity
* email, DNS, Stripe, S3, CloudFront, SES, backups, rollback, and observability design
* production bugs that would happen because future code has to guess

**Gate on undelivered work:** the scope above includes undelivered stories, but only their *design quality* (ambiguity, contradiction, unsafety, unverifiability, missing acceptance criteria) is in scope. "This story isn't built yet" is out of scope by definition (for what counts as built or deployed, see the deployed-surface enumeration rule, `.claude/rules/deployed-surface.md`). If a candidate finding reduces to "the feature does not exist yet," discard it. The hunt never proposes building an unbuilt feature.

Out of scope by default:

* Python legacy pipeline implementation correctness
* raw SQL dump parser bugs
* low-level TypeScript implementation defects
* browser QA
* visual polish
* wording/style preferences
* implementation progress tracking unless a doc claims a design is already implemented
* refactoring suggestions without production-risk evidence

Migration design is in scope.

Legacy migration Python code is out of scope unless the human explicitly says otherwise.

## Definition of a design bug

A design bug exists when at least one is true:

1. A user story requires behavior but the success criteria do not make the behavior testable.
2. A user story requires behavior but no service, view, schema, governance, or test contract supports it.
3. A design decision settles a principle but leaves a production-critical edge case unspecified.
4. Two canonical docs conflict.
5. A future implementer would have to invent business rules.
6. A role, authorization boundary, or trust boundary is unspecified.
7. A state transition is missing, ambiguous, or unsafe.
8. A lifecycle lacks failure, retry, cancellation, expiry, rollback, or dispute behavior.
9. A privacy or data-governance rule is missing for PII, legacy data, exports, logs, notifications, audit trails, public pages, search, or admin views.
10. A service JSDoc or view-layer contract omits behavior required by the stories.
11. A design assumes data quality that the migration plan does not prove.
12. A migration rule has no validation gate.
13. A go-live rule has no rollback or freeze rule.
14. A dev/staging/prod difference could create production-only behavior.
15. Docker, Terraform, CI/CD, environment variables, or adapters could diverge from the documented design.
16. Testing standards do not require deterministic checks for a design-critical invariant.
17. Observability, backup, restore, or incident response is insufficient for the feature's risk.
18. A legacy data source is expected to remain useful after go-live without a clear source-of-truth handoff.
19. A retained legacy service or subdomain creates unclear auth, cookie, TLS, CSRF, data, mail, or DNS behavior.
20. The design does not say who decides an unresolved governance or operational policy.

## Severity rubric

Use this severity scale.

### P0

Likely go-live blocker or production-critical design flaw.

Examples:

* identity linking can attach a member to the wrong legacy identity
* credentials, password hashes, secrets, or raw PII could be exposed or imported
* inbound or outbound email could be lost at cutover
* production and staging can use materially different adapters
* rollback cannot be performed safely
* role/authorization model allows privilege escalation
* payment/tier design can grant or revoke membership incorrectly
* voting anonymity, integrity, or eligibility is underspecified
* no source-of-truth handoff after go-live for a critical data domain

### P1

Must resolve before final export, cutover, or first real users, but not necessarily architecture-threatening.

Examples:

* missing validation gate for final migration counts
* ambiguous admin workflow for member disputes
* missing Stripe webhook idempotency acceptance criteria
* missing S3/CloudFront retention rule for user media
* missing staging smoke test for critical user journey
* unclear club/group distinction in one feature area

### P2

Should resolve before v1 or explicitly accept as risk.

Examples:

* unclear edge case for dormant clubs
* missing negative test requirement
* incomplete page contract (service JSDoc) for a future page
* missing operational owner for a low-frequency admin workflow

### P3

Post-launch cleanup or documentation hardening.

Examples:

* non-blocking traceability improvement
* minor terminology drift that is unlikely to cause wrong behavior
* useful but nonessential runbook clarification

## Source-of-truth hierarchy

Use the authority order and read order in root `CLAUDE.md`; do not restate them here. `docs/DATA_GOVERNANCE.md` is mandatory before any finding touching members, historical persons, search, auth, contact fields, exports, stats, or privacy. Treat legacy data and pipeline outputs as migration evidence, never as authority.

When two sources conflict, classify the conflict as a finding rather than silently choosing one.

The IFPA governing documents (`ifpa/BYLAWS.md`, `ifpa/IFPAMembershipStructure_2026.md`, `ifpa/ArticlesOfIncorporation.md`, `ifpa/rules/**`) are the authority of record for membership policy, tiers, Active Player status, voting eligibility, and published rules content, ranking above `docs/USER_STORIES.md`, which defers to them. A design doc that contradicts them on membership or voting is a design bug detectable now, classified by severity, not a missing decision to route to the IFPA board. Reserve the board-decision bucket for questions the governing documents genuinely leave open.

One rule this skill adds, because it is go-live-specific and `CLAUDE.md` does not state it: after go-live the platform database and live application are the source of truth for production state. Legacy feeds, mirror data, the preliminary legacy data dump, raw SQL backups, and curated CSVs are migration inputs and audit evidence only, never a retained runtime source, unless a canonical design doc explicitly defines a retained legacy source. Flag any design that implies continuing runtime dependency on migration inputs after go-live.

## Required working method

Run these phases in order (for a scoped ask, run only those that bear on it). Each phase's full method is in this skill's `REFERENCE.md`; read the relevant phase there before running it.

- **Phase 0 — Load and declare scope.**
- **Phase 1 — Build design surface inventory.**
- **Phase 2 — Build traceability matrix** (all user stories in scope, including undelivered ones, subject to the undelivered-work gate).
- **Phase 3 — Requirements-quality sweep.**
- **Phase 4 — Design-layer security and privacy threat model** (STRIDE-per-element over reconstructed data-flow diagrams, LINDDUN GO for privacy, misuse cases over every user story; attack trees as an optional drill-down).
- **Phase 5 — Service contract sweep.**
- **Phase 6 — View-layer sweep.**
- **Phase 7 — Data model and data governance sweep.**
- **Phase 8 — Migration and go-live design sweep** (legacy feeds/mirror/dump/CSVs are pre-go-live inputs, never post-go-live runtime sources of truth).
- **Phase 9 — Dev/staging/prod parity sweep.**
- **Phase 10 — Testing and verification sweep.**
- **Phase 11 — Scenario simulation** (adversarial tabletop over the required scenarios).
- **Phase 12 — Cross-document contradiction sweep.**
- **Phase 13 — Missing-decision classification** (one owner per unresolved issue).
- **Phase 14 — Active refutation** (try to disprove each candidate before recording it).
- **Phase 15 — Second-pass role review** (re-run through the reviewer personas).
- **Phase 16 — Dryness loop.**

## Finding format

Each finding must use this format:

```markdown
### DBH-###: <short title>

- Severity: P0 | P1 | P2 | P3
- Category: <one category>
- Owner: legacy-site webmaster / IFPA / project maintainer / Technical design / Testing / DevOps / Migration / Bug-hunt follow-up
- Status: New | Confirmed | Contradicted | Needs human decision | Needs validation
- Scope: User story | Design decision | Service contract | View-layer | Data model | Migration | DevOps | Testing | Cross-doc
- Evidence:
  - `<path>`: <section/line/function/table/artifact summary>
  - `<path>`: <section/line/function/table/artifact summary>
- Design bug:
  <What is wrong or missing in the design?>
- Why it could survive to production:
  <How competent implementation could still produce wrong behavior because the design is incomplete/contradictory?>
- Refutation attempted:
  <Where you looked to disprove it and why it still stands>
- Recommended fix:
  <Specific doc/design/test/parity/migration update>
- Verification:
  <How to prove the fix works>
- Blocks:
  Go-live | final export | cutover | email switchover | staging parity | v1 feature | post-launch
```

Use stable IDs in the `DBH-###` sub-sequence:

* `DBH-001`, `DBH-002`, etc.

Do not reuse a retired `DBH` id and do not renumber. Do not use vague titles like "Review needed."

## Category taxonomy

Use these categories where possible:

* Requirements ambiguity
* Missing acceptance criteria
* Missing negative case
* Cross-document contradiction
* Missing service ownership
* Missing view contract
* Missing data-governance rule
* Missing schema/data-model rule
* Role/authorization gap
* State-machine/lifecycle gap
* Identity/legacy-claim risk
* Club/group distinction risk
* Payment/tier/status risk
* Voting integrity/anonymity risk
* Media/archive boundary risk
* Migration source-of-truth risk
* Post-go-live source-of-truth risk
* Cutover/rollback risk
* Email/DNS risk
* Dev/staging/prod parity risk
* Docker/runtime artifact risk
* Terraform/infrastructure drift
* Testing/verification gap
* Observability/ops gap
* Security/threat-model gap
* Privacy/PII exposure risk
* Admin workflow gap
* Governance decision gap
* Future implementation ambiguity

## Report format

Use the report structure in this skill's `REFERENCE.md`: executive summary; scope and evidence (read / inspected as design-parity evidence / explicitly out of scope / not inspected); source-of-truth and traceability summary; findings by severity (P0–P3); cross-document contradictions; missing decisions grouped by owner (legacy-site webmaster factual / IFPA board governance / project-maintainer / technical design); traceability matrix gaps; migration and go-live design risks; dev/staging/prod parity risks; testing and deterministic verification gaps; negative findings; and recommended next prompts.

## Question discipline

Ask a question only when blocked. Follow `.claude/rules/asking.md`: plain self-contained English, no internal codes the human was not given, one recommended answer made the default so a bare "y" takes it.

When asking, use this format:

```markdown
I need one decision before continuing.

Evidence:
- ...
- ...

Question:
<one precise question, self-contained>

Recommended answer:
<the single answer the sources support, and why; research it from the authoritative source rather than leaving it open. This is the default a bare "y" accepts.>

Load-bearing assumptions:
<the assumptions behind the recommendation, so a wrong one can be corrected first>

Why it matters:
<what downstream analysis depends on it>
```

Do not bundle multiple questions.

## What not to record

Do not record:

* grammar/style complaints
* merely incomplete implementation
* missing code for a future story when the design is clear
* issues already explicitly documented as accepted non-v1 scope with no production risk
* duplicate findings
* speculative risks with no evidence
* Python legacy pipeline implementation details
* browser-rendering observations
* refactors
* "could be nicer" suggestions
* anything that will not matter after go-live

## Design-specific high-risk checklist

Always check these project-specific risks; the full checklist is in this skill's `REFERENCE.md`, grouped by: identity and onboarding; membership, tiers, and flags; clubs; groups and committees; events and results; voting; media and archive; email, DNS, and retained legacy; freestyle and curated media (design layer); and DevOps and parity.

## Final instruction

Be adversarial, systematic, and evidence-grounded.

The best output is not a long list of worries. The best output is a verified set of design bugs that would plausibly become production bugs unless the canonical docs, design decisions, service/view contracts, migration plan, testing standards, or deployment/parity rules are corrected.

Start by loading the required docs for the requested scope and building the design surface inventory.
