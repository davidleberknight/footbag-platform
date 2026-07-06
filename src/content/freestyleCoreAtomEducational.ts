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
 *   - `reveal`  is the rare expert "what does this reveal?" layer, present
 *               only on the four insight-home atoms (toe stall, clipper stall,
 *               mirage, butterfly) and shown in its own collapsible. Connective
 *               atoms carry no reveal; whirl and swirl are connective here, with
 *               their deeper surface-frame reading deferred.
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
   * Always-visible line: plain, physical-first description of what the
   * movement is. No em dashes (visitor-facing copy standard).
   */
  line: string;
  /**
   * Intermediate "how it relates" layer: neighbours, mirrors, family role,
   * and any one-line reference to an insight that lives elsewhere. Rendered
   * in a per-entry collapsible.
   */
  relates: string;
  /**
   * Rare expert "what it reveals" layer. Present only on insight-home atoms
   * (toe stall, clipper stall, mirage, butterfly). Omit on connective atoms.
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
    line:        "A toe stall is the bag balanced and held still on the top of the foot, toes lifted, the foot flat like a small shelf. It is the first thing almost every player learns, and the place almost every trick comes home to. When you see a trick land, this is usually what it lands on.",
    relates:     "The toe stall is one of two surfaces the whole vocabulary is built around; the other is the clipper. Nearly every dexterity (the moving part of a trick) begins from a toe stall and ends on one. Its close relatives are the other resting surfaces: the clipper stall, the inside stall, and the various body stalls. Where a trick uses a toe stall to start rather than to finish, we call that a set.",
    reveal:      "Here is the shift: the toe stall is not really a trick at all. It is a state, a stable moment the bag can be parked in, and freestyle is the art of leaving that state and returning to it by a more and more interesting path. Once you see the toe stall as a home rather than a move, the whole dictionary reorganizes itself in your mind: a trick is a journey between two stalls, and the stall is the punctuation, not the sentence. This is why a bare stall scores only one point, while the dex that reaches it can score many. The difficulty was never in the landing. It was in the trip.",
  },
  {
    slug:        'clipper_stall',
    displayName: 'Clipper Stall',
    adds:        '2',
    line:        "A clipper stall holds the bag on the top of the foot while that foot is crossed underneath the opposite leg: the balancing foot reaches across the body and catches the bag on the far side. If the toe stall is the shelf directly below you, the clipper is the shelf you have to reach across yourself to build.",
    relates:     "The clipper is the toe stall's structural partner. A great many tricks that begin on a toe stall end on a clipper: the foot leaves an open, in-front position and arrives at a crossed, behind-the-leg one. Whirl, swirl, butterfly, and torque all land here. The clipper stall (a held catch) has a faster cousin, the clipper kick, where the foot strikes across the body without holding the bag; the kick scores one point, the stall two, because holding a cross-body balance is harder than passing through it.",
    reveal:      "Study where tricks start and where they end, across the entire dictionary, and two surfaces tower over all the others: toe and clipper. Almost everything freestyle has ever named enters from one and lands on the other. This is not a rule anyone wrote; it is a shape the vocabulary grew into, and it tells you something about the sport itself: freestyle is, at its core, the endless elaboration of a single move, taking the bag from an open shelf in front of you to a crossed shelf behind your leg, and finding a harder and harder way to get there.",
  },
  {
    slug:        'around_the_world',
    displayName: 'Around-the-World (ATW)',
    adds:        '2',
    line:        "From a toe stall, the foot lifts and carries the bag in a complete circle all the way around the outside of the leg, then catches it again on the same toe. The bag never changes feet and never crosses the body: it simply orbits the leg once and comes home. It is the first trick that feels like tricking, and the first taste of the idea at the heart of the sport: move the bag on a path and catch it where you started.",
    relates:     "Around the World is a same-side trick (the working foot stays on its own side of the body), which sets it apart from its neighbors mirage and illusion, whose dexterities travel to the opposite side. Its own direct partner is orbit: the same full circle traced the other way. Both are one dexterity landing back on toe, and both score two points. It is the cleanest picture of what a dexterity is, one full loop around the leg, beginning and ending on the same stall, which is why the more advanced dexes read as pieces of that loop: a mirage is the loop cut short and sent across the body, a whirl the loop landed crossed instead of open.",
  },
  {
    slug:        'orbit',
    displayName: 'Orbit',
    adds:        '2',
    line:        "An orbit is Around the World traced the other way: the same complete circle of the bag around the leg, the same same-side toe-to-toe journey, run in reverse. If Around the World is the loop drawn clockwise, orbit is the loop drawn counter.",
    relates:     "Orbit is the direction mirror of Around the World, exactly as illusion is the mirror of mirage. The four of them (Around the World and orbit on the same side, mirage and illusion across the body) are the four two-point atoms, and they map out freestyle's two structural axes at once: which side the bag travels to, and which direction it circles. Together they complete a quiet square: two mirror pairs at the same difficulty, one same-side, one opposite-side, and orbit being its own trick rather than a backwards Around the World is the direction-is-structural idea the Mirror Law (home: Mirage) states in full.",
  },
  {
    slug:        'legover',
    displayName: 'Legover',
    adds:        '2',
    line:        "A legover sends the bag out toward the opposite side as the working leg swings over it, then brings it home to a toe stall on the same foot it left from. The leg crosses out and the bag returns to where it started: one dex out and back, landing on the near foot.",
    relates:     "Legover is one of the four two-point atoms that land on a toe. Its direct partner is the pickup: both carry the dex over to the opposite side but catch back on the same-side toe, and that same-side catch is what sets the pair apart from mirage and illusion, which land on the opposite toe. Between the two, legover is the outward one and pickup the inward one. It is also a workhorse base (the double-leg-over and its line of compounds are built on it), and the feature to feel is where it lands, on the near foot, not the direction it shares with illusion.",
  },
  {
    slug:        'mirage',
    displayName: 'Mirage',
    adds:        '2',
    line:        "From a stall, the foot swings the bag across to the opposite side of the body and back, catching it on a toe stall over there. Where Around the World loops the bag around one leg, a mirage sends it across to the far leg's side: a half-orbit, out and across, on the opposite side from where you are planted.",
    relates:     "Mirage has a mirror, and its name is illusion. The two are almost the same trick: same opposite-side territory, same toe-stall landing, same two points of difficulty. They differ in one thing only, the direction the dexterity travels. A mirage circles one way; an illusion circles the other. Hold that pairing in mind, because it is the first instance of a pattern that runs through the whole sport.",
    reveal:      "Reverse the direction of a dexterity and you do not get a variation of the trick, you get a different trick, with its own name, that players train separately and judges score on its own terms. Direction is not a flavor added to a move; it is part of what the move is. This is why the encyclopedia carries mirage and illusion as two rows and not one row with an arrow on it, and it is the reason the vocabulary is so much larger than it first appears: every dexterity has a reversed partner, and the partner is real. The sport is built, in part, out of pairs, and once you learn to look for the mirror of a trick, you have learned half the dictionary without meeting it yet.",
  },
  {
    slug:        'pickup',
    displayName: 'Pickup',
    adds:        '2',
    line:        "A pickup carries the bag inward toward the opposite side, then picks it back up on a toe stall on the same foot it started from: an inward reach that returns to the near foot rather than crossing all the way over.",
    relates:     "Pickup is legover's partner among the four toe-landing atoms: both send the dex to the opposite side but catch on the same-side toe, where mirage and illusion catch across the body. Pickup is the inward one, legover the outward one. It anchors its own small line of compounds (the double-pickup and kin), and the thing that makes it a pickup rather than a mirage is where it lands, the same foot, not the direction it travels.",
  },
  {
    slug:        'illusion',
    displayName: 'Illusion',
    adds:        '2',
    line:        "An illusion is a mirage run backwards. The foot takes the bag across to the opposite side and home to a toe stall, exactly as a mirage does, but the dexterity circles in the reverse direction. To a beginner the two look nearly identical; to the foot performing them, they are opposite motions.",
    relates:     "Illusion is one half of freestyle's most important pair. Its mirror is the mirage; the two share everything but their direction, and each has grown its own descendants, tricks built by adding operators to an illusion rather than to a mirage. Both land on toe, both score two. It is not a kind of mirage but mirage's reversal, and reversing a dex makes a new trick, the direction-is-structural idea that the Mirror Law (home: Mirage) states in full.",
  },
  {
    slug:        'butterfly',
    displayName: 'Butterfly',
    adds:        '3',
    line:        "A butterfly sends the bag on a dexterity that lands on a crossed clipper, with a distinctive outward-and-over shape that gives the trick its name: a wing-like sweep of the foot across the body. It is one of the most beloved intermediate tricks and the doorway to an entire style of play.",
    relates:     "Butterfly is one of the twelve core atoms, the small set of moves that cannot be broken down into anything simpler. That makes it a foundation rather than a combination. Its neighbors are the other cross-body-landing atoms, whirl and swirl; its descendants are the walking tricks, and this is where butterfly gets interesting.",
    reveal:      "The famous walking family is butterfly wearing operators. Ripwalk is a stepping butterfly; dimwalk is a pixie butterfly; the walk tricks that look like a distinct branch of the sport are, structurally, one atom plus one modifier apiece. This is the mirror image of the torque lesson: torque sounded fundamental and turned out to be a formula; butterfly is fundamental, and a whole visible family turns out to be built on top of it. Both facts point to the same underlying shape of the sport: a dozen atoms at the bottom, a handful of operators, and everything else composed. See butterfly as an atom, and the walking family stops being a list to memorize and becomes a single foundation with variations you can predict.",
  },
  {
    slug:        'osis',
    displayName: 'Osis',
    adds:        '3',
    line:        "An osis is one of the twelve core atoms: the body turns and the bag is caught cross-body on the clipper, a rotational move that lands behind the leg rather than in front of you. You will return to this one constantly, because an entire line of famous tricks is built directly on top of it.",
    relates:     "Osis is a rotational, cross-body atom, a cousin of whirl, swirl, and butterfly, which also land cross-body on the clipper. What makes it worth returning to is what gets built on it: add a single operator to an osis and you get a famous-sounding trick. Torque is miraging osis; blender is whirling osis. Both feel like fundamentals, but each is really an osis plus one operator (see Torque, and Name vs Structure).",
  },
  {
    slug:        'whirl',
    displayName: 'Whirl',
    adds:        '3',
    line:        "A whirl sends the bag on a dexterity that finishes not on an open toe stall but on a clipper, a cross-body catch behind the leg. It is the moment a beginner graduates from landing in front of themselves to landing across themselves, and it opens up an enormous branch of the sport. Three points: the dex, the cross-body traversal, and the catch.",
    relates:     "Whirl has a near-twin that trips up every newcomer: the swirl. They land the same way, on the same crossed clipper, and to the eye they rhyme. What separates them is the direction and shape of the dexterity that gets there: a whirl and a swirl are the same destination reached by mirrored routes. Whirl's other close relatives are the tricks it launches: torque, blender, and the long line of whirling compounds. Its deeper reading, as the clipper-world worked example of how a surface frame changes a dex's meaning, is deferred until the reverse-swirl surface-frame verification is settled; until then whirl is taught as a connective atom, not an insight home.",
  },
  {
    slug:        'swirl',
    displayName: 'Swirl',
    adds:        '3',
    line:        "A swirl reaches the same crossed clipper landing as a whirl, but the dexterity that carries the bag there travels on a mirrored, back-circling path. Same finish, mirrored route. It is the trick most often confused with the whirl, and telling them apart by eye is a genuine milestone in learning to read freestyle.",
    relates:     "Swirl is whirl's mirror, and like the whirl it heads its own line of compounds, the swirling tricks. The two sit side by side, the same crossed-clipper landing reached by mirrored routes. Its deeper reading, as the clipper-world companion to whirl in how a surface frame changes a dex's meaning, is deferred until the reverse-swirl surface-frame verification is settled; until then swirl is taught as a connective atom, not an insight home.",
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
