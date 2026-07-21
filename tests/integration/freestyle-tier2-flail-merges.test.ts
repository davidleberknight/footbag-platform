/**
 * Three duplicate-canonical identity merges under the settled ruling that
 * Flail IS the Symposium Illusion: each symposium-spelling compound whose
 * complete operational notation was byte-identical to its flail-spelling twin
 * is retired into a technical, non-display redirect alias on the surviving
 * flail-named row. The footbag.org-named pair (Backside Symposium Toe
 * Blizzard, alt-name Quantum Symposium Illusion) carries its two source names
 * inline on the surviving Red row so the pending-trick loader resolves them
 * before the alias loader runs; an alias override then retypes both to
 * non-display technical redirects.
 *
 * The same change conforms the whirling reverse-whirl derivative to its
 * family conventions: canonical name and slug use the rev-whirl form, the
 * base is the reverse-whirl root (never whirl), the operator link is
 * whirling alone, and the reverse spelling stays as a resolvable alias.
 *
 * The source-level suite reads the committed curator inputs (the reviewed
 * decision of record) so a regression fails in CI without a built database.
 * The route suite seeds the merge shape into a test database and asserts the
 * one-hop redirect contract the merges rely on.
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
const aliasOverrides = parseCsv(ALIAS_OVERRIDES_CSV).slice(1); // alias_slug,action,alias_type,alias_display,note

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function additionBySlug(slug: string) { return additions.find(r => toSlug(r[0]) === slug); }
function correctionsFor(slug: string) { return corrections.filter(r => toSlug(r[0]) === slug); }
function aliasRowByText(text: string) { return aliasAdditions.find(r => r[0] === text); }

const PAIRS = [
  { retired: 'pixie_symposium_illusion',        survivor: 'pixie_flail',    aliasText: 'Pixie Symposium Illusion' },
  { retired: 'miraging_symposium_illusion',     survivor: 'miraging_flail', aliasText: 'Miraging Symposium Illusion' },
  { retired: 'backside_symposium_toe_blizzard', survivor: 'quantum_flail',  aliasText: null },
];

describe('Tier-2 flail-equivalence merges: committed source outcomes', () => {
  it.each(PAIRS)('$retired is fully retired into $survivor', (p) => {
    expect(additions.some(r => toSlug(r[0]) === p.retired)).toBe(false);
    expect(correctionsFor(p.retired)).toHaveLength(0);
    expect(additionBySlug(p.survivor)).toBeTruthy();
  });

  it('redirects the two symposium spellings as technical, non-display aliases', () => {
    for (const [text, survivor] of [
      ['Pixie Symposium Illusion', 'pixie_flail'],
      ['Miraging Symposium Illusion', 'miraging_flail'],
    ] as const) {
      const alias = aliasRowByText(text);
      expect(alias, `alias row for "${text}"`).toBeTruthy();
      expect(alias![1]).toBe(survivor);
      expect(alias![2]).toBe('technical');
      expect(alias![3]).toBe('0');
    }
  });

  it('carries both footbag.org names inline on quantum flail so the pending loader resolves them', () => {
    const row = additionBySlug('quantum_flail')!;
    const inline = row[4].split('|').map(s => s.trim());
    expect(inline).toContain('backside symposium toe blizzard');
    expect(inline).toContain('quantum symposium illusion');
  });

  it('retypes both footbag.org names to non-display technical redirects', () => {
    for (const slug of ['backside_symposium_toe_blizzard', 'quantum_symposium_illusion']) {
      const ov = aliasOverrides.find(r => r[0] === slug);
      expect(ov, `override for ${slug}`).toBeTruthy();
      expect(ov![1]).toBe('retype');
      expect(ov![2]).toBe('technical');
      expect(ov![3]).toBe('0');
    }
  });

  it('moves the Creature community name onto the surviving miraging flail row, exactly once', () => {
    const carriers = additions.filter(r =>
      r[4].split('|').map(s => s.trim().toLowerCase()).includes('creature'));
    expect(carriers).toHaveLength(1);
    expect(toSlug(carriers[0][0])).toBe('miraging_flail');
    expect(aliasAdditions.some(r => r[0].toLowerCase() === 'creature')).toBe(false);
  });

  it('conforms the whirling derivative to the rev-whirl family conventions', () => {
    expect(additions.some(r => toSlug(r[0]) === 'whirling_reverse_whirl')).toBe(false);
    const row = additionBySlug('whirling_rev_whirl')!;
    expect(row, 'whirling rev whirl additions row').toBeTruthy();
    expect(row[2]).toBe('rev-whirl');   // base_trick: the reverse-whirl root, never whirl
    expect(row[5]).toBe('whirling');    // operator link: whirling alone
    expect(row[4].split('|').map(s => s.trim())).toContain('whirling reverse whirl');
  });

  it('rekeys the whirling correction ledger without losing its layers', () => {
    expect(correctionsFor('whirling_reverse_whirl')).toHaveLength(0);
    const rekeyed = correctionsFor('whirling_rev_whirl');
    expect(rekeyed.length).toBeGreaterThanOrEqual(5);
    const job = rekeyed.find(r => r[1] === 'notation');
    expect(job![3]).toBe('WHIRLING REV WHIRL');
    const final = rekeyed.filter(r => r[1] === 'operational_notation').pop();
    expect(final![3]).toBe('SET > OP FRONT WHIRL [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]');
  });
});

describe('Tier-2 flail-equivalence merges: route resolution contract', () => {
  const { dbPath } = setTestEnv('3402');
  let createApp: Awaited<ReturnType<typeof importApp>>;

  beforeAll(async () => {
    const db = createTestDb(dbPath);
    insertFreestyleTrick(db, {
      slug: 'quantum_flail', canonical_name: 'quantum flail', adds: '4',
      base_trick: 'flail', trick_family: 'flail', category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      notation: 'QUANTUM FLAIL',
      operational_notation: 'TOE > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]',
    });
    insertFreestyleTrickAlias(db, 'backside_symposium_toe_blizzard', 'quantum_flail', 'Backside Symposium Toe Blizzard', {
      alias_type: 'technical', alias_display: 0,
    });
    insertFreestyleTrick(db, {
      slug: 'whirling_rev_whirl', canonical_name: 'whirling rev whirl', adds: '4',
      base_trick: 'rev_whirl', trick_family: 'rev_whirl', category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      notation: 'WHIRLING REV WHIRL',
      operational_notation: 'SET > OP FRONT WHIRL [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    });
    insertFreestyleTrickAlias(db, 'whirling_reverse_whirl', 'whirling_rev_whirl', 'whirling reverse whirl', {
      alias_type: 'common', alias_display: 1,
    });
    db.close();
    createApp = await importApp();
  });

  afterAll(() => cleanupTestDb(dbPath));

  it('redirects the retired footbag.org slug one hop to the surviving flail page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/backside_symposium_toe_blizzard');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/quantum_flail');
  });

  it('redirects the old whirling slug one hop to the renamed canonical page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirling_reverse_whirl');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/whirling_rev_whirl');
  });

  it('serves both survivors directly with no shadowing retired row', async () => {
    const quantum = await request(createApp()).get('/freestyle/tricks/quantum_flail');
    expect(quantum.status).toBe(200);
    const whirling = await request(createApp()).get('/freestyle/tricks/whirling_rev_whirl');
    expect(whirling.status).toBe(200);
  });
});
