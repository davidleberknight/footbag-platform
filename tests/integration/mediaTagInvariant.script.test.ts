/**
 * The media-tag invariant's empty-table contract.
 *
 * The freestyle refresh runs the invariant before any media exists, where an
 * empty table is the expected state and a pass is correct. The reset runs it a
 * second time after the curator seed, the only step that creates media rows,
 * and passes --require-items there: an empty table at that point means the
 * check has ended up in front of its producer again, and it must fail rather
 * than report every item clean.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMediaItem } from '../fixtures/factories';
import { scratchPath } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const { dbPath } = setTestEnv('4240');
const SCRIPT = path.join(process.cwd(), 'freestyle/loaders/25_qc_media_tag_invariant.py');

beforeAll(() => {
  // The full schema with no media rows: the state a reset is in before the
  // curator seed runs.
  createTestDb(dbPath).close();
});

afterAll(() => cleanupTestDb(dbPath));

function runInvariant(extra: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('python3', [SCRIPT, '--db', dbPath, ...extra], { encoding: 'utf8', ...SPAWN_GUARD });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('media-tag invariant on an empty media table', () => {
  // Defect caught: the freestyle refresh, which legitimately runs before any
  // media exists, starts failing on a fresh build.
  it('passes when no media is expected yet', () => {
    const res = runInvariant([]);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('PASS: all 0 items');
  });

  // Defect caught: the post-seed check reports a clean pass having examined
  // nothing, so a violation in the seeded media ships unnoticed.
  it('fails when items were required and none exist', () => {
    const res = runInvariant(['--require-items']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no active media items to check');
  });
});

describe('media-tag invariant with items present', () => {
  // Defect caught: with --require-items the check stops at counting rows and no
  // longer examines them, so an untagged curated item passes.
  it('still examines every item, and fails one that carries no tag', () => {
    const withItem = scratchPath('media-invariant', '.db');
    const db = createTestDb(withItem);
    const uploader = insertMember(db, { slug: 'media_invariant_uploader' });
    insertMediaItem(db, { uploader_member_id: uploader, caption: 'untagged clip' });
    db.close();
    try {
      const res = spawnSync('python3', [SCRIPT, '--db', withItem, '--require-items'], { encoding: 'utf8', ...SPAWN_GUARD });
      expect(res.status, res.stdout + res.stderr).toBe(1);
      expect(res.stderr).toContain('VIOLATIONS: 1');
      expect(res.stdout).toContain('1 active media_items checked');
    } finally {
      cleanupTestDb(withItem);
    }
  });
});
