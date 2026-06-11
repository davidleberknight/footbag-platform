/**
 * Gallery external-link public visibility: hide until verified.
 *
 * A curator gallery external link renders publicly only once it has been
 * verified at sidecar-intake time (validated_at stamped) and is not
 * quarantined. Unverified (validated_at NULL) and quarantined rows are hidden
 * from listGalleryExternalLinksForPublic; the admin read returns all rows for
 * remediation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3125');

let media: typeof import('../../src/db/db').media;

const GALLERY_ID = 'gal_vis_test';
const ROW_VERIFIED = 'lnk_vis_verified';
const ROW_UNVERIFIED = 'lnk_vis_unverified';
const ROW_QUARANTINED = 'lnk_vis_quarantined';

const VERIFIED_URL = 'https://verified.example/gallery';
const UNVERIFIED_URL = 'https://unverified.example/gallery';
const QUARANTINED_URL = 'https://quarantined.example/gallery';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const memberId = insertMember(db);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO member_galleries (
      id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 'Visibility Gallery', '', 0, 'upload_desc')
  `).run(GALLERY_ID, now, memberId, now, memberId, memberId);

  const ins = db.prepare(`
    INSERT INTO gallery_external_links (
      id, created_at, created_by, updated_at, updated_by, version,
      gallery_id, label, url, validated_at, quarantine_reason, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `);
  ins.run(ROW_VERIFIED, now, memberId, now, memberId, GALLERY_ID, 'Verified', VERIFIED_URL, now, null, 0);
  ins.run(ROW_UNVERIFIED, now, memberId, now, memberId, GALLERY_ID, 'Unverified', UNVERIFIED_URL, null, null, 1);
  ins.run(ROW_QUARANTINED, now, memberId, now, memberId, GALLERY_ID, 'Quarantined', QUARANTINED_URL, null, 'This URL is not allowed.', 2);
  db.close();

  ({ media } = await import('../../src/db/db'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('gallery external links public read hides until verified', () => {
  it('public read returns only the verified row', () => {
    const ids = (media.listGalleryExternalLinksForPublic.all(GALLERY_ID) as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(ROW_VERIFIED);
    expect(ids).not.toContain(ROW_UNVERIFIED);
    expect(ids).not.toContain(ROW_QUARANTINED);
  });

  it('admin read returns all rows including unverified and quarantined', () => {
    const ids = (media.listGalleryExternalLinks.all(GALLERY_ID) as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([ROW_VERIFIED, ROW_UNVERIFIED, ROW_QUARANTINED]));
  });
});
