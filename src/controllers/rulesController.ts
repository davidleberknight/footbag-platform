import { Request, Response, NextFunction } from 'express';
import { rulesService } from '../services/rulesService';
import { NotFoundError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';

export const rulesController = {
  /** GET /rules */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = rulesService.getRulesIndexPage();
      res.render('rules/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'rules controller');
    }
  },

  /** GET /rules/:categorySlug/:ruleSlug */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const categorySlug = req.params['categorySlug'] ?? '';
      const ruleSlug = req.params['ruleSlug'] ?? '';
      const vm = rulesService.getRulePage(categorySlug, ruleSlug);
      res.render('rules/detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      handleControllerError(err, res, next, 'rules controller');
    }
  },
};
