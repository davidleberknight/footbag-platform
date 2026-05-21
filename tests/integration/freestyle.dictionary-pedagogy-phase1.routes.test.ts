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
 *   - The four new family-invariants render under their family headings
 *   - Existing whirl + rev-whirl invariants are preserved (regression)
 *   - No curator-internal language reaches the rendered HTML
 *
 * Design doc:
 *   exploration/dictionary-pedagogy-phase-1-2026-05-21/DESIGN.md
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

describe('Dictionary Pedagogy Phase 1 — ADD-view intro paragraph', () => {
  it('renders the addViewIntro at the top of the ADD browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="browse-view-intro"/);
  });

  it('addViewIntro frames ADD and topology as orthogonal axes', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/orthogonal/i);
    expect(res.text).toMatch(/topology and ADD/i);
    expect(res.text).toMatch(/structural difficulty/i);
  });

  it('addViewIntro does NOT appear on the family view', async () => {
    const familyRes = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(familyRes.text).not.toMatch(/orthogonal axes/i);
  });
});

describe('Dictionary Pedagogy Phase 1 — extended family invariants', () => {
  it('whirl invariant renders under the whirl family heading (regression)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('leggy in dex &gt; ss clipper');
  });

  it('rev-whirl invariant renders (regression)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('leggy out dex &gt; ss clipper');
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

  it('swirl invariant renders (NEW Phase 1)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('leggy xbd out dex &gt; ss clipper');
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
