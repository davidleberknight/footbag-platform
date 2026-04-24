// ---- QC-only (delete with pipeline-qc subsystem) ----
import { Request, Response, NextFunction } from 'express';
import { personsQcService } from '../services/personsQcService';
import { handleControllerError } from '../../lib/controllerErrors';

export const personsQcController = {
  /** GET /internal/persons/qc */
  qcPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawCategory = req.query['category'];
      const rawSource   = req.query['source'];

      const filters = {
        category: typeof rawCategory === 'string' && rawCategory.trim()
          ? rawCategory.trim() : undefined,
        source: typeof rawSource === 'string' && rawSource.trim()
          ? rawSource.trim() : undefined,
      };

      const vm = personsQcService.getPersonsQcPage(filters);
      res.render('internal-qc/persons/qc', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'persons qc controller');
    }
  },

  /** GET /internal/persons/browse */
  browsePage(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawSearch = req.query['search'];
      const rawSource = req.query['source'];
      const rawPage   = req.query['page'];

      const filters = {
        search: typeof rawSearch === 'string' && rawSearch.trim()
          ? rawSearch.trim() : undefined,
        source: typeof rawSource === 'string' && rawSource.trim()
          ? rawSource.trim() : undefined,
        page: typeof rawPage === 'string' && /^\d+$/.test(rawPage)
          ? parseInt(rawPage, 10) : undefined,
      };

      const vm = personsQcService.getPersonsBrowsePage(filters);
      res.render('internal-qc/persons/browse', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'persons qc controller');
    }
  },
};
