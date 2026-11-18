/**
 * /freestyle/tricks?view=set — the first-class "By set" browse view.
 *
 * Pins the behavior:
 *   1. The view shows one set / uptime system at a time; each set with linked
 *      tricks has its own page at `?view=set&set=<slug>`, answering "which
 *      tricks begin with this set?".
 *   2. Body and timing operators (paradox, spinning, ducking, symposium)
 *      never get a page here; they stay in `?view=modifier`.
 *   3. The set chips follow the set-uptime cluster's stored order; each set's
 *      page carries a `set-{slug}` section with a heading linking to its own
 *      address and a count, and renders the shared two-line row contract
 *      (dict-trick-row-stack), rows ordered by ADD then name.
 *   4. A set with no linked tricks gets no page.
 *   5. The nav marks "By set" active, distinct from "By modifier".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

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
const getPage = cachedGet(() => createApp());

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

async function page(set?: string): Promise<string> {
  const res = await getPage(set ? `/freestyle/tricks?view=set&set=${set}` : '/freestyle/tricks?view=set');
  expect(res.status).toBe(200);
  return res.text;
}

// The one set section a page renders, from its anchor to the end of the page.
function setSection(html: string, slug: string): string {
  const at = html.indexOf(`<section class="content-section trick-set-group" id="set-${slug}"`);
  expect(at, `set-${slug} section renders`).toBeGreaterThanOrEqual(0);
  return html.slice(at);
}

describe('GET /freestyle/tricks?view=set', () => {
  it('marks "By set" active in the view toggle, distinct from "By modifier"', async () => {
    const html = await page();
    expect(html).toMatch(/class="trick-view-toggle-active">By set</);
    expect(html).not.toMatch(/class="trick-view-toggle-active">By modifier</);
  });

  // Defect caught: a linked set loses its page, its heading stops linking to
  // its own address, or its count disagrees with the tricks linked to it.
  // The heading's Set Encyclopedia link is covered where the encyclopedia is
  // seeded; this fixture seeds none, so each heading is the plain label.
  it('gives each linked set its own page with anchor, heading, and count', async () => {
    const cases = [['pixie', 'Pixie', 4], ['stepping', 'Stepping', 1], ['quantum', 'Quantum', 1]] as const;
    for (const [slug, label, count] of cases) {
      const section = setSection(await page(slug), slug);
      expect(section, `${slug} heading and count`)
        .toMatch(new RegExp(`<h2>${label}</h2>\\s*<span class="section-count">${count}</span>`));
    }
  });

  // Defect caught: the set chips list the sets alphabetically (quantum before
  // stepping) instead of in the cluster's stored order.
  it('lists the linked sets in cluster order', async () => {
    const html = await page();
    const nav = html.match(/<nav class="jump-bar jump-bar--wide" aria-label="Browse by set">([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const pixieAt = nav.indexOf('>Pixie<');
    const steppingAt = nav.indexOf('set=stepping"');
    const quantumAt = nav.indexOf('set=quantum"');
    expect(pixieAt, 'pixie chip').toBeGreaterThanOrEqual(0);
    // ordering-is-the-contract: chips follow the stored cluster order.
    expect(steppingAt).toBeGreaterThan(pixieAt);
    expect(quantumAt).toBeGreaterThan(steppingAt);
  });

  // Defect caught: a set's page renders a second row system, or drops the
  // set's trick from its own page.
  it('renders the shared row contract with each set trick on its set page', async () => {
    for (const [slug, trick] of [['pixie', 'pixie_mirage'], ['stepping', 'stepping_mirage'], ['quantum', 'quantum_mirage']]) {
      const html = await page(slug);
      expect(html, `${slug} uses the shared row stack`).toContain('dict-trick-row-stack');
      expect(html, `${slug} has no legacy card stack`).not.toContain('dict-card-stack');
      expect(setSection(html, slug), `${slug} lists ${trick}`).toContain(`data-trick-slug="${trick}"`);
    }
  });

  // Defect caught: a body operator, or a set with nothing linked, gets an
  // empty page in the set view.
  it('gives no page to a body operator or an unlinked set', async () => {
    for (const slug of ['paradox', 'fairy']) {
      const res = await getPage(`/freestyle/tricks?view=set&set=${slug}`);
      expect(res.status, `set=${slug}`).toBe(404);
    }
    const html = await page();
    expect(html).not.toContain('set=paradox"');
    expect(html).not.toContain('set=fairy"');
  });

  // Defect caught: rows group by family (butterfly, legover, mirage, whirl)
  // instead of ADD ascending then name.
  it('rows within a set order by ADD ascending, then alphabetically', async () => {
    const section = setSection(await page('pixie'), 'pixie');
    const order = ['pixie_legover', 'pixie_mirage', 'pixie_butterfly', 'pixie_whirl']
      .map(slug => section.indexOf(`data-trick-slug="${slug}"`));
    expect(order.every(i => i > -1), 'all four pixie tricks render').toBe(true);
    // ordering-is-the-contract: ADD ascending, then name.
    expect([...order].sort((a, b) => a - b), 'ADD ascending then alphabetical').toEqual(order);
  });
});
