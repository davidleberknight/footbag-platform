/**
 * POST /dev/personas/refresh — rebuild every persona to its seeded initial state.
 *
 * Development/staging only: registered on the env-gated /dev mount (app.ts), so
 * the route does not exist in production. It tears down persona-owned rows and
 * re-seeds the canonical catalog via refreshAllPersonas, reusing the app's shared
 * db connection, then runs the finance persona's journey (the real
 * reconciliation and digest jobs, on demand). Post/Redirect/Get back to the
 * listing.
 *
 * The persona password literal lives behind personaSecrets' dev/staging import
 * guard. Because devRoutes (and therefore this module) is imported by app.ts
 * unconditionally, the secret is pulled in via a dynamic import inside the
 * handler — which only runs when this dev-only route is hit — so a production
 * process never loads it.
 */
import { Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import { db } from '../db/db';
import { appendAuditEntry } from '../services/auditService';
import { refreshAllPersonas } from './personaRefreshRunner';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { runFinanceDemoJourney } from './financeDemoJourney';
import { barredEmailHash } from '../lib/barredEmailHash';
import { runPersonaJourneys } from './personaJourneys';
import { PERSONA_REFRESH_AUDIT_ACTION_TYPE, PERSONA_SEED_CREATED_BY } from './personaFactory';

export async function postDevPersonasRefresh(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { TEST_PERSONA_SEED_PASSWORD_LITERAL } = await import('./personaSecrets');
    const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);

    const result = refreshAllPersonas(db, { passwordHash, barredEmailHash });

    // The runner is DB-only, so delete the uploaded media's bytes here to return
    // the media store to its seeded (empty) state. Best-effort per key: a missing
    // object is the desired end state, not an error.
    const mediaStorage = getMediaStorageAdapter();
    await Promise.all(
      result.deletedMediaKeys.map((key) => mediaStorage.delete(key).catch(() => undefined)),
    );

    // The finance persona's reports and digest come from the real jobs, run
    // once the reseed has committed, so they total the money it just wrote.
    const financeJourney = await runFinanceDemoJourney();
    // Then the personas whose state is reached only through an act.
    const journeys = await runPersonaJourneys();

    appendAuditEntry({
      actionType: PERSONA_REFRESH_AUDIT_ACTION_TYPE,
      actorType: 'system',
      actorMemberId: null,
      entityType: 'system',
      entityId: PERSONA_SEED_CREATED_BY,
      reasonText: 'dev /dev/personas/refresh rebuild to seeded state',
      metadata: {
        reseeded: result.reseeded,
        deletedMembers: result.deletedMembers,
        actorGrantRowsRemoved: result.actorGrantRowsRemoved,
        configRowsRemoved: result.configRowsRemoved,
        deletedMediaObjects: result.deletedMediaKeys.length,
        financeJourney: financeJourney.status,
        journeysRan: journeys.ran.length,
        journeysFailed: journeys.failed.map((f) => f.slug),
      },
    });

    // A journey that failed is named on the page the refresh lands on, so the
    // tester knows which cards may not match what they see.
    const failed = journeys.failed.map((f) => f.slug).filter((s) => s !== '(all)');
    res.redirect(302, failed.length > 0
      ? `/dev/personas?journeys_failed=${encodeURIComponent(failed.join(','))}`
      : '/dev/personas');
  } catch (err) {
    next(err);
  }
}
