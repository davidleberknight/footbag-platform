/**
 * Unit tests for freestyleAliasGovernance.ts (the alias allow-list module).
 *
 * Long-term contract: the allow-list is restraint-first — aliases NOT
 * explicitly approved are NOT surfaced on compact-object browse surfaces.
 * Approved aliases render in their `displayAs` form when set.
 */
import { describe, it, expect } from 'vitest';

import {
  ALIAS_GOVERNANCE_ENTRIES,
  getAliasGovernanceEntry,
  filterAliasesForBrowse,
} from '../../src/content/freestyleAliasGovernance';

describe('freestyleAliasGovernance — allow-list entries', () => {
  it('keeps the around-the-world ATW shorthand off browse surfaces', () => {
    // ATW abbreviates the canonical name rather than naming the trick
    // independently, so it is a search-only alias and carries no rendered form.
    const entry = getAliasGovernanceEntry('around_the_world', 'atw');
    expect(entry).not.toBeNull();
    expect(entry?.surfaceOnBrowse).toBe(false);
    expect(entry?.displayAs).toBeNull();
  });

  it('marks illusion ≡ outside-in mirage as suppressed (folk record only)', () => {
    const entry = getAliasGovernanceEntry('illusion', 'outside-in mirage');
    expect(entry).not.toBeNull();
    // "outside-in mirage" misrepresents illusion (illusion is a dex with
    // mid-flight rotation, not a directional mirage variant); kept as a folk
    // record but suppressed from compact browse surfaces.
    expect(entry?.surfaceOnBrowse).toBe(false);
  });

  it('marks legover ≡ leg-over as orthographic (NOT surface)', () => {
    const entry = getAliasGovernanceEntry('legover', 'leg-over');
    expect(entry).not.toBeNull();
    expect(entry?.surfaceOnBrowse).toBe(false);
  });

  it('marks osis ≡ frigidosis as suppressed pending doctrine resolution (NOT surface)', () => {
    const entry = getAliasGovernanceEntry('osis', 'frigidosis');
    expect(entry).not.toBeNull();
    expect(entry?.surfaceOnBrowse).toBe(false);
  });

  it('holds no entry for swirl ≡ reverse swirl, which is a separate canonical trick', () => {
    // Reverse-swirl has its own canonical row, so no alias pairs it with swirl
    // and the restraint-first default keeps any such pair off browse anyway.
    expect(getAliasGovernanceEntry('swirl', 'reverse swirl')).toBeNull();
    expect(filterAliasesForBrowse('swirl', ['reverse swirl'])).toEqual([]);
  });
});

describe('freestyleAliasGovernance — lookup behavior', () => {
  it('is case-insensitive on both slug and alias text', () => {
    expect(getAliasGovernanceEntry('AROUND_THE_WORLD', 'ATW')).not.toBeNull();
    // The illusion entry is surfaceOnBrowse:false, because the "outside-in
    // mirage" reading misrepresents illusion. Lookup still resolves it; only
    // the surfacing flag is off.
    expect(getAliasGovernanceEntry('  illusion  ', 'OUTSIDE-IN MIRAGE')).not.toBeNull();
    expect(getAliasGovernanceEntry('  illusion  ', 'OUTSIDE-IN MIRAGE')?.surfaceOnBrowse).toBe(false);
  });

  it('returns null for unknown (slug, alias) pairs (restraint-first default)', () => {
    expect(getAliasGovernanceEntry('mobius', 'magic-spin')).toBeNull();
    expect(getAliasGovernanceEntry('newtrick', 'somename')).toBeNull();
    expect(getAliasGovernanceEntry('', '')).toBeNull();
  });
});

describe('freestyleAliasGovernance — filterAliasesForBrowse', () => {
  it('surfaces nothing for around-the-world, whose only entry is off', () => {
    const filtered = filterAliasesForBrowse('around_the_world', ['atw', 'someOtherAlias']);
    expect(filtered).toEqual([]);
  });

  it('returns empty when no aliases match the allow-list', () => {
    const filtered = filterAliasesForBrowse('mobius', ['gyro torque']);
    expect(filtered).toEqual([]);
  });

  it('drops not-surface entries (legover leg-over is in the registry but marked false)', () => {
    const filtered = filterAliasesForBrowse('legover', ['leg-over']);
    expect(filtered).toEqual([]);
  });

  it('drops aliases entirely absent from the registry (restraint-first default)', () => {
    const filtered = filterAliasesForBrowse('newtrick', ['some-alias', 'another-alias']);
    expect(filtered).toEqual([]);
  });
});

describe('freestyleAliasGovernance — registry hygiene', () => {
  it('every entry carries a non-empty curator reason', () => {
    for (const entry of ALIAS_GOVERNANCE_ENTRIES) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('no duplicate (trickSlug, aliasText) pairs in the registry', () => {
    const seen = new Set<string>();
    for (const entry of ALIAS_GOVERNANCE_ENTRIES) {
      const key = `${entry.trickSlug.toLowerCase()}::${entry.aliasText.toLowerCase()}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
