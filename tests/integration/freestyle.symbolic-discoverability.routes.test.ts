/**
 * Integration tests for the DISCOVERABILITY phase of the symbolic subsystem.
 *
 * Covers three surfaces:
 *   1. Trick-page educational CTAs, decided from the trick's own structure:
 *      built on the butterfly → the Butterfly family page
 *      built on the whirl, or carrying the spinning modifier → spinning modifier page
 *   2. The cross-links rendered on the /freestyle/modifier/spinning footer.
 *   3. Landing-page educational pointer paragraph at /freestyle.
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
// 2. Trick-page educational CTAs
// ─────────────────────────────────────────────────────────────────────────

describe('trick-page educational CTAs — butterfly-wing-topology members', () => {
  const BUTTERFLY_SLUGS = ['butterfly', 'ripwalk', 'sidewalk', 'dimwalk', 'matador', 'phoenix'];

  for (const slug of BUTTERFLY_SLUGS) {
    it(`/freestyle/tricks/${slug} renders the Butterfly family CTA`, async () => {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('symbolic-trick-ctas-block');
      expect(ctaBlock(res.text)).toContain('href="/freestyle/families/butterfly"');
      expect(res.text).toMatch(/Butterfly family: how the walking tricks branch/);
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
  it('a trick no grouping has heard of gets the Butterfly family link from its butterfly base', async () => {
    // A trick published in the application has no stored grouping row, and
    // without this it would never be pointed at the family it belongs to.
    const res = await page('/freestyle/tricks/fresh_walk');
    expect(res.status).toBe(200);
    expect(ctaBlock(res.text)).toContain('href="/freestyle/families/butterfly"');
  });

  it('the spinning modifier alone earns the spinning link, on a base that is not the whirl', async () => {
    const res = await page('/freestyle/tricks/spinning_mirage');
    expect(res.status).toBe(200);
    const block = ctaBlock(res.text);
    expect(block).toContain('href="/freestyle/modifier/spinning"');
    expect(block).not.toContain('href="/freestyle/families/butterfly"');
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

describe('symbolic full-page cross-links — modifier-family footer', () => {
  it('spinning modifier page renders the symbolic-crosslinks block', async () => {
    const res = await page('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    expect(res.text).toContain('symbolic-crosslinks');
    expect(res.text).toContain('href="/freestyle/families/butterfly"');
    expect(res.text).not.toContain('href="/freestyle/learn"');
    expect(res.text).not.toContain('href="/freestyle/progression/walking-family"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Landing-page educational pointer paragraph
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle — beginner on-ramp', () => {
  it('landing page carries a beginner on-ramp linking to the getting-started page', async () => {
    // The landing page opens with a beginner on-ramp that points newcomers at
    // the novice getting-started page.
    const res = await page('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/New to freestyle\?/i);
    expect(res.text).toContain('href="/freestyle/start"');
  });
});
