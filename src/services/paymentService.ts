/**
 * PaymentService -- Stripe-flow payment processing.
 *
 * Owns:
 *   - `payments` row writes (insert, status transitions)
 *   - `payment_status_transitions` audit ledger writes
 *   - `stripe_events` idempotency writes
 *   - Stripe webhook dispatch and event-type handling
 *   - `recurring_donation_subscriptions` current-state mirror writes and its
 *     append-only `recurring_donation_subscription_transitions` ledger
 *   - The member-level `members.stripe_customer_id` identity, established by a
 *     member's first recurring donation
 *   - Member-facing payment-history and recurring-donation reads
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
 *   - Sending the receipt email (the body is assembled here, then handed to
 *     the communication/outbox path for delivery; no template engine exists)
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
 *   - Payment kill-switch: startMembershipPurchase and startDonation throw
 *     ServiceUnavailableError when payments_paused=1 (runtime config), before
 *     any eligibility check, rate-limit token, or createCheckoutSession call,
 *     so an admin halts purchases without a redeploy.
 *   - Every member action that reaches the payment provider is throttled before
 *     the provider call: both checkout entry points and the cancellation. The
 *     cancellation reads its guard before an await, so an unthrottled double
 *     submit could otherwise call the provider twice and append two rows to an
 *     append-only ledger that records one row per event.
 *   - Recurring donations mirror Stripe, never lead it. Stripe owns the annual
 *     billing cycle, the dunning schedule, and every retry; the local
 *     subscription row moves only in response to a webhook. A member's
 *     cancellation sets cancel_at_period_end at Stripe and records the intent
 *     locally, and the local status becomes canceled only when
 *     customer.subscription.deleted arrives. No platform-side schedule exists.
 *   - A recurring checkout writes nothing locally: the subscription row id is
 *     minted at checkout only as the correlation key carried in Stripe
 *     subscription metadata, and the row is inserted by
 *     customer.subscription.created, so an abandoned checkout leaves no trace.
 *     That same id rides back on the success URL, because the confirmation page
 *     resolves a one-time payment by checkout-session id and a recurring
 *     donation has no such row to find; the reference is request-derived and is
 *     shown only when it belongs to the viewer.
 *   - Only events this platform originated are processed. A one-time checkout
 *     stamps paymentId onto its PaymentIntent and a recurring checkout stamps
 *     subscriptionRecordId onto its Subscription, so an event carrying neither
 *     belongs to something else (a renewal invoice's own intent, or an object
 *     created directly in the Stripe dashboard) and is acknowledged rather than
 *     retried. Retrying it could never succeed, and sustained failures risk the
 *     provider disabling the endpoint for every other event too. An event that
 *     IS ours but whose row is not visible yet stays recoverable, so ordinary
 *     delivery races still redeliver.
 *   - Out-of-order delivery is expected, not exceptional. Every payment status
 *     change records the provider event's own creation time in
 *     last_stripe_event_created, and an event older than the one already applied
 *     is a no-op duplicate, so a late-arriving success cannot undo a refund.
 *     For subscriptions the same hazard is handled by redelivery rather than by
 *     timestamps, since the mirror row may not exist yet.
 *   - Only a full refund reaches the terminal refunded state. The status machine
 *     is monotonic and refunded is terminal, so recording a partial refund there
 *     would be unrecoverable, would misreport the payment on the member's own
 *     history, and would make a later full refund look like a duplicate. A
 *     partial refund is audited and queued for an administrator instead, as is a
 *     refund that matches no local payment.
 *   - A per-cycle donation charge is inserted pending and then transitioned to
 *     succeeded inside the same transaction, so it writes a
 *     payment_status_transitions row like every other status change.
 *   - Payment row written as 'pending' AFTER adapter.createCheckoutSession, in
 *     one INSERT already carrying stripe_checkout_session_id and, when Stripe
 *     created the PaymentIntent eagerly, stripe_payment_intent_id. Stripe may
 *     defer intent creation until the buyer pays, so payment_intent.* handlers
 *     fall back to the paymentId stamped into the intent's metadata at session
 *     creation and backfill the intent id onto the row (IS NULL-guarded, and
 *     only when the row's member_id matches the event-metadata memberId; a row
 *     bound to a different intent, or owned by a different member, is never
 *     re-pointed). A partial unique index
 *     allows only one pending membership payment per member; a concurrent
 *     double-submit fails with ConflictError.
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
 *
 * Persistence:
 *   payments, payment_status_transitions, stripe_events,
 *   recurring_donation_subscriptions,
 *   recurring_donation_subscription_transitions, members.stripe_customer_id,
 *   audit_entries.
 *
 * Side effects:
 *   - audit_entries append (checkout, status transitions, refunds, subscription
 *     lifecycle)
 *   - outbox_emails enqueue (payment receipt, recurring-donation lifecycle
 *     notices, admin alert when a recurring donation ends; all best-effort
 *     after the commit)
 *   - work_queue_items insert in the `payments` category for the money events an
 *     administrator must see: a declined recurring charge, a partially refunded
 *     payment, and a refund matching no local record
 *
 * Provider contract:
 *   Payload shapes are specific to the pinned Stripe API version (see
 *   STRIPE_API_VERSION in the payment adapter). The subscription linkage on an
 *   invoice is read from the invoice's parent, not a top-level field, because
 *   the provider moved it. tests/unit/stripe-payload-shape.test.ts anchors the
 *   fields these handlers read to the installed SDK's own types, so a version
 *   bump fails the suite instead of reshaping payloads under working code.
 */
import { randomUUID } from 'node:crypto';
import {
  payments as paymentsDb,
  paymentStatusTransitions as pstDb,
  stripeEvents as stripeEventsDb,
  recurringDonationSubscriptions as subsDb,
  recurringDonationSubscriptionTransitions as subTransitionsDb,
  memberBilling as memberBillingDb,
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
  RateLimitedError,
  ServiceUnavailableError,
} from './serviceErrors';
import { hit as rateLimitHit } from './rateLimitService';
import {
  applyPurchaseGrantInTx,
  getTierStatus,
  type MemberTier,
} from './membershipTieringService';
import {
  getPaymentAdapter,
  type StripeWebhookEvent,
} from '../adapters/paymentAdapter';
import { emailService } from './emailService';
import { workQueueService } from './workQueueService';
import { isSafePath } from '../lib/safePath';
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
  /** Creation time of the most recent provider event applied to this row, used
   *  to recognise an out-of-order delivery. Null until the first event lands. */
  last_stripe_event_created: string | null;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

/** Local mirror of a Stripe Subscription backing a recurring annual donation.
 *  Stripe owns the billing schedule and the retry policy; every field here is
 *  set from a webhook event, never from a platform-side schedule. */
export interface RecurringSubscriptionRow {
  id: string;
  member_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  amount_cents: number;
  currency: string;
  billing_interval: 'yearly';
  started_at: string;
  status_updated_at: string;
  is_cancel_at_period_end: 0 | 1;
  cancel_requested_at: string | null;
  canceled_at: string | null;
  donation_comment: string | null;
  failure_count: number;
}

export interface StartDonationResult {
  redirectUrl: string;
  sessionId: string;
  /** The donation payment id for a one-time gift, or the subscription record id
   *  the created-subscription webhook will bind, for a recurring one. */
  reference: string;
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
  tryAgain: { action: string; tier: string; returnTo: string } | null;
}

export interface PaymentHistoryRow {
  date: string;
  descriptor: string;
  amountDisplay: string;
  status: string;
  /** Stable payment reference (the payment id) so support/admins can
   *  correlate a member's history row with internal reconciliation tools. */
  reference: string;
}

export interface RecurringDonationRow {
  /** Stable reference the member can quote to support; the local record id. */
  reference: string;
  startedDate: string;
  amountDisplay: string;
  statusLabel: string;
  noteDisplay: string;
  /** True while the donation is live and no cancellation has been requested. */
  showCancel: boolean;
  cancelHref: string;
  /** True once cancellation is requested but the period has not yet ended. */
  isCancelPending: boolean;
}

export interface PaymentHistoryContent {
  memberKey: string;
  rows: PaymentHistoryRow[];
  recurringRows: RecurringDonationRow[];
  hasRecurring: boolean;
  donateHref: string;
  /** True on the redirect that follows a successful cancellation request. */
  cancelConfirmed: boolean;
}

export interface DonateAmountOption {
  cents: number;
  label: string;
}

export interface DonateContent {
  action: string;
  returnTo: string;
  suggestedAmounts: DonateAmountOption[];
  /** Prefilled note for a member holding an honor; empty for everyone else. */
  defaultNote: string;
  minAmountDisplay: string;
  maxAmountDisplay: string;
  noteMaxChars: number;
  hasActiveRecurring: boolean;
  paymentHistoryHref: string;
  formError: string | null;
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

// Donation floor and ceiling. The floor keeps a gift above the point where the
// payment processor's own fee would consume it; the ceiling is a typo guard, so
// a mis-keyed amount is refused at the form rather than charged. Neither is
// administrator-tunable: nothing in the donation flow calls for that.
const DONATION_MIN_CENTS = 100;
const DONATION_MAX_CENTS = 2_000_000;

const HOF_DEFAULT_DONATION_NOTE = 'HoF Fund';
const BAP_DEFAULT_DONATION_NOTE = 'BAP Fund';

// Suggested gift amounts offered on the donations page. A custom amount is
// always available alongside them, so this list is a convenience, not a menu of
// the only permitted values.
const DONATION_SUGGESTED_CENTS = [1000, 2500, 5000, 10000] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function newPaymentId(): string {
  return `pay_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newTransitionId(): string {
  return `pst_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newSubscriptionId(): string {
  return `rds_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newSubscriptionTransitionId(): string {
  return `rst_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
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

interface DonorProfile {
  slug: string;
  loginEmail: string | null;
  realName: string | null;
  isHof: boolean;
  isBap: boolean;
  stripeCustomerId: string | null;
}

function lookupDonorProfile(memberId: string): DonorProfile {
  const row = memberBillingDb.findDonorProfile.get(memberId) as
    | {
        slug: string;
        login_email: string | null;
        real_name: string | null;
        is_hof: number;
        is_bap: number;
        stripe_customer_id: string | null;
      }
    | undefined;
  if (!row) throw new NotFoundError('member not found');
  return {
    slug: row.slug,
    loginEmail: row.login_email,
    realName: row.real_name,
    isHof: row.is_hof === 1,
    isBap: row.is_bap === 1,
    stripeCustomerId: row.stripe_customer_id,
  };
}

// A note long enough to be an essay is a paste accident, not a dedication, and
// it also has to survive a round trip through Stripe metadata.
const DONATION_NOTE_MAX_CHARS = 500;

function normalizeDonationNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > DONATION_NOTE_MAX_CHARS) {
    throw new ValidationError(
      `A donation note is limited to ${DONATION_NOTE_MAX_CHARS} characters.`,
    );
  }
  return trimmed;
}

// A donor who leaves the note blank gets their honor's fund by default. A member
// holding both honors gets the Hall of Fame fund.
function defaultDonationNote(profile: DonorProfile): string | null {
  if (profile.isHof) return HOF_DEFAULT_DONATION_NOTE;
  if (profile.isBap) return BAP_DEFAULT_DONATION_NOTE;
  return null;
}

/**
 * Turns the member's typed amount into whole cents.
 *
 * Accepts either a cents integer (the suggested-amount buttons post one) or a
 * decimal number of dollars. Anything finer than a cent is refused rather than
 * rounded: silently taking a different amount from the one a donor typed is the
 * kind of small dishonesty that erodes trust in a donation form, and the donor
 * can always type the amount they meant.
 */
function parseDonationAmount(raw: unknown): number {
  if (typeof raw === 'number') return validateDonationAmount(raw);
  if (typeof raw !== 'string') throw new ValidationError('Enter a donation amount.');

  const trimmed = raw.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '') throw new ValidationError('Enter a donation amount.');

  // A bare integer is already cents (the suggested amounts); a decimal is
  // dollars. Anchored so stray text, scientific notation and hex are refused
  // rather than coerced into a number nobody typed.
  if (/^\d+$/.test(trimmed)) return validateDonationAmount(Number(trimmed));

  const decimal = /^(\d+)\.(\d{1,2})$/.exec(trimmed);
  if (!decimal) {
    if (/^\d*\.\d{3,}$/.test(trimmed)) {
      throw new ValidationError('A donation amount cannot be smaller than one cent.');
    }
    throw new ValidationError('Enter a donation amount as a number, for example 25 or 25.00.');
  }
  const cents = Number(decimal[1]) * 100 + Number(decimal[2].padEnd(2, '0'));
  return validateDonationAmount(cents);
}

function validateDonationAmount(amountCents: unknown): number {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    throw new ValidationError('Enter a donation amount.');
  }
  if (amountCents < DONATION_MIN_CENTS || amountCents > DONATION_MAX_CENTS) {
    throw new ValidationError(
      `A donation must be between ${formatAmount(DONATION_MIN_CENTS, CURRENCY)} and ${formatAmount(DONATION_MAX_CENTS, CURRENCY)}.`,
    );
  }
  return amountCents;
}

function donationDescriptor(note: string | null, recurring: boolean): string {
  const base = recurring ? 'Recurring Annual Donation' : 'Donation';
  return note ? `${base}: ${note}` : base;
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

/**
 * @param subscriptionRef  Set for a recurring donation. A recurring checkout
 *   writes no payments row, so the success page has nothing to resolve by
 *   checkout-session id; this carries our own subscription record id back to us
 *   so the member gets a confirmation instead of a not-found page. It is
 *   request-derived on the way back and therefore treated as untrusted: the
 *   success page shows a subscription only when it belongs to the viewer.
 */
function buildSuccessUrl(returnTo: string, subscriptionRef?: string): string {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  const ret = encodeURIComponent(returnTo);
  const ref = subscriptionRef ? `&ref=${encodeURIComponent(subscriptionRef)}` : '';
  // `{CHECKOUT_SESSION_ID}` is Stripe's literal placeholder. The live adapter
  // hands this through to Stripe Checkout's `success_url`; Stripe substitutes
  // the real session id at redirect time. The stub adapter just forwards the
  // string unchanged (the stub checkout controller knows the session id from
  // the URL path and ignores the placeholder).
  return `${base}/payments/success?session_id={CHECKOUT_SESSION_ID}&returnTo=${ret}${ref}`;
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

type SubscriptionLifecycleCode =
  | 'activated'
  | 'charge_succeeded'
  | 'charge_failed'
  | 'cancel_requested'
  | 'canceled'
  | 'updated';

function recordSubscriptionTransition(args: {
  subscriptionId: string;
  memberId: string;
  stripeSubscriptionId: string;
  stripeEventId: string | null;
  stripeInvoiceId: string | null;
  eventType: string;
  lifecycleEventCode: SubscriptionLifecycleCode;
  oldStatus: SubscriptionStatus | null;
  newStatus: SubscriptionStatus | null;
  reasonText: string | null;
}): void {
  const now = new Date().toISOString();
  subTransitionsDb.insertTransition.run(
    newSubscriptionTransitionId(),
    now,
    'payment_service',
    args.subscriptionId,
    args.memberId,
    args.stripeEventId,
    args.stripeSubscriptionId,
    args.stripeInvoiceId,
    args.eventType,
    args.lifecycleEventCode,
    args.oldStatus,
    args.newStatus,
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
  // Platform payment kill-switch: an admin halts all membership purchases
  // without a redeploy by setting payments_paused=1 in runtime config. Checked
  // before eligibility, the throttle bucket, or the checkout-session call, so a
  // paused platform opens no Stripe session and reveals no eligibility state.
  if (readIntConfig('payments_paused', 0) === 1) {
    throw new ServiceUnavailableError(
      'Membership purchases are temporarily unavailable. Please try again later.',
    );
  }
  if (!isPurchasableTier(tier)) {
    throw new ValidationError("tier must be 'tier1' or 'tier2'");
  }
  const current = getTierStatus(memberId);
  validateEligibility(current.tier_status, tier);

  // Throttle before the checkout-session call: every attempt creates a
  // session at the payment provider (a real Stripe session in live mode),
  // so an unthrottled burst piles up orphaned sessions.
  const rlMax = readIntConfig('purchase_tier_rate_limit_per_hour', 20);
  const rl = rateLimitHit(`purchase-tier:${memberId}`, rlMax, 60);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many purchase attempts. Please try again later.',
      rl.retryAfterSeconds,
    );
  }

  const slug = lookupSlug(memberId);
  const safeReturn = safeReturnTo(returnTo, `/members/${slug}`);

  const amountCents = tierPriceCents(tier);
  const descriptor = tierDescriptor(tier);
  const paymentId = newPaymentId();
  const now = new Date().toISOString();

  // Create the Stripe checkout session FIRST (external I/O before any DB write),
  // then insert the 'pending' row already populated with the session and
  // payment-intent ids. This guarantees no pending row can exist without the
  // stripe keys every webhook lookup needs (findBySessionId / findByPaymentIntentId);
  // if the insert fails, the abandoned Stripe session is acked as ignored on its
  // checkout.session.expired and the member can retry immediately, with no orphan.
  // A partial unique index (one pending membership payment per member) makes a
  // concurrent double-submit fail at the insert rather than risk a double tier grant.
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
      result.sessionId,
      result.paymentIntentId,
    );
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ConflictError(
        'A membership purchase is already in progress. Complete or cancel it before starting another.',
      );
    }
    throw err;
  }

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
    case 'customer.subscription.created':
      return handleSubscriptionCreated(event);
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event);
    case 'invoice.payment_succeeded':
      return handleInvoicePaymentSucceeded(event);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event);
    default:
      // Every other type Stripe sends that we do not subscribe to is
      // acknowledged so Stripe stops retrying. Record the id for the
      // received-event trail; there is no state to mutate.
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

// Resolves the local payment row for a payment_intent.* event. Primary key
// is the intent id; the fallback covers rows inserted while Stripe had not
// yet created the PaymentIntent (Stripe may defer intent creation until the
// buyer pays, so the pending row carries NULL). Checkout-session creation
// stamps paymentId into the intent's metadata, so the event carries it; a
// fallback hit backfills the intent id onto the row (IS NULL-guarded, so a
// row already bound to a different intent is never re-pointed).
/**
 * Whether a payment_intent event describes a payment this platform started
 * through one-time Checkout.
 *
 * Session creation stamps `paymentId` into the intent's metadata, so every
 * intent we originate carries it. A recurring donation's per-cycle invoice has
 * its own PaymentIntent that we never stamp, and Stripe emits payment_intent
 * events for it exactly as it does for ours. Without this distinction those
 * events find no local row and are answered as recoverable, so Stripe retries a
 * lookup that can never succeed, for days, on every single renewal.
 */
/**
 * Whether this event predates the last one already applied to the payment.
 *
 * The provider does not guarantee delivery order, so a `payment_intent.succeeded`
 * can arrive after the `charge.refunded` that followed it. Without this check
 * the older event would be applied on top of the newer one and quietly undo it.
 * Ties are treated as not-stale, so two events sharing a timestamp both run and
 * the monotonic status machine decides which transitions are legal.
 */
function eventIsStaleForPayment(payment: PaymentRow, event: StripeWebhookEvent): boolean {
  return (
    payment.last_stripe_event_created !== null
    && event.createdAt < payment.last_stripe_event_created
  );
}

function intentEventCarriesPlatformMetadata(event: StripeWebhookEvent): boolean {
  const meta = (event.data?.object as { metadata?: Record<string, unknown> } | undefined)
    ?.metadata;
  return typeof meta?.paymentId === 'string';
}

function findPaymentForIntentEvent(
  event: StripeWebhookEvent,
  paymentIntentId: string,
): PaymentRow | undefined {
  const byIntent = paymentsDb.findByPaymentIntentId.get(paymentIntentId) as
    | PaymentRow
    | undefined;
  if (byIntent) return byIntent;

  const meta = (event.data?.object as { metadata?: Record<string, unknown> } | undefined)
    ?.metadata;
  const paymentId = typeof meta?.paymentId === 'string' ? meta.paymentId : null;
  if (!paymentId) return undefined;

  const byId = paymentsDb.findById.get(paymentId) as PaymentRow | undefined;
  if (!byId) return undefined;
  if (byId.stripe_payment_intent_id !== null) {
    // Metadata points at a row already bound to a different intent; do not
    // trust it (a crafted or stale event must not redirect transitions).
    return undefined;
  }
  const metaMemberId = typeof meta?.memberId === 'string' ? meta.memberId : null;
  if (byId.member_id !== metaMemberId) {
    // Metadata names a different member than the row it points at; a crafted
    // or stale event must not bind this intent onto another member's payment.
    return undefined;
  }
  const now = new Date().toISOString();
  paymentsDb.setPaymentIntentIdIfNull.run(paymentIntentId, now, 'payment_service', paymentId);
  return { ...byId, stripe_payment_intent_id: paymentIntentId };
}

function handlePaymentIntentSucceeded(event: StripeWebhookEvent): WebhookOutcome {
  const paymentIntentId = extractPaymentIntentId(event);
  const payment = findPaymentForIntentEvent(event, paymentIntentId);
  if (!payment) {
    if (!intentEventCarriesPlatformMetadata(event)) {
      return recordIdempotentNoop(event, 'ignored');
    }
    // Recoverable: the pending row may not be visible yet (live-mode glare).
    // 400 -> Stripe retries; nothing was claimed, so the retry re-runs cleanly.
    throw new RecoverableWebhookError(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }

  if (eventIsStaleForPayment(payment, event)) return recordIdempotentNoop(event, 'duplicate');
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
    paymentsDb.updateStatusWithEventTime.run(
      'succeeded', event.createdAt, now, 'payment_service', payment.id,
    );
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
  const payment = findPaymentForIntentEvent(event, paymentIntentId);
  if (!payment) {
    if (!intentEventCarriesPlatformMetadata(event)) {
      return recordIdempotentNoop(event, 'ignored');
    }
    throw new RecoverableWebhookError(
      `no payment row found for stripe_payment_intent_id=${paymentIntentId} (event ${event.id})`,
    );
  }
  if (eventIsStaleForPayment(payment, event)) return recordIdempotentNoop(event, 'duplicate');
  if (payment.status === 'failed') return recordIdempotentNoop(event, 'duplicate');
  if (payment.status !== 'pending') {
    throw new RecoverableWebhookError(
      `payment ${payment.id} cannot transition to failed from status=${payment.status}`,
    );
  }

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    const now = new Date().toISOString();
    paymentsDb.updateStatusWithEventTime.run(
      'failed', event.createdAt, now, 'payment_service', payment.id,
    );
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
  const obj = event.data?.object as
    | { payment_intent?: string; amount?: number; amount_refunded?: number }
    | undefined;
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
    // A refund the platform cannot attribute to one of its own payment rows.
    // A per-cycle donation charge is the ordinary case: it is settled through an
    // invoice, so its row carries no payment intent to match on. Retrying would
    // never resolve it, so this is acknowledged and put in front of an
    // administrator instead of becoming a multi-day retry storm that risks the
    // provider disabling the endpoint for every other event too.
    logger.warn('refund could not be attributed to a local payment', {
      stripePaymentIntentId: paymentIntentId,
      eventId: event.id,
    });
    const outcome = recordIdempotentNoop(event, 'ignored');
    workQueueService.enqueue({
      actorId: 'system',
      queueCategory: 'payments',
      taskType: 'unattributed_refund',
      entityType: 'stripe_payment_intent',
      entityId: paymentIntentId,
      priority: 0,
      reasonText: 'A refund was processed that does not match any local payment record.',
      detailText: null,
    });
    return outcome;
  }

  // A partial refund is not the terminal refunded state. Marking it so would be
  // a lie the schema cannot walk back (the status machine is monotonic and
  // refunded is terminal), it would misreport the donation on the member's own
  // history, and it would make a later full refund look like a duplicate and be
  // silently dropped. Record it and raise it for a human instead.
  const chargeAmount = typeof obj?.amount === 'number' ? obj.amount : null;
  const refundedAmount = typeof obj?.amount_refunded === 'number' ? obj.amount_refunded : null;
  const isFullRefund =
    chargeAmount === null || refundedAmount === null || refundedAmount >= chargeAmount;
  if (!isFullRefund) {
    const outcome = recordIdempotentNoop(event, 'ignored');
    appendAuditEntry({
      actionType: 'payment.partially_refunded',
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
        charge_amount_cents: chargeAmount,
        refunded_amount_cents: refundedAmount,
      },
    });
    workQueueService.enqueue({
      actorId: 'system',
      queueCategory: 'payments',
      taskType: 'partial_refund_review',
      entityType: 'payment',
      entityId: payment.id,
      priority: 0,
      reasonText: 'A payment was partially refunded; the platform records only full refunds.',
      detailText: null,
    });
    return outcome;
  }

  if (eventIsStaleForPayment(payment, event)) return recordIdempotentNoop(event, 'duplicate');
  if (payment.status === 'refunded') return recordIdempotentNoop(event, 'duplicate');
  if (payment.status !== 'succeeded') {
    throw new RecoverableWebhookError(
      `payment ${payment.id} cannot transition to refunded from status=${payment.status}`,
    );
  }

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    const now = new Date().toISOString();
    paymentsDb.updateStatusWithEventTime.run(
      'refunded', event.createdAt, now, 'payment_service', payment.id,
    );
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
    paymentsDb.updateStatusWithEventTime.run(
      'canceled', event.createdAt, now, 'payment_service', payment.id,
    );
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

  try {
    emailService.send({
      template: 'payment_receipt',
      params: {
        descriptor: payment.descriptor,
        amountDisplay: `$${(payment.amount_cents / 100).toFixed(2)} ${payment.currency}`,
        outcome,
        isMembership: payment.payment_type === 'membership',
        purchasedTier:
          payment.purchased_tier_status === 'tier1' || payment.purchased_tier_status === 'tier2'
            ? payment.purchased_tier_status
            : null,
        referenceId: payment.id,
      },
      recipientEmail: contact.loginEmail,
      recipientMemberId: payment.member_id,
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

// ── Subscription and invoice webhook handling ────────────────────────────────
//
// Stripe owns the annual billing cycle and every retry; these handlers only
// mirror what Stripe reports onto local state. Each one claims the event id
// inside the same transaction as the state change it guards, so a mid-processing
// failure rolls the claim back and Stripe's redelivery re-runs the whole unit.

/** Stripe expands some references and leaves others as bare ids; both spellings
 *  reach the webhook depending on the account's expansion settings. */
function stripeIdFrom(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function eventObject(event: StripeWebhookEvent): Record<string, unknown> {
  return (event.data?.object as Record<string, unknown> | undefined) ?? {};
}

function eventMetadata(event: StripeWebhookEvent): Record<string, unknown> {
  const meta = eventObject(event).metadata;
  return (meta as Record<string, unknown> | undefined) ?? {};
}

/** Maps Stripe's subscription status vocabulary onto the three states the
 *  platform mirrors. Stripe's pre-payment states are not yet a live donation, so
 *  they are reported as past_due rather than active. */
function mapStripeSubscriptionStatus(raw: unknown): SubscriptionStatus | null {
  switch (raw) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return null;
  }
}

/**
 * Resolves the Stripe subscription id an INVOICE event refers to.
 *
 * The invoice carries this on its parent, not at the top level: Stripe's 2025
 * restructuring moved the subscription linkage to
 * `invoice.parent.subscription_details.subscription` when it made an invoice
 * capable of holding several partial payments. The legacy top-level field is
 * still read as a fallback, because a Stripe account pinned to an older API
 * version keeps sending the old shape and both must work.
 */
function invoiceSubscriptionId(event: StripeWebhookEvent): string | null {
  const obj = eventObject(event);
  const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  return (
    stripeIdFrom(parent?.subscription_details?.subscription) ?? stripeIdFrom(obj.subscription)
  );
}

/** The subscription id a `customer.subscription.*` event refers to is the event
 *  object's own id, since the object IS the subscription. */
function subscriptionEventSubscriptionId(event: StripeWebhookEvent): string | null {
  const id = eventObject(event).id;
  return typeof id === 'string' ? id : null;
}

/**
 * Whether a subscription event describes a subscription this platform opened.
 *
 * Checkout stamps `subscriptionRecordId` into the Stripe Subscription's
 * metadata, so ours always carry it and one created straight in the Stripe
 * Dashboard never does. The distinction decides what "no local row" means: for
 * one of ours it means the created event has not landed yet and the event must
 * be redelivered, and for anything else it means the event is not ours to
 * process and should be acknowledged.
 */
function subscriptionEventIsOurs(event: StripeWebhookEvent): boolean {
  return typeof eventMetadata(event).subscriptionRecordId === 'string';
}

function loadSubscription(
  stripeSubscriptionId: string | null,
): { row: RecurringSubscriptionRow; stripeSubscriptionId: string } | null {
  if (!stripeSubscriptionId) return null;
  const row = subsDb.findByStripeSubscriptionId.get(stripeSubscriptionId) as
    | RecurringSubscriptionRow
    | undefined;
  return row ? { row, stripeSubscriptionId } : null;
}

function handleSubscriptionCreated(event: StripeWebhookEvent): WebhookOutcome {
  const obj = eventObject(event);
  const meta = eventMetadata(event);
  const stripeSubscriptionId = typeof obj.id === 'string' ? obj.id : null;
  const subscriptionRecordId =
    typeof meta.subscriptionRecordId === 'string' ? meta.subscriptionRecordId : null;
  const memberId = typeof meta.memberId === 'string' ? meta.memberId : null;
  const stripeCustomerId = stripeIdFrom(obj.customer);

  // A subscription created straight in the Stripe Dashboard carries none of our
  // correlation metadata. It is not a platform donation, so it is acknowledged
  // and left alone rather than treated as an error; the nightly reconciliation
  // pass is what surfaces a Stripe subscription with no local counterpart.
  if (!stripeSubscriptionId || !subscriptionRecordId || !memberId || !stripeCustomerId) {
    logger.warn('stripe subscription created without platform correlation metadata', {
      eventId: event.id,
      stripeSubscriptionId,
    });
    return recordIdempotentNoop(event, 'ignored');
  }

  const existing = subsDb.findByStripeSubscriptionId.get(stripeSubscriptionId) as
    | RecurringSubscriptionRow
    | undefined;
  if (existing) return recordIdempotentNoop(event, 'duplicate');

  const amountCents = Number(meta.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RecoverableWebhookError(
      `subscription ${stripeSubscriptionId} carries no usable amount (event ${event.id})`,
    );
  }
  const donationNote = typeof meta.comment === 'string' ? meta.comment : null;
  const now = new Date().toISOString();

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    subsDb.insertSubscription.run(
      subscriptionRecordId,
      now, 'payment_service', now, 'payment_service',
      memberId,
      stripeCustomerId,
      stripeSubscriptionId,
      event.id,
      amountCents,
      CURRENCY,
      now,
      now,
      donationNote,
    );
    recordSubscriptionTransition({
      subscriptionId: subscriptionRecordId,
      memberId,
      stripeSubscriptionId,
      stripeEventId: event.id,
      stripeInvoiceId: null,
      eventType: event.type,
      lifecycleEventCode: 'activated',
      oldStatus: null,
      newStatus: 'active',
      reasonText: null,
    });
    // The member's canonical Stripe Customer identity, established by their
    // first recurring donation and never re-pointed afterwards.
    memberBillingDb.setStripeCustomerIdIfNull.run(
      stripeCustomerId, now, 'payment_service', memberId,
    );
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.recurring_donation_activated',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'recurring_donation_subscription',
    entityId: subscriptionRecordId,
    reasonText: null,
    metadata: {
      member_id: memberId,
      stripe_event_id: event.id,
      stripe_subscription_id: stripeSubscriptionId,
      amount_cents: amountCents,
      currency: CURRENCY,
    },
  });

  const inserted = subsDb.findById.get(subscriptionRecordId) as RecurringSubscriptionRow;
  enqueueSubscriptionEmail(inserted, 'donation_subscription_started');
  return { outcome: 'processed' };
}

function handleInvoicePaymentSucceeded(event: StripeWebhookEvent): WebhookOutcome {
  const found = loadSubscription(invoiceSubscriptionId(event));
  // The invoice can beat customer.subscription.created through the queue, so a
  // missing local row is recoverable: 400 makes Stripe redeliver, and nothing
  // was claimed, so the retry re-runs cleanly.
  if (!found) {
    throw new RecoverableWebhookError(
      `no local subscription for invoice event ${event.id}`,
    );
  }
  const { row: sub, stripeSubscriptionId } = found;
  const obj = eventObject(event);
  const invoiceId = typeof obj.id === 'string' ? obj.id : null;
  const amountCents =
    typeof obj.amount_paid === 'number' ? obj.amount_paid : sub.amount_cents;

  const paymentId = newPaymentId();
  const now = new Date().toISOString();
  const descriptor = donationDescriptor(sub.donation_comment, true);

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    // Inserted pending and then transitioned, rather than inserted succeeded, so
    // this charge writes a payment_status_transitions row like every other
    // status change in the system.
    paymentsDb.insertSubscriptionChargePayment.run(
      paymentId,
      now, 'payment_service', now, 'payment_service',
      sub.member_id,
      amountCents, sub.currency,
      descriptor,
      sub.donation_comment,
      JSON.stringify({ stripe_invoice_id: invoiceId }),
      sub.stripe_customer_id,
      stripeSubscriptionId,
      sub.id,
    );
    paymentsDb.updateStatus.run('succeeded', now, 'payment_service', paymentId);
    pstDb.insertSubscriptionTransition.run(
      newTransitionId(),
      now,
      'payment_service',
      paymentId,
      event.id,
      invoiceId,
      stripeSubscriptionId,
      event.type,
      'pending',
      'succeeded',
      now,
      null,
    );
    recordSubscriptionTransition({
      subscriptionId: sub.id,
      memberId: sub.member_id,
      stripeSubscriptionId,
      stripeEventId: event.id,
      stripeInvoiceId: invoiceId,
      eventType: event.type,
      lifecycleEventCode: 'charge_succeeded',
      oldStatus: sub.status,
      newStatus: 'active',
      reasonText: null,
    });
    // A successful charge clears a past_due subscription without waiting for a
    // separate customer.subscription.updated event.
    if (sub.status !== 'active') {
      subsDb.updateStatus.run(
        'active', now, event.id, now, 'payment_service', sub.id,
      );
    }
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.recurring_charge_succeeded',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'payment',
    entityId: paymentId,
    reasonText: null,
    metadata: {
      member_id: sub.member_id,
      recurring_subscription_id: sub.id,
      stripe_event_id: event.id,
      stripe_invoice_id: invoiceId,
      stripe_subscription_id: stripeSubscriptionId,
      amount_cents: amountCents,
      currency: sub.currency,
    },
  });

  const payment = paymentsDb.findById.get(paymentId) as PaymentRow;
  enqueueReceiptEmail(payment, 'succeeded');
  return { outcome: 'processed' };
}

function handleInvoicePaymentFailed(event: StripeWebhookEvent): WebhookOutcome {
  const found = loadSubscription(invoiceSubscriptionId(event));
  if (!found) {
    throw new RecoverableWebhookError(
      `no local subscription for invoice event ${event.id}`,
    );
  }
  const { row: sub, stripeSubscriptionId } = found;
  const invoiceId = (() => {
    const id = eventObject(event).id;
    return typeof id === 'string' ? id : null;
  })();
  const now = new Date().toISOString();

  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    subsDb.markPastDue.run(now, event.id, now, 'payment_service', sub.id);
    recordSubscriptionTransition({
      subscriptionId: sub.id,
      memberId: sub.member_id,
      stripeSubscriptionId,
      stripeEventId: event.id,
      stripeInvoiceId: invoiceId,
      eventType: event.type,
      lifecycleEventCode: 'charge_failed',
      oldStatus: sub.status,
      newStatus: 'past_due',
      // The platform runs no retry of its own; the dunning schedule configured
      // in the Stripe Dashboard governs every further attempt.
      reasonText: 'stripe reported a failed renewal charge',
    });
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    // Named "declined" rather than "failed": a renewal charge Stripe could not
    // collect is an ordinary donor-side event (an expired card, usually), not a
    // platform fault for an operator to act on, so it must not travel the
    // operational-error path that raises the error alarm.
    actionType: 'payment.recurring_charge_declined',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'recurring_donation_subscription',
    entityId: sub.id,
    reasonText: null,
    metadata: {
      member_id: sub.member_id,
      stripe_event_id: event.id,
      stripe_invoice_id: invoiceId,
      stripe_subscription_id: stripeSubscriptionId,
      failure_count: sub.failure_count + 1,
    },
  });

  // Surfaced on the admin dashboard as a payments work-queue item. Enqueued
  // after the commit, alongside the other side effects, so a notification
  // problem can never roll back the status change it reports.
  workQueueService.enqueue({
    actorId: 'system',
    queueCategory: 'payments',
    taskType: 'recurring_donation_charge_declined',
    entityType: 'recurring_donation_subscription',
    entityId: sub.id,
    priority: 0,
    reasonText: 'A recurring donation renewal charge failed at Stripe.',
    detailText: null,
  });

  const updated = subsDb.findById.get(sub.id) as RecurringSubscriptionRow;
  enqueueSubscriptionEmail(updated, 'donation_subscription_charge_failed');
  return { outcome: 'processed' };
}

function handleSubscriptionDeleted(event: StripeWebhookEvent): WebhookOutcome {
  const found = loadSubscription(subscriptionEventSubscriptionId(event));
  if (!found) {
    // Stripe does not guarantee delivery order, so a cancellation can arrive
    // before the creation it follows. Acknowledging one of ours here would
    // claim the event id and lose the cancellation permanently, leaving a dead
    // subscription looking live; asking for redelivery costs nothing.
    if (subscriptionEventIsOurs(event)) {
      throw new RecoverableWebhookError(
        `subscription ${subscriptionEventSubscriptionId(event)} is not mirrored yet (event ${event.id})`,
      );
    }
    return recordIdempotentNoop(event, 'ignored');
  }
  const { row: sub, stripeSubscriptionId } = found;
  if (sub.status === 'canceled') return recordIdempotentNoop(event, 'duplicate');

  const now = new Date().toISOString();
  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    subsDb.markCanceled.run(now, now, event.id, now, 'payment_service', sub.id);
    recordSubscriptionTransition({
      subscriptionId: sub.id,
      memberId: sub.member_id,
      stripeSubscriptionId,
      stripeEventId: event.id,
      stripeInvoiceId: null,
      eventType: event.type,
      lifecycleEventCode: 'canceled',
      oldStatus: sub.status,
      newStatus: 'canceled',
      // Stripe ends a subscription both when the member asked for it and when
      // dunning is exhausted; the cancel-intent field distinguishes the two.
      reasonText:
        sub.is_cancel_at_period_end === 1
          ? 'member-requested cancellation took effect at period end'
          : 'stripe ended the subscription after exhausting retries',
    });
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.recurring_donation_canceled',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'recurring_donation_subscription',
    entityId: sub.id,
    reasonText: null,
    metadata: {
      member_id: sub.member_id,
      stripe_event_id: event.id,
      stripe_subscription_id: stripeSubscriptionId,
      member_requested: sub.is_cancel_at_period_end === 1,
    },
  });

  const canceled = subsDb.findById.get(sub.id) as RecurringSubscriptionRow;
  enqueueSubscriptionEmail(canceled, 'donation_subscription_canceled');
  emailService.sendToAdmins({
    template: 'admin_recurring_donation_ended',
    params: {
      referenceId: sub.id,
      amountDisplay: formatAmount(sub.amount_cents, sub.currency),
      memberRequested: sub.is_cancel_at_period_end === 1,
    },
    idempotencyKeyPrefix: `recurring-donation-ended:${sub.id}`,
  });
  return { outcome: 'processed' };
}

function handleSubscriptionUpdated(event: StripeWebhookEvent): WebhookOutcome {
  const found = loadSubscription(subscriptionEventSubscriptionId(event));
  if (!found) {
    // Same ordering hazard as the cancellation path above.
    if (subscriptionEventIsOurs(event)) {
      throw new RecoverableWebhookError(
        `subscription ${subscriptionEventSubscriptionId(event)} is not mirrored yet (event ${event.id})`,
      );
    }
    return recordIdempotentNoop(event, 'ignored');
  }
  const { row: sub, stripeSubscriptionId } = found;

  const obj = eventObject(event);
  const nextStatus = mapStripeSubscriptionStatus(obj.status) ?? sub.status;
  const items = (obj.items as { data?: Array<{ price?: { unit_amount?: unknown } }> } | undefined)
    ?.data;
  const rawAmount = items?.[0]?.price?.unit_amount;
  const nextAmount =
    typeof rawAmount === 'number' && Number.isInteger(rawAmount) && rawAmount > 0
      ? rawAmount
      : sub.amount_cents;

  if (nextStatus === sub.status && nextAmount === sub.amount_cents) {
    return recordIdempotentNoop(event, 'duplicate');
  }
  // A Dashboard edit that ends the subscription is recorded by the deleted
  // handler, which owns canceled_at; this one never writes that state.
  if (nextStatus === 'canceled') return recordIdempotentNoop(event, 'ignored');

  const now = new Date().toISOString();
  const claimed = transaction(() => {
    if (!claimEvent(event)) return false;
    subsDb.updateAmountAndStatus.run(
      nextAmount, nextStatus, now, event.id, now, 'payment_service', sub.id,
    );
    recordSubscriptionTransition({
      subscriptionId: sub.id,
      memberId: sub.member_id,
      stripeSubscriptionId,
      stripeEventId: event.id,
      stripeInvoiceId: null,
      eventType: event.type,
      lifecycleEventCode: 'updated',
      oldStatus: sub.status,
      newStatus: nextStatus,
      reasonText: 'stripe reported a subscription change',
    });
    return true;
  });
  if (!claimed) return { outcome: 'duplicate' };

  appendAuditEntry({
    actionType: 'payment.recurring_donation_updated',
    category: 'payment',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'recurring_donation_subscription',
    entityId: sub.id,
    reasonText: null,
    metadata: {
      member_id: sub.member_id,
      stripe_event_id: event.id,
      stripe_subscription_id: stripeSubscriptionId,
      old_status: sub.status,
      new_status: nextStatus,
      old_amount_cents: sub.amount_cents,
      new_amount_cents: nextAmount,
    },
  });
  return { outcome: 'processed' };
}

type SubscriptionEmailTemplate =
  | 'donation_subscription_started'
  | 'donation_subscription_cancel_requested'
  | 'donation_subscription_charge_failed'
  | 'donation_subscription_canceled';

/** Best-effort notification about a subscription lifecycle step. Delivery never
 *  blocks or reverses the state change it reports: the member can always see the
 *  current state on their payment-history page. */
function enqueueSubscriptionEmail(
  sub: RecurringSubscriptionRow,
  template: SubscriptionEmailTemplate,
): void {
  const contact = lookupMemberContact(sub.member_id);
  if (!contact.loginEmail) {
    logger.warn('recurring donation notice skipped: member has no login_email', {
      subscriptionId: sub.id,
      memberId: sub.member_id,
      template,
    });
    return;
  }
  try {
    emailService.send({
      template,
      params: {
        amountDisplay: formatAmount(sub.amount_cents, sub.currency),
        donationNote: sub.donation_comment,
        referenceId: sub.id,
      },
      recipientEmail: contact.loginEmail,
      recipientMemberId: sub.member_id,
      idempotencyKey: `${template}:${sub.id}:${sub.status_updated_at}`,
    });
  } catch (err) {
    logger.warn('recurring donation notice enqueue failed', {
      err: err instanceof Error ? err.message : String(err),
      subscriptionId: sub.id,
      template,
    });
  }
}

function listRecurringDonationsForMember(memberId: string): RecurringSubscriptionRow[] {
  return subsDb.listByMember.all(memberId) as RecurringSubscriptionRow[];
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

/**
 * Stub-mode confirm page for a recurring donation.
 *
 * The one-time page below resolves its amounts from the pending payments row. A
 * recurring checkout has no such row by design, so this shapes the same page
 * from the checkout session itself. Without it the whole recurring flow is
 * unreachable outside live mode, because the page would 404 before the member
 * ever reaches the confirm button.
 */
function getSubscriptionCheckoutPage(session: {
  sessionId: string;
  amountCents: number;
  currency: string;
}): PageViewModel<CheckoutContent> {
  return {
    seo:  { title: 'Confirm donation' },
    page: { sectionKey: '', pageKey: 'payment_checkout', title: 'Confirm donation' },
    content: {
      sessionId: session.sessionId,
      descriptor: 'Recurring Annual Donation',
      amountDisplay: `${formatAmount(session.amountCents, session.currency)} each year`,
      amountCents: session.amountCents,
      currency: session.currency,
      confirmHref: `/payments/checkout/${session.sessionId}/confirm`,
      cancelHref: `/payments/checkout/${session.sessionId}/cancel`,
      declineHref: `/payments/checkout/${session.sessionId}/decline`,
      tier: null,
    },
  };
}

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
  // The browser can reach the success URL before the provider webhook lands
  // (live mode), so the row may still be 'pending' with the tier ungranted.
  // The page must not claim activation yet; the webhook stays the only
  // state mutator, this is display shaping only.
  if (payment.status === 'pending') {
    return {
      seo:  { title: 'Payment processing' },
      page: { sectionKey: '', pageKey: 'payment_success', title: 'Payment processing' },
      content: {
        paymentId: payment.id,
        paymentType: payment.payment_type,
        purchasedTierStatus: payment.purchased_tier_status,
        amountDisplay: formatAmount(payment.amount_cents, payment.currency),
        message: 'Your payment is processing.',
        benefits: payment.payment_type === 'membership'
          ? "We'll activate your membership as soon as your payment is confirmed. You can refresh this page to check for updates."
          : 'You can refresh this page to check for updates.',
        continueHref,
      },
    };
  }
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
  // The retry affordance posts to the POST-only purchase-tier route, so it is
  // shaped as form fields (action + hidden inputs), not a GET href.
  const tryAgain =
    payment && payment.payment_type === 'membership' && payment.purchased_tier_status
      ? {
          action: `/members/${opts.slug}/purchase-tier`,
          tier: payment.purchased_tier_status,
          returnTo: opts.continueHref,
        }
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
    content: { reason, message, continueHref: opts.continueHref, tryAgain },
  };
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Ended',
};

function shapeRecurringRow(
  sub: RecurringSubscriptionRow,
  memberKey: string,
): RecurringDonationRow {
  const isLive = sub.status !== 'canceled';
  const isCancelPending = isLive && sub.is_cancel_at_period_end === 1;
  return {
    reference: sub.id,
    startedDate: sub.started_at.slice(0, 10),
    amountDisplay: formatAmount(sub.amount_cents, sub.currency),
    statusLabel: isCancelPending
      ? 'Ending after this period'
      : SUBSCRIPTION_STATUS_LABELS[sub.status],
    noteDisplay: sub.donation_comment ?? '',
    showCancel: isLive && !isCancelPending,
    cancelHref: `/members/${memberKey}/recurring-donations/${sub.stripe_subscription_id}/cancel`,
    isCancelPending,
  };
}

/**
 * Confirmation page for a recurring donation, which has no payments row to
 * resolve by checkout-session id until its first invoice arrives.
 *
 * Two shapes, because the browser redirect from checkout races Stripe's webhook:
 * once the subscription is mirrored the member sees the confirmed amount; before
 * then they see a truthful "being set up" message rather than a not-found page
 * after having just paid. A reference naming another member's subscription is
 * reported as not found, so the parameter cannot be used to read anything.
 */
function getDonationSuccessPage(
  memberId: string,
  subscriptionRef: string,
  continueHref: string,
): PageViewModel<SuccessContent> | null {
  if (!subscriptionRef.startsWith('rds_')) return null;
  const sub = subsDb.findById.get(subscriptionRef) as RecurringSubscriptionRow | undefined;
  if (sub && sub.member_id !== memberId) return null;

  const confirmed = sub !== undefined;
  return {
    seo: { title: 'Thank you' },
    page: { sectionKey: '', pageKey: 'payment_success', title: 'Thank you' },
    content: {
      paymentId: subscriptionRef,
      paymentType: 'donation',
      purchasedTierStatus: null,
      amountDisplay: confirmed ? formatAmount(sub.amount_cents, sub.currency) : '',
      message: confirmed
        ? 'Your recurring annual donation is set up.'
        : 'Thank you. Your recurring annual donation is being set up.',
      benefits: confirmed
        ? 'It renews each year until you cancel it, and you can cancel at any time from your payment history.'
        : 'It will appear on your payment history shortly. You can cancel it at any time from there.',
      continueHref,
    },
  };
}

function getPaymentHistoryPage(
  memberId: string,
  memberKey: string,
  opts: { cancelConfirmed?: boolean } = {},
): PageViewModel<PaymentHistoryContent> {
  const rows: PaymentHistoryRow[] = getPaymentHistoryForMember(memberId).map((p) => ({
    date: p.createdAt.slice(0, 10),
    descriptor: p.descriptor,
    amountDisplay: formatAmount(p.amountCents, p.currency),
    status: p.status,
    reference: p.id,
  }));
  const recurringRows = listRecurringDonationsForMember(memberId).map((s) =>
    shapeRecurringRow(s, memberKey),
  );
  return {
    seo:  { title: 'Payment history' },
    page: { sectionKey: 'members', pageKey: 'member_payment_history', title: 'Payment history' },
    content: {
      memberKey,
      rows,
      recurringRows,
      hasRecurring: recurringRows.length > 0,
      donateHref: '/donate',
      cancelConfirmed: opts.cancelConfirmed ?? false,
    },
  };
}

function getDonatePage(
  memberId: string,
  opts: { returnTo?: unknown; formError?: string | null } = {},
): PageViewModel<DonateContent> {
  const profile = lookupDonorProfile(memberId);
  const hasActiveRecurring = listRecurringDonationsForMember(memberId).some(
    (s) => s.status !== 'canceled',
  );
  return {
    seo: {
      title: 'Donate',
      description: 'Support the International Footbag Players Association with a one-time or recurring annual donation.',
      noindex: true,
    },
    page: {
      sectionKey: 'members',
      pageKey: 'member_donate',
      title: 'Donate to IFPA',
      intro: 'Your donation supports IFPA and the events, records, and history work the association looks after.',
    },
    content: {
      action: '/donate',
      returnTo: safeReturnTo(opts.returnTo, `/members/${profile.slug}`),
      suggestedAmounts: DONATION_SUGGESTED_CENTS.map((cents) => ({
        cents,
        label: formatAmount(cents, CURRENCY),
      })),
      defaultNote: defaultDonationNote(profile) ?? '',
      minAmountDisplay: formatAmount(DONATION_MIN_CENTS, CURRENCY),
      maxAmountDisplay: formatAmount(DONATION_MAX_CENTS, CURRENCY),
      noteMaxChars: DONATION_NOTE_MAX_CHARS,
      hasActiveRecurring,
      paymentHistoryHref: `/members/${profile.slug}/payments`,
      formError: opts.formError ?? null,
    },
  };
}

// ── Donations ────────────────────────────────────────────────────────────────

/**
 * Opens checkout for a one-time or recurring annual donation.
 *
 * A one-time gift writes its `pending` payments row immediately and is carried
 * to a terminal status by the same `payment_intent.*` handlers that serve
 * membership purchases. A recurring gift writes nothing locally: the
 * subscription row is minted here only as a correlation id, stamped into the
 * Stripe Subscription's metadata, and the row itself is inserted when
 * `customer.subscription.created` arrives. An abandoned recurring checkout
 * therefore leaves no local trace at all.
 */
async function startDonation(
  memberId: string,
  amountCents: unknown,
  comment: unknown,
  recurring: boolean,
  returnTo: unknown,
): Promise<StartDonationResult> {
  // Same kill-switch, checked in the same position, as a membership purchase: a
  // paused platform opens no Stripe session and does no member lookup.
  if (readIntConfig('payments_paused', 0) === 1) {
    throw new ServiceUnavailableError(
      'Donations are temporarily unavailable. Please try again later.',
    );
  }

  const amount = parseDonationAmount(amountCents);
  const profile = lookupDonorProfile(memberId);
  const note = normalizeDonationNote(comment) ?? defaultDonationNote(profile);

  // Throttle before the checkout-session call, because every attempt creates a
  // real session at Stripe in live mode and an unthrottled burst leaves orphans.
  const rlMax = readIntConfig('donation_rate_limit_per_hour', 20);
  const rl = rateLimitHit(`donate:${memberId}`, rlMax, 60);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many donation attempts. Please try again later.',
      rl.retryAfterSeconds,
    );
  }

  const safeReturn = safeReturnTo(returnTo, `/members/${profile.slug}`);
  const descriptor = donationDescriptor(note, recurring);
  const adapter = getPaymentAdapter();

  if (recurring) {
    const subscriptionRecordId = newSubscriptionId();
    const result = await adapter.createSubscriptionCheckoutSession({
      memberId,
      paymentId: subscriptionRecordId,
      amountCents: amount,
      currency: CURRENCY,
      comment: note,
      // Keeps a repeat donor on the one Stripe Customer their first recurring
      // donation established, rather than minting a duplicate per donation.
      stripeCustomerId: profile.stripeCustomerId,
      successUrl: buildSuccessUrl(safeReturn, subscriptionRecordId),
      cancelUrl: buildCancelUrl(safeReturn),
      // Mirrored onto the Stripe Subscription, so customer.subscription.created
      // carries everything the handler needs to insert the local row without a
      // placeholder row existing beforehand.
      // The note is not repeated here: the adapter already carries it once, as
      // `comment`, which is the key the created-subscription handler reads.
      metadata: {
        subscriptionRecordId,
        memberId,
        amountCents: String(amount),
      },
    });

    appendAuditEntry({
      actionType: 'payment.donation_checkout_started',
      category: 'payment',
      actorType: 'member',
      actorMemberId: memberId,
      entityType: 'recurring_donation_subscription',
      entityId: subscriptionRecordId,
      reasonText: null,
      metadata: {
        recurring: true,
        amount_cents: amount,
        currency: CURRENCY,
        session_id: result.sessionId,
      },
    });

    return {
      redirectUrl: result.redirectUrl,
      sessionId: result.sessionId,
      reference: subscriptionRecordId,
    };
  }

  const paymentId = newPaymentId();
  const now = new Date().toISOString();
  const result = await adapter.createCheckoutSession({
    memberId,
    paymentId,
    amountCents: amount,
    currency: CURRENCY,
    descriptor,
    paymentType: 'donation',
    successUrl: buildSuccessUrl(safeReturn),
    cancelUrl: buildCancelUrl(safeReturn),
    metadata: { paymentId, memberId },
  });

  paymentsDb.insertDonationPayment.run(
    paymentId,
    now, memberId, now, memberId,
    memberId,
    amount, CURRENCY,
    descriptor,
    note,
    result.sessionId,
    result.paymentIntentId,
  );

  appendAuditEntry({
    actionType: 'payment.donation_checkout_started',
    category: 'payment',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'payment',
    entityId: paymentId,
    reasonText: null,
    metadata: {
      recurring: false,
      amount_cents: amount,
      currency: CURRENCY,
      session_id: result.sessionId,
      payment_intent_id: result.paymentIntentId,
    },
  });

  return {
    redirectUrl: result.redirectUrl,
    sessionId: result.sessionId,
    reference: paymentId,
  };
}

/**
 * Requests cancellation of a member's own recurring donation.
 *
 * Cancellation is at the period end, so the donor keeps the period they already
 * intended to give and no further charge occurs. The local status stays put:
 * only `customer.subscription.deleted` moves it to canceled, which is what keeps
 * local state a mirror of Stripe rather than a second opinion.
 */
async function cancelRecurringDonation(
  memberId: string,
  stripeSubscriptionId: string,
): Promise<{ status: 'cancel_requested' | 'already_requested' }> {
  const sub = subsDb.findByStripeSubscriptionId.get(stripeSubscriptionId) as
    | RecurringSubscriptionRow
    | undefined;
  // A subscription belonging to someone else is reported exactly as a missing
  // one, so the route cannot be used to probe for other members' donations.
  if (!sub || sub.member_id !== memberId) {
    throw new NotFoundError('recurring donation not found');
  }
  if (sub.status === 'canceled') {
    throw new ConflictError('That recurring donation has already ended.');
  }
  if (sub.is_cancel_at_period_end === 1) {
    return { status: 'already_requested' };
  }

  // Throttle before the provider call, the same way the two checkout entry
  // points do. This path is the one member-facing action that reaches Stripe on
  // every request, and its guard above is read before an await, so a rapid
  // double submit could otherwise call Stripe twice and append two rows to an
  // append-only ledger that documents one row per event.
  const rlMax = readIntConfig('donation_rate_limit_per_hour', 20);
  const rl = rateLimitHit(`cancel-recurring:${memberId}`, rlMax, 60);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many cancellation attempts. Please try again later.',
      rl.retryAfterSeconds,
    );
  }

  // Network call before the transaction: a Stripe failure must leave local state
  // untouched, so the member can retry against an unchanged row.
  const adapter = getPaymentAdapter();
  await adapter.cancelSubscriptionAtPeriodEnd(stripeSubscriptionId);

  const now = new Date().toISOString();
  transaction(() => {
    subsDb.markCancelRequested.run(now, now, 'payment_service', sub.id);
    recordSubscriptionTransition({
      subscriptionId: sub.id,
      memberId,
      stripeSubscriptionId,
      stripeEventId: null,
      stripeInvoiceId: null,
      eventType: 'platform.cancel_requested',
      lifecycleEventCode: 'cancel_requested',
      oldStatus: sub.status,
      newStatus: sub.status,
      reasonText: 'member requested cancellation at period end',
    });
  });

  appendAuditEntry({
    actionType: 'payment.recurring_cancel_requested',
    category: 'payment',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'recurring_donation_subscription',
    entityId: sub.id,
    reasonText: null,
    metadata: {
      stripe_subscription_id: stripeSubscriptionId,
      amount_cents: sub.amount_cents,
      currency: sub.currency,
    },
  });

  enqueueSubscriptionEmail(sub, 'donation_subscription_cancel_requested');
  return { status: 'cancel_requested' };
}

function startEventRegistrationPayment(
  _memberId: string,
  _eventRegistrationId: string,
  _amountCents: number,
): never {
  // Typed ServiceUnavailableError (503), not a bare Error: a stray call site
  // must produce a clean HTTP response, not a stack-trace 500; bare Error is
  // reserved for internal invariant assertions.
  throw new ServiceUnavailableError(
    'Event registration payments are not available yet.',
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
  getDonationSuccessPage,
  getSubscriptionCheckoutPage,
  getDonatePage,
  startDonation,
  startEventRegistrationPayment,
  cancelRecurringDonation,
  listRecurringDonationsForMember,
};
