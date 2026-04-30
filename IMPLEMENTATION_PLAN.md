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

## Dave's track: Admin curator upload + bootstrap (active)

Implements `A_Upload_Curated_Media` end-to-end (US §6.3) plus the first-admin bootstrap mechanism per DD §2.9. Deliverables: admin dashboard at `/admin`, admin curator upload at `/admin/curator/upload` (photo + video through Sharp/ffmpeg), `requireAdmin` middleware, in-app file-based admin grant at registration (`src/services/initialAdminBootstrap.ts` reads gitignored `.local/initial-admins.txt`; `registerMember` flips `is_admin=1` when the new member's email is listed), integration tests at every layer including a regression test for the simulated-email-card flow.

---

## James's track: Historical pipeline completion (parallel)

Tracked in `legacy_data/IMPLEMENTATION_PLAN.md`. Load only when working in that subtree.

---

## Accepted temporary deviations

### Infrastructure deviations

1. `**docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.

## Deferred / next session review

- **Broader curator content seeding (Japan Worlds 2026 photo, /net cartoons, /footbag-heroes cartoons, future tutorials and historical content).** Uses the seed mechanism delivered in the curator slice; no new design or schema work. Per item: source file in curator-assets directory + entry in seed list + tags. Pages that render new content (`/footbag-heroes`, `/net` cartoon section, event galleries via standardized hashtag auto-link) get DB-query render code in the `freestyleService` / `netService` pattern. Optional: promote the seed list to an external manifest format if categories grow. MIGRATION_PLAN entry for go-live curator-content readiness drafted alongside. DEVOPS_GUIDE entry for the seeding mechanism drafted alongside.
- **Mirror: scrub all media regardless of source format.** The legacy mirror (`legacy_data/create_mirror_footbag_org.py`) currently re-encodes only formats marked `convertible=True` in MEDIA_FORMATS; native-format MP4, WebM, MP3, JPG, JPEG, PNG, and GIF inputs pass through unchanged with no malware-stripping. Close the gap: re-encode every downloaded media file on the fly during the mirror run, using the same security pipeline as the platform's curator and member upload paths.
  - Images: PIL re-encode with explicit metadata stripping (`exif=b''`, no `icc_profile=` kwarg, no XMP preservation). Native JPG/PNG/GIF inputs included. Format whitelist enforced.
  - Videos: ffmpeg with `-map 0:v -map 0:a?`, `-map_metadata -1`, `-map_chapters -1`, `-c:v libx264 -c:a aac`, `-pix_fmt yuv420p`, `-movflags +faststart`. Native MP4/WebM inputs included.
  - Audio: ffmpeg with `-map 0:a`, `-map_metadata -1`, `-map_chapters -1`, `-c:a libmp3lame` or `-c:a aac`, single rendition. Native MP3 inputs included.
  - SVG: convert to PNG via cairosvg/rsvg (recommended), or add to SKIP_EXTENSIONS. SVG carries unique risks (embedded JavaScript, external entity references).
  - Polyglot defense: magic-byte verification at download time before saving; reject files whose magic bytes do not match declared extension.
  - Consolidate ffmpeg/PIL settings with the platform's curator/member pipelines per DD §6.8.
  - Cross-track item; coordinate with the historical-pipeline maintainer at slice activation.

