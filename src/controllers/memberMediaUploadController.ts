/**
 * Member-owned upload routes. Owner-only surface for
 * /members/:memberKey/media/upload (GET form, POST multipart).
 *
 * Authz mirrors memberGalleryController:
 *   - requireAuth redirects unauthenticated requests to /login.
 *   - This controller asserts req.user.slug === req.params.memberKey;
 *     a mismatch returns 404 (anti-enumeration; matches the existing
 *     member-route convention).
 *   - Service-layer auto-applies the uploader tag (#<slug>) and
 *     materializes the per-member Personal Gallery on first upload.
 *
 * DEVIATION: any authenticated member may upload — there is no tier
 * gate at this level. Target: gate on tier eligibility once the tier
 * feature lands. Tier ledger exists in schema; no enforcement
 * anywhere yet (see IMPLEMENTATION_PLAN deviations).
 */
import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { logger } from '../config/logger';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import {
  createCuratorMediaService,
  PHOTO_MAX_BYTES,
} from '../services/curatorMediaService';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { hit as rateLimitHit } from '../services/rateLimitService';

const PHOTO_RATE_LIMIT_PER_HOUR = 10;   // US M_Upload_Photo
const VIDEO_RATE_LIMIT_PER_HOUR = 5;    // US M_Submit_Video

interface FormValues {
  mediaType?: 'photo' | 'video';
  caption?: string;
  tags?: string;
  videoUrl?: string;
  videoPlatform?: 'youtube' | 'vimeo' | '';
}

function isOwnRoute(req: Request): boolean {
  return req.user?.slug === req.params.memberKey;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo: { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

function listHref(memberKey: string): string {
  return `/members/${memberKey}/galleries`;
}

function uploadHref(memberKey: string): string {
  return `/members/${memberKey}/media/upload`;
}

function renderForm(
  res: Response,
  memberKey: string,
  opts: {
    status?: number;
    errorMessage?: string;
    formValues?: FormValues;
  } = {},
): void {
  const status = opts.status ?? 200;
  res.status(status).render('members/media/upload', {
    seo: { title: 'Upload Media' },
    page: { sectionKey: 'members', pageKey: 'member_media_upload', title: 'Upload Media' },
    formAction: uploadHref(memberKey),
    cancelHref: listHref(memberKey),
    errorMessage: opts.errorMessage,
    formValues: opts.formValues ?? { mediaType: 'photo' },
  });
}

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
}

export const memberMediaUploadController = {
  /** GET /members/:memberKey/media/upload — render upload form. */
  getUpload(req: Request, res: Response): void {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    renderForm(res, req.params.memberKey);
  },

  /** POST /members/:memberKey/media/upload — accept multipart upload. */
  postUpload(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }

    const memberKey = req.params.memberKey;
    const memberId = req.user!.userId;
    const slug = req.user!.slug;

    const fields: Record<string, string> = {};
    let photoBuffer: Buffer | null = null;
    let photoFilename: string | null = null;
    let limitExceeded = false;

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 10 },
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('file', (name, stream, info) => {
      const chunks: Buffer[] = [];
      if (info && typeof info.filename === 'string' && info.filename.length > 0) {
        photoFilename = info.filename;
      }
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        limitExceeded = true;
      });
      stream.on('end', () => {
        if (!limitExceeded && name === 'photoFile') {
          photoBuffer = Buffer.concat(chunks);
        }
      });
    });

    busboy.on('finish', () => {
      void handleFinish().catch((err: unknown) => {
        if (err instanceof ValidationError) {
          renderForm(res, memberKey, {
            status: 422,
            errorMessage: err.message,
            formValues: collectFormValues(fields),
          });
          return;
        }
        if (err instanceof RateLimitedError) {
          if (typeof err.retryAfterSeconds === 'number') {
            res.setHeader('Retry-After', String(err.retryAfterSeconds));
          }
          renderForm(res, memberKey, {
            status: 429,
            errorMessage: err.message,
            formValues: collectFormValues(fields),
          });
          return;
        }
        logger.error('member upload error', { error: err instanceof Error ? err.message : String(err) });
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
      const tags = parseTagsField(fields.tags);

      if (mediaType !== 'photo' && mediaType !== 'video') {
        throw new ValidationError('Choose a media type (photo or video).');
      }

      if (limitExceeded) {
        throw new ValidationError(
          `File exceeded the maximum allowed size of ${Math.floor(PHOTO_MAX_BYTES / (1024 * 1024))} MB.`,
        );
      }

      const svc = createCuratorMediaService({
        storage: getMediaStorageAdapter(),
        imageProcessor: getImageProcessingAdapter(),
      });

      if (mediaType === 'photo') {
        const rl = rateLimitHit(`member-photo-upload:${memberId}`, PHOTO_RATE_LIMIT_PER_HOUR, 60);
        if (!rl.allowed) {
          throw new RateLimitedError(
            `Upload rate limit reached. Try again in ${rl.retryAfterSeconds} seconds.`,
            rl.retryAfterSeconds,
          );
        }
        if (!photoBuffer) {
          throw new ValidationError('Choose a photo file (JPEG or PNG).');
        }
        await svc.uploadPhotoForMember({
          memberId,
          slug,
          photoBuffer,
          sourceFilename: photoFilename ?? '',
          caption,
          tags,
        });
        res.redirect(`${listHref(memberKey)}?saved=upload`);
        return;
      }

      // video branch
      const rl = rateLimitHit(`member-video-submit:${memberId}`, VIDEO_RATE_LIMIT_PER_HOUR, 60);
      if (!rl.allowed) {
        throw new RateLimitedError(
          `Submission rate limit reached. Try again in ${rl.retryAfterSeconds} seconds.`,
          rl.retryAfterSeconds,
        );
      }
      const videoUrl = (fields.videoUrl ?? '').trim();
      const videoPlatform = (fields.videoPlatform ?? '').trim();
      if (videoPlatform !== 'youtube' && videoPlatform !== 'vimeo') {
        throw new ValidationError('Choose YouTube or Vimeo for the video platform.');
      }
      await svc.submitVideoForMember({
        memberId,
        slug,
        videoUrl,
        videoPlatform,
        caption,
        tags,
      });
      res.redirect(`${listHref(memberKey)}?saved=upload`);
    }

    req.pipe(busboy);
  },
};

function collectFormValues(fields: Record<string, string>): FormValues {
  const mediaType =
    fields.mediaType === 'video' ? 'video'
    : fields.mediaType === 'photo' ? 'photo'
    : undefined;
  const videoPlatform =
    fields.videoPlatform === 'youtube' ? 'youtube'
    : fields.videoPlatform === 'vimeo' ? 'vimeo'
    : '';
  return {
    mediaType,
    caption: fields.caption ?? '',
    tags: fields.tags ?? '',
    videoUrl: fields.videoUrl ?? '',
    videoPlatform,
  };
}
