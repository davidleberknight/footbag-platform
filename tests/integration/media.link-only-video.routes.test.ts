/**
 * Link-only videos on the public media surfaces. A TikTok or Instagram item is
 * never embedded: its browse tile shows the platform name in place of a
 * thumbnail and opens the item's own page on the site, like every other tile,
 * and that page links out to the post instead of playing it. A YouTube item in
 * the same set still plays through the click-to-play facade.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import {
  insertMember,
  insertFreeformTag,
  insertVideoMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3749');

let createApp: Awaited<ReturnType<typeof importApp>>;
const get = cachedGet(() => createApp());

const SYSTEM_ID = 'member-linkonly-system-001';
const INSTA_ID = 'media-linkonly-instagram';
const TIKTOK_ID = 'media-linkonly-tiktok';
const YOUTUBE_ID = 'media-linkonly-youtube';
const INSTA_URL = 'https://www.instagram.com/p/DGlbm3quyxE/';
const TIKTOK_URL = 'https://www.tiktok.com/@footbagger/video/7301234567890123456';

// The one gallery tile for a media item, cut out of the page by its href.
function tileFor(html: string, mediaId: string): string {
  const tiles = html.split('<li class="gallery-tile">').slice(1);
  const tile = tiles.find((t) => t.includes(`/media/item/${mediaId}?`));
  expect(tile, `a tile links to ${mediaId}`).toBeDefined();
  return tile!.split('</li>')[0];
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'linkonly_system', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  const tag = insertFreeformTag(db, { tag_normalized: '#linkonlyset', tag_display: '#linkonlyset' });
  insertVideoMediaItem(db, {
    id: INSTA_ID, uploader_member_id: SYSTEM_ID, caption: 'insta-record',
    uploaded_at: '2026-07-01T00:00:00.000Z',
    video_platform: 'instagram', video_id: 'DGlbm3quyxE', video_url: INSTA_URL,
    thumbnail_url: null, width_px: null, height_px: null,
  });
  insertVideoMediaItem(db, {
    id: TIKTOK_ID, uploader_member_id: SYSTEM_ID, caption: 'tiktok-clip',
    uploaded_at: '2026-07-02T00:00:00.000Z',
    video_platform: 'tiktok', video_id: '7301234567890123456', video_url: TIKTOK_URL,
    thumbnail_url: null, width_px: null, height_px: null,
  });
  insertVideoMediaItem(db, {
    id: YOUTUBE_ID, uploader_member_id: SYSTEM_ID, caption: 'youtube-clip',
    uploaded_at: '2026-07-03T00:00:00.000Z',
    video_platform: 'youtube', video_id: 'dQw4w9WgXcQ',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
  for (const id of [INSTA_ID, TIKTOK_ID, YOUTUBE_ID]) attachMediaTag(db, id, tag);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('browse tiles for link-only videos', () => {
  // Defect caught: a link-only item drops out of the browse results, renders
  // an empty image, or its tile skips the item page and leaves the site.
  it.each([
    [INSTA_ID, 'Instagram'],
    [TIKTOK_ID, 'TikTok'],
  ])('%s shows its platform name, no image, and opens its item page', async (mediaId, platformLabel) => {
    const res = await get('/media/browse?tag=linkonlyset');
    expect(res.status).toBe(200);
    const tile = tileFor(res.text, mediaId);
    expect(tile).toContain(`<span class="gallery-tile-platform">${platformLabel}</span>`);
    expect(tile).not.toContain('<img');
    expect(tile).not.toMatch(/href="https:\/\/www\.(instagram|tiktok)\.com/);
  });

  // Defect caught: the link-only branch swallows embeddable videos too, so a
  // YouTube tile loses its thumbnail.
  it('a YouTube tile in the same set keeps its thumbnail', async () => {
    const res = await get('/media/browse?tag=linkonlyset');
    expect(tileFor(res.text, YOUTUBE_ID)).toContain('<img src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"');
  });
});

describe('item page for link-only videos', () => {
  // Defect caught: a TikTok or Instagram post is embedded (or a dead facade is
  // drawn for it), or the page offers no way to reach the post.
  it.each([
    [INSTA_ID, INSTA_URL],
    [TIKTOK_ID, TIKTOK_URL],
  ])('%s links out to the post in a new tab and draws no player', async (mediaId, postUrl) => {
    const res = await get(`/media/item/${mediaId}`);
    expect(res.status).toBe(200);
    const link = res.text.match(new RegExp(`<a [^>]*href="${postUrl.replace(/[.?/]/g, '\\$&')}"[^>]*>`));
    expect(link, 'an anchor to the post').not.toBeNull();
    expect(link![0]).toContain('target="_blank"');
    expect(link![0]).toContain('rel="nofollow noopener noreferrer"');
    expect(res.text).not.toContain('data-platform=');
  });

  // Defect caught: the link-out replaces the player for every video, so a
  // YouTube item stops playing on its page.
  it('a YouTube item page still draws the click-to-play player', async () => {
    const res = await get(`/media/item/${YOUTUBE_ID}`);
    expect(res.text).toContain('data-platform="youtube"');
  });
});
