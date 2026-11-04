/**
 * CuratorMediaService -- curator-attributed media uploads and named-gallery editing.
 *
 * Owns:
 *   - Admin upload, edit, delete, and list of curator photos and videos on behalf
 *     of the system member account
 *   - Member-self media lifecycle: photo upload, video URL submission,
 *     per-item edit, and permanent delete behind a confirm page (owner-scoped
 *     row loads; auto-applied `#by_<slug>` uploader marker)
 *   - Magic-byte and format validation
 *   - ffmpeg curator transcode pipeline
 *   - Storage key construction matching the curator-seed layout
 *   - Auto-application of the `#curated` uploader marker
 *   - Player credits on edit: a person picked from the edit pages' player
 *     search, which reuses member search (`memberService.searchMembers`)
 *     rather than a search of its own
 *   - Admin and member named-gallery editing (FH-owned and member-owned
 *     `member_galleries` rows)
 *   - The page contracts for the admin curator surface and for the member's own
 *     media, galleries and gallery list: the `get*Page` builders at the end of
 *     this file return a typed `PageViewModel`, so a controller parses the
 *     request, chooses the status code, and renders what it is handed. The
 *     hrefs a page displays are composed there, and a controller never augments
 *     what a builder returned. The member delete confirm page is the one
 *     builder on the service object itself, because it reads the item row
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
 *   - Every typed tag (media tags, gallery tags and criteria, the curator list
 *     filter) is folded by the one rule (`typedTag` in `slugify.ts`) before it is
 *     validated or stored, so a tag typed with accents, hyphens or no '#' is stored
 *     in the site's one form; two typed spellings of one tag are kept once. The
 *     save's success message names each typed tag that folding changed
 *     (`changedTypedTags`, `foldedTagsLine`), on every page a media save lands on.
 *   - Member gallery ids fold the gallery name by the same rule.
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
 *   - A shared photo, member or curated, is refused outside 1.91:1 landscape to
 *     3:4 portrait, judged on its upright dimensions and before anything is
 *     stored; avatars and video posters keep the wider 4:1 limit.
 *   - A member photo is held to the administrator's size-per-photo and
 *     photos-per-hour settings (`system_config_current`), the size clamped to
 *     the 25 MB code maximum; an administrator uploading is held only to the
 *     code maximum and is not rate-limited.
 *   - All DB writes for one upload (`media_items` + `media_tags` + `audit_entries`)
 *     land in one transaction; storage `put` calls happen BEFORE the transaction
 *     opens; if any put fails, the transaction never runs.
 *   - Async interactive admin video upload uses the `media_jobs` flow via
 *     MediaJobService: `beginCuratorVideoUpload` checks the claimed files,
 *     mints the job and its storage keys and signs the two PUTs;
 *     `finalizeCuratorVideoUpload` measures the uploaded bytes and dispatches the
 *     job to the worker; `finalizeTranscodeForJob` is the worker-side finalize.
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
 *     only where sidecar writes are enabled (a developer machine before go-live;
 *     sidecar I/O failure logged but does not roll back DB). Member-owned never
 *     touches the filesystem.
 *   - Gallery edit never mutates item tags; current-items display rows derive from
 *     criteria/exclude tags via `listGalleryItemsForDisplay`.
 *   - A gallery's cover (`member_galleries.cover_media_id`) is chosen on the
 *     edit form from the gallery's own photos, never uploaded there. A newly
 *     chosen cover must be an active, non-avatar photo matching the gallery's
 *     saved hashtags
 *     (`isGalleryCoverCandidate`); a stored cover carried through unchanged
 *     is not re-checked, because the read honours it only while it still
 *     matches (`listGalleryCovers`) and the newest photo stands in otherwise.
 *     The cover counts in the submitted-twice comparison, so a cover-only
 *     change saves and its repeat does not. An administrator moderating a
 *     member's gallery cannot change it. A curated gallery's save file names
 *     the cover by its `source_filename` (`coverPhoto`), never its media id,
 *     which changes with the file's bytes.
 *   - `createGallery` and `updateGallery` accept `externalLinks`; each URL passes
 *     `validateExternalUrl` (DD §3.17) behind the throttle, before the write.
 *     Per-gallery cap `config.galleryMaxExternalLinks`.
 *   - A member's upload, video, gallery create or gallery edit submitted twice
 *     reports the first outcome and writes, records and counts nothing. It is
 *     recognised on every field the form carries, before the throttle and with
 *     no network call (a link is compared in the parsed form the full check
 *     stores), and recognised again where the write meets the first submit's
 *     row: inside the video insert's transaction, and in the unique-name failure
 *     of a photo or a gallery. One recognised there gives back the slot it took.
 *   - Every write that touches the authoring tree is gated on
 *     `config.allowCuratedSidecarWrites` (dev only), decided in this service
 *     rather than by any caller: URL-reference, photo and video uploads, edits,
 *     and FH-owned gallery writes. A category supplied where the tree is not
 *     writable is accepted and unused, since it names a directory that does not
 *     exist there.
 *   - Provenance ids are checked against `media_sources` before any write, so an
 *     unregistered id is a field-level validation error rather than a
 *     foreign-key failure surfacing as a server error.
 *   - Human-authored text (captions and titles, gallery names, descriptions
 *     and link labels, moderation reasons) is cleaned with the shared
 *     sanitizer before validation, so limits and uniqueness apply to what is
 *     stored; a comparison with a stored value cleans both sides.
 *   - Pre-go-live guardrail: where curated sidecar writes are on (dev, and the
 *     integration-test fixture, which set `config.allowCuratedSidecarWrites`), a
 *     curated/system write (curator photo/video/url-ref upload, edit, delete, and
 *     FH-owned gallery create/update/delete) refuses a seeded test-persona actor
 *     (`assertCuratorActorMayWriteCurated`); real maintainer accounts carry
 *     ordinary ids and pass. In staging and
 *     production the sidecar write is off, so any admin may curate and the guard
 *     is a no-op. Member-owned writes never call it.
 *   - Nothing is put in a gallery. A member shares through one Share Media form
 *     (`shareMemberMedia`): photos or one video link carrying one set of typed
 *     hashtags, and optionally a gallery named from those same hashtags, created
 *     through `createGallery` before any photo, so it stands even if every photo
 *     is refused. The gallery's address and hashtags come from
 *     `previewNewMemberGallery`, which both the form's preview and the save use;
 *     a submit whose recorded preview is missing or stale is shown it first and
 *     writes nothing. Each photo is shared on its own (`uploadPhotoForMember`),
 *     a refused one named while the rest go on. The curator shares through the
 *     same form (`shareCuratorMedia`, page `getCuratorSharePage`), adding a
 *     video file: a gallery named there is Footbag Hacky's, previewed by
 *     `previewNewCuratorGallery` (address from the name or the Advanced slug,
 *     an address another gallery holds refused) and written through
 *     `createCuratorGallery`, so its sidecar and audit row are those of any
 *     curator gallery; on the S3 path the gallery is made at signing
 *     (`signCuratorVideoUpload`), and the external URL rides the media job to
 *     the row. Gallery edit forms take no files, and no other create path
 *     exists. Auto-applied tags are exactly `#by_<slug>` (member) and
 *     `#curated` (FH-owned).
 *   - Upload limits: the size per photo, photos per submit and total per submit
 *     are admin settings read per request (`photoMaxBytes`,
 *     `photoMaxFilesPerSubmit`, `photoMaxSubmitBytes`), each clamped to a code
 *     maximum. Photos per submit and total per submit hold every uploader,
 *     administrators and the curator included, because they bound the web
 *     container's memory; an administrator is held to the code maximum alone
 *     for the size per photo, and is exempt from the hourly photo limit.
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
 *     stays reserved, which is exactly why this lookup has to refuse it. A club
 *     hashtag no club holds any more, which a hashtag move leaves reserved, is
 *     refused there the same way.
 *
 * Persistence:
 *   media_items, media_tags, tags, audit_entries, members, member_galleries,
 *   member_gallery_tags, member_gallery_exclude_tags. Filesystem:
 *   `/curated/{category}/*.meta.json` (URL-reference sidecars), file-paired
 *   `<slug>.{jpg,png,mp4,webm,mov}` + sibling `<slug>.meta.json` + optional
 *   `<slug>.poster.<ext>`, `/curated/galleries/<slug>.json` (FH gallery sidecars;
 *   the source of truth before go-live only, written on a developer machine).
 *
 * Side effects:
 *   - audit_entries append per upload or gallery mutation, including
 *     `media.member_gallery_moderated` when an administrator acts on a gallery
 *     another member owns
 *   - outbox enqueue of the gallery owner's notice on that moderation, inside
 *     the same transaction so a rolled-back change cannot announce itself
 *
 * Service shape: factory `createCuratorMediaService(deps)`. Deps include
 * MediaStorageAdapter, ImageProcessingAdapter, and VideoTranscodingAdapter (the
 * factory pattern allows test injection). The async video path also reaches the
 * media-job service and the transcode dispatch client through their accessors.
 */
import { createHash, randomUUID } from 'crypto';
import path from 'path';
import { GALLERY_ITEMS_QUERY_CAP, countGalleryItemsByCriteria, isGalleryCoverCandidate, listGalleryCovers, listGalleryItemsForDisplay, media, mediaTags as mediaTagsDb, queryCuratorMediaTags, queryGalleryItemsByCriteriaGrouped, tagStats, transaction, type GallerySortOrder, type MediaJobRow } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { detectImageType, photoShapeRefusal, RENDITION_IMAGE_MIME } from '../lib/imageProcessing';
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
import { cleanUserText, INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { hit as rateLimitHit, refund as rateLimitRefund } from './rateLimitService';
import { readIntConfig } from './configReader';
import { getMediaJobService, isAbandonedUpload, type MediaJobState } from './mediaJobService';
import { getTranscodeDispatchClient, TranscodeDispatchError } from './transcodeDispatchClient';
import { hasTier1Benefits } from './tierPredicates';
import { appendAuditEntry, findOwnLatestAudit } from './auditService';
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
import type { GalleryItem, ShareNotices } from './mediaService';
import type { ShareOutcome } from '../lib/flashCookie';
import { memberService, type SearchBlockView } from './memberService';
import { foldTypedHashtags, hasUnconvertibleLetters, slugifyForTag, typedTag, typedTagForDisplay } from './slugify';
import { assertTypedTags, tagRuleRefusal } from './typedTokenRules';
import type { PageViewModel, TierBenefitNotice } from '../types/page';

// The code maximum for one photo. An administrator's "Size per photo" setting
// can lower the limit a member is held to, never raise it past this, and an
// administrator uploading is held to this alone. It is also the multipart
// parser's back-stop, so no request body carries a larger photo part.
export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = config.videoMaxBytes;
/** The limit as the reader sees it, so message and check can never disagree. */
export const VIDEO_MAX_MB = Math.floor(VIDEO_MAX_BYTES / (1024 * 1024));
export const POSTER_MAX_BYTES = 25 * 1024 * 1024;
export const CAPTION_MAX_LEN = 500;

// Every size refusal derives its figure from the limit it enforces, so a limit
// change cannot leave a message naming the old one.
function megabytes(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}
export function photoTooLargeMessage(maxBytes: number): string {
  return `Photo is too large. Maximum size is ${megabytes(maxBytes)} MB.`;
}

// A photo refused because its uploader already holds one under that file
// name, the uniqueness the media table keeps per uploader. One sentence for a
// member's photo and the curator's.
function fileNameTakenMessage(sourceFilename: string | null | undefined): string {
  return `You have already uploaded a file named "${sourceFilename}". ` +
    `Rename the file or delete the previous upload first.`;
}

/**
 * The largest photo this uploader may share, in bytes: the administrator's
 * size-per-photo setting for a member, read per request so a change applies
 * to the next upload, clamped to the code maximum; the code maximum itself for
 * an administrator, who is exempt from the member upload limits.
 */
export function photoMaxBytes(actorIsAdmin: boolean): number {
  if (actorIsAdmin) return PHOTO_MAX_BYTES;
  const configuredMb = readIntConfig('photo_upload_max_file_mb', megabytes(PHOTO_MAX_BYTES));
  return Math.min(configuredMb * 1024 * 1024, PHOTO_MAX_BYTES);
}

// The code maximums for one Share Media submit. The "Photos per submit" and
// "Total per submit" settings can lower what a submit may hold, never raise it
// past these. They bound what one request makes the web container hold in
// memory, which is the same whoever uploads, so they hold administrators and
// the curator too: there is one web container, and an out-of-memory kill drops
// every request in flight while it restarts.
export const PHOTO_MAX_FILES_PER_SUBMIT = 20;
export const PHOTO_MAX_SUBMIT_BYTES = 250 * 1024 * 1024;

/** The most photos any uploader may choose in one submit. */
export function photoMaxFilesPerSubmit(): number {
  const configured = readIntConfig('photo_upload_max_files_per_submit', 4);
  return Math.max(1, Math.min(configured, PHOTO_MAX_FILES_PER_SUBMIT));
}

/** The most bytes all the photos of one submit may come to together, for any uploader. */
export function photoMaxSubmitBytes(): number {
  const configuredMb = readIntConfig('photo_upload_max_submit_mb', 50);
  return Math.min(Math.max(1, configuredMb) * 1024 * 1024, PHOTO_MAX_SUBMIT_BYTES);
}

// What a Share Media submit's text fields and multipart framing add to the
// files themselves: captions, hashtags and boundaries come to far less.
const SHARE_BODY_OVERHEAD_BYTES = 1024 * 1024;

/**
 * The refusal for a Share Media submit whose declared size (its Content-Length)
 * is more than any submit the form allows could be, or null. Checked before the
 * reader holds anything, because the reader bounds each part and the part
 * count but not their sum, so "Total per submit" is what bounds the memory one
 * submit takes only when it is checked here. `allowsVideoFile` is the curator
 * form where a video file is read through it (the local storage adapter); its
 * bound is then the video and poster ceilings. A submit sent without a declared
 * size is held to the service's own total check after reading.
 */
export function shareBodyRefusal(declaredBytes: number, opts: { allowsVideoFile: boolean }): string | null {
  if (!Number.isFinite(declaredBytes) || declaredBytes <= 0) return null;
  const photoCeiling = photoMaxSubmitBytes() + SHARE_BODY_OVERHEAD_BYTES;
  if (declaredBytes <= photoCeiling) return null;
  if (opts.allowsVideoFile && declaredBytes <= VIDEO_MAX_BYTES + POSTER_MAX_BYTES + SHARE_BODY_OVERHEAD_BYTES) {
    return null;
  }
  return opts.allowsVideoFile
    ? VIDEO_TOO_LARGE_MESSAGE
    : `Those photos come to more than ${megabytes(photoMaxSubmitBytes())} MB together. Share them in smaller groups.`;
}

/** The limits a Share Media form names and the browser checks before sending. */
export interface ShareUploadLimits {
  maxFiles: number;
  fileMb: number;
  totalMb: number;
}

export function shareUploadLimits(actorIsAdmin: boolean): ShareUploadLimits {
  return {
    maxFiles: photoMaxFilesPerSubmit(),
    fileMb: megabytes(photoMaxBytes(actorIsAdmin)),
    totalMb: megabytes(photoMaxSubmitBytes()),
  };
}
export const VIDEO_TOO_LARGE_MESSAGE = `Video is too large. Maximum size is ${VIDEO_MAX_MB} MB.`;
export const POSTER_TOO_LARGE_MESSAGE =
  `Poster is too large. Maximum size is ${megabytes(POSTER_MAX_BYTES)} MB.`;

// The file types the async curator video upload accepts, each with the
// extension its stored source object takes.
const VIDEO_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
const POSTER_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const ALLOWED_VIDEO_CONTENT_TYPES = new Set(Object.keys(VIDEO_EXTENSIONS));
const ALLOWED_POSTER_CONTENT_TYPES = new Set(Object.keys(POSTER_EXTENSIONS));

/** The refusal for an upload form part that crossed the parser's per-file ceiling. */
export function fileExceededMessage(maxBytes: number): string {
  return `File exceeded the maximum allowed size of ${megabytes(maxBytes)} MB.`;
}

// Slot count 1: serializes ffmpeg transcode at the service boundary so two
// concurrent admin uploads cannot OOM the staging Lightsail nano_3_0 host
// (512 MB total, undersized vs DD §1.8 production target). Wait timeout is
// generous because legitimate transcode takes 1-3 min.
const TRANSCODE_WAIT_MS = 10 * 60 * 1000;
// Test seam: told when an upload starts waiting for the transcode slot, so a
// serialization test acts on that event rather than on a delay.
let transcodeWaitObserverForTests: (() => void) | null = null;
export function setTranscodeWaitObserverForTests(fn: (() => void) | null): void {
  transcodeWaitObserverForTests = fn;
}
const transcodeBound = new Semaphore(1, TRANSCODE_WAIT_MS, () => transcodeWaitObserverForTests?.());

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

/**
 * The authoring tree every curation screen writes its sidecars into on a
 * developer machine: the explicit root a caller was built with, else the test
 * override, else the e2e stack's throwaway root (CURATED_ROOT_DIR), else the
 * repository's `curated/`. Under test with none of the first three set it
 * throws rather than falling through, which would write test artifacts into the
 * real repo.
 */
export function resolveCuratedRootDir(explicit?: string): string {
  if (explicit) return explicit;
  if (curatedRootDirOverrideForTests) return curatedRootDirOverrideForTests;
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

// The member's own gallery list, where every member gallery and upload form
// returns to.
export function memberGalleriesHref(memberKey: string): string {
  return `/members/${memberKey}/galleries`;
}

// A typed tag list in its stored forms, split and folded by the one grammar
// (`foldTypedHashtags`): each '#' starts a hashtag, words typed without one stay
// one hashtag, so "#Zoë-Müller" and "Zoë Müller" are both stored as
// "#Zoe_Muller". Anything that is not a string reads as no tags, so a malformed
// submission is refused by tag validation rather than crashing.
export function parseTagList(raw: unknown): string[] {
  return foldTypedTagList(raw).map((t) => t.stored);
}

/**
 * Each typed tag beside the form it is stored in, in typed order. The typed
 * tags whose stored form differs (an accent folded, a space or hyphen made an
 * underscore) are the ones a member is told about after saving.
 */
export function foldTypedTagList(raw: unknown): { typed: string; stored: string }[] {
  return typeof raw === 'string' ? foldTypedHashtags(raw) : [];
}

/**
 * The line a saved message carries when the save stored typed tags in a folded
 * form, naming each change; null when nothing was folded. Shared by every page a
 * media save lands on, so they all say it the same way.
 */
export function foldedTagsLine(folded: { typed: string; stored: string }[]): string | null {
  if (folded.length === 0) return null;
  const asTyped = (t: string) => (t.startsWith('#') ? t : `#${t}`);
  const [first, ...rest] = folded;
  const pairs = [`${asTyped(first.typed)} was saved as ${first.stored}`,
    ...rest.map((f) => `${asTyped(f.typed)} as ${f.stored}`)];
  const listed = pairs.length === 1 ? pairs[0]
    : `${pairs.slice(0, -1).join(', ')}, and ${pairs[pairs.length - 1]}`;
  return `${listed}. Hashtags use only the letters a to z, digits and underscores, so accented letters become plain ones and other characters become underscores.`;
}

/**
 * The typed tags a save changed, for the line that tells the member. Adding the
 * leading '#' or lowering capitals is not a change worth a line, as before.
 */
export function changedTypedTags(...raws: unknown[]): { typed: string; stored: string }[] {
  return foldTypedHashtags(...raws.filter((r): r is string => typeof r === 'string')).filter((t) => {
    const asTyped = (t.typed.startsWith('#') ? t.typed : `#${t.typed}`).toLowerCase();
    return asTyped !== t.stored.toLowerCase();
  });
}

/**
 * The typed tags plus the player credit a member-search pick names, unless
 * the tags already carry it. The pick is an ordinary tag from here on, so tag
 * validation judges it like any typed one.
 */
export function withPlayerCredits(tags: string[], addPlayer: string | undefined): string[] {
  const picked = addPlayer?.trim();
  if (!picked) return tags;
  const have = new Set(tags.map((t) => t.toLowerCase()));
  return have.has(picked.toLowerCase()) ? tags : [...tags, picked];
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
  // retired and the persistent DB becomes the source of truth. The upload form
  // supplies it where the authoring tree is written and omits it elsewhere; the curator seeder
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
  /** Set when this was the member's own upload submitted again: the item its
   *  first submit stored is returned and nothing was written. */
  repeat?: true;
}

// Member-self edit form's view-model shape (caption + tags + external URL).
// Sidecar and clip-range fields are admin-only and not surfaced on
// the member edit page.
export interface MemberMediaItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  tags: string[];
  externalUrl: string | null;
}

// One of the member's own items, or null when they do not own it.
function readMemberMediaItem(mediaId: string, ownerMemberId: string): MemberMediaItem | null {
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
  // A player credit picked from member search, added on top of `tags`
  // (ignored when `tags` is undefined).
  addPlayer?: string;
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
 * Give back the attempt `throttlePerActor` counted, for a submit recognised as
 * a repeat only where its write met the first submit's row.
 */
function refundPerActor(bucket: string, actorId: string): void {
  rateLimitRefund(`${bucket}:${actorId}`);
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
// The owner slug is used as stored: a member slug is already a folded token,
// so folding it again could only make the id disagree with `#by_<slug>`.
function buildMemberGalleryId(
  ownerSlug: string,
  galleryName: string,
  attempt: number,
): string {
  const nameSlug = slugifyGalleryName(galleryName);
  const suffix = attempt > 0 ? `_${attempt + 1}` : '';
  return `gallery_${ownerSlug}_${nameSlug}${suffix}`;
}

// The name folded by the one rule ("Zürich Trip" gives zurich_trip), cut to 60
// characters so the id stays well under URL limits after its prefix and any
// collision suffix, with an underscore the cut leaves at the end trimmed, so an
// id never ends in `_` or holds `__` before a suffix. A name that folds to no
// address never reaches here: createGallery refuses it (`galleryNameMakesNoAddress`).
function slugifyGalleryName(name: string): string {
  return slugifyForTag(name).slice(0, 60).replace(/_+$/, '');
}

/**
 * Whether a new member gallery's name cannot make its address by the slug rule:
 * it holds letters with no a to z form, which folding would drop, or it is made
 * of symbols only, which fold to nothing.
 */
export function galleryNameMakesNoAddress(name: string): boolean {
  return hasUnconvertibleLetters(name) || slugifyGalleryName(name).length === 0;
}

// Shown when a new member gallery's name cannot make its address.
export const GALLERY_NAME_NO_ADDRESS_MESSAGE =
  'A gallery\'s address is made from its name, so the name needs a word in the letters a to z.';

// Returns the caption as it is to be stored. Cleaned before the length check,
// so the limit counts what is stored rather than markup that is dropped.
function validateCaption(caption: string | null): string | null {
  if (caption === null) return null;
  const cleaned = cleanUserText(caption, 'multi_line', 'caption');
  if (cleaned.length > CAPTION_MAX_LEN) {
    throw new ValidationError(`Caption must be ${CAPTION_MAX_LEN} characters or fewer.`);
  }
  return cleaned;
}

// Text as a comparison with what is stored reads it: both sides cleaned, so an
// older value stored before cleaning existed, posted back unedited, compares
// equal to itself rather than reading as a change or a different submission.
// Text that cannot be cleaned is compared as it stands.
function comparableText(text: string | null, shape: 'single_line' | 'multi_line'): string {
  const result = sanitizeUserText(text ?? '', shape);
  return result.status === 'ok' ? result.text : (text ?? '');
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
  coverMediaId:  'its cover photo',
};

function validateTags(tags: string[]): void {
  for (const tag of tags) {
    if (!tag.startsWith('#')) {
      throw new ValidationError(`A hashtag must start with '#': got "${tag}"`);
    }
    // Mixed case is accepted: the original capitalization is preserved for
    // display and matching is case-insensitive. The reserved-namespace guards
    // below compare on the lowercased form so attribution cannot be forged with
    // a case variant (e.g. #CURATED or #By_<slug>).
    const normalized = tag.toLowerCase();
    if (normalized === CURATED_TAG) {
      throw new ValidationError(
        `The ${CURATED_TAG} hashtag is auto-applied by the curator pipeline and must not appear in input.`,
      );
    }
    if (normalized.startsWith(UPLOADER_TAG_PREFIX)) {
      throw new ValidationError(
        `Hashtags starting with "${UPLOADER_TAG_PREFIX}" are auto-applied as uploader attribution and must not appear in input: got "${tag}"`,
      );
    }
  }
}

// A typed media tag list in its stored form, held to every tag rule: folded by the
// one rule (so a list reaching the service by any path is stored the same way),
// one of each, refused for a reserved tag, and refused by name for any tag rule it
// breaks (no a to z form, too long, too many).
function checkedTags(tags: string[]): string[] {
  const stored = foldTypedHashtags(...tags).map((t) => t.stored);
  validateTags(stored);
  assertTypedTags(stored);
  return stored;
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
// which retirement emptied, so closing it here closes it everywhere. A club
// hashtag no club holds any more (the old value a hashtag move leaves reserved)
// is refused the same way, since media carrying it would reach no club.
function resolveTagIdOrCreate(
  normalized: string,
  display: string,
  now: string,
  field: string,
): string {
  const existing = mediaTagsDb.findTagByNormalized.get(normalized) as
    | { id: string; retired_at: string | null; unheld: number }
    | undefined;
  if (existing) {
    if (existing.retired_at !== null || existing.unheld === 1) {
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

/**
 * Whether a member's stored item carries exactly what a new submission asks
 * for: the same caption, the same tags (with the uploader tag every member
 * upload carries) and the same external link. A repeated submit of the same
 * form always does; one that changed any of them is not a repeat, so it is
 * never told that a change it did not get went through.
 *
 * The link is compared in the form the validator stores, which is the parsed
 * URL's own string, worked out here with no network call: a repeat is matched
 * before any throttle, so it must cost nothing outbound, and the stored link
 * already passed the full check when the first submit was accepted.
 * Synchronous, so it can run again inside the write's transaction.
 */
function storedItemMatches(
  mediaId: string,
  memberId: string,
  slug: string,
  submitted: { caption: string | null; tags: string[]; externalUrl?: string | null },
): boolean {
  const row = media.getMemberMediaItemById.get(mediaId, memberId) as
    | { caption: string | null; external_url: string | null } | undefined;
  if (
    !row
    || comparableText(row.caption, 'multi_line') !== comparableText(submitted.caption, 'multi_line')
  ) return false;

  const stored = queryCuratorMediaTags([mediaId]).map((r) => r.tag_normalized).sort();
  const wanted = [...new Set([
    `${UPLOADER_TAG_PREFIX}${slug.toLowerCase()}`,
    ...submitted.tags.map((t) => t.toLowerCase()),
  ])].sort();
  if (stored.length !== wanted.length || stored.some((t, i) => t !== wanted[i])) return false;

  const rawUrl = (submitted.externalUrl ?? '').trim();
  if (!rawUrl) return row.external_url === null;
  if (rawUrl === row.external_url) return true;
  try {
    return new URL(rawUrl).toString() === row.external_url;
  } catch {
    return false;
  }
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
      `Your ${PERSONAL_GALLERY_NAME} always shows everything you have uploaded, so it takes no criteria or exclude hashtags. Create a named gallery to collect a subset.`,
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
  // into the sidecar JSON; ignored on DB-direct rows. `sourceId` accepts
  // null to clear the field; absent (undefined) leaves the existing
  // sidecar value alone. `startSeconds`/`endSeconds` follow the same rule.
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
  // Closed enum mirrors db.ts CuratorListSort; the list page narrows the
  // query-string value to this set before it reaches here.
  sort?: CuratorListSortKey;
}

export type CuratorListSortKey = 'date_desc' | 'date_asc' | 'type_asc' | 'caption_asc';

// Sort is a viewing preference, not a contract, so an unknown value falls back
// to newest first rather than being refused.
function toCuratorListSort(raw: string | null): CuratorListSortKey {
  return raw === 'date_asc' || raw === 'type_asc' || raw === 'caption_asc' ? raw : 'date_desc';
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
  currentItems: Array<{
    mediaId: string;
    mediaType: 'photo' | 'video';
    thumbnailUrl: string;
    caption: string | null;
    sourceFilename: string;
    editHref: string;
    // Topical hashtags on the item (the uploader marker and #curated are
    // filtered out), so the owner can see how each item is tagged while
    // managing the gallery.
    tags: string[];
    // Whether this item is offered as the gallery's cover (a photo the public
    // gallery shows), and whether it is the one the form has chosen.
    canBeCover: boolean;
    isCover: boolean;
  }>;
  // True when the matching set exceeds the single-page render cap and
  // currentItems holds only the first page-worth; the form shows a notice.
  currentItemsTruncated: boolean;
  coverChoice: GalleryCoverChoice;
  // External URLs already attached to the gallery; pre-fills the edit
  // form's external-link fieldset. Empty when none have been set.
  // `quarantineReason` is non-null when the URL failed verification (a Safe
  // Browsing match) at data-prep or submit time; the admin form surfaces these inline with a
  // warning so the operator can replace the URL or remove the link.
  externalLinks: Array<{
    label: string;
    url: string;
    quarantineReason: string | null;
  }>;
}

/**
 * The edit form's cover choice. `offered` is false where no photo can be
 * chosen (a gallery with none, or an administrator moderating a member's
 * gallery, whose cover is the owner's), and then the form renders no cover
 * control and its save keeps the stored choice. `useNewest` checks the
 * "Use the newest photo" choice. `outsideList` is the chosen cover when it is
 * still in the gallery but past the items the form lists, so it is shown and
 * submitted rather than silently dropped.
 */
export interface GalleryCoverChoice {
  offered: boolean;
  useNewest: boolean;
  outsideList: CuratorGalleryEditView['currentItems'][number] | null;
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

// Reads the gallery form's externalLinkLabel<i> + externalLinkUrl<i> pairs, one
// per slot the form offers (galleryMaxExternalLinks of them), into the
// service-input shape. Blank pairs are dropped: the form submits every slot,
// filled or not.
export function parseExternalLinkInputs(
  fields: Record<string, unknown>,
): CuratorGalleryExternalLinkInput[] {
  const out: CuratorGalleryExternalLinkInput[] = [];
  for (let i = 0; i < config.galleryMaxExternalLinks; i++) {
    const label = String(fields[`externalLinkLabel${i}`] ?? '');
    const url = String(fields[`externalLinkUrl${i}`] ?? '');
    if (!label.trim() && !url.trim()) continue;
    out.push({ label, url });
  }
  return out;
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
  // The photo chosen to stand for the gallery, as the edit form's Cover radio
  // submits it: a media id, or '' / null for "use the newest photo". Omitted
  // (undefined) keeps the stored choice, which is what a form offering no
  // photo to choose from submits. Only an edit sets it; a create has none.
  coverMediaId?: string | null;
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
  // Owner-on-write: explicit so the caller decides whether the
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
  /** Set when this was the actor's own create submitted again: the gallery
   *  its first submit made is returned and nothing was written. */
  repeat?: true;
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
    return resolveCuratedRootDir(deps.curatedRootDir);
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
    // exists, for an FH-owned gallery create that names the system member as
    // its owner.
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
      input = { ...input, caption: validateCaption(input.caption) };
      input = { ...input, tags: checkedTags(input.tags) };
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.photoBuffer.length > PHOTO_MAX_BYTES) {
        throw new ValidationError(photoTooLargeMessage(PHOTO_MAX_BYTES));
      }
      const detectedImage = detectImageType(input.photoBuffer);
      if (!detectedImage) {
        throw new ValidationError('Only JPEG and PNG photos are accepted.');
      }

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const processed = await rejectImageAsValidation(imageProcessor.processPhoto(input.photoBuffer));
      const shapeRefusal = photoShapeRefusal(processed.widthPx, processed.heightPx);
      if (shapeRefusal) throw new ValidationError(shapeRefusal);

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
            actorType: 'admin',
            actorMemberId: input.adminMemberId,
            entityType: 'media_item',
            entityId: mediaId,
            // Counts, never the member's own typed tags, caption or file name:
            // the audit log outlives an erasure.
            metadata: { mediaType: 'photo', tagCount: input.tags.length },
          });
        });
      } catch (err) {
        await compensatingStorageDelete(storage, [thumbKey, displayKey]);
        // Footbag Hacky already holds a photo under this file name: refused by
        // name, as a member's photo is, rather than failing the request.
        const msg = (err as Error).message ?? '';
        if (msg.includes('UNIQUE') && msg.includes('source_filename')) {
          throw new ValidationError(fileNameTakenMessage(recordedSourceFilename));
        }
        throw err;
      }
      hashtagDiscoveryService.incrementTagStats(appliedTagIds);

      return { mediaId, displayUrl: storage.constructURL(displayKey) };
    },

    async uploadVideo(input: CuratorVideoInput): Promise<CuratorUploadResult> {
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      throttleCuratorWrite(input.adminMemberId);
      input = { ...input, caption: validateCaption(input.caption) };
      input = { ...input, tags: checkedTags(input.tags) };
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      if (input.videoBuffer.length > VIDEO_MAX_BYTES) {
        throw new ValidationError(VIDEO_TOO_LARGE_MESSAGE);
      }
      if (input.posterBuffer.length > POSTER_MAX_BYTES) {
        throw new ValidationError(POSTER_TOO_LARGE_MESSAGE);
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
        // Footbag Hacky already holds a file under this name: refused by name,
        // as a repeated photo name is, rather than failing the request.
        const msg = (err as Error).message ?? '';
        if (msg.includes('UNIQUE') && msg.includes('source_filename')) {
          throw new ValidationError(fileNameTakenMessage(recordedSourceFilename));
        }
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

      const tags = checkedTags(parseTagList(job.tags));
      const caption = validateCaption(job.caption);

      // Poster is small (cap 25 MB) and the worker container can hold it
      // inline. Video bytes, whose cap is far larger, are NOT pulled in here — they go
      // image-container-direct via videoTranscoder.transcodeFromStorage so
      // the worker container's 96 M staging cgroup never has to buffer the
      // source. The image worker validates the source size + magic bytes on
      // its side; the per-type max stays advisory at the service boundary.
      const posterBuffer = await storage.get(job.source_poster_key);
      if (posterBuffer.length > POSTER_MAX_BYTES) {
        throw new ValidationError(POSTER_TOO_LARGE_MESSAGE);
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
            systemMemberId, caption, now,
            videoKey, thumbnailUrl,
            shaped.widthPx, shaped.heightPx,
            job.source_filename, videoMime,
          );
          if (job.external_url) {
            media.setMediaItemExternalUrl.run(job.external_url, now, mediaId, systemMemberId);
          }
          appliedTagIds = applyTagsForCurator(mediaId, tags, now);
          appendAuditEntry({
            actionType: 'media.curated_uploaded',
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
        // Two uploads under one name raced past the sign step's check: the
        // later one is named, not reported as a database error.
        const msg = (err as Error).message ?? '';
        if (msg.includes('UNIQUE') && msg.includes('source_filename')) {
          throw new ValidationError(fileNameTakenMessage(job.source_filename));
        }
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
     * Begin one async curator video upload: check the admin's claimed files,
     * mint the job id and its two storage keys, sign a presigned PUT for each,
     * and record the job in `pending_upload`. The browser then PUTs the bytes
     * straight to storage, so large source bytes never traverse nginx or
     * CloudFront, and finalizes with the job id.
     *
     * The claimed sizes are only hints: a presigned PUT binds the content type
     * but not the size, so finalize measures the stored bytes again. The
     * per-actor curator-write throttle sits on the job row this call creates,
     * so signing is gated once rather than twice; a throttled call throws
     * RateLimitedError.
     */
    async beginCuratorVideoUpload(input: {
      adminMemberId: string;
      videoFilename: string;
      videoContentType: string;
      videoSizeBytes: number;
      posterContentType: string;
      posterSizeBytes: number;
      caption: string;
      tags: string;
      /** The item's external URL, checked here and carried on the job to the media row. */
      externalUrl?: string;
    },
    /** Run once every check here has passed and before anything is signed or
     *  stored; a refusal it returns is the answer, and nothing is signed. */
    beforeSigning?: () => Promise<string | null>,
    ): Promise<
      | { status: 'signed'; jobId: string; videoUrl: string; posterUrl: string; expiresAtIso: string }
      | { status: 'invalid'; error: string }
    > {
      const videoFilename = input.videoFilename.trim();
      const videoContentType = input.videoContentType.trim();
      const posterContentType = input.posterContentType.trim();
      const { videoSizeBytes, posterSizeBytes } = input;

      if (!videoFilename) return { status: 'invalid', error: 'videoFilename required' };
      if (!ALLOWED_VIDEO_CONTENT_TYPES.has(videoContentType)) {
        return { status: 'invalid', error: 'Only MP4, WebM, and MOV videos are accepted.' };
      }
      if (!ALLOWED_POSTER_CONTENT_TYPES.has(posterContentType)) {
        return { status: 'invalid', error: 'Poster must be a JPEG or PNG image.' };
      }
      if (!Number.isInteger(videoSizeBytes) || videoSizeBytes <= 0) {
        return { status: 'invalid', error: 'videoSizeBytes must be a positive integer.' };
      }
      if (videoSizeBytes > VIDEO_MAX_BYTES) return { status: 'invalid', error: VIDEO_TOO_LARGE_MESSAGE };
      if (!Number.isInteger(posterSizeBytes) || posterSizeBytes <= 0) {
        return { status: 'invalid', error: 'posterSizeBytes must be a positive integer.' };
      }
      if (posterSizeBytes > POSTER_MAX_BYTES) return { status: 'invalid', error: POSTER_TOO_LARGE_MESSAGE };
      // The caption waits in the job row until the transcode finishes, and the
      // job status page reads it from there, so it is cleaned before it is
      // stored rather than only when the media row is written.
      const cleanedCaption = sanitizeUserText(input.caption, 'multi_line');
      if (cleanedCaption.status === 'invalid_encoding') {
        return { status: 'invalid', error: INVALID_TEXT_ENCODING_MESSAGE };
      }
      // Checked before any URL is signed, so a bad link is refused while the
      // curator still has the form, not after the transcode.
      const externalUrlRaw = (input.externalUrl ?? '').trim();
      let externalUrl: string | null = null;
      if (externalUrlRaw) {
        const checked = await validateExternalUrl(externalUrlRaw);
        if (!checked.valid) return { status: 'invalid', error: checked.error ?? 'Invalid URL.' };
        externalUrl = checked.normalizedUrl;
      }
      // A file name Footbag Hacky already holds is refused by name here, before
      // anything is uploaded or encoded, as a repeated photo name is.
      if (runSqliteRead('getCuratorMediaByFilename', () => media.getCuratorMediaByFilename.get(videoFilename))) {
        return { status: 'invalid', error: fileNameTakenMessage(videoFilename) };
      }
      if (beforeSigning) {
        const refusal = await beforeSigning();
        if (refusal) return { status: 'invalid', error: refusal };
      }

      const jobId = `mediajob_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const prefix = config.mediaPendingUploadPrefix;
      const sourceVideoKey = `${prefix}${jobId}/source.${VIDEO_EXTENSIONS[videoContentType]}`;
      const sourcePosterKey = `${prefix}${jobId}/poster.${POSTER_EXTENSIONS[posterContentType]}`;
      const ttl = config.mediaPresignedPutTtlSeconds;
      const expiresAtIso = new Date(Date.now() + ttl * 1000).toISOString();

      const [videoUrl, posterUrl] = await Promise.all([
        storage.generatePresignedPutUrl(sourceVideoKey, videoContentType, ttl),
        storage.generatePresignedPutUrl(sourcePosterKey, posterContentType, ttl),
      ]);

      const caption = cleanedCaption.text;
      getMediaJobService().createPendingUploadJob({
        jobId,
        kind: 'curator_video',
        adminMemberId: input.adminMemberId,
        sourceVideoKey,
        sourcePosterKey,
        caption: caption.length === 0 ? null : caption,
        tags: input.tags,
        sourceFilename: videoFilename,
        externalUrl,
        expiresAtIso,
      });

      return { status: 'signed', jobId, videoUrl, posterUrl, expiresAtIso };
    },

    /**
     * Finalize an async curator video upload once the browser's two PUTs are
     * done: confirm both objects arrived within the per-type maxima, move the
     * job to `pending_transcode`, and dispatch it to the worker.
     *
     * The presigned PUT binds content type but cannot bind size, so this is the
     * first point the uploaded bytes can be measured, and an oversized source is
     * refused before the worker is ever dispatched. A job owned by another
     * admin reads as not found, so job ids cannot be probed.
     *
     * Safe to call twice: a job already past `pending_upload` is re-dispatched,
     * and a worker that has already claimed it answers 409, which reads as the
     * job this call was asked to start already running. Either way the caller
     * gets the same success the first call got.
     */
    async finalizeCuratorVideoUpload(jobId: string, adminMemberId: string): Promise<
      | { status: 'dispatched'; statusUrl: string }
      | {
          status: 'invalid' | 'not_found' | 'not_uploaded' | 'too_large' | 'dispatch_failed';
          error: string;
        }
    > {
      if (!jobId) return { status: 'invalid', error: 'jobId required' };

      const jobs = getMediaJobService();
      const job = jobs.getJobForAdmin(jobId, adminMemberId);
      if (!job) return { status: 'not_found', error: 'job not found' };
      if (!job.source_video_key || !job.source_poster_key) {
        return { status: 'not_uploaded', error: 'job has no source keys' };
      }

      const [videoSize, posterSize] = await Promise.all([
        storage.headSize(job.source_video_key),
        storage.headSize(job.source_poster_key),
      ]);
      if (videoSize === null || posterSize === null) {
        return { status: 'not_uploaded', error: 'source files have not been uploaded yet' };
      }
      if (videoSize > VIDEO_MAX_BYTES) return { status: 'too_large', error: VIDEO_TOO_LARGE_MESSAGE };
      if (posterSize > POSTER_MAX_BYTES) return { status: 'too_large', error: POSTER_TOO_LARGE_MESSAGE };

      try {
        jobs.markPendingTranscode(jobId, adminMemberId);
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
        // Already past pending_upload: re-dispatch, which is itself safe because
        // the worker claims only a row still awaiting transcode.
        logger.info('finalize: job already past pending_upload', { jobId, currentState: job.state });
      }

      try {
        await getTranscodeDispatchClient().dispatch(jobId);
      } catch (err) {
        if (!(err instanceof TranscodeDispatchError)) throw err;
        if (err.status === 409) {
          logger.info('finalize: worker already claimed this job', { jobId });
        } else {
          logger.error('finalize: worker dispatch failed', {
            jobId,
            error: err.message,
            status: err.status,
          });
          return { status: 'dispatch_failed', error: 'worker dispatch failed' };
        }
      }

      return { status: 'dispatched', statusUrl: `/admin/curator/upload/jobs/${encodeURIComponent(jobId)}` };
    },

    async uploadUrlReference(
      input: CuratorUrlReferenceInput,
    ): Promise<CuratorUrlReferenceResult> {
      assertCuratorActorMayWriteCurated(input.adminMemberId);
      input = { ...input, title: validateCaption(input.title) };
      input = { ...input, tags: checkedTags(input.tags) };
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

      // A video's id is derived from its platform and URL, so a link already in
      // the library would land on the existing row and silently replace its
      // caption, tags and external link. Refused here, before the availability
      // check or any sidecar write; the existing item is edited on its own page.
      if (media.mediaItemIdExists.get(urlRefMediaId(input.videoPlatform, input.videoUrl))) {
        throw new ValidationError('That video is already in the curated library. Edit the existing item instead.');
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
        input = { ...input, caption: validateCaption(input.caption) };
      }
      if (input.tags !== undefined) {
        input = { ...input, tags: checkedTags(input.tags) };
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
      const sourceId: string | null = row.source_id ?? null;
      const startSeconds: number | null = row.start_seconds ?? null;
      const endSeconds: number | null = row.end_seconds ?? null;

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
    // `selectedCoverMediaId`, on a re-render after a refusal, is the cover the
    // refused form submitted ('' for the newest photo), so the form comes back
    // as it was sent; otherwise the stored choice is shown.
    getGalleryForEdit(
      galleryId: string,
      restrictToOwnerId?: string,
      opts: { memberKey?: string; selectedCoverMediaId?: string | null } = {},
    ): CuratorGalleryEditView {
      return runSqliteRead('getGalleryForEdit', () => {
        const g = media.getNamedGalleryById.get(galleryId) as
          | {
            id: string; name: string; description: string;
            sort_order: GallerySortOrderValue; owner_member_id: string;
            is_default: number; is_system: number; owner_display_name: string;
            cover_media_id: string | null;
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
        const selectedCover = opts.selectedCoverMediaId === undefined
          ? g.cover_media_id
          : (opts.selectedCoverMediaId || null);
        // Member-owned galleries edit items under the member's media
        // routes; the admin curator surface has its own.
        const itemEditHref = (mediaId: string): string => (opts.memberKey
          ? `/members/${opts.memberKey}/media/${mediaId}/edit`
          : `/admin/curator/media/${mediaId}/edit`);
        const currentItems = itemRows.map((r) => {
          // Only a photo can stand for the gallery.
          const canBeCover = r.media_type === 'photo';
          return {
            mediaId: r.id,
            mediaType: r.media_type,
            thumbnailUrl: deriveListThumbnail(r),
            caption: r.caption,
            sourceFilename: r.source_filename,
            editHref: itemEditHref(r.id),
            tags: tagsByMediaId.get(r.id) ?? [],
            canBeCover,
            isCover: canBeCover && r.id === selectedCover,
          };
        });
        // A chosen cover past the listed items is still the gallery's cover;
        // it is read on its own so the form shows it and submits it back.
        let outsideList: GalleryCoverChoice['outsideList'] = null;
        if (currentItemsTruncated && selectedCover !== null
          && selectedCover === g.cover_media_id
          && !currentItems.some((i) => i.mediaId === selectedCover)) {
          const cover = listGalleryCovers([galleryId])[0];
          if (cover && cover.is_chosen === 1) {
            outsideList = {
              mediaId: cover.media_id,
              mediaType: 'photo',
              thumbnailUrl: storage.constructURL(cover.s3_key_thumb),
              caption: cover.caption,
              sourceFilename: cover.source_filename,
              editHref: itemEditHref(cover.media_id),
              tags: [],
              canBeCover: true,
              isCover: true,
            };
          }
        }
        const coverShown = outsideList !== null || currentItems.some((i) => i.isCover);
        const coverChoice: GalleryCoverChoice = {
          offered: outsideList !== null || currentItems.some((i) => i.canBeCover),
          // A stored cover that has left the gallery is not what the gallery
          // shows, so the form says so by checking the newest photo.
          useNewest: !coverShown,
          outsideList,
        };
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
          coverChoice,
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
      assertTier1Benefits(actorMemberId);

      // Validate, then recognise an unchanged save, then count, then act. The
      // links are only parsed here, not checked at the network, so an
      // unchanged save costs nothing outbound; the full check runs behind the
      // throttle below.
      const validated = await validateGalleryUpdates(updates, { checkLinks: false });

      const existing = media.getNamedGalleryById.get(galleryId) as
        | {
          id: string; owner_member_id: string; is_system: number; is_default: number;
          owner_slug: string; name: string; description: string;
          sort_order: GallerySortOrderValue; owner_display_name: string;
          cover_media_id: string | null;
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
          'A gallery must declare at least one criteria hashtag (otherwise it would render empty).',
        );
      }

      // The cover. Choosing it is the owner's own act, like the words: an
      // administrator moderating a member's gallery leaves it as the owner set
      // it. A newly chosen cover must be one of the photos the gallery will
      // show once saved. A stored choice carried through unchanged is not
      // re-checked: a cover that has since left the gallery is simply not
      // honoured on read, and refusing the save for it would block every other
      // edit until the member noticed.
      const coverMediaId = validated.coverMediaId === undefined
        ? existing.cover_media_id
        : validated.coverMediaId;
      if (coverMediaId !== existing.cover_media_id) {
        if (isModeration) {
          const m = "A member's gallery keeps the cover its owner chose.";
          throw new ValidationError(m, { fieldErrors: { coverMediaId: m } });
        }
        if (coverMediaId !== null && !isGalleryCoverCandidate(
          coverMediaId,
          validated.criteriaTags.map((t) => t.toLowerCase()),
          validated.excludeTags.map((t) => t.toLowerCase()),
        )) {
          const m = "Choose a cover from this gallery's own photos.";
          throw new ValidationError(m, { fieldErrors: { coverMediaId: m } });
        }
      }
      validated.coverMediaId = coverMediaId;

      // A save that changes nothing (the same edit submitted twice, or a form
      // saved untouched) is the outcome already holding: it reports success
      // and writes, records and counts nothing. Links are compared in order,
      // because their order is what the gallery shows.
      const storedLinks = media.listGalleryExternalLinks.all(galleryId) as Array<{ label: string; url: string }>;
      const sameLinkOrder = storedLinks.length === validated.externalLinks.length
        && storedLinks.every((l, i) =>
          comparableText(l.label, 'single_line') === comparableText(validated.externalLinks[i].label, 'single_line')
          && l.url === validated.externalLinks[i].url);
      if (sameLinkOrder && galleryChangesFor(galleryId, existing, validated).length === 0) {
        return;
      }

      throttleGalleryWrite(actorMemberId, actorIsAdmin);
      validated.externalLinks = (await validateGalleryUpdates(updates)).externalLinks;

      const now = new Date().toISOString();

      // The tag sets and the external links are rewritten delete-then-insert,
      // so their prior values have to be read before the rewrite runs or they
      // are gone by the time anything could record them. Only the moderation
      // door needs them, and only it pays for the reads.
      const changed = isModeration
        ? galleryChangesFor(galleryId, existing, validated)
        : [];

      let moderationAuditId = '';
      transaction(() => {
        media.updateMemberGalleryMetadata.run(
          validated.name,
          validated.description,
          validated.sortOrder,
          coverMediaId,
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
            moderationAuditId = appendAuditEntry({
              actionType:    'media.member_gallery_moderated',
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
            notifyGalleryOwnerOfModeration(
              existing.owner_member_id, existing.owner_display_name,
              existing.name, changed, moderationReason, moderationAuditId,
            );
          }
        } else {
          appendAuditEntry({
            actionType: existing.is_system === 1
              ? 'media.curated_gallery_updated'
              : 'media.member_gallery_updated',
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

      if (existing.is_system === 1) {
        // The save file names the cover by its source filename, the curated
        // item's stable key; its media id changes whenever its bytes do.
        const coverPhoto = coverMediaId === null
          ? undefined
          : (media.getMediaSourceFilename.get(coverMediaId) as { source_filename: string | null } | undefined)
            ?.source_filename ?? undefined;
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
          ...(coverPhoto ? { coverPhoto } : {}),
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

      assertTier1Benefits(actorMemberId);

      // Validate, then recognise a repeat, then count, then act. Validation
      // here leaves the links unchecked at the network (only parsed into the
      // form the full check stores), so recognising a repeat costs nothing
      // outbound and the full check runs only behind the throttle below.
      const local = await validateGalleryUpdates(updates, { checkLinks: false });

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
      // Member-owned galleries auto-include the owner's `#by_<slug>` so the
      // tag-AND query scopes to the owner's uploads. validateGalleryTag rejects
      // `#by_*` from caller input, so the prepended tag is the only `#by_*` in
      // the criteria set. FH-owned galleries are topic-defined: their criteria
      // are exactly what the author declares. `#curated` is not auto-added — a
      // curated collection lists `#curated` in its own criteria, and a topic
      // gallery omits it so it shows all matching content with `#curated` as
      // the opt-in filter. `validateGalleryTag` allows `#curated` in caller input.
      const scopeCriteria = (v: typeof local): typeof local => (isFhOwned ? v : {
        ...v,
        criteriaTags: [`${UPLOADER_TAG_PREFIX}${(ownerSlug as string).toLowerCase()}`, ...v.criteriaTags],
      });
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
        if (galleryNameMakesNoAddress(local.name)) {
          throw new ValidationError(GALLERY_NAME_NO_ADDRESS_MESSAGE, {
            fieldErrors: { name: GALLERY_NAME_NO_ADDRESS_MESSAGE },
          });
        }
        assertDoesNotClaimPersonalGallery(ownerSlug, local.name);
        galleryId = buildMemberGalleryId(ownerSlug, local.name, 0);
      }
      const submitted = scopeCriteria(local);

      if (submitted.criteriaTags.length === 0) {
        throw new ValidationError(
          'A gallery must declare at least one criteria hashtag (otherwise it would render empty).',
        );
      }

      // A member's repeated create is the gallery its first submit made, when
      // every field the form carries matches what that submit stored; one that
      // changed any of them is not a repeat. Recognised before the throttle, so
      // a repeat spends no slot, even the last one. Only a member creating
      // their own gallery can repeat one here: an administrator's creates, and
      // anything a member may not create, take the ordinary path and its
      // refusals. Matched again where the insert meets the name's uniqueness
      // below, because the two submits of a double click overlap.
      const canRepeat = !actorIsAdmin && ownerMemberId === actorMemberId;
      const findSameGallery = (v: typeof local): string | undefined => {
        const candidate = media.findMemberGalleryByOwnerAndName.get(ownerMemberId, v.name) as
          | { id: string; created_by: string; description: string; sort_order: string } | undefined;
        if (!candidate) return undefined;
        const stored = media.listGalleryTagSetsNormalized.all(candidate.id, candidate.id) as
          Array<{ kind: 'criteria' | 'exclude'; tag_normalized: string }>;
        const sameSet = (kind: 'criteria' | 'exclude', tags: string[]): boolean => {
          const have = stored.filter((r) => r.kind === kind).map((r) => r.tag_normalized).sort();
          const want = tags.map((t) => t.toLowerCase()).sort();
          return have.length === want.length && have.every((t, i) => t === want[i]);
        };
        const storedLinks = media.listGalleryExternalLinks.all(candidate.id) as
          Array<{ label: string; url: string }>;
        const sameLinks = storedLinks.length === v.externalLinks.length
          && storedLinks.every((l, i) => l.label === v.externalLinks[i].label && l.url === v.externalLinks[i].url);
        return candidate.created_by === actorMemberId
          && candidate.description === v.description
          && candidate.sort_order === v.sortOrder
          && sameLinks
          && sameSet('criteria', v.criteriaTags)
          && sameSet('exclude', v.excludeTags)
          ? candidate.id
          : undefined;
      };
      if (canRepeat) {
        const sameId = findSameGallery(submitted);
        if (sameId) return { id: sameId, repeat: true };
      }
      // A name the owner already holds can never be inserted, so it is refused
      // before the throttle and spends no slot: a share naming a gallery the
      // member already has must not be blocked by, or count toward, the limit.
      if (media.findMemberGalleryByOwnerAndName.get(ownerMemberId, local.name)) {
        throw new ConflictError(`A gallery named "${local.name}" already exists for this owner.`);
      }

      throttleGalleryWrite(actorMemberId, actorIsAdmin);
      const validated = scopeCriteria(await validateGalleryUpdates(updates));

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
          // A curator-supplied id is the curator's own choice, so its collision
          // is reported as the id rather than mistaken for a name clash.
          if (isIdCollision && isFhOwned) {
            throw new ConflictError(
              `A gallery with the id "${galleryId}" already exists. Choose a different Gallery ID.`,
            );
          }
          if (isUnique && msg.includes('member_galleries')) {
            const sameId = canRepeat ? findSameGallery(validated) : undefined;
            if (sameId) {
              refundPerActor('gallery-write', actorMemberId);
              return { id: sameId, repeat: true };
            }
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
    async deleteGallery(input: CuratorGalleryDeleteInput): Promise<'deleted' | 'own_repeat'> {
      const { actorMemberId, actorIsAdmin, galleryId } = input;
      assertTier1Benefits(actorMemberId);

      const existing = media.getNamedGalleryById.get(galleryId) as
        | { id: string; owner_member_id: string; is_system: number; is_default: number }
        | undefined;
      if (!existing) {
        // The row goes with the delete, so a repeated delete is traced to the
        // actor's own deletion row. Gallery ids are guessable, so anyone
        // else's gone gallery stays a plain not-found and leaks nothing.
        const ownDeletion = findOwnLatestAudit(actorMemberId, 'media.member_gallery_deleted', 'gallery', galleryId)
          ?? findOwnLatestAudit(actorMemberId, 'media.curated_gallery_deleted', 'gallery', galleryId);
        if (ownDeletion) return 'own_repeat';
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      authorizeGalleryActor(actorMemberId, actorIsAdmin, existing.owner_member_id);

      // The curator delete route reaches the curated galleries and nothing else.
      // The curated list never links a member-owned gallery, the administrator's
      // own included, so a posted id that names one is not a curated delete: it
      // simply does not resolve, the same answer the sibling curated-media delete
      // gives. An administrator deletes a gallery of their own through the member
      // route, which passes no administrator flag and keeps the owner checks.
      if (actorIsAdmin && existing.is_system !== 1) {
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

      // Counted once the delete is known to be a real one the actor may make,
      // so neither a repeat nor a refused attempt spends a slot.
      throttleGalleryWrite(actorMemberId, actorIsAdmin);

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
      return 'deleted';
    },


    // Lists every gallery owned by a given member, including item count and the
    // Personal Gallery. Drives the owner's own gallery-management list and the
    // gallery chips on the Share Media form, both owner-only surfaces, which is why
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

    // The thumbnail address of the photo that stands for each gallery: its
    // chosen cover while that is still one of its photos, otherwise its newest
    // photo. One statement for the whole list; a gallery with no photo is
    // absent from the map.
    listGalleryCoverThumbs(galleryIds: string[]): Map<string, string> {
      return runSqliteRead('listGalleryCoverThumbs', () => new Map(
        listGalleryCovers(galleryIds).map((c) => [c.gallery_id, storage.constructURL(c.s3_key_thumb)]),
      ));
    },

    // Member-attributed photo upload. Mirrors uploadPhoto but writes
    // uploader_member_id = memberId (not the system member) and uses
    // applyTagsForMember so #<slug> auto-applies. Synchronous from the
    // caller's perspective: image processing, S3 put, DB insert, and
    // Personal Gallery materialization all complete before return.
    async uploadPhotoForMember(input: MemberPhotoInput): Promise<MemberUploadResult> {
      // The same upload submitted twice carries the same file under the same
      // name, with the same caption, tags and link, which the first submit
      // already stored. Matched on the hash of the bytes and those fields
      // before anything is processed, stored or counted; a different photo
      // under that name, or the same one with any field changed, still meets
      // the rename message below.
      assertTier1Benefits(input.memberId);
      const sourceSha256 = createHash('sha256').update(input.photoBuffer).digest('hex');
      // Matched again where the write meets the file name's uniqueness below,
      // because two submits of one double click both pass this check while
      // the photo is processed and stored.
      const findSamePhoto = (): MemberUploadResult | undefined => {
        if (!input.sourceFilename) return undefined;
        const same = media.findActiveMemberPhotoByFilename.get(input.memberId, input.sourceFilename) as
          | { id: string; source_sha256: string | null; s3_key_display: string | null }
          | undefined;
        if (
          same && same.source_sha256 === sourceSha256 && same.s3_key_display
          && storedItemMatches(same.id, input.memberId, input.slug, input)
        ) {
          return { mediaId: same.id, displayUrl: storage.constructURL(same.s3_key_display), repeat: true };
        }
        return undefined;
      };
      const samePhoto = findSamePhoto();
      if (samePhoto) return samePhoto;
      if (!input.actorIsAdmin) {
        throttlePerActor(
          'member-photo-upload', input.memberId,
          'photo_upload_rate_limit_per_hour', 30,
          'Upload rate limit reached.',
        );
      }
      input = { ...input, caption: validateCaption(input.caption) };
      input = { ...input, tags: checkedTags(input.tags) };
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

      const maxPhotoBytes = photoMaxBytes(input.actorIsAdmin === true);
      if (input.photoBuffer.length > maxPhotoBytes) {
        throw new ValidationError(photoTooLargeMessage(maxPhotoBytes));
      }
      if (!detectImageType(input.photoBuffer)) {
        throw new ValidationError('Only JPEG and PNG photos are accepted.');
      }

      const processed = await rejectImageAsValidation(imageProcessor.processPhoto(input.photoBuffer));
      const shapeRefusal = photoShapeRefusal(processed.widthPx, processed.heightPx);
      if (shapeRefusal) throw new ValidationError(shapeRefusal);

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
            input.sourceFilename, RENDITION_IMAGE_MIME, sourceSha256,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId, input.memberId);
          }
          appliedTagIds = applyTagsForMember(mediaId, input.slug, input.tags, now);
          ensureDefaultPersonalGalleryTx(input.memberId, input.slug, now);
          appendAuditEntry({
            actionType: 'media.member_uploaded',
            actorType: 'member',
            actorMemberId: input.memberId,
            entityType: 'media_item',
            entityId: mediaId,
            // Counts, never the member's own typed tags, caption or file name:
            // the audit log outlives an erasure.
            metadata: { mediaType: 'photo', tagCount: input.tags.length },
          });
        });
      } catch (err) {
        await compensatingStorageDelete(storage, [thumbKey, displayKey]);
        const msg = (err as Error).message ?? '';
        if (msg.includes('UNIQUE') && msg.includes('source_filename')) {
          const twin = findSamePhoto();
          if (twin) {
            if (!input.actorIsAdmin) refundPerActor('member-photo-upload', input.memberId);
            return twin;
          }
          throw new ValidationError(fileNameTakenMessage(input.sourceFilename));
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
    // FH-curator sidecar fields (source, clip range) are not surfaced on
    // the member surface.
    getMemberMediaItem(mediaId: string, ownerMemberId: string): MemberMediaItem | null {
      return readMemberMediaItem(mediaId, ownerMemberId);
    },

    /**
     * The edit form's starting values for one of the member's own items, or
     * null when they do not own it. The auto-applied `#by_<slug>` uploader
     * marker is left out of the editable tags: the member did not type it, the
     * save re-adds it, and showing it lets them delete it by accident, after
     * which tag validation would refuse a hand-typed `#by_*` re-add.
     */
    getMemberMediaEditFormValues(
      mediaId: string,
      ownerMemberId: string,
      ownerSlug: string,
    ): MemberMediaEditFormValues | null {
      const item = readMemberMediaItem(mediaId, ownerMemberId);
      if (!item) return null;
      const uploaderTag = `${UPLOADER_TAG_PREFIX}${ownerSlug.toLowerCase()}`;
      return {
        caption: item.caption ?? '',
        tags: item.tags.filter((t) => t.toLowerCase() !== uploaderTag).join(' '),
        externalUrl: item.externalUrl ?? '',
      };
    },

    // Confirm step before a member deletes one of their own items. The delete
    // is permanent, so the page names what goes before the member commits.
    // Null for an item the member does not own and for an avatar, which the
    // delete itself refuses, so the confirm page never offers a delete that
    // would then 404.
    getMemberMediaDeleteConfirmPage(
      memberKey: string,
      mediaId: string,
      ownerMemberId: string,
      ownerSlug: string,
    ): PageViewModel<MemberMediaDeleteConfirmContent> | null {
      const row = runSqliteRead('getMemberMediaItemById', () =>
        media.getMemberMediaItemById.get(mediaId, ownerMemberId),
      ) as MediaItemRow | undefined;
      if (!row || row.is_avatar === 1) return null;
      // The uploader marker is applied by the platform, not chosen by the
      // member, so it is not listed among the tags they are about to lose.
      const uploaderTag = `#by_${ownerSlug.toLowerCase()}`;
      const tags = queryCuratorMediaTags([mediaId])
        .map((p) => p.tag_display)
        .filter((t) => t.toLowerCase() !== uploaderTag);
      const itemHref = `/members/${memberKey}/media/${mediaId}`;
      return {
        seo: { title: 'Delete Media Item' },
        page: { sectionKey: 'members', pageKey: 'member_media_delete_confirm', title: 'Delete Media Item' },
        content: {
          summary: [
            { label: 'Type', value: row.media_type === 'video' ? 'Video' : 'Photo' },
            { label: 'Caption', value: row.caption && row.caption.trim() !== '' ? row.caption : 'No caption' },
            { label: 'Tags', value: tags.length > 0 ? tags.join(' ') : 'No tags' },
          ],
          deleteHref: `${itemHref}/delete`,
          cancelHref: `${itemHref}/edit`,
        },
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
        input = { ...input, caption: validateCaption(input.caption) };
      }
      if (input.tags !== undefined) {
        input = { ...input, tags: checkedTags(withPlayerCredits(input.tags, input.addPlayer)) };
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
          actorType: 'member',
          actorMemberId: input.memberId,
          entityType: 'media_item',
          entityId: input.mediaId,
          // Which fields changed, never their values: these are the member's
          // own words and links, and the audit log outlives an erasure.
          metadata: {
            fields: [
              ...(input.caption !== undefined ? ['caption'] : []),
              ...(dedupedTags !== undefined ? ['tags'] : []),
              ...(normalizedExternalUrlEdit !== undefined ? ['externalUrl'] : []),
            ],
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
    }): Promise<{ mediaId: string; repeat?: true }> {
      assertTier1Benefits(input.memberId);
      const row = runSqliteRead('getMemberMediaItemById', () =>
        media.getMemberMediaItemById.get(input.mediaId, input.memberId),
      ) as MediaItemRow | undefined;
      if (!row) {
        // The row goes with the delete, so a repeated delete is traced to the
        // member's own deletion row; any other missing item stays not found.
        if (findOwnLatestAudit(input.memberId, 'media.member_deleted', 'media_item', input.mediaId)) {
          return { mediaId: input.mediaId, repeat: true };
        }
        throw new NotFoundError(`Member media not found: ${input.mediaId}`);
      }
      if (row.is_avatar === 1) {
        throw new NotFoundError(`Member media not found: ${input.mediaId}`);
      }
      // Counted once the delete is known to be a real one, so neither a repeat
      // nor a refused attempt spends a slot.
      if (!input.actorIsAdmin) {
        throttlePerActor(
          'media-edit', input.memberId,
          'media_edit_rate_limit_per_hour', 15,
          'Too many media changes.',
        );
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
          actorType: 'member',
          actorMemberId: input.memberId,
          entityType: 'media_item',
          entityId: input.mediaId,
          metadata: {
            mediaType: row.media_type,
            videoPlatform: row.video_platform,
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
    /**
     * Whether a member's video link plays at its platform, asked before a
     * Share Media submit writes anything, so a dead link refuses the whole
     * submit rather than leaving a gallery behind it. Null when it plays; the
     * refusal sentence otherwise. The submit itself asks again, because the
     * answer can change between the two.
     */
    async checkMemberVideoLink(videoUrl: string, videoPlatform: VideoPlatform): Promise<string | null> {
      const verify = await videoUrlVerifier(videoUrl, videoPlatform);
      return verify.ok ? null : `Video is not available at the platform (oEmbed status ${verify.status}).`;
    },

    async submitVideoForMember(input: MemberVideoInput): Promise<MemberUploadResult> {
      assertTier1Benefits(input.memberId);
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

      // The same video submitted twice is the item the first submit made:
      // matched on the platform's own video id, caption, tags and link before
      // the platform is asked again or a slot is counted. The same video with
      // a field changed is submitted as a new item.
      // Matched again inside the write's transaction below, because two submits
      // of one double click both pass this check while the platform is asked.
      const findSameVideo = () => {
        const same = media.findActiveMemberVideo.get(input.memberId, input.videoPlatform, videoId) as
          | { id: string; thumbnail_url: string | null }
          | undefined;
        return same && storedItemMatches(same.id, input.memberId, input.slug, input) ? same : undefined;
      };
      const repeatResult = (same: { id: string; thumbnail_url: string | null }): MemberUploadResult => ({
        mediaId: same.id,
        displayUrl: input.videoPlatform === 'youtube'
          ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          : (same.thumbnail_url ?? ''),
        repeat: true,
      });
      const same = findSameVideo();
      if (same) return repeatResult(same);

      if (!input.actorIsAdmin) {
        throttlePerActor(
          'member-video-submit', input.memberId,
          'video_submission_rate_limit_per_hour', 5,
          'Submission rate limit reached.',
        );
      }
      input = { ...input, caption: validateCaption(input.caption) };
      input = { ...input, tags: checkedTags(input.tags) };
      const normalizedExternalUrl = await normalizeExternalUrlOrThrow(input.externalUrl);

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
      let twin: { id: string; thumbnail_url: string | null } | undefined;
      transaction(() => {
        twin = findSameVideo();
        if (twin) return;
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
          actorType: 'member',
          actorMemberId: input.memberId,
          entityType: 'media_item',
          entityId: mediaId,
          metadata: { mediaType: 'video', videoPlatform: input.videoPlatform, tagCount: input.tags.length },
        });
      });
      if (twin) {
        if (!input.actorIsAdmin) refundPerActor('member-video-submit', input.memberId);
        return repeatResult(twin);
      }
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
  // `checkLinks: false` leaves each link unchecked at the network and only
  // parses it into the form the full check stores, for comparing a submission
  // with what is stored before any throttle has been passed.
  async function validateGalleryUpdates(
    updates: CuratorGalleryUpdates,
    opts: { checkLinks?: boolean } = {},
  ): Promise<{
    name: string;
    description: string;
    sortOrder: GallerySortOrderValue;
    criteriaTags: string[];
    excludeTags: string[];
    externalLinks: Array<{ label: string; url: string }>;
    coverMediaId: string | null | undefined;
  }> {
    const name = cleanUserText(updates.name, 'single_line', 'name');
    if (!name) {
      const m = 'Gallery name is required.';
      throw new ValidationError(m, { fieldErrors: { name: m } });
    }
    if (name.length > GALLERY_NAME_MAX_LEN) {
      const m = `Gallery name must be ${GALLERY_NAME_MAX_LEN} characters or fewer.`;
      throw new ValidationError(m, { fieldErrors: { name: m } });
    }
    // Cleaning also collapses line endings before anything compares this
    // against what is stored: a browser sends a textarea's line breaks as CRLF
    // whatever value it was given, and the column holds LF, so a description
    // posted back with no edit would otherwise read as a change nobody made.
    const description = cleanUserText(updates.description ?? '', 'multi_line', 'description');
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
    // Both sets are folded by the one rule and held to the tag rules first, so a
    // set reaching here by any path is stored the same way as a typed one.
    const criteriaTags = foldTypedHashtags(...updates.criteriaTags).map((t) => t.stored);
    assertTypedTags(criteriaTags, { field: 'criteriaTags' });
    const excludeTags = foldTypedHashtags(...updates.excludeTags).map((t) => t.stored);
    assertTypedTags(excludeTags, { field: 'excludeTags' });
    const seenCriteria = new Set<string>();
    for (const tag of criteriaTags) {
      try {
        validateGalleryTag(tag, 'criteria');
      } catch (err) {
        const m = (err as Error).message;
        throw new ValidationError(m, { fieldErrors: { criteriaTags: m } });
      }
      const norm = tag.toLowerCase();
      if (seenCriteria.has(norm)) {
        const m = `Duplicate criteria hashtag: ${tag}`;
        throw new ValidationError(m, { fieldErrors: { criteriaTags: m } });
      }
      seenCriteria.add(norm);
    }
    const seenExclude = new Set<string>();
    for (const tag of excludeTags) {
      try {
        validateGalleryTag(tag, 'exclude');
      } catch (err) {
        const m = (err as Error).message;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      const norm = tag.toLowerCase();
      if (seenExclude.has(norm)) {
        const m = `Duplicate exclude hashtag: ${tag}`;
        throw new ValidationError(m, { fieldErrors: { excludeTags: m } });
      }
      if (seenCriteria.has(norm)) {
        const m = `Hashtag "${tag}" cannot be both a criteria hashtag and an exclude hashtag.`;
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
      const label = cleanUserText(link.label ?? '', 'single_line', `externalLinks[${i}].label`);
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
      if (opts.checkLinks === false) {
        let parsed = rawUrl;
        try { parsed = new URL(rawUrl).toString(); } catch { /* left as typed; the full check refuses it */ }
        validatedLinks.push({ label, url: parsed });
        continue;
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

    // The cover's shape only: whether it is one of this gallery's photos
    // depends on the gallery's final hashtags, so updateGallery checks that
    // once the owner's uploader tag has been added. An empty choice is "use the
    // newest photo"; an absent one keeps what is stored.
    const rawCover = updates.coverMediaId;
    const coverMediaId = rawCover === undefined
      ? undefined
      : (String(rawCover ?? '').trim() || null);

    return {
      name,
      description,
      sortOrder,
      criteriaTags,
      excludeTags,
      externalLinks: validatedLinks,
      coverMediaId,
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
  const reason = cleanUserText(raw ?? '', 'single_line', 'reason');
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
  existing: {
    name: string; description: string; sort_order: GallerySortOrderValue;
    cover_media_id: string | null;
  },
  validated: {
    name: string; description: string; sortOrder: GallerySortOrderValue;
    criteriaTags: string[]; excludeTags: string[];
    externalLinks: Array<{ label: string; url: string }>;
    coverMediaId?: string | null;
  },
): GalleryFieldChange[] {
  const priorCriteria = (media.listFhNamedGalleryTags.all(galleryId) as Array<{ tag_display: string }>)
    .map((t) => t.tag_display);
  const priorExcludes = (media.listFhNamedGalleryExcludeTags.all(galleryId) as Array<{ tag_display: string }>)
    .map((t) => t.tag_display);
  const priorLinkRows = media.listGalleryExternalLinks.all(galleryId) as Array<{ label: string; url: string }>;

  const sorted = (values: string[]): string[] => [...values].sort();
  const linkText = (links: Array<{ label: string; url: string }>): string[] =>
    links.map((l) => `${l.label} ${l.url}`);
  const comparableLinks = (links: Array<{ label: string; url: string }>): string[] =>
    sorted(links.map((l) => `${comparableText(l.label, 'single_line')} ${l.url}`));

  // Text is compared with both sides cleaned but recorded as it actually was:
  // the stored value may predate cleaning, and a moderation that keeps the
  // owner's words carries the stored value through unchanged, so neither is a
  // change anybody made.
  const changed: GalleryFieldChange[] = [];
  const note = (
    field: string, before: unknown, after: unknown,
    same = JSON.stringify(before) === JSON.stringify(after),
  ): void => {
    if (!same) changed.push({ field, before, after });
  };
  note('name', existing.name, validated.name,
    comparableText(existing.name, 'single_line') === comparableText(validated.name, 'single_line'));
  note('description', existing.description, validated.description,
    comparableText(existing.description, 'multi_line') === comparableText(validated.description, 'multi_line'));
  note('sortOrder', existing.sort_order, validated.sortOrder);
  note('criteriaTags', sorted(priorCriteria), sorted(validated.criteriaTags));
  note('excludeTags', sorted(priorExcludes), sorted(validated.excludeTags));
  note('externalLinks', sorted(linkText(priorLinkRows)), sorted(linkText(validated.externalLinks)),
    JSON.stringify(comparableLinks(priorLinkRows)) === JSON.stringify(comparableLinks(validated.externalLinks)));
  // An absent cover is the stored one carried through, never a change.
  note('coverMediaId', existing.cover_media_id,
    validated.coverMediaId === undefined ? existing.cover_media_id : validated.coverMediaId);
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
 * whose record it is, and this is one. Queued inside the act's transaction,
 * so a rolled-back change cannot announce itself, and keyed on the act's own
 * audit row, so a second act on the same gallery is a second message.
 */
function notifyGalleryOwnerOfModeration(
  ownerMemberId: string,
  ownerDisplayName: string,
  galleryName: string,
  changed: GalleryFieldChange[],
  reason: string,
  moderationAuditId: string,
): void {
  emailService.sendActNotice({
    template: 'gallery_moderated_member',
    params: {
      memberName:  ownerDisplayName,
      galleryName,
      whatChanged: describeGalleryChanges(changed),
      note:        reason,
    },
    memberId: ownerMemberId,
    actId:    moderationAuditId,
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

/**
 * What a gallery edit form's save came to. A save lands on the gallery's own
 * page; a refusal carries the status it answers with and the sentence the form
 * shows.
 */
export type GallerySaveResult =
  | { status: 'saved'; landingHref: string }
  | { status: 'not_found' }
  | {
      status: 'refused';
      httpStatus: 422 | 429;
      message: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };

function refused(
  httpStatus: 422 | 429,
  message: string,
  extra: { fieldErrors?: Record<string, string>; retryAfterSeconds?: number } = {},
): Extract<GallerySaveResult, { status: 'refused' }> {
  return {
    status: 'refused',
    httpStatus,
    message,
    ...(extra.fieldErrors ? { fieldErrors: extra.fieldErrors } : {}),
    ...(extra.retryAfterSeconds ? { retryAfterSeconds: extra.retryAfterSeconds } : {}),
  };
}

/**
 * A member saving one of their own galleries from its edit form. Ownership is
 * checked before anything else, so a request aimed at another member's gallery
 * is answered not-found whatever it carries, exactly as the edit page itself
 * is. A save lands on the gallery's page.
 */
export async function updateMemberGallery(
  svc: CuratorMediaService,
  input: {
    actorMemberId: string;
    actorIsAdmin: boolean;
    galleryId: string;
    updates: CuratorGalleryUpdates;
  },
): Promise<GallerySaveResult> {
  try {
    svc.getGalleryForEdit(input.galleryId, input.actorMemberId);
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'not_found' };
    throw err;
  }

  try {
    await svc.updateGallery({
      actorMemberId: input.actorMemberId,
      actorIsAdmin: input.actorIsAdmin,
      galleryId: input.galleryId,
      updates: input.updates,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'not_found' };
    if (err instanceof ValidationError) return refused(422, err.message, { fieldErrors: err.fieldErrors });
    if (err instanceof RateLimitedError) return refused(429, err.message, { retryAfterSeconds: err.retryAfterSeconds });
    throw err;
  }
  return { status: 'saved', landingHref: `/media/${input.galleryId}` };
}

/**
 * An administrator saving a gallery from the curator edit form. Content is
 * added to a gallery by sharing it with the gallery's hashtags, never from this
 * form. A save lands on the gallery's page.
 */
export async function updateCuratorGallery(
  svc: CuratorMediaService,
  input: {
    actorMemberId: string;
    galleryId: string;
    updates: CuratorGalleryUpdates;
    reason: string;
    moderation: { clearName: boolean; clearDescription: boolean };
  },
): Promise<GallerySaveResult> {
  try {
    await svc.updateGallery({
      actorMemberId: input.actorMemberId,
      actorIsAdmin: true,
      galleryId: input.galleryId,
      updates: input.updates,
      reason: input.reason,
      moderation: input.moderation,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'not_found' };
    if (err instanceof ValidationError) return refused(422, err.message, { fieldErrors: err.fieldErrors });
    throw err;
  }
  return { status: 'saved', landingHref: `/media/${input.galleryId}` };
}

// The form's two category controls, an existing category or a new name, are
// mutually exclusive; the name must be one the authoring tree accepts.
function resolveCuratorCategory(
  fields: Record<string, string>,
): { category: string } | { errorMessage: string } {
  const existingCategory = (fields.category ?? '').trim();
  const newCategory = (fields.newCategory ?? '').trim();
  if (existingCategory.length > 0 && newCategory.length > 0) {
    return { errorMessage: 'Tick an existing category OR type a new category name, not both.' };
  }
  if (existingCategory.length === 0 && newCategory.length === 0) {
    return { errorMessage: 'Tick a category or type a new category name.' };
  }
  const category = existingCategory.length > 0 ? existingCategory : newCategory;
  if (!isValidCategoryName(category)) {
    return { errorMessage: 'Category name must be lowercase letters, digits, or underscores.' };
  }
  return { category };
}

/**
 * Where a member lands after saving one of their items: the item inside their
 * Personal Gallery, or its own page when that gallery does not show it.
 */
export function memberItemLandingHref(memberId: string, mediaId: string): string {
  const personal = media.findMemberGalleryByOwnerAndName.get(memberId, PERSONAL_GALLERY_NAME) as
    | { id: string }
    | undefined;
  return shareLandingHref(personal?.id ?? null, mediaId);
}

/** What a new member gallery will be, shown before it is saved. */
export interface NewGalleryPreview {
  galleryId: string;
  /** Every hashtag the gallery saves, the owner's `#by_` first. */
  tags: string[];
  /** True when no hashtag was typed, so the hashtag made from the name is used. */
  defaultTagUsed: boolean;
}

export type NewGalleryPreviewResult = NewGalleryPreview | { refusal: string; field: 'galleryName' | 'gallerySlug' };

/**
 * The hashtags a gallery named on a Share Media form saves besides the
 * automatic one: those typed, or, with none typed, the hashtag made from its
 * name by the slug rule (the author's capitals kept), refused when the site
 * reserves it. One home for the member's and the curator's previews.
 */
function galleryTagsFromTypedOrName(
  name: string,
  typedTags: string[],
): { tags: string[]; defaultTagUsed: boolean } | { refusal: string } {
  if (typedTags.length > 0) return { tags: typedTags, defaultTagUsed: false };
  const made = typedTagForDisplay(name);
  const lowered = made.toLowerCase();
  if (made === '' || lowered === CURATED_TAG || lowered.startsWith(UPLOADER_TAG_PREFIX) || tagRuleRefusal(made)) {
    return {
      refusal: `The hashtag made from this name, ${made || `#${name}`}, is reserved for the site. Add your own hashtags above, or choose another name.`,
    };
  }
  return { tags: [made], defaultTagUsed: true };
}

/**
 * The address and hashtags a gallery named on the Share Media form will be
 * saved with. The Share page's preview data and the save both come from here,
 * so what the member was shown and what is saved cannot disagree.
 *
 * The gallery saves exactly the typed hashtags plus the owner's `#by_`; with
 * none typed it saves the hashtag made from its name by the slug rule, the
 * author's capitals kept. Its id takes the next free `_2`, `_3` suffix when
 * `isTaken` says the plain one is held.
 */
export function previewNewMemberGallery(
  ownerSlug: string,
  name: string,
  typedTags: string[],
  isTaken: (galleryId: string) => boolean,
): NewGalleryPreviewResult {
  const trimmed = name.trim();
  const refuse = (refusal: string): NewGalleryPreviewResult => ({ refusal, field: 'galleryName' });
  if (trimmed.length > GALLERY_NAME_MAX_LEN) {
    return refuse(`A gallery name can be at most ${GALLERY_NAME_MAX_LEN} characters.`);
  }
  if (galleryNameMakesNoAddress(trimmed)) return refuse(GALLERY_NAME_NO_ADDRESS_MESSAGE);
  if (buildMemberGalleryId(ownerSlug, trimmed, 0) === buildMemberGalleryId(ownerSlug, PERSONAL_GALLERY_NAME, 0)) {
    return refuse(
      `That name is reserved for your ${PERSONAL_GALLERY_NAME}, the one created for you that collects everything you upload. Choose another name.`,
    );
  }

  const chosen = galleryTagsFromTypedOrName(trimmed, typedTags);
  if ('refusal' in chosen) return refuse(chosen.refusal);
  const { tags, defaultTagUsed } = chosen;

  let attempt = 0;
  let galleryId = buildMemberGalleryId(ownerSlug, trimmed, attempt);
  while (isTaken(galleryId) && attempt < 100) {
    attempt += 1;
    galleryId = buildMemberGalleryId(ownerSlug, trimmed, attempt);
  }
  return { galleryId, tags: [`${UPLOADER_TAG_PREFIX}${ownerSlug}`, ...tags], defaultTagUsed };
}

/**
 * The preview as one string, the form the Share page's script records in the
 * hidden `galleryPreview` field: the id, then the hashtags, space separated.
 * A submit whose recorded preview differs from the one computed now is shown
 * the preview again before anything is saved.
 */
export function newGalleryPreviewToken(preview: NewGalleryPreview): string {
  return [preview.galleryId, ...preview.tags].join(' ');
}

/** One photo of a Share Media submit, as the multipart reader delivered it. */
export interface SharedPhotoFile {
  filename: string;
  buffer: Buffer;
  caption: string;
}

/**
 * The refusal for photos past the photos-per-submit count or the total per
 * submit, or null. One home for the member's and the curator's share. The
 * reader takes one part past the count, so more photos than allowed shows as
 * one too many here.
 */
function sharePhotoLimitRefusal(photos: SharedPhotoFile[]): string | null {
  const limits = shareUploadLimits(true);
  if (photos.length > limits.maxFiles) return `Choose at most ${limits.maxFiles} photos at a time.`;
  const totalBytes = photos.reduce((n, p) => n + p.buffer.length, 0);
  if (totalBytes > photoMaxSubmitBytes()) {
    return `Those photos come to more than ${limits.totalMb} MB together. Share them in smaller groups.`;
  }
  return null;
}

/**
 * A submit's photos split into those within the size per photo and those
 * refused, each refused one named while the rest go on. The reader drops a
 * part past the size per photo without its name, which `limitExceeded` says.
 */
function splitSharedPhotos(
  photos: SharedPhotoFile[],
  limitExceeded: boolean,
  maxPhotoBytes: number,
): { goodPhotos: SharedPhotoFile[]; rejected: { filename: string; reason: string }[] } {
  const rejected: { filename: string; reason: string }[] = [];
  const goodPhotos: SharedPhotoFile[] = [];
  if (limitExceeded) rejected.push({ filename: '', reason: photoTooLargeMessage(maxPhotoBytes) });
  for (const photo of photos) {
    if (photo.buffer.length > maxPhotoBytes) {
      rejected.push({ filename: photo.filename, reason: photoTooLargeMessage(maxPhotoBytes) });
      continue;
    }
    goodPhotos.push(photo);
  }
  return { goodPhotos, rejected };
}

export interface ShareMemberMediaInput {
  memberId: string;
  actorIsAdmin: boolean;
  slug: string;
  mediaType: string | undefined;
  photos: SharedPhotoFile[];
  videoUrl: string;
  videoCaption: string;
  tags: string;
  externalUrl: string;
  galleryName: string;
  galleryPreview: string;
  /** Some photo crossed the size per photo and the reader dropped it. */
  limitExceeded: boolean;
}

export interface SharedGallery {
  id: string;
  name: string;
  tags: string[];
  /** False when the member already had this gallery, named with these hashtags. */
  created: boolean;
}

export type ShareMemberMediaResult =
  | {
      status: 'shared';
      landingHref: string;
      mediaIds: string[];
      rejected: { filename: string; reason: string }[];
      gallery: SharedGallery | null;
      folded: FoldedTypedTag[];
    }
  | { status: 'gallery_saved'; landingHref: string; gallery: SharedGallery; folded: FoldedTypedTag[] }
  | { status: 'confirm_gallery'; preview: NewGalleryPreview }
  | {
      status: 'refused';
      httpStatus: 422 | 429;
      message: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };

type FoldedTypedTag = { typed: string; stored: string };

export const SHARE_CHOOSE_AGAIN = 'Choose your photos again: a browser does not keep them after a refused form.';

function sameTagSet(a: string[], b: string[]): boolean {
  const x = a.map((t) => t.toLowerCase()).sort();
  const y = b.map((t) => t.toLowerCase()).sort();
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

/**
 * The page a share or a save lands on: the item inside the gallery it was
 * shared toward, when that gallery shows it, else the item's own page. A
 * gallery's item page answers only for an item in the set the gallery renders
 * (its criteria and excluded hashtags, in its order, up to its cap), so that
 * same set is read here; an item outside it would land on a page not found.
 */
function shareLandingHref(galleryId: string | null, mediaId: string): string {
  if (galleryId) {
    const gallery = media.getNamedGalleryById.get(galleryId) as { sort_order: GallerySortOrder } | undefined;
    if (gallery) {
      const tagIds = (media.listFhNamedGalleryTags.all(galleryId) as Array<{ id: string }>).map((t) => t.id);
      const excludeTagIds = (media.listFhNamedGalleryExcludeTags.all(galleryId) as Array<{ id: string }>).map((t) => t.id);
      const shown = queryGalleryItemsByCriteriaGrouped(tagIds, gallery.sort_order, excludeTagIds, GALLERY_ITEMS_QUERY_CAP);
      if (shown.some((row) => row.id === mediaId)) return `/media/${galleryId}/${mediaId}`;
    }
  }
  return `/media/item/${mediaId}`;
}

/**
 * A member's Share Media submit: photos or one video link, carrying one set of
 * hashtags, and optionally a gallery named from those hashtags.
 *
 * Order: every local check first, writing nothing (hashtags, the gallery name,
 * each photo's size and type, the submit's count and total); a named gallery
 * whose recorded preview is missing or stale returns the preview to confirm;
 * a video link is asked of its platform; then the gallery is created through
 * `createGallery`, so it stands even if every photo is then refused; then each
 * photo is shared on its own, a refused one named in `rejected` while the rest
 * go on. Rate limits, repeats and compensation are those of the methods it
 * calls.
 */
export async function shareMemberMedia(
  svc: CuratorMediaService,
  input: ShareMemberMediaInput,
): Promise<ShareMemberMediaResult> {
  const isPhoto = input.mediaType !== 'video';
  const refuse = (message: string, field?: string, httpStatus: 422 | 429 = 422): ShareMemberMediaResult => ({
    status: 'refused',
    httpStatus,
    message: isPhoto && input.photos.length > 0 ? `${message} ${SHARE_CHOOSE_AGAIN}` : message,
    ...(field ? { fieldErrors: { [field]: message } } : {}),
  });

  // 1. Local checks, writing nothing.
  let tags: string[];
  try {
    tags = checkedTags(parseTagList(input.tags));
  } catch (err) {
    if (err instanceof ValidationError) return refuse(err.message, 'tags');
    throw err;
  }
  const folded = changedTypedTags(input.tags);
  const externalUrlRaw = input.externalUrl.trim();
  const externalUrl = externalUrlRaw.length === 0 ? null : externalUrlRaw;

  let videoPlatform: VideoPlatform | null = null;
  const videoUrl = input.videoUrl.trim();
  if (!isPhoto && videoUrl.length > 0) {
    videoPlatform = parseYouTubeVideoId(videoUrl) ? 'youtube' : parseVimeoVideoId(videoUrl) ? 'vimeo' : null;
    if (!videoPlatform || !/^https?:\/\//.test(videoUrl)) return refuse('Paste a YouTube or Vimeo link.', 'videoUrl');
  }

  const overLimit = isPhoto ? sharePhotoLimitRefusal(input.photos) : null;
  if (overLimit) return refuse(overLimit, 'photoFiles');

  const galleryName = input.galleryName.trim();
  const ownGalleries = galleryName ? svc.listGalleriesForOwner(input.memberId) : [];
  let preview: NewGalleryPreview | null = null;
  let heldGallery: CuratorGallerySummary | null = null;
  if (galleryName) {
    const p = previewNewMemberGallery(input.slug, galleryName, tags, (id) => media.getNamedGalleryById.get(id) !== undefined);
    if ('refusal' in p) return refuse(p.refusal, p.field);
    preview = p;
    const sameName = ownGalleries.find((g) => g.name === galleryName);
    if (sameName) {
      if (!sameTagSet(sameName.criteriaTags, preview.tags)) {
        const theirs = sameName.criteriaTags.join(' ');
        return refuse(
          `You already have a gallery named "${galleryName}", with the hashtags ${theirs}. Choose another name, or use that gallery's hashtags.`,
          'galleryName',
        );
      }
      heldGallery = sameName;
    }
  }

  // A photo dropped for its size was still chosen, and is named as refused.
  const hasMedia = isPhoto
    ? input.photos.length > 0 || input.limitExceeded
    : videoUrl.length > 0;
  if (!hasMedia && !galleryName) {
    return refuse(isPhoto ? 'Choose at least one photo, or name a gallery.' : 'Paste a YouTube or Vimeo link.', isPhoto ? 'photoFiles' : 'videoUrl');
  }

  const { rejected, goodPhotos } = isPhoto
    ? splitSharedPhotos(input.photos, input.limitExceeded, photoMaxBytes(input.actorIsAdmin))
    : { rejected: [], goodPhotos: [] };

  // 2. A named gallery's address and hashtags are shown before they are saved.
  if (preview && !heldGallery && input.galleryPreview.trim() !== newGalleryPreviewToken(preview)) {
    return { status: 'confirm_gallery', preview };
  }

  // 3. A video link is asked of its platform before anything is written. Only
  // a named gallery is written before the video, so only then is it asked
  // here; otherwise the submit asks it itself, after recognising a repeat.
  if (videoPlatform && preview) {
    const deadLink = await svc.checkMemberVideoLink(videoUrl, videoPlatform);
    if (deadLink) return refuse(deadLink, 'videoUrl');
  }

  // 4. The gallery, through the one create path.
  // A gallery the member already has under this name and with these hashtags
  // goes through the same create, which writes nothing for it: unchanged, it
  // answers as a repeat; changed since (its description, order or links), it
  // refuses the name. Either way the gallery already held, and is reported
  // as held, unless the whole submit is the member's own sent twice (every
  // item it shares a repeat too, or no item at all): that reports the first
  // submit's result, the gallery saved.
  let gallery: SharedGallery | null = null;
  let galleryRepeat = false;
  let landingGalleryId: string | null = null;
  if (preview) {
    try {
      const made = await svc.createGallery({
        actorMemberId: input.memberId,
        actorIsAdmin: false,
        ownerMemberId: input.memberId,
        ownerSlug: input.slug,
        updates: {
          name: galleryName,
          description: '',
          sortOrder: 'upload_desc',
          criteriaTags: preview.tags.slice(1),
          excludeTags: [],
        },
      });
      galleryRepeat = made.repeat === true;
      gallery = { id: made.id, name: galleryName, tags: preview.tags, created: true };
      landingGalleryId = made.id;
    } catch (err) {
      if (err instanceof ConflictError && heldGallery) {
        gallery = { id: heldGallery.id, name: heldGallery.name, tags: heldGallery.criteriaTags, created: false };
        landingGalleryId = heldGallery.id;
      } else if (err instanceof ValidationError) {
        return refuse(err.message, 'galleryName');
      } else if (err instanceof ConflictError) {
        return refuse(err.message, 'galleryName');
      } else if (err instanceof RateLimitedError) {
        return { ...(refuse(err.message, undefined, 429) as Extract<ShareMemberMediaResult, { status: 'refused' }>), retryAfterSeconds: err.retryAfterSeconds };
      } else {
        throw err;
      }
    }
  }
  // Shared items carry the typed hashtags, or the one made from the name.
  const itemTags = preview?.defaultTagUsed ? preview.tags.slice(1) : tags;

  if (!hasMedia) {
    const g = gallery as SharedGallery;
    return { status: 'gallery_saved', landingHref: `/media/${g.id}`, gallery: g, folded };
  }

  // 5 and 6. Each photo on its own, or the one video.
  const mediaIds: string[] = [];
  // False once any item is newly shared, so the submit is not a repeat.
  let everyItemRepeat = true;
  if (isPhoto) {
    for (let i = 0; i < goodPhotos.length; i += 1) {
      const photo = goodPhotos[i];
      const captionRaw = photo.caption.trim();
      try {
        const result = await svc.uploadPhotoForMember({
          memberId: input.memberId,
          actorIsAdmin: input.actorIsAdmin,
          slug: input.slug,
          photoBuffer: photo.buffer,
          sourceFilename: photo.filename,
          caption: captionRaw.length === 0 ? null : captionRaw,
          tags: itemTags,
          ...(externalUrl !== null && { externalUrl }),
        });
        mediaIds.push(result.mediaId);
        if (!result.repeat) everyItemRepeat = false;
      } catch (err) {
        everyItemRepeat = false;
        if (err instanceof RateLimitedError) {
          const perHour = readIntConfig('photo_upload_rate_limit_per_hour', 30);
          const minutes = Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60));
          const reason = `You can share ${perHour} photos an hour. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
          for (const rest of goodPhotos.slice(i)) rejected.push({ filename: rest.filename, reason });
          if (mediaIds.length === 0 && !gallery) {
            // Every photo refused, as the all-refused form below reports it,
            // with the wait the limit sets.
            const reasons = rejected.map((r) => (r.filename ? `${r.filename}: ${r.reason}` : r.reason)).join(' ');
            return {
              ...(refuse(`Not shared: ${reasons}`, 'photoFiles', 429) as Extract<ShareMemberMediaResult, { status: 'refused' }>),
              retryAfterSeconds: err.retryAfterSeconds,
            };
          }
          break;
        }
        if (err instanceof ValidationError) {
          rejected.push({ filename: photo.filename, reason: err.message });
          continue;
        }
        throw err;
      }
    }
  } else {
    const captionRaw = input.videoCaption.trim();
    try {
      const result = await svc.submitVideoForMember({
        memberId: input.memberId,
        actorIsAdmin: input.actorIsAdmin,
        slug: input.slug,
        videoUrl,
        videoPlatform: videoPlatform as VideoPlatform,
        caption: captionRaw.length === 0 ? null : captionRaw,
        tags: itemTags,
        ...(externalUrl !== null && { externalUrl }),
      });
      mediaIds.push(result.mediaId);
      if (!result.repeat) everyItemRepeat = false;
    } catch (err) {
      everyItemRepeat = false;
      if (!gallery && err instanceof ValidationError) return refuse(err.message, 'videoUrl');
      if (!gallery && err instanceof RateLimitedError) {
        return { status: 'refused', httpStatus: 429, message: err.message, retryAfterSeconds: err.retryAfterSeconds };
      }
      if (err instanceof ValidationError || err instanceof RateLimitedError) {
        rejected.push({ filename: videoUrl, reason: err.message });
      } else {
        throw err;
      }
    }
  }

  // A gallery create answered as a repeat stands as saved only when the
  // submit's every item was a repeat as well.
  if (gallery && galleryRepeat && !(mediaIds.length > 0 && everyItemRepeat)) {
    gallery = { ...gallery, created: false };
  }

  if (mediaIds.length === 0) {
    if (gallery) {
      return {
        status: 'shared',
        landingHref: `/media/${gallery.id}`,
        mediaIds,
        rejected,
        gallery,
        folded,
      };
    }
    // Every photo was refused and nothing else was asked for: the form comes
    // back with each reason, so the member can fix and choose them again.
    const reasons = rejected.map((r) => (r.filename ? `${r.filename}: ${r.reason}` : r.reason)).join(' ');
    return refuse(`Not shared: ${reasons}`, 'photoFiles');
  }

  return {
    status: 'shared',
    landingHref: landingGalleryId
      ? shareLandingHref(landingGalleryId, mediaIds[0])
      : memberItemLandingHref(input.memberId, mediaIds[0]),
    mediaIds,
    rejected,
    gallery,
    folded,
  };
}

/**
 * The address and hashtags a Footbag Hacky gallery named on the curator Share
 * Media form will be saved with, as the page's preview and the save both see
 * it. Its id is `gallery_<slug>`, the slug made by the slug rule from the
 * curator's own slug when one is given under Advanced, else from the name. It
 * saves the typed hashtags plus `#curated` (or, with none typed, the hashtag
 * made from the name). An address another gallery already holds is refused:
 * `isTaken` answers for every gallery but the one `heldId` names, which is the
 * curator's own same-name, same-hashtags gallery the submit may be repeating.
 */
export function previewNewCuratorGallery(
  name: string,
  typedTags: string[],
  slugTyped: string,
  isTaken: (galleryId: string) => boolean,
): NewGalleryPreviewResult {
  const trimmed = name.trim();
  const refuse = (refusal: string, field: 'galleryName' | 'gallerySlug' = 'galleryName'): NewGalleryPreviewResult =>
    ({ refusal, field });
  if (trimmed.length > GALLERY_NAME_MAX_LEN) {
    return refuse(`A gallery name can be at most ${GALLERY_NAME_MAX_LEN} characters.`);
  }
  const slugSource = slugTyped.trim();
  if (slugSource) {
    if (galleryNameMakesNoAddress(slugSource)) return refuse(GALLERY_SLUG_NO_ADDRESS_MESSAGE, 'gallerySlug');
  } else if (galleryNameMakesNoAddress(trimmed)) {
    return refuse(GALLERY_NAME_NO_ADDRESS_MESSAGE);
  }
  const galleryId = `gallery_${slugifyGalleryName(slugSource || trimmed)}`;
  if (isTaken(galleryId)) {
    return refuse(
      `Another gallery already has the address /media/${galleryId}. Choose another name, or another address under Advanced.`,
      slugSource ? 'gallerySlug' : 'galleryName',
    );
  }
  const chosen = galleryTagsFromTypedOrName(trimmed, typedTags);
  if ('refusal' in chosen) return refuse(chosen.refusal);
  return { galleryId, tags: [CURATED_TAG, ...chosen.tags], defaultTagUsed: chosen.defaultTagUsed };
}

// Shown when the address typed under Advanced folds to no address.
export const GALLERY_SLUG_NO_ADDRESS_MESSAGE =
  'A gallery\'s address needs a word in the letters a to z.';

/** What the curator Share Media form posts, as the controller read it. */
export interface ShareCuratorMediaInput {
  adminMemberId: string;
  /** `photo`, `url_reference` (a YouTube or Vimeo link) or `video` (a video file). */
  mediaType: string | undefined;
  photos: SharedPhotoFile[];
  videoFile: { filename: string; buffer: Buffer } | null;
  poster: Buffer | null;
  videoUrl: string;
  videoCaption: string;
  tags: string;
  externalUrl: string;
  sourceId: string;
  startSeconds: string;
  endSeconds: string;
  category: string;
  newCategory: string;
  primarySlug: string;
  galleryName: string;
  gallerySlug: string;
  gallerySort: string;
  galleryExcludeTags: string;
  galleryPreview: string;
  /** Some file crossed the size the reader holds a part to, and it dropped it. */
  limitExceeded: boolean;
}

export type ShareCuratorMediaResult =
  | {
      status: 'shared';
      mediaIds: string[];
      rejected: { filename: string; reason: string }[];
      gallery: SharedGallery | null;
      folded: FoldedTypedTag[];
    }
  | { status: 'gallery_saved'; gallery: SharedGallery; folded: FoldedTypedTag[] }
  | { status: 'confirm_gallery'; preview: NewGalleryPreview }
  | {
      status: 'refused';
      httpStatus: 410 | 422 | 429;
      message: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };

/** A gallery named on the curator form, checked and previewed but not yet written. */
export interface PlannedCuratorGallery {
  preview: NewGalleryPreview;
  name: string;
  sortOrder: string;
  excludeTags: string[];
  /** Footbag Hacky already has this gallery, under this name with these hashtags. */
  held: CuratorGallerySummary | null;
}

/**
 * The gallery step of a curator share, writing nothing: the name, the
 * Advanced address, sort and excluded hashtags checked, the preview made, and
 * a gallery Footbag Hacky already has under the name recognised. A same-name
 * gallery with other hashtags is refused, so a curator never gets a second
 * gallery under one name.
 */
export function planCuratorGallery(
  svc: CuratorMediaService,
  fields: { galleryName: string; gallerySlug: string; gallerySort: string; galleryExcludeTags: string },
  typedTags: string[],
): { status: 'none' } | { status: 'planned'; plan: PlannedCuratorGallery } | { status: 'refused'; message: string; field: string } {
  const name = fields.galleryName.trim();
  if (!name) return { status: 'none' };
  let excludeTags: string[];
  try {
    excludeTags = checkedTags(parseTagList(fields.galleryExcludeTags));
  } catch (err) {
    if (err instanceof ValidationError) return { status: 'refused', message: err.message, field: 'galleryExcludeTags' };
    throw err;
  }
  const sortOrder = fields.gallerySort.trim() || 'upload_desc';
  if (!(GALLERY_SORT_ORDER_VALUES as readonly string[]).includes(sortOrder)) {
    return { status: 'refused', message: 'Choose one of the listed orders.', field: 'gallerySort' };
  }
  const own = svc.listGalleriesForOwner(svc.getSystemMemberId());
  const sameName = own.find((g) => g.name === name) ?? null;
  const p = previewNewCuratorGallery(name, typedTags, fields.gallerySlug, (id) =>
    id !== sameName?.id && media.getNamedGalleryById.get(id) !== undefined);
  if ('refusal' in p) return { status: 'refused', message: p.refusal, field: p.field };
  if (sameName && (sameName.id !== p.galleryId || !sameTagSet(sameName.criteriaTags, p.tags))) {
    return {
      status: 'refused',
      message: `Footbag Hacky already has a gallery named "${name}", with the hashtags ${sameName.criteriaTags.join(' ')}. Choose another name, or use that gallery's hashtags.`,
      field: 'galleryName',
    };
  }
  return { status: 'planned', plan: { preview: p, name, sortOrder, excludeTags, held: sameName } };
}

/**
 * Write a planned curator gallery through the one curator create path, so its
 * sidecar is written where sidecar writes are on and its audit row lands as
 * for any curator gallery. A repeat of the curator's own submit answers with
 * the first result; a gallery Footbag Hacky already held is reported as held.
 */
export async function createPlannedCuratorGallery(
  svc: CuratorMediaService,
  adminMemberId: string,
  plan: PlannedCuratorGallery,
): Promise<{ status: 'ok'; gallery: SharedGallery } | { status: 'refused'; message: string; httpStatus: 422 | 429; retryAfterSeconds?: number }> {
  try {
    await createCuratorGallery(svc, {
      actorMemberId: adminMemberId,
      idSlug: plan.preview.galleryId.slice('gallery_'.length),
      updates: {
        name: plan.name,
        description: '',
        sortOrder: plan.sortOrder,
        criteriaTags: plan.preview.tags,
        excludeTags: plan.excludeTags,
      },
    });
    return { status: 'ok', gallery: { id: plan.preview.galleryId, name: plan.name, tags: plan.preview.tags, created: true } };
  } catch (err) {
    if (err instanceof ConflictError && plan.held) {
      return { status: 'ok', gallery: { id: plan.held.id, name: plan.held.name, tags: plan.held.criteriaTags, created: false } };
    }
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return { status: 'refused', message: err.message, httpStatus: 422 };
    }
    if (err instanceof RateLimitedError) {
      return { status: 'refused', message: err.message, httpStatus: 429, retryAfterSeconds: err.retryAfterSeconds };
    }
    throw err;
  }
}

/** A whole number of seconds typed into a clip field; null when left empty. */
function clipSeconds(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : 'invalid';
}

/**
 * The curator's Share Media submit: several photos, one YouTube or Vimeo link,
 * or one video file, carrying one set of hashtags, and optionally a Footbag
 * Hacky gallery named from those hashtags. The same order as a member's share:
 * every local check first, writing nothing; a named gallery whose recorded
 * preview is missing or stale returns the preview to confirm; the items'
 * external URL is checked once, writing nothing; then the gallery is created,
 * so it stands even if every file is then refused; then each photo is
 * uploaded on its own, a refused one named while the rest go on, and the
 * curator write limit reached partway names the rest as refused.
 *
 * The photos-per-submit and total-per-submit settings hold the curator as they
 * hold a member; the size per photo is the code maximum. A video file through
 * this form is the local-adapter path only; elsewhere the page's script sends
 * it straight to storage (`beginCuratorVideoUpload`).
 */
export async function shareCuratorMedia(
  svc: CuratorMediaService,
  input: ShareCuratorMediaInput,
): Promise<ShareCuratorMediaResult> {
  const mediaType = input.mediaType === 'url_reference' || input.mediaType === 'video' ? input.mediaType : 'photo';
  const isPhoto = mediaType === 'photo';
  const refuse = (message: string, field?: string, httpStatus: 410 | 422 | 429 = 422): ShareCuratorMediaResult => ({
    status: 'refused',
    httpStatus,
    message: isPhoto && input.photos.length > 0 ? `${message} ${SHARE_CHOOSE_AGAIN}` : message,
    ...(field ? { fieldErrors: { [field]: message } } : {}),
  });

  // 1. Local checks, writing nothing.
  if (mediaType === 'video' && config.mediaStorageAdapter !== 'local') {
    return refuse(
      'Synchronous video upload via this form is disabled in this environment. Enable JavaScript and reload the page; video uploads run as background transcode jobs.',
      undefined,
      410,
    );
  }
  let tags: string[];
  try {
    tags = checkedTags(parseTagList(input.tags));
  } catch (err) {
    if (err instanceof ValidationError) return refuse(err.message, 'tags');
    throw err;
  }
  const folded = changedTypedTags(input.tags);
  const externalUrlRaw = input.externalUrl.trim();

  const videoUrl = input.videoUrl.trim();
  let videoPlatform: VideoPlatform | null = null;
  let startSeconds: number | null = null;
  let endSeconds: number | null = null;
  if (mediaType === 'url_reference' && videoUrl.length > 0) {
    videoPlatform = parseYouTubeVideoId(videoUrl) ? 'youtube' : parseVimeoVideoId(videoUrl) ? 'vimeo' : null;
    if (!videoPlatform || !/^https?:\/\//.test(videoUrl)) return refuse('Paste a YouTube or Vimeo link.', 'videoUrl');
    const start = clipSeconds(input.startSeconds);
    const end = clipSeconds(input.endSeconds);
    if (start === 'invalid' || end === 'invalid') return refuse('A clip starts and ends at a whole number of seconds.', 'startSeconds');
    startSeconds = start;
    endSeconds = end;
  }
  const overLimit = isPhoto ? sharePhotoLimitRefusal(input.photos) : null;
  if (overLimit) return refuse(overLimit, 'photoFiles');

  const planned = planCuratorGallery(svc, input, tags);
  if (planned.status === 'refused') return refuse(planned.message, planned.field);
  const plan = planned.status === 'planned' ? planned.plan : null;

  const hasMedia = isPhoto
    ? input.photos.length > 0 || input.limitExceeded
    : mediaType === 'url_reference' ? videoUrl.length > 0 : input.videoFile !== null;
  if (!hasMedia && !plan) {
    if (isPhoto) return refuse('Choose at least one photo, or name a gallery.', 'photoFiles');
    if (mediaType === 'url_reference') return refuse('Paste a YouTube or Vimeo link.', 'videoUrl');
    return refuse('Please select a video to upload.', 'videoFile');
  }
  if (mediaType === 'video' && input.videoFile && (!input.poster || input.poster.length === 0)) {
    return refuse('Please select a poster image for the video.', 'poster');
  }

  // The sidecar's directory and file name, asked for only where one is written.
  let category: string | undefined;
  if (hasMedia && config.allowCuratedSidecarWrites) {
    const resolved = resolveCuratorCategory({ category: input.category, newCategory: input.newCategory });
    if ('errorMessage' in resolved) return refuse(resolved.errorMessage, 'category');
    category = resolved.category;
    if (mediaType === 'url_reference' && slugifyForTag(input.primarySlug.trim()).length === 0) {
      return refuse('Provide a primary slug for the sidecar filename.', 'primarySlug');
    }
  }

  const { rejected, goodPhotos } = isPhoto
    ? splitSharedPhotos(input.photos, input.limitExceeded, photoMaxBytes(true))
    : { rejected: [], goodPhotos: [] };

  // 2. A named gallery's address and hashtags are shown before they are saved.
  if (plan && !plan.held && input.galleryPreview.trim() !== newGalleryPreviewToken(plan.preview)) {
    return { status: 'confirm_gallery', preview: plan.preview };
  }

  // The items' external URL, checked once for the submit before the gallery
  // is written, so a link every item would be refused for writes nothing.
  let externalUrl: string | null = null;
  if (hasMedia && externalUrlRaw.length > 0) {
    const checked = await validateExternalUrl(externalUrlRaw);
    if (!checked.valid) return refuse(checked.error ?? 'Invalid URL.', 'externalUrl');
    externalUrl = checked.normalizedUrl;
  }

  // 3. The gallery, through the one curator create path.
  let gallery: SharedGallery | null = null;
  if (plan) {
    const made = await createPlannedCuratorGallery(svc, input.adminMemberId, plan);
    if (made.status === 'refused') {
      return { ...(refuse(made.message, 'galleryName', made.httpStatus) as Extract<ShareCuratorMediaResult, { status: 'refused' }>), retryAfterSeconds: made.retryAfterSeconds };
    }
    gallery = made.gallery;
  }
  const itemTags = plan?.preview.defaultTagUsed ? plan.preview.tags.slice(1) : tags;
  if (!hasMedia) return { status: 'gallery_saved', gallery: gallery as SharedGallery, folded };

  // 4. Each photo on its own, or the one link or video file. The curator
  // write limit reached partway stops the rest, each named with its reason,
  // and what was already saved stands.
  const mediaIds: string[] = [];
  let limited: RateLimitedError | null = null;
  const caption = (raw: string) => (raw.trim().length === 0 ? null : raw.trim());
  const one = async (label: string, upload: () => Promise<{ mediaId: string }>): Promise<void> => {
    if (limited) {
      rejected.push({ filename: label, reason: limited.message });
      return;
    }
    try {
      mediaIds.push((await upload()).mediaId);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        limited = err;
        rejected.push({ filename: label, reason: err.message });
        return;
      }
      if (err instanceof ValidationError) {
        rejected.push({ filename: label, reason: err.message });
        return;
      }
      throw err;
    }
  };
  if (isPhoto) {
    for (const photo of goodPhotos) {
      await one(photo.filename, () => svc.uploadPhoto({
        adminMemberId: input.adminMemberId,
        photoBuffer: photo.buffer,
        sourceFilename: photo.filename,
        caption: caption(photo.caption),
        tags: itemTags,
        ...(category && { category }),
        ...(externalUrl !== null && { externalUrl }),
      }));
    }
  } else if (mediaType === 'url_reference') {
    await one(videoUrl, () => svc.uploadUrlReference({
      adminMemberId: input.adminMemberId,
      category: category ?? '',
      videoUrl,
      videoPlatform: videoPlatform as 'youtube' | 'vimeo',
      // Folded by the one slug rule, so "Food-Processor" files as food_processor.
      primarySlug: slugifyForTag(input.primarySlug.trim()),
      title: caption(input.videoCaption),
      sourceId: input.sourceId.trim() || null,
      startSeconds,
      endSeconds,
      tags: itemTags,
      ...(externalUrl !== null && { externalUrl }),
    }));
  } else {
    const file = input.videoFile as { filename: string; buffer: Buffer };
    await one(file.filename, () => svc.uploadVideo({
      adminMemberId: input.adminMemberId,
      videoBuffer: file.buffer,
      posterBuffer: input.poster as Buffer,
      sourceFilename: file.filename,
      caption: caption(input.videoCaption),
      tags: itemTags,
      ...(category && { category }),
      ...(externalUrl !== null && { externalUrl }),
    }));
  }

  if (mediaIds.length === 0 && !gallery) {
    // Everything was refused and nothing else was asked for: the form comes
    // back with each reason, so the curator can fix it and choose again.
    const reasons = rejected.map((r) => (r.filename ? `${r.filename}: ${r.reason}` : r.reason)).join(' ');
    const field = isPhoto ? 'photoFiles' : mediaType === 'url_reference' ? 'videoUrl' : 'videoFile';
    const stoppedBy = limited as RateLimitedError | null;
    if (stoppedBy) {
      return {
        ...(refuse(`Not uploaded: ${reasons}`, field, 429) as Extract<ShareCuratorMediaResult, { status: 'refused' }>),
        retryAfterSeconds: stoppedBy.retryAfterSeconds,
      };
    }
    return refuse(`Not uploaded: ${reasons}`, field);
  }
  return { status: 'shared', mediaIds, rejected, gallery, folded };
}

/**
 * The video-file tab's first step where storage is S3: the page's script asks
 * for the upload URLs here, sending the form's other fields with the claimed
 * files. A gallery named on the form is checked first, made once the claimed
 * files and link pass their own checks, and made before the URLs are signed,
 * so a refused video writes no gallery, a refused gallery leaves no job
 * behind and a made one stands as on any other tab; its preview must be the one
 * the page showed, which the script records as the name and hashtags are typed.
 */
export async function signCuratorVideoUpload(
  svc: CuratorMediaService,
  input: Parameters<CuratorMediaService['beginCuratorVideoUpload']>[0] & {
    galleryName: string;
    gallerySlug: string;
    gallerySort: string;
    galleryExcludeTags: string;
    galleryPreview: string;
  },
): Promise<
  | { status: 'signed'; jobId: string; videoUrl: string; posterUrl: string; expiresAtIso: string }
  | { status: 'invalid'; error: string }
> {
  let tags: string[];
  try {
    tags = checkedTags(parseTagList(input.tags));
  } catch (err) {
    if (err instanceof ValidationError) return { status: 'invalid', error: err.message };
    throw err;
  }
  const planned = planCuratorGallery(svc, input, tags);
  if (planned.status === 'refused') return { status: 'invalid', error: planned.message };
  const plan = planned.status === 'planned' ? planned.plan : null;
  if (plan && !plan.held && input.galleryPreview.trim() !== newGalleryPreviewToken(plan.preview)) {
    return { status: 'invalid', error: 'The new gallery\'s address or hashtags changed. Check them below the gallery name, then upload again.' };
  }
  // The video carries what the gallery saves when no hashtag was typed.
  const itemTags = plan?.preview.defaultTagUsed ? plan.preview.tags.slice(1).join(' ') : input.tags;
  // The gallery is written once the video's own checks (its type, its size,
  // its external URL) have passed, so a refused video writes no gallery, and
  // before any URL is signed, so a refused gallery leaves no job behind; like
  // a gallery named on any other tab, it stands if the upload never finishes.
  return svc.beginCuratorVideoUpload({ ...input, tags: itemTags }, plan
    ? async () => {
      const made = await createPlannedCuratorGallery(svc, input.adminMemberId, plan);
      return made.status === 'refused' ? made.message : null;
    }
    : undefined);
}

/**
 * An administrator creating an FH-owned gallery: the system member owns it and
 * its id is `gallery_<slug>` from the slug the form supplies. An empty slug
 * supplies no id, which createGallery refuses.
 */
export function createCuratorGallery(
  svc: CuratorMediaService,
  input: { actorMemberId: string; idSlug: string; updates: CuratorGalleryUpdates },
): Promise<CuratorGalleryCreateResult> {
  const slug = input.idSlug.trim();
  return svc.createGallery({
    actorMemberId: input.actorMemberId,
    actorIsAdmin: true,
    ownerMemberId: svc.getSystemMemberId(),
    suggestedId: slug ? `gallery_${slug}` : '',
    updates: input.updates,
  });
}

/** How many curated items one page of the admin media list shows. */
export const CURATOR_LIST_PAGE_SIZE = 50;

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
  /** Names the typed tags an edit stored folded; null when none were. */
  savedFoldLine: string | null;
  sidecarWritesEnabled: boolean;
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
    sourceId: string;
    startSeconds: number | string;
    endSeconds: number | string;
    externalUrl: string;
    showThumbnailField: boolean;
  } | null;
  cancelHref: string;
  formAction: string;
  // True only where the authoring tree is writable, the one place a
  // URL-reference edit writes through to its sidecar.
  sidecarWritesEnabled: boolean;
  // The player-search block and the edit form id its picks submit; null on
  // the not-found and refused-edit renders, which offer no search.
  editFormId: string;
  playerSearch: SearchBlockView | null;
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
  /** Names the typed tags the save stored folded; null when none were. */
  savedFoldLine: string | null;
  sidecarWritesEnabled: boolean;
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
  coverChoice: GalleryCoverChoice;
  /** Opens the curator upload form with this gallery's hashtags filled in;
   *  null on a member's gallery, which a curator moderates and never adds to. */
  uploadWithTagsHref: string | null;
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


export function getCuratorMediaListPage(
  svc: CuratorMediaService,
  input: {
    page: number;
    // Raw query-string values; the page narrows them.
    tagFilter: string | null;
    sort: string | null;
    confirmDeleteId: string | null;
    // The save the redirect reported; only an edit or a delete banners here.
    savedFlag: string | null;
    /** Typed tags the edit stored folded, named in the saved message. */
    savedFolded?: { typed: string; stored: string }[];
  },
): PageViewModel<CuratorMediaListContent> {
  const listHref = '/admin/curator/media';
  // Folded by the one rule, like every tag a person types, so "Zürich" with or
  // without its '#' filters on the stored "#zurich".
  const tagFilter = input.tagFilter?.trim() ? (typedTag(input.tagFilter) || null) : null;
  const sort = toCuratorListSort(input.sort);
  const savedFlag = input.savedFlag === 'edit' || input.savedFlag === 'delete' ? input.savedFlag : null;
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
    page: {
      sectionKey: 'admin', pageKey: 'admin_curator_list', title: 'Curated Media',
      instructions: {
        what: 'Lists the media uploaded through the curator account.',
        how: 'Open an item to edit it, or delete it. Upload new media from the Upload page.',
        headsUp: ['Deleting an item is permanent.'],
      },
    },
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
      savedWasEdit: savedFlag === 'edit',
      savedFoldLine: savedFlag === 'edit' ? foldedTagsLine(input.savedFolded ?? []) : null,
      savedWasDelete: savedFlag === 'delete',
      sidecarWritesEnabled: config.allowCuratedSidecarWrites,
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
    page: {
      sectionKey: 'admin', pageKey: 'admin_curator_edit', title,
      instructions: {
        what: 'Edits one curated item\'s caption, hashtags and source, and for a linked video its address and clip times.',
        headsUp: [
          'The file itself cannot be replaced. Delete the item and upload it again.',
          'The #curated hashtag cannot be removed.',
        ],
      },
    },
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
    sidecarWritesEnabled: config.allowCuratedSidecarWrites,
    editFormId: CURATOR_EDIT_FORM_ID,
    playerSearch: null,
  });
}

const CURATOR_EDIT_FORM_ID = 'curator-media-edit-form';

type CuratorMediaEditFields = NonNullable<CuratorMediaEditContent['media']>;

// The edit form's fields for a stored item. The #curated tag is auto-applied
// and cannot be edited, so the editable tag string shows only the tags a
// curator can actually change.
function curatorMediaEditFields(item: CuratorMediaListItem): CuratorMediaEditFields {
  return {
    mediaId: item.mediaId,
    mediaType: item.mediaType,
    caption: item.caption ?? '',
    tagsString: item.tags.filter((t) => t !== '#curated').join(' '),
    thumbnailUrl: item.thumbnailUrl,
    isSidecarBacked: item.videoPlatform === 'youtube' || item.videoPlatform === 'vimeo',
    videoPlatform: item.videoPlatform,
    videoUrl: item.videoUrl,
    sourceId: item.sourceId ?? '',
    startSeconds: item.startSeconds ?? '',
    endSeconds: item.endSeconds ?? '',
    externalUrl: item.externalUrl ?? '',
    showThumbnailField: item.showThumbnailField === true,
  };
}

export async function getCuratorMediaEditPage(
  svc: CuratorMediaService,
  mediaId: string,
  playerSearch?: { query?: string; actorMemberId: string; ip: string },
  // What the curator had typed when the player search reloaded the page, laid
  // over the stored fields so a search never erases an unsaved edit.
  typed: Partial<Pick<CuratorMediaEditFields,
    'caption' | 'tagsString' | 'sourceId' | 'startSeconds' | 'endSeconds' | 'externalUrl'>> = {},
): Promise<PageViewModel<CuratorMediaEditContent> | null> {
  const item = await svc.getMediaItem(mediaId);
  if (!item) return null;
  const formAction = `/admin/curator/media/${encodeURIComponent(item.mediaId)}/edit`;
  const kept = Object.fromEntries(Object.entries(typed).filter(([, v]) => v !== undefined)) as typeof typed;
  return curatorMediaEditEnvelope('Edit Curated Media', {
    notFound: false,
    mediaId: item.mediaId,
    errorMessage: null,
    media: { ...curatorMediaEditFields(item), ...kept },
    cancelHref: '/admin/curator/media',
    formAction,
    sidecarWritesEnabled: config.allowCuratedSidecarWrites,
    editFormId: CURATOR_EDIT_FORM_ID,
    playerSearch: buildPlayerSearchBlock(formAction, playerSearch),
  });
}

/**
 * The edit form re-rendered after a refusal: the stored item's type and
 * fields, with what the curator typed laid over them, so a refused edit of a
 * YouTube or Vimeo item still shows its URL-reference fields. Null when the
 * item is gone.
 */
export async function getCuratorMediaEditErrorPage(
  svc: CuratorMediaService,
  mediaId: string,
  errorMessage: string,
  submitted: Partial<Pick<CuratorMediaEditFields,
    'caption' | 'tagsString' | 'sourceId' | 'startSeconds' | 'endSeconds' | 'externalUrl'>>,
): Promise<PageViewModel<CuratorMediaEditContent> | null> {
  const item = await svc.getMediaItem(mediaId);
  if (!item) return null;
  const typed = Object.fromEntries(
    Object.entries(submitted).filter(([, v]) => v !== undefined),
  ) as typeof submitted;
  return curatorMediaEditEnvelope('Edit Curated Media', {
    notFound: false,
    mediaId,
    errorMessage,
    media: { ...curatorMediaEditFields(item), ...typed },
    cancelHref: '/admin/curator/media',
    formAction: `/admin/curator/media/${encodeURIComponent(mediaId)}/edit`,
    sidecarWritesEnabled: config.allowCuratedSidecarWrites,
    editFormId: CURATOR_EDIT_FORM_ID,
    playerSearch: null,
  });
}

export function getCuratorGalleryListPage(
  svc: CuratorMediaService,
  input: { confirmDeleteId: string | null; savedFlag: boolean; savedFolded?: { typed: string; stored: string }[] },
): PageViewModel<CuratorGalleryListContent> {
  const items = svc.listOwnedGalleries();
  return {
    seo: { title: 'Curator Galleries' },
    page: {
      sectionKey: 'admin',
      pageKey: 'admin_curator_galleries_list',
      title: 'Curator Galleries',
      instructions: {
        what: 'Lists the public galleries owned by the curator account.',
        why: 'A gallery collects media by hashtag, so it stays current as media is added.',
        how: 'Edit a gallery\'s name, description, order or hashtag rules, create a new one, or delete one.',
        headsUp: [
          'An item appears in a gallery when it carries every one of the gallery\'s hashtags and none of its excluded ones.',
          'Deleting a gallery removes only the gallery, not the media in it.',
        ],
      },
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
      savedFoldLine: input.savedFlag ? foldedTagsLine(input.savedFolded ?? []) : null,
      sidecarWritesEnabled: config.allowCuratedSidecarWrites,
      // A gallery is made on the curator Share Media form by naming hashtags.
      newGalleryHref: '/admin/curator/upload',
      listHref: '/admin/curator/galleries',
    },
  };
}

const NO_COVER_CHOICE: GalleryCoverChoice = { offered: false, useNewest: false, outsideList: null };

/**
 * The listed items and the cover choice as this actor's form offers them. A
 * member's cover is their own choice, so an administrator moderating their
 * gallery is offered none, and the save then keeps the stored cover.
 */
function coverChoiceFor(
  g: Pick<CuratorGalleryEditView, 'currentItems' | 'coverChoice'>,
  moderation: { ownerDisplayName: string } | null,
): Pick<CuratorGalleryEditContent, 'currentItems' | 'coverChoice'> {
  if (!moderation) return { currentItems: g.currentItems, coverChoice: g.coverChoice };
  return {
    currentItems: g.currentItems.map((i) => ({ ...i, canBeCover: false, isCover: false })),
    coverChoice: NO_COVER_CHOICE,
  };
}

function curatorGalleryEditEnvelope(
  title: string,
  content: CuratorGalleryEditContent,
): PageViewModel<CuratorGalleryEditContent> {
  return {
    seo: { title, noindex: true },
    page: {
      sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title,
      instructions: {
        what: 'Edits one gallery: its name, description, order and hashtag rules.',
      },
    },
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
    coverChoice: NO_COVER_CHOICE,
    uploadWithTagsHref: null,
    externalLinkSlots: [],
    isFhOwned: true,
    moderation: null,
    reasonRaw: '',
  });
}

function curatorUploadWithTagsHref(galleryId: string, isFhOwned: boolean): string | null {
  return isFhOwned ? `/admin/curator/upload?gallery=${encodeURIComponent(galleryId)}` : null;
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
      // The owner's `#by_` tag is re-added on every save and refused as input,
      // so the form never carries it back.
      criteriaTagsString: g.criteriaTagsDisplayString,
      excludeTagsString: g.excludeTags.join(' '),
    },
    ...coverChoiceFor(g, moderation),
    currentItemsTruncated: g.currentItemsTruncated,
    uploadWithTagsHref: curatorUploadWithTagsHref(galleryId, g.isSystemOwned),
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
    externalLinks: CuratorGalleryExternalLinkInput[];
    fieldErrors?: Record<string, string>;
    reasonRaw?: string;
    /** The cover the refused form submitted; undefined when it offered none. */
    coverMediaId?: string;
  },
): PageViewModel<CuratorGalleryEditContent> {
  let currentItems: CuratorGalleryEditView['currentItems'] = [];
  let coverChoice = NO_COVER_CHOICE;
  let currentItemsTruncated = false;
  let isFhOwned = true;
  let moderation: { ownerDisplayName: string } | null = null;
  try {
    const reread = svc.getGalleryForEdit(submitted.galleryId, undefined, {
      selectedCoverMediaId: submitted.coverMediaId,
    });
    moderation = curatorGalleryModerationView(reread, actorMemberId);
    ({ currentItems, coverChoice } = coverChoiceFor(reread, moderation));
    currentItemsTruncated = reread.currentItemsTruncated;
    isFhOwned = reread.isSystemOwned;
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
    coverChoice,
    uploadWithTagsHref: curatorUploadWithTagsHref(submitted.galleryId, isFhOwned),
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
    page: {
      sectionKey: 'admin', pageKey: 'admin_curator_upload', title,
      instructions: {
        what: 'Shows the progress of one video upload.',
        how: 'The page shows the latest step. Reload it if it stops changing.',
      },
    },
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
  state: MediaJobState;
  media_id: string | null;
  last_error: string | null;
  source_filename: string | null;
  caption: string | null;
  expires_at: string | null;
}): PageViewModel<CuratorJobStatusContent> {
  const abandoned = isAbandonedUpload(job, new Date().toISOString());
  return curatorJobStatusEnvelope('Curator Upload Progress', {
    notFound: false,
    jobId: job.id,
    job: {
      id: job.id,
      state: abandoned ? 'abandoned' : job.state,
      mediaId: job.media_id,
      errorMessage: job.last_error,
      sourceFilename: job.source_filename,
      caption: job.caption,
      isPendingUpload: job.state === 'pending_upload' && !abandoned,
      isPendingTranscode: job.state === 'pending_transcode',
      isProcessing: job.state === 'processing',
      isSucceeded: job.state === 'succeeded',
      isFailed: job.state === 'failed',
      isAbandoned: abandoned,
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

/**
 * One of the owner's galleries as a quick-add suggestion: clicking it adds the
 * gallery's hashtags, which is what makes what is shared show in it.
 */
export interface ShareGalleryChip {
  /** "<name>: <hashtags>", the chip's text. */
  label: string;
  /** The hashtags the chip adds, space separated, the automatic tag left out. */
  tagsAttr: string;
}

/**
 * The owner's own galleries as quick-add chips. The Personal Gallery is never
 * one, because its only hashtag is the automatic one; the automatic hashtag is
 * left out of every chip, since it is added anyway and refused as typed input.
 */
export function memberGalleryChips(svc: CuratorMediaService, memberId: string): ShareGalleryChip[] {
  return svc.listGalleriesForOwner(memberId)
    .filter((g) => !g.isDefault)
    .map((g) => {
      const tags = g.criteriaTags.filter((t) => !t.toLowerCase().startsWith(UPLOADER_TAG_PREFIX));
      return { label: `${g.name}: ${tags.join(' ')}`, tagsAttr: tags.join(' ') };
    })
    .filter((c) => c.tagsAttr.length > 0);
}

/**
 * A Share Media form's fields as the browser last submitted them, echoed back
 * so a refused or confirm-round submit keeps the uploader's own words. The
 * member form posts the first group; the curator form posts all of them.
 */
export interface MemberMediaUploadFormValues {
  mediaType?: string;
  caption?: string;
  videoCaption?: string;
  tags?: string;
  videoUrl?: string;
  externalUrl?: string;
  galleryName?: string;
  fileCaption?: string;
  sourceId?: string;
  startSeconds?: string;
  endSeconds?: string;
  category?: string;
  newCategory?: string;
  primarySlug?: string;
  gallerySlug?: string;
  gallerySort?: string;
  galleryExcludeTags?: string;
}

const SHARE_FORM_FIELDS = [
  'mediaType', 'caption', 'videoCaption', 'fileCaption', 'tags', 'videoUrl', 'externalUrl',
  'galleryName', 'sourceId', 'startSeconds', 'endSeconds', 'category', 'newCategory',
  'primarySlug', 'gallerySlug', 'gallerySort', 'galleryExcludeTags',
] as const;

/** A Share Media submit's fields as the form echoes them back, for either form. */
export function shareFormValues(fields: Record<string, string>): MemberMediaUploadFormValues {
  const values: MemberMediaUploadFormValues = {};
  for (const name of SHARE_FORM_FIELDS) values[name] = fields[name] ?? '';
  return values;
}

/** The media-type tabs a Share Media form offers, and which is open. */
export interface ShareFormTabs {
  /** The `mediaType` value each tab posts; `fileValue` is null where there is no video-file tab. */
  photoValue: string;
  linkValue: string;
  fileValue: string | null;
  photoChecked: boolean;
  linkChecked: boolean;
  fileChecked: boolean;
}

function shareFormTabs(mediaType: string | undefined, values: { link: string; file: string | null }): ShareFormTabs {
  const linkChecked = mediaType === values.link;
  const fileChecked = values.file !== null && mediaType === values.file;
  return {
    photoValue: 'photo',
    linkValue: values.link,
    fileValue: values.file,
    photoChecked: !linkChecked && !fileChecked,
    linkChecked,
    fileChecked,
  };
}

/** What the curator's Share Media form adds to the member's. */
export interface CuratorShareExtras {
  /** True where storage is S3, so the page's script sends a video file straight to storage. */
  asyncEnabled: boolean;
  // The cap the page states and the cap the server applies are one number: the
  // megabyte figure is the label's, the byte figure the browser's check.
  videoMaxMb: number;
  videoMaxBytes: number;
  /** True where the authoring tree is written, the one place a category and a primary slug mean anything. */
  sidecarWritesEnabled: boolean;
  categories: Array<{ value: string; checked: boolean }>;
  sortOptions: Array<{ value: string; label: string; selected: boolean }>;
  /** The report of the last submit, which lands back on this page. */
  notices: ShareNotices | null;
}

/** A new gallery's address and hashtags as the Share form shows them before saving. */
export interface ShareGalleryPreviewView {
  tagsLine: string;
  madeFromNameNote: string | null;
  addressLine: string;
  /** The value the hidden preview field carries, so the next submit saves what was shown. */
  token: string;
}

export interface MemberMediaUploadContent {
  formAction: string;
  cancelHref: string;
  intro: string;
  errorMessage: string | null;
  fieldErrors: Record<string, string>;
  /** The confirm round's informational notice; null otherwise. */
  notice: string | null;
  formValues: MemberMediaUploadFormValues;
  tagSuggestions: MemberTagSuggestions | null;
  galleryChips: ShareGalleryChip[];
  /** Whose galleries the chips are: the member's own, or Footbag Hacky's. */
  galleryChipsLabel: string;
  automaticTag: string;
  photoFieldLabel: string;
  galleryStepText: string;
  preview: ShareGalleryPreviewView | null;
  limits: ShareUploadLimits;
  tabs: ShareFormTabs;
  /** The button's label: Share for a member, Upload for the curator. */
  submitLabel: string;
  /** Null on the member's form. */
  curator: CuratorShareExtras | null;
  /** The JSON data island the Share script reads: what it needs to preview a gallery and check files. */
  shareDataJson: string;
}

function sharePreviewView(preview: NewGalleryPreview): ShareGalleryPreviewView {
  return {
    tagsLine: `Its hashtags: ${preview.tags.join(' ')}`,
    madeFromNameNote: preview.defaultTagUsed
      ? '(made from the name, because no hashtags are given above)'
      : null,
    addressLine: `Its address: /media/${preview.galleryId} (it stays the same if you rename the gallery)`,
    token: newGalleryPreviewToken(preview),
  };
}

// Inside a JSON data island, `<` is written as its escape so no value can close
// the script element it sits in.
function jsonForDataIsland(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface MemberMediaEditFormValues {
  caption: string;
  tags: string;
  externalUrl: string;
}

export interface MemberMediaDeleteConfirmContent {
  summary: { label: string; value: string }[];
  deleteHref: string;
  cancelHref: string;
}

export interface MemberMediaEditContent {
  formAction: string;
  intro: string;
  galleryChips: ShareGalleryChip[];
  /** The edit form's id, so the player-search picks (rendered outside the
   *  form, after the search form) submit it with their credit. */
  editFormId: string;
  deleteConfirmHref: string;
  cancelHref: string;
  errorMessage: string | null;
  formValues: MemberMediaEditFormValues;
  tagSuggestions: MemberTagSuggestions | null;
  playerSearch: SearchBlockView;
}

/**
 * The player-search block on a media edit page: the one member search, run
 * against this page's own address, so finding a player reloads the edit form.
 */
export function buildPlayerSearchBlock(
  formAction: string,
  search: { query?: string; actorMemberId: string; ip: string } | undefined,
): SearchBlockView {
  const query = search?.query?.trim() ?? '';
  const result = search && query !== ''
    ? memberService.searchMembers(query, { actorMemberId: search.actorMemberId, ip: search.ip })
    : null;
  return {
    formAction,
    query: result?.query ?? '',
    results: result?.results ?? [],
    hasMore: result?.hasMore ?? false,
    tooShort: result?.tooShort ?? false,
    rateLimited: result?.rateLimited ?? false,
    hasQuery: query !== '',
  };
}

export const SHARE_CONFIRM_NOTICE_WITH_FILES =
  'Check your new gallery\'s address and hashtags below, then choose your photos again and press Share.';
export const SHARE_CONFIRM_NOTICE =
  'Check your new gallery\'s address and hashtags below, then press Share.';
// The curator's form names its button Upload.
export const CURATOR_CONFIRM_NOTICE_WITH_FILES =
  'Check the new gallery\'s address and hashtags below, then choose the files again and press Upload.';
export const CURATOR_CONFIRM_NOTICE =
  'Check the new gallery\'s address and hashtags below, then press Upload.';

/**
 * The Share Media form: photos or a video link, one set of hashtags, and the
 * optional step that names those hashtags as a gallery.
 *
 * The member's own galleries are offered as quick-add chips, never as a
 * destination: nothing is put in a gallery, it shows what carries its hashtags.
 * `prefillGalleryId` names one of the member's own galleries (`?gallery=`),
 * whose hashtags fill the Hashtags field; any other value is ignored.
 */
export function getMemberMediaUploadPage(
  svc: CuratorMediaService,
  memberKey: string,
  memberId: string,
  memberSlug: string,
  opts: {
    actorIsAdmin?: boolean;
    prefillGalleryId?: string;
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
    notice?: string;
    formValues?: MemberMediaUploadFormValues;
    tagSuggestions?: MemberTagSuggestions;
    preview?: NewGalleryPreview;
  } = {},
): PageViewModel<MemberMediaUploadContent> {
  const owned = svc.listGalleriesForOwner(memberId);
  const automaticTag = `${UPLOADER_TAG_PREFIX}${memberSlug}`;
  const limits = shareUploadLimits(opts.actorIsAdmin === true);

  let formValues: MemberMediaUploadFormValues = opts.formValues ?? { mediaType: 'photo' };
  if (!opts.formValues && opts.prefillGalleryId) {
    const prefill = owned.find((g) => g.id === opts.prefillGalleryId && !g.isDefault);
    if (prefill) {
      const tags = prefill.criteriaTags.filter((t) => !t.toLowerCase().startsWith(UPLOADER_TAG_PREFIX));
      formValues = { ...formValues, tags: tags.join(' ') };
    }
  }

  return {
    seo: { title: 'Share Media' },
    page: { sectionKey: 'members', pageKey: 'member_media_upload', title: 'Share Media' },
    content: {
      formAction: `/members/${memberKey}/media/upload`,
      cancelHref: memberGalleriesHref(memberKey),
      intro: `Hashtags decide where everything on this site shows. A search is an unnamed set of hashtags in the web address; a gallery is the same thing with a name and a permanent address you can bookmark. Everything you share also carries ${automaticTag}, so it is always in your Personal Gallery.`,
      errorMessage: opts.errorMessage ?? null,
      fieldErrors: opts.fieldErrors ?? {},
      notice: opts.notice ?? null,
      formValues,
      tagSuggestions: opts.tagSuggestions ?? null,
      galleryChips: memberGalleryChips(svc, memberId),
      galleryChipsLabel: 'Your galleries:',
      automaticTag,
      photoFieldLabel: `Photos (JPEG or PNG, up to ${limits.fileMb} MB each, up to ${limits.maxFiles} at a time, together up to ${limits.totalMb} MB):`,
      galleryStepText: `A gallery is a set of hashtags with a name and a permanent address. Give it a name and it saves the hashtags above, plus your ${automaticTag}. It shows everything you share that carries all of them, now and later, including what you share right now.`,
      preview: opts.preview ? sharePreviewView(opts.preview) : null,
      limits,
      tabs: shareFormTabs(formValues.mediaType, { link: 'video', file: null }),
      submitLabel: 'Share',
      curator: null,
      shareDataJson: jsonForDataIsland({
        galleryIdPrefix: `gallery_${memberSlug}_`,
        automaticTag,
        // A member's address already taken takes the next `_2`, `_3`.
        takenIds: owned.map((g) => g.id),
        takenRefused: false,
        personalGalleryId: buildMemberGalleryId(memberSlug, PERSONAL_GALLERY_NAME, 0),
        maxFiles: limits.maxFiles,
        fileBytes: limits.fileMb * 1024 * 1024,
        totalBytes: limits.totalMb * 1024 * 1024,
      }),
    },
  };
}

/** Footbag Hacky's galleries as quick-add chips, `#curated` left out since it is added anyway. */
function curatorGalleryChips(galleries: CuratorGallerySummary[]): ShareGalleryChip[] {
  return galleries
    .map((g) => {
      const tags = g.criteriaTags.filter((t) => t.toLowerCase() !== CURATED_TAG);
      return { label: `${g.name}: ${tags.join(' ')}`, tagsAttr: tags.join(' ') };
    })
    .filter((c) => c.tagsAttr.length > 0);
}

// The same labels the gallery edit form gives these orders.
const GALLERY_SORT_LABELS: Record<string, string> = {
  upload_desc: 'Upload date, newest first (default)',
  upload_asc: 'Upload date, oldest first',
  caption_asc: 'Caption alphabetical (use for captioned series)',
};

/**
 * The report of a curator Share Media submit, on the upload page it lands back
 * on: what was uploaded, the gallery named, what was refused, each in its own
 * tone. Where sidecar writes are on, it also says the seeder carries the new
 * sidecars into the database.
 */
export function curatorShareNotices(outcome: ShareOutcome, sidecarWritesEnabled: boolean): ShareNotices {
  const success: string[] = [];
  const info: string[] = [];
  if (outcome.count > 0) {
    success.push(outcome.count > 1 ? `Uploaded ${outcome.count} items.` : 'Uploaded.');
    if (sidecarWritesEnabled) {
      success.push('Sidecar saved under /curated/. Run the curator seeder (python scripts/seed_fh_curator.py) to update the platform DB.');
    }
  }
  if (outcome.gallery?.created) {
    success.push(`Gallery ${outcome.gallery.name} saved, at /media/${outcome.gallery.id}.`);
  } else if (outcome.gallery) {
    info.push(`Footbag Hacky already has a gallery named ${outcome.gallery.name} with these hashtags.`);
  }
  const foldLine = foldedTagsLine(outcome.folded);
  if (foldLine && success.length > 0) success.push(foldLine);
  const refusal = outcome.rejected.map((r) => {
    const reason = r.reason.replace(/\.$/, '');
    return r.filename ? `Not uploaded: ${r.filename}: ${reason}.` : `Not uploaded: ${reason}.`;
  });
  return { success, info, refusal };
}

/**
 * The curator's Share Media form: the member's form with the curator's
 * differences. Photos, a YouTube or Vimeo link (with its source and clip
 * range under Advanced) and a video file; the locked `#curated` in place of
 * `#by_`; Footbag Hacky's galleries as quick-add chips; and, where sidecar
 * writes are on, the category and primary slug that name the sidecar. A
 * gallery named here is a Footbag Hacky gallery, its address made from the
 * name or from the slug given under Advanced, where its order and excluded
 * hashtags are set too. `prefillGalleryId` names a Footbag Hacky gallery
 * (`?gallery=`) whose hashtags fill the Hashtags field.
 */
export function getCuratorSharePage(
  svc: CuratorMediaService,
  opts: {
    prefillGalleryId?: string;
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
    notice?: string;
    formValues?: MemberMediaUploadFormValues;
    tagSuggestions?: MemberTagSuggestions;
    preview?: NewGalleryPreview;
    existingCategories?: string[];
    outcome?: ShareOutcome | null;
  } = {},
): PageViewModel<MemberMediaUploadContent> {
  const galleries = svc.listGalleriesForOwner(svc.getSystemMemberId());
  const limits = shareUploadLimits(true);
  let formValues: MemberMediaUploadFormValues = opts.formValues ?? { mediaType: 'photo' };
  if (!opts.formValues && opts.prefillGalleryId) {
    const prefill = galleries.find((g) => g.id === opts.prefillGalleryId);
    if (prefill) {
      formValues = { ...formValues, tags: prefill.criteriaTags.filter((t) => t.toLowerCase() !== CURATED_TAG).join(' ') };
    }
  }
  const sort = formValues.gallerySort || 'upload_desc';
  return {
    seo: { title: 'Upload Curated Media' },
    page: {
      sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Upload Curated Media',
      instructions: {
        what: 'Uploads curated photos and videos, or adds a YouTube or Vimeo link, credited to the platform\'s curator account, and can name their hashtags as one of its galleries.',
        why: 'To publish IFPA\'s own media alongside what members share.',
        how: 'Choose the kind of media, add the files or link, their captions and hashtags, and upload. To make a gallery, name the hashtags under the last step.',
        headsUp: [
          'Uploads are credited to the curator account, not to you. Your name is kept in the audit log.',
          'The #curated hashtag is added automatically.',
          'A video is converted after upload, which usually takes one to three minutes. Its status page shows the progress.',
        ],
      },
    },
    content: {
      formAction: '/admin/curator/upload',
      cancelHref: '/admin/curator/media',
      intro: `Hashtags decide where everything on this site shows. A search is an unnamed set of hashtags in the web address; a gallery is the same thing with a name and a permanent address you can bookmark. Everything uploaded here also carries ${CURATED_TAG}.`,
      errorMessage: opts.errorMessage ?? null,
      fieldErrors: opts.fieldErrors ?? {},
      notice: opts.notice ?? null,
      formValues,
      tagSuggestions: opts.tagSuggestions ?? null,
      galleryChips: curatorGalleryChips(galleries),
      galleryChipsLabel: 'Footbag Hacky\'s galleries:',
      automaticTag: CURATED_TAG,
      photoFieldLabel: `Photos (JPEG or PNG, up to ${limits.fileMb} MB each, up to ${limits.maxFiles} at a time, together up to ${limits.totalMb} MB):`,
      galleryStepText: `A gallery is a set of hashtags with a name and a permanent address. Give it a name and it saves the hashtags above, plus ${CURATED_TAG}. It shows everything that carries all of them, now and later, including what you upload right now.`,
      preview: opts.preview ? sharePreviewView(opts.preview) : null,
      limits,
      tabs: shareFormTabs(formValues.mediaType, { link: 'url_reference', file: 'video' }),
      submitLabel: 'Upload',
      curator: {
        asyncEnabled: config.mediaStorageAdapter === 's3',
        videoMaxMb: VIDEO_MAX_MB,
        videoMaxBytes: VIDEO_MAX_BYTES,
        sidecarWritesEnabled: config.allowCuratedSidecarWrites,
        categories: (opts.existingCategories ?? []).map((c) => ({ value: c, checked: formValues.category === c })),
        sortOptions: GALLERY_SORT_ORDER_VALUES.map((v) => ({
          value: v, label: GALLERY_SORT_LABELS[v] ?? v, selected: v === sort,
        })),
        notices: opts.outcome ? curatorShareNotices(opts.outcome, config.allowCuratedSidecarWrites) : null,
      },
      shareDataJson: jsonForDataIsland({
        galleryIdPrefix: 'gallery_',
        automaticTag: CURATED_TAG,
        // A curator gallery's address another gallery holds is refused, never suffixed.
        takenIds: galleries.map((g) => g.id),
        takenRefused: true,
        personalGalleryId: null,
        maxFiles: limits.maxFiles,
        fileBytes: limits.fileMb * 1024 * 1024,
        totalBytes: limits.totalMb * 1024 * 1024,
      }),
    },
  };
}

export function getMemberMediaEditPage(
  memberKey: string,
  mediaId: string,
  formValues: MemberMediaEditFormValues,
  opts: {
    errorMessage?: string;
    tagSuggestions?: MemberTagSuggestions;
    playerSearch?: { query?: string; actorMemberId: string; ip: string };
    galleryChips?: ShareGalleryChip[];
    memberSlug?: string;
  } = {},
): PageViewModel<MemberMediaEditContent> {
  const formAction = `/members/${memberKey}/media/${mediaId}/edit`;
  const automaticTag = `${UPLOADER_TAG_PREFIX}${opts.memberSlug ?? memberKey}`;
  return {
    seo: { title: 'Edit Media' },
    page: { sectionKey: 'members', pageKey: 'member_media_edit', title: 'Edit Media' },
    content: {
      formAction,
      intro: `Change this item's caption, hashtags or external URL. Its hashtags decide where it shows: add a gallery's hashtags to show it in that gallery, remove one to stop. ${automaticTag} stays on it always.`,
      editFormId: 'member-media-edit-form',
      playerSearch: buildPlayerSearchBlock(formAction, opts.playerSearch),
      deleteConfirmHref: `/members/${memberKey}/media/${mediaId}/delete`,
      cancelHref: `/media/item/${mediaId}`,
      errorMessage: opts.errorMessage ?? null,
      formValues,
      tagSuggestions: opts.tagSuggestions ?? null,
      galleryChips: opts.galleryChips ?? [],
    },
  };
}

export interface MemberGalleryEditContent {
  formAction: string;
  cancelHref: string;
  intro: string;
  shareWithTagsHref: string | null;
  errorMessage: string | null;
  fieldErrors: Record<string, string> | undefined;
  gallery: CuratorGalleryFormFields;
  currentItems: CuratorGalleryEditView['currentItems'];
  currentItemsTruncated: boolean;
  coverChoice: GalleryCoverChoice;
  externalLinkSlots: ExternalLinkSlot[];
  // The same hashtag suggestions the Share Media form offers (the member's own
  // player hashtag, clubs and events, recent events and popular hashtags), so a
  // gallery can be built on an event's hashtag with one click.
  tagSuggestions: MemberTagSuggestions;
}

/**
 * A member's own gallery edit page. Its intro names what the gallery shows and
 * its permanent address; its share link opens the Share Media form with the
 * gallery's hashtags filled in (the Personal Gallery's opens it empty, its only
 * hashtag being the automatic one).
 */
export function getMemberGalleryEditPage(
  memberKey: string,
  galleryId: string,
  input: {
    /** The owner, whose clubs and events the hashtag suggestions offer. */
    memberId: string;
    gallery: CuratorGalleryFormFields;
    /** The gallery's saved hashtags, the owner's `#by_` among them. */
    criteriaTags: string[];
    isDefault: boolean;
    currentItems: CuratorGalleryEditView['currentItems'];
    currentItemsTruncated: boolean;
    coverChoice: GalleryCoverChoice;
    externalLinkSlots: ExternalLinkSlot[];
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
  },
): PageViewModel<MemberGalleryEditContent> {
  const shareHref = `/members/${memberKey}/media/upload`;
  return {
    seo: { title: 'Edit Gallery' },
    page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
    content: {
      formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
      cancelHref: memberGalleriesHref(memberKey),
      intro: `This gallery shows everything you have shared that carries ${input.criteriaTags.join(' ')}, and none of its excluded hashtags. Its address is /media/${galleryId}, and it stays the same if you rename the gallery.`,
      shareWithTagsHref: input.isDefault ? shareHref : `${shareHref}?gallery=${galleryId}`,
      errorMessage: input.errorMessage ?? null,
      fieldErrors: input.fieldErrors,
      gallery: input.gallery,
      currentItems: input.currentItems,
      currentItemsTruncated: input.currentItemsTruncated,
      coverChoice: input.coverChoice,
      externalLinkSlots: input.externalLinkSlots,
      tagSuggestions: hashtagDiscoveryService.getTagSuggestionsForMember(input.memberId, memberKey),
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
  /** The cover photo's thumbnail; null when the gallery shows no photo. */
  coverThumbUrl: string | null;
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

const MEMBER_GALLERY_LIST_INTRO =
  'Your galleries. A gallery is a set of hashtags with a name and a permanent address you can bookmark: it shows everything you have shared that carries all of its hashtags and none of its excluded ones. To make one, name a set of hashtags on the Share Media form.';

export interface MemberGalleryListContent {
  galleries: MemberGalleryListRow[];
  listHref: string;
  intro: string;
  uploadMediaHref: string | null;
  benefitNotice: TierBenefitNotice | null;
  teaching: MemberGalleryListTeaching | null;
  savedMessage: string | null;
  /** Names the typed tags the save stored folded; null when none were. */
  savedFoldLine: string | null;
  errorMessage: string | null;
}

function memberGalleryRows(
  svc: CuratorMediaService,
  summaries: CuratorGallerySummary[],
  memberKey: string,
  confirmDeleteId: string | null,
): MemberGalleryListRow[] {
  const covers = svc.listGalleryCoverThumbs(summaries.map((g) => g.id));
  return summaries.map((g) => ({
    coverThumbUrl: covers.get(g.id) ?? null,
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
    /** Typed tags the save stored folded, named in the saved message. */
    savedFolded?: { typed: string; stored: string }[];
    readCommunityExamples: (limit: number, backHref: string) => GalleryItem[];
  },
): PageViewModel<MemberGalleryListContent> {
  const { memberKey, memberId } = input;
  const listHref = memberGalleriesHref(memberKey);
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
      galleries: memberGalleryRows(svc, summaries, memberKey, input.confirmDeleteId),
      listHref,
      intro: MEMBER_GALLERY_LIST_INTRO,
      uploadMediaHref: benefitNotice ? null : `/members/${memberKey}/media/upload`,
      benefitNotice,
      teaching,
      // Pre-shaped so the template never branches on the raw flash code.
      savedMessage: input.savedFlag === 'upload' ? 'Uploaded.' : input.savedFlag ? 'Saved.' : null,
      savedFoldLine: input.savedFlag ? foldedTagsLine(input.savedFolded ?? []) : null,
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
  const listHref = memberGalleriesHref(memberKey);
  return {
    seo: { title: 'My Galleries' },
    page: { sectionKey: 'members', pageKey: 'member_galleries_list', title: 'My Galleries' },
    content: {
      galleries: memberGalleryRows(svc, svc.listGalleriesForOwner(input.memberId), memberKey, null),
      listHref,
      intro: MEMBER_GALLERY_LIST_INTRO,
      uploadMediaHref: `/members/${memberKey}/media/upload`,
      benefitNotice: null,
      teaching: null,
      savedMessage: null,
      savedFoldLine: null,
      errorMessage: input.errorMessage,
    },
  };
}
