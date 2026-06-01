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
import { vi, beforeEach, afterEach } from 'vitest';

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

// Cheap argon2 cost for the suite. Memory-hard hashing at the production
// default across ~20 parallel forks oversubscribes RAM/threads and times out
// unrelated boot hooks. env.ts only honours this under the Vitest runner, so it
// cannot weaken hashing in a real process. A file that needs production cost
// (security.login-timing) overrides this to '0' before importing the app.
process.env.FOOTBAG_CHEAP_PASSWORD_HASH ??= '1';

// Rate-limit state is in-process; tests accumulating within a worker would
// otherwise trip the login/password-change limits. Clear buckets before each
// test so isolation matches per-test expectations.
beforeEach(async () => {
  const mod = await import('../src/services/rateLimitService');
  mod.resetRateLimitForTests();
});

// ── logger.error() guard ────────────────────────────────────────────────────
//
// logger.error() is the project's "something went wrong that an operator
// must see" signal. Two rules follow:
//   1. In tests, any unexpected logger.error() call fails the test. Tests
//      that deliberately exercise an error path call expectLoggedError(...)
//      before the action that triggers it.
//   2. In staging/prod, the same call lands in CloudWatch and an alarm
//      surfaces it to the operator (separate terraform wiring).
//
// Logger import is dynamic and deferred to beforeEach (not beforeAll) so
// that any test-file beforeAll that mutates process.env (e.g.
// PUBLIC_BASE_URL in tests/unit/requireOriginPin.test.ts) has already run
// before src/config/env.loadConfig() reads from process.env. Setup-file
// beforeAll hooks fire before test-file beforeAll hooks, so installing
// the spy in beforeAll would lock in stale env values for tests that
// override them. beforeEach runs after all beforeAll hooks; the
// idempotent guard ensures the spy is installed exactly once per worker.
let errorSpy: ReturnType<typeof vi.spyOn> | undefined;
const expectedErrorPatterns: Array<string | RegExp> = [];

export function expectLoggedError(pattern: string | RegExp): void {
  expectedErrorPatterns.push(pattern);
}

beforeEach(async () => {
  if (errorSpy) return;
  const { logger } = await import('../src/config/logger');
  errorSpy = vi.spyOn(logger, 'error');
});

afterEach((ctx) => {
  if (!errorSpy) return;
  const unexpected = errorSpy.mock.calls.filter((args) => {
    const msg = String(args[0]);
    return !expectedErrorPatterns.some((p) =>
      typeof p === 'string' ? msg.includes(p) : p.test(msg),
    );
  });
  errorSpy.mockClear();
  expectedErrorPatterns.length = 0;
  if (unexpected.length === 0) return;
  const summary = unexpected
    .map((args) => `  - ${String(args[0])}`)
    .join('\n');
  throw new Error(
    `${ctx.task.name}: ${unexpected.length} unexpected logger.error() call(s):\n` +
    `${summary}\n\nCall expectLoggedError(pattern) in the test if deliberate.`,
  );
});
