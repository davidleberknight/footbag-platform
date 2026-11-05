/**
 * Club detail page: the club's media block and its linked hashtag.
 *
 * When media carries a club's hashtag, the media line near the top of the club
 * page shows the hashtag linked to the club's gallery beside a gallery link, and
 * no individual items. With no such media the hashtag is a plain token and there
 * is no gallery link. The hashtag is never in the hero.
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
  it('shows a linked hashtag and the gallery link in the media line, and no items, when media carries the club hashtag', async () => {
    // Defect caught: a club with media gives no way into its gallery, its
    // hashtag does not lead there, the hashtag sits in the hero, or the club
    // page lists the items themselves.
    const app = createApp();
    const res = await request(app).get('/clubs/club_portland');
    expect(res.status).toBe(200);
    const start = res.text.indexOf('id="club-media"');
    expect(start).toBeGreaterThan(-1);
    const block = res.text.slice(start, res.text.indexOf('</p>', start));
    expect(block).toContain(
      '<a class="hashtag hashtag--media" href="/media/browse?context&#x3D;club_portland">#club_portland</a>');
    expect(block).toContain('<a class="action-link" href="/media/browse?context&#x3D;club_portland">');
    expect(block).not.toContain('gallery-tile');
    expect(res.text).not.toContain(portlandMediaId);
    // The hero runs to the first wrapper after it; the site header opens a
    // wrapper of its own before the hero.
    const heroStart = res.text.indexOf('<div class="hero');
    const hero = res.text.slice(heroStart, res.text.indexOf('<div class="wrapper">', heroStart));
    expect(hero).toContain('<h1>');
    expect(hero).not.toContain('#club_portland');
  });

  it('shows the hashtag as a plain token and no gallery link when no media carries the club hashtag', async () => {
    // Defect caught: a gallery link leading to an empty gallery, or the hashtag
    // a visitor should tag with missing from the page.
    const app = createApp();
    const res = await request(app).get('/clubs/club_seattle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="club-media"');
    expect(res.text).not.toContain('/media/browse?context&#x3D;club_seattle');
    expect(res.text).toContain('<span class="hashtag">#club_seattle</span>');
  });
});
