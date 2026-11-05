/**
 * Event detail page: the event's media block and its linked hashtag.
 *
 * When media carries an event's hashtag, the event page shows a button to the
 * event's gallery and the hashtag under the title linked to that gallery, and
 * no individual items: the gallery holds them. With no such media the page
 * shows no block and the
 * hashtag as a plain token, so a visitor still sees what to tag their media with.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertEvent,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3073');

let page: (path: string) => ReturnType<ReturnType<typeof cachedGet>>;
const mediaIds: string[] = [];

// The media line runs from its id to the end of its own paragraph, so an item
// tile rendered inside it falls within the slice.
function mediaBlock(html: string): string {
  const start = html.indexOf('id="event-media"');
  return start === -1 ? '' : html.slice(start, html.indexOf('</p>', start));
}

// The hero runs from its own opening to the page body, the first wrapper after
// it (the site header opens a wrapper of its own before the hero).
function hero(html: string): string {
  const start = html.indexOf('<div class="hero');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('<div class="wrapper">', start));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const uploaderId = insertMember(db, {
    id: 'uploader-event-gallery-link',
    slug: 'uploader_event_gallery_link',
    login_email: 'uploader-event-gallery-link@example.com',
    display_name: 'Event Gallery Uploader',
  });

  // Several items, so a page that listed any of them would show it.
  const withMedia = insertTag(db, {
    tag_normalized: '#event_2025_testopen', tag_display: '#event_2025_testopen', standard_type: 'event',
  });
  insertEvent(db, { id: 'event-with-media', title: 'Test Open 2025', hashtag_tag_id: withMedia, status: 'completed' });
  for (let i = 0; i < 3; i++) {
    const id = insertMediaItem(db, {
      uploader_member_id: uploaderId,
      caption: `Test Open clip ${i}`,
      uploaded_at: `2025-06-01T10:${String(i).padStart(2, '0')}:00.000Z`,
    });
    attachMediaTag(db, id, withMedia);
    mediaIds.push(id);
  }

  const noMedia = insertTag(db, {
    tag_normalized: '#event_2025_nomedia', tag_display: '#event_2025_nomedia', standard_type: 'event',
  });
  insertEvent(db, { id: 'event-no-media', title: 'No Media Open 2025', hashtag_tag_id: noMedia, status: 'completed' });

  db.close();
  const createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/:eventKey -- media block', () => {
  it('shows a linked hashtag and the gallery link in the media line, and no items, when media carries the hashtag', async () => {
    // Defect caught: an event with media gives no way into its gallery, the
    // hashtag and the gallery link disagree, the hashtag sits in the hero, or
    // the page fills with individual items that belong in the gallery.
    const res = await page('/events/event_2025_testopen');
    expect(res.status).toBe(200);
    const block = mediaBlock(res.text);
    expect(block).toContain(
      '<a class="hashtag hashtag--media" href="/media/browse?context&#x3D;event_2025_testopen">#event_2025_testopen</a>');
    expect(block).toContain('<a class="action-link" href="/media/browse?context&#x3D;event_2025_testopen">');
    expect(hero(res.text)).not.toContain('#event_2025_testopen');
    expect(mediaIds.filter((id) => res.text.includes(id))).toEqual([]);
    expect(block).not.toContain('gallery-tile');
  });

  it('shows the hashtag as a plain token and no gallery link when no media carries it', async () => {
    // Defect caught: a gallery link leading to an empty gallery, or the
    // hashtag a visitor should tag with missing from the page.
    const res = await page('/events/event_2025_nomedia');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="event-media"');
    expect(res.text).not.toContain('/media/browse?context&#x3D;event_2025_nomedia');
    expect(res.text).toContain('<span class="hashtag">#event_2025_nomedia</span>');
    expect(hero(res.text)).not.toContain('#event_2025_nomedia');
  });
});
