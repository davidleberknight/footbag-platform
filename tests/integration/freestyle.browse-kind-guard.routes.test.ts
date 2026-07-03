/**
 * Canonical browse kind guard: operator, set, and modifier rows never render
 * as trick members in any dictionary browse view.
 *
 * freestyle_tricks deliberately carries non-trick rows (set launchers such as
 * quantum and atomic, body/set modifiers such as paradox) because they are FK
 * targets for decomposition and ADD math. Their public homes are the Set
 * Encyclopedia, the operator board, and the glossary; the trick browse views
 * must never present them as tricks, even when such a row is active and fully
 * notated. resolveTrickKind (src/content/freestyleTrickKindOverrides.ts) is
 * the guard; this suite pins it across every browse view so a future
 * activation of a set row (quantum is the canonical example) cannot leak it
 * into the canonical trick browse.
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

const { dbPath } = setTestEnv('3527');

let createApp: Awaited<ReturnType<typeof importApp>>;

const BROWSE_VIEWS = [
  'add', 'family', 'category', 'sets', 'component', 'topology', 'movement-system', 'dex-count',
];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The adversarial seed: quantum ACTIVE and fully notated, as a set row. If
  // the kind guard ever regressed, this row would qualify for every browse
  // bucket (it has an ADD, a family, and a countable dex notation).
  insertFreestyleTrick(db, {
    slug: 'quantum', canonical_name: 'quantum', adds: '2',
    base_trick: 'quantum', trick_family: 'quantum', category: 'set',
    notation: 'QUANTUM', operational_notation: 'TOE > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // A modifier-kind row, likewise active and notated.
  insertFreestyleTrick(db, {
    slug: 'paradox', canonical_name: 'paradox', adds: '1',
    base_trick: 'paradox', trick_family: 'paradox', category: 'modifier',
    notation: 'PARADOX', operational_notation: 'SET > SAME IN [PDX] [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // Real tricks, so every browse view renders content around the guard.
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'quantum-mirage', canonical_name: 'quantum mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'QUANTUM MIRAGE', operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // Modifier registry + link so the ?view=sets projection renders a quantum
  // group whose MEMBER is the compound, never the quantum row itself.
  insertFreestyleTrickModifier(db, {
    slug: 'quantum', modifier_name: 'quantum', add_bonus: 1, modifier_type: 'set',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', modifier_name: 'paradox', add_bonus: 1, modifier_type: 'body',
  });
  insertFreestyleTrickModifierLink(db, 'quantum-mirage', 'quantum');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('operator / set / modifier rows are never trick members in browse views', () => {
  for (const view of BROWSE_VIEWS) {
    it(`?view=${view}: quantum and paradox render no trick row or card`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      // Trick membership is marked by the row/card slug attribute; neither the
      // set row nor the modifier row may carry one anywhere in the view.
      expect(res.text).not.toContain('data-trick-slug="quantum"');
      expect(res.text).not.toContain('data-trick-slug="paradox"');
      // The genuine compound stays browsable, so the guard is not vacuous.
      expect(res.text).toContain('data-trick-slug="quantum-mirage"');
    });
  }

  it('the family filter never lists the set row as a member either', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?family=quantum');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-trick-slug="quantum"');
  });

  it('dex-count buckets exclude the set row even though its notation is countable', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    // quantum's notation carries one [DEX]; the 1-dex bucket must still not hold it.
    expect(res.text).not.toContain('data-trick-slug="quantum"');
    expect(res.text).toContain('data-trick-slug="mirage"');
  });
});
