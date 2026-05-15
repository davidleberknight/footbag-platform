/**
 * Member-owned named-gallery routes. The owner-only surface for
 * /members/:memberKey/galleries/{,new,:id/edit,:id/delete}. Mirrors
 * the existing admin curator gallery routes' shape but scopes every
 * write to the authenticated member's own galleries.
 *
 * Authz model:
 *   - `requireAuth` middleware redirects unauthenticated requests to /login.
 *   - `requireTier1Benefits` middleware returns 403 for under-tiered
 *     members on the four POST routes (create / edit / delete / upload).
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
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { createCuratorMediaService, PHOTO_MAX_BYTES, UPLOADER_TAG_PREFIX } from '../services/curatorMediaService';
import { detectImageType } from '../lib/imageProcessing';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { parseExternalLinkInputs, buildExternalLinkSlots, parseGalleryMultipart, lazyImageProcessor } from './galleryFormHelpers';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

type MediaSavedSubKind = 'create' | 'edit' | 'delete' | 'upload';

function readMediaSavedFlag(req: Request, res: Response): MediaSavedSubKind | null {
  const flash = readFlash(req);
  if (flash?.kind !== FLASH_KIND.MEDIA_SAVED) return null;
  clearFlash(res);
  const p = flash.payload;
  if (p === 'create' || p === 'edit' || p === 'delete' || p === 'upload') return p;
  return null;
}

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
}

// Strip the auto-applied uploader marker from a criteria-tag list so
// the merge into per-file upload tags doesn't double-add it (the
// service's applyTagsForMember re-prepends it on every upload).
function nonUploaderCriteria(criteriaTags: string[]): string[] {
  return criteriaTags.filter((t) => !t.toLowerCase().startsWith(UPLOADER_TAG_PREFIX));
}

// Case-insensitive uniq-merge across multiple tag lists. Preserves
// the first-seen casing of each tag and the cross-list order.
function mergeTags(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const t of list) {
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
  }
  return out;
}

// Member-owned galleries scope to their owner via `#by_<slug>`, the
// system-managed uploader-attribution tag (parallel to `#curated` for
// FH uploads). The service's createGallery / updateGallery auto-prepend
// this tag after validation, so the gallery's tag-AND query filters
// to the owner's uploads even if the user supplies a topical-only
// criterion like `#footbag`. validateGalleryTag rejects `#by_*` from
// caller input, so the prepended tag cannot be forged.

function buildSvc(): ReturnType<typeof createCuratorMediaService> {
  // Lazy image adapter so list / read routes (member galleries list,
  // gallery edit page render) do not pull the image worker secret.
  // The image adapter throws on first resolution if INTERNAL_EVENT_SECRET
  // is unset; the wrapper defers to the actual processPhoto call.
  return createCuratorMediaService({
    storage: getMediaStorageAdapter(),
    imageProcessor: lazyImageProcessor(),
  });
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

export const memberGalleryController = {
  /** GET /members/:memberKey/galleries — list this member's own galleries. */
  getList(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const memberId = req.user!.userId;
      const svc = buildSvc();
      const summaries = svc.listGalleriesForOwner(memberId);
      const galleries = summaries.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        sortOrder: g.sortOrder,
        criteriaTags: g.criteriaTags,
        excludeTags: g.excludeTags,
        itemCount: g.itemCount,
        editHref: `/members/${memberKey}/galleries/${g.id}/edit`,
        deleteHref: `/members/${memberKey}/galleries/${g.id}/delete`,
      }));
      const savedFlag = readMediaSavedFlag(req, res);
      res.render('members/galleries/list', {
        seo: { title: 'My Galleries' },
        page: { sectionKey: 'members', pageKey: 'member_galleries_list', title: 'My Galleries' },
        content: {
          galleries,
          newGalleryHref: `/members/${memberKey}/galleries/new`,
          uploadMediaHref: `/members/${memberKey}/media/upload`,
          savedFlag,
        },
      });
    } catch (err) {
      logger.error('member gallery list error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey/galleries/new — render new-gallery form. */
  getNew(req: Request, res: Response): void {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    res.render('members/galleries/new', {
      seo: { title: 'Create Gallery' },
      page: { sectionKey: 'members', pageKey: 'member_galleries_new', title: 'Create Gallery' },
      formAction: listHref(memberKey),
      gallery: { name: '', description: '', sortOrder: 'upload_desc', criteriaTagsString: '', excludeTagsString: '' },
      cancelHref: listHref(memberKey),
      uploadTags: '',
      externalLinkSlots: buildExternalLinkSlots(null, []),
    });
  },

  /** POST /members/:memberKey/galleries — create a new gallery (form-encoded
   * fast path) or create + upload files (multipart path; browser default
   * via the new-gallery form's enctype). The two paths converge after
   * field parsing. */
  async postCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnRoute(req)) {
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
      const actorIsAdmin = req.user!.role === 'admin';
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagsField(req.body?.criteriaTags);
      const excludeTags = parseTagsField(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});

      const svc = buildSvc();
      try {
        // ownerMemberId is taken from the authenticated session, NOT the
        // request body. A forged owner id in the form is ignored: a
        // member can only create galleries owned by themselves.
        await svc.createGallery({
          actorMemberId,
          actorIsAdmin,
          ownerMemberId: actorMemberId,
          ownerSlug: req.user!.slug,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
        });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'create');
        res.redirect(303, listHref(memberKey));
        return;
      } catch (err) {
        if (err instanceof ValidationError || err instanceof ConflictError) {
          const fieldErrors = err instanceof ValidationError ? err.fieldErrors : undefined;
          res.status(422).render('members/galleries/new', {
            seo: { title: 'Create Gallery' },
            page: { sectionKey: 'members', pageKey: 'member_galleries_new', title: 'Create Gallery' },
            formAction: listHref(memberKey),
            errorMessage: err.message,
            fieldErrors,
            gallery: {
              name,
              description,
              sortOrder: sortOrderRaw,
              criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
              excludeTagsString: (req.body?.excludeTags ?? '') as string,
            },
            cancelHref: listHref(memberKey),
            uploadTags: '',
            externalLinkSlots: buildExternalLinkSlots(externalLinks, [], fieldErrors),
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      logger.error('member gallery create error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey/galleries/:id/edit — render edit form. */
  getEdit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnRoute(req)) {
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
        const g = svc.getGalleryForEdit(galleryId, memberId);
        // currentItems already include thumbnailUrl/caption/etc; here we
        // tack on the per-item editHref (controller knows the route layout,
        // service does not).
        const currentItems = g.currentItems.map((item) => ({
          ...item,
          editHref: `/members/${memberKey}/media/${item.mediaId}/edit`,
        }));
        const criteriaTagsString = g.criteriaTags
          .filter((t) => !t.startsWith(UPLOADER_TAG_PREFIX))
          .join(' ');
        res.render('members/galleries/edit', {
          seo: { title: 'Edit Gallery' },
          page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
          formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
          gallery: {
            id: g.id,
            name: g.name,
            description: g.description,
            sortOrder: g.sortOrder,
            criteriaTagsString,
            excludeTagsString: g.excludeTags.join(' '),
          },
          cancelHref: listHref(memberKey),
          uploadMediaHref: `/members/${memberKey}/media/upload`,
          currentItems,
          // Pre-fill the upload widget's tag input with the gallery's
          // criteria as a suggestion. User-editable; user-supplied value
          // is what gets applied to uploads (no auto-stamping).
          uploadTags: criteriaTagsString,
          externalLinkSlots: buildExternalLinkSlots(null, g.externalLinks),
        });
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
    if (!isOwnRoute(req)) {
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
      const actorIsAdmin = req.user!.role === 'admin';
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagsField(req.body?.criteriaTags);
      const excludeTags = parseTagsField(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});

      const svc = buildSvc();
      try {
        // Pre-check ownership so a member trying to update someone
        // else's gallery sees the same 404 the GET path returns. The
        // service's authz would also reject this, but with
        // ValidationError → 422; the read pre-check makes the GET/POST
        // surfaces consistent on the wrong-owner case.
        svc.getGalleryForEdit(galleryId, actorMemberId);
        await svc.updateGallery({
          actorMemberId,
          actorIsAdmin,
          galleryId,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
        });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
        res.redirect(303, listHref(memberKey));
        return;
      } catch (err) {
        if (err instanceof NotFoundError) {
          renderNotFound(res);
          return;
        }
        if (err instanceof ValidationError) {
          const reread = svc.getGalleryForEdit(galleryId, actorMemberId);
          const currentItems = reread.currentItems.map((item) => ({
            ...item,
            editHref: `/members/${memberKey}/media/${item.mediaId}/edit`,
          }));
          res.status(422).render('members/galleries/edit', {
            seo: { title: 'Edit Gallery' },
            page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
            formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
            errorMessage: err.message,
            fieldErrors: err.fieldErrors,
            gallery: {
              id: galleryId,
              name,
              description,
              sortOrder: sortOrderRaw,
              criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
              excludeTagsString: (req.body?.excludeTags ?? '') as string,
            },
            cancelHref: listHref(memberKey),
            uploadMediaHref: `/members/${memberKey}/media/upload`,
            currentItems,
            uploadTags: (req.body?.uploadTags ?? '') as string,
            externalLinkSlots: buildExternalLinkSlots(externalLinks, [], err.fieldErrors),
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      logger.error('member gallery update error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/galleries/:id/delete — delete a gallery. */
  async postDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const actorIsAdmin = req.user!.role === 'admin';
      const svc = buildSvc();
      try {
        // Same pre-check as postUpdate so a wrong-owner attempt sees 404
        // rather than the service-layer ValidationError that would
        // otherwise surface here.
        svc.getGalleryForEdit(galleryId, actorMemberId);
        await svc.deleteGallery({ actorMemberId, actorIsAdmin, galleryId });
        writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'delete');
        res.redirect(303, listHref(memberKey));
        return;
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError) {
          renderNotFound(res);
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
// this branch from the new-gallery form (enctype=multipart/form-data).
// Parses fields + photo files via busboy, pre-validates each file
// (size + magic bytes) so a bad file does not leave behind a dangling
// gallery row, creates the gallery, then uploads each file with the
// gallery's criteria tags as the user-tags input. The slug-tag is
// auto-prepended in the service. No-files submits land here too and
// behave equivalent to the form-encoded fast path (gallery created, no
// uploads).
//
// Atomicity: gallery creation runs in its own transaction; each file
// upload runs in its own transaction. If a file upload fails partway
// through (e.g. storage put error), the gallery and any already-uploaded
// files persist. The user can retry the missing files via the standalone
// upload page. The plan's "single transaction" commitment is kept on
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
}): Promise<void> {
  const { req, res, memberKey, fields, photoFiles, limitExceeded } = args;
  const actorMemberId = req.user!.userId;
  const actorIsAdmin = req.user!.role === 'admin';
  const slug = req.user!.slug;

  const name = String(fields.name ?? '');
  const description = String(fields.description ?? '');
  const sortOrderRaw = String(fields.sortOrder ?? '');
  const criteriaTags = parseTagsField(fields.criteriaTags);
  const excludeTags = parseTagsField(fields.excludeTags);
  // uploadTags is the user-supplied tag list applied to each uploaded
  // file. NOT auto-stamped from the gallery's criteria. The form
  // pre-fills it with the criteria as a suggestion; user can keep,
  // edit, or clear. Empty → uploaded items get only the auto
  // `#by_<slug>` and won't appear in the gallery.
  const uploadTagsRaw = (fields.uploadTags ?? '') as string;
  const uploadTags = parseTagsField(uploadTagsRaw);
  const externalLinks = parseExternalLinkInputs(fields);

  const svc = buildSvc();

  function rerenderError(
    status: number,
    errorMessage: string,
    fieldErrors?: Record<string, string>,
  ): void {
    res.status(status).render('members/galleries/new', {
      seo: { title: 'Create Gallery' },
      page: { sectionKey: 'members', pageKey: 'member_galleries_new', title: 'Create Gallery' },
      formAction: listHref(memberKey),
      errorMessage,
      fieldErrors,
      gallery: {
        name,
        description,
        sortOrder: sortOrderRaw,
        criteriaTagsString: fields.criteriaTags ?? '',
        excludeTagsString: fields.excludeTags ?? '',
      },
      cancelHref: listHref(memberKey),
      uploadTags: uploadTagsRaw,
      externalLinkSlots: buildExternalLinkSlots(externalLinks, [], fieldErrors),
    });
  }

  if (limitExceeded) {
    rerenderError(422, `File exceeded the maximum allowed size of ${Math.floor(PHOTO_MAX_BYTES / (1024 * 1024))} MB.`);
    return;
  }

  // Pre-validate every file before touching the gallery so a bad file
  // does not leave behind a dangling gallery row. Magic-byte detection
  // matches the existing curator-upload path (no gif / pdf / text).
  for (const f of photoFiles) {
    if (f.buffer.length > PHOTO_MAX_BYTES) {
      rerenderError(422, 'Photo is too large. Maximum size is 25 MB.');
      return;
    }
    if (!detectImageType(f.buffer)) {
      rerenderError(422, 'Only JPEG and PNG photos are accepted.');
      return;
    }
  }

  try {
    await svc.createGallery({
      actorMemberId,
      actorIsAdmin,
      ownerMemberId: actorMemberId,
      ownerSlug: slug,
      updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      const fieldErrors = err instanceof ValidationError ? err.fieldErrors : undefined;
      rerenderError(422, err.message, fieldErrors);
      return;
    }
    throw err;
  }

  // Uploaded files get the gallery's non-#by_* criteria tags (auto-
  // stamped so files land in the gallery without the user having to
  // re-type them) merged with any explicit uploadTags the user added.
  // The service's applyTagsForMember re-prepends #by_<slug> on save.
  const autoStampTags = nonUploaderCriteria(criteriaTags);
  const finalUploadTags = mergeTags(autoStampTags, uploadTags);
  for (const f of photoFiles) {
    try {
      await svc.uploadPhotoForMember({
        memberId: actorMemberId,
        slug,
        photoBuffer: f.buffer,
        sourceFilename: f.filename,
        caption: null,
        tags: finalUploadTags,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        rerenderError(
          422,
          `Gallery "${name}" was created, but uploading "${f.filename}" failed: ${err.message}`,
        );
        return;
      }
      throw err;
    }
  }

  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'create');
  res.redirect(303, listHref(memberKey));
}

async function executeMultipartUpdate(args: {
  req: Request;
  res: Response;
  memberKey: string;
  galleryId: string;
  fields: Record<string, string>;
  photoFiles: Array<{ buffer: Buffer; filename: string }>;
  limitExceeded: boolean;
}): Promise<void> {
  const { req, res, memberKey, galleryId, fields, photoFiles, limitExceeded } = args;
  const actorMemberId = req.user!.userId;
  const actorIsAdmin = req.user!.role === 'admin';
  const slug = req.user!.slug;

  const name = String(fields.name ?? '');
  const description = String(fields.description ?? '');
  const sortOrderRaw = String(fields.sortOrder ?? '');
  const criteriaTags = parseTagsField(fields.criteriaTags);
  const excludeTags = parseTagsField(fields.excludeTags);
  const uploadTagsRaw = (fields.uploadTags ?? '') as string;
  const uploadTags = parseTagsField(uploadTagsRaw);
  const externalLinks = parseExternalLinkInputs(fields);

  const svc = buildSvc();

  function rerenderError(
    status: number,
    errorMessage: string,
    fieldErrors?: Record<string, string>,
  ): void {
    let currentItems: Array<{ mediaId: string; thumbnailUrl: string; caption: string | null; sourceFilename: string; mediaType: 'photo' | 'video'; editHref: string }> = [];
    try {
      const reread = svc.getGalleryForEdit(galleryId, actorMemberId);
      currentItems = reread.currentItems.map((item) => ({
        ...item,
        editHref: `/members/${memberKey}/media/${item.mediaId}/edit`,
      }));
    } catch {
      /* gallery may have been deleted concurrently; render with empty items */
    }
    res.status(status).render('members/galleries/edit', {
      seo: { title: 'Edit Gallery' },
      page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
      formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
      errorMessage,
      fieldErrors,
      gallery: {
        id: galleryId,
        name,
        description,
        sortOrder: sortOrderRaw,
        criteriaTagsString: fields.criteriaTags ?? '',
        excludeTagsString: fields.excludeTags ?? '',
      },
      cancelHref: listHref(memberKey),
      uploadMediaHref: `/members/${memberKey}/media/upload`,
      currentItems,
      uploadTags: uploadTagsRaw,
      externalLinkSlots: buildExternalLinkSlots(externalLinks, [], fieldErrors),
    });
  }

  if (limitExceeded) {
    rerenderError(422, `File exceeded the maximum allowed size of ${Math.floor(PHOTO_MAX_BYTES / (1024 * 1024))} MB.`);
    return;
  }

  for (const f of photoFiles) {
    if (f.buffer.length > PHOTO_MAX_BYTES) {
      rerenderError(422, 'Photo is too large. Maximum size is 25 MB.');
      return;
    }
    if (!detectImageType(f.buffer)) {
      rerenderError(422, 'Only JPEG and PNG photos are accepted.');
      return;
    }
  }

  try {
    // Pre-check ownership so wrong-owner edits surface as 404 (matches
    // the GET path) rather than 422.
    svc.getGalleryForEdit(galleryId, actorMemberId);
    await svc.updateGallery({
      actorMemberId,
      actorIsAdmin,
      galleryId,
      updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      renderNotFound(res);
      return;
    }
    if (err instanceof ValidationError) {
      rerenderError(422, err.message, err.fieldErrors);
      return;
    }
    throw err;
  }

  // Auto-stamp the gallery's current criteria (post-update) onto each
  // upload so files land in the gallery without the user re-typing.
  // Mirrors handleMultipartCreate.
  const autoStampTags = nonUploaderCriteria(criteriaTags);
  const finalUploadTags = mergeTags(autoStampTags, uploadTags);
  for (const f of photoFiles) {
    try {
      await svc.uploadPhotoForMember({
        memberId: actorMemberId,
        slug,
        photoBuffer: f.buffer,
        sourceFilename: f.filename,
        caption: null,
        tags: finalUploadTags,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        rerenderError(
          422,
          `Gallery saved, but uploading "${f.filename}" failed: ${err.message}`,
        );
        return;
      }
      throw err;
    }
  }

  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
  res.redirect(303, listHref(memberKey));
}
