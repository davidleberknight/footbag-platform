/**
 * Integration tests for Dictionary Pedagogy Phase 3 — flagship
 * family-anchor trick-detail polish.
 *
 * Targets: whirl, butterfly, mirage. All three are FIRST_CLASS_TIER_1
 * members + carry ATOMIC_FLAG_DECOMPOSITIONS entries, so the
 * first-class Notation summary already renders. Phase 3 adds the
 * family-anchor callout in the trick-family section, making the dual
 * role (trick + family-anchor) explicit on the trick page itself.
 *
 * Contract under test:
 *   - whirl, butterfly, mirage, osis trick-detail pages all render the
 *     family-anchor callout
 *   - Callout names the trick + family + conserved terminal mechanic
 *   - Cross-link points to /freestyle/tricks?view=family#family-{slug}
 *   - Each page's existing first-class Notation summary still renders
 *     (regression on FIRST_CLASS_TIER_1 + ATOMIC_FLAG_DECOMPOSITIONS)
 *   - The operational chain text matches the family invariant in
 *     spirit (both reference the same terminal mechanic)
 *   - A non-anchor trick (paradox-mirage) does NOT render the callout
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

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

const { dbPath } = setTestEnv('3166');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifier table for paradox-mirage (the non-anchor control).
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
  });

  // Anchor tricks: each is its own family. The slug-equals-family
  // condition activates familyAnchorContext when the family carries
  // an entry in FAMILY_INVARIANTS (DP-1's six terminal families).
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', base_trick: 'whirl',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
    notation: 'WHIRL',
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'dex', adds: '3', is_active: 1,
    notation: 'BUTTERFLY',
  });
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'dex', adds: '2', is_active: 1,
    notation: 'MIRAGE',
  });
  insertFreestyleTrick(db, {
    slug: 'osis', canonical_name: 'osis', base_trick: 'osis',
    trick_family: 'osis', category: 'bod', adds: '3', is_active: 1,
    notation: 'OSIS',
  });

  // Family descendants so hasFamilyMembers is true (trick-family
  // section renders only when length > 1).
  insertFreestyleTrick(db, {
    slug: 'paradox-whirl', canonical_name: 'paradox whirl', base_trick: 'whirl',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
    notation: 'PARADOX WHIRL',
  });
  insertFreestyleTrick(db, {
    slug: 'ripwalk', canonical_name: 'ripwalk', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
    notation: 'STEPPING BUTTERFLY',
  });
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage', canonical_name: 'paradox mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'PARADOX MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'paradox-mirage', 'paradox', 1);
  insertFreestyleTrick(db, {
    slug: 'spinning-osis', canonical_name: 'spinning osis', base_trick: 'osis',
    trick_family: 'osis', category: 'compound', adds: '4', is_active: 1,
    notation: 'SPINNING OSIS',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Phase 3 — family-anchor callout on flagship trick-detail pages', () => {
  it.each([
    { slug: 'whirl',     family: 'whirl',     invariant: 'leggy in dex &gt; ss clipper' },
    { slug: 'butterfly', family: 'butterfly', invariant: 'hippy out dex &gt; ss clipper' },
    { slug: 'mirage',    family: 'mirage',    invariant: 'hippy in dex &gt; op toe' },
    { slug: 'osis',      family: 'osis',      invariant: 'spin &gt; ss clipper' },
  ])('$slug page renders the family-anchor callout with the family invariant', async ({ slug, family, invariant }) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-family-anchor-callout"/);
    expect(res.text).toMatch(/family-anchor trick/i);
    expect(res.text).toContain(invariant);
    // Cross-link to family-browse view at the #family-{slug} anchor.
    // Handlebars escapes '=' to '&#x3D;' inside href attributes; assert
    // the escaped form that actually appears in the HTTP response body.
    expect(res.text).toContain(`/freestyle/tricks?view&#x3D;family#family-${family}`);
  });

  it.each([
    { slug: 'whirl',     name: 'whirl' },
    { slug: 'butterfly', name: 'butterfly' },
    { slug: 'mirage',    name: 'mirage' },
    { slug: 'osis',      name: 'osis' },
  ])('$slug callout names "Conserved terminal mechanic" as the labeled invariant', async ({ slug }) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).toMatch(/Conserved terminal mechanic/i);
  });
});

describe('flagship anchors — universal notation card renders', () => {
  it.each(['whirl', 'butterfly', 'mirage', 'osis'])(
    '%s page renders the universal notation card (Execution notation + ADD derivation)',
    async (slug) => {
      const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
      // Execution notation section: the operational chain renders as op-tokens.
      expect(res.text).toMatch(/operational-notation-display"[^>]*aria-label="Execution notation"/);
      expect(res.text).toMatch(/<h2>Execution notation<\/h2>/);
      // ADD derivation section.
      expect(res.text).toMatch(/trick-add-analysis"[^>]*aria-label="ADD derivation"/);
      expect(res.text).toMatch(/<dt>ADD<\/dt>/);
    },
  );

  it.each([
    { slug: 'whirl',     breakdown: 'xbody(1) + dex(1) + stall(1)' },
    { slug: 'butterfly', breakdown: 'dex(1) + xbody(1) + stall(1)' },
    { slug: 'mirage',    breakdown: 'dex(1) + stall(1)' },
    { slug: 'osis',      breakdown: 'spin(1) + xbod(1) + stall(1)' },
  ])('$slug ADD breakdown surfaces the curator-published flag decomposition', async ({ slug, breakdown }) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).toContain(breakdown);
  });
});

describe('Phase 3 — non-anchor tricks do NOT render the family-anchor callout', () => {
  it('paradox-mirage page does NOT render the callout (compound, not an anchor)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-family-anchor-callout"/);
    // The page's existing family chip + family lineage still render,
    // but they don't claim anchor status on this row.
    expect(res.text).not.toMatch(/<strong>paradox mirage<\/strong>\s+is the/i);
  });
});

describe('base-family paragraph appears on the family-anchor page only', () => {
  // The generic base-family prose (FAMILY_NOTES) belongs on the base trick's own
  // page, not repeated on every derivative About section.
  it('the mirage base page renders the base-family paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The mirage is the foundational 2-ADD dex base');
  });

  it('a mirage derivative does NOT repeat the base-family paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('The mirage is the foundational 2-ADD dex base');
  });

  it('a whirl derivative does NOT repeat the whirl base-family paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('The whirl is the central rotational base');
  });
});

describe('Phase 3 — no curator-internal language leakage', () => {
  it.each(['whirl', 'butterfly', 'mirage', 'osis'])(
    '%s callout does not expose pt##/Slice/Wave/Sprint labels',
    async (slug) => {
      const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
      const startIdx = res.text.indexOf('trick-family-anchor-callout');
      expect(startIdx).toBeGreaterThan(0);
      // Find the end of the callout block.
      const endIdx = res.text.indexOf('</div>', res.text.indexOf('trick-family-anchor-invariant', startIdx));
      const region = res.text.slice(startIdx, endIdx);
      expect(region).not.toMatch(/\bpt\d+\b/i);
      expect(region).not.toMatch(/Slice [A-Z]\b/);
      expect(region).not.toMatch(/Wave[- ]?\d/i);
      expect(region).not.toMatch(/Sprint/i);
      expect(region).not.toMatch(/FAMILY_INVARIANTS/);
      expect(region).not.toMatch(/curatorConfirmPending/i);
    },
  );
});

describe('compact structural-fact block', () => {
  const blockOf = (html: string): string => {
    const i = html.indexOf('trick-structural-facts"');
    if (i < 0) return '';
    return html.slice(i, html.indexOf('</section>', i));
  };

  it('a derivative surfaces family base, movement system, neighborhood, and modifier with links', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    const block = blockOf(res.text);
    expect(block).not.toBe('');
    expect(block).toContain('Family base');
    expect(block).toContain('href="/freestyle/tricks/mirage"');
    expect(block).toContain('Movement system');
    expect(block).toContain('href="/freestyle/tricks?view=movement-system#movement-axis-entry-topology"');
    expect(block).toContain('Movement neighborhood');
    expect(block).toContain('href="/freestyle/tricks?view=topology#topology-hippy-downtime-dex"');
    expect(block).toContain('Modifier');
    expect(block).toContain('href="/freestyle/modifier/paradox"');
    // Each classification carries a one-line beginner explanation.
    expect(block).toContain('structural-fact-note');
    expect(block).toContain('The hips pivot between two dexterity moves');
    // The neighborhood grouping is marked exploratory in plain language (no
    // "observational" jargon).
    expect(block).toContain('>exploratory<');
    expect(block).not.toContain('>observational<');
  });

  it('the family base row is suppressed on the base trick page (no self-reference)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    const block = blockOf(res.text);
    // mirage is its own family base, so the block (if present) carries no
    // Family base row pointing at itself.
    expect(block).not.toContain('Family base');
  });
});
