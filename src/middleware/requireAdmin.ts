import { Request, Response, NextFunction } from 'express';

/**
 * Admin-only authz gate. Requires `requireAuth` to have run first so
 * `req.user` is populated. Renders 403 for non-admin authenticated users
 * and for unauthenticated requests that bypass `requireAuth` (defensive).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).render('errors/forbidden', {
      seo: { title: 'Forbidden' },
      page: { sectionKey: '', pageKey: 'error_403', title: 'Forbidden' },
    });
    return;
  }
  next();
}
