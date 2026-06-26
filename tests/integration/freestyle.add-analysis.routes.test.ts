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
    expect(res.text).toContain('ADD Analysis');
    expect(res.text).toMatch(/How freestyle players describe trick difficulty/);
  });

  it('renders the philosophy paragraph (Slice Z statement)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/structural reading for every accepted trick/);
    expect(res.text).toMatch(/movement language explainable/);
  });

  it('renders all 4 section anchors in canonical order', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const sections = [
      'id="how-add-is-built"',
      'id="worked-examples"',
      'id="discrepancies"',
      'id="interpretation-notes"',
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
    expect(res.text).toMatch(/stated value is the official one/);
    expect(res.text).toMatch(/Honest incompleteness/i);
    expect(res.text).toMatch(/pending breakdown refinement/);
  });
});

describe('GET /freestyle/add-analysis — component-contribution table', () => {
  it('renders all 9 component classes (5 atomic-flag primitives + 4 operator-board axes)', async () => {
    // ADD Analysis Refactor Phase 1 (2026-05-21): the previous 11-row
    // table conflated atomic-flag primitives with operator/modifier
    // contributions and collapsed the four operator-board axes into a
    // single "Body operators" row. Phase 1 splits the operator rows
    // into four axis-aligned rows (Set / Entry / Midtime / Positional)
    // labeled as a pedagogical organizing convention — NOT canonical
    // taxonomy — mirroring the operator-board grouping on the
    // /freestyle/tricks?view=movement-system surface and the glossary
    // §6 modifier reference.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const components = [
      // 5 atomic-flag primitives
      'Stall',
      'Dexterity (dex)',
      'Cross-body traversal (xbody)',
      'Spin flag',
      'Unusual surface',
      // 4 operator-board axes (pedagogical organizing convention)
      'Set / Uptime modifiers',
      'Entry topology:',
      'Midtime body modifiers',
      'Positional / directional cues',
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
    // Phase 1 refactor (2026-05-21): "Clipper (kick)" reframed as
    // "Cross-body traversal (xbody primitive)" with null trickSlug to
    // remove canonical-trick confusion while preserving the xbody
    // primitive illustration. All other worked examples carry trick
    // links via the `>${name}</a>` anchor closing pattern.
    const linkedExamples = [
      // 1 ADD
      'Toe-stall',
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
    // The xbody-primitive entry appears second (after Toe-stall, before
    // Clipper-stall) without a trick-detail link. Pin its position +
    // unlinked rendering.
    const xbodyIdx = slice.indexOf('Cross-body traversal (xbody primitive)');
    const toeIdx = slice.indexOf('>Toe-stall</a>');
    const clipperStallIdx = slice.indexOf('>Clipper-stall</a>');
    expect(xbodyIdx).toBeGreaterThan(toeIdx);
    expect(clipperStallIdx).toBeGreaterThan(xbodyIdx);
    for (const e of linkedExamples) {
      const idx = slice.indexOf(`>${e}</a>`);
      expect(idx, `Worked example ${e} heading not found or out of order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('worked examples link to the trick-detail page when slug is known', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // Phase 1 refactor: 'clipper' link removed — the entry is now the
    // xbody primitive illustration with trickSlug: null, not a
    // canonical-trick claim.
    const expectedLinks = [
      'href="/freestyle/tricks/toe_stall"',
      'href="/freestyle/tricks/clipper_stall"',
      'href="/freestyle/tricks/mirage"',
      'href="/freestyle/tricks/legover"',
      'href="/freestyle/tricks/pickup"',
      'href="/freestyle/tricks/illusion"',
      'href="/freestyle/tricks/around_the_world"',
      'href="/freestyle/tricks/whirl"',
      'href="/freestyle/tricks/swirl"',
      'href="/freestyle/tricks/butterfly"',
      'href="/freestyle/tricks/osis"',
      'href="/freestyle/tricks/torque"',
      'href="/freestyle/tricks/atom_smasher"',
      'href="/freestyle/tricks/blurry_whirl"',
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

  it('component-classes table introduces xbody and spin-flag primitives', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('Cross-body traversal (xbody)');
    expect(res.text).toContain('Spin flag');
  });
});

describe('GET /freestyle/add-analysis — Phase 1 refactor (2026-05-21)', () => {
  it('a dedicated callout disambiguates spin flag vs spinning operator vs rotational character', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('add-analysis-callout--spin');
    expect(res.text).toMatch(/spin flag is a rotational/i);
    expect(res.text).toMatch(/spinning operator is a body modifier/i);
    expect(res.text).toMatch(/rotational character describes atoms/i);
    expect(res.text).toMatch(/atomic is \+1 on every base/i);
  });

  it('operator-axis rows are labeled as a pedagogical organizing convention, not an official grouping', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // The four-axis grouping must be flagged as pedagogical, not official.
    expect(res.text).toMatch(/pedagogical axis, not an official grouping/i);
  });

  it('Mirage worked-example no longer describes mirage as "rotational"', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const sliceStart = res.text.indexOf('>Mirage</a>');
    const sliceEnd = res.text.indexOf('>Legover</a>');
    expect(sliceStart).toBeGreaterThan(0);
    const region = res.text.slice(sliceStart, sliceEnd);
    expect(region).not.toMatch(/rotational anchor/i);
    expect(region).toMatch(/foundational dexterity primitive/i);
  });

  it('xbody-primitive entry replaces the prior Clipper(kick) framing', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('Cross-body traversal (xbody primitive)');
    // The accounting-primitive framing prose must be present.
    expect(res.text).toMatch(/accounting primitive illustrated via clipper motion/i);
    expect(res.text).toMatch(/not an official named trick/i);
    // The xbody insight remains: clipper-stall still exists below as a
    // canonical trick + xbody is still a recognized accounting primitive.
    expect(res.text).toContain('href="/freestyle/tricks/clipper_stall"');
  });

  it('ATW worked-example surfaces its operational chain and reads as dex + stall', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const start = res.text.indexOf('Around-the-world');
    expect(start).toBeGreaterThan(0);
    const region = res.text.slice(start, start + 900);
    expect(region).toMatch(/toe &gt; ss in dex &gt; ss toe/);
    expect(region).toMatch(/dex\(1\) \+ stall\(1\) &#x3D; 2 ADD/);
    // The worked example uses the standard dex primitive, not a one-off "full-orbit dex".
    expect(region).not.toContain('full-orbit');
  });

  it('Whirl / Butterfly / Osis worked examples carry their operational chains', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // From ATOMIC_FLAG_DECOMPOSITIONS — surfacing chains on this page
    // gives parity with the trick-detail first-class Notation summary.
    expect(res.text).toMatch(/leggy in dex &gt; ss clipper/);
    expect(res.text).toMatch(/hippy out dex &gt; ss clipper/);
    expect(res.text).toMatch(/\(downtime\) spin &gt; ss clipper/);
  });

  it('blurry reads as +1 implying stepping, not paradox', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/blurry \+1 \(implies stepping\)/i);
    expect(res.text).not.toMatch(/blurry[^.]*implies[^.]*paradox/i);
  });

  it('Barraging surfaces as a Set/Uptime modifier with weight 2 (Red 2026-05-20)', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/barraging \+2/i);
    expect(res.text).toMatch(/two-dex set/i);
  });

  it('Philosophy paragraph elevates stopping-depth equivalence as foundational', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/multiple valid structural readings at different stopping depths/i);
    expect(res.text).toMatch(/stopping-depth equivalence is a foundational property/i);
  });

  it('Section 3 intro reframes compression cases as the movement structure working as intended, not real disagreements', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const startIdx = res.text.indexOf('id="discrepancies"');
    const endIdx = res.text.indexOf('class="add-analysis-discrepancy-cases"', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/Multi-depth readings are not real disagreements/i);
    expect(region).toMatch(/movement structure[\s\S]{0,40}working as intended/i);
    expect(region).toMatch(/Stopping-depth equivalence is foundational/i);
  });

  it('Phase 1 additions do not introduce curator-internal language in the §1 component-table region', async () => {
    // Scope: §1 component-class table. (The §2b resolved-formulas Provenance
    // column that previously leaked "pt##" / ruling citations has since been
    // removed; a separate page-wide test now guards against its jargon.)
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const sectionStart = res.text.indexOf('id="how-add-is-built"');
    const sectionEnd = res.text.indexOf('id="worked-examples"');
    const region = res.text.slice(sectionStart, sectionEnd);
    expect(region).not.toMatch(/curatorConfirmPending/i);
    expect(region).not.toMatch(/Slice [A-Z]\b/);
    expect(region).not.toMatch(/Sprint\b/i);
    expect(region).not.toMatch(/COMPOSITE_DERIVATIONS/);
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

  it('renders IFPA status lines carrying the substantive note but no individual / date / ruling-number attribution', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('settled (X-dex carry from a toe)');
    expect(res.text).toContain('settled (Baroque named ruling)');
    // The public status lines never name an individual, carry a date, or cite a ruling number.
    expect(res.text).not.toMatch(/settled by Red/);
    expect(res.text).not.toMatch(/settled by pt[0-9]/);
    expect(res.text).not.toMatch(/settled by Wave/);
  });

  it('renders the 2 edge-case brief mentions', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('Sumo');
    expect(res.text).toContain('Genesis');
    // Sumo's mention is now notation-authoritative; Genesis keeps the retired
    // rotational-escalation only as a historical, external-source note.
    expect(res.text).toMatch(/\[XDEX\] flag in its operational notation/);
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
    expect(res.text).toMatch(/Common formula patterns/);
  });

  it('renders the framing prose', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/Mechanically-derivable compound formulas/);
    expect(res.text).toMatch(/no curator-judgment cases/i);
  });

  it('renders all 24 Sprint-1 + Sprint-2 + Sprint-3 rows with trick-detail links', async () => {
    // 2026-05-24 QC: rev-up was demoted from canonical (is_active=0)
    // because it's structurally distinct from rev-whirl but lacks an
    // authored structural decomposition. Its row is removed from the
    // public table along with the demotion.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const expectedSlugs = [
      // Sprint 1 (15 rows — pure +1 stacks)
      'paradox_mirage', 'symposium_mirage',
      'atomic_butterfly', 'ducking_butterfly', 'ducking_osis', 'ducking_whirl',
      'spinning_butterfly', 'spinning_osis',
      'stepping_osis', 'stepping_whirl', 'symposium_whirl', 'whirling_swirl',
      'paradox_blender', 'paradox_torque', 'spinning_torque',
      // Sprint 2 (7 rows — pt-ruled / positional / multi-op / folk-name)
      'eggbeater', 'ducking_clipper', 'spinning_clipper',
      'rev_whirl', 'orbit',
      'paradox_symposium_whirl', 'dimwalk',
      // Sprint 3 (2 rows after rev-up demote — targeted folk-name resolutions)
      'smear', 'ripwalk',
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
    // 2026-05-24 QC: rev-whirl now publishes the structural derivation
    // (xbody+dex+stall). The reverse(+0) reading lives in the ALT row
    // on /freestyle/tricks/rev-whirl, not on /freestyle/add-analysis.
    expect(res.text).toMatch(/xbody\(1\)\s*\+\s*dex\(1\)\s*\+\s*stall\(1\)\s*(?:=|&#x3D;)\s*3 ADD/);
    // orbit still publishes the reverse(+0) reading.
    expect(res.text).toMatch(new RegExp(`reverse\\(\\+0\\)\\s*\\+\\s*around-the-world\\(2\\)\\s*${eq}\\s*2 ADD`));
    // multi-operator chain
    expect(res.text).toMatch(new RegExp(`paradox\\(\\+1\\)\\s*\\+\\s*symposium\\(\\+1\\)\\s*\\+\\s*whirl\\(3\\)\\s*${eq}\\s*5 ADD`));
    // folk-name resolution: dimwalk = pixie butterfly
    expect(res.text).toMatch(new RegExp(`pixie\\(\\+1\\)\\s*\\+\\s*butterfly\\(3\\)\\s*${eq}\\s*4 ADD`));
  });

  it('renders Sprint-3 folk-name resolutions (smear / ripwalk)', async () => {
    // 2026-05-24 QC: rev-up was demoted from canonical (is_active=0)
    // because it's structurally distinct from rev-whirl without an
    // authored decomposition. Its resolved-formula entry is removed
    // from RESOLVED_FORMULAS_SPRINT_1 alongside the demotion. Sprint 3
    // now publishes 2 folk-name resolutions, not 3.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const eq = '(?:=|&#x3D;)';
    expect(res.text).toMatch(new RegExp(`pixie\\(\\+1\\)\\s*\\+\\s*mirage\\(2\\)\\s*${eq}\\s*3 ADD`));
    expect(res.text).toMatch(new RegExp(`stepping\\(\\+1\\)\\s*\\+\\s*butterfly\\(3\\)\\s*${eq}\\s*4 ADD`));
    // rev-whirl publishes the structural form.
    expect(res.text).toMatch(/xbody\(1\) \+ dex\(1\) \+ stall\(1\) &#x3D; 3 ADD/);
    // The reverse(+0) reading is no longer in the /freestyle/add-analysis
    // table for rev-up (rev-up demoted) or rev-whirl (structural form).
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

describe('GET /freestyle/add-analysis — outside-source ADD framing subsection', () => {
  // External-source ADD reconciliation: name-matched rows where an outside
  // source's dex_count diverges from IFPA structural ADD. Surfaces the framing
  // explicitly so the divergence reads as a structural reconciliation
  // (the outside source counts dexes; IFPA counts ADD) rather than a true conflict.

  it('renders the §3c framing heading + anchor', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('id="passback-add-framing"');
    expect(res.text).toMatch(/External-source ADD framings/);
  });

  it('renders the outside-source-vs-IFPA counting framing prose', async () => {
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

  it('every disagreement row carries an outside-source dex_count value and links to the canonical detail page', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // Pull the table region
    const tableMatch = res.text.match(/<table class="passback-add-disagreement-table">[\s\S]*?<\/table>/);
    expect(tableMatch).not.toBeNull();
    const table = tableMatch![0];
    // Every row carries an <a> linking to /freestyle/tricks/{slug}
    const rowLinks = table.match(/<a href="\/freestyle\/tricks\/[a-z_]+"/g) ?? [];
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

describe('GET /freestyle/add-analysis — public pedagogy cleanup', () => {
  it('renders the Osis-family compositional ladder', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('id="osis-branch"');
    expect(res.text).toMatch(/Reading a branch: the Osis family/);
    // The three operator steps, in order.
    expect(res.text).toMatch(/miraging Osis/);
    expect(res.text).toMatch(/whirling Osis/);
    expect(res.text).toMatch(/gyro Torque/);
    for (const slug of ['osis', 'torque', 'blender', 'mobius']) {
      expect(res.text, `ladder link ${slug}`).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });

  it('strips internal governance citations from the whole page (incl. the dropped provenance column)', async () => {
    // The formula-table Provenance column was removed (its strings were internal
    // audit notes saturated with code symbols, file names, and ruling labels). The
    // clean ADD math stays in the Breakdown column. The page must now carry no such
    // internal jargon anywhere.
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).not.toMatch(/TBD pending Wave 2/);
    expect(res.text).not.toMatch(/prior paradox-implication retired/);
    expect(res.text).not.toMatch(/prior paradox-atomic reading retired/);
    expect(res.text).not.toMatch(/Settled by pt11\./);
    expect(res.text).not.toMatch(/Settled by Red 2026-05-15:/);
    // Provenance-column leakage is gone page-wide: no ruling labels, sprint/pt tags,
    // code-symbol names, or source-file references reach the rendered page.
    expect(res.text).not.toMatch(/Red ruling/i);
    expect(res.text).not.toMatch(/per Red\b/);
    expect(res.text).not.toMatch(/\bpt\d+\b/);
    expect(res.text).not.toContain('COMPOSITE_DERIVATIONS');
    expect(res.text).not.toContain('FIRST_CLASS_ROTATIONAL_BASES');
    expect(res.text).not.toMatch(/freestyleSymbolicEquivalences\.ts/);
    expect(res.text).not.toContain('resolved-formula-provenance');
  });

  it('renames internal-sounding section titles', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('Common formula patterns');
    expect(res.text).not.toContain('Settled compound formula reference');
    expect(res.text).toContain('>Edge cases</h3>');
    expect(res.text).not.toContain('Edge cases mentioned briefly');
  });
});
