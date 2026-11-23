---
name: write-tests
description: Write, extend or fix tests for a route, service, pure function, operator script, adapter or browser flow (vitest unit and integration, script test, Playwright e2e, staging smoke). Use when adding a feature, writing a regression test for a bug fix, fixing a failing or flaky test, changing a service contract, checking an assertion or edge-case coverage, or confirming a fix holds.
---

# Write Tests

The binding rules are `.claude/rules/testing.md`; read it before writing. This skill is the procedure. Layers, fixtures and naming are in `tests/CLAUDE.md`.

## Step 1: Confirm scope

Read the open issues in the maintainers' private tracker (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`; if unwired, note it in one line and rely on the human's instruction). Do not write tests for out-of-scope behaviour. To confirm the surface under test traces to a deployed user story, classify it per `.claude/skills/deployed-surface/SKILL.md`. Skip this step when the invoking skill or the task has already confirmed scope.

## Step 2: Choose the layer

The layers are listed in `tests/CLAUDE.md`. Choosing among them:

- A non-exported function is tested through its integration surface; never widen production exports for a test.
- Browser (Playwright) only for what a real browser can show: cookie attributes and session behaviour across redirect chains, CSRF-protected form submission where browser semantics matter, the wizard happy paths plus the one negative case per wizard a browser reveals, and upload round-trips. Every business-rule branch belongs in integration. Sessions come from the persona switch (`GET /dev/switch?as=<slug>`).
- A deployed story's success criteria are proven as a journey (the testing rule's mandate 8). A state the persona catalog lacks is added there, never invented as factory rows.
- A view, stylesheet or layout change is checked by the rendered-style check. What it cannot see, because it measures settled pages with scripts on, is a browser case: a box that moves while the page loads, or a page drawn with JavaScript off (`javaScriptEnabled: false`), as in `tests/e2e/layout-stability.spec.ts`.
- Smoke: read `SMOKE.md` first. Extend the real-data leg only for a surface that renders migrated real-world data, adding the surface's shapes to the leg's shape query.

Generative sweeps already cover every route, and the cross-cutting rule register covers every sender, listing and member state; check both lists in `docs/TESTING.md` (platform-wide generative sweeps; the cross-cutting rule register) before writing per-route cases. A floor item a sweep already proves is that sweep's row (mandate 2); a route that legitimately falls outside a sweep gets a named exemption with its reason.

## Step 3: Read what the test must prove

1. The success criteria in `docs/USER_STORIES.md` (targeted sections).
2. The owning service's file-header JSDoc (boundary, required patterns, side effects) and `.claude/rules/view-layer.md` for a rendered route.
3. The current method shape in TypeScript.
4. Nearby tests in the target directory; follow their structure and helpers, not their assertions. An existing test is not evidence of what is correct.

Write each case's expected outcome by hand from the story or decision text and the seeded rows before reading the implementation, and never compute an expected value by calling the code under test; a case the text does not decide is a question for the maintainer, never a value read off the code. Do not invent behaviour the success criteria do not state. Tests prove the code does what the test expects, not that it is correct, so before finishing re-read the story or decision behind the change, confirm every success criterion is exercised by at least one test, and check the adversarial cases missed no input class the story implies.

## Step 4: Plan the cases

The case floor is the edge-case and adversarial lists in the rule, and its real-data-shape, factory-parity and real-path rules; read them now, not from memory. Cases the rule does not spell out:

- Privacy: purged members excluded, honours-gated public profiles, no PII to unauthorised viewers.
- A form-bearing page: the primary form is not nested and its submit control posts to the intended handler. A nested `<form>` orphans the submit button and is invisible to a handler-only POST test. Then the real starting state (the testing rule): the controls a first visit renders, the options re-offered after a refusal, and that resubmitting the page as rendered succeeds.
- A state-changing route on a covered path (an email link, a checkout or payment start, an outward send): a submitted-twice case asserting the same redirect and message and unchanged domain, audit, outbox and rate-limit counts, unless the route carries a named exemption. An own-repeat case gets a sibling proving another actor's act is not treated as this actor's repeat.
- A stub adapter on the path: the case feeds it an input the live implementation would refuse (a suppressed address, an unsigned payload) and asserts the refusal, because a stub more permissive than live hides the defect below production.
- A scheduled job: the three layers in the testing rule's Scheduled jobs section, with the outcome case started from a state the running stack is in and the job run through its registry entry.

For the high-risk areas (auth and session, member privacy, payments, identity claim, erasure, and any destructive, irreversible or outward-facing action), also walk the risk classification and STRIDE vocabulary in `docs/TESTING.md`.

For a bug fix, write down why the existing suite missed it and name the bug's class before writing the case: a member state a sender or listing forgets, a failure after an earlier step committed, an enumeration leak on a lookup, or a check that can never fail. Where that class has a sweep, the regression test is a new row of the sweep, so the fix also covers every sibling path; a one-off test is right only when no sweep exists for the class.

State each planned case with the one sentence naming the defect it catches (the rule's name-the-defect mandate). Then check every case against the testing rule's anti-patterns and the items below, and drop or rewrite any that fails:

- Could only a deliberate edit to copy or a table make it fail, or does it assert human-edited site wording? Drop it (the name-the-defect mandate).
- Does it assert something is absent? The same case shows it present where it should be (a live member beside the deceased one); an absence over an empty fixture passes by construction.
- Does it hold two lists that must agree (fields a parser reads and a save clears, jobs a gate waits for and its verdict reads)? Relate the two declarations in the test and fail on any difference; never derive the expected side by calling the code the case exercises.

## Step 5: Write the tests

Follow the shapes in `EXAMPLES.md`, and these instructions:

- Import `../fixtures/supertestWithOrigin`, not plain `supertest`, whenever the suite issues any POST, PUT, PATCH or DELETE: those verbs are refused with 403 before the controller runs unless they carry a matching `Origin`.
- Assert on rows the test seeded, not on template copy, so the assertion ties the render to the data. Prefer figures, counts, order, roles and the presence or absence of a form to wording.
- `insertMember()` overrides cover member edge cases (`is_hof`, `is_deceased`, `personal_data_purged_at`).

Before writing a helper, check the shared fixtures by purpose in `tests/CLAUDE.md`; the testing rule names the ones its gates enforce (`rowPinning`, `clock`, `scratchDir`, `spawnGuard`).

Give the test its own inputs. For every input the test does not create (a file, a directory, an installed binary, an exported variable), write it, stub it, pass its path or set it; a default that resolves to the developer's machine is not an input the test owns.

- A case gated on an installed tool probes through `requireToolInCI` in `tests/fixtures/toolAvailability.ts`, which returns availability for `skipIf` locally and throws when the tool is missing and `CI` is set. If the case does not matter enough to provision for, delete it.

Where the machine's speed decides between two legitimate outcomes, assert the contract, not the one outcome an idle machine produced (the load-dependent refusal in `EXAMPLES.md`). A fixed millisecond bound is a statement about the author's machine: measure the reference in the same run. A per-test timeout follows the rule's test-budget rule.

## Step 6: Demonstrate failure

1. Make the smallest edit to the production code that should break the test: invert the condition, delete the guard, return the other branch.
2. Run that one test file. It must fail, and the failure must name what you broke.
3. Restore by reversing your own edit exactly, and run it again. It must pass. Never `git checkout` or `git restore` a file to undo it: the tree may carry other people's uncommitted work.

How often is the rule's demonstrated-failure requirement. A test that stays green with the code broken is wrong; fix the assertion until it fails for the right reason.

## Step 7: Review, run and report

**Reviewer.** Run a fresh read-only reviewer subagent when the new tests guard auth and session, payments, member privacy, identity claim or erasure, or a destructive, irreversible or outward-facing action (deleting data, overwriting, retiring a resource, sending mail, deploying, applying infrastructure). The size of the change does not decide it; what an undetected false green would let through does. Give it only the diff and the code under test, and this brief: "Propose five to ten one-line edits to the changed production code that a correct suite must catch (invert a condition, drop a filter, delete a guard, return the other branch, move a write out of its transaction), each naming the test file it should turn red. Do not comment on style or ask for more tests. You cannot ask the human: return any question in your report with its context and your recommended answer." The reviewer is read-only, so you apply each edit alone, run only the files it names, and reverse it exactly. Every edit no test notices gets a stronger assertion, shown red against it. Record how many edits were tried and how many survived.

**Drive.** Where a person can see the change, drive the changed journey through the real pages on the development stack with the Playwright MCP tools (snapshot, not screenshot), across every page it touches. A defect found that way lands as a test.

**Run.** Per the test-targets line in root `CLAUDE.md` (the full gate is the maintainer's: an ask rule in `.claude/settings.json`, per the testing rule's "Scope of a verification run").

**Report.** For each added or changed test: the defect it catches and the success criteria it covers, and how failure was demonstrated (red, then green). On a bug fix: why the existing suite missed it, and the defect class. On a reviewer run: edits tried, edits survived, and the strengthening for each. Any new exemption, with its reason. Then the result of every run, with full error output for any failure.

## Stop when

Every planned case is written and has been seen red as the demonstrated-failure requirement demands and green after restore, no break edit remains in production source, a change a person can see has been driven through its pages, and the build plus the reached suites pass. Then report.

## Additional resources

- `.claude/skills/write-tests/EXAMPLES.md`: read before writing a new unit or integration file, or an error-path test.
- `.claude/skills/write-tests/SMOKE.md`: read before adding or changing anything under `tests/smoke/`.
