/**
 * ADD-view within-tier grouping: By family (default, nearest-anchor) +
 * Alphabetical (flat A-Z, ?sort=alpha).
 *
 * The ADD view must group by the nearest public family (the same model the
 * Family view uses), not by the top source-root ancestor, and must not surface
 * foundational surfaces (clipper-stall) or a raw root as a public band:
 *   - no "Clipper-stall" / "-derived" band headers
 *   - branch anchors own their tricks (Torque/Blender/Double Legover/Eggbeater)
 *   - drifter-family tricks band under Drifter
 *   - non-public-family tricks collect in "Other / standalone tricks"
 *   - Alphabetical mode is a flat A-Z list (no family headers) for lookup
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3621');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // All seeded at 4 ADD (test data only; does not change real ADD values).
  const t = (slug: string, family: string, name?: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: name ?? slug.replace(/-/g, ' '), adds: '4',
      base_trick: family, trick_family: family, category: 'compound',
      review_status: 'curated', is_active: 1,
    });
  t('torque', 'osis');                       // FAMILY_OVERRIDES -> torque
  t('blender', 'osis');                      // FAMILY_OVERRIDES -> blender
  t('double_leg_over', 'legover');           // FAMILY_OVERRIDES -> double-leg-over
  t('eggbeater', 'legover');                 // FAMILY_OVERRIDES -> eggbeater
  t('drifter', 'drifter');                   // public family
  t('high_plains_drifter', 'clipper_stall'); // FAMILY_OVERRIDES -> drifter (NOT clipper-stall)
  t('dada_curve', 'dada_curve', 'Dada Curve');// public family
  t('whirl', 'whirl');                       // ordinary public family
  t('stepping_reaper', 'clipper_stall');     // no override -> Other / standalone
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function addView(sort?: 'alpha'): Promise<string> {
  const url = sort ? `/freestyle/tricks?view=add&sort=${sort}` : '/freestyle/tricks?view=add';
  const res = await request(await createApp()).get(url);
  expect(res.status).toBe(200);
  return res.text;
}
const header = (slug: string) => `add-lineage-header">${slug}`;

describe('ADD view — By family (default)', () => {
  it('has no "Clipper-stall" band and no "-derived" headers', async () => {
    const html = await addView();
    expect(html).not.toContain('-derived');
    expect(html).not.toContain(header('Clipper-stall'));
    expect(html).not.toContain('add-lineage-header">Clipper'); // no surface/root band
  });

  it('bands branch anchors under their own families (not Osis/Legover)', async () => {
    const html = await addView();
    for (const label of ['Torque', 'Blender', 'Double Legover', 'Eggbeater']) {
      expect(html).toContain(header(label));
    }
  });

  it('drifter-family tricks band under Drifter', async () => {
    const html = await addView();
    expect(html).toContain(header('Drifter'));
    // both the drifter anchor and the clipper-stall-tagged member are reachable
    expect(html).toContain('href="/freestyle/tricks/high_plains_drifter"');
  });

  it('non-public-family tricks collect in "Other / standalone tricks"', async () => {
    const html = await addView();
    expect(html).toContain(header('Other / standalone tricks'));
    expect(html).toContain('href="/freestyle/tricks/stepping_reaper"');
  });

  it('Dada Curve appears in its own Dada-Curve family band', async () => {
    const html = await addView();
    expect(html).toContain(header('Dada-Curve'));
  });
});

describe('ADD view — Alphabetical (?sort=alpha)', () => {
  it('renders a flat list with no family headers', async () => {
    const html = await addView('alpha');
    expect(html).not.toContain('add-lineage-header');
  });

  it('Dada Curve is findable in the flat A-Z list', async () => {
    const html = await addView('alpha');
    expect(html).toContain('href="/freestyle/tricks/dada_curve"');
  });
});

describe('Search unaffected by the ADD-view change', () => {
  it('the suggest endpoint still resolves a trick', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'torque' });
    expect(res.status).toBe(200);
    expect(res.body.map((r: { slug: string }) => r.slug)).toContain('torque');
  });
});
