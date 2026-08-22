/**
 * MemberMessageService -- the direct question an administrator puts to one
 * member, and that member's answer.
 *
 * Owns:
 *   - Sending a question from the work-queue item that raised it: the
 *     member_messages row, the audit entry, and the content-free email nudge
 *   - The member's owner-only outstanding-question surface and its page shaping
 *   - Recording the member's answer: the structured outcome, the optional note,
 *     and, for a birth-date question, routing the correction to the service that
 *     owns the field
 *   - Clearing every free-text column on both erasure shapes
 *
 * Does not own:
 *   - The work-queue item itself, its status, or its closure (AdminWorkQueueService).
 *     A question never changes the item's status: it stays 'open' while it waits,
 *     because the de-duplication probe and both close paths select on that value,
 *     and an administrator still decides when the matter is finished.
 *   - The member's date of birth (MemberService owns the write; a correction is
 *     handed to it rather than written here)
 *   - Email delivery (CommunicationService outbox)
 *
 * Required patterns:
 *   - Free text never enters audit_entries metadata: the ledger is append-only
 *     and exempt from the PII purge, so the audit rows carry the expected answer
 *     kind and the body length, never the subject, the body, or the note. The
 *     text lives once, in the purgeable columns on member_messages.
 *   - Message content never travels by email. The nudge names no detail and
 *     carries no link, which is what lets the channel carry a date of birth at
 *     all; the member reads and answers in the application.
 *   - The member's surface is owner-only and slug-scoped. Ownership is part of
 *     the row lookup rather than a check afterwards, so another member's message
 *     id does not resolve at all.
 *   - Adversarial text in the member's note is stored verbatim in the purgeable
 *     column and escaped on render, matching the contact-request handling.
 *
 * Invariants preserved:
 *   - An answered row carries an outcome and an answered timestamp; an
 *     unanswered row carries neither (enforced by a table CHECK).
 *   - Answering is guarded on the current status, so a resubmitted answer is
 *     refused rather than overwriting the first.
 *
 * Transaction discipline:
 *   - The row write and its audit entry commit together. The email enqueue is an
 *     outbox insert in the same database and rides the same transaction, so a
 *     rolled-back send cannot leave a nudge announcing a question that does not
 *     exist.
 *
 * Persistence: member_messages (read and write), work_queue_items (read only),
 * audit_entries (append), outbox_emails (via the email service).
 *
 * Side effects: audit append (member_message.sent, member_message.answered),
 * outbox enqueue (member_question_waiting).
 */
import { randomUUID } from 'crypto';
import {
  memberMessages, workQueue, account, payments, recurringDonationSubscriptions, transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { emailService } from './emailService';
import { memberService, birthMonthOptions, SelectOption } from './memberService';
import { memberOnboardingService } from './memberOnboardingService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { BirthDateParts } from '../lib/birthDate';
import {
  navigateTo,
  urgentAction,
  type MemberActionContext,
  type MemberActionItem,
  type MemberActionSource,
} from './memberActionItem';

export const MAX_QUESTION_SUBJECT = 200;
export const MAX_QUESTION_BODY = 2000;
export const MAX_ANSWER_NOTE = 2000;

export type ExpectedAnswerKind = 'acknowledge' | 'confirm_birth_date';
export const ANSWER_KINDS: readonly ExpectedAnswerKind[] = ['acknowledge', 'confirm_birth_date'];
const ANSWER_KIND_SET: ReadonlySet<string> = new Set<string>(ANSWER_KINDS);

/**
 * The member a work-queue item is about, or null when it is about no single
 * member.
 *
 * This is the whole rule for which matters can carry a question, and it is
 * structural rather than a list of task types. A question always belongs to the
 * item that raised it, so an item naming one member names the person who can
 * answer it; an item naming a payout, a reconciliation discrepancy, or the
 * platform itself names nobody, and there is no one to ask.
 *
 * A list of permitted task types was the previous rule, kept in two places that
 * nothing held in step. It also failed silently in the one way that matters: a
 * matter deleted from the product left its name behind, and a matter added
 * gained no question channel until somebody remembered the list.
 *
 * The periodic club-cleanup queue stays outside this for a mechanical reason
 * rather than a policy one: it derives its items when the page is drawn rather
 * than storing them, and a question needs a stored row to hang off.
 */
function questionSubjectMemberId(item: { entity_type: string; entity_id: string }): string | null {
  if (item.entity_type === 'member') return item.entity_id;
  if (item.entity_type === 'payment') {
    const row = payments.findById.get(item.entity_id) as { member_id: string | null } | undefined;
    return row?.member_id ?? null;
  }
  if (item.entity_type === 'recurring_donation_subscription') {
    const row = recurringDonationSubscriptions.findById.get(item.entity_id) as
      | { member_id: string | null } | undefined;
    return row?.member_id ?? null;
  }
  return null;
}

/**
 * Whether this item can carry a question, and to whom.
 *
 * Three conditions, all about the person rather than the matter: the item has
 * to resolve to exactly one member, that member has to be someone there is
 * still any point asking, and they have to have finished signing up, because
 * the page a question is read on is a member surface an unfinished registrant
 * is held out of.
 */
export function questionRecipientFor(
  item: { entity_type: string; entity_id: string },
): { memberId: string; canRead: boolean } | null {
  const memberId = questionSubjectMemberId(item);
  if (!memberId) return null;
  // members_active and not purged, so a deleted or erased account is nobody to
  // ask. Nor is a member who has died: their account and their mailbox both
  // outlive the marking by at least the cleanup grace period, so without this
  // an administrator would be offered the control and the platform would mail
  // their address telling them to log in and answer.
  const member = memberMessages.findQuestionRecipient.get(memberId) as
    | { id: string; is_deceased: number }
    | undefined;
  if (!member || member.is_deceased === 1) return null;
  return { memberId, canRead: memberOnboardingService.isOnboardingComplete(memberId) };
}

export interface MemberQuestionView {
  messageId: string;
  subject: string;
  body: string;
  /** Pre-shaped so the template never branches on the stored enum. */
  asksBirthDate: boolean;
  sentAt: string;
  answerAction: string;
  /** What the member typed, echoed back on a rejected answer so they correct
   *  the one thing that was wrong instead of retyping all of it. Blank on a
   *  fresh render, and blank on every question except the one they answered. */
  day: string;
  year: string;
  note: string;
  confirmChecked: boolean;
  correctChecked: boolean;
  monthOptions: SelectOption[];
}

/** The member's rejected answer, handed back so the form can return their work. */
export interface SubmittedAnswer {
  messageId: string;
  dateAnswer: string;
  birth: BirthDateParts;
  note: string;
}

export interface MemberQuestionsContent {
  memberKey: string;
  questions: MemberQuestionView[];
  hasQuestions: boolean;
  profileHref: string;
  /** True on the redirect after an answer, so the member is told it landed. */
  answered?: boolean;
  error?: string;
}

function newMessageId(): string {
  return `mmsg_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function normalizeText(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

export const memberMessageService = {
  /**
   * Send one question to the member a work-queue item is about.
   *
   * The item keeps its status. What changes is that the card now shows a
   * question outstanding, so an administrator reading the queue knows the
   * matter is waiting on someone outside it.
   */
  sendQuestion(input: {
    queueItemId: string;
    adminMemberId: string;
    subject: unknown;
    body: unknown;
    expectedAnswerKind: unknown;
  }): { status: 'sent'; messageId: string } {
    const subject = normalizeText(input.subject);
    const body = normalizeText(input.body);
    const kind = normalizeText(input.expectedAnswerKind);

    if (!subject) throw new ValidationError('Give the question a subject.');
    if (subject.length > MAX_QUESTION_SUBJECT) {
      throw new ValidationError(`Subject must be ${MAX_QUESTION_SUBJECT} characters or fewer.`);
    }
    if (!body) throw new ValidationError('Write the question you want to ask.');
    if (body.length > MAX_QUESTION_BODY) {
      throw new ValidationError(`Question must be ${MAX_QUESTION_BODY} characters or fewer.`);
    }
    if (!ANSWER_KIND_SET.has(kind)) {
      throw new ValidationError('Choose what kind of answer you need.');
    }

    const item = workQueue.findById.get(input.queueItemId) as
      | { status: string; task_type: string; entity_type: string; entity_id: string }
      | undefined;
    const recipient = item && item.status === 'open' ? questionRecipientFor(item) : null;
    if (!recipient) {
      throw new NotFoundError(`No open item resolving to one member: ${input.queueItemId}`);
    }
    // The page a question is read on is a member surface, and the onboarding
    // gate holds an unfinished registrant out of it. Sending anyway would put a
    // question somewhere its recipient cannot reach and email them to go and
    // read it. The card hides the control for the same reason; this is the rule
    // behind it, so a crafted request does not get past it either.
    if (!recipient.canRead) {
      throw new ValidationError(
        'This member has not finished signing up yet, so they cannot read a question.',
      );
    }

    // One outstanding question per item. A second would leave the member with
    // two things to answer about one matter and the administrator with two
    // answers to reconcile.
    const outstanding = memberMessages.findUnansweredForQueueItem.get(input.queueItemId) as
      | { id: string }
      | undefined;
    if (outstanding) {
      throw new ValidationError('This item already has a question waiting for the member.');
    }

    const messageId = newMessageId();
    const now = new Date().toISOString();
    transaction(() => {
      memberMessages.insert.run(
        messageId, now, input.adminMemberId, now, input.adminMemberId,
        recipient.memberId, input.adminMemberId, input.queueItemId,
        subject, body, kind, now,
      );
      appendAuditEntry({
        actionType:    'member_message.sent',
        category:      'support',
        actorType:     'admin',
        actorMemberId: input.adminMemberId,
        entityType:    'member',
        entityId:      recipient.memberId,
        reasonText:    null,
        // The words themselves stay out of the ledger; what it records is that
        // a question was asked, what kind of answer it wants, and how long it was.
        metadata: {
          member_message_id:    messageId,
          queue_item_id:        input.queueItemId,
          expected_answer_kind: kind,
          body_length:          body.length,
        },
      });
      emailService.sendToMember({
        template:      'member_question_waiting',
        params:        {},
        memberId:      recipient.memberId,
        idempotencyKey: `member-question:${messageId}`,
      });
    });

    return { status: 'sent', messageId };
  },

  /** How many questions the member has waiting, for surfaces that only count. */
  countOutstanding(memberId: string): number {
    const row = memberMessages.countUnansweredForMember.get(memberId) as { c: number };
    return row.c;
  },

  /**
   * The member's own outstanding questions. Owner-only: the caller has already
   * been checked against the slug, and the rows are fetched by member id.
   */
  getQuestionsPage(
    slug: string,
    opts: { error?: string; answered?: boolean; submitted?: SubmittedAnswer } = {},
  ): PageViewModel<MemberQuestionsContent> {
    // The statement resolves a slug or an id, so it takes the key twice.
    const member = account.findActiveMemberByKey.get(slug, slug) as { id: string } | undefined;
    if (!member) throw new NotFoundError(`No member for slug: ${slug}`);

    const rows = memberMessages.listUnansweredForMember.all(member.id) as Array<{
      id: string; subject: string | null; body_text: string | null;
      expected_answer_kind: string; sent_at: string;
    }>;

    const submitted = opts.submitted;
    const questions: MemberQuestionView[] = rows.map((r) => {
      // Only the question the member actually answered gets their work back;
      // the others render empty, as they were.
      const own = submitted?.messageId === r.id ? submitted : null;
      return {
        messageId:      r.id,
        subject:        r.subject ?? '',
        body:           r.body_text ?? '',
        asksBirthDate:  r.expected_answer_kind === 'confirm_birth_date',
        sentAt:         r.sent_at,
        answerAction:   `/members/${slug}/questions/${r.id}/answer`,
        day:            own?.birth.day ?? '',
        year:           own?.birth.year ?? '',
        note:           own?.note ?? '',
        confirmChecked: own?.dateAnswer === 'confirm',
        correctChecked: own?.dateAnswer === 'correct',
        monthOptions:   birthMonthOptions(own?.birth.month ?? ''),
      };
    });

    return {
      seo:  { title: 'Questions for You', noindex: true },
      page: { sectionKey: 'members', pageKey: 'member_questions', title: 'Questions for You' },
      navigation: { contextLinks: [{ label: 'Back to Profile', href: `/members/${slug}` }] },
      content: {
        memberKey:    slug,
        questions,
        hasQuestions: questions.length > 0,
        profileHref:  `/members/${slug}`,
        answered:     opts.answered,
        error:        opts.error,
      },
    };
  },

  /**
   * Record the member's answer.
   *
   * A birth-date correction is applied through the service that owns the field,
   * before this row is marked answered, so a rejected date leaves the question
   * outstanding rather than closing it against a value that was never stored.
   */
  answerQuestion(input: {
    messageId: string;
    memberId: string;
    memberSlug: string;
    /** What the member chose. Absent means they chose nothing, which is asked
     *  again rather than assumed, because assuming "the date is correct" would
     *  close a fraud review with the opposite of what they meant. */
    dateAnswer: string;
    birth?: BirthDateParts;
    note: unknown;
  }): { status: 'answered'; outcome: 'acknowledged' | 'confirmed' | 'corrected' } {
    const note = normalizeText(input.note);
    if (note.length > MAX_ANSWER_NOTE) {
      throw new ValidationError(`Note must be ${MAX_ANSWER_NOTE} characters or fewer.`);
    }

    const row = memberMessages.findUnansweredForMember.get(input.messageId, input.memberId) as
      | { id: string; expected_answer_kind: string }
      | undefined;
    if (!row) throw new NotFoundError(`No question waiting: ${input.messageId}`);

    const hasTypedDate = Boolean(
      input.birth && (input.birth.day || input.birth.month || input.birth.year),
    );
    let outcome: 'acknowledged' | 'confirmed' | 'corrected' = 'acknowledged';
    let correction: BirthDateParts | null = null;

    if (row.expected_answer_kind === 'confirm_birth_date') {
      if (input.dateAnswer !== 'confirm' && input.dateAnswer !== 'correct') {
        throw new ValidationError(
          'Choose whether the date on your account is correct, or give the right one.',
        );
      }
      if (input.dateAnswer === 'confirm') {
        // A member who filled the boxes in and left the first option selected
        // meant to correct it. Silently discarding what they typed and closing
        // the question as confirmed would hand the reviewing administrator the
        // opposite of the answer, with no second chance.
        if (hasTypedDate) {
          throw new ValidationError(
            'You said the date on your account is correct but also entered a date. '
            + 'Choose the second option to change it, or clear the boxes.',
          );
        }
        outcome = 'confirmed';
      } else {
        if (!hasTypedDate) {
          throw new ValidationError('Enter the correct date of birth, or confirm the one on file.');
        }
        correction = input.birth!;
      }
    }

    const now = new Date().toISOString();
    transaction(() => {
      // Inside the transaction so the date, the note back to the review item and
      // the answer land together: a member must never be left with their date
      // changed and the question still open, or the reverse.
      if (correction) {
        // A submitted date equal to the one on file is a confirmation, whatever
        // box it arrived in, so the administrator is not told it was corrected.
        outcome = memberService.correctOwnBirthDateInTx(input.memberSlug, correction)
          ? 'corrected'
          : 'confirmed';
      }
      const result = memberMessages.recordAnswer.run(
        outcome, note || null, now, now, input.memberId, input.messageId,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`No question waiting: ${input.messageId}`);
      }
      appendAuditEntry({
        actionType:    'member_message.answered',
        category:      'support',
        actorType:     'member',
        actorMemberId: input.memberId,
        entityType:    'member',
        entityId:      input.memberId,
        reasonText:    null,
        metadata: {
          member_message_id:    input.messageId,
          expected_answer_kind: row.expected_answer_kind,
          outcome,
          note_length:          note.length,
        },
      });
    });

    return { status: 'answered', outcome };
  },
};

// ── The member's unanswered questions, as a dashboard action item ────────────

/**
 * An administrator is waiting on this member. Needs attention now: the question
 * blocks whatever the administrator raised it for, and the member is the only
 * one who can answer it.
 *
 * The item carries no part of the question. Subject and body are private and
 * are read only on the owner-only answer page the option links to, so nothing
 * private reaches the action block or the banner it drives.
 */
export const memberQuestionActionSource: MemberActionSource = {
  sourceKey: 'member_question',

  itemsFor(ctx: MemberActionContext): MemberActionItem[] {
    const waiting = memberMessageService.countOutstanding(ctx.memberId);
    if (waiting === 0) return [];
    return [urgentAction({
      kind: 'member_question_waiting',
      headline: waiting === 1
        ? 'An IFPA administrator has a question for you'
        : `An IFPA administrator has ${waiting} questions for you`,
      options: [navigateTo('Answer', `/members/${ctx.slug}/questions`)],
    })];
  },
};
