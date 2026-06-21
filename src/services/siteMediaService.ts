/**
 * Shared loader for fixed site-content media (the registry in
 * `src/content/siteMedia.ts`). Resolves a slot to its seeded curator
 * media_items row by stable source filename and shapes the playable URL through
 * the storage adapter, so the net/freestyle/event landing surfaces share one
 * loader instead of three near-identical copies.
 *
 * Returns null/undefined when the slot's row is absent (e.g. before the curator
 * seed has run), so a surface degrades to its empty state rather than erroring.
 */
import { media, CuratorSlotMediaRow } from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { mosaicClipFilename } from '../content/freestyleTricksMosaic';
import { SITE_MEDIA_SLOTS, SiteMediaSlotKey } from '../content/siteMedia';

export interface SiteVideo {
  // The seeded media_items row id, used to link a site-content clip to its
  // gallery item-viewer page (/media/<galleryId>/<mediaId>).
  mediaId: string;
  mp4Url: string;
  posterUrl: string;
  caption: string;
}

function rowForFilename(sourceFilename: string): CuratorSlotMediaRow | undefined {
  return media.getCuratorMediaByFilename.get(sourceFilename) as CuratorSlotMediaRow | undefined;
}

function shapeVideo(row: CuratorSlotMediaRow | undefined): SiteVideo | null {
  if (!row || row.media_type !== 'video' || !row.video_id) return null;
  const adapter = getMediaStorageAdapter();
  return {
    mediaId: row.id,
    mp4Url: `${adapter.constructURL(row.video_id)}?v=${row.id}`,
    posterUrl: row.thumbnail_url ?? '',
    caption: row.caption ?? '',
  };
}

function shapePhotoUrl(row: CuratorSlotMediaRow | undefined): string | undefined {
  if (!row || row.media_type !== 'photo' || !row.s3_key_display) return undefined;
  return `${getMediaStorageAdapter().constructURL(row.s3_key_display)}?v=${row.id}`;
}

/** Load a named video slot (e.g. `net_demo`, `freestyle_demo`). */
export function loadSiteVideo(slot: SiteMediaSlotKey): SiteVideo | null {
  return shapeVideo(rowForFilename(SITE_MEDIA_SLOTS[slot].sourceFilename));
}

/** Load a named photo slot's display URL (e.g. `japan_worlds_promo`). */
export function loadSitePhotoUrl(slot: SiteMediaSlotKey): string | undefined {
  return shapePhotoUrl(rowForFilename(SITE_MEDIA_SLOTS[slot].sourceFilename));
}

/** Load one foundations-mosaic clip by its core-atom slug. */
export function loadMosaicVideo(atomSlug: string): SiteVideo | null {
  return shapeVideo(rowForFilename(mosaicClipFilename(atomSlug)));
}
