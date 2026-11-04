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
  it('names where saved curator work lives, so a reader can see it survives', () => {
    // A reader deciding whether to reset needs to know their saves are safe, and
    // where to look for them. The saves folder appears with the first save, so for
    // it this checks only that its parent, freestyle/inputs, exists.
    const said = flat(runWithDatabase().stderr);
    for (const folder of ['curated', 'freestyle/inputs/curator_saves']) {
      expect(said).toContain(folder);
      expect(fs.existsSync(path.join(REPO_ROOT, folder.split('/').slice(0, 2).join('/')))).toBe(true);
    }
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

  it('does not tell anyone to stop', () => {
    // "Stop now" is wrong advice to two real callers: a deploy needs the rebuild it
    // is running, and someone who has just agreed to reapply a drifted schema
    // cannot get that any other way.
    expect(runWithDatabase().stderr).not.toMatch(/stop now/i);
  });

  it('opens with the marker this tree uses for a notice it prints', () => {
    // Every destructive notice printed at runtime here opens WARNING:, including
    // the rebuild deploy's own message about replacing the host database.
    const r = runWithDatabase();
    expect(r.stderr).toMatch(/^\s*WARNING: this deletes /m);
  });

  it('names the same folders the launcher does', () => {
    // run_dev.sh says this in its help and this prints it at the moment of reset. A
    // reader who meets both must not be sent to two different places.
    const launcher = flat(fs.readFileSync(path.join(REPO_ROOT, 'run_dev.sh'), 'utf8'));
    expect(flat(runWithDatabase().stderr)).toContain('freestyle/inputs/curator_saves/');
    expect(launcher).toContain('freestyle/inputs/curator_saves/');
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
    expect(r.stderr).not.toContain('curator_saves');
    expect(r.stderr).not.toContain('gone');
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
