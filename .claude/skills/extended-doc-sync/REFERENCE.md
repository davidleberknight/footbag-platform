# Extended Doc Sync — detailed phase reference

Detailed reference for the extended-doc-sync skill, factored out of SKILL.md to stay under
Anthropic's 500-line ceiling; SKILL.md's Process overview points here for the full method of
each phase.

## Process

Use read-only commands only. For a scoped ask, run only the phases that bear on it.

### Phase 0: Scope declaration
State: this is `extended-doc-sync`; findings-only chat report; no files written;
comprehensive or scoped (and which phases are skipped if scoped); Python legacy pipeline
excluded unless the user included it; browser QA excluded; raw PII excluded.

### Phase 0.5: Mechanical pre-pass (read-only greps)
Run cheap, high-yield, mechanically detectable checks before the manual reading, so the
saturating hygiene classes surface every run instead of by luck. These feed the taxonomy
categories below; apply the aggregation rule (Severity rubric) so high-count patterns do
not bury substantive findings.
- **Banned stale-language tokens** across canonical docs: `Last updated:`, `as of <date>`,
  bare dates in headers, `(deferred post-sprint)`, `pending team review`,
  hard-coded credentials, demo/preview identifiers, and team names outside the docs that
  doc-governance permits them in. Treat `currently` / `now` as candidates only: a hit is
  drift solely when it describes build, deploy, or implementation status; the same word
  describing a domain state (a member's status, a club a person currently belongs to) is
  ordinary prose, not drift. Exempt `IMPLEMENTATION_PLAN.md` (carrying status is its purpose)
  and any local-only operator-notes file from the stale-language and `Last updated` checks.
- **Broken internal references**: extract every `docs/…`, `ifpa/…`, `scripts/…`,
  `legacy_data/…` path and every `§N` cited target from the docs and confirm each exists or
  resolves; a reference to a missing file or absent section is a finding.
- **Locator-and-comment hygiene**: run the four detectors in Phase 11.
State in the scope declaration that the pre-pass ran and summarize its counts.

### Phase 1: Re-derive the deployed surface
Re-derive the deployed surface following the deployed-surface enumeration rule
(`.claude/rules/deployed-surface.md`): do not trust existing lists; derive it fresh from
`src/app.ts` and `src/routes/**`, and keep a scratch inventory in context (do not write it
to the repo). Additionally reconcile the sitemap (`src/services/siteMetaService.ts` —
the hand-maintained `STATIC_PUBLIC_PATHS` plus the DB-derived collectors) against the public,
indexable route surface: a public page missing from the sitemap is drift, because the static
list does not auto-discover routes (only entity-detail pages are DB-derived).

### Phase 2: Classify every user story
For each story in `docs/USER_STORIES.md` (and any deployed technical feature without a
story id), classify it using the taxonomy in the deployed-surface enumeration rule
(`.claude/rules/deployed-surface.md`). A future story is not a mismatch merely for lacking code; it is
a mismatch only when a doc, README, plan, test, or route name implies it is deployed. The
`designed-not-deployed`, `future`, and `documented-deferred` buckets are status facts for the
classification table; they never become findings (Hard constraint 8).

### Phase 3: Deployed-story conformance (docs vs code)
For each complete- or partial-deployed story, check each success criterion against code,
tests, schema, and the service and view-layer contracts (JSDoc + view-layer rule). Check whether `IMPLEMENTATION_PLAN.md`
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
DATA_GOVERNANCE / TESTING; DD vs DATA_MODEL / `.claude/rules` /
DEVOPS_GUIDE / MIGRATION_PLAN; `.claude/rules` + service JSDoc vs actual services/routes; TESTING vs scripts/CI;
DEVOPS_GUIDE vs Terraform/Docker/deploy scripts; MIGRATION_PLAN vs onboarding/claim/club/
email/DNS docs; PROJECT_SUMMARY / PROJECT_SUMMARY_CONCISE and README vs current state;
DIAGRAMS and GLOSSARY vs DD / DEVOPS_GUIDE / service JSDoc / Terraform). Look for: same term
different meaning, same rule different default, same route different path, same service
different owner, same page different visibility, same status different state machine,
current-state language in canonical docs, permanent-design language in IP-only deviations.

**Diagram and glossary reconciliation (mandatory).** Architecture diagrams (`DIAGRAMS.md`,
including ASCII-art boxes and their captions) and glossary entries (`GLOSSARY.md`) routinely
assert a control, service, worker, managed service, or edge protection as *present* that a
decision doc has since deferred, removed, or never built (e.g. an edge firewall, a queue, a
cache, a region). Enumerate every named element in each diagram and glossary entry and
reconcile it against the authoritative decision doc (`DESIGN_DECISIONS.md`), the service JSDoc
and `.claude/rules`, and infra (`terraform/**`, `docker/**`). When a control's existence is decided one way in a
decision doc and drawn/defined the other way in a diagram or glossary, that is a finding,
not a stylistic nicety. The same fact stated in five places means five places to drift.
Critically, infra (`terraform/**`, `docker/**`) is current-state evidence, NOT design
authority: a diagram that matches the decision doc's FINAL design but that current infra
has not built yet is an implementation deviation (record in `IMPLEMENTATION_PLAN.md`) or
future work, NEVER a diagram/glossary finding. Only when the diagram/glossary contradicts
the decision doc's final design itself is it a doc finding. Do not "fix" a final-design
diagram down to current infra.

### Phase 6: Service contract and view-layer sync
Per-service file-header JSDoc vs `src/services/**`, `src/adapters/**`, controllers, `src/db/**`,
schema, tests: JSDoc ownership / required-pattern / invariant / side-effect claims that no
longer match the service, controller business logic where the JSDoc says service-owned, a
service whose contract has drifted from its JSDoc. `.claude/rules/view-layer.md` and each page service's JSDoc page contract vs `src/routes/**`,
controllers, `src/views/**`, public-route tests: route/path/page-key mismatch, missing view-model
shape where required, template deriving domain logic, sensitive-page rendering rule missing from
code/tests. Also `.claude/skills/*` procedures vs the current code and conventions they describe, and the
contract-bearing rules by name (`adapter-conventions`, `controller-conventions`, `db-layer`,
`db-write-safety`, `template-conventions`, `service-layer`, `comments`, `script-secret-safety`)
vs the services, adapters, controllers, db layer, and templates they govern. For each named
DD architectural pattern (the adapter set `SesAdapter` / `JwtSigningAdapter` /
`MediaStorageAdapter` / `BallotEncryptionAdapter` / `SecretsAdapter`, service-owned shaping,
the view-model boundary, db-write-safety), check that DD, the matching rule, the service
JSDoc, and the code still describe the same pattern; a divergence among the four homes is
drift to report with its direction.
For every behavior, identifier, boundary, or contract the deployed code establishes, grep the full
`.claude/rules/*` and `.claude/skills/*` set for the matching term and report any clause that still
states the superseded behavior as drift. A stale sentence buried in an otherwise-current rule or
skill drifts silently: reading the file for context does not by itself surface it, so the grep is
mandatory, not optional.

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
`docs/MIGRATION_PLAN.md`, `legacy_data/CLAUDE.md`, `IMPLEMENTATION_PLAN.md`,
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
team-member names where governance forbids them, and stale section/route/service names. Flag obscure references standing in for readable prose:
a bare gate ID, section number, finding code, state number, or item number used in place of the
thing's name or a self-contained description (per the plain-words rule in
`.claude/rules/doc-governance.md`). Numeric and code locators rot as docs are edited and sections
renumber; recommend replacing each with the durable section title or feature name plus a short
description. The gate-index table, whose rows are labelled by ID, is the structural exception. Do
not run a web link checker unless asked; this is repository-internal sync.

Run these four mechanical detectors (read-only greps) and confirm each survivor by direct
inspection (Hard constraint 9). A numeric doc locator is a latent stale reference: it points
at the right place only until a renumber, with no compile-time signal, so treat the saturated
cases as drift risk, not decoration.
1. **Bare doc-internal locators.** Find `(see|per|in|under|from) §N` not immediately paired
   with a parenthetical title or descriptive clause. A bare `per §19` is the defect; a
   paired `§19 (the go-live cutover sequence)` is fine. Category: obscure-reference-for-prose.
2. **Doc references inside code comments.** Apply `.claude/rules/comments.md`, which is
   narrower than "no doc references in code", so this detector does NOT fire on every `§N`.
   In `src/` and `scripts/`: a doc PATH (`docs/<file>.md`, `see <file>.md`, `exploration/…`)
   is always a violation; a bare section shorthand (`DD §x`, `US §x`) is a violation ONLY when
   it substitutes for the explanation (the comment is just the pointer, with no self-contained
   reason beside it). A bare shorthand sitting beside a complete self-contained explanation is
   tolerated and is NOT a finding. In `tests/` the rule is stricter: any doc, section, or
   finding reference (`DD §`, `US §`, `DATA_GOVERNANCE §`, a `*.md` filename, a `B##` id) is
   forbidden outright. Also exclude a file documenting its own internal structure with its own
   section markers (self-reference, not an external-doc pointer). A bare `§N`-in-comment grep
   overcounts severalfold, so confirm every candidate against this rule before recording it,
   and never flag a tolerated locator. Category: forbidden reference pattern.
3. **Sprint/slice/temporal code comments.** Grep code comments for `slice`, `sprint`,
   `phase N`, `for now`, `temporary`, `as of <date>`, `TODO`, `FIXME`, `HACK`; a genuine
   deviation comment must read `Current:` / `Target:`, never "for now". In freestyle, curated-
   media, and legacy_data pipeline code, `phase` / `stage` / `slice` routinely name real
   pipeline stages, not delivery sprints, so treat hits there as candidates needing the
   owner's domain judgment, never mechanical findings; that code is the historical-pipeline
   maintainer's to clean, so route it to the implementation plan rather than rewording it
   here. Category: forbidden reference pattern / stale claim.
4. **Stale comment vs code.** A comment naming an identifier, route, or behavior the code no
   longer has is a stale comment; the detector-2/3 hits plus the identifier grep already run
   for rules and skills surface the candidates. Category: stale implementation claim.
This skill reports these and counts them; it never authors the replacement wording.
Conversion to a title or prose is downstream `doc-sync` work.

### Phase 12: Active refutation
Before recording any finding, try to prove it false. Search all relevant terms and alternate
names. Check `IMPLEMENTATION_PLAN.md` for an accepted deviation, doc-governance for the rule,
whether the doc is design-intent vs status, whether the story is future/not-deployed, whether
the code is a bootstrap stub, whether the issue is purely an implementation defect (belongs
to `bug-hunt`) or a design-spec defect with a needed fix (belongs to `design-bug-hunt`) or a
narrow surgical doc-sync case, and whether it is already documented as unresolved. For every
survivor, re-open the cited file(s) and confirm the exact current text by direct inspection in
this run (Hard constraint 9); a candidate that cannot be reproduced from the file itself is
dropped, not recorded. Discard any candidate whose only substance is a not-yet-built feature
(Hard constraint 8). Record only confirmed survivors.

### Phase 13: Second pass and dryness loop (comprehensive mode)
Re-read finding titles by perspective (requirements engineer, doc maintainer, backend/view
developer, test/DevOps maintainer, privacy/security reviewer, migration reviewer, future
volunteer). Re-search each key noun. Check for duplicate findings, accidental
recommendations, accidental who-is-right assertions beyond the documented authority order,
and PII/secret leakage. State whether the final two passes produced no new candidate, or
that the audit did not reach dryness.
