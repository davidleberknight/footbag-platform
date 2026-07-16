# Footbag Website Modernization Project -- Migration Plan

**Document Purpose:**

This document is the go-live plan for the footbag.org migration: the coordination with the people who hold the legacy facts and decisions (the legacy-site webmaster, the IFPA secretary, and the project manager), the pass/fail cutover gates, the operational states and sequencing, and the operational-readiness checklist (backup, observability, edge security, IAM, email ops, maintenance jobs, secrets rotation, pre-cutover reverts). It is a roadmap, not a design home. The migration design it coordinates (the three-table identity model, the claim and auto-link flows, merge rules, club bootstrap and classification, the name and competition-history model, schema deltas, and the audit-event catalog) lives in the canonical docs (the Legacy Data Migration decision in DESIGN_DECISIONS, the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories, DATA_MODEL, DATA_GOVERNANCE, and the legacy_data pipeline docs); this plan references those homes rather than restating them. For functional requirements see `USER_STORIES.md`; for privacy and visibility policy see `DATA_GOVERNANCE.md`.

It opens with front-matter sections for coordination with the people involved: a summary of the migration, the open questions that need the webmaster's input, a recap of the decisions of record, who decides what, and the group and email requirements discovery Julie leads. The numbered sections that follow carry the gates, the operational states, the sequencing, and the operational-readiness detail.

---

## Summary

The new footbag.org platform absorbs three bodies of legacy data:

1. **Historical record**: events, results, persons, honors (Hall of Fame, Big Add Posse), clubs, club affiliations, and club leadership, built from human-curated CSV plus extraction from the project's offline mirror of the legacy site. Published regardless of whether anyone claims the underlying identity.
2. **Legacy member accounts**: every login-bearing account from the live legacy site, imported from a one-time export into a permanent archival table. No passwords or credentials ever move; members reconnect to their old identity through a voluntary, always-confirmed claim flow after registering on the new platform.
3. **Operational readiness**: backup and restore, observability, edge security, email deliverability, scheduled jobs, secrets rotation, and the pre-cutover checklist.

The migration is one coordinated production go-live: no phased production delivery, no parallel systems. Preparation happens in advance — data rehearsals, Google Workspace provisioning and Google Group setup, archive capture, SES verification, the early inbound-mail (MX) move to Google, the DNS zone transfer to Route 53, and replacement-service testing — and advance preparation is not phased delivery: the website, retained inbound email, platform outbound email, retained discussion groups, the read-only archive, and every other required service activate together at go-live. Before go-live the `footbag.org` zone becomes authoritative on Route 53 under IFPA-controlled access, so the cutover itself is an operator-executed DNS change: `www` and the apex become alias records to the platform's CloudFront distribution (`www` is the canonical host; the apex 301-redirects to `www`) and the legacy site goes dark. Outbound mail becomes the platform's, sent via SES; inbound role addresses move to Google Workspace, every active address provisioned before legacy delivery is withdrawn (the SPF amendment, SES DKIM, and Google MX records are published on the zone as advance preparation). At the final-export moment the legacy member system is frozen read-only permanently (one-way — it never takes member writes again); the export is taken from that frozen state, so the import is one clean snapshot with no delta reconciliation. After go-live verification the remaining legacy production services are stopped: there is no live legacy site, mail, list, media, proxy, or application service afterward, and no standing legacy server kept for rollback. Recovery within the monitored window is fix-forward or a platform-side restore, with any DNS action operator-executed on the low-TTL Route 53 zone; a legacy fallback exists only as a read-only reconstruction from a tested encrypted artifact, reserved for catastrophic failure. Post-go-live retention of legacy material is limited to encrypted, non-public recovery and reference artifacts under IFPA-controlled access. Functionality not in the first release is built natively afterward, complete by Worlds 2027; legacy is never relied upon. Historical content lives read-only at `archive.footbag.org`.

Governing principle (the requirement of record, put to the webmaster on 2026-07-13): no required website, email, mailing-list, DNS, data, media, registration, or application function may remain dependent on legacy infrastructure after go-live, and "keep it running on legacy" is not an allowed final disposition — every legacy function is migrated, replaced, archived, or deliberately retired before shutdown. Julie leads active requirements discovery with current users, group owners, moderators, event organizers, and the IFPA board to determine which communication and governance functions survive and what records are retained; Steve supplies the remaining legacy facts and approved missing artifacts, performs the registrar, DNS-transfer, final-export, and provider actions that only his access permits, co-plans and rehearses the DNS cutover, and executes the legacy-side shutdown; Dave converts the confirmed requirements into implementation, runs the one coordinated go-live, and verifies the legacy shutdown to completion with Steve.

The legacy-site webmaster has delivered the legacy data; it is under analysis by the historical-pipeline maintainer, and the export-dependent rows in the table below carry that status.

---

## Open questions for the legacy-site webmaster

These are the decisions that involve the legacy-site webmaster. Each is labelled with its status, and **only the items marked "Still open" or "Reopened" need an answer**; everything else is resolved — settled, required by design intent, confirmed against the data, or no longer applicable — and kept here for the record. The numbers are fixed labels referred to elsewhere in this plan (§19 uses an independent 1-37 numbering; §28 refers back to these front-matter numbers as "front-matter question N").

Where each question stands under the single coordinated go-live: **Settled or required by design intent**: 1, 8, 12, 16 (the clean DNS switch on Route 53 and the end of legacy mail at go-live are required by the no-legacy-dependency design intent; the write-freeze-and-export action and in-platform impersonation handling are settled). **No longer applies**: 5 (no legacy subdomain stays live, so there is nothing left to monitor). **Reopened, needs verification**: 9 (the Google Workspace account facts must be confirmed rather than assumed), 19 (evidence shows a forum existed on the legacy server after all, so its fate must be confirmed). **Confirmed against the delivered data, to be checked again on the final export**: 10, 11, 17. **Still open, needing an answer from Steve or Julie**: 2, 3, 4, 6, 7, 13, 14, 15, 18, 20, 21, 22, 23.

Four answers set the go-live calendar and are asked for first: the committee and board membership table (detailed later in this plan, §28), the list of mailboxes and mailing lists (questions 6-7), confirming the registrar and moving the DNS zone to Route 53 (question 2), and Julie's discovery of which groups and email addresses people still actually use (her own section below). Each one blocks a step of the cutover — starting membership tiers, switching the mail, switching the DNS, and standing up the replacement groups and lists — so answering them early is what sets the schedule.

Open questions owned by the IFPA secretary and the community-requirements discovery rather than the webmaster are tracked in their own sections, not the list above, and are all still open: §19 items 35 (legacy group activity), 36 (group communication home), and 37 (sanctioning workflow depth); the seven items in §20a; and the IFPA list-mail questions in §29.12a.

**Architecture and DNS**

**1. Front-door architecture: one clean DNS switch. Required by design intent: no hard dependency on legacy tech after go-live.** At go-live the `www` and bare-domain records point at the new platform and the legacy site goes dark; nothing is proxied through the legacy server, and it needs no TLS certificate. The switch is made by the operator on Route 53, since the zone moves there beforehand (question 2), with Steve involved in planning and rehearsing it. If something goes badly wrong during the watch window, recovery is fixing forward or restoring the platform from its own snapshot; any DNS change in that window is likewise made by the operator on the low-TTL zone. A smoke test proves the whole path before the switch.

**2. DNS registrar and the zone move to Route 53. Still open — go-live preparation, done with Steve.** The `footbag.org` DNS zone moves to Route 53, under IFPA-controlled access, before go-live. This is advance preparation, not a phase of production delivery: after the move the records are managed by the operator, the go-live switch and any emergency DNS change no longer rest on one person being reachable, and the bare domain is served as a simple alias to the platform (Route 53 supports an alias at the bare domain; bind9 does not, which is why the earlier design needed a separate redirect server — with the move, that server is never built). Steve's part, since only he has the access today: confirm which registrar holds the domain and where the zone is served, get the registrar account under IFPA control, and make the name-server change that points the domain at Route 53. His bind9 DNS service retires once the move completes and nothing still resolves through it. IFPA owns `footbag.org`, the only domain the cutover touches. Separately and at low priority (not a cutover dependency): confirm whether IFPA still owns `footbag.sport` and `footbag.us`, and decide whether to keep them (to stop a look-alike site, or to redirect typos to `footbag.org`) or let them lapse.

**3. Legacy subdomains. Still open — one ruling per subdomain, and none stays on legacy.** The go-live switch moves the bare domain and `www`; every other `*.footbag.org` name needs its own ruling before go-live. Checked against live DNS (July 2026), the names still resolving are: the mailing-list hosts `list.` and `lists.` (both exist), the IFPA group-mail host `ifpa.` (its mail routing is still live), the WordPress event-sites host, the media hosts `photo.` and `video.` on their own server, `v.` (a shortcut that aliases to `www` — it must be retired or re-pointed at the move, or it will silently follow `www` to the new platform and break), and two old names still pointing at the media server (`quebec.`, `ifc.`). None has a TLS certificate; all are plain HTTP, which is itself disqualifying: an HTTP host on `.footbag.org` would expose the platform's login cookie once the cookie widens to the whole domain, so no legacy name may stay resolvable after go-live. "Keep it running on legacy" is not an allowed outcome: each name is replaced by a platform or IFPA-controlled service, captured into the read-only archive, or deliberately retired with its users notified where that matters, and the legacy services behind retired names are shut down. Once the zone moves to Route 53 it carries records only for names that survive under this rule, so after go-live no `footbag.org` name resolves to legacy infrastructure. That also simplifies the session-cookie question: the only other host sharing the `.footbag.org` login cookie is the platform's own `archive.footbag.org`, which is served over HTTPS. Steve's zone file (already provided) plus this live-DNS check are the checklist for making sure every name gets a ruling; the reference wiki is a path on the main site, not a subdomain, so it goes dark with the main switch and only its content disposition remains open.

**4. Reachability through the go-live window. Reduced by the Route 53 move, but not gone.** Once the zone is on Route 53, the go-live switch and any emergency DNS change are made by the operator, so an incident no longer depends on reaching one person. What still needs Steve reachable, agreed in advance: the write-freeze and the final member export happen on his systems just before the switch; he co-runs the cutover rehearsal on a test subdomain beforehand; and the legacy-side shutdown steps after go-live verification are his to execute. Recommendation: agree the go-live window with Steve ahead of time and keep a direct channel open with him through it.

**5. TLS on retained legacy subdomains. No longer applies.** No legacy subdomain stays live after go-live (question 3), so there is no legacy host left to assess or monitor. The July 2026 DNS check confirmed why this rule matters: every live legacy subdomain runs plain HTTP with no TLS certificate, and an HTTP host under `.footbag.org` would expose the platform's login cookie once the cookie widens to the whole domain. After go-live the only host sharing that cookie is the platform's own `archive.footbag.org`, whose HTTPS is managed by CloudFront.

**Email**

**6. A list of footbag.org mailboxes and aliases (real mailboxes versus forwarding). Still open.** Every address still in use must exist on Google before mail is repointed there, or its incoming mail is silently lost. Recommendation: the webmaster lists every footbag.org address, noting which are real mailboxes versus forwarding and which are actually used, and every active one is created on Google before the mail switchover.

**7. Mailing lists: what exists, and what happens to each. Still open.** The new platform sends mail out but never receives mail, so a list matters only by whether people email into it. Recommendation: sort each list into two kinds. A discussion list that members post to by email has no equivalent on the new platform, so it moves to a Google Group or is retired. A one-way announcement list becomes a platform announcement, sent out through the platform. Decide each before the mail switchover so nothing stops working.

**8. Email cutover and the inbound receiver. Required by design intent: no hard dependency on legacy tech after go-live.** From go-live the platform sends all outbound mail through SES, and Google Workspace receives all inbound `@footbag.org` mail: the domain's MX record points at Google, and every address still in use exists on Google before legacy mail delivery is withdrawn. The supporting DNS records (the SPF change, the SES DKIM records, the Google MX) are published as advance preparation — by Steve while he still runs the zone, or by the operator once the zone is on Route 53. The MX switch itself may also run early as a discrete preparation step, with the legacy mail path kept only as a pre-go-live fallback; that is preparation inside the one coordinated go-live, not a phase of production delivery, and its exact timing is flexible. Either way, at go-live legacy mail delivery ends. The per-address and per-list inventory (questions 6-7, with Julie's discovery) supplies the provisioning facts.

**9. Who owns and administers the Google Workspace account. Reopened — the facts must be verified, not assumed.** The intent stands: the IFPA board owns the Workspace, administered by the IFPA secretary together with a platform maintainer. But the account's actual state is unverified, so before it can carry the organization's mail it must be confirmed: which Workspace edition it is, who the legal and billing owner is, which domains it covers, who the current super administrators are, what the recovery contacts are, who controls domain verification, and whether a nonprofit conversion or other account change is needed. Julie has had a Workspace account since 2009, but its contact details may be stale; Steve and Julie restore her access through a secure channel, she verifies the facts above, and she and the board approve the future administration and recovery model. Before go-live, at least two IFPA-authorized administrators must have tested, recoverable access. No one is promised a permanent administrative role until governance approves it.

**Data and export**

**10. What the export columns mean. Confirmed against the delivered test dump; re-confirm on the final export.** The delivered dump answered the column-semantics questions: the member-account id column is identified; there is no banned column, so questionable accounts go to admin review rather than being auto-blocked; the announce opt-in is present; and the old member table does contain a password column, so the extraction strips credentials out and never loads them. One item is not yet closed: that the export's id namespace matches the mirror/profile-URL namespace the back-links depend on is still pending the comprehensive namespace cross-check (§19 items 10-11; gate WM4, the namespace-agreement confirmation). All of this is re-confirmed against the final post-freeze export.

**11. Whether the tier and payment history is rich enough to map tiers fully. Confirmed against the delivered dump; re-confirm on the final export.** The delivered dump confirmed the paid-history inputs are present (tier, expiry, paid flags, payment dates, join date, and the payments table). Board-at-cutover status is not yet in hand: the committee tables are small but were omitted because the whole `groups/backups/` directory was left out to avoid the 1.2GB `ifpa_group_messages` archive in the same app; the webmaster will supply them in `groups/backups/latest.sql`, so the committee data exists and is pending delivery rather than empty. The board-at-cutover derivation scaffold is implemented and tested in the extractor (emitting both board fields) but ships inert, making no positive board determinations until the committee-table rows are delivered; the legacy admin PHP (`members/admin/tierconvert.php`) confirms `MemberIFPATier` is only 0/1/2 and does not encode a board tier, so the committee delivery is the sole unblock, with honors-only as the contingency only if the board data proves insufficient.

**12. Final member export after the permanent write-freeze. Settled (an action).** The webmaster freezes the legacy member system read-only permanently (one-way — it never takes member writes again), then produces the final member export from that frozen state, so the import is one clean snapshot with no delta reconciliation. Only the legacy member system needs the freeze; the pipeline data is already authoritative.

**Cutover logistics**

**13. Write-freeze moment and the notice members see. Still open.** Settle the coordinated moment the legacy member system goes permanently read-only (just before the final export) and the notice members see from then on (directing them to the new site). The freeze is one-way; legacy never re-opens to writes.

**14. What legacy data is kept after go-live, and in what form. Still open — the custody model needs agreeing.** Once the import is checked, the platform's own copy of the member records is the lasting archive. Anything else kept from legacy after go-live exists only as encrypted, non-public recovery and reference artifacts under IFPA-controlled access — never as a running system. Recommendation: keep the final export and the pre-switch snapshot through the watch window plus about thirty days for recovery and dispute lookups, then destroy the working copies on recorded destruction dates; Steve's own raw copies are destroyed on the same schedule once shutdown completes, since keeping legacy personal data longer serves no purpose.

**15. What milestones end Steve's temporary role. Still open — confirm the list with him.** The role ends on milestones, not a calendar date: the DNS zone moved to Route 53; the email transition complete; the final member export delivered and verified; every subdomain and legacy function dispositioned; the legacy-side shutdown executed and verified together; and the agreed recovery artifacts captured, encrypted, and handed to IFPA custody. When the last milestone closes, nothing further is asked of him. Recommendation: confirm this milestone list with Steve, along with a light review cadence until it is done.

**Community knowledge and feature scope**

**16. Impersonation is handled in-platform, not by the webmaster. Settled.** Every claim is gated by the identity-link matching rules (the claimant's current or declared former surname must match the record, with the declared old emails and date of birth as additional private anchors); the registration-time name-collision prompt flags same-name signups; honor flags are validated a priori against the public rosters; and a suspected fraudulent claim is raised to the admins and reverted through the dispute path. No honors-bearing claim is self-asserted without these controls, so impersonation needs neither a separate pre-check gate nor a webmaster risk assessment.

**17. Whether old bans still matter. Confirmed against the delivered dump (no ban field); reconfirm on the final export.** The delivered data contains no ban records at all: there is no banned, blocked, or suspended field anywhere in the dump; the only status signals are `MemberValid` and `MemberEmailInvalid`, with no dedicated inactive column. The test-load report counted roughly 8,000 accounts flagged by one of these signals (re-confirmed on the final export); a cleared `MemberValid` is the §2 source-validity-filter exclusion, not a ban. So there is probably nothing to carry over. The ask: the webmaster confirms whether the final export carries any banned, blocked, suspended, or inactive field (the test dump had none; reconfirm on the final export), and whether any bans were ever enforced outside the database. If neither, this question is moot. Either way, the recommendation is to keep any legacy ban as a background note only, never blocking a claim, since old bans are probably stale and often have unknown reasons and the new platform has its own tools for handling misbehavior. Move to enforcing specific bans only if the webmaster and board say they still matter.

**18. What the legacy tournament tool ("tournament in a box") actually does. Still open — needed as requirements, not as software.** The tool runs Worlds 2026 and is then completely replaced by a native one built in time for Worlds 2027 (decision 21); the legacy system itself is never carried forward. What is needed from Steve is a written description of what it does today — the functions organizers actually use, in his words — which becomes the requirements baseline for the replacement. Until that exists there is nothing to design against, and building blind risks building the wrong thing.

**19. Forums. Reopened — evidence shows a forum existed on the legacy server.** The delivered repository contains no forum application code or data, and an earlier review over-concluded from that absence that no forum ever existed. The repository itself says otherwise: a character-set migration tool in the legacy code names a phpBB forum database and its tables, and a saved shell history from the production server shows the forum database being opened and a neighbouring forum configuration file being read. So a phpBB forum demonstrably existed and ran on the host, outside the delivered repository. Steve confirms its current state — still installed, long dead, or already deleted, and whether its database survives. If any forum content survives, it gets the standard treatment: captured as read-only archive content or given an explicit accepted-loss decision; nothing stays live.

**20. Which features launch in the first version versus later. Still open.** This sets the MVP scope and the post-MVP native-build roadmap. Recommendation: ship the full pipeline-authoritative public content plus member/auth/admin in v1 (with the member import, native announce, news feed, and live Stripe), and build the rest natively afterward (complete by Worlds 2027). Nothing stays on a live legacy server; discussion lists move to Google Groups or retire (Julie scoping).

**21. What to do with the legacy data domains that are out of scope. Still open.** The old data also holds galleries and media, freestyle tricks, governance records, rankings, news, the rulebook, polls, and translations. Recommendation: galleries and media are served from the archive site and not imported; the rest are catalogued now so nothing is lost, with the decision on each deferred until there is a real reason and a user story to migrate it; otherwise the default is to archive or drop. The IFPA governance records specifically (the election, issue, and privately-cast vote tables) are an IFPA governance decision, not the webmaster's: the IFPA secretary rules on their disposition, and the recommended posture is to archive them encrypted and sealed, the same treatment as the legacy email archive, never published, since they include privately cast votes.

**22. The WordPress event sites behind sites.footbag.org. Still open.** The legacy host serves a set of WordPress sites (years of Worlds event sites) under the operator-only sites.footbag.org name. Recommendation: capture them as read-only archived content (static snapshots), then decide per site whether to re-host, consolidate, or retire; treat sites.footbag.org as private and not-for-publication. Nothing stays on a live legacy server.

**23. The /reference/ MediaWiki instance. Still open.** A MediaWiki (version 1.6.8, with a custom `FootbagAuth.php` single sign-on) runs at the /reference/ path, its source on the legacy host and its database not yet delivered. Because that engine version is far out of security support, the recommendation leans to archive-or-retire rather than re-host: catalogue it now, capture its content as read-only archived content, and decide archive or retire later; the webmaster confirms its current state and supplies the database if any disposition needs it. Nothing stays on a live legacy server.

---

## Decisions made

These are the decisions of record. Some are settled agreements with the people involved; others follow from the design intent that nothing depends on legacy tech after go-live, and are marked as required by that intent rather than claimed as agreed. Each stands unless a noted open question revises it.

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

**13.** Front-door architecture is one clean DNS switch, executed by the operator on Route 53 (required by design intent: no hard dependency on legacy tech after go-live). At go-live `www` and the bare domain become alias records to the platform's CloudFront distribution and the legacy site goes dark; `www` is the canonical host and the bare domain redirects to it. Nothing is proxied through the legacy server and it needs no TLS certificate. There is no separate redirect server: Route 53 serves the bare domain as an alias, which bind9 could not, and the zone moves to Route 53 before go-live. A smoke test proves the whole path before the switch.

**14.** Cutover is the operator switching the `www` and bare-domain records on Route 53, gated on the smoke test and planned and rehearsed with Steve; a database snapshot is always taken just before the switch. Recovery within the 48-hour watch window is fix-forward or a platform restore from that snapshot first, with any DNS change likewise operator-made on the low-TTL zone. No legacy server stays running for rollback: for a catastrophic failure only, a read-only legacy fallback can be reconstructed from a tested encrypted artifact (the member system stays frozen either way).

**15.** The platform owns outbound mail via SES from go-live; legacy mail delivery ends at go-live. Inbound `@footbag.org` addresses move to Google Workspace: the MX points at Google and every active address is provisioned there before legacy delivery is withdrawn (question 8). The supporting DNS records land as advance preparation, and the MX switch itself may run early as a preparation step with flexible timing — preparation inside the one coordinated go-live, not a phase of production delivery.

**16.** DNS hosting moves to Route 53, under IFPA-controlled access, before go-live — advance preparation, done with Steve (required by design intent: no hard dependency on legacy tech after go-live). Steve performs the registrar and name-server actions that only his access permits, and his bind9 service retires once the move completes and nothing still resolves through it. Registrar details are open question 2.

**17.** The webmaster's temporary role ends on milestones, not on a calendar date. The milestone list is open question 15.

**18.** The new platform uses its own URLs; they do not mirror the old site's URLs, and there is no general old-to-new mapping. A bounded set of links that appear in old footbag.org emails are forwarded by explicit handlers that resolve a legacy id or slug to a live record if one exists. An old member-profile link is resolved by its legacy account id: if a live member has claimed that account, the visitor is sent to that member's page; if the account exists but is unclaimed, to a claim landing page; otherwise to a friendly not-found page. An old club link is sent to the club's page if that club still exists, otherwise to the archive. Anything unrecognized shows a friendly not-found page. All other legacy content lives only on the read-only archive site.

**19.** The internal quality-control subsystem is removed at go-live.

**20.** The new platform does not implement single-sign-on with the legacy site, and no credentials ever cross. No legacy login exists after go-live: no legacy password or session is imported or accepted anywhere, and the archive site is read-only. The voluntary claim flow is the only identity bridge.

**21.** Worlds 2026 runs on Steve's legacy registration and tournament tool, and go-live is sequenced to follow that event, so no registration dependency ever crosses go-live. The platform's own event system handles events from go-live onward, and no legacy registration data is imported. The tool is then completely replaced by a native one built in time for Worlds 2027; the legacy system's only ongoing relevance is as a source of requirements for that replacement. Julie confirms with the Worlds 2026 organizers which functions they actually use and what data they need after the event; no registration export is requested from Steve unless that confirmation establishes a need, and afterwards the system is archived (approved source or data only) and retired.

**22.** Historic tournament and registration data (the legacy multi-table tournament system) is not imported. The platform's canonical historical results are cleaner and authoritative; a future tournament feature, if built, models fresh rather than importing legacy data.

**23.** No legacy communication path goes dark at cutover unless it has been explicitly inventoried, classified, and either migrated, replaced, redirected, archived, or deliberately retired with stakeholder sign-off — "kept running on legacy" is not one of the options. Operationalized per-function in §19 item 26 and §29.12a constraint 5.

**24.** No old governance data, such as IFPA voting records, is deleted unless the right people confirm that deletion is acceptable. Disposition of IFPA-owned legacy records is an IFPA governance decision (the IFPA secretary rules), never an operator or maintainer decision. Enforced by the sealed-archive treatment in §29.12a (applied to IFPA governance records per §28) and the Sealed Legacy Email Archive decision in DESIGN_DECISIONS (§6.5a).

---

## Who decides what

So no question waits on the wrong person:

**Steve, the legacy webmaster**, is the authoritative source for how the legacy system actually runs — the facts that are not in the delivered code and data. His remaining part: supply the missing agreed data (the committee tables, and any artifact approved for preservation); confirm the runtime-only pieces (sendmail and its aliases, apache, bind9, generated alias files, host-only scripts and scheduled jobs); confirm how mail actually routes today (real mailboxes versus forwards, and list behavior); run the final write-freeze and export; perform the registrar, provider, and account actions that only his access permits; execute the legacy-side shutdown; and help capture the recovery artifacts. He is never re-asked for what he has already delivered: the repository and data dumps are analyzed first, and he is asked only for what they cannot show. Steve does not decide whether the production migration is phased, whether a legacy service remains, the platform's architecture, IFPA governance, which records IFPA keeps, or what ships in version 1 — if he believes something must stay live past go-live, he names the service, its current users, the evidence of use, and why it cannot be migrated, replaced, archived, or retired, and that goes to the right decision-maker.

**Julie, the IFPA secretary**, leads the group and email requirements discovery (next section) and routes governance questions to the IFPA board. IFPA records questions are hers to rule on, and she co-administers the Google Workspace once its facts are verified.

**Dave, the project manager**, consolidates the evidence (repository, dumps, correspondence), keeps the gap list, turns confirmed requirements into implementation, owns the technical architecture and the go-live and shutdown plans, and decides technical scope once the governance requirements are known.

**The IFPA board (or the IFPA authority it designates)** approves: which official groups and addresses survive; what happens to private group messages, private votes, and governance records; Workspace governance; who may access preserved archives and for how long; any deletion or accepted loss of IFPA-owned records; and notices to affected users where required.

---

## Active group and email requirements discovery (Julie)

Julie is actively gathering requirements now, from the people who actually use these things — current group owners, moderators, committee members, whoever sends or receives through each address, current event organizers, the IFPA board, and anyone else discovery turns up. Old database flags, historical committee rosters, generated aliases, or the mere existence of an address are not evidence of current need (on Steve's report, the job that generated list membership from the member tables was suspended around 2024, so generated aliases are stale).

For every potentially active group, committee, list, or role address, discovery answers: what is it used for today; does it still serve a real IFPA or community purpose; who owns or leads it; who receives, posts, or sends through it; does it need moderation or membership restrictions; what kind of thing is it (discussion group, announcement list, role address, mailbox, or forwarding alias); when did it last carry real non-spam traffic; what breaks if it disappears; do its users need continuity on day one; does its history need preserving, and who may read the preserved history; and must anyone be notified.

The output is one ruling per group and per address, approved at the right governance level: move it to Google Workspace; move it to Google Groups; replace it with a platform feature; replace it with another approved non-legacy service; archive it; or retire it. Discovery is done when every potentially active group, committee, list, and address has a documented current-use finding; every kept function has a named replacement; every retired function has an approved decision and, where needed, a notification plan; and no active communication need is left unresolved at go-live. Discovery gates go-live: it is one of the four schedule long poles named above.

---

## Table of contents

### Webmaster coordination

- [Summary](#summary)
- [Open questions for the legacy-site webmaster](#open-questions-for-the-legacy-site-webmaster)
- [Decisions made](#decisions-made)
- [Who decides what](#who-decides-what)
- [Active group and email requirements discovery (Julie)](#active-group-and-email-requirements-discovery-julie)

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
23. [Build stages](#23-build-stages)
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

- **Legacy-site webmaster coordination**: the front-matter sections above (Summary, Open questions, Decisions made, Who decides what, and Julie's discovery section); §19 carries the contract-grade detail behind them.
- **Cutover operators** (running the migration day): §22 (gate index), §24 (state transitions), §25 (validation gates), §27 (rollback), §29 (operational readiness).
- **AWS / DNS / email infrastructure**: §29 (operational readiness). §29.12 and §29.12a carry the DNS-cutover and mail disposition.
- **Open issues**: the open-questions table above; §28 holds internal open items.
- **Migration design** (identity model, claim and auto-link flows, merge rules, club bootstrap and classification, name and competition-history model, schema, audit events): not in this plan. See the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5), the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories, DATA_MODEL, and the legacy_data pipeline docs.

For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `DATA_GOVERNANCE.md`.

---

## Part A -- Design

## 1. Executive summary

The front-matter Summary carries the orientation: the three workstreams (historical pipeline, legacy member accounts, operational readiness), the clean DNS-cutover front door, and the step sequence to go-live. The migration design this plan coordinates lives in the canonical docs (the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5), the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories, DATA_MODEL, DATA_GOVERNANCE, and the legacy_data pipeline docs); this plan carries the coordination, the gates, the operational states, and the sequencing. Hall of Fame and Big Add Posse are abbreviated HoF and BAP throughout.

---

## 2. Migration sources

Two legacy data bodies feed the platform. The historical pipeline (events, results, persons, honors, clubs, affiliations, and leadership) is built under `legacy_data/`; its design is the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5), its inventory is in `legacy_data/CLAUDE.md`, and the club bootstrap rule, structural signals, and leadership activation paths are in the `M_Complete_Onboarding_Wizard` user story. The legacy member-account import populates the `legacy_members` table; the imported-row model and field set are in DATA_MODEL Legacy Members (§4.14b), and the credential exclusion, the `MemberValid > 0` source-validity filter with its counted-exclusions report, and the mirror pre-seed that the final export supersedes are owned by the loader in `legacy_data/member_data_scripts/`. The cutover sequence that runs these is the operational states (§24); the data-quality gates are the validation gates (§25).

---

## 3. Tier handling at claim

Under the three-table design, `member_tier_grants` is a ledger keyed by `member_id`; so no ledger row exists for an unclaimed legacy account (there is no member yet). The tier-grant mapping is applied at **claim time**: when `M_Claim_Legacy_Account` (or the direct-historical-person claim, or admin manual recovery) completes for a given `legacy_members` row, the claim transaction writes one `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` using the legacy state captured on `legacy_members`. No `active_player_grants` row is written at migration; Active Player is earned post-cutover via the new sources (IFPA-website event attendance, vouching, or first IFPA club join).

The tier-grant mapping itself (the per-standing precedence and the Tier 3 underlying derivation) is the rule defined in the `M_Claim_Legacy_Account` user story and is not restated here. This section covers only the cutover sequencing.

The five `legacy_*` tier-state fields the mapping reads (see DATA_MODEL Legacy Members, §4.14b) are a deferred schema extension on `legacy_members` (or staging), populated by the loader and gated on test-load validation per §15.16 and §25 gate G6; the board-at-cutover input depends on the committee table. A field that is not loaded (data undelivered, or held back at validation) simply does not fire, so the affected claims grant on whatever standings are present; an account with only honors is granted on that basis. Held-back fields are recorded in §28.

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

Auto-link links each `historical_persons` row to its `legacy_members` provenance, and stages candidate matches between a live member and a `legacy_members` / `historical_persons` row for the member to confirm in the onboarding wizard (no email is sent and no live table is mutated until the member confirms). The anchors, the evidence-strength tiers, multi-record handling, the anchor-uniqueness fallbacks, name-variant matching, cross-source detection, and the a-priori honors validation are specified in the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the `M_Claim_Legacy_Account` user story. The one-time batch auto-link staging job runs at cutover (gate G24 in the validation gates, §25, sequenced in the operational states, §24); the remaining dump-gated claim surfaces clear gates G22, G23, and G25.

---

## 8. Self-serve claim flow

The member's claim experience (the five identity-reconciliation cases, the anchors, the direct historical-record claim, the registration-time conflict prompt, the dispute path, the non-revealing anti-enumeration messaging, the rate limiting, and the claim-ineligibility predicates) is specified by the `M_Claim_Legacy_Account` user story and the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5). Two of its invariants are go-live gates: the non-revealing-messaging invariant is gate G17 and claim-surface rate limiting is gate G18 (validation gates, §25).

---

## 9. Merge rules

When a claim resolves, the active modern account always wins and editable fields are copied from the claimed `legacy_members` row (honors by OR, profile fields fill-if-empty, first competition year by COALESCE, a single `member_tier_grants` row, and the historical-person merge), with concurrent-claim races resolved by the partial UNIQUE indexes. The full field-by-field merge and the race handling are specified in the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the `M_Claim_Legacy_Account` user story.

---

## 10. Club bootstrap and onboarding

Club bootstrap and onboarding is specified across three homes: the club classifier under `legacy_data/clubs/scripts/` with its overview in `legacy_data/CLAUDE.md` (the authoritative rule home for the four-way classification, its thresholds, and the R1-R10 rules); the `M_Complete_Onboarding_Wizard` user story (the registrant club flow and the bootstrap-leadership classification gates) and the `A_Periodic_Club_Cleanup` user story (the admin residue queue and cleanup predicates); and DATA_MODEL Migration Staging and Bootstrap Tables (§4.27) for `legacy_club_candidates`, `legacy_person_club_affiliations`, and `club_bootstrap_leaders`.

### 10.1 Club classification rules

The four-way classification (pre-populate, onboarding-visible, dormant, junk), its tunable thresholds, the duplicate-club merge, the junk signal-absence rule, the promotion paths, and the R1-R10 evidence columns are owned by the club classifier under `legacy_data/clubs/scripts/` and summarized in `legacy_data/CLAUDE.md`. Cutover quality is gate G7 in the validation gates (§25), which requires the club-only person extraction (§10.2) to run first.

### 10.2 Expanding historical_persons for club members

The roughly 1,700 club-only people from the mirror are extracted into `historical_persons` with `PROVISIONAL` provenance so the classifier's contact-active and member-active signals are not deflated. This is gate G12 in the validation gates (§25), and the pipeline runs it before classification (operational states, §24, State 1). The extraction is owned by the legacy_data pipeline (`legacy_data/CLAUDE.md`).

### 10.3 Club onboarding flow during registration

The registrant club-affiliation flow (Stage 1 cards, the wrap-up landing, the content-editing gates, and URL verification before publication) is specified in the `M_Complete_Onboarding_Wizard` user story.

### 10.4 Long-term cleanup

The admin-driven cleanup of legacy club residue (the on-demand cleanup queue, the labeled `pending` affiliations on rosters, the member flag mechanism, and the per-category terminal states) is specified in the `A_Periodic_Club_Cleanup` user story.

---

## 11. Onboarding wizard service

The onboarding wizard service (the per-member task list, the fixed task order of `personal_details` then `legacy_claim` then `club_affiliations`, and its storage in `member_onboarding_tasks`) is specified in the `M_Complete_Onboarding_Wizard` user story; the table is documented in DATA_MODEL Member Onboarding Tasks (§4.29).

---

## 12. Security model summary

The migration security and privacy rules (no credential import; `legacy_email` as metadata only; no auto-link emails; the optional mailbox-control upgrade; member-declared anchors kept member-and-admin private; imported rows that cannot log in, be searched, or be broadcast to; account-bound claim tokens; rate limiting on every claim surface; the non-revealing-messaging rule; bootstrap leadership conferring no live permission until confirmed; loosened name validation for imports; and the cookie-domain widening defended by the CSRF Origin pin) are specified in the Security, Privacy, and Historical Record Governance decision in DESIGN_DECISIONS (§3.9), the Account Security Tokens decision (§3.8), and DATA_GOVERNANCE.

---

## 13. Admin flows

Migration-time admin involvement is reactive. The member-initiated link-help request and the dispute revert are specified in the `A_Review_Member_Link_Help_Requests` user story, and the initial-admin bootstrap is the Administrator Role Lifecycle decision in DESIGN_DECISIONS (§2.9). The bootstrap grants satisfy go-live gate GV2 (§22).

---

## 14. User stories summary

The user-facing behavior referenced throughout this document is specified by the stories in `docs/USER_STORIES.md`, principally `M_Claim_Legacy_Account`, `M_Complete_Onboarding_Wizard`, `M_Edit_Profile`, `M_Delete_Account`, `A_Review_Member_Link_Help_Requests`, and `A_Periodic_Club_Cleanup`.

---

## Part B -- Contracts

## 15. Required schema changes

The schema the migration adds and the constraints it relies on are specified in DATA_MODEL (Members & Authentication §4.14, Legacy Members §4.14b, Member Tier Grants §4.12, Migration Staging and Bootstrap Tables §4.27, Member Declared Anchors §4.30, Staged Auto-Link Candidates §4.31, and Name-matching utilities §4.28) and are authoritative in `database/schema.sql`. One field below is cutover-conditional and stays tracked here because a go-live gate depends on it:

### 15.16 Tier-mapping fields on `legacy_members`

The five `legacy_*` tier-state fields read by the claim-time tier grant are specified in DATA_MODEL §4.14b (their meaning) and USER_STORIES `M_Claim_Legacy_Account` (the mapping that reads them). This section covers only their cutover handling.

Schema authority: `database/schema.sql`. The cutover database is built fresh from `schema.sql` plus loaders; the data-preserving deploy path `scripts/deploy-migrate.sh` must land before cutover readiness (gates OR9/OR9a in §22). The loader populates the five fields.

At test load (gate G6, §25), each field is spot-checked against known reference cases: members known to hold Tier-2 / organizer standing at cutover, board members at cutover, known Tier-1-lifetime members, and known active Tier-1 annual members. The three paid-tier fields derive from the member record's tier status at cutover (`MemberIFPATier` plus `MemberIFPAExpiration`); the `ifpa_memberpayments` history is not read for them — a deliberate simplification: current standing implies having paid, and lapsed standing grants on honors alone. A field whose values do not match the references (administrative corrections, refunded payments, test records, or other contamination) is left unpopulated; its basis then does not fire for any claim, and the other standings still apply. If the tier inputs are insufficient overall, the paid and board fields are left unpopulated and claims grant on honors alone. Whatever is held back is recorded in §28.

---

## 16. Data pipeline inventory

The data pipeline inventory (the curated and extracted CSVs, the generated outputs, and the pipeline script locations) is in `legacy_data/CLAUDE.md` and `legacy_data/README.md`.

---

## 17. Migration vs operational table classification

Which migration tables are permanent and which are droppable staging is documented per table in DATA_MODEL Migration Staging and Bootstrap Tables (§4.27).

---

## 18. Audit requirements

The migration audit events (the `claim.*`, `legacy.*`, `wizard.*`, `support.*`, and `club.bootstrap_*` action types and the required per-event metadata) are in the authoritative action_type catalog in DATA_MODEL Admin Operations (§4.9). No migration dashboard is required; the existing append-only audit history records all migration events.

---

## 19. What we need from the legacy-site webmaster

Steve, the legacy-site webmaster (contact at `brat@footbag.org`, the Canonical Email Addresses decision in DESIGN_DECISIONS, §5.5), is the current operator of the live legacy site. The front-matter open-questions table carries the live status of the webmaster items below; this section holds the contract-grade detail. The webmaster holds the legacy-system facts (DNS, mail, server config, data); Julie, the IFPA secretary, holds governance answers (membership policy, committees, records, rules currency). The written design in these canonical docs is the baseline; proposed changes arrive as specific doc-revision requests, and the maintainer keeps the canonical docs.

The webmaster is not asked to produce club data; that comes from the mirror pipeline (§20). The long-term operator pattern for coordinating with any external DNS/mail upstream is documented in `docs/DEVOPS_GUIDE.md` §6.8; this section applies that pattern to the webmaster's specific contract.

**Where answers are recorded.** As each item resolves, its facts are recorded in place rather than in a separate log: legacy server, stack, mail, and DNS facts inline in the relevant item here and in item 7; legacy-data schema and semantics (columns, status fields, id ranges, the per-app table catalogue) in §28 and §15.16; and quantitative validation results (row counts, import yields, coverage percentages) in the data-review sign-off audit entry (§20 item 5, §18). Canonical timeless docs (DESIGN_DECISIONS, USER_STORIES) carry no counts or status.

### 19.1 Architecture decision

1. **Front-door architecture (required by design intent)**: one clean DNS switch. At go-live the operator points `www` and the bare domain at the new platform on Route 53 (both as ALIAS records to the CloudFront distribution, which carries `footbag.org` / `www.footbag.org` as alternate domain names with the ACM certificate as ownership proof) and the legacy site goes dark; there is no reverse proxy on the legacy server (so no legacy TLS certificate) and no separate redirect server. A pre-cutover smoke test proves the path before the flip; recovery is fix-forward or a platform restore (§27). Client IPs reach CloudFront directly.

### 19.2 Legacy site and data export

2. **Legacy technology stack (known)**: a PHP application on MariaDB 10.1 (the delivered dump is a `10.1.48-MariaDB` `mysqldump`), served by apache2 with bind9 DNS and sendmail mail, per item 7. Established, so it no longer gates the export design: it confirms the export is a standard `mysqldump`.

3. **Member count and activity (in the delivered dump)**: the account count and per-row last activity are present in the delivered dump (the `members` rows and the `MemberLastLogin` column; the import dry-run figures are tracked in the §28 catalogue). These size the auto-link candidate pool, the SES production-access volume estimate, and admin-recovery capacity planning. Webmaster confirmation is optional, not blocking.

4. **Legacy hosting**: where is the legacy server hosted? (Self-hosted, VPS, cloud provider, shared hosting.) The legacy server is not in the live path at go-live and shuts down after verification (§19 item 31); recovery is platform-side (§27). The hosting answer still matters before go-live: it sizes the shutdown checklist (which machines and provider accounts must be closed) and the recovery-artifact capture.

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

9. **Credential exclusion**: password material is never imported (the Security, Privacy, and Historical Record Governance decision in DESIGN_DECISIONS, §3.9). The raw dump contains credential and session columns (the legacy `members` table carries `MemberPassword`, stored in **plaintext**, and `MemberSession`); the platform's extraction step drops them and never emits them into the loader input. As a hard backstop, the load step aborts before reading any row if any column header looks credential-bearing (password, hash, salt, secret, recovery, and the session/token/cookie/auth family, so a `MemberSession` or cookie column is caught too); attestation alone is insufficient, so this guard is mandatory.

10. **Namespace agreement for `legacy_member_id`**: confirm that the integer IDs in the export are the same integers used in the legacy site's `members/profile/{id}` URLs (the mirror-derived namespace). If they diverge, resolve before any test import; otherwise every `historical_persons.legacy_member_id` → `legacy_members.legacy_member_id` back-link in the pipeline is invalidated.

11. **Namespace verification protocol**: every `legacy_member_id` value from the test export is integer-format-validated and cross-referenced (comprehensive 100% reconciliation, not a sample) against the mirror-derived baseline ID range and `historical_persons.legacy_member_id`. The webmaster's export ID range and the mirror's must overlap; new IDs that exist only in the export are expected (post-mirror accounts) but the overlap region must agree row-for-row.


13. **Data-quality metrics (computed from the delivered dump, not webmaster requests)**: the deliverability estimate derives from the delivered `MemberEmail`/`MemberEmail2`/`MemberEmail3` columns and the `MemberEmailInvalid` flag (syntax plus MX checks), informing auto-link coverage projections; the last-activity timestamp is the delivered `MemberLastLogin` column, informing admin-recovery capacity planning. The legacy `bounces` table arrived empty, so any bounce-history refinement of the deliverability estimate is a separate optional ask.

14. **Final production export**: after write freeze, a fresh raw MariaDB dump, identical format to the test export.

### 19.3 DNS and infrastructure

15. **Zone authority: the move to Route 53 (go-live preparation)**: the webmaster, a DNS expert, holds and operates the zone today; before go-live the zone moves to Route 53 under IFPA-controlled access, as advance preparation done with him (front-matter question 2, decision 16). After the move the operator manages the records, `www` and the bare domain are served as alias records to the platform's CloudFront distribution at the switch, and no separate redirect server is needed (Route 53 serves a bare-domain alias; bind9 could not). Steve confirms the registrar, gets the registrar account under IFPA control, and makes the name-server change; his bind9 service retires once the move completes and nothing still resolves through it, which is also the moment DNS stops depending on his infrastructure. He stays involved through cutover: planning the record set, rehearsing the switch on a test subdomain, and sanity-checking the migrated zone against his zone file.

16. **Legacy subdomain inventory**: enumerate every `*.footbag.org` name and rule on each before go-live — replaced, archived, or retired; none continues resolving to the legacy host after go-live (front-matter question 3 lists the names still live as of July 2026, from Steve's zone file plus a live-DNS check). `archive.footbag.org` is reserved for the new platform per §29.15. Known items: the Majordomo list host `list.footbag.org` and the sibling `lists.` name (both resolve today; the frozen read-only listserv archive, 1994-1999, is capture-or-accepted-loss content); the operator-only WordPress event-sites host (front-matter question 22 — captured as read-only archives, not kept live); the media hosts `photo.` and `video.` (their content is handled under §29.15 archive completeness); `v.`, which aliases to `www` and must be retired or re-pointed at the switch; and the IFPA group-mail host, dispositioned with IFPA governance under §29.12a. The MediaWiki lives at the `/reference/` path on the main site, not a subdomain: it goes dark with the main switch, and its content disposition is front-matter question 23. Any private operator-only name is flagged private and not-for-publication.

17. **Records-actor (agreed: Steve until the zone moves, the operator after)**: while the zone is still on Steve's servers he applies maintainer-supplied records — the ACM validation CNAMEs for both certificates (early and permanent; they also drive renewals), the SES DKIM CNAMEs, the custom MAIL FROM records (`mail.footbag.org` MX and SPF TXT, needed for DMARC alignment), the SPF amendment authorizing the SES and Google senders, the DMARC record with its report mailbox, and the Google MX when the mail step runs early. Once the zone moves to Route 53 the operator manages all records there, including the go-live switch itself (`www` and the bare domain to CloudFront, and `archive.footbag.org` to the archive distribution). Per-record timing and verification commands are the §29.12 record inventory.

18. **Cutover coordination**: agree the switch sequence with Steve per §29.12 — smoke test green on a test subdomain, then the operator's `www` and bare-domain switch on Route 53, then the §27 monitored window. Low TTLs on those records let the switch and any emergency change take effect in minutes.

19. **Reachability protocol (reduced by the Route 53 move)**: DNS changes during the watch window are operator-made, so no delegate with standing DNS access is needed. What is agreed instead: the go-live window itself, and how to reach Steve through it for the write-freeze, the final export, and the legacy-side shutdown steps (front-matter question 4).

20. **TLS on the archive subdomain. Moot under the clean cutover.** There are no retained legacy `*.footbag.org` subdomains. The only `.footbag.org` host receiving the widened session cookie is the platform-controlled `archive.footbag.org`, whose TLS is managed by its CloudFront distribution (the Legacy Archive decision in DESIGN_DECISIONS, §6.4), always valid, so no external expiry probe is needed.

### 19.4 Email

See §28 "Email transition" for the full picture: the platform sends outbound via SES (the SPF amended to authorize it, SES DKIM applied); Google Workspace receives inbound `@footbag.org` mail, with only the addresses still in use provisioned — dead and spam-only addresses are retired rather than migrated wholesale; legacy mail delivery ends at go-live with the rest of the legacy site. The coordination items specific to the webmaster:

21. **Email inventory**: the address enumeration is derivable from the delivered members dump via the legacy alias subsystem (`members/admin/dumpaliases.php`) plus the role addresses in the legacy code; the webmaster supplies the usage facts the dump cannot, and any apex aliases configured in sendmail outside the codebase. Which `@footbag.org` mailboxes and aliases are actively used vs. dead or spam-only? Record each address with: the address; its domain; whether it is a real mailbox, a forwarding alias, a forwarding rule, or a mailing list / group; who owns it; who receives mail sent to it; whether it is active, dead, or spam-only; whether anyone needs to send or reply from it; whether its history must be archived; whether it needs moderation; what its Google Workspace or Google Group equivalent will be; the decision to retain, migrate, or retire it; and a test that confirms delivery before any MX change.

22. **Mailing list inventory**: the list software and locations are identifiable from the repo (the `announce`/`members` lists generated from members-table opt-in flags by `dumpaliases.php`; the IFPA committee and group lists on the `@ifpa.footbag.org` `wrapper/` server; the public discussion lists footbag, freestyle, and sewing on Majordomo at `list.footbag.org`); the webmaster confirms which remain active and the disposition of each. Are there complex features (moderation, archives, digests) or are they simple distribution lists? Recommended classification: for each list, determine whether it accepts inbound posts from subscribers (discussion) or is broadcast-only. The platform sends outbound via SES and accepts no inbound mail, so inbound/discussion lists must move to a Google Group (Google owns inbound and redistribution) or be retired, while broadcast-only lists become platform announce; settle each before the MX flip so nothing consuming an `@footbag.org` address goes dark. IFPA `@ifpa.footbag.org` list mail is dispositioned separately under §29.12a (IFPA list mail), not as part of the ordinary `@footbag.org` inventory.

23. **Mail server platform (known)**: sendmail with virtusertable-based forwarding, per item 7 and the `members/admin/dumpaliases.php` alias subsystem; the IFPA `@ifpa.footbag.org` list host is the sendmail-tied `wrapper` (§29.12a). No webmaster input is needed for the platform identity; migration planning proceeds from this.

24. **Email cutover coordination**: confirm the SPF amendment and SES DKIM records are applied and one real end-to-end SES send is verified; and that every active `@footbag.org` address is provisioned on Google Workspace and the MX repointed to Google before legacy mail delivery is withdrawn, so no inbound is lost. The Google provisioning and MX repoint may run early as a discrete preparation step with flexible timing (adding senders to SPF is additive and harmless while the legacy sender still runs) — preparation inside the one coordinated go-live, not a phase of production delivery. Legacy outbound ends at go-live.

25. **Mailbox type**: are any `@footbag.org` addresses real mailboxes that people log into (IMAP/POP), or are they all forwarding aliases? Determines whether a managed provider with mailbox hosting is needed or if simple forwarding/alias configuration suffices.

### 19.5 Feature continuity

26. **Group, committee, and mailing-list continuity**: inventory every group, committee, and mailing list active on the legacy site, with Julie scoping which survive. For each, propose the allocation: (a) moves to a Google Group (where inbound posting is needed; the platform is outbound-only); (b) becomes a native in-app group (post-MVP build); (c) is retired with notice and archived history. Nothing stays on a live legacy server; one-way announce is native. IFPA `@ifpa.footbag.org` list functions and the legacy group-message archive are excluded from this generic allocation and are dispositioned under §29.12a (IFPA list mail / sealed legacy email archive); their disposition authority rests with IFPA governance. Each inventoried item is recorded with: name/address; purpose; owner; moderator (if any); current activity status; current users/stakeholders; whether archive/data exists; sensitivity; spam level; recommended disposition; whether notification is required; whether a new user story is required; and whether it is a go-live blocker.

27. **Tournament in a box**: see §28 "Tournament in a box" for the full set of open questions. Steve writes down what the tool does today; that description is the requirements baseline for the native replacement built by Worlds 2027 (decision 21, front-matter question 18). The legacy software itself is never carried forward.

28. **Forum status and disposition. Reopened.** The delivered repository holds no forum application code or data, but it proves a phpBB forum existed on the production host: the character-set migration tool in the legacy code names the phpBB database and its tables, and a saved shell history from the server opens that database and reads a neighbouring forum configuration file. Steve confirms whether the forum is still installed, long dead, or already deleted, and whether its database survives (front-matter question 19). Surviving content is captured as read-only archive content or given an explicit accepted-loss decision; nothing stays live.

34. **Legacy-feature disclosure (deliverable)**: the webmaster enumerates every function running on the legacy site, including pages, tools, crons, feeds, forms, and mail hooks, so nothing is discovered after cutover. The facts feed USER_STORIES gap-fill: the maintainer authors the stories, the webmaster supplies the facts. Anything the disclosure reveals that belongs in v1 is added to the v1 scope. A first installment has been delivered in narrative form (a legacy-repository walkthrough covering per-app schemas, data dumps, sub-domains, and mail systems); its facts are folded into the §28 dispositions and the item 16 subdomain inventory. Gate WM19 (the legacy-feature disclosure is complete).

35. **Legacy group activity**: which legacy groups, committees, and discussion lists are still actively used, and by whom? For each, establish last real (non-spam) traffic and active participants. This generalizes the §29.12a 12-month non-spam-traffic question from `@ifpa.footbag.org` aliases to all legacy groups. The community-requirements lead discovers; the webmaster supplies traffic facts. Feeds the item 26 inventory and allocation.

36. **Group communication home**: for group and committee communication, is the home the in-app group feature (designed in USER_STORIES §3.10, §6, §7, unbuilt), Google Groups, external chat, or a hybrid? Open pending the item 35 findings. Constraints: a group roster stays authoritative in-app because vote eligibility references `members_of_group` (USER_STORIES A_Create_Vote); any binding governance decision is recorded in an auditable system, never exclusively in a chat platform. No build proceeds until requirements are confirmed.

37. **Sanctioning workflow depth**: is sanctioning a deliberating committee (submit, review, discuss, decide) or admin approval, and is `sanctioning@footbag.org` actively used and read by whom? The community-requirements lead elicits the real process. Until confirmed, admin approval stands (USER_STORIES A_Approve_Sanctioned_Event) with admin override; `sanctioning@footbag.org` is provisioned on Google before legacy delivery is withdrawn so it stays live through transition regardless of any future workflow wiring.

### 19.6 Cutover operations

29. **Write-freeze coordination**: the legacy member system goes permanently read-only (one-way) at a coordinated moment immediately before the final member export; it never takes member writes again. Settle (a) that moment; (b) the member-facing notice from then on (directing members to the new site). Only the legacy member system needs the freeze; the pipeline data is already authoritative.

30. **Legacy data retention**: after go-live, legacy data survives only as encrypted, non-public artifacts under IFPA-controlled access — the final export and the recovery package — kept through the 48-hour watch window plus about thirty days for recovery and dispute lookups (front-matter question 14). No legacy database stays available on a running legacy host; a lookup during that window reads the encrypted artifact. Working copies, including Steve's raw copies, are destroyed on recorded dates once shutdown completes.

31. **Legacy retirement milestones**: there is no long-lived parallel role and no standing legacy server after go-live. Once go-live is verified, Steve executes the legacy-side shutdown: every remaining legacy production service stops, and what remains is the encrypted recovery and reference artifacts (item 30). The milestone list that ends his role is front-matter question 15; agree it and a light review cadence. Anything needed later is built natively (complete by Worlds 2027), never kept running on legacy.

### 19.7 Community knowledge

32. **Impersonation handling. Settled (no webmaster input needed).** Claims are gated by the platform's identity-link matching rules (surname match plus the declared email and date-of-birth anchors), the registration-time name-collision prompt, a-priori honor-flag validation against the public rosters, and admin alerting with the dispute-revert path. Impersonation is mitigated in-platform and does not gate on the webmaster's read.

33. **Banned policy carryover**: what fraction of legacy bans represent ongoing community issues vs. stale historical bans that nobody would enforce now? See §28 "For the legacy-site webmaster's community knowledge" for how this informs the platform's banned-member handling.

### 19.8 Action sequencing

**Settled or established:** item 1 (one clean DNS switch, required by design intent); item 17 (records-actor: Steve until the zone moves, the operator after); item 6 (test export delivered, validation running); item 2 (legacy stack known: PHP/MariaDB/apache2/bind9/sendmail); item 3 (member count and activity present in the dump); item 23 (mail server is sendmail).

**Can proceed now, in parallel:** validate the delivered data (items 7-13); answer item 4 (hosting; payments resolved per item 5); answer items 21-22 and 25 (email and mailing-list inventories, mailbox types); answer item 16 (subdomain inventory and rulings); answer items 27 and 34 (the tournament-tool requirements write-up; legacy-feature disclosure); apply the ACM validation and SES DKIM CNAMEs (maintainer supplies values; needed early so certificate issuance and SES domain verification complete ahead of the transitions); confirm the registrar and start the zone move to Route 53 (item 15).

**Then, in order:** provision the Google mailboxes and repoint the MX, apply the SPF amendment, and verify one real SES send (item 24 — timing flexible, always before go-live); complete the zone move to Route 53 (item 15); answer item 26 (groups/committees disposition, with Julie); agree the switch sequence and the go-live window (items 18-19); answer item 33 (banned policy); agree the retirement milestones (item 31); freeze the legacy member system permanently read-only (items 13 and 29); produce the member export from that frozen state (item 14); run the smoke test on a test subdomain; the operator switches `www` and the bare domain to the new platform.

**After go-live:** verify, then Steve shuts down every remaining legacy production service; what remains is the encrypted recovery and reference artifacts under IFPA custody (items 30-31) — no live front door, no live services, no resolvable legacy subdomains, no standing server.

---

## 20. What we need from the historical-pipeline maintainer

The historical-pipeline work, with build state:

1. **Club extraction into pipeline** (built: `legacy_data/clubs/scripts/` implements §10.1 classification, affiliation and leadership inference, and bootstrap eligibility per the §2 bootstrap rule).
2. **Mirror member extraction** into `historical_persons` (~1,700 club-only members; loaders built). The field mapping and conflict policy are the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the legacy_data pipeline (`legacy_data/CLAUDE.md`).
3. **Known name variants table** (built; seeded from mined data; the `name_variants` contract is DATA_MODEL Name-matching utilities, §4.28).
4. **World records CSV** (built; loadable per G15).
5. **Legacy-data analysis and review sign-off** (in progress: the delivered legacy data is under analysis). The sign-off confirms legacy data is complete and member-list presentation is reviewed (unblocks members ungating), recorded as an `audit_entries` row with `action_type='legacy_pipeline.data_review_signoff'`, the maintainer's identity in `actor_member_id`, and reference identifiers plus a free-text reasoning summary in `metadata_json`.

---

## 20a. What we need from the IFPA secretary (Julie)

Julie is the IFPA secretary. Steve knows how the legacy systems work; Julie knows how IFPA governs itself and what the community needs. She leads the discovery of what the old groups and committees are for and who still uses them, and she rules on what happens to old governance records. The discovery program itself — sources, per-item questions, the allowed rulings, and its done-conditions — is the front-matter section "Active group and email requirements discovery (Julie)"; discovery gates go-live.

1. **Which legacy groups are still alive, and who cares.** The legacy `ifpa_committees` table historically holds on the order of ~170 committee and group records (IDs run to 172, many likely inactive); a `CommitteeType` field separates a committee from a group, with `CommitteeValid` and `CommitteeIsOfficial` flags, and `ifpa_committee_members` lists who belonged to each. Find out which of these old groups, committees, and email discussion lists people still actually use, who runs or moderates each, and who would be upset if one changed or went away. Steve can say how much real (non-spam) mail each address still gets; Julie supplies the human picture: what each is for, the people involved, and who must be told before anything is retired or archived.

2. **What happens to the old IFPA vote records.** The legacy site holds old elections (`ifpa_elections`), the issues voted on (`ifpa_issues`), and every individually cast ballot (`ifpa_issue_votes` records each vote as a voter member id plus the choice and a timestamp, so the ballots are individually attributable, not anonymous). Deleting them is the simplest path, but they are governance records, so the decision is Julie's, not the operator's. The choices are: keep them, archive them, archive them encrypted and sealed so no one can read them, keep only the final tallies, or (only if she confirms it is acceptable) delete them. The recommended choice is to archive them encrypted and sealed and never publish them, because each ballot names its voter. Nothing is deleted without her decision.

3. **How sanctioning really works.** The new platform is designed for simple admin approval of an event's sanction. We need to know whether IFPA sanctioning is really a committee that discusses and decides together, or whether one or two people just approve it, and whether anyone still reads the `sanctioning@footbag.org` address (which appears nowhere in the legacy application code). That tells us whether simple admin approval is enough or needs to become a committee workflow.

4. **Where group conversation should live.** Each legacy committee already carried its own email list (the `CommitteeEmail` setting, with optional moderation, restriction, and archiving), so every group has a legacy mailing list behind this choice. For each group or committee, Julie recommends whether its discussion belongs in the new platform, in Google Groups, in an external chat tool, or nowhere (retired). The one firm rule: any decision that actually binds IFPA, such as a sanction or a vote, must be recorded somewhere durable and auditable, never left only in a chat app where it can vanish.

5. **Whether groups need moderators.** For any group we keep or move, does it need a real owner or moderator with powers over membership and posts, or is it enough to let admins and the community keep order informally? The legacy platform supported per-committee moderation, restriction, and archiving (the `ifpa_committees` table carries `CommitteeEmailModerated`, `CommitteeEmailRestricted`, and `CommitteeEmailArchived` flags), so some legacy groups were moderated; that precedent informs but does not bind the new-platform decision.

6. **Who to notify.** When something is retired or archived, who needs to hear about it, and how? This is aimed at the people who actually used it, not a message to every old member.

7. **Running the email side.** Julie helps administer the IFPA Google Workspace alongside a platform maintainer, including the group, alias, and spam settings once we know which groups and addresses we are keeping. First the Workspace account facts are verified and her 2009 account access is restored (front-matter question 9); no permanent administrative role is promised until governance approves it.

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

The migration-driven design decisions live in `docs/DESIGN_DECISIONS.md`: the three-table identity model (Member, Legacy Member, and Historical Person Entity Types, §2.4), the Member Name Model (§2.10), Competition History Fields (§2.11), Account Security Tokens (§3.8), Security, Privacy, and Historical Record Governance (§3.9), and Legacy Data Migration (§6.5, §6.5a).

---

## Part C -- Go-live

## 22. Go-live blocker index

All pass/fail go-live blockers in one view. Gate definitions and failure handling live in the referenced sections. Each entry shows the blocker ID, a one-line criterion, the section with full detail, and the operational-state transition it blocks.

This list is comprehensive for go-live cutover blockers. Broader product work that does not gate cutover lives in `docs/USER_STORIES.md` and `docs/DESIGN_DECISIONS.md`.

**Go-live gate criteria.** This index holds real cutover gates only. A requirement permanently true once built lives in `docs/DESIGN_DECISIONS.md` or `docs/USER_STORIES.md` and is owned by the tests, not this index. A line is a real gate only if all five hold:

1. Cutover-time checkpoint — verified true at a specific moment in the sequence, not "always true once shipped."
2. Falsifiable evidence — passing yields an observable artifact (command exit, audit row, probe, signed-off line), not "works as designed."
3. Distinct go-live consequence — skipping risks a launch-specific harm the test suite would not catch: data loss, outage, PII exposure, an irreversible or unrecallable send, a compliance breach, or an unrecoverable cutover.
4. Not already guaranteed by CI, the build, or a standing test — if an automated check enforces it on every change, it is a requirement the suite owns; a gate may assert that the check is green at cutover, but it never re-describes the behavior.
5. Owned and actionable before cutover.

Test every candidate line: what breaks at go-live if this is skipped, and what artifact shows it passed? A concrete cutover harm plus an observable pass is a real gate — keep it, worded as the check. "Nothing breaks at cutover; the feature just behaves" is a restatement — remove it; `docs/DESIGN_DECISIONS.md` / `docs/USER_STORIES.md` and the tests own it. A real gate names its observable pass condition and owner.

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
| G20-SIGNOFF | Data-review sign-off re-confirmed at cutover: the State-1 sign-off audit row still exists and was issued against the final post-freeze pipeline output, not a stale earlier run | §25 (within the G20 row) | State 3 → State 4 |
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
| EX1 | `footbag.org` domain owned by IFPA; zone authoritative on Route 53 under IFPA-controlled access; clean DNS switch to the new platform arranged and rehearsed with the webmaster (`www` and apex as ALIAS records → CloudFront at T-0) | §23 stage 4 prereqs; §29.12 | State 3 → State 4 |
| EX2 | SES production access granted for AWS account | §23 stage 4 prereqs | State 3 → State 4 |
| EX3 | `footbag.org` verified as SES sender identity at the domain level via DKIM CNAMEs in the zone (per §29.12a MX disposition) | §29.5 | State 3 → State 4 |
| EX4 | ACM certificate for `footbag.org` issued in `us-east-1` and attached to CloudFront, and the separate ACM certificate for `archive.footbag.org` issued in `us-east-1` and attached to the archive distribution | §29.9 | State 3 → State 4 |
| EX5 | Stripe production live API keys + webhook secret in Parameter Store; webhook endpoint configured; one end-to-end webhook delivery confirmed | §29.9 | State 3 → State 4 |
| EX6 | SES bounce/complaint SNS subscription tested with synthetic bounce; hard-bounce suppression confirmed in app | §29.5 | State 3 → State 4 |
| EX7 | Email cutover: platform sending via SES verified (SPF amended to authorize SES, SES DKIM applied, one real end-to-end send confirmed); legacy mail retired at cutover; Google Workspace inbound provisioned and the MX repointed before legacy mail is withdrawn | §28, §29.12a | State 3 → State 4 |
| EX8 | Live payments verified to professional standard before payments open to members: the production-only go-live procedure passes (TESTING §7.7 — Stripe test-mode end-to-end, then a controlled live canary with a real low-value charge, refund, and webhook-replay idempotency check); payment reconciliation is operational (the Stripe ledger reconciles against the platform `payments` table, missed webhooks are detected, and mismatches surface to the admin work queue); a platform payment kill-switch can disable live payments without a redeploy; and webhook-delivery-failure alerting is wired so a sustained burst of rejected deliveries alerts an operator before Stripe disables the endpoint | §29.9; TESTING §7.7 | State 3 → State 4 |

### Legacy-site webmaster coordination

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| WM1 | Test export delivered and validated in the canonical format | §19 items 6, 7 | State 1 → State 2 |
| WM2 | Legacy-export field semantics confirmed (IDs, username, email, registration date, last-activity, tiers) | §19 item 8 | State 1 → State 2 |
| WM3 | Credential exclusion enforced: extraction drops `MemberPassword`/`MemberSession`; load-step credential-header abort verified | §19 item 9 | State 1 → State 2 |
| WM4 | Namespace agreement for `legacy_member_id` confirmed and verified by a comprehensive (100%) integer-format + cross-source overlap check | §19 items 10, 11 | State 1 → State 2 |
| WM6 | Data-quality metrics delivered (deliverability estimate, last-activity timestamps) | §19 item 13 | State 1 → State 2 |
| WM8 | Write-freeze coordinated: legacy member system goes permanently read-only (one-way) at the agreed moment before the final export | §19 item 29 | State 3 → State 4 |
| WM9 | Legacy data retention committed: encrypted artifacts under IFPA custody, minimum 30 days after the 48-hour watch window, destruction dates recorded | §19 item 30 | State 3 → State 4 |
| WM10 | DNS cutover coordination confirmed: T-7d notice, cutover-day availability, and the §27 monitored-window coverage (low TTL on `www`/apex for a fast switch) | §19 item 18; §29.12 | State 3 → State 4 |
| WM11 | Legacy subdomain inventory enumerated and recorded; per-name ruling agreed (replace, archive, or retire — none stays on legacy; dependent on §28 feature scope by version) | §19 item 16 | State 3 → State 4 |
| WM12 | Legacy retirement milestones agreed and recorded (the front-matter question 15 milestone list: zone moved, email transition complete, final export verified, every disposition executed, shutdown executed and verified together, artifacts in IFPA custody), with a review cadence | §19 item 31 | State 3 → State 4 |
| WM13 | `footbag.org` registrar identified and under IFPA control; the zone move to Route 53 planned with a fresh zone snapshot and executed as go-live preparation | §19 item 15; §29.12 | State 3 → State 4 |
| WM14 | Records-actor agreed (Steve until the zone moves, the operator after); maintainer-supplied records applied on schedule per the §29.12 record inventory: ACM validation CNAMEs (both certificates) and SES DKIM CNAMEs early; the MAIL FROM subdomain records, apex SPF, DMARC, and the Google MX on email day; the `archive.footbag.org` record before cutover; the operator's `www`/apex ALIAS switch at T-0 | §19 item 17 | State 3 → State 4 |
| WM15 | Reachability protocol agreed: the go-live window scheduled with Steve and a direct channel open through it for the write-freeze, the final export, and the legacy-side shutdown (no delegate DNS access needed — DNS actions are operator-made on Route 53) | §19 item 19; §29.12a | State 3 → State 4 |
| WM16 | Group, committee, and mailing-list inventory complete with per-item allocation (Google Groups / native in-app group / retire with archived history), with Julie; nothing stays on a live legacy server | §19 item 26 | State 3 → State 4 |
| WM17 | (Removed) Retained-subdomain TLS monitoring is moot under the clean cutover; the archive's TLS is CloudFront-managed | §19 item 20 | n/a |
| WM18 | (Removed) Front-door ratification is settled — the clean DNS cutover is the ratified design; execution coordination is WM10 | §19 item 1 | n/a |
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
| OR9 | Post-launch admin curator authoring scheme designed and implemented, and the JSON-sidecar→DB source-of-truth switch covered by special tests (durability across a data-preserving deploy with no seeder run; admin-UI as sole authoring path; guard against seeding a persistent DB) | §29.14 | State 3 → State 4 |
| OR9a | Email-template source-of-truth cutover: JSON sidecars seed `email_templates` pre-go-live, then the persistent DB is the source of truth (seeder not run against production; admin editor is the sole authoring path; rows survive a data-preserving deploy), covered by the same durability tests as OR9 | §29.14a | State 3 → State 4 |
| OR9b | Club-classification override CSV retired at the go-live switch to the persistent database: forcing a club kept or junked is done through the live-database admin club-cleanup actions, and `legacy_data/overrides/club_classification_overrides.csv` is no longer a build input | - | State 3 → State 4 |
| OR9c | Legacy member-account loader guarded against the persistent production DB: the loader refuses to run against production so a re-run cannot clobber claim state or member-authored rows; the real load stays a maintainer-only cutover step | - | State 3 → State 4 |
| OR11 | Legacy archive subdomain reachable end-to-end (S3 bucket + OAC, archive CloudFront distribution + key group, its ACM certificate, DNS, cookie-Domain widening); the archive Terraform stack is built and applied first — no archive resource exists in Terraform yet while live redirect handlers already target the hostname | §29.15 | State 3 → State 4 |
| OR12 | (Removed) Retained-subdomain TLS health monitoring is moot under the clean cutover — no legacy subdomains stay live; the archive's TLS is CloudFront-managed | §29.16 | n/a |
| OR13 | Curator content seeded into the production DB and media bucket before DNS cutover (`scripts/seed_fh_curator.py` plus `aws s3 sync`); post-deploy smoke confirms landing pages and curator-tagged surfaces resolve to the production bucket, not 404 | §29.13 | State 3 → State 4 |
| OR14 | (Removed) Retained-subdomain HTTPS-certificate audit is moot under the clean cutover — no legacy subdomains stay live; the only `.footbag.org` host receiving the widened cookie is the CloudFront-managed archive | §29.15, §29.16 | n/a |
| OR15 | Smoke test green before the switch: `curl --resolve` against a current CloudFront edge IP returns the `www` page over the `footbag.org` certificate (verified via the test subdomain), and `https://footbag.org/` answers with a 301 to `https://www.footbag.org/` through the distribution; first run at State 3, re-run green on cutover day | §29.12 | State 3 → State 4 |
| OR16 | Search-engine and crawler readiness: production `robots.txt` served and correct (allows all crawlers, names no private paths, points at the sitemap), per-page title / meta-description / canonical / social-preview tags rendered, XML sitemap and `llms.txt` published and the sitemap submitted to Search Console, non-production `X-Robots-Tag: noindex` verified, and the member-only legacy archive confirmed excluded from indexing | DD §4.10 | State 3 → State 4 |
| OR17 | Production `snapshots` bucket carries `lifecycle { prevent_destroy = true }` to match the media/media_dr/dr buckets, protecting the §27 path-B rollback artifact store from accidental destroy or replace | §29.1 | State 3 → State 4 |
| OR18 | Staging/production Terraform parity audited: every divergence is removed or asserted in the Terraform with a stated reason (CloudWatch alarm coverage, DR-bucket replication and its comment, SES IAM identity scope, `default_tags` Project value, and any metric filter keyed below the production log level) | §29.4 | State 3 → State 4 |
| OR19 | Operator-doc security-hardening items resolved or explicitly accepted, with rationale recorded in the cutover sign-off: operator secret hygiene, production-role MFA, source-profile key-rotation cadence, break-glass alarms, feedback-webhook auth, maintenance-bucket public-access block, `/dev/*` production-404 verification, committed-secret scan coverage, and the repo clean of genuine-risk identifiers | §29.17 | State 3 → State 4 |
| OR20 | Basic load/performance check passed on staging: one representative run meets the agreed latency and error-rate targets | §29.18 | State 3 → State 4 |
| OR21 | Member-migration communications sent and an out-of-band status channel named and tested before cutover day | §29.18 | State 3 → State 4 |
| OR22 | Formal go/no-go decision recorded by Dave, the primary maintainer: written criteria checked against this index, latest-safe rollback time agreed, and the §27 origin-latency and login-success thresholds set from the staging baseline beforehand | §29.18 | State 3 → State 4 |
| OR23 | Post-launch close-watch period completed before the encrypted working copies are destroyed and Steve's role closes: the 14-day close-watch window passes with no unresolved high-severity issues and error/latency within target | §29.18 | post-cutover milestone |
| OR24 | DNS preflight passed: the CAA check on the authoritative zone allows Amazon's certificate authorities (or no CAA exists) before ACM issuance; at T-48h the 60-second apex/`www` TTL is observed from the authoritative nameservers (Route 53 after the zone move), and the prior TTL is recorded and has expired before T-0 | §29.12 | State 3 → State 4 |
| OR26 | Release candidate frozen: the cutover artifact is one tagged commit recorded in the cutover log, the State-3 checks ran against it, and any post-freeze fix-forward patch re-ran the smoke suite | §29.18 | State 3 → State 4 |
| OR27a | Freestyle trick-URL identity clean before cutover: no `freestyle_trick_aliases` row claims the slug of an active canonical trick (each known collision adjudicated by the curator as one merged trick or two distinct tricks), every active trick renders its own page at its own URL, an alias URL whose slug matches only an inactive row returns a 301 to its canonical page, and the trick-dictionary rebuild QC passes with an alias/active-canonical collision check green | criterion self-contained | State 3 → State 4 |
| OR27b | Freestyle editorial prose editable in-app before cutover: the admin trick editor covers `description`, `short_description`, `execution_summary`, `learning_notes`, `prerequisite_notes`, `pronunciation`, and `operational_notation_source` with audited writes, so no trick content freezes when the CSV rebuild pipeline retires from the production path at cutover | DEVOPS_GUIDE freestyle cutover procedure | State 3 → State 4 |
| OR28 | Honor rosters re-verified before cutover: the read-only Hall-of-Fame and Big-Add-Posse roster drift check (`legacy_data/member_data_scripts/diff_live_honor_rosters.py`) is re-run against the current public rosters (footbaghalloffame.net, bigaddposse.com) and the captured snapshots in `legacy_data/inputs/` refreshed if it reports real drift, so the honor flags match the live rosters at go-live | - | State 3 → State 4 |
| RD1 | Legacy URL forwarding redirect handlers cover all in-flight email patterns (`/members/profile/:legacyMemberId`, `/clubs/:slug`) per §29.12b; sample-replay validation against a stored set of legacy URLs passes at test load | §29.12b | State 3 → State 4 |

### Rehearsal gates

Procedures whose pass evidence is a live practice run before cutover: each drill proves the human-and-tooling path end-to-end (the real host, the real zone, the real operator steps), which no automated test reaches. IDs keep their original prefixes; each row moved here from its owning table.

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| OR8 | Production database restore drill completed against a copy of production data, in an isolated environment — never an internet-reachable staging host while the `/dev/*` surface is active (per §29.17) | §29.1 | State 3 → State 4 |
| OR10 | Pre-flip DB snapshot captured, integrity-verified, restored against staging in dry-run | §29.1a | State 3 → State 4 |
| OR25 | Cutover rehearsal completed: the webmaster applies a test-subdomain record on his own zone by the same manual process as the T-0 switch, the smoke suite passes against it, and the record is reverted — proving the human change path end-to-end | §29.12; §19 item 4 | State 3 → State 4 |
| OR27 | Persistent-database cutover rehearsed on staging before go-live (built and owned by the freestyle curation cutover; the evidence covers every admin-authored content domain): an admin edit made through the app survives a real code-only deploy with the host env and live database untouched, and the destructive rebuild deploy refuses with a non-zero exit on a host carrying the post-cutover marker before any database or media mutation; both runs captured as cutover-log evidence | DEVOPS_GUIDE freestyle cutover procedure | State 3 → State 4 |
| PC8 | First-admin bootstrap rehearsal on staging: provision via `scripts/admin-bootstrap-token.sh`, claim at `/admin/bootstrap-claim` with a non-admin account, confirm the token self-deletes | DEVOPS_GUIDE §20.8 | State 3 → State 4 |
| WM7 | Final member export readiness confirmed: the post-freeze export-and-import is scheduled and rehearsed against the test export in the canonical raw-dump format; the freeze, export, and import are executed as State 4 cutover steps (§24 State 4 steps 1-3), not before this gate | §19 item 14; §24 State 4 | State 3 → State 4 |

### Code governance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| GV1 | GitHub `main` branch protection enforced (PR required, status checks must pass, linear history) | §29.10 | State 3 → State 4 |
| GV2 | At least one administrator account provisioned in production and login-tested | §29.10 | State 3 → State 4 |

### Compliance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| LEG1 | Privacy policy, Terms of Service, and cookie banner (if applicable) reviewed and accessible from the production site footer | §29.11 | State 3 → State 4 |
| LEG2 | Member self-service data export and account deletion (data-subject request) verified end-to-end on staging: export artifact produced, deletion completes and clears identity links | §29.18 | State 3 → State 4 |
| LEG3 | WCAG 2.1 AA accessibility checks (axe-core across high-traffic public pages) wired into the suite and green at cutover; accepted exceptions recorded in the sign-off | §29.18 | State 3 → State 4 |

### Pre-cutover revert and rotation checklist

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| PC1 | JWT session TTL reverted to the DD §3.4 baseline (24h); staging observability-tuned values removed from production source path before the cutover deploy | §23 stage 4 prereqs; §29.8 | State 3 → State 4 |
| PC2 | SES sender cutover to `noreply@footbag.org` | §29.8 | State 3 → State 4 |
| PC3 | Lightsail SSH firewall rule restore | §29.8 | State 3 → State 4 |
| PC4 | SES adapter set to live on production (`SES_ADAPTER=live`) once SES production access is granted | §29.8 | State 3 → State 4 |
| PC5 | Production Terraform brought up through the staged sequence: tfvars filled with no placeholders; a saved `terraform plan` human-reviewed; hand-created resources imported; the reviewed plan applied; ACM issuance confirmed (CAA pre-checked per OR24); post-apply smoke green against the distribution's default domain and the test subdomain; the staging/production parity audit (OR18) re-run against the applied state | §29.8 | State 3 → State 4 |
| PC6 | Preview fixture scrub | §29.8 | State 3 → State 4 |
| PC7 | Production-first-admin SSM-token route lands per DD §2.9 | DD §2.9, DEVOPS_GUIDE §20.8 | State 3 → State 4 |
| PC9 | TRUST_PROXY hop count verified against the live chain (CloudFront → nginx = 2 in both staging and production under the clean cutover; no legacy front-door hop): env value matches, and `req.ip` resolves to the real client under a spoofed `X-Forwarded-For` probe | DEVOPS_GUIDE §10 | State 3 → State 4 |
| PC10 | Built production image verified to stub `dist/dev-bootstrap/` and `dist/testkit/`: the runtime has no env gate at the import sites, so the build-time strip is the production guard for the dev-admin code | docker/*/Dockerfile | State 3 → State 4 |
| PC11 | Cloudflare Turnstile captcha live on production (`CAPTCHA_ADAPTER=live`, the Turnstile site key in the host env and the secret in Parameter Store), gating login, register, password-reset, verify-email-resend, and claim per the abuse-prevention design; the production process refuses to boot without the key | DD §8.3 | State 3 → State 4 |
| PC12 | External-URL reachability live on production (`HTTP_REACHABILITY_ADAPTER=live`), the dead-link HEAD probe applied at form-submit time; production has no default and refuses to boot until this adapter is set explicitly | DD §3.17 | State 3 → State 4 |
| PC13 | Safe Browsing URL screening live on production (`SAFE_BROWSING_ADAPTER=live`, its API key in Parameter Store); production has no default and refuses to boot until this adapter is set explicitly | DD §3.17 | State 3 → State 4 |

### Retirement gate

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| R1 | QC subsystem retired (routes, code, tables, tests) | §30 | State 3 → State 4 |
| R3 | Primary-maintainer test-user scaffolding retired early: the person-specific journey builder, build-then-switch route, catalog entry, and build-on-switch plumbing are removed (a grep for the old scaffolding tokens returns nothing), the real-flow assurance is preserved by the four-track testing suite, and no production-bound member carries the test user's slug | §31 | State 3 → State 4 (satisfied) |

---

## 23. Build stages

These are build-and-preparation stages for the team. They are not phases of production delivery: production moves once, at the coordinated go-live (stage 4).

### Stage 1: No external data (done)

Name model, slug lifecycle, person links, historical name display, `first_competition_year`, `show_competitive_results`: built.

### Stage 2: Historical-data pipeline (largely done)

Club extraction, name-variants seeding, and world records are built (§20). Outstanding: mirror member extraction code lands in the repo, and the data review sign-off completes after the delivered-data analysis (§20 item 5).

### Stage 3: Needs the legacy-account data (in progress)

The delivered data is under validation (§25 gates). The code-side surfaces are built (the optional mailbox-link-click upgrade and the stage-and-confirm batch auto-link staging job with its staging table and cutover runner; the auto-link design is the Legacy Data Migration decision in DESIGN_DECISIONS (§6.5) and the staging table is DATA_MODEL Staged Auto-Link Candidates, §4.31); what remains is the legacy-account data load and the data-side gates that clear against it (§25).

### Stage 4: Go-live

Scheduling constraint: go-live is sequenced to follow Worlds 2026, which runs on the legacy registration software (Decision 21); the member export does not precede Worlds 2026.

External prerequisites that must land before stage 4 starts:

- **Email cutover complete** (§28, §29.12a): SES sending verified (SPF amended, SES DKIM applied), legacy mail retired, Google Workspace inbound provisioned with the MX repointed, `SES_FROM_IDENTITY` at `noreply@footbag.org` (used by registration-verification, password-reset, optional mailbox-link-click round-trip, and other transactional mail; auto-link itself sends no email per §7).
- **DNS zone on Route 53** (§29.12, §19 item 15): the `footbag.org` zone is authoritative on Route 53 under IFPA-controlled access, so the go-live switch is operator-executed. The zone move is advance preparation done with the webmaster.
- **SES production access granted** for the AWS account. Sandbox caps are 200 sends/day and require per-recipient verification; transactional mail (registration verification, password reset, optional mailbox-link-click) is incompatible with sandbox. Production access is an AWS support ticket: AWS commits to a first response within 24 hours, but resolution can take days and may come back with questions; file it as soon as State 2 completes, and treat a denial as a State 3 blocker (see State 3 readiness checklist).
- **`footbag.org` verified in SES at the domain level** (sender identity for the entire domain via DKIM CNAMEs, per §29.12a MX disposition) and runtime-role `ses:SendEmail` IAM policy pinned to the `footbag.org` domain identity ARN (post-production-access, the recipient-identity permission check goes away, so the sender-only pin is sufficient and least-privilege). Outbound mail uses `noreply@footbag.org` as the FROM address; no separate verification of the `noreply@` mailbox is needed.
- **JWT session TTL at the DD §3.4 (JWT Token Lifecycle and Configuration) baseline** (24h). The TTL is a source-compiled constant, not a runtime config value; staging observability-tuned values are reverted by editing source and rebuilding before the cutover deploy. Allow source-change + deploy-cycle lead time when scheduling stage 4.
- **Email-delivery smoke passes end-to-end** on the final pre-cutover release: enqueue a test row via the outbox, worker drains, SES accepts, recipient inbox receives. See §25 gate G10.
- **Lightsail SSH firewall rule restored** via `terraform apply` from `terraform/staging/` (removes Console override of the port-22 rule and returns to `operator_cidrs`-constrained ingress). See §29.8.
- **Curator content source-of-truth cutover** (the Curator Content Source of Truth decision in DESIGN_DECISIONS, §1.13): production curator media moves from the `/curated/` + seeder model to the persistent DB as source of truth. The admin UI writes curator content directly to the DB; the seeder is no longer run against production; data-preserving deploys use `scripts/deploy-migrate.sh`. See §29.14 (gate OR9).

Stage 4 activities:

- DNS cutover (§29.12)
- Members sign in to the new platform and see staged auto-link candidates surfaced via the wizard. Confirmation applies effects on a per-member basis. No batch outbound communication.
- Honors-bearing direct claims apply on confirmation; a-priori roster validation at test-load (§7) plus community self-policing and the dispute-revert path cover oversight (no daily email; the interactive feed is v2).
- Member-initiated admin help requests accumulate in their queue; admin processes at their own cadence.

---

## 24. Operational states

### State 0: Current state

- Legacy site live, accepting writes
- New platform deployed on staging
- Stage 1 code complete

### State 1: Historical-data pipeline complete

- `legacy_club_candidates` populated and classified per section 10.1 rules (pre-populate, onboarding-visible, dormant; junk excluded)
- `legacy_person_club_affiliations` populated
- Bootstrap eligibility decisions made for pre-populated clubs
- Review report reviewed; admin decisions logged for ambiguous cases
- Known name variants table seeded

### State 2: Test load complete

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

### State 3: Go-live preparation complete

- Email cutover complete per §29.12a: SPF amended to authorize SES, SES DKIM applied, one real SES send verified; Google Workspace inbound provisioned and the MX repointed; legacy mail delivery ends at go-live
- DNS zone authoritative on Route 53 under IFPA-controlled access (§19 item 15); `www` and bare-domain records prepared (low TTL set); smoke test green against a test subdomain (§29.12)
- All migration scripts finalized
- Admin review of unresolved high-impact clubs complete
- Final cutover checklist confirmed
- Legacy webmaster briefed on final export and freeze timing
- SES production-access ticket filed and approved (filed at State 2 completion; first response within 24h, resolution can take days; see stage 4 prerequisites)
- `footbag.org` SES domain identity verified (DKIM CNAMEs in the zone); `SES_FROM_IDENTITY` on the production host updated to `noreply@footbag.org`; runtime-role `OutboundEmail` IAM policy resource ARN set to the `footbag.org` domain identity
- Email-delivery smoke passes end-to-end (§25 gate G10)

### State 4: Production cutover

1. Legacy webmaster freezes the legacy member system read-only permanently (one-way; the coordinated moment and notice text are settled under §19 item 29). It never takes member writes again.
2. Legacy webmaster produces the final member export from the frozen state
3. New platform imports legacy account rows into `legacy_members` via the export dump loader: schema-validates the export, aborts if any password-bearing column is present, applies the §2 source-validity filter with a counted exclusions report, and upserts over the mirror pre-seed flipping `import_source` to `'legacy_site_data'`
4. New platform runs the tier-mapping dry-run report script (read-only, in `scripts/`): a preview of what `member_tier_grants` would be written if all unclaimed legacy accounts were claimed today. No `member_tier_grants` rows are written during cutover; the report is read-only. Actual tier grants are written later, one row per member-confirmed claim, when each member completes the wizard's claim task after step 12 opens sign-in.
5. New platform creates bootstrapped `clubs` rows for approved candidates
6. New platform creates `club_bootstrap_leaders` rows
7. New platform runs batch auto-link candidate staging (no live-table mutation; results surface to members at next sign-in via the wizard)
8. New platform runs post-import validation checks: row-count reconciliation (every count delta reconciled to a named, counted exclusion), spot checksums over key `legacy_members` columns against the export, and the §25 data-quality gates re-confirmed against the final import, before the step 9 snapshot
9. Pre-flip DB snapshot captured per §29.1a (load-bearing artifact for the rollback path B in §27; integrity verification automated)
10. DNS cutover: the operator switches the `www` and bare-domain records on Route 53 to the new platform's CloudFront distribution (see §29.12) and the legacy site goes dark. The switch is gated on the smoke test (run against a test subdomain) re-run green on the day.
11. Admin verifies the new platform is operational (smoke checks, critical flows confirmed, including one real end-to-end outbox → SES send to a verified admin inbox for transactional mail). If any critical smoke check fails, the admin evaluates against the §27 path B catastrophic-failure list before proceeding to step 12; non-catastrophic failures continue to step 12 with a fix-forward plan logged, catastrophic failures trigger path B per §27 (restore from the step 9 snapshot, with any DNS action operator-made on Route 53) and do not proceed to step 12.
12. Admin opens the new platform for member sign-in; staged candidates surface to members through the wizard's claim task as members log in.

### State 5: Post-cutover

- New platform live
- Post-cutover markers recorded at T+24 hours per the DevOps DNS-cutover runbook: the host env-file marker and the in-database `post_cutover` config row, after which every destructive rebuild and reseed path refuses the live database and any copy of it
- Legacy data retained only as encrypted, IFPA-custody artifacts (§19 item 30); after go-live verification Steve executes the legacy-side shutdown
- Members confirm their wizard-staged candidates over time as they sign in
- Members declare additional anchors (former surname, old emails) in the legacy-claim task (reached from their profile) as needed; the platform re-runs candidate matching against the new anchors
- Admins process member-initiated help requests and dispute reverts (§13)
- Leadership activations accumulate as members register and claim

### State 6: Migration complete

- All high-priority legacy accounts confirmed by their members or resolved through admin help requests
- All bootstrap clubs resolved or admin-reviewed
- The staged auto-link candidates table has drained (member confirms, declines, or expirations) and may be dropped
- Legacy working artifacts destroyed on their recorded dates (§19 item 30); only governance-approved sealed archives remain

---

## 25. Validation gates

The following must be confirmed at the test load before go-live. These are not open design questions; they are data-quality checkpoints.

| Gate | Description | Failure handling |
|---|---|---|
| G1 | No email value, taken across `legacy_email` / `legacy_email2` / `legacy_email3`, appears on more than one row (cross-column uniqueness); collisions surface a priori for curation | Replace provisional unique index with non-unique lookup + ambiguity handling |
| G2 | `legacy_user_id` is unique where non-NULL | Same as G1 |
| G3 | Every `legacy_members` row carries a populated `import_source` value; a row missing it is routed to admin review rather than silently trusted. | Rows failing the provenance check route through admin review per §8 claim ineligibility |
| G4 | Shape and null quality of profile/contact fields | Adjust import logic and field mapping |
| G5 | Legacy member ID quality: every `legacy_member_id` integer-format-validated and comprehensively (100%) overlap-reconciled against the mirror profile-URL ids and `historical_persons.legacy_member_id`, not a 10% sample | Resolve before final export |
| G6 | Tier-state inputs validated at test load: each of the five `legacy_*` tier-state fields (DATA_MODEL §4.14b) is spot-checked against reference cases. **PASS**: validated fields are populated and the claim-time mapping reads them; any field that fails validation is left unpopulated, so its basis does not fire (if the paid and board fields all fail, claims grant on honors alone). Held-back fields are recorded in §28. | Unvalidated fields left unpopulated; honors basis always applies |
| G7 | Mirror-derived club normalization quality. **Requires G12 PASS** so the classifier's `listed_contact` and `member_active` signals (§10.1 "Required order" step 1) run against the fully-populated `historical_persons` set including club-only members; running G7 against a partial `historical_persons` set silently under-classifies clubs whose people never competed | Block until G12 PASSes; increase manual review threshold for any remaining quality gaps after both gates clear |
| G8 | Sufficient high-confidence club-leader bootstrap candidates | Adjust bootstrap threshold or expand manual review scope |
| G9 | Bootstrapped clubs produce valid, non-broken club pages | Fix UI before go-live |
| G10 | Outbox → SES → recipient inbox path works end-to-end on the pre-cutover release (enqueue test row, worker drains within 60 seconds, SES returns MessageId, message arrives in recipient inbox) | Debug before cutover; common causes are IAM Resource scope, SES sandbox state, worker container env vars, worker event-loop bugs |
| G11 | `name_variants` seeded with the high-confidence mined pairs (~303 loaded of ~385 generated; ~82 medium-confidence deferred; the `name_variants` contract is DATA_MODEL Name-matching utilities, §4.28) | Auto-link medium-confidence coverage drops; low-confidence admin queue expands; document shortfall in State 1 review |
| G12 | ~1,700 club-only persons extracted into `historical_persons` per §10.2 | Classification signals (active-players, contact-competed) run with reduced coverage; onboarding-visible list may shrink |
| G13 | `club_bootstrap_leaders` populated for pre-populated clubs meeting the §2 bootstrap rule | Leadership activation defers to path 2 (first affiliated member volunteers for leadership) for affected clubs |
| G14 | Canonical `persons.csv` row count reconciled against `historical_persons` population; any accepted discrepancy documented and signed off | Block at test load until reconciled; unexplained delta risks missing or duplicated historical identities |
| G15 | World records export produced in platform format and loads into the records schema cleanly | Records page launches empty or incomplete; fix export before go-live or hide the records entry point |
| G16 | `run_pipeline.sh full` produces events, results, persons, clubs (classified), bootstrap leaders, club-only persons, and variants in one run | Document the multi-step manual sequence required and capture sign-off at State 1; single-command regeneration is the long-term target |
| G17 | Claim flow anti-enumeration invariant holds per §8 "Non-revealing messaging" (identical UX across matched-none, matched-multiple, matched-ineligible, and matched-eligible, per §8's case list) | Collapse divergent response shapes before go-live; side-channel enumeration otherwise possible |
| G18 | Rate limiting active on identifier lookup, declared-anchor changes, claim confirmations, optional mailbox-link-click round-trip, registration, and password-reset per §8 (token mechanics per DD §3.8; numeric defaults owned by USER_STORIES) | Block go-live until limiters engage; declared-anchor enumeration and mailbox abuse otherwise unmitigated |
| G19 | Wizard claim task universally surfaces staged candidates and the declared-anchor prompt to every registrant per §7 and §14; all evidence tiers (`declared_anchor_only`, `currently_controls_modern_email_matching_legacy`, `mailbox_control_via_link_click`) exercised at test load. The `mailbox_control_via_link_click` tier is exercised via the G22 round-trip | Members without a stage-1 anchor match never get prompted to declare; legitimate claims are missed |
| G20 | Data review sign-off. **PASS**: an `audit_entries` row is present with the sign-off `action_type` and the historical-pipeline maintainer as `actor_member_id`, confirming that legacy data is complete and member-list presentation has been reviewed; this row unblocks members ungating. "Members ungating" = the sign-off row permits the historical-person record surfaces to ship with the platform; no runtime flag and no member directory exist (current-member enumeration is forbidden by the data-governance search rules). The cutover checklist asserts the row via its `G20-SIGNOFF` gate. **FAIL**: members ungating is withheld until the sign-off row exists. | Historical-pipeline maintainer owns sign-off per §20 item 5 |
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

**Post-flip path B, catastrophic failures (rare, narrowly defined):** DB restore from the pre-flip snapshot, executed by the operator, with any DNS change operator-made on the low-TTL Route 53 zone. No standing legacy server exists to revert to: if the platform cannot serve even after the restore, a read-only legacy fallback may be reconstructed from the tested encrypted artifact (§19 item 30) as a last resort — the member system stays frozen either way. A DNS change converges over minutes, not seconds: clients and resolvers that cached the new records lag by up to their cached TTL. Catastrophic is one of:

- schema corruption that prevents reads;
- identity-data corruption that misroutes claims or auto-link writes;
- write-amplification that produces malformed audit or queue entries at scale;
- outbound communication that is incorrect or premature and cannot be recalled (e.g. a misfired Stripe webhook batch that grants or revokes tiers in error, or transactional mail sent under a regressed template that misidentifies recipients at scale). Note that path B does not actually un-send already-sent emails; it restores the DB state so corrective communication can be sent from a clean baseline.

Decision authority is the primary maintainer.

**Path B re-entry:** the legacy member system stays permanently frozen (the freeze is never lifted), and the final export and the pre-flip snapshot remain valid regardless of what path B did, so a cutover retry re-imports the same export and re-cuts-over once the defect is fixed. No second freeze or fresh export is needed.

The pre-flip snapshot is the load-bearing artifact for path B. It is captured as State 4 step 9 (after validation in step 8, before the DNS cutover in step 10), so it includes the final import (step 3), the tier-mapping dry-run (step 4), the bootstrapped clubs and leaders (steps 5–6), and the staged auto-link candidates (step 7). Restore returns the database to this exact pre-flip state; staged candidates are present in the snapshot and surface to members when they sign in after the restore. It lives in the cross-region disaster-recovery bucket with S3 Object Lock (DEVOPS_GUIDE §16.3). Creation, integrity verification, and a successful dry-run restore against staging are preconditions; see §29.1a.

Path B does not recover from systemic bugs in the candidate-staging step itself, because those bugs' results are present in the snapshot. Staged-candidate defects are addressed by the per-member dispute path (§8) and admin revert (§13), and by the pre-cutover validation gates G23 and G24.

**Rollback window:** 48 hours post-flip. After 48 hours the new platform is authoritative regardless of what surfaces; reversal requires explicit joint sign-off from the primary maintainer and the legacy-site webmaster, and is treated as a manual recovery exercise rather than a rollback.

**Post-cutover monitoring posture (T+0 to T+48h).** The rollback window requires active monitoring, not passive waiting. `docs/DEVOPS_GUIDE.md` documents the cutover watches (the CloudFront origin-latency watch and the zero-logins / cutover-login alarm) and the production CloudWatch config defines them; the remaining work before cutover is setting the origin-latency and login-success alarm thresholds against the staging baseline, with escalation paths. The observables:

- HTTP 5xx error rate on the CloudFront distribution (baseline: 0; alarm: sustained >1% of requests over 5 minutes).
- Response latency at the origin (p95; alarm threshold TBD based on staging baseline).
- SES bounce rate and complaint rate (alarm: bounce >5% or complaint >0.1% of daily volume; SES auto-suspends sending at higher thresholds).
- Outbox queue depth: `outbox_emails` rows with `status='pending'` growing faster than the worker drains them (alarm: >50 pending rows sustained over 10 minutes).
- Login success rate: failed logins as a fraction of attempts (detects auth-chain defects; alarm threshold TBD).
- Claim-wizard conversion: candidates surfaced vs. claims initiated (no hard alarm; manual check at T+4h and T+24h to confirm the flow is working).
- CloudFront cache-invalidation confirmation: verify `/*` invalidation completed within 60 seconds of T-0 (one-time check).

**Legacy data retention:** the final export and the recovery package are retained as encrypted, IFPA-custody artifacts for at least 30 days after the 48-hour rollback window ends, for reference and targeted manual recovery (§19 item 30). Retention is of artifacts, not of a running system. This is sequential to and distinct from the 48-hour rollback window: retention enables one-off historical lookups by admin; the window is the time-bounded period in which a restore-based rollback remains on the table.

**Member writes lost on restore:** any claim, registration, or club-affiliation write that lands between snapshot capture and rollback is lost on restore. The 48-hour window plus the platform's traffic profile bound the affected count; affected members re-do the action after the platform stabilizes.

**Post-flip path A-prime, bounded business-logic defects:** admin-level data correction plus affected-member notification, without full platform rollback. Covers defects that corrupt a bounded set of records but do not meet the path B catastrophic threshold: incorrect tier-mapping for a subset of members, auto-link candidate staging that surfaces wrong matches for a subset of legacy accounts, club-bootstrap that assigns wrong leaders. The defect is in the data, not the schema or identity layer, and the affected population is enumerable. Remediation: admin identifies affected rows via targeted query; applies per-record correction via admin tools; dispatches notification email to affected members explaining the correction. Path A-prime does not require a DNS change or DB restore. Decision authority is the primary maintainer; if the affected count exceeds 1% of migrated accounts or the defect cannot be corrected by record-specific admin actions, escalate to path B evaluation.

**No automated rollback** is provided after the DNS cutover. Path B is operator-driven via the runbook in `docs/DEVOPS_GUIDE.md`.

---

## 28. Open issues

Webmaster-facing open questions live in the front-matter table; this section holds the internal detail behind them plus items that are wholly internal.

### Deferred to data validation

Decisions gated on what validation of the delivered legacy data reveals.

1. **`announce_opt_in`**: Test load confirms the field is present (`MemberAnnounceOptIn`, plus `MemberEmailOptIn`). Resolved: legacy mailing opt-in is not imported as active consent and no `members` column is added. The legacy flags are recorded as legacy metadata only; members set their subscription preferences fresh after claim via `M_Manage_Email_Subscriptions`, and unclaimed `legacy_members` rows are never active mail recipients. The legacy `members` table also carries per-field visibility flags (`MemberPublish`, `MemberPublishEmail`, `MemberPublishAddress`, `MemberPublishCity`, `MemberPublishPhone`); these follow the same rule, recorded as legacy metadata only and not imported as active visibility consent, since the new platform's privacy defaults and member-set visibility govern instead.
3. **Tier-mapping fields on `legacy_members` (§15.16)**: test load confirms the tier/payment source inputs are present (`MemberIFPATier`, `MemberIFPAExpiration`, `MemberIFPAPrevExp`, `MemberIFPAPaid`, `MemberIFPAPaymentDate`, `MemberIFPAJoined`, `ifpa_memberpayments`); the five `legacy_*` columns are derived, not copied. Board-at-cutover data (precedence 1) was not in the delivered dump: the `groups/` committee-table backup (`ifpa_committees`, `ifpa_committee_members`) was omitted only because the whole `groups/backups/` directory was left out to avoid the 1.2GB `ifpa_group_messages` archive in the same app; the webmaster will supply it in `groups/backups/latest.sql`, so the committee data exists and is pending delivery rather than unpopulated. The committee-table schema itself is in hand from the legacy `groups/` app: `ifpa_committee_members` links a `CommitteeID` to a member `CommitteeMemberID` with title, admin, and voting flags, and `ifpa_committees` carries a `CommitteeType` and `CommitteeIsOfficial` (groups and committees share this one table). The board-at-cutover derivation scaffold is therefore implemented and tested against the known structure: `extract_legacy_members.py` emits `legacy_was_board_at_cutover` and `legacy_board_underlying_paid_tier`, with all board logic behind the single constant `BOARD_IFPA_TIER_CODES`. It ships inert: the constant is empty, so the extractor makes no positive board determinations (it does not distinguish "unknown" from "not board"), and no schema or loader change has landed. The legacy admin PHP confirms `MemberIFPATier` is only 0/1/2 (Tier 0 / Tier-1 lifetime / Tier-2 organizer) and does not encode Tier 3, so there is no `MemberIFPATier` board code to set; the committee-table delivery is the sole unblock, and once the committee rows are delivered, precedence 1 derives from the committee tables. The G6 `legacy_members` columns and loader wiring remain the integration step after the board signal is confirmed. If the board or paid-history derivation proves insufficient after delivery, those fields are left unpopulated and their standings do not fire, so affected claims grant on honors alone. Whatever is held back is recorded here with the test-load evidence that drove it.

### For the legacy-site webmaster's community knowledge

Decisions gated on the webmaster's read of community dynamics rather than on test-load data.

4. **Impersonation handling. Settled (no webmaster input needed).** Honors-bearing direct claims are gated by the identity-link matching rules (surname match plus the declared email and date-of-birth anchors) and validated a priori against the public rosters; the registration-time name-collision prompt (§8) catches same-name collisions at signup; and a suspected fraudulent claim is raised to the admins and reverted through the dispute path. Impersonation is mitigated by these in-platform controls rather than by a webmaster risk assessment.

5. **Banned policy carryover**: the delivered data carries no ban field (front-matter item 17), so there is nothing to carry over today, and no legacy ban gates a claim. If the final export or the webmaster surfaces meaningful legacy bans, the platform may shift to one of: ban carries over silently (claim applies but the new account starts in a restricted state); banned legacy accounts unclaimable self-serve (member contacts admin); claim held until board review. Pending that, member discipline is handled by the new platform's own tools.

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

### Front-door architecture (required by design intent)

The design is one clean DNS switch: at go-live the `www` and bare-domain records point at the new platform and the legacy site goes dark (§19.1, §29.12). The zone is authoritative on Route 53 before go-live, so the switch and any recovery DNS change are operator-executed; the legacy server is not in the live path and no standing legacy server remains afterward — recovery is fix-forward or a platform restore (§27). In exchange: no reverse proxy or TLS certificate on the legacy box, no critical-path legacy dependency, and CloudFront sees client IPs directly.

**CloudFront technical constraints (verified):** the distribution carries `footbag.org` and `www.footbag.org` as alternate domain names with a matching ACM certificate in us-east-1; adding the alternate domain names requires only the certificate, not a DNS repoint. No intermediary ever fronts the distribution: anything terminating TLS for these names would have to present SNI and Host matching the alternate domain names, or CloudFront rejects the request with HTTP 421. A plain CNAME at the apex is illegal per RFC 1034; on Route 53 the apex is served as an ALIAS record to the distribution, which is why the zone moves to Route 53 before go-live and no separate apex redirect server is ever built.

### Feature scope by version (v1 / v2 / v3)

All scoped features default to v1 (launch day) unless the webmaster objects or a hard external dependency forces deferral; the allocation is front-matter question 20.

Functionality not in v1 scope is built natively afterward (complete by Worlds 2027), not kept on a live legacy host. Items dependent on this decision:

- §19 item 29: which legacy surfaces enter the write-freeze.
- §19 item 16: which ruling each `*.footbag.org` name gets (replace, archive, or retire — none stays on legacy).
- §19 item 31: the retirement-milestone list (what closes Steve's role).
- §19 item 26: per-mailing-list allocation (Google Group, native in-app group, or retire).

**v1 (launch day):** member accounts, registration, login, profiles, tier management; legacy account import and claim flow (auto-link, declared anchors, mailbox verification, admin help requests); club bootstrap and onboarding; events (read-only public event pages and historical results; the organizer and registration build — create, register, pay, attendance, co-organizers, routine music — is post-MVP, below); freestyle trick dictionary and curated media; media and galleries; payments (Stripe: dues, event fees, donations, recurring); admin tools (work queues, payment reconciliation, sanctions, member help); transactional email via SES (SPF amended, SES DKIM applied), with legacy mail retired at cutover; native announce, the news feed, and live Stripe (live Stripe gated on the IFPA bank account + Board/Treasurer authorization); the clean DNS cutover itself; an archive subdomain for read-only historical content.

**Open questions (version placement depends on webmaster's answers):**
- Per-mailing-list disposition (move to Google Groups or retire; one-way announce is native) per §19 item 26, with Julie scoping which groups survive. Discussion lists never stay on a live legacy site. The platform's own outbound (SES) is settled v1 scope (§28 "Email transition").
- Group and committee features (v2 default, but depends on which are active per §19 item 26; some may not survive on legacy).
- (Forum status: reopened — evidence shows a forum existed on the host; disposition per §19 item 28 and front-matter question 19.)

**v2 (post-launch native build):** Hall of Fame and BAP (nominations, voting, honors oversight); voting and elections; native in-app group and committee features.

**Post-MVP (native build, complete by Worlds 2027):** tournament in a box (built natively for Worlds 2027; see "Tournament in a box" below); event-organizer/registration; voting/elections; in-app groups/committees; public member directory; and any other functionality needed to complete the platform natively. Legacy is never relied upon; the legacy shutdown itself happens at go-live, not post-MVP.

### Tournament in a box

Partially disclosed by the webmaster. The production system is "atib" (A Tournament In a Box). Its backend is checked into the legacy repository under the `api/` and `registration/` apps, and also feeds `ranking/` and the event-list results; its AngularJS frontend is served separately and is not in that repository, and a later, incomplete NodeJS rewrite lives in its own repository. The new platform has event creation, registration, payment, and results entry. What remains unknown is the full feature scope, which the frontend and a webmaster walkthrough supply; that write-up is the requirements baseline for the native replacement (front-matter question 18).

Open questions for the webmaster:

1. What does "tournament in a box" do today? (Registration, brackets, scheduling, scoring, results publishing, sanctioning, IFPA ranking integration, streaming, other?)
2. How many organizers actively use it? How often?
3. What does the legacy tournament-in-a-box do today (the webmaster's legacy-feature disclosure, §19 item 34), so the native version can be scoped in time for Worlds 2027?
4. Does the new platform's existing event system (create event, register players, collect fees, enter results, mark attendance, co-organizers, routine music) cover part of what tournament-in-a-box does? Where does it fall short?

Allocation (decided): not in v1. Tournament-in-a-box is completely replaced by a native tool built in time for Worlds 2027; it is not kept on a live legacy host, and its only ongoing relevance is as a source of requirements for that replacement. The native version is scoped after the webmaster's write-up (§19 item 34, front-matter question 18) defines what it does today, and after Julie confirms with the Worlds 2026 organizers which functions they actually use and what data they need after the event. Worlds 2026 runs on the legacy registration software (Decision 21). No registration export is requested from Steve unless that confirmation establishes a need.

Historic tournament and registration data is not imported (Decision 22): the platform's canonical historical results are cleaner and authoritative, so the webmaster need not export the legacy tournament tables; a future tournament feature, if built, models fresh. Worlds 2026 runs on the legacy registration software, with go-live sequenced to follow it (Decision 21); the legacy registration system runs Worlds 2026 only and is then retired, with the native tool replacing it for Worlds 2027. The legacy `registration/create.sql` is a stale stub and is not a reliable schema reference.

### Email transition

Email architecture (settled): the platform owns outbound from go-live, sent via SES, with the new sender added to the `footbag.org` SPF record and the SES DKIM records applied. Legacy mail retires at cutover along with the rest of the legacy site. The platform accepts no inbound mail (bounces and complaints arrive out-of-band via the SES feedback webhook), so it needs no inbound mailbox. Inbound `@footbag.org` role addresses move to Google Workspace, provisioned per the mailing-list inventory work (§19 items 6-9, with Julie) before legacy mail is withdrawn so no inbound is lost.

**Decided architecture:**
- **Outbound:** AWS SES sends all transactional and mailing-list email (built and working).
- **Inbound:** Google Workspace handles `@footbag.org` role addresses (the per-address inventory is §19 items 6-9, with Julie). The `footbag.org` MX points at Google and its mailboxes, aliases, and forwarding are configured there. The platform itself receives no inbound mail and runs no custom inbound code.
- **Legacy `@footbag.org` mail server:** retired at the transition, both directions.
- **`@ifpa.footbag.org`:** out of scope here. It is a distinct mail domain, dispositioned separately under §29.12a (IFPA list mail): its still-needed functions move to approved replacements and the list host shuts down at go-live. Moving the `footbag.org` MX does not touch it; zone edits preserve its records until its own disposition executes.

**DNS record sequencing (two preparation steps).** Step one, any time early: the SES DKIM CNAMEs and the ACM/SES domain-verification records go into the zone (they do not affect the legacy sender) so certificate issuance, SES domain verification, and the production-access ticket complete ahead of cutover. Step two, ahead of the web cutover as a discrete preparation step: every active mailbox is provisioned on Google, the MX repoints to Google, the SPF record adds the new senders (SES plus Google — additive, harmless to the still-running legacy sender), and DMARC is published in monitor-only mode (`p=none`) with a monitored report mailbox. At the web cutover legacy mail retires. Tightening comes last and only after verification: SPF softfail moves to `-all` and DMARC moves to `quarantine`, then `reject`, once the full sender list is confirmed and the DMARC aggregate reports run clean — tightening early would quarantine legitimate senders that are not yet on the record.

**Provisioning gate.** Withdrawing legacy `@footbag.org` mail is gated on provisioning being verifiably complete: every active `@footbag.org` address (per the §19 item 21 inventory, including the webmaster's own address and any list-intake addresses) exists on Google as a mailbox, group, or forward, and every mailing list has its §19 item 26 disposition executed or scheduled. An unprovisioned active address loses mail silently; the inventory is the safety gate.

**Email sequencing:** the platform's SES sending is verified before cutover (SPF amended, SES DKIM applied), and Google inbound is provisioned with the MX repointed as a discrete step ahead of the web cutover, so no inbound is lost (§19 item 24). Contact addresses printed on the new site (`admin@`, per §29.8) resolve on Google.

**What the new platform already has (built and working):** outbound transactional email via SES (verification, password reset, claim links, receipts, reminders); mailing-list infrastructure (DB tables, subscription management, bulk sends; six lists seeded); Terraform for SES domain identity, DKIM, SPF, DMARC (note: the Terraform writes these records into Route 53; until the zone move completes, the webmaster hand-applies equivalent records in his zone, and Terraform reconciles when Route 53 becomes authoritative — before go-live). Bounce/complaint tracking schema is ready; the webhook code is go-live gate EX6.

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

Gate: a dedicated snapshot of the production SQLite DB is captured as State 4 step 9 (after validation in step 8, before the DNS cutover in step 10). The snapshot contains the final import, the tier-mapping dry-run, the bootstrapped clubs and leaders, and the batch auto-link results. The snapshot is the load-bearing artifact for the rollback path B in §27. Requirements:

- Snapshot is written to the cross-region DR bucket (S3 Object Lock, `docs/DEVOPS_GUIDE.md` §16.3) under a path distinct from the routine backup stream, so the snapshot is not aged out by the routine retention policy.
- Integrity verification is automated: snapshot SHA-256 is recorded, a `PRAGMA integrity_check` run against a temporary copy returns `ok`, and the row counts for `members`, `legacy_members`, `historical_persons`, `clubs`, `audit_entries`, and `auto_link_staged_candidates` are recorded in the cutover audit trail. The staged-candidates count is included because the snapshot carries the batch auto-link results and that table is what members act on at first sign-in, so a path-B restore with a wrong candidate count would otherwise pass the integrity check unnoticed.
- A dry-run restore against staging has been completed end-to-end within the past 7 days, using the same restore procedure that will be invoked for path B. The dry-run runbook is written into `docs/DEVOPS_GUIDE.md` before the drill and includes the steps to re-point the app at the restored DB. Serial dependency: the runbook must exist before the dry-run, and the dry-run must succeed before cutover; schedule both with weeks of lead time, not days.
- The snapshot's Object Lock retention is set to at least 60 days so the rollback window plus retention plus operator review headroom is comfortably covered.

Procedure: `docs/DEVOPS_GUIDE.md` (snapshot creation + restore runbook).

### 29.2 Observability and monitoring readiness

Gate: CloudWatch agent installed on the runtime host; `enable_cwagent_alarms = true` applied and CPU / memory / disk alarms reachable via SNS with operator subscription confirmed; CloudFront 5xx alarm active; container-log shipping to CloudWatch verified — `terraform apply` has created the `logs_publisher` role and the `/footbag/<env>/{app,nginx}` log groups that the `awslogs` driver requires pre-created, the host's `footbag-<env>-logs` profile assumes that role, and a deliberate error line and `outbox.depth` line raise the `app_errors` and `outbox_backlog` alarms; the origin-response-latency and login-success alarm thresholds read off the staging baseline and set; minimal operator dashboard documented. Procedure: `docs/DEV_ONBOARDING.md` §7.6 (install + enablement) and §8.10 (the `footbag-<env>-logs` container-log profile); `docs/DEVOPS_GUIDE.md` §12 (operating rules).

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

Gate: JWT signing-key rotation procedure with 24h overlap is documented and drilled against staging before production cutover (generate new key, stand it up alongside current key, flip the active signer, retire the old key after the overlap window); session JWT refresh re-issues the cookie when `exp` is within 6h per DD §3.4 (JWT Token Lifecycle and Configuration) so users are not silently logged out at the 24h TTL boundary; `SESSION_SECRET` rotation runbook exists. Source-profile access-key rotation is covered under §29.4. Procedure: `docs/DEVOPS_GUIDE.md` §10.

### 29.8 Pre-cutover revert and rotation checklist

Before stage 4 cutover, the following staging-observability-only deviations must be reverted and rotations completed:

1. SES sender cutover: re-run `docs/DEV_ONBOARDING.md` §8.8 against the canonical domain; switch `SES_FROM_IDENTITY` in `/srv/footbag/env` to `noreply@footbag.org` (the FROM address) and switch the `OutboundEmail` IAM policy `Resource` ARN to the `footbag.org` SES domain identity ARN (per §29.12a MX disposition: domain-level verification, not email-address-level); restart the app. Env + IAM only, no code.
2. Lightsail SSH firewall rule restore: `terraform apply` from `terraform/staging/` to remove any browser-SSH firewall opening (port 22 loosened beyond `operator_cidrs` during staging bring-up) and return to the `operator_cidrs`-constrained ingress documented in DEV_ONBOARDING Path D §4.4.
3. SES adapter on production: `/srv/footbag/env` sets `SES_ADAPTER=live` for production once SES production access has been granted. Dev and staging run `SES_ADAPTER=stub` and capture outbound mail for retrieval (the in-page simulated-email card on every email-gated login page; `/dev/outbox` for notifications with no host page); live SES delivery is production-only (the Dev and Staging Email Preview decision in DESIGN_DECISIONS, §5.6). The legacy `SES_SANDBOX_MODE` flag has been removed from the codebase; it is no longer read and must not be set in the env file.
4. Production Terraform bring-up, staged (gate PC5). The region default in `terraform/production/variables.tf` is `us-east-1` (the region the project runs in, DEVOPS_GUIDE §9.2 networking and TLS), so the default carries no cross-region risk. Production Terraform has not yet been applied to the production account, so its infrastructure (CloudFront distribution, ACM certs, Route 53 records, security groups, KMS keys) does not exist yet or was created outside Terraform. Run the bring-up as a staged sequence well before cutover, each step leaving an artifact in the cutover log: (a) fill `terraform.tfvars` from the account facts, with no `TODO-` placeholder remaining; (b) run `terraform plan` against the production account, save the plan file, and review it by hand — the reviewed plan file is what gets applied, never a fresh re-plan; (c) `terraform import` any manually created resources the plan surfaces, then re-plan and re-review; (d) apply the reviewed plan; (e) confirm ACM certificate issuance (the webmaster hand-applies the validation CNAMEs; the CAA preflight per §29.12 runs first); (f) run a post-apply smoke against the distribution's default `*.cloudfront.net` domain and the test subdomain; (g) re-run the staging/production parity audit (gate OR18) against the actual applied state. The gated variables stay off through the zone move (Route 53 must first serve the zone's existing records faithfully, still pointing at legacy): `enable_apex_alias_records` flips at T-0 as the go-live switch itself, and `ses_enable_domain_auth` flips when Terraform takes over the mail records from the hand-applied copies once Route 53 is authoritative. One known edge to surface early: if the CloudFront apply fails with CNAMEAlreadyExists, another AWS account has already claimed `footbag.org` or `www.footbag.org` as an alternate domain name, and reclaiming an alias goes through AWS support and is slow — run `aws cloudfront list-conflicting-aliases` against the distribution as soon as it exists, so any conflict is discovered well before the cutover window.
5. Preview fixture scrub: `legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py` inserts a "Footbag Hacky" fixture (fake event, discipline, result, HP record with HoF flag, and result-entry participant) alongside the preview-user account. Acceptable in staging for UX preview; must not reach the production DB. Either condition the fixture block on an env flag (e.g. `FOOTBAG_SEED_PREVIEW_FIXTURE=1`) or delete the block in the production-cutover data pass.
6. Restore live `mailto:admin@footbag.org` in `/legal`: swap the `.contact-pending` span used in Privacy, Terms, and Copyright contact lines for a live `mailto:admin@footbag.org` once SES sender cutover (item 1) is complete and the canonical mailbox is active. Template-only change; no service or DB work.
7. Dev-shortcut auth surface removal. Dev autologin has already been removed: `src/middleware/auth.ts` runs the cookie path unconditionally and the `FOOTBAG_DEV_AUTOLOGIN_*` env vars and their guards no longer exist. The test-data persona harness (the `devRouter` mount in `src/app.ts` for `GET /dev/switch` and `GET /dev/personas`, gated to development and staging, and the `src/testkit/` subtree of persona factory, catalog, and seed runner) is permanent test infrastructure: it is excluded from the production image at build time and never mounted in production, but it is not removed from source at cutover. The registration-time admin email-allowlist bootstrap in `src/dev-bootstrap/` is likewise permanent dev/staging infrastructure (build-excluded from production, never source-deleted): it is the dev/staging peer of the production SSM-token first-admin claim. **Scope**: this item covers dev-only auth/persona surfaces. Production first-admin uses the SSM-token `/admin/bootstrap-claim` route (the Administrator Role Lifecycle decision in DESIGN_DECISIONS, §2.9; operator runbook in DEVOPS_GUIDE §20.8).
8. JWT session TTL revert: the source-compiled TTL constant in the JWT signing service is set to the DD §3.4 (JWT Token Lifecycle and Configuration) baseline (24h = 86400 seconds). Staging observability-tuned values are reverted by editing the constant and rebuilding before the cutover deploy. This is the PC1 gate.

Sign-off on this checklist is a prerequisite for §24 State 3 → State 4 transition.

### 29.9 Production-specific prerequisites

Gate: ACM certificate for `footbag.org` issued in `us-east-1` and attached to the production CloudFront distribution; **ACM certificate for `archive.footbag.org` issued in `us-east-1` and attached to the archive CloudFront distribution** (separate cert, separate distribution, same Terraform pattern as the main cert; requires its own DNS validation CNAME published by the records-actor per §19 item 17); production KMS asymmetric signing key, source-profile IAM user, and runtime role provisioned (production mirror of Path H §8.6–§8.9, per Path I §9.8); Stripe production live API keys and webhook secret stored in Parameter Store at `/footbag/production/stripe/*`; Stripe webhook endpoint URL registered in the Stripe Dashboard against the production domain; one end-to-end Stripe webhook delivery confirmed against the production endpoint before cutover, with the confirmation asserting that the `stripe-signature` header was validated by the app against the production webhook secret (e.g. by inspecting an audit row written by the signature-validation path on successful receipt) rather than only that the endpoint returned HTTP 200. Procedure: `docs/DEV_ONBOARDING.md` Path I (§9.8 ACM certificate and production KMS / runtime role, with the ACM runbook in `docs/DEVOPS_GUIDE.md` §9.2.1; §9.13 Stripe production activation).

### 29.10 Code governance

Gate: GitHub `main` branch protection enforced (PR required, status checks must pass, linear history); the required-check job names match the names in `.github/workflows/ci.yml`; at least one administrator account provisioned in the production database and login-tested. Procedure: `docs/DEV_ONBOARDING.md` §7.3 (branch protection).

### 29.11 Compliance

Gate: privacy policy, Terms of Service, and cookie banner (if applicable) reviewed by the IFPA board and accessible from the production site footer. Prepared by IFPA, reviewed by the maintainer; not technical work.

### 29.12 DNS cutover

Under the clean cutover the apex and `www` move to the new platform at go-live: the operator switches both records on Route 53 to the CloudFront distribution and the legacy site goes dark. Both the ACM certificate issuance procedure (`docs/DEVOPS_GUIDE.md` §9.2.1) and the DNS cutover procedure (`docs/DEVOPS_GUIDE.md` §6.7) apply at cutover.

**Timing notation in this section.** `T-0` is the moment the operator switches the `www` and bare-domain records to the new platform. `T-Nd` / `T-Nh` and `T+Nh` count from that switch. The `T+48h` window matches the §27 watch window.

**Front-door preconditions:**

- **ACM colocation**: the `footbag.org` certificate is issued in `us-east-1` and attached to the production distribution, with the validation CNAMEs placed in the authoritative zone by the webmaster (they stay permanently; renewals depend on them).
- **CAA preflight**: before any ACM issuance, `dig footbag.org CAA +short` against the webmaster's authoritative servers returns either nothing (any CA allowed) or a record authorizing one of Amazon's certificate authorities (`amazon.com`, `amazontrust.com`, `awstrust.com`, `amazonaws.com`); a blocking CAA silently fails both the main and archive certificates.
- **TTL verified low**: at T-48h the webmaster's drop of the apex/`www` TTL to 60 seconds is observed from his authoritative nameservers, the prior TTL is recorded, and the prior TTL has fully expired before T-0 (the runbook is `docs/DEVOPS_GUIDE.md` §6.7).
- **DNS records ready**: the zone is authoritative on Route 53 and the `www` and apex ALIAS records to the distribution are staged (gated off until T-0); the bare domain answers with a 301 to `www` through the distribution, smoke-tested via the test subdomain; a low TTL is set in advance so the switch propagates fast.
- **Canonical host**: `PUBLIC_BASE_URL` is `https://www.footbag.org` — the apex only redirects — so the CSRF Origin-pin, the sitemap and per-page canonical tags, and every SES-sent link derive from `www`. Verify no template, seeded content row, or configured webhook URL names the bare apex as the site origin.
- **Smoke test green**: `curl --resolve www.footbag.org:443:<current edge IP> https://www.footbag.org/` returns the expected page with the `footbag.org` certificate, verified against a test subdomain pointed at the distribution; and `https://footbag.org/` returns 301 to `https://www.footbag.org/` over a valid certificate, served through the distribution. First run at State 3; re-run green on cutover day before the switch.
- **Email cutover ready** (§29.12a): SES sending verified (SPF amended, DKIM applied), Google inbound provisioned with the MX repointed, legacy mail retiring at cutover.
- **Write-freeze**: the legacy member system has been frozen permanently read-only (one-way) and the final member export imported into production before the cutover (per §23 stage 4 cutover gates). Only the legacy member system needs the freeze; the pipeline data is already authoritative.

**Record inventory.** The complete list (§19 item 17). Before the zone moves to Route 53, the maintainer supplies exact values and the webmaster hand-applies each, confirming with `dig` against his authoritative servers; after the move, Terraform owns the records and the operator applies them on Route 53.

- ACM validation CNAMEs, one set per certificate (the `footbag.org`/`www` certificate and the separate `archive.footbag.org` certificate) — applied early; permanent, renewals depend on them. Verify: `dig <validation-name> CNAME +short` matches the ACM-supplied value.
- SES domain-verification TXT at `_amazonses.footbag.org` (the SES-issued token) — applied early alongside the DKIM CNAMEs.
- SES Easy DKIM: three CNAMEs `<token>._domainkey.footbag.org` → `<token>.dkim.amazonses.com` — applied early; permanent. Verify each with `dig CNAME +short`.
- Custom MAIL FROM subdomain, required for DMARC SPF alignment: `mail.footbag.org` MX `10 feedback-smtp.us-east-1.amazonses.com` and TXT `v=spf1 include:amazonses.com ~all` — applied on email day. Verify: `dig mail.footbag.org MX +short` and `dig mail.footbag.org TXT +short`.
- Apex SPF TXT: `v=spf1 include:amazonses.com include:_spf.google.com <the webmaster's sending host plus any secretary-confirmed senders> ~all` — applied on email day; additive, safe while the legacy sender still runs. Verify: `dig footbag.org TXT +short`.
- DMARC TXT at `_dmarc.footbag.org`: `v=DMARC1; p=none; rua=mailto:<monitored report mailbox>; adkim=s; aspf=r; pct=100` — applied on email day; tightened per the §28 staged rollout. Verify: `dig _dmarc.footbag.org TXT +short`.
- MX: `smtp.google.com` priority 1 — applied on email day, after every active address is provisioned on Google. Verify: `dig footbag.org MX +short`.
- `archive.footbag.org` CNAME → the archive distribution's `cloudfront.net` endpoint — applied before cutover. Verify: `dig archive.footbag.org CNAME +short`.
- `www.footbag.org` and the apex `footbag.org` as Route 53 ALIAS records → the production CloudFront distribution — applied by the operator at T-0; this is the go-live switch itself.

**Timing:**

- T-7d minimum lead time: the maintainer formally notifies the webmaster of the cutover window and confirms reachability per §19 item 19. The `www` and bare-domain records change at cutover, so a low TTL is set in advance for a fast switch.
- T-0: the operator switches the `www` and bare-domain records on Route 53; the low TTL makes propagation fast.
- T+0 to T+48h: §27 monitored watch window; recovery is fix-forward or a platform restore, with any DNS action operator-made (§27).

Post-cutover verification: as part of State 4 step 11, confirm `www` resolves to the new platform via CloudFront (not directly to the Lightsail origin, per the §29.3 origin-verification gate) and the apex 301-redirects to `www`; correct before declaring step 11 complete.

Sign-off on this sequence is a prerequisite for §24 State 3 → State 4 transition.

**Zone move to Route 53 (go-live preparation, §19 item 15):** the zone moves before go-live. A zone snapshot is taken first so MX, DKIM, SPF, DMARC, and validation CNAMEs copy faithfully into Route 53; Steve makes the registrar name-server change; resolution is verified against Route 53 before any cutover step depends on it; and the apex and `www` are served as Route 53 ALIAS records at the switch. The generic DNS cutover procedure (`docs/DEVOPS_GUIDE.md` §6.7) governs the move. Steve's bind9 service retires once nothing resolves through it, and DNS authority sits under IFPA-controlled access from then on.

### 29.12a Legacy host after cutover (shutdown)

After cutover the legacy host serves nothing. Once go-live is verified, Steve executes the legacy-side shutdown (§19 item 31); recovery relies on the platform's own snapshot and the encrypted artifacts (§27, §19 item 30), not on a standing legacy server. No legacy subdomain stays live (§19 item 16).

**Hard design constraints (locked):**

1. Legacy serves nothing on the live path; the §29.3 origin-verification gate stands (only CloudFront reaches the new platform's origin). A catastrophic-failure fallback, if ever needed, is a read-only reconstruction from the tested encrypted artifact (§27), not a standing server.
2. Historical content is served read-only from the platform-controlled `archive.footbag.org` (its own CloudFront distribution over HTTPS, Route 53 DNS, signed-cookie auth per DD §6.4, Legacy Archive), not from live legacy subdomains. The session cookie widens to `Domain=.footbag.org` per DD §3.2 (JWT sessions) and §6.4 so the archive receives it; no legacy subdomain stays live (§19 item 16 — every live legacy subdomain is plain HTTP, which would expose the widened cookie), so the platform archive is the only other host that ever receives it.
3. The legacy-side shutdown executes once go-live is verified; the encrypted recovery artifacts are kept through the §27 window plus the dispute period (§19 item 30), then working copies are destroyed on recorded dates. Nothing legacy is a long-lived parallel system.
4. Steve captures the recovery artifacts and executes the legacy-side shutdown; DNS authority is on Route 53 under IFPA-controlled access from before go-live.
5. Group, committee, and mailing-list functions do not stay on a live legacy server. Per §19 item 26 (with Julie scoping which survive): discussion lists move to Google Groups or retire with notice and archived history; one-way announce is native. IFPA `@ifpa.footbag.org` list functions are dispositioned with IFPA governance.

**Legacy host failure matters only before go-live**, while preparation steps still read from it (the final export, archive capture, and the forum and wiki dispositions). After go-live the legacy host is out of every path: recovery is the pre-flip DB snapshot (§29.1a) plus the platform's own disaster recovery, and inbound mail is on Google Workspace, independent of any legacy machine.

**Variables settled with the legacy-site webmaster:**

- Subdomain inventory (§19 item 16): which ruling each `*.footbag.org` name gets (replace, archive, or retire).
- Legacy retirement milestones (§19 item 31).
- Zone move to Route 53 (§19 item 15; go-live preparation).
- Records-actor (§19 item 17: Steve until the zone moves, the operator after), and reachability through the window (§19 item 19).

**MX disposition for `@footbag.org`:** outbound SES sender identity is verified at the `footbag.org` domain level using the DKIM CNAMEs plus the SPF amendment authorizing SES; no inbound mailbox is required for SES verification, and the platform accepts no inbound mail. Inbound `@footbag.org` role addresses (`brat@`, `directors@`, `sanctioning@`, and the rest) move to Google Workspace (settled; the per-address inventory is §19 items 6-9, with Julie), provisioned before legacy delivery is withdrawn so no mail is lost; legacy mail then retires. Provisioning precedes the MX repoint: nothing moves until its Google mailbox, group, or forward exists. `@ifpa.footbag.org` is a separate mail domain on llic.net (IFPA list mail below). Cloudflare Email Routing is not used.

**Email cutover step.** The SES sending setup is verified before cutover (SPF amendment + SES DKIM) and the inbound role-address receiver is settled (§19 item 24), gated by the confirmed inventory (§19 item 21) and per-list dispositions (§19 item 26). Skeleton (detailed operator click-paths live in `docs/DEVOPS_GUIDE.md` once the step is executed):

1. Provision every active `@footbag.org` mailbox or alias on Google from the confirmed inventory; verify each receives test mail. Decide the `noreply@` handling (monitored alias or Reply-To `admin@`, per §28).
2. Pre-shrink the `footbag.org` MX TTL. If the mail step runs before the zone move, this is the webmaster's manual action on his zone (the platform's `dns-ttl-preflight.sh` operates on Route 53 and applies only once the zone is there); after the move the operator runs it on Route 53.
3. Ahead of the web cutover, as a discrete step: amend the SPF to add SES and Google (additive; the still-running legacy sender is unaffected), point the MX at Google, and publish DMARC in monitor-only mode (`p=none`) with a monitored report mailbox. At the web cutover, retire legacy mail; tighten SPF and DMARC (`quarantine`, then `reject`) only after the sender list is confirmed and the reports run clean. No backup MX to the legacy server — it is retiring, and inbound goes only to Google.
4. Verify inbound end-to-end to every provisioned address; verify SES outbound passes SPF/DKIM/DMARC checks at a major provider.
5. Withdraw legacy `@footbag.org` delivery entirely. The `@ifpa.footbag.org` domain is separate and follows its own disposition (below); this step does not touch it.

Rollback: if Google inbound fails verification, revert the MX to the legacy mail server until it is fixed (a pre-go-live contingency only; after go-live there is no legacy mail server to revert to); the web cutover is independent and unaffected. Gate: EX7.

Two email concerns remain open before the transition (front-matter questions 6-7):

1. **Inbound mailbox inventory.** A candidate enumeration is derivable from the delivered members dump by replaying the legacy alias logic (`members/admin/dumpaliases.php`), which emits the per-member alias-to-forward map plus the `announce`/`members` lists; the role addresses (`admin@`, `webmaster@`, `registration@`, and so on) appear in the legacy code. What the dump does not settle is which addresses are actively used versus dead or spam-only, and any apex aliases hand-configured in sendmail outside the codebase. The inventory is the transition-day safety gate (§28): every active address must be provisioned on Google before legacy delivery is withdrawn.
2. **Mailing-list mapping.** USER_STORIES defines platform-managed mailing lists (newsletter, board-announcements, event-notifications, technical-updates, announce, group auto-sync lists) sent via SES; §19 item 26 allocates each legacy list to stay/migrate/retire; but no mapping exists between the US-defined lists and the lists the legacy server actually operates. The legacy side is now partly identified: the `announce`/`members` lists are generated from members-table opt-in flags by `dumpaliases.php`, the IFPA committee and group lists are the `@ifpa.footbag.org` `wrapper/` server (above), and the public discussion lists (footbag, freestyle, sewing) run on Majordomo at `list.footbag.org`. The `announce@footbag.org` name appears in both contexts and must resolve to exactly one owner at the transition.

Legacy mail server health is no longer a standing concern: the email transition retires it for `@footbag.org` entirely; the residual mail-host concern applies only to `@ifpa.footbag.org` on llic.net, dispositioned below.

**IFPA list mail (`@ifpa.footbag.org`) disposition.** `@ifpa.footbag.org` is a distinct mail domain from `@footbag.org`. It has its own MX, hosted at llic.net, which runs the IFPA groups and committees mailing-list server: a sendmail-tied posting and moderation service (the legacy `wrapper` component) that accepts inbound mail to IFPA group and committee aliases, parses MIME, enforces moderation, and retains message history. This service runs outside the new platform and is unaffected by the `@footbag.org` move to Google Workspace; repointing `footbag.org` MX does not touch `ifpa.footbag.org` MX.

Disposition is a requirements-gathering item that gates go-live, not a v1 platform build. The new platform does not receive inbound email (no SES receiving rules, no inbound processing code; see §28), so any list function still needed is replaced by a Google Group or another approved non-legacy service, never by platform code; the platform's native groups system remains forward-looking and is not a migration target for the legacy list server.

Julie's discovery (the front-matter discovery section) establishes which lists are actively used and by whom. The wrapper's real capabilities — inbound posting, recipient expansion, posting permissions, moderation, MIME parsing, private and public groups, and message archiving — are the checklist a replacement must cover for each retained list. Every retained function has its approved replacement live at go-live; every other list is retired with notice where needed; and the list host shuts down with the rest of the legacy services rather than remaining running. The dispositions themselves are IFPA governance decisions scoped with Julie.

Usage discovery (the legacy-site webmaster supplies the facts; disposition of any IFPA-owned list function or data is an IFPA governance decision, not a webmaster or maintainer one):

1. Which `@ifpa.footbag.org` aliases received any non-spam mail in the last 12 months?
2. Who reads each such alias today, and does any committee still conduct business over it rather than over ordinary email or board tools?
3. For any alias still in real use, what must its Google Group (or other approved) replacement cover so the list host can retire at go-live?
4. The legacy source (the `wrapper` list component and the `groups/` code) addresses every committee and sanctioning list as `<list>@ifpa.footbag.org`, and no apex `sanctioning@footbag.org` or `directors@footbag.org` appears in the legacy code or the published site. Apex mail routing lives in sendmail aliases outside the codebase, so confirm whether `sanctioning@footbag.org` and `directors@footbag.org` exist as live apex aliases today and where they forward. This reconciles the Canonical Email Addresses decision in DESIGN_DECISIONS (§5.5), which lists both as apex receive addresses to provision on Google: if the real in-use contacts are the `@ifpa.footbag.org` lists, settle the target domain (consolidate onto apex on Google, or keep on the llic.net list server) before the email transition provisions any address.

The roughly 1.2GB `ifpa_group_messages` archive is dispositioned under the sealed legacy email archive below.

**Sealed legacy email archive disposition.** The legacy `ifpa_group_messages` archive (private and public discussions intermixed, with spam and moderation residue; historically about 1.2GB uncompressed, since substantially cleaned up by Steve, the compressed remainder still far beyond GitHub's file-size limit; includes privately cast committee votes) is sealed and retained privately. It must never sit on a public web server or in any GitHub repository. Under every v1 branch it is not imported into the platform, not processed, not spam-cleaned, and not exposed publicly. Privately cast votes within it are permanently non-publishable.

The seal is enforced technically. The archive is held as an encrypted container; its decryption key is held in an IFPA-governed, access-controlled secret store. The encrypted container and the key vault are kept in an IFPA-governed cloud store restricted to the IFPA board and platform admins. The credential that opens the key vault is held separately from that store, under IFPA governance, with an IFPA-named backup holder, so access to the store alone cannot unseal the archive and loss of a single credential does not destroy it. The legacy-site webmaster is operational custodian of the encrypted container and the authoritative source for facts about its contents; he is not its decision authority.

Any future disposition (preserve a subset as historical record, redact, publish any portion, or destroy it) is an IFPA governance decision under IFPA's records-retention policy, never operator or webmaster discretion. The migration's only standing commitment is the seal: keep it private, keep it intact, expose nothing, until IFPA governance directs otherwise. Neither the encrypted container nor the key is ever committed to the repository, placed in issues, logs, tests, or AI prompts. Concrete custody details (store, folder, vault entry, access list) live only in operator notes, never in a tracked doc.

Transfer follows decision, not the other way around. Steve can move the archive to a secure private destination as soon as one is provided, but no destination is provided and no final dump is requested until Julie confirms the archival scope with the group owners and the IFPA board: which groups are included; whether only approved messages are kept; whether spam and moderation residue is excluded; how private and public groups are treated differently; who may access Directors and other private messages; where the encrypted archive lives; who holds decryption authority; how long it is retained; and whether any portion may ever be published. Julie has asked that group messages, particularly the Directors group, be preserved; that is recorded as her input to the scope, not as final authorization. Hundreds of megabytes of highly confidential records are not transferred merely because transfer is technically easy.

The content disposition (what is ultimately kept, redacted, or destroyed) is deferred and does not gate v1. What does gate go-live is the capture: the approved-scope archive is captured and sealed before the list host and the legacy databases shut down.

### 29.12b Legacy URL forwarding for in-flight emails

Old footbag.org emails (account verification, share-event links) reference legacy URL patterns like `/members/profile/{legacy_member_id}` and `/clubs/{slug}`. After cutover, these emails continue circulating in inboxes for months or years.

Forwarding contract for the production app:

- Member profile patterns: `/members/profile/:legacyMemberId` resolves in three branches: (a) if the legacy ID maps to a non-deleted live member via `members.legacy_member_id`, redirect 301 to the slug-based URL `/members/:slug`; (b) if the legacy ID matches an unclaimed `legacy_members.legacy_member_id`, render a soft-landing page with a generic message ("this link points to a legacy footbag.org account") and a CTA to claim it (authenticated visitors, who may see the account's display name) or to register first (unauthenticated visitors, who are never shown the display name or any other account detail); (c) if the legacy ID matches no row in either table, render the friendly "this legacy account is no longer routable" 404 page. The soft landing in branch (b) preserves the claim funnel for members who follow old links before completing claim.
- Club patterns: legacy `/clubs/:slug` URLs resolve to the new club page if the slug survived normalization; otherwise to archive.footbag.org for the historical mirror or a 404 page when neither exists.
- Forum patterns: pending the forum-status confirmation (front-matter question 19); unknown patterns fall through to the friendly legacy-URL 404 below.
- Unknown patterns: 404 with a generic legacy-URL message that directs the visitor to footbag.org.

From go-live, `footbag.org` apex and `www` are served entirely by the new platform. There are no retained `*.footbag.org` subdomains. Redirect-handler coverage in the production app must therefore cover every legacy URL pattern that meaningfully forwards to a new destination, validated at test load by replaying a stored sample of legacy URLs against the production app.

Procedure: redirect handlers live in the public router; the sample-replay validation step is part of the test-load checklist.

### 29.13 Curator content seeding

Gate: the system member account (Footbag Hacky per the System Member Account decision in DESIGN_DECISIONS, §2.8) is seeded into the production DB and its curator content (avatar in `/curated/avatars/`, fixed site content (demo loops, the foundations mosaic, the event promo image) in `/curated/site/`, tutorials and records in `/curated/freestyle_tricks/`, etc.) is loaded into the production media bucket before public DNS cutover. Landing pages and curator-tagged surfaces must resolve to the production media bucket, not 404. The deploy orchestrator runs `scripts/seed_fh_curator.py` against the prod DB and `aws s3 sync` against the prod media bucket; verify via post-deploy smoke check. Curator content extends by adding file-paired sidecars under `/curated/{category}/`; no manifest edits are needed. This is the one-time pre-cutover population, performed while the production DB is still being established; after cutover the production DB is persistent and the seeder is not re-run against it (post-launch authoring is admin-UI -> DB per §29.14).

The seed transcodes off-host at build time: `scripts/seed_fh_curator.py` runs on the operator build host, re-encoding each source video through a one-at-a-time ffmpeg subprocess into an ephemeral build directory that the deploy `aws s3 sync`s to the production media bucket. The production host serves the pre-transcoded artifacts and never runs ffmpeg for curator content. The interactive admin curator upload path, which executes on the memory-constrained production host, runs transcode through the async `media_jobs` lifecycle (the Image Processing decision in DESIGN_DECISIONS, §6.8) instead. This is the pre-go-live seed path; it consumes the `/curated/` JSON sidecars, which are retired at go-live when the persistent DB becomes the source of truth (§29.14).

### 29.14 Post-launch admin curator authoring

At go-live the source of truth for system-member-owned curator content moves from the pre-go-live `/curated/` authoring layer (and the seeder that builds the DB from it) to the persistent production DB: admins thereafter author through the admin UI, which writes the DB directly; the seeder is not run against production; data-preserving deploys use `scripts/deploy-migrate.sh`. The model and success criteria are defined in the Curator Content Source of Truth decision in DESIGN_DECISIONS (§1.13) and the `A_Upload_Curated_Media` / `A_Manage_Curated_Gallery` user stories. This switch from JSON-sidecar authoring to the persistent DB is covered by special tests of its failure modes: curator content (`media_items`, galleries, and S3 bytes) survives a data-preserving `scripts/deploy-migrate.sh` deploy with no seeder run; admin-UI create, edit, and delete is the sole post-go-live authoring path and is durable without seeder replay; and a guard prevents the seeder from running against a persistent production DB, whose orphan-cleanup would otherwise delete admin- and member-created rows that have no `/curated/` sidecar: the seeder refuses any database carrying the in-database post-cutover marker, the shared guard every destructive seeder and loader checks before mutating (the Curator Content Source of Truth decision in DESIGN_DECISIONS, §1.13). Gate: OR9 (the data-preserving deploy additionally depends on OR1/OR8 backup and restore). Must land before State 3 → State 4.

### 29.14a Post-launch admin email-template authoring

At go-live the source of truth for email-template content moves from the pre-go-live committed JSON sidecars (and the seeder that loads them into `email_templates`) to the persistent production DB, exactly like curated media (§29.14): admins author through the template editor, the seeder is not run against production, and template rows survive a data-preserving `scripts/deploy-migrate.sh` deploy. The model mirrors the Curator Content Source of Truth decision in DESIGN_DECISIONS (§1.13). The switch is covered by the same class of special tests: templates survive a data-preserving deploy with no seeder run; admin-UI editing is the sole post-go-live authoring path; and the seeder fails fast rather than orphan-deleting admin-edited rows when pointed at a persistent production DB: it refuses any database carrying the in-database post-cutover marker (a `system_config` row, key `post_cutover`, written at cutover), the shared guard every destructive seeder and loader checks before mutating. Gate: OR9a. Must land before State 3 → State 4.

### 29.15 Legacy archive subdomain readiness

Per the Legacy Archive decision in DESIGN_DECISIONS (§6.4), archive.footbag.org serves the static legacy HTML mirror under member-only access enforced by CloudFront signed cookies. The archive launches at cutover.

**Archive completeness and legacy media.** The archive mirror holds the legacy content the crawl could reach: media linked under `www.footbag.org` (the `gallery`, `video`, `photos`, and `qt-video` paths) is captured and re-encoded to mp4/jpg/gif. Legacy media lives only in this archive; it is never imported into the new platform's media system (the Legacy Archive decision in DESIGN_DECISIONS, §6.4). Media reachable on the legacy server only by a direct `video.`/`photo.` file path that was never linked under `www` was not crawled and is therefore not in the mirror; those direct-path links are already dead today, so no subdomain is retained for them. Recovering that un-crawled media would require the webmaster to supply the files plus a path mapping from the legacy server; that is an optional, non-blocking, post-v1 archive-enrichment handled through the §19 feedback workflow, not a cutover dependency.

Gate, all of the following are provisioned and verified end-to-end:

- **Archive S3 bucket** (Terraform `aws_s3_bucket.archive` or equivalent) is private behind Origin Access Control. Bucket policy permits only the archive CloudFront distribution to read. Versioning and Object Lock per the standard private-bucket pattern.
- **CloudFront key group** (`aws_cloudfront_public_key` + `aws_cloudfront_key_group`) is provisioned in Terraform. The trusted-signer keypair private half is stored in AWS Secrets Manager (or SSM SecureString) scoped to the main app's runtime IAM role; the public half is registered in the key group.
- **Archive CloudFront distribution** is provisioned with: the archive S3 bucket as origin via OAC; the cache behavior naming the key group in `trusted_key_groups`; 1-year edge TTL per the CloudFront CDN decision in DESIGN_DECISIONS (§6.2) immutable-archive guidance; ACM cert for `archive.footbag.org` attached; custom 403 error response redirecting to `https://footbag.org/login?return=archive.footbag.org`.
- **DNS record** for `archive.footbag.org` pointing at the archive distribution, applied in the authoritative zone before cutover — by the webmaster before the zone move, by the operator on Route 53 after it, where it is an ALIAS (per §19 item 17 / WM14).
- **Cookie-Domain widening** deployed: both `footbag_session` and the new CloudFront signed cookie use `Domain=.footbag.org` so the archive subdomain receives them. The widening lands AFTER the CSRF Origin-pin middleware (the CSRF Protection decision in DESIGN_DECISIONS, §3.3) is in production and BEFORE archive.footbag.org receives its first authenticated request.

**Cookie-Domain widening scope:** widening to `Domain=.footbag.org` sends `footbag_session` to `.footbag.org` hosts. The intended recipient is the platform-controlled `archive.footbag.org`, served over HTTPS by its own CloudFront distribution (DD §6.4). Any legacy subdomain the §19 item 16 ruling keeps live would also receive the cookie, so the widening ships only after that ruling is in and the exposure re-verified against it. The CSRF Origin-pin middleware (DD §3.3) remains the cross-subdomain defense against a malicious form on the archive subdomain.
- **Archive HTML mirror content** uploaded to the bucket. All video content is mp4, all images are jpg, no JavaScript present (DD §6.4 contract).
- **End-to-end auth flow tested**: unauthenticated request to `https://archive.footbag.org/some-path` returns CloudFront's signed-cookie-missing 403 with the redirect to the main-site login; an authenticated member's request returns 200 from S3 origin.

Procedure: Terraform provisioning and end-to-end test runbook live in `docs/DEVOPS_GUIDE.md`.

### 29.16 TLS health monitoring on retained subdomains (contingent on the subdomain ruling)

If the §19 item 16 disposition retires every legacy `*.footbag.org` subdomain, external retained-subdomain TLS monitoring is not needed: the only `.footbag.org` host receiving the widened session cookie is the platform-controlled `archive.footbag.org`, whose TLS is managed by its CloudFront distribution (DD §6.4) — always valid, no external expiry probe required. If any legacy subdomain stays live, it receives the widened cookie too, so its TLS health becomes a monitored item and the §29.15 cookie analysis is re-verified before the widening ships.

### 29.17 Security hardening (operator-doc security audit remediation)

Gate: the items surfaced by the operator-doc security audit are resolved or explicitly accepted, with rationale recorded in the cutover sign-off, before State 3 → State 4:

1. Operator secret hygiene: every runbook that writes a secret to SSM or a host file uses the `file://`/temp-file (or stdin) transport, and pasted-key steps suppress shell history, so no live secret reaches process argv or shell history (DEVOPS_GUIDE §10.5/§10.10/§10.12/§10.14; DEV_ONBOARDING §8.10/§8.15/§8.16).
2. The workstation runtime AWS profile for the production role carries `mfa_serial`, so a stolen at-rest `~/.aws/credentials` cannot assume the role without the operator's MFA device (the profile follows the chained-AssumeRole pattern in DEVOPS_GUIDE §18.8, which documents the staging profile where `mfa_serial` is intentionally omitted; the production profile adds it).
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

### 29.18 Additional go-live sign-off gates

Calibrated for a small, volunteer-run international nonprofit handling member PII and payments. Each is a cutover-time checkpoint with an observable pass artifact.

- **Member data-subject requests.** A member can export their own personal data and request account deletion through the site; deletion clears the identity links per the member / historical-person entity-types decision. Verified by one end-to-end exercise on staging that produces the export artifact and a completed deletion.
- **Accessibility.** The WCAG 2.1 AA automated checks (axe-core across the high-traffic public pages) are wired into the suite and green at cutover; any accepted exceptions are recorded in the cutover sign-off.
- **Load and performance.** One representative load run on staging meets the agreed latency and error-rate targets. Lightest of these gates; the targets are modest and set to the expected member population.
- **Member communications and status channel.** Members are notified of the cutover window and what changes for them, and an out-of-band status channel (reachable if the site is down) is named and tested before cutover day.
- **Release candidate and change freeze.** The cutover deploys one tagged commit, built once and recorded in the cutover log — the same artifact the State 3 smoke and email checks ran against. From State 3 sign-off to cutover only fix-forward patches land, each re-entering the smoke suite; any other change re-opens State 3.
- **Go / no-go decision.** Dave, the primary maintainer, records a written go/no-go against the blocker index, with the latest-safe rollback time agreed, before the cutover deploy. Precondition: the §27 monitoring thresholds not yet fixed (origin-latency p95, login-success rate) are set from the staging baseline first — a go/no-go cannot be checked against unset thresholds.
- **Post-launch close-watch period (hypercare).** Immediately after cutover the team watches the system closely and responds fast to issues. Before the encrypted working copies are destroyed and Steve's role closes, a 14-day close-watch window from cutover (inside the 30-day artifact retention) passes with no unresolved high-severity issues and error/latency within target, extendable if a high-severity issue is open when it lapses. This defines the "stable post-cutover operation" the legacy retirement milestones depend on.

## 30. QC subsystem retirement (go-live gate)

The internal QC subsystem (`/internal/net/*`, `/internal/persons/*`, and supporting code, tables, and tests) is a hard go-live gate: no production deployment may carry QC code, routes, or tables. Deletion is not a post-launch tidy-up. Scope at retirement time: every `/internal/*` route, its controller and service code, its Handlebars views, its schema tables, its `db.ts` prepared-statement groups, and its tests.

Sign-off on QC retirement is a prerequisite for §24 State 3 → State 4 transition.

**QC retirement inventory** (canonical list of paths and tables to delete; the retirement PR maintainer extends this list if files have been added since):

- Controllers: `src/internal-qc/controllers/netQcController.ts`, `src/internal-qc/controllers/personsQcController.ts`.
- Services: `src/internal-qc/services/netQcService.ts`, `src/internal-qc/services/personsQcChecks.ts`, `src/internal-qc/services/personsQcService.ts`.
- Views: every `.hbs` file under `src/views/internal-qc/`.
- `src/db/db.ts`: every prepared-statement group banner-marked `// ---- QC-only (delete with pipeline-qc subsystem) ----`.
- Schema tables in `database/schema.sql`: `net_review_queue` (and any future QC-only tables added under the same banner). Before deleting, resolve whether `net_candidate_match`, `net_curated_match`, and `net_raw_fragment` are QC-only or pipeline-load tables.
- Tests: `tests/integration/persons.qc.routes.test.ts` and every `net.*.routes.test.ts` (`net.candidates`, `net.candidate-curation-conflict`, `net.curated`, `net.curated-browse`, `net.events`, `net.home`, `net.review`, `net.routes`), plus any others that exercise the deleted routes.
- Route mounting in `src/app.ts` for the `/internal/*` router (and the router file itself if it serves only QC).
- Production image hygiene: `docker/web/Dockerfile` strips `dist/internal-qc` from the production stage as an interim safeguard until source deletion lands; the retirement PR removes the strip line together with the source.

**Keeper carve-out.** The emerging-vocabulary workbench is already relocated out of the internal-QC subsystem: its controller is `src/controllers/emergingVocabController.ts`, its view is `src/views/admin/emerging-vocabulary.hbs`, and it is served at `/admin/freestyle/emerging-vocabulary` on the production admin router under the same admin gate. It sits under no internal-qc path, so the views deletion, the `dist/internal-qc` strip, the router deletion, and the CI grep do not touch it. The former `/internal/freestyle/emerging-vocabulary` URL redirects there until `internalRouter` is removed.

**Automated enforcement**: two layers, paired so a typo or rename can't silently slip through:

1. **Positive-assertion test** (preferred). A test asserts that named QC files (the controllers, services, views, and schema table definitions deleted at retirement) no longer exist in the source tree. The test is keyed to the retirement PR's file list; absence is the success signal. This catches the case where someone restores a deleted file but the grep pattern wasn't extended to cover its name.
2. **Pattern grep** (defense in depth). A CI check runs against every PR targeting `main` that greps the source tree for known QC entry points (`/internal/`, `internalRoutes`, `netQcController`, `personsQcController`, `internal_qc` schema table names) and fails the build if any are found. The grep pattern list is maintained alongside the QC retirement PR.

The retirement PR adds both layers to `.github/workflows/ci.yml`. R1 sign-off asserts both layers are present and green.

## 31. Primary-maintainer test-user retirement (retired early)

The primary-maintainer real-flow test user and its person-specific scaffolding — the journey builder, the build-then-switch route, its catalog entry, and the build-on-switch plumbing — have been removed ahead of cutover rather than at it, so no production deployment carries them. That test user was an initial-testing aid that drove the real registration, verify, claim, onboarding, and upload flows against a real-data dev or staging database; it was never a product feature. It logged in with a synthetic test address and claimed its Hall-of-Fame legacy record by `legacy_member_id`, so no maintainer email ever lived in the system to remove.

The real-flow assurance that scaffolding provided is preserved, and broadened, by a four-track testing suite: a synthetic register-through-co-lead journey in continuous integration; a read-only, PII-safe whole-population invariant gate over the loaded real data (counts and pass/fail only); a generic real-claim crawl that builds a claimed account for any real record through `GET /dev/build-claim?as=<legacy_member_id>` and walks its rendered surfaces; and a human stratified-sampling walk on staging. Migrated-real-data behaviour is verified by claiming any real record rather than one fixed person.

Verification that the scaffolding is gone: a grep of the source tree for the old entry points (the journey builder and build-then-switch route names, the build-on-switch field, and the person slug) returns nothing, and the test suite and type-check pass. No production-bound member carries the test user's slug. This item is no longer a State 3 → State 4 blocker; it is satisfied.
