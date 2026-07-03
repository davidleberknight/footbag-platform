/**
 * /freestyle/families/:slug — Family detail page.
 *
 * Pins:
 *   - 200 on curated first-class Family Parent slugs (whirl, osis, down)
 *   - 404 on unknown slugs, minor-lineage slugs, and raw trick_family
 *     labels (anti-enumeration; only first-class parents have a page)
 *   - Detail page renders: family name, tier label, shared-structure
 *     invariant, member-trick links, glossary-card overview fields
 *   - Optional sections (evolution narrative, observational notes) are
 *     omitted when no source entry exists, never rendered empty
 *   - The Down family is an umbrella: members group by variant (barfly /
 *     double-over-down / paradon / down-double-down); the dod raw label
 *     folds into the double-over-down variant; minor-tier variants have
 *     no page of their own but their tricks render on the down page
 *   - Branch parents (barfly) present as branches of Down with a link
 *   - Route ordering: the family template renders, not the trick shell
 *   - /freestyle/families (bare) redirects to the By-family browse
 *   - The sitemap lists every first-class family page and no minor lineage
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4021');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Every first-class Family Parent: the curated roster slugs whose detail
// page must render and appear in the sitemap.
const FIRST_CLASS_FAMILY_SLUGS = [
  'mirage', 'illusion', 'butterfly', 'legover', 'pickup', 'whirl', 'osis',
  'drifter', 'down', 'swirl', 'inside_stall', 'torque', 'blender',
  'double_leg_over', 'eggbeater', 'barfly', 'double_over_down',
];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Whirl family: anchor trick plus a one-operator compound, so the member
  // list spans two operator-rung bands.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    trick_family: 'whirl', category: 'core', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_whirl', canonical_name: 'paradox whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 1,
  });
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', modifier_name: 'paradox', add_bonus: 1,
    add_bonus_rotational: 1, modifier_type: 'body', notes: '',
  });
  insertFreestyleTrickModifierLink(db, 'paradox_whirl', 'paradox');

  // Down family: one trick per variant cell. fusion carries the raw 'dod'
  // label, which folds into the double-over-down variant at display time.
  insertFreestyleTrick(db, {
    slug: 'barfly', canonical_name: 'barfly', adds: '4',
    trick_family: 'barfly', category: 'core', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'fusion', canonical_name: 'fusion', adds: '5',
    trick_family: 'dod', category: 'compound', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradon', canonical_name: 'paradon', adds: '4',
    trick_family: 'paradon', category: 'compound', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'down_double_down', canonical_name: 'down double-down', adds: '4',
    trick_family: 'down_double_down', category: 'compound', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/families/:slug — family detail page', () => {
  it('returns 200 for a first-class family parent (whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Whirl Family');
  });

  it('returns 200 for a first-class family parent with no seeded members (osis)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Osis Family');
  });

  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/not-a-real-family');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a minor-lineage slug (eclipse)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/eclipse');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a raw trick_family label that is not a public family (rev_whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/rev_whirl');
    expect(res.status).toBe(404);
  });

  it('renders the tier label and the shared-structure invariant', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('Family Parent');
    expect(res.text).toContain('Shared terminal structure');
    expect(res.text).toContain('leggy in dex &gt; ss clipper');
  });

  it('renders member tricks as links to their trick-detail pages, banded by operator depth', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('href="/freestyle/tricks/whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_whirl"');
    // Two rung bands (Core + 1 operator) mean band headers render.
    expect(res.text).toContain('>Core<');
    expect(res.text).toContain('>1 operator<');
  });

  it('renders the glossary-card overview fields (canonical formula + anchor ADD)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('Canonical formula');
    expect(res.text).toContain('CLIP &gt; OP IN [DEX] &gt; OP CLIP [XBD] [DEL]');
    expect(res.text).toContain('3 ADD');
  });

  it('renders the evolution narrative for a family that has one (whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('How it branches');
  });

  it('omits the evolution section cleanly for a family without an entry (swirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/swirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('How it branches');
  });

  it('omits the member-tricks section when the dictionary holds no members yet', async () => {
    const res = await request(await createApp()).get('/freestyle/families/pickup');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Member tricks');
  });
});

describe('GET /freestyle/families/down — umbrella family groups members by variant', () => {
  it('returns 200 and renders all four variant groups', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="variant-barfly"');
    expect(res.text).toContain('id="variant-double_over_down"');
    expect(res.text).toContain('id="variant-paradon"');
    expect(res.text).toContain('id="variant-down_double_down"');
  });

  it('folds the raw dod label into the double-over-down variant', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    const dodStart = res.text.indexOf('id="variant-double_over_down"');
    const dodEnd   = res.text.indexOf('id="variant-paradon"');
    const dodBlock = res.text.slice(dodStart, dodEnd);
    expect(dodBlock).toContain('href="/freestyle/tricks/fusion"');
  });

  it('keeps minor-tier variant tricks reachable on the down page while their own page 404s', async () => {
    const downRes = await request(await createApp()).get('/freestyle/families/down');
    expect(downRes.text).toContain('href="/freestyle/tricks/paradon"');
    expect(downRes.text).toContain('href="/freestyle/tricks/down_double_down"');
    const paradonRes = await request(await createApp()).get('/freestyle/families/paradon');
    expect(paradonRes.status).toBe(404);
    const dddRes = await request(await createApp()).get('/freestyle/families/down_double_down');
    expect(dddRes.status).toBe(404);
  });

  it('links the first-class variants to their own family pages', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('href="/freestyle/families/barfly"');
    expect(res.text).toContain('href="/freestyle/families/double_over_down"');
  });

  it('barfly presents as a branch of the Down family, linking the down page', async () => {
    const res = await request(await createApp()).get('/freestyle/families/barfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Branch of the');
    expect(res.text).toContain('href="/freestyle/families/down"');
  });
});

describe('GET /freestyle/families/:slug — route ordering', () => {
  it('renders the family template, not the trick shell, for a family slug', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('data-family-slug="whirl"');
    expect(res.text).not.toContain('trick-shell');
  });

  it('leaves the trick-detail route intact for the same slug under /freestyle/tricks', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('trick-shell');
  });
});

describe('GET /freestyle/families — bare path redirects to the By-family browse', () => {
  it('redirects to /freestyle/tricks?view=family', async () => {
    const res = await request(await createApp()).get('/freestyle/families').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/freestyle/tricks?view=family');
  });
});

describe('sitemap — family-detail pages are enumerated', () => {
  it('lists every first-class family page', async () => {
    const res = await request(await createApp()).get('/sitemap.xml');
    expect(res.status).toBe(200);
    for (const slug of FIRST_CLASS_FAMILY_SLUGS) {
      expect(res.text, slug).toContain(`/freestyle/families/${slug}</loc>`);
    }
  });

  it('does not list minor lineages or the bare families redirect', async () => {
    const res = await request(await createApp()).get('/sitemap.xml');
    expect(res.text).not.toContain('/freestyle/families/paradon');
    expect(res.text).not.toContain('/freestyle/families/eclipse');
    expect(res.text).not.toMatch(/\/freestyle\/families<\/loc>/);
  });
});
