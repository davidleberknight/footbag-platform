import { Request, Response, NextFunction } from 'express';
import {
  identityAccessService,
  ClaimConfirmContent,
  LinkHistoryContent,
} from '../services/identityAccessService';
import {
  memberOnboardingService,
  TASK_CATALOG,
  OnboardingTaskType,
  WizardFlash,
  WizardActionResult,
  WizardCard,
  LegacyClaimAutoLinkConfirmFormState,
  LegacyClaimTokenConfirmFormState,
  FirstCompetitionYearFormState,
  ShowCompetitiveResultsFormState,
} from '../services/memberOnboardingService';
import { memberService } from '../services/memberService';
import { logger } from '../config/logger';
import { handleControllerError } from '../lib/controllerErrors';
import { PageViewModel } from '../types/page';
import {
  FLASH_KIND,
  writeFlash,
  readFlash,
  clearFlash,
} from '../lib/flashCookie';

// Wizard surface: `/register/wizard/:taskType`. POST handlers are thin
// HTTP glue per VIEW_CATALOG §8.4: parse input, call one service method
// returning a WizardActionResult, switch on the discriminant. Success
// outcomes 303 to the next task (or /register/wizard/complete);
// transient-notice outcomes 303 to the same task with a flash cookie
// carrying the next GET's banner state; validation errors re-render
// inline at 422; rate-limit re-renders at 429 with Retry-After. The
// auth-gate redirect to /login?returnTo=... comes from requireAuth.

const TASK_TYPE_SET: Set<string> = new Set(TASK_CATALOG);
const WIZARD_COMPLETE_URL = '/register/wizard/complete';

const EMPTY_FLASH = {
  submitted: false,
  hpPersonId: null,
  sinceIndex: null,
  autoLinkDrift: false,
} as const;

interface ClubAffiliationsCardContent {
  dashboardHref:   string;
  submitHref:      string;
  skipHref:        string;
  card:            WizardCard | null;
  cardsTotal:      number;
  cardsRemaining:  number;
  resolvedNotice:  { clubName: string; decision: 'confirm' | 'correct' | 'decline' } | null;
  formError:       string | null;
}

interface FirstCompetitionYearContent {
  dashboardHref: string;
  yearValue: string;
  error: string | null;
}

interface ShowCompetitiveResultsContent {
  dashboardHref: string;
  enabled: boolean;
  error: string | null;
}

interface WizardCompleteContent {
  dashboardHref: string;
}

function dashboardHrefFor(req: Request): string {
  return `/members/${encodeURIComponent(req.user!.slug)}`;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

function isValidTaskType(value: string | undefined): value is OnboardingTaskType {
  return typeof value === 'string' && TASK_TYPE_SET.has(value);
}

function taskUrlFor(taskType: OnboardingTaskType): string {
  return `/register/wizard/${taskType}`;
}

function nextPendingTask(memberId: string): OnboardingTaskType | null {
  const pending = memberOnboardingService.getTaskWidget(memberId);
  return pending.length > 0 ? pending[0].taskType : null;
}

function nextPendingHref(memberId: string): string {
  const next = nextPendingTask(memberId);
  return next ? taskUrlFor(next) : WIZARD_COMPLETE_URL;
}

function writeWizardFlash(req: Request, res: Response, flash: WizardFlash): void {
  if (flash.kind === 'WIZARD_LEGACY_CLAIM_RESULT') {
    writeFlash(res, req, FLASH_KIND.WIZARD_LEGACY_CLAIM_RESULT, JSON.stringify(flash.payload));
    return;
  }
  if (flash.kind === 'WIZARD_AUTO_LINK_DRIFT') {
    writeFlash(res, req, FLASH_KIND.WIZARD_AUTO_LINK_DRIFT);
    return;
  }
  if (flash.kind === 'WIZARD_CLUB_CARD_RESOLVED') {
    writeFlash(res, req, FLASH_KIND.WIZARD_CLUB_CARD_RESOLVED, JSON.stringify(flash.payload));
  }
}

interface WizardFlashState {
  submitted: boolean;
  hpPersonId: string | null;
  sinceIndex: number | null;
  autoLinkDrift: boolean;
}

function readWizardFlashState(req: Request, res: Response): WizardFlashState {
  const flash = readFlash(req);
  if (!flash) return { ...EMPTY_FLASH };
  if (flash.kind === FLASH_KIND.WIZARD_LEGACY_CLAIM_RESULT) {
    clearFlash(res, req);
    let hpPersonId: string | null = null;
    let sinceIndex: number | null = null;
    try {
      const payload = JSON.parse(flash.payload ?? '{}');
      if (typeof payload.hpPersonId === 'string') hpPersonId = payload.hpPersonId;
      if (typeof payload.sinceIndex === 'number') sinceIndex = payload.sinceIndex;
    } catch {
      // Garbage payload: still treat as submitted; just no HP card or preview.
    }
    return { submitted: true, hpPersonId, sinceIndex, autoLinkDrift: false };
  }
  if (flash.kind === FLASH_KIND.WIZARD_AUTO_LINK_DRIFT) {
    clearFlash(res, req);
    return { submitted: false, hpPersonId: null, sinceIndex: null, autoLinkDrift: true };
  }
  // Foreign flash kind (e.g., LOGOUT, AVATAR_UPLOADED): leave it intact for
  // whichever surface owns it.
  return { ...EMPTY_FLASH };
}

async function renderLegacyClaim(
  req: Request,
  res: Response,
  state: WizardFlashState,
  statusOverride?: number,
  validationMessage?: string,
): Promise<void> {
  const memberId = req.user!.userId;
  const data = await identityAccessService.getLinkHistoryViewForWizard(memberId, {
    submitted: state.submitted,
    hpPersonId: state.hpPersonId,
    sinceIndex: state.sinceIndex,
    autoLinkDrift: state.autoLinkDrift,
  });
  if (!data) {
    renderNotFound(res);
    return;
  }
  data.dashboardHref = dashboardHrefFor(req);
  if (validationMessage) data.validationMessage = validationMessage;
  res.status(statusOverride ?? 200).render('register/wizard/legacy-claim', {
    seo:  { title: 'Find your past records and clubs' },
    page: { sectionKey: 'members', pageKey: 'onboarding_legacy_claim', title: 'Find your past records and clubs' },
    content: data,
  } satisfies PageViewModel<LinkHistoryContent>);
}

function readClubResolvedFlash(
  req: Request,
  res: Response,
): { clubName: string; decision: 'confirm' | 'correct' | 'decline' } | null {
  const flash = readFlash(req);
  if (!flash) return null;
  if (flash.kind !== FLASH_KIND.WIZARD_CLUB_CARD_RESOLVED) return null;
  clearFlash(res, req);
  try {
    const payload = JSON.parse(flash.payload ?? '{}');
    if (typeof payload.clubName === 'string' &&
        (payload.decision === 'confirm' || payload.decision === 'correct' || payload.decision === 'decline')) {
      return { clubName: payload.clubName, decision: payload.decision };
    }
  } catch { /* garbage payload: drop the notice */ }
  return null;
}

function renderClubAffiliationsCard(
  req: Request,
  res: Response,
  opts: { formError?: string | null; statusOverride?: number } = {},
): void {
  const memberId = req.user!.userId;
  const cards = memberOnboardingService.listWizardCardsForMember(memberId);
  const resolvedNotice = readClubResolvedFlash(req, res);
  // cardsTotal is best-effort: when a notice is present we know the user just
  // resolved one card, so the original total was cards.length + 1. Otherwise
  // (fresh wizard load), cardsTotal = cards.length. The template renders
  // "Card N of M" only when M > 1.
  const cardsRemaining = cards.length;
  const cardsTotal     = resolvedNotice ? cardsRemaining + 1 : cardsRemaining;
  res.status(opts.statusOverride ?? 200).render('register/wizard/club-affiliations', {
    seo:  { title: 'Confirm your clubs' },
    page: { sectionKey: 'members', pageKey: 'onboarding_club_affiliations', title: 'Confirm your clubs' },
    content: {
      dashboardHref:  dashboardHrefFor(req),
      submitHref:     '/register/wizard/club_affiliations/submit',
      skipHref:       '/register/wizard/club_affiliations/skip',
      card:           cards.length > 0 ? cards[0] : null,
      cardsTotal,
      cardsRemaining,
      resolvedNotice,
      formError:      opts.formError ?? null,
    },
  } satisfies PageViewModel<ClubAffiliationsCardContent>);
}

function renderFirstCompetitionYear(
  req: Request,
  res: Response,
  opts: { yearValue?: string; error?: string | null; statusOverride?: number } = {},
): void {
  const prefill = memberService.getCompetitionPrefill(req.user!.userId);
  const yearValue =
    opts.yearValue !== undefined
      ? opts.yearValue
      : prefill.firstCompetitionYear != null
      ? String(prefill.firstCompetitionYear)
      : '';
  res.status(opts.statusOverride ?? 200).render('register/wizard/first-competition-year', {
    seo:  { title: 'When did you start competing?' },
    page: { sectionKey: 'members', pageKey: 'onboarding_first_competition_year', title: 'When did you start competing?' },
    content: {
      dashboardHref: dashboardHrefFor(req),
      yearValue,
      error: opts.error ?? null,
    },
  } satisfies PageViewModel<FirstCompetitionYearContent>);
}

function renderShowCompetitiveResults(
  req: Request,
  res: Response,
  opts: { enabled?: boolean; error?: string | null; statusOverride?: number } = {},
): void {
  const prefill = memberService.getCompetitionPrefill(req.user!.userId);
  const enabled = opts.enabled !== undefined ? opts.enabled : prefill.showCompetitiveResults;
  res.status(opts.statusOverride ?? 200).render('register/wizard/show-competitive-results', {
    seo:  { title: 'Show your competition results?' },
    page: { sectionKey: 'members', pageKey: 'onboarding_show_competitive_results', title: 'Show your competition results?' },
    content: {
      dashboardHref: dashboardHrefFor(req),
      enabled,
      error: opts.error ?? null,
    },
  } satisfies PageViewModel<ShowCompetitiveResultsContent>);
}

function renderComplete(req: Request, res: Response): void {
  res.status(200).render('register/wizard/complete', {
    seo:  { title: 'Onboarding complete' },
    page: { sectionKey: 'members', pageKey: 'onboarding_complete', title: 'Onboarding complete' },
    content: { dashboardHref: dashboardHrefFor(req) },
  } satisfies PageViewModel<WizardCompleteContent>);
}

async function renderTaskByType(
  req: Request,
  res: Response,
  taskType: OnboardingTaskType,
): Promise<void> {
  switch (taskType) {
    case 'legacy_claim': {
      const state = readWizardFlashState(req, res);
      await renderLegacyClaim(req, res, state);
      return;
    }
    case 'club_affiliations':        renderClubAffiliationsCard(req, res); return;
    case 'first_competition_year':   renderFirstCompetitionYear(req, res); return;
    case 'show_competitive_results': renderShowCompetitiveResults(req, res); return;
    default: {
      const _exhaustive: never = taskType;
      void _exhaustive;
      renderNotFound(res);
    }
  }
}

interface DispatchOpts<TFormState> {
  action: () => Promise<WizardActionResult<TFormState>> | WizardActionResult<TFormState>;
  renderValidationError?: (result: { formState: TFormState; message: string }) => void | Promise<void>;
  renderRateLimited?: () => void | Promise<void>;
}

async function dispatch<TFormState>(
  req: Request,
  res: Response,
  next: NextFunction,
  currentTaskType: OnboardingTaskType,
  opts: DispatchOpts<TFormState>,
): Promise<void> {
  try {
    const result = await opts.action();
    switch (result.kind) {
      case 'advance':
        res.redirect(303, result.nextTaskType
          ? taskUrlFor(result.nextTaskType) : WIZARD_COMPLETE_URL);
        return;
      case 'retry_same':
        if (result.flash) writeWizardFlash(req, res, result.flash);
        res.redirect(303, taskUrlFor(currentTaskType));
        return;
      case 'validation_error':
        if (opts.renderValidationError) await opts.renderValidationError(result);
        return;
      case 'rate_limited':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        if (opts.renderRateLimited) await opts.renderRateLimited();
        return;
    }
  } catch (err) {
    // Map NotFoundError / ValidationError to 404 (anti-enumeration for the
    // F1 ownership check on club_affiliations submit), ServiceUnavailableError
    // to 503, everything else to next(err) -> 500.
    handleControllerError(err, res, next, `onboarding wizard:${currentTaskType}`);
  }
}

export const memberOnboardingController = {
  async getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskType = req.params.taskType;
      if (!isValidTaskType(taskType)) {
        renderNotFound(res);
        return;
      }
      const memberId = req.user!.userId;
      memberOnboardingService.startTaskList(memberId);

      // Reconcile task state with underlying reality before render. If the
      // underlying state shows the task is already done or moot, transition
      // it now and 303 to the next pending task (or /complete). Keeps the
      // wizard from rendering a search page for an already-linked account
      // or a "no clubs to confirm" empty state for a member who can never
      // have cards.
      let transitioned = false;
      if (taskType === 'legacy_claim') {
        transitioned = memberOnboardingService.ensureLegacyClaimReflectsState(memberId);
      } else if (taskType === 'club_affiliations') {
        transitioned = memberOnboardingService.ensureClubAffiliationsReflectsState(memberId);
      }
      if (transitioned) {
        const nextHref = nextPendingHref(memberId);
        res.redirect(303, nextHref);
        return;
      }
      await renderTaskByType(req, res, taskType);
    } catch (err) {
      logger.error('onboarding getTask error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  getComplete(req: Request, res: Response, next: NextFunction): void {
    try {
      const memberId = req.user!.userId;
      // Don't lie: if any pending tasks remain, route the member to the next
      // one instead of telling them everything is handled.
      const upcoming = nextPendingTask(memberId);
      if (upcoming) {
        res.redirect(303, taskUrlFor(upcoming));
        return;
      }
      renderComplete(req, res);
    } catch (err) {
      logger.error('onboarding getComplete error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  async postSkip(req: Request, res: Response, next: NextFunction): Promise<void> {
    const taskType = req.params.taskType;
    if (!isValidTaskType(taskType)) {
      renderNotFound(res);
      return;
    }
    await dispatch(req, res, next, taskType, {
      action: () => memberOnboardingService.processTaskSkip(req.user!.userId, taskType),
    });
  },

  async postLegacyClaimFind(req: Request, res: Response, next: NextFunction): Promise<void> {
    const identifier = String(req.body.identifier ?? '').trim();
    await dispatch(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimSubmit(req.user!.userId, identifier, req.ip ?? 'unknown'),
      renderValidationError: async (result) => {
        // Surface the validation message inline (e.g. "Enter an identifier to
        // search.") instead of silently reloading the page — D4: empty
        // submits used to look like the click did nothing.
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, result.message);
      },
      renderRateLimited: async () => {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 429,
          'Too many search attempts. Please wait and try again.');
      },
    });
  },

  async postLegacyClaimAutoLinkConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    const personId = String(req.body.personId ?? '').trim();
    await dispatch<LegacyClaimAutoLinkConfirmFormState>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimAutoLinkConfirm(req.user!.userId, personId),
      renderValidationError: (_result) => {
        // Per DD §5.2: state-changing POSTs always 303 to the receiving GET
        // and carry transient state via signed flash. The auto-link validation
        // error (surname mismatch, HP already claimed by another member, etc.)
        // matches the user-facing semantics of classifier drift: "the auto-
        // link attempt didn't go through; pick another candidate." Reuse the
        // drift flash so the next GET renders the standing autoLinkDriftNotice
        // banner inside the wizard chrome rather than dropping the member
        // onto the standalone history/auto-link-confirm template.
        writeWizardFlash(req, res, { kind: 'WIZARD_AUTO_LINK_DRIFT' });
        res.redirect(303, taskUrlFor('legacy_claim'));
      },
    });
  },

  getLegacyClaimTokenConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const token = req.params.token ?? '';
      const result = identityAccessService.peekLegacyClaim(req.user!.userId, token);
      if (!result) {
        res.status(400).render('register/wizard/legacy-claim-token-invalid', {
          seo:  { title: 'Claim link no longer valid' },
          page: { sectionKey: 'members', pageKey: 'onboarding_claim_token_invalid', title: 'Claim link no longer valid' },
          content: { dashboardHref: dashboardHrefFor(req) },
        });
        return;
      }
      res.render('register/wizard/legacy-claim-token-confirm', {
        seo:  { title: 'Confirm legacy account link' },
        page: { sectionKey: 'members', pageKey: 'onboarding_claim_token_confirm', title: 'Confirm legacy account link' },
        content: {
          legacyMemberId: result.legacyMemberId,
          displayName:    result.displayName,
          country:        result.country,
          isHof:          result.isHof,
          isBap:          result.isBap,
          token,
        },
      } satisfies PageViewModel<ClaimConfirmContent>);
    } catch (err) {
      logger.error('onboarding claim token peek error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  async postLegacyClaimTokenConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = String(req.body.token ?? '');
    await dispatch<LegacyClaimTokenConfirmFormState>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimTokenConfirm(req.user!.userId, token),
      renderValidationError: (result) => {
        res.status(422).render('register/wizard/legacy-claim-token-invalid', {
          seo:  { title: 'Claim link no longer valid' },
          page: { sectionKey: 'members', pageKey: 'onboarding_claim_token_invalid', title: 'Claim link no longer valid' },
          content: { dashboardHref: dashboardHrefFor(req), error: result.message || undefined },
        });
      },
    });
  },

  async postFirstCompetitionYearSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rawYear = String(req.body.year ?? '');
    await dispatch<FirstCompetitionYearFormState>(req, res, next, 'first_competition_year', {
      action: () => memberOnboardingService.processFirstCompetitionYearSubmit(req.user!.userId, rawYear),
      renderValidationError: (result) => {
        renderFirstCompetitionYear(req, res, {
          yearValue: result.formState.yearValue,
          error: result.message,
          statusOverride: 422,
        });
      },
    });
  },

  async postShowCompetitiveResultsSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    await dispatch<ShowCompetitiveResultsFormState>(req, res, next, 'show_competitive_results', {
      action: () => memberOnboardingService.processShowCompetitiveResultsSubmit(
        req.user!.userId, req.body.enabled),
      renderValidationError: (result) => {
        renderShowCompetitiveResults(req, res, {
          enabled: result.formState.enabled,
          error: result.message,
          statusOverride: 422,
        });
      },
    });
  },

  async postClubAffiliationsSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    await dispatch<null>(req, res, next, 'club_affiliations', {
      action: () =>
        memberOnboardingService.processClubAffiliationsSubmit(req.user!.userId, req.body),
      renderValidationError: (result) => {
        renderClubAffiliationsCard(req, res, {
          formError:      result.message,
          statusOverride: 422,
        });
      },
    });
  },
};
