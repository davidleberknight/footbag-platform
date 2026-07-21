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
  tier0: 'Tier 0',
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

const PAYMENT_RECEIPT_FIELDS = ['descriptor', 'amountDisplay', 'referenceId'] as const;

const RECURRING_DONATION_FIELDS = ['amountDisplay', 'notePhrase', 'referenceId'] as const;

export const TEMPLATE_VARIANTS = {
  account_verify:                  v('restricted',   ['verifyUrl', 'ttlPhrase']),
  account_exists_notice:           v('restricted',   ['loginUrl', 'resetUrl']),
  password_reset_request:          v('restricted',   ['resetUrl', 'ttlPhrase']),
  password_reset_confirm:          v('internal',     []),
  password_changed:                v('internal',     []),
  legacy_claim_confirm:            v('restricted',   ['confirmUrl', 'ttlPhrase']),
  mailbox_link_confirm:            v('restricted',   ['verifyUrl', 'ttlPhrase']),
  vouch_confirmation:              v('confidential', ['voucherName', 'expiryDate']),
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
  payment_receipt_failed:          v('confidential', PAYMENT_RECEIPT_FIELDS),
  donation_subscription_started:            v('confidential', RECURRING_DONATION_FIELDS),
  donation_subscription_cancel_requested:   v('confidential', RECURRING_DONATION_FIELDS),
  donation_subscription_charge_failed:      v('confidential', RECURRING_DONATION_FIELDS),
  donation_subscription_canceled:           v('confidential', RECURRING_DONATION_FIELDS),
  admin_recurring_donation_ended:  v('internal',     ['referenceId', 'amountDisplay', 'endReason']),
  reconciliation_digest:           v('internal',     ['countPhrase', 'itemLines', 'reviewUrl']),
  active_player_expiry_upcoming:   v('internal',     ['displayDate']),
  active_player_expiry_day_of:     v('internal',     ['displayDate']),
  club_membership_member_join:     v('confidential', ['memberName', 'clubName']),
  club_membership_member_leave:    v('confidential', ['memberName', 'clubName']),
  club_membership_leader_join:     v('confidential', ['leaderName', 'memberName', 'clubName']),
  club_membership_leader_leave:    v('confidential', ['leaderName', 'memberName', 'clubName']),
  club_volunteer_leadership:       v('confidential', ['leaderName', 'joinerName', 'clubName']),
  club_coleader_invite:            v('confidential', ['inviteeName', 'clubName']),
  club_leaderless_contact:         v('confidential', ['memberName', 'clubName']),
  contact_request_resolution:      v('confidential', ['memberName', 'displayDecision', 'note']),
  admin_queue_alert:               v('internal',     ['taskType', 'entityId']),
  admin_queue_digest:              v('internal',     ['countPhrase', 'itemLines', 'queueUrl']),
  admin_queue_stale_escalation:    v('internal',     ['taskType', 'entityId', 'agePhrase', 'queueUrl']),
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
  account_exists_notice: (p: { loginUrl: string; resetUrl: string }): ShapedEmail => ({
    variant: 'account_exists_notice',
    merge: { loginUrl: p.loginUrl, resetUrl: p.resetUrl },
  }),
  password_reset_request: (p: { resetUrl: string; ttlHours: number }): ShapedEmail => ({
    variant: 'password_reset_request',
    merge: { resetUrl: p.resetUrl, ttlPhrase: hourPhrase(p.ttlHours) },
  }),
  password_reset_confirm: (_p: Empty): ShapedEmail => ({
    variant: 'password_reset_confirm',
    merge: {},
  }),
  password_changed: (_p: Empty): ShapedEmail => ({
    variant: 'password_changed',
    merge: {},
  }),
  legacy_claim_confirm: (p: { confirmUrl: string; ttlHours: number }): ShapedEmail => ({
    variant: 'legacy_claim_confirm',
    merge: { confirmUrl: p.confirmUrl, ttlPhrase: hourPhrase(p.ttlHours) },
  }),
  mailbox_link_confirm: (p: { verifyUrl: string; ttlHours: number }): ShapedEmail => ({
    variant: 'mailbox_link_confirm',
    merge: { verifyUrl: p.verifyUrl, ttlPhrase: hourPhrase(p.ttlHours) },
  }),
  vouch_confirmation: (p: { voucherName: string; expiryDate: string }): ShapedEmail => ({
    variant: 'vouch_confirmation',
    merge: { voucherName: p.voucherName, expiryDate: p.expiryDate },
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
    outcome: 'succeeded' | 'failed';
    isMembership: boolean;
    purchasedTier: 'tier1' | 'tier2' | null;
    referenceId: string;
  }): ShapedEmail => ({
    variant: p.outcome === 'failed'
      ? 'payment_receipt_failed'
      : p.isMembership && p.purchasedTier === 'tier1'
        ? 'payment_receipt_succeeded_tier1'
        : p.isMembership && p.purchasedTier === 'tier2'
          ? 'payment_receipt_succeeded_tier2'
          : 'payment_receipt_succeeded',
    merge: { descriptor: p.descriptor, amountDisplay: p.amountDisplay, referenceId: p.referenceId },
  }),
  donation_subscription_started: (p: RecurringDonationParams): ShapedEmail => ({
    variant: 'donation_subscription_started',
    merge: recurringDonationMerge(p),
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
    itemLines: string;
    reviewUrl: string;
  }): ShapedEmail => ({
    variant: 'reconciliation_digest',
    merge: {
      countPhrase: `${p.outstandingCount} outstanding discrepanc${p.outstandingCount === 1 ? 'y' : 'ies'}`,
      itemLines: p.itemLines,
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
  club_coleader_invite: (p: { inviteeName: string; clubName: string }): ShapedEmail => ({
    variant: 'club_coleader_invite',
    merge: { inviteeName: p.inviteeName, clubName: p.clubName },
  }),
  club_leaderless_contact: (p: { memberName: string; clubName: string }): ShapedEmail => ({
    variant: 'club_leaderless_contact',
    merge: { memberName: p.memberName, clubName: p.clubName },
  }),
  contact_request_resolution: (p: { memberName: string; displayDecision: string; note: string }): ShapedEmail => ({
    variant: 'contact_request_resolution',
    merge: { memberName: p.memberName, displayDecision: p.displayDecision, note: p.note },
  }),
  admin_queue_alert: (p: { taskType: string; entityId: string }): ShapedEmail => ({
    variant: 'admin_queue_alert',
    merge: { taskType: p.taskType, entityId: p.entityId },
  }),
  admin_queue_digest: (p: { openCount: number; itemLines: string; queueUrl: string }): ShapedEmail => ({
    variant: 'admin_queue_digest',
    merge: { countPhrase: openItemPhrase(p.openCount), itemLines: p.itemLines, queueUrl: p.queueUrl },
  }),
  admin_queue_stale_escalation: (p: {
    taskType: string;
    entityId: string;
    ageDays: number;
    queueUrl: string;
  }): ShapedEmail => ({
    variant: 'admin_queue_stale_escalation',
    merge: { taskType: p.taskType, entityId: p.entityId, agePhrase: dayPhrase(p.ageDays), queueUrl: p.queueUrl },
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
