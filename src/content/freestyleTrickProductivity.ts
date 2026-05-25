/**
 * freestyleTrickProductivity.ts
 * ==============================
 *
 * Phase A + B of the trick-detail ontology doctrine (2026-05-25). L4 —
 * "productivity narrative" layer. Explains why this trick became
 * generative — what composes naturally with it, why it anchors a family
 * or topology or shorthand tradition.
 *
 * Per §2.4 of the doctrine: L3 and L4 may overlap on a given slug;
 * curator picks the better slot, the other stays null.
 *
 * Productive descendants are curator-authored slug references (not
 * NLP-extracted from prose) so the cross-references stay stable and
 * editable.
 */

export interface ProductiveDescendant {
  /** Trick slug the descendant resolves to (becomes a /freestyle/tricks/<slug> link). */
  slug: string;
  /** Display label for the link. */
  label: string;
  /** Optional one-line note on what this descendant adds compositionally. */
  note?: string;
}

export interface TrickProductivity {
  slug: string;
  /** 1-2 short paragraphs on why this trick became compositionally generative. */
  prose: string;
  /** Curator-authored list of productive descendants. */
  productiveDescendants: readonly ProductiveDescendant[];
}

export const TRICK_PRODUCTIVITY_ENTRIES: readonly TrickProductivity[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug: 'mirage',
    prose:
      "Mirage anchors one of the dictionary's deepest family trees. The most productive descendants intensify directionality, escalate compositionality, or shift terminal surface. Paradox-mirage layers a hip-pivot topology onto the same in-to-out shape; blur adds a stepping multi-dex extension; fury extends with a third dex; sumo escalates with nuclear x-dex; drifter shifts the terminal from toe to clipper. Each descendant remains structurally recognizable as a mirage transformation — the persistence of the in-to-out dex template under composition is what made mirage productive.",
    productiveDescendants: [
      { slug: 'paradox-mirage', label: 'paradox-mirage', note: 'Adds paradox hip-pivot topology to the in-to-out dex.' },
      { slug: 'blur',           label: 'blur',           note: 'Stepping multi-dex extension over the paradox-mirage chassis.' },
      { slug: 'fury',           label: 'fury',           note: 'Three-dex extension on the blur chassis.' },
      { slug: 'sumo',           label: 'sumo',           note: 'Nuclear x-dex escalation; 5 ADD named exception.' },
      { slug: 'drifter',        label: 'drifter',        note: 'Terminal-surface shift from toe delay to clipper stall.' },
    ],
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox-mirage',
    prose:
      "Paradox-mirage anchors one of the dictionary's deepest compositional trees and became the gateway to several productive chains at once: blur and its blurriest / blurrage multi-dex extensions, the paradox-whirl family on the rotational side, the paradox-topology blender ecosystem, and a wide range of modern stepping/paradox hybrids. Blur in particular grew into one of the most culturally central advanced transition tricks in the language — its emergence from paradox-mirage is the clearest example of how this chassis seeds further canonical vocabulary. Paradox-mirage became generative because the underlying hip-pivot topology preserves recognizability under heavy modifier stacking — descendants two or three modifiers deep still read as paradox-mirage transformations rather than novel inventions.",
    productiveDescendants: [
      { slug: 'blur',     label: 'blur',     note: 'Stepping multi-dex on the paradox-mirage chassis; major productive anchor in its own right.' },
      { slug: 'fury',     label: 'fury',     note: 'Three-dex extension (furious paradox mirage).' },
      { slug: 'sumo',     label: 'sumo',     note: 'Nuclear x-dex escalation; 5 ADD named exception.' },
      { slug: 'surreal',  label: 'surreal',  note: 'Surging rotational system layered on paradox-whirl, mirror-pattern descendant.' },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    prose:
      "Whirl is among the most generative anchors in the dictionary. The conserved cross-body-rotational-with-clipper-terminal pattern composes naturally with body modifiers (gyro, spinning, ducking), with suspension modifiers (symposium produces pogo), with terminal compounds (osis produces blender), and with topology modifiers (paradox produces paradox-whirl and surge). What makes whirl productive is the persistence of its rotational signature: descendants remain recognizably whirl-derived even under heavy modifier stacking. The cross-body rotational catch also supports fluid combo continuity — whirl-shaped transitions link naturally into spinning, paradox, ducking, symposium, and stepping systems alike, which is why whirl became one of the most productive transition anchors in advanced freestyle run architecture.",
    productiveDescendants: [
      { slug: 'blender',     label: 'blender',     note: 'Terminal compound — whirl-osis.' },
      { slug: 'pogo',        label: 'pogo',        note: 'Suspension variant — whirl with no-plant constraint.' },
      { slug: 'blistering',  label: 'blistering',  note: 'Gyro back-spin layered on whirl.' },
      { slug: 'surreal',     label: 'surreal',     note: 'Surging-paradox-whirl — top of the rotational-topology ladder.' },
    ],
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickProductivity> = new Map(
  TRICK_PRODUCTIVITY_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickProductivity(slug: string): TrickProductivity | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}
