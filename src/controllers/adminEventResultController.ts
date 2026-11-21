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
import { z } from 'zod';
import { parseFormBody, formText } from '../lib/parseFormBody';

const CONTEXT = 'admin event result controller';
const NAME_FIELD = /^name_(.+)$/;

// The entry form carries one name input per player, named `name_<personId>`;
// every field beyond the fixed ones is read as text and only those are used.
const entryForm = z.object({
  placement: formText('Placement'),
  score_text: formText('Score'),
  discipline_id: formText('Competition'),
  reason: formText('Reason'),
}).catchall(formText('Player name'));

const disciplineForm = z.object({
  sport_family: formText('Sport'),
  aggregate_standing: formText('Overall standing'),
  reason: formText('Reason'),
});

// A form as typed: the parsed fields, or on a refusal the ones that arrived as
// text, so the refused form comes back holding them.
function typed(schema: z.ZodType, req: Request): Record<string, string> {
  const parsed = parseFormBody(schema, req.body);
  return (parsed.ok ? parsed.data : parsed.submitted) as Record<string, string>;
}

// A form read through its schema; a shape it never sends is refused like any
// other fixable correction.
function read(schema: z.ZodType, req: Request): Record<string, string> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data as Record<string, string>;
}

function param(req: Request, name: string): string {
  return req.params[name] ?? '';
}

function entryInputFrom(fields: Record<string, string>): EntryCorrectionInput {
  // A Map, so a posted field name is only ever a key, never a property.
  const names = new Map<string, string>();
  for (const [key, value] of Object.entries(fields)) {
    const match = NAME_FIELD.exec(key);
    if (match) names.set(match[1]!, value ?? '');
  }
  return {
    placement:    fields.placement ?? '',
    scoreText:    fields.score_text ?? '',
    disciplineId: fields.discipline_id ?? '',
    names,
  };
}

function disciplineInputFrom(fields: Record<string, string>): DisciplineCorrectionInput {
  return {
    sportFamily:       fields.sport_family ?? '',
    aggregateStanding: fields.aggregate_standing ?? '',
  };
}

/** A correction the administrator can fix goes back to its form with what they typed. */
function renderEntryError(req: Request, res: Response, err: unknown, next: NextFunction): void {
  if (!(err instanceof ValidationError)) { handleControllerError(err, res, next, CONTEXT); return; }
  try {
    res.status(422).render('admin/event-results/entry', adminEventResultService.getEntryCorrectionPage(
      param(req, 'eventId'), param(req, 'entryId'),
      { input: entryInputFrom(typed(entryForm, req)), errorMessage: err.message },
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
      { input: disciplineInputFrom(typed(disciplineForm, req)), errorMessage: err.message },
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
      const form = read(entryForm, req);
      res.render('admin/event-results/confirm', adminEventResultService.previewEntryCorrection(
        param(req, 'eventId'), param(req, 'entryId'), entryInputFrom(form), form.reason,
      ));
    } catch (err) {
      renderEntryError(req, res, err, next);
    }
  },

  /** POST /admin/events/:eventId/results/entries/:entryId/confirm */
  confirmEntry(req: Request, res: Response, next: NextFunction): void {
    const eventId = param(req, 'eventId');
    try {
      const form = read(entryForm, req);
      const outcome = adminEventResultService.applyEntryCorrection(
        req.user!.userId, eventId, param(req, 'entryId'), entryInputFrom(form), form.reason,
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
      const form = read(disciplineForm, req);
      res.render('admin/event-results/confirm', adminEventResultService.previewDisciplineCorrection(
        param(req, 'eventId'), param(req, 'disciplineId'), disciplineInputFrom(form), form.reason,
      ));
    } catch (err) {
      renderDisciplineError(req, res, err, next);
    }
  },

  /** POST /admin/events/:eventId/results/disciplines/:disciplineId/confirm */
  confirmDiscipline(req: Request, res: Response, next: NextFunction): void {
    const eventId = param(req, 'eventId');
    try {
      const form = read(disciplineForm, req);
      const outcome = adminEventResultService.applyDisciplineCorrection(
        req.user!.userId, eventId, param(req, 'disciplineId'), disciplineInputFrom(form), form.reason,
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
