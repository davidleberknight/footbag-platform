/**
 * Integration tests for flagship family-anchor trick-detail polish.
 *
 * Targets: whirl, butterfly, mirage. All three are FIRST_CLASS_TIER_1
 * members + carry ATOMIC_FLAG_DECOMPOSITIONS entries, so the
 * first-class Notation summary already renders.
 *
 * Contract under test:
 *   - each flagship page's family browse link resolves to the family's own
 *     page in the family view, for a family parent and a minor lineage alike
 *   - Each page's existing first-class Notation summary still renders
 *     (regression on FIRST_CLASS_TIER_1 + ATOMIC_FLAG_DECOMPOSITIONS)
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
  // A third member each for whirl, butterfly and osis: the family view gives a
  // family its own section only from three active tricks, as every real family
  // parent has, so a two-trick family would have no section to link to.
  insertTrickAsRebuilt(db, {
    slug: 'spinning_whirl', canonical_name: 'spinning whirl', base_trick: 'whirl',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
    notation: 'SPINNING WHIRL',
  });
  insertTrickAsRebuilt(db, {
    slug: 'dimwalk', canonical_name: 'dimwalk', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
    notation: 'PIXIE BUTTERFLY',
  });
  insertTrickAsRebuilt(db, {
    slug: 'paradox_osis', canonical_name: 'paradox osis', base_trick: 'osis',
    trick_family: 'osis', category: 'compound', adds: '4', is_active: 1,
    notation: 'PARADOX OSIS',
  });
  // Reverse whirl anchors a minor lineage that carries a shared-structure line.
  // Three members, like the real lineage, so the family view gives it a page
  // of its own for the trick page's browse link to land on.
  insertTrickAsRebuilt(db, {
    slug: 'pixie_rev_whirl', canonical_name: 'pixie reverse whirl', base_trick: 'rev_whirl',
    trick_family: 'rev_whirl', category: 'compound', adds: '4', is_active: 1,
    notation: 'PIXIE REVERSE WHIRL',
  });
  insertTrickAsRebuilt(db, {
    slug: 'rev_whirl', canonical_name: 'Reverse Whirl', base_trick: 'rev_whirl',
    trick_family: 'rev_whirl', category: 'dex', adds: '3', is_active: 1,
    notation: 'REVERSE WHIRL',
  });
  insertTrickAsRebuilt(db, {
    slug: 'paradox_rev_whirl', canonical_name: 'paradox reverse whirl', base_trick: 'rev_whirl',
    trick_family: 'rev_whirl', category: 'compound', adds: '4', is_active: 1,
    notation: 'PARADOX REVERSE WHIRL',
  });
  insertTrickAsRebuilt(db, {
    slug: 'spinning_osis', canonical_name: 'spinning osis', base_trick: 'osis',
    trick_family: 'osis', category: 'compound', adds: '4', is_active: 1,
    notation: 'SPINNING OSIS',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('every family link on a flagship page lands on something its target renders', () => {
  // The browse link the template writes, with Handlebars' escaping of "="
  // undone so it can be requested.
  const browseHref = (html: string): string => {
    const m = html.match(/<a class="action-link" href="([^"]+)" data-family-browse>/);
    expect(m, 'the page carries no family browse link').not.toBeNull();
    return m![1]!.replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
  };

  // Defect caught: the link that stands in for the family's membership lands
  // on a page that does not show the family, so a reader loses the family.
  it.each(['whirl', 'butterfly', 'mirage', 'osis', 'rev_whirl'])(
    'the %s browse link resolves: its fragment is an id on the target, or the target lists the trick',
    async (slug) => {
      const href = browseHref((await page(`/freestyle/tricks/${slug}`)).text);
      const [path, fragment] = href.split('#');
      const target = await page(path!);
      expect(target.status, href).toBe(200);
      if (fragment) {
        expect(target.text, `${href}: no element carries id="${fragment}"`).toContain(`id="${fragment}"`);
      } else {
        expect(target.text, `${href}: the target does not list the trick`)
          .toContain(`href="/freestyle/tricks/${slug}"`);
      }
    },
  );

  // Defect caught: a minor lineage's browse link goes somewhere other than the
  // lineage's own page in the family view, so the reader lands on the wrong family.
  it('a minor lineage links to its own page in the family view, which renders its section', async () => {
    const href = browseHref((await page('/freestyle/tricks/rev_whirl')).text);
    expect(href).toBe('/freestyle/tricks?view=family&family=rev_whirl');
    expect((await page(href)).text).toContain('id="family-rev_whirl"');
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
