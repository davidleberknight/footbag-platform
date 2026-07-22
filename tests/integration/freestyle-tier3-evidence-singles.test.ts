/**
 * Evidence-singles corrections: the Tripwalk identity merge and the Bedwetter
 * source correction.
 *
 * Tripwalk and Toe Ripwalk were one movement under two names: footbag.org
 * names the same move with both (its source name is Toe Ripwalk), the
 * FootbagMoves technical name matches Tripwalk's JOB, and both rows carried
 * byte-identical operational notation. The retired spelling survives as a
 * technical redirect carried inline on the surviving Red row, because the
 * footbag.org source linker resolves names before the alias loader runs;
 * an alias override then makes it non-display.
 *
 * Bedwetter's operational formula had been flattened to a 4-bracket
 * stepping-eggbeater reading from a divergent source, while its own JOB
 * notation, display alias, and the footbag.org record all assert the 5-ADD
 * stepping paradox eggbeater form. The corrected row restores the paradox
 * structure; Bedwetter may start from either a clipper or an osis delay, and
 * the canonical formula writes the clipper start as the default without
 * narrowing that eligibility.
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
    } else if (ch === '\r') {
      // ignore
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const additions = parseCsv(join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv')).slice(1);
const corrections = parseCsv(join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv')).slice(1);
const aliasOverrides = parseCsv(join(REPO_ROOT, 'freestyle/inputs/base_dictionary/alias_overrides.csv')).slice(1);

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const BEDWETTER_FORM = 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]';

describe('Tripwalk merge and Bedwetter correction: committed source outcomes', () => {
  it('retires toe ripwalk with no insertion row and no residual corrections', () => {
    expect(additions.some(r => toSlug(r[0]) === 'toe_ripwalk')).toBe(false);
    expect(corrections.filter(r => toSlug(r[0]) === 'toe_ripwalk')).toHaveLength(0);
  });

  it('carries the retired spelling inline on the surviving tripwalk row so the source linker resolves it', () => {
    const trip = additions.find(r => toSlug(r[0]) === 'tripwalk')!;
    expect(trip[4].split('|').map(s => s.trim())).toContain('toe ripwalk');
  });

  it('retypes the inline redirect to technical non-display', () => {
    const ov = aliasOverrides.find(r => r[0] === 'toe_ripwalk');
    expect(ov, 'override for toe_ripwalk').toBeTruthy();
    expect([ov![1], ov![2], ov![3]]).toEqual(['retype', 'technical', '0']);
  });

  it('never introduces a Quantum Butterfly alias: that canonical row is separately unresolved', () => {
    const aliasAdditions = parseCsv(join(REPO_ROOT, 'freestyle/inputs/base_dictionary/alias_additions.csv')).slice(1);
    expect(aliasAdditions.some(r => r[0].toLowerCase() === 'quantum butterfly')).toBe(false);
    const trip = additions.find(r => toSlug(r[0]) === 'tripwalk')!;
    expect(trip[4].toLowerCase()).not.toContain('quantum butterfly');
  });

  it('corrects bedwetter to the 5-ADD stepping paradox eggbeater form with the either-start eligibility', () => {
    const op = corrections.filter(r => toSlug(r[0]) === 'bedwetter' && r[1] === 'operational_notation').pop();
    expect(op![3]).toBe(BEDWETTER_FORM);
    const adds = corrections.filter(r => toSlug(r[0]) === 'bedwetter' && r[1] === 'adds').pop();
    expect([adds![2], adds![3]]).toEqual(['4', '5']);
    const desc = corrections.filter(r => toSlug(r[0]) === 'bedwetter' && r[1] === 'description').pop();
    expect(desc![3]).toContain('clipper or an osis delay');
    expect(desc![3]).toContain('paradox');
  });
});

describe('Tripwalk merge: route resolution contract', () => {
  const { dbPath } = setTestEnv('3403');
  let createApp: Awaited<ReturnType<typeof importApp>>;

  beforeAll(async () => {
    const db = createTestDb(dbPath);
    insertFreestyleTrick(db, {
      slug: 'tripwalk', canonical_name: 'tripwalk', adds: '4',
      base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      notation: 'QUANTUM BUTTERFLY',
      operational_notation: 'TOE > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    });
    insertFreestyleTrickAlias(db, 'toe_ripwalk', 'tripwalk', 'toe ripwalk', {
      alias_type: 'technical', alias_display: 0,
    });
    db.close();
    createApp = await importApp();
  });

  afterAll(() => cleanupTestDb(dbPath));

  it('redirects the retired slug one hop to the surviving canonical page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/toe_ripwalk');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/tripwalk');
  });

  it('serves the survivor page directly', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/tripwalk');
    expect(res.status).toBe(200);
  });
});
