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
import { systemAlarmService } from '../services/systemAlarmService';
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
   * signature against the AWS signing certificate, which also pins the
   * publishing topic. The query string lands in instance access logs on every
   * delivery, so the URL key alone must not be enough to forge a
   * bounce/complaint. The signature alone does not close that either: it proves
   * only that some SNS topic in some AWS account signed the payload, which is
   * why the expected TopicArn is checked alongside it, per AWS's own guidance.
   * The key is deliberately not INTERNAL_EVENT_SECRET: a leak there must
   * not extend to the worker IPC endpoints.
   *
   * An unconfigured key answers 401 quietly. It must not log at error level:
   * this endpoint is reachable by anyone on the internet and an error line is
   * escalated to the operator mailbox, so an error-level log here would let a
   * scanner page a human. A warning line records it instead, and the
   * environment verifier the operator runs at deploy time is what actually
   * catches a feed whose key was never installed.
   */
  async receiveSesFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const secret = config.sesFeedbackWebhookKey;
      if (!secret) {
        logger.warn('ses_feedback.webhook_key_unconfigured');
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const provided = Buffer.from(typeof req.query.key === 'string' ? req.query.key : '');
      const expected = Buffer.from(secret);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const rawBody = typeof req.body === 'string' ? req.body : (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
      if (!(await verifySnsSignature(rawBody, config.sesFeedbackTopicArn))) {
        logger.warn('ses_feedback.signature_rejected');
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const result = sesFeedbackService.processSnsMessage(rawBody);
      logger.warn('ses_feedback.received', { result: result.status });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Platform-alarm webhook (mounted on the PUBLIC router, for the same reason
   * the feedback webhook is: the notification service posts from the internet
   * and nginx drops the internal channel from public traffic). The two auth
   * layers match that endpoint exactly -- a dedicated shared secret carried as
   * a query key in the subscription URL and compared timing-safe, then
   * verification of the payload signature against the signing certificate,
   * which also pins the publishing topic. The query string lands in access logs
   * on every delivery, so the key must not be sufficient on its own to forge an
   * alarm; neither is the signature, which proves only that some SNS topic in
   * some AWS account signed the payload, so the expected TopicArn is checked
   * alongside it per AWS's own guidance. Together they are sufficient. The key
   * is separate from every other secret so a leak here reaches nothing else.
   *
   * An unconfigured key answers 401 quietly, for the reason given on the
   * feedback handler above: an unauthenticated caller must not be able to
   * choose the log level on an endpoint whose error lines page an operator.
   *
   * A failure inside the service is deliberately left to propagate: the
   * notification service retries a delivery it does not see succeed, and a
   * transient database error is exactly the case where a retry is wanted.
   */
  async receiveAlarmNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const secret = config.alarmWebhookKey;
      if (!secret) {
        logger.warn('alarm_feed.webhook_key_unconfigured');
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const provided = Buffer.from(typeof req.query.key === 'string' ? req.query.key : '');
      const expected = Buffer.from(secret);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const rawBody = typeof req.body === 'string'
        ? req.body
        : (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
      if (!(await verifySnsSignature(rawBody, config.alarmTopicArn))) {
        logger.warn('alarm_feed.signature_rejected');
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const result = systemAlarmService.processSnsMessage(rawBody);
      logger.warn('alarm_feed.received', { result: result.status });
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
