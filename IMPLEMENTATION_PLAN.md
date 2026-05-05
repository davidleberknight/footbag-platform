# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/MIGRATION_PLAN.md`; anything narrower than those docs is implicit future work and is not enumerated here.

## Active slice now

**Curator media unification, slice 2 cleanup (James-owned).** Phases A through D shipped (schema rewrite, sidecar migration, seeder extension, QC retargets). Phase E destructive-cleanup residual:

1. Drop `freestyle_media_sources` / `freestyle_media_assets` / `freestyle_media_links` table definitions from `database/schema.sql` (currently retained at lines 3671 onward alongside the new `media_sources` / `media_items` family).
2. Delete loaders `21_load_freestyle_media_sources.py`, `22_load_freestyle_media_assets.py`, `23_load_freestyle_media_links.py` under `legacy_data/event_results/scripts/`.
3. Delete `legacy_data/inputs/curated/media/*.csv` (4 files).
4. Delete `scripts/migrate-freestyle-media-to-curated.py` (one-time job, complete).
5. Edit `scripts/reset-local-db.sh` to drop the three loader invocations at lines 145, 149, 153. **Owner approval required** (script is David-owned).
6. Before deleting `media_assets.csv` in step 3, run `verifyExternalVideoUrl` from `src/lib/videoUrlVerifier.ts` over the 94 sidecars in `curated/freestyle_tricks/` and surface any oEmbed-confirmed dead URLs. The original migration asserted only platform-pattern match, not availability; two confirmed dead URLs surfaced post-migration (`vimeo.com/25019188` deleted 2026-05-04; YouTube `Dmr7zj_c7cY` thumbnail 404 found 2026-05-05). Re-run before destruction so the dead-link cohort is captured before the source CSV is gone.

Order is yours; complete before slice 3 starts.

**TT Series view (James-owned).** Spec at `docs/tt_series_view_spec.md` (READY FOR IMPLEMENTATION). Prerequisites:

1. Author `curated/freestyle_media/tt_roster.csv` populated from spec §7 (42 entries).
2. Emit sidecars for the 7 STAGED_AND_VERIFIED TT lessons (knee-stall #5, cloud-stall #11, forehead-stall #12, neck-stall #13, sole-stall #22, cross-body-sole-stall #24, symposium-mirage #31). Each lesson has an active dictionary entry, a verified `tt_youtube` snippet-candidate row, and confirmed YouTube ID; promotion is a sidecar-emit + `seed_curator_media.py` re-run.
3. Implement the view per spec §11 (route, controller, service, template, integration tests).

5 BLOCKED_PENDING_TRICK rows (spin #6, flying-clipper #20, dragonfly-kick #21, da-da-curve #40, whirling-swirl #41) auto-promote to LIVE on next dictionary review; no slice-side action needed.

---

Subsequent slices:

- **Slice 3 (Dave-owned).** Trick page reference video gallery rendering:
  - Extend `freestyleService.getTrickDetailPage` to fetch curator-tagged videos for the trick (`media_items` filtered by `#curated` plus trick slug tag, ordered `uploaded_at DESC`).
  - Update `src/views/freestyle/trick.hbs` to render the gallery section.
- **Slice 4 (Dave-owned, partial).** Admin panel category extensions per `docs/USER_STORIES.md` §A_Upload_Curated_Media. Upload / edit / list views materially extended in `5eab574`; remaining: confirm per-category tag autocomplete, free-text category creation, and per-category default-tag application against story acceptance criteria; close any gaps.

Historical-pipeline work tracked in `legacy_data/IMPLEMENTATION_PLAN.md`.

---

## Accepted temporary deviations

### Infrastructure deviations

1. **`docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.

2. **ffmpeg installed only in `image` container, not in `web`.** `docker/image/Dockerfile:34` installs ffmpeg for image-worker use; `docker/web/Dockerfile` does not. `curatorMediaService.uploadVideo` calls `transcodeCuratorVideo` from `src/lib/videoProcessing.ts` which `spawn`s ffmpeg in-process, and the upload route runs in the `web` container. Production video uploads via `/admin/curator/upload` will therefore fail with `ENOENT: ffmpeg`. Currently masked by the integration test stub (`setVideoTranscoderForTests`). Photo uploads and the deploy-time `--with-curated` seed (which runs on the workstation, not in the container) are unaffected. Unblock options: (a) add ffmpeg to `web/Dockerfile`, or (b) refactor `transcodeCuratorVideo` to call the image worker via HTTP (matches the Sharp adapter pattern in `imageProcessingAdapter`). Option (b) is cleaner; option (a) is faster.

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
