import { Request, Response, NextFunction } from 'express';
import { adminRoleService } from '../services/adminRoleService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

// Re-render the page with an inline error: 404 when the named member does not
// exist (anti-enumeration parity with other admin member lookups), 422 when the
// submitted values fail a business rule (wrong tier, self-revoke, already/not an
// admin, missing reason).
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

  /** POST /admin/admin-roles/grant */
  grant(req: Request, res: Response, next: NextFunction): void {
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

  /** POST /admin/admin-roles/:memberId/revoke */
  revoke(req: Request, res: Response, next: NextFunction): void {
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
