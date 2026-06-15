---
paths:
  - "src/adapters/**"
---

# Adapter conventions

Adapters are the only seam between application code and external services (AWS, Stripe, Google Safe Browsing, Cloudflare Turnstile, the in-cluster image/video worker). No other code imports an external SDK.

## Naming

- Interface: `<Purpose>Adapter` (e.g. `SesAdapter`, `MediaStorageAdapter`, `SecretsAdapter`).
- Implementation: `<Backend><Purpose>Adapter` (e.g. `StubSesAdapter`, `LiveSesAdapter`, `LocalSecretsAdapter`); a stub extends its interface (`Stub<Purpose>Adapter extends <Purpose>Adapter`).
- Accessor: `get<Purpose>Adapter(): <Purpose>Adapter`, a lazy process singleton that resolves the backend from `config`. Services and controllers obtain adapters through this accessor only; they never construct an implementation directly.

## Backend selection

Each adapter resolves an environment-specific backend at the accessor: dev and test use an in-process stub, a local file or filesystem backend, or an injected test double; staging and production use the live AWS or third-party backend. Image processing and video transcoding instead call the in-cluster worker in every environment. The full inventory and the per-environment backends live in `docs/DESIGN_DECISIONS.md` §5.3.

## Configuration and fail-fast

Adapters read deploy-time config through the typed `config` singleton (`import { config } from '../config/env'`), never `process.env` directly. A required env var that is absent makes the adapter fail-fast at boot, so a misconfigured deployment cannot start in a half-wired state.

## Test injection

Tests inject a double or reset the singleton through the adapter's test hooks (`set<Purpose>AdapterForTests` / `reset<Purpose>AdapterForTests`, cleared in `afterEach`). Integration tests stand up a fake client against the adapter interface; they never mock the AWS SDK package itself.

## Tests required

Every new adapter, and any change to an adapter's contract, lands with the three parity tests in `.claude/rules/testing.md` (boot-time config, interface parity, staging smoke).

## Mechanically enforced

`scripts/ci/assert_conventions.sh` blocks AWS SDK / Stripe imports outside `src/adapters/` and `process.env` reads outside `src/config/env.ts`.
