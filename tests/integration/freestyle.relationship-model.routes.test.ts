/**
 * GET /freestyle/tricks/:slug — structured relationship model.
 *
 * Pins these additive surfaces:
 *   1. Quantity ladder (spin -> double_spin -> triple_spin): a cross-family
 *      progression rendered with a current-rung marker + rationale, NOT a family.
 *   2. Swing elements: the pendulum/rake movement-neighbour pair re-labeled
 *      "Swing elements" with the open-terminal rationale.
 *   3. Related tricks split into labeled relationship groups (group label, not
 *      per-row reason).
 *   4. Orphan-neighbour overlays: double_kick / miraging_kick / toe_clipper
 *      surface their curated movement neighbours, and modifier composition
 *      glosses render inline.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3571');
let createApp: Awaited<ReturnType<typeof importApp>>;

const t = (slug: string, fam: string, adds: string, cat: 'body' | 'dex' | 'compound' = 'compound') =>
  ({ slug, canonical_name: slug.replace(/_/g, ' '), trick_family: fam, base_trick: fam, category: cat, adds, is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const r of [
    // Spin ladder spans three different trick_family values.
    t('spin', 'spin', '1', 'body'),
    t('double_spin', 'double_spin', '2', 'body'),
    t('triple_spin', 'spin', '3'),
    // Swing-element pair.
    t('pendulum', 'pendulum', '2'),
    t('rake', 'rake', '2'),
    // Orphan body primitives + their curated neighbour targets.
    t('double_kick', 'double_kick', '1', 'body'),
    t('double_knee', 'double_knee', '1', 'body'),
    t('miraging_kick', 'miraging_kick', '1', 'dex'),
    t('toe_clipper', 'toe_clipper', '2'),
    t('flying_inside', 'clipper', '2'),
    t('flying_outside', 'clipper', '2'),
    t('flying_clipper', 'clipper', '2'),
    t('mirage', 'mirage', '2', 'dex'),
    // A trick carrying the gyro modifier, to exercise the composition gloss.
    t('gyro_clipper', 'clipper_stall', '2'),
  ]) insertFreestyleTrick(db, r);
  insertFreestyleTrickModifier(db, { slug: 'gyro', modifier_name: 'Gyro', modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'gyro_clipper', 'gyro');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

describe('Quantity ladder (cross-family, not a family)', () => {
  it('renders the Spin ladder with all three rungs + rationale on each member', async () => {
    for (const slug of ['spin', 'double_spin', 'triple_spin']) {
      const html = await page(slug);
      expect(html).toContain('trick-quantity-ladder');
      expect(html).toContain('Spin ladder');
      expect(html).toContain('full 360-degree body rotation');
      expect(html).toContain('ladder-step-current');   // the current rung is marked
    }
  });
  it('marks the current rung and keeps double_spin in its own family', async () => {
    const html = await page('double_spin');
    expect(html).toContain('ladder-step-current');
    // double_spin links the other two rungs (cross-family), not re-homed.
    expect(html).toContain('/freestyle/tricks/spin');
    expect(html).toContain('/freestyle/tricks/triple_spin');
  });
});

describe('Swing elements (movement neighbours, not a family)', () => {
  it('labels the pendulum/rake pair "Swing elements" with the open-terminal rationale', async () => {
    const html = await page('pendulum');
    expect(html).toContain('Swing elements');
    expect(html).toContain('terminal is open');
    expect(html).toContain('/freestyle/tricks/rake');
    const rakeHtml = await page('rake');
    expect(rakeHtml).toContain('Swing elements');
    expect(rakeHtml).toContain('/freestyle/tricks/pendulum');
  });
});

describe('Related groups + regressions', () => {
  it('Related Tricks carries no Same-family group and no per-row reasons', async () => {
    const html = await page('spin');
    // Same-family relating is owned by the Family ladder; Related Tricks no
    // longer carries a Same-family group, and per-row reasons are retired.
    expect(html).not.toContain('Same family');
    expect(html).not.toContain('related-trick-reason');
  });
});

describe('Orphan-neighbour overlays + modifier glosses', () => {
  it('double_kick surfaces its flying-contact set and the double_knee sibling', async () => {
    const html = await page('double_kick');
    expect(html).toContain('Movement neighbours');
    expect(html).toContain('/freestyle/tricks/flying_clipper');
    expect(html).toContain('/freestyle/tricks/double_knee');   // mutual sibling pair
  });
  it('miraging_kick relates to mirage; toe_clipper to flying_clipper', async () => {
    expect(await page('miraging_kick')).toContain('/freestyle/tricks/mirage');
    expect(await page('toe_clipper')).toContain('/freestyle/tricks/flying_clipper');
  });
  it('renders the gyro modifier composition gloss inline', async () => {
    const html = await page('gyro_clipper');
    expect(html).toContain('GYRO + base');
  });
});
