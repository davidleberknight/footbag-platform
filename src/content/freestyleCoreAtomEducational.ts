/**
 * Three-layer glossary entries for the twelve curator-authoritative core
 * trick atoms. Surfaces in the glossary Movement Basics section as the
 * "twelve core trick atoms" band, rendered as per-entry cards.
 *
 * Each entry follows the three-audience model:
 *   - `line`    is the always-visible plain, physical-first description
 *               ("what is this?"), what a beginner reads at a glance.
 *   - `relates` is the intermediate "how does it relate?" layer, shown in a
 *               per-entry collapsible.
 *   - `reveal`  is the rare expert "what does this reveal?" layer, one insight
 *               that reframes the atom rather than restating its mechanics,
 *               shown in its own collapsible. Every atom carries one. Whirl and
 *               swirl teach a conserved-terminal lesson and a name-order lesson;
 *               their deeper surface-frame reading stays deferred and unreleased.
 *
 * Prose is the signed-off Glossary V2 wording, adapted to the view-layer copy
 * standard (no em dashes in visitor-facing content). The twelve slugs are the
 * canonical atom set and also back CORE_ATOM_SLUGS / isCoreAtom below, which
 * service-layer rendering uses to gate compound-shaped trick-detail partials;
 * keep the slug list stable.
 *
 * Ordering is pedagogical (stalls, then orbit-class, then dex, then compound
 * dex), simple to complex, not the structural CORE_TRICK_SPEC order.
 *
 * To revise: edit a record below. Reversible TS content module.
 */

export interface CoreAtomEducationalCard {
  /** Canonical slug (FK to freestyle_tricks.slug). */
  slug: string;
  /** Display name as it appears on the card heading. */
  displayName: string;
  /** Official ADD as a string ('1', '2', '3'). */
  adds: string;
  /**
   * Always-visible line: opens with a plain-English formula (the structural
   * recipe, translated from the live operational notation), then one concise
   * physical sentence. No em dashes (visitor-facing copy standard).
   */
  line: string;
  /**
   * Intermediate "how it relates" layer: neighbours, mirrors, family role,
   * and any one-line reference to an insight that lives elsewhere. Rendered
   * in a per-entry collapsible.
   */
  relates: string;
  /**
   * Rare expert "what it reveals" layer: one insight that reframes the atom.
   * Present on every atom. Kept optional so the shaping layer can treat a
   * missing reveal as no collapsible without a type change.
   */
  reveal?: string;
}

/**
 * Twelve core trick atoms in pedagogical order: foundational stalls, then
 * orbit-class, then dex atoms, then compound dex atoms. The slug list is the
 * canonical atom set.
 */
export const CORE_ATOM_EDUCATIONAL: readonly CoreAtomEducationalCard[] = [
  {
    slug:        'toe_stall',
    displayName: 'Toe Stall',
    adds:        '1',
    line:        "Formula: a receiving surface, the bag held still on the flat top of the foot. It is the first surface every player learns and the place most tricks come home to.",
    relates:     "One of the two surfaces the whole vocabulary is built around; the other is the clipper. Nearly every dex begins from a toe stall and ends on one, and its close relatives are the other resting surfaces (clipper, inside, and the body stalls). When a toe stall starts a trick rather than finishes it, we call that a set.",
    reveal:      "A toe stall is not really a trick, it is an anchor state: a stable place the bag rests, and much of the vocabulary is the trip out from one anchor and back. That is why a bare stall scores one point while the dex reaching it scores more; the difficulty is in the trip, not the landing. Not every trick is stall-to-stall (kicks and some body tricks are not), but the anchor idea still frames how most tricks are read.",
  },
  {
    slug:        'clipper_stall',
    displayName: 'Clipper Stall',
    adds:        '2',
    line:        "Formula: a receiving surface, the bag held on the foot crossed behind the opposite leg (cross-body). If the toe stall is the shelf directly below you, the clipper is one you reach across your own body to build.",
    relates:     "The clipper is the toe stall's cross-body partner: many tricks that begin on a toe stall finish on a clipper. Whirl, swirl, butterfly, and osis all land here. Its faster cousin is the clipper kick, which strikes across the body without holding the bag and scores one point where the held stall scores two.",
    reveal:      "The clipper introduces the cross-body axis, the reach across and behind the opposite leg, and a whole branch of the sport lives on it: the clipper-landing atoms and the families they grow. Reading a trick's landing surface first, toe or clipper, tells you which branch it belongs to before you name it.",
  },
  {
    slug:        'around_the_world',
    displayName: 'Around-the-World (ATW)',
    adds:        '2',
    line:        "Formula: toe set + same-side circling dex + same-side toe catch. The foot carries the bag in a full circle around the outside of the leg and catches it again on the same toe, without crossing the body.",
    relates:     "A same-side atom: the working foot stays on its own side, unlike mirage and illusion, which travel to the opposite side. Its direction mirror is orbit, the same circle traced the other way; the two are a direction pair, both same-side toe atoms. It is the cleanest picture of a full dexterity loop, which the shorter dexes read as pieces of.",
    reveal:      "Two independent switches change an Around the World, and they are not the same move. Reverse its direction and you get orbit, its mirror. Change its terminal contact instead and you get a different object: Inside ATW and Outside ATW are separate canonical tricks, not styles of one, because they finish on different contacts. Direction and ending contact are separate axes, so the loop branches either way without either branch being a family.",
  },
  {
    slug:        'orbit',
    displayName: 'Orbit',
    adds:        '2',
    line:        "Formula: toe set + same-side circling dex, reverse direction + same-side toe catch. It is Around the World traced the other way, the same same-side loop run in reverse.",
    relates:     "Orbit is Around the World's direction mirror, exactly as illusion mirrors mirage. Both are same-side toe atoms. Orbit being its own trick rather than a backwards Around the World is the point that direction is structural (the Mirror Law, home: Mirage).",
    reveal:      "Orbit shows that a movement can be highly productive without becoming a canonical family. It can be repeated as Double Orbit or Triple Orbit and can contribute its shape to other names, but the glossary treats Orbit as a foundational movement atom used within tricks rather than as a conserved-terminal lineage. Productivity, repetition, and family status are separate ideas.",
  },
  {
    slug:        'legover',
    displayName: 'Legover',
    adds:        '2',
    line:        "Formula: set + opposite-side out-dex + same-side toe catch. The leg swings out and over the bag toward the opposite side, and the bag returns to a toe stall on the same foot it left from.",
    relates:     "Legover catches on the same-side toe, which is what separates it and its partner pickup from mirage and illusion, which catch on the opposite toe. Legover is the out-dex of that same-catch pair, pickup the in-dex. It is a workhorse base: the double-leg-over line builds on it.",
    reveal:      "Legover grows two different ways worth keeping apart. Repeat the move and you build the double-leg-over line, more of the same atom. Stack an operator instead and you get something else: eggbeater is an atomic legover, one operator over the base. Repetition and operator-stacking are separate axes, and a shared word in a name is not lineage: Scrambled Eggbeater sits with pickup, not in the legover line, despite the eggbeater in its name.",
  },
  {
    slug:        'mirage',
    displayName: 'Mirage',
    adds:        '2',
    line:        "Formula: set + opposite-side in-dex + opposite-side toe catch. The foot swings the bag across to the far side and back, catching it on a toe stall over there, with the supporting hip dipping to sell the shape.",
    relates:     "Mirage's mirror is illusion: the same opposite-side toe landing reached by the opposite direction of travel. It is one of the most recognizable shapes in the sport and the root of a deep modifier family.",
    reveal:      "Reverse a dex's direction and you do not get a softer version of the trick, you get a different trick with its own name, trained and scored separately. That is why mirage and illusion are two entries, not one with an arrow: direction is part of what a trick is. Once you look for a trick's mirror, half the dictionary is the other half with the direction flipped.",
  },
  {
    slug:        'pickup',
    displayName: 'Pickup',
    adds:        '2',
    line:        "Formula: set + opposite-side in-dex + same-side toe catch. The foot scoops inward under the bag toward the opposite side, then picks it back up on a toe stall on the same foot.",
    relates:     "Pickup is legover's same-catch partner: both catch on the same-side toe, unlike mirage and illusion. Pickup is the in-dex, legover the out-dex. It shares mirage's opposite-side in-dex but lands on the same foot instead of across, which is what makes it a pickup and not a mirage.",
    reveal:      "Four toe atoms fall out of two independent switches: which way the dex travels, in or out, and which toe catches it, your own side or the opposite. Pickup is in and same-side; legover is out and same-side; mirage is in and opposite-side; illusion is out and opposite-side. Learn the grid rather than four separate moves, and each new toe compound names its parents by its direction and its catching foot.",
  },
  {
    slug:        'illusion',
    displayName: 'Illusion',
    adds:        '2',
    line:        "Formula: set + opposite-side out-dex + opposite-side toe catch. The leg sweeps out and across in a wide, leggy crescent to the opposite toe, a fuller and more extended motion than the mirage it reverses.",
    relates:     "Illusion is the reverse-direction mirage (out where mirage goes in), landing on the same opposite-side toe. It is not nearly identical to mirage: the reversed, leggier sweep makes the two clearly distinguishable by eye, and each grows its own line of compounds. The mirage/illusion pair is the clearest early case that direction is structural (the Mirror Law).",
    reveal:      "Three things share this one movement and stay deliberately distinct. Illusion is the trick, a standalone outward opposite-side dex to a toe. Illusioning is descriptive standalone-movement language preserved in established names, not a reusable scored operator. Atomic is the same outward direction realized as a set that launches a trick. One shape, three roles, named apart on purpose and never merged into one.",
  },
  {
    slug:        'butterfly',
    displayName: 'Butterfly',
    adds:        '3',
    line:        "Formula: set + out-dex, same-side or opposite-side + cross-body clipper catch. A wing-like outward sweep of the foot across the body to a clipper landing, in both a same-side and an opposite-side variant.",
    relates:     "Butterfly is one of the twelve core atoms, a foundation rather than a combination. Its cross-body-landing neighbors are whirl and swirl; its descendants are the walking tricks.",
    reveal:      "The walking family is butterfly wearing operators: ripwalk is a stepping butterfly, dimwalk a pixie butterfly. A branch that looks like its own style is really one atom plus one modifier apiece, which is the recurring shape of the sport: a small set of atoms, a handful of operators, everything else composed.",
  },
  {
    slug:        'osis',
    displayName: 'Osis',
    adds:        '3',
    line:        "Formula: set + back-or-front spin + cross-body clipper catch. The body spins downward and the bag is caught cross-body on a clipper, the spin and the catch as one motion.",
    relates:     "Osis is the rotational cross-body atom, a cousin of whirl, swirl, and butterfly. It is the base a single operator turns into a famous-sounding compound: quantum osis is torque, whirling osis is blender (see Torque, and Name vs Structure).",
    reveal:      "Osis is the base beneath several famous names, but the dictionary records those links unevenly. Torque reads as quantum osis and blender as whirling osis, while others such as flux are carried through the osis base identity and prose rather than a tidy modifier-link record. So read an osis compound from its stated base and description, not by assuming a matching decomposition row always exists.",
  },
  {
    // The four clipper-terminal tricks (whirl, reverse whirl, swirl, reverse
    // swirl) are one ratified 2x2 matrix: dexing leg (OP or SAME) by direction
    // (IN or OUT), all from a flexible set into a clipper terminal.
    slug:        'whirl',
    displayName: 'Whirl',
    adds:        '3',
    line:        "Formula: set + opposite-side in-dex + cross-body clipper catch. An inward dex that finishes not on an open toe but across the body on a clipper, behind the leg.",
    relates:     "Whirl is one of the sport's major rotational bases. Many body and set modifiers have whirling forms, and whirling an osis gives blender, one of the two great osis compounds alongside torque. It is one cell of the clipper-terminal matrix: the opposite leg circling in, beside reverse whirl (opposite leg, out), swirl (same leg, out), and reverse swirl (same leg, in).",
    reveal:      "Whirl reveals how a family is built around an ending. Paradox Whirl, Spinning Whirl, Symposium Whirl, and other descendants may change the entry or body mechanics, but they still resolve through the whirl terminal onto a cross-body clipper. That conserved ending is what lets one base support a large productive lineage.",
  },
  {
    slug:        'swirl',
    displayName: 'Swirl',
    adds:        '3',
    line:        "Formula: set + same-side out dex + same-side cross-body clipper catch. The same-side leg circles outward once and the bag lands on a same-side clipper; the entry is flexible.",
    relates:     "Swirl is its own cross-body atom, structurally distinct from whirl: swirl's dex is the same-side leg circling out, where whirl's is the opposite leg circling in, and each catches on its own side's clipper. The four clipper-terminal siblings form one leg-by-direction matrix, and swirl heads its own line of swirling compounds.",
    reveal:      "The last word of a compound name identifies its base and therefore its ending. Whirling Swirl is a Swirl modified by a whirling movement; Swirling Whirl is a Whirl modified by a swirling movement. The same two roots in reversed order produce different tricks because one retains the Swirl terminal and the other retains the Whirl terminal. Read a compound from the end, as explained in Reading a Compound Name.",
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
