import { NextFunction, Request, Response } from 'express';
import { freestyleService } from '../../services/freestyleService';

/**
 * Internal Emerging Vocabulary workbench (admin-gated at the /internal mount):
 * the curator decision packet plus the full-dimension row table with
 * query-param filters. Read-only; adjudications are data changes made through
 * the ruling ledger, never through this surface.
 */
export const emergingVocabController = {
  workbenchPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const dimension = typeof req.query.dimension === 'string' ? req.query.dimension : undefined;
      const value = typeof req.query.value === 'string' ? req.query.value : undefined;
      const vm = freestyleService.getInternalEmergingVocabularyPage({ dimension, value });
      res.render('internal-qc/freestyle/emerging-vocabulary', vm);
    } catch (err) {
      next(err);
    }
  },
};
