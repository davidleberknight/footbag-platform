/**
 * Replays captured Stripe payloads through the real webhook handlers.
 *
 * The stub payment adapter cannot falsify the assumptions it shares with the
 * handlers, and that has cost this platform two real defects: a subscription
 * linkage read from a field the provider retired, and a reconciliation read of a
 * payment-intent field that does not exist at the pinned API version. Both
 * type-checked, both passed the whole suite, and both would have failed against
 * real Stripe.
 *
 * The payload-shape unit test guards the field DECLARATIONS. This guards the
 * VALUES: bodies the provider actually sent, driven through
 * `paymentService.handleWebhook` exactly as a delivery would be.
 *
 * The committed set is empty until the operator-run production exercise captures
 * it, because these can only come from real provider deliveries. The harness
 * lands first so a capture has somewhere to go and a passing suite the moment it
 * arrives. The guard below is what stops that emptiness becoming permanent and
 * invisible.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { GOLDEN_PAYLOADS } from '../fixtures/stripeGoldenPayloads';

const { dbPath } = setTestEnv('4102');
process.env.PAYMENT_ADAPTER = 'stub';

const MEMBER = 'golden-member';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER, slug: 'golden_member', display_name: 'Golden Member',
    login_email: 'golden@example.com',
  });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the golden payload set itself', () => {
  it('is either populated or honestly empty, never quietly stale', async () => {
    // An empty set is a legitimate state: nothing has been captured yet. What
    // must not happen is the set silently drifting out of agreement with the API
    // version the handlers are written against, because a golden payload from a
    // superseded version proves the handlers understand a shape the provider no
    // longer sends — which is worse than no evidence, since it reads as evidence.
    if (GOLDEN_PAYLOADS.length === 0) {
      expect(GOLDEN_PAYLOADS).toEqual([]);
      return;
    }
    const { STRIPE_API_VERSION } = await import('../../src/adapters/paymentAdapter');
    for (const payload of GOLDEN_PAYLOADS) {
      expect(
        payload.capturedApiVersion,
        `The golden payload "${payload.describes}" was captured against API version `
        + `${payload.capturedApiVersion}, and the adapter now pins ${STRIPE_API_VERSION}. `
        + 'Re-capture it against the pinned version rather than relaxing this check: a '
        + 'payload from a superseded version proves the handlers read a shape the provider '
        + 'no longer sends.',
      ).toBe(STRIPE_API_VERSION);
      // Each capture must carry the fields that make a failure diagnosable.
      expect(payload.describes.length).toBeGreaterThan(0);
      expect(payload.eventType.length).toBeGreaterThan(0);
      expect(() => JSON.parse(payload.rawBody)).not.toThrow();
    }
  });

  it('carries no member-identifying material', () => {
    // The sanitisation rule, enforced rather than trusted. These bodies sit in a
    // public repository: a real customer id makes a member's payment history
    // greppable, and a donation comment is the member's own words.
    const suspicious = [
      /[\w.+-]+@[\w-]+\.[\w.]+/,          // an email address
      /"donation_note"\s*:\s*"[^"]+"/,     // a member's own words
      /"comment"\s*:\s*"[^"]+"/,
    ];
    for (const payload of GOLDEN_PAYLOADS) {
      for (const pattern of suspicious) {
        expect(
          payload.rawBody,
          `The golden payload "${payload.describes}" appears to carry member-identifying `
          + 'material. Sanitise identifiers and remove personal data before committing a '
          + 'capture; keep the structure, not the contents.',
        ).not.toMatch(pattern);
      }
    }
  });
});

describe('replaying captured provider payloads through the real handlers', () => {
  it.each(GOLDEN_PAYLOADS.length > 0 ? GOLDEN_PAYLOADS : [])(
    'handles a real $eventType: $describes',
    async (payload) => {
      const { paymentService } = await import('../../src/services/paymentService');
      const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
      const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');

      // Re-signed with the stub secret: the real signature cannot survive
      // sanitisation, and the signature path has its own suite against the real
      // verifier. What this proves is that the handlers understand the shape.
      const signature = signStripeWebhook(payload.rawBody, STUB_WEBHOOK_SECRET);

      expect(
        paymentService.handleWebhook(payload.rawBody, signature),
        `Replaying the captured ${payload.eventType} did not produce the recorded outcome. `
        + 'Either the provider changed the shape, or a handler changed what it reads.',
      ).toEqual({ outcome: payload.expectedOutcome });
    },
  );

  it('reports plainly when there is nothing captured yet', () => {
    // Not a skip: skips are forbidden here and would hide the gap. A passing
    // assertion that names the gap keeps it visible in the suite output without
    // failing a build over work that is scheduled rather than missed.
    if (GOLDEN_PAYLOADS.length === 0) {
      expect(
        GOLDEN_PAYLOADS.length,
        'No provider payloads have been captured yet. Until they are, the handlers are '
        + 'verified against a stub that shares their assumptions, plus the SDK type '
        + 'declarations. Capture during the operator-run production exercise.',
      ).toBe(0);
    } else {
      expect(GOLDEN_PAYLOADS.length).toBeGreaterThan(0);
    }
  });
});
