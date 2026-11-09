/**
 * Integration tests for the Operators & Modifiers consistency layer.
 *
 * Verifies:
 *   - /freestyle/operators groups established operators by structural role
 *     (entry and side relationship, body rotation, head and body passage, set
 *     and preparatory, no-plant and suspension), in the dict-trick-row idiom
 *     shared with the dictionary and set encyclopedia.
 *   - Provisional names (symple, muted, flying) and the notation markers are not
 *     listed; the glossary defines them, and its entries lead to the provisional
 *     operator pages.
 *   - Set primitives (pixie, fairy, atomic, barraging, and the rest) are NOT
 *     listed here: they are first-class objects of the Set Encyclopedia, so the
 *     same concept is never presented as both a set and an operator.
 *   - Each modifier row carries a type chip, an ADD weight when tracked, a
 *     status pill, and View-details / Browse-tricks click-throughs.
 *   - Paradox appears once as a directory row linking to its teaching page; the
 *     long explanation is not duplicated at the foot of the page.
 *   - Universal detail resolution: a known modifier without a teaching page
 *     resolves to a data-driven stub (not 404); an unknown slug 404s.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Handlebars from 'handlebars';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';
import {
  getOperatorReferenceEntry,
  getTier1OperatorDefinition,
} from '../../src/content/freestyleOperatorReference';

const { dbPath } = setTestEnv('3097');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifier inventory: two set modifiers (canonical-set formula) and a body
  // modifier (no notation). All flat +1 - atomic is +1 on every base, with no
  // rotational class.
  insertFreestyleTrickModifier(db, { slug: 'pixie',   modifier_name: 'Pixie',   add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'atomic',  modifier_name: 'Atomic',  add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'Paradox', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  // Miraging renders a data-driven stub (a dual-role set that is NOT route-migrated,
  // unlike whirling/swirling); its base atom is mirage.
  insertFreestyleTrickModifier(db, { slug: 'miraging', modifier_name: 'Miraging', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });

  // Tricks linked to miraging, for the stub "common tricks" list. miraging is a
  // dual-role set with no teaching page, so its modifier route renders a stub;
  // pixie now has an authored set page and redirects there instead.
  insertFreestyleTrick(db, { slug: 'smear',   canonical_name: 'smear',   adds: '3', base_trick: 'mirage',    trick_family: 'mirage' });
  insertFreestyleTrick(db, { slug: 'dimwalk', canonical_name: 'dimwalk', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly' });
  insertFreestyleTrickModifierLink(db, 'smear',   'miraging');
  insertFreestyleTrickModifierLink(db, 'dimwalk', 'miraging');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Slice one modifier row's markup out of the flat page HTML.
function rowSlice(html: string, slug: string): string {
  const start = html.indexOf(`id="operator-${slug}"`);
  if (start < 0) return '';
  const next = html.indexOf('id="operator-', start + 1);
  return html.slice(start, next < 0 ? start + 1200 : next);
}

describe('GET /freestyle/operators — compact modifier index', () => {
  it('gives the set primitives no operator axis of their own', async () => {
    const res = await page('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Set / Uptime Systems');
  });

  it('lists only established operators; provisional names and notation markers live in the glossary', async () => {
    // Unratified names and notation markers sat beside the operator directory as
    // two extra sections; the glossary already defines each, so the directory
    // carries operators alone.
    const res = await page('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Provisional and historical vocabulary');
    expect(res.text).not.toContain('Notation components that are not operators');
    for (const slug of ['symple', 'muted', 'flying']) {
      expect(res.text, `provisional ${slug} row`).not.toContain(`id="operator-${slug}"`);
    }
  });

  it('keeps the provisional operator pages reachable from their glossary entries', async () => {
    // With the provisional rows gone from the directory, the glossary entry is
    // each page's way in; a page left with no link would be reachable only by
    // typing its address.
    const glossary = await page('/freestyle/glossary');
    for (const slug of ['symple', 'muted', 'flying']) {
      expect(glossary.text, `glossary links ${slug}`).toContain(`href="/freestyle/modifier/${slug}"`);
      const detail = await page(`/freestyle/modifier/${slug}`);
      expect(detail.status, `${slug} detail page`).toBe(200);
    }
  });

  it('places Tapping under Set and preparatory operators, not the body axes', async () => {
    const res = await page('/freestyle/operators');
    const tappingIdx  = res.text.indexOf('id="operator-tapping"');
    const setPrepIdx  = res.text.indexOf('Set and preparatory operators');
    const noPlantIdx  = res.text.indexOf('No-plant and suspension');
    expect(setPrepIdx).toBeGreaterThan(-1);
    expect(tappingIdx).toBeGreaterThan(setPrepIdx);
    expect(tappingIdx).toBeLessThan(noPlantIdx);
  });

  it('gives every relationship/body modifier a row with click-throughs', async () => {
    const res = await page('/freestyle/operators');
    for (const slug of ['paradox', 'spinning', 'symposium', 'ducking']) {
      expect(res.text, `row ${slug}`).toContain(`id="operator-${slug}"`);
    }
    // A modifier with a section in the modifier view browses straight to it.
    expect(res.text).toContain('href="/freestyle/tricks?view=modifier#modifier-paradox"');
    expect(res.text).not.toMatch(/\/freestyle\/tricks\?view=(movement-system|topology)/);
  });

  it('presents Symple as unresolved historical vocabulary, not settled doctrine', async () => {
    const res = await page('/freestyle/operators');
    // The page must not assert the old settled explanation while the open
    // question is whether Symple is a distinct operator and whether symp is only
    // an abbreviation of the fully defined Symposium operator.
    expect(res.text).not.toContain('Starts as symposium');
    expect(res.text).not.toContain('can mean symposium or symple');
  });

  it('does not list set primitives as operator rows', async () => {
    const res = await page('/freestyle/operators');
    // weaving and zulu are platform-canonical ducking launch sets, not operators,
    // so they belong only in the Set Encyclopedia and never get an operator row.
    for (const slug of ['pixie', 'fairy', 'atomic', 'quantum', 'nuclear', 'barraging', 'blurry', 'stepping', 'whirling', 'weaving', 'zulu']) {
      expect(res.text, `set ${slug} absent`).not.toContain(`id="operator-${slug}"`);
    }
    // Furious is a name for the barraging set; it has no operator row either.
    expect(res.text).not.toContain('id="operator-furious"');
  });

  it('shows the flat ADD weight from the table in the modifier\'s chip', async () => {
    // Defect caught: the ADD chip losing its value. The definition text beside it
    // also says "+1", so the check reads the chip itself.
    const res = await page('/freestyle/operators');
    expect(rowSlice(res.text, 'paradox')).toMatch(/operator-meta-chip--add">\+1</);
  });

  it('does not render a set notation line on a relationship modifier', async () => {
    const res = await page('/freestyle/operators');
    // paradox and spinning are relationships/body actions, not sets.
    expect(rowSlice(res.text, 'paradox')).not.toContain('dict-trick-row-notation');
    expect(rowSlice(res.text, 'spinning')).not.toContain('dict-trick-row-notation');
    // pixie's set formula does not surface here, since sets are not on this page.
    expect(res.text).not.toContain('SAME IN [DEX]');
  });

  it('uses honest status pills from the data', async () => {
    const res = await page('/freestyle/operators');
    // paradox + spinning have authored teaching pages.
    expect(rowSlice(res.text, 'paradox')).toContain('operator-status-pill--teaching');
    expect(rowSlice(res.text, 'spinning')).toContain('operator-status-pill--teaching');
  });

  it('does not present barraging as a two-dex set', async () => {
    // The operator authority holds that Furious is the canonical two-dex uptime
    // set and barraging is only a legacy name for it. The decomposition summary
    // must match that and must not present barraging as an active set of its own.
    const res = await page('/freestyle/operators');
    expect(res.text).not.toMatch(/barraging as a two-dex set/i);
  });

  // Paradox appears once as a directory row carrying its definition and a link
  // to the full teaching page; the long tail explanation is removed so the same
  // definition is never printed twice on the page.
  it('prints Paradox\'s definition once, with no duplicate long explanation', async () => {
    const res = await page('/freestyle/operators');
    // Defect caught: the row losing its definition, or the definition printed twice.
    const firstClause = Handlebars.escapeExpression(getTier1OperatorDefinition('paradox')!.definition.split(':')[0]!);
    expect(res.text.split(firstClause).length - 1).toBe(1);
    // The old tail Paradox block and its entry formula are gone.
    expect(res.text).not.toContain('CLIP &gt; OP IN [DEX]');
    expect(res.text).not.toMatch(/classic paradox entry topology/);
  });
});

describe('GET /freestyle/modifier/:slug — universal detail resolution', () => {
  it('known modifier without a teaching page resolves to a data-driven stub', async () => {
    const res = await page('/freestyle/modifier/miraging');
    expect(res.status).toBe(200);
    // Common tricks come from the modifier links.
    expect(res.text).toContain('href="/freestyle/tricks/smear"');
    expect(res.text).toContain('href="/freestyle/tricks/dimwalk"');
    // A stub modifier still links back to its base atom (miraging -> mirage).
    expect(res.text).toContain('href="/freestyle/tricks/mirage"');
  });

  it('an operator links back to its base atom (reverse of the atom->operator cross-link)', async () => {
    // Teaching page: spinning -> spin.
    const teaching = await page('/freestyle/modifier/spinning');
    expect(teaching.status).toBe(200);
    expect(teaching.text).toContain('href="/freestyle/tricks/spin"');
    // Stub page: miraging -> mirage (whirling/swirling are now route-migrated sets).
    const stub = await page('/freestyle/modifier/miraging');
    expect(stub.status).toBe(200);
    expect(stub.text).toContain('href="/freestyle/tricks/mirage"');
  });

  it('unknown modifier slug returns 404', async () => {
    const res = await page('/freestyle/modifier/not-a-real-modifier');
    expect(res.status).toBe(404);
  });

  it('the stub surfaces the operator-reference decomposition + worked examples (now the canonical home)', async () => {
    // miraging is a modifier with no teaching page, so its route still resolves
    // to the data-driven stub, which remains the canonical home for the operator
    // reference's decomposition and worked examples. (atomic / quantum / nuclear
    // now have Set Encyclopedia teaching pages, so their modifier routes redirect
    // to the set page instead of rendering this stub.)
    const res = await page('/freestyle/modifier/miraging');
    expect(res.status).toBe(200);
    // Defect caught: the stub dropping the reference's worked examples or decomposition.
    const entry = getOperatorReferenceEntry('miraging')!;
    expect(entry.workedExamples.length).toBeGreaterThan(0);
    for (const example of entry.workedExamples) {
      expect(res.text).toContain(Handlebars.escapeExpression(example));
    }
    if (entry.decomposition) expect(res.text).toContain(Handlebars.escapeExpression(entry.decomposition));
  });
});
