/**
 * /freestyle/tricks?view=dex-count — two-line row contract (2026-05-27 migration).
 *
 * Dex view migrated to the SAME generalized dictionary-trick-row partial as the
 * ADD and Family views. Every dex-bucketed row obeys the two-line contract:
 *   Line 1 (.dict-trick-row-head): name · hashtag · optional ≡ interpretation · optional media
 *   Line 2 (.dict-trick-row-notation): JOB: <op notation> · ADD: <formula | bare N>
 *
 * Dex-bucket grouping headers (0 / 1 / 2 / 3+ dex events, Unknown) are preserved.
 * The shared dict-card / green ADD chip do NOT appear on rows.
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

const { dbPath } = setTestEnv('3524');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('ducking', 'ducking', 'body', 1, 1, '', ?),
      ('fairy',   'fairy',   'set',  1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');

  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    // 0 dex
    { slug: '2-bag-juggling', canonical_name: '2-bag juggling', adds: '2', base_trick: '2-bag-juggling', trick_family: '2-bag-juggling', category: 'compound', notation: 'TOE > TOE', operational_notation: 'TOE [DEL] > TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spin', canonical_name: 'spin', adds: '1', base_trick: 'spin', trick_family: 'spin', category: 'body', notation: 'SPIN', operational_notation: 'SPIN [BOD]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'double-spin', canonical_name: 'double spin', adds: '2', base_trick: 'double-spin', trick_family: 'double-spin', category: 'body', notation: 'SPIN > SPIN', operational_notation: 'SPIN [BOD] > SPIN [BOD]', review_status: 'expert_reviewed', is_active: 1 },
    // 1 dex
    { slug: 'drifter', canonical_name: 'drifter', adds: '3', base_trick: 'drifter', trick_family: 'drifter', category: 'compound', notation: 'DRIFTER', operational_notation: 'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'guay', canonical_name: 'guay', adds: '2', base_trick: 'guay', trick_family: 'guay', category: 'dex', notation: 'GUAY', operational_notation: 'SET > OP IN [DEX] > SAME INSIDE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-guay', canonical_name: 'ducking guay', adds: '3', base_trick: 'guay', trick_family: 'guay', category: 'compound', notation: 'DUCKING GUAY', operational_notation: 'TOE > DUCK [BOD] > OP IN [DEX] > SAME INSIDE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'torque', canonical_name: 'torque', adds: '4', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'TORQUE', operational_notation: 'CLIP > SPIN [BOD] > SAME IN [DEX] > OP OSIS [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // 2 dex
    { slug: 'legover', canonical_name: 'legover', adds: '2', base_trick: 'legover', trick_family: 'legover', category: 'dex', notation: 'LEGOVER', operational_notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'fairy-legover', canonical_name: 'fairy legover', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'compound', notation: 'FAIRY LEGOVER', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // 3+ dex
    { slug: 'triple-dex-fixture', canonical_name: 'triple dex fixture', adds: '4', base_trick: 'triple-dex-fixture', trick_family: 'triple-dex-fixture', category: 'compound', notation: 'TRIPLE DEX', operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // Unknown (no notation)
    { slug: 'mystery-trick', canonical_name: 'mystery trick', adds: '3', base_trick: 'mystery-trick', trick_family: 'mystery-trick', category: 'compound', notation: '', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('ducking-guay',  'ducking', 1),
      ('fairy-legover', 'fairy',   1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const REPRESENTATIVE = ['2-bag-juggling', 'drifter', 'ducking-guay', 'fairy-legover', 'spin', 'double-spin', 'torque'];

function rowFor(html: string, slug: string): string {
  const m = html.match(new RegExp(`<article class="dict-trick-row[\\s\\S]*?data-trick-slug="${slug}"[\\s\\S]*?</article>`));
  expect(m, `dict-trick-row not found for ${slug}`).not.toBeNull();
  return m![0];
}

describe('Dex view — two-line row contract', () => {
  it('200 + dex-bucket group headers preserved', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h2>0 dex events</h2>');
    expect(res.text).toContain('<h2>1 dex event</h2>');
    expect(res.text).toContain('<h2>2 dex events</h2>');
    expect(res.text).toContain('<h2>3+ dex events</h2>');
    expect(res.text).toContain('<h2>Unknown / no notation</h2>');
    expect(res.text).toMatch(/id="dex-0"/);
    expect(res.text).toMatch(/id="dex-unknown"/);
  });

  it('every representative row uses the generalized dict-trick-row wrapper (line 1 + line 2)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    for (const slug of REPRESENTATIVE) {
      const row = rowFor(res.text, slug);
      expect(row, `${slug} missing head`).toMatch(/class="dict-trick-row-head"/);
      expect(row, `${slug} missing notation`).toMatch(/class="dict-trick-row-notation"/);
    }
  });

  it('NO green ADD chip and NO shared dict-card-stack in the dex view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('every representative row line 2 carries both a JOB and an ADD label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    for (const slug of REPRESENTATIVE) {
      const row = rowFor(res.text, slug);
      expect(row, `${slug} missing JOB`).toMatch(/class="dict-trick-row-label">JOB</);
      expect(row, `${slug} missing ADD`).toMatch(/class="dict-trick-row-label">ADD</);
    }
  });

  it('spin + double-spin (kick-doctrine tricks) are findable in the dex view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toContain('data-trick-slug="spin"');
    expect(res.text).toContain('data-trick-slug="double-spin"');
  });

  it('2-bag-juggling: no interpretation slot; line 2 has JOB + ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const row = rowFor(res.text, '2-bag-juggling');
    expect(row).not.toMatch(/class="dict-trick-row-interpretation"/);
    expect(row).toMatch(/class="dict-trick-row-label">JOB</);
    expect(row).toMatch(/class="dict-trick-row-label">ADD</);
  });

  it('drifter: line 1 ≡ interpretation; line 2 resolved JOB + ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const row = rowFor(res.text, 'drifter');
    expect(row).toMatch(/class="dict-trick-row-interpretation"/);
    expect(row).toMatch(/miraging/);
    expect(row).toMatch(/class="dict-trick-row-job-value">/);
  });

  it('ducking-guay + fairy-legover derive line-2 ADD formulas from their modifier links', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(rowFor(res.text, 'ducking-guay')).toMatch(/ducking\(\+1\) \+ guay\(2\)/);
    expect(rowFor(res.text, 'fairy-legover')).toMatch(/fairy\(\+1\) \+ legover\(2\)/);
  });

  it('operational notation appears ONLY inside the JOB slot (no loose bracket tokens)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, m.index - 260), m.index);
      expect(before, `bracket token at ${m.index} not inside a JOB value`).toMatch(/dict-trick-row-job-value|op-token/);
    }
  });
});
