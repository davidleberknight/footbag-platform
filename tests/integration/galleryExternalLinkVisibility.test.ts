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
import { insertMember, insertMemberGallery, insertGalleryExternalLink } from '../fixtures/factories';

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

  insertMemberGallery(db, {
    id: GALLERY_ID,
    created_at: now,
    owner_member_id: memberId,
    name: 'Visibility Gallery',
    description: '',
    is_default: 0,
    sort_order: 'upload_desc',
  });

  insertGalleryExternalLink(db, {
    id: ROW_VERIFIED, created_at: now, gallery_id: GALLERY_ID,
    label: 'Verified', url: VERIFIED_URL, validated_at: now, quarantine_reason: null, sort_order: 0,
  });
  insertGalleryExternalLink(db, {
    id: ROW_UNVERIFIED, created_at: now, gallery_id: GALLERY_ID,
    label: 'Unverified', url: UNVERIFIED_URL, validated_at: null, quarantine_reason: null, sort_order: 1,
  });
  insertGalleryExternalLink(db, {
    id: ROW_QUARANTINED, created_at: now, gallery_id: GALLERY_ID,
    label: 'Quarantined', url: QUARANTINED_URL, validated_at: null,
    quarantine_reason: 'This URL is not allowed.', sort_order: 2,
  });
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
