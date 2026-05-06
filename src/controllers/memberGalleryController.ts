/**
 * Member-owned named-gallery routes. The owner-only surface for
 * /members/:memberKey/galleries/{,new,:id/edit,:id/delete}. Mirrors
 * the existing admin curator gallery routes' shape but scopes every
 * write to the authenticated member's own galleries.
 *
 * Authz model:
 *   - `requireAuth` middleware redirects unauthenticated requests to /login.
 *   - This controller asserts `req.user.slug === req.params.memberKey`;
 *     a mismatch returns 404 (anti-enumeration; matches the existing
 *     memberController convention so a probe for another member's
 *     gallery surface looks identical to a missing route).
 *   - The service layer (curatorMediaService) re-asserts ownership on
 *     every mutating call: actorIsAdmin OR actorMemberId === ownerMemberId.
 *
 * DEVIATION: today, any authenticated member may create/edit/delete
 * their own galleries — there is no tier gate at this level. Target:
 * gate on tier eligibility once the tier feature lands. The tier
 * ledger (member_tier_grants / member_tier_current) exists in schema;
 * no tier-required middleware or service-level tier check exists yet.
 */
import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { logger } from '../config/logger';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { createCuratorMediaService, PHOTO_MAX_BYTES } from '../services/curatorMediaService';
import { detectImageType } from '../lib/imageProcessing';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';

const MAX_FILES_PER_CREATE = 3;

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
}

// Member-owned galleries scope to their owner: every member upload
// carries `#<slug>` as the uploader tag (mirrors `#curated` for admin
// uploads), so the gallery's criteria-tag set must include `#<slug>`
// for the tag-AND match to filter to the owner's items. Without this,
// a member's "Funky Footbags" gallery with criteria `#footbag` would
// surface anyone's `#footbag` uploads, not just the owner's.
//
// Applied on create only. Edit leaves criteria alone, so the owner
// can curate the filter intentionally.
//
// Empty user-supplied criteria is left empty so the downstream
// validation ("at least one criteria tag required") still fires; the
// auto-slug should add to a deliberate filter, not stand in for one.
function prependSlugTagToCriteria(slug: string, criteriaTags: string[]): string[] {
  if (criteriaTags.length === 0) {
    return criteriaTags;
  }
  const slugTag = `#${slug.toLowerCase()}`;
  if (criteriaTags.some((t) => t.toLowerCase() === slugTag)) {
    return criteriaTags;
  }
  return [slugTag, ...criteriaTags];
}

function buildSvc(): ReturnType<typeof createCuratorMediaService> {
  return createCuratorMediaService({
    storage: getMediaStorageAdapter(),
    imageProcessor: getImageProcessingAdapter(),
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
      const savedFlag =
        req.query.saved === 'create' ? 'create' :
        req.query.saved === 'edit'   ? 'edit'   :
        req.query.saved === 'delete' ? 'delete' :
        req.query.saved === 'upload' ? 'upload' : null;
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
      const criteriaTags = prependSlugTagToCriteria(
        req.user!.slug,
        parseTagsField(req.body?.criteriaTags),
      );
      const excludeTags = parseTagsField(req.body?.excludeTags);

      const svc = buildSvc();
      try {
        // ownerMemberId is taken from the authenticated session, NOT the
        // request body. A forged owner id in the form is ignored: a
        // member can only create galleries owned by themselves.
        await svc.createGallery({
          actorMemberId,
          actorIsAdmin,
          ownerMemberId: actorMemberId,
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags },
        });
        res.redirect(`${listHref(memberKey)}?saved=create`);
        return;
      } catch (err) {
        if (err instanceof ValidationError || err instanceof ConflictError) {
          res.status(422).render('members/galleries/new', {
            seo: { title: 'Create Gallery' },
            page: { sectionKey: 'members', pageKey: 'member_galleries_new', title: 'Create Gallery' },
            formAction: listHref(memberKey),
            errorMessage: err.message,
            gallery: {
              name,
              description,
              sortOrder: sortOrderRaw,
              criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
              excludeTagsString: (req.body?.excludeTags ?? '') as string,
            },
            cancelHref: listHref(memberKey),
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
        res.render('members/galleries/edit', {
          seo: { title: 'Edit Gallery' },
          page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
          formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
          gallery: {
            id: g.id,
            name: g.name,
            description: g.description,
            sortOrder: g.sortOrder,
            criteriaTagsString: g.criteriaTags.join(' '),
            excludeTagsString: g.excludeTags.join(' '),
          },
          cancelHref: listHref(memberKey),
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
          updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags },
        });
        res.redirect(`${listHref(memberKey)}?saved=edit`);
        return;
      } catch (err) {
        if (err instanceof NotFoundError) {
          renderNotFound(res);
          return;
        }
        if (err instanceof ValidationError) {
          res.status(422).render('members/galleries/edit', {
            seo: { title: 'Edit Gallery' },
            page: { sectionKey: 'members', pageKey: 'member_galleries_edit', title: 'Edit Gallery' },
            formAction: `/members/${memberKey}/galleries/${galleryId}/edit`,
            errorMessage: err.message,
            gallery: {
              id: galleryId,
              name,
              description,
              sortOrder: sortOrderRaw,
              criteriaTagsString: (req.body?.criteriaTags ?? '') as string,
              excludeTagsString: (req.body?.excludeTags ?? '') as string,
            },
            cancelHref: listHref(memberKey),
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
        res.redirect(`${listHref(memberKey)}?saved=delete`);
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

  const fields: Record<string, string> = {};
  const photoFiles: Array<{ buffer: Buffer; filename: string }> = [];
  let limitExceeded = false;

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: PHOTO_MAX_BYTES, files: MAX_FILES_PER_CREATE, fields: 10 },
  });

  busboy.on('field', (name, val) => {
    fields[name] = val;
  });

  busboy.on('file', (name, stream, info) => {
    if (name !== 'photoFiles') {
      stream.resume();
      return;
    }
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on('limit', () => {
      limitExceeded = true;
    });
    stream.on('end', () => {
      if (!limitExceeded) {
        photoFiles.push({
          buffer: Buffer.concat(chunks),
          filename: info?.filename ?? '',
        });
      }
    });
  });

  busboy.on('finish', () => {
    void executeMultipartCreate({
      req, res, memberKey, fields, photoFiles, limitExceeded,
    }).catch((err: unknown) => {
      logger.error('member gallery multipart create error', {
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    });
  });

  busboy.on('error', (err: Error) => {
    logger.error('busboy parse error', { error: err.message });
    next(err);
  });

  req.pipe(busboy);
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
  const criteriaTags = prependSlugTagToCriteria(slug, parseTagsField(fields.criteriaTags));
  const excludeTags = parseTagsField(fields.excludeTags);

  function rerenderError(status: number, errorMessage: string): void {
    res.status(status).render('members/galleries/new', {
      seo: { title: 'Create Gallery' },
      page: { sectionKey: 'members', pageKey: 'member_galleries_new', title: 'Create Gallery' },
      formAction: listHref(memberKey),
      errorMessage,
      gallery: {
        name,
        description,
        sortOrder: sortOrderRaw,
        criteriaTagsString: fields.criteriaTags ?? '',
        excludeTagsString: fields.excludeTags ?? '',
      },
      cancelHref: listHref(memberKey),
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

  const svc = buildSvc();
  let galleryId: string;
  try {
    const created = await svc.createGallery({
      actorMemberId,
      actorIsAdmin,
      ownerMemberId: actorMemberId,
      updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags },
    });
    galleryId = created.id;
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      rerenderError(422, err.message);
      return;
    }
    throw err;
  }

  // Files inherit the gallery's criteria tags as the user-tags input;
  // the service auto-prepends #<slug>. Items therefore satisfy the
  // gallery's tag-AND query by construction. If criteriaTags includes
  // #curated (rare for member-owned galleries), the upload step will
  // reject and the gallery persists with no media — user can either
  // delete it or upload via the standalone /media/upload page.
  for (const f of photoFiles) {
    try {
      await svc.uploadPhotoForMember({
        memberId: actorMemberId,
        slug,
        photoBuffer: f.buffer,
        sourceFilename: f.filename,
        caption: null,
        tags: criteriaTags,
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

  res.redirect(`${listHref(memberKey)}?saved=create&galleryId=${galleryId}`);
}
