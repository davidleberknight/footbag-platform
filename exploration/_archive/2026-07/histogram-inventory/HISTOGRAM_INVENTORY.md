# Histogram Inventory -- Freestyle quantitative surfaces

Read-only audit of every histogram / frequency-distribution currently present across the
glossary, observational universe, topology-analysis docs, coverage-promotion analyses, and
generated content modules. No counts were recalculated; this records what exists, its source,
and whether it survived the notation-recovery and promotion work.

## TL;DR

- **Exactly two of the six conceptual families are embedded in the glossary**, as the user
  suspected: **(3) Terminal Topology** ("How tricks end" / First-class families) and
  **(4) Entry Topology** ("How tricks begin"). Both are bar charts.
- All four topology families (Terminal, Entry, Body, Component) have a **computed source
  audit in `exploration/`**, all regenerated together **2026-06-07 19:46**, all reading
  `operational_notation` + curated `freestyle_trick_modifier_links` (never `trick_family` for
  identity). Corpus at audit time: **651 active, 473 with a formula (72.7%), 178 notation-less.**
- **Difficulty (ADD)** has no dedicated bar histogram anywhere; it appears only as a live
  group-by on the observational page and an avg-ADD-by-era table on `/freestyle/insights`.
- **Dexterity Ecology** exists only as the dex rows inside the Component audit -- no standalone
  audit, not rendered publicly.
- **Currency:** the two glossary histograms and the four exploration audits are **baked
  snapshots dated 2026-06-07**. The merged dashboard (2026-06-08) reports notation coverage
  ~89% vs the audits' 72.7% -- i.e. **notation recovery has lifted coverage by roughly +100
  formula-bearing tricks since the snapshot, so the topology-derived counts now undercount and
  need recalculation.** (Confirm the denominators against the live DB before re-publishing.)

---

## 1. The six conceptual families -- coverage matrix

| # | Family | Computed source (exploration) | Rendered publicly? | In glossary? | Live or baked |
|---|---|---|---|---|---|
| 1 | Difficulty Distribution (ADD) | none (no ADD bar audit) | observational group-by + insights era-table | no | live (obs) / baked (insights) |
| 2 | Dexterity Ecology | embedded in Component audit (dex rows) | no | no | computed audit only |
| 3 | Terminal Topology (families) | `terminal-topology-audit/RANKING.md` | **yes -- glossary** | **YES** | baked snapshot |
| 4 | Entry Topology (sets/entry) | `entry-topology-audit/ENTRY_RANKING.md` | **yes -- glossary** | **YES** | baked snapshot |
| 5 | Body Topology (body modifiers) | `body-topology-audit/BODY_RANKING.md` | no | no | computed audit only |
| 6 | Component Ecology | `component-ecology-audit/COMPONENT_RANKING.md` | no | no | computed audit only |

**Two families are public, both in the glossary; four are exploration-only.**

---

## 2. The two glossary histograms (the embedded pair)

Both are CSS bar charts (`.gloss-histogram` / `.gloss-bar`, `style.css:2916-2934`), both fed by
the single baked module `src/content/freestyleTopologyHistograms.ts`, both shaped through
`topologyHistogramRows()` (`freestyleService.ts:5593-5603`, which quantizes each count to a
5%-step `--w{n}` width class -- only the **bar width** is computed live; the **counts are baked**).

### Histogram G1 -- Entry Topology -- "How tricks begin"
- **Location:** template `src/views/freestyle/glossary.hbs:514-531` (§Timing & Sets,
  `#section-timing-sets`); data `freestyleTopologyHistograms.ts:62-75` (`ENTRY_HISTOGRAM`);
  wired `freestyleService.ts:7992`.
- **Title:** "How tricks begin" (aria: "Set surfaces and set systems by number of documented tricks").
- **Metric:** documented-trick count per set surface (formula position-0) / set system (curated membership). Two tiers: surface, system.
- **Source data:** baked from `exploration/entry-topology-audit/ENTRY_RANKING.md`.
- **Current counts:** Toe set 207, Clip set 197, Symposium 79, Paradox 63, Pixie 60, Fairy 55,
  Stepping 50, Quantum 21, Atomic 11, Blurry 6, Nuclear 6, Furious 2.
- **Date:** none in code; git 2026-06-07; module header self-describes as a "hard-coded snapshot."
- **Family:** (4) Entry Topology.
- **Drift note:** the source audit lists `generic-set 60`, which the live `ENTRY_HISTOGRAM`
  **omits** -- already drifted from its own source.

### Histogram G2 -- Terminal Topology -- "How tricks end" / First-class families
- **Location:** template `src/views/freestyle/glossary.hbs:655-663` (§Core Trick Families,
  `#section-families`, under `<h3>` "First-class families"); data
  `freestyleTopologyHistograms.ts:31-59` (`FAMILY_HISTOGRAM`); wired `freestyleService.ts:7991`.
- **Title:** "How tricks end" (prose) / heading "First-class families" (aria: "Terminal surfaces
  and family lineages by recursive descendant count").
- **Metric:** recursive descendant count per terminal family (subtree, branches folded), + the two surface roots' landing counts. Tiers: surface, family. Deliberately *not* `trick_family` (why Swirl 29 > Pickup 27).
- **Source data:** baked from `exploration/terminal-topology-audit/RANKING.md`.
- **Current counts:** Clipper Stall 328, Toe Stall 252, Osis 84, Whirl 74, Legover 71, Mirage 69,
  Butterfly 48, Illusion 34, Swirl 29, Pickup 27, Blender 22, Torque 22, Double Legover 16,
  Drifter 14, Barfly 13, Eggbeater 13, Double-Over-Down 12, Inside Stall 11, Eclipse 9, Flail 9,
  Barrage 8, Paradon 6, Butterfly-Swirl 5, Dyno 5, Dada-Curve 4, Flurry 3.
- **Date:** none in code; git 2026-06-07; "measured snapshot."
- **Family:** (3) Terminal Topology.
- **Guard:** `tests/unit/freestyle-topology-histogram.test.ts` cross-checks the **family-tier
  roster** against live `PUBLIC_DISPLAY_FAMILIES` (drift in *membership* fails CI) but does
  **not** recompute the **counts** -- so the numbers can silently drift.

---

## 3. Exploration topology-analysis audits (the computed source layer)

All four are re-runnable computed audits rendering ASCII bars into markdown, git-dated
**2026-06-07 19:46**, corpus 651 active / 473 with notation. Caveat surfaced by the audit:
no standalone `.py` generator is checked in beside them; reproducibility is asserted via
documented inputs/constants.

| ID | File | Family | Metric / source | Top counts (verbatim) |
|---|---|---|---|---|
| T3 | `exploration/terminal-topology-audit/RANKING.md` | (3) Terminal | recursive descendants per terminal identity; reads `operational_notation` | clipper-stall 328, toe-stall 252, osis 84, whirl 74, legover 71, mirage 69, butterfly 48, illusion 34, swirl 29, pickup 27 ... |
| T4 | `exploration/entry-topology-audit/ENTRY_RANKING.md` | (4) Entry | tricks per entry identity; opening `operational_notation` token + `modifier_links` | toe-set 207, clip-set 197, symposium 79, paradox 63, generic-set 60, pixie 60, fairy 55, stepping 50, quantum 21, atomic 11 ... |
| T5 | `exploration/body-topology-audit/BODY_RANKING.md` | (5) Body | tricks per body-action ecosystem; curated `modifier_links` (not formula token) | ducking 84, spinning 78, gyro 38, diving 24, tapping 21, miraging 16, barraging 10, whirling 9, swirling 8, railing 3 ... (axis totals: Body Rotation 117, Body-Passage 108, Dexterity-Operator 68) |
| T6 | `exploration/component-ecology-audit/COMPONENT_RANKING.md` | (6) Component + (2) Dexterity | occurrence per atomic component; `operational_notation` (473) + curated membership | cross-body 246, clipper-catch 243, op-in-dex 220, toe-set 207, spin 206, clipper-set 197, toe-catch 196, op-out-dex 194, same-out-dex 144, same-in-dex 135 ... (dex rows = Dexterity Ecology) |

Supporting synthesis / planning (cite the audits; not new datasets):
- `exploration/topology-synthesis-audit/GLOSSARY_MOCKUP.md` -- **static design mockup** of G1+G2 placement (the source of the current glossary layout). git 2026-06-07.
- `exploration/topology-synthesis-audit/DICTIONARY_GLOSSARY_SYNTHESIS.md` -- synthesis writeup + findings matrix (re-quotes all four). git 2026-06-07.
- `exploration/topology-coverage-sprint/TOPOLOGY_COVERAGE_BASELINE.md` -- coverage frequency table (651 / 473 / 178; 167/178 still carry `trick_family`; 11 fully invisible). git 2026-06-07.
- `exploration/topology-coverage-sprint/TOPOLOGY_COVERAGE_PROJECTION.md` -- **"Histogram Projection"**: projects each topology histogram if notation-less tricks gain notation (clipper-stall 328 -> ~411, toe-stall 252 -> ~308, coverage 72.7% -> 92.8% -> 100%). This is effectively the recalculation target.
- `exploration/_archive/2026-05/nonstandard-topology-audit-2026-05-24/` -- the 270-row predecessor snapshot (Terminal + Entry). Superseded; archive only.

---

## 4. Observational universe

The `/freestyle/observational` ("Emerging Vocabulary") page has **distribution displays computed
live**, plus a baked stats substrate. No bar charts.

- **O1 -- Frontier-health stat grid** (`observational.hbs:58-68`, shaped `freestyleService.ts:8130-8144`):
  count of frontier names per promotion-status bucket (Promotion Ready / Needs Authoring /
  Doctrine Blocked / Folk-Unresolved / Alias-Duplicate) + % Structurally Understood. **Live**
  (`.length` of filtered sections). `generatedOn` 2026-06-08. Governance distribution, not one of the 6.
- **O2 -- ADD group-by** (`freestyleService.ts:8040-8058` `groupByAdd` -> `observational.hbs:47-54,90-97`):
  candidate tricks per derived/provisional ADD, "N ADD (count)". **Live.** -> **family (1) Difficulty.**
- **O3 -- Baked stats object** (`src/content/freestyleObservationalUniverse.ts:1516-1580`,
  `OBSERVATIONAL_UNIVERSE_STATS`): total 1440, canonicalPublished 510, universeTotal 2460,
  promotionFrontier 156, lexicalArchive 1270; intake buckets (promotion_ready 47, doctrine_pending
  97, alias 415, low_confidence 693 ...); sources SG 602 / FM 419 / PB 287 / FB 113 / MULTI 19;
  `generatedOn 2026-06-08`. Baked governance/source substrate, not one of the 6.
- Note: `src/content/freestyleObservationalTricks.ts` now only supplies curator-note overrides; carries no histogram.

---

## 5. Coverage-promotion analyses

- **C24 -- `legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py`** (`render_report()`
  447-566): coverage-status distribution (§1), per-family strong/weak/none/pending + completion %
  (§3), media-health (§4). **Computed live at run** (needs `--db`). git 2026-06-01. Measures
  *media coverage* by `trick_family` -- adjacent to (3) Terminal but not a topology histogram.
- Scripts 26 (HoF) / 28 (BAP): identity validators, **no distribution / no histogram**.
- **`exploration/promotion-cohorts/FRONTIER_ANALYSIS_2026-05-23.md`**: publication-frontier tier
  table (Total 1679, >=4 sources 393, Tier 1 236, Tier 2 156, Tier 3 1; notation-backfill candidates 117)
  + Tier-1 divergence spread. Baked snapshot, git 2026-05-23. Publication-readiness distribution, not one of the 6.
- **`exploration/coverage-promotion-merged/DASHBOARD.md`**: corpus metrics table (documented 629 /
  raw active 651 / notation ~89%). git 2026-06-08. Single table, not a histogram -- but the
  **load-bearing currency signal** (89% notation now vs 72.7% at audit time).

---

## 6. Generated content modules (`src/content/freestyle*.ts`)

- **M1 -- `freestyleTopologyHistograms.ts`** = the two glossary histograms G1 + G2 (see §2).
  git 2026-06-07 20:32. The only baked count arrays that render as public bar charts.
- **M2 -- `freestyleEditorial.ts`** -- `INSIGHTS_DIFFICULTY_ERAS` (`:203-209`) avg-ADD-by-era
  table on `/freestyle/insights`: 2001-2003 chains 29 / avgAdd 3.52; 2004-2006 93 / 3.46;
  2007-2009 118 / 3.30; 2010-2015 53 / 3.26; 2016-2025 82 / 3.12. Plus `INSIGHTS_MOST_USED`
  frequency. Baked, git 2026-06-06. -> family (1) Difficulty (over time). Source = Sick3 sequence
  archive (competition history), **not** the dictionary corpus -- so **unaffected by promotion/notation work.**
- All other `freestyle*.ts` use "distribution/breakdown" only in prose; **no other baked histogram.**

---

## 7. Currency verdict (post notation-recovery + promotion)

| Histogram | Currency | Why |
|---|---|---|
| G1 Entry (glossary) | **STALE -- recalc** | baked 2026-06-07 at 72.7% notation; also already drifted (`generic-set 60` dropped) |
| G2 Terminal (glossary) | **STALE -- recalc** | baked 2026-06-07; counts undercount post-notation-recovery; CI guards roster, not counts |
| T3/T4/T6 audits | **STALE -- recalc** | read `operational_notation` at 473/651; notation now ~89% (~+100 formula-bearing tricks) |
| T5 Body audit | **PARTIALLY stale** | reads curated `modifier_links` not notation, so less affected by notation recovery, but active-count promotion still shifts it |
| TOPOLOGY_COVERAGE_PROJECTION | reference | already models the expected post-recovery shift; use as the recalc target |
| O1/O2 observational | **CURRENT** | computed live at request time |
| O3 obs stats / FRONTIER_ANALYSIS / DASHBOARD | snapshots | governance/source figures; re-derive on demand, not topology |
| C24 media coverage | **CURRENT when re-run** | computed at script run |
| M2 insights eras | **CURRENT** | historical Sick3 data, independent of dictionary promotion |

**Bottom line:** every topology-derived histogram (the two public glossary charts + the four
exploration audits) predates the notation recovery that lifted formula coverage from 72.7% to
~89%, so they undercount and must be recalculated against the live DB before re-publishing.
The live observational distributions and the historical insights table are current.

---

## 8. Recommendations

### Retain (design is good; keep the surface)
- **G1 + G2 glossary histograms** -- the "How tricks begin / end" pedagogical framing is strong
  and well-placed; keep the design, refresh the data (below).
- **The four exploration audits** as the computational source-of-truth engine.
- **O1/O2 observational** live distributions and **M2 insights era table** -- current, leave as-is.

### Recalculate (data only; same design)
- Re-run all four topology audits against the current DB, then **re-derive G1 + G2 from the
  re-run audits** -- and fix the `generic-set 60` omission so the glossary matches its source.
- Confirm the 72.7% -> ~89% notation jump and the active-trick count against the live DB first,
  so the recalculation target is exact (`TOPOLOGY_COVERAGE_PROJECTION.md` estimates the magnitude).

### Redesign (fix the fragility)
- **Stop baking the glossary histogram counts.** The current model (hand-synced array in
  `freestyleTopologyHistograms.ts`, CI guarding only the roster) has already drifted once.
  Replace with either (a) live computation at request time (the dictionary browse buckets already
  compute distributions live), or (b) a build-time generated module with a CI check that fails on
  any count drift -- one computation, one source, no manual sync.
- **Difficulty (ADD)** has no real histogram -- only a group-by and an era table. Design a proper
  per-trick ADD-band bar chart from the live corpus.
- **Dexterity Ecology** should be lifted out of the Component audit into its own first-class chart.

### Suitable for a permanent "Freestyle by the Numbers" landing section
All six families, computed live from one source:
1. **Difficulty (ADD)** -- new ADD-band histogram (design needed).
2. **Dexterity Ecology** -- promote the dex rows to a standalone chart.
3. **Terminal Topology** -- reuse G2.
4. **Entry Topology** -- reuse G1.
5. **Body Topology** -- promote T5 to public.
6. **Component Ecology** -- promote T6 (advanced/reference tier).

### Canonical home: landing primary, glossary secondary
- Make the **single live computation** the canonical data home (not the glossary's baked module).
- A **"Freestyle by the Numbers" landing section becomes the primary public surface** for the full
  six-family quantitative picture.
- The **glossary retains G1 + G2** as inline pedagogical illustration ("how tricks begin / end"),
  but sourced from that same computation -- so the two surfaces can never disagree.
