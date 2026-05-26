# Review Queue (2026-05-25)

Lightweight backlog of items surfaced during the pre-Adrian polish session
that need curator attention but are out of scope for the immediate slices.

## Items

### 1. double-knee — orphaned corrections, no canonical row

**State:** Loader 19 emits `WARNING: corrections skipped — double-knee.operational_notation: trick not found` and the same for `.notation`. Two red_corrections rows target this slug (lines 203 + 210 of `red_corrections_2026_04_20.csv`):

- `operational_notation` → `double knee` (sui-generis self-token primitive)
- `notation` → `DOUBLE KNEE`

These corrections sit dormant because there's no canonical row in `freestyle_tricks`. `RECONCILIATION.csv:32` claims `1 Published Canonical` but that's stale.

**Action needed:** Add a `double-knee` row to `red_additions_2026_04_20.csv` (1 ADD body primitive, flying-derived per curator 2026-05-22) so the existing corrections can apply on loader 19 rebuild.

**Provenance:** Curator-recorded 2026-05-21 (not in fborg-1add.txt; manual curator addition).

### 2. peak-delay — orphaned corrections, no canonical row

**State:** Same shape as double-knee. Loader 19 warnings on both `operational_notation` and `notation` fields. Corrections at `red_corrections_2026_04_20.csv:204 + 209`:

- `operational_notation` → `[set] > peak`
- `notation` → `PEAK DELAY`

Curator-documented as a folk-name surface stall ("peak" = rim of a ballcap, community folk reference, not anatomical surface ontology). `RECONCILIATION.csv:119` claims `1 Published Canonical` but the canonical row was never added.

**Action needed:** Add a `peak-delay` row to `red_additions_2026_04_20.csv` (1 ADD unusual-surface stall, pt8-ruled per RECONCILIATION). Once the row exists, loader 19's existing corrections back-fill the notation + op_notation.

**Provenance:** fb.org-sourced (1-ADD bucket); pt8-ruled 1 ADD; corrections curator-locked 2026-05-22.

### 3. 2-bag juggling — domain classification question

**State:** No footprint in `freestyle_tricks`, `RECONCILIATION.csv`, or any current dictionary surface. Multi-bag (2-bag, 3-bag, 5-bag) juggling is structurally distinct from single-bag freestyle and may belong in a separate domain entirely.

**Open questions for curator:**
- Is 2-bag juggling a competition discipline class (i.e., belongs in `event_disciplines` for multi-bag events) but NOT a freestyle trick category?
- Does it warrant its own dictionary domain (`/freestyle/multi-bag` or similar) parallel to the single-bag freestyle dictionary?
- Or is it out of scope for the platform's freestyle vocabulary entirely?

**Action needed:** Curator decision on whether to scope a multi-bag domain. If yes, that's a separate slice with its own ontology, content modules, and surfaces. If no, document the boundary in `docs/GLOSSARY.md` or the freestyle landing page so future questions land cleanly.

## Recommended posting

Surface these to the next Red consultation packet alongside the 6 Red Wave 2
questions already captured in
`exploration/pre-red-cleanup-2026-05-25/CLEANUP_AUDIT.md §G.5`.

For double-knee and peak-delay specifically: the canonical row addition
is mechanical and could happen in a follow-up promotion slice (same pattern
as the held-delay leg-over family + ATW-family promotions from this
session). 2-bag juggling is a domain-scoping question requiring curator
direction before any code lands.
