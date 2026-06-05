/**
 * Web-side in-process pub/sub for media-job state changes.
 *
 * The image worker HTTP-pushes state transitions to /ipc/job-events on
 * the web container. That controller calls publishJobEvent here. SSE handlers
 * for /admin/curator/upload/jobs/:jobId/events call subscribeToJobEvents to
 * stream events back to a connected admin browser.
 *
 * Single web container today; if web ever scales horizontally, this needs
 * fan-out across instances (e.g. sticky-session SSE or a Redis pub/sub seam).
 * Out of scope for v1 since the staging and production hosts each run a
 * single web replica.
 */
import { EventEmitter } from 'node:events';

export type JobEventState = 'claimed' | 'retrying' | 'succeeded' | 'failed';

export interface JobEvent {
  jobId: string;
  state: JobEventState;
  mediaId?: string;
  errorMessage?: string;
  occurredAtIso: string;
}

const emitter = new EventEmitter();
// SSE clients are short-lived but each holds a listener. 50 covers worst-case
// admin tabs across staging without warning noise; bump if production scales.
emitter.setMaxListeners(50);

const EVENT_NAME = 'job-event';

export function publishJobEvent(event: JobEvent): void {
  emitter.emit(EVENT_NAME, event);
}

export type JobEventListener = (event: JobEvent) => void;

/**
 * Subscribe to events for a specific job id. Returns an unsubscribe function;
 * SSE handlers MUST call it when the connection closes to avoid leaking
 * listeners.
 */
export function subscribeToJobEvents(
  jobId: string,
  listener: JobEventListener,
): () => void {
  const wrapped: JobEventListener = (event) => {
    if (event.jobId === jobId) listener(event);
  };
  emitter.on(EVENT_NAME, wrapped);
  return () => emitter.off(EVENT_NAME, wrapped);
}

export function listenerCountForTests(): number {
  return emitter.listenerCount(EVENT_NAME);
}
