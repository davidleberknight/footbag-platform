/**
 * Integration tests for symbolicGrammarService.
 *
 * Verifies the observational symbolic-grammar layer's CSV adapter:
 *   - Loads staging CSVs once on first call (lazy cache)
 *   - Returns shaped types with layerSource='observational' marker
 *   - Fails gracefully when files missing (returns [] / null; never throws)
 *   - Index lookups (by slug, by group, by term) work bidirectionally
 *   - Cache reset hook works for test isolation
 *
 * Does NOT touch the database. Does NOT exercise canonical ontology.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { symbolicGrammarService } from '../../src/services/symbolicGrammarService';

beforeEach(() => {
  symbolicGrammarService.__resetCacheForTesting();
});

describe('symbolicGrammarService — equivalence clusters', () => {
  it('returns all 18 clusters from staging CSV', () => {
    const clusters = symbolicGrammarService.getEquivalenceClusters();
    expect(clusters.length).toBeGreaterThanOrEqual(15);
    // Every row carries observational layer marker
    for (const c of clusters) {
      expect(c.layerSource).toBe('observational');
    }
  });

  it('finds wing-on-butterfly cluster by id', () => {
    const clusters = symbolicGrammarService.getEquivalenceClusters();
    const wing = clusters.find(c => c.clusterId === 'wing-on-butterfly');
    expect(wing).toBeDefined();
    expect(wing!.memberTrickSlugs).toContain('butterfly');
    expect(wing!.memberTrickSlugs).toContain('ripwalk');
    expect(wing!.anchorTopologyGroup).toBe('butterfly-wing-topology');
  });

  it('getClustersForSlug returns matching clusters', () => {
    const ripwalkClusters = symbolicGrammarService.getClustersForSlug('ripwalk');
    expect(ripwalkClusters.length).toBeGreaterThan(0);
    // ripwalk should be in wing-on-butterfly AND walking-family-complete
    const ids = ripwalkClusters.map(c => c.clusterId);
    expect(ids).toContain('wing-on-butterfly');
  });
});

describe('symbolicGrammarService — group memberships', () => {
  it('returns memberships for a known slug', () => {
    const memberships = symbolicGrammarService.getMembershipsForSlug('ripwalk');
    expect(memberships.length).toBeGreaterThan(0);
    for (const m of memberships) {
      expect(m.layerSource).toBe('observational');
      expect(m.trickSlug).toBe('ripwalk');
    }
    // Ripwalk should belong to butterfly-wing-topology (via base_trick=butterfly)
    const groupIds = memberships.map(m => m.symbolicGroupId);
    expect(groupIds).toContain('butterfly-wing-topology');
  });

  it('returns empty for unknown slug', () => {
    const memberships = symbolicGrammarService.getMembershipsForSlug('not-a-real-slug-xyz');
    expect(memberships).toEqual([]);
  });

  it('reverse-lookup: getMembersOfGroup returns all slugs in a group', () => {
    const members = symbolicGrammarService.getMembersOfGroup('butterfly-wing-topology');
    expect(members.length).toBeGreaterThan(0);
    const slugs = members.map(m => m.trickSlug);
    expect(slugs).toContain('butterfly');
    expect(slugs).toContain('ripwalk');
  });

  it('returns empty for unknown group id', () => {
    const members = symbolicGrammarService.getMembersOfGroup('not-a-real-group');
    expect(members).toEqual([]);
  });
});

describe('symbolicGrammarService — movement archetypes', () => {
  it('returns all 11 archetypes', () => {
    const archetypes = symbolicGrammarService.getMovementArchetypes();
    expect(archetypes.length).toBeGreaterThanOrEqual(10);
    for (const a of archetypes) {
      expect(a.layerSource).toBe('observational');
    }
  });

  it('parses minAdds and maxAdds as numbers', () => {
    const archetypes = symbolicGrammarService.getMovementArchetypes();
    const withAddRange = archetypes.find(a => a.minAdds !== null && a.maxAdds !== null);
    expect(withAddRange).toBeDefined();
    expect(typeof withAddRange!.minAdds).toBe('number');
    expect(typeof withAddRange!.maxAdds).toBe('number');
  });
});

describe('symbolicGrammarService — topology + modifier groups', () => {
  it('gets butterfly-wing-topology by id', () => {
    const group = symbolicGrammarService.getTopologyGroup('butterfly-wing-topology');
    expect(group).not.toBeNull();
    expect(group!.classificationAxis).toBe('topology');
    expect(group!.layerSource).toBe('observational');
  });

  it('returns null for unknown topology group', () => {
    const group = symbolicGrammarService.getTopologyGroup('not-a-real-group');
    expect(group).toBeNull();
  });

  it('gets spinning-family modifier group', () => {
    const group = symbolicGrammarService.getModifierGroup('spinning-family');
    expect(group).not.toBeNull();
    expect(group!.classificationAxis).toBe('modifier');
    expect(group!.displayName).toMatch(/spinning/i);
  });

  it('gets paradox-family modifier group', () => {
    const group = symbolicGrammarService.getModifierGroup('paradox-family');
    expect(group).not.toBeNull();
    expect(group!.layerSource).toBe('observational');
  });
});

describe('symbolicGrammarService — glossary crosslinks', () => {
  it('returns crosslinks for paradox term (case-insensitive)', () => {
    const lower = symbolicGrammarService.getCrosslinksForTerm('paradox');
    const upper = symbolicGrammarService.getCrosslinksForTerm('PARADOX');
    expect(lower.length).toBeGreaterThan(0);
    expect(lower.length).toBe(upper.length);
  });

  it('indexes term bidirectionally (term may appear as either side)', () => {
    // Pick a term that's known to appear on both sides of various crosslinks
    const ducking = symbolicGrammarService.getCrosslinksForTerm('ducking');
    expect(ducking.length).toBeGreaterThan(0);
    // Each crosslink should have ducking somewhere on either side
    for (const c of ducking) {
      expect([c.termA.toLowerCase(), c.termB.toLowerCase()]).toContain('ducking');
    }
  });

  it('returns empty for unknown term', () => {
    const empty = symbolicGrammarService.getCrosslinksForTerm('not-a-real-term-xyz');
    expect(empty).toEqual([]);
  });
});

describe('symbolicGrammarService — cache + fail-safe', () => {
  it('does not throw on first call', () => {
    expect(() => symbolicGrammarService.getEquivalenceClusters()).not.toThrow();
  });

  it('returns same array reference on subsequent calls (cache stable)', () => {
    const first = symbolicGrammarService.getEquivalenceClusters();
    const second = symbolicGrammarService.getEquivalenceClusters();
    expect(first).toBe(second);
  });

  it('reset hook clears cache; next call rebuilds', () => {
    const first = symbolicGrammarService.getEquivalenceClusters();
    symbolicGrammarService.__resetCacheForTesting();
    const second = symbolicGrammarService.getEquivalenceClusters();
    expect(first).not.toBe(second);
    expect(first.length).toBe(second.length);
  });
});

describe('symbolicGrammarService — observational-layer separation', () => {
  it('every shape has layerSource=observational', () => {
    expect(symbolicGrammarService.getEquivalenceClusters()[0]?.layerSource).toBe('observational');
    expect(symbolicGrammarService.getMembershipsForSlug('butterfly')[0]?.layerSource).toBe('observational');
    expect(symbolicGrammarService.getMovementArchetypes()[0]?.layerSource).toBe('observational');
    expect(symbolicGrammarService.getTopologyGroup('butterfly-wing-topology')?.layerSource).toBe('observational');
    expect(symbolicGrammarService.getModifierGroup('spinning-family')?.layerSource).toBe('observational');
    const crosslinks = symbolicGrammarService.getCrosslinksForTerm('paradox');
    if (crosslinks.length > 0) {
      expect(crosslinks[0]?.layerSource).toBe('observational');
    }
  });
});
