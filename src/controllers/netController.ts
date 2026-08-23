import { Request, Response, NextFunction } from 'express';
import { netService } from '../services/netService';
import { NotFoundError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';

export const netController = {
  /** GET /net */
  homePage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getNetHomePage();
      res.render('net/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/events */
  eventsPage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getEventsPage();
      res.render('net/events', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/teams */
  teamsPage(req: Request, res: Response, next: NextFunction): void {
    try {
      // The filter parameter was named `division` before the vocabulary moved
      // to `discipline`. An old bookmark or inbound link carrying the former
      // would otherwise resolve to no filter and render the unfiltered page,
      // which reads as a working result rather than a stale link. One
      // permanent redirect keeps a single canonical URL for the same content;
      // an alias accepted in place would leave two spellings serving it.
      const rawLegacyDivision = req.query['division'];
      if (typeof rawLegacyDivision === 'string' && rawLegacyDivision.trim()
        && typeof req.query['discipline'] !== 'string') {
        const forwarded = new URLSearchParams();
        forwarded.set('discipline', rawLegacyDivision.trim());
        for (const key of ['q', 'page'] as const) {
          const value = req.query[key];
          if (typeof value === 'string' && value.trim()) forwarded.set(key, value.trim());
        }
        res.redirect(301, `/net/teams?${forwarded.toString()}`);
        return;
      }

      const rawDiscipline = req.query['discipline'];
      const rawSearch     = req.query['q'];
      const discipline = typeof rawDiscipline === 'string' && rawDiscipline.trim()
        ? rawDiscipline.trim() : undefined;
      const search = typeof rawSearch === 'string' && rawSearch.trim().length >= 2
        ? rawSearch.trim() : undefined;
      const rawPage = req.query['page'];
      const parsedPage = typeof rawPage === 'string' ? parseInt(rawPage, 10) : NaN;
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const vm = netService.getTeamsPage(discipline, search, page);
      res.render('net/teams', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/teams/:teamId */
  teamDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getTeamDetailPage(req.params['teamId'] ?? '');
      res.render('net/team-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      handleControllerError(err, res, next, 'net controller');
    }
  },

};
