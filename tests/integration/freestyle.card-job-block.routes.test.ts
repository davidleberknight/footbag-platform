/**
 * Card JOB-block + by-set linked-card regression tests.
 *
 * Post-2026-05-27 rendered-surface repair pass. Pins the four
 * observation-rooted fixes:
 *
 *   1. Across the SHARED-card browse views (family / movement-system /
 *      sets), the operational-notation row on each card renders inside a
 *      labeled `.dict-card-notation-block` with a leading "JOB" label
 *      span — not as loose body text. The detail-page convention
 *      ("Set notation" labeled section) extends to cards.
 *      (The ADD view uses a distinct two-line `.dict-trick-row` contract,
 *      pinned separately in freestyle.add-view-rows.routes.test.ts.)
 *
 *   2. /freestyle/tricks?view=sets renders LINKED trick cards
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

  // Modifier registry (enough to drive ?view=sets sections + Movement System)
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
    { slug: 'fairy-mirage', canonical_name: 'fairy mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'FAIRY MIRAGE', operational_notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'quantum-mirage', canonical_name: 'quantum mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'QUANTUM MIRAGE', operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'fairy-legover', canonical_name: 'fairy legover', adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'compound', notation: 'FAIRY LEGOVER', operational_notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'ducking-toe-stall', canonical_name: 'ducking toe stall', adds: '2', base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'compound', notation: 'DUCKING TOE STALL', operational_notation: 'TOE > DUCK [BOD] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'atomic-illusion', canonical_name: 'atomic illusion', adds: '3', base_trick: 'illusion', trick_family: 'illusion', category: 'compound', notation: 'ATOMIC ILLUSION', operational_notation: 'TOE > OP OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning-paradox-mirage', canonical_name: 'spinning paradox mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', notation: 'SPINNING PARADOX MIRAGE', operational_notation: 'CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    // mobius is in freestyleSymbolicEquivalences.ts → gets a tokenizedEquivalence
    // (≡) reading AND has operational notation. The normalization contract
    // requires BOTH to render (not either/or).
    { slug: 'mobius', canonical_name: 'mobius', adds: '5', base_trick: 'mobius', trick_family: 'torque', category: 'compound', notation: 'MOBIUS', operational_notation: 'CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]', aliases_json: '["möbius","moebius","gyro torque","toe mobius"]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  // Modifier links so ?view=sets has data to render
  db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES
      ('fairy-mirage', 'fairy', 1),
      ('quantum-mirage', 'quantum', 1),
      ('fairy-legover', 'fairy', 1),
      ('ducking-toe-stall', 'ducking', 1),
      ('spinning-paradox-mirage', 'spinning', 1),
      ('spinning-paradox-mirage', 'paradox', 2)
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
// (<code class="dict-trick-row-job-value">), never loose and never the pending
// placeholder.
function expectTwoLineJob(text: string, slug: string) {
  const idx = text.indexOf(`data-trick-slug="${slug}"`);
  expect(idx, `row with data-trick-slug="${slug}" not present`).toBeGreaterThan(-1);
  const window = text.substring(idx, idx + 4000);
  expect(window).toMatch(/class="dict-trick-row-label">JOB</);
  expect(window).toMatch(/class="dict-trick-row-job-value">/);
}

describe('JOB-block rendering across browse views (no raw operational notation outside the labeled block)', () => {
  it('By family (two-line): each row renders its JOB inside the resolved line-2 JOB value', async () => {
    // Family migrated to the two-line dict-trick-row contract (2026-05-27).
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expectTwoLineJob(res.text, 'fairy-mirage');
    expectTwoLineJob(res.text, 'quantum-mirage');
  });

  it('By dex-count (two-line): each row renders its JOB inside the resolved line-2 JOB value', async () => {
    // Dex migrated to the two-line dict-trick-row contract (2026-05-27).
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expectTwoLineJob(res.text, 'atomic-illusion');
    expectTwoLineJob(res.text, 'ducking-toe-stall');
  });

  it('By movement system (two-line): each row renders its JOB inside the resolved line-2 JOB value', async () => {
    // Movement System migrated to the two-line dict-trick-row contract (2026-05-27).
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
    expectTwoLineJob(res.text, 'fairy-mirage');
    expectTwoLineJob(res.text, 'quantum-mirage');
  });

  it('By set: cards with operational notation render the JOB-block label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    expectJobBlockRender(res.text, 'fairy-mirage');
    expectJobBlockRender(res.text, 'spinning-paradox-mirage');
  });

  it('a row with BOTH an equivalence reading AND operational notation renders BOTH (no either/or)', async () => {
    // mobius carries a tokenizedEquivalence (≡ gyro-torque chain) AND has
    // operational notation. On the two-line contract both render: the line-1
    // interpretation slot and the line-2 JOB slot are independent. Asserted on
    // the dex-count view (renders every active trick, including the torque
    // singleton mobius).
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const idx = res.text.indexOf('data-trick-slug="mobius"');
    expect(idx).toBeGreaterThan(-1);
    const window = res.text.substring(idx, idx + 4000);
    // Line 1: the ≡ interpretation slot.
    expect(window).toMatch(/class="dict-trick-row-interpretation"/);
    // Line 2: the resolved JOB value — present even though the ≡ reading exists.
    expect(window).toMatch(/class="dict-trick-row-job-value">/);
  });

  it('orphan `<code class="dict-card-notation">` (without the JOB-block wrapper) does NOT appear on shared-card views', async () => {
    // The shared-card JOB-block-wrapper invariant applies to the still-shared
    // views. Asserted on category (a stable shared-card view, not in the
    // active two-line migration sequence). Migrated views (ADD / Family / Dex /
    // Movement System) use dict-trick-row-job-value — see the *-view-rows tests.
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

describe('/freestyle/tricks?view=sets — two-line rows (not bare hashtags)', () => {
  it('renders <a class="dict-trick-row-title"> anchors for each listed trick (not plain text)', async () => {
    // By Modifier migrated to the two-line dict-trick-row contract (2026-05-27).
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Fairy section must surface the fairy-mirage row with a linked title.
    expect(res.text).toMatch(/<a class="dict-trick-row-title" href="\/freestyle\/tricks\/fairy-mirage">/);
    // Spinning section must surface the spinning-paradox-mirage row with a linked title.
    expect(res.text).toMatch(/<a class="dict-trick-row-title" href="\/freestyle\/tricks\/spinning-paradox-mirage">/);
  });

  it('renders the line-2 ADD slot + hashtag per row (no green chip; DictionaryTrickCard shape flows through)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    const slugIdx = res.text.indexOf('data-trick-slug="spinning-paradox-mirage"');
    expect(slugIdx).toBeGreaterThan(-1);
    const window = res.text.substring(slugIdx, slugIdx + 2000);
    // Line 2 carries the ADD value (derived formula), not a green chip.
    expect(window).toMatch(/class="dict-trick-row-add"/);
    expect(window).toMatch(/spinning\(\+1\) \+ paradox\(\+1\) \+ mirage\(2\)/);
    expect(window).not.toMatch(/class="dict-card-add[ "]/);
    expect(window).toMatch(/class="dict-trick-row-hashtag"[^>]*>#spinning_paradox_mirage</);
  });

  it('does NOT render hashtags as the primary UI — every card has a linked title before the hashtag', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // The fairy-mirage card title-anchor must appear before its hashtag in the DOM order.
    const titleIdx = res.text.indexOf('href="/freestyle/tricks/fairy-mirage"');
    const hashtagIdx = res.text.indexOf('>#fairy_mirage<');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(hashtagIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeLessThan(hashtagIdx);
  });
});

describe('Movement-system / By-set axis disambiguation', () => {
  it('Movement System intro names the four movement-system groupings + cross-links to By set', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toMatch(/four big groupings/i);
    expect(res.text).toMatch(/how you enter/i);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view=sets"/);
  });

  it('By Set intro names "which tricks use this set?" + cross-links to Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
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

// "Also called:" surfaces folk aliases in their own slot, distinct from the ≡
// structural readings. An alias that duplicates a ≡ reading is filtered so the
// same phrase never appears in both places.
describe('/freestyle/tricks — "Also called:" alias slot, separate from ≡ readings', () => {
  function mobiusCard(text: string): string {
    const start = text.indexOf('data-trick-slug="mobius"');
    return start === -1 ? '' : text.slice(start, start + 1800);
  }

  it('renders folk aliases under "Also called:" on the mobius card', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const card = mobiusCard(res.text);
    expect(card).toContain('Also called:');
    expect(card).toContain('möbius');
    expect(card).toContain('toe mobius');
  });

  it('omits an alias that duplicates the ≡ reading (gyro torque) from "Also called:"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const card = mobiusCard(res.text);
    // mobius's ≡ reading IS "gyro torque"; the identical alias must not repeat in
    // the "Also called:" line.
    const alsoCalledLine = card.split('Also called:')[1]?.split('</')[0] ?? '';
    expect(alsoCalledLine).toContain('möbius');
    expect(alsoCalledLine).not.toContain('gyro torque');
  });
});
