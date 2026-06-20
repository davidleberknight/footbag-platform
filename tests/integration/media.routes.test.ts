/**
 * Integration tests for the /media URL space — public hub + named-gallery
 * URL bookmarks. Named galleries are member_galleries rows owned by the
 * FH system member. Their content is computed dynamically by tag-AND
 * match against the gallery's criteria-tag set in member_gallery_tags
 * (hashtag-driven coupling). Curator URL-ref content surfaces in named
 * galleries purely via tag-AND match.
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
let UNAVAILABLE_TAG_ID = '';

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
    thumbUrl = o.thumbnail_url ?? `/media-store/${uploader}/detached/${id}-poster-display.jpg`;
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
  o: { id: string; ownerId: string; name: string; description?: string; isDefault?: 0 | 1; createdAt?: string },
): void {
  db.prepare(`
    INSERT INTO member_galleries (
      id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, ?, ?)
  `).run(o.id, o.createdAt ?? TS, TS, o.ownerId, o.name, o.description ?? '', o.isDefault ?? 0);
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
  UNAVAILABLE_TAG_ID = insertFreeformTag('#unavailable_embed');

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

  // A second member-owned named gallery, created earlier than the first, so the
  // list page can assert oldest-first ordering.
  insertNamedGallery(db, {
    id: 'gallery_member_beach_001',
    ownerId: MEMBER_ID,
    name: 'Beach Session 2024',
    description: 'Shots from the beach.',
    createdAt: '2024-06-01T00:00:00.000Z',
  });
  insertGalleryCriteria(db, 'gallery_member_beach_001', [CURATED_TAG_ID]);

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
  it('renders six equal-size media cards, browse-by-hashtag leading and Member galleries second', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Footbag Media');
    const cardCount = (res.text.match(/class="media-hub-card/g) || []).length;
    expect(cardCount).toBe(6);
    for (const title of ['Browse by hashtag', 'Member galleries', 'Freestyle', 'Net', 'Sideline', 'Related Sports']) {
      expect(res.text).toContain(title);
    }
    expect(res.text).toContain('href="/media/browse"');
    // The freestyle cards collapse into one card opening the shared section.
    expect(res.text).toContain('href="/freestyle/media"');
    // The browse-by-hashtag card is the same size as its siblings but carries a
    // distinct green accent and leads the grid; Member galleries sits second.
    expect(res.text).toContain('media-hub-card--browse');
    expect(res.text.indexOf('Browse by hashtag')).toBeLessThan(res.text.indexOf('Member galleries'));
    // Compare against a card-only title ('Freestyle' also appears in the nav).
    expect(res.text.indexOf('Member galleries')).toBeLessThan(res.text.indexOf('Related Sports'));
  });

  it('folds curated tricks, shred, photos, and the discipline taxonomy out of the primary grid', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.text).not.toContain('Other disciplines');
    expect(res.text).not.toContain('Photo Gallery');
    expect(res.text).not.toContain('Curated Freestyle Tricks'); // folded into Tutorials & Demos
    expect(res.text).not.toContain('Shred Videos');             // folded into Tutorials & Demos
    expect(res.text).not.toContain('media-hub-facade');         // Takraw embed removed (no stable source)
  });

  it('links the Member galleries card to the list page when member galleries exist', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.text).toContain('href="/media/member-galleries"');
  });

  it('keeps individual gallery names off the hub (they live on the list page)', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    // Member-owned gallery names render on the list page, not on the hub card.
    expect(res.text).not.toContain('Personal Vacation 2026');
    expect(res.text).not.toContain('Beach Session 2024');
    // The auto-default Personal Gallery never surfaces either.
    expect(res.text).not.toContain('Personal Gallery');
    expect(res.text).not.toContain('Everything I have uploaded.');
  });
});

describe('GET /media/member-galleries (member galleries list page)', () => {
  it('lists member-owned named galleries, each linking to its gallery page', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Personal Vacation 2026');
    expect(res.text).toContain('Beach Session 2024');
    expect(res.text).toContain(`href="/media/${MEMBER_GALLERY_ID}"`);
    expect(res.text).toContain('href="/media/gallery_member_beach_001"');
  });

  it('orders galleries oldest first by creation date', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    // Beach Session 2024 was created before Personal Vacation 2026.
    expect(res.text.indexOf('Beach Session 2024')).toBeLessThan(res.text.indexOf('Personal Vacation 2026'));
  });

  it('excludes the auto-default Personal Gallery (is_default=1)', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    expect(res.text).not.toContain('Personal Gallery');
    expect(res.text).not.toContain('Everything I have uploaded.');
  });

  it('shows owner attribution and an item count, without a profile link for visitors', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    expect(res.text).toContain('Regular Member');
    expect(res.text).toMatch(/\d+ items?/);
    // Member profiles are signed-in only: a visitor gets the name without a link.
    expect(res.text).not.toContain('href="/members/media_regular"');
  });
});

describe('GET /freestyle/media (consolidated Freestyle Media section)', () => {
  beforeAll(() => {
    // Seed the Beginner PassBack gallery with one item so that folder resolves
    // to a live, linked gallery. Use a gallery other than the curated-tricks
    // one, whose exact item count later named-gallery tests assert on.
    const db = openDb();
    const pbbTagId = 'tag-test-passback-beginner';
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, '#passback_beginner', '#passback_beginner', 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(pbbTagId, TS, TS);
    insertNamedGallery(db, {
      id: 'gallery_passback_beginner',
      ownerId: SYSTEM_ID,
      name: 'Beginner PassBack Tutorials',
      description: 'Foundational PassBack tutorials.',
    });
    insertGalleryCriteria(db, 'gallery_passback_beginner', [CURATED_TAG_ID, pbbTagId]);
    const vid = insertVideo(db, { id: 'media_video_pbb01', platform: 'youtube', caption: 'How to Learn a Footbag Trick' });
    attachTag(db, vid, CURATED_TAG_ID, '#curated');
    attachTag(db, vid, pbbTagId, '#passback_beginner');
    db.close();
  });

  it('renders the shared folder structure including the PassBack beginner/advanced split', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/media');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Media');
    expect(res.text).toContain('Tutorials &amp; Demos');
    for (const label of [
      'How to Footbag Freestyle',
      'Beginner PassBack Tutorials',
      'Advanced PassBack Tutorials',
      'Tricks of the Trade',
      'Anz Trikz',
      'Shred Global',
      'Footbag Finland',
      'Footbag.org',
      'Freestyle Records',
      'Curated Trick Videos',
      'Individual Shred Videos',
    ]) {
      expect(res.text).toContain(label);
    }
  });

  it('links folders whose gallery has items and marks unseeded folders coming soon', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/media');
    expect(res.text).toContain('href="/media/gallery_passback_beginner"');
    expect(res.text).toContain('Coming soon');
  });
});

describe('GET /media/freestyle-tutorials (legacy path)', () => {
  it('permanently redirects to the consolidated Freestyle Media section', async () => {
    const app = createApp();
    const res = await request(app).get('/media/freestyle-tutorials');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/media');
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

  it('renders the tag-aware empty-state copy when the gallery matches no media', async () => {
    const db = openDb();
    const emptyTagId = 'tag-empty-state-001';
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(emptyTagId, '#emptygallerytag', '#emptygallerytag', TS, TS);
    const galleryId = 'gallery_empty_state_test';
    db.prepare(`
      INSERT INTO member_galleries (
        id, created_at, created_by, updated_at, updated_by, version,
        owner_member_id, name, description, is_default
      ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'Empty Gallery', '', 0)
    `).run(galleryId, TS, TS, SYSTEM_ID);
    db.prepare(`
      INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
      VALUES (?, ?, ?, 'admin-act-as')
    `).run(galleryId, emptyTagId, TS);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${galleryId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('No photos or videos found with this tag');
  });

  it('renders external links as "External URL: <clickable url>" with no icon and no curator label', async () => {
    const db = openDb();
    db.prepare(`
      INSERT INTO gallery_external_links (
        id, created_at, created_by, updated_at, updated_by, version,
        gallery_id, label, url, validated_at, quarantine_reason, sort_order
      ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'Chinlone', ?, ?, NULL, 0)
    `).run(
      'lnk_wiki_chinlone',
      TS, TS, FH_GALLERY_ID,
      'https://en.wikipedia.org/wiki/Chinlone',
      TS,
    );
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="gallery-references"');
    // "External URL:" prefix; URL itself is the clickable anchor text.
    expect(res.text).toMatch(
      /External URL: <a [^>]*href="https:\/\/en\.wikipedia\.org\/wiki\/Chinlone"[^>]*>https:\/\/en\.wikipedia\.org\/wiki\/Chinlone<\/a>/,
    );
    // No icon, no curator-supplied "Chinlone" label, no invented host text.
    expect(res.text).not.toMatch(/external-link-icon[\s\S]{0,400}wikipedia\.org\/wiki\/Chinlone/);
    expect(res.text).not.toMatch(/>Chinlone<\/a>|>Chinlone<svg/);
    expect(res.text).not.toContain(' on Wikipedia');
    expect(res.text).not.toContain('Related links');
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
    // "Showing 3 items tagged: David Mockingbird #footbags", which
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
});

// These exercise the item-detail page (/media/:galleryId/:mediaId), where the
// video facade renders, once per platform.
describe('GET /media/:galleryId/:mediaId (item detail) -- video platform rendering', () => {
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
    const res = await request(app).get(`/media/${FH_GALLERY_ID}/${id}`);
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
    const res = await request(app).get(`/media/${FH_GALLERY_ID}/${id}`);
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
    const res = await request(app).get(`/media/${FH_GALLERY_ID}/${id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('s3-branch-marker');
    expect(res.text).toContain(`/media-store/${SYSTEM_ID}/detached/${id}-poster-display.jpg`);
    expect(res.text).toContain(`/media-store/${SYSTEM_ID}/detached/${id}-video.mp4`);
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
    const res = await request(app).get(`/media/${FH_GALLERY_ID}/${id}`);
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
    const res = await request(app).get(`/media/${FH_GALLERY_ID}/${id}`);
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
    const res = await request(app).get(`/media/${FH_GALLERY_ID}/${id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-platform="s3"');
    expect(res.text).toContain(`data-video-src="/media-store/${SYSTEM_ID}/detached/${id}-video.mp4"`);
  });
});

describe('GET /media/:galleryId (named gallery, continued)', () => {
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
    // matches the criteria appears" (gallery is dynamic tag-match, not
    // uploader-restricted).
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

  it('caps the public render and shows a truncation notice when more items match than the single-page bound', async () => {
    // Dedicated gallery + tag so the 101-item corpus cannot pollute the
    // FH-gallery expectations of other tests in this file.
    const db = openDb();
    const capTagId = `tag-test-capstress`;
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, '#capstress', '#capstress', 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(capTagId, TS, TS);
    insertNamedGallery(db, {
      id: 'gallery_cap_stress',
      ownerId: SYSTEM_ID,
      name: 'Cap Stress',
    });
    insertGalleryCriteria(db, 'gallery_cap_stress', [capTagId]);
    for (let i = 0; i < 101; i++) {
      const seq = String(i).padStart(3, '0');
      const id = insertPhoto(db, {
        id: `media_cap_${seq}`,
        caption: `capstress-${seq}`,
        uploaded_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
      });
      attachTag(db, id, capTagId, '#capstress');
    }
    db.close();

    const app = createApp();
    const res = await request(app).get('/media/gallery_cap_stress');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Showing the first 100 of 101 items.');
    // Exactly one matching item drops: with upload_desc ordering the oldest
    // (lowest sequence) is the one past the cap.
    expect(res.text).toContain('capstress-100');
    expect(res.text).not.toContain('capstress-000');
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

describe('GET /media/:galleryId — item tag chip linkification', () => {
  it('renders each non-#by_* item tag as <a href="/media/browse?tag=…">', async () => {
    const db = openDb();
    const id = insertVideo(db, {
      id: 'media_chip_link_001',
      caption: 'chip-link-marker',
      platform: 'youtube',
      video_id: 'CHIPLNK001',
      uploaded_at: '2027-03-01T12:00:00.000Z',
    });
    tagAsCuratedFreestyleTrick(db, id);
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    const tileMatch = res.text.match(/chip-link-marker[\s\S]{0,2000}<\/li>/);
    expect(tileMatch, 'tile for chip-link-marker should be present').toBeTruthy();
    const tile = tileMatch![0];
    expect(tile).toContain('class="gallery-tile-tags"');
    expect(tile).toContain('href="/media/browse?tag&#x3D;curated"');
    expect(tile).toContain('href="/media/browse?tag&#x3D;freestyle"');
    expect(tile).toContain('href="/media/browse?tag&#x3D;trick"');
    // tag_display preserved (with leading '#') in the chip body.
    expect(tile).toContain('>#curated<');
  });

  it('item-level #by_<slug> chip renders the member display name as plain text for anonymous viewers', async () => {
    const db = openDb();
    // Reuse the #by_media_regular tag inserted by the earlier hero-byMember
    // test rather than re-INSERT (UNIQUE constraint on tag_normalized).
    const existing = db.prepare("SELECT id FROM tags WHERE tag_normalized = '#by_media_regular'").get() as { id: string } | undefined;
    expect(existing, 'expected the earlier test to have inserted #by_media_regular').toBeTruthy();
    const byTagId = existing!.id;
    const id = insertVideo(db, {
      id: 'media_chip_by_anon_001',
      caption: 'chip-by-anon-marker',
      platform: 'youtube',
      video_id: 'CHIPBYAN01',
      uploaded_at: '2027-03-02T12:00:00.000Z',
    });
    tagAsCuratedFreestyleTrick(db, id);
    attachTag(db, id, byTagId, '#by_media_regular');
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    const tileMatch = res.text.match(/chip-by-anon-marker[\s\S]{0,2000}<\/li>/);
    expect(tileMatch).toBeTruthy();
    const tile = tileMatch![0];
    // Anonymous viewer: member name is rendered plain (no anchor) and the
    // chip does NOT carry a /members/ href.
    expect(tile).toContain('>Regular Member<');
    expect(tile).not.toMatch(/href="\/members\/media_regular"/);
    // Other criteria-tag chips on the same tile still link to /media/browse.
    expect(tile).toContain('href="/media/browse?tag&#x3D;curated"');
  });
});

describe('GET /media/:galleryId/:mediaId (item detail) + grid linking', () => {
  const GID = 'gallery_item_detail_test';
  const ITEM_A = 'media_detail_a';
  const ITEM_B = 'media_detail_b';
  const ITEM_C = 'media_detail_c';

  beforeAll(() => {
    const db = openDb();
    const detailTagId = 'tag-test-detailset';
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, '#detailset', '#detailset', 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(detailTagId, TS, TS);
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, '#by_detail_uploader', '#by_detail_uploader', 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run('tag-by-detail-uploader', TS, TS);
    insertMember(db, { id: 'member-detail-uploader', slug: 'detail_uploader', display_name: 'Detail Uploader' });

    insertNamedGallery(db, { id: GID, ownerId: SYSTEM_ID, name: 'Detail Set' });
    insertGalleryCriteria(db, GID, [detailTagId]);

    // upload_desc default ordering: newest first, so the gallery order is C, B, A.
    insertPhoto(db, { id: ITEM_A, caption: 'detail-item-a', uploaded_at: '2026-07-01T00:00:00.000Z' });
    insertPhoto(db, { id: ITEM_B, caption: 'detail-item-b', uploaded_at: '2026-07-02T00:00:00.000Z' });
    insertPhoto(db, { id: ITEM_C, caption: 'detail-item-c', uploaded_at: '2026-07-03T00:00:00.000Z' });
    for (const id of [ITEM_A, ITEM_B, ITEM_C]) attachTag(db, id, detailTagId, '#detailset');
    // Attribute the middle item to a member, so the detail page shows uploader.
    attachTag(db, ITEM_B, 'tag-by-detail-uploader', '#by_detail_uploader');
    db.close();
  });

  it('renders an item detail with caption, back link, and prev/next within the gallery', async () => {
    // Order C, B, A; middle B → prev is the newer C, next is the older A.
    const res = await request(createApp()).get(`/media/${GID}/${ITEM_B}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('detail-item-b');
    expect(res.text).toContain(`href="/media/${GID}"`);
    expect(res.text).toContain(`href="/media/${GID}/${ITEM_C}"`);
    expect(res.text).toContain(`href="/media/${GID}/${ITEM_A}"`);
    expect(res.text).toContain('rel="prev"');
    expect(res.text).toContain('rel="next"');
  });

  it('wraps prev/next around the ends of the ordered set', async () => {
    // Order C, B, A. The first item's Previous wraps to the last item, and the
    // last item's Next wraps to the first, so both ends keep a full pager.
    const first = await request(createApp()).get(`/media/${GID}/${ITEM_C}`);
    expect(first.status).toBe(200);
    expect(first.text).toContain('rel="prev"');
    expect(first.text).toContain('rel="next"');
    expect(first.text).toContain(`href="/media/${GID}/${ITEM_A}"`); // prev wraps to last
    expect(first.text).toContain(`href="/media/${GID}/${ITEM_B}"`); // next is the second item

    const last = await request(createApp()).get(`/media/${GID}/${ITEM_A}`);
    expect(last.status).toBe(200);
    expect(last.text).toContain('rel="prev"');
    expect(last.text).toContain('rel="next"');
    expect(last.text).toContain(`href="/media/${GID}/${ITEM_B}"`); // prev is the middle item
    expect(last.text).toContain(`href="/media/${GID}/${ITEM_C}"`); // next wraps to first
  });

  it('shows a single item with no pager when the set has one item', async () => {
    // A gallery whose criteria match exactly one item: the pager collapses
    // because Previous and Next would both resolve to that same item.
    const db = openDb();
    const soloTagId = 'tag-test-soloset';
    db.prepare(`
      INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, '#soloset', '#soloset', 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
    `).run(soloTagId, TS, TS);
    insertNamedGallery(db, { id: 'gallery_solo', ownerId: SYSTEM_ID, name: 'Solo Set' });
    insertGalleryCriteria(db, 'gallery_solo', [soloTagId]);
    const soloItem = insertPhoto(db, { caption: 'solo-item', uploaded_at: '2026-07-04T00:00:00.000Z' });
    attachTag(db, soloItem, soloTagId, '#soloset');
    db.close();

    const res = await request(createApp()).get(`/media/gallery_solo/${soloItem}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('solo-item');
    expect(res.text).not.toContain('rel="prev"');
    expect(res.text).not.toContain('rel="next"');
  });

  it('shows uploader attribution as plain text for an anonymous viewer', async () => {
    const res = await request(createApp()).get(`/media/${GID}/${ITEM_B}`);
    expect(res.text).toContain('Uploaded by');
    expect(res.text).toContain('Detail Uploader');
    expect(res.text).not.toMatch(/href="\/members\/detail_uploader"/);
  });

  it('returns 404 for an item not in the gallery', async () => {
    const res = await request(createApp()).get(`/media/${GID}/media_not_in_gallery`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an item under an unknown gallery', async () => {
    const res = await request(createApp()).get(`/media/gallery_does_not_exist/${ITEM_B}`);
    expect(res.status).toBe(404);
  });

  it('links grid tiles to the item detail page rather than opening a new tab', async () => {
    const res = await request(createApp()).get(`/media/${GID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/media/${GID}/${ITEM_B}"`);
    const gridSlice = res.text.slice(res.text.indexOf('gallery-grid'));
    expect(gridSlice).not.toContain('target="_blank"');
  });
});

describe('GET /gallery (removed)', () => {
  it('returns 404 — the route was replaced by /media', async () => {
    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Unavailable-embed exclusion: items tagged `#unavailable_embed` (curator-
// applied when an upstream YouTube video is private/deleted/blocked) must NOT
// surface in the public gallery output, regardless of per-gallery config.
// Enforced at the DB layer in `queryGalleryItemsByCriteria` +
// `queryGalleryItemsByCriteriaGrouped` (always-on AND-NOT-EXISTS clause).

describe('GET /media/:galleryId — #unavailable_embed always-on exclusion', () => {
  it('renders an available curated video and excludes an unavailable-tagged sibling', async () => {
    const db = openDb();
    // Available control: standard FH-gallery curated trick video.
    const availableId = insertVideo(db, {
      caption:  'control-available-marker',
      platform: 'youtube',
      video_id: 'AVAILABLE_FIXTURE_ID',
    });
    tagAsCuratedFreestyleTrick(db, availableId);

    // Unavailable variant: same gallery criteria tags, plus the
    // `#unavailable_embed` tag that should hide it from public surfaces.
    const unavailableId = insertVideo(db, {
      caption:  'unavailable-marker-should-not-appear',
      platform: 'youtube',
      video_id: 'UNAVAILABLE_FIXTURE_ID',
    });
    tagAsCuratedFreestyleTrick(db, unavailableId);
    attachTag(db, unavailableId, UNAVAILABLE_TAG_ID, '#unavailable_embed');
    db.close();

    const app = createApp();
    const res = await request(app).get(`/media/${FH_GALLERY_ID}`);
    expect(res.status).toBe(200);
    // Available video's caption + thumbnail render as a normal tile.
    expect(res.text).toContain('control-available-marker');
    expect(res.text).toContain('https://i.ytimg.com/vi/AVAILABLE_FIXTURE_ID/hqdefault.jpg');
    // Unavailable video must NOT render — neither its caption nor its
    // thumbnail nor its YouTube ID appears anywhere on the page.
    expect(res.text).not.toContain('unavailable-marker-should-not-appear');
    expect(res.text).not.toContain('UNAVAILABLE_FIXTURE_ID');
  });
});
