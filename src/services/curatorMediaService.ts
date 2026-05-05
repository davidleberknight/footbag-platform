import { randomUUID } from 'crypto';
import path from 'path';
import { countGalleryItemsByCriteria, media, mediaTags as mediaTagsDb, queryCuratorMediaTags, transaction } from '../db/db';
import { detectImageType } from '../lib/imageProcessing';
import {
  detectVideoFormat,
  transcodeCuratorVideo,
  type TranscodedVideo,
} from '../lib/videoProcessing';
import { Semaphore } from '../lib/semaphore';
import { MediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import {
  verifyExternalVideoUrl,
  type VideoVerifyResult,
  type VideoPlatform,
} from '../lib/videoUrlVerifier';
import {
  validateUrlSidecarData,
  deriveUrlSidecarFilename,
  formatUrlSidecarJson,
  writeUrlSidecarFile,
  readUrlSidecarFile,
  deleteUrlSidecarFile,
  resolveSidecarForRow,
  UrlSidecarValidationError,
  type UrlSidecarData,
  type WriteUrlSidecarResult,
} from '../lib/curatorUrlSidecar';
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

// Test seam: integration tests inject a fake URL verifier so the suite
// runs without hitting real youtube.com/vimeo.com oEmbed endpoints.
type VideoUrlVerifier = (
  url: string,
  platform: VideoPlatform,
) => Promise<VideoVerifyResult>;
let videoUrlVerifierOverrideForTests: VideoUrlVerifier | null = null;
export function setVideoUrlVerifierForTests(impl: VideoUrlVerifier): void {
  videoUrlVerifierOverrideForTests = impl;
}
export function resetVideoUrlVerifierForTests(): void {
  videoUrlVerifierOverrideForTests = null;
}

// Test seam: integration tests inject a temp `/curated/` directory so
// sidecar writes don't pollute the repo. Controllers construct the
// service without passing `curatedRootDir`; in production it falls
// through to `<repo-root>/curated`.
let curatedRootDirOverrideForTests: string | null = null;
export function setCuratedRootDirForTests(dir: string): void {
  curatedRootDirOverrideForTests = dir;
}
export function resetCuratedRootDirForTests(): void {
  curatedRootDirOverrideForTests = null;
}

// Curator URL-ref categories map 1:1 to subdirectories under /curated/.
// The set is discovered at runtime (no allowlist) so admins can introduce
// new categories by creating a new subdirectory or by typing a new name in
// the upload form. Category names must be filesystem-safe and consistent
// with the existing `freestyle_tricks` convention: lowercase letters,
// digits, underscores. (No hyphens to avoid collision with hyphenated
// trick slugs in the same namespace; no slashes/dots to avoid path traps.)
const CATEGORY_NAME_PATTERN = /^[a-z0-9_]+$/;

export function isValidCategoryName(value: string): boolean {
  return CATEGORY_NAME_PATTERN.test(value);
}

// Lists subdirectories under the curated root, sorted, for the admin UI's
// "tick an existing category" picker. Used by `getUpload` in the controller
// at form-render time. Returns an empty array if the dir is missing.
export async function listExistingCuratorCategories(curatedRootDir: string): Promise<string[]> {
  const fsp = await import('fs/promises');
  let entries;
  try {
    entries = await fsp.readdir(curatedRootDir, { withFileTypes: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export interface CuratorMediaServiceDeps {
  storage: MediaStorageAdapter;
  imageProcessor: ImageProcessingAdapter;
  videoTranscoder?: (buf: Buffer) => Promise<TranscodedVideo>;
  // Test seam: override system-member resolution. Default reads from DB.
  findSystemMemberId?: () => string | null;
  // Test seam: override the URL verifier. Defaults to the live oEmbed
  // verifier for production. Tests can also use the module-level
  // `setVideoUrlVerifierForTests` setter if they cannot pass deps.
  videoUrlVerifier?: VideoUrlVerifier;
  // Test seam: override the curated-files root. Defaults to
  // `<process.cwd()>/curated`, matching the operator-run seeder.
  curatedRootDir?: string;
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

export interface CuratorUrlReferenceInput {
  adminMemberId: string;
  category: string;
  videoUrl: string;
  videoPlatform: 'youtube' | 'vimeo';
  primarySlug: string;
  title: string | null;
  creator: string | null;
  sourceId: string | null;
  tier: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  // User-supplied tags. Must NOT include #curated (auto-prepended by the
  // seeder). Trick-slug, #freestyle, #trick, #demo, #net, etc. all live here.
  tags: string[];
}

export interface CuratorUrlReferenceResult {
  filename: string;
  filePath: string;
  overwritten: boolean;
  category: string;
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

// Gallery-editing tag pattern (per docs/USER_STORIES.md §1.1): leading '#'
// then alphanumeric + underscores only, max 100 chars. Unlike validateTags
// this DOES allow `#curated` (the existing curated-freestyle-tricks gallery
// uses it as a criteria tag).
const GALLERY_TAG_PATTERN = /^#[a-z0-9_]{1,99}$/;

function validateGalleryTag(tag: string, role: 'criteria' | 'exclude'): void {
  if (!GALLERY_TAG_PATTERN.test(tag)) {
    throw new ValidationError(
      `${role} tag must be lowercase '#' + alphanumeric/underscore (max 100 chars): got "${tag}"`,
    );
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
  // URL-ref sidecar fields (only honored when the row is sidecar-backed,
  // i.e. video_platform IN ('youtube','vimeo')). The service merges these
  // into the sidecar JSON; ignored on DB-direct rows. `creator`/`sourceId`/
  // `tier` accept null to clear the field; absent (undefined) leaves the
  // existing sidecar value alone. `startSeconds`/`endSeconds` follow the
  // same rule.
  creator?: string | null;
  sourceId?: string | null;
  tier?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  thumbnailUrl?: string | null;
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
  videoPlatform: string | null;
  videoId: string | null;
  videoUrl: string | null;
  // Sidecar-only fields. Populated by getMediaItem when the row is
  // URL-reference-backed (videoPlatform IN ('youtube','vimeo')) and the
  // sidecar file is present on disk; null otherwise. listMedia leaves
  // these null to avoid 94+ filesystem reads per page render — the edit
  // form is the only consumer that needs them.
  creator: string | null;
  sourceId: string | null;
  tier: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface CuratorMediaListResult {
  items: CuratorMediaListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// FH-owned named gallery, for the admin gallery list/edit UX
// (/admin/curator/galleries and /admin/curator/galleries/:id/edit).

export type GallerySortOrderValue = 'upload_desc' | 'upload_asc' | 'caption_asc';

export const GALLERY_SORT_ORDER_VALUES: readonly GallerySortOrderValue[] =
  ['upload_desc', 'upload_asc', 'caption_asc'] as const;

export const GALLERY_NAME_MAX_LEN = 150;
export const GALLERY_DESCRIPTION_MAX_LEN = 1000;

export interface CuratorGalleryEditView {
  id: string;
  name: string;
  description: string;
  sortOrder: GallerySortOrderValue;
  criteriaTags: string[];   // tag-display strings e.g. '#curated'
  excludeTags: string[];
}

export interface CuratorGallerySummary extends CuratorGalleryEditView {
  itemCount: number;
}

export interface CuratorGalleryUpdates {
  name: string;
  description: string;
  // Accepted as a free-form string from HTTP forms; the service validates
  // it against GALLERY_SORT_ORDER_VALUES and throws ValidationError on a
  // bad value. Controllers should pass form input through as-is.
  sortOrder: string;
  criteriaTags: string[];
  excludeTags: string[];
}

export interface CuratorGalleryUpdateInput {
  adminMemberId: string;
  galleryId: string;
  updates: CuratorGalleryUpdates;
}

interface MediaItemRow {
  id: string;
  uploader_member_id: string;
  media_type: 'photo' | 'video';
  caption: string | null;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
  video_platform: string | null;
  video_id: string | null;
  video_url: string | null;
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
  video_platform: string | null;
  video_id: string | null;
  video_url: string | null;
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
  const videoUrlVerifier =
    deps.videoUrlVerifier ?? videoUrlVerifierOverrideForTests ?? verifyExternalVideoUrl;
  const curatedRootDir =
    deps.curatedRootDir ??
    curatedRootDirOverrideForTests ??
    path.resolve(process.cwd(), 'curated');

  function resolveSystemMemberIdOrThrow(): string {
    const id = findSystemMemberId();
    if (!id) {
      throw new Error('Configuration error: no system member row found (is_system=1)');
    }
    return id;
  }

  // Single source of truth for list/edit thumbnail URL resolution.
  // YouTube URL-ref items are stored with thumbnail_url=NULL because the
  // thumbnail is derivable from the video id at render time (DD §6.8);
  // the seeder rejects any sidecar that supplies one. Without this branch
  // the list view would render an empty <img src=""> for the 94 freestyle
  // tricks corpus.
  function deriveListThumbnail(row: {
    media_type: 'photo' | 'video';
    s3_key_thumb: string | null;
    video_platform: string | null;
    video_id: string | null;
    thumbnail_url: string | null;
  }): string {
    if (row.media_type === 'photo') {
      return storage.constructURL(row.s3_key_thumb ?? '');
    }
    if (
      row.video_platform === 'youtube' &&
      row.video_id &&
      (!row.thumbnail_url || row.thumbnail_url === '')
    ) {
      return `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`;
    }
    return row.thumbnail_url ?? '';
  }

  return {
    // Lists existing /curated/{category}/ subdirectories for the admin
    // upload form's category picker. Sorted, ENOENT-tolerant. Lives on the
    // service so the controller doesn't need filesystem layout knowledge.
    listExistingCategories(): Promise<string[]> {
      return listExistingCuratorCategories(curatedRootDir);
    },

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

    async uploadUrlReference(
      input: CuratorUrlReferenceInput,
    ): Promise<CuratorUrlReferenceResult> {
      validateCaption(input.title);
      validateTags(input.tags);

      if (input.videoPlatform !== 'youtube' && input.videoPlatform !== 'vimeo') {
        throw new ValidationError('Choose YouTube or Vimeo for the video platform.');
      }
      if (!isValidCategoryName(input.category)) {
        throw new ValidationError(
          `Category name must be lowercase letters, digits, or underscores: got ${JSON.stringify(input.category)}.`,
        );
      }
      if (!input.videoUrl || !/^https?:\/\//.test(input.videoUrl)) {
        throw new ValidationError('Video URL must start with http:// or https://.');
      }

      // Authoritative availability check (DD §6.8). YouTube and Vimeo
      // both serve HTTP 200 HTML for removed/private videos; oEmbed
      // returns non-200 for the same and is the only reliable signal.
      const verify = await videoUrlVerifier(input.videoUrl, input.videoPlatform);
      if (!verify.ok) {
        throw new ValidationError(
          `Video is not available at the platform (oEmbed status ${verify.status}). Drop or rehost the URL.`,
        );
      }

      // Vimeo: thumbnail not derivable from video id, so we pull it
      // from the oEmbed body and persist on the sidecar.
      // YouTube: thumbnail is derived at render time from the video id;
      // sidecars MUST omit thumbnailUrl.
      let thumbnailUrl: string | null = null;
      if (input.videoPlatform === 'vimeo') {
        const t = (verify.body as { thumbnail_url?: unknown } | undefined)?.thumbnail_url;
        if (typeof t === 'string' && t.startsWith('https://')) {
          thumbnailUrl = t;
        } else {
          throw new ValidationError(
            'Vimeo oEmbed did not return a usable thumbnail_url. Cannot persist sidecar.',
          );
        }
      }

      const sidecarData: UrlSidecarData = {
        videoUrl: input.videoUrl,
        videoPlatform: input.videoPlatform,
        title: input.title,
        creator: input.creator,
        sourceId: input.sourceId,
        tier: input.tier,
        thumbnailUrl,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        // Tags are written verbatim (sorted, deduplicated) so a future
        // edit operates on the same set the user submitted. The seeder
        // prepends `#curated` at DB-load time, not at sidecar-write time.
        tags: Array.from(new Set(input.tags)).sort(),
      };
      try {
        validateUrlSidecarData(sidecarData);
      } catch (err) {
        if (err instanceof UrlSidecarValidationError) {
          throw new ValidationError(err.message);
        }
        throw err;
      }

      let filename: string;
      try {
        filename = deriveUrlSidecarFilename(input.primarySlug, input.videoUrl);
      } catch (err) {
        if (err instanceof UrlSidecarValidationError) {
          throw new ValidationError(err.message);
        }
        throw err;
      }

      const categoryDir = path.join(curatedRootDir, input.category);
      // Auto-create the category dir on first use. The admin form lets
      // operators type a new category name; the directory is created at
      // first upload to that name. Existing categories are no-op (recursive
      // mkdir tolerates already-present dirs).
      const fsp = await import('fs/promises');
      await fsp.mkdir(categoryDir, { recursive: true });
      const json = formatUrlSidecarJson(sidecarData);
      const result: WriteUrlSidecarResult = await writeUrlSidecarFile(categoryDir, filename, json);

      // Audit-only side effect (no DB row written here). The seeder is
      // the only path that writes media_items; running the seeder after
      // a sidecar write surfaces the new entry in the platform DB.
      appendAuditEntry({
        actionType: 'upload_curated_url_reference',
        category: 'media',
        actorType: 'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'curated_sidecar',
        entityId: filename,
        metadata: {
          category: input.category,
          videoPlatform: input.videoPlatform,
          videoUrl: input.videoUrl,
          overwritten: result.overwritten,
        },
      });

      return {
        filename: result.filename,
        filePath: result.filePath,
        overwritten: result.overwritten,
        category: input.category,
      };
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
      const isSidecarBacked = row.video_platform === 'youtube' || row.video_platform === 'vimeo';

      // Sidecar-backed branch: rewrite the JSON under /curated/ first, then
      // update the DB inline so the list view reflects the change without
      // waiting for the next seeder run. /curated/ is the source of truth;
      // the DB write is a UX optimization that produces the same state the
      // seeder would on its next run.
      let auditEntityId = input.mediaId;
      let auditActionType: 'edit_curated_media' | 'edit_curated_url_reference' = 'edit_curated_media';
      if (isSidecarBacked) {
        const sidecarFilePath = await resolveSidecarForRow(curatedRootDir, row);
        if (!sidecarFilePath) {
          throw new Error(
            `editMedia: sidecar file not found for media ${input.mediaId} ` +
            `(video_platform=${row.video_platform}, video_url=${row.video_url}). ` +
            `The DB row is sidecar-backed but no matching file under ${curatedRootDir}.`,
          );
        }

        const existing = await readUrlSidecarFile(sidecarFilePath);
        const updated: UrlSidecarData = { ...existing };
        if (input.caption !== undefined) {
          // Caption is the user-facing equivalent of sidecar.title for
          // URL-ref items. Store empty string as null to keep the seeder
          // happy (it accepts null/missing title; an empty string round-trip
          // would write `"title": ""` and re-import as null anyway).
          updated.title = input.caption && input.caption.length > 0 ? input.caption : null;
        }
        if (input.tags !== undefined) {
          // Sidecars never carry #curated; the seeder auto-prepends it on
          // each run. Filter defensively in case a caller passes it through
          // (validateTags already rejects, but keep the branch explicit).
          const filtered = input.tags.filter((t) => t.toLowerCase() !== '#curated');
          updated.tags = Array.from(new Set(filtered)).sort();
        }
        // URL-ref-only fields. `undefined` leaves the existing value alone;
        // `null` clears the field (seeder + validateUrlSidecarData treat
        // missing and null equivalently for optional fields, so the round-
        // trip via formatUrlSidecarJson omits cleared keys).
        if (input.creator !== undefined) updated.creator = input.creator;
        if (input.sourceId !== undefined) updated.sourceId = input.sourceId;
        if (input.tier !== undefined) updated.tier = input.tier;
        if (input.startSeconds !== undefined) updated.startSeconds = input.startSeconds;
        if (input.endSeconds !== undefined) updated.endSeconds = input.endSeconds;
        if (input.thumbnailUrl !== undefined) updated.thumbnailUrl = input.thumbnailUrl;

        try {
          validateUrlSidecarData(updated);
        } catch (err) {
          if (err instanceof UrlSidecarValidationError) {
            throw new ValidationError(err.message);
          }
          throw err;
        }

        const sidecarDir = path.dirname(sidecarFilePath);
        const sidecarFilename = path.basename(sidecarFilePath);
        await writeUrlSidecarFile(sidecarDir, sidecarFilename, formatUrlSidecarJson(updated));

        auditActionType = 'edit_curated_url_reference';
        auditEntityId = sidecarFilename;
      }

      // Dedupe before re-inserting so a caller passing the same tag twice
      // doesn't trip the UNIQUE(media_id, tag_id) constraint on media_tags.
      const dedupedTags =
        input.tags !== undefined ? Array.from(new Set(input.tags)) : undefined;

      transaction(() => {
        if (input.caption !== undefined) {
          media.updateCuratorMediaCaption.run(input.caption, now, input.mediaId);
        }
        if (dedupedTags !== undefined) {
          mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
          applyTagsForCurator(input.mediaId, dedupedTags, now);
        }
        appendAuditEntry({
          actionType: auditActionType,
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: isSidecarBacked ? 'curated_sidecar' : 'media_item',
          entityId: auditEntityId,
          metadata: {
            mediaId: input.mediaId,
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

      const isSidecarBacked = row.video_platform === 'youtube' || row.video_platform === 'vimeo';

      // For sidecar-backed rows (URL-ref): no S3 keys to clean up; resolve
      // the sidecar path now so we can unlink the file after the DB
      // transaction commits.
      // For DB-direct rows (photo, s3 video): collect storage keys.
      let sidecarFilePath: string | null = null;
      let sidecarFilename: string | null = null;
      const keysToDelete: string[] = [];
      if (isSidecarBacked) {
        sidecarFilePath = await resolveSidecarForRow(curatedRootDir, row);
        if (sidecarFilePath) {
          sidecarFilename = path.basename(sidecarFilePath);
        }
      } else {
        if (row.s3_key_thumb) keysToDelete.push(row.s3_key_thumb);
        if (row.s3_key_display) keysToDelete.push(row.s3_key_display);
        if (row.video_id) keysToDelete.push(row.video_id);
        if (row.thumbnail_url && row.thumbnail_url.startsWith('/media/')) {
          keysToDelete.push(row.thumbnail_url.slice('/media/'.length));
        }
      }

      transaction(() => {
        // media_tags cascades via FK ON DELETE CASCADE; explicit delete here
        // is redundant for media_tags but kept defensive against schema drift.
        mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
        media.deleteMediaItem.run(input.mediaId);
        appendAuditEntry({
          actionType: isSidecarBacked ? 'delete_curated_url_reference' : 'delete_curated_media',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: isSidecarBacked ? 'curated_sidecar' : 'media_item',
          entityId: isSidecarBacked && sidecarFilename ? sidecarFilename : input.mediaId,
          metadata: {
            mediaId: input.mediaId,
            mediaType: row.media_type,
            sourceFilename: row.source_filename,
            videoPlatform: row.video_platform,
            videoUrl: row.video_url,
          },
        });
      });

      // Filesystem + storage cleanup after the DB transaction commits.
      // Best-effort: a failed unlink/delete leaves an orphan but does not
      // roll back the DB. The row is already gone; operators can sweep.
      if (isSidecarBacked && sidecarFilePath) {
        try {
          await deleteUrlSidecarFile(sidecarFilePath);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`curatorMediaService.deleteMedia: sidecar unlink(${sidecarFilePath}) failed: ${(err as Error).message}`);
        }
      }

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

    async getMediaItem(mediaId: string): Promise<CuratorMediaListItem | null> {
      const row = runSqliteRead('getCuratorMediaItemById', () =>
        media.getCuratorMediaItemById.get(mediaId),
      ) as MediaItemRow | undefined;
      if (!row) return null;
      const tagPairs = queryCuratorMediaTags([mediaId]);

      // For sidecar-backed rows, read the sidecar file to surface the
      // URL-ref-only fields (creator/sourceId/tier/clip range) for the
      // edit form. Best-effort: a missing or malformed sidecar leaves the
      // fields null — the controller can still render the form with
      // caption + tags, and the operator can re-upload to repair.
      let creator: string | null = null;
      let sourceId: string | null = null;
      let tier: string | null = null;
      let startSeconds: number | null = null;
      let endSeconds: number | null = null;
      if (row.video_platform === 'youtube' || row.video_platform === 'vimeo') {
        const sidecarFilePath = await resolveSidecarForRow(curatedRootDir, row);
        if (sidecarFilePath) {
          try {
            const sidecar = await readUrlSidecarFile(sidecarFilePath);
            creator = sidecar.creator ?? null;
            sourceId = sidecar.sourceId ?? null;
            tier = sidecar.tier ?? null;
            startSeconds = sidecar.startSeconds ?? null;
            endSeconds = sidecar.endSeconds ?? null;
          } catch {
            // Malformed sidecar; leave fields null.
          }
        }
      }

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
        thumbnailUrl: deriveListThumbnail(row),
        tags: tagPairs.map((p) => p.tag_display),
        videoPlatform: row.video_platform,
        videoId: row.video_id,
        videoUrl: row.video_url,
        creator,
        sourceId,
        tier,
        startSeconds,
        endSeconds,
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
        thumbnailUrl: deriveListThumbnail(r),
        tags: tagsById.get(r.id) ?? [],
        videoPlatform: r.video_platform,
        videoId: r.video_id,
        videoUrl: r.video_url,
        // Sidecar-only fields are not populated for list rendering; only
        // getMediaItem reads the sidecar (one row, edit form). Bulk reads
        // would otherwise re-parse 94+ JSON files per page.
        creator: null,
        sourceId: null,
        tier: null,
        startSeconds: null,
        endSeconds: null,
      }));

      return { items, total, page, pageSize };
    },

    // ── Admin gallery-edit surface ──────────────────────────────────────
    // Lists every FH-owned named gallery with its criteria + exclude tag
    // sets and item count. Drives the /admin/curator/galleries index.
    listOwnedGalleries(): CuratorGallerySummary[] {
      return runSqliteRead('listOwnedGalleries', () => {
        const rows = media.listFhNamedGalleries.all() as Array<{
          id: string;
          name: string;
          description: string;
          sort_order: GallerySortOrderValue;
        }>;
        return rows.map((g) => {
          const criteriaTagRows = media.listFhNamedGalleryTags.all(g.id) as Array<{
            id: string;
            tag_display: string;
          }>;
          const excludeTagRows = media.listFhNamedGalleryExcludeTags.all(g.id) as Array<{
            id: string;
            tag_display: string;
          }>;
          const criteriaTagIds = criteriaTagRows.map((t) => t.id);
          const excludeTagIds = excludeTagRows.map((t) => t.id);
          return {
            id: g.id,
            name: g.name,
            description: g.description,
            sortOrder: g.sort_order,
            criteriaTags: criteriaTagRows.map((t) => t.tag_display),
            excludeTags: excludeTagRows.map((t) => t.tag_display),
            itemCount: countGalleryItemsByCriteria(criteriaTagIds, excludeTagIds),
          };
        });
      });
    },

    // Loads a single FH-owned gallery's editable fields. Returns the
    // current name, description, sort_order, criteria tags, and exclude
    // tags. Throws NotFoundError if the gallery does not exist or is not
    // FH-owned (per the SQL filter in getFhNamedGalleryById, this also
    // guards against member-owned galleries leaking into the admin UX).
    getGalleryForEdit(galleryId: string): CuratorGalleryEditView {
      return runSqliteRead('getGalleryForEdit', () => {
        const g = media.getFhNamedGalleryById.get(galleryId) as
          | { id: string; name: string; description: string; sort_order: GallerySortOrderValue }
          | undefined;
        if (!g) {
          throw new NotFoundError(`gallery ${galleryId} not found`);
        }
        const criteriaTagRows = media.listFhNamedGalleryTags.all(galleryId) as Array<{
          id: string;
          tag_display: string;
        }>;
        const excludeTagRows = media.listFhNamedGalleryExcludeTags.all(galleryId) as Array<{
          id: string;
          tag_display: string;
        }>;
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          sortOrder: g.sort_order,
          criteriaTags: criteriaTagRows.map((t) => t.tag_display),
          excludeTags: excludeTagRows.map((t) => t.tag_display),
        };
      });
    },

    // Applies an update to an FH-owned gallery in a single transaction:
    // metadata UPDATE plus DELETE-then-INSERT on both criteria-tag and
    // exclude-tag sets. Idempotent on no-op updates. Throws
    // ValidationError on bad input (empty name, oversize fields, invalid
    // sort_order, invalid tag pattern, empty criteria-tag set, or
    // criteria/exclude overlap). Throws NotFoundError if the gallery
    // does not exist or is not FH-owned.
    updateGallery(input: CuratorGalleryUpdateInput): void {
      const { adminMemberId, galleryId, updates } = input;

      // Validate up front so a bad input never opens a transaction.
      const name = updates.name.trim();
      if (!name) {
        throw new ValidationError('Gallery name is required.');
      }
      if (name.length > GALLERY_NAME_MAX_LEN) {
        throw new ValidationError(
          `Gallery name must be ${GALLERY_NAME_MAX_LEN} characters or fewer.`,
        );
      }
      const description = (updates.description ?? '').trim();
      if (description.length > GALLERY_DESCRIPTION_MAX_LEN) {
        throw new ValidationError(
          `Gallery description must be ${GALLERY_DESCRIPTION_MAX_LEN} characters or fewer.`,
        );
      }
      const validSortOrders: readonly string[] = GALLERY_SORT_ORDER_VALUES;
      if (!validSortOrders.includes(updates.sortOrder)) {
        throw new ValidationError(
          `Gallery sort order must be one of: ${GALLERY_SORT_ORDER_VALUES.join(', ')}.`,
        );
      }
      const sortOrder = updates.sortOrder as GallerySortOrderValue;
      if (updates.criteriaTags.length === 0) {
        throw new ValidationError(
          'A gallery must declare at least one criteria tag (otherwise it would render empty).',
        );
      }
      const seenCriteria = new Set<string>();
      for (const tag of updates.criteriaTags) {
        validateGalleryTag(tag, 'criteria');
        if (seenCriteria.has(tag)) {
          throw new ValidationError(`Duplicate criteria tag: ${tag}`);
        }
        seenCriteria.add(tag);
      }
      const seenExclude = new Set<string>();
      for (const tag of updates.excludeTags) {
        validateGalleryTag(tag, 'exclude');
        if (seenExclude.has(tag)) {
          throw new ValidationError(`Duplicate exclude tag: ${tag}`);
        }
        if (seenCriteria.has(tag)) {
          throw new ValidationError(
            `Tag "${tag}" cannot be both a criteria tag and an exclude tag.`,
          );
        }
        seenExclude.add(tag);
      }

      // Confirm the gallery exists and is FH-owned before writing. The
      // getFhNamedGalleryById prepared statement filters on is_system=1.
      const existing = media.getFhNamedGalleryById.get(galleryId) as
        | { id: string }
        | undefined;
      if (!existing) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      const now = new Date().toISOString();

      transaction(() => {
        media.updateMemberGalleryMetadata.run(
          name,
          description,
          sortOrder,
          now,
          adminMemberId,
          galleryId,
        );

        media.deleteAllMemberGalleryTags.run(galleryId);
        for (const tag of updates.criteriaTags) {
          const existingTag = mediaTagsDb.findTagByNormalized.get(tag) as
            | { id: string }
            | undefined;
          let tagId: string;
          if (existingTag) {
            tagId = existingTag.id;
          } else {
            tagId = newTagId();
            mediaTagsDb.insertTag.run(tagId, now, now, tag, tag);
          }
          media.insertMemberGalleryTag.run(galleryId, tagId, now, adminMemberId);
        }

        media.deleteAllMemberGalleryExcludeTags.run(galleryId);
        for (const tag of updates.excludeTags) {
          const existingTag = mediaTagsDb.findTagByNormalized.get(tag) as
            | { id: string }
            | undefined;
          let tagId: string;
          if (existingTag) {
            tagId = existingTag.id;
          } else {
            tagId = newTagId();
            mediaTagsDb.insertTag.run(tagId, now, now, tag, tag);
          }
          media.insertMemberGalleryExcludeTag.run(galleryId, tagId, now, adminMemberId);
        }
      });
    },
  };
}
