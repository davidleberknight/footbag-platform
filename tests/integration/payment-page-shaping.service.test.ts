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
import { insertMember, insertPayment } from '../fixtures/factories';
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
    member_id: 'm_shape',
    payment_type: 'membership',
    amount_cents: 1000,
    currency: 'usd',
    status: 'pending',
    descriptor: 'IFPA Tier 1 Membership',
    stripe_payment_intent_id: 'pi_test_1',
    stripe_checkout_session_id: 'cs_test_1',
    purchased_tier_status: 'tier1',
    ...overrides,
  };
}

describe('paymentService.getCheckoutPage', () => {
  it('shapes the confirm page with derived hrefs and uppercased amount', () => {
    const vm = pay.paymentService.getCheckoutPage(membershipRow());
    expect(vm.page.pageKey).toBe('payment_checkout');
    expect(vm.content).toMatchObject({
      sessionId: 'cs_test_1',
      descriptor: 'IFPA Tier 1 Membership',
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
  it('maps a failed payment to the failed reason + retry href', () => {
    const vm = pay.paymentService.getPaymentCancelPage(
      membershipRow({ status: 'failed' }),
      { continueHref: '/members/won', slug: 'won' },
    );
    expect(vm.page.pageKey).toBe('payment_cancel');
    expect(vm.content.reason).toBe('failed');
    expect(vm.content.message).toBe('Your payment could not be completed. Your membership tier has not changed.');
    expect(vm.content.tryAgainHref).toBe(
      '/members/won/purchase-tier?tier=tier1&returnTo=%2Fmembers%2Fwon',
    );
  });

  it('maps a canceled payment to the canceled reason', () => {
    const vm = pay.paymentService.getPaymentCancelPage(
      membershipRow({ status: 'canceled' }),
      { continueHref: '/members/won', slug: 'won' },
    );
    expect(vm.content.reason).toBe('canceled');
    expect(vm.content.message).toBe('Your payment was not completed. Your membership tier has not changed.');
  });

  it('maps a missing payment to unknown reason with no retry href', () => {
    const vm = pay.paymentService.getPaymentCancelPage(null, { continueHref: '/members/won', slug: 'won' });
    expect(vm.content.reason).toBe('unknown');
    expect(vm.content.tryAgainHref).toBeNull();
  });
});

describe('paymentService.getPaymentHistoryPage', () => {
  it('shapes owner payment history rows with formatted date + amount', () => {
    insertMember(db, { id: 'm_hist', slug: 'hist_owner' });
    insertPayment(db, { member_id: 'm_hist', amount_cents: 1000, currency: 'usd', status: 'succeeded', descriptor: 'IFPA Tier 1 Membership' });
    insertPayment(db, { member_id: 'm_hist', amount_cents: 5000, currency: 'usd', status: 'refunded', descriptor: 'IFPA Tier 2 Organizer Membership' });

    const vm = pay.paymentService.getPaymentHistoryPage('m_hist', 'hist_owner');
    expect(vm.page.pageKey).toBe('member_payment_history');
    expect(vm.content.memberKey).toBe('hist_owner');
    expect(vm.content.rows).toHaveLength(2);
    for (const row of vm.content.rows) {
      expect(row.date).toBe('2025-01-01');
      expect(row.amountDisplay).toMatch(/^\$\d+\.\d{2} USD$/);
    }
    expect(vm.content.rows.map((r) => r.status).sort()).toEqual(['refunded', 'succeeded']);
  });

  it('returns an empty rows array for a member with no payments', () => {
    insertMember(db, { id: 'm_empty', slug: 'empty_owner' });
    const vm = pay.paymentService.getPaymentHistoryPage('m_empty', 'empty_owner');
    expect(vm.content.rows).toEqual([]);
  });
});
