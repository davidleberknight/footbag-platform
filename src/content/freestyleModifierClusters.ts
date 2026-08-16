/**
 * freestyleModifierClusters.ts
 * ============================
 *
 * Curated higher-level CLUSTERS for the Trick Dictionary "By modifier" browse
 * surface. Organizational UX only: groups the flat per-modifier list into a
 * small set of conceptual clusters so the landing menu and the `?view=modifier`
 * page offer progressive disclosure (cluster -> individual modifiers) instead
 * of a flat, heterogeneous list.
 *
 * This is NOT ontology deletion and NOT a loss of vocabulary:
 *   - every individual modifier still renders (under its cluster), and its
 *     detail/section is preserved;
 *   - clustering is a reversible TypeScript content map (edit one file), no
 *     schema/DB change, no change to canonical trick membership or modifier
 *     classification.
 *
 * The cluster axis is deliberately broad ("what compositional operator, set,
 * or modifier appears in the trick?"), NOT an "entry" taxonomy. The
 * SET / UPTIME SYSTEMS cluster is the seam along which a future first-class
 * "By set system" browse surface can be split out cleanly later: it already
 * isolates the set/uptime modifiers behind one stable cluster key.
 *
 * Grouping follows the real data + curator direction; a modifier with no clear
 * home falls through to the neutral `other` cluster (never dropped). Clusters
 * with zero active members are not rendered (see the service).
 */

export interface ModifierCluster {
  /** Stable key; drives the `#cluster-{key}` section anchor + menu link. */
  key:   string;
  label: string;
  /** One-line lens framing for the cluster heading. */
  blurb: string;
  /** Modifier slugs assigned to this cluster (membership is curator-paced). */
  modifiers: readonly string[];
}

/**
 * Clusters in display order. The trailing `other` cluster is the neutral
 * catch-all; the service appends any active modifier not listed above into it
 * so no vocabulary is ever lost when a new modifier appears in the data.
 */
export const MODIFIER_CLUSTERS: readonly ModifierCluster[] = [
  {
    key:   'set-uptime',
    label: 'Set / uptime systems',
    blurb: 'How the trick is launched or generated.',
    modifiers: ['pixie', 'fairy', 'stepping', 'atomic', 'quantum', 'nuclear', 'sailing'],
  },
  {
    key:   'rotational-body',
    label: 'Rotational / body operators',
    blurb: 'Whole-body rotation carried through the trick.',
    modifiers: ['spinning', 'gyro', 'inspinning', 'whirling', 'swirling', 'twisting'],
  },
  {
    key:   'no-plant-timing',
    label: 'No-plant / timing systems',
    blurb: 'Plant, side-switch, and timing discipline.',
    modifiers: ['symposium', 'paradox', 'blurry', 'furious', 'frantic', 'pogo'],
  },
  {
    key:   'dexterity-structural',
    label: 'Dexterity / body-path / structural operators',
    blurb: 'Added dexes and body-path transformations.',
    // Miraging and barraging are deliberately absent: miraging is descriptive
    // standalone-movement language and barraging is a legacy name for the
    // Furious set, so neither may sit in an active-operator cluster.
    // Zulu sits here with its duck/dive/weave cohort (the head-and-body-passage
    // family on the operator board).
    modifiers: ['terraging', 'tapping', 'ducking', 'diving', 'weaving', 'zulu', 'flailing'],
  },
  {
    key:   'surface-specialized',
    label: 'Surface / specialized / experimental',
    blurb: 'Unusual catch surfaces and rarely-seen systems.',
    modifiers: ['rooting', 'blistering', 'shattered', 'finchy', 'zoid'],
  },
  {
    key:   'other',
    label: 'Other tracked operators',
    blurb: 'Tracked modifiers not yet assigned to a cluster.',
    modifiers: [],
  },
];

/**
 * Curated first-class roster for the By-modifier browse (explicit admission,
 * mirroring the first-class family roster: a modifier gets a full browse
 * section because it has been ruled a useful, recognizable browse grouping,
 * never because its live count crossed a number). Everything else that carries
 * links renders in the compact "Other tracked groups" band. Whirling and
 * swirling are deliberately absent because they are ruled legitimate sets
 * whose taxonomic home is the Set Encyclopedia: the By-modifier roster never
 * promotes them, their tracked-group rendering does not reclassify them, and
 * whether they join the curated By Set roster is a separate browse-curation
 * decision.
 */
export const FIRST_CLASS_BROWSE_MODIFIERS: ReadonlySet<string> = new Set([
  'symposium', 'ducking', 'spinning', 'paradox', 'gyro',
  'diving', 'weaving', 'zulu', 'tapping', 'inspinning',
]);

/** Map a modifier slug to its cluster key; '' when unlisted (caller routes to `other`). */
const SLUG_TO_CLUSTER: ReadonlyMap<string, string> = new Map(
  MODIFIER_CLUSTERS.flatMap(c => c.modifiers.map(m => [m, c.key] as const)),
);

export function clusterForModifier(slug: string): string {
  return SLUG_TO_CLUSTER.get((slug || '').trim()) ?? 'other';
}

const CLUSTER_KEY_TO_LABEL: ReadonlyMap<string, string> = new Map(
  MODIFIER_CLUSTERS.map(c => [c.key, c.label] as const),
);

/** Reader-facing cluster label for a modifier slug (falls back to the "other" cluster label). */
export function clusterLabelForModifier(slug: string): string {
  return CLUSTER_KEY_TO_LABEL.get(clusterForModifier(slug)) ?? 'Other tracked operators';
}
