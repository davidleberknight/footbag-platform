/**
 * Web-side client that reads the worker container's stub-captured outbound
 * email over the docker internal network.
 *
 * The email-outbox drain loop runs in the worker container, so messages it
 * sends through StubSesAdapter land in the worker process's in-memory buffer,
 * not the web process's. GET /dev/outbox (web) fetches this endpoint to merge
 * those worker-captured messages into its view; without it a tester never sees
 * notifications that have no host page (tier change, vouch, etc.).
 *
 * Best-effort by contract: any transport or worker error resolves to an empty
 * list (logged at warn), never throws. The viewer is a dev convenience and a
 * worker hiccup must not 500 the page. A test seam injects a fake client so
 * route tests need no running worker container.
 */
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface CapturedEmail {
  to: string;
  subject: string;
  bodyText: string;
  from?: string;
  messageId: string;
  deliveredAt: string;
}

export interface DevOutboxCaptureClient {
  fetchWorkerCaptured(): Promise<CapturedEmail[]>;
}

export function createDevOutboxCaptureClient(): DevOutboxCaptureClient {
  const url = `${config.workerInternalUrl.replace(/\/$/, '')}/dev/outbox-capture`;
  return {
    async fetchWorkerCaptured(): Promise<CapturedEmail[]> {
      const secret = config.internalEventSecret;
      if (!secret) return [];
      try {
        const res = await fetch(url, { headers: { 'x-internal-secret': secret } });
        if (!res.ok) {
          logger.warn('devOutboxCapture: worker returned non-ok status', { status: res.status });
          return [];
        }
        const body = (await res.json()) as { messages?: CapturedEmail[] };
        return Array.isArray(body.messages) ? body.messages : [];
      } catch (err) {
        logger.warn('devOutboxCapture: worker fetch failed; showing web-local buffer only', {
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    },
  };
}

let singleton: DevOutboxCaptureClient | null = null;

export function getDevOutboxCaptureClient(): DevOutboxCaptureClient {
  if (!singleton) singleton = createDevOutboxCaptureClient();
  return singleton;
}

export function setDevOutboxCaptureClientForTests(client: DevOutboxCaptureClient): void {
  singleton = client;
}

export function resetDevOutboxCaptureClientForTests(): void {
  singleton = null;
}
