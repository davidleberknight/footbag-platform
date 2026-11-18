/**
 * /freestyle/tricks?view=modifier — the modifier-grouped browse view.
 *
 * Pins the behavior:
 *   1. `?view=modifier` answers "which tricks use this modifier?" one modifier
 *      at a time: every first-class modifier has its own page at
 *      `?view=modifier&modifier=<slug>` with a `modifier-{slug}` section. NOT
 *      the Set Encyclopedia surface.
 *   2. Set Encyclopedia remains separate at `/freestyle/sets` (sets-
 *      encyclopedia.hbs template), and is the canonical set-specific surface.
 *   3. The launch sets (fairy / stepping / quantum / pixie ...) get no page
 *      here: their tricks browse at `?view=set`. Body and timing modifiers
 *      (spinning / paradox / ducking ...) do, and a modifier outside the
 *      first-class roster gets none.
 *   4. `spinning-paradox-mirage` reaches both the spinning and paradox
 *      pages.
 *   5. No raw operational notation leaks outside the dictionary-trick-card
 *      partial's standardized JOB block.
 *   6. `?view=sets` is not a supported view value: it falls through to the
 *      default ADD view, with no alias and no redirect, and no rendered page
 *      links to it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedSets } from '../fixtures/stagedSets';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3415');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedSets(db);

  // ── Modifier registrations ────────────────────────────────────────
  // Mirror the production registry surface so the modifier-link grouping
  // has something to bucket against.
  insertFreestyleTrickModifier(db, { slug: 'paradox',  modifier_type: 'body', notes: 'Cross-body hip-pivot during dex.' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_type: 'body', notes: 'Back-spin entry.' });
  insertFreestyleTrickModifier(db, { slug: 'ducking',  modifier_type: 'body', notes: 'Ducking dip during dex.' });
  insertFreestyleTrickModifier(db, { slug: 'fairy',    modifier_type: 'set',  notes: 'Fairy entry chassis.' });
  insertFreestyleTrickModifier(db, { slug: 'stepping', modifier_type: 'set',  notes: 'Stepping leading-dex chassis.' });
  insertFreestyleTrickModifier(db, { slug: 'quantum',  modifier_type: 'set',  notes: 'Quantum entry chassis.' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_type: 'set',  notes: 'Pixie entry chassis.' });

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
  insertFreestyleTrickModifierLink(db, 'spinning-paradox-mirage', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'spinning-paradox-mirage', 'paradox', 2);

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
  insertFreestyleTrickModifierLink(db, 'fairy-mirage', 'fairy', 1);
  insertFreestyleTrickModifierLink(db, 'fairy-butterfly', 'fairy', 1);

  // Stepping ecosystem representative
  insertFreestyleTrick(db, {
    slug: 'stepping-eggbeater', canonical_name: 'stepping eggbeater', adds: '4',
    base_trick: 'eggbeater', trick_family: 'legover', category: 'compound',
    notation: 'STEPPING EGGBEATER',
    operational_notation: 'CLIP > OP IN [DEX] (plant) > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'stepping-eggbeater', 'stepping', 1);

  // Quantum ecosystem representative
  insertFreestyleTrick(db, {
    slug: 'quantum-mirage', canonical_name: 'quantum mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    notation: 'QUANTUM MIRAGE',
    operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'quantum-mirage', 'quantum', 1);

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
  insertFreestyleTrickModifierLink(db, 'ducking-mirage', 'ducking', 1);
  insertFreestyleTrickModifierLink(db, 'ducking-legover', 'ducking', 1);
  insertFreestyleTrickModifierLink(db, 'ducking-butterfly', 'ducking', 1);

  // Outside the first-class roster: whirling (a body modifier, not a set, so it
  // has no Set Encyclopedia page) and backside (documented by no reference
  // surface). Both render only in the Other tracked groups band.
  insertFreestyleTrickModifier(db, { slug: 'whirling', modifier_type: 'body', notes: 'Intermediate whirl carried mid-chain.' });
  insertFreestyleTrickModifier(db, { slug: 'backside', modifier_type: 'body', notes: 'Behind-the-body execution qualifier.' });
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
  insertFreestyleTrickModifierLink(db, 'whirling-osis', 'whirling', 1);
  insertFreestyleTrickModifierLink(db, 'backside-mirage', 'backside', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/tricks?view=modifier — modifier-grouped trick lists (not Set Encyclopedia)', () => {
  it('200s and renders the By modifier view shell', async () => {
    const res = await page('/freestyle/tricks?view=modifier');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle-active">By modifier<');
  });

  it('does NOT render Set Encyclopedia set-card markup (set-card-formula / set-card-movement / derived-systems)', async () => {
    const res = await page('/freestyle/tricks?view=modifier');
    expect(res.text).not.toContain('class="set-card-formula"');
    expect(res.text).not.toContain('class="set-card-movement"');
    expect(res.text).not.toContain('class="set-card-relations"');
    expect(res.text).not.toContain('Derived systems:');
  });

  // Defect caught: a first-class modifier loses its page, or its heading
  // stops linking to its own address.
  // The heading's reference link is covered where the operators reference is
  // seeded; this fixture seeds none, so each heading is the plain label.
  it('gives each first-class modifier its own page, headed by its name', async () => {
    for (const [slug, label] of [['spinning', 'Spinning'], ['paradox', 'Paradox'], ['ducking', 'Ducking']]) {
      const res = await page(`/freestyle/tricks?view=modifier&modifier=${slug}`);
      expect(res.status, `${slug} page`).toBe(200);
      expect(res.text).toContain(`<section class="content-section trick-modifier-group" id="modifier-${slug}"`);
      expect(res.text, slug).toContain(`<h2>${label}</h2>`);
    }
  });

  it('renders the two-line dict-trick-row stack per section', async () => {
    const res = await page('/freestyle/tricks?view=modifier');
    expect(res.text).toContain('class="dict-trick-row-stack"');
    expect(res.text).toMatch(/class="dict-trick-row[ "]/);
    expect(res.text).not.toContain('dict-card-stack');
  });
});

describe('/freestyle/tricks?view=modifier — findability of representative ecosystem tricks', () => {
  // The one modifier section a page renders, from its anchor to its close.
  async function modifierSection(slug: string): Promise<string> {
    const res = await page(`/freestyle/tricks?view=modifier&modifier=${slug}`);
    expect(res.status, `${slug} page`).toBe(200);
    const section = res.text.match(new RegExp(`id="modifier-${slug}"[\\s\\S]*?</section>`));
    expect(section, `modifier-${slug} section renders`).not.toBeNull();
    return section![0];
  }

  it('the spinning page includes spinning-paradox-mirage', async () => {
    expect(await modifierSection('spinning')).toContain('data-trick-slug="spinning-paradox-mirage"');
  });

  it('the paradox page also includes spinning-paradox-mirage (multi-modifier surfacing)', async () => {
    expect(await modifierSection('paradox')).toContain('data-trick-slug="spinning-paradox-mirage"');
  });

  it('the ducking page includes ducking-mirage', async () => {
    expect(await modifierSection('ducking')).toContain('data-trick-slug="ducking-mirage"');
  });

  // Defect caught: rows group by family (butterfly, legover, mirage) instead
  // of ADD ascending then name.
  it('rows within a modifier order by ADD ascending, then alphabetically', async () => {
    const section = await modifierSection('ducking');
    const order = ['ducking-legover', 'ducking-mirage', 'ducking-butterfly']
      .map(slug => section.indexOf(`data-trick-slug="${slug}"`));
    expect(order.every(i => i > -1), 'all three ducking tricks render').toBe(true);
    // ordering-is-the-contract: ADD ascending, then name.
    expect([...order].sort((a, b) => a - b), 'ADD ascending then alphabetical').toEqual(order);
  });

  // Defect caught: a launch set gets a page in the modifier view as well as
  // the set view, or its tricks go missing from the set view.
  it('the launch sets get no page here: their tricks browse at ?view=set', async () => {
    const res = await page('/freestyle/tricks?view=modifier');
    for (const slug of ['fairy', 'stepping', 'quantum', 'pixie']) {
      const own = await page(`/freestyle/tricks?view=modifier&modifier=${slug}`);
      expect(own.status, `no modifier page for ${slug}`).toBe(404);
      expect(res.text, `no modifier chip for ${slug}`).not.toContain(`modifier=${slug}"`);
    }
    const setPages: Array<[string, string[]]> = [
      ['fairy', ['fairy-mirage', 'fairy-butterfly']],
      ['stepping', ['stepping-eggbeater']],
      ['quantum', ['quantum-mirage']],
    ];
    for (const [set, tricks] of setPages) {
      const setView = await page(`/freestyle/tricks?view=set&set=${set}`);
      expect(setView.status, `${set} set page`).toBe(200);
      for (const trick of tricks) {
        expect(setView.text, `${trick} listed on the ${set} set page`).toContain(`data-trick-slug="${trick}"`);
      }
    }
  });

  // Defect caught: a chip carries a count, a first-class modifier is missing
  // from the chip row, or a launch set or off-roster group gains a chip.
  it('the modifier chips list every first-class modifier by name alone, paradox included', async () => {
    const res = await page('/freestyle/tricks?view=modifier');
    const nav = res.text.match(/<nav class="jump-bar jump-bar--wide" aria-label="Browse by modifier">([\s\S]*?)<\/nav>/)?.[1];
    expect(nav, 'modifier chip row renders').toBeDefined();
    // The page opens on the first modifier in browse order, spinning, as the
    // current chip; the others link to their own pages.
    expect(nav).toMatch(/<span aria-current="page"[^>]*>Spinning<\/span>/);
    expect(nav).toContain('<a href="/freestyle/tricks?view=modifier&amp;modifier=paradox">Paradox</a>');
    expect(nav).toContain('<a href="/freestyle/tricks?view=modifier&amp;modifier=ducking">Ducking</a>');
    expect(nav).not.toContain('modifier=fairy"');
    expect(nav).not.toContain('modifier=whirling"');
  });

  // Defect caught: a modifier outside the first-class roster gains a page of
  // its own, listing its tricks as if it were a first-class browse group.
  it('a group outside the first-class roster gets no page', async () => {
    for (const slug of ['whirling', 'backside']) {
      const own = await page(`/freestyle/tricks?view=modifier&modifier=${slug}`);
      expect(own.status, `no modifier page for ${slug}`).toBe(404);
    }
    const res = await page('/freestyle/tricks?view=modifier');
    expect(res.text).not.toContain('data-trick-slug="whirling-osis"');
    expect(res.text).not.toContain('data-trick-slug="backside-mirage"');
  });
});

describe('/freestyle/sets — Set Encyclopedia remains separate', () => {
  it('/freestyle/sets renders the dedicated Set Encyclopedia surface', async () => {
    const res = await page('/freestyle/sets');
    expect(res.status).toBe(200);
    // Encyclopedia surface uses set-card-* markup; confirm it is still here.
    // (The encyclopedia template renders set-cards or set-subtype-section — check by template path indirectly.)
    expect(res.text).toMatch(/Set Encyclopedia|set-card|canonical sets/i);
  });

  it('/freestyle/sets does NOT include the By modifier browse-view markup', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).not.toContain('class="trick-view-toggle-active">By modifier<');
    expect(res.text).not.toContain('aria-label="Browse by modifier"');
  });
});

describe('/freestyle/tricks?view=modifier — card formatting standardization', () => {
  it('uses the two-line row partial output (no raw operational notation outside the line-2 JOB value)', async () => {
    const res = await page('/freestyle/tricks?view=modifier');
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
    const res = await page('/freestyle/tricks?view=modifier&modifier=spinning');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
    const m = res.text.match(/<article class="dict-trick-row[\s\S]*?data-trick-slug="spinning-paradox-mirage"[\s\S]*?<\/article>/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/class="dict-trick-row-notation-value"/);
    expect(m![0]).toMatch(/class="dict-trick-row-add">\(\d+\)</);
  });

  // Defect caught: a modifier's count disagrees with the tricks linked to it.
  it('each modifier page carries its own trick count', async () => {
    for (const [slug, count] of [['spinning', 1], ['ducking', 3]] as const) {
      const res = await page(`/freestyle/tricks?view=modifier&modifier=${slug}`);
      expect(res.text, `${slug} count`)
        .toMatch(new RegExp(`id="modifier-${slug}"[\\s\\S]{0,300}<span class="section-count">${count}</span>`));
    }
  });
});

describe('?view=sets is not a supported browse value', () => {
  it('falls through to the default ADD view rather than redirecting or aliasing', async () => {
    const res = await page('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle-active">By ADD<');
    expect(res.text).not.toContain('class="trick-view-toggle-active">By modifier<');
    expect(res.text).not.toContain('aria-label="Browse by modifier"');
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
  it('a set detail page links up to the Set Encyclopedia, and never names a Set Hub', async () => {
    const res = await page('/freestyle/sets/pixie');
    const breadcrumb = /<nav class="breadcrumb"[\s\S]*?<\/nav>/.exec(res.text)?.[0] ?? '';
    expect(breadcrumb).toMatch(/<a href="\/freestyle\/sets">/);
    expect(res.text).not.toMatch(/Set Hub/);
  });
});
