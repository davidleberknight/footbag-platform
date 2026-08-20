/**
 * Integration tests for the default trick-dictionary surface at
 * /freestyle/tricks.
 *
 * /freestyle/tricks opens directly on the By ADD ladder, showing real
 * tricks immediately rather than a browse-mode gate. Advanced browse
 * modes (Family, Movement System, Movement Neighborhoods, Operators,
 * Observed Tricks) are reachable from a secondary view-toggle. There is
 * no coverage / governance block and no publication-state stat strip.
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

  // Two active tricks at different ADD values + one modifier. Both carry
  // operational notation so the dex-count view (which renders only
  // dex-countable tricks) has real buckets to group and jump into.
  insertFreestyleTrick(db, {
    slug:           'mirage',
    canonical_name: 'mirage',
    adds:           '2',
    base_trick:     'mirage',
    trick_family:   'mirage',
    category:       'dex',
    operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
  });
  insertFreestyleTrick(db, {
    slug:           'whirl',
    canonical_name: 'whirl',
    adds:           '3',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'dex',
    operational_notation: 'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
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
    operational_notation: 'CLIP > SPIN [BOD] > SPIN [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',
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

  it('drops the generic intro and shows the corpus counts in beginner-facing wording', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // The generic "dictionary of named..." intro is dropped; the onboarding block
    // leads the landing instead (its lead position is covered separately).
    expect(res.text).not.toContain('dictionary of named freestyle footbag tricks');
    // The corpus counts read in beginner-facing wording (not the internal "canonical").
    expect(res.text).toContain('come with a full page');
    expect(res.text).toMatch(/spans [\d,]+ names/);
    expect(res.text).toMatch(/[\d,]+ aliases and alternate names/);
    expect(res.text).toContain('Emerging Vocabulary');
  });

  it('renders ADD navigation chips that link to the canonical per-tier URLs', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('aria-label="Browse by ADD level"');
    // Each chip navigates to its tier's canonical URL
    // (e.g. <a href="/freestyle/tricks/2">2 ADD</a>), so a bucket click
    // survives reload and the back/forward buttons.
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/\d+">\d+ ADD<\/a>/);
  });

  it('does not render the coverage / governance block', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).not.toContain('class="trick-coverage-summary"');
    expect(res.text).not.toContain('class="dict-note"');
    expect(res.text).not.toContain('shown for transparency');
    // Dropping the governance block does not mean dropping counts: the
    // dictionary intro deliberately carries dynamic canonical-trick
    // counts rather than vague "hundreds of named tricks" prose, so no
    // assertion here forbids a lead count.
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
    // "Operators & Modifiers" stays out of the toggle row: operators and
    // modifiers are reference vocabulary, not a dictionary grouping axis.
    // The /freestyle/operators reference page is reachable from the aside
    // line below the toggle instead.
    expect(nav).toContain('By modifier');
    expect(nav).not.toContain('href="/freestyle/operators"');
    // Observed Tricks is not duplicated into the dictionary browse strip;
    // it is reachable from the freestyle landing's Go Deeper card.
    expect(nav).not.toContain('href="/freestyle/observational"');
    // No "‹ Dictionary" back-link in the toggle row.
    expect(nav).not.toContain('trick-view-toggle-back');
  });

  it('Operators & Modifiers reference link is reachable from the landing surface', async () => {
    // Cross-links live in the landing-grid cards: on the default landing
    // view (?view=add, no family filter) the Operators link is the
    // By-movement-system card's crossLink. Secondary views keep the
    // toggle-aside paragraph (rendered only when activeView != 'add') so
    // the link stays reachable without a return trip.
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

describe('GET /freestyle/tricks — browse axes and their explanations', () => {
  it('By family view renders a jump index linking to in-page family-section anchors', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('aria-label="Jump to family"');
    expect(res.text).toContain('Root families:');
    // whirl has >1 member in the seed, so its family section + jump chip render;
    // the chip targets the in-page anchor, not the ?family= detail page.
    expect(res.text).toMatch(/href="#family-whirl"/);
    expect(res.text).toContain('class="jump-bar-count"');
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
    const html = (await request(createApp()).get('/freestyle/tricks?sort=family')).text;
    // The By-family ADD-view mode (?sort=family) sub-groups each tier into
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
    // The three notated seeds share the 1-dex bucket, ordered by ADD asc:
    // mirage(2) before whirl(3) before double-spinning-whirl(5).
    expect(at('mirage')).toBeGreaterThan(-1);
    expect(at('whirl')).toBeGreaterThan(at('mirage'));
    expect(at('double-spinning-whirl')).toBeGreaterThan(at('whirl'));
  });

  it('each browse axis explains what it is for, without spending a line of layout', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // The lens questions ride as the title of each View entry. A reader cannot
    // guess what "By dex count" or "Movement Neighborhoods" mean from the label
    // alone, so the explanation has to be reachable somewhere.
    for (const q of [
      'How layered is the trick?',
      'What core movement pattern does the trick build on?',
      'Which broad movement style does it belong to?',
      'Tricks that move alike, even across different families.',
      'How many dexterity moves does it have?',
      'Which named moves, sets, or twists does it use?',
    ]) {
      expect(res.text, `lens question: ${q}`).toContain(`title="${q.replace(/\?/g, '?')}"`);
    }
  });

  it('Emerging Vocabulary renders as one forward-looking line: a link plus sentence, no count', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // A single line at the foot of the browse tile: the title links to the
    // observational page and the sentence names the community sources. No
    // count and no review-queue framing on this surface; the observational
    // page itself carries the detail.
    expect(res.text).toContain('class="dict-emerging-line"');
    expect(res.text).toMatch(/<a href="\/freestyle\/observational">Emerging Vocabulary<\/a>: trick names and readings still being confirmed/);
    expect(res.text).toContain('from PassBack, Footbag.org, FootbagMoves, and Stanford.');
    expect(res.text).not.toContain('unconfirmed names');
  });

  it('the browse axes are not duplicated by a parallel card grid', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // The View row is the single home for the six axes. A second grid listing
    // the same six destinations with count badges was redundant with it and
    // with the Jump to row two lines below.
    expect(res.text).not.toContain('dict-landing-grid');
    expect(res.text).not.toContain('dict-landing-card');
    // The two reference surfaces the grid used to cross-link stay reachable.
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).toContain('href="/freestyle/sets"');
  });
});

describe('GET /freestyle/tricks — beginner orientation bridge', () => {
  it('renders the orientation content inside the landing tiles on the default view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('class="dict-tile-grid"');
    // The onboarding heading is retired: the tile titles name the blocks, and
    // this audience is not new to freestyle.
    expect(res.text).not.toContain('New to freestyle? Start here.');
    // High-level ADD definition in plain words.
    expect(res.text).toMatch(/ADD \(added difficulty\)/);
    // The build-up example, in order; each step introduces one concept and
    // raises ADD by exactly one (1 to 4).
    const toe    = res.text.indexOf('<strong>Toe Stall</strong>');
    const lego   = res.text.indexOf('<strong>Legover</strong>');
    const dlo    = res.text.indexOf('<strong>Double Legover</strong>');
    const symDlo = res.text.indexOf('<strong>Symposium Double Legover</strong>');
    expect(toe).toBeGreaterThan(-1);
    expect(lego).toBeGreaterThan(toe);
    expect(dlo).toBeGreaterThan(lego);
    expect(symDlo).toBeGreaterThan(dlo);
    for (const add of ['1 ADD', '2 ADD', '3 ADD', '4 ADD']) {
      expect(res.text).toContain(add);
    }
    // The four exploration lenses in beginner wording; ADD framed as a
    // component count, never as an execution-difficulty ranking.
    expect(res.text).toContain('By ADD');
    expect(res.text).toContain('lowest to highest component count');
    expect(res.text).toContain('grouped by the base move');
    expect(res.text).toContain('grouped by useful launch-set groupings');
    expect(res.text).toContain('grouped by useful body and timing modifiers');
  });

  it('defines the four entry terms (ADD / Dex / Family / Modifier) in plain words', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const start = res.text.indexOf('class="dict-onboarding-defs"');
    expect(start).toBeGreaterThan(-1);
    const defs = res.text.slice(start, start + 900);
    for (const term of ['ADD', 'Dex', 'Family', 'Modifier']) {
      expect(defs, `term ${term}`).toContain(`<dt>${term}</dt>`);
    }
    // Plain-language glosses, not insider phrasing; ADD glossed as a
    // component count rather than a difficulty measure.
    expect(defs).toContain('a count of the trick');
    expect(defs).toContain('your leg circles the bag');
    expect(defs).toContain('built on the same base move');
    expect(defs).toContain('a twist you add to a base move');
  });

  it('the bridge links into the Freestyle Concepts primer sections, the in-page Reading the Dictionary tile, and the glossary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const start = res.text.indexOf('class="dict-onboarding-links"');
    expect(start).toBeGreaterThan(-1);
    const links = res.text.slice(start, start + 800);
    expect(links).toContain('href="/freestyle/concepts#section-add-accounting"');
    expect(links).toContain('What Is an ADD?');
    expect(links).toContain('href="/freestyle/concepts#section-notation"');
    expect(links).toContain('href="/freestyle/tricks#reading-the-dictionary"');
    expect(links).toContain('href="/freestyle/concepts#section-core-concepts"');
    expect(links).toContain('Movement Basics.');
    expect(links).toContain('href="/freestyle/glossary"');
    expect(links).toContain('Look Up a Term in the Glossary.');
    expect(links).not.toContain('Beginner Glossary.');
  });

  it('does not render the orientation tiles on secondary or filtered views (Reading the Dictionary still renders)', async () => {
    const family = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(family.text).not.toContain('aria-label="About the dictionary"');
    expect(family.text).not.toContain('class="dict-onboarding-links"');
    expect(family.text).toContain('id="reading-the-dictionary"');
    const filtered = await request(createApp()).get('/freestyle/tricks?family=whirl');
    expect(filtered.text).not.toContain('aria-label="About the dictionary"');
    expect(filtered.text).not.toContain('class="dict-onboarding-links"');
    expect(filtered.text).toContain('id="reading-the-dictionary"');
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
    expect(res.text).toMatch(/ family: \d+ tricks?\./);
  });

  it('an unknown ?view= falls back to the ADD ladder', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=nonsense');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });
});

describe('GET /freestyle/tricks — one orienting lede per state', () => {
  it('the default landing leads with the actions card, then tiles, then the list', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const searchIdx = res.text.indexOf('search-box-card');
    const tilesIdx = res.text.indexOf('class="dict-tile-grid"');
    const listIdx = res.text.indexOf('data-trick-slug=');
    expect(searchIdx).toBeGreaterThan(-1);
    expect(tilesIdx).toBeGreaterThan(searchIdx);
    expect(listIdx).toBeGreaterThan(tilesIdx);
    // The generic "pick a lens" intro stays dropped.
    expect(res.text).not.toContain('Pick a lens below to start');
  });

  it('the corpus-count line renders inside the tile row, ahead of the browse controls', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const tilesIdx = res.text.indexOf('class="dict-tile-grid"');
    const countIdx = res.text.indexOf('class="browse-view-scale"');
    const navIdx = res.text.indexOf('class="card dict-nav-card"');
    expect(countIdx).toBeGreaterThan(tilesIdx);
    expect(countIdx).toBeLessThan(navIdx);
  });

  it('a secondary view shows its own state-specific lede', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/four broad movement groupings/i);
  });

  it('the family filter shows the family header', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('finish with a whirl');
  });

  it('secondary views keep beginner help reachable via the Reading the Dictionary tile, the glossary, and Freestyle Concepts', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('New to the dictionary? Start with <a href="#reading-the-dictionary">Reading the Dictionary</a> above, look up a term in the <a href="/freestyle/glossary">Glossary</a>, or read the <a href="/freestyle/concepts">Freestyle Concepts</a> chapters.');
  });
});

describe('GET /freestyle/tricks — orientation tiles and search section', () => {
  it('renders exactly three disclosure tiles, all closed on arrival', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const closed = res.text.match(/<details class="dict-tile">/g) ?? [];
    expect(closed).toHaveLength(3);
    // No tile arrives open; the reader opens each independently.
    expect(res.text).not.toMatch(/<details class="dict-tile"[^>]*\sopen/);
  });

  it('tile summaries carry the three titles in beginner-to-expert order', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const at = (s: string) => res.text.indexOf(s);
    const start    = at('Where to start');
    const built    = at('How tricks are built');
    const contents = at('What&#x27;s in the dictionary');
    expect(start).toBeGreaterThan(-1);
    expect(built).toBeGreaterThan(start);
    expect(contents).toBeGreaterThan(built);
  });

  it('every tile in the row is a disclosure, and Watch Videos is a button beside search', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // Watch Videos leaves the page, so it renders as a secondary-action button
    // in the search card, never as a tile that would look like it opens here.
    expect(res.text).toMatch(/<a class="btn btn-outline" href="\/freestyle\/media">Watch Videos<\/a>/);
    const gridStart = res.text.indexOf('class="dict-tile-grid"');
    const gridEnd = res.text.indexOf('class="card dict-nav-card"');
    const row = res.text.slice(gridStart, gridEnd);
    expect(gridStart).toBeGreaterThan(-1);
    expect(gridEnd).toBeGreaterThan(gridStart);
    // Nothing in the row navigates away: no anchor is itself a tile.
    expect(row).not.toContain('<a class="dict-tile');
    expect(row).not.toContain('Watch Videos');
  });

  it('each ADD section count names what it counts, and pluralizes', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // A bare number beside "2 ADD" says nothing about what it counts.
    expect(res.text).not.toMatch(/<span class="section-count">\d+<\/span>/);
    // The seed puts a single trick at 2 ADD and five at 4 ADD, so both the
    // singular and the plural forms render.
    expect(res.text).toContain('<span class="section-count">1 trick</span>');
    expect(res.text).toContain('<span class="section-count">5 tricks</span>');
  });

  it('data provenance sits in the top tiles, not stranded under the list', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const noteIdx = res.text.indexOf('class="source-note"');
    const tilesIdx = res.text.indexOf('class="dict-tile-grid"');
    const listIdx = res.text.indexOf('data-trick-slug=');
    expect(noteIdx).toBeGreaterThan(tilesIdx);
    expect(noteIdx).toBeLessThan(listIdx);
    // Still the same text, and still linking the ADD walkthrough.
    expect(res.text).toContain('Trick data sourced from community documentation.');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });

  it('the long list ends with a control back to the top of the dictionary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const listIdx = res.text.indexOf('data-trick-slug=');
    const backIdx = res.text.indexOf('class="dict-back-to-top"');
    expect(backIdx).toBeGreaterThan(listIdx);
    expect(res.text).toMatch(/<a class="btn btn-outline" href="#dictionary-top">Back to Top<\/a>/);
    // The anchor it names exists on the page.
    expect(res.text).toContain('id="dictionary-top"');
  });

  it('the browse controls sit in one titled card', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const cardIdx = res.text.indexOf('class="card dict-nav-card"');
    expect(cardIdx).toBeGreaterThan(-1);
    expect(res.text).toContain('<h2 class="card-title">Navigate the Trick Dictionary</h2>');
    // All three control rows live inside that card, before the trick list.
    const viewIdx = res.text.indexOf('aria-label="Browse the dictionary"');
    const sortIdx = res.text.indexOf('aria-label="Sort within each ADD tier"');
    const jumpIdx = res.text.indexOf('aria-label="Browse by ADD level"');
    const listIdx = res.text.indexOf('data-trick-slug=');
    expect(viewIdx).toBeGreaterThan(cardIdx);
    expect(sortIdx).toBeGreaterThan(viewIdx);
    expect(jumpIdx).toBeGreaterThan(sortIdx);
    expect(listIdx).toBeGreaterThan(jumpIdx);
  });

  it('the trick list renders below the tile row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const tilesIdx = res.text.indexOf('class="dict-tile-grid"');
    const listIdx = res.text.indexOf('data-trick-slug=');
    expect(tilesIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeGreaterThan(tilesIdx);
  });

  it('the two actions share one card: search leads, Watch Videos sits beside it', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const cardIdx    = res.text.indexOf('search-box-card');
    const headingIdx = res.text.indexOf('<h2 class="card-title">Look up a trick</h2>');
    const formIdx    = res.text.indexOf('action="/freestyle/search"');
    const watchIdx   = res.text.indexOf('href="/freestyle/media"');
    const tilesIdx   = res.text.indexOf('class="dict-tile-grid"');
    expect(cardIdx).toBeGreaterThan(-1);
    // Heading, then the form, then the secondary action, all in one card.
    expect(headingIdx).toBeGreaterThan(cardIdx);
    expect(formIdx).toBeGreaterThan(headingIdx);
    expect(watchIdx).toBeGreaterThan(formIdx);
    // The actions card leads, ahead of the disclosure row.
    expect(cardIdx).toBeLessThan(tilesIdx);
    expect(watchIdx).toBeLessThan(tilesIdx);
    // No second glossary link beside the form: the tile row carries it.
    expect(res.text).not.toContain('Open the Glossary of Freestyle Jargon');
  });
});
