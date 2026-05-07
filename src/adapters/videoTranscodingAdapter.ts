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

export type { TranscodedVideo } from '../lib/videoProcessing';

export interface VideoTranscodingAdapter {
  transcode(data: Buffer): Promise<TranscodedVideo>;
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
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): VideoTranscodingAdapter {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 300000;

  async function callWorker(data: Buffer): Promise<TranscodedVideo> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/process/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
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

  return {
    transcode: (data) => callWorker(data),
  };
}

let singleton: VideoTranscodingAdapter | null = null;

export function getVideoTranscodingAdapter(): VideoTranscodingAdapter {
  if (!singleton) {
    singleton = createHttpVideoTranscodingAdapter({
      baseUrl: config.videoProcessorUrl,
      timeoutMs: config.videoTranscodeTimeoutMs,
    });
  }
  return singleton;
}

export function setVideoTranscodingAdapterForTests(adapter: VideoTranscodingAdapter): void {
  singleton = adapter;
}

export function resetVideoTranscodingAdapterForTests(): void {
  singleton = null;
}
