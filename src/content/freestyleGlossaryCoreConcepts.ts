/**
 * Three-layer glossary entries for the Core Concept hubs. Surfaces in the
 * glossary's concept subsections as per-entry cards: a `line` always visible,
 * a "how it relates" collapsible, and a rare "what it reveals" collapsible on
 * insight-home entries. This slice carries Direction and Side (rendered in the
 * Dexterities section); later slices add the remaining signed-off concepts.
 *
 * Prose is the signed-off Glossary V2 wording, adapted to the visitor copy
 * standard (no em dashes). Unlike the atom cards, Core Concepts are abstract
 * hubs, not tricks, so a Line carries no operational-notation formula. Surface
 * Frame is deliberately absent: it stays held until reverse-swirl verification.
 *
 * Reversible TS content module.
 */

export interface GlossaryConceptCard {
  /** Stable key, also the card's anchor id suffix. */
  key: string;
  /** Always-visible line: plain conceptual description. No em dashes. */
  line: string;
  /** Intermediate "how it relates" layer, shown in a collapsible. */
  relates: string;
  /**
   * Rare expert "what it reveals" layer, present only on insight-home concepts
   * (Side here). Omit on connective concepts (Direction).
   */
  reveal?: string;
}

export const GLOSSARY_CORE_CONCEPTS: readonly GlossaryConceptCard[] = [
  {
    key:     'direction',
    line:    "A dexterity travels one of two ways around the leg, inward or outward. The direction is set the instant the foot starts the bag moving, and it is one of the two choices that make one dex a different move from another.",
    relates: "Direction pairs with side to distinguish the two-point atoms. Reversing a dex's direction is not a softer or harder version of the trick, it is a different trick with its own name, trained and scored separately, which is the lesson mirage and illusion teach. Every atom has a direction mirror: around the world and orbit, mirage and illusion, whirl and whip.",
  },
  {
    key:     'side',
    line:    "A dexterity works either on your own side, the side of the leg you are standing on, or crosses to the opposite side. Same-side and opposite-side describe where the bag travels relative to your plant leg.",
    relates: "Side is the second of the two choices that define a dex, alongside direction. The four two-point atoms lay both axes out: around the world and orbit are same-side, mirage and illusion opposite-side. Which side the bag travels to is part of what the trick is, not a matter of style or reach.",
    reveal:  "Two tricks can share landing, difficulty, even direction, and still be different tricks because one stays on your side and the other crosses the body. Side is a full structural axis, not a variation. Hold direction and side as two independent switches, and the crowd of near-identical pairs stops being confusing: each atom flips on either switch, and each flip is a separately named, separately scored trick.",
  },
  {
    key:     'cross-body',
    line:    "Cross-body describes what the working foot does with the body: instead of working the bag in front of you on your open side, the foot reaches across and works behind the opposite leg, the legs crossing so the bag is handled on the far side.",
    relates: "Cross-body is the body relationship that defines the clipper: a clipper stall is a cross-body catch, and it is the shared signature of the atoms that land there (whirl, swirl, butterfly, osis) and their compounds. It is a body configuration, not a travel direction: whirl finishes cross-body on the opposite side and swirl on its own side, yet both are cross-body, so it is a distinct axis from side. In notation it appears as the scored cross-body bracket, one reason clipper-side atoms such as whirl score differently from toe-side relatives such as mirage.",
  },
];

export const GLOSSARY_CORE_CONCEPTS_BY_KEY: ReadonlyMap<string, GlossaryConceptCard> = (() => {
  const m = new Map<string, GlossaryConceptCard>();
  for (const c of GLOSSARY_CORE_CONCEPTS) m.set(c.key, c);
  return m;
})();
