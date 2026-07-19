/**
 * Integration tests for the DISCOVERABILITY phase of the symbolic subsystem.
 *
 * Covers four surfaces:
 *   1. NEW route GET /freestyle/learn — symbolic-subsystem index page.
 *   2. Trick-page educational CTAs (data-driven from symbolic-group membership):
 *      butterfly-wing-topology → walking-family progression
 *      spinning-family / whirl-rotational-topology → spinning modifier page
 *   3. Cross-links rendered on /freestyle/progression/walking-family and
 *      /freestyle/modifier/spinning footers.
 *   4. Landing-page educational pointer paragraph at /freestyle.
 *
 * Observational-layer separation invariants verified throughout.
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

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // butterfly-wing-topology members
  insertFreestyleTrick(db, { slug: 'butterfly',  canonical_name: 'butterfly',  adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',    canonical_name: 'ripwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'sidewalk',   canonical_name: 'sidewalk',   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',    canonical_name: 'dimwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'matador',    canonical_name: 'matador',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'phoenix',    canonical_name: 'phoenix',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dada_curve', canonical_name: 'dada curve', adds: '4', base_trick: null,        trick_family: 'dada_curve', category: 'compound' });

  // whirl-rotational-topology + spinning-family members
  insertFreestyleTrick(db, { slug: 'whirl',          canonical_name: 'whirl',          adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'montage',        canonical_name: 'montage',        adds: '7', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });

  // A trick OUTSIDE both topologies — used to verify CTAs are NOT injected.
  insertFreestyleTrick(db, { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. /freestyle/learn — symbolic-subsystem index page
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/learn', () => {
  it('returns 200 and renders the symbolic-subsystem index page', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Educational pathways through freestyle footbag');
  });

  it('renders the six-lesson vocabulary tour: the six lessons in reading order, linked, above the advanced pathways', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toContain('Six lessons: how the vocabulary fits together');
    // The six lessons appear in reading order, each linked to its family page.
    const order = ['mirage', 'butterfly', 'whirl', 'osis', 'swirl', 'down'];
    let last = -1;
    for (const slug of order) {
      const at = res.text.indexOf(`href="/freestyle/families/${slug}"`);
      expect(at, slug).toBeGreaterThan(last);
      last = at;
    }
    // The lesson tour sits above the more advanced Progressions section.
    expect(res.text.indexOf('Six lessons: how the vocabulary fits together')).toBeLessThan(res.text.indexOf('Progressions'));
  });

  it('renders all three sections in order: Progressions, Modifier pedagogy, Reference surfaces', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    const a = res.text.indexOf('Progressions');
    const b = res.text.indexOf('Modifier pedagogy');
    const c = res.text.indexOf('Reference surfaces');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('renders all four currently shipped entries as links', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toMatch(/href="\/freestyle\/progression\/walking-family"[^>]*>Walking-family progression/);
    expect(res.text).toMatch(/href="\/freestyle\/modifier\/spinning"[^>]*>Spinning/);
    expect(res.text).toMatch(/href="\/freestyle\/modifier\/paradox"[^>]*>Paradox/);
    expect(res.text).toMatch(/href="\/freestyle\/modifier\/ducking"[^>]*>Ducking/);
    expect(res.text).toContain('href="/freestyle/glossary#connective-panels"');
  });

  it('no entries render with the planned status badge (all three modifier pages now ship)', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).not.toContain('learn-entry-planned');
    expect(res.text).not.toContain('learn-entry-status');
  });

  it('learn hero carries no layer badge (page-standard cleanup)', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-layer-badge');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toMatch(/href="\/freestyle">Freestyle</);
  });

  it('layer footer references canonical surfaces, not symbolic-layer ones', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('/freestyle/glossary');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1b. /freestyle/learn — operator-board onboarding surface
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/learn — operator-board onboarding surface', () => {
  it('renders the learn-surface operator-board heading and reference-board lede', async () => {
    // The board is a reference index, never a learn-first mandate, and no
    // hardcoded count appears (the rendered card count is what it is).
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toContain('Explore the movement-language index');
    expect(res.text).toContain('A reference board of named sets, body movements, and structural relationships');
    expect(res.text).not.toContain('fourteen primitives');
    expect(res.text).not.toMatch(/learn these .* first/i);
  });

  it('does not render the landing- or glossary-surface operator-board prose', async () => {
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).not.toContain('The operators of freestyle');
    expect(res.text).not.toContain('The compositional vocabulary');
  });

  it('renders all 13 Tier-1 operator glyphs', async () => {
    // The OP cell is absent: its example "OP + BUTTERFLY →
    // BUTTERFLY" was a no-op that taught nothing visible.
    const res = await request(createApp()).get('/freestyle/learn');
    const glyphs = [
      'PIX', 'AT', 'Q', 'BL', 'FAIRY', 'STEP',
      'SPIN', 'GY', 'DUCK', 'PDX', 'SYMP',
      'XBODY', 'SAME',
    ];
    for (const glyph of glyphs) {
      expect(res.text).toMatch(new RegExp(`<p class="operator-glyph">${glyph}</p>`));
    }
  });

  it('demotes the operator board below the guided pathway sections', async () => {
    // The card wall never sits between a reader and the lessons or the
    // pathway sections; it closes the page as reference material.
    const res = await request(createApp()).get('/freestyle/learn');
    const introIdx    = res.text.indexOf('class="learn-intro"');
    const boardIdx    = res.text.indexOf('class="operator-board');
    const firstSecIdx = res.text.indexOf('class="learn-section"');
    expect(introIdx).toBeGreaterThan(0);
    expect(firstSecIdx).toBeGreaterThan(introIdx);
    expect(boardIdx).toBeGreaterThan(firstSecIdx);
  });

  it('renders eleven restrained operator-card deep-links onboarding to mature surfaces', async () => {
    // Eleven, not ten: the BL operator carries a GLOSSARY('blurry') deeplink
    // (from the Blender to Blurry rename).
    const res = await request(createApp()).get('/freestyle/learn');
    const matches = res.text.match(/class="operator-card-deeplink"/g) ?? [];
    expect(matches.length).toBe(11);
    // Spot-check one destination per category (notation / glossary / pedagogy).
    expect(res.text).toContain('href="/freestyle/sets/reference#move-pixie"');
    expect(res.text).toContain('href="/freestyle/glossary#term-stepping"');
    expect(res.text).toContain('href="/freestyle/modifier/ducking"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Trick-page educational CTAs
// ─────────────────────────────────────────────────────────────────────────

describe('trick-page educational CTAs — butterfly-wing-topology members', () => {
  const BUTTERFLY_SLUGS = ['butterfly', 'ripwalk', 'sidewalk', 'dimwalk', 'matador', 'phoenix'];

  for (const slug of BUTTERFLY_SLUGS) {
    it(`/freestyle/tricks/${slug} renders the walking-family CTA`, async () => {
      const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('symbolic-trick-ctas-block');
      expect(res.text).toContain('href="/freestyle/progression/walking-family"');
      expect(res.text).toMatch(/Walking-family progression/);
    });
  }
});

describe('trick-page educational CTAs — spinning/whirl-rotational members', () => {
  const SPINNING_SLUGS = ['spinning-whirl', 'montage'];

  for (const slug of SPINNING_SLUGS) {
    it(`/freestyle/tricks/${slug} renders the spinning-modifier CTA`, async () => {
      const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('symbolic-trick-ctas-block');
      expect(res.text).toContain('href="/freestyle/modifier/spinning"');
      expect(res.text).toMatch(/Spinning modifier educational page/);
    });
  }

  it('a trick belonging to BOTH spinning-family and whirl-rotational-topology emits the spinning CTA once (de-duped by href)', async () => {
    // montage is in both groups; the CTA href should appear in the CTA list once.
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    expect(res.status).toBe(200);
    const ctaBlockStart = res.text.indexOf('symbolic-trick-ctas-block');
    expect(ctaBlockStart).toBeGreaterThan(-1);
    const ctaBlockEnd = res.text.indexOf('</aside>', ctaBlockStart);
    expect(ctaBlockEnd).toBeGreaterThan(ctaBlockStart);
    const ctaBlock = res.text.substring(ctaBlockStart, ctaBlockEnd);
    const matches = ctaBlock.match(/\/freestyle\/modifier\/spinning/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('trick-page educational CTAs — non-triggering tricks', () => {
  it('/freestyle/tricks/mirage does NOT render any CTA block', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-trick-ctas-block');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Cross-links between symbolic full-pages
// ─────────────────────────────────────────────────────────────────────────

describe('symbolic full-page cross-links — walking-progression footer', () => {
  it('walking-progression page renders the symbolic-crosslinks block', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('symbolic-crosslinks');
    expect(res.text).toContain('href="/freestyle/modifier/spinning"');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

describe('symbolic full-page cross-links — modifier-family footer', () => {
  it('spinning modifier page renders the symbolic-crosslinks block', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    expect(res.text).toContain('symbolic-crosslinks');
    expect(res.text).toContain('href="/freestyle/progression/walking-family"');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Landing-page educational pointer paragraph
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle — beginner on-ramp', () => {
  it('landing page carries a beginner on-ramp linking to the getting-started page', async () => {
    // The landing page opens with a beginner on-ramp that points newcomers at
    // the novice getting-started page; /freestyle/learn remains the
    // educational-pathways index cross-linked from modifier-family pages.
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('freestyle-learn-pointer');
    expect(res.text).toContain('href="/freestyle/start"');
  });
});
