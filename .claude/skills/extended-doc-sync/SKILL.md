---
name: extended-doc-sync
disable-model-invocation: true
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
implementation-state plan, deployed code, tests, schema, service and view-layer contracts (JSDoc + view-layer rule), and
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
  `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`,
  `docs/DATA_MODEL.md`, `docs/DATA_GOVERNANCE.md`,
  `docs/PROJECT_SUMMARY.md`, `PROJECT_SUMMARY_CONCISE.md`, `docs/DEV_ONBOARDING.md`,
  `docs/DEVOPS_GUIDE.md`, `docs/TESTING.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`,
  `SECURITY.md`.
- **IFPA governing documents** (`ifpa/BYLAWS.md`, `ifpa/ArticlesOfIncorporation.md`,
  `ifpa/IFPAMembershipStructure_2026.md`, `ifpa/rules/**`) are the authority of record for
  membership policy, tiers, Active Player status, voting eligibility, and rules content,
  ranking above the docs that defer to them. A doc that contradicts the IFPA governing
  documents on membership or voting is drift toward the governing document, not the reverse;
  flag it and let the maintainer route any genuine governance change to IFPA.
- **Implementation status** (temporary deviations, accepted shortcuts, active-slice scope)
  lives only in `IMPLEMENTATION_PLAN.md`.
- **Code is authoritative for implemented behavior**, not for design intent (bootstrap
  stubs are not a design signal).
- **Canonical docs depict the FINAL/TARGET design. Current code and infra (`terraform/**`,
  `docker/**`, deploy scripts) are current-state evidence, NOT design authority.** When
  implemented infra/code diverges from a canonical doc, do NOT default to "the doc is
  drifted." Classify every such gap as exactly one of: (a) the doc is genuinely wrong —
  internally inconsistent, or contradicts the actual final design (one canonical doc vs
  another, a diagram vs `DESIGN_DECISIONS.md`); (b) the implementation has truly deviated
  from the final design (a built thing works differently than designed) — a deviation that
  belongs in `IMPLEMENTATION_PLAN.md`, never a reason to "fix" the canonical doc down to
  current reality; or (c) the feature is simply not built yet — future work, not drift
  (Hard constraint 8). Purely descriptive facts a derived doc mirrors from code (a renamed
  identifier, a method signature, a schema column) still follow code and are ordinary
  (a)-type drift. Report the (a)/(b)/(c) classification for every gap and let the
  maintainer decide; the audit verifies and presents, it never silently picks.
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
8. **Not-yet-built is not a gap.** A canonical doc describing intended behavior that is not
   yet implemented is design intent, not drift. A `designed-not-deployed`, `future`, or
   `documented-deferred` classification is a status fact for the classification table only,
   never a finding. Report a not-yet-built feature ONLY when a doc, README, plan, test, or
   route name CLAIMS it is already deployed — and then the finding is the false deployment
   claim, not the missing feature. Never record "feature X is documented but not built" as
   drift; that is the project's normal forward design, tracked outside this audit.
9. **Code-verify every finding in this run.** Before recording any finding, open the actual
   file and confirm the exact path, line, and current text yourself. Never record a finding
   that rests only on a subagent's paraphrase or summary: if a delegated search surfaced a
   candidate, re-read the cited location and confirm it verbatim, or drop it. A candidate
   whose evidence cannot be reproduced by direct inspection is not recorded.

## Standing rule: research first, one finding at a time

Standing rule for surfacing findings and for any remediation that follows. It overrides any
impulse to batch, or to punt a decision the sources already settle.

1. **Research first — check the repo, not just the docs.** Before raising or remediating a
   finding, re-derive it by direct inspection of the artifacts that actually implement the
   behavior — the running code, the deploy scripts, CI workflows, `terraform/**`, `docker/**`,
   and config — alongside the cited `DESIGN_DECISIONS.md` / `USER_STORIES.md` / `DATA_MODEL.md` /
   `DATA_GOVERNANCE.md` sections and the schema, and apply the documented source-of-truth order
   to decide which side is authoritative. Exhaust the repo before asking: never pose a question
   the code, scripts, schema, or config already answer (for example, read the deploy scripts
   before asking how images ship).
2. **One finding, one verified change at a time.** Surface findings and present remediation
   changes one at a time, each already verified against the repo, and let the maintainer confirm
   one before moving to the next. Never bundle two decisions into one turn, and never attach a
   status recap or a list of other findings to a question.
3. **Context plus a researched recommended answer.** Every question states the finding's sources
   and what each says, the drift direction, and a single explicitly recommended answer the
   research supports — grounded in whichever canonical source the documented source-of-truth order
   makes authoritative for that question (`USER_STORIES.md` for functional behavior and acceptance
   criteria, `DATA_MODEL.md` and the schema for persisted data, `DATA_GOVERNANCE.md` for privacy,
   `DESIGN_DECISIONS.md` for rationale and architecture, the path-scoped rule or service JSDoc for
   contracts, code for implemented behavior), not in current infra or guesswork. Resolve open
   "which way?" questions yourself by following that authoritative source, then recommend; do not
   ask the maintainer to wordsmith what the sources already determine. The canonical asking standard is `.claude/rules/asking.md`.
4. Reserve the question itself for decisions the sources genuinely leave open, or for edits to
   canonical design docs. Where the authoritative source settles it, state the resolution and
   proceed.

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

For a comprehensive audit, read (subset for a scoped ask per Scaling). This list is a
floor, not a closed set: first ENUMERATE every candidate file, then account for each one
in the coverage ledger as read, scoped-out, or not-applicable. Enumerate `docs/*.md`, the
root `*.md` files, every `CLAUDE.md` in the tree, `.claude/rules/*.md`, `.claude/skills/*`,
and `ifpa/**`. A canonical doc, governing document, or subtree contract that exists but is
named nowhere below is itself a coverage gap to record, not a file to skip silently.

1. `CLAUDE.md` plus every per-subtree `CLAUDE.md` (`docs/`, `database/`, `tests/`,
   `freestyle/`, `legacy_data/`, `src/db/`, `src/services/`, `src/public/`) — each states a
   path-scoped contract that overlaps DD, service JSDoc, and the rules; the same rule in
   many places is many places to drift.
2. `.claude/rules/doc-governance.md`
3. `.claude/skills/doc-sync/SKILL.md`, `.claude/skills/bug-hunt/SKILL.md`,
   `.claude/skills/design-bug-hunt/SKILL.md`
4. `PROJECT_SUMMARY_CONCISE.md`
5. `IMPLEMENTATION_PLAN.md`
6. `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`,
   `docs/DATA_MODEL.md`, `docs/DATA_GOVERNANCE.md`,
   `docs/TESTING.md`, `docs/DEVOPS_GUIDE.md`, `docs/DEV_ONBOARDING.md`,
   `docs/MIGRATION_PLAN.md`, `docs/DIAGRAMS.md`, `docs/GLOSSARY.md`,
   `docs/Freestyle_Footbag_Glossary.md`, `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md`,
   `docs/PROJECT_SUMMARY.md`
7. `ifpa/BYLAWS.md`, `ifpa/ArticlesOfIncorporation.md`,
   `ifpa/IFPAMembershipStructure_2026.md`, `ifpa/rules/**` — the governing documents that
   `USER_STORIES.md` and `PROJECT_SUMMARY.md` name as the authoritative source for
   membership tiers, Active Player status, voting eligibility, and published rules content.
8. `README.md`, `SECURITY.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
   `TRADEMARKS.md`

`docs/DIAGRAMS.md` and `docs/GLOSSARY.md` are easy to skip and are exactly where stale
"control X is present" claims hide. Read them, and reconcile every named control, service,
component, edge protection, and term against the authoritative decision doc and infra in
Phase 5. Diagrams (including ASCII-art boxes) and glossary entries are not decorative.

Then inspect as evidence (only as needed to prove sync): `package.json`, test/CI config,
`run_all_tests.sh`, `.github/workflows/**`, `database/schema.sql`, `src/app.ts`,
`src/routes/**`, `src/controllers/**`, `src/services/**`, `src/adapters/**`, `src/db/**`,
`src/types/**`, `src/views/**`, `tests/**`, `docker/**`, Dockerfiles, `terraform/**`,
`ops/**`, deploy scripts, and environment/config templates.

Do not inspect every code line as a bug hunt. Inspect code only to prove deployed behavior
and doc-code consistency.

## Process

Use read-only commands only. For a scoped ask, run only the phases that bear on it. Each
phase's full method is in this skill's `REFERENCE.md`; read the relevant phase there before
running it. The phases in order:

- **Phase 0 — Scope declaration:** state mode (comprehensive or scoped) and exclusions.
- **Phase 0.5 — Mechanical pre-pass:** cheap read-only greps for saturating hygiene classes.
- **Phase 1 — Re-derive the deployed surface** per `.claude/rules/deployed-surface.md`; reconcile the sitemap.
- **Phase 2 — Classify every user story** using the taxonomy in `.claude/rules/deployed-surface.md`.
- **Phase 3 — Deployed-story conformance:** success criteria vs code, tests, schema, contracts.
- **Phase 4 — Canonical-doc internal consistency.**
- **Phase 5 — Cross-document consistency,** including the mandatory diagram and glossary reconciliation.
- **Phase 6 — Service contract and view-layer sync.**
- **Phase 7 — Data model and data governance sync.**
- **Phase 8 — Testing and CI sync.**
- **Phase 9 — DevOps, deployment, and parity sync.**
- **Phase 10 — Migration and go-live sync.**
- **Phase 11 — Terminology and reference sync,** including the four mechanical locator/comment detectors.
- **Phase 12 — Active refutation:** try to prove each finding false before recording it.
- **Phase 13 — Second pass and dryness loop** (comprehensive mode).

## Finding taxonomy

Deployed-story mismatch; partial-deployment ambiguity; story without deployed evidence;
deployed feature without story; success-criteria untestable; missing traceability;
cross-document contradiction; intra-document contradiction; source-of-truth ambiguity;
canonical/current-state leakage; stale implementation claim; stale design claim; service
service-contract drift; view-layer drift; data model drift; data governance drift; testing-doc
drift; CI/script drift; DevOps-doc drift; Docker/Terraform parity drift; migration/go-live
drift; post-go-live source-of-truth ambiguity; terminology/identifier drift; broken internal
reference; forbidden reference pattern; obscure-reference-for-prose (a bare code or number used
in place of a readable name or self-contained description); sensitive-content governance issue;
missing verification evidence; not inspected.

## Severity rubric

Severity is audit impact, not remediation priority.

**Aggregation of systemic patterns.** When a mechanical detector finds the same hygiene
pattern many times (bare `§N` locators, doc references in code comments, stale-language
tokens), record ONE finding per pattern-per-document, with a count and two or three
representative examples, at E3. Do not emit one finding per hit: hundreds of E3 hygiene
rows would bury the E0/E1 findings. A single instance that changes meaning (a broken
reference, a contradicted governance fact) keeps its own finding at its own severity.

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

Ask one question only when blocked after read-only investigation. Follow `.claude/rules/asking.md`: plain self-contained English, no internal codes the human was not given, and one recommended answer made the default so a bare "y" takes it.

```markdown
I need one decision before continuing.
Evidence:
- ...
Question: <one precise question, self-contained>
Recommended answer: <the single answer the sources support, and why; this is the default a bare "y" accepts>
Load-bearing assumptions: <the assumptions behind the recommendation, so a wrong one can be corrected first>
Why this blocks the audit: <what cannot be classified without the answer>
Interpretations (only if genuinely open): A: … / B: …
```

Do not bundle questions. Do not ask the human to do work read-only repo inspection can do.

## Sensitive-data handling

Never include raw emails, phone numbers, addresses, private names from non-public data,
member records, password hashes, tokens, reset links, session values, API keys, secrets,
staging credentials, special login identifiers, or demo-user emails. Use `[redacted-email]`,
`[redacted-token]`, `[redacted-member-id]`, aggregate counts, or table/column/route/service/
test names instead.

## What counts as deployed

See the deployed-surface enumeration rule (`.claude/rules/deployed-surface.md`).

## Final instruction

Be comprehensive, evidence-grounded, and conservative. Do not fix. Do not recommend fixes.
Apply the documented source-of-truth order to report drift direction; classify-without-
resolving only where the repo leaves authority undefined. Write nothing to disk. Start by
declaring scope, re-deriving the deployed surface, and classifying every user story before
recording any finding. Never report a not-yet-built feature as a gap, and record only findings
you have confirmed by direct file inspection in this run.
