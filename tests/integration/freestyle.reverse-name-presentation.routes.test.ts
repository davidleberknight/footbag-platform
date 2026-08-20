/**
 * Reverse-name presentation consistency across the three direction-mirror pairs.
 *
 * Long-term contract pinned:
 *
 *   1. Where the folk name is canonical, the structural "Reverse X" reading is a
 *      PUBLICLY DISPLAYED alias, so a reader on the canonical page learns the
 *      other name: orbit shows "reverse around-the-world", illusion shows
 *      "reverse mirage". Canonical identity is unchanged on both.
 *
 *   2. Where the structural name is canonical, it is spelled in full: the
 *      rev_whirl row renders the heading "Reverse Whirl", and the community folk
 *      name "whip" is its displayed alias.
 *
 *   3. The rev_whirl SLUG is stable and independent of that display name. The
 *      canonical URL stays /freestyle/tricks/rev_whirl even though the name no
 *      longer folds back to it, so existing links and competition-record
 *      resolution survive the rename.
 *
 *   4. Every prior name still resolves: the folk and structural aliases redirect
 *      to their canonical trick rather than 404ing.
 *
 *   5. An alias that merely restates the canonical name is not presented back to
 *      the reader as an alternative name for itself.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('4071');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The three direction-mirror pairs. Structure, ADD, and family mirror the
  // live rows; only the naming/alias presentation is under test here.
  insertFreestyleTrick(db, {
    slug: 'around_the_world', canonical_name: 'around the world', adds: '2',
    base_trick: 'around_the_world', trick_family: 'around_the_world',
    category: 'dex', review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'orbit', canonical_name: 'orbit', adds: '2',
    trick_family: 'orbit', category: 'dex', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage',
    category: 'dex', review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'illusion', canonical_name: 'illusion', adds: '2',
    base_trick: 'illusion', trick_family: 'illusion',
    category: 'dex', review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl',
    category: 'dex', review_status: 'curated', is_active: 1,
  });
  // The structural name is canonical here, spelled in full, on the stable
  // abbreviated slug.
  insertFreestyleTrick(db, {
    slug: 'rev_whirl', canonical_name: 'reverse whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'rev_whirl',
    category: 'dex', review_status: 'curated', is_active: 1,
  });

  // Compounds built on the whirl mirror. Each spells the mirror out in full
  // while keeping the abbreviated slug it has always had, and each carries the
  // full-form spelling as a redirect alias from the archived duplicate row.
  insertFreestyleTrick(db, {
    slug: 'stepping_rev_whirl', canonical_name: 'stepping reverse whirl', adds: '4',
    base_trick: 'rev_whirl', trick_family: 'rev_whirl',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pixie_rev_whirl', canonical_name: 'pixie reverse whirl', adds: '4',
    base_trick: 'rev_whirl', trick_family: 'rev_whirl',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'stepping_reverse_whirl', 'stepping_rev_whirl', 'stepping reverse whirl', { alias_type: 'structural', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'pixie_reverse_whirl', 'pixie_rev_whirl', 'pixie reverse whirl', { alias_type: 'structural', alias_display: 0 });

  // Displayed aliases: the structural reading where the folk name is canonical,
  // the folk name where the structural name is canonical.
  insertFreestyleTrickAlias(db, 'reverse_around_the_world', 'orbit', 'reverse around-the-world', { alias_type: 'structural', alias_display: 1 });
  insertFreestyleTrickAlias(db, 'reverse_mirage', 'illusion', 'reverse mirage', { alias_type: 'common', alias_display: 1 });
  insertFreestyleTrickAlias(db, 'whip', 'rev_whirl', 'whip', { alias_type: 'common', alias_display: 1 });

  // Search-only aliases: resolvable, never rendered as an alternative name.
  insertFreestyleTrickAlias(db, 'reverse_atw', 'orbit', 'reverse atw', { alias_type: 'technical', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'reverse_whirl', 'rev_whirl', 'reverse whirl', { alias_type: 'structural', alias_display: 0 });

  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function page(url: string): Promise<string> {
  const res = await request(createApp()).get(url);
  expect(res.status).toBe(200);
  return res.text;
}

describe('Folk canonical keeps the structural reading as a displayed alias', () => {
  it('orbit presents "reverse around-the-world" to the reader', async () => {
    const html = await page('/freestyle/tricks/orbit');
    expect(html).toContain('reverse around-the-world');
  });

  it('orbit stays the canonical name of its own page', async () => {
    const html = await page('/freestyle/tricks/orbit');
    expect(html).toContain('<h1>Orbit</h1>');
  });

  it('illusion presents "reverse mirage" to the reader', async () => {
    const html = await page('/freestyle/tricks/illusion');
    expect(html).toContain('reverse mirage');
  });

  it('illusion stays the canonical name of its own page', async () => {
    const html = await page('/freestyle/tricks/illusion');
    expect(html).toContain('<h1>Illusion</h1>');
  });

  it('keeps the abbreviation aliases out of the reader-facing alias list', async () => {
    const html = await page('/freestyle/tricks/orbit');
    expect(html).not.toMatch(/<dd>[^<]*reverse atw[^<]*<\/dd>/);
  });
});

describe('Structural canonical is spelled in full and keeps the folk alias', () => {
  it('renders the heading "Reverse Whirl"', async () => {
    const html = await page('/freestyle/tricks/rev_whirl');
    expect(html).toContain('<h1>Reverse Whirl</h1>');
  });

  it('exposes "whip" as a displayed alias', async () => {
    const html = await page('/freestyle/tricks/rev_whirl');
    expect(html).toMatch(/<dd>[^<]*whip[^<]*<\/dd>/);
  });

  it('does not present the canonical name back as an alias of itself', async () => {
    const html = await page('/freestyle/tricks/rev_whirl');
    expect(html).not.toMatch(/<dd>[^<]*reverse whirl[^<]*<\/dd>/);
  });

  it('leaves the mirrored trick untouched', async () => {
    const html = await page('/freestyle/tricks/whirl');
    expect(html).toContain('<h1>Whirl</h1>');
  });
});

describe('Compounds spell the mirror out while keeping their abbreviated slugs', () => {
  it('renders the full form in the compound headings', async () => {
    expect(await page('/freestyle/tricks/stepping_rev_whirl')).toContain('<h1>Stepping Reverse Whirl</h1>');
    expect(await page('/freestyle/tricks/pixie_rev_whirl')).toContain('<h1>Pixie Reverse Whirl</h1>');
  });

  it('keeps the abbreviated slug as the canonical URL', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/stepping_rev_whirl');
    expect(res.status).toBe(200);
  });

  it('still redirects the full-form spelling to the abbreviated slug', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/stepping_reverse_whirl');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/stepping_rev_whirl');
  });

  it('lists the family in one spelling, root and members alike', async () => {
    const html = await page('/freestyle/tricks?family=rev_whirl');
    expect(html).toContain('reverse whirl');
    expect(html).toContain('stepping reverse whirl');
    expect(html).toContain('pixie reverse whirl');
    // No member still carries the abbreviated display form.
    expect(html).not.toMatch(/>[^<]*\brev whirl\b/i);
  });
});

describe('Stable URLs and alias resolution survive the rename', () => {
  it('keeps /freestyle/tricks/rev_whirl as the canonical URL', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/rev_whirl');
    expect(res.status).toBe(200);
  });

  it('resolves the folk name whip to the canonical trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whip');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/rev_whirl');
  });

  it('resolves the structural spelling reverse_whirl to the canonical trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/reverse_whirl');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/rev_whirl');
  });

  it('resolves reverse_around_the_world to orbit', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/reverse_around_the_world');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/orbit');
  });

  it('resolves reverse_mirage to illusion', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/reverse_mirage');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/illusion');
  });

  it('keeps the three canonical slugs reachable', async () => {
    for (const slug of ['orbit', 'illusion', 'rev_whirl']) {
      const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(200);
    }
  });
});
