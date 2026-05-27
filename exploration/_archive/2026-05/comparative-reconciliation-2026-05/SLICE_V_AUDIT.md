# Slice V — Symbolic Readability + Operator-Boundary Audit

**Status**: audit findings + minimal commit-ready refinement.
**Date**: 2026-05-16.
**Position in arc**: Pre-Red completion sweep already shipped (12 stall op-notations + 7 chains + tomahawk pill cleanup + paradox entry-shape). Slice V follows as the final pre-Red readability QC.

> **Discipline reminder**: no SQL/schema changes, no parser grammar expansion, no speculative doctrine, no ADD changes, no parser-internal leakage into public glossary. Four-layer separation preserved. Curator approves before any color-budget expansion or ontology classification change.

## 1. Executive summary

| Focus area | Finding | Action |
|---|---|---|
| Symbolic readability | Formulas are already inline on the same line as slugs in registry density (Slice H2 + L0-2). One real mobile-layout bug found: `.dict-card-equivalence--inline` and `.dict-card-notation--inline` lack a `grid-area: reading` assignment at the 520px breakpoint. | **Shipping CSS fix** (commit-ready) |
| Operator-vs-trick consistency | Two registries (`freestyleTrickKindOverrides.ts` and `semanticNotationRendering.ts`) classify the same slugs along different axes. **Not an inconsistency** — they serve different purposes (row-classification vs token-classification in readings). One real ambiguity flagged: set-primitive (`pixie/atomic/fairy/quantum`) vs body-modifier (`paradox/spinning/ducking`) collapse into one `modifier` token color. Curator may decide whether to differentiate. | Curator decision; **no code change** |
| Family topology QC | Slice M state intact: torque/blender/drifter dual-membership; clipper-stall retired from Family-View browse; whirl + rev-whirl sibling family preserved. Barfly remains Slice O candidate (pre-Red blocked). | **No action** |
| UX/pedagogy polish | Op-notation fallback already muted; mobile breakpoint exists but is buggy (see above); intimidation factor reduced post Slices N+Pre-Red (47 of 64 chains now have curator readings). Curator-prose-level rather than kernel-level. | **No action** |

**Minimal implementation slice**: one CSS edit (~15 lines). Audit doc captures the analysis; curator triages other proposals when ready.

## 2. Symbolic readability findings

### 2.1 Current state (post-Slice-H2 + L1/L2 + Pre-Red sweep)

The dictionary-trick-card partial renders two density modes:

**Registry density** — `dict-card--registry`:

```
┌───────────────────────────────────────────────────────────────────┐
│ paradox-blender   ≡ paradox blender   5 ADD                       │
│ paradox-whirl     ≡ paradox whirl     4 ADD                       │
│ paradox-torque    ≡ paradox torque    5 ADD                       │
└───────────────────────────────────────────────────────────────────┘
```

Inline grid: `minmax(8rem, max-content) 1fr max-content auto`. The structural sentence sits adjacent to the slug, ADD chip right-aligned. Pending pill / media chip / status badge cascade right.

**Browse density** — `dict-card--browse`:

Same fields, vertically stacked. Used in the trick-detail-page reverse-membership panels (UX-SHIP-1 Phase 5). Browse views (ADD / family / category / component / topology / movement-system) all use **registry** density per Slice H2 unification.

### 2.2 The user directive checklist

| Ask | Current state | Need change? |
|---|---|---|
| "Move symbolic formulas onto same visual line as trick names where practical" | Already inline in registry density across all 7 browse views | **No** |
| "Reduce compressed unreadable notation" | Symbolic readings are intentionally compact (`miraging osis`, `paradox blender`) vs operational notation (`CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP TOE [DEL]`). Symbolic-first / op-notation-fallback precedence holds. 47/64 chains have curator readings post Slice N+Pre-Red sweep. | **No kernel change**; ongoing chain coverage expansion (Slice N+1 candidate queue in `chain_external_alignment.csv`) |
| "Improve scanability of shared symbolic components" | Family-anchor underline (solid for canonical surfaces; dotted for observational) already in place. Cards in a family-view section share the same anchor token rendering with emphasis. | **No** |
| "Emphasize repeated family structures visually" | Existing: anchor underline + family-section heading + Slice I `sharedStructure` invariant line (whirl + rev-whirl only). | Could expand `FAMILY_INVARIANTS` content; **defer to post-Red curator work** |
| "Explore restrained color semantics for operators/components" | 4-color budget: base-anchor green, modifier olive, side-positional grey, unknown inherit. Curator-locked per BROWSE_SURFACE_AUDIT §B.2 + SEMANTIC_COMPRESSION_DOCTRINE §5. | **See §3 for one open question**; no immediate change |
| "Preserve anti-overload posture" | All color/visual decisions to date have been restraint-first. | **Preserve** |

### 2.3 Real bug found — mobile registry grid

`src/public/css/style.css:5464-5478` defines the 520px mobile registry layout:

```css
@media (max-width: 520px) {
  .dict-card--registry {
    grid-template-columns: 1fr max-content;
    grid-template-areas:
      "title add"
      "reading reading";
    row-gap: 2px;
  }
  .dict-card--registry .dict-card-title { grid-area: title; }
  .dict-card--registry .dict-card-add { grid-area: add; }
  .dict-card-tokenized-reading {
    grid-area: reading;
    font-size: 0.95rem;
  }
}
```

The `grid-area: reading` is assigned to `.dict-card-tokenized-reading` — but the template renders the equivalence as `.dict-card-equivalence--inline`, not `.dict-card-tokenized-reading`. And the operational-notation fallback uses `.dict-card-notation--inline`. **Neither class has a `grid-area: reading` assignment**, so on mobile widths the formula doesn't land in the named "reading" row — it falls through `grid-auto-flow` placement, which on most browsers will skip empty grid cells or overlap the title cell.

This is a **commit-ready CSS-only fix**. Adding two selectors:

```css
.dict-card--registry .dict-card-equivalence--inline,
.dict-card--registry .dict-card-notation--inline {
  grid-area: reading;
}
```

Inside the existing 520px media block. Restraint contract preserved (no new color, no new class, no markup change).

## 3. Operator-vs-trick consistency findings

### 3.1 Two-axis classification system

The codebase has **two parallel registries** that classify the same slugs:

**Axis A — Row classification (`freestyleTrickKindOverrides.ts`)**:
What kind of ROW is this in the freestyle_tricks table? Drives which browse views the row appears on.

| Kind | Members |
|---|---|
| `trick` (default) | All rows not in override sets |
| `modifier` | barraging, blazing, ducking, gyro, illusioning, paradox, spinning, stepping, symposium, tapping, terraging, spin |
| `operator` | atomic, fairy, furious, pixie, pogo, quantum, rooted, sailing, shooting |
| `surface` | clipper |
| `pending-review` | surging |

**Axis B — Token classification (`semanticNotationRendering.ts` → `SemanticRole`)**:
What role does this token play IN A SYMBOLIC READING? Drives the color/emphasis when the token appears inside a chain reading.

| Role | Members | CSS color |
|---|---|---|
| `base-anchor` | toe-stall, clipper-stall, atw, orbit, legover, pickup, mirage, illusion, butterfly, osis, whirl, swirl, torque, blender, rev-whirl, rev-swirl, eggbeater, drifter, barfly, dyno | `#5a7b48` (green) |
| `modifier` | paradox, spinning, ducking, symposium, stepping, tapping, diving, weaving, zulu, inspinning, **pixie, fairy, atomic, quantum**, blurry, nuclear, barraging, **furious**, miraging, whirling, illusioning, double, triple, surging, high, gyro, terraging | `#8c7e3e` (olive) |
| `side-positional` | ss, op, far, near, reverse, rev | `#8a8470` (grey, smaller) |
| `unknown` | (anything else) | inherit |

### 3.2 The 9 user-named operator classifications

Per the directive list:

| Slug | Axis A (kind) | Axis B (role) | Notes |
|---|---|---|---|
| `fairy` | `operator` | `modifier` | **Wave 2 dependency**: operator boundary pending. PB silent on most fairy compounds. |
| `pixie` | `operator` | `modifier` | Curator-confirmed set primitive (Slice L1 axis member). Compound role consistent. |
| `atomic` | `operator` | `modifier` | pt4-locked operator. Cross-body uptime + X-dex character per Red 2026-05-15. |
| `quantum` | `operator` | `modifier` | "Compressed atomic" per pt10 ruling. |
| `symposium` | `modifier` | `modifier` | Body modifier (no-plant discipline). |
| `paradox` | `modifier` | `modifier` | Entry-topology modifier. Has its own composition gloss + entry-shape (Pre-Red sweep). |
| `gyro` | `modifier` | `modifier` | Half-body 180° rotation. |
| `spinning` | `modifier` | `modifier` | Full-body 360°. |
| `ducking` | `modifier` | `modifier` | Head-dip body modifier. |
| `diving` | (default `trick`) | `modifier` | **Inconsistency flag**: diving is in Axis B but NOT in Axis A. Currently treated as a base trick (kind=trick) at row level, but as a body modifier in compositional readings. |
| `barraging` | `modifier` | `modifier` | Body modifier; **Wave 2 dependency** on barraging-vs-furious operator-class boundary. |
| `furious` | `operator` | `modifier` | Set primitive; **same Wave 2 dependency**. |

### 3.3 Findings (flagged, not resolved)

**Finding V-1 — set-primitive vs body-modifier color collapse**:

`pixie`, `fairy`, `atomic`, `quantum`, `furious` are `kind='operator'` (set primitives — they initiate a trick from a set).
`paradox`, `spinning`, `ducking`, `symposium`, `stepping`, `tapping`, `barraging`, `gyro`, `diving` are body modifiers (applied to a base trick).

In compositional readings, both classes render as the same `sem-token--modifier` olive. The token color does not distinguish "set initiates the bag" from "modifier transforms a base trick."

**Curator decision (deferred)**: should the 4-color budget expand to 5 to differentiate set-primitives from body-modifiers? Options:

  - **A — Keep 4 colors** (restraint-first; status quo): set/body distinction lives in glossary content, not in token color.
  - **B — Sub-shade modifier**: set-primitives become slightly lighter olive (e.g., `#a89656`), body-modifiers stay `#8c7e3e`. 5-color budget; pedagogical benefit; risks visual noise.
  - **C — Non-color discriminator**: set-primitives carry an italic style; body-modifiers stay roman. Stays in 4-color budget; preserves token width consistency in mono environments.

**Recommendation**: defer to curator. Slice V flags the question; does not implement.

**Finding V-2 — `diving` is in Axis B (token role) but not Axis A (row kind)**:

Looking at the DB:
```
sqlite3> SELECT slug, category FROM freestyle_tricks WHERE slug='diving' AND is_active=1;
(no row)
```

`diving` doesn't exist as a row in `freestyle_tricks`. It's only a TOKEN that appears in chain readings (e.g., hatchet = "diving whirl" via FM-only reading; Slice P Q candidate). So Axis A doesn't classify it because there's no row to classify; Axis B classifies it because the token appears.

This is **consistent**, not an inconsistency. Token classification is row-existence-independent by design. Flagged for awareness; **no action**.

**Finding V-3 — Wave 2 dependencies remain unchanged**:

The Pre-Red sweep already implemented every safe Wave-1-resolved or curator-prose-confirmed change. The following remain Wave-2-blocked:

  - `fairy` operator boundary (Q1)
  - `barraging` vs `furious` operator class (Q2)
  - `blurry` transitivity (compounds vs base tricks; Q3)
  - hidden X-dex preservation rules (Q4)
  - folk-stabilization threshold (Q5)
  - operator-vs-trick boundary for ambiguous cases (Q6)

All carry `pending_red=true` in the comparative-reconciliation queues. **No action** in this slice.

## 4. Family topology QC findings

Post-Slice-M state verified via existing test suite (no new tests required for this audit):

| Topology element | State | Source |
|---|---|---|
| Torque family | ✅ Branch family with dual-membership (torque + 8 descendants) | Slice M `FAMILY_DUAL_MEMBERSHIPS` |
| Blender family | ✅ Branch family with dual-membership (blender + 4 descendants) | Slice M |
| Drifter family | ✅ Branch family with dual-membership (drifter + 4 descendants + high-plains-drifter via one-way redirect) | Slice M |
| Whirl family | ✅ Root terminal family (16 descendants); Slice I shared-terminal invariant rendered | Slices I, J, M |
| Rev-Whirl family | ✅ Sibling terminal family (rev-whirl + hatchet + mullet via Slice J one-way override) | Slice J |
| Clipper-Stall family | ✅ Retired from Family-View browse via `RETIRED_FAMILIES`; row still in DB | Slice M |
| Barrage/Furious | ⚠ Wave 2 dependency (operator-class boundary); not promoted | Wave 2 packet |
| Barfly | ⚠ Slice O branch-family candidate; pre-Red promotion blocked | Slice O |
| FAMILY_ORDER | ✅ Reshuffled to surface lineage adjacency (torque + blender adjacent to osis) | Slice M |

**No QC failures** — all topology operations from Slice M+J+I are intact.

## 5. UX/pedagogy polish observations

### 5.1 Symbolic onboarding clarity

The glossary §1 Movement-Language Primer + §3 Dexterities + §4 Timing Layers + §5 Core Trick Structures + §6 Modifiers form a curator-authored onboarding ladder. Each section landed in Glossary v5 Batches 1-4 (per memory `project_glossary_v5_synthesis`).

**Audit**: onboarding sequence is intact. No reading-flow gaps identified at this scope.

### 5.2 Glossary readability

§9 connective panels (paradox / symposium / ducking / spinning / whirl / pixie) provide cross-modifier teaching surfaces. §10 Traditional Reference holds the legacy ADD ladder. §12 Sources is deferred.

**Audit**: section spine is internally consistent. The Pre-Red paradox entry-shape addition (`Entry shape: clip > op-in dex`) propagates to the Movement System view paradox group; glossary surface unaffected.

### 5.3 Visual density

Registry density on browse views: 6px row padding, 0.95rem title, 0.85rem operational-notation fallback. Reasonable scan-density per BROWSE-REFACTOR-1 Slice 1 (2026-05-15).

**Audit**: no density change recommended. The mobile bug below is the only actionable issue.

### 5.4 Card scanning experience

Registry density is `display: grid` with explicit 4-column layout. ADD chip right-aligned for scanability. Family-anchor underline preserves "this card is rooted in this family" cue.

**Audit**: scanning behavior is sound on desktop. Mobile bug (Finding V-4 below) breaks the two-row layout.

### 5.5 Mobile readability concerns — **real bug**

**Finding V-4 — mobile grid bug (commit-ready fix)**:

At ≤520px, the registry-card grid switches to a two-row layout:

```
┌─────────────────────────────┐
│  paradox-blender    5 ADD   │   ← row 1: title + ADD
│  ≡ paradox blender          │   ← row 2: reading (named "reading")
└─────────────────────────────┘
```

But the formula's class (`dict-card-equivalence--inline` or `dict-card-notation--inline`) lacks the `grid-area: reading` assignment. On most browsers, this causes the formula to overflow / overlap / drop out of the named row.

**Fix**: add the missing grid-area assignments in the existing 520px media block. CSS-only. ~15 lines. Risk: LOW.

This is the **shipped commit-ready change** for Slice V.

### 5.6 Notation intimidation factor

Symbolic-first / op-notation-fallback precedence (Slice N) ensures most rows render the compact "miraging osis" reading rather than the heavy "CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP TOE [DEL]" form. Post Pre-Red sweep, 7 more chains were added (47 of ~64 cardable rows now have chains). The remaining op-notation-fallback rows render in `.dict-card-notation--inline`'s muted text-subtle color at 0.85rem.

**Audit**: intimidation is already mitigated structurally. Curator-prose-level (more chain authoring) extends this further; not a kernel concern.

## 6. Recommended refinements — ranked by risk

| Recommendation | Risk | Action |
|---|---|---|
| **Mobile registry grid-area fix** (Finding V-4) | LOW (CSS-only; visible only at ≤520px) | **Shipped this slice** |
| Sub-shade or italic differentiation for set-primitives vs body-modifiers (Finding V-1) | MEDIUM (color/style budget expansion; pedagogical decision) | **Defer to curator decision** |
| Expand `FAMILY_INVARIANTS` content beyond whirl + rev-whirl (post-Slice-I work) | MEDIUM (content authoring; Wave 2 dependency for torque/blender/drifter invariants) | **Defer to post-Red** |
| Add a "rhyming notation" pedagogical aid (highlight repeating tokens across cards in same group) | HIGH (client-side logic; restraint risk) | **Reject — too speculative** |
| Trick-detail page op-notation visual demotion (separate from browse density) | MEDIUM (touches a different rendering surface) | **Defer to a dedicated trick-detail audit slice** |
| Subtle background tint on family-anchor section | MEDIUM (visual noise risk) | **Reject — anti-overload posture** |

## 7. Mockups (ASCII)

### 7.1 Mobile registry — current (broken)

```
Width ≤ 520px:
┌──────────────────────────────────────────────┐
│ paradox-blender                       5 ADD  │   ← row 1 OK
│ ≡ paradox blender                            │   ← row 2 FLOATS / overlaps
│  (no grid-area assignment)                   │
└──────────────────────────────────────────────┘
```

### 7.2 Mobile registry — after Slice V fix

```
Width ≤ 520px:
┌──────────────────────────────────────────────┐
│ paradox-blender                       5 ADD  │   ← row 1: title + add
│ ≡ paradox blender                            │   ← row 2: formula in "reading" area
└──────────────────────────────────────────────┘
```

### 7.3 Hypothetical sub-shaded modifier color (Finding V-1, **not shipped**)

```
≡ pixie butterfly                  (pixie = lighter olive — set primitive)
≡ paradox blender                  (paradox = current olive — body modifier)
≡ atomic mirage                    (atomic = lighter olive)
≡ spinning torque                  (spinning = current olive)
```

The visual distinction would teach "set initiates trick" vs "modifier transforms base" through color. Curator decides whether the pedagogical benefit justifies expanding the color budget.

## 8. Minimal implementation slice — shipped

**Single edit**: `src/public/css/style.css`, mobile registry grid-area assignment for the symbolic-equivalence + operational-notation inline classes.

**Lines changed**: +5 (additive, inside existing 520px media block).
**Risk**: LOW.
**Tests touched**: 0 (CSS layout fix; no behavioral change).
**Type-check**: untouched.

The fix is the entirety of the commit-ready code change for this slice. The audit doc captures everything else as findings and recommendations.

## 9. What this slice does NOT do

- ❌ No SQL or schema changes
- ❌ No parser-grammar expansion
- ❌ No new ontology classifications
- ❌ No ADD changes
- ❌ No expansion of the 4-color sem-token budget
- ❌ No resolution of Wave 2 dependencies (fairy, barraging-vs-furious, blurry transitivity, hidden-dex, folk-stabilization, operator-vs-trick boundary)
- ❌ No new content-module entries beyond what's already shipped
- ❌ No expansion of `FAMILY_INVARIANTS` beyond whirl + rev-whirl
- ❌ No new test files
- ❌ No movement-neighborhood expansion
- ❌ No Batch 5 visual systems
- ❌ No topology graphs
- ❌ No parser UI

## 10. Cross-slice context

Slice V closes the pre-Red readability + ontology-classification audit arc:

| Slice | Output |
|---|---|
| O | branch-family candidate discovery |
| P | symbolic-equivalence cross-source audit |
| Q | ADD-divergence reclassification |
| R | missing-move triage |
| S | embodied-analogy notes (observational) |
| Pre-Red sweep | 12 stall op-notations + 7 chains + paradox entry-shape + tomahawk pill removal |
| **V** | **readability + operator-boundary audit + mobile-grid fix** |

After Slice V, the dictionary is at a clean pre-Red checkpoint. The curator triages O–R+V findings at their own pace. No further automated work is scheduled until Red Wave 2 lands.

---

## End
