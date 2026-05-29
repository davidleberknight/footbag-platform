# PassBack Curated Media Ingestion — Staging Workflow

Status: staging-only. Read-only on the DB. Produces curator-review candidates, not promotions.

**PROMOTION GATE:** PassBack trick / dictionary / alias promotion is blocked while Red Husted Wave 2
(six grammar-level questions) is open. Nothing in this workflow writes to `freestyle_tricks`,
`red_additions`, `red_corrections`, or alias tables. Candidates wait for the gate to lift.

**PLAYLIST RULE:** The ~68-video "Big footbag tricks" playlist stays a single playlist-level curated
artifact (`source_id='curated_playlists'`, one `media_items` row). Per the standing instruction it is
not expanded into per-video rows. This workflow treats the playlist as a *corpus to analyze*, not a
set of rows to create.

---

## 1. What already exists (reuse, do not regenerate)

PassBack intake is substantially built and staged:

- **Video set-list intake:** `legacy_data/tools/build_passback_intake.py` (the Set List video).
  Outputs under `curated/freestyle_media/`: `video_term_inventory.csv`, `video_snippet_candidates.csv`
  (plus set/alias candidates). 67 sets captured at playlist level.
- **Dictionary + glossary intake:** `legacy_data/tools/build_passback_dictionary_intake.py`
  (+ `test_passback_dictionary_intake.py`). Inputs: `passback-dicrionary.txt` (240 rows),
  `pb-dict2.txt` (42 cross-sport), `passback-glossary.txt` (180 terms).
  Outputs in `exploration/passback-intake/`:
  - `passback_trick_sources.csv` (240 rows, raw fields preserved + derived match-status)
  - `passback_source_links_staging.csv`, `passback_alias_candidates_staging.csv`,
    `passback_glossary_staging.csv`
  - `passback_reports/`: `matched_existing.csv`, `new_candidates.csv`, `alias_candidates.csv`,
    `conflicts.csv`, `needs_review.csv`, `glossary_terms.csv`
- **Curated tutorials already live:** 3 PassBack tutorial videos (Pixie Set List, How to Learn,
  How to Identify and Name) + the playlist artifact, in the unified model.

This sprint does not rebuild any of that. It defines how the existing staging becomes a curator-review
queue and what additional candidate views to derive, all read-only.

---

## 2. Candidate extraction targets (read-only outputs)

Each target is a CSV proposal for curator review under
`exploration/freestyle-media-ingestion-2026-05-29/candidates/`. None mutate the DB.

1. **Canonical-trick linkage candidates** — for each curated PassBack media item / dictionary row that
   matches an existing slug, the proposed `#<slug>` linkage tag (and `#family-*` if confident).
   Source: `matched_existing.csv` (exact_slug / exact_alias_text rows; high confidence).
2. **Unresolved-trick queue** — dictionary rows with `match_status=new_candidate` and no slug
   (Anonymous, Archnemesis, Armaggedon, Atom Bomb, Badger, Barfry, ...). These are the promotion
   backlog; they stay queued behind the Red Wave 2 gate. NOT linked, NOT created.
3. **Combo-decomposition candidates** — multi-component PassBack technical names (uptime + downtime
   components) parsed into ordered component lists for curator decomposition review. Evidence only.
4. **Operator-extraction candidates** — modifiers/operators implied by technical names (Spinning,
   Barraging, Miraging, Symp., Nuclear, Flailing, Pixie, far/near). Cross-referenced to the registered
   modifier set; flagged where PassBack implies an operator not yet registered.
5. **Progression-relationship candidates** — where the corpus implies a learn-order (e.g. base →
   modified), captured as `#progression-*` edge proposals. Curator-confirmed only.
6. **Family-linkage candidates** — proposed `#family-<slug>` tags for matched items, derived from the
   matched trick's `trick_family` (never from the PassBack title — frequency is evidence, not authority).
7. **Tutorial-series grouping** — PassBack methodology videos grouped as an instructional series
   (`#kind-series`), parallel to the TT roster pattern, for a future series view.

---

## 3. Matcher caveats found in the existing staging (must surface to curator)

The existing intake under-matches in places; the review queue must not be trusted as final:

- **False "new_candidate" on existing tricks:** `new_candidates.csv` lists "Assassin" (technical name
  "Pixie Ducking far Mirage") as `no_match`, but `assassin` exists and is active in the dictionary
  (mirage family, has op_notation). The slug matcher missed it. Every `new_candidate` row needs a
  human existence check before it is treated as a promotion candidate.
- **Dex-vs-ADD divergences on matched rows:** `matched_existing.csv` carries
  `passback_dex_count_vs_ifpa_adds` deltas (e.g. atomsmasher -2, atw -1, barfly -2). These are the
  known PassBack-outlier pattern: PassBack dex counts are non-authoritative for ADD when canonical
  sources agree. Linkage is still safe; the ADD delta is a note, not a correction.
- **Conflicts:** `conflicts.csv` flags Pogo (`dex_exceeds_adds`, dex 2 vs adds). Held for curator;
  not auto-reconciled.

These caveats are exactly why ingestion is staging-only and curator-gated.

---

## 4. Workflow sequence (all steps read-only until the gate lifts)

1. Derive the seven candidate CSVs (§2) from the existing staging + read-only DB cross-checks.
   No regeneration of the upstream intake; consume its outputs.
2. Curator reviews the candidate CSVs. Existence-checks every `new_candidate` (§3). Routes each:
   link-now (matched, safe) / promote-later (real new trick, Red-gated) / alias / reject / defer.
3. **Linkage application (curated media tags only, not ontology):** once the taxonomy module
   (ARCHITECTURE §6) is approved and wired, matched media items get `#<slug>` / `#family-*` /
   `#kind-*` tags. This is media metadata on `media_items`, not a `freestyle_tricks` change — it is
   the one action that could land before Red Wave 2 closes, because it touches media, not ontology.
   It still requires coordination with the maintainer's media/UI track.
4. **Trick/dictionary/alias promotion stays blocked** until Red Wave 2 answers land, then follows the
   existing promotion path (red_additions + loader 19 + tracked-names regen), out of scope here.

---

## 5. Guardrails (restated)

- No DB writes in this sprint. Candidate CSVs only.
- Playlist stays playlist-level.
- No promotion while Red Wave 2 is open.
- Frequency in the PassBack corpus is evidence, never authority: a PassBack title never auto-promotes
  to a canonical name, alias, operator, or formula.
- Uncurated firewall applies to any future community PassBack-adjacent uploads (ARCHITECTURE §5).
