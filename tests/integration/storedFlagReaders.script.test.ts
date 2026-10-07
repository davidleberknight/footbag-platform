/**
 * Every reader of the in-database cutover marker reads each stored form the
 * same way.
 *
 * The marker is one config row, but three programs read it: the guard the
 * destructive seeders and loaders share, the guard in front of the
 * database-replacing deploy, and the marker script's own status report. The
 * value is stored as JSON, so a correct write can arrive as the number 1 or the
 * string "1", and a hand-appended row can carry padding. A reader that takes
 * one of those forms for "not cut over" lets a destructive rebuild run against
 * the live database; a status report that disagrees with the guards tells the
 * operator the opposite of what the guards will do.
 *
 * The table below is explicit: each stored form, each a row in a real database,
 * with the verdict every reader must reach. Only forms whose meaning is settled
 * are listed. The completeness check reads the scripts and source for every
 * file naming the marker, so a new reader is either driven here or named with
 * the reason it is not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { REPO_ROOT, scanSource } from '../fixtures/sourceTree';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertSystemConfig } from '../fixtures/factories';
import { isoDaysFromNow } from '../fixtures/clock';

setTestEnv('4477');

type Verdict = 'cut over' | 'not cut over';

interface StoredForm {
  name: string;
  /** Marker rows in append order; null builds a database with no config table. */
  rows: string[] | null;
  verdict: Verdict;
  /** Date the last row after the reading clock, as a writer whose clock ran ahead would. */
  lastRowAhead?: boolean;
}

const FORMS: StoredForm[] = [
  { name: 'the number 1', rows: ['1'], verdict: 'cut over' },
  { name: 'the string "1"', rows: ['"1"'], verdict: 'cut over' },
  { name: 'the string "1" with padding', rows: [' "1" '], verdict: 'cut over' },
  { name: 'the number 0', rows: ['0'], verdict: 'not cut over' },
  { name: 'the string "0"', rows: ['"0"'], verdict: 'not cut over' },
  { name: 'no marker row', rows: [], verdict: 'not cut over' },
  { name: 'no config table at all', rows: null, verdict: 'not cut over' },
  { name: 'a reversal appended after the cutover', rows: ['1', '0'], verdict: 'not cut over' },
  { name: 'a cutover appended after a reversal', rows: ['0', '1'], verdict: 'cut over' },
  // A reader that asks what is in effect "now" discards this row and sees the
  // reversal it superseded, so a cut-over database reads as safe to rebuild.
  { name: 'a cutover dated after the reading clock', rows: ['0', '1'], verdict: 'cut over', lastRowAhead: true },
];

let scratch = '';
const dbs: string[] = [];

/** Builds a database holding exactly these marker rows, one second apart. */
function buildDb(form: StoredForm, i: number): string {
  const dbPath = path.join(scratch, `form-${i}.db`);
  dbs.push(dbPath);
  if (form.rows === null) {
    const db = new BetterSqlite3(dbPath);
    db.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
    db.close();
    return dbPath;
  }
  const db = createTestDb(dbPath);
  form.rows.forEach((value, n) => {
    const last = n === (form.rows as string[]).length - 1;
    const at = form.lastRowAhead && last
      ? isoDaysFromNow(1)
      : new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
    insertSystemConfig(db, { config_key: 'post_cutover', value_json: value, created_at: at, effective_start_at: at });
  });
  db.close();
  return dbPath;
}

function run(cmd: string, args: string[], env: Record<string, string>) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, env: { ...process.env, ...env }, encoding: 'utf-8', ...SPAWN_GUARD });
}

/** Each reader, reduced to the verdict it reaches on one database. */
const READERS: Record<string, { file: string; read: (dbPath: string, envPath: string) => Verdict }> = {
  'seeder and loader guard': {
    file: 'scripts/lib/db_cutover_guard.py',
    read: (dbPath) => {
      const res = run('python3', ['-I', 'scripts/lib/db_cutover_guard.py', dbPath], {});
      if (res.status !== 0 && res.status !== 1) throw new Error(`guard exited ${res.status}: ${res.stderr}`);
      return res.status === 1 ? 'cut over' : 'not cut over';
    },
  },
  'database-replacing deploy guard': {
    file: 'scripts/internal/deploy-rebuild-cutover-guard.sh',
    // The env-file marker is absent here, so the database alone decides: a
    // database that reads as cut over makes the two disagree and the guard
    // refuses; one that reads as not cut over lets the deploy through.
    read: (dbPath, envPath) => {
      const res = run('bash', ['scripts/internal/deploy-rebuild-cutover-guard.sh'], { DB_PATH: dbPath, ENV_PATH: envPath });
      if (res.status !== 0 && res.status !== 1) throw new Error(`guard exited ${res.status}: ${res.stderr}`);
      return res.status === 1 ? 'cut over' : 'not cut over';
    },
  },
  'marker status report': {
    file: 'scripts/cutover-marker.sh',
    read: (dbPath, envPath) => {
      const res = run('bash', ['scripts/cutover-marker.sh', '--status'], { DB_PATH: dbPath, ENV_PATH: envPath });
      const state = /post_cutover:\s+(\S+)/.exec(res.stdout)?.[1];
      if (!state) throw new Error(`no marker state in the status report: ${res.stdout}${res.stderr}`);
      return state === 'complete' ? 'cut over' : 'not cut over';
    },
  },
};

/** Files that name the marker without deciding anything from it. */
const NOT_READERS: Record<string, string> = {
  'scripts/_freestyle_db.py': 'names the marker in its header; the decision is the shared seeder guard\'s',
  'scripts/internal/assert-db-pre-cutover.sh': 'a wrapper that runs the shared seeder guard as a script',
  'scripts/internal/cutover-marker-remote.sh': 'relays the marker script\'s own status line from the host',
  'scripts/internal/rehearse-curation-cutover-remote.sh': 'records the raw stored value for the curation rehearsal report, run over ssh on a staging host; it decides nothing about running a destructive step',
};

let envPath = '';

beforeAll(() => {
  scratch = createScratchDir('stored-flag-readers');
  envPath = path.join(scratch, 'env');
  writeFileSync(envPath, 'FOOTBAG_ENV=development\n');
});

afterAll(() => {
  for (const db of dbs) cleanupTestDb(db);
  removeScratch(scratch);
});

describe('stored-form table for the cutover marker readers', () => {
  // Defect caught: a reader takes one stored form of the marker for the
  // opposite state, so a destructive step runs against the live database, or
  // the status report contradicts what the guards will do.
  it('every reader reaches the settled verdict on every stored form', () => {
    const wrong: string[] = [];
    FORMS.forEach((form, i) => {
      const db = buildDb(form, i);
      for (const [name, reader] of Object.entries(READERS)) {
        const got = reader.read(db, envPath);
        if (got !== form.verdict) wrong.push(`${name} read ${form.name} as ${got}; it means ${form.verdict}`);
      }
    });
    expect(wrong).toEqual([]);
  });

  // Defect caught: a new program reads the marker and joins no table, so its
  // handling of the quoted or padded forms is never checked.
  it('every file naming the marker is a reader driven here or says why it is not one', () => {
    const files = scanSource('post_cutover', { roots: ['scripts', 'src'], exts: ['.sh', '.py', '.ts'] });
    const known = new Set([...Object.values(READERS).map((r) => r.file), ...Object.keys(NOT_READERS)]);
    expect(files.filter((f) => !known.has(f))).toEqual([]);
    expect([...known].filter((f) => !files.includes(f))).toEqual([]);
  });
});
