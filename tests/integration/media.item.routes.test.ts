/**
 * Integration tests for the standalone item viewer at GET /media/item/:mediaId.
 *
 * This is the shared viewer reached from every tag-query surface (browse,
 * member profile, teaching examples). The ?tag= / ?exclude= / ?sort= context
 * rebuilds the same ordered set the tile was clicked in, so prev/next walk it
 * and wrap modulo the set. With no resolvable tag context (or an item past the
 * render cap) the page shows a single item with no pager and a ?back= return.
 *
 * Covers: wrapping prev/next over a tag set, context preserved in pager hrefs,
 * sort selection reordering the set, one-item set hiding the pager, the
 * single-item fallback for unresolved/absent context, validated ?back=,
 * uploader-attribution viewer gating, the browse-tile round-trip, and 404.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3131');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'member-item-system-001';
const REGULAR_ID = 'member-item-regular-001';
const TS = '2026-04-29T12:00:00.000Z';

// Ordered set under #wrapset, upload_desc: C (newest), B, A (oldest).
const ITEM_A = 'media_item_a';
const ITEM_B = 'media_item_b';
const ITEM_C = 'media_item_c';
const SOLO = 'media_item_solo';

let WRAP_TAG_ID = '';
let SOLO_TAG_ID = '';
let BY_REGULAR_TAG_ID = '';

function openDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

function insertFreeformTag(db: BetterSqlite3.Database, normalized: string, display: string): string {
  const id = `tag-item-${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
  `).run(id, normalized, display, TS, TS);
  return id;
}

function insertPhoto(
  db: BetterSqlite3.Database,
  o: { id: string; uploader?: string; caption?: string; uploaded_at?: string },
): string {
  const uploader = o.uploader ?? SYSTEM_ID;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'photo', 0, ?, ?,
              ?, ?, 1000, 600,
              'active')
  `).run(
    o.id, TS, TS,
    uploader, o.caption ?? null, o.uploaded_at ?? TS,
    `${uploader}/detached/${o.id}-thumb.jpg`,
    `${uploader}/detached/${o.id}-display.jpg`,
  );
  return o.id;
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

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'item_system', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMember(db, { id: REGULAR_ID, slug: 'item_regular', display_name: 'Item Regular' });

  WRAP_TAG_ID = insertFreeformTag(db, '#wrapset', '#wrapset');
  SOLO_TAG_ID = insertFreeformTag(db, '#soloset', '#soloset');
  BY_REGULAR_TAG_ID = insertFreeformTag(db, '#by_item_regular', '#by_item_regular');

  insertPhoto(db, { id: ITEM_A, caption: 'wrap-item-a', uploaded_at: '2026-07-01T00:00:00.000Z' });
  insertPhoto(db, { id: ITEM_B, caption: 'wrap-item-b', uploaded_at: '2026-07-02T00:00:00.000Z', uploader: REGULAR_ID });
  insertPhoto(db, { id: ITEM_C, caption: 'wrap-item-c', uploaded_at: '2026-07-03T00:00:00.000Z' });
  for (const id of [ITEM_A, ITEM_B, ITEM_C]) attachTag(db, id, WRAP_TAG_ID, '#wrapset');
  // The middle item is attributed to a real member, exercising uploader gating.
  attachTag(db, ITEM_B, BY_REGULAR_TAG_ID, '#by_item_regular');

  // One-item set under its own tag.
  insertPhoto(db, { id: SOLO, caption: 'solo-item', uploaded_at: '2026-07-04T00:00:00.000Z' });
  attachTag(db, SOLO, SOLO_TAG_ID, '#soloset');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/item/:mediaId — tag-query context', () => {
  it('wraps prev/next over the tag set and preserves the context in the pager hrefs', async () => {
    // Order C, B, A. First item C: prev wraps to A, next is B.
    const first = await request(createApp()).get(`/media/item/${ITEM_C}?tag=wrapset`);
    expect(first.status).toBe(200);
    expect(first.text).toContain('wrap-item-c');
    expect(first.text).toContain('rel="prev"');
    expect(first.text).toContain('rel="next"');
    // Handlebars escapes '=' to '&#x3D;' and '&' to '&amp;' in attribute values.
    expect(first.text).toContain(`href="/media/item/${ITEM_A}?tag&#x3D;wrapset"`); // prev wraps to last
    expect(first.text).toContain(`href="/media/item/${ITEM_B}?tag&#x3D;wrapset"`); // next

    // Last item A: prev is B, next wraps to first C.
    const last = await request(createApp()).get(`/media/item/${ITEM_A}?tag=wrapset`);
    expect(last.status).toBe(200);
    expect(last.text).toContain(`href="/media/item/${ITEM_B}?tag&#x3D;wrapset"`); // prev
    expect(last.text).toContain(`href="/media/item/${ITEM_C}?tag&#x3D;wrapset"`); // next wraps to first
  });

  it('back link returns to the browse results for the same query', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_B}?tag=wrapset`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/media/browse?tag&#x3D;wrapset"');
  });

  it('applies the sort selection to the ordered set and carries it in the hrefs', async () => {
    // upload_asc reverses the set to A, B, C. First item A: prev wraps to C, next is B.
    const res = await request(createApp()).get(`/media/item/${ITEM_A}?tag=wrapset&sort=upload_asc`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/media/item/${ITEM_C}?tag&#x3D;wrapset&amp;sort&#x3D;upload_asc"`); // prev wraps to last
    expect(res.text).toContain(`href="/media/item/${ITEM_B}?tag&#x3D;wrapset&amp;sort&#x3D;upload_asc"`); // next
  });

  it('hides the pager for a one-item set', async () => {
    const res = await request(createApp()).get(`/media/item/${SOLO}?tag=soloset`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('solo-item');
    expect(res.text).not.toContain('rel="prev"');
    expect(res.text).not.toContain('rel="next"');
  });

  it('shows the item title in the hero once (no duplicate heading or caption) and a position indicator', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_B}?tag=wrapset`);
    expect(res.status).toBe(200);
    // No collection here, so the hero IS the item's own title; it must not also
    // repeat as an above-media heading or a below-media caption.
    const hero = res.text.slice(
      res.text.search(/class="hero hero-sm[^"]*"/),
      res.text.indexOf('class="gallery-item-detail'),
    );
    expect(hero).toContain('wrap-item-b');
    expect(res.text).not.toContain('class="gallery-item-title"');
    expect(res.text).not.toContain('gallery-item-caption');
    // The set walks C, B, A (upload-desc), so ITEM_B is the second of three.
    expect(res.text).toContain('class="gallery-item-position"');
    expect(res.text).toContain('2 of 3');
  });

  it('resolves the item with the tag cap applied when over-many include tags are supplied', async () => {
    // Thirteen include tokens all carried by ITEM_C; the cap keeps twelve, and
    // the AND of those still matches the item, so it resolves without error.
    const db = openDb();
    const extras: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      const tagId = insertFreeformTag(db, `#capset${i}`, `#capset${i}`);
      attachTag(db, ITEM_C, tagId, `#capset${i}`);
      extras.push(`capset${i}`);
    }
    db.close();
    const query = extras.map((t) => `tag=${t}`).join('&');
    const res = await request(createApp()).get(`/media/item/${ITEM_C}?${query}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('wrap-item-c');
  });

  it('links the uploader attribution to the member gallery for an anonymous viewer, keeping the pager', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_B}?tag=wrapset`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Uploaded by');
    expect(res.text).toContain('Item Regular');
    // The name links to that member's public gallery, never the member-only profile.
    expect(res.text).toContain('href="/media/browse?tag&#x3D;by_item_regular"');
    expect(res.text).not.toMatch(/href="\/members\/item_regular"/);
    // The attribution-link change never touches the pager links.
    expect(res.text).toContain('rel="prev"');
    expect(res.text).toContain('rel="next"');
  });
});

describe('GET /media/item/:mediaId — single-item fallback', () => {
  it('shows the item with no pager and the default back link when no tag context resolves', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_C}?tag=does_not_exist`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('wrap-item-c');
    expect(res.text).not.toContain('rel="prev"');
    expect(res.text).not.toContain('rel="next"');
    // The unresolved token is preserved on the back link to the (empty) results.
    expect(res.text).toContain('href="/media/browse?tag&#x3D;does_not_exist"');
  });

  it('shows the item with no pager when no context is supplied at all', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_A}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('wrap-item-a');
    expect(res.text).not.toContain('rel="prev"');
  });

  it('honors a safe ?back= path in the single fallback', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_A}?back=%2Fmembers%2Fitem_regular%2Fgalleries`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/members/item_regular/galleries"');
  });

  it('ignores an unsafe ?back= value and falls back to browse', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_A}?back=https%3A%2F%2Fevil.example`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('evil.example');
    expect(res.text).toContain('href="/media/browse"');
  });

  it('returns 404 for an unknown media id', async () => {
    const res = await request(createApp()).get('/media/item/media_does_not_exist?tag=wrapset');
    expect(res.status).toBe(404);
  });
});

describe('GET /media/browse — tiles link to the standalone viewer', () => {
  it('links each grid tile to /media/item carrying the browse query, not a raw file', async () => {
    const res = await request(createApp()).get('/media/browse?tag=wrapset');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/media/item/${ITEM_C}?tag&#x3D;wrapset"`);
    const gridSlice = res.text.slice(res.text.indexOf('gallery-grid'));
    expect(gridSlice).not.toContain('target="_blank"');
    expect(gridSlice).not.toContain('-display.jpg');
  });
});
