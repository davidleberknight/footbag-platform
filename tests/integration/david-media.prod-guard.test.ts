/**
 * Production-exclusion guard for the switch-built David Leberknight persona.
 *
 * His media has no data-level marker, so it is kept out of production by the
 * env-gated /dev mount plus the build-switch handler's own production refusal.
 * This pins the handler refusal: under a production configuration
 * GET /dev/build-switch?as=david_leberknight returns 404 and never reaches the
 * journey builder. The config singleton is frozen at module load, so the
 * production case runs in a child process with a production environment; a
 * development positive control runs in-process to prove the guard is
 * environment-specific, not an unconditional 404.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// A complete production environment: env.ts validates every required prod var at
// module load, and the handler reads config.footbagEnv before any other work.
function productionEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NODE_ENV: 'production',
    FOOTBAG_ENV: 'production',
    PORT: '3212',
    FOOTBAG_DB_PATH: path.join(os.tmpdir(), `footbag-test-prodguard-${process.pid}.db`),
    PUBLIC_BASE_URL: 'https://footbag.org',
    SESSION_SECRET: 'x'.repeat(40),
    JWT_SIGNER: 'local',
    SES_ADAPTER: 'live',
    SES_FROM_IDENTITY: 'noreply@footbag.org',
    SES_FEEDBACK_WEBHOOK_KEY: 'feedback-key',
    SAFE_BROWSING_ADAPTER: 'stub',
    SECRETS_ADAPTER: 'stub',
    HTTP_REACHABILITY_ADAPTER: 'stub',
    IMAGE_PROCESSOR_URL: 'http://localhost:4001',
    MEDIA_STORAGE_ADAPTER: 's3',
    MEDIA_STORAGE_S3_BUCKET: 'footbag-media-prod',
    AWS_REGION: 'us-east-1',
    PAYMENT_ADAPTER: 'live',
    STRIPE_WEBHOOK_SECRET: 'whsec_live_placeholder',
    INTERNAL_EVENT_SECRET: 'internal-secret',
  };
}

// Imports the handler under a production config and invokes it with a fake
// req/res; exits non-zero unless it answered 404 without delegating to next().
const PROD_GUARD_SCRIPT = `
(async () => {
  const mod = await import('./src/testkit/personaBuildSwitchRoute.js');
  const getDevBuildSwitch = mod.getDevBuildSwitch || (mod.default && mod.default.getDevBuildSwitch);
  if (typeof getDevBuildSwitch !== 'function') { console.error('getDevBuildSwitch export not found'); process.exit(1); }
  let status = 0;
  let body = '';
  const res = {
    status(code) { status = code; return res; },
    send(payload) { body = String(payload); return res; },
    redirect() { throw new Error('handler issued a redirect instead of refusing'); },
  };
  let nextCalled = false;
  await getDevBuildSwitch({ query: { as: 'david_leberknight' } }, res, () => { nextCalled = true; });
  if (status !== 404) { console.error('expected 404, got ' + status); process.exit(1); }
  if (nextCalled) { console.error('handler delegated to next() instead of refusing'); process.exit(1); }
  if (!/not available in production/i.test(body)) { console.error('unexpected body: ' + body); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e && e.message ? e.message : String(e)); process.exit(1); });
`;

describe('build-switch persona — production guard', () => {
  it('refuses with 404 under a production configuration', () => {
    let exitCode = 0;
    let output = '';
    try {
      execFileSync('npx', ['--yes', 'tsx', '-e', PROD_GUARD_SCRIPT], {
        cwd: REPO_ROOT,
        env: productionEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer; stdout?: Buffer };
      exitCode = err.status ?? 1;
      output = (err.stderr?.toString() ?? '') + (err.stdout?.toString() ?? '');
    }
    expect(exitCode, output).toBe(0);
  });
});
