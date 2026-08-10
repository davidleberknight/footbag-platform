/**
 * The shared set header across every media viewing surface.
 *
 * Browse results, a named gallery and a member's own gallery are one query
 * model with different seeds, so they say what the visitor is looking at the
 * same way. A set whose only criterion is one member's uploader tag reads as
 * that person: their display name heads the page and a plain line beneath says
 * what the set is and how much is in it. Three routes reach that same set
 * (`?tag=by_<slug>`, `?context=by_<slug>`, and the auto-created personal
 * gallery at its own id) and all three must present it identically.
 *
 * The display name is public, so every viewer sees it; the link through to the
 * member profile is added only for a signed-in viewer, because profiles are
 * member-only. A `#by_*` tag whose member no longer resolves, because the
 * account was soft deleted or its personal data purged, yields no identity at
 * all, and the header falls back to the plain tag-query prose rather than
 * naming someone the database deliberately withholds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreeformTag,
  attachMediaTag,
  insertMediaItem,
  insertMemberGallery,
  insertGalleryCriterionTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4043');

let createApp: Awaited<ReturnType<typeof importApp>>;

const UPLOADER_SLUG = 'set_header_uploader';
const UPLOADER_NAME = 'Set Header Uploader';
const PERSONAL_GALLERY_ID = 'gallery_set_header_personal';
const GHOST_GALLERY_ID = 'gallery_set_header_ghost';
const EMPTY_GALLERY_ID = 'gallery_set_header_empty';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const uploader = insertMember(db, {
    id: 'member-set-header-uploader', slug: UPLOADER_SLUG,
    login_email: 'set-header@example.com', display_name: UPLOADER_NAME,
  });
  // Soft deleted, so the uploader tag below resolves to no name at all.
  const ghost = insertMember(db, {
    id: 'member-set-header-ghost', slug: 'set_header_ghost',
    login_email: 'ghost@example.com', display_name: 'Set Header Ghost',
    deleted_at: '2026-01-01T00:00:00.000Z',
  });

  const byUploader = insertFreeformTag(db, { tag_normalized: `#by_${UPLOADER_SLUG}`, tag_display: `#by_${UPLOADER_SLUG}` });
  const byGhost = insertFreeformTag(db, { tag_normalized: '#by_set_header_ghost', tag_display: '#by_set_header_ghost' });
  const topicTag = insertFreeformTag(db, { tag_normalized: '#set_header_topic', tag_display: '#set_header_topic' });

  const item = insertMediaItem(db, { uploader_member_id: uploader, caption: 'uploader-item' });
  attachMediaTag(db, item, byUploader);
  attachMediaTag(db, item, topicTag);

  const ghostItem = insertMediaItem(db, { uploader_member_id: ghost, caption: 'ghost-item' });
  attachMediaTag(db, ghostItem, byGhost);

  // The auto-created personal gallery: one criterion, the owner's uploader tag.
  insertMemberGallery(db, { id: PERSONAL_GALLERY_ID, owner_member_id: uploader, name: 'My Media' });
  insertGalleryCriterionTag(db, PERSONAL_GALLERY_ID, byUploader);

  // The same shape, but its owner no longer resolves.
  insertMemberGallery(db, { id: GHOST_GALLERY_ID, owner_member_id: uploader, name: 'Ghost Media' });
  insertGalleryCriterionTag(db, GHOST_GALLERY_ID, byGhost);

  // A gallery whose criterion tag carries no media at all, for the empty state.
  const barrenTag = insertFreeformTag(db, { tag_normalized: '#set_header_barren', tag_display: '#set_header_barren' });
  insertMemberGallery(db, { id: EMPTY_GALLERY_ID, owner_member_id: uploader, name: 'Empty Media' });
  insertGalleryCriterionTag(db, EMPTY_GALLERY_ID, barrenTag);

  db.close();

  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const IDENTITY_LINE = `Photos and videos uploaded by ${UPLOADER_NAME}. Showing 1 item.`;
const HEADING_IS_UPLOADER = `<h1>${UPLOADER_NAME}</h1>`;

describe('a set of one member\'s uploads reads as that person', () => {
  it('heads the browse tag route with the member, not with the query', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${UPLOADER_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(HEADING_IS_UPLOADER);
    expect(res.text).toContain(IDENTITY_LINE);
  });

  it('heads the browse context route the same way', async () => {
    const res = await request(createApp()).get(`/media/browse?context=by_${UPLOADER_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(HEADING_IS_UPLOADER);
    expect(res.text).toContain(IDENTITY_LINE);
  });

  it('heads the personal gallery with the member rather than the gallery name', async () => {
    const res = await request(createApp()).get(`/media/${PERSONAL_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(HEADING_IS_UPLOADER);
    expect(res.text).toContain(IDENTITY_LINE);
  });
});

describe('the profile behind the identity heading is member-only', () => {
  it('shows the name unlinked to a signed-out visitor, who cannot open a profile', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${UPLOADER_SLUG}`);
    expect(res.text).toContain(HEADING_IS_UPLOADER);
    expect(res.text).not.toContain(`/members/${UPLOADER_SLUG}`);
  });
});

describe('an unresolvable uploader tag names nobody', () => {
  it('falls back to the tag-query header on browse', async () => {
    const res = await request(createApp()).get('/media/browse?tag=by_set_header_ghost');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Browse Media</h1>');
    expect(res.text).not.toContain('Set Header Ghost');
  });

  it('falls back to the gallery name on a named gallery', async () => {
    const res = await request(createApp()).get(`/media/${GHOST_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Named Gallery: Ghost Media</h1>');
    // Neither the withheld display name nor the raw slug stands in for it.
    expect(res.text).not.toContain('Set Header Ghost');
    expect(res.text).not.toContain('<h1>set_header_ghost');
  });
});

// "No media yet" told a visitor the site holds nothing, when it meant nothing
// matched. Both surfaces now say the same true thing, and neither restates the
// criteria, because the header directly above already names the set.
describe('an empty set says the same thing wherever it is reached', () => {
  const EMPTY_STATE = 'No photos or videos found.';

  it('says nothing matched on browse, rather than that nothing exists', async () => {
    // Both tags exist and no item carries both, so this is a real result set of
    // size zero rather than the landing.
    const res = await request(createApp()).get('/media/browse?tag=set_header_topic&tag=by_set_header_ghost');
    expect(res.status).toBe(200);
    expect(res.text).toContain(EMPTY_STATE);
    expect(res.text).not.toContain('No media yet');
  });

  it('says the same thing on a named gallery', async () => {
    const res = await request(createApp()).get(`/media/${EMPTY_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(EMPTY_STATE);
    expect(res.text).not.toContain('with this tag');
  });
});

describe('a query the visitor built keeps the query header', () => {
  it('stays a tag query when a topic tag joins the uploader tag', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${UPLOADER_SLUG}&tag=set_header_topic`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Browse Media</h1>');
    expect(res.text).toContain('#set_header_topic');
  });

  it('stays a tag query when the visitor excludes something', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${UPLOADER_SLUG}&exclude=set_header_topic`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Browse Media</h1>');
  });
});
