/**
 * freestyleTrickProgressiveReadings.ts
 * =====================================
 *
 * Phase A + B of the trick-detail ontology doctrine (2026-05-25). L6 —
 * "progressive equivalence unfolding" layer.
 *
 * A staircase of readings: simple parent → topology transformation →
 * compositional extension → compressed shorthand → descendant systems.
 * Each step earns its place in the staircase.
 *
 * Distinct from the existing equivalence sections (trick-transform,
 * trick-equivalence-topology), which fire mechanically. L6 progressive
 * readings UNFOLD the structure rather than restating notation in
 * different forms.
 */

export interface ProgressiveReadingStage {
  /** Short stage label (e.g. "Simple atom", "Topology transformation"). */
  stage: string;
  /** The reading at this stage. 1-2 sentences. */
  reading: string;
  /** Optional source citation. */
  citation?: string;
}

export interface TrickProgressiveReadings {
  slug: string;
  stages: readonly ProgressiveReadingStage[];
}

export const TRICK_PROGRESSIVE_READINGS_ENTRIES: readonly TrickProgressiveReadings[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug: 'mirage',
    stages: [
      {
        stage:   'Simple atom',
        reading: "TOE > OP IN [DEX] > OP TOE [DEL] — toe set, opposite-side inward dex, opposite toe delay.",
      },
      {
        stage:   'Topology transformation',
        reading: "Paradox layers a cross-body hip-pivot onto the same in-to-out dex: paradox-mirage.",
      },
      {
        stage:   'Compositional extension',
        reading: "Adding stepping makes the dex pattern multi-step: blur (CLIP > OP IN [DEX] > OP OUT [DEX] >).",
      },
      {
        stage:   'Further extension',
        reading: "A third dex chains over the blur chassis: fury (CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >).",
      },
      {
        stage:   'Compressed shorthand',
        reading: "Sumo names the nuclear-mirage compound at 5 ADD as an x-dex escalation exception, not the standard +2 nuclear rule.",
      },
    ],
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox-mirage',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "Ordinary mirage: TOE > OP IN [DEX] > OP TOE [DEL]. Single dex, in-to-out direction, no body-side shift.",
      },
      {
        stage:   'Paradox layer — older reading',
        reading: "Op-side dex from a clipper entry: CLIP > OP OUT [DEX] > OP TOE [DEL] in one shorthand tradition.",
      },
      {
        stage:   'Paradox layer — interpretive reading',
        reading: "Cross-body hip-pivot during the dex cycle. Same notation as the older reading; understood as an added topology rather than starting-side variation.",
      },
      {
        stage:   'ADD accounting',
        reading: "paradox(+1) + mirage(2 ADD) = 3 ADD. The accounting is settled; the structural reading is what varies between traditions.",
      },
      {
        stage:   'Productive descendants',
        reading: "Blur layers stepping multi-dex; fury extends with three dexes; sumo escalates with nuclear x-dex; surreal layers a surging rotational character on paradox-whirl. All inherit paradox topology.",
      },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    stages: [
      {
        stage:   'Simple anchor',
        reading: "CLIP > OP IN [DEX] > (same side terminal) — cross-body rotational dex circling up-and-over to a clipper terminal.",
      },
      {
        stage:   'Terminal compound',
        reading: "Layering an osis terminal gives blender — the compound whirl-osis.",
      },
      {
        stage:   'Topology intensification',
        reading: "Layering paradox produces paradox-whirl; the rotational character intensifies with the hip-pivot transition.",
      },
      {
        stage:   'Compositional extension',
        reading: "Layering a surging rotational system on paradox-whirl produces surreal — the top of the rotational-topology ladder.",
      },
      {
        stage:   'Family-language summary',
        reading: "Whirl-anchored compounds expand across all five movement-language axes (set / topology / rotational / suspension / surface).",
      },
    ],
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickProgressiveReadings> = new Map(
  TRICK_PROGRESSIVE_READINGS_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickProgressiveReadings(slug: string): TrickProgressiveReadings | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}
