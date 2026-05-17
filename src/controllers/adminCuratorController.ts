import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { logger } from '../config/logger';
// `getMediaStorageAdapter` is imported here for the two direct-storage call
// sites (`generatePresignedPutUrl`, `exists`) used by the async video-upload
// flow. Service wiring goes through `getDefaultCuratorMediaService` so the
// controller does not own adapter selection for the main paths.
// Current: two raw-adapter calls remain in the controller for the sign and
//   finalize endpoints (presigned PUT URL generation and S3 existence check).
// Target: wrap both in a curatorMediaService method so the controller touches
//   no adapter directly.
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  PHOTO_MAX_BYTES,
  VIDEO_MAX_BYTES,
  POSTER_MAX_BYTES,
  isValidCategoryName,
  buildExternalLinkSlots,
  type CuratorMediaEditInput,
} from '../services/curatorMediaService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderServiceUnavailable } from '../lib/controllerErrors';
import {
  parseExternalLinkInputs,
  parseGalleryMultipart,
} from './galleryFormHelpers';
import { detectImageType } from '../lib/imageProcessing';
import { getMediaJobService } from '../services/mediaJobService';
import { subscribeToJobEvents } from '../services/jobEventBus';
import {
  getTranscodeDispatchClient,
  TranscodeDispatchError,
} from '../services/transcodeDispatchClient';
import { config } from '../config/env';
import { randomUUID } from 'node:crypto';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

type MediaSavedSubKind = 'create' | 'edit' | 'delete' | 'upload';

function readMediaSavedFlag(req: Request, res: Response): MediaSavedSubKind | null {
  const flash = readFlash(req);
  if (flash?.kind !== FLASH_KIND.MEDIA_SAVED) return null;
  clearFlash(res);
  const p = flash.payload;
  if (p === 'create' || p === 'edit' || p === 'delete' || p === 'upload') return p;
  return null;
}

const ALLOWED_VIDEO_CONTENT_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_POSTER_CONTENT_TYPES = new Set(['image/jpeg', 'image/png']);

function videoExtFor(contentType: string): string {
  if (contentType === 'video/mp4') return 'mp4';
  if (contentType === 'video/webm') return 'webm';
  if (contentType === 'video/quicktime') return 'mov';
  return 'bin';
}

function posterExtFor(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  return 'bin';
}

const LIST_PAGE_SIZE = 50;

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
}

const buildSvc = getDefaultCuratorMediaService;

// Busboy enforces a single per-file ceiling on the multipart endpoint.
// In S3-adapter mode the endpoint serves photos + URL-references only
// (video upload uses the async sign + PUT + finalize flow), for which
// PHOTO_MAX_BYTES would suffice. In local-adapter mode the endpoint also
// accepts video + poster as a sync multipart submit (the /curated/-first
// dev authoring path), so the cap must accommodate VIDEO_MAX_BYTES.
// The service layer enforces per-type caps inside uploadPhoto / uploadVideo;
// busboy is just a back-stop. The same constant is used in both modes for
// uniformity; oversized photos in S3 mode are rejected by the service, not busboy.
const PER_FILE_LIMIT = VIDEO_MAX_BYTES;

interface FormValues {
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
  tier?: string;
  externalUrl?: string;
}

function renderForm(
  res: Response,
  opts: {
    errorMessage?: string;
    formValues?: FormValues;
    existingCategories?: string[];
    savedFlag?: 'upload' | null;
  } = {},
): void {
  // In S3 mode the form opts into the async sign + S3 PUT + finalize flow
  // for video (browser PUTs bytes directly to S3, bypassing nginx). In local
  // mode video uploads submit as standard multipart and the service writes
  // the source bytes plus a sidecar to /curated/{category}/ so the upload
  // survives DB and media-store wipes.
  const asyncEnabled = config.mediaStorageAdapter === 's3';
  res.render('admin/curator/upload', {
    seo: { title: 'Upload Curated Media' },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Upload Curated Media' },
    errorMessage: opts.errorMessage,
    formValues: opts.formValues ?? {},
    existingCategories: opts.existingCategories ?? [],
    savedFlag: opts.savedFlag ?? null,
    asyncEnabled,
    requireCategory: !asyncEnabled,
  });
}

// Resolves the form's mutually-exclusive category fields into a single
// validated category name. Returns either `{ category }` for the caller
// to use, or `{ errorMessage }` to render at 422. Shared by the photo,
// video, and url_reference branches of postUpload because all three need
// the same rules in local-adapter mode.
function resolveCategoryFromForm(
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

export const adminCuratorController = {
  async getUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const svc = buildSvc();
      const existingCategories = await svc.listExistingCategories();
      const savedFlag = readMediaSavedFlag(req, res) === 'upload' ? 'upload' : null;
      renderForm(res, { existingCategories, savedFlag });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/curator/upload — accept multipart upload.
   *
   * Branches on the `mediaType` text field. Per-file size enforced by Busboy
   * via `limits.fileSize`; service-layer validates per-type size, magic
   * bytes, caption length, and tag shape.
   */
  postUpload(req: Request, res: Response, next: NextFunction): void {
    const adminMemberId = req.user!.userId;

    const fields: Record<string, string> = {};
    const fileBuffers: Record<string, Buffer> = {};
    const fileFilenames: Record<string, string> = {};
    let limitExceeded = false;

    const busboy = Busboy({
      headers: req.headers,
      // files: 4 — the tabbed form has `mediaFile` inputs in BOTH the
      // photo panel and the video panel (same name, distinct DOM nodes).
      // Browsers submit a file part for every file input, even empty ones;
      // a video upload thus arrives as three file parts (empty mediaFile
      // from the photo panel + real mediaFile from the video panel +
      // poster). Capping at 2 silently dropped the poster. 4 has headroom
      // for the 3 expected parts without admitting genuinely abusive
      // multi-file submissions.
      // fields: 24 — the upload form posts up to 12 non-file fields today
      // (mediaType, newCategory, videoPlatform, videoUrl, primarySlug,
      // title, creator, sourceId, tier, caption, tags, externalUrl). The
      // cap was previously 10, which silently dropped the trailing fields
      // on the wire (busboy emits no warning when truncating). 24 leaves
      // headroom for near-term form additions without re-tuning.
      limits: { fileSize: PER_FILE_LIMIT, files: 4, fields: 24 },
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('file', (name, stream, info) => {
      const chunks: Buffer[] = [];
      if (info && typeof info.filename === 'string' && info.filename.length > 0) {
        fileFilenames[name] = info.filename;
      }
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        limitExceeded = true;
      });
      stream.on('end', () => {
        if (!limitExceeded) {
          fileBuffers[name] = Buffer.concat(chunks);
        }
      });
    });

    busboy.on('finish', () => {
      void handleFinish().catch((err: unknown) => {
        if (err instanceof ValidationError) {
          renderForm(res.status(422), {
            errorMessage: err.message,
            formValues: { mediaType: fields.mediaType, caption: fields.caption, tags: fields.tags },
          });
          return;
        }
        if (err instanceof ImageProcessingError) {
          logger.error('admin upload: image worker unavailable', {
            error: err.message,
            status: err.status,
          });
          renderServiceUnavailable(res);
          return;
        }
        logger.error('admin upload error', { error: err instanceof Error ? err.message : String(err) });
        next(err);
      });
    });

    busboy.on('error', (err: Error) => {
      logger.error('busboy parse error', { error: err.message });
      next(err);
    });

    async function handleFinish(): Promise<void> {
      const mediaType = fields.mediaType;
      const captionRaw = (fields.caption ?? '').trim();
      const caption = captionRaw.length === 0 ? null : captionRaw;
      const tags = (fields.tags ?? '')
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      // External URL: empty string -> null; trimmed value -> service-side validation.
      // Validation lives in the service; the controller only normalises the empty-string sentinel.
      const externalUrlRaw = (fields.externalUrl ?? '').trim();
      const externalUrl: string | null = externalUrlRaw.length === 0 ? null : externalUrlRaw;
      const formValues: FormValues = {
        mediaType,
        caption: fields.caption ?? '',
        tags: fields.tags ?? '',
        category: fields.category ?? '',
        newCategory: fields.newCategory ?? '',
        videoUrl: fields.videoUrl ?? '',
        videoPlatform: fields.videoPlatform ?? '',
        primarySlug: fields.primarySlug ?? '',
        title: fields.title ?? '',
        creator: fields.creator ?? '',
        sourceId: fields.sourceId ?? '',
        tier: fields.tier ?? '',
        externalUrl: fields.externalUrl ?? '',
      };

      const svc = getDefaultCuratorMediaService();
      const existingCategories = await svc.listExistingCategories();

      if (limitExceeded) {
        renderForm(res.status(422), {
          errorMessage: 'File exceeded the maximum allowed size.',
          formValues,
          existingCategories,
        });
        return;
      }

      if (mediaType !== 'photo' && mediaType !== 'video' && mediaType !== 'url_reference') {
        renderForm(res.status(422), {
          errorMessage: 'Choose a media type (photo, video, or url_reference).',
          formValues,
          existingCategories,
        });
        return;
      }

      if (mediaType === 'url_reference') {
        const videoUrl = (fields.videoUrl ?? '').trim();
        const videoPlatformRaw = (fields.videoPlatform ?? '').trim();
        const primarySlug = (fields.primarySlug ?? '').trim().toLowerCase();
        const titleRaw = (fields.title ?? '').trim();
        const title = titleRaw.length === 0 ? null : titleRaw;
        const creatorRaw = (fields.creator ?? '').trim();
        const creator = creatorRaw.length === 0 ? null : creatorRaw;
        const sourceIdRaw = (fields.sourceId ?? '').trim();
        const sourceId = sourceIdRaw.length === 0 ? null : sourceIdRaw;
        const tierRaw = (fields.tier ?? '').trim();
        const tier = tierRaw.length === 0 ? null : tierRaw;

        if (videoPlatformRaw !== 'youtube' && videoPlatformRaw !== 'vimeo') {
          renderForm(res.status(422), { errorMessage: 'Choose YouTube or Vimeo.', formValues, existingCategories });
          return;
        }
        if (videoUrl.length === 0) {
          renderForm(res.status(422), { errorMessage: 'Paste a YouTube or Vimeo URL.', formValues, existingCategories });
          return;
        }
        if (primarySlug.length === 0) {
          renderForm(res.status(422), { errorMessage: 'Provide a primary slug for the sidecar filename.', formValues, existingCategories });
          return;
        }
        const categoryResult = resolveCategoryFromForm(fields);
        if ('errorMessage' in categoryResult) {
          renderForm(res.status(422), { errorMessage: categoryResult.errorMessage, formValues, existingCategories });
          return;
        }

        try {
          await svc.uploadUrlReference({
            adminMemberId,
            category: categoryResult.category,
            videoUrl,
            videoPlatform: videoPlatformRaw,
            primarySlug,
            title,
            creator,
            sourceId,
            tier,
            startSeconds: null,
            endSeconds: null,
            tags,
            ...(externalUrl !== null && { externalUrl }),
          });
        } catch (err) {
          if (err instanceof ValidationError) {
            renderForm(res.status(422), { errorMessage: err.message, formValues, existingCategories });
            return;
          }
          throw err;
        }
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
        res.redirect(303, '/admin/curator/upload');
        return;
      }

      const sourceFilename = fileFilenames.mediaFile ?? '';

      // Photo + video: in local-adapter mode the upload writes to
      // /curated/{category}/ as the durable source of truth, plus an inline
      // storage.put + media_items insert as a read-path cache. In S3-adapter
      // mode the upload writes direct to S3 + DB; no /curated/ involvement.
      // Category is required in local mode (picks the /curated/ subdir); ignored in S3 mode.
      const localCuratedMode = config.mediaStorageAdapter === 'local';
      let resolvedCategoryForBinary: string | undefined;
      if (localCuratedMode) {
        const categoryResult = resolveCategoryFromForm(fields);
        if ('errorMessage' in categoryResult) {
          renderForm(res.status(422), { errorMessage: categoryResult.errorMessage, formValues, existingCategories });
          return;
        }
        resolvedCategoryForBinary = categoryResult.category;
      }

      if (mediaType === 'photo') {
        const photoBuffer = fileBuffers.mediaFile;
        if (!photoBuffer || photoBuffer.length === 0) {
          renderForm(res.status(422), { errorMessage: 'Please select a photo to upload.', formValues, existingCategories });
          return;
        }
        try {
          await svc.uploadPhoto({
            adminMemberId,
            photoBuffer,
            sourceFilename,
            caption,
            tags,
            ...(resolvedCategoryForBinary && { category: resolvedCategoryForBinary }),
            ...(externalUrl !== null && { externalUrl }),
          });
        } catch (err) {
          if (err instanceof ValidationError) {
            renderForm(res.status(422), { errorMessage: err.message, formValues, existingCategories });
            return;
          }
          throw err;
        }
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
        res.redirect(303, '/admin/curator/upload');
        return;
      }

      // mediaType === 'video'
      if (!localCuratedMode) {
        // S3-adapter mode: synchronous multipart video upload is
        // unavailable. Video bytes flow browser → S3 (presigned PUT) →
        // /finalize → worker per DD §6.8. The async path requires
        // JavaScript; the noscript banner on the form warns about that.
        // A request landing here means JS was off or failed to load.
        // 410 Gone is the right code: the sync video endpoint is
        // permanently removed for S3-mode environments. The operator-run
        // curator seeding script still calls uploadVideo directly (not
        // through HTTP), and local-mode dev uses the branch below.
        renderForm(res.status(410), {
          errorMessage:
            'Synchronous video upload via this form is disabled in this environment. Enable JavaScript and reload the page; video uploads run as background transcode jobs.',
          formValues,
          existingCategories,
        });
        return;
      }

      // Local-adapter mode video sync upload. Bytes arrive over multipart,
      // the service writes the source binary + poster + sidecar under
      // /curated/{category}/, and the inline transcoded copy lands in the
      // local media store so the dev gallery reflects the upload
      // immediately. Direct multipart of large videos is acceptable here
      // because dev runs against localhost (no nginx/CloudFront in the
      // path).
      const videoBuffer = fileBuffers.mediaFile;
      const posterBuffer = fileBuffers.poster;
      if (!videoBuffer || videoBuffer.length === 0) {
        renderForm(res.status(422), { errorMessage: 'Please select a video to upload.', formValues, existingCategories });
        return;
      }
      if (!posterBuffer || posterBuffer.length === 0) {
        renderForm(res.status(422), { errorMessage: 'Please select a poster image for the video.', formValues, existingCategories });
        return;
      }
      try {
        await svc.uploadVideo({
          adminMemberId,
          videoBuffer,
          posterBuffer,
          sourceFilename,
          caption,
          tags,
          ...(resolvedCategoryForBinary && { category: resolvedCategoryForBinary }),
          ...(externalUrl !== null && { externalUrl }),
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          renderForm(res.status(422), { errorMessage: err.message, formValues, existingCategories });
          return;
        }
        throw err;
      }
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
      res.redirect(303, '/admin/curator/upload');
    }

    req.pipe(busboy);
  },

  getList(req: Request, res: Response, next: NextFunction): void {
    try {
      const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const tagFilterRaw = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
      const tagFilter = tagFilterRaw.length > 0 ? tagFilterRaw : undefined;
      // Sort: closed enum mirrored from CuratorMediaListInput.sort. Unknown
      // values silently fall back to date_desc; sort is a UX preference, not
      // a contract violation worth a 422.
      const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : '';
      const sort: 'date_desc' | 'date_asc' | 'type_asc' | 'caption_asc' =
        sortRaw === 'date_asc' || sortRaw === 'type_asc' || sortRaw === 'caption_asc'
          ? sortRaw
          : 'date_desc';
      const savedFlagRaw = readMediaSavedFlag(req, res);
      const savedFlag = savedFlagRaw === 'edit' || savedFlagRaw === 'delete' ? savedFlagRaw : null;

      const svc = buildSvc();
      const result = svc.listMedia({ page, pageSize: LIST_PAGE_SIZE, tagFilter, sort });

      const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
      // Pagination links preserve both tag + sort.
      const queryTail = (p: number): string => {
        const parts = [`page=${p}`];
        if (tagFilter) parts.push(`tag=${encodeURIComponent(tagFilter)}`);
        if (sort !== 'date_desc') parts.push(`sort=${sort}`);
        return '?' + parts.join('&');
      };
      const prevPageHref = result.page > 1
        ? '/admin/curator/media' + queryTail(result.page - 1)
        : null;
      const nextPageHref = result.page < totalPages
        ? '/admin/curator/media' + queryTail(result.page + 1)
        : null;

      // Per-column sort links for the view. Each link toggles to the next
      // logical sort when clicked: clicking the active Uploaded column
      // toggles desc <-> asc; the other columns reset to their canonical
      // ascending sort. Tag filter is preserved.
      const sortLinkBase = '/admin/curator/media';
      const sortQuery = (s: string): string => {
        const parts: string[] = [];
        if (tagFilter) parts.push(`tag=${encodeURIComponent(tagFilter)}`);
        if (s !== 'date_desc') parts.push(`sort=${s}`);
        return parts.length === 0 ? sortLinkBase : `${sortLinkBase}?${parts.join('&')}`;
      };
      const sortLinks = {
        date: sortQuery(sort === 'date_desc' ? 'date_asc' : 'date_desc'),
        type: sortQuery('type_asc'),
        caption: sortQuery('caption_asc'),
      };
      const sortIndicator = {
        date: sort === 'date_desc' ? 'desc' : sort === 'date_asc' ? 'asc' : null,
        type: sort === 'type_asc' ? 'asc' : null,
        caption: sort === 'caption_asc' ? 'asc' : null,
      };

      res.render('admin/curator/list', {
        seo: { title: 'Curated Media' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_list', title: 'Curated Media' },
        items: result.items,
        total: result.total,
        currentPage: result.page,
        totalPages,
        tagFilter: tagFilter ?? '',
        sort,
        sortLinks,
        sortIndicator,
        prevPageHref,
        nextPageHref,
        emptyState: result.items.length === 0,
        savedFlag,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('errors/form-error', {
          seo: { title: 'Invalid Request' },
          page: { sectionKey: 'admin', pageKey: 'admin_curator_list_error', title: 'Invalid Request' },
          statusCode: 422,
          errorMessage: err.message,
          backHref: '/admin/curator/media',
        });
        return;
      }
      next(err);
    }
  },

  async getEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mediaId = req.params.id;
      const svc = buildSvc();
      const item = await svc.getMediaItem(mediaId);
      if (!item) {
        res.status(404).render('admin/curator/edit', {
          seo: { title: 'Curated Media — Not Found' },
          page: { sectionKey: 'admin', pageKey: 'admin_curator_edit', title: 'Curated Media — Not Found' },
          notFound: true,
          mediaId,
        });
        return;
      }
      // Filter #curated from the editable tag display since it is auto-applied
      // and cannot be edited; show user-meaningful tags only.
      const editableTags = item.tags.filter((t) => t !== '#curated');
      const isSidecarBacked = item.videoPlatform === 'youtube' || item.videoPlatform === 'vimeo';
      res.render('admin/curator/edit', {
        seo: { title: 'Edit Curated Media' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_edit', title: 'Edit Curated Media' },
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
          tier: item.tier ?? '',
          startSeconds: item.startSeconds ?? '',
          endSeconds: item.endSeconds ?? '',
          externalUrl: item.externalUrl ?? '',
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async postEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mediaId = req.params.id;
      const adminMemberId = req.user!.userId;
      const captionRaw = (req.body?.caption ?? '').trim();
      const caption = captionRaw.length === 0 ? null : captionRaw;
      const tags = parseTagsField(req.body?.tags);

      // URL-ref sidecar fields. Sent as form inputs from the edit page;
      // empty string is treated as null (clears the sidecar field).
      // Service ignores these on DB-direct rows.
      const editInput: CuratorMediaEditInput = { adminMemberId, mediaId, caption, tags };
      const trimToNull = (v: unknown): string | null => {
        if (typeof v !== 'string') return null;
        const t = v.trim();
        return t.length === 0 ? null : t;
      };
      const parseIntOrNull = (v: unknown): number | null => {
        if (typeof v !== 'string') return null;
        const t = v.trim();
        if (t.length === 0) return null;
        const n = parseInt(t, 10);
        return Number.isFinite(n) ? n : null;
      };
      if (req.body?.creator !== undefined) editInput.creator = trimToNull(req.body.creator);
      if (req.body?.sourceId !== undefined) editInput.sourceId = trimToNull(req.body.sourceId);
      if (req.body?.tier !== undefined) editInput.tier = trimToNull(req.body.tier);
      if (req.body?.thumbnailUrl !== undefined) editInput.thumbnailUrl = trimToNull(req.body.thumbnailUrl);
      if (req.body?.startSeconds !== undefined) editInput.startSeconds = parseIntOrNull(req.body.startSeconds);
      if (req.body?.endSeconds !== undefined) editInput.endSeconds = parseIntOrNull(req.body.endSeconds);
      if (req.body?.externalUrl !== undefined) editInput.externalUrl = trimToNull(req.body.externalUrl);

      const svc = buildSvc();
      try {
        await svc.editMedia(editInput);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('admin/curator/edit', {
            seo: { title: 'Curated Media — Not Found' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_edit', title: 'Curated Media — Not Found' },
            notFound: true,
            mediaId,
          });
          return;
        }
        if (err instanceof ValidationError) {
          res.status(422).render('admin/curator/edit', {
            seo: { title: 'Edit Curated Media' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_edit', title: 'Edit Curated Media' },
            errorMessage: err.message,
            media: {
              mediaId,
              mediaType: 'photo' as const,
              caption: req.body?.caption ?? '',
              tagsString: req.body?.tags ?? '',
              thumbnailUrl: '',
            },
          });
          return;
        }
        throw err;
      }
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
      res.redirect(303, '/admin/curator/media');
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/curator/galleries — list FH-owned named galleries. */
  getGalleryList(req: Request, res: Response, next: NextFunction): void {
    try {
      const savedFlag = readMediaSavedFlag(req, res);
      const svc = buildSvc();
      const items = svc.listOwnedGalleries();
      res.render('admin/curator/galleries/list', {
        seo: { title: 'Curator Galleries' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_list', title: 'Curator Galleries' },
        items,
        emptyState: items.length === 0,
        savedFlag,
      });
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/curator/galleries/new — render new-gallery form. */
  getGalleryNew(req: Request, res: Response): void {
    res.render('admin/curator/galleries/new', {
      seo: { title: 'New Curator Gallery' },
      page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_new', title: 'New Curator Gallery' },
      formAction: '/admin/curator/galleries',
      gallery: { idSlug: '', name: '', description: '', sortOrder: 'upload_desc', criteriaTagsString: '', excludeTagsString: '' },
    });
  },

  /** POST /admin/curator/galleries — create FH-owned gallery. */
  async postGalleryCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorMemberId = req.user!.userId;
      const slug = String(req.body?.idSlug ?? '').trim();
      const suggestedId = slug ? `gallery_${slug}` : '';
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagsField(req.body?.criteriaTags);
      const excludeTags = parseTagsField(req.body?.excludeTags);

      const svc = buildSvc();
      try {
        await svc.createGallery({
          actorMemberId,
          actorIsAdmin: true,
          ownerMemberId: svc.getSystemMemberId(),
          suggestedId,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags },
        });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'create');
        res.redirect(303, '/admin/curator/galleries');
        return;
      } catch (err) {
        if (err instanceof ValidationError || err instanceof ConflictError) {
          res.status(422).render('admin/curator/galleries/new', {
            seo: { title: 'New Curator Gallery' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_new', title: 'New Curator Gallery' },
            formAction: '/admin/curator/galleries',
            errorMessage: err.message,
            gallery: {
              idSlug: slug,
              name,
              description,
              sortOrder: sortOrderRaw,
              criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
              excludeTagsString: (req.body?.excludeTags ?? '') as string,
            },
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/curator/galleries/:id/edit — render the gallery edit form. */
  getGalleryEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const galleryId = req.params.id;
      const svc = buildSvc();
      try {
        const g = svc.getGalleryForEdit(galleryId);
        const currentItems = g.currentItems.map((item) => ({
          ...item,
          editHref: `/admin/curator/media/${item.mediaId}/edit`,
        }));
        res.render('admin/curator/galleries/edit', {
          seo: { title: 'Edit Curator Gallery' },
          page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Edit Curator Gallery' },
          formAction: `/admin/curator/galleries/${galleryId}/edit`,
          gallery: {
            id: g.id,
            name: g.name,
            description: g.description,
            sortOrder: g.sortOrder,
            criteriaTagsString: g.criteriaTags.join(' '),
            excludeTagsString: g.excludeTags.join(' '),
          },
          currentItems,
          uploadTags: g.criteriaTags.join(' '),
          externalLinkSlots: buildExternalLinkSlots(null, g.externalLinks),
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('admin/curator/galleries/edit', {
            seo: { title: 'Curator Gallery — Not Found' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Curator Gallery — Not Found' },
            notFound: true,
            galleryId,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/curator/galleries/:id/edit — apply gallery edit. Multipart
   * supported so the shared form's optional photo-upload widget can ride
   * along; uploaded files are routed through `uploadPhoto` (FH-owned) and
   * receive `#curated` automatically plus user-supplied `uploadTags`. */
  async postGalleryEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.is('multipart/form-data')) {
      handleCuratorGalleryEditMultipart(req, res, next);
      return;
    }
    try {
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagsField(req.body?.criteriaTags);
      const excludeTags = parseTagsField(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});

      const svc = buildSvc();
      try {
        await svc.updateGallery({
          actorMemberId,
          actorIsAdmin: true,
          galleryId,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('admin/curator/galleries/edit', {
            seo: { title: 'Curator Gallery — Not Found' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Curator Gallery — Not Found' },
            notFound: true,
            galleryId,
          });
          return;
        }
        if (err instanceof ValidationError) {
          renderCuratorGalleryEditError(res, 422, err.message, {
            galleryId,
            name,
            description,
            sortOrderRaw,
            criteriaTagsRaw: (req.body?.criteriaTags ?? '') as string,
            excludeTagsRaw: (req.body?.excludeTags ?? '') as string,
            uploadTagsRaw: '',
            externalLinks,
            fieldErrors: err.fieldErrors,
          });
          return;
        }
        throw err;
      }
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
      res.redirect(303, '/admin/curator/galleries');
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/curator/galleries/:id/delete — hard-delete FH gallery + sidecar. */
  async postGalleryDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const svc = buildSvc();
      try {
        await svc.deleteGallery({
          actorMemberId,
          actorIsAdmin: true,
          galleryId,
        });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'delete');
        res.redirect(303, '/admin/curator/galleries');
        return;
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('admin/curator/galleries/edit', {
            seo: { title: 'Curator Gallery — Not Found' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Curator Gallery — Not Found' },
            notFound: true,
            galleryId,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/curator/media/:id/delete — hard delete + S3 cleanup. */
  async postDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mediaId = req.params.id;
      const adminMemberId = req.user!.userId;
      const svc = buildSvc();
      try {
        await svc.deleteMedia({ adminMemberId, mediaId });
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('errors/not-found', {
            seo: { title: 'Page Not Found' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_media_not_found', title: 'Curator media not found' },
          });
          return;
        }
        throw err;
      }
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'delete');
      res.redirect(303, '/admin/curator/media');
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/curator/upload/sign  (DD §6.8 async curator video upload)
   *
   * The admin browser, after picking a video + poster + caption + tags, calls
   * this endpoint to get presigned PUT URLs. The browser then PUTs the bytes
   * directly to S3 (bypassing nginx and CloudFront for the body) and finally
   * POSTs /finalize with the jobId. This handler creates the media_jobs row
   * in 'pending_upload' state and returns the URLs.
   *
   * Validates per-type size and content-type before issuing URLs. The browser-
   * supplied size is a hint; the worker-side finalize re-checks the actual S3
   * object size at HEAD time before transcoding.
   */
  async postSignUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminMemberId = req.user!.userId;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const videoFilename = String(body.videoFilename ?? '').trim();
      const videoContentType = String(body.videoContentType ?? '').trim();
      const videoSizeBytes = Number(body.videoSizeBytes);
      const posterContentType = String(body.posterContentType ?? '').trim();
      const posterSizeBytes = Number(body.posterSizeBytes);
      const caption = body.caption ? String(body.caption).trim() : '';
      const tags = String(body.tags ?? '');

      if (!videoFilename) {
        res.status(400).json({ error: 'videoFilename required' });
        return;
      }
      if (!ALLOWED_VIDEO_CONTENT_TYPES.has(videoContentType)) {
        res.status(400).json({ error: 'Only MP4, WebM, and MOV videos are accepted.' });
        return;
      }
      if (!ALLOWED_POSTER_CONTENT_TYPES.has(posterContentType)) {
        res.status(400).json({ error: 'Poster must be a JPEG or PNG image.' });
        return;
      }
      if (!Number.isInteger(videoSizeBytes) || videoSizeBytes <= 0) {
        res.status(400).json({ error: 'videoSizeBytes must be a positive integer.' });
        return;
      }
      if (videoSizeBytes > VIDEO_MAX_BYTES) {
        res.status(400).json({ error: 'Video is too large. Maximum size is 150 MB.' });
        return;
      }
      if (!Number.isInteger(posterSizeBytes) || posterSizeBytes <= 0) {
        res.status(400).json({ error: 'posterSizeBytes must be a positive integer.' });
        return;
      }
      if (posterSizeBytes > POSTER_MAX_BYTES) {
        res.status(400).json({ error: 'Poster is too large. Maximum size is 25 MB.' });
        return;
      }

      const jobId = `mediajob_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const prefix = config.mediaPendingUploadPrefix;
      const sourceVideoKey = `${prefix}${jobId}/source.${videoExtFor(videoContentType)}`;
      const sourcePosterKey = `${prefix}${jobId}/poster.${posterExtFor(posterContentType)}`;
      const ttl = config.mediaPresignedPutTtlSeconds;
      const expiresAtIso = new Date(Date.now() + ttl * 1000).toISOString();

      const storage = getMediaStorageAdapter();
      const [videoUrl, posterUrl] = await Promise.all([
        storage.generatePresignedPutUrl(sourceVideoKey, videoContentType, ttl),
        storage.generatePresignedPutUrl(sourcePosterKey, posterContentType, ttl),
      ]);

      getMediaJobService().createPendingUploadJob({
        jobId,
        kind: 'curator_video',
        adminMemberId,
        sourceVideoKey,
        sourcePosterKey,
        caption: caption.length === 0 ? null : caption,
        tags,
        sourceFilename: videoFilename,
        expiresAtIso,
      });

      res.json({ jobId, videoUrl, posterUrl, expiresAtIso });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/curator/upload/finalize
   *
   * Browser calls this after both presigned PUTs complete. We verify both
   * source keys exist in S3, transition the row to 'pending_transcode', and
   * push the dispatch to the worker container. Returns the status-page URL
   * the browser should redirect to.
   *
   * Idempotent: a duplicate call after pending_transcode logs and returns
   * success rather than 409, so a transient browser retry doesn't error.
   */
  async postFinalizeUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminMemberId = req.user!.userId;
      const jobId = String((req.body as Record<string, unknown> | undefined)?.jobId ?? '').trim();
      if (!jobId) {
        res.status(400).json({ error: 'jobId required' });
        return;
      }

      const job = getMediaJobService().getJobForAdmin(jobId, adminMemberId);
      if (!job) {
        // Anti-enumeration: not-found and not-owned look the same.
        res.status(404).json({ error: 'job not found' });
        return;
      }
      if (!job.source_video_key || !job.source_poster_key) {
        res.status(409).json({ error: 'job has no source keys' });
        return;
      }

      const storage = getMediaStorageAdapter();
      const [videoExists, posterExists] = await Promise.all([
        storage.exists(job.source_video_key),
        storage.exists(job.source_poster_key),
      ]);
      if (!videoExists || !posterExists) {
        res.status(409).json({ error: 'source files have not been uploaded yet' });
        return;
      }

      try {
        getMediaJobService().markPendingTranscode(jobId, adminMemberId);
      } catch (err) {
        if (err instanceof ConflictError) {
          // Already past pending_upload; treat as idempotent success and
          // re-dispatch (worker dispatch is itself idempotent because
          // claimForProcessing only succeeds when state=pending_transcode).
          logger.info('finalize: job already past pending_upload', {
            jobId,
            currentState: job.state,
          });
        } else {
          throw err;
        }
      }

      try {
        await getTranscodeDispatchClient().dispatch(jobId);
      } catch (err) {
        if (err instanceof TranscodeDispatchError) {
          logger.error('finalize: worker dispatch failed', {
            jobId,
            error: err.message,
            status: err.status,
          });
          res.status(502).json({ error: 'worker dispatch failed' });
          return;
        }
        throw err;
      }

      res.json({
        jobId,
        statusUrl: `/admin/curator/upload/jobs/${encodeURIComponent(jobId)}`,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/curator/upload/jobs/:jobId
   *
   * Server-side render of the current media_jobs row state. The browser then
   * opens an SSE stream at /events for live updates. Anti-enumeration: jobs
   * owned by another admin return 404 (same response as a job that does not
   * exist), so existence cannot be probed.
   */
  getJobStatus(req: Request, res: Response, next: NextFunction): void {
    try {
      const adminMemberId = req.user!.userId;
      const jobId = req.params.jobId;
      const job = getMediaJobService().getJobForAdmin(jobId, adminMemberId);
      if (!job) {
        res.status(404).render('admin/curator/job-status', {
          seo: { title: 'Curator Upload — Not Found' },
          page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Curator Upload — Not Found' },
          notFound: true,
          jobId,
        });
        return;
      }
      res.render('admin/curator/job-status', {
        seo: { title: 'Curator Upload Progress' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Curator Upload Progress' },
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
        },
        eventsUrl: `/admin/curator/upload/jobs/${encodeURIComponent(job.id)}/events`,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/curator/upload/jobs/:jobId/events
   *
   * Server-Sent Events stream pushing media-job state transitions to the
   * admin's status page. The page first sees the current state (sent
   * immediately as an SSE event so refreshes work), then live updates as the
   * worker transitions the row. Heartbeat every config.sseHeartbeatSeconds
   * keeps nginx and CloudFront from idle-killing the connection during long
   * transcodes.
   *
   * Cleanup is unconditional: req.on('close') unsubscribes from the bus and
   * clears the heartbeat timer regardless of why the connection ended.
   */
  streamJobEvents(req: Request, res: Response, _next: NextFunction): void {
    const adminMemberId = req.user!.userId;
    const jobId = req.params.jobId;
    const job = getMediaJobService().getJobForAdmin(jobId, adminMemberId);
    if (!job) {
      res.status(404).end();
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Hint to nginx (when present) to flush each chunk; the nginx config
      // for this route also sets `proxy_buffering off`, but the header is
      // honored even outside that context.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    function writeSse(eventName: string, data: unknown): void {
      try {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Connection closed underneath us; cleanup() will run via 'close'.
      }
    }

    // Initial snapshot so a refresh past the live events still shows state.
    writeSse('state', {
      state: job.state,
      mediaId: job.media_id,
      errorMessage: job.last_error,
    });

    const unsubscribe = subscribeToJobEvents(jobId, (event) => {
      writeSse('state', {
        state: event.state,
        mediaId: event.mediaId ?? null,
        errorMessage: event.errorMessage ?? null,
      });
    });

    const heartbeat = setInterval(() => {
      writeSse('heartbeat', { ts: new Date().toISOString() });
    }, config.sseHeartbeatSeconds * 1000);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on('close', cleanup);
  },
};

// ── Curator-gallery edit error rerender + multipart handler ─────────────
// Both helpers serve the FH-owned `/admin/curator/galleries/:id/edit` POST
// path so the form can submit either text-encoded or multipart/form-data
// (the latter is required when a file is attached for the optional
// upload widget).

interface CuratorGalleryEditErrorContext {
  galleryId: string;
  name: string;
  description: string;
  sortOrderRaw: string;
  criteriaTagsRaw: string;
  excludeTagsRaw: string;
  uploadTagsRaw: string;
  externalLinks: ReturnType<typeof parseExternalLinkInputs>;
  fieldErrors?: Record<string, string>;
}

function renderCuratorGalleryEditError(
  res: Response,
  status: number,
  errorMessage: string,
  ctx: CuratorGalleryEditErrorContext,
): void {
  let currentItems: Array<{ mediaId: string; thumbnailUrl: string; caption: string | null; sourceFilename: string; mediaType: 'photo' | 'video'; editHref: string }> = [];
  try {
    const reread = buildSvc().getGalleryForEdit(ctx.galleryId);
    currentItems = reread.currentItems.map((item) => ({
      ...item,
      editHref: `/admin/curator/media/${item.mediaId}/edit`,
    }));
  } catch {
    /* gallery may have been deleted concurrently; render with empty items */
  }
  res.status(status).render('admin/curator/galleries/edit', {
    seo: { title: 'Edit Curator Gallery' },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Edit Curator Gallery' },
    formAction: `/admin/curator/galleries/${ctx.galleryId}/edit`,
    errorMessage,
    fieldErrors: ctx.fieldErrors,
    gallery: {
      id: ctx.galleryId,
      name: ctx.name,
      description: ctx.description,
      sortOrder: ctx.sortOrderRaw,
      criteriaTagsString: ctx.criteriaTagsRaw,
      excludeTagsString: ctx.excludeTagsRaw,
    },
    currentItems,
    uploadTags: ctx.uploadTagsRaw,
    externalLinkSlots: buildExternalLinkSlots(ctx.externalLinks, [], ctx.fieldErrors),
  });
}

function handleCuratorGalleryEditMultipart(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const galleryId = req.params.id;
  parseGalleryMultipart(
    req,
    (parsed) => {
      void executeCuratorGalleryEditMultipart({
        req, res, galleryId, ...parsed,
      }).catch((err: unknown) => {
        logger.error('curator gallery multipart edit error', {
          error: err instanceof Error ? err.message : String(err),
        });
        next(err);
      });
    },
    (err) => {
      logger.error('busboy parse error', { error: err.message });
      next(err);
    },
  );
}

async function executeCuratorGalleryEditMultipart(args: {
  req: Request;
  res: Response;
  galleryId: string;
  fields: Record<string, string>;
  photoFiles: Array<{ buffer: Buffer; filename: string }>;
  limitExceeded: boolean;
}): Promise<void> {
  const { req, res, galleryId, fields, photoFiles, limitExceeded } = args;
  const actorMemberId = req.user!.userId;

  const name = String(fields.name ?? '');
  const description = String(fields.description ?? '');
  const sortOrderRaw = String(fields.sortOrder ?? '');
  const criteriaTags = parseTagsField(fields.criteriaTags);
  const excludeTags = parseTagsField(fields.excludeTags);
  const uploadTagsRaw = (fields.uploadTags ?? '') as string;
  const uploadTags = parseTagsField(uploadTagsRaw);
  const externalLinks = parseExternalLinkInputs(fields);

  const svc = buildSvc();
  const errCtx: CuratorGalleryEditErrorContext = {
    galleryId,
    name,
    description,
    sortOrderRaw,
    criteriaTagsRaw: fields.criteriaTags ?? '',
    excludeTagsRaw: fields.excludeTags ?? '',
    uploadTagsRaw,
    externalLinks,
  };

  if (limitExceeded) {
    renderCuratorGalleryEditError(res, 422, `File exceeded the maximum allowed size of ${Math.floor(PHOTO_MAX_BYTES / (1024 * 1024))} MB.`, errCtx);
    return;
  }
  for (const f of photoFiles) {
    if (f.buffer.length > PHOTO_MAX_BYTES) {
      renderCuratorGalleryEditError(res, 422, 'Photo is too large. Maximum size is 25 MB.', errCtx);
      return;
    }
    if (!detectImageType(f.buffer)) {
      renderCuratorGalleryEditError(res, 422, 'Only JPEG and PNG photos are accepted.', errCtx);
      return;
    }
  }

  try {
    await svc.updateGallery({
      actorMemberId,
      actorIsAdmin: true,
      galleryId,
      updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).render('admin/curator/galleries/edit', {
        seo: { title: 'Curator Gallery — Not Found' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Curator Gallery — Not Found' },
        notFound: true,
        galleryId,
      });
      return;
    }
    if (err instanceof ValidationError) {
      renderCuratorGalleryEditError(res, 422, err.message, { ...errCtx, fieldErrors: err.fieldErrors });
      return;
    }
    throw err;
  }

  // Curated uploads via the gallery form: each file is added as an FH-
  // owned media item. uploadPhoto auto-prepends `#curated`; user-supplied
  // uploadTags are appended after that. Empty uploadTags → only `#curated`.
  for (const f of photoFiles) {
    try {
      await svc.uploadPhoto({
        adminMemberId: actorMemberId,
        photoBuffer: f.buffer,
        sourceFilename: f.filename,
        caption: null,
        tags: uploadTags,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        renderCuratorGalleryEditError(
          res,
          422,
          `Gallery saved, but uploading "${f.filename}" failed: ${err.message}`,
          errCtx,
        );
        return;
      }
      throw err;
    }
  }

  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
  res.redirect(303, '/admin/curator/galleries');
}
