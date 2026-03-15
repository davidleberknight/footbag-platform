import { Request, Response, NextFunction } from 'express';
import { playerService } from '../services/PlayerService';
import { NotFoundError } from '../services/serviceErrors';
import { logger } from '../config/logger';

export const playersController = {
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const { personId } = req.params;
      const pageModel = playerService.getPlayerDetailPage(personId);
      res.render('players/detail', {
        pageTitle: pageModel.player.personName,
        ...pageModel,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', { pageTitle: 'Player Not Found' });
        return;
      }
      logger.error('player detail error', {
        personId: req.params.personId,
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  },
};
