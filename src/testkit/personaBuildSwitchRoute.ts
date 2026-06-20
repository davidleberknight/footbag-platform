/**
 * CUTOVER-REMOVE. GET /dev/build-switch?as=david_leberknight — non-prod only.
 *
 * The DL persona is built by real flows, not seeded, so his listing action
 * (labeled "Switch" for consistency) points here instead of /dev/switch. If he
 * is not built yet, this runs buildDavidJourney() (the real register → verify →
 * claim → onboarding → uploads journey) and then mints his session cookie with
 * the same production primitive /dev/switch uses. If he already exists it just
 * mints the cookie, so a Refresh-then-Switch cleanly rebuilds him.
 *
 * Non-prod (dev + staging): the /dev mount already excludes production and the
 * handler refuses production as defense in depth. DL is build-on-switch (inert
 * until clicked), so it does not pollute a developer's local dev. The go-live
 * gate deletes this file with the rest of the DL scaffolding.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { auth as authDb } from '../db/db';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
import { appendAuditEntry } from '../services/auditService';
import { PERSONA_SWITCH_AUDIT_ACTION_TYPE } from './personaFactory';
import { buildDavidJourney, DAVID_SLUG } from './davidJourney';

interface SessionMemberRow {
  id: string;
  slug: string | null;
  display_name: string | null;
  password_version: number;
  is_admin: number;
}

export async function getDevBuildSwitch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (config.footbagEnv === 'production') {
      res.status(404).send('build-switch is not available in production');
      return;
    }
    const asParam = req.query.as;
    const slug = typeof asParam === 'string' ? asParam : undefined;
    if (slug !== DAVID_SLUG) {
      res.status(400).send(`build-switch only supports ?as=${DAVID_SLUG}`);
      return;
    }

    let row = authDb.findMemberForSessionBySlug.get(slug) as SessionMemberRow | undefined;
    if (!row) {
      await buildDavidJourney();
      row = authDb.findMemberForSessionBySlug.get(slug) as SessionMemberRow | undefined;
      if (!row) {
        throw new Error('build-switch: buildDavidJourney did not produce a switchable member');
      }
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
      reasonText: 'dev /dev/build-switch persona build + cookie issuance',
      metadata: { slug },
    });

    res.redirect(302, '/');
  } catch (err) {
    next(err);
  }
}
