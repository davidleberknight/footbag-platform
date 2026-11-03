/**
 * Member-owned named-gallery routes. The owner-only surface for
 * /members/:memberKey/galleries/{,:id/edit,:id/delete}. A gallery is created
 * on the Share Media form by naming a set of hashtags, never here; this
 * surface lists, edits and deletes the member's own galleries.
 *
 * Authz model:
 *   - `requireAuth` middleware redirects unauthenticated requests to /login.
 *   - `requireTier1Benefits` middleware returns 403 for under-tiered
 *     members on every write route and on a gallery's edit form, so a member
 *     the write would refuse never reaches the form. The list itself stays
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
import {
  getDefaultCuratorMediaService,
  memberGalleriesHref,
  parseTagList,
  parseExternalLinkInputs,
  updateMemberGallery,
  buildExternalLinkSlots,
  getMemberGalleryEditPage,
  getMemberGalleryListPage,
  getMemberGalleryListErrorPage,
  changedTypedTags,
} from '../services/curatorMediaService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, takeMediaSaved, writeShareFlash } from '../lib/flashCookie';
import { renderNotFound } from '../lib/controllerErrors';
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
      const saved = takeMediaSaved(req, res);
      res.render('members/galleries/list', getMemberGalleryListPage(buildSvc(), {
        memberKey: req.params.memberKey,
        memberId: req.user!.userId,
        memberSlug: req.user!.slug,
        confirmDeleteId: typeof req.query.confirmDelete === 'string' ? req.query.confirmDelete : null,
        savedFlag: saved?.kind ?? null,
        savedFolded: saved?.folded ?? [],
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
            criteriaTags: g.criteriaTags,
            isDefault: g.isDefault,
            currentItems: g.currentItems,
            currentItemsTruncated: g.currentItemsTruncated,
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

  /** POST /members/:memberKey/galleries/:id/edit — apply edit, landing on the gallery. */
  async postUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberKey = req.params.memberKey;
      const galleryId = req.params.id;
      const actorMemberId = req.user!.userId;
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const sortOrderRaw = String(req.body?.sortOrder ?? '');
      const criteriaTags = parseTagList(req.body?.criteriaTags);
      const excludeTags = parseTagList(req.body?.excludeTags);
      const externalLinks = parseExternalLinkInputs(req.body ?? {});

      const svc = buildSvc();
      // A gallery that is not the member's own answers not-found, as the edit
      // page itself does.
      const result = await updateMemberGallery(svc, {
        actorMemberId,
        actorIsAdmin: isAdminCaller(req),
        galleryId,
        updates: { name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks },
      });
      if (result.status === 'saved') {
        writeShareFlash(res, req, {
          mediaId: null,
          count: 0,
          saved: true,
          gallery: { id: galleryId, name, tags: [], created: false },
          folded: changedTypedTags(req.body?.criteriaTags, req.body?.excludeTags),
          rejected: [],
        });
        res.redirect(303, result.landingHref);
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
            isDefault: reread.isDefault,
          },
          criteriaTags: reread.criteriaTags,
          isDefault: reread.isDefault,
          currentItems: reread.currentItems,
          currentItemsTruncated: reread.currentItemsTruncated,
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
