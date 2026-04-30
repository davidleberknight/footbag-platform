/**
 * Integration tests for GET /gallery — public read view of FH/system-member
 * curated media. Covers happy path, exclusion of non-system uploads, exclusion
 * of removed/avatar rows, empty state, pagination, invalid input, tag rendering,
 * and HTML-escape of caption text.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3127');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'member-gallery-system-001';
const MEMBER_ID = 'member-gallery-regular-001';

const TS = '2026-04-29T12:00:00.000Z';

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
      uploader_member_id, gallery_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, NULL, 'photo', ?, ?, ?,
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
  video_id?: string;
  thumbnail_url?: string;
  moderation_status?: 'active' | 'removed_by_admin';
}

function insertVideo(db: BetterSqlite3.Database, o: VideoOverrides = {}): string {
  const id = o.id ?? `media_video_${Math.random().toString(36).slice(2, 12)}`;
  const uploader = o.uploader_member_id ?? SYSTEM_ID;
  const videoKey = o.video_id ?? `${uploader}/detached/${id}-video.mp4`;
  const thumbUrl = o.thumbnail_url ?? `/media/${uploader}/detached/${id}-poster-display.jpg`;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, gallery_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      width_px, height_px,
      moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, NULL, 'video', 0, ?, ?,
              's3', ?, NULL, ?,
              1280, 720,
              ?)
  `).run(
    id, TS, TS,
    uploader, o.caption === undefined ? null : o.caption,
    o.uploaded_at ?? TS,
    videoKey, thumbUrl,
    o.moderation_status ?? 'active',
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

function openDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'gallery_system', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMember(db, { id: MEMBER_ID, slug: 'gallery_regular', display_name: 'Regular Member' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Tests run sequentially in declaration order. Empty-state assertions run
// FIRST (before any media inserts) so they exercise the no-content branch.
// Subsequent tests insert media; assertions use unique caption strings or
// IDs to remain self-isolating.
describe('GET /gallery', () => {
  it('renders the empty state when no curator media exists', async () => {
    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Media Gallery');
    expect(res.text).toContain('No media yet.');
    expect(res.text).not.toContain('class="gallery-grid"');
  });

  it('lists FH/system-member-uploaded photos and videos', async () => {
    const db = openDb();
    const photoId = insertPhoto(db, { caption: 'happy-path-photo-caption' });
    const videoId = insertVideo(db, { caption: 'happy-path-video-caption' });
    db.close();

    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.status).toBe(200);
    expect(res.text).toContain('happy-path-photo-caption');
    expect(res.text).toContain('happy-path-video-caption');
    expect(res.text).toContain(`${SYSTEM_ID}/detached/${photoId}-display.jpg`);
    expect(res.text).toContain(`/media/${SYSTEM_ID}/detached/${videoId}-poster-display.jpg`);
  });

  it('excludes media uploaded by non-system members', async () => {
    const db = openDb();
    insertPhoto(db, { uploader_member_id: MEMBER_ID, caption: 'regular-member-secret-caption' });
    db.close();

    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.text).not.toContain('regular-member-secret-caption');
  });

  it('excludes media with moderation_status removed_by_admin', async () => {
    const db = openDb();
    insertPhoto(db, { caption: 'removed-by-admin-caption', moderation_status: 'removed_by_admin' });
    db.close();

    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.text).not.toContain('removed-by-admin-caption');
  });

  it('excludes is_avatar=1 rows defense-in-depth', async () => {
    const db = openDb();
    insertPhoto(db, { caption: 'avatar-flagged-caption', is_avatar: 1 });
    db.close();

    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.text).not.toContain('avatar-flagged-caption');
  });

  it('renders tag chips from media_tags', async () => {
    const db = openDb();
    const tagId = insertTag(db, { tag_normalized: '#event_2026_worlds_japan', tag_display: '#event_2026_worlds_japan' });
    const photoId = insertPhoto(db, { caption: 'tagged-photo-caption' });
    attachTag(db, photoId, tagId, '#event_2026_worlds_japan');
    db.close();

    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.text).toContain('#event_2026_worlds_japan');
  });

  it('escapes HTML in captions', async () => {
    const db = openDb();
    insertPhoto(db, { caption: '<script>alert("xss-marker-12345")</script>' });
    db.close();

    const app = createApp();
    const res = await request(app).get('/gallery');
    expect(res.text).not.toContain('<script>alert("xss-marker-12345")</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('paginates: page 1 caps at 24 items, page 2 shows the overflow', async () => {
    const suffix = 'pagination-marker-901';
    const db = openDb();
    // Inserted with uploaded_at in May 2026 so they sort ahead of earlier
    // tests' April-dated items, occupying the most-recent slots.
    for (let i = 0; i < 25; i++) {
      const seq = String(i).padStart(2, '0');
      insertPhoto(db, {
        id: `media_pg_${suffix}_${seq}`,
        caption: `${suffix}-${seq}`,
        uploaded_at: `2026-05-${seq}T12:00:00.000Z`,
      });
    }
    db.close();

    const app = createApp();
    const page1 = await request(app).get('/gallery');
    const page2 = await request(app).get('/gallery?page=2');

    // Handlebars escapes `=` to `&#x3D;` in attribute context — valid HTML
    // and decoded by the browser before navigation.
    expect(page1.text).toContain('href="/gallery?page&#x3D;2"');
    expect(page1.text).not.toContain('Previous');
    expect(page1.text).toContain(`${suffix}-24`);

    expect(page2.text).toContain(`${suffix}-00`);
    expect(page2.text).toContain('href="/gallery"');
    expect(page2.text).toContain('Previous');
    expect(page2.text).not.toContain(`${suffix}-24`);
  });

  it('clamps invalid ?page values to page 1', async () => {
    const app = createApp();
    for (const bad of ['abc', '-5', '0', '0.5']) {
      const res = await request(app).get(`/gallery?page=${bad}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Media Gallery');
    }
  });

  it('renders a beyond-total page as an empty list (no crash)', async () => {
    const app = createApp();
    const res = await request(app).get('/gallery?page=999');
    expect(res.status).toBe(200);
  });
});
