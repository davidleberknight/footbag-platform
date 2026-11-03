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
  insertEvent,
  insertTag,
  insertMediaItem,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3073');

let createApp: Awaited<ReturnType<typeof importApp>>;

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

  attachMediaTag(db, m1, tagFreestyle);
  attachMediaTag(db, m2, tagFreestyle);
  attachMediaTag(db, m1, tagTrick);
  attachMediaTag(db, m1, tagBy);
  attachMediaTag(db, m2, tagBy);

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

  // A public event found by a word of its name; a draft one that must never be
  // offered; and a member whose name holds the same word, whom the public
  // endpoint must never return.
  insertEvent(db, {
    id: 'event-suggest-worlds',
    title: 'World Footbag Championships',
    start_date: '2026-07-20',
    end_date: '2026-07-26',
    hashtag_tag_id: insertTag(db, { id: 'tag-event-worlds', tag_normalized: '#event_2026_worlds', tag_display: '#event_2026_worlds' }),
  });
  insertEvent(db, {
    id: 'event-suggest-draft',
    title: 'Secret World Draft Meet',
    status: 'draft',
    hashtag_tag_id: insertTag(db, { id: 'tag-event-draft', tag_normalized: '#event_2026_secret_draft', tag_display: '#event_2026_secret_draft' }),
  });
  insertMember(db, { id: 'member-suggest-world', slug: 'world_wanderer', display_name: 'World Wanderer' });

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
    // Defect caught: only the #pixie-prefixed tag surfaces. The ontology
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

describe('GET /tags/suggest — words of event and club names', () => {
  // Defect caught: typing a word of an event's name offers nothing, because
  // only the start of a hashtag is matched, or the event is not named.
  it('offers a public event\'s hashtag for a word of its name, with its kind and name', async () => {
    const res = await request(createApp()).get('/tags/suggest?q=world&entry=1');
    expect(res.status).toBe(200);
    const hit = res.body.find((s: { normalized: string }) => s.normalized === '#event_2026_worlds');
    expect(hit).toMatchObject({ kind: 'event', name: 'World Footbag Championships' });
  });

  // Defect caught: a draft event, or a member, leaks through the public
  // endpoint by a word of their name.
  it('never offers a draft event or a member', async () => {
    const res = await request(createApp()).get('/tags/suggest?q=world');
    const normalized = res.body.map((s: { normalized: string }) => s.normalized);
    expect(normalized).toContain('#event_2026_worlds');
    expect(normalized).not.toContain('#event_2026_secret_draft');
    expect(JSON.stringify(res.body)).not.toContain('Wanderer');
    expect(JSON.stringify(res.body)).not.toContain('world_wanderer');
  });

  // Defect caught: a freeform hashtag that names an event in other words gets
  // no offer of the event's standard hashtag.
  it('offers the standard hashtag a freeform one most likely meant', async () => {
    const res = await request(createApp()).get('/tags/suggest?didYouMean=%232026_worlds');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ normalized: '#event_2026_worlds', kind: 'event' })]);
    const none = await request(createApp()).get('/tags/suggest?didYouMean=%23event_2026_worlds');
    expect(none.body).toEqual([]);
    const unrelated = await request(createApp()).get('/tags/suggest?didYouMean=%23sunny_beach');
    expect(unrelated.body).toEqual([]);
  });

  // Defect caught: a generic word that only appears in an event's name, or a
  // piece of a word, is offered that event's hashtag, pushing a member to swap
  // a correct hashtag for a wrong standard one.
  it('offers nothing for a single generic word of a name, or for part of a word', async () => {
    const generic = await request(createApp()).get('/tags/suggest?didYouMean=%23footbag');
    expect(generic.body).toEqual([]);
    const partial = await request(createApp()).get('/tags/suggest?didYouMean=%23wor');
    expect(partial.body).toEqual([]);
  });
});
