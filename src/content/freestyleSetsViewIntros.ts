/**
 * One-line set explanations for the /freestyle/tricks?view=sets browse mode.
 *
 * Two cohorts per the 2026-05-24 governance/polish slice:
 *   - Core sets: clean +1 set primitives that initiate a trick (pixie, fairy,
 *     atomic, quantum). Each set's uptime motion is analogous to a downtime
 *     trick (pixie ≈ ATW-shape, fairy ≈ orbit-shape, etc.) per existing
 *     curator framing on /freestyle/compositional-sets.
 *   - Secondary / composite systems: compound or set-context modifiers
 *     (nuclear = paradox + atomic; stepping = set-foot relocation; surging
 *     = set transition). Structurally heavier than core sets.
 *
 * NOT an ontology rewrite. Just routing existing curator-authored set
 * descriptions into the new browse cohorts. No curator data invented; if
 * a set has no clear analogy, the intro stays terse.
 *
 * Order within each cohort is pedagogical (most-foundational first), not
 * alphabetical.
 */

export interface SetIntro {
  readonly modifierSlug: string;
  readonly intro:        string;
}

export const CORE_SETS_INTROS: readonly SetIntro[] = [
  { modifierSlug: 'pixie',   intro: 'Same-side-in dex pre-base. Uptime motion echoes the ATW shape.' },
  { modifierSlug: 'fairy',   intro: 'Same-side-out dex pre-base. Uptime motion echoes the orbit shape.' },
  { modifierSlug: 'atomic',  intro: 'Opp-side-out dex pre-base. Uptime motion echoes the pickup crossing.' },
  { modifierSlug: 'quantum', intro: 'Compressed pre-base motion in the atomic family. Often reads as a shorter-interval atomic.' },
];

export const SECONDARY_SETS_INTROS: readonly SetIntro[] = [
  { modifierSlug: 'nuclear',  intro: 'Composite set: paradox-plus-atomic. Contributes +2 ADD (paradox\'s +1 plus atomic\'s +1).' },
  { modifierSlug: 'stepping', intro: 'Set-foot relocation during the base trick. Classified as body modifier but routes through the set layer.' },
  { modifierSlug: 'surging',  intro: 'Set transition pattern. Curator-pending classification per the surging/compound-set workgroup.' },
];
