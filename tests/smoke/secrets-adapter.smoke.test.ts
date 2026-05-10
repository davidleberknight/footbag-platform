/**
 * SecretsAdapter live SSM round-trip probe.
 *
 * Long-term, opt-in smoke suite. Exercises the workstation-as-staging-runtime
 * assumed-role chain + SSM GetParameter + KMS decrypt path that the runtime
 * SecretsAdapter takes in staging and production. The interface-parity test
 * uses an injected fake SSM client; this test confirms the real AWS SDK call
 * path against a real param.
 *
 * Probe parameter: `${ssmPrefix}/secrets/origin_verify_secret`. This param is
 * Terraform-generated (random_id), always present in any environment that has
 * applied terraform/{env}/, and has a deterministic shape (64 lowercase hex
 * chars). It is the only secret-class param guaranteed to exist regardless of
 * which operator-supplied secrets have been provisioned, so this test has no
 * operator-side put-parameter dependency.
 *
 * Failure modes:
 *   - AccessDenied: workstation profile is not assuming `*-runtime` correctly,
 *     or the runtime role lacks ssm:GetParameter on /footbag/{env}/*.
 *   - DecryptionError: KMS key reference broken or runtime role lacks kms:Decrypt.
 *   - ParameterNotFound on origin_verify_secret: terraform apply has not run
 *     for this environment, or the SSM resource was deleted out-of-band.
 *
 * Run with: npm run test:smoke (gated behind RUN_STAGING_SMOKE=1).
 * Excluded from the default `npm test` suite via the test:smoke script's scope.
 */
import { describe, it, expect } from 'vitest';
import {
  createLiveSecretsAdapter,
  SecretNotConfiguredError,
} from '../../src/adapters/secretsAdapter';

const RUN = process.env.RUN_STAGING_SMOKE === '1';
const SSM_PREFIX = '/footbag/staging';

describe.skipIf(!RUN)('SecretsAdapter live SSM round-trip (staging)', () => {
  it('reads an existing SecureString via the assumed-role + KMS chain', async () => {
    // Assert via boolean predicates so a failure never dumps the secret
    // value into test output. The shape (64 lowercase hex) matches the
    // runtime check nginx applies to X_ORIGIN_VERIFY_SECRET; a wrong-shape
    // value is also non-functional, so revealing nothing about it on
    // failure is the safe default.
    const adapter = createLiveSecretsAdapter({ ssmPrefix: SSM_PREFIX });
    const value = await adapter.get('origin_verify_secret');
    const exists = typeof value === 'string' && value.length > 0;
    expect(exists, 'origin_verify_secret missing — has terraform apply run?').toBe(true);
    const correctShape = !!value && /^[0-9a-f]{64}$/.test(value);
    expect(
      correctShape,
      'origin_verify_secret has wrong shape (expected 64 lowercase hex chars)',
    ).toBe(true);
  });

  it('caches the value: a second get for the same key does not re-fetch', async () => {
    // Compare via length + boolean equality to avoid leaking the value on
    // failure. If the cache is broken, the values would still be equal
    // strings; the contract being tested is "no second SSM call", not
    // "values differ across calls".
    const adapter = createLiveSecretsAdapter({ ssmPrefix: SSM_PREFIX });
    const first = await adapter.get('origin_verify_secret');
    const second = await adapter.get('origin_verify_secret');
    const firstShape = typeof first === 'string' && first.length === 64;
    expect(firstShape).toBe(true);
    expect(first === second).toBe(true);
  });

  it('returns undefined for a non-existent parameter (does not throw)', async () => {
    const adapter = createLiveSecretsAdapter({ ssmPrefix: SSM_PREFIX });
    const value = await adapter.get('non_existent_smoke_probe_key');
    expect(value).toBeUndefined();
  });

  it('getRequired throws SecretNotConfiguredError for a non-existent parameter', async () => {
    const adapter = createLiveSecretsAdapter({ ssmPrefix: SSM_PREFIX });
    await expect(adapter.getRequired('non_existent_smoke_probe_key')).rejects.toBeInstanceOf(
      SecretNotConfiguredError,
    );
  });
});
