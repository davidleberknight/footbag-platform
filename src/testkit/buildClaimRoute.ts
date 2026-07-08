/**
 * GET /dev/build-claim?as=<legacyMemberId> — non-prod only.
 *
 * The generic real-flow claim affordance: builds a claimed account for any real
 * migrated legacy record and signs the caller in as it, so a tester (or the
 * opt-in real-claim crawl) can verify that migrated real-world data renders and
 * behaves once claimed. If the record is not claimed yet, this runs the real
 * register → verify → claim → onboarding journey to build the claimant account,
 * then mints the session cookie with the same production primitive /dev/switch
 * uses and redirects to the claimed member's profile. If the record is already
 * claimed it reuses that member and just mints the cookie, so a repeat hit is safe
 * and rebuilds nothing.
 *
 * Non-prod (dev + staging): the /dev mount already excludes production and this
 * handler refuses production as defense in depth. Part of src/testkit/ and
 * excluded from the production image by the env-gated mount plus the build-time
 * strip.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { auth as authDb } from '../db/db';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
import { appendAuditEntry } from '../services/auditService';
import { PERSONA_SWITCH_AUDIT_ACTION_TYPE } from './personaFactory';
import { ensureRealClaimMember } from './realClaimJourney';

interface SessionMemberRow {
  id: string;
  slug: string | null;
  display_name: string | null;
  password_version: number;
  is_admin: number;
}

// A legacy_member_id is an opaque short token (numeric or dash/underscore-joined).
// Validating the shape rejects a missing or malformed param before it reaches the
// builder and keeps the value safe to interpolate into the derived slug.
const LEGACY_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export async function getDevBuildClaim(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (config.footbagEnv === 'production') {
      res.status(404).send('build-claim is not available in production');
      return;
    }
    const asParam = req.query.as;
    const legacyMemberId = typeof asParam === 'string' ? asParam.trim() : '';
    if (!LEGACY_ID_SHAPE.test(legacyMemberId)) {
      res.status(400).send('build-claim requires ?as=<legacy_member_id>');
      return;
    }

    const { memberId } = await ensureRealClaimMember(legacyMemberId);
    const row = authDb.findMemberForSession.get(memberId) as SessionMemberRow | undefined;
    if (!row) {
      throw new Error('build-claim: the claimant member is not a switchable session member');
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
      reasonText: 'dev /dev/build-claim real-record build + cookie issuance',
      metadata: { slug: row.slug, legacyMemberId },
    });

    res.redirect(302, `/members/${row.slug}`);
  } catch (err) {
    next(err);
  }
}
