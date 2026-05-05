# IMPLEMENTATION_PLAN.md

This file tracks the current build: active sprint, accepted temporary dev shortcuts, and external blockers. Long-term design lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`. The go-live migration detail is here: `docs/MIGRATION_PLAN.md`; anything narrower than these docs is implicit future work and is not enumerated here. See also `legacy_data/IMPLEMENTATION_PLAN.md` for data preparation / James' sprint planning. For all of these files, do not read unless necessary for current work.

## Accepted temporary deviations

### Infrastructure deviations

1. `**docker/docker-compose.prod.yml` memory limits sized for Lightsail nano_3_0 (512M host).** Current: nginx 64M, web 192M, worker 96M, image 256M with `IMAGE_MAX_CONCURRENT=1`. DD §1.8 production target: nginx 128 / web 512 / worker 384 / image 896 (1,920M total) with `IMAGE_MAX_CONCURRENT=2`, on a 2GB+ host. Image-container code comment at the deviation site captures the OOM-defense detail. Unblock: host bundle upgrade.
2. **ffmpeg installed only in `image` container, not in `web`.** `docker/image/Dockerfile:34` installs ffmpeg for image-worker use; `docker/web/Dockerfile` does not. `curatorMediaService.uploadVideo` calls `transcodeCuratorVideo` from `src/lib/videoProcessing.ts` which `spawn`s ffmpeg in-process, and the upload route runs in the `web` container. Production video uploads via `/admin/curator/upload` will therefore fail with `ENOENT: ffmpeg`. Currently masked by the integration test stub (`setVideoTranscoderForTests`). Photo uploads and the deploy-time `--with-curated` seed (which runs on the workstation, not in the container) are unaffected. Unblock options: (a) add ffmpeg to `web/Dockerfile`, or (b) refactor `transcodeCuratorVideo` to call the image worker via HTTP (matches the Sharp adapter pattern in `imageProcessingAdapter`). Option (b) is cleaner; option (a) is faster

