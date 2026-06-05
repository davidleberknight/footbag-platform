/**
 * POST /dev/personas/refresh — rebuild every persona to its seeded initial state.
 *
 * Development/staging only: registered on the env-gated /dev mount (app.ts), so
 * the route does not exist in production. It tears down persona-owned rows and
 * re-seeds the canonical (+ optional .local) catalog via refreshAllPersonas,
 * reusing the app's shared db connection. Post/Redirect/Get back to the listing.
 *
 * The persona password literal lives behind personaSecrets' dev/staging import
 * guard. Because devRoutes (and therefore this module) is imported by app.ts
 * unconditionally, the secret is pulled in via a dynamic import inside the
 * handler — which only runs when this dev-only route is hit — so a production
 * process never loads it.
 */
import { Request, Response, NextFunction } from 'express';
import * as path from 'node:path';
import argon2 from 'argon2';
import { db } from '../db/db';
import { appendAuditEntry } from '../services/auditService';
import { refreshAllPersonas } from './personaRefreshRunner';
import { PERSONA_REFRESH_AUDIT_ACTION_TYPE, PERSONA_SEED_CREATED_BY } from './personaFactory';

export async function postDevPersonasRefresh(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const { TEST_PERSONA_SEED_PASSWORD_LITERAL } = await import('./personaSecrets');
    const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);

    const result = refreshAllPersonas(db, repoRoot, { passwordHash });

    appendAuditEntry({
      actionType: PERSONA_REFRESH_AUDIT_ACTION_TYPE,
      category: 'identity',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'system',
      entityId: PERSONA_SEED_CREATED_BY,
      reasonText: 'dev /dev/personas/refresh rebuild to seeded state',
      metadata: {
        reseeded: result.reseeded,
        deletedMembers: result.deletedMembers,
        actorGrantRowsRemoved: result.actorGrantRowsRemoved,
      },
    });

    res.redirect(302, '/dev/personas');
  } catch (err) {
    next(err);
  }
}
