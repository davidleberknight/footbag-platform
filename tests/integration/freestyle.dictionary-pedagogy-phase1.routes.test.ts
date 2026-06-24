/**
 * Integration tests for Dictionary Pedagogy Phase 1.
 *
 * The slice ships three pedagogical additions to /freestyle/tricks
 * browse views:
 *   (a) Four new family-invariant entries (butterfly, mirage, osis,
 *       swirl) extending the Slice-I pilot from 2 to 6 terminal families
 *   (b) familyViewIntro paragraph teaching the family-grouping logic
 *   (c) addViewIntro paragraph teaching ADD/topology orthogonality
 *
 * Contract under test:
 *   - Family view renders the new pedagogy intro paragraph
 *   - ADD view renders the new pedagogy intro paragraph
 *   - Family invariants (whirl, butterfly, mirage, osis, swirl) render under
 *     their family headings
 *   - swirl renders as its own root family, distinct from whirl
 *   - rev-whirl is a route-out (too few descendants to be a family): no family
 *     section, and its invariant does not surface
 *   - No curator-internal language reaches the rendered HTML
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3165');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Seed each terminal family with its anchor + one compound so the
// family-view section renders (length > 1 heuristic). Six terminal
// families × ~2 tricks each = 12 rows.
const FAMILY_FIXTURES = [
  // Whirl (pre-existing pilot)
  { slug: 'whirl',           name: 'whirl',           family: 'whirl',     adds: '3', category: 'dex' as const },
  { slug: 'paradox-whirl',   name: 'paradox whirl',   family: 'whirl',     adds: '4', category: 'compound' as const },
  // Rev-Whirl
  { slug: 'rev-whirl',       name: 'rev-whirl',       family: 'rev-whirl', adds: '4', category: 'dex' as const },
  { slug: 'hatchet',         name: 'hatchet',         family: 'rev-whirl', adds: '5', category: 'compound' as const },
  // Butterfly (NEW)
  { slug: 'butterfly',       name: 'butterfly',       family: 'butterfly', adds: '3', category: 'dex' as const },
  { slug: 'ripwalk',         name: 'ripwalk',         family: 'butterfly', adds: '4', category: 'compound' as const },
  // Mirage (NEW)
  { slug: 'mirage',          name: 'mirage',          family: 'mirage',    adds: '2', category: 'dex' as const },
  { slug: 'paradox-mirage',  name: 'paradox mirage',  family: 'mirage',    adds: '3', category: 'compound' as const },
  // Osis (NEW)
  { slug: 'osis',            name: 'osis',            family: 'osis',      adds: '3', category: 'dex' as const },
  { slug: 'spinning-osis',   name: 'spinning osis',   family: 'osis',      adds: '4', category: 'compound' as const },
  // Swirl (NEW)
  { slug: 'swirl',           name: 'swirl',           family: 'swirl',     adds: '3', category: 'dex' as const },
  { slug: 'double-swirl',    name: 'double swirl',    family: 'swirl',     adds: '4', category: 'compound' as const },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const f of FAMILY_FIXTURES) {
    insertFreestyleTrick(db, {
      slug:           f.slug,
      canonical_name: f.name,
      trick_family:   f.family,
      category:       f.category,
      adds:           f.adds,
      is_active:      1,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Dictionary Pedagogy Phase 1 — family-view intro paragraph', () => {
  it('renders the familyViewIntro at the top of the family browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="browse-view-intro"/);
  });

  it('familyViewIntro names the grouping logic + contrasts with ADD view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toMatch(/conserved terminal mechanic/i);
    expect(res.text).toMatch(/ADD view/i);
    expect(res.text).toMatch(/Movement System view/i);
  });

  it('familyViewIntro does NOT appear on other views', async () => {
    const addRes = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(addRes.text).not.toMatch(/conserved terminal mechanic/i);
  });
});

describe('Dictionary — plain-language intro paragraph', () => {
  it('renders the dictionary intro at the top of the ADD browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="browse-view-intro"/);
  });

  it('the intro explains the dictionary in plain, movement-first language', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/movement vocabulary/i);
    // The intro is orientation-first and points the reader to the lenses; the
    // three-lens model itself lives in the landing-grid bands (difficulty /
    // structure / tracking & expansion), each with its own lens-question.
    expect(res.text).toMatch(/Pick a lens/i);
    expect(res.text).toMatch(/difficulty/i);
    expect(res.text).toMatch(/structure/i);
    expect(res.text).toMatch(/How layered is the trick/);
    // No ontology jargon in the beginner intro.
    expect(res.text).not.toMatch(/orthogonal/i);
  });

  it('the dictionary intro is page-level — it also shows on the family view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toMatch(/movement vocabulary/i);
  });
});

describe('Dictionary Pedagogy Phase 1 — extended family invariants', () => {
  it('whirl invariant renders under the whirl family heading (regression)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('leggy in dex &gt; ss clipper');
  });

  it('rev-whirl is a route-out: no family section, invariant does not surface', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // rev-whirl has too few descendants to be a family, so it renders no
    // family section and its invariant does not appear.
    expect(res.text).not.toContain('id="family-rev-whirl"');
    expect(res.text).not.toContain('leggy out dex &gt; ss clipper');
  });

  it('butterfly invariant renders (NEW Phase 1)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('hippy out dex &gt; ss clipper');
  });

  it('mirage invariant renders (NEW Phase 1)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('hippy in dex &gt; op toe');
  });

  it('osis invariant renders (NEW Phase 1)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('spin &gt; ss clipper');
  });

  it('swirl renders as its own root family, distinct from whirl', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('id="family-swirl"');
    expect(res.text).toContain('leggy xbd out dex &gt; ss clipper');
  });
});

describe('Dictionary Pedagogy Phase 2 — family-anchor sub-label', () => {
  it('renders the "Family-anchor:" sub-label under each family heading', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-family-anchor-sublabel"/);
    expect(res.text).toMatch(/class="trick-family-anchor-label"[^>]*>\s*Family-anchor:\s*</);
  });

  it('sub-label cross-links the anchor name to the trick-detail page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // Each family's anchor name links to /freestyle/tricks/{familySlug}.
    // The fixture seeded whirl/butterfly/mirage/osis/swirl/rev-whirl as
    // anchor tricks so each family's section carries an anchor link.
    const startIdx = res.text.indexOf('id="family-whirl"');
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/class="trick-family-anchor-link"[^>]*href="\/freestyle\/tricks\/whirl"/);
  });

  it('sub-label uses the family display name (not the slug) for the link text', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    const startIdx = res.text.indexOf('id="family-butterfly"');
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    // Link text should be the display name ("Butterfly") rendered by
    // the template via {{familyName}} — case-insensitive match because
    // the service may title-case differently from the slug.
    expect(region).toMatch(/class="trick-family-anchor-link"[^>]*>\s*[Bb]utterfly\s*</);
  });

  it('sub-label does NOT appear on non-family views', async () => {
    const addRes = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(addRes.text).not.toMatch(/class="trick-family-anchor-sublabel"/);
  });
});

describe('Dictionary Pedagogy Phase 1 — no curator-internal language leakage', () => {
  it('intro paragraphs do not expose pt## tags, Slice X labels, or Wave-N references', async () => {
    const familyRes = await request(createApp()).get('/freestyle/tricks?view=family');
    const addRes = await request(createApp()).get('/freestyle/tricks?view=add');
    for (const res of [familyRes, addRes]) {
      const startIdx = res.text.indexOf('browse-view-intro');
      const endIdx = res.text.indexOf('</p>', startIdx);
      const region = res.text.slice(startIdx, endIdx);
      expect(region).not.toMatch(/\bpt\d+\b/i);
      expect(region).not.toMatch(/Wave[- ]?\d/i);
      expect(region).not.toMatch(/Slice [A-Z]\b/);
      expect(region).not.toMatch(/Sprint/i);
      expect(region).not.toMatch(/curatorConfirmPending/i);
    }
  });

  it('family invariants do not expose curator-internal slugs or commentary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // The structural-form lines are plain text; no internal references
    // should leak from the content module's comments.
    expect(res.text).not.toContain('FAMILY_INVARIANTS');
    expect(res.text).not.toContain('Slice I');
    expect(res.text).not.toContain('Slice J');
    expect(res.text).not.toContain('Slice L');
  });
});
