/**
 * Role-aware hashtags + modifier/operator routing.
 *
 * Modifiers and operators live in freestyle_tricks for decomposition and ADD
 * math, but they are not tricks. These tests pin the contract that:
 *   - a concept's hashtag is rendered from its role, never blindly from its slug:
 *     a trick is a bare tag, a set is #set_, an operator is #operator_;
 *   - whirling is a body modifier, not a set: it reads #operator_whirling, its
 *     modifier page renders, and only its retired set URL redirects (to Blazing);
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
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

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
  // (railing), and a set held pending a curator ruling (pogo, inactive row).
  insertFreestyleTrickModifier(db, { slug: 'backside', modifier_name: 'backside', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'xdex',     modifier_name: 'xdex',     add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'zulu',     modifier_name: 'zulu',     add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'railing',  modifier_name: 'railing',  add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'pogo',     modifier_name: 'pogo',     add_bonus: 0, add_bonus_rotational: 0, modifier_type: 'set'  });

  // freestyle_tricks rows. A modifier-category row (spinning) for the redirect +
  // search exclusion; set-category rows (pixie dual-role, atomic retired from the
  // trick corpus as its built row is) for the trick route; a normal compound
  // trick for search inclusion.
  insertFreestyleTrick(db, { slug: 'spinning',          canonical_name: 'spinning',          category: 'modifier' });
  insertFreestyleTrick(db, { slug: 'pixie',             canonical_name: 'pixie',             category: 'set' });
  insertFreestyleTrick(db, { slug: 'atomic',            canonical_name: 'atomic',            category: 'set', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'pogo',              canonical_name: 'pogo',              category: 'set', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'slapping',          canonical_name: 'slapping',          category: 'set' });
  insertFreestyleTrick(db, { slug: 'spinning-butterfly', canonical_name: 'spinning butterfly', category: 'compound', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly' });
  // A compound carrying a body modifier and a set-only modifier, for the
  // Structural Facts modifier links.
  insertFreestyleTrick(db, { slug: 'railing_spin_test', canonical_name: 'railing spin test', category: 'compound', adds: '5', base_trick: 'butterfly' });
  insertFreestyleTrickModifierLink(db, 'railing_spin_test', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'railing_spin_test', 'railing', 2);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Slice one operator row's markup out of the flat operators-index HTML.
function operatorRow(html: string, slug: string): string {
  const start = html.indexOf(`id="operator-${slug}"`);
  if (start < 0) return '';
  const next = html.indexOf('id="operator-', start + 1);
  return html.slice(start, next < 0 ? start + 1200 : next);
}

describe('GET /freestyle/operators — role-aware hashtags', () => {
  it('renders a modifier as #operator_, never a bare trick tag', async () => {
    const res = await page('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(operatorRow(res.text, 'spinning')).toContain('#operator_spinning');
    expect(operatorRow(res.text, 'spinning')).not.toContain('>#spinning<');
  });

  it('does not list set primitives, so their #set_ hashtags are not on this page', async () => {
    const res = await page('/freestyle/operators');
    expect(res.text).not.toContain('#set_pixie');
    expect(res.text).not.toContain('#set_atomic');
  });
});

describe('GET /freestyle/modifier/:slug — stub hashtag', () => {
  it('renders the role-aware hashtag on a stub (slapping set → #set_slapping)', async () => {
    // slapping is a set with no authored teaching page, so its modifier route
    // still resolves to a data-driven stub (unlike pixie or atomic, which now
    // redirect to their set-encyclopedia pages).
    const res = await page('/freestyle/modifier/slapping');
    expect(res.status).toBe(200);
    expect(res.text).toContain('#set_slapping');
  });

  it('renders whirling as a body modifier with the operator hashtag, not as a set', async () => {
    // Defect caught: the whirling modifier page sending readers to a set that
    // no longer exists, or labelling a body modifier as a set.
    const res = await page('/freestyle/modifier/whirling');
    expect(res.status).toBe(200);
    expect(res.text).toContain('#operator_whirling');
    expect(res.text).not.toContain('#set_whirling');
  });

  it('redirects the retired Whirling set URL to Blazing, the uptime whirling set', async () => {
    const res = await page('/freestyle/sets/whirling');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/blazing');
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
    // On the trick surface, the dual-role concept shows its bare trick tag.
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

  // Defect caught: a set held pending a curator ruling is redirected anyway.
  it('leaves a set held pending a curator ruling unredirected', async () => {
    const trick = await page('/freestyle/tricks/pogo');
    expect(trick.status).toBe(404);
    const modifier = await page('/freestyle/modifier/pogo');
    expect(modifier.status).toBe(200);
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
    expect(h1).toMatch(/^Zulu <span class="hero-hashtag">/);
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
