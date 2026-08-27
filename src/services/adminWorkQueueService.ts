/**
 * AdminWorkQueueService -- the admin work-queue page and dashboard summary, plus
 * the member contact-IFPA-admin requests that feed the queue.
 *
 * Owns:
 *   - Contact-request submission (category-validated, per-member open-request cap),
 *     except the identity-link category, which is handed to the link-help
 *     workflow because an administrator answers it by applying a link
 *   - Resolution of any item whose task type declares a decide action: the
 *     decision label and the administrator's note, recorded with admin identity
 *     and timestamp, and the member notification where that type says the answer
 *     is the member's to receive (a contact request) rather than a record of a
 *     provider-side matter (every payments task)
 *   - Dismissal of internal-review items whose type declares a close action
 *     because they have no member reply (the low-confidence auto-link match, the
 *     administrator-loss recruitment alert): closes the row with the audit entry
 *     that type names for itself, and sends NO member email
 *   - Parking an item whose type offers it, and returning one to the queue: a
 *     parked item keeps status 'open' and leaves the working list, every digest
 *     and the escalation sweep, with no deadline. It comes back when the member
 *     answers a question on it or when any administrator takes it back
 *   - Admin work-queue page shaping (open items grouped by category, optionally
 *     narrowed to one category, plus the unfiltered parked listing), rendering
 *     each card from its type's declaration: one skeleton, one evidence block,
 *     one list of actions
 *   - The admin dashboard's two work-queue reads: the per-category open counts,
 *     and how much of the queue the viewing administrator is holding, decided by
 *     the digest's own claim rule so the page and the digest email agree
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
 *   - A decision is validated against the vocabulary the acting action itself
 *     declares, so a payments decision on a contact request (or the reverse) is
 *     impossible by construction rather than by two validators agreeing not to
 *     cross. A type declaring no such action does not resolve here at all and is
 *     reported not-found, the same answer as an unknown id.
 *   - A row is refused when its entity type is not one its task type declares:
 *     acting on it would record a decision about a record the type does not
 *     describe.
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
 *   - audit_entries append (support.contact_request_submitted on submit, plus the
 *     event the acting action names: support.contact_request_resolved,
 *     payment.queue_item_resolved, or the dismissal event each internal-review
 *     type names for itself, such as legacy.auto_link_match_reviewed)
 *   - outbox_emails enqueue (admin-alerts fan-out on submit; member
 *     notification only where the acting action says the member is answered;
 *     NONE on a payments-task resolution or a review dismissal)
 *   - operational-error audit + alarm on post-commit notification failure
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import { workQueue, memberMessages, account, payments, transaction } from '../db/db';
import {
  enforceWorkQueueResolveLimit, identityAccessService,
  type ClaimEvidence, type AutoLinkLowReason,
} from './identityAccessService';
import { appendAuditEntry } from './auditService';
import { emailService } from './emailService';
import { workQueueService, claimIsLive, claimStaleCutoffIso } from './workQueueService';
import {
  workQueueDescriptorFor, workQueueActionFor, requireWorkQueueDescriptor,
  type WorkQueueAction,
} from './workQueueTaskTypes';
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

const TASK_TYPE = 'member_contact_request';
// The other queue a member can put work into themselves. Everything else in the
// queue is raised by the platform about a member, not by the member.
const LINK_HELP_TASK_TYPE = 'member_link_help_request';

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
  /** The member the matter is about, whether the row names them directly or
   *  names a record of theirs. Null where no member is behind it at all, which
   *  is every provider-side row. */
  subjectMemberId: string | null;
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

/**
 * A decision is valid only against the vocabulary the acting action itself
 * declares. There was a validator per task family and a comment saying the two
 * sets must never cross; reading the vocabulary off the action makes crossing
 * them impossible rather than forbidden.
 */
function validateDecisionAgainst(
  action: { decisions: readonly { value: string; label: string }[] },
  raw: unknown,
): { value: string; label: string } {
  const match = typeof raw === 'string'
    ? action.decisions.find((d) => d.value === raw)
    : undefined;
  if (!match) {
    throw new ValidationError(`Invalid decision label: ${String(raw)}`);
  }
  return match;
}

// Admin work-queue page-model builder. The work-queue groups every open
// admin task by `queueCategory` and renders a uniform decision-action
// form per row. Category and task-type display labels live here so the
// admin controller stays a thin HTTP adapter.

export const WORK_QUEUE_CATEGORY_LABELS: Record<string, string> = {
  events:          'Events',
  media:           'Media',
  membership:      'Membership',
  payments:        'Payments',
  elections:       'Elections',
  system:          'System',
  club_leadership: 'Club leadership',
};

// The categories anything in `src/` can actually enqueue into today. The label
// map above is wider because the schema's CHECK constraint is wider, and a
// category no producer writes to is not an empty queue: it is a queue that
// cannot exist yet, and showing a permanent zero for one tells an admin they
// are up to date on work the platform has no way to create. Events, media and
// elections wait on their own surfaces being built; club leadership is
// different again, because that queue does exist and lives in the club cleanup
// queue rather than here. A unit test reads every enqueue call site in `src/`
// and fails if this list drifts from what the code can actually produce.
export const LIVE_WORK_QUEUE_CATEGORIES: readonly string[] = [
  'membership',
  'payments',
  'system',
];

/**
 * The close action of an internal-review type: an item an administrator ends
 * with a dismissal because there is no member to answer and nothing to undo.
 * Null for every other type, which is what makes the dismiss endpoint refuse
 * anything else.
 */
function closeActionFor(taskType: string): Extract<WorkQueueAction, { kind: 'close' }> | null {
  const action = workQueueActionFor(taskType, 'dismiss');
  return action?.kind === 'close' ? action : null;
}

// Which matters may carry a question is decided by memberMessageService, on the
// single structural rule that the item resolves to one live, signed-up member.
// The card asks that service rather than keeping a second copy of the answer:
// two lists in two files were what let the control render on a matter the send
// path then refused, with a message that named the wrong reason.

/** One input an action needs, addressed so two cards on a page never collide. */
export interface WorkQueueActionFieldView {
  name: string;
  label: string;
  inputId: string;
  isTextarea: boolean;
  maxLength: number;
  required: boolean;
}

/** The note an action records, which is a field like any other except that the
 *  wording tells the administrator who ends up reading it. */
export interface WorkQueueActionNoteView extends WorkQueueActionFieldView {
  placeholder: string;
}

/**
 * One thing an administrator can do to an item, shaped into the control that
 * does it. Every card renders its list of these the same way, so learning one
 * card teaches every card.
 */
export interface WorkQueueActionView {
  key: string;
  label: string;
  buttonClass: string;
  /** A resolution that lives on another page: rendered as a link, not a form. */
  isLink: boolean;
  href: string | null;
  /** Where the form posts. Null on a link action. */
  actionPath: string | null;
  decisions: Array<{ value: string; label: string }>;
  hasDecisions: boolean;
  decisionInputId: string;
  fields: WorkQueueActionFieldView[];
  hasFields: boolean;
  note: WorkQueueActionNoteView | null;
  /** What this action does or does not do, where that is not obvious from its
   *  label and getting it wrong is expensive. */
  hint: string | null;
}

/**
 * What the administrator decides on, shaped per the type's declaration. The
 * booleans are the pre-shaped switch the card renders on; only one is ever true.
 */
export interface WorkQueueEvidenceView {
  /** The platform's own words about the item. */
  isReasonText: boolean;
  /** The member's own words, shown as theirs. */
  isMemberMessage: boolean;
  /** A member's request to be linked to a record, with what they have tried. */
  isLinkHelp: boolean;
  /** A match the batch classifier could not make on its own. */
  isAutoLink: boolean;
  reasonText: string | null;
  detailText: string | null;
  linkHelp: {
    statement: string;
    isDispute: boolean;
    /** The records this dispute named when it was filed, detected server-side.
     *  The revert accepts only one of these, so the card must show them: without
     *  them an administrator has no way to learn an id the action will take. */
    disputedRecords: Array<{ kindLabel: string; recordId: string }>;
    hasDisputedRecords: boolean;
  } | null;
  /**
   * What the ledger says about this member's past claim attempts, rendered on
   * the matters that ask an administrator to judge an identity. Null elsewhere.
   */
  claimEvidence: ClaimEvidence | null;
  /** The records the platform can already see for this member, on the card that
   *  asks an administrator to name one. Null where the type does not ask that. */
  candidates: LinkCandidatesView | null;
  autoLink: AutoLinkEvidenceView | null;
}

/**
 * What the platform can see behind a member asking to be linked: the old
 * accounts their own anchors reach, and the competition records under their
 * name, each with the id the approve form takes.
 */
export interface LinkCandidatesView {
  legacyAccounts: Array<{
    legacyMemberId: string;
    displayName: string;
    facts: string[];
    birthDate: string | null;
  }>;
  hasLegacyAccounts: boolean;
  historicalPersons: Array<{
    personId: string;
    personName: string;
    matchNote: string | null;
  }>;
  hasHistoricalPersons: boolean;
  /** Said plainly, because an anchor matching several accounts is why a link
   *  cannot simply be applied. */
  ambiguousNotes: string[];
  hasAmbiguousNotes: boolean;
  hasAny: boolean;
  /** Where an administrator goes when none of this is enough. */
  lookupHref: string;
}

/**
 * A match the batch classifier could not make, as the administrator needs to see
 * it: why it stopped, the old account it reached, and the competition records it
 * could not choose between.
 *
 * The records are read at render time rather than copied onto the row when the
 * item was raised, because the pass runs once at cutover and a record can change
 * hands afterwards; the stored reason is the historical fact, the records are
 * the current one.
 */
export interface AutoLinkEvidenceView {
  /** Why the classifier stopped, in words. */
  reasonLabel: string;
  /** What the administrator is being asked to do about it. */
  actionLabel: string;
  legacyAccount: {
    legacyMemberId: string;
    displayName: string | null;
    country: string | null;
    birthDate: string | null;
  } | null;
  candidates: Array<{ personId: string; personName: string }>;
  hasCandidates: boolean;
  /** The member has been linked since this was raised, so there is nothing left
   *  to judge and the item is only waiting to be closed. */
  settledSince: boolean;
}

/** The two records a link-help approval is about to bind, shown before it is. */
export interface LinkHelpConfirmContent {
  summary: string;
  member: {
    displayName: string;
    realNameNote: string | null;
    birthDate: string | null;
    recordHref: string;
  };
  target: {
    kindLabel: string;
    recordId: string;
    recordName: string;
    facts: string[];
  };
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
  legacyMemberId: string;
  historicalPersonId: string;
  filterCategory: string;
}

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
  /** The provider or domain record this task points at, rendered as
   *  "<label> <id>" on the card. Null for member-entity rows, where the
   *  member's name link already identifies the subject. Carries a link where the
   *  platform holds the record itself: deciding a payment matter off-page while
   *  the page that holds the payment sits one click away is a lookup the card
   *  should have saved. */
  entityReference: { label: string; id: string; href: string | null } | null;
  /** Everything this type's administrator can do, in the order its declaration
   *  gives, each already shaped into the form or link that carries it out. The
   *  card renders this list and nothing else, so a type cannot arrive with a
   *  control the page forgot to draw. */
  actions: WorkQueueActionView[];
  /** How this card shows what the decision is made on. */
  evidence: WorkQueueEvidenceView;
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
}

export interface WorkQueueGroup {
  category: string;
  categoryLabel: string;
  items: WorkQueueViewItem[];
}

/**
 * An item an administrator set aside. It carries what it is and why it is
 * waiting, and one control to take it back; the actions that resolve it live on
 * the working card it becomes again.
 */
export interface ParkedWorkQueueItemView {
  id: string;
  taskTypeLabel: string;
  categoryLabel: string;
  parkedAtDisplay: string;
  parkedByName: string | null;
  parkReason: string | null;
  summary: string | null;
  entityDisplayName: string | null;
  entityHref: string | null;
  returnAction: string;
}

export interface WorkQueueContent {
  groups: WorkQueueGroup[];
  /** Items waiting on something outside the queue, listed apart from the work. */
  parked: ParkedWorkQueueItemView[];
  hasParked: boolean;
  parkedFlag: boolean;
  unparkedFlag: boolean;
  /** Items on the page, which is the filtered count when a filter is on. */
  totalOpen: number;
  /** The category being shown alone, named for the reader; null when showing all. */
  filterLabel: string | null;
  /** The same category as its key, for the forms that carry it back so an
   *  action does not drop the administrator out of the category they are
   *  working. Carried in the body rather than the action URL, because a
   *  template may not assemble a URL from more than one value. */
  filterCategory: string | null;
  isFiltered: boolean;
  /** How many items the unfiltered queue holds, so a filtered state can say
   *  what it is a subset of rather than leaving the reader to guess. */
  wholeQueueTotal: number;
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

/** What one administrator is holding, and what the rest of the team is. */
export interface WorkQueueClaimSummary {
  claimedByYou: number;
  heldByOthers: number;
}

export interface WorkQueueSummary {
  categories: WorkQueueSummaryCategory[];
  totalOpen: number;
  hasOpen: boolean;
}

function parseLinkHelpPayload(reasonText: string | null): WorkQueueEvidenceView['linkHelp'] {
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

/** An element id built from an item and an action, unique on a page of cards. */
function inputIdFor(itemId: string, actionKey: string, field: string): string {
  return `${actionKey.replace(/[^a-z0-9]+/gi, '_')}_${field}_${itemId}`;
}

function shapeActionField(
  itemId: string,
  actionKey: string,
  field: { name: string; label: string; input: 'text' | 'textarea'; maxLength: number; required: boolean },
): WorkQueueActionFieldView {
  return {
    name:       field.name,
    label:      field.label,
    inputId:    inputIdFor(itemId, actionKey, field.name),
    isTextarea: field.input === 'textarea',
    maxLength:  field.maxLength,
    required:   field.required,
  };
}

/**
 * The declared actions of a type, as the controls that carry them out.
 *
 * The order is the declaration's order, so what an administrator reaches for
 * first is decided once, per type, rather than by where a branch happened to sit
 * in the template.
 */
function shapeActions(
  itemId: string,
  taskType: string,
  linkHelp: WorkQueueEvidenceView['linkHelp'],
): WorkQueueActionView[] {
  const descriptor = workQueueDescriptorFor(taskType);
  if (!descriptor) return [];
  const out: WorkQueueActionView[] = [];
  for (const action of descriptor.actions) {
    if (action.kind === 'elsewhere') {
      out.push({
        key: 'elsewhere', label: action.label, buttonClass: 'btn btn-outline btn-sm',
        isLink: true, href: action.href, actionPath: null,
        decisions: [], hasDecisions: false, decisionInputId: '',
        fields: [], hasFields: false, note: null, hint: null,
      });
      continue;
    }
    // A dispute revert has nothing to revert on a request that named no
    // conflicting record, so it is not offered there at all.
    if (action.kind === 'act' && action.disputeOnly && !linkHelp?.isDispute) continue;

    const decisions = action.kind === 'decide' ? [...action.decisions] : [];
    const fields = action.kind === 'act'
      ? action.fields.map((f) => shapeActionField(itemId, action.key, f))
      : [];
    const note = action.kind === 'decide' || action.kind === 'close' || action.kind === 'park'
      ? {
        ...shapeActionField(itemId, action.key, { ...action.note, input: 'textarea' as const }),
        placeholder: action.note.placeholder,
      }
      : null;
    out.push({
      key:             action.key,
      label:           action.label,
      buttonClass:     action.style === 'primary' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm',
      isLink:          false,
      href:            null,
      actionPath:      `/admin/work-queue/${itemId}/${action.key}`,
      decisions,
      hasDecisions:    decisions.length > 0,
      decisionInputId: inputIdFor(itemId, action.key, 'decision'),
      fields,
      hasFields:       fields.length > 0,
      note,
      hint:            action.kind === 'act' || action.kind === 'close' || action.kind === 'park'
        ? action.hint ?? null
        : null,
    });
  }
  return out;
}

/**
 * Why a batch auto-link match stopped where it did, in words an administrator
 * can act on, and what each reason actually asks of them.
 *
 * Deliberately says nothing about confidence: what the classifier's bands mean
 * is an open question in its own right, and the administrator's decision does
 * not wait on it. What they need is the obstacle and the next move.
 */
const AUTO_LINK_REASONS: Record<AutoLinkLowReason, { reason: string; action: string }> = {
  no_hp_for_legacy_account: {
    reason: 'The old account was found, but it has no competition record attached to it.',
    action: 'There is nothing to link it to, so this is usually closed as reviewed.',
  },
  no_name_candidate: {
    reason: 'The old account was found, but no competition record carries this name.',
    action: 'There is nothing to link it to, so this is usually closed as reviewed.',
  },
  multiple_name_candidates: {
    reason: 'More than one competition record carries this name, and nothing on file chose between them.',
    action: 'Compare the records below with the member before anything is linked.',
  },
  hp_mismatch: {
    reason: 'The competition record the old account points at is filed under a different surname from this member.',
    action: 'Check whether the two are the same person before anything is linked.',
  },
  ambiguous_email_anchor: {
    reason: 'The email address on file matches more than one old account, so none of them can be taken as theirs.',
    action: 'Ask the member which address was theirs before anything is linked.',
  },
};

/** Whether this member already holds a legacy account or a competition record. */
function hasIdentityLink(memberId: string): boolean {
  const links = account.findIdentityLinks.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  return Boolean(links?.legacy_member_id || links?.historical_person_id);
}

/** The reason code stored on the row when the item was raised. */
function parseAutoLinkReason(reasonText: string | null): AutoLinkLowReason | null {
  if (!reasonText) return null;
  try {
    const parsed = JSON.parse(reasonText) as { reason?: unknown };
    const reason = typeof parsed.reason === 'string' ? parsed.reason : null;
    return reason && reason in AUTO_LINK_REASONS ? reason as AutoLinkLowReason : null;
  } catch {
    // A row raised before the reason was recorded, or one erasure has scrubbed.
    return null;
  }
}

function shapeAutoLinkEvidence(raw: ContactRequestRow): AutoLinkEvidenceView {
  const live = identityAccessService.getAutoLinkClassificationForMember(raw.entityId);
  const storedReason = parseAutoLinkReason(raw.reasonText);
  const reason = storedReason ?? (live.confidence === 'low' ? live.reason : null);
  const words = reason ? AUTO_LINK_REASONS[reason] : null;
  const lowNow = live.confidence === 'low' ? live : null;
  return {
    reasonLabel: words?.reason
      ?? 'This match was raised before the reason was recorded, so why it stopped is not on file.',
    actionLabel: words?.action
      ?? 'Judge it from the member record and the competition records under their name.',
    legacyAccount: lowNow?.legacyMatch
      ? {
        legacyMemberId: lowNow.legacyMatch.legacyMemberId,
        displayName:    lowNow.legacyMatch.displayName,
        country:        lowNow.legacyMatch.country,
        birthDate:      lowNow.legacyMatch.birthDate,
      }
      : null,
    candidates: (lowNow?.candidates ?? []).map((c) => ({
      personId:   c.personId,
      personName: c.personName,
    })),
    hasCandidates: (lowNow?.candidates?.length ?? 0) > 0,
    // Read from the member's own links rather than inferred from the classifier
    // falling silent: it also falls silent for a member who simply has no
    // anchors to match on, and telling an administrator that member was linked
    // would be a plain untruth on the card they are deciding from.
    settledSince: hasIdentityLink(raw.entityId),
  };
}

/**
 * The records the platform can already see for this member, as the card shows
 * them: each with the id the approve form takes, so the administrator never has
 * to go and find an identifier the page could have handed them.
 */
function shapeLinkCandidates(memberId: string): LinkCandidatesView {
  const found = identityAccessService.getLinkCandidatesForAdmin(memberId);
  const legacyAccounts = found.legacyAccounts.map((a) => ({
    legacyMemberId: a.legacyMemberId,
    displayName:    a.displayName ?? a.legacyMemberId,
    facts: [a.legacyMemberId, a.country, `Found through ${a.anchorLabel}`]
      .filter((f): f is string => Boolean(f)),
    birthDate: a.birthDate,
  }));
  const historicalPersons = found.historicalPersons.map((p) => ({
    personId:   p.personId,
    personName: p.personName,
    matchNote:  p.isVariantMatch ? 'Matched through a recorded name variant' : null,
  }));
  const ambiguousNotes = found.ambiguousAnchors.map(
    (label) => `More than one old account carries ${label}, so none of them can be taken as theirs.`,
  );
  return {
    legacyAccounts,
    hasLegacyAccounts: legacyAccounts.length > 0,
    historicalPersons,
    hasHistoricalPersons: historicalPersons.length > 0,
    ambiguousNotes,
    hasAmbiguousNotes: ambiguousNotes.length > 0,
    hasAny: legacyAccounts.length > 0 || historicalPersons.length > 0,
    lookupHref: '/admin/legacy-accounts',
  };
}

/** What the card shows the decision being made on, per the type's declaration. */
function shapeEvidence(raw: ContactRequestRow): WorkQueueEvidenceView {
  const evidence = workQueueDescriptorFor(raw.taskType)?.evidence ?? { kind: 'reason_text' as const };
  const isLinkHelp = evidence.kind === 'structured' && evidence.payload === 'link_help';
  const isAutoLink = evidence.kind === 'structured' && evidence.payload === 'auto_link';
  return {
    isReasonText:    evidence.kind === 'reason_text',
    isMemberMessage: evidence.kind === 'member_message',
    isLinkHelp,
    isAutoLink,
    // A structured payload holds JSON in the same column, so the raw text is
    // withheld there rather than printed as noise.
    reasonText: evidence.kind === 'structured' ? null : raw.reasonText,
    detailText: evidence.kind === 'structured' ? null : raw.detailText,
    linkHelp:   isLinkHelp ? parseLinkHelpPayload(raw.reasonText) : null,
    candidates: isLinkHelp ? shapeLinkCandidates(raw.entityId) : null,
    autoLink:   isAutoLink ? shapeAutoLinkEvidence(raw) : null,
    // The evidence an identity decision is actually made on. Offered only on the
    // matters that ask an administrator to judge one, because everywhere else it
    // is a member's claim history shown for no reason.
    claimEvidence: isLinkHelp
      ? identityAccessService.getClaimEvidenceForMember(raw.entityId)
      : null,
  };
}

function shapeWorkQueueItem(
  raw: ContactRequestRow,
  viewingAdminId: string,
  askItemId: string | null,
): WorkQueueViewItem {
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

  const evidence = shapeEvidence(raw);

  // The member entity is identified by its name link, not a raw id; every other
  // entity shows a labelled reference so the admin can cross-reference in Stripe.
  const entityReference = raw.entityType === 'member'
    ? null
    : {
      label: ENTITY_REFERENCE_LABELS[raw.entityType] ?? raw.entityType,
      id:    raw.entityId,
      // A payment is the platform's own record and has a page; a Stripe id
      // belongs to the provider's dashboard and gets no link from here.
      href:  raw.entityType === 'payment' ? `/admin/payments/${raw.entityId}` : null,
    };

  return {
    id: raw.id,
    queueCategory: raw.queueCategory,
    taskType: raw.taskType,
    taskTypeLabel: workQueueDescriptorFor(raw.taskType)?.label ?? raw.taskType,
    openedAtIso: raw.openedAtIso,
    openedAtDisplay: raw.openedAtIso.slice(0, 10),
    entityType: raw.entityType,
    entityId: raw.entityId,
    entityHref: raw.entityHref,
    entityDisplayName: raw.entityDisplayName,
    memberRecordHref: raw.subjectMemberId ? `/admin/members/${raw.subjectMemberId}` : null,
    entityReference,
    evidence,
    actions: shapeActions(raw.id, raw.taskType, evidence.linkHelp),
    isClaimed,
    claimedByMe: isClaimed && raw.claimedByMemberId === viewingAdminId,
    claimedByName: raw.claimedByName,
    // A lapsed claim still names who had it, so the next administrator can ask
    // rather than duplicating work already done.
    lapsedClaimByName: !isClaimed && raw.claimedByName !== null ? raw.claimedByName : null,
    canAskMember,
    // Said plainly on the card, so an administrator who expected the control
    // knows it is a matter of timing rather than a missing feature.
    askBlockedReason: askable && !memberCanRead
      ? 'This member has not finished signing up yet, so they cannot read a question. The control appears once they have.'
      : null,
    awaitingMemberSince: questions.find((q) => !q.isAnswered)?.sentAtDisplay ?? null,
    memberQuestions: questions,
    askPrefill: canAskMember ? ASK_PREFILLS[raw.taskType] ?? null : null,
    askOpen: canAskMember && raw.id === askItemId,
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

/**
 * Resolve an item whose type declares a decide action: record the decision and
 * the note, and answer the member where that type says the answer is theirs to
 * receive. The queue UPDATE and the audit row commit together; any email is
 * enqueued after commit and a failure there surfaces as a 503 without rolling
 * the resolution back.
 *
 * The decision vocabulary, the audit event, and whether a member hears about it
 * are read off the action rather than branched on the task family here, so a
 * type cannot be resolved with another family's vocabulary or filed under
 * another family's audit event.
 */
async function resolveDecidedItem(
  row: { entity_type: string; entity_id: string; task_type: string },
  action: Extract<WorkQueueAction, { kind: 'decide' }>,
  input: WorkQueueResolveInput,
  note: string,
): Promise<{ status: 'resolved'; memberNotified: boolean }> {
  const decision = validateDecisionAgainst(action, input.decisionLabel);
  const decisionLabel = decision.value;
  // A row pointing at an entity its type never points at is corrupt, and acting
  // on it would write a decision about a record the type does not describe.
  if (!requireWorkQueueDescriptor(row.task_type).entityTypes.includes(row.entity_type)) {
    throw new ValidationError('Unexpected entity type on queue row.');
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
      actionType:    action.auditActionType,
      category:      action.auditCategory,
      actorType:     'admin',
      actorMemberId: input.adminMemberId,
      entityType:    row.entity_type,
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

  // A decision on a provider-side record reaches no member: the row points at a
  // payment record rather than a person, and any member-facing message went out
  // when the underlying event was recorded.
  if (!action.notifiesSubject) {
    return { status: 'resolved', memberNotified: false };
  }

  const member = account.findContactInfoById.get(row.entity_id) as
    | { id: string; slug: string; display_name: string; login_email: string }
    | undefined;
  if (!member || !member.login_email) {
    return { status: 'resolved', memberNotified: false };
  }
  const displayDecision = decision.label;

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

    // Only a type that declares a decide action resolves here. Reconciliation
    // twins close with their issue; link-help and review items have their own
    // controls. None of those is resolvable here, and each is reported like an
    // unknown id so the endpoint reveals nothing about which type a hidden item
    // is.
    const action = workQueueActionFor(row.task_type, 'resolve');
    if (action?.kind !== 'decide') {
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }
    return resolveDecidedItem(row, action, input, note);
  },

  /**
   * The confirmation page for a link-help approval: whose record is about to be
   * bound to whose account, before anything is written. The write happens on the
   * confirm step, which is what every other consequential correction on a person
   * already does.
   */
  getLinkHelpApprovalConfirmPage(opts: {
    adminMemberId: string;
    queueItemId: string;
    legacyMemberId: string;
    historicalPersonId: string;
    category?: string | null;
  }): PageViewModel<LinkHelpConfirmContent> {
    const preview = identityAccessService.previewLinkHelpApproval(
      opts.adminMemberId,
      opts.queueItemId,
      { legacyMemberId: opts.legacyMemberId, historicalPersonId: opts.historicalPersonId },
    );
    const title = 'Confirm: Link This Record to This Member';
    return {
      seo:  { title, noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_link_help_confirm', title },
      content: {
        summary: 'Linking merges the record into the member\'s account and grants any tier the '
          + 'record carries. It is recorded as vetted by you. Check that these are the same person.',
        member: {
          displayName: preview.member.displayName,
          // Shown only where it differs: an administrator judging an identity is
          // comparing names, and a repeated one is noise on the page.
          realNameNote: preview.member.realName !== preview.member.displayName
            ? `Registered name: ${preview.member.realName}`
            : null,
          birthDate:  preview.member.birthDate,
          recordHref: `/admin/members/${preview.member.memberId}`,
        },
        target: preview.target,
        confirmAction: `/admin/work-queue/${opts.queueItemId}/link-help/approve/confirm`,
        confirmLabel:  'Yes, Link Them',
        cancelHref:    '/admin/work-queue',
        legacyMemberId:     preview.legacyMemberId ?? '',
        historicalPersonId: preview.historicalPersonId ?? '',
        filterCategory:     opts.category ?? '',
      },
    };
  },

  /**
   * The items an administrator has set aside, newest park first. Read apart from
   * the working queue so a parked item stays visible without counting as work
   * waiting on anyone.
   */
  listParkedForAdmin(): ParkedWorkQueueItemView[] {
    const rows = workQueue.listParkedForAdmin.all() as Array<{
      id: string;
      queue_category: string;
      task_type: string;
      entity_type: string;
      entity_id: string;
      reason_text: string | null;
      detail_text: string | null;
      parked_at: string;
      park_reason: string | null;
      parked_by_name: string | null;
    }>;
    return rows.map((r) => {
      const member = r.entity_type === 'member'
        ? account.findContactInfoById.get(r.entity_id) as { slug: string; display_name: string } | undefined
        : undefined;
      // A link-help payload is JSON in the same column, so the parked row says
      // what it is by its type label rather than printing the payload.
      const isStructured = workQueueDescriptorFor(r.task_type)?.evidence.kind === 'structured';
      return {
        id:                r.id,
        taskTypeLabel:     workQueueDescriptorFor(r.task_type)?.label ?? r.task_type,
        categoryLabel:     WORK_QUEUE_CATEGORY_LABELS[r.queue_category] ?? r.queue_category,
        parkedAtDisplay:   r.parked_at.slice(0, 10),
        parkedByName:      r.parked_by_name,
        parkReason:        r.park_reason,
        summary:           isStructured ? null : r.reason_text,
        entityDisplayName: member?.display_name ?? null,
        entityHref:        member ? `/members/${member.slug}` : null,
        returnAction:      `/admin/work-queue/${r.id}/unpark`,
      };
    });
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
      // surface; controllers are HTTP glue). A Stripe-side entity has no row
      // here and renders as its labelled reference alone.
      let entityHref: string | null = null;
      let entityDisplayName: string | null = null;
      let subjectMemberId: string | null = null;
      if (r.entity_type === 'member') {
        subjectMemberId = r.entity_id;
      } else if (r.entity_type === 'payment') {
        // A payment matter is about a person as much as about an amount, and
        // the row names only the payment. Without this the administrator holds
        // a payment id and has to go and find out whose money it was.
        const p = payments.findById.get(r.entity_id) as { member_id: string } | undefined;
        subjectMemberId = p?.member_id ?? null;
      }
      if (subjectMemberId) {
        const m = account.findContactInfoById.get(subjectMemberId) as
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
        subjectMemberId,
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
        // Each count leads to its own category rather than to the queue root.
        // Sending every count to one undifferentiated page makes the
        // administrator find their category again by eye, which is the work the
        // number was supposed to have saved them.
        href: `/admin/work-queue?category=${category}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { categories, totalOpen: rows.length, hasOpen: rows.length > 0 };
  },

  /**
   * How much of the open queue this administrator is personally holding.
   *
   * The rule is the digest's, not a second one: a claim counts only while it is
   * younger than the staleness cutoff, so an administrator who claimed an item
   * and went away stops holding it rather than holding it forever. Reading it
   * here through the same two helpers the digest uses is what keeps an
   * administrator's home page and their digest email saying the same thing.
   */
  getClaimSummary(adminMemberId: string): WorkQueueClaimSummary {
    return runSqliteRead('admin dashboard claim summary', () => this.readClaimSummary(adminMemberId));
  },

  readClaimSummary(adminMemberId: string): WorkQueueClaimSummary {
    const rows = workQueue.listOpenForAdmin.all() as Array<{
      claimed_by_member_id: string | null;
      claimed_at: string | null;
    }>;
    const staleCutoffIso = claimStaleCutoffIso();
    let claimedByYou = 0;
    let heldByOthers = 0;
    for (const r of rows) {
      if (!claimIsLive(r.claimed_at, staleCutoffIso)) continue;
      if (r.claimed_by_member_id === adminMemberId) claimedByYou += 1;
      else heldByOthers += 1;
    }
    return { claimedByYou, heldByOthers };
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
    parkedFlag?: boolean;
    unparkedFlag?: boolean;
    /** A deep link naming the item whose composer should open already drafted. */
    askItemId?: string | null;
    /** Show one category alone. An unknown value shows the whole queue. */
    category?: string | null;
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
    parkedFlag?: boolean;
    unparkedFlag?: boolean;
    /** A deep link naming the item whose composer should open already drafted. */
    askItemId?: string | null;
    /** Show one category alone. An unknown value shows the whole queue. */
    category?: string | null;
    errorMessage?: string;
  }): PageViewModel<WorkQueueContent> {
    // An unrecognized category shows the whole queue rather than an error page:
    // this is an administrator's read-only surface reached from a link, and a
    // stale or mistyped one is better answered with everything than with a
    // refusal.
    const filterCategory = opts.category && WORK_QUEUE_CATEGORY_LABELS[opts.category]
      ? opts.category
      : null;

    const allRows = this.listOpenForAdmin();
    const rows = filterCategory === null
      ? allRows
      : allRows.filter((r) => r.queueCategory === filterCategory);

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
    // The parked listing is not filtered with the queue: it is a short list of
    // what is set aside across the whole queue, and hiding part of it behind the
    // category filter would let a parked item disappear from both views.
    const parked = this.listParkedForAdmin();
    return {
      seo:  { title: 'Admin Work Queue' },
      page: { sectionKey: 'admin', pageKey: 'admin_work_queue', title: 'Admin Work Queue' },
      content: {
        groups,
        parked,
        hasParked: parked.length > 0,
        parkedFlag: opts.parkedFlag ?? false,
        unparkedFlag: opts.unparkedFlag ?? false,
        totalOpen: rows.length,
        // A filtered state says where the reader is and how to leave it, so a
        // deep link never reads as an oddly short queue.
        filterLabel: filterCategory === null
          ? null
          : WORK_QUEUE_CATEGORY_LABELS[filterCategory] ?? filterCategory,
        filterCategory,
        isFiltered: filterCategory !== null,
        wholeQueueTotal: allRows.length,
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
  /**
   * Park an open item an administrator cannot advance yet: it leaves the working
   * queue, every administrator's digest and the escalation sweep, and waits in
   * the parked listing under the reason given. There is no deadline, because a
   * timer would hand the item back with nothing new about it; it returns when the
   * member answers a question on it, or when an administrator takes it back.
   *
   * Only a type whose declaration offers a park action can be parked. Anything
   * else is reported not-found, the same answer as an unknown id.
   */
  park(input: { queueItemId: string; adminMemberId: string; note: string }): void {
    enforceWorkQueueResolveLimit(input.adminMemberId);
    const reason = (input.note ?? '').trim();
    if (reason.length === 0) {
      throw new ValidationError('A reason is required to park an item.');
    }
    if (reason.length > MAX_RESOLUTION_NOTE) {
      throw new ValidationError(`Reason must be ${MAX_RESOLUTION_NOTE} characters or fewer.`);
    }
    const row = workQueue.findById.get(input.queueItemId) as
      | { status: string; task_type: string }
      | undefined;
    const parkable = row && row.status === 'open'
      && workQueueActionFor(row.task_type, 'park')?.kind === 'park';
    if (!parkable) {
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }
    const nowIso = new Date().toISOString();
    const result = workQueue.parkItem.run(
      nowIso, input.adminMemberId, reason, nowIso, input.adminMemberId, input.queueItemId,
    );
    if (result.changes === 0) {
      // Already parked, or closed between the read and the write.
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }
  },

  /**
   * Return a parked item to the working queue. Any administrator may do it, not
   * only the one who parked it: the park is a note about the item, not a hold on
   * it, and the team can always take the work back.
   */
  unpark(input: { queueItemId: string; adminMemberId: string }): void {
    const nowIso = new Date().toISOString();
    const result = workQueue.unparkItem.run(nowIso, input.adminMemberId, input.queueItemId);
    if (result.changes === 0) {
      throw new NotFoundError(`Parked work-queue item not found: ${input.queueItemId}`);
    }
  },

  dismiss(input: { queueItemId: string; adminMemberId: string; note: string }): void {
    enforceWorkQueueResolveLimit(input.adminMemberId);
    const note = (input.note ?? '').trim();
    if (note.length > MAX_RESOLUTION_NOTE) {
      throw new ValidationError(`Note must be ${MAX_RESOLUTION_NOTE} characters or fewer.`);
    }
    const row = workQueue.findById.get(input.queueItemId) as
      | { status: string; task_type: string; entity_type: string; entity_id: string }
      | undefined;
    const closeAction = row && row.status === 'open' ? closeActionFor(row.task_type) : null;
    if (!closeAction) {
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
      appendAuditEntry({
        actionType:    closeAction.auditActionType,
        category:      closeAction.auditCategory,
        actorType:     'admin',
        actorMemberId: input.adminMemberId,
        entityType:    row!.entity_type,
        entityId:      row!.entity_id,
        reasonText:    closeAction.auditReasonText,
        // Same rule as the resolution path above: the admin's note is free
        // text written about a member and belongs in the purgeable work-queue
        // row, which now carries it. The ledger keeps the fixed decision.
        metadata:      { queue_item_id: input.queueItemId },
      });
    });
  },
};
