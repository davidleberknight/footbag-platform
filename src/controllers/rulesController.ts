import { Request, Response, NextFunction } from 'express';
import { rulesService } from '../services/rulesService';
import { NotFoundError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

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

  /** GET /rules/:disciplineSlug/:ruleSlug */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const disciplineSlug = req.params['disciplineSlug'] ?? '';
      const ruleSlug = req.params['ruleSlug'] ?? '';
      const vm = rulesService.getRulePage(disciplineSlug, ruleSlug);
      res.render('rules/detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo: { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'rules controller');
    }
  },
};
