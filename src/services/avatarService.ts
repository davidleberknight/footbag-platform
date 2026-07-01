/**
 * AvatarService -- member avatar upload, processing, and atomic replacement.
 *
 * Owns:
 *   - Avatar input validation (JPEG/PNG magic-byte detection, 5 MB cap)
 *   - Processing to thumb + display variants via the image-processing adapter
 *   - Atomic avatar swap: prior avatar row deleted and the new one inserted,
 *     tagged `#by_<slug>`, and audited in one transaction
 *
 * Does not own:
 *   - Image transformation internals (ImageProcessingAdapter)
 *   - Storage/CDN mechanics (MediaStorageAdapter)
 *   - Non-avatar member media (CuratorMediaService) or avatar rendering
 *     (profile shaping reads the keys)
 *
 * Required patterns:
 *   - One avatar per member (partial UNIQUE index `ux_media_avatar_per_member`);
 *     replacement is delete-then-insert inside the transaction.
 *   - Storage puts happen BEFORE the transaction opens; a failed put means
 *     the DB never changes.
 *   - Deterministic storage keys per member so caches replace in place; the
 *     fresh media id is the cache-bust handle.
 *   - Per-member upload throttle (config-tunable, admin-exempt).
 *
 * Persistence:
 *   media_items, media_tags, tags, audit_entries.
 *
 * Side effects:
 *   - audit_entries append (media.member_uploaded, mediaType avatar)
 *   - storage adapter puts (thumb + display)
 *
 * Service shape: factory `createAvatarService({ storage, imageProcessor })`
 * with the `getDefaultAvatarService()` default wiring; tests inject stubs.
 */
import { randomUUID } from 'crypto';
import { media, mediaTags as mediaTagsDb, transaction, ExistingAvatarRow } from '../db/db';
import { detectImageType } from '../lib/imageProcessing';
import { MediaStorageAdapter, getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter, getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { RateLimitedError, ValidationError } from './serviceErrors';
import { rejectImageAsValidation } from './imageRejection';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { runSqliteRead } from './sqliteRetry';
import { appendAuditEntry } from './auditService';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// Avatars carry exactly one tag: the uploader marker `#by_<member_slug>`.
// No `#curated`, no event/club/freeform tags. The marker exists so the
// avatar surfaces in the member's own gallery via the same tag-AND match
// every other member upload uses; without it, avatars would be the only
// member-owned media that fails the personal-gallery query. Mirrors the
// FH avatar handling in scripts/seed_fh_curator.py seed_item.
const UPLOADER_TAG_PREFIX = '#by_';

export interface AvatarServiceDeps {
  storage: MediaStorageAdapter;
  imageProcessor: ImageProcessingAdapter;
}

// Default-wired factory for controllers. Test seams continue to use
// `createAvatarService(deps)` with fakes. See `getDefaultCuratorMediaService`
// for the rationale (controllers must not import adapter getters).
export function getDefaultAvatarService(): ReturnType<typeof createAvatarService> {
  return createAvatarService({
    storage: getMediaStorageAdapter(),
    imageProcessor: getImageProcessingAdapter(),
  });
}

export function createAvatarService(deps: AvatarServiceDeps) {
  const { storage, imageProcessor } = deps;
  return {
    async uploadAvatar(
      memberId: string,
      slug: string,
      fileBuffer: Buffer,
      sourceFilename: string,
      opts: { actorIsAdmin?: boolean } = {},
    ): Promise<{ thumbUrl: string }> {
      // Per-member upload throttle; admins are exempt. The controller is the
      // source of truth for the role flag, matching the gallery inputs.
      if (!opts.actorIsAdmin) {
        const max = readIntConfig('avatar_upload_rate_limit_per_hour', 10);
        const rl = rateLimitHit(`avatar-upload:${memberId}`, max, 60);
        if (!rl.allowed) {
          throw new RateLimitedError(
            `Too many avatar uploads. Try again in ${rl.retryAfterSeconds} seconds.`,
            rl.retryAfterSeconds,
          );
        }
      }
      if (fileBuffer.length > AVATAR_MAX_BYTES) {
        throw new ValidationError('File is too large. Maximum size is 5 MB.');
      }

      // Cheap reject before crossing the worker process boundary; the worker
      // re-validates as defense-in-depth.
      const imageType = detectImageType(fileBuffer);
      if (!imageType) {
        throw new ValidationError('Only JPEG and PNG images are accepted.');
      }

      const processed = await rejectImageAsValidation(imageProcessor.processAvatar(fileBuffer));

      const thumbKey = `avatars/${memberId}/thumb.jpg`;
      const displayKey = `avatars/${memberId}/display.jpg`;

      await storage.put(thumbKey, processed.thumb);
      await storage.put(displayKey, processed.display);

      const now = new Date().toISOString();
      const mediaId = randomUUID();

      // Delete old avatar (if any) and insert new one in a single transaction.
      // ON DELETE SET NULL on members.avatar_media_id handles detaching automatically.
      // ON DELETE CASCADE on media_tags.media_id wipes any prior avatar's
      // tag rows automatically as part of the deleteMediaItem.
      const uploaderTag = `${UPLOADER_TAG_PREFIX}${slug.toLowerCase()}`;
      transaction(() => {
        const existing = runSqliteRead('getExistingAvatar', () =>
          media.getExistingAvatarMediaId.get(memberId),
        ) as ExistingAvatarRow | undefined;

        if (existing) {
          media.deleteMediaItem.run(existing.id);
        }

        media.insertAvatarPhoto.run(
          mediaId, now, now,
          memberId, now,
          thumbKey, displayKey,
          processed.widthPx, processed.heightPx,
          sourceFilename,
        );

        // Single tag: `#by_<slug>`. Reuse the existing tag row if one is
        // already in the tags table (every member upload of this member
        // points at the same tag id), otherwise create it.
        const tagRow = mediaTagsDb.findTagByNormalized.get(uploaderTag) as { id: string } | undefined;
        let tagId: string;
        if (tagRow) {
          tagId = tagRow.id;
        } else {
          tagId = `tag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
          mediaTagsDb.insertTag.run(tagId, now, now, uploaderTag, uploaderTag);
        }
        const mediaTagId = `mtag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
        mediaTagsDb.insertMediaTag.run(mediaTagId, now, now, mediaId, tagId, uploaderTag);

        media.setMemberAvatar.run(mediaId, now, memberId);

        // Audit the state change inside the same transaction so a failed append
        // rolls back the whole avatar swap. Matches the member-photo path's
        // 'media.member_uploaded' taxonomy (mediaType distinguishes avatar/photo).
        appendAuditEntry({
          actionType: 'media.member_uploaded',
          category: 'media',
          actorType: 'member',
          actorMemberId: memberId,
          entityType: 'media_item',
          entityId: mediaId,
          metadata: { mediaType: 'avatar', uploaderTag },
        });
      });

      return { thumbUrl: storage.constructURL(thumbKey) };
    },
  };
}
