/**
 * Modifier/operator routing.
 *
 * Modifiers and operators live in freestyle_tricks for decomposition and ADD
 * math, but they are not tricks. These tests pin the contract that:
 *   - only a trick shows a hashtag, its bare slug; a modifier page shows none;
 *   - whirling is a body modifier, not a set: its modifier page renders, and its
 *     retired set address is not found;
 *   - the trick-detail route redirects a modifier/operator row, or an operator
 *     slug with no trick row, to its operator page; a set with no active trick
 *     row goes to its set page, while dual-role sets (pixie/fairy) still render
 *     as tricks and sets held pending a curator ruling are left alone;
 *   - the modifier route sends a set-only slug to its set page;
 *   - trick search excludes modifier/operator rows but keeps sets and tricks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedOperatorsAndModifiers } from '../fixtures/stagedOperators';
import { seedStagedSets } from '../fixtures/stagedSets';
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedSets(db);

  // Modifier registry: two body modifiers (spinning, whirling) and two set
  // primitives (pixie, atomic). These drive the operators-index hashtags.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'Spinning', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'whirling', modifier_name: 'Whirling', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_name: 'Pixie',    add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'atomic',   modifier_name: 'Atomic',   add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });
  // A set primitive with no teaching page, so its modifier route stays a stub.
  insertFreestyleTrickModifier(db, { slug: 'slapping', modifier_name: 'Slapping', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });
  // Operators with no trick row at all (backside, xdex), a ducking set that is
  // registered as a body modifier (zulu), a set-only modifier with no trick row
  // (railing), and sets whose only page is their set page (inactive rows).
  insertFreestyleTrickModifier(db, { slug: 'backside', modifier_name: 'backside', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'xdex',     modifier_name: 'xdex',     add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'zulu',     modifier_name: 'zulu',     add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'railing',  modifier_name: 'railing',  add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'pogo',     modifier_name: 'pogo',     add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'blazing',  modifier_name: 'blazing',  add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'shooting', modifier_name: 'shooting', add_bonus: 3, add_bonus_rotational: 3, modifier_type: 'set'  });

  // freestyle_tricks rows. A modifier-category row (spinning) for the redirect +
  // search exclusion; set-category rows (pixie dual-role, atomic retired from the
  // trick corpus as its built row is) for the trick route; a normal compound
  // trick for search inclusion.
  insertFreestyleTrick(db, { slug: 'spinning',          canonical_name: 'spinning',          category: 'modifier' });
  insertFreestyleTrick(db, { slug: 'pixie',             canonical_name: 'pixie',             category: 'set' });
  insertFreestyleTrick(db, { slug: 'atomic',            canonical_name: 'atomic',            category: 'set', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'pogo',              canonical_name: 'pogo',              category: 'set', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'blazing',           canonical_name: 'blazing',           category: 'set', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'shooting',          canonical_name: 'shooting',          category: 'set', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'slapping',          canonical_name: 'slapping',          category: 'set' });
  insertFreestyleTrick(db, { slug: 'spinning-butterfly', canonical_name: 'spinning butterfly', category: 'compound', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly' });
  // A compound carrying a body modifier and a set-only modifier, for the
  // Structural Facts modifier links.
  insertFreestyleTrick(db, { slug: 'railing_spin_test', canonical_name: 'railing spin test', category: 'compound', adds: '5', base_trick: 'butterfly' });
  insertFreestyleTrickModifierLink(db, 'railing_spin_test', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'railing_spin_test', 'railing', 2);

  // The operators and the placed modifiers the pages link, as the rebuild seeds them.
  seedStagedOperatorsAndModifiers(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/modifier/:slug — modifier pages', () => {
  // Defect caught: a modifier page shows a hashtag, as if a modifier had media
  // of its own the way a trick does.
  it('renders a modifier stub with no hashtag (slapping, a set with no teaching page)', async () => {
    const res = await page('/freestyle/modifier/slapping');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/#(set_|operator_)?slapping\b/);
  });

  it('renders whirling as a body modifier page, not as a set', async () => {
    // Defect caught: the whirling modifier page sending readers to a set that
    // no longer exists.
    const res = await page('/freestyle/modifier/whirling');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('href="/freestyle/sets/whirling"');
  });

  it('gives the retired Whirling set address the standard not-found page; whirling lives on its modifier page', async () => {
    // Whirling is a body modifier, not a set, and before launch a retired
    // address of this site is not redirected anywhere.
    const res = await page('/freestyle/sets/whirling');
    expect(res.status).toBe(404);
  });
});

describe('GET /freestyle/tricks/:slug — modifier/operator redirect', () => {
  it('redirects a modifier-category row to its operator page (301)', async () => {
    const res = await page('/freestyle/tricks/spinning');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/modifier/spinning');
  });

  it('does NOT redirect a set primitive — pixie still renders as a trick (dual-role)', async () => {
    const res = await page('/freestyle/tricks/pixie');
    expect(res.status).toBe(200);
    // An active trick shows its bare trick tag.
    expect(res.text).toContain('#pixie');
  });

  // Defect caught: a set that left the trick corpus (no active trick row)
  // dead-ends in a 404 at its old trick URL instead of reaching its set page.
  it('permanently redirects a set with no active trick row to its set page', async () => {
    const res = await page('/freestyle/tricks/atomic');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/atomic');
  });

  // Defect caught: a set-only slug with no trick row at all 404s at its trick URL,
  // or reaches its set page only through a second redirect hop.
  it('sends a set-only slug with no trick row to its set page in one hop', async () => {
    const res = await page('/freestyle/tricks/railing');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/railing');
  });

  // Defect caught: an operator slug at the trick URL 404s even though its
  // modifier page renders.
  it('redirects an operator slug with no trick row to its modifier page', async () => {
    for (const slug of ['backside', 'xdex']) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(301);
      expect(res.headers['location'], slug).toBe(`/freestyle/modifier/${slug}`);
    }
  });

  // Defect caught: a ducking set registered as a body modifier is sent to a set
  // page, losing the modifier page that teaches it.
  it('sends a set that is also a body modifier to its modifier page', async () => {
    const res = await page('/freestyle/tricks/zulu');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/modifier/zulu');
  });

  // Defect caught: blazing, pogo or shooting keeping a trick page or a modifier
  // stub beside the set page that is its one home.
  it.each(['blazing', 'pogo', 'shooting'])('sends %s from both old addresses to its set page', async (slug) => {
    const trick = await page(`/freestyle/tricks/${slug}`);
    expect(trick.status).toBe(301);
    expect(trick.headers['location']).toBe(`/freestyle/sets/${slug}`);
    const modifier = await page(`/freestyle/modifier/${slug}`);
    expect(modifier.status).toBe(301);
    expect(modifier.headers['location']).toBe(`/freestyle/sets/${slug}`);
  });
});

describe('GET /freestyle/tricks/:slug — Structural Facts modifier links', () => {
  // Defect caught: a modifier link points at /freestyle/modifier/<slug> for a
  // set-only modifier, so every click hops through a redirect.
  it('links each modifier to the page its route settles on', async () => {
    const res = await page('/freestyle/tricks/railing_spin_test');
    expect(res.status).toBe(200);
    const start = res.text.indexOf('trick-structural-facts-list');
    const facts = res.text.slice(start, res.text.indexOf('</dl>', start));
    expect(facts).toContain('href="/freestyle/modifier/spinning"');
    expect(facts).toContain('href="/freestyle/sets/railing"');
    expect(facts).not.toContain('/freestyle/modifier/railing');
  });
});

describe('GET /freestyle/modifier/:slug — set-only slugs live on their set page', () => {
  // Defect caught: a set-only slug keeps a modifier stub, so the launch is taught
  // in two places and the modifier URL competes with the set page.
  it('permanently redirects a set-only slug to its set page', async () => {
    const res = await page('/freestyle/modifier/railing');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/railing');
  });

  // Also catches: the stub heading shows the registry's lowercase modifier_name
  // ("zulu") where page chrome takes Title Case.
  it('keeps the modifier page for a ducking set registered as a body modifier, titled in Title Case', async () => {
    const res = await page('/freestyle/modifier/zulu');
    expect(res.status).toBe(200);
    const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    expect(h1.trim()).toBe('Zulu');
  });
});

describe('GET /freestyle/search — excludes modifier/operator rows', () => {
  it('returns tricks but not modifier rows', async () => {
    const res = await page('/freestyle/search?q=spin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/tricks/spinning-butterfly');
    // The modifier-category "spinning" row must not appear as a search result.
    expect(res.text).not.toContain('/freestyle/tricks/spinning"');
  });

  it('keeps set primitives in search (pixie is a dual-role trick)', async () => {
    const res = await page('/freestyle/search?q=pixie');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/tricks/pixie');
  });
});
