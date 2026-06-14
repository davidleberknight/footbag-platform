import { Request, Response, NextFunction } from 'express';
import { createSessionJwt } from '../services/jwtService';
import { clearSessionCookie, issueSessionCookie } from '../lib/sessionCookie';
import {
  identityAccessService,
  LoginContent,
  RegisterContent,
  CheckEmailContent,
  VerifyResultContent,
  PasswordForgotContent,
  PasswordForgotSentContent,
  PasswordResetContent,
} from '../services/identityAccessService';
import { RateLimitedError, ServiceUnavailableError, ValidationError } from '../services/serviceErrors';
import { renderServiceUnavailable } from '../lib/controllerErrors';
import { simulatedEmailService, type SimulatedEmailPreview } from '../services/simulatedEmailService';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { memberOnboardingService } from '../services/memberOnboardingService';
import { isSafePath } from '../lib/safePath';
import { getCaptchaAdapter } from '../adapters/captchaAdapter';

// Shown when the Turnstile challenge fails. Kept generic and identical across
// every gated surface so a failed challenge reveals nothing about whether an
// account exists (anti-enumeration). The stub adapter on dev and staging passes
// every real token, so this never appears there.
const CAPTCHA_FAILED_MESSAGE = 'Please complete the verification challenge and try again.';

function getLogin(req: Request, res: Response): void {
  if (req.isAuthenticated) {
    res.redirect(303, `/members/${req.user!.slug}`);
    return;
  }
  const returnTo = isSafePath(req.query.returnTo) ? req.query.returnTo : undefined;
  res.render('auth/login', {
    seo: { title: 'Login' },
    page: { sectionKey: '', pageKey: 'login', title: 'Member Login', intro: 'Sign in to your IFPA member account.' },
    content: {
      returnTo,
      authReason: returnTo ? 'The content you are trying to reach requires an IFPA Member account.' : undefined,
      turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub',
    },
  } satisfies PageViewModel<LoginContent>);
}

async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { email, password, returnTo } = req.body as { email?: string; password?: string; returnTo?: string };

  const renderError = (msg: string, status = 200) => {
    res.status(status).render('auth/login', {
      seo: { title: 'Login' },
      page: { sectionKey: '', pageKey: 'login', title: 'Member Login', intro: 'Sign in to your IFPA member account.' },
      content: {
        error: msg,
        returnTo: isSafePath(returnTo) ? returnTo : undefined,
        turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub',
      },
    } satisfies PageViewModel<LoginContent>);
  };

  const captcha = await getCaptchaAdapter().verify(String(req.body['cf-turnstile-response'] ?? ''), req.ip);
  if (!captcha.ok) {
    renderError(CAPTCHA_FAILED_MESSAGE, 422);
    return;
  }

  const ip = req.ip ?? 'unknown';

  try {
    const member = await identityAccessService.attemptLogin(email ?? '', password ?? '', ip);

    if (member !== null) {
      const role = member.is_admin ? 'admin' : 'member';
      const memberSlug = member.slug ?? member.id;
      const cookieValue = await createSessionJwt(member.id, role, member.password_version);
      issueSessionCookie(res, cookieValue, req);
      // Structured success line: the cutover zero-logins alarm counts these
      // via a CloudWatch metric filter (no PII beyond the member id).
      logger.info('auth.login_success', { memberId: member.id });
      res.redirect(303, isSafePath(returnTo) ? returnTo : `/members/${memberSlug}`);
      return;
    }

    renderError('Invalid email or password. Please try again.');
  } catch (err) {
    if (err instanceof RateLimitedError) {
      if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      renderError(err.message, 429);
      return;
    }
    next(err);
  }
}

function getRegister(req: Request, res: Response): void {
  if (req.isAuthenticated) {
    res.redirect(303, `/members/${req.user!.slug}`);
    return;
  }
  res.render('auth/register', {
    seo: { title: 'Register' },
    page: { sectionKey: '', pageKey: 'register', title: 'Register to create an IFPA member account.' },
    content: { turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
  } satisfies PageViewModel<RegisterContent>);
}

async function postRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { realName, displayName, slug, email, password, confirmPassword } = req.body as {
    realName?: string; displayName?: string; slug?: string; email?: string; password?: string; confirmPassword?: string;
  };

  const renderError = (msg: string, status = 422) => {
    res.status(status).render('auth/register', {
      seo: { title: 'Register' },
      page: { sectionKey: '', pageKey: 'register', title: 'Register to create an IFPA member account.' },
      content: {
        error: msg,
        realName: realName ?? '',
        displayName: displayName ?? '',
        slug: slug ?? '',
        email: email ?? '',
        turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub',
      },
    } satisfies PageViewModel<RegisterContent>);
  };

  const captcha = await getCaptchaAdapter().verify(String(req.body['cf-turnstile-response'] ?? ''), req.ip);
  if (!captcha.ok) {
    renderError(CAPTCHA_FAILED_MESSAGE);
    return;
  }

  try {
    await identityAccessService.registerMember(
      email ?? '',
      password ?? '',
      confirmPassword ?? '',
      realName ?? '',
      displayName ?? '',
      req.ip ?? 'unknown',
      slug ?? '',
    );
    // No session cookie is set; the member must verify via email first.
    // Stub-only: carry the recipient across the redirect so the dev card on
    // /register/check-email scopes to this user's verify token, not everyone's.
    if (config.sesAdapter === 'stub') {
      writeFlash(res, req, FLASH_KIND.VERIFY_EMAIL_PENDING, (email ?? '').toLowerCase().trim());
    }
    res.redirect(303, '/register/check-email');
  } catch (err) {
    if (err instanceof ValidationError) {
      renderError(err.message);
      return;
    }
    if (err instanceof RateLimitedError) {
      if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      renderError(err.message, 429);
      return;
    }
    if (err instanceof ServiceUnavailableError) {
      // Verify-email enqueue failed AFTER the member row committed (per
      // identityAccessService.issueAndEnqueueVerifyEmail's enqueueEmailOrFail
      // call). The member can self-recover via /verify/resend once outbox
      // / SES is healthy; the audit row in identityAccessService records
      // the failure for operator triage.
      renderServiceUnavailable(res);
      return;
    }
    next(err);
  }
}

async function getCheckEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // The stub-SES branch can render a live verify-token link, so a shared
    // proxy must never cache this page against one visitor and serve it to
    // the next.
    setNoStore(res);
    // Scope the dev card to the just-registered recipient, carried in a signed
    // flash across the 303. A visitor WITHOUT the flash (direct navigation, or
    // another user's browser) gets an empty card so the dev card can never
    // surface another pending user's verify token. In live mode the service
    // returns null and no card renders at all.
    const flash = readFlash(req);
    let recipientEmail: string | undefined;
    if (flash?.kind === FLASH_KIND.VERIFY_EMAIL_PENDING) {
      recipientEmail = flash.payload ?? undefined;
      clearFlash(res, req);
    }
    // Filter to verify-email URLs only so a stale verify card from a prior
    // session doesn't bleed into a fresh registration's check-email page.
    let emailPreview: SimulatedEmailPreview | undefined;
    if (recipientEmail) {
      emailPreview =
        (await simulatedEmailService.getEmailPreview({ urlPathPrefix: '/verify/', recipientEmail })) ?? undefined;
    } else if (config.sesAdapter === 'stub') {
      emailPreview = { mode: 'dev', messages: [] };
    }
    res.render('auth/check-email', {
      seo: { title: 'Check Your Email' },
      page: { sectionKey: '', pageKey: 'check_email', title: 'Check your email' },
      content: { emailPreview, turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
    } satisfies PageViewModel<CheckEmailContent>);
  } catch (err) {
    next(err);
  }
}

async function getVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.params.token ?? '';
  try {
    const result = await identityAccessService.verifyEmailByToken(token);
    if (!result) {
      // The token is in the URL, so a shared proxy must not cache this
      // render against the token-bearing address.
      setNoStore(res);
      res.status(400).render('auth/verify-result', {
        seo: { title: 'Verification' },
        page: { sectionKey: '', pageKey: 'verify_result', title: 'Verification' },
        content: { ok: false },
      } satisfies PageViewModel<VerifyResultContent>);
      return;
    }
    const role = result.isAdmin ? 'admin' : 'member';
    // Failure mode (KMS Sign error, IAM regression, KMS key rotation
    // mid-flight): verification already committed (token consumed, member
    // marked verified). Letting the signing error fall through to the 500
    // handler would block the new member from logging in despite a working
    // password and a verified email. Render a 503 that surfaces the
    // sign-in path; the member's registration password is still valid.
    let cookieValue: string;
    try {
      cookieValue = await createSessionJwt(result.memberId, role, result.passwordVersion);
    } catch (jwtErr) {
      logger.error('email verify: session issue failed after token consumed and verification commit', {
        memberId: result.memberId,
        error: jwtErr instanceof Error ? jwtErr.message : String(jwtErr),
      });
      setNoStore(res);
      res.status(503).render('auth/verify-result', {
        seo: { title: 'Verification' },
        page: { sectionKey: '', pageKey: 'verify_result', title: 'Verification' },
        content: { ok: false, signInPrompt: true },
      } satisfies PageViewModel<VerifyResultContent>);
      return;
    }
    issueSessionCookie(res, cookieValue, req);
    memberOnboardingService.startTaskList(result.memberId);
    res.redirect(303, '/register/wizard/legacy_claim');
  } catch (err) {
    next(err);
  }
}

async function postVerifyResend(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { email } = req.body as { email?: string };

  const captcha = await getCaptchaAdapter().verify(String(req.body['cf-turnstile-response'] ?? ''), req.ip);
  if (!captcha.ok) {
    res.status(422).render('auth/check-email', {
      seo: { title: 'Check Your Email' },
      page: { sectionKey: '', pageKey: 'check_email', title: 'Check your email' },
      content: { error: CAPTCHA_FAILED_MESSAGE, turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
    } satisfies PageViewModel<CheckEmailContent>);
    return;
  }

  // Service rate-limits internally and no-ops when the bucket is exceeded or
  // no unverified member matches; response is identical either way for
  // anti-enumeration.
  try {
    await identityAccessService.resendVerifyEmail(email ?? '');
    // The resend dev card is always empty in stub mode. Reflecting whether mail
    // was actually sent would leak account existence (the response must be
    // byte-identical for unverified/verified/unknown — anti-enumeration), and
    // showing the captured buffer would leak other pending users' verify tokens
    // (B43). The just-registered user retrieves their own link from the
    // flash-scoped /register/check-email page. Live mode renders no card.
    const emailPreview: SimulatedEmailPreview | undefined =
      config.sesAdapter === 'stub' ? { mode: 'dev', messages: [] } : undefined;
    res.render('auth/check-email', {
      seo: { title: 'Check Your Email' },
      page: { sectionKey: '', pageKey: 'check_email', title: 'Check your email' },
      content: { resent: true, emailPreview, turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
    } satisfies PageViewModel<CheckEmailContent>);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      // Defense-in-depth for any ServiceUnavailableError surfacing from
      // resendVerifyEmail's config/DB reads. Verify-email token issuance and enqueue
      // failures are audited (auth.register_notification_failed) and swallowed inside
      // resendVerifyEmail to preserve anti-enumeration, so they never reach here.
      renderServiceUnavailable(res);
      return;
    }
    next(err);
    return;
  }
}

// GET /logout: render a tiny page that immediately POSTs the logout, so that
// bookmarks, accidental address-bar typing, or any link that hits /logout
// via GET still logs the user out instead of 404-ing. The page never appears
// to a user under normal use; it auto-submits on load.
function getLogout(_req: Request, res: Response): void {
  res.status(200).render('auth/logout-bridge', {
    seo:  { title: 'Logging out' },
    page: { sectionKey: 'account', pageKey: 'logout_bridge', title: 'Logging out' },
    content: {},
  });
}

function postLogout(req: Request, res: Response): void {
  clearSessionCookie(res, req);
  writeFlash(res, req, FLASH_KIND.LOGOUT);
  const referer = req.get('Referer');
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (isSafePath(parsed.pathname)) {
        res.redirect(303, parsed.pathname);
        return;
      }
    } catch { /* ignore malformed Referer */ }
  }
  res.redirect(303, '/');
}

function getPasswordForgot(_req: Request, res: Response): void {
  res.render('auth/password-forgot', {
    seo: { title: 'Reset Your Password' },
    page: { sectionKey: '', pageKey: 'password_forgot', title: 'Reset your password' },
    content: {},
  } satisfies PageViewModel<PasswordForgotContent>);
}

async function postPasswordForgot(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { email } = req.body as { email?: string };
  try {
    await identityAccessService.requestPasswordReset(email ?? '');
    // Simulated email card on dev and staging (stub adapter) so the operator can complete the
    // reset flow without leaving the page; null in production. Filtered to
    // password-reset URLs so a stale verify-email card from earlier in the
    // session doesn't confuse the operator.
    const emailPreview =
      (await simulatedEmailService.getEmailPreview({ urlPathPrefix: '/password/reset/' })) ?? undefined;
    res.render('auth/password-forgot-sent', {
      seo: { title: 'Reset Your Password' },
      page: { sectionKey: '', pageKey: 'password_forgot_sent', title: 'Reset your password' },
      content: { emailPreview },
    } satisfies PageViewModel<PasswordForgotSentContent>);
  } catch (err) {
    next(err);
  }
}

function setNoStore(res: Response): void {
  // Token-bearing pages must not be cached by browsers or shared proxies.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
}

function getPasswordReset(req: Request, res: Response): void {
  setNoStore(res);
  res.render('auth/password-reset', {
    seo: { title: 'Set a New Password' },
    page: { sectionKey: '', pageKey: 'password_reset', title: 'Set a new password' },
    content: { token: req.params.token, turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
  } satisfies PageViewModel<PasswordResetContent>);
}

async function postPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { newPassword, confirmPassword } = req.body as {
    newPassword?: string; confirmPassword?: string;
  };
  const token = req.params.token;

  const captcha = await getCaptchaAdapter().verify(String(req.body['cf-turnstile-response'] ?? ''), req.ip);
  if (!captcha.ok) {
    setNoStore(res);
    res.status(422).render('auth/password-reset', {
      seo: { title: 'Set a New Password' },
      page: { sectionKey: '', pageKey: 'password_reset', title: 'Set a new password' },
      content: { token, error: CAPTCHA_FAILED_MESSAGE, turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
    } satisfies PageViewModel<PasswordResetContent>);
    return;
  }

  try {
    const result = await identityAccessService.completePasswordReset(
      token,
      newPassword ?? '',
      confirmPassword ?? '',
    );
    // Failure mode (KMS Sign error, IAM regression, KMS key rotation
    // mid-flight): the reset already committed (password_version bumped,
    // single-use token consumed). All prior sessions are invalid by the
    // per-request password_version check. Letting the signing error fall
    // through to the 500 handler would lock the member out with no recovery
    // path visible. Render a 503 with an actionable message — the new
    // password is already active, so the recovery path is the login page,
    // not another forgot-password round trip.
    let cookieValue: string;
    try {
      cookieValue = await createSessionJwt(result.memberId, result.role, result.newPasswordVersion);
    } catch (jwtErr) {
      logger.error('password reset: session issue failed after token consumed and password_version commit', {
        memberId: result.memberId,
        error: jwtErr instanceof Error ? jwtErr.message : String(jwtErr),
      });
      setNoStore(res);
      res.status(503).render('auth/password-reset', {
        seo: { title: 'Set a New Password' },
        page: { sectionKey: '', pageKey: 'password_reset', title: 'Set a new password' },
        content: {
          token: undefined,
          error:
            'Your password was reset, but we could not sign you in. ' +
            'Please go to the login page and sign in with your new password.',
        },
      } satisfies PageViewModel<PasswordResetContent>);
      return;
    }
    issueSessionCookie(res, cookieValue, req);
    // Redirect to the member's own profile to match the login and verify flows.
    res.redirect(303, `/members/${encodeURIComponent(result.slug)}`);
  } catch (err) {
    if (err instanceof ValidationError) {
      setNoStore(res);
      res.status(422).render('auth/password-reset', {
        seo: { title: 'Set a New Password' },
        page: { sectionKey: '', pageKey: 'password_reset', title: 'Set a new password' },
        content: { token, error: err.message, turnstileSiteKey: config.turnstileSiteKey, captchaStubbed: config.captchaAdapter === 'stub' },
      } satisfies PageViewModel<PasswordResetContent>);
      return;
    }
    next(err);
  }
}

export const authController = {
  getLogin,
  postLogin,
  getRegister,
  postRegister,
  getCheckEmail,
  getVerify,
  postVerifyResend,
  getPasswordForgot,
  postPasswordForgot,
  getPasswordReset,
  postPasswordReset,
  postLogout,
  getLogout,
};
