/**
 * PaymentAdapter: interface + implementations + singleton getter for
 * Stripe-backed payment operations. `createLivePaymentAdapter` wraps the
 * Stripe SDK: hosted Checkout sessions (payment and subscription mode),
 * webhook verification through the shared verifier, and
 * cancel-at-period-end. The API key resolves lazily from SecretsAdapter on
 * first use, so construction never performs network I/O and boot stays off
 * AWS. `createStubPaymentAdapter` simulates Stripe end-to-end for dev/test
 * with programmable success/failure/cancel outcomes per session.
 *
 * Services call the interface; the getter returns the configured
 * implementation based on `config.paymentAdapter`. Consumers (the webhook
 * handler, the stub checkout pass-through, tests) treat the two
 * implementations identically.
 */
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { config } from '../config/env';
import { verifyStripeWebhook, signStripeWebhook } from './stripeWebhook';
import {
  type SecretsAdapter,
  getSecretsAdapter,
  SecretNotConfiguredError,
} from './secretsAdapter';

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

// ── Live adapter (Stripe SDK) ─────────────────────────────────────────────────

const STRIPE_SECRET_KEY_NAME = 'stripe_secret_key';
const TODO_PLACEHOLDER_PREFIX = 'TODO-';

// Narrow structural view of the Stripe client so tests can inject a fake
// call path without mocking the SDK package itself. The default factory
// constructs the real SDK client, whose API is a superset of these shapes.
interface StripeCheckoutSessionLike {
  id: string;
  url: string | null;
  payment_intent?: string | { id: string } | null;
}

export interface StripeCheckoutSessionCreateParams {
  mode: 'payment' | 'subscription';
  client_reference_id: string;
  line_items: Array<{
    quantity: number;
    price_data: {
      currency: string;
      unit_amount: number;
      recurring?: { interval: 'year' };
      product_data: { name: string };
    };
  }>;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  payment_intent_data?: { metadata: Record<string, string> };
  subscription_data?: { metadata: Record<string, string> };
}

export interface StripeClientLike {
  checkout: {
    sessions: {
      create(params: StripeCheckoutSessionCreateParams): Promise<StripeCheckoutSessionLike>;
    };
  };
  subscriptions: {
    update(id: string, params: { cancel_at_period_end: boolean }): Promise<unknown>;
  };
}

export interface LivePaymentAdapterDeps {
  secrets?: SecretsAdapter;
  secretKey?: string;
  stripeFactory?: (apiKey: string) => StripeClientLike;
}

export function createLivePaymentAdapter(deps: LivePaymentAdapterDeps = {}): PaymentAdapter {
  const secrets = deps.secrets ?? getSecretsAdapter();
  const secretKey = deps.secretKey ?? STRIPE_SECRET_KEY_NAME;
  const stripeFactory =
    deps.stripeFactory ?? ((apiKey: string) => new Stripe(apiKey) as unknown as StripeClientLike);

  // Lazy client: the API key lives in SSM (SecureString) and resolves on the
  // first payment operation, never at construction, so the app boots without
  // AWS reachability and a misconfigured key fails the first checkout loudly.
  let client: StripeClientLike | null = null;
  async function getClient(): Promise<StripeClientLike> {
    if (client) return client;
    let apiKey: string;
    try {
      apiKey = await secrets.getRequired(secretKey);
    } catch (err) {
      if (err instanceof SecretNotConfiguredError) {
        throw new Error(
          `Stripe API key not configured. SSM parameter ".../secrets/${secretKey}" is missing. ` +
            `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-key --type SecureString --overwrite`,
        );
      }
      throw err;
    }
    if (apiKey.startsWith(TODO_PLACEHOLDER_PREFIX)) {
      throw new Error(
        `Stripe API key SSM parameter still has the bootstrap placeholder ('${apiKey}'). ` +
          `Operator: aws ssm put-parameter --name <full-name> --value file://path-to-key --type SecureString --overwrite`,
      );
    }
    client = stripeFactory(apiKey);
    return client;
  }

  function extractPaymentIntentId(session: StripeCheckoutSessionLike): string | null {
    // Stripe may defer PaymentIntent creation until the buyer submits
    // payment, so a fresh session can carry null here. The webhook handler
    // falls back to the paymentId stamped into the intent metadata below.
    if (typeof session.payment_intent === 'string') return session.payment_intent;
    return session.payment_intent?.id ?? null;
  }

  return {
    async createCheckoutSession(opts) {
      const stripe = await getClient();
      const metadata = {
        ...(opts.metadata ?? {}),
        paymentId: opts.paymentId,
        memberId: opts.memberId,
      };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: opts.paymentId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: opts.currency.toLowerCase(),
              unit_amount: opts.amountCents,
              product_data: { name: opts.descriptor },
            },
          },
        ],
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        metadata,
        // Mirrored onto the PaymentIntent so payment_intent.succeeded /
        // payment_failed events carry the correlation keys even when the
        // intent id was unknown at row-insert time.
        payment_intent_data: { metadata },
      });
      if (!session.url) {
        throw new Error(`Stripe checkout session ${session.id} returned no redirect URL`);
      }
      return {
        sessionId: session.id,
        paymentIntentId: extractPaymentIntentId(session),
        redirectUrl: session.url,
      };
    },

    async createSubscriptionCheckoutSession(opts) {
      const stripe = await getClient();
      const metadata = {
        ...(opts.metadata ?? {}),
        paymentId: opts.paymentId,
        memberId: opts.memberId,
        ...(opts.comment !== null ? { comment: opts.comment } : {}),
      };
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: opts.paymentId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: opts.currency.toLowerCase(),
              unit_amount: opts.amountCents,
              recurring: { interval: 'year' },
              product_data: { name: 'Recurring annual donation' },
            },
          },
        ],
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        metadata,
        // Mirrored onto the Subscription so customer.subscription.* events
        // carry the correlation keys.
        subscription_data: { metadata },
      });
      if (!session.url) {
        throw new Error(`Stripe checkout session ${session.id} returned no redirect URL`);
      }
      return {
        sessionId: session.id,
        paymentIntentId: null,
        redirectUrl: session.url,
      };
    },

    constructWebhookEvent(rawBody, signature) {
      const secret = config.stripeWebhookSecret;
      if (!secret) {
        // Configuration invariant: live mode requires STRIPE_WEBHOOK_SECRET
        // at boot, so reaching here means the config layer was bypassed.
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured for the live payment adapter');
      }
      const event = verifyStripeWebhook(rawBody, signature, secret);
      return mapStripeEvent(event);
    },

    async cancelSubscriptionAtPeriodEnd(stripeSubscriptionId) {
      const stripe = await getClient();
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    },
  };
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
