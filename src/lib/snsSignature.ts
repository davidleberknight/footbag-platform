/**
 * SNS envelope checks for the feeds the worker reads off a queue (mail
 * feedback and platform alarms). The platform exposes no endpoint for these
 * notices: they are published to a topic, delivered to a queue, and read by
 * the worker under its runtime role, so no URL or shared secret is involved.
 *
 * The queue-delivered feeds rely on two helpers here:
 *
 *   1. `publishedByExpectedTopic`: the envelope must name the topic the feed
 *      expects, so a message delivered onto the same queue by another
 *      subscription is not read as this feed's. Unconfigured fails closed.
 *   2. `safeSubscribeUrlForLog`: a subscription confirmation's URL, logged only
 *      when it is a genuine SNS endpoint over HTTPS.
 *
 * `verifySnsSignature` checks the expected topic and then the payload signature
 * against the AWS signing certificate: `sns-validator` (AWS-maintained) checks
 * that SigningCertURL points at an sns.<region>.amazonaws.com host before
 * fetching it. The certificate fetch is bounded by a timeout, because the
 * library issues it with no deadline of its own. A queue-delivered feed does
 * not need the signature, since the authorized queue read already establishes
 * what it would.
 *
 * Tests inject a verifier via the setter so route tests run without network
 * access or real AWS signatures. The topic check deliberately runs BEFORE the
 * test override, so an injected verifier cannot mask a spoofed topic.
 */
import MessageValidator from 'sns-validator';

const validator = new MessageValidator();

type SnsVerifier = (rawBody: string) => Promise<boolean>;

let overrideForTests: SnsVerifier | null = null;

/** How long the signing-certificate fetch may take before the delivery is
 *  refused. The sender retries, so refusing beats holding the connection. */
const CERT_FETCH_TIMEOUT_MS = 5000;

export async function verifySnsSignature(
  rawBody: string,
  expectedTopicArn: string | undefined,
): Promise<boolean> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (!expectedTopicArn) return false;
  if (parsed.TopicArn !== expectedTopicArn) return false;
  if (overrideForTests) return overrideForTests(rawBody);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), CERT_FETCH_TIMEOUT_MS);
    const settle = (ok: boolean): void => {
      clearTimeout(timer);
      resolve(ok);
    };
    try {
      validator.validate(parsed, (err) => settle(err === null || err === undefined));
    } catch {
      settle(false);
    }
  });
}

/** Longest confirmation URL this will log. The confirmation URL is logged only
 *  when it is an HTTPS SNS endpoint within a length bound, and is never
 *  auto-fetched; this is that bound.
 *
 *  It is a URL bound, not a line-length one. Sized as "short enough for one log
 *  line" it was 300, and a genuine SNS confirmation URL is longer than that: the
 *  endpoint plus the topic ARN plus a token of roughly 320 characters comes to
 *  450-500. Every real URL was rejected and the subscription could not be
 *  confirmed at all, while a test whose "genuine" fixture ended `Token=abc` kept
 *  the guard looking sound. 2048 is the conventional URL bound; it clears a real
 *  one several times over and still sits three orders of magnitude under the
 *  body cap. */
const MAX_LOGGED_URL_LENGTH = 2048;

/**
 * The confirmation URL as it is safe to hand an operator, or a marker.
 *
 * A subscription confirmation is the one payload whose URL an operator is asked
 * to open. The confirmation URL is logged only when it is an HTTPS SNS endpoint
 * within a length bound, and is never auto-fetched; otherwise this says so and
 * logs nothing else. Callers pass the raw envelope
 * field, so this never trusts its input.
 */
export function safeSubscribeUrlForLog(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_LOGGED_URL_LENGTH) return '(rejected)';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return '(rejected)';
  }
  if (parsed.protocol !== 'https:') return '(rejected)';
  if (!/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsed.hostname)) return '(rejected)';
  return raw;
}

/**
 * Whether an envelope names the topic the feed reading it expects.
 *
 * On a queue this is the whole of the check. The read itself is authorized by
 * the runtime role, so nothing unauthenticated can put a message there and a
 * signature adds no fact the queue has not already established; what remains
 * worth asserting is that the message belongs to this feed rather than another
 * one delivered onto the same queue by a subscription nobody meant to make.
 * Unset expectation refuses, matching the signature path: a feed that cannot
 * say what it expects is a feed that reads nothing.
 */
export function publishedByExpectedTopic(
  rawBody: string,
  expectedTopicArn: string | undefined,
): boolean {
  if (!expectedTopicArn) return false;
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return parsed.TopicArn === expectedTopicArn;
  } catch {
    return false;
  }
}

export function setSnsSignatureVerifierForTests(verifier: SnsVerifier): void {
  overrideForTests = verifier;
}

export function resetSnsSignatureVerifierForTests(): void {
  overrideForTests = null;
}
