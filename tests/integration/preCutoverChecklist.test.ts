/**
 * Integration tests for scripts/pre-cutover-checklist.sh and its sister
 * validation gate scripts. Exercises both the green-path orchestration
 * (all gates PASS → exit 0; summary block shows the expected GATE: lines)
 * and a fault-injection red path (empty name_variants → G11 FAIL → exit
 * non-zero, summary highlights the failed gate).
 *
 * AWS-touching steps run in --mock-aws so the suite is hermetic; the
 * smoke / e2e suites are skipped via --skip-tests so the orchestrator
 * test does not re-invoke them transitively.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_SQL = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'precutover-'));
}

function buildFixtureDb(dbPath: string, opts: { withNameVariants?: boolean } = {}): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(SCHEMA_SQL);

  // Minimum legacy_members fixture: real_name + country + import_source +
  // honor flag so G1-G6 + G6-tiers pass.
  const lmInsert = db.prepare(`
    INSERT INTO legacy_members (
      legacy_member_id, legacy_user_id, legacy_email,
      real_name, display_name, display_name_normalized,
      city, region, country,
      bio, birth_date, street_address, postal_code,
      ifpa_join_date, first_competition_year,
      is_hof, is_bap, legacy_is_admin,
      import_source, imported_at,
      version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, '', NULL, NULL, NULL, NULL, NULL, ?, ?, 0, 'mirror', '2025-01-01T00:00:00.000Z', 1)
  `);
  for (let i = 1; i <= 5; i++) {
    lmInsert.run(
      `legmem-${i}`, `legacy-user-${i}`, `legacy${i}@example.com`,
      `Player ${i}`, `Player ${i}`, `player ${i}`,
      'TestCity', 'US',
      i === 1 ? 1 : 0,  // is_hof on row 1 (honors-only fallback signal)
      i === 2 ? 1 : 0,  // is_bap on row 2
    );
  }

  // Minimum legacy_club_candidates fixture for G7.
  const lccInsert = db.prepare(`
    INSERT INTO legacy_club_candidates (
      id, created_at, created_by, updated_at, updated_by, version,
      legacy_club_key, display_name, classification, confidence_score
    ) VALUES (?, '2025-01-01T00:00:00.000Z', 'system', '2025-01-01T00:00:00.000Z', 'system', 1,
              ?, ?, 'pre_populate', ?)
  `);
  lccInsert.run('lcc-1', 'test_club_a', 'Test Club A', 0.9);
  lccInsert.run('lcc-2', 'test_club_b', 'Test Club B', 0.6);

  // Minimum club_bootstrap_leaders fixture for G8. Requires a clubs row
  // (FK club_id) and a tags row (FK hashtag_tag_id on clubs).
  db.prepare(`
    INSERT INTO tags (
      id, created_at, created_by, updated_at, updated_by, version,
      tag_normalized, tag_display, is_standard, standard_type
    ) VALUES ('tag-club-1', '2025-01-01T00:00:00.000Z', 'system',
              '2025-01-01T00:00:00.000Z', 'system', 1,
              '#test_club', '#test_club', 1, 'club')
  `).run();
  db.prepare(`
    INSERT INTO clubs (
      id, created_at, created_by, updated_at, updated_by, version,
      name, city, country, status, hashtag_tag_id
    ) VALUES ('club-1', '2025-01-01T00:00:00.000Z', 'system',
              '2025-01-01T00:00:00.000Z', 'system', 1,
              'Test Club', 'Testville', 'US', 'active', 'tag-club-1')
  `).run();
  db.prepare(`
    INSERT INTO club_bootstrap_leaders (
      id, created_at, created_by, updated_at, updated_by, version,
      club_id, legacy_member_id, role, status, confidence_score
    ) VALUES ('cbl-1', '2025-01-01T00:00:00.000Z', 'system',
              '2025-01-01T00:00:00.000Z', 'system', 1,
              'club-1', 'legmem-1', 'leader', 'provisional', 0.85)
  `).run();

  // Optional name_variants seed (omit for the red-path test to fail G11).
  if (opts.withNameVariants !== false) {
    const nvInsert = db.prepare(`
      INSERT INTO name_variants (canonical_normalized, variant_normalized, source)
      VALUES (?, ?, 'mirror_mined')
    `);
    for (let i = 1; i <= 260; i++) {
      nvInsert.run(`canonical ${i}`, `variant ${i}`);
    }
  }

  db.close();
}

function runChecklist(dbPath: string, snapshotDir: string): { status: number; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FOOTBAG_DB_PATH:                  dbPath,
    FOOTBAG_SNAPSHOT_DIR:             snapshotDir,
    FOOTBAG_PRECUTOVER_MOCK_AWS:      '1',
    FOOTBAG_PRECUTOVER_SKIP_TESTS:    '1',
    FOOTBAG_NAME_VARIANTS_MIN:        '250',
    FOOTBAG_BOOTSTRAP_LEADER_MIN:     '1',
  };
  const result = spawnSync('bash', ['scripts/pre-cutover-checklist.sh'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('pre-cutover checklist orchestrator', () => {
  let workDir: string;
  let dbPath: string;
  let snapshotDir: string;

  beforeEach(() => {
    workDir = tempDir();
    dbPath = path.join(workDir, 'fixture.db');
    snapshotDir = path.join(workDir, 'snapshots');
  });

  afterEach(() => {
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('green path: every gate PASS, exit 0, summary lists each gate', { timeout: 60_000 }, () => {
    buildFixtureDb(dbPath);
    const r = runChecklist(dbPath, snapshotDir);
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/READY: all gates PASS/);
    for (const label of ['SNAPSHOT', 'G1', 'G7', 'G8', 'G6-tiers', 'G11', 'DEV-ADMIN-AUDIT', 'DNS-TTL']) {
      expect(r.stdout).toMatch(new RegExp(`GATE: ${label}[^\\n]*PASS`));
    }
  });

  it('red path: empty name_variants → G11 FAIL → exit non-zero, summary reports the failure', { timeout: 60_000 }, () => {
    buildFixtureDb(dbPath, { withNameVariants: false });
    const r = runChecklist(dbPath, snapshotDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/GATE: G11 FAIL/);
    expect(r.stderr).toMatch(/BLOCKED: \d+ gate\(s\) FAIL/);
  });
});
