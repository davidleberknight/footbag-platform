---
name: bug-hunt
disable-model-invocation: true
description: Run a disciplined adversarial bug hunt over the footbag-platform repository - a static code-and-design security/correctness review that re-derives the deployed surface, checks deployed user stories against their success criteria, refutes every candidate finding, and records verified findings in BUGS.md at the repo root. Invoke ONLY when the user explicitly asks for a "bug hunt" or "bug sweep" by name. Do NOT infer it from "adversarial review", "security pass", "review the code", or similar - those mean a general findings-only review done in plan mode, not this skill. Not a testing strategy and not browser QA.
---

# Bug Hunt — Claude Code bug-hunting prompt and static security/design review guide

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a "bug hunt" or "bug sweep" by name. Do NOT infer it from "adversarial review", "security pass", "review the code/design", or any general review phrasing — those mean a general findings-only review done in plan mode, not this full-surface BUGS.md-writing sweep. When in doubt, ask before invoking.

This skill is the standing prompt for running a disciplined Claude Code bug hunt against the footbag-platform repository. It is a static, code-and-design review guide: it complements `docs/TESTING.md`, but it is not the testing strategy and not a browser QA plan. It is invoked when there is reason to believe new defects may have been introduced, when a feature area has never had an adversarial review, or when user-story/documentation drift may have created hidden implementation bugs.

Findings from a sweep are recorded in `BUGS.md` (repo root) and removed once the code fix lands; the working code is authoritative. Do not record closures, dates, or `RESOLVED` markers.

The core job is broader than "find syntax bugs." A bug may be:
- code that fails a deployed user story's success criteria;
- code that satisfies a flawed or incomplete user story but violates the platform goal or documented domain model;
- a security weakness visible only from data flow, authorization flow, state-transition, or threat-model review;
- a design/documentation bug where the design source of truth is ambiguous, internally inconsistent, or missing a control that the deployed code clearly needs.


## 0. Scope, constraints, and how to use this file

### 0.0 Prompt contract for Claude Code

When an AI agent runs this file, treat it as a prompt with explicit role, success criteria, process, and output constraints.

**Role:** act as a white-hat adversarial reviewer for this repository. Think like a careful maintainer, security engineer, domain analyst, and hostile user trying to find real defects before production does.

**Objective:** produce a verified `BUGS.md` findings report covering deployed code, deployed user stories, implemented technical features, and design-level gaps that can cause real behavior, security, privacy, data-integrity, or operations failures.

**Success criteria for the bug hunt itself:**
- The deployed route/service surface has been re-derived from the repo, not blindly trusted from this file.
- Every implemented or partially implemented user story in scope has been classified and mapped to the code that implements it.
- For completed user stories, all success criteria have been checked against code behavior.
- Security findings are grounded in concrete data flow, control flow, state transition, or configuration evidence.
- Each finding has been actively refuted before being recorded.
- Security/correctness findings receive an independent adversarial second pass.
- Every service file's JSDoc and service-contract comments have been checked for clarity, accuracy, consistency, and usefulness against the implementation.
- The repo's deterministic verification surface has been reviewed: missing obvious CI/pre-commit/pre-merge checks are treated as bugs because automation should catch repeatable classes of defects before the agent or maintainer sees them.
- The script credential-handling convention has been re-derived from the existing safe scripts and checked across every script, package command, workflow, and helper that can receive or transport a password, token, key, or credential.
- Secrets, passwords, tokens, and PII have been reviewed across source, scripts, tests, fixtures, logs, audit metadata, exports, templates, generated artifacts, and CI/CD outputs; missing deterministic leak checks are recorded as bugs.
- The rendered clickable surface has been considered: every link, form action, and button-triggered navigation should have a deterministic route-wiring/smoke check that proves it resolves to an intentional route and does not 500.
- Ambiguous requirement/design discrepancies are not guessed; ask one excellent maintainer question at a time.
- The output is actionable, minimal, and restricted to `BUGS.md`.
- A coverage ledger lists every deployed controller, service, middleware, adapter, shared lib, and template with a read / not-read mark and (for not-read) an explicit reason; the sweep is not complete while any security-relevant surface is unread.
- The sweep looped to dryness: it records the pass count and confirms the final two passes surfaced no new candidate.

**Non-goals:** do not run a browser QA pass, do not redesign the application, do not write fixes, do not create a test plan, and do not record speculative issues as bugs.

**Operating rule for uncertainty:** when code and user stories disagree, do not assume the user story is right. The bug may be in the code, the user story, the service JSDoc, the view-layer rule, the migration plan, or the prompt. Step back and reason from the platform goal, domain invariants, deployed route behavior, and source-of-truth order. If a human decision is required, ask exactly one question with enough context for the maintainer to answer.

### 0.1 Read order by role

- **Maintainer or AI agent picking the next task**: read `BUGS.md` (verified findings awaiting remediation), §3 (open remediation items), and §5 (testing-improvement punch list). Pick the highest-leverage item that fits the current slice.
- **AI agent running a fresh bug hunt**: §4 carries the brief; outstanding findings live in `BUGS.md`, and the §4.5 step-0 audit of that file is mandatory before any edit to it. Re-run when there is reason to believe new defects may have been introduced.

### 0.2 Audit-wide scope filters (apply to every section)

Hard gate: before any finding is recorded, build the in-scope inventory from the repository (per §1.1) into scratch notes. A run that has not produced this inventory has not established scope and must not record findings yet. Any apparent gap between a documented story and the deployed code is investigated to resolution from the code, never assumed.

- **Deployed-only**. A user story is "deployed" if at least one HTTP route in `src/routes/*.ts` (mounted by `src/app.ts`) serves it, or if a service-only call site is invoked at runtime.
- **Everything deployed is in scope by default.** Per-run exclusions come only from the prompt that kicks off the hunt; record any such exclusion in the `BUGS.md` scope note so a later run knows what was skipped.
- **CAPTCHA AC out of scope**. Turnstile is project-level deferred. Missing-CAPTCHA AC are `unimplemented (by design)`.
- **`legacy_data/` pipeline is the one standing exception**: its Python code, scripts, and CSV artifacts are out of scope unless the kickoff prompt explicitly includes them. Its documented deviations are tracked in `IMPLEMENTATION_PLAN.md`. Legacy *migrated data* shaping the deployed surface (claim flow, auto-link, historical-person joins) IS in scope where it manifests in deployed routes.
- **No tests for code that has not yet been written.** Tests in scope: currently deployed user stories + technical features already in code (adapter parity, dev-only scaffolding (testkit persona harness + dev-bootstrap), migrated legacy data, security helpers, audit-ledger, outbox, idempotency-key handling, anti-enumeration surfaces). Stripe payments, EO_* / CL_* / future M_* / not-yet-implemented A_* stories are excluded from the testing-improvement punch list.

### 0.3 Hard constraints inherited from the project

- Findings-only when executing the §4 bug-hunt brief specifically (no code edits during that session). Closing items from §3 / §5 is normal slice work; code edits are expected.
- One question per turn when blocked. Read-only investigation (git reads, DB SELECTs, file listings, `--help`, compile-checks) is standing pre-approved policy and needs no permission.
- Never stage, commit, push, or pull — enforced by permissions and hooks. The maintainer owns git.
- **Do not track done work in this document or in `BUGS.md`.** Resolved findings, landed remediations, and fixed bugs are removed from §3 and `BUGS.md` once the code edit lands; the working code is authoritative. No "RESOLVED", "DONE", "FIXED in commit X" entries — they accumulate as noise and contradict the §3 / §4.7 convention. Applies to AI agents and human maintainers equally.
- No emojis in this file or in derived findings files.

---

## 1. Scope filter

### 1.0 Mandatory up-front deployed-story traceability pass

Before the security sweep, create a scratch-only traceability matrix. Do not commit it and do not write it to the repo unless the kickoff prompt explicitly asks. Use it to decide what is in scope and to avoid false positives.

For each user story in `docs/USER_STORIES.md`, and any deployed freestyle/payment/technical feature without a clean user-story id, classify it using the taxonomy in the deployed-surface enumeration rule (`.claude/rules/deployed-surface.md`).

For every **Complete and deployed** story, verify every success criterion against code. A failure is a bug. For every **Partial and deployed** story, verify that the unimplemented criteria are explicitly accepted deviations; otherwise record a requirements/design discrepancy or ask the maintainer one question.

Use this scratch format:

```markdown
| Story / feature | Deployed evidence | Success criteria checked | Classification | Bug candidates | Human question needed? |
|---|---|---|---|---|---|
| M_Example | route + controller + service | A1-A5 | Complete and deployed | B? or none | no |
```

**Discrepancy rule:** if code and user story disagree, first determine whether the code violates a clear requirement, the requirement is stale/incomplete, or the domain intent is unclear. Do not record a severity finding until this is clear. If blocked, ask one question using this exact shape (per `.claude/rules/asking.md`: plain self-contained English, no internal codes; the recommended answer is the default a bare "y" accepts):

```markdown
Question: <one decision needed, self-contained>
Context: <where the code and documents disagree; name the file and doc lines>
Why this matters: <what bug/security/design outcome depends on the answer>
Recommended answer: <your recommendation and why; this is the default a bare "y" accepts>
Alternatives: <only the realistic alternatives, when genuinely open>
```

Do not batch questions. Ask the highest-leverage blocking question first, then continue after the maintainer answers.

### 1.1 Derive the deployed surface (every run)

Build the in-scope surface from the repository on every run, before scoping, following the deployed-surface enumeration rule (`.claude/rules/deployed-surface.md`): derive the deployed surface fresh from `src/app.ts` and `src/routes/**`; carry no embedded story inventory, since it drifts and silently scopes the hunt wrong. Scoping notes specific to a route/integration hunt:

- A story is in scope when a deployed route reaches its behavior. A story with no route, or only a service with no HTTP path, is out of scope for a route/integration hunt; note it and move on.
- Record partial deployments (a route covering only some success criteria) and adapter stubs (a throwing payment or SES adapter) as you find them, since they bound what the hunt can exercise.

Hold the derived surface in this run's scratch notes only; never write it back into this skill.

---

## 2. Cross-cutting observations (load-bearing, applies to multiple sections below)

Patterns that recur across multiple sites. Useful to scan once before per-file work.

1. **Status-only assertions on static surfaces** (`expect(res.status).toBe(200)`). The five public static routes (`/sideline`, `/hof`, `/bap`, `/legal`, `/ifpa`) now carry a body assertion on the happy path, so a regression to an empty or wrong template breaks the test. Remaining: loose patches of freestyle browse-view tests may still be status-only; audit them for the same gap. The fix is small (one body assertion per route) but spread across many files.

2. **KMS-failure pattern applies to any signing-dependent recovery path.** The pattern: if `signJwt` throws between a DB commit and the cookie issuance, the user is locked out of all sessions with no working cookie. Recovery must route to a separate JWT-issuing flow (password reset). When future signing surfaces land, copy this pattern.

3. **Anti-enumeration assertion shape is reusable.** `security.anti-enumeration.test.ts` uses status-equality + length-ratio (0.95-1.05). The same shape applies to any new surface where exists/not-exists must be indistinguishable (Stripe Checkout for unknown vs known customer; legacy mass-claim lookup; future contact-finder). Helper is reusable as-is; no refactor needed when future enumeration-sensitive surfaces arrive.

---

## 3. Remediation snapshot

Open remediation items. Landed items are not listed here; the working code is authoritative. Cross-check `src/` before adding any new finding.

No open remediation items.

---

## 4. Bug-hunt brief

This section is invoked when there is reason to believe new defects may have been introduced (large refactor, area you haven't audited before, post-incident sweep). It is not a recurring task. Output is a findings-only report written to `BUGS.md`.

### 4.0 Outstanding findings

Outstanding findings live in `BUGS.md` (repo root). Record findings there when a sweep surfaces defects, grouped by severity per §4.6 (security/correctness severity sections first, design-divergence and hygiene in a dedicated trailing group); the running ID sequence continues from the last retired finding. Remove each finding once its fix lands.

### 4.1 Your job in one paragraph

Read deployed controllers, services, middleware, adapters, templates, schema-facing DB statements, service JSDoc/contracts, deterministic CI/CD guardrails, and relevant design/user-story documents. Find real bugs: logic errors, user-story success-criteria mismatches, design-source drift, error-handling holes, race conditions, auth/authorization gate misses, anti-enumeration leaks, transaction-boundary violations, cookie/cache-control regressions, dev-shortcut leaks, swallow-the-error patterns that hide security-critical signals, privacy leaks, business-logic abuse paths, payment/tier integrity failures, file/media boundary failures, service documentation drift, missing cheap automated checks, clickable-route miswiring, supply-chain/configuration mistakes visible in repo, and any other latent defect a future production incident could surface. Write findings to `BUGS.md`, grouped by severity, one row per bug with file:line, reproduction, and suggested fix. `BUGS.md` is the single findings file; do not create others. Every finding you record must be a verified real bug, held to the same rigor you apply to a deployed story's success criteria and pushed to the level that would surface a false positive. Do not stop at positive evidence: after demonstrating the failure path, actively try to prove the finding FALSE. Test the counterfactual the finding implies, not just its one obvious consumer — for a "does X wrong" claim, that the reachable path actually does X wrong; for a "dead / unused / matches-nothing / removable" claim, that deleting the code changes no observable behavior (trace every consumer AND every control-flow effect: middleware ordering, fall-through, the negative/absence path). Grep `tests/` for any test that pins the behavior the finding calls wrong or that the suggested fix would change; a passing test that contradicts the finding refutes it. Confirm the suggested fix is behavior-neutral except for the defect it removes. Security/correctness findings then get an independent adversarial second pass before they land. A suspicion that survives only as a suspicion goes to the `BUGS.md` Leads section under its narrow admission rule (§4.6), never into the severity sections. Ambiguous requirement/design discrepancies are resolved by one maintainer question at a time, with a recommended answer. The maintainer reviews each finding and gates remediation per finding. After the security/correctness sweep, run the §4.4B design/hygiene sweep (layering divergence, comment + JSDoc drift, test-code rule violations) and report those findings in the dedicated design-divergence group in `BUGS.md`.

### 4.2 Hard constraints (already stated in §0; re-stated here so a fresh agent doesn't miss them)

- **Findings-only**. No code edits. No test edits. No git commits. No git pushes. The only doc write allowed is writing findings to `BUGS.md`.
- **Audit before edit**. The §4.5 step-0 audit of `BUGS.md` (re-verify every existing entry) is mandatory before any write to that file.
- **Scope = currently deployed code in `src/`** per §1 deployed-US inventory.
- **Skip CAPTCHA AC; skip the `legacy_data/` pipeline unless the kickoff prompt includes it** per §0.2. Honor any per-run exclusions from the kickoff prompt and record them in the `BUGS.md` scope note.
- **One question per turn** if you need to ask the maintainer something. Questions follow `.claude/rules/asking.md`: resolve from the source-of-truth order first, one self-contained question in plain words with a recommended answer, no codes the maintainer was not given (a `BUGS.md` finding ID is fine — it is shared).
- **Breadth fan-out is encouraged; verification stays central.** Trivial lookups stay in the main session. For coverage, controlled read-only sub-agents may sweep one surface or bug-class each in parallel, but every candidate they surface is re-verified against the cited lines in the main session before it is recorded: a sub-agent conclusion is a lead, never a finding. Security/correctness survivors still get the main-session adversarial second pass.
- **Concise communication**. No filler, no preamble, no emojis.
- **No backwards-compat hacks**. If you find dead code, deletable shims, or unused exports, flag them under "low severity" but do not propose elaborate migration plans.
- **No diagnose-and-remediate-in-one-step**. Diagnose. Report. Wait for the maintainer to gate per-finding remediation in a separate slice.
- **Never commit** even if findings seem ready to act on.
- **Use AskUserQuestion only when blocked** — if the answer to "should I check X?" is obviously yes, just do it.

### 4.3 Mandatory pre-reads (in this order)

Before scanning any source file, load these into context:

1. This document (you are reading it). §1 is your scope filter, §3 is what NOT to re-flag, §4.4 is the bug-category framework.
2. `CLAUDE.md` — project-wide rules + source-of-truth order.
3. `docs/TESTING.md` §15.2 strategic anti-patterns.
4. `IMPLEMENTATION_PLAN.md` — the accepted-deviation blocks. A behavior that looks like a bug may be an explicitly documented deviation; cross-check before flagging. The legacy-pipeline deviations recorded there are mandatory to check even though the `legacy_data/` pipeline itself is out of scope, because they can surface in deployed routes.
5. **All path-scoped rules in `.claude/rules/*.md`** (the full set: `testing`, `service-layer`, `controller-conventions`, `template-conventions`, `view-layer`, `db-layer`, `db-write-safety`, `adapter-conventions`, `comments`, `doc-governance`, `memory`) and the relevant `.claude/skills/*` procedures — the operational rules and workflows every finding must respect (the layer-boundary rules are the canonical patterns the §4.4B design-divergence sweep checks against).
6. `docs/DATA_GOVERNANCE.md` (mandatory before any finding that touches members, historical persons, search, contact fields, exports, stats, or privacy boundaries).
7. The IFPA governing documents (`ifpa/IFPAMembershipStructure_2026.md`, `ifpa/BYLAWS.md`, `ifpa/ArticlesOfIncorporation.md`, `ifpa/rules/**`) — mandatory before any finding whose success criterion concerns membership tiers, Active Player status, voting eligibility, or published rules content. They are the authority of record for what that criterion must be, and `docs/USER_STORIES.md` defers to them; a success criterion that contradicts them is a finding against the criterion, not against the governing document.

The user-scope project memory (`MEMORY.md`) autoloads. Respect every behavioral rule documented there.

### 4.3A External security calibration references

Do not turn this into a compliance exercise, and do not browse unless the kickoff prompt explicitly asks. Use the following public standards as calibration lenses for what classes of bugs to look for:

- **OWASP Secure Code Review Guide / Cheat Sheet:** manual review should inspect application logic, data flow, and implementation details that automated tools miss.
- **OWASP ASVS:** use as the mental checklist for authentication, session management, access control, validation/encoding, cryptography, error handling/logging, data protection, communications, business logic, file/resources, API, and configuration verification.
- **OWASP WSTG:** use as the adversarial "how would this be tested from outside?" companion, but keep this bug hunt static unless the prompt authorizes runtime testing.
- **NIST SSDF SP 800-218:** verify that source review and executable/security checks are traceable to secure-development practices, especially code review, threat modeling, dependency/configuration review, and vulnerability response readiness.
- **CISA Secure by Design:** favor findings that eliminate whole vulnerability classes or unsafe defaults, not just individual symptoms.
- **MITRE CWE Top 25:** use as a final sanity check for high-frequency weakness classes: XSS, SQL injection, CSRF, missing/incorrect authorization, path traversal, command/code injection, unrestricted upload, deserialization, sensitive information exposure, missing authentication, SSRF, user-controlled key authorization bypass, and resource exhaustion.
- **OWASP CI/CD Security Cheat Sheet and DevSecOps guidance:** use as the automation lens for SAST, DAST, dependency/SCA, IaC/container, secrets, pipeline-permission, and workflow-tampering checks.
- **OWASP Secrets Management and Logging guidance:** use as the calibration lens for hardcoded secrets, secret transport, redaction, password handling, and avoiding sensitive data in logs, diagnostics, artifacts, and audit metadata.
- **GitHub CodeQL/code scanning, secret scanning, push protection, and dependency-review guidance:** use as the repo-native baseline for pull-request security annotations, semantic vulnerability scanning, blocking committed secrets, and dependency risk review.
- **OpenSSF Scorecard / SCM best practices:** use as the repository-health and supply-chain lens for branch protection, pinned actions, token permissions, maintainer permissions, dependency update hygiene, and risky workflow patterns.

These references do not override project rules. They help prevent blind spots.

### 4.4 Bug categories — what you're hunting for

Organize the primary (security/correctness) sweep around the expanded categories in §4.4.1-§4.4.42. Each one names the typical site, the specific pattern, and an example signal. After the primary sweep, run the secondary design/hygiene sweep in §4.4B (controller/template/service/db divergence, cross-layer leaks, comment + JSDoc drift, test-code rule violations) and report its findings in the dedicated `BUGS.md` design-divergence group.

The full category catalog is in `REFERENCE.md`: the primary security/correctness categories (§4.4.1–§4.4.42), each naming its typical site, pattern, and example signal, and the secondary design-pattern-divergence and hygiene sweep (§4.4B, with §4.4B.1–§4.4B.8). The methodology below refers to these category numbers; read the relevant category in `REFERENCE.md` before sweeping for it.

### 4.5 Methodology — step by step

0. **Audit `BUGS.md` before touching it** (run it after the §4.3 pre-reads, before any write). Re-verify every existing entry against current code: re-resolve each file:line, confirm the bug still exists, correct drifted line numbers, and delete entries whose fix has landed. Re-check that each Leads item still awaits its confirm/refute step. Only after this audit may the sweep write anything to the file.
1. **Load the mandatory pre-reads** (§4.3). Establish the source-of-truth order and current accepted deviations.
2. **Rebuild the deployed surface from code**: sweep `src/app.ts`, `src/routes/*.ts`, service-only runtime call sites, worker/internal routes, mounted routers, and route-level middleware. This derived surface is the scope (per §1.1); any disagreement with a documented story is a signal to investigate, not an automatic finding.
3. **Build the scratch deployed-story traceability matrix** (§1.0). Classify each story/feature as complete, partial, technical-without-story, designed-not-deployed, future, or ambiguous. For complete/partial deployed stories, list the success criteria that must be checked.
4. **Run a quick threat-model pass** for the high-risk flows: login/session, register/verify/reset, legacy claim/auto-link/onboarding, member profile/media/gallery, clubs/groups where deployed, admin/curator, payments/webhooks, outbox/email, contact-admin, archive-boundary, and worker/internal IPC.
5. **Sweep `src/routes/*.ts` + `src/app.ts`** for route registrations. Build a mental map of which controller serves each route. Note which routes traverse `requireAuth`, `requireAdmin`, `requireTier1Benefits`, `requireOriginPin`, rate limits, body parsers, upload middleware, and any route-specific cache/header behavior. Any divergence from the expected gate pattern is a candidate finding.
6. **For each deployed-US controller method** (per §1 inventory and the traceability matrix, including `freestyleController`):
   - Read the controller body.
   - Read the service method(s) it calls.
   - Cross-check the path against §4.4.1-§4.4.39.
   - For each issue found, capture: file:line, the exact snippet, the bug class, the proposed minimal fix.
7. **Sweep `src/middleware/*.ts`** for auth, CSRF, rate-limit, cookie, and password-version-check logic. These are catastrophic-severity surfaces.
8. **Sweep `src/services/*.ts`** for the patterns in §4.4.13 (transactions), §4.4.14 (best-effort swallows), §4.4.15 (dev-shortcut reads outside `src/testkit/` / `src/dev-bootstrap/`), plus the service-contract patterns in §4.4B.8.
9. **Run the dedicated service-JSDoc consistency sweep** (§4.4B.8): compare every service file-header/exported-contract JSDoc to actual code, side effects, errors, transaction behavior, dependency shape, and security/privacy invariants.
10. **Sweep `src/adapters/*.ts`** for error-handling holes. Verify every adapter in `src/adapters/` has its error surfaces correctly classified at every call site.
11. **Sweep `src/lib/*.ts`** for shared helpers (cookies, flash, redactTokenPaths, externalLink, etc.). A bug in a helper is multiplied by every call site.
12. **Sweep `src/views/**/*.hbs`** (including `src/views/freestyle/**`) for `{{{ }}}` triple-stashes and any inline `<script>` (CSP forbids inline scripts; verify CSP nonces or hashes are correctly attached when present).
13. **Review deterministic verification coverage** (§4.4.38 and §5): inspect `package.json`, `scripts/`, `.github/workflows/` when present, CI scripts, test commands, lint/typecheck commands, security scanners, custom convention checkers, and repo-level gates. Record missing obvious checks as Testing and CI/CD verification gaps.
13a. **Cross-check runtime filesystem reads against the deploy image** (§4.4.42). List every `readFileSync` / `existsSync` / `readdirSync` and every `resolve(...)` / `path.join(...)` data-path construction in `src/`, resolve each to its in-container path, and confirm a matching `COPY` exists in `docker/web/Dockerfile` (and worker/image where relevant). Any read of a path no Dockerfile ships is a finding, especially when a missing-file fallback would mask it.
14. **Review clickable-route/form-target coverage** (§4.4.39): determine whether the repo has a deterministic rendered-link/form-action/button-navigation smoke test. If not, identify the deployed surfaces it should cover and record the gap.
15. **Secondary sweep: layering divergence** (§4.4B.1-§4.4B.5). Re-scan the controllers/services/templates/db already read against the canonical layer boundaries: business logic in controllers/templates, controller mutating service output, raw-enum branching in views, services duplicating other services' logic, hardcoded operational values, cross-layer leaks. Record under the `BUGS.md` design-divergence group.
16. **Secondary sweep: comment + JSDoc drift** (§4.4B.6), service-JSDoc consistency (§4.4B.8), and test-code rule violations (§4.4B.7) across the files read: stale/bogus comments, forbidden comment content, deviation comments missing `Current:`/`Target:`, service header/exported contract JSDoc that no longer matches the contract, committed-test rule breaks.
19. **Cross-check `src/` directly** (and the §3 table for explicitly-tracked actionable items) to confirm a finding has not already been remediated in code before flagging. Landed items are not tracked in §3; the code is authoritative.
20. **Self-verify** (§4.7) before writing to `BUGS.md`.

### 4.5A High-signal static search recipes

The high-signal static search recipes (route/auth greps, response/security helpers, SQL/DB convention, XSS/template, secrets/PII/tokens, script-credential handling, env/dev-shortcuts, SSRF/path hazards, uploads/media, payments, user-story traceability, service JSDoc, CI/CD surface, clickable routes, and deploy-asset reads) are in `REFERENCE.md`. Use them as accelerators, not substitutes for reading the call paths; keep results in scratch notes unless they become verified findings, and remember a grep hit alone is never a finding.

### 4.6 Output specification — exactly what to write

Single sink: `BUGS.md` at the repo root. Security/correctness findings (the §4.4 sweep) extend the severity sections (Catastrophic, High, Medium, Low; add a section only when it has findings). Design-divergence + hygiene findings (the §4.4B sweep) go in a dedicated **Design-divergence and hygiene** group, reported *after* the security severity sections so they never crowd out a catastrophic finding; within that group, order by severity. Deterministic automation, CI/CD, missing broad test harnesses, and clickable-route smoke-test gaps go in a dedicated **Testing and CI/CD verification gaps** group after design/hygiene unless they have already produced a concrete security/correctness failure. Bug IDs continue one running sequence (do not reuse a retired ID, do not split into a separate ID prefix); findings are grouped by report section, not by ID. No files other than `BUGS.md` are produced.

Per-finding structure:

```markdown
##### B<N> — <short title>

- **File:** `src/<path>.ts:<line>`
- **Class:** <one of §4.4.1-§4.4.39 or §4.4B.* categories>
- **Verification:** <how it was confirmed: call path traced and refutation attempted; adversarial second pass (required for security/correctness findings); mechanical re-check of quoted evidence (hygiene findings)>
- **Description:** <1-3 sentences explaining the bug>
- **Reproduction:** <concrete steps or a code citation showing the bug surfaces>
- **Impact:** <what fails / what leaks / who is affected>
- **Suggested fix:** <1-2 lines, not a full diff>
- **Existing test coverage:** <"covered by tests/X.test.ts"> | <"no test covers this">
```

Cross-cutting observations and static-analysis-cannot-verify limitations belong in §2 (Cross-cutting observations) and §6 (Known limitations) respectively, not duplicated in `BUGS.md`.

**Required fields per finding**: file:line, class, verification, description, reproduction, impact, suggested fix, existing test coverage.

**Requirement/design discrepancy handling:** if the issue is a verified documentation/design bug rather than a code bug, still use the same structure, but set `File:` to the governing doc line plus the code line that exposed the discrepancy when available, and set `Class:` to `§4.4.21 User-story success-criteria mismatch` or `§4.4.22 Design-level threat-model gaps`. If the discrepancy needs a maintainer decision, do not record it as a finding yet; ask one question in chat using the §1.0 question shape.

**Testing/CI gap handling:** if the issue is a missing deterministic guardrail, set `File:` to the closest place the guard should live (`package.json`, `.github/workflows/*`, `scripts/ci/*`, `docs/TESTING.md`, or the affected test directory). Set `Class:` to `§4.4.38 Deterministic automated-verification gaps`, `§4.4.39 Clickable-route, form-target, and navigation smoke-test gaps`, `§4.4.40 Script credential-handling and password-leak convention violations`, or `§4.4.41 Secrets, PII, and credential-leak automated-check gaps`. The reproduction should state the exact defect class the missing check would allow, not merely "add more tests."

**Leads (unverified).** `BUGS.md` ends with a `Leads (unverified)` section, the only place a suspicion may be recorded. Admission is narrow: record a lead ONLY when confirming it requires expensive deep verification or can only be tested on staging or production. Verify-first is the rule; ordinary uncertainty is resolved during the sweep, not parked, and speculative noise is never recorded anywhere. Leads carry no B-ID; each states the step that would confirm or refute it. When a lead is verified, promote it into a severity section under the next B-ID.

**Severity calibration** (per `docs/TESTING.md` §3):
- **Catastrophic**: identity compromise, broad PII leak, admin takeover, data loss, irreversible state corruption, auth bypass.
- **High**: role escalation, single-record privacy leak, unauthorized state mutation, anti-enumeration bypass, session theft, silent loss of security-critical notification.
- **Medium**: feature break visible to users, public-record display error, operational-role functionality break.
- **Low**: cosmetic, dead code, redundant guard, suboptimal error message.

### 4.7 Self-verification before delivering

Run these checks. Fix the report (or your scan) if any fail.

1. **Scope filter held + both plans' deviations cross-checked**: zero findings against the `legacy_data/` pipeline unless the kickoff prompt included it (migrated data surfacing in deployed routes is fine); any per-run exclusions from the kickoff prompt were honored and recorded in the `BUGS.md` scope note. Every deployed-route finding was cross-checked against the accepted-deviation blocks of `IMPLEMENTATION_PLAN.md`; a behavior already recorded there as a documented deviation is not flagged.
2. **No CAPTCHA findings**: zero findings of the shape "this route lacks Turnstile" — that's `unimplemented (by design)`, not a bug.
3. **Cross-check `src/` directly to confirm a finding has not already been remediated in code** before flagging. The §3 table lists only remaining actionable items; landed items are absent because done work is not tracked here.
4. **Per-finding citations**: every file:line cited must still resolve to the claimed code today. Spot-check 3 random "catastrophic" or "high" findings by re-opening the file and confirming.
5. **Suggested fixes are minimal**: each fix is 1-2 lines, not a refactor. If a finding genuinely requires a larger change (e.g. transaction restructuring), flag it as "remediation requires design discussion" and stop short of drafting the plan.
6. **No emojis** in the report.
7. **No dates / "as of today" / sprint tracking** in the report. Bugs are timeless statements about the code as it exists.
8. **No git operations**, no test runs that mutate state, no AWS calls.
9. **Pre-edit audit ran**: every pre-existing `BUGS.md` entry was re-verified against current code (or removed) before any new finding was written.
10. **No guesses recorded as findings**: every finding carries its `Verification:` line and was actually verified; anything not fully verified sits in Leads only if it meets the narrow admission rule (expensive deep verification, or staging/prod-only testability), otherwise it is dropped.
11. **Traceability pass ran**: deployed user stories and deployed technical features were classified, and completed/partial stories were checked against success criteria.
12. **External security sanity check ran**: the final findings were compared against the OWASP/ASVS/NIST/CISA/CWE calibration lenses in §4.3A so obvious classes were not missed.
13. **Question discipline held**: any maintainer question was one question only, included context and a recommended answer, and did not block unrelated review work.
14. **Service-JSDoc sweep ran**: every service file-header/exported-contract JSDoc was checked against actual implementation, side effects, error semantics, dependency shape, and security/privacy invariants.
15. **CI/CD gap sweep ran**: deterministic guardrails in `package.json`, `scripts/`, `.github/workflows/`, config files, and test harnesses were reviewed against §4.4.38 and §5.
16. **Clickable-route coverage was assessed**: the report states whether a systematic link/form/button route-wiring smoke test exists; missing coverage is recorded as a Testing and CI/CD verification gap.
17. **Active disproof ran per finding**: each recorded finding survived an explicit attempt to prove it false. Its counterfactual was tested against the code (not just the obvious consumer), `tests/` was grepped for a test that pins the behavior the finding calls wrong or that the suggested fix would change, and the suggested fix was confirmed behavior-neutral except for the defect removed. A finding contradicted by a passing test is dropped or rewritten.

### 4.7A Adversarial review of this skill (every run)

Each run spends a final, explicit step attacking this skill, not just the code: where did the scope filters, anti-patterns, scope derivation, or stopping wording let a bug slip, narrow scope, or excuse incompleteness this run? Treat any default exclusion (CAPTCHA, `legacy_data/`, non-deployed stories) as a hypothesis to re-justify against this run's evidence, not a settled boundary. Record concrete skill-improvement notes to the maintainer in the closing summary (never edit this skill mid-hunt). A run that found the skill flawless must say why, naming what it specifically tried to break. Close the loop on escaped defects: any false negative discovered after a hunt (a real bug a prior sweep read past, or one surfaced later by tests, staging, or production) is converted into a permanent deterministic check (a regression test, or a convention/lint/CI gate) so that exact class cannot escape again, and if it is a new class, a new §4.4 category is proposed to the maintainer. A false positive that survived this skill's verification (a recorded finding later refuted) is handled the same way: identify which verification step should have caught it and propose the gap-closing edit.

### 4.8 Anti-patterns — what NOT to flag

These are false-positive calibrators, not a suppression list. They exist to keep noise out, never to wave off a verified bug. When uncertain whether something is real, the default is to verify it to a yes or no, not to drop it. If it survives verification, it is a finding regardless of how it feels.

- **"This is hard to read"** — not a bug. Maintenance friction without a behavioral failure is out of scope. (A genuine layering divergence is §4.4B, not "hard to read".)
- **"This file is too long"** — out of scope.
- **"This `any` should be typed"** — only if it allows a real runtime miscast. Otherwise out of scope.
- **"This could be a stream"** / **"This could be lazy"** — performance suggestions are out of scope.
- **"This UX could be friendlier"** — design feedback, not a bug. (Form-state preservation on a 422 re-render is a real correctness category, not UX polish — flag that.)
- **"This is missing a unit test"** — an isolated ordinary unit-test gap belongs in §5 and must be specific. Do not inflate vague coverage complaints. However, a missing deterministic guardrail that would catch a broad known defect class is in scope under §4.4.38 / §5, and a missing route-wiring/link/form smoke harness is in scope under §4.4.39.
- **"This adapter has no staging-smoke"**: for HttpReachability / ImageProcessing / VideoTranscoding this is intentional (per `docs/TESTING.md` §7.2), not a gap.
- **"This dev-shortcut is risky"** — the cross-env dev-shortcut surface is operator-side readiness, out of scope for the bug hunt.
- **"This is dead / unused / matches nothing / can be removed"** — a valid Low finding (§0.3) ONLY after you prove removal is behavior-neutral. Absence of a direct caller or matching route is necessary, not sufficient: trace every consumer AND every control-flow effect (middleware ordering, fall-through, the negative/absence path), and grep `tests/` for a test that pins the behavior. A construct with no direct consumer can still be load-bearing — e.g. an allow-list entry whose only effect is keeping a removed route returning 404 instead of a gated redirect. If you cannot prove removal changes nothing observable, it is not a dead-code finding.
- **CAPTCHA** — out of scope (Turnstile deferred by design). **`legacy_data/` pipeline, EO_*, CL_*** — out of scope or not deployed per §1.

Note: stale/bogus comments, code duplication that causes behavioral drift, and "wrong error class" are **no longer** in this exclusion list — they are first-class §4.4B findings. Report them (calibrated to the §4.4B severity guidance), do not suppress them.

### 4.9 Time budget and stopping condition

The default standard is the most exhaustive correct audit achievable by static review: find every bug the deployed surface can yield, not a high-leverage subset. There is no finding-count cap and no count-based stopping target. "No shortcuts" is the baseline, not something a prompt has to request.

The sweep is not done when the steps are run; it is done when the surface is exhausted. Exhaustion means: (a) every deployed controller, service, middleware, adapter, shared lib, and template appears in the coverage ledger marked read; (b) every §4.4 / §4.4B bug class has been applied to every surface it can touch; (c) the surface has been re-swept until two consecutive passes surface no new candidate; and (d) a completeness critic has asked "what class, surface, actor, or success criterion did this pass not touch?" and that list is empty or itself swept.

Reducing missed bugs (false negatives) is a first-class goal of exhaustion, not an afterthought. Two disciplines are mandatory every run, not optional. (1) **Invert the question.** For every invariant, success criterion, and security control, do not conclude "looks enforced." Construct the concrete input or request sequence that would violate it and show why the code defeats that attempt; the inability to construct a working violation is the evidence, the mere absence of one is not. (2) **Run the completeness critic** from (d) as an explicit, recorded step: name every bug class times surface times actor times success criterion the pass did not touch, then sweep that list to empty. A surface marked "read" in the coverage ledger is not covered until every applicable §4.4 / §4.4B class has actually been applied to it; "read" is not "analyzed."

The checklist below is a minimum coverage floor, necessary but never sufficient; completing it does not end the sweep, only the exhaustion conditions above do. Minimum floor:

- You have rebuilt the deployed surface and completed the scratch deployed-story traceability pass.
- You have audited the deployed-US controllers (including `freestyleController`) + their services + the shared middleware + the adapters in `src/adapters/` + the shared lib helpers.
- You have threat-modeled the high-risk flows named in §4.5.
- You have grep-swept for the expanded bug categories in §4.4.1-§4.4.39.
- You have run the §4.4B design/hygiene secondary sweep across the files read.
- You have spot-verified 3+ catastrophic/high findings.
- The findings file is complete and self-checked per §4.7.

Calibrate by severity, never by count. The §4.4B design/hygiene sweep is likewise exhaustive within its lower-severity band: report every real divergence you find; those findings live in the `BUGS.md` design-divergence group and are not counted against any budget. A finding total climbing high is not a trim signal; re-verify each entry and keep every real one. §4.8 calibrates false positives; it never licenses dropping a verified bug.

If you find zero catastrophic findings and fewer than 3 high findings, double-check that you actually swept §4.4.4-§4.4.7 (auth gates, anti-enumeration, CSRF). A zero-catastrophic result is possible if §3 already caught everything, but improbable; spot-verify against the deployed surface before concluding.

### 4.10 After delivering the findings file

End your turn with one short summary message to the maintainer:

- Count by severity for the §4.4 security sweep, plus separate counts for the `BUGS.md` design-divergence + hygiene group and the Testing/CI/CD verification gaps group.
- Two or three highest-leverage findings, one sentence each.
- The bottom of your message offers: "Want me to plan remediation for any specific finding? (One question per turn — name the finding ID.)"

Do NOT auto-proceed to remediation. Deliver findings only; the maintainer gates per-finding remediation in a separate pass.

---

## 5. Testing and CI/CD verification improvement punch list

This section is complementary to `docs/TESTING.md`. During a bug hunt, it is a bug to lack an obvious deterministic check when the check is cheap, stable, and would prevent a known class of defects. The goal is to move repeatable verification out of the agent's head and into code that runs automatically.

The classification rule (must-have pre-merge / fast local / nightly-deep / manual staging) and the four checklists — baseline deterministic guards, security automation, route/link/form/button smoke coverage, and property/invariant/fuzz checks — plus the standard for how to report a missing check, are in `REFERENCE.md` (§5.1–§5.6). Record verified gaps under the `BUGS.md` **Testing and CI/CD verification gaps** group.

---

## 6. Known limitations of this document

Limitations that constrain what this skill can verify:

- **No live AWS contact**. The audit does not run `terraform plan`, does not read `/srv/footbag/env` from the staging host, does not query the staging DB schema_version, does not inspect GitHub branch protection / secret scanning state, does not confirm SES sandbox state, does not confirm CloudFront in-flight invalidations.
- **No runtime behavior verification unless the kickoff prompt authorizes it**. The §4 bug-hunt brief is primarily static analysis; it does not normally run the deployed code. A bug that surfaces only under concurrent load (race conditions, lease overlap), real browser behavior, or staging infrastructure may need a Leads entry instead of a verified finding.
- **No browser-level testing**. Browser-level a11y, visual regression, real-browser cookie attribute interaction are out of scope here. They are in `tests/e2e/` (single Playwright spec today) and operator-invoked via the `browser-qa` skill.
- **No deeper read of some test files**. The §5 punch list reflects file structures and a subset of test bodies. Some files evaluated by name + describe/it titles only (e.g. `security.atomicity.test.ts`, `security.edge-cases.test.ts`, `security.sql-injection.test.ts`, `security.xss.test.ts`, `register.race.test.ts`, `email-collision-safety.test.ts`, `member-privacy.routes.test.ts`) may carry additional weaknesses or strengths not yet surfaced here.
- **CAPTCHA and the `legacy_data/` pipeline** are excluded by default (the pipeline can be pulled in only by the kickoff prompt). When CAPTCHA wiring lands, a new audit pass for the CAPTCHA adapter (stub vs live verification) is needed. The legacy-pipeline deviations live in `IMPLEMENTATION_PLAN.md`. The freestyle dictionary surface has its own slice governance under `docs/`, so cross-check the freestyle slice scope before flagging a freestyle finding as drift versus intended-but-unbuilt.

- **CI/CD visibility may be incomplete**. Repo files can show package scripts, local CI scripts, and committed GitHub Actions workflows, but they may not reveal branch protection, required status checks, GitHub secret scanning/push-protection settings, dependency-review enforcement, environment protection rules, artifact retention, log masking, or organization-level policies. If those cannot be verified from the repo, record a narrowly scoped Lead or ask one maintainer question rather than guessing.

- **External standards are calibration lenses, not source-of-truth overrides**. OWASP, ASVS, WSTG, NIST SSDF, CISA Secure by Design, OWASP CI/CD guidance, GitHub CodeQL/dependency-review guidance, OpenSSF Scorecard, and MITRE CWE help prevent blind spots, but the repo's documented source-of-truth order governs project-specific behavior.
