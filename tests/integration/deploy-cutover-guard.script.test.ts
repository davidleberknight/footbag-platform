/**
 * The destructive deploy's post-cutover refusal, which reads two markers.
 *
 * At cutover the live database becomes the source of truth for content, and a
 * database-replacing deploy would destroy the edits made in the running
 * application. The operator records the cutover twice: a line in the host env
 * file, readable when the database is not, and a config row inside the database
 * itself, which travels with any copy of that database. The guard reads both.
 *
 * These tests pin the whole truth table, including the two cases the second
 * marker exists for: a copied database carrying the marker on a host whose env
 * file does not, and a database that cannot be read at all, where refusing would
 * block the disaster rebuild the refusal exists to make possible.
 *
 * Strategy: run the guard as a subprocess against fixture files, asserting exit
 * code and message. No host contact.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GUARD = 'scripts/internal/deploy-rebuild-cutover-guard.sh';

let tmp: string;

function runGuard(env: Record<string, string>) {
  return spawnSync('bash', [GUARD], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
}

/** An env file carrying the cutover line, or one without it. */
function envFile(name: string, withMarker: boolean): string {
  const p = path.join(tmp, name);
  const lines = ['FOOTBAG_ENV=staging', 'FOOTBAG_DB_PATH=/nonexistent/footbag.db'];
  if (withMarker) lines.push('FOOTBAG_CUTOVER_COMPLETE=1');
  fs.writeFileSync(p, lines.join('\n') + '\n', 'utf-8');
  return p;
}

/**
 * A database carrying the config table the guard reads. `value` null writes no
 * marker row at all; a string writes one, so a superseding reversal row is
 * expressed by passing '0'.
 */
function dbFile(name: string, value: string | null): string {
  const p = path.join(tmp, name);
  const db = new BetterSqlite3(p);
  db.exec(`
    CREATE TABLE system_config (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, config_key TEXT NOT NULL,
      value_json TEXT NOT NULL, effective_start_at TEXT NOT NULL
    );
    CREATE VIEW system_config_current AS
      SELECT config_key, value_json FROM system_config
      WHERE id IN (SELECT id FROM system_config ORDER BY effective_start_at DESC LIMIT 1);
  `);
  if (value !== null) {
    db.prepare(`
      INSERT INTO system_config (id, created_at, config_key, value_json, effective_start_at)
      VALUES ('cfg_post_cutover', '2026-01-01T00:00:00.000Z', 'post_cutover', ?, '2026-01-01T00:00:00.000Z')
    `).run(value);
  }
  db.close();
  return p;
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-cutover-guard-'));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('destructive-deploy cutover guard', () => {
  it('allows the deploy when neither marker is set', () => {
    const r = runGuard({
      ENV_PATH: envFile('env-clean', false),
      DB_PATH: dbFile('db-clean.db', null),
    });
    expect(r.status).toBe(0);
  });

  it('allows the deploy when the env file does not exist yet (first bootstrap)', () => {
    const r = runGuard({
      ENV_PATH: path.join(tmp, 'env-absent'),
      DB_PATH: dbFile('db-bootstrap.db', null),
    });
    expect(r.status).toBe(0);
  });

  it('refuses when both markers are set', () => {
    const r = runGuard({
      ENV_PATH: envFile('env-both', true),
      DB_PATH: dbFile('db-both.db', '1'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/this host is post-cutover/);
  });

  it('refuses when only the database carries the marker, which is a copied live database', () => {
    const r = runGuard({
      ENV_PATH: envFile('env-none-db-yes', false),
      DB_PATH: dbFile('db-only.db', '1'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/markers disagree/);
    expect(r.stderr).toMatch(/post_cutover: present/);
  });

  it('refuses when only the env file carries the marker and the database is readable', () => {
    const r = runGuard({
      ENV_PATH: envFile('env-yes-db-no', true),
      DB_PATH: dbFile('db-no-marker.db', null),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/markers disagree/);
    expect(r.stderr).toMatch(/FOOTBAG_CUTOVER_COMPLETE: present/);
  });

  it('treats a superseding reversal row as absent, so a reversed cutover deploys again', () => {
    const r = runGuard({
      ENV_PATH: envFile('env-reversed', false),
      DB_PATH: dbFile('db-reversed.db', '0'),
    });
    expect(r.status).toBe(0);
  });

  it('lets the env line decide alone when the database file is missing', () => {
    const r = runGuard({
      ENV_PATH: envFile('env-nodb-clean', false),
      DB_PATH: path.join(tmp, 'no-such.db'),
    });
    expect(r.status).toBe(0);

    const refused = runGuard({
      ENV_PATH: envFile('env-nodb-marked', true),
      DB_PATH: path.join(tmp, 'no-such.db'),
    });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/this host is post-cutover/);
  });

  it('warns and lets the env line decide when the database is present but unreadable', () => {
    const corrupt = path.join(tmp, 'corrupt.db');
    fs.writeFileSync(corrupt, 'this is not a database', 'utf-8');

    const r = runGuard({ ENV_PATH: envFile('env-corrupt-clean', false), DB_PATH: corrupt });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/present but unreadable/);

    // The disaster rebuild this fallback exists for: a broken database on a host
    // whose operator has already cleared the env line.
    const refused = runGuard({ ENV_PATH: envFile('env-corrupt-marked', true), DB_PATH: corrupt });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/this host is post-cutover/);
  });
});
