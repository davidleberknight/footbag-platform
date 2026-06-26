import { CORE_TRICKS } from '../services/coreTrickRegistry';

/**
 * The 12 foundational freestyle atoms as they appear in the freestyle landing mosaic.
 *
 * `slug` binds each cell to its canonical core-atom trick page (the source of the
 * eventual click-through); `label` is the plain name a newcomer reads. The display
 * order is the intended 4-across by 3-down reading order and is deliberately set
 * here rather than taken from CORE_TRICKS, which is an unordered set. The mosaic
 * must always show exactly the canonical atoms - no more, no fewer - which the
 * matcher below (and its test) enforces so the section cannot silently drift from
 * the ontology.
 */
export interface MosaicAtom {
  slug: string;
  label: string;
}

export const TRICKS_MOSAIC: readonly MosaicAtom[] = [
  { slug: 'toe_stall',        label: 'Toe Delay' },
  { slug: 'clipper_stall',    label: 'Clipper' },
  { slug: 'around_the_world', label: 'Around the World' },
  { slug: 'orbit',            label: 'Orbit' },
  { slug: 'legover',          label: 'Legover' },
  { slug: 'mirage',           label: 'Mirage' },
  { slug: 'pickup',           label: 'Pickup' },
  { slug: 'illusion',         label: 'Illusion' },
  { slug: 'butterfly',        label: 'Butterfly' },
  { slug: 'osis',             label: 'Osis' },
  { slug: 'whirl',            label: 'Whirl' },
  { slug: 'swirl',            label: 'Swirl' },
];

/** True when the mosaic covers exactly the canonical core atoms, in any order. */
export function mosaicMatchesCoreAtoms(): boolean {
  const slugs = new Set(TRICKS_MOSAIC.map(a => a.slug));
  return slugs.size === CORE_TRICKS.size && [...CORE_TRICKS].every(s => slugs.has(s));
}

/**
 * Source filename a curated loop must carry to light up its cell, e.g.
 * `mosaic-toe-stall.mp4`. The freestyle landing loads each cell's clip by this name;
 * until the curated media exists the cell renders its labelled empty state. The atom
 * slug is underscore-joined (`toe_stall`) while the curated clip files are
 * hyphen-joined (`mosaic-toe-stall.mp4`), so the separator is normalized here;
 * without it the multi-word atoms (toe stall, clipper stall, around the world) miss.
 */
export function mosaicClipFilename(slug: string): string {
  return `mosaic-${slug.replace(/_/g, '-')}.mp4`;
}
