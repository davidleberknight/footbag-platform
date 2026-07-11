/**
 * /freestyle/tricks?view=dex-count — two-line row contract.
 *
 * Dex view uses the SAME generalized dictionary-trick-row partial as the
 * ADD and Family views. Every dex-bucketed row obeys the two-line contract:
 *   Line 1 (.dict-trick-row-head): name · hashtag · optional ≡ interpretation · optional media
 *   Line 2 (.dict-trick-row-notation): JOB: <op notation> · ADD: <formula | bare N>
 *
 * Dex-bucket grouping headers (0 / 1 / 2 / 3+ dex events) are the ONLY sections:
 * a trick without operational notation is not dex-countable and does not render
 * in this view at all (no unresolved / unknown / blocker bucket exists). Such
 * rows stay visible in the other browse views with the INCOMPLETE badge, and
 * the view intro reports how many are pending, derived from the same data.
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
    // No operational notation: not dex-countable, so never rendered in this view.
    { slug: 'mystery-trick', canonical_name: 'mystery trick', adds: '3', base_trick: 'mystery-trick', trick_family: 'mystery-trick', category: 'compound', notation: '', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // Dex-less body atoms: a body primitive that is its own base (a hop, a standalone
    // body element) has zero dexterity events even with no notation, so it buckets as
    // 0 dex, not Unknown.
    { slug: 'hop-over', canonical_name: 'hop over', adds: '2', base_trick: 'hop-over', trick_family: 'hop-over', category: 'body', notation: 'HOP OVER', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spyro', canonical_name: 'spyro', adds: '1', base_trick: 'spyro', trick_family: 'spyro', category: 'body', notation: 'SPYRO', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // Boundary: body category but NOT its own base + no notation is dex-uncountable —
    // a dex-bearing body compound pending notation, not a dex-less primitive, so it
    // never buckets as 0 dex and never renders in this view.
    { slug: 'body-compound-fixture', canonical_name: 'body compound fixture', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'body', notation: '', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    // No-op-notation tricks across the old blocker spectrum: all of them are
    // simply absent from the dex view (notation-backfill work lives elsewhere):
    { slug: 'authoring-fixture', canonical_name: 'big apple sauce', adds: '4', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'blazing-fixture', canonical_name: 'blazing mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'weaving-fixture', canonical_name: 'weaving mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'JOB CHAIN', operational_notation: null, review_status: 'expert_reviewed', is_active: 1 },
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
// anchor (buckets render 0/1/2/3+; the last one runs to the end).
function sectionFor(html: string, bucketId: string): string {
  const start = html.indexOf(`id="${bucketId}"`);
  expect(start, `section ${bucketId} not found`).toBeGreaterThanOrEqual(0);
  const next = html.indexOf('id="dex-', start + 1);
  return next === -1 ? html.slice(start) : html.slice(start, next);
}

// The seeded active trick-kind rows that carry no operational notation and are
// not dex-less body atoms; they are dex-uncountable and stay out of this view.
const NOTATION_PENDING_SLUGS = [
  'mystery-trick', 'body-compound-fixture', 'authoring-fixture', 'blazing-fixture',
  'weaving-fixture', 'atomic-xdex-fixture', 'down-gov-fixture', 'stale-fixture',
];

describe('Dex view — two-line row contract', () => {
  it('renders the service-shaped dex-count intro with the derived pending-notation count', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="browse-view-intro"');
    expect(res.text).toMatch(/grouped by how many dexterity moves they involve/i);
    // The pending count is derived from the same pass that built the buckets,
    // so it always equals the number of dex-uncountable seeded rows.
    expect(res.text).toContain(
      `${NOTATION_PENDING_SLUGS.length} canonical tricks await notation authoring`);
    expect(res.text).toMatch(/appear in the other browse views with an incomplete badge/);
  });

  it('renders ONLY the four dex buckets: the unresolved bucket is gone', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h2>0 dex events</h2>');
    expect(res.text).toContain('<h2>3+ dex events</h2>');
    // No unresolved / unknown / blocker section of any kind renders in the dex view.
    expect(res.text).not.toContain('id="dex-unknown"');
    expect(res.text).not.toContain('id="dex-needs-authoring"');
    expect(res.text).not.toContain('id="dex-documented"');
    expect(res.text).not.toContain('id="dex-undefined-operator"');
    expect(res.text).not.toContain('id="dex-governance"');
    expect(res.text).not.toContain('id="dex-identification"');
    expect(res.text).not.toContain('Unknown / no notation');
  });

  it('a trick without operational notation never renders in the dex view; modifiers excluded', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    for (const slug of NOTATION_PENDING_SLUGS) {
      expect(res.text, `${slug} must not render in the dex view`)
        .not.toContain(`data-trick-slug="${slug}"`);
    }
    // A modifier never appears in the trick dex-count view.
    expect(res.text).not.toContain('data-trick-slug="ducking"');
  });

  it('notation-pending tricks stay browsable in the ADD view carrying the INCOMPLETE badge', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    // mystery-trick has no notation of any kind: visible, badged incomplete.
    const row = rowFor(res.text, 'mystery-trick');
    expect(row).toContain('dict-badge-incomplete');
  });

  it('landing dex-count card shows only the numeric dex chips (no Unresolved chip)', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks')).text;
    // Numeric dex chips still render on the landing card.
    expect(html).toMatch(/dict-landing-card-chip" href="[^"]*dex-count#dex-0">0 dex/);
    expect(html).toMatch(/dict-landing-card-chip" href="[^"]*dex-count#dex-3">3\+ dex/);
    // Neither an Unresolved nor an Unknown chip renders: the dex view has no such bucket.
    expect(html).not.toMatch(/dict-landing-card-chip" href="[^"]*dex-count#[^"]*">Unresolved/);
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

  it('drifter: interpretation held (no ≡ reading); line 2 resolved JOB + ADD', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const row = rowFor(res.text, 'drifter');
    // drifter's "miraging clipper" reading is held for curator review.
    expect(row).not.toMatch(/class="dict-trick-row-interpretation"/);
    expect(row).not.toMatch(/miraging/);
    expect(row).toMatch(/class="dict-trick-row-job-value">/);
  });

  it('ducking-guay + fairy-legover derive line-2 ADD formulas from their modifier links', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(rowFor(res.text, 'ducking-guay')).toMatch(/ducking\(\+1\) \+ guay\(2\)/);
    expect(rowFor(res.text, 'fairy-legover')).toMatch(/fairy\(\+1\) \+ legover\(2\)/);
  });

  it('hop-over (dex-less body atom) buckets as 0 dex even with no notation', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const zero = sectionFor(res.text, 'dex-0');
    expect(zero, 'hop-over should sit in the 0-dex bucket').toContain('data-trick-slug="hop-over"');
  });

  it('spyro is modifier-kind, so it never appears in the trick browse (no dex bucket at all)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).not.toContain('data-trick-slug="spyro"');
  });

  it('a body trick that is NOT its own base is dex-uncountable: absent from the view, not bucket 0', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).not.toContain('data-trick-slug="body-compound-fixture"');
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
