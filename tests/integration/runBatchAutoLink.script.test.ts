/**
 * Integration test for scripts/run-batch-auto-link.sh, the operator entry
 * point of the batch auto-link pass.
 *
 * The job's own behaviour — the production refusal, staging semantics, the
 * re-run guard — is covered in-process by the cli suite. What had no coverage
 * was the wrapper itself: that the command an operator actually types reaches
 * the real entry point, runs against the database the environment names, and
 * records its run. A wrapper wired to a renamed or moved entry point fails
 * only on the operator's machine otherwise.
 *
 * The production refusal is deliberately NOT exercised here: a process whose
 * environment claims production is refused by the config layer long before the
 * job's own guard, which is why the guard takes the environment as a parameter
 * and is proved in-process. Spawning it "as production" can only prove the
 * config refusal, which has its own tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_SQL = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-auto-link-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('run-batch-auto-link.sh', () => {
  it('runs the real job against the named database and records the run', { timeout: 60_000 }, () => {
    const dbPath = path.join(workDir, 'fixture.db');
    const db = new BetterSqlite3(dbPath);
    db.exec(SCHEMA_SQL);
    db.close();

    const res = spawnSync('bash', ['scripts/run-batch-auto-link.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
      ...SPAWN_GUARD,
      // tsx has to compile the app graph before the job runs, which is
      // legitimately slower than the shared bound; the kill signal stays.
      timeout: 55_000,
    });
    expect(res.status, res.stdout + res.stderr).toBe(0);

    // The run is recorded where an operator would look for it, against the
    // database the wrapper was pointed at — which is the whole wiring claim.
    const check = new BetterSqlite3(dbPath, { readonly: true });
    const runs = check
      .prepare(`SELECT status FROM system_job_runs WHERE job_name = 'SYS_Batch_Auto_Link'`)
      .all() as { status: string }[];
    check.close();
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('succeeded');
  });
});
