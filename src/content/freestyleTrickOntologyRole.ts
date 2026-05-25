/**
 * freestyleTrickOntologyRole.ts
 * ==============================
 *
 * Phase A + B of the trick-detail ontology doctrine (2026-05-25). L3 —
 * "ontology role" layer. Names what broader ontology concept this trick
 * exemplifies.
 *
 * Per §2.4 of the doctrine: L3 and L4 may naturally overlap. When the
 * overlap is genuine on a slug, the curator picks the better-fitting
 * slot and lets the other stay null (sections suppress when empty).
 *
 * Public-prose depersonalization holds: roles name traditions / readings
 * / ideas; individuals only in the glossary acknowledgements paragraph.
 */

export interface TrickOntologyRole {
  slug: string;
  /** Short role descriptor (e.g. "Paradox topology root"). Used as a section eyebrow. */
  role: string;
  /** 1-2 short paragraphs explaining why this trick exemplifies that ontology concept. */
  prose: string;
}

export const TRICK_ONTOLOGY_ROLE_ENTRIES: readonly TrickOntologyRole[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug: 'mirage',
    role: 'Movement-language entry point',
    prose:
      "Mirage is the foundational in-to-out dex template. The 2-ADD canonical decomposition — one dex, one stall, no body modifier — and the in-to-out directional flow together define the structural shape that paradox, blur, fury, sumo, and surge all transform. Movement-language learners encounter mirage first because every later compound reads as a transformation of its template, not as an independent invention.",
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox-mirage',
    role: 'Paradox topology root',
    prose:
      "Paradox-mirage is the foundational exemplar for paradox topology itself. Many compounds in modern shred vocabulary inherit paradox topology from this trick: blur extends the same chassis with a stepping multi-dex pattern; fury extends further with a third dex; sumo escalates with nuclear x-dex; surge layers a rotational character. The paradox topology composes naturally with stepping, rotational, x-dex, and surface modifiers — the persistence of its hip-pivot signature under heavy modifier stacking is what made paradox topology productive.",
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    role: 'Cross-body rotational dex anchor',
    prose:
      "Whirl is the family anchor for cross-body rotational dexes terminating on a clipper stall. The conserved terminal mechanic — clipper-anchored cross-body rotation — defines a family branch that includes blender (whirl-osis compound), pogo (whirl with a no-plant constraint), blistering (whirl with gyro back-spin), and a wider set of rotational siblings. The whirl family is one of the dictionary's most branchy trees, expanding across all five movement-language axes.",
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickOntologyRole> = new Map(
  TRICK_ONTOLOGY_ROLE_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickOntologyRole(slug: string): TrickOntologyRole | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}
