import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as emailContent from '../../src/services/emailContent';
import {
  accountVerifyEmail,
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
  type EmailContent,
} from '../../src/services/emailContent';

// The catalog is the single registry of every email the platform promises to
// send. Each entry names the content builder, a sample input, and the services
// whose code must actually invoke that builder. The sweep below asserts each
// builder produces a valid message, each is invoked by every owning service
// (so a promised-but-never-sent email fails the suite), and that no exported
// builder is missing from the catalog (so adding email content forces both a
// catalog entry and a live send site).
interface CatalogEntry {
  builder: (input?: never) => EmailContent;
  sample: unknown;
  services: string[];
}

const CATALOG: CatalogEntry[] = [
  // identityAccessService — transactional security mail.
  { builder: accountVerifyEmail as never, sample: { verifyUrl: 'https://x/verify/t', ttlHours: 24 }, services: ['identityAccessService'] },
  { builder: legacyClaimConfirmEmail as never, sample: { confirmUrl: 'https://x/claim/t', ttlHours: 24 }, services: ['identityAccessService'] },
  { builder: passwordChangedEmail as never, sample: undefined, services: ['identityAccessService'] },
  { builder: passwordResetRequestEmail as never, sample: { resetUrl: 'https://x/reset/t', ttlHours: 1 }, services: ['identityAccessService'] },
  { builder: passwordResetConfirmEmail as never, sample: undefined, services: ['identityAccessService'] },
  { builder: mailboxLinkConfirmEmail as never, sample: { verifyUrl: 'https://x/anchors/verify/t', ttlHours: 24 }, services: ['identityAccessService'] },
  // Shared admin-alerts fan-out, sent from three services.
  { builder: adminQueueAlertEmail as never, sample: { taskType: 't', entityId: 'e' }, services: ['identityAccessService', 'contactRequestService', 'operationsPlatformService'] },
  // contactRequestService — member-facing resolution reply.
  { builder: contactRequestResolutionEmail as never, sample: { memberName: 'M', displayDecision: 'D', note: 'n' }, services: ['contactRequestService'] },
  // clubService / clubCleanupService — club operational notifications.
  { builder: clubMembershipMemberEmail as never, sample: { kind: 'join', memberName: 'M', clubName: 'C' }, services: ['clubService'] },
  { builder: clubMembershipLeaderEmail as never, sample: { kind: 'leave', leaderName: 'L', memberName: 'M', clubName: 'C' }, services: ['clubService'] },
  { builder: clubVolunteerLeadershipEmail as never, sample: { leaderName: 'L', joinerName: 'J', clubName: 'C' }, services: ['clubService'] },
  { builder: clubCoLeaderInviteEmail as never, sample: { inviteeName: 'I', clubName: 'C' }, services: ['clubService'] },
  { builder: clubLeaderlessContactEmail as never, sample: { memberName: 'M', clubName: 'C' }, services: ['clubCleanupService'] },
  // Membership, Active Player, payment notifications.
  { builder: activePlayerExpiryReminderEmail as never, sample: { displayDate: 'January 1, 2030', isDayOf: false }, services: ['activePlayerExpiryService'] },
  { builder: paymentReceiptEmail as never, sample: { descriptor: 'd', amountDisplay: '$1.00 USD', outcome: 'succeeded', isMembership: true, purchasedTier: 'tier1', referenceId: 'r' }, services: ['paymentService'] },
  { builder: vouchConfirmationEmail as never, sample: { voucherName: 'V', expiryDate: '2030-01-01' }, services: ['activePlayerService'] },
  { builder: honorCongratulationEmail as never, sample: { honor: 'hof', staysTier3: false }, services: ['membershipTieringService'] },
  { builder: tierChangeNoticeEmail as never, sample: { newTier: 'tier1', reasonText: 'r' }, services: ['membershipTieringService'] },
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

  it('every catalogued builder is invoked by each of its owning services (the firing sweep)', () => {
    for (const entry of CATALOG) {
      for (const svc of entry.services) {
        const src = serviceSource(svc);
        expect(
          src.includes(`${entry.builder.name}(`),
          `${svc} does not invoke ${entry.builder.name}() — a promised email with no live send site`,
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
