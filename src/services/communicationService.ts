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
 *     which covers a list they may leave themselves, a group roster, an event's
 *     participants, and a one-member send belonging to a manageable list;
 *     transactional otherwise. A list members cannot manage is transactional,
 *     the operational alert lists being the case: they offer nothing to
 *     unsubscribe from, and an alert withheld by the bulk stream's stop is an
 *     alert withheld during the incident that stopped it. Each stream names its
 *     own SES configuration set, so one stream's complaint rate never lands on
 *     the other's sending reputation.
 *   - The send-queue drain batch: stale-sending reap, claim, SES send,
 *     retry/backoff/dead-letter/manual-review bookkeeping
 *   - Drain priority between the two streams. One pass fills with pending
 *     transactional rows first and gives bulk only the remainder, itself
 *     capped, so a bulk run paces itself and never delays a password reset
 *     behind it.
 *   - The bulk feedback halt: between passes the recent bounce and complaint
 *     rates are read, and bulk mail stops while either is at or above threshold.
 *     Transactional mail keeps flowing, because the halt protects the sending
 *     reputation a bulk run puts at risk and refusing security mail protects
 *     nothing.
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
 *   - The suppression gate runs at enqueue AND at send: a mailbox can stop
 *     accepting mail while a message waits, and a queue held through a pause
 *     keeps rows for as long as the hold. A row carrying bypasses_suppression
 *     is exempt at both ends.
 *   - Admin pause flag (email_outbox_paused) halts draining without losing rows.
 *   - Operator bulk switch (bulk_send_paused) stops the bulk stream only, so a
 *     send can be called off without holding back anybody's password reset.
 *     Both switches are read here and written only by operator script.
 *   - A production host not holding the live sender refuses to drain at all.
 *     The stub reports every send as delivered, so draining would mark queued
 *     mail sent and clear its body; holding it is what makes disarming email
 *     recoverable.
 *
 * Persistence:
 *   outbox_emails; mailing_lists, mailing_list_subscriptions, registrations
 *   and members_active
 *   (read-only: audience resolution and the suppression lookup);
 *   ses_events (read-only: the bounce and complaint counts the bulk halt
 *   is judged on).
 *
 * Side effects:
 *   - SES adapter sendEmail per claimed row
 *   - logger.error on dead-letter and on manual-review parking (drives the
 *     CloudWatch alarm)
 *   - logger.warn when the bulk halt withholds queued bulk mail
 *
 * Service shape: factory `createCommunicationService(adapter)` with the
 * `getCommunicationService()` lazy singleton; tests inject a stub adapter.
 */
import { randomUUID } from 'node:crypto';
import { account, outbox, sesEvents, mailingListSubscriptions, type OutboxRow } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { readIntConfig, readHealthWindowHours } from './configReader';
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
 * which is the same test a mail provider applies: a list they may leave
 * themselves, a group roster, an event's participants, and equally a one-member
 * send that belongs to such a list, such as a reminder the member subscribes to
 * and a sweep delivers one at a time. Everything else is transactional,
 * including a list members cannot manage, which offers nothing to withdraw from
 * and whose alerts must survive the bulk stream being stopped.
 * `listTag` is what carries the single-send case:
 * it names the list a single send belongs to, for the archive, the admin
 * surfaces and the unsubscribe header, without making the list the audience.
 */
export type SendAudience =
  /** One member, at an address the caller already holds. */
  /** A null member id names a platform role address (the treasurer contact,
   *  for instance), which belongs to no member and has nothing to erase. */
  | { kind: 'address'; email: string; memberId: string | null; listTag?: string }
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
  memberId: string | null;
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
  recipientMemberId: string | null;
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
  /**
   * Messages withheld at send because the recipient's mailbox stopped accepting
   * mail after they were queued. Counted separately from a failure: nothing was
   * attempted and no retry could succeed.
   */
  suppressed: number;
  /**
   * The drain declined to run because this production host holds the stub
   * sender. Distinct from `paused`, which is the administrator's own switch:
   * this one is a consequence of how the host is armed, and the queue is being
   * held rather than emptied.
   */
  sendingDark: boolean;
  /**
   * Bulk mail was withheld this pass because bounce or complaint feedback is
   * at or above threshold. Transactional mail is unaffected and still drained: the
   * halt protects the sending reputation a bulk run puts at risk, and refusing
   * a password reset would protect nothing.
   */
  bulkHalted: boolean;
  /**
   * Bulk mail was withheld this pass because an operator stopped that stream.
   * Distinct from `bulkHalted`, which is the platform stopping itself on
   * feedback: this one clears only when somebody clears it.
   */
  bulkPaused: boolean;
}

/**
 * Why the bulk stream is or is not being drained, and the figures behind it.
 * Returned so the drain can act on it and the admin health surface can show
 * the same answer rather than recomputing a second version of it.
 */
export interface BulkFeedbackHalt {
  halted: boolean;
  reason: 'bounce_rate' | 'complaint_rate' | null;
  /** Below this the rates are not judged at all; see the sample floor below. */
  sentInWindow: number;
  bounceCount: number;
  complaintCount: number;
  /** Observed rates, in the same ten-thousandths the thresholds are set in. */
  bouncePer10k: number;
  complaintPer10k: number;
  windowHours: number;
}

const HOUR_MS = 60 * 60 * 1000;

function per10k(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000);
}

/**
 * Whether a bulk run should stop, judged on the bounce and complaint feedback
 * of the recent window.
 *
 * The thresholds default to the figures the provider itself acts on: a bounce
 * rate of five per cent puts an account under review, and the complaint line is
 * set tighter still, at a quarter of one per cent against the provider's own
 * tenth-of-a-per-cent review point, because this list is small enough that a
 * handful of complaints is already a signal. Both are stored in ten-thousandths
 * because runtime configuration here is whole numbers, and both carry that unit
 * in their key names so nobody reads 500 as five hundred per cent.
 *
 * Two properties worth stating, because both limit what this can claim:
 *
 * The numerator and the denominator are measured over the same window but not
 * over the same messages. Nothing links a bounce back to the message that
 * caused it, so what a batch itself produced is not knowable and this is a
 * windowed comparison rather than a cohort rate. It is the same figure the
 * admin health page shows, deliberately, so the two never disagree.
 *
 * Below a floor of sent messages the rates are not judged at all. Without it
 * the first bounce against a nearly idle sender reads as a catastrophic rate
 * and stops a run that has barely started, which is exactly the state a
 * newly armed production is in.
 */
export function evaluateBulkFeedbackHalt(nowMs: number = Date.now()): BulkFeedbackHalt {
  const windowHours = readHealthWindowHours();
  const since = new Date(nowMs - windowHours * HOUR_MS).toISOString();

  const sentInWindow = (outbox.countSentInWindow.get(since) as { n: number }).n;
  const feedback = new Map<string, number>();
  for (const row of sesEvents.countByTypeSince.all(since) as { event_type: string; n: number }[]) {
    feedback.set(row.event_type, row.n);
  }
  const bounceCount = feedback.get('bounce') ?? 0;
  const complaintCount = feedback.get('complaint') ?? 0;

  const bouncePer10k = per10k(bounceCount, sentInWindow);
  const complaintPer10k = per10k(complaintCount, sentInWindow);
  const base: Omit<BulkFeedbackHalt, 'halted' | 'reason'> = {
    sentInWindow, bounceCount, complaintCount, bouncePer10k, complaintPer10k, windowHours,
  };

  const minSample = readIntConfig('bulk_halt_min_sent_in_window', 50);
  if (sentInWindow < minSample) return { halted: false, reason: null, ...base };

  const bounceLimit = readIntConfig('bounce_rate_alarm_threshold_per_10k', 500);
  const complaintLimit = readIntConfig('complaint_rate_alarm_threshold_per_10k', 25);

  // Complaints are read first: a complaint is a recipient saying the mail was
  // unwanted, which is the reason a bulk run should stop rather than a
  // deliverability problem to work around.
  if (complaintPer10k >= complaintLimit) {
    return { halted: true, reason: 'complaint_rate', ...base };
  }
  if (bouncePer10k >= bounceLimit) {
    return { halted: true, reason: 'bounce_rate', ...base };
  }
  return { halted: false, reason: null, ...base };
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
  /**
   * Drains one pass. `limit` caps the whole pass; `bulkLimit` caps how much of
   * that pass bulk mail may take, so a bulk run paces itself and can never
   * starve transactional mail. Both default to their system_config keys
   * (`outbox_batch_limit`, `outbox_bulk_batch_limit`); the arguments exist so a
   * test can drive a boundary without writing config.
   */
  processSendQueue(opts?: { limit?: number; bulkLimit?: number }): Promise<ProcessBatchResult>;
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
 * True when a list is one its members may subscribe to and leave themselves.
 *
 * An unknown slug answers true so an unresolvable list lands on the bulk
 * reputation rather than the transactional one. Such an audience resolves to
 * nobody, so this only decides which configuration set an impossible send would
 * have named, and the safe direction is away from transactional.
 */
function listIsMemberManageable(slug: string): boolean {
  const list = mailingListSubscriptions.getListBySlug.get(slug) as MailingListRow | undefined;
  return list ? list.is_member_manageable === 1 : true;
}

/**
 * Bulk when the recipient has a subscription they could act on: a list they may
 * leave themselves, a group roster, an event's participants, and a single send
 * belonging to a manageable list. A password reset is transactional; a reminder
 * the member subscribes to is not, even though the sweep sends it one at a time.
 *
 * A list members cannot manage is transactional, not bulk. The operational alert
 * lists are the case: they offer nothing to unsubscribe from, they reach a handful
 * of verified administrator addresses rather than the many addresses of mixed
 * freshness that put a sending reputation at risk, and the urgent ones must go out
 * during exactly the incident that stops the bulk stream. Classifying them bulk
 * would let the operator stop and the automatic feedback halt withhold the alerts
 * an administrator needs to see the incident. Group and event mail stay bulk: they
 * carry no unsubscribe control either, but they reach a membership rather than an
 * operator, and each carries standing text telling the reader how to act on the
 * site.
 */
function streamFor(audience: SendAudience): SendStream {
  if (audience.kind === 'address' || audience.kind === 'member') {
    if (!audience.listTag) return 'transactional';
    return listIsMemberManageable(audience.listTag) ? 'bulk' : 'transactional';
  }
  if (audience.kind === 'list') {
    return listIsMemberManageable(audience.slug) ? 'bulk' : 'transactional';
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
          // The same flag that let this row past the gate above is carried onto
          // the row, because the gate runs again at send and nothing else there
          // tells a password reset from a routine notification.
          input.bypassSuppression ? 1 : 0,
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
      // that chose the same key. It reads the kind alone, and deliberately not
      // the stream: an alert list fans out to every administrator while being
      // transactional, so a stream test here would hand them all one key and
      // let the first row dedupe the rest away.
      const perRecipientKey = input.audience.kind !== 'address'
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

      const keyFor = (memberId: string | null): string | undefined => {
        if (!input.idempotencyKey) return undefined;
        return perRecipientKey ? `${input.idempotencyKey}:${memberId ?? 'address'}` : input.idempotencyKey;
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
        suppressed: 0,
        paused: false,
        sendingDark: false,
        bulkHalted: false,
        bulkPaused: false,
      };

      const paused = readIntConfig('email_outbox_paused', 0) === 1;
      if (paused) {
        result.paused = true;
        return result;
      }

      // A production host holding the stub sender must not drain. The stub
      // reports every send as delivered, so draining would mark each queued
      // message sent and clear its body: the queue would empty, nothing would
      // arrive, and there would be nothing left to send again. Holding the rows
      // is what makes disarming email recoverable, and it is the difference
      // between a stop and a silent discard. Development and staging drain into
      // the stub on purpose, which is how their captured mail is read back.
      if (config.footbagEnv === 'production' && config.sesAdapter !== 'live') {
        result.sendingDark = true;
        return result;
      }

      const maxRetries = readIntConfig('outbox_max_retry_attempts', 5);
      // Floored at zero because the arguments bypass readIntConfig's own
      // positive-only guard, and SQLite reads a negative LIMIT as unlimited:
      // one negative number would turn a bounded pass into "send everything
      // pending", which is the opposite of what this method is for.
      const limit = Math.max(0, opts.limit ?? readIntConfig('outbox_batch_limit', 10));
      const bulkLimit = Math.max(0, opts.bulkLimit ?? readIntConfig('outbox_bulk_batch_limit', 5));
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

      // Transactional mail is selected first and bulk fills only what is left,
      // because the two streams carry opposite risk and share one queue. A
      // single created_at ordering would let one bulk run put every password
      // reset behind it: the drain sends one row at a time, so N queued bulk
      // rows delay the next transactional message by N/batch polling
      // intervals. Taking transactional first means a member locked out of
      // their account waits one interval however large the run is, and the
      // separate bulk cap is what paces the run itself. `stream` is already
      // decided and stored at enqueue, so this reads a fact rather than
      // recomputing one.
      const transactionalRows = outbox.selectPendingBatchByStream
        .all('transactional', now, limit) as OutboxRow[];

      // Two ways the bulk stream stops, and they are not the same thing. The
      // operator switch is a decision somebody made and is cleared the same
      // way; the feedback halt is a condition that clears itself when the rates
      // fall back. Reporting them separately is what lets an operator tell "I
      // stopped this" from "the mail is going badly". Neither touches
      // transactional mail, which is the whole point of stopping only one
      // stream rather than reaching for the outbox pause.
      const bulkPaused = readIntConfig('bulk_send_paused', 0) === 1;

      // Feedback is read between passes rather than mid-pass, which is what
      // makes a paced release worth having: the run stops at a batch boundary
      // on evidence that arrived since the last one, instead of discovering the
      // problem after the whole list has gone out.
      // Skipped when bulk has no slots to lose anyway: the operator switch is
      // already down, or transactional mail has filled the pass. Both are two
      // aggregate queries the answer cannot change, paid every poll.
      const freeSlots = Math.min(bulkLimit, limit - transactionalRows.length);
      const halt = (bulkPaused || freeSlots <= 0)
        ? null
        : evaluateBulkFeedbackHalt();
      const bulkSlots = (bulkPaused || halt?.halted) ? 0 : freeSlots;
      const bulkRows = bulkSlots > 0
        ? outbox.selectPendingBatchByStream.all('bulk', now, bulkSlots) as OutboxRow[]
        : [];
      const rows = [...transactionalRows, ...bulkRows];

      result.bulkPaused = bulkPaused;
      if (halt?.halted) {
        result.bulkHalted = true;
        // Only worth saying when it actually withheld something. A halt with an
        // empty bulk queue is a state, not an event, and logging it every poll
        // would bury the passes where mail was really held back. The operator
        // switch gets no line at all: they know, they set it.
        const pendingByStream = new Map<string, number>();
        for (const row of outbox.countPendingByStream.all() as { stream: string; n: number }[]) {
          pendingByStream.set(row.stream, row.n);
        }
        const heldBack = pendingByStream.get('bulk') ?? 0;
        if (heldBack > 0) {
          logger.warn('outbox bulk stream halted on feedback', {
            reason: halt.reason,
            heldBack,
            windowHours: halt.windowHours,
            sentInWindow: halt.sentInWindow,
            bouncePer10k: halt.bouncePer10k,
            complaintPer10k: halt.complaintPer10k,
          });
        }
      }

      for (const row of rows) {
        // The suppression gate runs again here, against the mailbox as it reads
        // now rather than as it read when the message was written. A bounce or
        // complaint arriving between the two is the whole point: without this
        // the enqueue-time check leaves a window in which a dead mailbox still
        // receives routine mail, and on a queue held through a pause or a dark
        // production that window is as long as the hold.
        if (!row.bypasses_suppression && row.recipient_email) {
          const mailbox = account.emailStatusByNormalizedLoginEmail.get(
            row.recipient_email.toLowerCase().trim(),
          ) as { id: string; email_status: string } | undefined;
          if (mailbox && mailbox.email_status !== 'ok') {
            outbox.markSuppressedAtSend.run(
              `withheld at send: recipient mailbox is ${mailbox.email_status}`,
              new Date().toISOString(),
              row.id,
            );
            result.suppressed += 1;
            continue;
          }
        }

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
