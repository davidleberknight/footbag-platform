/**
 * Integration tests for the DISCOVERABILITY phase of the symbolic subsystem.
 *
 * Covers two surfaces:
 *   1. Trick-page educational CTAs, decided from the trick's own structure:
 *      built on the butterfly → the Butterfly family page
 *      built on the whirl, or carrying the spinning modifier → spinning modifier page
 *   2. Landing-page educational pointer paragraph at /freestyle.
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
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // butterfly-wing-topology members
  insertTrickAsRebuilt(db, { slug: 'butterfly',  canonical_name: 'butterfly',  adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'ripwalk',    canonical_name: 'ripwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'sidewalk',   canonical_name: 'sidewalk',   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'dimwalk',    canonical_name: 'dimwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'matador',    canonical_name: 'matador',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'phoenix',    canonical_name: 'phoenix',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'dada_curve', canonical_name: 'dada curve', adds: '4', base_trick: null,        trick_family: 'dada_curve', category: 'compound' });

  // whirl-rotational-topology + spinning-family members
  insertTrickAsRebuilt(db, { slug: 'whirl',          canonical_name: 'whirl',          adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'montage',        canonical_name: 'montage',        adds: '7', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });

  // A trick OUTSIDE both topologies — used to verify CTAs are NOT injected.
  insertTrickAsRebuilt(db, { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });

  // montage carries the spinning modifier as well as its whirl base, so two
  // conditions fire the same link.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_type: 'rotational' });
  insertFreestyleTrickModifierLink(db, 'montage', 'spinning');

  // Tricks no stored grouping knows about: one published on the butterfly, one
  // built on the mirage but carrying the spinning modifier. Their links can come
  // only from their own structure.
  insertTrickAsRebuilt(db, { slug: 'fresh_walk',      canonical_name: 'fresh walk',      adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertTrickAsRebuilt(db, { slug: 'spinning_mirage', canonical_name: 'spinning mirage', adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrickModifierLink(db, 'spinning_mirage', 'spinning');

  // bigwalk is filed under the butterfly in the stored grouping every test
  // database is seeded with; here it sits on a different base, so the page must
  // follow the row, not the stale grouping.
  insertTrickAsRebuilt(db, { slug: 'bigwalk', canonical_name: 'bigwalk', adds: '5', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });

  // scorpions_tail has no modifier link rows; its curator-published formula
  // names the spinning operator, which the Structural Facts block shows.
  insertTrickAsRebuilt(db, { slug: 'scorpions_tail', canonical_name: "scorpion's tail", adds: '5', base_trick: 'down_double_down', trick_family: 'down_double_down', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 2. Trick-page educational CTAs
// ─────────────────────────────────────────────────────────────────────────

// The teaching-page links a trick page closes Related Tricks with, each a
// paragraph holding one link. A trick page also links to the spinning modifier
// from its structural facts, inside a definition list, so matching the
// paragraph-wrapped link keeps that one out.
const BUTTERFLY_LINK = '<p><a href="/freestyle/families/butterfly">';
const SPINNING_LINK  = '<p><a href="/freestyle/modifier/spinning">';
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

describe('trick-page educational links — butterfly-based tricks', () => {
  // Defect caught: a trick built on the butterfly offering no way to the
  // walking-family teaching page.
  it('every butterfly-based trick links to the Butterfly family page', async () => {
    for (const slug of ['butterfly', 'ripwalk', 'sidewalk', 'dimwalk', 'matador', 'phoenix']) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(200);
      expect(countOf(res.text, BUTTERFLY_LINK), slug).toBe(1);
    }
  });
});

describe('trick-page educational links — spinning and whirl-based tricks', () => {
  it('a whirl-based or spinning trick links to the spinning modifier page', async () => {
    for (const slug of ['spinning-whirl', 'montage']) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(200);
      expect(countOf(res.text, SPINNING_LINK), slug).toBeGreaterThan(0);
    }
  });

  it('a trick earning the spinning link twice shows it once (de-duped by href)', async () => {
    // montage is whirl-based and carries the spinning modifier.
    const res = await page('/freestyle/tricks/montage');
    expect(res.status).toBe(200);
    expect(countOf(res.text, SPINNING_LINK)).toBe(1);
  });
});

describe('trick-page educational links — non-triggering tricks', () => {
  it('/freestyle/tricks/mirage renders no educational link', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(countOf(res.text, BUTTERFLY_LINK)).toBe(0);
    expect(countOf(res.text, SPINNING_LINK)).toBe(0);
  });
});

describe('trick-page educational links follow the trick, not a stored grouping', () => {
  it('a trick no grouping has heard of gets the Butterfly family link from its butterfly base', async () => {
    // A trick published in the application has no stored grouping row, and
    // without this it would never be pointed at the family it belongs to.
    const res = await page('/freestyle/tricks/fresh_walk');
    expect(res.status).toBe(200);
    expect(countOf(res.text, BUTTERFLY_LINK)).toBe(1);
  });

  it('the spinning modifier alone earns the spinning link, on a base that is not the whirl', async () => {
    const res = await page('/freestyle/tricks/spinning_mirage');
    expect(res.status).toBe(200);
    expect(countOf(res.text, SPINNING_LINK)).toBe(1);
    expect(countOf(res.text, BUTTERFLY_LINK)).toBe(0);
  });

  it('a trick with no modifier link rows takes its modifiers from the curated formula, as its Structural Facts do', async () => {
    // Otherwise the page lists spinning among the trick's facts while offering
    // no link to the spinning modifier's teaching page.
    const res = await page('/freestyle/tricks/scorpions_tail');
    expect(res.status).toBe(200);
    expect(countOf(res.text, SPINNING_LINK)).toBe(1);
  });

  it('a trick moved off the butterfly loses the walking-family link the stored grouping still gives it', async () => {
    // An edit in the trick editor must change the page at once; a stale stored
    // grouping would keep pointing a mirage-based trick at the walking family.
    const res = await page('/freestyle/tricks/bigwalk');
    expect(res.status).toBe(200);
    expect(countOf(res.text, BUTTERFLY_LINK)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Landing-page educational pointer paragraph
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
