# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/MIGRATION_PLAN.md`; anything narrower than those docs is implicit future work and is not enumerated here.

## Active slice now

**Curator media unification -- slice 1 of 4 (doc edits).** Slice-1 doc edits complete; pending check-in. Full design: `CURATED_MEDIA_PLAN.md`.

Subsequent slices:

- **Slice 2 (James-owned).** Schema rewrite + migration + curator seeder extension + loader deletes + QC retargets. James owns slice 2 end to end (locked 2026-05-02); full task list in `CURATED_MEDIA_PLAN.md` §"Items for James" and `legacy_data/IMPLEMENTATION_PLAN.md`. No Dave action required. All commits land directly on `main`.
- **Slice 3 (Dave-owned; queued behind slice 2).** Trick page reference video gallery rendering:
  - Extend `freestyleService.getTrickDetailPage` to fetch curator-tagged videos for the trick (`media_items` filtered by `#curated` + trick slug tag, ordered `uploaded_at DESC`).
  - Update `src/views/freestyle/trick.hbs` to render the gallery section.
- **Slice 4 (Dave-owned; queued behind slice 3).** Admin panel category extensions, collapsed `A_Upload_Curated_Media` US (`docs/USER_STORIES.md`):
  - Upload form: file (MP4/image) or URL reference, per category.
  - Edit form: caption, tags, clip range (`start_seconds` / `end_seconds`), source attribution (`source_id`).
  - Delete: hard-delete a curated item.
  - Category creation: free-text input on upload form; seeder auto-creates `/curated/{name}/` on next deploy. No code-side whitelist.
  - Per-category tag autocomplete + validation: `freestyle_tricks/` autocompletes trick-slug from `freestyle_tricks.slug` (warn-but-don't-abort on unknown slugs); auto-applies `#curated` + category-default tags; rejects user-supplied `#curated`.

Historical-pipeline work tracked in `legacy_data/IMPLEMENTATION_PLAN.md`.

---

## Accepted temporary deviations

### Infrastructure deviations

1. `**docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.

2. **ffmpeg installed only in `image` container, not in `web`.** `docker/image/Dockerfile:34` installs ffmpeg for image-worker use; `docker/web/Dockerfile` does not. `curatorMediaService.uploadVideo` calls `transcodeCuratorVideo` from `src/lib/videoProcessing.ts` which `spawn`s ffmpeg in-process — and the upload route runs in the `web` container. Production video uploads via `/admin/curator/upload` will therefore fail with `ENOENT: ffmpeg`. Currently masked by the integration test stub (`setVideoTranscoderForTests`). Photo uploads and the deploy-time `--with-curated` seed (which runs on the workstation, not in the container) are unaffected. Unblock options: (a) add ffmpeg to `web/Dockerfile`, or (b) refactor `transcodeCuratorVideo` to call the image worker via HTTP (matches the Sharp adapter pattern in `imageProcessingAdapter`). Option (b) is cleaner; option (a) is faster.

## Deferred / next session review

- **Broader curator content for `/net`, `/footbag-heroes`, tutorials, historical content.** Curator lifecycle (upload, edit, delete via `/admin/curator/media`; `--with-curated` deploy flag) is shipped. Remaining work per content surface: drop source files into `/curated/` with sidecar metadata, deploy with `--with-curated`, add DB-query render code in the relevant service if the surface needs a new gallery/page (`freestyleService` / `netService` pattern). No new mechanism work.
- **Mirror: scrub all media regardless of source format.** The legacy mirror (`legacy_data/create_mirror_footbag_org.py`) currently re-encodes only formats marked `convertible=True` in MEDIA_FORMATS; native-format MP4, WebM, MP3, JPG, JPEG, PNG, and GIF inputs pass through unchanged with no malware-stripping. Close the gap: re-encode every downloaded media file on the fly during the mirror run, using the same security pipeline as the platform's curator and member upload paths.
  - Images: PIL re-encode with explicit metadata stripping (`exif=b''`, no `icc_profile=` kwarg, no XMP preservation). Native JPG/PNG/GIF inputs included. Format whitelist enforced.
  - Videos: ffmpeg with `-map 0:v -map 0:a?`, `-map_metadata -1`, `-map_chapters -1`, `-c:v libx264 -c:a aac`, `-pix_fmt yuv420p`, `-movflags +faststart`. Native MP4/WebM inputs included.
  - Audio: ffmpeg with `-map 0:a`, `-map_metadata -1`, `-map_chapters -1`, `-c:a libmp3lame` or `-c:a aac`, single rendition. Native MP3 inputs included.
  - SVG: convert to PNG via cairosvg/rsvg (recommended), or add to SKIP_EXTENSIONS. SVG carries unique risks (embedded JavaScript, external entity references).
  - Polyglot defense: magic-byte verification at download time before saving; reject files whose magic bytes do not match declared extension.
  - Consolidate ffmpeg/PIL settings with the platform's curator/member pipelines per DD §6.8.
  - Cross-track item; coordinate with the historical-pipeline maintainer at slice activation.

