/**
 * Integration tests for scripts/take-pre-cutover-snapshot.sh.
 *
 * This snapshot is the only way back after the member load, and until now it
 * had no test of its own: it ran only as step one of the pre-cutover checklist,
 * where the orchestrator's test asserts a PASS label and nothing about what the
 * artifact contains. Three properties decide whether a rollback is possible at
 * all, and each of them has failed silently before:
 *
 *   - the artifact is gzipped, because both halves of the restore expect that
 *     format and an uncompressed one is unreadable at the moment it is needed;
 *   - the manifest carries every row count the cutover preflight requires, so
 *     the restore can be reconciled against it rather than merely completing;
 *   - the manifest records where the snapshot came from, because the pre-flip
 *     prefix holds exactly one object and nothing else distinguishes a
 *     production snapshot from one taken of an operator's own machine.
 *
 * Runs local-only so nothing reaches AWS.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_SQL = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

// Every table the manifest must count. Naming them here rather than reading the
// script's own list is the point: this is the requirement, and a count quietly
// dropped from the script has to fail against it.
const REQUIRED_COUNTS = [
  'members',
  'legacy_members',
  'historical_persons',
  'clubs',
  'audit_entries',
  'auto_link_staged_candidates',
  'name_variants',
  'club_bootstrap_leaders',
  'freestyle_tricks',
  'freestyle_records',
  'consecutive_kicks_records',
];

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function buildDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(SCHEMA_SQL);
  db.close();
}

function run(env: Record<string, string> = {}) {
  return spawnSync('bash', ['scripts/take-pre-cutover-snapshot.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FOOTBAG_DB_PATH: path.join(workDir, 'footbag.db'),
      FOOTBAG_SNAPSHOT_DIR: path.join(workDir, 'snapshots'),
      FOOTBAG_SNAPSHOT_LOCAL_ONLY: '1',
      ...env,
    },
    ...SPAWN_GUARD,
  });
}

function manifestFrom(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout.slice(stdout.indexOf('{')));
}

describe('take-pre-cutover-snapshot.sh produces a restorable artifact', () => {
  it('writes a gzipped snapshot, which is the only format the restore reads', () => {
    buildDb(path.join(workDir, 'footbag.db'));
    const res = run();
    expect(res.status, res.stderr).toBe(0);

    const manifest = manifestFrom(res.stdout);
    const archive = manifest.snapshot_path as string;
    expect(archive.endsWith('.db.gz')).toBe(true);
    // Sniff the file rather than trusting the name. An artifact whose extension
    // says gzip and whose bytes do not is exactly the failure the restore hits
    // after the member database has already been replaced.
    const magic = fs.readFileSync(archive).subarray(0, 2);
    expect([...magic]).toEqual([0x1f, 0x8b]);
  });

  it('records both the database hash and the archive hash, which are different things', () => {
    buildDb(path.join(workDir, 'footbag.db'));
    const manifest = manifestFrom(run().stdout);
    // byte_size / sha256 describe the database a restore reconstructs and are
    // what you verify after restoring; archive_* describe the uploaded object
    // and can be checked without decompressing it. Conflating them makes one of
    // the two checks impossible.
    expect(manifest.sha256).not.toEqual(manifest.archive_sha256);
    expect(manifest.byte_size).not.toEqual(manifest.archive_byte_size);
    expect(manifest.integrity_check).toBe('ok');
  });

  it('counts every table the cutover preflight requires of the manifest', () => {
    buildDb(path.join(workDir, 'footbag.db'));
    const counts = manifestFrom(run().stdout).row_counts as Record<string, number>;
    for (const table of REQUIRED_COUNTS) {
      expect(counts, `manifest is missing the ${table} count`).toHaveProperty(table);
      expect(typeof counts[table]).toBe('number');
    }
  });

  it('records where the snapshot came from, so a restore can tell', () => {
    buildDb(path.join(workDir, 'footbag.db'));
    const manifest = manifestFrom(run().stdout);
    expect(manifest.source_host).toBeTruthy();
    expect(manifest.source_db_path).toContain('footbag.db');
  });

  it('refuses a run with no DR bucket unless local-only is explicit', () => {
    buildDb(path.join(workDir, 'footbag.db'));
    const res = spawnSync('bash', ['scripts/take-pre-cutover-snapshot.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        FOOTBAG_DB_PATH: path.join(workDir, 'footbag.db'),
        FOOTBAG_SNAPSHOT_DIR: path.join(workDir, 'snapshots'),
        FOOTBAG_SNAPSHOT_LOCAL_ONLY: '',
        FOOTBAG_DR_BUCKET: '',
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('FOOTBAG_DR_BUCKET');
  });

  it('refuses when the database it is told to snapshot is not there', () => {
    const res = run({ FOOTBAG_DB_PATH: path.join(workDir, 'absent.db') });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('DB file not found');
  });
});
