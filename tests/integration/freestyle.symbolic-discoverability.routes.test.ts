/**
 * Integration tests for the DISCOVERABILITY phase of the symbolic subsystem.
 *
 * Covers four surfaces:
 *   1. NEW route GET /freestyle/learn — symbolic-subsystem index page.
 *   2. Trick-page educational CTAs, decided from the trick's own structure:
 *      built on the butterfly → walking-family progression
 *      built on the whirl, or carrying the spinning modifier → spinning modifier page
 *   3. Cross-links rendered on /freestyle/progression/walking-family and
 *      /freestyle/modifier/spinning footers.
 *   4. Landing-page educational pointer paragraph at /freestyle.
 *
 * Observational-layer separation invariants verified throughout.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

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

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

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

  // montage carries the spinning modifier as well as its whirl base, so two
  // conditions fire the same link.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_type: 'rotational' });
  insertFreestyleTrickModifierLink(db, 'montage', 'spinning');

  // Tricks no stored grouping knows about: one published on the butterfly, one
  // built on the mirage but carrying the spinning modifier. Their links can come
  // only from their own structure.
  insertFreestyleTrick(db, { slug: 'fresh_walk',      canonical_name: 'fresh walk',      adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning_mirage', canonical_name: 'spinning mirage', adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrickModifierLink(db, 'spinning_mirage', 'spinning');

  // bigwalk is filed under the butterfly in the stored grouping every test
  // database is seeded with; here it sits on a different base, so the page must
  // follow the row, not the stale grouping.
  insertFreestyleTrick(db, { slug: 'bigwalk', canonical_name: 'bigwalk', adds: '5', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });

  // scorpions_tail has no modifier link rows; its curator-published formula
  // names the spinning operator, which the Structural Facts block shows.
  insertFreestyleTrick(db, { slug: 'scorpions_tail', canonical_name: "scorpion's tail", adds: '5', base_trick: 'down_double_down', trick_family: 'down_double_down', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. /freestyle/learn — symbolic-subsystem index page
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/learn', () => {
  it('returns 200 and renders the symbolic-subsystem index page', async () => {
    const res = await page('/freestyle/learn');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Educational pathways through freestyle footbag');
  });

  it('renders the six-lesson vocabulary tour: the six lessons in reading order, linked, above the advanced pathways', async () => {
    const res = await page('/freestyle/learn');
    expect(res.text).toContain('Six lessons: how the vocabulary fits together');
    // The six lessons appear in reading order, each linked to its concept
    // page: dexterity, complete trick, catch structure, family, set, modifier.
    const order = [
      '/freestyle/tricks/around_the_world',
      '/freestyle/tricks/mirage',
      '/freestyle/families/butterfly',
      '/freestyle/families/whirl',
      '/freestyle/sets/pixie',
      '/freestyle/modifier/spinning',
    ];
    let last = -1;
    for (const href of order) {
      const at = res.text.indexOf(`href="${href}"`);
      expect(at, href).toBeGreaterThan(last);
      last = at;
    }
    // The lesson tour sits above the more advanced Progressions section.
    expect(res.text.indexOf('Six lessons: how the vocabulary fits together')).toBeLessThan(res.text.indexOf('Progressions'));
  });

  it('renders all three sections in order: Progressions, Modifier pedagogy, Reference surfaces', async () => {
    const res = await page('/freestyle/learn');
    const a = res.text.indexOf('Progressions');
    const b = res.text.indexOf('Modifier pedagogy');
    const c = res.text.indexOf('Reference surfaces');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('renders all four currently shipped entries as links', async () => {
    const res = await page('/freestyle/learn');
    expect(res.text).toMatch(/href="\/freestyle\/progression\/walking-family"[^>]*>Walking-family progression/);
    expect(res.text).toMatch(/href="\/freestyle\/modifier\/spinning"[^>]*>Spinning/);
    expect(res.text).toMatch(/href="\/freestyle\/modifier\/paradox"[^>]*>Paradox/);
    expect(res.text).toMatch(/href="\/freestyle\/modifier\/ducking"[^>]*>Ducking/);
    // The Concepts page carries no movement-topology panels, so the learn
    // index links to none.
    expect(res.text).not.toContain('href="/freestyle/concepts#connective-panels"');
  });

  it('no entries render with the planned status badge (all three modifier pages now ship)', async () => {
    const res = await page('/freestyle/learn');
    expect(res.text).not.toContain('learn-entry-planned');
    expect(res.text).not.toContain('learn-entry-status');
  });

  it('learn hero carries no layer badge (page-standard cleanup)', async () => {
    const res = await page('/freestyle/learn');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-layer-badge');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await page('/freestyle/learn');
    expect(res.text).toMatch(/href="\/freestyle">Freestyle</);
  });

  it('layer footer references canonical surfaces, not symbolic-layer ones', async () => {
    const res = await page('/freestyle/learn');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('/freestyle/concepts');
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
    const res = await page('/freestyle/learn');
    expect(res.text).toContain('Explore the movement-language index');
    expect(res.text).toContain('A reference board of named sets, body movements, and structural relationships');
    expect(res.text).not.toContain('fourteen primitives');
    expect(res.text).not.toMatch(/learn these .* first/i);
  });

  it('does not render the landing- or Concepts-surface operator-board prose', async () => {
    const res = await page('/freestyle/learn');
    expect(res.text).not.toContain('The operators of freestyle');
    expect(res.text).not.toContain('The compositional vocabulary');
  });

  it('renders all 13 Tier-1 operator glyphs', async () => {
    // The OP cell is absent: its example "OP + BUTTERFLY →
    // BUTTERFLY" was a no-op that taught nothing visible.
    const res = await page('/freestyle/learn');
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
    const res = await page('/freestyle/learn');
    const introIdx    = res.text.indexOf('class="learn-intro"');
    const boardIdx    = res.text.indexOf('class="operator-board');
    const firstSecIdx = res.text.indexOf('class="learn-entries"');
    expect(introIdx).toBeGreaterThan(0);
    expect(firstSecIdx).toBeGreaterThan(introIdx);
    expect(boardIdx).toBeGreaterThan(firstSecIdx);
  });

  it('renders eleven restrained operator-card deep-links onboarding to mature surfaces', async () => {
    // Eleven, not ten: the BL operator carries a Concepts-entry deeplink to
    // the blurry term.
    const res = await page('/freestyle/learn');
    const matches = res.text.match(/class="operator-card-deeplink"/g) ?? [];
    expect(matches.length).toBe(11);
    // Spot-check one destination per category (notation / Concepts / pedagogy).
    expect(res.text).toContain('href="/freestyle/sets#move-pixie"');
    expect(res.text).toContain('href="/freestyle/concepts#term-stepping"');
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
      const res = await page(`/freestyle/tricks/${slug}`);
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
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('symbolic-trick-ctas-block');
      expect(res.text).toContain('href="/freestyle/modifier/spinning"');
      expect(res.text).toMatch(/Spinning modifier educational page/);
    });
  }

  it('a trick belonging to BOTH spinning-family and whirl-rotational-topology emits the spinning CTA once (de-duped by href)', async () => {
    // montage is in both groups; the CTA href should appear in the CTA list once.
    const res = await page('/freestyle/tricks/montage');
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
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-trick-ctas-block');
  });
});

// The educational links block alone, or '' when the page has none. A trick page
// also links to the spinning modifier from its modifier list, so a whole-page
// match could not tell an educational link from that one.
function ctaBlock(html: string): string {
  const start = html.indexOf('symbolic-trick-ctas-block');
  if (start === -1) return '';
  return html.substring(start, html.indexOf('</aside>', start));
}

describe('trick-page educational CTAs follow the trick, not a stored grouping', () => {
  it('a trick no grouping has heard of gets the walking-family link from its butterfly base', async () => {
    // A trick published in the application has no stored grouping row, and
    // without this it would never be pointed at the progression it belongs to.
    const res = await page('/freestyle/tricks/fresh_walk');
    expect(res.status).toBe(200);
    expect(ctaBlock(res.text)).toContain('href="/freestyle/progression/walking-family"');
  });

  it('the spinning modifier alone earns the spinning link, on a base that is not the whirl', async () => {
    const res = await page('/freestyle/tricks/spinning_mirage');
    expect(res.status).toBe(200);
    const block = ctaBlock(res.text);
    expect(block).toContain('href="/freestyle/modifier/spinning"');
    expect(block).not.toContain('href="/freestyle/progression/walking-family"');
  });

  it('a trick with no modifier link rows takes its modifiers from the curated formula, as its Structural Facts do', async () => {
    // Otherwise the page lists spinning among the trick's facts while offering
    // no link to the spinning modifier's teaching page.
    const res = await page('/freestyle/tricks/scorpions_tail');
    expect(res.status).toBe(200);
    expect(ctaBlock(res.text)).toContain('href="/freestyle/modifier/spinning"');
  });

  it('a trick moved off the butterfly loses the walking-family link the stored grouping still gives it', async () => {
    // An edit in the trick editor must change the page at once; a stale stored
    // grouping would keep pointing a mirage-based trick at the walking family.
    const res = await page('/freestyle/tricks/bigwalk');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-trick-ctas-block');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Cross-links between symbolic full-pages
// ─────────────────────────────────────────────────────────────────────────

describe('symbolic full-page cross-links — walking-progression footer', () => {
  it('walking-progression page renders the symbolic-crosslinks block', async () => {
    const res = await page('/freestyle/progression/walking-family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('symbolic-crosslinks');
    expect(res.text).toContain('href="/freestyle/modifier/spinning"');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

describe('symbolic full-page cross-links — modifier-family footer', () => {
  it('spinning modifier page renders the symbolic-crosslinks block', async () => {
    const res = await page('/freestyle/modifier/spinning');
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
    const res = await page('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/New to freestyle\?/i);
    expect(res.text).toContain('href="/freestyle/start"');
  });
});
