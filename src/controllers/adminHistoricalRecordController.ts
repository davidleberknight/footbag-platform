import type { Request, Response, NextFunction } from 'express';
import {
  adminHistoricalRecordService,
  type HistoricalRecordCorrectionInput,
} from '../services/adminHistoricalRecordService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';

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

function bodyValue(req: Request, field: string): string {
  return String(req.body?.[field] ?? '');
}

function correctionInputFrom(req: Request): HistoricalRecordCorrectionInput {
  return {
    name:      bodyValue(req, 'name'),
    country:   bodyValue(req, 'country'),
    firstYear: bodyValue(req, 'first_year'),
    lastYear:  bodyValue(req, 'last_year'),
  };
}

/**
 * A correction the administrator can fix goes back to the form with what they
 * typed; a claimed or missing record goes where any other refusal here goes.
 */
function renderCorrectionError(
  req: Request,
  res: Response,
  err: NotFoundError | ValidationError | ConflictError,
  next: NextFunction,
): void {
  if (!(err instanceof ValidationError)) { renderError(res, err, next); return; }
  res.status(422).render(
    'admin/historical-records/correction',
    adminHistoricalRecordService.getCorrectionPage(req.params['personId'] ?? '', {
      input: correctionInputFrom(req),
      errorMessage: err.message,
    }),
  );
}

export const adminHistoricalRecordController = {
  /** GET /admin/historical-records */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let notice: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.HISTORICAL_RECORD_OUTCOME) {
        notice = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render(
        'admin/historical-records/index',
        adminHistoricalRecordService.getHistoricalRecordsPage(query, { notice }),
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
        const outcome = adminHistoricalRecordService.applyDeceasedChange(
          req.user!.userId,
          req.params['personId'] ?? '',
          marking,
        );
        redirectWithOutcome(req, res, {
          flash: FLASH_KIND.HISTORICAL_RECORD_OUTCOME,
          to: '/admin/historical-records',
          ending: outcome.ending,
          text: outcome.text,
        });
      } catch (err) {
        if (isHandled(err)) { renderError(res, err, next); return; }
        handleControllerError(err, res, next, CONTEXT);
      }
    };
  },

  /** GET /admin/historical-records/:personId/correction */
  correction(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render(
        'admin/historical-records/correction',
        adminHistoricalRecordService.getCorrectionPage(req.params['personId'] ?? ''),
      );
    } catch (err) {
      if (isHandled(err)) { renderError(res, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/historical-records/:personId/correction */
  previewCorrection(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/historical-records/confirm', adminHistoricalRecordService.previewCorrection(
        req.params['personId'] ?? '', correctionInputFrom(req), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderCorrectionError(req, res, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/historical-records/:personId/correction/confirm */
  confirmCorrection(req: Request, res: Response, next: NextFunction): void {
    const personId = req.params['personId'] ?? '';
    try {
      const outcome = adminHistoricalRecordService.applyCorrection(
        req.user!.userId, personId, correctionInputFrom(req), bodyValue(req, 'reason'),
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.HISTORICAL_RECORD_OUTCOME,
        to: `/admin/historical-records?q=${encodeURIComponent(personId)}`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      if (isHandled(err)) { renderCorrectionError(req, res, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
