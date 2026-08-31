# Project Documentation

Design and specification documents for the footbag-platform modernization project.

> **AI tools:** read [`../PROJECT_SUMMARY_CONCISE.md`](../PROJECT_SUMMARY_CONCISE.md) first for orientation and routing.

## Canonical documents

- [`PROJECT_SUMMARY.md`](PROJECT_SUMMARY.md): big-picture product, architecture, and operating philosophy
- [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md): rationale, constraints, and non-negotiable design commitments
- [`DATA_MODEL.md`](DATA_MODEL.md): canonical entities, relationships, schema conventions, DB-vs-app boundaries
- [`DATA_GOVERNANCE.md`](DATA_GOVERNANCE.md): privacy boundaries, sensitivity tiers, and data-handling rules (members, historical persons, search, exports, erasure)
- [`USER_STORIES.md`](USER_STORIES.md): functional scope and acceptance criteria
- [`TESTING.md`](TESTING.md): test strategy, risk-classification rubric, coverage expectations, and verification gates
- [`DIAGRAMS.md`](DIAGRAMS.md): architecture and data-flow diagrams
- [`GLOSSARY.md`](GLOSSARY.md): cross-document terminology
- [`DEV_ONBOARDING.md`](DEV_ONBOARDING.md): developer setup and local iteration guidance
- Legacy-data migration: the design lives in the Legacy Data Migration decision in [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) and the claim and onboarding user stories; the pipeline validation gates are in [`TESTING.md`](TESTING.md). The go-live gate index, operational readiness, rollback posture, cutover sequencing and stakeholder coordination live in GO_LIVE_PLAN.md (private GitHub repo), which is the source of truth for go-live planning

## Where to look

- What must the system do? → `USER_STORIES.md`
- Why was it designed this way? → `DESIGN_DECISIONS.md`
- What entities exist and how are they related? → `DATA_MODEL.md` + `database/schema.sql`
- What does a public page/route look like? → the owning service's file-header JSDoc + `.claude/rules/view-layer.md`
- What does a service own? → the service's file-header JSDoc
- How is the system tested? → `TESTING.md`
- How do I build, deploy, or recover? → DEVOPS_GUIDE.md (private GitHub repo)
- How do I set up the project and iterate locally? → `DEV_ONBOARDING.md`
- How is the repo set up for Claude Code, and how do I change that setup safely? → `CLAUDE_CODE_GUIDE.md`

## What does not belong here

Near-term sequencing, current sprint-like implementation order, and dependency-aware work planning belong in the maintainers' private tracker, not in the canonical docs.
