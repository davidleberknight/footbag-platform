# Deployed-surface enumeration

Single home for two things several review workflows share: how to determine what the running application actually deploys, and the one taxonomy for classifying every user story by deployment status. The test-writing, bug-hunt, design-bug-hunt, and extended doc-sync skills cite this rule by name instead of each restating it, because a restated copy drifts.

## Derive the deployed surface fresh every run

The set of deployed, partial, and stubbed stories changes every slice, so any embedded inventory drifts and silently mis-scopes the work. Do not trust a seed list. From `src/app.ts` and `src/routes/**`, enumerate every mounted router and route, and follow each route to its controller and service to identify the story it serves and how completely. Include runtime-only paths with no direct HTTP route — background workers, the outbox processor, webhook handlers, scheduled tasks — and deployed templates. Hold the derived surface in scratch notes for the run; never commit it.

## What counts as deployed

A story or feature is deployed if any of these is true: a mounted HTTP route in `src/routes/**` exposes it via `src/app.ts`; a controller invokes it at runtime; a service is called from a mounted route; a background worker, outbox processor, webhook, or scheduled task invokes it; a deployed template renders it; or a production/staging artifact configures it as active. It is not deployed merely because a future story, design decision, schema table, seed file, test fixture, unused service file, or migration script exists, or because a canonical doc states the target design.

## Classification taxonomy

Classify each story in `docs/USER_STORIES.md`, and each deployed runtime feature that lacks a story id, into exactly one bucket:

- **Complete and deployed** — a mounted route or runtime path implements the story, and the code is intended to satisfy all its success criteria.
- **Partial and deployed** — a route or service path exists, but only some success criteria are implemented, or an accepted deviation tracked in `IMPLEMENTATION_PLAN.md` covers the remainder.
- **Runtime feature without a story id** — reachable code whose requirements live in another doc or are implicit in the architecture, with no clean user-story header.
- **Designed but not deployed** — a story or design exists, but no mounted route or runtime path implements it yet.
- **Future / not yet built** — no deployed path and no active runtime behavior; the work has not started.
- **Documented-deferred** — future work explicitly parked with a recorded decision in `IMPLEMENTATION_PLAN.md`; a tracked deferral, distinct from plain future work.
- **Ambiguous / source-of-truth conflict** — code and docs disagree in a way that needs a maintainer decision.

A full-surface audit that must prove it accounted for every candidate may also mark an item **not inspected** — a completeness-ledger bookkeeping status, never a finding.

## Status is never a finding

Designed-but-not-deployed, future, and documented-deferred are status facts. A not-yet-built feature is never reported as a gap; reporting one is the error the source-of-truth order and `IMPLEMENTATION_PLAN.md` exist to prevent.

## Every deployed path maps to a named story

Every deployed surface traces upward to a descriptively-named user story in `docs/USER_STORIES.md`. A deployed feature that lands in "runtime feature without a story id" is therefore a coverage gap the review surfaces: write the missing story, or, if the surface is genuinely unintended, remove it. Legacy data-pipeline surfaces anchor on the `docs/MIGRATION_PLAN.md` validation gates instead of a user story.
