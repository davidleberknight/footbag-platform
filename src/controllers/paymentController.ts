import { Request, Response, NextFunction } from 'express';
import { paymentService, RecoverableWebhookError } from '../services/paymentService';
import { getPaymentAdapter, type StubPaymentAdapter } from '../adapters/paymentAdapter';
import { WebhookSignatureError } from '../adapters/stripeWebhook';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { ValidationError, NotFoundError, RateLimitedError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
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
      // A subscription session has no payments row by design, so it is shaped
      // from the session itself rather than from a row that will never exist.
      if (session.paymentType === 'subscription') {
        res.render('payments/checkout', paymentService.getSubscriptionCheckoutPage({
          sessionId,
          amountCents: session.amountCents,
          currency: session.currency,
        }));
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
      const user = req.user;
      if (!user) {
        renderNotFound(res);
        return;
      }
      const continueHref = safeReturnTo(req.query.returnTo, `/members/${user.slug}`);
      const payment = sessionId
        ? paymentService.getPaymentBySessionId(sessionId)
        : null;

      // A recurring donation writes no payments row until its first invoice, so
      // it identifies itself with the reference we put on the success URL. The
      // service verifies the reference belongs to this member.
      if (!payment) {
        const ref = typeof req.query.ref === 'string' ? req.query.ref : '';
        const donation = ref
          ? paymentService.getDonationSuccessPage(user.userId, ref, continueHref)
          : null;
        if (!donation) {
          renderNotFound(res);
          return;
        }
        res.render('payments/success', donation);
        return;
      }
      if (payment.member_id !== user.userId) {
        renderNotFound(res);
        return;
      }
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
        // A rotated-on-one-side signing secret makes EVERY delivery fail here,
        // and it is the failure an operator most needs to hear about, so this
        // branch has to feed the delivery-failure metric too. Counting only the
        // recoverable branch below would leave the one case the alarm exists for
        // completely silent.
        logger.warn('webhook.delivery_failed', {
          provider: 'stripe',
          reason: 'signature',
        });
        res.status(400).type('text/plain').send('invalid signature');
        return;
      }
      if (err instanceof RecoverableWebhookError) {
        // Dotted event name, at warn: production runs at the warn level, and a
        // CloudWatch metric filter matches this message literally to count
        // webhook delivery failures. A prose sentence would drift and silently
        // starve the metric.
        logger.warn('webhook.delivery_failed', {
          provider: 'stripe',
          reason: 'recoverable',
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
      const flash = readFlash(req);
      let cancelConfirmed = false;
      if (flash?.kind === FLASH_KIND.RECURRING_DONATION_CANCELED) {
        cancelConfirmed = true;
        clearFlash(res, req);
      }
      res.render(
        'members/payment-history',
        paymentService.getPaymentHistoryPage(req.user.userId, memberKey, { cancelConfirmed }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'payment history controller');
    }
  },

  /**
   * GET /donate
   * Member-facing donations page. Marked noindex by the service: it is a
   * signed-in action page, not public content.
   */
  getDonate(req: Request, res: Response, next: NextFunction): void {
    try {
      const user = req.user;
      if (!user) {
        renderNotFound(res);
        return;
      }
      res.render(
        'payments/donate',
        paymentService.getDonatePage(user.userId, { returnTo: req.query.returnTo }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'donate page controller');
    }
  },

  /**
   * POST /donate
   * Opens checkout for a one-time or recurring annual donation. A validation
   * failure re-renders the form at 422 with the reason, rather than delegating
   * (a delegated ValidationError renders 404 and would hide the reason).
   */
  async postDonate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user;
    if (!user) {
      renderNotFound(res);
      return;
    }
    const body = req.body as Record<string, unknown>;
    const returnTo = body.returnTo;
    try {
      const result = await paymentService.startDonation(
        user.userId,
        selectDonationAmountInput(body),
        body.note,
        body.recurring === 'yes',
        returnTo,
      );
      res.redirect(303, result.redirectUrl);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render(
          'payments/donate',
          paymentService.getDonatePage(user.userId, { returnTo, formError: err.message }),
        );
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) {
          res.setHeader('Retry-After', String(err.retryAfterSeconds));
        }
        res.status(429).render(
          'payments/donate',
          paymentService.getDonatePage(user.userId, { returnTo, formError: err.message }),
        );
        return;
      }
      handleControllerError(err, res, next, 'donate controller');
    }
  },

  /**
   * POST /members/:memberKey/recurring-donations/:stripeSubscriptionId/cancel
   * Owner-only cancellation of a member's own recurring donation.
   */
  async postCancelRecurringDonation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const memberKey = req.params.memberKey;
    if (req.user?.slug !== memberKey) {
      renderNotFound(res);
      return;
    }
    try {
      await paymentService.cancelRecurringDonation(
        req.user.userId,
        req.params.stripeSubscriptionId,
      );
      writeFlash(res, req, FLASH_KIND.RECURRING_DONATION_CANCELED, memberKey);
      res.redirect(303, `/members/${memberKey}/payments`);
    } catch (err) {
      // Caught locally: the shared handler does not map RateLimitedError, so
      // delegating a throttle hit would answer 500 and raise the operator error
      // alarm for what is an ordinary member double-click.
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) {
          res.setHeader('Retry-After', String(err.retryAfterSeconds));
        }
        res.status(429).render('errors/not-found', {
          seo:  { title: 'Too many requests' },
          page: { sectionKey: '', pageKey: 'error_429', title: err.message },
        });
        return;
      }
      handleControllerError(err, res, next, 'cancel recurring donation controller');
    }
  },
};

/**
 * Resolves the donation amount from either a suggested-amount choice or the
 * custom-amount field. Shape coercion only: the service owns every bound and
 * every error message, so a garbled value arrives as NaN and is rejected there
 * with the same wording a member sees for any other bad amount.
 */
/**
 * Selects which of the two amount inputs the member actually used, and hands the
 * raw value to the service. Selection only: the service owns every bound, every
 * precision rule, and every message, so a garbled value arrives there and is
 * refused with the same wording as any other bad amount.
 */
function selectDonationAmountInput(body: Record<string, unknown>): string {
  const choice = body.amountChoice;
  if (typeof choice === 'string' && choice !== 'custom') return choice;
  const custom = body.customAmount;
  return typeof custom === 'string' ? custom : '';
}

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
