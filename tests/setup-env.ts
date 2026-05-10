// Minimal env defaults so static imports of src/config/env.ts do not throw
// in unit-test contexts that do not otherwise configure the environment.
// Integration tests set FOOTBAG_DB_PATH etc. explicitly before importing
// src/app; those still override the defaults below.
//
// The JWT keypair path is set per-vitest-worker (unique per process.pid) so
// that both `config.jwtLocalKeypairPath` (read eagerly when env.ts loads)
// and the test factory's `signJwtLocalSync(process.env.JWT_LOCAL_KEYPAIR_PATH, ...)`
// (read at call time) resolve to the same file. Without this, per-test-file
// overrides of JWT_LOCAL_KEYPAIR_PATH run after env.ts has already frozen
// the default, producing signer/verifier keypair mismatches.
import * as os from 'node:os';
import * as path from 'node:path';
import { threadId } from 'node:worker_threads';
import { beforeEach } from 'vitest';

// Worker threads share a process.pid, so use threadId to keep each vitest
// worker's keypair file distinct. Falls back to pid when threadId is 0
// (single-process runs).
const workerTag = `${process.pid}-${threadId}`;

process.env.PORT                    ??= '3000';
process.env.NODE_ENV                ??= 'test';
process.env.LOG_LEVEL               ??= 'error';
process.env.FOOTBAG_DB_PATH         ??= ':memory:';
process.env.PUBLIC_BASE_URL         ??= 'http://localhost';
process.env.SESSION_SECRET          ??= 'test-default-secret';
process.env.JWT_SIGNER              ??= 'local';
process.env.JWT_LOCAL_KEYPAIR_PATH  ??= path.join(
  os.tmpdir(),
  `vitest-jwt-${workerTag}.pem`,
);
process.env.SES_ADAPTER             ??= 'stub';
process.env.AWS_REGION              ??= 'us-east-1';
// Tests use the stub SecretsAdapter by default. Tests that exercise the live
// path inject a fake SSM client via createLiveSecretsAdapter({ ssmClient: fake }).
process.env.SECRETS_ADAPTER         ??= 'stub';
// Required by `getImageProcessingAdapter` and `getVideoTranscodingAdapter`
// (they refuse to construct without a value, mirroring `transcodeDispatchClient`).
// Tests that inject fakes via the *ForTests setters never reach this value;
// it exists so any test that does construct the real adapter doesn't trip the
// guard. Default is fine because the value never leaves test space.
process.env.INTERNAL_EVENT_SECRET   ??= 'test-internal-event-secret';

// Seeded preview-user password used by integration tests that insert the
// Footbag Hacky test account and then authenticate as it. Tests read
// `process.env.STUB_PASSWORD` with no string fallback so no credential
// literal is ever committed. Local dev's gitignored `.env` file overrides
// this default; CI uses the default below.
process.env.STUB_PASSWORD           ??= 'test-stub-password-do-not-use-in-prod';

// Rate-limit state is in-process; tests accumulating within a worker would
// otherwise trip the login/password-change limits. Clear buckets before each
// test so isolation matches per-test expectations.
beforeEach(async () => {
  const mod = await import('../src/services/rateLimitService');
  mod.resetRateLimitForTests();
});
