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

export function createTranscodeDispatchClient(): TranscodeDispatchClient {
  const url = `${config.workerInternalUrl.replace(/\/$/, '')}/transcode/dispatch`;
  return {
    async dispatch(jobId: string): Promise<void> {
      const secret = config.internalEventSecret;
      if (!secret) {
        throw new TranscodeDispatchError(
          'INTERNAL_EVENT_SECRET not configured; cannot dispatch to worker',
        );
      }
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret,
          },
          body: JSON.stringify({ jobId }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TranscodeDispatchError(`worker dispatch transport failure: ${msg}`);
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
