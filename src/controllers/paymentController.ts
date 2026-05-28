import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/paymentService';
import { getPaymentAdapter, type StubPaymentAdapter } from '../adapters/paymentAdapter';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { ValidationError, NotFoundError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { PageViewModel } from '../types/page';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSafePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  );
}

function safeReturnTo(value: unknown, fallback: string): string {
  return isSafePath(value) ? value : fallback;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

interface CheckoutContent {
  sessionId: string;
  descriptor: string;
  amountDisplay: string;
  amountCents: number;
  currency: string;
  confirmHref: string;
  cancelHref: string;
  tier: 'tier1' | 'tier2' | null;
}

interface SuccessContent {
  paymentId: string;
  paymentType: 'membership' | 'donation' | 'event_registration';
  purchasedTierStatus: 'tier1' | 'tier2' | null;
  amountDisplay: string;
  message: string;
  benefits: string;
  continueHref: string;
}

interface CancelContent {
  reason: 'canceled' | 'failed' | 'unknown';
  message: string;
  continueHref: string;
  tryAgainHref: string | null;
}

interface PaymentHistoryRow {
  date: string;
  descriptor: string;
  amountDisplay: string;
  status: string;
}

interface PaymentHistoryContent {
  memberKey: string;
  rows: PaymentHistoryRow[];
}

function formatAmount(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function membershipSuccessMessage(tier: 'tier1' | 'tier2' | null): { message: string; benefits: string } {
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

// ── Controller ──────────────────────────────────────────────────────────────

export const paymentController = {
  /**
   * GET /payments/checkout/:sessionId (stub mode only)
   * Footbag-branded confirm-and-pay page; member confirms the purchase with
   * a single click. In live mode this route is not registered; members are
   * redirected to checkout.stripe.com instead.
   */
  getCheckout(req: Request, res: Response, next: NextFunction): void {
    try {
      const sessionId = req.params.sessionId;
      const adapter = getPaymentAdapter() as StubPaymentAdapter;
      const session = adapter.sessions.get(sessionId);
      if (!session) {
        renderNotFound(res);
        return;
      }
      if (req.user?.userId !== session.memberId) {
        renderNotFound(res);
        return;
      }
      const payment = paymentService.getPaymentBySessionId(sessionId);
      if (!payment || payment.status !== 'pending') {
        // Already-resolved session: bounce to success or cancel as appropriate.
        if (payment?.status === 'succeeded') {
          res.redirect(303, `/payments/success?session_id=${encodeURIComponent(sessionId)}`);
          return;
        }
        renderNotFound(res);
        return;
      }
      res.render('payments/checkout', {
        seo:  { title: 'Confirm payment' },
        page: { sectionKey: '', pageKey: 'payment_checkout', title: 'Confirm payment' },
        content: {
          sessionId,
          descriptor: payment.descriptor,
          amountCents: payment.amount_cents,
          currency: payment.currency,
          amountDisplay: formatAmount(payment.amount_cents, payment.currency),
          confirmHref: `/payments/checkout/${sessionId}/confirm`,
          cancelHref: `/payments/checkout/${sessionId}/cancel`,
          tier: payment.purchased_tier_status,
        },
      } satisfies PageViewModel<CheckoutContent>);
    } catch (err) {
      handleControllerError(err, res, next, 'payment checkout controller');
    }
  },

  /**
   * POST /payments/checkout/:sessionId/confirm (stub mode only)
   * Stub equivalent of "user clicks Pay on Stripe-hosted page". Builds the
   * appropriate synthetic webhook event and feeds it through the same
   * handleWebhook path that real Stripe deliveries use, then 303 redirects
   * to the session's success URL.
   */
  async postCheckoutConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const adapter = getPaymentAdapter() as StubPaymentAdapter;
      const session = adapter.sessions.get(sessionId);
      if (!session) {
        renderNotFound(res);
        return;
      }
      if (req.user?.userId !== session.memberId) {
        renderNotFound(res);
        return;
      }

      // Build the synthetic event for whichever outcome was recorded against
      // the session. Default outcome is 'success'; tests can override via
      // setNextOutcome before the session was created.
      const event = adapter.buildStubWebhookEvent(sessionId);
      await paymentService.handleWebhook(JSON.stringify(event), 'stub-no-signature');

      const target = session.outcome === 'success' ? session.successUrl : session.cancelUrl;
      res.redirect(303, substitutePlaceholders(target, sessionId));
    } catch (err) {
      handleControllerError(err, res, next, 'payment checkout confirm controller');
    }
  },

  /**
   * POST /payments/checkout/:sessionId/cancel (stub mode only)
   * Member abandoned the checkout. Records the outcome on the stub session
   * and fires the checkout.session.expired event so the payment row
   * transitions pending -> canceled (mirrors how Stripe sends the event when
   * a hosted-checkout session is abandoned and ultimately expires).
   */
  async postCheckoutCancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const adapter = getPaymentAdapter() as StubPaymentAdapter;
      const session = adapter.sessions.get(sessionId);
      if (!session) {
        renderNotFound(res);
        return;
      }
      if (req.user?.userId !== session.memberId) {
        renderNotFound(res);
        return;
      }
      adapter.overrideSessionOutcome(sessionId, 'cancel');
      const event = adapter.buildStubWebhookEvent(sessionId);
      await paymentService.handleWebhook(JSON.stringify(event), 'stub-no-signature');
      res.redirect(303, substitutePlaceholders(session.cancelUrl, sessionId));
    } catch (err) {
      handleControllerError(err, res, next, 'payment checkout cancel controller');
    }
  },

  /**
   * GET /payments/success
   * Renders the post-payment confirmation page with US-mandated tier-specific
   * text. The same template renders for both stub and live modes.
   */
  getPaymentSuccess(req: Request, res: Response, next: NextFunction): void {
    try {
      const sessionId =
        typeof req.query.session_id === 'string' ? req.query.session_id : '';
      const payment = sessionId
        ? paymentService.getPaymentBySessionId(sessionId)
        : null;
      if (!payment) {
        renderNotFound(res);
        return;
      }
      if (payment.member_id !== req.user?.userId) {
        renderNotFound(res);
        return;
      }
      const fallback = `/members/${req.user.slug}`;
      const continueHref = safeReturnTo(req.query.returnTo, fallback);
      const { message, benefits } = payment.payment_type === 'membership'
        ? membershipSuccessMessage(payment.purchased_tier_status)
        : { message: 'Payment received.', benefits: '' };

      res.render('payments/success', {
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
      } satisfies PageViewModel<SuccessContent>);
    } catch (err) {
      handleControllerError(err, res, next, 'payment success controller');
    }
  },

  /**
   * GET /payments/cancel
   * Renders the canceled/failed payment landing page with US-mandated text.
   */
  getPaymentCancel(req: Request, res: Response, next: NextFunction): void {
    try {
      const sessionId =
        typeof req.query.session_id === 'string' ? req.query.session_id : '';
      const payment = sessionId
        ? paymentService.getPaymentBySessionId(sessionId)
        : null;
      // Owner-check only if we found a payment row. Anonymous /cancel
      // visits (e.g., bookmarked) still render the generic copy.
      if (payment && payment.member_id !== req.user?.userId) {
        renderNotFound(res);
        return;
      }
      const fallback = req.user ? `/members/${req.user.slug}` : '/';
      const continueHref = safeReturnTo(req.query.returnTo, fallback);
      const tryAgainHref =
        payment && payment.payment_type === 'membership' && payment.purchased_tier_status && req.user
          ? `/members/${req.user.slug}/purchase-tier?tier=${payment.purchased_tier_status}&returnTo=${encodeURIComponent(continueHref)}`
          : null;

      const reason: CancelContent['reason'] =
        payment?.status === 'failed' ? 'failed' :
        payment?.status === 'canceled' ? 'canceled' : 'unknown';
      const message = reason === 'failed'
        ? 'Your payment could not be completed. Your membership tier has not changed.'
        : 'Your payment was not completed. Your membership tier has not changed.';

      res.render('payments/cancel', {
        seo:  { title: 'Payment not completed' },
        page: { sectionKey: '', pageKey: 'payment_cancel', title: 'Payment not completed' },
        content: { reason, message, continueHref, tryAgainHref },
      } satisfies PageViewModel<CancelContent>);
    } catch (err) {
      handleControllerError(err, res, next, 'payment cancel controller');
    }
  },

  /**
   * POST /payments/webhook
   * Stripe webhook receiver. Mounted with express.raw for the raw body
   * needed to verify Stripe-Signature. In stub mode the route is reachable
   * but verification is a no-op.
   */
  async postPaymentWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.get('stripe-signature') ?? '';
    // express.raw delivers req.body as a Buffer. Treat empty / non-Buffer as
    // a 400 (Stripe always sends a body).
    const buf = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).type('text/plain').send('missing body');
      return;
    }
    try {
      await paymentService.handleWebhook(buf.toString('utf8'), signature);
      res.status(200).type('text/plain').send('ok');
    } catch (err) {
      logger.error('stripe webhook processing failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      // Stripe retries on non-2xx; we still ack so the idempotency row
      // (already written by handleWebhook) becomes the source of truth and
      // operators investigate via the processing_status='failed' row.
      res.status(200).type('text/plain').send('ok');
    }
  },

  /**
   * GET /members/:memberKey/payments
   * Owner-only payment history.
   */
  getPaymentHistory(req: Request, res: Response, next: NextFunction): void {
    try {
      const memberKey = req.params.memberKey;
      if (req.user?.slug !== memberKey) {
        renderNotFound(res);
        return;
      }
      const items = paymentService.getPaymentHistoryForMember(req.user.userId);
      const rows: PaymentHistoryRow[] = items.map((p) => ({
        date: p.createdAt.slice(0, 10),
        descriptor: p.descriptor,
        amountDisplay: formatAmount(p.amountCents, p.currency),
        status: p.status,
      }));
      res.render('members/payment-history', {
        seo:  { title: 'Payment history' },
        page: { sectionKey: 'members', pageKey: 'member_payment_history', title: 'Payment history' },
        content: { memberKey, rows },
      } satisfies PageViewModel<PaymentHistoryContent>);
    } catch (err) {
      handleControllerError(err, res, next, 'payment history controller');
    }
  },
};

function substitutePlaceholders(url: string, sessionId: string): string {
  // Stripe Checkout's `{CHECKOUT_SESSION_ID}` placeholder is replaced server-side
  // when the live adapter constructs the redirect; in stub mode we expand it
  // here so the member lands on /payments/success?session_id=<real-id>.
  return url.replace(/\{CHECKOUT_SESSION_ID\}/g, sessionId);
}

// Suppress unused-import warnings for types imported for JSDoc clarity. These
// re-export indirection keeps TS happy when only the runtime values are used.
void ValidationError;
void NotFoundError;
void config;
