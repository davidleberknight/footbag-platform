/**
 * GET /freestyle/tricks/:slug — structured relationship model.
 *
 * Pins these additive surfaces:
 *   1. Quantity ladder (spin -> double-spin -> triple-spin): a cross-family
 *      progression rendered with a current-rung marker + rationale, NOT a family.
 *   2. Swing elements: the pendulum/rake movement-neighbour pair re-labeled
 *      "Swing elements" with the open-terminal rationale.
 *   3. Related tricks split into labeled relationship groups (group label, not
 *      per-row reason).
 *   4. Orphan-neighbour overlays: double-kick / miraging-kick / toe-clipper
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
  ({ slug, canonical_name: slug.replace(/-/g, ' '), trick_family: fam, base_trick: fam, category: cat, adds, is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const r of [
    // Spin ladder spans three different trick_family values.
    t('spin', 'spin', '1', 'body'),
    t('double-spin', 'double-spin', '2', 'body'),
    t('triple-spin', 'spin', '3'),
    // Swing-element pair.
    t('pendulum', 'pendulum', '2'),
    t('rake', 'rake', '2'),
    // Orphan body primitives + their curated neighbour targets.
    t('double-kick', 'double-kick', '1', 'body'),
    t('double-knee', 'double-knee', '1', 'body'),
    t('miraging-kick', 'miraging-kick', '1', 'dex'),
    t('toe-clipper', 'toe-clipper', '2'),
    t('flying-inside', 'clipper', '2'),
    t('flying-outside', 'clipper', '2'),
    t('flying-clipper', 'clipper', '2'),
    t('mirage', 'mirage', '2', 'dex'),
    // A trick carrying the gyro modifier, to exercise the composition gloss.
    t('gyro-clipper', 'clipper-stall', '2'),
  ]) insertFreestyleTrick(db, r);
  insertFreestyleTrickModifier(db, { slug: 'gyro', modifier_name: 'Gyro', modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'gyro-clipper', 'gyro');
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
    for (const slug of ['spin', 'double-spin', 'triple-spin']) {
      const html = await page(slug);
      expect(html).toContain('trick-quantity-ladder');
      expect(html).toContain('Spin ladder');
      expect(html).toContain('full 360-degree body rotation');
      expect(html).toContain('ladder-step-current');   // the current rung is marked
    }
  });
  it('marks the current rung and keeps double-spin in its own family', async () => {
    const html = await page('double-spin');
    expect(html).toContain('ladder-step-current');
    // double-spin links the other two rungs (cross-family), not re-homed.
    expect(html).toContain('/freestyle/tricks/spin');
    expect(html).toContain('/freestyle/tricks/triple-spin');
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
  it('double-kick surfaces its flying-contact set and the double-knee sibling', async () => {
    const html = await page('double-kick');
    expect(html).toContain('Movement neighbours');
    expect(html).toContain('/freestyle/tricks/flying-clipper');
    expect(html).toContain('/freestyle/tricks/double-knee');   // mutual sibling pair
  });
  it('miraging-kick relates to mirage; toe-clipper to flying-clipper', async () => {
    expect(await page('miraging-kick')).toContain('/freestyle/tricks/mirage');
    expect(await page('toe-clipper')).toContain('/freestyle/tricks/flying-clipper');
  });
  it('renders the gyro modifier composition gloss inline', async () => {
    const html = await page('gyro-clipper');
    expect(html).toContain('GYRO + base');
  });
});
