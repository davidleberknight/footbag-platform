import { Request, Response, NextFunction } from 'express';
import { eventService } from '../services/eventService';
import { ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText } from '../lib/parseFormBody';

const awardForm = z.object({ citation: formText('Board decision') });

const SANCTIONS_PATH = '/admin/events/sanctions';

export const adminEventSanctionController = {
  /** GET /admin/events/sanctions */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let notice: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.EVENT_SANCTION_OUTCOME) {
        notice = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/event-sanctions/index', eventService.getSanctionAwardPage({ notice }));
    } catch (err) {
      handleControllerError(err, res, next, 'admin event sanction controller');
    }
  },

  /** POST /admin/events/:eventId/sanction-award */
  award(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = parseFormBody(awardForm, req.body);
      if (!parsed.ok) throw new ValidationError(parsed.message);
      const outcome = eventService.recordBoardAward(req.user!.userId, req.params.eventId ?? '', parsed.data.citation);
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.EVENT_SANCTION_OUTCOME,
        to: SANCTIONS_PATH,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/event-sanctions/index', eventService.getSanctionAwardPage({ errorMessage: err.message }));
        return;
      }
      handleControllerError(err, res, next, 'admin event sanction controller');
    }
  },
};
