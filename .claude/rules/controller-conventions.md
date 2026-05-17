---
paths:
  - "src/controllers/**"
---

# Controller conventions

## Thinness

Controllers are HTTP glue: parse request, call service, render response. No business rules; no validation logic beyond shape coercion; no SQL; no domain branching. Services own authorization checks, business validation, page-model shaping, and all SQL.

If a controller method exceeds ~10 lines without obvious cause, the missing pattern is probably a service method.

## Render shape

Every page render call passes a view-model satisfying `PageViewModel<TContent>` from `src/types/page.ts`:

    res.render('section/page', viewModel satisfies PageViewModel<MyContent>);

Templates branch only on pre-shaped fields. Controllers do not mutate service output; they pass it through.

## HTTP status conventions

Controllers emit these statuses by convention. Service errors route through `handleControllerError(err, req, res)` from `src/lib/controllerErrors.ts`; controllers MAY catch a specific error class locally to re-render a form (e.g., validation on login/register) instead of delegating.

| Status | When | Trigger |
|---|---|---|
| 200 | Form re-render with inline errors on the same page (validation / conflict caught locally) | Controller renders the form template with `formErrors` injected |
| 303 | Post-redirect-get on state-changing POST/PUT/DELETE (success path) | Controller `res.redirect(303, ...)` after a successful write |
| 404 | Resource not found, OR anti-enumeration (owner-only routes where slug mismatches authenticated user) | `NotFoundError` from service; or explicit controller-side ownership check |
| 422 | Validation or conflict error (canonical error response, not form re-render) | `ValidationError` or `ConflictError` from service |
| 429 | Rate-limit exceeded; `Retry-After` header set from `retryAfterSeconds` | `RateLimitedError` from service |
| 503 | Service-layer unavailability (SQLite busy/locked, adapter down) | `ServiceUnavailableError` from service |

## Cookies

Session cookies are set or cleared exclusively through `issueSessionCookie(res, jwt)` and `clearSessionCookie(res)` from `src/lib/sessionCookie.ts`. Controllers never call `res.cookie()` or `res.setHeader('Set-Cookie', ...)` directly (logout's explicit `clearCookie(SESSION_COOKIE_NAME, ...)` for RFC-6265 attribute matching is the only documented exception). Transient UI state (logout banner, post-success notice) uses `writeFlash(res, req, FLASH_KIND.X, payload)` from `src/lib/flashCookie.ts`.

## Password change

Any POST that changes a password (login-after-rotate, password-edit, password-reset-complete) re-issues the session JWT via `createSessionJwt()` plus `issueSessionCookie()` so the current browser stays authenticated; bumping `password_version` invalidates all other sessions.

## State-changing POSTs

State-changing verbs (POST, PUT, DELETE) follow PRG (post-redirect-get): the controller redirects to a GET URL with status 303. Transient flash payload conveys "operation succeeded" / "validation failed" / "rate-limited" to the receiving GET. Form re-renders for the same page (validation errors) return 200 with the form template plus inline errors.

## Safe-path redirects

Any redirect target derived from `?returnTo=`, `Referer`, or other request input is validated through `isSafePath(value)` before use. Invalid values fall back to a known-safe default (e.g. `/members/{slug}`).

## Auth gates

Authentication is checked by middleware (`requireAuth` from `src/middleware/auth.ts`) at the route layer, not in the controller body. Ownership and authorization within an authenticated request (for example, `:memberKey` matches `req.user.slug`) are checked in the controller and return 404 on mismatch (anti-enumeration), not 403.

## Request parsing

`req.query` and `req.params` values are typed `string | string[] | undefined`. Controllers narrow with `typeof X === 'string'` before passing to services. Body fields use null-coalescing for optional defaults; services validate the actual content.

## Pre-shaped middleware locals

Middleware sets `res.locals.isAdmin`, `res.locals.isAuthenticated`, `res.locals.currentSection`, etc. so templates branch on booleans (`{{#if isAdmin}}`), never on raw enum values (`{{#if (eq role 'admin')}}`). Controllers do not duplicate this shaping.