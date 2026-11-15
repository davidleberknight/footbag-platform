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
import { renderInvalidRequest, renderNotFound } from '../lib/controllerErrors';
import { config } from '../config/env';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';
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

// One label and one URL input per link slot the form draws.
const linkFields: Record<string, ReturnType<typeof formText>> = {};
for (let i = 0; i < config.galleryMaxExternalLinks; i++) {
  linkFields[`externalLinkLabel${i}`] = formText(`Link ${i + 1} label`);
  linkFields[`externalLinkUrl${i}`] = formText(`Link ${i + 1} URL`);
}

const galleryEditForm = z.object({
  name: formText('Name'),
  description: formText('Description'),
  sortOrder: formText('Sort order'),
  criteriaTags: formText('Criteria hashtags'),
  excludeTags: formText('Exclude hashtags'),
  // Absent when the form offered no cover choice, which keeps the stored one.
  coverMediaId: formOptionalText('Cover'),
  ...linkFields,
});

const galleryDeleteForm = z.object({ confirmed: formOptionalText('The confirmation') });

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
            memberId,
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
            coverChoice: g.coverChoice,
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
      const svc = buildSvc();
      // The edit form re-rendered at 422 with the member's own work, for a
      // shape refusal here or a content refusal from the service below.
      const renderRefused = (
        message: string,
        fieldErrors: Record<string, string> | undefined,
        typed: Record<string, string | undefined>,
        externalLinks: ReturnType<typeof parseExternalLinkInputs>,
      ): void => {
        const reread = svc.getGalleryForEdit(galleryId, actorMemberId, {
          memberKey, selectedCoverMediaId: typed.coverMediaId,
        });
        res.status(422).render(
          'members/galleries/edit',
          getMemberGalleryEditPage(memberKey, galleryId, {
            memberId: actorMemberId,
            errorMessage: message,
            fieldErrors,
            gallery: {
              id: galleryId,
              name: typed.name ?? '',
              description: typed.description ?? '',
              sortOrder: typed.sortOrder ?? '',
              criteriaTagsString: typed.criteriaTags ?? '',
              excludeTagsString: typed.excludeTags ?? '',
              isDefault: reread.isDefault,
            },
            criteriaTags: reread.criteriaTags,
            isDefault: reread.isDefault,
            currentItems: reread.currentItems,
            currentItemsTruncated: reread.currentItemsTruncated,
            coverChoice: reread.coverChoice,
            externalLinkSlots: buildExternalLinkSlots(externalLinks, [], fieldErrors),
          }),
        );
      };

      const parsed = parseFormBody(galleryEditForm, req.body);
      if (!parsed.ok) {
        try {
          renderRefused(parsed.message, parsed.fieldErrors, parsed.submitted, parseExternalLinkInputs(parsed.submitted));
        } catch (err) {
          // Not the member's own gallery: the same answer the edit page gives.
          if (err instanceof NotFoundError) { renderNotFound(res); return; }
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
      const coverMediaId = form.coverMediaId;

      // A gallery that is not the member's own answers not-found, as the edit
      // page itself does.
      const result = await updateMemberGallery(svc, {
        actorMemberId,
        actorIsAdmin: isAdminCaller(req),
        galleryId,
        updates: {
          name, description, sortOrder: sortOrderRaw, criteriaTags, excludeTags, externalLinks, coverMediaId,
        },
      });
      if (result.status === 'saved') {
        writeShareFlash(res, req, {
          mediaId: null,
          count: 0,
          saved: true,
          gallery: { id: galleryId, name, tags: [], created: false },
          folded: changedTypedTags(form.criteriaTags, form.excludeTags),
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
      renderRefused(result.message, result.fieldErrors, form, externalLinks);
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
    const parsedDelete = parseFormBody(galleryDeleteForm, req.body);
    if (!parsedDelete.ok) { renderInvalidRequest(res, { title: parsedDelete.message }); return; }
    if (parsedDelete.data.confirmed !== '1') {
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
