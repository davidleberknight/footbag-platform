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
  /**
   * Intermediate "how it relates" layer, shown in a collapsible. Omitted where
   * another chapter already teaches the relationship (set vs standalone, which
   * Timing & Sets explains in full).
   */
  relates?: string;
  /**
   * Rare expert "what it reveals" layer, present only on insight-home concepts
   * (Side here). Omit on connective concepts (Direction).
   */
  reveal?: string;
}

export const GLOSSARY_CORE_CONCEPTS: readonly GlossaryConceptCard[] = [
  {
    key:     'direction',
    line:    "A dexterity circles the bag one of two ways, inward or outward. The direction is set the instant the foot starts the bag moving, and it is one of the two choices that make one dex a different move from another.",
    relates: "Direction pairs with side to distinguish the two-point moves. Reversing a dex's direction gives a different trick with its own name, not a variant (the lesson of mirage and illusion). The one-dex foundational moves come in direction mirrors: around the world and orbit, mirage and illusion, whirl and reverse whirl (also called whip).",
  },
  {
    key:     'side',
    line:    "A dexterity works either on the same side or the opposite side, read against the most recent side-bearing component rather than a fixed plant leg. Same-side means the same leg as that component; opposite-side means the other leg, and two opposite relations in a row return to where they started.",
    relates: "Side is the second of the two choices that define a dex, alongside direction. The four two-point moves lay both axes out: around the world and orbit are same-side, mirage and illusion opposite-side. Which leg does the dex is part of what the trick is, not a matter of style or reach.",
    reveal:  "Two tricks can share landing, difficulty, even direction, and still be different tricks because one dexes with the same leg and the other with the opposite leg. Side is a full structural axis, not a variation. Hold direction and side as two independent switches, and the crowd of near-identical pairs stops being confusing: each move flips on either switch, and each flip is a separately named trick.",
  },
  {
    key:     'cross-body',
    line:    "Cross-body describes what the working foot does with the body: instead of working the bag in front of you on your open side, the foot reaches across and works behind the opposite leg, the legs crossing so the bag is handled on the far side.",
    relates: "Cross-body is the body relationship that defines the clipper: a clipper stall is a cross-body catch, and it is the shared signature of the foundational moves that land there (whirl, swirl, butterfly, osis) and their compounds. It is a body configuration, not a travel direction: whirl finishes cross-body on the opposite side and swirl on its own side, yet both are cross-body, so it is a distinct axis from side. In notation it appears as the scored cross-body bracket, one reason clipper-side moves such as whirl score differently from toe-side relatives such as mirage.",
  },
  {
    key:     'set-vs-operator',
    line:    "A dexterity movement can be realized two ways: as a set that launches the trick, or as a standalone movement performed once the bag is already up. The same directional movement takes a different name in each role. Realized as a set, the outward dex is Atomic; realized standalone, the same outward movement is Illusioning.",
    reveal:  "Because role lives in where the movement sits, not in the movement itself, you cannot classify the vocabulary by watching movements in isolation; you ask what job each piece is doing. Once role comes apart from mechanic, a short list of directional movements covers a long list of names: each direction carries a set name and a standalone name, and that two-way split organizes the whole layer instead of doubling the moves you have to memorize.",
  },
  {
    key:     'composition',
    line:    "A freestyle trick is usually not one indivisible thing, it is a structure: a base move with operators added to it. Quantum osis, blurry mirage, and two dexes in one set are all compositions, a foundation plus what has been layered on.",
    relates: "Composition is the premise that makes the vocabulary legible: a base plus one or more operators gives a named compound, and the count of parts is what the trick scores. It is the idea that lets torque be read as quantum osis rather than memorized whole. The payoff, that famous short names are secretly formulas, lands at the compound entries, not here.",
  },
  {
    key:     'add',
    line:    "ADD (Additional Degree of Difficulty) is freestyle's traditional component accounting: it counts scoring components, dexterities, cross-body positions, stalls and other scored elements, which the notation makes visible as bracketed parts. It is an additive score of what a trick contains, not a direct measure of how hard it is to execute.",
    relates: "Because ADD is a count of parts, it follows straight from composition: read a trick's structure and you can read its score. This is why the encyclopedia can call torque quantum osis and know what it scores, the parts are the points.",
    reveal:  "Once a trick is written down, the score checks itself: each scoring part sits in its own scoring bracket, so the scoring-bracket count is the ADD, and a reader can confirm it without trusting anyone. Not every bracket scores, which is what makes the count auditable rather than decorative: an action marker like [KICK] carries no weight. A scoring system that audits its own arithmetic in front of you is the strongest possible answer to how you know a trick is worth what it scores.",
  },
];

export const GLOSSARY_CORE_CONCEPTS_BY_KEY: ReadonlyMap<string, GlossaryConceptCard> = (() => {
  const m = new Map<string, GlossaryConceptCard>();
  for (const c of GLOSSARY_CORE_CONCEPTS) m.set(c.key, c);
  return m;
})();
