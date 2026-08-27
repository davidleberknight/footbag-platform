/**
 * Client used by the web container to push a media-job dispatch to the
 * worker container's /transcode/dispatch endpoint over the docker internal
 * network.
 *
 * Exists as a service for two reasons:
 *   1. Single source of truth for the URL, secret header, and error mapping.
 *   2. Test seam — route tests inject a fake client via
 *      setTranscodeDispatchClientForTests so they don't require a running
 *      worker container.
 */
import { config } from '../config/env';

export interface TranscodeDispatchClient {
  dispatch(jobId: string): Promise<void>;
}

export class TranscodeDispatchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TranscodeDispatchError';
  }
}

/**
 * Ceiling on the dispatch push. The worker claims the row and answers 202
 * before it starts any work, so a healthy dispatch returns in milliseconds and
 * this only ever fires on a worker that accepted the connection and then went
 * quiet. Without it the admin's finalize request stays open on that worker for
 * as long as the proxy chain allows, which reads to the admin as a hung upload
 * rather than a worker fault.
 */
const DISPATCH_TIMEOUT_MS = 10_000;

export function createTranscodeDispatchClient(
  opts: { timeoutMs?: number } = {},
): TranscodeDispatchClient {
  const url = `${config.workerInternalUrl.replace(/\/$/, '')}/transcode/dispatch`;
  const timeoutMs = opts.timeoutMs ?? DISPATCH_TIMEOUT_MS;
  return {
    async dispatch(jobId: string): Promise<void> {
      const secret = config.internalEventSecret;
      if (!secret) {
        throw new TranscodeDispatchError(
          'INTERNAL_EVENT_SECRET not configured; cannot dispatch to worker',
        );
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret,
          },
          body: JSON.stringify({ jobId }),
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          throw new TranscodeDispatchError(
            `worker dispatch timed out after ${timeoutMs}ms`,
          );
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new TranscodeDispatchError(`worker dispatch transport failure: ${msg}`);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new TranscodeDispatchError(
          `worker dispatch returned ${res.status}: ${body}`,
          res.status,
        );
      }
    },
  };
}

let singleton: TranscodeDispatchClient | null = null;

export function getTranscodeDispatchClient(): TranscodeDispatchClient {
  if (!singleton) singleton = createTranscodeDispatchClient();
  return singleton;
}

export function setTranscodeDispatchClientForTests(client: TranscodeDispatchClient): void {
  singleton = client;
}

export function resetTranscodeDispatchClientForTests(): void {
  singleton = null;
}
