/**
 * Coverage for mixed photo+video media galleries against the gallery user
 * stories. These cases were under-covered: a mixed photo-and-video tag browse
 * grid, sort_order actually reordering the rendered grid (not just the stored
 * value), a member-owned mixed gallery's item count on /media/member-galleries,
 * gallery membership re-evaluation after a criteria-tag edit, positive
 * video-tile assertions alongside a photo tile, mixed-set prev/next, the
 * null-caption alt fallback, and per-platform thumbnails.
 *
 * Grid video tiles carry `.gallery-tile-video` + the `.gallery-tile-play` SVG;
 * the playable `data-platform`/`data-video-src` facade lives on the item-detail
 * view, not the grid tile, so grid assertions check the former.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3142');
let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'member-mix-system-001';
const MEMBER_ID = 'member-mix-regular-001';
const TS = '2026-04-29T12:00:00.000Z';

function openDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

function insertFreeformTag(db: BetterSqlite3.Database, display: string): string {
  const id = `tag-mix-${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
  `).run(id, display.toLowerCase(), display, TS, TS);
  return id;
}

function insertPhoto(db: BetterSqlite3.Database, o: { id: string; caption?: string | null; uploaded_at?: string; uploader?: string }): string {
  const uploader = o.uploader ?? SYSTEM_ID;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px, moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'photo', 0, ?, ?, ?, ?, 1000, 600, 'active')
  `).run(
    o.id, TS, TS, uploader, o.caption === undefined ? null : o.caption, o.uploaded_at ?? TS,
    `${uploader}/detached/${o.id}-thumb.jpg`, `${uploader}/detached/${o.id}-display.jpg`,
  );
  return o.id;
}

function insertVideo(db: BetterSqlite3.Database, o: { id: string; platform: 's3' | 'youtube' | 'vimeo'; caption?: string | null; uploaded_at?: string; video_id?: string; uploader?: string }): string {
  const uploader = o.uploader ?? SYSTEM_ID;
  let videoId: string; let videoUrl: string | null; let thumbUrl: string | null;
  if (o.platform === 's3') {
    videoId = `${uploader}/detached/${o.id}-video.mp4`; videoUrl = null;
    thumbUrl = `/media-store/${uploader}/detached/${o.id}-poster-display.jpg`;
  } else if (o.platform === 'youtube') {
    videoId = o.video_id ?? `YT${o.id.slice(-6)}`; videoUrl = `https://www.youtube.com/watch?v=${videoId}`; thumbUrl = null;
  } else {
    videoId = o.video_id ?? (o.id.replace(/[^0-9]/g, '').slice(-8) || '12345678'); videoUrl = `https://vimeo.com/${videoId}`;
    thumbUrl = `https://i.vimeocdn.com/video/${videoId}_640.jpg`;
  }
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url, width_px, height_px, moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'video', 0, ?, ?, ?, ?, ?, ?, 1280, 720, 'active')
  `).run(o.id, TS, TS, uploader, o.caption === undefined ? null : o.caption, o.uploaded_at ?? TS, o.platform, videoId, videoUrl, thumbUrl);
  return o.id;
}

function attachTag(db: BetterSqlite3.Database, mediaId: string, tagId: string, display: string): void {
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
    VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, ?)
  `).run(`mt_${Math.random().toString(36).slice(2, 12)}`, TS, TS, mediaId, tagId, display);
}

function insertGallery(db: BetterSqlite3.Database, o: { id: string; ownerId: string; name: string; sortOrder?: string; criteria: string[] }): void {
  db.prepare(`
    INSERT INTO member_galleries (id, created_at, created_by, updated_at, updated_by, version, owner_member_id, name, description, is_default, sort_order)
    VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, '', 0, ?)
  `).run(o.id, TS, TS, o.ownerId, o.name, o.sortOrder ?? 'upload_desc');
  for (const tid of o.criteria) {
    db.prepare(`INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by) VALUES (?, ?, ?, 'admin-act-as')`).run(o.id, tid, TS);
  }
}

let MIX_TAG = ''; let SORT_TAG = ''; let MEMMIX_TAG = ''; let CRITA_TAG = ''; let CRITB_TAG = ''; let NAV_TAG = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'mix_system', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMember(db, { id: MEMBER_ID, slug: 'mix_regular', display_name: 'Mix Regular' });

  MIX_TAG = insertFreeformTag(db, '#mixbrowse');
  SORT_TAG = insertFreeformTag(db, '#sortset');
  MEMMIX_TAG = insertFreeformTag(db, '#memmix');
  CRITA_TAG = insertFreeformTag(db, '#crita');
  CRITB_TAG = insertFreeformTag(db, '#critb');
  NAV_TAG = insertFreeformTag(db, '#navmix');

  // Mixed browse set: a photo, a null-caption photo, and one video per platform.
  const ph = insertPhoto(db, { id: 'mix_photo_01', caption: 'mix-photo-caption' });
  const phNull = insertPhoto(db, { id: 'mix_photo_null', caption: null });
  const yt = insertVideo(db, { id: 'mix_video_yt', platform: 'youtube', caption: 'mix-yt-caption', video_id: 'YTMIX1234' });
  const vm = insertVideo(db, { id: 'mix_video_vm', platform: 'vimeo', caption: 'mix-vimeo-caption', video_id: '99887766' });
  const s3 = insertVideo(db, { id: 'mix_video_s3', platform: 's3', caption: 'mix-s3-caption' });
  for (const m of [ph, phNull, yt, vm, s3]) attachTag(db, m, MIX_TAG, '#mixbrowse');

  // Sort set: 3 photos whose caption order is the reverse of their upload order.
  insertPhoto(db, { id: 'sort_03', caption: '03 third', uploaded_at: '2027-03-03T00:00:00.000Z' });
  insertPhoto(db, { id: 'sort_02', caption: '02 second', uploaded_at: '2027-02-02T00:00:00.000Z' });
  insertPhoto(db, { id: 'sort_01', caption: '01 first', uploaded_at: '2027-01-01T00:00:00.000Z' });
  for (const id of ['sort_03', 'sort_02', 'sort_01']) attachTag(db, id, SORT_TAG, '#sortset');
  insertGallery(db, { id: 'gallery_sort_caption', ownerId: SYSTEM_ID, name: 'Caption Sorted', sortOrder: 'caption_asc', criteria: [SORT_TAG] });
  insertGallery(db, { id: 'gallery_sort_upload', ownerId: SYSTEM_ID, name: 'Upload Sorted', sortOrder: 'upload_desc', criteria: [SORT_TAG] });

  // Member-owned mixed gallery: 1 photo + 2 videos → count 3.
  const mp = insertPhoto(db, { id: 'memmix_photo', caption: 'mm-photo', uploader: MEMBER_ID });
  const mv1 = insertVideo(db, { id: 'memmix_yt', platform: 'youtube', caption: 'mm-yt', uploader: MEMBER_ID });
  const mv2 = insertVideo(db, { id: 'memmix_vm', platform: 'vimeo', caption: 'mm-vimeo', uploader: MEMBER_ID });
  for (const m of [mp, mv1, mv2]) attachTag(db, m, MEMMIX_TAG, '#memmix');
  insertGallery(db, { id: 'gallery_member_mixed', ownerId: MEMBER_ID, name: 'My Mixed Set', criteria: [MEMMIX_TAG] });

  // Criteria re-eval: gallery starts on #crita; item A carries #crita, B carries #critb.
  insertPhoto(db, { id: 'crit_a_item', caption: 'crit-A-item' });
  insertPhoto(db, { id: 'crit_b_item', caption: 'crit-B-item' });
  attachTag(db, 'crit_a_item', CRITA_TAG, '#crita');
  attachTag(db, 'crit_b_item', CRITB_TAG, '#critb');
  insertGallery(db, { id: 'gallery_crit', ownerId: SYSTEM_ID, name: 'Criteria Set', criteria: [CRITA_TAG] });

  // Named gallery worth filtering: 5 curated + 1 member item under #famfilter,
  // so the gallery's own filter shows with #curated splitting the set.
  const FAM_TAG = insertFreeformTag(db, '#famfilter');
  const FAM_CURATED = insertFreeformTag(db, '#curated');
  for (let i = 1; i <= 5; i++) {
    const id = `fam_curated_${i}`;
    insertPhoto(db, { id, caption: `fam-curated-${i}` });
    attachTag(db, id, FAM_TAG, '#famfilter');
    attachTag(db, id, FAM_CURATED, '#curated');
  }
  insertPhoto(db, { id: 'fam_member', caption: 'fam-member-clip', uploader: MEMBER_ID });
  attachTag(db, 'fam_member', FAM_TAG, '#famfilter');
  insertGallery(db, { id: 'gallery_fam', ownerId: SYSTEM_ID, name: 'Family Filter Set', criteria: [FAM_TAG] });
  // A curated-by-definition gallery (criteria already include #curated), matching
  // the 5 curated fam items. Used to pin that a redundant ?tag=curated refine
  // does not duplicate the tag id and empty the gallery.
  insertGallery(db, { id: 'gallery_curated_set', ownerId: SYSTEM_ID, name: 'Curated Set', criteria: [FAM_CURATED, FAM_TAG] });

  // Mixed-set prev/next: one photo + one video in a named gallery.
  const np = insertPhoto(db, { id: 'nav_photo', caption: 'nav-photo' });
  const nv = insertVideo(db, { id: 'nav_video', platform: 'youtube', caption: 'nav-video', video_id: 'YTNAV999' });
  attachTag(db, np, NAV_TAG, '#navmix');
  attachTag(db, nv, NAV_TAG, '#navmix');
  insertGallery(db, { id: 'gallery_nav', ownerId: SYSTEM_ID, name: 'Nav Set', criteria: [NAV_TAG] });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Mixed photo+video browse grid', () => {
  it('renders both photo and video tiles, with per-platform thumbnails', async () => {
    const res = await request(createApp()).get('/media/browse?tag=mixbrowse');
    expect(res.status).toBe(200);
    expect(res.text).toContain('mix-photo-caption');
    expect(res.text).toContain('mix-yt-caption');
    expect(res.text).toContain('mix-vimeo-caption');
    expect(res.text).toContain('mix-s3-caption');
    // Per-platform thumbnails.
    expect(res.text).toContain('https://i.ytimg.com/vi/YTMIX1234/hqdefault.jpg');
    expect(res.text).toContain('https://i.vimeocdn.com/video/99887766_640.jpg');
    expect(res.text).toContain('/media-store/');
  });

  it('marks video tiles with .gallery-tile-video and the play overlay, but not photo tiles', async () => {
    const res = await request(createApp()).get('/media/browse?tag=mixbrowse');
    expect(res.status).toBe(200);
    expect(res.text).toContain('gallery-tile-video');
    expect(res.text).toContain('gallery-tile-play');
    // The photo tile (scoped by its caption) is not a video facade.
    const photoTile = res.text.match(/gallery-tile[\s\S]{0,600}?mix-photo-caption/);
    expect(photoTile).toBeTruthy();
    expect(photoTile![0]).not.toContain('gallery-tile-video');
  });

  it('falls back to an empty alt on a null-caption photo tile (no crash)', async () => {
    const res = await request(createApp()).get('/media/browse?tag=mixbrowse');
    expect(res.status).toBe(200);
    // The null-caption photo's thumbnail renders with an empty alt attribute.
    expect(res.text).toContain('mix_photo_null-thumb.jpg" alt=""');
  });
});

describe('Named-gallery sort_order reorders the rendered grid', () => {
  it('caption_asc renders 01, 02, 03 even though their upload order is the reverse', async () => {
    const res = await request(createApp()).get('/media/gallery_sort_caption');
    expect(res.status).toBe(200);
    const i1 = res.text.indexOf('01 first');
    const i2 = res.text.indexOf('02 second');
    const i3 = res.text.indexOf('03 third');
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });

  it('upload_desc renders the same items newest-first (03, 02, 01)', async () => {
    const res = await request(createApp()).get('/media/gallery_sort_upload');
    expect(res.status).toBe(200);
    const i3 = res.text.indexOf('03 third');
    const i2 = res.text.indexOf('02 second');
    const i1 = res.text.indexOf('01 first');
    expect(i3).toBeLessThan(i2);
    expect(i2).toBeLessThan(i1);
  });
});

describe('Member-owned mixed gallery item count', () => {
  it('shows the 3-item count for a photo+video gallery on /media/member-galleries', async () => {
    const res = await request(createApp()).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('My Mixed Set');
    expect(res.text).toContain('3 items');
  });
});

describe('Gallery membership re-evaluates after a criteria-tag edit', () => {
  it('swaps which items appear when the gallery criteria tag changes', async () => {
    const before = await request(createApp()).get('/media/gallery_crit');
    expect(before.status).toBe(200);
    expect(before.text).toContain('crit-A-item');
    expect(before.text).not.toContain('crit-B-item');

    // Edit the gallery's criteria from #crita to #critb (membership is computed
    // at request time, so the next render reflects the new criteria).
    const db = openDb();
    db.prepare('UPDATE member_gallery_tags SET tag_id = ? WHERE gallery_id = ?').run(CRITB_TAG, 'gallery_crit');
    db.close();

    const after = await request(createApp()).get('/media/gallery_crit');
    expect(after.status).toBe(200);
    expect(after.text).toContain('crit-B-item');
    expect(after.text).not.toContain('crit-A-item');
  });
});

describe('Named gallery editable filter', () => {
  it("prefills the gallery's topic criteria as editable include chips (not locked)", async () => {
    const res = await request(createApp()).get('/media/gallery_fam');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="tag-filter-bar"');
    // The topic criterion is an editable, removable include chip (the filter form
    // submits to /media/browse so removing it broadens), NOT a locked context tag.
    expect(res.text).toContain('name="tag" value="famfilter" data-tag-chips');
    expect(res.text).toContain('action="/media/browse"');
    expect(res.text).not.toContain('class="tag-filter-chip tag-filter-chip--locked">#famfilter');
    // Default view is NOT curated: both curated and member items show.
    expect(res.text).toContain('fam-curated-1');
    expect(res.text).toContain('fam-member-clip');
  });

  it('a refinement folds into the editable include set alongside the criteria', async () => {
    const res = await request(createApp()).get('/media/gallery_fam?tag=curated');
    expect(res.status).toBe(200);
    expect(res.text).toContain('fam-curated-1');
    expect(res.text).not.toContain('fam-member-clip');
    // Both the criterion and the refinement prefill the include chip input.
    expect(res.text).toContain('name="tag" value="famfilter curated" data-tag-chips');
  });
});

describe('Curated-collection gallery (criteria include #curated)', () => {
  it('shows #curated as an editable include chip (removable to broaden), curated subset by default', async () => {
    const res = await request(createApp()).get('/media/gallery_curated_set');
    expect(res.status).toBe(200);
    // Default = curated subset (member item not shown).
    expect(res.text).toContain('fam-curated-1');
    expect(res.text).not.toContain('fam-member-clip');
    // #curated is one of the editable include chips (broaden by removing it), with
    // no special ?curated=off toggle.
    expect(res.text).toContain('name="tag" value="curated famfilter" data-tag-chips');
    expect(res.text).not.toContain('curated&#x3D;off');
  });

  it('still renders items when a redundant ?tag=curated refine is applied (no duplicate-tag empty)', async () => {
    const res = await request(createApp()).get('/media/gallery_curated_set?tag=curated');
    expect(res.status).toBe(200);
    // The redundant #curated is dropped, so the AND-of-N query is not broken.
    expect(res.text).toContain('fam-curated-1');
    expect(res.text).not.toContain('No photos or videos found');
  });
});

describe('Mixed-set prev/next navigation', () => {
  it('pages from a photo item to the video item in the same gallery', async () => {
    const res = await request(createApp()).get('/media/gallery_nav/nav_photo');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="gallery-item-pager"');
    // With two items the pager wraps, so the video item is reachable as a
    // prev or next href from the photo's detail page.
    expect(res.text).toMatch(/href="\/media\/gallery_nav\/nav_video"/);
  });
});
