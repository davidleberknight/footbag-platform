import { randomUUID } from 'crypto';
import { media, mediaTags as mediaTagsDb, transaction } from '../db/db';
import { detectImageType } from '../lib/imageProcessing';
import {
  detectVideoFormat,
  transcodeCuratorVideo,
  type TranscodedVideo,
} from '../lib/videoProcessing';
import { Semaphore } from '../lib/semaphore';
import { MediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { ValidationError } from './serviceErrors';
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
  caption: string | null;
  tags: string[];
}

export interface CuratorVideoInput {
  adminMemberId: string;
  videoBuffer: Buffer;
  posterBuffer: Buffer;
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

function validateTags(tags: string[]): void {
  for (const tag of tags) {
    if (!tag.startsWith('#')) {
      throw new ValidationError(`Tag must start with '#': got "${tag}"`);
    }
    if (tag !== tag.toLowerCase()) {
      throw new ValidationError(`Tag must be lowercase: got "${tag}"`);
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
        );
        applyTags(mediaId, input.tags, now);
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
        );
        applyTags(mediaId, input.tags, now);
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
  };
}
