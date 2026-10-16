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

function isJobEventState(value: unknown): value is JobEventState {
  return value === 'claimed' || value === 'retrying' || value === 'succeeded' || value === 'failed';
}

/**
 * Validate a state transition as the worker reported it and publish it. A
 * report without a job id or with an unknown state is refused with the reason,
 * and nothing is published. Optional fields of the wrong type are dropped, and
 * a missing timestamp is stamped with the time of receipt.
 */
export function publishWorkerJobEvent(
  raw: unknown,
): { status: 'published'; event: JobEvent } | { status: 'invalid'; error: string } {
  const body = (raw ?? {}) as {
    jobId?: unknown;
    state?: unknown;
    mediaId?: unknown;
    errorMessage?: unknown;
    occurredAtIso?: unknown;
  };
  if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
    return { status: 'invalid', error: 'jobId required' };
  }
  if (!isJobEventState(body.state)) {
    return { status: 'invalid', error: `invalid state: ${String(body.state)}` };
  }
  const event: JobEvent = {
    jobId: body.jobId,
    state: body.state,
    mediaId: typeof body.mediaId === 'string' ? body.mediaId : undefined,
    errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
    occurredAtIso:
      typeof body.occurredAtIso === 'string' ? body.occurredAtIso : new Date().toISOString(),
  };
  publishJobEvent(event);
  return { status: 'published', event };
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
