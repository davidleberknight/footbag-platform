# footbag-platform

> Modernizing **footbag.org** under the auspices of the **International Footbag Players Association (IFPA)**.

This repository contains the open-source modernization project for the global footbag community.

- **Maintainer:** [David Leberknight](https://github.com/davidleberknight) (initially hosted on David's personal GitHub account)
- **Institutional context:** Developed under IFPA auspices
- **Goal:** A simple, low-cost, volunteer-maintainable platform for long-term community use

Legacy site (HTTP only): [http://www.footbag.org/](http://www.footbag.org/)

## Start Here

- **Humans:** read [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md)
- **AI tools:** read [PROJECT_SUMMARY_CONCISE.md](PROJECT_SUMMARY_CONCISE.md)
- **AI tools, for sprint scoping and accepted temporary deviations from long-term design:** read [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Current Project State

A lot of functionality is done and deployed on AWS. This is the baseline for ongoing work.

Sneak Preview on AWS staging: [https://doye1nvv64qep.cloudfront.net/events/event_2025_beaver_open](https://doye1nvv64qep.cloudfront.net/events/event_2025_beaver_open)

- The legacy-data pipeline (from a mirror of live site) is done, including major clean up of historical event results data.
- We have received the initial data dump from the live footbag.org webmaster, processing in progress...
- Technical and Functional requirements specs are complete, refer to User Stories and Design Decisions.
- The Freestyle Dictionary is done, and that's a big deal. Check it out.
- The Media sharing system works.
- The Onboarding Wizard works, used to clean up dirty club data, and link up legacy member data to new logins.
- We have Stripe payment adapters invoking Stripe directly (but no real-money tests yet).
- We can seed the full range of user personas and access them on staging for robust testing.
- Test suites are robust and include pen tests, e2e, and more.
- Claude Code skills, rules, hooks and md files efficiently guide AI coding and documentation tasks, but of course, the human in the loop is essential to get the job done correctly. 

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md).
- [docs/DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md) (security, privacy, and historical data publication policy).
- [SECURITY.md](SECURITY.md) for vulnerability reporting (**do not use public issues**).
- See [CLAUDE.md](CLAUDE.md) for Claude Code's standard operating rules.
- Talk to Dave.

## Reporting Bugs and Issues

This tracker is for **invited testers and project contributors**, not for general footbag.org end-user support. End-user questions about the legacy footbag.org site or the upcoming modernized site belong with the IFPA contact channel, not here.

The repository source is public (Apache-2.0). The triage board is private and visible only to invited collaborators.

Full guide: [docs/BUG_REPORT.md](docs/BUG_REPORT.md).

### Where to file

Open the [Issues tab → New issue](https://github.com/davidleberknight/footbag-platform/issues/new/choose) and pick a form.

### Which form to pick

- **Bug report**: general application bug.
- **Staging bug**: bug observed on staging (AWS-touching).
- **Migration or onboarding bug**: registration, email verification, legacy-claim, or onboarding-wizard flow.
- **Docs or policy issue**: documentation drift or IFPA-Board-sensitive change.

Each form prompts the minimum information needed to triage and write a regression test for the fix.

### Privacy

**Do not file security vulnerabilities in public issues.** Use the private disclosure path in [SECURITY.md](SECURITY.md) instead.

**Do not paste in public issues**: passwords, tokens, signing material, member email addresses, real names of current members, phone numbers, raw legacy archive contents, or screenshots containing member data. Redact before submitting.

Each bug fix lands with a regression test in the same PR; the issue closes when the test merges.

## Project Documentation

- [docs/CLAUDE_CODE_GUIDE.md](docs/CLAUDE_CODE_GUIDE.md): how the Claude Code harness works, why it is built that way, and how it meets Anthropic best practice. Required reading before contributing with Claude Code: the harness governs what AI-written code must follow and what it is allowed to do.
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): data model and schema semantics.
- [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md): architectural decisions and rationale.
- [docs/DEV_ONBOARDING.md](docs/DEV_ONBOARDING.md): developer setup and onboarding.
- [docs/DEVOPS_GUIDE.md](docs/DEVOPS_GUIDE.md): deployment and operations.
- [docs/DIAGRAMS.md](docs/DIAGRAMS.md): architecture diagrams.
- [docs/GLOSSARY.md](docs/GLOSSARY.md): terminology and jargon.
- [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md): go-live readiness steps: data migration, and validation gates.
- [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md): project overview.
- [docs/TESTING.md](docs/TESTING.md): testing strategy and methodology.
- [docs/USER_STORIES.md](docs/USER_STORIES.md): intended functional behaviors and success criteria.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): current sprint scope, dependency analysis, and planning.

## Technology Stack

TypeScript · Node.js · Express · Handlebars · SQLite · AWS (Lightsail, S3, SES, CloudFront) · Docker · Terraform · Stripe 

## License and Trademarks

- Code in this repository is licensed under the **Apache License 2.0**; see [LICENSE](LICENSE).
- IFPA names, logos, and marks are **not** granted under Apache-2.0; see [TRADEMARKS.md](TRADEMARKS.md).

---

*Built for the global footbag community.*