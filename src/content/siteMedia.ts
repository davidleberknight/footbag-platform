import { TRICKS_MOSAIC, mosaicClipFilename } from './freestyleTricksMosaic';

/**
 * Typed registry of fixed site-content media slots: curator-published media that
 * is featured in a developer-chosen spot on a page (a landing hero, an event
 * promo image, the foundations mosaic) rather than browsed through a gallery.
 *
 * A slot is identified one of two ways. A stored slot binds a stable
 * `sourceFilename` (the identity the seeder writes and `getCuratorMediaByFilename`
 * resolves); its binary lives under `curated/site/` and is loaded like any
 * file-paired curator item. A linked slot is a video hosted on YouTube, bound by
 * its watch URL (the identity a URL-reference sidecar under
 * `curated/site_videos/` seeds and `getCuratorMediaByVideoUrl` resolves). Either
 * way the page renders the seeded media row, so every video a page plays carries
 * hashtags and is found by browsing media like any other item; the seeder
 * auto-applies `#curated`. The integrity check asserts every slot here resolves
 * to a seeded row with its expected tags, so a renamed or un-seeded asset fails
 * loudly instead of rendering an empty feature.
 */
export type SiteMediaKind = 'photo' | 'video';

interface SiteMediaSlotBase {
  kind: SiteMediaKind;
  // A video shot upright; its frame keeps the clip's own shape instead of the
  // landscape frame the other featured clips fill.
  portrait?: boolean;
  // Tags the seeded row must carry (a subset assertion, not an exact set):
  // the sidecar tags plus the auto-applied `#curated`.
  expectedTags: readonly string[];
}

export interface StoredSiteMediaSlot extends SiteMediaSlotBase {
  sourceFilename: string;
  videoUrl?: never;
}

export interface LinkedSiteVideoSlot extends SiteMediaSlotBase {
  kind: 'video';
  videoPlatform: 'youtube';
  videoUrl: string;
  sourceFilename?: never;
}

export type SiteMediaSlot = StoredSiteMediaSlot | LinkedSiteVideoSlot;

/** The identity a slot is resolved by, for naming it in a failure. */
export function siteMediaSlotIdentity(slot: SiteMediaSlot): string {
  return slot.sourceFilename ?? slot.videoUrl;
}

const youtube = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

// The named, one-off site slots.
export const SITE_MEDIA_SLOTS = {
  // The demo loops. No tag names the slot: the file name already says which
  // spot a clip fills, so the tags say only what the clip shows.
  net_demo: {
    sourceFilename: 'demo-net.mp4',
    kind: 'video',
    expectedTags: ['#curated', '#net', '#demo'],
  },
  freestyle_demo: {
    sourceFilename: 'demo-freestyle.mp4',
    kind: 'video',
    expectedTags: ['#curated', '#freestyle', '#demo'],
  },
  consecutives_demo: {
    sourceFilename: 'demo-consecutives.mp4',
    kind: 'video',
    portrait: true,
    expectedTags: ['#curated', '#consecutives', '#demo', '#player_kenny_shults'],
  },
  golf_demo: {
    sourceFilename: 'demo-golf.webm',
    kind: 'video',
    expectedTags: ['#curated', '#golf', '#demo'],
  },
  circle_kicking_demo: {
    sourceFilename: 'demo-circle-kicking.webm',
    kind: 'video',
    expectedTags: ['#curated', '#sideline', '#demo'],
  },
  four_square_demo: {
    sourceFilename: 'demo-four-square.webm',
    kind: 'video',
    expectedTags: ['#curated', '#x_square', '#demo'],
  },
  fountain_shred: {
    sourceFilename: 'fountain-shred.mp4',
    kind: 'video',
    expectedTags: ['#curated', '#freestyle', '#event_2017_worlds_united_states'],
  },
  // The net competition-format videos.
  net_singles: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('Rep-1rQbX-o'),
    expectedTags: [
      '#curated', '#net', '#event_2019_worlds_poland',
      '#player_walt_houston', '#player_sebastien_maillet',
    ],
  },
  net_doubles: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('lcDP3JGvkP0'),
    expectedTags: [
      '#curated', '#net', '#event_2019_worlds_poland',
      '#player_francois_pelletier', '#player_genevieve_bousquet',
      '#player_florian_goetze', '#player_kerstin_adineh',
    ],
  },
  // The freestyle landing's featured videos.
  freestyle_circle: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('aMr5e5wlgeE'),
    expectedTags: ['#curated', '#freestyle', '#circle', '#event_2017_worlds_united_states'],
  },
  freestyle_sick_3: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('h6F0aPIpC1o'),
    expectedTags: ['#curated', '#freestyle', '#sick_3', '#event_2022_worlds_poland'],
  },
  freestyle_shred_30: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('wb75xzvAs68'),
    expectedTags: ['#curated', '#freestyle', '#shred_30', '#player_taishi_ishida'],
  },
  freestyle_reese_1988: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('Zdplm0_RaNY'),
    expectedTags: ['#curated', '#freestyle', '#event_1988_worlds_united_states', '#player_rick_reese'],
  },
  freestyle_conlon_1998: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('2URvZFuxBls'),
    expectedTags: [
      '#curated', '#freestyle', '#event_1998_worlds_canada',
      '#player_samantha_conlon', '#player_carol_wedemeyer',
    ],
  },
  freestyle_worlds_2023_team: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('xoDEvsbQDYk'),
    expectedTags: [
      '#curated', '#freestyle', '#event_2023_worlds_colombia',
      '#player_scott_davidson', '#player_tuan_vu',
    ],
  },
  freestyle_san_marino_2026: {
    kind: 'video',
    videoPlatform: 'youtube',
    videoUrl: youtube('U6J2LXxUWro'),
    expectedTags: ['#curated', '#freestyle', '#player_jim_penske'],
  },
  japan_worlds_promo: {
    sourceFilename: 'japan-worlds-2026.jpg',
    kind: 'photo',
    expectedTags: ['#curated', '#event_2026_worlds_japan'],
  },
} as const satisfies Record<string, SiteMediaSlot>;

export type SiteMediaSlotKey = keyof typeof SITE_MEDIA_SLOTS;

// What every foundational mosaic clip carries, whichever move it shows. No tag
// names the collection: the mosaic's atom list owns which clips belong, by file
// name, so a tag would only be a second answer to the same question.
export const MOSAIC_SLOT_SHARED_TAGS: readonly string[] = ['#curated', '#freestyle'];

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
  const mosaic: SiteMediaSlot[] = TRICKS_MOSAIC.map((atom): StoredSiteMediaSlot => ({
    sourceFilename: mosaicClipFilename(atom.slug),
    kind: 'video',
    expectedTags: mosaicSlotExpectedTags(atom.slug),
  }));
  return [...named, ...mosaic];
}
