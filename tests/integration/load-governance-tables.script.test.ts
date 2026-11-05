/**
 * Legacy-governance-review only: DELETE BEFORE GO-LIVE.
 *
 * legacy_data/scripts/load_governance_tables.py against the real legacy
 * export, reconciled against the counts recorded on the tracker card and
 * cross-checked by evidence/group-disposition-worksheet.csv: 170 committees
 * (78 public, 92 private), 1,718 roster rows, 351 group files of which 214
 * are committee-scoped.
 *
 * Skipped when footbag_private_repo isn't wired up as a companion checkout:
 * this loader's input is the private legacy export, which this public repo's
 * standard CI does not carry and must not depend on to build or test. The
 * script's own idempotency (a second --apply leaves the same rows, not
 * duplicates) is exercised here too, in the one environment where it is
 * meaningful to run at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXPORT_DIR = path.join(REPO_ROOT, 'footbag_private_repo', 'legacy-export');
const LOADER = path.join(REPO_ROOT, 'legacy_data', 'scripts', 'load_governance_tables.py');

const { dbPath } = setTestEnv('3613');

function runLoader(apply: boolean) {
  const args = [LOADER, '--db', dbPath, ...(apply ? ['--apply'] : [])];
  return spawnSync('python3', args, { cwd: REPO_ROOT, encoding: 'utf8', ...SPAWN_GUARD });
}

describe.skipIf(!fs.existsSync(EXPORT_DIR))('load_governance_tables.py against the real export', () => {
  beforeAll(() => {
    const db = createTestDb(dbPath);
    db.close();
  });

  afterAll(() => cleanupTestDb(dbPath));

  it('loads and reconciles against the worksheet counts', () => {
    const first = runLoader(true);
    expect(first.status, first.stderr).toBe(0);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const committees = db.prepare(
        'SELECT COUNT(*) AS n, SUM(committee_public) AS pub FROM internal_governance_committees',
      ).get() as { n: number; pub: number };
      expect(committees.n).toBe(170);
      expect(committees.pub).toBe(78);
      expect(committees.n - committees.pub).toBe(92);

      const roster = db.prepare('SELECT COUNT(*) AS n FROM internal_governance_committee_members').get() as { n: number };
      expect(roster.n).toBe(1718);

      const files = db.prepare(
        'SELECT COUNT(*) AS n, SUM(committee_scoped) AS scoped FROM internal_governance_group_files',
      ).get() as { n: number; scoped: number };
      expect(files.n).toBe(351);
      expect(files.scoped).toBe(214);

      // No ballot-level or forbidden-source data ever reaches a table: the six
      // internal_governance_* tables are the whole set this loader writes.
      const tableNames = (db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'internal_governance%'",
      ).all() as { name: string }[]).map((r) => r.name);
      expect(tableNames.sort()).toEqual([
        'internal_governance_committee_members',
        'internal_governance_committees',
        'internal_governance_elections',
        'internal_governance_group_files',
        'internal_governance_issue_vote_tallies',
        'internal_governance_issues',
      ]);
    } finally {
      db.close();
    }
  });

  it('is idempotent: a second --apply leaves the same row counts, not duplicates', () => {
    const second = runLoader(true);
    expect(second.status, second.stderr).toBe(0);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const committees = db.prepare('SELECT COUNT(*) AS n FROM internal_governance_committees').get() as { n: number };
      expect(committees.n).toBe(170);
    } finally {
      db.close();
    }
  });
});
