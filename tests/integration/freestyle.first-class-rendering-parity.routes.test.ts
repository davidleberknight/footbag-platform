/**
 * Integration tests for first-class trick rendering parity.
 *
 * Audit task: the /freestyle/tricks listing must render every entry in
 * PILOT_FIRST_CLASS_SLUGS with osis-level parity where authoritative
 * data exists, and surface an honest incomplete-state when the upstream
 * Job notation is genuinely absent.
 *
 * Cohort (PILOT_FIRST_CLASS_SLUGS, freestyleService.ts):
 *   osis, paradox-mirage, symposium-mirage, atomic-butterfly, ripwalk
 *
 * Two contracts verified here:
 *
 * 1) Tautological-chain suppression. The freestyleSymbolicEquivalences
 *    registry holds 28 chain entries whose `readings` field is the
 *    canonical name in lowercase form (paradox-mirage → "paradox
 *    mirage"). The shaper now filters these out so the ≡ chain row
 *    no longer renders an information-free line on a card titled with
 *    the same text.
 *
 * 2) Honest incomplete-state for first-class slugs missing op-notation.
 *    For first-class compounds with no curator-authored
 *    `freestyle_tricks.operational_notation` and no atomic flag-
 *    decomposition chain (paradox-mirage, symposium-mirage,
 *    atomic-butterfly, ripwalk on this branch), the first-class
 *    summary partial renders an explicit "JOB: notation pending"
 *    muted line rather than silently hiding the row.
 *
 * The osis card is the golden example: it carries curator op-notation
 * (via CORE_TRICK_SPEC) AND an atomic flag-decomposition, so both the
 * JOB and ADD rows in its first-class summary are populated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3157');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed the five first-class cohort + their base atoms. ADD values
  // and the notation column for osis follow live DB values verified
  // by sqlite3 inspection.
  insertFreestyleTrick(db, { slug: 'osis',             canonical_name: 'osis',             adds: '3', base_trick: 'osis',      trick_family: 'osis',      category: 'compound', notation: 'OSIS' });
  insertFreestyleTrick(db, { slug: 'paradox-mirage',   canonical_name: 'paradox mirage',   adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium-mirage', canonical_name: 'symposium mirage', adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'atomic-butterfly', canonical_name: 'atomic butterfly', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',          canonical_name: 'ripwalk',          adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', notation: 'STEPPING BUTTERFLY' });
  // Base atoms (needed for any family-link rendering)
  insertFreestyleTrick(db, { slug: 'mirage',           canonical_name: 'mirage',           adds: '2', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'butterfly',        canonical_name: 'butterfly',        adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Extract a single dictionary-trick-card's HTML from the rendered page
// so each assertion scopes to one card and not the whole document.
function cardFor(slug: string, html: string): string {
  const startMarker = `data-trick-slug="${slug}"`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) throw new Error(`card not found: ${slug}`);
  // Walk back to the enclosing <article> open
  const articleOpen = html.lastIndexOf('<article', startIdx);
  // Find the matching close
  const articleClose = html.indexOf('</article>', startIdx);
  return html.slice(articleOpen, articleClose + '</article>'.length);
}

describe('First-class rendering parity — osis golden', () => {
  it('osis renders JOB + ADD rows in the first-class summary', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const card = cardFor('osis', res.text);
    // First-class summary row present
    expect(card).toContain('dict-card-first-class-row');
    // JOB row carries curator-authored operational chain
    expect(card).toMatch(/JOB:[\s\S]+\[set\][\s\S]+spin/);
    // ADD row carries atomic flag-decomposition
    expect(card).toContain('spin(1) + xbod(1) + stall(1) &#x3D; 3 ADD');
    // NOT in incomplete-state
    expect(card).not.toContain('dict-card-first-class-line--incomplete');
    expect(card).not.toContain('notation pending');
  });
});

describe('First-class rendering parity — tautological-chain suppression', () => {
  it('paradox-mirage no longer renders a tautological ≡ chain reading', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor('paradox-mirage', res.text);
    // The chain reading "paradox mirage" must NOT appear inside the
    // dict-card-equivalence (chain row). It may legitimately appear
    // in the title, but not as a ≡ reading.
    expect(card).not.toMatch(
      /<span class="core-trick-equivalence dict-card-equivalence[^>]*">\s*<span class="core-trick-equiv-sigil">[^<]*<\/span>\s*<a[^>]*data-token-slug="paradox"[^>]*>paradox<\/a>\s*<a[^>]*data-token-slug="mirage"[^>]*>mirage<\/a>/,
    );
  });

  it('symposium-mirage no longer renders a tautological ≡ chain reading', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor('symposium-mirage', res.text);
    expect(card).not.toMatch(/data-token-slug="symposium"[\s\S]+data-token-slug="mirage"/);
  });

  it('atomic-butterfly no longer renders a tautological ≡ chain reading', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor('atomic-butterfly', res.text);
    expect(card).not.toMatch(/data-token-slug="atomic"[\s\S]+data-token-slug="butterfly"/);
  });
});

describe('First-class rendering parity — informative chain preserved', () => {
  it('ripwalk preserves its non-tautological folk-name chain (stepping butterfly)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor('ripwalk', res.text);
    // Folk-name resolution is legitimate: canonical "ripwalk" ≢
    // structural form "stepping butterfly". Chain row should still
    // surface tokens for stepping + butterfly.
    expect(card).toMatch(/data-token-slug="stepping"/);
    expect(card).toMatch(/data-token-slug="butterfly"/);
  });
});

describe('First-class rendering parity — honest incomplete-state', () => {
  it.each([
    ['paradox-mirage',   'paradox(+1) + mirage(2) &#x3D; 3 ADD'],
    ['symposium-mirage', 'symposium(+1) + mirage(2) &#x3D; 3 ADD'],
    ['atomic-butterfly', 'atomic(+1) + butterfly(3) &#x3D; 4 ADD'],
    ['ripwalk',          'stepping(+1) + butterfly(3) &#x3D; 4 ADD'],
  ])('%s renders ADD breakdown + honest "JOB: notation pending" line', async (slug, expectedAddText) => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor(slug, res.text);
    // Honest incomplete-state line for missing Job notation
    expect(card).toContain('dict-card-first-class-line--incomplete');
    expect(card).toContain('notation pending');
    // ADD breakdown rendered (authoritative data wired through)
    expect(card).toContain(expectedAddText);
  });
});

describe('First-class rendering parity — no fake formulas, no pending pill', () => {
  it('none of the first-class slugs render the pendingDecomposition pill', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    for (const slug of ['osis', 'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk']) {
      const card = cardFor(slug, res.text);
      expect(card).not.toContain('dict-card-pending-pill');
      expect(card).not.toContain('pending decomposition refinement');
    }
  });

  it('first-class cards never substitute the canonical name as a fake Job line', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // Look at the four compounds whose Job notation is genuinely absent.
    // Their first-class summary partial must not render a JOB row with a
    // <code> value (which would mean a curator-published chain). It must
    // only render the muted incomplete-state line. The 'JOB:' label
    // appears on the incomplete line, so we check that no curator-style
    // <code> follows JOB: in the chain position.
    for (const slug of ['paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk']) {
      const card = cardFor(slug, res.text);
      // The literal canonical name must NOT appear as the JOB value
      // in a curator-style <code class="dict-card-first-class-value">
      // element. (The title is a separate element.)
      expect(card).not.toMatch(new RegExp(`<code class="dict-card-first-class-value">${slug.replace(/-/g, ' ')}</code>`, 'i'));
    }
  });

  it('osis JOB-row source is the curator content module, not a derived stub', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor('osis', res.text);
    // The osis atomic flag-decomposition is curator-authored
    // ('[set] > (downtime) spin > ss clipper'). The Job row in
    // the first-class summary must carry this verbatim.
    expect(card).toContain('[set] &gt; (downtime) spin &gt; ss clipper');
  });
});

describe('First-class rendering parity — slug/alias variations do not suppress data', () => {
  it('ripwalk renders its ADD breakdown even though notation column ("STEPPING BUTTERFLY") shadows the canonical name', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = cardFor('ripwalk', res.text);
    // Ripwalk has notation="STEPPING BUTTERFLY" in the DB. The ADD
    // breakdown from RESOLVED_FORMULAS must still wire through; an
    // earlier shaping path that compared notation against canonical
    // name could in theory miscategorize ripwalk. Assert the data
    // survives all the way to render.
    expect(card).toContain('stepping(+1) + butterfly(3) &#x3D; 4 ADD');
  });
});
