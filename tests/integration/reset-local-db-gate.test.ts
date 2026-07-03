/**
 * Long-term contract: scripts/reset-local-db.sh refuses to run against any
 * environment that smells like staging or production. Positive guards only;
 * no --force / CI=true escape hatch.
 *
 * Strategy: spawn the script via bash with the env condition under test and
 * assert exit code 2 + diagnostic on stderr. Tests do not run the seed pipeline
 * (refusal happens before sqlite3/python checks), so wall time is sub-second.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = 'scripts/reset-local-db.sh';

// Default cwd is REPO_ROOT for the refusal cases (they exit 2 at the gate
// before any path use). The CI-invocation-shape case overrides cwd to a
// throwaway sandbox: the script's paths are relative, so a sandbox cwd makes
// its missing-fixture preflight fail deterministically (exit 1) before it can
// run the real reset pipeline and write into legacy_data/. SCRIPT is resolved
// against REPO_ROOT so it is found regardless of cwd.
function run(envOverrides: Record<string, string>, cwd: string = REPO_ROOT) {
  // Start from a minimal env so the parent vitest's NODE_ENV=test (set by
  // setup-env.ts) does not leak into the negative-control case. Pass PATH so
  // bash and its builtins resolve.
  const baseEnv: Record<string, string> = { PATH: process.env.PATH ?? '' };
  return spawnSync('bash', [path.join(REPO_ROOT, SCRIPT)], {
    cwd,
    env: { ...baseEnv, ...envOverrides },
    encoding: 'utf-8',
    timeout: 5000,
  });
}

describe('scripts/reset-local-db.sh — environment refusal gate', () => {
  it('refuses with exit 2 when NODE_ENV=production', () => {
    const r = run({ NODE_ENV: 'production', FOOTBAG_DB_PATH: '/tmp/should-never-be-reached.db' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refusing to reset DB/);
    expect(r.stderr).toMatch(/NODE_ENV=production/);
  });

  it('refuses with exit 2 when FOOTBAG_ENV=production', () => {
    const r = run({ FOOTBAG_ENV: 'production', FOOTBAG_DB_PATH: '/tmp/should-never-be-reached.db' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refusing to reset DB/);
    expect(r.stderr).toMatch(/FOOTBAG_ENV=production/);
  });

  it('refuses with exit 2 when FOOTBAG_ENV=staging', () => {
    const r = run({ FOOTBAG_ENV: 'staging', FOOTBAG_DB_PATH: '/tmp/should-never-be-reached.db' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refusing to reset DB/);
    expect(r.stderr).toMatch(/FOOTBAG_ENV=staging/);
  });

  it('refuses with exit 2 when FOOTBAG_DB_PATH is the production install path', () => {
    const r = run({ FOOTBAG_DB_PATH: '/srv/footbag/db/footbag.db' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refusing to reset DB/);
    expect(r.stderr).toMatch(/\/srv\/footbag\//);
  });

  it('refuses with exit 2 when FOOTBAG_DB_PATH is /', () => {
    const r = run({ FOOTBAG_DB_PATH: '/' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refusing to reset DB/);
  });

  it('does not refuse the CI invocation shape (passes the gate, exits later on missing tools or fixtures)', () => {
    // CI invokes with FOOTBAG_DB_PATH=./database/footbag-ci.db and NODE_ENV/
    // FOOTBAG_ENV unset. Gate must not match any condition; the script
    // proceeds past the gate and exits 1 on the legacy_data preflight.
    // Crucially: NOT exit 2.
    //
    // Run from a throwaway sandbox cwd so the script's relative paths resolve
    // there: the canonical-input preflight finds nothing and exits 1 before
    // the real reset pipeline runs. On a fully provisioned host (sqlite3 +
    // venv + canonical inputs all present), running from REPO_ROOT would
    // instead sail past the preflight and rebuild seed CSVs into
    // legacy_data/, violating the tests-never-write-real-data invariant.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-reset-gate-'));
    try {
      const r = run({ FOOTBAG_DB_PATH: './database/footbag-gate-test.db' }, sandbox);
      expect(r.status).not.toBe(2);
      // Stderr from the preflight failure must not contain the refusal
      // diagnostic; that would mean the gate false-positived on the CI shape.
      expect(r.stderr).not.toMatch(/refusing to reset DB/);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
