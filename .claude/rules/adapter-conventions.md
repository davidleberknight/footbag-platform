---
paths:
  - "src/adapters/**"
  - "tests/unit/env-config.test.ts"
  - "tests/**/*[Aa]dapter*.test.ts"
  - "tests/smoke/**"
---

# Adapter conventions

Adapters are the only seam between application code and external services (AWS, Stripe, Google Safe Browsing, Cloudflare Turnstile, the in-cluster image/video worker). No other code imports an external SDK.

## Naming

- Interface: `<Purpose>Adapter` (e.g. `SesAdapter`, `MediaStorageAdapter`, `SecretsAdapter`).
- Implementation: `<Backend><Purpose>Adapter` (e.g. `StubSesAdapter`, `LiveSesAdapter`, `LocalMediaStorageAdapter`); a stub extends its interface (`Stub<Purpose>Adapter extends <Purpose>Adapter`).
- Accessor: `get<Purpose>Adapter(): <Purpose>Adapter`, a lazy process singleton that resolves the backend from `config`. Services (and the few middleware, lib and worker entry points that need one) obtain adapters through this accessor only, and never construct an implementation directly; controllers reach an adapter only through a service.

## Backend selection

Each adapter resolves an environment-specific backend at the accessor: dev and test use an in-process stub, a local file or filesystem backend, or an injected test double; staging and production use the live AWS or third-party backend. Image processing and video transcoding instead call the in-cluster worker in every environment. The full inventory and the per-environment backends live in `docs/DESIGN_DECISIONS.md` §5.3. That covers which backend an environment runs; how the selector reaches a deployed host, and which of the two owners governs it, is the Deploy-time Host Value Ownership decision. A selector is never hand-set on a host.

## Configuration and fail-fast

Adapters read deploy-time config through the typed `config` singleton (`import { config } from '../config/env'`), never `process.env` directly. A required env var that is absent makes the adapter fail-fast at boot, so a misconfigured deployment cannot start in a half-wired state.

## Test injection

Tests inject a double or reset the singleton through the adapter's test hooks (`set<Purpose>AdapterForTests` / `reset<Purpose>AdapterForTests`, cleared in `afterEach`). Integration tests stand up a fake client against the adapter interface; they never mock the AWS SDK package itself.

## Tests required

Adapters are the only seam between dev and staging: dev runs the `local`/`stub` implementations against in-process fakes, staging the `kms`/`live` implementations against real AWS (the full set is listed in `docs/TESTING.md`). Every new adapter, and any change to an adapter's contract, lands with three tests. They describe a permanent contract, not a one-shot check for the change that introduced them.

1. **Boot-time config** (`tests/unit/env-config.test.ts`). `src/config/env.ts` fails fast at module load, with a specific error message, when a required deployed-mode variable is absent. Add a case per new required variable.
2. **Interface parity** (`tests/integration/adapter-parity.test.ts`). Both implementations satisfy the TypeScript interface and produce observable outputs of identical structure. An injected fake client stands in for the AWS SDK call path; never mock the SDK package itself.
3. **Staging smoke** (`tests/smoke/`). Reaches real staging AWS through the assumed-role chain, gated behind `RUN_STAGING_SMOKE=1` and excluded from `npm test`. Required only where the live probe is side-effect-free: an adapter whose live call would write to object storage, charge a card, or otherwise mutate a deployed system carries the first two tests only, and its live path is verified by operator tooling instead (the exempt adapters and their reasons are listed in `docs/TESTING.md`). It asserts that the staging runtime identity is reachable and the adapter's AWS calls succeed; a failure means staging wiring is broken or incomplete.

## Mechanically enforced

`scripts/ci/assert_conventions.sh` blocks AWS SDK / Stripe imports outside `src/adapters/` and `process.env` reads outside `src/config/env.ts` and the separate-process entry points the gate names, each of which bootstraps its own environment because it runs without the web application's contract.
