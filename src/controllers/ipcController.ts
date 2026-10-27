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

export const ipcController = {
  receiveJobEvent(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = publishWorkerJobEvent(req.body);
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
