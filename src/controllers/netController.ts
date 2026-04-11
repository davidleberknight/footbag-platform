import { Request, Response, NextFunction } from 'express';
import { netService } from '../services/netService';
import { NotFoundError, ServiceUnavailableError, ConflictError } from '../services/serviceErrors';
import { logger } from '../config/logger';

/**
 * Thin controller for public net team routes.
 * Business logic and page shaping live in netService.
 */
export const netController = {
  /** GET /internal/net/curated */
  curatedPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawStatus  = req.query['status'];
      const rawSource  = req.query['source'];
      const rawEvent   = req.query['event'];
      const rawYear    = req.query['year'];
      const rawLinked  = req.query['linked'];
      const rawLimit   = req.query['limit'];

      const filters = {
        curated_status: typeof rawStatus === 'string' &&
          ['approved', 'rejected'].includes(rawStatus)
          ? rawStatus : undefined,
        source_file: typeof rawSource === 'string' && rawSource.trim()
          ? rawSource.trim() : undefined,
        event_id: typeof rawEvent === 'string' && rawEvent.trim()
          ? rawEvent.trim() : undefined,
        year_hint: typeof rawYear === 'string' && /^\d{4}$/.test(rawYear)
          ? parseInt(rawYear, 10) : undefined,
        linked_only: rawLinked === 'true',
        limit: typeof rawLimit === 'string' && /^\d+$/.test(rawLimit)
          ? Math.min(parseInt(rawLimit, 10), 200) : 50,
      };

      const vm = netService.getNetCuratedPage(filters);
      res.render('net/curated', vm);
    } catch (err) {
      netController._handleError(err, res, next);
    }
  },

  /** GET /internal/net/candidates */
  candidatesPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawStatus  = req.query['status'];
      const rawEvent   = req.query['event'];
      const rawSource  = req.query['source'];
      const rawLinked  = req.query['linked'];
      const rawConf    = req.query['min_confidence'];
      const rawGroup   = req.query['group'];
      const rawLimit   = req.query['limit'];

      const filters = {
        review_status: typeof rawStatus === 'string' &&
          ['pending', 'accepted', 'rejected', 'needs_info'].includes(rawStatus)
          ? rawStatus : undefined,
        event_id: typeof rawEvent === 'string' && rawEvent.trim()
          ? rawEvent.trim() : undefined,
        source_file: typeof rawSource === 'string' && rawSource.trim()
          ? rawSource.trim() : undefined,
        linked_only: rawLinked === 'true',
        min_confidence: typeof rawConf === 'string' && /^0?\.\d+$/.test(rawConf)
          ? parseFloat(rawConf) : undefined,
        group_by: typeof rawGroup === 'string' &&
          ['event', 'source', 'year'].includes(rawGroup)
          ? rawGroup : undefined,
        limit: typeof rawLimit === 'string' && /^\d+$/.test(rawLimit)
          ? Math.min(parseInt(rawLimit, 10), 200) : 50,
      };

      const vm = netService.getNetCandidatesPage(filters);
      res.render('net/candidates', vm);
    } catch (err) {
      netController._handleError(err, res, next);
    }
  },

  /** GET /internal/net/review */
  reviewPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawReason   = req.query['reason'];
      const rawPriority = req.query['priority'];
      const rawStatus   = req.query['status'];
      const rawEvent    = req.query['event'];
      const rawLimit    = req.query['limit'];

      const filters = {
        reason_code: typeof rawReason === 'string' && rawReason.trim()
          ? rawReason.trim() : undefined,
        priority: typeof rawPriority === 'string' && /^[1-4]$/.test(rawPriority)
          ? parseInt(rawPriority, 10) : undefined,
        resolution_status: typeof rawStatus === 'string' &&
          ['open', 'resolved', 'wont_fix', 'escalated'].includes(rawStatus)
          ? rawStatus : undefined,
        event_id: typeof rawEvent === 'string' && rawEvent.trim()
          ? rawEvent.trim() : undefined,
        limit: typeof rawLimit === 'string' && /^\d+$/.test(rawLimit)
          ? Math.min(parseInt(rawLimit, 10), 200) : 50,
      };

      const vm = netService.getNetReviewPage(filters);
      res.render('net/review', vm);
    } catch (err) {
      netController._handleError(err, res, next);
    }
  },

  /** GET /net */
  homePage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getNetHomePage();
      res.render('net/index', vm);
    } catch (err) {
      netController._handleError(err, res, next);
    }
  },

  /** GET /net/events */
  eventsPage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getEventsPage();
      res.render('net/events', vm);
    } catch (err) {
      netController._handleError(err, res, next);
    }
  },

  /** GET /net/events/:eventId */
  eventDetailPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getEventDetailPage(req.params['eventId'] ?? '');
      res.render('net/event-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  /** GET /net/teams */
  teams(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getTeamsPage();
      res.render('net/teams', vm);
    } catch (err) {
      netController._handleError(err, res, next);
    }
  },

  /** GET /net/teams/:teamId */
  teamDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getTeamDetailPage(req.params['teamId'] ?? '');
      res.render('net/team-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  /** GET /net/players/:personId */
  playerPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getPlayerPage(req.params['personId'] ?? '');
      res.render('net/player', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  /** GET /net/players/:personId/partners/:teamId */
  playerPartnerDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getPlayerPartnerDetail(
        req.params['personId'] ?? '',
        req.params['teamId']   ?? '',
      );
      res.render('net/player-partner', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  /** GET /internal/net/candidates/:candidateId */
  candidateDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getCandidateDetailPage(req.params['candidateId'] ?? '');
      res.render('net/candidate-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  /** POST /internal/net/candidates/:candidateId/approve */
  candidateApprove(req: Request, res: Response, next: NextFunction): void {
    try {
      const candidateId = req.params['candidateId'] ?? '';
      const note = typeof req.body?.['note'] === 'string' && req.body['note'].trim()
        ? req.body['note'].trim() : undefined;
      netService.approveCandidate(candidateId, { note });
      res.redirect(`/internal/net/candidates/${candidateId}`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      if (err instanceof ConflictError) {
        res.status(409).render('errors/not-found', {
          seo:  { title: 'Already Curated' },
          page: { sectionKey: '', pageKey: 'error_409', title: 'Already Curated' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  /** POST /internal/net/candidates/:candidateId/reject */
  candidateReject(req: Request, res: Response, next: NextFunction): void {
    try {
      const candidateId = req.params['candidateId'] ?? '';
      const note = typeof req.body?.['note'] === 'string' && req.body['note'].trim()
        ? req.body['note'].trim() : undefined;
      netService.rejectCandidate(candidateId, { note });
      res.redirect(`/internal/net/candidates/${candidateId}`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      if (err instanceof ConflictError) {
        res.status(409).render('errors/not-found', {
          seo:  { title: 'Already Curated' },
          page: { sectionKey: '', pageKey: 'error_409', title: 'Already Curated' },
        });
        return;
      }
      netController._handleError(err, res, next);
    }
  },

  _handleError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof ServiceUnavailableError) {
      res.status(503).render('errors/unavailable', {
        seo:  { title: 'Service Unavailable' },
        page: { sectionKey: '', pageKey: 'error_503', title: 'Service Unavailable' },
      });
      return;
    }
    logger.error('unexpected error in net controller', {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  },
};
