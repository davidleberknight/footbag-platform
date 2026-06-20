import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3973');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
// Plain supertest (NOT supertestWithOrigin): real Stripe webhook deliveries are
// server-to-server and send no Origin header. Posting without one is the
// faithful representation and the regression guard for the origin-pin exemption.
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const M_HAPPY = 'sig-happy';
const M_PAYLOAD = 'sig-tamper-payload';
const M_SIG = 'sig-tamper-sig';
const M_EXPIRED = 'sig-expired';
const M_MISSING = 'sig-missing';
const M_CTRL_OK = 'sig-ctrl-ok';
const M_CTRL_BAD = 'sig-ctrl-bad';
const M_CTRL_REACH = 'sig-ctrl-reach';
const M_REPLAY = 'sig-replay';
const M_ATOMIC = 'sig-atomic';
const M_XBIND_ROW = 'sig-xbind-row';
const M_XBIND_META = 'sig-xbind-meta';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [i, id] of [M_HAPPY, M_PAYLOAD, M_SIG, M_EXPIRED, M_MISSING, M_CTRL_OK, M_CTRL_BAD, M_CTRL_REACH, M_REPLAY, M_ATOMIC, M_XBIND_ROW, M_XBIND_META].entries()) {
    insertMember(db, { id, slug: `sig_${i}`, display_name: `Sig ${i}`, login_email: `sig${i}@example.com` });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

// Starts a real pending membership purchase and returns the signed success
// event the stub adapter produces, plus the parsed event id and intent id.
async function startSignedSuccess(memberId: string): Promise<{
  rawBody: string;
  signature: string;
  eventId: string;
  paymentId: string;
}> {
  const { paymentService } = await import('../../src/services/paymentService');
  const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
  getPaymentAdapter();
  const result = await paymentService.startMembershipPurchase(memberId, 'tier1', `/members/x`);
  const stub = getStubPaymentAdapterForTests()!;
  const { rawBody, signature } = stub.buildSignedStubWebhookEvent(result.sessionId);
  const eventId = (JSON.parse(rawBody) as { id: string }).id;
  return { rawBody, signature, eventId, paymentId: result.paymentId };
}

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

describe('Stripe webhook signature verification (real verifier, signed stub)', () => {
  it('happy path: a correctly-signed event processes and grants the tier', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { rawBody, signature, paymentId } = await startSignedSuccess(M_HAPPY);

    const outcome = paymentService.handleWebhook(rawBody, signature);
    expect(outcome).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('succeeded');
      const tier = db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(M_HAPPY) as { tier_status: string };
      expect(tier.tier_status).toBe('tier1');
    } finally {
      db.close();
    }
  });

  it('tampered payload: same signature over a mutated body is rejected, no state written', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { WebhookSignatureError } = await import('../../src/adapters/stripeWebhook');
    const { rawBody, signature, eventId, paymentId } = await startSignedSuccess(M_PAYLOAD);

    // Mutate the body after signing; the HMAC no longer matches.
    const tampered = rawBody.replace('payment_intent.succeeded', 'payment_intent.succeeded ');
    expect(() => paymentService.handleWebhook(tampered, signature)).toThrow(WebhookSignatureError);

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('pending');
      const ev = db.prepare('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?').get(eventId) as { c: number };
      expect(ev.c).toBe(0);
    } finally {
      db.close();
    }
  });

  it('tampered signature: a forged Stripe-Signature header is rejected, no state written', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { WebhookSignatureError } = await import('../../src/adapters/stripeWebhook');
    const { rawBody, eventId, paymentId } = await startSignedSuccess(M_SIG);

    expect(() => paymentService.handleWebhook(rawBody, 't=1700000000,v1=deadbeefdeadbeef')).toThrow(WebhookSignatureError);

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('pending');
      const ev = db.prepare('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?').get(eventId) as { c: number };
      expect(ev.c).toBe(0);
    } finally {
      db.close();
    }
  });

  it('expired timestamp: a signature older than the tolerance window is rejected', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { WebhookSignatureError, signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const { rawBody } = await startSignedSuccess(M_EXPIRED);

    // Re-sign the same body with a timestamp 10 minutes in the past (default
    // Stripe tolerance is 5 minutes).
    const tenMinAgo = Math.floor(Date.now() / 1000) - 600;
    const expiredSig = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET, tenMinAgo);
    expect(() => paymentService.handleWebhook(rawBody, expiredSig)).toThrow(WebhookSignatureError);
  });

  it('missing header: an empty signature is rejected', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { WebhookSignatureError } = await import('../../src/adapters/stripeWebhook');
    const { rawBody } = await startSignedSuccess(M_MISSING);
    expect(() => paymentService.handleWebhook(rawBody, '')).toThrow(WebhookSignatureError);
  });

  it('idempotent replay: re-delivering the same signed event applies effects once', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { rawBody, signature, paymentId } = await startSignedSuccess(M_REPLAY);

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const transitions = db.prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?').get(paymentId) as { c: number };
      expect(transitions.c).toBe(1);
      const grants = db.prepare("SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code = 'purchase.tier1'").get(M_REPLAY) as { c: number };
      expect(grants.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('atomicity: a grant failure rolls back the status change AND the event claim', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const tiering = await import('../../src/services/membershipTieringService');
    const { rawBody, signature, eventId, paymentId } = await startSignedSuccess(M_ATOMIC);

    // Simulate a crash between the status transition and the grant: the whole
    // transaction (claim + status + transition + grant) must roll back.
    const spy = vi.spyOn(tiering, 'applyPurchaseGrantInTx').mockImplementationOnce(() => {
      throw new Error('simulated grant failure');
    });
    try {
      expect(() => paymentService.handleWebhook(rawBody, signature)).toThrow(/simulated grant failure/);
    } finally {
      spy.mockRestore();
    }

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('pending'); // rolled back
      const ev = db.prepare('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?').get(eventId) as { c: number };
      expect(ev.c).toBe(0); // claim rolled back -> Stripe can retry
      const transitions = db.prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?').get(paymentId) as { c: number };
      expect(transitions.c).toBe(0);
    } finally {
      db.close();
    }

    // After restoring, the redelivery succeeds cleanly.
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
  });
});

describe('POST /payments/webhook status mapping', () => {
  // Send the body as the exact string that was signed. superagent transmits a
  // string body verbatim (a Buffer would be JSON-serialized, changing the bytes
  // and breaking the signature). express.raw on the route captures it.
  function postWebhook(rawBody: string, signature: string) {
    return request(createApp())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(rawBody);
  }

  it('missing body -> 400', async () => {
    const res = await request(createApp())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'x')
      .send('');
    expect(res.status).toBe(400);
  });

  it('valid signed event -> 200 ack', async () => {
    const { rawBody, signature } = await startSignedSuccess(M_CTRL_OK);
    const res = await postWebhook(rawBody, signature);
    expect(res.status).toBe(200);
  });

  it('reachable server-to-server: no Origin header is not blocked by origin-pin', async () => {
    // postWebhook sends no Origin (plain supertest), as real Stripe does. A 403
    // here would mean the origin-pin CSRF gate is rejecting real deliveries.
    const { rawBody, signature } = await startSignedSuccess(M_CTRL_REACH);
    const res = await postWebhook(rawBody, signature);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it('bad signature -> 400, no retry value', async () => {
    const { rawBody } = await startSignedSuccess(M_CTRL_BAD);
    const res = await postWebhook(rawBody, 't=1700000000,v1=deadbeef');
    expect(res.status).toBe(400);
  });

  it('recoverable failure (no matching payment row) -> 400 so Stripe retries', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      id: 'evt_no_row',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'pi_does_not_exist', metadata: {} } },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(400);
  });

  it('deferred-intent fallback refuses to bind when the metadata names a different member', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');

    // A deferred-intent pending row: Stripe created no PaymentIntent yet, so the
    // row carries a NULL intent id and the event must be matched by metadata.
    const started = await paymentService.startMembershipPurchase(M_XBIND_ROW, 'tier1', '/members/x');
    const seedDb = openDb();
    seedDb.prepare('UPDATE payments SET stripe_payment_intent_id = NULL WHERE id = ?').run(started.paymentId);
    seedDb.close();

    // The event points its metadata paymentId at the row but claims a different
    // memberId. The row, not the metadata, owns the tier grant, so binding here
    // would attach a stranger's intent to this member's payment.
    const body = JSON.stringify({
      id: 'evt_xbind_mismatch',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_xbind_new',
          metadata: { paymentId: started.paymentId, memberId: M_XBIND_META, tier: 'tier1' },
        },
      },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    // No row matches (member mismatch), so this is recoverable: 400 -> Stripe retries.
    expect(res.status).toBe(400);

    const db = openDb();
    try {
      const row = db.prepare('SELECT status, stripe_payment_intent_id FROM payments WHERE id = ?')
        .get(started.paymentId) as { status: string; stripe_payment_intent_id: string | null };
      expect(row.status).toBe('pending');
      expect(row.stripe_payment_intent_id).toBeNull();
      const grants = db.prepare(
        "SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code = 'purchase.tier1'",
      ).get(M_XBIND_ROW) as { c: number };
      expect(grants.c).toBe(0);
    } finally {
      db.close();
    }
  });

  it('malformed event (invariant) -> 500 and alarms', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      id: 'evt_malformed',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: { metadata: {} } }, // missing object.id
    });
    expectLoggedError(/stripe webhook processing failed/);
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(500);
  });

  it('unhandled event type -> 200 ack (ignored)', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      id: 'evt_ignored',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'sub_x' } },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
  });
});
