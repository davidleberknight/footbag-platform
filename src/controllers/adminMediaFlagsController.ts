import { Request, Response, NextFunction } from 'express';
import { getDefaultMediaModerationService } from '../services/mediaModerationService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

function sendRateLimited(res: Response, err: RateLimitedError): void {
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(429).type('text/plain').send(err.message);
}

function renderWithError(res: Response, status: number, message: string): void {
  res.status(status).render(
    'admin/media-flags/index',
    getDefaultMediaModerationService().getAdminMediaFlagsPage({ errorMessage: message }),
  );
}

/**
 * The banner an administrator reads after a decision. A hidden item whose stored
 * files survived is the one outcome that still needs them, so it says so plainly
 * rather than reporting a clean removal.
 */
const DECISION_NOTICES: Record<string, string> = {
  deleted:            'The item is hidden and its stored files were removed.',
  deleted_no_storage: 'The item is hidden, but its stored files could not be removed. Run Remove again to retry.',
  no_action:          'The reports are closed and the item is unchanged.',
  already_settled:    'Another administrator decided that item first, so nothing changed.',
  already_hidden:     'That item was already hidden. The stored files were removed.',
  already_hidden_no_storage: 'That item was already hidden, and its stored files still could not be removed.',
  cleared:            'The report is cleared.',
  retry_removed:      'The stored files are removed.',
  retry_failed:       'The stored files still could not be removed. The item stays on the list below until they go.',
  retry_not_needed:   'That item is visible, so it has no stored files owed.',
  flagged:            'Your report was added.',
  already_flagged:    'You have already reported that item, so nothing changed.',
};

export const adminMediaFlagsController = {
  /** GET /admin/media-flags */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      const notice = flash?.kind === FLASH_KIND.MEDIA_MODERATION_DECIDED
        ? DECISION_NOTICES[String(flash.payload)] ?? undefined
        : undefined;
      if (flash) clearFlash(res, req);
      res.render(
        'admin/media-flags/index',
        getDefaultMediaModerationService().getAdminMediaFlagsPage({ noticeMessage: notice }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/:mediaId/delete */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await getDefaultMediaModerationService().decideDelete({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
        reason:        req.body?.reason,
      });
      const payload = result.status === 'decided'
        ? (result.storageRemoved ? 'deleted' : 'deleted_no_storage')
        : result.status === 'already_hidden'
          ? (result.storageRemoved ? 'already_hidden' : 'already_hidden_no_storage')
          : 'already_settled';
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, payload);
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof ValidationError) { renderWithError(res, 422, err.message); return; }
      if (err instanceof NotFoundError)   { renderWithError(res, 404, 'That media item no longer exists.'); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/:mediaId/retry-removal */
  async retryRemoval(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await getDefaultMediaModerationService().retryStorageRemoval({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
      });
      const payload = result.status === 'removed'
        ? 'retry_removed'
        : result.status === 'still_failing' ? 'retry_failed' : 'retry_not_needed';
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, payload);
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof NotFoundError) { renderWithError(res, 404, 'That media item no longer exists.'); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/:mediaId/no-action */
  noAction(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = getDefaultMediaModerationService().decideNoAction({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
        reason:        req.body?.reason,
      });
      writeFlash(
        res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED,
        result.status === 'decided' ? 'no_action' : 'already_settled',
      );
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof ValidationError) { renderWithError(res, 422, err.message); return; }
      if (err instanceof NotFoundError)   { renderWithError(res, 404, 'That media item no longer exists.'); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/:mediaId/flag */
  flag(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = getDefaultMediaModerationService().setFlagAsAdmin({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
        reasonCode:    req.body?.reason_code,
        reasonText:    req.body?.reason_text,
      });
      writeFlash(
        res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED,
        result.status === 'recorded' ? 'flagged' : 'already_flagged',
      );
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof ValidationError)  { renderWithError(res, 422, err.message); return; }
      if (err instanceof NotFoundError)    { renderWithError(res, 404, 'That media item no longer exists.'); return; }
      if (err instanceof RateLimitedError) { sendRateLimited(res, err); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/flags/:flagId/clear */
  clearFlag(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = getDefaultMediaModerationService().clearFlag({
        flagId:        req.params['flagId'] ?? '',
        adminMemberId: req.user!.userId,
        reason:        req.body?.reason,
      });
      writeFlash(
        res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED,
        result.status === 'cleared' ? 'cleared' : 'already_settled',
      );
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof ValidationError) { renderWithError(res, 422, err.message); return; }
      if (err instanceof NotFoundError)   { renderWithError(res, 404, 'That report no longer exists.'); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },
};
