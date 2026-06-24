import { describe, it, expect } from 'vitest';
import {
  vouchConfirmationEmail,
  honorCongratulationEmail,
  tierChangeNoticeEmail,
  activePlayerExpiryReminderEmail,
  paymentReceiptEmail,
  clubMembershipMemberEmail,
  clubMembershipLeaderEmail,
  accountVerifyEmail,
  passwordResetRequestEmail,
  contactRequestResolutionEmail,
} from '../../src/services/emailContent';

describe('vouchConfirmationEmail', () => {
  it('interpolates the voucher name and expiry, and states the Tier 1 benefit', () => {
    const c = vouchConfirmationEmail({ voucherName: 'Jane Voucher', expiryDate: '2028-01-15' });
    expect(c.subject).toBe('You have received Active Player status');
    expect(c.bodyText).toContain('from Jane Voucher.');
    expect(c.bodyText).toContain('active until 2028-01-15.');
    expect(c.bodyText).toContain('Tier 1 benefits while current');
  });

  it('preserves unicode in the voucher name verbatim', () => {
    const name = 'Bélanger ‮rtl‬';
    const c = vouchConfirmationEmail({ voucherName: name, expiryDate: '2028-01-15' });
    expect(c.bodyText).toContain(name);
  });
});

describe('honorCongratulationEmail', () => {
  it('Hall of Fame, not Tier 3: grants Tier 2 outright', () => {
    const c = honorCongratulationEmail({ honor: 'hof', staysTier3: false });
    expect(c.bodyText).toContain('Hall of Fame');
    expect(c.bodyText).toContain('grants you Tier 2 IFPA membership');
    expect(c.bodyText).not.toContain('underlying');
  });

  it('Big Add Posse, not Tier 3: names the Big Add Posse', () => {
    const c = honorCongratulationEmail({ honor: 'bap', staysTier3: false });
    expect(c.bodyText).toContain('Big Add Posse');
  });

  it('Tier 3 recipient: words the honor as the underlying tier, not a current-tier change', () => {
    const c = honorCongratulationEmail({ honor: 'hof', staysTier3: true });
    expect(c.bodyText).toContain('underlying');
    expect(c.bodyText).not.toContain('grants you Tier 2 IFPA membership');
  });
});

describe('tierChangeNoticeEmail', () => {
  it('maps the tier key to its label and includes the reason', () => {
    const c = tierChangeNoticeEmail({ newTier: 'tier2', reasonText: 'complimentary access' });
    expect(c.subject).toBe('Your IFPA membership status was updated');
    expect(c.bodyText).toContain('Membership tier: Tier 2 (IFPA Organizer Member)');
    expect(c.bodyText).toContain('Reason: complimentary access');
  });

  it('renders the tier0 and tier3 labels', () => {
    expect(tierChangeNoticeEmail({ newTier: 'tier0', reasonText: 'x' }).bodyText)
      .toContain('Membership tier: Tier 0');
    expect(tierChangeNoticeEmail({ newTier: 'tier3', reasonText: 'x' }).bodyText)
      .toContain('Tier 3 (IFPA Director)');
  });

  it('preserves a multi-line reason verbatim', () => {
    const reason = 'line one\nline two';
    expect(tierChangeNoticeEmail({ newTier: 'tier1', reasonText: reason }).bodyText).toContain(reason);
  });
});

describe('activePlayerExpiryReminderEmail', () => {
  it('day-of reminder uses the "expires today" subject', () => {
    const c = activePlayerExpiryReminderEmail({ displayDate: 'March 3, 2030', isDayOf: true });
    expect(c.subject).toBe('Your IFPA Active Player status expires today');
    expect(c.bodyText).toContain('expires on March 3, 2030.');
  });

  it('advance reminder uses the "about to expire" subject', () => {
    const c = activePlayerExpiryReminderEmail({ displayDate: 'March 3, 2030', isDayOf: false });
    expect(c.subject).toBe('Your IFPA Active Player status is about to expire');
  });
});

describe('paymentReceiptEmail', () => {
  it('succeeded membership tier1: confirms Tier 1 is active', () => {
    const c = paymentReceiptEmail({ descriptor: 'IFPA Tier 1', amountDisplay: '$20.00 USD', outcome: 'succeeded', isMembership: true, purchasedTier: 'tier1', referenceId: 'pay_1' });
    expect(c.subject).toBe('Payment received: IFPA Tier 1');
    expect(c.bodyText).toContain('Tier 1 IFPA Member status is now active');
    expect(c.bodyText).toContain('Reference: pay_1');
  });

  it('succeeded membership tier2: confirms Tier 2 is active', () => {
    const c = paymentReceiptEmail({ descriptor: 'IFPA Tier 2', amountDisplay: '$40.00 USD', outcome: 'succeeded', isMembership: true, purchasedTier: 'tier2', referenceId: 'pay_2' });
    expect(c.bodyText).toContain('Tier 2 IFPA Organizer Member status is now active');
  });

  it('succeeded non-membership: no tier-confirmation line', () => {
    const c = paymentReceiptEmail({ descriptor: 'Donation', amountDisplay: '$5.00 USD', outcome: 'succeeded', isMembership: false, purchasedTier: null, referenceId: 'pay_3' });
    expect(c.bodyText).toContain('Thank you for your payment.');
    expect(c.bodyText).not.toContain('is now active');
  });

  it('failed: states no charge applied and uses the failed subject', () => {
    const c = paymentReceiptEmail({ descriptor: 'IFPA Tier 1', amountDisplay: '$20.00 USD', outcome: 'failed', isMembership: true, purchasedTier: 'tier1', referenceId: 'pay_4' });
    expect(c.subject).toBe('Payment failed: IFPA Tier 1');
    expect(c.bodyText).toContain('No charge was applied');
    expect(c.bodyText).not.toContain('is now active');
  });
});

describe('club membership emails — both sides of the join/leave switch', () => {
  it('member join vs leave switches the verb and subject', () => {
    const join = clubMembershipMemberEmail({ kind: 'join', memberName: 'M', clubName: 'Shred Club' });
    expect(join.subject).toBe('You joined Shred Club');
    expect(join.bodyText).toContain('you joined the club "Shred Club"');
    const leave = clubMembershipMemberEmail({ kind: 'leave', memberName: 'M', clubName: 'Shred Club' });
    expect(leave.subject).toBe('You left Shred Club');
    expect(leave.bodyText).toContain('you left the club "Shred Club"');
  });

  it('leader join vs leave names the member and switches the verb', () => {
    const join = clubMembershipLeaderEmail({ kind: 'join', leaderName: 'L', memberName: 'Pat', clubName: 'Shred Club' });
    expect(join.subject).toBe('Pat joined Shred Club');
    expect(join.bodyText).toContain('Pat joined your club "Shred Club"');
    const leave = clubMembershipLeaderEmail({ kind: 'leave', leaderName: 'L', memberName: 'Pat', clubName: 'Shred Club' });
    expect(leave.subject).toBe('Pat left Shred Club');
    expect(leave.bodyText).toContain('Pat left your club "Shred Club"');
  });
});

describe('link-bearing security emails', () => {
  it('accountVerifyEmail carries the link and pluralizes the TTL hours', () => {
    expect(accountVerifyEmail({ verifyUrl: 'https://h/verify/tok', ttlHours: 24 }).bodyText)
      .toContain('expires in 24 hours');
    const one = accountVerifyEmail({ verifyUrl: 'https://h/verify/tok', ttlHours: 1 });
    expect(one.bodyText).toContain('expires in 1 hour.');
    expect(one.bodyText).toContain('https://h/verify/tok');
  });

  it('passwordResetRequestEmail carries the reset link within the TTL window', () => {
    const c = passwordResetRequestEmail({ resetUrl: 'https://h/reset/tok', ttlHours: 1 });
    expect(c.bodyText).toContain('within 1 hour');
    expect(c.bodyText).toContain('https://h/reset/tok');
  });

  it('contactRequestResolutionEmail interpolates decision and admin note verbatim', () => {
    const c = contactRequestResolutionEmail({ memberName: 'Sam', displayDecision: 'Approved', note: 'see you there\nthanks' });
    expect(c.subject).toBe('Your IFPA contact request: Approved');
    expect(c.bodyText).toContain('Hi Sam,');
    expect(c.bodyText).toContain('see you there\nthanks');
  });
});
