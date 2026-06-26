/**
 * GET /media/browse — two localized media patches.
 *
 * 1. Search expansion: a handful of bare style/set names also match their
 *    `#set_*` gallery tag, so searching "pixie" surfaces the pixie set galleries
 *    without exposing the ontology. Non-expanded searches are unchanged.
 * 2. Set-video linking: a media tile carrying a `#concept_<slug>_sets` tag links
 *    to that Set Encyclopedia page, resolving set aliases to the canonical set.
 *
 * Neither patch retags media, renames hashtags, or changes displayed hashtags.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3141');
let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_ID = 'media-exp-system-001';
const TS = '2026-04-29T12:00:00.000Z';

function insertTagRow(db: BetterSqlite3.Database, normalized: string): string {
  const id = `tag-exp-${Math.random().toString(36).slice(2, 12)}`;
  db.prepare(`
    INSERT INTO tags (id, tag_normalized, tag_display, is_standard, standard_type, created_at, created_by, updated_at, updated_by, version)
    VALUES (?, ?, ?, 0, NULL, ?, 'admin-act-as', ?, 'admin-act-as', 1)
  `).run(id, normalized, normalized, TS, TS);
  return id;
}

function insertPhoto(db: BetterSqlite3.Database, id: string, caption: string, uploadedAt: string): string {
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px, moderation_status
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, 'photo', 0, ?, ?, ?, ?, 1000, 600, 'active')
  `).run(id, TS, TS, SYSTEM_ID, caption, uploadedAt, `${SYSTEM_ID}/d/${id}-t.jpg`, `${SYSTEM_ID}/d/${id}-d.jpg`);
  return id;
}

function attach(db: BetterSqlite3.Database, mediaId: string, tagId: string, display: string): void {
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
    VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1, ?, ?, ?)
  `).run(`mtag_${Math.random().toString(36).slice(2, 12)}`, TS, TS, mediaId, tagId, display);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'media_exp_system', is_system: 1, display_name: 'Footbag Hacky' });

  const seed = (norm: string, mediaId: string, caption: string, when: string) => {
    const tagId = insertTagRow(db, norm);
    const m = insertPhoto(db, mediaId, caption, when);
    attach(db, m, tagId, norm);
  };

  // Set galleries (only the `#set_*` tag; no bare trick tag), for search expansion.
  seed('#set_pixie',     'm_set_pixie',     'pixie-set-item',     '2027-01-01T00:00:00.000Z');
  seed('#set_atomic',    'm_set_atomic',    'atomic-set-item',    '2027-01-02T00:00:00.000Z');
  seed('#set_fairy',     'm_set_fairy',     'fairy-set-item',     '2027-01-03T00:00:00.000Z');
  seed('#set_barraging', 'm_set_barraging', 'barraging-set-item', '2027-01-04T00:00:00.000Z');
  // A pixie compound trick video (`#pixie_*`), matched via the token prefix.
  seed('#pixie_barrage', 'm_pixie_barrage', 'pixie-barrage-trick', '2027-01-06T00:00:00.000Z');
  // Substring-but-not-token: `#pixieish` starts with "pixie" but is NOT
  // `#pixie_*`, so the token prefix must NOT match it.
  seed('#pixieish',      'm_pixieish',      'pixieish-noise',      '2027-01-07T00:00:00.000Z');
  // Unrelated tag, for the "non-expanded search is unchanged" case.
  seed('#spike',         'm_spike',         'spike-item',         '2027-01-05T00:00:00.000Z');

  // Set-concept tutorial tiles, for the set-video cross-link.
  seed('#concept_pixie_sets',       'm_c_pixie',  'pixie-set-list-video',       '2027-02-01T00:00:00.000Z');
  seed('#concept_atomic_sets',      'm_c_atomic', 'atomic-set-list-video',      '2027-02-02T00:00:00.000Z');
  seed('#concept_illusioning_sets', 'm_c_illus',  'illusioning-set-list-video', '2027-02-03T00:00:00.000Z');
  // A non-set concept tag (no `_sets` suffix): must not render a set link.
  seed('#concept_records',          'm_c_recs',   'records-concept-video',      '2027-02-04T00:00:00.000Z');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse — search expansion', () => {
  it('searching "pixie" token-matches #pixie_*, #set_pixie, and #concept_pixie_sets', async () => {
    const res = await request(createApp()).get('/media/browse?tag=pixie');
    expect(res.status).toBe(200);
    expect(res.text).toContain('pixie-barrage-trick');   // #pixie_barrage compound
    expect(res.text).toContain('pixie-set-item');        // #set_pixie
    expect(res.text).toContain('pixie-set-list-video');  // #concept_pixie_sets
    // Token-bounded: a substring-only tag (#pixieish) must not be matched.
    expect(res.text).not.toContain('pixieish-noise');
    // And an unrelated item is never pulled in.
    expect(res.text).not.toContain('spike-item');
  });

  it('searching "set_pixie" still works (direct)', async () => {
    const res = await request(createApp()).get('/media/browse?tag=set_pixie');
    expect(res.text).toContain('pixie-set-item');
  });

  it('searching "atomic" returns #set_atomic', async () => {
    const res = await request(createApp()).get('/media/browse?tag=atomic');
    expect(res.text).toContain('atomic-set-item');
  });

  it('searching "fairy" returns #set_fairy', async () => {
    const res = await request(createApp()).get('/media/browse?tag=fairy');
    expect(res.text).toContain('fairy-set-item');
  });

  it('searching "furious" returns #set_barraging', async () => {
    const res = await request(createApp()).get('/media/browse?tag=furious');
    expect(res.text).toContain('barraging-set-item');
  });

  it('unrelated searches are unchanged', async () => {
    const res = await request(createApp()).get('/media/browse?tag=spike');
    expect(res.text).toContain('spike-item');
    expect(res.text).not.toContain('pixie-set-item');
    expect(res.text).not.toContain('atomic-set-item');
  });
});

describe('GET /media/browse — set-video cross-link', () => {
  it('a tile tagged #concept_pixie_sets links to /freestyle/sets/pixie', async () => {
    const res = await request(createApp()).get('/media/browse?tag=concept_pixie_sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/sets/pixie"');
    expect(res.text).toContain('Set: Pixie');
  });

  it('a tile tagged #concept_atomic_sets links to /freestyle/sets/atomic', async () => {
    const res = await request(createApp()).get('/media/browse?tag=concept_atomic_sets');
    expect(res.text).toContain('href="/freestyle/sets/atomic"');
  });

  it('#concept_illusioning_sets resolves to the canonical set /freestyle/sets/atomic', async () => {
    const res = await request(createApp()).get('/media/browse?tag=concept_illusioning_sets');
    expect(res.text).toContain('href="/freestyle/sets/atomic"');
  });

  it('a non-set concept tag renders no set link', async () => {
    const res = await request(createApp()).get('/media/browse?tag=concept_records');
    expect(res.text).toContain('records-concept-video');
    expect(res.text).not.toContain('gallery-tile-set-link');
    expect(res.text).not.toContain('/freestyle/sets/');
  });
});
