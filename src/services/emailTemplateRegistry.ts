/**
 * Email template registry — the pure, DB-free half of the email compose path.
 *
 * Owns the two-level template registry: a logical send key per email type
 * (the call-site API, with a typed param shaper that computes the merge-field
 * values and selects the variant), and a variant template key per distinct
 * message (the unit of stored wording, PII classification, and outbox
 * stamping). Templates are logic-less plain text with `{token}` merge fields;
 * the shaper computes every value (including label lookups and pluralized
 * phrases), and branching wording is expressed as separate variant keys,
 * never as conditional syntax in a template. The stored wording lives in
 * `email_templates` rows (seeded from /curated/email_templates/ sidecars
 * pre-go-live, admin-edited after); the render step over those rows is
 * `emailService`, which keeps this module import-safe for unit tests and the
 * sidecar conformance test.
 */

export type EmailPiiClass = 'public' | 'internal' | 'confidential' | 'restricted';

type Empty = Record<string, never>;

const TIER_LABEL = {
  tier0: 'Tier 0 (Registered Member)',
  tier1: 'Tier 1 (IFPA Member)',
  tier2: 'Tier 2 (IFPA Organizer Member)',
  tier3: 'Tier 3 (IFPA Director)',
} as const;

export type TierKey = keyof typeof TIER_LABEL;

function hourPhrase(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`;
}

function dayPhrase(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

function openItemPhrase(n: number): string {
  return `${n} open item${n === 1 ? '' : 's'}`;
}

// The area digest's wording says "open" itself ("has 3 items open"), so its
// count is the bare item count.
function itemPhrase(n: number): string {
  return `${n} item${n === 1 ? '' : 's'}`;
}

// Who made a correction to a member's event registration, as its notice names them.
function correctedBy(byAdministrator: boolean): string {
  return byAdministrator ? 'an IFPA administrator' : 'its organizers';
}

// An administrator's reason for a registration correction, as its own
// paragraph; an organizer's correction carries none, so it resolves to nothing.
function reasonNote(byAdministrator: boolean, reason: string | null): string {
  return byAdministrator && reason ? `The reason given:\n\n${reason}\n\n` : '';
}

// A doubles partner notice: the recipient, the other member on the entry, and
// where it is.
interface PartnerNoticeParams {
  memberName: string; entrantName: string; divisionName: string; eventTitle: string; eventDates: string;
}

// Stored template text is logic-less, so a donation note that may be absent
// resolves to a complete sentence here rather than to an empty gap in the body.
function donationNotePhrase(note: string | null): string {
  return note ? `Your note: ${note}` : 'You did not include a note.';
}

// ── Variant registry ────────────────────────────────────────────────────────
// One entry per distinct message: the unit of stored wording. Carries the
// canonical PII-classification default (the DB row's column is the
// admin-editable override) and the declared merge-field set, which the editor
// and the sidecar conformance test validate template text against.

interface VariantDef {
  classification: EmailPiiClass;
  mergeFields: readonly string[];
}

function v(classification: EmailPiiClass, mergeFields: readonly string[]): VariantDef {
  return { classification, mergeFields };
}

const PAYMENT_RECEIPT_FIELDS = [
  'descriptor', 'amountDisplay', 'paymentDate', 'intervalPhrase', 'referenceId',
] as const;

// The gift acknowledgement adds the donor's own note. It is the only receipt
// that carries it: the descriptor is a neutral label everywhere, and the note is
// held in one column and rendered from there rather than glued into a label.
const DONATION_RECEIPT_FIELDS = [...PAYMENT_RECEIPT_FIELDS, 'notePhrase'] as const;

const RECURRING_DONATION_FIELDS = ['amountDisplay', 'notePhrase', 'referenceId'] as const;

// The setup confirmation carries a date; the later lifecycle notices do not.
// The donation story requires amount, date, interval and reference on the
// confirmation a donor receives after setting a recurring gift up, and the
// interval is carried by the template's own wording rather than a merge field.
const RECURRING_DONATION_STARTED_FIELDS = [
  'amountDisplay', 'notePhrase', 'startedDate', 'referenceId',
] as const;

export const TEMPLATE_VARIANTS = {
  account_verify:                  v('restricted',   ['verifyUrl', 'ttlPhrase']),
  // A notice a stranger's registration attempt sets off: it tells the owner how
  // to reach the site and carries no link, so members are never taught to
  // follow a sign-in link arriving in mail.
  account_exists_notice:           v('restricted',   []),
  password_reset_request:          v('restricted',   ['resetUrl', 'ttlPhrase']),
  account_deletion_requested:      v('restricted',   ['memberName', 'gracePhrase']),
  account_deleted_by_admin:        v('restricted',   ['memberName', 'gracePhrase', 'note']),
  // The restriction notices and the board's discipline decisions. Restricted,
  // because each carries an administrator's or the board's reason about the
  // member's conduct.
  account_restricted:              v('restricted',   ['memberName', 'note']),
  account_restriction_lifted:      v('restricted',   ['memberName', 'note']),
  membership_discipline_suspended: v('restricted',   ['memberName', 'untilDate', 'note']),
  membership_discipline_other:     v('restricted',   ['memberName', 'note']),
  membership_discipline_no_action: v('restricted',   ['memberName']),
  membership_expelled:             v('restricted',   ['memberName', 'note']),
  // Sent to an address an expulsion barred when someone tries to register with
  // it; like the account-exists notice it carries no link.
  registration_refused_barred:     v('restricted',   []),
  password_reset_confirm:         v('internal',     []),
  password_changed:                v('internal',     []),
  // Carries nothing about the question it announces: the question itself may
  // concern a date of birth, which is owner-and-admin private and never leaves
  // the application. No merge fields, and deliberately no link.
  member_question_waiting:         v('internal',     []),
  vouch_confirmation:              v('confidential', ['voucherName', 'expiryDate']),
  event_attendance_active_player:  v('internal',     ['eventTitle', 'expiryDate']),
  honor_congratulation_hof:        v('internal',     []),
  honor_congratulation_hof_tier3:  v('internal',     []),
  honor_congratulation_bap:        v('internal',     []),
  honor_congratulation_bap_tier3:  v('internal',     []),
  tier_change_notice:              v('confidential', ['tierLabel', 'reasonText']),
  admin_role_granted:              v('internal',     []),
  admin_role_revoked:              v('internal',     []),
  payment_receipt_succeeded_tier1: v('confidential', PAYMENT_RECEIPT_FIELDS),
  payment_receipt_succeeded_tier2: v('confidential', PAYMENT_RECEIPT_FIELDS),
  payment_receipt_succeeded:       v('confidential', PAYMENT_RECEIPT_FIELDS),
  payment_receipt_succeeded_donation: v('confidential', DONATION_RECEIPT_FIELDS),
  payment_receipt_failed:          v('confidential', PAYMENT_RECEIPT_FIELDS),
  payment_receipt_failed_membership: v('confidential', PAYMENT_RECEIPT_FIELDS),
  payment_receipt_failed_event_registration: v('confidential', PAYMENT_RECEIPT_FIELDS),
  donation_subscription_started:            v('confidential', RECURRING_DONATION_STARTED_FIELDS),
  donation_subscription_cancel_requested:   v('confidential', RECURRING_DONATION_FIELDS),
  donation_subscription_charge_failed:      v('confidential', RECURRING_DONATION_FIELDS),
  donation_subscription_canceled:           v('confidential', RECURRING_DONATION_FIELDS),
  admin_recurring_donation_ended:  v('internal',     ['referenceId', 'amountDisplay', 'endReason']),
  // Confidential, as every other message carrying a donor's note is: it names
  // each commented gift's donor beside their comment.
  reconciliation_digest:           v('confidential', ['countPhrase', 'periodPhrase', 'headlinePhrase', 'comparisonBlock', 'needsAttentionBlock', 'forTheRecordBlock', 'carriedForwardBlock', 'donationCommentsBlock', 'totalsBlock', 'reportsUrl', 'reviewUrl']),
  active_player_expiry_upcoming:   v('internal',     ['displayDate']),
  active_player_expiry_day_of:     v('internal',     ['displayDate']),
  club_membership_member_join:     v('confidential', ['memberName', 'clubName']),
  club_membership_member_leave:    v('confidential', ['memberName', 'clubName']),
  club_membership_leader_join:     v('confidential', ['leaderName', 'memberName', 'clubName']),
  club_membership_leader_leave:    v('confidential', ['leaderName', 'memberName', 'clubName']),
  club_volunteer_leadership:       v('confidential', ['leaderName', 'joinerName', 'clubName']),
  club_leaderless_contact:         v('confidential', ['memberName', 'clubName']),
  club_quiet_contact:              v('confidential', ['memberName', 'clubName']),
  event_created_confirmation:      v('internal',     ['eventTitle', 'eventDates']),
  event_organizer_added:           v('internal',     ['actorName', 'eventTitle', 'eventDates']),
  event_sanction_requested:        v('internal',     ['eventTitle', 'eventDates']),
  event_sanctioned:                v('internal',     ['eventTitle', 'guidelinesUrl', 'decisionNoteLine']),
  event_sanction_rejected:         v('internal',     ['eventTitle', 'reason', 'manageUrl']),
  // Both name members: the registrant's partners, and the member who withdrew.
  event_registration_confirmed:    v('confidential', ['eventTitle', 'eventDates', 'registrationSummary']),
  event_registration_reminder:     v('confidential', ['eventTitle', 'eventDates', 'registrationSummary']),
  event_registration_withdrawn:    v('confidential', ['memberName', 'eventTitle', 'eventDates']),
  // A doubles partner told another member's entry names them, or that a
  // partner left their entry: both name the other member.
  event_partner_named:             v('confidential', ['memberName', 'entrantName', 'divisionName', 'eventTitle', 'eventDates']),
  event_partner_left:              v('confidential', ['memberName', 'entrantName', 'divisionName', 'eventTitle', 'eventDates']),
  // An organizer's or administrator's correction at the event, naming the
  // member's entries and partners, and an administrator's reason.
  event_registration_added:        v('confidential', ['memberName', 'eventTitle', 'eventDates', 'changedBy', 'reasonNote', 'registrationSummary']),
  event_registration_corrected:    v('confidential', ['memberName', 'eventTitle', 'eventDates', 'changedBy', 'whatChanged', 'reasonNote', 'registrationSummary']),
  // Both carry the reason an organizer or administrator typed.
  event_canceled:                  v('confidential', ['memberName', 'eventTitle', 'eventDates', 'canceledBy', 'reason', 'refundNote']),
  event_registration_canceled:     v('confidential', ['memberName', 'eventTitle', 'eventDates', 'canceledBy', 'reason', 'refundNote']),
  event_record_corrected:          v('confidential', ['organizerName', 'eventTitle', 'whatChanged', 'note']),
  contact_request_resolution:     v('confidential', ['memberName', 'displayDecision', 'note']),
  media_moderation_decision:       v('confidential', ['memberName', 'itemDescription', 'displayDecision', 'note']),
  avatar_removed_member:           v('confidential', ['memberName', 'note']),
  media_removed_member:            v('confidential', ['memberName', 'itemDescription', 'note']),
  member_record_corrected:         v('confidential', ['memberName', 'whatChanged', 'note']),
  club_record_corrected:           v('confidential', ['leaderName', 'clubName', 'whatChanged', 'note']),
  gallery_moderated_member:        v('confidential', ['memberName', 'galleryName', 'whatChanged', 'note']),
  link_help_request_resolution:    v('confidential', ['memberName', 'displayDecision', 'note']),
  announce_approved:               v('confidential', ['memberName', 'subject']),
  // Carries the administrator's comment and the subject the member chose, never
  // the body: the member wrote it and still has it on the form.
  announce_returned:               v('confidential', ['memberName', 'subject', 'comment']),
  admin_loss_recruitment:         v('internal',     ['itemUrl']),
  admin_queue_digest:              v('internal',     ['countPhrase', 'itemLines', 'queueUrl']),
  admin_queue_topic_digest:        v('internal',     ['areaLabel', 'countPhrase', 'itemLines', 'queueUrl']),
  work_queue_topic_route_disabled: v('internal',     ['areaLabel']),
  media_report_outcome_reporter:   v('confidential', ['decisionSentence']),
  media_report_received_reporter:  v('confidential', []),
  admin_queue_stale_escalation:    v('internal',     ['taskLabel', 'kindLabel', 'agePhrase', 'itemUrl']),
} satisfies Record<string, VariantDef>;

export type EmailTemplateVariantKey = keyof typeof TEMPLATE_VARIANTS;

// ── Shaper registry ─────────────────────────────────────────────────────────
// One entry per logical email type: the typed call-site API. Each shaper
// computes the flat merge map and selects the variant key for its input.

export interface ShapedEmail {
  variant: EmailTemplateVariantKey;
  merge: Record<string, string>;
}

interface RecurringDonationParams {
  amountDisplay: string;
  donationNote: string | null;
  referenceId: string;
  /** Rendered only by the setup confirmation; the lifecycle notices ignore it. */
  startedDate: string;
}

function recurringDonationMerge(p: RecurringDonationParams): Record<string, string> {
  return {
    amountDisplay: p.amountDisplay,
    notePhrase: donationNotePhrase(p.donationNote),
    referenceId: p.referenceId,
  };
}

const SHAPERS = {
  account_verify: (p: { verifyUrl: string; ttlHours: number }): ShapedEmail => ({
    variant: 'account_verify',
    merge: { verifyUrl: p.verifyUrl, ttlPhrase: hourPhrase(p.ttlHours) },
  }),
  account_exists_notice: (_p: Empty): ShapedEmail => ({
    variant: 'account_exists_notice',
    merge: {},
  }),
  password_reset_request: (p: { resetUrl: string; ttlHours: number }): ShapedEmail => ({
    variant: 'password_reset_request',
    merge: { resetUrl: p.resetUrl, ttlPhrase: hourPhrase(p.ttlHours) },
  }),
  // The one message the platform sends to an account it has just made
  // unreachable. It is what tells the member the window exists at all, so it is
  // enqueued in the same transaction as the deletion and never skipped.
  account_deletion_requested: (p: { memberName: string; graceDays: number }): ShapedEmail => ({
    variant: 'account_deletion_requested',
    merge: { memberName: p.memberName, gracePhrase: dayPhrase(p.graceDays) },
  }),
  // The same last message when an administrator deleted the account, carrying
  // their reason, since the member did not ask for it.
  account_deleted_by_admin: (p: { memberName: string; graceDays: number; note: string }): ShapedEmail => ({
    variant: 'account_deleted_by_admin',
    merge: { memberName: p.memberName, gracePhrase: dayPhrase(p.graceDays), note: p.note },
  }),
  // A restricted member cannot sign in to read anything, so the notice itself
  // carries the reason and how to respond.
  account_restricted: (p: { memberName: string; note: string }): ShapedEmail => ({
    variant: 'account_restricted',
    merge: { memberName: p.memberName, note: p.note },
  }),
  account_restriction_lifted: (p: { memberName: string; note: string }): ShapedEmail => ({
    variant: 'account_restriction_lifted',
    merge: { memberName: p.memberName, note: p.note },
  }),
  // The board's decision on a member, one variant per outcome. An expulsion has
  // its own notice, sent in place of the ordinary deletion notice.
  membership_discipline_decided: (
    p: { memberName: string; outcome: 'suspended' | 'other_sanction' | 'no_action'; untilDate: string; note: string },
  ): ShapedEmail => {
    if (p.outcome === 'suspended') {
      return {
        variant: 'membership_discipline_suspended',
        merge: { memberName: p.memberName, untilDate: p.untilDate, note: p.note },
      };
    }
    if (p.outcome === 'other_sanction') {
      return { variant: 'membership_discipline_other', merge: { memberName: p.memberName, note: p.note } };
    }
    return { variant: 'membership_discipline_no_action', merge: { memberName: p.memberName } };
  },
  membership_expelled: (p: { memberName: string; note: string }): ShapedEmail => ({
    variant: 'membership_expelled',
    merge: { memberName: p.memberName, note: p.note },
  }),
  registration_refused_barred: (_p: Empty): ShapedEmail => ({
    variant: 'registration_refused_barred',
    merge: {},
  }),
  password_reset_confirm: (_p: Empty): ShapedEmail => ({
    variant: 'password_reset_confirm',
    merge: {},
  }),
  password_changed: (_p: Empty): ShapedEmail => ({
    variant: 'password_changed',
    merge: {},
  }),
  member_question_waiting: (_p: Empty): ShapedEmail => ({
    variant: 'member_question_waiting',
    merge: {},
  }),
  vouch_confirmation: (p: { voucherName: string; expiryDate: string }): ShapedEmail => ({
    variant: 'vouch_confirmation',
    merge: { voucherName: p.voucherName, expiryDate: p.expiryDate },
  }),
  // Sent when attendance at an event grants or extends a Tier 0 member's
  // Active Player status, in the vouch confirmation's words.
  event_attendance_active_player: (p: { eventTitle: string; expiryDate: string }): ShapedEmail => ({
    variant: 'event_attendance_active_player',
    merge: { eventTitle: p.eventTitle, expiryDate: p.expiryDate },
  }),
  honor_congratulation: (p: { honor: 'hof' | 'bap'; staysTier3: boolean }): ShapedEmail => ({
    variant: p.honor === 'hof'
      ? (p.staysTier3 ? 'honor_congratulation_hof_tier3' : 'honor_congratulation_hof')
      : (p.staysTier3 ? 'honor_congratulation_bap_tier3' : 'honor_congratulation_bap'),
    merge: {},
  }),
  tier_change_notice: (p: { newTier: TierKey; reasonText: string }): ShapedEmail => ({
    variant: 'tier_change_notice',
    merge: { tierLabel: TIER_LABEL[p.newTier], reasonText: p.reasonText },
  }),
  admin_role_change: (p: { action: 'granted' | 'revoked' }): ShapedEmail => ({
    variant: p.action === 'granted' ? 'admin_role_granted' : 'admin_role_revoked',
    merge: {},
  }),
  payment_receipt: (p: {
    descriptor: string;
    amountDisplay: string;
    paymentDate: string;
    intervalPhrase: string;
    outcome: 'succeeded' | 'failed';
    isMembership: boolean;
    isDonation: boolean;
    isEventRegistration?: boolean;
    purchasedTier: 'tier1' | 'tier2' | null;
    donationNote: string | null;
    referenceId: string;
  }): ShapedEmail => {
    // Failure branches on what was being bought, for the same reason the
    // success side branches on the tier: a donor told their membership tier was
    // not changed is being answered about something they were not doing.
    //
    // A settled donation gets its own variant because it is the only one of
    // these that is a gift. It names the organization and states that nothing
    // was given in return, which is what a donor filing a United States return
    // needs and cannot get from a bare receipt. That wording belongs on gifts
    // alone: a membership or an event fee buys something, so putting
    // deductibility language on those would be wrong.
    const variant = p.outcome === 'failed'
      ? (p.isMembership
        ? 'payment_receipt_failed_membership'
        : p.isEventRegistration ? 'payment_receipt_failed_event_registration' : 'payment_receipt_failed')
      : p.isMembership && p.purchasedTier === 'tier1'
        ? 'payment_receipt_succeeded_tier1'
        : p.isMembership && p.purchasedTier === 'tier2'
          ? 'payment_receipt_succeeded_tier2'
          : p.isDonation
            ? 'payment_receipt_succeeded_donation'
            : 'payment_receipt_succeeded';
    return {
      variant,
      merge: {
        descriptor: p.descriptor,
        amountDisplay: p.amountDisplay,
        paymentDate: p.paymentDate,
        intervalPhrase: p.intervalPhrase,
        referenceId: p.referenceId,
        // Only the gift acknowledgement carries the donor's note. The descriptor
        // is a neutral label on every receipt, so a settled donation is the one
        // message where the words the donor wrote belong, and the four other
        // receipt variants declare no such field.
        ...(variant === 'payment_receipt_succeeded_donation'
          ? { notePhrase: donationNotePhrase(p.donationNote) }
          : {}),
      },
    };
  },
  donation_subscription_started: (p: RecurringDonationParams): ShapedEmail => ({
    variant: 'donation_subscription_started',
    merge: { ...recurringDonationMerge(p), startedDate: p.startedDate },
  }),
  donation_subscription_cancel_requested: (p: RecurringDonationParams): ShapedEmail => ({
    variant: 'donation_subscription_cancel_requested',
    merge: recurringDonationMerge(p),
  }),
  donation_subscription_charge_failed: (p: RecurringDonationParams): ShapedEmail => ({
    variant: 'donation_subscription_charge_failed',
    merge: recurringDonationMerge(p),
  }),
  donation_subscription_canceled: (p: RecurringDonationParams): ShapedEmail => ({
    variant: 'donation_subscription_canceled',
    merge: recurringDonationMerge(p),
  }),
  admin_recurring_donation_ended: (p: {
    referenceId: string;
    amountDisplay: string;
    memberRequested: boolean;
  }): ShapedEmail => ({
    variant: 'admin_recurring_donation_ended',
    merge: {
      referenceId: p.referenceId,
      amountDisplay: p.amountDisplay,
      endReason: p.memberRequested
        ? 'The member cancelled it.'
        : 'Stripe ended it after exhausting its retries.',
    },
  }),
  reconciliation_digest: (p: {
    outstandingCount: number;
    resolvedCount: number;
    periodDays: number;
    oldestOutstandingAgeDays: number | null;
    needsAttentionLines: string;
    forTheRecordLines: string;
    /** What the last nightly pass compared and set aside, or null before any
     *  pass has run. */
    comparisonLine: string | null;
    /** One line per commented gift of the period; empty when none carried a
     *  comment. */
    donationCommentLines: string;
    /** The newest report's totals, or null before any report exists. */
    totalsLines: string | null;
    /** The newest report's carried-forward reconciling items; empty when it
     *  found none again. */
    carriedForwardLines: string;
    reviewUrl: string;
    reportsUrl: string;
  }): ShapedEmail => ({
    variant: 'reconciliation_digest',
    merge: {
      comparisonBlock: p.comparisonLine ?? 'No nightly comparison has run yet.',
      carriedForwardBlock: p.carriedForwardLines
        || 'No difference explained earlier was found again.',
      donationCommentsBlock: p.donationCommentLines
        || 'No donation during this period carried a comment.',
      totalsBlock: p.totalsLines ?? 'No nightly report has been kept yet.',
      reportsUrl: p.reportsUrl,
      countPhrase: p.outstandingCount === 0
        ? 'nothing outstanding'
        : `${p.outstandingCount} outstanding discrepanc${p.outstandingCount === 1 ? 'y' : 'ies'}`,
      periodPhrase: p.periodDays === 1 ? 'day' : `${p.periodDays} days`,
      // The nil report is the whole point of sending on a clean period, so it
      // says plainly that the check ran and found nothing, never just an empty
      // section a reader has to interpret.
      headlinePhrase: p.outstandingCount === 0
        ? 'Everything matched. Nothing needs a decision.'
        : p.oldestOutstandingAgeDays === null || p.oldestOutstandingAgeDays === 0
          ? `${p.outstandingCount} item${p.outstandingCount === 1 ? '' : 's'} need a decision.`
          : `${p.outstandingCount} item${p.outstandingCount === 1 ? '' : 's'} need a decision. `
            + `The oldest has been waiting ${p.oldestOutstandingAgeDays} day`
            + `${p.oldestOutstandingAgeDays === 1 ? '' : 's'}.`,
      needsAttentionBlock: p.needsAttentionLines || 'Nothing outstanding.',
      forTheRecordBlock: p.resolvedCount === 0
        ? 'Nothing was resolved during this period.'
        : p.forTheRecordLines,
      reviewUrl: p.reviewUrl,
    },
  }),
  active_player_expiry_reminder: (p: { displayDate: string; isDayOf: boolean }): ShapedEmail => ({
    variant: p.isDayOf ? 'active_player_expiry_day_of' : 'active_player_expiry_upcoming',
    merge: { displayDate: p.displayDate },
  }),
  club_membership_member: (p: { kind: 'join' | 'leave'; memberName: string; clubName: string }): ShapedEmail => ({
    variant: p.kind === 'join' ? 'club_membership_member_join' : 'club_membership_member_leave',
    merge: { memberName: p.memberName, clubName: p.clubName },
  }),
  club_membership_leader: (p: {
    kind: 'join' | 'leave';
    leaderName: string;
    memberName: string;
    clubName: string;
  }): ShapedEmail => ({
    variant: p.kind === 'join' ? 'club_membership_leader_join' : 'club_membership_leader_leave',
    merge: { leaderName: p.leaderName, memberName: p.memberName, clubName: p.clubName },
  }),
  club_volunteer_leadership: (p: { leaderName: string; joinerName: string; clubName: string }): ShapedEmail => ({
    variant: 'club_volunteer_leadership',
    merge: { leaderName: p.leaderName, joinerName: p.joinerName, clubName: p.clubName },
  }),
  club_leaderless_contact: (p: { memberName: string; clubName: string }): ShapedEmail => ({
    variant: 'club_leaderless_contact',
    merge: { memberName: p.memberName, clubName: p.clubName },
  }),
  // Sent by an administrator to each co-leader of a club the site has seen no
  // sign of life from for two years.
  club_quiet_contact: (p: { memberName: string; clubName: string }): ShapedEmail => ({
    variant: 'club_quiet_contact',
    merge: { memberName: p.memberName, clubName: p.clubName },
  }),
  // Sent to every organizer of a free event once it opens for registration.
  event_created_confirmation: (p: { eventTitle: string; eventDates: string }): ShapedEmail => ({
    variant: 'event_created_confirmation',
    merge: { eventTitle: p.eventTitle, eventDates: p.eventDates },
  }),
  // Sent to a member another organizer has added to an event's organizers.
  event_organizer_added: (p: { actorName: string; eventTitle: string; eventDates: string }): ShapedEmail => ({
    variant: 'event_organizer_added',
    merge: { actorName: p.actorName, eventTitle: p.eventTitle, eventDates: p.eventDates },
  }),
  // Sent to every organizer when one of them submits the sanction request.
  event_sanction_requested: (p: { eventTitle: string; eventDates: string }): ShapedEmail => ({
    variant: 'event_sanction_requested',
    merge: { eventTitle: p.eventTitle, eventDates: p.eventDates },
  }),
  // Sent to every organizer once the event is sanctioned, by an approved
  // request or a Board award. The administrator's note, when there is one,
  // follows on its own line.
  event_sanctioned: (p: { eventTitle: string; guidelinesUrl: string; note: string | null }): ShapedEmail => ({
    variant: 'event_sanctioned',
    merge: {
      eventTitle: p.eventTitle,
      guidelinesUrl: p.guidelinesUrl,
      decisionNoteLine: p.note ? `\n\nNote from IFPA: ${p.note}` : '',
    },
  }),
  // Sent to every organizer when the request is rejected, with the reason.
  event_sanction_rejected: (p: { eventTitle: string; reason: string; manageUrl: string }): ShapedEmail => ({
    variant: 'event_sanction_rejected',
    merge: { eventTitle: p.eventTitle, reason: p.reason, manageUrl: p.manageUrl },
  }),
  event_registration_confirmed: (p: { eventTitle: string; eventDates: string; registrationSummary: string }): ShapedEmail => ({
    variant: 'event_registration_confirmed',
    merge: { eventTitle: p.eventTitle, eventDates: p.eventDates, registrationSummary: p.registrationSummary },
  }),
  // Sent by the daily reminder job, in the confirmation's own words.
  event_registration_reminder: (p: { eventTitle: string; eventDates: string; registrationSummary: string }): ShapedEmail => ({
    variant: 'event_registration_reminder',
    merge: { eventTitle: p.eventTitle, eventDates: p.eventDates, registrationSummary: p.registrationSummary },
  }),
  event_registration_withdrawn: (p: { memberName: string; eventTitle: string; eventDates: string }): ShapedEmail => ({
    variant: 'event_registration_withdrawn',
    merge: { memberName: p.memberName, eventTitle: p.eventTitle, eventDates: p.eventDates },
  }),
  // Sent once to the member a doubles entry names as partner, unless their own
  // entry already names the entrant back.
  event_partner_named: (p: PartnerNoticeParams): ShapedEmail => ({ variant: 'event_partner_named', merge: { ...p } }),
  // Sent to the member whose entry a partner left by withdrawing or choosing
  // someone else; their entry is left looking for a partner.
  event_partner_left: (p: PartnerNoticeParams): ShapedEmail => ({ variant: 'event_partner_left', merge: { ...p } }),
  // Sent to the member an organizer or administrator registered at the event.
  // An administrator's reason follows as its own paragraph.
  event_registration_added: (p: {
    memberName: string; eventTitle: string; eventDates: string; registrationSummary: string;
    byAdministrator: boolean; reason: string | null;
  }): ShapedEmail => ({
    variant: 'event_registration_added',
    merge: {
      memberName: p.memberName, eventTitle: p.eventTitle, eventDates: p.eventDates,
      changedBy: correctedBy(p.byAdministrator), reasonNote: reasonNote(p.byAdministrator, p.reason),
      registrationSummary: p.registrationSummary,
    },
  }),
  // Sent to the member whose entry an organizer or administrator changed,
  // naming what changed and the entry as it now reads, and to a partner whose
  // own entry the change left with no partner.
  event_registration_corrected: (p: {
    memberName: string; eventTitle: string; eventDates: string; whatChanged: string; registrationSummary: string;
    byAdministrator: boolean; reason: string | null;
  }): ShapedEmail => ({
    variant: 'event_registration_corrected',
    merge: {
      memberName: p.memberName, eventTitle: p.eventTitle, eventDates: p.eventDates,
      changedBy: correctedBy(p.byAdministrator), whatChanged: p.whatChanged,
      reasonNote: reasonNote(p.byAdministrator, p.reason), registrationSummary: p.registrationSummary,
    },
  }),
  // Sent to every registrant and organizer when the event is canceled. A
  // registrant who paid is told that canceling refunds nobody by itself.
  event_canceled: (p: {
    memberName: string; eventTitle: string; eventDates: string;
    byAdministrator: boolean; reason: string; paid: boolean;
  }): ShapedEmail => ({
    variant: 'event_canceled',
    merge: {
      memberName: p.memberName,
      eventTitle: p.eventTitle,
      eventDates: p.eventDates,
      canceledBy: p.byAdministrator ? 'an IFPA administrator' : 'its organizers',
      reason: p.reason,
      refundNote: p.paid
        ? 'Canceling the event does not refund anyone by itself: the IFPA Treasurer arranges any refund outside footbag.org.\n\n'
        : '',
    },
  }),
  // Sent to the member whose registration an organizer or administrator canceled.
  event_registration_canceled: (p: {
    memberName: string; eventTitle: string; eventDates: string;
    byAdministrator: boolean; reason: string; paid: boolean;
  }): ShapedEmail => ({
    variant: 'event_registration_canceled',
    merge: {
      memberName: p.memberName,
      eventTitle: p.eventTitle,
      eventDates: p.eventDates,
      canceledBy: p.byAdministrator ? 'an IFPA administrator' : 'its organizers',
      reason: p.reason,
      refundNote: p.paid ? 'Any refund is arranged by the IFPA Treasurer outside footbag.org.\n\n' : '',
    },
  }),
  // The club correction notice's event counterpart, to every current
  // organizer, naming what changed but never the values.
  event_record_corrected: (
    p: { organizerName: string; eventTitle: string; whatChanged: string; note: string },
  ): ShapedEmail => ({
    variant: 'event_record_corrected',
    merge: {
      organizerName: p.organizerName, eventTitle: p.eventTitle, whatChanged: p.whatChanged, note: p.note,
    },
  }),
  contact_request_resolution: (p: { memberName: string; displayDecision: string; note: string }): ShapedEmail => ({
    variant: 'contact_request_resolution',
    merge: { memberName: p.memberName, displayDecision: p.displayDecision, note: p.note },
  }),
  // The uploader is told what was decided about their item, whichever way it
  // went. The report itself is never quoted back to them: the reporter's words
  // are evidence for the administrator, and naming the reporter to the person
  // they reported is how a report turns into a reprisal.
  // One notice for every administrative correction of a member's own record,
  // whichever field moved. The caller supplies the plain-English phrase for
  // what changed, so a member reads one familiar message rather than a
  // different one per surface, and the values themselves stay off the wire:
  // the mail may reach an address that is no longer the member's, which is
  // exactly the case a name or contact correction is most often made for.
  member_record_corrected: (p: { memberName: string; whatChanged: string; note: string }): ShapedEmail => ({
    variant: 'member_record_corrected',
    merge: { memberName: p.memberName, whatChanged: p.whatChanged, note: p.note },
  }),
  // The same notice for a club, which needs its own wording rather than the
  // member one: what moved is not on the reader's own account, and the club has
  // to be named because a co-leader reading it may belong to several. It goes
  // to every current co-leader, so it addresses the reader by name and never
  // implies they were the one who got it wrong.
  club_record_corrected: (
    p: { leaderName: string; clubName: string; whatChanged: string; note: string },
  ): ShapedEmail => ({
    variant: 'club_record_corrected',
    merge: {
      leaderName: p.leaderName, clubName: p.clubName, whatChanged: p.whatChanged, note: p.note,
    },
  }),
  // An administrator moderated a gallery the member made. The gallery is named
  // by the name it carried when they wrote it, because a cleared name would
  // leave them with no way to tell which gallery this was about.
  gallery_moderated_member: (
    p: { memberName: string; galleryName: string; whatChanged: string; note: string },
  ): ShapedEmail => ({
    variant: 'gallery_moderated_member',
    merge: {
      memberName: p.memberName, galleryName: p.galleryName,
      whatChanged: p.whatChanged, note: p.note,
    },
  }),
  // A takedown reaches a member from two doors: a report an administrator
  // decided, and an administrator acting on the member's record with no report
  // in front of them. The decided case names the decision, because there was a
  // two-way choice and the member is owed which way it went. The undecided case
  // names no decision and quotes no reporter, because there was none, and the
  // profile-picture wording additionally says where to put a new one up, so the
  // mail reads as a removal rather than a sanction.
  media_moderation_decision: (
    p: {
      memberName: string; itemDescription: string; displayDecision: string; note: string;
      wasReported: boolean; isAvatar: boolean;
    },
  ): ShapedEmail => {
    if (p.wasReported) {
      return {
        variant: 'media_moderation_decision',
        merge: {
          memberName: p.memberName, itemDescription: p.itemDescription,
          displayDecision: p.displayDecision, note: p.note,
        },
      };
    }
    // A member has one profile picture, so its mail names it without a description.
    if (p.isAvatar) {
      return { variant: 'avatar_removed_member', merge: { memberName: p.memberName, note: p.note } };
    }
    return {
      variant: 'media_removed_member',
      merge: { memberName: p.memberName, itemDescription: p.itemDescription, note: p.note },
    };
  },
  // The identity-link category is answered by applying a link rather than by
  // writing back, so it resolves through its own queue and needs its own reply.
  // Without it a member is promised an answer on submission and hears nothing,
  // whether their records were linked or the request was refused.
  announce_approved: (p: { memberName: string; subject: string }): ShapedEmail => ({
    variant: 'announce_approved',
    merge: { memberName: p.memberName, subject: p.subject },
  }),
  announce_returned: (p: { memberName: string; subject: string; comment: string }): ShapedEmail => ({
    variant: 'announce_returned',
    merge: { memberName: p.memberName, subject: p.subject, comment: p.comment },
  }),
  link_help_request_resolution: (p: { memberName: string; displayDecision: string; note: string }): ShapedEmail => ({
    variant: 'link_help_request_resolution',
    merge: { memberName: p.memberName, displayDecision: p.displayDecision, note: p.note },
  }),
  // The lost administrator is not named at all: this fans out to the whole
  // admin list, and who it was and why belong on the item's page the link
  // leads to, not in a broadcast.
  admin_loss_recruitment: (p: { itemUrl: string }): ShapedEmail => ({
    variant: 'admin_loss_recruitment',
    merge: { itemUrl: p.itemUrl },
  }),
  admin_queue_digest: (p: { openCount: number; itemLines: string; queueUrl: string }): ShapedEmail => ({
    variant: 'admin_queue_digest',
    merge: { countPhrase: openItemPhrase(p.openCount), itemLines: p.itemLines, queueUrl: p.queueUrl },
  }),
  // Goes to an area's group address, never to a member; its lines name each
  // item's task and link to it, like the per-administrator digest.
  admin_queue_topic_digest: (p: {
    areaLabel: string;
    openCount: number;
    itemLines: string;
    queueUrl: string;
  }): ShapedEmail => ({
    variant: 'admin_queue_topic_digest',
    merge: { areaLabel: p.areaLabel, countPhrase: itemPhrase(p.openCount), itemLines: p.itemLines, queueUrl: p.queueUrl },
  }),
  work_queue_topic_route_disabled: (p: { areaLabel: string }): ShapedEmail => ({
    variant: 'work_queue_topic_route_disabled',
    merge: { areaLabel: p.areaLabel },
  }),
  // The reporter learns the outcome only. The administrator's reason is
  // addressed to the uploader, so it never reaches this message.
  media_report_outcome_reporter: (p: { removed: boolean }): ShapedEmail => ({
    variant: 'media_report_outcome_reporter',
    merge: { decisionSentence: p.removed ? 'removed it.' : 'decided to leave it up.' },
  }),
  // The receipt a reporter is owed when the report is filed, so they know it
  // reached a person. It names nothing about the item or its uploader.
  media_report_received_reporter: (_p: Empty): ShapedEmail => ({
    variant: 'media_report_received_reporter',
    merge: {},
  }),
  admin_queue_stale_escalation: (p: {
    taskLabel: string;
    kindLabel: string;
    ageDays: number;
    itemUrl: string;
  }): ShapedEmail => ({
    variant: 'admin_queue_stale_escalation',
    merge: { taskLabel: p.taskLabel, kindLabel: p.kindLabel, agePhrase: dayPhrase(p.ageDays), itemUrl: p.itemUrl },
  }),
};

export type EmailTemplateKey = keyof typeof SHAPERS;
export type TemplateParams<K extends EmailTemplateKey> = Parameters<(typeof SHAPERS)[K]>[0];

/** Shape a logical email's typed params into its variant key and merge map. */
export function shapeEmail<K extends EmailTemplateKey>(template: K, params: TemplateParams<K>): ShapedEmail {
  const shaper = SHAPERS[template] as (p: TemplateParams<K>) => ShapedEmail;
  return shaper(params);
}

/** The logical send keys, sorted, for catalog-style sweeps. */
export function listEmailLogicalKeys(): EmailTemplateKey[] {
  return Object.keys(SHAPERS).sort() as EmailTemplateKey[];
}

/** The registered variant template keys, sorted, for the admin email-log filter. */
export function listEmailTemplateKeys(): string[] {
  return Object.keys(TEMPLATE_VARIANTS).sort();
}

/** Declared merge-field set for a variant key; null when unregistered. */
export function emailTemplateMergeFields(key: string): readonly string[] | null {
  return key in TEMPLATE_VARIANTS ? TEMPLATE_VARIANTS[key as EmailTemplateVariantKey].mergeFields : null;
}

/** Registry-default PII classification for a variant key; null when unregistered. */
export function emailTemplateDefaultClassification(key: string): EmailPiiClass | null {
  return key in TEMPLATE_VARIANTS ? TEMPLATE_VARIANTS[key as EmailTemplateVariantKey].classification : null;
}
