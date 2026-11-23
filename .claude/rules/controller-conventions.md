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

Which status each case takes is the design decision "HTTP Response Convention", whose table is not restated here. Service errors route through `handleControllerError(err, res, next, context)` from `src/lib/controllerErrors.ts`; controllers may catch a specific error class locally to re-render a form instead of delegating. The controller-specific triggers:

- A `NotFoundError`, a failed controller-side ownership check, or any `ValidationError` delegated to `handleControllerError` renders 404, so validation detail never reaches a public visitor.
- 422 is controller-emitted: the discriminated-union `validation_error` result, or a locally caught `ConflictError`, re-rendered with the submitted values.
- `RateLimitedError` is caught locally and rendered at 429 with `Retry-After` from `retryAfterSeconds`; `handleControllerError` does not handle it (delegating would 500).
- `ServiceUnavailableError` maps to 503.
- A repeat of an action that already landed (`own_repeat`, `already_held`) takes the success 303, never a conflict re-render.

## Cookies

Session cookies are set or cleared exclusively through `issueSessionCookie(res, jwt)` and `clearSessionCookie(res, req)` from `src/lib/sessionCookie.ts`. Controllers never call `res.cookie()`, `res.clearCookie()`, or `res.setHeader('Set-Cookie', ...)` directly. Transient UI state (logout banner, post-success notice) uses `writeFlash(res, req, FLASH_KIND.X, payload)` from `src/lib/flashCookie.ts`.

## Password change

Any POST that changes a password while signed in (login-after-rotate, password-edit) leaves the current browser holding a session JWT carrying the new `password_version`; the bump invalidates every other session. Completing a password reset bumps the version too but issues no session: it redirects to the login page, following the OWASP Forgot Password Cheat Sheet. The controller sets the cookie through `issueSessionCookie()`. Where the bump is the irreversible step, the service signs the replacement token before committing and returns it, so a signing outage fails the request with nothing changed and the controller issues only what it was handed; the remaining paths mint the token in the controller via `createSessionJwt()`.

## State-changing POSTs

State-changing requests are HTML form POSTs, because forms send only GET and POST, and follow PRG (post-redirect-get): the controller redirects to a GET URL with status 303. Transient flash payload conveys "operation succeeded" / "validation failed" / "rate-limited" to the receiving GET. Form re-renders for the same page (validation errors) return 422 with the form template, inline errors and the submitted values. A repeated submit the service recognises takes the same 303 and the first outcome's message (design decision "Every State-changing Action Is Safe to Submit Twice"). A GET handler changes no stored state (design decision "Every GET Is Read-only").

## Safe-path redirects

Any redirect target derived from `?returnTo=`, `Referer`, or other request input is validated through `isSafePath(value)` before use. Invalid values fall back to a known-safe default (e.g. `/members/{slug}`).

## Auth gates

Authentication and membership are checked by middleware at the route layer, not in the controller body: `requireAuth` for a signed-in visitor, and `requireMember` for the member-capability routes, which additionally requires onboarding to be complete. Both live in `src/middleware/auth.ts`. Ownership and authorization within an authenticated request (for example, `:memberKey` matches `req.user.slug`) are checked in the controller and return 404 on mismatch (anti-enumeration), not 403.

For anti-enumeration endpoints (login, register, password reset, email verify, claim lookup), the controller does not branch on whether the account exists; it calls the service unconditionally and lets the service run the identical path both ways. It may gate first on facts independent of account existence (CAPTCHA, input shape).

## Request parsing

`req.query` and `req.params` values are typed `string | string[] | undefined`. Controllers narrow with `typeof X === 'string'` before passing to services. A submitted body is read only through `parseFormBody(<schema>, req.body)` from `src/lib/parseFormBody.ts`, with the form's schema beside its handler, or through `rawBody(req)` on a raw-body route. A refusal re-renders the form at 422 with the message naming the field and the values the visitor typed. The schema decides shape; services validate the content. The conventions gate refuses any other read of `req.body`. A field naming another member carries the choice from the member picker, never a typed id, slug or profile URL (`.claude/rules/view-layer.md`, Reusable primitives).

## Pre-shaped middleware locals

Middleware sets `res.locals.isAdmin`, `res.locals.isAuthenticated`, `res.locals.isMember`, `res.locals.currentSection`, etc. so templates branch on booleans (`{{#if isAdmin}}`), never on raw enum values (`{{#if (eq role 'admin')}}`). Controllers do not duplicate this shaping.