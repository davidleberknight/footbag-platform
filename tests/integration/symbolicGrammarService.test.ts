/**
 * Integration tests for symbolicGrammarService.
 *
 * Verifies the observational symbolic-grammar layer (now DB-backed):
 *   - Reads the symbolic_* tables once on first call (lazy cache)
 *   - Returns shaped types with layerSource='observational' marker
 *   - Fails gracefully when tables are empty (returns [] / null; never throws)
 *   - Index lookups (by slug, by group, by term) work bidirectionally
 *   - Cache reset hook works for test isolation
 *
 * The test DB is seeded from the committed symbolic-grammar CSVs so the
 * assertions exercise the real observational data through the DB read path.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3702');
let svc: typeof import('../../src/services/symbolicGrammarService')['symbolicGrammarService'];

beforeAll(async () => {
  // createTestDb seeds the symbolic_* tables from the committed CSVs.
  createTestDb(dbPath).close();
  svc = (await import('../../src/services/symbolicGrammarService')).symbolicGrammarService;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  svc.__resetCacheForTesting();
});

describe('symbolicGrammarService — equivalence clusters', () => {
  it('returns all clusters from the DB', () => {
    const clusters = svc.getEquivalenceClusters();
    expect(clusters.length).toBeGreaterThanOrEqual(15);
    for (const c of clusters) {
      expect(c.layerSource).toBe('observational');
    }
  });

  it('finds wing-on-butterfly cluster by id', () => {
    const clusters = svc.getEquivalenceClusters();
    const wing = clusters.find(c => c.clusterId === 'wing-on-butterfly');
    expect(wing).toBeDefined();
    expect(wing!.memberTrickSlugs).toContain('butterfly');
    expect(wing!.memberTrickSlugs).toContain('ripwalk');
    expect(wing!.anchorTopologyGroup).toBe('butterfly-wing-topology');
  });

  it('getClustersForSlug returns matching clusters', () => {
    const ripwalkClusters = svc.getClustersForSlug('ripwalk');
    expect(ripwalkClusters.length).toBeGreaterThan(0);
    const ids = ripwalkClusters.map(c => c.clusterId);
    expect(ids).toContain('wing-on-butterfly');
  });
});

describe('symbolicGrammarService — group memberships', () => {
  it('returns memberships for a known slug', () => {
    const memberships = svc.getMembershipsForSlug('ripwalk');
    expect(memberships.length).toBeGreaterThan(0);
    for (const m of memberships) {
      expect(m.layerSource).toBe('observational');
      expect(m.trickSlug).toBe('ripwalk');
    }
    const groupIds = memberships.map(m => m.symbolicGroupId);
    expect(groupIds).toContain('butterfly-wing-topology');
  });

  it('returns empty for unknown slug', () => {
    expect(svc.getMembershipsForSlug('not-a-real-slug-xyz')).toEqual([]);
  });

  it('reverse-lookup: getMembersOfGroup returns all slugs in a group', () => {
    const members = svc.getMembersOfGroup('butterfly-wing-topology');
    expect(members.length).toBeGreaterThan(0);
    const slugs = members.map(m => m.trickSlug);
    expect(slugs).toContain('butterfly');
    expect(slugs).toContain('ripwalk');
  });

  it('returns empty for unknown group id', () => {
    expect(svc.getMembersOfGroup('not-a-real-group')).toEqual([]);
  });
});

describe('symbolicGrammarService — movement archetypes', () => {
  it('returns all archetypes', () => {
    const archetypes = svc.getMovementArchetypes();
    expect(archetypes.length).toBeGreaterThanOrEqual(10);
    for (const a of archetypes) {
      expect(a.layerSource).toBe('observational');
    }
  });

  it('parses minAdds and maxAdds as numbers', () => {
    const archetypes = svc.getMovementArchetypes();
    const withAddRange = archetypes.find(a => a.minAdds !== null && a.maxAdds !== null);
    expect(withAddRange).toBeDefined();
    expect(typeof withAddRange!.minAdds).toBe('number');
    expect(typeof withAddRange!.maxAdds).toBe('number');
  });
});

describe('symbolicGrammarService — topology + modifier groups', () => {
  it('gets butterfly-wing-topology by id', () => {
    const group = svc.getTopologyGroup('butterfly-wing-topology');
    expect(group).not.toBeNull();
    expect(group!.classificationAxis).toBe('topology');
    expect(group!.layerSource).toBe('observational');
  });

  it('returns null for unknown topology group', () => {
    expect(svc.getTopologyGroup('not-a-real-group')).toBeNull();
  });

  it('gets spinning-family modifier group', () => {
    const group = svc.getModifierGroup('spinning-family');
    expect(group).not.toBeNull();
    expect(group!.classificationAxis).toBe('modifier');
    expect(group!.displayName).toMatch(/spinning/i);
  });

  it('gets paradox-family modifier group', () => {
    const group = svc.getModifierGroup('paradox-family');
    expect(group).not.toBeNull();
    expect(group!.layerSource).toBe('observational');
  });
});

describe('symbolicGrammarService — glossary crosslinks', () => {
  it('returns crosslinks for paradox term (case-insensitive)', () => {
    const lower = svc.getCrosslinksForTerm('paradox');
    const upper = svc.getCrosslinksForTerm('PARADOX');
    expect(lower.length).toBeGreaterThan(0);
    expect(lower.length).toBe(upper.length);
  });

  it('indexes term bidirectionally (term may appear as either side)', () => {
    const ducking = svc.getCrosslinksForTerm('ducking');
    expect(ducking.length).toBeGreaterThan(0);
    for (const c of ducking) {
      expect([c.termA.toLowerCase(), c.termB.toLowerCase()]).toContain('ducking');
    }
  });

  it('returns empty for unknown term', () => {
    expect(svc.getCrosslinksForTerm('not-a-real-term-xyz')).toEqual([]);
  });
});

describe('symbolicGrammarService — cache + fail-safe', () => {
  it('does not throw on first call', () => {
    expect(() => svc.getEquivalenceClusters()).not.toThrow();
  });

  it('returns same array reference on subsequent calls (cache stable)', () => {
    const first = svc.getEquivalenceClusters();
    const second = svc.getEquivalenceClusters();
    expect(first).toBe(second);
  });

  it('reset hook clears cache; next call rebuilds', () => {
    const first = svc.getEquivalenceClusters();
    svc.__resetCacheForTesting();
    const second = svc.getEquivalenceClusters();
    expect(first).not.toBe(second);
    expect(first.length).toBe(second.length);
  });
});

describe('symbolicGrammarService — observational-layer separation', () => {
  it('every shape has layerSource=observational', () => {
    expect(svc.getEquivalenceClusters()[0]?.layerSource).toBe('observational');
    expect(svc.getMembershipsForSlug('butterfly')[0]?.layerSource).toBe('observational');
    expect(svc.getMovementArchetypes()[0]?.layerSource).toBe('observational');
    expect(svc.getTopologyGroup('butterfly-wing-topology')?.layerSource).toBe('observational');
    expect(svc.getModifierGroup('spinning-family')?.layerSource).toBe('observational');
    const crosslinks = svc.getCrosslinksForTerm('paradox');
    if (crosslinks.length > 0) {
      expect(crosslinks[0]?.layerSource).toBe('observational');
    }
  });
});
