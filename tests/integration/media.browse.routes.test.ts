/**
 * Integration tests for the on-the-fly tag browse + temp gallery surface
 * at GET /media/browse. The route renders two modes from a single
 * template (browse form when no resolved criteria; results pane when
 * at least one ?tag= token resolves to a `tags` row). No member_galleries
 * row is created and the URL is not registered as a named-gallery
 * bookmark; criteria/exclude tokens flow purely through the query
 * string (?tag=, ?exclude=, ?page=).
 *
 * Covers: form render, tag-AND results, exclude semantics, normalization
 * (case + leading '#'), repeated and whitespace-joined arg forms,
 * de-duplication, include-wins-over-exclude, unresolved-token hint,
 * pagination href preservation, item-chip linkification, hero `#by_*`
 * lift, route ordering precedence over /media/:galleryId, HTML escape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3128');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'member-browse-system-001';
const REGULAR_ID = 'member-browse-regular-001';
const TS = '2026-04-29T12:00:00.000Z';

let BUTTERFLY_TAG_ID = '';
let SPIKE_TAG_ID = '';
let TUTORIAL_TAG_ID = '';
let MIXED_CASE_TAG_ID = '';
let BY_REGULAR_TAG_ID = '';

function openDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

function insertFreeformTag(db: BetterSqlite3.Database, normalized: string, display: string): string {
  const id = `tag-browse-${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
  `).run(id, normalized, display, TS, TS);
  return id;
}

function insertPhoto(
  db: BetterSqlite3.Database,
  o: { id: string; uploader?: string; caption?: string; uploaded_at?: string; is_avatar?: 0 | 1; moderation?: 'active' | 'removed_by_admin' },
): string {
  const uploader = o.uploader ?? SYSTEM_ID;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'photo', ?, ?, ?,
              ?, ?, 1000, 600,
              ?)
  `).run(
    o.id, TS, TS,
    uploader, o.is_avatar ?? 0, o.caption ?? null,
    o.uploaded_at ?? TS,
    `${uploader}/detached/${o.id}-thumb.jpg`,
    `${uploader}/detached/${o.id}-display.jpg`,
    o.moderation ?? 'active',
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
  insertMember(db, { id: SYSTEM_ID,  slug: 'browse_system',  is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMember(db, { id: REGULAR_ID, slug: 'browse_regular', display_name: 'Browse Regular' });

  BUTTERFLY_TAG_ID  = insertFreeformTag(db, '#butterfly', '#butterfly');
  SPIKE_TAG_ID      = insertFreeformTag(db, '#spike',     '#spike');
  TUTORIAL_TAG_ID   = insertFreeformTag(db, '#tutorial',  '#tutorial');
  MIXED_CASE_TAG_ID = insertFreeformTag(db, '#mixedcase', '#MixedCase');
  BY_REGULAR_TAG_ID = insertFreeformTag(db, '#by_browse_regular', '#by_browse_regular');

  // Item carrying butterfly + spike (matches AND-of-both queries).
  const both = insertPhoto(db, { id: 'media_browse_both_001', caption: 'photo-both-marker', uploaded_at: '2027-01-03T00:00:00.000Z' });
  attachTag(db, both, BUTTERFLY_TAG_ID, '#butterfly');
  attachTag(db, both, SPIKE_TAG_ID,     '#spike');

  // Item carrying butterfly + tutorial (drops out when ?exclude=tutorial).
  const tut = insertPhoto(db, { id: 'media_browse_tut_001', caption: 'photo-tut-marker', uploaded_at: '2027-01-02T00:00:00.000Z' });
  attachTag(db, tut, BUTTERFLY_TAG_ID, '#butterfly');
  attachTag(db, tut, TUTORIAL_TAG_ID,  '#tutorial');

  // Item carrying butterfly only.
  const butOnly = insertPhoto(db, { id: 'media_browse_but_001', caption: 'photo-butonly-marker', uploaded_at: '2027-01-01T00:00:00.000Z' });
  attachTag(db, butOnly, BUTTERFLY_TAG_ID, '#butterfly');

  // Item carrying spike only.
  const spOnly = insertPhoto(db, { id: 'media_browse_sp_001', caption: 'photo-sponly-marker', uploaded_at: '2026-12-31T00:00:00.000Z' });
  attachTag(db, spOnly, SPIKE_TAG_ID, '#spike');

  // Mixed-case display: tag_display = '#MixedCase', tag_normalized = '#mixedcase'.
  const mc = insertPhoto(db, { id: 'media_browse_mc_001', caption: 'photo-mc-marker', uploaded_at: '2026-12-30T00:00:00.000Z' });
  attachTag(db, mc, MIXED_CASE_TAG_ID, '#MixedCase');

  // is_avatar=1 row that also carries butterfly — must be excluded from results.
  const av = insertPhoto(db, { id: 'media_browse_avatar_001', caption: 'photo-avatar-marker', is_avatar: 1, uploaded_at: '2026-12-29T00:00:00.000Z' });
  attachTag(db, av, BUTTERFLY_TAG_ID, '#butterfly');

  // moderation_status=removed_by_admin row carrying butterfly — also excluded.
  const rm = insertPhoto(db, { id: 'media_browse_rm_001', caption: 'photo-removed-marker', moderation: 'removed_by_admin', uploaded_at: '2026-12-28T00:00:00.000Z' });
  attachTag(db, rm, BUTTERFLY_TAG_ID, '#butterfly');

  // Item tagged #by_browse_regular — exercises the hero byMember lift.
  const byMem = insertPhoto(db, { id: 'media_browse_byme_001', caption: 'photo-by-marker', uploader: REGULAR_ID, uploaded_at: '2027-01-04T00:00:00.000Z' });
  attachTag(db, byMem, BY_REGULAR_TAG_ID, '#by_browse_regular');
  attachTag(db, byMem, BUTTERFLY_TAG_ID,  '#butterfly');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse — browse mode (no criteria)', () => {
  it('renders the browse form with empty values when no args are supplied', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Browse Media');
    expect(res.text).toContain('action="/media/browse"');
    expect(res.text).toContain('name="tag"');
    expect(res.text).toContain('name="exclude"');
    expect(res.text).not.toContain('class="gallery-grid"');
    expect(res.text).not.toContain('class="gallery-pagination"');
  });

  it('echoes unresolved tokens with a "no media found" hint and stays in browse mode', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=does_not_exist_xyz');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/No media found for:[\s\S]*#does_not_exist_xyz/);
    expect(res.text).not.toContain('class="gallery-grid"');
    // Form retains the submitted token (without leading #) so the user
    // can edit it.
    expect(res.text).toContain('value="does_not_exist_xyz"');
  });

  it('drops empty / bare-# tokens silently, no crash', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=&tag=%23');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('No media found for:');
    expect(res.text).not.toContain('class="gallery-grid"');
  });

  it('takes precedence over /media/:galleryId for the literal "browse" segment', async () => {
    // /media/browse must NOT be captured as :galleryId. If it were,
    // mediaService.getNamedGalleryPage would return 404 ("gallery
    // browse not found"). 200 with the browse form proves ordering.
    const app = createApp();
    const res = await request(app).get('/media/browse');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Browse Media');
  });
});

describe('GET /media/browse — results mode', () => {
  it('renders matching items for a single tag', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="gallery-grid"');
    expect(res.text).toContain('photo-both-marker');
    expect(res.text).toContain('photo-tut-marker');
    expect(res.text).toContain('photo-butonly-marker');
    expect(res.text).not.toContain('photo-sponly-marker');
    // Excluded by query rule (is_avatar=1 / moderation removed).
    expect(res.text).not.toContain('photo-avatar-marker');
    expect(res.text).not.toContain('photo-removed-marker');
  });

  it('hides the filter form and shows a back-to-browse link in results mode', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="curator-edit-form"');
    expect(res.text).not.toContain('name="exclude"');
    expect(res.text).toContain('href="/media/browse"');
    expect(res.text).toContain('Browse all media');
  });

  it('AND-matches multiple ?tag= criteria (repeated arg form)', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly&tag=spike');
    expect(res.status).toBe(200);
    expect(res.text).toContain('photo-both-marker');
    expect(res.text).not.toContain('photo-butonly-marker');
    expect(res.text).not.toContain('photo-sponly-marker');
    expect(res.text).not.toContain('photo-tut-marker');
  });

  it('accepts whitespace-joined single-string ?tag= form (form-submit shape)', async () => {
    // form input "butterfly spike" → ?tag=butterfly+spike (single string).
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly+spike');
    expect(res.status).toBe(200);
    expect(res.text).toContain('photo-both-marker');
    expect(res.text).not.toContain('photo-butonly-marker');
  });

  it('honors ?exclude= to filter out items carrying any excluded tag', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly&exclude=tutorial');
    expect(res.status).toBe(200);
    expect(res.text).toContain('photo-both-marker');
    expect(res.text).toContain('photo-butonly-marker');
    expect(res.text).not.toContain('photo-tut-marker');
  });

  it('de-duplicates repeated identical tokens (?tag=butterfly&tag=butterfly)', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly&tag=butterfly');
    expect(res.status).toBe(200);
    // Without dedup the COUNT(DISTINCT tag_id) HAVING N=2 would match
    // zero items even though butterfly DOES match. Asserting butterfly
    // items render proves dedup happened.
    expect(res.text).toContain('photo-butonly-marker');
  });

  it('gives include-wins precedence over exclude when the same token appears in both', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly&exclude=butterfly');
    expect(res.status).toBe(200);
    // The conflicting exclude is dropped → butterfly items still render.
    expect(res.text).toContain('photo-butonly-marker');
  });

  it('matches case-insensitively against tag_normalized (?tag=Butterfly → #butterfly)', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=Butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('photo-butonly-marker');
  });

  it('preserves original tag_display capitalization for chip text on items', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=mixedcase');
    expect(res.status).toBe(200);
    // Item has tag_display '#MixedCase'; chip body should show the
    // original casing, not the lowercased normalized form.
    const tile = res.text.match(/photo-mc-marker[\s\S]{0,2000}<\/li>/);
    expect(tile).toBeTruthy();
    expect(tile![0]).toContain('>#MixedCase<');
  });

  it('item chip on a result tile links back to /media/browse?tag=<normalized>', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly');
    expect(res.status).toBe(200);
    const tile = res.text.match(/photo-both-marker[\s\S]{0,2000}<\/li>/);
    expect(tile).toBeTruthy();
    expect(tile![0]).toContain('href="/media/browse?tag&#x3D;butterfly"');
    expect(tile![0]).toContain('href="/media/browse?tag&#x3D;spike"');
  });

  it('lifts a `#by_<slug>` criterion into the hero byMember chip', async () => {
    const app = createApp();
    const res = await request(app).get('/media/browse?tag=by_browse_regular');
    expect(res.status).toBe(200);
    // Hero subtitle reads "Showing 1 item by Browse Regular"
    expect(res.text).toMatch(/Showing 1 item by[\s\S]{0,500}Browse Regular/);
    // The raw #by_<slug> token is NOT echoed in the "tagged:" list.
    const heroOpen = res.text.search(/class="hero hero-sm[^"]*"/);
    expect(heroOpen).toBeGreaterThan(-1);
    const heroClose = res.text.indexOf('</div>\n</div>', heroOpen);
    const heroBlock = res.text.slice(heroOpen, heroClose);
    expect(heroBlock).not.toContain('#by_browse_regular');
  });

  it('escapes HTML in item captions', async () => {
    const db = openDb();
    const id = insertPhoto(db, { id: 'media_browse_xss_001', caption: '<script>alert("xss-browse-marker")</script>', uploaded_at: '2027-02-01T00:00:00.000Z' });
    attachTag(db, id, BUTTERFLY_TAG_ID, '#butterfly');
    db.close();

    const app = createApp();
    const res = await request(app).get('/media/browse?tag=butterfly');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert("xss-browse-marker")</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });
});

describe('GET /media/browse — pagination', () => {
  it('preserves ?tag and ?exclude in the pagination prev/next hrefs', async () => {
    const db = openDb();
    // Bulk-insert > PAGE_SIZE (24) items tagged butterfly so a page-2
    // link appears. Use distinct tag rows that include butterfly so the
    // test doesn't pollute other test files' fixtures.
    for (let i = 0; i < 30; i++) {
      const id = `media_browse_bulk_${String(i).padStart(2, '0')}`;
      insertPhoto(db, { id, caption: `bulk-${i}`, uploaded_at: `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` });
      attachTag(db, id, BUTTERFLY_TAG_ID, '#butterfly');
    }
    db.close();

    const app = createApp();
    const res1 = await request(app).get('/media/browse?tag=butterfly&exclude=tutorial');
    expect(res1.status).toBe(200);
    expect(res1.text).toContain('class="gallery-pagination"');
    // Next link must carry both ?tag and ?exclude in canonical
    // repeated-arg form, plus the &page=2 suffix.
    expect(res1.text).toContain('href="/media/browse?tag&#x3D;butterfly&amp;exclude&#x3D;tutorial&amp;page&#x3D;2"');

    const res2 = await request(app).get('/media/browse?tag=butterfly&exclude=tutorial&page=2');
    expect(res2.status).toBe(200);
    // Prev link drops &page=N when going back to page 1.
    expect(res2.text).toContain('href="/media/browse?tag&#x3D;butterfly&amp;exclude&#x3D;tutorial"');
  });

  it('clamps invalid ?page values to 1 (no crash)', async () => {
    const app = createApp();
    for (const bad of ['abc', '-5', '0', '0.5']) {
      const res = await request(app).get(`/media/browse?tag=butterfly&page=${bad}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('class="gallery-grid"');
    }
  });
});
