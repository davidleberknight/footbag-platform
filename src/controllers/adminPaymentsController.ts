import { Request, Response, NextFunction } from 'express';
import {
  paymentReconciliationService,
  resolveIssueNotice,
} from '../services/paymentReconciliationService';
import { outcomeNotice, outcomePayload } from '../lib/outcomeNotice';
import { paymentsHealthService } from '../services/paymentsHealthService';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { NotFoundError, ValidationError } from '../services/serviceErrors';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

// A safe integer only: a number past that range (`?page=1e30`) would reach the
// offset arithmetic and the database as a value SQLite refuses, so it falls
// back to the first page instead.
function pageNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
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
          eventId: str(req.query.event),
          sort: str(req.query.sort),
          page: pageNum(req.query.page),
        }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin payments controller');
    }
  },

  /** GET /admin/payments/reports */
  reports(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render(
        'admin/payments/reports',
        paymentReconciliationService.getAdminReportsPage({ page: pageNum(req.query.page) }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin payment reports controller');
    }
  },

  /** GET /admin/payments/reports/:runId */
  report(req: Request, res: Response, next: NextFunction): void {
    try {
      const model = paymentReconciliationService.getAdminReportPage(req.params.runId);
      if (!model) {
        renderNotFound(res);
        return;
      }
      res.render('admin/payments/report', model);
    } catch (err) {
      handleControllerError(err, res, next, 'admin payment report controller');
    }
  },

  /** GET /admin/payments/health */
  health(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/payments/health', paymentsHealthService.getPaymentsHealthPage());
    } catch (err) {
      handleControllerError(err, res, next, 'admin payments health controller');
    }
  },

  /** GET /admin/payments/reconciliation */
  reconciliation(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let outcome: ReturnType<typeof outcomeNotice> = null;
      if (flash?.kind === FLASH_KIND.RECONCILIATION_RESOLVED) {
        outcome = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render(
        'admin/payments/reconciliation',
        paymentReconciliationService.getAdminReconciliationPage({
          status: str(req.query.status),
          page: pageNum(req.query.page),
          sort: str(req.query.sort),
          outcome,
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
        renderNotFound(res);
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
      const result = paymentReconciliationService.resolveIssue({
        issueId: req.params.issueId,
        adminMemberId: req.user!.userId,
        notes: typeof body.notes === 'string' ? body.notes : '',
      });
      // A repeat takes the same redirect as the first submit, carrying the
      // message the service chose for it.
      const notice = resolveIssueNotice(result);
      writeFlash(res, req, FLASH_KIND.RECONCILIATION_RESOLVED, outcomePayload(notice.tone, notice.text));
      res.redirect(303, '/admin/payments/reconciliation');
    } catch (err) {
      // A missing note is the administrator's own mistake, so the page comes
      // back with the reason rather than a bare error screen. An unknown issue
      // is a 404 like any other missing resource.
      if (err instanceof ValidationError) {
        const body = req.body as Record<string, unknown>;
        res.status(422).render(
          'admin/payments/reconciliation',
          paymentReconciliationService.getAdminReconciliationPage({
            status: 'outstanding',
            errorMessage: err.message,
            // The submitted values come back with the re-render. Without them a
            // rejected note is simply gone, and the note is prose about what
            // someone checked and concluded.
            submittedIssueId: req.params.issueId,
            submittedNotes: typeof body.notes === 'string' ? body.notes : null,
          }),
        );
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      handleControllerError(err, res, next, 'admin reconciliation resolve controller');
    }
  },
};
