/**
 * The by-ADD dictionary view's line-2 formula (addViewFormula) renders a trick's
 * base by its canonical display name, not the raw underscore slug. A trick that
 * falls to the mechanical modifier-link derivation (no curator resolved formula)
 * on a compound base shows "<modifier>(+b) + <base display name>(N)" -- e.g.
 * "double over down(4)", never the machine slug "double_over_down(4)".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3775');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A compound base with an underscore slug, so a mechanical derivation would
  // otherwise expose it.
  insertFreestyleTrick(db, {
    slug: 'double_over_down', canonical_name: 'double over down', adds: '4',
    base_trick: 'double_over_down', trick_family: 'double_over_down', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', add_bonus: 1 });
  // A trick on that compound base with one modifier link and no curator resolved
  // formula: its ADD-view line-2 formula is derived mechanically (base + bonus).
  insertFreestyleTrick(db, {
    slug: 'mech_test', canonical_name: 'mech test', adds: '5',
    base_trick: 'double_over_down', trick_family: 'double_over_down', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  });
  insertFreestyleTrickModifierLink(db, 'mech_test', 'spinning', 1);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks?view=add — ADD formula renders canonical base name', () => {
  it('the mechanical line-2 formula shows the base by canonical name, not the raw slug', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Mechanical derivation is "spinning(+1) + double over down(4)". The "(4)" suffix
    // anchors these to the formula, not to a slug that appears in an href.
    expect(res.text).toContain('double over down(4)');
    expect(res.text).not.toContain('double_over_down(4)');
  });
});
