/**
 * Member-owned Share Media routes. Owner-only surface for
 * /members/:memberKey/media/upload (GET form, POST multipart).
 *
 * Authz mirrors memberGalleryController:
 *   - requireAuth redirects unauthenticated requests to /login.
 *   - This controller asserts req.user.slug === req.params.memberKey;
 *     a mismatch returns 404 (anti-enumeration; matches the existing
 *     member-route convention).
 *   - Service-layer auto-applies the uploader tag (#by_<slug>) and
 *     materializes the per-member Personal Gallery on first upload.
 *
 * Tier gating: both the GET form and the POST are gated by
 * `requireTier1Benefits()`. The form is unreachable to a member the submission
 * would refuse, so nobody fills it in and loses what they typed; the refusal
 * names the benefit and how to earn it, and the member's own gallery list
 * carries the same text where the share control would have been. Defense in
 * depth: the service layer's `assertTier1Benefits` enforces the same predicate
 * at upload-time so a forged POST that bypasses the middleware still fails
 * before any media is written.
 *
 * The photos are read in memory under the configured count, per-file and
 * per-submit limits; nothing is written to disk.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  getMemberMediaUploadPage,
  photoMaxBytes,
  photoMaxFilesPerSubmit,
  shareBodyRefusal,
  shareFormValues,
  shareMemberMedia,
  SHARE_CONFIRM_NOTICE,
  SHARE_CONFIRM_NOTICE_WITH_FILES,
  type MemberMediaUploadFormValues,
  type NewGalleryPreview,
} from '../services/curatorMediaService';
import { renderImageWorkerUnavailable, renderNotFound } from '../lib/controllerErrors';
import { isAdminCaller, isOwnMemberRoute } from '../lib/routeOwnership';
import { readMultipart, type ParsedMultipart } from '../lib/multipartForm';
import { writeShareFlash } from '../lib/flashCookie';
import { hashtagDiscoveryService } from '../services/hashtagDiscoveryService';

// The text fields the form posts, plus one caption per chosen photo.
const SHARE_TEXT_FIELDS = 12;

function renderForm(
  req: Request,
  res: Response,
  opts: {
    status?: number;
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
    notice?: string;
    formValues?: MemberMediaUploadFormValues;
    preview?: NewGalleryPreview;
  } = {},
): void {
  const memberId = req.user!.userId;
  const slug = req.user!.slug;
  res.status(opts.status ?? 200).render(
    'members/media/upload',
    getMemberMediaUploadPage(getDefaultCuratorMediaService(), req.params.memberKey, memberId, slug, {
      actorIsAdmin: isAdminCaller(req),
      prefillGalleryId: typeof req.query.gallery === 'string' ? req.query.gallery : undefined,
      errorMessage: opts.errorMessage,
      fieldErrors: opts.fieldErrors,
      notice: opts.notice,
      formValues: opts.formValues,
      preview: opts.preview,
      tagSuggestions: hashtagDiscoveryService.getTagSuggestionsForMember(memberId, slug),
    }),
  );
}

export const memberMediaUploadController = {
  /** GET /members/:memberKey/media/upload — render the Share Media form. */
  getUpload(req: Request, res: Response): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    renderForm(req, res);
  },

  /** POST /members/:memberKey/media/upload — accept a Share Media submit. */
  postUpload(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const actorIsAdmin = isAdminCaller(req);
    const maxFiles = photoMaxFilesPerSubmit();

    async function handle(parsed: ParsedMultipart): Promise<void> {
      const { fields } = parsed;
      const formValues = shareFormValues(fields);
      const files = (parsed.files.photoFiles ?? []).filter((f) => f.filename.length > 0);
      const result = await shareMemberMedia(getDefaultCuratorMediaService(), {
        memberId: req.user!.userId,
        actorIsAdmin,
        slug: req.user!.slug,
        mediaType: fields.mediaType,
        // A caption is keyed by its photo's place in the selection, counted
        // over every part sent, so photos sharing a file name keep their own
        // captions and one the reader dropped for its size shifts none.
        photos: files.map((f) => ({
          filename: f.filename,
          buffer: f.buffer,
          caption: fields[`caption_for:${f.position}`] ?? fields.caption ?? '',
        })),
        videoUrl: fields.videoUrl ?? '',
        videoCaption: fields.videoCaption ?? '',
        tags: fields.tags ?? '',
        externalUrl: fields.externalUrl ?? '',
        galleryName: fields.galleryName ?? '',
        galleryPreview: fields.galleryPreview ?? '',
        limitExceeded: parsed.limitExceeded,
      });

      switch (result.status) {
        case 'confirm_gallery':
          renderForm(req, res, {
            notice: files.length > 0 ? SHARE_CONFIRM_NOTICE_WITH_FILES : SHARE_CONFIRM_NOTICE,
            formValues,
            preview: result.preview,
          });
          return;
        case 'refused':
          if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds));
          renderForm(req, res, {
            status: result.httpStatus,
            errorMessage: result.message,
            fieldErrors: result.fieldErrors,
            formValues,
          });
          return;
        case 'gallery_saved':
          writeShareFlash(res, req, {
            mediaId: null, count: 0, saved: false, gallery: result.gallery, folded: result.folded, rejected: [],
          });
          res.redirect(303, result.landingHref);
          return;
        case 'shared':
          writeShareFlash(res, req, {
            mediaId: result.mediaIds[0] ?? null,
            count: result.mediaIds.length,
            saved: false,
            gallery: result.gallery,
            folded: result.folded,
            rejected: result.rejected,
          });
          res.redirect(303, result.landingHref);
      }
    }

    // A submit declaring more than the form allows is refused before any of it
    // is held; closing the connection once the reply is out stops the rest.
    const tooLarge = shareBodyRefusal(Number(req.headers['content-length']), { allowsVideoFile: false });
    if (tooLarge) {
      res.on('finish', () => req.destroy());
      renderForm(req, res, { status: 422, errorMessage: tooLarge, fieldErrors: { photoFiles: tooLarge } });
      return;
    }

    readMultipart(
      req,
      {
        limits: {
          fileSize: photoMaxBytes(actorIsAdmin),
          // One part past the limit is read so the reader can tell the member
          // chose too many, rather than silently dropping the rest.
          files: maxFiles + 1,
          fields: SHARE_TEXT_FIELDS + maxFiles,
        },
        fileFields: ['photoFiles'],
      },
      (parsed) => {
        handle(parsed).catch((err: unknown) => {
          if (err instanceof ImageProcessingError) {
            renderImageWorkerUnavailable(res, 'member share: image worker unavailable', err);
            return;
          }
          logger.error('member share error', { error: err instanceof Error ? err.message : String(err) });
          next(err);
        });
      },
      (err) => {
        logger.error('busboy parse error', { error: err.message });
        next(err);
      },
    );
  },
};
