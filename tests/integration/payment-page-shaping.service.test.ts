/**
 * PaymentService member-facing page-shaping contract.
 *
 * The checkout / success / cancel / payment-history view-models are composed in
 * the service (`get<Page>Page()`), not the controller. These tests assert the
 * shape each method returns: US-mandated tier copy, amount formatting, derived
 * hrefs, and the cancel reason→message mapping. The controller is HTTP glue and
 * passes these through unaugmented, so the route tests cover the wiring; this
 * file locks the shaping contract directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertPayment,
  insertRecurringDonationSubscription,
} from '../fixtures/factories';
import type { PaymentRow } from '../../src/services/paymentService';

const { dbPath } = setTestEnv('3061');

// Dynamic import after setTestEnv so db.ts binds to the test database (a static
// top-level import would initialize the singleton before FOOTBAG_DB_PATH is set).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let pay: typeof import('../../src/services/paymentService');
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  pay = await import('../../src/services/paymentService');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function membershipRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay_test_1',
    created_at: '2025-01-01T00:00:00.000Z',
    member_id: 'm_shape',
    payment_type: 'membership',
    amount_cents: 1000,
    currency: 'usd',
    status: 'pending',
    descriptor: 'Membership: Tier 1 IFPA Member',
    stripe_payment_intent_id: 'pi_test_1',
    stripe_checkout_session_id: 'cs_test_1',
    stripe_invoice_id: null,
    recurring_subscription_id: null,
    purchased_tier_status: 'tier1',
    last_stripe_event_created: null,
    ...overrides,
  };
}

describe('paymentService.getCheckoutPage', () => {
  it('shapes the confirm page with derived hrefs and uppercased amount', () => {
    const vm = pay.paymentService.getCheckoutPage(membershipRow());
    expect(vm.page.pageKey).toBe('payment_checkout');
    expect(vm.content).toMatchObject({
      sessionId: 'cs_test_1',
      descriptor: 'Membership: Tier 1 IFPA Member',
      amountCents: 1000,
      currency: 'usd',
      amountDisplay: '$10.00 USD',
      confirmHref: '/payments/checkout/cs_test_1/confirm',
      cancelHref: '/payments/checkout/cs_test_1/cancel',
      tier: 'tier1',
    });
  });
});

describe('paymentService.getPaymentSuccessPage', () => {
  it('renders tier-1 activation copy and passes continueHref through', () => {
    const vm = pay.paymentService.getPaymentSuccessPage(membershipRow({ status: 'succeeded' }), '/members/won');
    expect(vm.page.pageKey).toBe('payment_success');
    expect(vm.content.message).toBe('Tier 1 IFPA Member activated!');
    expect(vm.content.benefits).toContain('vote in IFPA elections');
    expect(vm.content.continueHref).toBe('/members/won');
    expect(vm.content.amountDisplay).toBe('$10.00 USD');
  });

  it('renders tier-2 organizer copy for a tier2 purchase', () => {
    const vm = pay.paymentService.getPaymentSuccessPage(
      membershipRow({ status: 'succeeded', amount_cents: 5000, purchased_tier_status: 'tier2' }),
      '/members/tu',
    );
    expect(vm.content.message).toBe('Tier 2 IFPA Organizer Member activated!');
    expect(vm.content.benefits).toContain('event sanctioning');
    expect(vm.content.amountDisplay).toBe('$50.00 USD');
  });

  it('renders generic copy with no benefits for a non-membership payment', () => {
    const vm = pay.paymentService.getPaymentSuccessPage(
      membershipRow({ status: 'succeeded', payment_type: 'donation', purchased_tier_status: null }),
      '/members/donna',
    );
    expect(vm.content.message).toBe('Payment received.');
    expect(vm.content.benefits).toBe('');
  });
});

describe('paymentService.getPaymentCancelPage', () => {
  it('maps a failed payment to the failed reason + retry form fields', () => {
    const vm = pay.paymentService.getPaymentCancelPage(
      membershipRow({ status: 'failed' }),
      { continueHref: '/members/won', slug: 'won' },
    );
    expect(vm.page.pageKey).toBe('payment_cancel');
    expect(vm.content.reason).toBe('failed');
    expect(vm.content.message).toBe('Your payment could not be completed. Your membership tier has not changed.');
    expect(vm.content.tryAgain).toEqual({
      action: '/members/won/purchase-tier',
      tier: 'tier1',
      returnTo: '/members/won',
    });
  });

  it('maps a canceled payment to the canceled reason', () => {
    const vm = pay.paymentService.getPaymentCancelPage(
      membershipRow({ status: 'canceled' }),
      { continueHref: '/members/won', slug: 'won' },
    );
    expect(vm.content.reason).toBe('canceled');
    expect(vm.content.message).toBe('Your payment was not completed. Your membership tier has not changed.');
  });

  it('maps a missing payment to unknown reason with no retry form', () => {
    const vm = pay.paymentService.getPaymentCancelPage(null, { continueHref: '/members/won', slug: 'won' });
    expect(vm.content.reason).toBe('unknown');
    expect(vm.content.tryAgain).toBeNull();
  });

  // A donor was not changing a membership tier, so telling them it is unchanged
  // answers a question they did not ask and leaves the one they did ask, whether
  // they were charged, unanswered.
  it('tells a donor they were not charged, not that their tier is unchanged', () => {
    const donation = membershipRow({
      status: 'canceled',
      payment_type: 'donation',
      purchased_tier_status: null,
    });
    const vm = pay.paymentService.getPaymentCancelPage(
      donation,
      { continueHref: '/members/won', slug: 'won' },
    );
    expect(vm.content.message).toBe('Your payment was not completed. You have not been charged.');
    expect(vm.content.message).not.toMatch(/membership tier/);
    expect(vm.content.tryAgain).toBeNull();
  });

  it('uses the same donor wording on a failed donation', () => {
    const donation = membershipRow({
      status: 'failed',
      payment_type: 'donation',
      purchased_tier_status: null,
    });
    const vm = pay.paymentService.getPaymentCancelPage(
      donation,
      { continueHref: '/members/won', slug: 'won' },
    );
    expect(vm.content.message).toBe('Your payment could not be completed. You have not been charged.');
    expect(vm.content.message).not.toMatch(/membership tier/);
  });
});

describe('paymentService.getPaymentHistoryPage', () => {
  it('shapes owner payment history rows with formatted date + amount', () => {
    insertMember(db, { id: 'm_hist', slug: 'hist_owner' });
    insertPayment(db, { member_id: 'm_hist', amount_cents: 1000, currency: 'usd', status: 'succeeded', descriptor: 'Membership: Tier 1 IFPA Member' });
    insertPayment(db, { member_id: 'm_hist', amount_cents: 5000, currency: 'usd', status: 'refunded', descriptor: 'Membership: Tier 2 IFPA Organizer Member' });

    const vm = pay.paymentService.getPaymentHistoryPage('m_hist', 'hist_owner');
    expect(vm.page.pageKey).toBe('member_payment_history');
    expect(vm.content.memberKey).toBe('hist_owner');
    expect(vm.content.rows).toHaveLength(2);
    for (const row of vm.content.rows) {
      expect(row.date).toBe('2025-01-01');
      expect(row.amountDisplay).toMatch(/^\$\d+\.\d{2} USD$/);
    }
    // Plain words, never the stored status code.
    expect(vm.content.rows.map((r) => r.statusLabel).sort()).toEqual(['Paid', 'Refunded']);
  });

  it('returns an empty rows array for a member with no payments', () => {
    insertMember(db, { id: 'm_empty', slug: 'empty_owner' });
    const vm = pay.paymentService.getPaymentHistoryPage('m_empty', 'empty_owner');
    expect(vm.content.rows).toEqual([]);
  });

  it('includes a stable payment reference (the payment id) on each row', () => {
    insertMember(db, { id: 'm_ref', slug: 'ref_owner' });
    const payId = insertPayment(db, { member_id: 'm_ref', amount_cents: 1000, currency: 'usd', status: 'succeeded', descriptor: 'Membership: Tier 1 IFPA Member' });
    const vm = pay.paymentService.getPaymentHistoryPage('m_ref', 'ref_owner');
    expect(vm.content.rows).toHaveLength(1);
    expect(vm.content.rows[0].reference).toBe(payId);
  });

  it('names the payment type in its own column, for every type', () => {
    insertMember(db, { id: 'm_types', slug: 'types_owner' });
    insertPayment(db, {
      member_id: 'm_types', payment_type: 'membership', created_at: '2025-03-01T00:00:00.000Z',
      descriptor: 'Membership: Tier 1 IFPA Member',
    });
    insertPayment(db, {
      member_id: 'm_types', payment_type: 'donation', created_at: '2025-02-01T00:00:00.000Z',
      descriptor: 'Donation',
    });
    insertPayment(db, {
      member_id: 'm_types', payment_type: 'event_registration', created_at: '2025-01-15T00:00:00.000Z',
      descriptor: 'Event Registration: Worlds 2027',
    });

    const rows = pay.paymentService.getPaymentHistoryPage('m_types', 'types_owner').content.rows;
    expect(rows.map((r) => r.typeLabel)).toEqual(['Membership', 'Donation', 'Event Registration']);
  });

  it('shows the note the member left on a donation, and leaves it empty elsewhere', () => {
    insertMember(db, { id: 'm_note', slug: 'note_owner' });
    insertPayment(db, {
      member_id: 'm_note', payment_type: 'donation', created_at: '2025-02-01T00:00:00.000Z',
      descriptor: 'Donation: HoF Fund', donation_note: 'HoF Fund',
    });
    insertPayment(db, {
      member_id: 'm_note', payment_type: 'membership', created_at: '2025-01-01T00:00:00.000Z',
      descriptor: 'Membership: Tier 1 IFPA Member',
    });

    const rows = pay.paymentService.getPaymentHistoryPage('m_note', 'note_owner').content.rows;
    expect(rows[0].noteDisplay).toBe('HoF Fund');
    // The note has its own column now, so the item cell does not repeat it.
    expect(rows[0].descriptor).toBe('Donation');
    expect(rows[1].noteDisplay).toBe('');
  });

  it('distinguishes a subscription setup from its later annual renewals', () => {
    insertMember(db, { id: 'm_sub', slug: 'sub_owner' });
    const subId = insertRecurringDonationSubscription(db, {
      member_id: 'm_sub', donation_comment: 'BAP Fund',
    });
    insertPayment(db, {
      member_id: 'm_sub', payment_type: 'donation', created_at: '2025-01-01T00:00:00.000Z',
      descriptor: 'Recurring Annual Donation: BAP Fund', donation_note: 'BAP Fund',
      recurring_subscription_id: subId,
    });
    insertPayment(db, {
      member_id: 'm_sub', payment_type: 'donation', created_at: '2026-01-01T00:00:00.000Z',
      descriptor: 'Recurring Annual Donation: BAP Fund', donation_note: 'BAP Fund',
      recurring_subscription_id: subId,
    });
    insertPayment(db, {
      member_id: 'm_sub', payment_type: 'donation', created_at: '2027-01-01T00:00:00.000Z',
      descriptor: 'Recurring Annual Donation: BAP Fund', donation_note: 'BAP Fund',
      recurring_subscription_id: subId,
    });

    // Newest first, so the setup charge is the last row.
    const rows = pay.paymentService.getPaymentHistoryPage('m_sub', 'sub_owner').content.rows;
    expect(rows.map((r) => r.descriptor)).toEqual([
      'Recurring Annual Donation (annual renewal)',
      'Recurring Annual Donation (annual renewal)',
      'Recurring Annual Donation (first payment)',
    ]);
  });

  it('keeps each subscription own setup charge separate when a member holds two', () => {
    insertMember(db, { id: 'm_two', slug: 'two_owner' });
    const older = insertRecurringDonationSubscription(db, { member_id: 'm_two' });
    const newer = insertRecurringDonationSubscription(db, { member_id: 'm_two' });
    insertPayment(db, {
      member_id: 'm_two', payment_type: 'donation', created_at: '2025-01-01T00:00:00.000Z',
      descriptor: 'Recurring Annual Donation', recurring_subscription_id: older,
    });
    insertPayment(db, {
      member_id: 'm_two', payment_type: 'donation', created_at: '2026-01-01T00:00:00.000Z',
      descriptor: 'Recurring Annual Donation', recurring_subscription_id: older,
    });
    // Opened later than the other subscription's renewal, so an ordering rule
    // that ignored which subscription a charge belongs to would call this one a
    // renewal too.
    insertPayment(db, {
      member_id: 'm_two', payment_type: 'donation', created_at: '2026-06-01T00:00:00.000Z',
      descriptor: 'Recurring Annual Donation', recurring_subscription_id: newer,
    });

    const rows = pay.paymentService.getPaymentHistoryPage('m_two', 'two_owner').content.rows;
    expect(rows.map((r) => r.descriptor)).toEqual([
      'Recurring Annual Donation (first payment)',
      'Recurring Annual Donation (annual renewal)',
      'Recurring Annual Donation (first payment)',
    ]);
  });

  it('leaves a one-time donation unqualified, since it has no cycle', () => {
    insertMember(db, { id: 'm_once', slug: 'once_owner' });
    insertPayment(db, {
      member_id: 'm_once', payment_type: 'donation', created_at: '2025-01-01T00:00:00.000Z',
      descriptor: 'Donation: In memory of a friend', donation_note: 'In memory of a friend',
    });

    const rows = pay.paymentService.getPaymentHistoryPage('m_once', 'once_owner').content.rows;
    expect(rows[0].descriptor).toBe('Donation');
    expect(rows[0].noteDisplay).toBe('In memory of a friend');
  });
});
