# src/testkit/

Permanent development- and staging-only persona harness: the seed catalog plus the
`/dev` affordances that let a tester become any seeded member. It is environment-isolated
and excluded from the production runtime image, exactly like the register-allowlist bootstrap
in `src/dev-bootstrap/`; it is never source-deleted.

## What it does

Seeds a curated catalog of member personas and exposes a `/dev` router that issues a real,
middleware-verified session for a chosen persona. The router is mounted only when
`config.footbagEnv` is `development` or `staging` (see the mount block in `src/app.ts`), so
the surface is reachable in dev and staging but never in production.

Affordances under `/dev`:
- `/dev/switch` — become a seeded persona (unauthenticated caller allowed; this is how a
  tester becomes a member).
- `/dev/personas` — list the seeded personas; `/dev/personas/refresh` rebuilds them.
- `/dev/login` — log in as a persona by slug.
- `/dev/outbox` — read captured outbound email (the SES stub captures links here, e.g. the
  email-verification link).
- `/dev/build-switch` — staging-only build-then-switch for the primary maintainer's persona.

## Files

- `devRoutes.ts` — the `/dev` router; delegates to the per-route handlers below.
- `personaSwitchRoute.ts`, `personaLoginRoute.ts`, `personaListingRoute.ts`,
  `personaRefreshRoute.ts`, `personaBuildSwitchRoute.ts`, `devOutboxRoute.ts` — the route
  handlers.
- `canonicalPersonas.ts`, `personaFactory.ts`, `personaRowBuilders.ts`, `davidJourney.ts` —
  the persona catalog and the row builders (the same builders the test factories re-export).
- `seedCli.ts`, `personaSeedRunner.ts`, `personaRefreshRunner.ts` — seed/build entry points.
- `devOutboxCaptureClient.ts` — the outbox-capture client behind `/dev/outbox`.
- `personaSecrets.ts` — the single persona password literal (see below).
- `assets/` — seed fixtures.

## Secret containment

The persona password literal lives in exactly one checked-in file, `personaSecrets.ts`, which
throws on import unless `FOOTBAG_ENV` is `development` or `staging`, so a production process can
never load it. The literal is argon2-hashed at seed time and is never logged, networked, or
embedded in scripts; the regression test `tests/integration/personaSeed.passwordLeak.test.ts`
pins this.

## Production exclusion (three independent layers)

1. Env-gated mount: `src/app.ts` mounts the `/dev` router only under `development` or `staging`.
2. Module-load guard: `personaSecrets.ts` refuses to load outside dev/staging.
3. Production image: the Docker build defaults to `INCLUDE_DEV_SHORTCUTS=0`, which strips
   `dist/testkit` and recreates a no-op `dist/testkit/devRoutes.js` stub, so the statically
   imported `devRouter` is inert (`null`) in production and every runtime image still boots.

## Audit

Persona operations are traceable: seeded tier grants carry
`member_tier_grants.reason_code = 'dev_persona_seed.tier_grant'`, and audit rows carry
`action_type` `testkit.persona_seed` (seed), `testkit.persona_switch` (cookie issuance), or
`testkit.persona_login` (login), with a `dev-shortcuts/…` `created_by` marker.
`scripts/audit-dev-shortcuts.sh` confirms zero such rows in a production database.
