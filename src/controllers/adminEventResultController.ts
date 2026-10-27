import type { Request, Response, NextFunction } from 'express';
import {
  adminEventResultService,
  type DisciplineCorrectionInput,
  type EntryCorrectionInput,
} from '../services/adminEventResultService';
import { ValidationError } from '../services/serviceErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';

const CONTEXT = 'admin event result controller';
const NAME_FIELD = /^name_(.+)$/;

function bodyValue(req: Request, field: string): string {
  return String(req.body?.[field] ?? '');
}

function param(req: Request, name: string): string {
  return req.params[name] ?? '';
}

function entryInputFrom(req: Request): EntryCorrectionInput {
  const names: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body ?? {})) {
    const match = NAME_FIELD.exec(key);
    if (match) names[match[1]!] = String(value ?? '');
  }
  return {
    placement:    bodyValue(req, 'placement'),
    scoreText:    bodyValue(req, 'score_text'),
    disciplineId: bodyValue(req, 'discipline_id'),
    names,
  };
}

function disciplineInputFrom(req: Request): DisciplineCorrectionInput {
  return {
    sportFamily:       bodyValue(req, 'sport_family'),
    aggregateStanding: bodyValue(req, 'aggregate_standing'),
  };
}

/** A correction the administrator can fix goes back to its form with what they typed. */
function renderEntryError(req: Request, res: Response, err: unknown, next: NextFunction): void {
  if (!(err instanceof ValidationError)) { handleControllerError(err, res, next, CONTEXT); return; }
  try {
    res.status(422).render('admin/event-results/entry', adminEventResultService.getEntryCorrectionPage(
      param(req, 'eventId'), param(req, 'entryId'),
      { input: entryInputFrom(req), errorMessage: err.message },
    ));
  } catch (inner) {
    handleControllerError(inner, res, next, CONTEXT);
  }
}

function renderDisciplineError(req: Request, res: Response, err: unknown, next: NextFunction): void {
  if (!(err instanceof ValidationError)) { handleControllerError(err, res, next, CONTEXT); return; }
  try {
    res.status(422).render('admin/event-results/discipline', adminEventResultService.getDisciplineCorrectionPage(
      param(req, 'eventId'), param(req, 'disciplineId'),
      { input: disciplineInputFrom(req), errorMessage: err.message },
    ));
  } catch (inner) {
    handleControllerError(inner, res, next, CONTEXT);
  }
}

export const adminEventResultController = {
  /** GET /admin/events/results */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render('admin/event-results/index', adminEventResultService.getResultsFinderPage(query));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/events/:eventId/results */
  event(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let notice: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.EVENT_RESULT_OUTCOME) {
        notice = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/event-results/event',
        adminEventResultService.getEventResultsPage(param(req, 'eventId'), { notice }));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/events/:eventId/results/entries/:entryId */
  entry(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/event-results/entry',
        adminEventResultService.getEntryCorrectionPage(param(req, 'eventId'), param(req, 'entryId')));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/events/:eventId/results/entries/:entryId */
  previewEntry(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/event-results/confirm', adminEventResultService.previewEntryCorrection(
        param(req, 'eventId'), param(req, 'entryId'), entryInputFrom(req), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      renderEntryError(req, res, err, next);
    }
  },

  /** POST /admin/events/:eventId/results/entries/:entryId/confirm */
  confirmEntry(req: Request, res: Response, next: NextFunction): void {
    const eventId = param(req, 'eventId');
    try {
      const outcome = adminEventResultService.applyEntryCorrection(
        req.user!.userId, eventId, param(req, 'entryId'), entryInputFrom(req), bodyValue(req, 'reason'),
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.EVENT_RESULT_OUTCOME,
        to: `/admin/events/${encodeURIComponent(eventId)}/results`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      renderEntryError(req, res, err, next);
    }
  },

  /** GET /admin/events/:eventId/results/disciplines/:disciplineId */
  discipline(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/event-results/discipline',
        adminEventResultService.getDisciplineCorrectionPage(param(req, 'eventId'), param(req, 'disciplineId')));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/events/:eventId/results/disciplines/:disciplineId */
  previewDiscipline(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/event-results/confirm', adminEventResultService.previewDisciplineCorrection(
        param(req, 'eventId'), param(req, 'disciplineId'), disciplineInputFrom(req), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      renderDisciplineError(req, res, err, next);
    }
  },

  /** POST /admin/events/:eventId/results/disciplines/:disciplineId/confirm */
  confirmDiscipline(req: Request, res: Response, next: NextFunction): void {
    const eventId = param(req, 'eventId');
    try {
      const outcome = adminEventResultService.applyDisciplineCorrection(
        req.user!.userId, eventId, param(req, 'disciplineId'), disciplineInputFrom(req), bodyValue(req, 'reason'),
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.EVENT_RESULT_OUTCOME,
        to: `/admin/events/${encodeURIComponent(eventId)}/results`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      renderDisciplineError(req, res, err, next);
    }
  },
};
