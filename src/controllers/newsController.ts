import { Request, Response, NextFunction } from 'express';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { newsService } from '../services/newsService';

const YEAR_PARAM = /^\d{4}$/;

export const newsController = {
  /** GET /news: the current year's news. */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const nowIso = new Date().toISOString();
      const vm = newsService.getNewsYearPage(newsService.currentNewsYear(nowIso), nowIso);
      res.render('news/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'news controller');
    }
  },

  /** GET /news/year/:year: another year's news; the current year lives at /news. */
  year(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawYear = req.params.year;
      if (typeof rawYear !== 'string' || !YEAR_PARAM.test(rawYear)) {
        renderNotFound(res);
        return;
      }
      const nowIso = new Date().toISOString();
      const year = Number(rawYear);
      if (year === newsService.currentNewsYear(nowIso)) {
        res.redirect(301, '/news');
        return;
      }
      res.render('news/year', newsService.getNewsYearPage(year, nowIso));
    } catch (err) {
      handleControllerError(err, res, next, 'news controller');
    }
  },

  /** GET /news/:newsId: one item's own page. */
  item(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = newsService.getNewsItemPage(req.params.newsId, new Date().toISOString());
      res.render('news/item', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'news controller');
    }
  },
};
