# Implementation note: footbag.org demos use the existing paired-sidecar S3 path (2026-05-31)

The 17 footbag.org "Video Moves" demonstration clips (13 tricks) were acquired and staged for
ingestion via the **existing file-paired curator S3 path** in `scripts/seed_fh_curator.py`
(`seed_file_paired_sidecars`). **No new external-link path, no `video_platform='external'`, no
schema change, no seeder/promote/rendering edits.** This records that decision so it is not
re-litigated.

## Why the existing path, not a new one

`seed_file_paired_sidecars` already does everything Path-D-via-S3 requires: a video binary plus a
sibling `<stem>.meta.json` under `curated/<category>/` is transcoded (ffmpeg, metadata-stripped),
uploaded through `MediaStorageAdapter` (local FS in dev, S3 in stg/prod), and inserted as a
`media_items` row with `video_platform='s3'`, `video_url=NULL`, a derived poster, and full tags.
`.mov` is an accepted input extension (re-encoded to `.mp4`). The sidecar's `externalUrl` field
carries footbag.org provenance. So the "missing S3 ingestion path" was never missing — only the
data prep was. The only new code is the data-prep script; the pipeline was untouched.

The alternative the earlier workflow doc floated — a new `video_platform='external'` / external-link
media kind — was **not** built and is not needed: these are re-hosted IFPA video bytes, not embedded
external URLs.

## What was produced

- `scripts/acquire_footbag_org_demos.py` — James-track, `--dry-run`-first; reads
  `legacy_data/tools/trick_video_discovery/footbag_org_rehost_candidates.csv`, downloads each `.mov`
  + footbag.org thumbnail poster into `curated/freestyle_demos/`, and emits paired sidecars.
- `curated/freestyle_demos/` — 17 × (`<stem>.mov`, `<stem>.poster.jpg`, `<stem>.meta.json`); ~5.9 MiB
  of source `.mov` total (committable).
- Each sidecar: `caption` = move name only (no contributor), `tags = ["#<slug>", "#freestyle",
  "#trick", "#footbag_org"]` (no `#curated` — the seeder auto-prepends it), `poster`, and
  `externalUrl` = the `/newmoves/showmove/<id>` source page.
- `#footbag_org` was added to `UTILITY_EXACT` in `scripts/_trick_tag_invariant.py` (prerequisite).

## Validation (this run, against `database/footbag.db`)

- Dry-run: 17/17 `.mov` + 17/17 posters reachable (HTTP 200); tags valid; captions name-free; stems
  unique.
- Acquisition: 17 `.mov` + 17 posters + 17 sidecars written; files confirmed real QuickTime / JPEG.
- Targeted seed (`seed_fh_curator.py --db …` only — not a full destructive reset) inserted **17
  `video_platform='s3'` rows** (`video_url` NULL); **all 13 tricks gained demonstration media**
  (coverage delta +13, baseline was 0). No contributor surname appears in any caption.
- `25_qc_media_tag_invariant.py`: **16/17 of these rows clean.** The one flag —
  `hop-over-swirl-ales.mov: '#hop-over-swirl' does not resolve` — is a **stale-DB artifact**, not a
  data defect: the `hop-over-swirl` canonical trick row exists in the CSV source-of-truth (commit
  `9edd887c`) and resolves via the CSV validator, but was never loaded into this local DB's
  `freestyle_tricks` table (only the curator seeder was run, not the full pipeline). A full
  `reset-local-db.sh` (which loads red_corrections/additions into `freestyle_tricks`) clears it.

## Out of scope (pre-existing, untouched)

`25_qc_media_tag_invariant.py` also reports ~91 violations on **other** rows (`#shred_global`,
`#anz_trikz`, `#footbag_finland`, `#demo`, `#passback_tutorials`, `#unavailable_embed`, and stray
`#chinlone` / `#beginner` / `#methodology`). These are pre-existing source-tag-whitelist / bad-slug
issues in this dev DB, unrelated to this change, and were not modified.

## Remaining hand-off (unchanged from the workflow doc)

- Dev parity: a full `reset-local-db.sh` resolves the `hop-over-swirl` slug-row and re-seeds all 17
  cleanly.
- Stg/prod: Dave runs the seeder + prod S3 storage — the standard curated-media hand-off. The
  committed binaries under `curated/freestyle_demos/` mean no out-of-band file transfer is needed.
