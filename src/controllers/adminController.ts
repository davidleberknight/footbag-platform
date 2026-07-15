import { Request, Response, NextFunction } from 'express';
import { clubCleanupService } from '../services/clubCleanupService';
import { adminWorkQueueService } from '../services/adminWorkQueueService';

export const adminController = {
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/dashboard', {
        seo: { title: 'Admin Dashboard' },
        page: { sectionKey: 'admin', pageKey: 'admin_dashboard', title: 'Admin Dashboard' },
        content: {
          backlog: clubCleanupService.getBacklogBadge(),
          workQueue: adminWorkQueueService.getWorkQueueSummary(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
