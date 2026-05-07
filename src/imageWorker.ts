/**
 * Image worker entry point.
 *
 * Standalone Express server that wraps the Sharp pipeline behind an HTTP
 * boundary. Phase 2 will package this as the `image` Docker container; in
 * Phase 1 it runs locally via `npm run dev:image`. Reads its own env vars
 * directly because it is a separate process from the web app and must not
 * require web-only config (FOOTBAG_DB_PATH, SESSION_SECRET, etc.).
 */
import express, { Request, Response, NextFunction } from 'express';
import { detectImageType, processAvatar, processPhoto, type ProcessedImage } from './lib/imageProcessing';
import {
  detectVideoFormat,
  transcodeCuratorVideo,
  type TranscodedVideo,
  type VideoTranscodeTuning,
} from './lib/videoProcessing';
import { Semaphore } from './lib/semaphore';

// Whitelisted libx264 preset names. Off-list values are rejected at boot to
// surface typos before they reach ffmpeg, where an unknown preset aborts the
// transcode after the input has already been read.
const VALID_X264_PRESETS = new Set([
  'ultrafast', 'superfast', 'veryfast', 'faster', 'fast',
  'medium', 'slow', 'slower', 'veryslow', 'placebo',
]);

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
// Worker-side ceiling sits 50 MB above the service-side VIDEO_MAX_BYTES
// (150 MB) so service-layer validation stays the user-visible source of
// truth. The worker's higher limit is defense-in-depth, not a separate
// product cap.
const VIDEO_MAX_BYTES_DEFAULT = 200 * 1024 * 1024;

function parseIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = parseInt(raw, 10);
  if (n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got: ${raw}`);
  }
  return n;
}

function parseOptionalIntEnv(name: string, min: number, max: number): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = parseInt(raw, 10);
  if (n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got: ${raw}`);
  }
  return n;
}

function readVideoTuningFromEnv(): VideoTranscodeTuning {
  const preset = process.env.VIDEO_X264_PRESET || undefined;
  if (preset !== undefined && !VALID_X264_PRESETS.has(preset)) {
    throw new Error(
      `VIDEO_X264_PRESET must be a libx264 preset name, got: ${preset}`,
    );
  }
  const threads = parseOptionalIntEnv('VIDEO_X264_THREADS', 1, 16);
  const rcLookahead = parseOptionalIntEnv('VIDEO_X264_RC_LOOKAHEAD', 0, 250);
  return { preset, threads, rcLookahead };
}

export interface ImageWorkerOptions {
  maxConcurrent?: number;
  semaphoreWaitMs?: number;
  videoMaxConcurrent?: number;
  videoSemaphoreWaitMs?: number;
  videoMaxBytes?: number;
  // Test seam: substitute the Sharp pipeline with a slow / failing impl
  // so semaphore-busy and error paths can be exercised without flake.
  processAvatarImpl?: (data: Buffer) => Promise<ProcessedImage>;
  processPhotoImpl?: (data: Buffer) => Promise<ProcessedImage>;
  // Test seam: substitute the ffmpeg pipeline so video-route tests run
  // without invoking real ffmpeg.
  transcodeVideoImpl?: (data: Buffer, tuning?: VideoTranscodeTuning) => Promise<TranscodedVideo>;
  // Override the env-derived libx264 tuning for tests; production reads
  // VIDEO_X264_PRESET / VIDEO_X264_THREADS / VIDEO_X264_RC_LOOKAHEAD from env.
  videoTuning?: VideoTranscodeTuning;
}

export function createImageWorkerApp(opts: ImageWorkerOptions = {}): express.Express {
  const maxConcurrent =
    opts.maxConcurrent ?? parseIntEnv('IMAGE_MAX_CONCURRENT', 2, 1, 16);
  const semaphoreWaitMs =
    opts.semaphoreWaitMs ?? parseIntEnv('IMAGE_SEMAPHORE_WAIT_MS', 30000, 1, 600000);
  // Video gets its own semaphore: 60-120 s ffmpeg runs would starve sub-second
  // Sharp work on a shared bound. Default 1 matches the service-side
  // transcodeBound and is conservative for the 256 MB image-container memory
  // cap on Lightsail nano_3_0.
  const videoMaxConcurrent =
    opts.videoMaxConcurrent ?? parseIntEnv('IMAGE_VIDEO_MAX_CONCURRENT', 1, 1, 4);
  const videoSemaphoreWaitMs =
    opts.videoSemaphoreWaitMs ??
    parseIntEnv('IMAGE_VIDEO_SEMAPHORE_WAIT_MS', 600000, 1, 1800000);
  const videoMaxBytes =
    opts.videoMaxBytes ??
    parseIntEnv('IMAGE_VIDEO_MAX_BYTES', VIDEO_MAX_BYTES_DEFAULT, 1, 1024 * 1024 * 1024);
  const processAvatarFn = opts.processAvatarImpl ?? processAvatar;
  const processPhotoFn = opts.processPhotoImpl ?? processPhoto;
  const transcodeVideoFn = opts.transcodeVideoImpl ?? transcodeCuratorVideo;
  const videoTuning = opts.videoTuning ?? readVideoTuningFromEnv();
  const semaphore = new Semaphore(maxConcurrent, semaphoreWaitMs);
  const videoSemaphore = new Semaphore(videoMaxConcurrent, videoSemaphoreWaitMs);

  async function runProcess(
    req: Request,
    res: Response,
    next: NextFunction,
    impl: (data: Buffer) => Promise<ProcessedImage>,
  ): Promise<void> {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }
    if (!detectImageType(buf)) {
      res.status(400).json({ error: 'unrecognized image type' });
      return;
    }

    try {
      await semaphore.acquire();
    } catch {
      res.set('Retry-After', '1');
      res.status(503).json({ error: 'image worker busy' });
      return;
    }

    try {
      const processed = await impl(buf);
      res.status(200).json({
        thumb: processed.thumb.toString('base64'),
        display: processed.display.toString('base64'),
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
      });
    } catch (err: unknown) {
      next(err);
    } finally {
      semaphore.release();
    }
  }

  async function runVideoProcess(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }
    if (!detectVideoFormat(buf)) {
      res.status(400).json({ error: 'unrecognized video format' });
      return;
    }

    try {
      await videoSemaphore.acquire();
    } catch {
      res.set('Retry-After', '1');
      res.status(503).json({ error: 'video worker busy' });
      return;
    }

    try {
      const result = await transcodeVideoFn(buf, videoTuning);
      res.status(200).json({
        bytes: result.bytes.toString('base64'),
        outputFormat: result.outputFormat,
      });
    } catch (err: unknown) {
      next(err);
    } finally {
      videoSemaphore.release();
    }
  }

  const app = express();

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post(
    '/process/avatar',
    express.raw({ type: 'application/octet-stream', limit: AVATAR_MAX_BYTES }),
    (req, res, next) => runProcess(req, res, next, processAvatarFn),
  );

  app.post(
    '/process/photo',
    express.raw({ type: 'application/octet-stream', limit: PHOTO_MAX_BYTES }),
    (req, res, next) => runProcess(req, res, next, processPhotoFn),
  );

  // Endpoint name kept generic on the `image`-named container: this worker is
  // a media-processing worker by capability; renaming the container would
  // churn terraform, compose, and IMAGE_* env vars for no functional gain.
  app.post(
    '/process/video',
    express.raw({ type: 'application/octet-stream', limit: videoMaxBytes }),
    runVideoProcess,
  );

  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload too large' });
      return;
    }
    res.status(500).json({ error: err.message || 'image processing failed' });
  });

  return app;
}

/* c8 ignore start -- standalone entry block, exercised by `npm run dev:image` */
if (require.main === module) {
  const port = parseIntEnv('IMAGE_PORT', 4000, 1, 65535);
  const app = createImageWorkerApp();
  app.listen(port, () => {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'image worker listening', port }) + '\n',
    );
  });
}
/* c8 ignore stop */
