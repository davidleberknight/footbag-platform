---
paths:
  - "src/services/**"
  - "src/db/db.ts"
---

# Service-layer rules

## Ownership

Services own business rules, validation, authorization, and view-model shaping. `db.ts` is the only SQL surface: flat rows, prepared statements, no business rules. Controllers are HTTP glue only. Templates are logic-light, branching only on pre-shaped data.

No repository abstractions, ORMs, mediator layers, or generic query-builder layers. Add explicit statement groups and small helpers when functionality grows.

## Service shape

Two patterns, chosen by stateful dependency:

- **Singleton object** for services with no external resources beyond `db.ts`: `export const memberService = { ... };`. Examples: `memberService`, `eventService`, `clubService`, `identityAccessService`, `historyService`.
- **Factory function** for services that take adapters or other injected dependencies: `export function createXService(deps: XServiceDeps) { ... }`. Examples: `createAvatarService`, `createCuratorMediaService`, `createCommunicationService`, `createMediaJobService`.

When in doubt, look at whether the service needs `getMediaStorageAdapter()`, `getSesAdapter()`, or similar -- those services use factories so adapters can be injected in tests.

## Page-shaping methods

Methods that produce a public page view-model:

- Named `get<Page>Page()` (e.g. `getOwnProfile`, `getPublicEventPage`, `getMembersWelcomePage`).
- Declared return type `Promise<PageViewModel<TContent>>` from `src/types/page.ts` (or `PageViewModel<TContent> | null` for privacy-gated reads where null maps to 404 at the controller).
- Compose all view-model fields, including hrefs, labels, badges, booleans. Controllers do not augment the result.

Non-page methods follow distinct prefixes: `list<X>` for arrays, `search<X>` for queries, `get<X>` for single rows that aren't page envelopes.

## Errors

All thrown errors are subclasses of `ServiceError` from `src/services/serviceErrors.ts`:

- `ValidationError` -- user-fixable input errors; carries optional `fieldErrors: Record<string,string>`.
- `NotFoundError` -- missing resources (controller maps to 404, including anti-enumeration cases).
- `ConflictError` -- unique-constraint or business-conflict situations.
- `RateLimitedError` -- throttle hits; carries `retryAfterSeconds`.
- `ForbiddenError` -- explicit authorization denials.

Bare `throw new Error(...)` is reserved for internal invariant assertions ("this should never happen") -- configuration bugs, retry-loop exhaustion, ID-collision exhaustion. These crash to 500 with a stack trace; ServiceError subclasses are the contract with controllers for user-facing HTTP responses.

## Discriminated-union return shapes

State-transition methods return discriminated unions, not booleans or thrown errors:

    type ApplyAttendanceResult =
      | { status: 'granted' as const; expiresAt: string }
      | { status: 'extended' as const; expiresAt: string }
      | { status: 'noop' as const; reason: 'no_shorten' | 'tier1_plus' };

Callers narrow on the `status` discriminator; the `as const` literal narrows the type so TypeScript exhaustiveness checks downstream.

## Auth-conditional shaping

General policy: services return a complete shape; controllers gate access (404 / 403) before invoking. The one current exception is media-gallery surfaces: `MediaGalleryService` accepts a `viewer: ViewerContext` parameter so it can null out per-item href fields when the viewer cannot reach the linked profile. Other services do not take `viewer`; they return full shapes and trust the controller's auth gate.

## File-header JSDoc

High-stakes write-path services (identity, membership, payments, voting, active-player, member, event, club, media, curator) carry a file-header JSDoc block stating ownership boundary, required patterns, invariants preserved, transaction discipline, persistence, and side-effect categories (audit append, outbox enqueue, news emission, work-queue insert, alarm raise). Read-only services (history, hof, bap, sideline, rules, ifpa, freestyle, records, net, legal) do not require this header; their service contract is obvious from method signatures.

**Update obligation: when a service change touches any of those JSDoc sections, update the JSDoc block in the same change as the code.** Specifically, audit and revise the JSDoc when:
- Ownership boundary shifts (service starts or stops owning a domain area, or delegates to a different service).
- A required pattern is added, removed, or changes shape (new invariant, changed transaction discipline, new authorization gate).
- Persistence changes (new table read or written; a previously-persistence-touched table is dropped from the service).
- Side-effect categories change (new outbox enqueue, new audit category, new work-queue insert, new alarm).
- Service shape changes (singleton becomes factory or vice versa).

Drift between JSDoc and the actual service contract is a real bug, not a doc nicety. JSDoc auto-loads with the file at every read; stale JSDoc actively misleads Claude and human reviewers. SC §6's per-service paragraphs (when not yet trimmed) are read at audit time; SC trims won't be safe until the JSDoc is the authoritative readable home for these rules.

## Mechanically enforced

`scripts/ci/assert_conventions.sh` blocks merges that violate these service-layer-adjacent rules:

- No `db.prepare()` calls outside `src/db/db.ts` -- services use named prepared statements from `db.ts`.
- No AWS SDK / Stripe imports outside `src/adapters/` -- services obtain adapters via `get<Purpose>Adapter()` only.
- No `process.env` reads outside `src/config/env.ts` -- services read deploy-time config via the typed `config` singleton, runtime config via `readIntConfig(key, fallback)` from `configReader.ts`.