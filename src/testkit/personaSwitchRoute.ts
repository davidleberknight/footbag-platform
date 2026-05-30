/**
 * GET /dev/switch?as=<slug> — issue a real session cookie for a seeded persona.
 *
 * Development-only: registered behind a config.footbagEnv === 'development'
 * guard in publicRoutes.ts, so the route does not exist in any other
 * environment. The harness only chooses which member to act as; the cookie
 * itself is minted by the same production primitive (createSessionJwt) and
 * verified by the same auth middleware production uses, never a parallel
 * auth-bypass.
 *
 * Looks the member up by slug via the same session-member query the auth
 * middleware uses (members_active, email-verified). Unknown slug → 404.
 * Every issuance writes an audit entry with action_type 'dev_switch_persona'.
 */
import { Request, Response, NextFunction } from 'express';
import { auth as authDb } from '../db/db';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
import { appendAuditEntry } from '../services/auditService';
import { PERSONA_SWITCH_AUDIT_ACTION_TYPE } from './personaFactory';

interface SessionMemberRow {
  id: string;
  slug: string | null;
  display_name: string | null;
  password_version: number;
  is_admin: number;
}

export async function getDevSwitch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const asParam = req.query.as;
    const slug = typeof asParam === 'string' ? asParam : undefined;
    if (!slug) {
      res.status(400).send('dev/switch requires ?as=<persona-slug>');
      return;
    }

    const row = authDb.findMemberForSessionBySlug.get(slug) as
      | SessionMemberRow
      | undefined;
    if (!row) {
      res.status(404).send(`no persona with slug '${slug}'`);
      return;
    }

    const role = row.is_admin ? 'admin' : 'member';
    const cookieValue = await createSessionJwt(row.id, role, row.password_version);
    issueSessionCookie(res, cookieValue, req);

    appendAuditEntry({
      actionType: PERSONA_SWITCH_AUDIT_ACTION_TYPE,
      category: 'identity',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'member',
      entityId: row.id,
      reasonText: 'dev /dev/switch persona cookie issuance',
      metadata: { slug },
    });

    res.redirect(302, '/');
  } catch (err) {
    next(err);
  }
}
