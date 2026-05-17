/**
 * Integration tests for Slice C of the 2026-05 dictionary/glossary
 * normalization plan — glossary content expansion.
 *
 * Long-term contract pinned:
 *
 *   §3 (Dexterities): adds a "Direction" subsection with in-dex / out-dex
 *      vocabulary. Pairs with set primitives (pixie/quantum vs atomic/fairy).
 *
 *   §7 (Symbolic Notation): opens with a visible glyph quick-reference
 *      strip rendered from content.operatorBoard.tiers (three tiers,
 *      one cell per operator).
 *
 *   §8 (Composition & Decomposition): adds a walking-family progression
 *      callout with seven canonical compounds branching off the butterfly
 *      base.
 *
 *   §9 (Movement Topologies): section intro explicitly frames the panels
 *      as a representative selection, not comprehensive coverage.
 *
 *   §12 (Sources): names six source families (footbag.org / PassBack /
 *      footbagmoves.com / AnzTrikz / TT YouTube / WFA-NHSA historical)
 *      with no individual contributors named inline.
 *
 *   Landing page: the "Educational pathways →" chip is removed from the
 *      Tutorials & Learning card. The /freestyle/learn route remains
 *      reachable from other surfaces (modifier-family, symbolic-discoverability).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3099');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Glossary §3 — Direction subsection (Slice C)', () => {
  it('renders the in-dex term anchor and definition', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="term-in-dex"');
    expect(res.text).toMatch(/In-dex/);
  });

  it('renders the out-dex term anchor and definition', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="term-out-dex"');
    expect(res.text).toMatch(/Out-dex/);
  });

  it('positions the Direction subsection between Motion style and Execution window', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const motionIdx    = res.text.indexOf('>Motion style<');
    const directionIdx = res.text.indexOf('>Direction<');
    const windowIdx    = res.text.indexOf('>Execution window<');
    expect(motionIdx).toBeGreaterThan(0);
    expect(directionIdx).toBeGreaterThan(motionIdx);
    expect(windowIdx).toBeGreaterThan(directionIdx);
  });
});

describe('Glossary §7 — visible glyph quick-reference (Slice C)', () => {
  it('renders the glyph quick-reference container at the top of §7', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="glossary-glyph-quickref"');
  });

  it('renders all three operator-board tier strips inside the quick-reference', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-glyph-quickref-tier--set');
    expect(res.text).toContain('glossary-glyph-quickref-tier--body');
    expect(res.text).toContain('glossary-glyph-quickref-tier--structural');
  });

  it('renders the key operator glyphs inside the quick-reference', async () => {
    // Spot-check a representative glyph from each tier. The exact count is
    // operator-board-cell-count (13 post-Slice-B), pinned in the portal
    // test file; here we just verify the cohort is present.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/glossary-glyph-quickref-glyph">PIX</);
    expect(res.text).toMatch(/glossary-glyph-quickref-glyph">SPIN</);
    expect(res.text).toMatch(/glossary-glyph-quickref-glyph">XDEX</);
  });

  it('positions the quick-reference BEFORE the prose explainer', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const quickrefIdx = res.text.indexOf('class="glossary-glyph-quickref"');
    const proseIdx    = res.text.indexOf('The longer you stack operators on a base');
    expect(quickrefIdx).toBeGreaterThan(0);
    expect(proseIdx).toBeGreaterThan(quickrefIdx);
  });
});

describe('Glossary §8 — walking-family progression (Slice C)', () => {
  it('renders the walking-family progression heading and anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="walking-family-progression"');
    expect(res.text).toMatch(/Walking-family progression/);
  });

  it('renders all seven canonical compounds with detail-page links', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const compounds = [
      'butterfly', 'ripwalk', 'dimwalk', 'sidewalk',
      'dada-curve', 'matador', 'phoenix',
    ];
    for (const slug of compounds) {
      expect(
        res.text,
        `walking-family progression missing link for ${slug}`,
      ).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });

  it('renders the compositional formula next to each non-base compound', async () => {
    // Slice L-polish (2026-05-16): walking-family formulas are now
    // token-colored — each word renders inside <span class="notation-token
    // notation-...">; markup interleaves between tokens. Match token-by-
    // token rather than contiguous-substring.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/notation-token[^>]*>stepping<[\s\S]*?notation-token[^>]*>butterfly</);
    expect(res.text).toMatch(/notation-token[^>]*>pixie<[\s\S]*?notation-token[^>]*>butterfly</);
    expect(res.text).toMatch(/notation-token[^>]*>stepping<[\s\S]*?notation-token[^>]*>near<[\s\S]*?notation-token[^>]*>butterfly</);
    expect(res.text).toMatch(/notation-token[^>]*>miraging<[\s\S]*?notation-token[^>]*>far<[\s\S]*?notation-token[^>]*>symposium<[\s\S]*?notation-token[^>]*>butterfly</);
    expect(res.text).toMatch(/notation-token[^>]*>nuclear<[\s\S]*?notation-token[^>]*>butterfly</);
    expect(res.text).toMatch(/notation-token[^>]*>pixie<[\s\S]*?notation-token[^>]*>ducking<[\s\S]*?notation-token[^>]*>butterfly</);
  });
});

describe('Glossary §9 — representative-selection framing (Slice C)', () => {
  it('renders the "representative selection, not comprehensive" framing', async () => {
    // Slice K (2026-05-16) strengthened the framing: "not a comprehensive
    // topology atlas" replaced the bare "not comprehensive" phrasing; the
    // section is also explicitly marked "intentionally incomplete".
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/representative selection/i);
    expect(res.text).toMatch(/not a comprehensive|intentionally incomplete/i);
  });
});

describe('Glossary §12 — named source families (Slice C)', () => {
  it('renders the source-families list', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-sources-list"');
  });

  it('names the six source families inline', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('footbag.org');
    expect(res.text).toContain('PassBack');
    expect(res.text).toContain('footbagmoves.com');
    expect(res.text).toContain('AnzTrikz');
    expect(res.text).toMatch(/Tricks of the Trade/);
    expect(res.text).toMatch(/WFA|NHSA/);
  });
});

describe('Landing page — Educational Pathways chip removed (Slice C)', () => {
  it('does NOT render the "Educational pathways" chip on the landing Tutorials card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.status).toBe(200);
    // The chip text and its specific landing-card hyperlink form are both gone.
    expect(res.text).not.toContain('Educational pathways &rarr;');
    expect(res.text).not.toMatch(/<a href="\/freestyle\/learn" class="btn btn-outline">/);
  });

  it('still renders the curated-tutorial chips on the landing Tutorials card', async () => {
    // Regression guard: removing the Educational pathways chip must not
    // disturb the surrounding curated-tutorial-series chips.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/media/gallery_tricks_of_the_trade');
    expect(res.text).toContain('/media/gallery_passback_tutorials');
    expect(res.text).toContain('/media/gallery_anz_trikz');
  });
});
