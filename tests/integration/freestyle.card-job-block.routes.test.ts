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
 *      (The ADD view uses a distinct two-line `.dict-add-row` contract,
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
    { slug: 'mobius', canonical_name: 'mobius', adds: '5', base_trick: 'mobius', trick_family: 'torque', category: 'compound', notation: 'MOBIUS', operational_notation: 'CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 },
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

describe('JOB-block rendering across browse views (no raw operational notation outside the labeled block)', () => {
  it('By family: cards with operational notation render the JOB-block label', async () => {
    // Family view only renders families with >1 member (singletons are
    // dropped), so assert on the multi-member mirage family.
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expectJobBlockRender(res.text, 'fairy-mirage');
    expectJobBlockRender(res.text, 'quantum-mirage');
  });

  it('By dex-count: cards with operational notation render the JOB-block label', async () => {
    // dex-count buckets every active trick (no size filter), so it covers
    // singleton-family tricks the family view drops.
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expectJobBlockRender(res.text, 'atomic-illusion');
    expectJobBlockRender(res.text, 'ducking-toe-stall');
  });

  it('By movement system: cards with operational notation render the JOB-block label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
    expectJobBlockRender(res.text, 'fairy-mirage');
    expectJobBlockRender(res.text, 'quantum-mirage');
  });

  it('By set: cards with operational notation render the JOB-block label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    expectJobBlockRender(res.text, 'fairy-mirage');
    expectJobBlockRender(res.text, 'spinning-paradox-mirage');
  });

  it('a card with BOTH an equivalence reading AND operational notation renders BOTH (no either/or)', async () => {
    // mobius carries a tokenizedEquivalence (≡ gyro-torque chain) from the
    // symbolic-equivalences content module AND has operational notation.
    // The 2026-05-27 normalization removed the prior EITHER/OR: the
    // interpretation subtitle (slot 3) and the JOB block (slot 5) are now
    // independent slots — both must appear on the same card. Asserted on the
    // dex-count view (renders every active trick, including the torque
    // singleton mobius); the ADD view's distinct two-line contract is pinned
    // in freestyle.add-view-rows.routes.test.ts.
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    const idx = res.text.indexOf('data-trick-slug="mobius"');
    expect(idx).toBeGreaterThan(-1);
    const window = res.text.substring(idx, idx + 4000);
    // Slot 3: the ≡ interpretation subtitle.
    expect(window).toMatch(/class="core-trick-equivalence dict-card-equivalence/);
    // Slot 5: the labeled JOB block — present even though the ≡ reading exists.
    expect(window).toMatch(/class="dict-card-notation-block/);
    expect(window).toMatch(/class="dict-card-notation-label">JOB</);
  });

  it('orphan `<code class="dict-card-notation">` (without the JOB-block wrapper) does NOT appear', async () => {
    // Run against the densest shared-card view (the ADD view uses the distinct
    // dict-add-row contract, not dict-card-notation).
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    // Every dict-card-notation occurrence must sit inside a dict-card-notation-block wrapper.
    // We check by ensuring the substring before each dict-card-notation occurrence (within
    // a small window) contains the wrapper open tag.
    const re = /<code class="dict-card-notation/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(res.text)) !== null) {
      const before = res.text.substring(Math.max(0, match.index - 200), match.index);
      expect(before, `dict-card-notation at ${match.index} lacks .dict-card-notation-block wrapper`)
        .toMatch(/class="dict-card-notation-block/);
    }
  });
});

describe('/freestyle/tricks?view=sets — linked trick cards (not bare hashtags)', () => {
  it('renders <a class="dict-card-title"> anchors for each listed trick (not plain text)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Fairy section must surface the fairy-mirage card with a linked title.
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/fairy-mirage">/);
    // Spinning section must surface the spinning-paradox-mirage card with a linked title.
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/spinning-paradox-mirage">/);
  });

  it('renders the ADD chip + hashtag per card (proof the DictionaryTrickCard shape flows through)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Look for the spinning-paradox-mirage card's ADD chip (4 ADD)
    const slugIdx = res.text.indexOf('data-trick-slug="spinning-paradox-mirage"');
    expect(slugIdx).toBeGreaterThan(-1);
    const window = res.text.substring(slugIdx, slugIdx + 2000);
    expect(window).toMatch(/class="dict-card-add[^"]*"[^>]*>4 ADD</);
    expect(window).toMatch(/class="dict-card-hashtag"[^>]*>#spinning_paradox_mirage</);
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
  it('Movement System intro names the four conceptual axes + cross-links to By set', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toMatch(/four higher-level conceptual axes/i);
    expect(res.text).toMatch(/set\/uptime/i);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view=sets"/);
  });

  it('By Set intro names "which tricks use this set?" + cross-links to Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toMatch(/which tricks use this set or modifier/i);
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });
});

describe('/freestyle/observational — Emerging Vocabulary copy + source chips', () => {
  it('tracked-names heading says "observational names awaiting review", not "more documented names"', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/observational names awaiting review/i);
    expect(res.text).not.toMatch(/more documented names/);
  });

  it('tracked-names note frames the corpus as awaiting review, with multiple stages (unresolved alias / doctrine-blocked / untriaged)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/Observational names tracked for future review/i);
    expect(res.text).toMatch(/None.{0,40}immediately promotable/i);
  });

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
