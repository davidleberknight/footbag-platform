/**
 * symbolicGrammarService.ts
 *
 * Observational symbolic-grammar layer (Layer 3). Backed by staging CSVs only.
 * Reads from `exploration/symbolic-grammar-2/` + `exploration/glossary-synthesis-1/`.
 *
 * This service NEVER touches canonical ontology tables. It is parallel to
 * canonical IFPA family-based relating (which lives in `freestyleRelatedTricks.ts`)
 * and is clearly distinct in:
 *   - type prefix (`Symbolic*`)
 *   - layer attribution (`layerSource: 'observational'` on every shape)
 *   - source (staging CSVs vs prepared statements)
 *
 * Caching: module-level lazy load. Files read once at first call; held in memory.
 * Fail-safe: if files are missing or malformed, methods return empty arrays /
 * null. This ensures the public surface degrades gracefully rather than
 * throwing in the request path.
 *
 * Per UX-SHIP-1; observational layer per SYMBOLIC-GRAMMAR-2 design.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(__dirname, '../..');
const SG2_DIR = resolve(PROJECT_ROOT, 'exploration', 'symbolic-grammar-2');

const CSV_PATHS = {
  equivClusters:     resolve(SG2_DIR, 'symbolic_equivalence_clusters.csv'),
  membership:        resolve(SG2_DIR, 'symbolic_group_membership.csv'),
  archetypes:        resolve(SG2_DIR, 'movement_archetype_registry.csv'),
  topologyGroups:    resolve(SG2_DIR, 'symbolic_topology_groups.csv'),
  modifierGroups:    resolve(SG2_DIR, 'symbolic_modifier_groups.csv'),
  glossaryCrosslink: resolve(SG2_DIR, 'glossary_crosslinks.csv'),
} as const;

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

// ─────────────────────────────────────────────────────────────────────────
// Minimal RFC 4180 CSV parser — handles QUOTE_ALL output from Python csv.writer.
// Supports embedded commas + escaped double-quotes (""). No embedded newlines
// in the staging CSVs we own (verified at adapter build time); the parser
// still handles them defensively.
// ─────────────────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    // not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Trailing field/row (no final newline)
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsv(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, 'utf-8');
    const rows = parseCsv(text);
    if (rows.length === 0) return [];
    const header = rows[0]!;
    const out: Record<string, string>[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!;
      // Skip empty trailing rows
      if (row.length === 1 && row[0] === '') continue;
      const obj: Record<string, string> = {};
      for (let c = 0; c < header.length; c++) {
        obj[header[c]!] = row[c] ?? '';
      }
      out.push(obj);
    }
    return out;
  } catch {
    return [];
  }
}

function splitMembers(raw: string): string[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
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
  const equivRows = readCsv(CSV_PATHS.equivClusters);
  const equivClusters: SymbolicEquivalenceCluster[] = equivRows.map(r => ({
    clusterId:                 r['cluster_id'] ?? '',
    clusterLabel:              r['cluster_label'] ?? '',
    symbolicNormalization:     r['symbolic_normalization'] ?? '',
    memberTrickSlugs:          splitMembers(r['member_trick_slugs'] ?? ''),
    ifpaDecompositionVariance: r['ifpa_decomposition_variance'] ?? '',
    addRange:                  r['add_range'] ?? '',
    anchorTopologyGroup:       r['anchor_topology_group'] ?? '',
    notes:                     r['notes'] ?? '',
    reviewStatus:              r['review_status'] ?? '',
    layerSource:               'observational',
  }));

  // Memberships — build two indexes (by trick + by group)
  const membershipRows = readCsv(CSV_PATHS.membership);
  const memberships: SymbolicGroupMembership[] = membershipRows.map(r => ({
    trickSlug:        r['trick_slug'] ?? '',
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
  const archetypeRows = readCsv(CSV_PATHS.archetypes);
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
  const topologyRows = readCsv(CSV_PATHS.topologyGroups);
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
  const modifierRows = readCsv(CSV_PATHS.modifierGroups);
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
  const crosslinkRows = readCsv(CSV_PATHS.glossaryCrosslink);
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
    return c.membershipBySlug.get(slug) ?? [];
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
    return c.equivClusters.filter(cl => cl.memberTrickSlugs.includes(slug));
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
