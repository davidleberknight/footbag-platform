import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { logger } from '../config/logger';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import {
  createCuratorMediaService,
  VIDEO_MAX_BYTES,
  POSTER_MAX_BYTES,
  isValidCategoryName,
  type CuratorMediaEditInput,
} from '../services/curatorMediaService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';

const LIST_PAGE_SIZE = 50;

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
}

function buildSvc(): ReturnType<typeof createCuratorMediaService> {
  return createCuratorMediaService({
    storage: getMediaStorageAdapter(),
    imageProcessor: getImageProcessingAdapter(),
  });
}

// Busboy enforces a single per-file ceiling. Set it to the largest legitimate
// per-file size (video). Per-field size validation (photo 25 MB, poster 25 MB)
// happens inside curatorMediaService after the buffer is collected.
const PER_FILE_LIMIT = Math.max(VIDEO_MAX_BYTES, POSTER_MAX_BYTES);

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
  res.render('admin/curator/upload', {
    seo: { title: 'Upload Curated Media' },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Upload Curated Media' },
    errorMessage: opts.errorMessage,
    formValues: opts.formValues ?? {},
    existingCategories: opts.existingCategories ?? [],
    savedFlag: opts.savedFlag ?? null,
  });
}

export const adminCuratorController = {
  /** GET /admin/curator/upload — render the upload form. */
  async getUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const svc = buildSvc();
      const existingCategories = await svc.listExistingCategories();
      const savedFlag = req.query.saved === 'upload' ? 'upload' : null;
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
      limits: { fileSize: PER_FILE_LIMIT, files: 3, fields: 10 },
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
      };

      const svc = createCuratorMediaService({
        storage: getMediaStorageAdapter(),
        imageProcessor: getImageProcessingAdapter(),
      });
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
        // URL-reference upload writes a sidecar JSON file under
        // /curated/{category}/. The seeder regenerates the platform DB
        // from sidecars. No DB row written here.
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
        // Category resolution: admin either ticks exactly one existing
        // category checkbox (`category` field) OR types a new category
        // name (`newCategory` text). Mutually exclusive. The server is the
        // trust boundary; the form should also block both cases client-side.
        const existingCategory = (fields.category ?? '').trim();
        const newCategory = (fields.newCategory ?? '').trim();

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
        if (existingCategory.length > 0 && newCategory.length > 0) {
          renderForm(res.status(422), {
            errorMessage: 'Tick an existing category OR type a new category name, not both.',
            formValues,
            existingCategories,
          });
          return;
        }
        if (existingCategory.length === 0 && newCategory.length === 0) {
          renderForm(res.status(422), {
            errorMessage: 'Tick a category or type a new category name.',
            formValues,
            existingCategories,
          });
          return;
        }
        const resolvedCategory = existingCategory.length > 0 ? existingCategory : newCategory;
        if (!isValidCategoryName(resolvedCategory)) {
          renderForm(res.status(422), {
            errorMessage:
              'Category name must be lowercase letters, digits, or underscores.',
            formValues,
            existingCategories,
          });
          return;
        }

        try {
          await svc.uploadUrlReference({
            adminMemberId,
            category: resolvedCategory,
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
          });
        } catch (err) {
          if (err instanceof ValidationError) {
            renderForm(res.status(422), { errorMessage: err.message, formValues, existingCategories });
            return;
          }
          throw err;
        }
        res.redirect('/admin/curator/upload?saved=upload');
        return;
      }

      const sourceFilename = fileFilenames.mediaFile ?? '';

      if (mediaType === 'photo') {
        const photoBuffer = fileBuffers.mediaFile;
        if (!photoBuffer || photoBuffer.length === 0) {
          renderForm(res.status(422), { errorMessage: 'Please select a photo to upload.', formValues, existingCategories });
          return;
        }
        await svc.uploadPhoto({ adminMemberId, photoBuffer, sourceFilename, caption, tags });
        res.redirect('/admin/curator/upload');
        return;
      }

      // mediaType === 'video'
      const videoBuffer = fileBuffers.mediaFile;
      const posterBuffer = fileBuffers.poster;
      if (!videoBuffer || videoBuffer.length === 0) {
        renderForm(res.status(422), { errorMessage: 'Please select a video to upload.', formValues, existingCategories });
        return;
      }
      if (!posterBuffer || posterBuffer.length === 0) {
        renderForm(res.status(422), { errorMessage: 'Please provide a poster image for the video.', formValues, existingCategories });
        return;
      }
      await svc.uploadVideo({ adminMemberId, videoBuffer, posterBuffer, sourceFilename, caption, tags });
      res.redirect('/admin/curator/upload');
    }

    req.pipe(busboy);
  },

  /** GET /admin/curator/media — paginated list with optional tag filter. */
  getList(req: Request, res: Response, next: NextFunction): void {
    try {
      const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const tagFilterRaw = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
      const tagFilter = tagFilterRaw.length > 0 ? tagFilterRaw : undefined;
      const savedFlag =
        req.query.saved === 'edit' ? 'edit'
          : req.query.saved === 'delete' ? 'delete'
            : null;

      const svc = buildSvc();
      const result = svc.listMedia({ page, pageSize: LIST_PAGE_SIZE, tagFilter });

      const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
      const prevPageHref = result.page > 1
        ? `/admin/curator/media?page=${result.page - 1}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`
        : null;
      const nextPageHref = result.page < totalPages
        ? `/admin/curator/media?page=${result.page + 1}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`
        : null;

      res.render('admin/curator/list', {
        seo: { title: 'Curated Media' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_list', title: 'Curated Media' },
        items: result.items,
        total: result.total,
        currentPage: result.page,
        totalPages,
        tagFilter: tagFilter ?? '',
        prevPageHref,
        nextPageHref,
        emptyState: result.items.length === 0,
        savedFlag,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).send(err.message);
        return;
      }
      next(err);
    }
  },

  /** GET /admin/curator/media/:id/edit — render edit form for one media item. */
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
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/curator/media/:id/edit — apply caption + tags edit. */
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
      res.redirect('/admin/curator/media?saved=edit');
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/curator/galleries — list FH-owned named galleries. */
  getGalleryList(req: Request, res: Response, next: NextFunction): void {
    try {
      const savedFlag = req.query.saved === 'edit' ? 'edit' : null;
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

  /** GET /admin/curator/galleries/:id/edit — render the gallery edit form. */
  getGalleryEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const galleryId = req.params.id;
      const svc = buildSvc();
      try {
        const g = svc.getGalleryForEdit(galleryId);
        res.render('admin/curator/galleries/edit', {
          seo: { title: 'Edit Curator Gallery' },
          page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Edit Curator Gallery' },
          gallery: {
            id: g.id,
            name: g.name,
            description: g.description,
            sortOrder: g.sortOrder,
            criteriaTagsString: g.criteriaTags.join(' '),
            excludeTagsString: g.excludeTags.join(' '),
          },
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

  /** POST /admin/curator/galleries/:id/edit — apply gallery edit. */
  postGalleryEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const galleryId = req.params.id;
      const adminMemberId = req.user!.userId;
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagsField(req.body?.criteriaTags);
      const excludeTags = parseTagsField(req.body?.excludeTags);

      const svc = buildSvc();
      try {
        svc.updateGallery({
          adminMemberId,
          galleryId,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags },
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
          res.status(422).render('admin/curator/galleries/edit', {
            seo: { title: 'Edit Curator Gallery' },
            page: { sectionKey: 'admin', pageKey: 'admin_curator_galleries_edit', title: 'Edit Curator Gallery' },
            errorMessage: err.message,
            gallery: {
              id: galleryId,
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
      res.redirect('/admin/curator/galleries?saved=edit');
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
          res.status(404).send('Curator media not found.');
          return;
        }
        throw err;
      }
      res.redirect('/admin/curator/media?saved=delete');
    } catch (err) {
      next(err);
    }
  },
};

