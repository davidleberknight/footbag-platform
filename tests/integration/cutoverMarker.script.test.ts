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
    const r = run(['--set', 'complete']);
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

    const r = run(['--set', 'reversed']);
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
});
