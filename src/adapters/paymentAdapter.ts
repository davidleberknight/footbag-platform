/**
 * PaymentAdapter: interface + implementations + singleton getter for
 * Stripe-backed payment operations. `createLivePaymentAdapter` wraps the
 * Stripe SDK: hosted Checkout sessions (payment and subscription mode),
 * webhook verification through the shared verifier, and
 * cancel-at-period-end. The API key resolves lazily from SecretsAdapter on
 * first use, so construction never performs network I/O and boot stays off
 * AWS; a Stripe authentication failure discards the cached key and client so
 * the next call picks up a rotated one without a restart.
 * `createStubPaymentAdapter` simulates Stripe end-to-end for dev/test
 * with programmable success/failure/cancel outcomes per session. The stub
 * signs and verifies with `config.stripeWebhookSecretStub` when the deployment
 * supplies one, falling back to the committed `STUB_WEBHOOK_SECRET` only where
 * the endpoint is unreachable (development and test).
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
  /** The member's existing Stripe Customer, when they already have one. Passing
   *  it keeps a repeat payer on one Customer record; Checkout mints a fresh one
   *  whenever none is supplied, which would fragment their payment history
   *  across duplicates. */
  stripeCustomerId?: string | null;
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
  /** The member's existing Stripe Customer, when they already have one. Passing
   *  it keeps a repeat donor on one Customer record; Checkout in subscription
   *  mode mints a fresh one whenever none is supplied, which would fragment
   *  their payment history across duplicates. */
  stripeCustomerId?: string | null;
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

// ── Ledger reads (reconciliation) ────────────────────────────────────────────
//
// Reconciliation compares what the platform recorded against what the payment
// provider holds, so it needs to read the provider's ledger rather than wait for
// a webhook. These summaries carry only the fields the comparison uses; nothing
// here is rendered to a member.

export interface LedgerWindow {
  /** Inclusive ISO-8601 UTC lower bound on provider-side creation time. */
  createdAfter: string;
  /** Exclusive ISO-8601 UTC upper bound. */
  createdBefore: string;
}

export interface StripePaymentIntentSummary {
  id: string;
  amountCents: number;
  currency: string;
  /** Stripe's own payment-intent status, mapped by the reconciliation service. */
  status: string;
  createdAt: string;
}

export interface StripeSubscriptionSummary {
  id: string;
  customerId: string | null;
  status: string;
  amountCents: number | null;
  currency: string | null;
}

export interface StripeInvoiceSummary {
  id: string;
  subscriptionId: string | null;
  amountPaidCents: number;
  currency: string;
  status: string;
  createdAt: string;
}

// ── Adapter interface ────────────────────────────────────────────────────────

export interface PaymentAdapter {
  createCheckoutSession(opts: OneTimeCheckoutOpts): Promise<CheckoutSessionResult>;
  createSubscriptionCheckoutSession(opts: SubscriptionCheckoutOpts): Promise<CheckoutSessionResult>;
  constructWebhookEvent(rawBody: string | Buffer, signature: string): StripeWebhookEvent;
  cancelSubscriptionAtPeriodEnd(stripeSubscriptionId: string): Promise<void>;
  listPaymentIntents(window: LedgerWindow): Promise<StripePaymentIntentSummary[]>;
  listSubscriptions(): Promise<StripeSubscriptionSummary[]>;
  listInvoices(window: LedgerWindow): Promise<StripeInvoiceSummary[]>;
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
  // Fixed at session creation for a subscription session, so every event
  // synthesized from that session names the same Stripe subscription and
  // customer. A random id per call would make each event look like a different
  // subscription and the lifecycle could never be exercised.
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

/** The lifecycle steps a subscription session can be driven through after its
 *  initial customer.subscription.created event. Real Stripe sends these over
 *  the following year; the stub sends them on demand. */
export type StubSubscriptionEventKind =
  | 'invoice_succeeded'
  | 'invoice_failed'
  | 'updated'
  | 'deleted';

export interface StubSubscriptionEventOpts {
  /** Overrides the charged amount on an invoice event, or the new price on an
   *  updated event; defaults to the session's amount. */
  amountCents?: number;
  /** The Stripe subscription status carried by an updated event. */
  status?: string;
  /** The invoice's billing reason: `subscription_create` for the first invoice
   *  raised at signup, `subscription_cycle` for a renewal. Defaults to a
   *  renewal, which is the case a test usually means. */
  billingReason?: 'subscription_create' | 'subscription_cycle';
  /** The event's own creation time, in Unix-epoch seconds. Defaults to now.
   *  Delivery order is not guaranteed, and the handlers compare these times to
   *  decide which of two events describes the later state, so exercising that
   *  requires stating them rather than taking whatever the clock reads. */
  createdSeconds?: number;
  /** The invoice the event reports on; defaults to a fresh one. Stating it is
   *  what lets a test send the several payment events the provider raises
   *  against a single invoice. */
  invoiceId?: string;
}

export interface StubRefundEventOpts {
  /** The charge total the refund is measured against; defaults to the session's
   *  amount. */
  amountCents?: number;
  /** How much of it was refunded; defaults to the whole charge. */
  refundedAmountCents?: number;
  /** Emits the charge with no amount fields at all, the shape a refund payload
   *  takes when the provider does not state what was returned. */
  omitAmounts?: boolean;
  /** Emits the charge with no payment-intent reference, as the provider does for
   *  a charge it did not create from one. */
  omitPaymentIntent?: boolean;
}

/** The account-level money events that belong to no single checkout session:
 *  a card dispute moving through its stages, and a failed payout to the bank. */
export type StubAccountEventKind =
  | 'dispute_created'
  | 'dispute_closed'
  | 'dispute_funds_withdrawn'
  | 'payout_failed';

export interface StubAccountEventOpts {
  amountCents?: number;
  currency?: string;
  /** The dispute's reason, or the payout's failure code. */
  reason?: string;
  /** The dispute's own id or the payout's, so a test can drive the same object
   *  through several stages the way the provider does. */
  objectId?: string;
  /** The charge and payment intent a dispute is raised against. */
  chargeId?: string;
  paymentIntentId?: string;
}

export interface StubPaymentAdapter extends PaymentAdapter {
  readonly sessions: ReadonlyMap<string, StubSessionRecord>;
  setNextOutcome(outcome: StubOutcome): void;
  overrideSessionOutcome(sessionId: string, outcome: StubOutcome): void;
  // The simulated provider-side ledger the reconciliation passes read. Every
  // event the stub synthesizes is reflected into it, so a normally-driven flow
  // reconciles clean; the setters and removers exist so a test can construct a
  // specific discrepancy (a missing counterpart, a drifted amount or currency)
  // deliberately rather than by accident.
  setLedgerPaymentIntent(summary: StripePaymentIntentSummary): void;
  removeLedgerPaymentIntent(id: string): void;
  setLedgerSubscription(summary: StripeSubscriptionSummary): void;
  removeLedgerSubscription(id: string): void;
  setLedgerInvoice(summary: StripeInvoiceSummary): void;
  removeLedgerInvoice(id: string): void;
  buildSignedStubWebhookEvent(sessionId: string): { rawBody: string; signature: string };
  buildSignedStubSubscriptionEvent(
    sessionId: string,
    kind: StubSubscriptionEventKind,
    opts?: StubSubscriptionEventOpts,
  ): { rawBody: string; signature: string };
  buildSignedStubRefundEvent(
    sessionId: string,
    opts?: StubRefundEventOpts,
  ): { rawBody: string; signature: string };
  buildSignedStubAccountEvent(
    kind: StubAccountEventKind,
    opts?: StubAccountEventOpts,
  ): { rawBody: string; signature: string };
  clear(): void;
}

function newStubId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

// Stripe bounds both the product name shown at Checkout and every metadata
// value, and rejects the whole request when either is exceeded. A donation note
// is member-supplied free text that rides into both, so an over-long note would
// fail the checkout outright rather than degrading. Cap the provider-bound copy
// here, at the one place everything crossing to Stripe passes through; the local
// ledger keeps the member's full text, since only the outbound copy is bounded.
const PRODUCT_NAME_MAX_CHARS = 250;
const METADATA_VALUE_MAX_BYTES = 500;

/** Caps a Checkout product name, never splitting a surrogate pair: half of an
 *  astral character is not a character, and would reach Stripe as a
 *  replacement glyph. */
function truncateProductName(name: string): string {
  if (name.length <= PRODUCT_NAME_MAX_CHARS) return name;
  return Array.from(name).slice(0, PRODUCT_NAME_MAX_CHARS).join('');
}

/** Caps each metadata value at the provider's byte limit. The limit is bytes
 *  and the text is UTF-8, so a value well under the limit in characters can be
 *  well over it in bytes; counting code points as they are appended keeps a
 *  multi-byte character whole instead of cutting one in half. */
function truncateMetadataValues(
  metadata: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (Buffer.byteLength(value, 'utf8') <= METADATA_VALUE_MAX_BYTES) {
      out[key] = value;
      continue;
    }
    let kept = '';
    let bytes = 0;
    for (const char of value) {
      const size = Buffer.byteLength(char, 'utf8');
      if (bytes + size > METADATA_VALUE_MAX_BYTES) break;
      kept += char;
      bytes += size;
    }
    out[key] = kept;
  }
  return out;
}

/**
 * Fallback stub webhook signing secret. Permanent test infrastructure,
 * co-located with the stub adapter that uses it (never in the
 * delete-at-cutover dev-bootstrap subtree). The stub signs the events it
 * synthesizes with the resolved secret and the same verifier production runs
 * validates them against it, so the signature path is exercised by every test.
 *
 * Because this value is committed source, anyone with a copy of this
 * repository could forge a signature a host still using it would accept. A
 * deployment whose stub endpoint is reachable therefore supplies its own
 * generated value through `config.stripeWebhookSecretStub`, and this constant
 * covers only development and test. It ships in the production image but is
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
  // The caller's own metadata rides along, because the real Stripe mirrors
  // subscription_data.metadata onto the Subscription and the webhook handlers
  // read their correlation keys from there. Nothing else is added: a key the
  // platform never sets is a key the provider will never send, and a stub that
  // invents one lets a handler come to depend on something that does not exist
  // in production.
  const meta = {
    ...session.metadata,
    paymentId: session.paymentId,
  };

  if (session.paymentType === 'subscription') {
    if (session.outcome === 'success') {
      return {
        id: eventId,
        type: 'customer.subscription.created',
        created,
        data: {
          object: {
            id: session.stripeSubscriptionId,
            customer: session.stripeCustomerId,
            status: 'active',
            metadata: meta,
          },
        },
      };
    }
    return {
      id: eventId,
      type: 'customer.subscription.deleted',
      created,
      data: { object: { id: session.stripeSubscriptionId, metadata: meta } },
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

/** Synthesises a post-setup subscription lifecycle event for a subscription
 *  session: the annual invoice charges Stripe sends over the following years,
 *  a Dashboard-side change, or the final cancellation. */
function buildStubSubscriptionEventObject(
  session: StubSessionRecord,
  kind: StubSubscriptionEventKind,
  eventId: string,
  created: number,
  opts: StubSubscriptionEventOpts,
): Record<string, unknown> {
  // Composed exactly as the checkout-completion event composes it, and for the
  // same reason: only the caller's own metadata plus the correlation key the
  // platform actually sets.
  const meta = {
    ...session.metadata,
    paymentId: session.paymentId,
  };
  const amountCents = opts.amountCents ?? session.amountCents;

  if (kind === 'invoice_succeeded' || kind === 'invoice_failed') {
    return {
      id: eventId,
      type: kind === 'invoice_succeeded' ? 'invoice.payment_succeeded' : 'invoice.payment_failed',
      created,
      data: {
        object: {
          id: opts.invoiceId ?? newStubId('in_stub'),
          // The subscription linkage lives on the invoice's parent, matching the
          // API version this project pins. The old top-level `subscription`
          // field is deliberately NOT emitted: a stub that keeps sending the
          // retired shape would let a handler that reads only the retired shape
          // keep passing its tests while failing against real Stripe.
          parent: {
            type: 'subscription_details',
            subscription_details: { subscription: session.stripeSubscriptionId },
          },
          billing_reason: opts.billingReason ?? 'subscription_cycle',
          customer: session.stripeCustomerId,
          amount_paid: kind === 'invoice_succeeded' ? amountCents : 0,
          currency: session.currency.toLowerCase(),
          metadata: meta,
        },
      },
    };
  }

  if (kind === 'updated') {
    return {
      id: eventId,
      type: 'customer.subscription.updated',
      created,
      data: {
        object: {
          id: session.stripeSubscriptionId,
          customer: session.stripeCustomerId,
          status: opts.status ?? 'active',
          items: { data: [{ price: { unit_amount: amountCents } }] },
          metadata: meta,
        },
      },
    };
  }

  return {
    id: eventId,
    type: 'customer.subscription.deleted',
    created,
    data: {
      object: {
        id: session.stripeSubscriptionId,
        customer: session.stripeCustomerId,
        status: 'canceled',
        metadata: meta,
      },
    },
  };
}

/** Synthesises the refund event for a completed one-time checkout. The charge
 *  carries the amounts the handler classifies on, and can be built without them
 *  (or without its payment-intent reference) so the ambiguous payloads real
 *  Stripe can send are exercised against the real dispatcher. */
function buildStubRefundEventObject(
  session: StubSessionRecord,
  eventId: string,
  created: number,
  opts: StubRefundEventOpts,
): Record<string, unknown> {
  const amountCents = opts.amountCents ?? session.amountCents;
  const refunded = opts.refundedAmountCents ?? amountCents;
  return {
    id: eventId,
    type: 'charge.refunded',
    created,
    data: {
      object: {
        id: newStubId('ch_stub'),
        ...(opts.omitPaymentIntent ? {} : { payment_intent: session.paymentIntentId }),
        ...(opts.omitAmounts ? {} : { amount: amountCents, amount_refunded: refunded }),
        currency: session.currency.toLowerCase(),
        metadata: { ...session.metadata, paymentId: session.paymentId },
      },
    },
  };
}

/** Synthesises a dispute or payout event. These belong to the Stripe account
 *  rather than to any one checkout, so they are built from options alone. */
function buildStubAccountEventObject(
  kind: StubAccountEventKind,
  eventId: string,
  created: number,
  opts: StubAccountEventOpts,
): Record<string, unknown> {
  const currency = (opts.currency ?? 'USD').toLowerCase();
  const amountCents = opts.amountCents ?? 1000;

  if (kind === 'payout_failed') {
    return {
      id: eventId,
      type: 'payout.failed',
      created,
      data: {
        object: {
          id: opts.objectId ?? newStubId('po_stub'),
          amount: amountCents,
          currency,
          status: 'failed',
          failure_code: opts.reason ?? 'account_closed',
          failure_message: 'The bank account has been closed.',
        },
      },
    };
  }

  const type =
    kind === 'dispute_created'
      ? 'charge.dispute.created'
      : kind === 'dispute_closed'
        ? 'charge.dispute.closed'
        : 'charge.dispute.funds_withdrawn';
  return {
    id: eventId,
    type,
    created,
    data: {
      object: {
        id: opts.objectId ?? newStubId('dp_stub'),
        amount: amountCents,
        currency,
        charge: opts.chargeId ?? newStubId('ch_stub'),
        payment_intent: opts.paymentIntentId ?? null,
        reason: opts.reason ?? 'fraudulent',
        status: kind === 'dispute_closed' ? 'lost' : 'needs_response',
      },
    },
  };
}

export function createStubPaymentAdapter(): StubPaymentAdapter {
  // Resolved once so every signature this adapter produces and every one it
  // verifies use the same secret; a deployment that supplies its own value
  // stops accepting anything signed with the committed constant.
  const stubSecret = config.stripeWebhookSecretStub ?? STUB_WEBHOOK_SECRET;
  const sessions = new Map<string, StubSessionRecord>();
  const ledgerIntents = new Map<string, StripePaymentIntentSummary>();
  const ledgerSubscriptions = new Map<string, StripeSubscriptionSummary>();
  const ledgerInvoices = new Map<string, StripeInvoiceSummary>();
  let nextOutcome: StubOutcome = 'success';

  function inWindow(createdAt: string, window: LedgerWindow): boolean {
    return createdAt >= window.createdAfter && createdAt < window.createdBefore;
  }

  /** Mirrors a synthesized event into the simulated provider ledger, so the
   *  provider's records and the events it sent agree, exactly as they would at
   *  the real Stripe. */
  function reflectEventIntoLedger(event: Record<string, unknown>): void {
    const type = event.type as string;
    const createdAt = new Date((event.created as number) * 1000).toISOString();
    const obj = (event.data as { object: Record<string, unknown> }).object;
    const id = obj.id as string;

    if (type === 'payment_intent.succeeded' || type === 'payment_intent.payment_failed') {
      ledgerIntents.set(id, {
        id,
        amountCents: typeof obj.amount === 'number' ? obj.amount : 0,
        currency: typeof obj.currency === 'string' ? obj.currency.toUpperCase() : 'USD',
        status: type === 'payment_intent.succeeded' ? 'succeeded' : 'requires_payment_method',
        createdAt,
      });
      return;
    }
    if (type.startsWith('customer.subscription.')) {
      ledgerSubscriptions.set(id, {
        id,
        customerId: typeof obj.customer === 'string' ? obj.customer : null,
        status: typeof obj.status === 'string' ? obj.status : 'active',
        amountCents: subscriptionAmountFrom(obj),
        currency: 'USD',
      });
      return;
    }
    if (type === 'invoice.payment_succeeded' || type === 'invoice.payment_failed') {
      const parent = obj.parent as
        | { subscription_details?: { subscription?: unknown } }
        | undefined;
      const linkedSubscription = parent?.subscription_details?.subscription;
      ledgerInvoices.set(id, {
        id,
        subscriptionId: typeof linkedSubscription === 'string' ? linkedSubscription : null,
        amountPaidCents: typeof obj.amount_paid === 'number' ? obj.amount_paid : 0,
        currency: typeof obj.currency === 'string' ? obj.currency.toUpperCase() : 'USD',
        status: type === 'invoice.payment_succeeded' ? 'paid' : 'open',
        createdAt,
      });
    }
  }

  function subscriptionAmountFrom(obj: Record<string, unknown>): number | null {
    const items = obj.items as { data?: Array<{ price?: { unit_amount?: unknown } }> } | undefined;
    const raw = items?.data?.[0]?.price?.unit_amount;
    if (typeof raw === 'number') return raw;
    const meta = obj.metadata as Record<string, unknown> | undefined;
    const fromMeta = Number(meta?.amountCents);
    return Number.isInteger(fromMeta) && fromMeta > 0 ? fromMeta : null;
  }

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
      metadata: truncateMetadataValues({ ...(opts.metadata ?? {}) }),
      outcome: nextOutcome,
      stripeSubscriptionId: null,
      stripeCustomerId: opts.stripeCustomerId ?? null,
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
      // Composed exactly as the live adapter composes it, comment included and
      // capped the same way. A stub that assembles metadata differently from
      // the real client lets a handler pass its tests while reading a key
      // production never sends, or a value production would have truncated.
      metadata: truncateMetadataValues({
        ...(opts.metadata ?? {}),
        ...(opts.comment !== null ? { comment: opts.comment } : {}),
      }),
      outcome: nextOutcome,
      stripeSubscriptionId: newStubId('sub_stub'),
      stripeCustomerId: newStubId('cus_stub'),
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
      ledgerIntents.clear();
      ledgerSubscriptions.clear();
      ledgerInvoices.clear();
      nextOutcome = 'success';
    },
    setLedgerPaymentIntent(summary) {
      ledgerIntents.set(summary.id, summary);
    },
    removeLedgerPaymentIntent(id) {
      ledgerIntents.delete(id);
    },
    setLedgerSubscription(summary) {
      ledgerSubscriptions.set(summary.id, summary);
    },
    removeLedgerSubscription(id) {
      ledgerSubscriptions.delete(id);
    },
    setLedgerInvoice(summary) {
      ledgerInvoices.set(summary.id, summary);
    },
    removeLedgerInvoice(id) {
      ledgerInvoices.delete(id);
    },
    async listPaymentIntents(window) {
      return [...ledgerIntents.values()].filter((i) => inWindow(i.createdAt, window));
    },
    async listSubscriptions() {
      return [...ledgerSubscriptions.values()];
    },
    async listInvoices(window) {
      return [...ledgerInvoices.values()].filter((i) => inWindow(i.createdAt, window));
    },
    async createCheckoutSession(opts) {
      return recordOneTime(opts);
    },
    async createSubscriptionCheckoutSession(opts) {
      return recordSubscription(opts);
    },
    constructWebhookEvent(rawBody, signature) {
      const event = verifyStripeWebhook(rawBody, signature, stubSecret);
      return mapStripeEvent(event);
    },
    buildSignedStubWebhookEvent(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Stub adapter: unknown session ${sessionId}`);
      }
      const eventId = newStubId('evt_stub');
      const created = Math.floor(Date.now() / 1000);
      const event = buildStubEventObject(session, eventId, created);
      reflectEventIntoLedger(event);
      const rawBody = JSON.stringify(event);
      const signature = signStripeWebhook(rawBody, stubSecret);
      return { rawBody, signature };
    },
    buildSignedStubSubscriptionEvent(sessionId, kind, opts = {}) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Stub adapter: unknown session ${sessionId}`);
      }
      if (session.paymentType !== 'subscription') {
        throw new Error(`Stub adapter: session ${sessionId} is not a subscription session`);
      }
      const eventId = newStubId('evt_stub');
      const created = opts.createdSeconds ?? Math.floor(Date.now() / 1000);
      const event = buildStubSubscriptionEventObject(session, kind, eventId, created, opts);
      reflectEventIntoLedger(event);
      const rawBody = JSON.stringify(event);
      const signature = signStripeWebhook(rawBody, stubSecret);
      return { rawBody, signature };
    },
    buildSignedStubRefundEvent(sessionId, opts = {}) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Stub adapter: unknown session ${sessionId}`);
      }
      const eventId = newStubId('evt_stub');
      const created = Math.floor(Date.now() / 1000);
      const event = buildStubRefundEventObject(session, eventId, created, opts);
      // Deliberately not reflected into the ledger: a refunded payment intent
      // keeps reading succeeded at Stripe, and the simulated ledger has to agree
      // or reconciliation would compare against a state the provider never shows.
      const rawBody = JSON.stringify(event);
      const signature = signStripeWebhook(rawBody, stubSecret);
      return { rawBody, signature };
    },
    buildSignedStubAccountEvent(kind, opts = {}) {
      const eventId = newStubId('evt_stub');
      const created = Math.floor(Date.now() / 1000);
      const event = buildStubAccountEventObject(kind, eventId, created, opts);
      const rawBody = JSON.stringify(event);
      const signature = signStripeWebhook(rawBody, stubSecret);
      return { rawBody, signature };
    },
    async cancelSubscriptionAtPeriodEnd(_stripeSubscriptionId) {
      // Stub no-op. The real implementation will set
      // subscription.cancel_at_period_end = true on the Stripe Subscription.
    },
  };
}

// ── Live adapter (Stripe SDK) ─────────────────────────────────────────────────

/**
 * The Stripe API version every payload shape in this codebase is written
 * against, pinned explicitly rather than inherited from whatever the SDK
 * happens to ship.
 *
 * Object shapes move between versions: the subscription linkage on an invoice
 * moved to the invoice's parent, and the invoice's payment-intent and charge
 * fields were removed outright, when invoices gained multiple partial payments.
 * Inheriting the version silently means an unrelated dependency bump can reshape
 * webhook payloads under working code. `tests/unit/stripe-payload-shape.test.ts`
 * asserts the installed SDK still pins this same version, so a bump fails the
 * suite and forces the shapes to be re-read rather than discovering it in
 * production.
 *
 * The webhook endpoint's own API version is configured at Stripe and must be
 * kept equal to this.
 */
export const STRIPE_API_VERSION = '2026-05-27.dahlia';

const STRIPE_SECRET_KEY_NAME = 'stripe_secret_key';

type AppEnvironment = 'staging' | 'production' | 'development' | undefined;

/**
 * Refuses a Stripe key whose mode disagrees with the deployment environment.
 *
 * Both directions are mistakes, and both are quiet ones. A live key outside
 * production means a rehearsal charges real cards. A test key in production
 * means donations appear to succeed while no money is ever collected, which
 * looks healthy from every dashboard the platform has.
 *
 * The design states this directly: test-mode keys only outside production, and
 * separate live and test keys per environment.
 *
 * FOOTBAG_ENV is the discriminator, never NODE_ENV. That follows the standing
 * rule that security posture is not derived from NODE_ENV, and it matters here
 * concretely: non-production deployments pin NODE_ENV=production for hardening
 * parity, so a guard keyed on it would read staging as production and pass a
 * live key straight through. The config layer's SES guard makes the same
 * distinction to keep real email out of non-production.
 *
 * Restricted keys (`rk_`) are checked alongside secret keys (`sk_`), since
 * least-privilege restricted keys are the better credential for this service and
 * a guard that only knew `sk_` would silently stop covering it.
 */
export function assertKeyMatchesEnvironment(
  apiKey: string,
  env: AppEnvironment = config.footbagEnv,
): void {
  const isLiveKey = apiKey.startsWith('sk_live_') || apiKey.startsWith('rk_live_');
  const isTestKey = apiKey.startsWith('sk_test_') || apiKey.startsWith('rk_test_');

  if (isLiveKey && env !== 'production') {
    throw new Error(
      `A live-mode Stripe key was supplied to FOOTBAG_ENV=${env ?? 'unset'}. `
        + 'Only production may hold a live key; every other environment uses a test-mode key. '
        + 'Replace the value in this environment\'s stripe_secret_key parameter with a test key.',
    );
  }
  if (isTestKey && env === 'production') {
    throw new Error(
      'A test-mode Stripe key was supplied to FOOTBAG_ENV=production. Donations would appear '
        + 'to succeed while collecting no money. Replace the value in the production '
        + 'stripe_secret_key parameter with the live key.',
    );
  }
}
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
  customer?: string;
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

/** Stripe list responses are uniform: a page of objects plus a has_more flag,
 *  paged by passing the last id as starting_after. */
/** Per-request options. The idempotency key makes a retried create return the
 *  original result instead of producing a second checkout session or
 *  subscription. */
export interface StripeRequestOptions {
  idempotencyKey?: string;
}

export interface StripeListPage<T> {
  data: T[];
  has_more: boolean;
}

export interface StripeListParams {
  limit: number;
  starting_after?: string;
  created?: { gte: number; lt: number };
}

export interface StripePaymentIntentLike {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
}

export interface StripeSubscriptionLike {
  id: string;
  customer?: string | { id: string } | null;
  status: string;
  items?: { data?: Array<{ price?: { unit_amount?: number | null; currency?: string } }> };
}

export interface StripeInvoiceLike {
  id: string;
  // The subscription an invoice belongs to hangs off its parent; an invoice can
  // also be parented by a quote or by nothing at all, so every level is optional.
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
}

export interface StripeClientLike {
  checkout: {
    sessions: {
      create(
        params: StripeCheckoutSessionCreateParams,
        options?: StripeRequestOptions,
      ): Promise<StripeCheckoutSessionLike>;
    };
  };
  subscriptions: {
    update(id: string, params: { cancel_at_period_end: boolean }): Promise<unknown>;
    list(params: StripeListParams): Promise<StripeListPage<StripeSubscriptionLike>>;
  };
  paymentIntents: {
    list(params: StripeListParams): Promise<StripeListPage<StripePaymentIntentLike>>;
  };
  invoices: {
    list(params: StripeListParams): Promise<StripeListPage<StripeInvoiceLike>>;
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
    deps.stripeFactory
    ?? ((apiKey: string) =>
      new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION }) as unknown as StripeClientLike);

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
    assertKeyMatchesEnvironment(apiKey);
    client = stripeFactory(apiKey);
    return client;
  }

  // Both the client and the API key behind it are held for the life of the
  // process, so a key revoked at Stripe would keep being presented until
  // someone restarts the service. An authentication failure is Stripe telling
  // us the held key is dead: drop it and the client built from it, so the next
  // call fetches whatever the operator put in its place. The failed call still
  // fails; recovery is the following one.
  async function withClient<T>(run: (stripe: StripeClientLike) => Promise<T>): Promise<T> {
    const stripe = await getClient();
    try {
      return await run(stripe);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeAuthenticationError) {
        client = null;
        secrets.invalidate(secretKey);
      }
      throw err;
    }
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
      return withClient(async (stripe) => {
        const metadata = truncateMetadataValues({
          ...(opts.metadata ?? {}),
          paymentId: opts.paymentId,
          memberId: opts.memberId,
        });
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          client_reference_id: opts.paymentId,
          ...(opts.stripeCustomerId ? { customer: opts.stripeCustomerId } : {}),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: opts.currency.toLowerCase(),
                unit_amount: opts.amountCents,
                product_data: { name: truncateProductName(opts.descriptor) },
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
        }, {
          // Keyed on the platform-side payment id, which is minted before this
          // call and is stable across any retry of it, so a retried create returns
          // the original session instead of opening a second one. It is an
          // internal identifier and carries no personal data.
          idempotencyKey: `checkout:${opts.paymentId}`,
        });
        if (!session.url) {
          throw new Error(`Stripe checkout session ${session.id} returned no redirect URL`);
        }
        return {
          sessionId: session.id,
          paymentIntentId: extractPaymentIntentId(session),
          redirectUrl: session.url,
        };
      });
    },

    async createSubscriptionCheckoutSession(opts) {
      return withClient(async (stripe) => {
        // The donation comment rides on the Stripe Subscription by design, so it
        // survives across every later billing cycle. It is carried once, under
        // `comment`; the caller does not add a second copy under another key.
        const metadata = truncateMetadataValues({
          ...(opts.metadata ?? {}),
          paymentId: opts.paymentId,
          memberId: opts.memberId,
          ...(opts.comment !== null ? { comment: opts.comment } : {}),
        });
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          client_reference_id: opts.paymentId,
          ...(opts.stripeCustomerId ? { customer: opts.stripeCustomerId } : {}),
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
        }, {
          // Same reasoning as the one-time path, keyed on the subscription record
          // id: a retried create must not leave the member with two subscriptions.
          idempotencyKey: `subscription-checkout:${opts.paymentId}`,
        });
        if (!session.url) {
          throw new Error(`Stripe checkout session ${session.id} returned no redirect URL`);
        }
        return {
          sessionId: session.id,
          paymentIntentId: null,
          redirectUrl: session.url,
        };
      });
    },

    constructWebhookEvent(rawBody, signature) {
      const secret = config.stripeWebhookSecret;
      if (!secret) {
        // Configuration invariant: live mode requires STRIPE_WEBHOOK_SECRET
        // at boot, so reaching here means the config layer was bypassed.
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured for the live payment adapter');
      }
      const event = verifyStripeWebhook(
        rawBody, signature, secret, config.stripeWebhookSecretPrevious,
      );
      return mapStripeEvent(event);
    },

    async cancelSubscriptionAtPeriodEnd(stripeSubscriptionId) {
      return withClient(async (stripe) => {
        await stripe.subscriptions.update(stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      });
    },

    async listPaymentIntents(window) {
      return withClient(async (stripe) => {
        const raw = await drainList<StripePaymentIntentLike>(
          (params) => stripe.paymentIntents.list(params),
          windowParams(window),
        );
        return raw.map((pi) => ({
          id: pi.id,
          amountCents: pi.amount,
          currency: pi.currency.toUpperCase(),
          status: pi.status,
          createdAt: new Date(pi.created * 1000).toISOString(),
        }));
      });
    },

    async listSubscriptions() {
      return withClient(async (stripe) => {
        // Subscriptions are long-lived, so the reconciliation window that bounds
        // the intent and invoice reads does not apply: a subscription created
        // years ago is still current state to compare against.
        const raw = await drainList<StripeSubscriptionLike>(
          (params) => stripe.subscriptions.list(params),
          {},
        );
        return raw.map((s) => {
          const price = s.items?.data?.[0]?.price;
          return {
            id: s.id,
            customerId: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
            status: s.status,
            amountCents: typeof price?.unit_amount === 'number' ? price.unit_amount : null,
            currency: price?.currency ? price.currency.toUpperCase() : null,
          };
        });
      });
    },

    async listInvoices(window) {
      return withClient(async (stripe) => {
        const raw = await drainList<StripeInvoiceLike>(
          (params) => stripe.invoices.list(params),
          windowParams(window),
        );
        return raw.map((inv) => {
          const linked = inv.parent?.subscription_details?.subscription;
          return {
            id: inv.id,
            subscriptionId: typeof linked === 'string' ? linked : linked?.id ?? null,
            amountPaidCents: inv.amount_paid,
            currency: inv.currency.toUpperCase(),
            status: inv.status,
            createdAt: new Date(inv.created * 1000).toISOString(),
          };
        });
      });
    },
  };
}

const STRIPE_LIST_PAGE_SIZE = 100;

function windowParams(window: LedgerWindow): Partial<StripeListParams> {
  return {
    created: {
      gte: Math.floor(Date.parse(window.createdAfter) / 1000),
      lt: Math.floor(Date.parse(window.createdBefore) / 1000),
    },
  };
}

/** Walks every page of a Stripe list endpoint. Reconciliation that silently
 *  stopped at the first page would report a full ledger's worth of records as
 *  missing, so paging to exhaustion is a correctness requirement here, not an
 *  optimisation. */
async function drainList<T extends { id: string }>(
  fetchPage: (params: StripeListParams) => Promise<StripeListPage<T>>,
  base: Partial<StripeListParams>,
): Promise<T[]> {
  const all: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await fetchPage({
      ...base,
      limit: STRIPE_LIST_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
    startingAfter = page.data[page.data.length - 1].id;
  }
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

/**
 * Installs a double in place of the resolved adapter.
 *
 * The stub answers every provider call in the same tick, which no real provider
 * call does. A test that needs to hold the application at the point where it is
 * waiting on Stripe -- to prove what two requests do when both are past their
 * eligibility check and neither has written yet -- injects a double that
 * completes when the test says so.
 */
export function setPaymentAdapterForTests(adapter: PaymentAdapter): void {
  singleton = adapter;
}

export function resetPaymentAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
