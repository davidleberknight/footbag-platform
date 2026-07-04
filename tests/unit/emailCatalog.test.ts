import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as emailContent from '../../src/services/emailContent';
import {
  accountVerifyEmail,
  accountExistsNoticeEmail,
  legacyClaimConfirmEmail,
  passwordChangedEmail,
  passwordResetRequestEmail,
  passwordResetConfirmEmail,
  mailboxLinkConfirmEmail,
  adminQueueAlertEmail,
  contactRequestResolutionEmail,
  clubMembershipMemberEmail,
  clubMembershipLeaderEmail,
  clubVolunteerLeadershipEmail,
  clubCoLeaderInviteEmail,
  clubLeaderlessContactEmail,
  activePlayerExpiryReminderEmail,
  paymentReceiptEmail,
  vouchConfirmationEmail,
  honorCongratulationEmail,
  tierChangeNoticeEmail,
  adminRoleChangeEmail,
  type EmailContent,
} from '../../src/services/emailContent';

// The catalog is the single registry of every email the platform promises to
// send. Each entry names the content builder, a sample input, its registered
// template key, and the services that must actually send it. The sweep below
// asserts each builder produces a valid message, each has a live send site in
// every owning service (so a promised-but-never-sent email fails the suite),
// and that no exported builder is missing from the catalog (so adding email
// content forces both a catalog entry and a live send site).
interface CatalogEntry {
  builder: (input?: never) => EmailContent;
  sample: unknown;
  templateKey: string;
  services: string[];
}

const CATALOG: CatalogEntry[] = [
  // identityAccessService — transactional security mail.
  { builder: accountVerifyEmail as never, sample: { verifyUrl: 'https://x/verify/t', ttlHours: 24 }, templateKey: 'account_verify', services: ['identityAccessService'] },
  { builder: accountExistsNoticeEmail as never, sample: { loginUrl: 'https://x/login', resetUrl: 'https://x/password/forgot' }, templateKey: 'account_exists_notice', services: ['identityAccessService'] },
  { builder: legacyClaimConfirmEmail as never, sample: { confirmUrl: 'https://x/claim/t', ttlHours: 24 }, templateKey: 'legacy_claim_confirm', services: ['identityAccessService'] },
  { builder: passwordChangedEmail as never, sample: undefined, templateKey: 'password_changed', services: ['identityAccessService'] },
  { builder: passwordResetRequestEmail as never, sample: { resetUrl: 'https://x/reset/t', ttlHours: 1 }, templateKey: 'password_reset_request', services: ['identityAccessService'] },
  { builder: passwordResetConfirmEmail as never, sample: undefined, templateKey: 'password_reset_confirm', services: ['identityAccessService'] },
  { builder: mailboxLinkConfirmEmail as never, sample: { verifyUrl: 'https://x/anchors/verify/t', ttlHours: 24 }, templateKey: 'mailbox_link_confirm', services: ['identityAccessService'] },
  // Admin-alerts fan-out, sent from the single work-queue enqueue path.
  { builder: adminQueueAlertEmail as never, sample: { taskType: 't', entityId: 'e' }, templateKey: 'admin_queue_alert', services: ['workQueueService'] },
  // contactRequestService — member-facing resolution reply.
  { builder: contactRequestResolutionEmail as never, sample: { memberName: 'M', displayDecision: 'D', note: 'n' }, templateKey: 'contact_request_resolution', services: ['contactRequestService'] },
  // clubService / clubCleanupService — club operational notifications.
  { builder: clubMembershipMemberEmail as never, sample: { kind: 'join', memberName: 'M', clubName: 'C' }, templateKey: 'club_membership_member', services: ['clubService'] },
  { builder: clubMembershipLeaderEmail as never, sample: { kind: 'leave', leaderName: 'L', memberName: 'M', clubName: 'C' }, templateKey: 'club_membership_leader', services: ['clubService'] },
  { builder: clubVolunteerLeadershipEmail as never, sample: { leaderName: 'L', joinerName: 'J', clubName: 'C' }, templateKey: 'club_volunteer_leadership', services: ['clubService'] },
  { builder: clubCoLeaderInviteEmail as never, sample: { inviteeName: 'I', clubName: 'C' }, templateKey: 'club_coleader_invite', services: ['clubService'] },
  { builder: clubLeaderlessContactEmail as never, sample: { memberName: 'M', clubName: 'C' }, templateKey: 'club_leaderless_contact', services: ['clubCleanupService'] },
  // Membership, Active Player, payment notifications.
  { builder: activePlayerExpiryReminderEmail as never, sample: { displayDate: 'January 1, 2030', isDayOf: false }, templateKey: 'active_player_expiry_reminder', services: ['activePlayerExpiryService'] },
  { builder: paymentReceiptEmail as never, sample: { descriptor: 'd', amountDisplay: '$1.00 USD', outcome: 'succeeded', isMembership: true, purchasedTier: 'tier1', referenceId: 'r' }, templateKey: 'payment_receipt', services: ['paymentService'] },
  { builder: vouchConfirmationEmail as never, sample: { voucherName: 'V', expiryDate: '2030-01-01' }, templateKey: 'vouch_confirmation', services: ['activePlayerService'] },
  { builder: honorCongratulationEmail as never, sample: { honor: 'hof', staysTier3: false }, templateKey: 'honor_congratulation', services: ['membershipTieringService'] },
  { builder: tierChangeNoticeEmail as never, sample: { newTier: 'tier1', reasonText: 'r' }, templateKey: 'tier_change_notice', services: ['membershipTieringService'] },
  { builder: adminRoleChangeEmail as never, sample: { action: 'granted' }, templateKey: 'admin_role_change', services: ['membershipTieringService'] },
];

function serviceSource(name: string): string {
  return readFileSync(join(process.cwd(), 'src', 'services', `${name}.ts`), 'utf8');
}

describe('email catalog', () => {
  it('every builder produces a non-empty subject and a string body', () => {
    for (const entry of CATALOG) {
      const content = (entry.builder as (i: unknown) => EmailContent)(entry.sample);
      expect(typeof content.subject, entry.builder.name).toBe('string');
      expect(content.subject.length, entry.builder.name).toBeGreaterThan(0);
      expect(typeof content.bodyText, entry.builder.name).toBe('string');
      expect(content.bodyText.length, entry.builder.name).toBeGreaterThan(0);
    }
  });

  it('every catalogued email has a live send site in each of its owning services (the firing sweep)', () => {
    for (const entry of CATALOG) {
      for (const svc of entry.services) {
        const src = serviceSource(svc);
        // A send site is the owning service actually sending the email: either a
        // send through the email service by its registered template key, or a
        // direct builder call. Either proves the promised email is sent.
        const hasSendSite =
          src.includes(`'${entry.templateKey}'`) || src.includes(`${entry.builder.name}(`);
        expect(
          hasSendSite,
          `${svc} has no live send site for ${entry.templateKey} (no '${entry.templateKey}' template send and no ${entry.builder.name}() call)`,
        ).toBe(true);
      }
    }
  });

  it('no exported email builder is missing from the catalog', () => {
    const cataloged = new Set(CATALOG.map((e) => e.builder.name));
    const exportedBuilders = Object.entries(emailContent)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    for (const name of exportedBuilders) {
      expect(cataloged.has(name), `${name} is exported from emailContent but not in EMAIL_CATALOG`).toBe(true);
    }
    // And every catalog entry points at a real export.
    for (const name of cataloged) {
      expect(exportedBuilders, `${name} is in the catalog but not exported from emailContent`).toContain(name);
    }
  });
});
