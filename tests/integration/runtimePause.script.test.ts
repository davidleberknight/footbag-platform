/**
 * scripts/internal/runtime-pause-remote.sh -- the platform's runtime kill switches.
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
 * One body serves every switch, so the same cases cover payments and outbound
 * mail: how a switch is written is the part that must not vary between them.
 * The key it is given is checked against the switches that exist, because a
 * typo would otherwise write a configuration row nothing reads and report
 * success, leaving the switch apparently moved and the platform unchanged.
 *
 * This matters because until these scripts existed the documented kill switches
 * could only be pulled by hand-writing SQL into the production database during
 * an incident: the application has no write path to either and none is planned.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/runtime-pause-remote.sh');
const PAYMENTS_KEY = 'payments_paused';
const EMAIL_KEY = 'email_outbox_paused';
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
    env: { ...process.env, ...SPAWN_GUARD, CONFIG_KEY: PAYMENTS_KEY, ...env },
    encoding: 'utf8',
  });
  return {
    exitCode: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

function reportedState(res: RunResult): string {
  const match = /^SWITCH_PAUSED=(\d)$/m.exec(res.stdout);
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
function pauseRows(key: string = PAYMENTS_KEY): { value_json: string; reason_text: string }[] {
  return withDb((db) => db.prepare(
    `SELECT value_json, reason_text FROM system_config
     WHERE config_key = ? ORDER BY effective_start_at`,
  ).all(key) as { value_json: string; reason_text: string }[]);
}

let seededRows: Record<string, number> = {};

/** The rows this test wrote, with the seeded default excluded. */
function writtenRows(key: string = PAYMENTS_KEY): { value_json: string; reason_text: string }[] {
  return pauseRows(key).slice(seededRows[key] ?? 0);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-pause-'));
  dbFile = join(workDir, 'footbag.db');
  const db = new BetterSqlite3(dbFile);
  db.exec(readFileSync(SCHEMA, 'utf8'));
  db.close();
  seededRows = {
    [PAYMENTS_KEY]: pauseRows(PAYMENTS_KEY).length,
    [EMAIL_KEY]: pauseRows(EMAIL_KEY).length,
  };
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

describe('the outbound-mail switch', () => {
  it('pauses outbound mail without touching payments', () => {
    const res = run({ DB_FILE: dbFile, CONFIG_KEY: EMAIL_KEY, ACTION: 'pause', REASON: 'wrong template went out' });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('1');

    const effective = withDb((db) => db.prepare(
      `SELECT value_json FROM system_config_current WHERE config_key = ?`,
    ).get(EMAIL_KEY) as { value_json: string });
    expect(effective.value_json).toBe('1');

    // The two switches are independent levers. Stopping mail must not stop
    // money, or an operator reaching for one gets the other as well.
    expect(writtenRows(PAYMENTS_KEY)).toHaveLength(0);
  });

  it('resumes outbound mail, and both flips stay on the record', () => {
    run({ DB_FILE: dbFile, CONFIG_KEY: EMAIL_KEY, ACTION: 'pause', REASON: 'stop' });
    run({ DB_FILE: dbFile, CONFIG_KEY: EMAIL_KEY, ACTION: 'resume', REASON: 'template corrected' });
    const rows = writtenRows(EMAIL_KEY);
    expect(rows.map((r) => r.value_json)).toEqual(['1', '0']);
    expect(rows.map((r) => r.reason_text)).toEqual(['stop', 'template corrected']);
  });

  it('refuses a switch that does not exist rather than writing a row nothing reads', () => {
    // A configuration row under a mistyped key is read by nothing, so the write
    // would succeed, the script would report the switch moved, and the platform
    // would carry on unchanged. That is the worst outcome available here.
    const res = run({ DB_FILE: dbFile, CONFIG_KEY: 'emails_paused', ACTION: 'pause', REASON: 'typo' });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain('unknown CONFIG_KEY');
    expect(withDb((db) => (db.prepare(
      `SELECT COUNT(*) AS n FROM system_config WHERE config_key = 'emails_paused'`,
    ).get() as { n: number }).n)).toBe(0);
  });
});

describe('the wire the operator half actually uses', () => {
  /**
   * The operator half does not pass these as environment variables: it prints
   * shell assignments ahead of the body on one stdin stream, the same way every
   * privileged remote step here carries its values. That quoting is what a
   * reason typed in prose during an incident passes through, so it is exercised
   * in the form it really takes rather than in the convenient one.
   */
  function runOverWire(assignments: Record<string, string>): RunResult {
    const body = readFileSync(REMOTE_HALF, 'utf8');
    const lines = Object.entries(assignments)
      .map(([name, value]) => `${name}=${quoteForShell(value)}`)
      .join('\n');
    const res = spawnSync('bash', ['-s'], {
      input: `${lines}\n${body}`,
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  /** What printf '%q' produces for these values. */
  function quoteForShell(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  it('carries a multi-line reason pasted out of an incident thread', () => {
    const reason = "duplicate sends reported\nby two members; operator's call";
    const res = runOverWire({
      DB_FILE: dbFile,
      CONFIG_KEY: EMAIL_KEY,
      ACTION: 'pause',
      REASON: reason,
      ACTOR: '',
    });
    expect(res.exitCode).toBe(0);
    expect(reportedState(res)).toBe('1');

    const rows = writtenRows(EMAIL_KEY);
    expect(rows).toHaveLength(1);
    // Collapsed to one line, because a SQL string literal cannot span an
    // unquoted newline, and every word survives: the reason is the only thing
    // that tells the next person why mail stopped.
    expect(rows[0].reason_text).not.toContain('\n');
    for (const word of ['duplicate', 'sends', 'reported', 'members', "operator's"]) {
      expect(rows[0].reason_text).toContain(word);
    }
  });
});
