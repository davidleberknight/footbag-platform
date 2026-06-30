import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3974');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const M_REFUND = 'rx-refund';
const M_REFUND_IDEMPOTENT = 'rx-refund-idem';
const M_EXPIRE = 'rx-expire';
const M_EXPIRE_IDEMPOTENT = 'rx-expire-idem';
const M_EXPIRE_UNKNOWN = 'rx-expire-unknown';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [i, id] of [M_REFUND, M_REFUND_IDEMPOTENT, M_EXPIRE, M_EXPIRE_IDEMPOTENT, M_EXPIRE_UNKNOWN].entries()) {
    insertMember(db, { id, slug: `rx_${i}`, display_name: `Rx ${i}`, login_email: `rx${i}@example.com` });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

// Drives a membership purchase through to a settled 'succeeded' payment and
// returns the payment id plus the Stripe payment-intent id a refund event must
// reference (the refund handler matches on stripe_payment_intent_id).
async function settleSucceededPayment(memberId: string): Promise<{ paymentId: string; intentId: string }> {
  const { paymentService } = await import('../../src/services/paymentService');
  const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
  getPaymentAdapter();
  const started = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  const stub = getStubPaymentAdapterForTests()!;
  const { rawBody, signature } = stub.buildSignedStubWebhookEvent(started.sessionId);
  expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
  const db = openDb();
  try {
    const row = db
      .prepare('SELECT stripe_payment_intent_id FROM payments WHERE id = ?')
      .get(started.paymentId) as { stripe_payment_intent_id: string };
    return { paymentId: started.paymentId, intentId: row.stripe_payment_intent_id };
  } finally {
    db.close();
  }
}

// Starts a membership purchase and leaves it pending (no success webhook).
async function startPendingPayment(memberId: string): Promise<{ paymentId: string; sessionId: string }> {
  const { paymentService } = await import('../../src/services/paymentService');
  const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
  getPaymentAdapter();
  const started = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  return { paymentId: started.paymentId, sessionId: started.sessionId };
}

async function signedEvent(body: object): Promise<{ rawBody: string; signature: string }> {
  const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
  const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
  const rawBody = JSON.stringify(body);
  return { rawBody, signature: signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET) };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('charge.refunded webhook handler', () => {
  it('transitions a succeeded payment to refunded and writes a refund audit row', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, intentId } = await settleSucceededPayment(M_REFUND);
    const { rawBody, signature } = await signedEvent({
      id: 'evt_refund_ok',
      type: 'charge.refunded',
      created: nowSeconds(),
      data: { object: { payment_intent: intentId } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('refunded');
      // One transition for the success (pending -> succeeded) plus one for the refund.
      const transitions = db
        .prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?')
        .get(paymentId) as { c: number };
      expect(transitions.c).toBe(2);
      const audit = db
        .prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.refunded' AND entity_id = ?")
        .get(paymentId) as { c: number };
      expect(audit.c).toBe(1);
      // Refund makes no automatic tier change; the grant from the purchase stands.
      const tier = db
        .prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
        .get(M_REFUND) as { tier_status: string };
      expect(tier.tier_status).toBe('tier1');
    } finally {
      db.close();
    }
  });

  it('is idempotent: re-delivering the refund event applies the transition once', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, intentId } = await settleSucceededPayment(M_REFUND_IDEMPOTENT);
    const { rawBody, signature } = await signedEvent({
      id: 'evt_refund_idem',
      type: 'charge.refunded',
      created: nowSeconds(),
      data: { object: { payment_intent: intentId } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const transitions = db
        .prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?')
        .get(paymentId) as { c: number };
      expect(transitions.c).toBe(2); // success + one refund; replay added none
      const audit = db
        .prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.refunded' AND entity_id = ?")
        .get(paymentId) as { c: number };
      expect(audit.c).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('checkout.session.expired webhook handler', () => {
  it('cancels a pending payment and writes a cancel audit row', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await startPendingPayment(M_EXPIRE);
    const { rawBody, signature } = await signedEvent({
      id: 'evt_expire_ok',
      type: 'checkout.session.expired',
      created: nowSeconds(),
      data: { object: { id: sessionId } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('canceled');
      const audit = db
        .prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.canceled' AND entity_id = ?")
        .get(paymentId) as { c: number };
      expect(audit.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('is idempotent: re-delivering the expiry event is a no-op once canceled', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { sessionId } = await startPendingPayment(M_EXPIRE_IDEMPOTENT);
    const { rawBody, signature } = await signedEvent({
      id: 'evt_expire_idem',
      type: 'checkout.session.expired',
      created: nowSeconds(),
      data: { object: { id: sessionId } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'duplicate' });
  });

  it('acknowledges an expiry for an unknown session without writing payment state', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { rawBody, signature } = await signedEvent({
      id: 'evt_expire_unknown',
      type: 'checkout.session.expired',
      created: nowSeconds(),
      data: { object: { id: 'cs_never_created' } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'ignored' });
  });
});
