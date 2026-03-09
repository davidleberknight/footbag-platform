# footbag-platform

> Modernizing **footbag.org** under the auspices of the **International Footbag Players Association (IFPA)**.

This repository contains the open-source modernization project for the global footbag community website.

- **Maintainer:** [David Leberknight](https://github.com/davidleberknight) (initially hosted on a personal GitHub account)
- **Institutional context:** Developed under IFPA auspices
- **Goal:** A simple, low-cost, volunteer-maintainable platform for long-term community use

Legacy site (HTTP only): [http://www.footbag.org/](http://www.footbag.org/)

## Start here

- **Humans:** read `docs/PROJECT_SUMMARY_V0_1.md`
- **AI tools:** read `PROJECT_SUMMARY_CONCISE.md`

## Current project state

**MVFP v0.1 — Public Events + Results browsing — is complete and running locally.**

- Code, tests, Docker, Terraform, seed data, and documentation are all present
- AWS deployment is the next step — see `docs/DEV_ONBOARDING_V0_1.md` Part F
- Legacy migration tooling (including mirror/results processing scripts) is present
- Some rule/policy simplification proposals are **Pending IFPA Board Decision**

## Governance

Read `GOVERNANCE.md` before contributing.

This repository distinguishes between:

- **Category A (maintainer authority):** technical implementation, repo configuration, tooling, code/docs changes
- **Category B (requires IFPA Board approval):** official IFPA policy/rules, rankings/eligibility definitions, authorized IFPA branding decisions, repository ownership transfer

Changes that are **Pending IFPA Board Decision** must not be treated as official IFPA policy.

## Contributing

Please read:

- `CONTRIBUTING.md`
- `SECURITY.md` (for vulnerability reporting — **do not use public issues**)

## Project docs

See `docs/` for project documentation and design materials.
See `database/` for the database schema sql.

## Technology stack

TypeScript · Node.js · Express · Handlebars · SQLite · AWS (Lightsail, S3, SES, CloudFront) · Docker

Stripe and additional platform integrations are planned for future slices.

## License and trademarks

- Code in this repository is licensed under the **Apache License 2.0** — see `LICENSE`
- IFPA names, logos, and marks are **not** granted under Apache-2.0 — see `TRADEMARKS.md`

---

*Built for the global footbag community.*