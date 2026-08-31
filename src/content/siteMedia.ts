import { TRICKS_MOSAIC, mosaicClipFilename } from './freestyleTricksMosaic';

/**
 * Typed registry of fixed site-content media slots: curator-published media that
 * is featured in a developer-chosen spot on a page (a landing hero, an event
 * promo image, the foundations mosaic) rather than browsed through a gallery.
 *
 * Each slot binds a stable `sourceFilename` (the slot identity the seeder writes
 * and `getCuratorMediaByFilename` resolves) to its kind and its expected tag
 * stack. The binaries live under `curated/site/`; the seeder loads them like any
 * file-paired curator item and auto-applies `#curated`. The integrity check
 * asserts every slot here resolves to a stored media row, so a renamed or
 * un-seeded asset fails loudly instead of rendering an empty feature.
 */
export type SiteMediaKind = 'photo' | 'video';

export interface SiteMediaSlot {
  sourceFilename: string;
  kind: SiteMediaKind;
  // Tags the seeded row must carry (a subset assertion, not an exact set):
  // the sidecar tags plus the auto-applied `#curated`.
  expectedTags: readonly string[];
}

// The named, one-off site slots.
export const SITE_MEDIA_SLOTS = {
  net_demo: {
    sourceFilename: 'demo-net.mp4',
    kind: 'video',
    expectedTags: ['#curated', '#demo_net'],
  },
  freestyle_demo: {
    sourceFilename: 'demo-freestyle.mp4',
    kind: 'video',
    expectedTags: ['#curated', '#demo_freestyle', '#freestyle'],
  },
  japan_worlds_promo: {
    sourceFilename: 'japan-worlds-2026.jpg',
    kind: 'photo',
    expectedTags: ['#curated', '#event_2026_worlds_japan'],
  },
} as const satisfies Record<string, SiteMediaSlot>;

export type SiteMediaSlotKey = keyof typeof SITE_MEDIA_SLOTS;

// What every foundational mosaic clip carries, whichever move it shows.
// `#foundations` names the collection; it replaced a tag naming this page's
// layout slot, which described where a clip was placed rather than what it shows
// and reached visitors as a hashtag saying so.
export const MOSAIC_SLOT_SHARED_TAGS: readonly string[] = ['#curated', '#freestyle', '#foundations'];

/**
 * What one mosaic clip must carry: the shared collection tags, plus the trick it
 * demonstrates.
 *
 * The trick tag is the clip's semantic identity, and every media item needs one:
 * a collection tag says which set a clip belongs to, never what it is. It is also
 * what makes the clip reachable from the move it demonstrates, so the twelve are
 * reference media on their own trick pages rather than only on a gallery.
 *
 * Per-slot rather than one shared list, so a clip that lost its trick tag fails
 * here instead of passing on the strength of the tags it shares with eleven
 * others.
 */
export function mosaicSlotExpectedTags(atomSlug: string): readonly string[] {
  return [...MOSAIC_SLOT_SHARED_TAGS, `#${atomSlug}`];
}

/**
 * Every site-content slot the integrity check must verify: the named slots plus
 * one per mosaic atom. The mosaic slots are derived from `TRICKS_MOSAIC` so the
 * set cannot drift from the rendered mosaic.
 */
export function allSiteMediaSlots(): SiteMediaSlot[] {
  const named = Object.values(SITE_MEDIA_SLOTS) as SiteMediaSlot[];
  const mosaic: SiteMediaSlot[] = TRICKS_MOSAIC.map((atom) => ({
    sourceFilename: mosaicClipFilename(atom.slug),
    kind: 'video',
    expectedTags: mosaicSlotExpectedTags(atom.slug),
  }));
  return [...named, ...mosaic];
}
