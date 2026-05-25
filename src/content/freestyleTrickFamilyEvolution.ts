/**
 * freestyleTrickFamilyEvolution.ts
 * =================================
 *
 * Phase A + B of the trick-detail ontology doctrine (2026-05-25). L5 —
 * "family evolution" narrative layer. Where the dictionary stops being
 * static taxonomy and becomes movement-language history.
 *
 * Each entry is a sequence of branching steps. Each step names the
 * branching axis (topology intensification / multi-dex extension /
 * rotational variant / suspension variant / surface shift / etc.) and
 * the exemplar trick that anchors that branch.
 *
 * NOT a list. The narrative steps tell how the language expands through
 * this trick.
 */

export interface FamilyEvolutionStep {
  /** Short branching axis label (e.g. "Topology intensification"). */
  branchAxis: string;
  /** Curator prose for this branching step. 1-3 sentences. */
  prose: string;
  /** Slugs of exemplar tricks that anchor this branch. */
  exemplarSlugs: readonly string[];
}

export interface TrickFamilyEvolution {
  slug: string;
  /** Ordered sequence of branching steps. */
  narrativeSteps: readonly FamilyEvolutionStep[];
}

export const TRICK_FAMILY_EVOLUTION_ENTRIES: readonly TrickFamilyEvolution[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug: 'mirage',
    narrativeSteps: [
      {
        branchAxis: 'Topology intensification',
        prose:
          "Layering paradox onto mirage adds a hip-pivot cross-body transition during the dex cycle. The resulting trick — paradox-mirage — anchors much of modern shred vocabulary.",
        exemplarSlugs: ['paradox-mirage'],
      },
      {
        branchAxis: 'Multi-dex extension',
        prose:
          "Stepping the dex pattern across the same chassis produces blur (a stepping-paradox-mirage shape). The two-dex pattern composes further into fury — a three-dex extension on the blur chassis.",
        exemplarSlugs: ['blur', 'fury'],
      },
      {
        branchAxis: 'X-dex escalation',
        prose:
          "Layering a nuclear modifier on paradox-mirage produces sumo — a named exception where the nuclear escalation reads as 5 ADD rather than the standard +2 nuclear rule. Sumo is the canonical x-dex escalation locus.",
        exemplarSlugs: ['sumo'],
      },
      {
        branchAxis: 'Terminal surface shift',
        prose:
          "Shifting the terminal from a toe delay to a clipper stall transforms mirage into drifter — same core in-to-out dex pattern, different landing surface.",
        exemplarSlugs: ['drifter'],
      },
    ],
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox-mirage',
    narrativeSteps: [
      {
        branchAxis: 'Multi-dex extension',
        prose:
          "Layering a stepping multi-dex pattern on paradox-mirage produces blur. The two-dex paradox shape is one of the most generative compounds in shred vocabulary.",
        exemplarSlugs: ['blur'],
      },
      {
        branchAxis: 'Three-dex extension',
        prose:
          "Adding a third dex extends blur into fury — the longest-named multi-dex chain on the paradox-mirage chassis.",
        exemplarSlugs: ['fury'],
      },
      {
        branchAxis: 'X-dex escalation',
        prose:
          "Layering a nuclear modifier escalates paradox-mirage into sumo — a 5-ADD named exception to the standard +2 nuclear rule.",
        exemplarSlugs: ['sumo'],
      },
      {
        branchAxis: 'Rotational layering',
        prose:
          "Layering a surging rotational system over paradox-whirl produces surreal-class compounds — the mirror branch on the rotational side of the topology.",
        exemplarSlugs: ['surreal'],
      },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    narrativeSteps: [
      {
        branchAxis: 'Terminal compound',
        prose:
          "Layering an osis terminal onto whirl produces blender — the compound-of-canonicals reading whirl-osis. Blender exemplifies how two canonical tricks combine into a recognized third.",
        exemplarSlugs: ['blender'],
      },
      {
        branchAxis: 'Suspension variant',
        prose:
          "Adding a no-plant symposium constraint produces pogo — whirl performed without the setting foot contacting the ground. Pogo is the whirl-family suspension exemplar.",
        exemplarSlugs: ['pogo'],
      },
      {
        branchAxis: 'Gyro layering',
        prose:
          "Layering a back-spin gyro produces blistering. The gyro lineage builds on whirl's rotational chassis.",
        exemplarSlugs: ['blistering'],
      },
      {
        branchAxis: 'Topology intensification',
        prose:
          "Layering paradox onto whirl produces paradox-whirl, which itself anchors further compositional layering — surge (surging-paradox-whirl, surfaced as surreal) at the top of the rotational-topology ladder.",
        exemplarSlugs: ['surreal'],
      },
    ],
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickFamilyEvolution> = new Map(
  TRICK_FAMILY_EVOLUTION_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickFamilyEvolution(slug: string): TrickFamilyEvolution | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}
