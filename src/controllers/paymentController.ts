import { Request, Response, NextFunction } from 'express';
import { paymentService, RecoverableWebhookError } from '../services/paymentService';
import { getPaymentAdapter, type StubPaymentAdapter } from '../adapters/paymentAdapter';
import { WebhookSignatureError } from '../adapters/stripeWebhook';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { ValidationError, NotFoundError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { isSafePath } from '../lib/safePath';

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeReturnTo(value: unknown, fallback: string): string {
  return isSafePath(value) ? value : fallback;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
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
      res.render('payments/checkout', paymentService.getCheckoutPage(payment));
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

      // Build and sign the synthetic event for whichever outcome was recorded
      // against the session, then feed it through the same verifier and handler
      // a real Stripe delivery uses. Default outcome is 'success'; tests can
      // override via setNextOutcome before the session was created.
      const { rawBody, signature } = adapter.buildSignedStubWebhookEvent(sessionId);
      paymentService.handleWebhook(rawBody, signature);

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
      const { rawBody, signature } = adapter.buildSignedStubWebhookEvent(sessionId);
      paymentService.handleWebhook(rawBody, signature);
      res.redirect(303, substitutePlaceholders(session.cancelUrl, sessionId));
    } catch (err) {
      handleControllerError(err, res, next, 'payment checkout cancel controller');
    }
  },

  /**
   * POST /payments/checkout/:sessionId/decline (stub mode only)
   * Tester affordance that exercises the payment-failure path: forces the stub
   * outcome to 'failure', so buildSignedStubWebhookEvent synthesises a
   * payment_intent.payment_failed event that the webhook handler transitions
   * pending -> failed (no tier grant). Mirrors postCheckoutCancel; redirects to
   * the cancel URL, where the cancel page renders the failure variant.
   */
  async postCheckoutDecline(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      adapter.overrideSessionOutcome(sessionId, 'failure');
      const { rawBody, signature } = adapter.buildSignedStubWebhookEvent(sessionId);
      paymentService.handleWebhook(rawBody, signature);
      res.redirect(303, substitutePlaceholders(session.cancelUrl, sessionId));
    } catch (err) {
      handleControllerError(err, res, next, 'payment checkout decline controller');
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
      const continueHref = safeReturnTo(req.query.returnTo, `/members/${req.user.slug}`);
      res.render('payments/success', paymentService.getPaymentSuccessPage(payment, continueHref));
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
      // requireAuth guarantees an authenticated member; capture it (defensive
      // 404 if the gate is ever misconfigured).
      const user = req.user;
      if (!user) {
        renderNotFound(res);
        return;
      }
      // Enforce ownership when the session_id resolves to a payment row
      // (anti-enumeration: 404 on mismatch).
      if (payment && payment.member_id !== user.userId) {
        renderNotFound(res);
        return;
      }
      const continueHref = safeReturnTo(req.query.returnTo, `/members/${user.slug}`);
      res.render(
        'payments/cancel',
        paymentService.getPaymentCancelPage(payment, { continueHref, slug: user.slug }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'payment cancel controller');
    }
  },

  /**
   * POST /payments/webhook
   * Stripe webhook receiver. Mounted with express.raw for the raw body needed
   * to verify Stripe-Signature. The signature is verified identically in stub
   * and live mode (only the secret differs).
   *
   * Status mapping: a verified event (processed / duplicate / ignored) acks 200
   * so Stripe stops retrying. A bad signature returns 400 with no state written.
   * A recoverable processing failure (no matching row yet, transient) returns
   * 400 so Stripe retries; the un-claimed event re-runs cleanly. An unexpected
   * error returns 500 and trips the alarm via logger.error.
   */
  postPaymentWebhook(req: Request, res: Response): void {
    const signature = req.get('stripe-signature') ?? '';
    // express.raw delivers req.body as a Buffer. Treat empty / non-Buffer as
    // a 400 (Stripe always sends a body).
    const buf = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).type('text/plain').send('missing body');
      return;
    }
    try {
      paymentService.handleWebhook(buf, signature);
      res.status(200).type('text/plain').send('ok');
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        res.status(400).type('text/plain').send('invalid signature');
        return;
      }
      if (err instanceof RecoverableWebhookError) {
        logger.warn('stripe webhook recoverable failure; returning 400 for retry', {
          err: err.message,
        });
        res.status(400).type('text/plain').send('processing error');
        return;
      }
      logger.error('stripe webhook processing failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).type('text/plain').send('error');
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
      res.render(
        'members/payment-history',
        paymentService.getPaymentHistoryPage(req.user.userId, memberKey),
      );
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
