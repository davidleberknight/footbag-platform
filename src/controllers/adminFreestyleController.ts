import { Request, Response, NextFunction } from 'express';
import {
  freestyleCurationService,
  FreestyleTrickScalarInput,
  FreestyleAliasInput,
  FreestyleSourceLinkInput,
  FreestyleModifierLinkInput,
} from '../services/freestyleCurationService';
import {
  freestyleRecordCurationService,
  FreestyleRecordScalarInput,
} from '../services/freestyleRecordCurationService';
import {
  consecutiveKicksCurationService,
  ConsecutiveScalarInput,
} from '../services/consecutiveKicksCurationService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';

export const adminFreestyleController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleCurationService.getBrowsePage({
        query:        typeof req.query.q === 'string' ? req.query.q : undefined,
        active:       typeof req.query.active === 'string' ? req.query.active : undefined,
        reviewStatus: typeof req.query.reviewStatus === 'string' ? req.query.reviewStatus : undefined,
      });
      res.render('admin/freestyle-tricks', vm);
    } catch (err) {
      next(err);
    }
  },

  // Edit page for one trick: the editable scalar fields plus the read-only
  // attached aliases, sources, and modifier links. `?saved=1` (set by the
  // post-save redirect) shows the saved indicator.
  edit(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleCurationService.getTrickEditPage(String(req.params.slug), {
        saved: req.query.saved === '1',
      });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/freestyle-trick-edit', vm);
    } catch (err) {
      next(err);
    }
  },

  // Scalar-row save. Updates only the nine editable fields; success redirects
  // back to the edit page with a saved indicator, a validation failure re-renders
  // the form (submitted values + per-field errors) with 422, and an unknown slug
  // is a 404.
  update(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const input: FreestyleTrickScalarInput = {
      canonicalName:     str(req.body.canonicalName),
      adds:              str(req.body.adds),
      movementNotation:  str(req.body.movementNotation),
      executionNotation: str(req.body.executionNotation),
      family:            str(req.body.family),
      baseTrick:         str(req.body.baseTrick),
      category:          str(req.body.category),
      reviewStatus:      str(req.body.reviewStatus),
      isActive:          req.body.isActive !== undefined, // checkbox present -> active
      description:               str(req.body.description),
      shortDescription:          str(req.body.shortDescription),
      executionSummary:          str(req.body.executionSummary),
      learningNotes:             str(req.body.learningNotes),
      prerequisiteNotes:         str(req.body.prerequisiteNotes),
      pronunciation:             str(req.body.pronunciation),
      operationalNotationSource: str(req.body.operationalNotationSource),
    };

    try {
      freestyleCurationService.updateTrickScalars(slug, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit?saved=1`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          submitted: input,
          fieldErrors: err.fieldErrors ?? {},
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-trick-edit', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Add one alias to a trick. Success redirects back to the edit page; a
  // validation failure re-renders the form (422) with the submitted alias values
  // and an inline error; an unknown trick slug is a 404.
  addAlias(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const input: FreestyleAliasInput = {
      aliasText: str(req.body.aliasText),
      aliasType: str(req.body.aliasType),
    };

    try {
      freestyleCurationService.addAlias(slug, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          aliasError: err.message,
          aliasSubmitted: input,
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-trick-edit', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Remove one alias from a trick. Success redirects back to the edit page; an
  // unknown or wrong-trick alias is a 404.
  removeAlias(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const aliasSlug = String(req.params.aliasSlug);
    try {
      freestyleCurationService.removeAlias(slug, aliasSlug, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Attach one registry source to a trick. Success redirects back to the edit
  // page; a validation failure re-renders the form (422) with the submitted
  // source values and an inline error; an unknown trick slug is a 404.
  attachSource(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const input: FreestyleSourceLinkInput = {
      sourceId:    str(req.body.sourceId),
      externalUrl: str(req.body.externalUrl),
      assertedAdds: str(req.body.assertedAdds),
    };

    try {
      freestyleCurationService.attachSource(slug, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          sourceError: err.message,
          sourceSubmitted: input,
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-trick-edit', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Detach one source link from a trick. Success redirects back to the edit page;
  // an unknown or wrong-trick link is a 404.
  detachSource(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const sourceId = String(req.params.sourceId);
    try {
      freestyleCurationService.detachSource(slug, sourceId, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Attach one registry modifier to a trick. Success redirects back to the edit
  // page; a validation failure re-renders the form (422) with the submitted values
  // and an inline error; an unknown trick slug is a 404.
  attachModifier(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const input: FreestyleModifierLinkInput = {
      modifierSlug: str(req.body.modifierSlug),
      applyOrder:   str(req.body.applyOrder),
    };

    try {
      freestyleCurationService.attachModifier(slug, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          modifierError: err.message,
          modifierSubmitted: input,
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-trick-edit', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Detach one modifier link from a trick, keyed on the modifier slug and apply
  // order. A non-numeric apply-order segment is a 404 (no such link), as is an
  // unknown or wrong-trick link.
  detachModifier(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const modifierSlug = String(req.params.modifierSlug);
    const applyOrder = Number.parseInt(String(req.params.applyOrder), 10);
    if (Number.isNaN(applyOrder)) {
      renderNotFound(res);
      return;
    }
    try {
      freestyleCurationService.detachModifier(slug, modifierSlug, applyOrder, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Browse freestyle world-record rows (all rows, including superseded and
  // low-confidence, which the public records page hides).
  recordsIndex(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-records', freestyleRecordCurationService.getRecordBrowsePage());
    } catch (err) {
      next(err);
    }
  },

  // Edit page for one record; `?saved=1` (set by the post-save redirect) shows the
  // saved indicator. An unknown record id is a 404.
  recordEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleRecordCurationService.getRecordEditPage(String(req.params.id), {
        saved: req.query.saved === '1',
      });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/freestyle-record-edit', vm);
    } catch (err) {
      next(err);
    }
  },

  // Save one record's editable fields. Success redirects back with a saved
  // indicator; a validation failure re-renders the form (422) with the submitted
  // values and per-field errors; an unknown record id is a 404.
  recordUpdate(req: Request, res: Response, next: NextFunction): void {
    const id = String(req.params.id);
    const input = recordInputFromBody(req.body);

    try {
      freestyleRecordCurationService.updateRecord(id, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/records/${id}/edit?saved=1`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleRecordCurationService.getRecordEditPage(id, {
          submitted: input,
          fieldErrors: err.fieldErrors ?? {},
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-record-edit', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Blank new-record form (the same edit template with default values).
  recordNew(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-record-edit', freestyleRecordCurationService.getRecordNewPage());
    } catch (err) {
      next(err);
    }
  },

  // Create one record. Success redirects to the new record's edit page with the
  // saved indicator; a validation failure re-renders the new form (422) with the
  // submitted values and per-field errors.
  recordCreate(req: Request, res: Response, next: NextFunction): void {
    const input = recordInputFromBody(req.body);
    try {
      const id = freestyleRecordCurationService.createRecord(input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/records/${id}/edit?saved=1`);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/freestyle-record-edit', freestyleRecordCurationService.getRecordNewPage({
          submitted: input,
          fieldErrors: err.fieldErrors ?? {},
        }));
        return;
      }
      next(err);
    }
  },

  // Browse consecutive-kicks records, grouped by section and division.
  consecutiveIndex(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/consecutive-records', consecutiveKicksCurationService.getBrowsePage());
    } catch (err) {
      next(err);
    }
  },

  // Edit page for one consecutive-kicks row; `?saved=1` shows the saved indicator.
  // An unknown id is a 404.
  consecutiveEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = consecutiveKicksCurationService.getEditPage(String(req.params.id), {
        saved: req.query.saved === '1',
      });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/consecutive-record-edit', vm);
    } catch (err) {
      next(err);
    }
  },

  // Save one consecutive-kicks row. Success redirects back with a saved indicator;
  // a validation failure re-renders the form (422) with the submitted values and
  // per-field errors; an unknown id is a 404.
  consecutiveUpdate(req: Request, res: Response, next: NextFunction): void {
    const id = String(req.params.id);
    const input = consecutiveInputFromBody(req.body);

    try {
      consecutiveKicksCurationService.updateRow(id, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/consecutive-records/${id}/edit?saved=1`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = consecutiveKicksCurationService.getEditPage(id, {
          submitted: input,
          fieldErrors: err.fieldErrors ?? {},
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/consecutive-record-edit', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Blank new-row form (the same edit template with empty values).
  consecutiveNew(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/consecutive-record-edit', consecutiveKicksCurationService.getNewPage());
    } catch (err) {
      next(err);
    }
  },

  // Create one consecutive-kicks row. Success redirects to the new row's edit page
  // with the saved indicator; a validation failure re-renders the new form (422)
  // with the submitted values and per-field errors.
  consecutiveCreate(req: Request, res: Response, next: NextFunction): void {
    const input = consecutiveInputFromBody(req.body);
    try {
      const id = consecutiveKicksCurationService.createRow(input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/consecutive-records/${id}/edit?saved=1`);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/consecutive-record-edit', consecutiveKicksCurationService.getNewPage({
          submitted: input,
          fieldErrors: err.fieldErrors ?? {},
        }));
        return;
      }
      next(err);
    }
  },

  // Hard-delete one consecutive-kicks row by its stable id. Success redirects to
  // the browse; an unknown id is a 404.
  consecutiveDelete(req: Request, res: Response, next: NextFunction): void {
    try {
      consecutiveKicksCurationService.deleteRow(String(req.params.id), req.user!.userId);
      res.redirect(303, '/admin/freestyle/consecutive-records');
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },
};

function recordInputFromBody(body: Record<string, unknown>): FreestyleRecordScalarInput {
  return {
    recordType:    str(body.recordType),
    personId:      str(body.personId),
    displayName:   str(body.displayName),
    trickName:     str(body.trickName),
    sortName:      str(body.sortName),
    addsCount:     str(body.addsCount),
    valueNumeric:  str(body.valueNumeric),
    valueText:     str(body.valueText),
    achievedDate:  str(body.achievedDate),
    datePrecision: str(body.datePrecision),
    source:        str(body.source),
    confidence:    str(body.confidence),
    videoUrl:      str(body.videoUrl),
    videoTimecode: str(body.videoTimecode),
    notes:         str(body.notes),
    supersededBy:  str(body.supersededBy),
  };
}

function consecutiveInputFromBody(body: Record<string, unknown>): ConsecutiveScalarInput {
  return {
    sortOrder:  str(body.sortOrder),
    section:    str(body.section),
    subsection: str(body.subsection),
    division:   str(body.division),
    year:       str(body.year),
    rank:       str(body.rank),
    player1:    str(body.player1),
    player2:    str(body.player2),
    score:      str(body.score),
    note:       str(body.note),
    eventDate:  str(body.eventDate),
    eventName:  str(body.eventName),
    location:   str(body.location),
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Not Found' },
    page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Not Found' },
  });
}
