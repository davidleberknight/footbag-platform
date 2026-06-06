/**
 * Movement-physical educational prose for the twelve curator-authoritative
 * core trick atoms. Surfaces in the glossary §1 "Language of Freestyle"
 * onboarding band as a beginner-facing pedagogical layer.
 *
 * Authoring principle (curator decision): movement intuition + cultural /
 * foundational significance lead. Compositional / ontology-productivity
 * notes are explicitly secondary; they live in a small support line
 * below the lead, never above it. The atom cards must NOT read as
 * "X is the anchor of Y mirage tricks" first; they must read as "X is
 * physically Z."
 *
 * Two movement layers (kept distinct): `lead` describes what the movement
 * physically IS (descriptive); `movementIntuition` is the embodied
 * coaching cue, what the movement FEELS like to perform / the single
 * sensation that makes it work. The intuition layer bridges symbolic
 * notation and embodied understanding; it carries NO formula, ADD value,
 * or notation (those live in CORE_TRICK_SPEC + §8/§10).
 *
 * Existing reference data lives in:
 *   - CORE_TRICK_SPEC (src/content/freestyleLandingContent.ts):
 *     curator-locked atom registry with operationalNotation strings.
 *   - freestyle_tricks.description (DB): brief curator descriptions
 *     used as starting material for several cards below.
 *   - ATOMIC_FLAG_DECOMPOSITIONS (src/services/freestyleService.ts):
 *     curator-locked ADD decomposition strings.
 *
 * Cards consume this data via getGlossaryPage; the slug list mirrors
 * the screenshot SS3 ordering (stalls → orbit-class → dex atoms →
 * compound dex atoms) rather than CORE_TRICK_SPEC's structural
 * ordering. The pedagogical ordering reads simple-to-complex.
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
   * Movement-physical lead. Describes what the body physically does.
   * One or two sentences. MUST NOT lead with compositional / ontology /
   * "anchor of X family" framing.
   */
  lead: string;
  /**
   * Embodied coaching cue: what the movement FEELS like to perform, or the
   * single sensation that makes it work. Distinct from `lead` (descriptive).
   * One sentence. NO formula, ADD value, or notation.
   */
  movementIntuition: string;
  /**
   * Cultural / foundational note. Why this trick became part of the
   * language. One sentence.
   */
  foundationalNote: string;
  /**
   * Optional secondary compositional or family-role note. Rendered in
   * muted styling below the foundational note. Keep brief (one line).
   * Empty string suppresses the line.
   */
  familyRole: string;
}

/**
 * Twelve core trick atoms in the screenshot SS3's pedagogical ordering:
 * foundational stalls → orbit-class → dex atoms → compound dex atoms.
 * Slug list matches CORE_TRICK_SPEC exactly; ordering is reordered for
 * teaching purposes.
 */
export const CORE_ATOM_EDUCATIONAL: readonly CoreAtomEducationalCard[] = [
  {
    slug:        'toe-stall',
    displayName: 'Toe Stall',
    adds:        '1',
    lead:        'The bag balanced on the flat top of the foot, near the toes — the surface every freestyler learns first. Foot held still under the bag; the bag settles.',
    movementIntuition: 'The whole skill is stillness: kill every bit of sideways drift in the foot so the bag\'s energy dies the instant it lands.',
    foundationalNote: 'Every set in the language has to land somewhere; toe is the original somewhere.',
    familyRole:  'Terminal surface of mirage, legover, illusion, pickup, and many higher-ADD tricks.',
  },
  {
    slug:        'clipper-stall',
    displayName: 'Clipper Stall',
    adds:        '2',
    lead:        'An inside-of-foot stall with the foot tucked behind the supporting leg — the bag rests on the inside surface in a cross-body position. The cross-body position itself changes everything that can follow.',
    movementIntuition: 'A blind catch tucked behind your own hip; the stability comes from dropping the supporting knee to open a window for the sealing foot.',
    foundationalNote: 'Introduces the cross-body (xbody) axis that anchors many of freestyle\'s most recognizable shapes.',
    familyRole:  'Terminal surface of butterfly, whirl, swirl, osis, and most of their families.',
  },
  {
    slug:        'around-the-world',
    displayName: 'Around-the-World (ATW)',
    adds:        '2',
    lead:        'The leg traces a full circle around the bag in the air, then catches the bag back on the toe. The bag hangs while the leg orbits it.',
    movementIntuition: 'The leg chases its own launch: the circle has to happen at the bag\'s peak so the foot can lap it before gravity takes back over.',
    foundationalNote: 'One of the first compositional moves the sport recognized — proof that "leg circling bag" is a primitive, not a one-off trick.',
    familyRole:  'Foundational orbit-class atom; commonly abbreviated ATW.',
  },
  {
    slug:        'orbit',
    displayName: 'Orbit',
    adds:        '2',
    lead:        'The leg traces a full circle around the bag in the reverse direction from ATW — the bag still hangs while the leg orbits, but the path reverses.',
    movementIntuition: 'The same chase as ATW, reversed: slipping the foot over from the outside means turning the hip early so the knee clears the rising bag.',
    foundationalNote: 'Documents that direction is meaningful in the movement language: what looks like one trick is actually two.',
    familyRole:  'Reverse-direction counterpart to ATW.',
  },
  {
    slug:        'legover',
    displayName: 'Legover',
    adds:        '2',
    lead:        'The supporting leg swings up and over the bag in the air; the kicking leg recatches it on the same-side toe. The leg-over motion is what names the trick.',
    movementIntuition: 'A step-over in mid-air: the crossing leg clears the bag\'s vertical line while your weight shifts fully onto the landing foot.',
    foundationalNote: 'Introduces the leg-over body axis (vs hippy axis) as a compositional primitive — one of the language\'s few foundational body motions.',
    familyRole:  'Root of the legover family; eggbeater and flurry are atomic and barraging legovers.',
  },
  {
    slug:        'mirage',
    displayName: 'Mirage',
    adds:        '2',
    lead:        'A foundational dexterity movement: the supporting hip dips while the leg circles outside the bag, finishing in an opposite-side toe stall. The body tilt sells the trick — the silhouette is one of the most recognizable shapes in freestyle.',
    movementIntuition: 'Lead with the hip: dropping the supporting hip tilts the whole silhouette and lets the leg scoop cleanly around the outside of the bag.',
    foundationalNote: 'Cultural anchor of competitive freestyle; one of the earliest and most-shown shapes in the sport\'s history.',
    familyRole:  'Hippy in-to-out dex; root of a deep modifier family.',
  },
  {
    slug:        'pickup',
    displayName: 'Pickup',
    adds:        '2',
    lead:        'A dex caught from below — the foot scoops under the bag, the leg circles around it, and the bag recatches on the same-side toe. Where mirage and illusion drop the leg over a falling bag, pickup meets the bag underneath.',
    movementIntuition: 'You have to beat the bag upward: the leg loops faster than the set is climbing so it can lap the bag before the apex.',
    foundationalNote: 'Structurally distinct from mirage despite the same ADD — introduces the upward-catching dex axis.',
    familyRole:  'Root of the pickup family; foundation for spinning-pickup, paste, legeater.',
  },
  {
    slug:        'illusion',
    displayName: 'Illusion',
    adds:        '2',
    lead:        'Mirror of mirage: the leg circles from outside, back across, to the inside, recatching on the opposite toe. The bag\'s path is the same as in mirage; the body\'s path is the inverse.',
    movementIntuition: 'A sweeping cross-body crescent that cuts across the bag\'s falling line; the knee has to stay loose to keep the final stall settled.',
    foundationalNote: 'Pairs with mirage as the in-to-out / out-to-in symmetry pair — an early demonstration that direction carries meaning.',
    familyRole:  'Leg-over out-to-in dex; symmetry-partner of mirage.',
  },
  {
    slug:        'butterfly',
    displayName: 'Butterfly',
    adds:        '3',
    lead:        'A hippy body movement (out direction) carrying a cross-body dex: the foot circles wide, then lands on a clipper stall. Hip-tilt and cross-body catch combine into one of freestyle\'s most visually striking shapes.',
    movementIntuition: 'One continuous sweep: the circle and the cross-body landing merge into a single motion as the hip opens and the foot slides behind the plant leg.',
    foundationalNote: 'Foundational compound dex; the base from which several whole sub-families grow.',
    familyRole:  'Root of the butterfly family; base for ripwalk (≡ stepping butterfly), dimwalk, parkwalk.',
  },
  {
    slug:        'osis',
    displayName: 'Osis',
    adds:        '3',
    lead:        'A back-spin where the body rotates downward while the legs receive the bag on a clipper stall on the opposite side. The spin and the cross-body catch happen as a single motion.',
    movementIntuition: 'Blind faith in your set: you turn your back on the bag at its peak, trust where it is, and meet it by dropping your weight into the trailing hip.',
    foundationalNote: 'The curator\'s "golden reference" atom — the canonical example of three foundational ADD sources (spin, cross-body, stall) combining cleanly in one trick.',
    familyRole:  'Root of the osis family; base for blender, torque, and the whole 4-ADD-and-above ecology.',
  },
  {
    slug:        'whirl',
    displayName: 'Whirl',
    adds:        '3',
    lead:        'A rotational dex with the leg circling in toward the body and finishing on a clipper stall. The body turns, the leg sweeps cross-body, and the bag lands on the inside of the foot tucked behind the supporting leg.',
    movementIntuition: 'A quick wrap-around: the leg whips outward around the bag, then snaps back inward to slide behind the opposite calf.',
    foundationalNote: 'The most documented rotational-dex family in freestyle history — nearly every body and set modifier in the language has a "whirl" version.',
    familyRole:  'Rotational base; modifier weights count rotationally on whirl.',
  },
  {
    slug:        'swirl',
    displayName: 'Swirl',
    adds:        '3',
    lead:        'Whirl\'s reverse-direction counterpart — the leg circles cross-body in the opposite direction, ending on a clipper stall. The same body shape, the inverse rotation.',
    movementIntuition: 'An unspooling feel: because the body starts slightly crossed, it unwinds through the circle before locking back down into the clipper.',
    foundationalNote: 'Pairs with whirl to document reverse-direction as a foundational axis; teaching this pair shows how symmetry threads through the whole language.',
    familyRole:  'Reverse rotational base; whirling-swirl is a 4-ADD whirl→swirl composition.',
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
