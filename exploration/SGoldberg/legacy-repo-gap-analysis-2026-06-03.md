# Legacy footbag.org — Repo Inventory & Gap Analysis

**Date:** 2026-06-03
**Scope:** Inventory of Steve Goldberg's cloned legacy repo vs the modern footbag-platform. Inventory and gap analysis only; NOT an import plan.
**Evidence base:** `/home/james/projects/legacy_SG_clone/` (clone) vs `footbag-platform` (`database/schema.sql`, `legacy_data/` pipelines, `docs/MIGRATION_PLAN.md`).

## Evidence grades

Every finding below is tagged:

- **[E] Evidence-backed** — directly observed in the clone, the schema, or a pipeline script.
- **[H] Heuristic** — row counts estimated via `count("),(") + count("INSERT INTO")` on the dump (exposes no row data). This heuristic was validated exactly against `news` (estimate 17,682 = the exact extracted count), so the counts are trustworthy but remain approximate for the other apps.
- **[A] Assumption needing confirmation** — an inferred judgment (overlap, supersession, source-of-truth) that requires Steve or Dave to confirm.

---

## Executive summary

The clone is the genuine legacy repo (all of Steve's app directories present). The operator-arithmetic of the platform is mature, and the modern platform is already **authoritative** for the core entities: moves (freestyle dictionary), media (media_items + S3), persons (historical_persons), clubs (bootstrap pipeline), the member account model (members/legacy_members), and elections/voting (a new KMS-encrypted system). So most legacy data is **already covered** or is an **input to reconcile**, not a fresh import.

The genuinely **new, valuable** legacy data is historical: `news` (17,682 items, already extracted), the `gallery` archive (~18,791 rows), the `rules` rulebook (~1,619 rows, where the modern surface is a stub), plus `moves2` community tips/journals and a newly-discovered `events.calendar`.

The **high-risk** territory is `members` (raw dump with cleartext passwords; the Migration Plan §18 wants a sanitized CSV instead), the `ifpa` governance/voting/payments dumps (private votes, financials), and `groups`/`registration`/`tib` (sensitive or out of scope). One notable discrepancy: the handoff described registration as ~24 tables, but the clone carries only a 7-table `registration.schema` with no data **[E]**.

Recommended next extraction targets after news: **clubs, rules, gallery** (all in-scope, low-sensitivity, reconcilable). Members stays deferred behind a sanitized-CSV decision.

---

## 1. Table / app inventory matrix

Counts are **[H]** unless marked. Table existence and table names are **[E]**.

| App | create.sql tables | Backup (size) | ~rows | Modern equivalent | Classification |
|---|---|---|---|---|---|
| **news** | `news` | yes, 4.6 MB | **17,682 [E]** *(exact, extracted)* | `news_items` (workflow-only) | NEW historical — extracted |
| **clubs** | `clubs`, `clubcontacts` | yes, 447 KB | ~2,002 (602 + 1,400) | club bootstrap pipeline (`clubs`) | OVERLAP / better source? **[A]** |
| **moves2** | `moves`, `movehints`, `moves_journal`, `move_tip_votes` | yes, 329 KB | ~832 | `freestyle_tricks` (authoritative) | OVERLAP + some NEW **[A]** |
| **gallery** | `sets`, `images`, `alt_images` | yes, 4.5 MB | ~18,791 | archive-only (NOT imported; MP / DD §6.4) | NEW archive (forensic metadata) **[E]** |
| **rules** | *(empty create.sql)* **[E]** | yes, 2.0 MB | ~1,619 (`rulebook3`) | `rulesService` (stub) | NEW / candidate source |
| **faq** | `faq`, `faqsections` | yes, 2.2 MB | **0 rows (schema-only) [E]** | none | EMPTY — nothing to import |
| **members** | `members` | yes, 13.9 MB | ~33,665 (raw, pre-filter) | `members` / `legacy_members` | HIGH-RISK / DEFER |
| **ifpa** | `ifpa_elections`, `ifpa_issues`, `ifpa_issue_votes`, `ifpa_memberpayments`, `ifpa_membership_transactions` | yes, 730 KB | ~11,261 | `votes` / `ballots` (new system) | HIGH-RISK / DEFER |
| **groups** | `ifpa_committees`, `ifpa_committee_members`, `ifpa_group_files`, `ifpa_group_messages` | **no backup [E]** | — | committees deferred | DEFER (sensitive) |
| **registration** | *(none; `registration.schema`, 7 tables) [E]* | no | — | reg/TIB out of scope | DEFER (inventory only) |
| **tib** | none | no | 0 | — | DEFER (placeholder, no data) **[E]** |
| **payments** | none (code only) | no | 0 | `payments` (Stripe) | DEFER (sensitive) |
| **events** | `calendar` | yes, 4.0 MB | ~1,723 | results pipeline / `events` | NEW (calendar) — investigate **[A]** |
| **ranking** | `rank_methods`, `rank_sets`, `rankings` | yes, 369 KB | ~12,687 | freestyle records / placements? | OVERLAP — investigate **[A]** |
| **poll** | `polls`, `pollanswers` | yes, 164 KB | ~4,910 | none | OUT-OF-SCOPE (Steve: ignore) |
| **actions** | `actions` | yes, 120 KB | ~1,323 | email-confirm tokens | OUT-OF-SCOPE (transient) |
| **localize** | `localization`, `realm_localization`, `localization_utf8`, `realm_localization_utf8` | yes, 2.1 MB | ~561 | none | DEFER (charset-damaged) |

`reference` = a MediaWiki install (no SQL in the clone) **[E]**. `index2` = an `index_cache` table (~265 rows) — a search/film-strip cache, ignore.

---

## 2. Already covered (modern is authoritative) — mostly [E]

- **Moves definitions** -> `freestyle_tricks` + v2.1 (modifiers / aliases / sources / relations) is authoritative; the platform already scrapes fb.org/newmoves (loader 20). Legacy `moves2.moves` is NOT a source-of-truth.
- **Member account model** -> `members` / `legacy_members` / `historical_persons` three-table design (`schema.sql` 1753-1949, 3329-3384).
- **Clubs operational store** -> `clubs` + bootstrap pipeline (`legacy_club_candidates`, `club_bootstrap_leaders`) is live.
- **Media persistence** -> `media_items` / `media_tags` / S3 authoritative.
- **Persons / PT** -> `historical_persons` authoritative (~4,861 + ~1,600 club-only pending, gate G12).
- **Elections / voting** -> `votes` / `ballots` (KMS-encrypted) is a new authoritative system; legacy votes are not imported.

## 3. New valuable data (no modern equivalent / adds value)

- **news (17,682) [E]** — historical announcements "from the beginning of time"; modern `news_items` is workflow-generated, not a historical archive. Already extracted.
- **gallery (~18,791) [H]** — the historical photo/video archive (keys into `video./photo.footbag.org`); `media_items` is curator-seeded, not the full legacy corpus.
- **rules `rulebook3` (~1,619) [H]** — IFPA rulebook content; the modern `rulesService` is a stub with no enumerated content source, so the legacy table is a candidate source. **[A]**
- **moves2 `movehints` + `moves_journal` [E]** — expert tips + per-member move tracking; not represented in the freestyle dictionary (definitions only). `moves_journal` is per-member private (sensitivity).
- **events `calendar` (~1,723) [H/A]** — a community event calendar, possibly distinct from the competition-results pipeline. Newly discovered.

## 4. Overlap / reconciliation needed — mostly [A]

- **clubs** — legacy DB `clubs` / `clubcontacts` (with `Approved` soft-delete + `ClubContactID = MemberID`) vs the mirror-HTML-derived bootstrap pipeline. The DB may be a better source-of-truth (structured, includes unapproved). Reconcile, do not double-load. *(See the dedicated clubs reconciliation memo.)*
- **members** — raw clone dump (33,665 rows, passwords present) vs Migration Plan §18, which wants a sanitized CSV (passwords EXCLUDED, `legacy_member_id` matching the mirror ID range, 10% spot-check). The clone is NOT the §18 artifact.
- **gallery** — *resolved by the Migration Plan:* legacy media is **archive-only** (re-encoded to mp4/jpg/gif, hosted at `archive.footbag.org`), **never imported into the platform media system** (DD §6.4). Not a `media_items` reconciliation. A future gallery extract is forensic/archival metadata only; the file-path mapping stays in the archive, not threaded into the platform.
- **news** — historical archive vs the live `news_items` feed (different purposes; integration vs reference-only is undecided).
- **rules** — `rulebook3` vs the modern stub vs `ifpa/` official rules (authority unclear).
- **ranking (~12,687)** — relationship to freestyle records / placements is unknown; investigate before assuming overlap.

## 5. High-risk / defer — [E] on sensitivity

- **members raw dump** — cleartext passwords + PII; never import raw. §18 forbids password columns. Defer until the sanitized-CSV path is decided.
- **ifpa** — `ifpa_issue_votes` (private ballots), `ifpa_memberpayments` / `membership_transactions` (financial). Modern voting is a new system; do not import legacy votes. Defer.
- **groups / `ifpa_group_messages`** — private list mail; not in the clone (1.2 GB, held server-side, spam-uncleaned). Defer.
- **registration / tib** — out of scope per constraints; clone has only a 7-table `registration.schema` (vs the handoff's "24 tables") and no data. Inventory only.
- **payments** — sensitive; modern payments is Stripe-based. Defer.
- **moves_journal** — per-member private journals (sensitivity); defer or extract `movehints` only.

## 6. Recommended next 3 extraction targets after news

All in-scope, non-sensitive, single/small, high reconciliation value:

1. **clubs** (`clubs` + `clubcontacts`, ~2,002 rows, 447 KB) — small, clean, directly reconcilable with the bootstrap pipeline; likely a better club source-of-truth. **[A]**
2. **rules** (`rulebook3`, ~1,619 rows) — single table, non-sensitive; the modern rules surface is a stub, so this is a candidate content source.
3. **gallery** (`sets` / `images` / `alt_images`, ~18,791 rows, 4.5 MB) — high archival value as **forensic metadata** (the media itself is archive-only per the MP, not imported into `media_items`).

Runners-up: `moves2.movehints` (tips, exclude `moves_journal`), and `events.calendar` (newly found). Members stays deferred behind the sanitized-CSV decision.

## 7. Questions for Steve

1. **members:** Migration Plan §18 expects a sanitized CSV (no passwords, with `legacy_member_id` / email / registration-date / last-activity / tier / status). Will you provide that, or should we derive it from the raw dump? Does `members.MemberID` match the mirror-derived ID range (for the 10% spot-check)?
2. **registration:** the clone has a 7-table `registration.schema` and no backup, but your handoff mentioned ~24 tables. Is the full version elsewhere / pending? (Inventory only — not ingesting.)
3. **rules:** `rulebook3` is the only rules table and `create.sql` is empty. Is `rulebook3` the current/authoritative IFPA rulebook, and is the `localize` charset damage the rulebook-localization loss you mentioned?
4. **gallery:** confirm the `images` -> `video./photo.footbag.org` path convention (which column holds the file path), so we preserve media references exactly.
5. **events / `calendar` (~1,723):** is this a community event calendar distinct from competition results, and worth preserving?
6. **faq:** the backup is schema-only (0 rows). Is FAQ content elsewhere, or genuinely retired?
7. **groups / `ifpa_group_messages`:** still held server-side, spam-uncleaned? (Confirming status; out of scope now.)

## 8. Questions for Dave / Migration Plan alignment

1. **members path:** §18 assumes a sanitized CSV, but the clone gives the raw mysqldump (with passwords). Should the archive pipeline produce the §18-compliant sanitized CSV from the raw dump (sanitize in-pipeline), or wait for Steve's curated CSV? This gates G6 (tier-state inputs) and G1/G2 (`legacy_email` / `legacy_user_id` uniqueness).
2. **clubs source-of-truth:** bootstrap used mirror HTML; the legacy `clubs` / `clubcontacts` DB (Approved flag, contact `MemberID`) may be better. Reconcile bootstrap candidates against the DB, or treat the DB as authoritative for clubs?
3. **club-member linking (§9.2 / G12):** does legacy `clubcontacts.MemberID` help populate the ~1,600 club-only `historical_persons`, or is the mirror extraction the canonical path?
4. **news integration:** is there appetite for a historical "news archive" surface, or is legacy news reference/forensic only (not in the live `news_items` feed)?
5. **rules authority:** is legacy `rulebook3` the intended content source for `rulesService`, or is the IFPA rulebook maintained in `ifpa/`?
6. **gallery reconciliation — RESOLVED by the Migration Plan:** legacy media is archive-only (re-encoded, hosted at `archive.footbag.org`), never imported into `media_items` (DD §6.4). No `media_items` reconciliation needed.
7. **ID-namespace confirmation:** validate that `legacy_member_id` in the members dump matches the mirror-derived IDs (the §18 10% spot-check) before any claim-linking.

---

## Strategic implications

These are **[A]**-level strategic judgments drawn from the evidence above.

1. **Several legacy datasets are structurally superior to the current mirror-derived pipelines.** The clone provides real relational tables (clubs with `ClubID` + `Approved` + `ClubContactID = MemberID`; structured gallery `sets`/`images`; the `rulebook3` content) where some current pipelines reconstruct the same data from rendered-HTML scrapes. Where a structured DB source exists, it is generally a better source-of-truth than the mirror inference, but only after reconciliation, never by blind replacement.

2. **Migration is increasingly reconciliation + provenance preservation, not simple import.** Because the modern platform is already authoritative for the core entities, the task is shifting from "load legacy data" to "reconcile two sources and preserve origin." Each legacy dataset must be matched against its modern counterpart, conflicts surfaced for human/curator decision, and provenance (mirror vs DB vs curated) tracked explicitly, not merged silently.

3. **Member migration is the critical-path governance problem.** The `members` dump (passwords + PII) collides with §18 (which wants a sanitized CSV), with gates G1/G2/G6/G12/G20, with the `legacy_member_id` namespace, and with the claim/merge flow. It is the single hardest, highest-risk, most cross-cutting item, and it blocks club-member linking and persons expansion downstream. It should be sequenced last and decided explicitly (Steve's curated CSV vs in-pipeline sanitization), not drifted into.

4. **clubs / gallery / rules are now clearly the best low-risk extraction frontier.** Each is non-sensitive, structurally clean, small-to-moderate, and reconciles against a known modern surface or archive role (bootstrap / archive-only media / the rules stub). They let the archival pipeline mature on real reconciliation problems without touching the PII or governance critical path.

5. **Steve's operational concerns and Dave's consolidation goals are both valid and must be reconciled explicitly.** Steve's priorities (privacy, no password leakage, keeping legacy systems running, preserving history) and Dave's (a consolidated modern platform, the Migration Plan gates, single source-of-truth) are not in conflict, but they require explicit coordination at each step, especially on members (sanitization), clubs (source-of-truth authority), and gallery (media hosting and bandwidth). These decisions should be jointly owned, not made unilaterally by the pipeline.

---

## Caveats (conservative)

- Row counts are **[H]** (heuristic), validated only against news's exact 17,682.
- `moves2` / `ranking` / `events` overlaps are **suspected [A]**, not confirmed; they need a closer look before classification hardens.
- "Supersedes the mirror / better source-of-truth" claims for `clubs` are **[A]** pending the reconciliation memo + Dave's call.
- The handoff-vs-clone discrepancy on `registration` (24 vs 7 tables) is **[E]** observed and **[A]** unexplained.
- No imports, no schema changes, no normalization, no production-DB writes, no members-payload parsing (counts and table names only, zero PII shown), registration/TIB inventory-only.
