# Bug Hunt — documentation-synchronization reference

Documentation-layer method detail for the bug-hunt skill, kept out of SKILL.md to stay
under the 500-line ceiling; SKILL.md Phase E points here. This is the full-surface
doc-to-doc and doc-to-code synchronization method: it finds drift, contradiction, stale
claims, broken references, and terminology divergence across the entire committed
documentation universe. Three of its concerns live elsewhere and are not restated: the
deployed-surface derivation and story classification (SKILL.md Phase B), the service-JSDoc
contract sweep (`REFERENCE.md` §4.4B.8), and refutation/dryness (SKILL.md Phases G and the
stopping condition).

## Contents

- Documentation universe and coverage ledger
- Drift direction: who is canonical, who drifted
- Mechanical pre-pass
- Canonical-doc internal consistency
- Cross-document consistency, including diagram and glossary reconciliation
- Rules, skills, and contract-pattern sync
- Data, testing, DevOps, and migration sync angles
- Terminology and reference sync: the four mechanical detectors
- Sync finding taxonomy
- Aggregation rule for systemic hygiene patterns
- Sensitive-data handling

## Documentation universe and coverage ledger

The universe is enumerated, never assumed: every tracked `**/*.md` (`git ls-files '*.md'`)
plus `.claude/rules/*.md`, `.claude/skills/*`, `ifpa/**`, and the `.github/` templates. The
enumeration reaches beyond the canonical docs: `README.md` and every subtree README,
`SECURITY.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `TRADEMARKS.md`,
the `legacy_data/` docs and runbooks, `docs/DIAGRAMS.md`, `docs/GLOSSARY.md`, the
per-subtree `CLAUDE.md` files (each states a path-scoped contract that overlaps the design
docs, the service JSDoc, and the rules — the same rule in many places is many places to
drift), and every other committed md file.

Account for every file in the coverage ledger as read, scoped-out, or not-applicable. A
doc that exists but is named nowhere in the run is itself a coverage gap. Standing
scoped-out buckets, recorded with their reason rather than silently skipped: the
`exploration/` working corpus (references INTO it from live docs still get the
broken-reference check) and gitignored local-only files (`BUGS.md`, operator notes,
`.local/`).

`docs/DIAGRAMS.md` and `docs/GLOSSARY.md` are easy to skip and are exactly where stale
"control X is present" claims hide. Read them; diagrams (including ASCII-art boxes and
captions) and glossary entries are not decorative.

Also reconcile the sitemap: the hand-maintained static path list in the site-meta service
plus the DB-derived collectors, against the public indexable route surface. A public page
missing from the sitemap is drift, because the static list does not auto-discover routes.

## Drift direction: who is canonical, who drifted

Apply the authority order in root `CLAUDE.md` and the drift-handling rules in
`.claude/rules/doc-governance.md` to classify every gap. Canonical docs depict the
FINAL/TARGET design; current code and infra (`terraform/**`, `docker/**`, deploy scripts)
are current-state evidence, NOT design authority. When implemented behavior diverges from
a canonical doc, do NOT default to "the doc is drifted." Classify the gap as exactly one
of:

- (a) **the doc is genuinely wrong** — internally inconsistent, or it contradicts the
  actual final design (one canonical doc vs another, a diagram vs the decision doc).
  Purely descriptive facts a doc mirrors from code (a renamed identifier, a method
  signature, a schema column) follow code and are ordinary (a)-type drift.
- (b) **the implementation has truly deviated** from the final design — a deviation that
  belongs in `IMPLEMENTATION_PLAN.md`, never a reason to "fix" the canonical doc down to
  current reality.
- (c) **the feature is simply not built yet** — future work, not drift. Not-yet-built is
  reportable ONLY when a doc, README, plan, test, or route name CLAIMS it is already
  deployed; then the finding is the false deployment claim, not the missing feature.

Separate the two questions on every drift: is the FACT drifted, or is the DESIGN drifted?
Report the fact-drift with its direction; never silently assert a design change — a
genuine design conflict is asked as a maintainer question (SKILL.md Phase H). A doc that
contradicts the IFPA governing documents on membership or voting is drift toward the
governing document, not the reverse. Only classify-without-resolving where the repo
genuinely leaves authority undefined, and say so explicitly.

## Mechanical pre-pass

Run cheap read-only greps before the manual reading, so the saturating hygiene classes
surface every run instead of by luck:

- **Banned stale-language tokens** across canonical docs: `Last updated:`, `as of <date>`,
  bare dates in headers, sprint/tracking deferral phrasing, hard-coded credentials,
  demo/preview identifiers, and team names outside the docs that doc-governance permits
  them in. Treat `currently` / `now` as candidates only: a hit is drift solely when it
  describes build, deploy, or implementation status; the same word describing a domain
  state is ordinary prose. Exempt `IMPLEMENTATION_PLAN.md` (carrying status is its
  purpose) and local-only operator notes.
- **Broken internal references**: extract every `docs/…`, `ifpa/…`, `scripts/…`,
  `legacy_data/…` path and every `§N` cited target from the docs and confirm each exists
  or resolves; a reference to a missing file or absent section is a finding.
- **The four locator/comment detectors** below.

## Canonical-doc internal consistency

Per doc: contradictory statements; duplicated definitions with different meanings; stale
current-state language where governance bans it; inconsistent role/entity/tier/route/
service/table names; undefined-then-used terms; success criteria that contradict story
text; requirements too vague to test. Do not record style-only issues unless a canonical
style rule is itself violated.

## Cross-document consistency

Compare every doc cluster where concepts overlap: USER_STORIES vs DESIGN_DECISIONS /
DATA_MODEL / DATA_GOVERNANCE / TESTING; DESIGN_DECISIONS vs DATA_MODEL / `.claude/rules` /
DEVOPS_GUIDE / MIGRATION_PLAN; `.claude/rules` + service JSDoc vs actual services and
routes; TESTING vs scripts/CI; DEVOPS_GUIDE vs Terraform/Docker/deploy scripts;
MIGRATION_PLAN vs onboarding/claim/club/email/DNS material; the project summaries and
README vs current state; DIAGRAMS and GLOSSARY vs the decision doc, service JSDoc, and
infra. Look for: same term different meaning; same rule different default; same route
different path; same service different owner; same page different visibility; same status
different state machine; current-state language in canonical docs; permanent-design
language in plan-only deviations.

**Diagram and glossary reconciliation (mandatory).** Diagrams and glossary entries
routinely assert a control, service, worker, managed service, or edge protection as
present that a decision doc has since deferred, removed, or never built. Enumerate every
named element in each diagram and glossary entry and reconcile it against the decision
doc, the rules and service JSDoc, and infra. A control decided one way in the decision doc
and drawn the other way in a diagram is a finding. Infra is current-state evidence, not
design authority: a diagram matching the decision doc's final design that infra has not
built yet is a deviation or future work, never a diagram finding. Do not "fix" a
final-design diagram down to current infra.

## Rules, skills, and contract-pattern sync

`.claude/skills/*` procedures and the contract-bearing rules (adapter-conventions,
controller-conventions, db-layer, db-write-safety, template-conventions, service-layer,
comments, script-secret-safety, view-layer, testing) are audited against the code they
govern. For each named architectural pattern (the adapter set, service-owned shaping, the
view-model boundary, db-write safety), check that the decision doc, the matching rule, the
service JSDoc, and the code still describe the same pattern; divergence among the four
homes is drift to report with its direction.

For every behavior, identifier, boundary, or contract the deployed code establishes, grep
the full `.claude/rules/*` and `.claude/skills/*` set for the matching term and flag any
clause still stating the superseded behavior. A stale sentence buried in an
otherwise-current rule drifts silently: reading the file for context does not surface it,
so the grep is mandatory.

## Data, testing, DevOps, and migration sync angles

These angles complement the design-layer sweeps in `DESIGN.md` (which ask "is the design
complete and safe"); here the question is narrower: "do the documents and the artifacts
still agree."

- **Data:** DATA_MODEL / DATA_GOVERNANCE vs `database/schema.sql`, `src/db/**`, sensitive
  read/write services, public profile/search/admin/claim routes, and the migration plan:
  member vs historical-person vs legacy-member, public vs private fields, old emails and
  former surnames, audit-log immutability, exports, deletion/retention, tier/payment
  status, announcement opt-in/out semantics.
- **Testing/CI:** TESTING.md and the testing rule vs `package.json`, `run_all_tests.sh`,
  workflows, `scripts/ci/**`, `tests/**`: a documented command that does not exist, CI not
  matching the docs (diff the workflow's actual job list against the docs' claims), a
  claimed deterministic check that does not exist, a check that exists with no doc, tests
  asserting behavior documented nowhere or contradicting canonical design.
- **DevOps/parity:** DEVOPS_GUIDE and the decision doc's DevOps sections vs Dockerfiles,
  compose and committed env files, `terraform/**`, workflows, `.githooks/`, deploy
  scripts, `ops/**` (timer cadence vs documented recovery objectives), config modules, and
  adapter factories.
- **Migration/go-live:** MIGRATION_PLAN, `legacy_data/CLAUDE.md`, IMPLEMENTATION_PLAN,
  governance, claim/onboarding/club stories vs each other and the repo: pre- vs
  post-go-live source-of-truth assumptions, final export, write freeze, validation gates,
  rollback, legacy-credential exclusion, identity mapping, email/DNS transition, retained
  archive scope. The gate-index accuracy/completeness/consistency audit itself is in
  `DESIGN.md` (Migration and go-live design sweep); here, additionally spot-derive cheap
  referenced counts read-only and confirm the plan's release-gate pointers have not forked.

## Terminology and reference sync: the four mechanical detectors

Build a glossary-like scratch map of key terms (member, legacy member, historical person,
claim, auto-link, tier, Active Player, lifetime, Hall of Fame, BAP, club, group,
committee, board, admin, media, gallery, archive, vote, ballot, outbox, adapter, dev,
staging, production, final export, write freeze, rollback, source of truth). Flag two
names for one concept, one name for two concepts, code-vs-docs divergence, and stale
terminology. Do not run a web link checker unless asked; this is repository-internal sync.

Run these detectors read-only and confirm every survivor by direct inspection — a numeric
locator is a latent stale reference: it points at the right place only until a renumber,
with no compile-time signal:

1. **Bare doc-internal locators.** Find `(see|per|in|under|from) §N` not paired with a
   parenthetical title or descriptive clause. A bare `per §19` is the defect; a paired
   `§19 (the go-live cutover sequence)` is fine.
2. **Doc references inside code comments.** Apply `.claude/rules/comments.md`, which is
   narrower than "no doc references in code". In `src/` and `scripts/`: a doc PATH is
   always a violation; a bare section shorthand (`DD §x`, `US §x`) is a violation ONLY
   when it substitutes for the explanation. In `tests/` the rule is stricter: any doc,
   section, or finding reference (including a `B##` id) is forbidden outright. Exclude a
   file documenting its own internal structure with its own section markers. A bare
   `§N`-in-comment grep overcounts severalfold; confirm every candidate against the rule
   and never flag a tolerated locator.
3. **Sprint/slice/temporal code comments.** Grep for `slice`, `sprint`, `phase N`,
   `for now`, `temporary`, `as of <date>`, `TODO`, `FIXME`, `HACK`; a genuine deviation
   comment must read `Current:` / `Target:`. In freestyle, curated-media, and legacy
   pipeline code, `phase` / `stage` / `slice` routinely name real pipeline stages, not
   delivery sprints — treat hits there as candidates needing the owner's domain judgment,
   never mechanical findings.
4. **Stale comment vs code.** A comment naming an identifier, route, or behavior the code
   no longer has. The detector-2/3 hits plus the rules/skills identifier grep surface the
   candidates.

## Sync finding taxonomy

Use these class names for documentation-layer sync findings: deployed-story mismatch;
partial-deployment ambiguity; story without deployed evidence; deployed feature without
story; success-criteria untestable; missing traceability; cross-document contradiction;
intra-document contradiction; source-of-truth ambiguity; canonical/current-state leakage;
stale implementation claim; stale design claim; service-contract drift; view-layer drift;
data model drift; data governance drift; testing-doc drift; CI/script drift; DevOps-doc
drift; Docker/Terraform parity drift; migration/go-live drift; post-go-live
source-of-truth ambiguity; terminology/identifier drift; broken internal reference;
forbidden reference pattern; obscure-reference-for-prose (a bare code or number standing
in for a readable name or self-contained description, per the plain-words rule in
`.claude/rules/doc-governance.md`); sensitive-content governance issue.

## Aggregation rule for systemic hygiene patterns

When a mechanical detector finds the same hygiene pattern many times (bare `§N` locators,
doc references in code comments, stale-language tokens), record ONE finding per
pattern-per-document, with a count and two or three representative examples, at Low
severity. Do not emit one finding per hit: hundreds of hygiene rows would bury the
catastrophic findings. A single instance that changes meaning (a broken reference, a
contradicted governance fact) keeps its own finding at its own severity.

## Sensitive-data handling

Never include raw emails, phone numbers, addresses, private names from non-public data,
member records, password hashes, tokens, reset links, session values, API keys, secrets,
staging credentials, special login identifiers, or demo-user emails in findings or notes.
Use `[redacted-email]`-style placeholders, aggregate counts, or
table/column/route/service/test names instead.
