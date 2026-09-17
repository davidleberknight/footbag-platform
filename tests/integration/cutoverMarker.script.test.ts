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

// One word for every confirmation in the tree; the direction comes from --set.
// Two names are kept so each call site still reads as the direction it drives.
const PHRASE_COMPLETE = 'APPLY';
const PHRASE_REVERSED = PHRASE_COMPLETE;

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

/** An ISO timestamp in the same shape the marker writer stores, offset from now. */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString().replace(/(\.\d{3})Z$/, '$1Z');
}

/** Append a superseding marker row directly, standing in for a writer on another clock. */
function insertMarkerRow(value: string, effectiveStartAt: string): void {
  const db = new BetterSqlite3(dbPath);
  db.prepare(
    `INSERT INTO system_config (id, created_at, config_key, value_json, effective_start_at, reason_text)
     VALUES (?, ?, 'post_cutover', ?, ?, 'written by a host on another clock')`,
  ).run(`cfg_skew_${effectiveStartAt}`, effectiveStartAt, value, effectiveStartAt);
  db.close();
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

  it('reports a database it cannot query as unreadable, never as reversed', () => {
    // A failed read is not a state, and the direction it fails in decides how
    // much a mistake costs. "reversed" is the state in which the
    // database-replacing rebuild deploy is ARMED, so a read that did not
    // succeed must never be reported as that: it would say the live member
    // data is unprotected when nothing had actually been read.
    //
    // This fixture is the deterministic form of a defect that first showed up
    // as a full-suite-only flake, where a locked database under load produced
    // the same wrong answer while the file was perfectly valid. The file here
    // is a readable SQLite database that simply has no marker view, which the
    // readability probe passes and the real query then fails.
    const db = new BetterSqlite3(dbPath);
    db.exec('CREATE TABLE unrelated (x INTEGER);');
    db.close();

    const r = run(['--status']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/post_cutover: *unreadable/);
    expect(r.stdout).not.toMatch(/post_cutover: *reversed/);
  });

  it('refuses to move a marker it could not read, rather than moving half of it', () => {
    // The consequence of the check above: a half-moved marker is the exact
    // disagreement state the destructive deploy's guard refuses, so the script
    // must not write the env file when the database side is unknown.
    const db = new BetterSqlite3(dbPath);
    db.exec('CREATE TABLE unrelated (x INTEGER);');
    db.close();

    const r = runTyped(['--set', 'complete'], PHRASE_COMPLETE);
    expect(r.status).not.toBe(0);
    expect(envHasMarker()).toBe(false);
    // Asserting the guard's own refusal, not merely a non-zero exit: without
    // the guard the run still dies, because the INSERT fails under `set -e`,
    // so a status-only assertion would pass against a script that had no guard
    // at all and would tell an operator nothing about why it stopped.
    expect(`${r.stdout}${r.stderr}`).toMatch(/present but unreadable/);
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

  it('reads the latest marker even when its timestamp is ahead of this clock', () => {
    // The marker is written by one process and read back by another, and the two
    // clocks need not agree. A workstation under a hypervisor has its clock
    // stepped backward at each time resync, and a database copied from another
    // host carries that host's timestamps. Deciding what is current by discarding
    // rows dated later than the reader silently answers with the row that was
    // just superseded, and a stale answer here is indistinguishable from a
    // correct one. The marker has no future-dated state; the last row appended is
    // the answer.
    makeDb('1');
    fs.appendFileSync(envPath, 'FOOTBAG_CUTOVER_COMPLETE=1\n', 'utf-8');
    insertMarkerRow('0', hoursFromNow(1));

    const status = run(['--status']);
    expect(status.stdout).toMatch(/post_cutover: *reversed/);
  });

  it('keeps protecting a database whose marker was written ahead of this clock', () => {
    // The same skew in the direction that matters: a host that has just recorded
    // the cutover must not read as a host that never did.
    makeDb('0');
    insertMarkerRow('1', hoursFromNow(1));

    const status = run(['--status']);
    expect(status.stdout).toMatch(/post_cutover: *complete/);
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

  it('states which direction it is about to take, and what that costs, before asking', () => {
    // The typed word used to encode the direction, so typing the wrong script's
    // phrase aborted the run. Every confirmation in the tree now asks for the same
    // word, which means the direction is carried by --set alone and the operator's
    // only protection against the wrong one is being told, in full, what is about
    // to happen. That text is therefore load-bearing and is pinned here.
    makeDb('1');
    fs.appendFileSync(envPath, 'FOOTBAG_CUTOVER_COMPLETE=1\n', 'utf-8');
    const r = runTyped(['--set', 'reversed'], 'not the word');
    expect(r.status).toBe(1);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toMatch(/This REVERSES the cutover marker, re-arming the destructive rebuild deploy/);
    expect(out).toMatch(/removes the protection that stops a full-refresh deploy destroying the live/);
    // The narrative comes before the prompt, not after it.
    expect(out.indexOf('This REVERSES')).toBeLessThan(out.indexOf("Type 'APPLY'"));
    expect(out).toMatch(/confirmation phrase not entered/);
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

  it('reports the status from a machine that holds no host env file', () => {
    // Every other case here supplies one, which is why nothing caught this: off
    // the host the file is simply absent, and reading a value from it is meant to
    // yield nothing and fall back to the default path. Instead grep exited 2 on
    // the missing file, pipefail carried that out of the pipeline, and the failed
    // command substitution tripped `set -e`: the script died with status 2 having
    // printed nothing at all. An operator checking the marker from their
    // workstation got silence and a failure code.
    // DB_PATH is deliberately NOT set: it short-circuits the only place the env
    // file is read for a value, so a case that sets it cannot reach the defect at
    // all. The first version of this test set it and passed against the broken
    // script, which is the whole reason the rule is to watch a test fail first.
    const r = spawnSync('bash', [SCRIPT, '--status'], {
      cwd: REPO_ROOT,
      env: { ...process.env, ENV_PATH: path.join(tmp, 'absent-env'), DB_PATH: '' },
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Cutover marker status');
    expect(r.stdout).toMatch(/FOOTBAG_CUTOVER_COMPLETE: reversed/);
    expect(r.stdout).toMatch(/post_cutover:\s+no-database/);
  });
});
