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
