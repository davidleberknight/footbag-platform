/**
 * SNS envelope authentication for the public server-to-server webhooks (mail
 * feedback and platform alarms).
 *
 * Two checks, and BOTH are required. The URL's shared-secret query key is the
 * outer gate, but the URL (and therefore the key) lands in instance access logs
 * on every delivery, so it must not be sufficient on its own.
 *
 *   1. The publishing topic must be the one we expect. A valid signature proves
 *      only that SOME SNS topic in SOME AWS account signed the payload, so an
 *      attacker holding the leaked key can publish from a topic they own and
 *      obtain a genuinely-signed forgery. AWS's own signature-verification
 *      guidance carries "reject any message with an unexpected TopicArn to
 *      prevent spoofing" as a step alongside verifying the signature; this is
 *      that step. Unconfigured fails closed: a feed whose expected topic is
 *      unknown cannot be authenticated at all.
 *   2. The payload signature must verify against the AWS signing certificate.
 *      `sns-validator` (AWS-maintained) checks that SigningCertURL points at an
 *      sns.<region>.amazonaws.com host before fetching it, then verifies the
 *      payload signature against that certificate.
 *
 * The certificate fetch is bounded by a timeout: the library issues it with no
 * deadline of its own, so a hung fetch would park the webhook request (and the
 * sender's connection) indefinitely.
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

/** Longest confirmation URL this will log. The body cap is a megabyte, so an
 *  unbounded log of an attacker-chosen URL is a log-flooding primitive, and a
 *  bound belongs here.
 *
 *  It is a URL bound, not a line-length one. Sized as "short enough for one log
 *  line" it was 300, and a genuine SNS confirmation URL is longer than that: the
 *  endpoint plus the topic ARN plus a token of roughly 320 characters comes to
 *  450-500. Every real URL was rejected and the subscription could not be
 *  confirmed at all, while a test whose "genuine" fixture ended `Token=abc` kept
 *  the guard looking sound. 2048 is the conventional URL bound; it clears a real
 *  one several times over and still sits three orders of magnitude under the
 *  body cap, so the flooding defence is untouched. */
const MAX_LOGGED_URL_LENGTH = 2048;

/**
 * The confirmation URL as it is safe to hand an operator, or a marker.
 *
 * A subscription confirmation is the one payload whose URL an operator is asked
 * to open, and on a forged confirmation that URL is attacker-chosen. Log it only
 * when it is really an SNS endpoint over HTTPS and short enough to belong on one
 * line; otherwise say so and log nothing else. Callers pass the raw envelope
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

export function setSnsSignatureVerifierForTests(verifier: SnsVerifier): void {
  overrideForTests = verifier;
}

export function resetSnsSignatureVerifierForTests(): void {
  overrideForTests = null;
}
