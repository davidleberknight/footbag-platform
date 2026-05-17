/**
 * /ipc/job-events: receive media-job state transitions from the worker
 * container and republish them onto the web-process in-memory event bus so
 * SSE-connected admin status pages see them in near-real-time.
 *
 * /ipc is the inter-process channel: machine-to-machine, shared-secret auth
 * (X-Internal-Secret header), no human session. Distinct from /internal,
 * which is admin-session-authed QC tooling. The endpoint is reachable only
 * from the docker-internal network in production (nginx drops /ipc/* from
 * public traffic). The shared secret is the second line of defense: even if
 * the route reaches the public side, nothing without the secret can publish.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { publishJobEvent, type JobEventState } from '../services/jobEventBus';

const SECRET_HEADER = 'x-internal-secret';

function isJobEventState(value: unknown): value is JobEventState {
  return value === 'claimed' || value === 'succeeded' || value === 'failed';
}

export const ipcController = {
  receiveJobEvent(req: Request, res: Response, next: NextFunction): void {
    try {
      const secret = config.internalEventSecret;
      if (!secret) {
        res.status(503).json({ error: 'INTERNAL_EVENT_SECRET not configured' });
        return;
      }
      if (req.header(SECRET_HEADER) !== secret) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const body = req.body as {
        jobId?: unknown;
        state?: unknown;
        mediaId?: unknown;
        errorMessage?: unknown;
        occurredAtIso?: unknown;
      };
      if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
        res.status(400).json({ error: 'jobId required' });
        return;
      }
      if (!isJobEventState(body.state)) {
        res.status(400).json({ error: `invalid state: ${String(body.state)}` });
        return;
      }
      publishJobEvent({
        jobId: body.jobId,
        state: body.state,
        mediaId: typeof body.mediaId === 'string' ? body.mediaId : undefined,
        errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
        occurredAtIso:
          typeof body.occurredAtIso === 'string'
            ? body.occurredAtIso
            : new Date().toISOString(),
      });
      logger.info('ipc job-event received', {
        jobId: body.jobId,
        state: body.state,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
};
