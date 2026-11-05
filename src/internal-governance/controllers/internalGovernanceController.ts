// ---- Legacy-governance-review only: DELETE BEFORE GO-LIVE ----
import { Request, Response, NextFunction } from 'express';
import { internalGovernanceService } from '../services/internalGovernanceService';
import { handleControllerError } from '../../lib/controllerErrors';

export const internalGovernanceController = {
  /** GET /internal-governance/committees */
  committees(req: Request, res: Response, next: NextFunction): void {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const validOnly = req.query.validOnly === '1';
      res.render(
        'internal-governance/committees/list',
        internalGovernanceService.getCommitteesPage({ search, validOnly }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'internal governance controller');
    }
  },

  /** GET /internal-governance/committees/:committeeId */
  committeeDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render(
        'internal-governance/committees/detail',
        internalGovernanceService.getCommitteeDetailPage(req.params.committeeId ?? ''),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'internal governance controller');
    }
  },

  /** GET /internal-governance/elections */
  elections(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('internal-governance/elections/list', internalGovernanceService.getElectionsPage());
    } catch (err) {
      handleControllerError(err, res, next, 'internal governance controller');
    }
  },

  /** GET /internal-governance/elections/:electionId */
  electionDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render(
        'internal-governance/elections/detail',
        internalGovernanceService.getElectionDetailPage(req.params.electionId ?? ''),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'internal governance controller');
    }
  },
};
