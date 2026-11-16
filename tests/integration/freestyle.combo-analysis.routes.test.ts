/**
 * Integration tests for GET /freestyle/combo-analysis.
 *
 * The run-level page parallel to ADD Analysis: the run-quality terms, five
 * worked combos, and further reading. Page copy only; no database seeding
 * beyond the schema.
 *
 * Verifies:
 *   - the route renders its three sections, in order, with their anchors
 *   - the run-quality table keeps the per-row anchors the glossary links into
 *   - the five worked examples render in order
 *   - every same-page link lands on an element the page renders
 *   - the further-reading links point at pages that exist
 *   - no unreproducible statistic or prescriptive framing appears
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3120');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  // Page is pure page copy; a schema-loaded DB is sufficient.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/combo-analysis — route + page structure', () => {
  it('renders its three sections in order, each with its anchor', async () => {
    const res = await page('/freestyle/combo-analysis');
    expect(res.status).toBe(200);
    let lastIdx = -1;
    for (const id of ['run-quality', 'worked-examples', 'further-reading']) {
      const idx = res.text.indexOf(`id="${id}"`);
      expect(idx, `Missing or out-of-order section: ${id}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('renders breadcrumbs back to /freestyle', async () => {
    const res = await page('/freestyle/combo-analysis');
    expect(res.text).toContain('href="/freestyle"');
  });

  it('every same-page link lands on an element the page renders', async () => {
    // Defect caught: a link inside the page points at a section that was cut,
    // so following it goes nowhere.
    const res = await page('/freestyle/combo-analysis');
    const fragments = [...res.text.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
    for (const id of fragments) {
      expect(res.text, `no element carries id="${id}"`).toContain(`id="${id}"`);
    }
  });
});

describe('GET /freestyle/combo-analysis — run-quality table', () => {
  it('renders the 12 run-quality + format + concept entries with anchor ids', async () => {
    const res = await page('/freestyle/combo-analysis');
    const expectedAnchors = [
      'run-quality-tiltless', 'run-quality-guiltless', 'run-quality-tripless',
      'run-quality-fearless', 'run-quality-beastly', 'run-quality-godly',
      'run-quality-genuine', 'run-quality-bop',
      'format-sick3', 'format-shred-30',
      'concept-density', 'concept-run',
    ];
    for (const id of expectedAnchors) {
      expect(res.text, `Missing run-quality anchor: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('BOP entry names Butterfly + Osis + Paradox Mirage', async () => {
    const res = await page('/freestyle/combo-analysis');
    expect(res.text).toMatch(/Butterfly,\s*Osis,\s*Paradox Mirage/);
  });
});

describe('GET /freestyle/combo-analysis — worked examples', () => {
  it('renders all 5 worked-example anchors in canonical order', async () => {
    const res = await page('/freestyle/combo-analysis');
    const expected = [
      'example-canonical-pair',
      'example-walking-ladder',
      'example-cross-family-launch',
      'example-difficulty-stacking',
      'example-breadth-via-length',
    ];
    let lastIdx = -1;
    for (const id of expected) {
      const idx = res.text.indexOf(`id="${id}"`);
      expect(idx, `Missing worked-example anchor: ${id}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('canonical-pair example keeps the blurry whirl → whirl diagram but drops the frequency count', async () => {
    const res = await page('/freestyle/combo-analysis');
    const exampleIdx = res.text.indexOf('id="example-canonical-pair"');
    const nextIdx    = res.text.indexOf('id="example-walking-ladder"');
    expect(exampleIdx).toBeGreaterThan(0);
    const slice = res.text.slice(exampleIdx, nextIdx);
    expect(slice).toMatch(/blurry whirl[\s\S]{0,60}whirl/);
    expect(slice).not.toMatch(/17/);
    expect(slice).not.toMatch(/most common two-trick transition/);
  });

  it('breadth example keeps the long chain but drops the corpus-maximum magnitude claim', async () => {
    const res = await page('/freestyle/combo-analysis');
    const exampleIdx = res.text.indexOf('id="example-breadth-via-length"');
    expect(exampleIdx).toBeGreaterThan(0);
    const slice = res.text.slice(exampleIdx, res.text.indexOf('id="further-reading"'));
    expect(slice).toMatch(/butterfly[\s\S]{0,40}whirl[\s\S]{0,40}osis/);
    expect(slice).not.toMatch(/22 ADD/);
    expect(slice).not.toMatch(/corpus maximum/i);
    expect(slice).not.toMatch(/Greg Solis/);
  });
});

describe('GET /freestyle/combo-analysis — further reading', () => {
  it('links ADD Analysis, the Trick Dictionary and Freestyle History', async () => {
    const res = await page('/freestyle/combo-analysis');
    const reading = res.text.slice(res.text.indexOf('id="further-reading"'));
    expect(reading).toContain('href="/freestyle/add-analysis"');
    expect(reading).toContain('href="/freestyle/tricks"');
    expect(reading).toContain('href="/freestyle/history"');
  });
});

describe('GET /freestyle/combo-analysis — reproducibility discipline', () => {
  it('contains none of the unreproducible exact statistics', async () => {
    const res = await page('/freestyle/combo-analysis');
    const forbidden = [
      '395', '22 years', '22-ADD', '22 ADD',
      '0.695', '0.863', '0.126',
      'out-degree', 'in-degree', 'hub score', 'authority score', 'PageRank',
      'corpus maximum', 'Greg Solis', 'Brad Nelson',
      '≥5.0', '≤3.5', '17 documented',
    ];
    for (const phrase of forbidden) {
      expect(
        res.text.includes(phrase),
        `Unreproducible figure present on the page: "${phrase}"`,
      ).toBe(false);
    }
  });

  it('does not substitute the distinct historical Sick 3 corpus figures', async () => {
    const res = await page('/freestyle/combo-analysis');
    for (const phrase of ['308', '117 normalized', '94%', '17-ADD']) {
      expect(
        res.text.includes(phrase),
        `Historical Sick 3 substitution present: "${phrase}"`,
      ).toBe(false);
    }
  });
});

describe('GET /freestyle/combo-analysis — wording discipline', () => {
  it('never uses prescriptive "is wrong" / "incorrect" framing on documented patterns', async () => {
    const res = await page('/freestyle/combo-analysis');
    const forbidden = [
      'is wrong',
      'incorrect',
      'must use',
      'should always',
    ];
    for (const phrase of forbidden) {
      expect(
        res.text.toLowerCase().includes(phrase.toLowerCase()),
        `Forbidden phrase appeared: "${phrase}"`,
      ).toBe(false);
    }
  });
});

describe('Inbound links to the analysis pages', () => {
  it('Concepts links to both analysis pages, so neither depends on a landing tile', async () => {
    // The landing carries no tile for either page; Concepts is where a reader
    // following difficulty or run vocabulary finds them.
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/combo-analysis"');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });
});
