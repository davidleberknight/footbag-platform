/**
 * Webhook signing for the stub payment adapter when the deployment supplies its
 * own secret.
 *
 * The stub's built-in signing secret is a constant committed to this
 * repository, so any deployment whose webhook endpoint is reachable and still
 * uses it would accept a delivery forged by anyone holding a copy of the
 * source. A deployment therefore supplies a generated secret, and once it does,
 * the committed constant must stop being a valid signing key.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4036');
process.env.PAYMENT_ADAPTER = 'stub';
// Set before the app (and therefore the frozen config singleton) is imported,
// the same ordering a deployed host gets from its env file.
process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_deployment_generated_value';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
// Plain supertest (NOT supertestWithOrigin): real Stripe webhook deliveries are
// server-to-server and send no Origin header.
import request from 'supertest';
import { insertMember } from '../fixtures/factories';

const M_ACCEPT = 'stub-secret-accept';
const M_REJECT = 'stub-secret-reject';
const M_SIGNER = 'stub-secret-signer';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [i, id] of [M_ACCEPT, M_REJECT, M_SIGNER].entries()) {
    insertMember(db, {
      id,
      slug: `stub_secret_${i}`,
      display_name: `Stub Secret ${i}`,
      login_email: `stubsecret${i}@example.com`,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

/** Starts a real pending membership purchase and returns the event body the
 *  stub synthesizes for it, plus the signature the adapter produced. */
async function startSignedSuccess(memberId: string): Promise<{ rawBody: string; signature: string }> {
  const { paymentService } = await import('../../src/services/paymentService');
  const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
  getPaymentAdapter();
  const result = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  const stub = getStubPaymentAdapterForTests()!;
  return stub.buildSignedStubWebhookEvent(result.sessionId);
}

function postWebhook(rawBody: string, signature: string) {
  return request(createApp())
    .post('/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature)
    .send(rawBody);
}

describe('stub payment adapter: deployment-supplied webhook signing secret', () => {
  it('accepts a delivery signed with the deployment secret', async () => {
    const { rawBody, signature } = await startSignedSuccess(M_ACCEPT);
    const res = await postWebhook(rawBody, signature);
    expect(res.status).toBe(200);
  });

  it('rejects a delivery signed with the adapter constant once a deployment secret is set', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const { rawBody } = await startSignedSuccess(M_REJECT);

    // Same body the adapter itself would have sent, re-signed with the secret
    // that ships in the source: this is the forgery the deployment secret has
    // to defeat.
    const forged = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
    const res = await postWebhook(rawBody, forged);
    expect(res.status).toBe(400);
  });

  it('signs with the deployment secret rather than the adapter constant', async () => {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const { rawBody, signature } = await startSignedSuccess(M_SIGNER);

    const timestamp = Number(/t=(\d+)/.exec(signature)![1]);
    expect(signature).not.toBe(signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET, timestamp));
    expect(signature).toBe(
      signStripeWebhook(rawBody, 'whsec_stub_deployment_generated_value', timestamp),
    );
  });
});
