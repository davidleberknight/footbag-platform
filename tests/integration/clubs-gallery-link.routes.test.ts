/**
 * Club detail page: the club's media block and its linked hashtag.
 *
 * When media carries a club's hashtag, the club page shows the newest items
 * and a button to the club's gallery, and the hashtag under the title links to
 * it. With no such media there is no block and the hashtag is a plain token.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag, insertClub, insertMediaItem, attachMediaTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3071');

let createApp: Awaited<ReturnType<typeof importApp>>;

const TS = '2025-01-01T00:00:00.000Z';
let portlandMediaId = '';

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
  portlandMediaId = insertMediaItem(db, {
    uploader_member_id: uploaderId,
    caption: 'Portland jam session',
  });
  attachMediaTag(db, portlandMediaId, tagIdWithMedia);

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
  it('shows the media block and a linked hashtag when media carries the club hashtag', async () => {
    // Defect caught: a club with media shows none of it, or its hashtag does
    // not lead to the club's gallery.
    const app = createApp();
    const res = await request(app).get('/clubs/club_portland');
    expect(res.status).toBe(200);
    const block = res.text.slice(res.text.indexOf('id="club-media"'));
    expect(res.text).toContain('id="club-media"');
    expect(block).toContain(`/media/item/${portlandMediaId}?`);
    expect(block).toContain('href="/media/browse?context&#x3D;club_portland"');
    expect(res.text).toMatch(
      /<p class="hero-hashtag"><a href="\/media\/browse\?context&#x3D;club_portland">#club_portland<\/a><\/p>/);
  });

  it('shows no block and a plain hashtag when no media carries the club hashtag', async () => {
    // Defect caught: a gallery button leading to an empty gallery.
    const app = createApp();
    const res = await request(app).get('/clubs/club_seattle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="club-media"');
    expect(res.text).not.toContain('/media/browse?context&#x3D;club_seattle');
    expect(res.text).toContain('<p class="hero-hashtag">#club_seattle</p>');
  });

  it('renders the hero hashtag with only the hero class, not the inline chip', async () => {
    // The club-detail hero hashtag must not also carry the .club-hashtag chip
    // class: the chip paints a near-white background that, on the green hero,
    // renders as a full-width white strip with the white hero text invisible.
    const app = createApp();
    const res = await request(app).get('/clubs/club_portland');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<p class="hero-hashtag">');
    expect(res.text).not.toContain('club-hashtag hero-hashtag');
  });
});
