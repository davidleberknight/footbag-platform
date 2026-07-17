/**
 * Unit tests for assertFirstClassConvergence — the ADD-math gate that
 * determines whether a candidate slug is structurally promotable to
 * first-class. Pure-function tests; no DB; no HTTP.
 *
 * The rule has three derivation paths in priority order:
 *   1. Composite-derivation (curator-published composite-base reading)
 *   2. Atomic flag-decomposition (for atom singletons)
 *   3. Flat deriveComputedAdd (base + modifier weights)
 *
 * Slice R1b (2026-05-20) added the composite-derivation path so
 * witchdoctor — whose Red-locked reading is atomic-mirage(4) +
 * symposium(+1) = 5 — graduates from governance-blocked. The flat
 * derivation atomic(+1) + symposium(+1) + mirage(2) = 4 doesn't reach
 * the official 5, so without the composite path the slug stays blocked.
 *
 * These tests pin:
 *   - Composite path activates for slugs in COMPOSITE_DERIVATIONS.
 *   - Flat path remains correct for everything else.
 *   - Atomic path remains correct for atom singletons.
 *   - DOCTRINE_BLOCKED_SLUGS still gates blocked slugs (regression).
 *   - H2 / H3 / H5 / H6 guardrails fire as expected.
 */
import { describe, it, expect } from 'vitest';
import { assertFirstClassConvergence } from '../../src/services/freestyleService';

// Standard modifier-table fixture mirroring the DB shape: every modifier
// carries equal add_bonus and add_bonus_rotational (atomic is +1 on any base).
const modifierTable = new Map<string, { add_bonus: number; add_bonus_rotational: number }>([
  ['atomic',    { add_bonus: 1, add_bonus_rotational: 1 }],
  ['paradox',   { add_bonus: 1, add_bonus_rotational: 1 }],
  ['symposium', { add_bonus: 1, add_bonus_rotational: 1 }],
  ['stepping',  { add_bonus: 1, add_bonus_rotational: 1 }],
  ['ducking',   { add_bonus: 1, add_bonus_rotational: 1 }],
  ['spinning',  { add_bonus: 1, add_bonus_rotational: 1 }],
  ['pixie',     { add_bonus: 1, add_bonus_rotational: 1 }],
  ['fairy',     { add_bonus: 1, add_bonus_rotational: 1 }],
  ['barraging', { add_bonus: 2, add_bonus_rotational: 2 }],
  ['blurry',    { add_bonus: 1, add_bonus_rotational: 1 }],
]);

describe('assertFirstClassConvergence — composite-derivation path (R1b)', () => {
  it('witchdoctor converges via composite-derivation (atom-smasher + symposium = 5)', () => {
    const result = assertFirstClassConvergence(
      'witchdoctor',
      {
        canonical_name: 'witchdoctor',
        adds: 5,                         // Red 2026-05-20: 4 → 5
        base_trick: 'mirage',
        notation: 'WITCHDOCTOR',         // any non-empty
      },
      ['atomic', 'symposium'],
      modifierTable,
      2,                                 // mirage base ADD
    );
    expect(result.status).toBe('first-class');
    expect(result.diagnostic).toBe('convergence-rule passed');
  });

  it('witchdoctor at the OLD official 4 ADD would fail composite total check', () => {
    // Regression guard: if witchdoctor's official ADD ever reverts to 4,
    // the composite-derivation total (5) would no longer match and the
    // rule would correctly report governance-blocked. This protects
    // against a stale DB row pretending to be first-class.
    const result = assertFirstClassConvergence(
      'witchdoctor',
      {
        canonical_name: 'witchdoctor',
        adds: 4,
        base_trick: 'mirage',
        notation: 'WITCHDOCTOR',
      },
      ['atomic', 'symposium'],
      modifierTable,
      2,
    );
    expect(result.status).toBe('governance-blocked');
  });
});

describe('assertFirstClassConvergence — atomic-decomposition path', () => {
  it('osis converges via ATOMIC_FLAG_DECOMPOSITIONS (atomic decomp totalAdd == official)', () => {
    const result = assertFirstClassConvergence(
      'osis',
      {
        canonical_name: 'osis',
        adds: 3,
        base_trick: 'osis',              // isAtomic = true
        notation: 'OSIS',
      },
      [],                                 // no modifiers
      modifierTable,
      3,
    );
    expect(result.status).toBe('first-class');
  });

  it('whirl converges via atomic decomp (3 ADD)', () => {
    const result = assertFirstClassConvergence(
      'whirl',
      {
        canonical_name: 'whirl',
        adds: 3,
        base_trick: 'whirl',
        notation: 'WHIRL',
      },
      [],
      modifierTable,
      3,
    );
    expect(result.status).toBe('first-class');
  });
});

describe('assertFirstClassConvergence — flat derivation path', () => {
  it('paradox-mirage converges flat (paradox(+1) + mirage(2) = 3)', () => {
    const result = assertFirstClassConvergence(
      'paradox_mirage',
      {
        canonical_name: 'paradox mirage',
        adds: 3,
        base_trick: 'mirage',
        notation: 'PARADOX MIRAGE',
      },
      ['paradox'],
      modifierTable,
      2,
    );
    expect(result.status).toBe('first-class');
  });

  it('barraging-osis is convergence-ready post-R1 (math works; awaits published formula)', () => {
    // Slice R1: barraging weight changed 1 → 2 so the math now works
    // mechanically. But H4 enforces "explicit publication" as a
    // separate gate: a slug needs a RESOLVED_FORMULAS entry, atomic
    // decomp, or composite-derivation entry to reach first-class.
    // barraging-osis has none of these (only the modifier weight was
    // updated in R1; no published-derivation row was authored), so
    // the rule correctly reports convergence-ready instead of the
    // prior governance-blocked. This is the intended intermediate
    // state: "math agrees; awaiting curator promotion entry."
    const result = assertFirstClassConvergence(
      'barraging-osis',
      {
        canonical_name: 'barraging osis',
        adds: 5,
        base_trick: 'osis',
        notation: 'BARRAGING OSIS',
      },
      ['barraging'],
      modifierTable,
      3,
    );
    expect(result.status).toBe('convergence-ready');
    expect(result.diagnostic).toContain('awaiting');
  });

  it('a NaN base ADD reports coverage-pending (derivation impossible), never NaN arithmetic', () => {
    // A non-numeric adds column on the base row reaches the rule as
    // Number('garbage') = NaN. That is the "non-numeric ADD" impossible-
    // derivation case: the rule must report the derivation as not
    // derivable, not carry NaN into the computed-vs-official comparison
    // and mislabel the row governance-blocked with a NaN diagnostic.
    const result = assertFirstClassConvergence(
      'paradox_mirage',
      {
        canonical_name: 'paradox mirage',
        adds: 3,
        base_trick: 'mirage',
        notation: 'PARADOX MIRAGE',
      },
      ['paradox'],
      modifierTable,
      Number.NaN,
    );
    expect(result.status).toBe('coverage-pending');
    expect(result.diagnostic).toBe('computed ADD not derivable');
  });

  it('a slug whose flat derivation under-counts is reported governance-blocked', () => {
    // Pretend "ghost" = some-modifier + base; official says 9 but math
    // says 5. Should not pass H5 even with a resolved-formula entry.
    const result = assertFirstClassConvergence(
      'paradox_mirage',
      {
        canonical_name: 'paradox mirage',
        adds: 999,                       // bogus
        base_trick: 'mirage',
        notation: 'PARADOX MIRAGE',
      },
      ['paradox'],
      modifierTable,
      2,
    );
    expect(result.status).toBe('governance-blocked');
    expect(result.diagnostic).toContain('computed');
  });
});

describe('assertFirstClassConvergence — doctrine-blocked guard', () => {
  it.each([
    'nemesis', 'sumo', 'bullwhip', 'double-down', 'terrage', 'datw',
    'omelette', 'fury', 'surging', 'sailing', 'shooting',
    'jani-walker', 'reaper', 'refraction', 'blistering', 'nuclear',
  ])('%s remains governance-blocked via DOCTRINE_BLOCKED_SLUGS', (slug) => {
    const result = assertFirstClassConvergence(
      slug,
      {
        canonical_name: slug,
        adds: 5,
        base_trick: 'mirage',
        notation: 'NOT EMPTY',
      },
      [],
      modifierTable,
      2,
    );
    expect(result.status).toBe('governance-blocked');
    expect(result.diagnostic).toBe('workbook doctrine blocker');
  });

  it('witchdoctor is NOT in DOCTRINE_BLOCKED_SLUGS anymore', () => {
    // The rule should NOT short-circuit at H7 for witchdoctor; instead
    // it should reach H4+ and pass via composite-derivation.
    const result = assertFirstClassConvergence(
      'witchdoctor',
      {
        canonical_name: 'witchdoctor',
        adds: 5,
        base_trick: 'mirage',
        notation: 'WITCHDOCTOR',
      },
      ['atomic', 'symposium'],
      modifierTable,
      2,
    );
    expect(result.status).not.toBe('governance-blocked');
    expect(result.diagnostic).not.toBe('workbook doctrine blocker');
  });

  it('barraging-osis is NOT in DOCTRINE_BLOCKED_SLUGS anymore', () => {
    const result = assertFirstClassConvergence(
      'barraging-osis',
      {
        canonical_name: 'barraging osis',
        adds: 5,
        base_trick: 'osis',
        notation: 'BARRAGING OSIS',
      },
      ['barraging'],
      modifierTable,
      3,
    );
    expect(result.diagnostic).not.toBe('workbook doctrine blocker');
  });

  it('guay is NOT in DOCTRINE_BLOCKED_SLUGS anymore (curator resolution 2026-05-22)', () => {
    // Released from curator_hold and promoted to first-class with
    // pickup-pattern dex + inside-stall decomposition.
    const result = assertFirstClassConvergence(
      'guay',
      {
        canonical_name: 'guay',
        adds: 2,
        base_trick: 'guay',
        notation: 'GUAY',
      },
      [],
      modifierTable,
      2,
    );
    expect(result.status).not.toBe('governance-blocked');
    expect(result.diagnostic).not.toBe('workbook doctrine blocker');
  });
});

describe('assertFirstClassConvergence — guardrails (H1-H3)', () => {
  it('H1: null dictRow → governance-blocked', () => {
    const result = assertFirstClassConvergence('any', null, [], modifierTable, null);
    expect(result.status).toBe('governance-blocked');
    expect(result.diagnostic).toBe('no canonical row');
  });

  it('H2: empty notation → coverage-pending', () => {
    const result = assertFirstClassConvergence(
      'witchdoctor',
      { canonical_name: 'witchdoctor', adds: 5, base_trick: 'mirage', notation: '' },
      ['atomic', 'symposium'],
      modifierTable,
      2,
    );
    expect(result.status).toBe('coverage-pending');
    expect(result.diagnostic).toBe('compact notation absent');
  });

  it('H3: null adds → coverage-pending', () => {
    const result = assertFirstClassConvergence(
      'paradox-mirage',
      { canonical_name: 'paradox mirage', adds: null, base_trick: 'mirage', notation: 'PARADOX MIRAGE' },
      ['paradox'],
      modifierTable,
      2,
    );
    expect(result.status).toBe('coverage-pending');
    expect(result.diagnostic).toBe('official ADD absent');
  });

  it('H4: unknown slug with no resolved formula → convergence-ready', () => {
    const result = assertFirstClassConvergence(
      'something-uncatalogued',
      {
        canonical_name: 'something uncatalogued',
        adds: 4,
        base_trick: 'mirage',
        notation: 'X',
      },
      ['paradox'],
      modifierTable,
      2,
    );
    expect(result.status).toBe('convergence-ready');
    expect(result.diagnostic).toContain('awaiting');
  });
});

describe('assertFirstClassConvergence — legacy atomic-rotational path is retired', () => {
  // paradox-mirage is a published resolved-formula slug whose base, mirage, was
  // one of the former "rotational bases". Give paradox a rotational weight that
  // DIFFERS from its flat weight. Every real modifier now carries equal weights,
  // so a divergent probe is the only way to prove the computation reads the flat
  // weight: the retired rotational branch would have scored the rotational +7 and
  // reported a governance-blocked mismatch (mirage 2 + 7 != 3), while the flat
  // path scores +1 and the published 3 ADD still converges.
  const divergentParadox = new Map<string, { add_bonus: number; add_bonus_rotational: number }>([
    ['paradox', { add_bonus: 1, add_bonus_rotational: 7 }],
  ]);

  it('scores paradox on the rotational base mirage by its flat +1, keeping paradox-mirage convergent', () => {
    const result = assertFirstClassConvergence(
      'paradox_mirage',
      { canonical_name: 'paradox mirage', adds: 3, base_trick: 'mirage', notation: 'PARADOX MIRAGE' },
      ['paradox'],
      divergentParadox,
      2,
    );
    expect(result.status).not.toBe('governance-blocked');
    expect(result.status).toBe('first-class');
  });
});
