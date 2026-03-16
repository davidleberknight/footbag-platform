import { Request, Response, NextFunction } from 'express';
import { playerService } from '../services/PlayerService';
import { NotFoundError, ServiceUnavailableError } from '../services/serviceErrors';
import { logger } from '../config/logger';

export const playersController = {
  /**
   * GET /players
   * Public players listing — all historical competitors with known event counts.
   */
  listing(_req: Request, res: Response, next: NextFunction): void {
    try {
      const players = playerService.listPlayers();
      res.render('players/index', { pageTitle: 'Players', players });
    } catch (err) {
      playersController._handleError(err, res, next);
    }
  },

  /**
   * GET /players/:personId
   * Public player detail page.
   */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const player = playerService.getPlayer(req.params.personId);
      res.render('players/detail', { pageTitle: player.name, player });
    } catch (err) {
      playersController._handleError(err, res, next);
    }
  },

  _handleError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof NotFoundError) {
      res.status(404).render('errors/not-found', { pageTitle: 'Page Not Found' });
      return;
    }
    if (err instanceof ServiceUnavailableError) {
      res.status(503).render('errors/unavailable', { pageTitle: 'Service Unavailable' });
      return;
    }
    logger.error('unexpected error in players controller', {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  },
};
