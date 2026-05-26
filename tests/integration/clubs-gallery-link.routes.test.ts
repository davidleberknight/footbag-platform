/**
 * Club detail page: "View gallery" link.
 *
 * When a club's standard tag has at least one active, non-avatar media item
 * tagged with it, the detail page renders a "View gallery" link pointing to
 * /media/browse?tag=<club_key>. When no media exists, the link is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag, insertClub, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3071');

let createApp: Awaited<ReturnType<typeof importApp>>;

const TS = '2025-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const uploaderId = insertMember(db, {
    id: 'uploader-gallery-link',
    slug: 'uploader_gallery_link',
    login_email: 'uploader-gallery-link@example.com',
    display_name: 'Gallery Uploader',
  });

  // Club WITH media tagged
  const tagIdWithMedia = insertTag(db, {
    tag_normalized: '#club_portland',
    tag_display: '#club_portland',
    standard_type: 'club',
  });
  insertClub(db, {
    id: 'club-with-media',
    name: 'Portland Footbag',
    city: 'Portland',
    country: 'USA',
    hashtag_tag_id: tagIdWithMedia,
  });
  const mediaId = insertMediaItem(db, {
    uploader_member_id: uploaderId,
    caption: 'Portland jam session',
  });
  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run('mt-portland-001', TS, TS, mediaId, tagIdWithMedia, '#club_portland');

  // Club WITHOUT media
  const tagIdNoMedia = insertTag(db, {
    tag_normalized: '#club_seattle',
    tag_display: '#club_seattle',
    standard_type: 'club',
  });
  insertClub(db, {
    id: 'club-no-media',
    name: 'Seattle Footbag',
    city: 'Seattle',
    country: 'USA',
    hashtag_tag_id: tagIdNoMedia,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /clubs/:key -- gallery link', () => {
  it('renders "View gallery" when club tag has media', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_portland');
    expect(res.status).toBe(200);
    expect(res.text).toContain('View gallery');
    expect(res.text).toContain('/media/browse?tag');
    expect(res.text).toContain('club_portland');
  });

  it('does not render "View gallery" when club tag has no media', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_seattle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('View gallery');
  });
});
