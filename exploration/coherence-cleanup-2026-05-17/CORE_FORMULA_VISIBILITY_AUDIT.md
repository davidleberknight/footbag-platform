# Core-Trick Formula Visibility Audit

Coherence Cleanup Slice — Phase 1a (2026-05-17). Read-only audit; no code mutated by this document.

## TL;DR

Foundational tricks render visibly **sparser** than the compounds derived from them. The asymmetry is mechanical (CORE_TRICK_SPEC equivalences are empty arrays + most foundational rows have NULL operational_notation), not authoring oversight. Of the 11 landing core-tricks-grid cards, **10 of 11 render as SPARSE** (just `#slug` + `ADD chip`) after Slice X corrective; only `#clipper` shows a formula because Slice X just filled `[set] > clipper`.

The mismatch with advanced compounds is severe: 76/96 compounds carry a chain reading (79%), 16/96 have operational notation (17%), 81/96 have at least one formula (84%). Atoms: 2/55 have chains (4%), 14/55 have op-notation (25%), **only 16/55 have either (29%)**. The bias is structural, not accidental.

## Coverage matrix

| Population | Total | With chain | With op-notation | With either | With neither |
|---|---:|---:|---:|---:|---:|
| Active non-modifier rows | 151 | 78 (52%) | 30 (20%) | 96 (64%) | 55 (36%) |
| Atoms (slug == base or base empty) | 55 | 2 (4%) | 14 (25%) | 16 (29%) | **39 (71%)** |
| Compounds (slug != base) | 96 | 76 (79%) | 16 (17%) | 81 (84%) | 15 (16%) |

## Atom blanks by category

39 atoms render with no formula on any surface. By DB category:

| Category | Count | Examples | Doctrine status |
|---|---:|---|---|
| dex | 10 | mirage, whirl, butterfly, osis, swirl, legover, pickup, illusion, around-the-world, guay, refraction, reverse-drifter | **Wave-2 blocked.** Bare op-notation form for atomic dexes (e.g. is `mirage` rendered as `mirage` or `[set] > op-in dex > toe [del]`?) is doctrine territory; SEMANTIC_COMPRESSION_DOCTRINE notes the locution-level ambiguity. |
| body | 9 | clipper, spin, spyro, flying-inside, flying-outside, double-spin, dragonfly-kick, hop-over, walk-over | **Wave-2 blocked.** Several are themselves operators or entry conditions, not delays. Surface form pending Red ruling on operator-vs-trick boundary (Wave 2 packet item). |
| set | 9 | pogo, rooted, atomic, fairy, furious, pixie, quantum, sailing, shooting | **Wave-2 blocked.** Set modifiers in operator clothing; their standalone-trick rendering is one of the Wave 2 packet's six grammar-level questions. Fairy specifically called out by Red 2026-05-15 as "legit operator vocab" but standalone form unresolved. |
| compound | 9 | surging, butterfly, eclipse, osis, dyno, paradon, ripstein, bullwhip, jani-walker | **Curator-deferred.** These rows have category=compound but slug==base_trick (i.e. they're treated as bases). Need curator decomposition before op-notation can be authored. |
| surface | 2 | knee-clipper, cross-body-sole-stall | **Curator-deferred.** Composite surface names; naming-decision pending. |

**Safe-immediate count: 0.** Slice X corrective already shipped the safe stall/kick atoms (toe-stall, clipper-stall + sole-kick, cloud-kick correction). All remaining blanks are doctrine-blocked or curator-deferred.

## Per-surface visibility

| Surface | Card primitive | Atom rendering |
|---|---|---|
| Landing core-tricks grid | `partials/core-tricks-grid.hbs` (uses `FreestyleCoreTrickCard[]`) | 10/11 SPARSE (only `clipper` has notation) |
| Glossary §10 (foundational tricks) | Same partial, `idPrefix="term-"` | Same as landing (shared shape) |
| Dictionary ADD view | `partials/dictionary-trick-card.hbs` registry density | Atoms with chains or op-notation render formula; blanks show no formula slot (registry density suppresses "Notation pending" pill) |
| Dictionary family view | Same partial | Same per-card behavior |
| Dictionary movement-system view | Same partial | Same per-card behavior |
| Dictionary topology view | Same partial | Same per-card behavior |
| Dictionary category view | Same partial | Same per-card behavior |
| Dictionary component view | Same partial | Same per-card behavior |
| Browse density (separate path) | Same partial, density="browse" | Renders explicit "Notation pending" pill (less elegant) |

The card primitive is already uniform across views (see P1b trick-card consistency audit). The asymmetry is entirely a content-population problem, not a rendering problem.

## Root-cause structural analysis

### Landing / glossary §10
`src/content/freestyleLandingContent.ts` declares `CORE_TRICK_SPEC` with `equivalences: []` for all 11 atoms by design. Per the file's own comment:

> Foundational atoms intentionally render as bare atom (#slug + ADD), matching the "foundational atom feel" the surface promises. Alias resolution still lives in `freestyle_trick_aliases` and the glossary; the landing compact-symbolic surface stays silent.

This was an intentional Phase 2/G design choice (SURFACE-COMPRESSION-REALIGNMENT-1, 2026-05-14): silence on the atoms emphasizes their foundational character. The choice is now in tension with the formula-accountability principle that "every accepted trick should ship with at least one structural reading."

### Dictionary
The dictionary card primitive renders formulas when they exist (chain registry OR operational_notation). For atoms, neither source is populated. The chain registry was designed for compositional readings — atoms have no compositional reading by definition. Operational notation for atoms IS populated where Slice X surveyed safely (stalls/kicks), but blocked elsewhere by Wave 2 doctrine.

## The asymmetry, visualized

A user landing on `/freestyle` and clicking on `#mobius` sees:
- mobius — ≡ gyro torque, ≡ spinning ss miraging osis, ADD 5

Clicking on `#mirage` sees:
- mirage — ADD 2

The compound is structurally legible. The atom it decomposes to is structurally silent. The compound EXPLAINS more than the atom it's built from. This violates pedagogical expectation.

## Recommendations (for Phase 2 synthesis)

This audit feeds the foundational formula strategy (P2). Four candidate approaches surface here:

**A. Add observational structural readings to the chain registry for atoms.** E.g. mirage → "op-in dex [from clip]" as a Layer-3 observational reading with `curatorConfirmPending: true`. This brings atoms into the same chain-rendering surface as compounds. Risk: drift into Wave 2 doctrine; the observational reading may turn out to disagree with Red's eventual ruling.

**B. Authorize the bare-form op-notation for safe dex atoms.** Per the kick-vs-stall convention codified in Slice X, the bare-token form is plausible for dexes too: `mirage` renders as `mirage` (op-token, role=core-family). This is the literal-name-as-symbolic approach. Risk: collides with the policy-class designation if Red rules certain dexes (e.g. mirage) as policy-class structural primitives rather than free-form tokens.

**C. Render an explicit "core atom" label in place of a missing formula.** A small visual badge ("foundational atom") replaces the empty slot. Preserves silence intent while adding visual presence. Risk: cosmetic-only; doesn't restore structural information.

**D. Add a small fixed reading via CORE_TRICK_SPEC.equivalences[].** Populate the 11 landing-card entries with a one-line observational reading drawn from the glossary §3/§4 entries (which DO describe what each atom is). Service-side change only; no DB mutation; no Red dependency. Risk: doctrinally light editorial content.

**Recommendation**: Approach D is the lowest-risk; the readings already exist in the glossary §3 dex definitions and §2 surface definitions. Phase 2 should draft the 11 readings and surface for curator approval before implementing.

## Constraints reaffirmed

- No ontology expansion: no new families, no new categories, no new modifiers.
- No Wave-2 resolutions: bare-form dex/body/set op-notation deferred.
- No ADD changes: this audit only touches presentation-of-formula, never ADD totals.
- No fabricated formulas: every proposed reading must trace to glossary text or curator-authoritative source.
- Four-layer separation: candidate readings live on the editorial layer; the parser layer is untouched.

## Companion deliverables

- `core_formula_gap_report.csv` — 151-row per-trick breakdown with safety class
- `landing_page_formula_gaps.csv` — 11-row landing-card breakdown

## Cross-references

- `feedback_loader_19_family_default` — sibling content-vs-loader gotcha
- `feedback_op_notation_kick_vs_stall` — convention codified in Slice X
- `project_freestyle_core_atoms` — curator-authoritative 12 atoms (orbit not yet in DB)
- `project_red_consultation_state` — Wave 2 packet (six grammar-level questions blocking dex/body/set bare-form notation)
- `project_semantic_compression_doctrine` — locution-level discipline that constrains what can be safely authored
