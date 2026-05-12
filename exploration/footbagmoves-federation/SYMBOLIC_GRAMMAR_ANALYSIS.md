# SYMBOLIC-GRAMMAR-1 Analysis — Master FootbagMoves/PassBack Symbolic Spreadsheet

**Status:** Observational symbolic-grammar layer. Independent of IFPA canonical dictionary. No IFPA mutation; no aliases inserted; no ADD-value changes; no canonical family correlation executed yet (placeholder section §10 only).

**Generator:** `legacy_data/scripts/build_symbolic_grammar_master.py` (single-file, no orchestration).

**Inputs:**
- `legacy_data/out/footbagmoves_inventory.csv` — 573 rows (FM canonical extraction); 377 with operational notation.
- `legacy_data/tools/trick_video_discovery/passback_review_queue.csv` — 106 rows (PassBack record queue; no set-arc notation column, but carries technical-name structural reading).

**Outputs:**
- `SYMBOLIC_GRAMMAR_MASTER.xlsx` — 679-row workbook (freeze-pane, header-styled).
- `SYMBOLIC_GRAMMAR_MASTER.csv` — same as XLSX, CSV round-trip safe.
- `SYMBOLIC_GRAMMAR_UNRESOLVED_TOKENS.csv` — unresolved-token inventory with occurrence counts + example rows.
- `SYMBOLIC_GRAMMAR_FAMILY_SUMMARY.csv` — topology-family + symbolic-family counts with examples.

---

## 1. Row counts

| Cohort | Rows |
|---|--:|
| Total | 679 |
| FootbagMoves inventory | 573 |
| PassBack review queue | 106 |
| With operational notation | 377 (FM only) |
| Without operational notation (PassBack rows + FM rows where notation was absent in source) | 302 |

---

## 2. Parse success / failure rates

Among the 377 rows with operational notation:

| Confidence | Rows | % of notation rows |
|---|--:|--:|
| HIGH (0 unresolved tokens) | 354 | 93.9% |
| MEDIUM (1 unresolved token) | 20 | 5.3% |
| LOW (2+ unresolved tokens) | 3 | 0.8% |
| Total | 377 | 100.0% |

Review-status disposition:

| Status | Rows |
|---|--:|
| `ok` (high-confidence + ADD delta in {None, 0}) | 354 |
| `needs_review` (low-confidence OR unresolved tokens) | 23 |
| `source_has_no_notation` (PassBack rows + FM rows where notation column was empty) | 302 |

The parser handles two notation styles: title-case parens (majority — `Toe > Op Out (DEX) >> Op In (DEX) > Op Toe (DEL)`) and ALL-CAPS brackets (rare — `SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]`). Bracket-style notation is normalized to paren-style during pre-processing.

---

## 3. Most common symbolic components

Component-flag occurrence across all 377 notation rows (extracted post-parse from the `component_flags` column):

| Component flag | Approx. occurrences | Heuristic ADD contribution |
|---|--:|--:|
| `DEX` (dex flick) | 803 | +1 |
| `DEL` (delay/terminal stall) | 369 | +1 |
| `BOD` (body action) | 292 | +1 |
| `XBD` (cross-body) | 228 | +1 |
| `XDEX` (X-dex) | 83 | +1 |
| `PDX` (paradox) | 69 | +1 |
| `UNS` (unusual surface) | 3 | 0 (non-ADD per heuristic) |
| `OP` (operational marker in bracketed-style) | rare | 0 |

Most common pre-state flags:
- `back` (direction prefix, frequent on Spin/Whirl/Swirl)
- `front` (less common direction prefix)
- `no plant while` (symposium-style; load-bearing for execution semantics)
- `rooted` (3 rows; corresponds to IFPA `rooted` modifier family)

Most common contact/surface tokens (as start or finish):
- `Clip` (start: 188 rows) / `Op Clip`, `Same Clip` as finish
- `Toe` (start: 172 rows) / `Op Toe`, `Same Toe` as finish
- `Set` (rare — 4–10 rows total across SET/Set variants)
- `Flapper` (3 rows — paired with UNS)

---

## 4. Most common topology families (broad)

From `SYMBOLIC_GRAMMAR_FAMILY_SUMMARY.csv`:

| Topology family | Row count | Example moves |
|---|--:|---|
| `spin-family` | 115 | Alex Zerbe is the greatest, Blender, Blister, Dyno (far) |
| `multi-dex-family` (3+ dex chain, no body action) | 81 | Enterrage, Flaming Homer, Flog, Flurry |
| `double-dex-family` | 43 | Barrage, Bubba Beater, Barfly, Barfry |
| `duck-family` | 39 | Assassin, Cascade, Guillotine, Puck, Wahnsinn |
| `whirl-family` | 19 | Blaze, Bling Blang, Feral, Hurl, Whirr |
| `xdex-family` | 16 | Atomsmasher, Dellusion, Omelette, Slap, Witchdoctor |
| `butterfly-walk-family` | 15 | Arcwalk, Dimwalk, Flipwalk, Parkwalk, Ripwalk |
| `swirl-family` | 13 | Dragonstein, Furnace, Phase, Snapdragon, Spitfire |
| `single-dex-family` | 10 | Butterfly, Dragster, Drifter, Drifter (same-side) |
| `dive-family` | 10 | Hatchet, Red Ribbon, Zulu Le Loup, Arachnophobia |
| `paradox-family` | 4 | Royale, Whisk, Snowflake |
| `unusual-surface-family` | 3 | Buttersole, Ricochet, Singularity |
| `uncategorized` | 9 | Nova, Flail, Symp Mirage, Blacula, Dolomite |

**Symbolic family (narrow) examples** (clustered by start_contact + topology + final_contact):

| Symbolic family | Rows |
|---|--:|
| `clip-spin-clip` | 36 |
| `toe-multi-dex-toe` | 36 |
| `clip-spin-whirl` | 24 |
| `toe-spin-clip` | 22 |
| `clip-multi-dex-toe` | 19 |
| `toe-multi-dex-clip` | 17 |
| `clip-spin-toe` | 15 |
| `toe-double-dex-toe` | 13 |
| `toe-duck-toe` | 12 |
| `toe-xdex-toe` | 11 |
| `toe-double-dex-clip` | 11 |
| `clip-duck-clip` | 10 |
| `clip-front-whirl-clip` | 9 |

Topology-only clustering (no IFPA mapping) already surfaces ~13 narrow families with ≥10 rows each — strong candidates for future filtered UI surfaces.

---

## 5. ADD source-vs-derived deltas

Of the 377 rows with notation, the additive heuristic (DEX=DEL=BOD=XBD=PDX=XDEX=+1, UNS=0) produces:

| Delta (source − derived) | Rows | % |
|---|--:|--:|
| 0 (exact match) | 358 | 94.96% |
| +1 (source higher than heuristic) | 9 | 2.39% |
| −1 (source lower than heuristic) | 9 | 2.39% |
| +3 (large source-over delta) | 1 | 0.26% |

**Delta-driving patterns identified:**

### 5.1 −1 deltas (heuristic over-counts)

Most common cause: **`XDEX` flag** treated as +1 by heuristic. Per pt1 IFPA ruling, XDEX is narrow ("specific tricks only") — when source carries XDEX on a 3-ADD trick like **Atomsmasher** (`Toe > Op Out (DEX) >> Op In (DEX)(XDEX) > Op Toe (DEL)` = 3 source vs 4 heuristic), the heuristic over-counts.

Examples (delta=−1):
- Atomsmasher (src=3, derived=4) — DEX+DEX+XDEX+DEL with XDEX double-count.
- Revstein (src=4, derived=5) — same DEX+XDEX double-count pattern, plus source typo `Fornt Swirl`.
- Swifter (src=4, derived=5) — DEX+PDX+DEX+XBD+DEL where PDX may be a tagged-not-counted modifier per a stricter "independent paradox" reading.

### 5.2 +1 deltas (heuristic under-counts)

Most common cause: **`Front Whirl` / `Back Whirl` qualifier on a dex** appears to carry an implicit +1 not captured by component flags alone. Plus **`UNS` (unusual surface)** apparently contributes +1 in source ADDs but is suppressed in the heuristic.

Examples (delta=+1):
- Blaze (src=4, derived=3) — `Op Front Whirl (DEX) >> Op In (DEX) > Op Toe (DEL)`. Front Whirl carries implicit +1.
- Buttersole (src=4, derived=3) — `Set >> Op Out (DEX) > Op Flapper (XBD)(UNS)(DEL)`. UNS apparently +1 in source.
- Furnace (src=4, derived=3) — same Front Whirl / Back Swirl qualifier pattern (also has source paren-malformation `(BOD`).

### 5.3 +3 delta (outlier)

- **Railwalk** (src=6, derived=3) — `Toe > (rooted) Same In (DEX)(BOD) > Op Out (DEX)`. No terminal contact, no XBD, no DEL recorded in source notation; source ADD reads 6 but only 3 component-flag points are visible. Likely either source-notation truncation OR the `(rooted)` pre-state flag carries far more implicit ADDs than the heuristic accounts for. Flagged for review.

---

## 6. Unresolved-token inventory

From `SYMBOLIC_GRAMMAR_UNRESOLVED_TOKENS.csv`. 14 distinct unresolved-token strings across 23 needs-review rows. Three categories:

### 6.1 Recursive set-names (legitimate; not parser bugs)

These are named tricks reused as the leading position of another notation (a known pattern documented in `OPERATIONAL_NOTATION_GRAMMAR.md`):

| Token | Occurrences | Example |
|---|--:|---|
| `dragon` | 8 | Dragonstein |
| `frigidosis` | 3 | Arcwalk |

These are not malformed — the source notation references a known canonical move as a substructure. Future work: registry of recursive set-names to dispatch into nested sub-parsing.

### 6.2 Source data quality issues

| Token | Occurrences | Notes |
|---|--:|---|
| `fornt swirl` | 1 (Revstein) | Source typo for "Front Swirl" |
| `fornt whirl` | 1 (Tomahawk) | Source typo for "Front Whirl" |
| `[/quote]` | 1 (Zulu Le Loup) | Forum-quote-tag leak from source paste |
| `(bod`, `jump (bod` | 2 | Source missing closing paren on `(BOD)` flag |
| `xbd rake dex)` | 1 (Snowflake) | Source missing opening paren |
| `(same)` | 1 (Spitfire) | Atypical: side prefix wrapped in parens |

### 6.3 Atypical token positions

| Token | Occurrences | Notes |
|---|--:|---|
| `xbd toe`, `xbd rake`, `crossbody rake` | 4 total | XBD used as a prefix to a contact rather than as a component-flag suffix. Worth handling in a parser revision. |
| `alt-side:same` | 2 | Captured from the early bracketed-style "SAME or OP OUT" notation; not a malformation — the parser annotates the alternative side branch explicitly. |
| `plant` | 2 (Yoda) | Likely fragment from a partial-match on `no plant while`. |

**Total unresolved-token volume:** ~23 needs-review rows out of 377 notation rows (6.1%). Of those, ~5 rows trace to actual source-data quality issues; the rest are legitimate parser-gaps (recursive set-names + XBD-as-prefix) that a parser revision could close.

---

## 7. Example rows by symbolic family

Selected examples illustrating the symbolic-grammar layer's discriminative power. All ADD values are *source* values (authoritative for the source); derived ADDs are diagnostic only.

### 7.1 `toe-xdex-toe` (xdex-family)

```
Atomsmasher    Toe > Op Out (DEX) >> Op In (DEX)(XDEX) > Op Toe (DEL)        src=3 derived=4 delta=-1
```
Atomsmasher shows the cleanest XDEX-over-counting pattern: every DEX/XDEX/DEL counts in the heuristic, but the source ADD treats XDEX as not-additive (consistent with pt1 narrow-XDEX ruling).

### 7.2 `clip-spin-clip` (spin-family, 36 rows)

```
Alex Zerbe is the greatest    Clip >> (back) Spin (BOD) >> (no plant while) Same In (DEX) > Same Clip (XBD)(DEL)
                              src=4 derived=4 delta=0
```
Body-action spin + no-plant-while symposium-style uptime + cross-body delay finish. Heuristic matches exactly.

### 7.3 `unusual-surface-set-to-flapper` (unusual-surface-family)

```
Buttersole    Set >> Op Out (DEX) > Op Flapper (XBD)(UNS)(DEL)    src=4 derived=3 delta=+1
```
UNS is the diagnostic flag. Source treats UNS-positioned compounds as +1; heuristic suppresses UNS by design.

### 7.4 `clip-front-whirl-clip` (whirl-family)

```
Blaze    Clip > Op Front Whirl (DEX) >> Op In (DEX) > Op Toe (DEL)    src=4 derived=3 delta=+1
```
The `Front Whirl` qualifier on the first DEX appears to carry implicit +1.

### 7.5 `butterfly-walk-family` (15 rows)

```
Ripwalk    Clip >> Op Out (DEX)(BOD) > Op Clip (XBD)(DEL)    src=4 derived=4 delta=0
```
Walking-family identification triggered by the move name containing "walk" — observational classification, not IFPA family assignment.

### 7.6 `set-no-plant-while-symposium-style` (uncategorized)

```
Flail    SET > (no plant while) [BOD] OP OUT [DEX] > OP TOE [DEL]    src=3 derived=3 delta=0
```
Bracket-style notation normalized; symposium-flag preserved.

---

## 8. Examples where source ADD and derived ADD differ

19 rows in total (9 +1 deltas, 9 −1 deltas, 1 +3 outlier). Full list under review_status='needs_review' in `SYMBOLIC_GRAMMAR_MASTER.csv` with `notes` column carrying the delta.

The deltas are not parser bugs — they are *observed grammatical signals* that the FM operational-notation layer differs from FM source-ADD assignment along recognizable axes:

1. **XDEX is not additive in source ADDs** (pt1-aligned narrow reading).
2. **UNS contributes +1 in source ADDs** but is not a body/dex contribution by execution mechanics.
3. **Front/Back Whirl + Swirl qualifiers carry implicit +1** that doesn't appear as a flag.
4. **rooted pre-state may carry large implicit ADDs** (Railwalk +3 outlier).
5. **PDX-on-DEX may sometimes not double-count** (Swifter and a few others read as derived-too-high).

These observations are evidence for future IFPA correlation work but require no parser changes nor IFPA mutations.

---

## 9. Candidate glossary terms + UI filter candidates

Based on the topology + tag inventory, durable terminology candidates for a future symbolic-grammar glossary surface:

| Term | Definition (observational) | Filter affordance |
|---|---|---|
| Start contact | First touch in the trick sequence | `toe-start` / `clip-start` / `set-start` filter |
| Final contact | Terminating delay surface | `toe-finish` / `clip-finish` / `flapper-finish` filter |
| Uptime dex | A dex performed during ascending bag motion (pre-body-action) | "Has 1 uptime dex" / "Has 2 uptime dex" filter |
| Downtime dex | A dex performed during descending bag motion (post-body-action) | "Has downtime dex" filter |
| Midtime body action | A body movement (spin/duck/dive) between dex steps | `spin-family` / `duck-family` / `dive-family` filter |
| Component flag | A property of a single beat in the notation (DEX/DEL/BOD/XBD/PDX/XDEX/UNS/OP) | Multi-select facets |
| Pre-state flag | A modifier on the next beat (back/front/no-plant-while/rooted) | Modifier presence filter |
| Symbolic family | Topology cluster (start + topology + finish) | Family browse mode |
| Recursive set-name | Named trick reused as a substructure (Dragon, Frigidosis) | Substructure lookup |
| Unusual surface (UNS) | Non-standard delay/contact surface (flapper, sole, etc.) | Surface filter |

These candidates are **purely observational**; they do not propose changes to the IFPA dictionary or to the modifier table.

---

## 10. Later IFPA correlation plan (placeholder; NOT executed)

This section outlines how the observational symbolic-grammar layer could be correlated with the canonical IFPA dictionary in a future phase. **No correlation work is performed in SYMBOLIC-GRAMMAR-1.** This section exists so the eventual correlation phase has a clear scope target.

### 10.1 Symbolic family ↔ IFPA `trick_family`

The 13 narrow symbolic families (`clip-spin-clip` 36 rows, `toe-multi-dex-toe` 36, etc.) are topology-clusters of FM-observed execution mechanics. The IFPA `trick_family` field is canonical ontology (e.g., `butterfly`, `mirage`, `osis`).

**Correlation question:** Do FM symbolic-family rows tend to cluster within a single IFPA `trick_family`, or do they span multiple? Answer would inform whether observational topology rolls up to canonical family or to a different axis.

Approach (future):
- For each row with a populated `technical_name`, attempt resolution against `freestyle_trick_aliases` + `freestyle_tricks.canonical_name` (alias-aware resolver per existing identity-pipeline pattern).
- For each successful resolution, capture (symbolic_family, IFPA_trick_family) pair.
- Compute family-overlap matrix; surface high-overlap pairs as evidence for either (a) symbolic-family-as-IFPA-family-projection or (b) symbolic-family-as-cross-cutting-axis.

### 10.2 Symbolic tags ↔ IFPA `freestyle_trick_modifier_links`

The operator-tag set (`spinning`, `ducking`, `diving`, `paradox`, `symposium-no-plant`, `xbd`, `unusual-surface`, etc.) overlaps semantically with the IFPA modifier table (`spinning`, `ducking`, `paradox`, `nuclear`, `symposium`, `quantum`, etc.).

**Correlation question:** Where do operator-tag patterns and IFPA modifier-link records agree, and where do they disagree?

Approach (future):
- For each resolved row, compare operator_tags (this layer) vs `freestyle_trick_modifier_links` (IFPA).
- Three buckets: (a) full agreement, (b) tag-present-but-no-link (potential modifier-link gap), (c) link-present-but-no-tag (operational notation lacks the observable signal).
- Bucket (b) feeds into the federation reconciliation track (`project_freestyle_federation.md`); bucket (c) flags rows where operational notation may be incomplete.

### 10.3 Source aliases ↔ IFPA `freestyle_trick_aliases`

FM `alternate_names` column carries pipe-delimited alias strings. IFPA `freestyle_trick_aliases` is the canonical alias table.

**Correlation question:** Which FM `alternate_names` strings resolve to IFPA aliases, and which are unrecorded? Unrecorded names are candidate alias-additions (subject to the existing `PASSBACK_ALIAS_CANDIDATES.csv` review queue protocol).

Approach (future):
- Normalize each FM `alternate_names` token; look up in `freestyle_trick_aliases.alias_text`.
- Unresolved tokens → candidate alias list for human review.
- NO automatic insertion (per SYMBOLIC-GRAMMAR-1 constraint).

### 10.4 Source ADD ↔ IFPA ADD

FM `source_adds` is the FM-recorded ADD count. IFPA `freestyle_tricks.adds` is the canonical asserted ADD.

**Correlation question:** Which FM rows agree with IFPA on ADDs, and which disagree (federation_math_divergence candidates)?

Approach (future):
- For each resolved row, compare source_adds vs IFPA asserted.
- Disagreements either land in `FM_MATH_DIVERGENCES.csv` (currently 22 rows) or surface as new questions for the Red review queue.
- This is the existing federation track — symbolic-grammar layer can systematize the data flow without changing the track's rules.

### 10.5 Derived topology ↔ UX3 filters

The 13 narrow symbolic families form a candidate filter taxonomy for a future UX3 trick-browse surface.

**Correlation question:** Are topology-family filters orthogonal to existing UX3 filters (asserted-ADD bucket, modifier presence, family-name lookup)? If yes, they extend filtering power; if not, they duplicate.

Approach (future):
- Sketch a UX3 filter prototype combining (topology-family) × (asserted-ADD) × (modifier-link presence).
- Validate against the SCALE pilot tier (currently 92 of 160) to confirm filter diversity without empty-result combinatorics.

### 10.6 Constraints for the correlation phase

When correlation is undertaken, the following constraints carry forward:

1. NO IFPA dictionary mutation without explicit human approval.
2. NO alias insertions without entry through the existing `PASSBACK_ALIAS_CANDIDATES.csv` + review queue.
3. NO ADD-value changes; FM-IFPA disagreements log to `FM_MATH_DIVERGENCES.csv` per existing track.
4. Symbolic-family / topology-family slugs MUST stay observational; they MUST NOT be conflated with IFPA `trick_family`.
5. The three-layer separation forever-rule (parser/editorial/operational per `feedback_parser_editorial_separation.md`) extends to symbolic-grammar as a *fourth* observational layer that NEVER overrides the other three.

---

## 11. Cross-references

- `OPERATIONAL_NOTATION_GRAMMAR.md` — F0 reconnaissance grammar, token inventory source.
- `FM_GRAMMAR_PHASE1.md` — earlier FM grammar work.
- `FM_MATH_DIVERGENCES.csv` — federation_math_divergence registry (22 rows; ADD-disagreement track).
- `PASSBACK_ALIAS_CANDIDATES.csv` — alias-review queue (existing protocol).
- `feedback_parser_editorial_separation.md` — three-layer separation forever-rule (extended to four with this observational layer).
- `feedback_public_facing_prose.md` — prose hygiene (irrelevant to this build; symbolic-grammar layer is not user-facing).
- `legacy_data/scripts/build_symbolic_grammar_master.py` — generator (read-only on source data; single-file, no orchestration).

---

## 12. Validation checklist (per task brief)

| Validation | Status |
|---|---|
| Spreadsheet opens cleanly (XLSX + CSV) | ✓ (openpyxl 3.1.5 generated; 679 rows + header) |
| CSV round-trips | ✓ (CSV writer uses QUOTE_ALL; embedded commas/quotes/newlines escaped) |
| All rows preserve raw source notation | ✓ (`symbolic_notation_raw` column carries verbatim source text) |
| No source data overwritten | ✓ (script is read-only on inputs; reads CSV, writes only to `exploration/footbagmoves-federation/`) |
| All derived fields clearly marked as derived | ✓ (column names use `derived_*`, `parsed_*`, `_flags`, or explicit role labels) |
| No IFPA mutation | ✓ (no DB writes; no `freestyle_tricks.*` access; no alias inserts) |
