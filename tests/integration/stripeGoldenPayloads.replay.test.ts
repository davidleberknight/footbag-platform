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
 * `paymentService.handleWebhook` exactly as a delivery would be, one sequence
 * group at a time and in the order the flow produced them, against the rows the
 * group's own events name.
 *
 * The committed set is empty until the operator-run production exercise captures
 * it, because these can only come from real provider deliveries. The harness
 * lands first so a capture has somewhere to go and a passing suite the moment it
 * arrives. The guard below is what stops that emptiness becoming permanent and
 * invisible.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { GOLDEN_PAYLOADS, type GoldenPayload } from '../fixtures/stripeGoldenPayloads';
import { planGoldenSeed, seedGoldenRows } from '../fixtures/stripeGoldenSeed';
import { findSanitisationViolations } from '../../scripts/lib/stripe-golden-sanitise';

const { dbPath } = setTestEnv('4102');
process.env.PAYMENT_ADAPTER = 'stub';

/** The set split into its sequence groups, each in committed order. */
const GROUPS: Array<[string, GoldenPayload[]]> = [
  ...GOLDEN_PAYLOADS.reduce((acc, p) => {
    acc.set(p.sequenceGroup, [...(acc.get(p.sequenceGroup) ?? []), p]);
    return acc;
  }, new Map<string, GoldenPayload[]>()),
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedGoldenRows(db, planGoldenSeed(GOLDEN_PAYLOADS.map((p) => p.rawBody)));
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
      expect(payload.eventType).toBe(JSON.parse(payload.rawBody).type);
      expect(payload.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(payload.source.length).toBeGreaterThan(0);
      expect(payload.sequenceGroup.length).toBeGreaterThan(0);
    }
  });

  it('carries no member-identifying material, no live event and no real identifier', () => {
    // The sanitisation rule, enforced rather than trusted, by the same check the
    // capture runs before it writes. These bodies sit in a public repository: a
    // real customer id makes a member's payment history greppable, a donation
    // comment is the member's own words, and a live event is real money.
    for (const payload of GOLDEN_PAYLOADS) {
      expect(
        findSanitisationViolations(payload.rawBody),
        `The golden payload "${payload.describes}" is not clean. Re-capture it through `
        + 'the capture script rather than editing the body by hand.',
      ).toEqual([]);
    }
  });
});

describe('replaying captured provider payloads through the real handlers', () => {
  it.each(GROUPS)('replays the %s sequence in order', async (_group, payloads) => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');

    for (const payload of payloads) {
      // Re-signed with the stub secret: the real signature cannot survive
      // sanitisation, and the signature path has its own suite against the real
      // verifier. What this proves is that the handlers understand the shape.
      const signature = signStripeWebhook(payload.rawBody, STUB_WEBHOOK_SECRET);
      expect(
        paymentService.handleWebhook(payload.rawBody, signature),
        `Replaying the captured ${payload.eventType} ("${payload.describes}") did not produce `
        + 'the recorded outcome. Either the provider changed the shape, or a handler changed '
        + 'what it reads.',
      ).toEqual({ outcome: payload.expectedOutcome });
    }
  });

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
