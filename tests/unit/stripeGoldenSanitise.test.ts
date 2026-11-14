/**
 * The sanitiser that turns captured Stripe events into the committed golden set.
 *
 * The set is public, so a field this lets through publishes a donor's name,
 * address, card digits or own words, or a real provider id that makes their
 * payment history findable. And the set exists to carry the provider's real
 * structure, so a field this drops or reorders, or an id it rewrites
 * inconsistently, makes the replay prove something about a shape Stripe never
 * sent. Both directions are pinned here, along with the one check the capture
 * and the replay suite share.
 */
import { describe, it, expect } from 'vitest';

import {
  IdMapper,
  isIdShaped,
  isSyntheticId,
  sanitiseEvent,
  serialiseEvent,
  findSanitisationViolations,
  parseManifest,
  buildGoldenSet,
  GOLDEN_SOURCE,
  type GoldenPayloadEntry,
} from '../../scripts/lib/stripe-golden-sanitise';

const CUSTOMER = 'cus_Q1w2E3r4T5y6U7';
const SUBSCRIPTION = 'sub_1Ab2Cd3Ef4Gh5Ij6';
const SESSION = 'cs_test_a1B2c3D4e5F6g7H8';
const PAYMENT = 'pay_3e1f5a0b33fc4009b69a0ec7';
const MEMBER = 'member_0a1b2c3d4e5f60718293a4b5';

/** A renewal invoice event in the provider's layout, carrying every field class the sanitiser treats. */
function renewalInvoice(livemode = false): Record<string, unknown> {
  return {
    id: 'evt_1Pq2Rs3Tu4Vw5Xy6',
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: 1767225600,
    data: {
      object: {
        id: 'in_1Zz9Yy8Xx7Ww6Vv5',
        object: 'invoice',
        billing_reason: 'subscription_cycle',
        collection_method: 'charge_automatically',
        customer: CUSTOMER,
        customer_name: 'Pat Donor',
        customer_email: 'pat@example.org',
        customer_phone: '+1 555 0100',
        customer_address: { city: 'Boulder', country: 'US', line1: '1 Main St', postal_code: '80302' },
        hosted_invoice_url: 'https://invoice.stripe.com/i/acct_x/test_y',
        invoice_pdf: 'https://pay.stripe.com/invoice/acct_x/test_y/pdf',
        amount_paid: 2500,
        parent: {
          subscription_details: {
            subscription: SUBSCRIPTION,
            metadata: {
              subscriptionRecordId: 'rds_9f8e7d6c5b4a39281706f5e4',
              memberId: MEMBER,
              paymentId: PAYMENT,
              comment: 'In memory of a friend',
              donation_note: 'In memory of a friend',
              amountCents: '2500',
            },
          },
          type: 'subscription_details',
        },
        payments: {
          data: [{ payment: { payment_intent: 'pi_3U6jlzPD9Y5ur16e', type: 'payment_intent' } }],
        },
        charge: {
          id: 'ch_3U6jlzPD9Y5ur16e',
          billing_details: { name: 'Pat Donor', email: 'pat@example.org', phone: null, tax_id: 'DE123456789' },
          payment_method_details: { card: { brand: 'visa', fingerprint: 'Xy12Ab34Cd56', last4: '4242' } },
          receipt_url: 'https://pay.stripe.com/receipts/x',
        },
        checkout: { id: SESSION, client_secret: 'cs_test_secret_value', url: 'https://checkout.stripe.com/c/pay/x' },
      },
    },
    livemode,
    request: { id: 'req_Ab12Cd34Ef56Gh', idempotency_key: 'checkout:pay_3e1f5a0b33fc4009b69a0ec7' },
    type: 'invoice.payment_succeeded',
  };
}

describe('identifier shapes', () => {
  it('treats a prefixed body holding a digit as an id, and an enum value as not one', () => {
    // An enum taken for an id would be rewritten, and the handler reading it
    // (charge_automatically, subscription_cycle) would see a value Stripe never sends.
    expect(isIdShaped(CUSTOMER)).toBe(true);
    expect(isIdShaped(SESSION)).toBe(true);
    expect(isIdShaped(PAYMENT)).toBe(true);
    expect(isIdShaped('charge_automatically')).toBe(false);
    expect(isIdShaped('subscription_cycle')).toBe(false);
    expect(isIdShaped('2026-07-29.dahlia')).toBe(false);
  });

  it('maps one real id to one synthetic id of the same prefix and length, every time', () => {
    // Inconsistent mapping breaks the links between events (an invoice no longer
    // names its subscription), so the replay would test an unlinked set.
    const ids = new IdMapper();
    const first = ids.synthetic(CUSTOMER);
    expect(ids.synthetic(CUSTOMER)).toBe(first);
    expect(first.startsWith('cus_')).toBe(true);
    expect(first).toHaveLength(CUSTOMER.length);
    expect(isSyntheticId(first)).toBe(true);
    const session = ids.synthetic(SESSION);
    expect(session.startsWith('cs_test_')).toBe(true);
    expect(session).toHaveLength(SESSION.length);
    expect(ids.synthetic(SUBSCRIPTION)).not.toBe(first);
  });
});

describe('sanitiseEvent', () => {
  const ids = new IdMapper();
  const out = sanitiseEvent(renewalInvoice(), ids) as ReturnType<typeof renewalInvoice>;
  const invoice = (out.data as { object: Record<string, any> }).object;

  it('nulls every personal field and keeps its key', () => {
    // A field left populated publishes a donor's details; a key removed changes
    // the structure the replay exists to preserve.
    expect(invoice.customer_name).toBeNull();
    expect(invoice.customer_email).toBeNull();
    expect(invoice.customer_phone).toBeNull();
    expect(invoice.customer_address).toEqual({ city: null, country: null, line1: null, postal_code: null });
    // tax_id is named by no rule of its own: only the whole-block rule clears it,
    // as it would any field Stripe adds to the block later.
    expect(invoice.charge.billing_details).toEqual({ name: null, email: null, phone: null, tax_id: null });
  });

  it('nulls the donor\'s own words in metadata and keeps the rest of the metadata', () => {
    const meta = invoice.parent.subscription_details.metadata;
    expect(meta.comment).toBeNull();
    expect(meta.donation_note).toBeNull();
    expect(meta.amountCents).toBe('2500');
  });

  it('nulls links, the client secret, the idempotency key and the card\'s fingerprint and digits', () => {
    expect(invoice.hosted_invoice_url).toBeNull();
    expect(invoice.invoice_pdf).toBeNull();
    expect(invoice.charge.receipt_url).toBeNull();
    expect(invoice.checkout.url).toBeNull();
    expect(invoice.checkout.client_secret).toBeNull();
    expect((out.request as Record<string, unknown>).idempotency_key).toBeNull();
    expect(invoice.charge.payment_method_details.card).toEqual({ brand: 'visa', fingerprint: null, last4: null });
  });

  it('rewrites every id, Stripe\'s and the platform\'s, consistently across the event', () => {
    // The handlers match a renewal to its subscription and member by these ids,
    // so a pair rewritten to different values would replay as "not ours".
    expect(invoice.customer).toBe(ids.synthetic(CUSTOMER));
    expect(invoice.parent.subscription_details.subscription).toBe(ids.synthetic(SUBSCRIPTION));
    expect(invoice.parent.subscription_details.metadata.memberId).toBe(ids.synthetic(MEMBER));
    expect(invoice.parent.subscription_details.metadata.paymentId).toBe(ids.synthetic(PAYMENT));
    expect(invoice.checkout.id).toBe(ids.synthetic(SESSION));
    expect(invoice.payments.data[0].payment.payment_intent).toMatch(/^pi_gold0*\d+$/);
  });

  it('keeps every key, in the provider\'s order, and every non-identifying value', () => {
    // Reordered or dropped keys would make the set the stub's shape again.
    expect(Object.keys(out)).toEqual(Object.keys(renewalInvoice()));
    expect(Object.keys(invoice)).toEqual(Object.keys((renewalInvoice().data as { object: object }).object));
    expect(invoice.billing_reason).toBe('subscription_cycle');
    expect(invoice.collection_method).toBe('charge_automatically');
    expect(invoice.amount_paid).toBe(2500);
    expect(out.api_version).toBe('2026-07-29.dahlia');
  });

  it('produces a body the shared check finds clean', () => {
    expect(findSanitisationViolations(serialiseEvent(out))).toEqual([]);
  });
});

describe('findSanitisationViolations', () => {
  it('finds each thing a committed body may not carry, by path', () => {
    // The replay suite runs this over the committed set, so a body edited by hand
    // after capture is refused for the same reasons the capture would refuse it.
    const raw = serialiseEvent(renewalInvoice(true));
    const found = findSanitisationViolations(raw).join('\n');
    expect(found).toMatch(/\$\.livemode is true/);
    expect(found).toMatch(/\$\.data\.object\.customer_email is populated/);
    expect(found).toMatch(/\$\.data\.object\.charge\.receipt_url is populated/);
    expect(found).toMatch(/\$\.data\.object\.checkout\.client_secret is populated/);
    expect(found).toMatch(/customer_address still carries text/);
    expect(found).toMatch(/metadata\.comment is populated/);
    expect(found).toMatch(/\$\.request\.idempotency_key is populated/);
    expect(found).toMatch(/\$\.data\.object\.customer holds an identifier off the synthetic pattern/);
  });

  it('finds an email address in a field no rule names', () => {
    const raw = JSON.stringify({ id: 'evt_gold0001', livemode: false, description: 'from pat@example.org' });
    expect(findSanitisationViolations(raw)).toEqual(['$.description holds an email address']);
  });

  it('refuses a body that is not JSON', () => {
    expect(findSanitisationViolations('{not json')).toEqual(['the body is not JSON']);
  });
});

describe('parseManifest', () => {
  it('reads events in order, skipping blanks and comments', () => {
    const lines = parseManifest(
      '# renewal first\n\nevt_1Aa | a renewal | processed | renewal\nevt_2Bb | its twin | duplicate | renewal\n',
    );
    expect(lines.map((l) => [l.eventId, l.expectedOutcome, l.sequenceGroup])).toEqual([
      ['evt_1Aa', 'processed', 'renewal'],
      ['evt_2Bb', 'duplicate', 'renewal'],
    ]);
  });

  it('refuses a malformed line, naming it', () => {
    // A misread manifest commits an entry with the wrong expected outcome, so the
    // replay would pin a wrong verdict as golden.
    expect(() => parseManifest('evt_1Aa | a renewal | processed')).toThrow(/line 1: expected four fields/);
    expect(() => parseManifest('ch_1Aa | a charge | processed | g')).toThrow(/line 1: 'ch_1Aa' is not an event id/);
    expect(() => parseManifest('evt_1Aa | x | applied | g')).toThrow(/line 1: expected outcome/);
    expect(() => parseManifest('evt_1Aa | x | processed | g\nevt_1Aa | y | processed | g')).toThrow(/names evt_1Aa twice/);
    expect(() => parseManifest('# nothing\n')).toThrow(/names no events/);
  });
});

describe('buildGoldenSet', () => {
  const existing: GoldenPayloadEntry[] = [
    {
      describes: 'a one-time donation settling', eventType: 'payment_intent.succeeded', rawBody: '{}',
      expectedOutcome: 'processed', capturedApiVersion: '2026-07-29.dahlia', capturedAt: '2026-11-01',
      source: GOLDEN_SOURCE, sequenceGroup: 'one-time',
    },
    {
      describes: 'a renewal settling', eventType: 'invoice.payment_succeeded', rawBody: '{"old":true}',
      expectedOutcome: 'processed', capturedApiVersion: '2026-07-29.dahlia', capturedAt: '2026-11-01',
      source: GOLDEN_SOURCE, sequenceGroup: 'renewal',
    },
  ];

  it('replaces every committed entry of a re-captured group, keeps other groups, and appends in manifest order', () => {
    // Appending a re-capture instead would replay the same flow twice, the second
    // time as a duplicate, and pin the wrong verdict; keeping a stale entry of the
    // group would leave it naming ids the new capture no longer uses.
    const event = renewalInvoice();
    const second = { ...renewalInvoice(), id: 'evt_9Zz8Yy7Xx6Ww5Vv4', type: 'invoice.paid' };
    const set = buildGoldenSet({
      manifest: parseManifest(
        'evt_1Pq2Rs3Tu4Vw5Xy6 | a renewal settling | processed | renewal\n'
        + 'evt_9Zz8Yy7Xx6Ww5Vv4 | the paid twin of the renewal | duplicate | renewal',
      ),
      events: new Map<string, unknown>([['evt_1Pq2Rs3Tu4Vw5Xy6', event], ['evt_9Zz8Yy7Xx6Ww5Vv4', second]]),
      existing,
      capturedAt: '2026-11-20',
    });
    expect(set.map((e) => e.describes)).toEqual([
      'a one-time donation settling', 'a renewal settling', 'the paid twin of the renewal',
    ]);
    expect(set[0]).toBe(existing[0]);
    expect(set[1].rawBody).not.toBe(existing[1].rawBody);
    expect(set[1]).toMatchObject({
      eventType: 'invoice.payment_succeeded', capturedAt: '2026-11-20', source: GOLDEN_SOURCE,
      capturedApiVersion: '2026-07-29.dahlia', sequenceGroup: 'renewal', expectedOutcome: 'processed',
    });
    // The two events share one id map, so the twin names the same subscription.
    const sub = (b: string) => JSON.parse(b).data.object.parent.subscription_details.subscription;
    expect(sub(set[2].rawBody)).toBe(sub(set[1].rawBody));
  });

  it('counts on from the highest committed synthetic id, so two captures never share one', () => {
    // A second capture restarting at one would mint the first capture's member and
    // payment ids again, and the replay could not seed both sets in one database.
    const committed: GoldenPayloadEntry = {
      ...existing[0], describes: 'an earlier capture', rawBody: '{"customer": "cus_gold000041", "id": "evt_gold0007"}',
    };
    const set = buildGoldenSet({
      manifest: parseManifest('evt_1Pq2Rs3Tu4Vw5Xy6 | a renewal settling | processed | renewal'),
      events: new Map<string, unknown>([['evt_1Pq2Rs3Tu4Vw5Xy6', renewalInvoice()]]),
      existing: [committed],
      capturedAt: '2026-11-20',
    });
    const counters = [...set[1].rawBody.matchAll(/_gold0*([0-9]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...counters)).toBe(42);
  });

  it('writes the same set when the same capture runs again', () => {
    // A repeat that minted fresh ids would show the operator a change where there
    // is none, and ask them to confirm it.
    const build = (existingSet: GoldenPayloadEntry[]) => buildGoldenSet({
      manifest: parseManifest('evt_1Pq2Rs3Tu4Vw5Xy6 | a renewal settling | processed | renewal'),
      events: new Map<string, unknown>([['evt_1Pq2Rs3Tu4Vw5Xy6', renewalInvoice()]]),
      existing: existingSet,
      capturedAt: '2026-11-20',
    });
    const first = build([existing[0]]);
    expect(build(first)).toEqual(first);
  });

  it('refuses a batch holding a live-mode event', () => {
    expect(() => buildGoldenSet({
      manifest: parseManifest('evt_1Pq2Rs3Tu4Vw5Xy6 | a renewal settling | processed | renewal'),
      events: new Map<string, unknown>([['evt_1Pq2Rs3Tu4Vw5Xy6', renewalInvoice(true)]]),
      existing: [],
      capturedAt: '2026-11-20',
    })).toThrow(/evt_1Pq2Rs3Tu4Vw5Xy6 is not clean after sanitising: \$\.livemode is true/);
  });

  it('refuses a manifest naming an event that was not captured', () => {
    expect(() => buildGoldenSet({
      manifest: parseManifest('evt_1Aa | x | processed | g'),
      events: new Map(),
      existing: [],
      capturedAt: '2026-11-20',
    })).toThrow(/no captured event for evt_1Aa/);
  });
});
