import { Request, Response } from 'express';

export const adminController = {
  index(_req: Request, res: Response): void {
    res.render('admin/dashboard', {
      seo: { title: 'Admin Dashboard' },
      page: { sectionKey: 'admin', pageKey: 'admin_dashboard', title: 'Admin Dashboard' },
    });
  },
};
