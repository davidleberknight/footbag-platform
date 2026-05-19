/**
 * Permanent contract: src/dev-shortcuts/seedConfig refuses to import
 * when FOOTBAG_ENV is 'production' (or unset / any other value). The
 * dev-admin seed path must not be loadable in a production process even
 * if a misconfigured deploy left the dev-shortcuts subtree in the
 * runtime image.
 *
 * Defense-in-depth gate. Other layers:
 *   - deploy_to_aws.sh: --seed-dev-admins is allowlisted to
 *     DEPLOY_TARGET=footbag-staging only.
 *   - the runtime Dockerfiles: ARG INCLUDE_DEV_SHORTCUTS=0
 *     (default off) removes dist/dev-shortcuts from the production
 *     image.
 *   - This module guard: if the prior two fail, the import itself throws.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function importInChildProcess(footbagEnv: string | undefined): {
  exitCode: number;
  stderr: string;
} {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' };
  if (footbagEnv !== undefined) env.FOOTBAG_ENV = footbagEnv;
  // Run a tiny inline script via tsx that imports the module. tsx is the
  // dev runner already used by manage-dev-admin-seed.sh; available in
  // devDeps.
  try {
    const stdout = execFileSync(
      'npx',
      [
        '--yes',
        'tsx',
        '-e',
        "import('./src/dev-shortcuts/seedConfig.js').then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? String(e)); process.exit(1); });",
      ],
      { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
    );
    return { exitCode: 0, stderr: stdout.toString() };
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer; stdout?: Buffer };
    return {
      exitCode: err.status ?? 1,
      stderr: (err.stderr?.toString() ?? '') + (err.stdout?.toString() ?? ''),
    };
  }
}

describe('dev-shortcuts seedConfig — production import guard', () => {
  it('throws when FOOTBAG_ENV=production (cannot be loaded in a prod process)', () => {
    const result = importInChildProcess('production');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/seedConfig|FOOTBAG_ENV/i);
  });

  it("throws when FOOTBAG_ENV is unset (no '<unset>' fallback path)", () => {
    const result = importInChildProcess(undefined);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/seedConfig|FOOTBAG_ENV/i);
  });

  it("throws when FOOTBAG_ENV is an unknown value (not 'development' or 'staging')", () => {
    const result = importInChildProcess('qa');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/seedConfig|FOOTBAG_ENV/i);
  });

  it("loads cleanly when FOOTBAG_ENV='development'", () => {
    const result = importInChildProcess('development');
    expect(result.exitCode).toBe(0);
  });

  it("loads cleanly when FOOTBAG_ENV='staging'", () => {
    const result = importInChildProcess('staging');
    expect(result.exitCode).toBe(0);
  });
});
