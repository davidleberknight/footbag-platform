/**
 * freestyleTerminalCohorts.ts
 *
 * Curator-locked "Tricks that land here" cohorts for terminal-stall atoms that
 * are NOT public families, so the Family ladder does not already own them.
 *
 * Why this layer exists
 * ---------------------
 * A trick's terminal is the stall surface it finishes on (encoded in the final
 * [DEL] token of its operational notation). For terminal atoms that resolve to a
 * public family (e.g. inside_stall, whose family ladder owns the guay lineage),
 * the family ladder already surfaces what lands there, so no terminal cohort is
 * needed and adding one would duplicate the ladder. But toe_stall and
 * clipper_stall are above-ceiling atoms with no public family, so their pages
 * have no "what lands here" view at all. These curated cohorts give those
 * foundational atoms a short, recognizable, cross-family list so the pages do
 * not feel lonely.
 *
 * Curation rules (forever): bounded (8-12), beginner-recognizable, low-to-mid
 * ADD, family-diverse (a terminal view, not a single family's ladder), and never
 * a family that the Family ladder already owns. inside_stall is intentionally
 * absent. Order is the display order.
 */

export const TERMINAL_DERIVED_COHORTS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ['toe_stall', [
      'mirage', 'illusion', 'legover', 'pickup', 'around_the_world', 'orbit',
      'rake', 'double_leg_over', 'paradox_mirage', 'barrage',
    ]],
    ['clipper_stall', [
      'whirl', 'swirl', 'butterfly', 'osis', 'drifter', 'rev_whirl', 'rev_swirl',
      'blender', 'dyno', 'atomic_butterfly',
    ]],
  ]);

/** Reverse index: a cohort member slug -> its terminal atom slug (for the
 *  reciprocal "Lands in" backlink). A trick finishes on one surface, so a member
 *  belongs to at most one cohort. */
export const TERMINAL_OF_MEMBER: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [terminal, members] of TERMINAL_DERIVED_COHORTS) {
    for (const slug of members) m.set(slug, terminal);
  }
  return m;
})();
