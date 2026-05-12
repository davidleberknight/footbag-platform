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
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { simulatedEmailService } from '../services/simulatedEmailService';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';

function isSafePath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function getLogin(req: Request, res: Response): void {
  if (req.isAuthenticated) {
    res.redirect(`/members/${req.user!.slug}`);
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
      res.redirect(isSafePath(returnTo) ? returnTo : `/members/${memberSlug}`);
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
    res.redirect(`/members/${req.user!.slug}`);
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
    res.redirect('/register/check-email');
  } catch (err) {
    if (err instanceof ValidationError) {
      renderError(err.message);
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
    const cookieValue = await createSessionJwt(result.memberId, role, result.passwordVersion);
    issueSessionCookie(res, cookieValue, req);
    const confidence = result.autoLinkClassification.confidence;
    // `?from=register` flags the destination page to render a "Skip and
    // complete this later" affordance pointing back at the member's dashboard,
    // so a registrant who doesn't want to engage the claim flow during signup
    // is not forced through the detour.
    // All three classifier branches land at the unified link-history wizard
    // ("one place to link" — round-2 maintainer decision). High/medium
    // confidence renders an auto_link_confirm "This is me" card at the top
    // of the wizard; low confidence renders the low-confidence banner +
    // candidates; no-match renders the empty candidate list + manual-id
    // input. The wizard's "Back to dashboard" footer keeps /members reachable.
    const wizard = `/members/${result.slug}/link-history`;
    if (confidence === 'high' || confidence === 'medium') {
      res.redirect(`${wizard}?from=register`);
      return;
    }
    if (confidence === 'low' || result.legacyMatch) {
      res.redirect(`${wizard}?from=register&reason=low_confidence`);
      return;
    }
    res.redirect(`${wizard}?from=register`);
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
        res.redirect(parsed.pathname);
        return;
      }
    } catch { /* ignore malformed Referer */ }
  }
  res.redirect('/');
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
    const cookieValue = await createSessionJwt(result.memberId, result.role, result.newPasswordVersion);
    issueSessionCookie(res, cookieValue, req);
    // Redirect to the member's own profile, matching login + verify flows.
    // Previously redirected to the generic /members landing page, which was
    // inconsistent UX after a successful credential change.
    res.redirect(`/members/${encodeURIComponent(result.slug)}`);
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
};
