# CLAUDE.md — footbag-platform

This file is read by Claude Code at the start of every session.

---

## Project overview

Modernizing footbag.org for the International Footbag Players Association (IFPA).
A volunteer-maintained, low-cost public platform. Apache 2.0. IFPA marks are not included.

**Start here:** `PROJECT_SUMMARY_CONCISE.md`

## Tech stack

TypeScript · Node.js · Express · Handlebars · SQLite · AWS (Lightsail, S3, SES, CloudFront) · Docker · Terraform

## Repo layout

```
.claude/      Skills, hooks, settings
.github/      CI and templates
database/     Schema and SQLite files
docker/       Build tooling
docs/         Project documentation
ifpa/         Governance and official rules
legacy_data/  Mirror code and migration scripts
ops/systemd/  Production service units
scripts/      Operational scripts
src/          Application code (TypeScript/Express)
terraform/    AWS infrastructure
tests/        Integration tests
```

## Governance

Read `GOVERNANCE.md` before making any decisions.

- **Category A** (maintainer authority): code, tooling, docs, repo config
- **Category B** (requires IFPA Board approval): official policy, rules, rankings, branding, ownership transfer

Anything flagged **Pending IFPA Board Decision** must not be treated as settled.

## Non-negotiable rules

1. Never edit `.env`, `.env.*`, `*.pem`, `*.key`, or any file in `secrets/`. These are
   hard-blocked by a hook and cannot be overridden under any circumstances.

2. Never edit documentation, `.github/`, or `.claude/skills/` without explicit human approval.
   Propose the exact before/after diff and wait. Valid approval: yes / y / ok / go / approved /
   apply it / do it. Silence and Enter are not approval.

3. Never treat anything pending IFPA Board decision as resolved.

## Skills

`.claude/skills/doc-sync/SKILL.md` — load when code behavior, interfaces, or identifiers
changed and you need to check whether docs still match.

## Hooks

`block-secrets.sh` fires on every Edit/Write/MultiEdit. Hard blocks `.env`, `*.key`, `*.pem`,
and related files permanently. No override exists.

`block-git-commit.sh` fires on every Bash call. Hard blocks `git commit` and `git push`.
Prompts for confirmation before `git add`. No override exists.

Everything else — docs, infra, application code — is governed by the rules above and the
doc-sync skill, not by hooks.

## Source-of-truth order

Explicit human decisions in this session > current code > existing docs. If unclear, escalate.
