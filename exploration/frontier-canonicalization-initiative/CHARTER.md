# Frontier Intake & Eagle-Theory Governance — initiative charter

Status: **proposal / charter only. Not started.** Launch reference for the macro-sprint recommended
after the media-ingestion sprint. Design-and-governance scope; nothing here is built. Reversible by
deletion. This is the editorial/ontology track; it touches the parser and canonical dictionary, so
every step is curator + Red-gated.

## Curator clarifications (binding, 2026-05-29)

- **Eagle theory is curator-held knowledge, not repo-backed doctrine.** It is not implemented or
  formally defined. It **requires a curator-authored definition (axioms, worked examples, method)
  before any implementation.**
- **No Eagle-theory intake schema is to be built** until its axioms, examples, and method are
  explicitly captured.
- **Consolidate; do not invent a parallel framework.** The initiative unifies the four existing
  systems — `review_status`, the parser's `add_formula_status`, the `policy_dependent` parser cases,
  and the observational `intakeBucket` — into one reversible frontier-status taxonomy. It does not
  stand up a separate status system alongside them.
- **8/9-ADD support stays future-proofing, not current-data work.** The active canonical set tops out
  at 7 ADD (zero 8/9-ADD rows exist), so 8/9 handling is preparatory governance; current effort
  targets the existing 6/7-ADD outliers.

## Strategic frame

The project's hardest remaining problem is no longer data quantity. It is **compositional correctness,
symbolic-equivalence consistency, parser closure, and ontology stability under extreme compositions.**
8/9-ADD territory is where weak ontology breaks. The goal is the first internally-coherent
compositional ontology of freestyle footbag, not "more tricks."

The discipline: a **staged Frontier Intake Pipeline, never direct promotion.** Outliers flow into
status buckets and earn promotion through adjudication; they do not get added because they exist.

## Grounding: much of this already exists (consolidate, don't reinvent)

The proposed status taxonomy + parser-confidence framework + observational registry are already
present in fragmented form. The new work is unifying them, not building from zero.

| Proposed concept | Already exists as | Gap to close |
|---|---|---|
| Frontier status taxonomy | `freestyle_tricks.review_status` (expert_reviewed/curated/pending) | only 3 values; no frontier/parser_blocked/folklore/theoretical states |
| Parser confidence framework | parser `add_formula_status` (exact_modifier_derived 342 / exact_self_atom 108 / policy_dependent 34 / approximate 20) + `computed_adds` + `structural_parse_json` | already a 4-class confidence model; `policy_dependent` (34) is a de-facto Tier-C queue |
| Tier D observational / folklore / theoretical | `/freestyle/observational` + `freestyleObservationalUniverse.ts`: three-layer ontology + 8-way `intakeBucket` (promotion_ready / doctrine_pending / unresolved_candidate / alias / equivalence / duplicate_variant / low_confidence / doctrine_unresolved) | already the frontier registry; needs the explicit folklore/theoretical labels |
| Equivalence chains | `EQUIVALENCE_TOPOLOGY` / SE chains / `tokenizedEquivalences` | exists; needs adjudication workflow, not new structure |
| Adjudication workflow | Red Husted consultation (Wave 2 open) | exists; formalize as the Tier-B/C gate |

**Implication:** a single reversible **`frontier_status`** content-module taxonomy that maps onto these
existing fields is the spine of the sprint. Do not add a SQL status column while the taxonomy is in
flight (reversible-content governance).

## Two grounding facts that scope the sprint

- **8/9-ADD is currently empty.** Active population tops out at 7-ADD (12 rows); 6-ADD has 42. So the
  sprint is (a) *preparatory* governance for when 8/9 arrives, and (b) adjudication of the existing
  6/7-ADD outliers. It is not a backlog-burn.
- **A parser-frontier queue already exists:** the 34 `policy_dependent` rows are exactly Tier C
  candidates. Start there for the parser-proof workflow rather than inventing a new queue.

## Frontier tier model

- **Tier A — solved + stable** (Eagle-solved, structurally understood, culturally accepted, parser-
  derivable, formula-stable). Fast-track promotion. Examples: stable barrage/superfly/ripstein/ripwalk
  descendants, accepted symposium-gyro compounds, stable double-spinning structures.
- **Tier B — structurally solved, culturally unstable** (competing names, unstable shorthand, unclear
  alias hierarchy, folk-compression collisions). Needs alias governance + equivalence chains + notation
  policy, NOT parser work.
- **Tier C — parser frontier** (unresolved operator interactions, exotic timing, overlapping modifier
  semantics, Eagle edge constructions, weird symposium/no-plant chains, multi-axis ambiguity). Parser-
  first adjudication + structural proof. Do NOT canonicalize quickly. (Seed from the 34 `policy_dependent`.)
- **Tier D — observational / speculative** (forum-era theoreticals, unverified names, unlanded constructs,
  impossible/contradictory formulas, folklore). Stays permanently in the observational layer / frontier
  registry. Never canonical.

## Proposed unified frontier-status taxonomy (reversible TS content module)

`canonical` (stable accepted) · `frontier_stable` (extreme but solved) · `frontier_review`
(adjudication ongoing) · `parser_blocked` (structural ambiguity) · `observational` (recorded,
unresolved) · `folklore` (culturally present, unstable) · `theoretical` (structurally proposed).
Maps onto review_status + add_formula_status + observational intakeBucket; authored as a content
module, not a schema column, until stable.

## Workflows (one per tier)

1. **Fast-track frontier promotion (Tier A)** — sibling/Eagle-derived chassis + ADD-math closure +
   cultural attestation → promote via the existing red_additions/red_corrections + loader-19 path.
2. **Alias / equivalence adjudication (Tier B)** — name-collision resolution into equivalence chains +
   notation policy; curator-ruled, no parser dependency.
3. **Parser-proof workflow (Tier C)** — structural decomposition + bracket-count proof + parser-
   confidence assessment; output is a proof, not a promotion. Surfaces to Red when doctrine-blocked.
4. **Permanent-observational (Tier D)** — record in the observational universe with folklore/theoretical
   labels; explicitly never promoted.

## Eagle-theory intake — BLOCKED on definition

**"Eagle theory" is not documented anywhere in the repo** (the only "eagle" hits are player/record
data). It is curator-held knowledge, not repo-backed doctrine, and **requires a curator-authored
definition before implementation.** No Eagle-theory intake schema is to be built until its **axioms,
worked examples, and method** are explicitly captured. Needed before building the intake:

- What is Eagle theory? Its axioms, derivation method, worked examples, and what "Eagle-solved" means.
- Is there a source corpus (doc, spreadsheet, person, forum thread)?
- The proposed theorem-driven intake (inputs: formula, symbolic decomposition, operator chain, derived
  ADD, equivalent compressions, parser confidence, cultural refs, observed media → outputs: canonical
  candidate / observational / parser-blocked / alias collision / impossible / duplicate-equivalence) is
  recorded as the *target shape*, but the derivation rules are the curator's to supply.

**Do not ingest Eagle-solved tricks one-by-one manually** (the curator's explicit instruction); the
theorem-driven pipeline is the intended mechanism, once defined.

## Structural-proof pages (future capability)

Per-trick proof surface, essential for 8/9-ADD: formula → symbolic decomposition → operator chain →
derived ADD → equivalent compressions → parser confidence → known aliases → observed media. (Curator
example: Ripstein = Ripwalk + spinning-osis resolution → derived ADD 7.) Builds on the existing
trick-detail S5/S9 slots + parser output; a new rendering layer, Dave-adjacent for the public surface.

## Deliverables (when the sprint runs)

frontier status taxonomy · Eagle intake schema (post-definition) · parser-proof workflow ·
equivalence adjudication workflow · outlier queue · solved-vs-unsolved classification · 8/9-ADD intake
staging · parser confidence framework (extend the existing add_formula_status) · symbolic-proof conventions.

## Governance guardrails (binding — this is where ontology projects collapse)

- **No overpromotion, no premature closure.** Outliers earn promotion through adjudication; existence
  is not evidence.
- **No parser overconfidence.** Parser output is a proof aid, not authority; `policy_dependent` stays
  curator/Red-gated.
- **No hardcoded edge cases, no SQL hardening, no parser hardening** in this sprint.
- **Reversible always** (TS content modules / staging over schema). This philosophy is the protection;
  keep it.
- **Frequency is evidence, not authority; observational ≠ canonical** (existing forever-rules).

## Explicit non-goals

Mass promotion. Parser hardening. SQL hardening. Manual one-by-one Eagle ingestion. Building the
public proof-page surface (Dave-track) before the data model is ruled.

## Open inputs / blockers (gather before launch)

1. **Define Eagle theory** (axioms, method, source corpus) — gates the intake schema.
2. Confirm the unified `frontier_status` taxonomy values + their mapping onto existing fields.
3. Confirm Tier-A fast-track criteria (what makes an outlier "Eagle-solved + culturally accepted").
4. Decide whether the 34 `policy_dependent` rows are the Tier-C seed queue.
