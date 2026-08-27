import type { Request, Response, NextFunction } from 'express';
import { adminDashboardService, type AdminDashboardContent } from '../services/adminDashboardService';
import { handleControllerError } from '../lib/controllerErrors';
import type { PageViewModel } from '../types/page';

export const adminController = {
  /** GET /admin */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = adminDashboardService.getAdminDashboardPage(req.user!.userId);
      res.render('admin/dashboard', vm satisfies PageViewModel<AdminDashboardContent>);
    } catch (err) {
      handleControllerError(err, res, next, 'admin dashboard');
    }
  },
};
