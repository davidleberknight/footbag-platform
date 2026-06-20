/**
 * Integration tests for the default trick-dictionary surface at
 * /freestyle/tricks.
 *
 * Phase D (2026-05-22): the prior six-card browse-mode "gate" was
 * removed. /freestyle/tricks now opens directly on the By ADD ladder —
 * real tricks immediately. Advanced browse modes (Family, Movement
 * System, Movement Neighborhoods, Operators, Observed Tricks) are
 * reachable from a secondary view-toggle, not a gate. There is no
 * coverage / governance block and no publication-state stat strip.
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

const { dbPath } = setTestEnv('3120');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Two active tricks at different ADD values + one modifier.
  insertFreestyleTrick(db, {
    slug:           'mirage',
    canonical_name: 'mirage',
    adds:           '2',
    base_trick:     'mirage',
    trick_family:   'mirage',
    category:       'dex',
  });
  insertFreestyleTrick(db, {
    slug:           'whirl',
    canonical_name: 'whirl',
    adds:           '3',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'dex',
  });
  insertFreestyleTrickModifier(db, {
    slug:          'paradox',
    modifier_name: 'paradox',
    add_bonus:     1,
    modifier_type: 'body',
  });
  // A set-uptime modifier linked to an active trick, so the By-modifier
  // landing card surfaces the set-uptime cluster (and its #cluster-set-uptime
  // anchor) rather than rendering empty.
  insertFreestyleTrickModifier(db, {
    slug:          'pixie',
    modifier_name: 'pixie',
    add_bonus:     1,
    modifier_type: 'set',
  });
  insertFreestyleTrickModifierLink(db, 'mirage', 'pixie');

  // A second whirl-family trick so the By-family view renders a real family
  // SECTION (sections need >1 member), which the jump index links to.
  insertFreestyleTrick(db, {
    slug:           'ducking-whirl',
    canonical_name: 'ducking whirl',
    adds:           '4',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'compound',
  });
  // Whirl-family entries that exercise operator-rung ordering: a 1-operator
  // form, an inspinning form (must rank as rung 1, not core), and a repeated-
  // operator form (spinning x2 → rung 2, never collapsed to rung 1).
  insertFreestyleTrickModifier(db, {
    slug: 'spinning', modifier_name: 'spinning', add_bonus: 1, modifier_type: 'body',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'inspinning', modifier_name: 'inspinning', add_bonus: 1, modifier_type: 'body',
  });
  insertFreestyleTrick(db, {
    slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
  });
  insertFreestyleTrick(db, {
    slug: 'inspinning-whirl', canonical_name: 'inspinning whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
  });
  insertFreestyleTrick(db, {
    slug: 'double-spinning-whirl', canonical_name: 'double-spinning whirl', adds: '5',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
  });
  insertFreestyleTrickModifierLink(db, 'spinning-whirl', 'spinning');
  insertFreestyleTrickModifierLink(db, 'inspinning-whirl', 'inspinning');
  insertFreestyleTrickModifierLink(db, 'double-spinning-whirl', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'double-spinning-whirl', 'spinning', 2);
  // Two mirage-family ADD-4 tricks so the ADD-4 bucket spans two lineages
  // (whirl + mirage) and the By-ADD lineage sub-bands render headers.
  insertFreestyleTrick(db, {
    slug: 'ducking-paradox-mirage', canonical_name: 'ducking-paradox mirage', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
  });
  insertFreestyleTrick(db, {
    slug: 'spinning-paradox-mirage', canonical_name: 'spinning-paradox mirage', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks — default By ADD ladder', () => {
  it('returns 200 and opens directly on the ADD browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // The browse-view chain renders immediately — no gate.
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
    // Real tricks shown immediately as dictionary cards.
    expect(res.text).toContain('data-trick-slug=');
  });

  it('does not render the retired browse-mode gate', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).not.toContain('class="landing-card-grid"');
    expect(res.text).not.toContain('class="landing-stat-strip"');
    expect(res.text).not.toContain('class="landing-primer-callout"');
    expect(res.text).not.toContain('data-card-slug=');
  });

  it('opens with the plain movement-first dictionary intro + glossary link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('class="browse-view-intro"');
    // The intro carries a live count of unique documented tricks and the
    // documented aliases separately, plus the first-class subset, in
    // beginner-facing wording (not the internal "canonical").
    expect(res.text).toMatch(/[\d,]+ unique officially documented tricks/);
    expect(res.text).toMatch(/[\d,]+ documented aliases/);
    expect(res.text).toMatch(/\d+ first-class tricks are fully covered/);
    expect(res.text).toContain('class="dictionary-intro-glossary-link"');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });

  it('renders ADD jump-nav chips that link to the in-page ADD section anchors', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('class="add-jump"');
    // Each chip jumps to its ADD section (e.g. <a href="#add-2">2 ADD</a>),
    // the same affordance as the old per-level move list.
    expect(res.text).toMatch(/<a href="#add-\d+">\d+ ADD<\/a>/);
  });

  it('does not render the coverage / governance block', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).not.toContain('class="trick-coverage-summary"');
    expect(res.text).not.toContain('class="dict-note"');
    expect(res.text).not.toContain('shown for transparency');
    // 2026-05-24: the "no lead count" assertion was reversed by the
    // governance/polish slice — dynamic canonical-trick counts now ARE
    // surfaced in the dictionary intro (replacing vague "hundreds of
    // named tricks" prose).
  });

  it('the view-toggle offers every browse system as secondary navigation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const navStart = res.text.indexOf('class="trick-view-toggle"');
    const navEnd = res.text.indexOf('</nav>', navStart);
    expect(navStart).toBeGreaterThan(-1);
    const nav = res.text.slice(navStart, navEnd);
    expect(nav).toContain('By ADD');
    expect(nav).toContain('By family');
    expect(nav).toContain('By movement system');
    expect(nav).toContain('Movement Neighborhoods');
    // 2026-05-24 governance/polish slice: "By set" added as a primary
    // browse axis; "Operators & Modifiers" REMOVED from the toggle row
    // (operators/modifiers are reference vocabulary, not a dictionary
    // grouping axis). The /freestyle/operators reference page is still
    // reachable via the aside line below the toggle.
    expect(nav).toContain('By modifier');
    expect(nav).not.toContain('href="/freestyle/operators"');
    // 2026-05-23: the duplicate Observed Tricks link was removed from
    // the dictionary browse strip. Observed Tricks remains reachable
    // from the freestyle landing's Go Deeper card.
    expect(nav).not.toContain('href="/freestyle/observational"');
    // The retired "‹ Dictionary" back-link is gone.
    expect(nav).not.toContain('trick-view-toggle-back');
  });

  it('Operators & Modifiers reference link is reachable from the landing surface', async () => {
    // DL-1+2+5 2026-05-26: cross-links migrated from the toggle-aside
    // paragraph into landing-grid cards. On the default landing view
    // (?view=add, no family filter), the Operators link lives in the
    // By-movement-system card's crossLink. On secondary views the
    // toggle-aside paragraph is preserved (rendered only when
    // activeView != 'add') for reachability without a return trip.
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('href="/freestyle/operators"');
    // The cross-link sits under the By-movement-system card; verify its
    // proximity to that card's label.
    const movSysIdx = res.text.indexOf('By movement system');
    const operatorsIdx = res.text.indexOf('href="/freestyle/operators"');
    expect(movSysIdx).toBeGreaterThan(0);
    expect(operatorsIdx).toBeGreaterThan(movSysIdx);
  });

  it('groups tricks by ADD value, with the gentlest first', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // Scope the order check to the ADD ladder (below the view-toggle); the
    // beginner bridge above it legitimately mentions higher ADD values first.
    const ladder = res.text.indexOf('class="trick-view-toggle"');
    const twoIdx   = res.text.indexOf('2 ADD', ladder);
    const threeIdx = res.text.indexOf('3 ADD', ladder);
    expect(twoIdx).toBeGreaterThan(-1);
    expect(threeIdx).toBeGreaterThan(twoIdx);
    expect(res.text).toContain('data-trick-slug="mirage"');
    expect(res.text).toContain('data-trick-slug="whirl"');
  });
});

describe('GET /freestyle/tricks — landing-grid count labels are self-explanatory', () => {
  // Each portal-card count badge must show a VISIBLE noun (what the number
  // counts), not only an aria-label. The number sits in a
  // .dict-landing-card-count-num span; the noun follows as visible text.
  const NOUNS = ['ADD buckets', 'dex buckets', 'families', 'modifier groups', 'axes + surfaces', 'neighborhoods', 'unconfirmed names'];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

  it('every portal-card badge renders a visible noun label after the number', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    for (const noun of NOUNS) {
      const pat = new RegExp(`<span class="dict-landing-card-count-num">[\\d,]+</span> ${esc(noun)}</span>`);
      expect(res.text, `visible "${noun}" badge`).toMatch(pat);
    }
  });

  it('badge aria-labels carry the same "<count> <noun>" text', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    for (const noun of NOUNS) {
      expect(res.text, `aria "${noun}"`).toMatch(new RegExp(`aria-label="[\\d,]+ ${esc(noun)}"`));
    }
  });

  // NB: Handlebars escapes '=' in attribute output to '&#x3D;', so href patterns
  // use a tolerant '[^"]*' across the query-string separator.
  it('portal-card chips are jump-links into subsections, with derived hit counts', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // Chips render as anchor links (not plain spans) into per-bucket anchors.
    expect(res.text).toMatch(/<a class="dict-landing-card-chip" href="\/freestyle\/tricks\?view[^"]*add#add-\d+"/);
    expect(res.text).toMatch(/<a class="dict-landing-card-chip" href="\/freestyle\/tricks\?view[^"]*dex-count#dex-/);
    // Derived counts surface in a count span.
    expect(res.text).toContain('dict-landing-card-chip-count');
  });

  it('By family lists the first-class Family Parents as ?family= jump-links', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // First-class Family Parents only (current editorial standard); minor
    // lineages live in their own band inside the By-family view.
    expect(res.text).toMatch(/<span class="dict-landing-card-count-num">16<\/span> families/);
    for (const slug of ['mirage', 'osis', 'drifter']) {
      expect(res.text, `family link ${slug}`).toMatch(new RegExp(`href="/freestyle/tricks\\?family[^"]*${slug}"`));
    }
    // eclipse is a minor lineage, not a first-class landing-card chip.
    expect(res.text).not.toMatch(/href="\/freestyle\/tricks\?family[^"]*eclipse"/);
  });

  it('By family view renders a jump index linking to in-page family-section anchors', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('class="family-jump"');
    expect(res.text).toContain('Root families:');
    // whirl has >1 member in the seed, so its family section + jump chip render;
    // the chip targets the in-page anchor, not the ?family= detail page.
    expect(res.text).toMatch(/href="#family-whirl"/);
    expect(res.text).toContain('class="family-jump-count"');
  });

  it('orders family entries by operator rung: anchor, then 1-operator, then 2-operator', async () => {
    const html = (await request(createApp()).get('/freestyle/tricks?view=family')).text;
    const at = (slug: string) => html.indexOf(`data-trick-slug="${slug}"`);
    const iWhirl  = at('whirl');           // anchor, rung 0
    const iSpin   = at('spinning-whirl');  // rung 1
    const iInspin = at('inspinning-whirl');// rung 1 (must NOT rank as core/bare)
    const iDouble = at('double-spinning-whirl'); // rung 2 (spinning x2, not collapsed)
    expect(iWhirl).toBeGreaterThan(-1);
    expect(iSpin).toBeGreaterThan(iWhirl);    // anchor before 1-operator forms
    expect(iInspin).toBeGreaterThan(iWhirl);  // inspinning is rung 1, after the anchor/core band
    expect(iDouble).toBeGreaterThan(iSpin);   // repeated-operator form is rung 2, after rung 1
    expect(iDouble).toBeGreaterThan(iInspin);
  });

  it('renders operator-rung band headers when a family spans multiple rungs', async () => {
    const html = (await request(createApp()).get('/freestyle/tricks?view=family')).text;
    expect(html).toContain('class="family-rung-header"');
    expect(html).toContain('2 operators');
  });

  it('By dex-count view renders an in-view jump nav into dex-bucket anchors', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toContain('aria-label="Jump to dex bucket"');
    expect(res.text).toMatch(/href="#dex-/);
  });

  it('By ADD groups each bucket into lineage sub-bands with headers', async () => {
    const html = (await request(createApp()).get('/freestyle/tricks')).text; // default = By ADD
    // By-family is the default ADD-view mode: each tier sub-groups into
    // nearest-anchor family bands with a plain family-name header (no
    // "-derived" suffix, and no surface/root bands).
    expect(html).toContain('class="add-lineage-header"');
    expect(html).toContain('add-lineage-header">Whirl');
    expect(html).toContain('add-lineage-header">Mirage');
    // the mirage ADD-4 tricks sit in the Mirage band of the ADD-4 bucket
    expect(html).toContain('data-trick-slug="ducking-paradox-mirage"');
  });

  it('By dex-count sorts entries structurally (ADD ascending) within a bucket', async () => {
    const html = (await request(createApp()).get('/freestyle/tricks?view=dex-count')).text;
    const at = (slug: string) => html.indexOf(`data-trick-slug="${slug}"`);
    // Seed tricks have no JOB and no operational notation -> all in the
    // dex-no-notation bucket, ordered by ADD asc: mirage(2) before whirl(3)
    // before double-spinning-whirl(5).
    expect(at('mirage')).toBeGreaterThan(-1);
    expect(at('whirl')).toBeGreaterThan(at('mirage'));
    expect(at('double-spinning-whirl')).toBeGreaterThan(at('whirl'));
  });

  it('By modifier groups into clusters linking to ?view=sets cluster anchors', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toMatch(/<span class="dict-landing-card-count-num">\d+<\/span> modifier groups/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view[^"]*sets#cluster-set-uptime"/);
    // The broad, non-entry lens copy.
    expect(res.text).toMatch(/Which named moves, sets, or twists does it use\?/);
  });

  it('large counts are thousands-separated in the visible badge (Emerging vocabulary)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // The intake-queue total is well above 999, so the unconfirmed-names badge
    // must render a comma-grouped number in the visible label.
    expect(res.text).toMatch(/<span class="dict-landing-card-count-num">\d{1,3}(?:,\d{3})+<\/span> unconfirmed names<\/span>/);
  });

  it('no portal-card badge renders a bare number with no noun (old behavior)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // The old badge was `<span class="dict-landing-card-count" ...>91</span>`
    // (number only). That form must no longer appear.
    expect(res.text).not.toMatch(/<span class="dict-landing-card-count"[^>]*>\d[\d,]*<\/span>/);
  });
});

describe('GET /freestyle/tricks — beginner orientation bridge', () => {
  it('renders the orientation bridge on the default landing view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('class="dict-onboarding"');
    expect(res.text).toContain('New to freestyle? Start here.');
    // High-level ADD definition in plain words.
    expect(res.text).toMatch(/ADD \(added difficulty\)/);
    // The single-base build-up example, in order.
    const whirl   = res.text.indexOf('<strong>Whirl</strong>');
    const spin     = res.text.indexOf('<strong>Spinning Whirl</strong>');
    const paradox = res.text.indexOf('<strong>Spinning Paradox Whirl</strong>');
    expect(whirl).toBeGreaterThan(-1);
    expect(spin).toBeGreaterThan(whirl);
    expect(paradox).toBeGreaterThan(spin);
    // The three exploration lenses in beginner wording.
    expect(res.text).toContain('By difficulty (ADD)');
    expect(res.text).toContain('grouped by the base move');
    expect(res.text).toContain('grouped by the layers added');
  });

  it('defines the four entry terms (ADD / Dex / Family / Modifier) in plain words', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const start = res.text.indexOf('class="dict-onboarding-defs"');
    expect(start).toBeGreaterThan(-1);
    const defs = res.text.slice(start, start + 900);
    for (const term of ['ADD', 'Dex', 'Family', 'Modifier']) {
      expect(defs, `term ${term}`).toContain(`<dt>${term}</dt>`);
    }
    // Plain-language glosses, not insider phrasing.
    expect(defs).toContain('how hard a trick is');
    expect(defs).toContain('circle a leg around the bag');
    expect(defs).toContain('built on the same base move');
    expect(defs).toContain('a twist you add to a base move');
  });

  it('the bridge links into the glossary primer sections', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const start = res.text.indexOf('class="dict-onboarding-links"');
    expect(start).toBeGreaterThan(-1);
    const links = res.text.slice(start, start + 700);
    expect(links).toContain('href="/freestyle/glossary#section-add-accounting"');
    expect(links).toContain('What is an ADD?');
    expect(links).toContain('#section-notation');
    expect(links).toContain('#section-reading-the-dictionary');
    expect(links).toContain('#section-core-concepts');
  });

  it('does not render the bridge on secondary or filtered views', async () => {
    const family = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(family.text).not.toContain('class="dict-onboarding"');
    const filtered = await request(createApp()).get('/freestyle/tricks?family=whirl');
    expect(filtered.text).not.toContain('class="dict-onboarding"');
  });

  it('softens internal ontology terms to beginner entry vocabulary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // "topology" -> "movement pattern" on the By-family lens question.
    expect(res.text).toContain('What core movement pattern does the trick build on?');
    expect(res.text).not.toContain('What core movement topology does the trick inherit from?');
  });
});

describe('GET /freestyle/tricks — browse views', () => {
  it('?view=add renders the same ADD ladder', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });

  it('?view=family renders the family browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By family</);
  });

  it('?family= renders the family-filtered view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toContain('family-filter-pill');
  });

  it('an unknown ?view= falls back to the ADD ladder', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=nonsense');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });
});
