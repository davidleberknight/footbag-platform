/**
 * Golden Stripe payloads: real captured provider events, replayed through the
 * real handlers.
 *
 * WHY THIS EXISTS. The stub payment adapter was written from the same
 * assumptions as the handlers it exercises, so it cannot falsify those
 * assumptions. That is not a hypothetical: the subscription linkage on an
 * invoice moved from a top-level field onto the invoice's parent, both the stub
 * and the handlers read the retired field, and the entire suite passed while
 * every renewal charge would have failed against real Stripe. A second instance
 * of the same class shipped later — a reconciliation read of a payment-intent
 * field that does not exist at the pinned API version, through the project's own
 * hand-written interface, so it type-checked and always matched nothing.
 *
 * The type-level guard against that is the payload-shape test, which anchors the
 * fields the handlers read to the installed SDK's own declarations. This is the
 * value-level guard: payloads the provider actually sent, captured once during
 * the operator-run production verification, committed here, and driven through
 * `paymentService.handleWebhook` in CI thereafter. Between them, a field that
 * moves fails a test instead of failing a donor.
 *
 * HOW A CAPTURE IS MADE. During the test-mode exercise on production, the
 * operator saves each event's raw body exactly as delivered — the bytes, not a
 * re-serialisation, because the signature is computed over the bytes and
 * re-encoding changes them. Then, before committing:
 *
 *   1. Replace every identifier with an obviously synthetic one of the same
 *      shape. Provider ids are not secret, but a real customer id in a public
 *      repository is a member's payment history made greppable.
 *   2. Remove anything member-identifying. A donation comment is the member's own
 *      words; an email address is personal data. The handlers do not read either
 *      from these payloads, so neither needs to be present for the replay to
 *      prove anything.
 *   3. Keep the STRUCTURE untouched. Every field the provider sent stays, in the
 *      place the provider put it, including fields the handlers ignore. The
 *      structure is the entire point: sanitising it into the shape the stub
 *      already produces would recreate the fiction these exist to break.
 *
 * The payloads are re-signed with the stub secret at replay time, since the real
 * signature cannot survive sanitisation. That is deliberate and costs nothing:
 * the signature path is exercised by its own suite against the real verifier;
 * what these prove is that the handlers understand the provider's SHAPE.
 *
 * A capture whose sanitisation is uncertain is not committed. An empty set here
 * is honest; a set of stub output relabelled as golden would be worse than
 * nothing, because it would read as evidence.
 */

/** One captured provider event, ready to replay. */
export interface GoldenPayload {
  /** What the capture proves, in plain words, for whoever reads a failure. */
  describes: string;
  /** The event type, repeated here so a listing reads without parsing bodies. */
  eventType: string;
  /** The raw body as delivered, sanitised per the rules above. */
  rawBody: string;
  /** What replaying it through the handlers should produce. */
  expectedOutcome: 'processed' | 'duplicate' | 'ignored';
  /** When the shape was captured, so a stale set is visible as stale. */
  capturedApiVersion: string;
}

/**
 * The committed set.
 *
 * EMPTY UNTIL THE OPERATOR EXERCISE RUNS. These can only come from real
 * provider deliveries, which means the test-clock rehearsal and the live canary
 * on production — the one thing in this programme that cannot be done from a
 * workstation. The harness and its test land now so a capture session has
 * somewhere to put its output and a green suite the moment it does, rather than
 * the capture arriving and finding nothing ready to receive it.
 *
 * Priority order for the first captures, highest value first, because each one
 * covers a shape the stub currently invents or omits:
 *
 *   1. `invoice.payment_succeeded` for a renewal — the shape that already broke
 *      once, and the only way to prove the parent-based subscription linkage and
 *      the metadata placement are read correctly.
 *   2. `customer.subscription.created` — carries the status field the handler now
 *      reads rather than assuming, which no stub event has ever set to anything
 *      but active.
 *   3. `invoice.payment_failed` — the dunning path, and the out-of-order pair
 *      with the success above.
 *   4. `charge.refunded`, both partial and full — the classification is terminal
 *      in one direction, so the amounts must be read from the real shape.
 *   5. `payment_intent.succeeded` for a one-time donation — the flow that has
 *      actually run live, so the easiest to capture and the cheapest to verify.
 */
export const GOLDEN_PAYLOADS: GoldenPayload[] = [];
