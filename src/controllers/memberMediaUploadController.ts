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
 * Tier gating: POST /members/:memberKey/media/upload is gated by
 * `requireTier1Benefits()`. GET is intentionally open to all authenticated
 * owners so the form is visible as a read-only preview (the form copy
 * surfaces the tier requirement; the user gets an actionable upgrade path
 * rather than a bare 403). Defense in depth: the service layer's
 * `assertTier1Benefits` enforces the same predicate at upload-time so a
 * forged POST that bypasses the middleware (e.g. test seam misuse) still
 * fails before any media is written.
 */
import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  PHOTO_MAX_BYTES,
} from '../services/curatorMediaService';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { hit as rateLimitHit } from '../services/rateLimitService';
import { readIntConfig } from '../services/configReader';
import { renderServiceUnavailable } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';
import { hashtagDiscoveryService, type MemberTagSuggestions } from '../services/hashtagDiscoveryService';

interface FormValues {
  mediaType?: 'photo' | 'video';
  caption?: string;
  tags?: string;
  videoUrl?: string;
  videoPlatform?: 'youtube' | 'vimeo' | '';
  externalUrl?: string;
  galleryId?: string;
}

interface GalleryOption {
  id: string;
  name: string;
  criteriaTags: string[];
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
    tagSuggestions?: MemberTagSuggestions;
    galleries?: GalleryOption[];
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
    tagSuggestions: opts.tagSuggestions,
    galleries: opts.galleries,
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
    const memberId = req.user?.userId;
    const tagSuggestions = memberId
      ? hashtagDiscoveryService.getTagSuggestionsForMember(memberId)
      : undefined;
    const galleries: GalleryOption[] = memberId
      ? getDefaultCuratorMediaService().listGalleriesForOwner(memberId).map(g => ({
          id: g.id,
          name: g.name,
          criteriaTags: g.criteriaTags,
        }))
      : [];
    renderForm(res, req.params.memberKey, { tagSuggestions, galleries });
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
        if (err instanceof ImageProcessingError) {
          logger.error('member upload: image worker unavailable', {
            error: err.message,
            status: err.status,
          });
          renderServiceUnavailable(res);
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
      let tags = parseTagsField(fields.tags);

      const galleryId = (fields.galleryId ?? '').trim();
      if (galleryId) {
        const svcForGallery = getDefaultCuratorMediaService();
        const galleries = svcForGallery.listGalleriesForOwner(memberId);
        const selectedGallery = galleries.find(g => g.id === galleryId);
        if (selectedGallery && selectedGallery.criteriaTags.length > 0) {
          const existing = new Set(tags.map(t => t.toLowerCase()));
          for (const ct of selectedGallery.criteriaTags) {
            if (!existing.has(ct.toLowerCase())) {
              tags.push(ct);
              existing.add(ct.toLowerCase());
            }
          }
        }
      }

      const externalUrlRaw = (fields.externalUrl ?? '').trim();
      const externalUrl: string | null = externalUrlRaw.length === 0 ? null : externalUrlRaw;

      if (mediaType !== 'photo' && mediaType !== 'video') {
        throw new ValidationError('Choose a media type (photo or video).');
      }

      if (limitExceeded) {
        throw new ValidationError(
          `File exceeded the maximum allowed size of ${Math.floor(PHOTO_MAX_BYTES / (1024 * 1024))} MB.`,
        );
      }

      const svc = getDefaultCuratorMediaService();

      if (mediaType === 'photo') {
        if (req.user?.role !== 'admin') {
          const max = readIntConfig('photo_upload_rate_limit_per_hour', 10);
          const rl = rateLimitHit(`member-photo-upload:${memberId}`, max, 60);
          if (!rl.allowed) {
            throw new RateLimitedError(
              `Upload rate limit reached. Try again in ${rl.retryAfterSeconds} seconds.`,
              rl.retryAfterSeconds,
            );
          }
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
          ...(externalUrl !== null && { externalUrl }),
        });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
        res.redirect(303, listHref(memberKey));
        return;
      }

      // video branch
      if (req.user?.role !== 'admin') {
        const max = readIntConfig('video_submission_rate_limit_per_hour', 5);
        const rl = rateLimitHit(`member-video-submit:${memberId}`, max, 60);
        if (!rl.allowed) {
          throw new RateLimitedError(
            `Submission rate limit reached. Try again in ${rl.retryAfterSeconds} seconds.`,
            rl.retryAfterSeconds,
          );
        }
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
        ...(externalUrl !== null && { externalUrl }),
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
      res.redirect(303, listHref(memberKey));
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
    externalUrl: fields.externalUrl ?? '',
    galleryId: fields.galleryId ?? '',
  };
}
