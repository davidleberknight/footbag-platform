/**
 * Rendered-output regression suite — Pass 3 (curator audit, 2026-05-24).
 *
 * This suite asserts against the ACTUAL rendered HTML for each trick
 * page the curator's audit flagged. The goal is to catch any future
 * regression where:
 *
 *   1. DATW + DLO + rev-whirl lose their JOB or ADD rows.
 *   2. The 9 FM-sourced compounds re-leak into the canonical ADD browse.
 *   3. The "FM dex-count convention" prose reappears on canonical pages.
 *   4. The tautological ≡ slot reappears on atomic/simple cards.
 *   5. The hero-formula tautological identity ("cloud kick = 1 ADD")
 *      reappears for atomic tricks.
 *   6. bod / unusual surface lowercase forms reappear in ADD displays.
 *
 * Each assertion is a curl-grade rendered-HTML check, not a test against
 * an internal contract. If a future refactor changes the implementation
 * but preserves the rendered output, these tests still pass. If a
 * refactor breaks the rendered output, these tests fail.
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

const { dbPath } = setTestEnv('3177');

let createApp: Awaited<ReturnType<typeof importApp>>;

const TS = '2026-05-24T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Atom + folk-name fixtures used by the hero-formula + chip suppression
  // assertions. Each row carries notation, operational_notation, and
  // base_trick = self so the convergence rule fires.
  insertFreestyleTrick(db, {
    slug: 'cloud-kick', canonical_name: 'cloud kick', adds: '1',
    base_trick: 'cloud-kick', trick_family: 'cloud-kick', category: 'body',
    notation: 'CLOUD KICK', operational_notation: '[set] > cloud kick',
    description: 'Kick off the back of the shin.',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'flying-inside', canonical_name: 'flying inside', adds: '1',
    base_trick: 'flying-inside', trick_family: 'flying-inside', category: 'body',
    notation: 'FLYING INSIDE', operational_notation: 'flying > inside',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'rake', canonical_name: 'rake', adds: '2',
    base_trick: 'toe-stall', trick_family: 'rake', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pendulum', canonical_name: 'pendulum', adds: '2',
    base_trick: 'pendulum', trick_family: 'pendulum', category: 'compound',
    notation: 'PENDULUM',
    operational_notation: 'SET > TOE SWING [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'toe-stall', canonical_name: 'toe stall', adds: '1',
    base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'surface',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // DATW + DLO: first-class promotion targets. notation + op_notation
  // backfilled; base_trick = self so isAtomic gate fires for the
  // ATOMIC_FLAG path in the service.
  insertFreestyleTrick(db, {
    slug: 'double-around-the-world', canonical_name: 'double around the world',
    adds: '3', base_trick: 'double-around-the-world', trick_family: 'atw',
    category: 'compound',
    notation: 'DOUBLE AROUND THE WORLD',
    operational_notation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'double-leg-over', canonical_name: 'double leg over',
    adds: '3', base_trick: 'double-leg-over', trick_family: 'legover',
    category: 'compound',
    notation: 'DOUBLE LEGOVER',
    operational_notation: 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // rev-whirl: notation + op_notation backfilled; the JOB row carries
  // the canonical bracket form, the ALT row carries the reverse-pair
  // reading.
  insertFreestyleTrick(db, {
    slug: 'rev-whirl', canonical_name: 'rev whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    notation: 'REV WHIRL',
    operational_notation: 'CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── DATW + DLO + rev-whirl: JOB + ADD rows render with the user's exact spec ──
describe('DATW + DLO + rev-whirl: rendered JOB + ADD per curator spec', () => {
  it('DATW renders JOB "TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]" + ADD "dex(2) + stall(1) = 3 ADD"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double-around-the-world');
    expect(res.status).toBe(200);
    // The notation-summary card's JOB row renders the chain as plain
    // text inside <code> (HTML-escaped). Match the contiguous string.
    expect(res.text).toMatch(/TOE &gt; SAME IN \[DEX\] &gt; SAME IN \[DEX\] &gt; SAME TOE \[DEL\]/);
    // ADD breakdown (Slice D 2026-05-26: `= N ADD` terminator stripped).
    expect(res.text).toMatch(/dex\(2\)\s*\+\s*stall\(1\)/);
  });

  it('DLO renders JOB "SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]" + ADD "dex(2) + stall(1)"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double-leg-over');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/SET &gt; OP IN \[DEX\] &gt; OP OUT \[DEX\] &gt; SAME TOE \[DEL\]/);
    expect(res.text).toMatch(/dex\(2\)\s*\+\s*stall\(1\)/);
  });

  it('rev-whirl renders JOB + ADD "xbody(1) + dex(1) + stall(1)" + ALT "rev(0) + whirl(3)"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/rev-whirl');
    expect(res.status).toBe(200);
    // JOB.
    expect(res.text).toMatch(/CLIP &gt; OP OUT \[DEX\] &gt; OP CLIP \[XBD\] \[DEL\]/);
    // ADD: structural decomposition, not the rev(0) reading.
    expect(res.text).toMatch(/xbody\(1\)\s*\+\s*dex\(1\)\s*\+\s*stall\(1\)/);
    // ALT: rev formula, NOT in the ADD row.
    expect(res.text).toMatch(/rev\(0\)\s*\+\s*whirl\(3\)/);
  });

  it('rev-whirl JOB row is NOT labelled "notation pending"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/rev-whirl');
    expect(res.text).toMatch(/<dt>JOB<\/dt>/);
    // The notation-summary card's JOB row must carry the actual chain,
    // not the placeholder.
    const summary = res.text.match(/class="trick-notation-summary"[\s\S]+?<\/section>/);
    expect(summary).not.toBeNull();
    expect(summary![0]).not.toMatch(/notation pending/i);
  });
});

// ── Canonical ADD browse cleanliness ─────────────────────────────────────
describe('Canonical ADD browse: unreviewed FM-sourced compounds stay out', () => {
  it('the 9 FM-sourced compounds do NOT appear in /freestyle/tricks?view=add', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    for (const slug of [
      'bladerunner', 'bling-blang', 'cold-fusion', 'flurricane',
      'golden-shower', 'goliath', 'gybas', 'motion-sickness', 'pandemonium',
    ]) {
      expect(res.text, `${slug} should not appear in canonical ADD browse`)
        .not.toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('"FM dex-count convention" prose does NOT appear on any canonical surface', async () => {
    const browse = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(browse.text).not.toContain('FM dex-count convention');
    expect(browse.text).not.toContain('(DEX) events =');
    const cloudKick = await request(await createApp()).get('/freestyle/tricks/cloud-kick');
    expect(cloudKick.text).not.toContain('FM dex-count convention');
    const rake = await request(await createApp()).get('/freestyle/tricks/rake');
    expect(rake.text).not.toContain('FM dex-count convention');
  });
});

// ── rake + pendulum browse cards: JOB-form chain readings suppressed ──
describe('rake + pendulum: ≡ slot does not echo the JOB notation', () => {
  it('rake browse card has NO "swing toe" ≡ reading (JOB-form leakage)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="rake"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    // ≡ "swing toe" was just the lowercase JOB-form echo; user audit
    // listed it as leakage. The JOB row carries "SET > SWING TOE [DEL]"
    // — the chain reading on top would be redundant.
    expect(card![0]).not.toMatch(/core-trick-equivalence[\s\S]*?swing[\s\S]*?toe/);
    // The JOB row still carries the canonical bracket form.
    expect(card![0]).toMatch(/SET &gt; SWING TOE \[DEL\]/);
  });

  it('pendulum browse card has NO "toe swing" ≡ reading and the JOB row is the canonical bracket form', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="pendulum"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    expect(card![0]).not.toMatch(/core-trick-equivalence[\s\S]*?toe[\s\S]*?swing/);
    // 2026-05-24 audit: pendulum's prior "[DEL] [DEX]" operational
    // notation was ambiguous two-flags-out-of-context; now canonical.
    expect(card![0]).toMatch(/SET &gt; TOE SWING \[DEL\]/);
    expect(card![0]).not.toMatch(/\[DEL\]\s*\[DEX\]/);
  });
});

// ── rev-up demoted: absent from canonical ADD browse ─────────────────────
describe('rev-up demoted from canonical ADD browse', () => {
  it('rev-up does NOT appear in /freestyle/tricks?view=add', async () => {
    // rev-up is structurally distinct from rev-whirl (per curator) but
    // had no curator-authored structural decomposition; demoted via
    // is_active=0 in red_corrections until its own reading is published.
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('data-trick-slug="rev-up"');
  });
});

// ── Compound-description slot leakage prevention ─────────────────────────
describe('Compound-description slot leakage prevention', () => {
  it('cloud-kick browse card has NO standalone op-notation chip (would echo JOB)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="cloud-kick"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    expect(card![0]).not.toMatch(/<code class="dict-card-notation/);
    // ≡ slot also empty (no tautological reading).
    expect(card![0]).not.toMatch(/class="core-trick-equivalence/);
  });

  it('flying-inside browse card has NO standalone op-notation chip', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="flying-inside"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    expect(card![0]).not.toMatch(/<code class="dict-card-notation/);
  });

  it('DATW browse card has NO ≡ tautological reading ("double around the world")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="double-around-the-world"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    // Tautological filter drops the canonical-name echo.
    expect(card![0]).not.toMatch(/class="core-trick-equivalence/);
  });

  it('cloud-kick detail page has NO tautological hero-formula ("cloud kick = 1 ADD")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/cloud-kick');
    // The hero-formula slot is suppressed for atomic/no-modifier-link
    // tricks (would otherwise render the tautological identity).
    expect(res.text).not.toMatch(/class="trick-hero-formula"/);
  });

  it('rake detail page has NO tautological hero-formula ("rake = 2 ADD")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/rake');
    expect(res.text).not.toMatch(/class="trick-hero-formula"/);
  });
});

// ── Token normalization: BOD + UNS uppercase ─────────────────────────────
describe('Token normalization: BOD + UNS uppercase in ADD displays', () => {
  // Slice D 2026-05-26: `= N ADD` terminator stripped from breakdowns.
  it('flying-inside renders ADD with uppercase BOD(1)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/flying-inside');
    expect(res.text).toMatch(/BOD\(1\)/);
    // The lowercase bod(1) form should not appear in ADD displays.
    expect(res.text).not.toMatch(/>bod\(1\)</);
  });

  it('cloud-kick renders ADD with uppercase UNS(1)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/cloud-kick');
    expect(res.text).toMatch(/UNS\(1\)/);
    expect(res.text).not.toMatch(/unusual surface\(1\)/);
  });
});

// ── Emerging Vocabulary still accessible ─────────────────────────────────
describe('Emerging Vocabulary remains accessible', () => {
  it('/freestyle/observational responds 200 with the Emerging Vocabulary title', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Emerging Vocabulary');
  });

  it('the dictionary landing surfaces a link to Emerging Vocabulary', async () => {
    // DL-1+2+5 2026-05-26: Emerging Vocabulary moved from a separate
    // footer-style paragraph into the landing grid's third band
    // ("TRACKING & EXPANSION"). The display label is now sentence case
    // ("Emerging vocabulary"); the /freestyle/observational route is
    // unchanged.
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/Emerging vocabulary/);
    expect(res.text).toContain('href="/freestyle/observational"');
    expect(res.text).toMatch(/TRACKING &amp; EXPANSION/);
  });
});
