import { Request, Response, NextFunction } from 'express';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { blogService } from '../services/blogService';

const YEAR_PARAM = /^\d{4}$/;

export const blogController = {
  /** GET /blog: the current year's posts. */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const nowIso = new Date().toISOString();
      const vm = blogService.getBlogYearPage(blogService.currentBlogYear(nowIso), nowIso, { isMember: req.isMember });
      res.render('blog/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'blog controller');
    }
  },

  /** GET /blog/year/:year: another year's posts; the current year lives at /blog. */
  year(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawYear = req.params.year;
      if (typeof rawYear !== 'string' || !YEAR_PARAM.test(rawYear)) {
        renderNotFound(res);
        return;
      }
      const nowIso = new Date().toISOString();
      const year = Number(rawYear);
      if (year === blogService.currentBlogYear(nowIso)) {
        res.redirect(301, '/blog');
        return;
      }
      res.render('blog/year', blogService.getBlogYearPage(year, nowIso, { isMember: req.isMember }));
    } catch (err) {
      handleControllerError(err, res, next, 'blog controller');
    }
  },

  /** GET /blog/:postId: one post's own page. */
  post(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = blogService.getBlogPostPage(req.params.postId, new Date().toISOString(), { isMember: req.isMember });
      res.render('blog/post', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'blog controller');
    }
  },
};
