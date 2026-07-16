import { NextFunction, Request, Response } from 'express';
import { freestyleService } from '../services/freestyleService';

/**
 * Emerging Vocabulary workbench (admin-gated at the /admin mount): the curator
 * decision packet plus the full-dimension row table with query-param filters.
 * A freestyle-curation surface backed by the keeper freestyleService, kept off
 * the internal-QC router so it survives the QC-subsystem retirement. Read-only;
 * adjudications are data changes made through the ruling ledger, never here.
 */
export const emergingVocabController = {
  workbenchPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const dimension = typeof req.query.dimension === 'string' ? req.query.dimension : undefined;
      const value = typeof req.query.value === 'string' ? req.query.value : undefined;
      const vm = freestyleService.getInternalEmergingVocabularyPage({ dimension, value });
      res.render('admin/emerging-vocabulary', vm);
    } catch (err) {
      next(err);
    }
  },
};
