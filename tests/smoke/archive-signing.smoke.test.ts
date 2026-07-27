/**
 * Archive signing key live SSM round-trip probe.
 *
 * Long-term, opt-in smoke suite. Confirms the runtime path the archive
 * cookie signer takes in deployed environments: the SecureString at
 * `${ssmPrefix}/secrets/archive_signing_private_key` is readable through
 * the assumed-role chain, parses as an RSA private key, and produces a
 * CloudFront policy signature that verifies against its own public half.
 * The interface-parity test covers the signing implementation with a local
 * key; this test confirms the real stored key is usable.
 *
 * Failure modes:
 *   - AccessDenied: workstation profile is not assuming `*-runtime`, or the
 *     runtime role lacks ssm:GetParameter / kms:Decrypt for the parameter.
 *   - SecretNotConfiguredError / placeholder: the operator has not run
 *     scripts/provision-archive-signing-key.sh store for this environment.
 *   - Signature verify failure: the stored value is not a valid RSA private
 *     key PEM (a truncated or hand-pasted store).
 *
 * Run with: npm run test:smoke (gated behind RUN_STAGING_SMOKE=1).
 */
import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { createLiveSecretsAdapter } from '../../src/adapters/secretsAdapter';
import { createCloudFrontSigningAdapter } from '../../src/adapters/cloudFrontSigningAdapter';

const RUN = process.env.RUN_STAGING_SMOKE === '1';
const SSM_PREFIX = '/footbag/staging';

describe.skipIf(!RUN)('Archive signing key live SSM round-trip (staging)', () => {
  it('reads the stored key and signs a policy that verifies against its public half', async () => {
    const secrets = createLiveSecretsAdapter({ ssmPrefix: SSM_PREFIX });
    const privateKeyPem = await secrets.getRequired('archive_signing_private_key');

    // Boolean predicates only: a failure must never print the key.
    expect(privateKeyPem.includes('PRIVATE KEY-----')).toBe(true);
    expect(privateKeyPem.startsWith('TODO-')).toBe(false);

    const adapter = createCloudFrontSigningAdapter({
      privateKeyPem,
      keyPairId: 'KSMOKETEST',
    });
    const values = adapter.signArchiveCookies(
      'https://archive.example.test/*',
      Math.floor(Date.now() / 1000) + 60,
    );

    const publicKey = crypto
      .createPublicKey(privateKeyPem)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    const toBuffer = (v: string): Buffer =>
      Buffer.from(v.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'), 'base64');
    expect(
      crypto.verify('sha1', toBuffer(values.policy), publicKey, toBuffer(values.signature)),
    ).toBe(true);
  });
});
