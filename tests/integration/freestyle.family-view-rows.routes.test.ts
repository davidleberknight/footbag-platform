/**
 * /freestyle/tricks?view=family — two-line row contract.
 *
 * Family view uses the SAME generalized dictionary-trick-row partial as the
 * ADD view. Every family row obeys the two-line contract:
 *   Line 1 (.dict-trick-row-head): name · hashtag · optional ≡ interpretation · optional media
 *   Line 2 (.dict-trick-row-notation): JOB: <op notation> · ADD: <formula | bare N>
 *
 * Family-specific scaffolding is preserved: family section headings, the
 * family-anchor sublabel, shared-structure invariant, and anchor-first
 * ordering. The shared dict-card / green ADD chip do NOT appear on rows.
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

const { dbPath } = setTestEnv('3523');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('pixie',    'pixie',    'set', 1, 1, '', ?),
      ('stepping', 'stepping', 'set', 1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');

  // Each family needs >1 member (family view drops singletons). The compound
  // members (smear / magellan / ripwalk / torque) carry chain readings in the
  // static registry (freestyleSymbolicEquivalences.ts), so their line-1
  // interpretation slot renders alongside line-2 JOB + ADD.
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    // mirage family
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'smear', canonical_name: 'smear', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'SMEAR', operational_notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // legover family
    { slug: 'legover', canonical_name: 'legover', adds: '2', base_trick: 'legover', trick_family: 'legover', category: 'dex', notation: 'LEGOVER', operational_notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'magellan', canonical_name: 'magellan', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'compound', notation: 'MAGELLAN', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // butterfly family
    { slug: 'butterfly', canonical_name: 'butterfly', adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'dex', notation: 'BUTTERFLY', operational_notation: 'SET > OP OUT [DEX] > SAME CLIP [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ripwalk', canonical_name: 'ripwalk', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', notation: 'RIPWALK', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME CLIP [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // whirl family
    { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', notation: 'WHIRL', operational_notation: 'SET > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'paradox-whirl', canonical_name: 'paradox whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'PARADOX WHIRL', operational_notation: 'CLIP > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // torque family — a derived branch that renders as its own top-level
    // family section. Both rows carry trick_family 'torque' and render UNDER
    // id="family-torque".
    { slug: 'torque', canonical_name: 'torque', adds: '4', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'TORQUE', operational_notation: 'CLIP > SPIN [BOD] > SAME IN [DEX] > OP OSIS [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning-torque', canonical_name: 'spinning torque', adds: '5', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'SPINNING TORQUE', operational_notation: 'CLIP > (back) SPIN [BOD] > SPIN [BOD] > SAME IN [DEX] > OP OSIS [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('smear',    'pixie', 1),
      ('magellan', 'pixie', 1),
      ('ripwalk',  'stepping', 1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// torque is a derived branch that renders as its own top-level family
// section.
const FAMILIES = ['mirage', 'legover', 'butterfly', 'whirl', 'torque'];
const ALL_MEMBERS = ['mirage', 'smear', 'legover', 'magellan', 'butterfly', 'ripwalk', 'whirl', 'paradox-whirl', 'torque', 'spinning-torque'];

function rowFor(html: string, slug: string): string {
  const m = html.match(new RegExp(`<article class="dict-trick-row[\\s\\S]*?data-trick-slug="${slug}"[\\s\\S]*?</article>`));
  expect(m, `dict-trick-row not found for ${slug}`).not.toBeNull();
  return m![0];
}

describe('Family view — two-line row contract', () => {
  it('200 + family section headers + family-anchor sublabel preserved', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    for (const fam of FAMILIES) {
      expect(res.text, `${fam} section missing`).toContain(`id="family-${fam}"`);
    }
    // Family-anchor sublabel (grouping context) still renders.
    expect(res.text).toContain('class="trick-family-anchor-label"');
    expect(res.text).toMatch(/<h2><a href="\/freestyle\/tricks\?family=mirage">Mirage family<\/a><\/h2>/);
  });

  it('every family member renders the generalized dict-trick-row wrapper (line 1 + line 2)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    for (const slug of ALL_MEMBERS) {
      const row = rowFor(res.text, slug);
      expect(row, `${slug} missing head`).toMatch(/class="dict-trick-row-head"/);
      expect(row, `${slug} missing notation`).toMatch(/class="dict-trick-row-notation"/);
    }
  });

  it('NO green ADD chip (.dict-card-add) and NO shared dict-card-stack in the family view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('every family row line 2 carries both a JOB and an ADD label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    for (const slug of ALL_MEMBERS) {
      const row = rowFor(res.text, slug);
      expect(row, `${slug} missing JOB`).toMatch(/class="dict-trick-row-label">JOB</);
      expect(row, `${slug} missing ADD`).toMatch(/class="dict-trick-row-label">ADD</);
    }
  });

  it('interpretation (≡) coexists with JOB + ADD on family compounds', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    // smear ≡ pixie mirage, magellan ≡ pixie legover, torque ≡ miraging osis
    const cases: Array<[string, RegExp]> = [
      ['smear', /mirage/],
      ['magellan', /legover/],
      ['torque', /osis/],
    ];
    for (const [slug, readingToken] of cases) {
      const row = rowFor(res.text, slug);
      expect(row, `${slug} missing interpretation slot`).toMatch(/class="dict-trick-row-interpretation"/);
      expect(row, `${slug} interpretation token`).toMatch(readingToken);
      // ...and the JOB + ADD line still renders on the same row.
      expect(row).toMatch(/class="dict-trick-row-label">JOB</);
      expect(row).toMatch(/class="dict-trick-row-label">ADD</);
    }
  });

  it('anchor-first ordering preserved: family base trick renders before its compounds', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    const start = res.text.indexOf('id="family-mirage"');
    const end = res.text.indexOf('</section>', start);
    const section = res.text.slice(start, end);
    expect(section.indexOf('data-trick-slug="mirage"')).toBeLessThan(section.indexOf('data-trick-slug="smear"'));
  });

  it('operational notation appears ONLY inside the JOB slot (no loose bracket tokens)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, m.index - 260), m.index);
      expect(before, `bracket token at ${m.index} not inside a JOB value`).toMatch(/dict-trick-row-job-value|op-token/);
    }
  });
});
