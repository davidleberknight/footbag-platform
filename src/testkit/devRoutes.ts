/**
 * Permanent test-scaffolding router for the persona harness.
 *
 * Mounted at /dev only when config.footbagEnv is 'development' or 'staging'
 * (see the mount block in app.ts), so the surface is reachable in dev and
 * staging but never in production. This file is part of src/testkit/ and is
 * not removed at cutover; production exclusion is by the env-gated mount plus
 * the build-time image strip.
 *
 * No router-level auth guard: /dev/switch must serve an unauthenticated caller
 * (it is the mechanism by which a tester becomes a member). The cookie it
 * issues is a real, middleware-verified session, not an auth bypass.
 */
import { Router } from 'express';
import { getDevSwitch } from './personaSwitchRoute';
import { getDevBuildClaim } from './buildClaimRoute';
import { getDevLogin } from './personaLoginRoute';
import { getDevPersonas } from './personaListingRoute';
import { postDevPersonasRefresh } from './personaRefreshRoute';
import { getDevOutbox } from './devOutboxRoute';

export const devRouter = Router();

devRouter.get('/switch', getDevSwitch);
// Generic real-flow claim: build a claimed account for any real legacy record
// and sign in as it.
devRouter.get('/build-claim', getDevBuildClaim);
devRouter.get('/login', getDevLogin);
devRouter.get('/personas', getDevPersonas);
devRouter.post('/personas/refresh', postDevPersonasRefresh);
devRouter.get('/outbox', getDevOutbox);
