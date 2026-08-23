/**
 * CommunicationService -- the email outbox: enqueue, fan-out, and SES drain.
 *
 * Owns:
 *   - The single enqueue path every outbound message takes, single or bulk.
 *     Callers name an audience -- one address, one member, a list, a group
 *     roster, or an event's confirmed participants -- and the path resolves it
 *     to recipients and writes one row each. There is no second way in, so a
 *     rule applied here is a rule every message obeys.
 *   - Outbox enqueue with idempotency-key dedupe (plus the strict flag that
 *     maps transport failure to a typed 503)
 *   - The mailbox suppression gate: a best-effort enqueue whose target
 *     address is a member's current notification mailbox with a non-ok
 *     email_status is suppressed, so a bounced or complained address never
 *     receives routine mail again. Strict sends bypass the gate: they are
 *     rare, member-initiated security signals where non-delivery is its own
 *     risk, and refusing them loudly would let an anti-enumeration surface
 *     answer differently for a known-and-bounced address.
 *   - Audience resolution: every branch returns only verified, deliverable
 *     mailboxes on live accounts, so no audience reaches an address another
 *     one would skip. A list declares whether its recipients come from its
 *     subscription rows or from a group's roster; a group's roster is the only
 *     record of that group's membership and is never mirrored into
 *     subscriptions, so there is no membership copy that can drift.
 *   - Stream attribution, decided by the audience at enqueue and stored on the
 *     row: bulk whenever the recipient has a subscription they could act on,
 *     which covers the many-recipient audiences and a one-member send that
 *     belongs to a list; transactional otherwise. Each stream names its own SES
 *     configuration set, so one stream's complaint rate never lands on the
 *     other's sending reputation.
 *   - The send-queue drain batch: stale-sending reap, claim, SES send,
 *     retry/backoff/dead-letter/manual-review bookkeeping
 *
 * Does not own:
 *   - Triggering sends, and choosing the audience (callers name one; this
 *     service resolves the audience they named and decides nothing about who
 *     should be written to)
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
 *     original row id. A single-recipient audience uses the caller's key
 *     verbatim; a broadcast audience extends it with the member id, keyed off
 *     the audience kind rather than how many recipients resolved, so a list
 *     that currently has one subscriber cannot collide with an unrelated
 *     single send that chose the same key.
 *   - A strict send is valid only on a single-recipient audience: it bypasses
 *     the suppression gate, which is defensible for one member-initiated
 *     security signal and never for a broadcast.
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
 *   outbox_emails; mailing_lists, mailing_list_subscriptions, registrations
 *   and members_active
 *   (read-only: audience resolution and the suppression lookup).
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
import { mintUnsubscribeToken } from '../lib/unsubscribeToken';

/** Where the one-click unsubscribe headers point. */
export const UNSUBSCRIBE_PATH = '/email/unsubscribe';

/**
 * Who a message goes to. Every send names one, single or bulk, and the enqueue
 * path resolves it to recipients. Making the audience a value rather than a
 * separate method per shape is what keeps one mechanism: the suppression gate,
 * the deliverability filters, the stream, and the unsubscribe headers are
 * applied once, where the audience is resolved, so a rule added there is a rule
 * every message obeys and no caller can reach the outbox around it.
 *
 * A send is bulk when the recipient has something they could unsubscribe from,
 * which is the same test a mail provider applies: any of the three
 * many-recipient kinds, and equally a one-member send that belongs to a list,
 * such as a reminder the member subscribes to and a sweep delivers one at a
 * time. Everything else is transactional. `listTag` is what carries that case:
 * it names the list a single send belongs to, for the archive, the admin
 * surfaces and the unsubscribe header, without making the list the audience.
 */
export type SendAudience =
  /** One member, at an address the caller already holds. */
  | { kind: 'address'; email: string; memberId: string; listTag?: string }
  /** One member, at their current notification mailbox. */
  | { kind: 'member'; memberId: string; listTag?: string }
  /** A mailing list, resolved by whatever that list's recipient source says. */
  | { kind: 'list'; slug: string }
  /** A group's current roster. */
  | { kind: 'group'; groupId: string }
  /** One event's confirmed participants. */
  | { kind: 'event'; eventId: string };

export type SendStream = 'transactional' | 'bulk';

export interface EnqueueInput {
  audience: SendAudience;
  subject: string;
  bodyText: string;
  /** Registered template that produced this email; the compose service stamps it. */
  templateKey?: string | null;
  /**
   * Exact key for a single recipient; for an audience that fans out, the path
   * extends it with the member id so each recipient dedupes independently.
   */
  idempotencyKey?: string;
  scheduledFor?: string;
  fromIdentity?: string;
  /**
   * Strict send: skips the mailbox suppression gate and surfaces a transport
   * failure as a 503 rather than swallowing it. Reserved for member-initiated
   * security signals (password reset, verification, account-change
   * confirmation), where refusing would either strand the member or let an
   * anti-enumeration surface answer differently for a bounced address. Valid
   * only on a single-recipient audience: there is no security signal that goes
   * to a whole list, and bypassing suppression in bulk is how a sender burns
   * its reputation.
   */
  strict?: boolean;
}

export interface EnqueueOutcome {
  stream: SendStream;
  /** Recipients the audience resolved to, before suppression. */
  recipients: number;
  enqueued: number;
  duplicates: number;
  suppressed: number;
  /** Row ids, in resolution order; empty when everything was suppressed. */
  ids: string[];
}

interface ResolvedRecipient {
  memberId: string;
  email: string;
  /** The list this copy belongs to, for the archive and the admin surfaces. */
  mailingListId: string | null;
}

interface EnqueueEmailInput {
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
   * Skips the mailbox suppression gate. Reserved for strict security sends:
   * those flows are member-initiated, rare,
   * and refusing them would either strand the member or let an
   * anti-enumeration surface answer differently for a bounced address.
   */
  bypassSuppression?: boolean;
  stream: SendStream;
}

export type EnqueueResult =
  | { id: string; status: 'enqueued' | 'duplicate' }
  | { id: null; status: 'suppressed' };

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
  /**
   * The one way anything reaches the outbox. Resolves the audience, applies the
   * suppression gate and the deliverability filters, and writes one row per
   * recipient carrying the stream its audience decided.
   *
   * A strict send (see the input field) propagates ValidationError and
   * ConflictError as their own classes and wraps anything else in
   * ServiceUnavailableError, so the controller layer maps it to a 503 with an
   * actionable message; callers of a strict send MUST NOT wrap it in a
   * try/catch that swallows the error. A non-strict send is best-effort, so a
   * delivery problem never unwinds the committed action that triggered it.
   */
  enqueue(input: EnqueueInput): EnqueueOutcome;
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

/**
 * The SES configuration set naming this row's sending reputation. The row
 * already carries the stream its audience decided at enqueue, so this is a
 * lookup rather than a guess: inferring bulk from "has a mailing list" would
 * misfile an event-participant send, which carries an event and no list.
 * Undefined until the sets are provisioned, which leaves both streams on the
 * account default.
 */
function configurationSetFor(row: { stream: SendStream }): string | undefined {
  return row.stream === 'bulk'
    ? config.sesConfigurationSetBulk
    : config.sesConfigurationSetTransactional;
}

/**
 * The one-click unsubscribe pair, on bulk mail only. Major receivers expect a
 * bulk sender to offer these, and their absence costs deliverability on exactly
 * the sends that can least afford it. Transactional mail carries neither: there
 * is nothing to unsubscribe from in a password reset, and offering it would
 * invite a member to switch off their own security mail.
 *
 * Offered only where the member has a mailing preference the header can
 * actually withdraw: a subscription-backed list that the member is allowed to
 * manage. Three bulk cases deliberately get none.
 *
 * A list members cannot manage, which `is_member_manageable` marks: the
 * operational alert lists are the case, and an unsubscribe header on one would
 * hand an administrator a mail-client button removing them from urgent alerts,
 * a capability the platform deliberately does not offer in its own interface.
 * The flag already means "members may self-subscribe and unsubscribe", so it is
 * exactly the right thing to ask.
 *
 * A group's mail: membership of the group is what puts the member on its list,
 * so an unsubscribe would either lie, leaving them on the roster and still
 * receiving, or quietly remove them from a committee, which is a governance act
 * and not something a mail client's button performs.
 *
 * An event's participants: they are recipients by having entered the event, so
 * the thing to withdraw from is the registration. The last two tell the reader
 * in the message how to act on the site instead.
 */
function unsubscribeHeadersFor(row: {
  stream: SendStream;
  mailing_list_id: string | null;
  recipient_member_id: string | null;
}): Record<string, string> | undefined {
  if (row.stream !== 'bulk' || !row.mailing_list_id || !row.recipient_member_id) return undefined;

  const list = mailingListSubscriptions.getListBySlug.get(row.mailing_list_id) as
    | MailingListRow
    | undefined;
  if (!list || list.recipient_source !== 'subscription') return undefined;
  if (list.is_member_manageable !== 1) return undefined;

  const token = mintUnsubscribeToken(row.recipient_member_id, { kind: 'list', slug: list.slug });
  const url = `${config.publicBaseUrl}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}`;
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Bulk when the recipient has a subscription they could act on: any
 * many-recipient audience, and a single send that belongs to a list. A
 * password reset is transactional; a reminder the member subscribes to is not,
 * even though the sweep sends it one member at a time.
 */
function streamFor(audience: SendAudience): SendStream {
  if (audience.kind === 'address' || audience.kind === 'member') {
    return audience.listTag ? 'bulk' : 'transactional';
  }
  return 'bulk';
}

interface MailingListRow {
  slug: string;
  status: string;
  recipient_source: 'subscription' | 'group';
  source_group_id: string | null;
  from_identity: string | null;
  is_member_manageable: number;
}

/**
 * Turns an audience into the recipients it names. An audience that names nobody
 * returns an empty list rather than throwing: a list with no subscribers and an
 * event with no confirmed entrants are ordinary states, not faults.
 *
 * The branches do NOT filter alike, and the difference is deliberate:
 *
 * - `address` applies no filter at all. It exists for the mail that has to
 *   reach a mailbox the platform cannot yet vouch for, verification being the
 *   obvious case, so filtering here would make the address audience useless.
 * - `member` excludes purged and deceased accounts only. It checks neither
 *   `email_verified_at` nor `email_status`, for the same reason.
 * - `list` and `event` apply the full set, because a broadcast has no business
 *   reaching an unverified or bouncing mailbox.
 *
 * Suppression is enforced separately, at insert time, for every non-strict
 * send, so a hard-bounced address is dropped whichever audience named it. What
 * is not enforced anywhere for `address` and `member` is subscription state:
 * a caller sending bulk to either kind owns that check itself.
 */
function resolveAudience(audience: SendAudience): ResolvedRecipient[] {
  switch (audience.kind) {
    case 'address':
      return [{
        memberId: audience.memberId,
        email: audience.email,
        mailingListId: audience.listTag ?? null,
      }];

    case 'member': {
      const row = account.findNotificationContactById.get(audience.memberId) as
        | { login_email: string | null }
        | undefined;
      if (!row?.login_email) return [];
      return [{
        memberId: audience.memberId,
        email: row.login_email,
        mailingListId: audience.listTag ?? null,
      }];
    }

    case 'list': {
      const list = mailingListSubscriptions.getListBySlug.get(audience.slug) as
        | MailingListRow
        | undefined;
      if (!list) throw new ValidationError(`Unknown mailing list: ${audience.slug}`);
      if (list.status !== 'active') return [];
      // A group-backed list is the same audience as its group, reached by the
      // list's name instead of the group's, so it resolves through the same
      // branch rather than a parallel copy of it.
      if (list.recipient_source === 'group') {
        return resolveGroupRoster(list.source_group_id as string, list.slug);
      }
      const subs = mailingListSubscriptions.listActiveSubscribersBySlug.all(audience.slug) as Array<{
        member_id: string;
        login_email: string;
        mailing_list_id: string;
      }>;
      return subs.map((s) => ({
        memberId: s.member_id,
        email: s.login_email,
        mailingListId: s.mailing_list_id,
      }));
    }

    case 'group':
      return resolveGroupRoster(audience.groupId, null);

    case 'event': {
      const rows = mailingListSubscriptions.listConfirmedParticipantRecipients.all(
        audience.eventId,
      ) as Array<{ member_id: string; login_email: string }>;
      return rows.map((r) => ({
        memberId: r.member_id,
        email: r.login_email,
        mailingListId: null,
      }));
    }
  }
}

/**
 * The roster is the only record of who is in a group, so this reads it rather
 * than a mirrored subscription set, which is what removes the drift the mirror
 * design would have needed managing.
 *
 * The roster itself arrives with the groups build. Until then no group exists
 * to name and no list can declare a group source, so reaching here means a
 * caller wired a group audience without the table behind it: an invariant
 * failure, not a user-facing condition.
 */
function resolveGroupRoster(groupId: string, _listSlug: string | null): ResolvedRecipient[] {
  throw new Error(
    `Group audience ${groupId} cannot be resolved: the group roster this reads is part of the groups build and is not present yet.`,
  );
}

export function createCommunicationService(
  adapter: SesAdapter,
): CommunicationService {
  const defaultFrom = config.sesFromIdentity;

  /**
   * Writes one outbox row for one already-resolved recipient. The only writer
   * of the table, so the suppression gate and the idempotency-collision rule
   * live here once. `strict` changes only the error contract: a transport
   * surprise becomes a 503 the controller can act on instead of propagating raw.
   */
  function insertOne(input: EnqueueEmailInput, strict: boolean): EnqueueResult {
    try {
      return insertOneInner(input);
    } catch (err) {
      if (!strict) throw err;
      // ServiceError subclasses (ValidationError, ConflictError, etc.)
      // re-throw unchanged so the controller layer's existing 4xx mapping
      // applies. Everything else is a transport-layer surprise (SQLite
      // busy, schema mismatch, OOM) and is mapped to ServiceUnavailableError.
      if (err instanceof ServiceError) throw err;
      logger.error('strict send: outbox enqueue failed', {
        idempotencyKey: input.idempotencyKey,
        recipientMemberId: input.recipientMemberId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ServiceUnavailableError(
        'Could not enqueue the notification email. The underlying operation is committed; retry the notification path or use the related recovery flow.',
      );
    }
  }

  function insertOneInner(input: EnqueueEmailInput): EnqueueResult {
    {
      if (!input.recipientEmail) {
        throw new ValidationError('recipientEmail is required.');
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
          input.stream,
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
    }
  }

  const service: CommunicationService = {
    enqueue(input) {
      if (!input.subject || !input.bodyText) {
        throw new ValidationError('subject and bodyText are required.');
      }
      const stream = streamFor(input.audience);
      if (input.strict && stream === 'bulk') {
        throw new ValidationError(
          'A strict send must name a single recipient: it bypasses the suppression gate, which is defensible for one member-initiated security signal and never for a broadcast.',
        );
      }

      const recipients = resolveAudience(input.audience);
      const outcome: EnqueueOutcome = {
        stream, recipients: recipients.length, enqueued: 0, duplicates: 0, suppressed: 0, ids: [],
      };
      if (recipients.length === 0) {
        logger.info('send resolved to no recipients', {
          audienceKind: input.audience.kind,
          templateKey: input.templateKey ?? null,
        });
        return outcome;
      }

      // One key per recipient. A single-recipient audience keeps the caller's
      // key exactly, so an existing queued row still dedupes against a retry;
      // a broadcast audience extends it per member so one recipient's duplicate
      // never masks another's first attempt. The rule reads the audience kind,
      // never how many recipients happened to resolve: a list that today has
      // one subscriber must not start colliding with unrelated single sends
      // that chose the same key.
      const perRecipientKey = stream === 'bulk' && input.audience.kind !== 'address'
        && input.audience.kind !== 'member';

      // A fan-out send must carry a key. Without one every recipient row gets a
      // NULL idempotency_key, and the unique index skips NULLs, so nothing
      // dedupes: re-running the send mails the whole audience a second time.
      // A single-recipient send may legitimately go unkeyed, because there is
      // no fan-out to halve and the caller has other ways to avoid a repeat.
      if (perRecipientKey && !input.idempotencyKey) {
        throw new ValidationError(
          `A ${input.audience.kind} send requires an idempotency key; without one a re-run would send twice.`,
        );
      }

      const keyFor = (memberId: string): string | undefined => {
        if (!input.idempotencyKey) return undefined;
        return perRecipientKey ? `${input.idempotencyKey}:${memberId}` : input.idempotencyKey;
      };

      for (const recipient of recipients) {
        const result = insertOne({
          recipientEmail: recipient.email,
          recipientMemberId: recipient.memberId,
          mailingListId: recipient.mailingListId ?? undefined,
          subject: input.subject,
          bodyText: input.bodyText,
          templateKey: input.templateKey,
          idempotencyKey: keyFor(recipient.memberId),
          scheduledFor: input.scheduledFor,
          fromIdentity: input.fromIdentity,
          bypassSuppression: input.strict,
          stream,
        }, input.strict === true);

        if (result.status === 'duplicate') {
          outcome.duplicates += 1;
          outcome.ids.push(result.id);
        } else if (result.status === 'enqueued') {
          outcome.enqueued += 1;
          outcome.ids.push(result.id);
        } else {
          // For a bulk audience the resolver already filtered undeliverable
          // mailboxes, so a suppression here means the status flipped between
          // resolution and insert.
          outcome.suppressed += 1;
        }
      }
      return outcome;
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
            configurationSet: configurationSetFor(row),
            headers: unsubscribeHeadersFor(row),
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
