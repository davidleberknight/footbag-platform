/**
 * Donation routes: the member-facing donations page, the checkout POST, and the
 * owner-only recurring-donation cancel action.
 *
 * These are signed-in surfaces. The cancel action is owner-scoped and answers a
 * mismatch with 404 rather than 403, so it cannot be used to discover another
 * member's donations, and every state-changing verb is origin-pinned.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4033');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import plainRequest from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { seedPersona } from '../../src/testkit/personaFactory';
import { createTestSessionJwt } from '../fixtures/factories';

const OWNER_SLUG = 'don_route_owner';
const OTHER_SLUG = 'don_route_other';
const CONCURRENT_SLUG = 'don_route_concurrent';
const OWNER = `member_persona_${OWNER_SLUG}`;
const OTHER = `member_persona_${OTHER_SLUG}`;
const CONCURRENT = `member_persona_${CONCURRENT_SLUG}`;

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, ttlSeconds: 24 * 60 * 60 })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, {
    slug: OWNER_SLUG,
    displayName: 'Route Owner',
    tier: 'tier1',
    onboardingComplete: true,
    honors: { hof: true },
    coverageNotes: ['donation routes owner, holds an honor so the note prefills'],
  });
  seedPersona(db, {
    slug: OTHER_SLUG,
    displayName: 'Route Other',
    tier: 'tier1',
    onboardingComplete: true,
    coverageNotes: ['donation routes non-owner, holds no honor'],
  });
  seedPersona(db, {
    slug: CONCURRENT_SLUG,
    displayName: 'Route Concurrent',
    tier: 'tier1',
    onboardingComplete: true,
    coverageNotes: ['donation routes owner for the simultaneous-cancel check'],
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** Opens a recurring donation for a member and returns the Stripe subscription
 *  id the cancel route addresses. */
async function liveSubscriptionFor(memberId: string): Promise<string> {
  const { paymentService } = await import('../../src/services/paymentService');
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  const stub = mod.getStubPaymentAdapterForTests()!;
  const started = await paymentService.startDonation(memberId, 2500, null, true, '/x');
  const evt = stub.buildSignedStubWebhookEvent(started.sessionId);
  paymentService.handleWebhook(evt.rawBody, evt.signature);
  return stub.sessions.get(started.sessionId)!.stripeSubscriptionId!;
}

describe('GET /donate', () => {
  it('redirects an unauthenticated visitor to login', async () => {
    const res = await plainRequest(createApp()).get('/donate');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('renders the form with suggested amounts and the recurring choice', async () => {
    const res = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(OWNER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="amountChoice"');
    expect(res.text).toContain('name="recurring"');
    expect(res.text).toContain('name="customAmount"');
  });

  it('prefills the honor fund note for a member holding an honor', async () => {
    const res = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(OWNER));
    expect(res.text).toContain('HoF Fund');
  });

  it('leaves the note empty for a member holding no honor', async () => {
    const res = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(OTHER));
    expect(res.text).not.toContain('HoF Fund');
    expect(res.text).not.toContain('BAP Fund');
  });

  it('is marked do-not-index, being a signed-in action page rather than public content', async () => {
    const res = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(OWNER));
    expect(res.text).toContain('noindex');
  });
});

describe('POST /donate', () => {
  it('redirects to checkout for a suggested amount', async () => {
    const res = await request(createApp())
      .post('/donate')
      .set('Cookie', cookie(OTHER))
      .type('form')
      .send({ amountChoice: '2500', recurring: 'no', note: '', returnTo: `/members/${OTHER_SLUG}` });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/payments\/checkout\//);
  });

  it('accepts a custom amount entered in dollars', async () => {
    const res = await request(createApp())
      .post('/donate')
      .set('Cookie', cookie(OTHER))
      .type('form')
      .send({ amountChoice: 'custom', customAmount: '42.50', recurring: 'no' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath);
    try {
      const row = db.prepare(
        'SELECT amount_cents FROM payments WHERE member_id = ? ORDER BY rowid DESC LIMIT 1',
      ).get(OTHER) as { amount_cents: number };
      expect(row.amount_cents).toBe(4250);
    } finally {
      db.close();
    }
  });

  it('re-renders the form at 422 with the reason when the amount is unusable', async () => {
    const res = await request(createApp())
      .post('/donate')
      .set('Cookie', cookie(OTHER))
      .type('form')
      .send({ amountChoice: 'custom', customAmount: 'not-a-number', recurring: 'no' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('name="amountChoice"');
  });

  it('re-renders at 422 when no amount was chosen at all', async () => {
    const res = await request(createApp())
      .post('/donate')
      .set('Cookie', cookie(OTHER))
      .type('form')
      .send({ recurring: 'no' });
    expect(res.status).toBe(422);
  });

  it('rejects a request carrying no matching origin', async () => {
    const res = await plainRequest(createApp())
      .post('/donate')
      .set('Cookie', cookie(OTHER))
      .type('form')
      .send({ amountChoice: '2500', recurring: 'no' });
    expect(res.status).toBe(403);
  });

  it('redirects an unauthenticated post to login', async () => {
    const res = await request(createApp())
      .post('/donate')
      .type('form')
      .send({ amountChoice: '2500', recurring: 'no' });
    expect(res.status).toBe(302);
  });
});

describe('POST /members/:memberKey/recurring-donations/:stripeSubscriptionId/cancel', () => {
  it('cancels the owner own donation and returns to the history page with a confirmation', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OWNER);
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/payments`);

    const history = await plainRequest(createApp())
      .get(`/members/${OWNER_SLUG}/payments`)
      .set('Cookie', cookie(OWNER))
      .set('Cookie', [cookie(OWNER), ...(res.headers['set-cookie'] ?? [])]);
    expect(history.status).toBe(200);
  });

  it('404s a member aiming the cancel action at another member subscription', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OTHER);
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(res.status).toBe(404);
  });

  it('404s a member posting to another member history path', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OTHER);
    const res = await request(createApp())
      .post(`/members/${OTHER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(res.status).toBe(404);
  });

  it('404s an unknown subscription id', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/recurring-donations/sub_nope/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(res.status).toBe(404);
  });

  it('redirects an unauthenticated cancel to login', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/recurring-donations/sub_any/cancel`);
    expect(res.status).toBe(302);
  });

  // The eligibility check is read before the provider call, so two submits that
  // arrive together both pass it, and both are still in flight while neither has
  // written. The cancellation ledger documents one row per action and the member
  // asked once, so a double-click must not be able to write the action twice.
  //
  // Both requests are held at the provider call until each has passed its check,
  // which is the state the guard exists for; letting the provider answer in the
  // same tick would run the two requests one after the other and prove nothing.
  it('records one cancellation when two requests arrive together', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(CONCURRENT);
    const mod = await import('../../src/adapters/paymentAdapter');
    const stub = mod.getStubPaymentAdapterForTests()!;

    let waiting = 0;
    let release: (() => void) | null = null;
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    mod.setPaymentAdapterForTests({
      ...stub,
      async cancelSubscriptionAtPeriodEnd() {
        waiting += 1;
        if (waiting === 2) release!();
        await bothArrived;
      },
    });

    const app = createApp();
    const post = (): Promise<{ status: number }> =>
      request(app)
        .post(`/members/${CONCURRENT_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
        .set('Cookie', cookie(CONCURRENT));

    const [first, second] = await Promise.all([post(), post()]);
    mod.resetPaymentAdapterForTests();
    expect(waiting).toBe(2);
    expect([first.status, second.status]).toEqual([303, 303]);

    const db = new BetterSqlite3(dbPath);
    try {
      const subId = (db
        .prepare('SELECT id FROM recurring_donation_subscriptions WHERE stripe_subscription_id = ?')
        .get(stripeSubscriptionId) as { id: string }).id;
      const transitions = db.prepare(
        `SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions
         WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'cancel_requested'`,
      ).get(subId) as { c: number };
      expect(transitions.c).toBe(1);
      const audit = db.prepare(
        `SELECT COUNT(*) AS c FROM audit_entries
         WHERE action_type = 'payment.recurring_cancel_requested' AND entity_id = ?`,
      ).get(subId) as { c: number };
      expect(audit.c).toBe(1);
    } finally {
      db.close();
    }
  });
});

// The recurring flow's two page surfaces. Both resolve state by checkout-session
// id, which a recurring checkout never writes, so both used to answer 404 and
// neither had any coverage: the earlier route tests asserted only that the POST
// redirected towards checkout, never that the destination rendered.
describe('the recurring donation checkout and confirmation pages', () => {
  async function startRecurringCheckout(memberId: string): Promise<{
    sessionId: string;
    reference: string;
  }> {
    const { paymentService } = await import('../../src/services/paymentService');
    const mod = await import('../../src/adapters/paymentAdapter');
    mod.getPaymentAdapter();
    const started = await paymentService.startDonation(memberId, 2500, null, true, '/x');
    return { sessionId: started.sessionId, reference: started.reference };
  }

  it('renders the stub confirm page for a subscription session, which has no payment row', async () => {
    const { sessionId } = await startRecurringCheckout(OTHER);
    const res = await plainRequest(createApp())
      .get(`/payments/checkout/${sessionId}`)
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('each year');
    expect(res.text).toContain(`/payments/checkout/${sessionId}/confirm`);
  });

  it('404s a subscription confirm page belonging to another member', async () => {
    const { sessionId } = await startRecurringCheckout(OTHER);
    const res = await plainRequest(createApp())
      .get(`/payments/checkout/${sessionId}`)
      .set('Cookie', cookie(OWNER));
    expect(res.status).toBe(404);
  });

  it('confirms the donation on the success page once the subscription is mirrored', async () => {
    const { sessionId, reference } = await startRecurringCheckout(OTHER);
    const { paymentService } = await import('../../src/services/paymentService');
    const mod = await import('../../src/adapters/paymentAdapter');
    const stub = mod.getStubPaymentAdapterForTests()!;
    const evt = stub.buildSignedStubWebhookEvent(sessionId);
    paymentService.handleWebhook(evt.rawBody, evt.signature);

    const res = await plainRequest(createApp())
      .get(`/payments/success?session_id=${sessionId}&ref=${reference}`)
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('recurring annual donation is set up');
  });

  it('thanks the member even when the confirming webhook has not landed yet', async () => {
    // The browser redirect from checkout races the provider's webhook. Someone
    // who has just paid must never be shown a not-found page.
    const { sessionId, reference } = await startRecurringCheckout(OTHER);
    const res = await plainRequest(createApp())
      .get(`/payments/success?session_id=${sessionId}&ref=${reference}`)
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('being set up');
  });

  it('shows the generic being-set-up page for another member reference, indistinguishable from an unknown one', async () => {
    const { sessionId, reference } = await startRecurringCheckout(OTHER);
    const { paymentService } = await import('../../src/services/paymentService');
    const mod = await import('../../src/adapters/paymentAdapter');
    const stub = mod.getStubPaymentAdapterForTests()!;
    const evt = stub.buildSignedStubWebhookEvent(sessionId);
    paymentService.handleWebhook(evt.rawBody, evt.signature);

    // OWNER asks for OTHER's mirrored subscription: the page neither confirms it
    // nor 404s. It shows the same generic being-set-up page an unknown reference
    // shows, so the parameter reveals nothing about who owns a subscription.
    const foreign = await plainRequest(createApp())
      .get(`/payments/success?session_id=unknown_session&ref=${reference}`)
      .set('Cookie', cookie(OWNER));
    expect(foreign.status).toBe(200);
    expect(foreign.text).toContain('being set up');
    expect(foreign.text).not.toContain('recurring annual donation is set up');

    const unknown = await plainRequest(createApp())
      .get('/payments/success?session_id=unknown_session&ref=rds_does_not_exist')
      .set('Cookie', cookie(OWNER));
    expect(unknown.status).toBe(200);
    expect(unknown.text).toContain('being set up');
  });

  it('404s a malformed reference', async () => {
    const res = await plainRequest(createApp())
      .get('/payments/success?session_id=unknown_session&ref=../../etc/passwd')
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(404);
  });
});

describe('GET /members/:memberKey/payments with recurring donations', () => {
  it('shows the donation with a cancel control while it is live', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OTHER);
    const res = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/payments`)
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Recurring donations');
    expect(res.text).toContain('Cancel Recurring Donation');
    expect(res.text).toContain(`/recurring-donations/${stripeSubscriptionId}/cancel`);
  });

  it('replaces the cancel control with a pending notice once cancellation is requested', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OWNER);
    await request(createApp())
      .post(`/members/${OWNER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    const res = await plainRequest(createApp())
      .get(`/members/${OWNER_SLUG}/payments`)
      .set('Cookie', cookie(OWNER));
    expect(res.text).toContain('Cancellation requested');
    expect(res.text).not.toContain(`/recurring-donations/${stripeSubscriptionId}/cancel`);
  });
});
