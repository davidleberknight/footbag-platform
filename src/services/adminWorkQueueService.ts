/**
 * AdminWorkQueueService -- the admin work-queue page and dashboard summary, plus
 * the member contact-IFPA-admin requests that feed the queue.
 *
 * Owns:
 *   - Contact-request submission (category-validated, per-member open-request cap),
 *     except the identity-link category, which is handed to the link-help
 *     workflow because an administrator answers it by applying a link
 *   - Contact-request resolution (decision label + admin note + member notification)
 *   - Resolution of the system-raised payments tasks (unattributed refund,
 *     partial-refund review, charge-dispute review, failed payout, recurring
 *     charge declined, recurring paused): decision label + admin note, recorded
 *     with admin identity and timestamp, and NO member email
 *   - Dismissal of internal-review items that have no member reply (the
 *     low-confidence auto-link match and the administrator-loss recruitment
 *     alert): closes the row with an audit entry
 *     and sends NO member email, unlike contact-request resolution
 *   - Admin work-queue page shaping (all open items grouped by category,
 *     including structured link-help payload display) and the per-category
 *     summary for the admin dashboard work-queue card
 *
 * Does not own:
 *   - Link-help request workflow (IdentityAccessService; this service routes the
 *     identity-link intake to it and shapes the payload for display)
 *   - Reconciliation-discrepancy resolution (PaymentReconciliationService, which
 *     closes the discrepancy's queue twin in the same transaction). Those items
 *     are not resolvable through the generic resolve path here.
 *   - Work-queue resolve rate limiting (IdentityAccessService.enforceWorkQueueResolveLimit,
 *     shared bucket across all resolve actions, including payments resolves)
 *   - Email delivery (CommunicationService outbox)
 *
 * Required patterns:
 *   - Free text never enters audit_entries metadata (the ledger is append-only
 *     and exempt from PII purge): audit carries only the category and message
 *     length. That covers the member's own words and equally the administrator's
 *     resolution or dismissal note, which is written about a member. The full
 *     message is held once in the mutable work_queue_items.detail_text column and
 *     the administrator's note in reason_text, both of which the account-erasure
 *     purge and the deceased contact scrub redact. The resolution email is
 *     templated and does not echo the member's message back.
 *   - Work-queue UPDATE and the resolution audit row commit in one
 *     transaction; the member notification enqueue happens after commit and
 *     records an operational error on failure instead of rolling back.
 *   - A resolve is validated against its task family: the decision label set for
 *     a payments task is distinct from the contact-request set and never crosses.
 *     Only the six payments task types and the contact-request type resolve here;
 *     any other open item is reported not-found, the same answer as an unknown id.
 *   - Per-member open-request cap is 3, counted across every request the member
 *     raised themselves (contact requests and link-help requests alike) and
 *     freed as each is answered; the 4th open submission throws
 *     RateLimitedError. Items the platform raised about a member never count.
 *     Message body is capped at 2000 characters, the resolution note at 500.
 *
 * Persistence:
 *   work_queue_items, audit_entries.
 *
 * Side effects:
 *   - audit_entries append (support.contact_request_submitted / _resolved;
 *     payment.queue_item_resolved on a payments-task resolution; and the
 *     dismissal event each internal-review task type names for itself, such as
 *     legacy.auto_link_match_reviewed on a low-confidence auto-link dismissal)
 *   - outbox_emails enqueue (admin-alerts fan-out on submit; member
 *     notification on a contact-request resolve; NONE on a payments-task
 *     resolution or a review dismissal)
 *   - operational-error audit + alarm on post-commit notification failure
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import { workQueue, memberMessages, account, transaction } from '../db/db';
import {
  enforceWorkQueueResolveLimit, identityAccessService,
  type ClaimEvidence,
} from './identityAccessService';
import { appendAuditEntry } from './auditService';
import { emailService } from './emailService';
import { workQueueService, claimIsLive, claimStaleCutoffIso } from './workQueueService';
import {
  questionRecipientFor, ANSWER_KINDS, type ExpectedAnswerKind,
} from './memberMessageService';
import { recordOperationalError } from './operationalErrors';
import { runSqliteRead } from './sqliteRetry';
import { NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

export const CONTACT_CATEGORIES = [
  'display_name_correction',
  'profile_url_correction',
  'tier_status_question',
  'identity_link_issue',
  'other',
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  display_name_correction: 'Display name correction',
  profile_url_correction:  'Profile URL correction',
  tier_status_question:    'Tier-status question',
  identity_link_issue:     'Identity-link issue',
  other:                   'Other',
};

export const DECISION_LABELS = [
  'corrected',
  'denied',
  'duplicate',
  'out_of_scope',
] as const;
export type DecisionLabel = (typeof DECISION_LABELS)[number];

export const DECISION_LABEL_DISPLAY: Record<DecisionLabel, string> = {
  corrected:    'Corrected',
  denied:       'Denied',
  duplicate:    'Duplicate',
  out_of_scope: 'Out of scope',
};

// The decisions an admin records when closing a system-raised payments task.
// Every payments task ends one of three ways: the admin fixed it on the Stripe
// side (a dispute worked, a payout's bank details were repaired, a stray refund
// was located in the dashboard), the event needed no action (an expected pause,
// a test charge), or a platform-side follow-up was completed. These are a
// distinct set from the contact-request decisions and never cross.
export const PAYMENT_DECISION_LABELS = [
  'handled_in_stripe',
  'no_action_needed',
  'follow_up_complete',
] as const;
export type PaymentDecisionLabel = (typeof PAYMENT_DECISION_LABELS)[number];

export const PAYMENT_DECISION_LABEL_DISPLAY: Record<PaymentDecisionLabel, string> = {
  handled_in_stripe:  'Handled in Stripe',
  no_action_needed:   'No action needed',
  follow_up_complete: 'Follow-up complete',
};

const TASK_TYPE = 'member_contact_request';
// The other queue a member can put work into themselves. Everything else in the
// queue is raised by the platform about a member, not by the member.
const LINK_HELP_TASK_TYPE = 'member_link_help_request';

// The system-raised payments tasks an admin closes through the generic resolve
// form. Resolving one records the decision and note but sends no email: these
// rows point at provider-side records, and any member-facing message already
// went out when the underlying event was recorded.
const PAYMENTS_RESOLVABLE_TASK_TYPES: ReadonlySet<string> = new Set([
  'unattributed_refund',
  'partial_refund_review',
  'refund_failed_review',
  'charge_dispute_review',
  'payout_failed',
  'recurring_donation_charge_declined',
  'recurring_donation_paused',
]);

// The entity a payments task legitimately points at, per task type. A row whose
// entity type falls outside this set is corrupt, reported the same way the
// contact path reports a non-member entity.
const PAYMENTS_TASK_ENTITY_TYPES: Record<string, ReadonlySet<string>> = {
  unattributed_refund:                new Set(['stripe_payment_intent', 'stripe_charge']),
  partial_refund_review:              new Set(['payment']),
  refund_failed_review:               new Set(['stripe_refund']),
  charge_dispute_review:              new Set(['stripe_dispute']),
  payout_failed:                      new Set(['stripe_payout']),
  recurring_donation_charge_declined: new Set(['recurring_donation_subscription']),
  recurring_donation_paused:          new Set(['recurring_donation_subscription']),
};

// Human labels for the entity a queue card points at, so the admin sees "Stripe
// dispute di_123" rather than a bare id. A member entity is intentionally absent:
// those rows render the member's name link instead.
const ENTITY_REFERENCE_LABELS: Record<string, string> = {
  payment:                         'Payment record',
  stripe_payment_intent:           'Stripe payment intent',
  stripe_charge:                   'Stripe charge',
  stripe_refund:                   'Stripe refund',
  stripe_dispute:                  'Stripe dispute',
  stripe_payout:                   'Stripe payout',
  recurring_donation_subscription: 'Recurring donation',
  reconciliation_issue:            'Reconciliation issue',
};
const MAX_OPEN_PER_MEMBER = 3;
const MAX_MESSAGE_LEN = 2000;
const MAX_REASON_TEXT = 200;
const MAX_RESOLUTION_NOTE = 500;

export interface ContactRequestSubmitInput {
  requestingMemberId: string;
  category: ContactCategory;
  message: string;
}

export interface WorkQueueResolveInput {
  queueItemId: string;
  adminMemberId: string;
  /** Validated in-service against the decision set of the item's task family
   *  (contact-request decisions or payments decisions), so the raw request
   *  string arrives here unnarrowed. */
  decisionLabel: string;
  resolutionNote: string;
}

export interface ContactRequestRow {
  id: string;
  openedAtIso: string;
  queueCategory: string;
  taskType: string;
  entityType: string;
  entityId: string;
  entityHref: string | null;
  entityDisplayName: string | null;
  reasonText: string | null;
  detailText: string | null;
  claimedByMemberId: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
}

function validateCategory(c: unknown): ContactCategory {
  if (typeof c !== 'string' || !CONTACT_CATEGORIES.includes(c as ContactCategory)) {
    throw new ValidationError(`Invalid category: ${String(c)}`);
  }
  return c as ContactCategory;
}

function validateDecisionLabel(d: unknown): DecisionLabel {
  if (typeof d !== 'string' || !DECISION_LABELS.includes(d as DecisionLabel)) {
    throw new ValidationError(`Invalid decision label: ${String(d)}`);
  }
  return d as DecisionLabel;
}

function validatePaymentDecisionLabel(d: unknown): PaymentDecisionLabel {
  if (typeof d !== 'string' || !PAYMENT_DECISION_LABELS.includes(d as PaymentDecisionLabel)) {
    throw new ValidationError(`Invalid decision label: ${String(d)}`);
  }
  return d as PaymentDecisionLabel;
}

// Admin work-queue page-model builder. The work-queue groups every open
// admin task by `queueCategory` and renders a uniform decision-action
// form per row. Category and task-type display labels live here so the
// admin controller stays a thin HTTP adapter.

const WORK_QUEUE_CATEGORY_LABELS: Record<string, string> = {
  events:          'Events',
  media:           'Media',
  membership:      'Membership',
  payments:        'Payments',
  elections:       'Elections',
  system:          'System',
  club_leadership: 'Club leadership',
};

const WORK_QUEUE_TASK_TYPE_LABELS: Record<string, string> = {
  member_contact_request:    'Member contact request',
  auto_link_match:           'Auto-link match',
  member_link_help_request:  'Member link help request',
  recurring_donation_charge_declined: 'Recurring donation renewal charge declined',
  reconciliation_discrepancy: 'Payment reconciliation discrepancy',
  unattributed_refund: 'Refund with no matching payment record',
  partial_refund_review: 'Partially refunded payment',
  refund_failed_review: 'Refund that could not be returned to the card',
  charge_dispute_review: 'Card dispute raised against a payment',
  payout_failed: 'Payout to the bank account failed',
  recurring_donation_paused: 'Recurring donation paused at Stripe',
  admin_loss_recruitment: 'Administrator lost; recruit a replacement',
};

// Internal-review items an admin closes with a dismissal (no member reply, no
// email), distinct from the contact-request resolve path. The generic resolve
// form does not apply to these; the page renders a dismiss control instead.
// Each type names the audit event its dismissal records, because the ledger is
// append-only: a shared event name would file one type's review under another's
// and the wrong entry could never be corrected.
const DISMISSIBLE_REVIEW_AUDIT: ReadonlyMap<string, { actionType: string; category: string; reasonText: string; hint: string }> = new Map([
  ['auto_link_match', {
    actionType: 'legacy.auto_link_match_reviewed',
    category:   'identity',
    reasonText: 'Low-confidence auto-link match reviewed; no link applied.',
    hint:       'No link was applied, so there is nothing to undo. To link this member, use the member link-help path.',
  }],
  ['admin_loss_recruitment', {
    actionType: 'admin.loss_alert_dismissed',
    category:   'admin',
    reasonText: 'Administrator-loss recruitment alert reviewed and closed.',
    hint:       'Dismiss this once a replacement admin volunteer is recruited, or once the team agrees the current admin roster is sufficient. Granting the role to the replacement is done on the admin roles page.',
  }],
]);

const DISMISSIBLE_REVIEW_TASK_TYPES: ReadonlySet<string> = new Set(DISMISSIBLE_REVIEW_AUDIT.keys());

// Which matters may carry a question is decided by memberMessageService, on the
// single structural rule that the item resolves to one live, signed-up member.
// The card asks that service rather than keeping a second copy of the answer:
// two lists in two files were what let the control render on a matter the send
// path then refused, with a message that named the wrong reason.

/** One question put to the member on this item, as the administrator sees it. */
export interface MemberQuestionAdminView {
  subject: string | null;
  body: string | null;
  answerKindLabel: string;
  isAnswered: boolean;
  /** The structured answer in words; null while the question is outstanding. */
  outcomeLabel: string | null;
  note: string | null;
  sentAtDisplay: string;
  answeredAtDisplay: string | null;
}

export interface WorkQueueViewItem {
  id: string;
  queueCategory: string;
  taskType: string;
  taskTypeLabel: string;
  openedAtIso: string;
  openedAtDisplay: string;
  entityType: string;
  entityId: string;
  entityHref: string | null;
  entityDisplayName: string | null;
  /**
   * The member's administrator record, for an item an administrator answers by
   * changing the member's own row. Resolving the request means going there and
   * coming back, so the card carries the way through rather than leaving the
   * administrator to look the member up by hand. Null for a non-member entity.
   */
  memberRecordHref: string | null;
  reasonText: string | null;
  /** Full member-authored message (e.g. a contact request), shown to the admin
   *  so they can act on the whole request. Null for non-message task types. */
  detailText: string | null;
  /** The provider or domain record this task points at, rendered as
   *  "<label> <id>" on the card. Null for member-entity rows, where the
   *  member's name link already identifies the subject. */
  entityReference: { label: string; id: string } | null;
  decisionLabels: Array<{ value: string; label: string }>;
  /** Member link-help requests render structured payload + approve/reject
   * forms instead of the generic resolve form. */
  isLinkHelpRequest: boolean;
  /** Internal-review flags (a low-confidence auto-link match, an
   * administrator-loss recruitment alert) render a dismiss control instead of
   * the generic resolve form, which does not apply to them. */
  isReviewFlag: boolean;
  /** What dismissing this review type does and does not undo, worded per type
   * because the two say opposite things about an applied link. */
  reviewHint: string | null;
  /** A reconciliation discrepancy is resolved on the reconciliation page, not
   *  here; its card links there instead of rendering the resolve form. */
  isReconciliationItem: boolean;
  /** True when the card renders the generic decision + note resolve form
   *  (contact requests and the system-raised payments tasks). */
  showResolveForm: boolean;
  /** Placeholder wording for the note field: a contact-request note is emailed
   *  to the member; a payments note is an internal record. */
  resolutionNotePlaceholder: string;
  /** Claim state for the claim-and-digest flow: an unclaimed item shows a
   *  Claim control; a claimed item shows who is handling it. `claimedByMe`
   *  distinguishes the viewing admin's own claim from another admin's. */
  isClaimed: boolean;
  claimedByMe: boolean;
  claimedByName: string | null;
  /** Who held a claim that has since lapsed, so the card can say the item is
   *  free again without losing who last looked at it. Null when the claim is
   *  live or the item was never claimed. */
  lapsedClaimByName: string | null;
  /** Whether this item's matter can be put to the member as a direct question.
   *  Only the two that genuinely need the member's own answer, and only once
   *  the member can actually reach the page it is read on. */
  canAskMember: boolean;
  /** A draft question for this matter, or null where there is nothing to suggest. */
  askPrefill: { subject: string; body: string; answerKind: string } | null;
  /** True on the card a deep link named, so its composer is already open. */
  askOpen: boolean;
  /**
   * What the ledger says about this member's past claim attempts, rendered on
   * the matters that ask an administrator to judge an identity. Empty elsewhere.
   */
  claimEvidence: ClaimEvidence | null;
  /** Why the control is absent on an item that would otherwise carry it. Null
   *  when it is shown, and on every item the channel does not serve. */
  askBlockedReason: string | null;
  /** Set while a question is waiting on the member, so the card says the item
   *  is blocked on someone outside the queue rather than on an administrator.
   *  The item's status stays open throughout. */
  awaitingMemberSince: string | null;
  /** Questions already put to this member on this item, newest last, with the
   *  answer where one has come back. */
  memberQuestions: MemberQuestionAdminView[];
  linkHelp: {
    statement: string;
    isDispute: boolean;
    /** The records this dispute named when it was filed, detected server-side.
     *  The revert accepts only one of these, so the card must show them: without
     *  them an administrator has no way to learn an id the action will take. */
    disputedRecords: Array<{ kindLabel: string; recordId: string }>;
    hasDisputedRecords: boolean;
  } | null;
}

export interface WorkQueueGroup {
  category: string;
  categoryLabel: string;
  items: WorkQueueViewItem[];
}

export interface WorkQueueContent {
  groups: WorkQueueGroup[];
  totalOpen: number;
  resolvedFlag: boolean;
  /** A resolution that notified no member (a system-raised payments task, or a
   *  contact request whose member has no email): confirmed without claiming an
   *  email went out. */
  resolvedQuietFlag: boolean;
  reviewedFlag: boolean;
  claimedFlag: boolean;
  claimNoopFlag: boolean;
  /** A question has just been put to the member, confirmed on the re-render so
   *  the administrator knows it went and does not send a second. */
  memberAskedFlag: boolean;
  /**
   * The kinds of answer a question can ask for, as value-and-label pairs.
   *
   * Built from the one list the send path validates against, so the dropdown
   * cannot come to offer a kind the service refuses, or miss one it accepts.
   */
  answerKindOptions: Array<{ value: string; label: string }>;
  errorMessage: string | null;
}

// Per-category counts for the admin dashboard work-queue card. `hasUrgent` is
// true when any open item in the category carries a non-default priority.
export interface WorkQueueSummaryCategory {
  category: string;
  label: string;
  count: number;
  hasUrgent: boolean;
  href: string;
}

export interface WorkQueueSummary {
  categories: WorkQueueSummaryCategory[];
  totalOpen: number;
  hasOpen: boolean;
}

function parseLinkHelpPayload(reasonText: string | null): WorkQueueViewItem['linkHelp'] {
  if (!reasonText) return null;
  try {
    const p = JSON.parse(reasonText) as Record<string, unknown>;
    const idList = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
    const disputedRecords = [
      ...idList(p.disputed_legacy_member_ids)
        .map((recordId) => ({ kindLabel: 'Legacy account', recordId })),
      ...idList(p.disputed_historical_person_ids)
        .map((recordId) => ({ kindLabel: 'Competition record', recordId })),
    ];
    return {
      statement:             typeof p.statement === 'string' ? p.statement : '',
      isDispute:             p.is_dispute === true,
      disputedRecords,
      hasDisputedRecords:    disputedRecords.length > 0,
    };
  } catch {
    return null;
  }
}

function shapeWorkQueueItem(
  raw: ContactRequestRow,
  viewingAdminId: string,
  askItemId: string | null,
): WorkQueueViewItem {
  const isLinkHelpRequest = raw.taskType === 'member_link_help_request';
  const isReviewFlag = DISMISSIBLE_REVIEW_TASK_TYPES.has(raw.taskType);
  const isReconciliationItem = raw.taskType === 'reconciliation_discrepancy';
  const isPaymentsResolvable = PAYMENTS_RESOLVABLE_TASK_TYPES.has(raw.taskType);
  const isContactRequest = raw.taskType === TASK_TYPE;
  // A claim expires, so an item whose holder never came back is offered to
  // everyone again rather than sitting silently under a name.
  const isClaimed = claimIsLive(raw.claimedAt, claimStaleCutoffIso());

  // Only a matter that genuinely needs the member's own answer can be put to
  // them: a link-help request, whose evidence only they hold.
  //
  // And only once they can actually read it. A link-help request is raised
  // inside the onboarding wizard, while the page a question is read on is a
  // member surface the wizard gate holds them out of. Offering the control
  // before then would send a question its recipient cannot see and an email
  // telling them to go and look at it.
  const recipient = questionRecipientFor({ entity_type: raw.entityType, entity_id: raw.entityId });
  const askable = recipient !== null;
  const memberCanRead = recipient?.canRead ?? false;
  const canAskMember = askable && memberCanRead;
  const questions = askable ? buildMemberQuestions(raw.id) : [];

  // The resolve form applies to contact requests and the system-raised payments
  // tasks; link-help, review flags, and reconciliation twins each have their own
  // control (or none). A card outside those families shows no form.
  const showResolveForm = isContactRequest || isPaymentsResolvable;
  const decisionLabels = isPaymentsResolvable
    ? PAYMENT_DECISION_LABELS.map((d) => ({ value: d, label: PAYMENT_DECISION_LABEL_DISPLAY[d] }))
    : isContactRequest
      ? DECISION_LABELS.map((d) => ({ value: d, label: DECISION_LABEL_DISPLAY[d] }))
      : [];

  // The member entity is identified by its name link, not a raw id; every other
  // entity shows a labelled reference so the admin can cross-reference in Stripe.
  const entityReference = raw.entityType === 'member'
    ? null
    : { label: ENTITY_REFERENCE_LABELS[raw.entityType] ?? raw.entityType, id: raw.entityId };

  return {
    id: raw.id,
    queueCategory: raw.queueCategory,
    taskType: raw.taskType,
    taskTypeLabel: WORK_QUEUE_TASK_TYPE_LABELS[raw.taskType] ?? raw.taskType,
    openedAtIso: raw.openedAtIso,
    openedAtDisplay: raw.openedAtIso.slice(0, 10),
    entityType: raw.entityType,
    entityId: raw.entityId,
    entityHref: raw.entityHref,
    entityDisplayName: raw.entityDisplayName,
    memberRecordHref: raw.entityType === 'member' ? `/admin/members/${raw.entityId}` : null,
    // The link-help payload renders structured below; raw JSON would be noise.
    reasonText: isLinkHelpRequest ? null : raw.reasonText,
    detailText: isLinkHelpRequest ? null : raw.detailText,
    entityReference,
    decisionLabels,
    isLinkHelpRequest,
    isReviewFlag,
    reviewHint: DISMISSIBLE_REVIEW_AUDIT.get(raw.taskType)?.hint ?? null,
    isReconciliationItem,
    showResolveForm,
    resolutionNotePlaceholder: isContactRequest
      ? 'Sent to the member by email'
      : 'Internal note; kept on the queue record',
    isClaimed,
    claimedByMe: isClaimed && raw.claimedByMemberId === viewingAdminId,
    claimedByName: raw.claimedByName,
    // A lapsed claim still names who had it, so the next administrator can ask
    // rather than duplicating work already done.
    lapsedClaimByName: !isClaimed && raw.claimedByName !== null ? raw.claimedByName : null,
    linkHelp: isLinkHelpRequest ? parseLinkHelpPayload(raw.reasonText) : null,
    canAskMember,
    // Said plainly on the card, so an administrator who expected the control
    // knows it is a matter of timing rather than a missing feature.
    askBlockedReason: askable && !memberCanRead
      ? 'This member has not finished signing up yet, so they cannot read a question. The control appears once they have.'
      : null,
    awaitingMemberSince: questions.find((q) => !q.isAnswered)?.sentAtDisplay ?? null,
    memberQuestions: questions,
    // The evidence an identity decision is actually made on. Offered only on
    // the matters that ask an administrator to judge one, because everywhere
    // else it is a member's claim history shown for no reason.
    askPrefill: canAskMember ? ASK_PREFILLS[raw.taskType] ?? null : null,
    askOpen: canAskMember && raw.id === askItemId,
    claimEvidence: isLinkHelpRequest
      ? identityAccessService.getClaimEvidenceForMember(raw.entityId)
      : null,
  };
}

// Exhaustive by type: adding a kind to the vocabulary fails the build here until
// it is given a label, rather than rendering its raw stored value to an
// administrator.
const ANSWER_KIND_LABELS: Record<ExpectedAnswerKind, string> = {
  acknowledge:        'Read and reply',
  confirm_birth_date: 'Confirm or correct their date of birth',
};

const ANSWER_KIND_OPTIONS = ANSWER_KINDS.map((value) => ({
  value,
  label: ANSWER_KIND_LABELS[value],
}));

/**
 * A starting point for the question, per matter, so an administrator opening the
 * composer is not staring at an empty box wondering what this channel is for.
 *
 * It is a draft and not a template: every field is editable, and the words that
 * actually reach the member are the ones the administrator leaves behind. A
 * matter with nothing useful to suggest gets an empty composer rather than
 * generic filler, which would be worse than blank.
 */
const ASK_PREFILLS: Record<string, { subject: string; body: string; answerKind: ExpectedAnswerKind }> = {
  member_link_help_request: {
    subject: 'About your old footbag.org records',
    answerKind: 'confirm_birth_date',
    body: 'Thanks for asking us to look. To find your old record we match on your date of birth, '
      + 'so it helps to be sure of the one on your account. Could you confirm it, or correct it if '
      + 'it is wrong? Anything else you remember about the old account is welcome too.',
  },
};

/** The stored kind in words, falling back to the raw value for an unknown one. */
function answerKindLabel(raw: string): string {
  return (ANSWER_KINDS as readonly string[]).includes(raw)
    ? ANSWER_KIND_LABELS[raw as ExpectedAnswerKind]
    : raw;
}

const OUTCOME_LABELS: Record<string, string> = {
  acknowledged: 'Read it',
  confirmed:    'Confirmed the date on file is right',
  corrected:    'Corrected the date',
};

/** The questions put to the member on one item, oldest first. */
function buildMemberQuestions(queueItemId: string): MemberQuestionAdminView[] {
  const rows = memberMessages.listForQueueItem.all(queueItemId) as Array<{
    subject: string | null; body_text: string | null; expected_answer_kind: string;
    status: string; outcome: string | null; note_text: string | null;
    sent_at: string; answered_at: string | null;
  }>;
  return rows.map((r) => ({
    subject:           r.subject,
    body:              r.body_text,
    answerKindLabel:   answerKindLabel(r.expected_answer_kind),
    isAnswered:        r.status === 'answered',
    outcomeLabel:      r.outcome ? (OUTCOME_LABELS[r.outcome] ?? r.outcome) : null,
    note:              r.note_text,
    sentAtDisplay:     r.sent_at.slice(0, 10),
    answeredAtDisplay: r.answered_at ? r.answered_at.slice(0, 10) : null,
  }));
}

// Resolve a contact request: record the decision and note, then email the
// requesting member. The queue UPDATE and the audit row commit together; the
// email is enqueued after commit and a failure there surfaces as a 503 without
// rolling the resolution back.
async function resolveContactRequestItem(
  row: { entity_type: string; entity_id: string },
  input: WorkQueueResolveInput,
  note: string,
): Promise<{ status: 'resolved'; memberNotified: boolean }> {
  const decisionLabel = validateDecisionLabel(input.decisionLabel);
  if (row.entity_type !== 'member') {
    throw new ValidationError('Unexpected entity type on contact-request row.');
  }

  const nowIso = new Date().toISOString();
  transaction(() => {
    const result = workQueue.resolve.run(
      nowIso,
      input.adminMemberId,
      decisionLabel,
      note.slice(0, MAX_RESOLUTION_NOTE),
      nowIso,
      input.adminMemberId,
      input.queueItemId,
    );
    if (result.changes === 0) {
      throw new NotFoundError(`Open contact request not found: ${input.queueItemId}`);
    }
    appendAuditEntry({
      actionType:    'support.contact_request_resolved',
      category:      'support',
      actorType:     'admin',
      actorMemberId: input.adminMemberId,
      entityType:    'member',
      entityId:      row.entity_id,
      reasonText:    decisionLabel,
      // Free text stays out of the metadata: the audit ledger is append-only
      // and exempt from PII purge, so anything personal in it would survive
      // erasure. That holds for the administrator's resolution note as much as
      // for the member's own words -- the note is written about a member, and
      // administrator messages are held in purgeable columns and cleared on
      // erasure. The mutable work-queue row keeps the operational copy; the
      // ledger keeps the decision.
      metadata:      {
        queue_item_id: input.queueItemId,
        decision_label: decisionLabel,
      },
    });
  });

  const member = account.findContactInfoById.get(row.entity_id) as
    | { id: string; slug: string; display_name: string; login_email: string }
    | undefined;
  if (!member || !member.login_email) {
    return { status: 'resolved', memberNotified: false };
  }
  const displayDecision = DECISION_LABEL_DISPLAY[decisionLabel];

  // Strict enqueue: an outbox failure after the resolve committed must surface to
  // the admin as a 503 rather than silently drop the member's resolution
  // notification. The queue row stays resolved and the audit row is in place;
  // recordOperationalError pairs a *_notification_failed audit row with a
  // logger.error marker for operator triage. The terminal-state idempotency key
  // collapses re-enqueue attempts.
  // The send reports suppression rather than throwing when the template has
  // been disabled, so its result decides what the page says. Claiming the member
  // was notified when no mail was enqueued sends the administrator away
  // believing the request is closed on both sides; the page already has a
  // quiet-resolution banner for exactly this case.
  let notified: boolean;
  try {
    const sent = emailService.send({
      template: 'contact_request_resolution',
      params: {
        memberName: member.display_name,
        displayDecision,
        note,
      },
      recipientEmail:    member.login_email,
      recipientMemberId: member.id,
      idempotencyKey:    `contact-request-resolve:${input.queueItemId}`,
      strict: true,
    });
    notified = sent.status !== 'suppressed';
  } catch (err) {
    recordOperationalError({
      actionType:    'support.contact_request_resolve_notification_failed',
      category:      'support',
      actorType:     'admin',
      actorMemberId: input.adminMemberId,
      entityType:    'member',
      entityId:      member.id,
      reasonText:    'Queue resolve committed but resolve-notification enqueue failed.',
      cause:         err,
      metadata:      { queue_item_id: input.queueItemId },
    });
    throw err;
  }
  return { status: 'resolved', memberNotified: notified };
}

// Resolve a system-raised payments task: record the decision and note, with no
// member email. The row points at a provider-side record, and any member-facing
// message already went out when the underlying event was recorded. The queue
// UPDATE and the audit row commit together.
function resolvePaymentsTaskItem(
  row: { entity_type: string; entity_id: string; task_type: string },
  input: WorkQueueResolveInput,
  note: string,
): void {
  const decisionLabel = validatePaymentDecisionLabel(input.decisionLabel);
  const allowed = PAYMENTS_TASK_ENTITY_TYPES[row.task_type];
  if (!allowed || !allowed.has(row.entity_type)) {
    throw new ValidationError('Unexpected entity type on payments queue row.');
  }

  const nowIso = new Date().toISOString();
  transaction(() => {
    const result = workQueue.resolve.run(
      nowIso,
      input.adminMemberId,
      decisionLabel,
      note.slice(0, MAX_RESOLUTION_NOTE),
      nowIso,
      input.adminMemberId,
      input.queueItemId,
    );
    if (result.changes === 0) {
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }
    appendAuditEntry({
      actionType:    'payment.queue_item_resolved',
      category:      'payment',
      actorType:     'admin',
      actorMemberId: input.adminMemberId,
      entityType:    row.entity_type,
      entityId:      row.entity_id,
      reasonText:    decisionLabel,
      // Same reasoning as the contact-request resolution above: the note is
      // free text written about a member and belongs in the purgeable
      // work-queue row, not in the append-only ledger. The decision label is
      // what the ledger keeps.
      metadata:      {
        queue_item_id: input.queueItemId,
        decision_label: decisionLabel,
      },
    });
  });
}

export const adminWorkQueueService = {
  /**
   * Submit a new contact-IFPA-admin request from an authenticated member.
   * Throws RateLimitedError if member already has MAX_OPEN_PER_MEMBER open
   * requests. The cap counts every request the member raised, of either kind,
   * and is freed as each is answered. An identity-link request is raised as a
   * link-help item rather than a contact request, and a second one collapses
   * onto the row already open instead of taking another slot.
   */
  submit(input: ContactRequestSubmitInput): { id: string } {
    const category = validateCategory(input.category);
    const trimmed = (input.message ?? '').trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Message is required.');
    }
    if (trimmed.length > MAX_MESSAGE_LEN) {
      throw new ValidationError(`Message must be ${MAX_MESSAGE_LEN} characters or fewer.`);
    }

    // The cap is on what the member asked of an administrator, whichever queue
    // the answer comes back through, so it is counted across both task types a
    // member can raise. Everything else in the queue was raised by the platform
    // about them: counting those would let a run of payment tasks silence a
    // member who has asked for nothing.
    const openRaisedByMember = (taskType: string): number => {
      const row = workQueue.countOpenForMember.get(input.requestingMemberId, taskType) as
        | { c: number }
        | undefined;
      return row?.c ?? 0;
    };
    const openLinkHelp = openRaisedByMember(LINK_HELP_TASK_TYPE);
    const openTotal = openRaisedByMember(TASK_TYPE) + openLinkHelp;
    // A second identity-link submission replaces the payload on the row the
    // member already holds rather than opening another, so it cannot push them
    // past the cap and must not be refused by it: refusing would strand a member
    // who came back to correct what they wrote.
    const collapsesOntoOpenRow = category === 'identity_link_issue' && openLinkHelp > 0;
    if (!collapsesOntoOpenRow && openTotal >= MAX_OPEN_PER_MEMBER) {
      throw new RateLimitedError(
        `You already have ${MAX_OPEN_PER_MEMBER} open requests. Please wait for an admin response before submitting another.`,
      );
    }

    // An identity-link request is the one category an administrator answers by
    // applying a link rather than by writing back, so it raises the link-help
    // item that carries the apply path, the claim evidence and the vetted
    // evidence tier. Claiming is confined to the onboarding wizard, so this is
    // the only way a member reaches that queue once signing up is behind them.
    if (category === 'identity_link_issue') {
      const result = identityAccessService.submitLinkHelpRequest(input.requestingMemberId, {
        statement: trimmed,
      });
      return { id: result.workQueueItemId };
    }

    const categoryLabel = CONTACT_CATEGORY_LABELS[category];
    const summary = trimmed.length > MAX_REASON_TEXT
      ? trimmed.slice(0, MAX_REASON_TEXT)
      : trimmed;
    const reasonText = `${categoryLabel}: ${summary}`;

    // The work_queue_items INSERT (with its admin-alerts notification) and the
    // submission audit row commit in one transaction: a rollback cannot leave a
    // dangling alert, an alertless queue item, or a queue item without its
    // corresponding audit-trail entry.
    const { id } = transaction(() => {
      const { id } = workQueueService.enqueue({
        actorId:       input.requestingMemberId,
        queueCategory: 'membership',
        taskType:      TASK_TYPE,
        entityType:    'member',
        entityId:      input.requestingMemberId,
        priority:      5,
        reasonText,
        detailText:    trimmed,
      });
      appendAuditEntry({
        actionType:    'support.contact_request_submitted',
        category:      'support',
        actorType:     'member',
        actorMemberId: input.requestingMemberId,
        entityType:    'member',
        entityId:      input.requestingMemberId,
        reasonText:    categoryLabel,
        // The audit ledger is append-only and exempt from PII purge, so the
        // member-authored free text stays out of it; the mutable work-queue
        // row (queue_item_id) carries the message.
        metadata:      {
          queue_item_id: id,
          category,
          message_length: trimmed.length,
        },
      });
      return { id };
    });

    return { id };
  },

  /**
   * Resolve an open work-queue item. A contact request records the decision and
   * note and emails the requesting member; a system-raised payments task records
   * the decision and note only, with no email. Both record admin identity,
   * timestamp, decision, and note. Returns whether a member was notified, so the
   * queue page can confirm the resolution without claiming an email went out.
   *
   * Throws NotFoundError when the id is not an open item of a resolvable type,
   * an answer indistinguishable from an unknown id: a reconciliation-discrepancy
   * twin (resolved with its issue), a link-help request, or a review flag cannot
   * be resolved or probed here.
   */
  async resolve(input: WorkQueueResolveInput): Promise<{ status: 'resolved'; memberNotified: boolean }> {
    enforceWorkQueueResolveLimit(input.adminMemberId);
    const note = (input.resolutionNote ?? '').trim();
    if (note.length === 0) {
      throw new ValidationError('Resolution note is required.');
    }
    if (note.length > MAX_RESOLUTION_NOTE) {
      throw new ValidationError(`Resolution note must be ${MAX_RESOLUTION_NOTE} characters or fewer.`);
    }

    // The row loads before the decision label is validated, because the valid
    // label set depends on the task family. An unknown or closed id is reported
    // as not-found before any label check, so the answer is the same whatever
    // the label — the anti-enumeration outcome.
    const row = workQueue.findById.get(input.queueItemId) as
      | { status: string; entity_type: string; entity_id: string; task_type: string; reason_text: string | null }
      | undefined;
    if (!row || row.status !== 'open') {
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }

    if (row.task_type === TASK_TYPE) {
      return resolveContactRequestItem(row, input, note);
    }
    if (PAYMENTS_RESOLVABLE_TASK_TYPES.has(row.task_type)) {
      resolvePaymentsTaskItem(row, input, note);
      return { status: 'resolved', memberNotified: false };
    }
    // Reconciliation twins close with their issue; link-help and review flags
    // have their own controls. None is resolvable here, reported like an unknown
    // id so the endpoint reveals nothing about which type a hidden item is.
    throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
  },

  /**
   * List all currently open work-queue items for the admin dashboard.
   * Returns rows grouped server-side by category for view convenience.
   */
  listOpenForAdmin(): ContactRequestRow[] {
    const rows = workQueue.listOpenForAdmin.all() as Array<{
      id: string;
      opened_at: string;
      queue_category: string;
      task_type: string;
      entity_type: string;
      entity_id: string;
      reason_text: string | null;
      detail_text: string | null;
      claimed_by_member_id: string | null;
      claimed_by_name: string | null;
      claimed_at: string | null;
    }>;
    return rows.map((r) => {
      // Entity-display lookup belongs in the service (db.ts is the only SQL
      // surface; controllers are HTTP glue). Resolves member rows only;
      // other entity types render as plain ID + type label.
      let entityHref: string | null = null;
      let entityDisplayName: string | null = null;
      if (r.entity_type === 'member') {
        const m = account.findContactInfoById.get(r.entity_id) as
          | { slug: string; display_name: string }
          | undefined;
        if (m) {
          entityHref = `/members/${m.slug}`;
          entityDisplayName = m.display_name;
        }
      }
      return {
        id: r.id,
        openedAtIso: r.opened_at,
        queueCategory: r.queue_category,
        taskType: r.task_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityHref,
        entityDisplayName,
        reasonText: r.reason_text,
        detailText: r.detail_text,
        claimedByMemberId: r.claimed_by_member_id,
        claimedByName: r.claimed_by_name,
        claimedAt: r.claimed_at,
      };
    });
  },

  /**
   * Per-category open-item counts for the admin dashboard work-queue card.
   * Reads the raw open rows (which carry `priority`) so the card can flag
   * categories with urgent items and link each to the full queue page. Only
   * categories with at least one open item appear.
   */
  getWorkQueueSummary(): WorkQueueSummary {
    return runSqliteRead('admin dashboard work queue summary', () => this.readWorkQueueSummary());
  },

  readWorkQueueSummary(): WorkQueueSummary {
    const rows = workQueue.listOpenForAdmin.all() as Array<{
      queue_category: string;
      priority: number;
    }>;
    const byCategory = new Map<string, { count: number; hasUrgent: boolean }>();
    for (const r of rows) {
      const acc = byCategory.get(r.queue_category) ?? { count: 0, hasUrgent: false };
      acc.count += 1;
      if (r.priority > 0) acc.hasUrgent = true;
      byCategory.set(r.queue_category, acc);
    }
    const categories: WorkQueueSummaryCategory[] = [...byCategory.entries()]
      .map(([category, acc]) => ({
        category,
        label: WORK_QUEUE_CATEGORY_LABELS[category] ?? category,
        count: acc.count,
        hasUrgent: acc.hasUrgent,
        href: '/admin/work-queue',
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { categories, totalOpen: rows.length, hasOpen: rows.length > 0 };
  },

  /**
   * Build the full page view-model for the admin work queue. Groups all
   * open items by `queueCategory`, applies display-label maps, and wraps
   * the result in the standard `PageViewModel<WorkQueueContent>` envelope.
   * Controllers call this directly and render the return value.
   */
  getAdminWorkQueuePage(opts: {
    adminMemberId: string;
    resolvedFlag?: boolean;
    resolvedQuietFlag?: boolean;
    reviewedFlag?: boolean;
    claimedFlag?: boolean;
    claimNoopFlag?: boolean;
    memberAskedFlag?: boolean;
    /** A deep link naming the item whose composer should open already drafted. */
    askItemId?: string | null;
    errorMessage?: string;
  }): PageViewModel<WorkQueueContent> {
    // A contended database renders the standard temporarily-unavailable page
    // rather than falling to the generic handler, which shows the same page
    // under a 500.
    return runSqliteRead('admin work queue page', () => this.readAdminWorkQueuePage(opts));
  },

  readAdminWorkQueuePage(opts: {
    adminMemberId: string;
    resolvedFlag?: boolean;
    resolvedQuietFlag?: boolean;
    reviewedFlag?: boolean;
    claimedFlag?: boolean;
    claimNoopFlag?: boolean;
    memberAskedFlag?: boolean;
    /** A deep link naming the item whose composer should open already drafted. */
    askItemId?: string | null;
    errorMessage?: string;
  }): PageViewModel<WorkQueueContent> {
    const rows = this.listOpenForAdmin();
    const groupMap = new Map<string, WorkQueueViewItem[]>();
    for (const r of rows) {
      const arr = groupMap.get(r.queueCategory) ?? [];
      arr.push(shapeWorkQueueItem(r, opts.adminMemberId, opts.askItemId ?? null));
      groupMap.set(r.queueCategory, arr);
    }
    const groups: WorkQueueGroup[] = [];
    for (const [category, items] of groupMap.entries()) {
      groups.push({
        category,
        categoryLabel: WORK_QUEUE_CATEGORY_LABELS[category] ?? category,
        items,
      });
    }
    return {
      seo:  { title: 'Admin Work Queue' },
      page: { sectionKey: 'admin', pageKey: 'admin_work_queue', title: 'Admin Work Queue' },
      content: {
        groups,
        totalOpen: rows.length,
        resolvedFlag: opts.resolvedFlag ?? false,
        resolvedQuietFlag: opts.resolvedQuietFlag ?? false,
        reviewedFlag: opts.reviewedFlag ?? false,
        claimedFlag: opts.claimedFlag ?? false,
        claimNoopFlag: opts.claimNoopFlag ?? false,
        memberAskedFlag: opts.memberAskedFlag ?? false,
        answerKindOptions: ANSWER_KIND_OPTIONS,
        errorMessage: opts.errorMessage ?? null,
      },
    };
  },

  /**
   * Dismiss an internal-review work-queue item that has no member reply
   * (a low-confidence auto-link match, or an administrator-loss recruitment
   * alert). Closes the row and appends an
   * audit entry in one transaction; sends NO member email. Reuses the shared
   * per-admin resolve rate-limit bucket. Throws NotFoundError when the id is
   * not an open item of a dismissible review type.
   */
  dismiss(input: { queueItemId: string; adminMemberId: string; note: string }): void {
    enforceWorkQueueResolveLimit(input.adminMemberId);
    const note = (input.note ?? '').trim();
    if (note.length > MAX_RESOLUTION_NOTE) {
      throw new ValidationError(`Note must be ${MAX_RESOLUTION_NOTE} characters or fewer.`);
    }
    const row = workQueue.findById.get(input.queueItemId) as
      | { status: string; task_type: string; entity_type: string; entity_id: string }
      | undefined;
    if (!row || row.status !== 'open' || !DISMISSIBLE_REVIEW_TASK_TYPES.has(row.task_type)) {
      throw new NotFoundError(`Open review item not found: ${input.queueItemId}`);
    }
    const nowIso = new Date().toISOString();
    transaction(() => {
      const result = workQueue.closeReview.run(
        nowIso,
        input.adminMemberId,
        note || null,
        nowIso,
        input.adminMemberId,
        input.queueItemId,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`Open review item not found: ${input.queueItemId}`);
      }
      const auditFor = DISMISSIBLE_REVIEW_AUDIT.get(row.task_type)!;
      appendAuditEntry({
        actionType:    auditFor.actionType,
        category:      auditFor.category,
        actorType:     'admin',
        actorMemberId: input.adminMemberId,
        entityType:    row.entity_type,
        entityId:      row.entity_id,
        reasonText:    auditFor.reasonText,
        // Same rule as the two resolution paths above: the admin's note is free
        // text written about a member and belongs in the purgeable work-queue
        // row, which now carries it. The ledger keeps the fixed decision.
        metadata:      { queue_item_id: input.queueItemId },
      });
    });
  },
};
