import type { Request, Response, NextFunction } from 'express';
import {
  getOfficialRosterPage,
  type MemberTier,
} from '../services/officialRosterService';
import { handleControllerError } from '../lib/controllerErrors';

/** Trim a query value to a non-empty string, or undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export const officialRosterController = {
  /** GET /ifpa/roster */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const tier = str(req.query.tier);
      const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
      const vm = getOfficialRosterPage(req.user!.userId, {
        // The service validates the value and rejects an unknown tier.
        tier: tier ? [tier as MemberTier] : undefined,
        q: str(req.query.q),
        page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
      });
      res.render('ifpa/roster', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'official roster controller');
    }
  },
};
