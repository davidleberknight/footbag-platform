/**
 * Integration tests for the dictionary browse pedagogy.
 *
 * Contract under test:
 *   - Family view renders its intro paragraph, and the intro stays off the
 *     other views
 *   - The beginner-first lede on the ADD view, and the page-level hero
 *     subtitle on the family view
 *   - swirl renders as its own root family, distinct from whirl
 *   - No curator-internal language reaches the rendered intro paragraphs
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3165');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// Seed each terminal family with its anchor plus two compounds so it clears
// the family-view three-member minimum.
const FAMILY_FIXTURES = [
  { slug: 'whirl',           name: 'whirl',           family: 'whirl',     adds: '3', category: 'dex' as const },
  { slug: 'paradox-whirl',   name: 'paradox whirl',   family: 'whirl',     adds: '4', category: 'compound' as const },
  { slug: 'blurry-whirl',    name: 'blurry whirl',    family: 'whirl',     adds: '5', category: 'compound' as const },
  { slug: 'butterfly',       name: 'butterfly',       family: 'butterfly', adds: '3', category: 'dex' as const },
  { slug: 'ripwalk',         name: 'ripwalk',         family: 'butterfly', adds: '4', category: 'compound' as const },
  { slug: 'parkwalk',        name: 'parkwalk',        family: 'butterfly', adds: '5', category: 'compound' as const },
  { slug: 'mirage',          name: 'mirage',          family: 'mirage',    adds: '2', category: 'dex' as const },
  { slug: 'paradox-mirage',  name: 'paradox mirage',  family: 'mirage',    adds: '3', category: 'compound' as const },
  { slug: 'blur',            name: 'blur',            family: 'mirage',    adds: '4', category: 'compound' as const },
  { slug: 'osis',            name: 'osis',            family: 'osis',      adds: '3', category: 'dex' as const },
  { slug: 'spinning-osis',   name: 'spinning osis',   family: 'osis',      adds: '4', category: 'compound' as const },
  { slug: 'ducking-osis',    name: 'ducking osis',    family: 'osis',      adds: '5', category: 'compound' as const },
  { slug: 'swirl',           name: 'swirl',           family: 'swirl',     adds: '3', category: 'dex' as const },
  { slug: 'double-swirl',    name: 'double swirl',    family: 'swirl',     adds: '4', category: 'compound' as const },
  { slug: 'triple-swirl',    name: 'triple swirl',    family: 'swirl',     adds: '5', category: 'compound' as const },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
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

describe('Dictionary browse — family-view intro paragraph', () => {
  it('renders the familyViewIntro at the top of the family browse view', async () => {
    const res = await page('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="browse-view-intro"/);
  });

  it('familyViewIntro does NOT appear on other views', async () => {
    const addRes = await page('/freestyle/tricks?view=add');
    // The intro paragraph itself is absent; the phrase "conserved terminal
    // mechanic" is not a safe proxy any more because the Reading the
    // Dictionary disclosure names it in its browse-views table on every view.
    expect(addRes.text).not.toMatch(/class="browse-view-intro"/);
    expect(addRes.text).not.toMatch(/ADD view/i);
  });
});

describe('Dictionary — beginner-first landing lede', () => {
  it('renders the orientation tiles on the ADD browse view', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Orientation is a row of closed disclosure tiles a reader opens as
    // needed, rather than a block of prose ahead of the dictionary.
    expect(res.text).toContain('class="dict-tile-grid"');
    expect(res.text).toContain('How tricks are built');
  });

  it('explains the dictionary in plain, movement-first language', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/movement vocabulary/i);
    // The plain-language explanation lives in the orientation tiles, and each
    // browse axis carries its lens question so what a view is for is never
    // left to be guessed at.
    expect(res.text).toMatch(/difficulty/i);
    expect(res.text).toMatch(/How layered is the trick/);
    expect(res.text).toMatch(/Which named set does the trick open with/);
    // No ontology jargon in the beginner lede.
    expect(res.text).not.toMatch(/orthogonal/i);
  });

  it('the hero subtitle is page-level — it also shows on the family view', async () => {
    const res = await page('/freestyle/tricks?view=family');
    expect(res.text).toMatch(/movement vocabulary/i);
  });
});

describe('Dictionary browse — swirl is its own family', () => {
  // Defect caught: swirl is folded into whirl (or dropped), so its own family
  // page shows nothing or shows whirl's tricks.
  it('swirl renders as its own root family, distinct from whirl', async () => {
    const res = await page('/freestyle/tricks?view=family&family=swirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="family-swirl"');
    expect(res.text).not.toContain('id="family-whirl"');
    expect(res.text).toContain('data-trick-slug="double-swirl"');
    expect(res.text).not.toContain('data-trick-slug="paradox-whirl"');
  });
});

describe('Dictionary browse — no curator-internal language leakage', () => {
  it('intro paragraphs do not expose pt## tags, Slice X labels, or Wave-N references', async () => {
    const familyRes = await page('/freestyle/tricks?view=family');
    const addRes = await page('/freestyle/tricks?view=add');
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
});
