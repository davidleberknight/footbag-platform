/**
 * SNS payload-signature verification for the public SES feedback webhook.
 *
 * The webhook URL's shared-secret query key is the outer gate, but the URL
 * (and therefore the key) lands in instance access logs on every delivery,
 * so anyone who learns it could otherwise POST a forged bounce/complaint
 * for an arbitrary address. Verifying the SNS signature against the AWS
 * signing certificate makes a forged payload unprocessable even with the
 * URL in hand. `sns-validator` (AWS-maintained) checks that SigningCertURL
 * points at an sns.<region>.amazonaws.com host before fetching it, then
 * verifies the payload signature against that certificate.
 *
 * Tests inject a verifier via the setter so route tests run without network
 * access or real AWS signatures.
 */
import MessageValidator from 'sns-validator';

const validator = new MessageValidator();

type SnsVerifier = (rawBody: string) => Promise<boolean>;

let overrideForTests: SnsVerifier | null = null;

export async function verifySnsSignature(rawBody: string): Promise<boolean> {
  if (overrideForTests) return overrideForTests(rawBody);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    try {
      validator.validate(parsed, (err) => resolve(err === null || err === undefined));
    } catch {
      resolve(false);
    }
  });
}

export function setSnsSignatureVerifierForTests(verifier: SnsVerifier): void {
  overrideForTests = verifier;
}

export function resetSnsSignatureVerifierForTests(): void {
  overrideForTests = null;
}
