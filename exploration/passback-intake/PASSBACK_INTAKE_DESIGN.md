# PassBack Dictionary/Glossary Intake — Design

Design for non-destructive intake of PassBack dictionary + glossary as source evidence for the freestyle dictionary. Source-of-truth: IFPA canonical remains authoritative; PassBack provides additional asserted evidence captured via the existing `freestyle_trick_source_links` provenance pattern.

**Status:** design-phase artifact. Implementation script + staging CSVs land alongside this document.

**Date:** 2026-05-12
**Constraints (hard, from task brief):**
- Preserve all raw fields from PassBack source.
- No auto-overwrite of canonical: ADD values, descriptions, trick_family, ambiguous aliases, controversial/archaic definitions.
- Safe auto-actions limited to: source-provenance staging, unambiguous alias proposals, educational-glossary stages.
- Deterministic CSV output (stable sort; idempotent re-runs).
- QC: no unknown slugs; no duplicate aliases; no canonical overwrite; deterministic output.

**Input files (current state, `legacy_data/inputs/curated/tricks/`):**
- `passback-dicrionary.txt` (240 rows; tab-separated; columns: `Nickname(s) / Primary Name(s)`, `Technical Name(s) / Description`, `Uptime Component`, `Downtime Component`, `Dex Count`, `Notes`). Present.
- `pb-dict2.txt` (42 rows; tab-separated; columns: `Freestyle Footbag Trick/Concept`, `Freestyle Football Trick/Concept`, `Notes`). PassBack cross-sport map between freestyle footbag and freestyle football. Present.
- `passback-glossary.txt` (613 lines; structured-prose document). Renamed from typo'd `passbaxk-glossary.txt` 2026-05-12. Parsed via TOC → Body → Index walk; 180 terms extracted. Incorporated.

**Source registrations:** three distinct source IDs distinguish the input files in staged source-links:
- `passback_dictionary` — for rows from `passback-dicrionary.txt`
- `passback_xsport_map` — for rows from `pb-dict2.txt` (cross-sport equivalences)
- `passback_glossary` — for terms extracted from `passback-glossary.txt` (educational layer only)

The `source_file` column in the staging CSV records each row's origin for downstream filtering. Glossary terms are emitted to a separate staging file (`passback_glossary_staging.csv`) since their schema differs from trick-row staging.

---

## A. Recommended data model

Layered: source-preserved raw → matched/classified staging → reviewer-action queue → (eventual) DB integration.

### A.1 Source registration

Register PassBack as a row in `freestyle_trick_sources` (one-time):

```
id            = passback_dictionary
source_type   = imported
source_label  = PassBack dictionary
source_url    = (curator-supplied; e.g. PassBack YouTube channel / community wiki)
retrieved_at  = 2026-05-12
notes         = Community-maintained PassBack dictionary; provides nickname / technical-name / uptime-downtime-component / dex-count for ~240 named tricks. PassBack 'Dex Count' is NOT equivalent to IFPA 'adds'; treat as asserted-evidence only.
```

The intake script **does NOT insert this row**. It stages the source-registration record in a staging CSV; human approval required for DB insert.

### A.2 Per-row staging schema (`passback_trick_sources.csv`)

Each PassBack source row produces one staging row. Both PB dictionary and pb-dict2 cross-sport-map rows share this schema:

| Column | Source | Description |
|---|---|---|
| `source_file` | filename | `passback-dicrionary.txt` or `pb-dict2.txt` |
| `passback_primary_name` | raw column 1 | Nickname / primary name (split on `,` if multiple, kept comma-delimited in this column). For pb-dict2: the freestyle footbag side. |
| `passback_alternate_names` | raw column 1 (or footbag-side `/`-split for pb-dict2) | Pipe-delimited list of alternate names. For pb-dict2, the cross-sport football equivalent appears as `futbol:<name>` so the matcher does not accidentally classify a football term as an IFPA alias. |
| `passback_technical_name` | raw column 2 (PB dict 1); footbag-side parenthetical (pb-dict2) | PB dict 1: technical name / description as PassBack records it (`Spinning far Miraging Symp. Miraging Refraction` etc.). pb-dict2: parenthetical decomposition extracted from the footbag-column entry (e.g. `Bladerunner (Atomic Eggbeater)` → tech = `Atomic Eggbeater`). |
| `passback_uptime_component` | raw column 3 (PB dict 1 only) | Uptime component label. Empty for pb-dict2 rows. |
| `passback_downtime_component` | raw column 4 (PB dict 1 only) | Downtime component label. Empty for pb-dict2 rows. |
| `passback_dex_count` | raw column 5 (PB dict 1 only) | Dex Count (PassBack's count of dex flicks; ≠ IFPA adds). Empty for pb-dict2 rows. |
| `passback_notes` | raw column 6 (PB dict 1) or raw column 3 (pb-dict2) | Free-form notes from PassBack. |
| `normalized_primary_name` | derived | Lowercased, space-to-dash, punctuation-stripped form of primary name |
| `candidate_trick_slug` | derived | Best-guess IFPA slug match (NULL when no match) |
| `match_status` | derived | One of: `matched_existing` / `alias_candidate` / `new_candidate` / `conflict` / `needs_review` |
| `match_reason` | derived | Short explanation: which match-rule fired (`exact_slug` / `exact_alias` / `normalized_alias` / `technical_name_canonical` / `no_match` / `ambiguous` / `dex_count_disagreement` / etc.) |
| `match_confidence` | derived | `high` / `medium` / `low` (deterministic per rule) |
| `passback_dex_count_vs_ifpa_adds` | derived | Signed delta when matched (`passback_dex_count - ifpa.adds`); empty when not matched or comparable |
| `review_status` | derived | `auto_ok` / `needs_review` / `blocked` (status for the reviewer queue) |
| `operator_notes` | reviewer | Free-form column for human curator annotations during review |

**Field-preservation rule:** every raw PassBack field is preserved verbatim. Derived fields are read-only and re-generated on re-run.

### A.3 Source-link staging schema (`passback_source_links_staging.csv`)

For each `matched_existing` row, the intake stages a `freestyle_trick_source_links` candidate insert:

| Column | Value |
|---|---|
| `trick_slug` | matched canonical slug |
| `source_id` | `passback_dictionary` |
| `external_ref` | passback_primary_name (so curator can locate in source) |
| `external_url` | (curator-supplied or NULL) |
| `asserted_adds` | passback_dex_count IFF differs from IFPA adds; else NULL |
| `asserted_notation` | passback_technical_name IFF differs from IFPA notation; else NULL |
| `asserted_category` | NULL (PassBack does not carry IFPA-comparable category) |
| `notes` | derived; pipe-delimited evidence string (uptime, downtime, dex-count, original notes) |

**No DB insertion in this phase.** The staging CSV is review-ready for a future loader pass after human approval.

### A.4 Alias-candidate staging schema (`passback_alias_candidates_staging.csv`)

For each `alias_candidate` row, the intake stages a potential `freestyle_trick_aliases` insert:

| Column | Value |
|---|---|
| `alias_slug` | normalized form (kebab-case) |
| `alias_text` | passback_primary_name (or alternate from column 1) |
| `trick_slug` | matched canonical slug |
| `alias_type` | `common` / `abbreviation` / `historical` (heuristic) |
| `source_id` | `passback_dictionary` |
| `notes` | source-context note for curator review |
| `safety_class` | `safe` / `needs_review` / `blocked` (per existing `PASSBACK_ALIAS_CANDIDATES.csv` taxonomy — only `safe` is eligible for unattended import; the 2026-05-11 safe-alias load is the precedent) |

**Safe alias rules:** an alias is `safe` only when (a) the canonical slug exists, (b) the alias_slug does not collide with any existing alias_slug, (c) the alias_text differs from the canonical_name, (d) the technical_name resolves to the same canonical row through the alias resolver, and (e) the dex_count agrees with the canonical's modifier+base composition. **All other cases route to manual review.**

### A.5 Glossary intake schema (`passback_glossary_staging.csv`)

`passback-glossary.txt` is parsed via TOC → Body → Index walk. The TOC at the top of the document supplies the authoritative section-header list (~30 sections like `Bags`, `Tricks`, `Dexes`, `ADDs`, `Combining multiple tricks`). The alphabetical Index at the bottom (180 entries; comma-separated alternate forms) is the authoritative term inventory. For each Index term, the parser finds its first occurrence in the body and captures the surrounding paragraph + section header as the definition context.

| Column | Value |
|---|---|
| `term` | glossary term (primary form, first entry in the Index line) |
| `alternate_forms` | pipe-delimited alternate forms (comma-split from same Index line: `ADD, ADDs, additional degree of difficulty` → primary=`ADD`, alternates=`ADDs|additional degree of difficulty`) |
| `passback_section` | section header from TOC walk (e.g., `ADDs`, `Combining multiple tricks`, `Spins`) |
| `passback_explanation` | extracted paragraph text from the body (capped at 1500 chars for CSV readability) |
| `existing_glossary_anchor` | matched token from `UX1_GLOSSARY_TOKEN_MATRIX.csv` (case-insensitive exact match on term OR any alternate form); NULL when no match |
| `proposed_layer` | `educational` (always; PassBack glossary never auto-promotes to canonical/authoritative) |
| `match_status` | `existing_term` (cross-referenced to UX1 token) / `new_term` (not in UX1) |
| `review_status` | `auto_ok` (existing_term) / `needs_review` (new_term) |
| `notes` | derived match-context: which UX1 token matched + the UX1 short_label, OR "no UX1 token match" |

Existing glossary terms (cross-referenced via UX1 anchor) are NOT overwritten. New terms stage as candidates for the future educational glossary expansion. **Glossary terms are NEVER auto-promoted to the canonical `docs/Freestyle_Footbag_Glossary.md` v2 doc** (which is curator-owned). The staging output documents PassBack-side framing for educational-layer reference only.

### A.5.1 Parser notes

- **Title-cased TOC entries** become the section-header set; this catches headers like `ADD System Controversy` (3 words) without false-positives like `Ex: When first learning Blur, players often...` (would not match the TOC regex).
- **Term-occurrence search** is case-insensitive and matches substring presence in any body line; the first match wins. This handles in-line term introductions ("Footbags, or **bags** for short...") without requiring bold-marker parsing (which would be unavailable in plain-text source).
- **Paragraph boundary detection** walks backward + forward from the match line until a blank line is encountered on each side; the resulting paragraph becomes the explanation text.
- Terms that do NOT appear in the body (e.g., very general index entries) retain empty `passback_section` + `passback_explanation` columns. These rows are still emitted; the curator can review whether they're meaningful entries.

---

## B. Files / scripts created (this design)

```
exploration/passback-intake/
├── PASSBACK_INTAKE_DESIGN.md                  (this file)
├── passback_trick_sources.csv                 (240-row primary staging output)
├── passback_source_links_staging.csv          (matched-row → source-link proposals)
├── passback_alias_candidates_staging.csv      (alias-candidate proposals)
├── passback_reports/
│   ├── matched_existing.csv                    (rows that resolve to current canonical slugs)
│   ├── new_candidates.csv                      (rows with no canonical match — curator decision required)
│   ├── alias_candidates.csv                    (rows that may be aliases — safety classification)
│   ├── conflicts.csv                           (ADD / dex / component disagreements)
│   ├── needs_review.csv                        (ambiguous matches)
│   └── glossary_terms.csv                      (placeholder; populated when glossary file lands)

legacy_data/tools/
├── build_passback_dictionary_intake.py        (matcher + staging-CSV emitter)
└── test_passback_dictionary_intake.py         (QC test suite)
```

The intake script is **read-only** on the database. It performs no DB writes. All staging is to CSV files under `exploration/passback-intake/`. **No commits performed by the script.** Outputs land in version-control-tracked locations so re-runs produce auditable diffs.

---

## C. Match-status rules

Match-status assignment is **deterministic**: identical inputs → identical staging output. Rules apply in order; first match wins.

| Rule # | Rule name | Condition | Status | Confidence | Auto-action |
|--:|---|---|---|---|---|
| 1 | `exact_slug` | `normalized_primary_name == canonical.slug` exactly | `matched_existing` | high | source-link stage |
| 2 | `exact_alias_text` | `passback_primary_name == any freestyle_trick_aliases.alias_text` (case-insensitive exact) | `matched_existing` | high | source-link stage |
| 3 | `exact_alias_slug` | `normalized_primary_name == any freestyle_trick_aliases.alias_slug` | `matched_existing` | high | source-link stage |
| 4 | `normalized_canonical` | `normalized_primary_name == canonical.canonical_name` after lowercasing + space-to-dash | `matched_existing` | high | source-link stage |
| 5 | `alternate_name_alias` | One of `passback_alternate_names` matches existing alias_text or alias_slug | `alias_candidate` | medium | alias-candidate stage (safe-class) |
| 6 | `technical_name_canonical` | `passback_technical_name` matches an existing canonical `canonical_name` OR resolves through alias resolver to one row | `alias_candidate` | medium | alias-candidate stage (safe-class IFF dex_count agrees) |
| 7 | `dex_count_disagreement` | Row matched by rule 1-4 BUT `passback_dex_count` differs from `ifpa.adds` by ≠ 0 AND row is NOT in the published §3.2 policy class | `conflict` | (inherits from match rule) | source-link stage; staged with `asserted_adds = passback_dex_count` |
| 8 | `multiple_canonical_match` | Normalized name resolves to >1 canonical slug | `needs_review` | low | flag for curator |
| 9 | `unresolved_technical_name` | Technical name contains PassBack vocabulary not in IFPA modifier table (`Pdx.`, `Symp.`, `near`, `far`, etc.) AND row has no other match | `needs_review` | low | flag for curator |
| 10 | `no_match` | No rule above fires | `new_candidate` | medium | candidate stage; curator decision required |

**Confidence levels** are determined by the rule; `match_confidence` column in the staging CSV records the rule that fired.

### C.1 Notes on conflict detection

PassBack `Dex Count` is **not** IFPA `adds`:
- PassBack counts dex flicks only.
- IFPA `adds` counts dex flicks + modifier bonuses + delay (+1 per pt-rules).

A `dex_count_disagreement` is NOT automatically a federation conflict — it is the **expected baseline** for many rows. The rule fires only to mark rows where the divergence is worth surfacing for review. **No ADD-value overwrite ever follows from a conflict classification.**

### C.2 Notes on alias safety

The 2026-05-11 `PASSBACK_ALIAS_CANDIDATES.csv` precedent established safe-alias criteria:
- canonical row exists
- alias_slug does not collide
- alias_text differs from canonical_name
- alias resolver round-trip to same canonical
- no dex-count contradiction

Only rows passing ALL criteria stage as `safe`. The 7 safe-aliases loaded 2026-05-11 (blender "blender (same side)" + flurry "flurry (toe set)" + drifter variants + reverse-drifter variants + barraging-osis "barroque") are the load-bearing precedent.

---

## D. Safe auto-imports

Operations that are unambiguous and produce no canonical-data overwrite. Each operation has a separate gate.

### D.1 Source registration

**Action:** Stage `freestyle_trick_sources` row for `passback_dictionary` source.
**Auto-execute:** NO (curator inserts after design review).
**Why deferred:** even adding a source row is a one-way action; curator approval keeps the source-registry monotonic.

### D.2 Source-link staging for `matched_existing` rows

**Action:** Stage `freestyle_trick_source_links` rows.
**Auto-execute:** NO (the script emits the staging CSV; loader pass is a separate step).
**Why deferred:** evidence-recording is low-risk but should pair with the source-registration insert.

### D.3 Unambiguous safe-class alias proposals

**Action:** Stage `freestyle_trick_aliases` rows for `safe`-class candidates only.
**Auto-execute:** NO (matches 2026-05-11 precedent — curator runs a transaction-wrapped loader after review).
**Why deferred:** alias inserts are public-surface visible; even "safe" requires curator sign-off.

### D.4 Glossary educational-layer staging

**Action:** When `passback-glossary.txt` arrives, stage educational glossary terms.
**Auto-execute:** NO (staging only; no `docs/` edits per `docs/CLAUDE.md` rule).
**Why deferred:** glossary is a published doc; v2 is James-owned. New educational terms route to `exploration/freestyle-notation-grammar/` observational layer until curator review.

**Summary:** Every "safe auto-import" is STAGED, not EXECUTED. The intake script is read-only on DB; all writes are to CSV files. The curator runs a separate loader transaction after reviewing the staging output. This matches the existing `feedback_phased_scope_control.md` discipline and `.claude/rules/db-write-safety.md` (read-only diagnostic first, audit + rollback, explicit `--apply` flag).

---

## E. Manual review queue

Rows that **require curator decision** before any DB action:

| Queue file | Contents | Curator action |
|---|---|---|
| `passback_reports/new_candidates.csv` | Rows where PassBack records a trick not in IFPA dictionary | Decide: add canonical row (red review queue passage) / add as alias / reject as PassBack-only / defer |
| `passback_reports/alias_candidates.csv` | Rows where match exists via alias-likely path | Confirm safety class; promote `safe` to alias-insert; reject `needs_review`; defer `blocked` |
| `passback_reports/conflicts.csv` | Rows where dex-count or notation disagrees with IFPA | Record as `federation_math_divergence` (FM_MATH_DIVERGENCES.csv pattern) / accept as expected baseline / escalate to Red |
| `passback_reports/needs_review.csv` | Rows that don't fit a single match-rule cleanly | Curator-level disambiguation |
| `passback_reports/glossary_terms.csv` | (placeholder) Educational terms from future glossary file | Layer as educational-only; never overwrite canonical glossary |

### E.1 Curator workflow (proposed)

1. Run intake script → generates staging CSVs.
2. Curator reviews `passback_reports/needs_review.csv` first (ambiguous matches; smallest queue).
3. Curator reviews `passback_reports/conflicts.csv` — categorizes each: federation-math-divergence registration / accepted baseline / Red escalation.
4. Curator reviews `passback_reports/alias_candidates.csv` — flips safety-class labels as needed.
5. Curator reviews `passback_reports/new_candidates.csv` — typical highest-volume queue; routes each to: new canonical (Red review) / alias (back to alias_candidates) / PassBack-only (reject).
6. Curator approves staging CSVs by signing them off (or by writing a `passback_intake_approved.txt` marker file).
7. Separate loader pass executes the approved subset: source-registration insert + source-link inserts + safe-alias inserts.
8. Re-run intake to confirm no drift (deterministic-output check).

**No step in this workflow is automated.** The script emits CSVs; the curator drives the rest.

---

## F. Next-step recommendation

After this design is approved:

1. **Build the matcher script** (`build_passback_dictionary_intake.py`). Read-only on DB; emits staging CSVs. Deterministic. ~300-500 lines.
2. **Build the QC test suite** (`test_passback_dictionary_intake.py`). Covers: no-unknown-slugs / no-duplicate-aliases / no-canonical-overwrite / deterministic-output / round-trip-equivalence.
3. **Run the matcher on `passback-dicrionary.txt`**. Generates the 240-row `passback_trick_sources.csv` + the 5 review-report CSVs.
4. **Curator review pass.** Walk each report queue; flip statuses; collect new-canonical-row candidates for Red review batch.
5. **Build the staging loader** (separate script; only runs after curator approval). Inserts source row + source-link rows + safe-class alias rows in transaction with audit + rollback per `db-write-safety.md`.
6. **Defer glossary intake** until `passback-glossary.txt` arrives. The schema is documented (§A.5) so the glossary file can land any time without design rework.

**Out-of-scope for this design:**
- Automated Red-review packet generation from new_candidates queue (could be a future enhancement).
- UX surface for the educational glossary layer (lives in `docs/` decisions; not in this design).
- Auto-execution of any DB writes (rules out by task brief).

---

## Cross-references

- `legacy_data/tools/build_passback_intake.py` — existing PassBack VIDEO set-list intake (different path; outputs `curated/freestyle_media/`).
- `exploration/footbagmoves-federation/PASSBACK_ALIAS_CANDIDATES.csv` — 7 safe-aliases loaded 2026-05-11 (precedent).
- `exploration/footbagmoves-federation/PASSBACK_CONFLICT_MATRIX.csv` — earlier PassBack/IFPA conflict surveying.
- `exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv` — 22-row federation_math_divergence registry (PassBack rows route here when conflict-classified).
- `exploration/freestyle-notation-grammar/UX1_GLOSSARY_TOKEN_MATRIX.csv` — 83-row token inventory (semantic + operational).
- `exploration/freestyle-notation-grammar/GRAMMAR_GLOSSARY_V3.md` — symbolic-grammar observational glossary (separate layer; not authoritative).
- `docs/Freestyle_Footbag_Glossary.md` — canonical glossary (James-owned; non-authoritative for ADD math).
- `feedback_phased_scope_control.md` — approval-by-artifact-path workflow rule (this design follows).
- `feedback_paused_crosstrack_no_writes.md` — no writes to contested surface; intake stays staging-only.
- `feedback_public_facing_prose.md` — prose hygiene (irrelevant here; staging is internal).
- `.claude/rules/db-write-safety.md` — read-only diagnostic first; audit + rollback; explicit apply flag.

---

## Constraint check

| Constraint | Status |
|---|---|
| Preserve all raw fields | ✓ (6 PassBack columns preserved verbatim in `passback_trick_sources.csv`) |
| No auto-overwrite canonical ADD | ✓ (no DB writes; `asserted_adds` preserves source claim) |
| No auto-overwrite canonical description | ✓ (no DB writes) |
| No auto-overwrite canonical family | ✓ (no DB writes) |
| No auto-overwrite ambiguous aliases | ✓ (alias staging requires curator approval; only `safe`-class queue for unattended import) |
| No auto-overwrite controversial/archaic definitions | ✓ (no DB writes; curator decides) |
| Deterministic CSV output | ✓ (rules apply in order; first match wins; stable sort by primary_name) |
| Tests/QC required | ✓ (test suite covers no-unknown-slugs / no-duplicate-aliases / no-canonical-overwrite / determinism) |
