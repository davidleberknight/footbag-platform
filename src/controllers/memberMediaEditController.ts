/**
 * Member-owned per-item media edit and delete. Owner-only surface for
 * /members/:memberKey/media/:mediaId/edit (GET form, POST save) and
 * /members/:memberKey/media/:mediaId/delete (POST, permanent).
 *
 * Authz mirrors memberGalleryController / memberMediaUploadController:
 *   - requireAuth redirects unauthenticated requests to /login.
 *   - This controller asserts req.user.slug === req.params.memberKey;
 *     a mismatch returns 404 (anti-enumeration).
 *   - The service layer (curatorMediaService.editMemberMedia /
 *     .getMemberMediaItem) re-asserts ownership by loading the row
 *     scoped to the requesting member's id; a non-owned id returns
 *     null / NotFoundError, also rendered as 404.
 *
 * Tier gating: POST is gated by `requireTier1Benefits()`. GET is open
 * to all authenticated owners so the form is visible read-only on
 * tier 0 (the user can review their existing media without an upgrade
 * gate). The service's `assertTier1Benefits` re-enforces on save.
 *
 * Route ordering note: `/members/:memberKey/media/:mediaId/edit` is
 * registered after `/members/:memberKey/media/upload`, so the literal
 * segment `upload` matches the more-specific route first. Defense in
 * depth: this controller refuses `:mediaId === 'upload'` with a 404.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { getDefaultCuratorMediaService } from '../services/curatorMediaService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';
import { hashtagDiscoveryService, type MemberTagSuggestions } from '../services/hashtagDiscoveryService';

function isOwnRoute(req: Request): boolean {
  return req.user?.slug === req.params.memberKey;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo: { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

function galleriesHref(memberKey: string): string {
  return `/members/${memberKey}/galleries`;
}

function editHref(memberKey: string, mediaId: string): string {
  return `/members/${memberKey}/media/${mediaId}/edit`;
}

function parseTagsField(raw: string | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter((t) => t.length > 0);
}

const buildSvc = getDefaultCuratorMediaService;

interface FormValues {
  caption: string;
  tags: string;
  externalUrl: string;
}

function renderForm(
  res: Response,
  memberKey: string,
  mediaId: string,
  values: FormValues,
  opts: { status?: number; errorMessage?: string; tagSuggestions?: MemberTagSuggestions } = {},
): void {
  res.status(opts.status ?? 200).render('members/media/edit', {
    seo: { title: 'Edit Media' },
    page: { sectionKey: 'members', pageKey: 'member_media_edit', title: 'Edit Media' },
    formAction: editHref(memberKey, mediaId),
    deleteAction: `/members/${memberKey}/media/${mediaId}/delete`,
    cancelHref: galleriesHref(memberKey),
    errorMessage: opts.errorMessage,
    formValues: values,
    tagSuggestions: opts.tagSuggestions,
  });
}

export const memberMediaEditController = {
  /** GET /members/:memberKey/media/:mediaId/edit — render edit form. */
  getEdit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    if (req.params.mediaId === 'upload') {
      // Defense in depth against route-ordering regression: the literal
      // /media/upload route is meant to match first; if it doesn't,
      // 404 rather than treat the literal segment as an id.
      renderNotFound(res);
      return;
    }
    try {
      const memberId = req.user!.userId;
      const memberKey = req.params.memberKey;
      const mediaId = req.params.mediaId;
      const svc = buildSvc();
      const item = svc.getMemberMediaItem(mediaId, memberId);
      if (!item) {
        renderNotFound(res);
        return;
      }
      // Strip the auto-applied #by_<slug> uploader marker from the
      // editable tags string: the user did not type it, the service
      // re-adds it on save, and surfacing it in the textbox lets the
      // user accidentally delete it (validateTags would then reject
      // a free-form #by_* re-add).
      const uploaderTag = `#by_${req.user!.slug.toLowerCase()}`;
      const tagsString = item.tags.filter((t) => t.toLowerCase() !== uploaderTag).join(' ');
      const tagSuggestions = hashtagDiscoveryService.getTagSuggestionsForMember(memberId);
      renderForm(res, memberKey, mediaId, {
        caption: item.caption ?? '',
        tags: tagsString,
        externalUrl: item.externalUrl ?? '',
      }, { tagSuggestions });
    } catch (err) {
      logger.error('member media edit GET error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/media/:mediaId/edit — save edits. */
  async postUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    if (req.params.mediaId === 'upload') {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    const mediaId = req.params.mediaId;
    const memberId = req.user!.userId;
    const slug = req.user!.slug;

    const captionRaw = String(req.body?.caption ?? '').trim();
    const caption: string | null = captionRaw.length === 0 ? null : captionRaw;
    const tags = parseTagsField(req.body?.tags);
    const externalUrlRaw = String(req.body?.externalUrl ?? '').trim();
    const externalUrl: string | null = externalUrlRaw.length === 0 ? null : externalUrlRaw;

    try {
      const svc = buildSvc();
      await svc.editMemberMedia({
        memberId,
        actorIsAdmin: req.user?.role === 'admin',
        slug,
        mediaId,
        caption,
        tags,
        externalUrl,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'edit');
      res.redirect(303, galleriesHref(memberKey));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      if (err instanceof ValidationError) {
        renderForm(res, memberKey, mediaId, {
          caption: captionRaw,
          tags: (req.body?.tags ?? '') as string,
          externalUrl: externalUrlRaw,
        }, { status: 422, errorMessage: err.message });
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        renderForm(res, memberKey, mediaId, {
          caption: captionRaw,
          tags: (req.body?.tags ?? '') as string,
          externalUrl: externalUrlRaw,
        }, { status: 429, errorMessage: err.message });
        return;
      }
      logger.error('member media edit POST error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/media/:mediaId/delete — permanent delete of
   * an owned item with cascading tag removal. Mirrors the gallery-delete
   * flow: ownership 404s, success flashes and returns to the galleries
   * list. */
  async postDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnRoute(req)) {
      renderNotFound(res);
      return;
    }
    if (req.params.mediaId === 'upload') {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    const mediaId = req.params.mediaId;
    try {
      const svc = buildSvc();
      await svc.deleteMemberMedia({
        memberId: req.user!.userId,
        actorIsAdmin: req.user?.role === 'admin',
        mediaId,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'delete');
      res.redirect(303, galleriesHref(memberKey));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        renderForm(res, memberKey, mediaId, { caption: '', tags: '', externalUrl: '' }, {
          status: 429,
          errorMessage: err.message,
        });
        return;
      }
      logger.error('member media delete POST error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },
};
