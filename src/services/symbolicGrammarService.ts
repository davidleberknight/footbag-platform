/**
 * symbolicGrammarService.ts
 *
 * Observational symbolic-grammar layer (Layer 3). Backed by the symbolic_*
 * database tables, loaded from the committed symbolic-grammar CSVs by
 * freestyle/loaders/26_load_symbolic_grammar.py.
 *
 * This service NEVER touches canonical ontology tables. It is parallel to
 * canonical IFPA family-based relating (which lives in `freestyleRelatedTricks.ts`)
 * and is clearly distinct in:
 *   - type prefix (`Symbolic*`)
 *   - layer attribution (`layerSource: 'observational'` on every shape)
 *   - source (observational symbolic_* tables vs canonical relating)
 *
 * Caching: module-level lazy load. Rows read once at first call; held in memory.
 * Fail-safe: if the tables are absent or empty, methods return empty arrays /
 * null. This ensures the public surface degrades gracefully rather than
 * throwing in the request path.
 *
 * Observational layer: outputs are descriptive symbolic-grammar shape, never
 * canonical doctrine.
 */
import { symbolicGrammar } from '../db/db';

// ─────────────────────────────────────────────────────────────────────────
// Types — all prefixed Symbolic* to mark observational layer
// ─────────────────────────────────────────────────────────────────────────

export interface SymbolicEquivalenceCluster {
  clusterId:                 string;
  clusterLabel:              string;
  symbolicNormalization:     string;
  memberTrickSlugs:          string[];
  ifpaDecompositionVariance: string;
  addRange:                  string;
  anchorTopologyGroup:       string;
  notes:                     string;
  reviewStatus:              string;
  layerSource:               'observational';
}

export interface SymbolicGroupMembership {
  trickSlug:        string;
  symbolicGroupId:  string;
  membershipReason: string;
  confidence:       string;
  source:           string;
  layerSource:      'observational';
}

export interface SymbolicMovementArchetype {
  archetypeId:           string;
  archetypeLabel:        string;
  uptimePattern:         string;
  midtimePattern:        string;
  downtimePattern:       string;
  anchorTopologyGroup:   string;
  anchorModifierGroups:  string;
  memberExamples:        string;
  minAdds:               number | null;
  maxAdds:               number | null;
  educationalValue:      string;
  notes:                 string;
  layerSource:           'observational';
}

export interface SymbolicTopologyGroup {
  symbolicGroupId:        string;
  displayName:            string;
  classificationAxis:     string;
  description:            string;
  representativeExamples: string;
  confidenceLevel:        string;
  sourceBasis:            string;
  reviewStatus:           string;
  layerSource:            'observational';
}

export interface SymbolicModifierGroup {
  symbolicGroupId:        string;
  displayName:            string;
  classificationAxis:     string;
  description:            string;
  representativeExamples: string;
  confidenceLevel:        string;
  sourceBasis:            string;
  reviewStatus:           string;
  layerSource:            'observational';
}

export interface SymbolicGlossaryCrosslink {
  crosslinkId:      string;
  termA:            string;
  termB:            string;
  relationship:     string;
  cluster:          string;
  source:           string;
  notes:            string;
  educationalValue: string;
  layerSource:      'observational';
}

// Read a symbolic_* table as plain string records (NULL -> ''), the shape the
// cache mapping below expects. The prepared statements live in db.ts.
function readTable(stmt: { all(): unknown[] }): Record<string, string>[] {
  return (stmt.all() as Record<string, unknown>[]).map((row) => {
    const obj: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) obj[k] = v == null ? '' : String(v);
    return obj;
  });
}

function splitMembers(raw: string): string[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// The symbolic-grammar CSVs key tricks by hyphenated slug ("around-the-world"),
// while freestyle_tricks and every public route use the underscore canonical
// form ("around_the_world"). Normalizing to underscore at each slug boundary is
// what lets a compound trick resolve its memberships and equivalence clusters;
// without it the lookup silently returns nothing and the panels never render.
export function normalizeSymbolicSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, '_');
}

function parseIntOrNull(raw: string): number | null {
  if (!raw || raw.trim() === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────

interface Cache {
  equivClusters:     SymbolicEquivalenceCluster[];
  membershipBySlug:  Map<string, SymbolicGroupMembership[]>;
  membershipByGroup: Map<string, SymbolicGroupMembership[]>;
  archetypes:        SymbolicMovementArchetype[];
  topologyById:      Map<string, SymbolicTopologyGroup>;
  modifierById:      Map<string, SymbolicModifierGroup>;
  crosslinksByTerm:  Map<string, SymbolicGlossaryCrosslink[]>;
}

let cache: Cache | null = null;
let cacheBuildAttempted = false;

function buildCache(): Cache {
  // Equivalence clusters
  const equivRows = readTable(symbolicGrammar.equivalenceClusters);
  const equivClusters: SymbolicEquivalenceCluster[] = equivRows.map(r => ({
    clusterId:                 r['cluster_id'] ?? '',
    clusterLabel:              r['cluster_label'] ?? '',
    symbolicNormalization:     r['symbolic_normalization'] ?? '',
    memberTrickSlugs:          splitMembers(r['member_trick_slugs'] ?? '').map(normalizeSymbolicSlug),
    ifpaDecompositionVariance: r['ifpa_decomposition_variance'] ?? '',
    addRange:                  r['add_range'] ?? '',
    anchorTopologyGroup:       r['anchor_topology_group'] ?? '',
    notes:                     r['notes'] ?? '',
    reviewStatus:              r['review_status'] ?? '',
    layerSource:               'observational',
  }));

  // Memberships — build two indexes (by trick + by group)
  const membershipRows = readTable(symbolicGrammar.groupMembership);
  const memberships: SymbolicGroupMembership[] = membershipRows.map(r => ({
    trickSlug:        normalizeSymbolicSlug(r['trick_slug'] ?? ''),
    symbolicGroupId:  r['symbolic_group_id'] ?? '',
    membershipReason: r['membership_reason'] ?? '',
    confidence:       r['confidence'] ?? '',
    source:           r['source'] ?? '',
    layerSource:      'observational',
  }));
  const membershipBySlug = new Map<string, SymbolicGroupMembership[]>();
  const membershipByGroup = new Map<string, SymbolicGroupMembership[]>();
  for (const m of memberships) {
    if (!m.trickSlug) continue;
    if (!membershipBySlug.has(m.trickSlug)) membershipBySlug.set(m.trickSlug, []);
    membershipBySlug.get(m.trickSlug)!.push(m);
    if (!membershipByGroup.has(m.symbolicGroupId)) membershipByGroup.set(m.symbolicGroupId, []);
    membershipByGroup.get(m.symbolicGroupId)!.push(m);
  }

  // Archetypes
  const archetypeRows = readTable(symbolicGrammar.movementArchetypes);
  const archetypes: SymbolicMovementArchetype[] = archetypeRows.map(r => ({
    archetypeId:           r['archetype_id'] ?? '',
    archetypeLabel:        r['archetype_label'] ?? '',
    uptimePattern:         r['uptime_pattern'] ?? '',
    midtimePattern:        r['midtime_pattern'] ?? '',
    downtimePattern:       r['downtime_pattern'] ?? '',
    anchorTopologyGroup:   r['anchor_topology_group'] ?? '',
    anchorModifierGroups:  r['anchor_modifier_groups'] ?? '',
    memberExamples:        r['member_examples'] ?? '',
    minAdds:               parseIntOrNull(r['min_adds'] ?? ''),
    maxAdds:               parseIntOrNull(r['max_adds'] ?? ''),
    educationalValue:      r['educational_value'] ?? '',
    notes:                 r['notes'] ?? '',
    layerSource:           'observational',
  }));

  // Topology groups (indexed by id)
  const topologyRows = readTable(symbolicGrammar.topologyGroups);
  const topologyById = new Map<string, SymbolicTopologyGroup>();
  for (const r of topologyRows) {
    const id = r['symbolic_group_id'] ?? '';
    if (!id) continue;
    topologyById.set(id, {
      symbolicGroupId:        id,
      displayName:            r['display_name'] ?? '',
      classificationAxis:     r['classification_axis'] ?? '',
      description:            r['description'] ?? '',
      representativeExamples: r['representative_examples'] ?? '',
      confidenceLevel:        r['confidence_level'] ?? '',
      sourceBasis:            r['source_basis'] ?? '',
      reviewStatus:           r['review_status'] ?? '',
      layerSource:            'observational',
    });
  }

  // Modifier groups (indexed by id)
  const modifierRows = readTable(symbolicGrammar.modifierGroups);
  const modifierById = new Map<string, SymbolicModifierGroup>();
  for (const r of modifierRows) {
    const id = r['symbolic_group_id'] ?? '';
    if (!id) continue;
    modifierById.set(id, {
      symbolicGroupId:        id,
      displayName:            r['display_name'] ?? '',
      classificationAxis:     r['classification_axis'] ?? '',
      description:            r['description'] ?? '',
      representativeExamples: r['representative_examples'] ?? '',
      confidenceLevel:        r['confidence_level'] ?? '',
      sourceBasis:            r['source_basis'] ?? '',
      reviewStatus:           r['review_status'] ?? '',
      layerSource:            'observational',
    });
  }

  // Crosslinks indexed by term (bidirectional: a term may appear as term_a OR term_b)
  const crosslinkRows = readTable(symbolicGrammar.glossaryCrosslinks);
  const crosslinksByTerm = new Map<string, SymbolicGlossaryCrosslink[]>();
  for (const r of crosslinkRows) {
    const cl: SymbolicGlossaryCrosslink = {
      crosslinkId:      r['crosslink_id'] ?? '',
      termA:            r['term_a'] ?? '',
      termB:            r['term_b'] ?? '',
      relationship:     r['relationship'] ?? '',
      cluster:          r['cluster'] ?? '',
      source:           r['source'] ?? '',
      notes:            r['notes'] ?? '',
      educationalValue: r['educational_value'] ?? '',
      layerSource:      'observational',
    };
    const keyA = cl.termA.toLowerCase();
    const keyB = cl.termB.toLowerCase();
    if (keyA) {
      if (!crosslinksByTerm.has(keyA)) crosslinksByTerm.set(keyA, []);
      crosslinksByTerm.get(keyA)!.push(cl);
    }
    if (keyB && keyB !== keyA) {
      if (!crosslinksByTerm.has(keyB)) crosslinksByTerm.set(keyB, []);
      crosslinksByTerm.get(keyB)!.push(cl);
    }
  }

  return {
    equivClusters,
    membershipBySlug,
    membershipByGroup,
    archetypes,
    topologyById,
    modifierById,
    crosslinksByTerm,
  };
}

function loadOnce(): Cache | null {
  if (cache) return cache;
  if (cacheBuildAttempted && !cache) {
    // Build attempted, no cache present → empty environment; serve empty results.
    return null;
  }
  cacheBuildAttempted = true;
  try {
    cache = buildCache();
    return cache;
  } catch {
    // Catastrophic parse failure; ensure subsequent calls return empty rather than throw.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Service surface
// ─────────────────────────────────────────────────────────────────────────

export const symbolicGrammarService = {
  /**
   * All 18 equivalence clusters from staging CSV. Returns [] when missing.
   */
  getEquivalenceClusters(): SymbolicEquivalenceCluster[] {
    const c = loadOnce();
    return c ? c.equivClusters : [];
  },

  /**
   * All symbolic-group memberships for a trick slug. Returns [] when missing.
   */
  getMembershipsForSlug(slug: string): SymbolicGroupMembership[] {
    const c = loadOnce();
    if (!c) return [];
    return c.membershipBySlug.get(normalizeSymbolicSlug(slug)) ?? [];
  },

  /**
   * All trick slugs belonging to a symbolic group. Returns [] when missing.
   */
  getMembersOfGroup(symbolicGroupId: string): SymbolicGroupMembership[] {
    const c = loadOnce();
    if (!c) return [];
    return c.membershipByGroup.get(symbolicGroupId) ?? [];
  },

  /**
   * Equivalence clusters that include a given trick slug.
   */
  getClustersForSlug(slug: string): SymbolicEquivalenceCluster[] {
    const c = loadOnce();
    if (!c) return [];
    const key = normalizeSymbolicSlug(slug);
    return c.equivClusters.filter(cl => cl.memberTrickSlugs.includes(key));
  },

  /**
   * All 11 movement archetypes from staging CSV.
   */
  getMovementArchetypes(): SymbolicMovementArchetype[] {
    const c = loadOnce();
    return c ? c.archetypes : [];
  },

  /**
   * Topology group definition by id. Returns null when missing.
   */
  getTopologyGroup(symbolicGroupId: string): SymbolicTopologyGroup | null {
    const c = loadOnce();
    if (!c) return null;
    return c.topologyById.get(symbolicGroupId) ?? null;
  },

  /**
   * Modifier group definition by id. Returns null when missing.
   */
  getModifierGroup(symbolicGroupId: string): SymbolicModifierGroup | null {
    const c = loadOnce();
    if (!c) return null;
    return c.modifierById.get(symbolicGroupId) ?? null;
  },

  /**
   * Glossary crosslinks for a term (case-insensitive). Term may appear as
   * either side of the relationship; both sides are indexed.
   */
  getCrosslinksForTerm(term: string): SymbolicGlossaryCrosslink[] {
    const c = loadOnce();
    if (!c) return [];
    return c.crosslinksByTerm.get(term.toLowerCase()) ?? [];
  },

  /**
   * Test hook: reset the cache. Production code never calls this.
   */
  __resetCacheForTesting(): void {
    cache = null;
    cacheBuildAttempted = false;
  },
};
