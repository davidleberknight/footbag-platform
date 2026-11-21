/**
 * The cover photo an event or a club may carry: how it is uploaded and how it
 * is read for a page or a list. The event and club services own the pointer
 * (`cover_media_id`) and who may move it; this module owns the photo side,
 * shared so the two cannot drift.
 *
 * A cover is an ordinary member photo uploaded through the Share Media photo
 * path, owned by whoever uploaded it and tagged with the entity's hashtag (and
 * the uploader's own `#by_` tag), so it also appears in the entity's gallery.
 * It is honoured on read only while it is an active, non-avatar photo that
 * still carries that hashtag; otherwise there is no cover, and no other photo
 * stands in for it.
 *
 * Every list read resolves its covers in one statement, never one per item.
 */
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { config } from '../config/env';
import { isGalleryCoverCandidate, listClubCovers, listEventCovers, type EntityCoverRow } from '../db/db';
import { getDefaultCuratorMediaService } from './curatorMediaService';
import { ForbiddenError, RateLimitedError, ValidationError } from './serviceErrors';

/** A cover photo as a page or a card draws it. */
export interface CoverPhotoView {
  mediaId: string;
  thumbUrl: string;
  displayUrl: string;
  /** The display rendition's address with the site's own origin, for a share image. */
  absoluteDisplayUrl: string;
  caption: string | null;
  widthPx: number | null;
  heightPx: number | null;
}

/** The page image of a cover: its display rendition, sized, with its alt text. */
export interface CoverPhotoImage {
  url: string;
  alt: string;
  widthPx: number | null;
  heightPx: number | null;
}

/** The file a cover upload carries, as the multipart reader collected it. */
export interface CoverPhotoFile {
  buffer: Buffer;
  filename: string;
}

/** Who uploads a cover photo; the photo is theirs. */
export interface CoverPhotoUploader {
  memberId: string;
  slug: string;
  isAdmin: boolean;
}

/**
 * The Cover Photo section of an event's manage page or a club's edit area: the
 * current cover's thumbnail, if one is honoured, and the controls, offered only
 * to a member holding the Tier 1 benefits Share Media requires.
 */
export interface CoverPhotoSection {
  thumbUrl: string | null;
  thumbAlt: string;
  /** The upload form's action; null when the viewer may not change the cover. */
  uploadAction: string | null;
  /** The remove button's action; null with no cover, or when the viewer may not change it. */
  removeAction: string | null;
}

/**
 * How a cover change ended. `changed` moved the pointer; `own_repeat` is this
 * member's own earlier submit, already standing; `already_held` is a state
 * another act left; `refused` carries the reason and its status.
 */
export type CoverPhotoChange =
  | { branch: 'changed' | 'own_repeat' | 'already_held' }
  | { branch: 'refused'; message: string; httpStatus: 403 | 422 | 429; retryAfterSeconds?: number };

export type CoverUploadOutcome =
  | { status: 'uploaded'; mediaId: string }
  | { status: 'refused'; message: string; httpStatus: 403 | 422 | 429; retryAfterSeconds?: number };

/** An upload's refusal as the cover change it ends. */
export function refusedCoverChange(upload: Extract<CoverUploadOutcome, { status: 'refused' }>): CoverPhotoChange {
  return {
    branch: 'refused',
    message: upload.message,
    httpStatus: upload.httpStatus,
    ...(upload.retryAfterSeconds !== undefined ? { retryAfterSeconds: upload.retryAfterSeconds } : {}),
  };
}

function toView(row: EntityCoverRow): CoverPhotoView {
  const storage = getMediaStorageAdapter();
  const displayUrl = storage.constructURL(row.s3_key_display);
  return {
    mediaId: row.media_id,
    thumbUrl: storage.constructURL(row.s3_key_thumb),
    displayUrl,
    absoluteDisplayUrl: config.publicBaseUrl.replace(/\/+$/, '') + displayUrl,
    caption: row.caption,
    widthPx: row.width_px,
    heightPx: row.height_px,
  };
}

/** The honoured cover of each event, keyed by event id; one statement for the list. */
export function eventCoverPhotos(eventIds: string[]): Map<string, CoverPhotoView> {
  return new Map(listEventCovers(eventIds).map((r) => [r.entity_id, toView(r)]));
}

/** The honoured cover of each club, keyed by club id; one statement for the list. */
export function clubCoverPhotos(clubIds: string[]): Map<string, CoverPhotoView> {
  return new Map(listClubCovers(clubIds).map((r) => [r.entity_id, toView(r)]));
}

/** The page image for a cover: the caption is its alt text, else the entity's name. */
export function coverPhotoImage(cover: CoverPhotoView, entityName: string): CoverPhotoImage {
  const caption = cover.caption?.trim();
  return {
    url: cover.displayUrl,
    alt: caption ? caption : `Cover photo of ${entityName}`,
    widthPx: cover.widthPx,
    heightPx: cover.heightPx,
  };
}

/** Whether a photo may stand as the cover of the entity whose hashtag this is. */
export function isCoverCandidate(mediaId: string, tagNormalized: string): boolean {
  return isGalleryCoverCandidate(mediaId, [tagNormalized], []);
}

/**
 * Upload a photo as the uploader's own, tagged with the entity's hashtag,
 * through the Share Media photo path and its checks: Tier 1 benefits, the
 * per-photo size limit, the accepted formats, the upload rate limit and the
 * one-file-name-per-uploader rule. The same file submitted again returns the
 * photo the first submit stored. A refusal carries the upload's own message.
 * An image worker outage is not a refusal and is thrown as it arrives.
 */
export async function uploadCoverPhoto(
  uploader: CoverPhotoUploader,
  tagNormalized: string,
  file: CoverPhotoFile,
): Promise<CoverUploadOutcome> {
  try {
    const result = await getDefaultCuratorMediaService().uploadPhotoForMember({
      memberId: uploader.memberId,
      actorIsAdmin: uploader.isAdmin,
      slug: uploader.slug,
      photoBuffer: file.buffer,
      sourceFilename: file.filename,
      caption: null,
      tags: [tagNormalized],
      externalUrl: null,
    });
    return { status: 'uploaded', mediaId: result.mediaId };
  } catch (err) {
    if (err instanceof ValidationError) return { status: 'refused', message: err.message, httpStatus: 422 };
    if (err instanceof ForbiddenError) return { status: 'refused', message: err.message, httpStatus: 403 };
    if (err instanceof RateLimitedError) {
      return { status: 'refused', message: err.message, httpStatus: 429, retryAfterSeconds: err.retryAfterSeconds };
    }
    throw err;
  }
}
