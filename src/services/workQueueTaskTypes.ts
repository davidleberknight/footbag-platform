/**
 * WorkQueueTaskTypes -- the single declaration of what each admin work-queue
 * task type is and what an administrator can do about it.
 *
 * Owns: the task-type table. Each type declares its display label, its kind
 * (Team Alert, Someone Is Waiting or Housekeeping), the alert a Team Alert
 * emails on enqueue, one plain sentence each on what it is, why it matters and
 * what to do about it, the entity types a row of that type may legitimately
 * point at, the area (routing topic) it belongs to or none for a shared matter,
 * how its evidence renders, and its ordered list of actions. Also owns the kind
 * registry (each kind's label and its own what and why, in the order the queue
 * shows them) and the area registry: each area's label and fixed queue address.
 * A new area is one registry entry plus its canonical address; a new task type
 * picks its kind and its area with one field each.
 *
 * Why it exists. Modelling each type as membership of a hardcoded family needs a
 * predicate deciding the family, a matching boolean on the view item, and a
 * branch in the template; a type missing from any of the three renders a card
 * with no control at all that can never be closed. Declaring the type once
 * removes the places a type could be forgotten, and the enqueue
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
  input: 'text' | 'textarea' | 'checkbox';
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
  | { kind: 'structured'; payload: 'link_help' | 'announcement' | 'sanction_request' };

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
      /** True where the decision is answered to the member by email. */
      notifiesSubject: boolean;
      /**
       * True where the item's subject may not be the administrator who settles
       * it. An administrator who can both raise an item and decide it has no
       * check on them at all, which is the same reasoning that keeps an
       * administrator from approving their own legacy-identity help request or
       * revoking their own role. Declared here rather than branched on inside
       * the resolver, so a new task type answers the question rather than
       * inheriting an answer nobody chose.
       */
      selfActionBarred: boolean;
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
      /**
       * The record this action acts on, chosen rather than typed: `link_target`
       * offers a picker over the unclaimed old accounts and one over the
       * historical records, `disputed_record` a choice among the records the
       * dispute named when it was filed.
       */
      targetChoice?: 'link_target' | 'disputed_record';
    }
  | {
      kind: 'close';
      key: string;
      label: string;
      style: 'primary' | 'outline';
      note: WorkQueueNoteField;
      auditActionType: string;
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
 * Templates a Team Alert fans out to the admin-alerts list on enqueue. Every
 * one takes the link to the item and nothing else, because an admin
 * notification carries no name, no amount and no member data. A new Team Alert
 * template joins this union rather than widening what a notification may say.
 */
export type TeamAlertTemplate = 'admin_loss_recruitment';

/**
 * How an item reaches the administrators, declared once per task type. A Team
 * Alert is a security, data-integrity or administrative-continuity event that
 * needs same-day action, so every administrator is emailed the moment it is
 * raised. Someone Is Waiting means a person waits on an administrator's
 * decision. Housekeeping means the platform found something to tidy. The last
 * two are routine: read on the queue, rolled up in the periodic digest, and
 * escalated once if left unclaimed too long.
 */
export type WorkQueueKind = 'team_alert' | 'waiting' | 'housekeeping';

export interface WorkQueueKindDescriptor {
  kind: WorkQueueKind;
  label: string;
  /** One sentence saying what this kind of work is. */
  what: string;
  /** One sentence saying why it matters. */
  why: string;
}

/** Every kind, in the order the queue and the dashboard show them. */
export const WORK_QUEUE_KINDS: readonly WorkQueueKindDescriptor[] = [
  {
    kind:  'team_alert',
    label: 'Team Alert',
    what:  'Something happened that the whole administrator team needs to deal with today.',
    why:   'Every administrator is emailed the moment one is raised, because waiting for the digest would be too late.',
  },
  {
    kind:  'waiting',
    label: 'Someone Is Waiting',
    what:  'A person asked for something and is waiting for an administrator to decide.',
    why:   'Every day an item sits here is another day that person waits for an answer.',
  },
  {
    kind:  'housekeeping',
    label: 'Housekeeping',
    what:  'The platform found something that needs tidying up.',
    why:   'Left alone, these turn into wrong records, missing money or broken pages.',
  },
];

export function isWorkQueueKind(value: string): value is WorkQueueKind {
  return WORK_QUEUE_KINDS.some((k) => k.kind === value);
}

/** The registry entry for one kind. */
export function workQueueKindDescriptor(kind: WorkQueueKind): WorkQueueKindDescriptor {
  const found = WORK_QUEUE_KINDS.find((k) => k.kind === kind);
  if (!found) throw new Error(`No work-queue kind: ${kind}`);
  return found;
}

/** What one task type is, why it matters and what to do, each one short sentence. */
export interface WorkQueueBrief {
  what: string;
  why: string;
  todo: string;
}

/**
 * The areas a task type may belong to. Each has one accountable owner among the
 * administrators, recorded in the database, and a fixed queue address that,
 * while the area's switch is on, receives a daily digest of the area's open,
 * unclaimed routine items. The address is a group held outside the platform, so
 * who reads an area's mail changes without a platform change. An area with no
 * task type yet (freestyle) still has an owner to show and an address waiting
 * for the types that will join it.
 */
export type WorkQueueTopic =
  | 'finance' | 'membership' | 'platform' | 'sanctioning' | 'freestyle' | 'moderation';

export const WORK_QUEUE_TOPICS: Readonly<Record<WorkQueueTopic, { label: string; address: string }>> = {
  finance:     { label: 'Finance',     address: 'queue-finance@footbag.org' },
  membership:  { label: 'Membership',  address: 'queue-membership@footbag.org' },
  platform:    { label: 'Platform',    address: 'queue-platform@footbag.org' },
  sanctioning: { label: 'Sanctioning', address: 'queue-sanctioning@footbag.org' },
  freestyle:   { label: 'Freestyle',   address: 'queue-freestyle@footbag.org' },
  moderation:  { label: 'Moderation',  address: 'queue-moderation@footbag.org' },
};

export const WORK_QUEUE_TOPIC_KEYS = Object.keys(WORK_QUEUE_TOPICS) as WorkQueueTopic[];

export function isWorkQueueTopic(value: string): value is WorkQueueTopic {
  return Object.prototype.hasOwnProperty.call(WORK_QUEUE_TOPICS, value);
}

/** The runtime switch for one area's digest: unset or 0 is off, 1 is on. */
export function topicRouteConfigKey(topic: WorkQueueTopic): string {
  return `work_queue_topic_route_${topic}`;
}

export interface WorkQueueTaskTypeDescriptor {
  label: string;
  kind: WorkQueueKind;
  /** The notification every administrator is emailed the moment the item is
   *  raised. Set exactly when the kind is a Team Alert; null for a routine
   *  kind, which is read on the queue and rolled up in the periodic digest. */
  alertTemplate: TeamAlertTemplate | null;
  /** What the item is, why it matters and what to do, for an administrator
   *  meeting the type for the first time. Carries no member data. */
  brief: WorkQueueBrief;
  /** The entity types a row of this type may point at. A row outside the set is
   *  corrupt and is refused rather than acted on. */
  entityTypes: readonly string[];
  /** The area this type belongs to, or null for a matter every administrator
   *  shares. Ownership orients an item and never restricts who may act on it. */
  routeTopic: WorkQueueTopic | null;
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
const PAYMENTS_TODO =
  'Look the record up in Stripe, put it right there or on the platform, then resolve this item with the outcome and a short note.';

function paymentsTask(
  label: string,
  entityTypes: readonly string[],
  brief: { what: string; why: string },
): WorkQueueTaskTypeDescriptor {
  return {
    label,
    kind: 'housekeeping',
    alertTemplate: null,
    brief: { ...brief, todo: PAYMENTS_TODO },
    entityTypes,
    routeTopic: 'finance',
    evidence: { kind: 'reason_text' },
    actions: [{
      kind:            'decide',
      key:             'resolve',
      label:           'Resolve',
      style:           'primary',
      decisions:       PAYMENT_DECISIONS,
      note:            INTERNAL_NOTE,
      auditActionType: 'payment.queue_item_resolved',
      // No email: the row points at a provider-side record, and any
      // member-facing message went out when the underlying event was recorded.
      notifiesSubject: false,
      // These are raised by the reconciliation and webhook paths against a
      // provider record, never filed by a member about themselves, so there is
      // no self-raised item for an administrator to settle in their own favour.
      selfActionBarred: false,
    }],
  };
}

/**
 * A message a member sent through the contact form, answered by writing back.
 * A report of content breaking the community standards is the same request in
 * every respect but its area, so it is a type of its own only so that it can
 * belong to the moderation area while every other contact topic stays with
 * membership.
 */
function memberRequestTask(
  label: string,
  routeTopic: WorkQueueTopic,
  brief: WorkQueueBrief,
): WorkQueueTaskTypeDescriptor {
  return {
    label,
    kind:          'waiting',
    alertTemplate: null,
    brief,
    entityTypes:   ['member'],
    routeTopic,
    evidence:         { kind: 'member_message' },
    actions: [{
      kind:            'decide',
      key:             'resolve',
      label:           'Resolve',
      style:           'primary',
      decisions:       CONTACT_DECISIONS,
      note:            MEMBER_ANSWER_NOTE,
      auditActionType: 'support.contact_request_resolved',
      notifiesSubject: true,
      // Any member can file one of these about their own record, an
      // administrator included, and the decisions include correcting the record
      // it is about. An administrator who filed it and then settled it would be
      // approving their own change with nobody else in the loop, which is the
      // same hole the legacy-identity help path already closes.
      selfActionBarred: true,
    }],
  };
}

export const WORK_QUEUE_TASK_TYPES: Readonly<Record<string, WorkQueueTaskTypeDescriptor>> = {
  member_contact_request: memberRequestTask('Member contact request', 'membership', {
    what: 'A member wrote to the administrators through the contact form.',
    why:  'The member is waiting for an answer, and their record may be wrong until someone looks.',
    todo: 'Read the message, correct the record if it needs it, then choose a decision and write the reply the member gets by email.',
  }),
  content_report: memberRequestTask('Content report', 'moderation', {
    what: 'A member reported something on the site they believe breaks the community standards.',
    why:  'The member is waiting to hear back, and the content stays as it is until an administrator looks.',
    todo: 'Look at the content they describe and deal with it, then choose a decision and write the reply the member gets by email.',
  }),

  member_link_help_request: {
    label:         'Member link help request',
    kind:          'waiting',
    alertTemplate: null,
    brief: {
      what: 'A member asked for help linking their account to an old footbag.org account or to their competition record.',
      why:  'Until the link is made or refused, the member cannot see that history on their profile.',
      todo: 'Check what they told you against the records shown, then approve by choosing the one record to link, or reject with a reason.',
    },
    entityTypes:   ['member'],
    routeTopic:    'membership',
    evidence:         { kind: 'structured', payload: 'link_help' },
    actions: [
      {
        kind:  'act',
        key:   'link-help/approve',
        label: 'Approve and Link',
        style: 'primary',
        hint:  'Choose one.',
        targetChoice: 'link_target',
        fields: [],
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
        hint:        'Choose the disputed record. The claim reverted is whoever currently holds it.',
        targetChoice: 'disputed_record',
        fields: [
          { name: 'reason', label: 'Dispute reason', input: 'textarea', maxLength: 500, required: true },
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

  // A member's community announcement, held until another administrator reads
  // it. Both actions do their work in the broadcast service, which owns the
  // send, the member's email and the audit rows. There is no park action: the
  // member is waiting for an answer, and a matter like that is answered, not
  // set aside.
  announcement_review: {
    label:         'Held community announcement',
    kind:          'waiting',
    alertTemplate: null,
    brief: {
      what: 'A member wrote a community announcement and it waits for an administrator before it is published to the places they chose: the announcements list, the news feed or the blog, or the list with one of the two.',
      why:  'The member is waiting, and nothing is published until it is approved.',
      todo: 'Read it against the Community Standards, then approve and publish it as written, or send it back with a note saying what to change. A post for the news feed must be news for the community, not opinion; send an opinion piece back, saying it belongs on the blog. A blog post is the member\'s own writing and only has to keep to the Community Standards.',
    },
    entityTypes:   ['member_announcement'],
    routeTopic:    'moderation',
    evidence:      { kind: 'structured', payload: 'announcement' },
    actions: [
      {
        kind:  'act',
        key:   'announcement/approve',
        label: 'Approve and Publish',
        style: 'primary',
        fields: [
          { name: 'allow_extra', label: 'Allow an Extra Announcement Today', input: 'checkbox', maxLength: 1, required: false },
        ],
      },
      {
        kind:  'act',
        key:   'announcement/send-back',
        label: 'Send Back to the Member',
        style: 'outline',
        fields: [
          { name: 'comment', label: 'Note to the member', input: 'textarea', maxLength: 500, required: true },
        ],
      },
    ],
  },

  // An organizer's request that IFPA sanction their event. The Sanctioning
  // Director is an administrator and takes it up here like any other item,
  // reached by the queue's own digest. Both actions do their work in the event
  // service, which owns the sanction, the organizers' emails and the audit rows.
  // It is routine: the organizer waits on an answer, and nothing is lost by a
  // day in the queue.
  sanction_request: {
    label:         'Sanction Request',
    kind:          'waiting',
    alertTemplate: null,
    brief: {
      what: 'An event organizer asked IFPA to sanction their event.',
      why:  'The event stays a draft, not public and taking no registrations, until the request is decided.',
      todo: 'Read the request against the sanctioning guidelines, contact the organizer if anything needs settling, then approve it or reject it with a reason.',
    },
    entityTypes:   ['event'],
    routeTopic:    'sanctioning',
    evidence:      { kind: 'structured', payload: 'sanction_request' },
    actions: [
      {
        kind:  'act',
        key:   'sanction/approve',
        label: 'Approve Sanction',
        style: 'primary',
        fields: [
          { name: 'note', label: 'Note for the record (optional)', input: 'textarea', maxLength: 500, required: false },
        ],
      },
      {
        kind:  'act',
        key:   'sanction/reject',
        label: 'Reject Sanction',
        style: 'outline',
        fields: [
          { name: 'reason', label: 'Reason, sent to the organizers', input: 'textarea', maxLength: 500, required: true },
        ],
      },
    ],
  },

  admin_loss_recruitment: {
    label:            'Administrator lost; recruit a replacement',
    // The people who must act on losing an administrator are exactly the
    // shrinking set the loss is about, and a digest entry days later is too late.
    kind:             'team_alert',
    alertTemplate:    'admin_loss_recruitment',
    brief: {
      what: 'An administrator left the team, so fewer people now share the work.',
      why:  'With too few administrators, work waits longer and nobody can cover for someone who is away.',
      todo: 'Agree as a team whether to recruit a replacement, grant the role on the admin roles page if you do, then mark this reviewed.',
    },
    entityTypes:      ['member'],
    // Shared: losing an administrator is every administrator's matter.
    routeTopic:       null,
    evidence:         { kind: 'reason_text' },
    actions: [{
      kind:            'close',
      key:             'dismiss',
      label:           'Mark Reviewed',
      style:           'outline',
      note:            REVIEW_NOTE,
      auditActionType: 'admin.loss_alert_dismissed',
      auditReasonText: 'Administrator-loss recruitment alert reviewed and closed.',
      hint:            'Dismiss this once a replacement admin volunteer is recruited, or once the team agrees the current admin roster is sufficient. Granting the role to the replacement is done on the admin roles page.',
    }],
  },

  media_flag_review: {
    label:            'Flagged media',
    kind:             'housekeeping',
    alertTemplate:    null,
    brief: {
      what: 'Members flagged a photo or video as breaking the community standards.',
      why:  'Members rely on administrators to keep shared media within the community standards.',
      todo: 'Open the flagged media page, look at the item, and keep it or take it down there.',
    },
    entityTypes:      ['media_item'],
    routeTopic:       'moderation',
    evidence:         { kind: 'reason_text' },
    // The twin of an open report, closed when the item is decided on the page
    // that owns the decision. The review needs the thumbnail and the flagging
    // pattern to be decidable at all, neither of which a queue card carries, so
    // the card points at the takedown queue rather than trying to hold it.
    actions: [{
      kind:  'elsewhere',
      label: 'Review on the Flagged Media Page',
      href:  '/admin/media-flags',
    }],
  },

  media_takedown_storage_removal: {
    label:            'Removed media with files still stored',
    kind:             'housekeeping',
    alertTemplate:    null,
    brief: {
      what: 'A photo or video was taken down, but its stored files could not be deleted.',
      why:  'Anyone who has the address of those files can still open them until they are removed.',
      todo: 'Open the flagged media page and retry the removal; this item closes on its own once it works.',
    },
    entityTypes:      ['media_item'],
    routeTopic:       'platform',
    evidence:         { kind: 'reason_text' },
    // Raised when a takedown hid the item but its stored files survived, so the
    // bytes are still served to anyone holding their address. Without a card the
    // only record is a log line and a banner in one administrator's browser,
    // both gone the moment they close the tab. It closes as soon as a retry
    // removes the files.
    actions: [{
      kind:  'elsewhere',
      label: 'Retry on the Flagged Media Page',
      href:  '/admin/media-flags',
    }],
  },

  needs_organizer: {
    label:            'Event without an organizer',
    kind:             'housekeeping',
    alertTemplate:    null,
    brief: {
      what: 'An event lost its last organizer, because their account was deleted or they were marked deceased.',
      why:  'The event stays published, but nobody can enter its results until someone else organizes it.',
      todo: 'Open the event organizers page and assign a new organizer to the event.',
    },
    entityTypes:      ['event'],
    routeTopic:       null,
    evidence:         { kind: 'reason_text' },
    // Raised when the last member organizing an event stops being one, by
    // deleting their account or being marked deceased. The event keeps running
    // and stays published; what it loses is the person who can enter its
    // results, so the matter is a reassignment rather than an emergency. It
    // closes when an administrator hands the event to someone else on the page
    // that owns that act, which is also the only place the reassignment can be
    // recorded, or when a mistaken deceased marking is reversed.
    actions: [{
      kind:  'elsewhere',
      label: 'Assign an Organizer',
      href:  '/admin/events/organizers',
    }],
  },

  reconciliation_discrepancy: {
    label:            'Payment reconciliation discrepancy',
    kind:             'housekeeping',
    alertTemplate:    null,
    brief: {
      what: 'A check of the platform\'s payment records against Stripe found a mismatch.',
      why:  'Until it is resolved, the money the platform thinks it received may not match what arrived.',
      todo: 'Open the reconciliation page, find the cause, and resolve the issue there; this item then closes.',
    },
    entityTypes:      ['reconciliation_issue'],
    routeTopic:       'finance',
    evidence:         { kind: 'reason_text' },
    // The twin of a reconciliation issue, closed when the issue itself is
    // resolved on the page that owns it.
    actions: [{
      kind:  'elsewhere',
      label: 'Review on the Reconciliation Page',
      href:  '/admin/payments/reconciliation',
    }],
  },

  membership_overcharge_review: paymentsTask('Membership paid for but not granted', ['payment'], {
    what: 'A member paid for a membership, but the platform did not grant it.',
    why:  'The member has paid and is not getting what they paid for.',
  }),
  unattributed_refund: paymentsTask('Refund with no matching payment record', ['stripe_payment_intent', 'stripe_charge'], {
    what: 'Stripe reported a refund that matches no payment the platform has on record.',
    why:  'Money left the account and nothing on the platform explains why.',
  }),
  partial_refund_review: paymentsTask('Partially refunded payment', ['payment'], {
    what: 'Part of a payment was refunded.',
    why:  'Now that some of the money went back, what the member paid for may need adjusting by hand.',
  }),
  refund_failed_review: paymentsTask('Refund that could not be returned to the card', ['stripe_refund'], {
    what: 'A refund could not be returned to the card it came from.',
    why:  'The person is still owed that money until it reaches them another way.',
  }),
  charge_dispute_review: paymentsTask('Card dispute raised against a payment', ['stripe_dispute'], {
    what: 'A cardholder disputed a payment with their bank.',
    why:  'The bank sets a deadline to respond, and a dispute left unanswered is lost.',
  }),
  payout_failed: paymentsTask('Payout to the bank account failed', ['stripe_payout'], {
    what: 'Stripe could not pay the balance into the bank account.',
    why:  'The money stays with Stripe until the bank details are fixed.',
  }),
  recurring_donation_charge_declined: paymentsTask('Recurring donation renewal charge declined', ['recurring_donation_subscription'], {
    what: 'A card was declined when a recurring donation renewed.',
    why:  'The donation may stop unless the donor updates their card.',
  }),
  recurring_donation_paused: paymentsTask('Recurring donation paused at Stripe', ['recurring_donation_subscription'], {
    what: 'A recurring donation was paused at Stripe.',
    why:  'No further donations arrive while it stays paused.',
  }),
};

/** The descriptor for a task type, or null for one that has none. */
export function workQueueDescriptorFor(taskType: string): WorkQueueTaskTypeDescriptor | null {
  return WORK_QUEUE_TASK_TYPES[taskType] ?? null;
}

/**
 * The kind a task type declares, or null for an unknown type. A scheduled read
 * meeting a row whose type has since been withdrawn treats it as routine rather
 * than crashing; enqueue is where an undeclared type is refused.
 */
export function kindOf(taskType: string): WorkQueueKind | null {
  return workQueueDescriptorFor(taskType)?.kind ?? null;
}

/**
 * The task types of one kind, narrowed to one area, to the shared types (no
 * area), or not narrowed at all (null), in the table's declaration order.
 */
export function taskTypesFor(kind: WorkQueueKind, area: WorkQueueTopic | 'shared' | null): string[] {
  return Object.entries(WORK_QUEUE_TASK_TYPES)
    .filter(([, d]) => d.kind === kind
      && (area === null
        || (area === 'shared' ? d.routeTopic === null : d.routeTopic === area)))
    .map(([taskType]) => taskType);
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
