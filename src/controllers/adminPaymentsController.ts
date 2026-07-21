import { Request, Response, NextFunction } from 'express';
import { paymentReconciliationService } from '../services/paymentReconciliationService';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { NotFoundError, ValidationError } from '../services/serviceErrors';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function pageNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const adminPaymentsController = {
  /** GET /admin/payments */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render(
        'admin/payments/index',
        paymentReconciliationService.getAdminPaymentsPage({
          paymentType: str(req.query.type),
          status: str(req.query.status),
          memberId: str(req.query.member),
          reference: str(req.query.reference),
          createdFrom: str(req.query.from),
          createdTo: str(req.query.to),
          page: pageNum(req.query.page),
        }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin payments controller');
    }
  },

  /** GET /admin/payments/reconciliation */
  reconciliation(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let resolvedFlag = false;
      if (flash?.kind === FLASH_KIND.RECONCILIATION_RESOLVED) {
        resolvedFlag = true;
        clearFlash(res, req);
      }
      res.render(
        'admin/payments/reconciliation',
        paymentReconciliationService.getAdminReconciliationPage({
          status: str(req.query.status),
          page: pageNum(req.query.page),
          resolvedFlag,
        }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin reconciliation controller');
    }
  },

  /**
   * GET /admin/payments/:paymentId
   * Registered after the literal `reconciliation` path so the more specific
   * route matches first.
   */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const model = paymentReconciliationService.getAdminPaymentDetailPage(req.params.paymentId);
      if (!model) {
        res.status(404).render('errors/not-found', {
          seo: { title: 'Page Not Found' },
          page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      res.render('admin/payments/detail', model);
    } catch (err) {
      handleControllerError(err, res, next, 'admin payment detail controller');
    }
  },

  /** POST /admin/payments/reconciliation/:issueId/resolve */
  resolve(req: Request, res: Response, next: NextFunction): void {
    try {
      const body = req.body as Record<string, unknown>;
      paymentReconciliationService.resolveIssue({
        issueId: req.params.issueId,
        adminMemberId: req.user!.userId,
        notes: typeof body.notes === 'string' ? body.notes : '',
      });
      writeFlash(res, req, FLASH_KIND.RECONCILIATION_RESOLVED, req.params.issueId);
      res.redirect(303, '/admin/payments/reconciliation');
    } catch (err) {
      // A missing note is the administrator's own mistake, so the page comes
      // back with the reason rather than a bare error screen. A vanished issue
      // is a 404 like any other missing resource.
      if (err instanceof ValidationError) {
        res.status(422).render(
          'admin/payments/reconciliation',
          paymentReconciliationService.getAdminReconciliationPage({
            status: 'outstanding',
            errorMessage: err.message,
          }),
        );
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo: { title: 'Page Not Found' },
          page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'admin reconciliation resolve controller');
    }
  },
};
