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

  it('slugs are kebab-case (DB-canonical form)', () => {
    for (const chain of SYMBOLIC_EQUIVALENCE_CHAINS) {
      expect(chain.slug).toMatch(/^[a-z0-9-]+$/);
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
  // S2 entries (already locked in earlier slice):
  it('S2 entries: torque / blender / drifter / vortex / eggbeater / omelette', () => {
    expect(getSymbolicEquivalenceChain('torque')?.readings).toEqual(['miraging osis']);
    expect(getSymbolicEquivalenceChain('blender')?.readings).toEqual(['whirling osis']);
    expect(getSymbolicEquivalenceChain('drifter')?.readings).toEqual(['miraging clipper']);
    expect(getSymbolicEquivalenceChain('vortex')?.readings).toEqual(['gyro drifter']);
    expect(getSymbolicEquivalenceChain('eggbeater')?.readings).toEqual(['atomic legover']);
    expect(getSymbolicEquivalenceChain('omelette')?.readings).toEqual(['atomic illusion']);
  });

  // NR-1 entries (this slice; 17 maintainer-approved canon-locked readings):
  it('NR-1 illusion-family: flail / smudge', () => {
    expect(getSymbolicEquivalenceChain('flail')?.readings).toEqual(['symposium illusion']);
    expect(getSymbolicEquivalenceChain('smudge')?.readings).toEqual(['pixie illusion']);
  });

  it('NR-1 pixie-family compounds: smoke / smog', () => {
    expect(getSymbolicEquivalenceChain('smoke')?.readings).toEqual(['pixie drifter']);
    expect(getSymbolicEquivalenceChain('smog')?.readings).toEqual(['pixie double legover']);
  });

  it('NR-1 royale + flurry + dlo', () => {
    expect(getSymbolicEquivalenceChain('royale')?.readings).toEqual(['paradox reverse drifter']);
    expect(getSymbolicEquivalenceChain('flurry')?.readings).toEqual(['barraging legover']);
    expect(getSymbolicEquivalenceChain('double-leg-over')?.readings).toEqual(['miraging legover']);
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
    expect(getSymbolicEquivalenceChain('grave-digger')?.readings).toEqual(['stepping ss torque']);
    expect(getSymbolicEquivalenceChain('nemesis')?.readings).toEqual(['furious barfly']);
    expect(getSymbolicEquivalenceChain('atomic-torque')?.readings).toEqual(['atomic torque']);
  });

  it('all NR-1 entries are flagged curator-confirmed (not pending)', () => {
    const nr1Slugs = [
      'flail', 'smudge', 'smoke', 'smog', 'royale', 'flurry', 'double-leg-over',
      'surge', 'surreal', 'surgery', 'venom', 'bigwalk',
      'plasma', 'fusion', 'grave-digger', 'nemesis', 'atomic-torque',
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

describe('freestyleSymbolicEquivalences — Pre-Red completion sweep chain additions (2026-05-16)', () => {
  // 7 externally-supported chain entries grounded by Slice P. Each
  // reading is structurally clean (decomposes through known operators
  // onto a canonical base trick) and carries no Wave 2 dependency.

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
    const chain = getSymbolicEquivalenceChain('mind-bender');
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

  it('witchdoctor resolves to atomic symposium mirage (FM only — curatorConfirmPending=true)', () => {
    const chain = getSymbolicEquivalenceChain('witchdoctor');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['atomic symposium mirage']);
    // FM is the only source — pill stays in UNRESOLVED_COMPOUNDS;
    // chain entry is provisional pending PB or Red corroboration.
    expect(chain?.curatorConfirmPending).toBe(true);
  });
});

describe('freestyleSymbolicEquivalences — Slice N branch-family chain additions', () => {
  it('paradox-blender resolves to a two-stop chain', () => {
    const chain = getSymbolicEquivalenceChain('paradox-blender');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['paradox blender', 'paradox whirling op osis']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });

  it('food-processor surfaces the Red-locked Blurry-Blender reading', () => {
    const chain = getSymbolicEquivalenceChain('food-processor');
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
    const chain = getSymbolicEquivalenceChain('paradox-drifter');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['paradox drifter', 'paradox miraging clipper']);
    expect(chain?.curatorConfirmPending).toBe(false);
  });
});

describe('freestyleSymbolicEquivalences — Path A chain additions (2026-05-17, Slice X follow-on)', () => {
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
    const chain = getSymbolicEquivalenceChain('scrambled-eggbeater');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['atomic pickup']);
    expect(chain?.curatorConfirmPending).toBe(true);
  });

  it('spinal-tap resolves to tapping torque (FM only, curatorConfirmPending=true)', () => {
    const chain = getSymbolicEquivalenceChain('spinal-tap');
    expect(chain).not.toBeNull();
    expect(chain?.readings).toEqual(['tapping torque']);
    expect(chain?.curatorConfirmPending).toBe(true);
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
