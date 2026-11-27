/**
 * The /media hub Curated galleries card and the curated-galleries list page in
 * the empty state: a curated gallery exists, but no item matches it, while a
 * member gallery has items. An empty gallery offers a visitor nothing, so the
 * hub hides the curated card while keeping the member card, and the list page
 * renders its empty state, while the gallery's own URL keeps working.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import {
  insertMember,
  insertMemberGallery,
  insertFreeformTag,
  insertGalleryCriterionTag,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('7503');

const SYSTEM_ID = 'curated-empty-system';
const MEMBER_ID = 'curated-empty-member';
const CURATED_ID = 'gallery_curated_unfilled';
const MEMBER_GALLERY_ID = 'gallery_curated_empty_member';

let page: (path: string) => Promise<request.Response>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'curated_empty_system', is_system: 1, onboarding: 'none' });
  insertMember(db, { id: MEMBER_ID, slug: 'curated_empty_member' });
  // A curated gallery whose criterion nothing carries.
  const curatedTag = insertFreeformTag(db, { tag_normalized: '#curated_unfilled', tag_display: '#curated_unfilled' });
  insertMemberGallery(db, { id: CURATED_ID, owner_member_id: SYSTEM_ID, created_by: SYSTEM_ID, name: 'Unfilled Curated' });
  insertGalleryCriterionTag(db, CURATED_ID, curatedTag);
  // A member gallery with one matching item, so the hub has a gallery card to show.
  const memberTag = insertFreeformTag(db, { tag_normalized: '#curated_empty_member', tag_display: '#curated_empty_member' });
  insertMemberGallery(db, { id: MEMBER_GALLERY_ID, owner_member_id: MEMBER_ID, created_by: MEMBER_ID, name: 'Filled Member' });
  insertGalleryCriterionTag(db, MEMBER_GALLERY_ID, memberTag);
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: MEMBER_ID }), memberTag);
  db.close();
  const createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media (hub) when no curated gallery has items', () => {
  it('hides the Curated galleries card and keeps the Member galleries card', async () => {
    const res = await page('/media');
    expect(res.status).toBe(200);
    // Catches: a curated card linking to a list that has nothing on it.
    expect(res.text).not.toContain('href="/media/curated-galleries"');
    // Catches: the curated has-content check hiding the member card too.
    expect(res.text).toContain('href="/media/member-galleries"');
  });
});

describe('GET /media/curated-galleries when no curated gallery has items', () => {
  it('renders the empty state and does not list the empty gallery', async () => {
    const res = await page('/media/curated-galleries');
    // Catches: the list page failing, rather than saying it is empty, when reached by address.
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="empty-state"');
    expect(res.text).not.toContain(`href="/media/${CURATED_ID}"`);
  });
});

describe('GET /media/:galleryId for an empty curated gallery', () => {
  it('still renders at its own URL', async () => {
    const res = await page(`/media/${CURATED_ID}`);
    // Catches: an empty curated gallery becoming unreachable at its own address.
    expect(res.status).toBe(200);
  });
});
