/**
 * scripts/internal/payments-pause-remote.sh -- the payments kill switch.
 *
 * A real run reaches a deployed host over ssh, which CI cannot exercise. The
 * root-side body is the whole of the behaviour, though: it takes its inputs as
 * shell variables and operates on a SQLite file, so it runs here directly
 * against a temporary database built from the real schema.
 *
 * What these pin: the switch reads the same view the application reads; setting
 * it is an INSERT of a newer effective row rather than an UPDATE, because the
 * configuration table is append-only and the history of every pause is its own
 * audit trail; a flip to the state it is already in writes nothing; the reason
 * is recorded verbatim including one carrying an apostrophe; and the body
 * refuses rather than guesses when the database is absent.
 *
 * This matters because until this script existed the documented kill switch
 * could only be pulled by hand-writing SQL into the production database during
 * an incident: the application has no write path to it and none is planned.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/payments-pause-remote.sh');
const SCHEMA = join(process.cwd(), 'database/schema.sql');

let workDir: string;
let dbFile: string;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(env: Record<string, string>): RunResult {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: { ...process.env, ...SPAWN_GUARD, ...env },
    encoding: 'utf8',
  });
  return {
    exitCode: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

function reportedState(res: RunResult): string {
  const match = /^PAYMENTS_PAUSED=(\d)$/m.exec(res.stdout);
  expect(match, `no state line in stdout:\n${res.stdout}\n${res.stderr}`).not.toBeNull();
  return match![1];
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbFile);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Every payments_paused row, oldest first. The schema seeds one at its
 *  default, so these are counted from a baseline rather than from zero: what
 *  matters is what the script added. */
function pauseRows(): { value_json: string; reason_text: string }[] {
  return withDb((db) => db.prepare(
    `SELECT value_json, reason_text FROM system_config
     WHERE config_key = 'payments_paused' ORDER BY effective_start_at`,
  ).all() as { value_json: string; reason_text: string }[]);
}

let seededRows = 0;

/** The rows this test wrote, with the seeded default excluded. */
function writtenRows(): { value_json: string; reason_text: string }[] {
  return pauseRows().slice(seededRows);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-pause-'));
  dbFile = join(workDir, 'footbag.db');
  const db = new BetterSqlite3(dbFile);
  db.exec(readFileSync(SCHEMA, 'utf8'));
  db.close();
  seededRows = pauseRows().length;
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('reading the switch', () => {
  it('reports live when nothing has ever been written', () => {
    const res = run({ DB_FILE: dbFile, ACTION: 'status' });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('0');
    // A read writes nothing at all.
    expect(writtenRows()).toHaveLength(0);
  });

  it('refuses rather than guessing when the database is not there', () => {
    const res = run({ DB_FILE: join(workDir, 'absent.db'), ACTION: 'status' });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain('does not exist or is unreadable');
  });

  it('refuses an action it does not recognise', () => {
    const res = run({ DB_FILE: dbFile, ACTION: 'disarm' });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain("unknown ACTION");
  });
});

describe('pausing and resuming', () => {
  it('pauses, and the value the application reads changes with it', () => {
    const res = run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'duplicate charges reported' });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('1');

    // Read back through the same view the application reads, not the base
    // table: what the platform acts on is what must have changed.
    const effective = withDb((db) => db.prepare(
      `SELECT value_json FROM system_config_current WHERE config_key = 'payments_paused'`,
    ).get() as { value_json: string });
    expect(effective.value_json).toBe('1');
  });

  it('records the reason verbatim on the permanent row', () => {
    run({ DB_FILE: dbFile, ACTION: 'pause', REASON: "operator's call during incident" });
    const rows = writtenRows();
    expect(rows).toHaveLength(1);
    // An apostrophe in the reason must survive rather than breaking the insert:
    // this is written during an incident, in a hurry, in prose.
    expect(rows[0].reason_text).toBe("operator's call during incident");
  });

  it('takes a reason pasted out of an incident thread, newlines and all', () => {
    // A SQL string literal cannot span a newline, and quoting the value one
    // line at a time wraps quotes around each line separately, producing two
    // adjacent literals and a syntax error. The switch then does not move at
    // the one moment speed matters, and the operator is told only that the
    // remote step failed. Multi-line prose is exactly what someone pastes
    // during an incident, so it has to work.
    const res = run({
      DB_FILE: dbFile,
      ACTION: 'pause',
      REASON: 'duplicate charges reported by two members\nboth on the donation form\nstopping while we look',
    });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('1');
    const rows = writtenRows();
    expect(rows).toHaveLength(1);
    // Collapsed to one line, and every word kept.
    expect(rows[0].reason_text).toBe(
      'duplicate charges reported by two members both on the donation form stopping while we look',
    );
  });

  it('records the operator who flipped it when they name themselves', () => {
    // Without this the platform's own configuration history cannot answer who
    // paused payments, and the question falls back to host access logs outside
    // the application entirely.
    run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'stop', ACTOR: 'mem-operator-7' });
    const changedBy = withDb((db) => (db.prepare(
      `SELECT changed_by_member_id AS actor FROM system_config
        WHERE config_key = 'payments_paused' ORDER BY effective_start_at DESC LIMIT 1`,
    ).get() as { actor: string | null }).actor);
    expect(changedBy).toBe('mem-operator-7');
  });

  it('leaves the operator unnamed rather than inventing one', () => {
    run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'stop' });
    const changedBy = withDb((db) => (db.prepare(
      `SELECT changed_by_member_id AS actor FROM system_config
        WHERE config_key = 'payments_paused' ORDER BY effective_start_at DESC LIMIT 1`,
    ).get() as { actor: string | null }).actor);
    expect(changedBy).toBeNull();
  });

  it('appends rather than overwriting, so every flip stays on the record', () => {
    run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'stop' });
    run({ DB_FILE: dbFile, ACTION: 'resume', REASON: 'fixed' });
    const rows = writtenRows();
    expect(rows.map((r) => r.value_json)).toEqual(['1', '0']);
    expect(rows.map((r) => r.reason_text)).toEqual(['stop', 'fixed']);
  });

  it('resumes back to live', () => {
    run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'stop' });
    const res = run({ DB_FILE: dbFile, ACTION: 'resume', REASON: 'fixed' });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('0');
  });

  it('writes nothing when asked for the state it is already in', () => {
    run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'stop' });
    const res = run({ DB_FILE: dbFile, ACTION: 'pause', REASON: 'stop again' });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('1');
    // Still one row. Re-running the command during an incident, which is
    // exactly what a worried operator does, must not litter the permanent
    // record with duplicates.
    expect(writtenRows()).toHaveLength(1);
    expect(res.stderr).toContain('already in the requested state');
  });
});
