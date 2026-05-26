# Pre-Handover Cleanup Sweep

**Date:** 2026-05-26 (session close)
**Companion to:** `REPORT.md` in this directory
**Scope:** rendered consistency + low-risk normalization + weak-page shortlist only
**Explicit non-goals:** no new ontology, no doctrine rewrite, no Red-blocked work, no broad promotion

---

## 1. Rendered JOB consistency — audit findings

**Audited:** all template paths where `operational_notation` or `notation` render. Surveyed `trick-notation.hbs`, `trick-operational.hbs`, `trick-comparative-row.hbs`, plus all `grep operationalNotation src/views/**`.

**Trick-detail rendering chain (correct, no leakage):**
- First-class tricks → `trick-comparative-row` Notation summary card (compact JOB / ADD / ALT labeled block, suppresses `trick-operational`)
- Non-first-class tricks → `trick-notation` (Movement notation, tokenized) + `trick-operational` (Set notation, tokenized) as separate structured sections
- Both partials route through tokenized `<code class="notation-display-tokens">` / `<code class="operational-notation-tokens">` blocks with role-classified `.notation-token` / `.op-token` spans

**Three raw-rendering sites identified — intentionally compact list contexts, not leakage:**
- `src/views/freestyle/tricks.hbs:458` — alt-surface subsection on Movement Systems view (`<code class="alt-surface-notation">{{operationalNotation}}</code>`); inline list item; compact-density intentional per `[[feedback_browse_view_distributional_density]]`
- `src/views/freestyle/set-detail.hbs:61` — example-tricks list on set-detail page; compact-density intentional
- `src/views/freestyle/observational.hbs:151` — tracked-rows list on observational page; compact-density intentional

**Verdict:** **No JOB-block leakage on detail pages.** The user's hard rule #1 ("no raw operational notation should appear loose beneath titles") is satisfied. Compact list contexts deliberately render raw for density and are not detail-page sections.

---

## 2. Spin / juggling visibility — verified

DB state confirmed post-T1:

| Slug | ADD | JOB (notation) | Op-notation |
|---|---|---|---|
| spin | 1 | `SPIN` | `SPIN [BOD]` |
| double-spin | 2 | `SPIN > SPIN` | `SPIN [BOD] > SPIN [BOD]` |
| 2-bag-juggling | 2 | `TOE > TOE` | `TOE [DEL] > TOE [DEL]` |
| 3-bag-juggling | 3 | `TOE > TOE > TOE` | `TOE [DEL] > TOE [DEL] > TOE [DEL]` |

All match the curator-ruled canonical forms exactly.

**Rendering verification:** new permanent regression probe at `tests/integration/freestyle.spin-juggling-render-probe.routes.test.ts` asserts:
- All 4 routes return 200
- Movement notation section (`class="notation-display"`) renders for each
- Tokenized SPIN/TOE spans render with the expected counts (1 SPIN for spin; ≥2 for double-spin; ≥2 TOE for 2-bag; ≥3 for 3-bag)

8 assertions; all passing. Locks the rendering contract going forward.

---

## 3. Format-drift normalization — 1 fix applied

**Comprehensive bracket-flag casing scan (case-sensitive REGEXP across all 246 populated op_notation rows):**

| Pattern | Count | Outliers |
|---|---|---|
| `[BOD]` / `[DEL]` / `[DEX]` / `[PDX]` / `[XBD]` / `[UNS]` / `[XDEX]` uppercase | universal | — |
| Lowercase bracket-flag | **1** | **`cross-body-sole-stall`: `[set] > sole [xbd]`** |

**Fix applied this slice:** `cross-body-sole-stall` op_notation `[set] > sole [xbd]` → `[set] > sole [XBD]` via red_corrections (single-character casing normalization; sole bracket-flag casing outlier in the entire corpus).

**Distinct from T6 (deferred):** body-direction prefix casing (`(back)`/`(front)` lowercase vs `(BACK)`/`(FRONT)` uppercase) is a separate curator decision per `[D1]` in REPORT.md §2. Bracket-flag casing is universally uppercase by convention — the cross-body-sole-stall fix did not require T6 resolution.

**Other format scans (no actionable findings):**
- Whitespace anomalies (double-space, leading, trailing): **0 rows**
- Surface-stall format `[set] > {surface}` (toe-stall, heel-stall, etc.): **intentional convention**; bracket-count rule doesn't apply to these (the bare `{surface}` token IS the delay event)
- Kick variants `[set] > sole kick` / `[set] > cloud kick`: **intentional asymmetry** per `[[feedback_op_notation_kick_vs_stall]]` (stalls leave surface implicit; kicks name the verb explicitly)
- Body-event verbs `SPIN`/`DUCK`/`DIVE`/`JUMP` uppercase no-parens: **consistent** across all populated rows

---

## 4. Easy omissions — none found that aren't already in the REPORT.md backlog

Scanned the entire remaining gap (28 both-empty + 10 op-empty-but-JOB rows) against the report's classification. Every empty row falls into one of the existing classifications:
- Curator-decision-blocked (5 rows): witchdoctor, blurry-whirl, blurry-torque, blurrage, atomic-torque, triple-around-the-world
- Sui-generis needing curator JOB (3 rows): jani-walker, plasma, bigwalk
- Missing-evidence (5 rows): orbit, wrap, refraction, schmoe (PassBack folk-name), surging
- Set/body primitives + chassis (10 rows): pogo, rooted, clipper, spyro, atomic, quantum, furious, sailing, shooting, around-the-world-kick, hop-over, walk-over
- T4-expanded-C sibling-derivable moderate-risk (~7 rows): paradox-blender, paradox-torque, spinning-torque, fury op_notation, predator, fusion (depends on down-double-down resolution), bedwetter, blizzard, double-around-the-world-heel, sole-survivor, down-double-down

No new actionable mechanical work surfaced beyond what REPORT.md already documents.

---

## 5. Weak-page shortlist (no implementation)

**Rank by visibility / expectation-pressure** (how surprising is the empty page to a casual visitor):

### Tier 1 — Highest visibility (glossary-referenced flagship pages)

| Slug | ADD | State | Why on this list | Resolution path |
|---|---|---|---|---|
| **witchdoctor** | 5 | both-empty | Flagship in glossary §9 §3 (equivalent derivations subsection); ★-eligible exemplar | Curator decision [D5] (pt12-Q2 atomic-symposium) |
| **blurry-whirl** | 5 | both-empty | Common compound; mentioned in glossary §8 composite-modifier examples | Curator decision [D4] (pt12-Q1 transitive-blurry) |
| **blurry-torque** | 6 | both-empty | Same context as blurry-whirl | Curator decision [D4] |
| **atomic-torque** | 6 | op-empty-but-JOB | High ADD; sumo-class compound | Curator decision [D2] (pt9 X-Dex named-exception list) |

### Tier 2 — Recent-promotion-wave high-visibility weak pages

| Slug | ADD | State | Why on this list | Resolution path |
|---|---|---|---|---|
| **down-double-down** | 4 | both-empty | T4-expanded-B deferral (ambiguous "between two same-side clipper delays" structure) | Curator clarification of structure |
| **bigwalk** | 5 | both-empty | "Surging-modified butterfly" — surging is informal-only per Surging Modeling Rule | Curator JOB authoring |
| **sole-survivor** | 5 | both-empty | "Spinning + symposium whirl" per description; possibly an alias of spinning-symposium-whirl (which shipped in T3-A) | Curator clarification: distinct trick or alias? |
| **jani-walker** | 5 | both-empty | Description = "Compound trick." (opaque); pilot prose mentions "Barraging Butterfly" reading | Curator JOB authoring |
| **plasma** | 5 | both-empty | Description = "Compound trick." (opaque); 3rd quantum-family pilot | Curator JOB authoring |

### Tier 3 — Sibling-derivable but moderate-risk (T4-expanded-C candidates)

| Slug | ADD | State | Notes |
|---|---|---|---|
| paradox-blender | 5 | both-empty | paradox + blender; mechanical from paradox-mirage / paradox-drifter pattern + blender body |
| paradox-torque | 5 | both-empty | paradox + torque (torque just shipped in T3-A); mechanical |
| spinning-torque | 5 | both-empty | spinning + torque; mechanical from spinning-X pattern |
| fury | 5 | JOB-OK / op-empty | fury = furious paradox mirage per pt6; op_notation needs furious pattern (no furious-X sibling op exists currently) |
| predator | 4 | both-empty | "Atomic-modified DLO" — mechanical from atomic+DLO pattern |
| fusion | 5 | both-empty | "Atomic-modified DOD" — depends on down-double-down clarification first |
| schmoe | 3 | both-empty | "Stepping-modified legover" (PassBack folk-name); modifier_links empty in DB |
| bedwetter | 4 | both-empty | "Stepping-modified eggbeater" (PassBack folk-name) |
| blizzard | 3 | both-empty | "Stepping-far illusion" (PassBack folk-name); needs `far` token decision |
| double-around-the-world-heel | 3 | both-empty | DATW with heel terminal; doctrine block "canonical vs DATW heel-variant alias" |

### Tier 4 — Set / body primitives + chassis (framing decision pending per REPORT.md §7)

| Slug | ADD | State | Category |
|---|---|---|---|
| clipper | 1 | op-empty | body primitive |
| spyro | 1 | op-empty | body primitive |
| atomic | 2 | op-empty | set primitive |
| quantum | 2 | op-empty | set primitive |
| furious | 2 | op-empty | composite modifier |
| sailing | 2 | op-empty | composite set (pixie + quantum) |
| shooting | 3 | op-empty | pt9 +3 rotational, sui-generis bracket placement |
| hop-over | 2 | op-empty | held-delay leg-over chassis |
| walk-over | 2 | op-empty | held-delay leg-over chassis |
| around-the-world-kick | 1 | both-empty | kick variant per `[[feedback_op_notation_kick_vs_stall]]` |

These pages will look like sparse stubs until the curator framing decision lands. Acceptable for the moment per the modifier-visibility forever-rule (modifier-class rows are render-hidden in many surfaces), but visibility audit should re-check after curator decision.

### Tier 5 — Missing evidence (source research needed)

| Slug | ADD | State | Status |
|---|---|---|---|
| **rake** | (unknown) | both-empty | Curator-blocked; PassBack/Job-1995 source confirmation needed |
| orbit | 2 | both-empty | "small future backfill opportunity; needs curator on entry/exit direction" per memory |
| wrap | 2 | both-empty | Held-delay leg-over family (sibling to hop-over jump variant) |
| refraction | 3 | both-empty | Description "Dexterity, 3 ADD" — needs source-confirmed compositional formula |
| surging | 2 | both-empty | Primitive; no base_trick per Surging Modeling Rule (Red pt5) |

### Tier 6 — Set primitives (modifier-class; render-hidden by design)

| Slug | ADD | State |
|---|---|---|
| pogo | 0 | both-empty |
| rooted | 0 | both-empty |

Per `[[feedback_modifier_public_visibility]]`, modifier-class rows are render-hidden on most surfaces. These two might not need notation at all — curator framing decision per REPORT.md §7 applies.

---

## 6. Risk assessment

| Risk | Likelihood | Impact | Status |
|---|---|---|---|
| cross-body-sole-stall casing fix breaks rendering | Very low | Low | Tests 4,616/4,616 green post-fix |
| Spin/juggling probe is brittle | Low | Low | 8 assertions; reasonable margin; routes-level checks |
| Curator perceives Tier 1/2 weak pages as showstopper for handoff | Medium | Medium | Already flagged in REPORT.md; this sweep adds visibility ranking |
| Tier 4 (set/body primitives + chassis) framing decision unclear | Low | Medium | REPORT.md §7 documents the 3-option decision space |
| New cleanup-sweep file fragments the handoff package | Low | Low | This file cross-references REPORT.md as the authoritative full backlog; both files together = handoff package |

**No high-risk items.**

---

## 7. Cumulative coverage post-cleanup (final session state)

| Field | Pre-audit | Pre-cleanup | Post-cleanup | Total delta |
|---|---|---|---|---|
| JOB populated | 104 (37%) | 256 (90%) | **256 (90%)** | +152 |
| op_notation populated | 210 (74%) | 246 (87%) | **246 (87%)** | +36 |
| Both-empty bucket | 53 | 28 | **28** | −25 |
| Tests passing | (variable) | 4,608 | **4,616** | +8 (spin/juggling probe) |

---

## 8. Files changed this sweep

| File | Change | Reason |
|---|---|---|
| `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` | +1 line | cross-body-sole-stall `[xbd]` → `[XBD]` |
| `tests/integration/freestyle.spin-juggling-render-probe.routes.test.ts` | new file | Permanent regression probe for spin/juggling rendering |
| `exploration/trick-stabilization-handoff/CLEANUP_SWEEP.md` | new file | This report |

---

## 9. Handoff package — final composition

```
exploration/trick-stabilization-handoff/
├── REPORT.md          ← authoritative full backlog (324 lines; 5 curator decisions; per-row tables)
└── CLEANUP_SWEEP.md   ← this file (pre-handover sweep summary + weak-page shortlist)
```

Read REPORT.md for the comprehensive curator-action queue. Read CLEANUP_SWEEP.md for the rendering-consistency state + visibility-ranked weak-page shortlist.

**Wave methodology** (mechanical JOB rule + sibling-pattern op derivation + 5-class taxonomy + description-column-as-FB.org-source) is captured in the `footbag-freestyle-dictionary` skill SKILL.md §B.3 for future-session pickup.

**Memory entries** (live outside repo at `~/.claude/projects/-home-james-projects-footbag-platform/memory/`):
- `project_freestyle_state.md` — wave inventory + 5 curator decisions [D1]–[D5] + next-session ROI queue
- `project_set_encyclopedia_surface.md` — Set Encyclopedia Phase 1 shipped / Phase 2 deferred

---

**Cleanup sweep complete. Handoff package ready.**
