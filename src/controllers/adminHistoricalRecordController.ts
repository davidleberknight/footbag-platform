import type { Request, Response, NextFunction } from 'express';
import {
  adminHistoricalRecordService,
  type HistoricalRecordCorrectionInput,
} from '../services/adminHistoricalRecordService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';
import { z } from 'zod';
import { parseFormBody, formText } from '../lib/parseFormBody';
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

const correctionForm = z.object({
  name: formText('Name'),
  country: formText('Country'),
  first_year: formText('First year'),
  last_year: formText('Last year'),
  reason: formText('Reason'),
});

// The correction as typed: the parsed fields, or on a refusal the ones that
// arrived as text, so the form comes back holding them.
function typedCorrection(req: Request): Partial<Record<string, string>> {
  const parsed = parseFormBody(correctionForm, req.body);
  return parsed.ok ? parsed.data : parsed.submitted;
}

// The correction read through its schema; a shape the form never sends is
// refused like any other fixable correction.
function readCorrection(req: Request): { input: HistoricalRecordCorrectionInput; reason: string } {
  const parsed = parseFormBody(correctionForm, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return { input: correctionInputFrom(parsed.data), reason: parsed.data.reason };
}

function correctionInputFrom(fields: Partial<Record<string, string>>): HistoricalRecordCorrectionInput {
  return {
    name:      fields.name ?? '',
    country:   fields.country ?? '',
    firstYear: fields.first_year ?? '',
    lastYear:  fields.last_year ?? '',
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
      input: correctionInputFrom(typedCorrection(req)),
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
      const { input, reason } = readCorrection(req);
      res.render('admin/historical-records/confirm', adminHistoricalRecordService.previewCorrection(
        req.params['personId'] ?? '', input, reason,
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
      const { input, reason } = readCorrection(req);
      const outcome = adminHistoricalRecordService.applyCorrection(
        req.user!.userId, personId, input, reason,
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
