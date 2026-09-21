---
name: footbag-curated-media
description: Use when adding, modifying, validating, or troubleshooting curated freestyle media intake: Tricks of the Trade, PassBack Records, AnzTrikz, Shred Global, FootbagSpot, or any future tutorial / record / expert-review source. Covers the curated-source pipeline through sidecars and tag-based galleries; the admin gallery-editor UI and schema are out of scope.
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
"#tutorial"|"#demo"|"#record"  ← exactly one; what the clip is for (§11)
```

The content type is not optional and not a convention. A curated clip that names
a trick and carries none of the three, or more than one, is refused by
`freestyle/loaders/25_qc_media_tag_invariant.py`, which is a hard gate on the
freestyle refresh.

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

- **PassBack Records is record/performance evidence, not tutorial.** `#record` on the sidecar's tags; it never reads as a tutorial for primary-clip selection (rules in `freestyle/loaders/24_qc_freestyle_media_coverage.py`).
- **Same trick can have TT tutorial AND PassBack record media**: that is not a duplicate. The two complement each other (how-to vs. proof). Do not skip a PassBack row because the trick already has a TT sidecar.
- **`#passback_records` is on the source-tag whitelist**, so every PassBack sidecar carries it: a backfill appended it to the pre-existing PassBack sidecars and `promote_snippet_candidates.py` adds it to new ones (both idempotent).
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
3. **A captioned series depends on its sidecar titles.** The Tricks of the Trade sidecars carry `title` in `NN - <lesson_title>` form with the lesson number zero-padded, and each keeps `#tricks_of_the_trade`. `curated/galleries/tricks_of_the_trade.json` sorts `caption_asc` and matches tag-AND, so an unpadded number reorders the series and a dropped tag removes the lesson from it. Preserve both whenever a tool rewrites a sidecar.
4. **Gallery creation.** A named gallery can be created either via the admin UI or directly as a `curated/galleries/<name>.json` sidecar (tag-AND `member_galleries`; `id` = `gallery_<slug>`, `criteriaTags`, `excludeTags`), then landed by running `seed_fh_curator.py`. Whitelist any new source tag in `scripts/_trick_tag_invariant.py:UTILITY_EXACT` first.

## 9. Safety boundaries

| Boundary | Rule |
|---|---|
| `scripts/seed_fh_curator.py` | Safe to RUN (standalone, idempotent); take care before MODIFYING the script body. |
| `curated/galleries/*.json` | Create/edit gallery sidecars directly (a catch-all `excludeTags` must list every source tag). |
| `src/controllers/adminCuratorController.ts`, `src/services/curatorMediaService.ts`, `src/views/admin/curator/**` | Application code (gallery editor + member upload); change through normal review. |
| `src/db/db.ts` schema (member_galleries, member_gallery_tags, media_items, media_tags) | Schema changes go through normal review. |
| `freestyle/tools/trick_video_discovery/snippet_candidates.csv` | Append-only edits via `csv.writer` in append mode; never round-trip via DictReader/DictWriter (memory rule). |
| `curated/freestyle_tricks/*.meta.json` | Promotion and backfill via `promote_snippet_candidates.py` and one-shot backfill scripts. Never rerun a sidecar-producing tool that does not preserve canonical `title` and `tags`; check its output against `curated/freestyle_media/tt_roster.csv` and `curated/freestyle_media/video_snippet_candidates.csv`. |
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
  "tags":          ["#forehead_stall", "#freestyle", "#trick", "#tricks_of_the_trade", "#tutorial"]
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
  "tags":          ["#blurry_whirl", "#freestyle", "#trick", "#passback_records", "#record"]
}
```

Filename: `curated/freestyle_tricks/blurry_whirl_<sha1[:8]>.meta.json`.

### Same trick, distinct media (NOT a duplicate)

The two sidecars below coexist legitimately:

```jsonc
// TT tutorial: how to do DLO
{ "sourceId": "tt_youtube",
  "tags": ["#double_leg_over", "#freestyle", "#trick", "#tricks_of_the_trade", "#tutorial"], ... }

// PassBack record: proof of N consecutive DLO reps
{ "sourceId": "passback_records",
  "tags": ["#double_leg_over", "#freestyle", "#trick", "#passback_records", "#record"], ... }
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

## 11. Content type: what a clip is for

Every curated clip that names a trick carries exactly one of three tags, and that
tag is the only thing that says what the clip is for:

| Tag | Meaning |
|---|---|
| `#tutorial` | The clip teaches the trick: someone breaks the movement down. |
| `#demo` | The clip shows the trick performed clearly, without teaching it. |
| `#record` | The clip is record evidence, with countable reps. |

This is enforced, not conventional. `freestyle/loaders/25_qc_media_tag_invariant.py`
refuses a curated clip that names a trick and carries none of the three or more
than one, and it is a hard gate on the freestyle refresh. The gate is scoped by
the presence of a trick tag, never by directory: a clip that names no trick (a
shred routine, a chinlone film, a net demonstration, an event clip) carries none
of the three and that is correct, while a set or concept lesson may carry one
because it genuinely is one.

### The default

A clip carrying no content type reads as a demonstration everywhere: both public
readers and the coverage QC treat it that way. Teaching is a positive claim, so
it is made rather than assumed. Never lean on the default for a trick clip, since
the hard gate refuses it.

### Source is a starting point, never the last word

`CONTENT_TYPE_BY_SOURCE` in `scripts/promote_snippet_candidates.py` gives a
promoted sidecar its first content type from the source id, and an unregistered
source falls to `#demo`. That map is a convenience for bulk promotion and nothing
more. The tag lives on the clip, so a curator who knows a particular clip teaches
something its source usually only demonstrates edits the tag, and two clips
sharing one source then classify differently. A lookup from a source id could not
express that, which is why the sidecar field it replaced was removed.

Three sources default to `#demo` because their format is demonstrational: a
single trick performed clearly with no teaching breakdown. Shred Global is the
worked example, with captions uniformly of the form "Footbag Freestyle Trick:
<name> by <player>"; Footbag Finland and Flipsider Footbag follow the same shape.
Shred Global's existing clips are a mix of both kinds, which is exactly the case
the tag exists for: a curator marks the individual clip that genuinely teaches.

### Coverage strength is the dashboard's vocabulary, not the sidecar's

`freestyle/loaders/24_qc_freestyle_media_coverage.py` maps the content type onto
its own strength labels: `#tutorial` to STRONG_TUTORIAL, `#demo` to
HIGH_QUALITY_DEMO, `#record` to WEAK_RECORD, and an untyped clip to
HIGH_QUALITY_DEMO. Those labels exist for the coverage dashboard; nothing writes
them to a clip, and no sidecar carries one.

### A wrong content type is curator judgment; a missing one is a defect

Choosing `#demo` where `#tutorial` fits better is a review finding, not a
data-integrity violation. A trick clip with no content type at all is a different
thing: the invariant refuses it, and the refusal names the clip.

A sidecar carries no separate field naming what a clip is for. An older example
found elsewhere may show one; it is not current, and a sidecar written with it
today is a sidecar with two places to answer one question.

### Which clip leads a page

- **Primary candidates:** a tutorial leads, then a demonstration. A record clip
  never leads while a tutorial or demonstration exists for the same trick.
- **Family-page hero vs trick-page hero:** a family page may prefer a multi-trick
  tutorial (AnzTrikz "Whirl and Reverse Whirl") when the broader coverage tells a
  better family story; a trick page prefers the focused single-trick clip. Both
  are curator decisions made at render time.
- **Multi-trick tutorial promotion:** only when each target trick is explicitly
  named in the title.

## 12. Registering a new source — four coordinated points

A new `source_id` (e.g. `passback_demos`, `footbag_org`) requires four coordinated
edits. Doing only the obvious one causes failures partway through
promote → seed → QC:

1. `legacy_data/inputs/curated/media/media_sources.csv` — a row for the source.
   **FK target:** `media_items.source_id REFERENCES media_sources(source_id)`;
   missing it makes `seed_fh_curator.py` fail mid-seed with
   `FOREIGN KEY constraint failed` (the txn rolls back). This is the only one
   whose absence stops a run.
2. `src/services/freestyleService.ts` `SOURCE_LABELS` — the public source label,
   or the raw id renders.
3. `scripts/promote_snippet_candidates.py` `CONTENT_TYPE_BY_SOURCE` — the content
   type a promoted sidecar from this source starts with. Optional: omit it and
   the source falls to `#demo`, which is a correct default rather than an error.
4. `scripts/_trick_tag_invariant.py` `UTILITY_EXACT` — only if the source emits a
   gallery tag `#<source>`. Not needed when promote emits no source tag
   (`passback_demos` emits only `#<slug> #freestyle #trick` plus its content type).

Nothing registers a render bucket any more and no test carries a source count.
Classification is the clip's own tag, so an unregistered source is no longer a
hard failure anywhere: it renders under its raw id and its clips default to
demonstrations until someone says otherwise.

## Cross-references

- `footbag-freestyle-dictionary` skill: trick / alias / glossary layer separation rules; the canonical source for what counts as a trick.
- Operational lesson shared with member data: a database rebuild wipes member rows including `is_admin`; rebuilds do not reapply per-row state, so per-row grants need re-application after any rebuild.
- Gallery organization: the Tricks-of-the-Trade series and the source clusters (passback_records, anz_trikz, footbag_finland, shred_global, flipsider_footbag) are organized as named-gallery sidecars; there is no dedicated TT Series view code.
