/**
 * Rendered-output regression suite (curator audit).
 *
 * This suite asserts against the ACTUAL rendered HTML for each trick
 * page the curator's audit flagged. The goal is to catch any future
 * regression where:
 *
 *   1. DATW + DLO + rev_whirl lose their JOB or ADD rows.
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
    slug: 'cloud_kick', canonical_name: 'cloud kick', adds: '1',
    base_trick: 'cloud_kick', trick_family: 'cloud_kick', category: 'body',
    notation: 'CLOUD KICK', operational_notation: '[set] > cloud kick',
    description: 'Kick off the back of the shin.',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'flying_inside', canonical_name: 'flying inside', adds: '1',
    base_trick: 'flying_inside', trick_family: 'flying_inside', category: 'body',
    notation: 'FLYING INSIDE', operational_notation: 'flying > inside',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'rake', canonical_name: 'rake', adds: '2',
    base_trick: 'toe_stall', trick_family: 'rake', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pendulum', canonical_name: 'pendulum', adds: '2',
    base_trick: 'pendulum', trick_family: 'pendulum', category: 'compound',
    notation: 'PENDULUM',
    operational_notation: 'TOE SWING (SET) > (contact)',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'toe_stall', canonical_name: 'toe stall', adds: '1',
    base_trick: 'toe_stall', trick_family: 'toe_stall', category: 'surface',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // DATW + DLO: first-class promotion targets. notation + op_notation
  // backfilled; base_trick = self so isAtomic gate fires for the
  // ATOMIC_FLAG path in the service.
  insertFreestyleTrick(db, {
    slug: 'double_around_the_world', canonical_name: 'double around the world',
    adds: '3', base_trick: 'double_around_the_world', trick_family: 'atw',
    category: 'compound',
    notation: 'DOUBLE AROUND THE WORLD',
    operational_notation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'double_leg_over', canonical_name: 'double leg over',
    adds: '3', base_trick: 'double_leg_over', trick_family: 'legover',
    category: 'compound',
    notation: 'DOUBLE LEGOVER',
    operational_notation: 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // rev_whirl: notation + op_notation backfilled; the JOB row carries
  // the canonical bracket form, the ALT row carries the reverse-pair
  // reading.
  insertFreestyleTrick(db, {
    slug: 'rev_whirl', canonical_name: 'rev whirl', adds: '3',
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

// ── DATW + DLO + rev_whirl: Execution notation + ADD rows per the user's exact spec ──
describe('DATW + DLO + rev_whirl: rendered Execution notation + ADD per curator spec', () => {
  it('DATW renders Execution notation "TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]" + ADD "dex(2) + stall(1)"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double_around_the_world');
    expect(res.status).toBe(200);
    // The operational chain renders as role-classified op-tokens in the
    // Execution notation section; assert each token in order.
    expect(res.text).toMatch(
      />TOE<[\s\S]+?>SAME<[\s\S]+?>IN<[\s\S]+?>\[DEX\]<[\s\S]+?>SAME<[\s\S]+?>IN<[\s\S]+?>\[DEX\]<[\s\S]+?>SAME<[\s\S]+?>TOE<[\s\S]+?>\[DEL\]</,
    );
    // ADD breakdown (the `= N ADD` terminator is stripped on trick-detail).
    expect(res.text).toMatch(/dex\(2\)\s*\+\s*stall\(1\)/);
  });

  it('DLO renders Execution notation "SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]" + ADD "dex(2) + stall(1)"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double_leg_over');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(
      />SET<[\s\S]+?>OP<[\s\S]+?>IN<[\s\S]+?>\[DEX\]<[\s\S]+?>OP<[\s\S]+?>OUT<[\s\S]+?>\[DEX\]<[\s\S]+?>SAME<[\s\S]+?>TOE<[\s\S]+?>\[DEL\]</,
    );
    expect(res.text).toMatch(/dex\(2\)\s*\+\s*stall\(1\)/);
  });

  it('rev_whirl renders Execution notation + ADD "xbody(1) + dex(1) + stall(1)" + ALT "rev(0) + whirl(3)"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/rev_whirl');
    expect(res.status).toBe(200);
    // Execution notation chain.
    expect(res.text).toMatch(
      />CLIP<[\s\S]+?>OP<[\s\S]+?>OUT<[\s\S]+?>\[DEX\]<[\s\S]+?>OP<[\s\S]+?>CLIP<[\s\S]+?>\[XBD\]<[\s\S]+?>\[DEL\]</,
    );
    // ADD: structural decomposition, not the rev(0) reading.
    expect(res.text).toMatch(/xbody\(1\)\s*\+\s*dex\(1\)\s*\+\s*stall\(1\)/);
    // ALT: rev formula, NOT in the ADD row.
    expect(res.text).toMatch(/rev\(0\)\s*\+\s*whirl\(3\)/);
  });

  it('rev_whirl Execution notation carries the actual chain, NOT a "canonical decomposition pending" placeholder', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/rev_whirl');
    // The Execution notation section renders the real operational chain.
    const classIdx = res.text.indexOf('operational-notation-display');
    expect(classIdx).toBeGreaterThan(0);
    const open = res.text.lastIndexOf('<section', classIdx);
    const end = res.text.indexOf('</section>', classIdx);
    const region = res.text.slice(open, end);
    expect(region).toMatch(/<h2>Execution notation<\/h2>/);
    expect(region).not.toMatch(/canonical decomposition pending/i);
  });
});

// ── Canonical ADD browse cleanliness ─────────────────────────────────────
describe('Canonical ADD browse: unreviewed FM-sourced compounds stay out', () => {
  it('the 9 FM-sourced compounds do NOT appear in /freestyle/tricks?view=add', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    for (const slug of [
      'bladerunner', 'bling_blang', 'cold_fusion', 'flurricane',
      'golden_shower', 'goliath', 'gybas', 'motion_sickness', 'pandemonium',
    ]) {
      expect(res.text, `${slug} should not appear in canonical ADD browse`)
        .not.toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('"FM dex-count convention" prose does NOT appear on any canonical surface', async () => {
    const browse = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(browse.text).not.toContain('FM dex-count convention');
    expect(browse.text).not.toContain('(DEX) events =');
    const cloudKick = await request(await createApp()).get('/freestyle/tricks/cloud_kick');
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
    // pendulum's terminal surface is arbitrary, so the JOB row renders the
    // open (contact) terminal, not a fixed stall or the ambiguous two-flags form.
    expect(card![0]).toMatch(/TOE SWING/);
    expect(card![0]).toMatch(/\(contact\)/);
    expect(card![0]).not.toMatch(/SAME TOE/);
    expect(card![0]).not.toMatch(/\[DEL\]\s*\[DEX\]/);
  });
});

// ── rev_up demoted: absent from canonical ADD browse ─────────────────────
describe('rev_up demoted from canonical ADD browse', () => {
  it('rev_up does NOT appear in /freestyle/tricks?view=add', async () => {
    // rev_up is structurally distinct from rev_whirl (per curator) but
    // had no curator-authored structural decomposition; demoted via
    // is_active=0 in red_corrections until its own reading is published.
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('data-trick-slug="rev_up"');
  });
});

// ── Compound-description slot leakage prevention ─────────────────────────
describe('Compound-description slot leakage prevention', () => {
  it('cloud_kick browse card has NO standalone op-notation chip (would echo JOB)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="cloud_kick"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    expect(card![0]).not.toMatch(/<code class="dict-card-notation/);
    // ≡ slot also empty (no tautological reading).
    expect(card![0]).not.toMatch(/class="core-trick-equivalence/);
  });

  it('flying_inside browse card has NO standalone op-notation chip', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="flying_inside"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    expect(card![0]).not.toMatch(/<code class="dict-card-notation/);
  });

  it('DATW browse card has NO ≡ tautological reading ("double around the world")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const card = res.text.match(/data-trick-slug="double_around_the_world"[\s\S]*?<\/article>/);
    expect(card).not.toBeNull();
    // Tautological filter drops the canonical-name echo.
    expect(card![0]).not.toMatch(/class="core-trick-equivalence/);
  });

  it('cloud_kick detail page has NO tautological hero-formula ("cloud kick = 1 ADD")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/cloud_kick');
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
  // The `= N ADD` terminator is not rendered in breakdowns.
  it('flying_inside renders ADD with uppercase BOD(1)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/flying_inside');
    expect(res.text).toMatch(/BOD\(1\)/);
    // The lowercase bod(1) form should not appear in ADD displays.
    expect(res.text).not.toMatch(/>bod\(1\)</);
  });

  it('cloud_kick renders ADD with uppercase UNS(1)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/cloud_kick');
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
    // Emerging Vocabulary renders inside the landing grid's third band
    // ("TRACKING & EXPANSION"), not as a separate footer-style
    // paragraph. The display label is sentence case
    // ("Emerging vocabulary"); the route is /freestyle/observational.
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/Emerging vocabulary/);
    expect(res.text).toContain('href="/freestyle/observational"');
    expect(res.text).toMatch(/TRACKING &amp; EXPANSION/);
  });
});
