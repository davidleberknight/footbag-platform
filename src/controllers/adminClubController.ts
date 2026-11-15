import type { Request, Response, NextFunction } from 'express';
import { adminClubService, type ClubContentCorrectionInput } from '../services/adminClubService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';
import { z } from 'zod';
import { parseFormBody, formText } from '../lib/parseFormBody';

const CONTEXT = 'admin club controller';

// The field names are the co-leader's own form's, deliberately: one submission
// shape means one set of names for the same fields, whichever surface posted them.
const contentForm = z.object({
  name: formText('Club name'),
  description: formText('Description'),
  city: formText('City'),
  region: formText('Region / State'),
  country: formText('Country'),
  external_url: formText('External URL'),
  reason: formText('Reason'),
});

const hashtagForm = z.object({
  hashtag_slug: formText('Club hashtag'),
  reason: formText('Reason'),
});

// A body in a shape the form never sends is refused the way a fixable
// submission is: on the club record, at 422, with the message.
function readForm<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

/** The submitted club details, in the shape the club service takes. */
function contentInputFrom(form: z.output<typeof contentForm>): ClubContentCorrectionInput {
  return {
    name:        form.name,
    description: form.description,
    city:        form.city,
    region:      form.region,
    country:     form.country,
    externalUrl: form.external_url,
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
      const form = readForm(contentForm, req);
      res.render('admin/clubs/confirm', await adminClubService.previewContentCorrection(
        clubId, contentInputFrom(form), form.reason,
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
      const form = readForm(contentForm, req);
      const outcome = await adminClubService.applyContentCorrection(
        req.user!.userId, clubId, contentInputFrom(form), form.reason,
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
      const form = readForm(hashtagForm, req);
      res.render('admin/clubs/confirm', adminClubService.previewHashtagCorrection(
        clubId, form.hashtag_slug, form.reason,
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
      const form = readForm(hashtagForm, req);
      const outcome = adminClubService.applyHashtagCorrection(
        req.user!.userId, clubId, form.hashtag_slug, form.reason,
      );
      writeFlash(res, req, FLASH_KIND.CLUB_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/clubs/${clubId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, clubId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
