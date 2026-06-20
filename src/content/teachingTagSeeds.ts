/**
 * Pinned starter hashtags for the empty-state teaching moments and the tag
 * suggestions. A tag is community-popular only once two or more distinct members
 * have applied it, so until real members upload and tag content there is no
 * genuine popular list to show. These starters are pinned ahead of the
 * curator-published backfill so the discovery feature is demonstrable from day
 * one. They are phased out automatically as people make new uploads: real
 * community-popular tags rank above the starters and squeeze them out of the
 * capped list as that usage accrues, with no flag and no migration. Curated to
 * tags with community meaning; edit freely as the community's tags take over.
 */
export interface TeachingTagSeed {
  display: string;
  normalized: string;
}

export const TEACHING_TAG_SEEDS: ReadonlyArray<TeachingTagSeed> = [
  { display: '#club_wellington', normalized: '#club_wellington' },
  { display: '#event_2026_worlds_japan', normalized: '#event_2026_worlds_japan' },
  { display: '#chinlone', normalized: '#chinlone' },
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

/**
 * Compose the suggestion list in three priority tiers, capped at `limit`:
 * real community-popular tags first (the people-are-uploading signal), then the
 * pinned starter seeds, then curator-published tags backfilling any remainder.
 * Before community usage accrues the seeds sit at the top and are visible; as
 * members upload and real community tags fill the high slots, the seeds are
 * squeezed out automatically, with no flag and no migration. De-duplicates
 * case-insensitively across all three tiers. Pure: the caller supplies `hrefFor`
 * for the seed chips; community and curator chips arrive href-complete.
 */
export function composeSuggestedTags(
  communityPopular: SeededTagChip[],
  seeds: ReadonlyArray<TeachingTagSeed>,
  curatorPopular: SeededTagChip[],
  limit: number,
  hrefFor: (normalized: string) => string,
): SeededTagChip[] {
  const out = padPopularTagsWithSeeds(communityPopular, seeds, limit, hrefFor);
  const seen = new Set(out.map((c) => c.normalized.toLowerCase()));
  for (const chip of curatorPopular) {
    if (out.length >= limit) break;
    const key = chip.normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  return out;
}
