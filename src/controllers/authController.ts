import { Request, Response, NextFunction } from 'express';
import { SESSION_COOKIE_NAME } from '../middleware/auth';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
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
import { simulatedEmailService } from '../services/simulatedEmailService';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';
import { logger } from '../config/logger';

function isSafePath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

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
    },
  } satisfies PageViewModel<LoginContent>);
}

async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { email, password, returnTo } = req.body as { email?: string; password?: string; returnTo?: string };

  const renderError = (msg: string, status = 200) => {
    res.status(status).render('auth/login', {
      seo: { title: 'Login' },
      page: { sectionKey: '', pageKey: 'login', title: 'Member Login', intro: 'Sign in to your IFPA member account.' },
      content: { error: msg, returnTo: isSafePath(returnTo) ? returnTo : undefined },
    } satisfies PageViewModel<LoginContent>);
  };

  const ip = req.ip ?? 'unknown';

  try {
    const member = await identityAccessService.attemptLogin(email ?? '', password ?? '', ip);

    if (member !== null) {
      const role = member.is_admin ? 'admin' : 'member';
      const memberSlug = member.slug ?? member.id;
      const cookieValue = await createSessionJwt(member.id, role, member.password_version);
      issueSessionCookie(res, cookieValue, req);
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
    content: {},
  } satisfies PageViewModel<RegisterContent>);
}

async function postRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { realName, displayName, email, password, confirmPassword } = req.body as {
    realName?: string; displayName?: string; email?: string; password?: string; confirmPassword?: string;
  };

  const renderError = (msg: string) => {
    res.status(422).render('auth/register', {
      seo: { title: 'Register' },
      page: { sectionKey: '', pageKey: 'register', title: 'Register to create an IFPA member account.' },
      content: {
        error: msg,
        realName: realName ?? '',
        displayName: displayName ?? '',
        email: email ?? '',
      },
    } satisfies PageViewModel<RegisterContent>);
  };

  try {
    await identityAccessService.registerMember(
      email ?? '',
      password ?? '',
      confirmPassword ?? '',
      realName ?? '',
      displayName ?? '',
    );
    // Both 'registered' and 'silent_duplicate' land here; the check-email
    // page is identical regardless, preventing account enumeration.
    // No session cookie is set.
    res.redirect(303, '/register/check-email');
  } catch (err) {
    if (err instanceof ValidationError) {
      renderError(err.message);
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

async function getCheckEmail(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Filter to verify-email URLs only so a stale verify card from a prior
    // session doesn't bleed into a fresh registration's check-email page.
    const emailPreview =
      (await simulatedEmailService.getEmailPreview({ urlPathPrefix: '/verify/' })) ?? undefined;
    res.render('auth/check-email', {
      seo: { title: 'Check Your Email' },
      page: { sectionKey: '', pageKey: 'check_email', title: 'Check your email' },
      content: { emailPreview },
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
      res.status(503).render('auth/verify-result', {
        seo: { title: 'Verification' },
        page: { sectionKey: '', pageKey: 'verify_result', title: 'Verification' },
        content: { ok: false, signInPrompt: true },
      } satisfies PageViewModel<VerifyResultContent>);
      return;
    }
    issueSessionCookie(res, cookieValue, req);
    // Land newly-verified members on the onboarding wizard's first task. The
    // wizard renders the same candidate list and manual-id input regardless
    // of classifier confidence; the auto_link_confirm card is included in
    // the candidate list when the classifier returned high/medium, and the
    // low-confidence banner is rendered server-side when applicable.
    res.redirect(303, '/register/wizard/legacy_claim');
  } catch (err) {
    next(err);
  }
}

async function postVerifyResend(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { email } = req.body as { email?: string };
  // Service rate-limits internally and no-ops when the bucket is exceeded or
  // no unverified member matches; response is identical either way for
  // anti-enumeration.
  try {
    await identityAccessService.resendVerifyEmail(email ?? '');
  } catch (err) {
    next(err);
    return;
  }
  const emailPreview =
    (await simulatedEmailService.getEmailPreview({ urlPathPrefix: '/verify/' })) ?? undefined;
  res.render('auth/check-email', {
    seo: { title: 'Check Your Email' },
    page: { sectionKey: '', pageKey: 'check_email', title: 'Check your email' },
    content: { resent: true, emailPreview },
  } satisfies PageViewModel<CheckEmailContent>);
}

function postLogout(req: Request, res: Response): void {
  // Match the attributes used when the cookie was set so RFC 6265-strict
  // browsers (and proxies that enforce attribute parity on clear) honor
  // the clear. Without secure/sameSite matching the set, some clients
  // silently ignore the clear and the cookie persists until natural expiry.
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
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

/**
 * GET /auto-link/report-incorrect/:token
 *
 * Tokened revert path consumed by the report-incorrect link in the silent-
 * claim notification email. Returns a uniform 200 result page for
 * `reverted`, `already_reverted`, and `not_found` outcomes so the URL
 * cannot be used to probe which claim audit ids exist. The status
 * discriminator carries through only for dev/test observation; the
 * template renders the same generic copy regardless.
 */
interface AutoLinkReportIncorrectResultContent {
  ok: boolean;
}

function getReportIncorrectLink(req: Request, res: Response, next: NextFunction): void {
  const token = req.params.token ?? '';
  try {
    const result = identityAccessService.revertAutoLinkByToken(token);
    res.status(200).render('auth/auto-link-report-incorrect-result', {
      seo:  { title: 'Auto-link revert' },
      page: { sectionKey: '', pageKey: 'auto_link_report_incorrect', title: 'Thank you for reporting this' },
      content: { ok: result.status === 'reverted' },
    } satisfies PageViewModel<AutoLinkReportIncorrectResultContent>);
  } catch (err) {
    next(err);
  }
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
    // Simulated email card on dev / sandbox so the operator can complete the
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
    content: { token: req.params.token },
  } satisfies PageViewModel<PasswordResetContent>);
}

async function postPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { newPassword, confirmPassword } = req.body as {
    newPassword?: string; confirmPassword?: string;
  };
  const token = req.params.token;
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
        content: { token, error: err.message },
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
  getReportIncorrectLink,
};
