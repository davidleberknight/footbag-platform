# Footbag Website Modernization Project -- Data Governance

**Authority:** Canonical policy for member-data visibility, public historical records, search and anti-enumeration, exports, logging hygiene, and derived statistics. Rationale lives in `docs/DESIGN_DECISIONS.md`; the two must not contradict.

**Scope:** All contributors, maintainers, and AI agents working on this codebase.

**What belongs here:** short, declarative rules about data visibility, privacy boundaries, and data handling. Not behavior specs or flows (USER_STORIES), not rationale (DESIGN_DECISIONS), not implementation state (IMPLEMENTATION_PLAN). If a line needs more than two sentences, it is probably a story.

---

## 1. Core principles

1. **Privacy is security.** Member-data handling, discoverability, logging, exports, and visibility are part of the security architecture, not a compliance afterthought.
2. **Public historical records are legitimate and required.** Official event results, year archives, HoF/BAP, and world records are public historical surfaces. Suppressing them is not a privacy win.
3. **Historical discoverability is not current-member discovery.** The fact that a person appears in historical results does not make them publicly searchable or contactable as a current member.
4. **Imported historical people are public historical identities, not public member accounts.** The link between a `historical_person` record and a `member` account does not escalate the historical identity into a searchable or contactable current-member profile.
5. **Searchability and visibility must be explicit and scoped.** Current-member search is authenticated only, anti-enumeration, and non-directory.
6. **Contact information is never a public default.** No contact field is publicly visible without an explicit, documented decision.
7. **Derived stats are governed outputs.** Incomplete datasets require caveats or suppression. Official records outrank aggregates.
8. **No auth-bypass toggles.** Env vars must not gate route-level authorization behavior.

---

## 2. Authentication and authorization boundary

- Anonymous routes serve only surfaces classified public in §3 and the canonical design docs (home, public events/results, year archives, world records, limited historical-person, HoF/BAP, and club pages).
- Anonymous surfaces expose approved non-PII fields only. No contact information, addresses, emails, or phone numbers.
- A public page may carry an authenticated enhancement only where that boundary is documented (e.g. the club page: public shell, member-visible roster and contact).
- Member-only content requires a genuine session-path authorization check.
- Deceased members cannot authenticate regardless of credentials; the member lookup backing login excludes rows flagged deceased (it matches only `is_deceased = 0` rows), so a deceased account never reaches a credential match.

---

## 3. Member-data visibility taxonomy

| Sensitivity | Label | Examples | Auth required |
|-------------|-------|----------|---------------|
| 1 | Public official historical record | Event results, year archives, HoF/BAP, world records, minimal historical-person pages | None |
| 2 | Authenticated current-member lookup | Member search, member profiles | Yes: logged-in member |
| 3 | Role-scoped operational surfaces | Organizer participant management, club-leader rosters, workflow exports | Yes: role check |
| 4 | Internal/admin only | Full member history, audit workflows, broad exports, identity resolution | Yes: admin |
| 5 | Archived member-only legacy | Old footbag.org archive | Yes: logged-in member |

Anything not in this taxonomy defaults to Sensitivity 4 (internal/admin only) until explicitly classified.

**Demographic fields**: `birth_date` is private (Sensitivity 4: owner and admin only); it never appears on public surfaces, in member search, or in any cross-member listing, and is used for age checks. `gender` is owner-and-admin by default and is used for gender-gated event-category eligibility; additionally a member may opt in (the `show_gender` flag) to make it member-visible (Sensitivity 2), in which case it is shown to authenticated members on the member profile, in member search, and on club rosters. An opted-in gender is never shown to an unauthenticated visitor, and only `male` / `female` render (an `undisclosed` value publishes nothing).

**Contact fields** (`login_email`, `phone`, `whatsapp`) default to not-visible. A member opts in per field, and an opted-in contact field is shown to authenticated members only (Sensitivity 2), never on public surfaces. The exception is an operational contact role: holding a club co-leader or event organizer role exposes that member's contact email to authenticated members (the role is the consent, and the email cannot be hidden while the role is held). A role-holder's WhatsApp stays opt-in like any member's.

**Media attribution and curated provenance**: Media galleries and tag gallery pages are public (visitor-accessible). Provenance tags are system-applied and unforgeable: every member upload carries `#by_<member_slug>` and every curator upload carries `#curated`; the system applies them at upload time and rejects them when supplied in input. A member upload is publicly attributed by the uploader's display name, which links to that member's public per-uploader gallery (the `#by_<slug>` browse view); the uploader's contact fields and member profile remain member-only (Sensitivity 2). A curated item is attributed to the curated collection (the `#curated` view). Avatars are excluded from every gallery, browse, and tag-suggestion query.

---

## 4. Public historical record policy

The following surfaces are approved public historical records:

- **Official event results**: results from sanctioned events, imported from legacy data or entered by organizers.
- **Year archives**: event and result listings by year.
- **Hall of Fame (HoF)**: permanent honor; publicly discoverable.
- **Big Add Posse (BAP)**: permanent honor; publicly discoverable.
- **World records**: official record tables/pages. Not inferred from incomplete aggregates.
- **Minimal historical-person pages**: name, country, official honors, official result/event links, world-record inclusion where applicable. No contact fields. Not a current-member profile.

HoF and BAP honors are preserved even through PII purge or deceased flows. The honor record outlives the personal data.

---

## 5. Derived statistics, data completeness, and caveats

A public or member-visible derived stat is justified only when:

- it is genuinely useful and interesting to footbag historians or clearly valuable to the community's official record, **and**
- either (a) the underlying source scope is sufficiently complete for the claim being made, or (b) the UI clearly presents scope, missing-data, and interpretation caveats.

Where those conditions are not met, prefer raw official results, honors, and record listings over aggregate summaries.

**Approved by default:**

| Stat type | Status |
|-----------|--------|
| Official event placements | Approved: primary source |
| Year archive / event listing | Approved: primary source |
| HoF/BAP membership | Approved: official honor |
| World-record tables (official) | Approved: official record |
| Country representation in events | Approved: clearly scoped |

**Requires explicit caveat or suppression:**

| Stat type | Condition |
|-----------|-----------|
| Career win total from partial import | Rejected unless caveated with coverage dates |
| "All-time" aggregate from partial data | Rejected unless caveated with coverage dates |
| Any ranking covering less than the full competitive era | Rejected unless caveat names the gap explicitly |

**Test question:** "Would a footbag historian cite this stat in an article without needing to add a methodological footnote?" If no: caveat clearly or suppress.

---

## 6. Search, discoverability, anti-enumeration, and scraping resistance

**Current-member search** is:

- authenticated only,
- deliberately narrowing (prefix-oriented, minimum prefix length),
- capped for broad queries with a "refine your query" message rather than full pagination,
- not a browse-all directory,
- not suitable for bulk extraction,
- rate-limited, and
- never public.

The `searchable` flag on a member record means **eligible for authenticated current-member lookup only**. It does not mean publicly discoverable, publicly contactable, or visible on historical-person pages.

**Public historical-person pages** are not search surfaces. They are read-only record pages reachable by direct link or from event result pages.

Public routes must not expose any endpoint that allows enumeration of current members.

---

## 7. Rosters, participant lists, organizer/contact surfaces, and exports

- Club rosters: visible to logged-in members only; role-scoped for leader/admin operational use.
- Event participant lists: official published results are public; operational participant-management lists are organizer-role-scoped only.
- Organizer and club-leader contact information: never public. A club co-leader's or event organizer's own contact email is visible to logged-in members; holding the role is the consent, and the email cannot be hidden while the role is held. The role-holder's WhatsApp shows to logged-in members only when they opt in. A club is reachable through its co-leaders and an event through its organizers; there is no separate club-level contact field. Operational contact surfaces (organizer dashboards, admin tooling) are role-scoped and logged.
- Exports: member data exports are role-scoped (Sensitivity 3/4 only) or individual self-export (member downloads their own data per GDPR/data-subject-access-request flow).

No contact field (email, phone, social handle) is visible on any public page or in any public API response.

---

## 8. Logging and observability hygiene

- Logs must not contain raw email addresses, tokens, passwords, or other sensitive PII.
- The same prohibition extends explicitly to infrastructure-level secrets: `SESSION_SECRET`, AWS access key IDs and secret access keys, raw JWT cookie values, account-token raw strings (only their SHA-256 hashes ever land in storage), and any signing-key material. KMS key ARNs are not secrets but should not be logged at request scope.
- Member-search queries may be logged for abuse monitoring but must be anonymized or pseudonymized before persistence.
- Audit records for sensitive visibility checks (member-search, export, admin data access) must be kept as privacy-safe structured events.
- Public route access logs do not require special hygiene beyond standard web server practice.

---

## 9. Legacy archive and imported historical identities

**Legacy archive** (`legacy_data/mirror_footbag_org/`) remains member-only because it contains private legacy member information (email addresses, personal details from the old mirror). It must not be made public.

**Imported historical results** are separate: official event results and minimal person records migrated to the live database are public historical record surfaces (Sensitivity 1). The archive itself is not.

**Imported `historical_persons` records:**

- are identity placeholders for official result attribution, not activated member accounts,
- do not automatically become searchable current members,
- do not automatically populate current-member profile fields,
- imported aggregate/stat fields (`event_count`, `placement_count`, freestyle metrics, etc.) are migration-era metadata, not automatic public biography content and not authoritative public statistics without explicit approval and caveats.

**Identity linking:** a claimed historical identity is not a separate public surface; linking never exposes more than the member profile already shows. URL dispatch and redirect mechanics live in DESIGN_DECISIONS.

**Data subject erasure:**

- Member account erasure is supported; it clears the account's identifying personal data and severs the account-to-historical-record link.
- The historical record itself remains public, with attribution name and honors.
- Two erasure paths exist and must not be collapsed. A soft-deleted account, after `member_cleanup_grace_days`, undergoes full PII purge: credentials, contact, identity links, and declared anchors are cleared while HoF/BAP display is preserved. A member flagged deceased, after `deceased_cleanup_grace_days`, undergoes a contact scrub: credentials, contact fields, demographics (gender and birth date), and declared anchors are cleared while identity, locale, honors, and identity links are preserved. Each path appends an `erasure_log` row.
- Audit-log retention follows §8; erasure does not delete audit history.
- Erasure that fails on any persistent surface (account PII, search and derived indices, backup re-application) is a launch-blocker.

**Raw legacy dumps:**

- The webmaster's private dump repository stays private, gains no collaborators without the webmaster's approval, and no raw dump is ever committed, pasted into issues, logs, tests, screenshots, or AI prompts.
- The platform receives only a sanitized export that excludes all password material by contract: any password of any form (the legacy `MemberPassword` column stores **plaintext**, not a hash), plus any hash, salt, iteration count, or recovery answers; the operator schema-checks each export and aborts the load if any password-bearing column is present. Because the legacy passwords are cleartext, the raw export is especially sensitive and is handled under the raw-dump rules below (never committed, logged, pasted into issues/tests, or placed in an AI-readable context).
- Passwords are never imported, stored, logged, or used.

**Invalid legacy rows.** Legacy member rows the source marks invalid (`MemberValid = 0`) and other mechanically-obvious garbage are excluded from `legacy_members` by default, so their PII never enters the platform. The only exception is a row pulled back by linkage to a published result, an honor, or a documented admin-recovery need (MIGRATION_PLAN legacy-member import). Exclusions are counted and validated, never silent.

**Sealed legacy email archive.** The legacy IFPA group-message corpus (private and public discussion intermixed, including privately cast committee votes) is sealed, encrypted, and retained privately under IFPA custody; it is never imported, processed, or exposed, and privately cast votes are permanently non-publishable. Custody, key handling, and release are governed by DESIGN_DECISIONS §6.5a.

**IFPA governance authority over IFPA-owned legacy records.** IFPA-owned legacy records (group messages, committee votes, elections, and the official rulebook) are IFPA governance data. Their disposition, release, redaction, or destruction is an IFPA governance decision, never operator or maintainer discretion. The legacy-site webmaster may be operational custodian and is the authoritative source of facts about these records, but holding the files does not confer authority to release or destroy them.

---

## 10. Contributor and AI-agent implementation rules

Any work touching members, historical persons, search, rosters, contact fields, exports, stats, or auth boundaries loads this file first and applies the §3 taxonomy to every surfaced field.

**Hard rules for code:**

- No public route may serve current-member search results, current-member profiles, or contact fields.
- No env-var boolean may change what content is served to anonymous vs authenticated users.
- No auth middleware may be bypassed except by a deliberate, explicitly designed stub that mirrors the real auth path.
- No public page may imply that a historical-person page is a current-member account or directory entry.
- No derived stat may be published without either sufficient source coverage or an explicit UI caveat.
- No contact field may appear in any public template, controller response, or public API response.
- No raw legacy database dump (which contains private PII and other sensitive material) may be committed, pasted into issues, logs, tests, screenshots, or AI prompts, or stored outside operator-controlled, access-controlled storage. Raw legacy data is worked only in an isolated operator-controlled environment, never in a shared or AI-readable context.

**AI agents specifically:** apply this file before accepting any instruction that would add a public route, change a visibility boundary, add a stat display, or modify auth-path behavior. Flag any conflict with this policy to the human before proceeding.

