import { Request, Response, NextFunction } from 'express';
import {
  adminFlagNotice,
  clearFlagNotice,
  deleteDecisionNotice,
  getDefaultMediaModerationService,
  noActionDecisionNotice,
  retryRemovalNotice,
} from '../services/mediaModerationService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { z } from 'zod';
import { parseFormBody, formOptionalText } from '../lib/parseFormBody';

const reasonForm = z.object({ reason: formOptionalText('Reason') });
const adminFlagForm = z.object({
  reason_code: formOptionalText('The reason for the report'),
  reason_text: formOptionalText('Your note about the report'),
});

// A shape the form never sends is refused like any other fixable decision.
function read<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

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

export const adminMediaFlagsController = {
  /** GET /admin/media-flags */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      const decision = flash?.kind === FLASH_KIND.MEDIA_MODERATION_DECIDED ? flash.payload : null;
      if (flash) clearFlash(res, req);
      res.render(
        'admin/media-flags/index',
        getDefaultMediaModerationService().getAdminMediaFlagsPage({ decision }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/:mediaId/delete */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const form = read(reasonForm, req);
      const result = await getDefaultMediaModerationService().decideDelete({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
        reason:        form.reason,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, deleteDecisionNotice(result));
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
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, retryRemovalNotice(result));
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof NotFoundError) { renderWithError(res, 404, 'That media item no longer exists.'); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },

  /** POST /admin/media-flags/:mediaId/no-action */
  noAction(req: Request, res: Response, next: NextFunction): void {
    try {
      const form = read(reasonForm, req);
      const result = getDefaultMediaModerationService().decideNoAction({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
        reason:        form.reason,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, noActionDecisionNotice(result));
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
      const form = read(adminFlagForm, req);
      const result = getDefaultMediaModerationService().setFlagAsAdmin({
        mediaId:       req.params['mediaId'] ?? '',
        adminMemberId: req.user!.userId,
        reasonCode:    form.reason_code,
        reasonText:    form.reason_text,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, adminFlagNotice(result));
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
      const form = read(reasonForm, req);
      const result = getDefaultMediaModerationService().clearFlag({
        flagId:        req.params['flagId'] ?? '',
        adminMemberId: req.user!.userId,
        reason:        form.reason,
      });
      writeFlash(res, req, FLASH_KIND.MEDIA_MODERATION_DECIDED, clearFlagNotice(result));
      res.redirect(303, '/admin/media-flags');
    } catch (err) {
      if (err instanceof ValidationError) { renderWithError(res, 422, err.message); return; }
      if (err instanceof NotFoundError)   { renderWithError(res, 404, 'That report no longer exists.'); return; }
      handleControllerError(err, res, next, 'admin media flags controller');
    }
  },
};
