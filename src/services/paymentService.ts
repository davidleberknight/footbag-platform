/**
 * PaymentService -- Stripe-flow payment processing.
 *
 * Owns:
 *   - `payments` row writes (insert, status transitions)
 *   - `payment_status_transitions` audit ledger writes
 *   - `stripe_events` idempotency writes
 *   - Stripe webhook dispatch and event-type handling
 *   - Member-facing payment-history reads
 *
 * Does not own:
 *   - Tier-grant ledger writes (delegated to MembershipTieringService.applyPurchaseGrant)
 *   - The actual Stripe SDK calls (delegated to PaymentAdapter)
 *   - Email body rendering (delegated to CommunicationService templates)
 *
 * Required patterns:
 *   - Webhook idempotency: every inbound event id MUST be recorded in
 *     stripe_events before any state mutation. Replays return without
 *     reprocessing (insertEventOrIgnore returns 0 changes on conflict).
 *   - Monotonic state transitions: enforced both by service code and by
 *     trg_payments_status_monotonicity. Every status change writes a
 *     payment_status_transitions row in the same transaction.
 *   - Payment row written as 'pending' BEFORE adapter.createCheckoutSession,
 *     so the row exists for the webhook callback to find by payment_intent_id.
 *   - Tier grant applied ONLY in the webhook success branch. Membership tier
 *     never changes from controller code; the tier change is keyed to the
 *     Stripe-confirmed event id.
 *
 * Transaction discipline:
 *   - All multi-row writes wrap in `transaction(() => ...)`.
 *   - Adapter calls (`createCheckoutSession`) happen OUTSIDE transactions
 *     (they are network calls in live mode).
 *   - `applyPurchaseGrant` opens its own transaction; PaymentService calls
 *     it after the webhook-success transition commits.
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
} from './serviceErrors';
import {
  applyPurchaseGrant,
  getTierStatus,
  type MemberTier,
} from './membershipTieringService';
import {
  getPaymentAdapter,
  type StripeWebhookEvent,
} from '../adapters/paymentAdapter';
import { getCommunicationService } from './communicationService';

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

interface PaymentRow {
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

async function handleWebhook(rawBody: string, signature: string): Promise<void> {
  const adapter = getPaymentAdapter();
  const event = adapter.constructWebhookEvent(rawBody, signature);

  // Idempotency gate. INSERT OR IGNORE; if 0 changes, this event id was
  // already processed and we MUST not double-apply downstream effects.
  const stripeCreated = event.createdAt;
  const insertedNow = new Date().toISOString();
  const res = stripeEventsDb.insertEventOrIgnore.run(
    event.id,
    insertedNow,
    event.type,
    stripeCreated,
    insertedNow,
  );
  if (res.changes === 0) {
    logger.debug('stripe event already processed; skipping', { eventId: event.id, type: event.type });
    return;
  }

  try {
    await dispatchEvent(event);
  } catch (err) {
    stripeEventsDb.markFailed.run(
      err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000),
      event.id,
    );
    throw err;
  }
}

async function dispatchEvent(event: StripeWebhookEvent): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event);
      return;
    case 'payment_intent.payment_failed':
      handlePaymentIntentFailed(event);
      return;
    case 'charge.refunded':
      handleChargeRefunded(event);
      return;
    case 'checkout.session.expired':
      handleCheckoutExpired(event);
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
      throw new Error(
        `Stripe event type '${event.type}' is not yet implemented (recurring-donation slice).`,
      );
    default:
      // Unknown event types are logged and acknowledged. Stripe sends many
      // event types we do not subscribe to; the idempotency row prevents
      // re-handling on retry.
      logger.info('stripe event ignored (no handler)', { eventId: event.id, type: event.type });
      return;
  }
}

function extractPaymentIntentId(event: StripeWebhookEvent): string {
  const obj = event.data?.object as { id?: string } | undefined;
  if (!obj?.id || typeof obj.id !== 'string') {
    throw new Error(`stripe event ${event.id} is missing data.object.id`);
  }
  return obj.id;
}

async function handlePaymentIntentSucceeded(event: StripeWebhookEvent): Promise<void> {
  const paymentIntentId = extractPaymentIntentId(event);
  const payment = paymentsDb.findByPaymentIntentId.get(paymentIntentId) as
    | PaymentRow
    | undefined;
  if (!payment) {
    throw new Error(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }

  if (payment.status === 'succeeded') {
    // Idempotent no-op (another event id already drove the transition).
    return;
  }
  if (payment.status !== 'pending') {
    throw new Error(
      `payment ${payment.id} cannot transition to succeeded from status=${payment.status}`,
    );
  }

  const now = new Date().toISOString();

  transaction(() => {
    paymentsDb.updateStatus.run('succeeded', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'succeeded',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: null,
    });
  });

  if (payment.payment_type === 'membership' && payment.purchased_tier_status) {
    applyPurchaseGrant(
      payment.member_id,
      payment.member_id,
      payment.id,
      payment.purchased_tier_status,
    );
  }

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
}

function handlePaymentIntentFailed(event: StripeWebhookEvent): void {
  const paymentIntentId = extractPaymentIntentId(event);
  const payment = paymentsDb.findByPaymentIntentId.get(paymentIntentId) as
    | PaymentRow
    | undefined;
  if (!payment) {
    throw new Error(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }
  if (payment.status === 'failed') return;
  if (payment.status !== 'pending') {
    throw new Error(
      `payment ${payment.id} cannot transition to failed from status=${payment.status}`,
    );
  }

  const now = new Date().toISOString();
  transaction(() => {
    paymentsDb.updateStatus.run('failed', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'failed',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: 'payment_intent.payment_failed',
    });
  });

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
}

function handleChargeRefunded(event: StripeWebhookEvent): void {
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
    throw new Error(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }
  if (payment.status === 'refunded') return;
  if (payment.status !== 'succeeded') {
    throw new Error(
      `payment ${payment.id} cannot transition to refunded from status=${payment.status}`,
    );
  }

  const now = new Date().toISOString();
  transaction(() => {
    paymentsDb.updateStatus.run('refunded', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'succeeded',
      toStatus: 'refunded',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: 'charge.refunded',
    });
  });

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
}

function handleCheckoutExpired(event: StripeWebhookEvent): void {
  const obj = event.data?.object as { id?: string; payment_intent?: string } | undefined;
  const sessionId = typeof obj?.id === 'string' ? obj.id : null;
  if (!sessionId) {
    throw new Error(`checkout.session.expired event ${event.id} is missing data.object.id`);
  }
  const payment = paymentsDb.findBySessionId.get(sessionId) as PaymentRow | undefined;
  if (!payment) {
    // Session may have been issued for a payment row we never wrote (live
    // mode glare conditions). Treat as informational.
    logger.info('checkout.session.expired for unknown payment row', { eventId: event.id, sessionId });
    return;
  }
  if (payment.status !== 'pending') {
    // Already moved past pending (succeeded, failed, etc.). Idempotent no-op.
    return;
  }

  const now = new Date().toISOString();
  transaction(() => {
    paymentsDb.updateStatus.run('canceled', now, 'payment_service', payment.id);
    recordTransition({
      paymentId: payment.id,
      fromStatus: 'pending',
      toStatus: 'canceled',
      stripeEventId: event.id,
      eventType: event.type,
      reasonText: 'checkout.session.expired',
    });
  });

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
  startDonation,
  startEventRegistrationPayment,
  cancelRecurringDonation,
};
