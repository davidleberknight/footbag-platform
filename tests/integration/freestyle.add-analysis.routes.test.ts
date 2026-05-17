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
  it('renders all 9 component classes', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const components = [
      'A stall on a recognized catch surface',
      'A dexterity (one bag-foot interaction)',
      'A specialized surface',
      'Paradox / ducking / symposium / spinning / stepping',
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
  it('renders all 8 worked examples with the canonical-first ordering', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const examples = [
      'Clipper',
      'Mirage',
      'Whirl',
      'Butterfly',
      'Osis',
      'Torque',
      'Blurry Whirl',
      'Mobius',
    ];
    let lastIdx = -1;
    for (const e of examples) {
      // Search within the worked-examples section by anchoring on the
      // section heading first.
      const sectionStart = res.text.indexOf('id="worked-examples"');
      const sectionEnd = res.text.indexOf('id="discrepancies"');
      const slice = res.text.substring(sectionStart, sectionEnd);
      const idx = slice.indexOf(e);
      expect(idx, `Worked example ${e} not found`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('worked examples link to the trick-detail page when slug is known', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    const expectedLinks = [
      'href="/freestyle/tricks/clipper"',
      'href="/freestyle/tricks/mirage"',
      'href="/freestyle/tricks/whirl"',
      'href="/freestyle/tricks/butterfly"',
      'href="/freestyle/tricks/osis"',
      'href="/freestyle/tricks/torque"',
      'href="/freestyle/tricks/blurry-whirl"',
      'href="/freestyle/tricks/mobius"',
    ];
    for (const link of expectedLinks) {
      expect(res.text, `Missing cross-link: ${link}`).toContain(link);
    }
  });

  it('worked examples carry their ADD label', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // The ADD label sits inside the example heading after the trick name,
    // separated by some markup. Use [\s\S] (DOTALL-equivalent) and a wider
    // window to tolerate the surrounding spans + class attributes.
    expect(res.text).toMatch(/Clipper<\/a>[\s\S]{0,200}1 ADD/);
    expect(res.text).toMatch(/Mobius<\/a>[\s\S]{0,200}5 ADD/);
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
    const res = await request(createApp()).get('/freestyle/tricks');
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
