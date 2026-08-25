import type { Request, Response, NextFunction } from 'express';
import { adminMemberService } from '../services/adminMemberService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';

const CONTEXT = 'admin member controller';

function bodyValue(req: Request, field: string): string {
  return String(req.body?.[field] ?? '');
}

/**
 * Re-render the member record carrying the error, so a refused correction
 * comes back on the page the administrator was working on with the record
 * still in front of them. An unknown member id is a 404; a fixable submission
 * is a 422.
 */
function renderRecordError(
  res: Response,
  memberId: string,
  err: NotFoundError | ValidationError | ConflictError,
  next: NextFunction,
): void {
  if (err instanceof NotFoundError) {
    handleControllerError(err, res, next, CONTEXT);
    return;
  }
  res.status(422).render(
    'admin/members/record',
    adminMemberService.getMemberRecordPage(memberId, { errorMessage: err.message }),
  );
}

function isHandled(err: unknown): err is NotFoundError | ValidationError | ConflictError {
  return err instanceof NotFoundError
    || err instanceof ValidationError
    || err instanceof ConflictError;
}

export const adminMemberController = {
  /** GET /admin/members */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render('admin/members/index', adminMemberService.getMemberLookupPage(query));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/members/:memberId */
  record(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let outcome: string | null = null;
      if (flash?.kind === FLASH_KIND.MEMBER_RECORD_CORRECTED) {
        outcome = flash.payload ?? null;
        clearFlash(res, req);
      }
      res.render(
        'admin/members/record',
        adminMemberService.getMemberRecordPage(req.params['memberId'] ?? '', { outcome }),
      );
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/name */
  previewName(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewNameCorrection(
        memberId,
        {
          givenNames:  bodyValue(req, 'given_names'),
          familyName:  bodyValue(req, 'family_name'),
          displayName: bodyValue(req, 'display_name'),
        },
        bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/name/confirm */
  confirmName(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyNameCorrection(
        req.user!.userId,
        memberId,
        {
          givenNames:  bodyValue(req, 'given_names'),
          familyName:  bodyValue(req, 'family_name'),
          displayName: bodyValue(req, 'display_name'),
        },
        bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/slug */
  previewSlug(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewSlugCorrection(
        memberId, bodyValue(req, 'slug'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/slug/confirm */
  confirmSlug(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applySlugCorrection(
        req.user!.userId, memberId, bodyValue(req, 'slug'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/tier */
  previewTier(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewTierChange(
        memberId, bodyValue(req, 'tier'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/tier/confirm */
  confirmTier(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyTierChange(
        req.user!.userId, memberId, bodyValue(req, 'tier'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /**
   * POST /admin/members/:memberId/deceased and .../deceased/revert
   *
   * Which of the two this is comes from the route registration rather than from
   * reading it back off the request path: a path can arrive with a trailing
   * slash, and inferring the action from its shape then flips it.
   */
  previewDeceased(reverting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const memberId = req.params['memberId'] ?? '';
      try {
        res.render('admin/members/confirm', adminMemberService.previewDeceasedChange(
          memberId, reverting, bodyValue(req, 'reason'),
        ));
      } catch (err) {
        if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
        handleControllerError(err, res, next, CONTEXT);
      }
    };
  },

  /** POST /admin/members/:memberId/deceased/confirm and .../revert/confirm */
  confirmDeceased(reverting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyDeceasedChange(
        req.user!.userId, memberId, reverting, bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
    };
  },

  /** POST /admin/members/:memberId/active-player */
  previewActivePlayer(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewActivePlayerCorrection(
        memberId, bodyValue(req, 'expires_on'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/active-player/confirm */
  confirmActivePlayer(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyActivePlayerCorrection(
        req.user!.userId, memberId, bodyValue(req, 'expires_on'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
