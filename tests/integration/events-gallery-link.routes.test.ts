/**
 * Event detail page: "View gallery" link.
 *
 * When an event's standard tag has at least one active, non-avatar media item
 * tagged with it, the detail page renders a "View gallery" link pointing to
 * /media/browse?context=<event_key> (mirrors the club gallery link). When no media
 * exists, the link is absent. This delivers the M_Upload_Photo criterion that a
 * photo tagged with an event hashtag is reachable from that event.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag, insertEvent, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3073');

let createApp: Awaited<ReturnType<typeof importApp>>;

const TS = '2025-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const uploaderId = insertMember(db, {
    id: 'uploader-event-gallery-link',
    slug: 'uploader_event_gallery_link',
    login_email: 'uploader-event-gallery-link@example.com',
    display_name: 'Event Gallery Uploader',
  });

  // Event WITH media tagged.
  const tagIdWithMedia = insertTag(db, {
    tag_normalized: '#event_2025_testopen',
    tag_display: '#event_2025_testopen',
    standard_type: 'event',
  });
  insertEvent(db, {
    id: 'event-with-media',
    title: 'Test Open 2025',
    hashtag_tag_id: tagIdWithMedia,
    status: 'completed',
  });
  const mediaId = insertMediaItem(db, {
    uploader_member_id: uploaderId,
    caption: 'Test Open jam',
  });
  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run('mt-event-testopen-001', TS, TS, mediaId, tagIdWithMedia, '#event_2025_testopen');

  // Event WITHOUT media.
  const tagIdNoMedia = insertTag(db, {
    tag_normalized: '#event_2025_nomedia',
    tag_display: '#event_2025_nomedia',
    standard_type: 'event',
  });
  insertEvent(db, {
    id: 'event-no-media',
    title: 'No Media Open 2025',
    hashtag_tag_id: tagIdNoMedia,
    status: 'completed',
  });

  // Event whose ONLY tagged media is #unavailable_embed (a private/deleted
  // video the curator marked). The count gate must treat it as zero so the
  // "View gallery" link does not lead to an empty browse page.
  const tagIdUnavail = insertTag(db, {
    tag_normalized: '#event_2025_unavail',
    tag_display: '#event_2025_unavail',
    standard_type: 'event',
  });
  insertEvent(db, {
    id: 'event-unavail-media',
    title: 'Unavailable Media Open 2025',
    hashtag_tag_id: tagIdUnavail,
    status: 'completed',
  });
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type,
      created_at, created_by, updated_at, updated_by, version)
    VALUES ('tag-unavail-embed', '#unavailable_embed', '#unavailable_embed', 0, NULL,
      ?, 'test', ?, 'test', 1)
  `).run(TS, TS);
  const unavailMediaId = insertMediaItem(db, {
    uploader_member_id: uploaderId,
    caption: 'Unavailable clip',
  });
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run('mt-event-unavail-001', TS, TS, unavailMediaId, tagIdUnavail, '#event_2025_unavail');
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, 'tag-unavail-embed', '#unavailable_embed')
  `).run('mt-event-unavail-002', TS, TS, unavailMediaId);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/:eventKey -- gallery link', () => {
  it('renders "View gallery" when the event tag has media', async () => {
    const res = await request(createApp()).get('/events/event_2025_testopen');
    expect(res.status).toBe(200);
    expect(res.text).toContain('View Gallery');
    expect(res.text).toContain('/media/browse?context');
    expect(res.text).toContain('event_2025_testopen');
  });

  it('does not render "View gallery" when the event tag has no media', async () => {
    const res = await request(createApp()).get('/events/event_2025_nomedia');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('View gallery');
  });

  it('does not render "View gallery" when the only tagged media is #unavailable_embed', async () => {
    const res = await request(createApp()).get('/events/event_2025_unavail');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('View gallery');
  });
});
