/**
 * Held-delay leg-over family + butterfly-kick + ATW-family first-class
 * rendering — pre-Adrian polish slice (2026-05-25).
 *
 * Three concerns under test:
 *
 * 1. Held-delay leg-over family — hop-over / walk-over / wrap:
 *    each renders with the curator-overlay JOB on its detail page; the
 *    three are sibling-not-merge (distinct event signatures); wrap
 *    is now a canonical row (was observational).
 *
 * 2. Butterfly-kick correction — was 3 ADD with terminal [XBD]; the
 *    user-confirmed reading is 2 ADD per fb.org [dex] [bod]. DB row
 *    updated via red_corrections; overlay carries the resolved formula.
 *
 * 3. First-class browse-card rendering — the three ATW-family promotions
 *    (around-the-world-kick / triple-around-the-world /
 *    double-around-the-world-heel) plus the held-delay-family rows
 *    plus butterfly-kick all now appear in FIRST_CLASS_TIER_2 so the
 *    browse card renders the JOB + ADD row (was: bare op-notation text
 *    on the trick-detail page only).
 *
 * Observational backlog: wrap moves out of TRACKED_UNPUBLISHED_NAMES;
 * total decrements (was 554 → 553).
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
import { RESOLVED_FORMULAS_SPRINT_1 } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3163');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed the held-delay leg-over family + butterfly-kick + ATW-family
  // promotions. None of these need operational_notation in the DB
  // (overlay supplies the JOB); butterfly-kick is seeded with its
  // CORRECTED 2-ADD shape post-loader-19.
  insertFreestyleTrick(db, { slug: 'hop-over',  canonical_name: 'hop over',  adds: '2', base_trick: 'hop-over',  trick_family: 'hop-over',  category: 'body',     review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'walk-over', canonical_name: 'walk over', adds: '2', base_trick: 'walk-over', trick_family: 'walk-over', category: 'body',     review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'wrap',      canonical_name: 'wrap',      adds: '2', base_trick: 'wrap',      trick_family: 'wrap',      category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'butterfly-kick',     canonical_name: 'butterfly-kick',     adds: '2', base_trick: 'butterfly',     trick_family: 'butterfly',     category: 'body',     review_status: 'expert_reviewed', is_active: 1, operational_notation: 'SET > JUMP [BOD] > SAME or OP OUT [DEX]' });

  // ATW-family promotions — DB op_notation empty; overlay supplies JOB.
  insertFreestyleTrick(db, { slug: 'around-the-world-kick',        canonical_name: 'around the world kick',        adds: '1', base_trick: 'around-the-world',        trick_family: 'around-the-world',        category: 'dex',      review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'triple-around-the-world',      canonical_name: 'triple around the world',      adds: '4', base_trick: 'around-the-world',        trick_family: 'around-the-world',        category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'double-around-the-world-heel', canonical_name: 'double around the world heel', adds: '3', base_trick: 'double-around-the-world', trick_family: 'double-around-the-world', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });

  // Parent bases.
  insertFreestyleTrick(db, { slug: 'around-the-world',        canonical_name: 'around the world',        adds: '2', base_trick: 'around-the-world',        trick_family: 'around-the-world',        category: 'dex' });
  insertFreestyleTrick(db, { slug: 'double-around-the-world', canonical_name: 'double around the world', adds: '3', base_trick: 'double-around-the-world', trick_family: 'double-around-the-world', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'butterfly',               canonical_name: 'butterfly',               adds: '3', base_trick: 'butterfly',               trick_family: 'butterfly',               category: 'dex' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cardFor(slug: string, html: string): string {
  const startMarker = `data-trick-slug="${slug}"`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) throw new Error(`card not found: ${slug}`);
  const articleOpen  = html.lastIndexOf('<article', startIdx);
  const articleClose = html.indexOf('</article>', startIdx);
  return html.slice(articleOpen, articleClose + '</article>'.length);
}

describe('Held-delay leg-over family — RESOLVED_FORMULAS overlay carries each slug', () => {
  it.each([['hop-over'], ['walk-over'], ['wrap']] as const)(
    '%s has a curator-overlay operationalNotation in RESOLVED_FORMULAS_SPRINT_1',
    (slug) => {
      const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === slug);
      expect(entry).toBeDefined();
      expect(entry?.operationalNotation).toBeTruthy();
      expect(entry?.totalAdd).toBe(2);
      expect(entry?.provenance ?? '').toMatch(/Held-delay leg-over family/);
      expect(entry?.provenance ?? '').toMatch(/not Red-confirmed/i);
    },
  );

  it('hop-over JOB carries [BOD] + [DEL] tags (fb.org body-over-delay signature)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'hop-over');
    expect(entry?.operationalNotation).toMatch(/\[DEL\]/);
    expect(entry?.operationalNotation).toMatch(/\[BOD\]/);
  });

  it('walk-over JOB carries [DEL] + [DEX] tags (fb.org step-over signature)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'walk-over');
    expect(entry?.operationalNotation).toMatch(/\[DEL\]/);
    expect(entry?.operationalNotation).toMatch(/\[DEX\]/);
  });

  it('wrap JOB carries [DEL] + [DEX] tags (fb.org wrap-around signature)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'wrap');
    expect(entry?.operationalNotation).toMatch(/\[DEL\]/);
    expect(entry?.operationalNotation).toMatch(/\[DEX\]/);
  });
});

describe('Butterfly-kick correction — 2 ADD with [dex] [bod] reading', () => {
  it('RESOLVED_FORMULAS entry for butterfly-kick is 2 ADD with no terminal [XBD]', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'butterfly-kick');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(2);
    expect(entry?.operationalNotation).toMatch(/\[BOD\]/);
    expect(entry?.operationalNotation).toMatch(/\[DEX\]/);
    // The terminal [XBD] that prior IFPA DB row carried is dropped.
    expect(entry?.operationalNotation).not.toMatch(/\[XBD\]/);
    expect(entry?.provenance ?? '').toMatch(/Curator ruling 2026-05-25/);
    expect(entry?.provenance ?? '').toMatch(/Resolves Red Q K-1/);
  });

  it('trick-detail page for butterfly-kick renders 2 ADD (not 3)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly-kick');
    expect(res.status).toBe(200);
    // The hero meta-ribbon ADD chip is the canonical ADD value for the
    // trick. Verify it reads "2 ADD" — the parent butterfly (3 ADD)
    // legitimately appears elsewhere on the page (family lineage,
    // base-trick link, etc.), so we scope the assertion to the hero chip.
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">2 ADD<\/span>/);
    expect(res.text).not.toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">3 ADD<\/span>/);
  });
});

describe('First-class browse-card rendering — JOB+ADD card renders for promoted rows', () => {
  it.each([
    ['around-the-world-kick'],
    ['triple-around-the-world'],
    ['double-around-the-world-heel'],
    ['hop-over'],
    ['walk-over'],
    ['wrap'],
    ['butterfly-kick'],
  ] as const)(
    '%s renders the first-class JOB row on a shared-card browse view (no "notation pending")',
    async (slug) => {
      const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
      expect(res.status).toBe(200);
      const card = cardFor(slug, res.text);
      // First-class row present
      expect(card).toContain('dict-card-first-class-row');
      // JOB label rendered (not the muted incomplete-state pill)
      expect(card).toContain('<span class="dict-card-first-class-label">JOB:</span>');
      expect(card).not.toContain('notation pending');
      expect(card).not.toContain('dict-card-first-class-line--incomplete');
    },
  );
});

describe('Observational backlog — wrap is no longer counted', () => {
  it('TRACKED_UNPUBLISHED_TOTAL is bounded above (wrap + later promotions removed)', async () => {
    const { TRACKED_UNPUBLISHED_TOTAL } = await import('../../src/content/freestyleTrackedNames');
    // The total fluctuates: promotion waves drop it; corpus-expansion
    // waves (e.g. Wave 0 added ~1700 names to the reconciliation audit)
    // raise it. The load-bearing check is slug-absence (see the wrap
    // assertion below); this count assertion is a sanity ceiling to
    // ensure the file regeneration didn't catastrophically multiply
    // the corpus.
    expect(TRACKED_UNPUBLISHED_TOTAL).toBeGreaterThan(0);
    expect(TRACKED_UNPUBLISHED_TOTAL).toBeLessThanOrEqual(5000);
  });

  it('wrap does NOT appear in TRACKED_UNPUBLISHED_NAMES', async () => {
    const { TRACKED_UNPUBLISHED_NAMES } = await import('../../src/content/freestyleTrackedNames');
    const allSlugs = new Set<string>();
    for (const group of TRACKED_UNPUBLISHED_NAMES) {
      for (const name of group.names) allSlugs.add(name.slug);
    }
    expect(allSlugs.has('wrap')).toBe(false);
  });

  it('/freestyle/observational page renders the current tracked count, not the pre-slice 554', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('554 observational names awaiting review');
    // Whatever current count is, it should be present as the tracked-names
    // heading. Copy was changed 2026-05-27 from "more documented names" to
    // "observational names awaiting review" (Emerging Vocabulary repair).
    expect(res.text).toMatch(/\b\d+ observational names awaiting review\b/);
    expect(res.text).not.toMatch(/#wrap[^a-z-]/);  // negative lookahead so e.g. #wrap-around-X wouldn't match
  });
});
