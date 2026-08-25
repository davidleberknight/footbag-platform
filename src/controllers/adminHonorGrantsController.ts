import { Request, Response, NextFunction } from 'express';
import { adminHonorGrantService } from '../services/adminHonorGrantService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

// Re-render the form with an inline error; the status follows the error class.
// ValidationError -> 422 (unknown member, invalid honor). ConflictError -> 409
// (the member already holds that honor; the guard wrote nothing).
function renderError(
  res: Response,
  err: NotFoundError | ValidationError | ConflictError,
): void {
  const status = err instanceof NotFoundError ? 404 : err instanceof ConflictError ? 409 : 422;
  res.status(status).render(
    'admin/honor-grants/index',
    adminHonorGrantService.getHonorGrantsPage({ errorMessage: err.message }),
  );
}

export const adminHonorGrantsController = {
  /** GET /admin/honor-grants */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/honor-grants/index', adminHonorGrantService.getHonorGrantsPage());
    } catch (err) {
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/grant -- validate, then show the confirmation page. */
  grant(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = adminHonorGrantService.previewHonorGrant(
        String(req.body.member_key ?? ''),
        String(req.body.honor ?? ''),
        String(req.body.induction_year ?? ''),
      );
      res.render('admin/honor-grants/grant-confirm', vm);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/grant/confirm -- commit the grant after confirmation. */
  grantConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      adminHonorGrantService.grantHonor(
        req.user!.userId,
        String(req.body.member_key ?? ''),
        String(req.body.honor ?? ''),
        String(req.body.induction_year ?? ''),
      );
      res.redirect(303, '/admin/honor-grants');
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/remove -- preview taking back a grant made in error. */
  remove(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/honor-grants/action-confirm', adminHonorGrantService.previewHonorRemoval(
        String(req.body.member_key ?? ''),
        String(req.body.honor ?? ''),
        String(req.body.reason ?? ''),
      ));
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/remove/confirm */
  removeConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      adminHonorGrantService.removeHonor(
        req.user!.userId,
        String(req.body.member_key ?? ''),
        String(req.body.honor ?? ''),
        String(req.body.reason ?? ''),
      );
      res.redirect(303, '/admin/honor-grants');
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /**
   * POST /admin/honor-grants/board/set and /board/remove -- preview.
   *
   * The direction comes from the route registration, not from the request path,
   * which a trailing slash would flip.
   */
  board(setting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        res.render('admin/honor-grants/action-confirm', adminHonorGrantService.previewBoardChange(
          String(req.body.member_key ?? ''),
          setting,
          String(req.body.reason ?? ''),
        ));
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
          renderError(res, err);
          return;
        }
        handleControllerError(err, res, next, 'admin honor grants controller');
      }
    };
  },

  /** POST /admin/honor-grants/board/set/confirm and /board/remove/confirm */
  boardConfirm(setting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        adminHonorGrantService.applyBoardChange(
          req.user!.userId,
          String(req.body.member_key ?? ''),
          setting,
          String(req.body.reason ?? ''),
        );
        res.redirect(303, '/admin/honor-grants');
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
          renderError(res, err);
          return;
        }
        handleControllerError(err, res, next, 'admin honor grants controller');
      }
    };
  },
};
