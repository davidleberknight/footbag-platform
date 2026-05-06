# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted temporary dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`. The go-live migration detail is here: `docs/MIGRATION_PLAN.md`; anything narrower than these docs is implicit future work and is not enumerated here. See also `legacy_data/IMPLEMENTATION_PLAN.md` for data preparation / James' sprint planning. For all of these files, do not read unless necessary for current work.

## Accepted temporary deviations

### Infrastructure deviations

1. `**docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.
2. **ffmpeg installed only in `image` container, not in `web`.** `docker/image/Dockerfile:34` installs ffmpeg for image-worker use; `docker/web/Dockerfile` does not. `curatorMediaService.uploadVideo` calls `transcodeCuratorVideo` from `src/lib/videoProcessing.ts` which `spawn`s ffmpeg in-process, and the upload route runs in the `web` container. Production video uploads via `/admin/curator/upload` will therefore fail with `ENOENT: ffmpeg`. Currently masked by the integration test stub (`setVideoTranscoderForTests`). Photo uploads and the deploy-time `--with-curated` seed (which runs on the workstation, not in the container) are unaffected. Unblock options: (a) add ffmpeg to `web/Dockerfile`, or (b) refactor `transcodeCuratorVideo` to call the image worker via HTTP (matches the Sharp adapter pattern in `imageProcessingAdapter`). Option (b) is cleaner; option (a) is faster

### Member upload + gallery write deviations

3. **Tier 1 gating not enforced on member upload or member gallery writes.** `POST /members/:memberKey/galleries{,/...}` and `POST /members/:memberKey/media/upload` admit any authenticated member. USER_STORIES M_Upload_Photo / M_Submit_Video / M_Organize_Media_Galleries reserve these surfaces for Tier 1 cohort. Tier ledger (`member_tier_grants`, `member_tier_current`) exists in schema; no tier-required middleware or service-level tier check exists yet. Code comments at `memberGalleryController.ts` and `memberMediaUploadController.ts` describe the gap at the deviation sites. Unblock: tier enforcement lands platform-wide and these routes gain a tier gate.
4. **Slug-tag anti-spoofing not enforced on member-supplied tags.** `curatorMediaService.uploadPhotoForMember` / `submitVideoForMember` auto-prepend `#{authenticated_member_slug}` (the uploader tag) but do not reject `#{other_member_slug}` from the user-supplied tags array. USER_STORIES §1.1 (Uploader hashtags) reserves slug-tags for the matching uploader. Unblock: add a slug-set lookup against `members.slug` to `applyTagsForMember` and throw `ValidationError` when any user tag matches a known slug other than the actor's own.

