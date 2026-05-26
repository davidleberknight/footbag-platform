/**
 * Curated movement-intuition prose for flagship trick-detail pages.
 *
 * Each entry pairs a canonical trick slug with a short, source-attributed
 * description of the body mechanics, timing, and felt experience of the
 * move. Renders as a "Movement intuition" section on the trick-detail
 * page, between "About" (which carries the compositional reading) and
 * "Notation" (which carries the symbolic structure).
 *
 * Pedagogical purpose: bridge the gap between "what the trick IS" and
 * "what the trick FEELS like." Notation and ontology describe the
 * structure; this layer describes the movement.
 *
 * AUTHORSHIP DISCIPLINE (locked):
 *   - All prose is curator-curated, never auto-generated.
 *   - When the source is a published reference (fb.org /newmoves,
 *     Holden compilation, PassBack), the attribution names it
 *     explicitly. Per the NR-1B precedent (pendulum/squeeze
 *     descriptions cited verbatim from fb.org), short verbatim
 *     citation is acceptable when the source's language is the
 *     pedagogically best framing.
 *   - When the prose is adapted or compressed, the attribution says
 *     "Adapted from <source>" rather than implying authorial copying.
 *   - New entries land one at a time, by curator decision; no bulk
 *     ingestion. The map starts with five core-atom flagships
 *     (mirage, whirl, butterfly, osis, illusion) and one compound
 *     flagship (mobius). Future expansion is gated by curator review.
 *
 * LAYER SEPARATION (forever-rule):
 *   This module is editorial PROSE only. It does NOT change:
 *     - canonical JOB notation
 *     - operational notation
 *     - ADD accounting
 *     - any ontology field
 *     - any compositional decomposition
 *   It is an additional pedagogical layer rendered between the
 *   compositional reading and the symbolic notation.
 *
 * Cross-references:
 *   - reference_fborg_newmoves_list (project memory) — the precedent
 *     for verbatim fb.org citation.
 *   - exploration/trick-detail-enrichment-audit-2026-05-23.md — the
 *     audit that motivated this module.
 */

export interface TrickIntuitionEntry {
  /** Canonical trick slug. */
  slug: string;
  /**
   * The movement-intuition prose. One paragraph; describes body
   * mechanics, timing, and felt experience. Avoids notation and
   * ontology jargon.
   */
  prose: string;
  /**
   * Source attribution line. Rendered below the prose. Names the
   * publication explicitly; uses "Per <source>" for verbatim
   * citation, "Adapted from <source>" for compressed or rewritten
   * prose.
   */
  attribution: string;
}

export const TRICK_INTUITION_ENTRIES: readonly TrickIntuitionEntry[] = [
  {
    slug: 'toe-stall',
    prose:
      'The foundational delay surface for upright freestyle. The bag rests on top of the foot just behind the toes, with the foot dorsiflexed (top of foot lifted, toes raised) so the bag sits in the small cup formed where the laces meet the ankle. Balance comes from the supporting leg with a slight forward lean; the catching foot holds the bag still for a beat before the next move. Most upright tricks open from a toe set or terminate on a toe delay.',
    attribution: 'Curator description -- foundational 1-ADD delay surface.',
  },
  {
    slug: 'mirage',
    prose:
      'From a toe delay or a clipper delay, set the bag straight up, and swing the support leg from in to out over the footbag, catching it with the setting leg on a toe delay. The set from a clipper delay is easier once you know how to do a clipper. With a toe-set mirage, the support leg has to first swing under, then back over the bag.',
    attribution: 'Per fb.org /newmoves description (2-ADD canonical reference).',
  },
  {
    slug: 'whirl',
    prose:
      'From either a clipper or a toe delay, set the footbag up — then with the support leg circle the footbag from the front up and over the footbag. Hop off the original setting leg as you finish the dexterity and catch the bag on a clipper delay. It is easiest to point your toes down as you circle the bag because this makes it faster and less likely to snag the bag as you circle it.',
    attribution: 'Per fb.org /newmoves description (3-ADD canonical reference).',
  },
  {
    slug: 'butterfly',
    prose:
      'A leg over straight to a clipper delay. From a right toe set the footbag up and slightly towards yourself. Hop off your right leg and pass your left leg over the footbag, then delay the footbag with the inside surface of the right foot in a cross-body position — i.e. a clipper delay.',
    attribution: 'Per fb.org /newmoves description (3-ADD canonical reference).',
  },
  {
    slug: 'osis',
    prose:
      'Spin into a clipper delay. It is easiest to set this from a clipper stall on the other foot or from a toe delay with the other foot straight in front of you (not behind you). From a right toe set, set straight in front of you, about waist high, and turn to the left so the footbag passes behind your back. Keep your head down with your eyes on the footbag until just before it lands on the inside surface of your right foot. Then turn quickly to the left and catch the footbag on a clipper delay.',
    attribution: 'Per fb.org /newmoves description (3-ADD canonical reference).',
  },
  {
    slug: 'illusion',
    prose:
      'From a toe or a clipper delay, set the bag straight up about waist high. As you plant your set leg, bring your support leg up and over the bag from out to in — a reverse miraging motion. Plant the dexterity leg and catch the bag on the toe of the setting foot.',
    attribution: 'Per fb.org /newmoves description (2-ADD canonical reference).',
  },
  {
    slug: 'mobius',
    prose:
      'From a right clipper set, turn so the bag passes behind your back (clockwise), then without planting your right foot, spin into a right-leg mirage and catch the footbag on a left Osis. The structural reading is "gyro torque" — the spinning body modifier carries through a miraging-osis terminal.',
    attribution: 'Per fb.org /newmoves description (5-ADD canonical reference); compositional reading per pt11.',
  },
  {
    slug: 'paradox-mirage',
    prose:
      'Paradox-mirage feels mechanically heavier than ordinary mirage. The setting foot stays planted longer; the hip pivots cross-body during the dex; the bag tracks across more of the body width before recatching. The rhythm is one beat longer than plain mirage — the body must complete a directional shift before the catching foot arrives.',
    attribution: 'Curator description — 3-ADD compound; topology reading per the L2 layer.',
  },
  {
    slug: 'blur',
    prose:
      'Blur stretches a paradox-mirage across two complete dex moments instead of one. The first dex steps the bag laterally on the inside; the second carries the bag through the paradox hip-pivot to the catch. The rhythm runs noticeably longer than paradox-mirage — two distinct beats of dex motion before the bag returns to a toe delay. Balance and forward momentum have to carry through the multi-step pattern without the body settling between dexes.',
    attribution: 'Curator description — 4-ADD compound (Stepping Paradox Mirage).',
  },
  {
    slug: 'fury',
    prose:
      'Fury extends the paradox-mirage chassis across a furious multi-dex sequence — the body works through a longer string of dex moments than blur, with the paradox hip-pivot threading the back end of the pattern. The rhythm runs longer still; momentum has to sustain through every transition without the body settling. The catch arrives well after the original toe set has left the bag.',
    attribution: 'Curator description — 5-ADD compound (Furious Paradox Mirage).',
  },
  {
    slug: 'sumo',
    prose:
      'Sumo stretches mirage into a wider-armed nuclear stance. The dex direction shifts to outside-then-inside instead of plain in-to-out, and the body posture broadens through the dex cycle. The rhythm is heavier than ordinary mirage — the bag tracks a wider cross-body arc, and the catch arrives one beat later than the 2-ADD mirage chassis would suggest. The nuclear modifier slows the entire transition into a longer, weightier movement.',
    attribution: 'Curator description — 5-ADD compound; nuclear mirage with implicit X-Dex escalation.',
  },
  {
    slug: 'drifter',
    prose:
      "Drifter holds the same in-to-out dex pattern as mirage but lands cross-body on a clipper stall instead of returning to a toe delay. The support leg swings inside-then-outside under-and-over the bag; the catch arrives on the inside surface of the opposite foot rather than the toes. The body finishes facing more cross-body than after a mirage — weight settles onto the clipper terminal rather than rebalancing through a toe delay. The rhythm is mirage-paced through the dex, then resolves into the wider clipper landing.",
    attribution: 'Curator description — 3-ADD compound; mirage-dex with terminal shift to clipper stall.',
  },
  {
    slug: 'atom-smasher',
    prose:
      "Atom-smasher feels like a mirage with the dex direction reversed and stretched. The support leg swings outside-then-inside rather than inside-then-outside — the X-Dex character. The body works through a wider arc during the dex, and the catch arrives on the opposite toe after the bag passes through a broader cross-body trajectory than ordinary mirage. The rhythm holds the mirage cadence but feels weightier through the wider dex.",
    attribution: 'Curator description — 4-ADD compound (Atomic Mirage); explicit X-Dex sequence.',
  },
  {
    slug: 'barrage',
    prose:
      "Barrage feels like two complete same-side inside dexes stacked back-to-back, ending on a toe delay. The support leg swings inside-and-back on the first dex, settles briefly, then swings inside-and-back again on the second — a doubled same-side pattern that builds momentum through repetition rather than direction change. The rhythm is a paired cadence; balance has to hold steady across two beats of identical motion before the catch arrives.",
    attribution: 'Curator description — 3-ADD anchor (standalone family, distinct from the "barraging" modifier).',
  },
  {
    slug: 'blurriest',
    prose:
      "Blurriest stretches a barfly into the deepest blurry-character extension on the chassis. The bag passes through multiple dex moments — inside, then outside, then outside again — before arriving on a clipper terminal. The rhythm is among the longest in the blurry family: three complete dex moments stacked, with the body working continuously through directional shifts. Momentum and balance both have to sustain through the stack without the body settling between dexes.",
    attribution: 'Curator description — 5-ADD compound (Blurry Barfly); maximal-blurry-character superlative.',
  },
  {
    slug: 'blender',
    prose:
      "Blender stitches a whirl's rotational dex into an osis's spin-into-clipper terminal. The body works through whirl's cross-body rotation on the opening dex, then continues into osis's back-spin before settling on the cross-body clipper. The rhythm reads as two canonical movements compressed into a single transition — whirl's rotational beat at the start, osis's spin-and-catch at the end. Momentum has to carry continuously through the rotation; any pause between the dex and the spin breaks the compound.",
    attribution: 'Curator description — 4-ADD compound (whirl-osis); compound-of-canonicals exemplar.',
  },
  {
    slug: 'surreal',
    prose:
      "Surreal stacks a surging rotational system onto a paradox-whirl, producing one of the deepest rotational compounds in the language. The body works through a back-spin before the first dex, threads a paradox hip-pivot through a second whirl-style dex, and settles on a cross-body clipper. The rhythm is the longest in the rotational-topology lineage — three distinct movement events stacked, with the body maintaining rotational continuity throughout. Momentum and balance both have to sustain through a stack that spans rotation, paradox topology, and dex sequencing.",
    attribution: 'Curator description — 6-ADD compound (Surging Paradox Whirl); top of the rotational-topology ladder.',
  },
  {
    slug: 'phoenix',
    prose:
      "Phoenix layers two distinct modifiers onto a butterfly — a pixie set treatment opening the compound and a ducking body modifier threading through the back end. The body opens with a tight pixie set, works through the first inside dex, drops into a duck, then sweeps outward into the closing dex before catching on the cross-body clipper. The rhythm is among the busiest in the 5-ADD bucket — four distinct movement events stacked into one transition, with the body changing posture between the duck and the outward dex.",
    attribution: 'Curator description — 5-ADD compound; pixie-set entry + ducking body modifier on butterfly.',
  },
  {
    slug: 'torque',
    prose:
      "Torque feels like a mirage's dex pattern stitched into an osis's spin-and-clipper terminal. The body works through a mirage-style inside-then-outside swing before the support leg lifts into the osis spin; the catch arrives on the cross-body clipper. The rhythm carries mirage's directional dex at the start and resolves into osis's body-spin terminal at the end — a compound-of-canonicals compressed into a single transition. Momentum has to carry through both the dex and the spin without the body settling between them.",
    attribution: 'Curator description — 4-ADD compound (Miraging Osis); compound-of-canonicals.',
  },
  {
    slug: 'ripwalk',
    prose:
      "Ripwalk extends a butterfly's leg-over into a stepping multi-dex sequence. The body works through a first stepping dex outward, then the leg-over carries through to the cross-body clipper terminal closing the compound. The rhythm runs longer than butterfly — two distinct dex moments instead of one, with the body working through directional shifts before the catch arrives on the clipper. Momentum has to carry through the stepping pattern without the body settling between dexes.",
    attribution: 'Curator description — 4-ADD compound (Stepping Butterfly); shred-vocabulary root.',
  },
  {
    slug: 'food-processor',
    prose:
      "Food-processor stitches a blurry-stepping pattern onto a blender — the compound-of-canonicals chassis already combining whirl and osis. The body works through a first stepping dex, threads paradox topology into a whirl-style second dex, settles through an osis back-spin, then catches on the cross-body clipper. The rhythm is among the longest in the dictionary — four distinct movement events stacked into one transition, with rotational character carrying through almost the entire sequence.",
    attribution: 'Curator description — 6-ADD compound (Blurry Blender); blurry-naming on a compound-of-canonicals chassis.',
  },
  {
    slug: 'ripstein',
    prose:
      "Ripstein stacks two same-side back-swirl dexes in sequence, ending on a cross-body clipper. The body works through two reverse-rotational dex moments — back, back — without alternating direction or switching the leading leg. The rhythm is a paired cadence reminiscent of barrage but with rotational rather than linear dexes; the body has to sustain the back-rotational character across both beats before the catch arrives on the cross-body clipper.",
    attribution: 'Curator description — 4-ADD compound; doubled same-side back-swirl reading.',
  },
  {
    slug: 'eclipse',
    prose:
      "Set the bag from a toe delay, then jump off the support leg as the bag rises; in mid-air, the inside of the opposite foot catches the bag briefly for a held delay, then swings outward into an outward dex while still airborne, with the landing arriving as the dex carries through. The defining feel is the jump-and-hover: eclipse takes the held-delay leg-over chassis of hop-over — where the body jumps over a grounded held delay — and lifts the entire structure off the ground, so both the inside-delay and the outward dex happen in flight rather than over a planted foot. The jump itself counts as a body-bearing scored element, which is why eclipse reads as 3 ADD where its grounded hop-over cousin reads as 2.",
    attribution: 'Adapted from fb.org Pixie Eclipse JOB form + Red pt1 jump-bearing ruling (airborne hop-over topology).',
  },
];

/** Slug-keyed lookup helper. Returns null when no entry is curated. */
export function getTrickIntuition(slug: string): TrickIntuitionEntry | null {
  return TRICK_INTUITION_ENTRIES.find(e => e.slug === slug) ?? null;
}
