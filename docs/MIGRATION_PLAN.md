# Footbag Website Modernization Project -- Migration Plan

**Document Purpose:**

This document is the public migration reference for the footbag.org migration: the migration posture and decisions of record, the pipeline validation gates, and the operational-readiness gate detail (backup, observability, edge security, IAM, email ops, maintenance jobs, secrets rotation, pre-cutover reverts; the operator procedures live in the private ops docs). The go-live gate index, the cutover state machine, the launch sequencing, and the stakeholder coordination (who supplies which facts, the residual asks, and their status) live in GO_LIVE_PLAN.md (private GitHub repo), the authoritative go-live plan of record; live status of open items is tracked in the maintainers' private tracker; section numbering here keeps gaps where sections moved there. It is a roadmap, not a design home. The migration design it coordinates (the three-table identity model, the claim and auto-link flows, merge rules, club bootstrap and classification, the name and competition-history model, schema deltas, and the audit-event catalog) lives in the canonical docs (the Legacy Data Migration decision in DESIGN_DECISIONS, the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories, DATA_MODEL, DATA_GOVERNANCE, and the legacy_data pipeline docs); this plan references those homes rather than restating them. For functional requirements see `USER_STORIES.md`; for privacy and visibility policy see `DATA_GOVERNANCE.md`.

It opens with a summary of the migration and a recap of the decisions of record. The numbered sections that follow carry the migration design pointers, the data contracts, the pipeline validation gates, and the operational-readiness detail.

---

## Summary

The new footbag.org platform absorbs three bodies of legacy data:

1. **Historical record**: events, results, persons, honors (Hall of Fame, Big Add Posse), clubs, club affiliations, and club leadership, built from human-curated CSV plus extraction from the project's offline mirror of the legacy site. Published regardless of whether anyone claims the underlying identity.
2. **Legacy member accounts**: every login-bearing account from the live legacy site, imported from a one-time export into a permanent archival table. No passwords or credentials ever move; members reconnect to their old identity through a voluntary, always-confirmed claim flow after registering on the new platform.
3. **Operational readiness**: backup and restore, observability, edge security, email deliverability, scheduled jobs, secrets rotation, and the pre-cutover checklist.

The migration is one coordinated production go-live: no phased production delivery, no parallel systems. Preparation happens in advance — data rehearsals, Google Workspace provisioning and Google Group setup, archive capture, SES verification, the early inbound-mail (MX) move to Google, the DNS zone transfer to Route 53, and replacement-service testing — and advance preparation is not phased delivery: the website, retained inbound email, platform outbound email, retained discussion groups, the read-only archive, and every other required service activate together at go-live. Before go-live the `footbag.org` zone becomes authoritative on Route 53 under IFPA-controlled access, so the cutover itself is an operator-executed DNS change: `www` and the apex become alias records to the platform's CloudFront distribution (`www` is the canonical host; the apex 301-redirects to `www`) and the legacy site goes dark. Outbound mail becomes the platform's, sent via SES; inbound role addresses move to Google Workspace, every active address provisioned before legacy delivery is withdrawn (the SPF amendment, SES DKIM, and Google MX records are published on the zone as advance preparation). At the final-export moment the legacy member system is frozen read-only permanently (one-way — it never takes member writes again); the export is taken from that frozen state, so the import is one clean snapshot with no delta reconciliation. After go-live verification the remaining legacy production services are stopped: there is no live legacy site, mail, list, media, proxy, or application service afterward, and no standing legacy server kept for rollback. Recovery within the monitored window is fix-forward or a platform-side restore, with any DNS action operator-executed on the low-TTL Route 53 zone; a legacy fallback exists only as a read-only reconstruction from a tested encrypted artifact, reserved for catastrophic failure. Post-go-live retention of legacy material is limited to encrypted, non-public recovery and reference artifacts under IFPA-controlled access. Functionality not in the first release is built natively afterward, complete by Worlds 2027; legacy is never relied upon. Historical content lives read-only at `archive.footbag.org`.

Governing principle (the requirement of record): no required website, email, mailing-list, DNS, data, media, registration, or application function may remain dependent on legacy infrastructure after go-live, and "keep it running on legacy" is not an allowed final disposition — every legacy function is migrated, replaced, archived, or deliberately retired before shutdown. The IFPA secretary leads active requirements discovery with current users, group owners, moderators, event organizers, and the IFPA board to determine which communication and governance functions survive and what records are retained. The legacy webmaster does three things and no more: he freezes the member system, delivers the final frozen export from that state, and keeps the legacy host serving until he powers it down after go-live verification, on his own schedule. The primary maintainer, as an IFPA officer, reclaims the `footbag.org` registrar (IFPA is the registrant) and serves as the domain technical contact; converts the confirmed requirements into implementation; owns the DNS on Route 53; runs the one coordinated go-live; and takes the legacy site dark at the operator DNS cutover.

---

## Stakeholder coordination (moved)

The stakeholder coordination layer — the open-question register with per-item status, the who-decides-what authority map, the legacy webmaster's residual contract and action sequencing, and the group and email requirements discovery the IFPA secretary leads — lives in GO_LIVE_PLAN.md (private GitHub repo), under "Stakeholder coordination". Live status of every open item is tracked in the maintainers' private tracker. The decisions of record remain below, and the facts that resolved past coordination questions are recorded in the design sections and gate criteria they belong to.

---

## Decisions made

These are the decisions of record. Some are settled agreements with the people involved; others follow from the design intent that nothing depends on legacy tech after go-live, and are marked as required by that intent rather than claimed as agreed. Each stands unless a tracked open item revises it.

**1.** Three identity tables work together: members (live accounts), legacy_members (old-site records), and historical_persons (competition history). When records merge, the live account always wins.

**2.** No credentials are ever imported. A legacy email is migration metadata only, never a login.

**3.** Claiming a past identity is voluntary and always confirmed by the member. The system stages candidate matches, sends no email, and applies nothing until the member confirms a card.

**4.** Every confirmed claim records how strong the evidence was. An optional confirmation-link click sent to an old email raises that strength. Cases that nothing can resolve go to an admin help request.

**5.** Honors-bearing claims (Hall of Fame, Big Add Posse) apply without an admin checking first. The honors data is validated a priori at test-load against the public HoF and BAP rosters, the small community self-polices, and an admin can revert a wrong claim; there is no daily oversight email. Impersonation is handled entirely in-platform by these controls plus the identity-link matching rules and the registration-time name-collision prompt.

**6.** Identifier lookups never reveal whether the input matched nothing, matched several records, or matched something ineligible; the response looks the same in every case.

**7.** Old bans never block a claim; they are kept only as background notes. The delivered data carries no ban field at all; the check is re-run against the final export at load.

**8.** Tiers are granted at claim time from each account's legacy standing (honors, paid history); an account with only honors is granted on that basis.

**9.** Clubs are bootstrapped from the mirror using a fixed four-way classification; club leadership stays a candidate only until a member confirms it through the wizard.

**10.** About 1,700 club-only members become historical persons.

**11.** The export is used twice (a test load, then the final one), and every excluded row is counted, never dropped silently.

**12.** The name model is a legal name plus a display name that share a surname; imported legacy records are exempt from that rule.

**13.** Front-door architecture is one clean DNS switch, executed by the operator on Route 53 (required by design intent: no hard dependency on legacy tech after go-live). At the write-freeze `www` and the bare domain become alias records to the platform's CloudFront distribution, serving the migration page until go-live, and the legacy site leaves the live path; `www` is the canonical host and the bare domain redirects to it. Nothing is proxied through the legacy server and it needs no TLS certificate. There is no separate redirect server: Route 53 serves the bare domain as an alias, which bind9 could not, and the zone moves to Route 53 before go-live. A smoke test proves the whole path before the switch.

**14.** The operator switches the `www` and bare-domain records on Route 53 at the write-freeze, pointing them at the platform's distribution while it serves a migration page; cutover itself is then withdrawing that page, gated on the smoke test. Both are operator actions on Route 53 and Terraform, rehearsed by the operator; no webmaster rehearsal is involved, because no record is applied on the legacy nameservers. A database snapshot is always taken just before the switch. Recovery within the 48-hour watch window is fix-forward or a platform restore from that snapshot first, with any DNS change likewise operator-made on the low-TTL zone. No legacy server stays running for rollback: for a catastrophic failure only, a read-only legacy fallback can be reconstructed from a tested encrypted artifact (the member system stays frozen either way).

**15.** The platform owns outbound mail via SES from go-live; legacy mail delivery ends at go-live. Inbound `@footbag.org` addresses move to Google Workspace: the MX points at Google and every active address is provisioned there before legacy delivery is withdrawn. The supporting DNS records land as advance preparation, and the MX switch itself may run early as a preparation step with flexible timing — preparation inside the one coordinated go-live, not a phase of production delivery.

**16.** DNS hosting moves to Route 53, under IFPA-controlled access, before go-live — advance preparation (required by design intent: no hard dependency on legacy tech after go-live). IFPA is the registrant and holds the registrar account: IFPA officers hold the account roles, the primary maintainer serves as the domain technical contact, and the account's nameserver change points the domain at Route 53; the legacy webmaster's bind9 service retires once the move completes and nothing still resolves through it. Exactly one step in the authority transition depends on him and cannot be performed by anyone else: the registrar's primary-contact role sits with him, and only its holder can move it. Everything else — the nameserver change, every record, and the zone capture the move is verified against — is an IFPA-side action. Ownership, governance, registrar administration, and day-to-day technical access are assigned separately rather than as one bundle, so no single person's availability gates the domain. The move precedes the certificate and mail-authentication work that depends on the zone, so those records are applied on Route 53 by the operator rather than hand-applied on the legacy nameservers.

**17.** The legacy webmaster's temporary role ends on milestones, not on a calendar date. The milestone list is coordinated privately (GO_LIVE_PLAN.md, private GitHub repo, "Stakeholder coordination").

**18.** The new platform uses its own URLs; they do not mirror the old site's URLs, and there is no general old-to-new mapping. No legacy URL is forwarded and the platform carries no redirect handler for one: every legacy URL, including the member-profile and club links that appear in old footbag.org emails, is served the standard not-found page, which tells a visitor arriving from an old link that the link is no longer routable and points them at the new site. All other legacy content lives only on the read-only archive site.

**19.** The internal quality-control subsystem is removed at go-live.

**20.** The new platform does not implement single-sign-on with the legacy site, and no credentials ever cross. No legacy login exists after go-live: no legacy password or session is imported or accepted anywhere, and the archive site is read-only. The voluntary claim flow is the only identity bridge.

**21.** Worlds 2026 ran without the legacy registration and tournament tool, which was never used for the event and is retired unused, and go-live is sequenced to follow that event, so no registration dependency ever crosses go-live. The platform's own event system handles events from go-live onward, and no legacy registration data is imported. The legacy site's one remaining role is to receive the Worlds 2026 results when they are posted there, which the final full mirror then captures; the native tournament-operations build for Worlds 2027 is greenfield and takes no requirements from the retired tool. The IFPA secretary confirms with the Worlds 2026 organizers what they ran the event on and what data they need kept; no registration export is requested from the legacy webmaster unless that confirmation establishes a need, and afterwards the system is archived (approved source or data only) and retired.

**22.** Historic tournament and registration data (the legacy multi-table tournament system) is not imported. The platform's canonical historical results are cleaner and authoritative; a future tournament feature, if built, models fresh rather than importing legacy data.

**23.** No legacy communication path goes dark at cutover unless it has been explicitly inventoried, classified, and either migrated, replaced, redirected, archived, or deliberately retired with stakeholder sign-off — "kept running on legacy" is not one of the options. Operationalized per-function by the group, committee, and mailing-list inventory (coordinated privately) and §29.12a constraint 5.

**24.** No old governance data, such as IFPA voting records, is deleted unless the right people confirm that deletion is acceptable. Disposition of IFPA-owned legacy records is an IFPA governance decision (the IFPA secretary rules), never an operator or maintainer decision. Enforced by the sealed-archive treatment in §29.12a (applied to IFPA governance records per §28) and the Sealed Legacy Email Archive decision in DESIGN_DECISIONS (§6.5a).

---

## Table of contents

### Front matter

- [Summary](#summary)
- [Stakeholder coordination (moved)](#stakeholder-coordination-moved)
- [Decisions made](#decisions-made)

### Part A -- Design

1. [Executive summary](#1-executive-summary)
2. [Migration sources](#2-migration-sources)
3. [Tier handling at claim](#3-tier-handling-at-claim)
4. [Name model](#4-name-model)
5. [Competition history fields](#5-competition-history-fields)
6. [Identity and person links](#6-identity-and-person-links)
7. [Auto-link: matching legacy_members, historical_persons, and members](#7-auto-link-matching-legacy_members-historical_persons-and-members)
8. [Self-serve claim flow](#8-self-serve-claim-flow)
9. [Merge rules](#9-merge-rules)
10. [Club bootstrap and onboarding](#10-club-bootstrap-and-onboarding)
11. [Onboarding wizard service](#11-onboarding-wizard-service)
12. [Security model summary](#12-security-model-summary)
13. [Admin flows](#13-admin-flows)
14. [User stories summary](#14-user-stories-summary)

### Part B -- Contracts

15. [Required schema changes](#15-required-schema-changes)
16. [Data pipeline inventory](#16-data-pipeline-inventory)
17. [Migration vs operational table classification](#17-migration-vs-operational-table-classification)
18. [Audit requirements](#18-audit-requirements)
19. [Stakeholder contracts (moved)](#19-stakeholder-contracts-moved)
20. [Maintainer, secretary, and project-manager coordination (moved)](#20-maintainer-secretary-and-project-manager-coordination-moved)
21. [Design decisions affected](#21-design-decisions-affected)

### Part C -- Go-live

22. [Go-live blocker index](#22-go-live-blocker-index) (pipeline gate family; the full index is in GO_LIVE_PLAN.md, private GitHub repo)
23. [Build stages (moved)](#23-build-stages-moved)
24. [Operational states (moved)](#24-operational-states-moved)
25. [Validation gates](#25-validation-gates)
26. [Data quality from persons.csv analysis](#26-data-quality-from-personscsv-analysis)
27. [Rollback posture](#27-rollback-posture)
28. [Open issues](#28-open-issues)
29. [Operational readiness for go-live](#29-operational-readiness-for-go-live)
30. [QC subsystem retirement (go-live gate)](#30-qc-subsystem-retirement-go-live-gate)
31. [Primary-maintainer test-user retirement (retired early)](#31-primary-maintainer-test-user-retirement-retired-early)

---

## How to read this

The plan is long; readers usually need a subset. Where to start, by role:

- **Stakeholder coordination**: GO_LIVE_PLAN.md (private GitHub repo), "Stakeholder coordination"; live status in the maintainers' private tracker. In this plan, the Summary and the decisions of record carry the public picture.
- **Cutover operators** (running the migration day): the go-live gate index, cutover state machine, and launch sequencing in GO_LIVE_PLAN.md (private GitHub repo); in this plan, §25 (validation gates), §27 (rollback), §29 (operational readiness).
- **AWS / DNS / email infrastructure**: §29 (operational readiness). §29.12 and §29.12a carry the DNS-cutover and mail disposition.
- **Open issues**: the maintainers' private tracker; §28 holds internal open items of technical record.
- **Migration design** (identity model, claim and auto-link flows, merge rules, club bootstrap and classification, name and competition-history model, schema, audit events): not in this plan. See the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5), the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories, DATA_MODEL, and the legacy_data pipeline docs.

For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `DATA_GOVERNANCE.md`.

---

## Part A -- Design

## 1. Executive summary

The front-matter Summary carries the orientation: the three workstreams (historical pipeline, legacy member accounts, operational readiness), the clean DNS-cutover front door, and the step sequence to go-live. The migration design this plan coordinates lives in the canonical docs (the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5), the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories, DATA_MODEL, DATA_GOVERNANCE, and the legacy_data pipeline docs); this plan carries the public gates and technical dispositions, with the stakeholder coordination, operational states, and sequencing in GO_LIVE_PLAN.md (private GitHub repo). Hall of Fame and Big Add Posse are abbreviated HoF and BAP throughout.

---

## 2. Migration sources

Two legacy data bodies feed the platform. The historical pipeline (events, results, persons, honors, clubs, affiliations, and leadership) is built under `legacy_data/`; its design is the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5), its inventory is in `legacy_data/README.md`, and the club bootstrap rule, structural signals, and leadership activation paths are in the `M_Complete_Onboarding_Wizard` user story. The legacy member-account import populates the `legacy_members` table; the imported-row model and field set are in DATA_MODEL Legacy Members (§4.14b), and the credential exclusion, the `MemberValid > 0` source-validity filter with its counted-exclusions report, and the mirror pre-seed that the final export supersedes are owned by the loader in `legacy_data/member_data_scripts/`. The cutover sequence that runs these is the cutover state machine in GO_LIVE_PLAN.md (private GitHub repo); the data-quality gates are the validation gates (§25).

---

## 3. Tier handling at claim

Under the three-table design, `member_tier_grants` is a ledger keyed by `member_id`; so no ledger row exists for an unclaimed legacy account (there is no member yet). The tier-grant mapping is applied at **claim time**: when `M_Claim_Legacy_Account` (or the direct-historical-person claim, or admin manual recovery) completes for a given `legacy_members` row, the claim transaction writes one `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` using the legacy state captured on `legacy_members`. No `active_player_grants` row is written at migration; Active Player is earned post-cutover via the new sources (IFPA-website event attendance, vouching, or first IFPA club join).

The tier-grant mapping itself (the per-standing precedence and the Tier 3 underlying derivation) is the rule defined in the `M_Claim_Legacy_Account` user story and is not restated here. This section covers only the cutover sequencing.

The three `legacy_*` tier-state fields the mapping reads (see DATA_MODEL Legacy Members, §4.14b) are a deferred schema extension on `legacy_members` (or staging), populated by the loader and gated on test-load validation per §15.16 and §25 gate G6. A field that is not loaded (data undelivered, or held back at validation) simply does not fire, so the affected claims grant on whatever standings are present; an account with only honors is granted on that basis. Held-back fields are recorded in §28.

---

## 4. Name model

The name model (the `real_name` plus `display_name` fields, the shared-surname constraint scoped to new registrations and profile edits, the legacy-import exemption, and the permanent slug lifecycle) is specified in the Member Name Model decision in DESIGN_DECISIONS (§2.10).

---

## 5. Competition history fields

The `first_competition_year` and `show_competitive_results` fields, their COALESCE prefill at claim, the public-results caveat text, and the onboarding prompt are specified in the Competition History Fields decision in DESIGN_DECISIONS (§2.11) and collected per the `M_Complete_Onboarding_Wizard` user story.

---

## 6. Identity and person links

The Member, Legacy Member, and Historical Person Entity Types decision in DESIGN_DECISIONS (§2.4, rules 3-5) owns this contract: `personHref()` dispatches to `/members/:slug` when a live member has claimed the historical person, else `/history/:personId`; account deletion clears both FK links (and `legacy_members.claimed_by_member_id`), reverting person links to the historical URL. One member-facing nuance lives here: when a linked historical person's name differs from the member's display name, the historical name is shown on the member profile.

---

## 7. Auto-link: matching legacy_members, historical_persons, and members

Auto-link links each `historical_persons` row to its `legacy_members` provenance, and stages candidate matches between a live member and a `legacy_members` / `historical_persons` row for the member to confirm in the onboarding wizard (no email is sent and no live table is mutated until the member confirms). The anchors, the evidence-strength tiers, multi-record handling, the anchor-uniqueness fallbacks, name-variant matching, cross-source detection, and the a-priori honors validation are specified in the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the `M_Claim_Legacy_Account` user story. The one-time batch auto-link staging job runs at cutover (gate G24 in the validation gates, §25, sequenced by the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo); the remaining dump-gated claim surfaces clear gates G22, G23, and G25.

---

## 8. Self-serve claim flow

The member's claim experience (the five identity-reconciliation cases, the anchors, the direct historical-record claim, the registration-time conflict prompt, the dispute path, the non-revealing anti-enumeration messaging, the rate limiting, and the claim-ineligibility predicates) is specified by the `M_Claim_Legacy_Account` user story and the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5). Two of its invariants are go-live gates: the non-revealing-messaging invariant is gate G17 and claim-surface rate limiting is gate G18 (validation gates, §25).

---

## 9. Merge rules

When a claim resolves, the active modern account always wins and editable fields are copied from the claimed `legacy_members` row (honors by OR, profile fields fill-if-empty, first competition year by COALESCE, a single `member_tier_grants` row, and the historical-person merge), with concurrent-claim races resolved by the partial UNIQUE indexes. The full field-by-field merge and the race handling are specified in the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the `M_Claim_Legacy_Account` user story.

---

## 10. Club bootstrap and onboarding

Club bootstrap and onboarding is specified across three homes: the club classifier under `legacy_data/clubs/scripts/` (the authoritative rule home for the four-way classification, its thresholds, and the R1-R10 rules); the `M_Complete_Onboarding_Wizard` user story (the registrant club flow and the bootstrap-leadership classification gates) and the `A_Periodic_Club_Cleanup` user story (the admin residue queue and cleanup predicates); and DATA_MODEL Migration Staging and Bootstrap Tables (§4.27) for `legacy_club_candidates`, `legacy_person_club_affiliations`, and `club_bootstrap_leaders`.

### 10.1 Club classification rules

The four-way classification (pre-populate, onboarding-visible, dormant, junk), its tunable thresholds, the duplicate-club merge, the junk signal-absence rule, the promotion paths, and the R1-R10 evidence columns are owned by the club classifier under `legacy_data/clubs/scripts/`. Cutover quality is gate G7 in the validation gates (§25), which requires the club-only person extraction (§10.2) to run first.

### 10.2 Expanding historical_persons for club members

The roughly 1,700 club-only people from the mirror are extracted into `historical_persons` with `PROVISIONAL` provenance so the classifier's contact-active and member-active signals are not deflated. This is gate G12 in the validation gates (§25), and the pipeline runs it before classification (sequenced by the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo). The extraction is owned by the legacy_data pipeline (`legacy_data/clubs/scripts/05_build_club_only_persons.py`, run in the enrichment phases).

### 10.3 Club onboarding flow during registration

The registrant club-affiliation flow (Stage 1 cards, the wrap-up landing, the content-editing gates, and URL verification before publication) is specified in the `M_Complete_Onboarding_Wizard` user story.

### 10.4 Long-term cleanup

The admin-driven cleanup of legacy club residue (the on-demand cleanup queue, the labeled `pending` affiliations on rosters, the member flag mechanism, and the per-category terminal states) is specified in the `A_Periodic_Club_Cleanup` user story.

---

## 11. Onboarding wizard service

The onboarding wizard service (the per-member task list, the fixed task order of `personal_details` then `legacy_claim` then `club_affiliations`, and its storage in `member_onboarding_tasks`) is specified in the `M_Complete_Onboarding_Wizard` user story; the table is documented in DATA_MODEL Member Onboarding Tasks (§4.29).

---

## 12. Security model summary

The migration security and privacy rules (no credential import; `legacy_email` as metadata only; no auto-link emails; the optional mailbox-control upgrade; member-declared anchors kept member-and-admin private; imported rows that cannot log in, be searched, or be broadcast to; account-bound claim tokens; rate limiting on every claim surface; the non-revealing-messaging rule; bootstrap leadership conferring no live permission until confirmed; loosened name validation for imports; and the parent-domain cookie scope defended by the CSRF Origin pin) are specified in the Security, Privacy, and Historical Record Governance decision in DESIGN_DECISIONS (§3.9), the Account Security Tokens decision (§3.8), and DATA_GOVERNANCE.

---

## 13. Admin flows

Migration-time admin involvement is reactive. The member-initiated link-help request and the dispute revert are specified in the `A_Review_Member_Link_Help_Requests` user story, and the initial-admin bootstrap is the Administrator Role Lifecycle decision in DESIGN_DECISIONS (§2.9). The bootstrap grants satisfy go-live gate GV2 (the go-live gate index in GO_LIVE_PLAN.md, private GitHub repo).

---

## 14. User stories summary

The user-facing behavior referenced throughout this document is specified by the stories in `docs/USER_STORIES.md`, principally `M_Claim_Legacy_Account`, `M_Complete_Onboarding_Wizard`, `M_Edit_Profile`, `M_Delete_Account`, `A_Review_Member_Link_Help_Requests`, and `A_Periodic_Club_Cleanup`.

---

## Part B -- Contracts

## 15. Required schema changes

The schema the migration adds and the constraints it relies on are specified in DATA_MODEL (Members & Authentication §4.14, Legacy Members §4.14b, Member Tier Grants §4.12, Migration Staging and Bootstrap Tables §4.27, Member Declared Anchors §4.30, Staged Auto-Link Candidates §4.31, and Name-matching utilities §4.28) and are authoritative in `database/schema.sql`. One field below is cutover-conditional and stays tracked here because a go-live gate depends on it:

### 15.16 Tier-mapping fields on `legacy_members`

The three `legacy_*` tier-state fields read by the claim-time tier grant are specified in DATA_MODEL §4.14b (their meaning) and USER_STORIES `M_Claim_Legacy_Account` (the mapping that reads them). This section covers only their cutover handling.

Schema authority: `database/schema.sql`. The cutover database is built fresh from `schema.sql` plus loaders; the data-preserving deploy path `scripts/deploy-migrate.sh` has landed; what gates OR9/OR9a still need from it is the durability run proving curator media, galleries and email-template rows survive a deploy through it with no seeder run (the go-live gate index, GO_LIVE_PLAN.md, private GitHub repo). The loader populates the three paid-tier fields.

At test load (gate G6, §25), each field is spot-checked against known reference cases: members known to hold Tier-2 / organizer standing at cutover, known Tier-1-lifetime members, and known active Tier-1 annual members. The three paid-tier fields derive from the two expiration columns the legacy site's own tier function reads, `MemberIFPAExpiration` and `MemberIFPAExpiration2`: the second carries Tier 2 standing, and in each the `-1` sentinel means lifetime, a real epoch is an annual expiry, and zero means the standing was never held. Tier 2 standing derives from a non-zero Tier 2 expiration, Tier 1 lifetime from the Tier 1 sentinel, and Tier 1 annual from a Tier 1 epoch still unexpired at the cutover moment. The stored `MemberIFPATier` code is not read: the legacy site abandoned it in a one-time 2007 conversion, no live path writes it, and the site overwrites the stored value with the computed one before display, so every member who first paid after the conversion still carries the pre-conversion code. The extraction step refuses to emit a load file whose derived fields fail to carry the standing that tier function computes, so a member holding live standing cannot silently arrive as Tier 0. The `ifpa_memberpayments` history is not read either — a deliberate simplification: current standing implies having paid, and lapsed standing grants on honors alone. A field whose values do not match the references (administrative corrections, refunded payments, test records, or other contamination) is left unpopulated; its basis then does not fire for any claim, and the other standings still apply. If the tier inputs are insufficient overall, the paid fields are left unpopulated and claims grant on honors alone. Whatever is held back is recorded in §28.

---

## 16. Data pipeline inventory

The data pipeline inventory (the curated and extracted CSVs, the generated outputs, and the pipeline script locations) is in `legacy_data/README.md`.

---

## 17. Migration vs operational table classification

Which migration tables are permanent and which are droppable staging is documented per table in DATA_MODEL Migration Staging and Bootstrap Tables (§4.27).

---

## 18. Audit requirements

The migration audit events (the `claim.*`, `legacy.*`, `wizard.*`, `support.*`, and `club.bootstrap_*` action types and the required per-event metadata) are in the authoritative action_type catalog in DATA_MODEL Admin Operations (§4.9). No migration dashboard is required; the existing append-only audit history records all migration events.

---

## 19. Stakeholder contracts (moved)

The legacy webmaster's contract — the residual asks (the write-freeze and final member export, the committee-tables delivery, reachability through the go-live window, the residual server-config facts, the recovery-artifact capture and legacy-side shutdown, and the retirement-milestone list), his contact, the recorded resolutions of past asks, and the action sequencing — lives in GO_LIVE_PLAN.md (private GitHub repo), under "Stakeholder coordination". The technical facts those asks produced remain recorded in this plan's surviving sections (the export contract and credential exclusion in §15.16 and §25, the DNS and email dispositions in §28 and §29.12/§29.12a, the archive scope in §29.15).

Everything the webmaster delivers is preserved on the IFPA's own side before the legacy host is powered down, and that preservation is a go-live blocker rather than a courtesy: it is the webmaster-coordination gate WM21 in that same private plan. A re-runnable extractor in this repository, `legacy_data/scripts/extract_legacy_estate.py`, converts every delivered module dump into CSVs in the maintainers' private operations repository, one directory per module with a checksum manifest and a record of its provenance, and copies the material no dump contains: the governance prose behind the election records, the reference wiki images, the forwarding-alias map, and the per-group last-archive-message dates that exist only in an authenticated capture. Stored credentials never reach the output — any column whose name reads as a secret is omitted as each row is written, which is the same contract §15.16 and §25 state for the member export, applied to the whole estate. The extractor is idempotent, so it is re-run after each delivery and once more after the final export; the raw dumps themselves stay where they are, under the ruled exception that keeps them out of both git repositories.

---

## 20. Maintainer, secretary, and project-manager coordination (moved)

The coordination contracts with the historical-pipeline maintainer, the IFPA secretary, and the project manager — including the discovery-program asks and the project-management duties — live in GO_LIVE_PLAN.md (private GitHub repo), under "Stakeholder coordination"; live status is tracked in the maintainers' private tracker. The data-review sign-off is one of those coordination contracts: the historical-pipeline maintainer confirms that legacy data is complete and member-list presentation is reviewed, and that confirmation is tracked with the rest of the pipeline work in the maintainers' private tracker.

---

## 21. Design decisions affected

The migration-driven design decisions live in `docs/DESIGN_DECISIONS.md`: the three-table identity model (Member, Legacy Member, and Historical Person Entity Types, §2.4), the Member Name Model (§2.10), Competition History Fields (§2.11), Account Security Tokens (§3.8), Security, Privacy, and Historical Record Governance (§3.9), and Legacy Data Migration (§6.5, §6.5a).

---

## Part C -- Go-live

## 22. Go-live blocker index

All pass/fail data-quality, pipeline-output, and code-behavior blockers in one view. This table is the pipeline gate family (the G-prefixed gates): engineering acceptance criteria for the legacy-data pipeline, defined with their failure handling in §25. The rest of the go-live gate index (the external-dependency, webmaster-coordination, operational-readiness, rehearsal, code-governance, compliance, pre-cutover, and retirement families), the gate criteria that govern the index, the cutover state machine, and the launch sequencing live in GO_LIVE_PLAN.md (private GitHub repo), the authoritative go-live plan of record. State names in the Blocks column refer to the cutover state machine there.

### Data-quality, pipeline-output, and code-behavior gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| G1 | No email value shared across accounts, taken across `legacy_email`/`legacy_email2`/`legacy_email3` | §25 | State 2 → State 3 |
| G2 | `legacy_user_id` unique where non-NULL | §25 | State 2 → State 3 |
| G3 | Import-source provenance populated on every `legacy_members` row | §25 | State 2 → State 3 |
| G4 | Profile/contact field shape and null quality | §25 | State 2 → State 3 |
| G5 | Legacy member ID quality | §25 | State 2 → State 3 |
| G6 | Tier-state mapping inputs | §25 | State 2 → State 3 |
| G7 | Mirror-derived club normalization quality (requires G12 PASS first) | §25 | State 2 → State 3 |
| G8 | High-confidence bootstrap leader candidates | §25 | State 2 → State 3 |
| G9 | Bootstrapped clubs produce valid pages | §25 | State 2 → State 3 |
| G10 | Outbox → SES → inbox smoke passes end-to-end | §25 | State 3 → State 4 |
| G11 | `name_variants` seeded (~385 mined pairs generated; the high-confidence subset is loaded and the medium-confidence remainder deferred; seed files track exact counts) | §25 | State 1 → State 2 |
| G12 | ~1,700 club-only persons extracted into `historical_persons` | §25 | State 1 → State 2 |
| G13 | `club_bootstrap_leaders` populated | §25 | State 1 → State 2 |
| G14 | `persons.csv` count reconciled | §25 | State 1 → State 2 |
| G15 | World records platform export produced | §25 | State 1 → State 2 |
| G16 | `run_pipeline.sh full` produces full output | §25 | State 1 → State 2 |
| G17 | Claim flow anti-enumeration invariant holds | §25 | State 2 → State 3 |
| G18 | Rate limiting active on claim / registration / password-reset | §25 | State 2 → State 3 |
| G19 | Wizard claim task universal; all evidence tiers exercised at test load | §25 | State 2 → State 3 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | §25 | State 1 → State 2 |
| G22 | Optional mailbox-control round-trip to declared old email verified end-to-end; evidence-tier upgrade audited | §25 | State 2 → State 3 |
| G23 | Multi-anchor candidate matching covers modern email + declared old emails + declared former surname + current real-name surname; `name_variants` in play | §25 | State 2 → State 3 |
| G24 | Batch auto-link candidate-staging SYS job ready to run at cutover (stages candidates only; no live-table mutation, no emails) | §25 | State 3 → State 4 |
| G25 | Direct historical-record claim affordance live: first-name warning UX, surname-mismatch messaging (current + declared former), audit metadata with evidence tier | §25 | State 2 → State 3 |
| G26 | Member-initiated admin help request wired (structured evidence intake, admin review surface, audit on approval) | §25 | State 2 → State 3 |
| G27 | Multi-record candidate ambiguity count measured against test load and within wizard confirmation throughput (or `name_variants` pruned) | §25 | State 2 → State 3 |

---

## 23. Build stages (moved)

The build-and-preparation stages and the go-live scheduling constraints live in GO_LIVE_PLAN.md (private GitHub repo), under "Launch sequencing".

---

## 24. Operational states (moved)

The cutover state machine (States 0 through 6 and the cutover-day sequence) lives in GO_LIVE_PLAN.md (private GitHub repo), under "Cutover state machine".

---

## 25. Validation gates

The following must be confirmed at the test load before go-live. These are not open design questions; they are data-quality checkpoints. State names in this section refer to the cutover state machine in GO_LIVE_PLAN.md (private GitHub repo).

| Gate | Description | Failure handling |
|---|---|---|
| G1 | No email value, taken across `legacy_email` / `legacy_email2` / `legacy_email3`, appears on more than one row (cross-column uniqueness); collisions surface a priori for curation | Replace provisional unique index with non-unique lookup + ambiguity handling |
| G2 | `legacy_user_id` is unique where non-NULL | Same as G1 |
| G3 | Every `legacy_members` row carries a populated `import_source` value; a row missing it is routed to admin review rather than silently trusted. | Rows failing the provenance check route through admin review per §8 claim ineligibility |
| G4 | Shape and null quality of profile/contact fields | Adjust import logic and field mapping |
| G5 | Legacy member ID quality: every `legacy_member_id` integer-format-validated and comprehensively (100%) overlap-reconciled against the mirror profile-URL ids and `historical_persons.legacy_member_id`, not a 10% sample | Resolve before final export |
| G6 | Tier-state inputs validated at test load: each of the three `legacy_*` tier-state fields (DATA_MODEL §4.14b) is spot-checked against reference cases. **PASS**: validated fields are populated and the claim-time mapping reads them; any field that fails validation is left unpopulated, so its basis does not fire (if the paid fields all fail, claims grant on honors alone). Held-back fields are recorded in §28. | Unvalidated fields left unpopulated; honors basis always applies |
| G7 | Mirror-derived club normalization quality. **Requires G12 PASS** so the classifier's `listed_contact` and `member_active` signals (§10.1 "Required order" step 1) run against the fully-populated `historical_persons` set including club-only members; running G7 against a partial `historical_persons` set silently under-classifies clubs whose people never competed | Block until G12 PASSes; increase manual review threshold for any remaining quality gaps after both gates clear |
| G8 | Sufficient high-confidence club-leader bootstrap candidates | Adjust bootstrap threshold or expand manual review scope |
| G9 | Bootstrapped clubs produce valid, non-broken club pages | Fix UI before go-live |
| G10 | Outbox → SES → recipient inbox path works end-to-end on the pre-cutover release (enqueue test row, worker drains within 60 seconds, SES returns MessageId, message arrives in recipient inbox) | Debug before cutover; common causes are IAM Resource scope, SES sandbox state, worker container env vars, worker event-loop bugs |
| G11 | `name_variants` seeded with the high-confidence mined pairs (the seed files track the exact split of loaded and deferred; the `name_variants` contract is DATA_MODEL Name-matching utilities, §4.28) | Auto-link medium-confidence coverage drops; low-confidence admin queue expands; document shortfall in State 1 review |
| G12 | ~1,700 club-only persons extracted into `historical_persons` per §10.2 | Classification signals (active-players, contact-competed) run with reduced coverage; onboarding-visible list may shrink |
| G13 | `club_bootstrap_leaders` populated for pre-populated clubs meeting the §2 bootstrap rule | Leadership activation defers to path 2 (first affiliated member volunteers for leadership) for affected clubs |
| G14 | Canonical `persons.csv` row count reconciled against `historical_persons` population; any accepted discrepancy documented and signed off | Block at test load until reconciled; unexplained delta risks missing or duplicated historical identities |
| G15 | World records export produced in platform format and loads into the records schema cleanly | Records page launches empty or incomplete; fix export before go-live or hide the records entry point |
| G16 | `run_pipeline.sh full` produces events, results, persons, clubs (classified), bootstrap leaders, club-only persons, and variants in one run | Document the multi-step manual sequence required and capture sign-off at State 1; single-command regeneration is the long-term target |
| G17 | Claim flow anti-enumeration invariant holds per §8 "Non-revealing messaging" (identical UX across matched-none, matched-multiple, matched-ineligible, and matched-eligible, per §8's case list) | Collapse divergent response shapes before go-live; side-channel enumeration otherwise possible |
| G18 | Rate limiting active on identifier lookup, declared-anchor changes, claim confirmations, optional mailbox-link-click round-trip, registration, and password-reset per §8 (token mechanics per DD §3.8; numeric defaults owned by USER_STORIES) | Block go-live until limiters engage; declared-anchor enumeration and mailbox abuse otherwise unmitigated |
| G19 | Wizard claim task universally surfaces staged candidates and the declared-anchor prompt to every registrant per §7 and §14; all evidence tiers (`declared_anchor_only`, `currently_controls_modern_email_matching_legacy`, `mailbox_control_via_link_click`) exercised at test load. The `mailbox_control_via_link_click` tier is exercised via the G22 round-trip | Members without a stage-1 anchor match never get prompted to declare; legitimate claims are missed |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | Claim-lookup falls back to `legacy_member_id` only; auto-link candidate coverage drops because the email anchor is missing |
| G22 | Optional mailbox-control round-trip verified end-to-end at test load: declared old email → confirmation link issued → click consumes token and upgrades the audit evidence tier to `mailbox_control_via_link_click`; rate-limited per requesting member, per target row, per session/IP per §8 | Members cannot upgrade declared-anchor claims to hard-evidence; admin help requests carry more weight by default |
| G23 | Multi-anchor candidate matching covers verified modern email, declared old emails, declared former surname, and current real-name surname per §7; seeded `name_variants` table drives first-name variant resolution | Candidate coverage drops to email-anchor-only and admin-help-request volume rises |
| G24 | `OperationsPlatformService` batch auto-link SYS job ready to run once at cutover; the job stages candidates (no live-table mutation, no notification emails); one `system_job_runs` row recorded per run; audit-emission coverage verified at test load (one `audit_entries` row per `legacy.auto_link_candidate_staged` event). Idempotent: rerun produces no duplicate candidates. | If audit-emission coverage is incomplete, fix the audit emission path before declaring G24 PASS; without the staging job, candidate matching runs only at member sign-in and pre-cutover live members get no proactive surfacing |
| G25 | `/history/:personId/claim` confirm page renders the first-name-variant warning inline; surname-mismatch messaging is user-readable; audit metadata captures the evidence tier (the four evidence-strength tiers are in the Legacy Data Migration decision in DESIGN_DECISIONS, §6.5) and any first-name variant used for direct-HP claims per §8 | Direct HP claim usable but klunky; surname-block failures surface as raw `ValidationError` text rather than the spec'd confirm-page warning |
| G26 | Member-initiated admin help request (§13) wired with structured evidence intake, admin review surface, and audit emission carrying `admin_vetted_evidence` on approval | Members stuck without an auto-surfaced candidate have no path forward; admin-recovery is informal |
| G27 | Multi-record candidate ambiguity count from the seeded `name_variants` table against the test-load `legacy_members` set measured and reviewed jointly by the primary maintainer and historical-pipeline maintainer; if the count exceeds the member-confirmation throughput the platform can comfortably handle, the `name_variants` seed is pruned before batch candidate staging runs at cutover | If unmeasured, members are presented with too many candidates per card and confirmation fatigue produces wrong-account confirmations |

**Tuning authority for G8:** Bootstrap threshold adjustments at test load are a joint decision between the primary maintainer and the historical-pipeline maintainer. Raising the threshold (more conservative) is routine and requires no additional sign-off. Lowering the threshold below a minimum acceptable value (to be set during State 2 review if lowering is needed) requires IFPA board sign-off, because lowering materially expands who gains bootstrap leadership and the live club-management permissions that follow at first claim.

---

## 26. Data quality from persons.csv analysis

Counts move with pipeline runs; the pipeline QC reports are authoritative. Verified against the current canonical outputs: `legacy_data/event_results/canonical_input/persons.csv` carries ~3,570 persons (the ~1,700 club-only cohort loads separately as PROVISIONAL rows per §10.2), and the generated `name_variants` seed carries ~385 pairs (gate G11; the seed file tracks the exact count).

One structural limitation worth keeping in view: first-name-change cases (a member who legitimately changed their first name, rather than a variant or spelling difference) cannot be caught by the variants table; they surface only when the member declares the change through the optional declared anchors (DATA_MODEL Member Declared Anchors, §4.30) or invokes the admin help request (§13).

---

## 27. Rollback posture

**Pre-flip:** abort, fix, retry. No data has moved yet.

**Post-flip path A, non-catastrophic failures (most cases):** fix-forward. Production deploys a patch; no rollback. Covers UI bugs, slow queries, non-critical alarm noise, and anything that does not corrupt member identity, claim state, or audit integrity.

**Post-flip path B, catastrophic failures (rare, narrowly defined):** DB restore from the pre-flip snapshot, executed by the operator, with any DNS change operator-made on the low-TTL Route 53 zone. No standing legacy server exists to revert to: if the platform cannot serve even after the restore, a read-only legacy fallback may be reconstructed from the tested encrypted artifact (the legacy-data retention commitment) as a last resort — the member system stays frozen either way. A DNS change converges over minutes, not seconds: clients and resolvers that cached the new records lag by up to their cached TTL. Catastrophic is one of:

- schema corruption that prevents reads;
- identity-data corruption that misroutes claims or auto-link writes;
- write-amplification that produces malformed audit or queue entries at scale;
- outbound communication that is incorrect or premature and cannot be recalled (e.g. a misfired Stripe webhook batch that grants or revokes tiers in error, or transactional mail sent under a regressed template that misidentifies recipients at scale). Note that path B does not actually un-send already-sent emails; it restores the DB state so corrective communication can be sent from a clean baseline.

Decision authority is the primary maintainer.

**Path B re-entry:** the legacy member system stays permanently frozen (the freeze is never lifted), and the final export and the pre-flip snapshot remain valid regardless of what path B did, so a cutover retry re-imports the same export and re-cuts-over once the defect is fixed. No second freeze or fresh export is needed.

The pre-flip snapshot is the load-bearing artifact for path B. It is captured during the cutover sequence (GO_LIVE_PLAN.md, private GitHub repo) after the post-import validation checks and before the DNS switch, so it includes the final import, the tier-mapping dry-run, the bootstrapped clubs and leaders, and the staged auto-link candidates. Restore returns the database to this exact pre-flip state; staged candidates are present in the snapshot and surface to members when they sign in after the restore. It lives in the cross-region disaster-recovery bucket with S3 Object Lock (DEVOPS_GUIDE.md (private GitHub repo), "Cross-region snapshot replication"). Creation, integrity verification, and a successful dry-run restore against staging are preconditions; see §29.1a.

Path B does not recover from systemic bugs in the candidate-staging step itself, because those bugs' results are present in the snapshot. Staged-candidate defects are addressed by the per-member dispute path (§8) and admin revert (§13), and by the pre-cutover validation gates G23 and G24.

**Rollback window:** 48 hours, counted from member sign-in opening rather than from the record switch. The records move at the write-freeze, days earlier, but until sign-in opens the only thing a visitor reaches is the migration page, the zero-logins alarm that monitors this window measures nothing, and there is no member write to lose. Anchoring it to the first member traffic puts the window, its alarm and the point of no return at the same moment.

It is a watch-and-decide window, not a free-rollback one, and the distinction is load-bearing. From the first member write a snapshot restore is a data-loss event rather than a reversal, so these 48 hours are not a period in which reversal is costless: they are the period in which reversal remains on the table despite the cost, and in which someone is actively watching for the failures that would justify it. After 48 hours the new platform is authoritative regardless of what surfaces; reversal requires explicit joint sign-off from the primary maintainer and the legacy-site webmaster, and is treated as a manual recovery exercise rather than a rollback. The webmaster's sign-off is required because reversal means reconstructing a read-only legacy site from the encrypted artifact he captured, not restarting a server that was left running; no legacy server survives the cutover.

**Post-cutover monitoring posture (the 48 hours from member sign-in opening).** The rollback window requires active monitoring, not passive waiting. DEVOPS_GUIDE.md (private GitHub repo) documents the cutover watches (the CloudFront origin-latency watch and the zero-logins / cutover-login alarm) and the production CloudWatch config defines them; both are already deployed, with default values nothing has measured, so the remaining work before cutover is validating the origin-latency threshold against the staging baseline and confirming the cutover login alarm is armed for the window, with escalation paths. The observables:

- HTTP 5xx error rate on the CloudFront distribution (baseline: 0; alarm: sustained >1% of requests over 5 minutes).
- Response latency at the origin (deployed alarm: p90 above 3s sustained for 15 minutes; that threshold is a default and is validated against the staging baseline before cutover).
- SES bounce rate and complaint rate (alarm: bounce >5% or complaint >0.1% of daily volume; SES auto-suspends sending at higher thresholds).
- Outbox queue depth: `outbox_emails` rows with `status='pending'` growing faster than the worker drains them (alarm: >50 pending rows sustained over 10 minutes).
- Successful logins (detects auth-chain defects; deployed alarm, production only: zero successful logins across a 2-hour window, armed for the cutover window and off in steady state, where quiet overnight hours would false-positive).
- Claim-wizard conversion: candidates surfaced vs. claims initiated (no hard alarm; manual check at T+4h and T+24h to confirm the flow is working).
- CloudFront cache-invalidation confirmation: verify `/*` invalidation completed within 60 seconds of T-0 (one-time check).

**Legacy data retention:** the final export and the recovery package are retained as encrypted, IFPA-custody artifacts for at least 30 days after the 48-hour rollback window ends, for reference and targeted manual recovery (the legacy-data retention commitment, coordinated privately). Retention is of artifacts, not of a running system. This is sequential to and distinct from the 48-hour rollback window: retention enables one-off historical lookups by admin; the window is the time-bounded period in which a restore-based rollback remains on the table.

**Member writes lost on restore:** any claim, registration, or club-affiliation write that lands between snapshot capture and rollback is lost on restore. The 48-hour window plus the platform's traffic profile bound the affected count; affected members re-do the action after the platform stabilizes.

**Post-flip path A-prime, bounded business-logic defects:** admin-level data correction plus affected-member notification, without full platform rollback. Covers defects that corrupt a bounded set of records but do not meet the path B catastrophic threshold: incorrect tier-mapping for a subset of members, auto-link candidate staging that surfaces wrong matches for a subset of legacy accounts, club-bootstrap that assigns wrong leaders. The defect is in the data, not the schema or identity layer, and the affected population is enumerable. Remediation: admin identifies affected rows via targeted query; applies per-record correction via admin tools; dispatches notification email to affected members explaining the correction. Path A-prime does not require a DNS change or DB restore. Decision authority is the primary maintainer; if the affected count exceeds 1% of migrated accounts or the defect cannot be corrected by record-specific admin actions, escalate to path B evaluation.

**No automated rollback** is provided after the DNS cutover. Path B is operator-driven via the runbook in DEVOPS_GUIDE.md (private GitHub repo).

---

## 28. Open issues

Stakeholder-facing open questions are coordinated privately (GO_LIVE_PLAN.md, private GitHub repo, "Stakeholder coordination") and status-tracked in the maintainers' private tracker; this section holds the internal technical detail of record.

### Deferred to data validation

Decisions gated on what validation of the delivered legacy data reveals.

1. **`announce_opt_in`**: Test load confirms the field is present (`MemberAnnounceOptIn`, plus `MemberEmailOptIn`). Resolved: legacy mailing opt-in is not imported as active consent and no `members` column is added. The legacy flags are recorded as legacy metadata only; members set their subscription preferences fresh after claim via `M_Manage_Email_Subscriptions`, and unclaimed `legacy_members` rows are never active mail recipients. The consequence is worth stating, because it decides how the membership learns the site has moved: once the legacy system is frozen, IFPA has no channel to an unclaimed legacy member at all, since the platform may not mail them and the old system can no longer send. The announcements sent from the legacy platform before the freeze are therefore the only notice those members receive. Nothing is lost by missing one. The claim path carries no deadline, and the domain does not change, so a member returning to footbag.org at any later date finds the new site and can still link their record. The legacy `members` table also carries per-field visibility flags (`MemberPublish`, `MemberPublishEmail`, `MemberPublishAddress`, `MemberPublishCity`, `MemberPublishPhone`); these follow the same rule, recorded as legacy metadata only and not imported as active visibility consent, since the new platform's privacy defaults and member-set visibility govern instead.
3. **Tier-mapping fields on `legacy_members` (§15.16)**: the tier/payment source fields available on the member record are `MemberIFPATier`, `MemberIFPAExpiration`, `MemberIFPAExpiration2`, `MemberIFPAPrevExp`, `MemberIFPAPaid`, `MemberIFPAPaymentDate`, and `MemberIFPAJoined`, plus `ifpa_memberpayments`; §15.16 states which of them the derivation reads. The `legacy_*` columns are derived, not copied. `MemberIFPAExpiration` and `MemberIFPAExpiration2` together are what the legacy site's own tier function reads: the second carries Tier 2 standing, and the pair distinguishes lifetime standing (the `-1` sentinel) from an annual expiry date. Board / Tier 3 standing is not derived from legacy data. The legacy admin PHP confirms `MemberIFPATier` holds only 0, 1, and 2 and does not encode Tier 3, and the committee tables confirm the same negative from the other side: the sitting directors carry a spread of ordinary tier codes between them, so no tier value distinguishes a director. Board standing is an administrator-set flag on the live member row, applied to the sitting directors after cutover, and the extractor makes no board determination. If the paid-history derivation proves insufficient, those fields are left unpopulated and their standings do not fire, so affected claims grant on honors alone.

### For the legacy-site webmaster's community knowledge

Community-dynamics decisions not settled by test-load data alone. Both below are now resolved in-platform or from the delivered data, with no webmaster read required.

4. **Impersonation handling. Settled (no webmaster input needed).** Honors-bearing direct claims are gated by the identity-link matching rules (surname match plus the declared email and date-of-birth anchors) and validated a priori against the public rosters; the registration-time name-collision prompt (§8) catches same-name collisions at signup; and a suspected fraudulent claim is raised to the admins and reverted through the dispute path. Impersonation is mitigated by these in-platform controls rather than by a webmaster risk assessment.

5. **Banned policy carryover**: the delivered data carries no ban field (no banned, blocked, suspended, or inactive column anywhere in the dump; re-confirmed against the final export at load), so there is nothing to carry over today, and no legacy ban gates a claim. If the team's check of the final export surfaces meaningful legacy bans, the platform may shift to one of: ban carries over silently (claim applies but the new account starts in a restricted state); banned legacy accounts unclaimable self-serve (member contacts admin); claim held until board review. Pending that, member discipline is handled by the new platform's own tools.

### Authoritative club universe loaded from the legacy dump

The delivered legacy dump carries the authoritative club universe: the `clubs` table's 597 `Approved=1` rows (of 602 total), with location lat/lon and `ClubPlaysNet`/`ClubPlaysFreestyle`. The overlay reconciles `legacy_data/seed/clubs.csv` to exactly those 597 approved keys: the 312 mirror-enriched rows already present are preserved verbatim, the 285 approved dump-only clubs are added, and any key the dump does not mark `Approved=1` is dropped. Deletion on the legacy site was soft (the `clubs.Approved` flag set false, never a row delete), so dormant and "deleted" clubs persist in the `clubs` table as unapproved rows; the seed holds only the 597 approved keys. A dump-only approved club carries no authoritative contact field, so it resolves its contact through the four-way classifier's existing substitute-contact predicate. The `clubcontacts` table (1,400 member-to-club links carrying `ContactPriority`, joining `ClubContactID` to `members.MemberID` and `ContactClubID` to `ClubID`) is corroboration only; the dump's `Approved=1` `clubs` rows are the authoritative club universe. That authority is over existence, not over values: the approval flag is the deletion signal the mirror structurally cannot carry, since a deleted club has no page left to crawl, while every field on an already-seeded row stays as curated. Cross-validating `clubcontacts` `ContactPriority` against the confidence-scored leadership inference in `legacy_data/seed/club_members.csv` (~2,400 associations, §16) remains a separate future quality pass.

### Legacy data domains present but unscoped

The delivered dump contains domains outside this plan. Recorded for a future scope decision; none is built without one.

| Domain | Dump rows | Disposition |
|---|---|---|
| Gallery / media | 16,768 images, 1,955 sets | Out of scope: served from `archive.footbag.org` (§29.15); not migrated |
| Freestyle tricks (`moves`) | 303 moves, 431 hints, 97 journals, plus `move_tip_votes` (footbag, incl. net moves) | The trick metadata is not imported: the new platform's freestyle dictionary is already more complete and is the authoritative source, so the legacy `moves` rows are abandoned. The member hints are the exception and were recovered, loading as trick tips (`moves_journal` is per-member private if ever reconsidered) |
| IFPA governance | elections 187, issues 332, votes 10,497, payments 209 | IFPA governance decision (the IFPA secretary rules, not the operator): the election, issue, and privately-cast vote tables are recommended for archive + encryption, sealed and never published (the same treatment as the legacy email archive), since they hold privately cast votes; the payments table is not read for tier derivation (§15.16); the committee and board tables are delivered as a separate module dump, and the migration reads neither: board standing is set by an administrator after cutover |
| Rankings | 12,672, plus 14 sets | No rankings surface scoped; decide whether it is a future feature |
| News | 17,682 | Archive-only: the rendered pages are preserved in the mirror, 17,779 of them against 17,682 rows, and the rows are not imported. The platform's own news feed is separate work rather than a migration of these rows |
| Rules (`rulebook3`) | 1,619 | IFPA rules already live in `ifpa/`; likely archive-only |
| Polls | 11, plus 4,899 answers | Likely drop |
| Localization | ~561 across four tables | Legacy i18n; likely drop |
| FAQ (`faq`/`faqsections`) | 38 entries, 7 sections | Archive-or-drop; check first for any sanctioning or membership-tier policy references |
| Event calendar (`calendar`) | 1,723 rows, 1,434 approved and not deleted, 1985-2026 | Not imported: the curated event history is more complete and is the authoritative source, so the legacy calendar is abandoned. The table carries a password column that is stripped wherever the data is handled |
| Group documents (`ifpa_group_files`) | 351 file records | File metadata only, no file contents; the private-group and committee-scoped subsets are excluded from the member-visible archive and held in private IFPA custody |
| Signup / address-validation queue (`actions`) | 1,323 rows (1,233 join requests, 90 address validations) | Not imported: a transient work queue carrying no date column and an empty data column. Its only content found nowhere else is up to 21 older or alternate email addresses, and every named person it references already has an address recorded against their legacy account. A former address becomes a claim anchor only once the member declares it and proves mailbox control, so loading these would bypass that proof for people who never asked and gain nothing |

### Front-door architecture (required by design intent)

The design is one clean DNS switch: at the write-freeze the `www` and bare-domain records point at the new platform, which serves the migration page until go-live, and the legacy site leaves the live path (§29.12). The zone is authoritative on Route 53 before go-live, so the switch and any recovery DNS change are operator-executed; the legacy server is not in the live path and no standing legacy server remains afterward — recovery is fix-forward or a platform restore (§27). In exchange: no reverse proxy or TLS certificate on the legacy box, no critical-path legacy dependency, and CloudFront sees client IPs directly.

**CloudFront technical constraints (verified):** the distribution carries `footbag.org` and `www.footbag.org` as alternate domain names with a matching ACM certificate in us-east-1; adding the alternate domain names requires only the certificate, not a DNS repoint. No intermediary ever fronts the distribution: anything terminating TLS for these names would have to present SNI and Host matching the alternate domain names, or CloudFront rejects the request with HTTP 421. A plain CNAME at the apex is illegal per RFC 1034; on Route 53 the apex is served as an ALIAS record to the distribution, which is why the zone moves to Route 53 before go-live and no separate apex redirect server is ever built.

### Feature scope by version (v1 / v2 / v3)

All scoped features default to v1 (launch day) unless a hard external dependency forces deferral; the allocation is decided and recorded here.

Functionality not in v1 scope is built natively afterward (complete by Worlds 2027), not kept on a live legacy host. Items dependent on this decision (each coordinated privately):

- Which legacy surfaces enter the write-freeze.
- Which ruling each `*.footbag.org` name gets (replace, archive, or retire — none stays on legacy).
- The retirement-milestone list that closes the legacy webmaster's role.
- Per-mailing-list allocation (Google Group, native in-app group, or retire).

**v1 (launch day):** member accounts, registration, login, profiles, tier management; legacy account import and claim flow (auto-link, declared anchors, mailbox verification, admin help requests); club bootstrap and onboarding; events, including the organizer and registration build (create, register, pay, attendance, co-organizers) alongside the read-only public event pages and historical results; freestyle trick dictionary and curated media; media and galleries; payments (Stripe: dues, event fees, donations, recurring); admin tools (work queues, payment reconciliation, sanctions, member help); transactional email via SES (SPF amended, SES DKIM applied), with legacy mail retired at cutover; native announce and live Stripe (live Stripe gated on the IFPA bank account + Board/Treasurer authorization); native in-app group and committee features (sequenced behind the group-disposition rulings and the story reconciliation); the clean DNS cutover itself; an archive subdomain for read-only historical content.

**Open questions (scope of the group build depends on the discovery rulings, coordinated privately and tracked in the maintainers' private tracker):**
- Per-mailing-list disposition (move to Google Groups or retire; one-way announce is native), with the IFPA secretary scoping which groups survive. Discussion lists never stay on a live legacy site. The platform's own outbound (SES) is settled v1 scope (§28 "Email transition").
- Which group and committee features the v1 build carries depends on which groups are active; some may not survive on legacy.
- (Forum disposition is settled: any surviving forum content is captured into the read-only archive; nothing stays live.)

**Deferred past v1 (native build after launch):** the living post-launch scope list is maintained in V2_SCOPE.md (private GitHub repo). Version two holds the voting-and-elections subsystem, the Hall of Fame nomination-and-voting flow that proves that subsystem out before any binding vote runs on it, IFPA rankings computed from sanctioned-event results, the news feed, and routine music for the freestyle routine disciplines it serves. Version three holds the BAP nomination-and-voting flow and native tournament operations for Worlds 2027 (see "Tournament operations" below). The Hall of Fame and BAP honors run on their separate external systems meanwhile, and the in-app honor grant stays v1. Everything else ships in v1. Legacy is never relied upon; the legacy shutdown itself happens at go-live, not post-MVP.

### Tournament operations

The legacy tournament system, "atib" (A Tournament In a Box), was partially disclosed by the webmaster: its backend is checked into the legacy repository under the `api/` and `registration/` apps and also feeds `ranking/` and the event-list results, while its AngularJS frontend is served separately and is not in that repository, and a later, incomplete NodeJS rewrite lives in its own repository. It went unused at Worlds 2026 and retires without a successor handover. The native tournament-operations build is therefore greenfield: it takes its requirements from what organizers need, not from the retired tool.

Requirements sources:

1. What the Worlds 2026 organizers actually ran the event on, which functions they needed, and what data they needed afterwards — the IFPA secretary confirms with the organizers.
2. What tournament day demands of the platform: seeding, brackets and draws, scheduling, match scoring, check-in, and live results.
3. Where the new platform's existing event system (create event, register players, collect fees, enter results, mark attendance, co-organizers) already covers part of it, and where it falls short, noting that routine music lands in version two alongside the freestyle routine disciplines.

Allocation (decided): not in v1, and not in v2. Native tournament operations are built after go-live in time for Worlds 2027, and no tournament function is kept on a live legacy host. No write-up or registration export is requested from the legacy webmaster unless the organizers' confirmation establishes a specific need.

Historic tournament and registration data is not imported (Decision 22): the platform's canonical historical results are cleaner and authoritative, so the webmaster need not export the legacy tournament tables; the native build models fresh. The legacy `registration/create.sql` is a stale stub and is not a reliable schema reference.

### Email transition

Email architecture (settled): the platform owns outbound from go-live, sent via SES, with the new sender added to the `footbag.org` SPF record and the SES DKIM records applied. Legacy mail retires at cutover along with the rest of the legacy site. The platform accepts no inbound mail (bounces and complaints are published to a topic and read from a queue the worker polls), so it needs no inbound mailbox. Inbound `@footbag.org` role addresses move to Google Workspace, provisioned from the published-address inventory derived from the archive mirror and from the mailing-list inventory coordinated privately with the IFPA secretary, before legacy mail is withdrawn so no inbound is lost.

**Decided architecture:**
- **Outbound:** AWS SES sends all transactional and mailing-list email (built and working).
- **Inbound:** Google Workspace handles `@footbag.org` role addresses (the per-address inventory is derived from the archive mirror, the legacy code, and the canonical documents; see the provisioning gate above). The `footbag.org` MX points at Google and its mailboxes, aliases, and forwarding are configured there. The platform itself receives no inbound mail and runs no custom inbound code.
- **Legacy `@footbag.org` mail server:** retired at the transition, both directions.
- **`@ifpa.footbag.org`:** out of scope here. It is a distinct mail domain, dispositioned separately under §29.12a (IFPA list mail), where it is ruled to retire: its one function with continuing use, the sanctioning contact, consolidates onto an apex address, and the list host shuts down at go-live. Moving the `footbag.org` MX does not touch it; zone edits preserve its records until that disposition executes.

**DNS record sequencing (two preparation steps).** Step one, any time early: the SES DKIM CNAMEs and the ACM/SES domain-verification records go into the zone (they do not affect the legacy sender) so certificate issuance, SES domain verification, and the production-access ticket complete ahead of cutover. Step two, ahead of the web cutover as a discrete preparation step: every active mailbox is provisioned on Google, the Google-side DKIM key is generated in the Workspace admin console and its record published (the key becomes available only once Gmail is serving the domain, so it is started at the top of this step), the apex SPF record is replaced by one naming the platform's own senders (SES and Google), the MX repoints to Google, and DMARC is published in monitor-only mode (`p=none`) with a report mailbox that already receives mail. Replacing rather than extending the SPF record is deliberate: every canonical address sends through SES or Google, and any residual sending from the retiring host stays deliverable on softfail through this window. At the web cutover legacy mail retires. Tightening comes last and only after verification: SPF softfail moves to `-all` and DMARC moves to `quarantine`, then `reject`, once the full sender list is confirmed and the DMARC aggregate reports run clean — tightening early would quarantine legitimate senders that are not yet on the record.

**Provisioning gate.** Withdrawing legacy `@footbag.org` mail is gated on provisioning being verifiably complete: every address published anywhere on the legacy public site exists on Google as a mailbox, group, or forward, and every mailing list has its disposition executed or scheduled. That published set is the gate because an address no outsider can discover is one no outsider can send to, and it is derived from the archive mirror rather than from the legacy mail server, so it is reproducible from a held artifact and closeable on evidence rather than on a list only the legacy webmaster could complete. It covers the functional addresses, the committee lists, and the webmaster's own published address. No wildcard catch-all is configured: a wildcard invites dictionary spam, and it serves the sender worse than a rejection, because it accepts a message into an unread mailbox while reporting success. An address outside the published set draws an immediate rejection, which tells its sender at once, and the platform's contact form is a published route that depends on no legacy alias.

**Email sequencing:** the platform's SES sending is verified before cutover (SPF amended, SES DKIM applied), and Google inbound is provisioned with the MX repointed as a discrete step ahead of the web cutover, so no inbound is lost. Contact addresses printed on the new site (`admin@`, per §29.8) resolve on Google.

**What the new platform already has (built and working):** outbound transactional email via SES (verification, password reset, claim links, receipts, reminders); the outbox drain that carries every send, including the paced release of bulk mail, which fills each pass with transactional rows first and gives bulk only a capped remainder, stops the bulk stream by itself when the recent bounce or complaint rate is at or above threshold, and offers an operator stop scoped to bulk alone; the mailing-list tables and seven seeded lists, with the one-click unsubscribe path; Terraform for SES domain identity, DKIM, SPF, DMARC (the Terraform writes these records into Route 53; with the early zone move, the operator applies them directly on Route 53, and nothing is hand-applied on the legacy zone). Bounce and complaint handling is built and reads from a queue the worker polls, and standing that queue up per environment is a go-live gate.

**What is not built, despite the tables existing:** no administrator surface creates, edits or archives a mailing list, and nothing composes a send to one, so the only fan-out in production code is the internal admin-alerts path. The broadcast archive table has no writer, and the group-roster audience is not implemented. Until that admin surface lands, the paced release described above has no way to carry a real member-facing send.

**What the new platform does NOT have:** inbound email handling of any kind, and no Reply-To configuration; outbound mail is From `noreply@footbag.org`, so member replies route wherever Google directs `noreply@`. Decide at provisioning time: a monitored `noreply@` alias on Google, or a Reply-To header pointing at `admin@`.

**Remaining discovery (informs provisioning, not architecture):**

The address inventory is no longer a discovery item: the externally reachable set is derived from the archive mirror and recorded in `mail-address-inventory.md` (private GitHub repo), which also separates the functional addresses from the per-member forwarding aliases that lapse at cutover. What remains:

1. Mailing lists, their owners, software, and per-list disposition.
2. Mailbox type per provisioned address: real login mailbox vs. forwarding alias or group (drives Google configuration).
3. Validation queries against the delivered legacy data: count `@footbag.org` addresses appearing in `legacy_members.legacy_email` and `members.login_email`; each needs Google provisioning or its claim/reset round-trips bounce.

### Standing consistency notes

- The product-facing term for `legacy_user_id` is "legacy username." This must be applied consistently in all UI copy, error messages, and documentation regardless of the column name.

---

## 29. Operational readiness for go-live

Non-data workstreams that must close before production cutover. Each subsection states the go-live gate (what must be true); operator setup procedures live in AWS_OPERATIONS.md (private GitHub repo) and routine runbooks live in DEVOPS_GUIDE.md (private GitHub repo). This section holds only what is required to green-light the go-live preparation and cutover transitions. Gate IDs (EX, WM, OR, PC, GV, LEG, R) and operational-state names in this section refer to the go-live gate index and the cutover state machine in GO_LIVE_PLAN.md (private GitHub repo); the G-prefixed gates are the §25 validation gates.

**Subsection numbering convention.** Numeric subsections (§29.1, §29.2, ..., §29.16) are the original ordered series. Letter-suffixed subsections (§29.1a, §29.12a, §29.12b) denote later additions inserted to keep related material adjacent rather than appended at the end; the go-live gate index (GO_LIVE_PLAN.md, private GitHub repo) refers to the exact suffix where applicable.

**Jargon used in this section.** DNS terms: A / AAAA (address records), CNAME (alias by name), ALIAS / ANAME (CNAME-like records that work at the zone apex, where plain CNAME is disallowed by RFC 1034), MX (mail exchange; routes inbound mail for the domain), DKIM (DomainKeys Identified Mail; per-domain DNS-published signing keys for outbound email authentication). AWS terms: ACM (AWS Certificate Manager; issues TLS certs), OAC (Origin Access Control; the S3-CloudFront access pattern that allows only the distribution to read), SSM (Systems Manager Parameter Store; secrets and config storage), KMS (Key Management Service; signing keys), SES (Simple Email Service; outbound mail). Reliability metrics: RPO (recovery point objective; how much recent data a restore can lose), RTO (recovery time objective; how quickly a restore returns service). Operational terms: source-profile IAM user (the long-lived IAM credentials a CLI operator assumes a role from), OOM (out of memory).

### 29.1 Data backup and disaster recovery

Gate: host-side SQLite backup producer runs on a schedule, ships to S3, and emits `BackupAgeMinutes`; a full restore drill has been rehearsed end-to-end on staging; a production-data restore drill has been completed against a copy of production data with recovery time meeting the RPO/RTO targets in DEVOPS_GUIDE.md (private GitHub repo), "Recovery objectives by scenario"; the backup-age CloudWatch alarm (`enable_backup_alarm = true`) is enabled and has emitted a non-alarm state; the cross-region replication-failure and replication-backlog alarms (`enable_replication_alarm = true`) are enabled and have emitted a non-alarm state, since a replication rule that stops working is otherwise silent and the DR copy drifts until the day it is needed; the cross-region DR bucket has Object Lock configured per DEVOPS_GUIDE.md (private GitHub repo), "Cross-region snapshot replication". Recovery targets: 5–10 min RPO, ~5 min RTO per DEVOPS_GUIDE.md (private GitHub repo), "Recovery objectives by scenario". Both drills run through `scripts/restore-db.sh`, the operator restore path, rather than by hand: a drill that rehearses an ad-hoc sequence proves that sequence and not the one an operator reaches for under pressure. Procedure: AWS_OPERATIONS.md (private GitHub repo), the durable backup and restore setup; DEVOPS_GUIDE.md (private GitHub repo), "Backup, Restore, and Disaster Recovery" (runbook).

### 29.1a Pre-flip DB snapshot

Gate: a dedicated snapshot of the production SQLite DB is captured during the cutover sequence (GO_LIVE_PLAN.md, private GitHub repo), after the post-import validation checks and before the DNS switch. The snapshot contains the final import, the tier-mapping dry-run, the bootstrapped clubs and leaders, and the batch auto-link results. The snapshot is the load-bearing artifact for the rollback path B in §27. Requirements:

- Snapshot is written to the cross-region DR bucket (S3 Object Lock per DEVOPS_GUIDE.md (private GitHub repo), "Cross-region snapshot replication") under a path distinct from the routine backup stream, so the snapshot is not aged out by the routine retention policy.
- Integrity verification is automated: snapshot SHA-256 is recorded, a `PRAGMA integrity_check` run against a temporary copy returns `ok`, and the row counts for `members`, `legacy_members`, `historical_persons`, `clubs`, `audit_entries`, and `auto_link_staged_candidates` are recorded in the cutover audit trail. The staged-candidates count is included because the snapshot carries the batch auto-link results and that table is what members act on at first sign-in, so a path-B restore with a wrong candidate count would otherwise pass the integrity check unnoticed.
- A dry-run restore against staging has been completed end-to-end within the past 7 days, using the same restore procedure that will be invoked for path B. The dry-run runbook is written into DEVOPS_GUIDE.md (private GitHub repo) before the drill and includes the steps to re-point the app at the restored DB. Serial dependency: the runbook must exist before the dry-run, and the dry-run must succeed before cutover; schedule both with weeks of lead time, not days.
- The snapshot's Object Lock retention is set to at least 60 days so the rollback window plus retention plus operator review headroom is comfortably covered.

Procedure: DEVOPS_GUIDE.md (private GitHub repo) (snapshot creation + restore runbook).

### 29.2 Observability and monitoring readiness

Gate: CloudWatch agent installed on the runtime host; `enable_cwagent_alarms = true` applied and CPU / memory / disk alarms reachable via SNS with operator subscription confirmed; CloudFront 5xx alarm active; container-log shipping to CloudWatch verified — `terraform apply` has created the `logs_publisher` role and the `/footbag/<env>/{app,nginx}` log groups that the `awslogs` driver requires pre-created, the host's `footbag-<env>-logs` profile assumes that role, and a deliberate error line and `outbox.depth` line raise the `app_errors` and `outbox_backlog` alarms; the origin-response-latency and login-success alarm thresholds read off the staging baseline and set; minimal operator dashboard documented. Procedure: AWS_OPERATIONS.md (private GitHub repo), the CloudWatch monitoring install and enablement and the `footbag-<env>-logs` container-log profile setup; DEVOPS_GUIDE.md (private GitHub repo), "Monitoring, Logging, Alerting, and Cost Control" (operating rules).

### 29.3 Edge and origin security

Gate: CloudFront enforces `X-Origin-Verify` on origin requests; Nginx rejects direct-to-origin traffic without the header; the S3 maintenance bucket with Origin Access Control is addressable via an ordered cache behavior at `/maintenance.html`. Direct origin bypass is no longer possible. Procedure: AWS_OPERATIONS.md (private GitHub repo), the public-edge origin-verify and maintenance-page hardening; DEVOPS_GUIDE.md (private GitHub repo), "Edge and request flow", "S3 bucket policy rules", and "Origin-verify shared-secret rotation runbook".

### 29.4 IAM least-privilege scope-down

Gate: `footbag-operator` removed from `AdministratorAccess` and moved to a least-privilege policy covering only services the project uses (Lightsail, CloudFront, S3, SSM, KMS, SNS, CloudWatch, self-IAM for rotation); the Lightsail host's `ec2-user` default account retired in favor of named operator accounts; source-profile IAM user's access keys on a documented 90-day rotation cadence; all runtime-role IAM policies (SSM read, S3 snapshots, SES send, KMS sign) declared in Terraform HCL so `terraform apply` is a safe operation that cannot silently drop a Console-added capability. Procedure: AWS_OPERATIONS.md (private GitHub repo), the operator IAM least-privilege scope-down and access-governance hardening; DEVOPS_GUIDE.md (private GitHub repo), "Source-profile access-key rotation".

### 29.5 Email deliverability operations

Gate: SES is out of sandbox with production access granted; `footbag.org` verified as an SES sender identity at the domain level via DKIM CNAMEs in the zone (per §29.12a MX disposition); an SNS topic subscribes to SES bounce and complaint events; the environment's bounce and complaint feed queue is stood up and subscribed to that topic, and the path has been tested end-to-end with a synthetic bounce against `bounce@simulator.amazonses.com` and the resulting suppression-row write confirmed in the app; the application processes those events into hard-bounce suppression and complaint tracking; email-delivery smoke (validation gate G10) has passed end-to-end on a pre-cutover release. Procedure: AWS_OPERATIONS.md (private GitHub repo), production SES activation.

The SES production-access ticket requires a stated daily send volume. Sending surfaces at cutover: transactional (verification, password reset, claim links on member sign-in), Active Player expiry reminders, and admin contact-request resolution replies. The member-migration announcement is not among them: it goes out from the legacy platform ahead of the mail cutover, per the sequencing ruling in GO_LIVE_PLAN.md (private GitHub repo). The delivered legacy data supplies the member-count input for the estimate. If 200 members sign in on day one and each triggers 1-2 transactional emails, baseline is 200-400/day. SES production default is 1 message/second; the outbox retry mechanism handles throttling, but queue depth and user-visible latency scale with the gap between send rate and burst volume. Request at least 1,000 emails/day with a burst justification referencing the cutover scenario.

### 29.6 Scheduled maintenance jobs

Gate: login rate-limit cooldown is wired to the `login_cooldown_minutes` setting; daily `account_tokens` cleanup job runs on the host and removes expired entries; job execution is observable via standard application logs or CloudWatch. Procedure: in-code + DEVOPS_GUIDE.md (private GitHub repo).

### 29.7 Secrets rotation

Gate: JWT signing-key rotation procedure with 24h overlap is documented and drilled against staging before production cutover; session JWT refresh re-issues the cookie when `exp` is within 6h per DD §3.4 (JWT Token Lifecycle and Configuration) so users are not silently logged out at the 24h TTL boundary; `SESSION_SECRET` rotation runbook exists. Source-profile access-key rotation is covered under §29.4. Procedure: DEVOPS_GUIDE.md (private GitHub repo), "Configuration, Secrets, and Key Management".

### 29.8 Pre-cutover revert and rotation checklist

Before stage 4 cutover, the following staging-observability-only deviations must be reverted and rotations completed. The operator steps are DEVOPS_GUIDE.md (private GitHub repo), "Pre-cutover revert and rotation runbook"; this checklist holds the assertions:

1. SES sender cutover complete: production sends from `noreply@footbag.org` under the canonical domain identity, verified end-to-end (per §29.12a MX disposition: domain-level verification, not email-address-level). Env and IAM only, no code.
2. Lightsail SSH ingress restored: any browser-SSH loosening from staging bring-up removed, returning to the `operator_cidrs`-constrained firewall.
3. Email armed on production: the email arming flag is flipped to armed (a tfvars change, applied and deployed; the deploy derives `SES_ADAPTER=live` from it) once SES production access has been granted. Dev and staging run `SES_ADAPTER=stub` and capture outbound mail for retrieval (the in-page simulated-email card on every email-gated login page; `/dev/outbox` for notifications with no host page); live SES delivery is production-only (the Dev and Staging Email Preview decision in DESIGN_DECISIONS, §5.6). The legacy `SES_SANDBOX_MODE` flag has been removed from the codebase; it is no longer read and must not be set in the env file.
4. Production Terraform bring-up complete (gate PC5): the reviewed plan applied against the production account well before cutover, each staged step leaving an artifact in the cutover log, and the go-live-gated variables staying off through the zone move.
5. Showcase records present: `legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py` seeds the showcase event and the Footbag Hacky historical person unconditionally, production included; the system member account's identity link depends on those rows, so the check asserts their presence via `scripts/validate-showcase-presence.sh`, and no environment flag may gate the seed (`legacy_data/tests/test_showcase_seed_unconditional.py` pins this).
6. Restore live `mailto:admin@footbag.org` in `/legal`: swap the `.contact-pending` span used in Privacy, Terms, and Copyright contact lines for a live `mailto:admin@footbag.org` once SES sender cutover (item 1) is complete and the canonical mailbox is active. Template-only change; no service or DB work.
7. Dev-shortcut auth surface removal. Dev autologin has already been removed: `src/middleware/auth.ts` runs the cookie path unconditionally and the `FOOTBAG_DEV_AUTOLOGIN_*` env vars and their guards no longer exist. The test-data persona harness (the `devRouter` mount in `src/app.ts` for `GET /dev/switch` and `GET /dev/personas`, gated to development and staging, and the `src/testkit/` subtree of persona factory, catalog, and seed runner) is permanent test infrastructure: it is excluded from the production image at build time and never mounted in production, but it is not removed from source at cutover. The registration-time admin email-allowlist bootstrap in `src/dev-bootstrap/` is likewise permanent dev/staging infrastructure (build-excluded from production, never source-deleted): it is the dev/staging peer of the production SSM-token first-admin claim. **Scope**: this item covers dev-only auth/persona surfaces. Production first-admin uses the SSM-token `/admin/bootstrap-claim` route (the Administrator Role Lifecycle decision in DESIGN_DECISIONS, §2.9; operator runbook in DEVOPS_GUIDE.md (private GitHub repo), "Production first-admin bootstrap").
8. JWT session TTL revert: the TTL constant in the JWT signing service is at the DD §3.4 (JWT Token Lifecycle and Configuration) baseline (24h = 86400 seconds) in the artifact shipped at cutover. This is the PC1 gate.

Sign-off on this checklist is a prerequisite for the State 3 → State 4 transition (the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo).

### 29.9 Production-specific prerequisites

Gate: ACM certificate for `footbag.org` issued in `us-east-1` and attached to the production CloudFront distribution; **ACM certificate for `archive.footbag.org` issued in `us-east-1` and attached to the archive CloudFront distribution** (separate cert, separate distribution, same Terraform pattern as the main cert; requires its own DNS validation CNAME published by the records-actor, the operator on Route 53); production KMS asymmetric signing key, source-profile IAM user, and runtime role provisioned (production mirror of the staging runtime-identity bring-up; procedure pointer below); Stripe production live API key and webhook signing secret stored in Parameter Store at `/footbag/production/secrets/stripe_secret_key` and `/footbag/production/secrets/stripe_webhook_secret`; Stripe webhook endpoint registered in the Stripe Dashboard, against the distribution's own URL while production is pre-live, and re-pointed at the production domain during the cutover's post-load repairs rather than when the zone move completes: between the zone move and the alias flip the apex and `www` still answer with the legacy host's values, so an endpoint re-pointed at that moment delivers live payment events to a site that has never carried that route, and a persistently failing endpoint is one the provider eventually disables; one end-to-end Stripe webhook delivery confirmed against the production endpoint before cutover, with the confirmation asserting that the `stripe-signature` header was validated by the app against the production webhook secret (e.g. by inspecting an audit row written by the signature-validation path on successful receipt) rather than only that the endpoint returned HTTP 200. Procedure: AWS_OPERATIONS.md (private GitHub repo), the production activation path — the ACM certificate and production KMS / runtime role provisioning, with the ACM runbook in DEVOPS_GUIDE.md (private GitHub repo), "ACM certificate for footbag.org runbook", and the production Stripe activation.

### 29.10 Code governance

Gate: GitHub `main` branch protection enforced (PR required, status checks must pass, linear history); the required-check job names match the names in `.github/workflows/ci.yml`; at least one administrator account provisioned in the production database and login-tested. Procedure: AWS_OPERATIONS.md (private GitHub repo), the GitHub and operator governance hardening (branch protection).

### 29.11 Compliance

Gate: privacy policy, Terms of Service, and cookie banner (if applicable) reviewed by the IFPA board and accessible from the production site footer. Prepared by IFPA, reviewed by the maintainer; not technical work.

### 29.12 DNS cutover

Under the clean cutover the apex and `www` move to the new platform at the write-freeze rather than at go-live: the operator switches both records on Route 53 to the CloudFront distribution, paired with the planned-maintenance toggle so the distribution serves the migration page from that moment, and the legacy site leaves the live path. Go-live is that toggle turning off, against records that already point at the distribution. Both the ACM certificate issuance procedure (DEVOPS_GUIDE.md (private GitHub repo), "ACM certificate for footbag.org runbook") and the DNS cutover procedure (DEVOPS_GUIDE.md (private GitHub repo), "DNS cutover sequence runbook") apply at the switch.

**Timing notation in this section.** `T-0` is the moment the operator switches the `www` and bare-domain records to the new platform, which happens at the write-freeze and brings the migration page up with it. `T-Nd` / `T-Nh` and `T+Nh` count from that switch. Go-live is a separate, later moment: the planned-maintenance toggle turning off, gated on the smoke test re-running green. The `T+48h` watch window is the one exception to that counting: it is anchored to member sign-in opening, not to the record switch, because that is when the platform first takes member traffic, when the zero-logins alarm that monitors the window starts measuring anything, and when reversal stops being cheap. See the §27 watch window.

**Gate (all verified before the switch):**

- The production and archive ACM certificates are issued in `us-east-1` and attached to their distributions, their validation records permanently in the zone, with no blocking CAA record at issuance.
- The zone is authoritative on Route 53 with the complete go-live record set staged and applied on its schedule (mail, DKIM, SPF, DMARC, validation, archive), the `www`/apex switch gated off until T-0, and a low TTL verified in advance. The record inventory with literal values and per-record verification is AWS_OPERATIONS.md (private GitHub repo), "DNS record inventory (footbag.org production zone)".
- The canonical host is `https://www.footbag.org` — the apex only redirects — so the CSRF Origin-pin, the sitemap and per-page canonical tags, and every SES-sent link derive from `www`; no template, seeded content row, or configured webhook URL names the bare apex as the site origin.
- The cutover-day smoke test is green: the expected page served through the distribution with the `footbag.org` certificate, and the apex 301-redirecting to `www`. First proved via the temporary `preview.footbag.org` subdomain at State 3; re-run green on cutover day before the switch.
- Email cutover ready (§29.12a): SES sending verified, Google inbound provisioned with the MX repointed, legacy mail retiring at cutover.
- Write-freeze: the legacy member system frozen permanently read-only and the final member export imported into production (per the stage 4 launch sequencing in GO_LIVE_PLAN.md, private GitHub repo). Only the legacy member system needs the freeze; the pipeline data is already authoritative.

The operator executes the switch per DEVOPS_GUIDE.md (private GitHub repo), "DNS cutover sequence runbook", and the 48-hour watch from member sign-in opening per §27; the webmaster gets the agreed advance notice of the cutover window; recovery is fix-forward or a platform restore, with any DNS action operator-made (§27).

Post-cutover verification: as part of the cutover-day operational verification step (the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo), confirm `www` resolves to the new platform via CloudFront (not directly to the Lightsail origin, per the §29.3 origin-verification gate) and the apex 301-redirects to `www`; correct before declaring that step complete.

Sign-off on this sequence is a prerequisite for the State 3 → State 4 transition (the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo).

**Zone move to Route 53 (go-live preparation):** the zone moves before go-live, early enough that all records are staged directly on Route 53, and resolution is verified against Route 53 before any cutover step depends on it. The zone is enumerated from a transfer against the authoritative servers rather than from a list supplied by the legacy webmaster, which makes the inventory reproducible from a held artifact and independent of his availability: 51 names and 85 records, unchanged since the zone serial was last incremented. Four absences carry the risk profile, and each is verified rather than assumed: the zone is not DNSSEC-signed (no delegation-signer record at the registry, no zone key), it carries no wildcard, no child-zone delegation, and no certificate-authority authorization record. The first removes the failure mode that makes a nameserver migration hazardous; the rest remove the ways a mirrored zone can answer differently from its source. `preview` and `archive` hold no record of any type, so both new names collide with nothing. One of the four delegated nameservers does not answer any query, so the delegation already runs a server short and the move repairs that rather than trading one arrangement for an equivalent one. The registrar side is executed through the IFPA-held registrar account by its IFPA account holders, with the primary maintainer as the domain technical contact. The move procedure is AWS_OPERATIONS.md (private GitHub repo), the domain-ownership and DNS coordination section. DNS authority sits under IFPA-controlled access from the move onward.

### 29.12a Legacy host after cutover (shutdown)

After cutover the legacy host serves nothing. The operator's DNS cutover is what darkens the site; after go-live is verified the legacy webmaster powers down the remaining legacy services on his own schedule, off the critical path. Recovery relies on the platform's own snapshot and the encrypted artifacts (§27), not on a standing legacy server. No legacy subdomain stays live.

**Hard design constraints (locked):**

1. Legacy serves nothing on the live path; the §29.3 origin-verification gate stands (only CloudFront reaches the new platform's origin). A catastrophic-failure fallback, if ever needed, is a read-only reconstruction from the tested encrypted artifact (§27), not a standing server.
2. Historical content is served read-only from the platform-controlled `archive.footbag.org` (its own CloudFront distribution over HTTPS, Route 53 DNS, signed-cookie auth per DD §6.4, Legacy Archive), not from live legacy subdomains. The archive's three CloudFront signed cookies carry `Domain=.footbag.org` per DD §6.4 so the archive edge receives them, while `__Host-footbag_session` stays host-only per DD §3.2 (JWT sessions); the signed cookies carry `Secure`, so only a `.footbag.org` name answering over HTTPS could receive them, and no legacy subdomain stays live, so the platform archive is the only other host that ever does.
3. The legacy-side shutdown executes once go-live is verified; the encrypted recovery artifacts are kept through the §27 window plus the dispute period, then working copies are destroyed on recorded dates. Nothing legacy is a long-lived parallel system.
4. The legacy webmaster captures the recovery artifacts and executes the legacy-side shutdown; DNS authority is on Route 53 under IFPA-controlled access from before go-live.
5. Group, committee, and mailing-list functions do not stay on a live legacy server. Per the privately coordinated inventory (the IFPA secretary scopes which survive): discussion lists move to Google Groups or retire with notice and archived history; one-way announce is native. IFPA `@ifpa.footbag.org` list functions are dispositioned with IFPA governance.
6. Names that resolve through the apex or `www` follow them to the distribution at the alias flip, and the distribution answers a hostname its certificate does not cover with a refusal rather than a page. Five legacy names are aliases onto those two (`fi`, `ftp`, `v`, `worlds`, `worldchampionships`), so they are removed in the same apply that flips the alias records, never deferred to a later cleanup pass: deferring leaves a window in which a name that answered a moment earlier resolves to a host that will not serve it.

**Legacy host failure matters only before go-live**, while preparation steps still read from it (the final export, archive capture, and the forum and wiki dispositions). After go-live the legacy host is out of every path: recovery is the pre-flip DB snapshot (§29.1a) plus the platform's own disaster recovery, and inbound mail is on Google Workspace, independent of any legacy machine.

**Variables settled with the legacy webmaster (coordinated privately):**

- Subdomain rulings: the names themselves are enumerated from the zone transfer, so what remains to settle is the ruling each one gets (replace, archive, or retire), not what the names are. The rulings that need his knowledge rather than ours are the ones whose purpose is not evident from the record: what a name serves, and whether anything still depends on it.
- Legacy retirement milestones.
- Zone move to Route 53 (go-live preparation).
- Records-actor (the operator applies every record on Route 53), and reachability through the window.

**MX disposition for `@footbag.org`:** outbound SES sender identity is verified at the `footbag.org` domain level using the DKIM CNAMEs plus the SPF amendment authorizing SES; no inbound mailbox is required for SES verification, and the platform accepts no inbound mail. Inbound `@footbag.org` role addresses (the webmaster contact, `directors@`, `sanctioning@`, and the rest) move to Google Workspace (settled; the per-address inventory is derived from held artifacts rather than supplied by the legacy webmaster), provisioned before legacy delivery is withdrawn so no mail is lost; legacy mail then retires. Provisioning precedes the MX repoint: nothing moves until its Google mailbox, group, or forward exists. `@ifpa.footbag.org` is a separate mail domain served by the same third-party mail host (IFPA list mail below). Cloudflare Email Routing is not used.

**Email cutover step.** The SES sending setup is verified before cutover (SPF amendment + SES DKIM) and the inbound role-address receiver is settled, gated by the published-address inventory and the per-list dispositions (coordinated privately). Provisioning precedes the MX repoint: nothing moves until its Google mailbox, group, or forward exists; legacy delivery is withdrawn only after inbound is verified end-to-end; and rollback before go-live is the MX revert (after go-live there is no legacy mail server to revert to). The step sequence and rollback are DEVOPS_GUIDE.md (private GitHub repo), "MX-to-Google mail cutover". The web cutover is independent and unaffected. The `@ifpa.footbag.org` domain is separate and follows its own disposition (below); this step does not touch it. Gate: EX7.

Two email concerns remain open before the transition (status tracked in the maintainers' private tracker):

1. **Inbound mailbox inventory.** Settled, and no longer a webmaster dependency. The addresses reachable from outside are enumerated from the archive mirror, a full crawl of the public site, on the reasoning that an address no outsider can discover is one no outsider can send to. That yields 94 distinct strings, of which eight are extraction artifacts and three are documentation placeholders, leaving 19 functional addresses (12 at the apex, 7 at `@ifpa.footbag.org`), the webmaster's own published address, and 63 per-member forwarding aliases. Two further sources close the gaps the mirror cannot: the code clone, for addresses the old system wrote to but never published, and the canonical documents, for addresses the new design depends on. The evidence record, carrying the artifact analysis and the per-address prominence counts, is `mail-address-inventory.md` (private GitHub repo). Replaying the legacy alias logic was the earlier route and could not be completed: that composition runs three generators, and the one producing the role addresses was never delivered in the clone, so it could not enumerate the half that mattered. The per-member forwards are out of scope, because Workspace carries role addresses; they lapse with the rest of the legacy estate. The inventory remains the transition-day safety gate: every address in the published set must be provisioned on Google before legacy delivery is withdrawn.
2. **Mailing-list mapping.** USER_STORIES defines platform-managed mailing lists (newsletter, board-announcements, event-notifications, technical-updates, announce, group auto-sync lists) sent via SES; the privately coordinated inventory allocates each legacy list to stay/migrate/retire; but no mapping exists between the US-defined lists and the lists the legacy server actually operates. The legacy side is now partly identified: the `announce`/`members` lists are generated from members-table opt-in flags by `dumpaliases.php`, the IFPA committee and group lists are the `@ifpa.footbag.org` `wrapper/` server (above), and the public discussion lists (footbag, freestyle, sewing) run on Majordomo at `list.footbag.org`. The delivered committee table is the source for the IFPA committee and group addresses, filtered to the rows marked valid with email enabled — 125 of the 170 rows. Each such row yields four addresses formed from its group's short keyword: the list itself, and its `-owner`, `-moderators`, and outbound variants, so 500 addresses in total. Each row also carries flags recording whether posting was restricted, moderated, and archived. Two keywords, `announce` and `everyone`, take their membership from include files written by the per-member alias generator rather than from the committee row, and the administrator address is added to every list by the generator's promiscuous mode. The `announce@footbag.org` name appears in both contexts and must resolve to exactly one owner at the transition.

Legacy mail server health is no longer a standing concern: the email transition retires it for `@footbag.org` entirely; the residual mail-host concern applies only to `@ifpa.footbag.org`, dispositioned below.

**IFPA list mail (`@ifpa.footbag.org`) disposition.** `@ifpa.footbag.org` is a distinct mail domain from `@footbag.org`. It has its own MX records; the primary is the same third-party host that serves legacy `@footbag.org` mail (host names recorded in DEVOPS_GUIDE.md (private GitHub repo), "External DNS/mail upstream coordination runbook"), and that host runs the IFPA groups and committees mailing-list server: a sendmail-tied posting and moderation service (the legacy `wrapper` component) that accepts inbound mail to IFPA group and committee aliases, parses MIME, enforces moderation, and retains message history. This service runs outside the new platform and is unaffected by the `@footbag.org` move to Google Workspace; repointing `footbag.org` MX does not touch `ifpa.footbag.org` MX.

Disposition is a requirements-gathering item that gates go-live, not a v1 platform build. The new platform does not receive inbound email (no SES receiving rules, no inbound processing code; see §28), so any list function still needed is replaced by a Google Group or another approved non-legacy service, never by platform code; the platform's native groups system remains forward-looking and is not a migration target for the legacy list server.

The IFPA secretary's community-requirements discovery (coordinated privately) establishes which lists are actively used and by whom. The wrapper's real capabilities — inbound posting, recipient expansion, posting permissions, moderation, MIME parsing, private and public groups, and message archiving — are the checklist a replacement must cover for each retained list. Every retained function has its approved replacement live at go-live; every other list is retired with notice where needed; and the list host shuts down with the rest of the legacy services rather than remaining running. The dispositions themselves are IFPA governance decisions scoped with the IFPA secretary.

Usage discovery (the IFPA secretary's community-requirements discovery supplies the facts; disposition of any IFPA-owned list function or data is an IFPA governance decision, not a webmaster or maintainer one):

1. Which `@ifpa.footbag.org` aliases received any non-spam mail in the last 12 months?
2. Who reads each such alias today, and does any committee still conduct business over it rather than over ordinary email or board tools?
3. For any alias still in real use, what must its Google Group (or other approved) replacement cover so the list host can retire at go-live?
4. The legacy source (the `wrapper` list component and the `groups/` code) addresses every committee and sanctioning list as `<list>@ifpa.footbag.org`, and no apex `sanctioning@footbag.org` or `directors@footbag.org` appears in the legacy code or the published site. The crawl agrees: the published sanctioning contact is the committee's own list at `sanctioning@ifpa.footbag.org`, and `ifpa-treasurer@footbag.org` is published as a donations contact, while `directors@footbag.org` is published nowhere, which establishes it is unpublished rather than absent since a Board contact may be a deliberately private alias. Apex mail routing lives in sendmail aliases outside the codebase, so which apex aliases are live, where each forwards, and who still reads it are confirmed on the host and recorded privately (DEVOPS_GUIDE.md, private GitHub repo), not here. What this plan needs is the consequence: the Canonical Email Addresses decision in DESIGN_DECISIONS lists the published treasurer contact alongside `sanctioning@` and `directors@` as apex receive addresses to provision on Google, and the target domain is ruled and ratified by IFPA on 2026-08-18: the surviving committee and sanctioning functions consolidate onto apex `@footbag.org` addresses, and `ifpa.footbag.org` retires rather than being carried forward as a Google-served mail domain. The published-address record is the evidence. Of the nine `@ifpa.footbag.org` strings in the crawl, two are template examples rather than addresses in use (`groupkeyword@`, and `fvids@`, which appears the most prominent of all only because it is the worked example in the group-creation form and that form repeats across every group page); five appear solely on dead event microsites; and two carry live claims. Of those two, only the sanctioning contact has continuing operational use, because it is embedded in the sanctioning application document organizers download and keep. `sanctioning@footbag.org` is provisioned in its place, and the sanctioning instructions page and the application document are updated to it as part of the content work. Nothing remains on the legacy list server; it shuts down with the rest of the legacy services. Retiring the subdomain deliberately also closes an uncontrolled failure: its MX points at the legacy list host, which the web cutover does not touch, so left alone these addresses would stop working whenever that host is powered down rather than at a moment anyone chose.

The roughly 1.2GB `ifpa_group_messages` archive is dispositioned under the sealed legacy email archive below.

**Sealed legacy email archive disposition.** The legacy `ifpa_group_messages` archive (private and public discussions intermixed, with spam and moderation residue; historically about 1.2GB uncompressed, since substantially cleaned up by the legacy webmaster, the compressed remainder still far beyond GitHub's file-size limit; includes privately cast committee votes) is sealed and retained privately. It must never sit on a public web server or in any GitHub repository. Under every v1 branch it is not imported into the platform, not processed, not spam-cleaned, and not exposed publicly. Privately cast votes within it are permanently non-publishable.

The seal is enforced technically. The archive is held as an encrypted container; its decryption key is held in an IFPA-governed, access-controlled secret store. The encrypted container and the key store are kept in an IFPA-governed cloud store restricted to the IFPA board and platform admins. The credential that opens the key store is held separately from that store, under IFPA governance, with an IFPA-named backup holder, so access to the store alone cannot unseal the archive and loss of a single credential does not destroy it. The legacy-site webmaster is operational custodian of the encrypted container and the authoritative source for facts about its contents; he is not its decision authority.

Any future disposition (preserve a subset as historical record, redact, publish any portion, or destroy it) is an IFPA governance decision under IFPA's records-retention policy, never operator or webmaster discretion. The migration's only standing commitment is the seal: keep it private, keep it intact, expose nothing, until IFPA governance directs otherwise. Neither the encrypted container nor the key is ever committed to the repository, placed in issues, logs, tests, or AI prompts. Concrete custody details (store, folder, store entry, access list) live only in operator notes, never in a tracked doc.

Transfer follows decision, not the other way around: no destination is provided and no final dump is requested until the archival scope is confirmed with the group owners and the IFPA board: which groups are included; whether only approved messages are kept; whether spam and moderation residue is excluded; how private and public groups are treated differently; who may access Directors and other private messages; where the encrypted archive lives; who holds decryption authority; how long it is retained; and whether any portion may ever be published. The person-level coordination state is recorded privately (DEVOPS_GUIDE.md, private GitHub repo). Hundreds of megabytes of highly confidential records are not transferred merely because transfer is technically easy.

The content disposition (what is ultimately kept, redacted, or destroyed) is deferred and does not gate v1. What does gate go-live is the capture: the approved-scope archive is captured and sealed before the list host and the legacy databases shut down.

### 29.12b Legacy URLs after cutover

Old footbag.org emails (account verification, share-event links) reference legacy URL patterns like `/members/profile/{legacy_member_id}` and `/clubs/{slug}`. After cutover, these emails continue circulating in inboxes for months or years.

The platform is not backward compatible with the legacy URL space. No legacy URL pattern is forwarded, and the production app carries no redirect handler for one. Every legacy URL is served the standard not-found page, which tells a visitor arriving from an old link that the link is no longer routable and points them at the new site. The mirror captured roughly 93,500 URLs across twenty-five top-level shapes — news, galleries, events, the legacy moves pages, the per-year Worlds sites and others — and all of that content is reached by browsing the archive from its landing page.

From go-live, `footbag.org` apex and `www` are served entirely by the new platform. There are no retained `*.footbag.org` subdomains.

### 29.13 Curator content seeding

Gate: the system member account (Footbag Hacky per the System Member Account decision in DESIGN_DECISIONS, §2.8) is seeded into the production DB and its curator content (avatar in `/curated/avatars/`, fixed site content (demo loops, the foundations mosaic, the event promo image) in `/curated/site/`, tutorials and records in `/curated/freestyle_tricks/`, etc.) is loaded into the production media bucket before public DNS cutover. Landing pages and curator-tagged surfaces must resolve to the production media bucket, not 404. The deploy orchestrator runs `scripts/seed_fh_curator.py` against the prod DB and `aws s3 sync` against the prod media bucket; verify via post-deploy smoke check. Curator content extends by adding file-paired sidecars under `/curated/{category}/`; no manifest edits are needed. This is the one-time pre-cutover population, performed while the production DB is still being established; after cutover the production DB is persistent and the seeder is not re-run against it (post-launch authoring is admin-UI -> DB per §29.14).

The seed transcodes off-host at build time: `scripts/seed_fh_curator.py` runs on the operator build host, re-encoding each source video through a one-at-a-time ffmpeg subprocess into an ephemeral build directory that the deploy `aws s3 sync`s to the production media bucket. The production host serves the pre-transcoded artifacts and never runs ffmpeg for curator content. The interactive admin curator upload path, which executes on the memory-constrained production host, runs transcode through the async `media_jobs` lifecycle (the Image Processing decision in DESIGN_DECISIONS, §6.8) instead. This is the pre-go-live seed path; it consumes the `/curated/` JSON sidecars, which are retired at go-live when the persistent DB becomes the source of truth (§29.14).

### 29.14 Post-launch admin curator authoring

At go-live the source of truth for system-member-owned curator content moves from the pre-go-live `/curated/` authoring layer (and the seeder that builds the DB from it) to the persistent production DB: admins thereafter author through the admin UI, which writes the DB directly; the seeder is not run against production; data-preserving deploys use `scripts/deploy-migrate.sh`. The model and success criteria are defined in the Curator Content Source of Truth decision in DESIGN_DECISIONS (§1.13) and the `A_Upload_Curated_Media` / `A_Manage_Curated_Gallery` user stories. This switch from JSON-sidecar authoring to the persistent DB is covered by special tests of its failure modes: curator content (`media_items`, galleries, and S3 bytes) survives a data-preserving `scripts/deploy-migrate.sh` deploy with no seeder run; admin-UI create, edit, and delete is the sole post-go-live authoring path and is durable without seeder replay; and a guard prevents the seeder from running against a persistent production DB, whose orphan-cleanup would otherwise delete admin- and member-created rows that have no `/curated/` sidecar: the seeder refuses any database carrying the in-database post-cutover marker, the shared guard every destructive seeder and loader checks before mutating (the Curator Content Source of Truth decision in DESIGN_DECISIONS, §1.13). Gate: OR9 (the data-preserving deploy additionally depends on OR1/OR8 backup and restore). Must land before State 3 → State 4.

### 29.14a Post-launch admin email-template authoring

At go-live the source of truth for email-template content moves from the pre-go-live committed JSON sidecars (and the seeder that loads them into `email_templates`) to the persistent production DB, exactly like curated media (§29.14): admins author through the template editor, the seeder is not run against production, and template rows survive a data-preserving `scripts/deploy-migrate.sh` deploy. The model mirrors the Curator Content Source of Truth decision in DESIGN_DECISIONS (§1.13). The switch is covered by the same class of special tests: templates survive a data-preserving deploy with no seeder run; admin-UI editing is the sole post-go-live authoring path; and the seeder fails fast rather than orphan-deleting admin-edited rows when pointed at a persistent production DB: it refuses any database carrying the in-database post-cutover marker (a `system_config` row, key `post_cutover`, written at cutover), the shared guard every destructive seeder and loader checks before mutating. Gate: OR9a. Must land before State 3 → State 4.

### 29.15 Legacy archive subdomain readiness

Per the Legacy Archive decision in DESIGN_DECISIONS (§6.4), archive.footbag.org serves the static legacy HTML mirror under member-only access enforced by CloudFront signed cookies. The archive launches ahead of the cutover: `archive.footbag.org` is a new name that touches neither the apex nor `www`, so its stack sequences behind the zone move alone, and the certificate, DNS and signed-cookie machinery are proved in production before the freeze window rather than attempted for the first time inside it.

The stack is built in two halves with different prerequisites, and the split is what lets the first half run early. `enable_archive` creates everything that works on the distribution's own CloudFront address: the bucket, the key group, the edge function, the Terraform-placed gate pages, access logging and the distribution itself. `enable_archive_custom_domain` adds the pieces that need the real domain: the archive's own us-east-1 certificate, the distribution alias, and the `archive.footbag.org` records. Only the second half waits on the zone move.

Member access arrives with that second half, and not before, which is a property of the browser rather than a choice. Production keeps signed cookies on, and a signed cookie reaches the archive only if the platform and the archive share a parent domain. Before the zone move they are two sibling CloudFront addresses under a public-suffix domain, so no cookie can span them. The archive is therefore provisioned, loaded and provable early, with the proof made using a hand-signed cookie, while the member-facing path opens at the zone move.

Loading the mirror is its own step with its own cost, not an implicit part of provisioning. `scripts/publish-archive.sh` is the single repeatable publisher; the operating procedure is DEVOPS_GUIDE.md (private GitHub repo), "Archive content publish runbook". The load runs after the pre-freeze full crawl rather than before it, so that the re-publish inside the freeze window is a delta over the top-up rather than a full re-upload of the whole capture.

**Archive completeness and legacy media.** The archive mirror holds the legacy content the crawl could reach across both live content hosts, the main site and the WordPress championship-microsite host: media linked under `www.footbag.org` (the `gallery`, `video`, `photos`, and `qt-video` paths) and the microsite uploads are captured and re-encoded to mp4/jpg/gif. Legacy media lives only in this archive; it is never imported into the new platform's media system (the Legacy Archive decision in DESIGN_DECISIONS, §6.4). Media reachable on the legacy server only by a direct `video.`/`photo.` file path that was never linked under `www` was not crawled and is therefore not in the mirror; those direct-path links are already dead today, so no subdomain is retained for them. Recovering that un-crawled media would require the webmaster to supply the files plus a path mapping from the legacy server; that is an optional, non-blocking, post-v1 archive-enrichment handled through the private stakeholder-coordination workflow, not a cutover dependency.

Gate, all of the following are provisioned and verified end-to-end:

- **Archive S3 bucket** (Terraform `aws_s3_bucket.archive` or equivalent) is private behind Origin Access Control. Bucket policy permits only the archive CloudFront distribution to read. The bucket policy grants `s3:ListBucket` alongside `s3:GetObject` so a missing key returns 404 rather than the 403 an object-only grant produces. Versioning per the standard private-bucket pattern, plus a lifecycle rule expiring noncurrent versions; no Object Lock, because the bucket is re-synced over after the final crawl and bucket-layer immutability would fight that workflow.
- **CloudFront key group** (`aws_cloudfront_public_key` + `aws_cloudfront_key_group`) is provisioned in Terraform. The trusted-signer keypair private half is stored in AWS Secrets Manager (or SSM SecureString) scoped to the main app's runtime IAM role; the public half is registered in the key group.
- **Archive CloudFront distribution** is provisioned with: the archive S3 bucket as origin via OAC; the cache behavior naming the key group in `trusted_key_groups`; 1-year edge TTL per the CloudFront CDN decision in DESIGN_DECISIONS (§6.2) immutable-archive guidance; ACM cert for `archive.footbag.org` attached; a viewer-request CloudFront Function that appends `index.html` to directory URLs (CloudFront validates the cookie signature before the function runs, so an edge login redirect is impossible); a custom 403 error response mapping missing, expired or invalid cookies to a denied-access page served from a dedicated unauthenticated cache behavior carrying the login link (CloudFront custom error responses cannot redirect to an external URL); a 404 error response mapping a key the mirror does not hold to its own not-found page on that same behavior; and standard access logging to a dedicated log bucket.
- **DNS record** for `archive.footbag.org` pointing at the archive distribution, applied by the operator on Route 53 before cutover, where it is an ALIAS; the zone moves to Route 53 early, so no record is hand-applied on the legacy nameservers (the records-actor gate WM14 in the go-live gate index, GO_LIVE_PLAN.md, private GitHub repo).
- **Cookie-Domain scope** deployed: the three CloudFront signed cookies use `Domain=.footbag.org` so the archive subdomain receives them; `__Host-footbag_session` stays host-only. The parent-domain scope lands AFTER the CSRF Origin-pin middleware (the CSRF Protection decision in DESIGN_DECISIONS, §3.3) is in production and BEFORE archive.footbag.org receives its first authenticated request.

**Cookie-Domain scope:** `Domain=.footbag.org` sends the three CloudFront signed cookies to `.footbag.org` hosts; the session cookie, `__Host-footbag_session`, is host-only and reaches none of them, a scope its `__Host-` name prefix makes browser-enforced. The intended recipient is the platform-controlled `archive.footbag.org`, served over HTTPS by its own CloudFront distribution (DD §6.4). The signed cookies carry `Secure`, so any legacy subdomain the per-subdomain ruling keeps live on an HTTPS listener would also receive them, and the parent-domain scope ships only after that ruling is in and the exposure re-verified against it. What such a host would receive is a CloudFront policy and signature bound to the archive distribution, not a platform session credential. The CSRF Origin-pin middleware (DD §3.3) remains the cross-subdomain defense against a malicious form on the archive subdomain.
- **Archive HTML mirror content** uploaded to the bucket. All video content is mp4, all images are jpg, no JavaScript present (DD §6.4 contract).
- **End-to-end auth flow tested**: unauthenticated request to `https://archive.footbag.org/some-path` returns the denied-access page, as does a request carrying an expired or invalid cookie; an authenticated member's request returns 200 from S3 origin; a request for a path the mirror does not hold returns the not-found page.

Procedure: Terraform provisioning and end-to-end test runbook live in DEVOPS_GUIDE.md (private GitHub repo).

### 29.16 TLS health monitoring on retained subdomains (contingent on the subdomain ruling)

If the per-subdomain disposition retires every legacy `*.footbag.org` subdomain, external retained-subdomain TLS monitoring is not needed: the only `.footbag.org` host receiving the parent-scoped signed cookies is the platform-controlled `archive.footbag.org`, whose TLS is managed by its CloudFront distribution (DD §6.4) — always valid, no external expiry probe required. If any legacy subdomain stays live on an HTTPS listener, it receives those cookies too, so its TLS health becomes a monitored item and the §29.15 cookie analysis is re-verified before the parent-domain scope ships.

### 29.17 Security hardening (operator-doc security audit remediation)

Gate: the items surfaced by the operator-doc security audit are resolved or explicitly accepted, with rationale recorded in the cutover sign-off, before State 3 → State 4:

1. Operator secret hygiene: every runbook that writes a secret to SSM or a host file uses the `file://`/temp-file (or stdin) transport, and pasted-key steps suppress shell history, so no live secret reaches process argv or shell history (DEVOPS_GUIDE.md (private GitHub repo), "Stripe key and webhook-secret rotation runbook", "Safe Browsing API key rotation runbook", "Production first-admin bootstrap", and "Turnstile key rotation runbook"; AWS_OPERATIONS.md (private GitHub repo), the credential and env wiring and the staging Stripe and Turnstile activation steps).
2. The workstation runtime AWS profile for the production role carries `mfa_serial`, so a stolen at-rest `~/.aws/credentials` cannot assume the role without the operator's MFA device (the profile follows the chained-AssumeRole pattern in DEVOPS_GUIDE.md (private GitHub repo), "Operator-workstation staging readiness smoke test", which documents the staging profile where `mfa_serial` is intentionally omitted; the production profile adds it).
3. Source-profile and CloudWatch-publisher access keys are rotated on evidence rather than on a calendar: the quarterly access review reads each key's last-used date and the credential report, and a key is replaced when a named trigger fires (an operator leaving, a suspected exposure, use from an unexpected source, or a key idle long enough to be doubtful). Both keys are named in that review (DEVOPS_GUIDE.md (private GitHub repo), "Source-profile access-key rotation" and "Quarterly routine tasks"); reconciles with §29.4.
4. Break-glass has contemporaneous second-operator notification, a CloudTrail/CloudWatch alarm on privileged-role AssumeRole, and bounded auto-revocation of any console-granted temporary access (DEVOPS_GUIDE.md (private GitHub repo), "Break-glass access").
5. Bounce and complaint feed transport: satisfied by removal. The feed is read from a queue under the host's runtime role, so there is no shared secret in a URL for a log to capture and nothing to narrow log access against.
6. The maintenance S3 bucket keeps `block_public_policy = true` and `restrict_public_buckets = true` (OAC service-principal policies are compatible); reconciles with §29.3.
7. The `/dev/*` persona-switch surface (and all dev/test scaffolding) is dev/staging-only and unreachable in production, enforced by three independent layers: the env-gated mount in `src/app.ts` (registers `/dev` only when `FOOTBAG_ENV ∈ {development, staging}`), the null-guard (production images stub the harness module to null), and the build-time image strip (`INCLUDE_DEV_SHORTCUTS=0` removes `dist/testkit/` and `dist/dev-bootstrap/`; PC10). Cutover preflight (the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo) verifies the production origin returns 404 for `/dev/switch`, `/dev/personas`, and `/dev/outbox` (the captured-email viewer, which exposes verification, password-reset, and legacy-claim links and must never be reachable in production). No real-PII dataset is loaded on an internet-reachable staging while the `/dev/*` surface is active.
8. The committed-secret scan covers `.md`/`.txt` so a secret pasted into documentation is caught in CI; the dev/staging seed-password literal stays single-file and guarded.
9. The repository carries no genuine-risk identifier (account id, origin IP, operator CIDR, KMS key material, live credentials); infra identifiers with no exploitation value (state-bucket name, CloudFront domain) may remain.

Rationale: the operator runbooks and committed configuration are themselves an attack surface on a public repository; this gate closes (or consciously accepts) the audit's hardening items rather than carrying them silently into production.

Procedure: items 1, 8, and 9 are doc/CI changes applied pre-cutover; items 2-6 are infra/process changes completed under §29.3/§29.4/§29.7; item 7 is a standing rule verified at cutover preflight (the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo).

---

### 29.18 Additional go-live sign-off gates

Calibrated for a small, volunteer-run international nonprofit handling member PII and payments. Each is a cutover-time checkpoint with an observable pass artifact.

- **Member data-subject requests.** A member can export their own personal data and request account deletion through the site; deletion clears the identity links per the member / historical-person entity-types decision. Verified by one end-to-end exercise on staging that produces the export artifact and a completed deletion.
- **Accessibility.** The WCAG 2.1 AA automated checks (axe-core across the high-traffic public pages) are wired into the suite and green at cutover; any accepted exceptions are recorded in the cutover sign-off.
- **Load and performance.** One representative load run on staging meets the agreed latency and error-rate targets. Lightest of these gates; the targets are modest and set to the expected member population.
- **Member communications and status channel.** Members are notified of the cutover window and what changes for them, and an out-of-band status channel (reachable if the site is down) is named and tested before cutover day.
- **Release candidate and change freeze.** The cutover deploys one tagged commit, built once and recorded in the cutover log — the same artifact the State 3 smoke and email checks ran against. From State 3 sign-off to cutover only fix-forward patches land, each re-entering the smoke suite; any other change re-opens State 3.
- **Go / no-go decision.** The primary maintainer records a written go/no-go against the go-live gate index (GO_LIVE_PLAN.md, private GitHub repo), with the latest-safe rollback time agreed, before the cutover deploy. Precondition: the §27 monitoring thresholds are validated against the staging baseline first — the deployed origin-latency alarm (p90 above 3s sustained for 15 minutes) carries a default nobody has measured, and the production cutover alarm on zero successful logins over 2 hours is confirmed armed for the window rather than calibrated. A go/no-go cannot be checked against thresholds nobody has measured.
- **Post-launch close-watch period (hypercare).** Immediately after cutover the team watches the system closely and responds fast to issues. Before the encrypted working copies are destroyed and the legacy webmaster's role closes, a 14-day close-watch window from cutover (inside the 30-day artifact retention) passes with no unresolved high-severity issues and error/latency within target, extendable if a high-severity issue is open when it lapses. This defines the "stable post-cutover operation" the legacy retirement milestones depend on.

## 30. QC subsystem retirement (go-live gate, met)

The internal QC subsystem is retired. It was operator tooling for reviewing imported net results, mounted only in dev and staging, and the gate was that no production deployment carry its code, routes or tables. Nothing of it remains: the `/internal` router and its mount, the controllers, services and views under `src/internal-qc/` and `src/views/internal-qc/`, the prepared-statement groups in `src/db/db.ts`, six schema tables, the pipeline scripts that filled and drained them, and their tests.

Sign-off on QC retirement is a prerequisite for the State 3 → State 4 transition (the cutover state machine in GO_LIVE_PLAN.md, private GitHub repo).

**What the public site kept.** Two of the three data-quality badges on the net events page were derived only from the retired review queue and went with it: Multi-stage and {n} unlinked. The third, Discipline review, also had an independent source: `net_discipline_group.conflict_flag`, a canonical grouping annotation for an ambiguous match rather than QC review state. It survives on that source alone. Whether it should say "Discipline review" to a visitor is a question about public wording, open and independent of this gate.

**Where the loader findings go.** The net team builder still runs its seven checks, including a priority-one identity conflict that exists in no other output. They are written to `legacy_data/out/net_team_qc_issues.jsonl`, beside the QC artifacts the canonicalization stage already writes there. Every field is derived from the data rather than the run, so a rerun over unchanged data reproduces the file byte for byte and a diff means the data moved.

**Automated enforcement**: two layers, paired so a typo or rename cannot silently slip through.

1. **Positive-assertion test.** `tests/unit/qc-subsystem-retired.test.ts` names every retired directory, file and table and requires each to be absent. Absence is the success signal. It also refuses to pass if its own lists are emptied, and checks that each path sits under a real top-level directory, because a path with a typo would be absent for the wrong reason and would pass forever while checking nothing. This catches a deleted file being restored.
2. **Pattern scan** (defense in depth). The convention gate scans for QC entry points and retired table names. Its scope is the surfaces that ship or that build the database — application source, the schema, and the pipeline — because a QC page cannot return without code in one and a table in the other. Tests are deliberately outside that scope: the tests proving the subsystem is gone have to name it, and no pattern can tell those apart from a test exercising a restored one. This catches QC code returning under a name the first layer cannot know.

Both run in continuous integration through jobs that already exist, the unit-test job and the convention gate, rather than through workflow steps of their own. R1 sign-off asserts both layers are present and green.

## 31. Primary-maintainer test-user retirement (retired early)

The primary-maintainer real-flow test user and its person-specific scaffolding — the journey builder, the build-then-switch route, its catalog entry, and the build-on-switch plumbing — have been removed ahead of cutover rather than at it, so no production deployment carries them. That test user was an initial-testing aid that drove the real registration, verify, claim, onboarding, and upload flows against a real-data dev or staging database; it was never a product feature. It logged in with a synthetic test address and claimed its Hall-of-Fame legacy record by `legacy_member_id`, so no maintainer email ever lived in the system to remove.

The real-flow assurance that scaffolding provided is preserved, and broadened, by a four-track testing suite: a synthetic register-through-co-lead journey in continuous integration; a read-only, PII-safe whole-population invariant gate over the loaded real data (counts and pass/fail only); a generic real-claim crawl that builds a claimed account for any real record through `GET /dev/build-claim?as=<legacy_member_id>` and walks its rendered surfaces; and a human stratified-sampling walk on staging. Migrated-real-data behaviour is verified by claiming any real record rather than one fixed person.

Verification that the scaffolding is gone: a grep of the source tree for the old entry points (the journey builder and build-then-switch route names, the build-on-switch field, and the person slug) returns nothing, and the test suite and type-check pass. No production-bound member carries the test user's slug. This item is no longer a cutover blocker; it is satisfied.
