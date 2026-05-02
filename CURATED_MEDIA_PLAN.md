# CURATED_MEDIA_PLAN.md

**Active direction (locked 2026-05-02): unify freestyle reference media into the `media_items` family.**

This doc is the curator media unification plan. It is self-contained: read top to bottom and you have everything needed.

**Operating model (locked 2026-05-02):**

- James owns slice 2 end to end. Concrete task list under §"Items for James".
- Both maintainers commit directly to `main`. No feature branches, no separate PR, no atomic cross-track merge.
- No coordination required. The end-state design in this doc (schema, sidecars, tag rules, column mapping) is the contract; James executes against it.
- Dave's slice-2 role is empty. Dave's next active work is slice 3 (trick page gallery rendering); see root `IMPLEMENTATION_PLAN.md`.

## How to read this doc

- **If you're James or his Claude (directed here from `legacy_data/IMPLEMENTATION_PLAN.md`)**: read top to bottom. End-state design + concrete task list are in §"Items for James". Execute against the contract; no permission needed.
- **If you're Dave or his Claude**: this is the design James is building against. Dave's slice-2 role is empty; next active work is slice 3 (see root `IMPLEMENTATION_PLAN.md`).

---

## Design rationale

The canonical platform documentation describes ONE unified media architecture: `media_items` + `media_tags` + `member_galleries` + `#curated` + system-member uploader account (DD §2.6 Hashtags and Media, DD §2.8 System Member Account, USER_STORIES §A_Upload_Curated_Media, DATA_MODEL §4.17). There is no documented sibling subsystem for curated reference media. The unification work folds `freestyle_media_*` into this canonical architecture, eliminating the parallel system.

Why this works cleanly:

1. **`media_items` already supports the use case natively.** `video_platform IN ('youtube','vimeo','s3')` + `video_id`, `video_url`, `thumbnail_url` covers James's YouTube and Vimeo assets with three new columns (`source_id`, `start_seconds`, `end_seconds`). Curator reference media is restricted to YouTube and Vimeo embeds (plus admin-uploaded MP4s on S3); non-embed external URLs are not supported, so any of James's assets pointing at footbagspot, footbagfoundations, or other non-YouTube/Vimeo URLs are excluded from migration.
2. **Privacy / lifecycle / query-correctness concerns are addressed by the system-member uploader account.** `media_items` rows attributed to system-member have no real-person PII subject to GDPR purge, no member-flag moderation pipeline, no member-controlled deletion. Curator content remains a distinct logical layer; it just lives in the same physical tables as member content, distinguished by uploader and the `#curated` tag.
3. **Provenance survives.** `freestyle_media_sources` becomes `media_sources` (renamed, same columns, same data). DVD title / channel name / creator metadata stays structured and queryable.
4. **Existing-code dependency footprint is small.** Only TWO files in `legacy_data/` outside the loaders depend on `freestyle_media_*` (verified by grep): `pipeline/qc/check_media_coverage.py` and `pipeline/qc/check_snippet_candidates.py`.

### Stability commitments

- **Trick names are stable.** No trick rename mechanism exists; a trick's slug at creation is its canonical identity for life (parallel to member slug stability). This is the foundation that makes hashtag-based gallery coupling safe without an FK or rename cascade. Reword/synonym handling lives in `freestyle_trick_aliases`.
- **Gallery ordering: chronological for v1.** The trick page reference video gallery renders curator-tagged videos by `media_items.uploaded_at DESC`. A curator pin / featured marker is deferred to a future slice.

### Tag namespace

Curator hashtags for domain entities follow these rules (DD §2.6):

- **Tricks**: freeform tag = trick slug (e.g. `#ripwalk`). Uniqueness inherited from `freestyle_tricks.slug PRIMARY KEY`; no-rename per the stability commitment above. Stored as `tags.is_standard=0`.
- **Persons**: freeform tag = member slug. Reuses the existing member slug namespace; no new identifier.
- **Records**: no record hashtag namespace. Record-attributed media is reachable via its parent trick's gallery (every record is bound to a trick). The slice-2 migration script derives the parent trick's tag for any asset whose only domain link is `entity_type='record'`. No `#rec_*` tags are materialized.
- **Events / Clubs**: standardized hashtags (`tags.is_standard=1`, `tags.standard_type IN ('event','club')`); existing convention from §2.6, unchanged.

`tags.standard_type` is not widened; trick and person hashtags remain freeform and rely on upstream entity-table uniqueness.

### Trick alias canonicalization

Trick aliases (`freestyle_trick_aliases`, e.g. `barraging paradox mirage` → `fury`) canonicalize to the parent trick's slug at write time on every curator path:

- Slice-2 migration script: looks up each alias-shaped tag in `freestyle_trick_aliases` and rewrites to the canonical slug before generating the sidecar `tags` array.
- Slice-2 curator seeder: applies the same lookup when reading sidecars and writing `media_tags` rows.
- Slice-4 admin UI: applies the same lookup on user-typed input. Tag autocomplete is sourced from `freestyle_tricks.slug` only; aliases are not autocomplete candidates.

`tags` and `media_tags` contain canonical slugs only; the trick gallery query stays canonical-only with no JOIN against `freestyle_trick_aliases`. Read-side handling for `/tags/{alias}` URLs is a 301 redirect to `/tags/{canonical-slug}`, scoped to its own slice.

### Final database schema (3 tables for media; no legacy, no parallel state)

After slice 2 lands, the schema has zero `freestyle_media_*` references. End state:

- **`media_items`** (existing, lightly extended). One row per asset. Curator content has `uploader_member_id = system_member_id`. Additions:
  - `source_id TEXT NULL REFERENCES media_sources(source_id)`: provenance attribution.
  - `start_seconds INTEGER NULL`: optional clip start.
  - `end_seconds INTEGER NULL`: optional clip end.
  - `video_platform` CHECK is unchanged: `('youtube','vimeo','s3')`. Curator reference media must be YouTube or Vimeo embeds, or admin-uploaded MP4s on S3.
- **`media_sources`** (new; renamed from `freestyle_media_sources`). Provenance lookup with identical columns: `source_id` (PK), `source_name`, `source_type`, `url`, `creator`. The 10 existing rows copy directly. James's source registry is preserved unchanged.
- **`media_tags`** (existing, unchanged). All entity association is tag-driven. An asset tagged `#freestyle #trick #ripwalk` is associated with the ripwalk trick. An asset tagged `#rec_2018_dlc_ripwalk_64` is associated with that record. No bridge table. No primary marker.

Tables that vanish completely:

- `freestyle_media_assets` (folded into `media_items`).
- `freestyle_media_links` (replaced by tags. Multi-entity linkage via the asset having multiple tags. No "primary" concept; trick pages render a gallery of all matching curator-tagged videos).
- `freestyle_media_sources` (renamed to `media_sources`; data copies over).

### Filesystem layout: `/curated/{category}/{file}` (5 categories)

```
/curated/
  freestyle_tricks/    ← all of James's 47 assets (record-clips + trick-tutorials together)
                       ← future curator-uploaded trick reference content
  demos/               ← landing-page demo loops
    demo-freestyle.mp4              ← moved from /curated/demo-freestyle.mp4
    demo-freestyle.meta.json        ← new sidecar
    demo-freestyle.poster.jpg       ← moved from /curated/demo-freestyle-poster.jpg
    demo-net.mp4                    ← moved from /curated/demo-net.mp4
    demo-net.meta.json              ← new sidecar
    demo-net.poster.jpg             ← moved from /curated/demo-net-poster.jpg
  promos/              ← promotional content for upcoming events / featured items
    japan-worlds-2026.jpg           ← moved from /curated/japan-worlds-2026.jpg
    japan-worlds-2026.meta.json     ← new sidecar
  heros/               ← Footbag Heroes content (placeholder for upcoming /footbag-heroes slice)
  admin/               ← system-account avatars, mascots, admin-only assets
    fh-avatar.jpg                   ← moved from /curated/fh-avatar.jpg
    fh-avatar.meta.json             ← new sidecar
```

Other categories (`tutorials/`, `events/`, `persons/`, `clubs/`, `news/`) are NOT pre-created. The admin panel creates them on demand when the curator first uploads to a new category. Filesystem-driven; any subdir under `/curated/` is a valid category. No code-side whitelist.

### Sidecar schema (`.meta.json`)

Each entry in `/curated/{category}/` has a `.meta.json` sidecar carrying its metadata. For URL-reference entries (no source binary), `videoUrl` and `videoPlatform` are populated. For file-backed entries (binary present alongside sidecar), the sidecar describes the binary.

```json
{
  "videoUrl": "https://youtu.be/aYV562tQDBM?t=360",
  "videoPlatform": "youtube",
  "title": "Ripwalk demo, ANZ Trikz",
  "creator": "Anssi Sundberg",
  "caption": "Single-leg ripwalk setup, slow motion",
  "sourceId": "anz_trikz",
  "tags": ["#freestyle", "#trick", "#ripwalk", "#demo"],
  "startSeconds": 12,
  "endSeconds": 24
}
```

`#curated` is auto-prepended by the seeder; never hand-written. Rejected from input. Per-category default tag stacks also auto-applied:

- `freestyle_tricks/` → `#curated #freestyle #trick` plus admin-selected trick-slug.
- `demos/` → `#curated #demo` plus section tag (`#freestyle` / `#net`).
- `promos/` → `#curated #promo` plus admin-selected tags.
- `heros/` → `#curated #hero` plus admin-selected tags.
- `admin/` → `#curated #admin` plus admin-selected tags.
- New on-demand category `{name}/` → `#curated #{name}` plus admin-selected tags.

### Migration of James's existing 47 assets

One-time conversion script `scripts/migrate-freestyle-media-to-curated.ts` (or `.py`). Whoever picks up the task runs it and commits the output to `main`; James may run it himself if useful for his unblock.

1. Reads `legacy_data/inputs/curated/media/{media_sources,media_assets,media_links}.csv` (the existing source-of-truth CSVs).
2. For each asset, generates `/curated/freestyle_tricks/{slug-or-asset-id}.meta.json` with all fields populated from the CSV row(s). Assets whose URLs are not YouTube or Vimeo embeds (e.g. footbagspot, footbagfoundations) are skipped; the script reports them in a warning summary. James decides whether to re-host as YouTube/Vimeo or drop.
3. Tag derivation: link rows produce entity tags. `entity_type='trick'` → `#freestyle #trick #{slug}`. `entity_type='person'` → bare-slug person tag. `entity_type='event'` → `#event_{id}`. `entity_type='record'` derives the parent trick's tag (via `freestyle_records.trick_name → freestyle_tricks.slug`) when the asset has no other trick link, so every asset is reachable via its trick's gallery. No `#rec_*` tags materialize. Deduplicated and sorted.
4. Author commits the generated sidecars to `main`. James decides what to do with the non-YouTube/Vimeo skip rows (re-host on YouTube/Vimeo, or drop) before the legacy CSVs are deleted.
5. The migration script is then deleted (one-time job).
6. The legacy CSVs at `legacy_data/inputs/curated/media/*.csv` are deleted.
7. `legacy_data/event_results/scripts/21_load_freestyle_media_sources.py`, `22_load_freestyle_media_assets.py`, `23_load_freestyle_media_links.py` are deleted.
8. `scripts/reset-local-db.sh` edited to remove the three loader entries. The curator seeder (extended in slice 2) replaces them.

End state: James's 47 assets live in `media_items` + `media_tags` + `media_sources`, owned by the system-member account, all tagged `#curated #freestyle #trick #{slug}` plus their record/person/event tags. Trick pages render a gallery of all curator-tagged videos for each trick.

### `A_Upload_Curated_Media` user story expansion

Per maintainer direction, this user story in `docs/USER_STORIES.md` is expanded into ONE collapsed US covering the full curator lifecycle:

- **Upload**: admin uploads file (MP4 / image) or URL reference to a category.
- **Edit**: admin edits caption, tags, clip range, source attribution.
- **Delete**: admin hard-deletes a curated item.
- **Category creation**: admin enters a new category name during upload; seeder creates `/curated/{name}/` on next deploy.
- **Tag autocomplete and validation**: per-category. `freestyle_tricks/` autocompletes trick-slug from `freestyle_tricks.slug`; warn-but-don't-abort on unknown slugs. Auto-applies `#curated` and category-default tags. Rejects `#curated` from input.

The admin UI extensions for this expanded scope land in slice 4. Slices 2 and 3 still ship with the existing admin curator UI; the new category-aware flows come later.

---

## Items for James

James owns slice 2 end to end. Full task list:

1. **Schema rewrite in `database/schema.sql`.**
   - Drop tables: `freestyle_media_assets`, `freestyle_media_links`, `freestyle_media_sources`.
   - Add `media_sources` (renamed from `freestyle_media_sources`, identical columns: `source_id` PK, `source_name`, `source_type`, `url`, `creator`).
   - Extend `media_items` with: `source_id TEXT NULL REFERENCES media_sources(source_id)`, `start_seconds INTEGER NULL`, `end_seconds INTEGER NULL`.
2. **Migration script `scripts/migrate-freestyle-media-to-curated.ts` (or `.py`).** Per §"Migration of James's existing 47 assets" above. Reads legacy CSVs; generates `/curated/freestyle_tricks/*.meta.json` sidecars; applies trick-alias canonicalization at write time; surfaces the 5 footbagspot.com skip rows in a warning summary. Run it; commit the 47 sidecars.
3. **Decide on the 5 footbagspot.com skip rows** (re-host on YouTube/Vimeo, or drop). Decision is yours.
4. **Extend the curator seeder** to load `/curated/freestyle_tricks/*.meta.json` into `media_items` + `media_tags` + `media_sources`. Apply trick-alias canonicalization at write time per §"Trick alias canonicalization".
5. **Delete legacy artifacts:**
   - `legacy_data/event_results/scripts/21_load_freestyle_media_sources.py`
   - `legacy_data/event_results/scripts/22_load_freestyle_media_assets.py`
   - `legacy_data/event_results/scripts/23_load_freestyle_media_links.py`
   - `legacy_data/inputs/curated/media/{media_sources,media_assets,media_links}.csv`
   - `scripts/migrate-freestyle-media-to-curated.ts` (after migration completes; one-time job).
6. **Edit `scripts/reset-local-db.sh`:** remove the three loader entries (21/22/23).
7. **Retarget the 2 QC scripts** per the column mapping below:
   - `legacy_data/pipeline/qc/check_media_coverage.py`
   - `legacy_data/pipeline/qc/check_snippet_candidates.py`

### Workflow

- Commit directly to `main`. No branches, no separate PR, no coordination required.
- Order is yours; complete the list before slice 3 starts (Dave's UI work depends on the new schema being live).
- The QC column mapping below is mechanical; new QC vocabulary is open for you to define.

### James QC retargeting, column mapping

| Old | New |
|---|---|
| `SELECT source_id FROM freestyle_media_sources` | `SELECT source_id FROM media_sources` |
| `SELECT * FROM freestyle_media_assets` | `SELECT * FROM media_items WHERE uploader_member_id = <system-member-id>` |
| `SELECT * FROM freestyle_media_assets WHERE is_active = 1` | `SELECT * FROM media_items WHERE uploader_member_id = <system-member-id> AND moderation_status = 'active'` |
| `SELECT * FROM freestyle_media_links WHERE entity_type='trick'` | tag query: assets tagged `#trick` AND `#curated` |
| `SELECT * FROM freestyle_media_links WHERE entity_type='record'` | record-coverage QC must join records to their parent trick (`freestyle_records.trick_name → freestyle_tricks.slug`) and query for trick-tagged curator media; no `#rec_*` tags exist in the new schema |
| `SELECT * FROM freestyle_media_links WHERE entity_type='person'` | tag query: assets tagged with bare-slug person tag AND `#curated` |
| `SELECT * FROM freestyle_media_links WHERE entity_type='event'` | tag query: assets tagged `#event_*` AND `#curated` |
| `SELECT * FROM freestyle_media_assets a LEFT JOIN freestyle_media_links l ON l.media_id = a.id` | `SELECT * FROM media_items mi JOIN media_tags mt ON mt.media_id = mi.id WHERE mi.uploader_member_id = <system-member-id>` |

Column equivalences (per-row):

- `freestyle_media_assets.id` = `media_items.id`
- `freestyle_media_assets.media_type` = `media_items.media_type`
- `freestyle_media_assets.url` = `media_items.video_url`
- `freestyle_media_assets.title` = `media_items.caption` (closest existing column; `caption` carries the human-readable description)
- `freestyle_media_assets.creator` = no direct column. For sourced content, use `media_sources.creator` via join on `source_id`
- `freestyle_media_assets.source_id` = `media_items.source_id`
- `freestyle_media_assets.review_status` = no equivalent. Curator content is curated by definition; QC for review_status is dropped
- `freestyle_media_assets.is_active` = `media_items.moderation_status = 'active'`
- `freestyle_media_links.start_seconds` / `end_seconds` = `media_items.start_seconds` / `end_seconds`
- `freestyle_media_links.is_primary` = no equivalent (gallery model; QC for is_primary is dropped or replaced by "at-least-one-curator-tagged-video-per-trick" semantic)

QC vocabulary may need slight rewording (e.g. "tricks with primary video" becomes "tricks with at least one curator-tagged video"). The column mapping is mechanical; the new QC vocabulary is open for you to define.

### Note on existing data

Of 49 rows in `legacy_data/inputs/curated/media/media_assets.csv`, 5 reference non-YouTube/Vimeo URLs (all footbagspot.com tutorials). Curator reference media is restricted to YouTube/Vimeo embeds plus admin-uploaded MP4s; the migration script skips those rows and reports a warning summary. James decides what to do with them (re-host on YouTube/Vimeo, or drop).

### Impact on James's existing code

After slice 2 lands on `main`:

- `legacy_data/event_results/scripts/21_load_freestyle_media_sources.py`: **deleted** (curator seeder writes `media_sources`).
- `legacy_data/event_results/scripts/22_load_freestyle_media_assets.py`: **deleted**.
- `legacy_data/event_results/scripts/23_load_freestyle_media_links.py`: **deleted**.
- `legacy_data/inputs/curated/media/{media_sources,media_assets,media_links}.csv`: **deleted** (data migrates into `/curated/freestyle_tricks/` sidecars; sidecars are the new source of truth).
- `legacy_data/pipeline/qc/check_media_coverage.py`: **edited** (column retargeting per mapping above).
- `legacy_data/pipeline/qc/check_snippet_candidates.py`: **edited** (column retargeting).
- `scripts/reset-local-db.sh`: **edited** to remove the three loader entries.
- `database/schema.sql`: **edited** (drop `freestyle_media_*`, add `media_sources`, extend `media_items` with `source_id` / `start_seconds` / `end_seconds`).

No other historical-pipeline code is affected. James's other loaders, QC scripts, identity pipeline, workbook builders, etc. are all unaffected.

---

## Sequencing: slice timeline

The unification work is split into 4 slices.

1. **Slice 1 (doc edits only).** Platform maintainer's solo work. Updates this file, `docs/DESIGN_DECISIONS.md` §2.6 + §2.8, `docs/USER_STORIES.md` §A_Upload_Curated_Media (collapsed expansion), `docs/DATA_MODEL.md` §4.17, `docs/VIEW_CATALOG.md`, `docs/SERVICE_CATALOG.md` §4.4, `legacy_data/IMPLEMENTATION_PLAN.md` (your active-work entry pointing here), root `IMPLEMENTATION_PLAN.md` (active-slice block), and `database/schema.sql` (forward-pointer comment near `freestyle_media_*`). No code or schema changes. James not involved.
2. **Slice 2 (schema rewrite + filesystem reorg + migration).** Schema rewrite, drop `freestyle_media_*` tables, add `media_sources` + new `media_items` columns, convert legacy CSVs into `/curated/freestyle_tricks/` sidecars, extend curator seeder to handle the `freestyle_tricks/` category, delete loaders 21/22/23, edit `scripts/reset-local-db.sh`, retarget the 2 QC scripts. James self-directs to unblock himself, with no coordination required; Dave handles whatever James doesn't take. All commits land on `main`; no atomic merge.
3. **Slice 3 (trick page reference video gallery).** Platform-side only. Extends `freestyleService.getTrickDetailPage` and `src/views/freestyle/trick.hbs` to render a gallery of curator-tagged videos. James not involved.
4. **Slice 4 (admin panel category extensions).** Platform-side only. Implements the expanded `A_Upload_Curated_Media` US (upload + edit + delete + category creation in one collapsed UI). James not involved.

Slice 1 lands first. Slice 2 is the only cross-track slice; James self-directs and Dave fills in. Slices 3 and 4 are platform-side (Dave).
