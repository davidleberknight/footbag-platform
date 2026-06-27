/**
 * Alternative-surfaces subsection on the Movement System view.
 *
 * The subsection has one organizing principle: alternative terminal surfaces
 * and balance systems. It renders beneath the movement-system axes on
 * `/freestyle/tricks?view=movement-system` and nowhere else.
 *
 * Contract pinned:
 *   - The Alternative surfaces section appears on ?view=movement-system, and
 *     not on other views (?view=add, ?view=family).
 *   - The four surface groups render (Sole and heel · Inside and outside ·
 *     Head, neck, and shoulder · Cloud and knee).
 *   - Flying / airborne is NOT a surface and does not appear here.
 *   - Tricks render with the shared dictionary-trick-row, like every other
 *     browse view: a plain-text name, a Trick Detail link to the detail page,
 *     and the standard JOB / ADD notation line.
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

const { dbPath } = setTestEnv('3218');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed at least one canonical row per surface group. flying_clipper is
  // seeded too, to prove the surfaces-only page excludes it (flying is a
  // body-movement concept, not a terminal surface).
  const seeds = [
    ['sole_stall',           'sole stall',           '2', 'sole_stall',           'sole_stall',           '[set] > sole'],
    ['heel_stall',           'heel stall',           '1', 'heel_stall',           'heel_stall',           '[set] > heel'],
    ['inside_stall',         'inside stall',         '1', 'inside_stall',         'inside_stall',         '[set] > inside'],
    ['outside_stall',        'outside stall',        '1', 'outside_stall',        'outside_stall',        '[set] > outside'],
    ['head_stall',           'head stall',           '1', 'head_stall',           'head_stall',           '[set] > head'],
    ['neck_stall',           'neck stall',           '1', 'neck_stall',           'neck_stall',           '[set] > neck'],
    ['shoulder_stall',       'shoulder stall',       '1', 'shoulder_stall',       'shoulder_stall',       '[set] > shoulder'],
    ['forehead_stall',       'forehead stall',       '1', 'forehead_stall',       'forehead_stall',       '[set] > forehead'],
    ['cloud_stall',          'cloud stall',          '2', 'cloud_stall',          'cloud_stall',          '[set] > cloud'],
    ['cloud_kick',           'cloud kick',           '1', 'cloud_kick',           'cloud_kick',           '[set] > cloud kick'],
    ['knee_stall',           'knee stall',           '1', 'knee_stall',           'knee_stall',           '[set] > knee'],
    ['sole_kick',            'sole kick',            '1', 'sole_kick',            'sole_kick',            '[set] > sole kick'],
    ['cross_body_sole_stall','cross-body sole stall','3', 'cross_body_sole_stall','cross_body_sole_stall','[set] > sole [xbd]'],
    ['flying_clipper',       'flying clipper',       '2', 'clipper_stall',        'clipper',              'flying > clipper'],
  ];
  for (const [slug, name, adds, base, fam, op] of seeds) {
    insertFreestyleTrick(db, {
      slug, canonical_name: name, adds, base_trick: base, trick_family: fam,
      category: 'surface', operational_notation: op,
      review_status: 'expert_reviewed', is_active: 1,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Movement System view: alternative-surfaces subsection', () => {
  it('renders the Alternative surfaces section on ?view=movement-system', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="alt-surfaces"');
    expect(res.text).toContain('<h2>Alternative surfaces</h2>');
    expect(res.text).toContain('These tricks use other surfaces');
  });

  it('renders the four surface-group labels', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('Sole and heel');
    expect(res.text).toContain('Inside and outside');
    expect(res.text).toContain('Head, neck, and shoulder');
    expect(res.text).toContain('Cloud and knee');
  });

  it('does not render a flying / airborne group, and no flying trick appears on the page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).not.toContain('Flying and airborne variants');
    // Flying tricks carry no modifier links, so they ride no axis; with the
    // group gone they appear nowhere on this view.
    expect(res.text).not.toContain('/freestyle/tricks/flying_clipper');
  });

  it('renders each trick with the shared dictionary-trick-row (name + Trick Detail link + JOB line)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    // Standard browse-row markup, not a bespoke inline list.
    expect(res.text).toContain('class="dict-trick-row"');
    expect(res.text).not.toContain('alt-surface-trick-list');
    // Plain-text name + the separate Trick Detail control to the detail page.
    expect(res.text).toContain('<span class="dict-trick-row-title">sole stall</span>');
    expect(res.text).toContain('href="/freestyle/tricks/sole_stall">Trick Detail');
    // Standardized JOB / ADD notation line.
    expect(res.text).toContain('<span class="dict-trick-row-label">JOB</span>');
    expect(res.text).toContain('<span class="dict-trick-row-label">ADD</span>');
  });

  it('does NOT render the Alternative surfaces section on ?view=add', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="alt-surfaces"');
    expect(res.text).not.toContain('<h2>Alternative surfaces</h2>');
  });

  it('does NOT render the Alternative surfaces section on ?view=family', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="alt-surfaces"');
  });
});
