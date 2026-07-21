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
    expect(res.text).toContain('Combo Analysis');
    expect(res.text).toMatch(/How freestyle tricks connect into longer flowing/);
  });

  it('renders all 8 sections in canonical order', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const sections = [
      'id="philosophy"',
      'id="run-quality"',
      'Sequence architecture',
      'Difficulty architecture',
      'id="worked-examples"',
      'id="transition-topology"',
      'id="caveats"',
      'id="further-reading"',
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

  it('names whirl as the leading closer and blurry whirl as the leading opener, without magnitudes', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/Whirl frequently functions as a closing trick/);
    expect(res.text).toMatch(/Blurry whirl commonly appears as an opening trick/);
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

  it('describes concentration and breadth qualitatively, without named-chain magnitude claims', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/depth.{0,40}approach/);
    expect(res.text).toMatch(/length.{0,40}approach/);
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

  it('canonical-pair example keeps the blurry whirl → whirl diagram but drops the frequency count', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const exampleIdx = res.text.indexOf('id="example-canonical-pair"');
    const nextIdx    = res.text.indexOf('id="example-walking-ladder"');
    expect(exampleIdx).toBeGreaterThan(0);
    const slice = res.text.slice(exampleIdx, nextIdx);
    expect(slice).toMatch(/blurry whirl\s*&rArr;?\s*\n?\s*whirl|blurry whirl[\s\S]{0,60}whirl/);
    expect(slice).not.toMatch(/17/);
    expect(slice).not.toMatch(/most common two-trick transition/);
  });

  it('breadth example keeps the long chain but drops the corpus-maximum magnitude claim', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const exampleIdx = res.text.indexOf('id="example-breadth-via-length"');
    expect(exampleIdx).toBeGreaterThan(0);
    const sliceEnd   = res.text.indexOf('id="transition-topology"');
    const slice      = res.text.slice(exampleIdx, sliceEnd);
    expect(slice).toMatch(/butterfly[\s\S]{0,40}whirl[\s\S]{0,40}osis/);
    expect(slice).not.toMatch(/22 ADD/);
    expect(slice).not.toMatch(/corpus maximum/i);
    expect(slice).not.toMatch(/Greg Solis/);
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
  it('renders the scope + coverage caveats without a corpus size or date span', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/archival sample of ADD-scored/);
    expect(res.text).toMatch(/European competition is more heavily represented/);
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

describe('GET /freestyle/combo-analysis — reproducibility discipline', () => {
  it('contains none of the unreproducible exact statistics', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
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
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    for (const phrase of ['308', '117 normalized', '94%', '17-ADD']) {
      expect(
        res.text.includes(phrase),
        `Historical Sick 3 substitution present: "${phrase}"`,
      ).toBe(false);
    }
  });

  it('retains the reproducible qualitative findings', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/Blurry whirl commonly appears as an opening trick/);
    expect(res.text).toMatch(/Whirl frequently functions as a closing trick/);
    expect(res.text).toMatch(/Dimwalk often connects different parts of a combination/);
  });

  it('states the page scope: an educational analysis of an archival sample, not a census', async () => {
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    expect(res.text).toMatch(/educational analysis/);
    expect(res.text).toMatch(/archival sample/);
    expect(res.text).toMatch(/not a complete census/);
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

describe('Landing portal-card inbound link to combo-analysis', () => {
  it('freestyle landing portal-cards grid links to /freestyle/combo-analysis', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/combo-analysis"');
  });

  it('add-analysis and combo-analysis co-locate inside exactly one Go Deeper card', async () => {
    // Structural invariant (Phase C, 2026-05-22): the two-band landing
    // groups /freestyle/add-analysis and /freestyle/combo-analysis into a
    // single "Scoring & Combos" Go Deeper card. Splitting on
    // `<div class="card` yields one chunk per card; exactly one chunk
    // must contain both hrefs.
    const res = await request(createApp()).get('/freestyle');
    const cards = res.text.split('<div class="card');
    const cardsWithBoth = cards.filter(
      (c) =>
        c.includes('href="/freestyle/add-analysis"') &&
        c.includes('href="/freestyle/combo-analysis"'),
    );
    expect(cardsWithBoth).toHaveLength(1);
  });
});
