/**
 * CuratorMediaService -- curator-attributed media uploads and named-gallery editing.
 *
 * Owns:
 *   - Admin upload, edit, delete, and list of curator photos and videos on behalf
 *     of the system member account
 *   - Member-self media lifecycle: photo upload, video URL submission,
 *     per-item edit, and permanent delete (owner-scoped row loads;
 *     auto-applied `#by_<slug>` uploader marker)
 *   - Magic-byte and format validation
 *   - ffmpeg curator transcode pipeline
 *   - Storage key construction matching the curator-seed layout
 *   - Auto-application of the `#curated` uploader marker
 *   - Admin and member named-gallery editing (FH-owned and member-owned
 *     `member_galleries` rows)
 *   - The page contracts for the admin curator surface and for the member's own
 *     media, galleries and gallery list: the `get*Page` builders at the end of
 *     this file return a typed `PageViewModel`, so a controller parses the
 *     request, chooses the status code, and renders what it is handed. The
 *     hrefs a page displays are composed there, and a controller never augments
 *     what a builder returned
 *
 * Does not own:
 *   - Public gallery/browse page shaping (MediaGalleryService) or the
 *     avatar lifecycle (AvatarService; avatar rows are refused by the
 *     member-self delete). The gallery list's teaching empty state shows
 *     community media for that reason: the read is handed to the builder by its
 *     caller rather than performed here
 *
 * Required patterns:
 *   - `uploader_member_id` is always the system member id (`is_system=1`); the admin
 *     actor is recorded only in `audit_entries`.
 *   - Curator video bytes use `video_platform='s3'`; member video routes reject `s3`
 *     as a defensive boundary.
 *   - `media_items.mime_type` records the served content type of the stored object
 *     (`video/<transcode outputFormat>` for curator video, the JPEG rendition type
 *     for photos); URL-reference rows leave it NULL.
 *   - Storage keys follow `{systemMemberId}/detached/{mediaId}-...` so offline seed
 *     and admin upload produce identical row shape.
 *   - Auto-applies `#curated`; `#curated` rejected from input.
 *   - URL-reference uploads insert the `media_items` row directly (parallel to
 *     photo/video, minus S3 since url-refs host no bytes), keyed on the
 *     deterministic `(video_platform, video_url)` id (`urlRefMediaId`, matching
 *     the seeder). The authoring sidecar at
 *     `/curated/{category}/<primarySlug>_<sha1(videoUrl)[:8]>.meta.json` (atomic
 *     temp + rename) is written only when `config.allowCuratedSidecarWrites`
 *     (dev only, the same gate as the FH gallery sidecar); in staging/prod the
 *     `media_items` row is the only write (DD §1.13).
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
 *   - URL-reference rows (`video_platform IN ('youtube','vimeo')`): where the
 *     authoring tree is writable, edits and deletes resolve the sidecar from
 *     `(video_platform, video_url)`, rewrite or unlink atomically, then update
 *     the DB row. Where it is not, no filesystem path is touched and the DB
 *     write is the whole operation: every field the edit surface offers has a
 *     column, so an edit is lossless without the tree. Provenance and clip
 *     bounds are read back from the row, never from a file.
 *   - Named-gallery mutating calls require admin OR owner of the affected gallery;
 *     enforced on every call.
 *   - FH-owned gallery creation requires admin actor and explicit `suggestedId`
 *     matching `gallery_[a-z0-9_]+`. Member-owned derives id
 *     `gallery_<owner_slug>_<gallery_name_slug>` (with `_2`, `_3` suffixes on
 *     collision).
 *   - Member-owned galleries auto-prepend `#by_<owner_slug>` to validated criteria
 *     tags on every create/update; `>=1 criteria tag` invariant enforced AFTER
 *     auto-prepend; user-supplied `#by_*` tags rejected.
 *   - The member's `is_default` Personal Gallery, materialized on first upload,
 *     keeps its fixed name and its lone uploader-tag criterion and cannot be
 *     deleted; only its description, sort order and external links are editable.
 *     No other member-owned gallery may take that name or the row id derived from
 *     it, on create or on rename, because the upload path re-derives that id and
 *     probes by that name. Enforced on every actor, admin included.
 *   - FH-owned writes JSON sidecar at `/curated/galleries/<slug>.json` after commit
 *     (sidecar I/O failure logged but does not roll back DB). Member-owned never
 *     touches the filesystem.
 *   - Gallery edit never mutates item tags; current-items display rows derive from
 *     criteria/exclude tags via `listGalleryItemsForDisplay`.
 *   - `createGallery` and `updateGallery` accept `externalLinks`; each URL passes
 *     `validateExternalUrl` (DD §3.17) inside the same transaction. Per-gallery cap
 *     `config.galleryMaxExternalLinks`.
 *   - Every write that touches the authoring tree is gated on
 *     `config.allowCuratedSidecarWrites` (dev only), decided in this service
 *     rather than by any caller: URL-reference, photo and video uploads, edits,
 *     and FH-owned gallery writes. A category supplied where the tree is not
 *     writable is accepted and unused, since it names a directory that does not
 *     exist there.
 *   - Provenance ids are checked against `media_sources` before any write, so an
 *     unregistered id is a field-level validation error rather than a
 *     foreign-key failure surfacing as a server error.
 *   - Pre-go-live guardrail: where curated sidecar writes are on (dev, and the
 *     integration-test fixture, which set `config.allowCuratedSidecarWrites`), a
 *     curated/system write (curator photo/video/url-ref upload, edit, delete, and
 *     FH-owned gallery create/update/delete) refuses a seeded test-persona actor
 *     (`assertCuratorActorMayWriteCurated`); real maintainer accounts carry
 *     ordinary ids and pass. In staging and
 *     production the sidecar write is off, so any admin may curate and the guard
 *     is a no-op. Member-owned writes never call it.
 *   - Member-gallery form uploads carry user-supplied `uploadTags` (never
 *     auto-stamped from gallery criteria); auto-applied tags are exactly
 *     `#by_<slug>` (member) and `#curated` (FH-owned).
 *   - An administrator writing to a gallery that belongs to another member is
 *     moderation rather than authoring, and obeys the correction rules: it takes
 *     a mandatory reason, records each changed value before and after, writes no
 *     ledger row when nothing moved, and tells the owner. The name and the
 *     description are that member's own words, so the administrator's only move
 *     on them is to clear them: the new values are derived from the clear flags
 *     and whatever the request carried in those two fields is discarded, which
 *     makes a rewrite impossible rather than merely refused. Ordering and the
 *     tag sets are structure, not words, and an administrator may set them.
 *     A cleared name becomes a neutral placeholder, numbered where the owner
 *     already holds one, because the column is NOT NULL and unique per owner.
 *   - A tag an administrator has retired is refused at the one resolve-or-create
 *     lookup every tag application runs through, for media tags and for both
 *     gallery tag sets. The retired tag's row survives so its normalized form
 *     stays reserved, which is exactly why this lookup has to refuse it.
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
 *   - audit_entries append per upload or gallery mutation, including
 *     `media.member_gallery_moderated` when an administrator acts on a gallery
 *     another member owns
 *   - outbox enqueue of the gallery owner's notice on that moderation, after the
 *     transaction commits so a rolled-back change cannot announce itself
 *
 * Service shape: factory `createCuratorMediaService(deps)`. Deps include
 * MediaStorageAdapter, ImageProcessingAdapter, and VideoTranscodingAdapter (the
 * factory pattern allows test injection).
 */
import { randomUUID } from 'crypto';
import path from 'path';
import { GALLERY_ITEMS_QUERY_CAP, countGalleryItemsByCriteria, listGalleryItemsForDisplay, media, mediaTags as mediaTagsDb, queryCuratorMediaTags, tagStats, transaction, type MediaJobRow } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { detectImageType, RENDITION_IMAGE_MIME } from '../lib/imageProcessing';
import { detectVideoFormat, type TranscodedVideo } from '../lib/videoProcessing';
import { Semaphore } from '../lib/semaphore';
import { MediaStorageAdapter, getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter, getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { rejectImageAsValidation } from './imageRejection';
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
  urlRefMediaId,
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
  writeGallerySidecarFile,
  deleteGallerySidecarFile,
  deriveGallerySidecarPath,
  type GallerySidecarData,
} from '../lib/curatorGallerySidecar';
import { writeSidecar } from '../lib/curatorSidecar';
import { promises as fsp } from 'fs';
import { validateExternalUrl } from '../lib/externalUrlValidator';
import { normalizeLineEndings } from '../lib/multilineText';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { hasTier1Benefits } from './tierPredicates';
import { appendAuditEntry } from './auditService';
import { runSqliteRead } from './sqliteRetry';
import {
  hashtagDiscoveryService,
  type MemberTagSuggestions,
  type TagChipShape,
  type HashtagStatsSummary,
} from './hashtagDiscoveryService';
import { emailService } from './emailService';
import { buildTierBenefitNotice } from './tierBenefitNotice';
// Type-only, so the gallery list can name the shape of the community examples
// it is handed without importing the media service that reads them: that module
// already imports this one, and a value import would close the loop.
import type { GalleryItem } from './mediaService';
import type { PageViewModel, TierBenefitNotice } from '../types/page';

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = config.videoMaxBytes;
/** The limit as the reader sees it, so message and check can never disagree. */
export const VIDEO_MAX_MB = Math.floor(VIDEO_MAX_BYTES / (1024 * 1024));
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
  // a DB or media-store wipe. Per DD §1.13, before go-live /curated/ is
  // the source of truth and the inline storage.put + media_items insert
  // below are the UX optimization (line 575); at go-live /curated/ is
  // retired and the persistent DB becomes the source of truth. The admin upload controller passes this field
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
  mediaId: string;
  sidecarWritten: boolean;
  filename: string | null;
  filePath: string | null;
  overwritten: boolean;
  category: string;
}

export interface CuratorUploadResult {
  mediaId: string;
  displayUrl: string;
}

export interface MemberPhotoInput {
  memberId: string;
  // Set true when the actor holds the admin role; admins bypass the
  // per-member upload throttle.
  actorIsAdmin?: boolean;
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
  // Set true when the actor holds the admin role; admins bypass the
  // per-member submission throttle. The controller is the source of truth
  // for the role flag.
  actorIsAdmin?: boolean;
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
// Sidecar / creator / clip-range fields are admin-only and not surfaced on
// the member edit page.
export interface MemberMediaItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  tags: string[];
  externalUrl: string | null;
}

export interface MemberMediaEditInput {
  memberId: string;
  // Set true when the actor holds the admin role; admins bypass the
  // per-member edit throttle.
  actorIsAdmin?: boolean;
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
 * Per-actor write throttle. Throws RateLimitedError when the bucket is
 * exhausted; controllers map it to 429 with Retry-After.
 */
function throttlePerActor(
  bucket: string,
  actorId: string,
  configKey: string,
  fallbackMax: number,
  label: string,
): void {
  const max = readIntConfig(configKey, fallbackMax);
  const rl = rateLimitHit(`${bucket}:${actorId}`, max, 60);
  if (!rl.allowed) {
    throw new RateLimitedError(
      `${label} Try again in ${rl.retryAfterSeconds} seconds.`,
      rl.retryAfterSeconds,
    );
  }
}

/**
 * Admin curator-surface write throttle. Compromised-admin is the threat
 * model, so the admin role never bypasses this bucket.
 */
function throttleCuratorWrite(adminMemberId: string): void {
  throttlePerActor(
    'curator-write', adminMemberId,
    'curator_write_rate_limit_per_hour', 60,
    'Too many curator operations.',
  );
}

/**
 * Gallery-write throttle shared by the member and admin gallery methods:
 * members get the per-member gallery bucket; admins fold into the
 * curator-write bucket (no bypass, same threat model as other admin writes).
 */
function throttleGalleryWrite(actorMemberId: string, actorIsAdmin: boolean): void {
  if (actorIsAdmin) {
    throttleCuratorWrite(actorMemberId);
    return;
  }
  throttlePerActor(
    'gallery-write', actorMemberId,
    'gallery_write_rate_limit_per_hour', 30,
    'Too many gallery operations.',
  );
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
// (e.g. `gallery_jane_doe_highlights`). Owner-prefixed so two
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
// by hand. Stored as a freeform tag, because the standardized namespace covers
// only the club and event hashtags and the schema's own check would refuse any
// other standard type.
export const CURATED_TAG = '#curated';

// Member-uploader namespace. `#by_<slug>` is auto-applied on every
// member upload as the uploader-attribution marker (parallel to
// #curated for FH uploads); user-supplied tags in this namespace are
// rejected so attribution cannot be forged. The freeform `#<slug>`
// remains an ordinary tag any user may apply (mentions, pre-tagging
// unsigned/historical persons).
export const UPLOADER_TAG_PREFIX = '#by_';

// The name a cleared gallery takes when an administrator moderates a member's
// own. The column is NOT NULL and unique per owner, so a cleared name can be
// neither empty nor a repeat of another of the same member's galleries. The
// number is disambiguation between two cleared galleries, not a name anybody
// chose, and it is what stops a second clear failing on the unique index and
// leaving abusive words standing.
const CLEARED_GALLERY_NAME = 'Gallery';
const CLEARED_NAME_LIMIT = 200;
const MAX_MODERATION_REASON = 500;

/** How each gallery field is named in the ledger and in the owner's notice. */
const GALLERY_FIELD_PHRASE: Record<string, string> = {
  name:          "the gallery's name",
  description:   "the gallery's description",
  sortOrder:     'the order its items appear in',
  criteriaTags:  'which hashtags decide what the gallery shows',
  excludeTags:   'which hashtags it leaves out',
  externalLinks: 'the links beside it',
};

function validateTags(tags: string[]): void {
  for (const tag of tags) {
    if (!tag.startsWith('#')) {
      throw new ValidationError(`Tag must start with '#': got "${tag}"`);
    }
    // Mixed case is accepted: the original capitalization is preserved for
    // display and matching is case-insensitive. The reserved-namespace guards
    // below compare on the lowercased form so attribution cannot be forged with
    // a case variant (e.g. #CURATED or #By_<slug>).
    const normalized = tag.toLowerCase();
    if (normalized === CURATED_TAG) {
      throw new ValidationError(
        `The ${CURATED_TAG} tag is auto-applied by the curator pipeline and must not appear in input.`,
      );
    }
    if (normalized.startsWith(UPLOADER_TAG_PREFIX)) {
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

// Provenance ids are typed by hand on the curator forms and land in a column
// carrying a foreign key into media_sources. An unregistered id would surface
// as an engine-level constraint failure, which reaches the operator as a server
// error rather than as the fixable typo it is, so it is checked here first.
// A null clears the attribution and needs no lookup.
function assertKnownSourceId(sourceId: string | null | undefined): void {
  if (sourceId === undefined || sourceId === null) return;
  const found = media.mediaSourceExists.get(sourceId) as { found: number } | undefined;
  if (!found) {
    throw new ValidationError(
      `Unknown source id: "${sourceId}". Register the source before attributing media to it.`,
    );
  }
}

// Gallery-editing tag pattern: leading '#' then alphanumeric + underscores
// only, max 100 chars. Unlike validateTags
// this DOES allow `#curated` (the existing curated-freestyle-tricks gallery
// uses it as a criteria tag). The `#by_*` namespace is system-managed
// (auto-applied as the gallery's uploader-scoping criterion) and is
// rejected from caller input here, matching the validateTags rule.
const GALLERY_TAG_PATTERN = /^#[a-zA-Z0-9_]{1,99}$/;

function validateGalleryTag(tag: string, role: 'criteria' | 'exclude'): void {
  if (!GALLERY_TAG_PATTERN.test(tag)) {
    throw new ValidationError(
      `${role} tag must be '#' + alphanumeric/underscore (max 100 chars): got "${tag}"`,
    );
  }
  // Matching is case-insensitive, so the reserved uploader namespace is rejected
  // whatever case it is supplied in.
  if (tag.toLowerCase().startsWith(UPLOADER_TAG_PREFIX)) {
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

// The one place a retired tag could come back. Retirement detaches an abusive
// tag from every media item and gallery criterion that named it, but leaves the
// tags row standing so its normalized form stays reserved; this lookup would
// otherwise find that row and hand the word straight back to the next member
// who types it. Every other tag surface reads through media_tags or tag_stats,
// which retirement emptied, so closing it here closes it everywhere.
function resolveTagIdOrCreate(
  normalized: string,
  display: string,
  now: string,
  field: string,
): string {
  const existing = mediaTagsDb.findTagByNormalized.get(normalized) as
    | { id: string; retired_at: string | null }
    | undefined;
  if (existing) {
    if (existing.retired_at !== null) {
      const message = `The hashtag ${display} is no longer available.`;
      throw new ValidationError(message, { fieldErrors: { [field]: message } });
    }
    return existing.id;
  }
  const tagId = newTagId();
  mediaTagsDb.insertTag.run(tagId, now, now, normalized, display);
  return tagId;
}

function applyTags(mediaId: string, tags: string[], now: string): string[] {
  const tagIds: string[] = [];
  // Tags are matched case-insensitively on the lowercased form; the original
  // capitalization is kept for display. Two case variants of the same tag
  // (#Foo and #foo) collapse to one row, so dedupe by normalized form here to
  // respect the (media_id, tag_id) uniqueness on media_tags.
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const tagId = resolveTagIdOrCreate(normalized, tag, now, 'tags');
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

// Default per-member gallery materialized on first upload. It is not a gallery
// the member composed, so it is neither theirs to rename nor theirs to delete,
// and assertPersonalGalleryIsIntact enforces both. Two things depend on that.
// Its row id is derived from this exact name, and the find-by-name probe in
// ensureDefaultPersonalGalleryTx recomputes the same id, so a renamed row would
// still hold the id the next upload tries to claim and that upload would fail
// on the primary key. And its single criteria tag is the member's
// uploader-attribution tag (#by_<slug>), which is what makes it the one listing
// holding everything they have uploaded: criteria are combined with AND, so any
// added criteria or exclude tag would quietly narrow it below that guarantee.
// The uploader tag also means nothing another member tags with the freeform
// `#<slug>` can pollute it.
const PERSONAL_GALLERY_NAME = 'Personal Gallery';
const PERSONAL_GALLERY_DESCRIPTION = 'Everything I have uploaded.';

// Refuses any edit that would change what the Personal Gallery is: its name,
// which carries its row id, and its criteria and exclude sets, which carry its
// promise to hold everything the member has uploaded. Description, sort order
// and external links are ordinary preferences and stay editable. The submitted
// criteria set is compared before the uploader tag is prepended, so an
// unchanged form submission (which sends an empty criteria box, the uploader
// tag being filtered out of the form's display string) passes.
//
// Applies to every actor, not only the owner: the id collision a rename sets up
// breaks the member's next upload whoever performed the rename, and no admin
// surface offers these operations on a member-owned gallery.
function assertPersonalGalleryIsIntact(
  isDefault: boolean,
  submitted: { name: string; criteriaTags: string[]; excludeTags: string[] },
): void {
  if (!isDefault) return;
  if (submitted.name !== PERSONAL_GALLERY_NAME) {
    throw new ValidationError(
      `Your ${PERSONAL_GALLERY_NAME} cannot be renamed. It is created for you and collects everything you upload.`,
      { fieldErrors: { name: `This gallery keeps the name ${PERSONAL_GALLERY_NAME}.` } },
    );
  }
  if (submitted.criteriaTags.length > 0 || submitted.excludeTags.length > 0) {
    throw new ValidationError(
      `Your ${PERSONAL_GALLERY_NAME} always shows everything you have uploaded, so it takes no criteria or exclude tags. Create a named gallery to collect a subset.`,
      {
        fieldErrors: {
          ...(submitted.criteriaTags.length > 0 && { criteriaTags: 'Leave this empty for this gallery.' }),
          ...(submitted.excludeTags.length > 0 && { excludeTags: 'Leave this empty for this gallery.' }),
        },
      },
    );
  }
}

// Refuses a member-owned gallery that would claim the Personal Gallery's
// identity, which is the other half of the same rule: the guard above keeps the
// Personal Gallery from being renamed away from its name, and this one keeps any
// other gallery from taking that name over. Both failures are the same failure.
// A gallery standing on that name is adopted by the find-by-name probe, so the
// member's uploads land in a gallery they composed, which can carry narrower
// criteria and is not protected. A gallery standing on the derived id without
// the name is worse: the probe misses it, the materializing insert collides on
// the primary key, and that path has no retry and no catch, so the member's next
// upload fails and keeps failing. Comparing derived ids catches both, and every
// spelling that slugifies alike with them.
function assertDoesNotClaimPersonalGallery(ownerSlug: string, name: string): void {
  const personalGalleryId = buildMemberGalleryId(ownerSlug, PERSONAL_GALLERY_NAME, 0);
  if (buildMemberGalleryId(ownerSlug, name, 0) !== personalGalleryId) return;
  throw new ValidationError(
    `That name is reserved for your ${PERSONAL_GALLERY_NAME}, the one created for you that collects everything you upload. Choose another name.`,
    { fieldErrors: { name: 'Choose a different name.' } },
  );
}

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
  // into the sidecar JSON; ignored on DB-direct rows. `creator`/`sourceId`
  // accept null to clear the field; absent (undefined) leaves the existing
  // sidecar value alone. `startSeconds`/`endSeconds` follow the same rule.
  creator?: string | null;
  sourceId?: string | null;
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
  startSeconds: number | null;
  endSeconds: number | null;
  // External URL on the media_items row (DD §3.17 vetted). NULL when
  // unset.
  externalUrl: string | null;
  // Pre-shaped for the edit form: the thumbnail-URL field applies only to
  // Vimeo references (YouTube thumbnails derive from the video id).
  // Populated by getMediaItem; listMedia leaves it unset.
  showThumbnailField?: boolean;
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
  // True for the member's auto-materialized Personal Gallery, whose name and
  // criteria the service refuses to change. The edit form reads this to present
  // those parts as fixed rather than offering inputs that would be rejected.
  isDefault: boolean;
  // Whose gallery this is. The admin curator surface serves two cohorts through
  // one URL: Footbag Hacky's own galleries, which an administrator authors, and
  // a member's, where an administrator is moderating somebody else's record and
  // may remove the words but never rewrite them. The surface has to know which
  // one it is looking at, and the owner's name is what the moderation form
  // shows so an administrator can see whose words these are.
  isSystemOwned: boolean;
  ownerMemberId: string;
  ownerDisplayName: string;
  criteriaTags: string[];   // tag-display strings e.g. '#curated'
  // Pre-shaped display string for the owner-facing edit form: criteriaTags
  // joined by space with the auto-applied `#by_<slug>` uploader tag
  // filtered out. Controllers pass through; no controller-side filtering.
  criteriaTagsDisplayString: string;
  excludeTags: string[];
  // Items currently matching the gallery's criteria/exclude. Drives the
  // edit-form's read-only thumbnail display. Detach (and other item
  // mutations) happen on the item's own edit page; the gallery edit
  // page never modifies item tags. editHref points at the item's edit page
  // for the requesting surface (member-owned vs admin curator).
  // isUnavailableEmbed marks items the public gallery hides via the
  // #unavailable_embed tag, so their presence here is explained.
  currentItems: Array<{
    mediaId: string;
    mediaType: 'photo' | 'video';
    thumbnailUrl: string;
    caption: string | null;
    sourceFilename: string;
    editHref: string;
    isUnavailableEmbed: boolean;
    // Topical hashtags on the item (the uploader marker and #curated are
    // filtered out), so the owner can see how each item is tagged while
    // managing the gallery.
    tags: string[];
  }>;
  // True when the matching set exceeds the single-page render cap and
  // currentItems holds only the first page-worth; the form shows a notice.
  currentItemsTruncated: boolean;
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
  // True for the member's auto-materialized Personal Gallery, which the owner
  // may open but may not rename or delete. FH-owned galleries are never it.
  isDefault: boolean;
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
  /**
   * The administrator's mandatory reason, on the moderation door only: an
   * administrator acting on a gallery that belongs to another member. An
   * owner's own edit of their own gallery carries none, and neither does an
   * administrator authoring Footbag Hacky's.
   */
  reason?: string;
  /**
   * Which of the member's own words come off, on the moderation door only.
   * The two fields are the member's writing, so the administrator's control is
   * a clear rather than an edit box: the service derives the new values from
   * these flags and discards whatever the request carried, which makes a
   * rewrite impossible rather than merely refused.
   */
  moderation?: { clearName: boolean; clearDescription: boolean };
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
  // Owner's member slug (e.g. `jane_doe`). Required for member-owned
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
  // Provenance and clip bounds for URL-reference items. Read from the row so
  // the edit form shows what is stored rather than depending on an authoring
  // file that exists only on a developer machine.
  source_id?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  // Present on the owner-scoped read; the curator-side statement omits it.
  is_avatar?: number;
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

// Defense-in-depth tier gate applied at every member-write
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

// Pre-go-live guardrail protecting the real /curated content. It only applies
// where curated writes edit the persistent on-disk sidecar files, which is dev
// (config.allowCuratedSidecarWrites): there /curated/ is the committed
// source-of-truth working tree, so a curated write mutates real git-tracked
// data. In staging and production the sidecar write is off (curated writes land
// in the DB and object store only), so any admin may curate and this is a no-op.
// Within dev, seeded test personas must never author, edit, or delete curated
// content: real maintainer accounts register through the real flow and carry
// ordinary member ids, so they pass, while a
// switchable seeded persona admin is refused. Member-owned media never calls
// this (only the curated/system write paths do).
function assertCuratorActorMayWriteCurated(actorMemberId: string): void {
  if (config.allowCuratedSidecarWrites && isSeededTestPersonaMemberId(actorMemberId)) {
    throw new ForbiddenError(
      'Curated media cannot be authored by a test persona in dev, where it would mutate the persistent /curated sidecar files (pre-go-live guardrail).',
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
    // A non-test process (the e2e stack) redirects the curated root to a
    // throwaway directory via CURATED_ROOT_DIR so its writes never touch
    // the committed /curated/ tree.
    if (config.curatedRootDirOverride) return config.curatedRootDirOverride;
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
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      throttleCuratorWrite(input.adminMemberId);
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
      const processed = await rejectImageAsValidation(imageProcessor.processPhoto(input.photoBuffer));

      const mediaId = newMediaId();
      const thumbKey = `${systemMemberId}/detached/${mediaId}-thumb.jpg`;
      const displayKey = `${systemMemberId}/detached/${mediaId}-display.jpg`;

      await storage.put(thumbKey, processed.thumb);
      await storage.put(displayKey, processed.display);

      // /curated/ source-of-truth write per DD §1.13 (the pre-go-live
      // phase; at go-live /curated/ is retired and the persistent DB is
      // the source of truth). When a category is
      // provided, the source bytes plus a sibling sidecar JSON land under
      // <curatedRootDir>/<category>/ so the upload survives a DB or media-
      // store wipe and the seeder can rebuild from it. Identity column for
      // reconcile is media_items.source_filename, set to the same on-disk
      // name. Without a writable tree or without a category, the write is
      // skipped and the storage.put + media_items insert above are the only
      // writes. The tree gate belongs here rather than at the caller: this is
      // the code that touches the disk, and a caller that supplies a category
      // where no tree exists would otherwise create one inside the container
      // that no deploy preserves. Done before the DB transaction so the
      // sidecar identity matches the inserted row.
      let recordedSourceFilename = input.sourceFilename;
      if (config.allowCuratedSidecarWrites && input.category) {
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
            recordedSourceFilename, RENDITION_IMAGE_MIME,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, systemMemberId);
          }
          appliedTagIds = applyTagsForCurator(mediaId, input.tags, now);
          appendAuditEntry({
            actionType: 'media.curated_uploaded',
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
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      throttleCuratorWrite(input.adminMemberId);
      validateCaption(input.caption);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.videoBuffer.length > VIDEO_MAX_BYTES) {
        throw new ValidationError(`Video is too large. Maximum size is ${VIDEO_MAX_MB} MB.`);
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
          rejectImageAsValidation(imageProcessor.processPhoto(input.posterBuffer)),
        ]);
      } finally {
        transcodeBound.release();
      }

      const mediaId = newMediaId();
      const videoKey = `${systemMemberId}/detached/${mediaId}-video.mp4`;
      const posterDisplayKey = `${systemMemberId}/detached/${mediaId}-poster-display.jpg`;
      const posterThumbKey = `${systemMemberId}/detached/${mediaId}-poster-thumb.jpg`;

      // Content type of the transcoded object, recorded on the row so the
      // stored format is a real column (not inferred from the key extension)
      // and follows the transcoder's actual output format.
      const videoMime = `video/${transcoded.outputFormat}`;
      await storage.put(videoKey, transcoded.bytes, videoMime);
      await storage.put(posterDisplayKey, processed.display);
      await storage.put(posterThumbKey, processed.thumb);

      // /curated/ source-of-truth write per DD §1.13 (pre-go-live; at
      // go-live /curated/ is retired and the persistent DB is the source
      // of truth). Mirrors uploadPhoto
      // (see comment there). Video produces a triple: the source video
      // binary, a sibling poster, and the meta sidecar referencing the
      // poster by its `<slug>.poster.<ext>` name. The seeder's enumerator
      // skips files matching the `*.poster.*` pattern as not-a-primary-
      // binary, so the poster is attached to its parent video via the
      // sidecar's `poster:` field. Gated on a writable tree for the same reason
      // uploadPhoto is: the disk write is decided where the disk is touched.
      let recordedSourceFilename = input.sourceFilename;
      if (config.allowCuratedSidecarWrites && input.category) {
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
            recordedSourceFilename, videoMime,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, systemMemberId);
          }
          appliedTagIds = applyTagsForCurator(mediaId, input.tags, now);
          appendAuditEntry({
            actionType: 'media.curated_uploaded',
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
     * Mirrors uploadVideo's validation (size, magic bytes, caption, tags) and
     * its curator persona guard as defense in depth: the browser is not trusted,
     * and the /sign endpoint's size check binds the user-claimed size, not the
     * actual S3 object size.
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

      // Mirror uploadVideo's persona guard on the async finalize path: a seeded
      // test persona must not author curated content where the /curated working
      // tree is the source of truth (dev). No-op in staging/production.
      assertCuratorActorMayWriteCurated(job.admin_member_id);

      const tags = job.tags.length === 0 ? [] : job.tags.trim().split(/\s+/).filter(Boolean);
      validateCaption(job.caption);
      validateTags(tags);

      // Poster is small (cap 25 MB) and the worker container can hold it
      // inline. Video bytes, whose cap is far larger, are NOT pulled in here — they go
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

      // Everything between the encode starting and the row committing can
      // leave objects behind. The transcode writes the encoded video straight
      // to its final key and the two poster derivatives are uploaded before
      // the row that references them exists, and none of those three keys sit
      // under the pending prefix the lifecycle rule expires. A retry mints a
      // fresh media id and therefore fresh keys, so anything a failure leaves
      // here is referenced by nothing and expires never. Delete what may have
      // been written, best effort, and let the original failure propagate.
      let appliedTagIds: string[] = [];
      try {
        // Slot-1 semaphore prevents two concurrent finalize calls from OOMing
        // the host. Single dispatch endpoint + slot-1 semaphore is belt-and-
        // suspenders against accidental double-dispatch.
        await transcodeBound.acquire();
        let processed: Awaited<ReturnType<ImageProcessingAdapter['processPhoto']>>;
        let transcoded: Awaited<ReturnType<ReturnType<typeof videoTranscoder>['transcodeFromStorage']>>;
        try {
          [transcoded, processed] = await Promise.all([
            videoTranscoder().transcodeFromStorage(job.source_video_key, videoKey),
            rejectImageAsValidation(imageProcessor.processPhoto(posterBuffer)),
          ]);
        } finally {
          transcodeBound.release();
        }
        const videoMime = `video/${transcoded.outputFormat}`;

        // Video object already at videoKey from transcodeFromStorage; only the
        // poster derivatives are uploaded by this process.
        await storage.put(posterDisplayKey, processed.display);
        await storage.put(posterThumbKey, processed.thumb);

        const now = new Date().toISOString();
        const thumbnailUrl = storage.constructURL(posterDisplayKey);

        const shaped = processed;
        transaction(() => {
          media.insertCuratorVideo.run(
            mediaId, now, now,
            systemMemberId, job.caption, now,
            videoKey, thumbnailUrl,
            shaped.widthPx, shaped.heightPx,
            job.source_filename, videoMime,
          );
          appliedTagIds = applyTagsForCurator(mediaId, tags, now);
          appendAuditEntry({
            actionType: 'media.curated_uploaded',
            category: 'media',
            actorType: 'admin',
            actorMemberId: job.admin_member_id,
            entityType: 'media_item',
            entityId: mediaId,
            metadata: { mediaType: 'video', tags, mediaJobId: job.id },
          });
        });
      } catch (err) {
        await Promise.all([
          storage.delete(videoKey).catch(() => undefined),
          storage.delete(posterDisplayKey).catch(() => undefined),
          storage.delete(posterThumbKey).catch(() => undefined),
        ]);
        throw err;
      }
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      // Best-effort cleanup of pending sources. S3 lifecycle on the pending/
      // prefix is the safety net if these calls fail.
      await Promise.all([
        storage.delete(job.source_video_key).catch(() => undefined),
        storage.delete(job.source_poster_key).catch(() => undefined),
      ]);

      return { mediaId, displayUrl: storage.constructURL(posterDisplayKey) };
    },

    /**
     * Sign the two presigned-PUT targets for one async curator video upload
     * (source video + poster). The browser PUTs the bytes directly to storage
     * with these URLs, so large source bytes never traverse nginx or
     * CloudFront. Adapter access stays inside the service; the controller owns
     * only request validation and the media-job row. The per-actor
     * curator-write throttle for this path sits on the job row the same call
     * creates, so signing is gated once rather than twice.
     */
    async signCuratorUploadTargets(input: {
      sourceVideoKey: string;
      videoContentType: string;
      sourcePosterKey: string;
      posterContentType: string;
      ttlSeconds: number;
    }): Promise<{ videoUrl: string; posterUrl: string }> {
      const [videoUrl, posterUrl] = await Promise.all([
        storage.generatePresignedPutUrl(input.sourceVideoKey, input.videoContentType, input.ttlSeconds),
        storage.generatePresignedPutUrl(input.sourcePosterKey, input.posterContentType, input.ttlSeconds),
      ]);
      return { videoUrl, posterUrl };
    },

    /**
     * Read the uploaded sizes of a curator video job's source video and poster
     * objects (null when an object is not present yet). The presigned PUT
     * cannot bind a size, so finalize measures the bytes actually uploaded
     * against the per-type maxima; adapter access stays inside the service.
     */
    async headCuratorUploadSizes(input: {
      sourceVideoKey: string;
      sourcePosterKey: string;
    }): Promise<{ videoSize: number | null; posterSize: number | null }> {
      const [videoSize, posterSize] = await Promise.all([
        storage.headSize(input.sourceVideoKey),
        storage.headSize(input.sourcePosterKey),
      ]);
      return { videoSize, posterSize };
    },

    async uploadUrlReference(
      input: CuratorUrlReferenceInput,
    ): Promise<CuratorUrlReferenceResult> {
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      validateCaption(input.title);
      validateTags(input.tags);
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);
      assertKnownSourceId(input.sourceId);

      if (input.videoPlatform !== 'youtube' && input.videoPlatform !== 'vimeo') {
        throw new ValidationError('Choose YouTube or Vimeo for the video platform.');
      }
      // The category names a subdirectory of the authoring tree, so it is only
      // meaningful where that tree is written. Where it is not, the database row
      // is the whole write and a category has nowhere to go: an absent one is
      // accepted, and a supplied one still has to be well formed rather than
      // silently ignored in a shape that would break a later authoring run.
      if (config.allowCuratedSidecarWrites || input.category) {
        if (!isValidCategoryName(input.category)) {
          throw new ValidationError(
            `Category name must be lowercase letters, digits, or underscores: got ${JSON.stringify(input.category)}.`,
          );
        }
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

      const videoId =
        input.videoPlatform === 'youtube'
          ? parseYouTubeVideoId(input.videoUrl)
          : parseVimeoVideoId(input.videoUrl);
      if (!videoId) {
        throw new ValidationError(
          `Could not extract a ${input.videoPlatform} video id from the URL.`,
        );
      }

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const mediaId = urlRefMediaId(input.videoPlatform, input.videoUrl);
      const now = new Date().toISOString();

      // Whether to write the /curated/ authoring sidecar is a service-layer
      // policy decision gated on config.allowCuratedSidecarWrites (dev only),
      // the same purpose-named flag the FH gallery sidecar uses: in dev curator
      // content is committed to git and the seeder rebuilds the DB from it; in
      // staging/prod the persistent DB is the source of truth (DD §1.13) and
      // the media_items row is the only write. Filesystem I/O stays outside the
      // DB transaction.
      let sidecarResult: WriteUrlSidecarResult | null = null;
      if (config.allowCuratedSidecarWrites) {
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
        const fsp = await import('fs/promises');
        await fsp.mkdir(categoryDir, { recursive: true });
        sidecarResult = await writeUrlSidecarFile(
          categoryDir, filename, formatUrlSidecarJson(sidecarData),
        );
      }
      const sidecarFilename = sidecarResult?.filename ?? null;

      // URL-reference curator row, written directly the same way uploadPhoto /
      // uploadVideo write theirs, minus the S3 step (url-refs host no bytes).
      // #curated + tags via the shared applyTagsForCurator. The deterministic
      // (platform, url) media_id matches the seeder's _url_ref_media_id, so a
      // pre-go-live seeder run INSERT-OR-REPLACEs this same row rather than
      // duplicating it; re-upload is likewise idempotent. Tags are cleared and
      // re-applied (as in editMedia) so tag_stats stay accurate on re-upload.
      const oldTagIds = (tagStats.listTagIdsByMediaId.all(mediaId) as { tag_id: string }[])
        .map((r) => r.tag_id);
      let newTagIds: string[] = [];
      transaction(() => {
        media.insertCuratorUrlReference.run(
          mediaId, now, now,
          systemMemberId, input.title, now,
          input.videoPlatform, videoId, input.videoUrl, thumbnailUrl,
          input.sourceId, input.startSeconds, input.endSeconds,
        );
        mediaTagsDb.deleteMediaTagsByMediaId.run(mediaId);
        newTagIds = applyTagsForCurator(mediaId, input.tags, now);
        if (normalizedExternalUrl !== null) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, systemMemberId);
        }
        appendAuditEntry({
          actionType: 'media.curated_url_reference_added',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: sidecarFilename ? 'curated_sidecar' : 'media_item',
          entityId: sidecarFilename ?? mediaId,
          metadata: {
            mediaId,
            category: input.category,
            videoPlatform: input.videoPlatform,
            videoUrl: input.videoUrl,
            sidecarWritten: sidecarResult !== null,
            ...(sidecarResult && { overwritten: sidecarResult.overwritten }),
            tags: input.tags,
          },
        });
      });
      hashtagDiscoveryService.decrementTagStats(oldTagIds);
      hashtagDiscoveryService.incrementTagStats(newTagIds);

      return {
        mediaId,
        sidecarWritten: sidecarResult !== null,
        filename: sidecarResult?.filename ?? null,
        filePath: sidecarResult?.filePath ?? null,
        overwritten: sidecarResult?.overwritten ?? false,
        category: input.category,
      };
    },

    async editMedia(input: CuratorMediaEditInput): Promise<CuratorMediaEditResult> {
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      throttleCuratorWrite(input.adminMemberId);
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
      assertKnownSourceId(input.sourceId);

      const row = runSqliteRead('getCuratorMediaItemById', () =>
        media.getCuratorMediaItemById.get(input.mediaId),
      ) as MediaItemRow | undefined;
      if (!row) {
        throw new NotFoundError(`Curator media not found: ${input.mediaId}`);
      }

      const now = new Date().toISOString();
      const isUrlReference = row.video_platform === 'youtube' || row.video_platform === 'vimeo';

      // Where the authoring tree is writable, it is the source of truth: rewrite
      // the JSON first, then update the DB inline so the list view reflects the
      // change without waiting for the next seeder run. Where it is not writable
      // the tree does not exist at all and the DB write below is the whole edit,
      // which is the same gate every other write path in this service applies.
      const editsAuthoringTree = isUrlReference && config.allowCuratedSidecarWrites;

      let auditEntityId = input.mediaId;
      let auditEntityType: 'curated_sidecar' | 'media_item' = 'media_item';
      const auditActionType: 'media.curated_edited' | 'media.curated_url_reference_edited' =
        isUrlReference ? 'media.curated_url_reference_edited' : 'media.curated_edited';
      if (editsAuthoringTree) {
        const sidecarFilePath = await resolveSidecarForRow(getCuratedRootDir(), row);
        if (!sidecarFilePath) {
          // Writes are on, so this row was authored from a file that should still
          // be on disk next to its siblings. Its absence is a corrupted working
          // tree, not a state the running application is meant to handle.
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

        auditEntityType = 'curated_sidecar';
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
          media.updateMediaItemExternalUrl.run(
            normalizedExternalUrlEdit, now, now, 'admin-act-as',
            input.mediaId, row.uploader_member_id,
          );
        }
        if (input.sourceId !== undefined) {
          media.updateCuratorMediaSourceId.run(input.sourceId, now, input.mediaId);
        }
        // Both bounds are written whenever either one is edited, so the pair the
        // row ends up with is the pair that was checked against the ordering
        // constraint. An untouched bound is re-supplied from the loaded row.
        if (input.startSeconds !== undefined || input.endSeconds !== undefined) {
          const nextStart = input.startSeconds !== undefined
            ? input.startSeconds : (row.start_seconds ?? null);
          const nextEnd = input.endSeconds !== undefined
            ? input.endSeconds : (row.end_seconds ?? null);
          media.updateCuratorMediaClipRange.run(nextStart, nextEnd, now, input.mediaId);
        }
        if (input.thumbnailUrl !== undefined) {
          media.updateCuratorMediaThumbnailUrl.run(input.thumbnailUrl, now, input.mediaId);
        }
        appendAuditEntry({
          actionType: auditActionType,
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          entityType: auditEntityType,
          entityId: auditEntityId,
          metadata: {
            mediaId: input.mediaId,
            captionChanged: input.caption !== undefined,
            tagsChanged: input.tags !== undefined,
            externalUrlChanged: input.externalUrl !== undefined,
            sourceIdChanged: input.sourceId !== undefined,
            clipRangeChanged: input.startSeconds !== undefined || input.endSeconds !== undefined,
            thumbnailUrlChanged: input.thumbnailUrl !== undefined,
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
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      throttleCuratorWrite(input.adminMemberId);
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
        if (row.video_id) {
          keysToDelete.push(row.video_id);
          // An uploaded video's poster-thumb companion is generated at upload
          // but persisted to no column, so re-derive it from the video key to
          // avoid orphaning it in storage. The poster-display key is already
          // cleaned via thumbnail_url below.
          if (row.video_id.endsWith('-video.mp4')) {
            keysToDelete.push(row.video_id.slice(0, -'-video.mp4'.length) + '-poster-thumb.jpg');
          }
        }
        if (row.thumbnail_url && row.thumbnail_url.startsWith('/media-store/')) {
          keysToDelete.push(row.thumbnail_url.slice('/media-store/'.length));
        }
      }

      const deletedTagIds = (tagStats.listTagIdsByMediaId.all(input.mediaId) as { tag_id: string }[]).map(r => r.tag_id);

      transaction(() => {
        mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
        media.deleteMediaItem.run(input.mediaId);
        appendAuditEntry({
          actionType: isSidecarBacked ? 'media.curated_url_reference_deleted' : 'media.curated_deleted',
          category: 'media',
          actorType: 'admin',
          actorMemberId: input.adminMemberId,
          // The entity is the authoring file only when one was actually found and
          // unlinked. Naming a file the delete never touched puts a claim in the
          // immutable ledger that nothing on disk supports.
          entityType: sidecarFilename ? 'curated_sidecar' : 'media_item',
          entityId: sidecarFilename ?? input.mediaId,
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

      // Provenance and clip bounds come from the row, which holds them in every
      // environment and is the only source on a deployed host, where no
      // authoring tree exists. Reading them from a file instead would show the
      // form blank fields over stored values and let a save discard them.
      let creator: string | null = null;
      let sourceId: string | null = row.source_id ?? null;
      let startSeconds: number | null = row.start_seconds ?? null;
      let endSeconds: number | null = row.end_seconds ?? null;
      // The remaining authoring-only fields have no column, so they can be
      // surfaced only where the tree exists. Best-effort: a missing or malformed
      // file leaves them null and the form still renders everything else.
      if (row.video_platform === 'youtube' || row.video_platform === 'vimeo') {
        const sidecarFilePath = await resolveSidecarForRow(getCuratedRootDir(), row);
        if (sidecarFilePath) {
          try {
            const sidecar = await readUrlSidecarFile(sidecarFilePath);
            creator = sidecar.creator ?? null;
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
        startSeconds,
        endSeconds,
        externalUrl: row.external_url,
        showThumbnailField: row.video_platform === 'vimeo',
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
            // FH-owned galleries are all deliberately composed; the default
            // Personal Gallery belongs to a member and never appears here.
            isDefault: false,
          };
        });
      });
    },

    // Loads a single gallery's editable fields. Returns the current
    // name, description, sort_order, criteria tags, and exclude tags.
    // When `restrictToOwnerId` is supplied, throws NotFoundError if the
    // gallery's owner does not match (used by member routes so a member
    // sees a 404 rather than a 403 for a gallery they don't own —
    // matches the existing owner-check/renderNotFound convention).
    // Without the restriction, returns any gallery (admin moderation +
    // public read paths use this).
    getGalleryForEdit(
      galleryId: string,
      restrictToOwnerId?: string,
      opts: { memberKey?: string } = {},
    ): CuratorGalleryEditView {
      return runSqliteRead('getGalleryForEdit', () => {
        const g = media.getNamedGalleryById.get(galleryId) as
          | {
            id: string; name: string; description: string;
            sort_order: GallerySortOrderValue; owner_member_id: string;
            is_default: number; is_system: number; owner_display_name: string;
          }
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
        // Cap+1 fetch so a broad criteria set cannot fan the edit grid out
        // into an unbounded render; the form shows a truncation notice.
        const itemRowsFetched = listGalleryItemsForDisplay(
          criteriaTagIds, excludeTagIds, GALLERY_ITEMS_QUERY_CAP + 1,
        );
        const currentItemsTruncated = itemRowsFetched.length > GALLERY_ITEMS_QUERY_CAP;
        const itemRows = currentItemsTruncated
          ? itemRowsFetched.slice(0, GALLERY_ITEMS_QUERY_CAP)
          : itemRowsFetched;
        // Topical hashtags per item for the management display. The uploader
        // marker (#by_<slug>) and #curated are system markers, not content, so
        // they are filtered out.
        const itemTagRows = itemRows.length
          ? queryCuratorMediaTags(itemRows.map((r) => r.id))
          : [];
        const tagsByMediaId = new Map<string, string[]>();
        for (const tr of itemTagRows) {
          const norm = tr.tag_normalized.toLowerCase();
          if (norm.startsWith(UPLOADER_TAG_PREFIX) || norm === CURATED_TAG) continue;
          const list = tagsByMediaId.get(tr.media_id);
          if (list) list.push(tr.tag_display);
          else tagsByMediaId.set(tr.media_id, [tr.tag_display]);
        }
        const currentItems = itemRows.map((r) => ({
          mediaId: r.id,
          mediaType: r.media_type,
          thumbnailUrl: deriveListThumbnail(r),
          caption: r.caption,
          sourceFilename: r.source_filename,
          // Member-owned galleries edit items under the member's media
          // routes; the admin curator surface has its own.
          editHref: opts.memberKey
            ? `/members/${opts.memberKey}/media/${r.id}/edit`
            : `/admin/curator/media/${r.id}/edit`,
          isUnavailableEmbed: r.is_unavailable_embed === 1,
          tags: tagsByMediaId.get(r.id) ?? [],
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
          isDefault: g.is_default === 1,
          isSystemOwned: g.is_system === 1,
          ownerMemberId: g.owner_member_id,
          ownerDisplayName: g.owner_display_name,
          criteriaTags: criteriaTagDisplays,
          criteriaTagsDisplayString: criteriaTagDisplays
            .filter((t) => !t.toLowerCase().startsWith(UPLOADER_TAG_PREFIX))
            .join(' '),
          excludeTags: excludeTagRows.map((t) => t.tag_display),
          currentItems,
          currentItemsTruncated,
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
    // gallery. Writes an `media.curated_gallery_updated` / `media.member_gallery_updated`
    // audit row inside the same transaction as the write.
    async updateGallery(input: CuratorGalleryUpdateInput): Promise<void> {
      const { actorMemberId, actorIsAdmin, galleryId, updates } = input;
      throttleGalleryWrite(actorMemberId, actorIsAdmin);
      assertTier1Benefits(actorMemberId);

      const validated = await validateGalleryUpdates(updates);

      const existing = media.getNamedGalleryById.get(galleryId) as
        | {
          id: string; owner_member_id: string; is_system: number; is_default: number;
          owner_slug: string; name: string; description: string;
          sort_order: GallerySortOrderValue; owner_display_name: string;
        }
        | undefined;
      if (!existing) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      authorizeGalleryActor(actorMemberId, actorIsAdmin, existing.owner_member_id);

      // Moderation of a member's own gallery, as distinct from an owner editing
      // their own and from an administrator authoring Footbag Hacky's. It is a
      // write onto somebody else's record, so it takes a mandatory reason and
      // records every changed value before and after. The name and the
      // description are that member's own words: the administrator's only move
      // on them is to take them off, so the new values come from the clear
      // flags and whatever the request carried in those two fields is dropped.
      const isModeration = actorIsAdmin
        && existing.is_system === 0
        && existing.owner_member_id !== actorMemberId;
      let moderationReason = '';
      if (isModeration) {
        moderationReason = requireModerationReason(input.reason);
        validated.name = input.moderation?.clearName
          ? clearedGalleryName(existing.owner_member_id, galleryId)
          : existing.name;
        validated.description = input.moderation?.clearDescription ? '' : existing.description;
      }

      assertPersonalGalleryIsIntact(existing.is_default === 1, {
        name: validated.name,
        criteriaTags: validated.criteriaTags,
        excludeTags: validated.excludeTags,
      });
      // A rename onto the reserved name, from a gallery of the member's own.
      // FH-owned galleries are exempt: their ids are declared rather than
      // derived from the name, and they are not uploader-scoped.
      if (existing.is_default === 0 && existing.is_system === 0) {
        assertDoesNotClaimPersonalGallery(existing.owner_slug, validated.name);
      }

      // A curated (FH-owned) gallery edit hits the persistent /curated sidecar in
      // dev; gate it. Member-owned gallery edits are never curated, so they pass.
      if (existing.is_system === 1) {
        assertCuratorActorMayWriteCurated(actorMemberId);
      }

      // Auto-include the owner's `#by_<slug>` on member-owned gallery
      // edits, mirroring the create path. This survives the rewriteGalleryTagSets
      // tag-set replacement so the gallery's owner-scoping criterion
      // cannot be removed by editing. validateGalleryTag rejects `#by_*`
      // from caller input, so the prepended tag is the only `#by_*`.
      if (existing.is_system !== 1) {
        const uploaderTag = `${UPLOADER_TAG_PREFIX}${existing.owner_slug.toLowerCase()}`;
        validated.criteriaTags = [uploaderTag, ...validated.criteriaTags];
      }
      // FH-owned galleries are topic-defined: `#curated` is not auto-added. A
      // curated collection lists `#curated` in its own criteria; a topic gallery
      // omits it and shows all matching content with `#curated` as the opt-in.

      if (validated.criteriaTags.length === 0) {
        throw new ValidationError(
          'A gallery must declare at least one criteria tag (otherwise it would render empty).',
        );
      }

      const now = new Date().toISOString();

      // The tag sets and the external links are rewritten delete-then-insert,
      // so their prior values have to be read before the rewrite runs or they
      // are gone by the time anything could record them. Only the moderation
      // door needs them, and only it pays for the reads.
      const changed = isModeration
        ? galleryChangesFor(galleryId, existing, validated)
        : [];

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
        if (isModeration) {
          // No row when nothing moved. A ledger entry saying an administrator
          // acted on a member's gallery, listing no change, is a false record
          // of an intervention that did not happen.
          if (changed.length > 0) {
            appendAuditEntry({
              actionType:    'media.member_gallery_moderated',
              category:      'media',
              actorType:     'admin',
              actorMemberId,
              entityType:    'gallery',
              entityId:      galleryId,
              reasonText:    moderationReason,
              metadata: {
                galleryId,
                ownerMemberId: existing.owner_member_id,
                fields: changed.map((c) => c.field),
                before: Object.fromEntries(changed.map((c) => [c.field, c.before])),
                after:  Object.fromEntries(changed.map((c) => [c.field, c.after])),
              },
            });
          }
        } else {
          appendAuditEntry({
            actionType: existing.is_system === 1
              ? 'media.curated_gallery_updated'
              : 'media.member_gallery_updated',
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
        }
      });

      if (isModeration && changed.length > 0) {
        notifyGalleryOwnerOfModeration(
          existing.owner_member_id, existing.owner_display_name,
          galleryId, existing.name, changed, moderationReason, now,
        );
      }

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
    // `media.curated_gallery_created` / `media.member_gallery_created` audit row inside
    // the same transaction as the insert.
    async createGallery(
      input: CuratorGalleryCreateInput,
    ): Promise<CuratorGalleryCreateResult> {
      const { actorMemberId, actorIsAdmin, ownerMemberId, suggestedId, ownerSlug, updates } = input;
      throttleGalleryWrite(actorMemberId, actorIsAdmin);
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
      // A curated (FH-owned) gallery create hits the persistent /curated sidecar
      // in dev; gate it. Member-owned creates are never curated, so they pass.
      if (isFhOwned) {
        assertCuratorActorMayWriteCurated(actorMemberId);
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
        assertDoesNotClaimPersonalGallery(ownerSlug, validated.name);
        galleryId = buildMemberGalleryId(ownerSlug, validated.name, 0);
        // Member-owned galleries auto-include the owner's `#by_<slug>` so
        // the tag-AND query scopes to the owner's uploads. validateGalleryTag
        // rejects `#by_*` from caller input, so the prepended tag is the
        // only `#by_*` in the criteria set. FH-owned galleries are not
        // uploader-scoped (handled below).
        const uploaderTag = `${UPLOADER_TAG_PREFIX}${ownerSlug.toLowerCase()}`;
        validated.criteriaTags = [uploaderTag, ...validated.criteriaTags];
      }
      // FH-owned galleries are topic-defined: their criteria are exactly what the
      // author declares. `#curated` is not auto-added — a curated collection
      // lists `#curated` in its own criteria, and a topic gallery omits it so it
      // shows all matching content with `#curated` as the opt-in filter.
      // `validateGalleryTag` allows `#curated` in caller input.

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
                ? 'media.curated_gallery_created'
                : 'media.member_gallery_created',
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
      throttleGalleryWrite(actorMemberId, actorIsAdmin);
      assertTier1Benefits(actorMemberId);

      const existing = media.getNamedGalleryById.get(galleryId) as
        | { id: string; owner_member_id: string; is_system: number; is_default: number }
        | undefined;
      if (!existing) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      authorizeGalleryActor(actorMemberId, actorIsAdmin, existing.owner_member_id);

      // An administrator's reach on this path stops at the curated galleries and
      // their own. The administrator flag alone authorized deleting anything,
      // and the curated list never links a member-owned gallery, so a posted id
      // was all it took to hard-delete a member's own gallery. A record that is
      // neither curated nor theirs simply does not resolve, the same answer the
      // sibling curated-media delete gives and the one the criteria require.
      if (actorIsAdmin && existing.is_system !== 1 && existing.owner_member_id !== actorMemberId) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      // Deleting it would take away the only surface listing every item the
      // member owns, and per-item edit and delete links exist nowhere else, so
      // it would strand them until their next upload recreated it.
      if (existing.is_default === 1) {
        throw new ValidationError(
          `Your ${PERSONAL_GALLERY_NAME} cannot be deleted. It is created for you and is where you manage everything you upload.`,
        );
      }

      // A curated (FH-owned) gallery delete removes the persistent /curated
      // sidecar in dev; gate it. Member-owned deletes are never curated.
      if (existing.is_system === 1) {
        assertCuratorActorMayWriteCurated(actorMemberId);
      }

      // Delete + audit land in one transaction. Every other write method in
      // this service wraps in transaction(...) + appendAuditEntry; gallery
      // delete was the lone outlier, leaving deletions untraceable and
      // unrolled-back on audit failure. Mirrors the deleteMedia pattern at
      // ~line 1366.
      transaction(() => {
        media.deleteMemberGalleryById.run(galleryId);
        appendAuditEntry({
          actionType: existing.is_system === 1
            ? 'media.curated_gallery_deleted'
            : 'media.member_gallery_deleted',
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


    // Lists every gallery owned by a given member, including item count and the
    // Personal Gallery. Drives the owner's own gallery-management list and the
    // gallery picker on the upload form, both owner-only surfaces, which is why
    // the Personal Gallery belongs in the result: per-item edit and delete links
    // are reachable only through a gallery's edit form, so hiding it would leave
    // the member no route to manage their own media. The public surfaces take a
    // different statement that filters it out, since it is not a collection the
    // member composed and has nothing to say to a visitor.
    listGalleriesForOwner(memberId: string): CuratorGallerySummary[] {
      return runSqliteRead('listGalleriesForOwner', () => {
        const rows = media.listMemberGalleriesByOwner.all(memberId) as Array<{
          id: string;
          name: string;
          description: string;
          sort_order: GallerySortOrderValue;
          is_default: number;
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
            isDefault: g.is_default === 1,
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
      if (!input.actorIsAdmin) {
        throttlePerActor(
          'member-photo-upload', input.memberId,
          'photo_upload_rate_limit_per_hour', 10,
          'Upload rate limit reached.',
        );
      }
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

      const processed = await rejectImageAsValidation(imageProcessor.processPhoto(input.photoBuffer));

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
            input.sourceFilename, RENDITION_IMAGE_MIME,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, input.memberId);
          }
          appliedTagIds = applyTagsForMember(mediaId, input.slug, input.tags, now);
          ensureDefaultPersonalGalleryTx(input.memberId, input.slug, now);
          appendAuditEntry({
            actionType: 'media.member_uploaded',
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
    // FH-curator sidecar fields (creator/clip range) are not surfaced on
    // the member surface.
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
      if (!input.actorIsAdmin) {
        throttlePerActor(
          'media-edit', input.memberId,
          'media_edit_rate_limit_per_hour', 15,
          'Too many media edits.',
        );
      }
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
          media.updateMediaItemExternalUrl.run(
            normalizedExternalUrlEdit, now, now, 'member-self',
            input.mediaId, input.memberId,
          );
        }
        appendAuditEntry({
          actionType: 'media.member_edited',
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

    // Member-self delete. Permanent (no soft delete for media) with
    // cascading removal of the item's tag rows, per US M_Delete_Own_Media.
    // Owner-scoped: the row load is gated by uploader_member_id, so a
    // non-owner gets NotFoundError. Avatar rows are refused: the avatar
    // lifecycle (replace-on-upload) belongs to AvatarService, and deleting
    // the row out from under it would silently clear the member's avatar.
    async deleteMemberMedia(input: {
      memberId: string;
      actorIsAdmin: boolean;
      mediaId: string;
    }): Promise<{ mediaId: string }> {
      if (!input.actorIsAdmin) {
        throttlePerActor(
          'media-edit', input.memberId,
          'media_edit_rate_limit_per_hour', 15,
          'Too many media changes.',
        );
      }
      assertTier1Benefits(input.memberId);

      const row = runSqliteRead('getMemberMediaItemById', () =>
        media.getMemberMediaItemById.get(input.mediaId, input.memberId),
      ) as MediaItemRow | undefined;
      if (!row || row.is_avatar === 1) {
        throw new NotFoundError(`Member media not found: ${input.mediaId}`);
      }

      // Member media is a photo (stored bytes) or a YouTube/Vimeo URL
      // reference (no stored bytes); collect storage keys for the photo case.
      const keysToDelete: string[] = [];
      if (row.s3_key_thumb) keysToDelete.push(row.s3_key_thumb);
      if (row.s3_key_display) keysToDelete.push(row.s3_key_display);

      const deletedTagIds = (tagStats.listTagIdsByMediaId.all(input.mediaId) as { tag_id: string }[]).map(r => r.tag_id);

      transaction(() => {
        mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
        media.deleteMediaItem.run(input.mediaId);
        appendAuditEntry({
          actionType: 'media.member_deleted',
          category: 'media',
          actorType: 'member',
          actorMemberId: input.memberId,
          entityType: 'media_item',
          entityId: input.mediaId,
          metadata: {
            mediaType: row.media_type,
            sourceFilename: row.source_filename,
            videoPlatform: row.video_platform,
            videoUrl: row.video_url,
          },
        });
      });
      hashtagDiscoveryService.decrementTagStats(deletedTagIds);

      // Storage cleanup after the DB transaction commits. Best-effort: a
      // failed delete leaves an orphan object but never resurrects the row.
      for (const key of keysToDelete) {
        try {
          await storage.delete(key);
        } catch (err) {
          logger.warn('curatorMediaService.deleteMemberMedia: storage.delete failed', {
            key,
            error: (err as Error).message,
          });
        }
      }

      return { mediaId: input.mediaId };
    },

    // Member-attributed video URL submission. URL-reference only (no
    // bytes hosted), per US M_Submit_Video. The service verifies the
    // URL via the platform's oEmbed endpoint (the only reliable
    // signal: page URLs return 200 even for removed videos), extracts
    // the video id, and pulls the Vimeo thumbnail from the oEmbed
    // body (Vimeo thumbnails are not derivable from id; YouTube ids
    // are derived at render time).
    async submitVideoForMember(input: MemberVideoInput): Promise<MemberUploadResult> {
      if (!input.actorIsAdmin) {
        throttlePerActor(
          'member-video-submit', input.memberId,
          'video_submission_rate_limit_per_hour', 5,
          'Submission rate limit reached.',
        );
      }
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

      // Store the canonical platform URL reconstructed from the parsed id,
      // not the member-typed string: the raw string renders verbatim as an
      // anchor href (video facade), and the id parsers substring-match, so
      // a wrapper URL on a foreign host could otherwise carry a valid id
      // and become a member-authored off-platform link.
      const canonicalVideoUrl = input.videoPlatform === 'youtube'
        ? `https://www.youtube.com/watch?v=${videoId}`
        : `https://vimeo.com/${videoId}`;

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
          input.videoPlatform, videoId, canonicalVideoUrl, thumbnailUrl,
        );
        if (normalizedExternalUrl !== null) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, input.memberId);
        }
        appliedTagIds = applyTagsForMember(mediaId, input.slug, input.tags, now);
        ensureDefaultPersonalGalleryTx(input.memberId, input.slug, now);
        appendAuditEntry({
          actionType: 'media.member_uploaded',
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
    // Line endings collapsed before anything compares this against what is
    // stored: a browser sends a textarea's line breaks as CRLF whatever value
    // it was given, and the column holds LF, so a description posted back with
    // no edit would otherwise read as a change the administrator did not make.
    const description = normalizeLineEndings(updates.description ?? '').trim();
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
    // Dedup keys on the lowercased form: tags match case-insensitively, so
    // #Freestyle and #freestyle are the same criterion.
    const seenCriteria = new Set<string>();
    for (const tag of updates.criteriaTags) {
      try {
        validateGalleryTag(tag, 'criteria');
      } catch (err) {
        const m = (err as Error).message;
        throw new ValidationError(m, { fieldErrors: { criteriaTags: m } });
      }
      const norm = tag.toLowerCase();
      if (seenCriteria.has(norm)) {
        const m = `Duplicate criteria tag: ${tag}`;
        throw new ValidationError(m, { fieldErrors: { criteriaTags: m } });
      }
      seenCriteria.add(norm);
    }
    const seenExclude = new Set<string>();
    for (const tag of updates.excludeTags) {
      try {
        validateGalleryTag(tag, 'exclude');
      } catch (err) {
        const m = (err as Error).message;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      const norm = tag.toLowerCase();
      if (seenExclude.has(norm)) {
        const m = `Duplicate exclude tag: ${tag}`;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      if (seenCriteria.has(norm)) {
        const m = `Tag "${tag}" cannot be both a criteria tag and an exclude tag.`;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      seenExclude.add(norm);
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
  function clearedGalleryName(ownerMemberId: string, galleryId: string): string {
  for (let n = 1; n <= CLEARED_NAME_LIMIT; n += 1) {
    const candidate = n === 1 ? CLEARED_GALLERY_NAME : `${CLEARED_GALLERY_NAME} ${n}`;
    const held = media.findMemberGalleryByOwnerAndName.get(ownerMemberId, candidate) as
      | { id: string }
      | undefined;
    if (!held || held.id === galleryId) return candidate;
  }
  throw new ValidationError(
    'This member already holds too many cleared galleries for another to be named.',
  );
}

function requireModerationReason(raw: string | undefined): string {
  const reason = (raw ?? '').trim();
  if (!reason) {
    throw new ValidationError('Enter the reason for this change to a member\'s gallery.', {
      fieldErrors: { reason: 'Enter the reason for this change to a member\'s gallery.' },
    });
  }
  if (reason.length > MAX_MODERATION_REASON) {
    throw new ValidationError(
      `The reason must be ${MAX_MODERATION_REASON} characters or fewer.`,
      { fieldErrors: { reason: `The reason must be ${MAX_MODERATION_REASON} characters or fewer.` } },
    );
  }
  return reason;
}

interface GalleryFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * What an administrator's write to a member's gallery actually changed, read
 * before the write so the delete-then-insert rewrites have not yet destroyed
 * the prior tag sets and links. Tag sets and link sets are compared as sorted
 * lists, because reordering the same set is not a change anybody made.
 */
function galleryChangesFor(
  galleryId: string,
  existing: { name: string; description: string; sort_order: GallerySortOrderValue },
  validated: {
    name: string; description: string; sortOrder: GallerySortOrderValue;
    criteriaTags: string[]; excludeTags: string[];
    externalLinks: Array<{ label: string; url: string }>;
  },
): GalleryFieldChange[] {
  const priorCriteria = (media.listFhNamedGalleryTags.all(galleryId) as Array<{ tag_display: string }>)
    .map((t) => t.tag_display);
  const priorExcludes = (media.listFhNamedGalleryExcludeTags.all(galleryId) as Array<{ tag_display: string }>)
    .map((t) => t.tag_display);
  const priorLinks = (media.listGalleryExternalLinks.all(galleryId) as Array<{ label: string; url: string }>)
    .map((l) => `${l.label} ${l.url}`);

  const sorted = (values: string[]): string[] => [...values].sort();
  const linkText = (links: Array<{ label: string; url: string }>): string[] =>
    links.map((l) => `${l.label} ${l.url}`);

  const changed: GalleryFieldChange[] = [];
  const note = (field: string, before: unknown, after: unknown): void => {
    if (JSON.stringify(before) !== JSON.stringify(after)) changed.push({ field, before, after });
  };
  note('name', existing.name, validated.name);
  note('description', existing.description, validated.description);
  note('sortOrder', existing.sort_order, validated.sortOrder);
  note('criteriaTags', sorted(priorCriteria), sorted(validated.criteriaTags));
  note('excludeTags', sorted(priorExcludes), sorted(validated.excludeTags));
  note('externalLinks', sorted(priorLinks), sorted(linkText(validated.externalLinks)));
  return changed;
}

function describeGalleryChanges(changed: GalleryFieldChange[]): string {
  const phrases = changed.map((c) => GALLERY_FIELD_PHRASE[c.field] ?? c.field);
  if (phrases.length === 1) return phrases[0]!;
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]!}`;
}

/**
 * Tell the member an administrator acted on their gallery. Every other
 * administrative correction on somebody else's record writes to the person
 * whose record it is, and this is one. The idempotency key carries the instant
 * so a second act on the same gallery is a second message rather than a
 * suppressed duplicate.
 */
function notifyGalleryOwnerOfModeration(
  ownerMemberId: string,
  ownerDisplayName: string,
  galleryId: string,
  galleryName: string,
  changed: GalleryFieldChange[],
  reason: string,
  sentAt: string,
): void {
  emailService.sendToMember({
    template: 'gallery_moderated_member',
    params: {
      memberName:  ownerDisplayName,
      galleryName,
      whatChanged: describeGalleryChanges(changed),
      note:        reason,
    },
    memberId: ownerMemberId,
    idempotencyKey: `gallery-moderated:${galleryId}:${sentAt}`,
  });
}

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
    // Tags resolve by their lowercased form (matching is case-insensitive) and
    // keep their original capitalization for display; case variants collapse to
    // one row, respecting the (gallery_id, tag_id) uniqueness on the link table.
    media.deleteAllMemberGalleryTags.run(galleryId);
    const seenCriteria = new Set<string>();
    for (const tag of validated.criteriaTags) {
      const normalized = tag.toLowerCase();
      if (seenCriteria.has(normalized)) continue;
      seenCriteria.add(normalized);
      const tagId = resolveTagIdOrCreate(normalized, tag, now, 'criteriaTags');
      media.insertMemberGalleryTag.run(galleryId, tagId, now, actorMemberId);
    }

    media.deleteAllMemberGalleryExcludeTags.run(galleryId);
    const seenExclude = new Set<string>();
    for (const tag of validated.excludeTags) {
      const normalized = tag.toLowerCase();
      if (seenExclude.has(normalized)) continue;
      seenExclude.add(normalized);
      const tagId = resolveTagIdOrCreate(normalized, tag, now, 'excludeTags');
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

// ── Page-model builders: the admin curator surface ────────────────────────
//
// A page contract on this surface is composed from domain values: which tags a
// row carries, which sort is active, whether the configured storage adapter
// supports the direct-to-S3 video path, whose gallery an administrator is
// looking at. That composition belongs beside the domain it reads, so it lives
// here and the controller parses the request, picks the status code, and
// renders what these return.

export type CuratorMediaService = ReturnType<typeof createCuratorMediaService>;

/** How many curated items one page of the admin media list shows. */
export const CURATOR_LIST_PAGE_SIZE = 50;

/**
 * The upload form's fields as the browser last submitted them, echoed back so a
 * refused submission re-renders with the curator's own words still in place.
 */
export interface CuratorUploadFormValues {
  mediaType?: string;
  caption?: string;
  tags?: string;
  category?: string;
  newCategory?: string;
  videoUrl?: string;
  videoPlatform?: string;
  primarySlug?: string;
  title?: string;
  creator?: string;
  sourceId?: string;
  externalUrl?: string;
}

export interface CuratorUploadContent {
  errorMessage: string | null;
  formValues: CuratorUploadFormValues;
  existingCategories: string[];
  hasExistingCategories: boolean;
  savedFlag: boolean;
  // True when the configured storage adapter is S3, which is what makes the
  // browser-side presigned PUT path available for video. It also decides
  // whether a category is required, because the local adapter writes a sidecar
  // into a category directory and S3 does not.
  asyncEnabled: boolean;
  requireCategory: boolean;
  // The cap the page states and the cap the server applies are the same number
  // by construction: the megabyte figure is what the label reads, the byte
  // figure is what the browser compares a chosen file against so an oversized
  // file is refused before any of it is sent.
  videoMaxMb: number;
  videoMaxBytes: number;
}

/** One row of the admin curated-media list, with its delete-confirm state. */
export interface CuratorMediaListRow extends CuratorMediaListItem {
  isConfirmDelete: boolean;
}

export interface CuratorMediaListContent {
  items: CuratorMediaListRow[];
  total: number;
  totalNoun: string;
  currentPage: number;
  totalPages: number;
  tagFilter: string;
  hasTagFilter: boolean;
  sortLinks: { date: string; type: string; caption: string };
  sortIndicator: { dateDesc: boolean; dateAsc: boolean; type: boolean; caption: boolean };
  prevPageHref: string | null;
  nextPageHref: string | null;
  emptyState: boolean;
  savedWasEdit: boolean;
  savedWasDelete: boolean;
  uploadHref: string;
  listHref: string;
}

export interface CuratorMediaEditContent {
  notFound: boolean;
  mediaId: string;
  errorMessage: string | null;
  media: {
    mediaId: string;
    mediaType: 'photo' | 'video';
    caption: string;
    tagsString: string;
    thumbnailUrl: string;
    isSidecarBacked: boolean;
    videoPlatform: string | null;
    videoUrl: string | null;
    creator: string;
    sourceId: string;
    startSeconds: number | string;
    endSeconds: number | string;
    externalUrl: string;
    showThumbnailField: boolean;
  } | null;
  cancelHref: string;
  formAction: string;
}

export interface CuratorGalleryListRow extends CuratorGallerySummary {
  isConfirmDelete: boolean;
  editHref: string;
  viewHref: string;
  deleteHref: string;
  excludeTagsEmpty: boolean;
}

export interface CuratorGalleryListContent {
  items: CuratorGalleryListRow[];
  emptyState: boolean;
  savedFlag: boolean;
  newGalleryHref: string;
  listHref: string;
}

export interface CuratorGalleryFormFields {
  id?: string;
  idSlug?: string;
  name: string;
  description: string;
  sortOrder: string;
  criteriaTagsString: string;
  excludeTagsString: string;
  // True for the member's auto-materialized Personal Gallery, whose name and
  // criteria the service refuses to change, so the form shows those parts as
  // fixed rather than offering inputs that would be rejected.
  isDefault?: boolean;
}

export interface CuratorGalleryNewContent {
  formAction: string;
  cancelHref: string;
  errorMessage: string | null;
  gallery: CuratorGalleryFormFields;
}

export interface CuratorGalleryEditContent {
  notFound: boolean;
  galleryId: string;
  formAction: string;
  cancelHref: string;
  errorMessage: string | null;
  fieldErrors: Record<string, string> | undefined;
  gallery: CuratorGalleryFormFields | null;
  currentItems: CuratorGalleryEditView['currentItems'];
  currentItemsTruncated: boolean;
  uploadTags: string;
  externalLinkSlots: ExternalLinkSlot[];
  isFhOwned: boolean;
  // Non-null only when an administrator is looking at somebody else's gallery,
  // which is moderation rather than authorship: the words stay theirs, so the
  // form offers removal and not rewriting.
  moderation: { ownerDisplayName: string } | null;
  reasonRaw: string;
}

export interface CuratorJobStatusContent {
  notFound: boolean;
  jobId: string;
  job: {
    id: string;
    state: string;
    mediaId: string | null;
    errorMessage: string | null;
    sourceFilename: string | null;
    caption: string | null;
    isPendingUpload: boolean;
    isPendingTranscode: boolean;
    isProcessing: boolean;
    isSucceeded: boolean;
    isFailed: boolean;
    isAbandoned: boolean;
    mediaEditHref: string | null;
  } | null;
  eventsUrl: string | null;
  uploadHref: string;
}

/**
 * Whether this edit is moderation, and whose words are being moderated. A
 * gallery of Footbag Hacky's is the administrator's own to author, and an
 * administrator editing a gallery they own themselves is an owner like any
 * other member.
 */
export function curatorGalleryModerationView(
  gallery: CuratorGalleryEditView,
  actorMemberId: string,
): { ownerDisplayName: string } | null {
  if (gallery.isSystemOwned) return null;
  if (gallery.ownerMemberId === actorMemberId) return null;
  return { ownerDisplayName: gallery.ownerDisplayName };
}

/**
 * What the gallery edit page is, in its own title. One URL serves two cohorts,
 * and calling the moderation of a member's own gallery "curation" contradicts
 * the banner printed directly beneath it.
 */
export function curatorGalleryEditTitle(
  moderation: { ownerDisplayName: string } | null,
): string {
  return moderation ? "Moderate a Member's Gallery" : 'Edit Curator Gallery';
}

export function getCuratorUploadPage(
  opts: {
    errorMessage?: string;
    formValues?: CuratorUploadFormValues;
    savedFlag?: boolean;
    existingCategories?: string[];
  } = {},
): PageViewModel<CuratorUploadContent> {
  const asyncEnabled = config.mediaStorageAdapter === 's3';
  const existingCategories = opts.existingCategories ?? [];
  return {
    seo: { title: 'Upload Curated Media' },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Upload Curated Media' },
    content: {
      errorMessage: opts.errorMessage ?? null,
      formValues: opts.formValues ?? {},
      existingCategories,
      hasExistingCategories: existingCategories.length > 0,
      savedFlag: opts.savedFlag ?? false,
      asyncEnabled,
      requireCategory: !asyncEnabled,
      videoMaxMb: VIDEO_MAX_MB,
      videoMaxBytes: VIDEO_MAX_BYTES,
    },
  };
}

export function getCuratorMediaListPage(
  svc: CuratorMediaService,
  input: {
    page: number;
    tagFilter: string | null;
    sort: 'date_desc' | 'date_asc' | 'type_asc' | 'caption_asc';
    confirmDeleteId: string | null;
    savedFlag: 'edit' | 'delete' | null;
  },
): PageViewModel<CuratorMediaListContent> {
  const listHref = '/admin/curator/media';
  const { tagFilter, sort } = input;
  const result = svc.listMedia({
    page: input.page,
    pageSize: CURATOR_LIST_PAGE_SIZE,
    tagFilter: tagFilter ?? undefined,
    sort,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  // Both the tag filter and the active sort survive a page step, so a curator
  // paging through a filtered view keeps the view they were reading.
  const queryTail = (p: number): string => {
    const parts = [`page=${p}`];
    if (tagFilter) parts.push(`tag=${encodeURIComponent(tagFilter)}`);
    if (sort !== 'date_desc') parts.push(`sort=${sort}`);
    return '?' + parts.join('&');
  };
  // Each column link moves to the next sort that column offers: the active
  // Uploaded column toggles its direction, the others reset to their canonical
  // ascending order. The tag filter is preserved either way.
  const sortQuery = (s: string): string => {
    const parts: string[] = [];
    if (tagFilter) parts.push(`tag=${encodeURIComponent(tagFilter)}`);
    if (s !== 'date_desc') parts.push(`sort=${s}`);
    return parts.length === 0 ? listHref : `${listHref}?${parts.join('&')}`;
  };

  return {
    seo: { title: 'Curated Media' },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_list', title: 'Curated Media' },
    content: {
      items: result.items.map((item) => ({
        ...item,
        isConfirmDelete: input.confirmDeleteId !== null && item.mediaId === input.confirmDeleteId,
      })),
      total: result.total,
      totalNoun: result.total === 1 ? 'item' : 'items',
      currentPage: result.page,
      totalPages,
      tagFilter: tagFilter ?? '',
      hasTagFilter: tagFilter !== null && tagFilter.length > 0,
      sortLinks: {
        date: sortQuery(sort === 'date_desc' ? 'date_asc' : 'date_desc'),
        type: sortQuery('type_asc'),
        caption: sortQuery('caption_asc'),
      },
      sortIndicator: {
        dateDesc: sort === 'date_desc',
        dateAsc: sort === 'date_asc',
        type: sort === 'type_asc',
        caption: sort === 'caption_asc',
      },
      prevPageHref: result.page > 1 ? listHref + queryTail(result.page - 1) : null,
      nextPageHref: result.page < totalPages ? listHref + queryTail(result.page + 1) : null,
      emptyState: result.items.length === 0,
      savedWasEdit: input.savedFlag === 'edit',
      savedWasDelete: input.savedFlag === 'delete',
      uploadHref: '/admin/curator/upload',
      listHref,
    },
  };
}

function curatorMediaEditEnvelope(
  title: string,
  content: CuratorMediaEditContent,
): PageViewModel<CuratorMediaEditContent> {
  return {
    seo: { title },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_edit', title },
    content,
  };
}

export function getCuratorMediaNotFoundPage(
  mediaId: string,
): PageViewModel<CuratorMediaEditContent> {
  return curatorMediaEditEnvelope('Curated Media: Not Found', {
    notFound: true,
    mediaId,
    errorMessage: null,
    media: null,
    cancelHref: '/admin/curator/media',
    formAction: `/admin/curator/media/${encodeURIComponent(mediaId)}/edit`,
  });
}

export async function getCuratorMediaEditPage(
  svc: CuratorMediaService,
  mediaId: string,
): Promise<PageViewModel<CuratorMediaEditContent> | null> {
  const item = await svc.getMediaItem(mediaId);
  if (!item) return null;
  // The #curated tag is auto-applied and cannot be edited, so the editable tag
  // string shows only the tags a curator can actually change.
  const editableTags = item.tags.filter((t) => t !== '#curated');
  const isSidecarBacked = item.videoPlatform === 'youtube' || item.videoPlatform === 'vimeo';
  return curatorMediaEditEnvelope('Edit Curated Media', {
    notFound: false,
    mediaId: item.mediaId,
    errorMessage: null,
    media: {
      mediaId: item.mediaId,
      mediaType: item.mediaType,
      caption: item.caption ?? '',
      tagsString: editableTags.join(' '),
      thumbnailUrl: item.thumbnailUrl,
      isSidecarBacked,
      videoPlatform: item.videoPlatform,
      videoUrl: item.videoUrl,
      creator: item.creator ?? '',
      sourceId: item.sourceId ?? '',
      startSeconds: item.startSeconds ?? '',
      endSeconds: item.endSeconds ?? '',
      externalUrl: item.externalUrl ?? '',
      showThumbnailField: item.showThumbnailField === true,
    },
    cancelHref: '/admin/curator/media',
    formAction: `/admin/curator/media/${encodeURIComponent(item.mediaId)}/edit`,
  });
}

/** The edit form re-rendered after a refusal, carrying back what was typed. */
export function getCuratorMediaEditErrorPage(
  mediaId: string,
  errorMessage: string,
  submitted: { caption: string; tagsString: string },
): PageViewModel<CuratorMediaEditContent> {
  return curatorMediaEditEnvelope('Edit Curated Media', {
    notFound: false,
    mediaId,
    errorMessage,
    media: {
      mediaId,
      mediaType: 'photo',
      caption: submitted.caption,
      tagsString: submitted.tagsString,
      thumbnailUrl: '',
      isSidecarBacked: false,
      videoPlatform: null,
      videoUrl: null,
      creator: '',
      sourceId: '',
      startSeconds: '',
      endSeconds: '',
      externalUrl: '',
      showThumbnailField: false,
    },
    cancelHref: '/admin/curator/media',
    formAction: `/admin/curator/media/${encodeURIComponent(mediaId)}/edit`,
  });
}

export function getCuratorGalleryListPage(
  svc: CuratorMediaService,
  input: { confirmDeleteId: string | null; savedFlag: boolean },
): PageViewModel<CuratorGalleryListContent> {
  const items = svc.listOwnedGalleries();
  return {
    seo: { title: 'Curator Galleries' },
    page: {
      sectionKey: 'admin',
      pageKey: 'admin_curator_galleries_list',
      title: 'Curator Galleries',
    },
    content: {
      items: items.map((item) => ({
        ...item,
        isConfirmDelete: input.confirmDeleteId !== null && item.id === input.confirmDeleteId,
        editHref: `/admin/curator/galleries/${encodeURIComponent(item.id)}/edit`,
        viewHref: `/media/${encodeURIComponent(item.id)}`,
        deleteHref: `/admin/curator/galleries/${encodeURIComponent(item.id)}/delete`,
        excludeTagsEmpty: item.excludeTags.length === 0,
      })),
      emptyState: items.length === 0,
      savedFlag: input.savedFlag,
      newGalleryHref: '/admin/curator/galleries/new',
      listHref: '/admin/curator/galleries',
    },
  };
}

export function getCuratorGalleryNewPage(
  opts: { errorMessage?: string; gallery?: CuratorGalleryFormFields } = {},
): PageViewModel<CuratorGalleryNewContent> {
  return {
    seo: { title: 'New Curator Gallery' },
    page: {
      sectionKey: 'admin',
      pageKey: 'admin_curator_galleries_new',
      title: 'New Curator Gallery',
    },
    content: {
      formAction: '/admin/curator/galleries',
      cancelHref: '/admin/curator/galleries',
      errorMessage: opts.errorMessage ?? null,
      gallery: opts.gallery ?? {
        idSlug: '',
        name: '',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTagsString: '',
        excludeTagsString: '',
      },
    },
  };
}

function curatorGalleryEditEnvelope(
  title: string,
  content: CuratorGalleryEditContent,
): PageViewModel<CuratorGalleryEditContent> {
  return {
    seo: { title, noindex: true },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title },
    content,
  };
}

export function getCuratorGalleryNotFoundPage(
  galleryId: string,
): PageViewModel<CuratorGalleryEditContent> {
  return curatorGalleryEditEnvelope('Curator Gallery: Not Found', {
    notFound: true,
    galleryId,
    formAction: `/admin/curator/galleries/${encodeURIComponent(galleryId)}/edit`,
    cancelHref: '/admin/curator/galleries',
    errorMessage: null,
    fieldErrors: undefined,
    gallery: null,
    currentItems: [],
    currentItemsTruncated: false,
    uploadTags: '',
    externalLinkSlots: [],
    isFhOwned: true,
    moderation: null,
    reasonRaw: '',
  });
}

export function getCuratorGalleryEditPage(
  svc: CuratorMediaService,
  galleryId: string,
  actorMemberId: string,
): PageViewModel<CuratorGalleryEditContent> {
  const g = svc.getGalleryForEdit(galleryId);
  const moderation = curatorGalleryModerationView(g, actorMemberId);
  return curatorGalleryEditEnvelope(curatorGalleryEditTitle(moderation), {
    notFound: false,
    galleryId,
    formAction: `/admin/curator/galleries/${encodeURIComponent(galleryId)}/edit`,
    cancelHref: '/admin/curator/galleries',
    errorMessage: null,
    fieldErrors: undefined,
    gallery: {
      id: g.id,
      name: g.name,
      description: g.description,
      sortOrder: g.sortOrder,
      criteriaTagsString: g.criteriaTags.join(' '),
      excludeTagsString: g.excludeTags.join(' '),
    },
    currentItems: g.currentItems,
    currentItemsTruncated: g.currentItemsTruncated,
    uploadTags: g.criteriaTags.join(' '),
    externalLinkSlots: buildExternalLinkSlots(null, g.externalLinks),
    isFhOwned: g.isSystemOwned,
    moderation,
    reasonRaw: '',
  });
}

/**
 * The gallery edit form re-rendered after a refusal. The gallery is re-read so
 * the read-only item strip stays accurate; a gallery deleted concurrently
 * renders with an empty strip rather than failing the response the curator is
 * already owed.
 */
export function getCuratorGalleryEditErrorPage(
  svc: CuratorMediaService,
  actorMemberId: string,
  errorMessage: string,
  submitted: {
    galleryId: string;
    name: string;
    description: string;
    sortOrderRaw: string;
    criteriaTagsRaw: string;
    excludeTagsRaw: string;
    uploadTagsRaw: string;
    externalLinks: CuratorGalleryExternalLinkInput[];
    fieldErrors?: Record<string, string>;
    reasonRaw?: string;
  },
): PageViewModel<CuratorGalleryEditContent> {
  let currentItems: CuratorGalleryEditView['currentItems'] = [];
  let currentItemsTruncated = false;
  let isFhOwned = true;
  let moderation: { ownerDisplayName: string } | null = null;
  try {
    const reread = svc.getGalleryForEdit(submitted.galleryId);
    currentItems = reread.currentItems;
    currentItemsTruncated = reread.currentItemsTruncated;
    isFhOwned = reread.isSystemOwned;
    moderation = curatorGalleryModerationView(reread, actorMemberId);
  } catch {
    /* gallery may have been deleted concurrently; render with empty items */
  }
  return curatorGalleryEditEnvelope(curatorGalleryEditTitle(moderation), {
    notFound: false,
    galleryId: submitted.galleryId,
    formAction: `/admin/curator/galleries/${encodeURIComponent(submitted.galleryId)}/edit`,
    cancelHref: '/admin/curator/galleries',
    errorMessage,
    fieldErrors: submitted.fieldErrors,
    gallery: {
      id: submitted.galleryId,
      name: submitted.name,
      description: submitted.description,
      sortOrder: submitted.sortOrderRaw,
      criteriaTagsString: submitted.criteriaTagsRaw,
      excludeTagsString: submitted.excludeTagsRaw,
    },
    currentItems,
    currentItemsTruncated,
    uploadTags: submitted.uploadTagsRaw,
    externalLinkSlots: buildExternalLinkSlots(submitted.externalLinks, [], submitted.fieldErrors),
    isFhOwned,
    moderation,
    reasonRaw: submitted.reasonRaw ?? '',
  });
}

function curatorJobStatusEnvelope(
  title: string,
  content: CuratorJobStatusContent,
): PageViewModel<CuratorJobStatusContent> {
  return {
    seo: { title },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title },
    content,
  };
}

export function getCuratorJobNotFoundPage(
  jobId: string,
): PageViewModel<CuratorJobStatusContent> {
  return curatorJobStatusEnvelope('Curator Upload: Not Found', {
    notFound: true,
    jobId,
    job: null,
    eventsUrl: null,
    uploadHref: '/admin/curator/upload',
  });
}

export function getCuratorJobStatusPage(job: {
  id: string;
  state: string;
  media_id: string | null;
  last_error: string | null;
  source_filename: string | null;
  caption: string | null;
}): PageViewModel<CuratorJobStatusContent> {
  return curatorJobStatusEnvelope('Curator Upload Progress', {
    notFound: false,
    jobId: job.id,
    job: {
      id: job.id,
      state: job.state,
      mediaId: job.media_id,
      errorMessage: job.last_error,
      sourceFilename: job.source_filename,
      caption: job.caption,
      isPendingUpload: job.state === 'pending_upload',
      isPendingTranscode: job.state === 'pending_transcode',
      isProcessing: job.state === 'processing',
      isSucceeded: job.state === 'succeeded',
      isFailed: job.state === 'failed',
      isAbandoned: job.state === 'abandoned',
      mediaEditHref: job.media_id
        ? `/admin/curator/media/${encodeURIComponent(job.media_id)}/edit`
        : null,
    },
    eventsUrl: `/admin/curator/upload/jobs/${encodeURIComponent(job.id)}/events`,
    uploadHref: '/admin/curator/upload',
  });
}

// ── Page-model builders: the member's own media and galleries ─────────────
//
// The member-owned write surface for media. The same reasoning applies as
// above: what the page offers depends on what the member owns, so the page
// contract is composed here and the controller renders it.

/** A member's own gallery, offered on the upload form as a destination. */
export interface MemberGalleryOption {
  id: string;
  name: string;
  criteriaTags: string[];
}

export interface MemberMediaUploadFormValues {
  mediaType?: 'photo' | 'video';
  caption?: string;
  tags?: string;
  videoUrl?: string;
  videoPlatform?: 'youtube' | 'vimeo' | '';
  externalUrl?: string;
  galleryId?: string;
}

export interface MemberMediaUploadContent {
  formAction: string;
  cancelHref: string;
  errorMessage: string | null;
  formValues: MemberMediaUploadFormValues;
  tagSuggestions: MemberTagSuggestions | null;
  galleries: MemberGalleryOption[];
  hasGalleries: boolean;
}

export interface MemberMediaEditFormValues {
  caption: string;
  tags: string;
  externalUrl: string;
}

export interface MemberMediaEditContent {
  formAction: string;
  deleteAction: string;
  cancelHref: string;
  errorMessage: string | null;
  formValues: MemberMediaEditFormValues;
  tagSuggestions: MemberTagSuggestions | null;
}

export function getMemberMediaUploadPage(
  svc: CuratorMediaService,
  memberKey: string,
  memberId: string | null,
  opts: {
    errorMessage?: string;
    formValues?: MemberMediaUploadFormValues;
    tagSuggestions?: MemberTagSuggestions;
  } = {},
): PageViewModel<MemberMediaUploadContent> {
  // The destinations the form offers are the member's own galleries, which is a
  // domain read shaped into a control, so it is composed here rather than handed
  // in already shaped.
  const galleries: MemberGalleryOption[] = memberId
    ? svc.listGalleriesForOwner(memberId).map((g) => ({
        id: g.id,
        name: g.name,
        criteriaTags: g.criteriaTags,
      }))
    : [];
  return {
    seo: { title: 'Upload Media' },
    page: { sectionKey: 'members', pageKey: 'member_media_upload', title: 'Upload Media' },
    content: {
      formAction: `/members/${memberKey}/media/upload`,
      cancelHref: `/members/${memberKey}/galleries`,
      errorMessage: opts.errorMessage ?? null,
      formValues: opts.formValues ?? { mediaType: 'photo' },
      tagSuggestions: opts.tagSuggestions ?? null,
      galleries,
      hasGalleries: galleries.length > 0,
    },
  };
}

export function getMemberMediaEditPage(
  memberKey: string,
  mediaId: string,
  formValues: MemberMediaEditFormValues,
  opts: { errorMessage?: string; tagSuggestions?: MemberTagSuggestions } = {},
): PageViewModel<MemberMediaEditContent> {
  return {
    seo: { title: 'Edit Media' },
    page: { sectionKey: 'members', pageKey: 'member_media_edit', title: 'Edit Media' },
    content: {
      formAction: `/members/${memberKey}/media/${mediaId}/edit`,
      deleteAction: `/members/${memberKey}/media/${mediaId}/delete`,
      cancelHref: `/members/${memberKey}/galleries`,
      errorMessage: opts.errorMessage ?? null,
      formValues,
      tagSuggestions: opts.tagSuggestions ?? null,
    },
  };
}

export interface MemberGalleryNewContent {
  formAction: string;
  cancelHref: string;
  errorMessage: string | null;
  fieldErrors: Record<string, string> | undefined;
  gallery: CuratorGalleryFormFields;
  uploadTags: string;
  externalLinkSlots: ExternalLinkSlot[];
}

export interface MemberGalleryEditContent {
  formAction: string;
  cancelHref: string;
  uploadMediaHref: string;
  errorMessage: string | null;
  fieldErrors: Record<string, string> | undefined;
  gallery: CuratorGalleryFormFields;
  currentItems: CuratorGalleryEditView['currentItems'];
  currentItemsTruncated: boolean;
  uploadTags: string;
  externalLinkSlots: ExternalLinkSlot[];
}

export function getMemberGalleryNewPage(
  memberKey: string,
  opts: {
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
    gallery?: CuratorGalleryFormFields;
    uploadTags?: string;
    externalLinks?: CuratorGalleryExternalLinkInput[] | null;
  } = {},
): PageViewModel<MemberGalleryNewContent> {
  const listHref = `/members/${memberKey}/galleries`;
  return {
    seo: { title: 'Create Gallery' },
    page: { sectionKey: 'members', pageKey: 'member_galleries_new', title: 'Create Gallery' },
    content: {
      formAction: listHref,
      cancelHref: listHref,
      errorMessage: opts.errorMessage ?? null,
      fieldErrors: opts.fieldErrors,
      gallery: opts.gallery ?? {
        name: '',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTagsString: '',
        excludeTagsString: '',
      },
      uploadTags: opts.uploadTags ?? '',
      externalLinkSlots: buildExternalLinkSlots(
        opts.externalLinks ?? null,
        [],
        opts.fieldErrors,
      ),
    },
  };
}

export function getMemberGalleryEditPage(
  memberKey: string,
  galleryId: string,
  input: {
    gallery: CuratorGalleryFormFields;
    currentItems: CuratorGalleryEditView['currentItems'];
    currentItemsTruncated: boolean;
    // Pre-fills the upload widget's tag input with the gallery's criteria as a
    // suggestion. User-editable, and the user-supplied value is what gets
    // applied to uploads; nothing is auto-stamped from it.
    uploadTags: string;
    externalLinkSlots: ExternalLinkSlot[];
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
  },
): PageViewModel<MemberGalleryEditContent> {
  return {
    seo: { title: 'Edit Gallery' },
    page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
    content: {
      formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
      cancelHref: `/members/${memberKey}/galleries`,
      uploadMediaHref: `/members/${memberKey}/media/upload`,
      errorMessage: input.errorMessage ?? null,
      fieldErrors: input.fieldErrors,
      gallery: input.gallery,
      currentItems: input.currentItems,
      currentItemsTruncated: input.currentItemsTruncated,
      uploadTags: input.uploadTags,
      externalLinkSlots: input.externalLinkSlots,
    },
  };
}

/** Caps on the empty state's community examples and popular-tag chips. */
const TEACHING_EXAMPLE_LIMIT = 6;
const TEACHING_TAG_LIMIT = 8;

/** One of the member's galleries as the list renders it. */
export interface MemberGalleryListRow extends CuratorGallerySummary {
  editHref: string;
  deleteHref: string;
  isConfirmDelete: boolean;
}

/**
 * The empty state a member with no media is taught with: what other people
 * have shared, and the tags to reach for.
 */
export interface MemberGalleryListTeaching {
  exampleItems: GalleryItem[];
  popularTags: TagChipShape[];
  stats: HashtagStatsSummary;
}

export interface MemberGalleryListContent {
  galleries: MemberGalleryListRow[];
  listHref: string;
  newGalleryHref: string | null;
  uploadMediaHref: string | null;
  benefitNotice: TierBenefitNotice | null;
  teaching: MemberGalleryListTeaching | null;
  savedMessage: string | null;
  errorMessage: string | null;
}

function memberGalleryRows(
  summaries: CuratorGallerySummary[],
  memberKey: string,
  confirmDeleteId: string | null,
): MemberGalleryListRow[] {
  return summaries.map((g) => ({
    ...g,
    editHref: `/members/${memberKey}/galleries/${g.id}/edit`,
    deleteHref: `/members/${memberKey}/galleries/${g.id}/delete`,
    // The default gallery cannot be deleted, so it never offers the
    // confirmation step even when its id arrives in the query.
    isConfirmDelete: confirmDeleteId !== null && g.id === confirmDeleteId && !g.isDefault,
  }));
}

/**
 * The member's own gallery list.
 *
 * This is the one media surface a member without the Tier 1 benefits still
 * reaches, so it is where they learn what they no longer hold, and the notice
 * decides the page: every write control leads to a form the gate would refuse,
 * so where the notice is present the hrefs behind those controls are absent and
 * nothing downstream can draw one.
 *
 * `readCommunityExamples` is taken as an input rather than called directly
 * because the community browse shaping it performs belongs to the media
 * service, which already reads this module. Passing the read in keeps that
 * ownership boundary and the module graph intact, while the rule that decides
 * WHETHER a member is taught at all stays here with the galleries it counts: no
 * galleries means nothing has been uploaded, because the Personal Gallery
 * materializes on first upload.
 */
export function getMemberGalleryListPage(
  svc: CuratorMediaService,
  input: {
    memberKey: string;
    memberId: string;
    memberSlug: string;
    confirmDeleteId: string | null;
    savedFlag: 'create' | 'edit' | 'delete' | 'upload' | null;
    readCommunityExamples: (limit: number, backHref: string) => GalleryItem[];
  },
): PageViewModel<MemberGalleryListContent> {
  const { memberKey, memberId } = input;
  const listHref = `/members/${memberKey}/galleries`;
  const summaries = svc.listGalleriesForOwner(memberId);
  const benefitNotice = hasTier1Benefits(memberId)
    ? null
    : buildTierBenefitNotice(input.memberSlug, 'media');
  const teaching = summaries.length > 0 ? null : {
    exampleItems: input.readCommunityExamples(TEACHING_EXAMPLE_LIMIT, listHref),
    popularTags: hashtagDiscoveryService.getPopularTagsCommunityFirst(TEACHING_TAG_LIMIT),
    stats: hashtagDiscoveryService.getCommunityHashtagSummary(),
  };

  return {
    seo: { title: 'My Galleries' },
    page: { sectionKey: 'members', pageKey: 'member_galleries_list', title: 'My Galleries' },
    content: {
      galleries: memberGalleryRows(summaries, memberKey, input.confirmDeleteId),
      listHref,
      newGalleryHref: benefitNotice ? null : `${listHref}/new`,
      uploadMediaHref: benefitNotice ? null : `/members/${memberKey}/media/upload`,
      benefitNotice,
      teaching,
      // Pre-shaped so the template never branches on the raw flash code.
      savedMessage: input.savedFlag === 'upload' ? 'Uploaded.' : input.savedFlag ? 'Saved.' : null,
      errorMessage: null,
    },
  };
}

/**
 * The same list re-rendered after a refused write.
 *
 * It carries the write controls whatever the tier gate would say now, because
 * only a member holding the benefits can have attempted the write that failed,
 * and it teaches nobody: a member who just tried to write is not in the empty
 * state the teaching block is for.
 */
export function getMemberGalleryListErrorPage(
  svc: CuratorMediaService,
  input: {
    memberKey: string;
    memberId: string;
    errorMessage: string;
  },
): PageViewModel<MemberGalleryListContent> {
  const { memberKey } = input;
  const listHref = `/members/${memberKey}/galleries`;
  return {
    seo: { title: 'My Galleries' },
    page: { sectionKey: 'members', pageKey: 'member_galleries_list', title: 'My Galleries' },
    content: {
      galleries: memberGalleryRows(svc.listGalleriesForOwner(input.memberId), memberKey, null),
      listHref,
      newGalleryHref: `${listHref}/new`,
      uploadMediaHref: `/members/${memberKey}/media/upload`,
      benefitNotice: null,
      teaching: null,
      savedMessage: null,
      errorMessage: input.errorMessage,
    },
  };
}
