# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/MIGRATION_PLAN.md`; anything narrower than those docs is implicit future work and is not enumerated here.

## Active slice now

(none on the platform side currently)

Historical-pipeline work is tracked in `legacy_data/IMPLEMENTATION_PLAN.md`. Load only when working in that subtree. Cross-track changes require explicit human coordination.

---

## Accepted temporary deviations

### Infrastructure deviations

1. `**docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.

2. **ffmpeg installed only in `image` container, not in `web`.** `docker/image/Dockerfile:34` installs ffmpeg for image-worker use; `docker/web/Dockerfile` does not. `curatorMediaService.uploadVideo` calls `transcodeCuratorVideo` from `src/lib/videoProcessing.ts` which `spawn`s ffmpeg in-process — and the upload route runs in the `web` container. Production video uploads via `/admin/curator/upload` will therefore fail with `ENOENT: ffmpeg`. Currently masked by the integration test stub (`setVideoTranscoderForTests`). Photo uploads and the deploy-time `--with-curated` seed (which runs on the workstation, not in the container) are unaffected. Unblock options: (a) add ffmpeg to `web/Dockerfile`, or (b) refactor `transcodeCuratorVideo` to call the image worker via HTTP (matches the Sharp adapter pattern in `imageProcessingAdapter`). Option (b) is cleaner; option (a) is faster.

## Deferred / next session review

- **Broader curator content for `/net`, `/footbag-heroes`, tutorials, historical content.** Curator lifecycle (upload, edit, delete via `/admin/curator/media`; `--with-curated` deploy flag) is shipped. Remaining work per content surface: drop source files into `/curated/` with sidecar metadata, deploy with `--with-curated`, add DB-query render code in the relevant service if the surface needs a new gallery/page (`freestyleService` / `netService` pattern). No new mechanism work.
- **Trick page rendering of `freestyle_media_*` reference media.**
  - **Problem (user-visible):** Visitors browsing `/freestyle/dictionary/{slug}` see no video for tricks even when curated reference media exists for that trick. Per James's pipeline (loaders `21_load_freestyle_media_sources.py`, `22_load_freestyle_media_assets.py`, `23_load_freestyle_media_links.py`, all wired into `scripts/reset-local-db.sh`), the DB currently holds 47 assets / 84 links / 40 distinct tricks with a `is_primary=1` reference video. None of it reaches the page.
  - **Cause:** Zero `src/` code reads `freestyle_media_assets`, `freestyle_media_links`, or `freestyle_media_sources`. The trick view-model produced by `freestyleService` does not include any reference-media slot, and `src/views/freestyle/trick.hbs` has no video element.
  - **Architectural context:** Per `CURATED_MEDIA_PLAN.md` (cross-track resolution with the historical-pipeline maintainer, Option A), curator content (`media_items` populated by the curator slice) and trick reference media (`freestyle_media_*` populated by the historical pipeline) intentionally stay in separate table families. Rendering must read from both layers but they are not merged. This entry is about adding the read path on the trick page, not about merging.
  - **Deferred solution:** Extend `freestyleService` with a method that, for a given trick slug, joins `freestyle_media_links` (entity_type='trick', entity_id=slug) → `freestyle_media_assets` → `freestyle_media_sources` and returns the primary video (`is_primary=1`) plus title, creator, and source provenance. Inject into the trick page view-model. Add a video element to `src/views/freestyle/trick.hbs`. Tests: render assertions for tricks with vs without reference media; primary-only filter; provenance display.
  - **Why deferred (not active now):** Out of scope of the just-completed curator content lifecycle slice. Single-slice scope keeps that slice reviewable. This rendering work is its own focused slice with no dependency on more cross-track coordination — James's data is already in place.
  - **Unblock:** No external blocker. Ready to start whenever the platform maintainer picks it up.
- **Mirror: scrub all media regardless of source format.** The legacy mirror (`legacy_data/create_mirror_footbag_org.py`) currently re-encodes only formats marked `convertible=True` in MEDIA_FORMATS; native-format MP4, WebM, MP3, JPG, JPEG, PNG, and GIF inputs pass through unchanged with no malware-stripping. Close the gap: re-encode every downloaded media file on the fly during the mirror run, using the same security pipeline as the platform's curator and member upload paths.
  - Images: PIL re-encode with explicit metadata stripping (`exif=b''`, no `icc_profile=` kwarg, no XMP preservation). Native JPG/PNG/GIF inputs included. Format whitelist enforced.
  - Videos: ffmpeg with `-map 0:v -map 0:a?`, `-map_metadata -1`, `-map_chapters -1`, `-c:v libx264 -c:a aac`, `-pix_fmt yuv420p`, `-movflags +faststart`. Native MP4/WebM inputs included.
  - Audio: ffmpeg with `-map 0:a`, `-map_metadata -1`, `-map_chapters -1`, `-c:a libmp3lame` or `-c:a aac`, single rendition. Native MP3 inputs included.
  - SVG: convert to PNG via cairosvg/rsvg (recommended), or add to SKIP_EXTENSIONS. SVG carries unique risks (embedded JavaScript, external entity references).
  - Polyglot defense: magic-byte verification at download time before saving; reject files whose magic bytes do not match declared extension.
  - Consolidate ffmpeg/PIL settings with the platform's curator/member pipelines per DD §6.8.
  - Cross-track item; coordinate with the historical-pipeline maintainer at slice activation.

