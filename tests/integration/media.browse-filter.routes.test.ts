/**
 * Integration tests for the editable tag filter on the /media/browse results
 * surface. The filter is one no-JS GET form with two chip-input fields (include
 * / exclude) prefilled with the active tags and progressively enhanced into
 * tokenizers with autocomplete; a locked ?context= tag renders read-only with a
 * hidden input; an "Apply hashtag filters" submit folds the whole state into one
 * canonical, shareable URL and redirects (PRG).
 *
 * Covers: include/exclude chip-input prefill, the distinct exclude field, the
 * help text, the locked-context chip + hidden input, and the Apply PRG redirect
 * (canonicalize, strip empties, normalize case/#).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3140');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'member-filter-system-001';
const REGULAR_ID = 'member-filter-regular-001';
const TS = '2026-04-29T12:00:00.000Z';

let BUTTERFLY_TAG_ID = '';
let SPIKE_TAG_ID = '';
let TUTORIAL_TAG_ID = '';
let BY_REGULAR_TAG_ID = '';

function insertFreeformTag(db: BetterSqlite3.Database, normalized: string, display: string): string {
  const id = `tag-filter-${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
  `).run(id, normalized, display, TS, TS);
  return id;
}

function insertPhoto(db: BetterSqlite3.Database, o: { id: string; uploader?: string; caption?: string; uploaded_at?: string }): string {
  const uploader = o.uploader ?? SYSTEM_ID;
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px, moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'photo', 0, ?, ?, ?, ?, 1000, 600, 'active')
  `).run(
    o.id, TS, TS, uploader, o.caption ?? null, o.uploaded_at ?? TS,
    `${uploader}/detached/${o.id}-thumb.jpg`, `${uploader}/detached/${o.id}-display.jpg`,
  );
  return o.id;
}

function attachTag(db: BetterSqlite3.Database, mediaId: string, tagId: string, tagDisplay: string): void {
  const id = `mtag_${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
    VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, ?)
  `).run(id, TS, TS, mediaId, tagId, tagDisplay);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'filter_system', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMember(db, { id: REGULAR_ID, slug: 'filter_regular', display_name: 'Filter Regular' });

  BUTTERFLY_TAG_ID  = insertFreeformTag(db, '#butterfly', '#butterfly');
  SPIKE_TAG_ID      = insertFreeformTag(db, '#spike', '#spike');
  TUTORIAL_TAG_ID   = insertFreeformTag(db, '#tutorial', '#tutorial');
  BY_REGULAR_TAG_ID = insertFreeformTag(db, '#by_filter_regular', '#by_filter_regular');

  // butterfly + spike
  const both = insertPhoto(db, { id: 'media_filter_both_001', caption: 'photo-both', uploaded_at: '2027-01-03T00:00:00.000Z' });
  attachTag(db, both, BUTTERFLY_TAG_ID, '#butterfly');
  attachTag(db, both, SPIKE_TAG_ID, '#spike');
  // butterfly + tutorial
  const tut = insertPhoto(db, { id: 'media_filter_tut_001', caption: 'photo-tut', uploaded_at: '2027-01-02T00:00:00.000Z' });
  attachTag(db, tut, BUTTERFLY_TAG_ID, '#butterfly');
  attachTag(db, tut, TUTORIAL_TAG_ID, '#tutorial');
  // butterfly only
  const butOnly = insertPhoto(db, { id: 'media_filter_but_001', caption: 'photo-butonly', uploaded_at: '2027-01-01T00:00:00.000Z' });
  attachTag(db, butOnly, BUTTERFLY_TAG_ID, '#butterfly');
  // butterfly + #by_filter_regular (the uploader marker co-occurs but must be
  // filtered out of the suggestion row).
  const byme = insertPhoto(db, { id: 'media_filter_byme_001', caption: 'photo-byme', uploader: REGULAR_ID, uploaded_at: '2027-01-04T00:00:00.000Z' });
  attachTag(db, byme, BUTTERFLY_TAG_ID, '#butterfly');
  attachTag(db, byme, BY_REGULAR_TAG_ID, '#by_filter_regular');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse — active filter chip inputs', () => {
  it('prefills the include chip input with the single active tag and shows Apply', async () => {
    const res = await request(createApp()).get('/media/browse?tag=butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="tag-filter-bar"');
    // The include field is a chip input (data-tag-chips) prefilled with the tag.
    expect(res.text).toContain('name="tag" value="butterfly" data-tag-chips');
    expect(res.text).toContain('Apply Hashtag Filters');
    expect(res.text).toContain('Show media with these hashtags');
  });

  it('prefills the include chip input with both active tags, space-separated', async () => {
    const res = await request(createApp()).get('/media/browse?tag=butterfly&tag=spike');
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="tag" value="butterfly spike" data-tag-chips');
  });

  it('prefills a distinct exclude chip input with the active exclude tag', async () => {
    const res = await request(createApp()).get('/media/browse?tag=butterfly&exclude=tutorial');
    expect(res.status).toBe(200);
    expect(res.text).toContain('tag-filter-field--exclude');
    expect(res.text).toContain('name="exclude" value="tutorial" data-tag-chips');
    expect(res.text).toContain('Hide media with these hashtags');
  });
});

describe('GET /media/browse — chip-input autocomplete + help', () => {
  it('renders both fields as data-tag-chips inputs with help text (autocomplete via /tags/suggest)', async () => {
    const res = await request(createApp()).get('/media/browse?tag=butterfly');
    expect(res.status).toBe(200);
    const bar = res.text.slice(res.text.indexOf('class="tag-filter-bar"'));
    expect(bar).toContain('id="tag-filter-include" name="tag"');
    expect(bar).toContain('id="tag-filter-exclude" name="exclude"');
    expect(bar).toContain('data-tag-chips');
    expect(bar).toContain('Type a hashtag and press Enter, remove one with ✕, or pick a suggestion below.');
  });
});

describe('GET /media/browse — context tags: topic editable, owner locked', () => {
  it('renders a non-#by_ context tag as an editable include, not a locked chip', async () => {
    const res = await request(createApp()).get('/media/browse?context=butterfly&tag=spike');
    expect(res.status).toBe(200);
    // butterfly (a topic context) is editable, merged into the include field.
    expect(res.text).toContain('name="tag" value="butterfly spike" data-tag-chips');
    expect(res.text).not.toContain('tag-filter-chip--locked">#butterfly');
  });

  it('keeps the owner-scoping #by_ context locked (read-only chip + hidden input)', async () => {
    const res = await request(createApp()).get('/media/browse?context=by_filter_regular&context=butterfly');
    expect(res.status).toBe(200);
    // #by_ stays locked; the topic context (butterfly) is editable.
    expect(res.text).toContain('class="tag-filter-chip tag-filter-chip--locked">#by_filter_regular');
    expect(res.text).toContain('name="context" value="by_filter_regular"');
    expect(res.text).toContain('name="tag" value="butterfly" data-tag-chips');
  });

  it('an Apply submit preserves the locked #by_ context in the canonical URL', async () => {
    const res = await request(createApp()).get('/media/browse?apply=1&context=by_filter_regular&tag=butterfly');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/media/browse?context=by_filter_regular&tag=butterfly');
  });
});

describe('GET /media/browse — Apply folds the submitted set into one canonical URL', () => {
  it('redirects an Apply submit to the canonical include URL', async () => {
    const res = await request(createApp()).get('/media/browse?apply=1&tag=butterfly&tag=spike');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/media/browse?tag=butterfly&tag=spike');
  });

  it('redirects an Apply submit carrying an exclude to the canonical URL', async () => {
    const res = await request(createApp()).get('/media/browse?apply=1&tag=butterfly&exclude=tutorial');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/media/browse?tag=butterfly&exclude=tutorial');
  });

  it('strips empty free-text fields from the canonical URL', async () => {
    const res = await request(createApp()).get('/media/browse?apply=1&tag=butterfly&tag=&exclude=');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/media/browse?tag=butterfly');
  });

  it('normalizes a typed tag (case + missing #) before folding it in', async () => {
    const res = await request(createApp()).get('/media/browse?apply=1&tag=butterfly&tag=%23Spike');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/media/browse?tag=butterfly&tag=spike');
  });
});
