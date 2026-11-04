/**
 * Event detail page: the event's media block and its linked hashtag.
 *
 * When media carries an event's hashtag, the event page shows a button to the
 * event's gallery and the hashtag under the title linked to that gallery, and
 * no individual items: the gallery holds them. With no such media the page
 * shows no block and the
 * hashtag as a plain token, so a visitor still sees what to tag their media with.
 * Media marked #unavailable_embed counts as none.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertFreeformTag,
  insertEvent,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3073');

let page: (path: string) => ReturnType<ReturnType<typeof cachedGet>>;
const mediaIds: string[] = [];
let unavailableMediaId = '';

// The block runs from its id to the end of its section's own wrapper, so an
// item tile rendered anywhere inside it falls within the slice.
function mediaBlock(html: string): string {
  const start = html.indexOf('id="event-media"');
  return start === -1 ? '' : html.slice(start, html.indexOf('</div>', start));
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

  const unavailable = insertTag(db, {
    tag_normalized: '#event_2025_unavail', tag_display: '#event_2025_unavail', standard_type: 'event',
  });
  insertEvent(db, { id: 'event-unavail-media', title: 'Unavailable Open 2025', hashtag_tag_id: unavailable, status: 'completed' });
  const unavailableEmbed = insertFreeformTag(db, {
    id: 'tag-unavail-embed', tag_normalized: '#unavailable_embed', tag_display: '#unavailable_embed',
  });
  unavailableMediaId = insertMediaItem(db, { uploader_member_id: uploaderId, caption: 'Unavailable clip' });
  attachMediaTag(db, unavailableMediaId, unavailable);
  attachMediaTag(db, unavailableMediaId, unavailableEmbed);

  db.close();
  const createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/:eventKey -- media block', () => {
  it('shows only the gallery button and a linked hashtag when media carries the hashtag', async () => {
    // Defect caught: an event with media gives no way into its gallery, or
    // fills the event page with individual items that belong in the gallery.
    const res = await page('/events/event_2025_testopen');
    expect(res.status).toBe(200);
    const block = mediaBlock(res.text);
    expect(block).toContain('href="/media/browse?context&#x3D;event_2025_testopen"');
    expect(mediaIds.filter((id) => res.text.includes(id))).toEqual([]);
    expect(block).not.toContain('gallery-tile');
    expect(res.text).toMatch(
      /<p class="hero-hashtag"><a href="\/media\/browse\?context&#x3D;event_2025_testopen">#event_2025_testopen<\/a><\/p>/);
  });

  it('shows no block and a plain hashtag when no media carries it', async () => {
    // Defect caught: a gallery button leading to an empty gallery, or the
    // hashtag a visitor should tag with missing from the page.
    const res = await page('/events/event_2025_nomedia');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="event-media"');
    expect(res.text).not.toContain('/media/browse?context&#x3D;event_2025_nomedia');
    expect(res.text).toContain('<p class="hero-hashtag">#event_2025_nomedia</p>');
  });

  it('treats media marked #unavailable_embed as none', async () => {
    // Defect caught: a dead video makes the page offer a gallery with nothing to watch.
    const res = await page('/events/event_2025_unavail');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="event-media"');
    expect(res.text).not.toContain(unavailableMediaId);
  });
});
