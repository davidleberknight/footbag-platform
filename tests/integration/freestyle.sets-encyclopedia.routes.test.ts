/**
 * GET /freestyle/sets — Set Encyclopedia.
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
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3159');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Priority sets the curator named in the slice. Each must render. Furious is
// folded into barraging (one set, two names), so its slug redirects rather than
// rendering its own page, the same as illusioning into atomic.
const PRIORITY_SETS = [
  'pixie', 'fairy', 'stepping', 'atomic', 'quantum', 'nuclear',
  'barraging', 'blurry', 'surging', 'tapping',
] as const;

beforeAll(async () => {
  // The Set Encyclopedia reads from CANONICAL_SETS (content module),
  // not from freestyle_tricks. We seed a handful of trick rows + modifier
  // links so the S1 "Common in:" preview line has data to render for at
  // least one canonical set (pixie); cards without seeded links render
  // an empty produces array and suppress the line.
  const db = createTestDb(dbPath);
  insertFreestyleTrickModifier(db, { slug: 'pixie' });
  insertFreestyleTrick(db, { slug: 'dimwalk',        canonical_name: 'dimwalk',        adds: '4' });
  insertFreestyleTrick(db, { slug: 'smear',          canonical_name: 'smear',          adds: '3' });
  insertFreestyleTrick(db, { slug: 'pixie_illusion', canonical_name: 'pixie illusion', adds: '3' });
  insertFreestyleTrickModifierLink(db, 'dimwalk',        'pixie');
  insertFreestyleTrickModifierLink(db, 'smear',          'pixie');
  insertFreestyleTrickModifierLink(db, 'pixie_illusion', 'pixie');
  db.close();
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

  it('explains why this surface is an encyclopedia rather than a dictionary', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('Why an encyclopedia instead of a dictionary?');
    expect(res.text).toContain('explores the movement systems that');
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
      // Hashtag follows the set ontology role-prefix pattern (#set_<slug>)
      expect(res.text).toContain(`#set_${slug}`);
    },
  );

  it('every set row carries a status pill, the SET notation line, and one descriptor', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // One row per set: count by detail-link, then confirm each required slot
    // appears the same number of times. The rows reuse the trick-dictionary
    // notation contract (.dict-trick-row-notation) for the SET formula line.
    const detailLinkMatches = res.text.match(/sets-encyclopedia-card-detail-link/g) ?? [];
    const movementMatches   = res.text.match(/sets-encyclopedia-card-movement/g) ?? [];
    const statusMatches     = res.text.match(/sets-encyclopedia-card-status /g) ?? [];
    const notationMatches   = res.text.match(/dict-trick-row-notation/g) ?? [];
    expect(detailLinkMatches.length).toBeGreaterThan(0);
    expect(movementMatches.length).toBe(detailLinkMatches.length);
    expect(statusMatches.length).toBe(detailLinkMatches.length);
    expect(notationMatches.length).toBe(detailLinkMatches.length);
  });

  it('status pills use beginner-safe labels and never expose internal source names', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toMatch(/sets-encyclopedia-card-status--(platform-tracked|community-cited|under-review)/);
    // Internal source-name provenance phrasing is gone from the cards.
    expect(res.text).not.toContain('Holden aligned');
    expect(res.text).not.toContain('Holden partial');
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
  it('renders the three cross-nav links disambiguating from sibling surfaces', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('class="sets-encyclopedia-cross-nav"');
    // `=` is HTML-escaped to `&#x3D;` in Handlebars output. Match the
    // path without the `=` to keep the regex stable.
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view/);
    expect(res.text).toMatch(/href="\/freestyle\/compositional-sets"/);
    expect(res.text).toMatch(/href="\/freestyle\/operators"/);
    // The flat Holden reference link is intentionally not surfaced here
    // (no source-person naming on the public related-surfaces list).
    expect(res.text).not.toMatch(/href="\/freestyle\/sets\/reference"/);
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
  it('renders compact trick-dictionary-style rows, not the Set Hub view cards', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // The index mirrors the trick-dictionary row contract (shared structure)
    // while carrying the encyclopedia's own status pill + role chip.
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).toContain('class="dict-trick-row"');
    expect(res.text).toContain('sets-encyclopedia-card-status');
    expect(res.text).toContain('sets-encyclopedia-card-role-chip');
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

// ─────────────────────────────────────────────────────────────────────────
// S1 — Index card refinement (role chip · ★ flagship marker · Common in)
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/sets — S1 role chip on every card', () => {
  it('every card carries a role-chip class', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const detailLinkMatches = res.text.match(/sets-encyclopedia-card-detail-link/g) ?? [];
    const roleChipMatches   = res.text.match(/sets-encyclopedia-card-role-chip\b/g) ?? [];
    expect(detailLinkMatches.length).toBeGreaterThan(0);
    // One role chip per card (the base class appears once per chip;
    // the role-variant class is a second occurrence on the same element).
    expect(roleChipMatches.length).toBeGreaterThanOrEqual(detailLinkMatches.length);
  });

  it('true-core TOE-prefix sets carry the +1 entry role', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    for (const slug of ['pixie', 'fairy', 'atomic', 'quantum']) {
      // Card present + role chip variant + role label visible
      expect(res.text).toContain(`id="enc-set-${slug}"`);
      expect(res.text).toContain('sets-encyclopedia-card-role-chip--plus-one-entry');
    }
    expect(res.text).toMatch(/>\+1 entry<\/span>/);
  });

  it('true-core CLIP-prefix sets carry the CLIP entry role', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    for (const slug of ['stepping', 'bubba', 'slapping', 'tapping']) {
      expect(res.text).toContain(`id="enc-set-${slug}"`);
    }
    expect(res.text).toContain('sets-encyclopedia-card-role-chip--clip-entry');
    expect(res.text).toMatch(/>CLIP entry<\/span>/);
  });

  it('composite-derived / rotational / uns / rooted subtypes each carry their distinct role chip', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('sets-encyclopedia-card-role-chip--composite');
    expect(res.text).toContain('sets-encyclopedia-card-role-chip--rotational');
    expect(res.text).toContain('sets-encyclopedia-card-role-chip--uns-entry');
    expect(res.text).toContain('sets-encyclopedia-card-role-chip--rooted');
  });
});

describe('GET /freestyle/sets — S1 ★ flagship marker on 5 foundational sets', () => {
  const FLAGSHIP_SLUGS = ['pixie', 'fairy', 'stepping', 'atomic', 'quantum'] as const;
  const NON_FLAGSHIP_SLUGS = ['bubba', 'slapping', 'blurry', 'surging'] as const;

  it.each(FLAGSHIP_SLUGS.map(slug => [slug] as const))(
    '%s carries the flagship-marker chip with a title tooltip',
    async (slug) => {
      const res = await request(await createApp()).get('/freestyle/sets');
      // Locate the card and assert the flagship span is present inside it.
      const cardIdx = res.text.indexOf(`id="enc-set-${slug}"`);
      expect(cardIdx).toBeGreaterThan(0);
      const cardSlice = res.text.slice(cardIdx, cardIdx + 1500);
      expect(cardSlice).toMatch(/<span class="sets-encyclopedia-card-flagship" title="Flagship set: [^"]+">/);
    },
  );

  it.each(NON_FLAGSHIP_SLUGS.map(slug => [slug] as const))(
    '%s does NOT carry the flagship-marker chip',
    async (slug) => {
      const res = await request(await createApp()).get('/freestyle/sets');
      const cardIdx = res.text.indexOf(`id="enc-set-${slug}"`);
      expect(cardIdx).toBeGreaterThan(0);
      const cardSlice = res.text.slice(cardIdx, cardIdx + 1500);
      expect(cardSlice).not.toMatch(/sets-encyclopedia-card-flagship/);
    },
  );

  it('the flagship cohort is exactly 6 cards (matches FLAGSHIP_SET_TOOLTIPS in the service)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const flagshipMatches = res.text.match(/sets-encyclopedia-card-flagship/g) ?? [];
    expect(flagshipMatches.length).toBe(6);
  });
});

describe('GET /freestyle/sets — index prose reduced (Derived / Common in moved to detail pages)', () => {
  it('does not render the Derived or Common-in lines on the index rows', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // These relational previews now live on the set detail pages; the index
    // rows carry at most one short descriptor (the compact movement line).
    expect(res.text).not.toContain('class="sets-encyclopedia-card-common-in"');
    expect(res.text).not.toContain('Common in:');
    expect(res.text).not.toContain('class="sets-encyclopedia-card-relations-row"');
    expect(res.text).not.toContain('Derived:');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S4 — Mini-TOC pill row + per-subtype Read-next footers
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/sets — S4 mini-TOC pill row', () => {
  it('renders the mini-TOC nav with one anchor per rendered subtype', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('class="glossary-mini-toc"');
    expect(res.text).toContain('aria-label="In this encyclopedia"');
    expect(res.text).toContain('>In this encyclopedia:</span>');
  });

  it('mini-TOC anchors target each of the 6 subtype sections', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const tocStart = res.text.indexOf('class="glossary-mini-toc"');
    const tocEnd = res.text.indexOf('</nav>', tocStart);
    expect(tocStart).toBeGreaterThan(0);
    const tocSlice = res.text.slice(tocStart, tocEnd);
    for (const key of [
      'true-core', 'composite-derived', 'rotational',
      'whirl-swirl', 'uns', 'rooted-antisymposium',
    ]) {
      expect(tocSlice).toContain(`href="#set-subtype-${key}"`);
    }
  });

  it('mini-TOC anchors carry human-readable subtype labels', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const tocStart = res.text.indexOf('class="glossary-mini-toc"');
    const tocEnd = res.text.indexOf('</nav>', tocStart);
    const tocSlice = res.text.slice(tocStart, tocEnd);
    expect(tocSlice).toContain('True core sets');
    expect(tocSlice).toContain('Composite / derived sets');
    expect(tocSlice).toContain('Rotational set systems');
  });
});

describe('GET /freestyle/sets — S4 per-subtype Read-next footers', () => {
  it('renders 5 Read-next footers (one per subtype except the last)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const footerMatches = res.text.match(/class="glossary-section-next"/g) ?? [];
    // 6 rendered subtypes → 5 forward-pointing footers (last suppresses).
    expect(footerMatches.length).toBe(5);
  });

  it('true-core footer points forward to composite-derived with a lowercased tagline', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const sectionStart = res.text.indexOf('id="set-subtype-true-core"');
    const sectionEnd   = res.text.indexOf('id="set-subtype-composite-derived"');
    expect(sectionStart).toBeGreaterThan(0);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const slice = res.text.slice(sectionStart, sectionEnd);
    expect(slice).toMatch(/class="glossary-section-next"/);
    expect(slice).toMatch(/href="#set-subtype-composite-derived"/);
    expect(slice).toContain('Composite / derived sets');
    // Tagline is the lowercased first sentence of the composite intro.
    expect(slice).toMatch(/multi-dex chains and derived entry topologies/);
  });

  it('the last rendered subtype (rooted-antisymposium) does NOT render a Read-next footer', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    const sectionStart = res.text.indexOf('id="set-subtype-rooted-antisymposium"');
    expect(sectionStart).toBeGreaterThan(0);
    // Slice from this section's opening to the wrapper close — there
    // should be no glossary-section-next inside it.
    const wrapperCloseIdx = res.text.indexOf('</div>', sectionStart);
    const slice = res.text.slice(sectionStart, wrapperCloseIdx + 6);
    expect(slice).not.toMatch(/class="glossary-section-next"/);
  });
});
