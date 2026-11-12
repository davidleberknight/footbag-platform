/**
 * freestyleFamilyOverrides.ts
 *
 * The public family each trick below is filed under, where it differs from the
 * structural `trick_family` the row carries. Seeded into
 * `freestyle_tricks.family_override`; `trick_family` itself is left as it is,
 * because the family filter, related tricks and family notes read it.
 *
 * Every target is a slug on the public family list. A trick belongs to the
 * nearest meaningful family anchor, not the oldest ancestor, so each entry is a
 * one-way redirect from the label the row carried to the family that owns it.
 */

export const FAMILY_OVERRIDES: ReadonlyMap<string, string> = new Map([
  // Reverse Whirl: these share a conserved terminal mechanic (front whirl dex to
  // an opposite clipper) that the Whirl family's own invariant does not, so they
  // are siblings of Whirl rather than descendants.
  ['hatchet',   'rev_whirl'],
  ['mullet',    'rev_whirl'],

  // High plains drifter follows drifter into the drifter family, because
  // clipper stall is not a public family.
  ['high_plains_drifter', 'drifter'],

  // Each row below sits in the lineage of a branch family (torque, blender,
  // double leg over, eggbeater) but carried its root's label (osis, legover), so
  // it browsed under the root and never appeared on its own branch page. Branch
  // families stay contained in their root for display, so a row still reaches
  // the root section as a branch member.

  // Torque (carried osis)
  ['torque', 'torque'],
  ['symposium_torque', 'torque'],
  ['forque', 'torque'],
  ['stepping_paradox_torque', 'torque'],
  ['spinning_symposium_torque', 'torque'],
  ['spinning_miraging_symposium_torque', 'torque'],
  ['fairy_gyro_torque', 'torque'],
  ['fairy_torque', 'torque'],
  ['reverse_swirling_paradox_torque', 'torque'],
  ['reverse_torque', 'torque'],
  ['toe_spinning_torque', 'torque'],
  ['atomic_ducking_torque', 'torque'],
  ['nuclear_torque', 'torque'],

  // Blender (carried osis)
  ['blender', 'blender'],
  ['fender', 'blender'],
  ['fender_bender', 'blender'],
  ['stepping_blender', 'blender'],
  ['reverse_blender', 'blender'],
  ['clipper_ducking_blender', 'blender'],
  ['reverse_swirling_blender', 'blender'],
  ['atomic_blender', 'blender'],

  // Double Leg Over (carried legover; stepping ducking smog was a route-out)
  ['double_leg_over', 'double_leg_over'],
  ['nova', 'double_leg_over'],
  ['gyro_double_leg_over', 'double_leg_over'],
  ['oh_wheely', 'double_leg_over'],
  ['nuclear_double_leg_over', 'double_leg_over'],
  ['stepping_ducking_smog', 'double_leg_over'],

  // Eggbeater (carried legover; stepping ducking pigbeater was a route-out)
  ['eggbeater', 'eggbeater'],
  ['pigbeater', 'eggbeater'],
  ['mantis', 'eggbeater'],
  ['symposium_eggbeater', 'eggbeater'],
  ['stepping_eggbeater', 'eggbeater'],
  ['fairy_eggbeater', 'eggbeater'],
  ['pixie_eggbeater', 'eggbeater'],
  ['pandemonium', 'eggbeater'],
  ['bladerunner', 'eggbeater'],
  ['chainsaw_massacre', 'eggbeater'],
  ['stepping_ducking_symposium_eggbeater', 'eggbeater'],
  ['spinning_eggbeater', 'eggbeater'],
  ['barraging_eggbeater', 'eggbeater'],
  ['stepping_ducking_pigbeater', 'eggbeater'],

  // Flurry (the anchor carried its legover root; the branch members already
  // carry the flurry label, so only the anchor and toe flurry browsed under
  // legover instead of their own family).
  ['flurry', 'flurry'],
  ['toe_flurry', 'flurry'],

  // Flail (the anchor carried its illusion root; every flail descendant already
  // carries the flail label).
  ['flail', 'flail'],

  // Butterfly Swirl (the anchor carried its swirl root; every butterfly swirl
  // descendant already carries the label).
  ['butterfly_swirl', 'butterfly_swirl'],

  // Drifter (the drifter family lost its anchor and several members to the
  // retired clipper stall label they still carried; these return them to the
  // drifter family they descend from).
  ['drifter', 'drifter'],
  ['clipper_ducking_drifter', 'drifter'],
  ['diving_drifter', 'drifter'],
  ['fairy_drifter', 'drifter'],
  ['fume', 'drifter'],
  ['lotus', 'drifter'],
  ['nuclear_drifter', 'drifter'],
  ['quantum_drifter', 'drifter'],
  ['stepping_ducking_drifter', 'drifter'],
]);
