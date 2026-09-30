# write-tests: staging smoke

Smoke tests (`tests/smoke/`) run against real staging through `npm run test:smoke`, which reads the Terraform outputs and sets `RUN_STAGING_SMOKE=1` (`scripts/test-smoke.sh`), and as the staging-aws-smoke row of `./run_all_tests.sh --staging`, run through the dev-tester role. They are excluded from `npm test`, from CI and from every local-only runner mode. Against production they run only as the operator's pre-cutover wiring check, never from the runner. The canonical example is `tests/smoke/staging-readiness.test.ts`.

## Scope: wiring only

Smoke proves that the running infrastructure reaches AWS with the correct identity, that the right resources exist with the right metadata, and that adapter calls succeed end to end. It is never for application logic or library behaviour, and every call it makes is a read that mutates nothing.

In scope:

- Identity resolution (the assumed-role ARN matches the expected role).
- AWS resource metadata (key spec, key usage, signing algorithms).
- An adapter round-trip through real AWS (KMS sign and verify).
- The alias and ARN addressing variants production code uses.
- Adapter code paths whose AWS-side behaviour differs.
- Read-only probes of the live third-party services and edge the adapters depend on (Safe Browsing, Turnstile, the CDN's cache headers).
- The staging persona catalog, read over ssh (`tests/smoke/test-personas.smoke.test.ts`).

Out of scope, as unit tests against the adapter:

- Token tampering, expired tokens, `alg=none` rejection.
- Adapter input validation, encoding, error-class shaping.
- Default-versus-override branches whose AWS-side behaviour is identical.

Out of scope, as integration tests:

- End-to-end flows (password reset, outbox drain).
- Bounce and complaint webhook handling.
- Suppression list, rate-limit and retry behaviour.

## Bar for adding a smoke assertion

- It needs real AWS to verify; a stub cannot cover it.
- It catches a specific, named misconfiguration nothing else detects.
- It is deterministic: no clock or rate-limit dependence.

When a smoke assertion lands, add its failure mode to the test file's header docblock.

Smoke is the third of the adapter three-test contract in `.claude/rules/adapter-conventions.md`; never duplicate the interface-parity assertions into it.
