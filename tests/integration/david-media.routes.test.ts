/**
 * Member-uploaded media (the switch-built David Leberknight persona) behaves as
 * ordinary community media across every media surface. His uploads carry the
 * #by_<slug> uploader tag and never #curated; they are discoverable through
 * browse, his named "Funky Footbags" gallery, the gallery/standalone item
 * pages, the member-galleries list, the auto Personal Gallery, and trick
 * reference, with one consistent gallery UX.
 *
 * The #by_<slug> tag lifts to a linked member display name for an authenticated
 * viewer and to an unlinked name for an anonymous one. His avatar is excluded
 * from every gallery/browse query. His rows carry no curator marker and no
 * seeded-persona id prefix, so nothing at the data level distinguishes them from
 * a genuine member upload: the only guard keeping them out of a production
 * dataset is the cutover teardown, which finds them by slug and uploader tag.
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
import { isSeededTestPersonaMemberId } from '../../src/lib/personaGuards';

const { dbPath } = setTestEnv('3211');
const TS = '2025-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

const DAVID_ID = 'dl-member-1';
const DAVID_SLUG = 'david_leberknight';
const VIEWER_ID = 'dl-viewer-1';
const CURATOR_ID = 'dl-curator-1';
const FUNKY_GALLERY_ID = 'dl-gallery-funky';
const PERSONAL_GALLERY_ID = 'dl-gallery-personal';
const TRICK_SLUG = 'around-the-world';

// Item ids so the route tests can address specific gallery/standalone items.
const P1 = 'dl-photo-1';
const V2 = 'dl-video-trick';

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

  // David: a real-shaped member with an ordinary id (not the seeded-persona
  // prefix) and a display name, so the #by_ tag resolves to a linked name.
  insertMember(db, { id: DAVID_ID, slug: DAVID_SLUG, display_name: 'David Leberknight' });
  // An authenticated viewer for the auth-gating assertions.
  insertMember(db, { id: VIEWER_ID, slug: 'dl_viewer' });
  // The curator uploader for the #curated chinlone items (system member,
  // null credentials), mirroring the Footbag Hacky curator account.
  insertMember(db, { id: CURATOR_ID, slug: 'footbag_hacky', is_system: 1 });

  const BY = `#by_${DAVID_SLUG}`;

  // David's avatar: one tag, excluded from every gallery/browse query.
  insertMediaItem(db, { id: 'dl-avatar', uploader_member_id: DAVID_ID, is_avatar: 1, caption: null });
  tagMedia(db, 'dl-avatar', BY);

  // Three #footbags photos (the Funky Footbags gallery's topic).
  insertMediaItem(db, { id: P1, uploader_member_id: DAVID_ID, caption: '182 panel footbags' });
  tagMedia(db, P1, BY, '#footbags');
  insertMediaItem(db, { id: 'dl-photo-2', uploader_member_id: DAVID_ID, caption: 'More footbags' });
  tagMedia(db, 'dl-photo-2', BY, '#footbags');
  insertMediaItem(db, { id: 'dl-photo-3', uploader_member_id: DAVID_ID, caption: 'Even more footbags' });
  tagMedia(db, 'dl-photo-3', BY, '#footbags');

  // A #chinlone photo + video (topic shared with the curator content below).
  insertMediaItem(db, { id: 'dl-photo-4', uploader_member_id: DAVID_ID, caption: 'Chinlone hack' });
  tagMedia(db, 'dl-photo-4', BY, '#chinlone', '#club_wellington');
  insertYouTube(db, { id: 'dl-video-chinlone', uploader_member_id: DAVID_ID, caption: 'Wellington Hack Crew', videoId: 'h17Z102sJNc' });
  tagMedia(db, 'dl-video-chinlone', BY, '#chinlone', '#club_wellington');

  // A trick-tagged clip: appears on the trick reference surface as a member clip.
  insertYouTube(db, { id: V2, uploader_member_id: DAVID_ID, caption: 'Around the world line', videoId: 'aTwTheWorld' });
  tagMedia(db, V2, BY, `#${TRICK_SLUG}`, '#freestyle', '#trick');

  // Curator (#curated) chinlone content, so the chinlone set is large enough to
  // filter and carries curator content for the pinned "Curated" opt-in.
  for (const n of [1, 2, 3]) {
    const id = `dl-curated-chinlone-${n}`;
    insertMediaItem(db, { id, uploader_member_id: CURATOR_ID, caption: `FH chinlone ${n}` });
    tagMedia(db, id, '#chinlone', '#curated');
  }

  insertGallery(db, {
    id: FUNKY_GALLERY_ID, ownerId: DAVID_ID, name: 'Funky Footbags', isDefault: 0,
    criteria: ['#footbags', BY],
  });
  insertGallery(db, {
    id: PERSONAL_GALLERY_ID, ownerId: DAVID_ID, name: 'Personal Gallery', isDefault: 1,
    criteria: [BY],
  });

  insertFreestyleTrick(db, { slug: TRICK_SLUG, canonical_name: 'Around the World', is_active: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;
const PROFILE_HREF = `href="/members/${DAVID_SLUG}"`;

describe('member-uploaded media surfaces', () => {
  it('browse default surfaces his photos and video as community content', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${DAVID_SLUG}`);
    expect(res.status).toBe(200);
    // Six non-avatar uploads carry #by_; the avatar is excluded from the count.
    expect(res.text).toContain('Showing 6 ');
    expect(res.text).toContain('182 panel footbags');
    expect(res.text).toContain('Around the world line');
  });

  it('the avatar is excluded from the browse/gallery query', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${DAVID_SLUG}`);
    expect(res.text).not.toContain('Showing 7 ');
  });

  it('the Funky Footbags named gallery renders only its matching media', async () => {
    const res = await request(createApp()).get(`/media/${FUNKY_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Named Gallery: Funky Footbags');
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

  it('the member-galleries list shows Funky Footbags but excludes the Personal Gallery', async () => {
    const res = await request(createApp()).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Funky Footbags');
    expect(res.text).toContain(`href="/media/${FUNKY_GALLERY_ID}"`);
    expect(res.text).not.toContain(`href="/media/${PERSONAL_GALLERY_ID}"`);
  });

  it('a gallery item shows the in-gallery pager and the uploader', async () => {
    const res = await request(createApp()).get(`/media/${FUNKY_GALLERY_ID}/${P1}`);
    expect(res.status).toBe(200);
    // A 3-item gallery shows prev and/or next neighbors.
    expect(res.text).toMatch(/rel="(prev|next)"/);
    expect(res.text).toContain('David Leberknight');
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
  const GALLERY_HREF = `href="/media/browse?tag&#x3D;by_${DAVID_SLUG}"`;

  it('an authenticated viewer sees the name linked to the member gallery, not the profile', async () => {
    const res = await request(createApp())
      .get(`/media/browse?tag=by_${DAVID_SLUG}`)
      .set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('David Leberknight');
    expect(res.text).toContain(GALLERY_HREF);
    expect(res.text).not.toContain(PROFILE_HREF);
  });

  it('an anonymous viewer gets the same member-gallery link (member galleries are public)', async () => {
    const res = await request(createApp()).get(`/media/browse?tag=by_${DAVID_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('David Leberknight');
    expect(res.text).toContain(GALLERY_HREF);
    expect(res.text).not.toContain(PROFILE_HREF);
  });
});

describe('production-exclusion data invariants', () => {
  it('his member id carries no seeded-persona marker', () => {
    expect(isSeededTestPersonaMemberId(DAVID_ID)).toBe(false);
  });

  it('none of his media carries the curator marker', () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS n
          FROM media_items mi
          JOIN media_tags mt ON mt.media_id = mi.id
          JOIN tags t ON t.id = mt.tag_id
         WHERE mi.uploader_member_id = ? AND t.tag_normalized = '#curated'
      `).get(DAVID_ID) as { n: number };
      expect(row.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('his rows are findable only by slug/uploader tag, not by any data marker', () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      // No marker column flags his data: the teardown must target him by slug.
      const byPrefix = db.prepare(
        `SELECT COUNT(*) AS n FROM members WHERE id LIKE 'member_persona_%'`,
      ).get() as { n: number };
      expect(byPrefix.n).toBe(0);
      const bySlug = db.prepare(
        `SELECT COUNT(*) AS n FROM members WHERE slug = ?`,
      ).get(DAVID_SLUG) as { n: number };
      expect(bySlug.n).toBe(1);
      const byTag = db.prepare(
        `SELECT COUNT(*) AS n FROM tags WHERE tag_normalized = ?`,
      ).get(`#by_${DAVID_SLUG}`) as { n: number };
      expect(byTag.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
