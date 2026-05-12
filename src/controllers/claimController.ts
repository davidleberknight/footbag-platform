import { Request, Response, NextFunction } from 'express';
import {
  identityAccessService,
  ClaimFormContent,
  AutoLinkConfirmContent,
  ClaimHpConfirmContent,
  ClaimConfirmContent,
  LinkHistoryContent,
} from '../services/identityAccessService';
import { findAutoLinkCandidates } from '../services/nameVariantsService';
// claimController is HTTP glue: it does not import legacyClaim prepared
// statements directly. Member + HP lookups go through service methods on
// identityAccessService (findClaimingMemberById, findHistoricalPersonForLinkSubmit).
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { simulatedEmailService } from '../services/simulatedEmailService';
import { getStubSesAdapterForTests } from '../adapters/sesAdapter';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { PageViewModel } from '../types/page';

// ClaimingMember row shape lives on identityAccessService.ClaimingMember.

const FORM_VM = {
  seo:  { title: 'Link Legacy Account' },
  page: { sectionKey: 'members', pageKey: 'claim_initiate', title: 'Link Legacy Account' },
};

const HP_FORM_VM = {
  seo:  { title: 'Claim Historical Record' },
  page: { sectionKey: 'members', pageKey: 'claim_hp_verify', title: 'Claim Historical Record' },
};

const AUTO_LINK_FORM_VM = {
  seo:  { title: 'We found a match' },
  page: { sectionKey: 'members', pageKey: 'auto_link_confirm', title: 'We found a match' },
};

// Round-2 unification deleted GET /history/claim's reason-aware messages
// (LOW_CONFIDENCE_MESSAGES) and the drift-explainer (DRIFT_MESSAGE) constants.
// The wizard's single low-confidence banner subsumes all five branches; the
// drift case collapses into low-confidence too. The standalone GET route
// is now a 301 redirect to the wizard, so getClaim is also unused.

const LINK_HISTORY_VM = {
  seo:  { title: 'Link your history' },
  page: { sectionKey: 'members', pageKey: 'link_history_wizard', title: 'Link your history' },
};

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

// Uniform render for any failed HP claim attempt, regardless of underlying
// reason (HP not found, already claimed, surname mismatch, incompatible
// legacy linkage, ...). Anti-enumeration: a single observable response
// shape across every failure mode, with the specific reason captured in
// the application log at the caller. The cancelHref echoes back the
// supplied personId so the user can return to whatever they came from
// without disclosing whether the HP exists.
function renderHpClaimUnavailable(res: Response, personId: string): void {
  res.status(200).render('history/claim-unavailable', {
    seo:  { title: 'Claim unavailable' },
    page: { sectionKey: 'members', pageKey: 'hp_claim_unavailable', title: 'Claim unavailable' },
    content: {
      cancelHref: personId
        ? `/history/${encodeURIComponent(personId)}`
        : '/members',
    },
  });
}

export const claimController = {
  /**
   * GET /members/:memberKey/link-history — unified one-section linking page.
   *
   * Owner-only: the URL is keyed on the member slug, but the auth payload's
   * userId is what drives the view-model lookup. A non-owner who guesses the
   * slug of another member is rendered a 404 to avoid leaking ownership.
   *
   * Query params:
   *   - `from=register`     : renders the dashboard skip link.
   *   - `reason=low_confidence` : renders the low-confidence preamble.
   *   - `sent=1&out=<kind>&since=<n>` : redirected back here after a manual
   *     legacy claim. Renders the sent banner inline; the simulated-email
   *     card filters to messages added after `since` so a stale match from
   *     an earlier turn never bleeds in.
   *   - `nomatch=1`         : redirected back here after a manual-id lookup
   *     that matched neither legacy_members nor historical_persons.
   *     Renders an anti-enumeration "didn't match" notice.
   */
  async getLinkHistory(req: Request, res: Response): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      // Unreachable behind requireAuth, defense-in-depth only.
      renderNotFound(res);
      return;
    }
    const fromRegister =
      String(req.query.from ?? '') === 'register';
    const reasonIsLowConfidence =
      String(req.query.reason ?? '') === 'low_confidence';
    const sentRaw = String(req.query.sent ?? '');
    const outRaw  = String(req.query.out ?? '');
    const sinceRaw = String(req.query.since ?? '');
    const sentOutcome: 'enqueued' | 'no_match' | 'target_rate_limited' | null =
      sentRaw === '1' && (outRaw === 'enqueued' || outRaw === 'no_match' || outRaw === 'target_rate_limited')
        ? outRaw
        : null;
    const sinceIndex = /^\d+$/.test(sinceRaw) ? parseInt(sinceRaw, 10) : null;
    const noMatchNotice = String(req.query.nomatch ?? '') === '1';
    // Cap echo-back at 80 chars to keep the inline notice tidy for pasted-in
    // garbage. Handlebars autoescapes; round-tripping via the query string
    // keeps the value isolated from the controller's session/auth path.
    const triedRaw = String(req.query.tried ?? '').slice(0, 80);
    const noMatchTried = noMatchNotice && triedRaw.length > 0 ? triedRaw : null;

    const data = identityAccessService.getLinkHistoryView(userId, {
      fromRegister,
      reasonIsLowConfidence,
      sentOutcome,
      sinceIndex,
      noMatchNotice,
      noMatchTried,
    });
    if (!data) {
      renderNotFound(res);
      return;
    }
    // Owner gate: the URL slug must equal the session member's slug. Other
    // members get 404 (not 403) so a casual url-poke can't enumerate
    // members by ownership of the wizard.
    if (req.params.memberKey !== data.memberSlug) {
      renderNotFound(res);
      return;
    }
    // Compose the simulated-email card view-model when the sent state is
    // active. Service stays sync; controller does the I/O. Filter to the
    // legacy claim-confirm URL prefix so a stale verify-email card from
    // earlier in the session does not bleed in.
    if (sentOutcome === 'enqueued' && sinceIndex !== null) {
      data.sentNotice.emailPreview =
        (await simulatedEmailService.getEmailPreview({
          urlPathPrefix: '/history/claim/confirm/',
          sinceIndex,
        })) ?? undefined;
    }
    res.status(200).render('members/link-history', {
      ...LINK_HISTORY_VM,
      content: data,
    } satisfies PageViewModel<LinkHistoryContent>);
  },

  /**
   * POST /members/:memberKey/link-history/find — manual-id lookup form.
   *
   * Owner-only. Accepts a single `identifier` field. Tries legacy_members
   * first (by email / username / member_id); on a single match, hands off
   * to the same `initiateLegacyClaim` service used by the legacy claim
   * form (so the email-equality fast path AND dev admin shortcut still
   * fire). On a legacy miss, tries historical_persons by person_id; on
   * match, 303-redirects to `GET /history/<personId>/claim` (the existing
   * HP review page). On both-miss, 303-redirects back to the wizard with
   * `?nomatch=1` so the anti-enumeration notice renders.
   *
   * Anti-enumeration: identical observable behavior for legacy-miss and
   * legacy-then-HP-miss; both end at the wizard with the same notice
   * (HP-match is observably different — 303 to a different URL — but
   * only fires for unclaimed HPs that the user supplied an exact id for,
   * which is the same enumeration surface as the existing
   * /history/<personId>/claim route already exposes).
   */
  async postLinkHistoryFind(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      renderNotFound(res);
      return;
    }
    const member = identityAccessService.findClaimingMemberById(userId);
    if (!member || req.params.memberKey !== member.slug) {
      renderNotFound(res);
      return;
    }
    const identifier = String(req.body.identifier ?? '').trim();
    if (!identifier) {
      res.redirect(303, `/members/${encodeURIComponent(member.slug)}/link-history?nomatch=1`);
      return;
    }
    // Capture the stub buffer length BEFORE the service call so the dev
    // simulated-email card on the wizard's sent state filters to "this turn"
    // only. Production: getStubSesAdapterForTests returns null; sinceIndex
    // is unused (the card never renders in production).
    const sinceIndex =
      config.sesAdapter === 'stub'
        ? (getStubSesAdapterForTests()?.sentMessages.length ?? 0)
        : null;

    try {
      const outcome = identityAccessService.initiateLegacyClaim(userId, identifier);
      if (outcome.kind === 'auto_linked') {
        res.redirect(303, `/members/${encodeURIComponent(member.slug)}/link-history?linked=legacy`);
        return;
      }
      if (outcome.kind === 'enqueued') {
        const sinceQ = sinceIndex !== null ? `&since=${sinceIndex}` : '';
        res.redirect(303, `/members/${encodeURIComponent(member.slug)}/link-history?sent=1&out=enqueued${sinceQ}`);
        return;
      }
      // outcome.kind === 'no_match' OR 'target_rate_limited'.
      // The legacy lookup didn't find an eligible row that could be emailed.
      // Try HP by person_id next, then HP by legacy_member_id back-link.
      // The back-link case matters in dev where legacy_members rows are
      // often stubs (only legacy_member_id populated, no legacy_email) while
      // the corresponding historical_persons row carries the full identity
      // anchor; claiming the HP transitively claims the legacy row via
      // claimHistoricalPerson's back-link merge.
      // Defer eligibility check (already-claimed, surname mismatch) to the
      // existing GET /history/<personId>/claim handler; it renders user-
      // safe messages for those cases.
      const hp = identityAccessService.findHistoricalPersonForLinkSubmit(identifier);
      if (hp) {
        res.redirect(303, `/history/${encodeURIComponent(hp.person_id)}/claim`);
        return;
      }
      // Both miss. Render the anti-enumeration notice via the wizard, with
      // the dev outcomeNote also surfaced so operators can tell legacy was
      // attempted. Echo the typed identifier back via &tried=<...> so the
      // user can confirm what the server received (helps spot typos).
      //
      // Anti-enumeration: hard-code &out=no_match regardless of outcome.kind.
      // The per-target rate limit fires only after a successful legacy lookup,
      // so &out=target_rate_limited in the URL would tell an attacker the
      // identifier matched a real unclaimed legacy account. The dev-only
      // outcomeNote on the rendered page (gated on config.sesAdapter='stub')
      // continues to surface the true outcome via in-process state.
      const sinceQ = sinceIndex !== null ? `&since=${sinceIndex}` : '';
      const triedQ = `&tried=${encodeURIComponent(identifier.slice(0, 80))}`;
      res.redirect(303, `/members/${encodeURIComponent(member.slug)}/link-history?sent=1&out=no_match${sinceQ}&nomatch=1${triedQ}`);
      return;
    } catch (err) {
      if (err instanceof RateLimitedError || err instanceof ValidationError) {
        // Treat both as a no-match render; the message is surfaced via the
        // wizard's notice (consistency with anti-enumeration). Per-member
        // RateLimitedError carries Retry-After but the redirect strips
        // headers; this is a known minor degradation for the wizard path.
        res.redirect(303, `/members/${encodeURIComponent(member.slug)}/link-history?nomatch=1&tried=${encodeURIComponent(identifier.slice(0, 80))}`);
        return;
      }
      logger.error('link-history find error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * POST /history/auto-link/confirm — one-turn classifier-trusted commit
   * path for the Tier 1 / Tier 2 auto-link "Yes" button. Re-validates the
   * classification at commit time (defense in depth against stale GET
   * state), then delegates to the existing transactional
   * identityAccessService.claimHistoricalPerson.
   *
   * Does NOT re-run the surname-reconciliation / duplicate-claim checks
   * itself — those live inside claimHistoricalPerson. The four-anchor
   * classifier already guarantees them for Tier 1 / Tier 2, so there is
   * no need for the two-click bounce through GET /history/:personId/claim
   * that the manual HP-claim flow uses.
   *
   * Fallback contract matches GET /history/auto-link:
   *   - classification no longer high/medium    → 302 /history/claim
   *   - classification 'none'                  → 302 /members/:slug
   *   - submitted personId ≠ classifier's     → 302 /history/claim (drift)
   *   - ValidationError from commit           → 422 re-render with error
   */
  postAutoLinkConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const userId   = req.user!.userId;
      const slug     = req.user!.slug;
      const personId = String(req.body.personId ?? '').trim();

      if (!personId) {
        res.status(422).render('history/auto-link-confirm', {
          ...AUTO_LINK_FORM_VM,
          content: {
            error:       'Invalid claim request.',
            declineHref: '/members',
          },
        } satisfies PageViewModel<AutoLinkConfirmContent>);
        return;
      }

      const classification = identityAccessService.getAutoLinkClassificationForMember(userId);

      // Body-level drift carrier: the form submitted from the auto-link
      // confirm page may have come via a registration redirect. Preserve
      // ?from=register so the destination still shows the skip affordance.
      const fromRegister = String(req.body.from ?? req.query.from ?? '') === 'register';
      const fromQs = fromRegister ? 'from=register&' : '';
      const wizardBase = `/members/${encodeURIComponent(slug)}/link-history`;

      if (classification.confidence === 'low') {
        // Classification drifted between GET render and POST commit. Send
        // the user back to the unified wizard with the low-confidence banner
        // (drift collapses into low-confidence — both signal "we couldn't
        // confirm").
        res.redirect(`${wizardBase}?${fromQs}reason=low_confidence`);
        return;
      }
      if (classification.confidence === 'none') {
        // Classification no longer applicable (e.g. linkage already
        // present). Land on the wizard so the new linked badge is visible.
        res.redirect(wizardBase);
        return;
      }
      // Drift: GET saw one candidate, POST sees another. Same wizard
      // destination with the low-confidence banner.
      if (classification.personId !== personId) {
        res.redirect(`${wizardBase}?${fromQs}reason=low_confidence`);
        return;
      }

      try {
        identityAccessService.claimHistoricalPerson(userId, personId);
        // Successful HP claim — land on the wizard so the user sees the
        // newly-linked badge and the clubs-coming-soon placeholder. Also
        // discoverable via the wizard's "Back to dashboard" footer.
        res.redirect(wizardBase);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(422).render('history/auto-link-confirm', {
            ...AUTO_LINK_FORM_VM,
            content: {
              personId:    classification.personId,
              personName:  classification.personName,
              confidence:  classification.confidence,
              error:       err.message,
              declineHref: '/members',
            },
          } satisfies PageViewModel<AutoLinkConfirmContent>);
          return;
        }
        throw err;
      }
    } catch (err) {
      logger.error('auto-link confirm commit error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * GET /history/:personId/claim, render the HP-claim confirmation page
   * (scenarios D and E). No separate lookup form, the viewer arrived here
   * from the historical-record detail page's "Claim this identity" CTA.
   */
  getClaimHp(req: Request, res: Response, next: NextFunction): void {
    const personId = req.params.personId ?? '';
    try {
      const result = identityAccessService.lookupHistoricalPersonForClaim(req.user!.userId, personId);
      if (!result) {
        // HP not found (or requesting member not found). Render the uniform
        // claim-unavailable page rather than redirecting to /history/:personId
        // (which would 404 for a non-existent HP and distinguish the case
        // from the ValidationError branch below — enumeration leak).
        logger.info('hp claim unavailable: lookup returned null', {
          personId,
          memberId: req.user!.userId,
        });
        renderHpClaimUnavailable(res, personId);
        return;
      }
      res.render('history/claim-hp-confirm', {
        ...HP_FORM_VM,
        content: {
          personId:         result.personId,
          personName:       result.personName,
          country:          result.country,
          isHof:            result.isHof,
          isBap:            result.isBap,
          firstNameWarning: result.firstNameWarning,
          cancelHref:       `/history/${encodeURIComponent(result.personId)}`,
        },
      } satisfies PageViewModel<ClaimHpConfirmContent>);
    } catch (err) {
      if (err instanceof ValidationError) {
        // Render the same uniform claim-unavailable page as the null-return
        // branch above. The specific ValidationError message (already-claimed,
        // surname mismatch, incompatible legacy account, etc.) would let an
        // attacker enumerate HP claim-status; collapse to a single response
        // shape and log the specific reason for operator forensics.
        logger.info('hp claim unavailable: ValidationError', {
          personId,
          memberId: req.user!.userId,
          reason: err.message,
        });
        renderHpClaimUnavailable(res, personId);
        return;
      }
      logger.error('hp claim lookup error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * POST /history/:personId/claim/confirm, execute the HP claim.
   */
  postClaimHpConfirm(req: Request, res: Response, next: NextFunction): void {
    const personId = req.params.personId ?? '';
    if (!personId) {
      res.status(422).render('history/claim-hp-confirm', {
        ...HP_FORM_VM,
        content: { error: 'Invalid claim request.', cancelHref: '/members' },
      } satisfies PageViewModel<ClaimHpConfirmContent>);
      return;
    }
    try {
      identityAccessService.claimHistoricalPerson(req.user!.userId, personId);
      res.redirect(`/members/${req.user!.slug}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('history/claim-hp-confirm', {
          ...HP_FORM_VM,
          content: {
            personId,
            error: err.message,
            cancelHref: `/history/${encodeURIComponent(personId)}`,
          },
        } satisfies PageViewModel<ClaimHpConfirmContent>);
        return;
      }
      logger.error('hp claim error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * POST /history/claim — step 1 of the two-step token flow.
   *
   * Calls identityAccessService.initiateLegacyClaim which performs the
   * lookup + token issue + email enqueue. Always renders the same
   * non-revealing "if a record was found, a link has been sent" response
   * regardless of match outcome; the only explicit error paths are empty /
   * whitespace-only identifiers and rate-limit overruns.
   *
   * Skip-affordance and low-confidence banner state are preserved across
   * the success / 422 / 429 renders by re-deriving them from the request's
   * query string and the requesting member's slug. This keeps the
   * registration-time UX (where the user arrived via `?from=register`)
   * coherent: the "Skip and complete this later" link stays visible on the
   * sent-state banner, and the low-confidence banner remains visible if
   * the form was reached via the auto-link redirect.
   */
  async postClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
    const identifier = req.body.identifier ?? '';
    // requireAuth guarantees req.user is present at this point; the
    // non-null assertion is consistent with the other accesses below.
    const userId = req.user!.userId;
    const member = identityAccessService.findClaimingMemberById(userId) ?? undefined;
    // The hidden `from` field on the form preserves the registration-context
    // flag through the POST; query-param fallback handles the case where the
    // user lands on the action URL directly.
    const fromRaw = String(req.body.from ?? req.query.from ?? '');
    const fromRegister = fromRaw === 'register';
    const fromLinkWizard = fromRaw === 'link-wizard';
    const skipHref = fromRegister && member?.slug
      ? `/members/${encodeURIComponent(member.slug)}`
      : undefined;
    const lowConfidenceBanner =
      fromRegister ||
      String(req.query.reason ?? '') === 'low_confidence';

    try {
      // Capture the stub buffer length BEFORE the service call so the dev
      // simulated-email card filters to "this turn" only — a prior turn's
      // matching message must not bleed into a current silent-no-op render.
      const sinceIndex =
        config.sesAdapter === 'stub'
          ? (getStubSesAdapterForTests()?.sentMessages.length ?? 0)
          : undefined;

      const outcome = identityAccessService.initiateLegacyClaim(req.user!.userId, identifier);

      // Email-equality fast path (or dev admin shortcut): the merge ran
      // synchronously, no second confirmation email was sent. Land the user
      // on the wizard (when this POST came from the wizard) or the dashboard
      // (direct visit to /history/claim).
      if (outcome.kind === 'auto_linked') {
        const slug = member?.slug;
        if (slug) {
          if (fromLinkWizard) {
            res.redirect(303, `/members/${encodeURIComponent(slug)}/link-history?linked=legacy`);
          } else {
            res.redirect(303, `/members/${encodeURIComponent(slug)}`);
          }
          return;
        }
        // Defensive fallback: a member without a slug should not reach this
        // branch (slug is set at registration), but if the lookup somehow
        // returned undefined we fall through to the generic sent-state render
        // rather than a 500 — the user's account is already linked.
      }

      // Stay-on-wizard for non-auto_linked outcomes when the POST came from
      // the wizard's Section A form. 303-redirect back so the wizard's GET
      // handler renders the sent state inline (with the simulated-email card
      // and outcomeNote).
      if (fromLinkWizard && member?.slug) {
        const sinceQ = sinceIndex !== undefined ? `&since=${sinceIndex}` : '';
        res.redirect(
          303,
          `/members/${encodeURIComponent(member.slug)}/link-history?sent=1&out=${outcome.kind}${sinceQ}`,
        );
        return;
      }

      // Render the simulated-email card on the sent state so dev and staging
      // sandbox can complete the click-to-confirm flow without leaving the
      // page. Production returns null and the card is suppressed. Filtered
      // to claim-confirm URLs so a stale verify-email card from earlier in
      // the session doesn't confuse the user.
      const emailPreview =
        (await simulatedEmailService.getEmailPreview({
          urlPathPrefix: '/history/claim/confirm/',
          sinceIndex,
        })) ?? undefined;
      // Dev-only operator note: when no email was actually enqueued (anti-
      // enumeration silent paths), surface the reason on the simulated-email
      // card so the operator can distinguish "no match" from "rate-limited"
      // from "real send". The public banner above stays generic so production
      // users cannot tell which branch fired.
      const outcomeNote =
        config.sesAdapter === 'stub' && outcome.kind === 'no_match'
          ? "No confirmation email was sent for this attempt. The identifier may not match an eligible legacy record. (Production users see the same banner regardless — anti-enumeration.)"
          : config.sesAdapter === 'stub' && outcome.kind === 'target_rate_limited'
          ? "No confirmation email was sent for this attempt. The legacy mailbox has hit its hourly send cap. (Production users see the same banner regardless — anti-enumeration.)"
          : undefined;
      res.status(200).render('history/claim-form', {
        ...FORM_VM,
        content: { sent: true, skipHref, lowConfidenceBanner, emailPreview, outcomeNote },
      } satisfies PageViewModel<ClaimFormContent>);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        res.status(429).render('history/claim-form', {
          ...FORM_VM,
          content: { error: err.message, identifier, skipHref, lowConfidenceBanner },
        } satisfies PageViewModel<ClaimFormContent>);
        return;
      }
      if (err instanceof ValidationError) {
        res.status(422).render('history/claim-form', {
          ...FORM_VM,
          content: { error: err.message, identifier, skipHref, lowConfidenceBanner },
        } satisfies PageViewModel<ClaimFormContent>);
        return;
      }
      logger.error('claim lookup error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * GET /history/claim/confirm/:token — step 2a of the two-step token flow.
   *
   * Validates the token without consuming it (so the user can review the
   * matched record before committing). Renders the confirm page on success;
   * renders a generic "link no longer valid" error otherwise.
   */
  getClaimToken(req: Request, res: Response, next: NextFunction): void {
    const token = req.params.token ?? '';
    try {
      const result = identityAccessService.peekLegacyClaim(req.user!.userId, token);
      if (!result) {
        res.status(400).render('history/claim-form', {
          ...FORM_VM,
          content: { error: 'This claim link is no longer valid. Please start the claim again.' },
        } satisfies PageViewModel<ClaimFormContent>);
        return;
      }
      res.render('history/claim-confirm', {
        seo:  { title: 'Confirm Legacy Account Link' },
        page: { sectionKey: 'members', pageKey: 'claim_verify', title: 'Confirm Legacy Account Link' },
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
      logger.error('claim token peek error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * POST /history/claim/confirm — step 2b of the two-step token flow.
   * Consumes the token and runs the merge atomically.
   *
   * CSRF posture: the raw token rides in the form body (hidden input) rather
   * than the URL on this POST. That widens token exposure beyond the
   * email-link-only shape (any same-origin DOM access would see it). The
   * shape is acceptable here because:
   *   1. SameSite=Lax cookies prevent cross-site form submission, so a
   *      foreign origin cannot re-submit a stolen token within an active
   *      session.
   *   2. No template currently emits user-controlled values via the
   *      triple-stash {{{...}}} escape, so there is no XSS path to read
   *      the input's value attribute.
   *   3. Any future XSS that would defeat (2) would already have access
   *      to the session cookie itself, so token-in-DOM is not the
   *      load-bearing escalation path.
   * The atomicity contract (consume + merge in one transaction) lives in
   * identityAccessService.consumeAndClaimLegacy — a failed merge un-consumes
   * the token via rollback, so the user can retry the same email link.
   */
  postClaimConfirm(req: Request, res: Response, next: NextFunction): void {
    const token = req.body.token ?? '';

    if (!token) {
      res.status(422).render('history/claim-form', {
        ...FORM_VM,
        content: { error: 'Invalid claim request.' },
      } satisfies PageViewModel<ClaimFormContent>);
      return;
    }

    try {
      identityAccessService.consumeAndClaimLegacy(req.user!.userId, token);
      res.redirect(`/members/${req.user!.slug}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('history/claim-form', {
          ...FORM_VM,
          content: { error: err.message },
        } satisfies PageViewModel<ClaimFormContent>);
        return;
      }
      logger.error('claim merge error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },
};
