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
  PersonalDetailsFormState,
} from '../services/memberOnboardingService';
import { memberService } from '../services/memberService';
import { logger } from '../config/logger';
import { handleControllerError } from '../lib/controllerErrors';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { PageViewModel } from '../types/page';
import {
  FLASH_KIND,
  writeFlash,
  readFlash,
  clearFlash,
} from '../lib/flashCookie';
import { getTierStatus } from '../services/membershipTieringService';

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
  leadershipOffers?: Array<{ clubId: string; clubName: string }>;
  stage?:          string;
  canCreateClub?:  boolean;
  nearbyCandidates?: Array<{ id: string; displayName: string; city: string | null; country: string | null }>;
  clubsBrowseHref?: string;
  memberCountry?:  string;
}

interface PersonalDetailsContent {
  dashboardHref: string;
  city: string;
  region: string;
  country: string;
  birthDate: string;
  yearValue: string;
  showFirstCompetitionYear: boolean;
  showCompetitiveResults: boolean;
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
  data.declaredAnchors = identityAccessService.listDeclaredAnchors(memberId);
  data.helpRequestNotice = req.query.help_request === 'sent';
  const anchorVerification = req.query.anchor_verification;
  data.anchorVerificationNotice =
    anchorVerification === 'sent' || anchorVerification === 'verified' || anchorVerification === 'invalid'
      ? anchorVerification
      : null;
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
  const cardsRemaining = cards.length;
  const cardsTotal     = resolvedNotice ? cardsRemaining + 1 : cardsRemaining;

  const stage = cards.length > 0 ? 'stage1' : memberOnboardingService.getClubAffiliationStage(memberId);
  let nearbyCandidates: Array<{ id: string; displayName: string; city: string | null; country: string | null }> | undefined;

  if (stage === 'stage2a') {
    nearbyCandidates = memberOnboardingService.getStage2aCandidates(memberId);
  } else if (stage === 'stage2b') {
    nearbyCandidates = memberOnboardingService.getStage2bCandidates(memberId);
  }

  const leadershipOffers = memberOnboardingService.listPathTwoLeadershipOffers(memberId);
  const prefill = memberService.getPersonalDetailsPrefill(memberId);
  const memberCountry = prefill.country ?? null;
  const countrySlug = memberCountry
    ? memberCountry.toLowerCase().replace(/\s+/g, '_')
    : null;

  res.status(opts.statusOverride ?? 200).render('register/wizard/club-affiliations', {
    seo:  { title: 'Link your primary club' },
    page: { sectionKey: 'members', pageKey: 'onboarding_club_affiliations', title: 'Link your primary club' },
    content: {
      dashboardHref:  dashboardHrefFor(req),
      submitHref:     '/register/wizard/club_affiliations/submit',
      skipHref:       '/register/wizard/club_affiliations/skip',
      card:           cards.length > 0 ? cards[0] : null,
      cardsTotal,
      cardsRemaining,
      resolvedNotice,
      formError:      opts.formError ?? null,
      leadershipOffers,
      stage,
      canCreateClub:  (() => {
        const tier = getTierStatus(memberId);
        return tier != null && tier.tier_status !== 'tier0';
      })(),
      nearbyCandidates,
      clubsBrowseHref: countrySlug ? `/clubs/${countrySlug}` : '/clubs',
      memberCountry,
    },
  } satisfies PageViewModel<ClubAffiliationsCardContent>);
}

function renderPersonalDetails(
  req: Request,
  res: Response,
  opts: { city?: string; region?: string; country?: string; birthDate?: string; yearValue?: string; showFirstCompetitionYear?: boolean; showCompetitiveResults?: boolean; error?: string | null; statusOverride?: number } = {},
): void {
  const prefill = memberService.getPersonalDetailsPrefill(req.user!.userId);
  const yearValue =
    opts.yearValue !== undefined
      ? opts.yearValue
      : prefill.firstCompetitionYear != null
      ? String(prefill.firstCompetitionYear)
      : '';
  res.status(opts.statusOverride ?? 200).render('register/wizard/personal-details', {
    seo:  { title: 'Personal details' },
    page: { sectionKey: 'members', pageKey: 'onboarding_personal_details', title: 'Personal details' },
    content: {
      dashboardHref: dashboardHrefFor(req),
      city: opts.city ?? prefill.city,
      region: opts.region ?? prefill.region,
      country: opts.country ?? prefill.country,
      birthDate: opts.birthDate ?? prefill.birthDate,
      yearValue,
      showFirstCompetitionYear: opts.showFirstCompetitionYear ?? prefill.showFirstCompetitionYear,
      showCompetitiveResults: opts.showCompetitiveResults ?? prefill.showCompetitiveResults,
      error: opts.error ?? null,
    },
  } satisfies PageViewModel<PersonalDetailsContent>);
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
    case 'personal_details':         renderPersonalDetails(req, res); return;
    case 'legacy_claim': {
      const state = readWizardFlashState(req, res);
      await renderLegacyClaim(req, res, state);
      return;
    }
    case 'club_affiliations':        renderClubAffiliationsCard(req, res); return;
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
        res.redirect(303, nextPendingHref(memberId));
        return;
      }

      const taskState = memberOnboardingService.getTaskState(memberId, taskType);
      if (taskState === 'completed' || taskState === 'not_applicable') {
        // A completed legacy_claim still renders while open staged
        // candidates remain (the cross-source follow-on offer surfaces here
        // right after the first claim completes); otherwise completed tasks
        // bounce to the next outstanding one.
        const hasOpenOffers =
          (taskType === 'legacy_claim' &&
            identityAccessService.listOpenStagedCandidates(memberId).length > 0) ||
          (taskType === 'club_affiliations' &&
            memberOnboardingService.listPathTwoLeadershipOffers(memberId).length > 0);
        if (!hasOpenOffers) {
          res.redirect(303, nextPendingHref(memberId));
          return;
        }
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

  async postCrossSourceLegacyConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    const candidateId = String(req.body.candidateId ?? '').trim();
    await dispatch<null>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processCrossSourceLegacyConfirm(req.user!.userId, candidateId),
      renderValidationError: () => {
        writeWizardFlash(req, res, { kind: 'WIZARD_AUTO_LINK_DRIFT' });
        res.redirect(303, taskUrlFor('legacy_claim'));
      },
    });
  },

  async postAnchorSendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      identityAccessService.requestAnchorMailboxVerification(
        req.user!.userId,
        String(req.body.anchorId ?? ''),
        req.ip ?? 'unknown',
      );
      // Non-revealing: enqueued, already-verified, and not-found all land on
      // the same banner; the member sees mail only when it was really sent.
      res.redirect(303, `${taskUrlFor('legacy_claim')}?anchor_verification=sent`);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 429, err.message);
        return;
      }
      next(err);
    }
  },

  async getAnchorVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = identityAccessService.consumeAnchorMailboxVerification(
        req.user!.userId,
        req.params.token ?? '',
      );
      const flag = result.status === 'verified' ? 'verified' : 'invalid';
      res.redirect(303, `${taskUrlFor('legacy_claim')}?anchor_verification=${flag}`);
    } catch (err) {
      next(err);
    }
  },

  async postLeadershipOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const decision = req.body.decision === 'accept' ? 'accept' : 'decline';
      memberOnboardingService.resolvePathTwoLeadership(
        req.user!.userId,
        String(req.body.clubId ?? ''),
        decision,
      );
      // not_eligible collapses to the same redirect: the offer card simply
      // no longer renders.
      res.redirect(303, taskUrlFor('club_affiliations'));
    } catch (err) {
      next(err);
    }
  },

  async postLegacyClaimHelpRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      identityAccessService.submitLinkHelpRequest(req.user!.userId, {
        statement:             String(req.body.statement ?? ''),
        claimedLegacyUsername: String(req.body.claimed_legacy_username ?? ''),
        claimedLegacyEmail:    String(req.body.claimed_legacy_email ?? ''),
        vouchers:              String(req.body.vouchers ?? ''),
        isDispute:             req.body.is_dispute === '1',
      });
      res.redirect(303, `${taskUrlFor('legacy_claim')}?help_request=sent`);
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, err.message);
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 429, err.message);
        return;
      }
      next(err);
    }
  },

  async postLegacyClaimAutoLinkDecline(req: Request, res: Response, next: NextFunction): Promise<void> {
    const candidateId = String(req.body.candidateId ?? '').trim();
    await dispatch<null>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimAutoLinkDecline(req.user!.userId, candidateId),
      renderValidationError: () => {
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
          clubAffiliations: result.clubAffiliations,
          eventsAttended:   result.eventsAttended,
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

  async postPersonalDetailsSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const city = String(req.body.city ?? '');
    const region = String(req.body.region ?? '');
    const country = String(req.body.country ?? '');
    const birthDate = String(req.body.birthDate ?? '');
    const yearValue = String(req.body.year ?? '');
    const showFirstCompetitionYear =
      req.body.showFirstCompetitionYear === '1' || req.body.showFirstCompetitionYear === 'true';
    const showCompetitiveResults =
      req.body.showCompetitiveResults === '1' || req.body.showCompetitiveResults === 'true';
    await dispatch<PersonalDetailsFormState>(req, res, next, 'personal_details', {
      action: () => memberOnboardingService.processPersonalDetailsSubmit(
        req.user!.userId, city, region, country, birthDate, yearValue, showFirstCompetitionYear, showCompetitiveResults),
      renderValidationError: (result) => {
        renderPersonalDetails(req, res, {
          city: result.formState.city,
          region: result.formState.region,
          country: result.formState.country,
          birthDate: result.formState.birthDate,
          yearValue: result.formState.yearValue,
          showFirstCompetitionYear: result.formState.showFirstCompetitionYear,
          showCompetitiveResults: result.formState.showCompetitiveResults,
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

  async postAddAnchor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      identityAccessService.declareAnchor(
        req.user!.userId,
        String(req.body.anchorType ?? ''),
        String(req.body.anchorValue ?? ''),
      );
      res.redirect(303, '/register/wizard/legacy_claim');
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, err.message);
        return;
      }
      next(err);
    }
  },

  postRemoveAnchor(req: Request, res: Response, next: NextFunction): void {
    try {
      identityAccessService.removeAnchor(req.user!.userId, String(req.body.anchorId ?? ''));
      res.redirect(303, '/register/wizard/legacy_claim');
    } catch (err) {
      next(err);
    }
  },

  postStageSignal(req: Request, res: Response, next: NextFunction): void {
    const candidateId = typeof req.body.candidateId === 'string' ? req.body.candidateId : '';
    const activitySignal = typeof req.body.activitySignal === 'string' ? req.body.activitySignal : '';
    const stage = typeof req.body.stage === 'string' ? req.body.stage : '';

    if (!candidateId || !activitySignal) {
      res.redirect(303, '/register/wizard/club_affiliations');
      return;
    }
    if (stage !== 'stage2a' && stage !== 'stage2b') {
      res.redirect(303, '/register/wizard/club_affiliations');
      return;
    }
    const validSignals = new Set(['active', 'not_active', 'not_sure', 'never_heard_of_it']);
    if (!validSignals.has(activitySignal)) {
      res.redirect(303, '/register/wizard/club_affiliations');
      return;
    }
    try {
      memberOnboardingService.submitStageSignal(
        req.user!.userId,
        candidateId,
        stage,
        activitySignal as 'active' | 'not_active' | 'not_sure' | 'never_heard_of_it',
      );
      res.redirect(303, '/register/wizard/club_affiliations');
    } catch (err) {
      next(err);
    }
  },
};
