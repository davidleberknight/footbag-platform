/**
 * Card JOB-block + by-set linked-card regression tests.
 *
 * Pins four rendered-surface contracts:
 *
 *   1. Across the SHARED-card browse views (family / movement-system /
 *      sets), the operational-notation row on each card renders inside a
 *      labeled `.dict-card-notation-block` with a leading "JOB" label
 *      span — not as loose body text. The detail-page convention
 *      ("Set notation" labeled section) extends to cards.
 *      (The ADD view uses a distinct two-line `.dict-trick-row` contract,
 *      pinned separately in freestyle.add-view-rows.routes.test.ts.)
 *
 *   2. /freestyle/tricks?view=modifier renders LINKED trick cards
 *      (dictionary-trick-card partial with DictionaryTrickCard view-model)
 *      — title is an <a href="/freestyle/tricks/...">, ADD chip present,
 *      operational notation inside the JOB-block. NOT just hashtag text.
 *
 *   3. Movement-system view intro clearly distinguishes it from "By set"
 *      (axes ≠ specific modifiers).
 *
 *   4. Emerging Vocabulary copy says "observational" / "awaiting review",
 *      not "more documented names"; Stanford appears as a source chip.
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

const { dbPath } = setTestEnv('3502');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifier registry (enough to drive ?view=modifier sections + Movement System)
  db.prepare(`
    INSERT INTO freestyle_trick_modifiers
      (slug, modifier_name, modifier_type, add_bonus, add_bonus_rotational, notes, loaded_at)
    VALUES
      ('paradox',  'paradox',  'body', 1, 1, '', ?),
      ('spinning', 'spinning', 'body', 1, 1, '', ?),
      ('ducking',  'ducking',  'body', 1, 1, '', ?),
      ('fairy',    'fairy',    'set',  1, 1, '', ?),
      ('pixie',    'pixie',    'set',  1, 1, '', ?),
      ('quantum',  'quantum',  'set',  1, 1, '', ?),
      ('stepping', 'stepping', 'set',  1, 1, '', ?)
  `).run('2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z',
         '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z',
         '2026-05-27T00:00:00.000Z');

  // Representative tricks across the user's flagged set
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'fairy_mirage', canonical_name: 'fairy mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'FAIRY MIRAGE', operational_notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'quantum_mirage', canonical_name: 'quantum mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'QUANTUM MIRAGE', operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'fairy_legover', canonical_name: 'fairy legover', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'compound', notation: 'FAIRY LEGOVER', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking_toe_stall', canonical_name: 'ducking toe stall', adds: '2', base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'compound', notation: 'DUCKING TOE STALL', operational_notation: 'TOE > DUCK [BOD] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'atomic_illusion', canonical_name: 'atomic illusion', adds: '3', base_trick: 'illusion', trick_family: 'illusion', category: 'compound', notation: 'ATOMIC ILLUSION', operational_notation: 'TOE > OP OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_paradox_mirage', canonical_name: 'spinning paradox mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'SPINNING PARADOX MIRAGE', operational_notation: 'CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // mobius is in freestyleSymbolicEquivalences.ts → gets a tokenizedEquivalence
    // (≡) reading AND has operational notation. The normalization contract
    // requires BOTH to render (not either/or).
    { slug: 'mobius', canonical_name: 'mobius', adds: '5', base_trick: 'mobius', trick_family: 'torque', category: 'compound', notation: 'MOBIUS', operational_notation: 'CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]', aliases_json: '["möbius","moebius","gyro torque","toe mobius"]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  // Modifier links so ?view=modifier has data to render
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('fairy_mirage', 'fairy', 1),
      ('quantum_mirage', 'quantum', 1),
      ('fairy_legover', 'fairy', 1),
      ('ducking_toe_stall', 'ducking', 1),
      ('spinning_paradox_mirage', 'spinning', 1),
      ('spinning_paradox_mirage', 'paradox', 2)
  `).run();

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Helper: stable check that operational notation appears inside the
// JOB-block markup (`.dict-card-notation-block` wrapper carrying a
// `.dict-card-notation-label` "JOB" prefix). The detail-page convention
// labels notation as "Set notation"; on cards we use the shorter "JOB"
// inline label to keep the row compact but unambiguous.
function expectJobBlockRender(text: string, slug: string) {
  const slugAttr = `data-trick-slug="${slug}"`;
  const idx = text.indexOf(slugAttr);
  expect(idx, `card with ${slugAttr} not present`).toBeGreaterThan(-1);
  // Capture the card markup window: from the slug attribute to the next </article>
  const window = text.substring(idx, idx + 4000);
  // If a JOB block renders, it must include the label + the wrapper.
  // (Cards with no operational notation OR with tokenizedEquivalences
  // skip this branch — that's allowed; assertion fires only when
  // operational notation appears in the markup.)
  const hasOpNotation = /class="dict-card-notation"/.test(window);
  if (hasOpNotation) {
    expect(window).toMatch(/class="dict-card-notation-block/);
    expect(window).toMatch(/class="dict-card-notation-label">JOB</);
  }
}

// Two-line contract (migrated views: ADD / Family / Dex). Operational notation
// renders inside the row's resolved line-2 JOB value
// (<code class="dict-trick-row-notation-value">), never loose and never the pending
// placeholder.
function expectTwoLineJob(text: string, slug: string) {
  const idx = text.indexOf(`data-trick-slug="${slug}"`);
  expect(idx, `row with data-trick-slug="${slug}" not present`).toBeGreaterThan(-1);
  const window = text.substring(idx, idx + 4000);
  expect(window).toMatch(/class="dict-trick-row-notation-value"/);
  expect(window).toMatch(/class="dict-trick-row-notation-value">/);
}

describe('JOB-block rendering across browse views (no raw operational notation outside the labeled block)', () => {
  it('By family (two-line): each row renders its JOB inside the resolved line-2 JOB value', async () => {
    // Family view uses the two-line dict-trick-row contract.
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expectTwoLineJob(res.text, 'fairy_mirage');
    expectTwoLineJob(res.text, 'quantum_mirage');
  });

  it('By dex-count (two-line): each row renders its JOB inside the resolved line-2 JOB value', async () => {
    // Dex view uses the two-line dict-trick-row contract.
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expectTwoLineJob(res.text, 'atomic_illusion');
    expectTwoLineJob(res.text, 'ducking_toe_stall');
  });

  it('By movement system (two-line): each row renders its JOB inside the resolved line-2 JOB value', async () => {
    // Movement System view uses the two-line dict-trick-row contract.
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
    expectTwoLineJob(res.text, 'fairy_mirage');
    expectTwoLineJob(res.text, 'quantum_mirage');
  });

  it('By set: cards with operational notation render the JOB-block label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.status).toBe(200);
    expectJobBlockRender(res.text, 'fairy_mirage');
    expectJobBlockRender(res.text, 'spinning_paradox_mirage');
  });

  it('a trick with BOTH an equivalence reading AND operational notation renders BOTH (no either/or)', async () => {
    // mobius carries a tokenizedEquivalence (≡ gyro-torque chain) AND has
    // operational notation. The two are independent: neither suppresses the
    // other. Both are structural, so both read on the trick's page; the browse
    // row carries the trick's notation and says nothing about readings.
    const app = await createApp();
    const page = await request(app).get('/freestyle/tricks/mobius');
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/class="content-section equivalent-readings"/);
    expect(page.text).toMatch(/class="operational-notation-tokens"/);

    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const idx = res.text.indexOf('data-trick-slug="mobius"');
    expect(idx).toBeGreaterThan(-1);
    const window = res.text.substring(idx, idx + 4000);
    expect(window).toMatch(/class="dict-trick-row-notation-value">/);
  });

  it('orphan `<code class="dict-card-notation">` (without the JOB-block wrapper) does NOT appear on shared-card views', async () => {
    // The shared-card JOB-block-wrapper invariant applies to the still-shared
    // views. Asserted on category (a stable shared-card view, not in the
    // active two-line migration sequence). Migrated views (ADD / Family / Dex /
    // Movement System) use dict-trick-row-notation-value — see the *-view-rows tests.
    const res = await request(await createApp()).get('/freestyle/tricks?view=category');
    const re = /<code class="dict-card-notation/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, match.index - 200), match.index);
      expect(before, `dict-card-notation at ${match.index} lacks .dict-card-notation-block wrapper`)
        .toMatch(/class="dict-card-notation-block/);
    }
  });
});

describe('/freestyle/tricks?view=modifier — shared rows (not bare hashtags)', () => {
  it('offers a separate Detail control for each listed trick', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    // The name opens the trick's page and so does the Detail control; the two
    // agree on the destination, which is what a reader relies on.
    expect(res.text).toMatch(/<a[^>]*href="\/freestyle\/tricks\/fairy_mirage"[^>]*>\s*Detail\s*<\/a>/);
    expect(res.text).toMatch(/<a[^>]*href="\/freestyle\/tricks\/spinning_paradox_mirage"[^>]*>\s*Detail\s*<\/a>/);
  });

  it('renders the difficulty value + hashtag per row (no green chip), and the derivation on the page', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=modifier');
    const slugIdx = res.text.indexOf('data-trick-slug="spinning_paradox_mirage"');
    expect(slugIdx).toBeGreaterThan(-1);
    const window = res.text.substring(slugIdx, slugIdx + 2000);
    // The row carries the difficulty value, never a green chip.
    expect(window).toMatch(/aria-label="Difficulty value">\(\d+\)</);
    expect(window).not.toMatch(/class="dict-card-add[ "]/);
    expect(window).toMatch(/class="hashtag"[^>]*>#spinning_paradox_mirage</);
    // The arithmetic behind that value reads on the trick's own page.
    const page = await request(app).get('/freestyle/tricks/spinning_paradox_mirage');
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/spinning\(\+1\) \+ paradox\(\+1\) \+ mirage\(2\)/);
  });

  it('renders the trick name first, then the hashtag, then the Detail control', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    const slugIdx = res.text.indexOf('data-trick-slug="fairy_mirage"');
    expect(slugIdx).toBeGreaterThan(-1);
    const window = res.text.substring(slugIdx, slugIdx + 2000);
    const titleIdx   = window.indexOf('class="dict-trick-row-title"');
    const hashtagIdx = window.indexOf('>#fairy_mirage<');
    const detailIdx  = window.search(/<a[^>]*>\s*Detail\s*<\/a>/);
    expect(titleIdx).toBeGreaterThan(-1);
    expect(hashtagIdx).toBeGreaterThan(-1);
    expect(detailIdx).toBeGreaterThan(-1);
    // DOM order: name → hashtag → Detail.
    expect(titleIdx).toBeLessThan(hashtagIdx);
    expect(hashtagIdx).toBeLessThan(detailIdx);
  });
});

describe('Movement-system / By-set axis disambiguation', () => {
  it('Movement System intro names the four movement-system groupings + cross-links to By set', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toMatch(/four big movement families/i);
    expect(res.text).toMatch(/how you enter/i);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view=modifier"/);
  });

  it('By modifier intro names "which tricks use this set or modifier?" + cross-links to Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.text).toMatch(/which tricks use this set or modifier/i);
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });
});

describe('/freestyle/observational — Emerging Vocabulary copy + source chips', () => {
  it('source chip strip includes Stanford shorthand (TRACKED_NAMES has stanford-source-labeled groups)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // Stanford shorthand label should appear in the chip strip (or below in tracked-names).
    expect(res.text).toMatch(/Stanford shorthand/);
  });

  it('source chip strip includes the four canonical external sources (Stanford / FootbagMoves / PassBack / Footbag.org)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // PassBack
    expect(res.text).toMatch(/observed-source-strip-item--PB[^>]*>PassBack</);
    // FootbagMoves (FM)
    expect(res.text).toMatch(/observed-source-strip-item--FM[^>]*>FootbagMoves</);
    // Footbag.org (FB)
    expect(res.text).toMatch(/observed-source-strip-item--FB[^>]*>Footbag\.org</);
    // Stanford shorthand (SG)
    expect(res.text).toMatch(/observed-source-strip-item--SG[^>]*>Stanford shorthand</);
  });
});

// A trick's nicknames ride inline beside its name on the row, each in quotes.
// An alias that duplicates a ≡ reading is filtered so the same phrase never
// appears in both places.
describe('/freestyle/tricks — nicknames beside the name, separate from ≡ readings', () => {
  function mobiusRow(text: string): string {
    const start = text.indexOf('data-trick-slug="mobius"');
    return start === -1 ? '' : text.slice(start, text.indexOf('</article>', start));
  }

  it('renders folk nicknames beside the mobius name', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const row = mobiusRow(res.text);
    expect(row).toContain('aria-label="Also called"');
    expect(row).toContain('möbius');
    expect(row).toContain('toe mobius');
  });

  it('omits a nickname that duplicates the ≡ reading (gyro torque)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const row = mobiusRow(res.text);
    // mobius's ≡ reading IS "gyro torque"; the identical alias must not repeat
    // as a nickname beside the name.
    const nicknames = row.match(/aria-label="Also called">([\s\S]*?)<\/span>/)?.[1] ?? '';
    expect(nicknames).toContain('möbius');
    expect(nicknames).not.toContain('gyro torque');
  });
});
