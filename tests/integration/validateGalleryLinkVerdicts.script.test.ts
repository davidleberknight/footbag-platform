/**
 * scripts/validate-gallery-link-verdicts.sh: every gallery external link in a
 * shipped database carries a safety verdict.
 *
 * The public read hides a gallery external link until it is verified, and the
 * curator seed leaves every link unverified when the committed verdicts file is
 * missing. A database in that state would launch every gallery with its external
 * links hidden, so the check refuses it. A quarantined link is a deliberate
 * verdict and passes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertMember, insertMemberGallery, insertGalleryExternalLink } from '../fixtures/factories';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
let tmp: string;

beforeAll(() => {
  tmp = createScratchDir('validate-gallery-link-verdicts');
});

afterAll(() => removeScratch(tmp));

function runOn(label: string, seed: (db: ReturnType<typeof createTestDb>) => void) {
  const dbFile = path.join(tmp, `${label}.db`);
  const db = createTestDb(dbFile);
  seed(db);
  db.close();
  return spawnSync('bash', ['scripts/validate-gallery-link-verdicts.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_DB_PATH: dbFile },
    ...SPAWN_GUARD,
  });
}

describe('validate-gallery-link-verdicts.sh', () => {
  // Defect caught: a database seeded without the verdicts file ships, and every
  // gallery on production shows none of its external links.
  it('refuses a link with no verification stamp and no quarantine reason, naming its gallery', () => {
    const res = runOn('unverified', (db) => {
      const owner = insertMember(db);
      const shown = insertMemberGallery(db, { owner_member_id: owner });
      insertGalleryExternalLink(db, { gallery_id: shown });
      const hidden = insertMemberGallery(db, { id: 'gallery-hidden-links', owner_member_id: owner });
      insertGalleryExternalLink(db, { gallery_id: hidden, validated_at: null });
    });
    expect(res.status, res.stdout + res.stderr).toBe(1);
    expect(res.stderr).toContain('1 gallery external link(s) carry no safety verdict');
    expect(res.stderr).toContain('gallery-hidden-links');
  });

  // Defect caught: a correct production database is refused because verified or
  // deliberately quarantined links are counted as missing verdicts.
  it('passes verified and quarantined links alike', () => {
    const res = runOn('verdicts', (db) => {
      const g = insertMemberGallery(db, { owner_member_id: insertMember(db) });
      insertGalleryExternalLink(db, { gallery_id: g });
      insertGalleryExternalLink(db, { gallery_id: g, validated_at: null, quarantine_reason: 'threat-list match' });
    });
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('all 2 gallery external link(s) carry a verdict');
  });

  // Defect caught: a missing database file reads as a clean pass.
  it('fails when the database is not there', () => {
    const res = spawnSync('bash', ['scripts/validate-gallery-link-verdicts.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, FOOTBAG_DB_PATH: path.join(tmp, 'absent.db') },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('DB not found');
  });
});
