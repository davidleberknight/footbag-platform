/**
 * /ipc/job-events: receive media-job state transitions from the worker
 * container and republish them onto the web-process in-memory event bus so
 * SSE-connected admin status pages see them in near-real-time.
 *
 * /ipc is the inter-process channel: machine-to-machine, shared-secret auth
 * (X-Internal-Secret header, checked by route middleware), no human session.
 * The endpoint is reachable only from the docker-internal network in production
 * (nginx drops /ipc/* from public traffic). The shared secret is the second
 * line of defense: even if the route reaches the public side, nothing without
 * the secret can publish.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { publishWorkerJobEvent } from '../services/jobEventBus';
import { z } from 'zod';
import { parseFormBody } from '../lib/parseFormBody';

// The worker's JSON event. The schema names the fields an event carries and
// drops any other; each field's type and content are the event bus's to check,
// which it already does and reports as an invalid event.
const jobEventBody = z.object({
  jobId: z.unknown().optional(),
  state: z.unknown().optional(),
  mediaId: z.unknown().optional(),
  errorMessage: z.unknown().optional(),
  occurredAtIso: z.unknown().optional(),
});

export const ipcController = {
  receiveJobEvent(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(jobEventBody, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.message });
      return;
    }
    try {
      const result = publishWorkerJobEvent(parsed.data);
      if (result.status === 'invalid') {
        res.status(400).json({ error: result.error });
        return;
      }
      logger.info('ipc job-event received', {
        jobId: result.event.jobId,
        state: result.event.state,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
};
