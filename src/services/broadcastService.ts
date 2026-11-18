/**
 * BroadcastService -- composing a send to an audience, and the record of what
 * was sent.
 *
 * Owns:
 *   - The compose surface: validating a subject and a plain-text body, applying
 *     the list's subject prefix, and handing the send to the one enqueue path
 *     by naming the audience.
 *   - The community announcement an organizer-tier member writes, held for
 *     review: the member's form (with its Community Standards agreement), the
 *     held row, and the two decisions on it. Submitting writes the row and
 *     raises an `announcement_review` work-queue item; nothing is sent. Another
 *     administrator approves it as written, which sends it to the announce list
 *     under the member's name, or sends it back with a note the member is
 *     emailed. A member has at most one awaiting review. An organizer of a
 *     sanctioned event that has ended may mark the announcement as that
 *     event's after-event summary; only an event the member currently
 *     organizes and whose summary has not been sent is accepted, and once the
 *     announcement is approved and sent it meets that sanctioning obligation.
 *   - The broadcast archive: one row per send, written when the send lands, and
 *     the admin surfaces that read it back.
 *
 * Does not own:
 *   - Who receives the message. The composer names a list; the enqueue path
 *     resolves that list to recipients, applies the suppression gate and the
 *     deliverability filters, and decides the stream. This service never
 *     enumerates subscribers.
 *   - The unsubscribe control. The drain mints the one-click headers for the
 *     sends that carry them, and decides which those are; a composed body adds
 *     nothing for unsubscribe, because two mechanisms for one decision is worse
 *     than one.
 *   - Delivery itself, or its outcome. The archive records intent and content,
 *     not what arrived.
 *
 * Required patterns:
 *   - A send, its archive row and its audit row are one transaction. A send
 *     recorded nowhere is a message the platform cannot account for.
 *   - Every send carries an idempotency key minted with the compose form, so a
 *     resubmitted form collapses onto the send it already made rather than
 *     mailing the audience twice. The key also carries a fingerprint of the
 *     sender, subject and body, so a form resubmitted with any of them changed
 *     is not taken for that send: it is refused, inside the send's
 *     transaction, rather than reported sent while nothing went out.
 *   - An archived list accepts no further sends, and a group-backed list is
 *     refused here rather than allowed to fail deep in the audience resolver.
 *   - The subject and body are cleaned with the shared write-time sanitizer
 *     before validation and before the send fingerprint is taken.
 *   - Bodies are plain text. The subject stored on the archive row is the
 *     subject that went out, prefix included, so the record shows what
 *     recipients actually saw.
 *   - Announcement decisions: the administrator never edits the member's
 *     words and cannot approve their own. Approval re-checks that the author
 *     still holds Tier 2 or Tier 3 and is a full member, counts the daily limit
 *     from the announcements actually sent in the last 24 hours (a sent-back
 *     one never counts), and lets a ticked override through, recorded on its
 *     audit row. A list nobody can receive refuses the approval and leaves it
 *     waiting. The send, the archive row, the decision, the item's close, the
 *     audit row and the member's email are one transaction, and the
 *     announcement's id is the send's token, so approving twice sends once.
 *   - Repeats: a repeated submit finds its row by the form's token; a decision
 *     submitted again is recognised from the administrator's standing audit
 *     row before the shared work-queue rate limit is touched.
 *   - The audit rows carry no member text: the words stay on the announcement
 *     and archive rows, which erasure reaches and the ledger does not.
 *
 * Persistence: email_archives (write/read), mailing_lists (read),
 * member_announcements (write/read), events and event_organizers (read: the
 * summary choices), work_queue_items (resolve, through the
 * work-queue enqueue for the review item), outbox_emails (through the enqueue
 * path, never directly).
 *
 * Side effects: outbox enqueue, audit_entries append, work-queue insert and
 * resolve, member act-notice email.
 */
import { createHash, randomUUID } from 'crypto';

import {
  account,
  emailArchives,
  mailingLists,
  memberAnnouncements,
  outbox,
  transaction,
  workQueue,
  type EmailArchiveRow,
  type MailingListRow,
} from '../db/db';
import { appendAuditEntry, findStandingOwnAct } from './auditService';
import { getCommunicationService } from './communicationService';
import { readIntConfig } from './configReader';
import { emailService } from './emailService';
import { enforceWorkQueueResolveLimit } from './identityAccessService';
import { isTier2Plus } from './tierPredicates';
import { workQueueService } from './workQueueService';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import { INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import type { PageViewModel } from '../types/page';
import type { OutcomeTone } from '../lib/outcomeNotice';

const SUBJECT_MAX = 300;
const BODY_MAX = 20000;
const ARCHIVE_PAGE_SIZE = 100;

/**
 * The community announce list an organizer-tier member composes to. It is a
 * mailing list like any other, so the send rides the same path; what differs is
 * who may write to it and how often.
 */
export const ANNOUNCE_LIST_SLUG = 'announce';

const DAY_IN_MINUTES = 24 * 60;

const ALREADY_SENT_CHANGED =
  'This announcement was already sent, so your changes were not sent. To send another announcement, open the compose page again.';

const FORM_EXPIRED = 'This form has expired. Open the compose page again and resend.';

/** The work-queue task type a held announcement raises. */
const ANNOUNCEMENT_REVIEW_TASK_TYPE = 'announcement_review';

const RETURN_COMMENT_MAX = 500;

const AGREE_REQUIRED =
  'Tick the box to confirm you have read and agree to the Community Standards.';
const ONE_PENDING =
  'You already have an announcement waiting for review. You can submit another once it is decided.';
const SELF_APPROVE =
  'You cannot approve your own announcement. Another administrator must review it.';
const OVER_LIMIT =
  'This member has had an announcement sent in the last 24 hours. Tick Allow an Extra Announcement Today to send it anyway.';
const TIER_LAPSED =
  'This member no longer holds Tier 2 or Tier 3, so the announcement cannot be sent. Send it back to the member.';

const SUMMARY_EVENT_UNAVAILABLE =
  'That event cannot take an after-event summary from you: you do not organize it, or its summary has already been sent.';

/** The sanctioned events a member organizes that have ended and still owe their summary. */
function summaryEventChoices(memberId: string): Array<{ id: string; title: string; end_date: string }> {
  return memberAnnouncements.listSummaryEventChoices.all(memberId, new Date().toISOString().slice(0, 10)) as Array<{
    id: string; title: string; end_date: string;
  }>;
}

export type SubmitAnnouncementResult =
  /** The announcement is held for review and its review item raised. */
  | { status: 'submitted' }
  /** This form was already submitted; the first submit's row stands. */
  | { status: 'own_repeat' };

export type AnnouncementDecisionResult =
  | { status: 'approved'; archiveId: string }
  | { status: 'returned' }
  /** This administrator's own decision, submitted again. */
  | { status: 'own_repeat'; decision: 'approved' | 'returned' }
  /** Another decision already settled it. */
  | { status: 'already_held'; decision: 'approved' | 'returned' };

interface AnnouncementRow {
  id: string;
  member_id: string;
  subject: string;
  body_text: string;
  status: 'pending' | 'approved' | 'returned';
  admin_comment: string | null;
}

/**
 * The review item and the announcement it names. Anything else, or an item
 * that never was an announcement review, is not found: no action of this type
 * applies to it.
 */
function loadAnnouncementReview(queueItemId: string): {
  item: { id: string };
  announcement: AnnouncementRow;
} {
  const item = workQueue.findById.get(queueItemId) as
    | { id: string; task_type: string; entity_type: string; entity_id: string }
    | undefined;
  if (!item || item.task_type !== ANNOUNCEMENT_REVIEW_TASK_TYPE) {
    throw new NotFoundError('That queue item is no longer open.');
  }
  const announcement = memberAnnouncements.findById.get(item.entity_id) as AnnouncementRow | undefined;
  if (!announcement) throw new NotFoundError('That queue item is no longer open.');
  return { item, announcement };
}

/**
 * What a decision on an announcement no longer pending reports. The
 * administrator's own standing act, submitted again with the same fields, is
 * their first success; anything else already settled it.
 */
function settledDecision(
  announcement: AnnouncementRow,
  adminMemberId: string,
  actionType: 'announce.approved' | 'announce.returned',
  comment?: string,
): AnnouncementDecisionResult | null {
  if (announcement.status === 'pending') return null;
  const decision = announcement.status;
  const other = actionType === 'announce.approved' ? 'announce.returned' : 'announce.approved';
  const own = findStandingOwnAct(adminMemberId, actionType, other, 'member_announcement', announcement.id);
  const sameFields = comment === undefined || comment === announcement.admin_comment;
  if (own && sameFields) return { status: 'own_repeat', decision };
  return { status: 'already_held', decision };
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/** A submitted compose form, checked and trimmed. */
interface ValidCompose {
  subject: string;
  bodyText: string;
  sendToken: string;
}

function validateCompose(input: ComposeInput): ValidCompose {
  // Cleaned before every check and before the send fingerprint, so a resubmitted
  // form whose text cleans to the same words is recognised as the same send.
  const cleanSubject = sanitizeUserText(input.subject ?? '', 'single_line');
  const cleanBody = sanitizeUserText(input.bodyText ?? '', 'multi_line');
  const subject = cleanSubject.status === 'ok' ? cleanSubject.text : '';
  const bodyText = cleanBody.status === 'ok' ? cleanBody.text : '';
  const sendToken = (input.sendToken ?? '').trim();

  const errors: Record<string, string> = {};
  if (cleanSubject.status === 'invalid_encoding') errors.subject = INVALID_TEXT_ENCODING_MESSAGE;
  else if (!subject) errors.subject = 'Subject: required.';
  else if (subject.length > SUBJECT_MAX) errors.subject = `Subject: at most ${SUBJECT_MAX} characters.`;
  if (cleanBody.status === 'invalid_encoding') errors.bodyText = INVALID_TEXT_ENCODING_MESSAGE;
  else if (!bodyText) errors.bodyText = 'Message: required.';
  else if (bodyText.length > BODY_MAX) errors.bodyText = `Message: at most ${BODY_MAX} characters.`;
  if (!sendToken) {
    // Without it the send has no idempotency key, and a re-submitted form
    // would mail the whole list a second time.
    errors.bodyText = 'This form has expired. Open the compose page again and resend.';
  }
  if (Object.keys(errors).length) {
    throw new ValidationError('Some fields need attention.', { fieldErrors: errors });
  }
  return { subject, bodyText, sendToken };
}

/**
 * What a send under this form's token already did: nothing, the same send
 * (this sender, this subject, this body), or a different one. The outbox rows
 * are keyed by token and by a fingerprint of the three, because a row's body
 * is cleared once it is delivered and cannot be compared afterwards.
 */
function priorSendUnder(compose: ValidCompose, actorMemberId: string): 'none' | 'same' | 'changed' {
  const key = sendKey(compose, actorMemberId);
  const tokenKey = `broadcast:${compose.sendToken}`;
  if (outbox.findAnyInKeyRange.get(`${key}:`, `${key};`)) return 'same';
  if (outbox.findAnyInKeyRange.get(`${tokenKey}:`, `${tokenKey};`)) return 'changed';
  return 'none';
}

/** The idempotency key a send under this form carries; the enqueue path adds
 *  the recipient. */
function sendKey(compose: ValidCompose, actorMemberId: string): string {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([actorMemberId, compose.subject, compose.bodyText]))
    .digest('hex')
    .slice(0, 16);
  return `broadcast:${compose.sendToken}:${fingerprint}`;
}

export interface ComposeInput {
  subject?: string;
  bodyText?: string;
  /** Minted with the form; the same token twice is the same send. */
  sendToken?: string;
}

export type SendOutcome =
  /** The send was enqueued and the archive row written. */
  | { status: 'sent'; archiveId: string; recipients: number; enqueued: number; suppressed: number }
  /** This form was already submitted; every recipient row already existed. */
  | { status: 'noop'; reason: 'already_sent' }
  /** The list resolved to nobody, so there was nothing to send or to record. */
  | { status: 'noop'; reason: 'no_recipients' };

interface ArchiveRowWithList extends EmailArchiveRow {
  mailing_list_name: string | null;
}

export interface ComposeContent {
  slug: string;
  listName: string;
  formAction: string;
  backHref: string;
  sendToken: string;
  subject: string;
  bodyText: string;
  subjectPrefixDisplay: string;
  hasSubjectPrefix: boolean;
  fromIdentityDisplay: string;
  recipientCount: number;
  hasRecipients: boolean;
  subjectMax: number;
  bodyMax: number;
  notice: string;
  noticeTone?: OutcomeTone;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

/**
 * What each send outcome says on the compose page it returns to, and the tone
 * it takes. One field cannot carry all three: a send that went out and a send
 * that reached nobody would read identically, and the sender could not tell the
 * message left from the message that did not.
 */
const COMPOSE_NOTICES: Record<string, [OutcomeTone, string]> = {
  sent:          ['ok',   'Queued. It goes out in paced batches over the next little while.'],
  already_sent:  ['ok',   'Queued. It goes out in paced batches over the next little while.'],
  no_recipients: ['no',   'Nothing was sent: nobody on this list has a deliverable address right now.'],
  // The member's announcement form: nothing is sent yet, so it says what
  // happens next instead.
  submitted:     ['ok',   'Submitted for review. You will get an email when it is sent, or if an administrator sends it back with a note.'],
};

/** The member's announcement form: the compose form plus the agreement box and
 *  where their last announcement stands. */
export interface AnnounceContent extends ComposeContent {
  agreeChecked: boolean;
  /** Said while one of theirs awaits review. */
  pendingNotice: string | null;
  /** The administrator's note on the one sent back, while it is the latest. */
  returnedNotice: string | null;
  /** How many subscribers receive these, in the singular for one. */
  recipientLine: string;
  /** The sanctioned events whose after-event summary this can be, for one of
   *  their organizers; empty for everyone else, and the choice is not shown. */
  summaryEventOptions: Array<{ value: string; label: string; selected: boolean }>;
  hasSummaryEventOptions: boolean;
}

export interface BroadcastRowViewModel {
  id: string;
  subject: string;
  audienceLabel: string;
  recipientCount: number;
  sentAtDisplay: string;
  detailHref: string;
}

export interface BroadcastIndexContent {
  rows: BroadcastRowViewModel[];
  hasRows: boolean;
  resultSummary: string;
  prevPageHref: string | null;
  nextPageHref: string | null;
}

export interface BroadcastDetailContent {
  id: string;
  subject: string;
  bodyText: string;
  audienceLabel: string;
  fromIdentityDisplay: string;
  recipientCount: number;
  sentAtDisplay: string;
  backHref: string;
}

/** Stored timestamps are UTC; naming the zone stops a reader taking it as local. */
function tsDisplay(iso: string): string {
  return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
}

function audienceLabelOf(row: ArchiveRowWithList): string {
  if (row.archive_type === 'mailing_list') {
    return row.mailing_list_name ?? row.mailing_list_id ?? 'A mailing list';
  }
  if (row.archive_type === 'event_participants') return 'An event\'s participants';
  return 'Community announcements';
}

/**
 * The subject as recipients see it. A prefix is a label, so it goes in front in
 * brackets rather than being folded into the words the sender wrote.
 */
function applyPrefix(prefix: string, subject: string): string {
  return prefix ? `[${prefix}] ${subject}` : subject;
}

/**
 * The list a send names, refusing the two states that cannot receive one. An
 * archived list is closed to new sends by the archive contract. A group-backed
 * list resolves through the group's roster, which arrives with the groups
 * build; refusing it here is what keeps the failure a plain message to the
 * administrator instead of an unhandled one from deep in the resolver.
 */
function sendableList(slug: string): MailingListRow {
  const list = mailingLists.getBySlug.get(slug) as MailingListRow | undefined;
  if (!list) throw new NotFoundError(`No mailing list "${slug}"`);
  if (list.status === 'archived') {
    throw new ValidationError('This list is archived and accepts no further sends.');
  }
  if (list.recipient_source === 'group') {
    throw new ValidationError(
      'This list takes its recipients from a group roster, which the groups feature supplies. Sending to a group is not available yet.',
    );
  }
  return list;
}

/**
 * The send itself, run inside a transaction the caller holds, so a caller with
 * writes of its own (an approval closing its review in the same step) keeps the
 * send, the archive row and the audit row in one commit with them.
 */
function sendToListInTx(
  list: MailingListRow,
  compose: ValidCompose,
  actorMemberId: string,
  opts: {
    archiveType?: 'mailing_list' | 'announce';
    actorType?: 'admin' | 'member';
    /** Whose words go out, where that is not the actor: an administrator
     *  approving a member's announcement sends it under the member's name, so
     *  the archive names the member as sender while the audit row names the
     *  administrator who acted. */
    senderMemberId?: string;
  },
): SendOutcome {
  const { subject, bodyText } = compose;
  const senderMemberId = opts.senderMemberId ?? actorMemberId;
  const sentSubject = applyPrefix(list.subject_prefix, subject);
  const archiveId = `bcast_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const now = new Date().toISOString();

  // Checked inside the transaction, so two overlapping submits of one form
  // cannot both pass it: the same send under this form reports it was sent,
  // and a changed one is refused rather than reported sent.
  const prior = priorSendUnder(compose, senderMemberId);
  if (prior === 'same') return { status: 'noop', reason: 'already_sent' };
  if (prior === 'changed') throw new ValidationError(ALREADY_SENT_CHANGED);

  const enqueued = getCommunicationService().enqueue({
    audience: { kind: 'list', slug: list.slug },
    subject: sentSubject,
    bodyText,
    idempotencyKey: sendKey(compose, senderMemberId),
    fromIdentity: list.from_identity ?? undefined,
  });

  if (enqueued.recipients === 0) return { status: 'noop', reason: 'no_recipients' };
  // Every row already existed, so this is the same form submitted again. The
  // send it made is already archived; a second row would double-count one
  // message in the record.
  if (enqueued.enqueued === 0 && enqueued.duplicates > 0) {
    return { status: 'noop', reason: 'already_sent' };
  }

  emailArchives.insertArchive.run(
    archiveId, now, actorMemberId, now, actorMemberId,
    opts.archiveType ?? 'mailing_list', list.slug, null,
    senderMemberId, list.from_identity, sentSubject, bodyText, now, enqueued.enqueued,
  );

  appendAuditEntry({
    actionType: 'mailing_list.broadcast_sent',
    actorType: opts.actorType ?? 'admin',
    actorMemberId,
    entityType: 'mailing_list',
    entityId: list.slug,
    // The subject and body live on the archive row this names; the audit log
    // keeps no typed text, which a member announcement would carry.
    metadata: {
      archiveId,
      recipients: enqueued.recipients,
      enqueued: enqueued.enqueued,
      suppressed: enqueued.suppressed,
    },
  });

  return {
    status: 'sent',
    archiveId,
    recipients: enqueued.recipients,
    enqueued: enqueued.enqueued,
    suppressed: enqueued.suppressed,
  };
}

export const broadcastService = {
  /**
   * The compose form for one list, or null when no list holds that slug. The
   * form carries a fresh send token, which becomes the send's idempotency key,
   * so submitting the same rendered page twice sends once.
   */
  getComposePage(
    slug: string,
    opts: {
      submitted?: ComposeInput;
      fieldErrors?: Record<string, string>;
      notice?: string;
    } = {},
  ): PageViewModel<ComposeContent> | null {
    const list = mailingLists.getBySlug.get(slug) as MailingListRow | undefined;
    if (!list) return null;

    const summary = mailingLists.getWithCounts.get(slug) as { subscribed_count: number } | undefined;
    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);
    const submitted = opts.submitted;
    const outcome = opts.notice ? COMPOSE_NOTICES[opts.notice] : undefined;

    return {
      seo: { title: 'Mailing Lists', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_mailing_list_compose', title: 'Compose a Message',
        instructions: {
          what: 'Sends one plain-text email to everyone subscribed to this list.',
          how: 'Write the subject and message, then send.',
          headsUp: [
            'Sending happens straight away and cannot be undone.',
            'The list\'s subject prefix is added to your subject.',
            'Anyone who has unsubscribed, bounced or is otherwise undeliverable is left out.',
            'The send is recorded in the broadcast archive and the audit log.',
          ],
        },
      },
      content: {
        slug: list.slug,
        listName: list.name,
        formAction: `/admin/mailing-lists/${list.slug}/compose`,
        backHref: `/admin/mailing-lists/${list.slug}`,
        // A resubmitted form keeps its token, so the retry collapses onto the
        // send it already made; a freshly opened form gets a new one.
        sendToken: submitted?.sendToken || randomUUID(),
        subject: submitted?.subject ?? '',
        bodyText: submitted?.bodyText ?? '',
        subjectPrefixDisplay: list.subject_prefix,
        hasSubjectPrefix: list.subject_prefix.length > 0,
        fromIdentityDisplay: list.from_identity ?? 'The platform default sender',
        recipientCount: summary?.subscribed_count ?? 0,
        hasRecipients: (summary?.subscribed_count ?? 0) > 0,
        subjectMax: SUBJECT_MAX,
        bodyMax: BODY_MAX,
        notice: outcome ? outcome[1] : '',
        ...(outcome ? { noticeTone: outcome[0] } : {}),
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  /**
   * Sends a composed message to one list and records it. The enqueue path
   * resolves the audience and applies every delivery rule; this method decides
   * only what was written and that it was written down.
   */
  sendToList(
    slug: string,
    input: ComposeInput,
    actorMemberId: string,
    opts: {
      archiveType?: 'mailing_list' | 'announce';
      /** Who is sending, recorded as it happened: an administrator mailing a
       *  list, or a member announcing to the community. */
      actorType?: 'admin' | 'member';
    } = {},
  ): SendOutcome {
    const list = sendableList(slug);
    const compose = validateCompose(input);
    let outcome: SendOutcome = { status: 'noop', reason: 'no_recipients' };
    // The enqueue writes outbox rows in this same database, so it belongs
    // inside the transaction: a send that lands with no archive row is a
    // message the platform cannot account for afterwards.
    transaction(() => {
      outcome = sendToListInTx(list, compose, actorMemberId, opts);
    });
    return outcome;
  },

  /**
   * The form an organizer-tier member writes a community announcement on. The
   * same shape the administrator's compose form takes, pointed at the announce
   * list and at the member's own action, plus where the member's last
   * announcement stands: one awaiting review is said so, and one sent back
   * opens in the form with its text and the administrator's note.
   */
  getAnnouncePage(
    memberKey: string,
    memberId: string,
    opts: {
      submitted?: ComposeInput;
      agreeChecked?: boolean;
      summaryEventId?: string;
      fieldErrors?: Record<string, string>;
      notice?: string;
    } = {},
  ): PageViewModel<AnnounceContent> | null {
    const summaryChoices = summaryEventChoices(memberId);
    const latest = memberAnnouncements.findLatestForMember.get(memberId) as
      | { subject: string; body_text: string; status: string; admin_comment: string | null }
      | undefined;
    const isReturned = latest?.status === 'returned';
    // A sent-back announcement fills a fresh form; a re-rendered refusal keeps
    // what was just typed instead.
    const submitted = opts.submitted
      ?? (isReturned && latest ? { subject: latest.subject, bodyText: latest.body_text } : undefined);
    const vm = this.getComposePage(ANNOUNCE_LIST_SLUG, { ...opts, submitted });
    if (!vm) return null;
    const n = vm.content.recipientCount;
    const comment = latest?.admin_comment ?? '';
    // The note is quoted as the administrator wrote it; a note ending in its own
    // full stop or mark takes no second one after the closing quote.
    const afterQuote = /[.!?]$/.test(comment) ? '' : '.';
    return {
      ...vm,
      seo: { ...vm.seo, title: 'Community Announcement' },
      page: {
        ...vm.page,
        title: 'Send a Community Announcement',
        intro: `Write to the members who have subscribed to community announcements: an event you are running, a project, news worth the community's attention. It goes out from ${vm.content.fromIdentityDisplay}. An administrator reads each announcement before it goes out.`,
      },
      navigation: { contextLinks: [{ label: 'Back to My Profile', href: `/members/${memberKey}` }] },
      content: {
        ...vm.content,
        formAction: `/members/${memberKey}/announce`,
        backHref: `/members/${memberKey}`,
        agreeChecked: opts.agreeChecked ?? false,
        pendingNotice: latest?.status === 'pending' ? ONE_PENDING : null,
        returnedNotice: isReturned && comment
          ? `An administrator sent your last announcement back with this note: "${comment}"${afterQuote} Your text is below to change and submit again.`
          : null,
        recipientLine: n === 1
          ? '1 member currently receives these.'
          : `${n} members currently receive these.`,
        summaryEventOptions: summaryChoices.map((e) => ({
          value: e.id,
          label: `${e.title} (ended ${e.end_date})`,
          selected: e.id === opts.summaryEventId,
        })),
        hasSummaryEventOptions: summaryChoices.length > 0,
      },
    };
  },

  /**
   * A member's community announcement, held for an administrator's approval.
   * Nothing is sent here: the submit writes the announcement and raises its
   * review item, and the send happens only when another administrator approves
   * it. The same form submitted twice finds the row its first submit wrote and
   * reports that success; a member already waiting on one is refused a second.
   */
  submitAnnouncement(
    input: ComposeInput & { agree?: string; summaryEventId?: string },
    memberId: string,
  ): SubmitAnnouncementResult {
    let compose: ValidCompose | null = null;
    let fieldErrors: Record<string, string> = {};
    try {
      compose = validateCompose(input);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      fieldErrors = { ...(err.fieldErrors ?? {}) };
    }
    if (input.agree !== '1') fieldErrors.agree = AGREE_REQUIRED;
    // Marked as an event's after-event summary only for an event this member
    // organizes that still owes one.
    const summaryEventId = input.summaryEventId ? input.summaryEventId : null;
    if (summaryEventId && !summaryEventChoices(memberId).some((e) => e.id === summaryEventId)) {
      fieldErrors.summaryEventId = SUMMARY_EVENT_UNAVAILABLE;
    }
    if (!compose || Object.keys(fieldErrors).length) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }
    const valid = compose;

    let result: SubmitAnnouncementResult = { status: 'submitted' };
    try {
      transaction(() => {
        const prior = memberAnnouncements.findBySubmitToken.get(valid.sendToken) as
          | { member_id: string; subject: string; body_text: string }
          | undefined;
        if (prior) {
          if (prior.member_id === memberId && prior.subject === valid.subject
            && prior.body_text === valid.bodyText) {
            result = { status: 'own_repeat' };
            return;
          }
          // The token belongs to a submit this form can no longer stand for;
          // a fresh form carries a fresh one.
          if (!memberAnnouncements.findPendingForMember.get(memberId)) {
            throw new ValidationError(FORM_EXPIRED, { fieldErrors: { bodyText: FORM_EXPIRED } });
          }
        }
        if (memberAnnouncements.findPendingForMember.get(memberId)) {
          throw new ConflictError(ONE_PENDING);
        }
        const id = `mann_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const now = new Date().toISOString();
        memberAnnouncements.insert.run(
          id, now, memberId, now, memberId,
          memberId, valid.sendToken, valid.subject, valid.bodyText, summaryEventId,
        );
        // The queue row names the announcement and carries none of its words,
        // which stay on the announcement row the item page reads.
        workQueueService.enqueue({
          actorId: memberId,
          taskType: ANNOUNCEMENT_REVIEW_TASK_TYPE,
          entityType: 'member_announcement',
          entityId: id,
          reasonText: null,
          detailText: null,
        });
      });
    } catch (err) {
      // Two overlapping submits: the second meets the one-pending index.
      if (isUniqueViolation(err)) throw new ConflictError(ONE_PENDING);
      throw err;
    }
    return result;
  },

  /**
   * Another administrator approves a held announcement as written, which sends
   * it to the announce list under the member's name. The member's daily limit
   * is counted here, from what was actually sent, and the administrator may
   * tick to allow one more, which the audit row records. A repeat of the
   * administrator's own approval reports it without sending again or spending
   * a rate-limit slot.
   */
  approveAnnouncement(input: {
    queueItemId: string;
    adminMemberId: string;
    allowExtra: boolean;
  }): AnnouncementDecisionResult {
    const { item, announcement } = loadAnnouncementReview(input.queueItemId);
    const settled = settledDecision(announcement, input.adminMemberId, 'announce.approved');
    if (settled) return settled;

    enforceWorkQueueResolveLimit(input.adminMemberId);
    if (announcement.member_id === input.adminMemberId) {
      throw new ValidationError(SELF_APPROVE);
    }
    // The access the story grants is Tier 2 or Tier 3; an author who has lost
    // it, or whose account is no longer a full member's, cannot be sent for.
    const author = account.findNotificationContactById.get(announcement.member_id) as
      | { display_name: string }
      | undefined;
    if (!author || !account.findOwnSlugById.get(announcement.member_id)
      || !isTier2Plus(announcement.member_id)) {
      throw new ValidationError(TIER_LAPSED);
    }

    const list = sendableList(ANNOUNCE_LIST_SLUG);
    const compose = validateCompose({
      subject: announcement.subject,
      bodyText: announcement.body_text,
      // The announcement's own id is the send's token, so a second approval
      // can never mail the list twice.
      sendToken: announcement.id,
    });
    const perDay = readIntConfig('announce_send_rate_limit_per_day', 1);
    let result: AnnouncementDecisionResult = { status: 'approved', archiveId: '' };
    transaction(() => {
      const now = new Date();
      const nowIso = now.toISOString();
      const since = new Date(now.getTime() - DAY_IN_MINUTES * 60_000).toISOString();
      const sentToday = (emailArchives.countAnnounceSentSince.get(
        announcement.member_id, since,
      ) as { n: number }).n;
      const overLimit = sentToday >= perDay;
      if (overLimit && !input.allowExtra) throw new ValidationError(OVER_LIMIT);

      const sent = sendToListInTx(list, compose, input.adminMemberId, {
        archiveType: 'announce',
        actorType: 'admin',
        senderMemberId: announcement.member_id,
      });
      // Nobody can receive it: refused, and the announcement stays waiting,
      // because marking it approved would record a send that never happened.
      if (sent.status === 'noop' && sent.reason === 'no_recipients') {
        throw new ValidationError(COMPOSE_NOTICES.no_recipients[1]);
      }
      if (sent.status !== 'sent') {
        throw new Error(`announcement ${announcement.id} was already sent while still pending`);
      }
      if (memberAnnouncements.markApproved.run(
        input.adminMemberId, nowIso, sent.archiveId, nowIso, input.adminMemberId, announcement.id,
      ).changes !== 1) {
        throw new Error(`announcement ${announcement.id} left pending between its read and its approval`);
      }
      workQueue.resolve.run(
        nowIso, input.adminMemberId, 'approved', null, nowIso, input.adminMemberId, item.id,
      );
      const auditId = appendAuditEntry({
        actionType: 'announce.approved',
        actorType: 'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'member_announcement',
        entityId: announcement.id,
        // The words are on the archive row this names; the ledger keeps none.
        metadata: {
          archiveId: sent.archiveId,
          limitOverridden: overLimit,
          work_queue_item_id: item.id,
        },
      });
      emailService.sendActNotice({
        template: 'announce_approved',
        params: { memberName: author.display_name, subject: announcement.subject },
        memberId: announcement.member_id,
        actId: auditId,
      });
      result = { status: 'approved', archiveId: sent.archiveId };
    });
    return result;
  },

  /**
   * An administrator sends a held announcement back to the member with a
   * required note. Nothing is sent to the list and nothing counts against the
   * member's daily limit; the member is emailed the note, never their own body.
   */
  returnAnnouncement(input: {
    queueItemId: string;
    adminMemberId: string;
    comment: string;
  }): AnnouncementDecisionResult {
    const cleaned = sanitizeUserText(input.comment ?? '', 'multi_line');
    const comment = cleaned.status === 'ok' ? cleaned.text : '';
    if (cleaned.status === 'invalid_encoding') throw new ValidationError(INVALID_TEXT_ENCODING_MESSAGE);
    if (!comment) throw new ValidationError('A note to the member is required.');
    if (comment.length > RETURN_COMMENT_MAX) {
      throw new ValidationError(`The note must be ${RETURN_COMMENT_MAX} characters or fewer.`);
    }

    const { item, announcement } = loadAnnouncementReview(input.queueItemId);
    const settled = settledDecision(announcement, input.adminMemberId, 'announce.returned', comment);
    if (settled) return settled;

    enforceWorkQueueResolveLimit(input.adminMemberId);
    const author = account.findNotificationContactById.get(announcement.member_id) as
      | { display_name: string }
      | undefined;
    transaction(() => {
      const nowIso = new Date().toISOString();
      if (memberAnnouncements.markReturned.run(
        comment, input.adminMemberId, nowIso, nowIso, input.adminMemberId, announcement.id,
      ).changes !== 1) {
        throw new Error(`announcement ${announcement.id} left pending between its read and its return`);
      }
      workQueue.resolve.run(
        nowIso, input.adminMemberId, 'returned', null, nowIso, input.adminMemberId, item.id,
      );
      const auditId = appendAuditEntry({
        actionType: 'announce.returned',
        actorType: 'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'member_announcement',
        entityId: announcement.id,
        // The note stays on the announcement row, which erasure reaches; the
        // ledger, which it cannot, keeps none of it.
        metadata: { work_queue_item_id: item.id },
      });
      if (author) {
        emailService.sendActNotice({
          template: 'announce_returned',
          params: { memberName: author.display_name, subject: announcement.subject, comment },
          memberId: announcement.member_id,
          actId: auditId,
        });
      }
    });
    return { status: 'returned' };
  },

  /**
   * The send history, newest first, a page at a time, so every send stays
   * reachable however long the history grows.
   */
  getBroadcastIndexPage(requestedPage = 1): PageViewModel<BroadcastIndexContent> {
    const page = requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const total = (emailArchives.countAll.get() as { n: number }).n;
    const offset = (page - 1) * ARCHIVE_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
    const pageHref = (p: number) => (p > 1 ? `/admin/broadcasts?page=${p}` : '/admin/broadcasts');
    const rows = (emailArchives.listRecent.all(ARCHIVE_PAGE_SIZE, offset) as ArchiveRowWithList[]).map((row) => ({
      id: row.id,
      subject: row.subject,
      audienceLabel: audienceLabelOf(row),
      recipientCount: row.recipient_count,
      sentAtDisplay: tsDisplay(row.sent_at),
      detailHref: `/admin/broadcasts/${row.id}`,
    }));

    return {
      seo: { title: 'Broadcasts', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_broadcasts', title: 'Broadcasts',
        instructions: {
          what: 'Every mailing-list send, one entry per send.',
          why: 'To check what went out, when, and to which list.',
          how: 'Open an entry to read the subject and message as sent.',
          headsUp: ['No recipient is named here.'],
        },
      },
      content: {
        rows,
        hasRows: rows.length > 0,
        resultSummary: `Showing ${total === 0 ? 0 : offset + 1} to ${offset + rows.length} of ${total} send${total === 1 ? '' : 's'}.`,
        prevPageHref: page > 1 ? pageHref(page - 1) : null,
        nextPageHref: page < totalPages ? pageHref(page + 1) : null,
      },
    };
  },

  /** One archived send, or null when no row holds that id. */
  getBroadcastDetailPage(id: string): PageViewModel<BroadcastDetailContent> | null {
    const row = emailArchives.getById.get(id) as ArchiveRowWithList | undefined;
    if (!row) return null;

    return {
      seo: { title: 'Broadcasts', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_broadcast_detail', title: row.subject,
        instructions: {
          what: 'One send: its subject, its message, and how many copies were queued.',
        },
      },
      content: {
        id: row.id,
        subject: row.subject,
        bodyText: row.body_text,
        audienceLabel: audienceLabelOf(row),
        fromIdentityDisplay: row.from_identity ?? 'The platform default sender',
        recipientCount: row.recipient_count,
        sentAtDisplay: tsDisplay(row.sent_at),
        backHref: '/admin/broadcasts',
      },
    };
  },
};
