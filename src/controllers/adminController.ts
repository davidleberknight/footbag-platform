import { Request, Response } from 'express';

export const adminController = {
  /** GET /admin — render the admin dashboard. */
  index(_req: Request, res: Response): void {
    res.render('admin/dashboard', {
      seo: { title: 'Admin Dashboard' },
      page: { sectionKey: 'admin', pageKey: 'admin_dashboard', title: 'Admin Dashboard' },
    });
  },
};
