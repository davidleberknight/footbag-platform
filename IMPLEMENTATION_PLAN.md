# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md` (even if they are also in Design Decisions as a long-term intent). Documented future work and intentional development versus staging versus production asymmetries are not deviations.

## Active work

### CI and npm script additions (per `docs/TESTING.md` §11)

- `npm run test:pentest:heavy`. Heavyweight pentest gate.

### Test infrastructure

- Playwright tagging (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`) wired into `tests/playwright.config.ts` and test files. Defer until the e2e suite has at least 15 tests; tagging is overhead without benefit at the current 3-test scale.
- Staging personas. Gitignored `.local/staging-personas.json` or AWS Secrets Manager. Operator reset script using stdin-not-argv password pattern.
- Lightweight staging-safe pentest probes per `docs/TESTING.md` §9.2 (security headers, no stack traces, no dev-shortcut acceptance, auth gates, anti-enumeration timing, no public-route contact fields).
- Adapter staging-smoke parity (per `.claude/rules/testing.md` adapter-parity rule). Missing for jwtSigningAdapter (KMS path), sesAdapter (live send), httpReachabilityAdapter, imageProcessingAdapter, videoTranscodingAdapter. JWT and SES are the consequential gaps before production cutover; the other three are lower-priority internal/private surfaces.

### Behavior coverage gaps (currently implemented surfaces, per `docs/USER_STORIES.md`)

- M_Change_Password A3: password length boundary triplet (7 rejects, 8 accepts, 128 accepts, 129 rejects). Current test asserts only the 5-char rejection.
- M_Search_Members A4: broad-query 20-result cap with "refine your query" prompt. Requires 21+ seeded members in `member-search.routes.test.ts` beforeAll.
- M_Edit_Profile A6: external URL count cap (max 3) + validator call. Not pinned in `member.routes.test.ts`; verify pinning before adding a test.

### Surface classification (per `docs/TESTING.md` §3 and §12)

- Classify each existing test surface by risk severity. Catastrophic surfaces first (auth, registration, email verification, password reset, legacy claim, online registration, payment, admin).
- Apply the derivation playbook to classified surfaces. Produce traceability entries. Populate the "Testing rigor by surface" section below as rigor gaps are identified.

### Testing rigor by surface (per `docs/TESTING.md` §12)

Catastrophic-severity surfaces per `docs/TESTING.md` §3.3 target Rigor 5. No surface has completed a derivation-playbook walk per §4. No surface has a documented STRIDE entry in its test file header, property tests via fast-check, or mutation-testing baseline via Stryker. Shared blocker: tools above under "Test tooling adoption" (fast-check, Stryker).

Pilot:

- *Surface:* M_Login
  *Risk severity:* catastrophic
  *Target rigor:* 5
  *Rigor reached:* 1-2 (integration tests cover happy path, auth gate, anti-enumeration; no STRIDE traceability entry; no property tests)
  *Gap:* implement the `docs/TESTING.md` §4.8 worked example as actual derivation trail in `tests/integration/auth.routes.test.ts` header; add the enumeration-safety property test (first fast-check use).

Other catastrophic surfaces pending per-surface audit + derivation walk:

- V_Register_Account (registration)
- M_Verify_Email (email verification)
- M_Reset_Password (password reset)
- M_Change_Password (in-session password change)
- M_Claim_Legacy_Account (legacy account claim)
- M_Confirm_Auto_Linked_Identity (auto-linked identity confirmation)
- M_Register_For_Event (online event registration, catastrophic when public event registration is live)
- M_Donate / M_Purchase_Tier_1 / M_Purchase_Tier_2 / A_Reconcile_Payments (payment flows)
- A_* surfaces collectively (admin, Sensitivity 4 catastrophic per `docs/DATA_GOVERNANCE.md` §4)

