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
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

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
    ...SPAWN_GUARD,
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

describe('the database built for a host carries no local-only affordances', () => {
  const SOURCE = fs.readFileSync(path.join(REPO_ROOT, SCRIPT), 'utf8');
  const REBUILD = fs.readFileSync(path.join(REPO_ROOT, 'scripts/deploy-rebuild.sh'), 'utf8');
  const ORCHESTRATOR = fs.readFileSync(path.join(REPO_ROOT, 'scripts/deploy-to-aws.sh'), 'utf8');

  it('writes the fast outbox poll only when the database stays on this machine', () => {
    // The override lives in the database file, so a rebuild-and-replace deploy
    // carries it to whatever host it lands on. A host polling every two seconds
    // does fifteen times the work and fifteen times the logging, for an
    // affordance only a developer watching a local page benefits from.
    //
    // Anchored on the guard's own message rather than on the flag name. The name
    // appears wherever the flag is discussed, so a bare search for it can land
    // somewhere else in the file entirely and then pass with the guard deleted.
    const flagAt = SOURCE.indexOf('Skipping the fast local outbox poll interval');
    const insertAt = SOURCE.indexOf("'outbox_poll_interval_seconds', '2'");
    expect(flagAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(flagAt);
    // The insert sits on the else branch: reached only when the flag is absent.
    expect(SOURCE.slice(flagAt, insertAt)).toContain('else');
  });

  it('is asked for that by the deploy path that ships the database', () => {
    // Without this the guard exists and nothing ever sets it, which reads as
    // fixed while behaving exactly as before.
    // The path is anchored to the repository root rather than the caller's
    // directory, and the database path is handed over explicitly, so the file the
    // reset builds is the file the deploy is about to ship. What this pins is
    // unchanged: the rebuild leaf, and only it, sets the deploy guard.
    expect(REBUILD).toMatch(
      /FOOTBAG_DB_FOR_DEPLOY=1 FOOTBAG_DB_PATH="\$LOCAL_DB" bash "\$REPO_ROOT\/scripts\/reset-local-db\.sh"/,
    );
  });

  it('is asked for by the orchestrator too, which builds the database the deploy ships', () => {
    // The line above is on the rebuild leaf, and the orchestrator skips it: every
    // dispatch exports SKIP_DB_REBUILD=yes because the database was already built
    // a step earlier. So the leaf's flag alone left every orchestrated deploy
    // shipping the developer-only row, with the assertion above reporting the
    // guard as wired.
    const flagAt = ORCHESTRATOR.indexOf('export FOOTBAG_DB_FOR_DEPLOY=1');
    const buildAt = ORCHESTRATOR.indexOf('deploy-local-data.sh" --soup-to-nuts');
    expect(flagAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(flagAt);
  });

  it('refuses to ship a database that carries the developer-only row', () => {
    // The flag settles what a build produces; it cannot settle what an operator
    // hands over. The rebuild deploy also ships a database it did not build, so
    // the outcome is checked rather than the invocation.
    expect(REBUILD).toContain("WHERE id = 'cfg_dev_outbox_poll'");
    expect(REBUILD).toContain('carries developer-only configuration and must not be shipped');
  });
});

describe('the loss is stated before the database is deleted', () => {
  // What the notice SAYS is proved by running it, in
  // print-reset-notice.script.test.ts. What this file owns is where it is called
  // from and what surrounds it, which is the reset script's decision alone.
  const SOURCE = fs.readFileSync(path.join(REPO_ROOT, SCRIPT), 'utf8');
  const NOTICE_CALL = 'internal/print-reset-notice.sh';
  // The delete matched as a whole line rather than as one long literal, so a
  // second deletion spelled any other way is still counted.
  const DELETE_LINES = /^[ \t]*rm\b.*DB_FILE.*$/gm;

  /**
   * A miss returns -1, and slicing from -1 yields the whole string rather than
   * nothing, so an unchecked index turns a broken locator into a passing test
   * instead of a failing one.
   */
  function indexOrFail(haystack: string, needle: string): number {
    const at = haystack.indexOf(needle);
    expect(at, `expected to find ${needle} in ${SCRIPT}`).toBeGreaterThan(-1);
    return at;
  }

  it('calls the notice, and the deletion comes after it', () => {
    const noticeAt = indexOrFail(SOURCE, NOTICE_CALL);
    const deletions = SOURCE.match(DELETE_LINES) ?? [];
    expect(deletions).toHaveLength(1);
    expect(indexOrFail(SOURCE, deletions[0])).toBeGreaterThan(noticeAt);
  });

  it('puts nothing between the notice and the deletion', () => {
    // Anything landing in the gap can fail, and a run that dies there has told
    // the operator their work is gone without having touched it.
    const noticeAt = indexOrFail(SOURCE, NOTICE_CALL);
    const callLineEnd = SOURCE.indexOf('\n', noticeAt);
    expect(callLineEnd).toBeGreaterThan(-1);
    const deletions = SOURCE.match(DELETE_LINES) ?? [];
    expect(deletions).toHaveLength(1);
    const between = SOURCE.slice(callLineEnd + 1, indexOrFail(SOURCE, deletions[0]));
    expect(between.trim()).toBe('');
  });

  it('adds no way around the notice', () => {
    // Positive guards only: no force flag, no escape hatch, and no prompt. The
    // reason for no prompt is not taste — the launcher and the deploy both invoke
    // this script non-interactively, so a prompt would hang them rather than
    // protect anything.
    //
    // Read against code alone, since the header explains the absent flag by
    // naming it and a comment must not be able to fail this.
    const code = SOURCE.split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/--force|--yes|ASSUME_YES/);
    expect(code).not.toMatch(/^\s*read\s+(-|[A-Za-z_])/m);
    expect(code).not.toContain('confirm_from_tty');
  });

  it('says nothing destructive on a run it refuses', () => {
    // A refused run must not tell an operator their work was destroyed when
    // nothing was touched. Driven from a throwaway working directory, which exits
    // at the missing-fixture preflight: that sits below the environment refusal
    // and below the pre-cutover guard, so this covers every placement above the
    // slate phase rather than only the topmost one.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-reset-notice-gate-'));
    try {
      // The database has to exist for this to mean anything. Against an absent
      // file the notice prints its harmless shape, so a misplaced notice would
      // slip past the assertions below saying nothing about the placement. The
      // preflight refuses above the slate phase, so this file is never deleted.
      fs.mkdirSync(path.join(sandbox, 'database'));
      fs.writeFileSync(path.join(sandbox, 'database', 'footbag-gate-test.db'), '');

      const r = run({ FOOTBAG_DB_PATH: './database/footbag-gate-test.db' }, sandbox);
      expect(r.status).not.toBe(0);
      const combined = (r.stderr ?? '') + (r.stdout ?? '');
      expect(combined).not.toMatch(/WARNING: this deletes/);
      expect(combined).not.toMatch(/adjudication drafts/);
      // And it is still there, which is the other half of "nothing was touched".
      expect(fs.existsSync(path.join(sandbox, 'database', 'footbag-gate-test.db'))).toBe(true);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

});
