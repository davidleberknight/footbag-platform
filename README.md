# footbag-platform

> Modernizing **footbag.org** under the auspices of the **International Footbag Players Association (IFPA)**.

This repository contains the open-source modernization project for the global footbag community website.

- **Maintainer:** [David Leberknight](https://github.com/davidleberknight) (initially hosted on David's personal GitHub account)
- **Institutional context:** Developed under IFPA auspices
- **Goal:** A simple, low-cost, volunteer-maintainable platform for long-term community use

Legacy site (HTTP only): [http://www.footbag.org/](http://www.footbag.org/)

## Start Here

- **Humans:** read [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md)
- **AI tools:** read [PROJECT_SUMMARY_CONCISE.md](PROJECT_SUMMARY_CONCISE.md)
- **Work done already, near-term plan, and current scope:** read [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Current Project State

Some functionality is done and deployed on AWS. This is the baseline for ongoing work.

Sneak Preview: [http://34.192.250.246/events/event_2025_beaver_open](http://34.192.250.246/events/event_2025_beaver_open)

- Some legacy migration tooling is done, including a full mirror of the current live footbag.org.
- Scripts to process and clean historic event-results data are nearly complete.
- This is why the initial public scope is viewing historical events and results.
- Some official rule/policy simplification proposals were recently **Approved by IFPA Board Decision** and will be incorporated soon.

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/GOVERNANCE.md](docs/GOVERNANCE.md) (security, privacy, and historical data publication policy)
- [SECURITY.md](SECURITY.md) (for vulnerability reporting — **do not use public issues**)
- See [CLAUDE.md](CLAUDE.md) for Claude Code's standard operating rules.

## Project Documantation

- `docs/` contains the long-term product, design, and operating docs.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) contains current sprint scope, dependency analysis, and incremental planning.
- `database/` contains the schema SQL definition.

## Technology Stack

TypeScript · Node.js · Express · Handlebars · SQLite · AWS (Lightsail, S3, SES, CloudFront) · Docker · Terraform · Stripe 

## License and Trademarks

- Code in this repository is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE)
- IFPA names, logos, and marks are **not** granted under Apache-2.0 — see [TRADEMARKS.md](TRADEMARKS.md)

---

*Built for the global footbag community.*
