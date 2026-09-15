import type { Request, Response, NextFunction } from 'express';
import { adminTagService } from '../services/adminTagService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';

const CONTEXT = 'admin tag controller';

function bodyValue(req: Request, field: string): string {
  return String(req.body?.[field] ?? '');
}

function isHandled(err: unknown): err is NotFoundError | ValidationError | ConflictError {
  return err instanceof NotFoundError
    || err instanceof ValidationError
    || err instanceof ConflictError;
}

/**
 * Re-render the lookup carrying the error, with the hashtag still typed in, so
 * a refused act comes back on the page the administrator was working on. A
 * hashtag that resolves to nothing is reported the same way rather than as a
 * 404: the administrator typed it, and the page that took the text is where
 * the correction belongs.
 */
function renderLookupError(res: Response, query: string, message: string): void {
  res.status(422).render(
    'admin/tags/index',
    adminTagService.getTagLookupPage(query, { errorMessage: message }),
  );
}

export const adminTagController = {
  /** GET /admin/tags */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      const flash = readFlash(req);
      let outcome: string | null = null;
      if (flash?.kind === FLASH_KIND.TAG_RETIRED) {
        outcome = flash.payload ?? null;
        clearFlash(res, req);
      }
      res.render('admin/tags/index', adminTagService.getTagLookupPage(query, { outcome }));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/tags/retire */
  preview(req: Request, res: Response, next: NextFunction): void {
    const tag = bodyValue(req, 'tag');
    try {
      res.render('admin/tags/confirm', adminTagService.previewRetirement(
        tag, bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderLookupError(res, tag, err.message); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/tags/retire/confirm */
  confirm(req: Request, res: Response, next: NextFunction): void {
    const tag = bodyValue(req, 'tag');
    try {
      const outcome = adminTagService.applyRetirement(
        req.user!.userId, tag, bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.TAG_RETIRED, outcome);
      res.redirect(303, '/admin/tags');
    } catch (err) {
      if (isHandled(err)) { renderLookupError(res, tag, err.message); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
