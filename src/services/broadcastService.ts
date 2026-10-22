/**
 * BroadcastService -- composing a send to an audience, and the record of what
 * was sent.
 *
 * Owns:
 *   - The compose surface: validating a subject and a plain-text body, applying
 *     the list's subject prefix, and handing the send to the one enqueue path
 *     by naming the audience.
 *   - The community announcement an organizer-tier member sends, which is the
 *     same list send with a per-member daily throttle, its own archive type,
 *     and a member rather than an administrator recorded as the actor.
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
 *
 * Persistence: email_archives (write/read), mailing_lists (read),
 * outbox_emails (through the enqueue path, never directly).
 *
 * Side effects: outbox enqueue, audit_entries append.
 */
import { createHash, randomUUID } from 'crypto';

import {
  emailArchives,
  mailingLists,
  outbox,
  transaction,
  type EmailArchiveRow,
  type MailingListRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { getCommunicationService } from './communicationService';
import { readIntConfig } from './configReader';
import { hit as rateLimitHit } from './rateLimitService';
import { NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
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
};

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
      page: { sectionKey: 'admin', pageKey: 'admin_mailing_list_compose', title: 'Compose a Message' },
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
    const { subject, bodyText } = compose;

    const sentSubject = applyPrefix(list.subject_prefix, subject);
    const archiveId = `bcast_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const now = new Date().toISOString();
    const communication = getCommunicationService();

    let outcome: SendOutcome = { status: 'noop', reason: 'no_recipients' };

    // The enqueue writes outbox rows in this same database, so it belongs
    // inside the transaction: a send that lands with no archive row is a
    // message the platform cannot account for afterwards.
    transaction(() => {
      // Checked inside the transaction, so two overlapping submits of one form
      // cannot both pass it: the same send under this form reports it was
      // sent, and a changed one is refused rather than reported sent.
      const prior = priorSendUnder(compose, actorMemberId);
      if (prior === 'same') {
        outcome = { status: 'noop', reason: 'already_sent' };
        return;
      }
      if (prior === 'changed') throw new ValidationError(ALREADY_SENT_CHANGED);

      const enqueued = communication.enqueue({
        audience: { kind: 'list', slug: list.slug },
        subject: sentSubject,
        bodyText,
        idempotencyKey: sendKey(compose, actorMemberId),
        fromIdentity: list.from_identity ?? undefined,
      });

      if (enqueued.recipients === 0) {
        outcome = { status: 'noop', reason: 'no_recipients' };
        return;
      }
      // Every row already existed, so this is the same form submitted again.
      // The send it made is already archived; a second row would double-count
      // one message in the record.
      if (enqueued.enqueued === 0 && enqueued.duplicates > 0) {
        outcome = { status: 'noop', reason: 'already_sent' };
        return;
      }

      emailArchives.insertArchive.run(
        archiveId, now, actorMemberId, now, actorMemberId,
        opts.archiveType ?? 'mailing_list', list.slug,
        actorMemberId, list.from_identity, sentSubject, bodyText, now, enqueued.enqueued,
      );

      appendAuditEntry({
        actionType: 'mailing_list.broadcast_sent',
        actorType: opts.actorType ?? 'admin',
        actorMemberId,
        entityType: 'mailing_list',
        entityId: list.slug,
        // The subject and body live on the archive row this names; the audit
        // log keeps no typed text, which a member announcement would carry.
        metadata: {
          archiveId,
          recipients: enqueued.recipients,
          enqueued: enqueued.enqueued,
          suppressed: enqueued.suppressed,
        },
      });

      outcome = {
        status: 'sent',
        archiveId,
        recipients: enqueued.recipients,
        enqueued: enqueued.enqueued,
        suppressed: enqueued.suppressed,
      };
    });

    return outcome;
  },

  /**
   * The compose form an organizer-tier member writes a community announcement
   * on. The same shape the administrator's compose form takes, pointed at the
   * announce list and at the member's own action.
   */
  getAnnouncePage(
    memberKey: string,
    opts: {
      submitted?: ComposeInput;
      fieldErrors?: Record<string, string>;
      notice?: string;
    } = {},
  ): PageViewModel<ComposeContent> | null {
    const vm = this.getComposePage(ANNOUNCE_LIST_SLUG, opts);
    if (!vm) return null;
    return {
      ...vm,
      page: { ...vm.page, title: 'Send a Community Announcement' },
      content: {
        ...vm.content,
        formAction: `/members/${memberKey}/announce`,
        backHref: `/members/${memberKey}`,
      },
    };
  },

  /**
   * An organizer-tier member's announcement to the community list. The send
   * itself is the ordinary list send; what belongs here is the throttle, which
   * exists because the sender is a member rather than an administrator and the
   * audience is everyone who subscribed.
   */
  sendAnnouncement(input: ComposeInput, actorMemberId: string): SendOutcome {
    // Validated, then recognised, then counted. The same form submitted twice
    // carries the same send token, and the first submit already queued its
    // messages under it: recognised before the daily allowance, so the repeat
    // spends none of it. The form resubmitted with its subject or body changed
    // is refused, not reported sent.
    const prior = priorSendUnder(validateCompose(input), actorMemberId);
    if (prior === 'same') return { status: 'noop', reason: 'already_sent' };
    if (prior === 'changed') throw new ValidationError(ALREADY_SENT_CHANGED);
    const perDay = readIntConfig('announce_send_rate_limit_per_day', 2);
    const rl = rateLimitHit(`announce-send:${actorMemberId}`, perDay, DAY_IN_MINUTES);
    if (!rl.allowed) {
      throw new RateLimitedError(
        `You have sent the announcements allowed for today. Try again in ${rl.retryAfterSeconds} seconds.`,
        rl.retryAfterSeconds,
      );
    }
    // Archived under its own type: the record should say a member announced to
    // the community, not that an administrator mailed a list.
    return this.sendToList(ANNOUNCE_LIST_SLUG, input, actorMemberId, {
      archiveType: 'announce',
      actorType: 'member',
    });
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
      page: { sectionKey: 'admin', pageKey: 'admin_broadcasts', title: 'Broadcasts' },
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
      page: { sectionKey: 'admin', pageKey: 'admin_broadcast_detail', title: row.subject },
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
