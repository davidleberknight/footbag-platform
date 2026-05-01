import { randomUUID } from 'crypto';
import { media, mediaTags as mediaTagsDb, queryCuratorMediaTags, transaction } from '../db/db';
import { detectImageType } from '../lib/imageProcessing';
import {
  detectVideoFormat,
  transcodeCuratorVideo,
  type TranscodedVideo,
} from '../lib/videoProcessing';
import { Semaphore } from '../lib/semaphore';
import { MediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { NotFoundError, ValidationError } from './serviceErrors';
import { appendAuditEntry } from './auditService';
import { runSqliteRead } from './sqliteRetry';

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
export const POSTER_MAX_BYTES = 25 * 1024 * 1024;
export const CAPTION_MAX_LEN = 500;

// Slot count 1: serializes ffmpeg transcode at the service boundary so two
// concurrent admin uploads cannot OOM the staging Lightsail nano_3_0 host
// (512 MB total, undersized vs DD §1.8 production target). Wait timeout is
// generous because legitimate transcode takes 1-3 min.
const TRANSCODE_WAIT_MS = 10 * 60 * 1000;
const transcodeBound = new Semaphore(1, TRANSCODE_WAIT_MS);

// Test seam: integration tests inject a fake transcoder via this module-
// level setter so the suite runs without real ffmpeg. Controllers construct
// the service without passing `videoTranscoder`; in production it falls
// through to `transcodeCuratorVideo`. Mirrors `setImageProcessingAdapterForTests`.
let transcoderOverrideForTests: ((buf: Buffer) => Promise<TranscodedVideo>) | null = null;
export function setVideoTranscoderForTests(
  impl: (buf: Buffer) => Promise<TranscodedVideo>,
): void {
  transcoderOverrideForTests = impl;
}
export function resetVideoTranscoderForTests(): void {
  transcoderOverrideForTests = null;
}

export interface CuratorMediaServiceDeps {
  storage: MediaStorageAdapter;
  imageProcessor: ImageProcessingAdapter;
  videoTranscoder?: (buf: Buffer) => Promise<TranscodedVideo>;
  // Test seam: override system-member resolution. Default reads from DB.
  findSystemMemberId?: () => string | null;
}

export interface CuratorPhotoInput {
  adminMemberId: string;
  photoBuffer: Buffer;
  sourceFilename: string;
  caption: string | null;
  tags: string[];
}

export interface CuratorVideoInput {
  adminMemberId: string;
  videoBuffer: Buffer;
  posterBuffer: Buffer;
  sourceFilename: string;
  caption: string | null;
  tags: string[];
}

export interface CuratorUploadResult {
  mediaId: string;
  displayUrl: string;
}

interface SystemMemberRow {
  id: string;
}

function newMediaId(): string {
  return `media_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newTagId(): string {
  return `tag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newMediaTagId(): string {
  return `mtag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function validateCaption(caption: string | null): void {
  if (caption !== null && caption.length > CAPTION_MAX_LEN) {
    throw new ValidationError(`Caption must be ${CAPTION_MAX_LEN} characters or fewer.`);
  }
}

// The single FH/admin uploader marker. Auto-applied by every curator
// upload + edit path; rejected from caller input so it cannot be set
// by hand. Stored as a standard tag (is_standard=1, standard_type='curator').
export const CURATED_TAG = '#curated';

function validateTags(tags: string[]): void {
  for (const tag of tags) {
    if (!tag.startsWith('#')) {
      throw new ValidationError(`Tag must start with '#': got "${tag}"`);
    }
    if (tag !== tag.toLowerCase()) {
      throw new ValidationError(`Tag must be lowercase: got "${tag}"`);
    }
    if (tag === CURATED_TAG) {
      throw new ValidationError(
        `The ${CURATED_TAG} tag is auto-applied by the curator pipeline and must not appear in input.`,
      );
    }
  }
}

function defaultFindSystemMemberId(): string | null {
  const row = runSqliteRead('findSystemMemberId', () =>
    media.findSystemMemberId.get(),
  ) as SystemMemberRow | undefined;
  return row?.id ?? null;
}

function applyTags(mediaId: string, tags: string[], now: string): void {
  for (const tag of tags) {
    const existing = mediaTagsDb.findTagByNormalized.get(tag) as { id: string } | undefined;
    let tagId: string;
    if (existing) {
      tagId = existing.id;
    } else {
      tagId = newTagId();
      mediaTagsDb.insertTag.run(tagId, now, now, tag, tag);
    }
    mediaTagsDb.insertMediaTag.run(newMediaTagId(), now, now, mediaId, tagId, tag);
  }
}

// Curator tag application: appends #curated to the user-supplied tags.
// Caller has already passed userTags through validateTags (which rejects
// #curated from input). This is the only path that adds #curated to a
// media item. The tag is stored as freeform (is_standard=0); per US §1.1
// only `#event_*` and `#club_*` use the standardized hashtag namespace.
// Auto-application + input-rejection give #curated the protection it
// needs without requiring a schema change.
function applyTagsForCurator(mediaId: string, userTags: string[], now: string): void {
  const canonical = [...userTags, CURATED_TAG];
  applyTags(mediaId, canonical, now);
}

export interface CuratorMediaEditInput {
  adminMemberId: string;
  mediaId: string;
  caption?: string | null;
  tags?: string[];
}

export interface CuratorMediaEditResult {
  mediaId: string;
  updatedAt: string;
}

export interface CuratorMediaDeleteInput {
  adminMemberId: string;
  mediaId: string;
}

export interface CuratorMediaListInput {
  tagFilter?: string;
  page: number;
  pageSize: number;
}

export interface CuratorMediaListItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  uploadedAt: string;
  thumbnailUrl: string;
  tags: string[];
}

export interface CuratorMediaListResult {
  items: CuratorMediaListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface MediaItemRow {
  id: string;
  uploader_member_id: string;
  media_type: 'photo' | 'video';
  caption: string | null;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
  video_id: string | null;
  thumbnail_url: string | null;
  source_filename: string | null;
}

interface MediaListRow {
  id: string;
  media_type: 'photo' | 'video';
  caption: string | null;
  uploaded_at: string;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
  video_id: string | null;
  thumbnail_url: string | null;
  width_px: number | null;
  height_px: number | null;
}

interface CountRow {
  n: number;
}

export function createCuratorMediaService(deps: CuratorMediaServiceDeps) {
  const { storage, imageProcessor } = deps;
  const videoTranscoder =
    deps.videoTranscoder ?? transcoderOverrideForTests ?? transcodeCuratorVideo;
  const findSystemMemberId = deps.findSystemMemberId ?? defaultFindSystemMemberId;

  function resolveSystemMemberIdOrThrow(): string {
    const id = findSystemMemberId();
    if (!id) {
      throw new Error('Configuration error: no system member row found (is_system=1)');
    }
    return id;
  }

  return {
    async uploadPhoto(input: CuratorPhotoInput): Promise<CuratorUploadResult> {
      validateCaption(input.caption);
      validateTags(input.tags);

      if (input.photoBuffer.length > PHOTO_MAX_BYTES) {
        throw new ValidationError('Photo is too large. Maximum size is 25 MB.');
      }
      if (!detectImageType(input.photoBuffer)) {
        throw new ValidationError('Only JPEG and PNG photos are accepted.');
      }

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const processed = await imageProcessor.processPhoto(input.photoBuffer);

      const mediaId = newMediaId();
      const thumbKey = `${systemMemberId}/detached/${mediaId}-thumb.jpg`;
      const displayKey = `${systemMemberId}/detached/${mediaId}-display.jpg`;

      await storage.put(thumbKey, processed.thumb);
      await storage.put(displayKey, processed.display);

      const now = new Date().toISOString();

      transaction(() => {
        media.insertCuratorPhoto.run(
          mediaId, now, now,
          systemMemberId, input.caption, now,
          thumbKey, displayKey, processed.widthPx, processed.heightPx,
          input.sourceFilename,
        );
        applyTagsForCurator(mediaId, input.tags, now);
        appendAuditEntry({
          actionType: 'upload_curated_media',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: 'media_item',
          entityId: mediaId,
          metadata: { mediaType: 'photo', tags: input.tags },
        });
      });

      return { mediaId, displayUrl: storage.constructURL(displayKey) };
    },

    async uploadVideo(input: CuratorVideoInput): Promise<CuratorUploadResult> {
      validateCaption(input.caption);
      validateTags(input.tags);

      if (input.videoBuffer.length > VIDEO_MAX_BYTES) {
        throw new ValidationError('Video is too large. Maximum size is 150 MB.');
      }
      if (input.posterBuffer.length > POSTER_MAX_BYTES) {
        throw new ValidationError('Poster is too large. Maximum size is 25 MB.');
      }
      if (!detectVideoFormat(input.videoBuffer)) {
        throw new ValidationError('Only MP4, WebM, and MOV videos are accepted.');
      }
      if (!detectImageType(input.posterBuffer)) {
        throw new ValidationError('Poster must be a JPEG or PNG image.');
      }

      const systemMemberId = resolveSystemMemberIdOrThrow();

      // Slot-1 semaphore around the transcode prevents OOM on the 512 MB
      // staging host. Poster processing runs in parallel with the transcode
      // since the image worker has its own concurrency bound.
      await transcodeBound.acquire();
      let transcoded: TranscodedVideo;
      let processed: Awaited<ReturnType<ImageProcessingAdapter['processPhoto']>>;
      try {
        [transcoded, processed] = await Promise.all([
          videoTranscoder(input.videoBuffer),
          imageProcessor.processPhoto(input.posterBuffer),
        ]);
      } finally {
        transcodeBound.release();
      }

      const mediaId = newMediaId();
      const videoKey = `${systemMemberId}/detached/${mediaId}-video.mp4`;
      const posterDisplayKey = `${systemMemberId}/detached/${mediaId}-poster-display.jpg`;
      const posterThumbKey = `${systemMemberId}/detached/${mediaId}-poster-thumb.jpg`;

      await storage.put(videoKey, transcoded.bytes);
      await storage.put(posterDisplayKey, processed.display);
      await storage.put(posterThumbKey, processed.thumb);

      const now = new Date().toISOString();
      const thumbnailUrl = `/media/${posterDisplayKey}`;

      transaction(() => {
        media.insertCuratorVideo.run(
          mediaId, now, now,
          systemMemberId, input.caption, now,
          videoKey, thumbnailUrl,
          processed.widthPx, processed.heightPx,
          input.sourceFilename,
        );
        applyTagsForCurator(mediaId, input.tags, now);
        appendAuditEntry({
          actionType: 'upload_curated_media',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: 'media_item',
          entityId: mediaId,
          metadata: { mediaType: 'video', tags: input.tags },
        });
      });

      return { mediaId, displayUrl: storage.constructURL(posterDisplayKey) };
    },

    async editMedia(input: CuratorMediaEditInput): Promise<CuratorMediaEditResult> {
      if (input.caption !== undefined) {
        validateCaption(input.caption);
      }
      if (input.tags !== undefined) {
        validateTags(input.tags);
      }

      const row = runSqliteRead('getCuratorMediaItemById', () =>
        media.getCuratorMediaItemById.get(input.mediaId),
      ) as MediaItemRow | undefined;
      if (!row) {
        throw new NotFoundError(`Curator media not found: ${input.mediaId}`);
      }

      const now = new Date().toISOString();

      transaction(() => {
        if (input.caption !== undefined) {
          media.updateCuratorMediaCaption.run(input.caption, now, input.mediaId);
        }
        if (input.tags !== undefined) {
          mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
          applyTagsForCurator(input.mediaId, input.tags, now);
        }
        appendAuditEntry({
          actionType: 'edit_curated_media',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: 'media_item',
          entityId: input.mediaId,
          metadata: {
            captionChanged: input.caption !== undefined,
            tagsChanged: input.tags !== undefined,
            ...(input.tags !== undefined && { tags: input.tags }),
          },
        });
      });

      return { mediaId: input.mediaId, updatedAt: now };
    },

    async deleteMedia(input: CuratorMediaDeleteInput): Promise<{ mediaId: string }> {
      const row = runSqliteRead('getCuratorMediaItemById', () =>
        media.getCuratorMediaItemById.get(input.mediaId),
      ) as MediaItemRow | undefined;
      if (!row) {
        throw new NotFoundError(`Curator media not found: ${input.mediaId}`);
      }

      // Collect storage keys to clean up after the DB transaction commits.
      // For photos: thumb + display. For videos: video file + poster pair.
      // The poster keys for videos are derived from the thumbnail_url via
      // the URL-prefix convention (`/media/{key}`); s3_key_thumb/display
      // hold the poster keys for video rows.
      const keysToDelete: string[] = [];
      if (row.s3_key_thumb) keysToDelete.push(row.s3_key_thumb);
      if (row.s3_key_display) keysToDelete.push(row.s3_key_display);
      if (row.video_id) keysToDelete.push(row.video_id);
      if (row.thumbnail_url && row.thumbnail_url.startsWith('/media/')) {
        keysToDelete.push(row.thumbnail_url.slice('/media/'.length));
      }

      transaction(() => {
        // media_tags cascades via FK ON DELETE CASCADE; explicit delete here
        // is redundant for media_tags but kept defensive against schema drift.
        mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
        media.deleteMediaItem.run(input.mediaId);
        appendAuditEntry({
          actionType: 'delete_curated_media',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: 'media_item',
          entityId: input.mediaId,
          metadata: { mediaType: row.media_type, sourceFilename: row.source_filename },
        });
      });

      // Storage deletes after the transaction commits. A failed delete
      // leaves orphan S3 keys (hidden behind URL versioning); operators
      // can sweep periodically. We do not roll back the DB transaction
      // for storage failures because the row is already gone.
      const seen = new Set<string>();
      for (const key of keysToDelete) {
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await storage.delete(key);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`curatorMediaService.deleteMedia: storage.delete(${key}) failed: ${(err as Error).message}`);
        }
      }

      return { mediaId: input.mediaId };
    },

    getMediaItem(mediaId: string): CuratorMediaListItem | null {
      const row = runSqliteRead('getCuratorMediaItemById', () =>
        media.getCuratorMediaItemById.get(mediaId),
      ) as MediaItemRow | undefined;
      if (!row) return null;
      const tagPairs = queryCuratorMediaTags([mediaId]);
      const thumbnailUrl =
        row.media_type === 'photo'
          ? storage.constructURL(row.s3_key_thumb ?? '')
          : (row.thumbnail_url ?? '');
      // listCuratorMedia query also drives uploaded_at; here we don't have
      // it cheaply without another query. The list/edit consumers don't
      // currently render uploaded_at on the edit page, so leaving it as an
      // empty string is acceptable. If that changes, extend
      // getCuratorMediaItemById to SELECT uploaded_at as well.
      return {
        mediaId: row.id,
        mediaType: row.media_type,
        caption: row.caption,
        uploadedAt: '',
        thumbnailUrl,
        tags: tagPairs.map((p) => p.tag_display),
      };
    },

    listMedia(input: CuratorMediaListInput): CuratorMediaListResult {
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.max(1, Math.min(200, Math.floor(input.pageSize)));
      const offset = (page - 1) * pageSize;

      let rows: MediaListRow[];
      let total: number;
      if (input.tagFilter) {
        const tagFilter = input.tagFilter.toLowerCase();
        if (!tagFilter.startsWith('#')) {
          throw new ValidationError(`tagFilter must start with '#': got "${input.tagFilter}"`);
        }
        rows = runSqliteRead('listCuratorMediaByTag', () =>
          media.listCuratorMediaByTag.all(tagFilter, pageSize, offset),
        ) as MediaListRow[];
        const cnt = runSqliteRead('countCuratorMediaByTag', () =>
          media.countCuratorMediaByTag.get(tagFilter),
        ) as CountRow | undefined;
        total = cnt?.n ?? 0;
      } else {
        rows = runSqliteRead('listCuratorMedia', () =>
          media.listCuratorMedia.all(pageSize, offset),
        ) as MediaListRow[];
        const cnt = runSqliteRead('countCuratorMedia', () =>
          media.countCuratorMedia.get(),
        ) as CountRow | undefined;
        total = cnt?.n ?? 0;
      }

      const ids = rows.map((r) => r.id);
      const tagPairs = queryCuratorMediaTags(ids);
      const tagsById = new Map<string, string[]>();
      for (const id of ids) tagsById.set(id, []);
      for (const pair of tagPairs) {
        const arr = tagsById.get(pair.media_id);
        if (arr) arr.push(pair.tag_display);
      }

      const items: CuratorMediaListItem[] = rows.map((r) => ({
        mediaId: r.id,
        mediaType: r.media_type,
        caption: r.caption,
        uploadedAt: r.uploaded_at,
        thumbnailUrl:
          r.media_type === 'photo'
            ? storage.constructURL(r.s3_key_thumb ?? '')
            : (r.thumbnail_url ?? ''),
        tags: tagsById.get(r.id) ?? [],
      }));

      return { items, total, page, pageSize };
    },
  };
}
