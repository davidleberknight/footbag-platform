/**
 * The /media hub Member galleries category and the member-galleries list page in
 * the empty state: a member-owned named gallery exists, but no item matches it.
 * An empty gallery offers a visitor nothing, so the hub hides the category (no
 * placeholder) and the list page renders its empty state, while the gallery's
 * own URL keeps working for its owner to fill and share.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberGallery,
  insertFreeformTag,
  insertGalleryCriterionTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3128');

const OWNER_ID = 'empty-gallery-owner';
const OWNER_SLUG = 'empty_gallery_owner';
const GALLERY_ID = 'gallery_empty_member_001';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Empty Owner' });
  // The owner's uploader tag is the gallery's criterion, as on every member
  // gallery; the owner has uploaded nothing, so no item matches.
  const byTag = insertFreeformTag(db, { tag_normalized: `#by_${OWNER_SLUG}`, tag_display: `#by_${OWNER_SLUG}` });
  insertMemberGallery(db, { id: GALLERY_ID, owner_member_id: OWNER_ID, created_by: OWNER_ID, name: 'Not Yet Filled' });
  insertGalleryCriterionTag(db, GALLERY_ID, byTag);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media (hub) when no member gallery has items', () => {
  it('hides the Member galleries category, with no placeholder or link', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('None yet');
    expect(res.text).not.toContain('href="/media/member-galleries"');
  });
});

describe('GET /media/member-galleries when no member gallery has items', () => {
  it('renders the empty state and does not list the empty gallery', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No member galleries yet.');
    expect(res.text).not.toContain(`href="/media/${GALLERY_ID}"`);
  });
});

describe('GET /media/:galleryId for an empty member gallery', () => {
  it('still renders at its own URL', async () => {
    const app = createApp();
    const res = await request(app).get(`/media/${GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('No photos or videos found.');
  });
});
