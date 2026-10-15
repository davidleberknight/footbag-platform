# Footbag Website Modernization Project -- Data Governance

**Authority:** The single internal statement of how the platform complies with GDPR, and canonical policy for member-data visibility, public historical records, search and anti-enumeration, exports, logging hygiene, and derived statistics. Rationale lives in `docs/DESIGN_DECISIONS.md`; behaviour lives in `docs/USER_STORIES.md`; the two must not contradict this file. The member-facing summary is the public Privacy page.

**Scope:** All contributors, maintainers, and AI agents working on this codebase.

---

## 1. Core principles

1. **Privacy is security.** Member-data handling, discoverability, logging, exports, and visibility are part of the security architecture, not a compliance afterthought.
2. **Public historical records are legitimate and required.** Official event results, year archives, Hall of Fame and Big Add Posse honors, and world records are public. Suppressing them is not a privacy win.
3. **Historical discoverability is not current-member discovery.** Appearing in historical results does not make a person publicly searchable or contactable, and linking a historical person to a member account does not turn the historical identity into a public member profile.
4. **Visibility is explicit and minimal.** Every field has a classified audience, scoped to the minimum the use case needs; no contact field is public.
5. **Derived stats are governed outputs.** Incomplete datasets require caveats or suppression. Official records outrank aggregates.

---

## 2. GDPR compliance

IFPA applies GDPR and UK GDPR to every member regardless of location.

- **Lawful basis.** Account, membership, event and payment data are processed to perform the membership agreement; financial records are kept to meet legal obligations; official competition results are published in IFPA's legitimate interest in the sport's historical record; optional profile visibility and announcement mail rest on the member's own opt-in.
- **Purposes.** Running memberships, events, payments, clubs and member communications, and preserving the sport's official record. Data is not used for advertising, analytics or profiling, and member addresses are never shared or sold.
- **Processors.** Amazon Web Services hosts the platform, its storage and backups, and sends its email; Stripe processes payments, and card details never reach the platform; Cloudflare runs the human-verification check on sign-in and registration pages. Production member data stays in AWS and is never copied to a workstation.
- **Access and portability.** A member downloads all their personal data from their own account tools (`M_Download_Data`); that self-export is the answer to an access request.
- **Rectification.** A member corrects their own profile; a field they cannot change themselves (a display name, a profile URL, a membership tier) is corrected by an administrator on request, with a reason and an audit row.
- **Erasure.** A member deletes their account from their own tools; after the grace period their personal data is purged and the historical record survives without them (see Legacy archive and imported historical identities). Erasure that fails on any persistent surface is a launch-blocker.
- **Retention.** Each kind of data has a recorded retention period, set in the design decisions' retention policy.
- **Breach.** A suspected exposure of member personal data is reported at once to the IFPA Secretary, the CTO and the Board, who decide on notification. Affected members, and where the law requires it the relevant regulator, are notified within the legal deadline (for EU and UK members, the regulator within 72 hours of IFPA becoming aware).
- **Contact.** Requests the account tools do not handle go to `admin@footbag.org`.

---

## 3. Member-data visibility taxonomy

| Sensitivity | Label | Examples | Auth required |
|-------------|-------|----------|---------------|
| 1 | Public official historical record | Event results, year archives, HoF/BAP, world records, minimal historical-person pages | None |
| 2 | Authenticated current-member lookup | Member search, member profiles | Yes: logged-in member |
| 3 | Role-scoped operational surfaces | Organizer participant management, club-leader rosters, workflow exports | Yes: role check |
| 4 | Internal/admin only | Full member history, audit workflows, broad exports, identity resolution | Yes: admin |
| 5 | Archived member-only legacy | Old footbag.org archive | Yes: logged-in member |

Anything not in this taxonomy defaults to Sensitivity 4 until explicitly classified.

- **Birth date** is the most sensitive member field: owner and admin only, never on any public, search or cross-member surface. **Gender** is owner and admin by default; the member may opt in to show it to signed-in members.
- **Contact fields** (login email, phone, WhatsApp) are hidden by default; a member opts in per field, and an opted-in field is shown to signed-in members only. Holding a club co-leader or event organizer role shows that member's email to signed-in members.
- **Payment records** are admin only; a member sees their own payment history. Donation comments are admin-only and never published, except that the IFPA Treasurer's reconciliation summary carries each period's commented donations so a donor's stated purpose can be honored (`M_Donate`).

---

## 4. Public historical record policy

Approved public historical records: official event results, year archives, Hall of Fame, Big Add Posse, official world-record tables, and minimal historical-person pages (name, country, official honors, result and event links, world-record inclusion; no contact fields; not a member profile). Hall of Fame and Big Add Posse honors outlive a member's personal data: purge and the deceased flow preserve them.

---

## 5. Derived statistics, data completeness, and caveats

A public or member-visible derived stat is justified only when it is genuinely useful to the community's record and either its source data is complete enough for the claim or the page states the scope and the gap. Otherwise prefer raw official results, honors and record listings. Test: "Would a footbag historian cite this stat without needing a methodological footnote?" If not, caveat clearly or suppress.

---

## 6. Search, discoverability, and anti-enumeration

Current-member search is authenticated only, deliberately narrowing (prefix-oriented with a minimum length), capped for broad queries, rate-limited, never a browse-all directory, and never public. The `searchable` flag means eligible for that authenticated lookup only. A pending registration has no member authorization, no profile, and no search presence, and is indistinguishable from an unknown account. Historical-person pages are record pages reached by link, not search surfaces. No public route allows enumeration of current members.

---

## 7. Rosters and exports

Club rosters and event participant lists beyond official results are member-only or role-scoped. The Official IFPA Roster is on-screen only to Tier 2 and above, never exported or bulk-downloaded. Bulk member exports are role-scoped (Sensitivity 3 or 4); a member's own export is self-service.

---

## 8. Logging and observability hygiene

- Logs never contain raw email addresses, tokens, passwords, or other sensitive personal data.
- The same applies to infrastructure secrets: the session secret, AWS keys, raw session cookie values, raw account tokens (only their hashes are stored), and signing-key material. KMS key ARNs are not secrets but are not logged at request scope.
- Member-search queries may be logged for abuse monitoring only once pseudonymized.

---

## 9. Legacy archive and imported historical identities

- **Legacy archive.** The mirror of the old site is member-only, because its pages carry old member contact details.
- **Imported historical persons** are placeholders for result attribution, not member accounts: they are not searchable, do not populate member profiles, and their imported aggregate fields are not public statistics without approval and caveats.
- **Erasure and the record.** Erasing an account clears its personal data and severs its link to the historical record, which stays public with its attribution name and honors.
- **Raw legacy dumps** are never committed to the public repository or pasted into issues, logs, tests or screenshots; password material is never imported, stored, logged or used. Raw legacy data and its extracts live in the maintainers' private repository and on maintainer machines. The public repository never holds member personal data.
- **Sealed legacy email archive.** The legacy group-message corpus is sealed and held privately under IFPA custody, never imported or exposed; privately cast votes are never publishable.
- **Legacy consent flags** (mailing opt-ins and per-field publish flags) are never imported as active consent; members set their preferences fresh after claiming.
- **IFPA authority.** The disposition, release, redaction or destruction of IFPA-owned legacy records is the IFPA secretary's decision, never a maintainer's.

---

## 10. Contributor and AI-agent rules

Any work touching members, historical persons, search, rosters, contact fields, exports, stats, or auth boundaries loads this file first and classifies every surfaced field against the taxonomy.

- No public route serves member search, member profiles or contact fields. Hall of Fame and Big Add Posse honorees are the one exception, publishing the honor record only (`M_View_Profile`).
- No environment variable changes what anonymous or authenticated users are served, and no auth check is bypassed except by a stub that mirrors the real path.
- No public page implies a historical-person page is a member account.
- No derived stat is published without sufficient coverage or an explicit caveat.

AI agents apply this file before adding a public route, changing a visibility boundary, adding a stat display, or modifying auth behavior, and flag any conflict to the human before proceeding.
