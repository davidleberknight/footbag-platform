/**
 * Duplicate trick rows folded into their community-named twin.
 *
 * Each pair stored one trick twice: the same movement notation, modifier links,
 * ADD and family under a community name and under its decomposition. The
 * decomposition row is retired; its name is carried inline on the survivor's
 * row, so the footbag.org source linker still attaches its source, and is
 * retyped to a hidden technical alias, so its old address redirects. Whatever
 * the retired row carried (notes, opening, the tricks built on it) moves to the
 * survivor.
 *
 * The source cases read the committed curator inputs, so a regression fails
 * without a built database. The route cases seed the folded shape and check
 * that the retired address lands on the survivor.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const REPO_ROOT = resolve(__dirname, '../..');

function parseCsv(path: string): string[][] {
  const text = readFileSync(path, 'utf8');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const tricksDir = join(REPO_ROOT, 'freestyle/inputs/curated/tricks');
// canonical_name,adds,base_trick,category,aliases,modifier_links,...
const additions = parseCsv(join(tricksDir, 'red_additions_2026_04_20.csv')).slice(1);
// slug,field,old_value,new_value,source_note
const corrections = parseCsv(join(tricksDir, 'red_corrections_2026_04_20.csv')).slice(1);
// trick_canon,adds,base_trick,category,aliases,... A survivor the base dictionary
// owns takes its inline aliases from this row, not from an expert-additions row
// that overlays it.
const baseTricks = parseCsv(join(REPO_ROOT, 'freestyle/inputs/base_dictionary/tricks.csv')).slice(1);
// alias_slug,action,alias_type,alias_display,note
const aliasOverrides = parseCsv(
  join(REPO_ROOT, 'freestyle/inputs/base_dictionary/alias_overrides.csv')).slice(1);

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const FOLDS = [
  {
    retired: 'spinning_paradox_blender',
    retiredName: 'spinning paradox blender',
    survivor: 'spender',
    dependants: ['overlord', 'pixie_spinning_paradox_blender'],
    movedFields: ['description', 'execution_summary', 'learning_notes', 'prerequisite_notes'],
  },
  {
    retired: 'spinning_ducking_paradox_whirl',
    retiredName: 'spinning ducking paradox whirl',
    survivor: 'maelstrom',
    dependants: [],
    movedFields: [],
    // Paradox is inside Maelstrom's paradox-whirl base, so only the outer two move.
    movedLinks: 'spinning|ducking',
  },
  {
    retired: 'spinning_ducking_paradox_drifter',
    retiredName: 'spinning ducking paradox drifter',
    survivor: 'morpheus',
    dependants: [],
    movedFields: [],
    // Paradox is inside Morpheus's paradox-drifter base, so only the outer two move.
    movedLinks: 'spinning|ducking',
  },
  {
    retired: 'atomic_eggbeater',
    retiredName: 'atomic eggbeater',
    survivor: 'bladerunner',
    dependants: [],
    movedFields: [],
    movedLinks: 'atomic',
  },
  {
    retired: 'symposium_paradon',
    retiredName: 'symposium paradon',
    survivor: 'dolomite',
    dependants: ['pixie_dolomite'],
    movedFields: [],
    movedLinks: 'symposium',
  },
  {
    retired: 'spinning_ducking_paradox_blender',
    retiredName: 'spinning ducking paradox blender',
    survivor: 'gangsta_party',
    dependants: [],
    movedFields: ['description'],
    // Paradox is inside Gangsta Party's paradox-blender base, so only the outer two move.
    movedLinks: 'spinning|ducking',
  },
  {
    retired: 'miraging_symposium_paradon',
    retiredName: 'miraging symposium paradon',
    survivor: 'mofly',
    dependants: [],
    movedFields: ['operational_notation'],
  },
  {
    retired: 'whirling_rev_whirl',
    retiredName: 'whirling rev whirl',
    survivor: 'bling_blang',
    dependants: [],
    movedFields: ['operational_notation'],
    movedLinks: 'whirling',
  },
  {
    retired: 'spinning_legover',
    retiredName: 'spinning legover',
    survivor: 'merkon',
    dependants: [],
    movedFields: ['execution_summary', 'learning_notes', 'prerequisite_notes'],
  },
  {
    retired: 'gyro_eggbeater',
    retiredName: 'gyro eggbeater',
    survivor: 'mantis',
    dependants: [],
    movedFields: [],
  },
  {
    retired: 'nuclear_butterfly',
    retiredName: 'nuclear butterfly',
    survivor: 'matador',
    dependants: ['barfry'],
    movedFields: [],
  },
  {
    retired: 'tapping_mirage',
    retiredName: 'tapping mirage',
    survivor: 'tap',
    dependants: [],
    movedFields: ['description'],
  },
  {
    retired: 'tapping_leg_over',
    retiredName: 'tapping leg over',
    survivor: 'tapping_legover',
    dependants: [],
    movedFields: ['operational_notation', 'execution_summary', 'learning_notes', 'prerequisite_notes'],
  },
  {
    retired: 'stepping_butterfly',
    retiredName: 'stepping butterfly',
    survivor: 'ripwalk',
    dependants: [],
    movedFields: [],
  },
  {
    retired: 'barraging_eggbeater',
    retiredName: 'barraging eggbeater',
    survivor: 'clown_face',
    dependants: [],
    movedFields: ['operational_notation', 'description'],
    movedLinks: 'furious',
  },
  {
    retired: 'furious_double_leg_over',
    retiredName: 'furious double leg over',
    survivor: 'nebula',
    dependants: [],
    movedFields: ['operational_notation', 'description'],
    movedLinks: 'furious',
  },
  {
    retired: 'paradox_symposium_illusion',
    retiredName: 'paradox symposium illusion',
    survivor: 'paradox_flail',
    dependants: ['ducking_paradox_symposium_illusion'],
    movedFields: ['operational_notation'],
    movedLinks: 'paradox|symposium',
  },
  {
    retired: 'toe_gyro_mirage',
    retiredName: 'toe gyro mirage',
    survivor: 'gyro_mirage',
    dependants: [],
    movedFields: [],
  },
  {
    retired: 'tapping_torque',
    retiredName: 'tapping torque',
    survivor: 'spinal_tap',
    dependants: [],
    movedFields: ['description'],
  },
  {
    retired: 'ducking_barfly',
    retiredName: 'ducking barfly',
    survivor: 'spanishfly',
    dependants: [],
    movedFields: ['description', 'execution_summary', 'learning_notes', 'prerequisite_notes'],
  },
  {
    retired: 'ducking_paradox_blender',
    retiredName: 'ducking paradox blender',
    survivor: 'mind_bender',
    dependants: ['stepping_ducking_paradox_blender'],
    movedFields: ['operational_notation'],
    // A genuine decomposition name of the survivor, so it is shown on its page.
    shown: true,
  },
  {
    retired: 'stepping_barfly',
    retiredName: 'stepping barfly',
    survivor: 'blurrier',
    dependants: [],
    movedFields: [],
    // Blurrier takes the stepping link the retired row carried, on its barfly base.
    movedLinks: 'stepping',
    shown: true,
  },
  {
    retired: 'barraging_barfly',
    retiredName: 'barraging barfly',
    survivor: 'nemesis',
    dependants: [],
    movedFields: [],
    movedLinks: 'furious',
    // Barraging is the old name of furious, so the name is kept search-only.
    oldName: true,
  },
  {
    retired: 'blazing_mirage',
    retiredName: 'blazing mirage',
    survivor: 'blaze',
    dependants: [],
    movedFields: [],
    // Blaze takes the blazing link the retired row carried, on its mirage base.
    movedLinks: 'blazing',
    shown: true,
  },
  {
    retired: 'whirling_butterfly',
    retiredName: 'whirling butterfly',
    survivor: 'blazing_butterfly',
    dependants: [],
    movedFields: [],
    // Whirling is the body modifier, not the blazing set, so the name misleads.
    misleading: true,
  },
  {
    // The whirl takes the X-Dex, so the atomic whirl is Reactor, carried as
    // Atomic Mirage is carried by Atom Smasher: a shown name and no link.
    retired: 'atomic_whirl',
    retiredName: 'atomic whirl',
    survivor: 'reactor',
    dependants: [],
    movedFields: [],
    shown: true,
  },
  {
    // The rules expert ruled Jani Walker's movement a Furious Butterfly; the
    // folk name survives and the structural row's prose and link move to it.
    retired: 'furious_butterfly',
    retiredName: 'furious butterfly',
    survivor: 'jani_walker',
    dependants: [],
    movedFields: ['description', 'execution_summary', 'learning_notes', 'prerequisite_notes'],
    movedLinks: 'furious',
    shown: true,
  },
  {
    retired: 'atomic_symposium_whirl',
    retiredName: 'atomic symposium whirl',
    survivor: 'gary_coleman',
    dependants: [],
    movedFields: [],
    shown: true,
  },
];

// The override a fold's retired name takes: a genuine structural name the
// survivor's page shows, or a hidden technical redirect.
function expectedOverride(f: (typeof FOLDS)[number]): string[] {
  if ('shown' in f && f.shown) return ['retype', 'structural', '1'];
  if ('oldName' in f && f.oldName) return ['retype', 'historical', '0'];
  if ('misleading' in f && f.misleading) return ['retype', 'suppressed', '0'];
  return ['retype', 'technical', '0'];
}

describe('identity folds: committed source outcomes', () => {
  it.each(FOLDS)('$retired leaves no row and no correction behind', (f) => {
    expect(additions.some(r => toSlug(r[0]) === f.retired)).toBe(false);
    expect(corrections.filter(r => toSlug(r[0]) === f.retired)).toEqual([]);
  });

  it.each(FOLDS)('$retired is carried on $survivor and retyped for display or redirect', (f) => {
    const rows = [...additions, ...baseTricks].filter(r => toSlug(r[0]) === f.survivor);
    expect(rows.length, f.survivor).toBeGreaterThan(0);
    const carried = rows.flatMap(r => (r[4] ?? '').split('|').map(s => s.trim()));
    expect(carried).toContain(f.retiredName);
    const ov = aliasOverrides.find(r => r[0] === f.retired);
    expect(ov, `override for ${f.retired}`).toBeTruthy();
    expect([ov![1], ov![2], ov![3]]).toEqual(expectedOverride(f));
  });

  it.each(FOLDS)('the tricks built on $retired now name $survivor as their base', (f) => {
    for (const dependant of f.dependants) {
      const row = additions.find(r => toSlug(r[0]) === dependant);
      const baseFix = corrections.filter(r => toSlug(r[0]) === dependant && r[1] === 'base_trick').at(-1);
      expect(toSlug(baseFix?.[3] ?? row?.[2] ?? ''), dependant).toBe(f.survivor);
    }
  });

  it.each(FOLDS)('$survivor carries what $retired held', (f) => {
    const fields = corrections.filter(r => toSlug(r[0]) === f.survivor).map(r => r[1]);
    expect(fields).toEqual(expect.arrayContaining(f.movedFields));
    if ('movedLinks' in f) {
      const survivor = additions.find(r => toSlug(r[0]) === f.survivor)!;
      expect(survivor[5]).toBe(f.movedLinks);
    }
  });
});

describe('identity folds: the retired address redirects', () => {
  const { dbPath } = setTestEnv('3491');
  let createApp: Awaited<ReturnType<typeof importApp>>;

  beforeAll(async () => {
    const db = createTestDb(dbPath);
    for (const f of FOLDS) {
      insertFreestyleTrick(db, {
        slug: f.survivor, canonical_name: f.survivor, adds: '6',
        category: 'compound', review_status: 'expert_reviewed', is_active: 1,
      });
      const [, aliasType, display] = expectedOverride(f);
      insertFreestyleTrickAlias(db, f.retired, f.survivor, f.retiredName, {
        alias_type: aliasType, alias_display: display === '1' ? 1 : 0,
      });
    }
    db.close();
    createApp = await importApp();
  });

  afterAll(() => cleanupTestDb(dbPath));

  it.each(FOLDS)('/freestyle/tricks/$retired lands on $survivor', async (f) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${f.retired}`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`/freestyle/tricks/${f.survivor}`);
  });

  // Defect caught: a genuine structural name of the trick searchable but missing
  // from its page, or a hidden redirect name printed there.
  it.each(FOLDS)('$survivor shows $retiredName only when it is a shown name', async (f) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${f.survivor}`);
    expect(res.status).toBe(200);
    const shown = 'shown' in f && f.shown === true;
    expect(res.text.toLowerCase().includes(f.retiredName), f.survivor).toBe(shown);
  });
});
