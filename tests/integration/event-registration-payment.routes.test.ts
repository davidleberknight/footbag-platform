/**
 * Registering for a paid event: the checkout, and what the payment's webhooks
 * do to the registration it pays for.
 *
 * The contract: a registration type carrying a fee is offered only once the
 * event's sanction approval has enabled payment. Registering for it writes a
 * pending registration linked to a pending payment and sends the member to
 * checkout. Only the webhook-confirmed payment confirms the registration, and
 * sends its confirmation and the receipt; an expired checkout cancels it; a
 * declined card changes nothing while the checkout stays open; a refund changes
 * nothing. The same registration submitted again returns to its open checkout,
 * a changed one releases it. A withdrawal ends an open checkout first, and a
 * checkout paid after the withdrawal settles without reinstating it. A member
 * who withdrew a paid registration registers again as that type with no second
 * charge. The payments pause and the checkout throttle refuse before anything is
 * written.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4977');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { isoDaysFromNow } from '../fixtures/clock';
import {
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
  insertEvent,
  insertEventOrganizer,
  insertDiscipline,
  insertSystemConfig,
} from '../fixtures/factories';
let createApp: Awaited<ReturnType<typeof importApp>>;
// The reason an expired checkout stores, read from the module that writes it
// once the app (and with it the database connection) has loaded.
let CHECKOUT_EXPIRED: string;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

let counter = 0;
function makeMember(): string {
  counter += 1;
  const id = `paidreg-${counter}`;
  withDb((db) => {
    createMemberAtTier(db, {
      id, slug: `paidreg_${counter}`, tier: 'tier1',
      memberOverrides: { display_name: `Payer ${counter}`, login_email: `${id}@example.com`, gender: 'female' },
    });
    completeOnboarding(db, id);
  });
  return id;
}

const COMPETITOR_FEE = 2500;
const ATTENDEE_FEE = 1000;

interface SeededEvent { id: string; key: string; singles: string; routines: string }

function seedEvent(o: { payment_enabled?: 0 | 1; attendee_fee?: boolean; attendee_free?: boolean; tshirts?: boolean } = {}): SeededEvent {
  return withDb((db) => {
    const start = isoDaysFromNow(30).slice(0, 10);
    const id = insertEvent(db, {
      title: `Paid Test ${Math.random().toString(36).slice(2, 8)}`,
      status: 'reg_open',
      registration_status: 'open',
      start_date: start,
      end_date: start,
      sanction_status: 'approved',
      payment_enabled: o.payment_enabled ?? 1,
      competitor_fee_cents: COMPETITOR_FEE,
      is_attendee_registration_open: o.attendee_fee || o.attendee_free ? 1 : 0,
      is_tshirt_size_collected: o.tshirts ? 1 : 0,
      ...(o.attendee_fee ? { attendee_fee_cents: ATTENDEE_FEE } : {}),
    });
    insertEventOrganizer(db, id, organizer);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const routines = insertDiscipline(db, id, { name: 'Open Singles Routines', discipline_category: 'freestyle', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', offers_prize_money: 1, sort_order: 2 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1), singles, routines };
  });
}

function body(o: { type?: string; divisions?: string[]; amateur?: string[]; tshirt?: string } = {}): Record<string, string | string[]> {
  return { registration_type: o.type ?? 'competitor', division: o.divisions ?? [], amateur: o.amateur ?? [], tshirt_size: o.tshirt ?? '' };
}

function post(memberId: string, path: string, form: Record<string, string | string[]> = {}) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId)).type('form').send(form);
}

function get(memberId: string, path: string) {
  return request(createApp()).get(path).set('Cookie', cookieFor(memberId));
}

interface RegRow { id: string; status: string; registration_type: string; cancel_reason: string | null; payment_id: string | null }
function registrationOf(eventId: string, memberId: string): RegRow | undefined {
  return withDb((db) => db.prepare(
    'SELECT id, status, registration_type, cancel_reason, payment_id FROM registrations WHERE event_id = ? AND member_id = ?',
  ).get(eventId, memberId) as RegRow | undefined);
}

interface PayRow { id: string; status: string; payment_type: string; amount_cents: number; currency: string; member_id: string; stripe_checkout_session_id: string }
function paymentsOf(memberId: string): PayRow[] {
  return withDb((db) => db.prepare(
    'SELECT id, status, payment_type, amount_cents, currency, member_id, stripe_checkout_session_id FROM payments WHERE member_id = ? ORDER BY created_at, id',
  ).all(memberId) as PayRow[]);
}

function paymentById(id: string): PayRow {
  return withDb((db) => db.prepare('SELECT id, status, payment_type, amount_cents, currency, member_id, stripe_checkout_session_id FROM payments WHERE id = ?').get(id) as PayRow);
}

function selectionsOf(registrationId: string): string[] {
  return withDb((db) => (db.prepare(
    'SELECT discipline_id FROM registration_discipline_selections WHERE registration_id = ? ORDER BY discipline_id',
  ).all(registrationId) as Array<{ discipline_id: string }>).map((r) => r.discipline_id));
}

function mailCount(template: string, memberId: string): number {
  return (withDb((db) => db.prepare('SELECT COUNT(*) c FROM outbox_emails WHERE template_key = ? AND recipient_member_id = ?').get(template, memberId)) as { c: number }).c;
}

function auditCount(actionType: string, memberId: string): number {
  return (withDb((db) => db.prepare(
    'SELECT COUNT(*) c FROM audit_entries WHERE action_type = ? AND actor_member_id = ?',
  ).get(actionType, memberId)) as { c: number }).c;
}

function sessionOf(res: { status: number; headers: Record<string, string> }): string {
  expect(res.status).toBe(303);
  const m = /^\/payments\/checkout\/([^/?]+)$/.exec(res.headers.location);
  expect(m, `expected a checkout redirect, got ${res.headers.location}`).not.toBeNull();
  return m![1];
}

async function stub() {
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  return mod.getStubPaymentAdapterForTests()!;
}

async function deliver(event: { rawBody: string; signature: string }) {
  return request(createApp()).post('/payments/webhook')
    .set('stripe-signature', event.signature)
    .set('content-type', 'application/json')
    .send(event.rawBody);
}

let organizer: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  organizer = makeMember();
  createApp = await importApp();
  ({ CHECKOUT_EXPIRED } = await import('../../src/services/eventRegistrationSettlement'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('offering a paid registration', () => {
  // Defect caught: a member is charged for, or registers for nothing on, an
  // event whose sanction approval has not enabled payment.
  it('offers a type carrying a fee only once payment is enabled, showing its fee', async () => {
    const m = makeMember();
    const off = seedEvent({ payment_enabled: 0 });
    const offForm = await get(m, `/events/${off.key}/register`);
    expect(offForm.status).toBe(303);
    const offPost = await post(m, `/events/${off.key}/register`, body({ divisions: [off.singles] }));
    expect(offPost.status).toBe(303);
    expect(offPost.headers.location).not.toMatch(/^\/payments\/checkout\//);
    expect(registrationOf(off.id, m)).toBeUndefined();
    expect(paymentsOf(m)).toEqual([]);

    const on = seedEvent();
    const onForm = await get(m, `/events/${on.key}/register`);
    expect(onForm.status).toBe(200);
    expect(onForm.text).toContain('$25.00 USD');
  });
});

describe('starting the checkout', () => {
  // Defect caught: the registration is confirmed before payment, or the payment
  // is not linked to it, so a webhook could never confirm it.
  it('writes a pending registration linked to a pending payment and sends the member to checkout', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles, ev.routines] })));
    const reg = registrationOf(ev.id, m)!;
    expect(reg.status).toBe('pending');
    const [pay] = paymentsOf(m);
    expect(pay).toMatchObject({
      id: reg.payment_id, status: 'pending', payment_type: 'event_registration',
      amount_cents: COMPETITOR_FEE, currency: 'USD', stripe_checkout_session_id: sessionId,
    });
    expect(selectionsOf(reg.id)).toEqual([ev.singles, ev.routines].sort());
    expect(mailCount('event_registration_confirmed', m)).toBe(0);
    // The event page offers the way back to checkout while the registration
    // waits, and stops offering it once the organizers stop registration.
    const page = await get(m, `/events/${ev.key}`);
    expect(page.text).toContain(`href="/events/${ev.key}/register"`);
    expect((await post(organizer, `/events/${ev.key}/registration-status`, { set_to: 'closed' })).status).toBe(303);
    expect((await get(m, `/events/${ev.key}`)).text).not.toContain(`href="/events/${ev.key}/register"`);
  });

  // Defect caught: a double click opens a second checkout, so the member could
  // pay twice for one place.
  it('returns the same registration submitted again to its open checkout', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const first = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const second = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    expect(second).toBe(first);
    expect(paymentsOf(m)).toHaveLength(1);
    expect(auditCount('payment.checkout_started', m)).toBe(1);
  });

  // Defect caught: a changed registration is charged against the old checkout,
  // or leaves the old checkout open beside the new one.
  it('releases the open checkout when the registration changes, and opens a new one', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const first = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const second = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.routines] })));
    expect(second).not.toBe(first);
    const [old, current] = paymentsOf(m);
    expect(old).toMatchObject({ stripe_checkout_session_id: first, status: 'canceled' });
    expect(current).toMatchObject({ stripe_checkout_session_id: second, status: 'pending' });
    const reg = registrationOf(ev.id, m)!;
    expect(reg).toMatchObject({ status: 'pending', payment_id: current.id });
    expect(selectionsOf(reg.id)).toEqual([ev.routines]);
  });

  // Defect caught: a resubmit that changes only the Amateur choice or the
  // t-shirt size goes back to the old checkout, so the change is silently lost.
  it('treats a changed Amateur choice or t-shirt size as a changed registration', async () => {
    const m = makeMember();
    const ev = seedEvent({ tshirts: true });
    const first = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.routines], tshirt: 'M' })));
    const amateur = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.routines], amateur: [ev.routines], tshirt: 'M' })));
    expect(amateur).not.toBe(first);
    const size = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.routines], amateur: [ev.routines], tshirt: 'L' })));
    expect(size).not.toBe(amateur);
    expect(paymentsOf(m).map((p) => p.status)).toEqual(['canceled', 'canceled', 'pending']);
  });

  // Defect caught: a payment and its audit row commit with no registration
  // behind them when an overlapping submit already holds the registration.
  it('rolls the payment back when the registration writer reports another submit got there first', async () => {
    const m = makeMember();
    const { paymentService } = await import('../../src/services/paymentService');
    const { ConflictError } = await import('../../src/services/serviceErrors');
    await expect(paymentService.startEventRegistrationPayment({
      memberId: m, amountCents: COMPETITOR_FEE, currency: 'USD', descriptor: 'Event Registration: Overlap (Competitor)',
      returnTo: '/events', openPaymentId: null, samePurchase: false,
      writeRegistration: () => false, findOpenPaymentId: () => null,
    })).rejects.toBeInstanceOf(ConflictError);
    expect(paymentsOf(m)).toEqual([]);
    expect(auditCount('payment.checkout_started', m)).toBe(0);
  });
});

describe('settling the checkout', () => {
  // Defect caught: a member who paid is left pending, or is not told.
  it('confirms the registration on payment and sends the confirmation and the receipt', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const done = await post(m, `/payments/checkout/${sessionId}/confirm`);
    expect(done.status).toBe(303);
    const reg = registrationOf(ev.id, m)!;
    expect(reg.status).toBe('confirmed');
    expect(paymentById(reg.payment_id!).status).toBe('succeeded');
    expect(mailCount('event_registration_confirmed', m)).toBe(1);
    expect(mailCount('payment_receipt_succeeded', m)).toBe(1);
  });

  // Defect caught: a redelivered settlement sends the confirmation twice.
  it('acts once on a redelivered settlement', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const event = (await stub()).buildSignedStubWebhookEvent(sessionId);
    expect((await deliver(event)).status).toBe(200);
    expect((await deliver(event)).status).toBe(200);
    expect(registrationOf(ev.id, m)!.status).toBe('confirmed');
    expect(mailCount('event_registration_confirmed', m)).toBe(1);
  });

  // Defect caught: a doubles partner is told they were named while the entry
  // is still unpaid and may never stand, or is never told once it is paid.
  it('tells a named doubles partner only once the payment settles', async () => {
    const m = makeMember();
    const partner = makeMember();
    const ev = seedEvent();
    const doubles = withDb((db) => insertDiscipline(db, ev.id, {
      name: "Open Women's Doubles Footbag Net", discipline_category: 'net', team_type: 'doubles',
      gender_eligibility: 'women', division_class: 'open', sort_order: 3,
    }));
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, {
      ...body({ divisions: [doubles] }), partner_division: [doubles], partner: [partner],
    }));
    expect(mailCount('event_partner_named', partner)).toBe(0);
    expect((await deliver((await stub()).buildSignedStubWebhookEvent(sessionId))).status).toBe(200);
    expect(registrationOf(ev.id, m)!.status).toBe('confirmed');
    expect(mailCount('event_partner_named', partner)).toBe(1);
  });

  // Defect caught: an abandoned checkout leaves a registration pending forever.
  it('cancels the pending registration when its checkout expires, and lets the member register again', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const first = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    expect((await post(m, `/payments/checkout/${first}/cancel`)).status).toBe(303);
    const reg = registrationOf(ev.id, m)!;
    expect(reg).toMatchObject({ status: 'canceled', cancel_reason: CHECKOUT_EXPIRED });
    expect(paymentById(reg.payment_id!).status).toBe('canceled');
    expect(selectionsOf(reg.id)).toEqual([ev.singles]);

    const again = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    expect(again).not.toBe(first);
    const after = registrationOf(ev.id, m)!;
    expect(after.id).toBe(reg.id);
    expect(after.status).toBe('pending');
    expect(after.payment_id).not.toBe(reg.payment_id);
  });

  // Defect caught: a declined card cancels the registration, so the member's
  // next card cannot complete it; or the decline email sends them elsewhere.
  it('leaves the registration pending on a declined card', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    await post(m, `/payments/checkout/${sessionId}/decline`);
    const reg = registrationOf(ev.id, m)!;
    expect(reg.status).toBe('pending');
    expect(paymentById(reg.payment_id!).status).toBe('pending');
    expect(mailCount('payment_receipt_failed_event_registration', m)).toBe(1);
  });

  // Defect caught: a release that reaches a payment the webhook already settled
  // records it canceled, so the books say a paid place was never paid for.
  it('changes nothing when a release reaches a settled payment', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    await post(m, `/payments/checkout/${sessionId}/confirm`);
    const reg = registrationOf(ev.id, m)!;
    const { paymentService } = await import('../../src/services/paymentService');
    const { transaction } = await import('../../src/db/db');
    transaction(() => paymentService.releaseEventRegistrationCheckoutInTx(reg.payment_id!, m));
    expect(paymentById(reg.payment_id!).status).toBe('succeeded');
    expect(registrationOf(ev.id, m)!.status).toBe('confirmed');
    expect(auditCount('payment.canceled', m)).toBe(0);
  });

  // Defect caught: a refund issued at the provider silently cancels a place.
  it('leaves the registration confirmed when the payment is refunded', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    await post(m, `/payments/checkout/${sessionId}/confirm`);
    expect((await deliver((await stub()).buildSignedStubRefundEvent(sessionId))).status).toBe(200);
    const reg = registrationOf(ev.id, m)!;
    expect(paymentById(reg.payment_id!).status).toBe('refunded');
    expect(reg.status).toBe('confirmed');
  });
});

describe('withdrawing and registering again', () => {
  // Defect caught: a withdrawal leaves the checkout open, so the member can
  // still pay for a place they gave up.
  it('ends the open checkout of a registration waiting for payment', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    expect((await post(m, `/events/${ev.key}/withdraw`, { confirmed: '1' })).status).toBe(303);
    const reg = registrationOf(ev.id, m)!;
    expect(reg.status).toBe('canceled');
    expect(reg.cancel_reason).not.toBe(CHECKOUT_EXPIRED);
    expect(paymentById(reg.payment_id!).status).toBe('canceled');
    expect(await (await stub()).openCheckoutUrl(sessionId)).toBeNull();
  });

  // Defect caught: a checkout paid as the member withdrew reinstates the
  // registration they withdrew, or the money goes unrecorded.
  it('settles a checkout paid after the withdrawal without reinstating the registration', async () => {
    const m = makeMember();
    const ev = seedEvent();
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const paid = (await stub()).buildSignedStubWebhookEvent(sessionId);
    await post(m, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    expect((await deliver(paid)).status).toBe(200);
    const reg = registrationOf(ev.id, m)!;
    expect(reg.status).toBe('canceled');
    expect(paymentById(reg.payment_id!).status).toBe('succeeded');
    expect(mailCount('event_registration_confirmed', m)).toBe(0);
  });

  // Defect caught: a member who paid, withdrew and came back is charged a
  // second time, or switches to another type on the first payment.
  it('registers a member who withdrew a paid registration again as that type with no new charge', async () => {
    const m = makeMember();
    const ev = seedEvent({ attendee_fee: true });
    const sessionId = sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    await post(m, `/payments/checkout/${sessionId}/confirm`);
    const paidId = registrationOf(ev.id, m)!.payment_id;
    await post(m, `/events/${ev.key}/withdraw`, { confirmed: '1' });

    const otherType = await post(m, `/events/${ev.key}/register`, body({ type: 'attendee_supporter' }));
    expect(otherType.status).not.toBe(303);
    expect(registrationOf(ev.id, m)!.status).toBe('canceled');

    const back = await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] }));
    expect(back.status).toBe(303);
    expect(back.headers.location).toBe(`/events/${ev.key}`);
    expect(registrationOf(ev.id, m)).toMatchObject({ status: 'confirmed', payment_id: paidId });
    expect(paymentsOf(m)).toHaveLength(1);
  });

  // Defect caught: switching to a free type leaves the paid checkout open.
  it('releases the open checkout when the member switches to a free type', async () => {
    const m = makeMember();
    const ev = seedEvent({ attendee_free: true });
    sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const free = await post(m, `/events/${ev.key}/register`, body({ type: 'attendee_supporter' }));
    expect(free.status).toBe(303);
    expect(free.headers.location).toBe(`/events/${ev.key}`);
    const reg = registrationOf(ev.id, m)!;
    expect(reg).toMatchObject({ status: 'confirmed', registration_type: 'attendee_supporter' });
    expect(paymentById(reg.payment_id!).status).toBe('canceled');
  });
});

// Kept last: these rows change runtime configuration every later case would read.
describe('refusals before anything is written', () => {
  // Defect caught: the checkout throttle is missing, so a burst piles up
  // provider sessions.
  it('throttles checkout attempts', async () => {
    withDb((db) => insertSystemConfig(db, { config_key: 'event_registration_rate_limit_per_hour', value_json: '1' }));
    const m = makeMember();
    const ev = seedEvent();
    sessionOf(await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] })));
    const limited = await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.routines] }));
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(paymentsOf(m)).toHaveLength(1);
  });

  // Defect caught: the payments pause does not stop event checkouts.
  it('refuses while payments are paused', async () => {
    withDb((db) => insertSystemConfig(db, { config_key: 'payments_paused', value_json: '1' }));
    const m = makeMember();
    const ev = seedEvent();
    const res = await post(m, `/events/${ev.key}/register`, body({ divisions: [ev.singles] }));
    expect(res.status).toBe(503);
    expect(registrationOf(ev.id, m)).toBeUndefined();
    expect(paymentsOf(m)).toEqual([]);
  });
});
