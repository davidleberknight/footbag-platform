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

// The 12 foundational mosaic clips share one tag stack; each clip's identity is
// its per-atom filename (`mosaic-<slug>.mp4`).
export const MOSAIC_SLOT_EXPECTED_TAGS: readonly string[] = ['#curated', '#freestyle', '#demo_mosaic'];

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
    expectedTags: MOSAIC_SLOT_EXPECTED_TAGS,
  }));
  return [...named, ...mosaic];
}
