# Footbag Website Modernization Project -- Migration Plan

**Document Purpose:**

This document is the source of truth for go-live readiness: legacy data migration design (streams, claim flow, auto-link, merge rules, club bootstrap, name model, competition history), operational readiness gates (backup, observability, edge security, IAM, email ops, maintenance jobs, secrets rotation, pre-cutover reverts), and the phasing, operational states, and validation gates that govern both. For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `DATA_GOVERNANCE.md`.

It opens with three short sections written for coordination with the legacy-site webmaster: a summary of the migration, the open questions that need the webmaster's input, and a recap of the decisions already made. The numbered sections that follow carry the full design and go-live detail.

---

## Summary

The new footbag.org platform absorbs three bodies of legacy data:

1. **Historical record**: events, results, persons, honors (Hall of Fame, Big Add Posse), clubs, club affiliations, and club leadership, built from human-curated CSV plus extraction from the project's offline mirror of the legacy site. Published regardless of whether anyone claims the underlying identity.
2. **Legacy member accounts**: every login-bearing account from the live legacy site, imported from a one-time export into a permanent archival table. No passwords or credentials ever move; members reconnect to their old identity through a voluntary, always-confirmed claim flow after registering on the new platform.
3. **Operational readiness**: backup and restore, observability, edge security, email deliverability, scheduled jobs, secrets rotation, and the pre-cutover checklist.

The agreed front-door architecture is Option A: the legacy server keeps the `footbag.org` apex and reverse-proxies traffic to the new platform's CloudFront distribution. Go-live is therefore a sequence of discrete steps, each reversible on its own: first the email transition (one atomic switchover to a single mail system), then the front-door cutover (the webmaster flips the reverse proxy after a smoke test proves the path), followed by a monitored 48-hour window where rollback is a proxy revert. DNS itself stays with the webmaster initially and moves to Route 53 at a later post-stability milestone.

The legacy-site webmaster has delivered the legacy data; it is under analysis by the historical-pipeline maintainer, and the export-dependent rows in the table below carry that status.

---

## Open questions for the legacy-site webmaster

These are the decisions that involve the legacy-site webmaster. Each is labelled with its status, and **only the items marked "Still open" need an answer**; everything else is settled and kept here for the record. The numbers are fixed labels referred to elsewhere in this plan (§19 uses an independent 1-37 numbering; §28 refers back to these front-matter numbers as "front-matter question N").

Quick status: **still open**: 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23. **Settled**: 1, 9, 12. **Confirmed against the delivered dump, to be re-confirmed on the final export**: 10, 11, 17.

Open questions owned by the IFPA secretary and the community-requirements discovery rather than the webmaster are tracked in their own sections, not the list above, and are all still open: §19 items 35 (legacy group activity), 36 (group communication home), and 37 (sanctioning workflow depth); the seven items in §20a; and the IFPA list-mail questions in §29.12a.

**Architecture and DNS**

**1. Front-door architecture (Option A). Settled.** The legacy server keeps the footbag.org apex and reverse-proxies traffic to the new platform. This is what cutover and rollback are: a proxy flip, and a proxy revert. The proxy presents footbag.org as its name, and a smoke test proves the path before the flip.

**2. DNS registrar and authoritative provider, and whether the apex supports ALIAS/ANAME. Still open, but not a launch blocker.** Under Option A the apex never moves during cutover, so these facts are only needed later, when DNS hosting moves to Route 53. Recommendation: the webmaster supplies the registrar, the authoritative DNS provider, and the apex's ALIAS/ANAME capability ahead of that later handover.

**3. A list of every footbag.org subdomain that stays on the legacy host. Still open.** Once members sign in, the session cookie is shared across all of footbag.org, so every retained subdomain must serve valid HTTPS. The new platform reserves archive.footbag.org. Recommendation: the webmaster lists what he knows now (a partial list is fine to start) and completes it before cutover planning, so each name can be set up and monitored.

**4. A reachable contact during the cutover windows. Still open.** Rollback is a proxy revert on the webmaster's own server, so it cannot depend on one person being awake and reachable during an incident. Recommendation: name a delegate who has standing access to the proxy and DNS, with a tested escalation path and an agreed plan for when the webmaster is unavailable, covering the email-switchover day and the 48 hours after the front-door flip.

**5. A commitment to keep TLS certificates current on every retained subdomain. Still open.** Because the signed-in session cookie reaches every footbag.org subdomain, a lapsed certificate on any of them would expose that cookie in clear text. Recommendation: the webmaster renews each certificate before it lapses, and the platform runs a daily expiry check with alarms as a backstop.

**Email**

**6. A list of footbag.org mailboxes and aliases (real mailboxes versus forwarding). Still open.** Every address still in use must exist on Google before mail is repointed there, or its incoming mail is silently lost. Recommendation: the webmaster lists every footbag.org address, noting which are real mailboxes versus forwarding and which are actually used, and every active one is created on Google before the mail switchover.

**7. Mailing lists: what exists, and what happens to each. Still open.** The new platform sends mail out but never receives mail, so a list matters only by whether people email into it. Recommendation: sort each list into two kinds. A discussion list that members post to by email has no equivalent on the new platform, so it moves to a Google Group or is retired. A one-way announcement list becomes a platform announcement, sent out through the platform. Decide each before the mail switchover so nothing stops working.

**8. The date of the email switchover. Still open.** The switchover is one step: incoming mail moves to Google, outgoing mail becomes the platform's only sender, and the legacy mail server stops sending and receiving, all strictly before the front-door cutover. Recommendation: start the scheduling conversation now (gap tolerance and a target window), and fix the actual date once the mailbox and mailing-list work above is done, since the switchover cannot happen before then.

**9. Who owns and administers the Google Workspace account. Settled.** The IFPA board owns the Workspace; it is administered by the IFPA secretary together with a platform maintainer.

**Data and export**

**10. What the export columns mean. Confirmed against the delivered test dump; re-confirm on the final export.** The delivered dump answered the column-semantics questions: the member-account id column is identified; there is no banned column, so questionable accounts go to admin review rather than being auto-blocked; the announce opt-in is present; and the old member table does contain a password column, so the extraction strips credentials out and never loads them. One item is not yet closed: that the export's id namespace matches the mirror/profile-URL namespace the back-links depend on is still pending the comprehensive namespace cross-check (§19 items 10-11, gate WM4). All of this is re-confirmed against the final post-freeze export.

**11. Whether the tier and payment history is rich enough to map tiers fully. Confirmed against the delivered dump; re-confirm on the final export.** The delivered dump confirmed the paid-history inputs are present (tier, expiry, paid flags, payment dates, join date, and the payments table). Board-at-cutover status is not yet in hand: the committee-table backup was held back for size and the webmaster will supply it, so the committee data exists and is pending delivery rather than empty. The board-at-cutover derivation scaffold is implemented and tested in the extractor (emitting both board fields) but ships inert, making no positive board determinations until the board signal is confirmed, either the committee-table rows or confirmation that `MemberIFPATier` encodes a board tier; once the committee data arrives, the tier-derivation check settles the full-versus-fallback choice, with honors-only as the contingency only if the board data proves insufficient.

**12. The final re-export after the write-freeze. Settled (an action, not a decision).** The webmaster produces a fresh export after the write-freeze; this is a contracted step, and its timing rides on the write-freeze item below.

**Cutover logistics**

**13. Write-freeze timing and the notice members see. Still open.** Two things to settle: how long before the final export the legacy site goes read-only, and the notice members see during the freeze. Recommendation: an hours-scale freeze before the final export, with the notice text agreed in advance.

**14. How long the legacy database is kept after cutover. Still open.** Once the import is checked, the platform's own copy of the member records is the lasting archive, so the raw legacy database is only needed for short-term rollback and for the occasional dispute lookup. Recommendation: keep it through the 48-hour rollback window plus about thirty days for recovery and disputes, then the webmaster may retire it; keeping legacy personal data longer than that serves no purpose.

**15. What milestones end the webmaster's temporary role. Still open.** The role ends on milestones, not a calendar date: stable operation, the email transition complete, the DNS handover executed, and retained services resolved. Recommendation: confirm that milestone list with the webmaster, along with a review cadence.

**Community knowledge and feature scope**

**16. How real the impersonation risk is. Still open.** This decides whether an honors-bearing claim needs a check before it applies, beyond the after-the-fact review already in place. Recommendation: keep the no-check approach. Several safeguards already exist: a name-collision prompt at sign-up, an after-the-fact review feed for honors claims, and an admin who can reverse a wrong claim. Footbag is a small, visible community where impersonating a known competitor would be obvious and pointless, and a pre-check would slow legitimate claims and add admin work for little gain. Add a check or a grace period only if the webmaster's read of the community says impersonation is a real concern.

**17. Whether old bans still matter. Confirmed against the delivered dump (no ban field); reconfirm on the final export.** The delivered data contains no ban records at all: there is no banned, blocked, or suspended field anywhere in the dump; the only status signals are `MemberValid` and `MemberEmailInvalid`, with no dedicated inactive column (§28 item 2). The test-load report counted roughly 8,000 accounts flagged by one of these signals (re-confirmed on the final export); a cleared `MemberValid` is the §2 source-validity-filter exclusion, not a ban. So there is probably nothing to carry over. The ask: the webmaster confirms whether the final export carries any banned, blocked, suspended, or inactive field (the test dump had none; reconfirm on the final export), and whether any bans were ever enforced outside the database. If neither, this question is moot. Either way, the recommendation is to keep any legacy ban as a background note only, never blocking a claim, since old bans are probably stale and often have unknown reasons and the new platform has its own tools for handling misbehavior. Move to enforcing specific bans only if the webmaster and board say they still matter.

**18. What the legacy "tournament in a box" feature actually does. Still open.** Recommendation: leave it for a later version and scope it first. Until the webmaster writes down what it does today, there is nothing to design against, and building blind risks building the wrong thing.

**19. When the forums retire and become a read-only archive. Still open.** Recommendation: the forums become a read-only archive on the member-only archive site at cutover, and the new platform does not rebuild forum features. This keeps the history without the cost and moderation load of a live forum that is out of scope. Confirm the timing with the webmaster.

**20. Which features launch in the first version versus later. Still open.** This sets which legacy surfaces freeze, which subdomains stay alive, and how long the webmaster's temporary role lasts. Recommendation: ship the core platform first and keep group and committee features on the legacy parallel-role server until they are migrated or retired, so launch is not delayed and nothing goes dark. Adjust only if the webmaster objects to a specific item.

**21. What to do with the legacy data domains that are out of scope. Still open.** The old data also holds galleries and media, freestyle tricks, governance records, rankings, news, the rulebook, polls, and translations. Recommendation: galleries and media are served from the archive site and not imported; the rest are catalogued now so nothing is lost, with the decision on each deferred until there is a real reason and a user story to migrate it; otherwise the default is to archive or drop. The IFPA governance records specifically (the election, issue, and privately-cast vote tables) are an IFPA governance decision, not the webmaster's: the IFPA secretary rules on their disposition, and the recommended posture is to archive them encrypted and sealed, the same treatment as the legacy email archive, never published, since they include privately cast votes.

**22. The proxied WordPress sites behind sites.footbag.org. Still open.** The legacy host proxies a set of WordPress sites (years of Worlds event sites) under the operator-only sites.footbag.org name. These must keep working for legacy reasons. Recommendation: keep the webmaster's existing proxy through the parallel-role window, then decide per site whether to re-host, consolidate, or retire; treat sites.footbag.org as private and not-for-publication.

**23. The /reference/ MediaWiki instance. Still open.** A live MediaWiki (version 1.6.8, with a custom `FootbagAuth.php` single sign-on) runs at the /reference/ path, its source on the legacy host and its database not yet delivered. Because that engine version is far out of security support, the recommendation leans to archive-or-retire rather than re-host: catalogue it now, keep it on the legacy host through the parallel-role window, and decide archive, re-host, or retire later; the webmaster confirms its current state and supplies the database if any disposition needs it.

---

## Decisions made

These decisions are settled. Each is final unless a noted open question revises it.

**1.** Three identity tables work together: members (live accounts), legacy_members (old-site records), and historical_persons (competition history). When records merge, the live account always wins.

**2.** No credentials are ever imported. A legacy email is migration metadata only, never a login.

**3.** Claiming a past identity is voluntary and always confirmed by the member. The system stages candidate matches, sends no email, and applies nothing until the member confirms a card.

**4.** Every confirmed claim records how strong the evidence was. An optional confirmation-link click sent to an old email raises that strength. Cases that nothing can resolve go to an admin help request.

**5.** Honors-bearing claims (Hall of Fame, Big Add Posse) apply without an admin checking first. The honors data is validated a priori at test-load against the public HoF and BAP rosters, the small community self-polices, and an admin can revert a wrong claim; there is no daily oversight email. Subject to open question 16.

**6.** Identifier lookups never reveal whether the input matched nothing, matched several records, or matched something ineligible; the response looks the same in every case.

**7.** Old bans never block a claim; they are kept only as background notes. Subject to open question 17.

**8.** Tiers are granted at claim time from each account's legacy standing (board, honors, paid history); an account with only honors is granted on that basis.

**9.** Clubs are bootstrapped from the mirror using a fixed four-way classification; club leadership stays a candidate only until a member confirms it through the wizard.

**10.** About 1,700 club-only members become historical persons.

**11.** The export is used twice (a test load, then the final one), and every excluded row is counted, never dropped silently.

**12.** The name model is a legal name plus a display name that share a surname; imported legacy records are exempt from that rule.

**13.** Front-door architecture is Option A: the legacy server keeps the apex and reverse-proxies the new platform, verified workable (an alternate domain name plus a matching certificate, the proxy presenting the apex name, and a smoke test that proves the path before the flip).

**14.** Cutover is the webmaster flipping his proxy, gated on the smoke test; rollback within the 48-hour window is a proxy revert; a database snapshot is always taken just before the flip.

**15.** One mail system, never two: the email switchover (incoming to Google, outgoing only through the platform's sender, the legacy mail server shut down both ways) happens as its own step strictly before the front-door cutover. Its date is open question 8.

**16.** The webmaster handles DNS at first; DNS hosting moves to Route 53 at a later, post-stability handover. Registrar and provider details are open question 2.

**17.** The webmaster's temporary role ends on milestones, not on a calendar date. The milestone list is open question 15.

**18.** The new platform uses its own URLs; they do not mirror the old site's URLs, and there is no general old-to-new mapping. A bounded set of links that appear in old footbag.org emails are forwarded by explicit handlers that resolve a legacy id or slug to a live record if one exists. An old member-profile link is resolved by its legacy account id: if a live member has claimed that account, the visitor is sent to that member's page; if the account exists but is unclaimed, to a claim landing page; otherwise to a friendly not-found page. An old club link is sent to the club's page if that club still exists, otherwise to the archive. Old forum links go to the read-only archive (the platform does not rebuild forums). Anything unrecognized shows a friendly not-found page. All other legacy content lives only on the member-only archive site.

**19.** The internal quality-control subsystem is removed at go-live.

**20.** The new platform does not implement single-sign-on with the legacy site, and no credentials ever cross. The archive site is read-only. If the legacy site keeps a live login for returning users, it runs entirely as a webmaster-side service on its own host that the platform does not integrate with; the voluntary claim flow remains the only identity bridge.

**21.** Worlds 2026 runs on the legacy registration software, and go-live is sequenced to follow it. The platform's own event system handles events from go-live onward, and no legacy registration data is imported.

**22.** Historic tournament and registration data (the legacy multi-table tournament system) is not imported. The platform's canonical historical results are cleaner and authoritative; a future tournament feature, if built, models fresh rather than importing legacy data.

**23.** No legacy communication path goes dark at cutover unless it has been explicitly inventoried, classified, and either migrated, retained, redirected, archived, or deliberately retired with stakeholder sign-off. Operationalized per-function in §19 item 26 and §29.12a constraint 5.

**24.** No old governance data, such as IFPA voting records, is deleted unless the right people confirm that deletion is acceptable. Disposition of IFPA-owned legacy records is an IFPA governance decision (the IFPA secretary rules), never an operator or maintainer decision. Enforced by the sealed-archive treatment in §29.12a (applied to IFPA governance records per §28) and DESIGN_DECISIONS §6.5a.

---

## Table of contents

### Webmaster coordination

- [Summary](#summary)
- [Open questions for the legacy-site webmaster](#open-questions-for-the-legacy-site-webmaster)
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
19. [What we need from the legacy-site webmaster](#19-what-we-need-from-the-legacy-site-webmaster)
20. [What we need from the historical-pipeline maintainer](#20-what-we-need-from-the-historical-pipeline-maintainer)
    - [20a. What we need from the IFPA secretary (Julie)](#20a-what-we-need-from-the-ifpa-secretary-julie)
    - [20b. What the project manager (Dave) does](#20b-what-the-project-manager-dave-does)
21. [Design decisions affected](#21-design-decisions-affected)

### Part C -- Go-live

22. [Go-live blocker index](#22-go-live-blocker-index)
23. [Phasing](#23-phasing)
24. [Operational states](#24-operational-states)
25. [Validation gates](#25-validation-gates)
26. [Data quality from persons.csv analysis](#26-data-quality-from-personscsv-analysis)
27. [Rollback posture](#27-rollback-posture)
28. [Open issues](#28-open-issues)
29. [Operational readiness for go-live](#29-operational-readiness-for-go-live)
30. [QC subsystem retirement (go-live gate)](#30-qc-subsystem-retirement-go-live-gate)
31. [Primary-maintainer test-user retirement (go-live gate)](#31-primary-maintainer-test-user-retirement-go-live-gate)

---

## How to read this

The plan is long; readers usually need a subset. Where to start, by role:

- **Legacy-site webmaster coordination**: the three sections above (Summary, Open questions, Decisions made); §19 carries the contract-grade detail behind them.
- **Cutover operators** (running the migration day): §22 (gate index), §24 (state transitions), §25 (validation gates), §27 (rollback), §29 (operational readiness).
- **Identity / claim review** (auto-link, evidence tiers, anti-enumeration): §6 (identity model), §7 (auto-link), §8 (self-serve claim), §9 (merge rules), §13 (admin flows).
- **Club bootstrap review** (classification rules, wizard stages, leadership activation): §2 (bootstrap rule), §10 (club bootstrap and onboarding).
- **AWS / DNS / email infrastructure**: §29 (operational readiness). §29.12 and §29.12a carry the front-door and mail disposition.
- **Schema changes**: §15 (schema delta against the current DB).
- **Open issues**: the open-questions table above; §28 holds internal open items.

For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `DATA_GOVERNANCE.md`.

---

## Part A -- Design

## 1. Executive summary

The front-matter Summary above carries the orientation: three workstreams (historical pipeline, legacy member accounts, operational readiness), the agreed Option A front-door architecture, and the step sequence to go-live. Hall of Fame and Big Add Posse are abbreviated HoF and BAP throughout.

The cross-source identity key is `legacy_member_id`: it links `historical_persons` to `legacy_members` as provenance, and live `members` rows link later through the member-confirmed claim flow (§7-§9), with verified email as the primary anchor. Tier mapping at claim (§3), the name model (§4), competition history fields (§5), and auto-link (§7) complete the design surface.

---

## 2. Migration sources

### Historical pipeline

**What it covers:** Historical events, results, persons, honors, clubs, club affiliations, and club leadership. Person truth comes from human-curated CSV. Club data comes from mirror extraction scripts.

**Key invariant:** A historical person may exist without a claimed modern account. Historical data is published regardless of whether the underlying person has ever claimed a legacy account. The `legacy_member_id` on a `historical_persons` row becomes the bridge to a modern account only after a successful claim.

**Pipeline status:** club extraction, candidate classification, affiliation and leadership inference, and the ~1,700 club-only member extraction are built (`legacy_data/clubs/scripts/`, `legacy_data/scripts/`). The one outstanding piece is the mirror member extraction code, which lives outside the repository (tracked in `IMPLEMENTATION_PLAN.md`).

The live system needs clubs on day one. The mirror is the best available source of club identity and prior leadership information.

#### Pipeline outputs (required before the legacy-account export)

The historical-data pipeline produces:

- Normalized legacy club candidates (one row per distinct club identity)
- Inferred person-to-club affiliation rows with confidence scores
- Inferred role classifications: `member`, `contact`, `leader`, `co-leader`
- Linkage from inferred persons to `historical_persons.person_id` where possible
- Preserved `legacy_member_id` when known from the mirror
- Club classification per section 10.1 rules (pre-populate, onboarding-visible, dormant, or junk)
- Bootstrap eligibility decision for pre-populated clubs, based on leader candidate availability (section 2 bootstrap rule)
- Review report including:
  - Per-club classification with which rule(s) matched
  - Clubs with no credible leader candidate
  - Clubs with multiple competing leader candidates
  - People with multiple apparent current-club indications (store all affiliations with `resolution_status = 'pending'`; the member resolves at claim time by choosing up to two current clubs and marking the rest as former)
  - Unmapped club aliases or duplicate club identities
  - Recommended split per classification rules (section 10.1): pre-populate / onboarding-visible / dormant / junk

#### Bootstrap rule

A pre-populated club (under the `PP-hosting` and `PP-contact-corroborated` rules in §10.1) receives bootstrap leader candidate rows when one or more legacy members exhibit structural signals of leadership for that club. Clubs that fail the pre-populate rules are classified instead as onboarding-visible, dormant, or junk and do not receive bootstrap leader rows.

**Structural signals (drive classification):**

- `listed_contact` - the legacy club page names this person as contact
- `affiliation` - a row exists in `legacy_person_club_affiliations` linking this person to this club
- `hosting` - the club hosted IFPA-registered events during this person's active competitive years
- `roster` - the legacy member roster lists this person as a club member
- `mirror_text` - the club page narrative mentions this person by name or known alias

**Modifiers (context only, do not change classification):**

- `tier_signal` - paid Tier 1+ legacy status at cutover
- `recent_activity` - last competitive year overlaps the club's activity window
- `geographic_alignment` - legacy member city or country matches the club's city or country

Per-`(member, club)` classification follows the combination gates defined in `M_Complete_Onboarding_Wizard` (strong / weak / none over the structural signals).

Modifiers display alongside signals in member-facing and admin surfaces but do not promote weak to strong or demote strong to weak. The `club_bootstrap_leaders.confidence_score` column persists as a sortable informational attribute and is not the classification gate. The gate rule set is rules-as-code; revisions follow observed false-positive data.

Seeded bootstrap candidates carry `affiliation` by construction (candidates are selected from affiliation rows), so the `none` classification is unreachable for them and `weak` is the practical floor; for seeded candidates the ladder is anchored by `listed_contact` and the person-level `hosting`/`roster` pair. Admission into `club_bootstrap_leaders` seeding is score-based (`confidence_score >= 0.70`); the classification badge shown to members is signal-based, display-only, and never gates promotion.

#### Leadership model

Bootstrap-eligible clubs are created with:

- A live `clubs` row
- One or more `club_bootstrap_leaders` candidate rows representing potential leaders, each carrying the structural-signal evidence and classification (strong, weak, none) per the bootstrap rule above

`club_bootstrap_leaders` rows are candidate leadership attributions, not active leadership. Promotion to active leadership writes a `club_leaders` row through one of the activation paths below.

**Leadership activation paths:**

1. **Bootstrap leader registers and claims**: the onboarding wizard presents classified `(member, club)` candidates. On user confirmation or correction, the bootstrap row promotes to a live `club_leaders` row in a silent audit-logged transaction, regardless of classification strength; the classification (strong, weak, none) is recorded in audit metadata for post-cutover analytics. The schema invariant `ux_one_club_leader_per_member` enforces that a member co-leads at most one club; a registrant who already co-leads another club is affiliated to this club but not inserted as a co-leader, recorded in audit metadata. Co-leaders are a flat equal set (no head-leader role). The application-level cap of five total leadership rows per club is enforced: when the cap is reached the new claim still affiliates the member (`member_club_affiliations`) but does not insert a `club_leaders` row; an admin can later promote affiliated-only members via `A_Reassign_Club_Leader`. A member declining a candidate sets `club_bootstrap_leaders.status='rejected'`; the row remains eligible for the other activation paths. When the same member matches signals for multiple clubs, the wizard presents all candidates and the member selects which clubs they led. See `M_Complete_Onboarding_Wizard` for the full user-facing acceptance criteria.

2. **First affiliated member volunteers for leadership**: if no bootstrap leader has yet registered, an affiliated member with Tier 1 benefits (Tier 1+ or Active Player) volunteers to co-lead the club (`V_Volunteer_To_CoLead`). The member is added as a co-leader. Any existing bootstrap leader candidates remain provisional until those candidates register and claim. Clubs may have multiple co-leaders.

3. **Admin resolution**: admin can supersede bootstrap assignments and appoint any registered member as leader through the standard `club_leaders` workflow.

A club without any `club_bootstrap_leaders` row at import remains leaderless until an affiliated member with Tier 1 benefits volunteers via path 2 or an admin appoints via path 3.

---

### Legacy member import

**What it covers:** All legacy registered member accounts from the live legacy site.

**Source:** One-time export from the legacy-site webmaster, used twice: first as a test load, then as the final production import after write freeze.

#### Imported-row model

Each imported legacy member is a **row in `legacy_members`** (schema in DATA_MODEL §4.14b; three-table rules in DD §2.4): a permanent archival record that grants no authentication and is never deleted, even after a current member claims it. Claim sets `claimed_by_member_id` + `claimed_at`; those claim-state columns clear again on PII purge or account-deletion reversion; nothing else mutates after import.

**Source-validity filter.** `legacy_members` is populated from `members WHERE MemberValid > 0`. Rows with `MemberValid = 0` are excluded as source-system garbage (the legacy-site webmaster confirms these are unscrubbed junk and directs the canonical `SELECT ... FROM members WHERE MemberValid > 0`), along with other mechanically-obvious junk: rows with no usable identity at all (no name, no email, no handle), structurally malformed or truncated rows, exact duplicates, and clear test/placeholder rows. Exception: any otherwise-excluded row referenced by a retained published event result, an award or Hall-of-Fame/BAP honor, or a documented admin-recovery need is imported anyway and flagged as a validity-exception row. Exceptions are pulled back by linkage, never by guesswork. The junk heuristics only ever remove, and the linkage exception always wins over them, so no person tied to a result or honor is dropped. The import is counted and validated at test-load: rows examined, rows excluded per rule, rows imported, and exception rows pulled back are all reported, so no exclusion is silent.

**Mirror pre-seed before the export.** To satisfy the `historical_persons.legacy_member_id` → `legacy_members(legacy_member_id)` foreign key before the legacy-account export exists, the historical pipeline pre-seeds temporary `legacy_members` rows from the mirror (club rosters plus the `historical_persons` IDs that need an FK target), keyed on `legacy_member_id` with `import_source = 'mirror'` and other columns left NULL; the seed is insert-if-absent, so re-runs add no duplicates. The legacy-account export then supersedes these rows with its full profile fields and flips `import_source` from `'mirror'` to `'legacy_site_data'`. Both key on the same `legacy_member_id` namespace (§19 item 10), so the export updates the matching pre-seeded row in place rather than inserting a duplicate. "Not mutated after import" refers to this post-export state: the mirror pre-seed is temporary scaffolding the export replaces, not a snapshot mutated after the import completes; only the claim-state columns change later.

Fields present on imported rows:

| Field | Notes |
|---|---|
| `legacy_member_id` | Primary key; the old-site user-account id |
| `legacy_user_id` | Legacy username; migration metadata only |
| `legacy_email` | Migration metadata only; used to deliver the one-time claim link. Never a login credential |
| `real_name` | Best available name from export; required (use display_name as fallback). See section 4 for name model notes on imports |
| `display_name` | From export |
| `display_name_normalized` | Derived |
| `city`, `region`, `country` | From export; nullable |
| `bio` | From export if available |
| `birth_date` | From export if available |
| `street_address`, `postal_code` | From export if available |
| `ifpa_join_date` | From export if available |
| `first_competition_year` | Pre-populated from `historical_persons.first_year` via COALESCE at import if a match exists |
| `is_hof` | From export; carries to the claiming member at claim time per §9 OR-merge |
| `is_bap` | From export; carries to the claiming member at claim time per §9 OR-merge |
| `legacy_is_admin` | Old-site admin flag; retained for audit only, never grants live admin |
| `import_source` | `'mirror'` (temporary pre-seeded row) or `'legacy_site_data'` (export-loaded); flipped from `'mirror'` to `'legacy_site_data'` when the export supersedes the row, per "Mirror pre-seed before the export" above |
| `imported_at` | Timestamp of import |
| `legacy_banned` | Optional column; added only when the legacy-account export contains a trustworthy banned/inactive field. When present, populated from the export as audit metadata only; it never gates the self-serve claim card. Banned cases route through admin review whether or not the column exists. |

Credentials, authentication state, mailing-list subscriptions, club-governance permissions, and current-platform flags are never present on `legacy_members`; they belong to the claiming `members` row created at registration and linked at claim time via `members.legacy_member_id` (credential-state invariant per §15.1; three-table rules per DD §2.4).

**Name model note for imports:** The surname constraint (§4) applies only to new registrations and profile edits; `legacy_members` rows are exempt because legacy data may not conform. Write "legacy member" or "imported legacy account" for these rows; the older "imported placeholder" phrasing belongs to the superseded two-table design.

---

## 3. Tier handling at claim

Under the three-table design, `member_tier_grants` is a ledger keyed by `member_id`; so no ledger row exists for an unclaimed legacy account (there is no member yet). The tier-grant mapping is applied at **claim time**: when `M_Claim_Legacy_Account` (or the direct-historical-person claim, or admin manual recovery) completes for a given `legacy_members` row, the claim transaction writes one `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` using the legacy state captured on `legacy_members`. No `active_player_grants` row is written at migration; Active Player is earned post-cutover via the new sources (IFPA-website event attendance, vouching, or first IFPA club join).

The tier-grant mapping itself (the per-standing precedence and the Tier 3 underlying derivation) is the rule defined in the `M_Claim_Legacy_Account` user story and is not restated here. This section covers only the cutover sequencing.

The five `legacy_*` tier-state fields the mapping reads (see DATA_MODEL §4.14b) are a deferred schema extension on `legacy_members` (or staging), populated by the loader and gated on test-load validation per §15.16 and §25 gate G6; the board-at-cutover input depends on the committee table. A field that is not loaded (data undelivered, or held back at validation) simply does not fire, so the affected claims grant on whatever standings are present; an account with only honors is granted on that basis. Held-back fields are recorded in §28.

---

## 4. Name model

Two registration fields:

- **Full legal name** (`real_name`): required. Validation: two words minimum, no digits, no capitalization policing (caps normalized on save).
- **Display name** (`display_name`): optional, defaults to `real_name` if not provided.

**Surname constraint:** Display name must share a surname with real_name. Surname extraction uses suffix stripping (Jr, Sr, II, III, IV). This constraint applies to new registrations and profile edits only. Imported legacy account rows in `legacy_members` are exempt.

**Semantic asymmetry:** For new registrations, `real_name` is the legal name supplied by the member. For imported `legacy_members` rows, `real_name` is the best-available name from the legacy export, which may be a display name, a username, or something else entirely. The field name is the same but the quality and provenance differ.

**Slug lifecycle:** `display_name` and the derived slug are permanent post-registration.

---

## 5. Competition history fields

Two fields on `members`:

- `first_competition_year` (INTEGER, nullable): editable on profile edit. Pre-populated from `historical_persons.first_year` during claim (COALESCE; member value wins if already set). Shown as "Competing since {year}" on profile. Leave blank to hide (opt-out by clearing).
- `show_competitive_results` (INTEGER, default 1): toggle controlling whether results show on public profile. Collected in the `personal_details` onboarding task and editable via M_Edit_Profile. Own profile always shows results to the owner regardless of toggle state.

**Caveat text on results section:** "Published event results only. Historical records may be incomplete."

**Onboarding prompt:** During registration/onboarding, ask the member to confirm their first competition year. (Deferred to onboarding flow implementation.)

---

## 6. Identity and person links

DD §2.4 rules 3-5 own this contract: `personHref()` dispatches to `/members/:slug` when a live member has claimed the historical person, else `/history/:personId`; account deletion clears both FK links (and `legacy_members.claimed_by_member_id`), reverting person links to the historical URL. One member-facing nuance lives here: when a linked historical person's name differs from the member's display name, the historical name is shown on the member profile.

---

## 7. Auto-link: matching legacy_members, historical_persons, and members

Auto-link has two goals under the three-table design (DD §2.4):

1. **Provenance link**: associate each `historical_persons` row with its corresponding `legacy_members` row when the mirror named the legacy account, by setting `historical_persons.legacy_member_id`. This is a data-pipeline step owned by the historical-pipeline track.
2. **Claim link**: stage a candidate association between a current `members` row and a `legacy_members` row (and, if back-linked, the corresponding `historical_persons` row). The candidate is presented to the member through the onboarding wizard for confirmation; no live tables are mutated until the member confirms. `M_Complete_Onboarding_Wizard` is the source of truth for the member-facing card interaction.

Auto-link sends no notification emails. The wizard's claim task is the only post-link member-facing surface.

### Identity anchors

Auto-link considers multiple anchors when looking for candidates:

- Modern login email (verified at registration) matching `legacy_members.legacy_email`.
- Member-declared old email (optional profile field; see §15) matching `legacy_members.legacy_email`.
- Member-declared former surname (optional profile field; see §15) matching the surname on `legacy_members.real_name`.
- Member's current real-name surname matching `legacy_members.real_name` surname, used alongside the above.

A member can declare more than one old email. All declared anchors participate in candidate matching across batch and registration-time passes.

### Evidence-strength tiers

Each confirmed claim transaction carries an evidence-strength tag in its audit row, in increasing strength:

- `declared_anchor_only`: member declared an old email or former surname; no mailbox proof exercised. Soft evidence.
- `currently_controls_modern_email_matching_legacy`: modern verified login email matches a legacy email.
- `mailbox_control_via_link_click`: member opted into a confirmation link delivered to their declared old email and clicked it, demonstrating current mailbox control. Hard evidence.
- `admin_vetted_evidence`: admin reviewed a member-initiated help request (§13) and approved the link based on out-of-band evidence.

The card surface is the same regardless of tier. The tag drives the admin oversight feed (§13) and any dispute-resolution path; the member's experience is uniform across tiers.

### Multi-record candidates

When a single legacy account back-links to more than one historical person via the variants table, the platform surfaces all candidates for the member to choose from. Gate G27 measures the ambiguity count against the test-load `legacy_members` set; if the count exceeds what the wizard's confirmation throughput can comfortably handle, the `name_variants` seed is pruned before batch auto-link runs at cutover.

### Anchor availability when uniqueness assumptions fail

The classifier matches a member's login email and declared old emails against a legacy account's three email columns (`legacy_email` / `legacy_email2` / `legacy_email3`), and presumes that no email value spans two accounts and that `legacy_user_id` is unique where non-NULL (gates G1 and G2 in §25). If a uniqueness check fails at test load, the affected anchor is treated as ambiguous:

- **When an email value spans two accounts.** The cross-column lookup returns multiple `legacy_members` rows for some live members. Affected matches surface no candidate (the platform cannot disambiguate); the member uses declared anchors or asks admin for help instead (§13). Unambiguous email matches in the rest of the export continue to classify normally.
- **When `legacy_user_id` is not unique.** The legacy-username anchor is used in the self-serve identifier-lookup affordance (§8) but does not contribute to auto-link confidence. Self-serve username lookups that return multiple rows display the non-revealing matched-multiple banner (§8) and never silently resolve. Auto-link is unaffected.
- **When both are non-unique.** Ambiguous slices have no auto-surfaced candidate; recovery is through member declaration or admin help.

The non-unique lookup index in §15.7 supports these fallback behaviors at the schema layer; the fallback decision is recorded in §28.

### Known name variants

Known name variants are stored in a **DB table** (not CSV), generated from mined data (~385 pairs at the current pipeline run); the high-confidence subset (~303) is loaded and the ~82 medium-confidence pairs are deferred (the generated seed files track exact counts). Categories: accent variations, prefix variations, typo corrections, diminutives.

Variants support first-name matching (e.g. Bob/Robert). Surname changes (e.g. marriage) are handled by the member-declared former surname field rather than by the variants table; the variants table holds equivalence between spellings of the same name, not transformations between different names.

### Batch auto-link at cutover

The batch pass runs across all `legacy_members` rows at cutover. For each candidate match against a live member:

- The batch writes a staged auto-link candidate. No `members`, `legacy_members`, or `member_tier_grants` rows are mutated.
- The candidate is presented at the member's next sign-in through the wizard's claim task.
- The batch is idempotent: rerun produces no duplicate candidates.

Pre-cutover live members and members who register after cutover are both covered: at any sign-in, the wizard surfaces any staged candidates plus the declared-anchor inputs and any newly-found candidates.

Honors-bearing matches (Hall of Fame, Big Add Posse) apply on member confirmation with the same UX as any other claim; the honors flag is invisible to the registrant. Honors trustworthiness is established a priori: the imported `is_hof` / `is_bap` flags are validated at test-load against the public HoF and BAP rosters (`A_View_Honors_Oversight_Feed`), so a wrong flag is caught before any tier grants. Ongoing oversight is community self-policing plus the admin dispute-revert path; the interactive admin oversight feed is deferred to v2.

### Cross-source candidate detection

After the member confirms one identity source (legacy account or historical record), the platform searches the other source for a plausible candidate match using available anchors (surname agreement, country agreement, no other claimant). Detected candidates surface inline as a follow-on prompt in the wizard. `M_Complete_Onboarding_Wizard` specifies the card-level interaction.

### Registration-time and signup-time conflict prompt

When a new member registers and the platform detects their surname (current or declared former) matches the surname on an already-claimed record they're about to navigate to, the wizard surfaces an inline "we already have a claim under this name, is one of these you?" prompt. This catches same-name collisions and impersonation cases at the earliest point. `M_Complete_Onboarding_Wizard` specifies the card-level interaction.

### Honors oversight (a-priori, no daily email)

There is no daily oversight email. Honors trustworthiness is established before go-live: the imported `is_hof` / `is_bap` flags are cross-checked at test-load against the authoritative public rosters (footbaghalloffame.net for Hall of Fame, bigaddposse.com for Big Add Posse), and mismatches are curated out, so an honor-driven tier grant cannot rest on a wrong flag. After go-live the small, visible community self-polices and an admin reverts any wrong claim through the dispute path. The interactive admin oversight feed is a v2 surface; `A_View_Honors_Oversight_Feed` owns its design.

### Platform code gated on legacy data dump arrival

The following surfaces are designed against the dump's production-shaped fields. Build state differs per item; each also carries a data-side gate that clears when the code-side smoke runs cleanly against the loaded dump.

1. **Optional mailbox-control link click.** Member declares an old email; the platform offers a confirmation-link round-trip; clicking the link while signed in to the same account upgrades the audit tier from `declared_anchor_only` to `mailbox_control_via_link_click`. Token storage uses `account_tokens` with `token_type = 'mailbox_link'` bound to the anchor via `target_anchor_id` (SHA-256 hash only); rate-limited per requesting member, per target anchor, and per IP. Data-side gate: the dump must populate `legacy_email` on enough rows that the round-trip is reachable as an opt-in upgrade. Gate ID: G22.
2. **Multi-anchor candidate classification** (classifier and declared-anchor surfaces built). Auto-link queries the verified-modern-email anchor, the declared-old-email anchors, and the declared-former-surname anchor against the `legacy_members` set, and against `historical_persons` via the back-link. Data-side gate: the dump payload must populate at least one anchor per identity and the `name_variants` seed must be in place to drive same-name variant resolution. Gate IDs: G23 (anchor coverage) and G11 (variants seeded).
3. **Batch auto-link candidate staging at cutover.** A one-time system job stages candidates without mutating live tables, wrapped by the standard `system_job_runs` lifecycle for observability. Idempotent: rerun produces no duplicate staged candidates. Data-side gate: must run after the dump load and before §24 State 3 → State 4 transition. Gate ID: G24.
4. **Direct historical-record claim affordance** (built). The `/history/:personId/claim` confirm page handles the surname-match check (current or declared former) and the first-name-variant warning inline; on success it writes an `audit_entries` row carrying the evidence tier and any name variant used. Data-side gate: full value depends on `name_variants` being seeded. Gate IDs: G25 (affordance) and G11 (variants seeded).

---

## 8. Self-serve claim flow

The member's experience of claiming pre-existing identity (old website account, historical competition record, or both) is specified by `M_Claim_Legacy_Account`. This section covers the system-side contract: identity-reconciliation cases, anchors, direct historical-record claim mechanics, registration-time conflict prompt, dispute path, anti-enumeration posture, rate limiting, and claim ineligibility predicates.

### Identity-reconciliation cases

A registrant falls into one of five situations relative to the legacy data; `M_Claim_Legacy_Account` carries the case-by-case member experience, and `M_Complete_Onboarding_Wizard` orchestrates the path (the claim task is universal regardless of case):

| Case | Legacy account | Historical record | Resolution |
|---|---|---|---|
| A | no | no | No claim available; new account |
| B | yes | no | Claim links the legacy account; tier mapping (§3) applies |
| C | no | yes | Direct claim at `/history/:personId/claim` |
| D | yes | yes, not back-linked | Claim each separately, or the cross-source prompt (§7) finds the second |
| E | yes | yes, back-linked | Claiming either transitively claims the other in one transaction |

### Anchors

Identifying a candidate uses any of:

- Verified modern login email matching `legacy_members.legacy_email`.
- Member-declared old email (optional profile field) matching `legacy_members.legacy_email`.
- Member-declared former surname or current real-name surname matching `legacy_members.real_name` surname.
- Surname match (current or declared former) against `historical_persons.person_name` for the direct historical-record affordance.

Email match is the strongest anchor. Surname (current or declared former) is the only available anchor for case B without modern-email match and case C.

### Direct historical-record claim

Entry point: `GET /history/:personId`. When the viewer's `real_name` surname OR any declared former surname matches the HP's `person_name` surname and the HP is unclaimed, the page surfaces a "Claim this identity" CTA. The confirmation page renders the record's country, honor status, and a first-name warning when the member's first name is a variant of the HP's. On `POST /history/:personId/claim/confirm`:

- Surname reconciliation runs server-side against current real-name surname and any declared former surnames.
- If the HP carries a `legacy_member_id` back-link (case E) and that legacy row is unclaimed, the claim transitively marks the `legacy_members` row claimed and runs the legacy-field merge.
- If the back-linked legacy row is already claimed by someone else, the HP claim is rejected rather than leaving inconsistent state.
- `members.historical_person_id` is set. Historical-person identity fields are carried forward per the merge rules in §9 (under "historical_persons-sourced fields").
- The audit row records the evidence tier defined under "Evidence-strength tiers" in §7.

Anti-abuse: the surname rule (current or declared former) gates direct claims. The partial UNIQUE index on `members.historical_person_id` prevents double-claim. A member can claim at most one HP. Honors-bearing direct claims (HoF, BAP) apply without admin pre-screening; a-priori roster validation (§7), community self-policing, and the dispute-revert path (§13) cover oversight.

### Registration-time conflict prompt

When a new member is registering and the platform detects their surname (current or declared former) matches the surname of an already-claimed legacy account or historical record they're about to navigate to, the wizard surfaces an inline "we already have a claim under this name, is one of these you?" prompt with details of the existing claim. This catches same-name collisions and impersonation cases at the earliest point. The real member arriving after an impersonator was confirmed has an inline path to dispute through this affordance, instead of having to contact admin out-of-band. `M_Complete_Onboarding_Wizard` specifies the card-level interaction.

### Dispute path

A member who confirms a card later believed to be wrong, or a real member arriving after an impersonator was confirmed by mistake, has two affordances:

- Inline at the registration-time conflict prompt above, if surfaced at signup.
- Member-initiated admin help request (§13) if the dispute surfaces later or the platform did not detect the conflict.

Admin reviews disputes and can revert wrong claims via the admin recovery flow. After-the-fact disputes are general support, not a migration-specific surface.

### Anti-enumeration messaging

User-visible messages must never reveal whether the submitted identifier:

- Matched no row
- Matched multiple rows
- Matched an ineligible row (already claimed; admin-flagged)

`M_Complete_Onboarding_Wizard` spells out the user-facing copy. MP requires that the response shape is identical across the matched-none, matched-multiple, matched-ineligible, and matched-eligible cases.

The CSRF Origin-pin middleware (DD §3.3) returns 403 for any state-changing request that omits both `Origin` and `Referer` headers. That 403 is distinguishable from the non-revealing 200 response above; the side-channel is accepted because the pin rejects at the perimeter before the claim flow's response logic runs.

### Rate limiting

Identifier-lookup attempts, declared-anchor changes, and optional mailbox-link-click round-trips must be rate-limited per requesting member account, per target `legacy_members` row, and per source IP/session. This prevents abuse of legacy mailboxes and limits side-channel enumeration. The token mechanics follow DD §3.8; normative numeric limits are administrator-configurable with defaults owned by `USER_STORIES.md` (per its defaults policy), implemented against the `account_tokens` schema described in §15.9. This is the single statement of rate-limit scope for the claim surfaces; other sections reference it.

### Claim ineligibility

A `legacy_members` row is unclaimable when:

- Already claimed (`claimed_by_member_id IS NOT NULL`).
- Duplicate `legacy_members` rows matched the identifier (the `legacy_email` or `legacy_user_id` uniqueness assumption failed at test load; see §25 gates G1 and G2).
- The `legacy_banned` column did not land (gate G3 FAIL per §15.5) AND the row carries a banned/inactive indicator in the source export that the platform cannot trust to apply automatically.
- An admin has flagged the row as review-only.

The legacy banned flag is recorded as audit metadata only and does not gate the claim card. Any platform-level disciplinary state is handled by the new platform's discipline mechanisms, not by legacy ban state.

Ineligible cases are directed to the member-initiated admin help request (§13).

---

## 9. Merge rules

The active modern account always survives. The `legacy_members` row is MARKED CLAIMED (`claimed_by_member_id` + `claimed_at` set) and persists as the permanent archival record; it is NOT deleted. Merge copies editable fields from `legacy_members` to the claiming `members` row so the member has their own copy to edit; the `legacy_members` row itself is not mutated beyond the two claim-state columns.

| Field / category | Merge rule |
|---|---|
| `legacy_member_id` | Written to `members.legacy_member_id` (FK to `legacy_members.legacy_member_id`) |
| `legacy_user_id` | Copied to `members.legacy_user_id` as migration metadata; `legacy_members` retains its copy |
| `legacy_email` | Copied to `members.legacy_email` as legacy metadata; never a login credential; `legacy_members` retains its copy |
| Login and auth fields | Active account always wins; nothing copied from `legacy_members` (which has no credentials) |
| `display_name`, `real_name` | Active account always wins |
| `phone`, `whatsapp` | Active account always wins |
| `bio` | Import fills `members.bio` only if active `bio` is empty string |
| `birth_date`, `street_address`, `postal_code` | Import fills `members.*` only if active value is NULL |
| `city`, `region`, `country` | Import fills `members.*` only if active value is NULL or empty |
| `ifpa_join_date` | Copied to `members.ifpa_join_date` if present and active value absent |
| `first_competition_year` | COALESCE: member value wins; import value fills `members.first_competition_year` if member is NULL |
| `is_hof`, `is_bap` | OR semantics; `members.is_hof` / `members.is_bap` set to 1 if `legacy_members` has the flag |
| `historical_person_id` | Set to the HP's `person_id` whenever the claim resolves an HP: (a) legacy-account claim where `legacy_members.legacy_member_id` matches a `historical_persons.legacy_member_id` back-link (case E per §8), or (b) direct HP claim (cases C or D per §8). Partial UNIQUE index enforces one live member per HP. |
| `historical_persons`-sourced fields | Whenever `members.historical_person_id` is being set, the same transaction also runs the HP merge: `country` fill-if-empty from `historical_persons.country`; `is_hof` / `is_bap` OR semantics from `hof_member` / `bap_member`; `hof_inducted_year` fill-if-empty from `hof_induction_year`; `first_competition_year` COALESCE from `first_year`. This ensures honors and country propagate onto the member row from whichever archival table carries the authoritative value. |
| `announce_opt_in` | Not carried forward as active consent; recorded as legacy metadata only. Members establish subscription preferences fresh after claim (`M_Manage_Email_Subscriptions`); unclaimed `legacy_members` rows are never active mail recipients |
| Legacy admin metadata (`legacy_is_admin`) | Copied to `members.legacy_is_admin` as audit/history context only; never auto-promotes live admin role |
| Tier | Write a single `member_tier_grants` row (`reason_code = 'legacy.claim_tier_grant'`) per the tier-grant mapping in USER_STORIES `M_Claim_Legacy_Account`, from the legacy standings on `legacy_members`. |
| Confirmed club affiliations | Write/update `member_club_affiliations` |
| Confirmed bootstrap leadership | May promote to `club_leaders` if safe; otherwise remains provisional |
| Discarded conflicting imported values | Preserved in audit metadata |

After merge, `legacy_email` may survive on the active account as legacy metadata but is never a login identity.

**Surname matching across claim paths.** Both the wizard-confirmed candidate flow and the direct historical-record claim path match against the member's current real-name surname or any declared former surname. A member with a name change between their legacy identity and current account declares the former surname on their profile (or at signup) and the claim path then resolves normally. If the member has not declared a former surname and the surnames don't agree, the platform routes the case to the member-initiated admin help request (§13).

**Concurrent claim races on the same historical person** are resolved by the partial UNIQUE index `ux_members_historical_person_id` plus service-layer error mapping. Two members claiming the same historical person simultaneously both pass the in-controller "already claimed" check; the loser is rejected at the INSERT by the index. The claim transaction runs under SQLite IMMEDIATE isolation so the SELECT-then-INSERT logic and the dependent merge writes commit or roll back atomically; the unique index is the load-bearing defense against the race. The service wraps the SQLite `SQLITE_CONSTRAINT_UNIQUE` exception in `ConflictError`; the controller renders the same user-readable "already claimed by another member" 422 response it renders on the synchronous check path.

**Concurrent claim races on the same legacy account** are resolved by the partial UNIQUE indexes `ux_members_legacy_id` on `members(legacy_member_id)` and `ux_legacy_members_claimed_by` on `legacy_members(claimed_by_member_id)`. Two members confirming the same `legacy_members` row at roughly the same time both pass the in-controller "claimed_by_member_id IS NULL" check before either INSERT lands; the loser is rejected by one of the unique indexes. The service wraps `SQLITE_CONSTRAINT_UNIQUE` in `ConflictError`; the controller renders the same user-readable "this legacy account has been claimed by another member" 422 response that the synchronous check path renders. The `member_tier_grants` insert occurs inside the same merge transaction as the index-protected writes, so a unique-constraint rejection rolls back the entire transaction; no partial tier grant persists.

---

## 10. Club bootstrap and onboarding

Terminology used throughout this section:

- **Bootstrap row**: a row in `club_bootstrap_leaders` that records a `(member, club)` leadership candidate inferred from mirror data; not yet a live leader. Promoted to a `club_leaders` row at wizard confirmation per §2.
- **Promotion path**: the transition that turns a non-live candidate into a live row. For clubs, this turns an `onboarding_visible` or `dormant` candidate in `legacy_club_candidates` into a `clubs` row; for leadership, this turns a bootstrap row into a `club_leaders` row.
- **Junk candidate**: a `legacy_club_candidates` row whose classification rules out promotion to a live club regardless of registrant signal. Junk candidates are never shown in the wizard.
- **Pre-populated / onboarding-visible / dormant**: classification states for `legacy_club_candidates`; the four-way classification (the fourth being junk) is defined in §10.1.

### 10.1 Club classification rules

Every legacy club extracted from the mirror is classified into one of four categories: `pre_populate`, `onboarding_visible`, `dormant`, or `junk`. Classification determines whether the club exists in the live `clubs` table at go-live, appears as a suggestion during registration, is searchable but not suggested, or is excluded from public surfaces entirely.

Classification is deterministic and tunable. Each rule references a named parameter with a documented default. The classifier prints a category-distribution summary (with per-rule firing counts) and a diff against the previous run's output for any parameter set, so cutoffs can be sanity-checked before cutover.

#### Source signals

All signals come from data already produced by the mirror pipeline. No external lookups.

- **Hosting evidence** from the event archive: ever-hosted flag, hosted-event count, last hosted year. The canonical hosting link is the FK `events.host_club_id` to `clubs.id`. When the classifier runs before live `clubs` rows exist, it falls back to a normalized-name match between event host text and candidate names.
- **Page timestamps** from `div#MainModified` on each club page: created year, last-updated year.
- **Listed contact** from `div.clubsContacts`: the contact's mirror member id, captured from `members/profile/{id}`. The contact's last competitive year is resolved by joining the mirror id to `historical_persons.last_year` via the mirror-id to historical-person-id mapping.
- **Affiliated rostered members** from the showmembers page: count of unique member names, count matched to known historical persons, max last competitive year across matched members.
- **Description**: presence and content of `div#ClubsWelcome`.
- **External URL**: presence and verification status of the URL from `div.clubsURL`. URL verification is performed before publication per §10.3.

#### Classification parameters

All parameters are tunable; defaults are documented here.

| Parameter | Default | Drives |
|---|---|---|
| `hosting_recency_years` | 7 | Hosting-alone-sufficient signal |
| `page_edit_recency_years` | 5 | Page-maintenance corroborator at pre-populate |
| `contact_active_recency_years` | 5 | Listed-contact corroborator |
| `member_active_recency_years` | 5 | Affiliated-member signal |
| `new_club_grace_years` | 4 | New-club onboarding-visible carve-out |
| `edited_after_creation_min_year` | 5 | Page-maintenance recency window at onboarding-visible |
| `anchor_year` | the cutover year, passed explicitly (never derived from the clock) | All recency windows resolve against this anchor |

#### Duplicate clubs

The mirror lists some real clubs under more than one legacy key (for example a club re-created in a later year, or a near-empty re-listing). A curator records confirmed duplicate pairs in `legacy_data/overrides/club_duplicates.csv` (`keep_legacy_key`, `drop_legacy_key`, reason). The pipeline merges each confirmed pair deterministically into the `keep` candidate:

- `name`, `city`, `region`, `country`, `contact_member_id`, `external_url`: from the candidate with the strongest signal evidence (most hosting, largest roster, most recent edit); ties broken by latest update.
- `description`: longest non-empty across the pair.
- `created`: earliest. `last_updated`: latest.
- Roster, affiliations, and hosted-event credits: union across the pair, deduplicated by resolved person.
- Source identities: the merge is recorded in the curator override file (`legacy_data/overrides/club_duplicates.csv`) and the pipeline outputs, so every source `legacy_club_key` remains auditable and the merge reversible by editing the override and re-running the pipeline.

Merging unions rosters rather than discarding a duplicate, so no affiliation is lost. The merge is curator-confirmed and deterministic at pipeline time; there is no automatic similarity clustering and no platform-side merge process. A curator who needs to undo a merge edits the override and re-runs the pipeline.

Wizard resolution treats all source identities as resolving to the merged candidate: when a registrant cites a source legacy name in Stage 1B, the affiliation maps to the merged row.

#### Hard exclusions: junk

A candidate is marked `junk` only by the signal-absence rule below or the force-junk override. Junk candidates remain in the candidate set for audit but are invisible to all non-admin surfaces. Pattern rules (name blacklist, structural patterns, profanity list) are deliberately not part of the classifier: evaluated against the full club-candidate set they matched zero candidates, and the mirror is frozen, so they cannot ever match.

Signal-absence rule fires when all of the following hold simultaneously:

1. Description is empty.
2. Never hosted any event in the legacy archive.
3. No rostered member has a known competitive year.
4. External URL is empty or fails verification.
5. Contact-member-id is empty or cannot be matched to any record.
6. Created more than `new_club_grace_years` ago.
7. Never edited after creation. The legacy CMS records `created` and `last_updated` as separate timestamps; clause 7 fires when `last_updated` falls in the same year as `created` (year granularity, matching the pipeline's derived year columns).

The signal-absence rule is the catch-all classifier for legitimate-looking clubs that nevertheless lack any signal a registrant could confirm. A club that fails pre_populate, fails onboarding_visible, and has no description (and therefore no dormant-candidate hook a registrant could later confirm) routes here. The force-keep override list (below) is the recovery path for any real club that was mis-caught.

Admin override lists:

- **Force-keep**: specific legacy keys immune to the junk rule, used to rescue real clubs that have no signals; a force-keep entry may also pin the candidate to a specific category.
- **Force-junk**: specific legacy keys marked junk regardless of other classification, used for spam the rules missed.

Both lists live as curator-owned override CSVs in `legacy_data/overrides/`, alongside the duplicate overrides.

#### Pre-populate rules

A candidate enters `pre_populate` if it survives the hard exclusions and meets any of:

- **PP-hosting**: hosted an officially recorded event in the last `hosting_recency_years` years.
- **PP-contact-corroborated**: listed contact is recognized in `historical_persons` AND last competed in the last `contact_active_recency_years` years AND any one of:
  - Club ever hosted an event.
  - Page edited in the last `page_edit_recency_years` years AND edit was after creation.
- **PP-maintained-host**: page edited in the last `page_edit_recency_years` years AND the club ever hosted an event.

The substitute path (any recently active rostered player counts in place of an identified listed contact) is not permitted at the pre-populate tier. Recently active rostered members may corroborate at the onboarding-visible tier only.

Pre-populated candidates may also receive bootstrap leadership rows under the bootstrap rule in §2 (which also describes the leadership activation paths). Bootstrap leadership is independent of classification: clubs lacking a strong-classification leader candidate still pre-populate without a provisional leader.

#### Onboarding-visible rules

A candidate enters `onboarding_visible` if it survives the hard exclusions, fails the pre-populate rules, and meets any of:

- Page lists a contact but the contact is not recognized in `historical_persons`.
- Listed contact is recognized but last competed more than `contact_active_recency_years` ago.
- An affiliated rostered member (not the listed contact) last competed within `member_active_recency_years` years.
- Club ever hosted an event without meeting a pre-populate corroborator.
- Page edited within `edited_after_creation_min_year` years AND edit was after creation.
- Created within `new_club_grace_years` years (too new to judge by other signals).
- **OV-roster-size**: the roster lists at least 10 unique member names, or at least 3 roster members are linkable to known historical persons.

#### Dormant rule

A candidate enters `dormant` if it survives the hard exclusions, fails all pre-populate and onboarding-visible rules, and has a non-empty description. These are real historical clubs without current activity signals.

#### Classification evidence persistence

Each candidate row carries, alongside `classification`, one 0/1 flag column per named rule (R1–R10) recording exactly which rules fired, plus the underlying signal values as plain columns (last hosted year, last edit year, listed contact's last competitive year, member counts). Admin reviewing a candidate sees the bucket label and the rationale without re-running the classifier. Schema for these columns is specified in DATA_MODEL `legacy_club_candidates` and `database/schema.sql`.

#### Live content at GoLive (pre-populated clubs)

For each pre-populated candidate, the live `clubs` row carries:

- `name`, `city`, `country`: from the (possibly merged) candidate.
- `region`: from the candidate when present; may be NULL.
- `hashtag_tag_id`: standardized hashtag generated deterministically from `name`.
- `external_url`: carried from the candidate and verified at data-prep time per DD §3.17. The public club read shows the URL only once it is verified and not quarantined; an unverified or flagged URL is retained on the row but hidden from public render, and surfaced to the listed contact (and admin) for review.
- `description`: published as-is from the legacy data.

A club carries no club-level contact field; it is reachable through its co-leaders' own contact. Description and URL on the live page are edited directly by the club's co-leaders, with URL verification per §10.3 before publication. Other members report inaccuracies to club leadership out of band.

#### Promotion rules

Pre-populated candidates exist as live `clubs` rows at go-live. All other non-junk candidates remain in `legacy_club_candidates` until promoted, archived, or admin-resolved. Promotion paths:

- **Stage 1 confirmation**: when a registrant in Stage 1A or Stage 1B confirms a personal affiliation with an onboarding-visible or dormant candidate, the candidate is promoted to a live `clubs` row using the live-content rules above.
- **Admin override**: an admin can promote any non-junk candidate manually via the cleanup queue. Candidates not covered by a registrant's Stage 1 personal card reach live status only through this path (or surface through the `M_Create_Club` duplicate-prevention check, which routes the creator to the existing entry).

The promotion transaction is idempotent. The club id is derived deterministically from the candidate's legacy key (`stable_id("club", legacy_club_key)`), and the candidate's `mapped_club_id` records the promotion. If two registrants confirm the same `legacy_club_candidates` row in concurrent transactions, both derive the same club id; the second transaction's INSERT is rejected by the `clubs` primary key, and the service treats the candidate as already promoted, completing the second registrant's affiliation against the existing `clubs` row.

The `legacy_club_candidates` table remains operational until every non-junk candidate has reached a terminal state per §10.4.

#### Pipeline ordering

The classifier depends on `historical_persons` being fully populated, including the club-only members extracted from the mirror (per §10.2). Without those rows, the listed-contact-active and member-active signals are artificially deflated for clubs whose people never competed.

Required order:

1. Extract club-only members into `historical_persons` (§10.2).
2. Classify clubs against the rules above.
3. Auto-merge duplicate clusters; route significant-difference clusters to admin.
4. Mark junk.
5. Persist classification evidence on each candidate.
6. Pre-populated candidates enter the live `clubs` table; non-junk non-pre-populate candidates remain in `legacy_club_candidates`.

### 10.2 Expanding historical_persons for club members

The historical_persons table contains ~3,570 persons drawn from event results (count moves with pipeline runs; §26 and the pipeline QC reports are authoritative). Approximately 1,700 additional people in the mirror appear only as club members (never competed in events). These must be extracted and added to historical_persons to support club affiliation linking at claim time.

### 10.3 Club onboarding flow during registration

Registration is the primary cleanup mechanism for legacy club data. Every registrant passes through the club-affiliations wizard task after identity resolution (§6-§8). The wizard asks club questions only where the registrant has personal authority (Stage 1: the registrant is named in the legacy data on a club as listed contact or rostered member); a registrant with no suggested affiliation skips Stage 1 cards and goes directly to the wrap-up landing. After the cards, a wrap-up landing routes to the regular club browse, join, and create surfaces. There is no in-wizard club search, and the wizard never creates a `clubs` row except by promoting a confirmed candidate.

`M_Complete_Onboarding_Wizard` (USER_STORIES) is the authoritative member-facing contract: card wording (two orthogonal questions per Stage 1 card, membership confirmation and activity signal), card resume, detour handling, the two-current-affiliations cap, leadership promotion and downgrade invariants, and viability-signal collection into `club_viability_signals` feeding `A_Periodic_Club_Cleanup`. The flow is implemented in `MemberOnboardingService` (stage-1 cards plus wrap-up).

System rules the wizard preserves:

- Junk candidates are never shown on any surface. Onboarding-visible and dormant candidates promote to live `clubs` rows only via the §10.1 promotion paths on member confirmation, or via admin override.

#### Content editing

Description and external URL on every live `clubs` row are edited directly by the listed contact and any registered club leader; there is no approval gate and no suggestion queue. Other members report inaccuracies to club leadership out of band. Every URL bound for a live page passes URL verification before appearing publicly per DD §3.17: a contact or leader edit is verified at submit time, and a URL carried from legacy data is verified at data-prep time. Until a URL is verified and not quarantined it is hidden from public render; the value is retained and the validator's error is surfaced to the editor.

### 10.4 Long-term cleanup

The `legacy_club_candidates` table is not a permanent operational surface. Every non-junk candidate eventually reaches a terminal state: promoted to a live `clubs` row, demoted to dormant, archived, or merged with another club. Admin is the sole decision authority; members provide input through structured flags. There is no time-bounded saturation window; admin reviews the queue at their own pace, and the table remains operational until empty.

Admin's user-facing entry point is `A_Periodic_Club_Cleanup` in USER_STORIES.

#### Member flag mechanism

Members flag clubs through one surface: the onboarding wizard. Negative activity answers (never-heard-of-it reports, not-active signals) are recorded as `club_viability_signals` rows per `M_Complete_Onboarding_Wizard`, carrying the club id, the member id, the signal value, the wizard stage, and a timestamp; membership rejections persist as affiliation status transitions and surface to admin through the residue counts. The cleanup queue counts them one vote per member (latest signal wins) and names negative voters to the admin; authorship never renders publicly.

#### On-demand cleanup evaluation

There is no unattended background process. When an admin opens the `A_Periodic_Club_Cleanup` queue, the platform evaluates the viability and leadership-staleness predicates fresh (`crowdsource_club_viability` G1-G4, `leaderless_active_club`, `stale_provisional_leader`) and surfaces the clubs that need a human decision, each with a recommended one-click action (demote, archive, dismiss, defer). No transition fires automatically; demote and archive are admin actions, each writing one `audit_entries` row with `actor_type='admin'`.

Unconfirmed `legacy_person_club_affiliations` residue (`'pending'` rows) is retired by an explicit per-club admin de-list to `'former_only'`, also cascaded when a club is demoted or archived. Duplicate club candidates are merged before cutover by a curator-confirmed directive in the pipeline (per §10.1), not by a platform-side process.

#### Admin residue queue

When an admin opens the queue, it aggregates the items requiring human judgment:

- Wizard-generated flags grouped by candidate or live club.
- Junk-flagged candidates (per §10.1 junk rules) and any admin force-keep or force-junk requests.
- Non-junk candidates not yet promoted to live `clubs` rows.
- `legacy_person_club_affiliations` rows still in `resolution_status='pending'` (unconfirmed legacy residue), grouped by live club with each club's pending count and oldest-row age.

The admin-home backlog badge surfaces the count of open queue items and the age of the oldest open item. Admin sorts and filters this queue at their own cadence. There is no automated demotion or time-based escalation. Recommended cadence is monthly during steady-state operation; weekly during periods of high member activity.

Admin's available actions per item:

- Promote a candidate to a live `clubs` row.
- Demote a candidate to dormant.
- Mark a live `clubs` row `status='inactive'`.
- Archive a `clubs` row (`status='archived'`).
- Merge two live `clubs` rows that turn out to be the same club.
- Add a candidate to force-keep or force-junk.
- Dismiss a flag with an optional reason, or defer with a bounded duration (30 / 90 / 180 days) after which the item re-surfaces.
- De-list a club's unconfirmed `legacy_person_club_affiliations` residue: one click transitions that club's `'pending'` rows to `'former_only'` in a single transaction (each row carries the actor and timestamp; one summary audit row records the action and count), guided by the oldest-row age shown in the queue. Safe to re-run; also cascaded by demote and archive.

Every admin action is recorded in the audit log. Concurrent admin coordination uses a lightweight claim marker per item (auto-releases on resolve or after a 30-minute stale-claim timeout).

#### Per-category terminal states

- **Pre-populated**: continues as a live `clubs` row until an admin action moves it. Member flags accumulate in the queue; admin decides whether to demote, mark inactive, archive, or dismiss.
- **Onboarding-visible**: reaches a terminal state when promoted to live (via wizard confirmation per §10.3 or via admin promotion), demoted to dormant (admin only), or archived (admin only).
- **Dormant**: revived through a registrant's Stage 1 personal card, the `M_Create_Club` duplicate-prevention check, or admin promotion. Admin may archive a dormant candidate at any time.
- **Junk**: invisible to non-admin surfaces; admin force-keep returns it to the classifier's normal evaluation.

#### Labeled legacy affiliations on rosters

The platform's club-roster reads include `resolution_status='pending'` alongside `'confirmed_current'` and `'promoted'`, so loader-imported affiliations render on `/clubs/:key` from launch. Without this, every imported affiliation would be invisible until its member walked the onboarding wizard, and rosters would launch empty.

On the club detail page these are shown honestly: confirmed members appear under "Members", and `'pending'` rows appear under a separate, labeled "possible members from legacy records" section that states they have not yet confirmed in onboarding. A `'pending'` row is never presented as a current member. There is no read-filter revert; labeling, not hiding, is the long-term design.

The `'pending'` set drains through two paths: members confirm or decline their own rows during the onboarding wizard, and an admin retires a club's unconfirmed residue with a one-click de-list in the `A_Periodic_Club_Cleanup` queue (`'pending'` to `'former_only'`), also cascaded when a club is demoted or archived. The de-list is taken at the admin's discretion, guided by an advisory age signal, with no fixed deadline and no timed transition.

#### Closure

When every non-junk candidate has reached a terminal state, the `legacy_club_candidates` table may be dropped. Until then, it remains operational and queryable by admin through the cleanup queue. There is no fixed deadline; the table's lifetime is bounded by admin's pace.

---

## 11. Onboarding wizard service

The onboarding wizard is the primary surface for cleaning up legacy identity data. A single backend service, `MemberOnboardingService`, owns the per-member task list and orchestrates the wizard flow. `M_Complete_Onboarding_Wizard` is the source of truth for task states, entry-point semantics, applicability rules, skip/resume behavior, detour lifecycle, dashboard task-widget behavior, and audit emission. This section covers only the migration-specific design: task-to-source-flow routing and storage.

### Task catalog

Every member has an ordered task list. Tasks at cutover:

| Task type | Source flow | Owning service for the underlying logic |
|---|---|---|
| `personal_details` | Location, date of birth, gender, first competition year, show competitive results | `MemberService` |
| `legacy_claim` | §7 auto-link or §8 self-serve claim | `IdentityAccessService` |
| `club_affiliations` | §10.3 club flow (stage-1 cards plus wrap-up) | clubs service |

Task ordering is fixed: `personal_details`, then `legacy_claim`, then `club_affiliations`. Adding a new task type later is a service-internal change (register a handler in the catalog); the service interface does not change.

### Storage

`member_onboarding_tasks` (DATA_MODEL §4.29) carries one row per (member_id, task_type) with state and timestamps. The table is permanent operational state, not migration-only.

### Relationship to §10.3

The wizard service is the orchestration shell; §10.3 and `M_Complete_Onboarding_Wizard` describe the `club_affiliations` task content, which every registrant sees regardless of whether they claim a legacy account. The claim flows in §7-§8 render together as the `legacy_claim` task: one page mixing `legacy_members` and `historical_persons` candidates, deep-linking HP cards to `/history/:personId/claim`.

---

## 12. Security model summary

- Legacy passwords are never imported, stored, or accepted
- `legacy_email` is migration metadata, not a login credential
- Auto-link sends no notification emails; the wizard's confirmation card is the only post-link member-facing surface (§7)
- Optional mailbox-control proof via a confirmation-link round-trip to the member's declared old email upgrades the audit evidence tier from `declared_anchor_only` to `mailbox_control_via_link_click`; it is an opt-in upgrade, not a required gate
- Member-declared anchors (former surname, declared old emails) are always private: visible only to the member and admin (§15)
- Imported rows cannot log in, cannot be searched, cannot receive member broadcasts
- Claim tokens (for the optional mailbox-link-click round-trip) are account-bound: consuming a token while authenticated as a different account fails
- Rate limiting protects every claim surface; the single statement of scope and keying lives in §8
- The non-revealing messaging rule applies everywhere in the claim flow
- Bootstrap leadership confers zero live permissions until confirmed on a real modern account
- Name validation is loosened for imports (two words + no digits only); surname constraint scoped to new registrations and edits; declared former surnames extend the matching surface across all claim paths
- Cookie domain widening to `Domain=.footbag.org` (§29.15) sends the session token to every retained `*.footbag.org` hostname under the legacy host's parallel role (§29.12a). HTTPS is non-negotiable on retained subdomains for the parallel-role window; plain-HTTP exposure would leak the session token in cleartext on every request. The CSRF Origin-pin middleware (DD §3.3) is the cross-subdomain defense against a malicious form on a retained host

---

## 13. Admin flows

Migration-time admin involvement is reactive, not gating. Members confirm their own claims via the wizard; the platform applies effects only on member confirmation. Admin acts only when the member asks for help, when a dispute surfaces, or for read-only oversight of a narrow category of post-facto claims.

### Member-initiated admin link request (review)

The reactive recovery flow described in §15 is the only migration-time admin queue with active member-driven items: a member whose identity no candidate or declared anchor can resolve submits a free-text request with whatever references they can supply, and the request enters an admin queue. `A_Review_Member_Link_Help_Requests` owns the admin-facing review story. System-side contract: an approved link records evidence tier `admin_vetted_evidence` in its audit metadata; approval never auto-promotes legacy `is_admin` metadata to a live admin role; the legacy banned flag is audit metadata only and does not gate the link decision (platform discipline mechanisms govern, not legacy ban data).

### Honors-bearing direct claim oversight

Never gating: honors-bearing direct historical-record claims (per §8) apply on confirmation. Honors data is validated a priori at test-load against the public rosters (§7), the community self-polices, and the dispute revert is the recovery path for a wrong claim. The interactive admin oversight feed is a v2 surface; `A_View_Honors_Oversight_Feed` owns its design.

### Dispute revert

A real member arriving after an impersonator confirmed, or a member who confirmed a wrong card, can either use the registration-time conflict prompt (§8) inline at signup or invoke the member-initiated help request to ask admin to revert. Admin reverts by clearing the back-link columns and the tier grant; the audit row records the dispute event. After-the-fact disputes follow the same admin recovery pattern as link requests.

### Initial-admin bootstrap

At cutover, the platform has zero `is_admin=1` rows. The initial Application Administrator(s) are granted out-of-band by a System Administrator per DD §2.9. The grant path is reserved for inception and total-admin-loss recovery; all subsequent grants and revocations use the in-app admin-management story (US).

The grants satisfy go-live gate GV2 ("At least one administrator account provisioned in production and login-tested", §22). They are performed after the production DB is live and seeded, and before any admin-only path is opened to volunteers. Operator-facing procedure for the current bootstrap mechanism is documented in DEV_ONBOARDING.

The bootstrap path is exempt from the Tier 2 / Tier 3 status gate that the in-app admin-management story enforces. Rationale: at cutover the SysAdmin who performs the first grant may not yet have claimed their own legacy account, so their tier state is `tier0` even if they hold honors or paid tier in legacy (tier grants are written one row per member-confirmed claim, per State 4 step 4). The in-app gate exists to govern admin-to-admin grants where both parties have settled tier state; it does not apply to the SysAdmin's out-of-band first grant. The in-app gate remains in force for every grant after the first.

---

## 14. User stories summary

The user-facing behavior referenced throughout this document is specified by the stories in `docs/USER_STORIES.md`, principally `M_Claim_Legacy_Account`, `M_Complete_Onboarding_Wizard`, `M_Edit_Profile`, `M_Delete_Account`, `A_Review_Member_Link_Help_Requests`, `A_View_Honors_Oversight_Feed`, and `A_Periodic_Club_Cleanup`.

---

## Part B -- Contracts

## 15. Required schema changes

### 15.1 Credential-state invariant: three-branch
Three-branch CHECK on `members`: live non-system account (credentials present), purged row (credentials NULL, `personal_data_purged_at` set), or system-member account (`is_system=1`, credentials NULL, never purged). Imported legacy accounts live in `legacy_members` (§2 Legacy member import), not as placeholder rows in `members`.

### 15.2 Location field nullability
`city` and `country` are nullable. `region` was already nullable.

### 15.3 Membership tier and Active Player are read-model-only
Current membership tier reads from `member_tier_current`. Active Player status reads from `member_active_player_current`. Combined gate: `member_membership_status_current`. No cached tier or status columns exist on `members`.

### 15.4 New migration fields on `members`
Added: `legacy_user_id`, `legacy_email`, `ifpa_join_date`, `birth_date`, `street_address`, `postal_code`, `legacy_is_admin`.

### 15.5 `legacy_banned`

Target / cutover-conditional field. Added to `legacy_members` (or a migration-only staging table joined to it) only when Gate G3 (§25) PASSes (i.e. when the legacy-account export contains a trustworthy banned/inactive field). Schema authority: `database/schema.sql`. Landing path: when G3 PASSes at test load, the column is added to `database/schema.sql`; staging and the production cutover database are built fresh from `schema.sql` plus loaders (fresh-build strategy, §15.16), so no in-place production migration runs. When G3 FAILs, the column does not land; per §28 item 2 the questionable-row handling routes through admin review per §8 self-serve ineligibility instead.

```sql
legacy_banned INTEGER NOT NULL DEFAULT 0 CHECK (legacy_banned IN (0,1)),
```

The column is audit metadata only and never gates the self-serve claim card, whether or not it lands. Banned/inactive cases route through admin review per §8 self-serve ineligibility. Gating on the column value is a possible future policy change requiring webmaster/IFPA input; the audit-metadata-only default stands until such a decision is made.

### 15.6 `legacy_member_id` uniqueness
Partial unique index `ux_members_legacy_id` on `members(legacy_member_id) WHERE legacy_member_id IS NOT NULL`.

### 15.7 Uniqueness for `legacy_email` columns and `legacy_user_id`

`legacy_user_id` is unique where non-NULL; if the test load disproves that assumption (gate G2 in §25), it drops to a non-unique lookup with service-layer ambiguity handling.

A legacy account carries up to three email addresses (`legacy_email` plus secondary `legacy_email2` / `legacy_email3`); a member's verified login email and each declared old email match against all three (§7, M_Claim_Legacy_Account). The email columns are non-unique, because one address may legitimately be primary on one account and secondary on another. Cross-account email uniqueness (an address must not identify two different accounts) is the go-live gate G1 (§25), checked by `scripts/validate-legacy-import-gates.sh`, which flags any value shared across accounts in the three columns for curation before cutover; an address still ambiguous at match time surfaces no auto candidate (the runtime backstop).

### 15.8 `members_searchable` view
Includes `email_verified_at IS NOT NULL` filter.

### 15.9 `account_tokens`: `account_claim` type and target binding
`token_type` CHECK includes `'account_claim'`. `target_legacy_member_id` with `ON DELETE NO ACTION`.

Cleanup interaction: the §29.6 daily `account_tokens` cleanup job removes rows where `expires_at < now()` or where `used_at IS NOT NULL` and the consumption is older than the configured retention window. Because `legacy_members` rows are never deleted (they persist as permanent archival records, claimed or not), the `ON DELETE NO ACTION` FK on `target_legacy_member_id` is not load-bearing in production; it exists to prevent accidental cascade if a `legacy_members` row is ever administratively removed. The cleanup job operates on `account_tokens` only and does not need to inspect `legacy_members` state.

### 15.10 `member_club_affiliations`
Permanent operational table. The current-club cap is two concurrent current clubs per member, service-enforced (no partial unique index).

### 15.11 `legacy_club_candidates`
Migration-only staging table.

### 15.12 `legacy_person_club_affiliations`
Migration-only staging table with dual partial unique indexes.

### 15.13 `club_bootstrap_leaders`
Operational table with `imported_member_id ON DELETE SET NULL` and a `status` lifecycle column (`provisional` → `claimed`, `rejected`, or `superseded`). Full schema in DATA_MODEL.

### 15.13a `legacy_members.claim_status`

Not present in the schema, and stays out unless a concrete query or admin workflow proves it is needed before cutover. Audit-log entries plus `claimed_by_member_id` / `claimed_at` remain authoritative.

### 15.14 `first_competition_year` and `show_competitive_results`
On `members` table.

### 15.15 Known name variants table

`name_variants` (built; schema authority `database/schema.sql`) stores name-equivalence pairs supporting auto-link matching (§7) and claim/registration-time prompts. Seeded at State 1 from mirror-mined pairs (~385 at the current run); permanent post-cutover so admins and members may record further equivalences. Contract notes the schema cannot express: the relation is symmetric (store one direction only; lookups check both columns), and normalization is application-side (NFKC + lowercase + whitespace-collapse + trim) before any insert or lookup. Not prefixed `legacy_*` because the pairs are a permanent name-matching utility with no resolution step, unlike migration-scope staging tables.

### 15.16 Tier-mapping fields on `legacy_members`

The five `legacy_*` tier-state fields read by the claim-time tier grant are specified in DATA_MODEL §4.14b (their meaning) and USER_STORIES `M_Claim_Legacy_Account` (the mapping that reads them). This section covers only their cutover handling.

Schema authority: `database/schema.sql`. The cutover database is built fresh from `schema.sql` plus loaders; `deploy-migrate.sh` remains a stub until post-launch. The loader populates the five fields.

At test load (gate G6, §25), each field is spot-checked against known reference cases: HoF members with documented payment history, board members at cutover, and known lifetime-tier1 payers. A field whose values do not match the references (administrative corrections, refunded payments, test records, or other contamination) is left unpopulated; its basis then does not fire for any claim, and the other standings still apply. If the tier inputs are insufficient overall, the paid and board fields are left unpopulated and claims grant on honors alone. Whatever is held back is recorded in §28.

### 15.17 Declared identity anchors (former surnames and old emails)

Built as one table, `member_declared_anchors` (schema authority `database/schema.sql`; documented in DATA_MODEL §4.30): one row per `(member_id, anchor_type, anchor_value)` with `anchor_type` in (`former_surname`, `old_email`). Anchors are member-asserted with no proof required. Former surnames participate in claim matching across all claim paths alongside the current real-name surname; old emails match against `legacy_members.legacy_email` during auto-link candidate matching (§7). Normalization is application-side before insert and lookup.

- Surfaces: optional input at registration, prompted within the wizard's universal claim task, editable from the profile; see `M_Complete_Onboarding_Wizard`.
- Privacy: visible only to the member and to admin; never surfaced on public profile, member search, or any cross-member listing.
- Cleared on PII purge alongside `members.legacy_member_id` and `members.historical_person_id`.

### 15.18 Mailbox-control verification columns

The optional confirmation-link round-trip (§7, gate G22) keeps verification state on declared old-email anchors: `verified_via_link_click_at` TEXT NULL and `verification_token_id` TEXT NULL on `member_declared_anchors`, set when the member clicks the link delivered to the declared address while signed in to the same account, upgrading the audit evidence tier from `declared_anchor_only` to `mailbox_control_via_link_click`. The link is a single-use `account_tokens` row of `token_type = 'mailbox_link'` bound to its anchor via `target_anchor_id`.

### 15.19 Evidence-strength tag on claim transactions

Every confirmed claim transaction (auto-link card confirmation, cross-source candidate confirmation, mailbox-link-click round-trip, admin-help-request approval) carries an evidence-strength tag on its `audit_entries` row.

Tiers in increasing strength:

- `declared_anchor_only`
- `currently_controls_modern_email_matching_legacy`
- `mailbox_control_via_link_click`
- `admin_vetted_evidence`

Schema authority: `database/schema.sql`. The tag lives in `audit_entries.metadata_json` under a stable key (e.g. `evidence_strength`). The admin oversight feed (§13) filters by tier. Name-only confirmations (a medium-confidence staged-candidate confirmation, or a direct historical-record claim passing only the surname rule) tag the `declared_anchor_only` floor tier; an email anchor must be the member's verified login email to carry `currently_controls_modern_email_matching_legacy`, and a declared old email carries the floor tier until its mailbox-control round-trip completes.

### 15.20 Staged auto-link candidates

Batch auto-link (§7) stages candidate matches without mutating live tables. Each staged candidate carries a member identifier, the target `legacy_members` and / or `historical_persons` rows, the matched anchor(s), and the proposed evidence tier. The wizard reads from this staging surface to surface cards at member sign-in.

The staging table is `auto_link_staged_candidates` in `database/schema.sql`. The staging surface is migration-scope; rows resolve on member confirmation, decline, or expiration of the staging window, and re-staging an open member/target pair is a unique-constraint no-op so batch reruns stay idempotent.

### 15.21 Member-initiated admin link request

`work_queue_items` task_type `member_link_help_request` carries member-submitted help requests per §13. The request payload includes the member's identity statement, any attachments, and structured fields (claimed legacy username, claimed legacy email, references to community members who can vouch, etc.). The audit row written on admin approval carries `evidence_strength = 'admin_vetted_evidence'`.

`work_queue_items.task_type` is free-form text (no CHECK), so this needs no schema change; the task_type value and its payload contract are owned by the service that enqueues it.

---

## 16. Data pipeline inventory

### Curated CSVs (human-curated, source of truth; committed to the repository)

Location: `legacy_data/event_results/canonical_input/`

- `persons.csv`: historical persons with IFPA IDs, honors, stats
- `events.csv`: historical events (the normalized variant `events_normalized.csv` is an upstream curated input under `legacy_data/inputs/`)
- `event_results.csv`: result entries
- `event_result_participants.csv`: participant-to-result mappings
- `event_disciplines.csv`: discipline breakdowns

### Extracted CSVs (from mirror, treated as source of truth; committed to the repository)

Location: `legacy_data/seed/`

- `clubs.csv`: club identities extracted from mirror
- `club_members.csv`: club membership associations from mirror (~2,400 associations)
- `name_variants.csv` (generated seed, `legacy_data/inputs/`): ~385 name-equivalence pairs from `build_name_variants.py`, committed for review; loaded by `load_name_variants_seed.py` (gate G11; see §15.15)

### Generated CSVs (pipeline output, regenerable; not committed)

Location: `legacy_data/event_results/seed/mvfp_full/`

- `seed_events.csv`, `seed_event_disciplines.csv`, `seed_event_results.csv`, `seed_event_result_participants.csv`, `seed_persons.csv`

### Pipeline scripts

Built and operational, owned by the historical-pipeline track (coordinate before touching): the event-results pipeline (`legacy_data/event_results/scripts/`, seed build / load / verify), the club and member scripts (`legacy_data/scripts/`, extraction and seed loading including `name_variants`), and the club classification and bootstrap builders (`legacy_data/clubs/scripts/`). Per-script detail lives in `legacy_data/CLAUDE.md` and the `legacy_data/runbooks/`.
---

## 17. Migration vs operational table classification

The whole pre-go-live build pipeline is build-time tooling, not a runtime system: mirror extraction, canonical CSV generation, the club/event/person loaders, and the curator seeder build the database before go-live, and the legacy-account import runs once at cutover on the final export (State 4). After cutover, none of it runs against the persistent production DB again; the DB is the sole source of truth, and data changes are operational (member and admin actions, and data-preserving migrations via `scripts/deploy-migrate.sh`), not pipeline rebuilds. The table-level expression is the classification below: migration-only staging is dropped once it has served its purpose; operational tables persist.

| Table | Category | May be dropped |
|---|---|---|
| `members` | Permanent operational | Never |
| `legacy_members` | Permanent archival | Never. Persists as the permanent archival record of every legacy account, claimed or unclaimed. PII is purged only via member account deletion, which clears claim-state columns; the snapshot row itself remains. |
| `historical_persons` | Permanent operational | Never. Public historical-record source; populated from the human-curated CSV plus mirror-extracted club-only members. |
| `member_tier_grants` | Permanent operational | Never. Append-only ledger; the active-tier read model derives from this. |
| `member_declared_anchors` | Permanent operational | Never (§15.17) |
| `legacy_club_candidates` | Migration-only staging | Yes, after all onboarding-visible and dormant clubs are either created or abandoned, and all bootstrap decisions are finalized |
| `legacy_person_club_affiliations` | Migration-only staging | Yes, after all affiliation suggestions are resolved |
| `club_bootstrap_leaders` | Operational, migration-origin | Yes, after all provisional rows reach a terminal state (`claimed`, `superseded`, or `rejected`) |
| `member_club_affiliations` | Permanent operational | Never |
| `name_variants` | Permanent operational | Never (name-matching utility; see §15.15) |
| `auto_link_staged_candidates` | Migration-only staging | Yes, after all staged candidates resolve (member confirm, member decline, or expiration of the staging window) (§15.20). |

---

## 18. Audit requirements

No migration dashboard is required. The existing append-only audit history records all migration events.

Scope note: this section enumerates migration-specific events only. General auth audit events share the same append-only audit history and are cataloged in DATA_MODEL. Event names follow the platform's dotted `domain.event` convention; the two claim-completion events below are already emitted under these names.

Required event types:

Auto-link and member-confirmed claim:

- `legacy.auto_link_candidate_staged`: batch or registration-time pass staged a candidate for a live member.
- `legacy.auto_link_candidate_confirmed`: member confirmed a staged candidate via the wizard.
- `legacy.auto_link_candidate_declined`: member declined a staged candidate.
- `legacy.auto_link_candidate_expired`: staged candidate aged out without member action.
- `legacy.cross_source_candidate_offered`: after a first-source confirm, the platform offered an inline second-source candidate.
- `legacy.cross_source_candidate_confirmed`: member confirmed the second-source candidate.
- `legacy.cross_source_candidate_declined`: member declined the second-source candidate.
- `legacy.registration_conflict_prompted`: surname collision detected at signup against an already-claimed record.
- `legacy.registration_conflict_disputed`: registrant invoked the dispute path from the conflict prompt.

Claim completion (one event per claimed source; emitted today):

- `claim.legacy_account`: legacy-account claim completed, whatever the path (wizard candidate confirm, token round-trip, transitive via a back-linked historical-person claim, admin recovery).
- `claim.historical_person`: direct historical-record claim completed, with or without transitive legacy-account claim.
- `claim.historical_person_blocked`: surname rule rejected the claim server-side.

Optional mailbox-control round-trip:

- `legacy.mailbox_link_token_issued`: confirmation link generated and sent to a declared old email.
- `legacy.mailbox_link_token_consumed`: member clicked the link; evidence tier upgraded.
- `legacy.mailbox_link_token_expired`: token aged out without click.

Member-initiated admin link request:

- `support.help_request_submitted`: member submitted a help request with evidence.
- `support.help_request_approved`: admin approved the request and applied the link.
- `support.help_request_rejected`: admin rejected with a reason.

Dispute and revert:

- `claim.dispute_opened`: dispute filed against a confirmed claim (inline conflict prompt or admin route).
- `claim.revert_applied`: admin reverted a previously-confirmed claim; back-link columns cleared, tier grant revoked.

Club bootstrap:

- `club.bootstrap_created`
- `club.bootstrap_promoted`
- `club.bootstrap_superseded`

Required metadata per event where applicable:

- Active member ID
- `legacy_member_id`
- Masked `legacy_email`
- Anchor(s) that matched (modern email, declared old email, declared former surname, current real-name surname)
- Evidence-strength tag per §15.19 (every confirmed-claim event)
- Merge field summary (for completed claims)
- Tier-change summary (for completed claims)
- Club IDs involved (for bootstrap events)
- Admin reason / verification note (for admin-help and dispute events)
- Original claim audit row identifier (for revert and dispute events)

---

## 19. What we need from the legacy-site webmaster

Steve, the legacy-site webmaster (contact at `brat@footbag.org`, DD §5.5), is the current operator of the live legacy site. The front-matter open-questions table carries the live status of the webmaster items below; this section holds the contract-grade detail. The webmaster holds the legacy-system facts (DNS, mail, server config, data); Julie, the IFPA secretary, holds governance answers (membership policy, committees, records, rules currency). The written design in these canonical docs is the baseline; proposed changes arrive as specific doc-revision requests, and the maintainer keeps the canonical docs.

The webmaster is not asked to produce club data; that comes from the mirror pipeline (§20). The long-term operator pattern for coordinating with any external DNS/mail upstream is documented in `docs/DEVOPS_GUIDE.md` §6.8; this section applies that pattern to the webmaster's specific contract.

**Where answers are recorded.** As each item resolves, its facts are recorded in place rather than in a separate log: legacy server, stack, mail, and DNS facts inline in the relevant item here and in item 7; legacy-data schema and semantics (columns, status fields, id ranges, the per-app table catalogue) in §28 and §15.16; and quantitative validation results (row counts, import yields, coverage percentages) in `IMPLEMENTATION_PLAN.md` while in flight, with the permanent record in the data-review sign-off audit entry (§20 item 5, §18). Canonical timeless docs (DESIGN_DECISIONS, USER_STORIES) carry no counts or status.

### 19.1 Architecture decision

1. **Front-door architecture (AGREED: Option A)**: the legacy server keeps the `footbag.org` apex and reverse-proxies traffic to the new platform's CloudFront distribution. Verified workable: the distribution carries `footbag.org` / `www.footbag.org` as alternate domain names with the ACM certificate as the ownership proof (no DNS repoint needed); the proxy must send SNI and Host as the apex name; a pre-cutover smoke test (`curl --resolve` against a CloudFront edge IP) proves the full path before the flip. Consequences: cutover is the webmaster's proxy flip, rollback is his proxy revert, and the apex DNS move to Route 53 is deferred to a post-stability DNS-handover milestone. Client-IP visibility shifts to forwarded headers (the proxy must overwrite inbound `X-Forwarded-For` with the real client IP).

### 19.2 Legacy site and data export

2. **Legacy technology stack (known)**: a PHP application on MariaDB 10.1 (the delivered dump is a `10.1.48-MariaDB` `mysqldump`), served by apache2 with bind9 DNS and sendmail mail, per item 7. Established, so it no longer gates the export design: it confirms the export is a standard `mysqldump` and that Option A reverse-proxy suits the existing stack.

3. **Member count and activity (in the delivered dump)**: the account count and per-row last activity are present in the delivered dump (the `members` rows and the `MemberLastLogin` column; the import dry-run figures are tracked in `IMPLEMENTATION_PLAN.md` and the §28 catalogue). These size the auto-link candidate pool, the SES production-access volume estimate, and admin-recovery capacity planning. Webmaster confirmation is optional, not blocking.

4. **Legacy hosting**: where is the legacy server hosted? (Self-hosted, VPS, cloud provider, shared hosting.) What are the uptime expectations across the milestone-bounded parallel window, given that under Option A the server fronts the apex?

5. **Payment provider (resolved, no webmaster action)**: the legacy payment app integrates Authorize.Net (not Stripe), with no recurring-billing integration (Authorize.Net ARB / subscriptions) in the code, so there are no active subscriptions or recurring donations to carry over. The new platform runs its own Stripe payment system and imports no legacy payment integration or billing state; legacy payment history (`ifpa_memberpayments`, `ifpa_membership_transactions`) is read only for tier derivation, not for payment continuity. Nothing is needed from the webmaster on payments.

6. **Test export (DELIVERED, validation pending)**: a full export of live legacy member records for validation purposes only (no production changes). The webmaster has delivered the legacy data; the historical-pipeline maintainer is analyzing it. It unblocks all data-quality validation, auto-link coverage projections, and tier-mapping decisions; items 7-13 below now run as validation checks against the delivered data rather than as requests.

7. **Export delivery format**: the webmaster delivers a raw per-module MariaDB dump (`mysqldump`), the same format for the test export and the final production export. The platform owns the conversion: the extraction step (legacy_data track) parses the dump, drops credential and session columns, and emits the loader input in canonical form (CSV, UTF-8 encoded, LF line endings, RFC 4180 quoting, empty string for NULL, ISO 8601 dates as YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, comma delimiter). That canonical CSV is an internal artifact, not a separate webmaster deliverable. The source is the webmaster's private GitHub repository (per-app `create.sql` schemas plus `backups/latest.sql` dumps), which holds clear-text passwords and PII and must never be made public or gain collaborators without the webmaster's approval; the platform reads it strictly read-only and never republishes it. Server configuration not in the repository (sendmail and anti-spam, apache2, bind9 DNS) is supplied separately by the webmaster, since it cannot be mined from the dump.

8. **Field semantics confirmation**: for each export column, especially:
   - Legacy member ID (field name, format, uniqueness guarantee)
   - Legacy username (confirm the exact column name, e.g. `MemberAlias`, and its uniqueness guarantee, so the extractor maps it rather than dropping it)
   - Legacy email (field name, uniqueness guarantee), including any secondary email columns (`MemberEmail2`, `MemberEmail3`) and a deliverability flag (`MemberEmailInvalid`): confirm which ship in the final export, since a legacy account's primary and secondary emails all participate in claim matching
   - Account registration / signup date (distinct from `ifpa_join_date`; tracks tenure on the legacy site)
   - Last-activity timestamp (most-recent login or session activity, if available; used to size the member-initiated admin help request queue (§13) and admin-recovery capacity planning)
   - Tier / membership fields (current tier, expiry dates, tier history if available)
   - Account-status flags of any kind: `banned`, `inactive`, `is_admin`, `suspended`, `locked`, `deleted`, `expired`, `lapsed`, `no_contact`, privacy/visibility flags (e.g. `hidden`, `private_profile`), opt-out flags, and any other column on the legacy `members` table whose value gates eligibility for self-serve claim, opens admin-recovery paths, or affects what the member sees on the legacy site. Confirm presence, reliability, and semantics for each. If unsure whether a column counts, include it.

9. **Credential exclusion**: password material is never imported (DD §3.9). The raw dump contains credential and session columns (the legacy `members` table carries `MemberPassword` and `MemberSession`); the platform's extraction step drops them and never emits them into the loader input. As a hard backstop, the load step aborts before reading any row if any column header looks credential-bearing (password, hash, salt, secret, recovery, and the session/token/cookie/auth family, so a `MemberSession` or cookie column is caught too); attestation alone is insufficient, so this guard is mandatory.

10. **Namespace agreement for `legacy_member_id`**: confirm that the integer IDs in the export are the same integers used in the legacy site's `members/profile/{id}` URLs (the mirror-derived namespace). If they diverge, resolve before any test import; otherwise every `historical_persons.legacy_member_id` → `legacy_members.legacy_member_id` back-link in the pipeline is invalidated.

11. **Namespace verification protocol**: every `legacy_member_id` value from the test export is integer-format-validated and cross-referenced (comprehensive 100% reconciliation, not a sample) against the mirror-derived baseline ID range and `historical_persons.legacy_member_id`. The webmaster's export ID range and the mirror's must overlap; new IDs that exist only in the export are expected (post-mirror accounts) but the overlap region must agree row-for-row.

12. **Banned-member product semantics**: confirm whether the `banned` flag is reliable and document the operational handling. Default product behavior (§8 claim ineligibility, §13, §28 item 5): the legacy banned flag is recorded as audit metadata only and does not gate the self-serve claim card; disciplinary state is handled by the new platform's own discipline mechanisms, not by legacy ban state. The one admin-routed case is the Gate G3 FAIL path (§15.5): when the export carries no trustworthy banned field, rows with an untrusted banned/inactive indicator are routed to admin review because the platform cannot auto-apply a flag it cannot trust. The `legacy_banned` flag is not directly UI-visible to the claiming member. Whether to introduce gating for trustworthy bans is an open policy item pending webmaster and IFPA board input (§28 item 5); the audit-only default stands until then.

13. **Data-quality metrics (computed from the delivered dump, not webmaster requests)**: the deliverability estimate derives from the delivered `MemberEmail`/`MemberEmail2`/`MemberEmail3` columns and the `MemberEmailInvalid` flag (syntax plus MX checks), informing auto-link coverage projections; the last-activity timestamp is the delivered `MemberLastLogin` column, informing admin-recovery capacity planning. The legacy `bounces` table arrived empty, so any bounce-history refinement of the deliverability estimate is a separate optional ask.

14. **Final production export**: after write freeze, a fresh raw MariaDB dump, identical format to the test export.

### 19.3 DNS and infrastructure

15. **Zone authority and apex capability (deferred to the DNS-handover milestone)**: the webmaster, a DNS expert, holds and operates the zone through cutover; under the agreed Option A the apex does not move at cutover, so apex ALIAS capability is not cutover-blocking. Before the post-stability DNS-handover milestone: identify the registrar and authoritative provider, and plan the zone migration to Route 53 (a multi-day operation affecting all `*.footbag.org` records) with mail records copied from a zone snapshot.

16. **Legacy subdomain inventory**: enumerate every `*.footbag.org` subdomain that must continue resolving at the legacy host through cutover and beyond. `archive.footbag.org` is reserved for the new platform per §29.15. Full inventory needed, from the webmaster, not the repo (the mirror does not represent DNS or server config). A known candidate to confirm and disposition is `lists.footbag.org` (the frozen read-only majordomo listserv archive, 1994-1999). The operator-only `sites.footbag.org` proxies a set of WordPress sites (years of Worlds event sites) that must keep working (front-matter question 22), and a live MediaWiki at the `/reference/` path is a retained service whose database is not yet delivered (front-matter question 23). Any private operator-only subdomain must be flagged private and not-for-publication. Media reachable only by direct `video.`/`photo.` file paths is handled under §29.15 (archive completeness), not retained as a subdomain.

17. **Records-actor (AGREED: the webmaster)**: the webmaster applies maintainer-supplied records to the zone. The records are: the ACM validation CNAMEs (permanent; they also drive renewals), the SES DKIM CNAMEs (permanent), the SPF and DMARC TXT records (applied on email-transition day per §29.12a), the `footbag.org` MX repoint to Google (email-transition day), and the `archive.footbag.org` record pointing at the archive distribution. The apex itself does not move at cutover under Option A.

18. **Cutover coordination**: confirm the front-door flip sequence per §29.12 (smoke test green, then proxy flip, then the §27 monitored window) and the separately scheduled email-transition day (§29.12a). DNS TTL choreography applies to the MX flip and the later DNS handover, not to the front-door flip, which is a proxy-config change.

19. **Secondary contact and unavailability protocol**: confirm a secondary contact (phone, alternate email, or named delegate) reachable on demand during the email transition and through the §27 48-hour window after the front-door flip. The secondary is empowered to revert the proxy config or apply pre-supplied DNS records if the webmaster is unreachable during an incident.

20. **TLS health on retained subdomains across the parallel-role window**: every retained `*.footbag.org` subdomain (per item 16) must serve HTTPS for the duration of the parallel-role window because the new-platform session cookie widens to `Domain=.footbag.org` per §29.15 and is sent to every retained hostname. A lapsed TLS certificate on any retained subdomain leaks the session token in cleartext on every request to that hostname. Coordination: the webmaster commits to renewing before lapse; the maintainer runs a daily external expiry probe with alarms to both parties (§29.16).

### 19.4 Email

See §28 "Email transition" for the full consolidation: one mail system, never two; the email transition is its own atomic step (MX to Google, SPF/DMARC flip to SES-only, legacy mail server retired inbound and outbound), strictly before the front-door cutover. The coordination items specific to the webmaster:

21. **Email inventory**: the address enumeration is derivable from the delivered members dump via the legacy alias subsystem (`members/admin/dumpaliases.php`) plus the role addresses in the legacy code; the webmaster supplies the usage facts the dump cannot, and any apex aliases configured in sendmail outside the codebase. Which `@footbag.org` mailboxes and aliases are actively used vs. dead or spam-only? Record each address with: the address; its domain; whether it is a real mailbox, a forwarding alias, a forwarding rule, or a mailing list / group; who owns it; who receives mail sent to it; whether it is active, dead, or spam-only; whether anyone needs to send or reply from it; whether its history must be archived; whether it needs moderation; what its Google Workspace or Google Group equivalent will be; the decision to retain, migrate, or retire it; and a test that confirms delivery before any MX change.

22. **Mailing list inventory**: the list software and locations are identifiable from the repo (the `announce`/`members` lists generated from members-table opt-in flags by `dumpaliases.php`; the IFPA committee and group lists on the `@ifpa.footbag.org` `wrapper/` server; the public discussion lists footbag, freestyle, and sewing on Majordomo at `list.footbag.org`); the webmaster confirms which remain active and the disposition of each. Are there complex features (moderation, archives, digests) or are they simple distribution lists? Recommended classification: for each list, determine whether it accepts inbound posts from subscribers (discussion) or is broadcast-only. The platform sends outbound via SES and accepts no inbound mail, so inbound/discussion lists must move to a Google Group (Google owns inbound and redistribution) or be retired, while broadcast-only lists become platform announce; settle each before the MX flip so nothing consuming an `@footbag.org` address goes dark. IFPA `@ifpa.footbag.org` list mail is dispositioned separately under §29.12a (IFPA list mail), not as part of the ordinary `@footbag.org` inventory.

23. **Mail server platform (known)**: sendmail with virtusertable-based forwarding, per item 7 and the `members/admin/dumpaliases.php` alias subsystem; the IFPA `@ifpa.footbag.org` list host is the sendmail-tied `wrapper` (§29.12a). No webmaster input is needed for the platform identity; migration planning proceeds from this.

24. **Email-transition date and gap tolerance**: agree the date of the atomic email switchover, scheduled once provisioning (items 21-25, every active address live on Google) is verifiably complete and strictly before the front-door cutover. Confirm the still-live legacy site tolerates having no outbound mail during the short gap between email day and front-door day (password resets and any other legacy transactional sends stop at the switchover).

25. **Mailbox type**: are any `@footbag.org` addresses real mailboxes that people log into (IMAP/POP), or are they all forwarding aliases? Determines whether a managed provider with mailbox hosting is needed or if simple forwarding/alias configuration suffices.

### 19.5 Feature continuity

26. **Group, committee, and mailing-list continuity**: inventory every group, committee, and mailing list active on the legacy site. For each, propose the cutover allocation: (a) stays on legacy parallel-role server (continues to receive mail through the legacy mail server, continues to be addressable through the webmaster's retained subdomains); (b) migrates to the new platform pre-cutover (requires a new-platform feature build, scoped separately from this MP); (c) is retired with consent. Default per item: stays on legacy parallel-role server unless the webmaster and maintainer agree the function must migrate or retire. No item goes dark at T-0 (per §29.12a constraint 5). IFPA `@ifpa.footbag.org` list functions and the legacy group-message archive are excluded from this generic allocation and are dispositioned under §29.12a (IFPA list mail / sealed legacy email archive); their disposition authority rests with IFPA governance. Each inventoried item is recorded with: name/address; purpose; owner; moderator (if any); current activity status; current users/stakeholders; whether archive/data exists; sensitivity; spam level; recommended disposition; whether notification is required; whether a new user story is required; and whether it is a go-live blocker.

27. **Tournament in a box**: see §28 "Tournament in a box" for the full set of open questions. The webmaster must define what the legacy tournament management feature does today before it can be placed in the phased feature scope.

28. **Forum retirement**: when is the webmaster comfortable retiring the legacy forums? The new platform will not replicate forum functionality; legacy forum content goes to a read-only archive at `archive.footbag.org`. The webmaster is presently unsure of the live phpBB forum's state (whether it still runs, and whether already read-only), so confirming the forum content is locatable and extractable to a static mirror is a prerequisite to the archive plan.

34. **Legacy-feature disclosure (deliverable)**: the webmaster enumerates every function running on the legacy site, including pages, tools, crons, feeds, forms, and mail hooks, so nothing is discovered after cutover. The facts feed USER_STORIES gap-fill: the maintainer authors the stories, the webmaster supplies the facts. Anything the disclosure reveals that belongs in v1 is added to the v1 scope. A first installment has been delivered in narrative form (a legacy-repository walkthrough covering per-app schemas, data dumps, sub-domains, and mail systems); its facts are folded into the §28 dispositions and the item 16 subdomain inventory. Gate WM19.

35. **Legacy group activity**: which legacy groups, committees, and discussion lists are still actively used, and by whom? For each, establish last real (non-spam) traffic and active participants. This generalizes the §29.12a 12-month non-spam-traffic question from `@ifpa.footbag.org` aliases to all legacy groups. The community-requirements lead discovers; the webmaster supplies traffic facts. Feeds the item 26 inventory and allocation.

36. **Group communication home**: for group and committee communication, is the home the in-app group feature (designed in USER_STORIES §3.10, §6, §7, unbuilt), Google Groups, external chat, or a hybrid? Open pending the item 35 findings. Constraints: a group roster stays authoritative in-app because vote eligibility references `members_of_group` (USER_STORIES A_Create_Vote); any binding governance decision is recorded in an auditable system, never exclusively in a chat platform. No build proceeds until requirements are confirmed.

37. **Sanctioning workflow depth**: is sanctioning a deliberating committee (submit, review, discuss, decide) or admin approval, and is `sanctioning@footbag.org` actively used and read by whom? The community-requirements lead elicits the real process. Until confirmed, admin approval stands (USER_STORIES A_Approve_Sanctioned_Event) with admin override; `sanctioning@footbag.org` is provisioned on Google before legacy delivery is withdrawn so it stays live through transition regardless of any future workflow wiring.

### 19.6 Cutover operations

29. **Write-freeze coordination**: the legacy member-account database (the data being exported) enters read-only / no-new-registrations mode before the final export. Retained `*.footbag.org` services not in v1 scope (per §28 "Phased feature scope") may continue to operate per item 16 and §29.12a. Open coordination items, derivative of the phased scope, to be settled before §23 Phase 4: (a) how many hours before the final export the freeze begins; (b) the user-facing notice the legacy site displays during the freeze.

30. **Legacy database retention**: keep the legacy database available for at least 30 days after T+48h (the end of the §27 rollback window) for manual recovery reference. Total minimum legacy-host DB availability is therefore T-0 through T+48h + 30 days.

31. **Parallel-role end milestones**: the webmaster's temporary front-door, DNS, and retained-services role ends on milestones, not a calendar date: stable post-cutover operation, email transition complete, DNS handover to Route 53 executed, and every retained service migrated or retired. Agree the milestone list and a review cadence; items still required after the milestones must migrate to the new platform or be retired.

### 19.7 Community knowledge

32. **Impersonation risk magnitude**: how significant is the risk that a registrant picks a famous competitor's surname (or declares a former surname matching one) and confirms a card or a direct historical-record claim under a false identity? See §28 "For the legacy-site webmaster's community knowledge" for how this informs the platform's gate stance.

33. **Banned policy carryover**: what fraction of legacy bans represent ongoing community issues vs. stale historical bans that nobody would enforce now? See §28 "For the legacy-site webmaster's community knowledge" for how this informs the platform's banned-member handling.

### 19.8 Action sequencing

**Settled:** item 1 (Option A agreed); item 17 (the webmaster is the records-actor); item 6 (test export delivered, validation running); item 2 (legacy stack known: PHP/MariaDB/apache2/bind9/sendmail); item 3 (member count and activity present in the dump); item 23 (mail server is sendmail).

**Can proceed now, in parallel:** validate the delivered data (items 7-13); answer item 4 (hosting; payments resolved per item 5); answer items 21-22 and 25 (email and mailing-list inventories, mailbox types); answer item 16 (subdomain inventory); answer items 27 and 34 (tournament-in-a-box scope; legacy-feature disclosure); apply the ACM validation and SES DKIM CNAMEs (maintainer supplies values; needed early so certificate issuance and SES domain verification complete ahead of the transitions).

**Then, in order:** schedule and execute the email transition (item 24: provisioning complete, then the atomic MX + SPF/DMARC + legacy-mail-shutdown step); answer items 26, 28 (groups, committees, forums); answer items 18-19 (flip coordination, secondary contact); answer items 32-33 (impersonation risk, banned policy); agree the parallel-role milestones (item 31); agree write-freeze timing and notice text (item 29); produce the final production export (item 14); run the proxy-path smoke test; flip the front door.

**During the parallel window:** keep the legacy server running as front door and for retained services; maintain TLS certs on all retained subdomains (item 20); plan the DNS handover (item 15).

---

## 20. What we need from the historical-pipeline maintainer

The historical-pipeline work, with build state:

1. **Club extraction into pipeline** (built: `legacy_data/clubs/scripts/` implements §10.1 classification, affiliation and leadership inference, and bootstrap eligibility per the §2 bootstrap rule).
2. **Mirror member extraction** into `historical_persons` (~1,700 club-only members; loaders built, the extraction code itself is outside the repo, tracked in `IMPLEMENTATION_PLAN.md`). Field mapping: mirror member ID → `legacy_member_id`; mirror display name → `person_name` (NFKC normalization + suffix stripping per §4); mirror country → `country`; mirror first-seen year → `first_year` if present, else NULL; provenance recorded in `source` (`CLUB` / `MEMBERSHIP` / `RESULTS`) and `source_scope = 'PROVISIONAL'` (event-result rows carry `source_scope = 'CANONICAL'`). Conflict policy: a mirror member that duplicates an existing row is skipped and counted, via name-level dedup plus the unique index on `historical_persons.legacy_member_id` (constraint-violation skip); the existing row wins because event-result provenance is stronger than membership-only provenance.
3. **Known name variants table** (built; seeded from mined data per §15.15).
4. **World records CSV** (built; loadable per G15).
5. **Legacy-data analysis and review sign-off** (in progress: the delivered legacy data is under analysis). The sign-off confirms legacy data is complete and member-list presentation is reviewed (unblocks members ungating), recorded as an `audit_entries` row with `action_type='legacy_pipeline.data_review_signoff'`, the maintainer's identity in `actor_member_id`, and reference identifiers plus a free-text reasoning summary in `metadata_json`.

---

## 20a. What we need from the IFPA secretary (Julie)

Julie is the IFPA secretary. Steve knows how the legacy systems work; Julie knows how IFPA governs itself and what the community needs. She leads the discovery of what the old groups and committees are for and who still uses them, and she rules on what happens to old governance records.

1. **Which legacy groups are still alive, and who cares.** The legacy `ifpa_committees` table historically holds on the order of ~170 committee and group records (IDs run to 172, many likely inactive); a `CommitteeType` field separates a committee from a group, with `CommitteeValid` and `CommitteeIsOfficial` flags, and `ifpa_committee_members` lists who belonged to each. Find out which of these old groups, committees, and email discussion lists people still actually use, who runs or moderates each, and who would be upset if one changed or went away. Steve can say how much real (non-spam) mail each address still gets; Julie supplies the human picture: what each is for, the people involved, and who must be told before anything is retired or archived.

2. **What happens to the old IFPA vote records.** The legacy site holds old elections (`ifpa_elections`), the issues voted on (`ifpa_issues`), and every individually cast ballot (`ifpa_issue_votes` records each vote as a voter member id plus the choice and a timestamp, so the ballots are individually attributable, not anonymous). Deleting them is the simplest path, but they are governance records, so the decision is Julie's, not the operator's. The choices are: keep them, archive them, archive them encrypted and sealed so no one can read them, keep only the final tallies, or (only if she confirms it is acceptable) delete them. The recommended choice is to archive them encrypted and sealed and never publish them, because each ballot names its voter. Nothing is deleted without her decision.

3. **How sanctioning really works.** The new platform is designed for simple admin approval of an event's sanction. We need to know whether IFPA sanctioning is really a committee that discusses and decides together, or whether one or two people just approve it, and whether anyone still reads the `sanctioning@footbag.org` address (which appears nowhere in the legacy application code). That tells us whether simple admin approval is enough or needs to become a committee workflow.

4. **Where group conversation should live.** Each legacy committee already carried its own email list (the `CommitteeEmail` setting, with optional moderation, restriction, and archiving), so every group has a legacy mailing list behind this choice. For each group or committee, Julie recommends whether its discussion belongs in the new platform, in Google Groups, in an external chat tool, or nowhere (retired). The one firm rule: any decision that actually binds IFPA, such as a sanction or a vote, must be recorded somewhere durable and auditable, never left only in a chat app where it can vanish.

5. **Whether groups need moderators.** For any group we keep or move, does it need a real owner or moderator with powers over membership and posts, or is it enough to let admins and the community keep order informally? The legacy platform supported per-committee moderation, restriction, and archiving (the `ifpa_committees` table carries `CommitteeEmailModerated`, `CommitteeEmailRestricted`, and `CommitteeEmailArchived` flags), so some legacy groups were moderated; that precedent informs but does not bind the new-platform decision.

6. **Who to notify.** When something is retired or archived, who needs to hear about it, and how? This is aimed at the people who actually used it, not a message to every old member.

7. **Running the email side.** Julie helps administer the IFPA Google Workspace alongside a platform maintainer, including the group, alias, and spam settings once we know which groups and addresses we are keeping.

---

## 20b. What the project manager (Dave) does

Dave is the project manager and the primary maintainer. Steve, Julie, and the historical-pipeline and freestyle maintainer each supply facts and decisions in their own areas; Dave pulls those together, keeps the written plan current, and drives the work to go-live. His actions:

1. **Run the action tracker.** Own and curate the GitHub issues and project board as the single place open work is tracked. Once Steve and Julie respond, turn their findings into issues and keep the board current.

2. **Keep the stakeholder documents.** Set up and maintain the shared Google Docs that Steve and Julie can comment on (a review copy of this plan, a running list of open questions and decisions, and the inventory of legacy groups and addresses), and fold their resolved comments back into the canonical plan here.

3. **Drive the open questions to decisions.** Take each open question (the ones for Steve in §19, for Julie in §20a, and items 35-37) to an answer, record the decision, and update the canonical docs to match.

4. **Decide scope and sequencing.** Decide what ships in the first version versus later, what becomes a go-live blocker, and what is deferred.

5. **Author the user stories.** Turn the facts Steve and Julie supply into user stories, including any new ones the discovery turns up, for example a sanctioning-committee workflow if Julie confirms one is needed.

6. **Coordinate the sources and route governance decisions.** Keep Steve (legacy facts), Julie (governance and community), and the historical-pipeline and freestyle maintainer (all legacy data) aligned, and route any decision about deleting or releasing IFPA governance records to Julie's IFPA ruling rather than deciding it himself.

---

## 21. Design decisions affected

The migration-driven design decisions live in `docs/DESIGN_DECISIONS.md`: the three-table identity model (DD §2.4), the name model (DD §2.10), competition history fields (DD §2.11), account security tokens (DD §3.8), migration security and privacy rules (DD §3.9), and legacy data migration including the stage-and-confirm claim flow (DD §6.5, §6.5a).

---

## Part C -- Go-live

## 22. Go-live blocker index

All pass/fail go-live blockers in one view. Gate definitions and failure handling live in the referenced sections. Each entry shows the blocker ID, a one-line criterion, the section with full detail, and the operational-state transition it blocks.

This list is comprehensive for go-live cutover blockers. Broader product work that does not gate cutover lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and the active-slice trackers in `IMPLEMENTATION_PLAN.md` files.

### Data-quality, pipeline-output, and code-behavior gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| G1 | No email value shared across accounts, taken across `legacy_email`/`legacy_email2`/`legacy_email3` | §25 | State 2 → State 3 |
| G2 | `legacy_user_id` unique where non-NULL | §25 | State 2 → State 3 |
| G3 | Trustworthy `banned` field in export | §25 | State 2 → State 3 |
| G4 | Profile/contact field shape and null quality | §25 | State 2 → State 3 |
| G5 | Legacy member ID quality | §25 | State 2 → State 3 |
| G6 | Tier-state mapping inputs | §25 | State 2 → State 3 |
| G7 | Mirror-derived club normalization quality (requires G12 PASS first) | §25 | State 2 → State 3 |
| G8 | High-confidence bootstrap leader candidates | §25 | State 2 → State 3 |
| G9 | Bootstrapped clubs produce valid pages | §25 | State 2 → State 3 |
| G10 | Outbox → SES → inbox smoke passes end-to-end | §25 | State 3 → State 4 |
| G11 | `name_variants` seeded (~385 mined pairs generated; high-confidence subset ~303 loaded, ~82 medium-confidence deferred; seed files track exact counts) | §25 | State 1 → State 2 |
| G12 | ~1,700 club-only persons extracted into `historical_persons` | §25 | State 1 → State 2 |
| G13 | `club_bootstrap_leaders` populated | §25 | State 1 → State 2 |
| G14 | `persons.csv` count reconciled | §25 | State 1 → State 2 |
| G15 | World records platform export produced | §25 | State 1 → State 2 |
| G16 | `run_pipeline.sh full` produces full output | §25 | State 1 → State 2 |
| G17 | Claim flow anti-enumeration invariant holds | §25 | State 2 → State 3 |
| G18 | Rate limiting active on claim / registration / password-reset | §25 | State 2 → State 3 |
| G19 | Wizard claim task universal; all evidence tiers exercised at test load | §25 | State 2 → State 3 |
| G20 | Data review sign-off: legacy data complete, member-list presentation reviewed; recorded as an audit_entries row | §25 | State 1 → State 2 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | §25 | State 1 → State 2 |
| G22 | Optional mailbox-control round-trip to declared old email verified end-to-end; evidence-tier upgrade audited | §25 | State 2 → State 3 |
| G23 | Multi-anchor candidate matching covers modern email + declared old emails + declared former surname + current real-name surname; `name_variants` in play | §25 | State 2 → State 3 |
| G24 | Batch auto-link candidate-staging SYS job ready to run at cutover (stages candidates only; no live-table mutation, no emails) | §25 | State 3 → State 4 |
| G25 | Direct historical-record claim affordance live: first-name warning UX, surname-mismatch messaging (current + declared former), audit metadata with evidence tier | §25 | State 2 → State 3 |
| G26 | Member-initiated admin help request wired (structured evidence intake, admin review surface, audit on approval) | §25 | State 2 → State 3 |
| G27 | Multi-record candidate ambiguity count measured against test load and within wizard confirmation throughput (or `name_variants` pruned) | §25 | State 2 → State 3 |

### External dependencies

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| EX1 | `footbag.org` domain owned by IFPA; front-door routing to the new platform agreed and verified (Option A proxy; no DNS repoint at cutover) | §23 Phase 4 prereqs; §29.12 | State 3 → State 4 |
| EX2 | SES production access granted for AWS account | §23 Phase 4 prereqs | State 3 → State 4 |
| EX3 | `footbag.org` verified as SES sender identity at the domain level via DKIM CNAMEs in the zone (per §29.12a MX disposition) | §29.5 | State 3 → State 4 |
| EX4 | ACM certificate for `footbag.org` issued in `us-east-1` and attached to CloudFront | §29.9 | State 3 → State 4 |
| EX5 | Stripe production live API keys + webhook secret in Parameter Store; webhook endpoint configured; one end-to-end webhook delivery confirmed | §29.9 | State 3 → State 4 |
| EX6 | SES bounce/complaint SNS subscription tested with synthetic bounce; hard-bounce suppression confirmed in app | §29.5 | State 3 → State 4 |
| EX7 | Email transition complete as one atomic step before the front-door cutover: all active `@footbag.org` addresses provisioned on Google from the confirmed inventory, MX repointed to Google, SPF/DMARC flipped to the SES + Google senders, legacy mail server retired inbound and outbound, inbound delivery verified end-to-end | §28, §29.12a | State 3 → State 4 |

### Legacy-site webmaster coordination

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| WM1 | Test export delivered and validated in the canonical format | §19 items 6, 7 | State 1 → State 2 |
| WM2 | Legacy-export field semantics confirmed (IDs, username, email, registration date, last-activity, tiers, banned flags) | §19 item 8 | State 1 → State 2 |
| WM3 | Credential exclusion enforced: extraction drops `MemberPassword`/`MemberSession`; load-step credential-header abort verified | §19 item 9 | State 1 → State 2 |
| WM4 | Namespace agreement for `legacy_member_id` confirmed and verified by a comprehensive (100%) integer-format + cross-source overlap check | §19 items 10, 11 | State 1 → State 2 |
| WM5 | Banned-member product semantics confirmed; admin-recovery routing documented | §19 item 12 | State 1 → State 2 |
| WM6 | Data-quality metrics delivered (deliverability estimate, last-activity timestamps) | §19 item 13 | State 1 → State 2 |
| WM7 | Final production export delivered post-write-freeze, same raw-dump format as the test export | §19 item 14 | State 3 → State 4 |
| WM8 | Write-freeze / maintenance mode coordinated on legacy site (dependent on §28 phased feature scope) | §19 item 29 | State 3 → State 4 |
| WM9 | Legacy database retention committed (minimum 30 days after the 48-hour rollback window) | §19 item 30 | State 3 → State 4 |
| WM10 | Front-door flip coordination confirmed: T-7d notice, flip-day availability, and the §27 monitored-window coverage (no DNS TTL choreography applies to the flip) | §19 item 18; §29.12 | State 3 → State 4 |
| WM11 | Legacy subdomain inventory enumerated and recorded; allocation between legacy host and new platform agreed (dependent on §28 phased feature scope) | §19 item 16 | State 3 → State 4 |
| WM12 | Parallel-role end milestones agreed and recorded (stable operation, email transition complete, DNS handover executed, retained services resolved), with a review cadence | §19 item 31 | State 3 → State 4 |
| WM13 | `footbag.org` zone registrar and authoritative-DNS provider identified; Route 53 zone migration planned with a fresh zone snapshot (relevant at the post-stability DNS-handover milestone, not at cutover) | §19 item 15; §29.12 | DNS-handover milestone (post-cutover) |
| WM14 | Records-actor agreed (the webmaster); maintainer-supplied records applied on schedule: ACM validation CNAMEs and SES DKIM CNAMEs early, SPF/DMARC TXT and the MX repoint on email-transition day, the `archive.footbag.org` record before cutover | §19 item 17 | State 3 → State 4 |
| WM15 | Secondary webmaster contact (phone, alternate email, or named delegate) documented and tested-reachable; unavailability protocol agreed covering the email transition, the §27 48h window, and the emergency apex-repoint procedure (zone access or delegate path) | §19 item 19; §29.12a | State 3 → State 4 |
| WM16 | Group, committee, and mailing-list continuity inventory complete with per-item allocation (legacy parallel role / migrate to new platform / retire); no item goes dark at T-0 (dependent on §28 phased feature scope) | §19 item 26 | State 3 → State 4 |
| WM17 | Webmaster commits to monitoring TLS expiry on every retained `*.footbag.org` subdomain across the parallel-role window; renewal before lapse | §19 item 20 | State 3 → State 4 |
| WM18 | Front-door architecture agreed with the webmaster (resolved: Option A) | §19 item 1 | State 1 → State 2 |
| WM19 | Legacy-feature disclosure complete (every legacy-site function/cron/feed/tool enumerated) and USER_STORIES updated with any gaps it reveals | §19 item 34 | State 3 → State 4 |

### Operational readiness gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| OR1 | Data backup and disaster recovery | §29.1 | State 3 → State 4 |
| OR2 | Observability and monitoring readiness | §29.2 | State 3 → State 4 |
| OR3 | Edge and origin security | §29.3 | State 3 → State 4 |
| OR4 | IAM least-privilege scope-down | §29.4 | State 3 → State 4 |
| OR5 | Email deliverability operations | §29.5 | State 3 → State 4 |
| OR6 | Scheduled maintenance jobs | §29.6 | State 3 → State 4 |
| OR7 | Secrets rotation | §29.7 | State 3 → State 4 |
| OR8 | Production database restore drill completed against a copy of production data | §29.1 | State 3 → State 4 |
| OR9 | Post-launch admin curator authoring scheme designed and implemented, and the JSON-sidecar→DB source-of-truth switch covered by special tests (durability across a data-preserving deploy with no seeder run; admin-UI as sole authoring path; guard against seeding a persistent DB) | §29.14 | State 3 → State 4 |
| OR10 | Pre-flip DB snapshot captured, integrity-verified, restored against staging in dry-run | §29.1a | State 3 → State 4 |
| OR11 | Legacy archive subdomain reachable end-to-end (S3, CloudFront, signed-cookie key group, DNS, cookie-Domain widening) | §29.15 | State 3 → State 4 |
| OR12 | Retained-subdomain TLS health probe wired with alarms to maintainer and secondary webmaster contact; daily check; expiry-grace window configurable | §29.16 | State 3 → State 4 |
| OR13 | Curator content seeded into the production DB and media bucket before DNS cutover (`scripts/seed_fh_curator.py` plus `aws s3 sync`); post-deploy smoke confirms landing pages and curator-tagged surfaces resolve to the production bucket, not 404 | §29.13 | State 3 → State 4 |
| OR14 | Pre-cutover audit confirms every retained `*.footbag.org` subdomain (per §19 item 16) serves a valid HTTPS certificate matching its hostname; baseline reading recorded before cookie-Domain widening lands | §29.15, §29.16 | State 3 → State 4 |
| OR15 | Proxy-path smoke test green from the legacy server: `curl --resolve` against a current CloudFront edge IP returns the apex page over the `footbag.org` certificate; first run at State 3, re-run green on cutover day before the flip | §29.12 | State 3 → State 4 |
| OR16 | Search-engine and crawler readiness: production `robots.txt` served and correct (allows all crawlers, names no private paths, points at the sitemap), per-page title / meta-description / canonical / social-preview tags rendered, XML sitemap and `llms.txt` published and the sitemap submitted to Search Console, non-production `X-Robots-Tag: noindex` verified, and the member-only legacy archive confirmed excluded from indexing | DD §4.10 | State 3 → State 4 |
| RD1 | Legacy URL forwarding redirect handlers cover all in-flight email patterns (`/members/profile/:legacyMemberId`, `/clubs/:slug`, forum threads) per §29.12b; sample-replay validation against a stored set of legacy URLs passes at test load | §29.12b | State 3 → State 4 |

### Code governance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| GV1 | GitHub `main` branch protection enforced (PR required, status checks must pass, linear history) | §29.10 | State 3 → State 4 |
| GV2 | At least one administrator account provisioned in production and login-tested | §29.10 | State 3 → State 4 |

### Compliance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| LEG1 | Privacy policy, Terms of Service, and cookie banner (if applicable) reviewed and accessible from the production site footer | §29.11 | State 3 → State 4 |

### Pre-cutover revert and rotation checklist

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| PC1 | JWT session TTL reverted to the DD §3.4 baseline (24h); staging observability-tuned values removed from production source path before the cutover deploy | §23 Phase 4 prereqs; §29.8 | State 3 → State 4 |
| PC2 | SES sender cutover to `noreply@footbag.org` | §29.8 | State 3 → State 4 |
| PC3 | Lightsail SSH firewall rule restore | §29.8 | State 3 → State 4 |
| PC4 | SES adapter set to live on production (`SES_ADAPTER=live`) once SES production access is granted | §29.8 | State 3 → State 4 |
| PC5 | Production Terraform reconciled before any apply: region default confirmed `us-east-1`; `terraform plan` reviewed and hand-created resources imported | §29.8 | State 3 → State 4 |
| PC6 | Preview fixture scrub | §29.8 | State 3 → State 4 |
| PC7 | Production-first-admin SSM-token route lands per DD §2.9 | DD §2.9, DEVOPS_GUIDE §20.8 | State 3 → State 4 |
| PC8 | First-admin bootstrap rehearsal on staging: provision via `scripts/admin-bootstrap-token.sh`, claim at `/admin/bootstrap-claim` with a non-admin account, confirm the token self-deletes | DEVOPS_GUIDE §20.8 | State 3 → State 4 |
| PC9 | TRUST_PROXY hop count verified per tier against the live proxy chain (staging: CloudFront → nginx = 2; production: legacy front door → CloudFront → nginx = 3): env value matches, and `req.ip` resolves to the real client under a spoofed `X-Forwarded-For` probe | DEVOPS_GUIDE §10 | State 3 → State 4 |
| PC10 | Built production image verified to stub `dist/dev-bootstrap/` and `dist/testkit/`: the runtime has no env gate at the import sites, so the build-time strip is the production guard for the dev-admin code | docker/*/Dockerfile | State 3 → State 4 |

### Retirement gate

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| R1 | QC subsystem retired (routes, code, tables, tests) | §30 | State 3 → State 4 |

---

## 23. Phasing

### Phase 1: No external data (done)

Name model, slug lifecycle, person links, historical name display, `first_competition_year`, `show_competitive_results`: built.

### Phase 2: Historical-data pipeline (largely done)

Club extraction, name-variants seeding, and world records are built (§20). Outstanding: mirror member extraction code lands in the repo, and the data review sign-off completes after the delivered-data analysis (§20 item 5).

### Phase 3: Needs the legacy-account data (in progress)

The delivered data is under validation (§25 gates). The code-side surfaces are built (the optional mailbox-link-click upgrade per §7 item 1, and the stage-and-confirm batch auto-link staging job with its staging table and cutover runner per §7 item 3, §15.20); what remains is the legacy-account data load and the data-side gates that clear against it (§25).

### Phase 4: Go-live

Scheduling constraint: go-live is sequenced to follow Worlds 2026, which runs on the legacy registration software (Decision 21); the cutover write-freeze and final export do not precede Worlds 2026.

External prerequisites that must land before Phase 4 starts:

- **Email transition complete** (§28, §29.12a): MX on Google, SPF/DMARC flipped to SES + Google, legacy mail retired, `SES_FROM_IDENTITY` at `noreply@footbag.org` (used by registration-verification, password-reset, optional mailbox-link-click round-trip, and other transactional mail; auto-link itself sends no email per §7).
- **SES production access granted** for the AWS account. Sandbox caps are 200 sends/day and require per-recipient verification; transactional mail (registration verification, password reset, optional mailbox-link-click) is incompatible with sandbox. Production access is an AWS support ticket with a typical 24-48h approval window; start early (see State 3 readiness checklist).
- **`footbag.org` verified in SES at the domain level** (sender identity for the entire domain via DKIM CNAMEs, per §29.12a MX disposition) and runtime-role `ses:SendEmail` IAM policy pinned to the `footbag.org` domain identity ARN (post-production-access, the recipient-identity permission check goes away, so the sender-only pin is sufficient and least-privilege). Outbound mail uses `noreply@footbag.org` as the FROM address; no separate verification of the `noreply@` mailbox is needed.
- **JWT session TTL at the DD §3.4 baseline** (24h). The TTL is a source-compiled constant, not a runtime config value; staging observability-tuned values are reverted by editing source and rebuilding before the cutover deploy. Allow source-change + deploy-cycle lead time when scheduling Phase 4.
- **Email-delivery smoke passes end-to-end** on the final pre-cutover release: enqueue a test row via the outbox, worker drains, SES accepts, recipient inbox receives. See §25 gate G10.
- **Lightsail SSH firewall rule restored** via `terraform apply` from `terraform/staging/` (removes Console override of the port-22 rule and returns to `operator_cidrs`-constrained ingress). See §29.8.
- **Curator content source-of-truth cutover** (DD §1.13): production curator media moves from the `/curated/` + seeder model to the persistent DB as source of truth. The admin UI writes curator content directly to the DB; the seeder is no longer run against production; data-preserving deploys use `scripts/deploy-migrate.sh`. See §29.14 (gate OR9).

Phase 4 activities:

- Front-door flip (§29.12)
- Members sign in to the new platform and see staged auto-link candidates surfaced via the wizard. Confirmation applies effects on a per-member basis. No batch outbound communication.
- Honors-bearing direct claims apply on confirmation; a-priori roster validation at test-load (§7) plus community self-policing and the dispute-revert path cover oversight (no daily email; the interactive feed is v2).
- Member-initiated admin help requests accumulate in their queue; admin processes at their own cadence.

---

## 24. Operational states

### State 0: Current state

- Legacy site live, accepting writes
- New platform deployed on staging
- Phase 1 code complete

### State 1: Historical-data pipeline complete

- `legacy_club_candidates` populated and classified per section 10.1 rules (pre-populate, onboarding-visible, dormant; junk excluded)
- `legacy_person_club_affiliations` populated
- Bootstrap eligibility decisions made for pre-populated clubs
- Review report reviewed; admin decisions logged for ambiguous cases
- Known name variants table seeded

### State 2: Phase 1 complete (test load)

- Legacy webmaster provides test export
- Imported legacy account rows inserted into staging `legacy_members`; no imported legacy account row is inserted into `members`
- Tier-mapping dry-run report generated for all imported legacy accounts; `member_tier_grants` rows are written only when a member confirms a candidate through the wizard, the optional mailbox-link-click round-trip, the direct historical-record affordance, or an admin-approved help request
- `legacy_email` and `legacy_user_id` uniqueness verified
- Banned field evaluated (recorded as audit metadata per §13; no claim-time gating)
- Club bootstrap candidates resolved against imported `legacy_members` rows
- `club_bootstrap_leaders` rows created in staging
- Batch auto-link candidate-staging pass run on staging (stages candidates; no live-table mutation; no notification emails)
- Full claim flow rehearsed end-to-end on staging through the wizard, declared-anchor entry, optional mailbox-link-click round-trip, and direct historical-record affordance
- All validation gates (section 25) evaluated

### State 3: Phase 2 complete (go-live preparation)

- Email transition complete per §29.12a: MX on Google with every active address provisioned, SPF/DMARC flipped to the SES + Google senders, legacy mail server retired inbound and outbound
- Front-door proxy configuration prepared with the webmaster; proxy-path smoke test green (§29.12)
- All migration scripts finalized
- Admin review of unresolved high-impact clubs complete
- Final cutover checklist confirmed
- Legacy webmaster briefed on final export and freeze timing
- SES production-access ticket filed and approved (24-48h lead time; see Phase 4 prerequisites)
- `footbag.org` SES domain identity verified (DKIM CNAMEs in the zone); `SES_FROM_IDENTITY` on the production host updated to `noreply@footbag.org`; runtime-role `OutboundEmail` IAM policy resource ARN set to the `footbag.org` domain identity
- Email-delivery smoke passes end-to-end (§25 gate G10)

### State 4: Phase 3 complete (production cutover)

1. Legacy webmaster places legacy site in write freeze / maintenance mode. **Timing constraint:** write-freeze must be instantaneous (site goes read-only at a coordinated moment), not gradual. Any member writes between "maintenance announced" and "maintenance enforced" appear in the final export but were not expected. The coordinated moment and the user-facing notice text are settled under §19 item 29.
2. Legacy webmaster produces final production export from the frozen database state
3. New platform imports legacy account rows into `legacy_members` via the export dump loader: schema-validates the export, aborts if any password-bearing column is present, applies the §2 source-validity filter with a counted exclusions report, and upserts over the mirror pre-seed flipping `import_source` to `'legacy_site_data'`
4. New platform runs the tier-mapping dry-run report script (read-only, in `scripts/`): a preview of what `member_tier_grants` would be written if all unclaimed legacy accounts were claimed today. No `member_tier_grants` rows are written during cutover; the report is read-only. Actual tier grants are written later, one row per member-confirmed claim, when each member completes the wizard's claim task after step 12 opens sign-in.
5. New platform creates bootstrapped `clubs` rows for approved candidates
6. New platform creates `club_bootstrap_leaders` rows
7. New platform runs batch auto-link candidate staging (no live-table mutation; results surface to members at next sign-in via the wizard)
8. New platform runs post-import validation checks: row-count reconciliation and the §25 data-quality gates re-confirmed against the final import, before the step 9 snapshot
9. Pre-flip DB snapshot captured per §29.1a (load-bearing artifact for the rollback path B in §27; integrity verification automated)
10. Front-door flip: the webmaster switches the legacy server's reverse proxy to route apex and `www` traffic to the new platform's CloudFront distribution (see §29.12). The flip is gated on the proxy-path smoke test from State 3 re-run green on the day.
11. Admin verifies the new platform is operational (smoke checks, critical flows confirmed, including one real end-to-end outbox → SES send to a verified admin inbox for transactional mail). If any critical smoke check fails, the admin evaluates against the §27 path B catastrophic-failure list before proceeding to step 12; non-catastrophic failures continue to step 12 with a fix-forward plan logged, catastrophic failures trigger path B per §27 (proxy revert + restore from the step 9 snapshot) and do not proceed to step 12.
12. Admin opens the new platform for member sign-in; staged candidates surface to members through the wizard's claim task as members log in.

### State 5: Post-cutover

- New platform live
- Legacy database retained by the legacy-site webmaster for reference and targeted recovery
- Members confirm their wizard-staged candidates over time as they sign in
- Members declare additional anchors (former surname, old emails) in the legacy-claim task (reached from their profile) as needed; the platform re-runs candidate matching against the new anchors
- Admins process member-initiated help requests (§13) and review the honors-bearing direct-claim oversight feed (§13)
- Leadership activations accumulate as members register and claim

### State 6: Migration complete

- All high-priority legacy accounts confirmed by their members or resolved through admin help requests
- All bootstrap clubs resolved or admin-reviewed
- The staged auto-link candidates table has drained (member confirms, declines, or expirations) and may be dropped
- Legacy database retired

---

## 25. Validation gates

The following must be confirmed at the test load before go-live. These are not open design questions; they are data-quality checkpoints.

| Gate | Description | Failure handling |
|---|---|---|
| G1 | No email value, taken across `legacy_email` / `legacy_email2` / `legacy_email3`, appears on more than one row (cross-column uniqueness); collisions surface a priori for curation | Replace provisional unique index with non-unique lookup + ambiguity handling |
| G2 | `legacy_user_id` is unique where non-NULL | Same as G1 |
| G3 | Live export contains a trustworthy `banned` field. **PASS**: the field is present and its semantics are confirmed reliable. **FAIL fallback**: omit the `legacy_banned` column entirely; route claims on unverifiable rows through admin review per §8 claim ineligibility. Whether the final export carries a banned field is pending the webmaster (front-matter item 17); until confirmed the FAIL fallback stands and the gate script verifies import-source provenance in its place. | Fallback path applies as described in §15.5 |
| G4 | Shape and null quality of profile/contact fields | Adjust import logic and field mapping |
| G5 | Legacy member ID quality: every `legacy_member_id` integer-format-validated and comprehensively (100%) overlap-reconciled against the mirror profile-URL ids and `historical_persons.legacy_member_id`, not a 10% sample | Resolve before final export |
| G6 | Tier-state inputs validated at test load: each of the five `legacy_*` tier-state fields (DATA_MODEL §4.14b) is spot-checked against reference cases. **PASS**: validated fields are populated and the claim-time mapping reads them; any field that fails validation is left unpopulated, so its basis does not fire (if the paid and board fields all fail, claims grant on honors alone). Held-back fields are recorded in §28. | Unvalidated fields left unpopulated; honors basis always applies |
| G7 | Mirror-derived club normalization quality. **Requires G12 PASS** so the classifier's `listed_contact` and `member_active` signals (§10.1 "Required order" step 1) run against the fully-populated `historical_persons` set including club-only members; running G7 against a partial `historical_persons` set silently under-classifies clubs whose people never competed | Block until G12 PASSes; increase manual review threshold for any remaining quality gaps after both gates clear |
| G8 | Sufficient high-confidence club-leader bootstrap candidates | Adjust bootstrap threshold or expand manual review scope |
| G9 | Bootstrapped clubs produce valid, non-broken club pages | Fix UI before go-live |
| G10 | Outbox → SES → recipient inbox path works end-to-end on the pre-cutover release (enqueue test row, worker drains within 60 seconds, SES returns MessageId, message arrives in recipient inbox) | Debug before cutover; common causes are IAM Resource scope, SES sandbox state, worker container env vars, worker event-loop bugs |
| G11 | `name_variants` seeded with the high-confidence mined pairs (~303 loaded of ~385 generated; ~82 medium-confidence deferred per §15.15) | Auto-link medium-confidence coverage drops; low-confidence admin queue expands; document shortfall in State 1 review |
| G12 | ~1,700 club-only persons extracted into `historical_persons` per §10.2 | Classification signals (active-players, contact-competed) run with reduced coverage; onboarding-visible list may shrink |
| G13 | `club_bootstrap_leaders` populated for pre-populated clubs meeting the §2 bootstrap rule | Leadership activation defers to path 2 (first affiliated member volunteers for leadership) for affected clubs |
| G14 | Canonical `persons.csv` row count reconciled against `historical_persons` population; any accepted discrepancy documented and signed off | Block at test load until reconciled; unexplained delta risks missing or duplicated historical identities |
| G15 | World records export produced in platform format and loads into the records schema cleanly | Records page launches empty or incomplete; fix export before go-live or hide the records entry point |
| G16 | `run_pipeline.sh full` produces events, results, persons, clubs (classified), bootstrap leaders, club-only persons, variants, and records in one run | Document the multi-step manual sequence required and capture sign-off at State 1; single-command regeneration is the long-term target |
| G17 | Claim flow anti-enumeration invariant holds per §8 "Non-revealing messaging" (identical UX across matched-none, matched-multiple, matched-ineligible, and matched-eligible, per §8's case list) | Collapse divergent response shapes before go-live; side-channel enumeration otherwise possible |
| G18 | Rate limiting active on identifier lookup, declared-anchor changes, claim confirmations, optional mailbox-link-click round-trip, registration, and password-reset per §8 (token mechanics per DD §3.8; numeric defaults owned by USER_STORIES) | Block go-live until limiters engage; declared-anchor enumeration and mailbox abuse otherwise unmitigated |
| G19 | Wizard claim task universally surfaces staged candidates and the declared-anchor prompt to every registrant per §7 and §14; all evidence tiers (`declared_anchor_only`, `currently_controls_modern_email_matching_legacy`, `mailbox_control_via_link_click`) exercised at test load. The `mailbox_control_via_link_click` tier is exercised via the G22 round-trip | Members without a stage-1 anchor match never get prompted to declare; legitimate claims are missed |
| G20 | Data review sign-off. **PASS**: an `audit_entries` row is present with the sign-off `action_type` and the historical-pipeline maintainer as `actor_member_id`, confirming that legacy data is complete and member-list presentation has been reviewed; this row unblocks members ungating. "Members ungating" = the sign-off row permits the historical-person record surfaces to ship with the platform; no runtime flag and no member directory exist (current-member enumeration is forbidden by the data-governance search rules). The cutover checklist asserts the row via its `G20-SIGNOFF` gate. **FAIL**: members ungating is withheld until the sign-off row exists. | Historical-pipeline maintainer owns sign-off per §20 item 5 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | Claim-lookup falls back to `legacy_member_id` only; auto-link candidate coverage drops because the email anchor is missing |
| G22 | Optional mailbox-control round-trip verified end-to-end at test load: declared old email → confirmation link issued → click consumes token and upgrades the audit evidence tier to `mailbox_control_via_link_click`; rate-limited per requesting member, per target row, per session/IP per §8 | Members cannot upgrade declared-anchor claims to hard-evidence; admin help requests carry more weight by default |
| G23 | Multi-anchor candidate matching covers verified modern email, declared old emails, declared former surname, and current real-name surname per §7; seeded `name_variants` table drives first-name variant resolution | Candidate coverage drops to email-anchor-only and admin-help-request volume rises |
| G24 | `OperationsPlatformService` batch auto-link SYS job ready to run once at cutover; the job stages candidates (no live-table mutation, no notification emails); one `system_job_runs` row recorded per run; audit-emission coverage verified at test load (one `audit_entries` row per `legacy.auto_link_candidate_staged` event). Idempotent: rerun produces no duplicate candidates. | If audit-emission coverage is incomplete, fix the audit emission path before declaring G24 PASS; without the staging job, candidate matching runs only at member sign-in and pre-cutover live members get no proactive surfacing |
| G25 | `/history/:personId/claim` confirm page renders the first-name-variant warning inline; surname-mismatch messaging is user-readable; audit metadata captures the evidence tier per §15.19 and any first-name variant used for direct-HP claims per §8 | Direct HP claim usable but klunky; surname-block failures surface as raw `ValidationError` text rather than the spec'd confirm-page warning |
| G26 | Member-initiated admin help request (§13) wired with structured evidence intake, admin review surface, and audit emission carrying `admin_vetted_evidence` on approval | Members stuck without an auto-surfaced candidate have no path forward; admin-recovery is informal |
| G27 | Multi-record candidate ambiguity count from the seeded `name_variants` table against the test-load `legacy_members` set measured and reviewed jointly by the primary maintainer and historical-pipeline maintainer; if the count exceeds the member-confirmation throughput the platform can comfortably handle, the `name_variants` seed is pruned before batch candidate staging runs at cutover | If unmeasured, members are presented with too many candidates per card and confirmation fatigue produces wrong-account confirmations |

**Tuning authority for G8:** Bootstrap threshold adjustments at test load are a joint decision between the primary maintainer and the historical-pipeline maintainer. Raising the threshold (more conservative) is routine and requires no additional sign-off. Lowering the threshold below a minimum acceptable value (to be set during State 2 review if lowering is needed) requires IFPA board sign-off, because lowering materially expands who gains bootstrap leadership and the live club-management permissions that follow at first claim.

---

## 26. Data quality from persons.csv analysis

Counts move with pipeline runs; the pipeline QC reports are authoritative. Verified against the current canonical outputs: `legacy_data/event_results/canonical_input/persons.csv` carries ~3,570 persons (the ~1,700 club-only cohort loads separately as PROVISIONAL rows per §10.2), and the generated `name_variants` seed carries ~385 pairs (gate G11; the seed file tracks the exact count).

One structural limitation worth keeping in view: first-name-change cases (a member who legitimately changed their first name, rather than a variant or spelling difference) cannot be caught by the variants table; they surface only when the member declares the change through the optional anchors (§15.17) or invokes the admin help request (§13).

---

## 27. Rollback posture

**Pre-flip:** abort, fix, retry. No data has moved yet.

**Post-flip path A, non-catastrophic failures (most cases):** fix-forward. Production deploys a patch; no rollback. Covers UI bugs, slow queries, non-critical alarm noise, and anything that does not corrupt member identity, claim state, or audit integrity.

**Post-flip path B, catastrophic failures (rare, narrowly defined):** front-door revert (the webmaster reverts the proxy flip, returning apex traffic to the legacy site) plus DB restore from the pre-flip snapshot. Catastrophic is one of:

- schema corruption that prevents reads;
- identity-data corruption that misroutes claims or auto-link writes;
- write-amplification that produces malformed audit or queue entries at scale;
- outbound communication that is incorrect or premature and cannot be recalled (e.g. a misfired Stripe webhook batch that grants or revokes tiers in error, or transactional mail sent under a regressed template that misidentifies recipients at scale). Note that path B does not actually un-send already-sent emails; it restores the DB state so corrective communication can be sent from a clean baseline.

Decision authority is the primary maintainer.

**Path B re-entry:** a path B revert returns the legacy site to authority and ends the write freeze; members may write to the legacy database again. A cutover retry is therefore a fresh State 4 run: a second coordinated write freeze, a fresh final export, a fresh import, and a fresh pre-flip snapshot. The reverted attempt's export and snapshot are not reusable.

The pre-flip snapshot is the load-bearing artifact for path B. It is captured as State 4 step 9 (after validation in step 8, before the front-door flip in step 10), so it includes the final import (step 3), the tier-mapping dry-run (step 4), the bootstrapped clubs and leaders (steps 5–6), and the staged auto-link candidates (step 7). Restore returns the database to this exact pre-flip state; staged candidates are present in the snapshot and surface to members when they sign in after the restore. It lives in the cross-region disaster-recovery bucket with S3 Object Lock (DEVOPS_GUIDE §16.3). Creation, integrity verification, and a successful dry-run restore against staging are preconditions; see §29.1a.

Path B does not recover from systemic bugs in the candidate-staging step itself, because those bugs' results are present in the snapshot. Staged-candidate defects are addressed by the per-member dispute path (§8) and admin revert (§13), and by the pre-cutover validation gates G23 and G24.

**Rollback window:** 48 hours post-flip. After 48 hours the new platform is authoritative regardless of what surfaces; reversal requires explicit joint sign-off from the primary maintainer and the legacy-site webmaster, and is treated as a manual recovery exercise rather than a rollback.

**Post-cutover monitoring posture (T+0 to T+48h).** The rollback window requires active monitoring, not passive waiting. No cutover-specific monitoring runbook exists yet; the following observables must be specified in `docs/DEVOPS_GUIDE.md` before cutover, with alert thresholds and escalation paths:

- HTTP 5xx error rate on the CloudFront distribution (baseline: 0; alarm: sustained >1% of requests over 5 minutes).
- Response latency at the origin (p95; alarm threshold TBD based on staging baseline).
- SES bounce rate and complaint rate (alarm: bounce >5% or complaint >0.1% of daily volume; SES auto-suspends sending at higher thresholds).
- Outbox queue depth: `outbox_emails` rows with `status='pending'` growing faster than the worker drains them (alarm: >50 pending rows sustained over 10 minutes).
- Login success rate: failed logins as a fraction of attempts (detects auth-chain defects; alarm threshold TBD).
- Claim-wizard conversion: candidates surfaced vs. claims initiated (no hard alarm; manual check at T+4h and T+24h to confirm the flow is working).
- Retained-subdomain TLS health: per gate OR12, daily probe on every retained `*.footbag.org` subdomain; first probe runs at T+1h, not T+24h.
- CloudFront cache-invalidation confirmation: verify `/*` invalidation completed within 60 seconds of T-0 (one-time check).

**Legacy DB retention:** the legacy-site webmaster retains the legacy database for at least 30 days after the 48-hour rollback window ends for reference and targeted manual recovery. This is sequential to and distinct from the 48-hour rollback window: retention enables one-off historical lookups by admin; rollback is the time-bounded path back to the legacy site as authority.

**Member writes lost on restore:** any claim, registration, or club-affiliation write that lands between snapshot capture and rollback is lost on restore. The 48-hour window plus the platform's traffic profile bound the affected count; affected members re-do the action after the platform stabilizes.

**Post-flip path A-prime, bounded business-logic defects:** admin-level data correction plus affected-member notification, without full platform rollback. Covers defects that corrupt a bounded set of records but do not meet the path B catastrophic threshold: incorrect tier-mapping for a subset of members, auto-link candidate staging that surfaces wrong matches for a subset of legacy accounts, club-bootstrap that assigns wrong leaders. The defect is in the data, not the schema or identity layer, and the affected population is enumerable. Remediation: admin identifies affected rows via the oversight feed (§13) or targeted query; applies per-record correction via admin tools; dispatches notification email to affected members explaining the correction. Path A-prime does not require a front-door revert, DB restore, or write-freeze. Decision authority is the primary maintainer; if the affected count exceeds 1% of migrated accounts or the defect cannot be corrected by record-specific admin actions, escalate to path B evaluation.

**No automated rollback** is provided after the front-door flip. Path B is operator-driven via the runbook in `docs/DEVOPS_GUIDE.md`.

---

## 28. Open issues

Webmaster-facing open questions live in the front-matter table; this section holds the internal detail behind them plus items that are wholly internal.

### Deferred to data validation

Decisions gated on what validation of the delivered legacy data reveals.

1. **`announce_opt_in`**: Test load confirms the field is present (`MemberAnnounceOptIn`, plus `MemberEmailOptIn`). Resolved: legacy mailing opt-in is not imported as active consent and no `members` column is added. The legacy flags are recorded as legacy metadata only; members set their subscription preferences fresh after claim via `M_Manage_Email_Subscriptions`, and unclaimed `legacy_members` rows are never active mail recipients. The legacy `members` table also carries per-field visibility flags (`MemberPublish`, `MemberPublishEmail`, `MemberPublishAddress`, `MemberPublishCity`, `MemberPublishPhone`); these follow the same rule, recorded as legacy metadata only and not imported as active visibility consent, since the new platform's privacy defaults and member-set visibility govern instead.
2. **`legacy_banned`**: Both the test load and the legacy `members` table schema show no banned/blocked/suspended/inactive column exists; the only status signals are `MemberValid` and `MemberEmailInvalid`. Gate G3 takes its FAIL fallback: the column does not land; questionable rows route through admin review (§8). Available negative signals are `MemberValid=0` and `MemberEmailInvalid`. See section 15.5.
3. **Tier-mapping fields on `legacy_members` (§15.16)**: test load confirms the tier/payment source inputs are present (`MemberIFPATier`, `MemberIFPAExpiration`, `MemberIFPAPrevExp`, `MemberIFPAPaid`, `MemberIFPAPaymentDate`, `MemberIFPAJoined`, `ifpa_memberpayments`); the five `legacy_*` columns are derived, not copied. Board-at-cutover data (precedence 1) was not in the delivered dump: the `groups/` committee-table backup (`ifpa_committees`, `ifpa_committee_members`) was held back for size and the webmaster will supply it, so the committee data exists and is pending delivery rather than unpopulated. The committee-table schema itself is in hand from the legacy `groups/` app: `ifpa_committee_members` links a `CommitteeID` to a member `CommitteeMemberID` with title, admin, and voting flags, and `ifpa_committees` carries a `CommitteeType` and `CommitteeIsOfficial` (groups and committees share this one table). The board-at-cutover derivation scaffold is therefore implemented and tested against the known structure: `extract_legacy_members.py` emits `legacy_was_board_at_cutover` and `legacy_board_underlying_paid_tier`, with all board logic behind the single constant `BOARD_IFPA_TIER_CODES`. It ships inert: the constant is empty, so the extractor makes no positive board determinations (it does not distinguish "unknown" from "not board"), and no schema or loader change has landed. Setting the constant requires confirming whether `MemberIFPATier` encodes Tier 3 and which code(s); once the committee rows are delivered, precedence 1 derives from the committee tables instead. The G6 `legacy_members` columns and loader wiring remain the integration step after the board signal is confirmed. If the board or paid-history derivation proves insufficient after delivery, those fields are left unpopulated and their standings do not fire, so affected claims grant on honors alone. Whatever is held back is recorded here with the test-load evidence that drove it.

### For the legacy-site webmaster's community knowledge

Decisions gated on the webmaster's read of community dynamics rather than on test-load data.

4. **Impersonation risk magnitude**: how significant is the risk that a registrant picks a famous competitor's surname (or declares a former surname matching one) and confirms a card or a direct historical-record claim under a false identity? The platform currently applies no platform gate for honors-bearing direct claims (§8): honors-bearing claims apply on member confirmation; admin sees them post-facto via the oversight feed (§13); the registration-time conflict prompt (§8) catches same-name collisions at signup. If the webmaster's read indicates impersonation is a meaningful concern, the platform may reinstate a gate (hold honors-bearing direct claims for admin verification) or move to a community-grace-window model (the claim is visible but flagable for N days before solidifying). Pending the webmaster's input, the no-gate stance stands.

5. **Banned policy carryover**: what fraction of legacy bans represent ongoing community issues vs. stale historical bans that nobody would enforce now? The current default treats the legacy banned flag as audit metadata only and does not gate the claim card (§13). If the webmaster and the IFPA board indicate many legacy bans are still meaningful, the platform may shift to one of: ban carries over silently (claim applies but new account starts in a restricted state); banned legacy accounts unclaimable self-serve (member contacts admin); claim held until board review. Pending input, the audit-metadata-only default stands.

### Authoritative club data cross-validation (deferred)

The delivered legacy dump carries authoritative club data the mirror pipeline currently infers: a `clubs` table (602 rows, with `Approved`, location lat/lon, and `ClubPlaysNet`/`ClubPlaysFreestyle`) and a `clubcontacts` table (1,400 member-to-club links carrying `ContactPriority`). The committed mirror-extracted source is `legacy_data/seed/club_members.csv` (~2,400 associations, §16). Where they overlap, an authoritative `clubcontacts` link is higher quality than a confidence-scored inference, and `ContactPriority` can seed leadership more reliably. This cross-validation is deferred (it touches the historical-pipeline track's scripts) and will be done as a coordinated quality pass. Deletion on the legacy site was soft (the `clubs.Approved` flag set false, never a row delete), so dormant and "deleted" clubs persist in the `clubs` table as unapproved rows rather than being absent; the mirror remains the source only for clubs that predate or never entered the live table. The `clubcontacts` join (`ClubContactID` to `members.MemberID`, `ContactClubID` to `ClubID`) is the authoritative member-to-club link.

### Legacy data domains present but unscoped

The delivered dump contains domains outside this plan. Recorded for a future scope decision; none is built without one.

| Domain | Dump rows | Disposition |
|---|---|---|
| Gallery / media | 16,768 images, 1,955 sets | Out of scope: served from `archive.footbag.org` (§29.15); not migrated |
| Freestyle tricks (`moves`) | 303 moves, 431 hints, 97 journals, plus `move_tip_votes` (footbag, incl. net moves) | Not imported: the new platform's freestyle dictionary is already more complete and is the authoritative source, so the legacy `moves` data is abandoned (`moves_journal` is per-member private if ever reconsidered) |
| IFPA governance | elections 187, issues 332, votes 10,497, payments 209 | IFPA governance decision (the IFPA secretary rules, not the operator): the election, issue, and privately-cast vote tables are recommended for archive + encryption, sealed and never published (the same treatment as the legacy email archive), since they hold privately cast votes; payments are already read for tier derivation; committee/board data is absent from the dump |
| Rankings | 12,672, plus 14 sets | No rankings surface scoped; decide whether it is a future feature |
| News | 17,682 | Decide archive-only vs import vs drop |
| Rules (`rulebook3`) | 1,619 | IFPA rules already live in `ifpa/`; likely archive-only |
| Polls | 11, plus 4,899 answers | Likely drop |
| Localization | ~561 across four tables | Legacy i18n; likely drop |
| FAQ (`FaqQuestions`/`FaqAnswers`) | legacy, rarely updated | Archive-or-drop; check first for any sanctioning or membership-tier policy references |

### Front-door architecture (resolved: Option A)

The maintainer and the legacy-site webmaster agreed on Option A: the legacy server keeps the `footbag.org` apex and reverse-proxies traffic to the new platform's CloudFront distribution (§19.1, §29.12). The accepted trade-offs: the legacy server is a critical-path availability dependency for the parallel window, apex TLS termination stays on the legacy server, and CloudFront edge protections see the proxy's IP rather than client IPs (per-IP rate rules must use forwarded headers; the proxy overwrites inbound `X-Forwarded-For`). In exchange: no DNS migration at cutover, no apex ALIAS requirement, the webmaster controls the rollout, and rollback is a proxy revert.

**CloudFront technical constraints (verified):** the distribution carries `footbag.org` and `www.footbag.org` as alternate domain names with a matching ACM certificate in us-east-1; adding the alternate domain names requires only the certificate, not a DNS repoint. The proxy must send SNI and Host as the apex name (mismatches risk HTTP 421). At the later DNS-handover milestone, the apex record needs ALIAS/ANAME support (Route 53 alias qualifies), which is why the zone migrates to Route 53 then; a plain CNAME at apex is illegal per RFC 1034.

### Phased feature scope (v1 / v2 / v3)

All scoped features default to v1 (launch day) unless the webmaster objects or a hard external dependency forces deferral; the allocation is front-matter question 20.

Legacy services not in v1 scope remain on the legacy host through the parallel-role window per §29.12a. Items dependent on this decision:

- §19 item 29: which legacy surfaces enter the write-freeze.
- §19 item 16: which `*.footbag.org` subdomains stay alive at launch.
- §19 item 31: parallel-window duration (cannot be bounded until the scope of retained legacy services is known).
- §19 item 26: per-mailing-list allocation (legacy parallel, migrate, retire).

**v1 (launch day):** member accounts, registration, login, profiles, tier management; legacy account import and claim flow (auto-link, declared anchors, mailbox verification, admin help requests); club bootstrap and onboarding; events (create, register, pay, results, attendance, co-organizers, routine music); freestyle trick dictionary and curated media; media and galleries; payments (Stripe: dues, event fees, donations, recurring); admin tools (work queues, payment reconciliation, sanctions, member help); transactional email via SES; the email transition (Google inbound, SES outbound, legacy mail retired) completed ahead of the front-door cutover; the front-door cutover itself; archive subdomain for legacy forum content.

**Open questions (version placement depends on webmaster's answers):**
- Per-mailing-list disposition (migrate to platform lists, recreate on Google, or retire) per §19 item 26; the email transition itself is settled v1 scope (one mail system, never two; §28 "Email transition").
- Group and committee features (v2 default, but depends on which are active per §19 item 26; some may not survive on legacy).
- Forum retirement timing (v3 default, but depends on webmaster comfort level per §19 item 28).

**v2 (post-launch, during parallel window):** Hall of Fame and BAP (nominations, voting, honors oversight); voting and elections; group and committee features that need to migrate off legacy (default placement, may shift per open questions above).

**v3 (parallel window end or beyond):** tournament in a box (if the webmaster wants it modernized rather than kept on legacy indefinitely; see "Tournament in a box" below); full legacy server retirement; forum retirement (archive only); remaining subdomain consolidation; features the webmaster identifies that do not fit v1 or v2.

### Tournament in a box

Partially disclosed by the webmaster. The production system is "atib" (A Tournament In a Box). Its backend is checked into the legacy repository under the `api/` and `registration/` apps, and also feeds `ranking/` and the event-list results; its AngularJS frontend is served separately and is not in that repository, and a later, incomplete NodeJS rewrite lives in its own repository. The new platform has event creation, registration, payment, and results entry. What remains unknown is the full feature scope, which the frontend and a webmaster walkthrough supply before it can be placed in the phased scope (front-matter question 18).

Open questions for the webmaster:

1. What does "tournament in a box" do today? (Registration, brackets, scheduling, scoring, results publishing, sanctioning, IFPA ranking integration, streaming, other?)
2. How many organizers actively use it? How often?
3. Is the webmaster satisfied keeping tournament-in-a-box on the legacy server during the parallel window while the new-platform version is scoped? Or must it be in v1?
4. Does the new platform's existing event system (create event, register players, collect fees, enter results, mark attendance, co-organizers, routine music) cover part of what tournament-in-a-box does? Where does it fall short?

Allocation (decided): not in v1. Tournament-in-a-box stays on the legacy server through the parallel window (v3); the new-platform version is scoped only after the webmaster's legacy-feature disclosure (§19 item 34) defines what it does today.

Historic tournament and registration data is not imported (Decision 22): the platform's canonical historical results are cleaner and authoritative, so the webmaster need not export the legacy tournament tables; a future tournament feature, if built, models fresh. Worlds 2026 runs on the legacy registration software, with go-live sequenced to follow it (Decision 21); the legacy registration system is a retained service through the parallel window. The legacy `registration/create.sql` is a stale stub and is not a reliable schema reference.

### Email transition

Email architecture is decided: **one mail system, never two.** The platform must own outbound from go-live, therefore the legacy mail server retires entirely (inbound and outbound) in a single atomic transition that completes strictly before the front-door cutover. Running the legacy sender alongside SES is excluded; a dual-sender window is a deliverability and confusion hazard with no upside.

**Decided architecture:**
- **Outbound:** AWS SES sends all transactional and mailing-list email (built and working).
- **Inbound:** Google Managed Services handles all ordinary `@footbag.org` inbound. The `footbag.org` MX points to Google. Mailboxes, aliases, and forwarding are configured on Google. No custom code; the platform receives no inbound mail.
- **Legacy `@footbag.org` mail server:** retired at the transition, both directions.
- **`@ifpa.footbag.org`:** out of scope here. It is a distinct mail domain on llic.net, dispositioned separately under §29.12a (IFPA list mail). Moving `footbag.org` MX does not touch it; zone edits must preserve its delegation.

**Two-phase DNS sequencing.** Phase one, any time early: the SES DKIM CNAMEs and the ACM/SES domain-verification records go into the zone (they do not affect the legacy sender) so certificate issuance, SES domain verification, and the production-access ticket complete ahead of the transition. Phase two, on email-transition day, atomically: the MX flips to Google, SPF flips to authorize exactly the two new senders (SES and Google; the legacy server drops out), and the DMARC policy applies (quarantine initially, tightened to reject once deliverability is verified). Applying the strict SPF/DMARC early would quarantine the still-running legacy sender's mail, which is why phase two waits for the transition day.

**Transition-day gate.** The MX flip is gated on provisioning being verifiably complete: every active `@footbag.org` address (per the §19 item 21 inventory, including the webmaster's own address and any list-intake addresses) exists on Google as a mailbox or forward, and every mailing list has its §19 item 26 disposition executed or scheduled. An unprovisioned active address loses mail silently at the flip; the inventory is the safety gate.

**Sequencing relative to the front-door cutover:** email day strictly precedes front-door day, and the gap stays short. During the gap the still-live legacy site has no outbound mail; the webmaster confirms that is tolerable (§19 item 24). Contact addresses printed on the new site (`admin@`, per §29.8) deliver via Google from transition day.

**What the new platform already has (built and working):** outbound transactional email via SES (verification, password reset, claim links, receipts, reminders); mailing-list infrastructure (DB tables, subscription management, bulk sends; six lists seeded); Terraform for SES domain identity, DKIM, SPF, DMARC (note: the Terraform writes these records into Route 53, which is not authoritative until the DNS handover; the webmaster hand-applies equivalent records in his zone for the interim, and Terraform reconciles at handover). Bounce/complaint tracking schema is ready; the webhook code is go-live gate EX6.

**What the new platform does NOT have:** inbound email handling of any kind, and no Reply-To configuration; outbound mail is From `noreply@footbag.org`, so member replies route wherever Google directs `noreply@`. Decide at provisioning time: a monitored `noreply@` alias on Google, or a Reply-To header pointing at `admin@`.

**Remaining discovery (the legacy-site webmaster and the IFPA secretary supply the facts; informs provisioning, not architecture):**

1. Full inventory of `@footbag.org` mailboxes and aliases in use today (front-matter question 6).
2. Which are actively used vs. dead or spam-only.
3. Mailing lists, their owners, software, and per-list disposition (front-matter question 7).
4. Mailbox type per address: real login mailboxes (IMAP/POP) vs. forwarding aliases (drives Google configuration).
5. Validation queries against the delivered legacy data: count `@footbag.org` addresses appearing in `legacy_members.legacy_email` and `members.login_email`; each needs Google provisioning or its claim/reset round-trips bounce.

### Standing consistency notes

- The product-facing term for `legacy_user_id` is "legacy username." This must be applied consistently in all UI copy, error messages, and documentation regardless of the column name.

---

## 29. Operational readiness for go-live

Non-data workstreams that must close before production cutover. Each subsection states the go-live gate (what must be true); operator procedures live in `docs/DEV_ONBOARDING.md` (Path G / Path I) and routine runbooks live in `docs/DEVOPS_GUIDE.md`. This section holds only what is required to green-light §24 State 3 / State 4.

**Subsection numbering convention.** Numeric subsections (§29.1, §29.2, ..., §29.16) are the original ordered series. Letter-suffixed subsections (§29.1a, §29.12a, §29.12b) denote later additions inserted to keep related material adjacent rather than appended at the end; the gate index in §22 refers to the exact suffix where applicable.

**Jargon used in this section.** DNS terms: A / AAAA (address records), CNAME (alias by name), ALIAS / ANAME (CNAME-like records that work at the zone apex, where plain CNAME is disallowed by RFC 1034), MX (mail exchange; routes inbound mail for the domain), DKIM (DomainKeys Identified Mail; per-domain DNS-published signing keys for outbound email authentication). AWS terms: ACM (AWS Certificate Manager; issues TLS certs), OAC (Origin Access Control; the S3-CloudFront access pattern that allows only the distribution to read), SSM (Systems Manager Parameter Store; secrets and config storage), KMS (Key Management Service; signing keys), SES (Simple Email Service; outbound mail). Reliability metrics: RPO (recovery point objective; how much recent data a restore can lose), RTO (recovery time objective; how quickly a restore returns service). Operational terms: source-profile IAM user (the long-lived IAM credentials a CLI operator assumes a role from), OOM (out of memory).

### 29.1 Data backup and disaster recovery

Gate: host-side SQLite backup producer runs on a schedule, ships to S3, and emits `BackupAgeMinutes`; a full restore drill has been rehearsed end-to-end on staging; a production-data restore drill has been completed against a copy of production data with recovery time meeting the `docs/DEVOPS_GUIDE.md` §16.1 RPO/RTO targets; the backup-age CloudWatch alarm (`enable_backup_alarm = true`) is enabled and has emitted a non-alarm state; the cross-region DR bucket has Object Lock configured per `docs/DEVOPS_GUIDE.md` §16.3 (Object Lock can only be enabled at bucket creation, so retrofitting requires bucket recreation). Recovery targets: 5–10 min RPO, ~5 min RTO per `docs/DEVOPS_GUIDE.md` §16.1. Procedure: `docs/DEV_ONBOARDING.md` §7.4 (setup); `docs/DEVOPS_GUIDE.md` §16 (runbook).

### 29.1a Pre-flip DB snapshot

Gate: a dedicated snapshot of the production SQLite DB is captured as State 4 step 9 (after validation in step 8, before the front-door flip in step 10). The snapshot contains the final import, the tier-mapping dry-run, the bootstrapped clubs and leaders, and the batch auto-link results. The snapshot is the load-bearing artifact for the rollback path B in §27. Requirements:

- Snapshot is written to the cross-region DR bucket (S3 Object Lock, `docs/DEVOPS_GUIDE.md` §16.3) under a path distinct from the routine backup stream, so the snapshot is not aged out by the routine retention policy.
- Integrity verification is automated: snapshot SHA-256 is recorded, a `PRAGMA integrity_check` run against a temporary copy returns `ok`, and the row counts for `members`, `legacy_members`, `historical_persons`, `clubs`, `audit_entries`, and `auto_link_staged_candidates` are recorded in the cutover audit trail. The staged-candidates count is included because the snapshot carries the batch auto-link results and that table is what members act on at first sign-in, so a path-B restore with a wrong candidate count would otherwise pass the integrity check unnoticed.
- A dry-run restore against staging has been completed end-to-end within the past 7 days, using the same restore procedure that will be invoked for path B. The dry-run runbook is written into `docs/DEVOPS_GUIDE.md` before the drill and includes the steps to re-point the app at the restored DB. Serial dependency: the runbook must exist before the dry-run, and the dry-run must succeed before cutover; schedule both with weeks of lead time, not days.
- The snapshot's Object Lock retention is set to at least 60 days so the rollback window plus retention plus operator review headroom is comfortably covered.

Procedure: `docs/DEVOPS_GUIDE.md` (snapshot creation + restore runbook).

### 29.2 Observability and monitoring readiness

Gate: CloudWatch agent installed on the runtime host; `enable_cwagent_alarms = true` applied and CPU / memory / disk alarms reachable via SNS with operator subscription confirmed; CloudFront 5xx alarm active; minimal operator dashboard documented. Procedure: `docs/DEV_ONBOARDING.md` §7.6 (install + enablement); `docs/DEVOPS_GUIDE.md` §12 (operating rules).

### 29.3 Edge and origin security

Gate: CloudFront enforces `X-Origin-Verify` on origin requests; Nginx rejects direct-to-origin traffic without the header; the S3 maintenance bucket with Origin Access Control is addressable via an ordered cache behavior at `/maintenance.html`. Direct origin bypass is no longer possible. Procedure: `docs/DEV_ONBOARDING.md` §7.2; `docs/DEVOPS_GUIDE.md` §9.1 (edge and request flow), §8.6 (S3 bucket policy rules), and §10.9 (Origin-verify shared-secret rotation).

### 29.4 IAM least-privilege scope-down

Gate: `footbag-operator` removed from `AdministratorAccess` and moved to a least-privilege policy covering only services the project uses (Lightsail, CloudFront, S3, SSM, KMS, SNS, CloudWatch, self-IAM for rotation); the Lightsail host's `ec2-user` default account retired in favor of named operator accounts; source-profile IAM user's access keys on a documented 90-day rotation cadence; all runtime-role IAM policies (SSM read, S3 snapshots, SES send, KMS sign) declared in Terraform HCL so `terraform apply` is a safe operation that cannot silently drop a Console-added capability. Procedure: `docs/DEV_ONBOARDING.md` §7.3; `docs/DEVOPS_GUIDE.md` §10.7.

### 29.5 Email deliverability operations

Gate: SES is out of sandbox with production access granted; `footbag.org` verified as an SES sender identity at the domain level via DKIM CNAMEs in the zone (per §29.12a MX disposition); an SNS topic subscribes to SES bounce and complaint events; the bounce/complaint webhook end-to-end has been tested with a synthetic bounce against `bounce@simulator.amazonses.com` and the resulting suppression-row write confirmed in the app; the application processes those events into hard-bounce suppression and complaint tracking; email-delivery smoke (validation gate G10) has passed end-to-end on a pre-cutover release. Procedure: `docs/DEV_ONBOARDING.md` Path I (activation).

The SES production-access ticket requires a stated daily send volume. Sending surfaces at cutover: transactional (verification, password reset, claim links on member sign-in), Active Player expiry reminders, admin contact-request resolution replies, and any cutover-day announcement to the announce list. The delivered legacy data supplies the member-count input for the estimate. If 200 members sign in on day one and each triggers 1-2 transactional emails, baseline is 200-400/day; a bulk "site is live" announcement adds the full announce-list size. SES production default is 1 message/second; the outbox retry mechanism handles throttling, but queue depth and user-visible latency scale with the gap between send rate and burst volume. Request at least 1,000 emails/day with a burst justification referencing the cutover scenario.

### 29.6 Scheduled maintenance jobs

Gate: login rate-limit cooldown is wired to the `login_cooldown_minutes` setting; daily `account_tokens` cleanup job runs on the host and removes expired entries; job execution is observable via standard application logs or CloudWatch. Procedure: in-code + `docs/DEVOPS_GUIDE.md`.

### 29.7 Secrets rotation

Gate: JWT signing-key rotation procedure with 24h overlap is documented and drilled against staging before production cutover (generate new key, stand it up alongside current key, flip the active signer, retire the old key after the overlap window); session JWT refresh re-issues the cookie when `exp` is within 6h per DD §3.4 so users are not silently logged out at the 24h TTL boundary; `SESSION_SECRET` rotation runbook exists. Source-profile access-key rotation is covered under §29.4. Procedure: `docs/DEVOPS_GUIDE.md` §10.

### 29.8 Pre-cutover revert and rotation checklist

Before Phase 4 cutover, the following staging-observability-only deviations must be reverted and rotations completed:

1. SES sender cutover: re-run `docs/DEV_ONBOARDING.md` §8.8 against the canonical domain; switch `SES_FROM_IDENTITY` in `/srv/footbag/env` to `noreply@footbag.org` (the FROM address) and switch the `OutboundEmail` IAM policy `Resource` ARN to the `footbag.org` SES domain identity ARN (per §29.12a MX disposition: domain-level verification, not email-address-level); restart the app. Env + IAM only, no code.
2. Lightsail SSH firewall rule restore: `terraform apply` from `terraform/staging/` to remove any browser-SSH firewall opening (port 22 loosened beyond `operator_cidrs` during staging bring-up) and return to the `operator_cidrs`-constrained ingress documented in DEV_ONBOARDING Path D §4.4.
3. SES adapter on production: `/srv/footbag/env` sets `SES_ADAPTER=live` for production once SES production access has been granted. Dev and staging run `SES_ADAPTER=stub` and capture outbound mail for retrieval (the in-page simulated-email card on registration check-email; the captured outbox on the password-reset and legacy-claim pages); live SES delivery is production-only (DD §5.6). The legacy `SES_SANDBOX_MODE` flag has been removed from the codebase; it is no longer read and must not be set in the env file.
4. Production Terraform reconciliation before any `terraform apply` from `terraform/production/`. The region default in `terraform/production/variables.tf` is `us-east-1` (the region the project runs in, DEVOPS_GUIDE §9.2 networking and TLS), so the default carries no cross-region risk. Production Terraform has not yet been applied to the production account, so its infrastructure (CloudFront distribution, ACM certs, Route 53 records, security groups, KMS keys) does not exist yet or was created outside Terraform; run a `terraform plan` against the production account well before cutover to surface the full delta between desired and actual state, and import (`terraform import`) any manually created resources before `terraform apply` to avoid duplication or conflicts.
5. Preview fixture scrub: `legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py` inserts a "Footbag Hacky" fixture (fake event, discipline, result, HP record with HoF flag, and result-entry participant) alongside the preview-user account. Acceptable in staging for UX preview; must not reach the production DB. Either condition the fixture block on an env flag (e.g. `FOOTBAG_SEED_PREVIEW_FIXTURE=1`) or delete the block in the production-cutover data pass.
6. Restore live `mailto:admin@footbag.org` in `/legal`: swap the `.contact-pending` span used in Privacy, Terms, and Copyright contact lines for a live `mailto:admin@footbag.org` once SES sender cutover (item 1) is complete and the canonical mailbox is active. Template-only change; no service or DB work.
7. Dev-shortcut auth surface removal. Dev autologin has already been removed: `src/middleware/auth.ts` runs the cookie path unconditionally and the `FOOTBAG_DEV_AUTOLOGIN_*` env vars and their guards no longer exist. The test-data persona harness (the `devRouter` mount in `src/app.ts` for `GET /dev/switch` and `GET /dev/personas`, gated to development and staging, and the `src/testkit/` subtree of persona factory, catalog, and seed runner) is permanent test infrastructure: it is excluded from the production image at build time and never mounted in production, but it is not removed from source at cutover. The removable surface at cutover is `src/dev-bootstrap/` (the bootstrap conveniences), not the harness. **Scope**: this item covers dev-only auth/persona surfaces. Dev-admin seeding (the registration-time admin allowlist and the `--seed-dev-admins` direct-insert path) is a separate concern, deleted entirely under PC7; production first-admin uses the SSM-token `/admin/bootstrap-claim` route (DD §2.9; operator runbook in DEVOPS_GUIDE §20.8).
8. JWT session TTL revert: the source-compiled TTL constant in the JWT signing service is set to the DD §3.4 baseline (24h = 86400 seconds). Staging observability-tuned values are reverted by editing the constant and rebuilding before the cutover deploy. This is the PC1 gate.

Sign-off on this checklist is a prerequisite for §24 State 3 → State 4 transition.

### 29.9 Production-specific prerequisites

Gate: ACM certificate for `footbag.org` issued in `us-east-1` and attached to the production CloudFront distribution; **ACM certificate for `archive.footbag.org` issued in `us-east-1` and attached to the archive CloudFront distribution** (separate cert, separate distribution, same Terraform pattern as the main cert; requires its own DNS validation CNAME published by the records-actor per §19 item 17); production KMS asymmetric signing key, source-profile IAM user, and runtime role provisioned (production mirror of Path H §8.6–§8.9, per Path I §9.8); Stripe production live API keys and webhook secret stored in Parameter Store at `/footbag/production/stripe/*`; Stripe webhook endpoint URL registered in the Stripe Dashboard against the production domain; one end-to-end Stripe webhook delivery confirmed against the production endpoint before cutover, with the confirmation asserting that the `stripe-signature` header was validated by the app against the production webhook secret (e.g. by inspecting an audit row written by the signature-validation path on successful receipt) rather than only that the endpoint returned HTTP 200. Procedure: `docs/DEV_ONBOARDING.md` Path I (§9.4 ACM via DNS delegation, §9.8 production KMS / runtime role, §9.13 Stripe production activation).

### 29.10 Code governance

Gate: GitHub `main` branch protection enforced (PR required, status checks must pass, linear history); the required-check job names match the names in `.github/workflows/ci.yml`; at least one administrator account provisioned in the production database and login-tested. Procedure: `docs/DEV_ONBOARDING.md` §7.3 (branch protection).

### 29.11 Compliance

Gate: privacy policy, Terms of Service, and cookie banner (if applicable) reviewed by the IFPA board and accessible from the production site footer. Prepared by IFPA, reviewed by the maintainer; not technical work.

### 29.12 Front-door cutover and DNS handover

Under the agreed Option A the apex DNS does not move at cutover. The front-door cutover is the webmaster's reverse-proxy flip on the legacy server; the later DNS handover (zone to Route 53, apex direct to CloudFront) is a separate post-stability milestone. The ACM certificate issuance procedure (`docs/DEVOPS_GUIDE.md` §9.2.1) applies now; the generic DNS cutover procedure (`docs/DEVOPS_GUIDE.md` §6.7) applies at the handover milestone, not at the front-door flip.

**Timing notation in this section.** `T-0` is the moment the webmaster flips the reverse proxy to route apex and `www` traffic to the new platform. `T-Nd` / `T-Nh` and `T+Nh` count from that flip. The `T+48h` window matches the §27 rollback window.

**Front-door preconditions:**

- **ACM colocation**: the `footbag.org` certificate is issued in `us-east-1` and attached to the production distribution, with the validation CNAMEs placed in the authoritative zone by the webmaster (they stay permanently; renewals depend on them).
- **Proxy contract**: the legacy server's proxy targets the distribution's `cloudfront.net` endpoint with SNI and Host set to the apex name, resolves the endpoint dynamically (CloudFront IPs rotate), and overwrites inbound `X-Forwarded-For` with the real client IP.
- **Proxy-path smoke test green**: `curl --resolve footbag.org:443:<current edge IP> https://footbag.org/` returns the expected page with the `footbag.org` certificate, run from the legacy server itself. First run happens at State 3; re-run green on cutover day before the flip.
- **Email transition already complete** (§29.12a): MX on Google, SPF/DMARC flipped, legacy mail retired. The flip touches no mail.
- **Write-freeze**: legacy site is in read-only mode and the final export has been imported into production before the flip (per §23 Phase 4 cutover gates).

**Timing:**

- T-7d minimum lead time: the maintainer formally notifies the webmaster of the cutover window and confirms availability and the secondary-contact coverage required under §19 item 19. No DNS records change at the front-door flip, so no TTL choreography applies here.
- T-0: the webmaster flips the proxy. Propagation is immediate (no DNS involved).
- T+0 to T+48h: §27 monitored rollback window; rollback is the webmaster reverting the proxy config, effective immediately.

Post-cutover verification: as part of State 4 step 11, `dig +short` is run against every retained `*.footbag.org` subdomain enumerated under §19 item 16; any retained subdomain resolving to the new platform's Lightsail IP is a misconfiguration and a §29.3 origin-verification bypass; correct before declaring step 11 complete.

Sign-off on this sequence is a prerequisite for §24 State 3 → State 4 transition.

**DNS handover (post-stability milestone, §19 items 15 and 31):** the zone migrates to Route 53; the apex and `www` become ALIAS records to the distribution; the proxy hop retires. The generic DNS cutover procedure (`docs/DEVOPS_GUIDE.md` §6.7) governs that step, with a fresh zone snapshot first so MX, DKIM, SPF, DMARC, validation CNAMEs, and retained-subdomain records copy faithfully. After the handover, retained-subdomain records are applied at the webmaster's instruction (the maintainer holds zone-write access), or his subdomains are delegated back to a webmaster-controlled zone via NS records; the choice is documented under §19 item 15.

### 29.12a Legacy host parallel role

The legacy host persists in a parallel role beyond the §27 rollback window for a milestone-bounded period agreed with the legacy-site webmaster. Under the agreed Option A the role is larger than subdomain coexistence: the legacy server is the front door for the apex and `www` (reverse-proxying to the new platform per §29.12) and continues serving the subdomains the webmaster elects to keep. Inventory, duration milestones, and coordination details are settled via §19 items 15, 16, 17, and 31.

**Hard design constraints (locked):**

1. The legacy server proxies the apex into CloudFront, never directly to the Lightsail origin: the §29.3 origin-verification gate stands (only CloudFront reaches the origin), and the proxy's CloudFront target keeps edge caching and the maintenance-page path intact.
2. Legacy retained content is served under separate hostnames (subdomain coexistence), **over HTTPS exclusively**. CloudFront is not configured to proxy paths to a legacy origin. Retained subdomains keep their existing DNS records pointing at the legacy host's IP. HTTPS is non-negotiable: the session cookie widens to `Domain=.footbag.org` per §29.15 and a plain-HTTP subdomain would leak it in cleartext (full mechanism in §29.15).
3. The parallel window is bounded by the milestone list agreed under §19 item 31 (stable operation, email transition complete, DNS handover executed, retained services resolved). Indefinite persistence converts the migration into long-term federation and is out of scope.
4. The legacy host is operated by the legacy-site webmaster through the parallel window: patches, uptime, server-side and proxy configuration, and TLS on the apex and retained subdomains remain his responsibility. DNS stays under his authority until the §29.12 DNS-handover milestone.
5. Every existing group, committee, and mailing-list function on the legacy site continues to operate at and after cutover. Allocation is per-function per §19 item 26: stays on the legacy parallel-role server (default), migrates to the new platform pre-cutover (separately scoped feature build), or is retired with consent. No function goes dark at T-0. IFPA `@ifpa.footbag.org` list functions are dispositioned under §29.12a (IFPA list mail), with disposition authority resting with IFPA governance.

**Legacy host failure during the parallel window.** Under Option A this is now a whole-site event: an outage of the legacy server takes down the apex front door, not just retained subdomains. The escalation path (to be confirmed with the webmaster before cutover alongside §19 items 19 and 31):

- **0-4 hours:** webmaster attempts restore; maintainer notified; the apex, retained subdomains, and any legacy-hosted functions are unavailable.
- **Beyond restore feasibility:** emergency apex repoint: the zone holder points `footbag.org` / `www` directly at the CloudFront distribution (the alternate domain names and certificate are already attached, so the repoint works immediately, subject to apex-record capability at the current provider). This requires a reachable zone holder; the §19 item 19 secondary contact must therefore carry zone access or a pre-agreed delegate path, and this emergency procedure is pre-agreed with the webmaster in writing.
- **Retained functions:** jointly decide to accelerate the milestone schedule, emergency-migrate the highest-priority retained functions, or accept the outage until restore.
- **Inbound email impact:** `@footbag.org` inbound is on Google (per §28), so a legacy host outage does not affect mail. `@ifpa.footbag.org` on llic.net is independent of this host.

**Variables settled with the legacy-site webmaster:**

- Subdomain inventory (§19 item 16): which `*.footbag.org` subdomains stay on the legacy host.
- Parallel-role end milestones (§19 item 31).
- Zone authority and handover planning (§19 item 15; relevant at the DNS-handover milestone).
- Records-actor (§19 item 17; agreed: the webmaster), plus the emergency zone-access arrangement above (§19 item 19).

**MX disposition for `@footbag.org`:** outbound SES sender identity is verified at the `footbag.org` domain level using the DKIM CNAMEs (applied early, phase one per §28); no inbound mailbox is required for SES verification. Inbound `@footbag.org` mail moves to Google Managed Services in the atomic email transition (§28), strictly before the front-door cutover. Once Google inbound is live, the legacy mail server retains no `@footbag.org` role in either direction; `brat@footbag.org`, `directors@`, `sanctioning@`, and other apex role addresses are provisioned on Google before legacy delivery is withdrawn so no mail is lost. `@ifpa.footbag.org` is a separate mail domain on llic.net and is unaffected (IFPA list mail below). Cloudflare Email Routing is not used.

**Email-transition step (discrete, pre-front-door).** Runs as its own step on its own agreed date (§19 item 24), gated by the confirmed inventory (§19 item 21) and per-list dispositions (§19 item 26). Skeleton (detailed operator click-paths live in `docs/DEVOPS_GUIDE.md` once the step is executed):

1. Provision every active `@footbag.org` mailbox or alias on Google from the confirmed inventory; verify each receives test mail. Decide the `noreply@` handling (monitored alias or Reply-To `admin@`, per §28).
2. Pre-shrink the `footbag.org` MX TTL. This is the webmaster's manual action on his authoritative zone: the platform's `dns-ttl-preflight.sh` automation operates on Route 53, which is not authoritative until the later DNS handover, so it cannot lower the live MX TTL on email day. That script's only TTL role is the handover-phase `A` / `AAAA` drop.
3. Atomically: repoint the MX to Google, flip SPF to authorize exactly SES + Google, apply the DMARC policy (quarantine, later tightened to reject), and shut down legacy outbound. A transient lower-priority backup MX to the legacy server may bridge the hours until Google delivery is confirmed, then is removed.
4. Verify inbound end-to-end to every provisioned address; verify SES outbound passes SPF/DKIM/DMARC checks at a major provider.
5. Withdraw legacy `@footbag.org` delivery entirely. `@ifpa.footbag.org` on llic.net is untouched throughout.

Rollback: if Google inbound fails verification, revert the MX to the legacy mail server (authoritative until step 5); the web cutover is independent and unaffected. Gate: EX7.

Two email concerns remain open before the transition (front-matter questions 6-7):

1. **Inbound mailbox inventory.** A candidate enumeration is derivable from the delivered members dump by replaying the legacy alias logic (`members/admin/dumpaliases.php`), which emits the per-member alias-to-forward map plus the `announce`/`members` lists; the role addresses (`admin@`, `webmaster@`, `registration@`, and so on) appear in the legacy code. What the dump does not settle is which addresses are actively used versus dead or spam-only, and any apex aliases hand-configured in sendmail outside the codebase. The inventory is the transition-day safety gate (§28): every active address must be provisioned on Google before legacy delivery is withdrawn.
2. **Mailing-list mapping.** USER_STORIES defines platform-managed mailing lists (newsletter, board-announcements, event-notifications, technical-updates, announce, group auto-sync lists) sent via SES; §19 item 26 allocates each legacy list to stay/migrate/retire; but no mapping exists between the US-defined lists and the lists the legacy server actually operates. The legacy side is now partly identified: the `announce`/`members` lists are generated from members-table opt-in flags by `dumpaliases.php`, the IFPA committee and group lists are the `@ifpa.footbag.org` `wrapper/` server (above), and the public discussion lists (footbag, freestyle, sewing) run on Majordomo at `list.footbag.org`. The `announce@footbag.org` name appears in both contexts and must resolve to exactly one owner at the transition.

Legacy mail server health is no longer a standing concern: the email transition retires it for `@footbag.org` entirely; the residual mail-host concern applies only to `@ifpa.footbag.org` on llic.net, dispositioned below.

**IFPA list mail (`@ifpa.footbag.org`) disposition.** `@ifpa.footbag.org` is a distinct mail domain from `@footbag.org`. It has its own MX, hosted at llic.net, which runs the IFPA groups and committees mailing-list server: a sendmail-tied posting and moderation service (the legacy `wrapper` component) that accepts inbound mail to IFPA group and committee aliases, parses MIME, enforces moderation, and retains message history. This service runs outside the new platform and is unaffected by the `@footbag.org` move to Google Managed Services; repointing `footbag.org` MX does not touch `ifpa.footbag.org` MX.

Disposition is a scoping and requirements-gathering item, not a v1 build. The new platform does not receive inbound email (no SES receiving rules, no inbound processing code; see §28). The platform's native groups and committees are a forward-looking system (web-form composition plus SES distribution, addressed under `groups.footbag.org`) and are not a migration target for the legacy IFPA list server. Whether any legacy IFPA list function should migrate depends first on evidence that the lists are actively used, which has not been gathered.

Default until that evidence is gathered: `@ifpa.footbag.org` and its llic.net list host are retained untouched. No v1 work, no MX change, no platform feature, no data import. It is a separately-scoped retained mail service through the parallel window and beyond, on the same "no function goes dark at T-0" basis as other retained legacy services (constraint 5 above).

Usage discovery (the legacy-site webmaster supplies the facts; disposition of any IFPA-owned list function or data is an IFPA governance decision, not a webmaster or maintainer one):

1. Which `@ifpa.footbag.org` aliases received any non-spam mail in the last 12 months?
2. Who reads each such alias today, and does any committee still conduct business over it rather than over ordinary email or board tools?
3. For any alias still in real use, is running it on llic.net acceptable indefinitely, or is there a date by which the list host must retire?
4. The legacy source (the `wrapper` list component and the `groups/` code) addresses every committee and sanctioning list as `<list>@ifpa.footbag.org`, and no apex `sanctioning@footbag.org` or `directors@footbag.org` appears in the legacy code or the published site. Apex mail routing lives in sendmail aliases outside the codebase, so confirm whether `sanctioning@footbag.org` and `directors@footbag.org` exist as live apex aliases today and where they forward. This reconciles DESIGN_DECISIONS §5.5, which lists both as apex receive addresses to provision on Google: if the real in-use contacts are the `@ifpa.footbag.org` lists, settle the target domain (consolidate onto apex on Google, or keep on the llic.net list server) before the email transition provisions any address.

The roughly 1.2GB `ifpa_group_messages` archive is dispositioned under the sealed legacy email archive below.

**Sealed legacy email archive disposition.** The legacy `ifpa_group_messages` archive (roughly 1.2GB uncompressed; private and public discussions intermixed; dirty with spam and moderation residue; includes privately cast committee votes) is sealed and retained privately. Under every v1 branch it is not imported into the platform, not processed, not spam-cleaned, and not exposed publicly. Privately cast votes within it are permanently non-publishable.

The seal is enforced technically. The archive is held as an encrypted container; its decryption key is held in an IFPA-governed, access-controlled secret store. The encrypted container and the key vault are kept in an IFPA-governed cloud store restricted to the IFPA board and platform admins. The credential that opens the key vault is held separately from that store, under IFPA governance, with an IFPA-named backup holder, so access to the store alone cannot unseal the archive and loss of a single credential does not destroy it. The legacy-site webmaster is operational custodian of the encrypted container and the authoritative source for facts about its contents; he is not its decision authority.

Any future disposition (preserve a subset as historical record, redact, publish any portion, or destroy it) is an IFPA governance decision under IFPA's records-retention policy, never operator or webmaster discretion. The migration's only standing commitment is the seal: keep it private, keep it intact, expose nothing, until IFPA governance directs otherwise. Neither the encrypted container nor the key is ever committed to the repository, placed in issues, logs, tests, or AI prompts. Concrete custody details (store, folder, vault entry, access list) live only in operator notes, never in a tracked doc.

This disposition is deferred and is not on the cutover critical path; it does not gate v1.

### 29.12b Legacy URL forwarding for in-flight emails

Old footbag.org emails (account verification, forum-reply pointers, share-event links) reference legacy URL patterns like `/members/profile/{legacy_member_id}`, `/clubs/{slug}`, and various forum paths. After cutover, these emails continue circulating in inboxes for months or years.

Forwarding contract for the production app:

- Member profile patterns: `/members/profile/:legacyMemberId` resolves in three branches: (a) if the legacy ID maps to a non-deleted live member via `members.legacy_member_id`, redirect 301 to the slug-based URL `/members/:slug`; (b) if the legacy ID matches an unclaimed `legacy_members.legacy_member_id`, render a soft-landing page with a generic message ("this link points to a legacy footbag.org account") and a CTA to claim it (authenticated visitors, who may see the account's display name) or to register first (unauthenticated visitors, who are never shown the display name or any other account detail); (c) if the legacy ID matches no row in either table, render the friendly "this legacy account is no longer routable" 404 page. The soft landing in branch (b) preserves the claim funnel for members who follow old links before completing claim.
- Club patterns: legacy `/clubs/:slug` URLs resolve to the new club page if the slug survived normalization; otherwise to archive.footbag.org for the historical mirror or a 404 page when neither exists.
- Forum patterns: legacy forum thread URLs redirect to archive.footbag.org where the post is preserved as a static mirror. **Volume note:** if the legacy forum has thousands of indexed thread URLs, all will 301-redirect through the production CloudFront distribution post-cutover. Search engine re-crawl of these redirects may generate a sustained burst of requests in the days after cutover. Verify the redirect handler does not trigger CloudFront request-rate alarms, and confirm `archive.footbag.org` can absorb the redirected traffic without creating redirect loops (relevant if archive is also behind CloudFront).
- Unknown patterns: 404 with a generic legacy-URL message that directs the visitor to footbag.org.

The legacy site stays online but read-only for the 48h rollback window (§29.12 T+0 to T+48h); after T+48h the legacy host's apex content-serving role ends and `footbag.org` apex and `www` are served entirely by the new platform. Retained `*.footbag.org` subdomains under the legacy host's parallel role per §29.12a continue to operate beyond T+48h until their bounded end-date per §19 item 31. Redirect-handler coverage in the production app must therefore cover every legacy URL pattern that meaningfully forwards to a new destination, validated at test load by replaying a stored sample of legacy URLs against the production app.

Procedure: redirect handlers live in the public router; the sample-replay validation step is part of the test-load checklist.

### 29.13 Curator content seeding

Gate: the system member account (Footbag Hacky per DD §2.8) is seeded into the production DB and its curator content (avatar in `/curated/avatars/`, fixed site content (demo loops, the foundations mosaic, the event promo image) in `/curated/site/`, tutorials and records in `/curated/freestyle_tricks/`, etc.) is loaded into the production media bucket before public DNS cutover. Landing pages and curator-tagged surfaces must resolve to the production media bucket, not 404. The deploy orchestrator runs `scripts/seed_fh_curator.py` against the prod DB and `aws s3 sync` against the prod media bucket; verify via post-deploy smoke check. Curator content extends by adding file-paired sidecars under `/curated/{category}/`; no manifest edits are needed. This is the one-time pre-cutover population, performed while the production DB is still being established; after cutover the production DB is persistent and the seeder is not re-run against it (post-launch authoring is admin-UI -> DB per §29.14).

The seed transcodes off-host at build time: `scripts/seed_fh_curator.py` runs on the operator build host, re-encoding each source video through a one-at-a-time ffmpeg subprocess into an ephemeral build directory that the deploy `aws s3 sync`s to the production media bucket. The production host serves the pre-transcoded artifacts and never runs ffmpeg for curator content. The interactive admin curator upload path, which executes on the memory-constrained production host, runs transcode through the async `media_jobs` lifecycle (DD §6.8) instead. This is the pre-go-live seed path; it consumes the `/curated/` JSON sidecars, which are retired at go-live when the persistent DB becomes the source of truth (§29.14).

### 29.14 Post-launch admin curator authoring

At go-live the source of truth for system-member-owned curator content moves from the pre-go-live `/curated/` authoring layer (and the seeder that builds the DB from it) to the persistent production DB: admins thereafter author through the admin UI, which writes the DB directly; the seeder is not run against production; data-preserving deploys use `scripts/deploy-migrate.sh`. The model and success criteria are defined in DD §1.13 and USER_STORIES `A_Upload_Curated_Media` / `A_Manage_Curated_Gallery`. This switch from JSON-sidecar authoring to the persistent DB is covered by special tests of its failure modes: curator content (`media_items`, galleries, and S3 bytes) survives a data-preserving `scripts/deploy-migrate.sh` deploy with no seeder run; admin-UI create, edit, and delete is the sole post-go-live authoring path and is durable without seeder replay; and a guard prevents the seeder from running against a persistent production DB, whose orphan-cleanup would otherwise delete admin- and member-created rows that have no `/curated/` sidecar (DD §1.13). Gate: OR9 (the data-preserving deploy additionally depends on OR1/OR8 backup and restore). Must land before State 3 → State 4.

### 29.15 Legacy archive subdomain readiness

Per DD §6.4, archive.footbag.org serves the static legacy HTML mirror under member-only access enforced by CloudFront signed cookies. The archive launches at cutover.

**Archive completeness and legacy media.** The archive mirror holds the legacy content the crawl could reach: media linked under `www.footbag.org` (the `gallery`, `video`, `photos`, and `qt-video` paths) is captured and re-encoded to mp4/jpg/gif. Legacy media lives only in this archive; it is never imported into the new platform's media system (DD §6.4). Media reachable on the legacy server only by a direct `video.`/`photo.` file path that was never linked under `www` was not crawled and is therefore not in the mirror; those direct-path links are already dead today, so no subdomain is retained for them. Recovering that un-crawled media would require the webmaster to supply the files plus a path mapping from the legacy server; that is an optional, non-blocking, post-v1 archive-enrichment handled through the §19 feedback workflow, not a cutover dependency.

Gate, all of the following are provisioned and verified end-to-end:

- **Archive S3 bucket** (Terraform `aws_s3_bucket.archive` or equivalent) is private behind Origin Access Control. Bucket policy permits only the archive CloudFront distribution to read. Versioning and Object Lock per the standard private-bucket pattern.
- **CloudFront key group** (`aws_cloudfront_public_key` + `aws_cloudfront_key_group`) is provisioned in Terraform. The trusted-signer keypair private half is stored in AWS Secrets Manager (or SSM SecureString) scoped to the main app's runtime IAM role; the public half is registered in the key group.
- **Archive CloudFront distribution** is provisioned with: the archive S3 bucket as origin via OAC; the cache behavior naming the key group in `trusted_key_groups`; 1-year edge TTL per DD §6.2 immutable-archive guidance; ACM cert for `archive.footbag.org` attached; custom 403 error response redirecting to `https://footbag.org/login?return=archive.footbag.org`.
- **DNS record** for `archive.footbag.org` pointing at the archive distribution, applied by the webmaster in the authoritative zone pre-handover (CNAME; per §19 item 17 / WM14). After DNS handover the record becomes a Route 53 ALIAS.
- **Cookie-Domain widening** deployed: both `footbag_session` and the new CloudFront signed cookie use `Domain=.footbag.org` so the archive subdomain receives them. The widening lands AFTER the CSRF Origin-pin middleware (DD §3.3) is in production and BEFORE archive.footbag.org receives its first authenticated request.

**Risk acknowledgment (cookie-Domain widening on retained subdomains):** widening to `Domain=.footbag.org` sends `footbag_session` to every `*.footbag.org` hostname, including subdomains the webmaster retains under §29.12a. Those subdomains receive valid session tokens for the maintainer's app on every request. The HTTPS hard constraint in §29.12a constraint 2, the pre-cutover HTTPS audit gate OR14, and the daily TLS probe gate OR12 together prevent cleartext exposure across the parallel window. The risk that retained-subdomain servers may log the session token is accepted: the legacy-site webmaster is a trusted operator per §19, and the parallel window is bounded per §19 item 31.
- **Archive HTML mirror content** uploaded to the bucket. All video content is mp4, all images are jpg, no JavaScript present (DD §6.4 contract).
- **End-to-end auth flow tested**: unauthenticated request to `https://archive.footbag.org/some-path` returns CloudFront's signed-cookie-missing 403 with the redirect to the main-site login; an authenticated member's request returns 200 from S3 origin.

Procedure: Terraform provisioning and end-to-end test runbook live in `docs/DEVOPS_GUIDE.md`.

### 29.16 TLS health monitoring on retained subdomains

Gate: a periodic external probe (cron + curl, or equivalent) checks the TLS certificate expiry of every retained `*.footbag.org` subdomain (per §19 item 16) on the legacy host. The probe runs at least daily. An alarm fires when any retained subdomain's certificate is within a configurable grace window of expiry (default 14 days; configured via the `TLS_EXPIRY_GRACE_DAYS` environment variable on the probe host, runbook in DEVOPS_GUIDE) or already expired; the alarm notifies the maintainer and the secondary webmaster contact (per §19 item 19).

Rationale: the new-platform session cookie widens to `Domain=.footbag.org` per §29.15. A retained subdomain serving plain HTTP, or with a lapsed certificate, leaks the session token in cleartext on every request. The HTTPS constraint in §29.12a is a one-time pre-cutover check; this gate is the ongoing assurance across the bounded parallel-role window (§19 item 31).

The probe must be a scheduled job (cron on the Lightsail host or a CloudWatch Synthetics canary), never a manual check: the parallel window is milestone-bounded (§19 item 31) and can span multiple Let's Encrypt 90-day renewal cycles, so a retained subdomain's cert will lapse during the window unless renewals happen on schedule, and a manual daily check will not be sustained that long. Alarm delivery is automated to both the maintainer and the webmaster's secondary contact (§19 item 19).

Procedure: probe runbook and alarm wiring documented in `docs/DEVOPS_GUIDE.md`; sunsets when the parallel-role window ends and the retained-subdomain inventory empties.

### 29.17 Security hardening (operator-doc security audit remediation)

Gate: the items surfaced by the operator-doc security audit are resolved or explicitly accepted, with rationale recorded in the cutover sign-off, before State 3 → State 4:

1. Operator secret hygiene: every runbook that writes a secret to SSM or a host file uses the `file://`/temp-file (or stdin) transport, and pasted-key steps suppress shell history, so no live secret reaches process argv or shell history (DEVOPS_GUIDE §10.5/§10.10/§10.12/§10.14; DEV_ONBOARDING §8.10/§8.15/§8.16).
2. The workstation runtime AWS profile for the production role carries `mfa_serial`, so a stolen at-rest `~/.aws/credentials` cannot assume the role without the operator's MFA device (DEVOPS_GUIDE §18.8).
3. Source-profile and CloudWatch-publisher access keys are on a verified 90-day rotation cadence and named in the quarterly access review (DEVOPS_GUIDE §10.7, §18.2); reconciles with §29.4.
4. Break-glass has contemporaneous second-operator notification, a CloudTrail/CloudWatch alarm on privileged-role AssumeRole, and bounded auto-revocation of any console-granted temporary access (DEVOPS_GUIDE §8.8).
5. SES feedback webhook auth reviewed: the `SES_FEEDBACK_WEBHOOK_KEY` query-string transport is accepted only with CloudWatch access-log read narrowed to System Administrators, or replaced by a request-body HMAC (DEVOPS_GUIDE §10.11).
6. The maintenance S3 bucket keeps `block_public_policy = true` and `restrict_public_buckets = true` (OAC service-principal policies are compatible); reconciles with §29.3.
7. The `/dev/*` persona-switch surface (and all dev/test scaffolding) is dev/staging-only and unreachable in production, enforced by three independent layers: the env-gated mount in `src/app.ts` (registers `/dev` only when `FOOTBAG_ENV ∈ {development, staging}`), the null-guard (production images stub the harness module to null), and the build-time image strip (`INCLUDE_DEV_SHORTCUTS=0` removes `dist/testkit/` and `dist/dev-bootstrap/`; PC10). Cutover preflight (§24) verifies the production origin returns 404 for `/dev/switch`, `/dev/personas`, and `/dev/outbox` (the captured-email viewer, which exposes verification, password-reset, and legacy-claim links and must never be reachable in production). No real-PII dataset is loaded on an internet-reachable staging while the `/dev/*` surface is active.
8. The committed-secret scan covers `.md`/`.txt` so a secret pasted into documentation is caught in CI; the dev/staging seed-password literal stays single-file and guarded.
9. The repository carries no genuine-risk identifier (account id, origin IP, operator CIDR, KMS key material, live credentials); infra identifiers with no exploitation value (state-bucket name, CloudFront domain) may remain.

Rationale: the operator runbooks and committed configuration are themselves an attack surface on a public repository; this gate closes (or consciously accepts) the audit's hardening items rather than carrying them silently into production.

Procedure: items 1, 8, and 9 are doc/CI changes applied pre-cutover; items 2-6 are infra/process changes completed under §29.3/§29.4/§29.7; item 7 is a standing rule verified at cutover preflight (§24).

---

## 30. QC subsystem retirement (go-live gate)

The internal QC subsystem (`/internal/net/*`, `/internal/persons/*`, and supporting code, tables, and tests) is a hard go-live gate: no production deployment may carry QC code, routes, or tables. Deletion is not a post-launch tidy-up. Scope at retirement time: every `/internal/*` route, its controller and service code, its Handlebars views, its schema tables, its `db.ts` prepared-statement groups, and its tests.

Sign-off on QC retirement is a prerequisite for §24 State 3 → State 4 transition.

**QC retirement inventory** (canonical list of paths and tables to delete; the retirement PR maintainer extends this list if files have been added since):

- Controllers: `src/internal-qc/controllers/netQcController.ts`, `src/internal-qc/controllers/personsQcController.ts`.
- Services: `src/internal-qc/services/netQcService.ts`, `src/internal-qc/services/personsQcChecks.ts`, `src/internal-qc/services/personsQcService.ts`.
- Views: every `.hbs` file under `src/views/internal-qc/`.
- `src/db/db.ts`: every prepared-statement group banner-marked `// ---- QC-only (delete with pipeline-qc subsystem) ----`.
- Schema tables in `database/schema.sql`: `net_review_queue` (and any future QC-only tables added under the same banner).
- Tests: `tests/integration/persons.qc.routes.test.ts`, `tests/integration/clubs-qc-panel.routes.test.ts`, plus any tests that exercise the deleted routes.
- Route mounting in `src/app.ts` for the `/internal/*` router (and the router file itself if it serves only QC).
- Production image hygiene: `docker/web/Dockerfile` strips `dist/internal-qc` from the production stage as an interim safeguard until source deletion lands; the retirement PR removes the strip line together with the source.

**Automated enforcement**: two layers, paired so a typo or rename can't silently slip through:

1. **Positive-assertion test** (preferred). A test asserts that named QC files (the controllers, services, views, and schema table definitions deleted at retirement) no longer exist in the source tree. The test is keyed to the retirement PR's file list; absence is the success signal. This catches the case where someone restores a deleted file but the grep pattern wasn't extended to cover its name.
2. **Pattern grep** (defense in depth). A CI check runs against every PR targeting `main` that greps the source tree for known QC entry points (`/internal/`, `internalRoutes`, `netQcController`, `personsQcController`, `internal_qc` schema table names) and fails the build if any are found. The grep pattern list is maintained alongside the QC retirement PR.

The retirement PR adds both layers to `.github/workflows/ci.yml`. R1 sign-off asserts both layers are present and green.

## 31. Primary-maintainer test-user retirement (go-live gate)

The primary-maintainer build-on-switch test user and all its scaffolding are a hard go-live gate: no production deployment may carry the journey builder, its build-then-switch route, its catalog entry, or the build-on-switch plumbing that supports it. The test user is an initial-testing aid that drives the real registration / verify / claim / onboarding / upload flows against a real-data dev or staging database; it is not a product feature. Retirement is deletion, not a post-launch tidy-up: it deletes the scaffolding only. The test user logs in with a synthetic test address and claims its Hall-of-Fame legacy record by `legacy_member_id`, so no maintainer email lives anywhere in the system to remove; admin, when present, comes only from the operator's own dev admin allowlist, not from the persona itself.

Sign-off on this retirement is a prerequisite for the §24 State 3 → State 4 transition.

**Retirement inventory** (canonical list; the retirement PR maintainer extends this list if files have been added since):

- Delete `src/testkit/davidJourney.ts` (the journey builder) and `src/testkit/personaBuildSwitchRoute.ts` (the build-then-switch route).
- `src/testkit/canonicalPersonas.ts`: remove the build-on-switch catalog entry.
- `src/testkit/personaFactory.ts`: remove the `buildOnSwitch` field from `PersonaSpec`.
- `src/testkit/devRoutes.ts`: remove the `/build-switch` route registration and its import.
- `src/testkit/personaSeedRunner.ts` and `src/testkit/personaRefreshRunner.ts`: remove the `buildOnSwitch` skip branches and the refresh discovery-by-slug pass that tears down build-on-switch members.
- `src/testkit/personaListingRoute.ts`: remove the `buildOnSwitch` switch-href and the build-on-switch row override.
- Tests: remove the build-on-switch assertions in `tests/integration/devPersonasListing.test.ts` and the build-on-switch teardown case in `tests/integration/persona-refresh.service.test.ts`.

**Database and operator-environment teardown** (staging, before the code deletion lands):

- Run persona Refresh (`POST /dev/personas/refresh`), which releases the test user's claimed legacy account back to unclaimed (never deletes the real legacy or HoF record) and deletes the member row, media, and club leadership/affiliation rows. No email mutation needs reverting: the build never writes a maintainer email into the legacy record, and the synthetic login address is not a real mailbox.

**Automated enforcement**: two layers, paired so a rename can't silently slip through:

1. **Positive-assertion test** (preferred). A test asserts that the named scaffolding files (`davidJourney.ts`, `personaBuildSwitchRoute.ts`) no longer exist in the source tree, keyed to this inventory; absence is the success signal.
2. **Pattern grep** (defense in depth). A CI check on every PR targeting `main` greps the source tree for known entry points (`davidJourney`, `personaBuildSwitchRoute`, `buildOnSwitch`, `build-switch`, `david_leberknight`) and fails the build if any are found.

The retirement PR adds both layers to `.github/workflows/ci.yml`. Sign-off asserts both layers are present and green, and that no member carrying the test user's slug remains in the production-bound database.
