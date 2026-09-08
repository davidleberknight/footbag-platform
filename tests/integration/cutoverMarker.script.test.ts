/**
 * The cutover marker writer, which moves both markers together.
 *
 * The cutover is recorded twice: a line in the host env file, readable when the
 * database is not, and a config row in the database, which travels with any copy
 * of that database. The destructive deploy's guard refuses when the two disagree,
 * because one set without the other says the cutover was recorded half way. This
 * script is what keeps them agreeing, and these tests pin the two properties that
 * matter: both move together, and the database side moves by appending a
 * superseding row rather than deleting the one that is there, because that table
 * is an append-only ledger.
 *
 * Strategy: run the script as a subprocess against fixture files. Runs on the
 * host in real use, so the fixtures stand in for the host env file and the live
 * database.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = 'scripts/cutover-marker.sh';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-cutover-marker-'));
let envPath: string;
let dbPath: string;

function run(args: string[]) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ENV_PATH: envPath, DB_PATH: dbPath },
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
}

/**
 * Drive a real marker move through a pseudo-terminal, answering the direction's
 * typed phrase.
 *
 * The prompt refuses a non-TTY stdin by design, and the repository enforces that
 * for every operator prompt (`scripts/ci/check_script_credentials.sh`): a caller
 * who redirects a credential file into a script whose prompt reads stdin has the
 * password silently consumed as the answer. So the write path genuinely requires
 * a terminal, and `script` supplies one. Testing through the same gate an
 * operator passes is the point — a test-only escape hatch would be a hole in it.
 */
function runTyped(args: string[], phrase: string) {
  const inner = [
    `ENV_PATH=${JSON.stringify(envPath)}`,
    `DB_PATH=${JSON.stringify(dbPath)}`,
    'bash',
    SCRIPT,
    ...args.map((a) => JSON.stringify(a)),
  ].join(' ');
  return spawnSync('script', ['-qec', inner, '/dev/null'], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    input: `${phrase}\n`,
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
}

const PHRASE_COMPLETE = 'RECORD CUTOVER COMPLETE';
const PHRASE_REVERSED = 'REVERSE CUTOVER MARKER';

/** The real config table and its current-value view, so the fixture answers the
 *  same question the live database would. */
function makeDb(markerValue: string | null) {
  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE system_config (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      config_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      effective_start_at TEXT NOT NULL,
      reason_text TEXT NOT NULL,
      changed_by_member_id TEXT,
      UNIQUE (config_key, effective_start_at)
    );
    CREATE VIEW system_config_current AS
    SELECT s.*
    FROM system_config s
    WHERE s.effective_start_at = (
      SELECT MAX(s2.effective_start_at)
      FROM system_config s2
      WHERE s2.config_key = s.config_key
        AND s2.effective_start_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
  `);
  if (markerValue !== null) {
    db.prepare(`
      INSERT INTO system_config (id, created_at, config_key, value_json, effective_start_at, reason_text)
      VALUES ('cfg_seed', '2026-01-01T00:00:00.000Z', 'post_cutover', ?, '2026-01-01T00:00:00.000Z', 'seed')
    `).run(markerValue);
  }
  db.close();
}

function configRowCount(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const n = (db.prepare(
    `SELECT COUNT(*) AS n FROM system_config WHERE config_key = 'post_cutover'`,
  ).get() as { n: number }).n;
  db.close();
  return n;
}

function envHasMarker(): boolean {
  return fs.readFileSync(envPath, 'utf-8').split('\n').includes('FOOTBAG_CUTOVER_COMPLETE=1');
}

beforeEach(() => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  envPath = path.join(tmp, `env-${stamp}`);
  dbPath = path.join(tmp, `db-${stamp}.db`);
  fs.writeFileSync(envPath, 'FOOTBAG_ENV=staging\n', 'utf-8');
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('cutover marker writer', () => {
  it('reports both markers as reversed on a pre-cutover host', () => {
    makeDb(null);
    const r = run(['--status']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/FOOTBAG_CUTOVER_COMPLETE: reversed/);
    expect(r.stdout).toMatch(/post_cutover: *reversed/);
  });

  it('sets both markers together', () => {
    makeDb(null);
    const r = runTyped(['--set', 'complete'], PHRASE_COMPLETE);
    expect(r.status).toBe(0);
    expect(envHasMarker()).toBe(true);

    const status = run(['--status']);
    expect(status.stdout).toMatch(/FOOTBAG_CUTOVER_COMPLETE: complete/);
    expect(status.stdout).toMatch(/post_cutover: *complete/);
  });

  it('reverses by appending a superseding row, never by deleting the original', () => {
    makeDb('1');
    fs.appendFileSync(envPath, 'FOOTBAG_CUTOVER_COMPLETE=1\n', 'utf-8');
    expect(configRowCount()).toBe(1);

    const r = runTyped(['--set', 'reversed'], PHRASE_REVERSED);
    expect(r.status).toBe(0);
    expect(envHasMarker()).toBe(false);
    // The original row survives; the reversal is a new one on top of it.
    expect(configRowCount()).toBe(2);

    const status = run(['--status']);
    expect(status.stdout).toMatch(/post_cutover: *reversed/);
  });

  it('warns when the two markers disagree, which is the state the deploy guard refuses', () => {
    makeDb('1');
    const r = run(['--status']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/FOOTBAG_CUTOVER_COMPLETE: reversed/);
    expect(r.stdout).toMatch(/post_cutover: *complete/);
    expect(r.stdout).toMatch(/the two disagree/);
  });

  it('writes nothing on a dry run', () => {
    makeDb(null);
    const r = run(['--set', 'complete', '--dry-run']);
    expect(r.status).toBe(0);
    expect(envHasMarker()).toBe(false);
    expect(configRowCount()).toBe(0);
  });

  it('refuses to move half the marker when there is no database', () => {
    const r = run(['--set', 'complete']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/only half the marker/);
    expect(envHasMarker()).toBe(false);
  });

  it('refuses to move half the marker when the database is unreadable', () => {
    fs.writeFileSync(dbPath, 'not a database', 'utf-8');
    const r = run(['--set', 'complete']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/present but unreadable/);
    expect(envHasMarker()).toBe(false);
  });

  // Neither direction is one keystroke away. The reversal matters most: it
  // removes the protection that stops a full-refresh deploy destroying the live
  // database, and a mistyped direction should cost an abort rather than that.

  // A pseudo-terminal merges stderr into stdout, so these read the combined
  // stream rather than either half — the script's own split between them is
  // pinned by the non-TTY cases above, which run without one.
  it('aborts and writes nothing when the phrase is not entered', () => {
    makeDb(null);
    const r = runTyped(['--set', 'complete'], 'yes');
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/confirmation phrase not entered/);
    expect(envHasMarker()).toBe(false);
    expect(configRowCount()).toBe(0);
  });

  it('will not accept the other direction\'s phrase', () => {
    makeDb('1');
    fs.appendFileSync(envPath, 'FOOTBAG_CUTOVER_COMPLETE=1\n', 'utf-8');
    const r = runTyped(['--set', 'reversed'], PHRASE_COMPLETE);
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/confirmation phrase not entered/);
    // Still protected: the reversal did not happen.
    expect(envHasMarker()).toBe(true);
    expect(configRowCount()).toBe(1);
  });

  it('refuses to move a marker with no terminal for its confirmation', () => {
    // The guard the repository requires of every operator prompt: a caller who
    // redirects a credential file into a script whose prompt reads stdin has the
    // password silently consumed as the answer. Refusing costs nothing here,
    // because moving a marker is a deliberate interactive act.
    makeDb(null);
    const r = run(['--set', 'complete']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/requires an interactive terminal/);
    expect(envHasMarker()).toBe(false);
    expect(configRowCount()).toBe(0);
  });

  it('names the phrase a real run will ask for, in the dry run', () => {
    makeDb(null);
    const r = run(['--set', 'reversed', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(PHRASE_REVERSED);
  });
});
