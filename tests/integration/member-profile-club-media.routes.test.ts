/**
 * M_View_Profile: the public profile shows the member's club affiliations and a
 * Media section that links to the member's named galleries (cards) plus a
 * view-all link, to authenticated viewers; both are withheld from an
 * unauthenticated HoF/BAP visitor. The own profile shows the same Media section.
 * The profile never embeds an inline media thumbnail grid.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertClub,
  insertMemberClubAffiliation,
  insertMediaItem,
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3209');
const TS = '2025-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const OWNER_ID = 'mvp-owner-1';
const OWNER_SLUG = 'mvp_owner_1';
const VIEWER_ID = 'mvp-viewer-1';
const VIEWER_SLUG = 'mvp_viewer_1';
const HOF_ID = 'mvp-hof-1';
const HOF_SLUG = 'mvp_hof_1';

function insertNamedGallery(d: BetterSqlite3.Database, id: string, ownerId: string, name: string): void {
  d.prepare(`
    INSERT INTO member_galleries (id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default, sort_order)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, '', 0, 'upload_desc')
  `).run(id, TS, TS, ownerId, name);
}

function addGalleryCriteria(d: BetterSqlite3.Database, galleryId: string, tagId: string): void {
  d.prepare(`
    INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
    VALUES (?, ?, ?, 'test')
  `).run(galleryId, tagId, TS);
}

function tagMedia(d: BetterSqlite3.Database, mediaId: string, tagId: string, display: string): void {
  d.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run(`mt_${mediaId}`, TS, TS, mediaId, tagId, display);
}

beforeAll(async () => {
  db = createTestDb(dbPath);

  createMemberAtTier(db, { id: OWNER_ID, slug: OWNER_SLUG, tier: 'tier1' });
  completeOnboarding(db, OWNER_ID);
  const ownerClub = insertClub(db, { id: 'mvp-club-1', name: 'Portland Footbag' });
  insertMemberClubAffiliation(db, OWNER_ID, ownerClub);
  const m1 = insertMediaItem(db, { uploader_member_id: OWNER_ID, caption: 'Owner trick shot' });
  const m2 = insertMediaItem(db, { uploader_member_id: OWNER_ID, caption: 'Owner second shot' });

  // A named gallery the owner created, matching both uploads (item count 2).
  const favesTag = insertTag(db, { id: 'tag-owner-faves', tag_normalized: '#owner_faves', tag_display: '#owner_faves' });
  insertNamedGallery(db, 'gallery-owner-faves', OWNER_ID, 'Funky Footbags');
  addGalleryCriteria(db, 'gallery-owner-faves', favesTag);
  tagMedia(db, m1, favesTag, '#owner_faves');
  tagMedia(db, m2, favesTag, '#owner_faves');

  createMemberAtTier(db, { id: VIEWER_ID, slug: VIEWER_SLUG, tier: 'tier1' });
  completeOnboarding(db, VIEWER_ID);

  // HoF member: profile is visitor-visible, so an unauthenticated request gets a
  // 200 and we can assert the club/media gating rather than a login redirect.
  insertMember(db, { id: HOF_ID, slug: HOF_SLUG, is_hof: 1 });
  const hofClub = insertClub(db, { id: 'mvp-club-2', name: 'Seattle Footbag' });
  insertMemberClubAffiliation(db, HOF_ID, hofClub);
  insertMediaItem(db, { uploader_member_id: HOF_ID, caption: 'HoF trick shot' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;

describe('M_View_Profile — club + media on the public profile', () => {
  it('shows the member club affiliation to an authenticated viewer', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Portland Footbag');
    expect(res.text).toContain('href="/clubs/');
  });

  it('shows named-gallery cards and the view-all link, not an inline grid', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    // Gallery card: name, item count, link to the gallery page.
    expect(res.text).toContain('Funky Footbags');
    expect(res.text).toContain('2 items');
    expect(res.text).toContain('href="/media/gallery-owner-faves"');
    // View-all link uses the locked ?context= convention (Handlebars HTML-escapes
    // '=' in the href, so assert parts).
    expect(res.text).toContain('/media/browse?context');
    expect(res.text).toContain(`by_${OWNER_SLUG}`);
    // No inline thumbnail grid: no gallery tiles, no upload captions on the profile.
    expect(res.text).not.toContain('gallery-grid');
    expect(res.text).not.toContain('Owner trick shot');
  });

  it('withholds club and media from an unauthenticated HoF visitor', async () => {
    const res = await request(createApp()).get(`/members/${HOF_SLUG}`);
    expect(res.status).toBe(200); // HoF profile is visitor-visible
    expect(res.text).not.toContain('Seattle Footbag');
    expect(res.text).not.toContain('View all media');
    expect(res.text).not.toContain('gallery-grid');
  });

  it('shows the owner their own Media section on the personal profile', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Funky Footbags');
    expect(res.text).toContain('View All Media');
    expect(res.text).not.toContain('gallery-grid');
  });
});
