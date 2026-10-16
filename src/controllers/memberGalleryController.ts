/**
 * Member-owned named-gallery routes. The owner-only surface for
 * /members/:memberKey/galleries/{,new,:id/edit,:id/delete}. Mirrors
 * the existing admin curator gallery routes' shape but scopes every
 * write to the authenticated member's own galleries.
 *
 * Authz model:
 *   - `requireAuth` middleware redirects unauthenticated requests to /login.
 *   - `requireTier1Benefits` middleware returns 403 for under-tiered
 *     members on every write route and on the two forms that lead to one
 *     (the new-gallery form and a gallery's edit form), so a member the
 *     write would refuse never reaches the form. The list itself stays
 *     open and carries the benefit text where its controls would be.
 *   - This controller asserts `req.user.slug === req.params.memberKey`;
 *     a mismatch returns 404 (anti-enumeration; matches the existing
 *     memberController convention so a probe for another member's
 *     gallery surface looks identical to a missing route).
 *   - The service layer (curatorMediaService) re-asserts both the tier
 *     check and ownership on every mutating call (defense-in-depth).
 *     A ForbiddenError surfaced from the service is mapped to a 403
 *     render by the central error middleware in app.ts.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import {
  getDefaultCuratorMediaService,
  memberGalleriesHref,
  parseTagList,
  parseExternalLinkInputs,
  createMemberGalleryWithUploads,
  updateMemberGalleryWithUploads,
  buildExternalLinkSlots,
  getMemberGalleryNewPage,
  getMemberGalleryEditPage,
  getMemberGalleryListPage,
  getMemberGalleryListErrorPage,
  type CuratorGalleryEditView,
} from '../services/curatorMediaService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { parseGalleryMultipart } from './galleryFormHelpers';
import { FLASH_KIND, writeFlash, takeMediaSavedFlash } from '../lib/flashCookie';
import { renderImageWorkerUnavailable, renderNotFound } from '../lib/controllerErrors';
import { isAdminCaller, isOwnMemberRoute } from '../lib/routeOwnership';
import { mediaService } from '../services/mediaService';

// Member-owned galleries scope to their owner via `#by_<slug>`, the
// system-managed uploader-attribution tag (parallel to `#curated` for
// FH uploads). The service's createGallery / updateGallery auto-prepend
// this tag after validation, so the gallery's tag-AND query filters
// to the owner's uploads even if the user supplies a topical-only
// criterion like `#footbag`. validateGalleryTag rejects `#by_*` from
// caller input, so the prepended tag cannot be forged.

const buildSvc = getDefaultCuratorMediaService;

// A form-encoded save carries no photos.
const NO_UPLOADS = { files: [], limitExceeded: false, droppedNamelessFile: false } as const;

function renderListWithError(
  req: Request,
  res: Response,
  status: number,
  errorMessage: string,
): void {
  res.status(status).render('members/galleries/list', getMemberGalleryListErrorPage(buildSvc(), {
    memberKey: req.params.memberKey,
    memberId: req.user!.userId,
    errorMessage,
  }));
}

export const memberGalleryController = {
  /** GET /members/:memberKey/galleries — list this member's own galleries. */
  getList(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      res.render('members/galleries/list', getMemberGalleryListPage(buildSvc(), {
        memberKey: req.params.memberKey,
        memberId: req.user!.userId,
        memberSlug: req.user!.slug,
        confirmDeleteId: typeof req.query.confirmDelete === 'string' ? req.query.confirmDelete : null,
        savedFlag: takeMediaSavedFlash(req, res),
        // The community examples the empty state teaches with are the media
        // service's to read; the builder decides whether the page asks for them.
        readCommunityExamples: (limit, backHref) =>
          mediaService.listRecentCommunityMedia(limit, backHref),
      }));
    } catch (err) {
      logger.error('member gallery list error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey/galleries/new — render new-gallery form. */
  getNew(req: Request, res: Response): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    res.render('members/galleries/new', getMemberGalleryNewPage(memberKey));
  },

  /** POST /members/:memberKey/galleries — create a new gallery (form-encoded
   * fast path) or create + upload files (multipart path; browser default
   * via the new-gallery form's enctype). The two paths converge after
   * field parsing. */
  async postCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    if (req.is('multipart/form-data')) {
      handleMultipartCreate(req, res, next);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const actorMemberId = req.user!.userId;
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagList(req.body?.criteriaTags);
      const excludeTags = parseTagList(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});

      // The owner is the session's member whatever the request carried.
      const result = await createMemberGalleryWithUploads(buildSvc(), {
        actorMemberId,
        actorIsAdmin: isAdminCaller(req),
        slug: req.user!.slug,
        updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
        uploadTags: [],
        uploads: NO_UPLOADS,
      });
      if (result.status !== 'refused') {
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'create');
        res.redirect(303, memberGalleriesHref(memberKey));
        return;
      }
      if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(result.httpStatus).render(
        'members/galleries/new',
        getMemberGalleryNewPage(memberKey, {
          errorMessage: result.message,
          fieldErrors: result.fieldErrors,
          gallery: {
            name,
            description,
            sortOrder: sortOrderRaw,
            criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
            excludeTagsString: (req.body?.excludeTags ?? '') as string,
          },
          externalLinks,
        }),
      );
    } catch (err) {
      logger.error('member gallery create error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey/galleries/:id/edit — render edit form. */
  getEdit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const galleryId = req.params.id;
      const memberId = req.user!.userId;
      const svc = buildSvc();
      try {
        // restrictToOwnerId enforces a 404 (not 403) when the gallery
        // exists but is not owned by the requesting member — matches
        // the anti-enumeration convention of the rest of /members/.
        const g = svc.getGalleryForEdit(galleryId, memberId, { memberKey });
        res.render(
          'members/galleries/edit',
          getMemberGalleryEditPage(memberKey, galleryId, {
            gallery: {
              id: g.id,
              name: g.name,
              description: g.description,
              sortOrder: g.sortOrder,
              criteriaTagsString: g.criteriaTagsDisplayString,
              excludeTagsString: g.excludeTags.join(' '),
              isDefault: g.isDefault,
            },
            currentItems: g.currentItems,
            currentItemsTruncated: g.currentItemsTruncated,
            uploadTags: g.criteriaTagsDisplayString,
            externalLinkSlots: buildExternalLinkSlots(null, g.externalLinks),
          }),
        );
      } catch (err) {
        if (err instanceof NotFoundError) {
          renderNotFound(res);
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },

  /** POST /members/:memberKey/galleries/:id/edit — apply edit. */
  async postUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    if (req.is('multipart/form-data')) {
      handleMultipartUpdate(req, res, next);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const actorIsAdmin = isAdminCaller(req);
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagList(req.body?.criteriaTags);
      const excludeTags = parseTagList(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});

      const svc = buildSvc();
      // A gallery that is not the member's own answers not-found, as the edit
      // page itself does.
      const result = await updateMemberGalleryWithUploads(svc, {
        actorMemberId,
        actorIsAdmin,
        slug: req.user!.slug,
        galleryId,
        updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
        uploadTags: [],
        uploads: NO_UPLOADS,
      });
      if (result.status === 'saved') {
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
        res.redirect(303, memberGalleriesHref(memberKey));
        return;
      }
      if (result.status === 'not_found') {
        renderNotFound(res);
        return;
      }
      if (result.httpStatus === 429) {
        if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds));
        renderListWithError(req, res, 429, result.message);
        return;
      }
      const reread = svc.getGalleryForEdit(galleryId, actorMemberId, { memberKey });
      res.status(422).render(
        'members/galleries/edit',
        getMemberGalleryEditPage(memberKey, galleryId, {
          errorMessage: result.message,
          fieldErrors: result.fieldErrors,
          gallery: {
            id: galleryId,
            name,
            description,
            sortOrder: sortOrderRaw,
            criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
            excludeTagsString: (req.body?.excludeTags ?? '') as string,
          },
          currentItems: reread.currentItems,
          currentItemsTruncated: reread.currentItemsTruncated,
          uploadTags: (req.body?.uploadTags ?? '') as string,
          externalLinkSlots: buildExternalLinkSlots(externalLinks, [], result.fieldErrors),
        }),
      );
    } catch (err) {
      logger.error('member gallery update error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/galleries/:id/delete — delete a gallery. */
  async postDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    if (req.body?.confirmed !== '1') {
      const memberKey = req.params.memberKey;
      res.redirect(303, `${memberGalleriesHref(memberKey)}?confirmDelete=${encodeURIComponent(req.params.id)}`);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const svc = buildSvc();
      try {
        // This is the member's own gallery route, so an administrator using it
        // acts as a member: only a gallery they own resolves, and a curated
        // gallery is deleted from the curator surface, never from here. A
        // wrong-owner attempt and a refused delete both answer 404 below; a
        // repeat of the member's own delete reports the same outcome.
        await svc.deleteGallery({ actorMemberId, actorIsAdmin: false, galleryId });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'delete');
        res.redirect(303, memberGalleriesHref(memberKey));
        return;
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError) {
          renderNotFound(res);
          return;
        }
        if (err instanceof RateLimitedError) {
          if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
          renderListWithError(req, res, 429, err.message);
          return;
        }
        throw err;
      }
    } catch (err) {
      logger.error('member gallery delete error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },
};

// Multipart variant of POST /members/:memberKey/galleries. Browsers reach
// this branch from the new-gallery form (enctype=multipart/form-data). The
// service checks every file before writing anything, creates the gallery,
// then uploads each file into it. No-files submits land here too and
// behave equivalent to the form-encoded fast path (gallery created, no
// uploads).
//
// Atomicity: gallery creation runs in its own transaction; each file
// upload runs in its own transaction. If a file upload fails partway
// through (e.g. storage put error), the gallery and any already-uploaded
// files persist. The user can retry the missing files via the standalone
// upload page. The atomicity design's "single transaction" commitment is kept on
// the read-side (file pre-validation rejects bad input before any DB
// write) and on the gallery side (no files written if gallery insert
// fails), but does not extend to forcing all media inserts into one
// transaction with the gallery insert.
function handleMultipartCreate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const memberKey = req.params.memberKey;
  parseGalleryMultipart(
    req,
    (parsed) => {
      void executeMultipartCreate({
        req, res, memberKey, ...parsed,
      }).catch((err: unknown) => {
        if (err instanceof ImageProcessingError) {
          renderImageWorkerUnavailable(res, 'member gallery upload: image worker unavailable', err);
          return;
        }
        logger.error('member gallery multipart create error', {
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

function handleMultipartUpdate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const memberKey = req.params.memberKey;
  const galleryId = req.params.id;
  parseGalleryMultipart(
    req,
    (parsed) => {
      void executeMultipartUpdate({
        req, res, memberKey, galleryId, ...parsed,
      }).catch((err: unknown) => {
        if (err instanceof ImageProcessingError) {
          renderImageWorkerUnavailable(res, 'member gallery upload: image worker unavailable', err);
          return;
        }
        logger.error('member gallery multipart update error', {
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

async function executeMultipartCreate(args: {
  req: Request;
  res: Response;
  memberKey: string;
  fields: Record<string, string>;
  photoFiles: Array<{ buffer: Buffer; filename: string }>;
  limitExceeded: boolean;
  droppedNamelessFile: boolean;
}): Promise<void> {
  const { req, res, memberKey, fields, photoFiles, limitExceeded, droppedNamelessFile } = args;
  const actorMemberId = req.user!.userId;
  const actorIsAdmin = isAdminCaller(req);
  const slug = req.user!.slug;

  const name = String(fields.name ?? '');
  const description = String(fields.description ?? '');
  const sortOrderRaw = String(fields.sortOrder ?? '');
  const criteriaTags = parseTagList(fields.criteriaTags);
  const excludeTags = parseTagList(fields.excludeTags);
  const uploadTagsRaw = (fields.uploadTags ?? '') as string;
  const uploadTags = parseTagList(uploadTagsRaw);
  const externalLinks = parseExternalLinkInputs(fields);

  const result = await createMemberGalleryWithUploads(buildSvc(), {
    actorMemberId,
    actorIsAdmin,
    slug,
    updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
    uploadTags,
    uploads: { files: photoFiles, limitExceeded, droppedNamelessFile },
  });
  if (result.status !== 'refused') {
    writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'create');
    res.redirect(303, memberGalleriesHref(memberKey));
    return;
  }
  if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds));
  res.status(result.httpStatus).render(
    'members/galleries/new',
    getMemberGalleryNewPage(memberKey, {
      errorMessage: result.message,
      fieldErrors: result.fieldErrors,
      gallery: {
        name,
        description,
        sortOrder: sortOrderRaw,
        criteriaTagsString: fields.criteriaTags ?? '',
        excludeTagsString: fields.excludeTags ?? '',
      },
      uploadTags: uploadTagsRaw,
      externalLinks,
    }),
  );
}

async function executeMultipartUpdate(args: {
  req: Request;
  res: Response;
  memberKey: string;
  galleryId: string;
  fields: Record<string, string>;
  photoFiles: Array<{ buffer: Buffer; filename: string }>;
  limitExceeded: boolean;
  droppedNamelessFile: boolean;
}): Promise<void> {
  const { req, res, memberKey, galleryId, fields, photoFiles, limitExceeded, droppedNamelessFile } = args;
  const actorMemberId = req.user!.userId;
  const actorIsAdmin = isAdminCaller(req);
  const slug = req.user!.slug;

  const name = String(fields.name ?? '');
  const description = String(fields.description ?? '');
  const sortOrderRaw = String(fields.sortOrder ?? '');
  const criteriaTags = parseTagList(fields.criteriaTags);
  const excludeTags = parseTagList(fields.excludeTags);
  const uploadTagsRaw = (fields.uploadTags ?? '') as string;
  const uploadTags = parseTagList(uploadTagsRaw);
  const externalLinks = parseExternalLinkInputs(fields);

  const svc = buildSvc();

  function rerenderError(
    status: number,
    errorMessage: string,
    fieldErrors?: Record<string, string>,
  ): void {
    let currentItems: CuratorGalleryEditView['currentItems'] = [];
    let currentItemsTruncated = false;
    let isDefault = false;
    try {
      const reread = svc.getGalleryForEdit(galleryId, actorMemberId, { memberKey });
      currentItems = reread.currentItems;
      currentItemsTruncated = reread.currentItemsTruncated;
      isDefault = reread.isDefault;
    } catch {
      /* gallery may have been deleted concurrently; render with empty items */
    }
    res.status(status).render(
      'members/galleries/edit',
      getMemberGalleryEditPage(memberKey, galleryId, {
        errorMessage,
        fieldErrors,
        gallery: {
          id: galleryId,
          name,
          description,
          sortOrder: sortOrderRaw,
          criteriaTagsString: fields.criteriaTags ?? '',
          excludeTagsString: fields.excludeTags ?? '',
          isDefault,
        },
        currentItems,
        currentItemsTruncated,
        uploadTags: uploadTagsRaw,
        externalLinkSlots: buildExternalLinkSlots(externalLinks, [], fieldErrors),
      }),
    );
  }

  const result = await updateMemberGalleryWithUploads(svc, {
    actorMemberId,
    actorIsAdmin,
    slug,
    galleryId,
    updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
    uploadTags,
    uploads: { files: photoFiles, limitExceeded, droppedNamelessFile },
  });
  if (result.status === 'not_found') {
    renderNotFound(res);
    return;
  }
  if (result.status === 'refused') {
    if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds));
    rerenderError(result.httpStatus, result.message, result.fieldErrors);
    return;
  }
  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
  res.redirect(303, memberGalleriesHref(memberKey));
}
