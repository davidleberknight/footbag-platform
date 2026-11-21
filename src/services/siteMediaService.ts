/**
 * Shared loader for fixed site-content media (the registry in
 * `src/content/siteMedia.ts`). Resolves a slot to its seeded curator
 * media_items row, a stored slot by its stable source filename and a linked
 * YouTube slot by its watch URL, and shapes the playable media, so every page
 * that features a video plays the tagged media row rather than a file or link
 * of its own.
 *
 * Returns null/undefined when the slot's row is absent (e.g. before the curator
 * seed has run), so a surface degrades to its empty state rather than erroring.
 */
import { media, CuratorSlotMediaRow } from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { mosaicClipFilename } from '../content/freestyleTricksMosaic';
import { SITE_MEDIA_SLOTS, SiteMediaSlot, SiteMediaSlotKey } from '../content/siteMedia';
import { VideoMedia, expandVideoFromMediaItem } from './videoMedia';

export interface SiteVideo {
  // The seeded media_items row id, used to link a site-content clip to its
  // gallery item-viewer page (/media/<galleryId>/<mediaId>).
  mediaId: string;
  mp4Url: string;
  posterUrl: string;
  caption: string;
  // An upright clip, framed in its own shape rather than the landscape frame.
  isPortrait: boolean;
}

function rowForFilename(sourceFilename: string): CuratorSlotMediaRow | undefined {
  return media.getCuratorMediaByFilename.get(sourceFilename) as CuratorSlotMediaRow | undefined;
}

function rowForSlot(slot: SiteMediaSlot): CuratorSlotMediaRow | undefined {
  if (slot.videoUrl !== undefined) {
    return media.getCuratorMediaByVideoUrl.get(slot.videoPlatform, slot.videoUrl) as
      CuratorSlotMediaRow | undefined;
  }
  return rowForFilename(slot.sourceFilename);
}

function shapeVideo(row: CuratorSlotMediaRow | undefined, isPortrait = false): SiteVideo | null {
  if (!row || row.media_type !== 'video' || !row.video_id) return null;
  const adapter = getMediaStorageAdapter();
  return {
    mediaId: row.id,
    mp4Url: `${adapter.constructURL(row.video_id)}?v=${row.id}`,
    posterUrl: row.thumbnail_url ?? '',
    caption: row.caption ?? '',
    isPortrait,
  };
}

function shapePhotoUrl(row: CuratorSlotMediaRow | undefined): string | undefined {
  if (!row || row.media_type !== 'photo' || !row.s3_key_display) return undefined;
  return `${getMediaStorageAdapter().constructURL(row.s3_key_display)}?v=${row.id}`;
}

/** Load a named video slot (e.g. `net_demo`, `freestyle_demo`). */
export function loadSiteVideo(slot: SiteMediaSlotKey): SiteVideo | null {
  const entry: SiteMediaSlot = SITE_MEDIA_SLOTS[slot];
  return shapeVideo(rowForSlot(entry), entry.portrait === true);
}

/**
 * Load a named video slot as click-to-play facade media, for a slot shown among
 * other featured videos rather than as a looping demo. A stored slot plays from
 * the media store; a linked slot embeds its YouTube video.
 */
export function loadSiteVideoMedia(slot: SiteMediaSlotKey, videoTitle: string): VideoMedia | null {
  const row = rowForSlot(SITE_MEDIA_SLOTS[slot]);
  if (!row || row.media_type !== 'video') return null;
  const adapter = getMediaStorageAdapter();
  return expandVideoFromMediaItem(row, {
    constructURL: (key) => adapter.constructURL(key),
    videoTitle,
  });
}

/** Load a named photo slot's display URL (e.g. `japan_worlds_promo`). */
export function loadSitePhotoUrl(slot: SiteMediaSlotKey): string | undefined {
  return shapePhotoUrl(rowForSlot(SITE_MEDIA_SLOTS[slot]));
}

/** Load one foundations-mosaic clip by its core-atom slug. */
export function loadMosaicVideo(atomSlug: string): SiteVideo | null {
  return shapeVideo(rowForFilename(mosaicClipFilename(atomSlug)));
}
