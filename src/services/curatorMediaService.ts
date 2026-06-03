/**
 * CuratorMediaService -- curator-attributed media uploads and named-gallery editing.
 *
 * Owns:
 *   - Admin upload, edit, delete, and list of curator photos and videos on behalf
 *     of the system member account
 *   - Magic-byte and format validation
 *   - ffmpeg curator transcode pipeline
 *   - Storage key construction matching the curator-seed layout
 *   - Auto-application of the `#curated` uploader marker
 *   - Admin and member named-gallery editing (FH-owned and member-owned
 *     `member_galleries` rows)
 *
 * Does not own:
 *   - Member-attributed uploads (MediaGalleryService)
 *
 * Required patterns:
 *   - `uploader_member_id` is always the system member id (`is_system=1`); the admin
 *     actor is recorded only in `audit_entries`.
 *   - Curator video bytes use `video_platform='s3'`; member video routes reject `s3`
 *     as a defensive boundary.
 *   - Storage keys follow `{systemMemberId}/detached/{mediaId}-...` so offline seed
 *     and admin upload produce identical row shape.
 *   - Auto-applies `#curated`; `#curated` rejected from input.
 *   - URL-reference uploads write a sidecar JSON at
 *     `/curated/{category}/<primarySlug>_<sha1(videoUrl)[:8]>.meta.json` (atomic
 *     temp + rename) and do NOT write a `media_items` row; the seeder regenerates
 *     rows from sidecars.
 *   - Photo/video uploads with a `category` additionally write the source binary
 *     plus a file-paired `<slug>.meta.json` sidecar under `/curated/{category}/`
 *     (video also writes `<slug>.poster.<ext>`); the inline `media_items` insert is
 *     the read-path UX optimization per DD §1.13.
 *   - Photo upload uses Sharp (aspect-preserving thumb, 800px-wide display, EXIF/ICC
 *     stripped); video upload uses ffmpeg curator transcode.
 *   - Magic-byte rejection for unsupported formats.
 *   - All DB writes for one upload (`media_items` + `media_tags` + `audit_entries`)
 *     land in one transaction; storage `put` calls happen BEFORE the transaction
 *     opens; if any put fails, the transaction never runs.
 *   - Async interactive admin video upload uses the `media_jobs` flow via
 *     MediaJobService; `finalizeTranscodeForJob` is the worker-side finalize.
 *   - Sidecar-backed rows (`video_platform IN ('youtube','vimeo')`): edits and
 *     deletes resolve the sidecar at runtime from `(video_platform, video_url)`,
 *     rewrite or unlink atomically, then update the DB row.
 *   - Named-gallery mutating calls require admin OR owner of the affected gallery;
 *     enforced on every call.
 *   - FH-owned gallery creation requires admin actor and explicit `suggestedId`
 *     matching `gallery_[a-z0-9_]+`. Member-owned derives id
 *     `gallery_<owner_slug>_<gallery_name_slug>` (with `_2`, `_3` suffixes on
 *     collision).
 *   - Member-owned galleries auto-prepend `#by_<owner_slug>` to validated criteria
 *     tags on every create/update; `>=1 criteria tag` invariant enforced AFTER
 *     auto-prepend; user-supplied `#by_*` tags rejected.
 *   - FH-owned writes JSON sidecar at `/curated/galleries/<slug>.json` after commit
 *     (sidecar I/O failure logged but does not roll back DB). Member-owned never
 *     touches the filesystem.
 *   - Gallery edit never mutates item tags; current-items display rows derive from
 *     criteria/exclude tags via `listGalleryItemsForDisplay`.
 *   - `createGallery` and `updateGallery` accept `externalLinks`; each URL passes
 *     `validateExternalUrl` (DD §3.17) inside the same transaction. Per-gallery cap
 *     `config.galleryMaxExternalLinks`.
 *   - FH-owned sidecar writes gated on `config.allowCuratedSidecarWrites` (dev only).
 *   - Member-gallery form uploads carry user-supplied `uploadTags` (never
 *     auto-stamped from gallery criteria); auto-applied tags are exactly
 *     `#by_<slug>` (member) and `#curated` (FH-owned).
 *
 * Persistence:
 *   media_items, media_tags, tags, audit_entries, members, member_galleries,
 *   member_gallery_tags, member_gallery_exclude_tags. Filesystem:
 *   `/curated/{category}/*.meta.json` (URL-reference sidecars), file-paired
 *   `<slug>.{jpg,png,mp4,webm,mov}` + sibling `<slug>.meta.json` + optional
 *   `<slug>.poster.<ext>`, `/curated/galleries/<slug>.json` (FH gallery sidecars;
 *   source of truth).
 *
 * Side effects:
 *   - audit_entries append per upload or gallery mutation
 *
 * Service shape: factory `createCuratorMediaService(deps)`. Deps include
 * MediaStorageAdapter, ImageProcessingAdapter, and VideoTranscodingAdapter (the
 * factory pattern allows test injection).
 */
import { randomUUID } from 'crypto';
import path from 'path';
import { countGalleryItemsByCriteria, listGalleryItemsForDisplay, media, mediaTags as mediaTagsDb, queryCuratorMediaTags, tagStats, transaction, type MediaJobRow } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { detectImageType } from '../lib/imageProcessing';
import { detectVideoFormat, type TranscodedVideo } from '../lib/videoProcessing';
import { Semaphore } from '../lib/semaphore';
import { MediaStorageAdapter, getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter, getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import {
  getVideoTranscodingAdapter,
  type VideoTranscodingAdapter,
} from '../adapters/videoTranscodingAdapter';
import {
  parseVimeoVideoId,
  parseYouTubeVideoId,
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
import {
  GALLERY_SORT_ORDER_VALUES,
  GALLERY_NAME_MAX_LEN,
  GALLERY_DESCRIPTION_MAX_LEN,
  type GallerySortOrderValue,
  validateGallerySidecarData,
  formatGallerySidecarJson,
  writeGallerySidecarFile,
  deleteGallerySidecarFile,
  deriveGallerySidecarPath,
  GallerySidecarValidationError,
  type GallerySidecarData,
} from '../lib/curatorGallerySidecar';
import { writeSidecar } from '../lib/curatorSidecar';
import { promises as fsp } from 'fs';
import { validateExternalUrl } from '../lib/externalUrlValidator';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { hasTier1Benefits } from './tierPredicates';
import { appendAuditEntry } from './auditService';
import { runSqliteRead } from './sqliteRetry';
import { hashtagDiscoveryService } from './hashtagDiscoveryService';

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

// Sanitizes an upload's source filename into a kebab-case slug suitable
// for use as both the on-disk binary name under /curated/{category}/ and
// the media_items.source_filename DB value. Strips any path components
// (defends against `../` traversal hidden in the upload's own filename),
// drops the original extension, lowercases, normalizes unicode to ASCII
// where possible, and collapses non-`[a-z0-9]` runs to single hyphens.
// Falls back to `upload` if the input has no usable characters. Caller
// reattaches the format-detected extension (e.g. .mp4, .jpg).
export function deriveCuratorSlug(sourceFilename: string): string {
  const base = path.basename(sourceFilename ?? '').replace(/\.[^.]*$/, '');
  const slug = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length === 0 ? 'upload' : slug;
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
  videoTranscoder?: VideoTranscodingAdapter;
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
  // Optional. When provided, the upload is also written as a file-paired
  // sidecar pair under <curatedRootDir>/<category>/. The seeder reconciles
  // these into media_items rows on its next run, so the upload survives
  // a DB or media-store wipe. Per DD §1.13, /curated/ is the source of
  // truth; the inline storage.put + media_items insert below are the UX
  // optimization (line 575). The admin upload controller passes this field
  // in local-adapter mode and omits it in S3 mode; the curator seeder
  // (which calls in the opposite direction, /curated/ → DB+S3) always
  // omits it.
  category?: string;
  // Optional user-supplied external URL (e.g. link to creator page,
  // source article). Validated at the service boundary per DD §3.17 via
  // externalUrlValidator; persisted to media_items.external_url and
  // emitted on the file-paired sidecar.
  externalUrl?: string | null;
}

export interface CuratorVideoInput {
  adminMemberId: string;
  videoBuffer: Buffer;
  posterBuffer: Buffer;
  sourceFilename: string;
  caption: string | null;
  tags: string[];
  // See CuratorPhotoInput.category. Same semantics; for video, the /curated/
  // write produces a binary, a sibling poster, and the meta sidecar.
  category?: string;
  // See CuratorPhotoInput.externalUrl.
  externalUrl?: string | null;
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
  // See CuratorPhotoInput.externalUrl. For url-reference items the URL
  // lives only on the sidecar (no media_items row is written here; the
  // seeder creates the row).
  externalUrl?: string | null;
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

export interface MemberPhotoInput {
  memberId: string;
  // Slug of the authenticated member. Auto-applied as `#<slug>` on
  // every member upload (the "uploader tag"; mirrors #curated for
  // curator uploads). Caller is the controller that knows the
  // session's slug.
  slug: string;
  photoBuffer: Buffer;
  sourceFilename: string;
  caption: string | null;
  tags: string[];
  // Optional user-supplied external URL (DD §3.17 vetted). Same
  // semantics as CuratorPhotoInput.externalUrl. Persisted to
  // media_items.external_url and stamped at validation time.
  externalUrl?: string | null;
}

export interface MemberVideoInput {
  memberId: string;
  slug: string;
  // YouTube or Vimeo URL; service extracts the video id and verifies
  // availability via oEmbed. Member video flow is URL-reference only
  // (no upload of bytes), per US M_Submit_Video.
  videoUrl: string;
  videoPlatform: VideoPlatform;
  caption: string | null;
  tags: string[];
  // See MemberPhotoInput.externalUrl. Optional, validated at boundary.
  externalUrl?: string | null;
}

export interface MemberUploadResult {
  mediaId: string;
  displayUrl: string;
}

// Member-self edit form's view-model shape (caption + tags + external URL).
// Sidecar / creator / tier / clip-range fields are admin-only and not
// surfaced on the member edit page.
export interface MemberMediaItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  tags: string[];
  externalUrl: string | null;
}

export interface MemberMediaEditInput {
  memberId: string;
  // Slug of the authenticated member. Used by applyTagsForMember when
  // rewriting tags so the auto-applied #by_<slug> stays consistent.
  slug: string;
  mediaId: string;
  // Three-way semantics match CuratorMediaEditInput: undefined leaves the
  // field alone, null clears, string/array sets.
  caption?: string | null;
  tags?: string[];
  externalUrl?: string | null;
}

export interface MemberMediaEditResult {
  mediaId: string;
  updatedAt: string;
}

interface SystemMemberRow {
  id: string;
}

function newMediaId(): string {
  return `media_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/**
 * Compensating-delete helper for cross-service-transaction failure.
 *
 * The upload paths (uploadPhoto, uploadVideo, uploadPhotoForMember) commit
 * storage objects to S3 / local-FS BEFORE the DB transaction so that the
 * better-sqlite3 sync transaction does not span async storage I/O (which
 * would extend wall-clock past the storage put and hold WAL locks
 * unnecessarily). If the DB transaction then throws (UNIQUE constraint,
 * FK violation, CHECK failure), the storage objects are orphaned. This
 * helper deletes the just-uploaded objects on transaction failure.
 *
 * A failure inside the compensating delete itself (network blip, adapter
 * error) is logged at warn level and otherwise swallowed: the original
 * transaction failure is the operator-actionable signal and must
 * propagate, while a residual orphan can be reconciled by the broader
 * S3 lifecycle (DD §6.8) or an operator sweep.
 */
async function compensatingStorageDelete(
  storage: MediaStorageAdapter,
  keys: string[],
): Promise<void> {
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (err) {
      logger.warn('curatorMediaService: compensating storage.delete failed; object orphaned', {
        key,
        error: (err as Error).message ?? String(err),
      });
    }
  }
}

function newTagId(): string {
  return `tag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function newMediaTagId(): string {
  return `mtag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

// Human-readable id for member-owned galleries: `gallery_<owner_slug>_<name_slug>`
// (e.g. `gallery_david_leberknight_funky_footbags`). Owner-prefixed so two
// members can both have a gallery named "Photos" without colliding. Stable
// across renames: callers re-use the existing id rather than regenerating.
// Conforms to the shared `^gallery_[a-z0-9_]+$` pattern used by FH-owned ids,
// so existing route + sidecar id validators accept it unchanged.
//
// `attempt` is the disambiguation counter used by createGallery's retry loop
// when the base id collides with an existing PK; attempt=0 yields the base
// form, attempt>=1 appends `_<attempt+1>` (e.g. `..._funky_footbags_2`).
function buildMemberGalleryId(
  ownerSlug: string,
  galleryName: string,
  attempt: number,
): string {
  const ownerNorm = ownerSlug.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const nameSlug = slugifyGalleryName(galleryName);
  const suffix = attempt > 0 ? `_${attempt + 1}` : '';
  return `gallery_${ownerNorm}_${nameSlug}${suffix}`;
}

// Lowercase alphanumeric, runs of other chars collapse to a single `_`.
// Truncated so the full id stays comfortably under typical URL limits even
// after the `gallery_<owner_slug>_` prefix and any collision suffix. Falls
// back to a short hex token if the input has no usable characters
// (pure-emoji name, etc.) so the id remains a valid `gallery_…` slug.
function slugifyGalleryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return slug.length > 0
    ? slug
    : `g${randomUUID().replace(/-/g, '').slice(0, 8)}`;
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

// Member-uploader namespace. `#by_<slug>` is auto-applied on every
// member upload as the uploader-attribution marker (parallel to
// #curated for FH uploads); user-supplied tags in this namespace are
// rejected so attribution cannot be forged. The freeform `#<slug>`
// remains an ordinary tag any user may apply (mentions, pre-tagging
// unsigned/historical persons).
export const UPLOADER_TAG_PREFIX = '#by_';

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
    if (tag.startsWith(UPLOADER_TAG_PREFIX)) {
      throw new ValidationError(
        `Tags starting with "${UPLOADER_TAG_PREFIX}" are auto-applied as uploader attribution and must not appear in input: got "${tag}"`,
      );
    }
  }
}

// Service-boundary URL validation per DD §3.17. Returns the normalized
// URL on accept, null on absent input, throws ValidationError on invalid.
// Callers persist the returned value to media_items.external_url and
// stamp external_url_validated_at on accept.
async function normalizeExternalUrlOrThrow(input: string | null | undefined): Promise<string | null> {
  const result = await validateExternalUrl(input);
  if (!result.valid) {
    throw new ValidationError(result.error ?? 'Invalid URL.');
  }
  return result.normalizedUrl;
}

// Gallery-editing tag pattern: leading '#' then alphanumeric + underscores
// only, max 100 chars. Unlike validateTags
// this DOES allow `#curated` (the existing curated-freestyle-tricks gallery
// uses it as a criteria tag). The `#by_*` namespace is system-managed
// (auto-applied as the gallery's uploader-scoping criterion) and is
// rejected from caller input here, matching the validateTags rule.
const GALLERY_TAG_PATTERN = /^#[a-z0-9_]{1,99}$/;

function validateGalleryTag(tag: string, role: 'criteria' | 'exclude'): void {
  if (!GALLERY_TAG_PATTERN.test(tag)) {
    throw new ValidationError(
      `${role} tag must be lowercase '#' + alphanumeric/underscore (max 100 chars): got "${tag}"`,
    );
  }
  if (tag.startsWith(UPLOADER_TAG_PREFIX)) {
    throw new ValidationError(
      `${role} tag "${tag}" is in the auto-applied uploader namespace and must not appear in input.`,
    );
  }
}

function defaultFindSystemMemberId(): string | null {
  const row = runSqliteRead('findSystemMemberId', () =>
    media.findSystemMemberId.get(),
  ) as SystemMemberRow | undefined;
  return row?.id ?? null;
}

function applyTags(mediaId: string, tags: string[], now: string): string[] {
  const tagIds: string[] = [];
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
    tagIds.push(tagId);
  }
  return tagIds;
}

// Only path that writes #curated; stored as freeform (is_standard=0) because
// the standardized hashtag namespace covers only #event_* and #club_*.
// Input-side validateTags rejects #curated, so auto-application here is the
// sole source of the tag.
function applyTagsForCurator(mediaId: string, userTags: string[], now: string): string[] {
  const canonical = [...userTags, CURATED_TAG];
  return applyTags(mediaId, canonical, now);
}

// Member tag application: prepends `#by_<slug>` (the uploader-attribution
// marker, parallel to #curated for FH uploads) to the user-supplied
// tags. `validateTags` rejects user-supplied tags in the `#by_*`
// namespace, so the prepended marker is always the only `#by_*` tag
// in the canonical set. The freeform `#<slug>` is NOT auto-applied;
// it stays an ordinary tag any user may apply for mentions or
// pre-tagging unsigned/historical persons. Personal Gallery's criterion
// keys on `#by_<slug>`, so other members tagging `#<slug>` cannot
// pollute the uploader's gallery.
function applyTagsForMember(
  mediaId: string,
  slug: string,
  userTags: string[],
  now: string,
): string[] {
  const uploaderTag = `${UPLOADER_TAG_PREFIX}${slug.toLowerCase()}`;
  const canonical = [uploaderTag, ...userTags];
  return applyTags(mediaId, canonical, now);
}

// Default per-member gallery materialized on first upload. Members can
// rename or delete it after creation; the find-by-name probe in
// ensureDefaultPersonalGalleryTx keys on this exact name, so a manual
// rename detaches the auto-create path (subsequent uploads do not
// re-create a "Personal Gallery" row). Criteria tag is the member's
// uploader-attribution tag (#by_<slug>), so everything they upload
// appears here automatically and nothing tagged with their freeform
// `#<slug>` by another member can pollute the gallery.
const PERSONAL_GALLERY_NAME = 'Personal Gallery';
const PERSONAL_GALLERY_DESCRIPTION = 'Everything I have uploaded.';

// Closure for first-upload Personal Gallery materialization. Caller
// must already hold a transaction open (the upload methods call this
// inline). Idempotent: the find-by-name probe short-circuits when the
// gallery already exists. Returns the gallery id either way.
function ensureDefaultPersonalGalleryTx(
  memberId: string,
  slug: string,
  now: string,
): string {
  const existing = media.findMemberGalleryByOwnerAndName.get(
    memberId,
    PERSONAL_GALLERY_NAME,
  ) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }
  // Default-personal-gallery has a fixed name per member, so the base id is
  // unique by construction (UNIQUE(owner_member_id, name) ensures we hit this
  // branch at most once per member). No collision retry needed here.
  const galleryId = buildMemberGalleryId(slug, PERSONAL_GALLERY_NAME, 0);
  media.insertMemberGallery.run(
    galleryId, now, memberId, now, memberId,
    memberId, PERSONAL_GALLERY_NAME, PERSONAL_GALLERY_DESCRIPTION, 'upload_desc',
  );
  const uploaderTag = `${UPLOADER_TAG_PREFIX}${slug.toLowerCase()}`;
  const existingTag = mediaTagsDb.findTagByNormalized.get(uploaderTag) as
    | { id: string }
    | undefined;
  let tagId: string;
  if (existingTag) {
    tagId = existingTag.id;
  } else {
    tagId = newTagId();
    mediaTagsDb.insertTag.run(tagId, now, now, uploaderTag, uploaderTag);
  }
  media.insertMemberGalleryTag.run(galleryId, tagId, now, memberId);
  media.markMemberGalleryAsDefault.run(now, memberId, galleryId);
  return galleryId;
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
  // External URL edit. `undefined` leaves the existing value alone;
  // `null` clears the field; a string sets/replaces it (validated +
  // normalized by externalUrlValidator at the service boundary).
  externalUrl?: string | null;
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
  // Sort key for the admin list. Defaults to date_desc (newest first).
  // Closed enum mirrors db.ts CuratorListSort; controller validates the
  // query-string value against this set before passing it through.
  sort?: 'date_desc' | 'date_asc' | 'type_asc' | 'caption_asc';
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
  // External URL on the media_items row (DD §3.17 vetted). NULL when
  // unset.
  externalUrl: string | null;
}

export interface CuratorMediaListResult {
  items: CuratorMediaListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// FH-owned named gallery, for the admin gallery list/edit UX
// (/admin/curator/galleries and /admin/curator/galleries/:id/edit).

// Gallery shape constants live in `curatorGallerySidecar` (the
// validator that owns the cross-language contract with the Python
// seeder); imported above and re-exported here so existing
// service-layer consumers do not need to know which file owns them.
export {
  GALLERY_SORT_ORDER_VALUES,
  GALLERY_NAME_MAX_LEN,
  GALLERY_DESCRIPTION_MAX_LEN,
};
export type { GallerySortOrderValue };

export interface CuratorGalleryEditView {
  id: string;
  name: string;
  description: string;
  sortOrder: GallerySortOrderValue;
  criteriaTags: string[];   // tag-display strings e.g. '#curated'
  // Pre-shaped display string for the owner-facing edit form: criteriaTags
  // joined by space with the auto-applied `#by_<slug>` uploader tag
  // filtered out. Controllers pass through; no controller-side filtering.
  criteriaTagsDisplayString: string;
  excludeTags: string[];
  // Items currently matching the gallery's criteria/exclude. Drives the
  // edit-form's read-only thumbnail display. Detach (and other item
  // mutations) happen on the item's own edit page; the gallery edit
  // page never modifies item tags.
  currentItems: Array<{
    mediaId: string;
    mediaType: 'photo' | 'video';
    thumbnailUrl: string;
    caption: string | null;
    sourceFilename: string;
  }>;
  // External URLs already attached to the gallery; pre-fills the edit
  // form's external-link fieldset. Empty when none have been set.
  // `quarantineReason` is non-null when the runtime boot scan rejected the
  // URL via Safe Browsing; the admin form surfaces these inline with a
  // warning so the operator can replace the URL or remove the link.
  externalLinks: Array<{
    label: string;
    url: string;
    quarantineReason: string | null;
  }>;
}

export interface CuratorGallerySummary {
  id: string;
  name: string;
  description: string;
  sortOrder: GallerySortOrderValue;
  criteriaTags: string[];
  excludeTags: string[];
  itemCount: number;
}

export interface CuratorGalleryExternalLinkInput {
  label: string;
  url: string;
}

// Per-slot view-model shape for the gallery edit form's external-link
// fieldset. The form always renders `config.galleryMaxExternalLinks`
// slots so the user can fill, edit, or clear each one; this shape
// carries the current value, per-field validation errors, and (on the
// GET-edit path only) the quarantine warning that the Safe Browsing
// boot scan recorded on a persisted row.
export interface ExternalLinkSlot {
  index: number;
  label: string;
  url: string;
  labelError?: string;
  urlError?: string;
  // Set only on the GET-edit path when the persisted row was quarantined
  // by the Safe Browsing boot scan. Suppressed on POST validation
  // re-render because the user is replacing the value and a stale
  // warning would be confusing.
  quarantineReason?: string;
}

// Builds the slot array the form template iterates. On a clean GET,
// `submitted` is null and `existing` is the gallery's persisted links
// (with quarantine reasons surfaced). On POST validation failure,
// `submitted` carries the user's last-typed values so the form
// preserves their input; `existing` is ignored and quarantine warnings
// are suppressed. `fieldErrors` attaches per-input validation messages
// keyed by the form's `externalLinks[i].label` / `externalLinks[i].url`
// path style.
export function buildExternalLinkSlots(
  submitted: CuratorGalleryExternalLinkInput[] | null,
  existing: Array<{ label: string; url: string; quarantineReason?: string | null }>,
  fieldErrors?: Record<string, string>,
): ExternalLinkSlot[] {
  const slots: ExternalLinkSlot[] = [];
  for (let i = 0; i < config.galleryMaxExternalLinks; i++) {
    const src = submitted ? submitted[i] : existing[i];
    const slot: ExternalLinkSlot = {
      index: i,
      label: src?.label ?? '',
      url: src?.url ?? '',
      labelError: fieldErrors?.[`externalLinks[${i}].label`],
      urlError: fieldErrors?.[`externalLinks[${i}].url`],
    };
    if (!submitted) {
      const persisted = existing[i];
      if (persisted?.quarantineReason) {
        slot.quarantineReason = persisted.quarantineReason;
      }
    }
    slots.push(slot);
  }
  return slots;
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
  // External URLs displayed alongside the gallery on its public view.
  // Validated through DD §3.17 (validateExternalUrl) at the service
  // boundary. Cap is `config.galleryMaxExternalLinks`. May be empty
  // (caller passes []) or omitted (treated as []) for back-compat.
  externalLinks?: CuratorGalleryExternalLinkInput[];
}

export interface CuratorGalleryUpdateInput {
  actorMemberId: string;
  // Set true when the actor holds the admin role (req.user.role === 'admin'
  // at the controller). Service authz is `actorIsAdmin || actor === owner`;
  // the controller is the source of truth for the role flag.
  actorIsAdmin: boolean;
  galleryId: string;
  updates: CuratorGalleryUpdates;
}

export interface CuratorGalleryCreateInput {
  actorMemberId: string;
  actorIsAdmin: boolean;
  // Owner-on-write: explicit so the controller decides whether the
  // gallery is FH-owned (admin acting as system member) or member-owned
  // (member creating their own). Authz: actorIsAdmin OR actor === owner.
  ownerMemberId: string;
  // For FH-owned galleries the caller supplies a stable id matching
  // `gallery_<descriptive_slug>`; for member-owned the service derives a
  // human-readable id from `ownerSlug` + the gallery name and the field
  // is ignored.
  suggestedId?: string;
  // Owner's member slug (e.g. `david_leberknight`). Required for member-owned
  // creates so the service can derive the human-readable gallery id
  // `gallery_<owner_slug>_<name_slug>`. Ignored for FH-owned (suggestedId
  // path). Sourced from `req.user.slug` at the controller.
  ownerSlug?: string;
  updates: CuratorGalleryUpdates;
}

export interface CuratorGalleryCreateResult {
  id: string;
}

export interface CuratorGalleryDeleteInput {
  actorMemberId: string;
  actorIsAdmin: boolean;
  galleryId: string;
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
  external_url: string | null;
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
  source_filename?: string | null;
  external_url: string | null;
}

interface CountRow {
  n: number;
}

// Defense-in-depth (DD §2020) tier gate applied at every member-write
// service entry point. Mirrors the requireTier1Benefits route middleware
// so a programmatic call, an admin curator-route call, or any future
// caller that bypasses the route layer still cannot mutate member-owned
// media without Tier 1+ benefits. Admins satisfy hasTier1Benefits
// naturally per USER_STORIES §3.6 (Tier 2+ required).
function assertTier1Benefits(actorMemberId: string): void {
  if (!hasTier1Benefits(actorMemberId)) {
    throw new ForbiddenError(
      'Tier 1 benefits required to manage member-owned media.',
    );
  }
}

// Default-wired factory for callers (controllers, tests at the wiring
// seam) that just want a service instance backed by the configured
// adapters. Encapsulates the dev/prod parity boundary so controllers do
// not import adapter getters. Test seams continue to use the
// `createCuratorMediaService(deps)` form to inject fakes.
export function getDefaultCuratorMediaService(): ReturnType<typeof createCuratorMediaService> {
  return createCuratorMediaService({
    storage: getMediaStorageAdapter(),
    imageProcessor: getImageProcessingAdapter(),
  });
}

export function createCuratorMediaService(deps: CuratorMediaServiceDeps) {
  const { storage, imageProcessor } = deps;
  // Lazy: resolve the video adapter on first use, not at service
  // construction. Read paths (gallery list, member page renders) build
  // the service via `buildSvc()` but never touch video transcoding;
  // pulling the adapter eagerly forced an INTERNAL_EVENT_SECRET load on
  // routes that don't need it, surfacing as a 500 on gallery views in
  // dev environments without the worker secret configured.
  let _videoTranscoder: VideoTranscodingAdapter | null = deps.videoTranscoder ?? null;
  function videoTranscoder(): VideoTranscodingAdapter {
    if (!_videoTranscoder) _videoTranscoder = getVideoTranscodingAdapter();
    return _videoTranscoder;
  }
  const findSystemMemberId = deps.findSystemMemberId ?? defaultFindSystemMemberId;
  const videoUrlVerifier =
    deps.videoUrlVerifier ?? videoUrlVerifierOverrideForTests ?? verifyExternalVideoUrl;
  // Resolve lazily so construction does not require a curated root.
  // Read-only tests (e.g. lazy-adapter regressions) build the service
  // without touching disk; throwing at construction would force every
  // such test to set an override it never uses. Writes that need the
  // root call getCuratedRootDir() and get the test-mode guard.
  function getCuratedRootDir(): string {
    if (deps.curatedRootDir) return deps.curatedRootDir;
    if (curatedRootDirOverrideForTests) return curatedRootDirOverrideForTests;
    if (config.nodeEnv === 'test') {
      throw new Error(
        'curatorMediaService: in test mode, either deps.curatedRootDir or ' +
        'setCuratedRootDirForTests() must be set before exercising disk ' +
        'paths. Falling through to process.cwd()/curated would write test ' +
        'artifacts into the real repo.',
      );
    }
    return path.resolve(process.cwd(), 'curated');
  }

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
    // Returns the system (FH) member id, or throws if no is_system=1 row
    // exists. Exposed for admin controllers that need to call createGallery
    // with ownerMemberId set to the system member without re-implementing
    // the lookup.
    getSystemMemberId(): string {
      return resolveSystemMemberIdOrThrow();
    },

    // Lists existing /curated/{category}/ subdirectories for the admin
    // upload form's category picker. Sorted, ENOENT-tolerant. Lives on the
    // service so the controller doesn't need filesystem layout knowledge.
    listExistingCategories(): Promise<string[]> {
      return listExistingCuratorCategories(getCuratedRootDir());
    },

    async uploadPhoto(input: CuratorPhotoInput): Promise<CuratorUploadResult> {
      validateCaption(input.caption);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.photoBuffer.length > PHOTO_MAX_BYTES) {
        throw new ValidationError('Photo is too large. Maximum size is 25 MB.');
      }
      const detectedImage = detectImageType(input.photoBuffer);
      if (!detectedImage) {
        throw new ValidationError('Only JPEG and PNG photos are accepted.');
      }

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const processed = await imageProcessor.processPhoto(input.photoBuffer);

      const mediaId = newMediaId();
      const thumbKey = `${systemMemberId}/detached/${mediaId}-thumb.jpg`;
      const displayKey = `${systemMemberId}/detached/${mediaId}-display.jpg`;

      await storage.put(thumbKey, processed.thumb);
      await storage.put(displayKey, processed.display);

      // /curated/ source-of-truth write per DD §1.13. When a category is
      // provided, the source bytes plus a sibling sidecar JSON land under
      // <curatedRootDir>/<category>/ so the upload survives a DB or media-
      // store wipe and the seeder can rebuild from it. Identity column for
      // reconcile is media_items.source_filename, set to the same on-disk
      // name. Without a category, the /curated/ write is skipped (the
      // storage.put + media_items insert above are then the only writes,
      // matching the staging+prod direct authoring flow). Done before the
      // DB transaction so the sidecar identity matches the inserted row.
      let recordedSourceFilename = input.sourceFilename;
      if (input.category) {
        if (!isValidCategoryName(input.category)) {
          throw new ValidationError(
            'Category name must be lowercase letters, digits, or underscores.',
          );
        }
        const ext = detectedImage === 'image/png' ? 'png' : 'jpg';
        const slug = deriveCuratorSlug(input.sourceFilename);
        const binaryName = `${slug}.${ext}`;
        const categoryDir = path.join(getCuratedRootDir(), input.category);
        await fsp.mkdir(categoryDir, { recursive: true });
        await fsp.writeFile(path.join(categoryDir, binaryName), input.photoBuffer);
        await writeSidecar(categoryDir, binaryName, {
          caption: input.caption,
          tags: input.tags,
          ...(normalizedExternalUrl !== null && { externalUrl: normalizedExternalUrl }),
        });
        recordedSourceFilename = binaryName;
      }

      const now = new Date().toISOString();

      // Compensating-delete: storage objects already committed above; on tx
      // failure (UNIQUE, FK, CHECK) we delete them so they don't orphan.
      let appliedTagIds: string[] = [];
      try {
        transaction(() => {
          media.insertCuratorPhoto.run(
            mediaId, now, now,
            systemMemberId, input.caption, now,
            thumbKey, displayKey, processed.widthPx, processed.heightPx,
            recordedSourceFilename,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, systemMemberId);
          }
          appliedTagIds = applyTagsForCurator(mediaId, input.tags, now);
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
      } catch (err) {
        await compensatingStorageDelete(storage, [thumbKey, displayKey]);
        throw err;
      }
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      return { mediaId, displayUrl: storage.constructURL(displayKey) };
    },

    async uploadVideo(input: CuratorVideoInput): Promise<CuratorUploadResult> {
      validateCaption(input.caption);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.videoBuffer.length > VIDEO_MAX_BYTES) {
        throw new ValidationError('Video is too large. Maximum size is 150 MB.');
      }
      if (input.posterBuffer.length > POSTER_MAX_BYTES) {
        throw new ValidationError('Poster is too large. Maximum size is 25 MB.');
      }
      const detectedVideo = detectVideoFormat(input.videoBuffer);
      if (!detectedVideo) {
        throw new ValidationError('Only MP4, WebM, and MOV videos are accepted.');
      }
      const detectedPoster = detectImageType(input.posterBuffer);
      if (!detectedPoster) {
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
          videoTranscoder().transcode(input.videoBuffer),
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

      // /curated/ source-of-truth write per DD §1.13. Mirrors uploadPhoto
      // (see comment there). Video produces a triple: the source video
      // binary, a sibling poster, and the meta sidecar referencing the
      // poster by its `<slug>.poster.<ext>` name. The seeder's enumerator
      // (curatorSeedService.ts) already knows to skip files matching the
      // `*.poster.*` pattern as not-a-primary-binary, so the poster is
      // attached to its parent video via the sidecar's `poster:` field.
      let recordedSourceFilename = input.sourceFilename;
      if (input.category) {
        if (!isValidCategoryName(input.category)) {
          throw new ValidationError(
            'Category name must be lowercase letters, digits, or underscores.',
          );
        }
        const videoExt = detectedVideo;
        const posterExt = detectedPoster === 'image/png' ? 'png' : 'jpg';
        const slug = deriveCuratorSlug(input.sourceFilename);
        const binaryName = `${slug}.${videoExt}`;
        const posterName = `${slug}.poster.${posterExt}`;
        const categoryDir = path.join(getCuratedRootDir(), input.category);
        await fsp.mkdir(categoryDir, { recursive: true });
        await fsp.writeFile(path.join(categoryDir, binaryName), input.videoBuffer);
        await fsp.writeFile(path.join(categoryDir, posterName), input.posterBuffer);
        await writeSidecar(categoryDir, binaryName, {
          caption: input.caption,
          tags: input.tags,
          poster: posterName,
          ...(normalizedExternalUrl !== null && { externalUrl: normalizedExternalUrl }),
        });
        recordedSourceFilename = binaryName;
      }

      const now = new Date().toISOString();
      const thumbnailUrl = storage.constructURL(posterDisplayKey);

      // Compensating-delete on tx failure (video + poster pair). Same
      // pattern as uploadPhoto: storage objects committed above; clean
      // them up if the DB insert rejects.
      let appliedTagIds: string[] = [];
      try {
        transaction(() => {
          media.insertCuratorVideo.run(
            mediaId, now, now,
            systemMemberId, input.caption, now,
            videoKey, thumbnailUrl,
            processed.widthPx, processed.heightPx,
            recordedSourceFilename,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, systemMemberId);
          }
          appliedTagIds = applyTagsForCurator(mediaId, input.tags, now);
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
      } catch (err) {
        await compensatingStorageDelete(storage, [
          videoKey,
          posterDisplayKey,
          posterThumbKey,
        ]);
        throw err;
      }
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      return { mediaId, displayUrl: storage.constructURL(posterDisplayKey) };
    },

    /**
     * Worker-side finalize for a media_jobs row in 'processing' state.
     *
     * Pulls source bytes from S3 (written by the browser via presigned PUT),
     * runs the same transcode + poster pipeline as uploadVideo, persists the
     * resulting media_items row + tags + audit, and deletes the pending
     * source objects. Returns the new mediaId so the caller can update the
     * job row's media_id and announce the success event.
     *
     * Mirrors uploadVideo's validation (size, magic bytes, caption, tags) as
     * defense in depth: the browser is not trusted, and the /sign endpoint's
     * size check binds the user-claimed size, not the actual S3 object size.
     */
    async finalizeTranscodeForJob(job: MediaJobRow): Promise<CuratorUploadResult> {
      if (job.kind !== 'curator_video') {
        throw new ValidationError(`Unsupported media_jobs.kind: ${job.kind}`);
      }
      if (!job.source_video_key || !job.source_poster_key) {
        throw new ValidationError(
          `Job ${job.id} is missing source keys; cannot finalize.`,
        );
      }

      const tags = job.tags.length === 0 ? [] : job.tags.trim().split(/\s+/).filter(Boolean);
      validateCaption(job.caption);
      validateTags(tags);

      // Poster is small (cap 25 MB) and the worker container can hold it
      // inline. Video bytes (cap 150 MB) are NOT pulled in here — they go
      // image-container-direct via videoTranscoder.transcodeFromStorage so
      // the worker container's 96 M staging cgroup never has to buffer the
      // source. The image worker validates the source size + magic bytes on
      // its side; the per-type max stays advisory at the service boundary.
      const posterBuffer = await storage.get(job.source_poster_key);
      if (posterBuffer.length > POSTER_MAX_BYTES) {
        throw new ValidationError('Poster is too large. Maximum size is 25 MB.');
      }
      if (!detectImageType(posterBuffer)) {
        throw new ValidationError('Poster must be a JPEG or PNG image.');
      }

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const mediaId = newMediaId();
      const videoKey = `${systemMemberId}/detached/${mediaId}-video.mp4`;
      const posterDisplayKey = `${systemMemberId}/detached/${mediaId}-poster-display.jpg`;
      const posterThumbKey = `${systemMemberId}/detached/${mediaId}-poster-thumb.jpg`;

      // Slot-1 semaphore prevents two concurrent finalize calls from OOMing
      // the host. Single dispatch endpoint + slot-1 semaphore is belt-and-
      // suspenders against accidental double-dispatch.
      await transcodeBound.acquire();
      let processed: Awaited<ReturnType<ImageProcessingAdapter['processPhoto']>>;
      try {
        [, processed] = await Promise.all([
          videoTranscoder().transcodeFromStorage(job.source_video_key, videoKey),
          imageProcessor.processPhoto(posterBuffer),
        ]);
      } finally {
        transcodeBound.release();
      }

      // Video object already at videoKey from transcodeFromStorage; only the
      // poster derivatives are uploaded by this process.
      await storage.put(posterDisplayKey, processed.display);
      await storage.put(posterThumbKey, processed.thumb);

      const now = new Date().toISOString();
      const thumbnailUrl = storage.constructURL(posterDisplayKey);

      let appliedTagIds: string[] = [];
      transaction(() => {
        media.insertCuratorVideo.run(
          mediaId, now, now,
          systemMemberId, job.caption, now,
          videoKey, thumbnailUrl,
          processed.widthPx, processed.heightPx,
          job.source_filename,
        );
        appliedTagIds = applyTagsForCurator(mediaId, tags, now);
        appendAuditEntry({
          actionType: 'upload_curated_media',
          category: 'media',
          actorType: 'admin',
          actorMemberId: job.admin_member_id,
          entityType: 'media_item',
          entityId: mediaId,
          metadata: { mediaType: 'video', tags, mediaJobId: job.id },
        });
      });
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      // Best-effort cleanup of pending sources. S3 lifecycle on the pending/
      // prefix is the safety net if these calls fail.
      await Promise.all([
        storage.delete(job.source_video_key).catch(() => undefined),
        storage.delete(job.source_poster_key).catch(() => undefined),
      ]);

      return { mediaId, displayUrl: storage.constructURL(posterDisplayKey) };
    },

    async uploadUrlReference(
      input: CuratorUrlReferenceInput,
    ): Promise<CuratorUrlReferenceResult> {
      validateCaption(input.title);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

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
        ...(normalizedExternalUrl !== null && { externalUrl: normalizedExternalUrl }),
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

      const categoryDir = path.join(getCuratedRootDir(), input.category);
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
      // The sidecar file write above and this audit append are intentionally
      // not atomic: the sidecar is the source of truth and the seeder
      // reconstitutes the DB row, so a failed audit append after the sidecar
      // is written is tolerated (a transaction could not span the file write
      // anyway, and a lone insert needs none).
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
      // Three-way switch on external URL: undefined = no change, null =
      // clear, string = validate+normalize. The validator rejects bad
      // input before we hit the DB; a normalized non-null value is what
      // gets persisted.
      let normalizedExternalUrlEdit: string | null | undefined;
      if (input.externalUrl !== undefined) {
        normalizedExternalUrlEdit = await normalizeExternalUrlOrThrow(input.externalUrl);
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
        const sidecarFilePath = await resolveSidecarForRow(getCuratedRootDir(), row);
        if (!sidecarFilePath) {
          throw new Error(
            `editMedia: sidecar file not found for media ${input.mediaId} ` +
            `(video_platform=${row.video_platform}, video_url=${row.video_url}). ` +
            `The DB row is sidecar-backed but no matching file under ${getCuratedRootDir()}.`,
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
        if (normalizedExternalUrlEdit !== undefined) {
          updated.externalUrl = normalizedExternalUrlEdit;
        }

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

      const oldTagIds = dedupedTags !== undefined
        ? (tagStats.listTagIdsByMediaId.all(input.mediaId) as { tag_id: string }[]).map(r => r.tag_id)
        : [];
      let newTagIds: string[] = [];

      transaction(() => {
        if (input.caption !== undefined) {
          media.updateCuratorMediaCaption.run(input.caption, now, input.mediaId);
        }
        if (dedupedTags !== undefined) {
          mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
          newTagIds = applyTagsForCurator(input.mediaId, dedupedTags, now);
        }
        if (normalizedExternalUrlEdit !== undefined) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrlEdit, now, input.mediaId, row.uploader_member_id);
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
            externalUrlChanged: input.externalUrl !== undefined,
            ...(input.tags !== undefined && { tags: input.tags }),
          },
        });
      });

      if (dedupedTags !== undefined) {
        hashtagDiscoveryService.decrementTagStats(oldTagIds);
        hashtagDiscoveryService.incrementTagStats(newTagIds);
      }

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
        sidecarFilePath = await resolveSidecarForRow(getCuratedRootDir(), row);
        if (sidecarFilePath) {
          sidecarFilename = path.basename(sidecarFilePath);
        }
      } else {
        if (row.s3_key_thumb) keysToDelete.push(row.s3_key_thumb);
        if (row.s3_key_display) keysToDelete.push(row.s3_key_display);
        if (row.video_id) keysToDelete.push(row.video_id);
        if (row.thumbnail_url && row.thumbnail_url.startsWith('/media-store/')) {
          keysToDelete.push(row.thumbnail_url.slice('/media-store/'.length));
        }
      }

      const deletedTagIds = (tagStats.listTagIdsByMediaId.all(input.mediaId) as { tag_id: string }[]).map(r => r.tag_id);

      transaction(() => {
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
      hashtagDiscoveryService.decrementTagStats(deletedTagIds);

      // Filesystem + storage cleanup after the DB transaction commits.
      // Best-effort: a failed unlink/delete leaves an orphan but does not
      // roll back the DB. The row is already gone; operators can sweep.
      if (isSidecarBacked && sidecarFilePath) {
        try {
          await deleteUrlSidecarFile(sidecarFilePath);
        } catch (err) {
          logger.warn('curatorMediaService.deleteMedia: sidecar unlink failed', {
            sidecarFilePath,
            error: (err as Error).message,
          });
        }
      }

      const seen = new Set<string>();
      for (const key of keysToDelete) {
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await storage.delete(key);
        } catch (err) {
          logger.warn('curatorMediaService.deleteMedia: storage.delete failed', {
            key,
            error: (err as Error).message,
          });
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
        const sidecarFilePath = await resolveSidecarForRow(getCuratedRootDir(), row);
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
        externalUrl: row.external_url,
      };
    },

    listMedia(input: CuratorMediaListInput): CuratorMediaListResult {
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.max(1, Math.min(200, Math.floor(input.pageSize)));
      const offset = (page - 1) * pageSize;
      const sort = input.sort ?? 'date_desc';

      let rows: MediaListRow[];
      let total: number;
      if (input.tagFilter) {
        const tagFilter = input.tagFilter.toLowerCase();
        if (!tagFilter.startsWith('#')) {
          throw new ValidationError(`tagFilter must start with '#': got "${input.tagFilter}"`);
        }
        rows = runSqliteRead('listCuratorMediaByTagSorted', () =>
          media.listCuratorMediaByTagSorted(sort).all(tagFilter, pageSize, offset),
        ) as MediaListRow[];
        const cnt = runSqliteRead('countCuratorMediaByTag', () =>
          media.countCuratorMediaByTag.get(tagFilter),
        ) as CountRow | undefined;
        total = cnt?.n ?? 0;
      } else {
        rows = runSqliteRead('listCuratorMediaSorted', () =>
          media.listCuratorMediaSorted(sort).all(pageSize, offset),
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
        externalUrl: r.external_url,
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

    // Loads a single gallery's editable fields. Returns the current
    // name, description, sort_order, criteria tags, and exclude tags.
    // When `restrictToOwnerId` is supplied, throws NotFoundError if the
    // gallery's owner does not match (used by member routes so a member
    // sees a 404 rather than a 403 for a gallery they don't own —
    // matches the existing isOwnProfile/renderNotFound convention).
    // Without the restriction, returns any gallery (admin moderation +
    // public read paths use this).
    getGalleryForEdit(galleryId: string, restrictToOwnerId?: string): CuratorGalleryEditView {
      return runSqliteRead('getGalleryForEdit', () => {
        const g = media.getNamedGalleryById.get(galleryId) as
          | { id: string; name: string; description: string; sort_order: GallerySortOrderValue; owner_member_id: string }
          | undefined;
        if (!g) {
          throw new NotFoundError(`gallery ${galleryId} not found`);
        }
        if (restrictToOwnerId && g.owner_member_id !== restrictToOwnerId) {
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
        const criteriaTagIds = criteriaTagRows.map((t) => t.id);
        const excludeTagIds = excludeTagRows.map((t) => t.id);
        const itemRows = listGalleryItemsForDisplay(criteriaTagIds, excludeTagIds);
        const currentItems = itemRows.map((r) => ({
          mediaId: r.id,
          mediaType: r.media_type,
          thumbnailUrl: deriveListThumbnail(r),
          caption: r.caption,
          sourceFilename: r.source_filename,
        }));
        const linkRows = media.listGalleryExternalLinks.all(galleryId) as Array<{
          id: string;
          label: string;
          url: string;
          validated_at: string | null;
          quarantine_reason: string | null;
          sort_order: number;
        }>;
        const externalLinks = linkRows.map((r) => ({
          label: r.label,
          url: r.url,
          quarantineReason: r.quarantine_reason,
        }));
        const criteriaTagDisplays = criteriaTagRows.map((t) => t.tag_display);
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          sortOrder: g.sort_order,
          criteriaTags: criteriaTagDisplays,
          criteriaTagsDisplayString: criteriaTagDisplays
            .filter((t) => !t.toLowerCase().startsWith(UPLOADER_TAG_PREFIX))
            .join(' '),
          excludeTags: excludeTagRows.map((t) => t.tag_display),
          currentItems,
          externalLinks,
        };
      });
    },

    // Applies an update in a single transaction: metadata UPDATE plus
    // DELETE-then-INSERT on both criteria-tag and exclude-tag sets.
    // Idempotent on no-op updates. Authorizes the actor against the
    // gallery's owner (admin OR owner-self). For FH-owned galleries,
    // writes the JSON sidecar at /curated/galleries/<slug>.json AFTER
    // the DB transaction commits. Sidecar I/O failure does not roll
    // back the DB: the sidecar is reproducible from DB state on the
    // next save, while a rollback after a successful DB write would
    // corrupt the user's apparent edit. Throws ValidationError on
    // bad input or unauthorized actor; NotFoundError on unknown
    // gallery. Writes an `update_curated_gallery` / `update_member_gallery`
    // audit row inside the same transaction as the write.
    async updateGallery(input: CuratorGalleryUpdateInput): Promise<void> {
      const { actorMemberId, actorIsAdmin, galleryId, updates } = input;
      assertTier1Benefits(actorMemberId);

      const validated = await validateGalleryUpdates(updates);

      const existing = media.getNamedGalleryById.get(galleryId) as
        | { id: string; owner_member_id: string; is_system: number; owner_slug: string }
        | undefined;
      if (!existing) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      authorizeGalleryActor(actorMemberId, actorIsAdmin, existing.owner_member_id);

      // Auto-include the owner's `#by_<slug>` on member-owned gallery
      // edits, mirroring the create path. This survives the rewriteGalleryTagSets
      // tag-set replacement so the gallery's owner-scoping criterion
      // cannot be removed by editing. validateGalleryTag rejects `#by_*`
      // from caller input, so the prepended tag is the only `#by_*`.
      if (existing.is_system !== 1) {
        const uploaderTag = `${UPLOADER_TAG_PREFIX}${existing.owner_slug.toLowerCase()}`;
        validated.criteriaTags = [uploaderTag, ...validated.criteriaTags];
      } else {
        // FH-owned galleries auto-include `#curated` so the criteria query
        // scopes to FH-uploaded items only (every FH upload carries the
        // `#curated` tag via applyTagsForCurator). Idempotent: if the
        // sidecar / caller already includes `#curated`, the dedupe below
        // collapses to one occurrence.
        if (!validated.criteriaTags.includes(CURATED_TAG)) {
          validated.criteriaTags = [CURATED_TAG, ...validated.criteriaTags];
        }
      }

      if (validated.criteriaTags.length === 0) {
        throw new ValidationError(
          'A gallery must declare at least one criteria tag (otherwise it would render empty).',
        );
      }

      const now = new Date().toISOString();

      transaction(() => {
        media.updateMemberGalleryMetadata.run(
          validated.name,
          validated.description,
          validated.sortOrder,
          now,
          actorMemberId,
          galleryId,
        );
        rewriteGalleryTagSets(galleryId, validated, now, actorMemberId);
        rewriteGalleryExternalLinks(galleryId, validated.externalLinks, now, actorMemberId);
        appendAuditEntry({
          actionType: existing.is_system === 1
            ? 'update_curated_gallery'
            : 'update_member_gallery',
          category: 'media',
          actorType: actorIsAdmin ? 'admin' : 'member',
          actorMemberId,
          entityType: 'gallery',
          entityId: galleryId,
          metadata: {
            galleryId,
            ownerMemberId: existing.owner_member_id,
            isSystem: existing.is_system === 1,
          },
        });
      });

      if (existing.is_system === 1) {
        await writeFhGallerySidecar({
          id: galleryId,
          name: validated.name,
          description: validated.description,
          sortOrder: validated.sortOrder,
          criteriaTags: validated.criteriaTags,
          excludeTags: validated.excludeTags,
          externalLinks: validated.externalLinks.map((lk, i) => ({
            label: lk.label,
            url: lk.url,
            sortOrder: i,
          })),
        });
      }
    },

    // Creates a new gallery row and its tag sets in a single transaction.
    // Owner is set explicitly: FH-owned (admin acting as system member,
    // suggestedId required) or member-owned (owner === actor, id auto-
    // generated). For FH-owned, writes the JSON sidecar after commit.
    // Throws ValidationError on bad input or unauthorized actor;
    // ConflictError when UNIQUE(owner, name) is already taken. Writes a
    // `create_curated_gallery` / `create_member_gallery` audit row inside
    // the same transaction as the insert.
    async createGallery(
      input: CuratorGalleryCreateInput,
    ): Promise<CuratorGalleryCreateResult> {
      const { actorMemberId, actorIsAdmin, ownerMemberId, suggestedId, ownerSlug, updates } = input;
      assertTier1Benefits(actorMemberId);

      const validated = await validateGalleryUpdates(updates);

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const isFhOwned = ownerMemberId === systemMemberId;

      // Authorization: admin can create on behalf of anyone (in practice
      // FH-owned curator galleries); a non-admin actor can only create
      // galleries owned by themselves.
      if (!actorIsAdmin && actorMemberId !== ownerMemberId) {
        throw new ValidationError('Not authorized to create a gallery for this owner.');
      }
      if (isFhOwned && !actorIsAdmin) {
        throw new ValidationError('Only admins may create FH-owned galleries.');
      }

      let galleryId: string;
      if (isFhOwned) {
        if (!suggestedId || !/^gallery_[a-z0-9_]+$/.test(suggestedId)) {
          throw new ValidationError(
            'FH-owned gallery requires suggestedId matching gallery_[a-z0-9_]+.',
          );
        }
        galleryId = suggestedId;
      } else {
        if (!ownerSlug) {
          throw new ValidationError(
            'Member-owned gallery requires ownerSlug.',
          );
        }
        galleryId = buildMemberGalleryId(ownerSlug, validated.name, 0);
        // Member-owned galleries auto-include the owner's `#by_<slug>` so
        // the tag-AND query scopes to the owner's uploads. validateGalleryTag
        // rejects `#by_*` from caller input, so the prepended tag is the
        // only `#by_*` in the criteria set. FH-owned galleries are not
        // uploader-scoped (handled below).
        const uploaderTag = `${UPLOADER_TAG_PREFIX}${ownerSlug.toLowerCase()}`;
        validated.criteriaTags = [uploaderTag, ...validated.criteriaTags];
      }
      // FH-owned galleries auto-include `#curated` so the criteria query
      // scopes to FH-uploaded items only. Idempotent: re-create from a
      // sidecar that already includes `#curated` collapses to one
      // occurrence. See updateGallery for the matching edit-path branch.
      if (isFhOwned && !validated.criteriaTags.includes(CURATED_TAG)) {
        validated.criteriaTags = [CURATED_TAG, ...validated.criteriaTags];
      }

      if (validated.criteriaTags.length === 0) {
        throw new ValidationError(
          'A gallery must declare at least one criteria tag (otherwise it would render empty).',
        );
      }

      const now = new Date().toISOString();

      // Insert + tag-set rewrite share one transaction. Two distinct UNIQUE
      // constraints on member_galleries can fire here:
      //   - PRIMARY KEY id  → distinct slug-id collision (member-owned only;
      //     two different gallery names that slugify to the same form).
      //     Recovered by appending `_2`, `_3`, … to the id and retrying.
      //   - UNIQUE(owner_member_id, name) → same-owner duplicate name.
      //     User-visible ConflictError (no retry; caller must rename).
      // SQLite distinguishes them by including the constraint columns in
      // the error message (`member_galleries.id` vs `…owner_member_id, …name`).
      const MAX_ID_ATTEMPTS = 100;
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          transaction(() => {
            media.insertMemberGallery.run(
              galleryId, now, actorMemberId, now, actorMemberId,
              ownerMemberId, validated.name, validated.description, validated.sortOrder,
            );
            rewriteGalleryTagSets(galleryId, validated, now, actorMemberId);
            rewriteGalleryExternalLinks(galleryId, validated.externalLinks, now, actorMemberId);
            appendAuditEntry({
              actionType: isFhOwned
                ? 'create_curated_gallery'
                : 'create_member_gallery',
              category: 'media',
              actorType: actorIsAdmin ? 'admin' : 'member',
              actorMemberId,
              entityType: 'gallery',
              entityId: galleryId,
              metadata: {
                galleryId,
                ownerMemberId,
                isSystem: isFhOwned,
              },
            });
          });
          break;
        } catch (err) {
          const msg = (err as Error).message ?? '';
          const isUnique = msg.includes('UNIQUE');
          const isIdCollision = isUnique && msg.includes('member_galleries.id');
          if (isIdCollision && !isFhOwned) {
            attempt += 1;
            if (attempt >= MAX_ID_ATTEMPTS) {
              throw new Error(
                `Could not generate a unique gallery id for "${validated.name}" after ${MAX_ID_ATTEMPTS} attempts.`,
              );
            }
            galleryId = buildMemberGalleryId(ownerSlug as string, validated.name, attempt);
            continue;
          }
          if (isUnique && msg.includes('member_galleries')) {
            throw new ConflictError(
              `A gallery named "${validated.name}" already exists for this owner.`,
            );
          }
          throw err;
        }
      }

      if (isFhOwned) {
        await writeFhGallerySidecar({
          id: galleryId,
          name: validated.name,
          description: validated.description,
          sortOrder: validated.sortOrder,
          criteriaTags: validated.criteriaTags,
          excludeTags: validated.excludeTags,
          externalLinks: validated.externalLinks.map((lk, i) => ({
            label: lk.label,
            url: lk.url,
            sortOrder: i,
          })),
        });
      }

      return { id: galleryId };
    },

    // Hard-deletes a gallery row. Tag rows in member_gallery_tags and
    // member_gallery_exclude_tags cascade via ON DELETE CASCADE. For
    // FH-owned galleries, removes the JSON sidecar after commit
    // (best-effort, ENOENT-tolerant). Throws ValidationError on
    // unauthorized actor; NotFoundError on unknown gallery.
    async deleteGallery(input: CuratorGalleryDeleteInput): Promise<void> {
      const { actorMemberId, actorIsAdmin, galleryId } = input;
      assertTier1Benefits(actorMemberId);

      const existing = media.getNamedGalleryById.get(galleryId) as
        | { id: string; owner_member_id: string; is_system: number }
        | undefined;
      if (!existing) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      authorizeGalleryActor(actorMemberId, actorIsAdmin, existing.owner_member_id);

      // Delete + audit land in one transaction. Every other write method in
      // this service wraps in transaction(...) + appendAuditEntry; gallery
      // delete was the lone outlier, leaving deletions untraceable and
      // unrolled-back on audit failure. Mirrors the deleteMedia pattern at
      // ~line 1366.
      transaction(() => {
        media.deleteMemberGalleryById.run(galleryId);
        appendAuditEntry({
          actionType: existing.is_system === 1
            ? 'delete_curated_gallery'
            : 'delete_member_gallery',
          category: 'media',
          actorType: actorIsAdmin ? 'admin' : 'member',
          actorMemberId,
          entityType: 'gallery',
          entityId: galleryId,
          metadata: {
            galleryId,
            ownerMemberId: existing.owner_member_id,
            isSystem: existing.is_system === 1,
          },
        });
      });

      if (existing.is_system === 1 && config.allowCuratedSidecarWrites) {
        const sidecarPath = deriveGallerySidecarPath(getCuratedRootDir(), galleryId);
        try {
          await deleteGallerySidecarFile(sidecarPath);
        } catch (err) {
          // Sidecar I/O failures are logged but do not roll back the
          // DB delete: the next seeder run will reconcile, and the
          // gallery is already gone from the live read paths.
          logger.warn('curatorMediaService: gallery sidecar unlink failed', {
            galleryId,
            error: (err as Error).message,
          });
        }
      }
    },


    // Lists every gallery owned by a given member, including item count.
    // Public read; no authz gate. Used by the member profile "Galleries"
    // section (slice 2b consumer) and tests.
    listGalleriesForOwner(memberId: string): CuratorGallerySummary[] {
      return runSqliteRead('listGalleriesForOwner', () => {
        const rows = media.listMemberGalleriesByOwner.all(memberId) as Array<{
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

    // Member-attributed photo upload. Mirrors uploadPhoto but writes
    // uploader_member_id = memberId (not the system member) and uses
    // applyTagsForMember so #<slug> auto-applies. Synchronous from the
    // caller's perspective: image processing, S3 put, DB insert, and
    // Personal Gallery materialization all complete before return.
    async uploadPhotoForMember(input: MemberPhotoInput): Promise<MemberUploadResult> {
      assertTier1Benefits(input.memberId);
      validateCaption(input.caption);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.photoBuffer.length > PHOTO_MAX_BYTES) {
        throw new ValidationError('Photo is too large. Maximum size is 25 MB.');
      }
      if (!detectImageType(input.photoBuffer)) {
        throw new ValidationError('Only JPEG and PNG photos are accepted.');
      }

      const processed = await imageProcessor.processPhoto(input.photoBuffer);

      const mediaId = newMediaId();
      const thumbKey = `${input.memberId}/detached/${mediaId}-thumb.jpg`;
      const displayKey = `${input.memberId}/detached/${mediaId}-display.jpg`;

      await storage.put(thumbKey, processed.thumb);
      await storage.put(displayKey, processed.display);

      const now = new Date().toISOString();

      // Compensating-delete on tx failure: storage objects already committed
      // above; on UNIQUE / FK / CHECK violation we delete them so they don't
      // orphan. Same pattern as uploadPhoto / uploadVideo.
      let appliedTagIds: string[] = [];
      try {
        transaction(() => {
          media.insertMemberPhoto.run(
            mediaId, now, now,
            input.memberId, input.caption, now,
            thumbKey, displayKey, processed.widthPx, processed.heightPx,
            input.sourceFilename,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, input.memberId);
          }
          appliedTagIds = applyTagsForMember(mediaId, input.slug, input.tags, now);
          ensureDefaultPersonalGalleryTx(input.memberId, input.slug, now);
          appendAuditEntry({
            actionType: 'upload_member_media',
            category: 'media',
            actorType: 'member',
            actorMemberId: input.memberId,
            entityType: 'media_item',
            entityId: mediaId,
            metadata: { mediaType: 'photo', tags: input.tags },
          });
        });
      } catch (err) {
        await compensatingStorageDelete(storage, [thumbKey, displayKey]);
        const msg = (err as Error).message ?? '';
        if (msg.includes('UNIQUE') && msg.includes('source_filename')) {
          throw new ValidationError(
            `You have already uploaded a file named "${input.sourceFilename}". ` +
            `Rename the file or delete the previous upload first.`,
          );
        }
        throw err;
      }
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      return { mediaId, displayUrl: storage.constructURL(displayKey) };
    },

    // Member-self read for the per-item edit form. Owner-scoped: the
    // db.ts statement filters by uploader_member_id, so a row owned by
    // anyone else returns undefined → caller renders 404. Returns the
    // minimal shape the edit view needs (caption, tags, external URL);
    // FH-curator sidecar fields (creator/tier/clip range) are not
    // surfaced on the member surface.
    getMemberMediaItem(mediaId: string, ownerMemberId: string): MemberMediaItem | null {
      const row = runSqliteRead('getMemberMediaItemById', () =>
        media.getMemberMediaItemById.get(mediaId, ownerMemberId),
      ) as MediaItemRow | undefined;
      if (!row) return null;
      const tagPairs = queryCuratorMediaTags([mediaId]);
      return {
        mediaId: row.id,
        mediaType: row.media_type,
        caption: row.caption,
        tags: tagPairs.map((p) => p.tag_display),
        externalUrl: row.external_url,
      };
    },

    // Member-self edit. Mirrors the validation surface of editMedia but
    // skips the FH-curator sidecar branches entirely (member uploads are
    // photos only; no URL-ref sidecars). Owner-scoped: the row load is
    // gated by uploader_member_id, so a non-owner gets NotFoundError. Tag
    // rewrites go through applyTagsForMember so the auto-applied
    // `#by_<slug>` uploader marker is re-attached every save.
    async editMemberMedia(input: MemberMediaEditInput): Promise<MemberMediaEditResult> {
      assertTier1Benefits(input.memberId);
      if (input.caption !== undefined) {
        validateCaption(input.caption);
      }
      if (input.tags !== undefined) {
        validateTags(input.tags);
      }
      let normalizedExternalUrlEdit: string | null | undefined;
      if (input.externalUrl !== undefined) {
        normalizedExternalUrlEdit = await normalizeExternalUrlOrThrow(input.externalUrl);
      }

      const row = runSqliteRead('getMemberMediaItemById', () =>
        media.getMemberMediaItemById.get(input.mediaId, input.memberId),
      ) as MediaItemRow | undefined;
      if (!row) {
        throw new NotFoundError(`Member media not found: ${input.mediaId}`);
      }

      const now = new Date().toISOString();
      const dedupedTags =
        input.tags !== undefined ? Array.from(new Set(input.tags)) : undefined;

      const oldTagIds = dedupedTags !== undefined
        ? (tagStats.listTagIdsByMediaId.all(input.mediaId) as { tag_id: string }[]).map(r => r.tag_id)
        : [];
      let newTagIds: string[] = [];

      transaction(() => {
        if (input.caption !== undefined) {
          media.updateMemberMediaCaption.run(input.caption, now, input.mediaId, input.memberId);
        }
        if (dedupedTags !== undefined) {
          mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
          newTagIds = applyTagsForMember(input.mediaId, input.slug, dedupedTags, now);
        }
        if (normalizedExternalUrlEdit !== undefined) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrlEdit, now, input.mediaId, input.memberId);
        }
        appendAuditEntry({
          actionType: 'edit_member_media',
          category: 'media',
          actorType: 'member',
          actorMemberId: input.memberId,
          entityType: 'media_item',
          entityId: input.mediaId,
          metadata: {
            caption: input.caption !== undefined ? input.caption : null,
            tags: dedupedTags ?? null,
            externalUrl: normalizedExternalUrlEdit !== undefined ? normalizedExternalUrlEdit : null,
          },
        });
      });

      if (dedupedTags !== undefined) {
        hashtagDiscoveryService.decrementTagStats(oldTagIds);
        hashtagDiscoveryService.incrementTagStats(newTagIds);
      }

      return { mediaId: input.mediaId, updatedAt: now };
    },

    // Member-attributed video URL submission. URL-reference only (no
    // bytes hosted), per US M_Submit_Video. The service verifies the
    // URL via the platform's oEmbed endpoint (the only reliable
    // signal: page URLs return 200 even for removed videos), extracts
    // the video id, and pulls the Vimeo thumbnail from the oEmbed
    // body (Vimeo thumbnails are not derivable from id; YouTube ids
    // are derived at render time).
    async submitVideoForMember(input: MemberVideoInput): Promise<MemberUploadResult> {
      assertTier1Benefits(input.memberId);
      validateCaption(input.caption);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.videoPlatform !== 'youtube' && input.videoPlatform !== 'vimeo') {
        throw new ValidationError('Choose YouTube or Vimeo for the video platform.');
      }
      if (!input.videoUrl || !/^https?:\/\//.test(input.videoUrl)) {
        throw new ValidationError('Video URL must start with http:// or https://.');
      }

      const videoId = input.videoPlatform === 'youtube'
        ? parseYouTubeVideoId(input.videoUrl)
        : parseVimeoVideoId(input.videoUrl);
      if (!videoId) {
        throw new ValidationError(
          `Could not extract a ${input.videoPlatform} video id from the URL.`,
        );
      }

      const verify = await videoUrlVerifier(input.videoUrl, input.videoPlatform);
      if (!verify.ok) {
        throw new ValidationError(
          `Video is not available at the platform (oEmbed status ${verify.status}).`,
        );
      }

      let thumbnailUrl: string | null = null;
      if (input.videoPlatform === 'vimeo') {
        const t = (verify.body as { thumbnail_url?: unknown } | undefined)?.thumbnail_url;
        if (typeof t === 'string' && t.startsWith('https://')) {
          thumbnailUrl = t;
        } else {
          throw new ValidationError(
            'Vimeo did not return a usable thumbnail URL. Try a different link.',
          );
        }
      }

      const mediaId = newMediaId();
      const now = new Date().toISOString();
      // YouTube thumbnail is null in the DB; the read path derives
      // `https://i.ytimg.com/vi/{id}/hqdefault.jpg` at render time
      // (see deriveListThumbnail above for the matching read-side rule).
      const displayUrl =
        input.videoPlatform === 'youtube'
          ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          : (thumbnailUrl ?? '');

      let appliedTagIds: string[] = [];
      transaction(() => {
        media.insertMemberVideo.run(
          mediaId, now, now,
          input.memberId, input.caption, now,
          input.videoPlatform, videoId, input.videoUrl, thumbnailUrl,
        );
        if (normalizedExternalUrl !== null) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, input.memberId);
        }
        appliedTagIds = applyTagsForMember(mediaId, input.slug, input.tags, now);
        ensureDefaultPersonalGalleryTx(input.memberId, input.slug, now);
        appendAuditEntry({
          actionType: 'upload_member_media',
          category: 'media',
          actorType: 'member',
          actorMemberId: input.memberId,
          entityType: 'media_item',
          entityId: mediaId,
          metadata: { mediaType: 'video', videoPlatform: input.videoPlatform, tags: input.tags },
        });
      });
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      return { mediaId, displayUrl };
    },

    // Idempotent: creates the default Personal Gallery for a member if
    // they don't already have one. Public method for callers that
    // want to materialize the gallery up front (e.g. on first profile
    // visit). The upload methods call the closure-scoped variant
    // inside their write transactions so the gallery materializes on
    // first upload too. Returns the gallery id either way.
    ensureDefaultPersonalGallery(memberId: string, slug: string): { galleryId: string } {
      const existing = runSqliteRead('findMemberGalleryByOwnerAndName', () =>
        media.findMemberGalleryByOwnerAndName.get(memberId, PERSONAL_GALLERY_NAME),
      ) as { id: string } | undefined;
      if (existing) {
        return { galleryId: existing.id };
      }
      const now = new Date().toISOString();
      let galleryId = '';
      transaction(() => {
        galleryId = ensureDefaultPersonalGalleryTx(memberId, slug, now);
      });
      return { galleryId };
    },
  };

  // ── Gallery helpers (closure-scoped) ──────────────────────────────

  // Validates a CuratorGalleryUpdates payload and returns a normalized
  // shape (trimmed strings, narrowed sortOrder type). Shared between
  // updateGallery and createGallery.
  async function validateGalleryUpdates(updates: CuratorGalleryUpdates): Promise<{
    name: string;
    description: string;
    sortOrder: GallerySortOrderValue;
    criteriaTags: string[];
    excludeTags: string[];
    externalLinks: Array<{ label: string; url: string }>;
  }> {
    const name = updates.name.trim();
    if (!name) {
      const m = 'Gallery name is required.';
      throw new ValidationError(m, { fieldErrors: { name: m } });
    }
    if (name.length > GALLERY_NAME_MAX_LEN) {
      const m = `Gallery name must be ${GALLERY_NAME_MAX_LEN} characters or fewer.`;
      throw new ValidationError(m, { fieldErrors: { name: m } });
    }
    const description = (updates.description ?? '').trim();
    if (description.length > GALLERY_DESCRIPTION_MAX_LEN) {
      const m = `Gallery description must be ${GALLERY_DESCRIPTION_MAX_LEN} characters or fewer.`;
      throw new ValidationError(m, { fieldErrors: { description: m } });
    }
    const validSortOrders: readonly string[] = GALLERY_SORT_ORDER_VALUES;
    if (!validSortOrders.includes(updates.sortOrder)) {
      const m = `Gallery sort order must be one of: ${GALLERY_SORT_ORDER_VALUES.join(', ')}.`;
      throw new ValidationError(m, { fieldErrors: { sortOrder: m } });
    }
    const sortOrder = updates.sortOrder as GallerySortOrderValue;
    // The >=1 criteria invariant is enforced by createGallery/updateGallery
    // AFTER the system auto-prepends `#by_<owner_slug>`, so an empty
    // user-supplied criteriaTags is acceptable here for member-owned
    // galleries (the auto-prepend always supplies at least one).
    const seenCriteria = new Set<string>();
    for (const tag of updates.criteriaTags) {
      try {
        validateGalleryTag(tag, 'criteria');
      } catch (err) {
        const m = (err as Error).message;
        throw new ValidationError(m, { fieldErrors: { criteriaTags: m } });
      }
      if (seenCriteria.has(tag)) {
        const m = `Duplicate criteria tag: ${tag}`;
        throw new ValidationError(m, { fieldErrors: { criteriaTags: m } });
      }
      seenCriteria.add(tag);
    }
    const seenExclude = new Set<string>();
    for (const tag of updates.excludeTags) {
      try {
        validateGalleryTag(tag, 'exclude');
      } catch (err) {
        const m = (err as Error).message;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      if (seenExclude.has(tag)) {
        const m = `Duplicate exclude tag: ${tag}`;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      if (seenCriteria.has(tag)) {
        const m = `Tag "${tag}" cannot be both a criteria tag and an exclude tag.`;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      seenExclude.add(tag);
    }
    const submittedLinks = updates.externalLinks ?? [];
    if (submittedLinks.length > config.galleryMaxExternalLinks) {
      const m = `At most ${config.galleryMaxExternalLinks} external link(s) allowed per gallery; got ${submittedLinks.length}.`;
      throw new ValidationError(m, { fieldErrors: { externalLinks: m } });
    }
    const validatedLinks: Array<{ label: string; url: string }> = [];
    for (let i = 0; i < submittedLinks.length; i++) {
      const link = submittedLinks[i];
      const label = (link.label ?? '').trim();
      const rawUrl = (link.url ?? '').trim();
      // Skip rows the user cleared (both empty). Empty label + empty url
      // is a no-op; the form may submit empty pairs for unfilled slots.
      if (!label && !rawUrl) continue;
      if (!label) {
        const m = 'Link label is required when a URL is provided.';
        throw new ValidationError(m, {
          fieldErrors: { [`externalLinks[${i}].label`]: m },
        });
      }
      if (label.length > 80) {
        const m = 'Link label must be 80 characters or fewer.';
        throw new ValidationError(m, {
          fieldErrors: { [`externalLinks[${i}].label`]: m },
        });
      }
      if (!rawUrl) {
        const m = 'Link URL is required when a label is provided.';
        throw new ValidationError(m, {
          fieldErrors: { [`externalLinks[${i}].url`]: m },
        });
      }
      const result = await validateExternalUrl(rawUrl);
      if (!result.valid || !result.normalizedUrl) {
        const m = result.error ?? 'Invalid URL.';
        throw new ValidationError(m, {
          fieldErrors: { [`externalLinks[${i}].url`]: m },
        });
      }
      validatedLinks.push({ label, url: result.normalizedUrl });
    }

    return {
      name,
      description,
      sortOrder,
      criteriaTags: updates.criteriaTags,
      excludeTags: updates.excludeTags,
      externalLinks: validatedLinks,
    };
  }

  // Authz primitive used by updateGallery/deleteGallery: either the
  // actor holds the admin role (controller-attested) OR the actor is
  // the gallery's own owner. Throws ValidationError on rejection
  // (no AuthorizationError class exists in serviceErrors.ts; reusing
  // ValidationError matches the existing convention for actor-permission
  // failures in this service file).
  function authorizeGalleryActor(
    actorMemberId: string,
    actorIsAdmin: boolean,
    ownerMemberId: string,
  ): void {
    if (actorIsAdmin) return;
    if (actorMemberId === ownerMemberId) return;
    throw new ValidationError('Not authorized to modify this gallery.');
  }

  // Replaces the criteria-tag and exclude-tag sets for a gallery.
  // DELETE-then-INSERT pattern, executed inside a caller's transaction.
  // Auto-creates `tags` rows for tags not yet seen platform-wide.
  function rewriteGalleryTagSets(
    galleryId: string,
    validated: { criteriaTags: string[]; excludeTags: string[] },
    now: string,
    actorMemberId: string,
  ): void {
    media.deleteAllMemberGalleryTags.run(galleryId);
    for (const tag of validated.criteriaTags) {
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
      media.insertMemberGalleryTag.run(galleryId, tagId, now, actorMemberId);
    }

    media.deleteAllMemberGalleryExcludeTags.run(galleryId);
    for (const tag of validated.excludeTags) {
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
      media.insertMemberGalleryExcludeTag.run(galleryId, tagId, now, actorMemberId);
    }
  }

  // Replaces the gallery's external-link rows. Caller wraps in the same
  // transaction as the metadata + tag rewrites so the gallery is never
  // observably half-updated. Each link gets a deterministic id derived
  // from the gallery and its position so re-saves stay diff-friendly.
  function rewriteGalleryExternalLinks(
    galleryId: string,
    links: Array<{ label: string; url: string }>,
    now: string,
    actorMemberId: string,
  ): void {
    media.deleteGalleryExternalLinks.run(galleryId);
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const id = `glink_${galleryId}_${i}`;
      media.insertGalleryExternalLink.run(
        id, now, actorMemberId, now, actorMemberId,
        galleryId, link.label, link.url, now, i,
      );
    }
  }

  // Writes (or rewrites) the JSON sidecar for an FH-owned gallery.
  // Sidecar I/O happens AFTER the DB transaction commits; failure here
  // is logged but does not propagate, so a transient FS error never
  // corrupts a successful DB-side edit. The seeder reconciles on next
  // run.
  async function writeFhGallerySidecar(data: GallerySidecarData): Promise<void> {
    // Sidecar writes target /curated/galleries/<slug>.json which is the
    // git-tracked seed source-of-truth. Permitted in dev only; staging /
    // prod admin edits mutate the DB but the deployed /curated/ tree is
    // part of the build artifact, not a runtime mutable surface.
    if (!config.allowCuratedSidecarWrites) {
      return;
    }
    try {
      validateGallerySidecarData(data);
      await writeGallerySidecarFile(getCuratedRootDir(), data);
    } catch (err) {
      logger.warn('curatorMediaService: gallery sidecar write failed', {
        galleryId: data.id,
        error: (err as Error).message,
      });
    }
  }
}
