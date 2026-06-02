/**
 * PaymentAdapter: interface + implementations + singleton getter for
 * Stripe-backed payment operations. `createLivePaymentAdapter` will wrap
 * the Stripe SDK once the Stripe-integration slice ships; today it is a
 * placeholder that throws on construction. `createStubPaymentAdapter`
 * simulates Stripe end-to-end for dev/test with programmable
 * success/failure/cancel outcomes per session.
 *
 * Services call the interface; the getter returns the configured
 * implementation based on `config.paymentAdapter`. Consumers (the webhook
 * handler, the stub checkout pass-through, tests) treat the two
 * implementations identically.
 */
import { randomUUID } from 'node:crypto';
import { config } from '../config/env';
import { verifyStripeWebhook, signStripeWebhook } from './stripeWebhook';

// ── Method args / results ────────────────────────────────────────────────────

export interface OneTimeCheckoutOpts {
  memberId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  descriptor: string;
  paymentType: 'membership' | 'event_registration' | 'donation';
  purchasedTierStatus?: 'tier1' | 'tier2';
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface SubscriptionCheckoutOpts {
  memberId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  comment: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  sessionId: string;
  paymentIntentId: string | null;
  redirectUrl: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

// ── Adapter interface ────────────────────────────────────────────────────────

export interface PaymentAdapter {
  createCheckoutSession(opts: OneTimeCheckoutOpts): Promise<CheckoutSessionResult>;
  createSubscriptionCheckoutSession(opts: SubscriptionCheckoutOpts): Promise<CheckoutSessionResult>;
  constructWebhookEvent(rawBody: string | Buffer, signature: string): StripeWebhookEvent;
  cancelSubscriptionAtPeriodEnd(stripeSubscriptionId: string): Promise<void>;
}

// ── Stub adapter (programmable, used in dev/staging/test) ────────────────────

export type StubOutcome = 'success' | 'failure' | 'cancel';

export interface StubSessionRecord {
  sessionId: string;
  paymentIntentId: string | null;
  paymentType: 'membership' | 'event_registration' | 'donation' | 'subscription';
  memberId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  outcome: StubOutcome;
}

export interface StubPaymentAdapter extends PaymentAdapter {
  readonly sessions: ReadonlyMap<string, StubSessionRecord>;
  setNextOutcome(outcome: StubOutcome): void;
  overrideSessionOutcome(sessionId: string, outcome: StubOutcome): void;
  buildSignedStubWebhookEvent(sessionId: string): { rawBody: string; signature: string };
  clear(): void;
}

function newStubId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/**
 * Stub webhook signing secret. Permanent test infrastructure, co-located with
 * the stub adapter that uses it (never in the delete-at-cutover dev-bootstrap
 * subtree). The stub signs the events it synthesizes with this secret and the
 * same verifier production runs validates them against it, so the signature
 * path is exercised by every test. It ships in the production image but is
 * refused at boot (env.ts rejects a whsec_stub-prefixed STRIPE_WEBHOOK_SECRET
 * in production), not excluded from it.
 */
export const STUB_WEBHOOK_SECRET = 'whsec_stub_0000000000000000000000000000';

/** Maps a verified Stripe SDK event onto the internal StripeWebhookEvent shape. */
function mapStripeEvent(event: ReturnType<typeof verifyStripeWebhook>): StripeWebhookEvent {
  return {
    id: event.id,
    type: event.type,
    createdAt: new Date(event.created * 1000).toISOString(),
    data: event.data as unknown as Record<string, unknown>,
  };
}

/**
 * Builds the synthetic event for a stub session in Stripe SDK shape
 * (`created` as Unix-epoch seconds, payload under `data.object`) so it
 * round-trips through the real verifier and maps back via mapStripeEvent.
 */
function buildStubEventObject(
  session: StubSessionRecord,
  eventId: string,
  created: number,
): Record<string, unknown> {
  const meta = { sessionId: session.sessionId, paymentId: session.paymentId };

  if (session.paymentType === 'subscription') {
    if (session.outcome === 'success') {
      return {
        id: eventId,
        type: 'customer.subscription.created',
        created,
        data: {
          object: {
            id: newStubId('sub_stub'),
            customer: newStubId('cus_stub'),
            metadata: meta,
          },
        },
      };
    }
    return {
      id: eventId,
      type: 'customer.subscription.deleted',
      created,
      data: { object: { id: newStubId('sub_stub'), metadata: meta } },
    };
  }

  const paymentIntentId = session.paymentIntentId!;
  if (session.outcome === 'success') {
    return {
      id: eventId,
      type: 'payment_intent.succeeded',
      created,
      data: {
        object: {
          id: paymentIntentId,
          amount: session.amountCents,
          currency: session.currency.toLowerCase(),
          metadata: meta,
        },
      },
    };
  }
  if (session.outcome === 'failure') {
    return {
      id: eventId,
      type: 'payment_intent.payment_failed',
      created,
      data: { object: { id: paymentIntentId, metadata: meta } },
    };
  }
  // cancel: synthesise checkout.session.expired so the webhook handler
  // can transition payments.status pending -> canceled.
  return {
    id: eventId,
    type: 'checkout.session.expired',
    created,
    data: {
      object: { id: session.sessionId, payment_intent: paymentIntentId, metadata: meta },
    },
  };
}

export function createStubPaymentAdapter(): StubPaymentAdapter {
  const sessions = new Map<string, StubSessionRecord>();
  let nextOutcome: StubOutcome = 'success';

  function recordOneTime(opts: OneTimeCheckoutOpts): CheckoutSessionResult {
    const sessionId = newStubId('cs_stub');
    const paymentIntentId = newStubId('pi_stub');
    sessions.set(sessionId, {
      sessionId,
      paymentIntentId,
      paymentType: opts.paymentType,
      memberId: opts.memberId,
      paymentId: opts.paymentId,
      amountCents: opts.amountCents,
      currency: opts.currency,
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
      metadata: { ...(opts.metadata ?? {}) },
      outcome: nextOutcome,
    });
    nextOutcome = 'success';
    return { sessionId, paymentIntentId, redirectUrl: `/payments/checkout/${sessionId}` };
  }

  function recordSubscription(opts: SubscriptionCheckoutOpts): CheckoutSessionResult {
    const sessionId = newStubId('cs_stub');
    sessions.set(sessionId, {
      sessionId,
      paymentIntentId: null,
      paymentType: 'subscription',
      memberId: opts.memberId,
      paymentId: opts.paymentId,
      amountCents: opts.amountCents,
      currency: opts.currency,
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
      metadata: { ...(opts.metadata ?? {}) },
      outcome: nextOutcome,
    });
    nextOutcome = 'success';
    return { sessionId, paymentIntentId: null, redirectUrl: `/payments/checkout/${sessionId}` };
  }

  return {
    get sessions() {
      return sessions;
    },
    setNextOutcome(outcome) {
      nextOutcome = outcome;
    },
    overrideSessionOutcome(sessionId, outcome) {
      const s = sessions.get(sessionId);
      if (s) s.outcome = outcome;
    },
    clear() {
      sessions.clear();
      nextOutcome = 'success';
    },
    async createCheckoutSession(opts) {
      return recordOneTime(opts);
    },
    async createSubscriptionCheckoutSession(opts) {
      return recordSubscription(opts);
    },
    constructWebhookEvent(rawBody, signature) {
      const event = verifyStripeWebhook(rawBody, signature, STUB_WEBHOOK_SECRET);
      return mapStripeEvent(event);
    },
    buildSignedStubWebhookEvent(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Stub adapter: unknown session ${sessionId}`);
      }
      const eventId = newStubId('evt_stub');
      const created = Math.floor(Date.now() / 1000);
      const rawBody = JSON.stringify(buildStubEventObject(session, eventId, created));
      const signature = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
      return { rawBody, signature };
    },
    async cancelSubscriptionAtPeriodEnd(_stripeSubscriptionId) {
      // Stub no-op. The real implementation will set
      // subscription.cancel_at_period_end = true on the Stripe Subscription.
    },
  };
}

// ── Live adapter (placeholder until Stripe SDK is wired) ─────────────────────

export function createLivePaymentAdapter(_opts: Record<string, unknown> = {}): PaymentAdapter {
  throw new Error(
    'Live Stripe payment adapter is not yet implemented. Set PAYMENT_ADAPTER=stub or wait for the Stripe-SDK integration slice.',
  );
}

// ── Singleton getter + test helpers ──────────────────────────────────────────

let singleton: PaymentAdapter | null = null;
let stubSingleton: StubPaymentAdapter | null = null;

export function getPaymentAdapter(): PaymentAdapter {
  if (singleton) return singleton;
  if (config.paymentAdapter === 'live') {
    singleton = createLivePaymentAdapter();
  } else {
    stubSingleton = createStubPaymentAdapter();
    singleton = stubSingleton;
  }
  return singleton;
}

/** Exposes the in-memory stub for test inspection. Null unless PAYMENT_ADAPTER=stub. */
export function getStubPaymentAdapterForTests(): StubPaymentAdapter | null {
  return stubSingleton;
}

export function resetPaymentAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
