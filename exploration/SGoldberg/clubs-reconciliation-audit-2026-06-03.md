# Clubs reconciliation AUDIT — legacy DB vs mirror-derived bootstrap

**Date:** 2026-06-03
**Type:** read-only audit. No imports, no production writes, no schema changes, no live reconciliation.
**Sources:**
- Legacy DB: `legacy_SG_clone/clubs/backups/latest.sql` (sealed sha256 `839885bf…06ca2`, dump date 2026-05-28) -> `parsed/clubs/clubs.ndjson` (602) + `clubcontacts.ndjson` (1,400). `clubs.Password` denylisted (dropped before extraction).
- Mirror: `legacy_data/seed/clubs.csv` (312 club records).
- Script: `legacy_data/legacy_archive/scripts/reconcile_clubs.py`. Per-club data: `clubs-reconciliation-data-2026-06-03.csv`.

Matching is **deterministic**: `clubs.ClubID == seed.legacy_club_key`, plus normalized-name clustering. Contact linkage is reported as aggregate counts only (no member-id values emitted).

---

## Headline

The legacy DB is a **strict superset** of the mirror and is the better source-of-truth for the club roster, identity, status, and contacts. But the 290 clubs the DB adds are **mostly stale/defunct** (approved long ago, many never validated), so "trust the DB" means *re-source from the DB and apply the DB's own activity signals*, not "load all 602."

One number first: the deterministic `ClubID` join matched **312 / 312** mirror clubs with **zero** mirror-only rows. The key is clean and canonical.

---

## 1. Overlap statistics

| | count |
|---|---|
| DB clubs | **602** |
| Mirror clubs | **312** |
| Overlap (matched on ClubID) | **312** |
| DB-only | **290** |
| Mirror-only | **0** |

The DB contains every mirror club plus 290 more. *(Note: `wc -l` on the mirror CSV reads 1,036 because club descriptions contain quoted newlines; the true record count via CSV parsing is 312.)*

## 2. Exact-match counts (on the 312 overlap)

| Field | matches | conflicts |
|---|---|---|
| ClubID (join key) | 312 / 312 | 0 |
| Name (normalized) | 311 / 312 | 1 |
| City (normalized) | 311 / 312 | 1 |
| Country (normalized) | 311 / 312 | 1 |

Agreement is ~99.7%. The single name/city/country divergence is one club (see §6).

## 3. Likely duplicate clusters

- **Within DB:** 13 normalized-name clusters span more than one `ClubID` (same club name, multiple IDs) — candidates for a dedup review (re-registrations vs genuinely distinct).
- **Within mirror:** 4 name-clusters; **0** duplicate `legacy_club_key` rows (no key re-listings in the captured set).

The existing `legacy_data/overrides/club_duplicates.csv` (1 entry) handles a known mirror re-listing; the DB's `ClubID` resolves that class of duplicate at the key level.

## 4. Clubs present only in mirror

**0.** Every mirror club resolves to a DB `ClubID`. The mirror adds nothing the DB lacks.

## 5. Clubs present only in DB

**290** (285 `Approved=1`, 5 `Approved=0`). Evidence that these are **stale**, not a broken scrape:
- `LastValidated` for DB-only tops out ~2016 vs the matched set's ~2026.
- **158 of 290** have `LastValidated = 0` (never validated).

So the mirror's 312 is the *actively-validated/listed* subset; the 290 DB-only are largely defunct approved clubs.

## 6. Conflicting fields

**1 club.** `ClubID 1773110747`: DB `Name = "Relayball Footbag Club"`, mirror `name = "St. Lawrence Footbag Club"` (city/country agree). This is a **rename**, and the DB carries the current name. So the lone "conflict" is the DB being *more current*, not a data error.

## 7. Candidate canonical IDs

**`clubs.ClubID` (varchar(40), numeric-string).** Unique in the DB, present in the mirror as `legacy_club_key`, and yields a 100% deterministic join. It is the canonical club identifier. `clubcontacts.ContactClubID` is the same key on the contact side; `clubcontacts.ContactMemberID` is the canonical member-side id.

## 8. clubcontacts -> MemberID linkage opportunities

- `clubcontacts`: **1,400** rows; **593 / 602** DB clubs (98.5%) carry at least one contact.
- For the 312 overlap, the mirror's `contact_member_id` is contained in the DB's `clubcontacts` set in **312 / 312** cases (100% agreement, 0 disagreements). The mirror's contacts are a subset of the DB's.
- The DB therefore supplies authoritative contacts for the **290 mirror-missed** clubs as well.

**Opportunity:** the bootstrap currently *infers* `contact_member_id` from mirror profile links; the DB provides it directly for ~98.5% of clubs. This is a materially better signal for `legacy_person_club_affiliations` and the §9.2 club-only persons expansion (gate G12). **Gated:** wiring `ContactMemberID` to persons/members requires the §18 `legacy_member_id` namespace validation first.

## 9. Approved-flag semantics

- DB: **597 Approved=1**, **5 Approved=0**.
- The mirror lists only a subset of approved clubs (its 312 are all approved); the 5 unapproved are DB-only (correctly absent from the mirror, which only shows approved).
- `Approved` is the legacy *publish-state*, distinct from the bootstrap's evidence-strength `category`, and distinct from *activity* (`LastValidated` / `ContactValid`). Promotion must gate on `Approved=1` **and** an activity signal, not `Approved` alone — otherwise the 290 stale clubs resurrect.

## 10. Recommendation

**DB authoritative for data; hybrid for promotion-gating.** Concretely:

- Treat the **DB as the source-of-truth** for the club roster, `ClubID`, `Approved`, structured fields, and contacts (`clubcontacts`). Re-source the bootstrap pipeline's inputs from the sealed DB extract, replacing the incomplete mirror `seed/clubs.csv`.
- **Retain the bootstrap pipeline as the classification layer** (§9.1 R1-R10, confidence scoring, cutover, claim flow). The DB is a better *input* to it, not a replacement for it. Re-classify the full 602 (the 290 new clubs need it).
- **Gate promotion on `Approved=1` AND activity** (`LastValidated` recency / `ContactValid`). Default the 290 stale DB-only clubs to **archival / revalidation-candidate**, not auto-promote. The 5 unapproved stay archival.
- **Keep the mirror's `contact_email`** as a supplementary signal (the DB links by `MemberID`; email lives in the deferred members table).
- **Gate `ContactMemberID` -> persons/members wiring** on the §18 namespace spot-check.
- **Dedup review** the 13 within-DB name-clusters before promotion.

This is not "mirror authoritative" (it is a stale-filtered subset that misses nothing but adds nothing) and not blind "DB authoritative" (its long tail is defunct). It is **DB-as-data-authority + pipeline-as-classification-authority + activity-gating**.

---

## "What would we gain by trusting the DB over the mirror?"

- **Authoritative, stable canonical `ClubID`** and a 100% deterministic join (no fuzzy matching).
- **Authoritative `Approved` and structured fields** (location, lat/lon, level, plays-net/freestyle, created/modified, URL) for all 602 clubs.
- **Authoritative contacts** (`clubcontacts`, 98.5% coverage) including the 290 clubs the mirror never saw — replacing the bootstrap's *inferred* contacts and strengthening the §9.2 affiliation graph.
- **More current data** (it captured the one rename; the mirror lagged).
- **Reproducible provenance** (a sealed, sha256-pinned dump) instead of an HTML scrape.
- **Principled activity filtering** via the DB's own `LastValidated` / `ContactValid`, which the mirror did implicitly and opaquely.

## "What would we lose?"

- **A built-in active-club filter.** The mirror's 312 *was* the curated active set. The DB's 602 includes ~290 stale/defunct approved clubs (158 never validated); without activity-gating we would resurrect them. Re-deriving "active" is now our responsibility.
- **`contact_email`.** The mirror scraped emails; the DB links by `MemberID` only (email lives in the deferred, sensitive members table). Until members is reconciled, the DB path loses the convenient email.
- **Re-classification work.** Re-sourcing means re-running §9.1 classification + confidence on the full 602, including 290 unvetted clubs.
- **Coupling to the members critical path.** The strongest DB win (authoritative contacts) is gated on the §18 `legacy_member_id` namespace validation.
- **A small dedup task** (13 within-DB name clusters).

---

## Provenance preserved
Both sources are retained: the DB extract is sealed (immutable raw + sha256) and parsed to NDJSON; the mirror `seed/clubs.csv` is unchanged; the per-club reconciliation CSV carries `in_db` / `in_mirror` / `db_approved` flags so every row's origin is explicit. No source was overwritten; nothing was loaded.
