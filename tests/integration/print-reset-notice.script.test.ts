/**
 * Long-term contract: scripts/internal/print-reset-notice.sh tells the operator
 * what a local rebuild costs before scripts/reset-local-db.sh deletes anything,
 * and tells them the truth on the run where there is nothing to lose.
 *
 * Strategy: run the notice directly. It is its own script precisely so this is
 * possible — inside the reset it sits below a preflight and a virtualenv install,
 * so reaching it there would mean running the real rebuild pipeline. Nothing here
 * touches a database: the notice only asks whether its path exists, so the
 * "database present" case points at an empty temp file.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/internal/print-reset-notice.sh');

/**
 * The notice is hand-wrapped to a terminal width, so a phrase an operator reads
 * as one clause can carry a newline in the middle. Assertions about what it says
 * run against this; assertions about how it is laid out run against the raw text.
 */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

function run(dbPath: string) {
  return spawnSync('bash', [SCRIPT, dbPath], {
    cwd: REPO_ROOT,
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
}

/** Runs the notice against a path that exists, in a throwaway directory. */
function runWithDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-reset-notice-'));
  try {
    const dbPath = path.join(dir, 'footbag.db');
    fs.writeFileSync(dbPath, '');
    return { ...run(dbPath), dbPath };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs the notice against a path that does not exist. */
function runWithoutDatabase() {
  const dbPath = path.join(
    os.tmpdir(),
    `footbag-test-reset-notice-absent-${process.pid}`,
    'footbag.db',
  );
  expect(fs.existsSync(dbPath)).toBe(false);
  return { ...run(dbPath), dbPath };
}

describe('scripts/internal/print-reset-notice.sh — a database is about to be destroyed', () => {
  it('names every kind of curator work the rebuild cannot restore', () => {
    // "Local data is lost" does not let a reader recognise their own work. These
    // four are the ones that exist only in the database, by the ruling that made
    // freestyle adjudication authority database-native.
    const said = flat(runWithDatabase().stderr);
    expect(said).toContain('authored adjudication drafts');
    expect(said).toContain('publication and resolution state');
    expect(said).toContain('curator-created canonical tricks');
    expect(said).toContain('aliases, source links and modifier links attached to them');
    expect(said).toContain('no committed file can restore it');
  });

  it('names the file it is about, and which database that is', () => {
    // This runs inside a deploy as well as on its own, so an operator partway
    // through replacing a host database has to be able to tell from this text
    // alone that the file named is a development one.
    const r = runWithDatabase();
    expect(r.stderr).toContain(r.dbPath);
    expect(flat(r.stderr)).toContain('That file is a development database');
    expect(flat(r.stderr)).toContain(
      'refuses to run against a staging or production environment',
    );
  });

  it('names the refresh that keeps that work, without telling anyone to stop', () => {
    // A warning with nowhere to send the reader teaches them to read past it. But
    // "stop now" is wrong advice to two real callers: a deploy needs the rebuild
    // it is running, and someone who has just agreed to reapply a drifted schema
    // cannot get that from an in-place refresh.
    const r = runWithDatabase();
    expect(r.stderr).toContain('freestyle/run_freestyle.sh');
    expect(r.stderr).not.toMatch(/stop now/i);
  });

  it('opens with the marker this tree uses for a notice it prints', () => {
    // Every destructive notice printed at runtime here opens WARNING:, including
    // the rebuild deploy's own message about replacing the host database.
    const r = runWithDatabase();
    expect(r.stderr).toMatch(/^\s*WARNING: this deletes /m);
  });

  it('describes the lost work in the same words the launcher does', () => {
    // Two printed copies of one sentence: run_dev.sh lists it in its help, this
    // prints it at the moment of loss. A reader who meets both must meet one
    // statement rather than two descriptions of one thing, and nothing else keeps
    // the two in step.
    const launcher = flat(fs.readFileSync(path.join(REPO_ROOT, 'run_dev.sh'), 'utf8'));
    const said = flat(runWithDatabase().stderr);
    for (const phrase of [
      'authored adjudication drafts',
      'publication and resolution state',
      'curator-created canonical tricks',
      'aliases, source links and modifier links attached to them',
    ]) {
      expect(said).toContain(phrase);
      expect(launcher).toContain(phrase);
    }
  });

  it('goes to stderr, so a caller capturing stdout into a log still shows it', () => {
    const r = runWithDatabase();
    expect(r.stdout).toBe('');
    expect(r.stderr.length).toBeGreaterThan(0);
  });
});

describe('scripts/internal/print-reset-notice.sh — there is no database yet', () => {
  it('claims no loss, and raises no warning', () => {
    // The launcher runs the reset when no database is there, which is the first
    // command a new developer types. Telling them their curator work is being
    // destroyed is false on the one run where they have none, and a warning that
    // is wrong the first time is the one a reader learns to skip.
    const r = runWithoutDatabase();
    expect(r.stderr).toContain('nothing');
    expect(r.stderr).not.toMatch(/WARNING/);
    expect(r.stderr).not.toContain('authored adjudication drafts');
    expect(r.stderr).not.toContain('discarded');
  });

  it('still names the file it is about', () => {
    const r = runWithoutDatabase();
    expect(r.stderr).toContain(r.dbPath);
  });
});

describe('scripts/internal/print-reset-notice.sh — it cannot break the rebuild it precedes', () => {
  it('exits 0 whether or not the database is there', () => {
    // It sits one line above the delete. A non-zero exit under the reset's
    // `set -e` would abort a rebuild over a message.
    expect(runWithDatabase().status).toBe(0);
    expect(runWithoutDatabase().status).toBe(0);
  });

  it('refuses a call with no path rather than printing about an empty one', () => {
    const r = spawnSync('bash', [SCRIPT], {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/usage/);
  });
});
