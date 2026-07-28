/**
 * The test runner can never send real email or move real money.
 *
 * The application obtains its SES and payment adapters only through the
 * accessor singletons (getSesAdapter / getPaymentAdapter). Under the Vitest
 * runner both accessors refuse to resolve a live implementation, so no test
 * that drives the application path can reach AWS SES or Stripe, whatever its
 * env configuration claims. The deliberate real-AWS tiers do not pass through
 * the accessors: the operator-run staging smoke suite and the adapter-parity
 * suite construct the live implementations directly (parity with an injected
 * fake client), and both stay unaffected.
 *
 * Pattern: vi.resetModules() + fresh dynamic imports so the frozen config
 * singleton re-evaluates with per-case process.env overrides.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return { ...process.env };
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const k of Object.keys(process.env)) delete process.env[k];
  for (const [k, v] of Object.entries(snap)) {
    if (v !== undefined) process.env[k] = v;
  }
}

// Minimal boot env accepting a live adapter selection: bare test boot shape
// (FOOTBAG_ENV unset, so the below-production live refusals do not fire).
function liveCapableEnv(): void {
  process.env.PORT = '3099';
  process.env.LOG_LEVEL = 'error';
  process.env.FOOTBAG_DB_PATH = ':memory:';
  process.env.PUBLIC_BASE_URL = 'http://localhost';
  process.env.SESSION_SECRET = 'a'.repeat(48);
  process.env.SES_FEEDBACK_WEBHOOK_KEY = 'b'.repeat(48);
  process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);
  process.env.PAYMENTS_ARMED = 'armed';
  process.env.EMAIL_SEND_ARMED = 'armed';
  process.env.NODE_ENV = 'development';
  delete process.env.FOOTBAG_ENV;
  process.env.AWS_REGION = 'us-east-1';
}

describe('live adapters are unreachable through the accessors under the Vitest runner', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('getSesAdapter() refuses SES_ADAPTER=live', async () => {
    liveCapableEnv();
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    expect(process.env.VITEST).toBeTruthy();
    const { getSesAdapter } = await import('../../src/adapters/sesAdapter');
    expect(() => getSesAdapter()).toThrow(
      /getSesAdapter\(\) refuses SES_ADAPTER=live under the Vitest runner/,
    );
  });

  it('getPaymentAdapter() refuses PAYMENT_ADAPTER=live', async () => {
    liveCapableEnv();
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    expect(process.env.VITEST).toBeTruthy();
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    expect(() => getPaymentAdapter()).toThrow(
      /getPaymentAdapter\(\) refuses PAYMENT_ADAPTER=live under the Vitest runner/,
    );
  });

  it('resolves the in-memory stubs on a plain test boot', async () => {
    liveCapableEnv();
    process.env.SES_ADAPTER = 'stub';
    process.env.PAYMENT_ADAPTER = 'stub';
    const ses = await import('../../src/adapters/sesAdapter');
    const payments = await import('../../src/adapters/paymentAdapter');
    expect(ses.getSesAdapter()).toBe(ses.getStubSesAdapterForTests());
    expect(payments.getPaymentAdapter()).toBe(payments.getStubPaymentAdapterForTests());
  });
});
