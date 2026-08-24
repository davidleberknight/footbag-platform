/**
 * Guards the payload shapes the Stripe webhook handlers read.
 *
 * These exist because a stub written from the same assumption as the code it
 * exercises cannot falsify that assumption. The subscription linkage on an
 * invoice moved from a top-level field to the invoice's parent; both the
 * handlers and the stub read the retired field, so the whole suite passed while
 * every renewal charge would have failed against real Stripe. The checks below
 * are deliberately anchored to the installed SDK rather than to the stub, so
 * they fail when the provider moves a field again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SDK_ROOT = join(process.cwd(), 'node_modules', 'stripe');

function sdkApiVersion(): string {
  const source = readFileSync(join(SDK_ROOT, 'cjs', 'apiVersion.js'), 'utf8');
  const match = source.match(/exports\.ApiVersion = '([^']+)'/);
  if (!match) throw new Error('could not read the API version from the installed Stripe SDK');
  return match[1];
}

function typeSource(resource: string): string {
  return readFileSync(join(SDK_ROOT, 'cjs', 'resources', `${resource}.d.ts`), 'utf8');
}

/**
 * The generated type files declare the object itself, its nested namespace, and
 * every request-parameter interface in one file, and the same field name recurs
 * across them. So a field check has to be scoped to the object's own interface
 * body; a whole-file search reports a nested or params declaration as if it were
 * a field on the object, which is a false pass on exactly the check that matters.
 */
function objectInterfaceBody(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name} {`);
  if (start === -1) throw new Error(`no exported interface ${name} in the installed SDK types`);
  const end = source.indexOf(`export declare namespace ${name} {`, start);
  return source.slice(start, end === -1 ? undefined : end);
}

/** Fields on the object are declared without `?`; params interfaces declare the
 *  same names optionally. */
function declaresObjectField(body: string, field: string): boolean {
  return new RegExp(`^\\s+${field}:`, 'm').test(body);
}

describe('Stripe API version the payload shapes are written against', () => {
  it('installed SDK pins the same version the adapter pins', async () => {
    // Compared against the adapter's own constant rather than a literal repeated
    // here, so the pin has exactly one home and cannot drift out of agreement
    // with the client that actually talks to Stripe.
    const { STRIPE_API_VERSION } = await import('../../src/adapters/paymentAdapter');
    expect(
      sdkApiVersion(),
      'The installed Stripe SDK pins a different API version than the adapter and the '
        + 'webhook handlers were written against. Re-read the Invoice, Subscription, Charge '
        + 'and Checkout Session shapes for moved or removed fields, and update the Stripe '
        + 'webhook endpoint version to match, before changing the pin.',
    ).toBe(STRIPE_API_VERSION);
  });
});

describe('Invoice: the subscription linkage the invoice handlers depend on', () => {
  const invoices = typeSource('Invoices');
  const invoiceObject = objectInterfaceBody(invoices, 'Invoice');

  it('exposes the linkage on the invoice parent, which is what the handlers read', () => {
    expect(declaresObjectField(invoiceObject, 'parent')).toBe(true);
    expect(invoices).toContain('subscription_details: Parent.SubscriptionDetails | null');
    expect(invoices).toMatch(
      /interface SubscriptionDetails\b[\s\S]{0,600}?subscription: string \| Subscription/,
    );
  });

  it('does not carry a top-level subscription field, the shape that was retired', () => {
    // The regression guard. If this ever fails, the object shape moved again and
    // the parent-based read in the invoice handlers needs revisiting before the
    // assertion is relaxed.
    expect(declaresObjectField(invoiceObject, 'subscription')).toBe(false);
  });

  it('lists invoices as the same object the handlers were checked against', () => {
    // The nightly reconciliation reads invoices from the list endpoint rather
    // than from a webhook, so the linkage checked above only holds for that pass
    // if the list returns the same object type. If the list ever returns a
    // narrower shape, the reconciliation read needs its own check.
    expect(invoices).toMatch(
      /list\(params\?: InvoiceListParams, options\?: RequestOptions\): ApiListPromise<Invoice>;/,
    );
  });

  it('still carries the amount and billing reason the handlers read', () => {
    expect(declaresObjectField(invoiceObject, 'amount_paid')).toBe(true);
    expect(declaresObjectField(invoiceObject, 'billing_reason')).toBe(true);
    expect(invoices).toContain("'subscription_create'");
    expect(invoices).toContain("'subscription_cycle'");
  });
});

describe('PaymentIntent: the fields the handlers and the reconciliation read', () => {
  const intents = typeSource('PaymentIntents');
  const intentObject = objectInterfaceBody(intents, 'PaymentIntent');

  // This object was absent from this file entirely, and its absence is how a
  // real defect shipped: the reconciliation pass skipped renewal intents by
  // reading an `invoice` field on the intent, through the project's own
  // hand-written interface rather than the SDK's. The field does not exist at
  // the pinned version, so the read was always undefined, the skip never fired,
  // and every renewal would have been reported nightly as money the provider
  // settled with no local record. It type-checked cleanly the whole time.
  //
  // The lesson these cases encode: a structural interface the project writes
  // itself is not evidence about the wire. Only the SDK's own declarations are.

  it('does not carry a top-level invoice field, which the reconciliation once read', () => {
    // The regression guard for that bug. If this ever passes, Stripe has added
    // the field back and the discriminator below could be reconsidered — but it
    // should not be relaxed just because the assertion became inconvenient.
    expect(
      declaresObjectField(intentObject, 'invoice'),
      'PaymentIntent now declares an `invoice` field. The reconciliation reverse pass '
        + 'deliberately does not use one: it keys on the platform metadata instead, because '
        + 'this field did not exist and the read silently matched nothing.',
    ).toBe(false);
  });

  it('carries the metadata the reconciliation uses to tell our intents from others', () => {
    // The replacement discriminator. Checkout stamps the platform's own payment
    // id into the intent's metadata, so an intent carrying none is a renewal's
    // own settlement intent or something created in the provider's console.
    // If metadata ever moved, the reverse pass would skip every intent and stop
    // detecting missed webhooks altogether — silently, since skipping produces
    // no issues and no issues looks like health.
    expect(declaresObjectField(intentObject, 'metadata')).toBe(true);
  });

  it('carries the amount, currency and status the comparison comes down to', () => {
    expect(declaresObjectField(intentObject, 'amount')).toBe(true);
    expect(declaresObjectField(intentObject, 'currency')).toBe(true);
    expect(declaresObjectField(intentObject, 'status')).toBe(true);
    expect(declaresObjectField(intentObject, 'created')).toBe(true);
  });

  it('lists payment intents as the same object the comparison was checked against', () => {
    // Same reasoning as the invoice list check: the nightly pass reads intents
    // from the list endpoint, so the fields above only hold for it if the list
    // returns the full object.
    expect(intents).toMatch(
      /list\(params\?: PaymentIntentListParams, options\?: RequestOptions\): ApiListPromise<PaymentIntent>;/,
    );
  });
});

describe('Subscription, Charge and Checkout Session fields the handlers read', () => {
  it('subscription still exposes its customer and items', () => {
    const subscriptions = typeSource('Subscriptions');
    expect(declaresObjectField(subscriptions, 'customer')).toBe(true);
    expect(declaresObjectField(subscriptions, 'items')).toBe(true);
  });

  it('charge still exposes the payment intent the refund handler matches on', () => {
    expect(declaresObjectField(typeSource('Charges'), 'payment_intent')).toBe(true);
  });

  it('charge still exposes both amounts the refund classification turns on', () => {
    // A refund is recorded as full only when both are present and say so, since
    // that reading is terminal. If either field moves, the classification would
    // silently fall back to partial on every refund.
    const charges = objectInterfaceBody(typeSource('Charges'), 'Charge');
    expect(declaresObjectField(charges, 'amount')).toBe(true);
    expect(declaresObjectField(charges, 'amount_refunded')).toBe(true);
  });

  it('dispute still exposes the identifiers and amount the queue item carries', () => {
    const disputes = objectInterfaceBody(typeSource('Disputes'), 'Dispute');
    expect(declaresObjectField(disputes, 'amount')).toBe(true);
    expect(declaresObjectField(disputes, 'charge')).toBe(true);
    expect(declaresObjectField(disputes, 'reason')).toBe(true);
    expect(declaresObjectField(disputes, 'status')).toBe(true);
  });

  it('payout still exposes the amount and failure code the queue item carries', () => {
    const payouts = objectInterfaceBody(typeSource('Payouts'), 'Payout');
    expect(declaresObjectField(payouts, 'amount')).toBe(true);
    expect(declaresObjectField(payouts, 'failure_code')).toBe(true);
  });

  it('checkout session still exposes its mode, subscription and customer', () => {
    const sessions = typeSource(join('Checkout', 'Sessions'));
    expect(declaresObjectField(sessions, 'mode')).toBe(true);
    expect(declaresObjectField(sessions, 'subscription')).toBe(true);
    expect(declaresObjectField(sessions, 'customer')).toBe(true);
  });
});
