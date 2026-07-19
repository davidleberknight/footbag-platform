/**
 * Unit tests for freestyleSymbolicEquivalences.ts (the curator chain registry).
 *
 * Long-term contract: every entry expresses a canon-locked compositional
 * reading. Stopping-depth is curator-authored (no automatic recursion).
 * Slugs match canonical DB form. Maximum 3 readings per entry.
 */
import { describe, it, expect } from 'vitest';

import {
  SYMBOLIC_EQUIVALENCE_CHAINS,
  getSymbolicEquivalenceChain,
} from '../../src/content/freestyleSymbolicEquivalences';

describe('freestyleSymbolicEquivalences — registry hygiene', () => {
  it('every chain has at least one reading', () => {
    for (const chain of SYMBOLIC_EQUIVALENCE_CHAINS) {
      expect(chain.readings.length).toBeGreaterThan(0);
    }
  });

  it('no chain exceeds 3 readings (file-header rule)', () => {
    for (const chain of SYMBOLIC_EQUIVALENCE_CHAINS) {
      expect(chain.readings.length).toBeLessThanOrEqual(3);
    }
  });

  it('no duplicate slugs', () => {
    const seen = new Set<string>();
    for (const chain of SYMBOLIC_EQUIVALENCE_CHAINS) {
      expect(seen.has(chain.slug)).toBe(false);
      seen.add(chain.slug);
    }
  });

  it('slugs are underscore (DB-canonical form)', () => {
    for (const chain of SYMBOLIC_EQUIVALENCE_CHAINS) {
      expect(chain.slug).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    }
  });

  it('readings are non-empty trimmed strings', () => {
    for (const chain of SYMBOLIC_EQUIVALENCE_CHAINS) {
      for (const reading of chain.readings) {
        expect(reading.trim().length).toBeGreaterThan(0);
        expect(reading).toBe(reading.trim());
      }
    }
  });
});

describe('freestyleSymbolicEquivalences — CSR S2 + NR-1 entries are present', () => {
  // S2 entries (canon-locked):
  it('S2 entries: torque / blender / drifter / vortex / eggbeater / omelette', () => {
    expect(getSymbolicEquivalenceChain('torque')?.readings).toEqual(['quantum osis']);
    expect(getSymbolicEquivalenceChain('blender')?.readings).toEqual(['whirling osis']);
    // drifter's "miraging clipper" reading is held for curator review: no chain.
    expect(getSymbolicEquivalenceChain('drifter')).toBeNull();
    expect(getSymbolicEquivalenceChain('vortex')?.readings).toEqual(['gyro drifter']);
    expect(getSymbolicEquivalenceChain('eggbeater')?.readings).toEqual(['atomic legover', 'illusioning legover']);
    expect(getSymbolicEquivalenceChain('omelette')?.readings).toEqual(['atomic illusion']);
  });

  // NR-1 entries (17 maintainer-approved canon-locked readings):
  it('NR-1 illusion-family: flail / smudge', () => {
    expect(getSymbolicEquivalenceChain('flail')?.readings).toEqual(['symposium illusion']);
    expect(getSymbolicEquivalenceChain('smudge')?.readings).toEqual(['pixie illusion']);
  });

  it('NR-1 pixie-family compounds: smoke / smog', () => {
    expect(getSymbolicEquivalenceChain('smoke')?.readings).toEqual(['pixie drifter']);
    expect(getSymbolicEquivalenceChain('smog')?.readings).toEqual(['pixie double legover']);
  });

  it('NR-1 royale + dlo (flurry has no SE chain; S9 sole owner)', () => {
    expect(getSymbolicEquivalenceChain('royale')?.readings).toEqual(['paradox reverse drifter']);
    // DLO's "miraging legover" reading is held for curator review: no chain.
    expect(getSymbolicEquivalenceChain('double_leg_over')).toBeNull();
    // flurry carries no chain here: it is an equivalent-derivation case
    // (two valid paths converge on 4 ADD) owned exclusively by S9
    // (EQUIVALENCE_TOPOLOGY); an S5 chain would duplicate one path and
    // obscure the other.
    expect(getSymbolicEquivalenceChain('flurry')).toBeNull();
  });

  it('NR-1 surging-family (pt2): surge / surreal / surgery / venom / bigwalk', () => {
    expect(getSymbolicEquivalenceChain('surge')?.readings).toEqual(['surging paradox mirage']);
    expect(getSymbolicEquivalenceChain('surreal')?.readings).toEqual(['surging paradox whirl']);
    expect(getSymbolicEquivalenceChain('surgery')?.readings).toEqual(['surging symposium reverse whirl']);
    expect(getSymbolicEquivalenceChain('venom')?.readings).toEqual(['surging barfly']);
    expect(getSymbolicEquivalenceChain('bigwalk')?.readings).toEqual(['surging butterfly']);
  });

  it('NR-1 double-over-down family: plasma / fusion', () => {
    expect(getSymbolicEquivalenceChain('plasma')?.readings).toEqual(['quantum double over down']);
    expect(getSymbolicEquivalenceChain('fusion')?.readings).toEqual(['atomic double over down']);
  });

  it('NR-1 torque-family: grave-digger / nemesis / atomic-torque', () => {
    expect(getSymbolicEquivalenceChain('grave_digger')?.readings).toEqual(['stepping ss torque']);
    expect(getSymbolicEquivalenceChain('nemesis')?.readings).toEqual(['furious barfly']);
    expect(getSymbolicEquivalenceChain('atomic_torque')?.readings).toEqual(['atomic torque']);
  });

  it('all NR-1 entries are flagged curator-confirmed (not pending)', () => {
    // flurry is excluded: it has no SE chain (S9 sole owner)
    const nr1Slugs = [
      'flail', 'smudge', 'smoke', 'smog', 'royale',
      'surge', 'surreal', 'surgery', 'venom', 'bigwalk',
      'plasma', 'fusion', 'grave_digger', 'nemesis', 'atomic_torque',
    ];
    for (const slug of nr1Slugs) {
      const chain = getSymbolicEquivalenceChain(slug);
      expect(chain).not.toBeNull();
      expect(chain?.curatorConfirmPending).toBe(false);
    }
  });

  // NR-1C entry: gauntlet's two-reading chain demonstrates Blurry-compression.
  // The shorter and unfolded readings are equivalent per pt11
  // (Blurry = Stepping Paradox). Same trick, two pedagogical stopping depths.
  it('NR-1C gauntlet surfaces two pt11-locked readings (Blurry-compression flagship)', () => {
    const chain = getSymbolicEquivalenceChain('gauntlet');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['blurry ducking torque', 'stepping ducking paradox torque']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });
});

describe('freestyleSymbolicEquivalences — externally-supported chain entries', () => {
  // 7 externally-supported chain entries. Each reading is structurally
  // clean (decomposes through known operators onto a canonical base
  // trick).

  it('merkon resolves to spinning legover (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('merkon');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['spinning legover']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('magellan resolves to pixie legover (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('magellan');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['pixie legover']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('parkwalk resolves to pixie butterfly (FM+PB agree); curatorConfirmPending=true', () => {
    const chain = getSymbolicEquivalenceChain('parkwalk');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['pixie butterfly']);
    // Same reading as dimwalk — curator-confirm-pending until parkwalk
    // is verified distinct from dimwalk or recognized as an alias.
    expect(chain?.curatorConfirmPending).toBe(true);
  });

  it('pigbeater resolves to pixie eggbeater (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('pigbeater');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['pixie eggbeater']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('mind-bender resolves to ducking paradox blender (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('mind_bender');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['ducking paradox blender']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('tomahawk resolves to ducking paradox whirl (FM+PB agree); also removed from UNRESOLVED_COMPOUNDS', () => {
    const chain = getSymbolicEquivalenceChain('tomahawk');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['ducking paradox whirl']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('witchdoctor has no SE chain (S9 sole owner)', () => {
    // "atomic symposium mirage" is a historical equivalent-derivation
    // reading preserved in S9 (EQUIVALENCE_TOPOLOGY) with role='historical'.
    // S5 would compete with S9 for the same reading and confuse the
    // canonical-primary vs historical-context relationship.
    expect(getSymbolicEquivalenceChain('witchdoctor')).toBeNull();
  });
});

describe('freestyleSymbolicEquivalences — branch-family chain additions', () => {
  it('paradox-blender resolves to a two-stop chain', () => {
    const chain = getSymbolicEquivalenceChain('paradox_blender');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['paradox blender', 'paradox whirling op osis']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('food-processor surfaces the Red-locked Blurry-Blender reading', () => {
    const chain = getSymbolicEquivalenceChain('food_processor');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['blurry blender', 'stepping paradox blender']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('spender carries the FAMILY_TEXTS-confirmed Spinning-Paradox-Blender reading', () => {
    const chain = getSymbolicEquivalenceChain('spender');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['spinning paradox blender']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('paradox-drifter resolves to a two-stop chain (parallel to paradox-blender)', () => {
    const chain = getSymbolicEquivalenceChain('paradox_drifter');
    expect(chain).not.toBeNull();
    // The deeper 'paradox miraging clipper' extension is held with drifter's own
    // decomposition; only the tautological 'paradox drifter' remains (and it is
    // dropped by the tautological filter at render time).
    expect(chain?.readings).toEqual(['paradox drifter']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });
});

describe('freestyleSymbolicEquivalences — Path A chain additions', () => {
  // 5 additional chain entries for existing IFPA rows lacking chains.
  // Multi-source-agreed entries use curatorConfirmPending=false; FM-only
  // entries use curatorConfirmPending=true per the witchdoctor precedent.

  it('tombstone resolves to stepping drifter (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('tombstone');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['stepping drifter']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('paste resolves to pixie pickup (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('paste');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['pixie pickup']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('haze resolves to stepping double-leg-over (FM only, curatorConfirmPending=true)', () => {
    const chain = getSymbolicEquivalenceChain('haze');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['stepping double-leg-over']);
    expect(chain?.curatorConfirmPending).toBe(true);
  });

  it('scrambled-eggbeater resolves to atomic pickup (FM only, curatorConfirmPending=true)', () => {
    const chain = getSymbolicEquivalenceChain('scrambled_eggbeater');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['atomic pickup']);
    expect(chain?.curatorConfirmPending).toBe(true);
  });

  it('spinal-tap resolves to tapping torque (FM only, curatorConfirmPending=true)', () => {
    const chain = getSymbolicEquivalenceChain('spinal_tap');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['tapping torque']);
    expect(chain?.curatorConfirmPending).toBe(true);
  });
});

describe('freestyleSymbolicEquivalences — Path B canonical promotions', () => {
  // 5 canonical tricks promoted via red_additions_2026_04_20.csv.
  // These chains land alongside the loader-19 row so the trick is
  // publishable from first DB rebuild (CTPC Principle 1: symbolic
  // representation present from day one). DB-resident verification happens
  // post-rebuild and lives in integration tests, not here.

  it('assassin resolves to pixie ducking mirage (FM+PB agree, far=+0 positional)', () => {
    const chain = getSymbolicEquivalenceChain('assassin');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['pixie ducking mirage']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('mantis resolves to gyro eggbeater (FM+PB agree, near=+0 positional; Red-locked gyro)', () => {
    const chain = getSymbolicEquivalenceChain('mantis');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['gyro eggbeater']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('nova resolves to symposium double-leg-over (FM+PB agree)', () => {
    const chain = getSymbolicEquivalenceChain('nova');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['symposium double-leg-over']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('tapdown resolves to tapping butterfly (FM only, curatorConfirmPending=true)', () => {
    const chain = getSymbolicEquivalenceChain('tapdown');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['tapping butterfly']);
    expect(chain?.curatorConfirmPending).toBe(true);
  });

  it('big-apple resolves to gyro symposium torque (FM+PB agree via Symp. Mobius unfolding)', () => {
    const chain = getSymbolicEquivalenceChain('big_apple');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['gyro symposium torque']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });
});

describe('freestyleSymbolicEquivalences — composed-set folk-name dispositions', () => {
  // Five folk-name prefixes ruled to decompose to stacks of registered
  // operators (no new primitives). shooting-star is dispositioned as an alias
  // on its decomposition rather than a standalone row (no competition record).
  it('shooting-star resolves to its symposium-stepping-paradox-illusioning decomposition', () => {
    const chain = getSymbolicEquivalenceChain('shooting_star');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['symposium stepping paradox illusioning']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('the four composed-set tokens resolve to their operator stacks', () => {
    expect(getSymbolicEquivalenceChain('flailing')?.readings).toEqual(['symposium illusioning']);
    expect(getSymbolicEquivalenceChain('surfing')?.readings).toEqual(['fairy symposium swirling']);
    expect(getSymbolicEquivalenceChain('slicing')?.readings).toEqual(['gyro whirling']);
    expect(getSymbolicEquivalenceChain('splicing')?.readings).toEqual(['gyro reving']);
  });

  it('all five composed-set dispositions are curator-confirmed (not pending)', () => {
    for (const slug of ['shooting_star', 'flailing', 'surfing', 'slicing', 'splicing']) {
      expect(getSymbolicEquivalenceChain(slug)?.curatorConfirmPending).toBe(false);
    }
  });
});

describe('freestyleSymbolicEquivalences — lookup behavior', () => {
  it('is case-insensitive and trims whitespace', () => {
    expect(getSymbolicEquivalenceChain('MOBIUS')?.slug).toBe('mobius');
    expect(getSymbolicEquivalenceChain('  Torque  ')?.slug).toBe('torque');
  });

  it('returns null for unknown slugs', () => {
    expect(getSymbolicEquivalenceChain('not-a-trick')).toBeNull();
    expect(getSymbolicEquivalenceChain('')).toBeNull();
  });
});
