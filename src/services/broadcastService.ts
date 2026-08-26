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
 *     mailing the audience twice.
 *   - An archived list accepts no further sends, and a group-backed list is
 *     refused here rather than allowed to fail deep in the audience resolver.
 *   - Bodies are plain text. The subject stored on the archive row is the
 *     subject that went out, prefix included, so the record shows what
 *     recipients actually saw.
 *
 * Persistence: email_archives (write/read), mailing_lists (read),
 * outbox_emails (through the enqueue path, never directly).
 *
 * Side effects: outbox enqueue, audit_entries append.
 */
import { randomUUID } from 'crypto';

import {
  emailArchives,
  mailingLists,
  transaction,
  type EmailArchiveRow,
  type MailingListRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { getCommunicationService } from './communicationService';
import { readIntConfig } from './configReader';
import { hit as rateLimitHit } from './rateLimitService';
import { NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';

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
  hasNotice: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

/** What each send outcome says on the compose page it returns to. */
const COMPOSE_NOTICES: Record<string, string> = {
  sent: 'Queued. It goes out in paced batches over the next little while.',
  already_sent: 'That message was already sent. Nothing went out a second time.',
  no_recipients: 'Nothing was sent: nobody on this list has a deliverable address right now.',
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
  totalCount: number;
  hasRows: boolean;
  isCapped: boolean;
  pageSize: number;
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
        notice: opts.notice ? COMPOSE_NOTICES[opts.notice] ?? '' : '',
        hasNotice: Boolean(opts.notice && COMPOSE_NOTICES[opts.notice]),
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

    const subject = (input.subject ?? '').trim();
    const bodyText = (input.bodyText ?? '').replace(/\r\n/g, '\n').trim();
    const sendToken = (input.sendToken ?? '').trim();

    const errors: Record<string, string> = {};
    if (!subject) errors.subject = 'Subject: required.';
    else if (subject.length > SUBJECT_MAX) errors.subject = `Subject: at most ${SUBJECT_MAX} characters.`;
    if (!bodyText) errors.bodyText = 'Message: required.';
    else if (bodyText.length > BODY_MAX) errors.bodyText = `Message: at most ${BODY_MAX} characters.`;
    if (!sendToken) {
      // Without it the send has no idempotency key, and a re-submitted form
      // would mail the whole list a second time.
      errors.bodyText = 'This form has expired. Open the compose page again and resend.';
    }
    if (Object.keys(errors).length) {
      throw new ValidationError('Some fields need attention.', { fieldErrors: errors });
    }

    const sentSubject = applyPrefix(list.subject_prefix, subject);
    const archiveId = `bcast_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const now = new Date().toISOString();
    const communication = getCommunicationService();

    let outcome: SendOutcome = { status: 'noop', reason: 'no_recipients' };

    // The enqueue writes outbox rows in this same database, so it belongs
    // inside the transaction: a send that lands with no archive row is a
    // message the platform cannot account for afterwards.
    transaction(() => {
      const enqueued = communication.enqueue({
        audience: { kind: 'list', slug: list.slug },
        subject: sentSubject,
        bodyText,
        idempotencyKey: `broadcast:${sendToken}`,
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
        category: 'system',
        actorType: opts.actorType ?? 'admin',
        actorMemberId,
        entityType: 'mailing_list',
        entityId: list.slug,
        metadata: {
          archiveId,
          subject: sentSubject,
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

  /** The send history, newest first. */
  getBroadcastIndexPage(): PageViewModel<BroadcastIndexContent> {
    const rows = (emailArchives.listRecent.all(ARCHIVE_PAGE_SIZE) as ArchiveRowWithList[]).map((row) => ({
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
        totalCount: rows.length,
        hasRows: rows.length > 0,
        // The page shows the most recent sends rather than every one ever made;
        // saying so is what stops a full page reading as the whole history.
        isCapped: rows.length === ARCHIVE_PAGE_SIZE,
        pageSize: ARCHIVE_PAGE_SIZE,
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
