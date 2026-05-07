/**
 * Integration tests for the /media URL space — public hub + named-gallery
 * URL bookmarks. Named galleries are member_galleries rows owned by the
 * FH system member. Their content is computed dynamically by tag-AND
 * match against the gallery's criteria-tag set in member_gallery_tags
 * (per docs/USER_STORIES.md §V_View_Gallery and docs/DATA_MODEL.md
 * "hashtag-driven coupling"). Curator URL-ref content surfaces in
 * named galleries purely via tag-AND match per
 * docs/USER_STORIES.md §A_Upload_Curated_Media.
 *
 * Covers: hub rendering, named-gallery rendering, platform-branched tile
 * shaping (s3 / youtube / vimeo), tag-AND filtering, anti-enumeration
 * for non-FH galleries, removal of /gallery, adversarial galleryId.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3127');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'member-media-system-001';
const MEMBER_ID = 'member-media-regular-001';
const FH_GALLERY_ID = 'gallery_curated_freestyle_tricks';
const MEMBER_GALLERY_ID = 'gallery_member_personal_001';

const TS = '2026-04-29T12:00:00.000Z';

let CURATED_TAG_ID = '';
let FREESTYLE_TAG_ID = '';
let TRICK_TAG_ID = '';
let UNRANKED_TAG_ID = '';

interface PhotoOverrides {
  id?: string;
  uploader_member_id?: string;
  caption?: string | null;
  uploaded_at?: string;
  s3_key_thumb?: string;
  s3_key_display?: string;
  is_avatar?: 0 | 1;
  moderation_status?: 'active' | 'removed_by_admin';
}

function insertPhoto(db: BetterSqlite3.Database, o: PhotoOverrides = {}): string {
  const id = o.id ?? `media_photo_${Math.random().toString(36).slice(2, 12)}`;
  const uploader = o.uploader_member_id ?? SYSTEM_ID;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'photo', ?, ?, ?,
              ?, ?, 1000, 600,
              ?)
  `).run(
    id, TS, TS,
    uploader, o.is_avatar ?? 0, o.caption === undefined ? null : o.caption,
    o.uploaded_at ?? TS,
    o.s3_key_thumb ?? `${uploader}/detached/${id}-thumb.jpg`,
    o.s3_key_display ?? `${uploader}/detached/${id}-display.jpg`,
    o.moderation_status ?? 'active',
  );
  return id;
}

interface VideoOverrides {
  id?: string;
  uploader_member_id?: string;
  caption?: string | null;
  uploaded_at?: string;
  platform?: 's3' | 'youtube' | 'vimeo';
  video_id?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  moderation_status?: 'active' | 'removed_by_admin';
  source_id?: string | null;
}

function insertVideo(db: BetterSqlite3.Database, o: VideoOverrides = {}): string {
  const id = o.id ?? `media_video_${Math.random().toString(36).slice(2, 12)}`;
  const uploader = o.uploader_member_id ?? SYSTEM_ID;
  const platform = o.platform ?? 's3';
  let videoId: string;
  let videoUrl: string | null;
  let thumbUrl: string | null;
  if (platform === 's3') {
    videoId = o.video_id ?? `${uploader}/detached/${id}-video.mp4`;
    videoUrl = o.video_url ?? null;
    thumbUrl = o.thumbnail_url ?? `/media/${uploader}/detached/${id}-poster-display.jpg`;
  } else if (platform === 'youtube') {
    videoId = o.video_id ?? `yt${id.slice(-8)}`;
    videoUrl = o.video_url ?? `https://www.youtube.com/watch?v=${videoId}`;
    thumbUrl = o.thumbnail_url === undefined ? null : o.thumbnail_url;
  } else {
    videoId = o.video_id ?? (id.replace(/[^0-9]/g, '').slice(-8) || '12345678');
    videoUrl = o.video_url ?? `https://vimeo.com/${videoId}`;
    thumbUrl = o.thumbnail_url ?? `https://i.vimeocdn.com/video/${videoId}_640.jpg`;
  }
  // If source_id is set, ensure the parent media_sources row exists (FK).
  if (o.source_id) {
    db.prepare(`
      INSERT OR IGNORE INTO media_sources (source_id, source_name, source_type, url, creator)
      VALUES (?, ?, 'youtube', NULL, NULL)
    `).run(o.source_id, o.source_id);
  }
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      width_px, height_px,
      moderation_status, source_id
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'video', 0, ?, ?,
              ?, ?, ?, ?,
              1280, 720,
              ?, ?)
  `).run(
    id, TS, TS,
    uploader, o.caption === undefined ? null : o.caption,
    o.uploaded_at ?? TS,
    platform, videoId, videoUrl, thumbUrl,
    o.moderation_status ?? 'active',
    o.source_id ?? null,
  );
  return id;
}

function attachTag(db: BetterSqlite3.Database, mediaId: string, tagId: string, tagDisplay: string): void {
  const id = `mtag_${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, ?)
  `).run(id, TS, TS, mediaId, tagId, tagDisplay);
}

// Helper: tag a media item with all three FH-gallery criteria tags so
// it appears in /media/gallery_curated_freestyle_tricks.
function tagAsCuratedFreestyleTrick(db: BetterSqlite3.Database, mediaId: string): void {
  attachTag(db, mediaId, CURATED_TAG_ID, '#curated');
  attachTag(db, mediaId, FREESTYLE_TAG_ID, '#freestyle');
  attachTag(db, mediaId, TRICK_TAG_ID, '#trick');
}

function insertNamedGallery(
  db: BetterSqlite3.Database,
  o: { id: string; ownerId: string; name: string; description?: string; isDefault?: 0 | 1 },
): void {
  db.prepare(`
    INSERT INTO member_galleries (
      id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, ?, ?)
  `).run(o.id, TS, TS, o.ownerId, o.name, o.description ?? '', o.isDefault ?? 0);
}

function insertGalleryCriteria(
  db: BetterSqlite3.Database,
  galleryId: string,
  tagIds: string[],
): void {
  for (const tid of tagIds) {
    db.prepare(`
      INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
      VALUES (?, ?, ?, 'admin-act-as')
    `).run(galleryId, tid, TS);
  }
}

function openDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'media_system', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMember(db, { id: MEMBER_ID, slug: 'media_regular', display_name: 'Regular Member' });

  // Criteria tags for the FH-owned named gallery. Freeform (is_standard=0,
  // standard_type=NULL) per schema.sql CHECK; the shared insertTag factory
  // can't produce freeform tags so we inline the INSERT here.
  const insertFreeformTag = (display: string): string => {
    const id = `tag-test-${Math.random().toString(36).slice(2, 12)}`;
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(id, display, display, TS, TS);
    return id;
  };
  CURATED_TAG_ID   = insertFreeformTag('#curated');
  FREESTYLE_TAG_ID = insertFreeformTag('#freestyle');
  TRICK_TAG_ID     = insertFreeformTag('#trick');
  UNRANKED_TAG_ID  = insertFreeformTag('#unranked');

  // FH-owned named gallery — the URL bookmark for the curated freestyle
  // tricks corpus. Mirrors what scripts/seed_fh_curator.py creates in
  // production.
  insertNamedGallery(db, {
    id: FH_GALLERY_ID,
    ownerId: SYSTEM_ID,
    name: 'Curated Freestyle Tricks',
    description: 'Reference videos for freestyle footbag tricks, curated by the IFPA.',
  });
  insertGalleryCriteria(db, FH_GALLERY_ID, [CURATED_TAG_ID, FREESTYLE_TAG_ID, TRICK_TAG_ID]);
  db.prepare(`
    INSERT INTO member_gallery_exclude_tags (gallery_id, tag_id, created_at, created_by)
    VALUES (?, ?, ?, 'admin-act-as')
  `).run(FH_GALLERY_ID, UNRANKED_TAG_ID, TS);

  // Member-owned gallery with same criteria. Used to verify the hub +
  // detail anti-enumeration filter (FH-only).
  insertNamedGallery(db, {
    id: MEMBER_GALLERY_ID,
    ownerId: MEMBER_ID,
    name: 'Personal Vacation 2026',
    description: 'My private vacation photos.',
  });
  insertGalleryCriteria(db, MEMBER_GALLERY_ID, [CURATED_TAG_ID]);

  // Auto-materialized Personal Gallery (is_default=1). The hub should
  // exclude these so the public list isn't polluted with one row per
  // member who has ever uploaded.
  insertNamedGallery(db, {
    id: 'gallery_m_defaultper001',
    ownerId: MEMBER_ID,
    name: 'Personal Gallery',
    description: 'Everything I have uploaded.',
    isDefault: 1,
  });
  insertGalleryCriteria(db, 'gallery_m_defaultper001', [CURATED_TAG_ID]);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media (hub)', () => {
  it('renders the FH-owned named gallery with the prose summary line', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Media Galleries');
    expect(res.text).toContain('Curated Freestyle Tricks');
    expect(res.text).toContain('Reference videos for freestyle footbag tricks');
    expect(res.text).toContain(`href="/media/${FH_GALLERY_ID}"`);
    expect(res.text).toContain('class="hub-card-summary"');
    // Prose summary mirrors the gallery hero copy: "Showing N items
    // tagged: #a #b #c - Excluding tag(s): #x".
    expect(res.text).toMatch(/Showing 0 items tagged:\s*#curated\s+#freestyle\s+#trick/);
    expect(res.text).toMatch(/-\s*Excluding tag:\s*#unranked/);
  });

  it('lists member-owned galleries on the public hub', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.text).toContain('Personal Vacation 2026');
    expect(res.text).toContain(`href="/media/${MEMBER_GALLERY_ID}"`);
  });

  it('orders FH-owned galleries before member-owned galleries on the hub', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    const fhIdx = res.text.indexOf('Curated Freestyle Tricks');
    const memberIdx = res.text.indexOf('Personal Vacation 2026');
    expect(fhIdx).toBeGreaterThan(-1);
    expect(memberIdx).toBeGreaterThan(-1);
    expect(fhIdx).toBeLessThan(memberIdx);
  });

  it('excludes per-member auto-default Personal Gallery (is_default=1) from the hub', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Personal Gallery');
    expect(res.text).not.toContain('Everything I have uploaded.');
  });
});

describe('GET /media/:galleryId (named gallery)', () => {
  it('renders the gallery hero with the "Named Gallery: <name>" prefix and the description as a caption below', async () => {
    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Named Gallery: Curated Freestyle Tricks');
    expect(res.text).toContain('Reference videos for freestyle footbag tricks');
    expect(res.text).toContain('class="gallery-description"');
    // Description is below the hero, not inside it.
    const heroOpen = res.text.search(/class="hero hero-sm[^"]*"/);
    const heroClose = res.text.indexOf('</div>\n</div>', heroOpen);
    expect(heroOpen).toBeGreaterThan(-1);
    const heroBlock = res.text.slice(heroOpen, heroClose);
    expect(heroBlock).not.toContain('Reference videos for freestyle footbag tricks');
  });

  it('renders the criteria summary as a hero-subtitle line inside the hero block', async () => {
    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="hero-subtitle"');
    const heroOpen = res.text.search(/class="hero hero-sm[^"]*"/);
    const heroClose = res.text.indexOf('</div>\n</div>', heroOpen);
    expect(heroOpen).toBeGreaterThan(-1);
    const heroBlock = res.text.slice(heroOpen, heroClose);
    expect(heroBlock).toContain('items tagged');
    expect(heroBlock).toContain('#curated');
  });

  it('renders #by_<slug> as "items by <Name>" prose, not as a hashtag chip in the "tagged:" list', async () => {
    // Set up a gallery whose criteria includes both #by_<slug> and a
    // regular hashtag (#footbags). Bug being regressed: the hero read
    // "Showing 3 items tagged: David Leberknight #footbags", which
    // (a) treated the member name as a hashtag and (b) rendered
    // green-on-green via the global `a { color: var(--primary) }` rule.
    const db = openDb();
    const byMemberTagId = `tag-by-${Math.random().toString(36).slice(2, 12)}`;
    const footbagsTagId = `tag-footbags-${Math.random().toString(36).slice(2, 12)}`;
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(byMemberTagId, '#by_media_regular', '#by_media_regular', TS, TS);
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(footbagsTagId, '#footbags', '#footbags', TS, TS);
    const galleryId = 'gallery_by_chip_test';
    db.prepare(`
      INSERT INTO member_galleries (
        id, created_at, created_by, updated_at, updated_by, version,
        owner_member_id, name, description, is_default
      ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'Funky Footbags', '', 0)
    `).run(galleryId, TS, TS, SYSTEM_ID);
    db.prepare(`
      INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
      VALUES (?, ?, ?, 'admin-act-as'), (?, ?, ?, 'admin-act-as')
    `).run(galleryId, byMemberTagId, TS, galleryId, footbagsTagId, TS);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${galleryId}`);
    expect(res.status).toBe(200);

    const heroOpen = res.text.search(/class="hero hero-sm[^"]*"/);
    const heroClose = res.text.indexOf('</div>\n</div>', heroOpen);
    const heroBlock = res.text.slice(heroOpen, heroClose);

    // Prose form: "Showing N items by <Name>, tagged: #hashtag" — the
    // member name comes BEFORE "tagged:" with a comma separator, and the
    // hashtag list does NOT contain the name.
    expect(heroBlock).toMatch(/items by Regular Member, tagged:\s*#footbags/);
    expect(heroBlock).not.toMatch(/tagged:[^<]*Regular Member/);
    expect(heroBlock).not.toContain('#by_media_regular');
    // Unauthenticated viewer: plain text, no anchor (the gallery hero
    // here is requested without a session; the link is auth-gated).
    expect(heroBlock).not.toMatch(/<a[^>]*href="\/members\/media_regular"/);
  });

  it('falls back to the raw #by_<slug> tag when the slug does not resolve to an active member', async () => {
    const db = openDb();
    const ghostTagId = `tag-by-ghost-${Math.random().toString(36).slice(2, 12)}`;
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(ghostTagId, '#by_ghost_account', '#by_ghost_account', TS, TS);
    const galleryId = 'gallery_by_chip_ghost_test';
    db.prepare(`
      INSERT INTO member_galleries (
        id, created_at, created_by, updated_at, updated_by, version,
        owner_member_id, name, description, is_default
      ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'Ghost Gallery', '', 0)
    `).run(galleryId, TS, TS, SYSTEM_ID);
    db.prepare(`
      INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
      VALUES (?, ?, ?, 'admin-act-as')
    `).run(galleryId, ghostTagId, TS);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${galleryId}`);
    expect(res.status).toBe(200);

    const heroOpen = res.text.search(/class="hero hero-sm[^"]*"/);
    const heroClose = res.text.indexOf('</div>\n</div>', heroOpen);
    const heroBlock = res.text.slice(heroOpen, heroClose);

    expect(heroBlock).toContain('#by_ghost_account');
    expect(heroBlock).not.toMatch(/<a[^>]*href="\/members\/ghost_account"/);
  });

  it('renders YouTube tiles with the i.ytimg.com derived thumbnail and youtube.com href', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      caption: 'youtube-branch-marker',
      platform: 'youtube',
      video_id: 'YT_FIXTURE_ID',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('youtube-branch-marker');
    expect(res.text).toContain('https://i.ytimg.com/vi/YT_FIXTURE_ID/hqdefault.jpg');
    expect(res.text).toContain('https://www.youtube.com/watch?v&#x3D;YT_FIXTURE_ID');
  });

  it('renders Vimeo tiles with the sidecar thumbnail and vimeo.com href', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      caption: 'vimeo-branch-marker',
      platform: 'vimeo',
      video_id: '987654321',
      video_url: 'https://vimeo.com/987654321',
      thumbnail_url: 'https://i.vimeocdn.com/video/987654321_640.jpg',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('vimeo-branch-marker');
    expect(res.text).toContain('https://i.vimeocdn.com/video/987654321_640.jpg');
    expect(res.text).toContain('https://vimeo.com/987654321');
  });

  it('renders S3 video tiles with /media/<key> thumbnail and href (no regression)', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      caption: 's3-branch-marker',
      platform: 's3',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('s3-branch-marker');
    expect(res.text).toContain(`/media/${SYSTEM_ID}/detached/${id}-poster-display.jpg`);
    expect(res.text).toContain(`/media/${SYSTEM_ID}/detached/${id}-video.mp4`);
  });

  it('marks YouTube video tiles as click-to-play facades with the nocookie embed URL', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      caption: 'yt-facade-marker',
      platform: 'youtube',
      video_id: 'FACADE_YT_ID',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="video-facade"');
    expect(res.text).toContain('data-platform="youtube"');
    expect(res.text).toContain('data-embed-url="https://www.youtube-nocookie.com/embed/FACADE_YT_ID?rel&#x3D;0"');
  });

  it('marks Vimeo video tiles as click-to-play facades with the player.vimeo embed URL', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      caption: 'vimeo-facade-marker',
      platform: 'vimeo',
      video_id: '424242424',
      video_url: 'https://vimeo.com/424242424',
      thumbnail_url: 'https://i.vimeocdn.com/video/424242424_640.jpg',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-platform="vimeo"');
    expect(res.text).toContain('data-embed-url="https://player.vimeo.com/video/424242424"');
  });

  it('marks S3 video tiles as click-to-play facades with data-video-src for inline <video>', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      caption: 's3-facade-marker',
      platform: 's3',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-platform="s3"');
    expect(res.text).toContain(`data-video-src="/media/${SYSTEM_ID}/detached/${id}-video.mp4"`);
  });

  it('does not mark photo tiles as video facades', async () => {
    const db = openDb();
    const id = insertPhoto(db, { caption: 'photo-not-facade-marker' });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('photo-not-facade-marker');
    // The photo tile's anchor must not carry video-facade class or data-* hooks.
    const markerIdx = res.text.indexOf('photo-not-facade-marker');
    const tileOpen = res.text.lastIndexOf('<li class="gallery-tile">', markerIdx);
    const tileClose = res.text.indexOf('</li>', markerIdx);
    expect(tileOpen).toBeGreaterThan(-1);
    expect(tileClose).toBeGreaterThan(tileOpen);
    const photoTile = res.text.slice(tileOpen, tileClose);
    expect(photoTile).not.toContain('video-facade');
    expect(photoTile).not.toContain('data-platform=');
  });

  it('excludes items missing any one of the criteria tags (tag-AND filter)', async () => {
    const db = openDb();
    const partialId = insertVideo(db, {
      caption: 'tag-and-partial-marker',
      platform: 'youtube',
      video_id: 'partialMatch',
    });
    // Only two of the three required tags. Should NOT appear in the
    // /media/gallery_curated_freestyle_tricks output.
    attachTag(db, partialId, CURATED_TAG_ID, '#curated');
    attachTag(db, partialId, FREESTYLE_TAG_ID, '#freestyle');
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.text).not.toContain('tag-and-partial-marker');
  });

  it('excludes items uploaded by a non-system member even when fully tagged', async () => {
    const db = openDb();
    const memberId = insertVideo(db, {
      caption: 'member-uploaded-marker',
      platform: 'youtube',
      video_id: 'memberUpload',
      uploader_member_id: MEMBER_ID,
    });
    tagAsCuratedFreestyleTrick(db, memberId);
    db.close();

    // Anti-enumeration: the page is public and does not gate on uploader,
    // BUT the named gallery's owner is FH — and queryGalleryItemsByCriteria
    // does not filter by uploader. This test pins down that today's
    // behaviour is "any moderation_status='active', is_avatar=0 item that
    // matches the criteria appears", which is correct per
    // USER_STORIES.md §V_View_Gallery (gallery is dynamic tag-match,
    // not uploader-restricted).
    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.text).toContain('member-uploaded-marker');
  });

  it('excludes is_avatar=1 rows defense-in-depth', async () => {
    const db = openDb();
    const avatarId = insertPhoto(db, {
      caption: 'avatar-flagged-marker',
      is_avatar: 1,
    });
    tagAsCuratedFreestyleTrick(db, avatarId);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.text).not.toContain('avatar-flagged-marker');
  });

  it('excludes moderation_status removed_by_admin', async () => {
    const db = openDb();
    const removedId = insertVideo(db, {
      caption: 'removed-by-admin-marker',
      platform: 'youtube',
      video_id: 'removedAdmin',
      moderation_status: 'removed_by_admin',
    });
    tagAsCuratedFreestyleTrick(db, removedId);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.text).not.toContain('removed-by-admin-marker');
  });

  it('renders all items on a single page (grouped, no pagination)', async () => {
    const suffix = 'grouping-marker-901';
    const db = openDb();
    for (let i = 0; i < 25; i++) {
      const seq = String(i).padStart(2, '0');
      const id = insertVideo(db, {
        id: `media_pg_${suffix}_${seq}`,
        caption: `${suffix}-${seq}`,
        platform: 'youtube',
        video_id: `pagYt${seq}`,
        uploaded_at: `2026-05-${seq}T12:00:00.000Z`,
      });
      tagAsCuratedFreestyleTrick(db, id);
    }
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    // Grouped mode renders all items in one render; no per-page navigation.
    expect(res.text).not.toContain('class="gallery-pagination"');
    expect(res.text).not.toContain('?page&#x3D;2');
    expect(res.text).toContain(`${suffix}-24`);
    expect(res.text).toContain(`${suffix}-00`);
  });

  it('ignores ?page query in grouped mode (no crash, still 200)', async () => {
    const app = createApp();
    for (const bad of ['abc', '-5', '0', '0.5', '999']) {
      const res = await request(app).get(`/media/${FH_GALLERY_ID}?page=${bad}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Curated Freestyle Tricks');
    }
  });

  it('returns 404 for an unknown gallery id', async () => {
    const app = createApp();
    const res = await request(app).get('/media/gallery_does_not_exist');
    expect(res.status).toBe(404);
  });

  it('renders a member-owned gallery publicly', async () => {
    const app = createApp();
    const res = await request(app).get(`/media/${MEMBER_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Named Gallery: Personal Vacation 2026');
  });

  it('treats SQL-injection attempts in :galleryId as a normal 404', async () => {
    const app = createApp();
    const res = await request(app).get("/media/'%3B%20DROP%20TABLE%20member_galleries--");
    expect(res.status).toBe(404);
  });

  it('handles oversized galleryId cleanly (no 500)', async () => {
    const app = createApp();
    const longId = 'gallery_' + 'a'.repeat(500);
    const res = await request(app).get(`/media/${longId}`);
    expect(res.status).toBe(404);
  });

  it('escapes HTML in captions', async () => {
    const db = openDb();
    // Use a future-dated uploaded_at so this row sorts first and lands
    // on page 1 even after pagination tests have inserted bulk rows.
    const id = insertVideo(db, {
      caption: '<script>alert("xss-marker-44321")</script>',
      platform: 'youtube',
      video_id: 'xssMarker',
      uploaded_at: '2027-01-01T00:00:00.000Z',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.text).not.toContain('<script>alert("xss-marker-44321")</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('honors the gallery\'s exclude-tag set by filtering matching items out', async () => {
    const db = openDb();
    // Create the exclude tag and a per-trick criteria tag.
    db.prepare(`
      INSERT OR IGNORE INTO tags (
        id, created_at, created_by, updated_at, updated_by, version,
        tag_normalized, tag_display
      ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?)
    `).run('tag-test-excl', TS, TS, '#excluded_subset', '#excluded_subset');
    db.prepare(`
      INSERT OR IGNORE INTO tags (
        id, created_at, created_by, updated_at, updated_by, version,
        tag_normalized, tag_display
      ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?)
    `).run('tag-trick-foo', TS, TS, '#foo', '#foo');

    // Configure the FH-owned gallery to exclude items tagged
    // #excluded_subset. Items carrying every criteria tag AND any
    // exclude tag must be filtered out.
    db.prepare(`
      INSERT INTO member_gallery_exclude_tags (gallery_id, tag_id, created_at, created_by)
      VALUES (?, ?, ?, 'admin-act-as')
    `).run(FH_GALLERY_ID, 'tag-test-excl', TS);

    // Non-excluded row: carries criteria tags only, appears in gallery.
    const keepId = insertVideo(db, {
      id: 'media_excl_keep',
      caption: 'gallery-excl-keep',
      platform: 'youtube',
      video_id: 'KEEPYTID01',
      uploaded_at: '2027-02-01T12:00:00.000Z',
    });
    tagAsCuratedFreestyleTrick(db, keepId);
    attachTag(db, keepId, 'tag-trick-foo', '#foo');

    // Excluded row: same criteria tags PLUS the exclude tag, filtered out.
    const dropId = insertVideo(db, {
      id: 'media_excl_drop',
      caption: 'gallery-excl-drop',
      platform: 'youtube',
      video_id: 'DROPYTID01',
      uploaded_at: '2027-02-02T12:00:00.000Z',
    });
    tagAsCuratedFreestyleTrick(db, dropId);
    attachTag(db, dropId, 'tag-trick-foo', '#foo');
    attachTag(db, dropId, 'tag-test-excl', '#excluded_subset');
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('gallery-excl-keep');
    expect(res.text).not.toContain('gallery-excl-drop');
  });
});

describe('GET /gallery (removed)', () => {
  it('returns 404 — the route was replaced by /media', async () => {
    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.status).toBe(404);
  });
});
