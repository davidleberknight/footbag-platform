import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { logger } from '../config/logger';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import {
  createCuratorMediaService,
  VIDEO_MAX_BYTES,
  POSTER_MAX_BYTES,
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
}

function renderForm(
  res: Response,
  opts: { errorMessage?: string; formValues?: FormValues } = {},
): void {
  res.render('admin/curator/upload', {
    seo: { title: 'Upload Curated Media' },
    page: { sectionKey: 'admin', pageKey: 'admin_curator_upload', title: 'Upload Curated Media' },
    errorMessage: opts.errorMessage,
    formValues: opts.formValues ?? {},
  });
}

export const adminCuratorController = {
  /** GET /admin/curator/upload — render the upload form. */
  getUpload(_req: Request, res: Response): void {
    renderForm(res);
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
        mediaType, caption: fields.caption ?? '', tags: fields.tags ?? '',
      };

      if (limitExceeded) {
        renderForm(res.status(422), { errorMessage: 'File exceeded the maximum allowed size.', formValues });
        return;
      }

      if (mediaType !== 'photo' && mediaType !== 'video') {
        renderForm(res.status(422), { errorMessage: 'Choose a media type (photo or video).', formValues });
        return;
      }

      const svc = createCuratorMediaService({
        storage: getMediaStorageAdapter(),
        imageProcessor: getImageProcessingAdapter(),
      });

      const sourceFilename = fileFilenames.mediaFile ?? '';

      if (mediaType === 'photo') {
        const photoBuffer = fileBuffers.mediaFile;
        if (!photoBuffer || photoBuffer.length === 0) {
          renderForm(res.status(422), { errorMessage: 'Please select a photo to upload.', formValues });
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
        renderForm(res.status(422), { errorMessage: 'Please select a video to upload.', formValues });
        return;
      }
      if (!posterBuffer || posterBuffer.length === 0) {
        renderForm(res.status(422), { errorMessage: 'Please provide a poster image for the video.', formValues });
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
  getEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const mediaId = req.params.id;
      const svc = buildSvc();
      const item = svc.getMediaItem(mediaId);
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
      res.render('admin/curator/edit', {
        seo: { title: 'Edit Curated Media' },
        page: { sectionKey: 'admin', pageKey: 'admin_curator_edit', title: 'Edit Curated Media' },
        media: {
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          caption: item.caption ?? '',
          tagsString: editableTags.join(' '),
          thumbnailUrl: item.thumbnailUrl,
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

      const svc = buildSvc();
      try {
        await svc.editMedia({ adminMemberId, mediaId, caption, tags });
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
      res.redirect('/admin/curator/media');
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
      res.redirect('/admin/curator/media');
    } catch (err) {
      next(err);
    }
  },
};

