---
name: patch-versions
description: Use when the maintainer decides to patch: a named tool, dependency, image or host release needs a new version for a security fix or a published advisory ("patch sqlite", "bump ffmpeg", "there's an exploit in X", "run the advisory report"). Moves pins one change at a time through the version scripts, proves each, and stops for the maintainer before staging and production. Never runs on a schedule and never patches unasked.
disable-model-invocation: true
---

# Patch versions

The maintainer decides when to patch; nothing here runs unasked. The policy, the per-surface
list and the remediation targets are the System Administrator patching story and the patch
management section in DEVOPS_GUIDE.md (private GitHub repo); read both first, through the
`footbag_private_repo/` link. Every pin lives in `ops/tool-versions.env` (or `.nvmrc`,
`.python-version`, the lockfiles), and the scripts below own every step.

## Procedure

1. Report, on request: run `/check-vulnerabilities` first, or take the bump set the maintainer
   names; the maintainer picks.
2. Bump one tool per change, through its owner, never by hand:
   - a tool in the list: `bash scripts/bump-tool.sh <KEY> <version>`, then again with `--apply`
     once the diff is shown;
   - an npm package: `bash scripts/pin-npm-package.sh <name> <version>`, as a direct pin or an
     existing override where it is declared, and `--override` only for a transitive package whose
     parent's range excludes the target; a Python package:
     `bash scripts/lock-python-deps.sh --upgrade-package <name>`;
   - a base image: the digest re-pin in the patch management section;
   - `SQLITE_VERSION` moves only with a better-sqlite3 bump, and the image pin test fails
     until they agree.
   For a major-version bump, read the release notes live for stated breaking changes first.
3. Prove it: `bash scripts/check-versions.sh` (full mode), then `bash scripts/check-vulnerabilities.sh`,
   showing every advisory of each moved package gone from it (one still listed means the target was
   short), then `bash scripts/test-targets.sh <changed paths>` and exactly what it prints, in the
   background. The full gate is the maintainer's.
4. Stop for the maintainer: the commit, the full gate, then staging. A host release moves with
   `bash scripts/step-amazon-linux.sh --target staging` first; production only after staging is
   proven, through the release gate. Name each command; the maintainer runs anything that needs
   the operator credential.

## Stop when

Every chosen bump is applied and proven on dev, the maintainer has the staging and production
commands, and no pin moved that the maintainer did not pick.
