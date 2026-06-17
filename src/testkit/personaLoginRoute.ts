/**
 * GET /dev/login?as=<slug> — exercise the REAL login path as a seeded persona.
 *
 * Development/staging only: registered behind the env-gated /dev mount, never in
 * production. Where /dev/switch mints a session cookie directly to test the
 * already-authenticated experience, this route drives the production login code
 * (identityAccessService.attemptLogin) with the persona's seeded email and the
 * shared harness password, so the login/registration auth decision actually
 * runs. It exists so that login-blocked personas (unverified, deceased,
 * soft-deleted) are a live, testable link rather than a dead row: the route
 * crawler follows it and the real credential + account-state gates execute.
 *
 * Outcome mirrors the production login controller: a session-eligible account
 * gets a real cookie and a redirect to its profile; a login-blocked account is
 * rejected by the same query the public form uses and lands back on /login.
 * Every issuance or rejection writes an audit entry with action_type
 * 'dev_login_persona'. Unknown slug → 404; missing ?as → 400.
 */
import { Request, Response, NextFunction } from 'express';
import { auth } from '../db/db';
import { identityAccessService } from '../services/identityAccessService';
import { RateLimitedError } from '../services/serviceErrors';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
import { appendAuditEntry } from '../services/auditService';
import { PERSONA_LOGIN_AUDIT_ACTION_TYPE } from './personaFactory';

interface PersonaEmailRow {
  login_email: string;
}

export async function getDevLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const asParam = req.query.as;
    const slug = typeof asParam === 'string' ? asParam : undefined;
    if (!slug) {
      res.status(400).send('dev/login requires ?as=<persona-slug>');
      return;
    }

    const row = auth.personaLoginEmailBySlug.get(slug) as PersonaEmailRow | undefined;
    if (!row) {
      res.status(404).send(`no persona with slug '${slug}'`);
      return;
    }

    // Loaded lazily, not at module top: personaSecrets refuses to import outside
    // development/staging, and this route module is in the app graph in every
    // env. The handler only runs where the /dev mount exists (dev/staging), so
    // the import here is always in an allowed env.
    const { TEST_PERSONA_SEED_PASSWORD_LITERAL } = await import('./personaSecrets');

    const ip = req.ip ?? 'unknown';
    let member;
    try {
      member = await identityAccessService.attemptLogin(
        row.login_email,
        TEST_PERSONA_SEED_PASSWORD_LITERAL,
        ip,
      );
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        res.status(429).send(err.message);
        return;
      }
      throw err;
    }

    // member === null when the account-state gate rejects the persona
    // (unverified / deceased / soft-deleted): the same outcome the public login
    // form produces. Land back on /login, which is what a real visitor sees.
    const outcome = member ? 'session_issued' : 'rejected';
    appendAuditEntry({
      actionType: PERSONA_LOGIN_AUDIT_ACTION_TYPE,
      category: 'identity',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'member',
      entityId: slug,
      reasonText: 'dev /dev/login persona real-login attempt',
      metadata: { slug, outcome, memberId: member ? member.id : null },
    });

    if (!member) {
      res.redirect(302, '/login');
      return;
    }

    const role = member.is_admin ? 'admin' : 'member';
    const cookieValue = await createSessionJwt(member.id, role, member.password_version);
    issueSessionCookie(res, cookieValue, req);
    res.redirect(302, `/members/${member.slug ?? member.id}`);
  } catch (err) {
    next(err);
  }
}
