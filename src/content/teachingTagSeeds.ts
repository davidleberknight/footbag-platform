/**
 * Starter community hashtags for the empty-state teaching moments and the tag
 * suggestions. A tag is community-popular only once two or more distinct
 * members have applied it, so until that usage accrues the stat-driven popular
 * list is empty. These starters fill the remaining slots: real popular tags
 * always take precedence, the starters pad up to the target size, and each
 * starter drops out automatically once a genuine community-popular tag is
 * available for its slot. Curated to tags with community meaning; edit freely
 * as the community's real popular tags take over.
 */
export interface TeachingTagSeed {
  display: string;
  normalized: string;
}

export const TEACHING_TAG_SEEDS: ReadonlyArray<TeachingTagSeed> = [
  { display: '#freestyle', normalized: '#freestyle' },
  { display: '#trick', normalized: '#trick' },
  { display: '#tutorial', normalized: '#tutorial' },
  { display: '#chinlone', normalized: '#chinlone' },
  { display: '#footbags', normalized: '#footbags' },
  { display: '#club_wellington', normalized: '#club_wellington' },
  { display: '#event_2026_worlds_japan', normalized: '#event_2026_worlds_japan' },
];

/** Minimal chip shape the padding works over; structurally matches the
 *  service's TagChipShape so callers can use the result directly. */
export interface SeededTagChip {
  display: string;
  normalized: string;
  href: string;
}

/**
 * Pad a list of real (stat-driven) popular-tag chips up to `limit` with
 * starter seeds. Real chips come first and are never displaced; seeds fill the
 * remainder, skipping any whose normalized form (case-insensitive) already
 * appears among the real chips or an earlier seed. Pure: no DB, no clock; the
 * caller supplies `hrefFor` to build each seed chip's browse link.
 */
export function padPopularTagsWithSeeds(
  real: SeededTagChip[],
  seeds: ReadonlyArray<TeachingTagSeed>,
  limit: number,
  hrefFor: (normalized: string) => string,
): SeededTagChip[] {
  const out: SeededTagChip[] = [];
  const seen = new Set<string>();
  for (const chip of real) {
    if (out.length >= limit) break;
    const key = chip.normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  for (const seed of seeds) {
    if (out.length >= limit) break;
    const key = seed.normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ display: seed.display, normalized: seed.normalized, href: hrefFor(seed.normalized) });
  }
  return out;
}
