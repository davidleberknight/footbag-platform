---
name: write-tests
description: Write, extend or fix tests for a route, service, pure function, operator script, adapter or browser flow (vitest unit and integration, script test, Playwright e2e, staging smoke). Use when adding a feature, writing a regression test for a bug fix, fixing a failing or flaky test, changing a service contract, checking an assertion or edge-case coverage, or confirming a fix holds.
---

# Write Tests

The binding rules are `.claude/rules/testing.md`; read it before writing. This skill is the procedure. Layers, fixtures and naming are in `tests/CLAUDE.md`.

Copy this checklist into your working notes and tick it off:

```
- [ ] 1 Scope confirmed
- [ ] 2 Layer chosen
- [ ] 3 Story, contract and nearby tests read
- [ ] 4 Cases planned, each with the defect it catches; anti-pattern check passed
- [ ] 5 Tests written; inputs owned by the test
- [ ] 6 Failure demonstrated (proportionate)
- [ ] 7 Reviewer run if required; build and named suites green; reported
```

## Step 1: Confirm scope

Read the open issues in the maintainers' private tracker (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`; if unwired, note it in one line and rely on the human's instruction). Do not write tests for out-of-scope behaviour. To confirm the surface under test traces to a deployed user story, classify it per `.claude/skills/deployed-surface/SKILL.md`.

## Step 2: Choose the layer

- **Unit** (`tests/unit/`): exported pure functions with no database, such as `slugify()`, `personHref()`, `groupPlayerResults()` and the `ServiceError` classes. A non-exported function is tested through its integration surface; never widen production exports for a test.
- **Integration** (`tests/integration/`): routes, database, auth, rendered HTML, and operator scripts (`<script>.script.test.ts`, driven through the script's test seam). Route contracts, auth and ownership gates, privacy boundaries, session edge cases, validation negatives, and business rules through routes.
- **Browser** (`tests/e2e/`, Playwright): only what a real browser can show: cookie attributes and session behaviour across redirect chains, CSRF-protected form submission where browser semantics matter, the wizard happy paths plus the one negative case per wizard a browser reveals, and upload round-trips. Every business-rule branch belongs in integration. Sessions come from the persona switch (`GET /dev/switch?as=<slug>`).
- **Smoke** (`tests/smoke/`): read-only live probes of staging wiring only. Read `SMOKE.md` first.
- **Real-claim crawl** (`tests/dev/`): claims one real migrated record on a local dev stack and walks the surfaces that render it. Extend it only for a surface that renders migrated real-world data.

Generative sweeps already cover every route, so check what they give a new route before writing per-route cases for it:

- The CSRF sweep (`tests/integration/csrf.sweep.test.ts`) and the member-owned cells of the authorization matrix (`tests/integration/authorization-matrix.test.ts`) read the live route table, so a new state-changing or member-owned route is swept on the day it ships. A route that legitimately falls outside a sweep gets a named exemption with its reason, never silence.
- The route-wiring crawl (`tests/integration/route-wiring.crawl.test.ts`) follows every rendered link and form for anonymous, member and admin, so a page reachable from a section root is checked for 404, 5xx and template artifacts.
- A new route still needs its own cases from the rule's edge-case floor; a sweep proves a property across routes, not a route's behaviour.

## Step 3: Read what the test must prove

1. The acceptance criteria in `docs/USER_STORIES.md` (targeted sections).
2. The owning service's file-header JSDoc (boundary, required patterns, side effects) and `.claude/rules/view-layer.md` for a rendered route.
3. The current method shape in TypeScript.
4. Known deviations: open `bug`-labelled private-tracker issues the test must accept.
5. Nearby tests in the target directory; follow their patterns.

Do not invent behaviour the acceptance criteria do not state. Tests prove the code does what the test expects, not that it is correct, so before finishing re-read the story or decision behind the change, confirm every acceptance criterion is exercised by at least one test, and check the adversarial cases missed no input class the story implies.

## Step 4: Plan the cases

The case floor is the edge-case and adversarial lists in the rule; read them now, not from memory. Two cases the rule does not spell out:

- Privacy: purged members excluded, honours-gated public profiles, no PII to unauthorised viewers.
- A form-bearing page: the primary form is not nested and its submit control posts to the intended handler. A nested `<form>` orphans the submit button and is invisible to a handler-only POST test.

For the high-risk areas (auth and session, member privacy, payments, identity claim, erasure), also walk the risk classification and STRIDE vocabulary in `docs/TESTING.md`.

For a bug fix, name the bug's class before writing the case: a member state a sender or listing forgets, a failure after an earlier step committed, an enumeration leak on a lookup, or a check that can never fail. Where that class has a sweep, the regression test is a new row of the sweep, so the fix also covers every sibling path; a one-off test is right only when no sweep exists for the class.

State each planned case with the one sentence naming the defect it catches (the rule's name-the-defect mandate). Then check every case against this list and drop or rewrite any that fails it:

- Could only a deliberate edit to copy or a table make it fail? Then it is a change-detector; drop it. Word assertions survive only in the four kept shapes: a negative naming a wrong statement a regression could restore; a relation between two independently maintained things; a branch asserted on both sides; wording an external authority fixes.
- Does it assert a content module contains its own entries? Assert what the module drives instead.
- Is it an `.each` row that runs the same path as its neighbours? Fold it into one case.
- Is it a `typeof` the types guarantee, bare truthiness, or a standalone `returns 200`? Assert the status inside the case that checks the body.
- Does a read-only suite request the same page in several cases? Share one response through `cachedGet` (`tests/fixtures/cachedGet.ts`) and seed in `beforeAll`. Never write inside a case of a `cachedGet` suite: seed both states up front, or put the write-then-read case in its own file with plain requests (or mark the file `cachedGet-writes:` with the reason).
- Does the verdict depend on ordering, a clock, a listing, a sleep, or a size smaller than the real input? Fix it per the rule.

## Step 5: Write the tests

Follow the shapes in `EXAMPLES.md`, and these instructions:

- Import `../fixtures/supertestWithOrigin`, not plain `supertest`, whenever the suite issues any POST, PUT, PATCH or DELETE: those verbs are refused with 403 before the controller runs unless they carry a matching `Origin`.
- Assert the status inside the case that checks the body, never in a standalone case.
- Assert on rows the test seeded, not on template copy, so the assertion ties the render to the data.
- Seed only through the factories; `insertMember()` overrides cover member edge cases (`is_hof`, `is_deceased`, `personal_data_purged_at`).
- A case that deliberately drives a `logger.error()` calls `expectLoggedError(pattern)` before the action, with a pattern naming the expected line.
- Many assertions about one page share one response through `cachedGet`.

Give the test its own inputs. For every input the test does not create (a file, a directory, an installed binary, an exported variable), write it, stub it, pass its path or set it; a default that resolves to the developer's machine is not an input the test owns.

- A case gated on an installed tool probes through `requireToolInCI` in `tests/fixtures/toolAvailability.ts`, which returns availability for `skipIf` locally and throws when the tool is missing and `CI` is set. If the case does not matter enough to provision for, delete it.
- A claim about the source tree reads the working tree through `tests/fixtures/sourceTree.ts` (`listFiles` for one folder, `scanSource` over named folders), never git.
- The shared setup already denies credentials, the home directory, the deployment-environment variable, the media directories and the SSH client; extend that declaration rather than defending a file by hand.
- Check with `scripts/ci/run_clean_room.sh`, which runs the suite in a throwaway worktree with an empty home and no ambient environment.

Where the machine's speed decides between two legitimate outcomes, assert the contract, not the one outcome an idle machine produced (the load-dependent refusal in `EXAMPLES.md`). A fixed millisecond bound is a statement about the author's machine: measure the reference in the same run. A per-test timeout follows the rule's test-budget rule.

## Step 6: Demonstrate failure

1. Make the smallest edit to the production code that should break the test: invert the condition, delete the guard, return the other branch.
2. Run that one test file. It must fail, and the failure must name what you broke.
3. Restore by reversing your own edit exactly, and run it again. It must pass. Never `git checkout` or `git restore` a file to undo it: the tree may carry other people's uncommitted work.

How often, per the rule's demonstrated-failure requirement: once per test for a regression test and for any test on auth and session, payments, member privacy, identity claim or erasure; elsewhere once per distinct branch or behaviour a group of tests covers. A test that stays green with the code broken is wrong; fix the assertion until it fails for the right reason.

## Step 7: Review, run and report

**Reviewer.** Run a fresh read-only reviewer subagent when the new tests guard auth and session, payments, member privacy, identity claim or erasure, or a destructive, irreversible or outward-facing action (deleting data, overwriting, retiring a resource, sending mail, deploying, applying infrastructure). The size of the change does not decide it; what an undetected false green would let through does. Give it the test diff and the code under test, and this brief: "Report only tests that would still pass with the code they guard broken, each with the one-line code change that proves it. Do not comment on style or ask for more tests." Fix what it reports.

**Run.** Per the Verification default in root `CLAUDE.md`.

**Report.** Which tests were added or changed, the defect each catches, how failure was demonstrated, the reviewer's findings if it ran, and the result of every run, with full error output for any failure.

## Stop when

Every planned case is written, each has been seen red for its named defect and green after restore, `git status` shows no modified production source from this work, and the build plus the reached suites pass. Then report.

## Additional resources

- `.claude/skills/write-tests/EXAMPLES.md`: read before writing a new unit or integration file, or an error-path test.
- `.claude/skills/write-tests/SMOKE.md`: read before adding or changing anything under `tests/smoke/`.
