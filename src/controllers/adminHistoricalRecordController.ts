import type { Request, Response, NextFunction } from 'express';
import { adminHistoricalRecordService } from '../services/adminHistoricalRecordService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';

const CONTEXT = 'admin historical record controller';

function isHandled(err: unknown): err is NotFoundError | ValidationError | ConflictError {
  return err instanceof NotFoundError
    || err instanceof ValidationError
    || err instanceof ConflictError;
}

/** Re-render the lookup carrying the error, which is the page they came from. */
function renderError(
  res: Response,
  err: NotFoundError | ValidationError | ConflictError,
  next: NextFunction,
): void {
  if (err instanceof NotFoundError) {
    handleControllerError(err, res, next, CONTEXT);
    return;
  }
  res.status(422).render(
    'admin/historical-records/index',
    adminHistoricalRecordService.getHistoricalRecordsPage('', { errorMessage: err.message }),
  );
}

export const adminHistoricalRecordController = {
  /** GET /admin/historical-records */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      if (flash?.kind === FLASH_KIND.MEMBER_RECORD_CORRECTED) clearFlash(res, req);
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render(
        'admin/historical-records/index',
        adminHistoricalRecordService.getHistoricalRecordsPage(query),
      );
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /**
   * POST /admin/historical-records/:personId/deceased and .../revert
   *
   * Told at registration which direction it is, rather than inferring it from
   * the request path, which a trailing slash would flip.
   */
  preview(marking: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        res.render('admin/historical-records/confirm', adminHistoricalRecordService.previewDeceasedChange(
          req.params['personId'] ?? '',
          marking,
          String(req.body?.reason ?? ''),
        ));
      } catch (err) {
        if (isHandled(err)) { renderError(res, err, next); return; }
        handleControllerError(err, res, next, CONTEXT);
      }
    };
  },

  /** POST /admin/historical-records/:personId/deceased/confirm and .../revert/confirm */
  confirm(marking: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        adminHistoricalRecordService.applyDeceasedChange(
          req.user!.userId,
          req.params['personId'] ?? '',
          marking,
          String(req.body?.reason ?? ''),
        );
        res.redirect(303, '/admin/historical-records');
      } catch (err) {
        if (isHandled(err)) { renderError(res, err, next); return; }
        handleControllerError(err, res, next, CONTEXT);
      }
    };
  },
};
