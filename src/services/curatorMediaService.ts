import { randomUUID } from 'crypto';
import path from 'path';
import { countGalleryItemsByCriteria, media, mediaTags as mediaTagsDb, queryCuratorMediaTags, transaction, type MediaJobRow } from '../db/db';
import { detectImageType } from '../lib/imageProcessing';
import { detectVideoFormat, type TranscodedVideo } from '../lib/videoProcessing';
import { Semaphore } from '../lib/semaphore';
import { MediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
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
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
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

// Idempotent variant of applyTags: skip the media_tags insert when the
// (media_id, tag_id) row already exists. Used by addMediaToGallery,
// where the picked media items may already carry one or more of the
// gallery's criteria tags. The non-idempotent applyTags path stays in
// place for upload flows (freshly inserted media has no prior tags).
function applyTagsIdempotent(mediaId: string, tags: string[], now: string): void {
  for (const tag of tags) {
    const existingTag = mediaTagsDb.findTagByNormalized.get(tag) as { id: string } | undefined;
    let tagId: string;
    if (existingTag) {
      tagId = existingTag.id;
    } else {
      tagId = newTagId();
      mediaTagsDb.insertTag.run(tagId, now, now, tag, tag);
    }
    if (mediaTagsDb.findMediaTag.get(mediaId, tagId)) continue;
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
): void {
  const uploaderTag = `${UPLOADER_TAG_PREFIX}${slug.toLowerCase()}`;
  const canonical = [uploaderTag, ...userTags];
  applyTags(mediaId, canonical, now);
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

export interface MediaPickerItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  thumbnailUrl: string;
  caption: string | null;
  sourceFilename: string | null;
  uploadedAt: string;
  tags: string[];
}

export interface MediaPickerListResult {
  items: MediaPickerItem[];
}

interface CountRow {
  n: number;
}

export function createCuratorMediaService(deps: CuratorMediaServiceDeps) {
  const { storage, imageProcessor } = deps;
  const videoTranscoder = deps.videoTranscoder ?? getVideoTranscodingAdapter();
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
      return listExistingCuratorCategories(curatedRootDir);
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
        const categoryDir = path.join(curatedRootDir, input.category);
        await fsp.mkdir(categoryDir, { recursive: true });
        await fsp.writeFile(path.join(categoryDir, binaryName), input.photoBuffer);
        writeSidecar(categoryDir, binaryName, {
          caption: input.caption,
          tags: input.tags,
          ...(normalizedExternalUrl !== null && { externalUrl: normalizedExternalUrl }),
        });
        recordedSourceFilename = binaryName;
      }

      const now = new Date().toISOString();

      transaction(() => {
        media.insertCuratorPhoto.run(
          mediaId, now, now,
          systemMemberId, input.caption, now,
          thumbKey, displayKey, processed.widthPx, processed.heightPx,
          recordedSourceFilename,
        );
        if (normalizedExternalUrl !== null) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId);
        }
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
          videoTranscoder.transcode(input.videoBuffer),
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
        const categoryDir = path.join(curatedRootDir, input.category);
        await fsp.mkdir(categoryDir, { recursive: true });
        await fsp.writeFile(path.join(categoryDir, binaryName), input.videoBuffer);
        await fsp.writeFile(path.join(categoryDir, posterName), input.posterBuffer);
        writeSidecar(categoryDir, binaryName, {
          caption: input.caption,
          tags: input.tags,
          poster: posterName,
          ...(normalizedExternalUrl !== null && { externalUrl: normalizedExternalUrl }),
        });
        recordedSourceFilename = binaryName;
      }

      const now = new Date().toISOString();
      const thumbnailUrl = storage.constructURL(posterDisplayKey);

      transaction(() => {
        media.insertCuratorVideo.run(
          mediaId, now, now,
          systemMemberId, input.caption, now,
          videoKey, thumbnailUrl,
          processed.widthPx, processed.heightPx,
          recordedSourceFilename,
        );
        if (normalizedExternalUrl !== null) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId);
        }
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
          videoTranscoder.transcodeFromStorage(job.source_video_key, videoKey),
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

      transaction(() => {
        media.insertCuratorVideo.run(
          mediaId, now, now,
          systemMemberId, job.caption, now,
          videoKey, thumbnailUrl,
          processed.widthPx, processed.heightPx,
          job.source_filename,
        );
        applyTagsForCurator(mediaId, tags, now);
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

      transaction(() => {
        if (input.caption !== undefined) {
          media.updateCuratorMediaCaption.run(input.caption, now, input.mediaId);
        }
        if (dedupedTags !== undefined) {
          mediaTagsDb.deleteMediaTagsByMediaId.run(input.mediaId);
          applyTagsForCurator(input.mediaId, dedupedTags, now);
        }
        if (normalizedExternalUrlEdit !== undefined) {
          // null clears, string sets. validated_at is set even on clear so
          // we record when the field was last touched.
          media.setMediaItemExternalUrl.run(normalizedExternalUrlEdit, now, input.mediaId);
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
        if (row.thumbnail_url && row.thumbnail_url.startsWith('/media-store/')) {
          keysToDelete.push(row.thumbnail_url.slice('/media-store/'.length));
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

    // Member's own active media for the gallery-create / gallery-edit
    // picker. Ownership is read directly off uploader_member_id (the
    // authoritative signal), not via the slug-tag — a curator-uploaded
    // item that happens to carry #<slug> is not the member's own
    // upload. Avatars are excluded so the picker never offers the
    // member's profile photo as gallery content.
    listMediaForPicker(input: { ownerMemberId: string }): MediaPickerListResult {
      return runSqliteRead('listMediaForPicker', () => {
        const rows = media.listMediaForOwnerPicker.all(input.ownerMemberId) as MediaListRow[];
        const ids = rows.map((r) => r.id);
        const tagsById = new Map<string, string[]>();
        for (const id of ids) tagsById.set(id, []);
        for (const pair of queryCuratorMediaTags(ids)) {
          tagsById.get(pair.media_id)?.push(pair.tag_display);
        }
        const items: MediaPickerItem[] = rows.map((r) => ({
          mediaId: r.id,
          mediaType: r.media_type,
          thumbnailUrl: deriveListThumbnail(r),
          caption: r.caption,
          sourceFilename: r.source_filename ?? null,
          uploadedAt: r.uploaded_at,
          tags: tagsById.get(r.id) ?? [],
        }));
        return { items };
      });
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
    // gallery.
    async updateGallery(input: CuratorGalleryUpdateInput): Promise<void> {
      const { actorMemberId, actorIsAdmin, galleryId, updates } = input;

      const validated = validateGalleryUpdates(updates);

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
      });

      if (existing.is_system === 1) {
        await writeFhGallerySidecar({
          id: galleryId,
          name: validated.name,
          description: validated.description,
          sortOrder: validated.sortOrder,
          criteriaTags: validated.criteriaTags,
          excludeTags: validated.excludeTags,
        });
      }
    },

    // Creates a new gallery row and its tag sets in a single transaction.
    // Owner is set explicitly: FH-owned (admin acting as system member,
    // suggestedId required) or member-owned (owner === actor, id auto-
    // generated). For FH-owned, writes the JSON sidecar after commit.
    // Throws ValidationError on bad input or unauthorized actor;
    // ConflictError when UNIQUE(owner, name) is already taken.
    async createGallery(
      input: CuratorGalleryCreateInput,
    ): Promise<CuratorGalleryCreateResult> {
      const { actorMemberId, actorIsAdmin, ownerMemberId, suggestedId, ownerSlug, updates } = input;

      const validated = validateGalleryUpdates(updates);

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const isFhOwned = ownerMemberId === systemMemberId;

      // Authorization: admin can create on behalf of anyone (in practice
      // FH-owned curator galleries); a non-admin actor can only create
      // galleries owned by themselves.
      // DEVIATION: today, any authenticated member is allowed to be the
      // actor for `actorMemberId === ownerMemberId` (the route layer in
      // slice 2b applies only `requireAuth`, no tier gate). Target:
      // re-narrow to a tier-eligible cohort once the tier feature
      // lands. The tier ledger (`member_tier_grants` /
      // `member_tier_current`) exists in schema; no tier-required
      // middleware or service-level tier check exists yet.
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

      const existing = media.getNamedGalleryById.get(galleryId) as
        | { id: string; owner_member_id: string; is_system: number }
        | undefined;
      if (!existing) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      authorizeGalleryActor(actorMemberId, actorIsAdmin, existing.owner_member_id);

      media.deleteMemberGalleryById.run(galleryId);

      if (existing.is_system === 1) {
        const sidecarPath = deriveGallerySidecarPath(curatedRootDir, galleryId);
        try {
          await deleteGallerySidecarFile(sidecarPath);
        } catch (err) {
          // Sidecar I/O failures are logged but do not roll back the
          // DB delete: the next seeder run will reconcile, and the
          // gallery is already gone from the live read paths.
          console.warn(
            `[curatorMediaService] sidecar unlink failed for ${galleryId}: ${(err as Error).message}`,
          );
        }
      }
    },

    // Attach existing media to a gallery by applying the gallery's
    // CURRENT criteria tags to each picked item. The picker UI on
    // /members/:slug/galleries/{new,:id/edit} drives this method.
    //
    // Cross-gallery side-effect: tags are global metadata, not per-
    // gallery membership tokens. Applying e.g. `#event_2024_eugene`
    // here adds the item to every gallery whose criteria include that
    // tag. This is intentional under the tag-AND model.
    //
    // Authz: actor must own the gallery (or be admin). Per-item
    // ownership is also enforced — a non-admin actor cannot attach
    // another member's media to their gallery; mismatched items are
    // silently skipped (and surface in `skipped`).
    addMediaToGallery(input: {
      actorMemberId: string;
      actorIsAdmin: boolean;
      galleryId: string;
      mediaIds: string[];
    }): { added: number; skipped: number } {
      if (input.mediaIds.length === 0) return { added: 0, skipped: 0 };
      if (input.mediaIds.length > 50) {
        throw new ValidationError('Cannot add more than 50 items in one operation.');
      }
      const gallery = media.getNamedGalleryById.get(input.galleryId) as
        | { id: string; owner_member_id: string }
        | undefined;
      if (!gallery) {
        throw new NotFoundError(`gallery ${input.galleryId} not found`);
      }
      authorizeGalleryActor(input.actorMemberId, input.actorIsAdmin, gallery.owner_member_id);

      // Strip `#by_*` from the gallery's criteria tags before stamping
      // them on picked items: the uploader-attribution namespace is
      // system-managed at upload time, so the picker must never apply
      // it. Without this, an admin picking another member's item into
      // a gallery whose criteria includes `#by_<owner>` would forge
      // uploader attribution on the picked item.
      const criteriaTags = (
        media.listFhNamedGalleryTags.all(input.galleryId) as Array<{ tag_display: string }>
      )
        .map((t) => t.tag_display)
        .filter((t) => !t.startsWith(UPLOADER_TAG_PREFIX));

      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();
      transaction(() => {
        for (const mediaId of input.mediaIds) {
          const row = media.getMediaUploaderById.get(mediaId) as
            | { id: string; uploader_member_id: string }
            | undefined;
          if (!row) {
            skipped++;
            continue;
          }
          if (!input.actorIsAdmin && row.uploader_member_id !== input.actorMemberId) {
            skipped++;
            continue;
          }
          applyTagsIdempotent(mediaId, criteriaTags, now);
          added++;
        }
      });
      return { added, skipped };
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
    //
    // DEVIATION: no tier gate (target: Tier 1+ required to upload).
    // Tier ledger exists in schema but no enforcement anywhere yet.
    async uploadPhotoForMember(input: MemberPhotoInput): Promise<MemberUploadResult> {
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

      // Storage puts run before the DB transaction (above), so a UNIQUE
      // constraint reject here orphans the thumb/display objects. Same
      // small window the curator path has had; cleanup is a follow-up.
      try {
        transaction(() => {
          media.insertMemberPhoto.run(
            mediaId, now, now,
            input.memberId, input.caption, now,
            thumbKey, displayKey, processed.widthPx, processed.heightPx,
            input.sourceFilename,
          );
          if (normalizedExternalUrl !== null) {
            media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId);
          }
          applyTagsForMember(mediaId, input.slug, input.tags, now);
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
        const msg = (err as Error).message ?? '';
        if (msg.includes('UNIQUE') && msg.includes('source_filename')) {
          throw new ValidationError(
            `You have already uploaded a file named "${input.sourceFilename}". ` +
            `Rename the file or delete the previous upload first.`,
          );
        }
        throw err;
      }

      return { mediaId, displayUrl: storage.constructURL(displayKey) };
    },

    // Member-attributed video URL submission. URL-reference only (no
    // bytes hosted), per US M_Submit_Video. The service verifies the
    // URL via the platform's oEmbed endpoint (the only reliable
    // signal: page URLs return 200 even for removed videos), extracts
    // the video id, and pulls the Vimeo thumbnail from the oEmbed
    // body (Vimeo thumbnails are not derivable from id; YouTube ids
    // are derived at render time).
    async submitVideoForMember(input: MemberVideoInput): Promise<MemberUploadResult> {
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

      transaction(() => {
        media.insertMemberVideo.run(
          mediaId, now, now,
          input.memberId, input.caption, now,
          input.videoPlatform, videoId, input.videoUrl, thumbnailUrl,
        );
        if (normalizedExternalUrl !== null) {
          media.setMediaItemExternalUrl.run(normalizedExternalUrl, now, mediaId);
        }
        applyTagsForMember(mediaId, input.slug, input.tags, now);
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
  function validateGalleryUpdates(updates: CuratorGalleryUpdates): {
    name: string;
    description: string;
    sortOrder: GallerySortOrderValue;
    criteriaTags: string[];
    excludeTags: string[];
  } {
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
    // The >=1 criteria invariant is enforced by createGallery/updateGallery
    // AFTER the system auto-prepends `#by_<owner_slug>`, so an empty
    // user-supplied criteriaTags is acceptable here for member-owned
    // galleries (the auto-prepend always supplies at least one).
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
    return {
      name,
      description,
      sortOrder,
      criteriaTags: updates.criteriaTags,
      excludeTags: updates.excludeTags,
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

  // Writes (or rewrites) the JSON sidecar for an FH-owned gallery.
  // Sidecar I/O happens AFTER the DB transaction commits; failure here
  // is logged but does not propagate, so a transient FS error never
  // corrupts a successful DB-side edit. The seeder reconciles on next
  // run.
  async function writeFhGallerySidecar(data: GallerySidecarData): Promise<void> {
    try {
      validateGallerySidecarData(data);
      await writeGallerySidecarFile(curatedRootDir, data);
    } catch (err) {
      console.warn(
        `[curatorMediaService] sidecar write failed for ${data.id}: ${(err as Error).message}`,
      );
    }
  }
}
