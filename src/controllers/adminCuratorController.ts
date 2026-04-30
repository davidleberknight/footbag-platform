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
import { ValidationError } from '../services/serviceErrors';

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
    let limitExceeded = false;

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: PER_FILE_LIMIT, files: 3, fields: 10 },
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('file', (name, stream) => {
      const chunks: Buffer[] = [];
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

      if (mediaType === 'photo') {
        const photoBuffer = fileBuffers.mediaFile;
        if (!photoBuffer || photoBuffer.length === 0) {
          renderForm(res.status(422), { errorMessage: 'Please select a photo to upload.', formValues });
          return;
        }
        await svc.uploadPhoto({ adminMemberId, photoBuffer, caption, tags });
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
      await svc.uploadVideo({ adminMemberId, videoBuffer, posterBuffer, caption, tags });
      res.redirect('/admin/curator/upload');
    }

    req.pipe(busboy);
  },
};
