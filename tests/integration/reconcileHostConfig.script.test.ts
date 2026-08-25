/**
 * scripts/internal/reconcile-host-config-remote.sh -- putting a host's runtime
 * configuration back to the defaults the schema seeds.
 *
 * Runtime configuration lives in the database, so a rebuild-and-replace deploy
 * carries whatever rows the workstation database held. A value meant only for a
 * developer's machine therefore reaches a host silently: nothing fails, nothing
 * logs, and the host behaves differently from every document describing it.
 *
 * What these pin: a value already at its seeded default is left alone and no row
 * is written; a value that differs is reported and, on apply, corrected by
 * appending rather than editing, because the table is append-only and the
 * history of the change is the record; the restored value comes from the
 * database's own seed row rather than a constant in the script, so the two
 * cannot drift; a key with no seed row is refused rather than guessed at; and a
 * status read never writes.
 *
 * A real run reaches a deployed host over ssh, which CI cannot exercise. The
 * root-side body is the whole of the behaviour, though: it takes its inputs as
 * shell variables and operates on a SQLite file, so it runs here directly
 * against a temporary database built from the real schema.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/reconcile-host-config-remote.sh');
const SCHEMA = join(process.cwd(), 'database/schema.sql');
const KEY = 'outbox_poll_interval_seconds';

let workDir: string;
let dbFile: string;

interface RunResult { exitCode: number; stdout: string; stderr: string }

function run(env: Record<string, string>): RunResult {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: { ...process.env, DB_FILE: dbFile, KEYS: KEY, ...env },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbFile);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Layers a later-effective row, the way the local builder used to. */
function overrideTo(value: string): void {
  withDb((db) => db.prepare(`
    INSERT INTO system_config
      (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
    VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?,
            strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'a developer-only override', NULL)
  `).run(`cfg_test_${value}`, KEY, value));
}

function effectiveValue(): string | undefined {
  return withDb((db) => (db.prepare(
    'SELECT value_json FROM system_config_current WHERE config_key = ?',
  ).get(KEY) as { value_json: string } | undefined)?.value_json);
}

function rowCount(): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM system_config WHERE config_key = ?',
  ).get(KEY) as { n: number }).n);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-cfgfix-'));
  dbFile = join(workDir, 'footbag.db');
  const db = new BetterSqlite3(dbFile);
  db.exec(readFileSync(SCHEMA, 'utf8'));
  db.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('reading the host configuration', () => {
  it('reports a value already at its seeded default and writes nothing', () => {
    const before = rowCount();
    const res = run({ ACTION: 'status' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(new RegExp(`CONFIG_OK=${KEY}`));
    expect(res.stdout).toMatch(/CONFIG_DRIFT_FOUND=0/);
    expect(rowCount()).toBe(before);
  });

  it('reports a value that differs, and still writes nothing', () => {
    overrideTo('2');
    const before = rowCount();
    const res = run({ ACTION: 'status' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/CONFIG_DRIFT_FOUND=1/);
    expect(res.stdout).toMatch(/current=2/);
    expect(res.stdout).toMatch(/seeded=30/);
    // A status read that wrote would make the diagnosis change the thing being
    // diagnosed.
    expect(rowCount()).toBe(before);
    expect(effectiveValue()).toBe('2');
  });

  it('refuses a key the schema never seeded rather than inventing a default', () => {
    const res = run({ ACTION: 'apply', KEYS: 'not_a_real_config_key', REASON: 'x' });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toMatch(/no seeded row/);
  });
});

describe('restoring the host configuration', () => {
  it('puts the value back by appending, leaving the override on the record', () => {
    overrideTo('2');
    expect(effectiveValue()).toBe('2');
    const before = rowCount();

    const res = run({ ACTION: 'apply', REASON: 'shipped from a workstation build' });
    expect(res.exitCode).toBe(0);
    expect(effectiveValue()).toBe('30');
    // Appended, not edited: the table is append-only and the history of what the
    // host was doing is the thing worth keeping.
    expect(rowCount()).toBe(before + 1);
    expect(res.stdout).toMatch(/CONFIG_RESTORED=outbox_poll_interval_seconds value=30/);
  });

  it('records the reason verbatim on the row it writes', () => {
    overrideTo('2');
    run({ ACTION: 'apply', REASON: "operator's correction after a rebuild deploy" });
    const reason = withDb((db) => (db.prepare(`
      SELECT reason_text FROM system_config WHERE config_key = ?
      ORDER BY effective_start_at DESC LIMIT 1
    `).get(KEY) as { reason_text: string }).reason_text);
    // An apostrophe must survive rather than breaking the insert: this is
    // written in prose, in a hurry, after something went wrong.
    expect(reason).toBe("operator's correction after a rebuild deploy");
  });

  it('writes nothing when every value already matches', () => {
    const before = rowCount();
    const res = run({ ACTION: 'apply', REASON: 'routine check' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/CONFIG_ROWS_WRITTEN=0/);
    // Re-running during an incident, which is exactly what a worried operator
    // does, must not litter the permanent record.
    expect(rowCount()).toBe(before);
  });

  it('takes the restored value from the database rather than from the script', () => {
    // The seeded row is the default of record. A constant in the script would be
    // a second source of truth, and nothing would catch the two drifting apart.
    expect(readFileSync(REMOTE_HALF, 'utf8')).not.toMatch(/\b30\b/);
    overrideTo('2');
    run({ ACTION: 'apply', REASON: 'x' });
    expect(effectiveValue()).toBe('30');
  });
});
