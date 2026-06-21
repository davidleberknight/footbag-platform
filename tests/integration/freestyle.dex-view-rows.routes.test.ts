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
    // Dex-less body atoms: a body primitive that is its own base (a hop, a standalone
    // body element) has zero dexterity events even with no notation, so it buckets as
    // 0 dex, not Unknown.
    { slug: 'hop-over', canonical_name: 'hop over', adds: '2', base_trick: 'hop-over', trick_family: 'hop-over', category: 'body', notation: 'HOP OVER', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spyro', canonical_name: 'spyro', adds: '1', base_trick: 'spyro', trick_family: 'spyro', category: 'body', notation: 'SPYRO', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // Boundary: body category but NOT its own base + no notation stays Unknown — it is a
    // dex-bearing body compound pending notation, not a dex-less primitive.
    { slug: 'body-compound-fixture', canonical_name: 'body compound fixture', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'body', notation: '', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // No-op-notation tricks are grouped by their REAL blocker, not by which
    // notation field is populated. One fixture per blocker reason:
    { slug: 'authoring-fixture', canonical_name: 'big apple sauce', adds: '4', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'blazing-fixture', canonical_name: 'blazing mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // weaving is the only remaining Red-doctrine block: the operator itself is still unruled.
    { slug: 'weaving-fixture', canonical_name: 'weaving mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // atomic / quantum / nuclear on an X-Dex receiver is resolved by the receiver rule:
    // it falls to needs-authoring (far/near notation pending), never to Red-doctrine.
    { slug: 'atomic-xdex-fixture', canonical_name: 'atomic torque', adds: '5', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'down-gov-fixture', canonical_name: 'down double down', adds: '4', base_trick: 'down', trick_family: 'down', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'stale-fixture', canonical_name: 'blurry whirl', adds: '5', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // A modifier (recognized by resolveTrickKind): excluded from the trick dex-count view entirely.
    { slug: 'ducking', canonical_name: 'ducking', adds: 'modifier', base_trick: 'ducking', trick_family: 'ducking', category: 'modifier', notation: '', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
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

// HTML of one dex bucket: from its section anchor up to the next dex-bucket
// anchor (buckets render 0/1/2/3+ then the no-op-notation blocker groups, so the
// last group runs to the end).
function sectionFor(html: string, bucketId: string): string {
  const start = html.indexOf(`id="${bucketId}"`);
  expect(start, `section ${bucketId} not found`).toBeGreaterThanOrEqual(0);
  const next = html.indexOf('id="dex-', start + 1);
  return next === -1 ? html.slice(start) : html.slice(start, next);
}

describe('Dex view — two-line row contract', () => {
  it('200 + dex buckets, with no-op-notation rows grouped by real blocker (not notation field)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h2>0 dex events</h2>');
    expect(res.text).toContain('<h2>3+ dex events</h2>');
    // The old notation-field labels are gone.
    expect(res.text).not.toContain('Unknown / no notation');
    expect(res.text).not.toContain('JOB notation set, operational notation pending');
    expect(res.text).not.toContain('No notation yet');
    // No-op-notation rows are grouped by their blocker reason.
    expect(res.text).toMatch(/id="dex-needs-authoring"/);
    expect(res.text).toMatch(/id="dex-undefined-operator"/);
    expect(res.text).toMatch(/id="dex-red-doctrine"/);
    expect(res.text).toMatch(/id="dex-governance"/);
    expect(res.text).toMatch(/id="dex-stale"/);
  });

  it('classifies each no-op-notation trick by its real blocker; modifiers excluded', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(sectionFor(res.text, 'dex-undefined-operator')).toContain('data-trick-slug="blazing-fixture"');
    // weaving is the only remaining Red-doctrine block; atomic/X-Dex no longer lands here.
    expect(sectionFor(res.text, 'dex-red-doctrine')).toContain('data-trick-slug="weaving-fixture"');
    expect(sectionFor(res.text, 'dex-red-doctrine')).not.toContain('data-trick-slug="atomic-xdex-fixture"');
    // an atomic / X-Dex-receiver row is resolved: it needs notation authored, not a ruling.
    expect(sectionFor(res.text, 'dex-needs-authoring')).toContain('data-trick-slug="atomic-xdex-fixture"');
    expect(sectionFor(res.text, 'dex-governance')).toContain('data-trick-slug="down-gov-fixture"');
    expect(sectionFor(res.text, 'dex-stale')).toContain('data-trick-slug="stale-fixture"');
    expect(sectionFor(res.text, 'dex-needs-authoring')).toContain('data-trick-slug="mystery-trick"');
    // A modifier never appears in the trick dex-count view.
    expect(res.text).not.toContain('data-trick-slug="ducking"');
  });

  it('landing dex-count card collapses every blocker bucket into ONE Unresolved chip', async () => {
    // The detail page keeps the richer no-op-notation blocker buckets, but the
    // default landing summary card must not echo one chip per bucket. With five
    // distinct blocker buckets in the seed, the landing chip row shows the four
    // numeric dex chips plus a single "Unresolved" chip — never repeated labels.
    const html = (await request(await createApp()).get('/freestyle/tricks')).text;
    // Numeric dex chips still render on the landing card.
    expect(html).toMatch(/dict-landing-card-chip" href="[^"]*dex-count#dex-0">0 dex/);
    expect(html).toMatch(/dict-landing-card-chip" href="[^"]*dex-count#dex-3">3\+ dex/);
    // Exactly one Unresolved chip stands in for every blocker bucket.
    const unresolved = html.match(/dict-landing-card-chip" href="[^"]*dex-count#[^"]*">Unresolved/g) ?? [];
    expect(unresolved).toHaveLength(1);
    // The collapsed-away "Unknown" label never appears on a dex-count landing chip.
    expect(html).not.toMatch(/dict-landing-card-chip" href="[^"]*dex-count#[^"]*">Unknown/);
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

  it('hop-over (dex-less body atom) buckets as 0 dex, never a no-op-notation blocker bucket', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const zero = sectionFor(res.text, 'dex-0');
    const authoring = sectionFor(res.text, 'dex-needs-authoring');
    expect(zero, 'hop-over should sit in the 0-dex bucket').toContain('data-trick-slug="hop-over"');
    expect(authoring, 'hop-over should not sit in a no-notation blocker bucket').not.toContain('data-trick-slug="hop-over"');
  });

  it('spyro is modifier-kind, so it never appears in the trick browse (no dex bucket at all)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).not.toContain('data-trick-slug="spyro"');
  });

  it('a body trick that is NOT its own base is dex-uncountable, grouped by blocker not bucket 0', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const zero = sectionFor(res.text, 'dex-0');
    const authoring = sectionFor(res.text, 'dex-needs-authoring');
    expect(authoring).toContain('data-trick-slug="body-compound-fixture"');
    expect(zero).not.toContain('data-trick-slug="body-compound-fixture"');
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
