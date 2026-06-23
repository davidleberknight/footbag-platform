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
import * as crypto from 'crypto';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { publishJobEvent, type JobEventState } from '../services/jobEventBus';
import { sesFeedbackService } from '../services/sesFeedbackService';
import { verifySnsSignature } from '../lib/snsSignature';

const SECRET_HEADER = 'x-internal-secret';

function isJobEventState(value: unknown): value is JobEventState {
  return value === 'claimed' || value === 'retrying' || value === 'succeeded' || value === 'failed';
}

export const ipcController = {
  /**
   * SES feedback webhook (mounted on the PUBLIC router: SNS posts from the
   * internet, and nginx drops /ipc/* from public traffic). Two auth layers:
   * a dedicated shared secret embedded as a query key in the subscription
   * endpoint URL, compared timing-safe, then verification of the SNS payload
   * signature against the AWS signing certificate. The query string lands in
   * instance access logs on every delivery, so the URL key alone must not be
   * enough to forge a bounce/complaint; the signature check closes that.
   * The key is deliberately not INTERNAL_EVENT_SECRET: a leak there must
   * not extend to the worker IPC endpoints.
   */
  async receiveSesFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const secret = config.sesFeedbackWebhookKey;
      if (!secret) {
        logger.error('ses_feedback.webhook_key_unconfigured');
        res.status(500).json({ error: 'SES_FEEDBACK_WEBHOOK_KEY not configured' });
        return;
      }
      const provided = Buffer.from(typeof req.query.key === 'string' ? req.query.key : '');
      const expected = Buffer.from(secret);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const rawBody = typeof req.body === 'string' ? req.body : (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
      if (!(await verifySnsSignature(rawBody))) {
        logger.warn('ses_feedback.signature_rejected');
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const result = sesFeedbackService.processSnsMessage(rawBody);
      logger.info('ses_feedback.received', { result: result.status });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  receiveJobEvent(req: Request, res: Response, next: NextFunction): void {
    try {
      const secret = config.internalEventSecret;
      if (!secret) {
        res.status(503).json({ error: 'INTERNAL_EVENT_SECRET not configured' });
        return;
      }
      const provided = Buffer.from(req.header(SECRET_HEADER) ?? '');
      const expected = Buffer.from(secret);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
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
