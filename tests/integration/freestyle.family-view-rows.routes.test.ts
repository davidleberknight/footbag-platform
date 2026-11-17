/**
 * /freestyle/tricks?view=family&family=<slug> — two-line row contract.
 *
 * Family view uses the SAME generalized dictionary-trick-row partial as the
 * ADD view. Every family row, on its family's own page, obeys the two-line
 * contract:
 *   Line 1 (.dict-trick-row-head): name · hashtag · optional ≡ interpretation · optional media
 *   Line 2 (.dict-trick-row-notation): JOB: <op notation> · ADD: <formula | bare N>
 *
 * Family-specific scaffolding is preserved: the family section heading and
 * anchor-first ordering. The shared dict-card / green ADD chip do NOT appear
 * on rows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3523');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  insertFreestyleTrickModifier(db, { slug: 'pixie', modifier_type: 'set', notes: '' });
  insertFreestyleTrickModifier(db, { slug: 'stepping', modifier_type: 'set', notes: '' });

  // Each family needs at least three members (family view drops families below
  // the three-member minimum). The compound
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
    // Third member per family so each clears the family-view three-member minimum.
    { slug: 'blur', canonical_name: 'blur', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'BLUR', operational_notation: 'SET > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'double-leg-over', canonical_name: 'double leg over', adds: '4', base_trick: 'legover', trick_family: 'legover', category: 'compound', notation: 'DOUBLE LEG OVER', operational_notation: 'SET > OP OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'parkwalk', canonical_name: 'parkwalk', adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', notation: 'PARKWALK', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME CLIP [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'blurry-whirl', canonical_name: 'blurry whirl', adds: '5', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'BLURRY WHIRL', operational_notation: 'CLIP > LEGGY IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'gyro-torque', canonical_name: 'gyro torque', adds: '6', base_trick: 'torque', trick_family: 'torque', category: 'compound', notation: 'GYRO TORQUE', operational_notation: 'CLIP > GYRO [BOD] > SAME IN [DEX] > OP OSIS [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  insertFreestyleTrickModifierLink(db, 'smear', 'pixie');
  insertFreestyleTrickModifierLink(db, 'magellan', 'pixie');
  insertFreestyleTrickModifierLink(db, 'ripwalk', 'stepping');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// torque is a derived branch that renders as its own top-level family
// section.
const MEMBERS: Record<string, string[]> = {
  mirage:    ['mirage', 'smear'],
  legover:   ['legover', 'magellan'],
  butterfly: ['butterfly', 'ripwalk'],
  whirl:     ['whirl', 'paradox-whirl'],
  torque:    ['torque', 'spinning-torque'],
};
const FAMILIES = Object.keys(MEMBERS);
const ALL_MEMBERS = Object.values(MEMBERS).flat();

function rowFor(html: string, slug: string): string {
  const m = html.match(new RegExp(`<article class="dict-trick-row[\\s\\S]*?data-trick-slug="${slug}"[\\s\\S]*?</article>`));
  expect(m, `dict-trick-row not found for ${slug}`).not.toBeNull();
  return m![0];
}

// One family's own page in the family view.
const familyPath = (family: string) => `/freestyle/tricks?view=family&family=${family}`;

// Each seeded family's own page, one response per family.
async function familyPages(): Promise<Array<{ family: string; status: number; text: string }>> {
  const pages = [];
  for (const family of FAMILIES) {
    const res = await getPage(familyPath(family));
    pages.push({ family, status: res.status, text: res.text });
  }
  return pages;
}

// The row for a member, looked up on its own family's page.
async function memberRow(slug: string): Promise<string> {
  const family = Object.entries(MEMBERS).find(([, slugs]) => slugs.includes(slug))![0];
  return rowFor((await getPage(familyPath(family))).text, slug);
}

describe('Family view — two-line row contract', () => {
  // Defect caught: a family's own page fails, shows the wrong family, or its
  // heading links somewhere that does not show that family.
  it('200 + each family page renders its section, headed by a link to itself', async () => {
    for (const p of await familyPages()) {
      expect(p.status, `${p.family} page status`).toBe(200);
      expect(p.text, `${p.family} section missing`).toContain(`id="family-${p.family}"`);
    }
    const mirage = await getPage(familyPath('mirage'));
    expect(mirage.text).toMatch(/<h2><a href="\/freestyle\/tricks\?view=family&amp;family=mirage">Mirage family<\/a><\/h2>/);
  });

  it('every family member renders both columns of the shared dict-trick-row', async () => {
    for (const slug of ALL_MEMBERS) {
      const row = await memberRow(slug);
      expect(row, `${slug} missing identity`).toMatch(/class="dict-trick-row-identity"/);
      expect(row, `${slug} missing notation`).toMatch(/class="dict-trick-row-notation"/);
    }
  });

  it('NO green ADD chip (.dict-card-add) and NO shared dict-card-stack in the family view', async () => {
    for (const p of await familyPages()) {
      expect(p.text, p.family).toContain('data-trick-slug="');
      expect(p.text, p.family).not.toMatch(/class="dict-card-add[ "]/);
      expect(p.text, p.family).not.toContain('dict-card-stack');
    }
  });

  it('every family row carries its notation and its difficulty value', async () => {
    for (const slug of ALL_MEMBERS) {
      const row = await memberRow(slug);
      expect(row, `${slug} missing notation`).toMatch(/class="dict-trick-row-notation-value"/);
      expect(row, `${slug} missing difficulty value`).toMatch(/class="dict-trick-row-add">\(\d+\)</);
    }
  });

  it('a family compound row keeps to identity and notation, carrying no ≡ reading', async () => {
    // Each of these has an authored equivalence chain, so a reading leaking
    // onto the row would show here.
    for (const slug of ['smear', 'magellan', 'torque']) {
      const row = await memberRow(slug);
      expect(row, `${slug} row carries a reading`).not.toMatch(/&equiv;/);
      expect(row).toMatch(/class="dict-trick-row-notation-value"/);
    }
  });

  it('anchor-first ordering preserved: family base trick renders before its compounds', async () => {
    const res = await getPage(familyPath('mirage'));
    const start = res.text.indexOf('id="family-mirage"');
    expect(start).toBeGreaterThan(-1);
    const end = res.text.indexOf('</section>', start);
    const section = res.text.slice(start, end);
    expect(section.indexOf('data-trick-slug="mirage"')).toBeGreaterThan(-1);
    expect(section.indexOf('data-trick-slug="mirage"')).toBeLessThan(section.indexOf('data-trick-slug="smear"'));
  });

  it('operational notation appears ONLY inside the JOB slot (no loose bracket tokens)', async () => {
    for (const p of await familyPages()) {
      const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p.text)) !== null) {
        const before = p.text.substring(Math.max(0, m.index - 260), m.index);
        expect(before, `${p.family}: bracket token at ${m.index} not inside a JOB value`).toMatch(/dict-trick-row-notation-value|op-token/);
      }
    }
  });
});
