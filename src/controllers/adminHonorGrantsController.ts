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
};
