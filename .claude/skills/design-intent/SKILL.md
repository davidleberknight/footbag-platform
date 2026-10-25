---
name: design-intent
description: Finds and applies the project's design intent: a six-step procedure, the principles a passage is tested against, and where each area's intent lives. Use in plan mode, before deciding what to build or how, before asking the maintainer a question, and whenever code and a document disagree.
user-invocable: false
---

# Design intent

The authority order is in root `CLAUDE.md`; questions follow `.claude/rules/asking.md`. Documents
are generally sound but can be stale, incomplete, or drafted by Claude without a maintainer
decision. Intent is a passage's stated purpose and rationale, never your own reconstruction of it.
Intent is clear when the sources agree, when one story or decision rules on the point and nothing
contradicts it, or when the purpose leaves only one reasonable reading. Code, schema, generated
files, tracker status and any summary show what exists, never what is intended.

## The procedure

1. Name the purpose: what this page or feature is for, from its user story, background job or
   IFPA document. If none names it, say so: that is a question, not a gap to fill.
2. Read the why from the top down: the project summary's Design Philosophy, then the matching
   design decision (its rationale first), plus any cross-cutting decision it rests on. Nothing else.
3. Grounded or invented? List everything you are about to add or change (page element, route,
   service, table, redirect, migration, public text, image) and name the passage that asks for
   each. Anything unnamed is invented: drop it or ask. Text Claude drafted is not grounding.
4. Test the passage. If its rationale names no user need or goal, contradicts another decision or
   a principle, makes the site inconsistent (principle 3), or only describes what the code does,
   suspect it is stale: report the clash, do not build on it or defend it, and let the maintainer
   rule.
5. Match the nearest existing example. Two existing examples that differ are a bug to report, not
   a precedent to choose from.
6. Act or ask. If that settles it, act and name the passage that did; if not, ask under the asking
   rule. IFPA documents are never presumed stale and never edited here: a conflict with one is
   raised with the maintainer for IFPA to decide. On any other document a maintainer ruling wins,
   and the document it contradicts is corrected.

## The principles

1. The site runs a sport, within a fixed scope: IFPA footbag's members, events, results, clubs,
   rules, records, honors, governance and community, as the user stories describe. Out of scope:
   real-time features, native mobile apps, single sign-on, forums, AI moderation, advanced
   analytics. The interface is English only; members may write club and event details in any
   language.
2. The design decisions are sound by default, and their rationale is the intent; doubt one only
   by the step 4 test.
3. One site, one way: look, wording, naming, web addresses and code shape. One service and one
   controller per section, named for it; the shared building blocks and nearest example before
   anything new; a new pattern enters the standard first, then applies everywhere. Two pages doing
   the same job differently is a bug in one of them, and a document that allows it is suspect.
4. One canonical home for each thing: one page per person, each sport's data a section on it; one
   service per section; each rule at its strongest enforcement point (a type or schema constraint,
   then the conventions gate, then the service header, then prose). Extend the home; never build a
   parallel one.
5. Same code everywhere: development, staging and production run the same code, container shapes
   and schema; every environmental difference sits behind an adapter with a local stub that
   honours the live contract. No code branches on the environment, and no setting changes what
   content or permissions a page serves.
6. A classic server-rendered website: pages work without JavaScript, which only enhances; a page
   view only reads; every change is a form post answered by a redirect. Code that falls short of
   this is a bug to report.
7. Secure by default, in proportion: fail closed, match protection to the data's real
   sensitivity, prefer the control that adds no failure mode, and write down the remaining risk.
8. Two phases, and staging proves the second before launch. Before go-live nothing is live: every
   database, production's included, is rebuilt from the pipeline and the committed curated files,
   which are the source of truth for curated content; no data migrations, compatibility redirects
   or shims, and old footbag.org addresses and retired routes of this site get the standard
   not-found page. The only redirects give
   one thing one address, as the stories name them. After go-live the production database is the
   only truth, curated content is authored in the app, a marker in the database refuses any
   destructive rebuild, and changes reach it by rehearsed migration. Every behaviour that changes
   at go-live is rehearsed on staging first. At launch this principle is rewritten.

## Where intent lives (read only the matching entry)

- What a feature must do: its story in `docs/USER_STORIES.md`; jobs in `docs/BACKGROUND_JOBS.md`.
- Why the system is shaped as it is: `docs/PROJECT_SUMMARY.md`, "Design Philosophy", "Solution
  Architecture", "Development and Production Parity".
- A technical choice: the matching `docs/DESIGN_DECISIONS.md` entry, rationale first, and the
  cross-cutting entry it rests on ("Layered Architecture", "Development Parity", "One Public
  Rendering Standard").
- The sport: `ifpa/rules/`, `ifpa/SanctioningGuidelines.md`, `ifpa/IFPAMembershipStructure_2026.md`;
  how the platform applies an IFPA rule is in the user story that cites it.
- Pages, services, controllers, SQL, adapters: the view-layer, service-layer,
  controller-conventions, db-layer and adapter-conventions rules; one page's contract: its
  service's file-header JSDoc.
- Data shape: the table's section of `docs/DATA_MODEL.md`. Members, historical persons, privacy,
  search, exports: `docs/DATA_GOVERNANCE.md`.
- Go-live and migration: design decisions "Curator Content Source of Truth", "Legacy Data
  Migration", "Legacy Independence at Go-Live", "Migrations and Non-production Databases with a
  Live Production Database".
- Scope and known deviations: the private tracker (`tracker-ops` skill).
