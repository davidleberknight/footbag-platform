# Doc Sync: full audit

The method for the `doc-sync` skill's explicit full-audit mode: the mechanical hygiene
detectors across the entire committed documentation universe, run read-only, every
survivor confirmed by inspection, and the result presented for approval under the skill's
change-driven rules (smallest fix, literal before and after, no edit without the human's
word). It finds stale tokens, broken references, locator rot and forbidden reference
patterns. It does not judge whether code and a document disagree about behavior: that is
the `bug-hunt` skill's discrepancy lane, and a hit of that kind is a hand-off.

## Documentation universe and coverage ledger

The universe is enumerated, never assumed: every tracked `**/*.md` (`git ls-files '*.md'`)
plus `.claude/rules/*.md`, `.claude/skills/*`, `ifpa/**` and the `.github/` templates. It
reaches beyond the canonical docs: `README.md` and every subtree README, `SECURITY.md`,
`GOVERNANCE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `TRADEMARKS.md`, the
`legacy_data/` docs and runbooks, `docs/DIAGRAMS.md`, `docs/GLOSSARY.md`, the per-subtree
`CLAUDE.md` files (each states a path-scoped contract that overlaps the design docs, the
service JSDoc and the rules, so the same rule in many places is many places to drift), and
every other committed md file.

Account for every file in a coverage ledger as read, scoped-out or not-applicable. A doc
that exists but is named nowhere in the run is itself a coverage gap. Standing scoped-out
buckets, recorded with their reason: the `exploration/` working corpus (references INTO it
from live docs still get the broken-reference check) and gitignored local-only files
(`BUGS.md`, operator notes, the private operations checkout).

`docs/DIAGRAMS.md` and `docs/GLOSSARY.md` are easy to skip and are where stale "control X is
present" claims hide. Read them; diagram boxes, captions and glossary entries are not
decorative. Also reconcile the sitemap: the hand-maintained static path list in the
site-meta service against the public indexable route surface; a public page missing from
the static list is drift, because the list does not auto-discover routes.

## Drift direction

Apply the skill's "Final design vs implementation deviation" classification to every gap
and the authority order in root `CLAUDE.md`. Canonical docs depict the final design; code
and infrastructure are current-state evidence, not design authority. Separate the two
questions on every hit: is the FACT drifted, or is the DESIGN drifted? Report fact-drift
with its direction; a genuine design conflict is a maintainer question, one at a time.

## Mechanical pre-pass

Run cheap read-only greps before any manual reading, so the saturating hygiene classes
surface every run instead of by luck:

- **Banned stale-language tokens** across canonical docs: `Last updated:`, `as of <date>`,
  bare dates in headers, sprint or tracking deferral phrasing, hard-coded credentials, demo
  or preview identifiers, and team-member names outside the docs that
  `.claude/rules/doc-governance.md` permits them in. `currently` and `now` are candidates
  only: a hit is drift solely when it describes build, deploy or implementation status.
- **Broken internal references**: extract every `docs/…`, `ifpa/…`, `scripts/…`,
  `legacy_data/…` path and every cited section target and confirm each exists or resolves.
- **Bare doc-internal locators**: `(see|per|in|under|from) §N` not paired with a title or
  descriptive clause. A bare `per §19` is the defect; `§19 (the go-live cutover sequence)`
  is fine. A numeric locator points at the right place only until a renumber, with no
  compile-time signal.
- **Doc references inside code comments**, per `.claude/rules/comments.md`, which is
  narrower than "no doc references in code". In `src/` and `scripts/`: a doc PATH is always
  a violation; a bare section shorthand (`DD §x`, `US §x`) is a violation only when it
  substitutes for the explanation. In `tests/` any doc, section or finding reference
  (including a `B##` id) is forbidden outright. Exclude a file documenting its own
  structure with its own markers. A bare `§N` grep overcounts severalfold; confirm every
  candidate against the rule.
  Recipe: `rg -n 'docs/|exploration/|[A-Z_]{4,}\.md|\bDD §|\bSC §|\bUS §' src/ scripts/`
  and `rg -n 'BUG_HUNT|Regression for B[0-9]|\(B[0-9]|\bDD §|\bUS §|docs/|[A-Z_]{4,}\.md'
  tests/`, keeping comment-line hits only. When a rotting reference is a filesystem path the
  code might also read at runtime (`exploration/`, `legacy_data/`, `curated/`), hand it to
  `bug-hunt` as a possible deploy-asset dependency rather than only rewording the comment.
- **Sprint, slice and temporal code comments**: `slice`, `sprint`, `phase N`, `for now`,
  `temporary`, `as of <date>`, `TODO`, `FIXME`, `HACK`; a genuine deviation comment reads
  `Current:` / `Target:`. In freestyle, curated-media and legacy pipeline code, `phase`,
  `stage` and `slice` routinely name real pipeline stages; treat hits there as candidates
  needing the owner's judgment, never mechanical findings.
- **Console logging in application code** (`src/`, excluding `src/testkit/`):
  `rg -n 'console\.(log|warn|error|debug|info)' src/`. Console output bypasses the
  CloudWatch pipeline and the test `logger.error` guard.
- **Em-dash scope**: an em dash is a finding only in user-facing text a site visitor reads
  (the view-layer rule); one in a comment, script or doc file is not.

## Canonical-doc internal consistency

Per doc: contradictory statements; duplicated definitions with different meanings; stale
current-state language where governance bans it; inconsistent role, entity, tier, route,
service or table names; undefined-then-used terms; success criteria that contradict story
text. Do not record style-only issues unless a canonical style rule is itself violated.

## Cross-document consistency, diagrams and glossary

Compare every doc cluster where concepts overlap: USER_STORIES against DESIGN_DECISIONS,
DATA_MODEL, DATA_GOVERNANCE and TESTING; DESIGN_DECISIONS against DATA_MODEL and the rules;
TESTING against scripts and CI; the project summaries and README against current state;
DIAGRAMS and GLOSSARY against the decision doc, service JSDoc and infra. Look for the same
term with different meanings, the same rule with different defaults, the same route with
different paths, the same page with different visibility, current-state language in
canonical docs.

Diagram and glossary reconciliation is mandatory: enumerate every named element in each
diagram and glossary entry and reconcile it against the decision doc, the rules and
infra. A control decided one way in the decision doc and drawn the other way is a finding.
Infra is current-state evidence: a diagram matching the final design that infra has not
built yet is a deviation or future work, never a diagram finding, and is never "fixed" down
to current infra.

## Rules, skills and contract-pattern sync

`.claude/skills/*` procedures and the contract-bearing rules are audited against the docs
that govern the same activity, in both directions: a rule or skill may neither contradict
nor silently drop a doc mandate, and a doc mandate no rule or skill carries is drift.
`testing.md` and `write-tests` against `docs/TESTING.md`; `template-conventions`,
`view-layer`, `controller-conventions` and `add-public-page` against the UI intent in the
stories and decisions; `service-layer`, `db-layer`, `extend-service-contract` and
`add-browse-view` against the contracts in the decisions and data model. For every
behavior or identifier the code establishes, grep `.claude/rules/*` and `.claude/skills/*`
for the superseded term; a stale clause buried in a current rule drifts silently.

## Terminology map

Build a glossary-like scratch map of key terms (member, legacy member, historical person,
claim, auto-link, tier, Active Player, lifetime, Hall of Fame, BAP, club, group, committee,
board, admin, media, gallery, archive, vote, ballot, outbox, adapter, dev, staging,
production, final export, write freeze, rollback, source of truth). Flag two names for one
concept, one name for two, code-versus-docs divergence and stale terminology. No web link
checker unless asked; this is repository-internal.

## Finding taxonomy and aggregation

Class names: stale implementation claim; stale design claim; cross-document contradiction;
intra-document contradiction; canonical/current-state leakage; rule-vs-doc drift;
skill-vs-doc drift; testing-doc drift; CI/script drift; terminology or identifier drift;
broken internal reference; forbidden reference pattern; obscure-reference-for-prose (a bare
code or number standing in for a readable name, per the plain-words rule in
`.claude/rules/doc-governance.md`); sensitive-content governance issue.

When a detector finds the same pattern many times, record ONE finding per
pattern-per-document with a count and two or three representative examples, at Low
severity, so hundreds of hygiene rows never bury a single instance that changes meaning,
which keeps its own finding.

## Sensitive-data handling

Never include raw emails, phone numbers, addresses, private names from non-public data,
password hashes, tokens, session values, API keys, staging credentials, or demo-user
identifiers in findings or notes. Use `[redacted-email]`-style placeholders, counts, or
table, column, route, service and test names instead.
