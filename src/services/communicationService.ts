/**
 * CommunicationService -- the email outbox: enqueue, fan-out, and SES drain.
 *
 * Owns:
 *   - Outbox enqueue with idempotency-key dedupe (plus the strict
 *     enqueueEmailOrFail variant that maps transport failure to a typed 503)
 *   - The mailbox suppression gate: a best-effort enqueue whose target
 *     address is a member's current notification mailbox with a non-ok
 *     email_status is suppressed, so a bounced or complained address never
 *     receives routine mail again. Strict sends bypass the gate: they are
 *     rare, member-initiated security signals where non-delivery is its own
 *     risk, and refusing them loudly would let an anti-enumeration surface
 *     answer differently for a known-and-bounced address.
 *   - Mailing-list fan-out (one outbox row per active, verified, deliverable
 *     subscriber)
 *   - The send-queue drain batch: stale-sending reap, claim, SES send,
 *     retry/backoff/dead-letter/manual-review bookkeeping
 *
 * Does not own:
 *   - Triggering sends (other services enqueue; nothing here decides WHO
 *     gets mail)
 *   - Email content composition (callers pass subject + bodyText)
 *   - Subscription management (rows read via mailing_list_subscriptions only)
 *   - SES credentials/config (SesAdapter)
 *
 * Required patterns:
 *   - Outbox pattern: no service calls SES directly; every send rides an
 *     outbox row drained here.
 *   - body_text is scrubbed to NULL after a successful send so receipt
 *     tokens never persist in DB backups.
 *   - Idempotency key uniqueness collapses duplicate enqueues onto the
 *     original row id.
 *   - Failed attempts back off exponentially via scheduled_for before the
 *     attempt budget dead-letters them; provider throttling and quota
 *     exhaustion wait out a delay WITHOUT consuming an attempt.
 *   - Ambiguous outcomes never auto-retry: an error that leaves delivery
 *     unknowable (timeout or dropped connection mid-call), or a row
 *     stranded in 'sending' past the lease, parks in 'manual_review',
 *     because the provider send has no idempotency token and a retry could
 *     deliver the same email twice.
 *   - scheduled_for defers a row until due (the pending batch filters on it).
 *   - Admin pause flag (email_outbox_paused) halts draining without losing rows.
 *
 * Persistence:
 *   outbox_emails; mailing_list_subscriptions and members_active
 *   (read-only: subscriber fan-out and the suppression lookup).
 *
 * Side effects:
 *   - SES adapter sendEmail per claimed row
 *   - logger.error on dead-letter and on manual-review parking (drives the
 *     CloudWatch alarm)
 *
 * Service shape: factory `createCommunicationService(adapter)` with the
 * `getCommunicationService()` lazy singleton; tests inject a stub adapter.
 */
import { randomUUID } from 'node:crypto';
import { account, outbox, mailingListSubscriptions, type OutboxRow } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { readIntConfig } from './configReader';
import { ServiceError, ServiceUnavailableError, ValidationError } from './serviceErrors';
import { SesAdapter, getSesAdapter } from '../adapters/sesAdapter';

export interface EnqueueEmailInput {
  recipientEmail: string;
  /**
   * Required, and deliberately not optional. Erasure reaches an outbox row
   * through this column and nothing else: a row without it is personal data
   * with no owner, unreachable by any scrub. Every current call site sets it;
   * the type is what stops the next one from not setting it.
   */
  recipientMemberId: string;
  subject: string;
  bodyText: string;
  idempotencyKey?: string;
  scheduledFor?: string;
  mailingListId?: string;
  fromIdentity?: string;
  /** Registered template that produced this email; the compose service stamps it. */
  templateKey?: string | null;
  /**
   * Skips the mailbox suppression gate. Reserved for strict security sends
   * (enqueueEmailOrFail forces it): those flows are member-initiated, rare,
   * and refusing them would either strand the member or let an
   * anti-enumeration surface answer differently for a bounced address.
   */
  bypassSuppression?: boolean;
}

export type EnqueueResult =
  | { id: string; status: 'enqueued' | 'duplicate' }
  | { id: null; status: 'suppressed' };

export interface EnqueueMailingListEmailInput {
  mailingListSlug: string;
  subject: string;
  bodyText: string;
  idempotencyKeyPrefix: string;
  templateKey?: string | null;
}

export interface MailingListEnqueueResult {
  enqueued: number;
  duplicates: number;
}

export interface ProcessBatchResult {
  claimed: number;
  sent: number;
  failed: number;
  deadLettered: number;
  manualReview: number;
  paused: boolean;
}

export interface CommunicationService {
  enqueueEmail(input: EnqueueEmailInput): EnqueueResult;
  /**
   * Strict variant of enqueueEmail: never silently swallows transport-layer
   * failures. ValidationError (bad input) and ConflictError (idempotency-key
   * mismatch on a different row) still propagate as their own classes;
   * everything else is wrapped in ServiceUnavailableError so the controller
   * layer can map it to HTTP 503 + an actionable error message.
   *
   * Use this in any flow where a missing notification is itself a security
   * signal (password change confirmation, account-claim merge notification,
   * auto-link revert acknowledgement). The plain `enqueueEmail` remains for
   * paths where best-effort semantics are explicitly intended; callers MUST
   * NOT wrap calls to this helper in a try/catch that swallows the error.
   */
  enqueueEmailOrFail(input: EnqueueEmailInput): EnqueueResult;
  enqueueMailingListEmail(input: EnqueueMailingListEmailInput): MailingListEnqueueResult;
  processSendQueue(opts?: { limit?: number }): Promise<ProcessBatchResult>;
}

type SendErrorOutcome = 'throttle' | 'ambiguous' | 'failure';

/**
 * Sorts a provider send error into the three outcomes the drain handles
 * differently. Throttle: the provider refused for rate or quota reasons, so
 * the email itself is fine and waits without consuming an attempt. Ambiguous:
 * the connection died in a way that leaves delivery unknowable (the request
 * may have reached the provider), so no automatic retry. Failure: a
 * definitive rejection of this attempt, eligible for backoff retry. Matching
 * is by error name / code shape because the AWS SDK surfaces these as named
 * error classes and node network errors carry syscall codes; anything
 * unrecognized counts as a definitive failure, whose bounded retry budget is
 * the safe default.
 */
function classifySendError(err: unknown): SendErrorOutcome {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : '';
  const code = (err as { code?: unknown } | null | undefined)?.code;
  const codeStr = typeof code === 'string' ? code : '';
  if (
    /Throttl|TooManyRequests|LimitExceeded|SlowDown/i.test(name) ||
    /quota|sending rate/i.test(message)
  ) {
    return 'throttle';
  }
  if (
    /Timeout|AbortError/i.test(name) ||
    /^(ETIMEDOUT|ECONNRESET|EPIPE|ECONNABORTED)$/.test(codeStr)
  ) {
    return 'ambiguous';
  }
  return 'failure';
}

export function createCommunicationService(
  adapter: SesAdapter,
): CommunicationService {
  const defaultFrom = config.sesFromIdentity;

  const service: CommunicationService = {
    enqueueEmail(input) {
      if (!input.recipientEmail) {
        throw new ValidationError('recipientEmail is required.');
      }
      if (!input.subject || !input.bodyText) {
        throw new ValidationError('subject and bodyText are required.');
      }
      if (!input.bypassSuppression) {
        const mailbox = account.emailStatusByNormalizedLoginEmail.get(
          input.recipientEmail.toLowerCase().trim(),
        ) as { id: string; email_status: string } | undefined;
        if (mailbox && mailbox.email_status !== 'ok') {
          // The mailbox already bounced or complained; routine mail to it
          // damages sender reputation with no chance of delivery. Log by
          // member id, never the address itself.
          logger.warn('outbox enqueue suppressed: recipient mailbox is undeliverable', {
            mailboxMemberId: mailbox.id,
            recipientMemberId: input.recipientMemberId,
            emailStatus: mailbox.email_status,
            templateKey: input.templateKey ?? null,
          });
          return { id: null, status: 'suppressed' };
        }
      }
      const id = `email_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const now = new Date().toISOString();
      try {
        outbox.insert.run(
          id,
          now,
          now,
          input.idempotencyKey ?? null,
          input.recipientEmail,
          input.recipientMemberId,
          input.mailingListId ?? null,
          null, // sender_member_id
          input.fromIdentity ?? defaultFrom ?? null,
          input.subject,
          input.bodyText,
          input.templateKey ?? null,
          input.scheduledFor ?? null,
        );
        return { id, status: 'enqueued' };
      } catch (err) {
        // Unique idempotency_key conflict → treat as duplicate, not error.
        // Return the EXISTING row's id so retries with the same key are
        // truly idempotent (same id every time, not a fresh one per retry).
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
          input.idempotencyKey
        ) {
          const existing = outbox.findByIdempotencyKey.get(input.idempotencyKey) as
            | { id: string }
            | undefined;
          return { id: existing?.id ?? id, status: 'duplicate' };
        }
        throw err;
      }
    },

    enqueueEmailOrFail(input) {
      try {
        // Strict sends bypass the suppression gate: see the input-field JSDoc.
        return service.enqueueEmail({ ...input, bypassSuppression: true });
      } catch (err) {
        // ServiceError subclasses (ValidationError, ConflictError, etc.)
        // re-throw unchanged so the controller layer's existing 4xx mapping
        // applies. Everything else is a transport-layer surprise (SQLite
        // busy, schema mismatch, OOM) and is mapped to ServiceUnavailableError.
        if (err instanceof ServiceError) throw err;
        logger.error('enqueueEmailOrFail: outbox enqueue failed', {
          idempotencyKey: input.idempotencyKey,
          recipientMemberId: input.recipientMemberId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new ServiceUnavailableError(
          'Could not enqueue the notification email. The underlying operation is committed; retry the notification path or use the related recovery flow.',
        );
      }
    },

    enqueueMailingListEmail(input) {
      if (!input.mailingListSlug) {
        throw new ValidationError('mailingListSlug is required.');
      }
      if (!input.subject || !input.bodyText) {
        throw new ValidationError('subject and bodyText are required.');
      }
      if (!input.idempotencyKeyPrefix) {
        throw new ValidationError('idempotencyKeyPrefix is required.');
      }
      const subscribers = mailingListSubscriptions.listActiveSubscribersBySlug.all(
        input.mailingListSlug,
      ) as Array<{ member_id: string; login_email: string; mailing_list_id: string }>;
      if (subscribers.length === 0) {
        logger.info('mailing list has no active subscribers', {
          mailingListSlug: input.mailingListSlug,
        });
        return { enqueued: 0, duplicates: 0 };
      }
      let enqueued = 0;
      let duplicates = 0;
      for (const sub of subscribers) {
        const result = service.enqueueEmail({
          recipientEmail: sub.login_email,
          recipientMemberId: sub.member_id,
          mailingListId: sub.mailing_list_id,
          subject: input.subject,
          bodyText: input.bodyText,
          templateKey: input.templateKey,
          idempotencyKey: `${input.idempotencyKeyPrefix}:${sub.member_id}`,
        });
        // The subscriber query already filters undeliverable mailboxes, so a
        // suppressed result here means the status flipped mid-fan-out; it
        // counts as neither enqueued nor duplicate.
        if (result.status === 'duplicate') duplicates += 1;
        else if (result.status === 'enqueued') enqueued += 1;
      }
      return { enqueued, duplicates };
    },

    async processSendQueue(opts = {}) {
      const result: ProcessBatchResult = {
        claimed: 0,
        sent: 0,
        failed: 0,
        deadLettered: 0,
        manualReview: 0,
        paused: false,
      };

      const paused = readIntConfig('email_outbox_paused', 0) === 1;
      if (paused) {
        result.paused = true;
        return result;
      }

      const maxRetries = readIntConfig('outbox_max_retry_attempts', 5);
      const limit = opts.limit ?? 10;
      const now = new Date().toISOString();

      // Crash recovery: rows stranded in 'sending' by a worker killed mid-send
      // are invisible to selectPendingBatch, so without this reap the email is
      // silently stuck. A stranded row's true outcome is unknowable (the crash
      // may have come after a successful provider send), so it parks in
      // manual_review for an admin instead of retrying into a possible
      // duplicate delivery. The lease is generous next to a single SES call;
      // only a genuinely abandoned attempt gets parked.
      const leaseSeconds = readIntConfig('outbox_sending_lease_seconds', 600);
      const staleBefore = new Date(Date.now() - leaseSeconds * 1000).toISOString();
      const reaped = outbox.reapStaleSending.run(now, staleBefore);
      if (reaped.changes > 0) {
        result.manualReview += reaped.changes;
        logger.error('outbox stale sending rows parked for manual review', {
          count: reaped.changes,
        });
      }

      const rows = outbox.selectPendingBatch.all(now, limit) as OutboxRow[];

      for (const row of rows) {
        const claimedNow = outbox.markSending.run(now, now, row.id);
        if (claimedNow.changes !== 1) continue;
        result.claimed += 1;

        try {
          await adapter.sendEmail({
            to: row.recipient_email ?? '',
            subject: row.subject,
            bodyText: row.body_text,
            from: row.from_identity ?? undefined,
          });
          outbox.markSent.run(new Date().toISOString(), new Date().toISOString(), row.id);
          result.sent += 1;
          logger.info('outbox sent', {
            outboxId: row.id,
            memberId: row.recipient_member_id ?? null,
            deliveryResult: 'sent',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const errorClass = err instanceof Error ? err.constructor.name : 'Unknown';
          const outcome = classifySendError(err);
          if (outcome === 'throttle') {
            // Provider pressure, not a verdict on this email: wait out the
            // delay without consuming one of the limited attempts, so a
            // send burst against the SES rate or daily quota cannot
            // dead-letter real mail.
            const delaySeconds = readIntConfig('outbox_throttle_retry_seconds', 120);
            outbox.markThrottledRetry.run(
              message,
              new Date(Date.now() + delaySeconds * 1000).toISOString(),
              new Date().toISOString(),
              row.id,
            );
            result.failed += 1;
            logger.warn('outbox throttled; retrying after delay without consuming an attempt', {
              outboxId: row.id,
              memberId: row.recipient_member_id ?? null,
              deliveryResult: 'throttled',
              retryCount: row.retry_count,
              errorClass,
            });
          } else if (outcome === 'ambiguous') {
            // The provider may or may not have delivered (the error arrived
            // after the request left); SES has no idempotency token, so a
            // retry could deliver the same email twice. Park for an admin.
            outbox.markManualReview.run(message, new Date().toISOString(), row.id);
            result.manualReview += 1;
            logger.error('outbox ambiguous send outcome; parked for manual review', {
              outboxId: row.id,
              memberId: row.recipient_member_id ?? null,
              deliveryResult: 'manual_review',
              errorClass,
            });
          } else {
            const nextRetryCount = row.retry_count + 1;
            if (nextRetryCount >= maxRetries) {
              outbox.markDeadLetter.run(message, new Date().toISOString(), row.id);
              result.deadLettered += 1;
              logger.error('outbox dead-letter', {
                outboxId: row.id,
                memberId: row.recipient_member_id ?? null,
                deliveryResult: 'dead_letter',
                attemptCount: nextRetryCount,
                errorClass,
              });
            } else {
              // Exponential backoff: 1x, 2x, 4x ... the base delay, capped,
              // so a provider refusing everything is probed at a widening
              // interval instead of burning the attempt budget in minutes.
              const baseSeconds = readIntConfig('outbox_retry_base_seconds', 60);
              const delaySeconds = Math.min(baseSeconds * 2 ** row.retry_count, 3600);
              outbox.markFailedRetry.run(
                message,
                new Date(Date.now() + delaySeconds * 1000).toISOString(),
                new Date().toISOString(),
                row.id,
              );
              result.failed += 1;
              logger.warn('outbox retrying', {
                outboxId: row.id,
                memberId: row.recipient_member_id ?? null,
                deliveryResult: 'retrying',
                attemptCount: nextRetryCount,
                retryDelaySeconds: delaySeconds,
                errorClass,
              });
            }
          }
        }
      }
      return result;
    },
  };

  return service;
}

let singleton: CommunicationService | null = null;

export function getCommunicationService(): CommunicationService {
  if (singleton) return singleton;
  singleton = createCommunicationService(getSesAdapter());
  return singleton;
}

export function resetCommunicationServiceForTests(): void {
  singleton = null;
}

/**
 * Inject a custom CommunicationService for the duration of a test. Mirrors
 * the pattern in jwtSigningAdapter / imageProcessingAdapter. Tests that
 * exercise outbox-enqueue failure code paths (e.g. password-change
 * confirmation enqueue throwing under SQLite busy) use this entry point to
 * install a hand-rolled service; the test's afterEach should call
 * resetCommunicationServiceForTests to clear it.
 */
export function setCommunicationServiceForTests(svc: CommunicationService): void {
  singleton = svc;
}
