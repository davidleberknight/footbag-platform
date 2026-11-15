import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  VIDEO_MAX_BYTES,
  fileExceededMessage,
  updateCuratorGallery,
  parseTagList,
  withPlayerCredits,
  getCuratorSharePage,
  shareCuratorMedia,
  signCuratorVideoUpload,
  photoMaxFilesPerSubmit,
  shareBodyRefusal,
  shareFormValues,
  CURATOR_CONFIRM_NOTICE,
  CURATOR_CONFIRM_NOTICE_WITH_FILES,
  type MemberMediaUploadFormValues,
  type NewGalleryPreview,
  getCuratorMediaListPage,
  getCuratorMediaEditPage,
  getCuratorMediaEditErrorPage,
  getCuratorMediaNotFoundPage,
  getCuratorGalleryListPage,
  getCuratorGalleryEditPage,
  getCuratorGalleryEditErrorPage,
  getCuratorGalleryNotFoundPage,
  getCuratorJobStatusPage,
  getCuratorJobNotFoundPage,
  type CuratorMediaEditInput,
  parseExternalLinkInputs,
  changedTypedTags,
} from '../services/curatorMediaService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';
import { renderImageWorkerUnavailable, renderInvalidRequest, renderNotFound } from '../lib/controllerErrors';
import { getMediaJobService, jobEventPayload, jobStateSnapshot } from '../services/mediaJobService';
import { subscribeToJobEvents } from '../services/jobEventBus';
import { config } from '../config/env';
import {
  FLASH_KIND, writeFlash, writeMediaSavedFlash, writeShareFlash, takeMediaSaved, takeShareFlash,
  type FoldedTag, type ShareOutcome,
} from '../lib/flashCookie';
import { hashtagDiscoveryService } from '../services/hashtagDiscoveryService';
import { readMultipart, type ParsedMultipart } from '../lib/multipartForm';

// The media edit form. The URL-reference fields appear only on a reference
// row's edit page, so their absence (leave the field alone) differs from a
// blank value (clear it).
const curatorMediaEditForm = z.object({
  caption: formText('Caption'),
  tags: formText('Hashtags'),
  addPlayer: formOptionalText('The player to credit'),
  sourceId: formOptionalText('Source id'),
  thumbnailUrl: formOptionalText('Thumbnail URL'),
  startSeconds: formOptionalText('Start (seconds)'),
  endSeconds: formOptionalText('End (seconds)'),
  externalUrl: formOptionalText('External URL'),
});

// One label and one URL input per link slot the gallery form draws.
const galleryLinkFields: Record<string, ReturnType<typeof formText>> = {};
for (let i = 0; i < config.galleryMaxExternalLinks; i++) {
  galleryLinkFields[`externalLinkLabel${i}`] = formText(`Link ${i + 1} label`);
  galleryLinkFields[`externalLinkUrl${i}`] = formText(`Link ${i + 1} URL`);
}

// The gallery edit form. The moderation boxes carry no hidden 0, so an
// unticked box arrives absent and reads as blank.
const curatorGalleryEditForm = z.object({
  name: formText('Name'),
  description: formText('Description'),
  sortOrder: formText('Sort order'),
  criteriaTags: formText('Criteria hashtags'),
  excludeTags: formText('Exclude hashtags'),
  reason: formText('Reason'),
  // Absent when the form offered no cover choice, which keeps the stored one.
  coverMediaId: formOptionalText('Cover'),
  clearName: formText('Clear the name'),
  clearDescription: formText('Clear the description'),
  ...galleryLinkFields,
});

// The delete buttons post confirmed=1 only from the confirmation step.
const curatorDeleteForm = z.object({ confirmed: formOptionalText('The confirmation') });

// The async video upload's JSON bodies. The service checks each value's type
// and content, so the schema only names the fields it takes.
const signUploadBody = z.object({
  videoFilename: z.unknown().optional(),
  videoContentType: z.unknown().optional(),
  videoSizeBytes: z.unknown().optional(),
  posterContentType: z.unknown().optional(),
  posterSizeBytes: z.unknown().optional(),
  caption: z.unknown().optional(),
  tags: z.unknown().optional(),
  externalUrl: z.unknown().optional(),
  galleryName: z.unknown().optional(),
  gallerySlug: z.unknown().optional(),
  gallerySort: z.unknown().optional(),
  galleryExcludeTags: z.unknown().optional(),
  galleryPreview: z.unknown().optional(),
});
const finalizeUploadBody = z.object({ jobId: z.unknown().optional() });

// A consumed media-saved flash as the list pages take it: which save, and the
// typed tags it stored folded.
function savedFlagAndFolds(saved: ReturnType<typeof takeMediaSaved>): {
  savedFlag: string | null; savedFolded: FoldedTag[];
} {
  return { savedFlag: saved?.kind ?? null, savedFolded: saved?.folded ?? [] };
}

// The HTTP answer to each way a finalize can be refused. A job another admin
// owns reads as not found, so job ids cannot be probed.
const FINALIZE_REFUSAL_STATUS = {
  invalid: 400,
  not_found: 404,
  not_uploaded: 409,
  too_large: 413,
  dispatch_failed: 502,
} as const;

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

// The figure comes from the same constant the ceiling does, so the refusal
// cannot name a limit the check does not enforce. It is correct for a photo
// part too: the per-file ceiling busboy applies is this one, whatever the part
// holds.
const OVERSIZED_FILE_MESSAGE = fileExceededMessage(PER_FILE_LIMIT);

// The text fields the curator form posts, plus one caption per chosen photo
// and one per ticked category box.
const SHARE_TEXT_FIELDS = 40;

async function renderForm(
  req: Request,
  res: Response,
  opts: {
    status?: number;
    errorMessage?: string;
    fieldErrors?: Record<string, string>;
    notice?: string;
    formValues?: MemberMediaUploadFormValues;
    preview?: NewGalleryPreview;
    outcome?: ShareOutcome | null;
  } = {},
): Promise<void> {
  const svc = buildSvc();
  const existingCategories = await svc.listExistingCategories();
  // Footbag Hacky's popular, club and event hashtags; never the acting
  // admin's own player hashtag, since the curator account is the uploader.
  const suggestions = hashtagDiscoveryService.getTagSuggestionsForMember(svc.getSystemMemberId(), '');
  res.status(opts.status ?? 200).render(
    'admin/curator/upload',
    getCuratorSharePage(svc, {
      prefillGalleryId: typeof req.query.gallery === 'string' ? req.query.gallery : undefined,
      errorMessage: opts.errorMessage,
      fieldErrors: opts.fieldErrors,
      notice: opts.notice,
      formValues: opts.formValues,
      preview: opts.preview,
      existingCategories,
      tagSuggestions: { ...suggestions, playerTags: [] },
      outcome: opts.outcome ?? null,
    }),
  );
}

export const adminCuratorController = {
  async getUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await renderForm(req, res, { outcome: takeShareFlash(req, res) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/curator/upload — the curator's Share Media submit.
   *
   * Photos arrive as `photoFiles` (several), a video file as `mediaFile` with
   * its `poster`. The reader holds each part to the video ceiling, the largest
   * file this form takes; the service holds photos to their own size and to
   * the per-submit count and total. A submit lands back on this page with its
   * report.
   */
  postUpload(req: Request, res: Response, next: NextFunction): void {
    const adminMemberId = req.user!.userId;
    const maxFiles = photoMaxFilesPerSubmit();

    async function handle(parsed: ParsedMultipart): Promise<void> {
      const { fields } = parsed;
      const formValues = shareFormValues(fields);
      const named = (name: string) => (parsed.files[name] ?? []).filter((f) => f.filename.length > 0);
      const photos = named('photoFiles');
      const videoPart = named('mediaFile')[0] ?? null;
      const posterPart = named('poster')[0] ?? null;
      const result = await shareCuratorMedia(buildSvc(), {
        adminMemberId,
        mediaType: fields.mediaType,
        // A caption is keyed by its photo's place in the selection, counted
        // over every part sent, so photos sharing a file name keep their own
        // captions and one the reader dropped for its size shifts none.
        photos: photos.map((f) => ({
          filename: f.filename,
          buffer: f.buffer,
          caption: fields[`caption_for:${f.position}`] ?? fields.caption ?? '',
        })),
        videoFile: videoPart ? { filename: videoPart.filename, buffer: videoPart.buffer } : null,
        poster: posterPart ? posterPart.buffer : null,
        videoUrl: fields.videoUrl ?? '',
        videoCaption: (fields.mediaType === 'video' ? fields.fileCaption : fields.videoCaption) ?? '',
        tags: fields.tags ?? '',
        externalUrl: fields.externalUrl ?? '',
        sourceId: fields.sourceId ?? '',
        startSeconds: fields.startSeconds ?? '',
        endSeconds: fields.endSeconds ?? '',
        category: fields.category ?? '',
        newCategory: fields.newCategory ?? '',
        primarySlug: fields.primarySlug ?? '',
        galleryName: fields.galleryName ?? '',
        gallerySlug: fields.gallerySlug ?? '',
        gallerySort: fields.gallerySort ?? '',
        galleryExcludeTags: fields.galleryExcludeTags ?? '',
        galleryPreview: fields.galleryPreview ?? '',
        limitExceeded: parsed.limitExceeded,
      });

      switch (result.status) {
        case 'confirm_gallery':
          await renderForm(req, res, {
            notice: photos.length > 0 || videoPart ? CURATOR_CONFIRM_NOTICE_WITH_FILES : CURATOR_CONFIRM_NOTICE,
            formValues,
            preview: result.preview,
          });
          return;
        case 'refused':
          if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds));
          await renderForm(req, res, {
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
          res.redirect(303, '/admin/curator/upload');
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
          res.redirect(303, '/admin/curator/upload');
      }
    }

    // A part that crosses the ceiling is refused the moment the reader raises
    // it, rather than after the whole body has arrived; closing the connection
    // once the reply has flushed stops the browser sending the rest. Fields
    // sent after the file have not been read yet, so the form comes back with
    // only what arrived before the overrun.
    function refuseOversized(fieldsSoFar: Record<string, string>): void {
      res.on('finish', () => {
        req.destroy();
      });
      renderForm(req, res, {
        status: 422,
        errorMessage: OVERSIZED_FILE_MESSAGE,
        formValues: shareFormValues(fieldsSoFar),
      }).catch(next);
    }

    // A submit declaring more than the form allows is refused before any of it
    // is held; closing the connection once the reply is out stops the rest.
    const tooLarge = shareBodyRefusal(Number(req.headers['content-length']), {
      allowsVideoFile: config.mediaStorageAdapter === 'local',
    });
    if (tooLarge) {
      res.on('finish', () => req.destroy());
      renderForm(req, res, { status: 422, errorMessage: tooLarge }).catch(next);
      return;
    }

    readMultipart(
      req,
      {
        limits: {
          fileSize: PER_FILE_LIMIT,
          // One photo part past the count is read so the service can tell the
          // curator chose too many; the video file and poster are the other two.
          files: maxFiles + 3,
          fields: SHARE_TEXT_FIELDS + maxFiles,
        },
        fileFields: ['photoFiles', 'mediaFile', 'poster'],
        onLimit: refuseOversized,
      },
      (parsed) => {
        handle(parsed).catch((err: unknown) => {
          if (err instanceof ImageProcessingError) {
            renderImageWorkerUnavailable(res, 'admin upload: image worker unavailable', err);
            return;
          }
          if (err instanceof RateLimitedError) {
            next(err);
            return;
          }
          logger.error('admin upload error', { error: err instanceof Error ? err.message : String(err) });
          next(err);
        });
      },
      (err) => {
        logger.error('busboy parse error', { error: err.message });
        next(err);
      },
    );
  },

  getList(req: Request, res: Response, next: NextFunction): void {
    try {
      const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      res.render(
        'admin/curator/list',
        getCuratorMediaListPage(buildSvc(), {
          page,
          tagFilter: typeof req.query.tag === 'string' ? req.query.tag : null,
          sort: typeof req.query.sort === 'string' ? req.query.sort : null,
          confirmDeleteId: typeof req.query.confirmDelete === 'string' ? req.query.confirmDelete : null,
          ...savedFlagAndFolds(takeMediaSaved(req, res)),
        }),
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        renderInvalidRequest(res, {
          title: 'Invalid Request',
          message: err.message,
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
      // The player search submits the edit form by GET, so the fields the curator
      // had typed arrive in the query and are shown again rather than lost.
      const typedField = (name: string) => (typeof req.query[name] === 'string' ? String(req.query[name]) : undefined);
      const vm = await getCuratorMediaEditPage(buildSvc(), mediaId, {
        query: typeof req.query.q === 'string' ? req.query.q : undefined,
        actorMemberId: req.user!.userId,
        ip: req.ip ?? 'unknown',
      }, {
        caption: typedField('caption'),
        tagsString: typedField('tags'),
        sourceId: typedField('sourceId'),
        startSeconds: typedField('startSeconds'),
        endSeconds: typedField('endSeconds'),
        externalUrl: typedField('externalUrl'),
      });
      if (!vm) {
        res.status(404).render('admin/curator/edit', getCuratorMediaNotFoundPage(mediaId));
        return;
      }
      res.render('admin/curator/edit', vm);
    } catch (err) {
      next(err);
    }
  },

  async postEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mediaId = req.params.id;
      const adminMemberId = req.user!.userId;
      const svc = buildSvc();
      const parsed = parseFormBody(curatorMediaEditForm, req.body);
      const renderEditRefused = async (
        message: string,
        typed: Partial<Record<string, string | undefined>>,
        fieldErrors?: Record<string, string>,
      ): Promise<void> => {
        const page = await getCuratorMediaEditErrorPage(svc, mediaId, message, {
          caption: typed.caption ?? '',
          tagsString: typed.tags ?? '',
          sourceId: typed.sourceId,
          startSeconds: typed.startSeconds,
          endSeconds: typed.endSeconds,
          externalUrl: typed.externalUrl,
        }, fieldErrors);
        if (!page) {
          res.status(404).render('admin/curator/edit', getCuratorMediaNotFoundPage(mediaId));
          return;
        }
        res.status(422).render('admin/curator/edit', page);
      };
      if (!parsed.ok) {
        await renderEditRefused(parsed.message, parsed.submitted, parsed.fieldErrors);
        return;
      }
      const form = parsed.data;
      const captionRaw = form.caption.trim();
      const caption = captionRaw.length === 0 ? null : captionRaw;
      const tags = withPlayerCredits(parseTagList(form.tags), form.addPlayer);

      // URL-ref sidecar fields. Sent as form inputs from the edit page;
      // empty string is treated as null (clears the sidecar field).
      // Service ignores these on DB-direct rows.
      const editInput: CuratorMediaEditInput = { adminMemberId, mediaId, caption, tags };
      const trimToNull = (v: string): string | null => {
        const t = v.trim();
        return t.length === 0 ? null : t;
      };
      const parseIntOrNull = (v: string): number | null => {
        const t = v.trim();
        if (t.length === 0) return null;
        const n = parseInt(t, 10);
        return Number.isFinite(n) ? n : null;
      };
      if (form.sourceId !== undefined) editInput.sourceId = trimToNull(form.sourceId);
      if (form.thumbnailUrl !== undefined) editInput.thumbnailUrl = trimToNull(form.thumbnailUrl);
      if (form.startSeconds !== undefined) editInput.startSeconds = parseIntOrNull(form.startSeconds);
      if (form.endSeconds !== undefined) editInput.endSeconds = parseIntOrNull(form.endSeconds);
      if (form.externalUrl !== undefined) editInput.externalUrl = trimToNull(form.externalUrl);

      try {
        await svc.editMedia(editInput);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('admin/curator/edit', getCuratorMediaNotFoundPage(mediaId));
          return;
        }
        if (err instanceof ValidationError) {
          await renderEditRefused(err.message, form);
          return;
        }
        throw err;
      }
      writeMediaSavedFlash(res, req, 'edit', changedTypedTags(form.tags));
      res.redirect(303, '/admin/curator/media');
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/curator/galleries — list FH-owned named galleries. */
  getGalleryList(req: Request, res: Response, next: NextFunction): void {
    try {
      const saved = takeMediaSaved(req, res);
      const savedFlag = saved?.kind ?? null;
      const savedFolded = saved?.folded ?? [];
      const svc = buildSvc();
      const confirmDeleteId = typeof req.query.confirmDelete === 'string' ? req.query.confirmDelete : null;
      res.render(
        'admin/curator/galleries/list',
        getCuratorGalleryListPage(svc, { confirmDeleteId, savedFlag: savedFlag !== null, savedFolded }),
      );
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
        res.render(
          'admin/curator/galleries/edit',
          getCuratorGalleryEditPage(svc, galleryId, req.user!.userId),
        );
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render(
            'admin/curator/galleries/edit',
            getCuratorGalleryNotFoundPage(galleryId),
          );
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/curator/galleries/:id/edit — apply gallery edit, landing on the gallery. */
  async postGalleryEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const parsed = parseFormBody(curatorGalleryEditForm, req.body);
      if (!parsed.ok) {
        const typed = parsed.submitted;
        try {
          renderCuratorGalleryEditError(res, 422, parsed.message, {
            galleryId,
            name: typed.name ?? '',
            description: typed.description ?? '',
            sortOrderRaw: typed.sortOrder ?? '',
            criteriaTagsRaw: typed.criteriaTags ?? '',
            excludeTagsRaw: typed.excludeTags ?? '',
            externalLinks: parseExternalLinkInputs(typed),
            fieldErrors: parsed.fieldErrors,
            reasonRaw: typed.reason ?? '',
            coverMediaId: typed.coverMediaId,
          }, actorMemberId);
        } catch (err) {
          if (err instanceof NotFoundError) {
            res.status(404).render('admin/curator/galleries/edit', getCuratorGalleryNotFoundPage(galleryId));
            return;
          }
          throw err;
        }
        return;
      }
      const form = parsed.data;
      const name = form.name;
      const description = form.description;
      const sortOrderRaw = form.sortOrder;
      const criteriaTags = parseTagList(form.criteriaTags);
      const excludeTags = parseTagList(form.excludeTags);
      const externalLinks = parseExternalLinkInputs(form);
      const reasonRaw = form.reason;
      const coverMediaId = form.coverMediaId;

      // The reason and the clear flags ride along on every submission; the
      // service ignores them unless this is a member's own gallery, which is
      // the only door they mean anything on.
      const result = await updateCuratorGallery(buildSvc(), {
        actorMemberId,
        galleryId,
        updates: {
          name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks, coverMediaId,
        },
        reason: reasonRaw,
        moderation: {
          clearName:        form.clearName === '1',
          clearDescription: form.clearDescription === '1',
        },
      });
      if (result.status === 'not_found') {
        res.status(404).render('admin/curator/galleries/edit', getCuratorGalleryNotFoundPage(galleryId));
        return;
      }
      if (result.status === 'refused') {
        renderCuratorGalleryEditError(res, result.httpStatus, result.message, {
          galleryId,
          name,
          description,
          sortOrderRaw,
          criteriaTagsRaw: form.criteriaTags,
          excludeTagsRaw: form.excludeTags,
          externalLinks,
          fieldErrors: result.fieldErrors,
          reasonRaw,
          coverMediaId,
        }, actorMemberId);
        return;
      }
      writeShareFlash(res, req, {
        mediaId: null,
        count: 0,
        saved: true,
        gallery: { id: galleryId, name, tags: [], created: false },
        folded: changedTypedTags(form.criteriaTags, form.excludeTags),
        rejected: [],
      });
      res.redirect(303, result.landingHref);
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/curator/galleries/:id/delete — hard-delete FH gallery + sidecar. */
  async postGalleryDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = parseFormBody(curatorDeleteForm, req.body);
    if (!parsed.ok) {
      renderInvalidRequest(res, { title: parsed.message });
      return;
    }
    if (parsed.data.confirmed !== '1') {
      res.redirect(303, `/admin/curator/galleries?confirmDelete=${encodeURIComponent(req.params.id)}`);
      return;
    }
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
          res.status(404).render(
            'admin/curator/galleries/edit',
            getCuratorGalleryNotFoundPage(galleryId),
          );
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
    const parsed = parseFormBody(curatorDeleteForm, req.body);
    if (!parsed.ok) {
      renderInvalidRequest(res, { title: parsed.message });
      return;
    }
    if (parsed.data.confirmed !== '1') {
      res.redirect(303, `/admin/curator/media?confirmDelete=${encodeURIComponent(req.params.id)}`);
      return;
    }
    try {
      const mediaId = req.params.id;
      const adminMemberId = req.user!.userId;
      const svc = buildSvc();
      try {
        await svc.deleteMedia({ adminMemberId, mediaId });
      } catch (err) {
        if (err instanceof NotFoundError) {
          renderNotFound(res, { title: 'Curator Media Not Found' });
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
   * POSTs /finalize with the jobId. The service checks the claimed files,
   * creates the media_jobs row in 'pending_upload' state and signs the URLs;
   * a refusal answers 400 with its reason.
   */
  async postSignUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = parseFormBody(signUploadBody, req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.message });
        return;
      }
      const body = parsed.data as Record<string, unknown>;
      const text = (key: string) => String(body[key] ?? '');
      const result = await signCuratorVideoUpload(getDefaultCuratorMediaService(), {
        adminMemberId: req.user!.userId,
        videoFilename: text('videoFilename'),
        videoContentType: text('videoContentType'),
        videoSizeBytes: Number(body.videoSizeBytes),
        posterContentType: text('posterContentType'),
        posterSizeBytes: Number(body.posterSizeBytes),
        caption: body.caption ? String(body.caption) : '',
        tags: text('tags'),
        externalUrl: text('externalUrl'),
        galleryName: text('galleryName'),
        gallerySlug: text('gallerySlug'),
        gallerySort: text('gallerySort'),
        galleryExcludeTags: text('galleryExcludeTags'),
        galleryPreview: text('galleryPreview'),
      });
      if (result.status === 'invalid') {
        res.status(400).json({ error: result.error });
        return;
      }
      const { jobId, videoUrl, posterUrl, expiresAtIso } = result;
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
    // No curator-write limit here: signing already spent a slot in the per-actor
    // curator-write bucket, and finalize is idempotent and retry-safe — throttling it
    // would 429 a benign browser retry of an already-authorized, already-throttled
    // upload, which is precisely the retry the stranded-dispatch path depends on.
    try {
      const parsed = parseFormBody(finalizeUploadBody, req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.message });
        return;
      }
      const jobId = String(parsed.data.jobId ?? '').trim();
      const result = await getDefaultCuratorMediaService().finalizeCuratorVideoUpload(
        jobId,
        req.user!.userId,
      );
      if (result.status !== 'dispatched') {
        res.status(FINALIZE_REFUSAL_STATUS[result.status]).json({ error: result.error });
        return;
      }
      res.json({ jobId, statusUrl: result.statusUrl });
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
        res.status(404).render('admin/curator/job-status', getCuratorJobNotFoundPage(jobId));
        return;
      }
      res.render('admin/curator/job-status', getCuratorJobStatusPage(job));
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
      // 'private' keeps the app-level privacy scope this overwrite would
      // otherwise drop from an authenticated admin response.
      'Cache-Control': 'private, no-cache, no-transform',
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

    writeSse('state', jobStateSnapshot(job, new Date().toISOString()));

    const unsubscribe = subscribeToJobEvents(jobId, (event) => {
      writeSse('state', jobEventPayload(event));
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

// ── Curator-gallery edit error rerender ─────────────────────────────────
// Serves the `/admin/curator/galleries/:id/edit` POST, which re-renders the
// form with the administrator's values when a save is refused.

interface CuratorGalleryEditErrorContext {
  galleryId: string;
  name: string;
  description: string;
  sortOrderRaw: string;
  criteriaTagsRaw: string;
  excludeTagsRaw: string;
  externalLinks: ReturnType<typeof parseExternalLinkInputs>;
  fieldErrors?: Record<string, string>;
  // The administrator's typed reason, so a refused moderation comes back with
  // it still in the box rather than asking them to write it out again.
  reasonRaw?: string;
  // The cover the refused form submitted, so it comes back still chosen.
  coverMediaId?: string;
}

function renderCuratorGalleryEditError(
  res: Response,
  status: number,
  errorMessage: string,
  ctx: CuratorGalleryEditErrorContext,
  actorMemberId: string,
): void {
  res.status(status).render(
    'admin/curator/galleries/edit',
    getCuratorGalleryEditErrorPage(buildSvc(), actorMemberId, errorMessage, ctx),
  );
}

