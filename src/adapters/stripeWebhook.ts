/**
 * Stripe webhook signature primitive: the single home for the real
 * signature-verification and test-signing helpers, shared identically by the
 * stub and live payment adapters. `verifyStripeWebhook` wraps the Stripe SDK's
 * `constructEvent` (the production verifier); `signStripeWebhook` wraps the
 * SDK's `generateTestHeaderString` so the stub adapter can sign synthetic
 * payloads with a real Stripe-Signature header. The same verifier runs in both
 * modes; only the secret differs (STUB_WEBHOOK_SECRET vs the live whsec_). This
 * keeps the signature path exercised by every test instead of leaving it dark
 * until the first live webhook.
 */
import Stripe from 'stripe';

// constructEvent / generateTestHeaderString are pure crypto helpers: no network
// call, no real API key. A placeholder key keeps this module free of any Stripe
// API-key config. apiVersion is irrelevant to the webhook helpers, so it is left
// at the SDK default.
const stripeClient = new Stripe('sk_test_stub_unused');

/**
 * Thrown when an inbound payload fails Stripe signature verification (tampered
 * payload or signature, timestamp outside the tolerance window, or a missing
 * header). The payment controller catches this explicitly and maps it to a 400
 * before any state is written; it does NOT route through handleControllerError.
 */
export class WebhookSignatureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Verifies the raw request body against the Stripe-Signature header using the
 * environment's signing secret, returning the parsed Stripe event on success.
 * Rethrows any signature failure as WebhookSignatureError.
 */
export function verifyStripeWebhook(
  rawBody: string,
  signature: string,
  secret: string,
) {
  try {
    return stripeClient.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      throw new WebhookSignatureError(
        'Stripe webhook signature verification failed',
        { cause: err },
      );
    }
    throw err;
  }
}

/**
 * Produces a valid Stripe-Signature header string for a synthetic payload,
 * signed with the given secret. Used by the stub adapter to sign the events it
 * synthesizes so they pass the same verifier production runs. The optional
 * timestamp (Unix seconds) lets a test produce an expired signature.
 */
export function signStripeWebhook(
  payload: string,
  secret: string,
  timestampSeconds?: number,
): string {
  return stripeClient.webhooks.generateTestHeaderString({
    payload,
    secret,
    ...(timestampSeconds !== undefined ? { timestamp: timestampSeconds } : {}),
  });
}
