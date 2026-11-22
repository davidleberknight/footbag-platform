/**
 * AdminWorkQueueService -- the admin work-queue page and dashboard summary, plus
 * the member contact-IFPA-admin requests that feed the queue.
 *
 * Owns:
 *   - Contact-request submission (category-validated, per-member open-request cap),
 *     except the identity-link category, which is handed to the link-help
 *     workflow because an administrator answers it by applying a link. The
 *     community-standards category raises a content report, the same request
 *     declared as its own type so it belongs to the moderation area while every
 *     other category is a contact request in the membership area
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
 *   - The work-queue pages, all admin-only and not indexed:
 *     - the list (GET /admin/work-queue): one kind at a time, oldest first, 25
 *       to a page, one line per item naming its task, its area or Shared, how
 *       long it has waited and who holds it, with a Claim button and an Open
 *       link. With no kind asked for it shows the first kind in the registry's
 *       order with anything open under the narrowing in force. Plain links
 *       narrow it to the viewer's own areas, one area, the shared items or the
 *       items nobody holds a live claim on, and lead back to everything. A page
 *       past the last shows the last page, because a close can empty it while
 *       an administrator is on it
 *     - the item page (GET /admin/work-queue/:id), one skeleton for every
 *       type: the type's declared what, why and what to do, who or what it
 *       concerns, the evidence, who holds it, then the actions its type
 *       declares. A parked item shows why it is parked and the control to take
 *       it back instead of its actions. Null for a closed or unknown id. A
 *       subject who is a prospective member is shown by id, never named or
 *       linked
 *     - the parked page (GET /admin/work-queue/parked), not narrowed
 *     - the Area Owners page (GET /admin/work-queue-areas). Any administrator
 *       may set any area's owner; each changed area appends an audit row with
 *       the owner before and after, and an unchanged save writes nothing.
 *       Ownership orients and never restricts who may act. An owner who no
 *       longer holds the admin role reads as no owner
 *   - Every list and item link and form carries the list state (kind, area,
 *     unclaimed filter, page), and where an action returns: a closing action
 *     to the list in that state, any other to the page it was taken on. Both
 *     are built here from recognised values only, never from a submitted path
 *   - The admin dashboard's work-queue reads: each kind's open count, oldest
 *     age, items unclaimed past the stale threshold and open items per area;
 *     how much of the queue the viewing administrator is holding, decided by
 *     the digest's own claim rule so the page and the digest email agree; and
 *     the areas that administrator owns with their open and stale-unclaimed
 *     counts
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
 *   - Work-queue UPDATE, the resolution audit row and the member's reply
 *     commit in one transaction. The reply is best-effort: a recipient who
 *     cannot be mailed is skipped and the page says the member was not told.
 *   - A decision is validated against the vocabulary the acting action itself
 *     declares, so a payments decision on a contact request (or the reverse) is
 *     impossible by construction rather than by two validators agreeing not to
 *     cross. A type declaring no such action does not resolve here at all and is
 *     reported not-found, the same answer as an unknown id.
 *   - A row is refused when its entity type is not one its task type declares:
 *     acting on it would record a decision about a record the type does not
 *     describe.
 *   - A row is refused when the administrator settling it is the member it is
 *     about, on any task type that declares itself self-action barred. A member
 *     can file a contact request about their own record and an administrator is
 *     a member, so without this an administrator approves a change to their own
 *     record with nobody else in the loop. Whether the bar applies is a declared
 *     property of the task type, beside the one saying whether the member is
 *     answered, so a new type answers the question rather than inheriting an
 *     answer nobody chose.
 *   - Per-member open-request cap is 3, counted across every request the member
 *     raised themselves (contact requests, content reports and link-help
 *     requests alike) and
 *     freed as each is answered; the 4th open submission throws
 *     RateLimitedError. Items the platform raised about a member never count.
 *     Message body is capped at 2000 characters, the resolution note at 500.
 *   - Human-authored text (the member's message, the administrator's resolution,
 *     park and dismissal notes) is cleaned with the shared write-time sanitizer
 *     before validation, so the length caps and repeat checks judge what is stored.
 *
 * Persistence:
 *   work_queue_items, work_queue_topic_owners, audit_entries;
 *   member_announcements (read only: a held announcement's words and author on
 *   its item page; the decisions on it belong to BroadcastService). A sanction
 *   request's answers and its submitter are read through EventService, which
 *   owns the decisions on it. A link-help item's approve form searches the
 *   unclaimed legacy_members and the historical_persons (read only, through
 *   AdminLegacyAccountService and AdminHistoricalRecordService) so the
 *   administrator chooses the record to link rather than typing its id; the
 *   link itself is IdentityAccessService's.
 *
 * Side effects:
 *   - audit_entries append (the event the acting action names on resolution:
 *     support.contact_request_resolved,
 *     payment.queue_item_resolved, or the dismissal event each internal-review
 *     type names for itself; work_queue.parked and work_queue.unparked when an
 *     administrator sets an item aside or takes it back;
 *     work_queue.topic_owner_changed per area whose owner changes)
 *   - outbox_emails enqueue (member notification only where the acting action
 *     says the member is answered; a submitted contact request reaches
 *     administrators through the queue digest, never a per-request alert;
 *     NONE on a payments-task resolution or a review dismissal)
 *   - operational-error audit + alarm on post-commit notification failure
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import {
  workQueue, workQueueTopicOwners, memberMessages, account, payments, outbox, transaction,
  memberAnnouncements,
} from '../db/db';
import {
  enforceWorkQueueResolveLimit, identityAccessService,
  type ClaimEvidence,
} from './identityAccessService';
import { appendAuditEntry, findStandingOwnAct } from './auditService';
import { emailService, actNoticeKey } from './emailService';
import { workQueueService, claimIsLive, claimStaleCutoffIso } from './workQueueService';
import { eventService, type SanctionReviewEvidence } from './eventService';
import {
  workQueueDescriptorFor, workQueueActionFor, requireWorkQueueDescriptor,
  WORK_QUEUE_TASK_TYPES, WORK_QUEUE_TOPICS, WORK_QUEUE_TOPIC_KEYS, isWorkQueueTopic,
  WORK_QUEUE_KINDS, isWorkQueueKind, kindOf, workQueueKindDescriptor,
  type WorkQueueAction, type WorkQueueActionField, type WorkQueueTopic, type WorkQueueKind,
  type WorkQueueBrief,
} from './workQueueTaskTypes';
import { sanitizePage, shapePagination, type Pagination } from '../lib/pagination';
import { toTitleCase } from '../lib/titleCase';
import {
  questionRecipientFor, ANSWER_KINDS, type ExpectedAnswerKind,
} from './memberMessageService';
import { randomUUID } from 'crypto';
import { runSqliteRead } from './sqliteRetry';
import { readIntConfig } from './configReader';
import { NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { cleanUserText } from '../lib/textSanitizer';
import { PICKER_LIMIT, buildRecordPicker, type MemberPickerView, type PickIntent } from './memberPicker';
import { adminLegacyAccountService } from './adminLegacyAccountService';
import { adminHistoricalRecordService } from './adminHistoricalRecordService';
import { PageViewModel } from '../types/page';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';

export const CONTACT_CATEGORIES = [
  'display_name_correction',
  'profile_url_correction',
  'tier_status_question',
  'identity_link_issue',
  'community_standards',
  'other',
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  display_name_correction: 'Display name correction',
  profile_url_correction:  'Profile URL correction',
  tier_status_question:    'Question about my membership',
  identity_link_issue:     'Linking my old footbag.org account or past results',
  community_standards:     'Content that breaks the community standards',
  other:                   'Other',
};

/** What a member reads after sending a contact request. It sets the
 *  expectation the volunteer notice on the form makes: a person reads it, and
 *  the reply takes days, not minutes. */
export const CONTACT_REQUEST_CONFIRMATION =
  "Your request has been sent to IFPA's volunteer administrators. We will reply by email, usually within a few days.";

const TASK_TYPE = 'member_contact_request';
// A contact request reporting content that breaks the community standards: the
// same request, raised as its own type so that it belongs to the moderation area.
const CONTENT_REPORT_TASK_TYPE = 'content_report';
const contactTaskTypeFor = (category: ContactCategory): string =>
  (category === 'community_standards' ? CONTENT_REPORT_TASK_TYPE : TASK_TYPE);
// The other queue a member can put work into themselves. Everything else in the
// queue is raised by the platform about a member, not by the member.
const LINK_HELP_TASK_TYPE = 'member_link_help_request';
const SANCTION_REQUEST_TASK_TYPE = 'sanction_request';
const DECISION_CONFIRM_INSTRUCTIONS = { what: 'Review this decision before it is written.' };

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
  member_announcement:             'Community announcement',
  event:                           'Event',
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
  /** The kind the task type declares; an undeclared type reads as Housekeeping. */
  kind: WorkQueueKind;
  taskType: string;
  entityType: string;
  entityId: string;
  entityHref: string | null;
  entityDisplayName: string | null;
  /** The member the matter is about, whether the row names them directly or
   *  names a record of theirs. Null where no member is behind it at all, which
   *  is every provider-side row. */
  subjectMemberId: string | null;
  /** False for a prospective member, who has no admin record to link. */
  subjectIsNameable: boolean;
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


/** The kind a row's task type declares. A row whose type has since been
 *  withdrawn still has to render somewhere, and Housekeeping is where an item
 *  nobody is waiting on belongs. */
function kindForRow(taskType: string): WorkQueueKind {
  return kindOf(taskType) ?? 'housekeeping';
}

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
  isCheckbox: boolean;
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
  /** The form's own id, which the pickers' controls name. */
  formId: string;
  /** A link-help approval's two record pickers, one per kind of record it can
   *  link. Null on every other action. */
  targetPickers: { accountPicker: MemberPickerView; recordPicker: MemberPickerView } | null;
  /** A dispute revert's choice among the records the dispute named. Null on
   *  every other action. */
  disputeChoices: Array<{ value: string; label: string; inputId: string }> | null;
}

/**
 * What the link-help approve form was holding when one of its picker controls
 * posted it back: the record each picker had chosen, the intent and the search
 * text.
 */
export interface LinkTargetPickForm {
  legacyMemberId: string;
  historicalPersonId: string;
  intent: PickIntent | null;
  query: string;
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
  /** A member's held community announcement, in their own words. */
  isAnnouncement: boolean;
  announcement: { subject: string; bodyParagraphs: string[]; placesLine: string } | null;
  /** An organizer's sanction request, every answer the administrator decides on. */
  isSanctionRequest: boolean;
  sanctionRequest: SanctionReviewEvidence | null;
  reasonText: string | null;
  detailText: string | null;
  linkHelp: {
    statement: string;
    isDispute: boolean;
    /** The records this dispute named when it was filed, detected server-side,
     *  each with who held it then. The revert accepts only one of these, so the
     *  card shows them and the revert offers a choice among them. */
    disputedRecords: Array<{ kind: 'account' | 'record'; kindLabel: string; recordId: string; label: string }>;
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
}

/**
 * What the platform can see behind a member asking to be linked: every old
 * account and competition record the claim-step matching reaches for them,
 * each with the id the approve form takes and what the claim step does with
 * it, a held one naming its holder as a conflict rather than a candidate.
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
}

/** What an upheld dispute's revert removes, shown before it applies. */
export interface DisputeRevertConfirmContent {
  summary: string;
  holder: { displayName: string; recordHref: string };
  record: { id: string; name: string };
  removes: string[];
  unchangedNote: string;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
  legacyMemberId: string;
  historicalPersonId: string;
  reason: string;
  state: WorkQueueFormState;
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
  state: WorkQueueFormState;
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
  kind: WorkQueueKind;
  taskType: string;
  taskTypeLabel: string;
  /** The area the item belongs to and its owner ("Finance · Tim Vozar's area"),
   *  or that it is shared. Orientation only: any administrator may act on it. */
  areaLine: string;
  /** True when the viewing administrator owns the item's area. */
  isViewerArea: boolean;
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
  /** True when the page was opened by the ask deep link, so its composer is already open. */
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

/**
 * An item an administrator set aside. It carries what it is and why it is
 * waiting, and one control to take it back; the actions that resolve it live on
 * the working card it becomes again.
 */
export interface ParkedWorkQueueItemView {
  id: string;
  taskTypeLabel: string;
  areaLine: string;
  isViewerArea: boolean;
  kindLabel: string;
  parkedAtDisplay: string;
  parkedByName: string | null;
  parkReason: string | null;
  summary: string | null;
  entityDisplayName: string | null;
  entityHref: string | null;
  returnAction: string;
  /** The item's own page, which shows it in full while it is parked. */
  openHref: string;
}

/**
 * The list state every work-queue form carries back, as the strings its hidden
 * inputs hold, so an action returns the administrator to the kind, area, filter
 * and page they were working in. Carried in the body rather than the action URL,
 * because a template may not assemble a URL from more than one value.
 */
export interface WorkQueueFormState {
  kind: string;
  topic: string;
  unclaimed: string;
  page: string;
}

/** The list state as a request or a form delivers it, every part optional. */
export interface WorkQueueListQuery {
  kind?: string | null;
  topic?: string | null;
  unclaimed?: string | null;
  page?: string | null;
}

/** One filter link on the list: a kind, an area, or the unclaimed switch. */
export interface WorkQueueFilterLink {
  label: string;
  href: string;
  isActive: boolean;
}

/** One line of the list: one item, named, placed and aged, with Claim and Open. */
export interface WorkQueueRowViewModel {
  id: string;
  taskTypeLabel: string;
  /** The item's area, or Shared. Never coloured: an area is a place, not a state. */
  areaLabel: string;
  waitingLabel: string;
  claimLabel: string;
  canClaim: boolean;
  claimAction: string;
  openHref: string;
}

/** The outcome of the last action, shared by every work-queue page. */
export interface WorkQueueOutcomeContent {
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
  /** A dispute upheld and the wrongly-held claim stripped. Its own flag because
   *  a revert resolves nothing and answers nobody: the request is still open,
   *  waiting on an approval or a rejection, and the banner has to say so. */
  claimRevertedFlag: boolean;
  /** An action that found its item already settled by another act, carried
   *  across the redirect with its informational tone. */
  outcome: OutcomeNoticeView | null;
  parkedFlag: boolean;
  unparkedFlag: boolean;
  errorMessage: string | null;
}

/** The outcome flags a page is built with, read from the flash by the controller. */
export type WorkQueueOutcomeOptions = Partial<Omit<WorkQueueOutcomeContent, 'outcome' | 'errorMessage'>> & {
  outcome?: OutcomeNoticeView | null;
  errorMessage?: string;
};

/** The queue list: one kind at a time, oldest first, paged. */
export interface WorkQueueListContent extends WorkQueueOutcomeContent {
  kindLabel: string;
  kindWhat: string;
  kindWhy: string;
  /** "{n} open, oldest {d} days", or "Nothing open." for an empty view. */
  countLine: string;
  kindLinks: WorkQueueFilterLink[];
  /** All, Your Areas, each area some task type belongs to, Shared. */
  areaLinks: WorkQueueFilterLink[];
  unclaimedLink: WorkQueueFilterLink;
  rows: WorkQueueRowViewModel[];
  isEmpty: boolean;
  pagination: Pagination;
  state: WorkQueueFormState;
  parkedHref: string;
  areasHref: string;
}

/** One identifying fact on an item page's facts strip. */
export interface WorkQueueFact {
  label: string;
  value: string;
}

/** One item's page: what, why and what to do, then the evidence and the actions. */
export interface WorkQueueItemContent extends WorkQueueOutcomeContent {
  item: WorkQueueViewItem;
  /** The type's declared brief; null only for a type since withdrawn. */
  brief: WorkQueueBrief | null;
  /** Kind, area and age: the identifying facts that open the page. */
  facts: WorkQueueFact[];
  /** Who is holding the item, in words, shown after the evidence. */
  heldBy: string;
  /** Set while the item is parked: it shows why and one control to take it
   *  back, and its resolving actions wait until it is working again. */
  parked: {
    parkedAtDisplay: string;
    parkedByName: string | null;
    parkReason: string | null;
    returnAction: string;
  } | null;
  /**
   * The kinds of answer a question can ask for, as value-and-label pairs.
   *
   * Built from the one list the send path validates against, so the dropdown
   * cannot come to offer a kind the service refuses, or miss one it accepts.
   */
  answerKindOptions: Array<{ value: string; label: string }>;
  state: WorkQueueFormState;
}

/** The items an administrator set aside, on a page of their own. */
export interface WorkQueueParkedContent extends WorkQueueOutcomeContent {
  parked: ParkedWorkQueueItemView[];
  hasParked: boolean;
}

/** Each area's accountable owner, set from one form. */
export interface WorkQueueAreasContent {
  /** One owner choice per area, every area included. */
  areaOwnerFields: Array<{
    topic: string;
    label: string;
    fieldName: string;
    options: Array<{ value: string; label: string; selected: boolean }>;
  }>;
  outcome: OutcomeNoticeView | null;
  errorMessage: string | null;
}

/** One area's share of a kind's open items, for the dashboard card's rows. */
export interface WorkQueueKindAreaCount {
  key: string;
  label: string;
  open: number;
  href: string;
}

/**
 * One kind's facts for its dashboard card: what it is and why it matters, how
 * much is open, how old the oldest is, how much has waited past the stale
 * threshold with nobody holding it, and where it sits by area.
 */
export interface WorkQueueKindSummary {
  kind: WorkQueueKind;
  label: string;
  what: string;
  why: string;
  open: number;
  oldestDays: number | null;
  unclaimedStale: number;
  staleDays: number;
  /** "{n} open, oldest {d} days; {m} unclaimed past {s} days", or "Nothing open." */
  countLine: string;
  perArea: WorkQueueKindAreaCount[];
  href: string;
}

/** What one administrator is holding, and what the rest of the team is. */
export interface WorkQueueClaimSummary {
  claimedByYou: number;
  heldByOthers: number;
}

export interface WorkQueueSummary {
  /** Every kind, in the kind registry's order, empty ones included. */
  kinds: WorkQueueKindSummary[];
  totalOpen: number;
}

function parseLinkHelpPayload(reasonText: string | null): WorkQueueEvidenceView['linkHelp'] {
  if (!reasonText) return null;
  try {
    const p = JSON.parse(reasonText) as Record<string, unknown>;
    const idList = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
    // Who held each record when the dispute was filed: the one member the
    // revert may take it from.
    const holders = p.disputed_record_holders !== null && typeof p.disputed_record_holders === 'object'
      ? p.disputed_record_holders as Record<string, unknown>
      : {};
    const heldBy = (recordId: string): string => {
      const holderId = holders[recordId];
      const holder = typeof holderId === 'string'
        ? account.findActiveMemberById.get(holderId) as { display_name: string } | undefined
        : undefined;
      return holder ? `, held by ${holder.display_name}` : ', held by nobody when the dispute was filed';
    };
    const labelled = (kind: 'account' | 'record', kindLabel: string, recordId: string, name: string | undefined) => ({
      kind, kindLabel, recordId,
      label: `${kindLabel}: ${name ? `${name} (${recordId})` : recordId}${heldBy(recordId)}`,
    });
    const disputedRecords = [
      ...idList(p.disputed_legacy_member_ids).map((recordId) => labelled(
        'account', 'Old footbag.org account', recordId, adminLegacyAccountService.findAccountForPicker(recordId)?.displayName,
      )),
      ...idList(p.disputed_historical_person_ids).map((recordId) => labelled(
        'record', 'Past results', recordId, adminHistoricalRecordService.findRecordForPicker(recordId)?.displayName,
      )),
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
  field: { name: string; label: string; input: WorkQueueActionField['input']; maxLength: number; required: boolean },
): WorkQueueActionFieldView {
  return {
    name:       field.name,
    label:      field.label,
    inputId:    inputIdFor(itemId, actionKey, field.name),
    isTextarea: field.input === 'textarea',
    isCheckbox: field.input === 'checkbox',
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
/**
 * A link-help approval's two pickers, sharing its form: one over the old
 * accounts nobody has claimed, one over the historical records. Choosing in one
 * clears the other, because an approval links exactly one record; Remove clears
 * a choice. Only the picker whose own search was asked for runs it.
 */
function linkTargetPickers(
  formId: string,
  formAction: string,
  form: LinkTargetPickForm | undefined,
): { accountPicker: MemberPickerView; recordPicker: MemberPickerView } {
  const intent = form?.intent ?? null;
  let legacyMemberId = form?.legacyMemberId ?? '';
  let historicalPersonId = form?.historicalPersonId ?? '';
  if (intent?.kind === 'choose' && intent.key === 'account') {
    legacyMemberId = intent.memberId;
    historicalPersonId = '';
  } else if (intent?.kind === 'choose' && intent.key === 'record') {
    historicalPersonId = intent.memberId;
    legacyMemberId = '';
  } else if (intent?.kind === 'remove' && intent.key === 'account') {
    legacyMemberId = '';
  } else if (intent?.kind === 'remove' && intent.key === 'record') {
    historicalPersonId = '';
  }
  const query = form?.query ?? '';
  const searched = (key: string) => intent?.kind === 'search' && intent.key === key;
  const shared = {
    formId, formAction, intent, query, openOnLoad: false, canRemove: true, notFoundHint: null,
    rowAction: { label: 'Choose', completes: false, ariaLabel: (name: string) => `Choose ${name}` },
  };
  return {
    accountPicker: buildRecordPicker({
      ...shared,
      fieldName: 'target_legacy_member_id', fieldKey: 'account',
      label: 'Old footbag.org account', openLabel: 'Choose Old Account',
      searchLabel: 'Name, account id, username, or an exact email address',
      chosen: adminLegacyAccountService.findAccountForPicker(legacyMemberId),
      search: searched('account') ? adminLegacyAccountService.lookupAccountsForPicker(query, PICKER_LIMIT) : null,
      notFoundNoun: 'account',
    }),
    recordPicker: buildRecordPicker({
      ...shared,
      fieldName: 'target_historical_person_id', fieldKey: 'record',
      label: 'Historical record', openLabel: 'Choose Historical Record',
      searchLabel: 'Name, or an old account id',
      chosen: adminHistoricalRecordService.findRecordForPicker(historicalPersonId),
      search: searched('record') ? adminHistoricalRecordService.lookupRecordsForPicker(query, PICKER_LIMIT) : null,
      notFoundNoun: 'record',
    }),
  };
}

function shapeActions(
  itemId: string,
  taskType: string,
  linkHelp: WorkQueueEvidenceView['linkHelp'],
  linkPick?: LinkTargetPickForm,
): WorkQueueActionView[] {
  const descriptor = workQueueDescriptorFor(taskType);
  if (!descriptor) return [];
  const out: WorkQueueActionView[] = [];
  for (const action of descriptor.actions) {
    if (action.kind === 'elsewhere') {
      out.push({
        key: 'elsewhere', label: action.label, buttonClass: 'btn btn-outline',
        isLink: true, href: action.href, actionPath: null,
        decisions: [], hasDecisions: false, decisionInputId: '',
        fields: [], hasFields: false, note: null, hint: null,
        formId: '', targetPickers: null, disputeChoices: null,
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
    const actionPath = `/admin/work-queue/${itemId}/${action.key}`;
    const formId = inputIdFor(itemId, action.key, 'form');
    const targetChoice = action.kind === 'act' ? action.targetChoice : undefined;
    out.push({
      key:             action.key,
      label:           action.label,
      formId,
      targetPickers:   targetChoice === 'link_target' ? linkTargetPickers(formId, actionPath, linkPick) : null,
      disputeChoices:  targetChoice === 'disputed_record'
        ? (linkHelp?.disputedRecords ?? []).map((r) => ({
          value:   `${r.kind}:${r.recordId}`,
          label:   r.label,
          inputId: inputIdFor(itemId, action.key, `${r.kind}_${r.recordId}`),
        }))
        : null,
      // Each action stands alone in its own form on the item's page, so it takes
      // the full-size button rather than the compact row size.
      buttonClass:     action.style === 'primary' ? 'btn btn-primary' : 'btn btn-outline',
      isLink:          false,
      href:            null,
      actionPath,
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
 * The records the platform can already see for this member, as the card shows
 * them: each with the id the approve form takes, so the administrator never has
 * to go and find an identifier the page could have handed them.
 */
function shapeLinkCandidates(memberId: string): LinkCandidatesView {
  const found = identityAccessService.getLinkCandidatesForAdmin(memberId);
  const legacyAccounts = found.legacyAccounts.map((a) => ({
    legacyMemberId: a.legacyMemberId,
    displayName:    a.displayName ?? a.legacyMemberId,
    facts: [a.legacyMemberId, a.country, a.anchorLabel ? `Found through ${a.anchorLabel}` : null, a.statusLabel]
      .filter((f): f is string => Boolean(f)),
    birthDate: a.birthDate,
  }));
  const historicalPersons = found.historicalPersons.map((p) => ({
    personId:   p.personId,
    personName: p.personName,
    matchNote:  [p.isVariantMatch ? 'Matched through a recorded name variant.' : null, p.statusLabel]
      .filter((f): f is string => Boolean(f)).join(' '),
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
  };
}

/**
 * The announcement as the member wrote it: the subject, and the body split
 * into its paragraphs so it reads as written. Null where the row has gone,
 * which leaves the page showing the brief and the actions alone.
 */
function shapeAnnouncementEvidence(
  announcementId: string,
): { subject: string; bodyParagraphs: string[]; placesLine: string } | null {
  const row = memberAnnouncements.findById.get(announcementId) as
    | { subject: string; body_text: string; publish_to: 'list' | 'feed' | 'both' }
    | undefined;
  if (!row) return null;
  return {
    subject: row.subject,
    bodyParagraphs: row.body_text.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter((p) => p.length > 0),
    // The places the member chose, which an approval publishes to as chosen.
    placesLine: ANNOUNCEMENT_PLACES_LINE[row.publish_to],
  };
}

const ANNOUNCEMENT_PLACES_LINE: Record<'list' | 'feed' | 'both', string> = {
  list: 'Publish to: the announcements list',
  feed: 'Publish to: the news feed',
  both: 'Publish to: the announcements list and the news feed',
};

/** What the card shows the decision being made on, per the type's declaration. */
function shapeEvidence(raw: ContactRequestRow): WorkQueueEvidenceView {
  const evidence = workQueueDescriptorFor(raw.taskType)?.evidence ?? { kind: 'reason_text' as const };
  const isLinkHelp = evidence.kind === 'structured' && evidence.payload === 'link_help';
  const isAnnouncement = evidence.kind === 'structured' && evidence.payload === 'announcement';
  const isSanctionRequest = evidence.kind === 'structured' && evidence.payload === 'sanction_request';
  return {
    isReasonText:    evidence.kind === 'reason_text',
    isMemberMessage: evidence.kind === 'member_message',
    isLinkHelp,
    isAnnouncement,
    announcement: isAnnouncement ? shapeAnnouncementEvidence(raw.entityId) : null,
    isSanctionRequest,
    sanctionRequest: isSanctionRequest ? eventService.getSanctionReviewEvidence(raw.entityId) : null,
    // A structured payload holds JSON in the same column, so the raw text is
    // withheld there rather than printed as noise.
    reasonText: evidence.kind === 'structured' ? null : raw.reasonText,
    detailText: evidence.kind === 'structured' ? null : raw.detailText,
    linkHelp:   isLinkHelp ? parseLinkHelpPayload(raw.reasonText) : null,
    candidates: isLinkHelp ? shapeLinkCandidates(raw.entityId) : null,
    // The evidence an identity decision is actually made on. Offered only on the
    // matters that ask an administrator to judge one, because everywhere else it
    // is a member's claim history shown for no reason.
    claimEvidence: isLinkHelp
      ? identityAccessService.getClaimEvidenceForMember(raw.entityId)
      : null,
  };
}

/** Each area's owner, only while that owner is still a current administrator. */
type AreaOwners = Map<WorkQueueTopic, { memberId: string; displayName: string }>;

function readAreaOwners(): AreaOwners {
  const rows = workQueueTopicOwners.listAll.all() as Array<{
    topic: string;
    owner_member_id: string | null;
    owner_display_name: string | null;
    owner_is_current_admin: 0 | 1;
  }>;
  const owners: AreaOwners = new Map();
  for (const r of rows) {
    if (!isWorkQueueTopic(r.topic)) continue;
    if (r.owner_member_id && r.owner_is_current_admin === 1 && r.owner_display_name) {
      owners.set(r.topic, { memberId: r.owner_member_id, displayName: r.owner_display_name });
    }
  }
  return owners;
}

/**
 * The areas some task type belongs to today, in registry order. Only these get
 * a filter link: an area nothing can land in yet (sanctioning, freestyle) would
 * be a link that always shows an empty queue. Every area still appears in the
 * owners form, because its owner is worth recording before its first type.
 */
function areasWithTaskTypes(): WorkQueueTopic[] {
  const used = new Set(
    Object.values(WORK_QUEUE_TASK_TYPES).map((d) => d.routeTopic).filter((t) => t !== null),
  );
  return WORK_QUEUE_TOPIC_KEYS.filter((t) => used.has(t));
}

/** How a card names its area: the area and its owner, or that it is shared. */
function areaLineFor(
  taskType: string,
  owners: AreaOwners,
  viewingAdminId: string,
): { areaLine: string; isViewerArea: boolean } {
  const topic = workQueueDescriptorFor(taskType)?.routeTopic ?? null;
  if (topic === null) return { areaLine: 'Shared · any administrator', isViewerArea: false };
  const label = WORK_QUEUE_TOPICS[topic].label;
  const owner = owners.get(topic);
  if (!owner) return { areaLine: `${label} · no owner set`, isViewerArea: false };
  return {
    areaLine: `${label} · ${owner.displayName}'s area`,
    isViewerArea: owner.memberId === viewingAdminId,
  };
}

/** The `?topic=` values the page honours; anything else shows every area. */
type AreaFilter = 'mine' | 'shared' | WorkQueueTopic;

function parseAreaFilter(raw: string | null | undefined): AreaFilter | null {
  if (!raw) return null;
  if (raw === 'mine' || raw === 'shared') return raw;
  return isWorkQueueTopic(raw) && areasWithTaskTypes().includes(raw) ? raw : null;
}

function matchesAreaFilter(
  taskType: string,
  filter: AreaFilter,
  owners: AreaOwners,
  viewingAdminId: string,
): boolean {
  const topic = workQueueDescriptorFor(taskType)?.routeTopic ?? null;
  if (filter === 'shared') return topic === null;
  if (filter === 'mine') return topic !== null && owners.get(topic)?.memberId === viewingAdminId;
  return topic === filter;
}

/** Items on one page of the queue list. */
const LIST_PAGE_SIZE = 25;
const LIST_PATH = '/admin/work-queue';
const PARKED_PATH = '/admin/work-queue/parked';
const AREAS_PATH = '/admin/work-queue-areas';

/** The list state once read: each part either recognised or absent. */
interface ListState {
  kind: WorkQueueKind | null;
  topic: AreaFilter | null;
  unclaimed: boolean;
  page: number;
}

/**
 * Reads a list state from a request or a form. An unrecognised kind or area is
 * treated as absent rather than refused: this is an administrator's read-only
 * surface reached from a link, and a stale or mistyped one is better answered
 * with the default view than with an error page.
 */
function parseListState(raw: WorkQueueListQuery): ListState {
  return {
    kind: raw.kind && isWorkQueueKind(raw.kind) ? raw.kind : null,
    topic: parseAreaFilter(raw.topic),
    unclaimed: raw.unclaimed === '1',
    page: sanitizePage(raw.page),
  };
}

/** The query string for a list state, leaving out every default. */
function listQuery(state: ListState): string {
  const params = new URLSearchParams();
  if (state.kind) params.set('kind', state.kind);
  if (state.topic) params.set('topic', state.topic);
  if (state.unclaimed) params.set('unclaimed', '1');
  if (state.page > 1) params.set('page', String(state.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function listHref(state: ListState): string {
  return `${LIST_PATH}${listQuery(state)}`;
}

/** An item's page, carrying the list state it was opened from. */
function itemHref(id: string, state: ListState): string {
  return `${LIST_PATH}/${encodeURIComponent(id)}${listQuery(state)}`;
}

function formStateOf(state: ListState): WorkQueueFormState {
  return {
    kind: state.kind ?? '',
    topic: state.topic ?? '',
    unclaimed: state.unclaimed ? '1' : '',
    page: state.page > 1 ? String(state.page) : '',
  };
}

/** "1 day", "4 days". */
function dayCount(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

/** Whole days an item has waited, counting a day begun as one, the escalation's rule. */
function daysWaiting(openedAtIso: string, nowMs: number): number {
  return Math.max(1, Math.floor((nowMs - Date.parse(openedAtIso)) / 86_400_000));
}

/** A kind's count line, said the same way on the dashboard card and the list. */
function countLine(open: number, oldestDays: number | null, unclaimedStale: number, staleDays: number): string {
  if (open === 0 || oldestDays === null) return 'Nothing open.';
  const head = `${open} open, oldest ${dayCount(oldestDays)}`;
  return unclaimedStale > 0
    ? `${head}; ${unclaimedStale} unclaimed past ${dayCount(staleDays)}`
    : head;
}

/** Whether a row falls in an area filter; no filter takes every row. */
function inArea(
  taskType: string,
  filter: AreaFilter | null,
  owners: AreaOwners,
  viewingAdminId: string,
): boolean {
  return filter === null || matchesAreaFilter(taskType, filter, owners, viewingAdminId);
}

/** A row with nobody holding a live claim on it. */
function isUnclaimed(row: ContactRequestRow, staleCutoffIso: string): boolean {
  return !claimIsLive(row.claimedAt, staleCutoffIso);
}

/** The outcome block every work-queue page carries, from the controller's flags. */
function shapeOutcomes(opts: WorkQueueOutcomeOptions): WorkQueueOutcomeContent {
  return {
    resolvedFlag: opts.resolvedFlag ?? false,
    resolvedQuietFlag: opts.resolvedQuietFlag ?? false,
    reviewedFlag: opts.reviewedFlag ?? false,
    claimedFlag: opts.claimedFlag ?? false,
    claimNoopFlag: opts.claimNoopFlag ?? false,
    memberAskedFlag: opts.memberAskedFlag ?? false,
    claimRevertedFlag: opts.claimRevertedFlag ?? false,
    parkedFlag: opts.parkedFlag ?? false,
    unparkedFlag: opts.unparkedFlag ?? false,
    outcome: opts.outcome ?? null,
    errorMessage: opts.errorMessage ?? null,
  };
}

/** One row of the open listing, joined to the member it concerns where there is one. */
interface OpenItemRow {
  id: string;
  opened_at: string;
  task_type: string;
  entity_type: string;
  entity_id: string;
  reason_text: string | null;
  detail_text: string | null;
  claimed_by_member_id: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
}

/**
 * A stored open item as the service reads it. Entity-display lookup belongs in
 * the service (db.ts is the only SQL surface; controllers are HTTP glue). A
 * Stripe-side entity has no row here and renders as its labelled reference alone.
 */
function toAdminRow(r: OpenItemRow): ContactRequestRow {
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
  } else if (r.entity_type === 'member_announcement') {
    // The announcement's author, named as a payment's payer is: the
    // administrator judges the words knowing whose they are.
    const a = memberAnnouncements.findById.get(r.entity_id) as { member_id: string } | undefined;
    subjectMemberId = a?.member_id ?? null;
  } else if (r.entity_type === 'event' && r.task_type === SANCTION_REQUEST_TASK_TYPE) {
    // The organizer who sent the request, named so the administrator knows whom
    // to contact before deciding.
    subjectMemberId = eventService.sanctionRequesterId(r.entity_id);
  }
  // A prospective member is not a member: never named or linked on an admin
  // page, so the item shows them by id with no profile or record link.
  let subjectIsNameable = false;
  if (subjectMemberId) {
    const m = account.findContactInfoById.get(subjectMemberId) as
      | { slug: string; display_name: string; is_nameable: 0 | 1 }
      | undefined;
    if (m && m.is_nameable) {
      subjectIsNameable = true;
      entityHref = `/members/${m.slug}`;
      entityDisplayName = m.display_name;
    }
  }
  return {
    id: r.id,
    openedAtIso: r.opened_at,
    kind: kindForRow(r.task_type),
    taskType: r.task_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityHref,
    entityDisplayName,
    subjectMemberId,
    subjectIsNameable,
    reasonText: r.reason_text,
    detailText: r.detail_text,
    claimedByMemberId: r.claimed_by_member_id,
    claimedByName: r.claimed_by_name,
    claimedAt: r.claimed_at,
  };
}

/** The open rows as stored, before any member lookup: enough to count and list. */
function readOpenRows(): OpenItemRow[] {
  return workQueue.listOpenForAdmin.all() as OpenItemRow[];
}

/** The parts of a stored row the list and the counts read, with no member lookup. */
function toListRow(r: OpenItemRow): ContactRequestRow {
  return {
    id: r.id,
    openedAtIso: r.opened_at,
    kind: kindForRow(r.task_type),
    taskType: r.task_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityHref: null,
    entityDisplayName: null,
    subjectMemberId: null,
    subjectIsNameable: false,
    reasonText: r.reason_text,
    detailText: r.detail_text,
    claimedByMemberId: r.claimed_by_member_id,
    claimedByName: r.claimed_by_name,
    claimedAt: r.claimed_at,
  };
}

/** An item's area as the list names it: the area, or Shared. */
function areaLabelFor(taskType: string): string {
  const topic = workQueueDescriptorFor(taskType)?.routeTopic ?? null;
  return topic === null ? 'Shared' : WORK_QUEUE_TOPICS[topic].label;
}

function shapeWorkQueueItem(
  raw: ContactRequestRow,
  viewingAdminId: string,
  askRequested: boolean,
  owners: AreaOwners,
  linkPick?: LinkTargetPickForm,
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
  // A member who may not be named here (a registrant still onboarding) is shown
  // by id with no link, so the page still says who the item concerns.
  const entityReference = raw.entityType === 'member'
    ? (raw.entityDisplayName === null ? { label: 'Member', id: raw.entityId, href: null } : null)
    : {
      label: ENTITY_REFERENCE_LABELS[raw.entityType] ?? raw.entityType,
      id:    raw.entityId,
      // A payment is the platform's own record and has a page; a Stripe id
      // belongs to the provider's dashboard and gets no link from here.
      href:  raw.entityType === 'payment' ? `/admin/payments/${raw.entityId}` : null,
    };

  return {
    id: raw.id,
    kind: raw.kind,
    taskType: raw.taskType,
    taskTypeLabel: workQueueDescriptorFor(raw.taskType)?.label ?? raw.taskType,
    ...areaLineFor(raw.taskType, owners, viewingAdminId),
    openedAtIso: raw.openedAtIso,
    openedAtDisplay: raw.openedAtIso.slice(0, 10),
    entityType: raw.entityType,
    entityId: raw.entityId,
    entityHref: raw.entityHref,
    entityDisplayName: raw.entityDisplayName,
    memberRecordHref: raw.subjectMemberId && raw.subjectIsNameable ? `/admin/members/${raw.subjectMemberId}` : null,
    entityReference,
    evidence,
    actions: shapeActions(raw.id, raw.taskType, evidence.linkHelp, linkPick),
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
    askOpen: canAskMember && askRequested,
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
 * receive. The queue UPDATE, the audit row and the member's reply commit
 * together.
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
  // An administrator may not settle an item that is about them. On a type an
  // administrator can raise themselves, deciding it too would mean approving a
  // change to their own record with nobody else in the loop; the legacy-identity
  // help path refuses the same thing for the same reason.
  if (action.selfActionBarred && row.entity_id === input.adminMemberId) {
    throw new ValidationError(
      'You cannot resolve a request about your own record. Another administrator must review it.',
    );
  }

  const nowIso = new Date().toISOString();
  const memberNotified = transaction(() => {
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
    const auditId = appendAuditEntry({
      actionType:    action.auditActionType,
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

    // A decision on a provider-side record reaches no member: the row points at
    // a payment record rather than a person, and any member-facing message went
    // out when the underlying event was recorded.
    if (!action.notifiesSubject) return false;
    const member = account.findContactInfoById.get(row.entity_id) as
      | { display_name: string }
      | undefined;
    if (!member) return false;
    // Whether the reply reached the outbox decides what the page says. Claiming
    // the member was notified when nothing was queued (a disabled template, an
    // undeliverable mailbox) sends the administrator away believing the request
    // is closed on both sides; the page has a quiet-resolution banner for that.
    return emailService.sendActNotice({
      template: 'contact_request_resolution',
      params: {
        memberName: member.display_name,
        displayDecision: decision.label,
        note,
      },
      memberId: row.entity_id,
      actId: auditId,
    });
  });
  return { status: 'resolved', memberNotified };
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
    // Cleaned first, so the required and length checks, the summary, and the
    // repeat lookup below all judge what is stored.
    const trimmed = cleanUserText(input.message ?? '', 'multi_line', 'message');
    if (trimmed.length === 0) {
      throw new ValidationError('Message is required.');
    }
    if (trimmed.length > MAX_MESSAGE_LEN) {
      throw new ValidationError(`Message must be ${MAX_MESSAGE_LEN} characters or fewer.`);
    }

    const categoryLabel = CONTACT_CATEGORY_LABELS[category];
    const summary = trimmed.length > MAX_REASON_TEXT
      ? trimmed.slice(0, MAX_REASON_TEXT)
      : trimmed;
    const reasonText = `${categoryLabel}: ${summary}`;

    // The same request submitted twice finds the one its first submit opened:
    // same member, same category, same words, still open. That request is the
    // result, so nothing is opened, recorded or counted against the cap again.
    if (category !== 'identity_link_issue') {
      const sameOpen = workQueue.findOpenMemberRequestByText.get(
        contactTaskTypeFor(category), 'member', input.requestingMemberId, reasonText, trimmed,
      ) as { id: string } | undefined;
      if (sameOpen) return { id: sameOpen.id };
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
    const openTotal = openRaisedByMember(TASK_TYPE) + openRaisedByMember(CONTENT_REPORT_TASK_TYPE)
      + openLinkHelp;
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
    // evidence strength. Claiming is confined to the onboarding wizard, so this is
    // the only way a member reaches that queue once signing up is behind them.
    if (category === 'identity_link_issue') {
      const result = identityAccessService.submitLinkHelpRequest(input.requestingMemberId, {
        statement: trimmed,
      });
      return { id: result.workQueueItemId };
    }

    // The work-queue row is the record of the request, carrying who sent it,
    // when, and the message, so the submission writes no audit row.
    const { id } = workQueueService.enqueue({
      actorId:       input.requestingMemberId,
      taskType:      contactTaskTypeFor(category),
      entityType:    'member',
      entityId:      input.requestingMemberId,
      reasonText,
      detailText:    trimmed,
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
   * A repeat of this administrator's own resolve, with the same decision and
   * note, reports that resolve again and writes nothing. Otherwise throws
   * NotFoundError when the id is not an open item of a resolvable type, an
   * answer indistinguishable from an unknown id: a reconciliation-discrepancy
   * twin (resolved with its issue), a link-help request, or a review flag cannot
   * be resolved or probed here.
   */
  async resolve(input: WorkQueueResolveInput): Promise<{ status: 'resolved'; memberNotified: boolean }> {
    const note = cleanUserText(input.resolutionNote ?? '', 'multi_line', 'resolution_note');
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
      | {
          status: string; entity_type: string; entity_id: string; task_type: string;
          reason_text: string | null; resolved_by_member_id: string | null;
          decision_label: string | null;
        }
      | undefined;

    // Only a type that declares a decide action resolves here. Reconciliation
    // twins close with their issue; link-help and review items have their own
    // controls. None of those is resolvable here, and each is reported like an
    // unknown id so the endpoint reveals nothing about which type a hidden item
    // is.
    const action = row ? workQueueActionFor(row.task_type, 'resolve') : null;

    // This actor's own resolve of the item, with the same decision and note, is
    // what closed it: their repeat reports that resolve's outcome, read from
    // whether its email reached the outbox, and spends no rate-limit slot. A
    // different decision or note is not a repeat and meets the closed item's
    // not-found answer.
    if (row && row.status === 'resolved' && row.resolved_by_member_id === input.adminMemberId
      && action?.kind === 'decide'
      && row.decision_label === input.decisionLabel && row.reason_text === note) {
      // The resolve is found by its queue item, not as the actor's latest on the
      // member: a later request from the same member, resolved since, would
      // otherwise stand in for this one. A resolve has no reversal, so the act
      // is passed as its own reversing action.
      const resolve = findStandingOwnAct(
        input.adminMemberId, action.auditActionType, action.auditActionType,
        row.entity_type, row.entity_id,
        { metadataKey: 'queue_item_id', id: input.queueItemId },
      );
      const queued = action.notifiesSubject && resolve !== null
        && outbox.findByIdempotencyKey.get(
          actNoticeKey('contact_request_resolution', resolve.id, row.entity_id),
        ) !== undefined;
      return { status: 'resolved', memberNotified: queued };
    }

    enforceWorkQueueResolveLimit(input.adminMemberId);
    if (!row || row.status !== 'open') {
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }
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
    /** The list state the item was opened from, carried back by both buttons. */
    state: WorkQueueListQuery;
  }): PageViewModel<LinkHelpConfirmContent> {
    const state = parseListState(opts.state);
    const preview = identityAccessService.previewLinkHelpApproval(
      opts.adminMemberId,
      opts.queueItemId,
      { legacyMemberId: opts.legacyMemberId, historicalPersonId: opts.historicalPersonId },
    );
    const title = 'Confirm: Link This Record to This Member';
    return {
      seo:  { title, noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_link_help_confirm', title, instructions: DECISION_CONFIRM_INSTRUCTIONS },
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
        // Cancelling goes back to the item the approval was started from.
        cancelHref:    itemHref(opts.queueItemId, state),
        legacyMemberId:     preview.legacyMemberId ?? '',
        historicalPersonId: preview.historicalPersonId ?? '',
        state:              formStateOf(state),
      },
    };
  },

  /**
   * The page an administrator confirms before an upheld dispute's revert
   * applies: who holds the record, which record, and exactly what the revert
   * removes, read from the revert itself rehearsed and rolled back. Null when
   * nobody holds the record any more, so there is nothing to revert.
   */
  getDisputeRevertConfirmPage(opts: {
    adminMemberId: string;
    queueItemId: string;
    legacyMemberId: string;
    historicalPersonId: string;
    reason: string;
    /** The list state the item was opened from, carried back by both buttons. */
    state: WorkQueueListQuery;
  }): PageViewModel<DisputeRevertConfirmContent> | null {
    const state = parseListState(opts.state);
    const preview = identityAccessService.previewClaimDisputeRevert(
      opts.adminMemberId,
      opts.queueItemId,
      { legacyMemberId: opts.legacyMemberId, historicalPersonId: opts.historicalPersonId },
      opts.reason,
    );
    if ('status' in preview) return null;
    const removes: string[] = [];
    if (preview.removesAccountId) removes.push(`The link to the old footbag.org account ${preview.removesAccountId}`);
    if (preview.removesRecordName) removes.push(`The link to the competition record ${preview.removesRecordName}`);
    if (preview.removesTierGrant) removes.push('The tier grant the claim gave');
    if (preview.removesHof) {
      removes.push('Their Hall of Fame membership and induction year, which came from this claim');
    }
    if (preview.removesBap) {
      removes.push('Their Big Add Posse membership and induction year, which came from this claim');
    }
    if (preview.clearsRecordDeceasedMark) {
      removes.push('The deceased mark their account placed on the disputed record');
    }
    if (preview.clearedFields.length > 0) {
      removes.push(`These details the claim filled in: ${preview.clearedFields.join(', ')}`);
    }
    const title = 'Confirm: Revert a Disputed Claim';
    return {
      seo:  { title, noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_dispute_revert_confirm', title, instructions: DECISION_CONFIRM_INSTRUCTIONS },
      content: {
        summary: 'Upholding this dispute takes the record away from the member who holds it. '
          + 'Check what the revert removes before you confirm.',
        holder: {
          displayName: preview.holder.displayName,
          recordHref:  `/admin/members/${preview.holder.memberId}`,
        },
        record: preview.record,
        removes,
        unchangedNote: 'Nothing else changes: they stay a member, and details they entered '
          + 'themselves stay as they are.',
        confirmAction: `/admin/work-queue/${opts.queueItemId}/link-help/dispute-revert/confirm`,
        confirmLabel:  'Revert the Claim',
        // Cancelling goes back to the item the revert was started from.
        cancelHref:    itemHref(opts.queueItemId, state),
        legacyMemberId:     opts.legacyMemberId,
        historicalPersonId: opts.historicalPersonId,
        reason:             preview.reason,
        state:              formStateOf(state),
      },
    };
  },

  /**
   * The items an administrator has set aside, newest park first. Read apart from
   * the working queue so a parked item stays visible without counting as work
   * waiting on anyone.
   */
  listParkedForAdmin(
    viewingAdminId: string,
    owners: AreaOwners = readAreaOwners(),
  ): ParkedWorkQueueItemView[] {
    const rows = workQueue.listParkedForAdmin.all() as Array<{
      id: string;
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
      // A prospective member is never named or linked on an admin page.
      const found = r.entity_type === 'member'
        ? account.findContactInfoById.get(r.entity_id) as
          | { slug: string; display_name: string; is_nameable: 0 | 1 } | undefined
        : undefined;
      const member = found && found.is_nameable ? found : undefined;
      // A link-help payload is JSON in the same column, so the parked row says
      // what it is by its type label rather than printing the payload.
      const isStructured = workQueueDescriptorFor(r.task_type)?.evidence.kind === 'structured';
      return {
        id:                r.id,
        taskTypeLabel:     workQueueDescriptorFor(r.task_type)?.label ?? r.task_type,
        ...areaLineFor(r.task_type, owners, viewingAdminId),
        kindLabel:         workQueueKindDescriptor(kindForRow(r.task_type)).label,
        parkedAtDisplay:   r.parked_at.slice(0, 10),
        parkedByName:      r.parked_by_name,
        parkReason:        r.park_reason,
        summary:           isStructured ? null : r.reason_text,
        entityDisplayName: member?.display_name ?? null,
        entityHref:        member ? `/members/${member.slug}` : null,
        returnAction:      `/admin/work-queue/${r.id}/unpark`,
        openHref:          itemHref(r.id, parseListState({})),
      };
    });
  },

  /**
   * List all currently open, unparked work-queue items, oldest first, each
   * carrying the kind its task type declares.
   */
  listOpenForAdmin(): ContactRequestRow[] {
    return readOpenRows().map(toAdminRow);
  },

  /**
   * Each kind's facts for its dashboard card, every kind in the registry's
   * order, each linking to the queue showing that kind. Parked items are not
   * counted: they wait on something outside the queue.
   */
  getWorkQueueSummary(nowMs: number = Date.now()): WorkQueueSummary {
    return runSqliteRead('admin dashboard work queue summary', () => this.readWorkQueueSummary(nowMs));
  },

  readWorkQueueSummary(nowMs: number = Date.now()): WorkQueueSummary {
    const rows = readOpenRows().map(toListRow);
    const cutoff = claimStaleCutoffIso(nowMs);
    const staleDays = readIntConfig('admin_queue_stale_escalation_days', 3);
    const kinds: WorkQueueKindSummary[] = WORK_QUEUE_KINDS.map((k) => {
      const ofKind = rows.filter((r) => r.kind === k.kind);
      // The list is oldest first, so the first row of a kind is its oldest.
      const oldestDays = ofKind.length > 0 ? daysWaiting(ofKind[0]!.openedAtIso, nowMs) : null;
      const unclaimedStale = ofKind.filter(
        (r) => r.openedAtIso < cutoff && isUnclaimed(r, cutoff),
      ).length;
      const byArea = new Map<WorkQueueTopic | 'shared', number>();
      for (const r of ofKind) {
        const area = workQueueDescriptorFor(r.taskType)?.routeTopic ?? 'shared';
        byArea.set(area, (byArea.get(area) ?? 0) + 1);
      }
      // Areas in registry order, then the shared items, only where something is open.
      const areaOrder: Array<WorkQueueTopic | 'shared'> = [...WORK_QUEUE_TOPIC_KEYS, 'shared'];
      const perArea = areaOrder
        .filter((a) => (byArea.get(a) ?? 0) > 0)
        .map((a) => ({
          key: a,
          label: a === 'shared' ? 'Shared' : WORK_QUEUE_TOPICS[a].label,
          open: byArea.get(a)!,
          href: listHref({ kind: k.kind, topic: a, unclaimed: false, page: 1 }),
        }));
      return {
        kind: k.kind,
        label: k.label,
        what: k.what,
        why: k.why,
        open: ofKind.length,
        oldestDays,
        unclaimedStale,
        staleDays,
        countLine: countLine(ofKind.length, oldestDays, unclaimedStale, staleDays),
        perArea,
        // Each card leads to its own kind rather than to the queue root.
        href: listHref({ kind: k.kind, topic: null, unclaimed: false, page: 1 }),
      };
    });
    return { kinds, totalOpen: rows.length };
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
   * The queue list: one kind at a time, oldest first, 25 to a page, optionally
   * narrowed to an area, the viewer's own areas, the shared items, or the items
   * nobody holds a live claim on. With no kind asked for, it shows the first
   * kind in the registry's order that has anything open under the narrowing in
   * force, so the most pressing work is what an administrator lands on.
   */
  getAdminWorkQueuePage(
    opts: { adminMemberId: string; nowMs?: number } & WorkQueueListQuery & WorkQueueOutcomeOptions,
  ): PageViewModel<WorkQueueListContent> {
    // A contended database renders the standard temporarily-unavailable page
    // rather than falling to the generic handler, which shows the same page
    // under a 500.
    return runSqliteRead('admin work queue page', () => this.readAdminWorkQueuePage(opts));
  },

  readAdminWorkQueuePage(
    opts: { adminMemberId: string; nowMs?: number } & WorkQueueListQuery & WorkQueueOutcomeOptions,
  ): PageViewModel<WorkQueueListContent> {
    const nowMs = opts.nowMs ?? Date.now();
    const asked = parseListState(opts);
    const owners = readAreaOwners();
    const cutoff = claimStaleCutoffIso(nowMs);
    const narrowed = readOpenRows().map(toListRow).filter((r) =>
      inArea(r.taskType, asked.topic, owners, opts.adminMemberId)
      && (!asked.unclaimed || isUnclaimed(r, cutoff)));

    const kind: WorkQueueKind = asked.kind
      ?? WORK_QUEUE_KINDS.find((k) => narrowed.some((r) => r.kind === k.kind))?.kind
      ?? WORK_QUEUE_KINDS[0]!.kind;
    const ofKind = narrowed.filter((r) => r.kind === kind);

    // A close can empty the last page while an administrator is on it, so a
    // page past the end shows the last page rather than an empty one or a
    // not-found answer to a link this list itself handed out.
    const totalPages = Math.max(1, Math.ceil(ofKind.length / LIST_PAGE_SIZE));
    const page = Math.min(asked.page, totalPages);
    const state: ListState = { kind, topic: asked.topic, unclaimed: asked.unclaimed, page };
    const onPage = ofKind.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);

    const rows: WorkQueueRowViewModel[] = onPage.map((r) => {
      const live = claimIsLive(r.claimedAt, cutoff);
      return {
        id: r.id,
        taskTypeLabel: workQueueDescriptorFor(r.taskType)?.label ?? r.taskType,
        areaLabel: areaLabelFor(r.taskType),
        waitingLabel: `waiting ${dayCount(daysWaiting(r.openedAtIso, nowMs))}`,
        claimLabel: !live
          ? 'Unclaimed'
          : r.claimedByMemberId === opts.adminMemberId
            ? 'Claimed by you'
            : `Claimed by ${r.claimedByName ?? 'another administrator'}`,
        canClaim: !live,
        claimAction: `/admin/work-queue/${encodeURIComponent(r.id)}/claim`,
        openHref: itemHref(r.id, state),
      };
    });

    // Changing kind or area starts again at the first page; each link keeps the
    // rest of the narrowing so one choice never silently drops another.
    const kindLinks = WORK_QUEUE_KINDS.map((k) => ({
      label: k.label,
      href: listHref({ ...state, kind: k.kind, page: 1 }),
      isActive: k.kind === kind,
    }));
    const areaLinks = [
      { label: 'All', value: null as AreaFilter | null },
      { label: 'Your Areas', value: 'mine' as AreaFilter },
      ...areasWithTaskTypes().map((t) => ({ label: WORK_QUEUE_TOPICS[t].label, value: t as AreaFilter })),
      { label: 'Shared', value: 'shared' as AreaFilter },
    ].map((f) => ({
      label: f.label,
      // All leads back to everything in this kind, the unclaimed filter included.
      href: listHref(f.value === null
        ? { kind, topic: null, unclaimed: false, page: 1 }
        : { ...state, topic: f.value, page: 1 }),
      isActive: f.value === null ? asked.topic === null && !asked.unclaimed : f.value === asked.topic,
    }));
    const unclaimedLink = {
      label: 'Unclaimed Only',
      href: listHref({ ...state, unclaimed: !asked.unclaimed, page: 1 }),
      isActive: asked.unclaimed,
    };

    const descriptor = workQueueKindDescriptor(kind);
    const staleDays = readIntConfig('admin_queue_stale_escalation_days', 3);
    const oldestDays = ofKind.length > 0 ? daysWaiting(ofKind[0]!.openedAtIso, nowMs) : null;
    const unclaimedStale = ofKind.filter((r) => r.openedAtIso < cutoff && isUnclaimed(r, cutoff)).length;
    const title = 'Admin Work Queue';
    return {
      seo: { title, noindex: true, canonicalPath: listHref(state) },
      page: {
        sectionKey: 'admin', pageKey: 'admin_work_queue', title,
        instructions: {
          what: 'Open work for administrators, one kind at a time, oldest first.',
          why: 'A shared, current picture of what needs a person.',
          how: 'Pick a kind, narrow it to an area or to unclaimed items if you like, then open an item to see what it is, why it matters and what to do. Claim an item to show you are handling it.',
          headsUp: [
            'A claim tells other administrators you are on it. It does not lock the item, and it lapses.',
          ],
        },
      },
      content: {
        ...shapeOutcomes(opts),
        kindLabel: descriptor.label,
        kindWhat: descriptor.what,
        kindWhy: descriptor.why,
        countLine: countLine(ofKind.length, oldestDays, unclaimedStale, staleDays),
        kindLinks,
        areaLinks,
        unclaimedLink,
        rows,
        isEmpty: rows.length === 0,
        pagination: shapePagination({
          page, totalPages, pageSize: LIST_PAGE_SIZE, total: ofKind.length,
          href: (p) => listHref({ ...state, page: p }),
        }),
        state: formStateOf(state),
        parkedHref: PARKED_PATH,
        areasHref: AREAS_PATH,
      },
    };
  },

  /**
   * One open item's page, parked or not: what the task is, why it matters and
   * what to do, who or what it concerns, the evidence, who is holding it, then
   * the actions. Null for an unknown or closed id, which the controller answers
   * with not-found. `ask` opens the question composer already drafted;
   * `linkPick` is the link-help approve form posted back by one of its pickers.
   */
  getWorkQueueItemPage(
    queueItemId: string,
    adminMemberId: string,
    opts: { state?: WorkQueueListQuery; ask?: boolean; nowMs?: number; linkPick?: LinkTargetPickForm } & WorkQueueOutcomeOptions = {},
  ): PageViewModel<WorkQueueItemContent> | null {
    return runSqliteRead('admin work queue item page', () => this.readWorkQueueItemPage(queueItemId, adminMemberId, opts));
  },

  readWorkQueueItemPage(
    queueItemId: string,
    adminMemberId: string,
    opts: { state?: WorkQueueListQuery; ask?: boolean; nowMs?: number; linkPick?: LinkTargetPickForm } & WorkQueueOutcomeOptions = {},
  ): PageViewModel<WorkQueueItemContent> | null {
    const found = workQueue.findOpenForAdminById.get(queueItemId) as
      | (OpenItemRow & { parked_at: string | null; park_reason: string | null; parked_by_name: string | null })
      | undefined;
    if (!found) return null;
    const nowMs = opts.nowMs ?? Date.now();
    const state = parseListState(opts.state ?? {});
    const owners = readAreaOwners();
    const raw = toAdminRow(found);
    const item = shapeWorkQueueItem(raw, adminMemberId, opts.ask ?? false, owners, opts.linkPick);
    const descriptor = workQueueDescriptorFor(raw.taskType);
    const isParked = found.parked_at !== null;
    const heldBy = isParked
      ? 'Nobody while it is parked'
      : item.isClaimed
        ? (item.claimedByMe ? 'You' : item.claimedByName ?? 'Another administrator')
        : item.lapsedClaimByName
          ? `Nobody. ${item.lapsedClaimByName} claimed it earlier and has not closed it.`
          : 'Nobody';
    const title = toTitleCase(item.taskTypeLabel);
    return {
      seo: { title, noindex: true, canonicalPath: `${LIST_PATH}/${encodeURIComponent(queueItemId)}` },
      page: {
        sectionKey: 'admin', pageKey: 'admin_work_queue_item', title,
        instructions: {
          what: 'One open work-queue item: what it is, the evidence, and what you can do about it.',
          why: 'Every item reads the same way, so an administrator who learns one can work them all.',
          how: 'Read the brief and the evidence, claim the item if you are taking it on, then use one of the actions at the end. Park it if you cannot move it forward yet.',
          headsUp: [
            'A claim tells other administrators you are on it. It does not lock the item, and it lapses.',
            'Resolving a member\'s contact request or link-help request emails them your answer.',
            'Approving a held announcement publishes it to the places the member chose, sending it to the whole announcements list at once when the list is one of them, and emails the member; sending one back emails them your note.',
            'Upholding an identity dispute takes the record away from the member who holds it, after a confirm page.',
            'You cannot decide a request about your own record or role.',
            'Asking a member a question emails them a short note to read it on the site. Their answer brings a parked item back.',
          ],
        },
      },
      navigation: { contextLinks: [{ label: 'Back to Admin Work Queue', href: listHref(state) }] },
      content: {
        ...shapeOutcomes(opts),
        item,
        brief: descriptor?.brief ?? null,
        facts: [
          { label: 'Kind', value: workQueueKindDescriptor(raw.kind).label },
          { label: 'Area', value: item.isViewerArea ? `${item.areaLine} (your area)` : item.areaLine },
          { label: 'Waiting', value: `${dayCount(daysWaiting(raw.openedAtIso, nowMs))}, since ${item.openedAtDisplay}` },
        ],
        heldBy,
        parked: isParked
          ? {
            parkedAtDisplay: found.parked_at!.slice(0, 10),
            parkedByName: found.parked_by_name,
            parkReason: found.park_reason,
            returnAction: `/admin/work-queue/${encodeURIComponent(queueItemId)}/unpark`,
          }
          : null,
        answerKindOptions: ANSWER_KIND_OPTIONS,
        state: formStateOf(state),
      },
    };
  },

  /**
   * The items an administrator has set aside, on a page of their own, newest
   * park first. Not narrowed by kind or area: it is a short list, and hiding
   * part of it would let a parked item disappear from every view.
   */
  getParkedWorkQueuePage(
    adminMemberId: string,
    opts: WorkQueueOutcomeOptions = {},
  ): PageViewModel<WorkQueueParkedContent> {
    return runSqliteRead('admin work queue parked page', () => {
      const parked = this.listParkedForAdmin(adminMemberId);
      const title = 'Parked Work-queue Items';
      return {
        seo: { title, noindex: true },
        page: {
          sectionKey: 'admin', pageKey: 'admin_work_queue_parked', title,
          instructions: {
            what: 'Work-queue items an administrator set aside, newest first.',
            why: 'A parked item waits on something outside the queue, so it is kept apart from the work without being lost.',
            how: 'Each comes back on its own when the member answers a question on it. Return one to the queue sooner if it can move.',
          },
        },
        navigation: { contextLinks: [{ label: 'Back to Admin Work Queue', href: LIST_PATH }] },
        content: { ...shapeOutcomes(opts), parked, hasParked: parked.length > 0 },
      };
    });
  },

  /** The Area Owners form, every area included, each owner a current administrator or none. */
  getWorkQueueAreasPage(opts: {
    outcome?: OutcomeNoticeView | null;
    errorMessage?: string;
  } = {}): PageViewModel<WorkQueueAreasContent> {
    return runSqliteRead('admin work queue areas page', () => {
      const owners = readAreaOwners();
      const admins = account.listAdminsForDisplay.all() as Array<{ id: string; display_name: string }>;
      const areaOwnerFields = WORK_QUEUE_TOPIC_KEYS.map((topic) => {
        const ownerId = owners.get(topic)?.memberId ?? null;
        return {
          topic,
          label: WORK_QUEUE_TOPICS[topic].label,
          fieldName: `owner_${topic}`,
          options: [
            { value: '', label: 'No owner', selected: ownerId === null },
            ...admins.map((a) => ({ value: a.id, label: a.display_name, selected: a.id === ownerId })),
          ],
        };
      });
      const title = 'Work-queue Area Owners';
      return {
        seo: { title, noindex: true },
        page: {
          sectionKey: 'admin', pageKey: 'admin_work_queue_areas', title,
          instructions: {
            what: 'Names the one administrator accountable for each work-queue area.',
            why: 'Each item names its area\'s owner, so the team knows who usually takes it.',
            how: 'Choose an owner for each area, or No owner, and save. Every administrator can still claim and settle any item, so cover for an owner who is away.',
            headsUp: ['Changing an area\'s owner is recorded in the audit log.'],
          },
        },
        navigation: { contextLinks: [{ label: 'Back to Admin Work Queue', href: LIST_PATH }] },
        content: {
          areaOwnerFields,
          outcome: opts.outcome ?? null,
          errorMessage: opts.errorMessage ?? null,
        },
      };
    });
  },

  /** Where a closing action returns: the list, in the state the form carried. */
  listReturnPath(raw: WorkQueueListQuery): string {
    return listHref(parseListState(raw));
  },

  /**
   * Where a non-closing action returns: the page it was taken on. The item's own
   * page and the parked page are named by fixed values, never by a submitted
   * path, so the redirect cannot be pointed anywhere else.
   */
  originReturnPath(raw: WorkQueueListQuery & { from?: string | null }, queueItemId: string): string {
    if (raw.from === 'item') return itemHref(queueItemId, parseListState(raw));
    if (raw.from === 'parked') return PARKED_PATH;
    return listHref(parseListState(raw));
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
   * else is reported not-found, the same answer as an unknown id. A repeat of
   * this administrator's own park, which the item still carries, writes nothing
   * and reports the park again.
   */
  park(input: { queueItemId: string; adminMemberId: string; note: string }): void {
    const reason = cleanUserText(input.note ?? '', 'multi_line', 'note');
    if (reason.length === 0) {
      throw new ValidationError('A reason is required to park an item.');
    }
    if (reason.length > MAX_RESOLUTION_NOTE) {
      throw new ValidationError(`Reason must be ${MAX_RESOLUTION_NOTE} characters or fewer.`);
    }
    const row = workQueue.findById.get(input.queueItemId) as
      | {
          status: string; task_type: string; parked_at: string | null;
          parked_by_member_id: string | null; park_reason: string | null;
        }
      | undefined;
    // This actor's own park, under the same reason, is what the item carries:
    // their repeat reports the park and spends no rate-limit slot.
    if (row && row.status === 'open' && row.parked_at !== null
      && row.parked_by_member_id === input.adminMemberId && row.park_reason === reason) {
      return;
    }
    enforceWorkQueueResolveLimit(input.adminMemberId);
    const parkable = row && row.status === 'open'
      && workQueueActionFor(row.task_type, 'park')?.kind === 'park';
    if (!parkable) {
      throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
    }
    const nowIso = new Date().toISOString();
    transaction(() => {
      const result = workQueue.parkItem.run(
        nowIso, input.adminMemberId, reason, nowIso, input.adminMemberId, input.queueItemId,
      );
      if (result.changes === 0) {
        // Already parked, or closed between the read and the write.
        throw new NotFoundError(`Open work-queue item not found: ${input.queueItemId}`);
      }
      // The item row keeps only its current park, so the audit row is the one
      // lasting record of who set work aside, when and why.
      appendAuditEntry({
        actionType:    'work_queue.parked',
        actorType:     'admin',
        actorMemberId: input.adminMemberId,
        entityType:    'work_queue_item',
        entityId:      input.queueItemId,
        reasonText:    reason,
        metadata:      { task_type: row!.task_type },
      });
    });
  },

  /**
   * Return a parked item to the working queue. Any administrator may do it, not
   * only the one who parked it: the park is a note about the item, not a hold on
   * it, and the team can always take the work back.
   */
  unpark(input: { queueItemId: string; adminMemberId: string }): void {
    const nowIso = new Date().toISOString();
    transaction(() => {
      const result = workQueue.unparkItem.run(nowIso, input.adminMemberId, input.queueItemId);
      if (result.changes === 0) {
        throw new NotFoundError(`Parked work-queue item not found: ${input.queueItemId}`);
      }
      appendAuditEntry({
        actionType:    'work_queue.unparked',
        actorType:     'admin',
        actorMemberId: input.adminMemberId,
        entityType:    'work_queue_item',
        entityId:      input.queueItemId,
      });
    });
  },

  /**
   * Record each area's accountable owner from the Area Owners form. Any
   * administrator may change any area's owner: ownership orients the queue and
   * never restricts who may act, so it carries no self-action bar. Each choice
   * must be a current administrator or no owner; anything else refuses the whole
   * save. Every changed area appends one audit row with the owner before and
   * after, in one transaction with the owner rows. A submission that changes
   * nothing writes nothing and says so. An area the form left out is left as it
   * is.
   */
  saveTopicOwners(input: {
    adminMemberId: string;
    owners: Partial<Record<WorkQueueTopic, string>>;
  }): { status: 'saved'; changed: number } | { status: 'unchanged' } {
    const adminIds = new Set(
      (account.listAdminsForDisplay.all() as Array<{ id: string }>).map((a) => a.id),
    );
    const stored = new Map(
      (workQueueTopicOwners.listAll.all() as Array<{ topic: string; owner_member_id: string | null }>)
        .map((r) => [r.topic, r.owner_member_id] as const),
    );
    const changes: Array<{ topic: WorkQueueTopic; before: string | null; after: string | null; hasRow: boolean }> = [];
    for (const topic of WORK_QUEUE_TOPIC_KEYS) {
      const submitted = input.owners[topic];
      if (submitted === undefined) continue;
      const after = submitted === '' ? null : submitted;
      if (after !== null && !adminIds.has(after)) {
        throw new ValidationError(
          `${WORK_QUEUE_TOPICS[topic].label}: choose a current administrator, or No owner.`,
        );
      }
      const before = stored.get(topic) ?? null;
      if (before !== after) changes.push({ topic, before, after, hasRow: stored.has(topic) });
    }
    if (changes.length === 0) return { status: 'unchanged' };

    const nowIso = new Date().toISOString();
    transaction(() => {
      for (const c of changes) {
        if (c.hasRow) {
          workQueueTopicOwners.updateOwner.run(c.after, nowIso, input.adminMemberId, c.topic);
        } else {
          workQueueTopicOwners.insert.run(
            `wqto_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
            nowIso, input.adminMemberId, nowIso, input.adminMemberId, c.topic, c.after,
          );
        }
        appendAuditEntry({
          actionType:    'work_queue.topic_owner_changed',
          actorType:     'admin',
          actorMemberId: input.adminMemberId,
          entityType:    'work_queue_topic',
          entityId:      c.topic,
          metadata:      { before: c.before, after: c.after },
        });
      }
    });
    return { status: 'saved', changed: changes.length };
  },

  /**
   * The areas the given administrator owns, each with its open working items
   * and how many of them have waited past the stale threshold with nobody
   * holding a live claim. Empty for an administrator who owns no area. Parked
   * items are not counted: they are waiting on something outside the queue.
   */
  getOwnedAreaSummary(adminMemberId: string): Array<{
    topic: WorkQueueTopic;
    label: string;
    open: number;
    unclaimedStale: number;
    staleDays: number;
  }> {
    const owners = readAreaOwners();
    const owned = WORK_QUEUE_TOPIC_KEYS.filter((t) => owners.get(t)?.memberId === adminMemberId);
    if (owned.length === 0) return [];
    const rows = this.listOpenForAdmin();
    const cutoff = claimStaleCutoffIso();
    const staleDays = readIntConfig('admin_queue_stale_escalation_days', 3);
    return owned.map((topic) => {
      const inArea = rows.filter((r) => workQueueDescriptorFor(r.taskType)?.routeTopic === topic);
      return {
        topic,
        label: WORK_QUEUE_TOPICS[topic].label,
        open: inArea.length,
        unclaimedStale: inArea.filter(
          (r) => r.openedAtIso < cutoff && !claimIsLive(r.claimedAt, cutoff),
        ).length,
        staleDays,
      };
    });
  },

  dismiss(input: { queueItemId: string; adminMemberId: string; note: string }): void {
    enforceWorkQueueResolveLimit(input.adminMemberId);
    const note = cleanUserText(input.note ?? '', 'multi_line', 'note');
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
