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
import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
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

/**
 * Minimal S3 surface this worker needs for the from-storage video route.
 * Defined locally (rather than imported from src/adapters/mediaStorageAdapter.ts)
 * so the image worker stays decoupled from the web app's full env config:
 * the adapter module imports src/config/env, which hard-requires
 * FOOTBAG_DB_PATH and SESSION_SECRET — neither of which belong on this
 * container.
 */
export interface S3StorageClient {
  get(key: string): Promise<Buffer>;
  put(key: string, data: Buffer): Promise<void>;
}

function createDefaultS3StorageClient(): S3StorageClient | null {
  const bucket = process.env.MEDIA_STORAGE_S3_BUCKET;
  if (!bucket) return null;
  const region = process.env.AWS_REGION;
  // requestChecksumCalculation: 'WHEN_REQUIRED' matches the web/worker S3
  // client to suppress per-call CRC32 overhead. Default 'WHEN_SUPPORTED'
  // would add x-amz-checksum-crc32 headers we don't need.
  const client = new S3Client({
    ...(region ? { region } : {}),
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return {
    async get(key: string): Promise<Buffer> {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async put(key: string, data: Buffer): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: 'video/mp4',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },
  };
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
  // Test seam: substitute the S3 client used by /process/video-from-storage.
  // Production reads bucket + region from MEDIA_STORAGE_S3_BUCKET / AWS_REGION
  // and constructs an AWS SDK client. When MEDIA_STORAGE_S3_BUCKET is unset
  // (e.g. a local-dev image worker), the from-storage route returns 503.
  s3StorageClient?: S3StorageClient | null;
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
  const s3Storage =
    opts.s3StorageClient !== undefined ? opts.s3StorageClient : createDefaultS3StorageClient();
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

  // Memory-efficient transcode path used by the curator video finalize flow.
  // The legacy /process/video route requires the caller (worker container) to
  // hold the full source video buffer in its 96M cgroup, which OOMs on real
  // uploads. This route shifts the S3 GET + ffmpeg + S3 PUT into the image
  // container's 256M cgroup so only one container ever holds the bytes.
  // Caller sends just `{sourceKey, outputKey}`; this worker fetches, transcodes,
  // and uploads.
  async function runVideoProcessFromStorage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!s3Storage) {
      res.status(503).json({ error: 's3 storage not configured' });
      return;
    }
    const body = req.body as { sourceKey?: unknown; outputKey?: unknown };
    const sourceKey = body?.sourceKey;
    const outputKey = body?.outputKey;
    if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
      res.status(400).json({ error: 'sourceKey required' });
      return;
    }
    if (typeof outputKey !== 'string' || outputKey.length === 0) {
      res.status(400).json({ error: 'outputKey required' });
      return;
    }

    let source: Buffer;
    try {
      source = await s3Storage.get(sourceKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `s3 get failed: ${msg}` });
      return;
    }
    if (source.length === 0) {
      res.status(400).json({ error: 'source object is empty' });
      return;
    }
    if (source.length > videoMaxBytes) {
      res.status(413).json({ error: 'source object exceeds videoMaxBytes' });
      return;
    }
    if (!detectVideoFormat(source)) {
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
      const result = await transcodeVideoFn(source, videoTuning);
      // Drop the source reference before the S3 PUT so the GC has a chance to
      // reclaim it while we hold the (similarly sized) transcoded buffer.
      source = Buffer.alloc(0);
      await s3Storage.put(outputKey, result.bytes);
      res.status(200).json({
        ok: true,
        outputKey,
        outputFormat: result.outputFormat,
        outputBytes: result.bytes.length,
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

  // Memory-efficient counterpart to /process/video. JSON body, no buffered
  // request payload — the source bytes never traverse the worker container
  // that dispatched the job.
  app.post(
    '/process/video-from-storage',
    express.json({ limit: '4kb' }),
    runVideoProcessFromStorage,
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
