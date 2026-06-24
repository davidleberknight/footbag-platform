/**
 * freestyleTrickFamilyEvolution.ts
 * =================================
 *
 * L5,
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
          "Layering paradox onto mirage adds a hip-pivot cross-body transition during the dex cycle. The resulting trick (paradox-mirage) anchors much of modern shred vocabulary.",
        exemplarSlugs: ['paradox_mirage'],
      },
      {
        branchAxis: 'Multi-dex extension',
        prose:
          "Stepping the dex pattern across the same chassis produces blur (a stepping-paradox-mirage shape). The two-dex pattern composes further into fury, a three-dex extension on the blur chassis.",
        exemplarSlugs: ['blur', 'fury'],
      },
      {
        branchAxis: 'X-dex escalation',
        prose:
          "Layering a nuclear modifier on paradox-mirage produces sumo, a named exception where the nuclear escalation reads as 5 ADD rather than the standard +2 nuclear rule. Sumo is the canonical x-dex escalation locus.",
        exemplarSlugs: ['sumo'],
      },
      {
        branchAxis: 'Terminal surface shift',
        prose:
          "Shifting the terminal from a toe delay to a clipper stall transforms mirage into drifter: same core in-to-out dex pattern, different landing surface.",
        exemplarSlugs: ['drifter'],
      },
    ],
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox_mirage',
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
          "Adding a third dex extends blur into fury, the longest-named multi-dex chain on the paradox-mirage chassis.",
        exemplarSlugs: ['fury'],
      },
      {
        branchAxis: 'X-dex escalation',
        prose:
          "Layering a nuclear modifier escalates paradox-mirage into sumo, a 5-ADD named exception to the standard +2 nuclear rule.",
        exemplarSlugs: ['sumo'],
      },
      {
        branchAxis: 'Rotational layering',
        prose:
          "Layering a surging rotational system over paradox-whirl produces surreal-class compounds, the mirror branch on the rotational side of the topology.",
        exemplarSlugs: ['surreal'],
      },
    ],
  },

  // ── C1 mirage-descendant batch ─────────────────
  // blur authored here (L5 narrative steps). fury and sumo suppress L5:
  // both are leaf-class compounds at the end of their extension axes; per
  // the doctrine lock §2 rule 7, suppression > filler.

  {
    slug: 'blur',
    narrativeSteps: [
      {
        branchAxis: 'Three-dex extension',
        prose:
          "Layering a furious modifier onto the same paradox-mirage chassis produces fury, a deeper multi-dex sequence than blur. Fury and blur read as siblings on the chassis rather than parent-and-child.",
        exemplarSlugs: ['fury'],
      },
      {
        branchAxis: 'Multi-dex naming superlative',
        prose:
          "The blurry-naming tradition extends into a different chassis to produce blurriest, a 5-ADD blurry-barfly compound carrying maximal blurry character. Kin in name; distinct in structural base.",
        exemplarSlugs: ['blurriest'],
      },
      {
        branchAxis: 'Cultural-canonical shorthand',
        prose:
          "The \"stepping paradox\" shorthand operates as a category label in player vocabulary. Blur is its canonical resolution; the category absorbs structurally adjacent compounds whose decompositions read as stepping-paradox-class even when the precise modifier stack differs.",
        exemplarSlugs: [],
      },
    ],
  },

  {
    slug: 'drifter',
    narrativeSteps: [
      {
        branchAxis: 'Topology intensification',
        prose:
          "Layering paradox onto drifter produces paradox-drifter, the hip-pivot cross-body transition threaded into the mirage-dex with clipper terminal.",
        exemplarSlugs: ['paradox_drifter'],
      },
      {
        branchAxis: 'Rotational variant',
        prose:
          "Layering rotational character onto the drifter chassis produces vortex, the rotational extension on the clipper-anchored terminal.",
        exemplarSlugs: ['vortex'],
      },
      {
        branchAxis: 'Naming-driven extensions',
        prose:
          "Several 4-ADD compounds carry their own folk names while sharing the drifter chassis: smoke, tombstone, fume, quantum-drifter, and others. Each names a specific compositional reading on the chassis without escalating to a new family.",
        exemplarSlugs: ['smoke', 'tombstone'],
      },
      {
        branchAxis: 'Deeper compositional extension',
        prose:
          "Layering additional modifiers produces 5-ADD compounds on the drifter chassis, lotus among them.",
        exemplarSlugs: ['lotus'],
      },
      {
        branchAxis: 'Clipper-stall sibling branch',
        prose:
          "High-plains-drifter sits on the same clipper-stall chassis as drifter with an additional modifier, sibling-of-drifter rather than descendant.",
        exemplarSlugs: ['high_plains_drifter'],
      },
    ],
  },

  {
    slug: 'barrage',
    narrativeSteps: [
      {
        branchAxis: 'Topology intensification',
        prose:
          "Layering paradox onto the doubled-dex chassis produces paradox-barrage, paradox hip-pivot threaded through the second dex.",
        exemplarSlugs: ['paradox_barrage'],
      },
      {
        branchAxis: 'Stepping-paradox extension',
        prose:
          "Layering stepping-paradox onto barrage produces blurrage, a 4-ADD compound on the same doubled-dex chassis with a multi-dex extension axis.",
        exemplarSlugs: ['blurrage'],
      },
      {
        branchAxis: 'Operator-path productivity',
        prose:
          "The shared \"barraging\" modifier produces fury (barraging-paradox-mirage in earlier doctrine) and flurry (barraging-leg-over) on other chassis. The same root name carries compositional weight as an operator across the broader language.",
        exemplarSlugs: ['fury'],
      },
    ],
  },

  // ── C2 whirl-descendant batch ──────────────────
  // blender authored here (L5 narrative steps). surreal and phoenix
  // suppress L5: both are leaf compounds at the top of their extension
  // axes; per the doctrine lock §2 rule 7, suppression > filler.

  {
    slug: 'blender',
    narrativeSteps: [
      {
        branchAxis: 'Topology intensification',
        prose:
          "Layering paradox onto the blender chassis produces paradox-blender, paradox hip-pivot threaded into the whirl-osis compound.",
        exemplarSlugs: ['paradox_blender'],
      },
      {
        branchAxis: 'Naming-driven extensions',
        prose:
          "Several 5-6 ADD compounds carry their own folk names while sharing the blender chassis: fender, fender-bender, mind-bender, spender. Each names a specific compositional reading on the chassis without escalating to a new family.",
        exemplarSlugs: ['fender', 'mind_bender'],
      },
      {
        branchAxis: 'Multi-modifier extension',
        prose:
          "Deeper modifier stacks layer onto the chassis to produce 6-7 ADD compounds: spinning-paradox-blender and stepping-ducking-paradox-blender are the deepest extensions in the family.",
        exemplarSlugs: ['spinning_paradox_blender'],
      },
      {
        branchAxis: 'Operator-path productivity',
        prose:
          "The blurry operator extended onto the compound-of-canonicals chassis produces food-processor, blurry-modified blender at 6 ADD.",
        exemplarSlugs: ['food_processor'],
      },
    ],
  },

  // ── C3 independent-anchor batch ────────────────
  // osis / butterfly / torque authored here (deep family-evolution
  // narratives). mobius, ripwalk, food-processor suppress L5: leaf
  // compounds per the doctrine lock §2 rule 7.

  {
    slug: 'osis',
    narrativeSteps: [
      {
        branchAxis: 'Compound-of-canonicals (mirage path)',
        prose:
          "Layering a mirage operator onto osis produces torque (miraging-osis at 4 ADD); torque becomes its own sub-anchor with descendants of its own.",
        exemplarSlugs: ['torque'],
      },
      {
        branchAxis: 'Compound-of-canonicals (whirl path)',
        prose:
          "Layering a whirl operator onto osis produces blender (whirling-osis at 4 ADD); the sibling compound to torque on the same osis chassis.",
        exemplarSlugs: ['blender'],
      },
      {
        branchAxis: 'Body-modifier branch',
        prose:
          "Ducking-osis, spinning-osis, atomic-osis, paradox-osis: each layers a modifier on the spin-clipper chassis at the 4-ADD layer.",
        exemplarSlugs: ['ducking_osis', 'spinning_osis'],
      },
      {
        branchAxis: 'Set-treatment branch',
        prose:
          "Pixie-osis at 4 ADD layers a set-treatment modifier compressing the opening, anchoring the set-axis productivity on the chassis.",
        exemplarSlugs: ['pixie_osis'],
      },
      {
        branchAxis: 'Multi-dex extension',
        prose:
          "Stepping-osis at 4 ADD and barraging-osis at 5 ADD layer multi-dex extensions onto the spin-clipper chassis.",
        exemplarSlugs: ['stepping_osis', 'barraging_osis'],
      },
      {
        branchAxis: 'Naming-driven extensions',
        prose:
          "Twirl at 4 ADD and aeon-flux at 5 ADD carry their own folk names while sharing the osis chassis.",
        exemplarSlugs: ['twirl', 'aeon_flux'],
      },
    ],
  },

  {
    slug: 'butterfly',
    narrativeSteps: [
      {
        branchAxis: 'Stepping branch',
        prose:
          "Layering stepping onto butterfly produces ripwalk, the shred-vocabulary entry on the chassis at 4 ADD.",
        exemplarSlugs: ['ripwalk'],
      },
      {
        branchAxis: 'Set-treatment branch',
        prose:
          "Pixie onto butterfly produces dimwalk; tapdown carries its own folk name in the same set-axis family at 4 ADD.",
        exemplarSlugs: ['dimwalk', 'tapdown'],
      },
      {
        branchAxis: 'Stepping-paradox branch',
        prose:
          "Layering stepping-paradox onto butterfly produces parkwalk, a deeper modifier stack on the chassis at 4 ADD.",
        exemplarSlugs: ['parkwalk'],
      },
      {
        branchAxis: 'Body-modifier branch',
        prose:
          "Atomic-butterfly, ducking-butterfly, gyro-butterfly, spinning-butterfly: each layers a single body modifier on the chassis at 4 ADD.",
        exemplarSlugs: ['atomic_butterfly', 'ducking_butterfly'],
      },
      {
        branchAxis: 'Multi-modifier extension',
        prose:
          "At 5 ADD, named two-modifier compounds (phoenix, yoda, matador, ripped-warrior) demonstrate that the chassis tolerates multi-axis layering cleanly.",
        exemplarSlugs: ['phoenix', 'matador'],
      },
      {
        branchAxis: 'Naming-driven extensions',
        prose:
          "Bigwalk, darkwalk, dark-avenue, sidewalk, tripwalk, and quantanamera are folk-named 4-5 ADD compounds carrying their own identities while sharing the butterfly chassis.",
        exemplarSlugs: ['bigwalk', 'darkwalk'],
      },
    ],
  },

  {
    slug: 'torque',
    narrativeSteps: [
      {
        branchAxis: 'Body-modifier branch',
        prose:
          "Paradox-torque, spinning-torque, symposium-torque layer body modifiers on the torque chassis at the 5-ADD layer.",
        exemplarSlugs: ['paradox_torque', 'spinning_torque'],
      },
      {
        branchAxis: 'Gyro layering',
        prose:
          "Layering gyro onto torque produces mobius (gyro-torque at 5 ADD), the gyro lineage that builds on torque's intermediate-base status.",
        exemplarSlugs: ['mobius'],
      },
      {
        branchAxis: 'Atomic / nuclear extension',
        prose:
          "Atomic-torque at 6 ADD layers the atomic modifier onto the chassis; the deeper modifier-stack branch.",
        exemplarSlugs: ['atomic_torque'],
      },
      {
        branchAxis: 'Naming-driven extensions',
        prose:
          "Forque, grave-digger, spinal-tap, and big-apple are folk-named compounds on the torque chassis at 5-6 ADD.",
        exemplarSlugs: ['forque', 'grave_digger'],
      },
      {
        branchAxis: 'Highest-ADD reach',
        prose:
          "Gauntlet at 7 ADD sits as the deepest torque-chassis compound in the dictionary.",
        exemplarSlugs: ['gauntlet'],
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
          "Layering an osis terminal onto whirl produces blender, the compound-of-canonicals reading whirl-osis. Blender exemplifies how two canonical tricks combine into a recognized third.",
        exemplarSlugs: ['blender'],
      },
      {
        branchAxis: 'Suspension variant',
        prose:
          "Adding a no-plant symposium constraint produces pogo, whirl performed without the setting foot contacting the ground. Pogo is the whirl-family suspension exemplar.",
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
          "Layering paradox onto whirl produces paradox-whirl, which itself anchors further compositional layering: surge (surging-paradox-whirl, surfaced as surreal) at the top of the rotational-topology ladder.",
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
