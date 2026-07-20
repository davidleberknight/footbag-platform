/**
 * Per-view scale-intro guard.
 *
 * Each non-landing browse view shows a visible "scale" sentence stating how
 * many groupings + trick-row memberships it renders. The counts are derived
 * from the same group arrays the template renders, so this test also asserts
 * the stated grouping count matches the number of rendered sections (not a
 * hardcoded guess).
 *
 * Family wording is intentionally cautious ("family groupings", "may later
 * roll into broader family hierarchies") pending the family-hierarchy audit.
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

const { dbPath } = setTestEnv('3527');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('pixie',    'pixie',    'set',  1, 1, '', ?),
      ('ducking',  'ducking',  'body', 1, 1, '', ?),
      ('spinning', 'spinning', 'body', 1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');

  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', notation: 'WHIRL', operational_notation: 'SET > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'pixie-illusion', canonical_name: 'pixie illusion', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'PIXIE ILLUSION', operational_notation: 'SET > PIXIE > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-whirl', canonical_name: 'ducking whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'DUCKING WHIRL', operational_notation: 'CLIP > DUCK [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', notation: 'SPINNING WHIRL', operational_notation: 'CLIP > SPIN [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // Third mirage member so the mirage family clears the family-view
    // three-member minimum (two family groupings render, not one).
    { slug: 'blur', canonical_name: 'blur', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'BLUR', operational_notation: 'SET > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('pixie-illusion', 'pixie',    1),
      ('ducking-whirl',  'ducking',  1),
      ('spinning-whirl', 'spinning', 1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function scaleSentence(html: string): string {
  const m = html.match(/<p class="browse-view-scale">([^<]+)<\/p>/);
  expect(m, 'browse-view-scale sentence not present').not.toBeNull();
  return m![1];
}

function leadingInt(s: string): number {
  const m = s.match(/(\d[\d,]*)/);
  expect(m, `no leading integer in: ${s}`).not.toBeNull();
  return parseInt(m![1].replace(/,/g, ''), 10);
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('Browse-view scale intros — present + clarifying clause per view', () => {
  it('Family view states a cautious family-groupings scale', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks?view=family')).text;
    const scale = scaleSentence(html);
    expect(scale).toMatch(/family groupings organize tricks by structural anchor/);
    expect(scale).toMatch(/may later roll into broader family hierarchies/);
    expect(scale).toMatch(/trick-row memberships shown/);
  });

  it('Dex view states a dex-bucket + canonical-row scale', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks?view=dex-count')).text;
    const scale = scaleSentence(html);
    expect(scale).toMatch(/dex buckets? ·/);
    expect(scale).toMatch(/canonical trick rows? represented/);
  });

  it('Movement System view states an axes scale + multi-axis clarification', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks?view=movement-system')).text;
    const scale = scaleSentence(html);
    expect(scale).toMatch(/systems \/ axes ·|system \/ axis ·/);
    expect(scale).toMatch(/trick-row memberships shown/);
    expect(scale).toMatch(/A compound can appear under more than one axis or modifier\./);
  });

  it('By Modifier view states a modifiers scale + multi-modifier clarification', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks?view=sets')).text;
    const scale = scaleSentence(html);
    expect(scale).toMatch(/modifiers? ·/);
    expect(scale).toMatch(/trick-row memberships shown/);
    expect(scale).toMatch(/A trick that uses more than one modifier appears under each\./);
  });

  it('Neighborhoods view states a neighborhoods scale + exploratory caveat', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks?view=topology')).text;
    const scale = scaleSentence(html);
    expect(scale).toMatch(/neighborhoods? ·/);
    expect(scale).toMatch(/trick-row memberships shown/);
    expect(scale).toMatch(/Exploratory, pedagogical grouping, not a canonical taxonomy\./);
  });
});

describe('Browse-view scale intros — counts match the rendered sections (not hardcoded)', () => {
  // grouping-count in the scale === number of rendered grouping sections.
  const CASES: Array<[string, string, string]> = [
    ['family', 'family', 'class="content-section trick-family-group'],
    ['dex-count', 'dex', 'class="content-section trick-dex-count-group'],
    ['movement-system', 'movement axes', 'class="content-section trick-movement-axis'],
    ['sets', 'sets', 'class="trick-set-group"'],
    ['topology', 'neighborhoods', 'class="content-section trick-topology-group'],
  ];

  for (const [view, label, sectionMarker] of CASES) {
    it(`${view}: scale grouping count equals the number of rendered ${label} sections`, async () => {
      const html = (await request(await createApp()).get(`/freestyle/tricks?view=${view}`)).text;
      const statedGroupings = leadingInt(scaleSentence(html));
      const renderedSections = countOccurrences(html, sectionMarker);
      expect(renderedSections, `${view} renders ${label} sections`).toBeGreaterThan(0);
      expect(statedGroupings, `${view} scale count matches rendered sections`).toBe(renderedSections);
    });
  }

  it('family: stated memberships equals the number of rendered family rows', async () => {
    const html = (await request(await createApp()).get('/freestyle/tricks?view=family')).text;
    const scale = scaleSentence(html);
    const memberships = parseInt(scale.match(/(\d[\d,]*) trick-row memberships/)![1].replace(/,/g, ''), 10);
    const renderedRows = countOccurrences(html, 'data-trick-slug="');
    expect(memberships).toBe(renderedRows);
  });
});
