import { Request, Response, NextFunction } from 'express';
import { adminRoleService } from '../services/adminRoleService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

// Re-render the page with an inline error; the status follows the error class.
// NotFoundError -> 404 (a revoke addressed to an unknown member id).
// ValidationError / ConflictError -> 422 for a fixable submission: an unknown
// grant key, wrong tier, self-revoke, already/not an admin, or a missing reason.
function renderError(
  res: Response,
  viewerId: string,
  err: NotFoundError | ValidationError | ConflictError,
): void {
  const status = err instanceof NotFoundError ? 404 : 422;
  res.status(status).render(
    'admin/admin-roles/index',
    adminRoleService.getAdminRolesPage(viewerId, { errorMessage: err.message }),
  );
}

export const adminAdminRolesController = {
  /** GET /admin/admin-roles */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/admin-roles/index', adminRoleService.getAdminRolesPage(req.user!.userId));
    } catch (err) {
      handleControllerError(err, res, next, 'admin roles controller');
    }
  },

  /** POST /admin/admin-roles/grant — validate, then show the confirmation page. */
  grant(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = adminRoleService.previewGrant(
        req.user!.userId,
        String(req.body.member_key ?? ''),
        String(req.body.reason ?? ''),
      );
      res.render('admin/admin-roles/grant-confirm', vm);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, req.user!.userId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin roles controller');
    }
  },

  /** POST /admin/admin-roles/grant/confirm — commit the grant after confirmation. */
  grantConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      adminRoleService.grantByKey(
        req.user!.userId,
        String(req.body.member_key ?? ''),
        String(req.body.reason ?? ''),
      );
      res.redirect(303, '/admin/admin-roles');
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, req.user!.userId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin roles controller');
    }
  },

  /** POST /admin/admin-roles/:memberId/revoke — validate, then show the confirmation page. */
  revoke(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = adminRoleService.previewRevoke(
        req.user!.userId,
        req.params.memberId ?? '',
        String(req.body.reason ?? ''),
      );
      res.render('admin/admin-roles/revoke-confirm', vm);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, req.user!.userId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin roles controller');
    }
  },

  /** POST /admin/admin-roles/:memberId/revoke/confirm — commit the revoke after confirmation. */
  revokeConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      adminRoleService.revoke(
        req.user!.userId,
        req.params.memberId ?? '',
        String(req.body.reason ?? ''),
      );
      res.redirect(303, '/admin/admin-roles');
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, req.user!.userId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin roles controller');
    }
  },
};
