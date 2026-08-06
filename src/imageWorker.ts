// dotenv MUST be imported first, before any module that reads process.env.
// Matches the order in src/server.ts and src/worker.ts; without this the
// worker spawned by scripts/dev.sh never sees INTERNAL_EVENT_SECRET from
// .env, returns 503 on every authenticated upload, and the web layer
// surfaces it as a misleading "image worker returned 503" failure.
import 'dotenv/config';

/**
 * Image worker entry point.
 *
 * Standalone Express server that wraps the Sharp and ffmpeg pipelines behind
 * an HTTP boundary. Runs as the `image` Docker container in production;
 * locally via `npm run dev:image`. Reads its own env vars directly because
 * it is a separate process from the web app and must not require web-only
 * config (FOOTBAG_DB_PATH, SESSION_SECRET, etc.).
 */
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { detectImageType, ImageRejectedError, processAvatar, processPhoto, type ProcessedImage } from './lib/imageProcessing';
import {
  detectVideoFormat,
  detectVideoFormatFile,
  FFMPEG_STDERR_PUBLIC_LIMIT_BYTES,
  FfmpegExecutionError,
  transcodeCuratorVideo,
  transcodeCuratorVideoFile,
  type TranscodedVideo,
  type VideoTranscodeTuning,
} from './lib/videoProcessing';
import { readHostMemAvailableBytes } from './lib/hostMemory';
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
// Worker-side ceiling sits above the service-side VIDEO_MAX_BYTES so
// service-layer validation stays the user-visible source of truth. The worker's
// higher limit is defense-in-depth, not a separate product cap, and it is
// deliberately not derived from the service value: the worker is a separate
// process that must reject absurd payloads even if it is ever run against a
// mismatched configuration.
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

// The cgroup memory ceiling exactly as deploy configuration hands it to Docker
// (e.g. "256M"). Forwarded into this process solely so a killed encode can name
// the ceiling that stopped it; nothing here enforces it — the container runtime
// does. Absent means unlimited (a dev machine), and the refusal then omits the
// figure.
function parseMemoryLimitEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d+(\.\d+)?[bkmg]?$/i.test(raw)) {
    throw new Error(`${name} must be a Docker memory value like 256M, got: ${raw}`);
  }
  return raw;
}

// Every deploy-time encoder bound this process passes to the transcode library,
// read here rather than there. The library is loaded by a container that is
// given none of the web environment contract, so it reads no environment at all
// and takes its bounds as arguments; this entry point is where the environment
// is allowed to be read. The ranges match what the application config enforces,
// so a value means the same thing whichever process reads it.
function readVideoTuningFromEnv(): VideoTranscodeTuning {
  const preset = process.env.VIDEO_X264_PRESET || undefined;
  if (preset !== undefined && !VALID_X264_PRESETS.has(preset)) {
    throw new Error(
      `VIDEO_X264_PRESET must be a libx264 preset name, got: ${preset}`,
    );
  }
  const threads = parseOptionalIntEnv('VIDEO_X264_THREADS', 1, 16);
  const rcLookahead = parseOptionalIntEnv('VIDEO_X264_RC_LOOKAHEAD', 0, 250);
  const maxHeight = parseOptionalIntEnv('VIDEO_MAX_HEIGHT', 240, 2160);
  const timeoutSeconds = parseOptionalIntEnv('FFMPEG_TIMEOUT_SECONDS', 30, 7200);
  return {
    preset,
    threads,
    rcLookahead,
    maxHeight,
    timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
  };
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
  // Test seam: substitute the file-to-file ffmpeg pipeline used by the
  // from-storage streaming route.
  transcodeVideoFileImpl?: (
    inputPath: string,
    outputPath: string,
    tuning?: VideoTranscodeTuning,
  ) => Promise<{ outputFormat: 'mp4' }>;
  // Test seams for the transcode admission gate: substitute the host-memory
  // reading and the floor it is compared against.
  readMemAvailableBytesImpl?: () => number | null;
  minHostAvailableBytes?: number;
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

// The short user-facing shape of a failed ffmpeg run. A kill from outside the
// process is worded as the container's resource ceiling, not as an
// out-of-memory diagnosis: a SIGKILL does not say who sent it, only that the
// encoder did not fail on its own. The ceiling figure is named when configured
// so the refusal states the limit that was hit.
function composePublicTranscodeError(
  err: FfmpegExecutionError,
  memoryLimitLabel: string | undefined,
): string {
  if (err.kind === 'timeout') {
    return `transcode exceeded the ${Math.round((err.timeoutMs ?? 0) / 1000)}-second encoder time limit`;
  }
  if (err.kind === 'signal') {
    return memoryLimitLabel === undefined
      ? "transcode was stopped by the media container's resource ceiling"
      : `transcode was stopped by the media container's resource ceiling (memory limit ${memoryLimitLabel})`;
  }
  return `ffmpeg exited with code ${err.exitCode}: ${err.stderrTail.slice(-FFMPEG_STDERR_PUBLIC_LIMIT_BYTES)}`;
}

export function createImageWorkerApp(opts: ImageWorkerOptions = {}): express.Express {
  const maxConcurrent =
    opts.maxConcurrent ?? parseIntEnv('IMAGE_MAX_CONCURRENT', 2, 1, 16);
  const semaphoreWaitMs =
    opts.semaphoreWaitMs ?? parseIntEnv('IMAGE_SEMAPHORE_WAIT_MS', 30000, 1, 600000);
  // Video gets its own semaphore: 60-120 s ffmpeg runs would starve sub-second
  // Sharp work on a shared bound. Default 1 is conservative for the image
  // container's memory ceiling; raise IMAGE_VIDEO_MAX_CONCURRENT if the
  // deployment target has headroom.
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
  const transcodeVideoFileFn = opts.transcodeVideoFileImpl ?? transcodeCuratorVideoFile;
  const videoTuning = opts.videoTuning ?? readVideoTuningFromEnv();
  const memoryLimitLabel = parseMemoryLimitEnv('IMAGE_MEMORY_LIMIT');
  const readMemAvailable = opts.readMemAvailableBytesImpl ?? readHostMemAvailableBytes;
  // Transcode admission floor: an encode is refused while the HOST has less
  // than this much memory available, because starting one anyway is how a
  // memory-starved host dies outright instead of answering busy. 0 disables
  // (a dev machine). The floor guards the host, not the container; the cgroup
  // ceiling still bounds the container itself.
  const minHostAvailableBytes =
    opts.minHostAvailableBytes ??
    (parseOptionalIntEnv('VIDEO_MIN_HOST_AVAILABLE_MB', 0, 16384) ?? 128) * 1024 * 1024;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const internalSecret =
    opts.internalSecret !== undefined ? opts.internalSecret : process.env.INTERNAL_EVENT_SECRET;
  const semaphore = new Semaphore(maxConcurrent, semaphoreWaitMs);
  const videoSemaphore = new Semaphore(videoMaxConcurrent, videoSemaphoreWaitMs);

  // 503 when the secret is unconfigured (graceful misconfig signal, the
  // caller knows to skip), 401 on header mismatch (active rejection of an
  // unauthorized caller); the same split every internal endpoint uses.
  // Applied before the body parser on each /process/* route.
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
      // Client-fixable rejections (too small / too large / extreme aspect) are
      // a 400 with a clear message; everything else is a server failure.
      if (err instanceof ImageRejectedError) {
        res.status(400).json({ error: err.message });
      } else {
        next(err);
      }
    } finally {
      semaphore.release();
    }
  }

  // Answers 503 and returns true when the host is too low on memory to admit
  // a transcode. Video routes only: an encode is the one workload here whose
  // spike can starve the host; Sharp inputs are small and bounded.
  function refuseIfHostMemoryLow(res: Response): boolean {
    if (minHostAvailableBytes <= 0) return false;
    const availableBytes = readMemAvailable();
    if (availableBytes === null) {
      // Fail open: an unreadable /proc/meminfo is a platform anomaly, not a
      // pressure signal, and refusing on it would hard-disable the video
      // pipeline with no operator lever. The cgroup ceiling, host swap, and
      // the streaming path remain as independent backstops.
      process.stderr.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          msg: 'transcode admission: host meminfo unreadable, admitting',
        }) + '\n',
      );
      return false;
    }
    if (availableBytes < minHostAvailableBytes) {
      process.stderr.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          msg: 'transcode admission: refused, host memory below floor',
          availableBytes,
          floorBytes: minHostAvailableBytes,
        }) + '\n',
      );
      res.set('Retry-After', '60');
      res.status(503).json({ error: 'host memory below transcode admission floor' });
      return true;
    }
    return false;
  }

  async function runVideoProcess(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (refuseIfHostMemoryLow(res)) return;
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

  // Memory-efficient transcode path: streams source bytes from a presigned GET
  // URL to a temp file, runs ffmpeg file-to-file, and streams the output file
  // to a presigned PUT URL. No AWS credentials live in this worker; it sees
  // only opaque http(s) URLs (SEC-D02).
  //
  // No video bytes are ever held whole in this process: peak memory is the
  // Node baseline plus the encoder child's working set, independent of file
  // size. The temp files live on the container's overlay filesystem (disk),
  // where they cost storage, not cgroup memory.
  //
  // `outputKey` is echoed in the response for audit-log correlation but is
  // otherwise unused (SEC-A17: S3 path semantics never reach this worker).
  async function runVideoProcessFromStorage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (refuseIfHostMemoryLow(res)) return;
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

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'curator-video-'));
    const inputPath = path.join(tmpDir, 'in.bin');
    const outputPath = path.join(tmpDir, 'out.mp4');
    try {
      // Stream the source to disk with a running byte cap. The content-length
      // pre-check refuses an honestly-labelled oversize early; the counter is
      // the enforcement, because a header can lie or be absent.
      let receivedBytes = 0;
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
        if (!sourceRes.body) {
          res.status(502).json({ error: 's3 get failed: empty response body' });
          return;
        }
        const byteCap = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            receivedBytes += chunk.length;
            if (receivedBytes > videoMaxBytes) {
              cb(new Error('videoMaxBytes exceeded'));
              return;
            }
            cb(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(sourceRes.body as import('node:stream/web').ReadableStream),
          byteCap,
          createWriteStream(inputPath),
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'videoMaxBytes exceeded') {
          res.status(413).json({ error: 'source object exceeds videoMaxBytes' });
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        res.status(502).json({ error: `s3 get failed: ${msg}` });
        return;
      }
      if (receivedBytes === 0) {
        res.status(400).json({ error: 'source object is empty' });
        return;
      }
      if (!(await detectVideoFormatFile(inputPath))) {
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
        const result = await transcodeVideoFileFn(inputPath, outputPath, videoTuning);
        const { size } = await stat(outputPath);
        // Explicit Content-Length: undici omits it for stream bodies, and a
        // presigned S3 PUT accepts no chunked transfer. The length is not part
        // of the signed request (only host and content-type are), so supplying
        // it from the finished file is valid.
        const putRes = await fetchImpl(putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': putContentType, 'Content-Length': String(size) },
          body: Readable.toWeb(createReadStream(outputPath)) as unknown as BodyInit,
          duplex: 'half',
        } as RequestInit);
        if (!putRes.ok) {
          const errBody = await putRes.text().catch(() => '');
          next(new Error(`s3 put failed: ${putRes.status} ${errBody.slice(0, 200)}`));
          return;
        }
        res.status(200).json({
          ok: true,
          outputKey: typeof outputKey === 'string' ? outputKey : undefined,
          outputFormat: result.outputFormat,
          outputBytes: size,
        });
      } catch (err: unknown) {
        next(err);
      } finally {
        videoSemaphore.release();
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
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
    // A failed ffmpeg run splits into two audiences. The full stderr tail and
    // classification go to the worker log for the operator; the response body
    // carries only a short refusal, because everything in it travels verbatim
    // to the curator's screen and encoder output must stay bounded there and
    // free of container internals. The structured logger is unreachable from
    // this process (it loads the web config), so the file's NDJSON convention
    // applies.
    if (err instanceof FfmpegExecutionError) {
      process.stderr.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          msg: 'ffmpeg run failed',
          kind: err.kind,
          exitCode: err.exitCode,
          signal: err.signal,
          timeoutMs: err.timeoutMs,
          stderrTail: err.stderrTail,
        }) + '\n',
      );
      res.status(500).json({ error: composePublicTranscodeError(err, memoryLimitLabel) });
      return;
    }
    res.status(500).json({ error: err.message || 'image processing failed' });
  });

  return app;
}

// An OOM-killed or crashed run leaks its temp directory into the container's
// writable layer, and `restart: always` restarts the process without
// recreating the container, so leaks accumulate across restarts. Swept at
// process start only (never in createImageWorkerApp, which tests construct
// concurrently while their own temp dirs are live). Best-effort.
async function sweepStaleTranscodeTempDirs(): Promise<void> {
  const entries = await readdir(os.tmpdir(), { withFileTypes: true }).catch(
    () => [] as import('node:fs').Dirent[],
  );
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith('curator-video-'))
      .map((e) =>
        rm(path.join(os.tmpdir(), e.name), { recursive: true, force: true }).catch(
          () => undefined,
        ),
      ),
  );
}

/* c8 ignore start -- standalone entry block, exercised by `npm run dev:image` */
if (require.main === module) {
  const port = parseIntEnv('IMAGE_PORT', 4000, 1, 65535);
  const app = createImageWorkerApp();
  void sweepStaleTranscodeTempDirs();
  app.listen(port, () => {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'image worker listening', port }) + '\n',
    );
  });
}
/* c8 ignore stop */
