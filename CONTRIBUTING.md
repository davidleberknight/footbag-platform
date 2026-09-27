# Contributing

Contributions are welcome. This project is maintained by
[David Leberknight](https://github.com/davidleberknight) under IFPA auspices.

## Before you start

Active work is tracked in a private maintainers' repository, and public Issues
are disabled on this repository. Before starting significant work, contact the
maintainer (see the README) so it can be coordinated there. Read
[`GOVERNANCE.md`](GOVERNANCE.md) for who decides what. For security
vulnerabilities, use the private path in
[`SECURITY.md`](SECURITY.md).

## Reporting a problem or proposing work

Contact the maintainer with a clear title, what is wrong or missing, the
specific file or area affected, what you expected, and steps to reproduce for
bugs; the maintainers file it on the private board.

**If it touches IFPA policy, competition rules, official records or rankings,
membership terms, or IFPA branding**, say so clearly: it needs the IFPA
Secretary's approval (or a Board vote where the bylaws require one) before
merge. Everything else is a technical matter for the maintainer.

## Pull requests

1. Fork and branch from `main`.
2. Keep commits small. Use conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:`.
3. Sign off every commit: `git commit -s`
4. Fill in the PR template completely.

**DCO:** No CLA required. Sign-off certifies you have the right to submit your
contribution under the Apache 2.0 licence per the
[Developer Certificate of Origin v1.1](https://developercertificate.org/).

## Code conventions

- TypeScript: no new type errors; follow existing patterns.
- Business logic belongs in services, not controllers or templates.
- Schema changes: follow conventions in `docs/DATA_MODEL.md` and `database/schema.sql`.
- Prefer the smallest safe change that preserves volunteer readability.
- No new external dependencies without prior discussion.

## Privacy and governance

Any task touching members, historical persons, search, contact fields, rosters, participant lists, exports, event results, HoF, BAP, world records, rankings, stats, or auth must follow [`docs/DATA_GOVERNANCE.md`](docs/DATA_GOVERNANCE.md). Read it before writing or reviewing code in those areas.
