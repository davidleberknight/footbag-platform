import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  shapeEmail,
  listEmailLogicalKeys,
  listEmailTemplateKeys,
  emailTemplateMergeFields,
  type EmailTemplateKey,
  type EmailTemplateVariantKey,
} from '../../src/services/emailTemplateRegistry';

// The catalog is the single registry of every email the platform promises to
// send. Each entry names the logical send key, the services that must actually
// send it, and sample params covering EVERY variant key the shaper can select.
// The sweeps below assert each sample shapes to its expected variant with
// exactly the variant's declared merge fields, each logical email has a live
// send site in every owning service (so a promised-but-never-sent email fails
// the suite), every registered logical key is catalogued, and every registered
// variant key is reachable from some shaper input.
interface CatalogEntry {
  template: EmailTemplateKey;
  services: string[];
  samples: Array<{ params: unknown; variant: EmailTemplateVariantKey }>;
}

const CATALOG: CatalogEntry[] = [
  // identityAccessService — transactional security mail.
  { template: 'account_verify', services: ['identityAccessService'], samples: [
    { params: { verifyUrl: 'https://x/verify/t', ttlHours: 24 }, variant: 'account_verify' },
  ] },
  { template: 'account_exists_notice', services: ['identityAccessService'], samples: [
    { params: { loginUrl: 'https://x/login', resetUrl: 'https://x/password/forgot' }, variant: 'account_exists_notice' },
  ] },
  { template: 'legacy_claim_confirm', services: ['identityAccessService'], samples: [
    { params: { confirmUrl: 'https://x/claim/t', ttlHours: 24 }, variant: 'legacy_claim_confirm' },
  ] },
  { template: 'password_changed', services: ['identityAccessService'], samples: [
    { params: {}, variant: 'password_changed' },
  ] },
  { template: 'password_reset_request', services: ['identityAccessService'], samples: [
    { params: { resetUrl: 'https://x/reset/t', ttlHours: 1 }, variant: 'password_reset_request' },
  ] },
  { template: 'password_reset_confirm', services: ['identityAccessService'], samples: [
    { params: {}, variant: 'password_reset_confirm' },
  ] },
  { template: 'mailbox_link_confirm', services: ['identityAccessService'], samples: [
    { params: { verifyUrl: 'https://x/anchors/verify/t', ttlHours: 24 }, variant: 'mailbox_link_confirm' },
  ] },
  // Admin-alerts fan-out, sent from the single work-queue enqueue path.
  { template: 'admin_queue_alert', services: ['workQueueService'], samples: [
    { params: { taskType: 't', entityId: 'e' }, variant: 'admin_queue_alert' },
  ] },
  // Routine work-queue items: the per-admin digest and the one-time stale
  // escalation, both sent from the work-queue service's scheduled passes.
  { template: 'admin_queue_digest', services: ['workQueueService'], samples: [
    { params: { openCount: 3, itemLines: 'Task type: t, Entity ID: e', queueUrl: 'https://x/admin/work-queue' }, variant: 'admin_queue_digest' },
  ] },
  { template: 'admin_queue_stale_escalation', services: ['workQueueService'], samples: [
    { params: { taskType: 't', entityId: 'e', ageDays: 3, queueUrl: 'https://x/admin/work-queue' }, variant: 'admin_queue_stale_escalation' },
  ] },
  // adminWorkQueueService — member-facing resolution reply.
  { template: 'contact_request_resolution', services: ['adminWorkQueueService'], samples: [
    { params: { memberName: 'M', displayDecision: 'D', note: 'n' }, variant: 'contact_request_resolution' },
  ] },
  // clubService / clubCleanupService — club operational notifications.
  { template: 'club_membership_member', services: ['clubService'], samples: [
    { params: { kind: 'join', memberName: 'M', clubName: 'C' }, variant: 'club_membership_member_join' },
    { params: { kind: 'leave', memberName: 'M', clubName: 'C' }, variant: 'club_membership_member_leave' },
  ] },
  { template: 'club_membership_leader', services: ['clubService'], samples: [
    { params: { kind: 'join', leaderName: 'L', memberName: 'M', clubName: 'C' }, variant: 'club_membership_leader_join' },
    { params: { kind: 'leave', leaderName: 'L', memberName: 'M', clubName: 'C' }, variant: 'club_membership_leader_leave' },
  ] },
  { template: 'club_volunteer_leadership', services: ['clubService'], samples: [
    { params: { leaderName: 'L', joinerName: 'J', clubName: 'C' }, variant: 'club_volunteer_leadership' },
  ] },
  { template: 'club_coleader_invite', services: ['clubService'], samples: [
    { params: { inviteeName: 'I', clubName: 'C' }, variant: 'club_coleader_invite' },
  ] },
  { template: 'club_leaderless_contact', services: ['clubCleanupService'], samples: [
    { params: { memberName: 'M', clubName: 'C' }, variant: 'club_leaderless_contact' },
  ] },
  // Membership, Active Player, payment notifications.
  { template: 'active_player_expiry_reminder', services: ['activePlayerExpiryService'], samples: [
    { params: { displayDate: 'January 1, 2030', isDayOf: false }, variant: 'active_player_expiry_upcoming' },
    { params: { displayDate: 'January 1, 2030', isDayOf: true }, variant: 'active_player_expiry_day_of' },
  ] },
  { template: 'payment_receipt', services: ['paymentService'], samples: [
    { params: { descriptor: 'd', amountDisplay: '$1.00 USD', outcome: 'succeeded', isMembership: true, purchasedTier: 'tier1', referenceId: 'r' }, variant: 'payment_receipt_succeeded_tier1' },
    { params: { descriptor: 'd', amountDisplay: '$1.00 USD', outcome: 'succeeded', isMembership: true, purchasedTier: 'tier2', referenceId: 'r' }, variant: 'payment_receipt_succeeded_tier2' },
    { params: { descriptor: 'd', amountDisplay: '$1.00 USD', outcome: 'succeeded', isMembership: false, purchasedTier: null, referenceId: 'r' }, variant: 'payment_receipt_succeeded' },
    { params: { descriptor: 'd', amountDisplay: '$1.00 USD', outcome: 'failed', isMembership: true, purchasedTier: 'tier1', referenceId: 'r' }, variant: 'payment_receipt_failed' },
  ] },
  { template: 'donation_subscription_started', services: ['paymentService'], samples: [
    { params: { amountDisplay: '$25.00 USD', donationNote: 'HoF Fund', referenceId: 'r' }, variant: 'donation_subscription_started' },
  ] },
  { template: 'donation_subscription_cancel_requested', services: ['paymentService'], samples: [
    { params: { amountDisplay: '$25.00 USD', donationNote: null, referenceId: 'r' }, variant: 'donation_subscription_cancel_requested' },
  ] },
  { template: 'donation_subscription_charge_failed', services: ['paymentService'], samples: [
    { params: { amountDisplay: '$25.00 USD', donationNote: null, referenceId: 'r' }, variant: 'donation_subscription_charge_failed' },
  ] },
  { template: 'donation_subscription_canceled', services: ['paymentService'], samples: [
    { params: { amountDisplay: '$25.00 USD', donationNote: 'BAP Fund', referenceId: 'r' }, variant: 'donation_subscription_canceled' },
  ] },
  { template: 'admin_recurring_donation_ended', services: ['paymentService'], samples: [
    { params: { referenceId: 'r', amountDisplay: '$25.00 USD', memberRequested: true }, variant: 'admin_recurring_donation_ended' },
  ] },
  { template: 'reconciliation_digest', services: ['paymentReconciliationService'], samples: [
    { params: { outstandingCount: 3, itemLines: '2026-07-01  payment_amount_mismatch  rec_1', reviewUrl: '/admin/payments/reconciliation' }, variant: 'reconciliation_digest' },
  ] },
  { template: 'vouch_confirmation', services: ['activePlayerService'], samples: [
    { params: { voucherName: 'V', expiryDate: '2030-01-01' }, variant: 'vouch_confirmation' },
  ] },
  { template: 'honor_congratulation', services: ['membershipTieringService'], samples: [
    { params: { honor: 'hof', staysTier3: false }, variant: 'honor_congratulation_hof' },
    { params: { honor: 'hof', staysTier3: true }, variant: 'honor_congratulation_hof_tier3' },
    { params: { honor: 'bap', staysTier3: false }, variant: 'honor_congratulation_bap' },
    { params: { honor: 'bap', staysTier3: true }, variant: 'honor_congratulation_bap_tier3' },
  ] },
  { template: 'tier_change_notice', services: ['membershipTieringService'], samples: [
    { params: { newTier: 'tier1', reasonText: 'r' }, variant: 'tier_change_notice' },
  ] },
  { template: 'admin_role_change', services: ['membershipTieringService'], samples: [
    { params: { action: 'granted' }, variant: 'admin_role_granted' },
    { params: { action: 'revoked' }, variant: 'admin_role_revoked' },
  ] },
];

function serviceSource(name: string): string {
  return readFileSync(join(process.cwd(), 'src', 'services', `${name}.ts`), 'utf8');
}

describe('email catalog', () => {
  it('every sample shapes to its expected variant with exactly the declared merge fields', () => {
    for (const entry of CATALOG) {
      for (const sample of entry.samples) {
        const shaped = shapeEmail(entry.template, sample.params as never);
        expect(shaped.variant, `${entry.template} sample`).toBe(sample.variant);
        const declared = [...(emailTemplateMergeFields(shaped.variant) ?? [])].sort();
        expect(Object.keys(shaped.merge).sort(), `${shaped.variant} merge fields`).toEqual(declared);
        for (const [token, value] of Object.entries(shaped.merge)) {
          expect(typeof value, `${shaped.variant} merge.${token}`).toBe('string');
          expect(value.length, `${shaped.variant} merge.${token}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('computed duration phrases pluralize correctly', () => {
    expect(shapeEmail('password_reset_request', { resetUrl: 'u', ttlHours: 1 }).merge.ttlPhrase).toBe('1 hour');
    expect(shapeEmail('account_verify', { verifyUrl: 'u', ttlHours: 24 }).merge.ttlPhrase).toBe('24 hours');
  });

  it('every catalogued email has a live send site in each of its owning services (the firing sweep)', () => {
    for (const entry of CATALOG) {
      for (const svc of entry.services) {
        const src = serviceSource(svc);
        // A send site is the owning service sending through the email service
        // by the logical template key, which proves the promised email is sent.
        expect(
          src.includes(`'${entry.template}'`),
          `${svc} has no live send site for ${entry.template} (no template: '${entry.template}' send)`,
        ).toBe(true);
      }
    }
  });

  it('every registered logical key is catalogued and vice versa', () => {
    const cataloged = CATALOG.map((e) => e.template).sort();
    expect(cataloged).toEqual(listEmailLogicalKeys());
  });

  it('every registered variant key is reachable from a catalogued sample', () => {
    const reachable = new Set(CATALOG.flatMap((e) => e.samples.map((s) => s.variant)));
    for (const variant of listEmailTemplateKeys()) {
      expect(reachable.has(variant as EmailTemplateVariantKey), `variant ${variant} is registered but no shaper input reaches it`).toBe(true);
    }
  });
});
