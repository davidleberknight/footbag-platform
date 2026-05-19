# Notation Normalization Wave -- Final Recommendation

Cross-cutting architectural recommendation for the public freestyle
notation layer, building on the dictionary-coherence stabilization wave
(2026-05-18). Wave goal: clarity before completeness. Reorient the
public surfaces so three different notation systems no longer compete
visually at equal hierarchy.

Grounded in the current-state recon dated 2026-05-18 (see supporting
docs in this directory).

This document is the SPINE. Six supporting docs deep-dive each surface:

1. `notation_normalization_plan.md` -- wave-level plan, sequencing, ROI
2. `core_trick_notation_completion_audit.md` -- E1 atom-by-atom audit
3. `public_notation_render_hierarchy.md` -- E3 + E4 4-tier contract
4. `compound_notation_strategy.md` -- E4 headline + secondary + tertiary
5. `landing_density_cleanup.md` -- E5 landing reorganization
6. `family_ordering_audit.md` -- E7 family + rev-up evidence

The recommendations here are the curator-facing summary. The supporting
docs hold the evidence, line-cited code locations, alternative options
considered, and per-surface implementation sketches.

---

## Executive summary

The notation layer is not architecturally broken. Three notation
systems coexist by design: shorthand compositional ("torque = miraging
osis"), full operational ("[set] > hippy in dex > op toe"), and
executable accounting ("xbody(1) + stall(1) = 2 ADD"). The problem is
that the third leaks too early into public surfaces, and the second is
absent where it should anchor (core trick cards on the `/freestyle`
landing).

The recommendation is a coordinated **re-precedence** pass, not a
deletion. Operational notation gets promoted to the canonical reading
on core trick cards; executable accounting gets demoted to educational
disclosure surfaces (the existing `/freestyle/add-analysis` page +
future trick-detail collapsed `<details>` sections); shorthand
compositional readings retain their place as the elegant headline on
compounds.

The single highest-value change is **E1: populate canonical operational
notation for the 12 core tricks**, which the curator has supplied
verbatim in the wave brief. The supporting `core_trick_notation_completion_audit.md`
maps each verbatim string onto the existing `CORE_TRICK_SPEC` content
module and proposes the minimal-touch authoring path.

The second is **E2: remove the accounting-formula `equivalences[1]`
from `CORE_TRICK_SPEC` for landing-grid rendering**. The curator-authored
formulas survive as metadata, but the public landing card stops
displaying them. Accounting stays accessible via `/freestyle/add-analysis`
and (when shipped) per-trick detail-page `<details>` disclosures.

Three smaller changes accompany them: formalize the 4-tier rendering
hierarchy across all public surfaces (NCR-3); reorganize the landing
page to lead with orientation and only then teach movement language
(NCR-4); expand the dictionary card copy to preview the five (or six)
browse perspectives (NCR-5). Family-ordering audit (NCR-6) is
deliberately audit-only this wave.

All recommendations preserve skill-doctrine invariants: no parser
maximalism, no ontology hardening, no schema mutation, no observational
collapse into canonical, restraint doctrine D (no token soup, no AST,
no interaction-heavy symbolic UI).

---

## Where the executable accounting actually renders (recon-grounded)

Per recon, accounting prose (`xbody(1) + stall(1) = 2 ADD` style)
renders on exactly two public surfaces today:

| Surface | Partial | Source | Tests |
|---|---|---|---|
| `/freestyle` landing -- Core Tricks grid | `src/views/partials/core-tricks-grid.hbs:22-39` | `CORE_TRICK_SPEC.equivalences[1]` in `freestyleLandingContent.ts:138-150` | `freestyle.portal.routes.test.ts:901-934` |
| `/freestyle/add-analysis` -- worked examples | `src/views/freestyle/add-analysis.hbs:57-68` | `FREESTYLE_ADD_ANALYSIS_CONTENT.derivation` | `freestyle.add-analysis.routes.test.ts:200-226` |

Surfaces that do NOT render accounting (recon-confirmed clean):

- `/freestyle/tricks` (ADD, Family, Movement System, Movement
  Neighborhoods, Operators-Components landing card destinations) --
  uses `dictionary-trick-card.hbs` partial; tokenized equivalences
  + op-notation fallback only post-CR-5.
- `/freestyle/glossary` -- semantic term definitions + operational
  notation in §7 onwards, no accounting prose.
- Trick-detail pages (`/freestyle/tricks/:slug`) -- accounting prose
  absent today; future executable-accounting work would land here as
  collapsed `<details>` disclosure per skill doctrine D restraint.

This narrows the surface area of E2 dramatically: the only place to
"remove accounting from public cards" is the `/freestyle` landing's
Core Tricks grid. Everywhere else is already aligned.

---

## Cross-cutting recommendations (six calls -- NCR-1 through NCR-6)

(NCR = "Notation-wave Cross-cutting Recommendation"; distinct
numbering from the dictionary-coherence wave's CR-1 through CR-6.)

### NCR-1. Author canonical operational notation for the 12 core tricks (E1)

The wave brief supplies verbatim notation strings for every core trick:

| Slug | Operational notation |
|---|---|
| `toe-stall` | `[set] > toe` |
| `clipper-stall` | `[set] > clipper` |
| `around-the-world` | `toe > ss(midtime) in dex > ss toe` |
| `orbit` | `toe > ss(midtime) out dex > ss toe` |
| `legover` | `[set] > leggy out dex > ss toe` |
| `pickup` | `[set] > leggy in dex > ss toe` |
| `mirage` | `[set] > hippy in dex > op toe` |
| `illusion` | `[set] > leggy out dex > op toe` |
| `butterfly` | `[set] > hippy out dex > ss clipper` |
| `osis` | `[set] > (downtime) spin > ss clipper` |
| `whirl` | `[set] > leggy in dex > ss clipper` |
| `swirl` | `[set] > leggy (xbd) out dex > ss clipper` |

Recommended authoring path: add an `operationalNotation` field to the
`CoreTrickSpec` interface in `src/content/freestyleLandingContent.ts`;
populate it with the verbatim strings; update the service-shaping
helper for the Core Tricks grid to expose this field; update the
template to render it. Pure content-module work; reversible TypeScript;
no schema migration; no DB write.

Alternative authoring path: populate the `freestyle_tricks.operational_notation`
column for each atom via the curated CSVs (`tricks.csv` /
`red_additions_2026_04_20.csv`). REJECTED for v1 -- the curator-authored
strings live more durably in the TypeScript content module + survive
DB reloads + parallel the `equivalences` structure already there.

Detail in `core_trick_notation_completion_audit.md`.

### NCR-2. Demote executable accounting from public landing cards; preserve metadata + educational surfaces (E2 + E4 tertiary)

Recommended changes:

- **`/freestyle` landing Core Tricks grid**: stop rendering
  `equivalences[1]` (the accounting formula) as a `≡` line. Two paths:
  (A) remove the second equivalence from the template `{{#each
  semanticEquivalences}}` loop; (B) shape only `equivalences[0]` in the
  service helper and pass it through. Path B preserves the curator-authored
  data; path A loses it cosmetically. RECOMMENDED: **path B** + add a
  follow-on optional collapsed disclosure (deferred).
- **`/freestyle/add-analysis`**: UNCHANGED. This page is the curator-
  intended home for accounting derivations; the worked-examples
  surface is educational by design.
- **`CORE_TRICK_SPEC.equivalences[]`** content-module data:
  PRESERVED. Curator-authored accounting formulas survive; only the
  landing card rendering changes.
- **Future executable-accounting work**: lands on trick-detail pages
  as collapsed `<details>` sections per the brief's "tertiary
  disclosure" framing.

Detail in `public_notation_render_hierarchy.md` + `compound_notation_strategy.md`.

### NCR-3. Formalize the 4-tier rendering hierarchy across all public surfaces (E3)

Phase A (CR-5 of the dictionary-coherence wave) established a 2-tier
hierarchy on dictionary cards. The brief's Phase E expands this to a
4-tier hierarchy spanning all public surfaces:

| Tier | Content | Surfaces |
|---|---|---|
| 1 | Symbolic equivalence / shorthand composition (e.g. "gyro torque", "miraging osis", "pixie butterfly") | Headline on compound cards; chain-registry-driven |
| 2 | Full operational notation (e.g. "TOE > OP IN [DEX] > SAME TOE [DEL]") | Secondary on compound cards; primary on core trick cards (NCR-1) |
| 3 | Silent fallthrough | Card renders title + ADD chip only; absence is honest |
| 4 | Executable accounting (e.g. "xbody(1) + stall(1) = 2 ADD") | DETAIL-PAGE collapsed disclosure ONLY; never on browse cards or landing primary surface |

Dictionary cards already follow tiers 1, 2, 3 post-CR-5. The landing
Core Tricks grid currently inverts the brief by rendering tier 4 as a
headline equivalence; NCR-1 + NCR-2 together correct this.

Detail in `public_notation_render_hierarchy.md`.

### NCR-4. Reorganize the landing surface to lead with orientation, then teach (E5)

Per recon, current `/freestyle` landing order:

1. Hero + intro + autoplay demo (lines 26-40)
2. Jump nav (45-50)
3. Portal cards (56-172)
4. Featured demonstrations (179-194)
5. Core Tricks grid (201-206)
6. Basic Components (210-228)
7. Operator Board (237)
8. Get Started tiles (245-255)

The brief's intent: orient first ("where to browse, what the sections
mean"), then teach the movement language. The current order ALREADY
puts portal cards before Core Tricks. The brief's "Move BELOW
menu/Featured, ABOVE Core Tricks" applies to what the brief calls
"The Language of Freestyle Footbag" section. Two readings:

- **Reading A**: The Basic Components + Operator Board block (lines
  210-237) should move UP, between Featured and Core Tricks (so the
  reader sees Components + Operators FIRST, then Core Tricks which
  compose them). This treats Core Tricks as the synthesis after the
  primer.
- **Reading B**: Reverse -- Core Tricks should remain first because
  it's the most concrete; Components + Operators are the abstract
  primer that comes after the user has seen example tricks. Status
  quo.

CURATOR DECISION POINT -- which reading? The supporting doc
`landing_density_cleanup.md` lays out both with mockup-equivalent
section orderings.

Additional density work in the same doc: condense vertical spacing
within Core Tricks, Basic Components, Operators sections (currently
spacious). Pure CSS work; no template restructuring.

### NCR-5. Expand the dictionary card copy on the landing to preview five (or six?) perspectives (E6)

The brief specifies an expanded card body:

> a concise preview of dictionary perspectives:
> - ADD
> - Family
> - Movement System
> - Movement Neighborhoods
> - Observed Tricks

Note: the brief's perspective list omits **Operators & Components**,
the 6th destination on the landing card grid. This is either an
intentional demotion of Operators (which lives on its own landing
portal card AND in `/freestyle/glossary`) or an oversight. Surface
for curator decision.

Recommendation if curator confirms omission is intentional:
the Dictionary portal card body lists only the five "browse"
perspectives. Operators retains its own portal card (current state).
Updated card body copy authored in `freestyleLandingContent.ts`.

If curator restores Operators to the list:
six perspectives in the card body; minor copy expansion.

Detail in `landing_density_cleanup.md` (E5 + E6 group together since
both touch landing prose).

### NCR-6. Audit family ordering + rev-up evidence (E7) -- no taxonomy changes

Per recon, family ordering is curator-driven via the `FAMILY_ORDER`
const at `freestyleService.ts:4004-4067`:

```
['whirl', 'rev-whirl', 'butterfly', 'osis', 'torque', 'blender',
 'mirage', 'clipper', 'drifter', 'legover']
```

Families in the list render first; families NOT in the list render
last in insertion order. Whirl renders first because it's slot 0.

`rev-up` is **explicitly deferred** in `freestyleFamilyOverrides.ts:38-39`
and remains in the whirl family pending curator decision. The Stage A
promotions (rev-whirl, hatchet, mullet) ARE in `rev-whirl` family per
lines 67-69. `rev-up` has no op-notation and no override entry.

Audit-only deliverable: lay out the current state, evidence for and
against rev-up's whirl-family membership, three options (status quo /
own family / dual membership), and the family ordering rationale.
Curator decides; no taxonomy mutation in this wave.

Detail in `family_ordering_audit.md`.

---

## Per-surface recommendations (short form)

| Brief item | Surface | Recommendation | Risk |
|---|---|---|---|
| E1 | `/freestyle` landing Core Tricks grid | Add 12 curator-authored op-notation strings to `CoreTrickSpec`; render as primary | Low (content-module work only) |
| E2 | `/freestyle` landing Core Tricks grid | Drop `equivalences[1]` accounting from grid rendering; preserve metadata | Low (single template/service edit) |
| E3 | All public surfaces | Ratify 4-tier hierarchy; pin contract in supporting doc | Low (documentation; some surfaces already aligned) |
| E4 | Compound trick cards (dictionary + detail) | Headline = compositional shorthand; secondary = op-notation; tertiary = collapsed accounting disclosure (future) | Low (dictionary cards already implement tiers 1+2) |
| E5 | `/freestyle` landing | Density cleanup + (curator-confirmed) section reorder | Low (CSS + optional template move) |
| E6 | Dictionary portal card on landing | Expanded body copy listing perspectives | Trivial (content-module edit) |
| E7 | Family view | Audit-only; surface decision points | Trivial (planning doc only) |

---

## Sequencing (if recommendations are approved)

Implementation order, smallest blast radius first. Each is
independently shippable.

1. **NCR-2** (drop accounting from landing grid). Smallest; one
   template render path + one shaping field change.
2. **NCR-1** (author 12 op-notation strings on core tricks). Adds the
   content; lands the operational primary readings.
3. **NCR-5** (dictionary portal card copy expansion). Content-module
   edit only. Trivial.
4. **NCR-4** (landing density cleanup; possible section reorder).
   CSS cleanup definitely; section reorder pending curator decision
   on which "Language of Footbag" reading is correct.
5. **NCR-3** (formalize 4-tier hierarchy contract). Documentation +
   pinned tests against the dictionary card partial's behavior.
6. **NCR-6** (family-ordering audit). Pure planning artifact; surface
   decision points to curator. No implementation.

NCR-2 + NCR-1 are tightly coupled: NCR-2 removes the accounting line
that NCR-1 then replaces with op-notation. Could land as a single
slice or two; recommendation is single slice (atomic Core Tricks grid
update).

---

## What this wave explicitly does NOT do

Restating the brief's "NOT" list + skill-doctrine-derived prohibitions:

- **No parser maximalism.** No AST views, no token soup on landing,
  no interactive symbolic UI. Doctrine D restraint.
- **No accounting maximalism.** Accounting stays educational; no
  prosely accounting expansion to additional public surfaces.
- **No ontology hardening.** No `trick_family` mutations, no new
  modifier rows, no canonical family migration.
- **No schema mutation.** No DB column add, no migration. All work
  is content-module + template + CSS + tests.
- **No observational/canonical collapse.** Movement Neighborhoods
  and Observed Tricks remain observational with explicit badges.
- **No core-trick set expansion.** The 12 core trick slugs are
  curator-authoritative; not re-litigated.
- **No FM ingestion.** Broader FootbagMoves intake remains deferred
  per the wave brief.
- **No Wave-2 doctrine assumptions.** Blurry transitivity, barraging
  operator class, atomic family X-dex, Fairy weight, compression
  intent, hidden-vs-flat preservation -- all curator-paced and
  Wave-2-gated.
- **No D1-D8 (dictionary-coherence wave) resolution.** Those
  family/neighborhood decisions remain curator-queued.
- **No automated promotion from observational to canonical.**
- **No `coreAtomLabel` rendering re-introduction.** Removed per CR-5;
  stays removed.
- **No symbolic-similarity / distance metric.** Premature; doctrine
  C explicit prohibition.

---

## Out of scope for this planning slice; queued for later

- Executable ADD accounting public rollout (NCR-2 + NCR-3 prepare for
  this but don't ship it).
- Broader FM ingestion (per brief).
- Family taxonomy changes (D1-D8 + rev-up resolution).
- Multi-axis schema migration (post Wave-2 + curator triage).
- Per-trick canonical-vs-observational provenance metadata.

---

## Reading guide for the 6 supporting docs

Each supporting doc follows the same structure as the dictionary-
coherence wave's docs:

1. Current state -- file paths + line numbers
2. Problem evidence -- brief validated against recon
3. Options considered -- alternatives with rejection reasons
4. Recommended approach -- the call this doc makes
5. Implementation sketch -- enough to scope a slice, NOT actual code
6. Curator decision points -- explicit asks
7. Risks and mitigations

Reading order suggested:

1. `notation_normalization_plan.md` first (broader architectural
   framing + sequencing + ROI).
2. `core_trick_notation_completion_audit.md` second (NCR-1; pure
   content authoring; smallest blast radius after the spine).
3. `public_notation_render_hierarchy.md` third (NCR-3; the
   architectural contract that ratifies the wave).
4. `compound_notation_strategy.md` fourth (NCR-2 + E4; headline +
   secondary + tertiary layering for compounds).
5. `landing_density_cleanup.md` fifth (NCR-4 + NCR-5; landing
   reorganization + dictionary card copy).
6. `family_ordering_audit.md` last (NCR-6; audit-only; surfaces
   curator decisions about ordering + rev-up + intra-family).

---

## Curator decisions locked 2026-05-18

The open questions previously surfaced have been answered at session
level. All six supporting docs bake these decisions in; do not
re-debate.

| # | Decision | Choice | Effect on deep dives |
|---|---|---|---|
| 1 | **E5 reading** | **A.** Move the "Language of Freestyle Footbag" teaching section BELOW Featured and ABOVE Core Tricks. First orient with portals, then examples, then teach structure. | `landing_density_cleanup.md` specifies the section move in detail; status-quo Reading B rejected. |
| 2 | **E6 perspective list** | **Include Operators & Components**, but framed as "supporting vocabulary," not as a dictionary browse mode. (Brief omission was an oversight.) | `landing_density_cleanup.md` provides the expanded card body listing all six perspectives with Operators framed as vocabulary. |
| 3 | **NCR-2 path** | **B.** Prune `equivalences[1]` in the shaping helper for the Core Tricks grid, not cosmetically in the template. Cleaner contract. | `compound_notation_strategy.md` specifies the service-layer change; template untouched on the equivalences-loop side. |
| 4 | **NCR-1 source of truth** | **TypeScript content module field** on `CoreTrickSpec`. Reversible, curator-authored, parallel to existing equivalences shape. DB `operational_notation` column NOT used as source for the grid. | `core_trick_notation_completion_audit.md` specifies the `CoreTrickSpec.operationalNotation` field addition + the 12 verbatim strings. |
| 5 | **NCR-6 cadence** | **Separate follow-on slices** after this wave. Audit surfaces options; rev-up / family-ordering decisions do NOT block notation cleanup. | `family_ordering_audit.md` lays out audit + decision options; explicitly NOT in this wave's implementation scope. |

**Implementation priority (curator-locked):**

1. **NCR-1 + NCR-2 atomic.** Author the 12 op-notation strings AND
   prune accounting `equivalences[1]` from the Core Tricks grid in
   one slice. Highest user-facing improvement; the two changes are
   tightly coupled (NCR-2 removes the line NCR-1 then replaces).
2. **NCR-5.** Dictionary portal card copy expansion. Trivial
   content-module edit; bake in the corrected perspective list (six,
   not five, with Operators framed as supporting vocabulary).
3. **NCR-4.** Landing density cleanup + section reorder per Reading
   A. CSS work + targeted template move.
4. **NCR-3.** Formalize the 4-tier rendering hierarchy contract via
   additional integration tests pinning each surface.
5. **NCR-6.** Family-ordering audit lands as a planning artifact
   only this wave. Implementation slices (rev-up resolution, family
   ordering) are explicitly queued for after this wave.

---

## Process note

This slice is a planning artifact, not an implementation slice.
Approval of any NCR authorizes a separate implementation slice. The
implementation slices are sequenced in the table above. Each will
respect the same NOTs and skill doctrines.

The freestyle subsystem reached its dictionary-coherence stabilization
checkpoint on 2026-05-18 (six CRs shipped). This Notation Normalization
Wave is the natural follow-on: same doctrine, same restraint posture,
narrower surface area (notation rendering, landing reorganization, one
audit). When this wave's recommendations land, the public freestyle
surfaces will be coherent across:

- Landing (orientation + operational-notation-first core tricks)
- Glossary (semantic terms + ops notation in §7)
- Dictionary browse views (2-tier card hierarchy from CR-5)
- Trick detail pages (existing + future executable-accounting
  disclosure surface)

Three notation systems will still coexist -- that's correct; they
serve different audiences. They just won't compete at equal visual
hierarchy any more.
