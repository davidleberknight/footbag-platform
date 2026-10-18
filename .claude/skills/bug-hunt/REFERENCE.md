# Bug Hunt: implementation-layer reference

The implementation lane's brief, read by the subagent that sweeps deployed code and never by the orchestrator. The design-layer method is the sibling `DESIGN.md`. Test and gate coverage is the `write-tests` skill's; the mechanical documentation detectors are the `doc-sync` skill's full-audit mode.

## Contents

- Bug categories, catalog (4.4.1 to 4.4.54): the security and correctness sweep classes, and the UI/UX lane's method (4.4.54)
- Design-pattern divergence and hygiene (4.4B.1 to 4.4B.8): code against the rules and contracts that govern it
- Cross-cutting observations
- External security calibration references
- High-signal static search recipes

The numbers are stable category identifiers cited in `BUGS.md` finding `Class` fields; they are not sections of SKILL.md. A retired number is never reused: 4.4.38, 4.4.39, 4.4.41 and 4.4B.7 (automated-check gaps, route-wiring smoke gaps, leak-check gaps and committed-test rule violations) now belong to the `write-tests` skill, and a finding of that shape is handed there rather than recorded here.

## Bug categories, catalog (4.4)

#### 4.4.1 Logic errors

- Off-by-one indexing, wrong comparison operators, swapped variables.
- Conditional inversions: `if (!owner)` when owner check should be `owner === viewerId`.
- Missing fall-through in switch/case; missing default branches.
- Date math errors: timezone confusion, ISO parsing assumptions, leap-year edges.
- Wrong shape returned from service (`Promise<T | null>` where caller assumes `T`).
- Tip: cross-reference each method's return type against every call site; mismatches are bugs.

#### 4.4.2 Error-handling holes

- Unhandled promise rejections (async functions without try/catch where errors are domain-meaningful).
- Swallowed errors: `try { ... } catch { /* nothing */ }` or `.catch(() => undefined)` that hide real problems.
- `next(err)` paths that bypass the controller's specific-error catches.
- Async functions in Express handlers without `next(err)` plumbing; Express does not catch async errors automatically.
- Generic 500 responses where a specific actionable status (422 / 429 / 503) was the correct mapping.

#### 4.4.3 Race conditions

- Better-sqlite3 is synchronous, but the surrounding Node code is async.
- Concurrent registrations of the same email: a unique constraint plus a graceful UPSERT, or a TOCTOU race?
- Concurrent claim of the same legacy account: partial UNIQUE index, or first-write-wins via a guarded INSERT?
- Worker re-emit between SES-send and outbox-mark-sent (idempotency_key collisions).
- Image-worker job claim lease (`mediaJobLeaseSeconds`): two workers claiming the same row.
- Per-request password_version check (auth middleware): can a stale-cookie request slip through if a password change races with the request?
- Tip: look for `INSERT` paths without a corresponding unique index plus conflict handling.

#### 4.4.4 Auth gate misses

- Every route in `src/routes/publicRoutes.ts` that touches member-only data must traverse `requireAuth`.
- Every route in `adminRoutes.ts` already passes `requireAuth + requireAdmin` (mount-level); verify no per-route override skips it. `internalRoutes.ts` likewise.
- `/ipc/job-events` (ipcRoutes.ts) uses shared-secret auth in the `requireInternalSecret` route middleware, not a session; verify the route mounts that middleware ahead of the controller.

#### 4.4.5 Authorization gate misses

- Owner-only routes (`/members/:memberKey/...`) should 404 (anti-enumeration) when the authenticated user does not match the slug, not 403.
- Admin routes should 403 on non-admin authenticated requests.
- Tier-gated routes use `requireTier1Benefits`; verify the gate fires BEFORE the missing-resource 404.
- Cross-member writes must be blocked at the controller level: body forgery like `ownerMemberId` in the POST body is ignored in favor of the session-derived id.

#### 4.4.6 Anti-enumeration violations

Anti-enumeration surfaces include login, password-reset, email-verify, claim-lookup, contact-admin, register, search. For each, the response status, body shape and body content are identical for the "exists" and "not-exists" cases, compared whole after `tests/fixtures/normalizeAntiEnumerationBody.ts`, never by a length ratio. Any differential is a leak: a status differential (200 vs 422 between unknown member and malformed email), an extra error string in one branch, or a timing differential (a missing argon2 hash on the not-found path).

#### 4.4.7 CSRF gate misses

- `requireOriginPin` is mounted globally in `src/app.ts` before route registration. Every state-changing verb (POST, PATCH, PUT, DELETE) must traverse it.
- A sub-router mounted without inheriting the global middleware would skip the gate. Verify no such mount exists.
- Non-browser clients (the `/ipc/job-events` worker channel) use shared-secret auth in lieu of Origin pinning; verify the check is correct.

#### 4.4.8 SQL injection / XSS holes

- All SQL lives in `src/db/db.ts` as named prepared statements. `db.prepare()` outside `db.ts` is forbidden (the conventions gate enforces it); a violation is critical.
- Handlebars escapes by default; triple-stash bypasses escaping. For each `{{{` in `src/views/`, confirm the value is operator-controlled or sanitized server-side.
- Untrusted input concatenated into a regex, a shell command, or a file path is a bug.
- Any externally hosted asset a template loads must be declared in the `src/app.ts` CSP directives; a template loading an external asset with no matching CSP entry is a bug.

#### 4.4.9 PII / secret leaks

- A 500 stack trace leaked to the browser is critical. Verify the `src/app.ts` 500 handler renders a friendly page and `redactTokenPaths` is applied to all log lines.
- Audit `metadata_json`, logger calls and URLs never carry raw passwords, tokens, session secrets, emails, DOB, phone, address or admin notes, unless the route is explicitly token-bearing and protected by no-store and redaction.
- The persona-password literal (`src/testkit/personaSecrets.ts`) appears in exactly one source file.
- Every exposure of emails, DOB, phone/address, IP, contact text, media metadata, private fields, identity-linking notes, admin notes and exported fields has a purpose, an audience boundary and a minimization rule.
- A redaction helper that covers one path but not another is a bug: browser errors, structured logs, audit metadata, outbox rows, worker errors, webhook errors and script errors use the same policy or an equally strict local one.

#### 4.4.10 Rate-limit misses

- Routes that mutate state (login, register, password forgot, verify resend, password edit, contact-admin, media upload, and so on) call the rate-limit hit function from `src/services/rateLimitService.ts`. A missing limiter on a state-changing route is High.
- The audit row records only the threshold-crossing event: no per-attempt audit, no IP stored.

#### 4.4.11 Cookie attribute regressions

- `src/lib/sessionCookie.ts` is the only place that sets or clears the session cookie. Verify `HttpOnly`, `Secure` in production, and `SameSite=Lax`.
- Flash cookies are HttpOnly and signed (`src/lib/flashCookie.ts`); no controller calls `res.cookie()` directly.
- Any POST that changes a password re-issues the session JWT so the current browser stays authenticated while the bumped `password_version` invalidates all other sessions. A path that does not re-issue locks the user out; one that does not bump fails to invalidate stolen sessions.

#### 4.4.12 Cache-Control regressions

- Authenticated responses carry `Cache-Control: private, no-store` plus `X-Robots-Tag: noindex`, set by the authenticated-response middleware in `src/app.ts`; a controller overwriting these is a bug.
- Token-bearing GET and POST-422 responses must not be cacheable; verify no token-bearing route was added without the protection the password-reset route has.

#### 4.4.13 Schema / data-integrity bugs

- Multi-write operations wrap in `transaction(() => { ... })`. An `await` inside the callback is a runtime crash.
- Every domain table carries `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`, stamped on every write.
- State-changing service methods append an `audit_entries` row; a missing row is a finding whose severity follows the change.
- The application inserts no orphan rows where the schema does not enforce the FK.

#### 4.4.14 Best-effort enqueue patterns

The strict send is a flag on the single enqueue path, used at the password-change confirmation site. Analogous sites (claim notification, auto-link notification, email verification, password-reset confirmation) may still swallow. A failed enqueue plus a committed mutation is a silent loss of a security-critical notification. Remediation shape: mark the send strict and add a high-priority audit row on failure, as `identityAccessService.changePassword` does.

#### 4.4.15 Dev-shortcut leaks

- Every `FOOTBAG_DEV_*` read in `src/` outside `src/testkit/`, `src/dev-bootstrap/` and `src/config/env.ts` is gated by `config.footbagEnv` and has a boot-time fail-fast guard in `src/config/env.ts`.
- The Dockerfile strip rule removes `dist/testkit/` and `dist/dev-bootstrap/` from production builds; no source file outside those trees imports a stripped symbol.
- `scripts/audit-dev-shortcuts.sh` runs a set of audit-marker queries (read the script, do not trust a count); the marker set still covers every dev-shortcut write path.

#### 4.4.16 Other patterns worth a sweep

Hard-coded URLs that should derive from `config.publicBaseUrl`; file-system writes in `src/services/` that bypass the MediaStorageAdapter; `process.env` reads outside `src/config/env.ts`; `await` inside `transaction()`; `db.prepare()` outside `src/db/db.ts`; AWS SDK imports outside `src/adapters/`.

#### 4.4.17 Open-redirect / unsafe redirect

Any redirect target derived from `?returnTo=`, `Referer` or other request input passes `isSafePath(value)` before use, falling back to a known-safe default. Grep `res.redirect(` and trace the target's provenance.

#### 4.4.18 Idempotency-key integrity

Work-queue inserts, outbox enqueues and webhook handlers use a stable idempotency key so a duplicate request produces no duplicate row or re-send. A key derived from a timestamp or random value is a finding. See 4.4.3 for the TOCTOU variant and 4.4.53 for the double-submit sweep.

#### 4.4.19 Append-only ledger integrity

`audit_entries`, `member_tier_grants`, `active_player_grants` and `system_config` (value changes) are append-only; schema triggers `RAISE(ABORT)` on UPDATE/DELETE. Application code that issues an UPDATE or DELETE against these tables is a finding.

#### 4.4.20 Domain-invariant violations

Service-JSDoc, data-governance and user-story non-negotiables. A violation is a bug even when the code "works":

- Deceased login: login rejects `is_deceased = 1` before the credential check.
- Active-player no-shorten: an older event, vouch or club-join never shortens a later expiry.
- Ballot non-anonymity: `ballots.voter_member_id` is stored in plaintext by design; a path that strips it is a finding.
- Work-queue admin-alert coupling: every `work_queue_items` INSERT enqueues an `admin-alerts` notification carrying task type and entity id only.
- Event hard-delete guard: events with published result rows are never deleted.
- PII purge atomicity: `purgeAccountPII` runs in one transaction; honors and historical attribution survive per the erasure rules.

#### 4.4.21 User-story success-criteria mismatch

A deployed story that fails its own success criteria is a bug even when the code works mechanically. Build the traceability matrix from Lane 0's story classification; for each Complete deployed story verify every criterion against routes, services, templates, writes, audit rows and gates; for each Partial story verify the missing criteria are documented as accepted deviations. Write the expected outcome from the story text before reading the code. If the discrepancy may be a bad story rather than bad code, it is a discrepancy-lane finding naming which side looks wrong, or one maintainer question.

#### 4.4.22 Design-level threat-model gaps

Missing controls visible from design and flow, with no single wrong line. The method (data-flow map, actors, what each can read, write, link, delete, pay for, retry, replay, enumerate or cause to be emailed) is `DESIGN.md`'s threat model; here, a missing control is a finding only when tied to a deployed flow and a concrete failure path.

#### 4.4.23 Admin/moderator capability and confused-deputy bugs

- Admin-only actions never trust member IDs, roles, target statuses or owner IDs from request bodies.
- Curator edit and delete routes cannot target non-curated or other-member media unless explicitly intended.
- Admin dashboards and reports apply the same privacy filters as public and member views unless a documented admin exception exists.
- Audit rows for admin actions reconstruct who did what without unnecessary PII.

#### 4.4.24 Payment, tier, and webhook integrity

- A purchase route cannot grant a tier without a trusted checkout or webhook path or an explicit dev-only stub.
- `memberKey` in the URL cannot grant a tier to another member.
- Webhook handlers authenticate provider signatures in live mode and reject unsigned events.
- Duplicate webhooks are idempotent: no double grant, double email or ledger corruption.
- Amount, currency and tier mapping are server-derived.
- Success and cancel pages are display-only.
- Payment logging avoids card secrets and unnecessary customer PII.

#### 4.4.25 Email, notification, and outbox abuse

- Every email-producing path has a stable idempotency key; security-critical emails use strict enqueue or audited failure handling.
- No route is an unauthenticated spam relay to arbitrary addresses; templates do not echo untrusted HTML into bodies.
- Verification and reset tokens are single-purpose, scoped, expiring and never logged.
- Contact-admin and alias workflows leak no private address and permit no header injection.

#### 4.4.26 File upload, media processing, path traversal, and content-type spoofing

- Uploaded media paths are generated server-side; no `../`, absolute paths, encoded traversal or user-controlled extensions.
- MIME, extension, magic bytes, size, dimensions and transformation outputs are checked at the trust boundary.
- Originals are not served from an executable or privileged location; processing failures leave no public partial file or orphan row.
- Delete and curator flows remove or tombstone every related storage object; legacy archive media is read-only.

#### 4.4.27 SSRF and outbound request safety

Search `fetch`, `axios`, `got`, `http.request`, `https.request`, SDK URL configuration, embed parsing and reachability checks. User-controlled URLs cannot target loopback, link-local, RFC1918, metadata services, internal hostnames or file URLs; redirects are bounded and re-validated; timeouts and size limits exist; allowlists are explicit where only known domains are needed.

#### 4.4.28 Secrets, configuration, and deployment-gate bugs visible in repo

Hardcoded secrets, tokens, private keys or real-looking fixture credentials; `process.env` outside `src/config/env.ts`; production-dangerous env combinations that do not fail fast at boot; dev shortcuts enabled by one loose env var; redaction not centralized across URLs, bodies, headers, logs, audit metadata and thrown errors.

#### 4.4.29 Dependency, supply-chain, and build-script risks

Static review only unless networked audits are authorized. Lifecycle scripts, shell invocations or build-time deletions that could remove a gate or ship dev-only code; production build requiring a stripped module at runtime; SDK usage leaking outside adapters. A suspected vulnerable dependency is a Lead when confirmation needs networked tooling.

#### 4.4.30 Privacy, data minimization, and member-search leakage

Public member, profile, search, gallery and event pages use the privacy-shaped views and expose no hidden email, DOB, address, admin notes, legacy matching data, tombstoned state or audit metadata. Search reveals no more for exact than broad matches unless documented. Exports carry no fields beyond their purpose. Legacy preview and "Is this you?" flows reveal enough to help the rightful user and not enough to impersonate.

#### 4.4.31 Security headers, CSP, framing, and browser boundary bugs

CSP covers every asset the templates use and has not been loosened without a narrow documented reason; `frame-ancestors` matches the embedding policy; `Referrer-Policy` does not leak reset, verify or claim URLs; static and download responses set safe content types and `nosniff`; authenticated pages are not cacheable.

#### 4.4.32 Business-logic abuse and workflow bypass

Jump directly to later POST routes of a multi-step flow; use stale tokens after password change, email change, claim, auto-link, logout or reset; replay old submissions, webhook events and media jobs; force conflicting transitions (approve then delete, claim then auto-link, pay then cancel, tier downgrade then gated upload). Every transition is guarded by current DB state, not by the page the user came from.

#### 4.4.33 Availability and resource-exhaustion risks

Rate limits on every mutation surface; request, file, pixel, job and queue limits on upload paths; page-size caps and normalized sort and filter parameters on list routes; expensive operations not repeatable by anonymous or low-tier users; workers with leases, retry caps and poison-message handling.

#### 4.4.34 Token lifecycle, replay, and clock bugs

Every token has purpose, scope, expiry, single-use or replay-safe semantics (consumed only by a POST; a replay reports the first outcome) and redacted logging. Validation checks current user state: password version, verification state, deletion, deceased status, claim status, tier. Clock comparisons are ISO-safe; token-bearing routes do not redirect to URLs that leak the token in `Referer`.

#### 4.4.35 Unicode, normalization, slug, and identity-matching bugs

Email normalization is consistent across register, login, reset, verify and claim; slugs are unique, stable and not confusable; name, DOB and alternate-name matching do not over-link; deceased, historical-person, Hall of Fame, BAP and legacy attribution are not collapsed into the wrong member; search and display preserve human names and match on normalized values only.

#### 4.4.36 Footbag-domain invariant violations

Clubs and groups/committees are distinct; a member may belong to two current clubs and lead one; Tier 1 and 2 are lifetime; BAP and Hall of Fame induction grant Tier 2 with an audit row; Active Player is separate from tier and never shortened by an older event; the legacy media archive is read-only; outbound email is the new platform's, inbound is Google-managed. Freestyle-dictionary and curated-media domain invariants belong to the `freestyle-bug-hunt` skill; hand those candidates there.

#### 4.4.37 Legacy migration and archive-boundary bugs

The `legacy_data/` pipeline is out of scope (it is hunted by its own subagent), but migrated data as surfaced by deployed routes is in scope: legacy records are shaped through privacy and governance rules; archive links are never write paths or auth bypasses; migrated IDs are never trusted as member IDs; confidence tiers drive the intended claim behavior; archive-only media is never treated as mutable; redirect and archive assumptions match the documented cutover.

#### 4.4.40 Script credential-handling violations

The convention is `.claude/rules/script-secret-safety.md` (stdin or restricted `file://` transport, never argv; no echo or logging; shredded temp files) and `scripts/ci/check_script_credentials.sh` is its deterministic gate. Audit scripts against the rule and the gate's patterns against the rule's surface. Trace how each credential is obtained, transported, logged, passed to children and cleaned up, across `scripts/**`, `package.json` scripts, Docker entrypoints and workflow `run:` blocks. High-signal shapes: `--password` or positional credentials; `read` without silent input; `set -x` while a secret variable exists; credentials in URLs; `curl -v` or CLIs taking a credential on the command line; secrets in workflow YAML or Docker `ARG`/`ENV`; a safe parent passing a secret to a child in argv. Severity: Catastrophic when a real production secret can leak; High for a staging credential or an unsafe convention on a credential path; Medium when no safe path exists; Low when only help text encourages it.

#### 4.4.42 Deploy-time asset availability (runtime path not shipped)

The Dockerfiles copy a subset of the tree, not the whole repo. `scripts/ci/check_runtime_data_paths_copied.sh` is the deterministic gate; sweep for what it cannot see. Enumerate every runtime filesystem read in `src/`, resolve it as the container would (`/app/dist`, `process.cwd()` is `/app`), and confirm a matching `COPY`. `exploration/` and `legacy_data/` reads are the usual offenders. A service that returns empty when its data file is missing hides this bug: Medium for a silent feature break, High when the surface is security- or privacy-relevant.

#### 4.4.43 Infrastructure-as-code security and gate integrity

IAM wildcard actions or resources and missing scope-down; bucket public-access posture, CloudFront origin access and cache policy for authenticated paths, missing `prevent_destroy` on the snapshots bucket; Lightsail port openings against the documented front door; SSM parameter types, KMS key policy breadth, real values in `*.tfvars` (each tree's values file is a symlink into the private checkout; a real file there is the finding), tracked plan or state artifacts; staging-versus-production module drift beyond the accepted differences. Systemd units under `ops/` count as infra for exposure; their logic is 4.4.44.

#### 4.4.44 Operational script and systemd correctness

Complements 4.4.40, which is credentials-only. Destructive scripts guard with explicit target confirmation, refusal against production and refuse-on-unexpected-state checks; a destructive path reachable without its guard is High or above. Missing `set -euo pipefail`, unquoted expansions, `cd` without a check before a destructive step, pipelines masking exits; temp files and remote artifacts not cleaned on a trap; remote halves quoting locally expanded variables wrongly; non-idempotent re-runs; timers whose cadence stops matching the documented recovery objective.

#### 4.4.45 Client-side JavaScript defects

`src/public/js/**` is deployed surface. DOM XSS through `innerHTML` or attribute injection fed by user content; CSP compliance; every fetch or form-augmentation target resolving to a real route with the expected gates; progressive enhancement where the view-layer rule requires a no-JS path; no tokens or private data in storage or the console.

#### 4.4.46 Static accessibility

A WCAG 2.1 AA gate is in the go-live index. Template-level defects: images without meaningful `alt`, inputs without labels, missing `lang`, heading-order jumps, landmark-less shells, color-only state, focus traps. Live axe runs stay with the browser spec.

#### 4.4.47 Performance and capacity defects (narrow)

A hot per-request query with no supporting index; N+1 render patterns on a list the page always renders; unbounded result sets on deployed routes; synchronous heavy work on the request path. Never micro-optimizations or anything without a concrete deployed path and plausible volume.

#### 4.4.48 Claude-harness guard defects

`.claude/` is production configuration. Harness defects are discrepancy-lane findings (SKILL.md), and the vendor-guidance review is the `update-config` skill's, not this one's. Dedup against `scripts/ci/assert_claude_harness.sh` first: never re-report what it pins.

- Subagent-safety mirroring: every statically expressible guard a hook enforces has a `permissions.deny`/`ask` twin in `.claude/settings.json`; a destructive-class guard with no twin is a finding.
- Hook bypass: each guard against command and process substitution, redirection, pipes, `xargs`, quoting, multiline input, compound commands and globs; a bypass is High. A fail-open where it should fail closed.
- A rule or skill clause the design contradicts, or the guide describing behavior the config no longer has: cite both sides and name which looks wrong.

#### 4.4.49 Member-state combinations never seeded

The largest escape class in the bug record. A sender, listing, counter, search or gate decides on a member state (deceased, soft-deleted, purged, unverified, bounced, complained, under-tier, Hall of Fame, historical-only) and a path forgets one, or a combination (purged and also soft-deleted; deceased and bounced). For each path that mails, lists, counts or gates members, enumerate the states the design excludes and construct the request with each state; the registration notice, the contact-request reply and the takedown notice have each failed this way. The shared fixture `tests/fixtures/memberStates.ts` names the states; a path whose exclusion is decided by a join on bare `members` rather than the canonical view is the usual shape.

#### 4.4.50 Failure partway through a multi-step operation

A step commits, a later step (a send, a provider call, a second write, a file move) fails, and the result is lost, doubled or reported done. Trace every operation with more than one effect: where is the transaction boundary, what runs after commit, what happens when the post-commit step throws. The KMS-failure pattern in Cross-cutting observations is the archetype. Operator scripts have the same class: a run interrupted after a remote write and before its cleanup or its report.

#### 4.4.51 Paired lists held together by nothing

Two lists that must agree, maintained independently: fields a parser reads and a save clears, jobs a gate waits for and its verdict reads, states a view filters and a sender excludes, a static sitemap list and the public route table, the deploy's include list and the paths the code reads. Find each pair, derive one side from the other, and diff. A difference is a finding against whichever side the design says is derived.

#### 4.4.52 Real data shapes the code never met

A story that reads migrated data was built against one idealised record. For each such path (claim, club affiliation, trick pages, event results, honours), query the built database read-only for the distinct shapes it holds (a club the old site never made real; a USA or Canada club with no recorded state; a name only from the mirror; a trick with no notation; a slug collision) and drive the path with each. The shape that returns a 500 or an empty page is the finding; a factory that sets by hand a column the pipeline leaves empty is the usual cause and is reported beside it.

#### 4.4.53 GET purity, double submit and the clock

- GET purity: a GET that changes a row, enqueues, sends or counts against a limit, other than the three dev persona routes. Reproduce by reading SQLite's change counter around the request.
- Double submit: a state-changing form on a covered path (an email link, a checkout or payment start, an outward send) submitted twice reports the first outcome and leaves domain, audit, outbox and rate-limit counts unchanged; an own-repeat must not be confused with another actor's act.
- Clock: a stored marker read with "in effect now" semantics where the design stores a form, or the reverse; a comparison that flips meaning once the wall clock passes an absolute date; a grace window computed in local time against SQLite's UTC clock.

#### 4.4.54 Layout and usability defects (the UI/UX lane)

Found by driving the dev stack with the Playwright MCP tools, never by screenshot. Budget: one `browser_evaluate` call per page per viewport, one `browser_snapshot` per page per viewport, and no screenshot unless the maintainer names a specific page.

- **Page list.** Template-deduplicated: one page per template, admin pages as the admin persona, signed in through `GET /dev/switch?as=<slug>`. Start from the page arrays in `tests/e2e/accessibility.spec.ts` and `tests/e2e/accessibility-authenticated.spec.ts`, adding any deployed template they miss.
- **Per page, per viewport** (`browser_resize` to 390x844, then 1280x800): take the accessibility snapshot for structure, landmarks, labels and reading order, then run one measurement script that returns JSON with: `document.documentElement.scrollWidth > clientWidth` and the innermost offending element (the culprit walk in `tests/e2e/mobile-viewport.spec.ts`, which names the innermost elements past the edge; reuse it, do not restate it); elements whose bounding box leaves the viewport; tap targets under 44px at 390px; text under 12px; prose wider than 55.5ch at 1280px; headings whose computed size is not larger than body text; text contrast against the real composited background below 4.5:1; fieldsets with a visible border; elements hidden by intent (`hidden`, `aria-hidden`, zero height) that still paint; form fields with no associated label; tables wider than their container at 1280px. Collect console errors and CSP violations from `browser_console_messages` after each load.
- **Across viewports.** Diff the two snapshots for content that vanishes or duplicates between widths (a navigation rendered twice, a heading lost on the phone layout).
- **A finding** carries the page route, the viewport, the offending selector and the measured number; a snapshot impression without a number is a Lead. Severity from what a visitor hits: a horizontal scroll or unreachable control at 390px is Medium, an unlabeled form field is Medium, a contrast or size miss is Low unless it hides the page's primary action.
- Hand-offs: a page class the axe spec never renders goes to `write-tests`; an element that fails because the service shaped it wrong is an implementation finding under its own class.

### 4.4B Design-pattern divergence and hygiene (secondary sweep)

A separate, lower-priority sweep after 4.4, with its own `BUGS.md` group. Most findings are Low or Medium; escalate to High only when the divergence produces a behavioral or security failure (a template branching on a raw `role` that exposes an admin control). Ground every finding in the canonical pattern it violates: `.claude/rules/{controller-conventions,template-conventions,view-layer,service-layer,db-layer}.md` or the service file-header JSDoc, and cite it.

The drift direction is not always code-violates-rule. A rule or skill clause whose stated behavior or identifier the code has outgrown is itself a divergence finding. For every behavior or identifier a change moved, grep `.claude/rules/*` and `.claude/skills/*` for the superseded term; a stale sentence buried in a current rule drifts silently.

#### 4.4B.1 Controller-layer divergence

Business rules, validation or tier lookups in a controller; a controller mutating service output instead of passing the `PageViewModel` through; hand-rolled URLs or labels; direct `res.cookie()` outside the `sessionCookie`/`flashCookie` helpers (logout's `clearCookie` is the one exception).

#### 4.4B.2 Template-layer divergence (logic in views)

Branching on raw domain codes (`eq member.role 'admin'`) instead of a pre-shaped boolean; deriving a label from an enum; multi-variable URL construction in an `href`; inline `style`, `<script>` (other than the JSON data island), or `on*=` handlers; nested `<form>`; any value the template computed that the service should have supplied.

#### 4.4B.3 Service-contract divergence

A public-page method not returning `Promise<PageViewModel<T>>` or not named `get<Page>Page()`; business logic duplicated from another service (tier status, Active Player status, member search); a bare `throw new Error` in normal control flow or a `ServiceError` mapping to the wrong status; a boolean where the contract is a discriminated union; a hardcoded operational value instead of `readIntConfig`; a factory with no injected dependencies or a singleton holding mutable state.

#### 4.4B.4 DB-layer divergence

`db.prepare()` or raw SQL outside `src/db/db.ts`; named parameters; `datetime('now')` instead of the canonical ISO form; a bare `WHERE` where a canonical view encodes the filter; business rules or non-lazy compilation in `db.ts`; a write path that does not stamp the metadata columns.

#### 4.4B.5 Cross-layer leak

`process.env` outside `src/config/env.ts`; AWS SDK or Stripe imports outside `src/adapters/`; `fs` writes in services bypassing the MediaStorageAdapter; hardcoded URLs.

#### 4.4B.6 Stale comment and deviation-marker defects

A comment or JSDoc that describes behavior the code no longer has is a finding: it steers the next reader wrong, and it is read as code-against-doc discrepancy with the divergent line cited. A deviation comment missing its `Current:`/`Target:` lines or not self-contained is a finding. A comment naming a filesystem path the code might also read at runtime (`exploration/`, `legacy_data/`, `curated/`) is checked under 4.4.42. The mechanical detectors (doc paths and section shorthands in comments, sprint and date markers, console logging, em-dash scope) belong to the `doc-sync` skill's full-audit mode and are not run here.

#### 4.4B.8 Service JSDoc contract consistency sweep

Service JSDoc is a contract reader for future maintainers and agents; stale or missing JSDoc causes future defects. For every `src/services/*.ts` file, inspect the file-header JSDoc against the implementation and `service-layer.md`: presence on every write-path service (identity, membership, payments, voting, active-player, member, event, club, media, curator; judge by what the service does); purpose and ownership boundary; exported methods, return shapes, unions, nullability and thrown `ServiceError` types; side effects (writes, audit rows, outbox, work queue, storage, payment, token effects); security and privacy invariants it owns; the transaction boundary and post-commit effects; singleton versus factory shape. Report under Design-divergence and hygiene unless the wrong text masks a security or correctness failure, in which case the failure is the finding and the drift its evidence.

## Cross-cutting observations

1. KMS-failure pattern applies to any signing-dependent recovery path. If `signJwt` throws between a DB commit and the cookie issuance, the user is locked out of every session with no working cookie; recovery must route to a separate JWT-issuing flow (password reset). Copy the pattern to every new signing surface, and treat it as the archetype of 4.4.50.
2. Anti-enumeration assertion shape is reusable: exists and not-exists responses compared whole after `tests/fixtures/normalizeAntiEnumerationBody.ts`, never by a length ratio, which a one-word leak passes. A length-tolerance comparison anywhere is a finding.

## External security calibration references

Calibration lenses for what classes to look for, never a compliance exercise, and no browsing unless the kickoff asks: OWASP Secure Code Review and ASVS (the mental checklist for auth, session, access control, validation, cryptography, logging, data protection, business logic, files, configuration); OWASP WSTG (the outside-in companion; the hunt stays static unless runtime testing is authorized); MITRE CWE Top 25 (the final sanity check); OWASP Secrets Management and Logging guidance (hardcoded secrets, transport, redaction). These never override project rules; they prevent blind spots.

## High-signal static search recipes

Accelerators, never substitutes for reading the call path. A grep hit alone is never a finding; trace `request input -> controller -> service -> DB/adapters/templates -> response/audit/outbox`.

```bash
# Routes, auth gates, limiters
rg -n "router\.(get|post|put|patch|delete)|requireAuth|requireAdmin|requireTier1Benefits|requireOriginPin|rateLimitHit" src/
# Redirects, cookies, headers
rg -n "res\.redirect|res\.cookie|clearCookie|setHeader\(|Cache-Control|Content-Security-Policy" src/
# SQL, transactions, ledger writes
rg -n "db\.prepare|transaction\(|await .*transaction|UPDATE audit_entries|DELETE FROM audit_entries|UPDATE member_tier_grants" src/
# Template escaping and logic in views
rg -n "\{\{\{|<script|on[a-zA-Z]+=\"|style=\"|eq .*role|eq .*tier" src/views/
# Secrets and PII in code and logs
rg -n "password|token|secret|api[_-]?key|metadata_json|logger\.|redact|private[_-]?key|AKIA|sk_live|whsec|dob|birth|phone|address" src/ scripts/ --glob '!node_modules' --glob '!dist'
# Member-state joins that skip the canonical views (4.4.49)
rg -n "FROM members\b|JOIN members\b" src/db/db.ts
# Outbound requests, shell and path hazards
rg -n "fetch\(|axios|got\(|https?\.request|child_process|exec\(|spawn\(|readFile|writeFile|\.\.\/" src/
# Runtime reads versus shipped image (4.4.42)
rg -n "readFileSync|readdirSync|existsSync|resolve\(|path\.join\(" src/ | rg -n "exploration|legacy_data|curated|\.csv|\.json|process\.cwd"
rg -n "^COPY" docker/*/Dockerfile
# Infrastructure posture (4.4.43) and operational scripts (4.4.44)
rg -n "\\*|AdministratorAccess|0\.0\.0\.0/0|prevent_destroy|SecureString" terraform/ --glob '*.tf'
rg -n "set -e|pipefail|trap |rm -rf|DELETE FROM|--force" scripts/ --glob '*.sh'
# Client-side JS (4.4.45)
rg -n "innerHTML|insertAdjacentHTML|eval\(|localStorage|sessionStorage|fetch\(" src/public/js/
```
