import type { Request, Response, NextFunction } from 'express';
import { adminClubService, type ClubContentCorrectionInput } from '../services/adminClubService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';

const CONTEXT = 'admin club controller';

function bodyValue(req: Request, field: string): string {
  return String(req.body?.[field] ?? '');
}

/**
 * The submitted club details, in the shape the club service takes.
 *
 * The field names are the co-leader's own form's, deliberately: one submission
 * shape means one assembler and one set of names for the same fields, whichever
 * surface posted them.
 */
function contentInputFrom(req: Request): ClubContentCorrectionInput {
  return {
    name:        bodyValue(req, 'name'),
    description: bodyValue(req, 'description'),
    city:        bodyValue(req, 'city'),
    region:      bodyValue(req, 'region'),
    country:     bodyValue(req, 'country'),
    externalUrl: bodyValue(req, 'external_url'),
  };
}

/**
 * Re-render the club record carrying the error, so a refused correction comes
 * back on the page the administrator was working on with the record still in
 * front of them. An unknown club id is a 404; a fixable submission is a 422.
 */
function renderRecordError(
  res: Response,
  clubId: string,
  err: NotFoundError | ValidationError | ConflictError,
  next: NextFunction,
): void {
  if (err instanceof NotFoundError) {
    handleControllerError(err, res, next, CONTEXT);
    return;
  }
  res.status(422).render(
    'admin/clubs/record',
    adminClubService.getClubRecordPage(clubId, { errorMessage: err.message }),
  );
}

function isHandled(err: unknown): err is NotFoundError | ValidationError | ConflictError {
  return err instanceof NotFoundError
    || err instanceof ValidationError
    || err instanceof ConflictError;
}

export const adminClubController = {
  /** GET /admin/clubs */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render('admin/clubs/index', adminClubService.getClubLookupPage(query));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/clubs/:clubId */
  record(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let outcome: string | null = null;
      if (flash?.kind === FLASH_KIND.CLUB_RECORD_CORRECTED) {
        outcome = flash.payload ?? null;
        clearFlash(res, req);
      }
      res.render(
        'admin/clubs/record',
        adminClubService.getClubRecordPage(req.params['clubId'] ?? '', { outcome }),
      );
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/clubs/:clubId/content */
  async previewContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const clubId = req.params['clubId'] ?? '';
    try {
      res.render('admin/clubs/confirm', await adminClubService.previewContentCorrection(
        clubId, contentInputFrom(req), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, clubId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/clubs/:clubId/content/confirm */
  async confirmContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const clubId = req.params['clubId'] ?? '';
    try {
      const outcome = await adminClubService.applyContentCorrection(
        req.user!.userId, clubId, contentInputFrom(req), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.CLUB_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/clubs/${clubId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, clubId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/clubs/:clubId/hashtag */
  previewHashtag(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params['clubId'] ?? '';
    try {
      res.render('admin/clubs/confirm', adminClubService.previewHashtagCorrection(
        clubId, bodyValue(req, 'hashtag_slug'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, clubId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/clubs/:clubId/hashtag/confirm */
  confirmHashtag(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params['clubId'] ?? '';
    try {
      const outcome = adminClubService.applyHashtagCorrection(
        req.user!.userId, clubId, bodyValue(req, 'hashtag_slug'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.CLUB_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/clubs/${clubId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, clubId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
