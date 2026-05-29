/**
 * /freestyle/tricks?view=sets — By Set browse view tests.
 *
 * Pins the post-audit behavior:
 *   1. `?view=sets` answers "which tricks use this set?" — renders modifier-
 *      grouped trick lists, NOT the Set Encyclopedia surface.
 *   2. Set Encyclopedia remains separate at `/freestyle/sets` (sets-
 *      encyclopedia.hbs template).
 *   3. Ecosystem findability: fairy / spinning / stepping / quantum /
 *      ducking sections each surface their modifier-linked tricks.
 *   4. `spinning-paradox-mirage` reaches both spinning and paradox sections.
 *   5. No raw operational notation leaks outside the dictionary-trick-card
 *      partial's standardized JOB block.
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

const { dbPath } = setTestEnv('3415');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // ── Modifier registrations ────────────────────────────────────────
  // Mirror the production registry surface so the modifier-link grouping
  // has something to bucket against.
  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('paradox',  'paradox',  'body', 1, 1, 'Cross-body hip-pivot during dex.', ?),
      ('spinning', 'spinning', 'body', 1, 1, 'Back-spin entry.', ?),
      ('ducking',  'ducking',  'body', 1, 1, 'Ducking dip during dex.', ?),
      ('fairy',    'fairy',    'set',  1, 1, 'Fairy entry chassis.', ?),
      ('stepping', 'stepping', 'set',  1, 1, 'Stepping leading-dex chassis.', ?),
      ('quantum',  'quantum',  'set',  1, 1, 'Quantum entry chassis.', ?),
      ('pixie',    'pixie',    'set',  1, 1, 'Pixie entry chassis.', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z',
         '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z',
         '2026-05-27T00:00:00.000Z');

  // ── Canonical base tricks (modifier targets) ─────────────────────
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    notation: 'WHIRL', operational_notation: 'CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly', adds: '3',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'dex',
    notation: 'BUTTERFLY', operational_notation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── Modifier-link compound: spinning-paradox-mirage (the user's
  //    headline findability concern). Lives at both spinning and paradox
  //    sections after the fix. ─────────────────────────────────────
  insertFreestyleTrick(db, {
    slug: 'spinning-paradox-mirage', canonical_name: 'spinning paradox mirage',
    adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'SPINNING PARADOX MIRAGE',
    operational_notation: 'CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('spinning-paradox-mirage', 'spinning', 1), ('spinning-paradox-mirage', 'paradox', 2)
  `).run();

  // Fairy ecosystem representatives
  insertFreestyleTrick(db, {
    slug: 'fairy-mirage', canonical_name: 'fairy mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'FAIRY MIRAGE',
    operational_notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'fairy-butterfly', canonical_name: 'fairy butterfly', adds: '4',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    notation: 'FAIRY BUTTERFLY',
    operational_notation: 'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('fairy-mirage', 'fairy', 1), ('fairy-butterfly', 'fairy', 1)
  `).run();

  // Stepping ecosystem representative
  insertFreestyleTrick(db, {
    slug: 'stepping-eggbeater', canonical_name: 'stepping eggbeater', adds: '4',
    base_trick: 'eggbeater', trick_family: 'legover', category: 'compound',
    notation: 'STEPPING EGGBEATER',
    operational_notation: 'CLIP > OP IN [DEX] (plant) > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('stepping-eggbeater', 'stepping', 1)
  `).run();

  // Quantum ecosystem representative
  insertFreestyleTrick(db, {
    slug: 'quantum-mirage', canonical_name: 'quantum mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'QUANTUM MIRAGE',
    operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('quantum-mirage', 'quantum', 1)
  `).run();

  // Ducking ecosystem representative
  insertFreestyleTrick(db, {
    slug: 'ducking-mirage', canonical_name: 'ducking mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'DUCKING MIRAGE',
    operational_notation: 'CLIP > DUCK [BOD] > SAME IN [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('ducking-mirage', 'ducking', 1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/tricks?view=sets — modifier-grouped trick lists (not Set Encyclopedia)', () => {
  it('200s and renders the By Set view shell', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle-active">By modifier<');
  });

  it('intro explains the page answers "which tricks use this set?"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/which tricks use this set or modifier/i);
  });

  it('cross-links to /freestyle/sets for the Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
    expect(res.text).toMatch(/Set Encyclopedia/);
  });

  it('does NOT render Set Encyclopedia set-card markup (set-card-formula / set-card-movement / derived-systems)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).not.toContain('class="set-card-formula"');
    expect(res.text).not.toContain('class="set-card-movement"');
    expect(res.text).not.toContain('class="set-card-relations"');
    expect(res.text).not.toContain('Derived systems:');
  });

  it('renders a section per modifier (set-spinning, set-paradox, set-fairy, set-stepping, etc.)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('id="set-spinning"');
    expect(res.text).toContain('id="set-paradox"');
    expect(res.text).toContain('id="set-fairy"');
    expect(res.text).toContain('id="set-stepping"');
    expect(res.text).toContain('id="set-quantum"');
    expect(res.text).toContain('id="set-ducking"');
  });

  it('renders the two-line dict-trick-row stack per section (2026-05-27 migration)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('class="dict-trick-row-stack"');
    expect(res.text).toMatch(/class="dict-trick-row[ "]/);
    expect(res.text).not.toContain('dict-card-stack');
  });
});

describe('/freestyle/tricks?view=sets — findability of representative ecosystem tricks', () => {
  it('spinning section includes spinning-paradox-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Anchor pattern: the spinning section block ID + the spinning-paradox-mirage slug appearing in card markup.
    expect(res.text).toMatch(/id="set-spinning"[\s\S]+?spinning-paradox-mirage/);
  });

  it('paradox section also includes spinning-paradox-mirage (multi-modifier surfacing)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/id="set-paradox"[\s\S]+?spinning-paradox-mirage/);
  });

  it('fairy section includes fairy-mirage and fairy-butterfly', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    const section = res.text.match(/id="set-fairy"[\s\S]+?(?=<section class="content-section|<\/section>\s*<aside|$)/);
    expect(section).not.toBeNull();
    expect(section![0]).toContain('fairy-mirage');
    expect(section![0]).toContain('fairy-butterfly');
  });

  it('stepping section includes stepping-eggbeater', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/id="set-stepping"[\s\S]+?stepping-eggbeater/);
  });

  it('quantum section includes quantum-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/id="set-quantum"[\s\S]+?quantum-mirage/);
  });

  it('ducking section includes ducking-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/id="set-ducking"[\s\S]+?ducking-mirage/);
  });

  it('cluster jump nav surfaces clusters; individual modifier anchors preserved for drill-down', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('class="sets-view-jump"');
    // jump nav links to the higher-level clusters
    expect(res.text).toMatch(/href="#cluster-set-uptime"/);
    expect(res.text).toMatch(/href="#cluster-rotational-body"/);
    expect(res.text).toMatch(/href="#cluster-no-plant-timing"/);
    // individual modifier sections + anchors still exist (drill-down + deep-links)
    expect(res.text).toMatch(/id="set-spinning"/);
    expect(res.text).toMatch(/id="set-fairy"/);
    expect(res.text).toMatch(/id="set-paradox"/);
  });
});

describe('/freestyle/sets — Set Encyclopedia remains separate', () => {
  it('/freestyle/sets renders the dedicated Set Encyclopedia surface', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    // Encyclopedia surface uses set-card-* markup; confirm it is still here.
    // (The encyclopedia template renders set-cards or set-subtype-section — check by template path indirectly.)
    expect(res.text).toMatch(/Set Encyclopedia|set-card|canonical sets/i);
  });

  it('/freestyle/sets does NOT include the By Set browse-view markup', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).not.toContain('class="trick-view-toggle-active">By modifier<');
    expect(res.text).not.toContain('class="sets-view-jump"');
  });
});

describe('/freestyle/tricks?view=sets — card formatting standardization', () => {
  it('uses the two-line row partial output (no raw operational notation outside the line-2 JOB value)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Every bracketed op-notation token (e.g. [DEX]) must sit inside the row's
    // line-2 JOB value (dict-trick-row-job-value) / an op-token span — never
    // as loose body text.
    const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, m.index - 260), m.index);
      expect(before, `bracket token at ${m.index} not inside a JOB value`).toMatch(/dict-trick-row-job-value|op-token/);
    }
  });

  it('rows carry JOB + ADD labels with no green ADD chip (two-line contract)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
    const m = res.text.match(/<article class="dict-trick-row[\s\S]*?data-trick-slug="spinning-paradox-mirage"[\s\S]*?<\/article>/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/class="dict-trick-row-label">JOB</);
    expect(m![0]).toMatch(/class="dict-trick-row-label">ADD</);
  });

  it('section count matches the listed trick count per modifier (data integrity)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Spinning has 1 linked trick in the test fixture (spinning-paradox-mirage).
    expect(res.text).toMatch(/id="set-spinning"[\s\S]+?<span class="section-count">1<\/span>/);
    // Fairy has 2 linked tricks (fairy-mirage, fairy-butterfly).
    expect(res.text).toMatch(/id="set-fairy"[\s\S]+?<span class="section-count">2<\/span>/);
  });
});
