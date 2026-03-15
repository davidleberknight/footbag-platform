# Changelog

All notable changes to this project are documented in this file.

---

## [v2.11.0] — Results fidelity fix + location normalization + community workbook rebuild
**Release date:** 2026-03-12

### Summary

This release enforces the Results Fidelity principle: no placement may be
dropped due to identity resolution failure. PBP v63 restores 887 previously
dropped placements across 213 events. Location fields are normalized across
all 774 events. The community workbook is fully rebuilt with clean formatting,
correct statistics, and all placements visible in year sheets.

### Changes

#### Data — Placements (PBP v62 → v63)
- **+1,359 rows** (27,154 → 28,513 total) via `tools/57_patch_pbp_v62_to_v63.py`
- Restores **887 previously dropped placements** across 213 events
- Root cause: earlier PBP versions silently omitted unresolved single-name tokens
  and partially-covered divisions; only BLOCKER_GENUINE divisions were patched in v62
- All restored rows assigned `person_id = __NON_PERSON__`, `person_unresolved = 1`
- Example: Bulgarian Footbag Open 2025 Singles Net places 6–9 now in canonical data
- PARTIAL restorations: 735 rows; NEW_DIV restorations: 624 rows

#### Data — Location Normalization
- New `out/canonical/events_normalized.csv` produced by `tools/location_normalize.py`
- 140 events with corrected location fields across 5 fix categories:
  country abbreviations (7), region abbreviations (2), Basque → Bizkaia (22),
  duplicate city/region cleared (107), venue name stripped from city (1)
- Street addresses removed from country field for 4 events

#### Community Workbook (v11)
- Year sheets rebuilt from PBP v63 — all placements visible including unresolved
- ALL-CAPS player names normalized per-segment (PETR FUCIK → Petr Fucik)
- Category section headers title-cased (NET → Net, FREESTYLE → Freestyle)
- Location display: US/Canada → City, State; all others → City only
- Duplicate place entries removed (team entry preferred over redundant solo entry)
- `/ ?` suffix removed where partner is unknown
- STATISTICS sheet: corrected counts, Montreal/Montréal deduplicated,
  Global reclassified as Multi-country / Online

#### Pipeline contract updated (CLAUDE.md v1.1)
- **Results Fidelity** principle added (§1.8)
- Location normalization rules documented (§6)
- Stage 04B updated to reflect that year sheets now show all placements
- Current canonical state table added (§11)

#### New tools
- `tools/57_patch_pbp_v62_to_v63.py`
- `tools/build_final_workbook_v11.py`
- `tools/compute_statistics_v2.py`
- `tools/final_dataset_verification.py`
- `tools/final_presentation_sync_qc.py`
- `tools/final_publication_validation.py`
- `tools/location_audit.py`, `tools/location_normalize.py`, `tools/location_display_audit.py`

---

## [v2.10.1] — Source coverage patch PBP v61→v62; Worlds 2023 + Bembel Cup 2024 fixes
**Release date:** 2026-03-12

### Changes

#### Placements (PBP v61 → v62)
- **+510 placement rows** (27,154 total) via `tools/56_patch_pbp_v61_to_v62.py`
- SOURCE_COVERAGE_PASS: 0 BLOCKER_GENUINE after patch (was 100 pairs)
- 37 stale v61 rows excluded (replaced by corrected data for 2 events)
- 547 new rows generated across 100 target (event, division) pairs

#### Event data fixes
- **Worlds 2023** (event 1678957450, dequarantined): organizer had mislabeled the Women's
  Doubles Net results block as a second "Women's Singles Net" section. RESULTS_FILE_OVERRIDE
  renames it correctly. Removed from `review_quarantine_events.csv` and `known_issues.csv`.
  V61_STALE_ROWS clears corrupted Circle Contest, Women's Singles Net, Women's Doubles Net
  rows; FORCE_PATCH injects corrected data.
- **Bembel Cup 2024** (event 1706536250): source uses tab-separated two-column doubles format;
  parser had concatenated both columns as Open Singles Freestyle. RESULTS_FILE_OVERRIDE
  restores correct 12-team Open Doubles Net results.

#### New source-coverage tooling
- `tools/54_source_coverage_qc.py`: compare stage2 vs Placements_Flat; classify as
  BLOCKER_GENUINE / BLOCKER_DRIFT / PARTIAL / JUSTIFIED / OK; exits 1 if BLOCKER_GENUINE > 0
- `tools/55_encoding_scan.py`: scan canonical outputs for encoding anomalies
- `tools/56_patch_pbp_v61_to_v62.py`: targeted PBP patch with V61_STALE_ROWS + FORCE_PATCH
  support for events with wrong (not just absent) v61 data

#### Counts (current)
- `Placements_ByPerson_v62.csv`: 27,154 rows
- Known-issue events: 54 (Worlds 2023 removed)
- Quarantined events: 20

---

## [v2.10.0] — Identity merges via member ID matching, member ID enrichment
**Release date:** 2026-03-12

### Changes

#### Identity (PT v41 → v42, PBP v60 → v61)
- **5 confirmed duplicate pairs merged** discovered via footbag.org member ID / alias matching:
  - Anthony Mehok → Tony Mehok
  - Henry Rautio → Heikki Rautio
  - Jacob Hall → Jakob Hall
  - Johnny Leys → John Leys
  - Laurence DuMont → Lawrence Dumont
- Losing persons become verified aliases; 3 PBP placements redirected (v60 → v61)
- **5 ADD_ALIAS entries** added to `person_aliases.csv`:
  Bryan S. Nelson, Errol H. Stryker, Forrester Winterburn,
  Jonathan F. Araquistain, Nathan Oates
- Gate3 PASS: 3,446 → **3,441**

#### New enrichment tools (54–57)
- `tools/54_member_id_extraction.py`: live footbag.org member ID lookup with alias/handle matching
- `tools/55_metadata_enrichment.py`: recover missing event dates from live pages
- `tools/56_member_alias_suggestions.py`: post-process ALIAS_MATCH hits to suggest new aliases
  and flag potential PT merges
- `tools/57_merge_alias_patch.py`: apply confirmed merge decisions to PT / PBP / aliases

#### Pipeline fixes
- **04B**: Basque Country normalised to Spain in community Excel and canonical CSV
- **04B**: `event_metadata_overrides.csv` — 148 recovered event dates applied
- **05**: Member IDs from enrichment file populate `legacyid` column in `persons.csv`

#### Counts (current)
- `Persons_Truth_Final_v42.csv`: 3,441 rows
- `Placements_ByPerson_v61.csv`: 26,644 rows
- Gate3 PASS: 3,441

---

## [v2.9.0] — PBP v60, complete MEDIUM review, canonical freeze
**Release date:** 2026-03-11

### Changes

#### Placements (PBP v59 → v60)
- **+72 unresolved rows** added across 10 events where stage2 had divisions absent from PBP
  (parser improvements since original PBP lock had recovered these divisions):
  - 1005667143, 1025084282, 1158263300, 1179679872, 1216058526,
    1678957450, 859923755, 876591529, 886044392, 892446131
- New rows: `person_id=''`, `person_unresolved='1'`, names preserved as parsed
- Gate3 PASS = 3,446 (unchanged — unresolved rows do not affect Gate3)

#### Review tooling (tools 50–52, 60)
- `tools/50_build_review_packet.py`: 6 reconciliation flags + quarantine flow; generates
  Queue_HIGH_ONLY / Queue_HIGH_MEDIUM_MISMATCH / Queue_MEDIUM_REVIEW xlsx files
- `tools/52_build_inspector_mirror_truth.py`: side-by-side HTML inspector with MEDIUM queue fallback
- `tools/60_migrate_pbp_v59_to_v60.py`: migration script used to produce v60
- `pipeline/parser_patterns.json`: 6 documented recurring parser patterns

#### MEDIUM review — 73 events classified
- **Final heat distribution:** HIGH=0, MEDIUM=70, LOW=233, CLEAN=450, QUARANTINED=21
- **Dispositions applied** (70 active MEDIUM events):
  - ACCEPT: 42 (OVERRIDE_OK ×20, METADATA_OVERRIDE ×6, minor dup-place ×11, cosmetic div diff ×5)
  - SOURCE_PARTIAL: 23 (merged divisions, pool+finals, South American identity gaps)
  - DEFER: 5 (pending identity alias work or future PBP migration)
- **Quarantine:** 21 events total (3 added from MEDIUM: 959353403, 984694623, 1366240051)

#### Data documentation
- `overrides/known_issues.csv`: 52 → 55 rows (3 new SOURCE_PARTIAL events)
- `README.md`: updated placements count (26,572 → 26,644), added coverage limitations note
- Canonical freeze manifest: `out/canonical_freeze/FREEZE_MANIFEST.txt` (SHA256 hashes)

#### Counts (current)
- `Persons_Truth_Final_v41.csv`: 3,446 rows
- `Placements_ByPerson_v60.csv`: 26,644 rows
- Gate3 PASS: 3,446

---

## [v2.8.0] — Identity cleanup: 6 concatenated team names removed from PT
**Release date:** 2026-03-11

### Changes

#### Identity curation
- **PT v39 → v41 / PBP v57 → v59**: Removed 6 PT entries that were concatenated
  doubles team names incorrectly stored as individual persons:
  - `826a0e03` "Yves Kreil Antonio Fritsch" → `__NON_PERSON__` (ev 1235653935 Open Doubles Net p=4)
  - `df8dad09` "Eurik Lindner Markus Kaspczak" → `__NON_PERSON__` (ev 1235653935 Open Doubles Net p=8)
  - `115c774a` "Chis Löw Hannes Daniel" → `__NON_PERSON__` (ev 1235653935 Open Doubles Net p=3)
  - `77db77da` "David Martin Jeremy Guilbaud" → `__NON_PERSON__` (ev 1241011525 Open Doubles Net p=15)
  - `0982e26c` "Doug Toth Chris Cleaver" → `__NON_PERSON__` (ev 859923755 Novice Doubles p=2)
  - `9c955cf4` "Medina Carlos Palencia Sain" → `__NON_PERSON__` (ev 1366240051 Doubles Open p=11)
  PT: 3,452 → 3,446 rows. Gate3 PASS = 3,446.

#### Counts (current)
- `Persons_Truth_Final_v41.csv`: 3,446 rows
- `Placements_ByPerson_v59.csv`: 26,572 rows
- Gate3 PASS: 3,446

---

## [v2.7.0] — Reviewer round 2: identity cleanup, Records removed, BAP Name, div fixes
**Release date:** 2026-03-10

### Changes

#### Identity curation
- **PT v38 → v39 / PBP v56 → v57**: Removed two PT entries that were concatenated
  team names (mis-parsed doubles results stored as individuals):
  - `57cde887` "Grischa Tellenbach Vincent Rousseau" → reclassified as `__NON_PERSON__`
    team entry (event 1177512537 Doubles Net p=1)
  - `a1e7bdfd` "Grischa Tellenbach Damian Budzik" → reclassified as `__NON_PERSON__`
    team entry (event 1235653935 Open Doubles Net p=9)
  PT: 3,454 → 3,452 rows. Gate3 PASS = 3,456 (unchanged).

#### Data fix (event 1069791565)
- **5e Open de France 2004**: Division names had ` ? ` encoding artifacts in PBP
  (e.g., "Open Freestyle ? Routines"). Fixed to ` - ` in PBP v57. 21 rows updated.

#### Community workbook (04B)
- **Player Stats header**: "Nickname" → "BAP Name". BAP nickname only, never other aliases.
- **Records tab removed**: Deleted per reviewer feedback (leaderboard sheet was
  misleadingly named and redundant with Player Stats).
- **`_clean_div()`**: ` ? ` artifact now renders as ` - ` not a space.

#### Regression set status
| Event | Status |
|---|---|
| 937727262 | Known issue (severe) — pool+finals merge, documented |
| 937854594 | Fixed in v2.6.0 ✓ |
| 947026077 | Known issue (moderate) — pool+finals merge, documented |
| 989875090 | Clean — noise-only divisions |
| 984694623 | Clean — freestyle-only event |
| 990626988 | Clean — single division |
| 996293200 | Known issue (minor) — documented |
| 1035277529 | Fixed — RESULTS_FILE_OVERRIDE (2003 Worlds) |
| 1069791565 | Fixed — division `?` names corrected ✓ |
| 1096318324 | Fixed — RESULTS_FILE_OVERRIDE (Seattle Juggling) |

#### Counts (current)
- `Persons_Truth_Final_v39.csv`: 3,452 rows
- `Placements_ByPerson_v57.csv`: 26,572 rows

---

## [v2.6.0] — Reviewer feedback fixes: player count, wording, display cleanup, Edison merge, 937854594 fix
**Release date:** 2026-03-10

### Changes

#### Identity curation
- **PT v37 → v38 / PBP v55 → v56**: Merged duplicate Edison Alejandro Rodriguez
  Betancur entries — `5934e79b` (no accent) was a spurious NEW_PERSON_v28 duplicate
  of `5813a6cb` (with accent). PT now 3,454 rows; Gate3 PASS = 3,456 (unchanged).

#### Data fix (event 937854594)
- **Turku Tournee 1999**: Intermediate and Pro divisions were conflated into bare
  "Singles Net" / "Doubles Net" because the parser saw two "Singles Net" headers
  without sport-level context. Added `RESULTS_FILE_OVERRIDE` + legacy data file;
  PBP v56 updated with proper division names: "Intermediate Singles Net",
  "Intermediate Doubles Net", "Pro Singles Net", "Pro Doubles Net". Removed from
  known_issues (was "moderate — division results merged").

#### Community workbook (04B)
- **Player count**: Index "Players" column now counts actual participants (doubles
  teams = 2 players, not 1 entry). Year sheet and Summary "Largest Events" table
  also corrected.
- **Summary wording**: Added "not perfect, as there are gaps and known data quality
  issues throughout" to the About paragraph.
- **Sheet guide**: Player Stats and Player Results descriptions now note "based on
  incomplete data set".
- **`_clean_div()`**: Strip ` ? ` encoding artifacts from division names.
- **`_clean_team_display()`**: First-letter capitalize each team member name; strip
  trailing annotation parentheticals with 5+ chars and a space.
- **Leaderboard filter**: Exclude team-composite `person_canon` values (containing
  " / ") from Player Stats leaderboards — removes "Anthony Intemann / Greg Nice
  Neumann" spurious combined entry.
- **Location overrides** (4 events): 933115858 → "Boulder, Colorado, USA";
  980969461 → "San Francisco Bay Area, California, USA"; 912467534 →
  "Portland, Oregon, USA"; 1034985978 → "Vancouver, B.C., Canada".

#### Counts (current)
- Stage-2 events: 774; placements: ~27,945
- `out/canonical/events.csv`: 774 rows
- `out/canonical/persons.csv`: 3,454 rows
- `Placements_ByPerson_v56.csv`: 26,572 rows
- known_issues: 52 events (10 severe, 26 moderate, 16 minor)

---

## [v2.5.0] — Identity fix, pool+finals batch repair, known_issues cleanup
**Release date:** 2026-03-10

### Changes

#### Identity curation
- **PT v36 → v37 / PBP v51 → v52**: Tu Vu / Tuan Vu identity merge corrected —
  these are the same person. SSC division name merge fix (tool 58). PT now 3,455
  rows; Gate3 PASS = 3,456.

#### Pool+finals batch fix (22 events)
- **PBP v52 → v55**: 22 pool+finals events where competitive results were
  merged with seeding/pool-round data. For each event, extracted final standings
  from the mirror's "Manually Entered Results" section (verified clean pre-block)
  and rebuilt from stage-2 placements using PT alias lookup.
  - v52 → v53: 2001 Worlds pool+finals (21 divisions restored)
  - v53 → v54: 2 garbled-label events (Colorado Shred Symposium 2003, 2010 US Open Net)
  - v54 → v55: 22 events across 1997–2023 (pool round data replaced with
    final standings; +180 net rows; 26,392 → 26,572 rows)

#### Data quality (known_issues)
- **known_issues 239 → 48**: Systematic reduction from 239 data-quality flags
  to 48 retained entries.
  - Removed 60 events identified as legitimate tournament bracket ties
    (scattered dups at non-reset positions, all count=2)
  - Removed 29 events with dups only in noise/skill-contest divisions
    (Sick 3, Shred 30, Circle Contest, Golf, Request Contest, etc.)
  - Removed 38 events with standard bracket-elimination tie patterns
  - Removed 22 events fixed by the pool+finals batch fix above
  - Removed 10 events in this release: 7 all-noise or clean-in-PBP;
    3 real bracket/tournament ties
  - Added 5 newly confirmed pool+finals merge events (1016457376,
    1265745512, 1294262550, 1301837216, 1331667371)

#### Counts (current)
- Stage-2 events: 774; placements: ~27,945
- `out/canonical/events.csv`: 774 rows
- `out/canonical/persons.csv`: 3,455 rows
- `Placements_ByPerson_v55.csv`: 26,572 rows
- known_issues: 53 events (10 severe, 26 moderate, 17 minor)

---

## [v2.1.1] — Parser fixes, multi-column pre layout, event_type field
**Release date:** 2026-03-08

### Changes

#### Parser fixes
- **Multi-column `<pre>` layout** (NZ Champs 2000, event 947196813): new
  `fixup_nz_champs_2000()` pre-parse fixup handles up to 3 side-by-side
  columns separated by 6+ spaces. Infers column boundaries from header rows,
  routes each column as an independent stream, handles wrapped entries and
  short-line overflow via last-place heuristic, prepends section prefix
  (Consecutive / Net / Freestyle) to disambiguate shared division names.
  Result: 3 divisions / 11 placements → 15 divisions / 52 placements.
- **`'womens'` added to `valid_starts`** in `looks_like_division_header()`:
  bare "WOMENS" (no apostrophe) was not recognised as a valid division header
  start word, silently dropping "WOMENS INTERMEDIATE SINGLES NET RESULTS" at
  Worlds 2000 (event 941418343). Fixed: 4 placements now correctly attributed
  to `Womens Intermediate Singles Net` rather than merged into `Womens Singles
  Net`. Corpus-wide impact: exactly 2 lines changed behaviour, both correctly.

#### Canonical CSV export — `event_type` field
- **`events.csv` now includes `event_type`** (net / mixed / freestyle / worlds
  / golf / social), sourced from the stage-2 `event_type` column.
  Distribution: 316 net, 255 mixed, 165 freestyle, 27 worlds, 11 golf,
  10 social.

#### Coverage overrides
- **Western Regionals 1998** (event 876356874): added 3 `COVERAGE_FLAG_OVERRIDES`
  entries — `Mixed Doubles Freestyle` → sparse, `Women's Open Doubles Freestyle`
  → sparse, `Open Doubles Freestyle` → partial.

#### Counts updated (post-rebuild)
- `event_disciplines.csv`: 3,781 → 3,795 rows
- `event_results.csv`: 24,069 → 24,116 rows
- `event_result_participants.csv`: 34,854 → 34,893 rows
- Stage-2 placements: 26,975 total; `place_large_gap` INFO instances: 52 → 46

---

## [v2.1.0] — Identity fixes, coverage overrides, canonical CSV export
**Release date:** 2026-03-08

### Changes

#### Parser fixes
- **"Last, First" European name format** — `split_entry()` was incorrectly
  treating comma-separated `"Last, First"` entries as doubles teams in singles
  divisions. Fix: when not in a doubles division and the right part after the
  comma is a single word, treat the whole entry as one player. Affected 9 events
  (Swiss Open, Finnish Open, European Champs, South American events).

#### Identity curation (tools 36, 37)
- **Placements_ByPerson v35 → v36** (tool 36): 93 newly resolvable placements
  added from 9 Last,First events (Swiss 2016, RNH 2019, European Champs 2011,
  Finnish Open, Copa Venezuela, Copa Suramericana, Copa Ciencias, Perpetual Flame,
  Swiss Open 2011). These were previously missing due to the parsing bug above.
- **PT v32 → v33** (tool 37): Added 2 new persons: Vlad Eskanasy (bd039e6a),
  Wilder González (6a2b2558). Updated Markus Kapszak entry with "Kaspczak, Markus"
  UUID and alias.
- **PBP v36 → v37** (tool 37): 35 remaining unresolved Last,First placements added
  via name reconstruction + 4 manual overrides (Kaspczak/Kapszak spelling variant,
  Quimel Gonzales reversed order, Jhon Orace Valera truncation, Wladiuska Pacheco
  Castro truncation).
- **PT v33 → v34**: Corrected Heather Cook/Thomas identity confusion — removed
  Heather Cook UUID and alias from Heather Thomas; added Heather Cook as a new
  person (28ccdba7). Gate3 PASS = 3,452.

#### Coverage overrides
- **95 early-year coverage overrides** added to `COVERAGE_FLAG_OVERRIDES` in
  `04_build_analytics.py` for all synthetic pre-mirror events (200198xxxx).
  All set to "partial" — these events have only top-3 placements from historical
  records; more competitors participated than are recorded.

#### New: Stage 05 — canonical relational CSV export
- **`pipeline/05_export_canonical_csv.py`** — new final pipeline stage that exports
  5 normalized CSVs to `out/canonical/` for database import:
  - `events.csv` (784 rows)
  - `event_disciplines.csv` (3,781 rows)
  - `event_results.csv` (24,069 rows)
  - `event_result_participants.csv` (34,854 rows, 87.8% person_id resolved)
  - `persons.csv` (3,452 rows)
  Person ID resolution uses a 3-level fallback: player token → player_names_seen
  → unresolved. All 4 natural-key uniqueness constraints verified on every run.
  Added to `make release` target.

#### Data recovery (v2.0.0–v2.0.1, previously tagged)
- **1999 Worlds** (event 915561090): 43 → 226 placements, 1 → 19 divisions.
  Recovered from legacy results file via RESULTS_FILE_OVERRIDES mechanism.
- **2003 Worlds** (event 1035277529): 186 → 192 placements, 10 → 15 divisions.
- **Legacy ID coverage**: expanded from 200 → 315 persons with legacyid assigned.
- **Community Excel overhaul**: sheet order Summary → Records → Index → Player Stats
  → Player Results → year sheets; 19 location upgrades; 22 host club fills.

#### Repository
- Rewrote `README.md` with clear quick-start instructions and current counts.
- Rewrote `RELEASE_CHECKLIST.md` with current versions and stage 05 checks.
- Cleaned up `.gitignore`: consolidated duplicates, added `qc_*.py`, `qc_*.csv`,
  `scripts/`, and other root-level scratch artifacts.
- Removed `qc_spreadsheet_gate.py` from git tracking.

### Identity lock state

| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v34 | 3,452 |
| Persons_Unresolved_Organized | v27 | 76 |
| Placements_ByPerson | v37 | 26,156 |

### Pipeline outputs

| Metric | Value |
|---|---|
| Gate3 PASS | 3,452 |
| Analytics_Safe_Surface | 16,242 rows |
| Community Excel placements | 18,504 |
| BAP matches | 84/84 |
| QC checks | 0 errors (32: 1 known warn; 33: 0 errors) |

---


All notable changes to this project are documented in this file.

This project follows **semantic versioning**, with an additional rule:
**Any change to human identity truth requires a new version.**

---

## [v1.0.19] — QC fixes + data integrity documentation
**Release date:** 2026-02-28

### Changes

#### Data fixes
- **Ken Hamric canon** — double-space typo (`Ken  Hamric`) corrected in
  `Persons_Truth_Final_v31.csv` and propagated to `out/Persons_Truth.csv`.
- **Juan Palacios Lemos canon** — stale `JUAN PALACIOS` canon in PBP (pre-tool-32
  state) corrected via new `--persons_truth_csv` PT-override in `02p5`.
- **`02p5` PT canon override** — added `--persons_truth_csv` argument; on every
  release run, `person_canon` in `Placements_Flat` is synchronised against PT,
  ensuring PBP staleness never silently propagates. Applied 2 overrides (above).
- **`person_unresolved` case mismatch** — PBP writes `"True"`/`"False"` (Python
  bool strings); four comparison sites in `04_build_analytics.py` used lowercase
  `"true"`. Fixed with `.str.lower()` at all sites. Impact: `Data_Integrity.csv`
  Unresolved count now correctly reads 155 (was 230 due to missed `"True"` rows).
- **`Index.placements_count`** — was sourced from stage2 raw counts. Five events
  had stage2 noise (narrative text, score-contaminated names, surname-only entries)
  that never reached PBP, making the Index inconsistent. Now sourced from PBP row
  counts. Result: 0 mismatches; Index sum = PBP total = 25,679.
- **U+00AD soft-hyphen in `division_canon`** — PBP_v33 has 10 soft-hyphen
  occurrences in 6 division names for event 1323272493. Stripped in `02p5` on
  output (accented letters, right quotes, en-dashes preserved). Tool 33 now
  reports 0 errors on division integrity.
- **Summary sheet placements rows** — added two explicit rows:
  `Total Placements (identity-locked / PBP)` = 25,679 and
  `Total Placements (resolved persons only)` = 25,524, distinguishing from the
  existing stage2 raw count (26,603).

#### QC documentation improvements
- **Tool 32 Check 3** — added categorical breakdown of 1,286 shared-place groups
  (freestyle score ties, net/pool-play, circle/group, golf score ties, 2-square/group)
  with event count and inline explanation of why shared places are expected.
- **Tool 32 Check 6** — removed 5-event truncation; now lists all 39 zero-placement
  stage2 events, separated into 5 future events (2026, not yet held) and 34
  historical events (results never posted). Added cross-reference note explaining
  why the Index shows 44 (5 extra have stage2 noise filtered from PBP).
- **Tool 33 Check 7** — added sub-check 7e: loads `Coverage_GapPriority.csv` and
  reports 433 (event, division) pairs with incomplete place sequences, broken down
  by gap class (document_only 413, possibly_recoverable 15, not_recoverable 5).
  Known limitation documented inline.

### Identity lock state (unchanged from v1.0.18)
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v31 | 3,451 |
| Persons_Unresolved_Organized | v27 | 76 |
| Placements_ByPerson | v33 | 25,679 |

### Pipeline outputs (unchanged from v1.0.18)
- Gate3: PASS = 3,451
- Analytics_Safe_Surface: 22,958 rows
- Placements_Unresolved: 155 rows

---

## [v1.0.18] — Referential closure, post-release QC, tool 33, repo cleanup
**Release date:** 2026-02-28

### Changes

#### Identity curation (tool 31 — Referential Closure)
- **15 orphan events** (in PBP but absent from stage2) added as synthetic
  pre-mirror stubs to the Index.
- **70 orphan PBP person_ids** (UUIDs present in PBP but missing from Truth)
  remapped to their correct Truth entries.
- **3 non-person entries** cleared from Truth.
- **18 new Truth entries** added (persons found in PBP with no Truth record).
- **5 QC07 warnings removed** (entries confirmed non-persons).
- **53 QC07 warnings upgraded** to resolved Truth mappings.
- **Phillip Lessard → Philippe Lessard** (canon rename, confirmed spelling).
- Identity lock bumped: Truth v30→v31 (3,451 rows), Placements v32→v33 (25,679).

#### Post-release data integrity (tool 32 — 6 UUID corrections)
Fixed 6 wrong UUID assignments introduced by pre-v31 data errors:
Alexandre Bélanger, Reinaldo Pérez, JUAN PALACIOS (×2), ANIBAL MONTES,
BERNARDO PALACIOS — all had shared UUIDs. Juan Palacios Lemos (e5395a41)
added to Persons_Truth.

#### New tool: `tools/33_schema_logic_qc.py`
Read-only, 7-check schema & logic audit mirroring tool 32's architecture.
Checks: person integrity, division integrity, place sequence, same-person
multi-place, division inflation, longevity scan, cardinality & density.
Exits 1 on any ERROR; WARNs are informational only.

#### New tool: `tools/extract_event_locations_from_mirror.py`
Extracts raw location strings from the mirror and maps them to canonical
display strings used in the workbook Index.

#### Workbook: canonical location display strings
Replaced raw location strings in the Index with canonical display strings
(city/country formatted for human readability).

#### Repository cleanup
- Added `Makefile` with targets: `setup`, `rebuild`, `release`, `qc`, `all`.
- Rewrote `README.md`: v1.0.17 → v1.0.18 badge, mirror as top prerequisite,
  explicit script names in Quick Start, correct lock file versions.
- Updated `RELEASE_CHECKLIST.md` to v1.0.18 with corrected counts and lock files.
- Consolidated `.gitignore` (3+ duplicate sections → one clean file; added `index.csv`).
- Archived superseded lock versions to `inputs/identity_lock_archive/`:
  `Persons_Truth_Final_v29.csv`, `v30.csv`; `Placements_ByPerson_v31.csv`, `v32.csv`.
- Moved `triage_unmapped_names_with_usage.py` from root to `tools/`.
- Deleted stale artifacts: `04_build_analytics.patch`, `readme-excel.csv`,
  `overrides/Local Disk (C) - Shortcut.lnk`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v31 | 3,451 |
| Persons_Unresolved_Organized | v27 | 76 |
| Placements_ByPerson | v33 | 25,679 |

### Pipeline outputs
- Gate3: PASS = 3,451 (Truth v29 3,437 → v31 3,451, +14)
- Analytics_Safe_Surface: 22,958 rows
- Placements_Unresolved: 155 rows

### QC baselines
- Tool 32: 0 IDENTITY_COLLISION errors, 10 sub-round WARNs (pool/circle expected)
- Tool 33: 0 errors, 7 checks pass

---

## [v1.0.17] — QC: Fix host_club false-positive + pipeline regeneration
**Release date:** 2026-02-28

### Changes
- **`host_club_suspicious_prefix_or_markup` false positive (1 WARN → 0)**:
  Event 1408070192 ("New Year's Footbag Jam") had `host_club = '\m/ichigan footbag'`.
  The `\m/` is a heavy-metal "horns" emoticon, not HTML/wiki markup. Added explicit
  exception for `^\\m/` prefix in `check_host_club_suspicious_prefix_or_markup()`.
- **Pipeline regeneration**: Ran stages 03 + 04; all checks pass.
  - Gate 3: PASS = 3437 (Persons_Truth_Final_v29.csv, unchanged)
  - Lock sentinel refreshed: v29 (3437 rows), v27 (76 rows)
  - Analytics_Safe_Surface.csv: 22959 rows (unchanged)
  - Tier-1 QC: 0 T1_UNMAPPED, 0 T1_MULTI

### QC baselines
- Stage2: 19 → 18 WARNs (host_club_suspicious_prefix_or_markup 1→0)

---

## [v1.0.16] — QC: Fix 4 False-Positive Warning Categories
**Release date:** 2026-02-28

### Changes
- **Issue 1 — `results_raw_has_strong_signals_but_output_empty` (4 WARNs → 0)**:
  Suppress when `placements_count ≥ enumerated items` (numbered/ordinal lines) in
  `results_raw`. All 4 events were correctly parsed small events, not dropped results.
- **Issue 2 — Worlds warnings (3 WARNs → 0)**:
  - `worlds_missing_expected_disciplines`: 2021 Worlds classified as INFO (pandemic
    recovery year, freestyle-only format — no net divisions held).
  - `worlds_results_suspiciously_small`: 2020/2021/1999 Worlds added to known-external
    skip list (same as `worlds_missing_expected_disciplines`).
  - `cv_worlds_missing_freestyle` (rebuild script): 1999/2020/2021 Worlds added to
    known-external list; will resolve to WARN=0 on next rebuild.
- **Issue 3 — placeholder `n/a` (10 WARNs stage2, 11 WARNs stage3 → 0)**:
  `\bn/a\b` downgraded from WARN to INFO. In source data, "n/a" is a legitimate data
  value ("not applicable" for player club or golf DNF), not a pipeline placeholder.
  Stage3 baseline was already producing 0 WARNs; both baselines updated.
- **Archive cleanup**: Deleted old identity lock files v28/v25/v26/v29/v30 from
  tracked paths (moved to `inputs/identity_lock/archive/` by tools 28–30, deletion
  accidentally omitted from those commits).

### QC baselines
- Stage2: 35 → 19 WARNs, 896 → 912 INFO (no data changes)
- Stage3: 11 → 0 WARNs (no data changes; baseline was stale)

---

## [v1.0.15] — Identity Curation Round 10: Handle/Noise Cleanup
**Release date:** 2026-02-27

### Changes
- **17 clear non-person entries reclassified → `__NON_PERSON__`** (tool 30):
  Initials/symbols: `G*`, `*`, `FLT`, `MLS`, `Footcraft`, `Winner`,
  `Jeremy Watlers-prizes` (parsing artifact).
  Gaming/online handles: `Reaper`, `Gobbish`, `Zerg`, `Fingerbang`, `LAbitch`,
  `Jester`, `Herra X` (Finnish "Mr. X"), `Skaut` (Czech "scout"),
  `Rake`, `Dreuf`.
- Persons_Truth unchanged (v29, 3437 rows).
- New tool: `tools/30_noise_cleanup.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v29 | 3437 (unchanged) |
| Persons_Unresolved_Organized | v27 | 76 |
| Placements_ByPerson | v31 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3437 (Truth unchanged)
- Analytics_Safe_Surface: 22959 rows (was 22945, +14 from resolved coverage)
- Placements_Unresolved: 154 rows (was 169, -15)

---

## [v1.0.14] — Identity Curation Round 9: AUTO_COVERAGE_BACKFILL Resolution
**Release date:** 2026-02-27

### Changes
- **All 194 AUTO_COVERAGE_BACKFILL Unresolved entries resolved** (tool 29):
  - **26 STALE_REMOVE** (0 PBP rows): 14 "?" separator doubles pairs + encoding-corrupt
    entries (Mikulá¹ Èáp, Tomá¹ Mirovský, Matja? Borič, Robin P¸chel, Gregor Morel
    Ale¹ Pelko, tivteřinová smr?ť triků, Dominic O?Brien-Stéphane Tailleur,
    Marc Weber* Bob Silva) + Ian Pfeiffer ? (Ian already in Truth), thru 8th (placeholder),
    Ulrike Häßler and Robert Szymański (correct forms, 0 PBP — PBP had variant forms).
  - **18 NOISE → `__NON_PERSON__`**: Hyphen-separated doubles pairs (Eduardo
    Martinez-Diego Chávez, Mark Hunsberger-Josh DeClercq, Francis Guimond-Stéphane Roy,
    Andreina Peńa-Reinaldo Pérez, Julio Garcia-Ángel Vivas, Victor Lezama-Ángel Hernández,
    PAVEL HEJRA-PETR FUCIK, PAVEL HEJRA-PATRIK CERNY, Gina Meyer J.J. Jones) + non-person
    labels (Ronalde plus H, Team Magic, Team Spirit, Team Tüte, DER CHAMP, IRON MAN,
    LEG OVER., Min. Timed Consecutives, Andre P. Aberration).
  - **11 CANON_CORRECTs to existing Truth**: yves kreil → Yves Kreil; Alex Trenne/Trener
    → Alexander Trenner; Krysiewicz Łukasz → Łukasz Krysiewicz; Walter Houston ID → Walt
    Houston; Luka WeyLav ID → Luka Weyler; De Zeeuw → Nicolas De Zeeuw; X. Anhuth →
    Kerstin Anhuth; X. Hankins → Jim Hankins; Arnaud Mamoute Saniez → Arnaud Saniez;
    Greg GFSmoothie Nelson → Greg Nelson.
  - **42 new Truth entries**: 29 direct promotions (Mikołaj Kulesz, Przemysław Popławski,
    Radek Łątka, Paweł Ptaszyński, Paweł Kosoń, Paweł Ciepielski, Paweł Holiczko,
    Łukasz Bochenek, Filip Prędkiewicz, Kacper Prędkiewicz, Mateusz Związek,
    Michał Pietryńczak, Michał Przybyłowicz, Jakub Ścisiński, Grzesiek Łatuszyński,
    Michał Zembaty, Marcin Gadziński, Natalia Fryś, Patrik Šmerda, Michal Černý,
    Olivier B.-Bergé, Boris de nantes, Ronald Ańez, Dave Hill, DJ Dourney, Nils G. Unna,
    Stephen R. Richardson, Dr. Mike Stefanelli, Michal Hadaś) + 13 via CANON_CORRECT
    (Robert Szymański, Cezary Śmigulski, Ulrike Häßler, Alejandro Rueda Patiño, Ken Sams,
    Ken Schuyler, Ian Price, Beb Riefer, Nick Szwarc, Jack Bissell, Eric Schmidt,
    Michael Wilson, JF Lemieux).
  - 18 CANON_CORRECT operations for reversed/corrupted/variant PBP forms:
    Szymański Robert, Gadziński Marcin, Holiczko Paweł, Śmigulski Cezary, Ulrike H?fller,
    Alejandro Rueda Patińo, KEN SAMS, KEN SCHUYLER, IAN PRICE, BEB RIEFER,
    Nick A Szwarc, Jack s Bissell, d Eric Schmidt, d Michael Wilson,
    JF Lemeiux/Lemiux/Lonieux, 'Dr. Mike' Stefanelli.
- New tool: `tools/29_auto_coverage_backfill_resolution.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v29 | 3437 |
| Persons_Unresolved_Organized | v26 | 93 |
| Placements_ByPerson | v30 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3437 (Truth 3395→3437, +42)
- Analytics_Safe_Surface: 22945 rows (was 22944)
- Placements_Unresolved: 169 rows (unchanged)

---

## [v1.0.13] — Identity Curation Round 8: NEEDS_CONTEXT Resolution
**Release date:** 2026-02-27

### Changes
- **All 46 NEEDS_CONTEXT Unresolved entries resolved** (tool 28):
  - **28 doubles pairs → `__NON_PERSON__`**: concatenated team names stored as single
    person_canon (no-separator, language connectors og/a/und/Y, country code CAN).
  - **3 pairs removed from Unresolved only** (0 PBP rows): Lisa Uebele Andreas Wolff,
    Christian Bock Christian Bruhn, Craig McNair Sage Woodmansee.
  - **2 CANON_CORRECTs to existing Truth**: Félix Antoine Guérard → Félix-Antoine Guérard
    (hyphen missing); CARLOS MEDINA → Carlos Medina (all-caps).
  - **13 new Truth entries**: Paweł Rożek, Wiktor Dębski, Eduardo Martinez,
    Cameron Dowie, Andrey Pomanov, Victor Burnham, Andrey Egorov,
    Sébastien Verdy, Stéphane Comeau, Luke Anderson, Max Kerkoff, Jamie Lepley,
    Edison Alejandro Rodriguez Betancur.
- New tool: `tools/28_needs_context_resolution.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v28 | 3395 |
| Persons_Unresolved_Organized | v25 | 194 |
| Placements_ByPerson | v29 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3395 (Truth 3382→3395, +13)
- Analytics_Safe_Surface: 22944 rows (unchanged)
- Placements_Unresolved: 170 rows (unchanged)

---

## [v1.0.12] — Identity Curation Round 7: Coverage Closure + Noise Reclassification
**Release date:** 2026-02-27

### Changes
- **Track C — 17 new Truth entries** (tool 27, COVERAGE_CLOSURE):
  AJ Shultz (5 app), EJ Gammage (4 app), T.J. Boutorwick (4 app),
  Maciej Długoszek (4 app), Aaron De Glanville (4 app), Kamil Hucał (3 app),
  Natalia Fry (3 app), C.J. Zohrer (2 app), JB Pinto (2 app), JJ Jones (2 app),
  Jana Čačáková (2 app), Kamil Burzyński (2 app), Lukáš Blažek (2 app),
  Matyáš Mach (2 app), Rafał Piórkowski (2 app), Tomasz Strzałkowski (2 app),
  Alex Lopez (5 app, normalised from ALEX LOPEZ).
- **5 CANON_CORRECTs** to existing Truth entries (tool 27):
  - Luka W.-Lavallée → Luka Weyler (abbreviated double-surname, 3 PBP rows)
  - JAN CERMAK → Honza Cermak (Jan=Honza in Czech, all-caps form, 3 PBP rows)
  - Jim Hankins ID → Jim Hankins (Idaho location suffix, 2 PBP rows)
  - Robert McCloskey ID → Rob McCloskey (Idaho location suffix, 2 PBP rows)
  - ALEX LOPEZ → Alex Lopez (all-caps variant, 5 PBP rows)
- **Track D — 6 noise entries** reclassified to `__NON_PERSON__` (tool 27):
  TG Sux, Footbag Team Moscow, de finales, places, st, Fcky.
- 27 Unresolved entries removed (17 promoted + 5 bad canons + 6 noise).
- New tool: `tools/27_coverage_closure_and_noise.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v27 | 3382 |
| Persons_Unresolved_Organized | v24 | 240 |
| Placements_ByPerson | v28 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3382 (Truth 3365→3382, +17)
- Analytics_Safe_Surface: 22944 rows (+9 from recovered placements)
- Placements_Unresolved: 170 rows (was 179, −9)

---

## [v1.0.11] — Identity Curation Round 6: Unresolved Near-Duplicate Merges
**Release date:** 2026-02-27

### Changes
- **Track B — 6 Unresolved variants merged into Truth** (tool 26):
  - Élise Regreny → Elise Regreny (diacritic É→E, same Net player 2017–2022)
  - Krystof Maléø → Krystof Maler (encoding corruption ø→r, same Czech player 2008–2018)
  - Jorden Moirs → Jorden Moir (trailing s, same player 2003–2011)
  - Andy Ronalds → Andy Ronald (trailing s, same player 1997–2005)
  - James Deans → James Dean (trailing s, same 1997 beginner)
  - Christian Loewe → Christian Loew (spelling variant, 0 PBP rows — Unresolved only)
- **Track A — 10 stale entries removed** from Unresolved_Organized (persons promoted to
  Truth by tools 23–25 but not yet cleaned from the curated file):
  Brent Welch, Ian Pfeiffer, Toxic Tom B., Garikoitz Casquero, Josu Royuela,
  Jose Cocolan, Olivier Fages, Baptiste Supan, James Geraci (×2).
- 7 PBP rows remapped (person_canon + person_id corrected).
- New tool: `tools/26_merge_unresolved_variants.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v26 | 3365 |
| Persons_Unresolved_Organized | v23 | 267 |
| Placements_ByPerson | v27 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3365 (unchanged)
- Analytics_Safe_Surface: 22935 rows (unchanged)
- Placements_Unresolved: 179 rows (unchanged — recovered rows are in low-coverage events)

---

## [v1.0.10] — Identity Curation Round 5: Corrupted Names + Orphans
**Release date:** 2026-02-27

### Changes
- **2 new Truth entries** (tool 25): Ian Pfeiffer (orphan UUID 0680f071 in PBP, not in Truth),
  Matjaž Borič (corrupted as "Matja? Borič" in PBP).
- **2 UUID backfills**: Jocelyn Sandoval and Steven Sevilla — both were already in Truth but
  tool 24 SKIP logic did not assign their UUID to PBP rows.
- **2 canon corrections** (encoding-corrupted PBP canons repaired):
  "Ian Pfeiffer ?" → "Ian Pfeiffer", "Matja? Borič" → "Matjaž Borič".
- **16 corrupted doubles pairs** reclassified to `__NON_PERSON__`:
  Doubles partner names stored as singles with "?" replacing the separator character.
  Both individuals in each pair are present in Truth under their own canons.
- **1 non-person text** entry reclassified: "tivteřinová smr?ť triků" (Czech division descriptor).
- New tool: `tools/25_resolve_corrupted_names.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v25 | 3365 |
| Persons_Unresolved_Organized | v22 | 283 |
| Placements_ByPerson | v26 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3365
- Analytics_Safe_Surface: 22935 rows (+20 from recovered placements)
- Placements_Unresolved: 179 rows (was 201, −22)

---

## [v1.0.9] — Identity Curation Round 4: Full-Name Resolution
**Release date:** 2026-02-27

### Changes
- **10 new Truth entries** from full-name unresolved placements (tool 24):
  Brent Welch (3 app), James Geraci (2 app), Jose Cocolan (1 app),
  Baptiste Supan (1 app), Olivier Fages (1 app), Garikoitz Casquero (1 app),
  Josu Royuela (1 app), Toxic Tom B. (2 app), Mikuláš Čáp (1 app), Tomáš Mirovský (1 app).
- **13 UUID backfills**: Tina Lewis, James Roberts, Derric Scalf, Tim Vozar,
  Brendan Erskine, Windsen Pan, Ander López, Monica Sandoval, Josh Bast, Mike Lopez,
  Brent Welch, Curtis Taylor, James Geraci.
- **3 canon corrections** (encoding-corrupted PBP canons repaired):
  Robin Puchel (P¸chel→Puchel), Mikuláš Čáp, Tomáš Mirovský.
- **3 noise entries** reclassified to `__NON_PERSON__`:
  "thru 8th", "Marc Weber* Bob Silva", "Gregor Morel Ale¹ Pelko".
- **1 UUID remap**: Curtis Taylor PBP orphan UUID (deefac3b) unified with
  existing Truth UUID (f3a1b132, source=data_only).
- New tool: `tools/24_resolve_full_names.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v24 | 3363 |
| Persons_Unresolved_Organized | v21 | 283 |
| Placements_ByPerson | v25 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3363
- Analytics_Safe_Surface: 22915 rows (+53 from recovered placements)
- Placements_Unresolved: 201 rows (was 227, −26)

---

## [v1.0.8] — Pipeline: Phase Out Dead Inputs in Release Mode
**Release date:** 2026-02-27

### Changes
- **Stage 04**: `person_aliases.csv` loads moved inside the `if not skip_identity_overwrite:`
  block — they were loaded unconditionally but only consumed in the heuristic path.
  In Release Mode (lock active), `Persons_Truth_Final_v23.csv` already carries
  `aliases_presentable`; loading `person_aliases.csv` was dead weight.
- **02p5**: removed `--identity_lock_persons_truth_csv` and `--identity_lock_unresolved_csv`
  args — accepted by argparse but never read inside `build_from_identity_lock()`.
  Only `--identity_lock_placements_csv` is required.
- **README.md**: updated identity lock file versions (v13→v23/v20/v24), removed stale
  `person_aliases.csv` reference from overrides tree, simplified 02p5 command.
- **RELEASE_CHECKLIST.md §3.1**: command simplified to the single required flag.

**Data: no change.** No behaviour change in Release Mode.

---

## [v1.0.7] — Pipeline: Self-Sealing Lock Sentinel
**Release date:** 2026-02-27

### Changes
- **Stage 04 now writes `out/persons_truth.lock` automatically** after Gate 3 PASS.
  Previously the sentinel had to be created manually, breaking clean-clone reproducibility.
  Sentinel includes SHA256 hashes and row counts for both identity lock source files.
- **Stage 04 auto-copies `Persons_Truth.csv` on first run** from a clean clone.
  If no lock and no `out/Persons_Truth.csv` exist, the highest-versioned
  `Persons_Truth_Final_v*.csv` in `inputs/identity_lock/` is copied automatically.
  Canonical count (3353) is preserved — no heuristic rebuild.
- Both fixes are idempotent: re-runs refresh the sentinel with identical SHA256s and
  row counts (only timestamp changes).
- Updated `RELEASE_CHECKLIST.md` sections 3.3–3.4 to reflect automatic sentinel writing.

**Data: no change.** Identity lock artifacts are identical to v1.0.6.

---

## [v1.0.6] — Identity Curation Round 3
**Release date:** 2026-02-27

### Changes
- **12 new Truth entries** promoted from Unresolved (COVERAGE_CLOSURE):
  Ken Somolinos (62 app), Jim Hankins (45 app), Yves Kreil (50 app),
  Robin Puchel (41 app), Walt Houston (34 app, merged Walter R. Houston),
  Nicolas De Zeeuw (23 app), Benjamin De Bastos (22 app), Eric Chang (12 app),
  Fabien Riffaud (10 app), Jessica Cedeño (10 app), Richard Cook (5 app),
  Łukasz Krysiewicz (5 app).
- **2 backfill merges**: Sunil Tsunami Jani → Sunil Jani; Alex Trenner → Alexander Trenner.
- **1 Unresolved cleanup**: Ken Hamric (already covered by existing Truth entry).
- New tool: `tools/23_promote_unresolved.py`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v23 | 3353 |
| Persons_Unresolved_Organized | v20 | 283 |
| Placements_ByPerson | v24 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3353
- Analytics_Safe_Surface: 22862 rows

---

## [v1.0.5] — Identity Curation Round 2
**Release date:** 2026-02-27

### Changes
- **Unresolved curation** (`tools/20_curate_unresolved.py`): classified 87 entries from v15 Unresolved — 62 exits to Truth (city/nickname/trick-suffix cleanup), 21 reclassified as `__NON_PERSON__`, 4 deduped. Unresolved v15→v16.
- **Backfill round 2**: 20 HIGH-tier fuzzy resolutions applied via tools 15+18. Unresolved v16→v17.
- **G23 merge + round-2 cleanup** (`tools/21_promote_v20.py`): Juan Palomino 3-way Truth merge; 9 further Unresolved cleanups. Truth v18→v20 (-2), Unresolved v17→v18 (-9).
- **Backfill round 3**: 4 Czech/Spanish resolutions (Jindřich Smola ×2, Vojtěch Janousek, Juan Bernardo Palacios Lemos). Unresolved v18→v19 (-4).
- **REC-E/I Truth merges** (`tools/22_merge_truth_pairs.py`): Jakob Wagner Revstein → Jakob Wagner (same-event alias); Noah Jay Bohn → Noah Jay (last name dropped in results). Truth v21→v22 (-2).
- **Archive hygiene**: all superseded lock versions moved to `inputs/identity_lock_archive/`.

### Identity lock state
| Artifact | Version | Rows |
|---|---|---|
| Persons_Truth_Final | v22 | 3341 |
| Persons_Unresolved_Organized | v19 | 299 |
| Placements_ByPerson | v23 | 25679 |

### Pipeline outputs
- Gate3: PASS = 3341
- Analytics_Safe_Surface: 22862 rows
- Placements_Flat: 25679 rows

---

## [v1.0.4] — QC Package Reorganization
**Release date:** 2026-02-25

### Changes
- Organized all QC modules into `qc/` Python package (`qc/__init__.py`).
- Fixed import paths across pipeline after QC reorganization.
- Restored original Stage 03 / Stage 04 workbook builders for v1.0 format parity.
- Hardened `.gitignore` to exclude editor backup files and build artifacts.

**Data: no change.** Identity lock artifacts are identical to v1.0.0.

---

## [v1.0.0] — Canonical Identity-Locked Release
**Release date:** 2026-02-25

### 🚀 Overview
First **archive-quality canonical release** of the Footbag historical results dataset.

This release formalizes **human-verified identity resolution** as authoritative input
and introduces **Identity Lock Mode**, making the pipeline fully deterministic,
reproducible, and safe for public distribution and long-term preservation.

---

### 🔐 Identity Model (Breaking Change)
- Introduced **Identity Lock Mode**.
- Identity is no longer derived heuristically in release builds.
- Canonical identity is sourced exclusively from human-verified artifacts:
  - `Persons_Truth_Final_v13.csv`
  - `Persons_Unresolved_Organized_v11.csv`
  - `Placements_ByPerson_v13.csv`
- Exactly **one row per real person** in `Persons_Truth`.
- All unresolved humans preserved in `Persons_Unresolved`.
- All non-person / garbage entities explicitly classified (`__NON_PERSON__`).
- No speculative merges.
- No silent drops.

**This is a breaking conceptual change** relative to pre-v1.0 versions.

---

### 🧠 Pipeline Architecture
- Added explicit **Release Mode vs Rebuild Mode** distinction.
- Rebuild Mode:
  - Parses mirror data.
  - Produces candidates and audits only.
  - Does *not* reproduce canonical identity.
- Release Mode:
  - Consumes identity-lock inputs.
  - Produces final canonical dataset and workbook.
  - Deterministic from a clean clone.

---

### 🧩 Script-Level Changes
- **02p5_player_token_cleanup.py**
  - Added `--identity_lock_*` options.
  - Can now generate `Placements_Flat.csv` directly from authoritative placements.
  - Heuristic identity logic bypassed in release mode.

- **03_build_excel.py**
  - Uses identity-locked `Placements_Flat.csv`.
  - Produces presentation-safe canonical workbook.

- **04_build_analytics.py**
  - Accepts identity-lock inputs directly.
  - Enforces identity immutability.
  - Writes `persons_truth.lock` sentinel with hashes and row counts.
  - Analytics depend only on canonical identity outputs.

---

### 📊 Outputs
- Canonical CSVs (generated, not committed):
  - `Placements_Flat.csv`
  - `Persons_Truth.csv`
  - `Persons_Unresolved.csv`
- Final Excel workbook:
  - `Footbag_Results_Canonical.xlsx`
- Identity lock sentinel:
  - `out/persons_truth.lock`

---

### 🧪 Quality & Coverage Guarantees
- Every placement competitor maps to exactly one of:
  - `Persons_Truth`
  - `Persons_Unresolved`
  - `__NON_PERSON__`
- No row loss without audit.
- Deterministic ordering and reproducible builds.
- Identity coverage is enforced, not assumed.

---

### 📁 Repository Cleanup
- Introduced `inputs/identity_lock/` for authoritative human truth artifacts.
- Non-core helpers moved to:
  - `qc/`
  - `tools/`
  - `legacy/`
- Generated outputs and large static inputs excluded from git.
- README rewritten to reflect v1.0 contract and usage.

---

### 📜 Contract Status
- Original design contract preserved in `CLAUDE.md`.
- v1.0 release is a **faithful execution** of the contract’s core principles:
  - human truth is authoritative
  - no guessing
  - deterministic pipeline
  - full auditability

---

## Pre-Canonical Patch Tags (Historical Reference)

The tags below were applied during the **development phase before v1.0.0** was cut.
They represent intermediate checkpoints on the road to the canonical identity-locked release.
They are **not post-v1.0.0 patches** — they predate the identity-lock architecture.
Preserved for provenance.

### [v1.0.3-persons-clean]
- Finalized collision-free `Persons_Truth` in Stage 04.
- Unresolved / colliding identities quarantined to `Persons_Unresolved`.
- Tag message: *"Collision-free Persons_Truth; unresolved identities quarantined"*

### [v1.0.2]
- Stage 01: made mirror root path explicit; enabled recovered-results overrides.
- Workbook: preserved README sheet across rebuilds; added `Persons_Unresolved` triage columns.
- Introduced `readme-excel.csv` as the workbook README source of truth.

### [v1.0.1]
- Fixed Stage 03 JSON scoping bug that caused failures on clean clones.
- Tag message: *"Fix Stage 03 Excel build for clean clones"*

---

## Pre-v1.0 Versions (Historical)
Earlier versions (≤ v0.x / Gate-series) represent **development and stabilization phases**:
- Identity partially heuristic
- Manual post-hoc corrections required
- Not suitable for archival or public canonical use

They are preserved for provenance only.

---

## Versioning Policy (Going Forward)

- **Patch** (v1.0.x):  
  Documentation, code cleanup, performance, no data changes.

- **Minor** (v1.x.0):  
  Additive data, new analytics, new sheets — **no identity changes**.

- **Major** (v2.0.0):  
  Any change to:
  - Persons_Truth
  - Persons_Unresolved
  - Identity classification rules

---

*End of changelog.*
