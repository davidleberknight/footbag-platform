import { Request, Response, NextFunction } from 'express';
import { memberService } from '../services/memberService';
import { NotFoundError } from '../services/serviceErrors';
import { logger } from '../config/logger';

export const memberController = {
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const pageModel = memberService.getMembersIndexPage();
      res.render('members/index', { pageTitle: 'Members', ...pageModel });
    } catch (err) {
      logger.error('members index error', {
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  },

  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const { personId } = req.params;
      const pageModel = memberService.getMemberDetailPage(personId);
      res.render('members/detail', {
        pageTitle: pageModel.member.personName,
        ...pageModel,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', { pageTitle: 'Member Not Found' });
        return;
      }
      logger.error('member detail error', {
        personId: req.params.personId,
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  },
};
