# Footbag Website Modernization Project -- Project Summary

**Document Purpose:**

The Footbag Website Modernization Project upgrades footbag.org into the global community hub for the sport of footbag: a secure, open-source, low-cost platform built to be maintained by volunteers over decades. The architecture deliberately prioritizes simplicity over sophisticated features, so that future volunteers can contribute without deep specialist expertise. Its capabilities include secure voting, payment collection, and member-maintained media galleries, hosted on AWS and built on well-understood, mainstream design patterns and technologies.

## Table of Contents

- [1. Document Relationships](#1-document-relationships)
  - [1.1 Canonical Documents](#11-canonical-documents)
  - [1.2 Implementation Contracts](#12-implementation-contracts)
  - [1.3 Why This Scheme Is Efficient for Claude Code](#13-why-this-scheme-is-efficient-for-claude-code)
- [2. Design Philosophy](#2-design-philosophy)
- [3. Functionality](#3-functionality)
  - [3.1 Media Content](#31-media-content)
  - [3.2 Membership Tiers and Active Player Status](#32-membership-tiers-and-active-player-status)
  - [3.3 Voting](#33-voting)
  - [3.4 Payments](#34-payments)
  - [3.5 Emails](#35-emails)
- [4. Solution Architecture](#4-solution-architecture)
  - [4.1 Core Design Decisions](#41-core-design-decisions)
  - [4.2 SQLite Database](#42-sqlite-database)
  - [4.3 Front to Back Design](#43-front-to-back-design)
  - [4.4 AWS Overview](#44-aws-overview)
  - [4.5 Controllers and Business Services](#45-controllers-and-business-services)
  - [4.6 Technology Stack](#46-technology-stack)
  - [4.7 Distributed System Patterns](#47-distributed-system-patterns)
  - [4.8 Runtime Infrastructure and Cost](#48-runtime-infrastructure-and-cost)
- [5. Development and Production Parity](#5-development-and-production-parity)
  - [5.1 Why Perfect Parity Matters](#51-why-perfect-parity-matters)
  - [5.2 How Parity Works](#52-how-parity-works)
- [6. Security](#6-security)
  - [6.1 Authentication Design](#61-authentication-design)
  - [6.2 Image Upload Strategy](#62-image-upload-strategy)
  - [6.3 Additional Security Protections](#63-additional-security-protections)
  - [6.4 Video Content](#64-video-content)
  - [6.5 Privacy-First Design](#65-privacy-first-design)
  - [6.6 Audit Logging](#66-audit-logging)
  - [6.7 Data Encryption](#67-data-encryption)
  - [6.8 Threat Model](#68-threat-model)
- [7. DevOps](#7-devops)
  - [7.1 Backup Strategy](#71-backup-strategy)
  - [7.2 High Availability](#72-high-availability)
  - [7.3 Operational Documentation](#73-operational-documentation)
  - [7.4 Infrastructure as Code](#74-infrastructure-as-code)
  - [7.5 Testing](#75-testing)
  - [7.6 Continuous Integration](#76-continuous-integration)
- [8. Legacy Archive](#8-legacy-archive)
- [9. Volunteer Development](#9-volunteer-development)

---

# 1. Document Relationships

This project's knowledge base has two layers. **Canonical documents** hold durable design intent and requirements; an AI or a human reads only the slice a task needs. **Implementation contracts** are the lower-level standards and patterns those documents defer to, and they live at their enforcement site in code and `.claude/`. The two are listed separately below, and §1.3 explains why the split is efficient for Claude Code.

Which source wins when sources conflict is the authority order in the root `CLAUDE.md`: an explicit human decision, then the IFPA governing documents under `ifpa/` (membership, tiers, bylaws, sanctioning, rules), then clear design intent as the user stories, design decisions, data model, rules and service contracts record it. Design intent is the purpose a feature serves for the people who use it, traced from those governing documents and members' needs to the user stories' success criteria and then to the design decisions that support them; the `design-intent` skill defines it for agents. Current code shows what exists, never what is intended. Where sources disagree, the answer is worked out from the intent down, and a maintainer decides only when that leaves it unclear.

## 1.1 Canonical Documents

**User Stories:** Defines complete feature scope and the release each story belongs to, and describes what users must be able to achieve, with success criteria (system side effects). Source of Truth for Functional Requirements.

**Project Summary (this document):** Provides a high-level introduction to the Footbag Website Modernization Project, explaining what the system does, why it is designed this way, and the major solution architecture choices that follow from the Design Decisions and User Stories documents. It is written for people and aims to cover every part of the project, but it is not a requirements source: it summarizes the design and must stay consistent with User Stories and Design Decisions; where they differ, those documents govern.

**Design Decisions:** Captures technology and design decisions and their rationale. It explains why major choices were made, and which constraints are intentional, with implementation details where known or applicable. It is the Source of Truth for design commitments and non-functional requirements from which the Solution Architecture follows.

**Data Model:** Defines canonical data schemas and conventions for all persisted entities. It is the Source of Truth for entity types, common fields, storage layout, key structure, relationships between entities. Each service's file-header JSDoc defines which tables it owns and the required persistence patterns; this document defines the schema itself. The schema sql file goes with this, to create the SQLite database.

**Data Governance:** Canonical policy for member-data visibility, public historical records, search and anti-enumeration, exports, logging hygiene, and derived statistics. Source of Truth for privacy boundaries; the rationale behind these rules lives in Design Decisions, and the two must not contradict.

**Testing Strategy:** Defines how to derive, layer, and verify tests across routes, services, and pure functions, with a risk-classification rubric, coverage expectations, and verification gates. Strategic context that pairs with the operational testing rules in `.claude/rules/testing.md`.

**Migration and go-live** (listed here for orientation): migration and go-live planning lives in GO_LIVE_PLAN.md (private GitHub repo) — the gate index, the cutover state machine, the launch sequencing, the rollback posture, the operational-readiness gate detail (backup, observability, edge security, IAM, email ops, maintenance jobs, secrets rotation, pre-cutover reverts), and the stakeholder coordination. The legacy data migration design it carries out (streams, claim flow, auto-link, merge rules, club bootstrap, name model, competition history) is the Legacy Data Migration decision in Design Decisions, with the member-facing behaviour in the claim and onboarding user stories. The pipeline validation gates that govern the data load are in Testing Strategy; the private plan carries a copy of them and wins where the two disagree.

**Operations** (listed here for orientation): develop, test, build, release, operate, and recover procedures across environments (dev, stage, prod), including operational runbooks, CI/CD pipeline implementation, and infrastructure management procedures, live in DEVOPS_GUIDE.md and AWS_OPERATIONS.md (private GitHub repo), not in this repository.

**Developer Onboarding:** The single ordered procedure for contributors: set up a workstation, run the site locally, run the test suite, and learn the architecture, with a lane for each kind of contributor (developer, tester, initial operator). Testers then follow TESTING_GUIDE.md (private dev-tester repository), and bug reports go to the private dev-tester repository.

**Freestyle Guide:** Orientation for maintainers of the freestyle subsystem: what it covers, who owns each fact, and how to change it safely after go-live.

**Claude Code Guide:** How the repository's Claude Code setup works and how to change it safely.

**Project Summary for AI:** `PROJECT_SUMMARY_CONCISE.md`, orientation and routing for AI tools: which document to read for which need.

**Glossary:** Jargon definitions and acronym reference for technical terms for humans.

**Diagrams:** Visual aids: production infrastructure topology, the four-layer software architecture, authentication and session flow, request routing, read and write request flow, and development versus production parity.

**Work tracking** (listed here for orientation): active work, current scope, defects, and accepted implementation deviations are tracked in a private maintainers' repository, a kanban-style issue board, kept private for member-data privacy. The canonical documents above describe design intent and carry no implementation status.

## 1.2 Implementation Contracts

These are not documents in the suite; they are the lower-level standards and patterns the canonical docs defer to, each living at its enforcement site so it stays next to the code it governs.

**View-layer standard:** The public-rendering standard (the `PageViewModel<TContent>` contract every page consumes, the reusable primitives, the CSS-vocabulary discipline, and the visual standard) lives in `.claude/rules/view-layer.md`; each page's rendering contract, audience, and sensitive-page invariants (privacy gates, anti-enumeration, owner-only boundaries, public/private profile boundary) live in the owning service's file-header JSDoc; durable view design intent lives in the Front-End / UI Technology part of Design Decisions; the route list lives in `src/routes/publicRoutes.ts`.

**Service-layer design:** Ownership boundaries for every service under `src/services/**`, the cross-cutting required patterns, and the non-negotiable service invariants live at their enforcement site: each high-stakes service's file-header JSDoc, the path-scoped `.claude/rules/*.md` files, and the Back-End Services and Patterns and Data Model parts of Design Decisions, with schema triggers. Pair with code, tests, and TypeScript types for current method shapes.

**Rules (`.claude/rules/`):** Cross-cutting AI coding rules (db-layer, service-layer, view-layer, testing, comments, doc-governance, and others). Most are scoped to the paths they govern; the asking and memory rules apply everywhere. Before writing code, the matching skill and every touched path's rules are read explicitly.

**Skills (`.claude/skills/`):** Repeatable procedures and on-demand knowledge (add a public page, extend a service contract, write tests, run a doc-sync, design intent) that load when a task matches them.

**Service file-header JSDoc:** The per-service and per-page contract: ownership boundary, required patterns, invariants preserved, transaction discipline, persistence, and side-effect categories. Auto-loads with the file every time the service is read.

**Code comments:** Plain-words, self-contained WHY at the point it matters, governed by `.claude/rules/comments.md`.

## 1.3 Why This Scheme Is Efficient for Claude Code

All important design decisions live in one authoritative home, Design Decisions, so the reasoning behind the system is found in a single place. The lower-level implementation standards and patterns (how a page renders, how a service is shaped, how the database layer is called, how a test is derived, naming and SQL conventions) live instead at their enforcement site, next to the code they govern. That placement is what makes the knowledge base efficient for Claude Code:

- **The right contract loads at the right moment.** A service's file-header JSDoc auto-loads whenever the service file is read; a path-scoped `.claude/rules/*.md` auto-attaches when work happens inside its path; a `.claude/skills/*` triggers when a task matches it. Each standard is found by the path or task it governs, so it is loaded when that code is touched, without first loading the whole documentation suite.
- **Each fact has one home.** A canonical doc states the design; it does not restate a contract that a JSDoc, rule, or skill already owns. One home per fact minimizes both drift between sources and the tokens spent re-reading duplicated content.
- **Reading stays selective.** Because durable design intent is separated from enforcement-site detail, an AI reads only the canonical slice a task needs (per the read order in the root `CLAUDE.md`) and loads the precise lower-level contract for each path it edits.

---

# 2. Design Philosophy

**The Maintenance Problem:**

Traditional community websites use databases, application frameworks, and complex architectures requiring specialized expertise. When volunteer developers move on, institutional knowledge leaves with them. New volunteers face steep learning curves. Systems become unmaintainable, requiring expensive contractors or eventual replacement. This Footbag Website Modernization Project inverts this to optimize for volunteer maintainability, not technical sophistication.

**Transparency Over Abstraction:**

All system state lives in a SQLite database file with human-readable schema. Any volunteer can inspect data using the standard sqlite3 command-line tool, understand state through SQL queries, and verify correctness without specialized tools beyond basic SQL knowledge.

**Simplicity Over Features:**

The platform deliberately avoids complexity. Minimal database configuration. No message queues requiring monitoring (except for email outbox). No complex frameworks. No sophisticated design patterns. Minimal derived data structures requiring synchronization. Instead: the system stores code and operational artifacts as simple files in folders, while application data lives in a single SQLite database file (except photo data which lives in an AWS S3 bucket), runs on standard Docker containers in a straightforward AWS environment, coded using popular languages and frameworks, all with clear documentation.

**Community Trust Over Control:**

Members can upload media content (photos and links to videos), lead clubs, and launch events, with administrator approval required only to set up sanctioned, paid event pages. Rather than creating moderator hierarchies, the system trusts members to flag problematic content. Admins provide oversight, not gatekeeping (by reviewing member-flagged content for possible deletion). All administrative actions are logged, with reason provided, in a way that is tamper proof.

---

# 3. Functionality

Complete functional requirements with success criteria are in the User Stories document. Not everything here ships at launch: the Release Scope section of User Stories names what follows in later releases, voting and elections and the news feed among them, and those stories are written in full as settled design for that build. The functionality closely follows the legacy footbag.org site, but with usability improvements for members, payments and email integration, secure voting, and much improved admin powers.

The site is a public-facing community hub with a tiered membership model: Visitors can browse public clubs, events, news, tutorials, media, the freestyle trick dictionary, official rules, and public historical records (competition results, world records, Hall of Fame). Members (Tier 0+) authenticate to participate (create a profile, club affiliation, event registration, email preferences, donations/payments, and personal data controls). Tier 1+ Members add community creation (media uploads, galleries/hashtags) and can take on leadership roles by creating clubs and free events. Tier 2+ members unlock advanced eligibility, including the ability to apply for IFPA event sanctioning and sponsorship; payments are a separate capability that may be enabled for events via admin approval.

Club Leaders manage a club's presence and lifecycle with a small co-leader team, and Event Organizers run an event end-to-end (registration operations, attendee communications, and results publication), with sanctioned/paid events gated through an admin-approved process. Platform governance is supported by Administrators who handle moderation, approvals, finance operations, vote administration, communications, and system configuration, with strong auditability across privileged actions.

Discovery and content are unified by a shared media model: the platform hosts uploaded photos while videos are link-based, and everything (clubs, events, tutorials, and media) ties together through hashtags and galleries so event/club activity naturally aggregates into browsable collections. Community safety is human-reviewed: members can flag content and admins take explicit, reasoned actions if required.

Footbag-specific content is organized by category (freestyle, net, and sideline). The freestyle trick dictionary is a public reference surface covering tricks, component sets, modifiers, a glossary, notation, and add/combo analysis, with multiple browse views. Curated freestyle tutorial media, drawn from established instructional series, is maintained separately from member-uploaded media. Official IFPA competition history is published as public historical surfaces: event results and year archives, world records, Hall of Fame and Big Add Posse honorees, and historical-person pages. These are public historical records governed by the Data Governance policy, which keeps historical discoverability separate from current-member discovery. Official rules, practical equipment guidance, and IFPA governance documents are published as public reference pages.

Money and governance are first-class: Stripe-backed payments support donations (one-time/recurring), membership upgrades, and paid event registration, with member-visible payment history and admin reconciliation/controls. The site also includes privacy-preserving voting (encrypted ballots with verifiable participation), where eligibility can be tier-based and influenced by special flags, including Hall of Fame (HoF), Big Add Posse (BAP), and Board/Admin status.

When system events require administrator attention (event sanction requests, flagged media, leadership reassignments, payment reconciliation issues, election management tasks, etcetera), the system creates work queue items visible on the admin dashboard. When an item is added to the queue, an urgent task type emails the admin-alerts mailing list immediately, and a routine one is read on the queue and rolled up in each administrator's periodic digest; either way the notification carries only the task type and entity ID (no sensitive member data such as email addresses, payment amounts, or personal information). This ensures timely admin awareness while preserving data privacy.

**Out of Scope:**

- Real-time features (WebSockets, live updates).
- Mobile native apps.
- OAuth/SSO authentication.
- Forums/discussion boards.
- AI/ML content moderation.
- Multi-language support (English only, except event info).
- Advanced analytics and BI.
- Third-party REST API.
- Member video uploads (members link YouTube or Vimeo; the platform hosts only the system account's curated video and the legacy archive's videos).
- Animated GIFs (use video links).
- Direct organizer payouts (Stripe Connect).
- Archive search.
- Marketplace beyond event registrations and donations.
- E-Commerce (a store) is a possible later addition. We can raise money and provide cool merch to the community. This might include adding PayPal as a second payment option (after Stripe) for user convenience.
- Merging the full content from FootbagHallOfFame.net onto Footbag.org is a possible later addition, which would eliminate the cost of hosting that site on SquareSpace.

## 3.1 Media Content

Members upload photos and share links to videos into named galleries, and then use hashtags to further drive organization and discovery. Standardized hashtags provide reliable structure for event and club galleries, while freeform hashtags let members create organic community vocabulary and organization.

**Standardized hashtags** (social-platform format)

- Event tags: #event_{year}_{event_slug} (e.g., #event_2025_beaver_open)
- Club tags: #club_{location_slug} (e.g., #club_san_francisco).
- These tags are validated at event/club creation to prevent duplicates and become the canonical identifier used for automatic gallery linking.
- Tag matching is case-insensitive, while preserving original capitalization for display quality.

**Freeform hashtags**

- Members can add any tags (e.g., #ripwalk, #tutorial) with only basic security/length checks; freeform tags do not create entity linking, but power browsing and discovery.

**Discovery and browsing**

- A tag links to its tag gallery (photos + videos) wherever media carries it, and the gallery offers co-occurring tags as filter suggestions. The public /media/browse landing provides Popular Tags and All Tags; both list only public tags: those used by at least two distinct members, plus tags on curator-published content.

**Auto-generated event/club galleries**

- Event/club pages detect whether at least one media item exists for the standardized hashtag and show "View Event Gallery / View Club Gallery" links accordingly. Galleries are built from metadata scanning and optimized for fast loads (caching + progressive enhancement).

**Ownership and change propagation**

- A single media item can appear in a member's personal collection and multiple event/club galleries simultaneously (no duplication). Members can delete media anytime, and tag edits immediately move content into/out of galleries (with short CDN caching delays for visibility).

**Data Storage**

Photo data is handled separately from application data, in a dedicated AWS S3 bucket (not the SQLite database). The photo data is large and will grow over time, and so storing this together with Lightsail would blow out the size, and therefore the cost, and this is why we store photo data in S3. Uploaded photos are processed into standardized display variants, security-processed before storage, and stored in S3. Original files are discarded after processing. 

## 3.2 Membership Tiers and Active Player Status

The platform supports four lifetime IFPA membership tiers plus a temporary Active Player status for Tier 0 members. The following bullets summarize capabilities; the detailed member, administrator, event organizer, and club leader user stories define the exact behavior. The authoritative IFPA membership policy lives in `ifpa/IFPAMembershipStructure_2026.md`.

- **Tier 0 (Registered Member):** Free registered account; lifetime. Can log in, manage profile, use authenticated member search (anti-enumeration, non-directory), join up to two clubs, view and register for events, read news feed, access historical archive, and manage email subscriptions. Tier 0 is non-voting and is not counted in the Official IFPA Roster unless the member holds current Active Player status.
- **Tier 1 (IFPA Member):** Purchased lifetime membership (default USD $10). All Tier 0 privileges plus upload photos and video links, flag questionable media content, create a club, vote, create basic (free) events.
- **Tier 2 (IFPA Organizer Member):** Purchased lifetime organizer membership (default USD $50). All Tier 1 privileges plus the ability to apply for event sanctioning/sponsorship, create paid events, send emails to the IFPA announce mailing list, access organizer-only areas, and vouch for Tier 0 members to grant or extend their Active Player status.
- **Tier 3 (IFPA Director):** Governance status assigned by IFPA (elected/appointed per By-Laws). Includes Tier 2 privileges plus board-level voting privileges and direct roster access. Tier 3 carries an underlying membership tier (Tier 1 or Tier 2); when Tier 3 status ends, the member returns to that underlying tier. A Tier 0 member who becomes Tier 3 receives Tier 1 as their underlying tier.

**Active Player Status:**

- Active Player is a temporary status available to Tier 0 members only. While current, it gives the Tier 0 member Tier 1 benefits but does not change their membership tier.
- Active Player lasts 730 days from the most recent qualifying event attendance, vouch, or one-time club-join grant.
- Sources: (a) attending any event officially registered through the IFPA website, (b) being vouched for by a Tier 2 or Tier 3 member, (c) one-time grant on first IFPA club join (only if the Tier 0 member has never previously been Active Player).
- A later qualifying source extends Active Player; an older source must not shorten an existing later expiry date.
- If a Tier 0 Active Player purchases Tier 1 or Tier 2, Active Player status ends because Active Player applies only to Tier 0.
- If a Tier 0 Active Player becomes Tier 3, Active Player status ends and the underlying tier is set to Tier 1.
- Active Player expiry reminders use two Administrator-configurable pre-expiry offsets (defaults: T-30 days and T-7 days) plus a built-in day-of expiry notification (T+0, not separately configurable).

**Membership Tier Lifecycle:**

- Membership tiers do not expire. Only Active Player status expires.

**Special Designations:**

- Hall of Fame (HoF): Permanent honor; induction grants Tier 2.
- Big Add Posse (BAP): Permanent honor; induction grants Tier 2.
- Board Members: Tier 3 while serving (governance status).
- Site Administrators: Hold at least Tier 2; granting the role raises a lower-tier member to Tier 2.

**Official IFPA Roster:**

- Includes Tier 1, Tier 2, Tier 3 members, plus Tier 0 members with current Active Player status.
- Excludes Tier 0 members without current Active Player status; excludes deceased members.
- Not public. Tier 2 or Tier 3 members may access it for official IFPA event and organizer purposes.

Standardized member attributes: membership tier (Tier 0, Tier 1, Tier 2, or Tier 3), Active Player status (where applicable), clubLeader (per club), eventOrganizer (per event), HoF (Hall of Fame), BAP (Big Add Posse), is_admin (Site Administrator).

## 3.3 Voting

Voting is a later-release feature; its design is settled. The platform provides Admin-configurable voting services, using server-side ballot encryption with voter privacy protections and audit logging, giving IFPA full control. Ballots submitted as plaintext over HTTPS and encrypted server-side using AWS KMS envelope encryption before storage. Decryption requires separate privileged role used only in tally operations.

A vote could be run for IFPA Board elections, Hall of Fame elections, or single-topic votes for IFPA Board members (for example a rule change). It's all configurable based on member attributes (Tier status, HoF/BAP/Board flags) or explicit inclusion lists, as defined when creating a vote configuration. Admins can run a vote and then act on the results manually.

Full platform control ensures governance independence and long-term sovereignty. One-time development investment eliminates permanent vendor dependency and ongoing costs. Server-side encryption keeps keys secure (never exposed to browser). Bespoke implementation aligns with project philosophy: simplicity, transparency, member ownership.

Ballots are encrypted server-side using AWS KMS envelope encryption. Decryption requires a separate privileged IAM role used only during controlled tally operations, ensuring vote privacy is maintained even from platform administrators during the active voting period. 

## 3.4 Payments

Stripe handles all credit card processing with separate Live/Test API keys per environment. IFPA acts as intermediary. The platform collects event registration payments via Stripe and records/reconciles transactions. Transfer of funds to event organizers occurs outside this system, a manual IFPA process.

Admin approval required before payment features activate for any event. Funds flow to IFPA's Stripe account, not to individual organizers. Manual distribution provides IFPA oversight and reconciliation capability. Organizers never directly handle money. All transactions logged with comprehensive audit trail.

Using Stripe offloads PCI compliance (no card data touches our systems). Stripe test mode enables payment testing without moving real money; dev and staging use the stub adapter. Required for processing membership dues, event registrations, and donations.

Stripe webhooks are treated as durable input events; the system records them, applies idempotent payment state transitions, and runs nightly reconciliation that produces durable discrepancy reports for admins. Duplicate deliveries from Stripe retries do not cause duplicate payments or refund processing. A webhook handler validates signatures and processes payment events to update local payment records and trigger downstream effects (tier upgrades, receipts, registration confirmation).

All payment state transitions are tracked to prevent financial reconciliation failures. A nightly reconciliation job compares local payment records against Stripe to detect discrepancies.

Note that it is possible to add PayPal as a second option for user convenience in the future.

## 3.5 Emails

The platform sends all transactional and bulk email via AWS SES using an Outbox pattern that decouples email reliability from request processing. This provides reliable delivery with retries, auditability, and operational controls. Full implementation details (poll interval, retry behavior, dead-letter handling, pause toggle) are in Design Decisions and User Stories SYS_Send_Email. SES bounce and complaint notifications, polled from a queue, keep mailing list subscription status current.

Mailing Lists: Lightweight MailingList and MailingListSubscription entities provide clear, query-friendly model. Event participant lists (organizers only), the IFPA announce list (Tier 2 and Tier 3 members), and the general lists such as the newsletter (admins only). Member-controlled subscription preferences stored via MailingListSubscription provide transparency and control. SES bounce and complaint handling keeps email lists clean automatically.

---

# 4. Solution Architecture

The modernized Footbag.org is a traditional web application in which the pages are rendered on the server. Visitors and members use a browser to request pages from AWS CloudFront, which forwards dynamic requests to the Lightsail-hosted web application. The Presentation Layer renders HTML using Handlebars templates, then plain per-page JavaScript provides interactive behavior in the browser (for usability-enhancing features that need validation/autocomplete/media previews) while page navigation remains server-rendered.

Controllers handle HTTP requests, calling services and returning HTML or JSON based on request context. Services implement the business rules, and all persistent state is stored in SQLite except for photos. A single TypeScript file, db.ts exports prepared SQL statements, database connection, and transaction helpers. This separation keeps the front end (pages, forms, interactions) clearly distinct from the business logic, which is separated from the back end storage, and AWS infrastructure.

## 4.1 Core Design Decisions

The following key solution architecture decisions define how the new Footbag.org is built. This subsection is a summary only, as later sections of this document and the Design Decisions document provide the full rationale.

- Data storage: All application data (except photos) is stored in a single SQLite database file named `footbag.db`. The application runtime opens that filename directly. Local and production host paths may differ, but Docker/Compose mounts the host directory that contains the DB into the application working directory at `/app/db`, so the WAL and SHM sidecars live alongside the main DB file and are shared across the web and worker containers (the DB is visible at `/app/db/footbag.db`). Photo data is stored in a separate AWS S3 bucket. Queries are expressed as prepared SQL statements in a single `db.ts` module (plus transaction helpers) that services call directly by query name. 
- Server-rendered web application: The site is a traditional multi-page web application. HTML pages are rendered on the server using Handlebars templates. Client-side JavaScript is used for validation, autocomplete (optional), media previews, and similar conveniences.
- Four-layer software architecture: The code is organized into Services (business logic), Middleware (cross-cutting HTTP concerns such as authentication and origin pinning), Controllers (per-route HTTP glue), and Adapters (external services), with Handlebars views rendered by the controllers.
- JWT-based sessions with per-request validation: Members authenticate via short-lived JSON Web Tokens stored in secure cookies, including a passwordVersion field so password changes immediately invalidate old tokens, like this: per-request validation compares JWT passwordVersion claim with the current passwordVersion datum; a password change increments passwordVersion, immediately invalidating all sessions across all devices. Authorization decisions (tier/role) are evaluated against the current database state on each request, not only JWT claims.
- Immutable audit logs: Governance- and security-significant changes are recorded in an append-only immutable audit table, kept for seven years.
- Single Lightsail origin with CloudFront CDN: A single Docker-based application instance on AWS Lightsail handles dynamic requests behind an AWS CloudFront distribution.
- Archive.footbag.org: The legacy Footbag.org site is preserved as a static HTML mirror in a dedicated S3 bucket and delivered via CloudFront at archive.footbag.org.

These decisions are summarized here for context. Full rationale, trade-offs, and alternatives considered are documented in the Design Decisions document.

## 4.2 SQLite Database

This is a key decision that balances simplicity with query performance, transaction safety, and data integrity. Our approach uses the industry-standard SQLite database with minimal configuration and maximum benefit. All the database data is stored in a single file (footbag.db) with a straightforward relational schema.

All data access is invoked from Service-Catalog methods that in turn call prepared SQL statements (and transaction helpers) defined in a single code module (db.ts).

With moderate data volumes and CloudFront caching, SQLite provides excellent query performance while maintaining operational simplicity.

**What We Gain:**

- Query performance: SQL with indexes.
- Transaction safety: ACID guarantees.
- Data integrity: Foreign key constraints enforced by database.
- Minimal configuration: no complex tuning required.
- Inspectable data: Standard sqlite3 CLI tool shows schema and data.
- Simple backups: Single file uploaded to S3 every 5 minutes.
- No database licensing or managed service costs.

**What We Accept:**

- Single-writer constraint.
- RPO 5 to 10 minutes.
- Basic SQL knowledge required.
- Schema migrations require maintenance window, brief downtime.

For a community site at this scale, the design, development, maintainability, and cost gains outweigh the minimal added complexity of a relational database (as opposed to a strictly JSON-file-based approach). SQLite requires no server processes, no connection pooling, no replication configuration.

**Data Access Pattern:**

All data access occurs through a single database module (db.ts) that exports prepared SQL statements and a transaction helper. Services call prepared statements directly with parameters. Each statement is prepared on first access through a named getter, so importing the module never depends on the schema being in place.

Statement naming follows consistent pattern: entityByField (memberByEmail, eventById), entitiesByField for arrays (eventsByOrganizer), createEntity (createMember), updateEntity, deleteEntity. Positional parameters (?) prevent SQL injection attacks. Error handling catches specific code for consistency. Transactions acquire write lock immediately, wrapping multi-step operations with automatic commit or rollback.

## 4.3 Front to Back Design

The code follows a four-layer structure separating concerns:

**Presentation Layer (Frontend):**

JavaScript enhances interactive features. Core pages are server-rendered HTML. JavaScript validates form fields before allowing submission via traditional browser POST (not fetch). Server-side validation remains authoritative (defense-in-depth). Pages render and forms submit where JavaScript is unavailable. This is simple for volunteer maintainability, with traditional multi-page navigation. It is SEO-friendly, fast initial load, and simple to understand.

The platform targets modern browsers and uses JavaScript for interactive features (including pre-submit form validation and optional enhancements such as hashtag autocomplete and progressive image loading). Stripe's hosted checkout page is the one feature that requires it. Exact browser support baseline versions are defined in the Design Decisions document.

**How Page Loads Work:**

Every primary view (home page, event listings, club directory, member dashboard, admin dashboards) is reachable via a stable, bookmarkable URL. When the browser requests such a URL, the server resolves it to a TypeScript Controller function, which invokes a Service method for the business logic if authorized. Page-access authorization decisions are always derived from the current member record in the database on each authenticated request, not from cached JWT claims. This ensures member tier or role changes, and password resets take effect immediately (rather than waiting for JWT expiry). Controllers render full HTML pages using Handlebars templates. Services call prepared SQL statements exported from db.ts (via named query objects) against the SQLite database.

**JavaScript Enhancement:**

Browser-side JavaScript attaches to specific pages for usability enhancements such as inline validation, autocomplete, dynamic filters for lists, file previews, and drag-and-drop for media uploads. Templates remain server-rendered by Handlebars. Forms submit via native browser POST; JavaScript acts as a client-side validation gate to catch errors before submission, improving UX but not blocking functionality, as server-side validation is authoritative. The site functions without JavaScript: forms still submit and navigation still works. The one functional exception is Stripe's hosted checkout page, which requires JavaScript as a third-party dependency.

**Page Navigation:**

On the site, each meaningful URL corresponds to a real server-rendered page. When the user clicks a link or submits a form, the browser performs a normal HTTP request and receives an HTML response. Some pages may use JavaScript-driven interactions (for example filters or "Load more" controls) where explicitly implemented, but core navigation remains normal link/form HTTP requests to server-rendered pages.

**Static Assets and CDN:**

CSS, JavaScript, images, and fonts are served from the origin and cached at CloudFront under a content-hash version token in the URL, computed at runtime with no bundler. HTML pages are rendered at the origin and not cached at CloudFront; the Express middleware sets `Cache-Control: private, no-store` on every authenticated response.

Templates reference assets only through the asset helper, which appends the version token, so each deploy refreshes the CDN without an invalidation. Files are overwritten in place on deploy, so old versions never accumulate and no cleanup job is needed.

**Controllers Layer (HTTP Interface):**

Handles HTTP request/response cycle. Parses and validates input against a schema at the trust boundary. Receives the authenticated member from the authentication middleware. Calls appropriate service methods. Maps service responses and errors to HTTP responses, including rate-limit refusals raised by the services. Controllers act as the reception desk; they receive requests, verify credentials, route appropriately, and format responses.

**Controller Pipeline for Form Submissions:**

Controllers validate authentication/authorization and enforce HTTP verb discipline (no mutations on GET). State-changing requests are permitted only when authorized. If the origin is unavailable or returning 5xx errors, CloudFront serves the maintenance page. Operational states are normal and maintenance; maintenance is entered automatically on origin failure or deliberately for a planned window (the CloudFront error-pages decision, in DESIGN_DECISIONS).

**Response Format Negotiation:**

Default: server-rendered HTML redirect/rerender flows. JSON responses are returned only on designated webhook/callback or AJAX endpoints where they are functionally required. For JSON-only routes, enforce Content-Type: application/json.

**Form Handling:**

On success: performs the operation using services, then returns a redirect (Post/Redirect/Get pattern) to the next page (for example a confirmation page) that shows the updated state.

On failure: prepares a view model that includes the original user input, field-level errors, and any global error messages, then renders the same form with highlighted errors and preserved values.

**Authentication and Sessions:**

Login and logout flows use the same form + controller + template pattern. After successful login, subsequent requests reflect the authenticated member's state in navigation and views (for example "My Account", "Dashboard", "My Clubs", "My Events"). If a member attempts to access a protected URL without a valid session, the UI redirects them to the login page and, after successful login, returns them to the originally requested URL when appropriate. When a session expires or becomes invalid (for example after password change), the UI consistently redirects to login with a clear message.

**Services Layer (Business Logic):**

Contains all domain logic and business rules (documented in each service's file-header JSDoc, derived from User Stories). Performs authorization checks beyond basic authentication. Validates business constraints (the two-current-club membership cap, single-club leadership, event capacity, email uniqueness, hashtag uniqueness, etcetera). Reads and writes data via prepared SQL statements (and transaction helpers) exposed by the shared db.ts code module. Manages cross-cutting concerns: email queueing and audit logging. Services are the back office; they do the actual work while controllers handle communication.

**Infrastructure Layer:**

Provides abstractions for External Services making them look identical whether running locally (development) or in production. These are code-level abstraction layers in the back end which provide developer-production parity, and allow developers to build and test code without using AWS credentials or live links to the other systems.

- JwtSigningAdapter: `createKmsJwtAdapter` signs JWTs via AWS KMS in staging and production; `createLocalJwtAdapter` signs with a file-based RSA keypair in dev/test. Both use RS256.
- SesAdapter: `LiveSesAdapter` sends via AWS SES in production; `StubSesAdapter` captures messages in memory for dev, test, and staging.
- MediaStorageAdapter: `S3MediaStorageAdapter` for staging/production; `LocalMediaStorageAdapter` for dev. Content-agnostic; handles photos, system-account video bytes, and posters identically.
- SecretsAdapter: `LiveSecretsAdapter` reads SSM SecureString in staging/production with KMS decryption and lazy in-process cache; `StubSecretsAdapter` is an in-memory map used by tests and by local development, where every consuming adapter runs its own stub and asks it for nothing. Distinct from env-var secrets (`SESSION_SECRET`, host runtime config) which load via dotenv.
- SafeBrowsingAdapter: `LiveSafeBrowsingAdapter` calls the Google Safe Browsing v4 threatMatches:find endpoint in production; `StubSafeBrowsingAdapter` consults an in-memory deny list in dev/test.
- HttpReachabilityAdapter: `LiveHttpReachabilityAdapter` performs outbound HEAD probes with redirect-follow and per-hop SSRF re-check in production; `StubHttpReachabilityAdapter` in dev/test; `DisabledHttpReachabilityAdapter` opts out of all outbound HTTP from the validation path.
- ImageProcessingAdapter: `HttpImageAdapter` calls the in-cluster image worker container in all environments; tests inject test doubles.
- VideoTranscodingAdapter: `HttpVideoTranscodingAdapter` calls the in-cluster image worker container in all environments; tests inject test doubles.
- PaymentAdapter: `createLivePaymentAdapter` (Stripe SDK) in production once payments are armed; `createStubPaymentAdapter`, an in-process Stripe simulation, everywhere else, staging included.
- NotificationFeedAdapter: polls the queues carrying SES bounce, complaint and alarm notifications in staging and production; an in-memory stub in dev and test.
- BallotEncryptionAdapter: KMS envelope encryption for ballots in staging and production; a locally keyed implementation in dev and test.
- CaptchaAdapter: `createLiveCaptchaAdapter` verifies Cloudflare Turnstile in production; `createStubCaptchaAdapter` in dev, test, and staging.

This layer is the translation service. Services call generic interfaces; infrastructure routes to appropriate implementation based on environment (dev, stage, prod).

## 4.4 AWS Overview

**Why AWS Was Selected**

The platform could run on any cloud provider (Azure, Google Cloud, DigitalOcean) or on-premises infrastructure. AWS was selected because:

- Maturity and Stability: Twenty years of proven reliability with extensive documentation and community knowledge.
- AWS has all the features we need at a low price.
- Pay-As-You-Go Pricing: No minimum commitments or enterprise contracts.
- Free Tier Benefits: First year includes substantial free usage.
- Service Integration: Native integration between services reduces complexity.
- Portability: Design uses standard S3 APIs and Docker containers.

**Key AWS Services:**

- AWS Lightsail: Simplified virtual server (4GB RAM, 2 vCPUs) hosting all Docker containers in us-east-1 region.
- AWS S3: Object storage with 99.999999999% durability; primary bucket (us-east-1), backup bucket (us-west-2), and archive bucket for footbag.org mirror.
- AWS CloudFront - Global CDN for caching content at edge locations globally, and serving custom error pages when the origin is unavailable. When the Lightsail origin returns 5xx errors or is unreachable, CloudFront serves a maintenance page from S3. 
- AWS SES: Email delivery with authentication (SPF, DKIM, DMARC) and bounce handling.
- AWS Parameter Store: Stores webhook/Stripe secrets and non-key config. JWT tokens are signed with an AWS KMS asymmetric key; signing keys are not stored in Parameter Store. SecureString secrets (organized hierarchically under /footbag/ namespace with /production/, /staging/, /development/ environment subpaths) can hold sensitive configuration details that must not be checked into source control.
- AWS CloudWatch: Unified monitoring service for logs, metrics, and alarms.
- AWS Route 53: DNS service routing traffic to CloudFront distributions.

**IAM Security Approach:**

All AWS services accessed with least-privilege IAM (Identity and Access Management) policies:

- Deployed workload runtime assumed role(s) limited to: S3 operations on primary/backup buckets only, SES send operations bounded to the permitted From addresses by policy condition, Parameter Store read-only on /footbag/ namespace, and CloudWatch put metrics/logs as required. The Lightsail host does not rely on an EC2-style instance role attachment; runtime AWS access uses explicit runtime role assumption.
- Parameter Store uses AWS SecureString encryption.
- KMS keys have minimal access per security rules.
- Buckets are private: viewer reads come only through CloudFront origin access control, and the application reaches them only through its runtime role's scoped IAM grants.
- Object Lock in governance mode on the cross-region backup bucket, so no ordinary credential can delete or overwrite a retained snapshot.

**System Administrator vs Application Administrator Roles:**

The platform distinguishes between two distinct administrative roles with different responsibilities and access levels:

- System Administrator (Developer Role): Technical staff responsible for AWS account setup, IAM policy configuration, billing management, infrastructure provisioning, and deployment operations. This role is necessary for initial platform setup and ongoing infrastructure maintenance but does not require access to application-level member data or business operations. Examples: change alarm or job schedules in Terraform, rotate Stripe keys with the reviewed provisioning script, adjust per-container memory limits in `docker-compose.prod.yml`, configure SES domain authentication. Every change reaches AWS only through a reviewed, tested and audited script (Terraform through the apply script, secrets through the provisioning scripts), never by a hand-typed command or a console change, so nothing is applied that the repository does not record.
- Application Administrator (User Role): IFPA Board members or designated volunteers who manage day-to-day platform operations through the web interface. Application administrators can moderate content, manage member flags, approve event sanctions, handle payment disputes, and access audit logs for governance purposes. This role operates entirely through the web application and has no direct AWS infrastructure access.

This separation follows AWS security best practices for least-privilege access: system administrators manage infrastructure but cannot directly access or modify member data without audit trails, while application administrators manage community operations without infrastructure permissions. All system administrator AWS actions are logged via CloudTrail, and all application administrator actions are logged via the platform's audit logging system.

## 4.5 Controllers and Business Services

The platform uses a single controller layer that handles all HTTP interactions. Controllers are HTTP request handlers that:

- Receive and validate HTTP requests (query parameters, form data, JSON payloads)
- Receive the authenticated member from the authentication middleware and check authorization (member permissions)
- Call business services with domain objects
- Return responses in appropriate format: HTML pages (server-rendered via Handlebars) for browser navigation, JSON data for AJAX requests and webhooks, Proper HTTP status codes and headers.

**Service Layer Independence:**

Controllers delegate all business logic to services. Services are completely HTTP-agnostic, accepting domain objects as input, returning domain objects or errors. Services never touch HTTP requests, responses, cookies, or headers. Services orchestrate business logic by calling prepared statements from db.ts (for example queries.memberByEmail.get(email)) and never call db.prepare() or write inline SQL.

## 4.6 Technology Stack

The platform uses a focused, mainstream technology stack chosen for volunteer maintainability and long-term sustainability.

**Front end:**

- Handlebars templates - Server-rendered HTML, no build step required for templates.
- Per-page scripts - Provide client-side validation and dynamic behavior, delivered without a bundler and versioned by a content-hash token in the URL.

**Back end:**

- Node.js + TypeScript - Unified language stack, strong typing, async-first. The pre-go-live data-load Python (legacy data, freestyle, curated media curation and email template curation) builds the go-live dataset and is deleted after cutover, so the running platform and its tests are TypeScript only; Python remains only in small developer and CI tooling scripts.
- Express.js - Industry standard HTTP framework with extensive ecosystem.

**Data and Storage:**

- SQLite database (better-sqlite3) - Single database file with minimal configuration, prepared statements for performance.
- Single db.ts module exports all prepared statements with descriptive names (memberByEmail, createEvent, etc.).

**Infrastructure:**

- AWS Lightsail - Single 4GB instance with simple, predictable pricing.
- AWS CloudFront - Global CDN for caching and custom error-page handling (maintenance-mode UX) when the origin is unavailable.
- AWS S3 - Primary storage for photo data (with cross-region replication for backup) and storage for SQLite database snapshot backups.
- AWS SES - Transactional and bulk email delivery with bounce/complaint handling.
- AWS Parameter Store -- keeps some secrets out of source control; access is controlled by IAM. It does not protect against in-container compromise.
- AWS KMS -- keeps secrets out of source control; access is controlled by IAM. Used for cryptographic operations needing non-exportable key custody.
- AWS IAM -- Enforces security, role-based and minimal system permissions.
- Docker - Container orchestration for local development and production.
- Stripe - Payment processing with PCI compliance offloaded.

Why These Choices: Mature, well-documented, widely-adopted technologies. Millions of developers know this stack. Extensive community support and learning resources available. No exotic frameworks or custom tools. Optimizes for volunteer onboarding speed and long-term maintainability. These also provide the simplest design to meet requirements with the lowest-cost technology, a viable approach given the very stable functional requirement set.

## 4.7 Distributed System Patterns

The following design patterns solve fundamental distributed systems problems.

**Transaction Safety:**

SQLite ACID transactions provide the primary write-safety guarantees. SQLite serializes conflicting transactions automatically via busy_timeout. Application enforces a (configurable) 30-second transaction timeout to prevent runaway operations, and a busy or locked database surfaces as a temporary-unavailable service error rendered as 503 rather than through a second application-level retry loop. Services wrap multi-step operations in the transaction helper.

**Outbox Pattern (Reliable Email Delivery):**

The Problem: Sending email during request processing creates issues. If email fails, should request fail? If we retry, might we duplicate emails?

The Solution: When action requires email, write an outbox record (in the database outbox table) and respond to the user immediately. Background worker polls the outbox, sends emails, and retries failures with exponential backoff before eventually moving permanently failed messages to dead-letter handling. This decouples email reliability from request processing and prevents complicated asynchronous design patterns in the code. It also gives visibility to all emails sent for internal records and auditing / debugging.

**High Availability:**

The Problem: Single compute instance means site unavailability during failures.

The Solution: CloudFront serves a custom maintenance page from S3 when the origin is down. Users see a clear message: "Footbag.org is temporarily unavailable. Please try again in a few minutes." Automatic recovery occurs when the origin returns to health; CloudFront resumes serving live content within 10 seconds (error page cache TTL).

Limitations: This design accepts brief downtime (estimated 52 minutes per year based on AWS Lightsail 99.99% SLA) in exchange for operational simplicity appropriate to volunteer maintenance.

**Deletion Lifecycles (Referential Integrity):**

The Problem: Deleting records breaks references (event references organizer, registration references member). In a relational database, cascade deletes or foreign key constraints can solve this, but we must take care with the details.

The Solution: Each entity follows one of three deletion lifecycles depending on its referential and recovery requirements:

- **Grace-period deletion** (members): sets a deleted_at timestamp. The account is immediately and permanently inaccessible, and the platform offers no way to reverse it. The configurable grace period lets an administrator reconcile audits and payments; after it, PII is purged and the row is anonymized but retained for referential integrity. Foreign keys use ON DELETE NO ACTION to prevent accidental hard deletes during the grace period.
- **Status-based archival** (clubs): sets status = 'archived'. Records are never removed from the database.
- **Hard delete** (events without results, news items, media): records are immediately and permanently removed. Events with results are always preserved permanently.

Trade-offs: Database table views filter member deleted_at for transparent query safety. Hard-deleting events and news items eliminates cleanup job complexity and configurable grace periods for those entities; confirmation dialogs are the undo safeguard.

## 4.8 Runtime Infrastructure and Cost

Four Docker containers run on a single AWS Lightsail instance (4GB RAM): nginx (reverse proxy), web (Node.js application), worker (background tasks), and image (isolated image/video media processor). Authoritative memory allocations are defined in Design Decisions. At initial allocations, total container memory is approximately 1,920MB (~47% of 4GB), leaving over 2GB headroom for OS and traffic spikes. Memory limits are set per container in `docker-compose.prod.yml`, with per-environment values from the committed environment file the deploy seeds onto the host. Containers exceeding limits are killed (OOM) with automatic restart. CloudWatch monitors per-container memory with alerts at 80% (warning) and 90% (critical) utilisation.

**Operational Simplicity:**

This single-instance architecture eliminates common operational burdens: no load balancer configuration, no session state synchronization, no distributed cache invalidation, no multi-region failover procedures, no read replica lag management. Administrators focus on single application instance health. Deployment is single-instance container update. Debugging traces single request path. This simplicity enables volunteer maintenance over decades without specialized DevOps expertise.

**Container Memory Allocation Rationale:**

Docker containers share host resources. Without explicit limits, one container can consume all available memory, crashing others. The specific memory limits for the nginx, web, worker, and image containers are defined in the Container Memory Allocation decision in Design Decisions; this section explains why those limits exist and how they protect overall system stability and cost.

Memory limits provide:

- Resource Isolation: Each container gets guaranteed minimum; cannot starve others.
- Predictable Performance: Known memory bounds enable capacity planning.
- Failure Containment: Out-of-memory in one container doesn't crash entire host.
- Cost Optimization: Right-sizing limits means smaller instance required.

**Estimated Monthly Costs:**

- AWS Lightsail (4GB instance): $24.00 (2 vCPUs, 80GB SSD, 4TB transfer).
- AWS S3 storage: approximately $1.20 (database backups: approximately $1/month for primary and cross-region backup storage using per-generation lifecycle rules and Object Lock; photos: approximately $0.18/month with 2-variant storage and One Zone-IA backup replication).
- Lightsail host snapshots: approximately $1/month (daily, seven retained).
- AWS S3 requests: $0.05 (Normal read/write volume).
- AWS CloudFront: $0.00 (Free tier covers expected usage).
- AWS SES email: under $1 (pay per message at community volumes).
- AWS data transfer: $0.00 (Covered by Lightsail allowance).
 
**Estimated TOTAL approximately $28 USD.** This estimate DOES NOT INCLUDE domain name costs, and assumes moderate community activity. Costs scale gradually with usage. All services pay-as-you-go.

**Cost Optimization Strategies:**

**No Managed Database:** SQLite runs on same container instance as main application code.

**CloudFront Caching:** Static assets and media are cached at the edge under versioned URLs, so the origin renders only HTML, which keeps the instance small.

**Image Processing:** Re-encoding at 85% quality with metadata stripping reduces storage by 50 to 70%. Smaller storage, lower bandwidth costs.

**No Monitoring Services:** AWS CloudWatch native tooling eliminates need for third-party monitoring subscriptions (DataDog, New Relic: $50 to 200/month avoided).

**Single Instance:** No load balancer, no auto-scaling group complexity. Single Lightsail instance with predictable flat-rate pricing.

**No Auto-Scaling Overhead:** Single instance avoids load balancer costs, auto-scaling group complexity, and distributed coordination overhead. Acceptable trade-off: cannot automatically scale horizontally (but vertical scaling available if needed).

**Limited Commercial Tools:** CloudWatch-First Tooling Policy: Monitoring, alerting, and observability default to AWS CloudWatch-native tooling to minimize recurring overhead. Optional third-party tooling (e.g., error tracking/APM) may be adopted if it is budget-appropriate and materially reduces operational risk.

**Pay-As-You-Go:** All AWS services are consumption-based. Growing community increases costs proportionally but predictably. No fixed enterprise license fees.

This cost model remains sustainable even if community doubles or triples in size. At 3,000+ active members, may need to optimize (add selective indexes for specific high-frequency queries) or scale (8GB instance), but architectural changes not required.

**Cost Monitoring:** CloudWatch monitors actual memory usage continuously. If utilization stays consistently below 50%, could down-scale to 2GB in future. If regularly exceeds 80%, would up-scale to the 8GB instance. The allocation follows the typical workload patterns recorded in the design decisions, with a conservative margin for launch; the staging load check calibrates the monitoring thresholds rather than the allocation.

Spend is watched against one monthly ceiling, inside the $50 to $100 target set by the Cost Constraints decision in Design Decisions, by two controls: an AWS Budget that emails the operator on actual and forecast spend, and a CloudWatch alarm on estimated charges that raises an alert in the application for an administrator to acknowledge.

---

# 5. Development and Production Parity

## 5.1 Why Perfect Parity Matters

A common problem in volunteer software projects is that code works on developer laptops but fails in production due to environmental differences. Debugging production issues requires production access. New volunteers spend days setting up environments before contributing.

Development, staging and production run the same code, the same container shapes and the same folder structure; the default development mode runs the same application directly under Node for fast iteration. All environmental differences are hidden behind an abstraction layer.

## 5.2 How Parity Works

**Storage Parity:** Same SQLite database file in development (local filesystem) and production (Lightsail local storage). Same schema: every database but production is built from schema.sql, and production receives the same changes as numbered migrations, with a parity test holding the two in agreement. Same db.ts module with prepared statements. The backup runs as a host timer on deployed hosts only. No AWS credentials required for local development (but hybrid mode is possible for integration testing).

Implementation switches based on environment. Production uses SQLite database file on Lightsail local storage with S3 backup. Development uses SQLite database file on local filesystem without S3 backup. Services call the same db.ts prepared-statement query objects (wrapped by services) whether running locally or in production and
receive the same domain data. Services do not depend on environment-specific infrastructure wiring beyond injected adapters/config.

External Service Stubs implement identical interfaces for dev or production services. Code calls email.send(message) whether running locally or in production. Infrastructure layer routes appropriately. Development and test environments use in-memory stubs (fake or mock implementations) for external services:

- AWS SES: Writes to in-memory queue instead of sending; tests inspect queued emails.
- Stripe: an in-process Stripe simulation drives the checkout through the real signed-webhook handler, in development and on staging.
- Parameter Store: An in-memory map instead of the AWS API; unseeded it answers nothing, which is what development wants because every consumer runs its own stub.
- Logging: every environment writes the same structured JSON logs to standard output; deployed hosts ship them to CloudWatch Logs.
- URL validation: Deterministic stub validates syntax and patterns without external network requests.
- AWS KMS (signing): Uses a local stub signer in default dev mode (same JWT algorithm and claims shape). Optional hybrid mode uses real KMS for end-to-end integration testing.

**Adapter Parity Tests Validate Parity:** Adapter parity tests check that each stub honours its live counterpart's interface and the inputs live would refuse, and run with the suite in CI; a staging smoke suite exercises the live AWS adapters against real staging services.

**Hybrid Development Mode:** Developers can optionally integrate with real AWS services during local development by setting a non-production `AWS_PROFILE`. Default mode uses local stubs (fast, no AWS credentials needed). Optional hybrid mode connects to actual S3, SES, Parameter Store, or KMS for integration testing. This local developer-profile path is distinct from the production Lightsail runtime model, where deployed services use root-owned host AWS config/credential material to assume the documented runtime role.

---

# 6. Security

## 6.1 Authentication Design

**Password Hashing:** User passwords are hashed using argon2id with a per-user random salt. No server-side pepper is used. The threat model assumes strong hashing (argon2id) combined with AWS IAM restrictions, HTTPS encryption in transit, and limited blast radius (one compromised database does not compromise all passwords) provides appropriate security without operational complexity and key rotation risks of server-side peppers.

**Session Tokens (JWT) with Password Version Field:** After login, system issues JSON Web Token signed using AWS KMS asymmetric keys and stored as HttpOnly, Secure, SameSite=Lax cookie (24-hour expiration).

Token contains member ID, roles, and critically: passwordVersion. JWTs are signed via KMS (kms:Sign) with verification using cached public key (kms:GetPublicKey), not Parameter Store secrets. This architecture uses JWT-based sessions with per-request validation, where each authenticated request validates JWT signature cryptographically, then reads the member record from the SQLite database to verify passwordVersion matches (stateful lookup for immediate invalidation).

Email verification and password reset tokens use cryptographic randomness, are hashed before storage, and expire automatically (24 hours for email verification, one hour for password reset). Password reset requests are rate-limited to prevent enumeration attacks. JWT signing keys support rotation without forcing mass logout. Password changes immediately invalidate all existing sessions.

Challenge: JWTs cannot be revoked once issued. Solution: every member has passwordVersion field. When password changes, increment version. Token validation compares token version against current version in storage by reading member record on every request. Mismatch equals invalid token. This achieves immediate cross-device logout on password change without maintaining token blacklist.

Trade-off: every request reads member record to check version. For community scale, this single-file read is acceptable overhead for security benefit.

Login and password-reset endpoints use application-level rate limiting keyed by email/account identifier and ephemeral network signals (such as IP address) for abuse prevention, without storing IP-derived data in audit logs or member records. Thresholds, windows, and cooldown durations are Administrator-configurable (safe defaults are defined in User Stories).

## 6.2 Image Upload Strategy

Members (Tier 1+) can upload photos in JPEG or PNG format, with maximum 25MB file size and 4096×4096 pixel dimensions. Images are processed synchronously during upload, users wait 2-5 seconds while the system generates two optimized variants: a thumbnail bounded at 600 pixels on its longest edge and an 800-pixel-width display version, both saved as JPEG at 85% quality.

Processing eliminates malware through re-encoding that converts images to raw pixels and back, discarding everything except visual content. This approach removes the need for antivirus scanning infrastructure. All metadata (EXIF, GPS, camera information, ICC profiles) is stripped for privacy and security. Original uploaded files are discarded after processing, reducing storage requirements.

Members do not upload video files; they embed videos from YouTube or Vimeo instead. Curated tutorial video uploaded by the system account is the one hosted video, re-encoded through a full transcode that strips anything but the video and audio streams. Animated GIFs are not supported due to processing library limitations. Members can view and share processed images but cannot download original high-resolution versions.

Benefits Gained: Zero antivirus maintenance, Standardized image quality, Simple deployment, Photo data size reduction.

## 6.3 Additional Security Protections

**CSRF Protection:** The application uses SameSite=Lax cookies, strict HTTP verb discipline (no state change over GET), and Origin-header pinning on state-changing requests, rather than synchronizer CSRF tokens. SameSite=Lax prevents cookies from being sent with cross-site POSTs; Origin-header pinning blocks same-site subdomain POSTs from the legacy archive subdomain, which is same-site with the platform whatever the session cookie's scope.

**Content Security Policy:** The platform implements Content Security Policy headers restricting which sources can load scripts, styles, and resources. This prevents cross-site scripting attacks by rendering injected malicious code inert even if input validation were bypassed.

**Rate Limiting:** Upload operations enforce rate limits to prevent abuse. This protects against spam, denial of service attempts, and ensures fair resource usage across the community.

**Text Sanitization:** All user text inputs (captions, bios, names, descriptions, comments) undergo sanitization and validation to prevent injection attacks: HTML tags are stripped, Unicode is normalized to reduce homograph risks, control characters are removed, and length limits are enforced. Output encoding via the Handlebars template engine ensures user content is always rendered as data, never executed as code. CSV uploads (such as event results) are validated to detect and reject formula indicators. Together, input sanitization, safe templating, and CSV validation provide a defense in depth approach that prevents script and injection attacks while maintaining usability for legitimate international content and avoiding dependence on external libraries.

**Data Access Pattern:** All data access occurs through single database module (db.ts) exporting prepared SQL statements. Services call statements directly: queries.memberByEmail.get(email), queries.createMember.run(data). Parameter binding prevents SQL injection.

Uniqueness is enforced via database constraints and case-insensitive unique indexes on canonical, normalized identifiers such as email. Database views automatically filter member records in their deletion grace period.

## 6.4 Video Content 

The platform does not host member-uploaded video files; the system account's curated tutorial video is the one exception. Instead, members submit YouTube or Vimeo links, the system validates those URLs, extracts the video IDs, and embeds sandboxed players. This approach avoids the storage and transcoding complexity of hosting video, reduces infrastructure costs, and takes advantage of the global delivery and playback features provided by YouTube and Vimeo.

The legacy videos that have been hosted on footbag.org for decades are hosted on the archive. These have all been converted to mp4 format by the mirror program.

## 6.5 Privacy-First Design

**Minimal Data Collection:** Platform collects only what a stated purpose needs, and each field's purpose is recorded in the governance document. Name, email, city, country and date of birth are required; the date of birth is what matches a member to their old footbag.org account and their competition records, and it is owner-and-admin private. Phone and WhatsApp are optional and default to private. No payment card numbers: Stripe collects those and the platform stores only a customer reference.

**No Tracking:** Zero tracking cookies, analytics scripts, session replay tools, or heatmaps. Only first-party cookies needed to run the site: the sign-in session, a one-shot notice cookie, and the archive access cookies. This eliminates tracking liability and respects user privacy maximally.

**Data Rights Implementation:** Members can view all stored data, edit profile information, download complete export as JSON, request account deletion (permanent from the moment it is confirmed, with personal data purged after a 90-day grace period), and restrict searchability/visibility through profile flags. Member search is for signed-in members only and is never a public directory; it shows display name with city and country, and contact fields stay hidden unless the member opts in, and then only to signed-in members.

**Member Data Export and Deletion:** Members can export their data and request account deletion. Member-requested account deletion is permanent: the account is unreachable from the moment it is confirmed and the platform offers no way back. A 90-day grace period follows before PII is permanently purged and the anonymized member row is retained for referential integrity; the period exists so an administrator can reconcile audits and payments before the personal data is gone, not as a window for the member to return in. A member who deleted in error asks IFPA outside the platform. Photo deletion is immediate and permanent when requested by members. Deleted data may persist in historical database backups until each backup ages out under its retention window. Every erasure is recorded, and a restore from backup re-applies the recorded erasures before the restored data is served. This is documented in the privacy policy to set accurate expectations about data removal timelines.

**External URL Support:** Members can publish up to 3 external web page URLs with custom labels (example: "Personal Site", "Instagram", "YouTube Channel") in their profiles. Events, clubs, and galleries can each publish one optional external web page URL. All URLs validated before publication using strict syntax checks (http or https only, max length, no credentials, no localhost/private/reserved targets), plus Google Safe Browsing API malware check (free tier). All URLs display with rel="nofollow" attribute for SEO. Failed validation shows clear error message with retry option. An optional, configurable reachability check sends one HEAD request, re-checking the address against private and reserved ranges at every redirect.

**Data Retention Policy:** Active member data: indefinite until deletion requested.

- Deleted member personal data: 90-day grace period (configurable), then PII permanently purged from primary storage; anonymized row retained for referential integrity. Deleted data may persist in historical backups until they age out, and any restore re-applies the recorded erasures before serving.
- Financial records: anonymized after 90-day member deletion grace period, transaction IDs retained 7 years for compliance.
- Audit logs: rows older than the retention period (default and minimum 7 years) are deleted by a daily job.
- Audit logs identify people by member and entity IDs only, for traceability, and never store an IP address or a name. An email address appears only in account-claim evidence, and there only as a keyed hash that a copy of the log alone cannot reverse.
- Photos and video links: indefinite while member active; immediately and permanently deleted on member request.
- News items: immediately and permanently deleted on admin action; no grace period.
- Events: immediately and permanently deleted by organizer if no published results; permanently preserved if results have been published.

This policy supports GDPR privacy requirements while retaining required financial records in anonymized form and audit records for seven years.

## 6.6 Audit Logging

**Immutable Append-Only Logs:** Every governance- or security-significant change appends an entry to an audit log database table; a read, an act that changed nothing, or anything concerning a person who is not yet a member appends none. Database triggers refuse every update and every delete except the daily purge of rows past the retention period (default and minimum seven years).

**What Gets Logged:** Authentication events, profile changes, club membership, event operations, photo and video actions, payment transactions, admin decisions, event-organizer/club-leader additions and acceptances, membership tier changes, price edits and price change events, Board add and remove, election creation, ballot tallying operations, results publication, cancellation, event sanction approvals and denials, administrator overrides and batch operations, announce-list sends, event results publication, login failures over threshold, email template edits, election settings edits after creation, organizer assignment or removal on events, ClubLeader set or unset, archive access policy changes.

Administrators may edit member data (as permitted by rules), and all such actions are audit-logged. Where an action has several possible motives, such as a tier correction, the administrator's reason is recorded with it, the point being that the admin can manually apply BAP and HoF flags, fix Tier status or other data problems. Note that this includes the case where a member dies; the admin can set a deceased flag for the member, which takes a confirmation rather than a reason.

Each log entry records when it happened, the actor type and actor member id, the action type, the entity type and id, a category derived from the action type, an optional reason, and metadata. Audit logs are privacy-safe: they name people by id and store no IP address, user agent, name or raw email address.

This design creates complete accountability trail. Disputes resolved definitively. Security incidents enable forensic investigation. Transparent governance through verifiable history.

## 6.7 Data Encryption

AWS S3 default (SSE-S3) encrypts all data backup snapshots at rest. The local SQLite database file on Lightsail is stored unencrypted on the instance volume, which is an acceptable trade-off given that backups are encrypted, instance access is restricted via IAM, and the data is not financial or regulated.

Ballot encryption uses AWS KMS envelope encryption with per-ballot data keys; store ciphertext plus encrypted data keys. Ballots are encrypted server-side before storage, providing strong cryptographic privacy protections independent of S3 encryption. This ensures ballot secrecy: even with S3 access, ballots remain encrypted without KMS decrypt access to the dedicated ballot key. Double-layer encryption (application-level ballot encryption plus S3-level storage encryption) provides defense in depth but absolute secrecy is not claimed under privileged-role compromise scenarios.

This approach is appropriate for the platform's threat model: Community membership data is not regulated (not HIPAA, not PCI, not financial records). Encryption at rest protects against physical disk theft and some insider threats. AWS handles key management, rotation, and security.

S3 storage encryption uses S3-managed keys (SSE-S3), not a customer-managed KMS key: a second key gate would not constrain a compromised runtime credential, which needs both permissions anyway, and would add failure modes to media rendering, database restore and cross-region replication. Customer-managed KMS keys are reserved for what needs non-exportable custody: session signing, ballot encryption and SecureString parameters.

## 6.8 Threat Model

**Primary Threats Mitigated:**

- Account takeover via credential theft: argon2id password hashing + HttpOnly JWT.
- CSRF attacks: SameSite=Lax cookies, strict HTTP verb discipline, and Origin-header pinning on state-changing requests.
- Malicious file uploads: Isolated image processor + format validation.
- Ballot tampering: AES-256-GCM encryption + audit logging.
- SQL injection: Mitigated by prepared statements with parameter binding.

**Accepted Risks:**

- Tier 0 members gain limited free access (acceptable for community building).
- Single compute instance (mitigated by CloudFront error pages and rapid recovery procedures).
- DDoS/abuse mitigation is layered but intentionally lightweight: AWS Shield Standard at CloudFront plus application-level rate limiting (Turnstile and in-process limits), with a WAFv2 ACL as a deferred lever; no complex multi-region active-active mitigation architecture.

**Secrets Management:**

Sensitive credentials (Stripe API keys, webhook secrets) are stored in AWS Parameter Store SecureString. Cryptographic operations requiring non-exportable key custody use AWS KMS instead (JWT signing, ballot encryption). Parameter Store does not protect against attacker shell access inside production containers or host paths that expose runtime credential/config material, so operations requiring non-exportable keys use KMS/HSM-backed asymmetric signing keys with IAM separation.

---

# 7. DevOps

## 7.1 Backup Strategy

The system backs up the SQLite database file every 5 minutes by creating a consistent snapshot and uploading it to an S3 backup bucket. These frequent snapshots provide the primary short-RPO recovery path. Cross-region disaster recovery for database backups rides S3 replication, which continuously copies the promoted hourly and daily snapshots to a bucket in the backup region. Backups proceed only after a successful checkpoint to ensure consistency.

Photos are backed up via Amazon S3 cross-region replication separate from database backups. Primary bucket replicates continuously to backup bucket in different region. Propagation typically completes within minutes; Replication Time Control is not enabled, so no formal recovery-point objective is committed for photos. No manual backup jobs required.

**Monitoring and Alerts:** If backups fail 3 times in a row, administrators receive a CRITICAL alert. The system health page shows when the last successful backup completed. CloudWatch monitoring triggers alarms if backups become more than 15 minutes old, ensuring backup issues are detected immediately.

**Safe Application Restarts:** When the application needs to restart (for updates or maintenance), it follows a graceful shutdown process to prevent any data loss: stop accepting new web requests, wait for active operations to finish (up to 30 seconds), save all pending database changes, close the database cleanly, perform one final backup upload, then shut down. This ensures deployments never lose data.

**Backup Protection and Retention:** Backup files in the cross-region disaster-recovery bucket are protected using AWS S3 Object Lock in governance mode, which stops any ordinary credential from deleting or modifying a retained backup version. It is deliberately not absolute: an administrator holding the bypass permission can still remove one, because a lawful erasure request has to be honourable on a backup object that holds personal data. The primary S3 bucket thins its snapshot history by age through lifecycle rules: in production, two days of the fine-grained stream, thirty days of the hourly generation, four hundred days of the daily one; staging keeps deliberately shorter windows. The cross-region backup bucket uses a 90-day Object Lock retention for disaster-recovery backup objects. Audit logs are retained for 7 years. Normative defaults for all configurable retention windows are defined in the User Stories Configurable Parameters section.

**Recovery Point Objectives (RPO)** include two recovery scenarios:

**Primary Recovery (most common):** Restore from primary S3 bucket using timestamped snapshots uploaded every 5 minutes. RPO is 5 to 10 minutes maximum for all data. Use this for: database corruption, accidental deletion, application bugs.

**Disaster Recovery (rare):** Restore from the cross-region backup bucket, which receives the promoted hourly and daily snapshots by continuous S3 replication. The recovery point is up to an hour, the interval between promoted points, plus replication lag; photos replicate continuously too, with per-object propagation typically completing within minutes and no formal RPO commitment. Use this for: complete AWS region failure, S3 bucket deletion, catastrophic infrastructure loss.

**Recovery Time Objective (RTO):** Depends on failure scope: routine application/database recovery targets minutes-scale restoration (about 5 minutes for database file restore once operators begin recovery), The recovery-time objective is four hours for host or application failure in-region and up to twenty-four hours for a cross-region disaster, with the maintenance page served throughout.

The AWS free tier does not provide viable continuous database backup at the required RPO. The selected 5-minute backup interval provides acceptable RPO (5-10 minutes) at minimal cost (approximately $1/month, held there by the per-generation lifecycle rules that expire each generation at the end of its window). This approach balances data protection requirements with budget constraints.

## 7.2 High Availability

**Single-Instance Architecture:** Production runs on one Lightsail instance fronted by CloudFront CDN. This design prioritizes simplicity and volunteer maintainability over maximum uptime. AWS Lightsail provides 99.99% uptime SLA (approximately 52 minutes downtime per year). For a volunteer-maintained community platform, the trade-off between operational complexity and availability favors simplicity.

**Failure Modes:** The platform has two operational states:

- Normal Operation: All features available. Origin serves requests successfully (HTTP 2xx/3xx responses). Users interact with site normally.
- Maintenance Mode: Origin unavailable or returning server errors (5xx). CloudFront automatically serves the maintenance page from the S3 error bucket for GET/HEAD requests. State-changing requests (POST/PUT/DELETE) may instead fail with connection errors/timeouts until the origin recovers.

CloudFront exit from maintenance is automatic. When Lightsail origin returns to health, CloudFront resumes normal operation within 10 seconds (error page cache TTL). Restoring the origin typically requires admin intervention (restart/rollback/restore).

**CloudFront Error Page Configuration:** When the Lightsail origin returns server errors (500, 502, 503, 504) or is unreachable, CloudFront automatically displays a custom maintenance page stored in S3 for GET/HEAD requests. Error page cached for 10 seconds, ensuring users see restored service quickly after recovery. Connection timeout set to 10 seconds with 3 retry attempts, so browsing requests typically see the maintenance page within ~30 seconds of origin failure (state-changing requests may instead fail with connection errors/timeouts).

**Recovery:** CloudFront exit from maintenance is automatic. When the origin returns to health, CloudFront resumes normal operation within 10 seconds (error page cache TTL). Origin recovery may require admin intervention (restart/rollback/restore); this procedure is documented in DEVOPS_GUIDE.md (private GitHub repo).

**Monitoring and Alerting:** CloudWatch monitors origin error rates, application health, and resource utilization. Alarms trigger within 2 minutes of failures, notifying administrators via email. Documented recovery procedures, with host restore from the daily instance snapshot followed by database restore from its own backup stream, meet a four-hour in-region recovery-time objective.

**Regional Outage Handling:** In the extremely unlikely event of extended AWS regional outage, recovery process: restore from the cross-region backup bucket (us-west-2) to a new Lightsail instance in the recovery region using documented procedures, within the recovery-time objective of up to twenty-four hours. No pre-planned regional failover is maintained; the probability is too low to justify ongoing complexity.

This approach provides high availability appropriate to community scale: reliable infrastructure, rapid recovery, transparent failure modes. NOT achieved through redundant compute instances, multi-region failover, or 24/7 operations.

## 7.3 Operational Documentation

Refer to DEVOPS_GUIDE.md and AWS_OPERATIONS.md (private GitHub repo) for more details. It is the authoritative guide for all build, release, operate, and recover procedures, with detailed specifications for:

- Environment model and lifecycle (Dev, Test/Staging, Production).
- Configuration management and secrets handling.
- CI/CD pipeline implementation.
- Container orchestration and resource management.
- CloudFront behavior matrices and caching strategies.
- Monitoring dashboards and alerting thresholds (CloudWatch-first, with optional tooling guidance).
- Health endpoints (/health/live and /health/ready) and how they are used in deployment/health checks.
- Backup validation and disaster recovery drills.
- Staging data refresh procedures for the real dataset staging carries, and the protections that apply to it.
- Promotion flows and deployment checklists.

## 7.4 Infrastructure as Code

All AWS infrastructure for the platform is defined as code using Terraform configuration files, version-controlled in the repository under /terraform directory. This approach provides several critical benefits:

**Reproducible AWS environments:** The staging and production AWS environments can be recreated from reviewed Terraform configuration after the one-time bootstrap handoff. Local developer environments are reproduced through the repository’s Docker/SQLite/bootstrap scripts rather than through Terraform.

**Infrastructure changes approved by the maintainer:** The planned changes are reviewed before applying, ideally in a pull request, so team members can see exactly what will change.

**Disaster recovery:** If AWS resources are accidentally deleted or an entire AWS account is compromised, infrastructure can be rebuilt from version-controlled Terraform files.

**Documentation through code:** The Terraform files serve as authoritative documentation of what infrastructure exists and how it's configured. No documentation drift.

**Eliminates tribal knowledge:** New volunteers can understand infrastructure by reading Terraform configuration rather than relying on institutional knowledge from long-time administrators.

**Managed Infrastructure Components:**

- Lightsail instance configuration (size, OS image, networking, static IP).
- S3 buckets with complete configuration (versioning, lifecycle policies, CORS rules, public access blocks, backup bucket for SQLite snapshots).
- CloudFront distributions (origins, cache behaviors, TLS certificates, custom domain).
- The dev-and-testers' job role and its policies, Lightsail firewall restrictions and any documented bootstrap inputs required by the SSH access model, and application runtime assumed roles, plus the documented runtime credential mechanism for deployed hosts and operators.
- Parameter Store structure (paths, types, encryption configuration).
- CloudWatch log groups and metric alarms.
- Route53 DNS records.
- Budget alerts and cost allocation tags.

**Secrets Management:** Terraform creates AWS Parameter Store parameter structures (paths, encryption configuration) but does not store secret values in version control. Secret values (Stripe API keys, Stripe webhook secrets, and other non-KMS credentials) are set by the reviewed provisioning scripts under `scripts/` after Terraform creates the parameter structure; no value is ever typed into a command line or a console. JWT signing keys and ballot encryption keys use AWS KMS and are not stored in Parameter Store; their key material remains non-exportable within KMS. KMS keys for JWT signing and ballot encryption are provisioned via Terraform, but key material remains non-exportable within AWS KMS. This separates infrastructure definition (version-controlled) from secret data (not version-controlled).

**Operational Discipline:** Every change reaches AWS only through a reviewed, tested and audited script: Terraform through the apply script, secrets through the provisioning scripts, with no console or hand-typed exception. A resource that was ever created outside Terraform is declared with an import block and taken in through the apply script, never recreated. This keeps Terraform state accurate and leaves nothing applied that the repository does not record.

Remote state uses an S3 backend with native S3 state locking (`use_lockfile`), preventing concurrent applies that could corrupt state.

## 7.5 Testing

Automated testing ensures reliability while enabling rapid volunteer development with fast feedback loops.

**Unit Tests:** Validate business logic in services and utilities. Test individual functions and methods in isolation.

**Integration Tests:** Verify HTTP endpoints work end-to-end. Test complete request/response cycles through controllers and services.

**Adapter Parity Tests:** Every adapter carries a boot-time configuration test and an interface parity test proving the stub and live implementations behave alike; adapters that reach an external service also carry a read-only staging smoke test.

**End-to-End Tests:** A lightweight Playwright suite drives key flows in a real browser.

The full layering, risk rubric and gates live in the Testing Strategy document.

## 7.6 Continuous Integration

Every push to any branch, and every pull request to main, runs the GitHub Actions workflow: type-checking, lint, dependency audit and review, secret scanning, the convention and harness gates, the full test suite with coverage thresholds, browser end-to-end tests, security probes against a locally booted stack, CodeQL static analysis, and Terraform checks.

A production deploy ships only a commit on main whose CI run is green, so CI on that exact commit is the release's test proof. Adapter parity is proved in CI against stubs and injected fakes, and separately by a read-only staging smoke against the real AWS and third-party services that can be probed safely.

This approach enables rapid local development (no AWS credentials needed) with high confidence in production deployment.

---

# 8. Legacy Archive

A custom Python-based crawler was developed to capture the complete Footbag.org website before decommissioning. This mirror program:

- Systematically crawled all accessible pages starting from the homepage.
- Downloaded HTML pages, images, videos, stylesheets, documents.
- All images converted to JPG, all videos to MP4.
- Preserved complete directory structure and file organization, modified only to eliminate the database and javascript used in the legacy system.
- Maintained relative links between pages so navigation works.
- Generated pure HTML output with no JavaScript or database dependencies.
- The archive is browse-only.
- Note: this backup contains some member's details such as contact info, and so therefore access is limited to logged-in members only.

**Data Migration:**

- The mirror could not access all members, only those with a public presence (club members, event participants with results, published media galleries).
- The mirror cannot fetch login credentials. Legacy passwords are never imported or accepted.
- Legacy data migration uses two sources: (1) historical pipeline: persons from human-curated CSV, clubs from mirror extraction, events, results, and honors; (2) legacy member import: all legacy registered accounts imported as rows in the `legacy_members` table, which cannot log in and do not appear in any member-facing surface.
- Imported members connect their legacy identity to a modern account in the onboarding wizard's claim step: the platform matches their verified email, any old emails and former surnames they declare, their name and their date of birth against the old accounts and competition records, and the member claims what is theirs. An old account from the legacy member data needs email or date-of-birth corroboration, however it is reached, while a mirror-built account (which carries neither) and a competition record with no such account behind it are claimable on the name and the surname rule; old addresses are matching keys only and are never mailed. This transfers legacy identity, honors, tier entitlements, and club data to the modern account.
- Club leadership candidates identified at bootstrap confirm their role in the onboarding wizard when they register, and then manage the club; other clubs show their legacy leaders as provisional until a member claims leadership.
- Migrated data is faithful, complete history from the old footbag.org, with curated human corrections winning over the legacy dump and mirror, and unknown data left unknown, never invented. The data-load pipeline and other pre-go-live tooling serve the migration and retire after it; at cutover the production database becomes the source of truth.
- Migration is one coordinated go-live: no website, email, DNS, data or application function remains dependent on legacy infrastructure afterward, and every legacy function is migrated, replaced, archived read-only, or retired with notice.
- The legacy group-mail archive is sealed in private encrypted custody, never imported or published; its disposition is the IFPA secretary's decision.

**Archive Hosting Architecture:**

- Archive stored in dedicated S3 bucket (separate from active platform data).
- CloudFront distribution serves archive at archive.footbag.org.
- Aggressive caching (1-year TTL) since content never changes.
- Minimal ongoing costs.
- Access is enforced at the CloudFront edge by signed cookies that the main site issues alongside the member session at every sign-in and session refresh. They are scoped to .footbag.org, so one sign-in covers the archive, and they expire with the session. The session cookie itself stays on the main site.

**URL Redirects:**

- The platform never links into the archive's interior, only to its landing page: legacy footbag.org URLs are served the standard not-found page, and archive content is reached by browsing from there.
- The mirror program's `redirect_map.json` is an internal crawl artifact, a legacy-URL to legacy-URL de-duplication map the crawler consumes during link rewriting; it is not a serving-time redirect table.

**Access and Governance:**

- Archive accessible to members only, not public (read-only, authentication required).
- No modifications possible (immutable preservation).
- Selected historical content, such as event results, honors and historical-person records, is migrated to the live site for public access.
- The archive requires member authentication and is served with a noindex directive, so it is neither publicly reachable nor indexed.
- Initial mirror capture is one-time for launch, no future refresh possible once we switch over to new site.

This approach ensures permanent preservation of community history, protecting member privacy from the public Internet, with minimal ongoing maintenance or cost.

Legacy data contains private member information not suitable for public viewing. Archive access requires member login. Maintains historical record without migration complexity or data model contamination. Members log in to new platform, then access archive through authenticated link.

---

# 9. Volunteer Development

**Volunteer-Driven Schedule:** Development proceeds on volunteer availability (estimated hundreds of hours). Project structured for parallel work by multiple contributors through clear module boundaries and comprehensive documentation.

**Standard Technology Stack:** Docker, Node.js, TypeScript, Express, Handlebars, AWS, Stripe; widely adopted technologies familiar to millions of developers. Extensive documentation and community support available. No exotic frameworks or custom tools. The platform code and documentation are open source and version controlled, hosted on Git at https://github.com/davidleberknight/footbag-platform

**Clear Solution Architecture:** Uses standard design patterns with obvious separation of concerns. Presentation layer handles front-end layout and user interactivity in the browser, controllers handle HTTP communications with the back end code, services contain business logic and authorization rules, all data operations use prepared SQL statements in a thin database-access layer, all external services accessed through suitable abstract interfaces that allow local development and testing mock services.

**Fast Feedback Loops:** One-command local setup. The development server restarts on every save. Adapter parity tests verify behavior. Integration tests validate full flows. Deterministic synthetic seed data drives development and CI; staging carries the real migrated dataset. Best practice DevOps standardized for industry standard CI/CD pipeline.

---

**END OF Project Summary DOCUMENT**