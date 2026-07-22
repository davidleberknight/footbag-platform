/**
 * Mullet / Symposium Tomahawk identity merge.
 *
 * Tomahawk is canonically ducking paradox whirl, so symposium tomahawk
 * expands to symposium + ducking + paradox + whirl - exactly the operator
 * set Mullet's technical name spells (ducking paradox symposium whirl),
 * corroborated by the observational parenthetical that names the two
 * together. The duplicate compound row is retired into a technical,
 * non-display redirect alias on the surviving community-named Mullet row,
 * carried inline on the surviving source row because the footbag.org source
 * linker resolves names before the alias loader runs.
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

describe('Mullet merge: committed source outcomes', () => {
  it('retires symposium tomahawk with no insertion row and no residual corrections', () => {
    expect(additions.some(r => toSlug(r[0]) === 'symposium_tomahawk')).toBe(false);
    expect(corrections.filter(r => toSlug(r[0]) === 'symposium_tomahawk')).toHaveLength(0);
  });

  it('carries the retired spelling inline on the surviving mullet row', () => {
    const mullet = additions.find(r => toSlug(r[0]) === 'mullet')!;
    expect(mullet[4].split('|').map(s => s.trim())).toContain('symposium tomahawk');
    expect(mullet[5]).toBe('ducking|paradox|symposium');
  });

  it('retypes the redirect to technical non-display through the override layer', () => {
    const ov = aliasOverrides.find(r => r[0] === 'symposium_tomahawk');
    expect(ov, 'override for symposium_tomahawk').toBeTruthy();
    expect([ov![1], ov![2], ov![3]]).toEqual(['retype', 'technical', '0']);
  });
});

describe('Mullet merge: route resolution contract', () => {
  const { dbPath } = setTestEnv('3404');
  let createApp: Awaited<ReturnType<typeof importApp>>;

  beforeAll(async () => {
    const db = createTestDb(dbPath);
    insertFreestyleTrick(db, {
      slug: 'mullet', canonical_name: 'mullet', adds: '6',
      base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      notation: 'DUCKING PARADOX SYMPOSIUM WHIRL',
      operational_notation: 'CLIP >> DUCK [BOD] >> (no plant while) SAME FRONT WHIRL [DEX] [PDX] [BOD] > OP CLIP [XBD] [DEL]',
    });
    insertFreestyleTrickAlias(db, 'symposium_tomahawk', 'mullet', 'symposium tomahawk', {
      alias_type: 'technical', alias_display: 0,
    });
    db.close();
    createApp = await importApp();
  });

  afterAll(() => cleanupTestDb(dbPath));

  it('redirects the retired slug one hop to the surviving canonical page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/symposium_tomahawk');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/mullet');
  });

  it('serves the survivor page directly', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mullet');
    expect(res.status).toBe(200);
  });
});
