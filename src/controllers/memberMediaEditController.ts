/**
 * Member-owned per-item media edit and delete. Owner-only surface for
 * /members/:memberKey/media/:mediaId/edit (GET form, POST save) and
 * /members/:memberKey/media/:mediaId/delete (GET confirm page, POST permanent).
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
 * Tier gating: both GET pages and both POSTs are gated by
 * `requireTier1Benefits()`. Losing the benefits costs the member nothing they
 * own: the item itself, its caption and its tags stay readable on the item's
 * own page, and only the form that would refuse the save goes away. The
 * service's `assertTier1Benefits` re-enforces on save.
 *
 * Route ordering note: `/members/:memberKey/media/:mediaId/edit` is
 * registered after `/members/:memberKey/media/upload`, so the literal
 * segment `upload` matches the more-specific route first. Defense in
 * depth: the route refuses `:mediaId === 'upload'` with a 404.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import {
  changedTypedTags,
  getDefaultCuratorMediaService,
  getMemberMediaEditPage,
  memberGalleriesHref,
  memberGalleryChips,
  memberItemLandingHref,
  parseTagList,
  type MemberMediaEditFormValues,
  type PlayerPickRequest,
} from '../services/curatorMediaService';
import { parsePickIntent } from '../services/memberPicker';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, writeShareFlash } from '../lib/flashCookie';
import { renderNotFound } from '../lib/controllerErrors';
import { statusForPage } from '../lib/searchRefusal';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';
import { isAdminCaller, isOwnMemberRoute } from '../lib/routeOwnership';
import { hashtagDiscoveryService, type MemberTagSuggestions } from '../services/hashtagDiscoveryService';

const buildSvc = getDefaultCuratorMediaService;

const mediaEditForm = z.object({
  caption: formText('Caption'),
  tags: formText('Hashtags'),
  externalUrl: formText('Link'),
  addPlayer: formOptionalText('The player to tag'),
  // The player picker's Search posts the form back under `pick`, with the
  // search text in `pick_q`; it saves nothing.
  pick: formOptionalText('The player picker'),
  pick_q: formText("Player's name"),
});

type FormValues = MemberMediaEditFormValues;

function renderForm(
  res: Response,
  memberKey: string,
  mediaId: string,
  values: FormValues,
  opts: {
    status?: number;
    errorMessage?: string;
    tagSuggestions?: MemberTagSuggestions;
    playerSearch?: PlayerPickRequest;
    owner?: { memberId: string; slug: string };
  } = {},
): void {
  const vm = getMemberMediaEditPage(memberKey, mediaId, values, {
    errorMessage: opts.errorMessage,
    tagSuggestions: opts.tagSuggestions,
    playerSearch: opts.playerSearch,
    galleryChips: opts.owner ? memberGalleryChips(buildSvc(), opts.owner.memberId) : [],
    memberSlug: opts.owner?.slug,
  });
  res.status(statusForPage(res, vm, opts.status ?? 200)).render('members/media/edit', vm);
}

export const memberMediaEditController = {
  /** GET /members/:memberKey/media/:mediaId/edit — render edit form. */
  getEdit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberId = req.user!.userId;
      const memberKey = req.params.memberKey;
      const mediaId = req.params.mediaId;
      const stored = buildSvc().getMemberMediaEditFormValues(mediaId, memberId, req.user!.slug);
      if (!stored) {
        renderNotFound(res);
        return;
      }
      const formValues = {
        caption: stored.caption,
        tags: stored.tags,
        externalUrl: stored.externalUrl,
      };
      const tagSuggestions = hashtagDiscoveryService.getTagSuggestionsForMember(memberId, req.user!.slug);
      renderForm(res, memberKey, mediaId, formValues, {
        tagSuggestions,
        owner: { memberId, slug: req.user!.slug },
      });
    } catch (err) {
      logger.error('member media edit GET error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/media/:mediaId/edit — save edits. */
  async postUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    const mediaId = req.params.mediaId;
    const memberId = req.user!.userId;
    const slug = req.user!.slug;

    const parsed = parseFormBody(mediaEditForm, req.body);
    if (!parsed.ok) {
      const s = parsed.submitted;
      try {
        renderForm(res, memberKey, mediaId, {
          caption: s.caption ?? '',
          tags: s.tags ?? '',
          externalUrl: s.externalUrl ?? '',
        }, { status: 422, errorMessage: parsed.message, owner: { memberId, slug } });
      } catch (err) {
        if (err instanceof NotFoundError) { renderNotFound(res); return; }
        next(err);
      }
      return;
    }
    const form = parsed.data;
    if (form.pick !== undefined) {
      // The player picker's Search: the form again, holding what was typed.
      // Saves nothing, so it takes no media-edit slot.
      try {
        renderForm(res, memberKey, mediaId, {
          caption: form.caption, tags: form.tags, externalUrl: form.externalUrl,
        }, {
          tagSuggestions: hashtagDiscoveryService.getTagSuggestionsForMember(memberId, slug),
          playerSearch: { intent: parsePickIntent(form.pick), query: form.pick_q, actorMemberId: memberId, ip: req.ip ?? 'unknown' },
          owner: { memberId, slug },
        });
      } catch (err) {
        next(err);
      }
      return;
    }
    const captionRaw = form.caption.trim();
    const caption: string | null = captionRaw.length === 0 ? null : captionRaw;
    const tags = parseTagList(form.tags);
    const externalUrlRaw = form.externalUrl.trim();
    const externalUrl: string | null = externalUrlRaw.length === 0 ? null : externalUrlRaw;

    try {
      const svc = buildSvc();
      await svc.editMemberMedia({
        memberId,
        actorIsAdmin: isAdminCaller(req),
        slug,
        mediaId,
        caption,
        tags,
        externalUrl,
        addPlayer: form.addPlayer,
      });
      writeShareFlash(res, req, {
        mediaId, count: 0, saved: true, gallery: null, folded: changedTypedTags(form.tags), rejected: [],
      });
      res.redirect(303, memberItemLandingHref(memberId, mediaId));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      if (err instanceof ValidationError) {
        renderForm(res, memberKey, mediaId, {
          caption: captionRaw,
          tags: form.tags,
          externalUrl: externalUrlRaw,
        }, { status: 422, errorMessage: err.message, owner: { memberId, slug } });
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        renderForm(res, memberKey, mediaId, {
          caption: captionRaw,
          tags: form.tags,
          externalUrl: externalUrlRaw,
        }, { status: 429, errorMessage: err.message, owner: { memberId, slug } });
        return;
      }
      logger.error('member media edit POST error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey/media/:mediaId/delete — confirm page naming the
   * item before the permanent delete below. */
  getDeleteConfirm(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const page = buildSvc().getMemberMediaDeleteConfirmPage(
        req.params.memberKey, req.params.mediaId, req.user!.userId, req.user!.slug,
      );
      if (!page) {
        renderNotFound(res);
        return;
      }
      res.render('members/media/delete-confirm', page);
    } catch (err) {
      logger.error('member media delete confirm GET error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/media/:mediaId/delete — permanent delete of
   * an owned item with cascading tag removal. Mirrors the gallery-delete
   * flow: ownership 404s, success flashes and returns to the galleries
   * list. */
  async postDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    const mediaId = req.params.mediaId;
    try {
      const svc = buildSvc();
      await svc.deleteMemberMedia({
        memberId: req.user!.userId,
        actorIsAdmin: isAdminCaller(req),
        mediaId,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, 'delete');
      res.redirect(303, memberGalleriesHref(memberKey));
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
