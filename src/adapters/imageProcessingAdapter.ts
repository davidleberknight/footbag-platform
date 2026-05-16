/**
 * ImageProcessingAdapter: HTTP boundary to the `image` worker container.
 *
 * Single production code path -- there is no in-process variant. Tests inject
 * `fetchImpl` (the same shape as `LiveSesAdapter`'s `sesClient` injection) and
 * the fake fetch invokes the real Sharp pipeline inline so test fixtures still
 * produce real processed bytes. Same adapter code path runs in tests, local
 * dev (`npm run dev:image` on localhost:4001), compose dev (image:4000),
 * staging, and prod.
 */
import { config } from '../config/env';
import type { ProcessedImage } from '../lib/imageProcessing';

export interface ImageProcessingAdapter {
  processAvatar(data: Buffer): Promise<ProcessedImage>;
  processPhoto(data: Buffer): Promise<ProcessedImage>;
}

export class ImageProcessingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

interface ProcessImageResponse {
  thumb: string;
  display: string;
  widthPx: number;
  heightPx: number;
}

export function createHttpImageAdapter(opts: {
  baseUrl: string;
  internalSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): ImageProcessingAdapter {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const internalSecret = opts.internalSecret;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30000;

  async function callWorker(endpoint: '/process/avatar' | '/process/photo', data: Buffer): Promise<ProcessedImage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      // Node's fetch accepts Buffer at runtime, but TS lib.dom's BodyInit
      // omits it. Cast through unknown to keep the call site readable without
      // copying bytes.
      res = await fetchImpl(`${baseUrl}${endpoint}`, {
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
        throw new ImageProcessingError(`image worker timed out after ${timeoutMs}ms`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ImageProcessingError(`image worker request failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 400) {
        throw new ImageProcessingError(`image worker rejected image type: ${body}`, 400);
      }
      throw new ImageProcessingError(
        `image worker returned ${res.status}: ${body}`,
        res.status,
      );
    }

    const json = (await res.json()) as ProcessImageResponse;
    return {
      thumb: Buffer.from(json.thumb, 'base64'),
      display: Buffer.from(json.display, 'base64'),
      widthPx: json.widthPx,
      heightPx: json.heightPx,
    };
  }

  return {
    processAvatar: (data) => callWorker('/process/avatar', data),
    processPhoto: (data) => callWorker('/process/photo', data),
  };
}

let singleton: ImageProcessingAdapter | null = null;

function resolveSingleton(): ImageProcessingAdapter {
  if (!singleton) {
    const internalSecret = config.internalEventSecret;
    if (!internalSecret) {
      throw new Error(
        'INTERNAL_EVENT_SECRET not configured; cannot reach image worker',
      );
    }
    singleton = createHttpImageAdapter({
      baseUrl: config.imageProcessorUrl,
      internalSecret,
      timeoutMs: config.imageProcessTimeoutMs,
    });
  }
  return singleton;
}

// Lazy proxy: resolution of the underlying singleton (and the
// INTERNAL_EVENT_SECRET fail-fast check) is deferred to the first
// process call. Read paths (gallery list, browse pages) that build a
// service depending on this adapter but never invoke a process method
// must succeed even when the secret is absent, so getting the adapter
// must not throw.
export function getImageProcessingAdapter(): ImageProcessingAdapter {
  return {
    processAvatar: (data) => resolveSingleton().processAvatar(data),
    processPhoto: (data) => resolveSingleton().processPhoto(data),
  };
}

export function setImageProcessingAdapterForTests(adapter: ImageProcessingAdapter): void {
  singleton = adapter;
}

export function resetImageProcessingAdapterForTests(): void {
  singleton = null;
}
