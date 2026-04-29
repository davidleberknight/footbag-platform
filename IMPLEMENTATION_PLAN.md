# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/MIGRATION_PLAN.md`; anything narrower than those docs is implicit future work and is not enumerated here.

## Active slice now

### Parallel tracks

Two developers work in parallel. **AI assistants: read only the track section matching the active developer; other tracks are out-of-scope noise.** Identify the developer from the git user, the prompt, or by asking.


| Dev   | Handle               | Track                                                           | Section                                                                        |
| ----- | -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Dave  | (primary maintainer) | Curator system account + media unification                      | "Dave's track"                                                                 |
| James | JamesLeberknight     | Historical pipeline completion (data import / legacy migration) | "James's track" (routing only; detail in `legacy_data/IMPLEMENTATION_PLAN.md`) |


Cross-track changes require explicit human coordination.

---

## Dave's track: Curator system account + media unification (active)

Phase one complete. Next session, start Deferred / next session review (below).

---

## James's track: Historical pipeline completion (parallel)

Tracked in `legacy_data/IMPLEMENTATION_PLAN.md`. Load only when working in that subtree.

---

## Accepted temporary deviations

### Infrastructure deviations

1. `**docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.

## Deferred / next session review

- **Admin act-as upload UI for curator content.** Implements `A_Upload_Curated_Media`. Dependencies: curator slice's system-member infrastructure (is_system flag, FH evolution, ffmpeg pipeline, media adapter rename). Scope: admin route + controller + view that accepts photo or video uploads, runs them through the same Sharp/ffmpeg pipeline used by the curator seed, writes `media_items` with `uploader_member_id = FH` and appends an `audit_log` entry naming the admin actor. Member upload controllers reject `video_platform='s3'` (defensive boundary). Acceptance criteria per the US.
- **Broader curator content seeding (Japan Worlds 2026 photo, /net cartoons, /footbag-heroes cartoons, future tutorials and historical content).** Uses the seed mechanism delivered in the curator slice; no new design or schema work. Per item: source file in curator-assets directory + entry in seed list + tags. Pages that render new content (`/footbag-heroes`, `/net` cartoon section, event galleries via standardized hashtag auto-link) get DB-query render code in the `freestyleService` / `netService` pattern. Optional: promote the seed list to an external manifest format if categories grow. MIGRATION_PLAN entry for go-live curator-content readiness drafted alongside. DEVOPS_GUIDE entry for the seeding mechanism drafted alongside.
- **Mirror: scrub all media regardless of source format.** The legacy mirror (`legacy_data/create_mirror_footbag_org.py`) currently re-encodes only formats marked `convertible=True` in MEDIA_FORMATS; native-format MP4, WebM, MP3, JPG, JPEG, PNG, and GIF inputs pass through unchanged with no malware-stripping. Close the gap: re-encode every downloaded media file on the fly during the mirror run, using the same security pipeline as the platform's curator and member upload paths.
  - Images: PIL re-encode with explicit metadata stripping (`exif=b''`, no `icc_profile=` kwarg, no XMP preservation). Native JPG/PNG/GIF inputs included. Format whitelist enforced.
  - Videos: ffmpeg with `-map 0:v -map 0:a?`, `-map_metadata -1`, `-map_chapters -1`, `-c:v libx264 -c:a aac`, `-pix_fmt yuv420p`, `-movflags +faststart`. Native MP4/WebM inputs included.
  - Audio: ffmpeg with `-map 0:a`, `-map_metadata -1`, `-map_chapters -1`, `-c:a libmp3lame` or `-c:a aac`, single rendition. Native MP3 inputs included.
  - SVG: convert to PNG via cairosvg/rsvg (recommended), or add to SKIP_EXTENSIONS. SVG carries unique risks (embedded JavaScript, external entity references).
  - Polyglot defense: magic-byte verification at download time before saving; reject files whose magic bytes do not match declared extension.
  - Consolidate ffmpeg/PIL settings with the platform's curator/member pipelines per DD §6.8.
  - Cross-track item; coordinate with the historical-pipeline maintainer at slice activation.

