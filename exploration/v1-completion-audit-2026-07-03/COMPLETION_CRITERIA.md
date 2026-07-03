# Freestyle encyclopedia V1.0 — completion criteria by subsystem

Audit date 2026-07-03. Every criterion is objective ("what must be TRUE before this
subsystem is complete"), and each is marked **MET** or **OPEN** against the state
verified today: the live database (`database/footbag.db`), the mounted route surface
(`src/routes/publicRoutes.ts`), the generated content modules, and the doctrine
directory. Numbers cited were measured this run, not copied from prior documents.

Baseline measured state: 962 trick rows (922 active, 40 retired), 379 aliases, 35
registered modifiers, 204 record rows over 165 distinct record names, 409 published
community tips across 115 tricks. Of the 922 active tricks: 896 carry operational
notation, 912 carry parser-computed ADDs, 21 carry a flagged (non-exact) ADD
mismatch, 205 carry the three coaching fields, 886 are `expert_reviewed` and 36
`curated`. The observational universe holds 2,460 names (510 published canonical
names over 507 distinct structures; 1,945 observational names; 971 intake rows on
the nine-state Emerging Vocabulary ladder). 27 freestyle templates, all reachable;
zero orphan routes or services; 119 freestyle integration test files plus 30 unit
files, zero skipped tests.

The four foundational-page editorial criteria (landing, learn, about, history page
prose quality) are owned by the sibling deliverable
`PHASE1_FOUNDATIONAL_EDITORIAL.md` in this directory and are not restated here.

---

## 1. Dictionary browse views (`/freestyle/tricks` + `?view=` surfaces)

- [MET] Every browse view (`add`, `family`, `category`, `component`, `dex-count`,
  `movement-system`, `sets`, `topology`) renders from the shared card partial and is
  covered by route tests (the card-uniformity contract is mechanically tested).
- [MET] `?view=emerging` 302-redirects to `/freestyle/observational` (EV is excluded
  from canonical browse; canonical-incomplete rows stay visible with an INCOMPLETE
  badge).
- [MET] Family view renders the curated display tiers (family parents + Minor
  Lineages band) including the Down umbrella from the 2026-07-02 ruling.
- [MET] Zero orphan browse templates; every `?view=` reachable from the view
  switcher.
- [OPEN] The family browse view links into a `/media/browse?context=` gallery like
  the trick page does (tracked in `IMPLEMENTATION_PLAN.md`, "Link the remaining
  freestyle pages to their galleries").

## 2. Trick detail pages (`/freestyle/tricks/:slug`)

- [MET] Universal shell (`trick-shell.hbs`): notation card, About, structural-facts
  block, below-fold reference; slot-ownership model (Family owns same-family
  progression; Related is conceptual-neighborhood only; Structural Neighbors is
  cross-base kin) shipped and pinned by tests.
- [MET] Alias-aware slug resolution with 301 redirects; unknown slug 404s;
  operator-shaped slugs redirect to the operator surface.
- [MET] Record badges, reference-media gallery link, community tips (collapsed,
  labelled as community advice, never doctrine), pronunciation chips.
- [MET] Coaching fields (`execution_summary` / `learning_notes` /
  `prerequisite_notes`) populated for the targeted most-read set: 205 tricks
  covered, which meets the stated ~200-page target.
- [OPEN] Four tricks are deferred for Technique Notes with recorded unblock
  conditions (atomic_reverse_guay, paradox_whirling_swirl, quantum_guay,
  quantum_legover) — complete when each carries source-grounded notes or is
  confirmed unsourceable and delisted (IP item exists).
- [OPEN] 26 active tricks carry no operational notation (the "unknown-notation"
  batch in the curator working order). Complete when each has notation or a
  recorded reason it cannot (for example ADD-authority-only rows under the
  Jani-Walker precedent).

## 3. Family pages and hierarchy

- [MET] `/freestyle/families/:slug` is mounted (param route before the catch-alls),
  renders `family-detail.hbs` for first-class parents, 404s on unknown slugs;
  `/freestyle/families` redirects to `?view=family`. NOTE: `IMPLEMENTATION_PLAN.md`
  still lists "Build the Family Pages MVP" as an open Dave item — the route, view,
  controller and service shaper exist, so that item is stale or nearly closable;
  verify its remaining done-conditions (sitemap entry, minor-lineage 404, route
  tests) and close it.
- [MET] Display-tier roster (`freestylePublicFamilies.ts`, `freestyleFamilyTiers.ts`)
  including the Down umbrella; display layer never mutates canonical `trick_family`.
- [OPEN] One authoritative home for family definitions: `glossaryFamilyCards` is
  still authored independently of the public-families/tier rosters (de-dup fix 4 in
  `exploration/glossary-dedup-proposal-2026-07-02/PROPOSAL.md`). Complete when card
  kind/tier fields derive from the roster modules.
- [OPEN] Ownership handoff recorded: with family pages shipped, the glossary
  families section becomes gloss-plus-link per the de-dup ownership matrix.

## 4. Operators page (`/freestyle/operators`)

- [MET] `freestyleOperatorReference.ts` is the single authority for intermediate
  operators' ADD, structure, and X-Dex, mirrored by
  `freestyle/inputs/noise/trick_modifiers.csv`; doctrine docs link to it and never
  duplicate values.
- [OPEN] Tier-1 body-operator definitions have no declared single authority: the
  operator board/index modules, the glossary, and `symbolicModifierEducation` each
  author them (de-dup fix 1; the fix design must pick the Tier-1 authority first).
- [OPEN] Four operators on the Red queue lack structural definitions (blazing,
  flailing, slapping, blistering) — their ADDs are evidenced; complete when each has
  a definition, an ADD-authority-only note, or an EV park (see
  `RED_DEPENDENCY_AUDIT.md`).

## 5. Modifiers (modifier detail pages, `/freestyle/modifier/:slug`)

- [MET] Authored teaching pages render `modifier-family.hbs`; data-driven stubs
  render `modifier-stub.hbs`; authored sets 301-redirect to their Set Encyclopedia
  page; unknown slugs 404.
- [MET] Modifier pages deep-link glossary terms via term anchors (de-dup fix 5,
  mostly shipped).
- [OPEN] The Modifier Reference block remains render-disabled on public pages by
  explicit decision; V1 needs a recorded final call: re-enable (with human
  approval) or delete the dead render path. Shipping disabled-but-present code
  indefinitely is neither.

## 6. Set Encyclopedia and compositional sets

- [MET] Four-surface model shipped: `/freestyle/sets` (index),
  `/freestyle/sets/:slug` (detail, anti-enumeration), `/freestyle/sets/reference`
  (flat Holden table), `/freestyle/compositional-sets` (compositional hub).
- [MET] Eight sets authored on the frozen teaching template (Stepping reference
  implementation plus Pixie, Fairy, Whirling, Swirling, Floating, Surfing, Warping);
  Zulu/Weaving example sections auto-derive from modifier links.
- [OPEN] Five queued sets pass the platform-canonical gate but are not authored:
  Atomic, Miraging, Quantum, Barraging (Furious), Nuclear (IP deferred item, resumed
  for settled sets).
- [MET] Gate-held concepts (Sailing, Shooting, Railing, Rooted, Splicing) documented
  as cross-references, not pages.
- [OPEN] Set-definition ownership: the glossary timing-sets section still authors
  set definitions independently (de-dup fix per ownership matrix — becomes gloss +
  link).
- [MET] Quantum/Miraging kept distinct with mutual cross-links noting the open
  merge question (parked in IP by design).

## 7. Glossary (`/freestyle/glossary`)

- [MET] Twelve-section architecture live; term anchors support deep links;
  cross-surface `.glossary-*` CSS primitives; contributor thanks-roll preserved as
  the sanctioned exception to the no-individual-names rule.
- [OPEN] The glossary template is a 2,435-line hand-authored monolith
  (`glossary.hbs`) carrying independently-authored copies of the ADD table
  (~fix 2), notation tokens (~435 hardcoded lines, fix 3), family cards (fix 4),
  and Tier-1 operator definitions (fix 1). Complete when each duplicated kind is
  generated from its owning module or reduced to gloss-plus-link, with
  byte-identical-render (or reviewed-diff) regression oracles as the proposal
  specifies.
- [OPEN] Glossary section 12 of the V5 synthesis is deferred; either ship it or
  record it as post-V1 by decision (currently ambiguous).

## 8. Notation reference

- [MET] The long-form notation article (`/freestyle/notation-article`,
  `jobsNotationArticle.ts`) is live with sanctioned authorship attribution; the
  trick-notation partial renders tokens without redefining them.
- [OPEN] Token definitions authored three times (glossary hardcoded section,
  operators' inline vocabulary, the article) — complete when one token module feeds
  all three (de-dup fix 3, the largest slice).
- [OPEN] The notation article and the symbolic-notation surfaces are not linked from
  the landing page's primary banners (see Navigation below).

## 9. ADD accounting

- [MET] `/freestyle/add-analysis` renders from `freestyleAddAnalysisContent`;
  external-source ADD framings (68 PassBack divergences) surface explicitly via
  `freestyleAddDisagreements.ts` rather than silently absorbing PB numbers.
- [MET] Parser-computed ADDs populated for 912/922 active tricks; all 21
  adds-versus-computed mismatches carry a non-exact `add_formula_status`
  (`approximate` / `policy_dependent`) — no silent mismatch exists.
- [OPEN] The 21 flagged mismatches concentrate in two known parser gaps (the
  swirl-suffix chassis, 15 rows, and the blurry family, 5 rows): complete when the
  parser handles them or the approximate status is the recorded permanent answer.
- [OPEN] The glossary's hardcoded ADD-accounting table must derive from
  `freestyleAddAnalysisContent` (de-dup fix 2).

## 10. Topology and movement neighborhoods

- [MET] `?view=topology` (movement neighborhoods) populated from operational
  notation, never `trick_family`; the Flying neighborhood is the canonical browse
  surface for airborne body-component tricks.
- [MET] Topology audits validated the architecture (refine-not-restructure);
  histogram modules (`freestyleTopologyHistograms.ts`) feed cards.
- [OPEN] The Movement Systems completeness audit (one coherent taxonomy pass over
  Alpine, Zulu, Weaving, Tapping and peers) is parked in the IP; V1 must either run
  it or record it as post-V1 — the current state (Flying has a neighborhood, its
  peers surface only via Family/ADD) is an accepted asymmetry only if written down.

## 11. History page (`/freestyle/history`)

- [MET] The page exists with a two-phase narrative, eras, media panels, and is
  linked from the landing.
- [OPEN] The curator working order explicitly queues "the history rewrite"; the
  editorial criteria live in the sibling `PHASE1_FOUNDATIONAL_EDITORIAL.md`.
- [OPEN] The landing history band shows three public "Coming soon" tiles (History
  Timeline, Historical Milestones, Evolution of Vocabulary,
  `src/views/freestyle/landing.hbs` lines 209-217). V1 criterion: no public
  "Coming soon" placeholders — build each tile's target or remove the tile.

## 12. Media and galleries

- [MET] Media hub (`/freestyle/media`), per-trick reference galleries
  (`/media/browse?context=<slug>`), named galleries (TT Series content in the
  named-gallery system, PassBack Beginner/Advanced, BAP era galleries with 72
  clips), tag invariant enforced by QC loaders.
- [OPEN] The family browse view, the freestyle landing, and `/freestyle/media`
  itself do not yet link into context galleries (IP gallery-links item).
- [OPEN] Sole-survivor's only demo video went private; its page has no demo until a
  curator sources a replacement (IP item; note the additive records loader means
  the fix lands on a fresh DB build).
- [OPEN] The PassBack compound difficulty tags (`#passback_advanced` /
  `#passback_beginner`) are a tracked deviation; complete when split into source +
  difficulty tags with the two visible galleries preserved.
- [OPEN] BAP clips carry no per-trick tags (needs a human viewing pass; recorded as
  intentional — confirm it is accepted for V1).

## 13. Records and leaders

- [MET] `/freestyle/records` and `/freestyle/leaders` live; 165 distinct record
  trick names, resolution alias-aware including positional records under the
  ratified mapping; the three "Unique N-Dex/N-ADD" categories correctly badge
  nowhere.
- [OPEN] About ten record names still badge nowhere, all blocked on named human
  decisions (six with Red: Solestice, Double Dyno, Double Whip, Toe Spinning Toe,
  Blink, Stepping Ducking Blurry Whirl; five-plus-one with the curator: the
  same-side positional records and Pixie DSO). V1 criterion: each unresolved record
  is either resolved or the records page states honestly that some historical
  record names do not map to dictionary entries.
- [MET] Consecutive-kicks records loaded (loader 11); read-only limitation
  post-launch recorded in the IP deferred section.

## 14. PassBack integration

- [MET] The PB corpus is in the observational universe (170 PB-sourced rows), the
  ADD-divergence layer (68 rows) is published on add-analysis, and the intake
  matcher is non-destructive and deterministic.
- [OPEN] The staged PassBack dictionary intake (sets and pixie compounds from the
  video corpus) remains blocked on its recorded open questions; V1 does not require
  promotion (EV parking is the governed outcome) but requires the staging area's
  disposition to be recorded in the exploration go-live pass.
- [OPEN] The difficulty-tag split (Section 12) and the record-name residuals
  (Section 13) are the two PB-adjacent deviations that must close or be
  re-accepted.

## 15. Observational universe / Emerging Vocabulary

- [MET] Generator emits the nine-state ladder (`evState`), finer `holdKind`, and
  orthogonal flags directly in the data; the render-time `classifyFrontier`
  override is deleted (zero references in `src/`); page tiles and counts read the
  generated fields. The generator-cleanup spec
  (`exploration/emerging-vocab-generator-cleanup-spec-2026-07-01/SPEC.md`) is
  implemented in substance — mark it superseded/graduated.
- [MET] Ladder populated and internally consistent: 971 intake rows; doctrine holds
  split into named gates (blurry 64, cross-body-rake 12, repeated-operator 4,
  terraging 2); 67 undefined-operator rows across 16 tokens; sums verified this
  run.
- [OPEN] Two rows sit in `authoring` state for operators the Red queue lists as
  undefined (Arctic Butterfly, Arctic Whirl) — reconcile: either arctic has a
  usable reading and the queue entry narrows, or the rows belong in
  `undefined_operator` (see `RED_DEPENDENCY_AUDIT.md`).
- [MET] EV is excluded from canonical browse and clearly framed as
  non-authoritative on `/freestyle/observational`.

## 16. Tracked names

- [MET] `freestyleTrackedNames.ts` (1,424 lines) generated by
  `build_tracked_names_content.py`; regenerated with the universe (both stamped
  2026-07-03).
- [OPEN] Regeneration is a manual dev-time step not wired into any rebuild or CI
  check; V1 criterion: a count-sync/regeneration freshness check exists (a test
  that fails when the generated stats disagree with the DB), or the manual step is
  documented as the accepted procedure in the generator README.

## 17. Aliases

- [MET] 379 alias rows; alias-aware detail resolution and record matching;
  positional identity by side-configuration doctrine consolidated in
  `freestyle/doctrine/POSITIONAL_IDENTITY.md` with the resolver safety invariant
  (never auto-collapse multi-component).
- [OPEN] Held alias cases with recorded owners: the atomic-pickup rebind (curator),
  POD-versus-Dimmier (curator video viewing), Kiwi (contradiction), plus the
  ambiguous multi-component same-side records on the positional curator worklist.
  V1 ships with these held; criterion is that each held case is listed in exactly
  one live queue (the Red queue or the positional worklist), not scattered.

## 18. Parser

- [MET] `parse_freestyle_notation.py` populates `structural_parse_json` +
  `computed_adds` inside `run_freestyle.sh`; bracket-count-equals-ADD verified per
  promoted row; approximate statuses honest (Section 9).
- [OPEN] 108 EV rows are classed `parser` (parser limitation); the cross-body-rake
  drain (~47 slugs per the queue; 12 currently gated as `crossbody_rake_base`)
  waits on the xbd-rake base ruling. Not a V1 gate (EV parking), but the parser
  limitation classes must stay visible on the EV page.
- [OPEN] `scripts/reset-local-db.sh` omits the parser-population step (known
  footgun; David-owned script). Criterion: the rebuild path a developer actually
  runs leaves no empty diagnostic panels, or the gap is documented where the
  developer will see it.

## 19. Generators and pipeline

- [MET] `run_freestyle.sh` is self-contained (committed inputs, no live fetch, no
  `legacy_data/` reads), idempotent with the documented records-loader exception,
  with the trick-dictionary QC as a hard gate.
- [MET] Content generators (universe, tracked names) documented as manual dev-time
  steps.
- [OPEN] The records loader's additive exception means record edits require a fresh
  DB build; acceptable if documented at every point a curator would edit records
  (currently documented in `freestyle/CLAUDE.md` and the IP item; verify the
  curator-facing doc says it too).

## 20. Tests

- [MET] 119 freestyle integration + 30 unit test files; zero skipped; browse-card
  uniformity, glossary structure, cross-links, and notation cohorts all pinned.
- [OPEN] Roughly 120 freestyle test files carry delivery-epoch labels in body
  comments and `describe` text (IP de-epoch item), and eight test files embed doc
  or section references the test-comment rule forbids (IP strip-references item).
  V1-of-the-repo criterion, not user-facing.

## 21. Documentation

- [MET] `freestyle/doctrine/` holds the seven-document doctrine of record with a
  clear authority relationship; `docs/DATA_MODEL.md` documents
  `freestyle_trick_tips`; the IP carries the freestyle plan with a curator-set
  working order.
- [OPEN] The post-refactor pipeline doc-sync (a PRE-KANBAN IP item) has not run:
  prose across root/subtree CLAUDE.md files, skills, rules, and migration/data-model
  docs still describes pre-refactor layouts and loader numbers.
- [OPEN] Stale IP entries found this audit: the Family Pages MVP item (shipped —
  Section 3) and the EV generator-cleanup substance (shipped — Section 15). The
  plan-of-record must match reality before it seeds the kanban board.

## 22. Navigation and information architecture

- [MET] Freestyle is a single top-level nav entry; the landing groups sub-surfaces
  into "The Language of Freestyle" and "Higher-level analysis"; zero orphan pages
  (inbound-link census re-validated this run: all 27 templates reachable).
- [OPEN] Five mounted surfaces are reachable only through in-page contextual links,
  not from the landing banners: `/freestyle/notation-article`, `/freestyle/learn`,
  `/freestyle/progression/walking-family`, `/freestyle/compositional-sets`,
  `/freestyle/sets/reference`. Decide per surface: promote to a banner tile, keep
  as deliberate contextual-only depth (record the decision), or retire.
- [OPEN] The three "Coming soon" history tiles (Section 11).

## 23. Internal tools

- [MET] No freestyle surfaces under `/internal/` (correct per the internal-only
  constraint); curator media authoring lives under the admin router; internal QC
  is stripped from production images (tracked deviation).
- [MET-BY-DECISION] There is no in-app trick-dictionary editor; the dictionary is
  read-only in production and grows only by pipeline rebuild. This is a recorded
  parked item (source-of-truth cutover pattern planned). V1 criterion: the
  limitation is stated in the go-live scope decision, not discovered after launch.

## 24. Doctrine directory

- [MET] Seven documents present, each with a clear job; promotion governance
  principle stated once (README); operator values never duplicated (link to
  `freestyleOperatorReference.ts`); consumed exploration packets carry banners.
- [OPEN] Doctrine docs cite exploration paths as evidence homes (DOWN_FAMILY,
  OPERATOR_DERIVATIONS, MIRROR_RULE, POSITIONAL_IDENTITY each point into
  `exploration/`); the exploration go-live disposition must keep those citations
  valid or move the evidence into `freestyle/` (the "consolidation architecture"
  step in the curator working order).

## 25. Red rulings ledger

- [MET] `RED_RULINGS.md` summarizes rulings in force with per-row provenance
  delegated to the CSVs; supersession method stated; curator adjudications
  distinguished from Red answers.
- [OPEN] The ledger's pointer to raw transcripts lives in the frozen
  `legacy_data/inputs/curated/tricks/` while active row provenance lives in
  `freestyle/inputs/curated/tricks/` — correct today, but the consolidation step
  should confirm the frozen path survives the legacy freeze as a readable archive.

## 26. Curator doctrine (promotion governance)

- [MET] The governance principle (minimize NEW expert judgment; burden of proof on
  keeping a case blocked; EV parking is a correct outcome; frequency is evidence
  never authority; every derivation records its proof) is written once in
  `freestyle/doctrine/README.md` and demonstrably practiced
  (OPERATOR_DERIVATIONS proofs, the 2026-07-02 reduction audit, the curator
  micro-ruling session).
- [OPEN] The Red queue's row counts have drifted from the current universe (blurry
  ~43 stated vs 64 EV rows now gated) — maintenance criterion: counts in the queue
  are either verified-current or stated as of a named audit (details in
  `RED_DEPENDENCY_AUDIT.md`).

## 27. Repository organization

- [MET] The freestyle pipeline is self-contained under `freestyle/`
  (inputs/loaders/scripts/doctrine); build artifacts gitignored.
- [OPEN] The exploration go-live disposition (an explicit IP item): ~101 live
  dated directories plus ~90 archived, with the IP and three skills citing exact
  files inside them; V1-of-the-repo requires the promote/archive/relocate plan
  executed with references repointed in the same change.
- [OPEN] The freestyle skills trim (IP item): the oversized skill (858 lines) and
  the two CI allowlist exceptions in `scripts/ci/assert_claude_harness.sh` (the
  oversize waiver and the dangling club-leadership-surface reference waiver) must
  be deleted with the trim.
- [OPEN] Disk and hygiene debt inventoried in `TECH_DEBT.md` (59 gitignored DB
  backups ~2.5 GB, zero-byte DB stragglers, committed `__pycache__`, the
  scraped-CSV twin).

## 28. Subsystems discovered beyond the given list

- **Search** (`/freestyle/search` + `/suggest`): [MET] server-rendered no-JS
  results plus JSON typeahead; single-consumer suggest endpoint is by design.
- **Symbolic-grammar surfaces** (`/freestyle/learn`,
  `/freestyle/progression/walking-family`): [MET] mounted and DB-backed via loader
  26; [OPEN] the broader symbolic-grammar UI rollout is parked awaiting approval —
  V1 must state whether these two pages are the V1 scope of that rollout.
- **Insights / Competition / Partnerships / About** editorial pages: [MET] live;
  insights truthfulness pass shipped; [OPEN] competition rules buttons wait on
  official IFPA rules wording (external blocker, tracked).
- **Community tips**: [MET] recovered, classified, display-only; unresolved buckets
  preserved non-public with a review artifact.
- **Landing "by the numbers"**: [MET] histogram tiles driven by generated counts;
  [OPEN] covered by the tracked-names freshness criterion (Section 16).
