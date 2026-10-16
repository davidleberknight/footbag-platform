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
 * Tier gating: both the GET form and the POST are gated by
 * `requireTier1Benefits()`. The form is unreachable to a member the submission
 * would refuse, so nobody fills it in and loses what they typed; the refusal
 * names the benefit and how to earn it, and the member's own gallery list
 * carries the same text where the upload control would have been. Defense in
 * depth: the service layer's `assertTier1Benefits` enforces the same predicate
 * at upload-time so a forged POST that bypasses the middleware (e.g. test seam
 * misuse) still fails before any media is written.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  memberGalleriesHref,
  PHOTO_MAX_BYTES,
  uploadMemberMedia,
  getMemberMediaUploadPage,
  type MemberMediaUploadFormValues,
} from '../services/curatorMediaService';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { renderImageWorkerUnavailable, renderNotFound } from '../lib/controllerErrors';
import { isAdminCaller, isOwnMemberRoute } from '../lib/routeOwnership';
import { readMultipart, type ParsedMultipart } from '../lib/multipartForm';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';
import { hashtagDiscoveryService, type MemberTagSuggestions } from '../services/hashtagDiscoveryService';

type FormValues = MemberMediaUploadFormValues;

function renderForm(
  res: Response,
  memberKey: string,
  memberId: string | null,
  opts: {
    status?: number;
    errorMessage?: string;
    formValues?: FormValues;
    tagSuggestions?: MemberTagSuggestions;
  } = {},
): void {
  const status = opts.status ?? 200;
  res.status(status).render(
    'members/media/upload',
    getMemberMediaUploadPage(getDefaultCuratorMediaService(), memberKey, memberId, {
      errorMessage: opts.errorMessage,
      formValues: opts.formValues,
      tagSuggestions: opts.tagSuggestions,
    }),
  );
}

export const memberMediaUploadController = {
  /** GET /members/:memberKey/media/upload — render upload form. */
  getUpload(req: Request, res: Response): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberId = req.user?.userId ?? null;
    const tagSuggestions = memberId
      ? hashtagDiscoveryService.getTagSuggestionsForMember(memberId)
      : undefined;
    renderForm(res, req.params.memberKey, memberId, { tagSuggestions });
  },

  /** POST /members/:memberKey/media/upload — accept multipart upload. */
  postUpload(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }

    const memberKey = req.params.memberKey;
    const memberId = req.user!.userId;
    const slug = req.user!.slug;

    let fields: Record<string, string> = {};
    let photo: { buffer: Buffer; filename: string } | null = null;
    let limitExceeded = false;

    function onParsed(parsed: ParsedMultipart): void {
      fields = parsed.fields;
      limitExceeded = parsed.limitExceeded;
      photo = parsed.files.photoFile?.[0] ?? null;
      void handleFinish().catch((err: unknown) => {
        if (err instanceof ValidationError) {
          renderForm(res, memberKey, memberId, {
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
          renderForm(res, memberKey, memberId, {
            status: 429,
            errorMessage: err.message,
            formValues: collectFormValues(fields),
          });
          return;
        }
        if (err instanceof ImageProcessingError) {
          renderImageWorkerUnavailable(res, 'member upload: image worker unavailable', err);
          return;
        }
        logger.error('member upload error', { error: err instanceof Error ? err.message : String(err) });
        next(err);
      });
    }

    async function handleFinish(): Promise<void> {
      await uploadMemberMedia(getDefaultCuratorMediaService(), {
        memberId,
        actorIsAdmin: isAdminCaller(req),
        slug,
        mediaType: fields.mediaType,
        galleryId: fields.galleryId ?? '',
        caption: fields.caption ?? '',
        tags: fields.tags ?? '',
        externalUrl: fields.externalUrl ?? '',
        photo,
        limitExceeded,
        videoUrl: fields.videoUrl ?? '',
        videoPlatform: fields.videoPlatform ?? '',
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
      res.redirect(303, memberGalleriesHref(memberKey));
    }

    readMultipart(
      req,
      { limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 10 }, fileFields: ['photoFile'] },
      onParsed,
      (err) => {
        logger.error('busboy parse error', { error: err.message });
        next(err);
      },
    );
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
