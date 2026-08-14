/**
 * /freestyle/tricks?view=modifier — the modifier-grouped browse view.
 *
 * Pins the behavior:
 *   1. `?view=modifier` answers "which tricks use this modifier?" — clusters
 *      organize the page, and every modifier is its own subsection with a
 *      `modifier-{slug}` anchor. NOT the Set Encyclopedia surface.
 *   2. Set Encyclopedia remains separate at `/freestyle/sets` (sets-
 *      encyclopedia.hbs template), and is the canonical set-specific surface.
 *   3. The launch sets (fairy / stepping / quantum / pixie ...) do not render
 *      sections here: their tricks browse at `?view=set`. Body and timing
 *      modifiers (spinning / paradox / ducking ...) render here.
 *   4. `spinning-paradox-mirage` reaches both the spinning and paradox
 *      subsections.
 *   5. No raw operational notation leaks outside the dictionary-trick-card
 *      partial's standardized JOB block.
 *   6. `?view=sets` is not a supported view value: it falls through to the
 *      default ADD view, with no alias and no redirect, and no rendered page
 *      links to it.
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
  // Two more ducking tricks whose families and ADDs discriminate the row
  // order inside a subsection: family-first would yield butterfly(4),
  // legover(2), mirage(3); the contract is ADD ascending then alphabetical:
  // legover(2), mirage(3), butterfly(4).
  insertFreestyleTrick(db, {
    slug: 'ducking-legover', canonical_name: 'ducking legover', adds: '2',
    base_trick: 'legover', trick_family: 'legover', category: 'compound',
    notation: 'DUCKING LEGOVER',
    operational_notation: 'SET > DUCK [BOD] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'ducking-butterfly', canonical_name: 'ducking butterfly', adds: '4',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    notation: 'DUCKING BUTTERFLY',
    operational_notation: 'SET > DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('ducking-mirage', 'ducking', 1), ('ducking-legover', 'ducking', 1), ('ducking-butterfly', 'ducking', 1)
  `).run();

  // Outside the first-class roster: whirling (held pending the set-versus-
  // modifier ruling; has a Set Encyclopedia page) and backside (documented by
  // no reference surface). Both render only in the Other tracked groups band.
  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('whirling', 'whirling', 'body', 1, 1, 'Intermediate whirl carried mid-chain.', ?),
      ('backside', 'backside', 'body', 1, 1, 'Behind-the-body execution qualifier.', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');
  insertFreestyleTrick(db, {
    slug: 'whirling-osis', canonical_name: 'whirling osis', adds: '5',
    base_trick: 'osis', trick_family: 'osis', category: 'compound',
    notation: 'WHIRLING OSIS',
    operational_notation: 'SET > OP IN [DEX] > OP CLIP [XBD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'backside-mirage', canonical_name: 'backside mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'BACKSIDE MIRAGE',
    operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES ('whirling-osis', 'whirling', 1), ('backside-mirage', 'backside', 1)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/tricks?view=modifier — modifier-grouped trick lists (not Set Encyclopedia)', () => {
  it('200s and renders the By modifier view shell', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle-active">By modifier<');
  });

  it('intro explains the page answers "which tricks use this modifier?" and points set-seekers at By set', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toMatch(/which tricks use this modifier/i);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view=set"/);
  });

  it('cross-links to /freestyle/sets for the Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
    expect(res.text).toMatch(/Set Encyclopedia/);
  });

  it('does NOT render Set Encyclopedia set-card markup (set-card-formula / set-card-movement / derived-systems)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).not.toContain('class="set-card-formula"');
    expect(res.text).not.toContain('class="set-card-movement"');
    expect(res.text).not.toContain('class="set-card-relations"');
    expect(res.text).not.toContain('Derived systems:');
  });

  it('renders a section per modifier cluster, with no set-uptime cluster (the sets browse at ?view=set)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).not.toContain('id="cluster-set-uptime"');
    expect(res.text).toContain('id="cluster-rotational-body"');
    expect(res.text).toContain('id="cluster-no-plant-timing"');
    expect(res.text).toContain('id="cluster-dexterity-structural"');
  });

  it('renders a per-modifier subsection with a self-anchored heading for each rendered modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    for (const slug of ['spinning', 'paradox', 'ducking']) {
      expect(res.text).toContain(`id="modifier-${slug}"`);
      expect(res.text).toContain(`href="/freestyle/tricks?view=modifier#modifier-${slug}"`);
    }
  });

  it('renders the two-line dict-trick-row stack per section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toContain('class="dict-trick-row-stack"');
    expect(res.text).toMatch(/class="dict-trick-row[ "]/);
    expect(res.text).not.toContain('dict-card-stack');
  });
});

describe('/freestyle/tricks?view=modifier — findability of representative ecosystem tricks', () => {
  it('the spinning subsection includes spinning-paradox-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toMatch(/id="modifier-spinning"[\s\S]+?spinning-paradox-mirage/);
  });

  it('the paradox subsection also includes spinning-paradox-mirage (multi-modifier surfacing)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toMatch(/id="modifier-paradox"[\s\S]+?spinning-paradox-mirage/);
  });

  it('the ducking subsection includes ducking-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toMatch(/id="modifier-ducking"[\s\S]+?ducking-mirage/);
  });

  it('rows within a subsection order by ADD ascending, then alphabetically, and the intro says so', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    const section = res.text.match(/id="modifier-ducking"[\s\S]*?<\/section>/);
    expect(section).not.toBeNull();
    const order = ['ducking-legover', 'ducking-mirage', 'ducking-butterfly']
      .map(slug => section![0].indexOf(`data-trick-slug="${slug}"`));
    expect(order.every(i => i > -1), 'all three ducking tricks render').toBe(true);
    expect([...order].sort((a, b) => a - b), 'ADD ascending then alphabetical').toEqual(order);
    expect(res.text).toContain('ordered by ADD, then alphabetically');
  });

  it('the launch sets render no sections here: their tricks browse at ?view=set', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    for (const slug of ['fairy', 'stepping', 'quantum', 'pixie']) {
      expect(res.text, `no modifier-${slug} subsection`).not.toContain(`id="modifier-${slug}"`);
    }
    for (const trick of ['fairy-mirage', 'fairy-butterfly', 'stepping-eggbeater', 'quantum-mirage']) {
      expect(res.text, `${trick} not listed on the modifier view`).not.toContain(`data-trick-slug="${trick}"`);
    }
    const setView = await request(await createApp()).get('/freestyle/tricks?view=set');
    for (const trick of ['fairy-mirage', 'fairy-butterfly', 'stepping-eggbeater', 'quantum-mirage']) {
      expect(setView.text, `${trick} listed on the set view`).toContain(`data-trick-slug="${trick}"`);
    }
  });

  it('the modifier jump index lists every rendered modifier with its count, paradox included', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toContain('aria-label="Modifier jump"');
    expect(res.text).toMatch(/href="#modifier-spinning">spinning \(\d+\)</);
    expect(res.text).toMatch(/href="#modifier-paradox">paradox \(\d+\)</);
    expect(res.text).toMatch(/href="#modifier-ducking">ducking \(\d+\)</);
    expect(res.text).not.toMatch(/href="#modifier-fairy"/);
    expect(res.text).not.toMatch(/href="#modifier-whirling"/);
  });

  it('a group outside the first-class roster renders in the Other tracked groups band, not as a section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).not.toContain('id="modifier-whirling"');
    expect(res.text).not.toContain('data-trick-slug="whirling-osis"');
    const band = res.text.match(/id="modifier-other-groups"[\s\S]*?<\/section>/);
    expect(band, 'Other tracked groups band present').not.toBeNull();
    // whirling has a Set Encyclopedia page, so its band entry links there;
    // backside has no documenting reference surface, so it renders plain.
    expect(band![0]).toMatch(/<a href="\/freestyle\/sets\/whirling">whirling<\/a>/);
    expect(band![0]).toMatch(/backside/);
    expect(band![0]).not.toMatch(/<a[^>]*>backside<\/a>/);
  });

  it('renders the collapsed "Why these modifier groups?" disclosure linking the Operators & Modifiers reference', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    const details = res.text.match(/<details class="browse-view-why">[\s\S]*?<\/details>/);
    expect(details, 'rationale disclosure present').not.toBeNull();
    expect(details![0]).not.toContain('<details class="browse-view-why" open');
    expect(details![0]).toContain('Why these modifier groups?');
    expect(details![0]).toContain('href="/freestyle/operators"');
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

  it('/freestyle/sets does NOT include the By modifier browse-view markup', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).not.toContain('class="trick-view-toggle-active">By modifier<');
    expect(res.text).not.toContain('aria-label="Modifier jump"');
  });
});

describe('/freestyle/tricks?view=modifier — card formatting standardization', () => {
  it('uses the two-line row partial output (no raw operational notation outside the line-2 JOB value)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    // Every bracketed op-notation token (e.g. [DEX]) must sit inside the row's
    // line-2 JOB value (dict-trick-row-notation-value) / an op-token span — never
    // as loose body text.
    const re = /\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, m.index - 260), m.index);
      expect(before, `bracket token at ${m.index} not inside a JOB value`).toMatch(/dict-trick-row-notation-value|op-token/);
    }
  });

  it('rows carry notation and a difficulty value, with no green ADD chip', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
    const m = res.text.match(/<article class="dict-trick-row[\s\S]*?data-trick-slug="spinning-paradox-mirage"[\s\S]*?<\/article>/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/class="dict-trick-row-notation-value"/);
    expect(m![0]).toMatch(/aria-label="Difficulty value">\(\d+\)</);
  });

  it('cluster and subsection counts render, and the cluster count dedupes across its modifiers', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    // rotational-body holds one distinct trick (spinning-paradox-mirage).
    expect(res.text).toMatch(/id="cluster-rotational-body"[\s\S]+?<span class="section-count">1<\/span>/);
    // The spinning subsection carries its own count chip.
    expect(res.text).toMatch(/id="modifier-spinning"[\s\S]{0,300}<span class="section-count">1<\/span>/);
  });
});

describe('?view=sets is not a supported browse value', () => {
  it('falls through to the default ADD view rather than redirecting or aliasing', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle-active">By ADD<');
    expect(res.text).not.toContain('class="trick-view-toggle-active">By modifier<');
    expect(res.text).not.toContain('aria-label="Modifier jump"');
  });

  it('no rendered page emits a ?view=sets link', async () => {
    // Both spellings: raw in a template literal, and Handlebars-escaped when
    // the href is interpolated from a service-supplied field.
    const app = await createApp();
    const urls = [
      '/freestyle',
      '/freestyle/tricks',
      '/freestyle/tricks?view=modifier',
      '/freestyle/tricks?family=mirage',
      '/freestyle/sets',
      '/freestyle/sets/pixie',
      '/freestyle/about',
      '/freestyle/glossary',
    ];
    for (const url of urls) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.text, `${url} must not link the retired view key`).not.toMatch(/view(?:=|&#x3D;)sets/);
    }
  });
});

describe('the former Set Hub controls land on the Set Encyclopedia', () => {
  it('the about page links the Set Encyclopedia, and never names a Set Hub', async () => {
    const res = await request(await createApp()).get('/freestyle/about');
    expect(res.text).toMatch(/<a href="\/freestyle\/sets" class="action-link">Set Encyclopedia<\/a>/);
    expect(res.text).not.toMatch(/Set Hub/);
  });

  it('a set detail page goes back to the Set Encyclopedia, and never names a Set Hub', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toMatch(/<a href="\/freestyle\/sets">Back to Set Encyclopedia<\/a>/);
    expect(res.text).not.toMatch(/Set Hub/);
  });
});
