/**
 * Alternative-surfaces subsection on the Movement System view.
 *
 * Pinning test for the 2026-05-24 follow-on to the nonstandard-topology
 * audit. The subsection is compact educational content rendered AFTER
 * the 4 movement-system axes on `/freestyle/tricks?view=movement-system`.
 * It is NOT a separate ?view= toggle and does NOT use registry-density
 * dictionary-trick-card rendering.
 *
 * Contract pinned:
 *   - The Alternative surfaces section appears on ?view=movement-system
 *   - It does NOT appear on other views (?view=add etc)
 *   - The 5 sub-group labels render (Sole and heel · Inside and outside ·
 *     Head, neck, and shoulder · Cloud and knee · Flying and airborne)
 *   - Trick names link to /freestyle/tricks/:slug
 *   - No dictionary-trick-card partial output in the subsection
 *     (compact list density, not registry density)
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

  // Seed enough alt-surface canonical rows to populate at least one
  // member per group. Each row uses [set]-prefixed compact notation
  // because that's the canonical form for surface-stall primitives.
  const seeds = [
    ['sole-stall',           'sole stall',           '2', 'sole-stall',           'sole-stall',           '[set] > sole'],
    ['heel-stall',           'heel stall',           '1', 'heel-stall',           'heel-stall',           '[set] > heel'],
    ['inside-stall',         'inside stall',         '1', 'inside-stall',         'inside-stall',         '[set] > inside'],
    ['outside-stall',        'outside stall',        '1', 'outside-stall',        'outside-stall',        '[set] > outside'],
    ['head-stall',           'head stall',           '1', 'head-stall',           'head-stall',           '[set] > head'],
    ['neck-stall',           'neck stall',           '1', 'neck-stall',           'neck-stall',           '[set] > neck'],
    ['shoulder-stall',       'shoulder stall',       '1', 'shoulder-stall',       'shoulder-stall',       '[set] > shoulder'],
    ['forehead-stall',       'forehead stall',       '1', 'forehead-stall',       'forehead-stall',       '[set] > forehead'],
    ['cloud-stall',          'cloud stall',          '2', 'cloud-stall',          'cloud-stall',          '[set] > cloud'],
    ['cloud-kick',           'cloud kick',           '1', 'cloud-kick',           'cloud-kick',           '[set] > cloud kick'],
    ['knee-stall',           'knee stall',           '1', 'knee-stall',           'knee-stall',           '[set] > knee'],
    ['flying-clipper',       'flying clipper',       '2', 'clipper-stall',        'clipper',              'flying > clipper'],
    ['flying-inside',        'flying inside',        '1', 'flying-inside',        'flying-inside',        'flying > inside'],
    ['flying-outside',       'flying outside',       '1', 'flying-outside',       'flying-outside',       'flying > outside'],
    ['dragonfly-kick',       'dragonfly kick',       '2', 'dragonfly-kick',       'dragonfly-kick',       'flying > dragonfly'],
    ['butterfly-kick',       'butterfly kick',       '3', 'butterfly',            'butterfly',            'SET > JUMP [BOD] > SAME or OP OUT [DEX] > OP CLIP [XBD]'],
    ['sole-kick',            'sole kick',            '1', 'sole-kick',            'sole-kick',            '[set] > sole kick'],
    ['cross-body-sole-stall','cross-body sole stall','3', 'cross-body-sole-stall','cross-body-sole-stall','[set] > sole [xbd]'],
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
    expect(res.text).toContain('Most freestyle tricks revolve around toe and clipper surfaces');
  });

  it('renders all 5 sub-group labels', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('Sole and heel');
    expect(res.text).toContain('Inside and outside');
    expect(res.text).toContain('Head, neck, and shoulder');
    expect(res.text).toContain('Cloud and knee');
    expect(res.text).toContain('Flying and airborne variants');
  });

  it('renders trick links and ADD values inline (not as dictionary-trick-cards)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    // Compact-list rendering: anchor + (N ADD) inline, no dict-card surface
    expect(res.text).toMatch(/<li class="alt-surface-trick">\s*<a href="\/freestyle\/tricks\/sole-stall">sole stall<\/a>\s*<span class="alt-surface-add">\(2 ADD\)<\/span>/);
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/head-stall">head stall<\/a>/);
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/flying-clipper">flying clipper<\/a>/);
  });

  it('does NOT use registry-density dictionary-trick-card in the subsection', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    // Find the alt-surfaces section bounds; nothing inside should
    // carry a `dict-card--registry` class.
    const sectionStart = res.text.indexOf('id="alt-surfaces"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart + 1);
    expect(sectionStart).toBeGreaterThan(-1);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    // Find the very last </section> of alt-surfaces' nested groups
    const subSlice = res.text.substring(sectionStart, sectionStart + 8000);
    // Compact list class is alt-surface-trick-list. No registry density class.
    expect(subSlice).toContain('alt-surface-trick-list');
    expect(subSlice).not.toContain('dict-card-stack--registry');
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
