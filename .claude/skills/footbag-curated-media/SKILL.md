---
name: footbag-curated-media
description: Use when adding, modifying, validating, or troubleshooting curated freestyle media intake for the footbag-platform project: Tricks of the Trade lessons, PassBack Records, AnzTrikz tutorials, Shred Global, FootbagSpot, or any future tutorial / record / expert-review source. Enforces the established curated-source pipeline (snippet_candidates → promote → sidecars → media_items → tag-based gallery), the trick-tag invariant, and the boundary between curator data-prep / gallery-sidecar work and the admin gallery-editor UI and schema.
---

# Footbag Curated Media Skill

Use this skill when the task is **curated freestyle media intake**: staging, validating, promoting, tagging, or backfilling reference media that links to a freestyle trick, record, or category.

> **Lifecycle scope: this skill governs PRE-GO-LIVE curated-media data prep.** The CSV → sidecar → seeder → DB pipeline below builds the database before go-live, when `/curated/` is the source of truth. After go-live the persistent production DB is the source of truth and curated media is managed through the admin UI, which writes the DB directly; the seeder is not run against production (DD §1.13). The rules below are the pre-go-live data-prep contract, not a claim that the seeder is the eternal only writer of `media_items`.

> **Scope.** Curated-media data work is done directly through this pipeline: the `curated/galleries/*.json` sidecars, gallery creation, running `seed_fh_curator.py` (standalone and idempotent; it lands sidecar changes without a full `reset-local-db.sh`), and the emerging-vocab generators. The admin gallery-editor UI code (`adminCuratorController.ts`, `curatorMediaService.ts`, `src/views/admin/curator/**`) and the gallery schema are application code, changed through normal review. A named gallery is a tag-AND `member_galleries` row; a catch-all gallery's `excludeTags` MUST list every source-gallery tag or it double-lists.

## 1. Core pipeline

The pipeline is fixed. Do not invent parallel systems.

```
raw source (e.g., legacy_data/inputs/curated/records/passback_raw_input.txt,
            yt-dlp inventory, FootbagSpot index, expert reply)
   ↓  manual + scripted classification
freestyle/tools/trick_video_discovery/snippet_candidates.csv
   (rows with reviewer column blank are "staged but unapproved";
    rows with reviewer set to a non-empty value are "approved";
    rows with reviewer starting "promoted_*" are already done)
   ↓  scripts/promote_snippet_candidates.py  (URL-reference only;
       never downloads videos; never writes MP4s)
curated/freestyle_tricks/{trick-slug}_{sha1(video_id)[:8]}.meta.json
   (one sidecar per (trick_slug, video_id); shape is fixed,
    see §3 and §10 examples)
   ↓  scripts/seed_fh_curator.py
DB: media_items + media_tags
   ↓  named gallery filter via member_gallery_tags (tag-AND match)
public gallery page at /media/<gallery_id>
```

The `snippet_candidates.csv` schema is `source_id,url,trick_slug,start_seconds,end_seconds,player_name,clip_type,confidence,reviewer,notes`. New rows must conform exactly.

For record-categories that have no canonical `freestyle_tricks.slug`, see §4: those go to a **separate** staging file (`passback_record_categories.csv`), not into `snippet_candidates.csv`.

## 2. Hard rules

1. **No direct DB writes for media intake during data prep.** In the data-prep workflow, curated media enters via `seed_fh_curator.py` reading sidecars; manual `INSERT INTO media_items` is forbidden. (The admin curator UI writes `media_items` directly — the sanctioned runtime path, not data prep — per DD §1.13.)
2. **No fake trick slugs.** A sidecar's `trick_slug` (and the `#<slug>` tag) must reference a real row in `freestyle_tricks` (active or pending). If the source name has no canonical slug, route to RECORD_CATEGORY (§5): never invent a placeholder slug.
3. **Do not drop legitimate source items silently.** Every source row gets classified into one of the 7 buckets in §5. REJECT is **not** a bucket; non-trick record categories are preserved in their own staging file.
4. **Duplicate trick coverage is allowed.** The same `trick_slug` may have a TT tutorial sidecar AND a PassBack record sidecar AND an AnzTrikz tutorial sidecar. They are not duplicates of each other.
5. **Duplicate media rows are not allowed.** A "true duplicate" is `(source_id, video_url)` already present as a sidecar or already in `snippet_candidates.csv`. Skip those.
6. **Review-needed items go to a separate queue file**, not into `snippet_candidates.csv` with empty `trick_slug`. The promote script requires `trick_slug` to be set, and the validator rejects empty / unresolved slugs.
7. **Idempotency.** Backfill scripts (e.g., add a missing tag to existing sidecars) must produce zero changes on a second run. Always include a "pass 2" check when writing one.

## 3. Tag rules

Every trick-media sidecar **must** have, at minimum:

```
"#<canonical-trick-slug>"   ← matches freestyle_tricks.slug; e.g. "#double_leg_over"
"#freestyle"                ← utility marker
"#trick"                    ← utility marker
```

Source/gallery tags **may** be added to mark the curated source the sidecar came from:

```
"#tricks_of_the_trade"      ← TT lessons (Kenny Shults / WorldFootbag)
"#passback_records"         ← PassBack record clips
```

A future source (`shred_global`, `anz_trikz`, `footbag_finland`, `flipsider_footbag`, etc.) may want its own gallery: when introducing that, add the source tag to the **whitelist** in `scripts/_trick_tag_invariant.py` (`UTILITY_EXACT` frozenset, alongside `tricks_of_the_trade` and `passback_records`). The validator otherwise rejects tags that aren't a whitelisted utility tag, a recognized domain prefix, or an underscore-form `freestyle_tricks.slug`.

Tag-shape rules (enforced by `scripts/_trick_tag_invariant.py:validate_media_tags`):

- All tags must start with `#` and be lowercase.
- Trick-shaped tags (underscore-form alphanumeric, not in `UTILITY_EXACT`, not a recognized domain prefix) MUST resolve to an active or pending `freestyle_tricks.slug`. Alias-only matches fail.
- Items with zero semantic tags (only utility tags, no trick or domain-prefix tag) fail.
- Recognized domain prefixes (snake_case): `event_`, `demo_`, `fh_`, `player_`, `club_`, `set_`. Anything else needs to be in `UTILITY_EXACT`.

## 4. PassBack-specific lessons (worked examples: do not re-litigate)

- **PassBack Records is record/performance evidence, not tutorial.** `tier=RECORD` in sidecars; never promoted to `STRONG_TUTORIAL` for primary-clip selection (rules in `freestyle/loaders/24_qc_freestyle_media_coverage.py`).
- **Same trick can have TT tutorial AND PassBack record media**: that is not a duplicate. The two complement each other (how-to vs. proof). Do not skip a PassBack row because the trick already has a TT sidecar.
- **`#passback_records` was added to the source tag whitelist on 2026-05-06**, after the gallery-readiness audit found that existing PassBack sidecars lacked it. A backfill script appended `#passback_records` to the 37 pre-existing PassBack sidecars; the `promote_snippet_candidates.py` change ensures new ones include it. Both changes were idempotent.
- **RECORD_CATEGORY rows must be preserved.** The PassBack source has rows like `2-Bag Juggle`, `Unique 3-Dex`, `Unique Beastly`, `Unique Fearless` (the `Unique N-ADD` runs). These are legitimate PassBack record categories but are NOT freestyle-tricks (per the freestyle-dictionary skill's strict layer separation: glossary terms don't go in `freestyle_tricks`). Stage them in `freestyle/tools/trick_video_discovery/passback_record_categories.csv` (separate from `snippet_candidates.csv`) so they're preserved for a later surfacing decision. Do not coerce them into the trick pipeline with placeholder slugs.

## 5. Review buckets

Every source row goes into exactly one of these buckets:

| Bucket | Meaning | Where it goes | Confidence |
|---|---|---|---|
| **CANONICAL_TRICK** | Source name normalizes directly to an active `freestyle_tricks.slug` | `snippet_candidates.csv` | high |
| **ALIAS_TRICK** | Resolves through `trick_aliases.csv` or red_additions inline aliases | `snippet_candidates.csv` | high |
| **STRUCTURAL_TRICK** | Resolves through accepted modifier/shorthand expansion (e.g., Pdx→paradox, Symp→symposium, Gyro→spinning, BS→blurry symposium, PS→paradox symposium) | `snippet_candidates.csv` | medium |
| **RECORD_CATEGORY** | Legitimate source record category that does not map to `freestyle_tricks` (e.g., `2-Bag Juggle`, `Unique Fearless`) | `<source>_record_categories.csv` (separate file) | n/a |
| **REVIEW_NEEDED** | Unclear mapping: named compound, ambiguous canonical, encoding-corrupted name, novel construction | `<source>_review_queue.csv` (separate file) | n/a |
| **TRUE_DUPLICATE** | Same `(source_id, video_url)` already present as a sidecar or in `snippet_candidates.csv` | skipped (no write) | n/a |
| **MALFORMED** | No usable URL, broken source row, or line-wrap noise (no real record content) | discarded silently OR flagged for source cleanup | n/a |

Do **not** force matches. If a name doesn't resolve cleanly, it goes to REVIEW_NEEDED: never to STRUCTURAL_TRICK with a guessed base slug.

## 6. Required dry-run behavior

Always dry-run before writing. The dry-run output must include:

1. Total rows parsed
2. Bucket counts (all 7)
3. First N examples per `*_TRICK` bucket
4. Full REVIEW_NEEDED list (unique names, sorted)
5. Full RECORD_CATEGORY list (unique names + URL availability)
6. TRUE_DUPLICATE count + sample
7. MALFORMED rows + raw-line excerpt
8. Any ambiguities surfacing operator decision

No writes without explicit operator approval. After approval, the implementation phase produces only the files explicitly named in the plan; never silently expand to additional outputs. Questions to the operator follow `.claude/rules/asking.md`.

## 7. QC commands

```bash
# Dry-run promotion (read-only): shows what would be emitted
python3 scripts/promote_snippet_candidates.py --dry-run

# Apply: emits sidecars under curated/freestyle_tricks/ from approved rows
python3 scripts/promote_snippet_candidates.py

# Tag-invariant library (sanity-only when run directly; the actual validator
# is invoked at sidecar-emit time and at QC time)
python3 scripts/_trick_tag_invariant.py

# Post-load QC: validates every active media_items row's tag shape against
# the dictionary; hard-fails on misroute, alias-only resolution, missing
# semantic tag, etc.
python3 freestyle/loaders/25_qc_media_tag_invariant.py

# Coverage dashboard: per-trick primary-strength + priority bucketing
python3 freestyle/loaders/24_qc_freestyle_media_coverage.py

# Full DB rebuild: required for sidecar changes to land in media_items
bash scripts/reset-local-db.sh
```

Order of operations after staging new sidecars:

1. `promote_snippet_candidates.py --dry-run` → review what would be emitted
2. `promote_snippet_candidates.py` → emit sidecars
3. `bash scripts/reset-local-db.sh` → reseed DB so `media_items` picks them up
4. `25_qc_media_tag_invariant.py` → confirm zero invariant violations
5. (optional) `24_qc_freestyle_media_coverage.py` → coverage delta

## 8. Gallery readiness

Named-gallery membership is computed at request time by **tag-AND match** against `member_gallery_tags` (and `member_gallery_exclude_tags`) on each `media_items` row. For a new source/gallery to populate correctly:

1. **Every intended sidecar must carry the source tag.** If you introduce `#<new_source>`, ensure both new emissions AND any pre-existing sidecars from that source carry the tag. Backfill is one-shot, idempotent, and limited to the `tags` array: never modify other sidecar fields.
2. **Whitelist the source tag** in `scripts/_trick_tag_invariant.py:UTILITY_EXACT` before introducing it. Otherwise the validator rejects sidecar emissions and post-load QC fails.
3. **Gallery creation.** A named gallery can be created either via the admin UI or directly as a `curated/galleries/<name>.json` sidecar (tag-AND `member_galleries`; `id` = `gallery_<slug>`, `criteriaTags`, `excludeTags`), then landed by running `seed_fh_curator.py`. Whitelist any new source tag in `scripts/_trick_tag_invariant.py:UTILITY_EXACT` first.

## 9. Safety boundaries

| Boundary | Rule |
|---|---|
| `scripts/seed_fh_curator.py` | Safe to RUN (standalone, idempotent); take care before MODIFYING the script body. |
| `curated/galleries/*.json` | Create/edit gallery sidecars directly (a catch-all `excludeTags` must list every source tag). |
| `src/controllers/adminCuratorController.ts`, `src/services/curatorMediaService.ts`, `src/views/admin/curator/**` | Application code (gallery editor + member upload); change through normal review. |
| `src/db/db.ts` schema (member_galleries, member_gallery_tags, media_items, media_tags) | Schema changes go through normal review. |
| `freestyle/tools/trick_video_discovery/snippet_candidates.csv` | Append-only edits via `csv.writer` in append mode; never round-trip via DictReader/DictWriter (memory rule). |
| `curated/freestyle_tricks/*.meta.json` | Promotion and backfill via `promote_snippet_candidates.py` and one-shot backfill scripts. |
| `scripts/promote_snippet_candidates.py` | Promotion script for snippet candidates. |
| `scripts/_trick_tag_invariant.py` | Add new source tags to `UTILITY_EXACT` here. |
| `freestyle/loaders/{24,25}_qc_*.py` + `legacy_data/event_results/scripts/28_qc_bap_coverage.py` | QC checks; run after a load. |

When in doubt about whether a change reaches the application-code or schema layer rather than the data files, pause and confirm first. The cost of pausing is low; reverting an unwanted change is high.

## 10. Examples

### TT tutorial example (canonical)

```jsonc
{
  "videoUrl":      "https://www.youtube.com/watch?v=kUFtmVV38n4",
  "videoPlatform": "youtube",
  "title":         "Footbag Lessons - Tricks of the Trade #12 - Forehead Stall",
  "creator":       "Kenny Shults",
  "sourceId":      "tt_youtube",
  "tier":          "CANONICAL_TUTORIAL",
  "tags":          ["#forehead_stall", "#freestyle", "#trick", "#tricks_of_the_trade"]
}
```

Filename: `curated/freestyle_tricks/forehead_stall_<sha1[:8]>.meta.json`. Promoted via reviewer marking on a `tt_youtube` snippet-candidate row.

### PassBack record example

```jsonc
{
  "videoUrl":      "https://www.youtube.com/watch?v=Zmv5ydko6gk",
  "videoPlatform": "youtube",
  "title":         "Passback record by Norek",
  "creator":       "Norek",
  "sourceId":      "passback_records",
  "tier":          "RECORD",
  "tags":          ["#blurry_whirl", "#freestyle", "#trick", "#passback_records"]
}
```

Filename: `curated/freestyle_tricks/blurry_whirl_<sha1[:8]>.meta.json`.

### Same trick, distinct media (NOT a duplicate)

The two sidecars below coexist legitimately:

```jsonc
// TT tutorial: how to do DLO
{ "sourceId": "tt_youtube", "tier": "CANONICAL_TUTORIAL",
  "tags": ["#double_leg_over", "#freestyle", "#trick", "#tricks_of_the_trade"], ... }

// PassBack record: proof of N consecutive DLO reps
{ "sourceId": "passback_records", "tier": "RECORD",
  "tags": ["#double_leg_over", "#freestyle", "#trick", "#passback_records"], ... }
```

Same `trick_slug` (`double_leg_over`), distinct `(source_id, video_url)` → distinct sidecars → not a duplicate. Both render in the trick-detail page's reference media; each renders in its own source-specific gallery.

### Record-category example (no canonical trick slug)

`Unique Fearless` is a PassBack record category for runs where every trick is 5+ ADD. It is not a trick. Stage in `freestyle/tools/trick_video_discovery/passback_record_categories.csv`:

```csv
category,url,start_seconds,player_name,date_recorded,record_count,place,adds,sort_friendly,notes
Unique Fearless,https://www.youtube.com/watch?v=uSBHfyY5tOE,,Jim Penske,7/23/2023,25,1,5,Unique 5-ADD,
Unique Fearless,,,Vasek Klouda,6/1/2005,19,5,5,Unique 5-ADD,DVD: Feet on Fire (released 2007: predates record date)
```

No `trick_slug` column. No sidecar emission. Surfacing decision deferred: the file is preservation, not auto-import.

## 11. Tier convention

The `tier` field on each sidecar drives primary-clip selection (per the promotion rules in §3) and visual hierarchy on trick / family pages. Tier is set at sidecar emit time and persists into the seeded `media_items` row. There is no DB-schema-level constraint on tier values; the convention lives here.

### Tier semantics

| Tier | Meaning | When to use |
|---|---|---|
| `CANONICAL_TUTORIAL` | Authoritative single-trick instructional video by a recognized creator/series | TT lessons (Kenny Shults), AnzTrikz tutorials (Anssi Sundberg), FootbagSpot Levels 1–5, similar; the "this is THE tutorial for this trick" tier |
| `STRONG_TUTORIAL` | Clear single-trick demo / instructional from a registered tutorial-tier source, less editorial polish than CANONICAL_TUTORIAL | Shred Global single-trick demos by named players (Will Digges, Zac Miley, etc.); Polini Pointers; similar |
| `HIGH_QUALITY_DEMO` | Named-trick demonstration footage that's not formally instructional | Footbag Finland trick demos; Flipsider clips; multi-take community demos that show the trick clearly without explicit teaching framing |
| `RECORD` | Record-attempt clip with countable kicks (PassBack-style) | Default for `source_id='passback_records'` sidecars |
| `WEAK_RECORD` | Record clip with low confidence or unverifiable count | Reserved; rare |

### Source-default mapping (curator-asserted at emit time)

The tier registry is **not codified in code or schema**. Each sidecar's tier is decided when the sidecar is created. The defaults below are conventions, not enforcement:

| `source_id` | Default tier | Notes |
|---|---|---|
| `tt_youtube` | CANONICAL_TUTORIAL | Kenny Shults TT series |
| `anz_trikz` | CANONICAL_TUTORIAL | Anssi Sundberg AnzTrikz tutorials |
| `footbagspot_passback` | CANONICAL_TUTORIAL | PassBack Levels 1–5 curriculum |
| `footbagspot_tutorials` | CANONICAL_TUTORIAL | FootbagSpot tutorial library proper |
| `shred_global` | HIGH_QUALITY_DEMO | Single-trick demos by named players (Boychuk, Digges, Miley, Monistere, Ścierski, etc.). **Reclassified 2026-05-10 (Phase 2b):** moved from STRONG_TUTORIAL to demo-tier. Caption pattern is uniformly "Footbag Freestyle Trick: <name> (<add>add) by <player>": single-trick demo, no teaching breakdown. SOURCE_TIER in `freestyleService.ts` mirrors this as DEMONSTRATION. |
| `polini_pointers` | STRONG_TUTORIAL | Nick Polini's instructional content |
| `everything_footbag` | STRONG_TUTORIAL | Hardik's educational content |
| `footbag_foundations` | STRONG_TUTORIAL | Erik Chan's content |
| `footbag_finland` | HIGH_QUALITY_DEMO | Named-trick demos; demonstration-style, not instructional |
| `flipsider_footbag` | HIGH_QUALITY_DEMO | Mixed; default to demo |
| `passback_records` | RECORD | Always; never promote to tutorial-tier |

### Promotion / primary-clip selection (already in §3, re-stated for tier context)

- **Primary candidates:** CANONICAL_TUTORIAL > STRONG_TUTORIAL > HIGH_QUALITY_DEMO. RECORD never serves as primary when a tutorial alternative exists.
- **Family-page hero vs trick-page hero:** family pages may prefer multi-trick CANONICAL_TUTORIAL (e.g., AnzTrikz "Whirl and Reverse Whirl") over single-trick CANONICAL_TUTORIAL when the multi-trick coverage tells a better family story; trick-page hero prefers the focused single-trick clip. Both selections are curator decisions made at family / trick page render time.
- **Multi-trick tutorial promotion:** see §3: only when each target trick is explicitly named in the title.

### Curator override

The default tier is a starting point, not a mandate. Curator may set a different tier on a per-sidecar basis when the content quality justifies it. Document the override reason in the sidecar's `notes` field if the deviation isn't self-evident.

### Source-default tier for shred_global and footbag_finland

`shred_global` is a demo-tier source, so its `HIGH_QUALITY_DEMO` sidecars carry the correct tier; `footbag_finland` follows the same demo-tier default. The table above is authoritative for source defaults. Existing sidecars are not bulk-updated to match a default change; the convention applies forward.

### Tier is presentation, not data integrity

A "wrong" tier is a curator-judgment finding, not a data-integrity violation. Tier does not gate validation or media seeding; it only influences primary-clip selection and visual hierarchy. The MLI audit's tier mismatches were classified as `inconsistent` (curator review needed), never `broken`.

## 12. Registering a new source — six coordinated points

A new `source_id` (e.g. `passback_demos`, `footbag_org`) requires SIX coordinated edits. Doing only the obvious tier maps causes failures partway through promote → seed → QC (the 2026-05-31 `passback_demos` promotion hit #4, #5, and #6 as separate mid-run failures):

1. `scripts/promote_snippet_candidates.py` `TIER_BY_SOURCE` — sidecar `tier` (e.g. `HIGH_QUALITY_DEMO`).
2. `src/services/freestyleService.ts` `SOURCE_TIER` — render bucket (`TUTORIAL`/`DEMONSTRATION`/`RECORD`).
3. `src/services/freestyleService.ts` `SOURCE_LABELS` — public source label (else the raw id renders).
4. `legacy_data/inputs/curated/media/media_sources.csv` — a row for the source. **FK target:** `media_items.source_id REFERENCES media_sources(source_id)`; missing it makes `seed_fh_curator.py` fail mid-seed with `FOREIGN KEY constraint failed` (the txn rolls back).
5. `freestyle/loaders/24_qc_freestyle_media_coverage.py` — `DEMO_SOURCES` / `STRONG_TUTORIAL_SOURCES` / `RECORD_SOURCES`. An unregistered source is an "unrecognized source_id" **hard-fail (exit 2)** AND mis-classifies clips as `WEAK_RECORD`.
6. `tests/unit/freestyleSourceTier.test.ts` — the "exactly N known sources" guard count + a per-tier shape assertion (the guard intentionally fails until updated).

Conditional: if the source emits a gallery TAG `#<source>`, whitelist it in `scripts/_trick_tag_invariant.py` `UTILITY_EXACT` (NOT needed if promote emits no source tag — `passback_demos` emits only `#<slug> #freestyle #trick`). See memory `[[feedback_curated_media_source_registration]]`.

## Cross-references

- `footbag-freestyle-dictionary` skill: trick / alias / glossary layer separation rules; the canonical source for what counts as a trick.
- `feedback_admin_post_rebuild_backfill.md` (memory): DB rebuilds wipe member rows including `is_admin`; not directly about media but the same operational lesson: rebuilds don't reapply per-row state.
- `project_gallery_organization.md` (memory): historical context on TT Series view + cluster candidates (passback_records, anz_trikz, footbag_finland, shred_global, flipsider_footbag); note that the original TT view code was removed in commit `23a4bae` and replaced by named-gallery sidecars.
