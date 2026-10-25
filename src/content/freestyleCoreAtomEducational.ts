/**
 * The twelve foundational moves taught on the Freestyle Concepts opening
 * chapter (Movement Basics), rendered as one card each.
 *
 * Each card has:
 *   - `line`, always visible: "Movement:" and a plain physical description of
 *     what the body and the bag do, the part a beginner reads at a glance.
 *   - `panels`, optional collapsible depth, each with a title naming what it
 *     teaches. A card carries one panel where its relationships and its insight
 *     overlap, and none is mechanically paired with another.
 *
 * Each lesson is taught once, on the card where it teaches best, and the other
 * cards compare to it briefly: the direction and catching-foot grid and the
 * direction-reversal lesson live on Mirage, the clipper-ending grid on Whirl,
 * and the compound-name reading on Swirl. Family classification and operator
 * composition belong to their own chapters; a card keeps only a short example.
 *
 * The reader-facing text says "move", never "atom": Atomic is a set name, and
 * the metaphor collides with it. The exported names below keep their historical
 * identifiers because services and tests key on them.
 *
 * Visitor-facing copy: no em dashes. Ordering is pedagogical (the two stalls,
 * the two full circles, the four one-dex toe moves, then the four clipper
 * landings), not the structural CORE_TRICK_SPEC order. The twelve slugs are the
 * canonical set behind CORE_ATOM_SLUGS / isCoreAtom below, which service-layer
 * rendering uses to gate compound-shaped trick-detail partials; keep the slug
 * list stable.
 *
 * To revise: edit a record below. Reversible TS content module.
 */

/** One collapsible panel of deeper teaching on a card. */
export interface CoreMovePanel {
  /** Summary text naming what the panel teaches. */
  title: string;
  body:  string;
}

export interface CoreAtomEducationalCard {
  /** Canonical slug (FK to freestyle_tricks.slug). */
  slug: string;
  /** Display name as it appears on the card heading. */
  displayName: string;
  /** Official ADD as a string ('1', '2', '3'). */
  adds: string;
  /**
   * Always-visible line: "Movement:" and what the body and the bag do. No em
   * dashes (visitor-facing copy standard).
   */
  line: string;
  /** Optional depth, each panel titled by what it teaches. */
  panels: readonly CoreMovePanel[];
}

export const CORE_ATOM_EDUCATIONAL: readonly CoreAtomEducationalCard[] = [
  {
    slug:        'toe_stall',
    displayName: 'Toe Stall',
    adds:        '1',
    line:        'Movement: the bag comes to rest on the top of the foot, just behind the toes, and stays there.',
    panels: [
      {
        title: 'A trick and a resting point',
        body:  'A toe stall is both a trick and an anchor state: it is catalogued and scored like any other trick, and it is also the stable place the bag rests between moves. Many tricks start from a toe stall or end on one (kicks and some body tricks do not), and a toe stall that starts a trick is called a set. A bare stall scores one point while the dex reaching it scores more, because the difficulty is in the trip, not the landing.',
      },
    ],
  },
  {
    slug:        'clipper_stall',
    displayName: 'Clipper Stall',
    adds:        '2',
    line:        'Movement: the bag is caught on the inside of the foot while that foot is crossed behind the supporting leg.',
    panels: [
      {
        title: 'Why it scores two',
        body:  'Crossing behind the supporting leg is a scored cross-body position, so a clipper stall scores two where a toe stall scores one. Whirl, swirl, butterfly and osis all finish here. The clipper kick strikes the bag from the same crossed position without holding it and scores one.',
      },
    ],
  },
  {
    slug:        'around_the_world',
    displayName: 'Around the World',
    adds:        '2',
    line:        'Movement: after a toe set, the setting leg circles all the way around the bag inward while it is in the air, and the bag is caught again on the same toe.',
    panels: [
      {
        title: 'Two ways to change it',
        body:  'The leg that sets is the leg that circles, so the move never crosses the body. Reverse the circle and you get Orbit (direction is explained under Mirage). Change the ending contact instead and you get a different trick: Inside Around the World and Outside Around the World are separate canonical tricks, not styles of one, because they finish on different contacts. Direction and ending contact are separate switches, and neither branch is a family.',
      },
    ],
  },
  {
    slug:        'orbit',
    displayName: 'Orbit',
    adds:        '2',
    line:        'Movement: the same full circle as Around the World, traced outward, with the bag caught again on the setting toe.',
    panels: [
      {
        title: 'Repeated, but not a family',
        body:  'Orbit repeats as Double Orbit and Triple Orbit and lends its shape to other names, yet it is a movement used within tricks rather than a family root. Being productive, repeating, and being a family are separate ideas (see the Family Encyclopedia).',
      },
    ],
  },
  {
    slug:        'mirage',
    displayName: 'Mirage',
    adds:        '2',
    line:        'Movement: after the set, the other leg circles the bag once from the inside to the outside, and the bag drops back to the toe that set it; the circling leg does not make the catch.',
    panels: [
      {
        title: 'Direction and catching foot',
        body:  'Two switches separate the four one-dex toe moves: which way the leg circles, and which foot makes the catch. Mirage circles inward and returns to the setting foot; Illusion circles outward and returns to the setting foot; Pickup circles inward and is caught by the dexing foot; Legover circles outward and is caught by the dexing foot. Reversing a dex\'s direction does not give a softer version of a trick but a different trick with its own name, trained and scored separately; that is why Mirage and Illusion, Around the World and Orbit, and Whirl and Reverse Whirl are separate entries. The eight closest relatives in Dexterities add a third switch, the side.',
      },
    ],
  },
  {
    slug:        'illusion',
    displayName: 'Illusion',
    adds:        '2',
    line:        'Movement: after the set, the other leg circles the bag once from the outside to the inside, and the bag returns to the toe that set it; the circling leg does not make the catch.',
    panels: [
      {
        title: 'Illusion, Illusioning and Atomic',
        body:  'Illusion is Mirage with the direction reversed (see Mirage). Three names share its outward movement and stay distinct: Illusion is the trick, an outward opposite-side dex back to the setting toe; Illusioning is descriptive language for the same movement in established names such as Illusioning Kick, not a reusable scored operator; and Atomic is that outward movement used as a set to launch a trick (see Timing & Sets).',
      },
    ],
  },
  {
    slug:        'pickup',
    displayName: 'Pickup',
    adds:        '2',
    line:        'Movement: after the set, the other leg circles the bag inward, and the bag is caught on that leg\'s toe rather than on the foot that set it.',
    panels: [
      {
        title: 'Compared with Mirage',
        body:  'Pickup and Mirage circle the same way; only the catching foot differs. Players often feel a pickup as scooping beneath the bag, but what makes it a pickup is the catch on the dexing foot (the full grid is under Mirage).',
      },
    ],
  },
  {
    slug:        'legover',
    displayName: 'Legover',
    adds:        '2',
    line:        'Movement: after the set, the other leg circles outward over the bag, and the bag is caught on that leg\'s toe rather than on the foot that set it.',
    panels: [
      {
        title: 'Two ways it grows',
        body:  'Legover is Pickup with the direction reversed, and Illusion with the other catching foot (see Mirage). It grows two ways that are worth keeping apart: repeat the movement and you build the double-leg-over line; launch it with a set instead and you get Eggbeater, an atomic legover. A shared word is not lineage, though: Scrambled Eggbeater sits with Pickup, not in the legover line.',
      },
    ],
  },
  {
    slug:        'butterfly',
    displayName: 'Butterfly',
    adds:        '3',
    line:        'Movement: after the set, the other leg circles the bag outward and carries across the body, and the bag is caught cross-body on a clipper. This opposite-side out-dex is the base form; the same-side execution is its own named trick, Butterfly Same Side.',
    panels: [
      {
        title: 'The walking tricks',
        body:  'Ripwalk is a stepping butterfly and Dimwalk a pixie butterfly: the same move launched by a different set. Most of the vocabulary is built this way, a few base moves plus a few operators (see Operators & Modifiers).',
      },
    ],
  },
  {
    slug:        'osis',
    displayName: 'Osis',
    adds:        '3',
    line:        'Movement: after the set, the body spins, backward or forward, and the bag is caught cross-body on a clipper as the spin finishes.',
    panels: [
      {
        title: 'Tricks built on osis',
        body:  'Torque reads as quantum osis and Blender as whirling osis: a dex added before the same spin-to-clipper finish. Not every osis compound has a tidy formula, though; Flux, for one, is known through the osis base and its own description.',
      },
    ],
  },
  {
    // The four clipper-terminal tricks (whirl, reverse whirl, swirl, reverse
    // swirl) are one ratified 2x2 matrix: dexing leg (OP or SAME) by direction
    // (IN or OUT), all from a flexible set into a clipper terminal.
    slug:        'whirl',
    displayName: 'Whirl',
    adds:        '3',
    line:        'Movement: after the set, the other leg circles the bag inward, and the bag is caught cross-body on a clipper behind the supporting leg.',
    panels: [
      {
        title: 'The clipper-ending grid',
        body:  'Four moves share a flexible set and a clipper ending, differing only in which leg circles and which way: Whirl (other leg, inward), Reverse Whirl (other leg, outward), Swirl (same leg, outward) and Reverse Swirl (same leg, inward). Paradox Whirl, Spinning Whirl and Whirl\'s other descendants change the entry or the body but keep its clipper ending, which is what makes Whirl a family root.',
      },
    ],
  },
  {
    slug:        'swirl',
    displayName: 'Swirl',
    adds:        '3',
    line:        'Movement: the leg on the bag\'s side circles it outward once, and the bag is caught on a clipper on that same side; the entry can vary.',
    panels: [
      {
        title: 'How compound names work',
        body:  'Swirl is the same-leg, outward cell of the clipper-ending grid (see Whirl). In a compound built by adding an operator, the last word names the base and the base keeps its ending: Whirling Swirl is a swirl with a whirling movement added, and Swirling Whirl a whirl with a swirling one, two different tricks. Folk names such as Mobius or Blur do not follow this pattern; read those from their decomposition.',
      },
    ],
  },
];

/** Convenience map for slug-keyed lookup. */
export const CORE_ATOM_EDUCATIONAL_BY_SLUG: ReadonlyMap<string, CoreAtomEducationalCard> = (() => {
  const m = new Map<string, CoreAtomEducationalCard>();
  for (const c of CORE_ATOM_EDUCATIONAL) m.set(c.slug, c);
  return m;
})();

/**
 * Canonical core-atom slug set: single source of truth derived from
 * CORE_ATOM_EDUCATIONAL. Service-layer rendering uses this set to
 * suppress compound-shaped trick-detail partials (addAnalysis,
 * equivalenceTopology) on atom pages. Atoms are the floor of
 * decomposition; rendering compound-shaped sections on them produces
 * placeholder content or false structural claims.
 *
 * See isCoreAtom() helper for the canonical membership predicate.
 */
export const CORE_ATOM_SLUGS: ReadonlySet<string> = new Set(
  CORE_ATOM_EDUCATIONAL.map(c => c.slug),
);

/**
 * Returns true when the slug is one of the 12 curator-locked core
 * atoms. Use in service-layer rendering decisions; do NOT branch in
 * templates on atom-vs-compound directly.
 */
export function isCoreAtom(slug: string): boolean {
  return CORE_ATOM_SLUGS.has(slug);
}
