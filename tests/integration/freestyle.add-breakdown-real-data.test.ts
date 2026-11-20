/**
 * Over the whole committed dictionary, a trick page's ADD breakdown adds up to
 * the trick's stored ADD.
 *
 * The dictionary is built from the committed inputs by the real loaders, in
 * the rebuild's order, into a temporary database; every active trick with a
 * modifier link is then rendered through the page service and the weights of
 * its hero formula are summed. The oracle is the stored ADD column, which the
 * breakdown never writes.
 *
 * A small set of tricks does not add up for reasons the breakdown cannot fix:
 * a dexterity the doctrine scores outside the links (a leading miraging
 * dexterity, a cross-body X-Dex), a base whose own links are incomplete, or an
 * ADD the source records differently. They are named below so the set can only
 * shrink: a trick that starts adding up fails the test until it is removed, and
 * any other trick that stops adding up fails it at once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3493');

// The dictionary loaders in the order the freestyle rebuild runs them.
const DICTIONARY_LOADERS: readonly (readonly [string, string[]])[] = [
  ['16_preflight_trick_ownership.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'tricks']],
  ['19_load_red_additions.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'aliases']],
  ['20_link_footbag_org_sources.py', []],
  ['21_load_footbag_org_pending_tricks.py', []],
  ['21a_load_alias_additions.py', []],
  ['21b_apply_alias_overrides.py', []],
  ['21c_retire_stale_tricks.py', []],
];

const KNOWN_UNBALANCED = new Set([
  'armageddon', 'atomic_miraging_butterfly', 'big_apple_sauce', 'blur',
  'blurry_torque', 'blurry_whirl', 'blurry_whirling_swirl',
  'food_processor', 'genuphobia', 'mofly',
  'paratoxic', 'pixie_over_down',
  'pixie_quantum_double_over_down_swirl', 'spinning_miraging_symposium_torque',
  'sumo', 'symposium_miraging_mirage', 'witchdoctor',
]);

// Compounds whose name carries a registered modifier that neither the row nor
// its base chain links, for a reason the links cannot fix yet: the modifier's
// scoring or side is an open question (blurry, the pixie clippers), the row has
// no base to compose on (the pogo rows), or the kick drops the stall the
// modifier would land on. Named so the set can only shrink.
const KNOWN_NAME_MODIFIER_GAPS = new Set([
  'blurry_drifter', 'blurry_symposium_whirl', 'fairy_kick', 'pixie_kick',
  'pixie_opposite_clipper', 'pixie_same_clipper', 'pogo_barfly', 'pogo_pickup',
  'pogo_pickup_same_side', 'pogo_voodoo', 'stepping_butterfly_reverse_swirl',
  'symposium_whirling_mirage',
]);

// The registered modifiers, read from the committed registry rather than from
// the table the loaders under test write.
const REGISTERED_MODIFIERS = new Set(
  readFileSync(
    path.join(__dirname, '..', '..', 'freestyle', 'inputs', 'base_dictionary', 'trick_modifiers.csv'),
    'utf8',
  )
    .split('\n')
    .slice(1)
    .map(line => line.split(',')[0].trim())
    .filter(Boolean),
);

let unbalanced: string[] = [];
let rendered = 0;
let nameModifierGaps: string[] = [];
let butterflySideFolds: string[] = [];

// Tricks whose teaching prose stated one side of an open rules question as
// settled (sumo's X-Dex, Blizzard's support foot, Reverse Magellan's direction
// or side). The prose is cleared until the question is ruled; the page keeps
// its notation and ADD.
const HELD_PROSE_TRICKS = ['sumo', 'blizzard', 'reverse_magellan'] as const;
const heldProseShown: string[] = [];
const heldProseStructure: string[] = [];

// One trick per review aspect the corrections ledger sets, plus a settled base,
// each with the aspect its open question could change.
const REVIEW_ASPECT_SAMPLES: readonly (readonly [string, string | null])[] = [
  ['reactor', 'add'],              // the atomic-whirl X-Dex question
  ['mind_bender', 'identity'],     // possibly Ducking Paradox Blender
  ['tap', 'positional'],           // tapping side registration
  ['butterfly', 'notation'],       // shares its notation with the reverse whirl
  ['whirl', null],                 // settled
];
const reviewAspectSeen = new Map<string, string | null>();

// Tricks held out of the main dictionary because their structure is missing
// or contradicts itself while an open question decides it. Each must leave the
// dictionary and appear in Emerging Vocabulary instead.
const HELD_OUT_TRICKS = [
  'bill_ted_s_excellent_adventure', 'reverse_swirling_osis',
  'reverse_swirling_paradox_torque', 'terraging_illusion', 'terraging_legover',
  'terraging_mirage', 'terraging_opposite_clipper', 'terraging_same_clipper',
] as const;
const heldOutWithPage: string[] = [];
const heldOutMissingFromEmerging: string[] = [];

beforeAll(async () => {
  createTestDb(dbPath).close();
  for (const [name, args] of DICTIONARY_LOADERS) {
    const run = spawnSync('python3', [`freestyle/loaders/${name}`, '--db', dbPath, ...args], {
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    if (run.status !== 0) throw new Error(`${name} failed (${run.status}): ${run.stderr ?? ''}`);
  }

  await importApp();
  const { freestyleService } = await import('../../src/services/freestyleService');
  const db = new BetterSqlite3(dbPath, { readonly: true });
  // Every active compound with links and a distinct base that has a row.
  const tricks = db.prepare(
    `SELECT t.slug, t.adds, b.adds AS base_adds FROM freestyle_tricks t
       JOIN freestyle_tricks b ON b.slug = t.base_trick
      WHERE t.is_active = 1 AND t.base_trick <> t.slug
        AND EXISTS (SELECT 1 FROM freestyle_trick_modifier_links l WHERE l.trick_slug = t.slug)
      ORDER BY t.slug`,
  ).all() as { slug: string; adds: string; base_adds: string }[];

  const rows = db.prepare(
    `SELECT slug, base_trick, operational_notation FROM freestyle_tricks
      WHERE is_active = 1 AND category <> 'modifier'`,
  ).all() as { slug: string; base_trick: string | null; operational_notation: string | null }[];
  const linkRows = db.prepare(
    'SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links',
  ).all() as { trick_slug: string; modifier_slug: string }[];
  db.close();

  const linksOf = new Map<string, Set<string>>();
  for (const l of linkRows) {
    if (!linksOf.has(l.trick_slug)) linksOf.set(l.trick_slug, new Set());
    linksOf.get(l.trick_slug)!.add(l.modifier_slug);
  }
  const baseOf = new Map(rows.map(r => [r.slug, r.base_trick]));
  const carried = (slug: string): Set<string> => {
    const out = new Set<string>();
    const seen = new Set<string>();
    let at: string | null | undefined = slug;
    while (at && !seen.has(at)) {
      seen.add(at);
      for (const m of linksOf.get(at) ?? []) out.add(m);
      const next = baseOf.get(at);
      at = next === at ? null : next;
    }
    return out;
  };
  for (const r of rows) {
    if (REGISTERED_MODIFIERS.has(r.slug)) continue;
    // The last word is the base noun; the words before it are what the name claims.
    const named = r.slug.split('_').slice(0, -1).filter(w => REGISTERED_MODIFIERS.has(w));
    const have = carried(r.slug);
    if (named.some(m => !have.has(m))) nameModifierGaps.push(r.slug);
    // The butterfly default is the far side; only the same-side form asserts a
    // near execution, and it is its own row.
    if (r.slug.includes('butterfly') && !r.slug.includes('same_side')
      && (r.operational_notation ?? '').includes('SAME/OP')) {
      butterflySideFolds.push(r.slug);
    }
  }

  for (const trick of tricks) {
    const page = await freestyleService.getTrickDetailPage(trick.slug);
    const weights = (page?.content?.heroFormula ?? [])
      .map(token => token.weight)
      .filter((weight): weight is string => !!weight);
    // A breakdown with every link left out shows the base alone, so it is
    // checked as the base's ADD rather than skipped.
    const parts = weights.length
      ? weights.map(weight => Number(weight.replace(/[()+]/g, '')))
      : [Number(trick.base_adds)];
    rendered++;
    const sum = parts.reduce((total, part) => total + part, 0);
    if (sum !== Number(trick.adds)) unbalanced.push(trick.slug);
  }

  const { REVIEW_NOTICE_LINES } = await import('../../src/services/freestyleService');
  const aspectOfLine = new Map(Object.entries(REVIEW_NOTICE_LINES).map(([a, l]) => [l, a]));
  for (const [slug] of REVIEW_ASPECT_SAMPLES) {
    const page = await freestyleService.getTrickDetailPage(slug);
    const line = page?.content?.reviewNotice?.line ?? null;
    reviewAspectSeen.set(slug, line === null ? null : (aspectOfLine.get(line) ?? `unknown line: ${line}`));
  }

  const heldDb = new BetterSqlite3(dbPath, { readonly: true });
  const heldNames = new Map(
    (heldDb.prepare(
      `SELECT slug, canonical_name FROM freestyle_tricks WHERE slug IN (${HELD_OUT_TRICKS.map(() => '?').join(',')})`,
    ).all(...HELD_OUT_TRICKS) as { slug: string; canonical_name: string }[]).map(r => [r.slug, r.canonical_name]),
  );
  heldDb.close();
  const { NotFoundError } = await import('../../src/services/serviceErrors');
  const emerging = JSON.stringify(freestyleService.getObservationalLayerPage().content);
  for (const slug of HELD_OUT_TRICKS) {
    try {
      await freestyleService.getTrickDetailPage(slug);
      heldOutWithPage.push(slug);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    const name = heldNames.get(slug);
    if (!name || !emerging.includes(JSON.stringify(name))) heldOutMissingFromEmerging.push(slug);
  }

  for (const slug of HELD_PROSE_TRICKS) {
    const page = await freestyleService.getTrickDetailPage(slug);
    if (page?.content?.dictEntry?.description || page?.content?.ux2Pilot?.hasTechniqueNotes) {
      heldProseShown.push(slug);
    }
    // The settled structure stays: the trick still renders its notation and ADD.
    if (!page?.content?.operationalNotation || !page?.content?.dictEntry?.adds) {
      heldProseStructure.push(slug);
    }
  }
}, 600_000);

afterAll(() => cleanupTestDb(dbPath));

describe('every rendered ADD breakdown adds up', () => {
  it('renders breakdowns for the committed corpus, not a toy fixture', () => {
    expect(rendered).toBeGreaterThan(600);
  });

  // Defect caught: a visitor reads parts that add to more or less than the
  // ADD printed beside them, on a trick not known to be unbalanced.
  it('adds up on every trick outside the known set', () => {
    expect(unbalanced.filter(slug => !KNOWN_UNBALANCED.has(slug))).toEqual([]);
  });

  // Defect caught: a known-unbalanced trick has been fixed but is still
  // listed, so the next regression on it would pass unnoticed.
  it('lists only tricks that are still unbalanced', () => {
    const stillUnbalanced = new Set(unbalanced);
    expect([...KNOWN_UNBALANCED].filter(slug => !stillUnbalanced.has(slug))).toEqual([]);
  });
});

describe('a compound links every scored modifier its name carries', () => {
  // Defect caught: a trick named for a modifier, such as a pogo paradox mirage,
  // carries no link to it, so its page drops the modifier from the breakdown
  // and the facts block, and the by-modifier view never lists it. The check on
  // rendered breakdowns above cannot see it, because it covers linked rows only.
  it('finds no unlinked name modifier outside the known set', () => {
    expect(nameModifierGaps.filter(slug => !KNOWN_NAME_MODIFIER_GAPS.has(slug))).toEqual([]);
  });

  // Defect caught: a known gap has been closed but is still listed, so a
  // regression on it would pass unnoticed.
  it('lists only gaps that are still open', () => {
    const open = new Set(nameModifierGaps);
    expect([...KNOWN_NAME_MODIFIER_GAPS].filter(slug => !open.has(slug))).toEqual([]);
  });
});

describe('a butterfly compound keeps the far-side butterfly dexterity', () => {
  // Defect caught: a butterfly compound's notation reads its butterfly
  // dexterity as either side, against the far-side default the butterfly page
  // states, so a visitor cannot tell it from the same-side variant.
  it('no active butterfly compound writes the either-side fold', () => {
    expect(butterflySideFolds).toEqual([]);
  });
});

describe('a trick with an open question carries the notice the ledger sets', () => {
  // Defect caught: the committed review aspects never reach the built
  // dictionary, so every held trick reads as settled, or a settled one reads
  // as under review.
  it('renders the ledger aspect on a sample of each kind, and none on a settled trick', () => {
    for (const [slug, aspect] of REVIEW_ASPECT_SAMPLES) {
      expect(reviewAspectSeen.get(slug), slug).toBe(aspect);
    }
  });
});

describe('a trick whose structure is missing or contradictory leaves the main dictionary', () => {
  // Defect caught: a trick with no formula, or one that contradicts itself,
  // is served as authoritative reference data.
  it('serves no trick page for any held-out trick', () => {
    expect(heldOutWithPage).toEqual([]);
  });

  // Defect caught: a held-out trick disappears from the site entirely instead
  // of waiting, visibly, in Emerging Vocabulary.
  it('lists every held-out trick in Emerging Vocabulary', () => {
    expect(heldOutMissingFromEmerging).toEqual([]);
  });
});

describe('a trick held on an open question shows no teaching prose', () => {
  // Defect caught: a visitor reads an opening or Technique Notes that teach one
  // side of an open rules question as the settled movement.
  it('renders no opening and no Technique Notes on the held tricks', () => {
    expect(heldProseShown).toEqual([]);
  });

  // Defect caught: clearing the prose also took the settled structure, leaving
  // a page with nothing to read.
  it('still renders their notation and ADD', () => {
    expect(heldProseStructure).toEqual([]);
  });
});
