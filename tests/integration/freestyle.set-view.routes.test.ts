/**
 * /freestyle/tricks?view=set — the first-class "By set" browse view.
 *
 * Pins the behavior:
 *   1. `?view=set` renders per-set sections for the set / uptime systems only
 *      (pixie, fairy, stepping, atomic, quantum, nuclear, sailing), each
 *      answering "which tricks begin with this set?".
 *   2. Body and timing operators (paradox, spinning, ducking, symposium)
 *      never render a section here; they stay in `?view=modifier`.
 *   3. Sections follow the set-uptime cluster's declared order, carry a
 *      `set-{slug}` anchor with a self-anchored heading link and a count,
 *      and render the shared two-line row contract (dict-trick-row-stack).
 *   4. Sets with no linked tricks render no section.
 *   5. The nav marks "By set" active, distinct from "By modifier".
 *   6. The Set Encyclopedia at /freestyle/sets stays a separate surface; the
 *      view links to it for set definitions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3527');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'stepping', modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'quantum',  modifier_type: 'set' });
  // A set registered with no linked tricks: must render no section.
  insertFreestyleTrickModifier(db, { slug: 'fairy',    modifier_type: 'set' });
  // A body operator: must never render a section on the set view.
  insertFreestyleTrickModifier(db, { slug: 'paradox',  modifier_type: 'body' });

  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pixie_mirage', canonical_name: 'pixie mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'PIXIE MIRAGE', operational_notation: 'TOE > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'stepping_mirage', canonical_name: 'stepping mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'STEPPING MIRAGE', operational_notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'quantum_mirage', canonical_name: 'quantum mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'QUANTUM MIRAGE', operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_mirage', canonical_name: 'paradox mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'PARADOX MIRAGE', operational_notation: 'SET > OP IN [DEX] [PDX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // Three more pixie tricks whose families and ADDs discriminate the row
  // order: family-first would yield butterfly(4), legover(2), mirage(3),
  // whirl(4); the contract is ADD ascending then alphabetical, so
  // legover(2), mirage(3), butterfly(4), whirl(4).
  insertFreestyleTrick(db, {
    slug: 'pixie_legover', canonical_name: 'pixie legover', adds: '2',
    base_trick: 'legover', trick_family: 'legover', category: 'compound',
    notation: 'PIXIE LEGOVER', operational_notation: 'TOE > SAME IN [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pixie_butterfly', canonical_name: 'pixie butterfly', adds: '4',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    notation: 'PIXIE BUTTERFLY', operational_notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pixie_whirl', canonical_name: 'pixie whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    notation: 'PIXIE WHIRL', operational_notation: 'TOE > SAME IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'pixie_mirage', 'pixie');
  insertFreestyleTrickModifierLink(db, 'pixie_legover', 'pixie');
  insertFreestyleTrickModifierLink(db, 'pixie_butterfly', 'pixie');
  insertFreestyleTrickModifierLink(db, 'pixie_whirl', 'pixie');
  insertFreestyleTrickModifierLink(db, 'stepping_mirage', 'stepping');
  insertFreestyleTrickModifierLink(db, 'quantum_mirage', 'quantum');
  insertFreestyleTrickModifierLink(db, 'paradox_mirage', 'paradox');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/tricks?view=set');
  expect(res.status).toBe(200);
  return res.text;
}

describe('GET /freestyle/tricks?view=set', () => {
  it('marks "By set" active in the view toggle, distinct from "By modifier"', async () => {
    const html = await page();
    expect(html).toMatch(/class="trick-view-toggle-active">By set</);
    expect(html).not.toMatch(/class="trick-view-toggle-active">By modifier</);
  });

  it('renders one section per linked set, in cluster order, with anchor, self-link, and count', async () => {
    const html = await page();
    for (const [slug, label] of [['pixie', 'Pixie'], ['stepping', 'Stepping'], ['quantum', 'Quantum']] as const) {
      expect(html).toContain(`id="set-${slug}"`);
      expect(html).toContain(`href="/freestyle/tricks?view=set#set-${slug}">${label}</a>`);
    }
    // Cluster order: pixie before stepping before quantum (declared order,
    // not alphabetical, which would put quantum before stepping).
    const pixieAt = html.indexOf('id="set-pixie"');
    const steppingAt = html.indexOf('id="set-stepping"');
    const quantumAt = html.indexOf('id="set-quantum"');
    expect(pixieAt).toBeGreaterThan(0);
    expect(steppingAt).toBeGreaterThan(pixieAt);
    expect(quantumAt).toBeGreaterThan(steppingAt);
  });

  it('renders the shared row contract with each set trick in its section', async () => {
    const html = await page();
    expect(html).toContain('dict-trick-row-stack');
    expect(html).not.toContain('dict-card-stack');
    for (const name of ['pixie mirage', 'stepping mirage', 'quantum mirage']) {
      expect(html).toContain(name);
    }
  });

  it('renders no section for a body operator or an unlinked set', async () => {
    const html = await page();
    expect(html).not.toContain('id="set-paradox"');
    expect(html).not.toContain('id="set-fairy"');
  });

  it('links the Set Encyclopedia as the set-definition reference', async () => {
    const html = await page();
    expect(html).toMatch(/browse-view-intro[^<]*<\/p>|browse-view-intro/);
    expect(html).toContain('href="/freestyle/sets"');
  });

  it('renders the collapsed "Why these set groups?" disclosure with the encyclopedia link, and the family view its parallel', async () => {
    const html = await page();
    const details = html.match(/<details class="browse-view-why">[\s\S]*?<\/details>/);
    expect(details, 'set-view rationale disclosure present').not.toBeNull();
    expect(details![0]).not.toContain('<details class="browse-view-why" open');
    expect(details![0]).toContain('Why these set groups?');
    expect(details![0]).toContain('href="/freestyle/sets"');
    expect(details![0]).toMatch(/count alone/);

    const fam = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(fam.status).toBe(200);
    const famDetails = fam.text.match(/<details class="browse-view-why">[\s\S]*?<\/details>/);
    expect(famDetails, 'family-view rationale disclosure present').not.toBeNull();
    expect(famDetails![0]).toContain('Why these family groups?');
    expect(famDetails![0]).toMatch(/Minor Lineages/);
  });

  it('rows within a set order by ADD ascending, then alphabetically, and the intro says so', async () => {
    const html = await page();
    const section = html.match(/id="set-pixie"[\s\S]*?(?=<section class="content-section trick-set-group"|<\/div>\s*<\/section>\s*<section)/);
    expect(section).not.toBeNull();
    const order = ['pixie_legover', 'pixie_mirage', 'pixie_butterfly', 'pixie_whirl']
      .map(slug => section![0].indexOf(`data-trick-slug="${slug}"`));
    expect(order.every(i => i > -1), 'all four pixie tricks render').toBe(true);
    expect([...order].sort((a, b) => a - b), 'ADD ascending then alphabetical').toEqual(order);
    expect(html).toContain('ordered by ADD, then alphabetically');
  });

  it('the scale line total equals the sum of the rendered section counts', async () => {
    const html = await page();
    const scale = html.match(/class="browse-view-scale">(\d+) set groups? · (\d+) trick-row/);
    expect(scale, 'scale line present').not.toBeNull();
    const sections = Array.from(
      html.matchAll(/id="set-[a-z_]+"[\s\S]{0,300}?<span class="section-count">(\d+)<\/span>/g),
      m => Number(m[1]),
    );
    expect(sections.length, 'set sections found').toBe(Number(scale![1]));
    const total = sections.reduce((n, c) => n + c, 0);
    expect(total, 'section counts sum to the scale total').toBe(Number(scale![2]));
  });
});
