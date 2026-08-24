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
      // The money values, not only the status. This is the anchor case for the
      // whole signature suite, and a settled payment whose amount or currency
      // was wrong would have passed it while the tier was granted for the wrong
      // sum. A status assertion says the machine moved; it says nothing about
      // what was actually recorded.
      const payment = db.prepare(
        'SELECT status, amount_cents, currency, provider_livemode FROM payments WHERE id = ?',
      ).get(paymentId) as {
        status: string; amount_cents: number; currency: string; provider_livemode: number | null;
      };
      expect(payment.status).toBe('succeeded');
      expect(payment.amount_cents).toBe(1000);
      expect(payment.currency).toBe('USD');
      // The stub is by definition not live money, and a row that recorded
      // otherwise would misreport a test charge as real on every admin surface.
      expect(payment.provider_livemode).toBe(0);

      const tier = db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(M_HAPPY) as { tier_status: string };
      expect(tier.tier_status).toBe('tier1');

      // Exactly one transition row, and it is the one the ledger promises.
      const transitions = db.prepare(
        'SELECT from_status, to_status FROM payment_status_transitions WHERE payment_id = ?',
      ).all(paymentId) as { from_status: string; to_status: string }[];
      expect(transitions).toEqual([{ from_status: 'pending', to_status: 'succeeded' }]);
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

  it('a body over the parser cap is refused before any handler runs', async () => {
    // The endpoint is public and unauthenticated by design, so the body cap is
    // the only thing bounding what an arbitrary caller can make this process
    // parse. Untested, a raised or removed cap would go unnoticed until
    // something large arrived.
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const oversized = JSON.stringify({ id: 'evt_big', padding: 'x'.repeat(1_200_000) });
    const res = await postWebhook(oversized, signStripeWebhook(oversized, STUB_WEBHOOK_SECRET));
    // 413 from the parser, and in no case a 200: the delivery must not be
    // acknowledged as processed.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
  });

  it('a correctly-signed body that is not JSON is refused, not crashed on', async () => {
    // Signature verification is a byte-level HMAC, so a caller holding the
    // secret can sign anything at all. What follows must be a refusal rather
    // than an unhandled parse error: the signature proves who sent it, never
    // that the contents are a Stripe event.
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    // The refusal is an unexpected-failure 500 with an operator error line, and
    // that is the right classification: nobody but this platform and the
    // provider holds the signing secret, so a signed body that is not an event
    // means the secret has leaked or something is badly wrong. It should wake
    // somebody rather than being quietly absorbed.
    expectLoggedError(/stripe webhook processing failed/);
    const notJson = 'this is not an event at all';
    const res = await postWebhook(notJson, signStripeWebhook(notJson, STUB_WEBHOOK_SECRET));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
  });

  it('an event carrying no platform metadata is acknowledged, whatever else it lacks', async () => {
    // Ownership is decided before anything else, and an event without this
    // platform's correlation metadata is not ours: a renewal's own settlement
    // intent, or an object created in the provider's console. Acknowledging it
    // is correct — retrying could never succeed, and a multi-day retry storm
    // risks the provider disabling the endpoint for every other event too.
    //
    // Worth stating explicitly because it means the ownership check short-
    // circuits ahead of every other validation, so a malformed foreign event
    // never reaches the code that would care about its shape.
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'pi_not_ours' } },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
  });

  it('one of ours with no event id is refused, because nothing could deduplicate it', async () => {
    // The event id is the idempotency key for the whole path: a mutating handler
    // claims it inside the transaction that applies the change, so a delivery
    // without one cannot be claimed at all. Acknowledging it would accept a
    // state change that a redelivery could apply a second time.
    //
    // Carries platform metadata deliberately, so the ownership check above
    // passes and the missing id is what the case actually exercises.
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_ours_no_event_id',
          metadata: { paymentId: 'pay_ours_no_event_id', memberId: M_CTRL_BAD },
        },
      },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status, 'an unclaimable delivery must not be acknowledged').not.toBe(200);
  });

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

  // A signing secret rotated on only one side makes every delivery fail exactly
  // here, and it is the failure the webhook-delivery alarm exists to catch. The
  // alarm counts a log line, so a silent rejection would leave that alarm unable
  // to fire for its own headline cause.
  it('both rejection paths emit the counted delivery-failure line, tagged with which one fired', async () => {
    const { logger } = await import('../../src/config/logger');
    const warn = vi.spyOn(logger, 'warn');
    try {
      warn.mockClear();
      // Signature verification runs before any row is read, so the body content
      // is irrelevant to this path and no payment needs to exist.
      await postWebhook(JSON.stringify({ id: 'evt_unsigned' }), 't=1700000000,v1=deadbeef');
      expect(warn).toHaveBeenCalledWith(
        'webhook.delivery_failed',
        expect.objectContaining({ provider: 'stripe', reason: 'signature' }),
      );

      warn.mockClear();
      const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
      const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
      const body = JSON.stringify({
        id: 'evt_counted_recoverable',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        // Platform correlation present, so this is a genuine retry case rather
        // than an event belonging to someone else's flow.
        data: {
          object: {
            id: 'pi_also_does_not_exist',
            metadata: { paymentId: 'pay_also_not_inserted', memberId: 'someone' },
          },
        },
      });
      await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
      expect(warn).toHaveBeenCalledWith(
        'webhook.delivery_failed',
        expect.objectContaining({ provider: 'stripe', reason: 'recoverable' }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('both rejection paths also increment the counter the admin health view reads', async () => {
    // The log line wakes an operator through the monitoring metric; the counter
    // is what an application administrator can see without cloud-console
    // access. Both stories require the count, so both paths must feed it.
    const db = openDb();
    try {
      db.prepare('DELETE FROM stripe_webhook_failures').run();
    } finally {
      db.close();
    }

    await postWebhook(JSON.stringify({ id: 'evt_counter_unsigned' }), 't=1700000000,v1=deadbeef');

    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      id: 'evt_counter_recoverable',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_counter_missing',
          metadata: { paymentId: 'pay_counter_missing', memberId: 'someone' },
        },
      },
    });
    await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));

    const after = openDb();
    try {
      const rows = after.prepare(
        'SELECT reason, failure_count FROM stripe_webhook_failures ORDER BY reason',
      ).all() as { reason: string; failure_count: number }[];
      expect(rows.map((r) => r.reason)).toEqual(['recoverable', 'signature']);
      expect(rows.every((r) => r.failure_count === 1)).toBe(true);
      // Nothing an unauthenticated caller supplied is stored: the signature
      // path parsed no payload, so it names no event.
      const identified = after.prepare(
        "SELECT last_event_id FROM stripe_webhook_failures WHERE reason = 'signature'",
      ).get() as { last_event_id: string | null };
      expect(identified.last_event_id).toBeNull();
    } finally {
      after.close();
    }
  });

  it('recoverable failure (our intent, row not visible yet) -> 400 so Stripe retries', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      id: 'evt_no_row',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      // Carries the platform's own correlation, so this really is a payment we
      // started and the row may simply not be visible yet: worth a retry.
      data: {
        object: {
          id: 'pi_does_not_exist',
          metadata: { paymentId: 'pay_not_yet_inserted', memberId: 'someone' },
        },
      },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(400);
  });

  it('acknowledges an intent with no platform correlation instead of retrying it forever', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = JSON.stringify({
      id: 'evt_not_ours',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'pi_belongs_to_an_invoice', metadata: {} } },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
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

    // The unexpected-failure branch is the one class of failure nobody
    // anticipated, and for a while it was also the one nothing could see: it
    // answered 500 and emitted neither the counter the admin health view reads
    // nor the dotted log line the delivery-failure metric matches. Both are
    // asserted here, because a counter only ever checked at zero proves the
    // reason renders, not that anything ever increments it.
    const db = openDb();
    try {
      const counted = db.prepare(
        "SELECT SUM(failure_count) AS n FROM stripe_webhook_failures WHERE reason = 'error'",
      ).get() as { n: number | null };
      expect(counted.n).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });

  // Stripe delivers whatever the endpoint is subscribed to, and an endpoint can
  // acquire an extra event type at any time from the dashboard. A type with no
  // handler must be acknowledged, not retried: retrying could never succeed, and
  // sustained failures risk the provider disabling the endpoint for the events
  // that do matter. The type here must be one the dispatcher genuinely does not
  // handle, or the test proves nothing about that path.
  it('an event type the platform does not handle is acknowledged rather than retried', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const { REQUIRED_WEBHOOK_EVENTS } = await import('../../src/services/paymentService');
    const unhandledType = 'invoice.created';
    expect(REQUIRED_WEBHOOK_EVENTS).not.toContain(unhandledType);

    const body = JSON.stringify({
      id: 'evt_ignored',
      type: unhandledType,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'in_x' } },
    });
    const res = await postWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
  });
});
