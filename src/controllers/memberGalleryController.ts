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
import { logger } from '../config/logger';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { createCuratorMediaService } from '../services/curatorMediaService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
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
        req.query.saved === 'delete' ? 'delete' : null;
      res.render('members/galleries/list', {
        seo: { title: 'My Galleries' },
        page: { sectionKey: 'members', pageKey: 'member_galleries_list', title: 'My Galleries' },
        content: {
          galleries,
          newGalleryHref: `/members/${memberKey}/galleries/new`,
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

  /** POST /members/:memberKey/galleries — create a new gallery. */
  async postCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
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
