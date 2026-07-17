---
name: prepare-pr
description: Prepare a human-reviewable PR summary for the current work without creating commits, pushing, or mutating git history.
---

# Prepare PR

This is an IFPA footbag-platform PR. Reviewers are IFPA volunteers who value simplicity, transparency, and volunteer maintainability. The summary must give them a clear picture of what changed, why, and whether it is safe to merge.

## Step 1: Verify doc-sync ran

Check whether `doc-sync` has been run since the last significant change in this session. If it has not, flag this in the PR summary as a prerequisite gap: do not silently omit it.

## Step 2: Gather facts

Read:
- current diff (changed files and their diffs)
- integration test results: run `npm test` if not already done; report pass/fail
- TypeScript type-check: run `npm run build` (`tsc -p tsconfig.json`) if not already done; report pass/fail
- any open questions or unresolved risks

Do not claim tests or browser verification that did not actually run.

## Step 3: Verify architecture compliance

Path-scoped rule files in `.claude/rules/` (auto-attached when matching files are read) define the non-negotiable patterns for service, controller, template, view-layer, and db-layer work. Confirm the change complies. Public-page work also follows the `.claude/rules/view-layer.md` rendering invariants and the owning service's file-header JSDoc; service-boundary work also follows the service's file-header JSDoc ownership and required patterns. Intentional deviations land as private-tracker issues.

Flag any violations explicitly in the summary.

## Step 4: Produce the PR summary

Include:
- **What changed**: concise description of behavior added, fixed, or removed
- **Why**: user story, bug, or decision that drove it
- **Key files changed**: list with one-line notes on the role of each
- **Tests**: what integration tests cover the change; pass/fail status
- **Type-check**: `tsc` pass/fail
- **Architecture compliance**: confirm the rules above or flag any deviations
- **Risks and tradeoffs**: anything a reviewer should scrutinize
- **Open questions**: anything unresolved that the reviewer should decide
- **Follow-up work**: known gaps deferred to a later task

## Never

- commit
- push
- rewrite git history
- run `git add` without explicit human approval
- claim verification that did not happen
