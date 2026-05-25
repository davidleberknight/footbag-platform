/**
 * GET /freestyle/sets — Set Encyclopedia (2026-05-25).
 *
 * Standalone minimalist surface listing canonical sets as first-class
 * ontology objects. Distinct from:
 *   /freestyle/tricks?view=sets   — Trick Dictionary's Set Hub view
 *   /freestyle/compositional-sets — exploratory compositional-sets hub
 *   /freestyle/sets/:slug         — per-set detail pages
 *   /freestyle/sets/reference     — flat Holden reference table
 *
 * Curator UX contract: cards stay minimalist. Each card carries name +
 * hashtag + compact formula + one-sentence movement + one provenance
 * line + up to 3 quick-relation tags + a "View details →" link.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3159');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Priority sets the curator named in the slice. Each must render.
const PRIORITY_SETS = [
  'pixie', 'fairy', 'stepping', 'atomic', 'quantum', 'nuclear',
  'barraging', 'blurry', 'furious', 'surging', 'tapping',
] as const;

beforeAll(async () => {
  // The Set Encyclopedia reads from CANONICAL_SETS (content module),
  // not from freestyle_tricks. No trick seeding required for the page
  // itself — though we seed minimal rows so the detail-page link target
  // can resolve when assertions verify hrefs.
  createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/sets — route + envelope', () => {
  it('returns 200 and renders the Set Encyclopedia page', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="wrapper sets-encyclopedia"');
    expect(res.text).toContain('Set Encyclopedia');
  });

  it('no longer 301-redirects to /freestyle/tricks?view=sets', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(301);
  });
});

describe('GET /freestyle/sets — minimalist card contract', () => {
  it.each(PRIORITY_SETS.map(slug => [slug] as const))(
    '%s renders a card with name, hashtag, formula, compact movement, provenance, and detail link',
    async (slug) => {
      const res = await request(await createApp()).get('/freestyle/sets');
      // Card present
      expect(res.text).toContain(`id="enc-set-${slug}"`);
      // Detail link points at the per-set detail page (not in-page anchor)
      expect(res.text).toMatch(new RegExp(`<a class="sets-encyclopedia-card-detail-link" href="/freestyle/sets/${slug}">View details &rarr;</a>`));
      // Hashtag follows the set ontology pattern (#<slug>-set)
      expect(res.text).toContain(`#${slug}-set`);
    },
  );

  it('every set card has a compact-movement sentence + provenance line + formula block', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // Count cards by counting card detail-link occurrences (one per card)
    const detailLinkMatches = res.text.match(/sets-encyclopedia-card-detail-link/g) ?? [];
    const movementMatches   = res.text.match(/sets-encyclopedia-card-movement/g) ?? [];
    const provenanceMatches = res.text.match(/sets-encyclopedia-card-provenance/g) ?? [];
    const formulaMatches    = res.text.match(/sets-encyclopedia-card-formula/g) ?? [];
    // All four counts equal — every card has every required field.
    expect(detailLinkMatches.length).toBeGreaterThan(0);
    expect(movementMatches.length).toBe(detailLinkMatches.length);
    expect(provenanceMatches.length).toBe(detailLinkMatches.length);
    expect(formulaMatches.length).toBe(detailLinkMatches.length);
  });

  it('cards do NOT carry the verbose Set Hub fields (equivalences, source/audit footer with citation, alt-surfaces cross-link)', async () => {
    // The Encyclopedia is meant to be a LIGHTER surface than the Set Hub
    // at /freestyle/tricks?view=sets. The verbose fields belong on the
    // detail page, not the index. Specifically, the citation footer and
    // equivalence-readings <ul> from the Set Hub do not appear here.
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).not.toContain('set-card-citation');
    expect(res.text).not.toContain('set-card-equivalences');
    expect(res.text).not.toContain('sets-alt-surfaces-cross-link');
  });
});

describe('GET /freestyle/sets — cross-navigation', () => {
  it('renders the four cross-nav links disambiguating from sibling surfaces', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('class="sets-encyclopedia-cross-nav"');
    // `=` is HTML-escaped to `&#x3D;` in Handlebars output. Match the
    // path without the `=` to keep the regex stable.
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view/);
    expect(res.text).toMatch(/href="\/freestyle\/compositional-sets"/);
    expect(res.text).toMatch(/href="\/freestyle\/operators"/);
    expect(res.text).toMatch(/href="\/freestyle\/sets\/reference"/);
  });

  it('each cross-nav link carries the disambiguating question phrasing', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('which tricks use this set?');
    expect(res.text).toContain('how do sets relate as families?');
    expect(res.text).toContain('what transformations act on tricks?');
  });
});

describe('GET /freestyle/sets — subtype grouping', () => {
  it('groups cards by the 6 canonical subtypes', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('id="set-subtype-true-core"');
    expect(res.text).toContain('id="set-subtype-composite-derived"');
    expect(res.text).toContain('id="set-subtype-rotational"');
    expect(res.text).toContain('id="set-subtype-whirl-swirl"');
    expect(res.text).toContain('id="set-subtype-uns"');
    expect(res.text).toContain('id="set-subtype-rooted-antisymposium"');
  });

  it('renders "True core sets" / "Composite / derived sets" subtype labels', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('True core sets');
    expect(res.text).toContain('Composite / derived sets');
  });
});

describe('GET /freestyle/sets — detail-page link resolution', () => {
  it.each(PRIORITY_SETS.map(slug => [slug] as const))(
    'detail link for %s resolves (route exists; not a 404 or 301)',
    async (slug) => {
      const res = await request(await createApp()).get(`/freestyle/sets/${slug}`);
      // Resolves to the existing set-detail page (200), not a 404.
      // Note: this verifies the *route resolves*; the detail page's own
      // rendering contract lives in freestyle.set-detail.routes.test.ts.
      expect(res.status).toBe(200);
    },
  );
});

describe('GET /freestyle/sets — distinct from sibling surfaces', () => {
  it('uses its own template classes (not the Set Hub view classes)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // Encyclopedia-specific classes
    expect(res.text).toContain('sets-encyclopedia-card');
    expect(res.text).toContain('sets-encyclopedia-grid');
    // Set Hub view classes (from /freestyle/tricks?view=sets) are NOT here
    expect(res.text).not.toContain('class="set-card set-card--');
    expect(res.text).not.toContain('class="set-card-grid"');
  });
});

describe('Cross-link presence on sibling pages', () => {
  it('freestyle landing renders a "Set Encyclopedia" card linking to /freestyle/sets', async () => {
    const res = await request(await createApp()).get('/freestyle');
    expect(res.text).toContain('Set Encyclopedia');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });

  it('operators page links to the Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });

  it('glossary links to the Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });
});
