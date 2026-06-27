/**
 * GET /tags/suggest -- tag autocomplete endpoint.
 *
 * Returns JSON array of tag suggestions matching a prefix, ordered by
 * popularity. Public (no auth required).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertMediaItem,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3073');
const TS = '2025-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function insertMediaTag(db: import('better-sqlite3').Database, id: string, mediaId: string, tagId: string, tagDisplay: string): void {
  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run(id, TS, TS, mediaId, tagId, tagDisplay);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const memberA = insertMember(db, {
    id: 'member-suggest-a',
    slug: 'suggest_a',
    login_email: 'suggest-a@example.com',
    display_name: 'Suggest A',
  });
  const memberB = insertMember(db, {
    id: 'member-suggest-b',
    slug: 'suggest_b',
    login_email: 'suggest-b@example.com',
    display_name: 'Suggest B',
  });

  const tagFreestyle = insertTag(db, {
    id: 'tag-suggest-freestyle',
    tag_normalized: '#freestyle',
    tag_display: '#Freestyle',
  });
  const tagTrick = insertTag(db, {
    id: 'tag-suggest-trick',
    tag_normalized: '#trick',
    tag_display: '#Trick',
  });
  const tagBy = insertTag(db, {
    id: 'tag-suggest-by',
    tag_normalized: '#by_suggest_a',
    tag_display: '#by_suggest_a',
  });

  const m1 = insertMediaItem(db, { uploader_member_id: memberA });
  const m2 = insertMediaItem(db, { uploader_member_id: memberB });

  insertMediaTag(db, 'mt-s-1', m1, tagFreestyle, '#Freestyle');
  insertMediaTag(db, 'mt-s-2', m2, tagFreestyle, '#Freestyle');
  insertMediaTag(db, 'mt-s-3', m1, tagTrick, '#Trick');
  insertMediaTag(db, 'mt-s-4', m1, tagBy, '#by_suggest_a');
  insertMediaTag(db, 'mt-s-5', m2, tagBy, '#by_suggest_a');

  // Ontology tags for the set/style expansion: a set/style term must surface its
  // set tag, concept tag, and the trick tags of tricks that carry it as a
  // modifier, none of which share the `#<term>` prefix.
  insertTag(db, { id: 'tag-set-pixie',     tag_normalized: '#set_pixie',          tag_display: '#set_pixie' });
  insertTag(db, { id: 'tag-concept-pixie', tag_normalized: '#concept_pixie_sets', tag_display: '#concept_pixie_sets' });
  insertTag(db, { id: 'tag-pixie-barrage', tag_normalized: '#pixie_barrage',      tag_display: '#pixie_barrage' });
  insertTag(db, { id: 'tag-pigbeater',     tag_normalized: '#pigbeater',          tag_display: '#pigbeater' });
  insertFreestyleTrick(db, { slug: 'pigbeater', canonical_name: 'pigbeater', adds: '4', base_trick: 'eggbeater', trick_family: 'legover', category: 'compound' });
  insertFreestyleTrickModifier(db, { slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set', notes: '' });
  insertFreestyleTrickModifierLink(db, 'pigbeater', 'pixie');

  db.close();
  createApp = await importApp();

  // Rebuild stats so popular tags are available
  const { hashtagDiscoveryService } = await import('../../src/services/hashtagDiscoveryService');
  hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /tags/suggest', () => {
  it('returns JSON with matching tags for a prefix', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=free');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].normalized).toBe('#freestyle');
  });

  it('returns popular tags when prefix is empty', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('returns popular tags when q param is absent', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  it('returns empty array for unmatched prefix', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=zzz_no_match_xyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array for oversized prefix', async () => {
    const app = createApp();
    const longQ = 'a'.repeat(101);
    const res = await request(app).get(`/tags/suggest?q=${longQ}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('excludes #by_* tags from results', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=by_');
    expect(res.status).toBe(200);
    const normalized = res.body.map((t: { normalized: string }) => t.normalized);
    expect(normalized.every((n: string) => !n.startsWith('#by_'))).toBe(true);
  });

  it('strips leading # from prefix before matching', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=%23free');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].normalized).toBe('#freestyle');
  });

  it('expands a set/style term to its set, concept, and modifier-carrying trick tags', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=pixie');
    expect(res.status).toBe(200);
    const normalized = res.body.map((t: { normalized: string }) => t.normalized);
    // Regression: previously only the #pixie-prefixed tag surfaced. The ontology
    // expansion must also surface the set, concept, and modifier-carrying tags
    // that do not share the #pixie prefix.
    expect(normalized).toContain('#pixie_barrage');     // #pixie_ prefix
    expect(normalized).toContain('#set_pixie');          // set tag (exact)
    expect(normalized).toContain('#concept_pixie_sets'); // concept tag (exact)
    expect(normalized).toContain('#pigbeater');          // pixie-modifier trick tag
  });

  it('does not over-expand a plain term with no set/concept/modifier matches', async () => {
    const app = createApp();
    const res = await request(app).get('/tags/suggest?q=free');
    expect(res.status).toBe(200);
    const normalized = res.body.map((t: { normalized: string }) => t.normalized);
    // "free" matches #freestyle by prefix; the ontology branches add nothing.
    expect(normalized).toContain('#freestyle');
    expect(normalized.every((n: string) => n.startsWith('#free'))).toBe(true);
  });
});
