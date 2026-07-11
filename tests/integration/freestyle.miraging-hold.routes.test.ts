/**
 * The miraging operator is descriptive mirage-family language, not a settled
 * formula-bearing operator, so no public canonical decomposition, scoring chip,
 * or equivalence reading may present it as settled. Drifter and DLO are held
 * (no compositional reading); the compounds whose published derivation scores a
 * miraging(+1) component render a bare ADD with no formula chip; and dada-curve's
 * "miraging far symposium butterfly" reading is held. Trick names and notation
 * tokens are untouched; only the scored/decomposition labels are suppressed.
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

const { dbPath } = setTestEnv('3190');

// Compounds whose published derivation used to score miraging(+1).
const HELD_FORMULA_SLUGS = [
  'big_apple_sauce',
  'spinning_miraging_symposium_torque',
  'symposium_miraging_mirage',
  'miraging_symposium_butterfly',
  'miraging_symposium_whirl',
];

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const t = (slug: string, adds: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: slug.replace(/_/g, ' '), adds,
      base_trick: slug, trick_family: slug, category: 'compound',
      operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
      review_status: 'expert_reviewed', is_active: 1,
    });
  t('drifter', '3');
  t('double_leg_over', '3');
  t('paradox_drifter', '4');
  t('dada_curve', '4');
  for (const s of HELD_FORMULA_SLUGS) t(s, s === 'big_apple_sauce' ? '8' : '5');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('miraging is never a public scored / decomposition / equivalence label', () => {
  it('the ADD view shows no miraging(+1) scoring chip for the held-formula compounds', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // No public scoring chip anywhere may score a miraging component.
    expect(res.text).not.toMatch(/miraging\(\+?1\)/);
  });

  it('the held-formula compound detail pages score no miraging component', async () => {
    for (const slug of HELD_FORMULA_SLUGS) {
      const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text, `${slug} scores miraging`).not.toMatch(/miraging\(\+?1\)/);
    }
  });

  it('the ADD-analysis resolved-formula table scores no miraging component', async () => {
    const res = await request(await createApp()).get('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/miraging\(\+?1\)/);
  });

  it('drifter and DLO render with no miraging reading', async () => {
    for (const slug of ['drifter', 'double_leg_over']) {
      const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text, `${slug} shows miraging`).not.toMatch(/miraging clipper|miraging legover/);
    }
  });
});
