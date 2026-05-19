/**
 * Integration tests for GET /freestyle/add-analysis.
 *
 * Verifies:
 *   - Route returns 200
 *   - All 4 main section headings render in order
 *   - All 8 worked examples render with their trick links
 *   - All 10 discrepancy case anchors render
 *   - 2 edge-case brief mentions render
 *   - Philosophy paragraph + editorial-truth rule render
 *   - Cross-links to /freestyle/tricks + /freestyle/glossary + /freestyle/history present
 *   - Wording lexicon: no "{source} is wrong" framing
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3110');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // The page reads only curator-authored content; no DB seeding required.
  // We still need a schema-loaded test DB so the app can boot.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/add-analysis — route + page structure', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.status).toBe(200);
  });

  it('renders the page title + intro', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('ADD Accounting &amp; Analysis');
    expect(res.text).toMatch(/How freestyle.s difficulty system is constructed/);
  });

  it('renders the philosophy paragraph (Slice Z statement)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/structural reading for every accepted trick/);
    expect(res.text).toMatch(/movement language explainable/);
  });

  it('renders all 4 section h2 headings in canonical order', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const sections = [
      '1. How ADD is built',
      '2. Worked examples',
      '3. ADD discrepancies',
      '4. Interpretation notes',
    ];
    let lastIdx = -1;
    for (const heading of sections) {
      const idx = res.text.indexOf(heading);
      expect(idx, `Missing heading: ${heading}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('exposes anchor ids for the 4 main sections (deep-link contract)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('id="how-add-is-built"');
    expect(res.text).toContain('id="worked-examples"');
    expect(res.text).toContain('id="discrepancies"');
    expect(res.text).toContain('id="interpretation-notes"');
  });

  it('renders the editorial-truth rule + incompleteness callouts', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/editorial-truth rule/i);
    expect(res.text).toMatch(/stated value is canonical/);
    expect(res.text).toMatch(/Honest incompleteness/i);
    expect(res.text).toMatch(/pending decomposition refinement/);
  });
});

describe('GET /freestyle/add-analysis — component-contribution table', () => {
  it('renders all 11 component classes (foundational primitives + operator contributions)', async () => {
    // 2026-05-18 foundational-formula slice: table expanded from 9 to
    // 11 entries to surface xbody (cross-body traversal) and spin
    // (full-body rotation) as foundational primitives alongside stall
    // and dex. The four primitives + specialized surface make the
    // five 1-ADD-contributing classes; the remaining six are
    // operator/modifier contributions on top of a base.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const components = [
      'Stall',
      'Dexterity (dex)',
      'Cross-body traversal (xbody)',
      'Rotation (spin)',
      'Specialized surface',
      'Body operators',
      'Atomic',
      'Nuclear',
      'Quantum',
      'Blurry',
      'Same-side (ss) / far / near / reverse',
    ];
    for (const c of components) {
      expect(res.text, `Missing component: ${c}`).toContain(c);
    }
  });
});

describe('GET /freestyle/add-analysis — worked examples', () => {
  it('renders foundational atoms first, then compounds, with explicit ADD ordering', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // 2026-05-18 foundational-formula slice: worked examples expanded
    // to 17 entries covering every 1-3 ADD foundational atom plus the
    // existing 4-5 ADD compound flagships. Order is ascending ADD,
    // with foundational atoms grouped by ADD value then compounds.
    //
    // Pattern note: trick names appear in two contexts — the example
    // heading (canonical, linked) and in some whyNote prose (e.g. Osis
    // mentions "Torque" as a derivative compound). Search using the
    // anchor-tag closing form `>Name</a>` so we hit only the heading.
    const examples = [
      // 1 ADD
      'Toe-stall',
      'Clipper (kick)',
      // 2 ADD foundational atoms
      'Clipper-stall',
      'Mirage',
      'Legover',
      'Pickup',
      'Illusion',
      'Around-the-world (ATW)',
      // 3 ADD foundational atoms
      'Whirl',
      'Swirl',
      'Butterfly',
      'Osis',
      // operator visibility (3 ADD)
      'Paradox Mirage',
      // 4-5 ADD compounds
      'Torque',
      'Atom Smasher',
      'Blurry Whirl',
      'Mobius',
    ];
    let lastIdx = -1;
    const sectionStart = res.text.indexOf('id="worked-examples"');
    const sectionEnd = res.text.indexOf('id="discrepancies"');
    const slice = res.text.substring(sectionStart, sectionEnd);
    for (const e of examples) {
      // Anchor on the heading-link closing tag so whyNote prose
      // mentions (e.g. "Torque and Blender" inside the Osis card)
      // don't pollute the ordering check.
      const idx = slice.indexOf(`>${e}</a>`);
      expect(idx, `Worked example ${e} heading not found or out of order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('worked examples link to the trick-detail page when slug is known', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const expectedLinks = [
      'href="/freestyle/tricks/toe-stall"',
      'href="/freestyle/tricks/clipper"',
      'href="/freestyle/tricks/clipper-stall"',
      'href="/freestyle/tricks/mirage"',
      'href="/freestyle/tricks/legover"',
      'href="/freestyle/tricks/pickup"',
      'href="/freestyle/tricks/illusion"',
      'href="/freestyle/tricks/around-the-world"',
      'href="/freestyle/tricks/whirl"',
      'href="/freestyle/tricks/swirl"',
      'href="/freestyle/tricks/butterfly"',
      'href="/freestyle/tricks/osis"',
      'href="/freestyle/tricks/torque"',
      'href="/freestyle/tricks/atom-smasher"',
      'href="/freestyle/tricks/blurry-whirl"',
      'href="/freestyle/tricks/mobius"',
    ];
    for (const link of expectedLinks) {
      expect(res.text, `Missing cross-link: ${link}`).toContain(link);
    }
  });

  it('worked examples carry their ADD label', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/Toe-stall<\/a>[\s\S]{0,200}1 ADD/);
    expect(res.text).toMatch(/Mirage<\/a>[\s\S]{0,200}2 ADD/);
    expect(res.text).toMatch(/Whirl<\/a>[\s\S]{0,200}3 ADD/);
    expect(res.text).toMatch(/Mobius<\/a>[\s\S]{0,200}5 ADD/);
  });

  it('worked examples render explicit additive derivations using stall/dex/xbody/spin primitives', async () => {
    // Central pedagogical contract of the 2026-05-18 foundational-formula
    // slice: every foundational worked example carries an explicit
    // additive derivation string that names which primitives contribute
    // each ADD. Pin a sample across the four primitives.
    //
    // Note: Handlebars HTML-escapes `=` to `&#x3D;` in the rendered
    // <code> block. Assert against the encoded form (what users see in
    // page source); the visible rendered character is still `=`.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const derivations = [
      'stall(1) &#x3D; 1 ADD',
      'xbody(1) &#x3D; 1 ADD',
      'xbody(1) + stall(1) &#x3D; 2 ADD',
      'dex(1) + stall(1) &#x3D; 2 ADD',
      'full-orbit dex(1) + stall(1) &#x3D; 2 ADD',
      'xbody(1) + dex(1) + stall(1) &#x3D; 3 ADD',
      'dex(1) + xbody(1) + stall(1) &#x3D; 3 ADD',
      'spin(1) + xbody(1) + stall(1) &#x3D; 3 ADD',
      'paradox(+1) + mirage(2) &#x3D; 3 ADD',
      'miraging(+1) + osis(3) &#x3D; 4 ADD',
      'atomic(+1) + mirage(2) + xdex(+1) &#x3D; 4 ADD',
      'stepping(+1) + paradox(+1) + whirl(3) &#x3D; 5 ADD',
      'gyro(+1) + torque(4) &#x3D; 5 ADD',
    ];
    for (const d of derivations) {
      expect(res.text, `Missing derivation: ${d}`).toContain(d);
    }
  });

  it('component-classes table introduces xbody and spin primitives', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('Cross-body traversal (xbody)');
    expect(res.text).toContain('Rotation (spin)');
  });
});

describe('GET /freestyle/add-analysis — discrepancy case studies', () => {
  it('renders all 10 case anchor ids (DC-01..DC-10)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    for (let i = 1; i <= 10; i++) {
      const id = `id="case-DC-${String(i).padStart(2, '0')}"`;
      expect(res.text, `Missing case anchor: ${id}`).toContain(id);
    }
  });

  it('renders each case trick name', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const cases = [
      'Hurl',
      'Barfry',
      'Godzilla',
      'Blurry Whirl',
      'Blurry Torque',
      'Food Processor',
      'Mobius',
      'Atom Smasher',
      'Baroque',
      'Bladerunner',
    ];
    for (const c of cases) {
      expect(res.text, `Missing case: ${c}`).toContain(c);
    }
  });

  it('renders Red-status attribution lines (settled by ...)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('settled by Red 2026-05-11');
    expect(res.text).toContain('settled by pt11');
    expect(res.text).toContain('settled by pt4');
    expect(res.text).toContain('settled by Wave 1 2026-05-15');
    expect(res.text).toContain('settled by Red 2026-05-15');
  });

  it('renders the 2 edge-case brief mentions', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('Sumo');
    expect(res.text).toContain('Genesis');
    expect(res.text).toMatch(/pt9 exception/);
    expect(res.text).toMatch(/rotational-escalation/);
  });
});

describe('GET /freestyle/add-analysis — interpretation notes + cross-links', () => {
  it('renders the 3 disagreement patterns in §4', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/Positional vs additive/);
    expect(res.text).toMatch(/Compression vs expansion/);
    expect(res.text).toMatch(/Historical evolution/);
  });

  it('renders the cross-links inventory', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary#symbolic-notation"');
    expect(res.text).toContain('href="/freestyle/glossary#traditional-reference"');
    expect(res.text).toContain('href="/freestyle/history"');
  });
});

describe('ADD Analysis discoverability — inbound links (Slice X corrective 2026-05-17)', () => {
  it('freestyle landing surfaces an ADD analysis link in the History & ADD System card', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });

  it('freestyle tricks index source-note links to ADD analysis', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const note = res.text.match(/class="source-note"[\s\S]{0,500}/)?.[0] ?? '';
    expect(note).toContain('href="/freestyle/add-analysis"');
  });

  it('freestyle glossary §8 compact-equivalence block links to ADD analysis', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    expect(flowIdx).toBeGreaterThan(0);
    const sec9Idx = res.text.indexOf('9. Movement Neighborhoods');
    const slice = res.text.slice(flowIdx, sec9Idx);
    expect(slice).toContain('href="/freestyle/add-analysis"');
  });

  it('freestyle history ADD System section links to ADD analysis', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });
});

describe('GET /freestyle/add-analysis — Canonical Formula Resolution Sprints (§2b reference table)', () => {
  // Sprint 1 (15 rows) published pure +1-stack compositions where both
  // operator and base are Red-settled. Sprint 2 (7 rows) expanded the
  // pattern set to pt-ruled compounds (eggbeater), positional modifiers
  // (rev-whirl, reverse-around-the-world), folk-name resolutions
  // (dimwalk), and the first multi-operator chain (paradox-symposium-
  // whirl). Compact reference table between worked examples (§2) and
  // discrepancy cases (§3).

  it('renders the §2b section heading + anchor', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('id="resolved-formulas"');
    expect(res.text).toMatch(/Settled compound formula reference/);
  });

  it('renders the framing prose', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/Mechanically-derivable compound formulas/);
    expect(res.text).toMatch(/no curator-judgment cases/i);
  });

  it('renders all 25 Sprint-1 + Sprint-2 + Sprint-3 rows with trick-detail links', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const expectedSlugs = [
      // Sprint 1 (15 rows — pure +1 stacks)
      'paradox-mirage', 'symposium-mirage',
      'atomic-butterfly', 'ducking-butterfly', 'ducking-osis', 'ducking-whirl',
      'spinning-butterfly', 'spinning-osis',
      'stepping-osis', 'stepping-whirl', 'symposium-whirl', 'whirling-swirl',
      'paradox-blender', 'paradox-torque', 'spinning-torque',
      // Sprint 2 (7 rows — pt-ruled / positional / multi-op / folk-name)
      'eggbeater', 'ducking-clipper', 'spinning-clipper',
      'rev-whirl', 'reverse-around-the-world',
      'paradox-symposium-whirl', 'dimwalk',
      // Sprint 3 (3 rows — targeted folk-name resolutions)
      'smear', 'ripwalk', 'rev-up',
    ];
    for (const slug of expectedSlugs) {
      expect(res.text, `missing Sprint row: ${slug}`)
        .toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });

  it('renders Sprint-1 +1-stack derivations', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // Handlebars HTML-escapes `=` to `&#x3D;` in <code> blocks
    const eq = '(?:=|&#x3D;)';
    expect(res.text).toMatch(new RegExp(`paradox\\(\\+1\\)\\s*\\+\\s*mirage\\(2\\)\\s*${eq}\\s*3 ADD`));
    expect(res.text).toMatch(new RegExp(`spinning\\(\\+1\\)\\s*\\+\\s*osis\\(3\\)\\s*${eq}\\s*4 ADD`));
    expect(res.text).toMatch(new RegExp(`paradox\\(\\+1\\)\\s*\\+\\s*torque\\(4\\)\\s*${eq}\\s*5 ADD`));
    expect(res.text).toMatch(new RegExp(`whirling\\(\\+1\\)\\s*\\+\\s*swirl\\(3\\)\\s*${eq}\\s*4 ADD`));
  });

  it('renders Sprint-2 derivations across the expanded pattern set', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const eq = '(?:=|&#x3D;)';
    // pt-ruled: eggbeater = atomic legover
    expect(res.text).toMatch(new RegExp(`atomic\\(\\+1\\)\\s*\\+\\s*legover\\(2\\)\\s*${eq}\\s*3 ADD`));
    // positional (+0): rev-whirl, reverse-ATW
    expect(res.text).toMatch(new RegExp(`reverse\\(\\+0\\)\\s*\\+\\s*whirl\\(3\\)\\s*${eq}\\s*3 ADD`));
    expect(res.text).toMatch(new RegExp(`reverse\\(\\+0\\)\\s*\\+\\s*around-the-world\\(2\\)\\s*${eq}\\s*2 ADD`));
    // multi-operator chain
    expect(res.text).toMatch(new RegExp(`paradox\\(\\+1\\)\\s*\\+\\s*symposium\\(\\+1\\)\\s*\\+\\s*whirl\\(3\\)\\s*${eq}\\s*5 ADD`));
    // folk-name resolution: dimwalk = pixie butterfly
    expect(res.text).toMatch(new RegExp(`pixie\\(\\+1\\)\\s*\\+\\s*butterfly\\(3\\)\\s*${eq}\\s*4 ADD`));
  });

  it('renders Sprint-3 folk-name resolutions (smear / ripwalk / rev-up)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const eq = '(?:=|&#x3D;)';
    // smear = pixie + mirage (operator-board lede)
    expect(res.text).toMatch(new RegExp(`pixie\\(\\+1\\)\\s*\\+\\s*mirage\\(2\\)\\s*${eq}\\s*3 ADD`));
    // ripwalk = stepping + butterfly (operator-board + glossary §3/§8)
    expect(res.text).toMatch(new RegExp(`stepping\\(\\+1\\)\\s*\\+\\s*butterfly\\(3\\)\\s*${eq}\\s*4 ADD`));
    // rev-up = reverse + whirl (positional + 3-ADD core atom)
    // Note: matches the rev-whirl derivation; the row is published under
    // the rev-up slug with a curator-uncertainty note flagging that
    // rev-up + rev-whirl are distinct canonical rows.
    const revUpCount = (res.text.match(/reverse\(\+0\) \+ whirl\(3\) &#x3D; 3 ADD/g) ?? []).length;
    expect(revUpCount, 'expected the reverse-whirl-derivation string to appear twice (rev-whirl + rev-up rows)')
      .toBeGreaterThanOrEqual(2);
  });

  it('Sprint-1 section sits between worked examples (§2) and discrepancies (§3)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const workedExamplesIdx = res.text.indexOf('id="worked-examples"');
    const resolvedFormulasIdx = res.text.indexOf('id="resolved-formulas"');
    const discrepanciesIdx = res.text.indexOf('id="discrepancies"');
    expect(workedExamplesIdx).toBeGreaterThan(0);
    expect(resolvedFormulasIdx).toBeGreaterThan(workedExamplesIdx);
    expect(discrepanciesIdx).toBeGreaterThan(resolvedFormulasIdx);
  });

  it('Sprint-1 section stays within the lexicon — no forbidden phrases', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const sectionMatch = res.text.match(/id="resolved-formulas"[\s\S]*?<\/section>/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0].toLowerCase();
    for (const phrase of ['is wrong', 'incorrect', 'the correct add', 'should be', 'outdated']) {
      expect(section.includes(phrase), `Forbidden in Sprint-1 section: "${phrase}"`).toBe(false);
    }
  });
});

describe('GET /freestyle/add-analysis — PassBack ADD framing subsection (Batch C 2026-05-18)', () => {
  // External-source ADD reconciliation: 68 name-matched rows where PB
  // dex_count diverges from IFPA structural ADD. Surfaces the framing
  // explicitly so the divergence reads as a structural reconciliation
  // (PB counts dexes; IFPA counts ADD) rather than a true conflict.

  it('renders the §3c framing heading + anchor', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('id="passback-add-framing"');
    expect(res.text).toMatch(/External-source ADD framings/);
  });

  it('renders the PassBack-vs-IFPA counting framing prose', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('class="passback-add-framing-prose"');
    expect(res.text).toMatch(/dex_count/);
    expect(res.text).toMatch(/canonical ADD/);
    expect(res.text).toMatch(/different things/);
  });

  it('renders a <details> disclosure with the 68 disagreement rows', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('class="passback-add-disagreement-details"');
    expect(res.text).toContain('class="passback-add-disagreement-table"');
    // Spot-check representative rows by IFPA trick name
    for (const trick of ['butterfly', 'mirage', 'whirl', 'osis', 'eggbeater', 'mobius']) {
      expect(res.text, `missing PB-disagreement row for: ${trick}`)
        .toMatch(new RegExp(`href="/freestyle/tricks/${trick}"`));
    }
  });

  it('every disagreement row carries a PB dex_count value and links to the canonical detail page', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // Pull the table region
    const tableMatch = res.text.match(/<table class="passback-add-disagreement-table">[\s\S]*?<\/table>/);
    expect(tableMatch).not.toBeNull();
    const table = tableMatch![0];
    // Every row carries an <a> linking to /freestyle/tricks/{slug}
    const rowLinks = table.match(/<a href="\/freestyle\/tricks\/[a-z-]+"/g) ?? [];
    expect(rowLinks.length).toBeGreaterThanOrEqual(60); // 68 rows × 1 link each (allow some tolerance)
    // Every row carries a PB-claim cell
    const claimCells = table.match(/class="passback-add-claim-cell"/g) ?? [];
    expect(claimCells.length).toBe(rowLinks.length);
  });

  it('framing prose stays within the lexicon — no forbidden phrases', async () => {
    // Belt-and-suspenders: re-asserts the lexicon test against the new
    // subsection specifically, so future curator edits don't silently
    // introduce "is wrong" / "incorrect" framing here.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const sectionMatch = res.text.match(/id="passback-add-framing"[\s\S]*?<\/section>/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0].toLowerCase();
    for (const phrase of ['is wrong', 'incorrect', 'the correct add', 'should be', 'outdated']) {
      expect(section.includes(phrase), `Forbidden in PB framing: "${phrase}"`).toBe(false);
    }
  });
});

describe('GET /freestyle/add-analysis — wording lexicon discipline (Slice X §4)', () => {
  it('never uses "is wrong" / "incorrect" framing on external sources', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // Hard never-ship phrases per Slice X §4 lexicon
    const forbidden = [
      'is wrong',
      'incorrect',
      'the correct ADD',
      'should be',
      'outdated',
    ];
    for (const phrase of forbidden) {
      // Allow inside script/style/title attributes? Not on this page — there are none.
      // Match case-insensitively.
      expect(
        res.text.toLowerCase().includes(phrase.toLowerCase()),
        `Forbidden phrase appeared: "${phrase}"`,
      ).toBe(false);
    }
  });
});
