import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  VIDEO_MAX_BYTES,
  fileExceededMessage,
  updateCuratorGalleryWithUploads,
  uploadCuratorMedia,
  parseTagList,
  createCuratorGallery,
  getCuratorUploadPage,
  getCuratorMediaListPage,
  getCuratorMediaEditPage,
  getCuratorMediaEditErrorPage,
  getCuratorMediaNotFoundPage,
  getCuratorGalleryListPage,
  getCuratorGalleryNewPage,
  getCuratorGalleryEditPage,
  getCuratorGalleryEditErrorPage,
  getCuratorGalleryNotFoundPage,
  getCuratorJobStatusPage,
  getCuratorJobNotFoundPage,
  type CuratorMediaEditInput,
  type CuratorUploadFormValues,
  parseExternalLinkInputs,
  type CuratorGalleryFormFields,
} from '../services/curatorMediaService';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { renderImageWorkerUnavailable, renderInvalidRequest, renderNotFound } from '../lib/controllerErrors';
import { parseGalleryMultipart } from './galleryFormHelpers';
import { getMediaJobService, jobEventPayload, jobStateSnapshot } from '../services/mediaJobService';
import { subscribeToJobEvents } from '../services/jobEventBus';
import { config } from '../config/env';
import { FLASH_KIND, writeFlash, takeMediaSavedFlash } from '../lib/flashCookie';
import { readMultipart, type ParsedMultipart } from '../lib/multipartForm';

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

type FormValues = CuratorUploadFormValues;

function renderForm(
  res: Response,
  opts: {
    errorMessage?: string;
    formValues?: FormValues;
    existingCategories?: string[];
    savedFlag?: 'upload' | null;
  } = {},
): void {
  res.render(
    'admin/curator/upload',
    getCuratorUploadPage({
      errorMessage: opts.errorMessage,
      formValues: opts.formValues,
      existingCategories: opts.existingCategories,
      savedFlag: opts.savedFlag === 'upload',
    }),
  );
}

export const adminCuratorController = {
  async getUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const svc = buildSvc();
      const existingCategories = await svc.listExistingCategories();
      const savedFlag = takeMediaSavedFlash(req, res) === 'upload' ? 'upload' : null;
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

    let fields: Record<string, string> = {};
    const fileBuffers: Record<string, Buffer> = {};
    const fileFilenames: Record<string, string> = {};
    let limitExceeded = false;

    // A part that crosses the ceiling is refused the moment busboy raises it.
    // Waiting for the parser to finish means waiting for the whole body to
    // arrive, so an upload that was never going to be accepted still costs the
    // curator the entire transfer: ten minutes of progress bar ending in a
    // refusal the first megabyte already justified. The reader stops the parse,
    // and closing the connection once the reply has flushed stops the browser
    // sending the rest of a file nothing will read.
    //
    // Fields the browser sends after the file part have not been parsed yet, so
    // the re-rendered form carries only what arrived before the overrun. That
    // is the deliberate trade: a caption to retype costs less than the wait.
    function refuseOversized(fieldsSoFar: Record<string, string>): void {
      void (async () => {
        try {
          const existingCategories = await buildSvc().listExistingCategories();
          res.on('finish', () => {
            req.destroy();
          });
          renderForm(res.status(422), {
            errorMessage: OVERSIZED_FILE_MESSAGE,
            formValues: {
              mediaType: fieldsSoFar.mediaType,
              caption: fieldsSoFar.caption,
              tags: fieldsSoFar.tags,
            },
            existingCategories,
          });
        } catch (err) {
          next(err);
        }
      })();
    }

    function onParsed(parsed: ParsedMultipart): void {
      fields = parsed.fields;
      limitExceeded = parsed.limitExceeded;
      // The photo and video panels share the `mediaFile` name, so the last part
      // under a name supplies its bytes and the last named part its filename.
      for (const [name, parts] of Object.entries(parsed.files)) {
        fileBuffers[name] = parts[parts.length - 1].buffer;
        const named = parts.filter((p) => p.filename.length > 0);
        if (named.length > 0) fileFilenames[name] = named[named.length - 1].filename;
      }
      void handleFinish().catch((err: unknown) => {
        if (err instanceof ValidationError) {
          renderForm(res.status(422), {
            errorMessage: err.message,
            formValues: { mediaType: fields.mediaType, caption: fields.caption, tags: fields.tags },
          });
          return;
        }
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
    }

    async function handleFinish(): Promise<void> {
      const formValues: FormValues = {
        mediaType: fields.mediaType,
        caption: fields.caption ?? '',
        tags: fields.tags ?? '',
        category: fields.category ?? '',
        newCategory: fields.newCategory ?? '',
        videoUrl: fields.videoUrl ?? '',
        videoPlatform: fields.videoPlatform ?? '',
        primarySlug: fields.primarySlug ?? '',
        title: fields.title ?? '',
        sourceId: fields.sourceId ?? '',
        externalUrl: fields.externalUrl ?? '',
      };

      const svc = getDefaultCuratorMediaService();
      const existingCategories = await svc.listExistingCategories();

      // Reached only if the overrun surfaced without the stream raising its
      // limit event; the early refusal above answers the ordinary case.
      if (limitExceeded) {
        renderForm(res.status(422), {
          errorMessage: OVERSIZED_FILE_MESSAGE,
          formValues,
          existingCategories,
        });
        return;
      }

      const result = await uploadCuratorMedia(svc, {
        adminMemberId,
        fields,
        mediaFile: fileBuffers.mediaFile
          ? { buffer: fileBuffers.mediaFile, filename: fileFilenames.mediaFile ?? '' }
          : null,
        poster: fileBuffers.poster ?? null,
      });
      if (result.status === 'refused') {
        renderForm(res.status(result.httpStatus), { errorMessage: result.message, formValues, existingCategories });
        return;
      }
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'upload');
      res.redirect(303, '/admin/curator/upload');
    }

    readMultipart(
      req,
      {
        // files: 4 — the tabbed form has `mediaFile` inputs in BOTH the
        // photo panel and the video panel (same name, distinct DOM nodes).
        // Browsers submit a file part for every file input, even empty ones;
        // a video upload thus arrives as three file parts (empty mediaFile
        // from the photo panel + real mediaFile from the video panel +
        // poster). Capping at 2 silently dropped the poster. 4 has headroom
        // for the 3 expected parts without admitting genuinely abusive
        // multi-file submissions.
        // fields: 24 — the upload form posts up to 10 non-file fields today
        // (mediaType, newCategory, videoPlatform, videoUrl, primarySlug,
        // title, sourceId, caption, tags, externalUrl). A cap at or
        // near the current count silently drops the trailing fields on the
        // wire, because busboy emits no warning when it truncates. 24 leaves
        // headroom for near-term form additions without re-tuning.
        limits: { fileSize: PER_FILE_LIMIT, files: 4, fields: 24 },
        onLimit: refuseOversized,
      },
      onParsed,
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
          savedFlag: takeMediaSavedFlash(req, res),
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
      const vm = await getCuratorMediaEditPage(buildSvc(), mediaId);
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
      const captionRaw = (req.body?.caption ?? '').trim();
      const caption = captionRaw.length === 0 ? null : captionRaw;
      const tags = parseTagList(req.body?.tags);

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
      if (req.body?.sourceId !== undefined) editInput.sourceId = trimToNull(req.body.sourceId);
      if (req.body?.thumbnailUrl !== undefined) editInput.thumbnailUrl = trimToNull(req.body.thumbnailUrl);
      if (req.body?.startSeconds !== undefined) editInput.startSeconds = parseIntOrNull(req.body.startSeconds);
      if (req.body?.endSeconds !== undefined) editInput.endSeconds = parseIntOrNull(req.body.endSeconds);
      if (req.body?.externalUrl !== undefined) editInput.externalUrl = trimToNull(req.body.externalUrl);

      const svc = buildSvc();
      try {
        await svc.editMedia(editInput);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render('admin/curator/edit', getCuratorMediaNotFoundPage(mediaId));
          return;
        }
        if (err instanceof ValidationError) {
          const typed = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
          const page = await getCuratorMediaEditErrorPage(svc, mediaId, err.message, {
            caption: req.body?.caption ?? '',
            tagsString: req.body?.tags ?? '',
            sourceId: typed(req.body?.sourceId),
            startSeconds: typed(req.body?.startSeconds),
            endSeconds: typed(req.body?.endSeconds),
            externalUrl: typed(req.body?.externalUrl),
          });
          if (!page) {
            res.status(404).render('admin/curator/edit', getCuratorMediaNotFoundPage(mediaId));
            return;
          }
          res.status(422).render('admin/curator/edit', page);
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
      const savedFlag = takeMediaSavedFlash(req, res);
      const svc = buildSvc();
      const confirmDeleteId = typeof req.query.confirmDelete === 'string' ? req.query.confirmDelete : null;
      res.render(
        'admin/curator/galleries/list',
        getCuratorGalleryListPage(svc, { confirmDeleteId, savedFlag: savedFlag !== null }),
      );
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/curator/galleries/new — render new-gallery form. */
  getGalleryNew(req: Request, res: Response): void {
    res.render('admin/curator/galleries/new', getCuratorGalleryNewPage());
  },

  /** POST /admin/curator/galleries — create FH-owned gallery. */
  async postGalleryCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorMemberId = req.user!.userId;
      const slug = String(req.body?.idSlug ?? '').trim();
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagList(req.body?.criteriaTags);
      const excludeTags = parseTagList(req.body?.excludeTags);

      try {
        await createCuratorGallery(buildSvc(), {
          actorMemberId,
          idSlug: slug,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags },
        });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'create');
        res.redirect(303, '/admin/curator/galleries');
        return;
      } catch (err) {
        if (err instanceof ValidationError || err instanceof ConflictError) {
          const gallery: CuratorGalleryFormFields = {
            idSlug: slug,
            name,
            description,
            sortOrder: sortOrderRaw,
            criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
            excludeTagsString: (req.body?.excludeTags ?? '') as string,
          };
          res.status(422).render(
            'admin/curator/galleries/new',
            getCuratorGalleryNewPage({ errorMessage: err.message, gallery }),
          );
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
      const criteriaTags = parseTagList(req.body?.criteriaTags);
      const excludeTags = parseTagList(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});
      const reasonRaw = String(req.body?.reason ?? '');

      const svc = buildSvc();
      try {
        // The reason and the clear flags ride along on every submission; the
        // service ignores them unless this is a member's own gallery, which is
        // the only door they mean anything on.
        await svc.updateGallery({
          actorMemberId,
          actorIsAdmin: true,
          galleryId,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
          reason: reasonRaw,
          moderation: {
            clearName:        req.body?.clearName === '1',
            clearDescription: req.body?.clearDescription === '1',
          },
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).render(
            'admin/curator/galleries/edit',
            getCuratorGalleryNotFoundPage(galleryId),
          );
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
            reasonRaw,
          }, actorMemberId);
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
    if (req.body?.confirmed !== '1') {
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
    if (req.body?.confirmed !== '1') {
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
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await getDefaultCuratorMediaService().beginCuratorVideoUpload({
        adminMemberId: req.user!.userId,
        videoFilename: String(body.videoFilename ?? ''),
        videoContentType: String(body.videoContentType ?? ''),
        videoSizeBytes: Number(body.videoSizeBytes),
        posterContentType: String(body.posterContentType ?? ''),
        posterSizeBytes: Number(body.posterSizeBytes),
        caption: body.caption ? String(body.caption) : '',
        tags: String(body.tags ?? ''),
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
      const jobId = String((req.body as Record<string, unknown> | undefined)?.jobId ?? '').trim();
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
  // The administrator's typed reason, so a refused moderation comes back with
  // it still in the box rather than asking them to write it out again.
  reasonRaw?: string;
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
        if (err instanceof ImageProcessingError) {
          renderImageWorkerUnavailable(res, 'curator gallery upload: image worker unavailable', err);
          return;
        }
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
  droppedNamelessFile: boolean;
}): Promise<void> {
  const { req, res, galleryId, fields, photoFiles, limitExceeded, droppedNamelessFile } = args;
  const actorMemberId = req.user!.userId;

  const name = String(fields.name ?? '');
  const description = String(fields.description ?? '');
  const sortOrderRaw = String(fields.sortOrder ?? '');
  const criteriaTags = parseTagList(fields.criteriaTags);
  const excludeTags = parseTagList(fields.excludeTags);
  const uploadTagsRaw = (fields.uploadTags ?? '') as string;
  const uploadTags = parseTagList(uploadTagsRaw);
  const externalLinks = parseExternalLinkInputs(fields);
  const reasonRaw = String(fields.reason ?? '');

  const result = await updateCuratorGalleryWithUploads(buildSvc(), {
    actorMemberId,
    galleryId,
    updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
    reason: reasonRaw,
    moderation: {
      clearName:        fields.clearName === '1',
      clearDescription: fields.clearDescription === '1',
    },
    uploadTags,
    uploads: { files: photoFiles, limitExceeded, droppedNamelessFile },
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
      criteriaTagsRaw: fields.criteriaTags ?? '',
      excludeTagsRaw: fields.excludeTags ?? '',
      uploadTagsRaw,
      externalLinks,
      reasonRaw,
      fieldErrors: result.fieldErrors,
    }, actorMemberId);
    return;
  }
  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
  res.redirect(303, '/admin/curator/galleries');
}
