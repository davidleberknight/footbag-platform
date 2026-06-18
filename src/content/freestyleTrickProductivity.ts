/**
 * freestyleTrickProductivity.ts
 * ==============================
 *
 * L4,
 * "productivity narrative" layer. Explains why this trick became
 * generative: what composes naturally with it, why it anchors a family
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
      "Mirage anchors one of the dictionary's deepest family trees. The most productive descendants intensify directionality, escalate compositionality, or shift terminal surface. Paradox-mirage layers a hip-pivot topology onto the same in-to-out shape; blur adds a stepping multi-dex extension; fury extends with a third dex; sumo escalates with nuclear x-dex; drifter shifts the terminal from toe to clipper. Each descendant remains structurally recognizable as a mirage transformation: the persistence of the in-to-out dex template under composition is what made mirage productive.",
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
      "Paradox-mirage anchors one of the dictionary's deepest compositional trees and became the gateway to several productive chains at once: blur and its blurriest / blurrage multi-dex extensions, the paradox-whirl family on the rotational side, the paradox-topology blender ecosystem, and a wide range of modern stepping/paradox hybrids. Blur in particular grew into one of the most culturally central advanced transition tricks in the language: its emergence from paradox-mirage is the clearest example of how this chassis seeds further canonical vocabulary. Paradox-mirage became generative because the underlying hip-pivot topology preserves recognizability under heavy modifier stacking: descendants two or three modifiers deep still read as paradox-mirage transformations rather than novel inventions.",
    productiveDescendants: [
      { slug: 'blur',     label: 'blur',     note: 'Stepping multi-dex on the paradox-mirage chassis; major productive anchor in its own right.' },
      { slug: 'fury',     label: 'fury',     note: 'Three-dex extension (furious paradox mirage).' },
      { slug: 'sumo',     label: 'sumo',     note: 'Nuclear x-dex escalation; 5 ADD named exception.' },
      { slug: 'surreal',  label: 'surreal',  note: 'Surging rotational system layered on paradox-whirl, mirror-pattern descendant.' },
    ],
  },

  // ── C1 mirage-descendant batch ─────────────────
  // blur authored here (L4 prose + descendants). fury and sumo intentionally
  // suppress L4: both are leaf-class compounds without deep productive trees;
  // per the doctrine lock §2 rule 7, suppression > filler.

  {
    slug: 'blur',
    prose:
      "Blur is the cultural-canonical landmark for the stepping-paradox-mirage compound. Structurally, blur sits as a 4-ADD compound on the mirage chassis with a stepping-paradox modifier stack; few compounds build directly on top of it. Its productivity is naming-tradition rather than compositional anchorage: the \"stepping paradox\" shorthand often resolves to blur in player vocabulary, and the broader stepping-paradox lineage reads as kin even where the structural decompositions differ. Fury (furious-paradox-mirage at 5 ADD) extends the multi-dex depth on the same chassis; blurriest carries the blurry-naming tradition into a different chassis at the same 5-ADD bucket.",
    productiveDescendants: [
      { slug: 'fury',       label: 'fury',       note: 'Three-dex extension on the mirage chassis; furious-paradox-mirage at 5 ADD.' },
      { slug: 'blurriest',  label: 'blurriest',  note: 'Blurry-naming kin on a different chassis (5-ADD blurry-barfly).' },
    ],
  },

  {
    slug: 'drifter',
    prose:
      "Drifter anchors the shred lineage: a deep family of compounds built directly on the drifter chassis. The mirage-dex-into-clipper-terminal structural signature composes naturally with body modifiers (paradox-drifter), with rotational variants (vortex), with naming-driven extensions (smoke, lotus, tombstone, fume, quantum-drifter), and with surface-and-stepping siblings (high-plains-drifter on the same clipper-stall chassis). The drifter family is one of the dictionary's broader trees at the 4-ADD layer, and drifter's productivity derives from how cleanly the chassis tolerates further modifier layering while preserving the mirage-dex-into-clipper signature.",
    productiveDescendants: [
      { slug: 'paradox-drifter', label: 'paradox-drifter', note: 'Paradox topology layered on the drifter chassis; 4 ADD.' },
      { slug: 'vortex',          label: 'vortex',          note: 'Rotational variant on the drifter chassis; 4 ADD.' },
      { slug: 'smoke',           label: 'smoke',           note: 'Named extension on the drifter chassis; 4 ADD.' },
      { slug: 'lotus',           label: 'lotus',           note: '5-ADD compound on the drifter chassis.' },
      { slug: 'high-plains-drifter', label: 'high-plains-drifter', note: 'Sibling on the clipper-stall chassis with an additional modifier; 4 ADD.' },
    ],
  },

  {
    slug: 'barrage',
    prose:
      "Barrage is productive along two distinct axes. As a structural anchor, it carries direct descendants on its chassis (paradox-barrage, blurrage): compounds that layer modifiers onto the doubled-dex pattern. As a naming root, the \"barraging\" modifier extends across the broader language, producing fury (barraging-paradox-mirage in earlier doctrine) and flurry (barraging-leg-over). The combined productivity (chassis descendants plus modifier-named operator instances) is what justifies barrage's standalone anchor status.",
    productiveDescendants: [
      { slug: 'paradox-barrage', label: 'paradox-barrage', note: 'Paradox layered on the doubled-dex chassis; 4 ADD.' },
      { slug: 'blurrage',        label: 'blurrage',        note: 'Stepping-paradox layered on barrage; 4 ADD.' },
      { slug: 'fury',            label: 'fury',            note: 'Operator-path kin: barraging-paradox-mirage (earlier doctrine).' },
    ],
  },

  // ── C2 whirl-descendant batch ──────────────────
  // blender authored here (L4 prose + descendants). surreal and phoenix
  // intentionally suppress L4: both are leaf compounds at the top of
  // their extension axes; per the doctrine lock §2 rule 7, suppression
  // > filler.

  {
    slug: 'blender',
    prose:
      "Blender anchors a deep family of 5-6 ADD compounds. The whirl-into-osis structural signature composes naturally with body modifiers (paradox-blender), with stepping-and-ducking stacks (stepping-ducking-paradox-blender), with rotational layering (spinning-paradox-blender), and with naming-driven extensions (fender, fender-bender, mind-bender, spender, food-processor). The blender family is one of the dictionary's broader trees at the 5-6 ADD layer, and the chassis's productivity demonstrates that compound-of-canonicals readings can themselves anchor further compositional layering rather than functioning as leaf compounds.",
    productiveDescendants: [
      { slug: 'paradox-blender',          label: 'paradox-blender',          note: 'Paradox layered on the whirl-osis chassis; 5 ADD.' },
      { slug: 'fender',                   label: 'fender',                   note: 'Named extension on the blender chassis; 5 ADD.' },
      { slug: 'food-processor',           label: 'food-processor',           note: 'Blurry-modified blender; 6 ADD.' },
      { slug: 'spender',                  label: 'spender',                  note: 'Compound extension on the blender chassis; 6 ADD.' },
      { slug: 'mind-bender',              label: 'mind-bender',              note: 'Named extension on the blender chassis; 6 ADD.' },
      { slug: 'spinning-paradox-blender', label: 'spinning-paradox-blender', note: 'Spinning-paradox layered on blender; 6 ADD.' },
    ],
  },

  // ── C3 independent-anchor batch ────────────────
  // osis / butterfly / torque authored here (deep productive families).
  // mobius, ripwalk, food-processor suppress L4: all are leaf compounds
  // per the doctrine lock §2 rule 7.

  {
    slug: 'osis',
    prose:
      "Osis anchors one of the dictionary's most productive trees. The spin-into-clipper structural signature composes naturally with body modifiers (ducking-osis, spinning-osis, atomic-osis), with paradox topology (paradox-osis), with x-dex character (atomic-osis as the explicit case; stepping-osis as the multi-dex case), with set treatments (pixie-osis), with rotational layering producing compound-of-canonicals (torque = miraging-osis; blender = whirling-osis), and with naming-driven extensions (twirl, aeon-flux, barraging-osis). The osis family is among the broadest at the 4-5 ADD layer.",
    productiveDescendants: [
      { slug: 'torque',         label: 'torque',         note: 'Miraging-osis compound; sub-family anchor in its own right.' },
      { slug: 'blender',        label: 'blender',        note: 'Whirling-osis compound; compound-of-canonicals exemplar.' },
      { slug: 'ducking-osis',   label: 'ducking-osis',   note: 'Body modifier layered on osis; 4 ADD.' },
      { slug: 'pixie-osis',     label: 'pixie-osis',     note: 'Set-treatment modifier on osis; 4 ADD.' },
      { slug: 'spinning-osis',  label: 'spinning-osis',  note: 'Rotational body modifier on osis; 4 ADD.' },
      { slug: 'aeon-flux',      label: 'aeon-flux',      note: '5-ADD named extension on the osis chassis.' },
    ],
  },

  {
    slug: 'butterfly',
    prose:
      "Butterfly is among the most productive anchors in the dictionary: its chassis carries more named modifier extensions than almost any other base. The leg-over-to-clipper structural signature composes naturally with body modifiers (atomic-butterfly, ducking-butterfly, gyro-butterfly, spinning-butterfly), with set treatments (dimwalk = pixie butterfly; tapdown), with stepping (ripwalk = stepping butterfly), with stepping-paradox (parkwalk), and with multi-modifier stacks (phoenix = pixie-ducking-butterfly; yoda; ripped-warrior; matador). The 4-ADD bucket on the butterfly chassis is the densest single-modifier population in the dictionary.",
    productiveDescendants: [
      { slug: 'ripwalk',           label: 'ripwalk',           note: 'Stepping butterfly compound; shred-vocabulary root.' },
      { slug: 'dimwalk',           label: 'dimwalk',           note: 'Pixie butterfly compound; 4 ADD.' },
      { slug: 'parkwalk',          label: 'parkwalk',          note: 'Stepping-paradox butterfly; 4 ADD.' },
      { slug: 'atomic-butterfly',  label: 'atomic-butterfly',  note: 'Atomic modifier on butterfly; 4 ADD.' },
      { slug: 'ducking-butterfly', label: 'ducking-butterfly', note: 'Ducking body modifier on butterfly; 4 ADD.' },
      { slug: 'phoenix',           label: 'phoenix',           note: 'Pixie-ducking butterfly; 5 ADD multi-modifier compound.' },
    ],
  },

  {
    slug: 'torque',
    prose:
      "Torque is one of the dictionary's most productive intermediate-base anchors. The miraging-osis structural signature composes naturally with body modifiers (paradox-torque, spinning-torque, atomic-torque, symposium-torque), with gyro rotation (mobius = gyro-torque), with stepping-paradox layering (blurry-torque), and with naming-driven extensions (forque, grave-digger, spinal-tap, big-apple). The 5-ADD bucket on the torque chassis is dense, and the family extends into 6 and 7 ADD via deeper modifier stacks (gauntlet = highest-ADD torque compound).",
    productiveDescendants: [
      { slug: 'mobius',          label: 'mobius',          note: 'Gyro torque; 5 ADD compound at the top of the gyro-on-compound branch.' },
      { slug: 'paradox-torque',  label: 'paradox-torque',  note: 'Paradox topology on torque chassis; 5 ADD.' },
      { slug: 'spinning-torque', label: 'spinning-torque', note: 'Rotational body modifier on torque; 5 ADD.' },
      { slug: 'atomic-torque',   label: 'atomic-torque',   note: 'Atomic modifier on torque; 6 ADD.' },
      { slug: 'gauntlet',        label: 'gauntlet',        note: 'Highest-ADD torque compound in the dictionary; 7 ADD.' },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    prose:
      "Whirl is among the most generative anchors in the dictionary. The conserved cross-body-rotational-with-clipper-terminal pattern composes naturally with body modifiers (gyro, spinning, ducking), with suspension modifiers (symposium produces pogo), with terminal compounds (osis produces blender), and with topology modifiers (paradox produces paradox-whirl and surge). What makes whirl productive is the persistence of its rotational signature: descendants remain recognizably whirl-derived even under heavy modifier stacking. The cross-body rotational catch also supports fluid combo continuity: whirl-shaped transitions link naturally into spinning, paradox, ducking, symposium, and stepping systems alike, which is why whirl became one of the most productive transition anchors in advanced freestyle run architecture.",
    productiveDescendants: [
      { slug: 'blender',     label: 'blender',     note: 'Terminal compound: whirl-osis.' },
      { slug: 'blistering',  label: 'blistering',  note: 'Gyro back-spin layered on whirl.' },
      { slug: 'surreal',     label: 'surreal',     note: 'Surging-paradox-whirl, top of the rotational-topology ladder.' },
    ],
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickProductivity> = new Map(
  TRICK_PRODUCTIVITY_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickProductivity(slug: string): TrickProductivity | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}
