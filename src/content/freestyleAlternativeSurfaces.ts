/**
 * Alternative-surfaces content module for the Movement System view,
 * rendered as a subsection beneath the movement-system axes.
 *
 * The page has one organizing principle: alternative terminal surfaces
 * and balance systems. Every group answers the same question — what
 * surface is the bag controlled on — for the surfaces beyond the
 * toe/clipper-dominant freestyle default. Airborne and body-movement
 * concepts (flying and the like) answer a different question (how the
 * body moves) and belong with the modifier/operator views, not here.
 *
 * The framing is alternative *control systems*, not "weird" or
 * "miscellaneous" tricks: each group is a different balance and
 * movement-topology choice.
 *
 * The slug references below MUST exist as `is_active=1` canonical rows
 * in `freestyle_tricks` for their detail-page links to resolve. The
 * service-layer shaping filters out missing slugs gracefully.
 *
 * Curator-paced content module: edit here when adding new
 * alternative-surface canonical rows. Order within groups is
 * pedagogical (foundational stall first, kicks and compounds after).
 */

export interface AlternativeSurfaceGroup {
  readonly slug: string;
  readonly label: string;
  readonly note: string; // short framing line (~100 chars)
  readonly tricks: readonly string[]; // canonical-row slugs
}

export interface AlternativeSurfacesContent {
  readonly intro: string;
  readonly groups: readonly AlternativeSurfaceGroup[];
}

export const ALTERNATIVE_SURFACES: AlternativeSurfacesContent = {
  intro:
    'Most freestyle controls the bag on the toe or clipper. These tricks ' +
    'use other surfaces. Each group is a different place the bag rests, ' +
    'and a different balance system to hold it there.',
  groups: [
    {
      slug: 'sole-and-heel',
      label: 'Sole and heel',
      note:
        'The bag rests on the sole or heel of the foot instead of the top.',
      tricks: [
        'sole_stall',
        'sole_kick',
        'cross_body_sole_stall',
        'heel_stall',
        'around_the_world_heel',
        'double_around_the_world_heel',
      ],
    },
    {
      slug: 'inside-outside',
      label: 'Inside and outside',
      note:
        'Side-of-foot surfaces. Most compounds pass over them in transit but rarely stall there.',
      tricks: [
        'inside_stall',
        'outside_stall',
      ],
    },
    {
      slug: 'head-neck-shoulder',
      label: 'Head, neck, and shoulder',
      note:
        'Upper-body stalls. Balance shifts from the leg to the torso and head.',
      tricks: [
        'head_stall',
        'neck_stall',
        'shoulder_stall',
        'forehead_stall',
      ],
    },
    {
      slug: 'cloud-and-knee',
      label: 'Cloud and knee',
      note:
        'Leg surfaces beyond the foot (cloud is the back of the calf). Both need precise leg-angle control.',
      tricks: [
        'cloud_stall',
        'cloud_kick',
        'knee_stall',
      ],
    },
  ],
};
