/**
 * freestyleTrickMechanicalDelta.ts
 * =================================
 *
 * Phase A + B of the trick-detail ontology doctrine (2026-05-25). L2 —
 * the "mechanical delta" layer. Per the doctrine, L2 is the deepest
 * ontology-work locus: where paradox / x-dex / nuclear / blurry /
 * furious / rotational escalation / hidden topology changes become
 * understandable.
 *
 * Curator-authored prose. One entry per Tier A slug. Atoms (no parent
 * to differ from) carry the "defining mechanical pattern" reading
 * instead.
 *
 * Interpretive traditions:
 *
 * When a topology distinction is read differently by competing
 * shorthand traditions (the classic paradox-mirage case), the
 * `interpretiveTraditions` array carries BOTH readings honestly.
 * Neither is promoted to canonical doctrine. The L2 prose names the
 * tradition without naming individuals (per the public-page
 * depersonalization rule).
 */

export type TopologyKind =
  | 'atom'              // L2 describes the defining pattern (no parent delta)
  | 'paradox'           // paradox topology layer added
  | 'x-dex'             // x-dex escalation
  | 'rotational'        // rotational-with-spin topology
  | 'no-plant'          // suspension / antisymposium topology
  | 'cross-body'        // cross-body terminal / xbody-anchored
  | 'compound'          // compound-of-canonicals
  | 'hidden-topology';  // canonical formula carries the marker without name doing so

export interface TrickInterpretiveTradition {
  reading: string;
  citation: string;
}

export interface TrickMechanicalDelta {
  slug: string;
  /** Slugs of the parent trick(s) this is a mechanical delta from. Empty for atoms. */
  parentSlugs: readonly string[];
  /** 1-3 short paragraphs explaining the mechanical delta or defining pattern. */
  prose: string;
  topologyKind: TopologyKind;
  /**
   * When multiple shorthand traditions describe the topology
   * differently, BOTH readings render here. Never promote either to
   * canonical doctrine.
   */
  interpretiveTraditions?: readonly TrickInterpretiveTradition[];
}

export const TRICK_MECHANICAL_DELTA_ENTRIES: readonly TrickMechanicalDelta[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug:        'mirage',
    parentSlugs: [],
    prose:
      "Mirage is the atom — there is no parent trick to differ from. Its defining mechanical pattern is the in-to-out dex: the supporting leg swings from inside the bag to outside during a single dex step, with the bag held by the setting toe before and after. The directional flow at the dex moment is in → out, and the leg crossing is under-and-over rather than over-and-under. Nearly every named compound in the modern dictionary transforms this in-to-out pattern rather than building independently.",
    topologyKind: 'atom',
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug:        'paradox-mirage',
    parentSlugs: ['mirage'],
    prose:
      "Relative to ordinary mirage, paradox-mirage carries an additional directional transition during the dex cycle. The structural difference is not merely a different starting surface or reversed dex direction: the hip and torso pivot cross-body mid-dex, producing a topology change rather than a directional inversion.\n\n" +
      "Two interpretive traditions describe what is actually happening. The older shorthand reads paradox as an op-side dex from a clipper entry — a simpler reading that captures the surface notation. A newer pedagogical reading frames paradox as a hip-pivot cross-body transition added during the dex cycle, distinguishing it more sharply from \"starting-side variation.\"\n\n" +
      "Both readings produce the same ADD accounting (paradox +1 layered on mirage's 2 ADD = 3 ADD) and the same canonical notation. They differ on what the movement-language is actually tracking: a starting-side label, or a topology event.",
    topologyKind: 'paradox',
    interpretiveTraditions: [
      { reading: "Op-side dex from a clipper entry — paradox as starting-side variation.", citation: "Older shorthand tradition" },
      { reading: "Additional cross-body hip-pivot transition during the dex cycle — paradox as a topology change distinct from starting-side variation.", citation: "Newer pedagogical reading" },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug:        'whirl',
    parentSlugs: [],
    prose:
      "Whirl's defining mechanical pattern is a cross-body rotational dex: the support leg circles the bag from the front, up and over, while the original setting leg hops off and the catching foot arrives on a clipper delay. The rotational character — the leg circles rather than swings — distinguishes whirl from non-rotational cross-body moves like butterfly. The terminal is always a clipper stall; the entry can be either clipper or toe. The directional flow at the dex moment is up-and-over rather than under-or-around.",
    topologyKind: 'rotational',
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickMechanicalDelta> = new Map(
  TRICK_MECHANICAL_DELTA_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickMechanicalDelta(slug: string): TrickMechanicalDelta | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}
