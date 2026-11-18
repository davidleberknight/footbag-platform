/**
 * ADD view: one level lists its tricks as one flat alphabetical list, whatever
 * family each trick belongs to.
 *
 * The fixture seeds one ADD level holding tricks from every family shape the
 * dictionary has: branch anchors that carry their root's structural label and
 * a public family override (torque, blender, double leg over, eggbeater), a
 * plain public family (drifter, whirl), a member tagged with a foundational
 * surface but overridden to a public family (high plains drifter), a family
 * whose display name is not its slug (Dada Curve), and a trick with no public
 * family at all (stepping reaper). Every one of them must be listed, in
 * canonical-name order, so a reader can look a trick up by name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3621');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  // All seeded at 4 ADD (test data only; does not change real ADD values).
  const t = (slug: string, family: string, name?: string, family_override?: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: name ?? slug.replace(/-/g, ' '), adds: '4',
      base_trick: family, trick_family: family, category: 'compound',
      review_status: 'curated', is_active: 1, family_override: family_override ?? null,
    });
  t('torque', 'osis', undefined, 'torque');
  t('blender', 'osis', undefined, 'blender');
  t('double_leg_over', 'legover', undefined, 'double_leg_over');
  t('eggbeater', 'legover', undefined, 'eggbeater');
  t('drifter', 'drifter');
  t('high_plains_drifter', 'clipper_stall', undefined, 'drifter');
  t('dada_curve', 'dada_curve', 'Dada Curve');
  t('whirl', 'whirl');
  t('stepping_reaper', 'clipper_stall');
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

describe('ADD view: a level is one alphabetical list', () => {
  // Defect caught: a level drops a trick whose family is not public, or groups
  // the level by family again, so a reader scanning by name finds the tricks
  // out of order or not at all.
  it('lists every trick at the level, in canonical-name order', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/4');
    expect(res.status).toBe(200);
    // Hand-sorted canonical names: blender, Dada Curve, double_leg_over,
    // drifter, eggbeater, high_plains_drifter, stepping_reaper, torque, whirl.
    const expected = [
      'blender', 'dada_curve', 'double_leg_over', 'drifter', 'eggbeater',
      'high_plains_drifter', 'stepping_reaper', 'torque', 'whirl',
    ];
    const positions = expected.map(slug => {
      const at = res.text.indexOf(`href="/freestyle/tricks/${slug}"`);
      expect(at, `${slug} is listed at its ADD level`).toBeGreaterThanOrEqual(0);
      return at;
    });
    // ordering-is-the-contract: a level lists its tricks alphabetically.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('Search unaffected by the ADD view', () => {
  it('the suggest endpoint still resolves a trick', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'torque' });
    expect(res.status).toBe(200);
    expect(res.body.map((r: { slug: string }) => r.slug)).toContain('torque');
  });
});
