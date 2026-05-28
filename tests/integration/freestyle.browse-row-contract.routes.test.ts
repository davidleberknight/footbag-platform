/**
 * Browse-shell row-contract stability guard (2026-05-27).
 *
 * After the six-view two-line migration, ALL primary browse views must render
 * the generalized two-line `dictionary-trick-row.hbs` partial (`dict-trick-row-*`)
 * and must NOT fall back to the legacy shared `dictionary-trick-card`
 * (`dict-card-stack` / `dict-card--registry`). This test pins that contract so
 * a future change can't silently regress one view to the old shared card.
 *
 * The soft-retired `category` / `component` views are intentionally excluded:
 * they may still use the legacy shared card until they are removed (see
 * VIEW_CATALOG §6 + IMPLEMENTATION_PLAN).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3525');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers in the Movement System axes + registered for By Modifier.
  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('pixie',    'pixie',    'set',  1, 1, '', ?),
      ('ducking',  'ducking',  'body', 1, 1, '', ?),
      ('spinning', 'spinning', 'body', 1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');

  // Base tricks (topology + family anchors) + modifier-linked compounds that
  // collectively populate every primary browse view.
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', notation: 'WHIRL', operational_notation: 'SET > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'pixie-illusion', canonical_name: 'pixie illusion', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'PIXIE ILLUSION', operational_notation: 'SET > PIXIE > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-whirl', canonical_name: 'ducking whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'DUCKING WHIRL', operational_notation: 'CLIP > DUCK [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'SPINNING WHIRL', operational_notation: 'CLIP > SPIN [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('pixie-illusion', 'pixie',    1),
      ('ducking-whirl',  'ducking',  1),
      ('spinning-whirl', 'spinning', 1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// The six primary browse views (UI labels in comments).
const PRIMARY_VIEWS: Array<[string, string]> = [
  ['add', 'By ADD'],
  ['family', 'By family'],
  ['dex-count', 'By dex count'],
  ['movement-system', 'Movement System'],
  ['sets', 'By Modifier'],
  ['topology', 'Movement Neighborhoods'],
];

describe('Browse-shell row-contract stability guard — all six primary views use the two-line dict-trick-row', () => {
  for (const [view, label] of PRIMARY_VIEWS) {
    it(`${label} (?view=${view}) renders the two-line dict-trick-row stack`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      expect(res.text, `${label} must render dict-trick-row-stack`).toContain('dict-trick-row-stack');
      expect(res.text, `${label} must render dict-trick-row articles`).toMatch(/<article class="dict-trick-row/);
    });

    it(`${label} (?view=${view}) does NOT render the legacy shared dictionary-trick-card`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.text, `${label} must NOT use dict-card-stack`).not.toContain('dict-card-stack');
      expect(res.text, `${label} must NOT use dict-card--registry`).not.toContain('dict-card--registry');
      // No per-row green ADD chip anywhere in a migrated view.
      expect(res.text, `${label} must NOT render the green ADD chip`).not.toMatch(/class="dict-card-add[ "]/);
    });
  }
});
