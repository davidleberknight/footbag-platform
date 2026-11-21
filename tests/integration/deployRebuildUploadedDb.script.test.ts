/**
 * The rebuild deploy ships a database only when the host can prove it is the
 * file the workstation sealed and that it is sound, and the host proves both
 * before it stops the service or deletes the live database.
 *
 * Without that order, an upload that cannot be served takes the site down: the
 * host half used to delete the live database, install the upload and only then
 * run its integrity check, so a torn upload left the service stopped and the
 * database it would have restarted on already gone.
 *
 * The workstation half seals the file after its last local write: it checkpoints
 * the write-ahead log, because the upload carries the main file only; refuses
 * when another connection holds the database open, because a copy taken under a
 * writer arrives torn; repeats the integrity check; and fingerprints the result
 * for the host half.
 *
 * Both halves are sliced and run under bash, the shape the neighbouring rebuild
 * suites use, against a scratch database the test builds.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO_ROOT = process.cwd();
const REMOTE_HALF = join(REPO_ROOT, 'scripts/internal/deploy-rebuild-remote.sh');
const CALLER = join(REPO_ROOT, 'scripts/deploy-rebuild.sh');
const HAVE_SQLITE3 = requireToolInCI('sqlite3');

let scratch: string;

beforeEach(() => {
  scratch = createScratchDir('rebuild-uploaded-db');
});

afterEach(() => {
  removeScratch(scratch);
});

/** A WAL-mode database with enough rows to span many pages, as the real one does. */
function buildDb(path: string): void {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE rows_for_pages (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO rows_for_pages (body) VALUES (?)');
  db.transaction(() => {
    for (let i = 0; i < 2000; i += 1) insert.run(`row ${i} `.repeat(20));
  })();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sliceBetween(file: string, begin: (l: string) => boolean, end: (l: string) => boolean): string {
  const lines = readFileSync(file, 'utf8').split('\n');
  const from = lines.findIndex(begin);
  const to = lines.findIndex((l, i) => i > from && end(l));
  expect(from, 'the slice start is present').toBeGreaterThanOrEqual(0);
  expect(to, 'the slice end is present').toBeGreaterThan(from);
  return lines.slice(from, to + 1).join('\n');
}

function runScript(body: string, env: NodeJS.ProcessEnv) {
  const path = join(scratch, 'slice.sh');
  writeFileSync(path, `set -euo pipefail\n${body}\n`, 'utf8');
  const res = spawnSync('bash', [path], { encoding: 'utf-8', env: { ...process.env, ...env }, ...SPAWN_GUARD });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe.skipIf(!HAVE_SQLITE3)('the host half judges the upload before it touches the live site', () => {
  const block = () =>
    sliceBetween(REMOTE_HALF, (l) => l === '# uploaded-db-check: begin', (l) => l === '# uploaded-db-check: end');

  function runCheck(newDb: string, expected: string | undefined) {
    const env: NodeJS.ProcessEnv = { NEW_DB: newDb };
    if (expected !== undefined) env.EXPECTED_DB_SHA256 = expected;
    return runScript(block(), env);
  }

  // Defect caught: the check refuses everything, so no rebuild deploy can ever ship.
  it('lets through the sealed, sound database', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const res = runCheck(db, sha256(db));
    expect(res.status, res.stderr).toBe(0);
  });

  // Defect caught: a transfer that changed the file, or a local write after the
  // seal, is installed as the live database.
  it('refuses an upload whose fingerprint differs from the sealed one', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const res = runCheck(db, '0'.repeat(64));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('0'.repeat(64));
    expect(res.stderr).toContain(sha256(db));
  });

  // Defect caught: a database that left the workstation damaged is installed,
  // and the site comes up on a malformed file or not at all.
  it('refuses a damaged database even when its fingerprint matches', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    // Overwrite a stretch of interior pages, past the header, as a torn copy would.
    const fd = openSync(db, 'r+');
    writeSync(fd, Buffer.alloc(16384, 0xa5), 0, 16384, 8192);
    closeSync(fd);
    const res = runCheck(db, sha256(db));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/integrity check/);
  });

  // Defect caught: a database whose integrity check lists problems, without the
  // tool failing, is installed because only the tool's exit status was read. A
  // stand-in sqlite3 prints such a report, since the check reads only whether
  // the output is exactly "ok".
  it('refuses when the integrity check reports problems and the tool still exits zero', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const bin = join(scratch, 'bin');
    mkdirSync(bin);
    const stub = join(bin, 'sqlite3');
    writeFileSync(stub, '#!/usr/bin/env bash\nprintf "*** in database main ***\\nrow 2 missing from index\\n"\n');
    chmodSync(stub, 0o755);
    const res = runScript(block(), {
      NEW_DB: db,
      EXPECTED_DB_SHA256: sha256(db),
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/integrity check/);
  });

  // Defect caught: a caller that forgot to send the fingerprint skips the check.
  it('refuses when the caller sent no fingerprint', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const res = runCheck(db, undefined);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/EXPECTED_DB_SHA256/);
  });
});

describe.skipIf(!HAVE_SQLITE3)('the workstation seals the database it uploads', () => {
  const block = () =>
    sliceBetween(
      CALLER,
      (l) => l === 'echo "==> Sealing the database for upload..."',
      (l) => l.startsWith('SHIPPED_DB_SHA256='),
    );

  function runSeal(localDb: string, extraEnv: NodeJS.ProcessEnv = {}) {
    const body = [
      'cr_die() { printf "DIE: %s\\n" "$*" >&2; exit 1; }',
      block(),
      'printf "%s\\n" "$SHIPPED_DB_SHA256"',
    ].join('\n');
    return runScript(body, { LOCAL_DB: localDb, ...extraEnv });
  }

  /**
   * A stand-in sqlite3 answering the checkpoint and the integrity check
   * separately, so each refusal is driven on its own. The seal reads only the
   * checkpoint's busy column and whether the integrity output is exactly "ok".
   */
  function stubSqlite(checkpoint: { out: string; exit: number }, integrity: string): NodeJS.ProcessEnv {
    const bin = join(scratch, 'bin');
    mkdirSync(bin, { recursive: true });
    const stub = join(bin, 'sqlite3');
    writeFileSync(stub, [
      '#!/usr/bin/env bash',
      'case "$2" in',
      `  *wal_checkpoint*) printf '%s\\n' ${JSON.stringify(checkpoint.out)}; exit ${checkpoint.exit} ;;`,
      `  *integrity_check*) printf '%s\\n' ${JSON.stringify(integrity)} ;;`,
      'esac',
    ].join('\n') + '\n');
    chmodSync(stub, 0o755);
    return { PATH: `${bin}:${process.env.PATH ?? ''}` };
  }

  // Defect caught: a database a local step damaged after the first integrity
  // check is sealed and shipped, and the host refuses it only after a full upload.
  it('refuses a database that fails its integrity check at the seal', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const res = runSeal(db, stubSqlite({ out: '0|0|0', exit: 0 }, 'row 2 missing from index'));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/^DIE: .*integrity_check/m);
  });

  // Defect caught: a checkpoint that errors is read as a clean one, and a file
  // still missing pages from its log is sealed.
  it('refuses when the checkpoint itself fails', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const res = runSeal(db, stubSqlite({ out: '0|0|0', exit: 1 }, 'ok'));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/^DIE: could not checkpoint/m);
  });

  // Defect caught: the fingerprint sent to the host is not the file uploaded, so
  // every honest deploy is refused or a different file is vouched for.
  it('fingerprints the file as it sits on disk after the checkpoint', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const res = runSeal(db);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout.trim().split('\n').pop()).toBe(sha256(db));
  });

  // Defect caught: a deploy uploads the main file while another connection holds
  // the database open, and the copy arrives torn or missing pages still in the log.
  it('refuses while another connection holds a read open', () => {
    const db = join(scratch, 'footbag.db');
    buildDb(db);
    const writer = new Database(db);
    writer.prepare('INSERT INTO rows_for_pages (body) VALUES (?)').run('unsealed');
    const reader = new Database(db);
    reader.exec('BEGIN');
    reader.prepare('SELECT count(*) FROM rows_for_pages').get();
    try {
      const res = runSeal(db);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/^DIE: /m);
    } finally {
      reader.exec('COMMIT');
      reader.close();
      writer.close();
    }
  });
});

describe('the seal and the check sit where they protect the live site (static-text)', () => {
  // Defect caught: the host check is moved back below the destructive steps, so
  // a bad upload again stops the service and deletes the live database first.
  it('the host half checks the upload before stopping the service or deleting the live database', () => {
    const text = readFileSync(REMOTE_HALF, 'utf8');
    const check = text.indexOf('# uploaded-db-check: begin');
    expect(check).toBeGreaterThan(0);
    expect(text.indexOf('systemctl stop footbag')).toBeGreaterThan(check);
    expect(text.indexOf('rm -f "$DB_PATH"')).toBeGreaterThan(check);
  });

  // Defect caught: a local write after the seal changes the file, or the
  // fingerprint never reaches the host half.
  it('the caller seals after its last local write, before the upload, and sends the fingerprint', () => {
    const text = readFileSync(CALLER, 'utf8');
    const seal = text.indexOf('echo "==> Sealing the database for upload..."');
    expect(seal).toBeGreaterThan(text.indexOf('seed_email_templates.py'));
    expect(seal).toBeGreaterThan(text.indexOf('shipped_db_checks "$REPO_ROOT" "$LOCAL_DB"'));
    expect(seal).toBeLessThan(text.indexOf('echo "==> Rsyncing source to host..."'));
    expect(text).toMatch(/printf 'EXPECTED_DB_SHA256=%q\\n' +"\$SHIPPED_DB_SHA256"/);
  });
});
