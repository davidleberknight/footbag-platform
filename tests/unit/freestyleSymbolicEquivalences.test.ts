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
