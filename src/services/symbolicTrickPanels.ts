/**
 * symbolicTrickPanels.ts
 *
 * Trick-page view-model shaping for the observational symbolic-grammar layer.
 *
 * Consumes:
 *   - symbolicGrammarService (Layer 3 staging-CSV adapter)
 *   - canonical trick rows (passed in by caller; never read from DB here)
 *
 * Produces:
 *   - SymbolicRelatedTopologyPanel — for the "Related topology tricks" panel
 *     embedded on selected trick-detail pages
 *
 * Layer separation: never reads from canonical IFPA tables directly. Trick
 * names + ADD values are resolved against a passed-in dict-row map (the
 * service caller already has these in scope). Output carries explicit
 * layerSource='observational' marker on every shape.
 *
 * Allow-listed to 8 named flagship slugs for controlled rollout; expansion is
 * a one-line constant change.
 */
import type { FreestyleTrickRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';
import { symbolicGrammarService } from './symbolicGrammarService';

// ─────────────────────────────────────────────────────────────────────────
// Allow-list: trick slugs that render the symbolic Related Topology panel.
// 8 flagship slugs.
// ─────────────────────────────────────────────────────────────────────────

const SYMBOLIC_TOPOLOGY_PANEL_SLUGS: ReadonlySet<string> = new Set([
  'matador',
  'phoenix',
  'ripwalk',
  'dimwalk',
  'sidewalk',
  'dada-curve',
  'spinning-whirl',
  'montage',
]);

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface SymbolicTopologyPanelMember {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
}

export interface SymbolicRelatedTopologyPanel {
  topologyGroupId:       string;
  topologyDisplayName:   string;
  topologyDescription:   string;
  reasonText:            string;          // e.g. "Shares butterfly wing topology"
  members:               SymbolicTopologyPanelMember[];   // excludes current slug; capped at MAX
  memberCount:           number;          // count of returned (post-cap, post-self-exclusion)
  totalRelatedCount:     number;          // count before cap (so template can show "+N more" if desired)
  layerSource:           'observational';
}

const MAX_PANEL_MEMBERS = 6;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Choose the primary topology group for a slug.
 *
 * Preference order:
 *   1. Direct membership in a topology-axis group (suffix -topology)
 *   2. First non-topology membership (any axis)
 *   3. Anchor topology from an equivalence cluster that lists this slug as a
 *      member (covers self-atom rows like dada-curve that have no membership
 *      rows but ARE listed in `symbolic_equivalence_clusters.csv` with an
 *      explicit anchor_topology_group)
 *   4. null when no topology can be resolved
 *
 * Stable across re-runs (input CSVs are stable-sorted by the generator).
 */
function pickPrimaryTopologyGroup(slug: string): string | null {
  const memberships = symbolicGrammarService.getMembershipsForSlug(slug);
  // Rule 1: direct topology-axis membership
  const topoMatch = memberships.find(m => m.symbolicGroupId.endsWith('-topology'));
  if (topoMatch) return topoMatch.symbolicGroupId;
  // Rule 2: any other membership
  if (memberships.length > 0) {
    return memberships[0]?.symbolicGroupId ?? null;
  }
  // Rule 3: equivalence-cluster anchor fallback (dada-curve etc.)
  const clusters = symbolicGrammarService.getClustersForSlug(slug);
  for (const c of clusters) {
    if (c.anchorTopologyGroup && c.anchorTopologyGroup.endsWith('-topology')) {
      return c.anchorTopologyGroup;
    }
  }
  return null;
}

function shapeMember(row: FreestyleTrickRow): SymbolicTopologyPanelMember {
  return {
    slug:          row.slug,
    canonicalName: row.canonical_name,
    hashtag:       slugToHashtag(row.slug),
    adds:          row.adds,
    detailHref:    `/freestyle/tricks/${row.slug}`,
  };
}

function compareAddsThenSlug(a: SymbolicTopologyPanelMember, b: SymbolicTopologyPanelMember): number {
  const an = a.adds == null ? -1 : Number.parseInt(a.adds, 10);
  const bn = b.adds == null ? -1 : Number.parseInt(b.adds, 10);
  const ai = Number.isFinite(an) ? an : -1;
  const bi = Number.isFinite(bn) ? bn : -1;
  if (ai !== bi) return ai - bi;
  return a.slug.localeCompare(b.slug);
}

// ─────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the trick-page should render the symbolic Related Topology
 * panel (the allow-list).
 */
export function shouldRenderSymbolicTopologyPanel(slug: string): boolean {
  return SYMBOLIC_TOPOLOGY_PANEL_SLUGS.has(slug);
}

// ─────────────────────────────────────────────────────────────────────────
// DISCOVERABILITY phase — trick-page educational CTAs
// ─────────────────────────────────────────────────────────────────────────

export interface SymbolicEducationCta {
  label:        string;   // "Walking-family progression" or "Spinning modifier educational page"
  href:         string;
  layerSource:  'observational';
}

// CTA inputs (label + href + the membership-based trigger condition).
const CTA_DEFINITIONS = [
  {
    triggerGroupId: 'butterfly-wing-topology',
    label:          'Walking-family progression',
    href:           '/freestyle/progression/walking-family',
  },
  {
    triggerGroupId: 'spinning-family',
    label:          'Spinning modifier educational page',
    href:           '/freestyle/modifier/spinning',
  },
  {
    triggerGroupId: 'whirl-rotational-topology',
    label:          'Spinning modifier educational page',
    href:           '/freestyle/modifier/spinning',
  },
] as const;

/**
 * Build trick-page educational CTAs from the trick's symbolic-group memberships.
 *
 * Multiple memberships may produce multiple CTAs; the result is de-duplicated
 * by href (montage, for example, belongs to BOTH spinning-family AND
 * whirl-rotational-topology — both fire the same spinning-modifier CTA, but
 * it's emitted once).
 *
 * Returns [] when the trick has no triggering memberships OR when the trick
 * slug equals the destination (avoid linking a trick page back to its own
 * surface).
 */
export function buildSymbolicEducationCtas(slug: string): SymbolicEducationCta[] {
  const memberships = symbolicGrammarService.getMembershipsForSlug(slug);
  const groupIds = new Set(memberships.map(m => m.symbolicGroupId));

  const ctas: SymbolicEducationCta[] = [];
  const seenHrefs = new Set<string>();
  for (const def of CTA_DEFINITIONS) {
    if (!groupIds.has(def.triggerGroupId)) continue;
    if (seenHrefs.has(def.href)) continue;
    seenHrefs.add(def.href);
    ctas.push({
      label:       def.label,
      href:        def.href,
      layerSource: 'observational',
    });
  }
  return ctas;
}

/**
 * Build the symbolic Related Topology panel view-model for a trick page.
 *
 * Returns null when:
 *   - slug is not in the allow-list
 *   - slug has no topology-axis group membership
 *   - the resolved topology group has zero members (degenerate; would render empty)
 *
 * Members are filtered to active dict rows (passed in by caller) and exclude
 * modifier-category rows, which are curator-internal and never shown on the
 * public panel.
 */
export function buildSymbolicRelatedTopologyPanel(
  currentSlug: string,
  allDictRows: readonly FreestyleTrickRow[],
): SymbolicRelatedTopologyPanel | null {
  if (!shouldRenderSymbolicTopologyPanel(currentSlug)) return null;

  const topologyId = pickPrimaryTopologyGroup(currentSlug);
  if (!topologyId) return null;

  const topologyDef = symbolicGrammarService.getTopologyGroup(topologyId);
  if (!topologyDef) return null;

  // Reverse lookup: members of this topology group
  const memberships = symbolicGrammarService.getMembersOfGroup(topologyId);
  if (memberships.length === 0) return null;

  // Resolve member slugs against the passed-in dict-row map.
  // Modifier-category rows are filtered (modifier-public-visibility rule).
  const dictBySlug = new Map<string, FreestyleTrickRow>();
  for (const row of allDictRows) {
    if (row.category === 'modifier') continue;
    dictBySlug.set(row.slug, row);
  }

  const members: SymbolicTopologyPanelMember[] = [];
  const seenSlugs = new Set<string>();
  for (const m of memberships) {
    if (m.trickSlug === currentSlug) continue;        // exclude self
    if (seenSlugs.has(m.trickSlug)) continue;
    seenSlugs.add(m.trickSlug);
    const dictRow = dictBySlug.get(m.trickSlug);
    if (!dictRow) continue;                            // skip non-existent or modifier rows
    members.push(shapeMember(dictRow));
  }
  members.sort(compareAddsThenSlug);
  const totalRelatedCount = members.length;
  const capped = members.slice(0, MAX_PANEL_MEMBERS);

  if (capped.length === 0) return null;

  // Build concise reason text: "Shares <display name lowercased>"
  // e.g. "Shares butterfly wing topology" / "Shares whirl rotational topology"
  const reasonText = `Shares ${topologyDef.displayName.toLowerCase()}`;

  return {
    topologyGroupId:     topologyDef.symbolicGroupId,
    topologyDisplayName: topologyDef.displayName,
    topologyDescription: topologyDef.description,
    reasonText,
    members:             capped,
    memberCount:         capped.length,
    totalRelatedCount,
    layerSource:         'observational',
  };
}
