/**
 * freestyleModifierClusters.ts
 * ============================
 *
 * The groups of the Trick Dictionary "By modifier" browse, in display order: each
 * group's key, heading and one-line framing. Page prose, kept in code. Which
 * modifiers a group lists, their order and whether each gets a full section of its
 * own are the modifier's browse group, browse order and full-section flag in the
 * modifier registry, set in the modifier editor; a modifier in no group falls
 * through to the neutral `other` group, so no vocabulary is dropped.
 *
 * The group axis is deliberately broad ("what compositional operator, set, or
 * modifier appears in the trick?"), not an "entry" taxonomy. The set-uptime group
 * also decides where a launch set's tricks are listed: in the dictionary's set
 * view rather than the modifier view.
 */

export interface ModifierCluster {
  /** Stable key; drives the `#cluster-{key}` section anchor and menu link. */
  key:   string;
  label: string;
  /** One-line lens framing for the group heading. */
  blurb: string;
}

/** The launch-set group, whose modifiers are listed in the set view. */
export const SET_UPTIME_CLUSTER = 'set-uptime';

/** The catch-all group for modifiers placed in no other group. */
export const OTHER_CLUSTER = 'other';

export const MODIFIER_CLUSTERS: readonly ModifierCluster[] = [
  { key: SET_UPTIME_CLUSTER,      label: 'Set / uptime systems',                        blurb: 'How the trick is launched or generated.' },
  { key: 'rotational-body',       label: 'Rotational / body operators',                 blurb: 'Whole-body rotation carried through the trick.' },
  { key: 'no-plant-timing',       label: 'No-plant / timing systems',                   blurb: 'Plant, side-switch, and timing discipline.' },
  { key: 'dexterity-structural',  label: 'Dexterity / body-path / structural operators', blurb: 'Added dexes and body-path transformations.' },
  { key: 'surface-specialized',   label: 'Surface / specialized / experimental',        blurb: 'Unusual catch surfaces and rarely-seen systems.' },
  { key: OTHER_CLUSTER,           label: 'Other tracked operators',                     blurb: 'Tracked modifiers not yet assigned to a cluster.' },
];

/** Whether a key names one of the browse groups a modifier can be placed in. */
export function isModifierCluster(key: string): boolean {
  return key !== OTHER_CLUSTER && MODIFIER_CLUSTERS.some((c) => c.key === key);
}
