/**
 * Integration tests for GET /freestyle/combo-analysis.
 *
 * Educational sequence-level page parallel to ADD Analysis. Pure curator
 * content; no DB seeding required beyond schema bootstrap. Mirrors
 * tests/integration/freestyle.add-analysis.routes.test.ts conventions.
 *
 * Verifies:
 *   - Route returns 200
 *   - All 8 sections render with anchor ids (§1-§8)
 *   - Run-quality table renders with per-row anchors
 *   - Sequence-architecture + Difficulty-architecture terms render with anchors
 *   - All 5 worked examples render with concept cross-links
 *   - Topology patterns render
 *   - Caveats render
 *   - Cross-links to ADD Analysis, history, tricks, glossary, insights present
 *   - Lexicon discipline — no "should be"/"is wrong"/"incorrect" framing
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3120');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // Page is pure curator content; schema-loaded DB is sufficient.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/combo-analysis — route + page structure', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.status).toBe(200);
  });

  it('renders the page title + intro', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toContain('Combo &amp; Run Architecture');
    expect(res.text).toMatch(/How freestyle sequences are built/);
  });

  it('renders all 8 section h2 headings in canonical order', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const sections = [
      '1. Philosophy',
      '2. Run-quality terminology',
      'Sequence architecture',
      'Difficulty architecture',
      '5. Worked examples',
      '6. Transition topology',
      '7. Honesty',
      'Further reading',
    ];
    let lastIdx = -1;
    for (const heading of sections) {
      const idx = res.text.indexOf(heading);
      expect(idx, `Missing heading: ${heading}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('exposes anchor ids for the 8 main sections', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    for (const id of [
      'philosophy',
      'run-quality',
      'sequence-architecture',
      'difficulty-architecture',
      'worked-examples',
      'transition-topology',
      'caveats',
      'further-reading',
    ]) {
      expect(res.text, `Missing section anchor: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('renders breadcrumbs back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toContain('href="/freestyle"');
  });
});

describe('GET /freestyle/combo-analysis — §2 run-quality table', () => {
  it('renders the 12 run-quality + format + concept entries with anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
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
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/Butterfly,\s*Osis,\s*Paradox Mirage/);
  });
});

describe('GET /freestyle/combo-analysis — §3 sequence architecture', () => {
  it('renders all 9 sequence-architecture terms with anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const expectedAnchors = [
      'setup-trick', 'resolution-trick', 'launch-node', 'attractor',
      'throughput-trick', 'sink', 'pure-terminus', 'stabilization',
      'recovery-trick',
    ];
    for (const id of expectedAnchors) {
      expect(res.text, `Missing sequence-arch term anchor: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('names whirl as the corpus attractor + blurry whirl as the corpus launch node', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    // Apostrophe in "corpus's" renders as `&#x27;`; allow ~30 chars between
    // "corpus" and "strongest" to absorb the entity + intervening words.
    expect(res.text).toMatch(/Whirl is the corpus.{0,30}strongest attractor/);
    expect(res.text).toMatch(/Blurry whirl is the corpus.{0,30}strongest launch node/);
  });
});

describe('GET /freestyle/combo-analysis — §4 difficulty architecture', () => {
  it('renders all 7 difficulty-architecture terms with anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const expectedAnchors = [
      'concentration-strategy', 'breadth-strategy', 'per-trick-density',
      'sequence-risk', 'difficulty-stacking', 'additive-layering',
      'difficulty-plateau',
    ];
    for (const id of expectedAnchors) {
      expect(res.text, `Missing difficulty-arch term anchor: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('concentration vs breadth examples reference Brad Nelson and Greg Solis chains', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/Brad Nelson/);
    expect(res.text).toMatch(/Greg Solis/);
  });
});

describe('GET /freestyle/combo-analysis — §5 worked examples', () => {
  it('renders all 5 worked-example anchors in canonical order', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
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

  it('canonical-pair example carries the blurry whirl → whirl diagram + 17× corpus note', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const exampleIdx = res.text.indexOf('id="example-canonical-pair"');
    const nextIdx    = res.text.indexOf('id="example-walking-ladder"');
    expect(exampleIdx).toBeGreaterThan(0);
    const slice = res.text.slice(exampleIdx, nextIdx);
    expect(slice).toMatch(/blurry whirl\s*&rArr;?\s*\n?\s*whirl|blurry whirl[\s\S]{0,60}whirl/);
    expect(slice).toMatch(/17/);
  });

  it('Solis 22-ADD example surfaces the 7-trick breakdown + corpus-maximum framing', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const exampleIdx = res.text.indexOf('id="example-breadth-via-length"');
    expect(exampleIdx).toBeGreaterThan(0);
    const sliceEnd   = res.text.indexOf('id="transition-topology"');
    const slice      = res.text.slice(exampleIdx, sliceEnd);
    expect(slice).toMatch(/22 ADD/);
    expect(slice).toMatch(/7 tricks/);
    expect(slice).toMatch(/corpus maximum/i);
    expect(slice).toMatch(/butterfly[\s\S]{0,40}whirl[\s\S]{0,40}osis/);
  });

  it('each worked example carries concept cross-links into §3/§4', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    // Concept cross-links render as #anchor-id hrefs to §3/§4 terms.
    expect(res.text).toMatch(/href="#launch-node"/);
    expect(res.text).toMatch(/href="#attractor"/);
    expect(res.text).toMatch(/href="#concentration-strategy"/);
    expect(res.text).toMatch(/href="#breadth-strategy"/);
    expect(res.text).toMatch(/href="#recovery-trick"/);
  });
});

describe('GET /freestyle/combo-analysis — §6 transition topology', () => {
  it('renders all 6 topology patterns with anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const expectedAnchors = [
      'topology-asymmetric-flow', 'topology-rotational-cluster',
      'topology-walking-transitions', 'topology-clipper-stabilization',
      'topology-ducking-chains', 'topology-paradox-chains',
    ];
    for (const id of expectedAnchors) {
      expect(res.text, `Missing topology anchor: ${id}`).toContain(`id="${id}"`);
    }
  });
});

describe('GET /freestyle/combo-analysis — §7 caveats + §8 cross-links', () => {
  it('renders the corpus-coverage caveats', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/Sick3.{0,30}corpus/);
    expect(res.text).toMatch(/European competition dominates/);
    expect(res.text).toMatch(/community conventions/);
  });

  it('renders the cross-links inventory', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
    expect(res.text).toContain('href="/freestyle/history"');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/insights"');
  });
});

describe('GET /freestyle/combo-analysis — wording discipline', () => {
  it('never uses prescriptive "is wrong" / "incorrect" framing on documented patterns', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
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

describe('Landing portal-card inbound link to combo-analysis (2026-05-17)', () => {
  it('freestyle landing portal-cards grid links to /freestyle/combo-analysis', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/combo-analysis"');
  });

  it('the three analytical-surface hrefs co-locate inside exactly one portal card', async () => {
    // Structural invariant: /freestyle/history, /freestyle/add-analysis,
    // and /freestyle/combo-analysis are grouped into a single portal-card
    // boundary on the landing. Splitting on `<div class="card` yields one
    // chunk per card; exactly one chunk must contain all three hrefs.
    const res = await request(createApp()).get('/freestyle');
    const cards = res.text.split('<div class="card');
    const cardsWithAllThree = cards.filter(
      (c) =>
        c.includes('href="/freestyle/history"') &&
        c.includes('href="/freestyle/add-analysis"') &&
        c.includes('href="/freestyle/combo-analysis"'),
    );
    expect(cardsWithAllThree).toHaveLength(1);
  });
});
