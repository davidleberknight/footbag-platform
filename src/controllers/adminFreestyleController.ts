import { Request, Response, NextFunction } from 'express';
import {
  freestyleCurationService,
  FreestyleTrickScalarInput,
} from '../services/freestyleCurationService';
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
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Not Found' },
    page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Not Found' },
  });
}
