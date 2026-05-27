# Rendered HTML/CSS Audit — Pre-Red Freestyle Stabilization

**Companion to**: `HUMAN_REVIEW_CHECKLIST.md` (manual real-device review).

**Methodology**: curl + Python regex parsing of rendered HTML from the live dev server at `localhost:3000`. CSS verified via `curl http://localhost:3000/css/style.css | grep`. **No screenshots taken. No device verification performed. No real navigation simulated.** Findings below are source-grounded — every claim cites the file/URL/output that produced it.

> **Discipline**: this audit reports only what is verifiable from rendered HTML/CSS/DOM. Anything browser/device-dependent is marked **MANUAL REVIEW REQUIRED**.

## Surfaces audited

| URL | HTTP | Size | Audit depth |
|---|---|---|---|
| `/freestyle/tricks` | 200 | 150 KB | DOM structure + card-class distribution |
| `/freestyle/tricks/paradox-whirl` | 200 | 28 KB | Section flow + intro prose + diagnostic panel |
| `/freestyle/tricks/mobius` | 200 | ~28 KB | Multi-reading chain rendering |
| `/freestyle/tricks?view=family` | 200 | ~95 KB | Slice M dual-membership + retirement |
| `/freestyle/tricks?view=movement-system` | 200 | 106 KB | Slice L1+L2+N axis + gloss rendering |
| `/freestyle/glossary` | 200 | 104 KB | §1–§12 section spine |

## Findings

### F-1 — Slice W omission: equivalent-readings section-intro missed in original W edit

**Status**: **FIXED in this slice** (one HBS prose line; no test impact).

In Slice W I softened the Layer-1 section-intro and the Layer-2 source line in `trick-notation.hbs`, but missed the **Layer-2 section-intro** at line 31:

```html
<p class="section-intro">
  Curator-authored equivalent compositional readings of this trick.
  ...
</p>
```

Verified by curling `/freestyle/tricks/paradox-whirl` and `/freestyle/tricks/mobius`. The Layer-2 intro was still implementation-flavored ("Curator-authored equivalent compositional readings") while the source line below it ("Different ways to express the same trick's composition. Tap any term…") was already softened.

**Fix shipped**: replaced the section-intro with:

> *"Other ways the same trick reads — later rows progressively unfold the composition."*

Rationale: the curator-authored chain registry encodes **progressive stopping depths** (e.g., mobius has 3 readings: `gyro torque` → `spinning ss torque` → `spinning ss miraging op osis`). The new intro signals this progression. The Layer-2 source line at the bottom complements (interaction hint) without duplicating (depth hint).

Test impact: zero (no test asserts on either string per grep).

### F-2 — Browse-view chain coverage distribution

**Verified via DOM parse** of `/freestyle/tricks` (138 registry cards):

| Bucket | Count | Percent |
|---|---|---|
| Cards with chain reading (`.dict-card-equivalence--inline`) | 70 | 51% |
| Cards with op-notation fallback (`.dict-card-notation--inline`) | 25 | 18% |
| Cards with neither | 43 | 31% |
| Cards with pending-decomposition pill (Slice M pilot) | 7 | 5% |

The 7 pending-pill rows match the post–Pre-Red-sweep `UNRESOLVED_COMPOUNDS` size (rev-up, reaper, surreal, montage, witchdoctor, fury, surgery — tomahawk removed). ✓

The 43 "neither" cards are base tricks (atw, butterfly, etc. — name IS the reading) plus stalls/kicks lacking op-notation in the live DB. **Note**: the Pre-Red sweep added 12 stall/kick op-notation rows to `red_corrections_2026_04_20.csv` but the live DB is stale on those edits — `reset-local-db.sh` would pick them up.

### F-3 — Slice V CSS rule served + class targets present

**Verified via** `curl http://localhost:3000/css/style.css`:

```css
.dict-card--registry .dict-card-equivalence--inline,
.dict-card--registry .dict-card-notation--inline {
  grid-area: reading;
}
```

The rule is inside the existing `@media (max-width: 520px)` block per Slice V edit. Both target classes are present in the rendered browse-view markup (verified by DOM parse). ✓

**MANUAL REVIEW REQUIRED**: actual rendering on real mobile devices — does the formula row land correctly under the title+ADD row at ≤520px?

### F-4 — Slice M dual-membership + clipper-stall retirement verified live

**Verified via** `/freestyle/tricks?view=family` DOM parse:

| Check | Result |
|---|---|
| Family sections rendered | 16 (whirl, rev-whirl, butterfly, osis, torque, blender, mirage, drifter, legover, pickup, illusion, atw, swirl, reverse-drifter, barfly, double-leg-over) |
| osis-family contains torque card | ✓ |
| osis-family contains blender card | ✓ |
| torque-family contains torque card as anchor | ✓ |
| clipper-stall family section absent | ✓ |
| clipper-stall row absent from entire family view | ✓ |

**MANUAL REVIEW REQUIRED**: subjective UX of seeing torque/blender twice (once in osis-family, once in own branch family). The directive in Slice M framed this as "intentional duplication"; curator's lived impression confirms or refines.

### F-5 — Movement System view: 4 axes + 6 pilot glosses live

**Verified via** `/freestyle/tricks?view=movement-system` DOM parse:

| Axis | Members rendered | Glosses present |
|---|---|---|
| Set / Uptime | pixie, atomic, stepping | pixie ✓ stepping ✓ (atomic un-glossed per pilot) |
| Entry Topologies | paradox | paradox ✓ (with Pre-Red entry-shape line: `Entry shape: clip > op-in dex`) |
| Midtime Body | spinning, ducking, diving | spinning ✓ ducking ✓ (diving un-glossed per pilot) |
| No-Plant & Suspension | symposium | symposium ✓ |

**fairy** and **surging** (Slice L1 set-uptime axis members) do NOT render groups — their buckets are empty in the live DB (no compounds reference them via modifier_links). The empty-axis pruning works correctly. ✓

The Pre-Red sweep entry-shape line is HTML-encoded as `Entry shape: clip &gt; op-in dex` — appears correctly when rendered as text in the browser; my grep for the raw `>` character missed it initially. ✓

### F-6 — Trick-detail section flow verified (paradox-whirl example)

**Section order rendered** (h2 headings extracted from `/freestyle/tricks/paradox-whirl`):

1. About this trick
2. Notation
3. Equivalent readings
4. Execution
5. Learning notes
6. Before you try this
7. Paradox Whirl Family
8. Related Tricks
9. Parallel tricks
10. Modifier substitutions
11. Media
12. What you can do with this trick (pathways)
13. Previous Tricks
14. Next Tricks
+ Structural decomposition (`<details>` collapsed; h2 not in main flow)

**Observation**: paradox-whirl has NO operational-notation section rendered (no `operational_notation` value in DB). The section gates correctly. ✓

**Observation**: paradox-whirl renders BOTH Notation and Equivalent readings sections back-to-back. The chain reading for paradox-whirl is just `['paradox whirl']` — identical content as Notation. Visual redundancy is row-specific (mobius shows 3 distinct readings; no redundancy). The Slice W intro softening + the new F-1 intro fix together signal that the two sections serve different layers (Layer 1 = parser-tokenized; Layer 2 = progressive depth).

### F-7 — Diagnostic-details panel still public-visible (Slice W flag confirmed)

**Verified via** `/freestyle/tricks/paradox-whirl` DOM parse:

| Check | Result |
|---|---|
| Structural decomposition panel present | ✓ |
| Panel wrapped in `<details>` (collapsed-by-default) | ✓ |
| Inner Diagnostic-details panel present | ✓ wrapped in second `<details>` |
| "Jobs notation" string present in HTML | ✓ |
| "Parse warnings" string present | ✗ (empty for paradox-whirl; would render for rows with warnings) |
| "Editorial decomposition" label present | ✓ |

Slice W §3.1's curator-decision flag stands. Admin-gating remains a curator decision.

**MANUAL REVIEW REQUIRED**: does the Diagnostic-details inner collapse, when expanded by a curious user, feel appropriate on a public educational page? Slice W proposed three options (keep / admin-gate / remove).

### F-8 — Glossary §1–§12 section spine intact

**Verified via** `/freestyle/glossary` content grep:

| Section | Heading text found in HTML |
|---|---|
| §1 | "1. Movement-Language Primer" ✓ |
| §9 | "9. Movement Neighborhoods" ✓ (post-stabilization rename) |
| §10 | "10. Traditional Reference" ✓ |
| §12 | "12. Sources" ✓ |

(Sampled subset; full §1–§12 spine is asserted by `tests/integration/freestyle.glossary-connective-panels.routes.test.ts`.)

The h2 headings are multi-line in markup (heading content spans a newline). False alarm during initial single-line regex grep; verified by `grep -B 1` lookup.

### F-9 — Symbolic-first / op-notation-fallback precedence held

**Verified via** sampled cards from `/freestyle/tricks`:

- Sample card with chain: `around-the-world` renders `≡ ATW` (chain reading; op-notation suppressed)
- Sample card with fallback: `toe-stall` renders `[set] > toe` (op-notation rendered because no chain entry)

Slice N precedence contract preserved. ✓

### F-10 — Pre-Red CSV edits not reflected in live DB

**Verified via** browse-view "neither" card count (43 cards lack both chain and op-notation).

Per the Pre-Red completion sweep, 12 stall/kick op-notation rows were appended to `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv`. The live DB has not been rebuilt since. The 12 stall rows (inside-stall, outside-stall, sole-stall, knee-stall, neck-stall, head-stall, heel-stall, forehead-stall, shoulder-stall, cloud-stall, sole-kick, cloud-kick) render as "neither" cards (no chain, no op-notation) until next `reset-local-db.sh`.

**Not a defect**: this is expected behavior for CSV-staged edits. **MANUAL REVIEW REQUIRED**: curator decides when to rebuild the dev DB.

## Summary

| Finding | Severity | Action |
|---|---|---|
| F-1 — Slice W omission | LOW (cosmetic) | **FIXED** (one HBS prose line) |
| F-2 — Chain coverage 51% / op-fallback 18% / neither 31% | INFORMATIONAL | No action |
| F-3 — Slice V CSS rule served + classes present | VERIFIED | Manual mobile device check pending |
| F-4 — Slice M state intact (live) | VERIFIED | No action |
| F-5 — Movement System axes + glosses live | VERIFIED | No action |
| F-6 — Trick-detail section flow | VERIFIED | No action |
| F-7 — Diagnostic panel public-visible | NOTED (Slice W flag) | Curator decision pending |
| F-8 — Glossary §1–§12 spine | VERIFIED | No action |
| F-9 — Symbolic-first precedence | VERIFIED | No action |
| F-10 — Pre-Red CSV edits not in live DB | NOT A DEFECT | Curator rebuilds when ready |

## What this audit did NOT do

- ❌ No screenshots
- ❌ No real-device viewport testing
- ❌ No interactive click-through navigation
- ❌ No subjective UX impressions claimed
- ❌ No browser-rendering verification (only HTML/CSS source verification)
- ❌ No mobile-OS-specific behavior assertions
- ❌ No accessibility audit (out of scope per request)
- ❌ No performance audit

All subjective and device-specific evaluation is **MANUAL REVIEW REQUIRED** and lives in `HUMAN_REVIEW_CHECKLIST.md`.

## Shipped in this slice

| File | Change |
|---|---|
| `src/views/partials/trick-notation.hbs` | Soften Equivalent readings section-intro (Slice W omission F-1) |

No other code changes. Per request: "no implementation changes unless the issue is obvious, narrow, and safely testable."

The F-1 fix is **obvious** (Slice W explicitly intended to soften the section, and missed this line — confirmed by reading the prior Slice W diff), **narrow** (one `<p>` tag), and **safely testable** (no integration test asserts on the string per grep verification).

---

## End
