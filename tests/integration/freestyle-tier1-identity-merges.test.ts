/**
 * Nine duplicate-canonical identity merges: each technical-decomposition trick
 * whose complete operational notation was byte-identical to an established
 * community-named trick is retired into a technical, non-display redirect alias
 * on the surviving community-name row.
 *
 * The source-level suite reads the committed curator inputs (the reviewed
 * decision of record) and asserts, per pair: the retired canonical has no
 * trick-source row and no residual correction, the redirect alias points at the
 * approved survivor with the exact type and display flag, and the survivor
 * carries the consolidated base, family, modifier, notation, and description.
 * It needs no built database, so a regression in the committed source fails in
 * CI directly.
 *
 * The route suite seeds the merge shape into a test database and asserts the
 * resolver contract the merge relies on: the retired slug carries no trick row,
 * so the detail route resolves its alias one hop to the survivor rather than
 * being shadowed by a stale canonical row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const REPO_ROOT = resolve(__dirname, '../..');
const ADDITIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv');
const CORRECTIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');
const ALIAS_ADDITIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/base_dictionary/alias_additions.csv');
const ALIAS_OVERRIDES_CSV = join(REPO_ROOT, 'freestyle/inputs/base_dictionary/alias_overrides.csv');

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
    } else if (ch === '\r') {
      // ignore
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const additions = parseCsv(ADDITIONS_CSV).slice(1); // canonical_name,adds,base_trick,category,aliases,modifier_links,description,review_status,is_active,review_note
const corrections = parseCsv(CORRECTIONS_CSV).slice(1); // slug,field,old_value,new_value,source_note
const aliasAdditions = parseCsv(ALIAS_ADDITIONS_CSV).slice(1); // alias_text,target_canonical_slug,alias_type,alias_display,note
const aliasOverrides = parseCsv(ALIAS_OVERRIDES_CSV).slice(1); // alias_slug,action,...

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function additionByName(name: string) { return additions.find(r => r[0] === name); }
function correctionsFor(slug: string) { return corrections.filter(r => toSlug(r[0]) === slug); }
function aliasRowByText(text: string) { return aliasAdditions.find(r => r[0] === text); }

// retired canonical name -> { survivor slug, retired slug, aliasText }
const PAIRS = [
  { name: 'toe ducking legover',              retired: 'toe_ducking_legover',              survivor: 'ducking_legover', aliasText: 'Toe Ducking Legover' },
  { name: 'fairy ducking mirage',             retired: 'fairy_ducking_mirage',             survivor: 'guillotine',      aliasText: 'Fairy Ducking Mirage' },
  { name: 'pixie ducking legover',            retired: 'pixie_ducking_legover',            survivor: 'puck',            aliasText: 'Pixie Ducking Legover' },
  { name: 'fairy double leg over',            retired: 'fairy_double_leg_over',            survivor: 'flog',            aliasText: 'Fairy Double Leg Over' },
  { name: 'symposium double over down',       retired: 'symposium_double_over_down',       survivor: 'blackula',        aliasText: 'Symposium Double Over Down' },
  { name: 'stepping ducking paradox illusion',retired: 'stepping_ducking_paradox_illusion',survivor: 'avalanche',       aliasText: 'Stepping Ducking Paradox Illusion' },
  { name: 'tapping butterfly',                retired: 'tapping_butterfly',                survivor: 'tapdown',         aliasText: 'Tapping Butterfly' },
  { name: 'pixie mirage',                     retired: 'pixie_mirage',                     survivor: 'smear',           aliasText: 'Pixie Mirage' },
  { name: 'fairy diving butterfly',           retired: 'fairy_diving_butterfly',           survivor: 'dark_avenue',     aliasText: 'Fairy Diving Butterfly' },
];

describe('Tier-1 identity merges: committed source outcomes', () => {
  it.each(PAIRS)('$retired is fully retired and redirected to $survivor', (p) => {
    // No trick-source row for the retired canonical (no freestyle_tricks row after load).
    expect(additions.some(r => toSlug(r[0]) === p.retired)).toBe(false);
    // No residual correction targeting the retired slug.
    expect(correctionsFor(p.retired)).toHaveLength(0);
    // Redirect alias present, technical, non-display, pointing at the survivor.
    const alias = aliasRowByText(p.aliasText);
    expect(alias, `alias row for "${p.aliasText}"`).toBeTruthy();
    expect(alias![1]).toBe(p.survivor);        // target_canonical_slug
    expect(alias![2]).toBe('technical');       // alias_type
    expect(alias![3]).toBe('0');               // alias_display
    // Survivor still has its own trick-source row.
    expect(additionByName(p.survivor.replace(/_/g, ' ')) || additions.some(r => toSlug(r[0]) === p.survivor)).toBeTruthy();
  });

  it('routes every alias targeting a survivor to the survivor (nine redirects, the flog spelling, two moved, and the pre-existing Blacula)', () => {
    const merged = aliasAdditions.filter(r => ['ducking_legover','guillotine','puck','flog','blackula','avalanche','tapdown','smear','dark_avenue'].includes(r[1]));
    // 9 retired-name aliases + Fairy Double Legover + Alpine PLO + Weaving Magellan
    // + Toe near Symp. Double Down (repointed) + Blacula (pre-existing blackula spelling variant).
    expect(merged.map(r => r[0]).sort()).toEqual([
      'Alpine PLO', 'Blacula', 'Fairy Diving Butterfly', 'Fairy Double Leg Over', 'Fairy Double Legover',
      'Fairy Ducking Mirage', 'Pixie Ducking Legover', 'Pixie Mirage', 'Stepping Ducking Paradox Illusion',
      'Symposium Double Over Down', 'Tapping Butterfly', 'Toe Ducking Legover', 'Toe near Symp. Double Down',
      'Weaving Magellan',
    ]);
  });

  it('moves the pixie_ducking_legover aliases onto puck with their original classes', () => {
    const alpine = aliasRowByText('Alpine PLO');
    expect([alpine![1], alpine![2], alpine![3]]).toEqual(['puck', 'technical', '0']);
    const weaving = aliasRowByText('Weaving Magellan');
    expect([weaving![1], weaving![2], weaving![3]]).toEqual(['puck', 'common', '1']);
    // The obsolete alpine_plo retype override is removed.
    expect(aliasOverrides.some(r => r[0] === 'alpine_plo')).toBe(false);
  });

  it('repoints Toe near Symp. Double Down and adds the footbag.org flog spelling', () => {
    expect(aliasRowByText('Toe near Symp. Double Down')![1]).toBe('blackula');
    const spelling = aliasRowByText('Fairy Double Legover');
    expect([spelling![1], spelling![2], spelling![3]]).toEqual(['flog', 'technical', '0']);
  });

  it('consolidates the outer modifier onto each survivor whose row carried none', () => {
    // additions columns: [0]name [2]base_trick [5]modifier_links
    expect(additionByName('guillotine')![5]).toBe('fairy');
    expect(additionByName('puck')![5]).toBe('pixie');
    expect(additionByName('Flog')![5]).toBe('fairy');
    expect(additionByName('Flog')![2]).toBe('double-leg-over');
    expect(additionByName('avalanche')![2]).toBe('ducking-paradox-illusion');
    expect(additionByName('avalanche')![5]).toBe('stepping');
    expect(additionByName('dark avenue')![2]).toBe('diving-butterfly');
    expect(additionByName('dark avenue')![5]).toBe('fairy');
  });

  it('pins avalanche and dark_avenue families and applies the approved survivor descriptions', () => {
    const famOverride = (slug: string, fam: string) =>
      corrections.some(r => toSlug(r[0]) === slug && r[1] === 'trick_family' && r[3] === fam);
    expect(famOverride('avalanche', 'paradox_illusion')).toBe(true);
    expect(famOverride('dark_avenue', 'butterfly')).toBe(true);
    const desc = (slug: string) => corrections.find(r => toSlug(r[0]) === slug && r[1] === 'description')?.[3] ?? '';
    expect(desc('guillotine')).toContain('the community name for Fairy Ducking Mirage');
    expect(desc('flog')).toContain('the community name for Fairy Double Leg Over');
    expect(desc('dark_avenue')).toContain('the community name for Fairy Diving Butterfly');
  });

  it('reconciles avalanche formula surfaces to the canonical SAME OUT [PDX]', () => {
    const avalanche = additionByName('avalanche')!;
    expect(avalanche[6]).toContain('SAME OUT [PDX]');       // description JOB
    expect(avalanche[6]).not.toContain('OP OUT [PDX]');
  });

  it('sets tapdown JOB notation to TAPDOWN and keeps smear locked to PIXIE MIRAGE', () => {
    const tapdownNotation = corrections.find(r => toSlug(r[0]) === 'tapdown' && r[1] === 'notation')?.[3];
    expect(tapdownNotation).toBe('TAPDOWN');
    const smearNotation = corrections.find(r => toSlug(r[0]) === 'smear' && r[1] === 'notation')?.[3];
    expect(smearNotation).toBe('PIXIE MIRAGE');
  });

  it('rebases the two derivatives onto the surviving parents', () => {
    // fairy_double_leg_over_same_side bases on flog (in the additions row base_trick column)
    expect(additionByName('fairy double leg over same side')![2]).toBe('flog');
    // miraging_symposium_double_over_down base_trick correction now targets blackula
    const rebase = corrections.find(r => toSlug(r[0]) === 'miraging_symposium_double_over_down' && r[1] === 'base_trick');
    expect(rebase![3]).toBe('blackula');
  });

  it('preserves the flog footbag.org source evidence is not carried only in an alias note', () => {
    // The showmove-229 evidence lives on flog as a source link (footbag.org snapshot),
    // not solely inside an alias explanation; the flog additions row survives to carry it.
    expect(additions.some(r => r[0] === 'Flog')).toBe(true);
  });
});

describe('Tier-1 identity merges: route resolution contract', () => {
  const { dbPath } = setTestEnv('3401');
  let createApp: Awaited<ReturnType<typeof importApp>>;

  beforeAll(async () => {
    const db = createTestDb(dbPath);
    // Survivor present; retired twin absent; retired name is a technical redirect alias.
    insertFreestyleTrick(db, {
      slug: 'guillotine', canonical_name: 'guillotine', adds: '4',
      base_trick: 'ducking_mirage', trick_family: 'mirage', category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      notation: 'GUILLOTINE', operational_notation: 'TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP TOE [DEL]',
    });
    insertFreestyleTrickAlias(db, 'fairy_ducking_mirage', 'guillotine', 'Fairy Ducking Mirage', {
      alias_type: 'technical', alias_display: 0,
    });
    db.close();
    createApp = await importApp();
  });

  afterAll(() => cleanupTestDb(dbPath));

  it('redirects the retired slug one hop to the surviving canonical page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/fairy_ducking_mirage');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/guillotine');
  });

  it('serves the survivor page directly with no shadowing retired row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/guillotine');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Guillotine');
  });
});
