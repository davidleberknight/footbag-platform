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
import { createTestSessionJwt, insertSystemConfig } from '../fixtures/factories';

const OWNER_SLUG = 'don_route_owner';
const OTHER_SLUG = 'don_route_other';
const CONCURRENT_SLUG = 'don_route_concurrent';
const BAP_SLUG = 'don_route_bap';
const OWNER = `member_persona_${OWNER_SLUG}`;
const OTHER = `member_persona_${OTHER_SLUG}`;
const CONCURRENT = `member_persona_${CONCURRENT_SLUG}`;
const BAP_ONLY = `member_persona_${BAP_SLUG}`;
const REPEAT_SLUG = 'don_route_repeat';
const REPEAT_REC_SLUG = 'don_route_repeat_rec';
const RL_SLUG = 'don_route_rl';
const REPEAT = `member_persona_${REPEAT_SLUG}`;
const REPEAT_REC = `member_persona_${REPEAT_REC_SLUG}`;
const RL = `member_persona_${RL_SLUG}`;
const NOTE_SLUG = 'don_route_note';
const NOTE_DONOR = `member_persona_${NOTE_SLUG}`;

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ttlSeconds: 24 * 60 * 60 })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, {
    slug: OWNER_SLUG,
    displayName: 'Route Owner',
    tier: 'tier1',
    honors: { hof: true },
    testingUsage: 'Donation route fixture.',
    coverageNotes: ['donation routes owner, holds an honor, which prefills nothing'],
  });
  seedPersona(db, {
    slug: OTHER_SLUG,
    displayName: 'Route Other',
    tier: 'tier1',
    testingUsage: 'Donation route fixture.',
    coverageNotes: ['donation routes non-owner, holds no honor'],
  });
  seedPersona(db, {
    slug: CONCURRENT_SLUG,
    displayName: 'Route Concurrent',
    tier: 'tier1',
    testingUsage: 'Donation route fixture.',
    coverageNotes: ['donation routes owner for the simultaneous-cancel check'],
  });
  seedPersona(db, {
    slug: BAP_SLUG,
    displayName: 'Route Big Add Posse',
    tier: 'tier1',
    honors: { bap: true },
    testingUsage: 'Donation route fixture.',
    coverageNotes: ['donation routes member holding only the Big Add Posse honor'],
  });
  for (const [slug, note] of [
    [REPEAT_SLUG, 'one-time gift submitted twice'],
    [REPEAT_REC_SLUG, 'recurring gift submitted twice'],
    [RL_SLUG, 'repeated gifts against the hourly attempt limit'],
    [NOTE_SLUG, 'gift whose typed note is cleaned before it is stored'],
  ] as const) {
    seedPersona(db, {
      slug,
      displayName: `Route ${slug}`,
      tier: 'tier1',
      testingUsage: 'Donation route fixture.',
      coverageNotes: [`donation routes member for a ${note}`],
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The prefilled value of the donation note field, so an assertion reads the
 *  field itself rather than any text elsewhere on the page. */
function noteValue(html: string): string | undefined {
  return /<input[^>]*\bid="note"[^>]*\bvalue="([^"]*)"/s.exec(html)?.[1];
}

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

  // Every donation is a gift to IFPA, so the note starts empty whatever honor
  // the member holds: a prefilled fund would designate a gift the donor never
  // designated.
  it('starts the note empty for every member, Hall of Fame and Big Add Posse members included', async () => {
    const hof = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(OWNER));
    expect(hof.status).toBe(200);
    expect(noteValue(hof.text) ?? '').toBe('');
    const bap = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(BAP_ONLY));
    expect(bap.status).toBe(200);
    expect(noteValue(bap.text) ?? '').toBe('');
    const none = await plainRequest(createApp()).get('/donate').set('Cookie', cookie(OTHER));
    expect(none.status).toBe(200);
    expect(noteValue(none.text) ?? '').toBe('');
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

/** What a donation attempt writes for one member: unresolved one-time rows,
 *  unresolved recurring rows, checkout-started audit rows, and outbox rows. */
function donationFootprint(memberId: string): {
  pendingPayments: number; incompleteSubscriptions: number; audits: number; outbox: number;
} {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const n = (sql: string): number => (db.prepare(sql).get(memberId) as { c: number }).c;
    return {
      pendingPayments: n(
        `SELECT COUNT(*) AS c FROM payments
          WHERE member_id = ? AND payment_type = 'donation' AND status = 'pending'`,
      ),
      incompleteSubscriptions: n(
        `SELECT COUNT(*) AS c FROM recurring_donation_subscriptions
          WHERE member_id = ? AND status = 'incomplete'`,
      ),
      audits: n(
        `SELECT COUNT(*) AS c FROM audit_entries
          WHERE action_type = 'payment.donation_checkout_started' AND actor_member_id = ?`,
      ),
      outbox: n(`SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?`),
    };
  } finally {
    db.close();
  }
}

describe('the donor\'s typed note', () => {
  const donate = (body: Record<string, string>) => request(createApp())
    .post('/donate')
    .set('Cookie', cookie(NOTE_DONOR))
    .type('form')
    .send(body);
  const storedNotes = (amountCents: number): Array<string | null> => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      return (db.prepare(
        `SELECT donation_note FROM payments
          WHERE member_id = ? AND payment_type = 'donation' AND amount_cents = ?`,
      ).all(NOTE_DONOR, amountCents) as Array<{ donation_note: string | null }>)
        .map((r) => r.donation_note);
    } finally {
      db.close();
    }
  };
  // A tag, a C1 control character, a decomposed accent and a line break, each
  // of which the write-time cleaner removes or repairs on a one-line field.
  const DIRTY_NOTE = 'For the <b>youth</b>\u009b fund Café\r\nnow';
  const CLEAN_NOTE = 'For the youth fund Café now';

  // Defect caught: markup, control characters or a decomposed accent the donor
  // typed are stored on the gift and sent to the provider as typed.
  it('stores the note cleaned', async () => {
    const res = await donate({ amountChoice: '2500', recurring: 'no', note: DIRTY_NOTE });
    expect(res.status).toBe(303);
    expect(storedNotes(2500)).toEqual([CLEAN_NOTE]);
  });

  // Defect caught: a note of markup alone is stored as an empty-looking note
  // rather than as no note at all.
  it('stores no note when the note is only markup', async () => {
    const res = await donate({ amountChoice: '5000', recurring: 'no', note: '<b> </b>' });
    expect(res.status).toBe(303);
    expect(storedNotes(5000)).toEqual([null]);
  });

  // Defect caught: the repeat lookup compares the raw resubmission with the
  // cleaned stored note, so a double-click whose text differs only in what the
  // cleaner removes opens a second checkout the donor could also pay.
  it('takes a resubmitted note that cleans to the stored note as the same gift', async () => {
    const first = await donate({ amountChoice: '10000', recurring: 'no', note: DIRTY_NOTE });
    expect(first.status).toBe(303);
    const afterFirst = donationFootprint(NOTE_DONOR);
    const second = await donate({
      amountChoice: '10000', recurring: 'no', note: DIRTY_NOTE.replace('<b>', '<em>'),
    });
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(donationFootprint(NOTE_DONOR)).toEqual(afterFirst);
  });
});

describe('a donation submitted twice', () => {
  const donate = (memberId: string, body: Record<string, string>) => request(createApp())
    .post('/donate')
    .set('Cookie', cookie(memberId))
    .type('form')
    .send(body);

  // Defect caught: a double-click on Donate opens a second checkout at the
  // provider, leaving two pending gifts a donor could both pay, or records the
  // attempt twice.
  it('a one-time gift repeated returns to the checkout the first opened and writes nothing', async () => {
    const body = { amountChoice: '2500', recurring: 'no', note: 'For the youth fund' };
    const first = await donate(REPEAT, body);
    expect(first.status).toBe(303);
    expect(first.headers.location).toMatch(/\/payments\/checkout\//);
    const afterFirst = donationFootprint(REPEAT);
    expect(afterFirst.pendingPayments).toBe(1);

    const second = await donate(REPEAT, body);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(donationFootprint(REPEAT)).toEqual(afterFirst);
  });

  // Defect caught: a repeated recurring signup opens a second yearly
  // subscription checkout, so a donor who completes both is billed twice a
  // year.
  it('a recurring gift repeated returns to the checkout the first opened and writes nothing', async () => {
    const body = { amountChoice: '5000', recurring: 'yes', note: 'Yearly support' };
    const first = await donate(REPEAT_REC, body);
    expect(first.status).toBe(303);
    const afterFirst = donationFootprint(REPEAT_REC);
    expect(afterFirst.incompleteSubscriptions).toBe(1);

    const second = await donate(REPEAT_REC, body);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(donationFootprint(REPEAT_REC)).toEqual(afterFirst);
  });

  // Defect caught: a donor who changes the amount after backing out is sent
  // to the old checkout for the old amount instead of a new one.
  it('a different amount, or a different note, opens a new checkout', async () => {
    for (const recurring of ['no', 'yes']) {
      const base = { amountChoice: '2500', recurring, note: `For the youth fund ${recurring}` };
      const first = await donate(REPEAT, base);
      const otherAmount = await donate(REPEAT, { ...base, amountChoice: '10000' });
      const otherNote = await donate(REPEAT, { ...base, note: `For the worlds fund ${recurring}` });
      expect(otherAmount.status).toBe(303);
      expect(otherNote.status).toBe(303);
      const locations = new Set([first, otherAmount, otherNote].map((r) => r.headers.location));
      expect(locations.size, `recurring=${recurring}`).toBe(3);
    }
  });

  // Defect caught: a donor whose first checkout has closed at the provider is
  // sent back to a dead checkout page instead of a fresh one.
  it('opens a new checkout once the first has closed at the provider', async () => {
    const mod = await import('../../src/adapters/paymentAdapter');
    mod.getPaymentAdapter();
    const stub = mod.getStubPaymentAdapterForTests()!;
    // The provider reports these sessions closed (expired or completed).
    const closed = new Set<string>();
    mod.setPaymentAdapterForTests({
      ...stub,
      async openCheckoutUrl(sessionId: string) {
        return closed.has(sessionId) ? null : stub.openCheckoutUrl(sessionId);
      },
    });
    try {
      for (const recurring of ['no', 'yes']) {
        const body = { amountChoice: '7500', recurring, note: `closed-session ${recurring}` };
        const first = await donate(REPEAT, body);
        expect(first.status).toBe(303);
        closed.add(String(first.headers.location).split('/').pop()!);
        const before = donationFootprint(REPEAT);

        const second = await donate(REPEAT, body);
        expect(second.status).toBe(303);
        expect(second.headers.location, `recurring=${recurring}`).not.toBe(first.headers.location);
        expect(donationFootprint(REPEAT).audits).toBe(before.audits + 1);
      }
    } finally {
      mod.resetPaymentAdapterForTests();
    }
  });

  // Defect caught: a gift paid at the provider whose confirmation has not
  // arrived, submitted again, either opens a second checkout or fails with a
  // server error, instead of telling the donor it is still being confirmed.
  it('a gift resubmitted after paying, before its confirmation, is told it is still confirming', async () => {
    const mod = await import('../../src/adapters/paymentAdapter');
    mod.getPaymentAdapter();
    const stub = mod.getStubPaymentAdapterForTests()!;
    const body = { amountChoice: '2500', recurring: 'no', note: 'paid, not yet confirmed' };
    const first = await donate(REPEAT, body);
    expect(first.status).toBe(303);
    stub.buildSignedStubWebhookEvent(String(first.headers.location).split('/').pop()!);
    const before = donationFootprint(REPEAT);

    const second = await donate(REPEAT, body);
    expect(second.status).toBe(422);
    expect(second.text).toContain('We are still confirming your last donation checkout. Please try again in a few minutes.');
    expect(donationFootprint(REPEAT)).toEqual(before);
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
// id, which a recurring checkout never writes. Defect caught: both answering 404
// for a recurring checkout, which a test asserting only that the POST redirects
// towards checkout never sees, because it never renders the destination.
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

// Cancelling stops money, so the history page's control opens a confirm page and
// only that page's button posts. The confirm page is as owner-scoped as the
// action it guards, and answers every refusal with the same 404.
describe('GET /members/:memberKey/recurring-donations/:stripeSubscriptionId/cancel (confirm step)', () => {
  it('links the history page control to the confirm page instead of posting the cancel', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OTHER);
    const res = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/payments`)
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(res.text).toContain(`<a href="/members/${OTHER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel" class="btn btn-outline btn-sm">Cancel Recurring Donation</a>`);
    expect(res.text).not.toMatch(new RegExp(`<form[^>]*action="/members/${OTHER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel"`));
  });

  it('shows the owner the donation and the consequence, and posts only from its own button', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OTHER);
    const path = `/members/${OTHER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`;
    const res = await plainRequest(createApp()).get(path).set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    // The member reads a consequence before the final button, not an empty box.
    expect(res.text).toMatch(/<p class="notice notice-warn" role="alert">[^<]{20,}<\/p>/);
    // The donation named is the one the history page lists, amount for amount.
    const historyRow = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/payments`)
      .set('Cookie', cookie(OTHER));
    const amount = historyRow.text.match(/<td>([^<]+) each year<\/td>/)?.[1] ?? '';
    expect(amount).not.toBe('');
    expect(res.text).toContain(`${amount} each year`);
    expect(res.text).toMatch(new RegExp(`<form method="POST" action="${path}"[^>]*>\\s*<button type="submit" class="btn btn-outline">Cancel Recurring Donation</button>`));
    expect(res.text).toContain(`href="/members/${OTHER_SLUG}/payments"`);
    // Opening the confirm page cancels nothing: the history still offers the control.
    const history = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/payments`)
      .set('Cookie', cookie(OTHER));
    expect(history.text).toContain(`${path}" class="btn btn-outline btn-sm"`);
  });

  it('404s another member, another member path, an unknown id, and a donation already ending', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OWNER);
    const asOther = await plainRequest(createApp())
      .get(`/members/${OWNER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OTHER));
    expect(asOther.status).toBe(404);
    const otherPath = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OTHER));
    expect(otherPath.status).toBe(404);
    // The owner, aiming at their own subscription through someone else's path:
    // the path names the member being acted on, so it must be the signed-in one.
    const ownerOnOtherPath = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(ownerOnOtherPath.status).toBe(404);
    const unknown = await plainRequest(createApp())
      .get(`/members/${OWNER_SLUG}/recurring-donations/sub_nope/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(unknown.status).toBe(404);

    await request(createApp())
      .post(`/members/${OWNER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    const ending = await plainRequest(createApp())
      .get(`/members/${OWNER_SLUG}/recurring-donations/${stripeSubscriptionId}/cancel`)
      .set('Cookie', cookie(OWNER));
    expect(ending.status).toBe(404);
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await plainRequest(createApp())
      .get(`/members/${OWNER_SLUG}/recurring-donations/sub_any/cancel`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });
});

describe('GET /members/:memberKey/payments with recurring donations', () => {
  it('shows the donation with a cancel control while it is live', async () => {
    const stripeSubscriptionId = await liveSubscriptionFor(OTHER);
    const res = await plainRequest(createApp())
      .get(`/members/${OTHER_SLUG}/payments`)
      .set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
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

// Kept last: this block lowers donation_rate_limit_per_hour through
// system_config, a latest-effective value that would otherwise throttle the
// donation posts of every describe after it.
describe('a repeated donation and the hourly attempt limit', () => {
  // Defect caught: a double-click spends one of the donor's checkout attempts,
  // so a donor who double-clicked is refused a later genuine gift, or a donor
  // at the limit who re-posts is refused a checkout that is already open.
  it('a repeat spends no attempt, one-time or recurring', async () => {
    const seedDb = new BetterSqlite3(dbPath);
    insertSystemConfig(seedDb, { config_key: 'donation_rate_limit_per_hour', value_json: '2' });
    seedDb.close();
    const rl = await import('../../src/services/rateLimitService');
    rl.resetRateLimitForTests();
    try {
      const donate = (body: Record<string, string>) => request(createApp())
        .post('/donate')
        .set('Cookie', cookie(RL))
        .type('form')
        .send(body);
      const oneTime = { amountChoice: '2500', recurring: 'no', note: 'limit one-time' };
      const yearly = { amountChoice: '2500', recurring: 'yes', note: 'limit yearly' };

      const first = await donate(oneTime);
      expect(first.status).toBe(303);
      expect((await donate(oneTime)).headers.location).toBe(first.headers.location);

      // The second and last attempt is still free after the repeat above.
      const firstYearly = await donate(yearly);
      expect(firstYearly.status).toBe(303);

      // At the limit, repeats of either still return to their open checkout.
      const repeatYearly = await donate(yearly);
      expect(repeatYearly.status).toBe(303);
      expect(repeatYearly.headers.location).toBe(firstYearly.headers.location);
      const repeatOneTime = await donate(oneTime);
      expect(repeatOneTime.status).toBe(303);
      expect(repeatOneTime.headers.location).toBe(first.headers.location);

      // A genuinely new gift is held to the limit.
      const fresh = await donate({ ...oneTime, amountChoice: '10000' });
      expect(fresh.status).toBe(429);
      expect(fresh.headers['retry-after']).toBeDefined();
    } finally {
      rl.resetRateLimitForTests();
    }
  });
});
