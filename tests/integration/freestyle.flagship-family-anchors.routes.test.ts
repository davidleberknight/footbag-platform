/**
 * Integration tests for flagship family-anchor trick-detail polish.
 *
 * Targets: whirl, butterfly, mirage. All three are FIRST_CLASS_TIER_1
 * members + carry ATOMIC_FLAG_DECOMPOSITIONS entries, so the
 * first-class Notation summary already renders. On top of that, the
 * family-anchor callout in the trick-family section makes the dual
 * role (trick + family-anchor) explicit on the trick page itself.
 *
 * Contract under test:
 *   - whirl, butterfly, mirage, osis trick-detail pages all render the
 *     family-anchor callout
 *   - Cross-link points to /freestyle/tricks?view=family#family-{slug}
 *   - Each page's existing first-class Notation summary still renders
 *     (regression on FIRST_CLASS_TIER_1 + ATOMIC_FLAG_DECOMPOSITIONS)
 *   - A non-anchor trick (paradox-mirage) does NOT render the callout
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
import {
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';
import { STAGED_CURATOR_CONTENT } from '../../freestyle/loaders/28a_seed_curator_content';

const { dbPath } = setTestEnv('3166');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  // Modifier table for paradox-mirage (the non-anchor control), each carrying
  // the beginner note the rebuild seeds for it.
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
    beginner_note: STAGED_CURATOR_CONTENT.beginnerNotes.get('paradox') ?? null,
  });
  // atomic supports the operator-fallback case (atom-smasher has no DB link).
  insertFreestyleTrickModifier(db, {
    slug: 'atomic', add_bonus: 1, add_bonus_rotational: 2, modifier_type: 'set',
    beginner_note: STAGED_CURATOR_CONTENT.beginnerNotes.get('atomic') ?? null,
  });
  // Folk-named compound with NO modifier link in the DB. Its modifiers must be
  // recovered from the RESOLVED_FORMULAS operator ('atomic + x-dex').
  insertTrickAsRebuilt(db, {
    slug: 'atom_smasher', canonical_name: 'atom smasher', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '4', is_active: 1,
    notation: 'ATOM SMASHER',
  });

  // Anchor tricks: each is its own family. The slug-equals-family
  // condition activates familyAnchorContext when the family carries
  // a shared-structure line (the six terminal families that have one).
  insertTrickAsRebuilt(db, {
    slug: 'whirl', canonical_name: 'whirl', base_trick: 'whirl',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
    notation: 'WHIRL',
  });
  insertTrickAsRebuilt(db, {
    slug: 'butterfly', canonical_name: 'butterfly', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'dex', adds: '3', is_active: 1,
    notation: 'BUTTERFLY',
  });
  insertTrickAsRebuilt(db, {
    slug: 'mirage', canonical_name: 'mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'dex', adds: '2', is_active: 1,
    notation: 'MIRAGE',
  });
  insertTrickAsRebuilt(db, {
    slug: 'osis', canonical_name: 'osis', base_trick: 'osis',
    trick_family: 'osis', category: 'bod', adds: '3', is_active: 1,
    notation: 'OSIS',
  });

  // Family descendants so hasFamilyMembers is true (trick-family
  // section renders only when length > 1).
  insertTrickAsRebuilt(db, {
    slug: 'paradox_whirl', canonical_name: 'paradox whirl', base_trick: 'whirl',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
    notation: 'PARADOX WHIRL',
  });
  insertTrickAsRebuilt(db, {
    slug: 'ripwalk', canonical_name: 'ripwalk', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
    notation: 'STEPPING BUTTERFLY',
  });
  insertTrickAsRebuilt(db, {
    slug: 'paradox_mirage', canonical_name: 'paradox mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'PARADOX MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'paradox_mirage', 'paradox', 1);
  insertTrickAsRebuilt(db, {
    slug: 'spinning_osis', canonical_name: 'spinning osis', base_trick: 'osis',
    trick_family: 'osis', category: 'compound', adds: '4', is_active: 1,
    notation: 'SPINNING OSIS',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('family-anchor callout on flagship trick-detail pages', () => {
  it('each flagship page renders the family-anchor callout linking to its family', async () => {
    for (const slug of ['whirl', 'butterfly', 'mirage', 'osis']) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(200);
      expect(res.text, slug).toMatch(/class="trick-family-anchor-callout"/);
      // Cross-link to family-browse view at the #family-{slug} anchor.
      // Handlebars escapes '=' to '&#x3D;' inside href attributes; assert
      // the escaped form that actually appears in the HTTP response body.
      expect(res.text, slug).toContain(`/freestyle/tricks?view&#x3D;family#family-${slug}`);
    }
  });
});

describe('flagship anchors — universal notation card renders', () => {
  it.each(['whirl', 'butterfly', 'mirage', 'osis'])(
    '%s page renders the universal notation card (Execution notation + ADD derivation)',
    async (slug) => {
      const res = await page(`/freestyle/tricks/${slug}`);
      // Execution notation section: the operational chain renders as op-tokens.
      expect(res.text).toMatch(/operational-notation-display"[^>]*aria-label="Execution notation"/);
      expect(res.text).toMatch(/<h2>Execution notation<\/h2>/);
      // Difficulty section: the value, then the derivation behind it.
      expect(res.text).toMatch(/trick-add-analysis"[^>]*aria-label="Difficulty"/);
      expect(res.text).toMatch(/<dt>Difficulty<\/dt>/);
      expect(res.text).toMatch(/class="trick-add-analysis-derivation"/);
    },
  );

  it.each([
    { slug: 'whirl',     breakdown: 'xbody(1) + dex(1) + stall(1)' },
    { slug: 'butterfly', breakdown: 'dex(1) + xbody(1) + stall(1)' },
    { slug: 'mirage',    breakdown: 'dex(1) + stall(1)' },
    { slug: 'osis',      breakdown: 'spin(1) + xbod(1) + stall(1)' },
  ])('$slug ADD breakdown surfaces the curator-published flag decomposition', async ({ slug, breakdown }) => {
    const res = await page(`/freestyle/tricks/${slug}`);
    expect(res.text).toContain(breakdown);
  });
});

describe('non-anchor tricks do NOT render the family-anchor callout', () => {
  it('paradox-mirage page does NOT render the callout (compound, not an anchor)', async () => {
    const res = await page('/freestyle/tricks/paradox_mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-family-anchor-callout"/);
    // The page's existing family chip + family lineage still render,
    // but they don't claim anchor status on this row.
    expect(res.text).not.toMatch(/<strong>paradox mirage<\/strong>\s+is the/i);
  });
});

describe('base-family paragraph appears on the family-anchor page only', () => {
  // The generic base-family prose (the family's trick-page note) belongs on the base trick's own
  // page, not repeated on every derivative About section.
  it('the mirage base page renders the base-family paragraph', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The mirage is the foundational 2-ADD dex base');
  });

  it('a mirage derivative does NOT repeat the base-family paragraph', async () => {
    const res = await page('/freestyle/tricks/paradox_mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('The mirage is the foundational 2-ADD dex base');
  });

  it('a whirl derivative does NOT repeat the whirl base-family paragraph', async () => {
    const res = await page('/freestyle/tricks/paradox_whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('The whirl is the central rotational base');
  });
});

describe('no curator-internal language leakage', () => {
  it.each(['whirl', 'butterfly', 'mirage', 'osis'])(
    '%s callout does not expose pt##/Slice/Wave/Sprint labels',
    async (slug) => {
      const res = await page(`/freestyle/tricks/${slug}`);
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

  it('a derivative surfaces family base and modifier with links, and nothing else', async () => {
    const res = await page('/freestyle/tricks/paradox_mirage');
    expect(res.status).toBe(200);
    const block = blockOf(res.text);
    expect(block).not.toBe('');
    expect(block).toContain('Family base');
    expect(block).toContain('href="/freestyle/tricks/mirage"');
    expect(block).toContain('Modifier');
    expect(block).toContain('href="/freestyle/modifier/paradox"');
    // Each classification carries a one-line beginner explanation.
    expect(block).toContain('structural-fact-note');
    expect(block).toContain('The hips pivot on a single dexterity');
    // No row for a grouping the dictionary does not offer a view of.
    expect(block).not.toMatch(/Movement system|Movement neighborhood/);
    expect(block).not.toContain('>observational<');
  });

  it('the family base row is suppressed on the base trick page (no self-reference)', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    const block = blockOf(res.text);
    // mirage is its own family base, so the block (if present) carries no
    // Family base row pointing at itself.
    expect(block).not.toContain('Family base');
  });

  it('a folk-named compound with no DB modifier link recovers its modifiers from the operator', async () => {
    const res = await page('/freestyle/tricks/atom_smasher');
    expect(res.status).toBe(200);
    const block = blockOf(res.text);
    expect(block).not.toBe('');
    // atom-smasher operator is 'atomic + x-dex'; atomic is a registered modifier,
    // x-dex is not, so only atomic surfaces. Atomic is taught on its set page,
    // so the link goes there directly rather than through the modifier redirect.
    expect(block).toContain('Modifier');
    expect(block).toContain('href="/freestyle/sets/atomic"');
    expect(block).not.toContain('href="/freestyle/modifier/x-dex"');
  });
});
