# Semantic Notation + Compositional Formula Refinement — Audit & Report

**Date:** 2026-05-23
**Slice scope:** Parts 1-2 landed as code; Parts 3-5 below are audit
deliverables (read-only inventory); Part 6 is the synthesis report.
**Posture:** transparency, not promotion. No Holden-only or observational
entry is promoted to canonical by this audit; no notation inconsistency
is silently resolved.

---

## Part 1 — Description column refinement (LANDED)

**Code path:** `freestyleService.shapeDictEntry` (3 branches in priority order):

1. Curator-authored compound override → replaces DB description.
2. DB description literally repeats notation (whitespace-normalized,
   case-insensitive) → suppress.
3. Genuine prose → pass through.

**Initial compound override set** (`freestyleSemanticOverrides.ts`):

| Slug | Override |
|------|----------|
| `double-legover` | mirage + legover chain — two consecutive in-direction dex steps from a single set. |
| `blurry` | stepping paradox-whirl structure — two-dex set with a paradox second component. |
| `furious` | barraging extended with a third dex — three-dex chain layering on the high-stepping pattern. |
| `atom-smasher` / `atomsmasher` | atomic mirage composition — atomic set primitive followed by a mirage-class terminal. |

**Suppression scope:** any trick whose DB `description` column matches
its `notation` column literally (modulo whitespace and case) will now
render WITHOUT the "About this trick" prose block. The notation itself
still renders elsewhere on the page; the about block just stops echoing
it. Implementation lives in `isDescriptionRedundantWithNotation()` at
`src/content/freestyleSemanticOverrides.ts`.

**Sample primitives expected to have description suppressed** (per the
user's reported pattern of DB redundancy):

- `illusion` (DB description = `[set] > leggy out dex > op toe` = notation)
- `legover`  (likely; same pattern)
- `mirage`   (likely)
- `pickup`   (likely)
- `whirl`    (likely)
- `swirl`    (likely)
- `butterfly`, `osis`, `toe-stall`, `clipper-stall`, `pickup`, `around-the-world`, `orbit` (likely; per the core-atom registry)

The actual suppression count depends on the DB seed contents; a one-row
inspection on a live DB would confirm. The redundancy gate is
data-conservative: only literal matches suppress.

---

## Part 2 — Reverse-pair transform overlay (LANDED)

**Five curator-locked entries** (`REVERSE_PAIR_TRANSFORMS`):

| Slug | Expression | Base slug |
|------|------------|-----------|
| `illusion`  | rev(0) + mirage           | mirage |
| `pickup`    | rev(0) + legover          | legover |
| `rev-whirl` | rev(0) + whirl            | whirl |
| `rev-swirl` | rev(0) + swirl            | swirl |
| `orbit`     | rev(0) + around-the-world | around-the-world |

**Renders as:** a compact "Transform" line below the canonical JOB
notation, with a shared `REV_ZERO_EXPLAINER` ("where rev(0) reverses the
in↔out dex direction. Hippy / leggy notation supplements are stylistic;
the pair differs only in dex direction once those are normalized.") and
a cross-link to the base trick page.

**Forever-rule locked in the content-module JSDoc** + service-layer
comment:
- rev(0) is the only transform operator currently in use.
- Deliberately scoped to these 5 entries.
- Do NOT mechanically apply to every reverse-direction trick.
- Do NOT introduce additional transform operators without explicit
  curator approval.
- This is an EDUCATIONAL OVERLAY, not a general symbolic algebra layer.

---

## Part 3 — Body / UNS / non-dex primitive coverage AUDIT

For each primitive the user named, current state across content modules:

| Name | Slug | Canonical entry? | Formula? | Source modules | Status |
|------|------|------------------|----------|----------------|--------|
| hop over | (none found) | NO | — | — | **MISSING** — neither slug nor formula found. User notes `inside > jump > clip; body(1) + stall(1)`. |
| walk over | (none found) | NO | — | — | **MISSING** — user notes "similar to hop over structurally". |
| wrap | `wrap` | YES (observational only) | NO | `freestyleTrackedNames.ts` | **OBSERVATIONAL** — entry exists with no notation or formula. |
| rake | `rake` | YES | `swing(+1) + toe(+1) = 2` | `freestyleResolvedFormulas.ts` + `freestyleSymbolicEquivalences.ts` | **CANONICAL** — formula resolved (user's note "no longer treated as unresolved" confirmed). |
| spin | `spin` (as `key` in `freestyleLandingContent.ts`) | partial | — | `freestyleLandingContent.ts`, `freestyleMovementSystems.ts` (axis member) | **AMBIGUOUS** — surfaces as a modifier; standalone primitive treatment partial. User notes "should exist independently as a body primitive/operator". |
| double spin | `double-spin` | YES (kind override) | NO | `freestyleTrickKindOverrides.ts` | **TRACKED** — slug recognized, formula missing. User notes `spin > spin > kick`. Worth resolving. |
| round the world kick | (none found) | NO | — | — | **MISSING** — different from `around-the-world` (the stall version). |
| smear | `smear` | YES | `swing(+1) + toe(+1) + leggy-in-dex = 3` | `freestyleResolvedFormulas.ts` + `freestyleSymbolicEquivalences.ts` | **CANONICAL**. |
| smudge | `smudge` | YES | similar to smear (swing variant) | `freestyleResolvedFormulas.ts` + `freestyleSymbolicEquivalences.ts` | **CANONICAL**. |

**Summary:** 3 canonical (rake, smear, smudge), 1 tracked (double-spin),
1 observational-only (wrap), 1 ambiguous (spin), 3 missing entirely
(hop over, walk over, round the world kick).

**UNS abbreviation policy** (per the user's audit ask):

Two related but distinct usages exist in the codebase:

1. **Operational-notation bracket flag** — `[UNS]` is used as a bracket
   flag inside operational notation strings, marking an "Unusual
   Surface" termination point. Surfaces:
   - Glossary §7 (line 778): documented in the bracket-flag legend.
   - `freestyleTrackedNames.ts`: ~6 entries use `[UNS]` in
     operationalNotation strings (Buttersole, Ricochet, Singularity,
     Double Around the World Heel, Leg-Over Flapper Stall, Miraging
     Pincher).
   - `freestyleService.ts:3153, 3364, 3372`: parser logic recognizes
     `[UNS]` as a +1 ADD bracket flag.

2. **Holden's set-category name** — `UNS` = "Unusual Non-Standard sets"
   as a family heading in `chrisHoldenSets.txt`, covering Finchy /
   Pixie Pinching / Twisted / Snapping / Arctic (sets whose entry
   surface is non-toe / non-clip).

The two usages are **internally consistent** — both refer to
non-standard surfaces / set patterns — but operate at different layers
(operational-notation bracket flag vs Holden set-family heading). No
inconsistency to resolve; documenting the dual usage for future
clarity is the recommendation.

---

## Part 4 — FB.org ingest gap AUDIT

**Mirror state:**
`legacy_data/mirror_footbag_org/www.footbag.org/` exists locally with
the full archive (clubs/, events/, faq/, ffa/, footbag.html, footbags/,
forum/, …). The `newmoves` subdirectory presumably lives deeper.

**Existing ingest infrastructure:**
- `freestyleTrackedNames.ts` already carries entries with
  `formulaProvenance: 'footbag.org'` — these are formula-documented
  observational entries pulled from the mirror.
- Per memory `reference_fborg_newmoves_list`: "elevated 2026-05-14
  (NR-1B verbatim source for pendulum + squeeze descriptions)" — the
  precedent for verbatim citation exists.
- No automated extraction pipeline; ingestion is curator-guided per-row.

**Sample formula-documented-but-unreviewed candidates** (from
`freestyleTrackedNames.ts`, slugs only):

| Slug | Notation source | Provenance | Reviewed? |
|------|-----------------|------------|-----------|
| `buttersole` | yes — FootbagMoves | FootbagMoves | observational |
| `ricochet` | yes — FootbagMoves | FootbagMoves | observational |
| `singularity` | yes — FootbagMoves | FootbagMoves | observational |
| `double-around-the-world-heel` | yes — footbag.org | footbag.org | observational |
| `leg-over-flapper-stall` | yes — footbag.org | footbag.org | observational |
| `miraging-pincher` | yes — footbag.org | footbag.org | observational |
| `toe-blizzard` | yes — footbag.org | footbag.org | observational |

**Specifically named by the user as missing-but-formula-documented:**

| User's name | Platform state |
|-------------|----------------|
| round the world kick | NOT in any module — true gap |
| spin | partial (modifier; not standalone primitive) |
| double spin | tracked slug, no formula |
| walk over | NOT in any module — true gap |
| wrap | observational-only (no formula) |
| miraging legover variants | NOT explicitly listed, but `miraging-pincher` exists in tracked |
| many compound dex chains | observational tracked entries exist; varies |

**Three buckets** (per user's categorization ask):

- **Canonical candidates:** none from this audit — all formula-documented
  fb.org entries currently sit at observational tier.
- **Observational-only:** wrap (no formula), atomic-pickup, fairy-mirage,
  pixie-illusion (mentioned in user's Part 5 list)
- **Formula-documented-but-unreviewed:** the 7 tracked-names entries
  above + toe-blizzard.

**Critical guardrail (per user constraint):** do NOT silently promote.
The audit only surfaces the gap. Curator triage drives any promotion.

---

## Part 5 — Compositional combination AUDIT

User-named compositional patterns + current state:

| Compositional pattern | Current state |
|-----------------------|---------------|
| miraging legover | NOT found in content modules. Structural reading: miraging set + legover terminal. Worth tracking. |
| fairy mirage | `fairy-mirage` slug exists in `freestyleTrackedNames.ts` (observational, no formula) |
| pixie illusion | NOT found by name; Holden's compilation lists "Sailing" as the parenthetical for `TOE > SAME IN [DEX] > OP OUT [DEX] >` = pixie + illusion-class dex |
| atomic pickup | `atomic-pickup` slug exists in `freestyleTrackedNames.ts` (observational, no formula) |
| smear / smudge | BOTH canonical — `freestyleResolvedFormulas.ts` carries both with swing operator |
| toe blur / toe blizzard | `toe-blur` in `freestyleSymbolicEquivalences.ts`; `toe-blizzard` in tracked names with fb.org provenance |
| atom smasher | CANONICAL — multiple module coverage |
| scrambled eggbeater | (pt8 on-hold per memory `project_freestyle_state`) — not formally tracked |

**Pattern observations:**

1. The `<set-primitive> + <core-atom>` chain pattern surfaces
   repeatedly: fairy + mirage, atomic + pickup, miraging + legover,
   pixie + illusion. Most appear at the observational tier; few have
   resolved formulas. This is a natural promotion lane if the curator
   chooses to formalize the pattern.
2. The `toe + <set-modifier> + <base>` pattern (toe-blur, toe-blizzard)
   appears at both canonical and observational tiers; the platform
   already has the symbolic vocabulary to track these.
3. Holden's compilation provides parenthetical decompositions for
   several of these (Sailing = Pixie Illusion; Frantic = pixie-quantum;
   Terraging = Double Pixie) that aren't yet reflected in the platform.
   The Phase 2c compositional-sets audit covers these in detail.

**Goal stated by user:** "highlight reusable structural patterns
rather than isolated trick memorization." The audit identifies the
patterns; promotion is a curator decision.

---

## Part 6 — Synthesis report

### What landed (Parts 1-2)

| Surface | Change |
|---------|--------|
| Description suppression | Service-layer redundancy gate at `shapeDictEntry`. Primitive tricks with DB descriptions matching their notation now render without the "About" prose block. |
| Compound semantic descriptions | 5 curator-locked entries: double-legover, blurry, furious, atom-smasher, atomsmasher (alias). Override replaces the DB description. |
| Reverse-pair transform overlay | 5 entries (illusion, pickup, rev-whirl, rev-swirl, orbit) render a compact "Transform" line below the canonical JOB notation. |
| REV_ZERO_EXPLAINER | Single source of truth in the content module; rendered verbatim on every transform-bearing page. Locked by integration test. |
| Cross-source separation | Layer-separation contract preserved: JOB notation, operational notation, ADD accounting, transform overlay, and About-section description are all distinct surfaces with separate data and rendering paths. |

### Primitive tricks expected to have descriptions suppressed (recommendation)

Subject to live-DB inspection, the following slugs are likely
candidates for description suppression under the redundancy gate:

`illusion`, `legover`, `mirage`, `pickup`, `whirl`, `swirl`,
`butterfly`, `osis`, `toe-stall`, `clipper-stall`, `around-the-world`,
`orbit` (the 12 core atoms) — plus any compound row whose DB description
column literally repeats its notation.

The gate is data-conservative: only literal matches suppress. Anything
else passes through.

### Compound tricks upgraded with semantic descriptions

Five slugs in the initial set: `double-legover`, `blurry`, `furious`,
`atom-smasher` (plus the `atomsmasher` alias). The content module
makes it trivial to add more entries as the curator surfaces them.
Natural next candidates (from the audit work in Parts 3-5):

| Slug | Suggested semantic description |
|------|-------------------------------|
| `mobius` | spinning + torque — rotational body modifier on the gyro-family root. |
| `rake` | swing + toe — swing kick terminating on a toe stall. |
| `smear` | swing + toe + leggy-in-dex — swing kick with a mirage-direction dex. |
| `smudge` | swing variant — swing kick with an alternate-direction terminal. |
| `phoenix` | pixie + ducking + butterfly — uptime set with head-dip body modifier. |

None of these are promoted by this slice — curator approval gates each
addition.

### Proposed transform relationships

The 5 curator-locked entries (illusion, pickup, rev-whirl, rev-swirl,
orbit) are the entire current scope. Future curator-approved extensions
could potentially include:

- Other reverse-direction pairs (e.g., **reverse butterfly** if it
  exists as a canonical row with a clean dex-direction mirror).
- A second transform operator (e.g., `xbody(0)` for cross-body axis
  reversal) IF a clear pedagogical use case justifies it.

Strong recommendation: **do not extend without explicit curator
approval.** The 5-entry scope is a stable editorial overlay; further
growth risks the symbolic-algebra trap the user explicitly warned
against.

### Newly identified fb.org ingest candidates

From Part 4 audit:

- **True gaps** (no platform entry at all): hop over, walk over, round
  the world kick — would need curator-authored canonical rows.
- **Tracked with formula, not promoted**: buttersole, ricochet,
  singularity, double-around-the-world-heel, leg-over-flapper-stall,
  miraging-pincher, toe-blizzard — already in `freestyleTrackedNames.ts`
  with provenance; promotion is curator decision.
- **Tracked without formula**: wrap, atomic-pickup, fairy-mirage,
  pixie-illusion — would benefit from formula extraction from
  fb.org per the NR-1B precedent.

### Notation inconsistencies

1. **Hippy / leggy stylistic supplements** (per user clarification):
   not structural; they don't affect rev(0) transform validity. The
   `REV_ZERO_EXPLAINER` documents this explicitly.
2. **`UNS` dual usage**: the bracket flag `[UNS]` (Unusual Surface)
   and Holden's `UNS` set-family heading (Unusual Non-Standard sets)
   are internally consistent but operate at different layers. No
   inconsistency to fix; documenting the dual usage in a future
   glossary subsection would clarify.
3. **`atom-smasher` ↔ `atomsmasher`**: two slug spellings exist across
   the codebase. The semantic-overrides map includes both as aliases
   for resilience.

### Unresolved tensions

1. **Hop over / walk over / round the world kick** are genuinely
   missing from the platform. Adding them requires DB seed changes
   that interact with `reset-local-db.sh` (David-owned per memory) —
   out of scope for this editorial slice.
2. **`spin` standalone primitive** — the user's note "should exist
   independently as a body primitive/operator" identifies a real
   ambiguity. Currently `spin` surfaces as a modifier; promoting it
   to a standalone primitive would change ontology rules. Defer to a
   curator-led decision.
3. **Compositional-combination promotion lane** — the pattern
   `<set-primitive> + <core-atom>` recurs (Part 5). A systematic
   promotion of these names would be valuable but requires curator
   adjudication per row.

### Risks of overformalization (per user's explicit ask)

1. **rev(0) drift into a general algebra layer.** Mitigated by:
   - Forever-rule in content-module JSDoc.
   - Service-layer comment locking the scope to 5 entries.
   - Integration test asserting the rev(0) explainer verbatim.
   - Public-facing constraint: 5 entries only.
   This is the highest-priority risk. The rule must hold across
   future curator additions.
2. **Compound semantic-description over-curation.** Each new
   `COMPOUND_SEMANTIC_DESCRIPTIONS` entry is editorial work; mass
   automation would dilute the curator-locked discipline. Add entries
   one at a time as they're authored.
3. **Description suppression over-aggression.** The redundancy gate
   currently uses literal whitespace+case-normalized equality. If
   future heuristics (e.g., "description starts with notation +
   trailing prose") are added, they risk suppressing genuine prose.
   The current literal-match gate is the safe floor.
4. **Transform overlay competing with canonical notation.** The CSS
   gives the transform line a secondary visual hierarchy
   (lighter background, smaller text, italic explainer). Future
   styling changes should preserve this hierarchy.

### Recommendations for future parser/algebra work

**Generally: don't.** The slice's explicit intent is "helpful structural
insight, not mathematical formalism for its own sake."

If future work does proceed:

1. **Reverse-pair transform parsing** is the most tempting extension —
   parser could in principle derive `rev(0) + X` from any notation
   string where X exists canonically. Risk: the parser would over-
   apply, and rev(0) would surface on tricks where it confuses rather
   than clarifies (user warned against this). **Recommend against
   parser extension; keep the overlay curator-authored.**
2. **Stylistic-notation normalization** — the hippy/leggy supplements
   could be programmatically stripped to enable cleaner notation
   matching. Useful for the redundancy gate (Part 1) if future
   inspection finds DB descriptions that include stylistic supplements
   but otherwise match notation. **Defer until the literal-match gate
   proves insufficient.**
3. **Compositional-combination detection** — surfacing
   `<set-primitive> + <core-atom>` patterns programmatically. The
   existing `freestyleOperatorReference.ts` lineageNote infrastructure
   already does some of this. **Extension should be content-module-led,
   not parser-led.**

---

## Cross-references

- Code: `src/content/freestyleSemanticOverrides.ts` — content module
- Code: `src/services/freestyleService.ts` — `shapeDictEntry` (Part 1) +
  `getTrickPage.transform` (Part 2)
- View: `src/views/partials/trick-transform.hbs`
- View: `src/views/freestyle/trick-shell.hbs` — partial insertion
- CSS: `src/public/css/style.css` — `.trick-transform-*` blocks
- Tests: `tests/integration/freestyle.semantic-notation-refinement.routes.test.ts`
- Related slice: `exploration/compositional-sets-audit-2026-05-23.md`
  — many Part 4/5 observations originate from the Holden ⇄ platform
  audit work.

— end —
