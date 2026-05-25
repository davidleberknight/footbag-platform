/**
 * Pre-Adrian foundational-vocabulary canonical promotion (2026-05-25).
 *
 * Conservative slice promoting 4 foundational rows:
 *   1. around-the-world-kick (NEW; 1 ADD; kick-rule)
 *   2. clipper                (EXISTING row; +operationalNotation overlay)
 *   3. triple-around-the-world (NEW; 4 ADD; sibling derivation)
 *   4. double-around-the-world-heel (NEW; 3 ADD; terminal-surface variant)
 *
 * Provenance:
 *   fb.org-derived / sibling-derived; NOT Red-confirmed. Tagged inline
 *   in the RESOLVED_FORMULAS_SPRINT_1 entries. Surfaces Red questions
 *   K-1..K-3 + B-1 in exploration/pre-red-cleanup-2026-05-25/CLEANUP_AUDIT.md.
 *
 * Contracts under test:
 *   - Each slug renders 200 on its trick-detail page
 *   - JOB and ADD render verbatim from the curator overlay
 *   - No "JOB: notation pending" pill on these cards
 *   - No tautological compound-slot leakage (e.g. "around the world kick"
 *     does not appear as a chain reading row that just echoes the title)
 *   - operationalNotation is reachable via the service overlay even when
 *     the DB row's operational_notation column is empty (i.e. before the
 *     pipeline rebuild that materializes the CSV rows into DB)
 *   - The 4 entries appear in RESOLVED_FORMULAS_SPRINT_1
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

const { dbPath } = setTestEnv('3160');

let createApp: Awaited<ReturnType<typeof importApp>>;

// 4 promoted slugs + their expected operational-notation tokens (the
// operational-notation-display partial splits each token into its own
// <span> so we assert token-by-token rather than verbatim-substring).
const PROMOTION_COHORT = [
  {
    slug:        'around-the-world-kick',
    canonicalName: 'around the world kick',
    adds:        '1',
    base:        'around-the-world',
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
    slug:        'triple-around-the-world',
    canonicalName: 'triple around the world',
    adds:        '4',
    base:        'around-the-world',
    category:    'compound',
    jobTokens:   ['TOE', 'SAME', 'IN', '[DEX]', '[DEL]'],
    forbiddenJobTokens: [],
  },
  {
    slug:        'double-around-the-world-heel',
    canonicalName: 'double around the world heel',
    adds:        '3',
    base:        'double-around-the-world',
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
  insertFreestyleTrick(db, { slug: 'around-the-world',        canonical_name: 'around the world',        adds: '2', base_trick: 'around-the-world',        trick_family: 'around-the-world',        category: 'dex' });
  insertFreestyleTrick(db, { slug: 'double-around-the-world', canonical_name: 'double around the world', adds: '3', base_trick: 'double-around-the-world', trick_family: 'double-around-the-world', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Pre-Adrian promotion — RESOLVED_FORMULAS overlay carries each slug', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '%s is present in RESOLVED_FORMULAS_SPRINT_1 with non-empty operationalNotation',
    (slug) => {
      const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === slug);
      expect(entry).toBeDefined();
      expect(entry?.operationalNotation).toBeTruthy();
      expect((entry?.operationalNotation ?? '').length).toBeGreaterThan(0);
    },
  );
});

describe('Pre-Adrian promotion — trick-detail page renders for each slug', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '/freestyle/tricks/%s returns 200',
    async (slug) => {
      const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
    },
  );
});

describe('Pre-Adrian promotion — JOB renders via tokenized op-notation partial', () => {
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

describe('Pre-Adrian promotion — no "notation pending" leakage', () => {
  it.each(PROMOTION_COHORT.map(r => [r.slug] as const))(
    '%s does NOT render the "JOB: notation pending" incomplete-state line on browse cards',
    async (slug) => {
      // Browse view first — if the trick is in FIRST_CLASS_TIER_2, its
      // card on /freestyle/tricks?view=add must NOT show notation pending.
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
      expect(card).not.toContain('notation pending');
    },
  );
});

describe('Pre-Adrian promotion — no tautological compound-slot leakage', () => {
  it('around-the-world-kick does NOT render its own canonical name as a fake chain reading', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/around-the-world-kick');
    // The equivalent-readings chain (semanticNotation layer 2) must NOT
    // simply echo "around the world kick" as a tautological reading.
    // If it does, the chain row is information-free.
    expect(res.text).not.toMatch(/<a[^>]*data-token-slug="around-the-world-kick"/);
  });

  it('triple-around-the-world does NOT echo its own canonical name in a chain row', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/triple-around-the-world');
    expect(res.text).not.toMatch(/<a[^>]*data-token-slug="triple-around-the-world"/);
  });
});

describe('Pre-Adrian promotion — provenance is visible, not silently curator-authored', () => {
  it('the RESOLVED_FORMULAS entries carry the "Pre-Adrian" provenance marker in their provenance field', () => {
    for (const row of PROMOTION_COHORT) {
      const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === row.slug);
      expect(entry).toBeDefined();
      expect(entry?.provenance ?? '').toMatch(/Pre-Adrian/);
      // None of the four are Red-confirmed; verify the provenance says so.
      expect(entry?.provenance ?? '').toMatch(/not Red-confirmed/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Canonical browse-view regression (the surface Adrian will see).
//
// Per curator pushback 2026-05-25: detail-route + content-overlay tests
// are insufficient — the canonical browse view at /freestyle/tricks?view=add
// must visibly render the promoted rows. These tests assert that.
//
// The test DB seeds the 4 promoted slugs (the same way the production DB
// will look after loader 19 has ingested them, which has already been
// done in dev — see commit message). The browse-view assertions verify
// that each slug renders an article card in its expected ADD bucket and
// that the JOB row is present on the card.
// ─────────────────────────────────────────────────────────────────────────

describe('Pre-Adrian promotion — canonical browse view (/freestyle/tricks?view=add) renders the 3 new trick rows', () => {
  // clipper is INTENTIONALLY excluded from the ADD browse — the curator
  // discriminator at src/content/freestyleTrickKindOverrides.ts classifies
  // clipper as kind='surface' (the body-kick position, not a terminating
  // trick). The clipper row itself still receives the operationalNotation
  // overlay (verified separately by the trick-detail tests above).
  const ADD_BROWSE_VISIBLE = PROMOTION_COHORT.filter(r => r.slug !== 'clipper');

  it.each(ADD_BROWSE_VISIBLE.map(r => [r.slug] as const))(
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
    expect(oneAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="around-the-world-kick"');
  });

  it('triple-around-the-world appears under the 4 ADD section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const fourAddSectionMatch = res.text.match(/<section[^>]*id="add-4"[\s\S]*?<\/section>/);
    expect(fourAddSectionMatch).toBeTruthy();
    expect(fourAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="triple-around-the-world"');
  });

  it('double-around-the-world-heel appears under the 3 ADD section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const threeAddSectionMatch = res.text.match(/<section[^>]*id="add-3"[\s\S]*?<\/section>/);
    expect(threeAddSectionMatch).toBeTruthy();
    expect(threeAddSectionMatch?.[0] ?? '').toContain('data-trick-slug="double-around-the-world-heel"');
  });

  it('clipper is INTENTIONALLY excluded from the ADD browse (kind=surface per discriminator); concept represented via its own row + overlay', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    // The 1-ADD section does NOT render clipper as an article card
    // (because kind='surface' filters it out). This is by design.
    const oneAddSectionMatch = res.text.match(/<section[^>]*id="add-1"[\s\S]*?<\/section>/);
    expect(oneAddSectionMatch?.[0] ?? '').not.toContain('data-trick-slug="clipper"');
    // But the trick-detail page still renders (verified above) and the
    // RESOLVED_FORMULAS overlay carries OP CLIP [XBD] (verified above).
  });
});

describe('Pre-Adrian promotion — Emerging Vocabulary no longer counts the promoted slugs', () => {
  it('TRACKED_UNPUBLISHED_TOTAL decreased by 4 (558 → 554) after the 4 slugs moved to canonical-published state', async () => {
    const { TRACKED_UNPUBLISHED_TOTAL } = await import('../../src/content/freestyleTrackedNames');
    expect(TRACKED_UNPUBLISHED_TOTAL).toBe(554);
  });

  it('the 4 promoted slugs do NOT appear in TRACKED_UNPUBLISHED_NAMES', async () => {
    const { TRACKED_UNPUBLISHED_NAMES } = await import('../../src/content/freestyleTrackedNames');
    const allTrackedSlugs = new Set<string>();
    for (const group of TRACKED_UNPUBLISHED_NAMES) {
      for (const name of group.names) {
        allTrackedSlugs.add(name.slug);
      }
    }
    expect(allTrackedSlugs.has('around-the-world-kick')).toBe(false);
    expect(allTrackedSlugs.has('triple-around-the-world')).toBe(false);
    expect(allTrackedSlugs.has('double-around-the-world-heel')).toBe(false);
    expect(allTrackedSlugs.has('clipper-kick')).toBe(false);
  });

  it('/freestyle/observational page renders the updated 554 count, not 558', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    expect(res.text).toContain('554 more documented names');
    expect(res.text).not.toContain('558 more documented names');
  });

  it('/freestyle/observational does NOT list any of the 4 promoted slugs as tracked names', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // The tracked-names section renders #slug tags. After promotion, these
    // slugs must not appear as observational entries.
    expect(res.text).not.toMatch(/#around-the-world-kick/);
    expect(res.text).not.toMatch(/#triple-around-the-world(?!-)/);  // negative lookahead to avoid matching e.g. triple-around-the-world-XYZ
    expect(res.text).not.toMatch(/#double-around-the-world-heel/);
    expect(res.text).not.toMatch(/#clipper-kick/);
  });
});
