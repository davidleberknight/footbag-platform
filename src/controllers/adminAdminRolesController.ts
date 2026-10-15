import { Request, Response, NextFunction } from 'express';
import { adminRoleService, type AdminRoleChangeOutcome } from '../services/adminRoleService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';

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

// The first submit and this admin's own repeat return to the list as they always
// have; a change another act already made says so in the informational tone.
function redirectAfterChange(req: Request, res: Response, outcome: AdminRoleChangeOutcome): void {
  if (outcome.notice) {
    redirectWithOutcome(req, res, {
      flash: FLASH_KIND.ADMIN_ROLE_OUTCOME,
      to: '/admin/admin-roles',
      ending: outcome.ending,
      text: outcome.notice,
    });
    return;
  }
  res.redirect(303, '/admin/admin-roles');
}

export const adminAdminRolesController = {
  /** GET /admin/admin-roles */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let outcome: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.ADMIN_ROLE_OUTCOME) {
        outcome = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/admin-roles/index', adminRoleService.getAdminRolesPage(req.user!.userId, { outcome }));
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
      const outcome = adminRoleService.grantByKey(
        req.user!.userId,
        String(req.body.member_key ?? ''),
        String(req.body.reason ?? ''),
      );
      redirectAfterChange(req, res, outcome);
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
      const outcome = adminRoleService.revoke(
        req.user!.userId,
        req.params.memberId ?? '',
        String(req.body.reason ?? ''),
      );
      redirectAfterChange(req, res, outcome);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, req.user!.userId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin roles controller');
    }
  },
};
