/**
 * Member-uploaded media behaves as ordinary community media across every media
 * surface. A member's uploads carry the #by_<slug> uploader tag and never
 * #curated; they are discoverable through browse, a named gallery, the
 * gallery/standalone item pages, the member-galleries list, the auto Personal
 * Gallery, and trick reference, with one consistent gallery UX.
 *
 * The #by_<slug> tag lifts to a linked member display name for an authenticated
 * viewer and to an unlinked name for an anonymous one, and it links to the
 * member's media gallery, never to the profile. The member's avatar is excluded
 * from every gallery/browse query.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMediaItem,
  insertFreestyleTrick,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3211');
const TS = '2025-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'media-member-1';
const MEMBER_SLUG = 'media_uploader';
const MEMBER_NAME = 'Media Uploader';
const VIEWER_ID = 'mm-viewer-1';
const CURATOR_ID = 'mm-curator-1';
const FUNKY_GALLERY_ID = 'mm-gallery-highlights';
const PERSONAL_GALLERY_ID = 'mm-gallery-personal';
const TRICK_SLUG = 'around-the-world';

// Item ids so the route tests can address specific gallery/standalone items.
const P1 = 'mm-photo-1';
const V2 = 'mm-video-trick';

const tagIds = new Map<string, string>();

function ensureTag(db: BetterSqlite3.Database, display: string): string {
  const normalized = display.toLowerCase();
  const existing = tagIds.get(normalized);
  if (existing) return existing;
  const id = `tag-${normalized.replace(/[^a-z0-9]/g, '_')}`;
  db.prepare(`
    INSERT INTO tags (id, created_at, created_by, updated_at, updated_by, version, tag_normalized, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?)
  `).run(id, TS, TS, normalized, display);
  tagIds.set(normalized, id);
  return id;
}

function tagMedia(db: BetterSqlite3.Database, mediaId: string, ...displays: string[]): void {
  for (const display of displays) {
    const tagId = ensureTag(db, display);
    db.prepare(`
      INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
      VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
    `).run(`mt-${mediaId}-${tagId}`, TS, TS, mediaId, tagId, display);
  }
}

function insertYouTube(
  db: BetterSqlite3.Database,
  o: { id: string; uploader_member_id: string; caption: string; videoId: string },
): string {
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url, moderation_status
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, 'video', 0, ?, ?, 'youtube', ?, ?, NULL, 'active')
  `).run(
    o.id, TS, TS, o.uploader_member_id, o.caption, TS,
    o.videoId, `https://www.youtube.com/watch?v=${o.videoId}`,
  );
  return o.id;
}

function insertGallery(
  db: BetterSqlite3.Database,
  o: { id: string; ownerId: string; name: string; isDefault: 0 | 1; criteria: string[] },
): void {
  db.prepare(`
    INSERT INTO member_galleries (id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default, sort_order)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, '', ?, 'upload_desc')
  `).run(o.id, TS, TS, o.ownerId, o.name, o.isDefault);
  for (const display of o.criteria) {
    const tagId = ensureTag(db, display);
    db.prepare(`
      INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
      VALUES (?, ?, ?, 'test')
    `).run(o.id, tagId, TS);
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A real-shaped member with an ordinary id (not the seeded-persona prefix) and
  // a display name, so the #by_ tag resolves to a linked name.
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: MEMBER_NAME });
  // An authenticated viewer for the auth-gating assertions.
  insertMember(db, { id: VIEWER_ID, slug: 'mm_viewer' });
  // The curator uploader for the #curated items (system member, null
  // credentials), mirroring the Footbag Hacky curator account.
  insertMember(db, { id: CURATOR_ID, slug: 'footbag_hacky', is_system: 1 });

  const BY = `#by_${MEMBER_SLUG}`;

  // The avatar: one tag, excluded from every gallery/browse query.
  insertMediaItem(db, { id: 'mm-avatar', uploader_member_id: MEMBER_ID, is_avatar: 1, caption: null });
  tagMedia(db, 'mm-avatar', BY);

  // Three #footbags photos (the named gallery's topic).
  insertMediaItem(db, { id: P1, uploader_member_id: MEMBER_ID, caption: '182 panel footbags' });
  tagMedia(db, P1, BY, '#footbags');
  insertMediaItem(db, { id: 'mm-photo-2', uploader_member_id: MEMBER_ID, caption: 'More footbags' });
  tagMedia(db, 'mm-photo-2', BY, '#footbags');
  insertMediaItem(db, { id: 'mm-photo-3', uploader_member_id: MEMBER_ID, caption: 'Even more footbags' });
  tagMedia(db, 'mm-photo-3', BY, '#footbags');

  // A #chinlone photo + video (topic shared with the curator content below).
  insertMediaItem(db, { id: 'mm-photo-4', uploader_member_id: MEMBER_ID, caption: 'Chinlone hack' });
  tagMedia(db, 'mm-photo-4', BY, '#chinlone', '#club_downtown');
  insertYouTube(db, { id: 'mm-video-chinlone', uploader_member_id: MEMBER_ID, caption: 'Downtown hack crew', videoId: 'ytchinlone01' });
  tagMedia(db, 'mm-video-chinlone', BY, '#chinlone', '#club_downtown');

  // A trick-tagged clip: appears on the trick reference surface as a member clip.
  insertYouTube(db, { id: V2, uploader_member_id: MEMBER_ID, caption: 'Around the world line', videoId: 'yttrick0001' });
  tagMedia(db, V2, BY, `#${TRICK_SLUG}`, '#freestyle', '#trick');

  // Curator (#curated) chinlone content, so the chinlone set is large enough to
  // filter and carries curator content for the pinned "Curated" opt-in.
  for (const n of [1, 2, 3]) {
    const id = `mm-curated-chinlone-${n}`;
    insertMediaItem(db, { id, uploader_member_id: CURATOR_ID, caption: `FH chinlone ${n}` });
    tagMedia(db, id, '#chinlone', '#curated');
  }

  insertGallery(db, {
    id: FUNKY_GALLERY_ID, ownerId: MEMBER_ID, name: 'Footbag Highlights', isDefault: 0,
    criteria: ['#footbags', BY],
  });
  insertGallery(db, {
    id: PERSONAL_GALLERY_ID, ownerId: MEMBER_ID, name: 'Personal Gallery', isDefault: 1,
    criteria: [BY],
  });

  insertFreestyleTrick(db, { slug: TRICK_SLUG, canonical_name: 'Around the World', is_active: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;
const PROFILE_HREF = `href="/members/${MEMBER_SLUG}"`;

describe('member-uploaded media surfaces', () => {
  it('browse default surfaces the photos and video as community content', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${MEMBER_SLUG}`);
    expect(res.status).toBe(200);
    // Six non-avatar uploads carry #by_; the avatar is excluded from the count.
    expect(res.text).toContain('Showing 6 ');
    expect(res.text).toContain('182 panel footbags');
    expect(res.text).toContain('Around the world line');
  });

  it('the avatar is excluded from the browse/gallery query', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${MEMBER_SLUG}`);
    expect(res.text).not.toContain('Showing 7 ');
  });

  it('the named gallery renders only its matching media', async () => {
    const res = await request(createApp()).get(`/media/${FUNKY_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Named Gallery: Footbag Highlights');
    // Only the three #footbags photos satisfy the #footbags AND #by_ criteria.
    expect(res.text).toContain('Showing 3 ');
    expect(res.text).toContain('182 panel footbags');
    expect(res.text).not.toContain('Chinlone hack');
  });

  it('the Personal Gallery is reachable by URL', async () => {
    const res = await request(createApp()).get(`/media/${PERSONAL_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Named Gallery: Personal Gallery');
    expect(res.text).toContain('182 panel footbags');
  });

  it('the member-galleries list shows the named gallery but excludes the Personal Gallery', async () => {
    const res = await request(createApp()).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Footbag Highlights');
    expect(res.text).toContain(`href="/media/${FUNKY_GALLERY_ID}"`);
    expect(res.text).not.toContain(`href="/media/${PERSONAL_GALLERY_ID}"`);
  });

  it('a gallery item shows the in-gallery pager and the uploader', async () => {
    const res = await request(createApp()).get(`/media/${FUNKY_GALLERY_ID}/${P1}`);
    expect(res.status).toBe(200);
    // A 3-item gallery shows prev and/or next neighbors.
    expect(res.text).toMatch(/rel="(prev|next)"/);
    expect(res.text).toContain(MEMBER_NAME);
  });

  it('a standalone item with no context hides the pager and never dead-ends', async () => {
    const res = await request(createApp()).get(`/media/item/${P1}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/rel="(prev|next)"/);
    // A back link is always present so the page never dead-ends.
    expect(res.text).toContain('class="btn btn-outline"');
  });

  it('trick reference links to the trick gallery and shows the member clip', async () => {
    const trickPage = await request(createApp()).get(`/freestyle/tricks/${TRICK_SLUG}`);
    expect(trickPage.status).toBe(200);
    expect(trickPage.text).toContain('See All Videos for');
    // Handlebars HTML-escapes '=' in the href to '&#x3D;'. The trick slug rides
    // as a locked ?context= token (matching club/event/member gallery links).
    expect(trickPage.text).toContain(`/media/browse?context&#x3D;${TRICK_SLUG}`);

    const gallery = await request(createApp()).get(`/media/browse?context=${TRICK_SLUG}`);
    expect(gallery.status).toBe(200);
    expect(gallery.text).toContain('Around the world line');
  });

  it('offers the curator opt-in on a mixed topic set', async () => {
    const res = await request(createApp()).get('/media/browse?tag=chinlone');
    expect(res.status).toBe(200);
    // Two community + three curated chinlone items make the set filterable, so
    // the pinned "Curated" opt-in suggestion appears (its include href adds
    // #curated; Handlebars escapes '=' to '&#x3D;').
    expect(res.text).toContain('tag-filter-bar');
    expect(res.text).toContain('tag&#x3D;curated');
  });
});

describe('#by_ uploader-tag links to the member gallery (not the profile)', () => {
  const GALLERY_HREF = `href="/media/browse?tag&#x3D;by_${MEMBER_SLUG}"`;

  it('an authenticated viewer sees the name linked to the member gallery, not the profile', async () => {
    const res = await request(createApp())
      .get(`/media/browse?tag=by_${MEMBER_SLUG}`)
      .set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(MEMBER_NAME);
    expect(res.text).toContain(GALLERY_HREF);
    expect(res.text).not.toContain(PROFILE_HREF);
  });

  it('an anonymous viewer gets the same member-gallery link (member galleries are public)', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${MEMBER_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(MEMBER_NAME);
    expect(res.text).toContain(GALLERY_HREF);
    expect(res.text).not.toContain(PROFILE_HREF);
  });
});
