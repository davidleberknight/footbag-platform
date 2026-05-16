/**
 * VideoTranscodingAdapter: HTTP boundary to the `image` worker container's
 * `/process/video` endpoint. Mirrors the ImageProcessingAdapter shape -- one
 * production code path, no in-process variant. The web container does not
 * install ffmpeg; the worker does, and this adapter is how the web process
 * reaches it.
 *
 * The container is named `image` for historical reasons; its capability is
 * media processing (Sharp + ffmpeg). Endpoint name `/process/video` is
 * deliberate; renaming the container would churn terraform, compose, and
 * IMAGE_* env vars for no functional gain.
 *
 * The transcoded mp4 is returned base64-encoded to mirror the Sharp
 * response shape. On a same-host Docker network the ~33% wire inflation
 * is the cost of pattern consistency; future optimization candidate is a
 * binary response with outputFormat in a header.
 */
import { config } from '../config/env';
import type { TranscodedVideo } from '../lib/videoProcessing';
import { getMediaStorageAdapter, type MediaStorageAdapter } from './mediaStorageAdapter';

export type { TranscodedVideo } from '../lib/videoProcessing';

// 5 minutes is comfortably more than any realistic image-worker dispatch +
// fetch round-trip and well under any TTL ceiling. Worker-internal use only;
// not user-facing.
const PRESIGN_TTL_SECONDS_DEFAULT = 300;

const PUT_CONTENT_TYPE_VIDEO = 'video/mp4';

export interface VideoTranscodeFromStorageResult {
  outputKey: string;
  outputFormat: 'mp4';
  outputBytes: number;
}

export interface VideoTranscodingAdapter {
  /**
   * Bytes-in / bytes-out variant. Caller holds the full source buffer in its
   * own process memory; the response carries the transcoded bytes. Acceptable
   * for tests and small inputs but OOMs the worker container on real curator
   * uploads. Prefer transcodeFromStorage for any path where the bytes already
   * live in S3.
   */
  transcode(data: Buffer): Promise<TranscodedVideo>;

  /**
   * The image worker fetches sourceKey from S3, transcodes, and uploads the
   * result to outputKey. Source bytes never traverse the caller's process,
   * which keeps the worker container's RSS bounded by its dispatch overhead
   * rather than the video size. Used by curatorMediaService.finalizeTranscodeForJob.
   */
  transcodeFromStorage(
    sourceKey: string,
    outputKey: string,
  ): Promise<VideoTranscodeFromStorageResult>;
}

export class VideoTranscodingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'VideoTranscodingError';
  }
}

interface TranscodeVideoResponse {
  bytes: string;
  outputFormat: 'mp4';
}

export function createHttpVideoTranscodingAdapter(opts: {
  baseUrl: string;
  mediaStorage: MediaStorageAdapter;
  internalSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  presignTtlSeconds?: number;
}): VideoTranscodingAdapter {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const mediaStorage = opts.mediaStorage;
  const internalSecret = opts.internalSecret;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 300000;
  const presignTtl = opts.presignTtlSeconds ?? PRESIGN_TTL_SECONDS_DEFAULT;

  async function callWorker(data: Buffer): Promise<TranscodedVideo> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/process/video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-internal-secret': internalSecret,
        },
        body: data as unknown as BodyInit,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new VideoTranscodingError(`video worker timed out after ${timeoutMs}ms`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new VideoTranscodingError(`video worker request failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 400) {
        throw new VideoTranscodingError(`video worker rejected video: ${body}`, 400);
      }
      throw new VideoTranscodingError(
        `video worker returned ${res.status}: ${body}`,
        res.status,
      );
    }

    const json = (await res.json()) as TranscodeVideoResponse;
    return {
      bytes: Buffer.from(json.bytes, 'base64'),
      outputFormat: json.outputFormat,
    };
  }

  async function callWorkerFromStorage(
    sourceKey: string,
    outputKey: string,
  ): Promise<VideoTranscodeFromStorageResult> {
    // Presign GET (source) and PUT (output) so the image container handles
    // opaque, time-bounded URLs only — no AWS credentials in that container.
    // Web container retains credentials for the presign step. SEC-D02.
    const [sourceUrl, putUrl] = await Promise.all([
      mediaStorage.generatePresignedGetUrl(sourceKey, presignTtl),
      mediaStorage.generatePresignedPutUrl(outputKey, PUT_CONTENT_TYPE_VIDEO, presignTtl),
    ]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/process/video-from-storage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({
          sourceUrl,
          putUrl,
          putContentType: PUT_CONTENT_TYPE_VIDEO,
          // outputKey is echoed in the worker's response for caller-side audit
          // log convenience; the worker itself has no S3 path semantics.
          outputKey,
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new VideoTranscodingError(`video worker timed out after ${timeoutMs}ms`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new VideoTranscodingError(`video worker request failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 400) {
        throw new VideoTranscodingError(`video worker rejected job: ${body}`, 400);
      }
      throw new VideoTranscodingError(
        `video worker returned ${res.status}: ${body}`,
        res.status,
      );
    }

    const json = (await res.json()) as VideoTranscodeFromStorageResult;
    return json;
  }

  return {
    transcode: (data) => callWorker(data),
    transcodeFromStorage: (sourceKey, outputKey) =>
      callWorkerFromStorage(sourceKey, outputKey),
  };
}

let singleton: VideoTranscodingAdapter | null = null;

function resolveSingleton(): VideoTranscodingAdapter {
  if (!singleton) {
    const internalSecret = config.internalEventSecret;
    if (!internalSecret) {
      throw new Error(
        'INTERNAL_EVENT_SECRET not configured; cannot reach video worker',
      );
    }
    singleton = createHttpVideoTranscodingAdapter({
      baseUrl: config.videoProcessorUrl,
      mediaStorage: getMediaStorageAdapter(),
      internalSecret,
      timeoutMs: config.videoTranscodeTimeoutMs,
    });
  }
  return singleton;
}

// Lazy proxy: same rationale as `getImageProcessingAdapter`. The getter
// returns a thin adapter object whose methods defer underlying singleton
// resolution (and the INTERNAL_EVENT_SECRET check) to the first transcode
// call. Read paths that never invoke a transcode method must not trigger
// resolution.
export function getVideoTranscodingAdapter(): VideoTranscodingAdapter {
  return {
    transcode: (data) => resolveSingleton().transcode(data),
    transcodeFromStorage: (sourceKey, outputKey) =>
      resolveSingleton().transcodeFromStorage(sourceKey, outputKey),
  };
}

export function setVideoTranscodingAdapterForTests(adapter: VideoTranscodingAdapter): void {
  singleton = adapter;
}

export function resetVideoTranscodingAdapterForTests(): void {
  singleton = null;
}
