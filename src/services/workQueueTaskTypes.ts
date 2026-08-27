/**
 * WorkQueueTaskTypes -- the single declaration of what each admin work-queue
 * task type is and what an administrator can do about it.
 *
 * Owns: the task-type table. Each type declares its display label, the queue
 * category it belongs to, the entity types a row of that type may legitimately
 * point at, whether it fans an urgent notification out on enqueue, how its
 * evidence renders, and its ordered list of actions.
 *
 * Why it exists. The queue used to model each type as membership of one of five
 * hardcoded families: a predicate deciding the family, a matching boolean on the
 * view item, and a branch in the template. A type had to be added to all three or
 * its card rendered with no control at all and could never be closed. Declaring
 * the type once removes the two places a type could be forgotten, and the enqueue
 * assertion in WorkQueueService turns a missing declaration into a refusal to
 * create the row rather than a card nobody can act on.
 *
 * Does not own: the writes. An action names the audit row the queue services
 * write themselves (a decision or a dismissal); an action whose work belongs to
 * another service (applying an identity link, resolving a reconciliation issue)
 * names no audit row here, because that service writes its own and a second
 * declaration of it would be one that nothing reads.
 *
 * Persistence: none. This module holds no state and touches no table; it is the
 * vocabulary the queue services and the queue page read.
 *
 * Service shape: constant table plus lookup helpers, no singleton object.
 */

/**
 * The decisions an administrator records when closing a member contact request.
 * The queue answers the member by email, so each value is wording they read.
 */
export const CONTACT_DECISIONS = [
  { value: 'corrected',    label: 'Corrected' },
  { value: 'denied',       label: 'Denied' },
  { value: 'duplicate',    label: 'Duplicate' },
  { value: 'out_of_scope', label: 'Out of scope' },
] as const;

/**
 * The decisions an administrator records when closing a system-raised payments
 * task. Every one ends the same three ways: the administrator fixed it on the
 * Stripe side (a dispute worked, a payout's bank details repaired, a stray refund
 * located), the event needed no action (an expected pause, a test charge), or a
 * platform-side follow-up was completed. A payments decision never reaches a
 * member, so these are an administrator's own words about a provider record.
 */
export const PAYMENT_DECISIONS = [
  { value: 'handled_in_stripe',  label: 'Handled in Stripe' },
  { value: 'no_action_needed',   label: 'No action needed' },
  { value: 'follow_up_complete', label: 'Follow-up complete' },
] as const;

export interface WorkQueueDecisionOption {
  value: string;
  label: string;
}

/** A free-text note an action carries. */
export interface WorkQueueNoteField {
  /** The form field the handler reads it from. */
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  maxLength: number;
}

/** An extra input an action needs beyond its note, such as a record id. */
export interface WorkQueueActionField {
  name: string;
  label: string;
  input: 'text' | 'textarea';
  maxLength: number;
  required: boolean;
}

/**
 * How the card renders what the administrator decides on.
 *
 * The entity a row points at is not listed here: the card skeleton always names
 * its subject, either as the member's own link or as the labelled provider
 * record, whatever the type.
 */
export type WorkQueueEvidence =
  /** The row's own reason and detail text, shown as the platform wrote it. */
  | { kind: 'reason_text' }
  /** The member's own words, shown as theirs. */
  | { kind: 'member_message' }
  /** A payload the queue service builds for this type; the row's reason text
   *  holds JSON or a bare code and is never printed raw. */
  | { kind: 'structured'; payload: 'link_help' | 'auto_link' };

/**
 * What an administrator can do with an item.
 *
 * `decide` records a choice from this action's own vocabulary plus a note.
 * `act` does domain work through the service that owns it, taking extra fields.
 * `close` ends an internal review that has no member reply, with a note only.
 * `elsewhere` links to the surface that owns the resolution.
 * `park` sets the item aside with no deadline until there is something new.
 */
export type WorkQueueAction =
  | {
      kind: 'decide';
      /** Path suffix under `/admin/work-queue/:id/`, and the action's stable id. */
      key: string;
      label: string;
      style: 'primary' | 'outline';
      decisions: readonly WorkQueueDecisionOption[];
      note: WorkQueueNoteField;
      auditActionType: string;
      auditCategory: string;
      /** True where the decision is answered to the member by email. */
      notifiesSubject: boolean;
    }
  | {
      kind: 'act';
      key: string;
      label: string;
      style: 'primary' | 'outline';
      fields: readonly WorkQueueActionField[];
      hint?: string;
      /** Offered only on a link-help item filed as a conflict dispute; the
       *  revert has nothing to act on otherwise. */
      disputeOnly?: boolean;
    }
  | {
      kind: 'close';
      key: string;
      label: string;
      style: 'primary' | 'outline';
      note: WorkQueueNoteField;
      auditActionType: string;
      auditCategory: string;
      /** The fixed ledger wording for this dismissal. The ledger is append-only,
       *  so each type names its own event and reason: a shared one would file one
       *  type's review under another's and the wrong entry could never be
       *  corrected. */
      auditReasonText: string;
      /** What dismissing does and does not undo, worded per type because two
       *  reviews can say opposite things about an applied link. */
      hint: string;
    }
  | {
      kind: 'elsewhere';
      label: string;
      href: string;
    }
  | {
      kind: 'park';
      key: string;
      label: string;
      style: 'primary' | 'outline';
      note: WorkQueueNoteField;
      hint: string;
    };

/**
 * Templates an urgent task type fans out to the admin-alerts list on enqueue.
 * Every one takes the entity id and the queue link and nothing else, because an
 * admin notification carries task type and entity id only: no name, no amount,
 * no member data. A new urgent template joins this union rather than widening
 * what a notification may say.
 */
export type UrgentAdminAlertTemplate = 'admin_loss_recruitment';

export interface WorkQueueTaskTypeDescriptor {
  label: string;
  queueCategory: string;
  /** The entity types a row of this type may point at. A row outside the set is
   *  corrupt and is refused rather than acted on. */
  entityTypes: readonly string[];
  /** Urgent: emails every administrator the moment the item is raised, because
   *  the matter needs same-day action. Null is routine: read on the queue page
   *  and rolled up in the periodic digest. */
  urgentAdminAlert: UrgentAdminAlertTemplate | null;
  evidence: WorkQueueEvidence;
  actions: readonly WorkQueueAction[];
}

const RESOLUTION_NOTE_MAX = 500;

const MEMBER_ANSWER_NOTE: WorkQueueNoteField = {
  name:        'resolution_note',
  label:       'Resolution note',
  placeholder: 'Sent to the member by email',
  required:    true,
  maxLength:   RESOLUTION_NOTE_MAX,
};

const INTERNAL_NOTE: WorkQueueNoteField = {
  name:        'resolution_note',
  label:       'Resolution note',
  placeholder: 'Internal note; kept on the queue record',
  required:    true,
  maxLength:   RESOLUTION_NOTE_MAX,
};

const REVIEW_NOTE: WorkQueueNoteField = {
  name:        'note',
  label:       'Review note (optional)',
  placeholder: 'Internal note; not sent to the member',
  required:    false,
  maxLength:   RESOLUTION_NOTE_MAX,
};

/**
 * The eight system-raised payments tasks are one shape: an administrator reads
 * the provider record the row names, settles it wherever it actually lives, and
 * records which of the three outcomes it was. Written once so the eight entries
 * differ only in what they are and what they point at.
 */
function paymentsTask(label: string, entityTypes: readonly string[]): WorkQueueTaskTypeDescriptor {
  return {
    label,
    queueCategory: 'payments',
    entityTypes,
    urgentAdminAlert: null,
    evidence: { kind: 'reason_text' },
    actions: [{
      kind:            'decide',
      key:             'resolve',
      label:           'Resolve',
      style:           'primary',
      decisions:       PAYMENT_DECISIONS,
      note:            INTERNAL_NOTE,
      auditActionType: 'payment.queue_item_resolved',
      auditCategory:   'payment',
      // No email: the row points at a provider-side record, and any
      // member-facing message went out when the underlying event was recorded.
      notifiesSubject: false,
    }],
  };
}

export const WORK_QUEUE_TASK_TYPES: Readonly<Record<string, WorkQueueTaskTypeDescriptor>> = {
  member_contact_request: {
    label:            'Member contact request',
    queueCategory:    'membership',
    entityTypes:      ['member'],
    urgentAdminAlert: null,
    evidence:         { kind: 'member_message' },
    actions: [{
      kind:            'decide',
      key:             'resolve',
      label:           'Resolve',
      style:           'primary',
      decisions:       CONTACT_DECISIONS,
      note:            MEMBER_ANSWER_NOTE,
      auditActionType: 'support.contact_request_resolved',
      auditCategory:   'support',
      notifiesSubject: true,
    }],
  },

  member_link_help_request: {
    label:            'Member link help request',
    queueCategory:    'membership',
    entityTypes:      ['member'],
    urgentAdminAlert: null,
    evidence:         { kind: 'structured', payload: 'link_help' },
    actions: [
      {
        kind:  'act',
        key:   'link-help/approve',
        label: 'Approve and Link',
        style: 'primary',
        hint:  'Enter exactly one target: the legacy account id, or the historical person id for a competition-record link.',
        fields: [
          { name: 'target_legacy_member_id',     label: 'Legacy account id to link',    input: 'text', maxLength: 200, required: false },
          { name: 'target_historical_person_id', label: 'Historical person id to link', input: 'text', maxLength: 200, required: false },
        ],
      },
      {
        kind:  'act',
        key:   'link-help/reject',
        label: 'Reject',
        style: 'outline',
        fields: [
          { name: 'reason', label: 'Rejection reason', input: 'textarea', maxLength: 500, required: true },
        ],
      },
      {
        kind:        'act',
        key:         'link-help/dispute-revert',
        label:       "Uphold Dispute: Revert Holder's Claim",
        style:       'outline',
        disputeOnly: true,
        hint:        'Enter exactly one disputed record. The claim reverted is whoever currently holds it.',
        fields: [
          { name: 'target_legacy_member_id',     label: 'Disputed legacy account id',     input: 'text',     maxLength: 200, required: false },
          { name: 'target_historical_person_id', label: 'Disputed historical person id',  input: 'text',     maxLength: 200, required: false },
          { name: 'reason',                      label: 'Dispute reason',                 input: 'textarea', maxLength: 500, required: true },
        ],
      },
      {
        kind:  'park',
        key:   'park',
        label: 'Park for Further Investigation',
        style: 'outline',
        note:  {
          name:        'note',
          label:       'Why this is being set aside',
          placeholder: 'What you are waiting on',
          required:    true,
          maxLength:   RESOLUTION_NOTE_MAX,
        },
        hint: 'The item leaves the working queue, the digest and the escalation sweep, and comes back on its own when the member answers a question on it.',
      },
    ],
  },

  auto_link_match: {
    label:            'Auto-link match',
    queueCategory:    'membership',
    entityTypes:      ['member'],
    urgentAdminAlert: null,
    evidence:         { kind: 'structured', payload: 'auto_link' },
    actions: [{
      kind:            'close',
      key:             'dismiss',
      label:           'Mark Reviewed',
      style:           'outline',
      note:            REVIEW_NOTE,
      auditActionType: 'legacy.auto_link_match_reviewed',
      auditCategory:   'identity',
      auditReasonText: 'Low-confidence auto-link match reviewed; no link applied.',
      // The old wording sent an administrator to a path they cannot start: a
      // link-help request is raised by the member, and no administrator action
      // creates one. Saying so, and naming the control that does reach them,
      // is the difference between a hint and a dead end.
      hint:            'No link was applied, so there is nothing to undo. A link is applied through a member link-help request, which the member raises from the contact form; use Ask the member above if you need to prompt them.',
    }],
  },

  admin_loss_recruitment: {
    label:            'Administrator lost; recruit a replacement',
    queueCategory:    'system',
    entityTypes:      ['member'],
    // The people who must act on losing an administrator are exactly the
    // shrinking set the loss is about, and a digest entry days later is too late.
    urgentAdminAlert: 'admin_loss_recruitment',
    evidence:         { kind: 'reason_text' },
    actions: [{
      kind:            'close',
      key:             'dismiss',
      label:           'Mark Reviewed',
      style:           'outline',
      note:            REVIEW_NOTE,
      auditActionType: 'admin.loss_alert_dismissed',
      auditCategory:   'admin',
      auditReasonText: 'Administrator-loss recruitment alert reviewed and closed.',
      hint:            'Dismiss this once a replacement admin volunteer is recruited, or once the team agrees the current admin roster is sufficient. Granting the role to the replacement is done on the admin roles page.',
    }],
  },

  reconciliation_discrepancy: {
    label:            'Payment reconciliation discrepancy',
    queueCategory:    'payments',
    entityTypes:      ['reconciliation_issue'],
    urgentAdminAlert: null,
    evidence:         { kind: 'reason_text' },
    // The twin of a reconciliation issue, closed when the issue itself is
    // resolved on the page that owns it.
    actions: [{
      kind:  'elsewhere',
      label: 'Review on the Reconciliation Page',
      href:  '/admin/payments/reconciliation',
    }],
  },

  membership_overcharge_review:       paymentsTask('Membership paid for but not granted', ['payment']),
  unattributed_refund:                paymentsTask('Refund with no matching payment record', ['stripe_payment_intent', 'stripe_charge']),
  partial_refund_review:              paymentsTask('Partially refunded payment', ['payment']),
  refund_failed_review:               paymentsTask('Refund that could not be returned to the card', ['stripe_refund']),
  charge_dispute_review:              paymentsTask('Card dispute raised against a payment', ['stripe_dispute']),
  payout_failed:                      paymentsTask('Payout to the bank account failed', ['stripe_payout']),
  recurring_donation_charge_declined: paymentsTask('Recurring donation renewal charge declined', ['recurring_donation_subscription']),
  recurring_donation_paused:          paymentsTask('Recurring donation paused at Stripe', ['recurring_donation_subscription']),
};

/** The descriptor for a task type, or null for one that has none. */
export function workQueueDescriptorFor(taskType: string): WorkQueueTaskTypeDescriptor | null {
  return WORK_QUEUE_TASK_TYPES[taskType] ?? null;
}

/**
 * The descriptor for a task type the caller knows exists. Throws the internal
 * invariant error rather than a service error: reaching here without a
 * descriptor means a row was written that enqueue should have refused.
 */
export function requireWorkQueueDescriptor(taskType: string): WorkQueueTaskTypeDescriptor {
  const descriptor = workQueueDescriptorFor(taskType);
  if (!descriptor) {
    throw new Error(`No work-queue descriptor for task type: ${taskType}`);
  }
  return descriptor;
}

/** One declared action of an item, by its key. Null where the type has no such action. */
export function workQueueActionFor(taskType: string, actionKey: string): WorkQueueAction | null {
  const descriptor = workQueueDescriptorFor(taskType);
  if (!descriptor) return null;
  for (const action of descriptor.actions) {
    if (action.kind !== 'elsewhere' && action.key === actionKey) return action;
  }
  return null;
}
