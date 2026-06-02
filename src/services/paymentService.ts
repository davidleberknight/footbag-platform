/**
 * PaymentService -- Stripe-flow payment processing.
 *
 * Owns:
 *   - `payments` row writes (insert, status transitions)
 *   - `payment_status_transitions` audit ledger writes
 *   - `stripe_events` idempotency writes
 *   - Stripe webhook dispatch and event-type handling
 *   - Member-facing payment-history reads
 *   - Member-facing payment-page view-model shaping (checkout, success, cancel,
 *     payment-history): the `get<Page>Page()` methods compose the full
 *     PageViewModel including copy, amounts, and hrefs. Controllers fetch the
 *     payment row, enforce the ownership/session gate, validate request-derived
 *     redirect targets, then render the returned model without augmenting it.
 *
 * Does not own:
 *   - Tier-grant ledger writes (delegated to
 *     MembershipTieringService.applyPurchaseGrantInTx, called within the
 *     webhook-success transaction so the grant is atomic with the status change)
 *   - The actual Stripe SDK calls (delegated to PaymentAdapter)
 *   - Email body rendering (delegated to CommunicationService templates)
 *
 * Required patterns:
 *   - Webhook signature: handleWebhook verifies the signature first
 *     (adapter.constructWebhookEvent), before any row is read or written; a bad
 *     signature throws WebhookSignatureError -> the controller returns 400.
 *   - Webhook idempotency: a mutating handler CLAIMS the event id
 *     (insertEventOrIgnore) INSIDE the same transaction as the state change it
 *     guards. A failure rolls the claim back so Stripe's retry re-runs cleanly;
 *     a redelivery whose id is already present is a no-op duplicate. No-op
 *     paths (duplicate / ignored event types) record the id for the trail
 *     outside any mutation.
 *   - Monotonic state transitions: enforced both by service code and by
 *     trg_payments_status_monotonicity. Every status change writes a
 *     payment_status_transitions row in the same transaction.
 *   - Payment row written as 'pending' BEFORE adapter.createCheckoutSession,
 *     so the row exists for the webhook callback to find by payment_intent_id.
 *     A partial unique index allows only one pending membership payment per
 *     member; a concurrent double-submit fails with ConflictError.
 *   - Tier grant applied ONLY in the webhook success branch. Membership tier
 *     never changes from controller code; the tier change is keyed to the
 *     Stripe-confirmed event id.
 *   - handleWebhook returns a WebhookOutcome ('processed' | 'duplicate' |
 *     'ignored'); it THROWS WebhookSignatureError or RecoverableWebhookError
 *     for the controller to map to 400.
 *
 * Transaction discipline:
 *   - The webhook-success path claims the event id, transitions
 *     payments.status, writes the payment_status_transitions row, AND applies
 *     the tier grant (applyPurchaseGrantInTx) in ONE transaction. The
 *     db.ts transaction() helper does not nest, so the grant uses the in-tx
 *     variant rather than its own transaction().
 *   - Adapter calls (`createCheckoutSession`) happen OUTSIDE transactions
 *     (they are network calls in live mode).
 *   - Side effects (audit append, receipt-email enqueue) run AFTER the
 *     transaction commits, gated on the processed outcome.
 */
import { randomUUID } from 'node:crypto';
import {
  payments as paymentsDb,
  paymentStatusTransitions as pstDb,
  stripeEvents as stripeEventsDb,
  auth,
  transaction,
} from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { appendAuditEntry } from './auditService';
import { readIntConfig } from './configReader';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from './serviceErrors';
import {
  applyPurchaseGrantInTx,
  getTierStatus,
  type MemberTier,
} from './membershipTieringService';
import {
  getPaymentAdapter,
  type StripeWebhookEvent,
} from '../adapters/paymentAdapter';
import { getCommunicationService } from './communicationService';
import type { PageViewModel } from '../types/page';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StartPurchaseResult {
  redirectUrl: string;
  paymentId: string;
  sessionId: string;
}

export interface PaymentHistoryItem {
  id: string;
  createdAt: string;
  paymentType: 'membership' | 'donation' | 'event_registration';
  amountCents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  descriptor: string;
  purchasedTierStatus: 'tier1' | 'tier2' | null;
}

export interface PaymentRow {
  id: string;
  member_id: string;
  payment_type: 'membership' | 'donation' | 'event_registration';
  amount_cents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  descriptor: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  purchased_tier_status: 'tier1' | 'tier2' | null;
}

// ── Member-facing payment-page view-model content shapes ─────────────────────

export interface CheckoutContent {
  sessionId: string;
  descriptor: string;
  amountDisplay: string;
  amountCents: number;
  currency: string;
  confirmHref: string;
  cancelHref: string;
  declineHref: string;
  tier: 'tier1' | 'tier2' | null;
}

export interface SuccessContent {
  paymentId: string;
  paymentType: 'membership' | 'donation' | 'event_registration';
  purchasedTierStatus: 'tier1' | 'tier2' | null;
  amountDisplay: string;
  message: string;
  benefits: string;
  continueHref: string;
}

export interface CancelContent {
  reason: 'canceled' | 'failed' | 'unknown';
  message: string;
  continueHref: string;
  tryAgainHref: string | null;
}

export interface PaymentHistoryRow {
  date: string;
  descriptor: string;
  amountDisplay: string;
  status: string;
}

export interface PaymentHistoryContent {
  memberKey: string;
  rows: PaymentHistoryRow[];
}

/**
 * Outcome of processing a verified webhook event. All three values are a
 * successful ack (HTTP 200): the event was applied, was a no-op duplicate, or
 * was an event type we deliberately ignore. The controller acks 200 on any of
 * them; it returns a non-2xx only when handleWebhook THROWS.
 */
export type WebhookOutcome = { outcome: 'processed' | 'duplicate' | 'ignored' };

/**
 * Thrown for a recoverable webhook processing failure (no matching payment row
 * yet, or an unexpected source status) where Stripe SHOULD retry. The controller
 * catches this and returns 400 so Stripe re-delivers; nothing is persisted, so
 * the retry re-runs cleanly. Distinct from a bare Error (genuine invariant bug →
 * 500 + alarm) and from WebhookSignatureError (bad signature → 400, no retry
 * value).
 */
export class RecoverableWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoverableWebhookError';
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const TIER1_PRICE_DEFAULT_CENTS = 1000;
const TIER2_PRICE_DEFAULT_CENTS = 5000;
const CURRENCY = 'USD';

// ── Helpers ──────────────────────────────────────────────────────────────────

function newPaymentId(): string {
  return `pay_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newTransitionId(): string {
  return `pst_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function tierPriceCents(tier: 'tier1' | 'tier2'): number {
  return tier === 'tier1'
    ? readIntConfig('tier1_price_cents', TIER1_PRICE_DEFAULT_CENTS)
    : readIntConfig('tier2_price_cents', TIER2_PRICE_DEFAULT_CENTS);
}

function tierDescriptor(tier: 'tier1' | 'tier2'): string {
  return tier === 'tier1'
    ? 'IFPA Tier 1 Membership'
    : 'IFPA Tier 2 Organizer Membership';
}

function isPurchasableTier(value: unknown): value is 'tier1' | 'tier2' {
  return value === 'tier1' || value === 'tier2';
}

function isSafePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  );
}

function validateEligibility(currentTier: MemberTier, target: 'tier1' | 'tier2'): void {
  if (target === 'tier1' && currentTier !== 'tier0') {
    throw new ValidationError(
      'Only Tier 0 members can purchase Tier 1 IFPA Member.',
    );
  }
  if (target === 'tier2' && currentTier !== 'tier0' && currentTier !== 'tier1') {
    throw new ValidationError(
      'Only Tier 0 or Tier 1 members can purchase Tier 2 IFPA Organizer Member.',
    );
  }
}

function lookupSlug(memberId: string): string {
  const row = auth.findMemberForSessionAfterVerify.get(memberId) as
    | { slug: string }
    | undefined;
  if (!row) throw new NotFoundError('member not found');
  return row.slug;
}

function lookupMemberContact(memberId: string): { slug: string; loginEmail: string | null; realName: string | null } {
  const row = auth.findMemberForSessionAfterVerify.get(memberId) as
    | { slug: string; login_email: string | null; real_name: string | null }
    | undefined;
  if (!row) throw new NotFoundError('member not found');
  return { slug: row.slug, loginEmail: row.login_email, realName: row.real_name };
}

function safeReturnTo(value: unknown, fallback: string): string {
  return isSafePath(value) ? value : fallback;
}

function formatAmount(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function membershipSuccessMessage(
  tier: 'tier1' | 'tier2' | null,
): { message: string; benefits: string } {
  if (tier === 'tier1') {
    return {
      message: 'Tier 1 IFPA Member activated!',
      benefits:
        'You can now vote in IFPA elections, participate on IFPA committees, and access IFPA-member-only areas of footbag.org.',
    };
  }
  if (tier === 'tier2') {
    return {
      message: 'Tier 2 IFPA Organizer Member activated!',
      benefits:
        'You can now access organizer features, including applying for event sanctioning, requesting sponsorship, sending community announcements to announce@footbag.org, and accessing organizer-only areas of footbag.org.',
    };
  }
  return { message: 'Payment received.', benefits: '' };
}

function buildSuccessUrl(returnTo: string): string {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  const ret = encodeURIComponent(returnTo);
  // `{CHECKOUT_SESSION_ID}` is Stripe's literal placeholder. The live adapter
  // hands this through to Stripe Checkout's `success_url`; Stripe substitutes
  // the real session id at redirect time. The stub adapter just forwards the
  // string unchanged (the stub checkout controller knows the session id from
  // the URL path and ignores the placeholder).
  return `${base}/payments/success?session_id={CHECKOUT_SESSION_ID}&returnTo=${ret}`;
}

function buildCancelUrl(returnTo: string): string {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  const ret = encodeURIComponent(returnTo);
  return `${base}/payments/cancel?session_id={CHECKOUT_SESSION_ID}&returnTo=${ret}`;
}

function recordTransition(args: {
  paymentId: string;
  fromStatus: PaymentRow['status'];
  toStatus: PaymentRow['status'];
  stripeEventId: string | null;
  eventType: string;
  reasonText: string | null;
}): void {
  const now = new Date().toISOString();
  pstDb.insertTransition.run(
    newTransitionId(),
    now,
    'payment_service',
    args.paymentId,
    args.stripeEventId,
    args.eventType,
    args.fromStatus,
    args.toStatus,
    now,
    args.reasonText,
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

async function startMembershipPurchase(
  memberId: string,
  tier: unknown,
  returnTo: unknown,
): Promise<StartPurchaseResult> {
  if (!isPurchasableTier(tier)) {
    throw new ValidationError("tier must be 'tier1' or 'tier2'");
  }
  const current = getTierStatus(memberId);
  validateEligibility(current.tier_status, tier);

  const slug = lookupSlug(memberId);
  const safeReturn = safeReturnTo(returnTo, `/members/${slug}`);

  const amountCents = tierPriceCents(tier);
  const descriptor = tierDescriptor(tier);
  const paymentId = newPaymentId();
  const now = new Date().toISOString();

  // Insert the payment row as 'pending' so the webhook callback can find it
  // by stripe_payment_intent_id once we have one. The adapter call happens
  // OUTSIDE the transaction because in live mode it is a network call.
  // A partial unique index (one pending membership payment per member) makes a
  // concurrent double-submit fail here rather than risk a double tier grant.
  try {
    paymentsDb.insertPayment.run(
      paymentId,
      now, memberId, now, memberId,
      memberId,
      'membership',
      amountCents, CURRENCY,
      'pending',
      descriptor,
      tier,
      '{}',
    );
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ConflictError(
        'A membership purchase is already in progress. Complete or cancel it before starting another.',
      );
    }
    throw err;
  }

  const adapter = getPaymentAdapter();
  const result = await adapter.createCheckoutSession({
    memberId,
    paymentId,
    amountCents,
    currency: CURRENCY,
    descriptor,
    paymentType: 'membership',
    purchasedTierStatus: tier,
    successUrl: buildSuccessUrl(safeReturn),
    cancelUrl: buildCancelUrl(safeReturn),
    metadata: { paymentId, memberId, tier },
  });

  paymentsDb.updateStripeIdentifiers.run(
    result.sessionId,
    result.paymentIntentId,
    null,
    new Date().toISOString(),
    memberId,
    paymentId,
  );

  appendAuditEntry({
    actionType: 'payment.checkout_started',
    category: 'payment',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'payment',
    entityId: paymentId,
    reasonText: null,
    metadata: {
      payment_type: 'membership',
      tier,
      amount_cents: amountCents,
      currency: CURRENCY,
      session_id: result.sessionId,
      payment_intent_id: result.paymentIntentId,
    },
  });

  return { redirectUrl: result.redirectUrl, paymentId, sessionId: result.sessionId };
}

function handleWebhook(rawBody: string | Buffer, signature: string): WebhookOutcome {
  const adapter = getPaymentAdapter();
  // Signature verification first: a bad, expired, or missing signature throws
  // WebhookSignatureError before any row is read or written (controller -> 400).
  const event = adapter.constructWebhookEvent(rawBody, signature);
  return dispatchEvent(event);
}

function dispatchEvent(event: StripeWebhookEvent): WebhookOutcome {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event);
    case 'payment_intent.payment_failed':
      return handlePaymentIntentFailed(event);
    case 'charge.refunded':
      return handleChargeRefunded(event);
    case 'checkout.session.expired':
      return handleCheckoutExpired(event);
    default:
      // Every other type (subscription/invoice events for the future recurring-
      // donation slice, plus the many types Stripe sends that we do not
      // subscribe to) is acknowledged so Stripe stops retrying. Record the id
      // for the received-event trail; there is no state to mutate.
      logger.info('stripe event ignored (no handler)', { eventId: event.id, type: event.type });
      return recordIdempotentNoop(event, 'ignored');
  }
}

// Records an event id for the received-event trail on a no-op path (duplicate
// or ignored), where there is no state change to guard. INSERT OR IGNORE is
// idempotent on replay.
function recordIdempotentNoop(
  event: StripeWebhookEvent,
  outcome: 'duplicate' | 'ignored',
): WebhookOutcome {
  const now = new Date().toISOString();
  stripeEventsDb.insertEventOrIgnore.run(event.id, now, event.type, event.createdAt, now);
  return { outcome };
}

// Claims an event id INSIDE the caller's transaction. Returns true if this call
// won the insert (proceed with the mutation), false if the id was already
// present (another delivery won; treat as duplicate). Because the insert shares
// the mutation's transaction, any later throw rolls the claim back, so Stripe's
// retry re-runs the whole unit cleanly.
function claimEvent(event: StripeWebhookEvent): boolean {
  const now = new Date().toISOString();
  const res = stripeEventsDb.insertEventOrIgnore.run(
    event.id,
    now,
    event.type,
    event.createdAt,
    now,
  );
  return res.changes === 1;
}

function extractPaymentIntentId(event: StripeWebhookEvent): string {
  const obj = event.data?.object as { id?: string } | undefined;
  if (!obj?.id || typeof obj.id !== 'string') {
    throw new Error(`stripe event ${event.id} is missing data.object.id`);
  }
  return obj.id;
}

function handlePaymentIntentSucceeded(event: StripeWebhookEvent): WebhookOutcome {
  const paymentIntentId = extractPaymentIntentId(event);
  const payment = paymentsDb.findByPaymentIntentId.get(paymentIntentId) as
    | PaymentRow
    | undefined;
  if (!payment) {
    // Recoverable: the pending row may not be visible yet (live-mode glare).
    // 400 -> Stripe retries; nothing was claimed, so the retry re-runs cleanly.
    throw new RecoverableWebhookError(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }

  if (payment.status === 'succeeded') {
    // Another event id already drove the transition. Idempotent no-op.
    return recordIdempotentNoop(event, 'duplicate');
  }
  if (payment.status !== 'pending') {
    throw new RecoverableWebhookError(
      `payment ${payment.id} cannot transition to succeeded from status=${payment.status}`,
    );
  }

  // One transaction: claim the event id, transition pending -> succeeded, write
  // the transition row, AND apply the tier grant. A throw anywhere rolls back
  // all of it, so a charged member is never left without the tier and the
  // un-claimed event is redelivered by Stripe.
  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    const now = new Date().toISOString();
    paymentsDb.updateStatus.run('succeeded', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'succeeded',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: null,
    });
    if (payment.payment_type === 'membership' && payment.purchased_tier_status) {
      applyPurchaseGrantInTx(
        payment.member_id,
        payment.member_id,
        payment.id,
        payment.purchased_tier_status,
      );
    }
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.succeeded',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'payment',
    entityId: payment.id,
    reasonText: null,
    metadata: {
      member_id: payment.member_id,
      payment_type: payment.payment_type,
      purchased_tier_status: payment.purchased_tier_status,
      stripe_event_id: event.id,
      stripe_payment_intent_id: paymentIntentId,
    },
  });

  // Best-effort receipt email. Failure does not roll back the tier grant;
  // the payment is recorded, the tier is granted, and the member can see
  // the row on the payment-history page even without the email.
  enqueueReceiptEmail(payment, 'succeeded');
  return { outcome: 'processed' };
}

function handlePaymentIntentFailed(event: StripeWebhookEvent): WebhookOutcome {
  const paymentIntentId = extractPaymentIntentId(event);
  const payment = paymentsDb.findByPaymentIntentId.get(paymentIntentId) as
    | PaymentRow
    | undefined;
  if (!payment) {
    throw new RecoverableWebhookError(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }
  if (payment.status === 'failed') return recordIdempotentNoop(event, 'duplicate');
  if (payment.status !== 'pending') {
    throw new RecoverableWebhookError(
      `payment ${payment.id} cannot transition to failed from status=${payment.status}`,
    );
  }

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    const now = new Date().toISOString();
    paymentsDb.updateStatus.run('failed', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'failed',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: 'payment_intent.payment_failed',
    });
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.failed',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'payment',
    entityId: payment.id,
    reasonText: null,
    metadata: {
      member_id: payment.member_id,
      payment_type: payment.payment_type,
      stripe_event_id: event.id,
      stripe_payment_intent_id: paymentIntentId,
    },
  });

  enqueueReceiptEmail(payment, 'failed');
  return { outcome: 'processed' };
}

function handleChargeRefunded(event: StripeWebhookEvent): WebhookOutcome {
  const obj = event.data?.object as { payment_intent?: string } | undefined;
  const paymentIntentId = typeof obj?.payment_intent === 'string' ? obj.payment_intent : null;
  if (!paymentIntentId) {
    throw new Error(
      `charge.refunded event ${event.id} is missing data.object.payment_intent`,
    );
  }
  const payment = paymentsDb.findByPaymentIntentId.get(paymentIntentId) as
    | PaymentRow
    | undefined;
  if (!payment) {
    throw new RecoverableWebhookError(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }
  if (payment.status === 'refunded') return recordIdempotentNoop(event, 'duplicate');
  if (payment.status !== 'succeeded') {
    throw new RecoverableWebhookError(
      `payment ${payment.id} cannot transition to refunded from status=${payment.status}`,
    );
  }

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    const now = new Date().toISOString();
    paymentsDb.updateStatus.run('refunded', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'succeeded',
      toStatus: 'refunded',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: 'charge.refunded',
    });
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  // Per DD §6.1: no automatic tier or registration changes on refund.
  // Access changes (if any) are admin-driven via A_Override_Member_Data.

  appendAuditEntry({
    actionType: 'payment.refunded',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'payment',
    entityId: payment.id,
    reasonText: null,
    metadata: {
      member_id: payment.member_id,
      stripe_event_id: event.id,
      stripe_payment_intent_id: paymentIntentId,
    },
  });
  return { outcome: 'processed' };
}

function handleCheckoutExpired(event: StripeWebhookEvent): WebhookOutcome {
  const obj = event.data?.object as { id?: string; payment_intent?: string } | undefined;
  const sessionId = typeof obj?.id === 'string' ? obj.id : null;
  if (!sessionId) {
    throw new Error(`checkout.session.expired event ${event.id} is missing data.object.id`);
  }
  const payment = paymentsDb.findBySessionId.get(sessionId) as PaymentRow | undefined;
  if (!payment) {
    // Session issued for a payment row we never wrote (live-mode glare). Ack so
    // Stripe stops retrying; record the id for the received-event trail.
    logger.info('checkout.session.expired for unknown payment row', { eventId: event.id, sessionId });
    return recordIdempotentNoop(event, 'ignored');
  }
  if (payment.status !== 'pending') {
    // Already moved past pending (succeeded, failed, etc.). Idempotent no-op.
    return recordIdempotentNoop(event, 'duplicate');
  }

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    const now = new Date().toISOString();
    paymentsDb.updateStatus.run('canceled', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'canceled',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: 'checkout.session.expired',
    });
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.canceled',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'payment',
    entityId: payment.id,
    reasonText: null,
    metadata: {
      member_id: payment.member_id,
      stripe_event_id: event.id,
      stripe_checkout_session_id: sessionId,
    },
  });
  return { outcome: 'processed' };
}

function enqueueReceiptEmail(payment: PaymentRow, outcome: 'succeeded' | 'failed'): void {
  const contact = lookupMemberContact(payment.member_id);
  if (!contact.loginEmail) {
    logger.warn(
      'payment receipt skipped: member has no login_email',
      { paymentId: payment.id, memberId: payment.member_id },
    );
    return;
  }

  const isMembership = payment.payment_type === 'membership';
  const amountDisplay = `$${(payment.amount_cents / 100).toFixed(2)} ${payment.currency}`;
  const subject = outcome === 'succeeded'
    ? `Payment received: ${payment.descriptor}`
    : `Payment failed: ${payment.descriptor}`;

  const bodyLines: string[] = [];
  bodyLines.push(outcome === 'succeeded' ? 'Thank you for your payment.' : 'Your payment could not be completed.');
  bodyLines.push('');
  bodyLines.push(`Item:    ${payment.descriptor}`);
  bodyLines.push(`Amount:  ${amountDisplay}`);
  if (outcome === 'succeeded' && isMembership && payment.purchased_tier_status === 'tier1') {
    bodyLines.push('');
    bodyLines.push('Your Tier 1 IFPA Member status is now active.');
  } else if (outcome === 'succeeded' && isMembership && payment.purchased_tier_status === 'tier2') {
    bodyLines.push('');
    bodyLines.push('Your Tier 2 IFPA Organizer Member status is now active.');
  } else if (outcome === 'failed') {
    bodyLines.push('');
    bodyLines.push('No charge was applied and your membership tier was not changed.');
    bodyLines.push('You can try again from your dashboard.');
  }
  bodyLines.push('');
  bodyLines.push('Reference: ' + payment.id);

  try {
    getCommunicationService().enqueueEmail({
      recipientEmail: contact.loginEmail,
      recipientMemberId: payment.member_id,
      subject,
      bodyText: bodyLines.join('\n'),
      idempotencyKey: `payment_receipt:${payment.id}:${outcome}`,
    });
  } catch (err) {
    // Best-effort: log but never block on receipt-email failure.
    logger.warn(
      'payment receipt email enqueue failed',
      { err: err instanceof Error ? err.message : String(err), paymentId: payment.id, outcome },
    );
  }
}

function getPaymentHistoryForMember(memberId: string): PaymentHistoryItem[] {
  const rows = paymentsDb.listByMember.all(memberId) as Array<{
    id: string;
    created_at: string;
    payment_type: 'membership' | 'donation' | 'event_registration';
    amount_cents: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
    descriptor: string;
    purchased_tier_status: 'tier1' | 'tier2' | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    paymentType: r.payment_type,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    descriptor: r.descriptor,
    purchasedTierStatus: r.purchased_tier_status,
  }));
}

function getPaymentBySessionId(sessionId: string): PaymentRow | null {
  const row = paymentsDb.findBySessionId.get(sessionId) as PaymentRow | undefined;
  return row ?? null;
}

// ── Member-facing payment-page shaping ───────────────────────────────────────
//
// These compose the full PageViewModel for each payment page. The controller
// fetches the payment row (getPaymentBySessionId), enforces the ownership /
// session gate, and validates request-derived redirect targets (safe-path);
// it then passes the row plus the already-validated continueHref here and
// renders the result without augmenting it.

function getCheckoutPage(payment: PaymentRow): PageViewModel<CheckoutContent> {
  return {
    seo:  { title: 'Confirm payment' },
    page: { sectionKey: '', pageKey: 'payment_checkout', title: 'Confirm payment' },
    content: {
      sessionId: payment.stripe_checkout_session_id ?? '',
      descriptor: payment.descriptor,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      amountDisplay: formatAmount(payment.amount_cents, payment.currency),
      confirmHref: `/payments/checkout/${payment.stripe_checkout_session_id}/confirm`,
      cancelHref: `/payments/checkout/${payment.stripe_checkout_session_id}/cancel`,
      declineHref: `/payments/checkout/${payment.stripe_checkout_session_id}/decline`,
      tier: payment.purchased_tier_status,
    },
  };
}

function getPaymentSuccessPage(
  payment: PaymentRow,
  continueHref: string,
): PageViewModel<SuccessContent> {
  const { message, benefits } = payment.payment_type === 'membership'
    ? membershipSuccessMessage(payment.purchased_tier_status)
    : { message: 'Payment received.', benefits: '' };
  return {
    seo:  { title: 'Payment confirmed' },
    page: { sectionKey: '', pageKey: 'payment_success', title: 'Payment confirmed' },
    content: {
      paymentId: payment.id,
      paymentType: payment.payment_type,
      purchasedTierStatus: payment.purchased_tier_status,
      amountDisplay: formatAmount(payment.amount_cents, payment.currency),
      message,
      benefits,
      continueHref,
    },
  };
}

function getPaymentCancelPage(
  payment: PaymentRow | null,
  opts: { continueHref: string; slug: string },
): PageViewModel<CancelContent> {
  const tryAgainHref =
    payment && payment.payment_type === 'membership' && payment.purchased_tier_status
      ? `/members/${opts.slug}/purchase-tier?tier=${payment.purchased_tier_status}&returnTo=${encodeURIComponent(opts.continueHref)}`
      : null;
  const reason: CancelContent['reason'] =
    payment?.status === 'failed' ? 'failed' :
    payment?.status === 'canceled' ? 'canceled' : 'unknown';
  const message = reason === 'failed'
    ? 'Your payment could not be completed. Your membership tier has not changed.'
    : 'Your payment was not completed. Your membership tier has not changed.';
  return {
    seo:  { title: 'Payment not completed' },
    page: { sectionKey: '', pageKey: 'payment_cancel', title: 'Payment not completed' },
    content: { reason, message, continueHref: opts.continueHref, tryAgainHref },
  };
}

function getPaymentHistoryPage(
  memberId: string,
  memberKey: string,
): PageViewModel<PaymentHistoryContent> {
  const rows: PaymentHistoryRow[] = getPaymentHistoryForMember(memberId).map((p) => ({
    date: p.createdAt.slice(0, 10),
    descriptor: p.descriptor,
    amountDisplay: formatAmount(p.amountCents, p.currency),
    status: p.status,
  }));
  return {
    seo:  { title: 'Payment history' },
    page: { sectionKey: 'members', pageKey: 'member_payment_history', title: 'Payment history' },
    content: { memberKey, rows },
  };
}

// ── Donation / event-registration / recurring (not yet implemented) ──────────

function startDonation(
  _memberId: string,
  _amountCents: number,
  _comment: string | null,
  _recurring: boolean,
): never {
  throw new Error(
    'startDonation is not yet implemented (donation-flow slice). The PaymentAdapter interface and stub already cover this; wire the service body once M_Donate is implemented.',
  );
}

function startEventRegistrationPayment(
  _memberId: string,
  _eventRegistrationId: string,
  _amountCents: number,
): never {
  throw new Error(
    'startEventRegistrationPayment is not yet implemented (event-registration slice).',
  );
}

function cancelRecurringDonation(
  _memberId: string,
  _stripeSubscriptionId: string,
): never {
  throw new Error(
    'cancelRecurringDonation is not yet implemented (recurring-donation slice).',
  );
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const paymentService = {
  startMembershipPurchase,
  handleWebhook,
  getPaymentHistoryForMember,
  getPaymentBySessionId,
  getCheckoutPage,
  getPaymentSuccessPage,
  getPaymentCancelPage,
  getPaymentHistoryPage,
  startDonation,
  startEventRegistrationPayment,
  cancelRecurringDonation,
};
