// dotenv MUST be imported first, before any module that reads process.env.
// Matches the order in src/server.ts and src/worker.ts; without this the
// worker spawned by scripts/dev.sh never sees INTERNAL_EVENT_SECRET from
// .env, returns 503 on every authenticated upload, and the web layer
// surfaces it as a misleading "image worker returned 503" failure.
import 'dotenv/config';

/**
 * Image worker entry point.
 *
 * Standalone Express server that wraps the Sharp pipeline behind an HTTP
 * boundary. Phase 2 will package this as the `image` Docker container; in
 * Phase 1 it runs locally via `npm run dev:image`. Reads its own env vars
 * directly because it is a separate process from the web app and must not
 * require web-only config (FOOTBAG_DB_PATH, SESSION_SECRET, etc.).
 */
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
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
 * Image worker holds NO AWS credentials. The from-storage video route
 * receives presigned GET + PUT URLs from the dispatching web container and
 * uses fetch() against opaque URLs; no S3 SDK, no profile, no role chain.
 * Eliminates SEC-D02 (untrusted runtime holding source-profile keys).
 *
 * All /process/* routes require the x-internal-secret header (matches the
 * INTERNAL_EVENT_SECRET seam already used between web and worker containers).
 * SEC-A12.
 */

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
  // Test seam: substitute fetch for /process/video-from-storage's source GET
  // and output PUT. Production uses global fetch.
  fetchImpl?: typeof fetch;
  // Test seam / explicit override: the shared secret callers must present in
  // x-internal-secret. When undefined and no override is supplied, the worker
  // reads process.env.INTERNAL_EVENT_SECRET; if that is also unset, /process/*
  // returns 503 (graceful misconfig signal, mirrors ipcController).
  internalSecret?: string;
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
  const fetchImpl = opts.fetchImpl ?? fetch;
  const internalSecret =
    opts.internalSecret !== undefined ? opts.internalSecret : process.env.INTERNAL_EVENT_SECRET;
  const semaphore = new Semaphore(maxConcurrent, semaphoreWaitMs);
  const videoSemaphore = new Semaphore(videoMaxConcurrent, videoSemaphoreWaitMs);

  // Mirror src/controllers/ipcController.ts: 503 when secret is unconfigured
  // (graceful misconfig signal — the caller knows to skip), 401 on header
  // mismatch (active rejection of an unauthorized caller). Applied before the
  // body parser on each /process/* route.
  const requireInternalSecret: RequestHandler = (req, res, next) => {
    if (!internalSecret) {
      res.status(503).json({ error: 'INTERNAL_EVENT_SECRET not configured' });
      return;
    }
    if (req.header('x-internal-secret') !== internalSecret) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };

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
  // uploads. This route shifts the bytes into the image container's 256M cgroup
  // so only one container ever holds them.
  //
  // Caller (web container) presigns the source-key GET and the output-key PUT
  // and hands the URLs over; the image worker holds no AWS credentials and
  // sees only opaque http(s) URLs (SEC-D02). The legacy {sourceKey, outputKey}
  // shape is structurally moot here because S3 path semantics never reach the
  // worker (SEC-A17). `outputKey` may still be passed for the response echo
  // (caller-side audit log convenience) but is otherwise unused.
  async function runVideoProcessFromStorage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const body = req.body as {
      sourceUrl?: unknown;
      putUrl?: unknown;
      putContentType?: unknown;
      outputKey?: unknown;
    };
    const sourceUrl = body?.sourceUrl;
    const putUrl = body?.putUrl;
    const putContentType = body?.putContentType;
    const outputKey = body?.outputKey;

    if (typeof sourceUrl !== 'string' || !/^https?:\/\//.test(sourceUrl)) {
      res.status(400).json({ error: 'sourceUrl required (http:// or https:// only)' });
      return;
    }
    if (typeof putUrl !== 'string' || !/^https?:\/\//.test(putUrl)) {
      res.status(400).json({ error: 'putUrl required (http:// or https:// only)' });
      return;
    }
    if (typeof putContentType !== 'string' || putContentType.length === 0) {
      res.status(400).json({ error: 'putContentType required' });
      return;
    }

    // Fetch source bytes via the presigned GET URL. No AWS SDK, no creds.
    let source: Buffer;
    try {
      const sourceRes = await fetchImpl(sourceUrl);
      if (!sourceRes.ok) {
        res.status(502).json({ error: `s3 get failed: ${sourceRes.status}` });
        return;
      }
      const cl = sourceRes.headers.get('content-length');
      if (cl !== null && /^\d+$/.test(cl) && parseInt(cl, 10) > videoMaxBytes) {
        res.status(413).json({ error: 'source object exceeds videoMaxBytes' });
        return;
      }
      const ab = await sourceRes.arrayBuffer();
      source = Buffer.from(ab);
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
      // Drop the source reference before the PUT so the GC can reclaim it
      // while we hold the (similarly sized) transcoded buffer.
      source = Buffer.alloc(0);
      const putRes = await fetchImpl(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': putContentType },
        body: result.bytes as unknown as BodyInit,
      });
      if (!putRes.ok) {
        const errBody = await putRes.text().catch(() => '');
        next(new Error(`s3 put failed: ${putRes.status} ${errBody.slice(0, 200)}`));
        return;
      }
      res.status(200).json({
        ok: true,
        outputKey: typeof outputKey === 'string' ? outputKey : undefined,
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
    requireInternalSecret,
    express.raw({ type: 'application/octet-stream', limit: AVATAR_MAX_BYTES }),
    (req, res, next) => runProcess(req, res, next, processAvatarFn),
  );

  app.post(
    '/process/photo',
    requireInternalSecret,
    express.raw({ type: 'application/octet-stream', limit: PHOTO_MAX_BYTES }),
    (req, res, next) => runProcess(req, res, next, processPhotoFn),
  );

  // Endpoint name kept generic on the `image`-named container: this worker is
  // a media-processing worker by capability; renaming the container would
  // churn terraform, compose, and IMAGE_* env vars for no functional gain.
  app.post(
    '/process/video',
    requireInternalSecret,
    express.raw({ type: 'application/octet-stream', limit: videoMaxBytes }),
    runVideoProcess,
  );

  // Memory-efficient counterpart to /process/video. JSON body carries presigned
  // GET + PUT URLs (no buffered source payload, no AWS credentials needed in
  // this container). Limit raised to 16 KB to comfortably accommodate two
  // ~2 KB presigned URLs plus metadata.
  app.post(
    '/process/video-from-storage',
    requireInternalSecret,
    express.json({ limit: '16kb' }),
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
