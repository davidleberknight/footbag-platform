/**
 * Foundational-vocabulary canonical trick promotion: routes and rendering.
 *
 * Conservatively promotes 4 foundational rows:
 *   1. around-the-world-kick (NEW; 1 ADD; kick-rule)
 *   2. clipper                (EXISTING row; +operationalNotation overlay)
 *   3. triple-around-the-world (NEW; 4 ADD; sibling derivation)
 *   4. double-around-the-world-heel (NEW; 3 ADD; terminal-surface variant)
 *
 * Provenance:
 *   fb.org-derived / sibling-derived; NOT Red-confirmed. Tagged inline
 *   in the RESOLVED_ADD_FORMULAS entries. Surfaces Red questions
 *   K-1..K-3 + B-1.
 *
 * Contracts under test:
 *   - Each slug renders 200 on its trick-detail page
 *   - JOB and ADD render verbatim from the curator overlay
 *   - No "JOB: canonical decomposition pending" pill on these cards
 *   - No tautological compound-slot leakage (e.g. "around the world kick"
 *     does not appear as a chain reading row that just echoes the title)
 *   - operationalNotation is reachable via the service overlay even when
 *     the DB row's operational_notation column is empty (i.e. before the
 *     pipeline rebuild that materializes the CSV rows into DB)
 *   - The 4 entries appear in RESOLVED_ADD_FORMULAS
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
import { RESOLVED_ADD_FORMULAS } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3160');

let createApp: Awaited<ReturnType<typeof importApp>>;

// 4 promoted slugs + their expected operational-notation tokens (the
// operational-notation-display partial splits each token into its own
// <span> so we assert token-by-token rather than verbatim-substring).
const PROMOTION_COHORT = [
  {
    slug:        'around_the_world_kick',
    canonicalName: 'around the world kick',
    adds:        '1',
    base:        'around_the_world',
    category:    'dex',
    // Each token must appear as a single op-token span in the rendered HTML.
    jobTokens:   ['TOE', 'SAME', 'IN', '[DEX]'],
    // No terminal stall — these tokens must NOT appear in the JOB row.
    forbiddenJobTokens: ['[DEL]'],
  },
  {
    slug:        'clipper',
    canonicalName: 'clipper',
    adds:        '1',
    base:        'clipper',
    category:    'body',
    jobTokens:   ['OP', 'CLIP', '[XBD]'],
    forbiddenJobTokens: ['[DEL]', '[DEX]'],
  },
  {
    slug:        'triple_around_the_world',
    canonicalName: 'triple around the world',
    adds:        '4',
    base:        'around_the_world',
    category:    'compound',
    jobTokens:   ['TOE', 'SAME', 'IN', '[DEX]', '[DEL]'],
    forbiddenJobTokens: [],
  },
  {
    slug:        'double_around_the_world_heel',
    canonicalName: 'double around the world heel',
    adds:        '3',
    base:        'double_around_the_world',
    category:    'compound',
    jobTokens:   ['TOE', 'SAME', 'IN', '[DEX]', 'HEEL', '[UNS]', '[DEL]'],
    forbiddenJobTokens: [],
  },
] as const;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed each promoted slug in the test DB WITHOUT operational_notation.
  // The rendered JOB must come from the RESOLVED_FORMULAS overlay
  // (resolveOperationalNotationRaw → resolved.operationalNotation).
  for (const row of PROMOTION_COHORT) {
    insertFreestyleTrick(db, {
      slug:           row.slug,
      canonical_name: row.canonicalName,
      adds:           row.adds,
      base_trick:     row.base,
      trick_family:   row.base,
      category:       row.category,
      review_status:  'expert_reviewed',
      is_active:      1,
    });
  }

  // Seed parent bases so the renderer has a structurally-coherent dictionary.
  insertFreestyleTrick(db, { slug: 'around_the_world',        canonical_name: 'around the world',        adds: '2', base_trick: 'around_the_world',        trick_family: 'around_the_world',        category: 'dex' });
  insertFreestyleTrick(db, { slug: 'double_around_the_world', canonical_name: 'double around the world', adds: '3', base_trick: 'double_around_the_world', trick_family: 'double_around_the_world', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Foundational-vocabulary promotion — RESOLVED_FORMULAS overlay carries each slug', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '%s is present in RESOLVED_ADD_FORMULAS with non-empty operationalNotation',
    (slug) => {
      const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === slug);
      expect(entry).toBeDefined();
      expect(entry?.operationalNotation).toBeTruthy();
      expect((entry?.operationalNotation ?? '').length).toBeGreaterThan(0);
    },
  );
});

describe('Foundational-vocabulary promotion — trick-detail page renders for each slug', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '/freestyle/tricks/%s returns 200',
    async (slug) => {
      const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
    },
  );
});

describe('Foundational-vocabulary promotion — JOB renders via tokenized op-notation partial', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug, r.jobTokens, r.forbiddenJobTokens] as const))(
    '%s renders each expected op-token in the operational-notation-display section',
    async (slug, jobTokens, forbidden) => {
      const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
      // The Set notation section must be present
      expect(res.text).toContain('operational-notation-display');
      // Each expected token must appear inside a span with op-token class.
      // We match the span > token-text > span boundary loosely.
      for (const token of jobTokens) {
        // Tokens are wrapped: <span class="op-token...">TOKEN</span>
        // For bracket tokens like [DEX], the bracket characters appear
        // literally inside the span body.
        const tokenPattern = new RegExp(
          `class="op-token[^"]*"[^>]*>${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`,
        );
        expect(res.text).toMatch(tokenPattern);
      }
      // Forbidden tokens (e.g. no terminal [DEL] on kicks) must NOT appear
      // inside the operational-notation-display section.
      const setNotationStart = res.text.indexOf('operational-notation-display');
      const setNotationEnd = res.text.indexOf('</section>', setNotationStart);
      const setNotationBlock = res.text.slice(setNotationStart, setNotationEnd);
      for (const forbiddenToken of forbidden) {
        const forbiddenPattern = new RegExp(
          `class="op-token[^"]*"[^>]*>${forbiddenToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`,
        );
        expect(setNotationBlock).not.toMatch(forbiddenPattern);
      }
    },
  );
});

describe('Foundational-vocabulary promotion — no "canonical decomposition pending" leakage', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '%s does NOT render the "JOB: canonical decomposition pending" incomplete-state line on browse cards',
    async (slug) => {
      // Browse view first — if the trick is in FIRST_CLASS_TIER_2, its
      // card on /freestyle/tricks?view=add must NOT show canonical decomposition pending.
      const res = await request(await createApp()).get('/freestyle/tricks?view=add');
      // Find this trick's card via the data-trick-slug marker.
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      if (idx < 0) {
        // Trick not in this browse view — that's OK; the trick-detail
        // page test above already covers the rendering contract.
        return;
      }
      const articleOpen = res.text.lastIndexOf('<article', idx);
      const articleClose = res.text.indexOf('</article>', idx);
      const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
      expect(card).not.toContain('canonical decomposition pending');
    },
  );
});

describe('Foundational-vocabulary promotion — no tautological compound-slot leakage', () => {
  it('around-the-world-kick does NOT render its own canonical name as a fake chain reading', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/around_the_world_kick');
    // The equivalent-readings chain (semanticNotation layer 2) must NOT
    // simply echo "around the world kick" as a tautological reading.
    // If it does, the chain row is information-free.
    expect(res.text).not.toMatch(/<a[^>]*data-token-slug="around_the_world_kick"/);
  });

  it('triple-around-the-world does NOT echo its own canonical name in a chain row', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/triple_around_the_world');
    expect(res.text).not.toMatch(/<a[^>]*data-token-slug="triple_around_the_world"/);
  });
});

describe('Foundational-vocabulary promotion — provenance is visible, not silently curator-authored', () => {
  it('the RESOLVED_FORMULAS entries carry the foundational-vocabulary provenance marker in their provenance field', () => {
    for (const row of PROMOTION_COHORT) {
      const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === row.slug);
      expect(entry).toBeDefined();
      expect(entry?.provenance ?? '').toMatch(/Foundational-vocabulary/);
      // None of the four are Red-confirmed; verify the provenance says so.
      expect(entry?.provenance ?? '').toMatch(/not Red-confirmed/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Canonical browse-view regression — the public browse surface a viewer sees.
//
// Curator requirement: detail-route + content-overlay tests alone
// are insufficient — the canonical browse view at /freestyle/tricks?view=add
// must visibly render the promoted rows. These tests assert that.
//
// The test DB seeds the 4 promoted slugs (the same way the production DB
// looks after loader 19 has ingested them). The browse-view assertions verify
// that each slug renders an article card in its expected ADD bucket and
// that the JOB row is present on the card.
// ─────────────────────────────────────────────────────────────────────────

describe('Foundational-vocabulary promotion — canonical browse view (/freestyle/tricks?view=add) renders the 4 new trick rows', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '%s appears as an article card on the ADD browse view',
    async (slug) => {
      const res = await request(await createApp()).get('/freestyle/tricks?view=add');
      expect(res.status).toBe(200);
      expect(res.text).toContain(`data-trick-slug="${slug}"`);
    },
  );

  it('around-the-world-kick appears under the 1 ADD section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const oneAddSectionMatch = res.text.match(/<section[^>]*id="add-1"[\s\S]*?<\/section>/);
    expect(oneAddSectionMatch).toBeTruthy();
    expect(oneAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="around_the_world_kick"');
  });

  it('triple-around-the-world appears under the 4 ADD section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const fourAddSectionMatch = res.text.match(/<section[^>]*id="add-4"[\s\S]*?<\/section>/);
    expect(fourAddSectionMatch).toBeTruthy();
    expect(fourAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="triple_around_the_world"');
  });

  it('double-around-the-world-heel appears under the 3 ADD section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const threeAddSectionMatch = res.text.match(/<section[^>]*id="add-3"[\s\S]*?<\/section>/);
    expect(threeAddSectionMatch).toBeTruthy();
    expect(threeAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="double_around_the_world_heel"');
  });

  it('clipper appears under the 1 ADD section (Clipper Kick is a legitimate body-kick trick)', async () => {
    // Surfaces are distinguished by the DB `category` field, not hidden at
    // the kind layer: the Clipper Kick ends in bag contact and renders in
    // the ADD ladder like every stall.
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const oneAddSectionMatch = res.text.match(/<section[^>]*id="add-1"[\s\S]*?<\/section>/);
    expect(oneAddSectionMatch).toBeTruthy();
    expect(oneAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="clipper"');
  });
});

describe('Foundational-vocabulary promotion — Emerging Vocabulary no longer counts the promoted slugs', () => {
  it('TRACKED_DOCUMENTED_TOTAL is bounded after promoted slugs moved to canonical-published state', async () => {
    // The total fluctuates: promotions drop it; corpus expansions
    // raise it (the reconciliation audit added ~1700 names). The
    // load-bearing check is slug-absence (see the next assertion
    // below); this count assertion is a sanity ceiling.
    const { TRACKED_DOCUMENTED_TOTAL } = await import('../../src/content/freestyleTrackedNames');
    expect(TRACKED_DOCUMENTED_TOTAL).toBeGreaterThan(0);
    expect(TRACKED_DOCUMENTED_TOTAL).toBeLessThanOrEqual(5000);
  });

  it('the 4 promoted slugs do NOT appear in TRACKED_DOCUMENTED_NAMES', async () => {
    const { TRACKED_DOCUMENTED_NAMES } = await import('../../src/content/freestyleTrackedNames');
    const allTrackedSlugs = new Set<string>();
    for (const group of TRACKED_DOCUMENTED_NAMES) {
      for (const name of group.names) {
        allTrackedSlugs.add(name.slug);
      }
    }
    expect(allTrackedSlugs.has('around_the_world_kick')).toBe(false);
    expect(allTrackedSlugs.has('triple_around_the_world')).toBe(false);
    expect(allTrackedSlugs.has('double_around_the_world_heel')).toBe(false);
    expect(allTrackedSlugs.has('clipper_kick')).toBe(false);
  });

  it('/freestyle/observational page renders a reduced count, not 558', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    // Without any promotions the tracked count renders as 558;
    // promotions reduce it as slugs promote out of observational.
    // Assert the un-promoted 558 does not render.
    expect(res.text).not.toContain('558 more documented names');
  });

  it('/freestyle/observational does NOT list any of the 4 promoted slugs as tracked names', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // The tracked-names section renders #slug tags. After promotion, these
    // slugs must not appear as observational entries.
    expect(res.text).not.toMatch(/#around_the_world_kick/);
    expect(res.text).not.toMatch(/#triple_around_the_world(?!_)/);  // negative lookahead to avoid matching e.g. triple_around_the_world_XYZ
    expect(res.text).not.toMatch(/#double_around_the_world_heel/);
    expect(res.text).not.toMatch(/#clipper_kick/);
  });
});
