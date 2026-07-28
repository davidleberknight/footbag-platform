/**
 * Live payment adapter under a production-shaped config: a test-mode Stripe
 * key resolves a client only while the SSM production-live marker reads
 * exactly "false"; a "true" marker, a missing marker, or an SSM read failure
 * all keep the strict refusal (fail closed). The marker is read through the
 * secrets adapter at first payment use, never at boot, so the normal
 * live-key path costs no read.
 *
 * The config singleton freezes at module load, so this file boots a
 * production-shaped process.env before importing the adapter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

process.env.NODE_ENV = 'production';
process.env.FOOTBAG_ENV = 'production';
process.env.PORT = '3097';
process.env.LOG_LEVEL = 'error';
process.env.FOOTBAG_DB_PATH = ':memory:';
process.env.PUBLIC_BASE_URL = 'https://footbag.org';
process.env.SESSION_SECRET = 'a'.repeat(48);
process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);
process.env.SES_FEEDBACK_WEBHOOK_KEY = 'b'.repeat(48);
process.env.JWT_SIGNER = 'kms'; // production mandates the KMS signer; lazy init, nothing here signs a session
process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
process.env.SES_ADAPTER = 'live';
process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
process.env.EMAIL_SEND_ARMED = 'armed';
process.env.PAYMENTS_ARMED = 'armed';
process.env.AWS_REGION = 'us-east-1';
process.env.SAFE_BROWSING_ADAPTER = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER = 'live';
process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER = 'local';
process.env.PAYMENT_ADAPTER = 'live';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_realvalue';
process.env.CAPTCHA_ADAPTER = 'live';
process.env.TURNSTILE_SITE_KEY = 'turnstile-site-key';

// Dynamic imports: static import statements hoist above the env assignments
// and would freeze the config singleton with the harness defaults instead of
// the production shape this file establishes.
const { createLivePaymentAdapter } = await import('../../src/adapters/paymentAdapter');
const { createStubSecretsAdapter } = await import('../../src/adapters/secretsAdapter');

const MARKER_NAME = '/footbag/production/app/production_live';

const CHECKOUT_OPTS = {
  memberId: 'm-prelive-1',
  paymentId: 'pay-prelive-1',
  amountCents: 2500,
  currency: 'USD',
  descriptor: 'IFPA Membership (Tier 1)',
  paymentType: 'membership' as const,
  purchasedTierStatus: 'tier1' as const,
  successUrl: 'https://footbag.org/payments/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://footbag.org/payments/cancel?session_id={CHECKOUT_SESSION_ID}',
  metadata: { tier: 'tier1' },
};

function makeAdapter(key: string, markerValue?: string) {
  const secrets = createStubSecretsAdapter();
  secrets.setSecret('stripe_secret_key', key);
  if (markerValue !== undefined) {
    secrets.setSecret(MARKER_NAME, markerValue);
  }
  let factoryCalls = 0;
  const adapter = createLivePaymentAdapter({
    secrets,
    stripeFactory: () => {
      factoryCalls += 1;
      return {
        checkout: {
          sessions: {
            create: async () => ({
              id: 'cs_prelive_1',
              url: 'https://checkout.stripe.example/cs_prelive_1',
              payment_intent: 'pi_prelive_1',
            }),
          },
        },
      // The structural client type is internal to the adapter module; the
      // fake supplies only the surface this test drives.
      } as never;
    },
  });
  return { adapter, secrets, factoryCalls: () => factoryCalls };
}

beforeEach(() => {
  expect(process.env.FOOTBAG_ENV).toBe('production');
});

describe('pre-live test-key admission through the live adapter', () => {
  it('resolves a client for a test key while the marker reads exactly "false"', async () => {
    const { adapter, factoryCalls } = makeAdapter('sk_test_prelive_fake', 'false');
    const result = await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(result.sessionId).toBe('cs_prelive_1');
    expect(factoryCalls()).toBe(1);
  });

  it('refuses a test key once the marker reads "true"', async () => {
    const { adapter, factoryCalls } = makeAdapter('sk_test_prelive_fake', 'true');
    await expect(adapter.createCheckoutSession(CHECKOUT_OPTS)).rejects.toThrow(/test-mode/i);
    expect(factoryCalls()).toBe(0);
  });

  it('refuses a test key when the marker is missing (fail closed)', async () => {
    const { adapter, factoryCalls } = makeAdapter('sk_test_prelive_fake');
    await expect(adapter.createCheckoutSession(CHECKOUT_OPTS)).rejects.toThrow(/test-mode/i);
    expect(factoryCalls()).toBe(0);
  });

  it('refuses a test key when the marker read fails (fail closed)', async () => {
    // The key fetch succeeds; only the marker read throws. The adapter must
    // treat that as not-pre-live and keep the strict test-key refusal.
    const backing = createStubSecretsAdapter();
    backing.setSecret('stripe_secret_key', 'sk_test_prelive_fake');
    backing.setSecret(MARKER_NAME, 'false');
    const markerReadFails = {
      get: (k: string) => backing.get(k),
      getRequired: (k: string) => backing.getRequired(k),
      getAbsolute: async (): Promise<string | undefined> => {
        throw new Error('ssm unavailable');
      },
      deleteAbsolute: (n: string) => backing.deleteAbsolute(n),
      invalidate: (k: string) => backing.invalidate(k),
    };
    let factoryCalls = 0;
    const adapter = createLivePaymentAdapter({
      secrets: markerReadFails,
      stripeFactory: () => {
        factoryCalls += 1;
        return {} as never;
      },
    });
    await expect(adapter.createCheckoutSession(CHECKOUT_OPTS)).rejects.toThrow(/test-mode/i);
    expect(factoryCalls).toBe(0);
  });

  it('resolves a live key without ever reading the marker', async () => {
    const { adapter, secrets, factoryCalls } = makeAdapter('sk_live_prelive_fake');
    secrets.setSecret(MARKER_NAME, 'true');
    const result = await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(result.sessionId).toBe('cs_prelive_1');
    expect(factoryCalls()).toBe(1);
  });

  it('accepts a marker value carrying stray whitespace as pre-live (trimmed compare)', async () => {
    const { adapter, factoryCalls } = makeAdapter('sk_test_prelive_fake', 'false\n');
    const result = await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(result.sessionId).toBe('cs_prelive_1');
    expect(factoryCalls()).toBe(1);
  });
});

describe('cached-client expiry across the go-live key swap', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a test-mode client expires and picks up a swapped live key without a restart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
    const { adapter, secrets, factoryCalls } = makeAdapter('sk_test_prelive_fake', 'false');

    await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(factoryCalls()).toBe(1);
    // Within the expiry interval the client is reused.
    await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(factoryCalls()).toBe(1);

    // The go-live arming step swaps the SSM value to the live key. A
    // permanently cached test client would keep completing checkouts against
    // Stripe test mode; after the expiry interval the adapter re-resolves.
    secrets.setSecret('stripe_secret_key', 'sk_live_after_arming_fake');
    vi.setSystemTime(new Date('2026-07-01T00:02:00.000Z'));
    await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(factoryCalls()).toBe(2);
  });

  it('a live-key client stays cached across the same interval (no extra secret reads)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
    const { adapter, factoryCalls } = makeAdapter('sk_live_prelive_fake');

    await adapter.createCheckoutSession(CHECKOUT_OPTS);
    vi.setSystemTime(new Date('2026-07-01T01:00:00.000Z'));
    await adapter.createCheckoutSession(CHECKOUT_OPTS);
    expect(factoryCalls()).toBe(1);
  });
});
