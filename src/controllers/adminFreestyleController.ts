import { Request, Response, NextFunction } from 'express';
import {
  freestyleCurationService,
  FreestyleTrickScalarInput,
  FreestyleAliasInput,
  FreestyleAliasClassInput,
  FreestyleSourceLinkInput,
  FreestyleModifierLinkInput,
  FreestyleSourceInput,
  FreestyleModifierInput,
  FreestyleTrickPublicationInput,
  FamilyValidationError,
  SetValidationError,
  GlossaryValidationError,
  OperatorValidationError,
  type FreestyleSetInput,
  type FreestyleGlossaryTermInput,
  type FreestyleOperatorInput,
  type FreestyleFamilyInput,
  type CurationLinkOutcome,
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
import { renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, takeFlash, writeFlash } from '../lib/flashCookie';
import { outcomeNotice } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText, type FormParse } from '../lib/parseFormBody';
import { parsePickIntent, type PickIntent } from '../services/memberPicker';

// One schema per form, each label the field's visible label on its page.

const notationAuthorForm = z.object({
  notation:         formText('Movement notation'),
  evidenceBasis:    formText('Where did the notation come from?'),
  derivationMethod: formText('How was it produced?'),
  conventionId:     formText('Which convention, if it was derived under one?'),
  provenanceNote:   formText('Provenance note'),
});

const trickPublishForm = z.object({
  canonicalName:          formText('Official name'),
  adds:                   formText('Difficulty (ADD)'),
  baseTrick:              formText('Base trick, by its page address'),
  category:               formText('Category'),
  familyOverride:         formText('Family override'),
  description:            formText('Description'),
  aliases:                formText('Aliases'),
  sourceId:               formText('Source'),
  sourceUrl:              formText('Source URL'),
  sourceAssertedNotation: formText('Notation the source itself wrote'),
  modifierLinks:          formText('Modifiers, by their page addresses'),
});

const trickEditForm = z.object({
  canonicalName:             formText('Official name'),
  adds:                      formText('ADD'),
  movementNotation:          formText('Movement notation'),
  executionNotation:         formText('Execution notation'),
  family:                    formText('Trick family'),
  baseTrick:                 formText('Base trick'),
  category:                  formText('Category'),
  reviewStatus:              formText('Review status'),
  // The box has no hidden partner: present (any value) means active.
  isActive:                  formOptionalText('Active'),
  sortOrder:                 formText('Sort position'),
  description:               formText('Description'),
  shortDescription:          formText('Short description'),
  executionSummary:          formText('Execution summary'),
  learningNotes:             formText('Learning notes'),
  prerequisiteNotes:         formText('Prerequisite notes'),
  pronunciation:             formText('Pronunciation'),
  operationalNotationSource: formText('Execution-notation source'),
  aboutDerivatives:          formText('Derivatives note'),
  aboutNamingNote:           formText('Naming note'),
  reversePairBase:           formText('Reverse of'),
  familyOverride:            formText('Public family'),
  trickKind:                 formText('Kind'),
  reviewAspect:              formText('Under review'),
  terminalCohort:            formText('Lands in'),
  terminalCohortPosition:    formText('Position in that list'),
  addDerivation:             formText('Difficulty breakdown'),
  formulaOperator:           formText('Fallback operators'),
  expandedNotation:          formText('Expanded notation'),
  movementNotationSubtitle:  formText('Movement-notation subtitle'),
  executionNotationSubtitle: formText('Execution-notation subtitle'),
});

const aliasAddForm = z.object({
  aliasText:      formText('Add alias'),
  aliasType:      formText('Type'),
  sourceId:       formText('Where it comes from'),
  provenanceNote: formText('What that source says it is'),
});

const aliasEditForm = z.object({
  aliasType:        formText('Type'),
  aliasDisplay:     formText('Show beside the trick name'),
  divergenceReason: formText('Why this differs from the class'),
  // Absent and emptied mean different things here (see updateAlias).
  sourceId:         formOptionalText('Where this alias comes from'),
  provenanceNote:   formOptionalText('What that source says it is'),
});

const sourceAttachForm = z.object({
  sourceId:     formText('Attach source'),
  externalUrl:  formText('External URL'),
  assertedAdds: formText('Asserted ADD'),
});

const modifierAttachForm = z.object({
  modifierSlug: formText('Attach modifier'),
  applyOrder:   formText('Apply order'),
});

const recordForm = z.object({
  recordType:        formText('Record type'),
  personId:          formText('Historical record'),
  displayName:       formText('Display name'),
  trickName:         formText('Trick name'),
  sortName:          formText('Structured sort name'),
  addsCount:         formText('Adds count'),
  valueNumeric:      formText('Value'),
  valueText:         formText('Value text'),
  achievedDate:      formText('Achieved date'),
  datePrecision:     formText('Date precision'),
  source:            formText('Source'),
  confidence:        formText('Confidence'),
  videoUrl:          formText('Video URL'),
  videoTimecode:     formText('Video timecode'),
  notes:             formText('Notes'),
  curatorReviewNote: formText('Curator review note'),
  supersededBy:      formText('Superseded by'),
  // The holder picker's controls post the form back under `pick`, with the
  // search text in `pick_q`; Save posts neither.
  pick:              formOptionalText('The record picker'),
  pick_q:            formText('Search'),
});

/** The holder picker's intent and search text, when one of its controls posted the form. */
function recordPick(parsed: FormParse<z.output<typeof recordForm>>): { intent: PickIntent | null; query: string } | null {
  if (!parsed.ok || parsed.data.pick === undefined) return null;
  return { intent: parsePickIntent(parsed.data.pick), query: parsed.data.pick_q };
}

const consecutiveForm = z.object({
  sortOrder:  formText('Display position'),
  section:    formText('Section'),
  subsection: formText('Subsection'),
  discipline: formText('Record type'),
  year:       formText('Year'),
  rank:       formText('Rank'),
  player1:    formText('Player 1'),
  player2:    formText('Player 2'),
  score:      formText('Score'),
  note:       formText('Note'),
  eventDate:  formText('Event date'),
  eventName:  formText('Event name'),
  location:   formText('Location'),
});

const sourceCreateForm = z.object({
  id:          formText('Source ID'),
  sourceType:  formText('Source type'),
  sourceLabel: formText('Source label'),
  sourceUrl:   formText('Source URL'),
  retrievedAt: formText('Retrieved at'),
  notes:       formText('Notes'),
});

const modifierForm = z.object({
  slug:         formText('Slug'),
  modifierName: formText('Name'),
  addBonus:     formText('ADD'),
  modifierType: formText('Type'),
  notes:        formText('Notes'),
  beginnerNote: formText('Beginner note'),
  browseGroup:  formText('Browse group'),
  browseOrder:  formText('Browse position'),
  // The box has no hidden partner; ticked posts "1", unticked posts nothing.
  browseFullSection: formText('Give it a full browse section of its own'),
});

// The confirm page posts the edit back with confirm=1 once the ADD change is seen.
const modifierEditForm = modifierForm.extend({
  confirm: formText('Confirmation'),
});

const familyForm = z.object({
  displayName:          formText('Display name'),
  parentSlug:           formText('Parent family'),
  tier:                 formText('Tier'),
  sortOrder:            formText('Display order'),
  hook:                 formText('Hook'),
  description:          formText('What the family is'),
  plainLanguageReading: formText('Plain-language reading'),
  importance:           formText('Why it matters'),
  howToRecognize:       formText('How to recognize one'),
  relatedFamilySlugs:   formText('Related families'),
  sharedStructure:      formText('Shared structure'),
  trickPageNote:        formText('Trick-page note'),
  foldedLabels:         formText('Folded family labels'),
});

const setEditForm = z.object({
  displayName:  formText('Display name'),
  setGroup:     formText('Set group'),
  formula:      formText('Formula'),
  explanation:  formText('Plain explanation'),
  relatedSets:  formText('Related sets'),
  // The box has no hidden partner; ticked posts "1", unticked posts nothing.
  heldFromList: formText('Hold off the encyclopedia list'),
});

const setCreateForm = setEditForm.extend({
  slug: formText('Slug'),
});

const glossaryEditForm = z.object({
  term:       formText('Term'),
  definition: formText('Definition'),
  aliases:    formText('Aliases'),
  moreHref:   formText('Deeper link'),
  moreLabel:  formText('Deeper link label'),
});

const glossaryCreateForm = glossaryEditForm.extend({
  slug: formText('Slug'),
});

const operatorEditForm = z.object({
  name:                formText('Name'),
  kind:                formText('Kind'),
  definition:          formText('Definition'),
  decomposition:       formText('Decomposition'),
  decompositionNote:   formText('Note under the decomposition'),
  workedExamples:      formText('Worked examples'),
  sourceNote:          formText('Source note'),
  // The box has no hidden partner; ticked posts "1", unticked posts nothing.
  confirmationPending: formText("Still awaits a curator's confirmation"),
  pageGroup:           formText('Operators page group'),
  pageOrder:           formText('Position in that group'),
});

const operatorCreateForm = operatorEditForm.extend({
  slug: formText('Slug'),
});

type Typed = Partial<Record<string, string>>;

/** The form's values as typed: the parsed fields, or on a refusal the fields
 *  that did arrive as one text value, so the re-render keeps them. */
function typedFields<T>(parsed: FormParse<T>): Typed {
  return parsed.ok ? (parsed.data as Typed) : parsed.submitted;
}

/** A body in a shape the form never sends, thrown inside the handler's try so
 *  its own 422 re-render answers it, each message beside its own field. Nothing
 *  is written. */
function refuseShape<T>(parsed: FormParse<T>): void {
  if (!parsed.ok) throw new ValidationError(parsed.message, { fieldErrors: parsed.fieldErrors });
}

/** Redirect to an edit page after a save, carrying the confirmation in the
 *  one-shot flash keyed to that page's own path. */
function redirectSaved(req: Request, res: Response, editPath: string): void {
  writeFlash(res, req, FLASH_KIND.ADMIN_SAVED, editPath);
  res.redirect(303, editPath);
}

/** Whether this edit page is the one a save just landed on. */
function savedHere(req: Request, res: Response, editPath: string): boolean {
  return takeFlash(req, res, FLASH_KIND.ADMIN_SAVED) === editPath;
}

/** Return to the trick edit page after an attach. The first attach and the
 *  curator's own repeat return as they always have; a link someone else had
 *  already made says so in the informational tone. */
function redirectAfterAttach(req: Request, res: Response, slug: string, outcome: CurationLinkOutcome): void {
  const editPath = `/admin/freestyle/tricks/${slug}/edit`;
  if (outcome.notice) {
    redirectWithOutcome(req, res, {
      flash: FLASH_KIND.FREESTYLE_EDIT_OUTCOME, to: editPath, ending: outcome.ending, text: outcome.notice,
    });
    return;
  }
  res.redirect(303, editPath);
}

export const adminFreestyleController = {
  /** GET /admin/freestyle/notation-backlog */
  notationBacklog(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleCurationService.getNotationBacklogPage();
      res.render('admin/freestyle-notation-backlog', vm);
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/freestyle/notation-drafts */
  notationDrafts(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-notation-drafts', freestyleCurationService.getNotationDraftsPage());
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/freestyle/notation-backlog/:candidateId/author */
  notationAuthorForm(req: Request, res: Response, next: NextFunction): void {
    try {
      const candidateId = req.params['candidateId'] ?? '';
      const vm = freestyleCurationService.getNotationAuthoringPage(candidateId, {
        saved: savedHere(req, res, `/admin/freestyle/notation-backlog/${candidateId}/author`),
      });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/freestyle-notation-author', vm);
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/freestyle/notation-backlog/:candidateId/author */
  notationAuthorSave(req: Request, res: Response, next: NextFunction): void {
    const candidateId = req.params['candidateId'] ?? '';
    const parsed = parseFormBody(notationAuthorForm, req.body);
    const typed = typedFields(parsed);
    const submitted = {
      notation:         str(typed.notation),
      evidenceBasis:    str(typed.evidenceBasis),
      derivationMethod: str(typed.derivationMethod),
      conventionId:     str(typed.conventionId),
      provenanceNote:   str(typed.provenanceNote),
    };
    try {
      refuseShape(parsed);
      freestyleCurationService.saveAuthoredNotation(candidateId, submitted, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/notation-backlog/${candidateId}/author`);
    } catch (err) {
      // A validation failure re-renders the form with what was submitted and the
      // per-field messages, the same shape the trick edit uses.
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getNotationAuthoringPage(candidateId, {
          submitted,
          fieldErrors: err.fieldErrors ?? {},
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-notation-author', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/notation-backlog/:candidateId/publish */
  trickPublishForm(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleCurationService.getTrickPublicationPage(req.params['candidateId'] ?? '');
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/freestyle-trick-publish', vm);
    } catch (err) {
      next(err);
    }
  },

  /** POST /admin/freestyle/notation-backlog/:candidateId/publish */
  trickPublishSave(req: Request, res: Response, next: NextFunction): void {
    const candidateId = req.params['candidateId'] ?? '';
    const parsed = parseFormBody(trickPublishForm, req.body);
    const typed = typedFields(parsed);
    const submitted: FreestyleTrickPublicationInput = {
      canonicalName:          str(typed.canonicalName),
      adds:                   str(typed.adds),
      baseTrick:              str(typed.baseTrick),
      category:               str(typed.category),
      familyOverride:         str(typed.familyOverride),
      description:            str(typed.description),
      aliases:                str(typed.aliases),
      sourceId:               str(typed.sourceId),
      sourceUrl:              str(typed.sourceUrl),
      sourceAssertedNotation: str(typed.sourceAssertedNotation),
      modifierLinks:          str(typed.modifierLinks),
    };
    try {
      refuseShape(parsed);
      const slug = freestyleCurationService.publishCanonicalTrick(
        candidateId, submitted, req.user!.userId,
      );
      const editPath = `/admin/freestyle/tricks/${slug}/edit`;
      writeFlash(res, req, FLASH_KIND.TRICK_PUBLISHED, editPath);
      res.redirect(303, editPath);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickPublicationPage(candidateId, {
          submitted,
          fieldErrors: err.fieldErrors ?? {},
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/freestyle-trick-publish', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

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
  // attached aliases, sources, and modifier links. A save just made here shows
  // the saved indicator.
  edit(req: Request, res: Response, next: NextFunction): void {
    try {
      const slug = String(req.params.slug);
      const editPath = `/admin/freestyle/tricks/${slug}/edit`;
      const vm = freestyleCurationService.getTrickEditPage(slug, {
        saved: savedHere(req, res, editPath),
        published: takeFlash(req, res, FLASH_KIND.TRICK_PUBLISHED) === editPath,
        outcome: outcomeNotice(takeFlash(req, res, FLASH_KIND.FREESTYLE_EDIT_OUTCOME)),
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

  // Scalar-row save. Updates the trick row's own editable fields; success redirects
  // back to the edit page with a saved indicator, a validation failure re-renders
  // the form (submitted values + per-field errors) with 422, and an unknown slug
  // is a 404.
  update(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const parsed = parseFormBody(trickEditForm, req.body);
    const typed = typedFields(parsed);
    const input: FreestyleTrickScalarInput = {
      canonicalName:     str(typed.canonicalName),
      adds:              str(typed.adds),
      movementNotation:  str(typed.movementNotation),
      executionNotation: str(typed.executionNotation),
      family:            str(typed.family),
      baseTrick:         str(typed.baseTrick),
      category:          str(typed.category),
      reviewStatus:      str(typed.reviewStatus),
      isActive:          typed.isActive !== undefined, // checkbox present -> active
      sortOrder:         str(typed.sortOrder),
      description:               str(typed.description),
      shortDescription:          str(typed.shortDescription),
      executionSummary:          str(typed.executionSummary),
      learningNotes:             str(typed.learningNotes),
      prerequisiteNotes:         str(typed.prerequisiteNotes),
      pronunciation:             str(typed.pronunciation),
      operationalNotationSource: str(typed.operationalNotationSource),
      aboutDerivatives:          str(typed.aboutDerivatives),
      aboutNamingNote:           str(typed.aboutNamingNote),
      reversePairBase:           str(typed.reversePairBase),
      familyOverride:            str(typed.familyOverride),
      trickKind:                 str(typed.trickKind),
      reviewAspect:              str(typed.reviewAspect),
      terminalCohort:            str(typed.terminalCohort),
      terminalCohortPosition:    str(typed.terminalCohortPosition),
      addDerivation:             str(typed.addDerivation),
      formulaOperator:           str(typed.formulaOperator),
      expandedNotation:          str(typed.expandedNotation),
      movementNotationSubtitle:  str(typed.movementNotationSubtitle),
      executionNotationSubtitle: str(typed.executionNotationSubtitle),
    };

    try {
      refuseShape(parsed);
      freestyleCurationService.updateTrickScalars(slug, input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/tricks/${slug}/edit`);
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
    const parsed = parseFormBody(aliasAddForm, req.body);
    const typed = typedFields(parsed);
    const input: FreestyleAliasInput = {
      aliasText: str(typed.aliasText),
      aliasType: str(typed.aliasType),
      sourceId: str(typed.sourceId),
      provenanceNote: str(typed.provenanceNote),
    };

    try {
      refuseShape(parsed);
      redirectAfterAttach(req, res, slug, freestyleCurationService.addAlias(slug, input, req.user!.userId));
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          aliasError: err.message,
          aliasFieldErrors: err.fieldErrors ?? {},
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

  // Set one alias's class and public-display state. Success redirects back to the
  // edit page; a validation failure re-renders the form (422) with an inline
  // error; an unknown or wrong-trick alias is a 404.
  updateAlias(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const aliasSlug = String(req.params.aliasSlug);
    // Provenance fields are passed only when the request actually carries them.
    // A missing field and an emptied one mean different things here: emptied is a
    // curator clearing provenance on purpose, missing is a form that never asked,
    // and the service must not read the second as the first.
    const parsed = parseFormBody(aliasEditForm, req.body);
    const typed = typedFields(parsed);
    const input: FreestyleAliasClassInput = {
      aliasType: str(typed.aliasType),
      aliasDisplay: str(typed.aliasDisplay),
      divergenceReason: str(typed.divergenceReason),
      ...(typed.sourceId !== undefined ? { sourceId: typed.sourceId } : {}),
      ...(typed.provenanceNote !== undefined ? { provenanceNote: typed.provenanceNote } : {}),
    };

    try {
      refuseShape(parsed);
      freestyleCurationService.updateAlias(slug, aliasSlug, input, req.user!.userId);
      res.redirect(303, `/admin/freestyle/tricks/${slug}/edit`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          aliasError: err.message,
          aliasEdit: { aliasSlug, submitted: input, fieldErrors: err.fieldErrors ?? {} },
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
    const parsed = parseFormBody(sourceAttachForm, req.body);
    const typed = typedFields(parsed);
    const input: FreestyleSourceLinkInput = {
      sourceId:    str(typed.sourceId),
      externalUrl: str(typed.externalUrl),
      assertedAdds: str(typed.assertedAdds),
    };

    try {
      refuseShape(parsed);
      redirectAfterAttach(req, res, slug, freestyleCurationService.attachSource(slug, input, req.user!.userId));
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          sourceError: err.message,
          sourceFieldErrors: err.fieldErrors ?? {},
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
    const parsed = parseFormBody(modifierAttachForm, req.body);
    const typed = typedFields(parsed);
    const input: FreestyleModifierLinkInput = {
      modifierSlug: str(typed.modifierSlug),
      applyOrder:   str(typed.applyOrder),
    };

    try {
      refuseShape(parsed);
      redirectAfterAttach(req, res, slug, freestyleCurationService.attachModifier(slug, input, req.user!.userId));
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = freestyleCurationService.getTrickEditPage(slug, {
          modifierError: err.message,
          modifierFieldErrors: err.fieldErrors ?? {},
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
  recordsIndex(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleRecordCurationService.getRecordBrowsePage({
        query:      typeof req.query.q === 'string' ? req.query.q : undefined,
        recordType: typeof req.query.recordType === 'string' ? req.query.recordType : undefined,
      });
      res.render('admin/freestyle-records', vm);
    } catch (err) {
      next(err);
    }
  },

  // Edit page for one record; a save just made here shows the saved indicator.
  // An unknown record id is a 404.
  recordEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const id = String(req.params.id);
      const vm = freestyleRecordCurationService.getRecordEditPage(id, {
        saved: savedHere(req, res, `/admin/freestyle/records/${id}/edit`),
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
    const parsed = parseFormBody(recordForm, req.body);
    const input = recordInputFrom(typedFields(parsed));

    try {
      const pick = recordPick(parsed);
      if (pick) {
        // A holder picker control: the form again, holding what was typed. Writes nothing.
        const vm = freestyleRecordCurationService.getRecordEditPage(id, { submitted: input, ...pick });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.render('admin/freestyle-record-edit', vm);
        return;
      }
      refuseShape(parsed);
      freestyleRecordCurationService.updateRecord(id, input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/records/${id}/edit`);
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
    const parsed = parseFormBody(recordForm, req.body);
    const input = recordInputFrom(typedFields(parsed));
    try {
      const pick = recordPick(parsed);
      if (pick) {
        // A holder picker control: the new form again, holding what was typed. Writes nothing.
        res.render('admin/freestyle-record-edit', freestyleRecordCurationService.getRecordNewPage({ submitted: input, ...pick }));
        return;
      }
      refuseShape(parsed);
      const id = freestyleRecordCurationService.createRecord(input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/records/${id}/edit`);
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

  // Browse consecutive-kicks records, grouped by section and record type.
  consecutiveIndex(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/consecutive-records', consecutiveKicksCurationService.getBrowsePage());
    } catch (err) {
      next(err);
    }
  },

  // Edit page for one consecutive-kicks row; a save just made here shows the
  // saved indicator. An unknown id is a 404.
  consecutiveEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const id = String(req.params.id);
      const vm = consecutiveKicksCurationService.getEditPage(id, {
        saved: savedHere(req, res, `/admin/freestyle/consecutive-records/${id}/edit`),
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
    const parsed = parseFormBody(consecutiveForm, req.body);
    const input = consecutiveInputFrom(typedFields(parsed));

    try {
      refuseShape(parsed);
      consecutiveKicksCurationService.updateRow(id, input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/consecutive-records/${id}/edit`);
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
    const parsed = parseFormBody(consecutiveForm, req.body);
    const input = consecutiveInputFrom(typedFields(parsed));
    try {
      refuseShape(parsed);
      const id = consecutiveKicksCurationService.createRow(input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/consecutive-records/${id}/edit`);
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

  // The confirm page before a delete: a deletion cannot be undone, so the final
  // button sits behind a page that names the row. An unknown id is a 404.
  consecutiveDeleteConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = consecutiveKicksCurationService.getDeleteConfirmPage(String(req.params.id));
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/consecutive-record-delete-confirm', vm);
    } catch (err) {
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

  // The dictionary provenance-source registry: the existing sources plus the
  // create form.
  sources(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-sources', freestyleCurationService.getSourceRegistryPage());
    } catch (err) {
      next(err);
    }
  },

  // Create one provenance source. Success redirects to the registry; a validation
  // failure re-renders the create form (422) with the submitted values and an
  // inline error.
  createSource(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(sourceCreateForm, req.body);
    const typed = typedFields(parsed);
    const input: FreestyleSourceInput = {
      id:          str(typed.id),
      sourceType:  str(typed.sourceType),
      sourceLabel: str(typed.sourceLabel),
      sourceUrl:   str(typed.sourceUrl),
      retrievedAt: str(typed.retrievedAt),
      notes:       str(typed.notes),
    };
    try {
      refuseShape(parsed);
      freestyleCurationService.createSource(input, req.user!.userId);
      res.redirect(303, '/admin/freestyle/sources');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/freestyle-sources', freestyleCurationService.getSourceRegistryPage({
          submitted: input,
          error: err.message,
          fieldErrors: err.fieldErrors ?? {},
        }));
        return;
      }
      next(err);
    }
  },

  modifiers(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-modifiers', freestyleCurationService.getModifierRegistryPage());
    } catch (err) {
      next(err);
    }
  },

  // Create one modifier. Success redirects to the registry; a validation failure
  // re-renders the create form (422) with the submitted values.
  createModifier(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(modifierForm, req.body);
    const input = modifierInputFrom(typedFields(parsed));
    try {
      refuseShape(parsed);
      freestyleCurationService.createModifier(input, req.user!.userId);
      res.redirect(303, '/admin/freestyle/modifiers');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/freestyle-modifiers', freestyleCurationService.getModifierRegistryPage({
          submitted: input, error: err.message, fieldErrors: err.fieldErrors ?? {},
        }));
        return;
      }
      next(err);
    }
  },

  editModifier(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-modifier-edit', freestyleCurationService.getModifierEditPage(str(req.params.slug)));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Save one modifier's edit. An ADD change not yet confirmed renders the confirm
  // page; a confirmed or ADD-free change saves and redirects to the registry.
  updateModifier(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const parsed = parseFormBody(modifierEditForm, req.body);
    const typed = typedFields(parsed);
    const input = modifierInputFrom(typed);
    try {
      refuseShape(parsed);
      const result = freestyleCurationService.updateModifier(slug, input, req.user!.userId, {
        confirmed: typed.confirm === '1',
      });
      if (result.status === 'confirm') {
        res.render('admin/freestyle-modifier-add-confirm', result.page);
        return;
      }
      res.redirect(303, '/admin/freestyle/modifiers');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/freestyle-modifier-edit', freestyleCurationService.getModifierEditPage(slug, {
          submitted: input, error: err.message, fieldErrors: err.fieldErrors ?? {},
        }));
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/families */
  families(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-families', freestyleCurationService.getFamilyListPage());
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/freestyle/families/:slug/edit */
  editFamily(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const editPath = `/admin/freestyle/families/${slug}/edit`;
    try {
      res.render('admin/freestyle-family-edit',
        freestyleCurationService.getFamilyEditPage(slug, { saved: savedHere(req, res, editPath) }));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Save one family's edit. Success, or an unchanged submit, returns to the edit
  // page; a refusal re-renders it (422) with the submitted values and every reason.
  updateFamily(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const parsed = parseFormBody(familyForm, req.body);
    const input = familyInputFrom(typedFields(parsed));
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-family-edit', freestyleCurationService.getFamilyEditPage(slug, {
          submitted: input, errors: Object.values(parsed.fieldErrors), fieldErrors: parsed.fieldErrors,
        }));
        return;
      }
      const result = freestyleCurationService.updateFamily(slug, input, req.user!.userId);
      const editPath = `/admin/freestyle/families/${slug}/edit`;
      if (result.status === 'saved') redirectSaved(req, res, editPath);
      else res.redirect(303, editPath);
    } catch (err) {
      if (err instanceof FamilyValidationError) {
        res.status(422).render('admin/freestyle-family-edit',
          freestyleCurationService.getFamilyEditPage(slug, { submitted: input, errors: [...err.reasons] }));
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/sets */
  sets(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-sets', freestyleCurationService.getSetListPage());
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/freestyle/sets/new */
  newSet(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-set-form', freestyleCurationService.getSetNewPage());
    } catch (err) {
      next(err);
    }
  },

  // Create one set. Success lands on the new set's edit page; a refusal
  // re-renders the create form (422) with the submitted values and every reason.
  createSet(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(setCreateForm, req.body);
    const input = setInputFrom(typedFields(parsed), true);
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-set-form', freestyleCurationService.getSetNewPage({
          submitted: input, errors: Object.values(parsed.fieldErrors), fieldErrors: parsed.fieldErrors,
        }));
        return;
      }
      freestyleCurationService.createSet(input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/sets/${input.slug}/edit`);
    } catch (err) {
      if (err instanceof SetValidationError) {
        res.status(422).render('admin/freestyle-set-form',
          freestyleCurationService.getSetNewPage({ submitted: input, errors: [...err.reasons] }));
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/sets/:slug/edit */
  editSet(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const editPath = `/admin/freestyle/sets/${slug}/edit`;
    try {
      res.render('admin/freestyle-set-form',
        freestyleCurationService.getSetEditPage(slug, { saved: savedHere(req, res, editPath) }));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Save one set's edit. Success, or an unchanged submit, returns to the edit
  // page; a refusal re-renders it (422) with the submitted values and every reason.
  updateSet(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const parsed = parseFormBody(setEditForm, req.body);
    const input = setInputFrom(typedFields(parsed), false);
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-set-form', freestyleCurationService.getSetEditPage(slug, {
          submitted: input, errors: Object.values(parsed.fieldErrors), fieldErrors: parsed.fieldErrors,
        }));
        return;
      }
      const result = freestyleCurationService.updateSet(slug, input, req.user!.userId);
      const editPath = `/admin/freestyle/sets/${slug}/edit`;
      if (result.status === 'saved') redirectSaved(req, res, editPath);
      else res.redirect(303, editPath);
    } catch (err) {
      if (err instanceof SetValidationError) {
        res.status(422).render('admin/freestyle-set-form',
          freestyleCurationService.getSetEditPage(slug, { submitted: input, errors: [...err.reasons] }));
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/glossary */
  glossary(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-glossary', freestyleCurationService.getGlossaryListPage());
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/freestyle/glossary/new */
  newGlossaryTerm(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-glossary-term-form', freestyleCurationService.getGlossaryNewPage());
    } catch (err) {
      next(err);
    }
  },

  // Add one glossary term. Success lands on the new term's edit page; a refusal
  // re-renders the add form (422) with the submitted values and every reason.
  createGlossaryTerm(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(glossaryCreateForm, req.body);
    const input = glossaryInputFrom(typedFields(parsed), true);
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-glossary-term-form', freestyleCurationService.getGlossaryNewPage({
          submitted: input, errors: Object.values(parsed.fieldErrors),
        }));
        return;
      }
      freestyleCurationService.createGlossaryTerm(input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/glossary/${input.slug}/edit`);
    } catch (err) {
      if (err instanceof GlossaryValidationError) {
        res.status(422).render('admin/freestyle-glossary-term-form',
          freestyleCurationService.getGlossaryNewPage({ submitted: input, errors: [...err.reasons] }));
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/glossary/:slug/edit */
  editGlossaryTerm(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const editPath = `/admin/freestyle/glossary/${slug}/edit`;
    try {
      res.render('admin/freestyle-glossary-term-form',
        freestyleCurationService.getGlossaryEditPage(slug, { saved: savedHere(req, res, editPath) }));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Save one glossary term's edit. Success, or an unchanged submit, returns to the
  // edit page; a refusal re-renders it (422) with the submitted values and every reason.
  updateGlossaryTerm(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const parsed = parseFormBody(glossaryEditForm, req.body);
    const input = glossaryInputFrom(typedFields(parsed), false);
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-glossary-term-form', freestyleCurationService.getGlossaryEditPage(slug, {
          submitted: input, errors: Object.values(parsed.fieldErrors),
        }));
        return;
      }
      const result = freestyleCurationService.updateGlossaryTerm(slug, input, req.user!.userId);
      const editPath = `/admin/freestyle/glossary/${slug}/edit`;
      if (result.status === 'saved') redirectSaved(req, res, editPath);
      else res.redirect(303, editPath);
    } catch (err) {
      if (err instanceof GlossaryValidationError) {
        res.status(422).render('admin/freestyle-glossary-term-form',
          freestyleCurationService.getGlossaryEditPage(slug, { submitted: input, errors: [...err.reasons] }));
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // The confirm page before a removal: links to the term's anchor stop working,
  // so the final button sits behind a page that names the term. Unknown is a 404.
  removeGlossaryTermConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-glossary-term-remove-confirm',
        freestyleCurationService.getGlossaryRemovePage(str(req.params.slug)));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/operators */
  operators(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-operators', freestyleCurationService.getOperatorListPage());
    } catch (err) {
      next(err);
    }
  },

  /** GET /admin/freestyle/operators/new */
  newOperator(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/freestyle-operator-form', freestyleCurationService.getOperatorNewPage());
    } catch (err) {
      next(err);
    }
  },

  // Add one operator. Success lands on the new operator's edit page; a refusal
  // re-renders the add form (422) with the submitted values and every reason.
  createOperator(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(operatorCreateForm, req.body);
    const input = operatorInputFrom(typedFields(parsed), true);
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-operator-form', freestyleCurationService.getOperatorNewPage({
          submitted: input, errors: Object.values(parsed.fieldErrors),
        }));
        return;
      }
      freestyleCurationService.createOperator(input, req.user!.userId);
      redirectSaved(req, res, `/admin/freestyle/operators/${input.slug}/edit`);
    } catch (err) {
      if (err instanceof OperatorValidationError) {
        res.status(422).render('admin/freestyle-operator-form',
          freestyleCurationService.getOperatorNewPage({ submitted: input, errors: [...err.reasons] }));
        return;
      }
      next(err);
    }
  },

  /** GET /admin/freestyle/operators/:slug/edit */
  editOperator(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const editPath = `/admin/freestyle/operators/${slug}/edit`;
    try {
      res.render('admin/freestyle-operator-form',
        freestyleCurationService.getOperatorEditPage(slug, { saved: savedHere(req, res, editPath) }));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Save one operator's edit. Success, or an unchanged submit, returns to the
  // edit page; a refusal re-renders it (422) with the submitted values and every reason.
  updateOperator(req: Request, res: Response, next: NextFunction): void {
    const slug = str(req.params.slug);
    const parsed = parseFormBody(operatorEditForm, req.body);
    const input = operatorInputFrom(typedFields(parsed), false);
    try {
      if (!parsed.ok) {
        res.status(422).render('admin/freestyle-operator-form', freestyleCurationService.getOperatorEditPage(slug, {
          submitted: input, errors: Object.values(parsed.fieldErrors),
        }));
        return;
      }
      const result = freestyleCurationService.updateOperator(slug, input, req.user!.userId);
      const editPath = `/admin/freestyle/operators/${slug}/edit`;
      if (result.status === 'saved') redirectSaved(req, res, editPath);
      else res.redirect(303, editPath);
    } catch (err) {
      if (err instanceof OperatorValidationError) {
        res.status(422).render('admin/freestyle-operator-form',
          freestyleCurationService.getOperatorEditPage(slug, { submitted: input, errors: [...err.reasons] }));
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Remove one glossary term. Success returns to the glossary list; unknown is a 404.
  removeGlossaryTerm(req: Request, res: Response, next: NextFunction): void {
    try {
      freestyleCurationService.removeGlossaryTerm(str(req.params.slug), req.user!.userId);
      res.redirect(303, '/admin/freestyle/glossary');
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },
};

function operatorInputFrom(body: Typed, withSlug: boolean): FreestyleOperatorInput {
  return {
    ...(withSlug ? { slug: str(body.slug) } : {}),
    name:                str(body.name),
    kind:                str(body.kind),
    definition:          str(body.definition),
    decomposition:       str(body.decomposition),
    decompositionNote:   str(body.decompositionNote),
    workedExamples:      str(body.workedExamples),
    sourceNote:          str(body.sourceNote),
    confirmationPending: str(body.confirmationPending),
    pageGroup:           str(body.pageGroup),
    pageOrder:           str(body.pageOrder),
  };
}

function glossaryInputFrom(body: Typed, withSlug: boolean): FreestyleGlossaryTermInput {
  return {
    ...(withSlug ? { slug: str(body.slug) } : {}),
    term:       str(body.term),
    definition: str(body.definition),
    aliases:    str(body.aliases),
    moreHref:   str(body.moreHref),
    moreLabel:  str(body.moreLabel),
  };
}

function setInputFrom(body: Typed, withSlug: boolean): FreestyleSetInput {
  return {
    ...(withSlug ? { slug: str(body.slug) } : {}),
    displayName:  str(body.displayName),
    setGroup:     str(body.setGroup),
    formula:      str(body.formula),
    explanation:  str(body.explanation),
    relatedSets:  str(body.relatedSets),
    heldFromList: str(body.heldFromList),
  };
}

function familyInputFrom(body: Typed): FreestyleFamilyInput {
  return {
    displayName:          str(body.displayName),
    parentSlug:           str(body.parentSlug),
    tier:                 str(body.tier),
    sortOrder:            str(body.sortOrder),
    hook:                 str(body.hook),
    description:          str(body.description),
    plainLanguageReading: str(body.plainLanguageReading),
    importance:           str(body.importance),
    howToRecognize:       str(body.howToRecognize),
    relatedFamilySlugs:   str(body.relatedFamilySlugs),
    sharedStructure:      str(body.sharedStructure),
    trickPageNote:        str(body.trickPageNote),
    foldedLabels:         str(body.foldedLabels),
  };
}

function modifierInputFrom(body: Typed): FreestyleModifierInput {
  return {
    slug:         str(body.slug),
    modifierName: str(body.modifierName),
    addBonus:     str(body.addBonus),
    modifierType: str(body.modifierType),
    notes:        str(body.notes),
    beginnerNote: str(body.beginnerNote),
    browseGroup:       str(body.browseGroup),
    browseOrder:       str(body.browseOrder),
    browseFullSection: str(body.browseFullSection),
  };
}

function recordInputFrom(body: Typed): FreestyleRecordScalarInput {
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
    curatorReviewNote: str(body.curatorReviewNote),
    supersededBy:  str(body.supersededBy),
  };
}

function consecutiveInputFrom(body: Typed): ConsecutiveScalarInput {
  return {
    sortOrder:  str(body.sortOrder),
    section:    str(body.section),
    subsection: str(body.subsection),
    discipline: str(body.discipline),
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
