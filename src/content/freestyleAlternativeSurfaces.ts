/**
 * Alternative-surfaces content module for the Movement System view
 * (rendered as a compact subsection AFTER the 4 movement-system axes).
 *
 * Per the 2026-05-24 follow-up decision after the nonstandard-topology
 * audit: alternative surfaces become a compact subsection of
 * /freestyle/tricks?view=movement-system rather than a standalone
 * `?view=alternative-surfaces` browse toggle. The data is sparse-
 * categorical (~18 rows across 5 sub-groups); a full browse mode would
 * waste the toggle-bar slot. A compact educational subsection is the
 * right surface — it preserves browse simplicity while making the
 * non-standard topology legible.
 *
 * Doctrine framing: NOT "weird tricks" or "miscellaneous". The
 * alternative-surface tricks are alternative *control systems* —
 * different balance and movement-topology choices than the toe/clipper-
 * dominant freestyle default. The subsection emphasises movement
 * topology and balance/control mechanics, not rarity or novelty.
 *
 * The slug references below MUST exist as `is_active=1` canonical rows
 * in `freestyle_tricks` for their detail-page links to resolve. The
 * service-layer shaping filters out missing slugs gracefully.
 *
 * Curator-paced content module — edit here when adding new
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
    'Most freestyle tricks revolve around toe and clipper surfaces. ' +
    'These tricks explore alternative surfaces, body catches, and ' +
    'non-standard balance systems. Each group below is a different ' +
    'balance/control regime, not a novelty bucket.',
  groups: [
    {
      slug: 'sole-and-heel',
      label: 'Sole and heel',
      note:
        'Foot-edge surfaces. The bag rests on the sole (bottom) or heel (back) of ' +
        'the foot instead of the top. Cross-body sole stall adds an [XBD] inversion.',
      tricks: [
        'sole-stall',
        'sole-kick',
        'cross-body-sole-stall',
        'heel-stall',
      ],
    },
    {
      slug: 'inside-outside',
      label: 'Inside and outside',
      note:
        'Side-of-foot stall surfaces. Foundational beyond toe and clipper; ' +
        'most compound tricks visit these surfaces in transit but rarely terminate on them.',
      tricks: [
        'inside-stall',
        'outside-stall',
      ],
    },
    {
      slug: 'head-neck-shoulder',
      label: 'Head, neck, and shoulder',
      note:
        'Upper-body stalls. The bag rests on a non-foot surface; balance shifts ' +
        'from leg control to torso and head control.',
      tricks: [
        'head-stall',
        'neck-stall',
        'shoulder-stall',
        'forehead-stall',
      ],
    },
    {
      slug: 'cloud-and-knee',
      label: 'Cloud and knee',
      note:
        'Leg-surface stalls beyond the foot. Cloud is the back of the calf; ' +
        'knee is exactly what it sounds like. Both demand precise leg-angle control.',
      tricks: [
        'cloud-stall',
        'cloud-kick',
        'knee-stall',
      ],
    },
    {
      slug: 'flying-variants',
      label: 'Flying and airborne variants',
      note:
        'The body becomes airborne, either entering the trick from a jump or ' +
        'leaving the ground during the trick. The bag traces a longer path while ' +
        'the body cycles around it.',
      tricks: [
        'flying-clipper',
        'flying-inside',
        'flying-outside',
        'dragonfly-kick',
        'butterfly-kick',
      ],
    },
  ],
};
