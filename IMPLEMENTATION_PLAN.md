# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md` (even if they are also in Design Decisions as a long-term intent). Documented future work and intentional development versus staging versus production asymmetries are not deviations.

## Active work

### Tracker

- **Bug tracker: GitHub Issues + GitHub Projects + structured issue forms** per `docs/TESTING.md` §15. Foundational for the regression-test-per-fixed-bug rule (`docs/TESTING.md` §9.6 and `.claude/rules/testing.md` mandate 1). Do this first.

### Test tooling adoption (per `docs/TESTING.md` §15.3.2)

- **fast-check.** Property-based testing. Unblocks Rigor 4. Pilot on M_Login enumeration-safety.
- **Stryker.** Mutation testing on safety-critical short list (auth, privacy filters, migration matchers, role gates). Unblocks Rigor 5.
- **@axe-core/playwright.** Accessibility automated checks. Unblocks `docs/TESTING.md` §14.1.
- **OWASP ZAP.** Heavyweight pentest scanner. Supports `docs/TESTING.md` §9.3.
- **Dependency vulnerability scanner** beyond `npm audit` (Snyk, Socket, or equivalent).

### CI and npm script additions (per `docs/TESTING.md` §11)

- `npm run test:pre-pr`. Full unit + integration + security regression. Sub-2min target.
- `npm run test:pentest:heavy`. Heavyweight pentest gate.
- Nightly or scheduled CI job. Mutation testing, dependency audit, header check across route table, dev-shortcuts cutover audit against production DB.
- Post-deploy staging smoke gate. Read-only health, auth gate, anti-enumeration timing, no-stack-trace, dev-shortcut absence. Blocks deploy promotion on failure.

### Test infrastructure

- Playwright tagging (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`) wired into `tests/playwright.config.ts` and test files. Defer until the e2e suite has at least 15 tests; tagging is overhead without benefit at the current 3-test scale.
- Staging personas. Gitignored `.local/staging-personas.json` or AWS Secrets Manager. Operator reset script using stdin-not-argv password pattern.
- Lightweight staging-safe pentest probes per `docs/TESTING.md` §9.2 (security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields).

### Surface classification (per `docs/TESTING.md` §3 and §12)

- Classify each existing test surface by risk tier. Catastrophic surfaces first (auth, registration, email verification, password reset, legacy claim, online registration, payment, admin).
- Apply the derivation playbook to classified surfaces. Produce traceability entries. Populate a "Testing rigor by surface" section here as rigor gaps are identified.

### Minor

- README em-dash drift in documentation bullets. Cleanup pass when convenient.
