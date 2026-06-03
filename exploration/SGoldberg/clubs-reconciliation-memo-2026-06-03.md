# Clubs reconciliation memo — bootstrap pipeline vs legacy clubs/clubcontacts DB

**Date:** 2026-06-03
**Purpose:** Pre-extraction analysis for the `clubs` target. Decide how the legacy clubs DB relates to the existing club bootstrap pipeline BEFORE any extraction. No extraction, no import, no production writes, no staging.
**Status:** analysis only. The recommendation is a *provenance/reconciliation* model, not a load plan.

Evidence grades as in the gap analysis: **[E]** observed, **[A]** assumption needing confirmation.

---

## The two sources

### A. Current club bootstrap pipeline (source = mirror HTML) [E]
- `scripts/extract_clubs.py` parses the **rendered mirror HTML** into `seed/clubs.csv`, with `contact_member_id` (inferred from `members/profile/{id}` links) and `contact_email`.
- `clubs/scripts/02_build_legacy_club_candidates.py` classifies via MIGRATION_PLAN §9.1 R1-R10 into `category ∈ {pre_populate, onboarding_visible, dormant, junk}`, with a `confidence_score` and `bootstrap_eligible=1` iff `category='pre_populate'`.
- `clubs/scripts/04_build_club_bootstrap_leaders.py` emits `club_bootstrap_leaders` (filtered `confidence_score >= 0.70` + eligible).
- Loaded at go-live (Phase G enrichment, Phase H cutover `06_*` + `07_*`). DB tables: `clubs`, `legacy_club_candidates`, `legacy_person_club_affiliations`, `club_bootstrap_leaders`.
- Current state (memory): Phase H, ~59 mapped / 80 leaders; the bootstrap has already RUN.

**Key property:** the mirror only renders **approved** clubs, and the contact member id is **inferred** from profile links, not authoritative.

### B. Legacy clubs/clubcontacts DB (source = the actual database) [E]
- `clubs` table: `ClubID` (PK), `Approved` (bool soft-delete), name/location/etc. ~602 rows **[H]**.
- `clubcontacts` table: `ClubContactID` (= a `MemberID`) and `ContactClubID` (= a `ClubID`), left-joined to attach contacts to clubs. ~1,400 rows **[H]**.

**Key property:** the DB is structured and a **superset** of the mirror (it retains `Approved=false` clubs the site never shows), and `clubcontacts.ClubContactID` is the **authoritative** contact member id, not an inference.

---

## Analysis

### Overlap risks
- **Double-population.** The bootstrap already loaded mirror-derived rows into `clubs`. A second load from the DB without reconciliation would duplicate clubs. **[E/A]**
- **Key drift.** The bootstrap's internal club identity (`mapped_club_id`) may not be the legacy `ClubID`. If the mirror scrape did not capture `ClubID` (e.g. from `/clubs/show/{ClubID}` URLs), matching DB rows to bootstrap candidates falls back to fuzzy name+location matching, which is error-prone. **[A — confirm whether seed/clubs.csv carries a legacy ClubID]**
- **Classification axis confusion.** The DB's `Approved` (publish-state) and the bootstrap's `category` (evidence-strength disposition) are **different axes**. An `Approved=true` club can be bootstrap-classified `dormant` or `junk`. They must not be conflated.

### Likely canonical IDs [A]
- **`clubs.ClubID`** is almost certainly the authoritative legacy club identifier. If the mirror captured it, it is the join key; if not, that is a reconciliation gap.
- **`clubcontacts.ClubContactID` (a `MemberID`)** is the authoritative legacy member id for club contacts. It ties directly to the members dump and the §18 `legacy_member_id` namespace, and therefore inherits the members critical-path risk.

### Approved semantics [E + A]
- `Approved=true` -> shown on the live site (the only clubs the mirror sees). `Approved=false` -> soft-deleted/hidden, data retained (Steve never hard-deletes).
- Reconciliation must treat `Approved` as a first-class, preserved provenance field, distinct from the modern `category`. **Danger:** importing `Approved=false` clubs would resurrect rejected/removed clubs into the live platform. The default must be: `Approved=false` clubs are archival/forensic only, never auto-promoted; promotion requires explicit admin/curator review.

### ClubContactID -> MemberID linkage [E + A]
- This is the highest-value piece. The bootstrap currently **infers** `contact_member_id` (R3/R4/R5 use it when present, else a substitute predicate). The DB has the **authoritative** contact `MemberID`, which could validate or replace those inferences and feed `legacy_person_club_affiliations` and the §9.2 club-only `historical_persons` expansion (gate G12) more accurately.
- **But** it cannot be wired until the `MemberID`/`legacy_member_id` namespace is confirmed to match the mirror-derived ids (§18 10% spot-check). Until then, treat `clubcontacts.MemberID` as a staged signal, not a live link. This couples clubs reconciliation to the members critical path.

### Does the DB supersede the mirror scrape? [A]
- **For data quality / coverage: likely yes.** The DB is structured, authoritative on contacts, and a superset (includes unapproved). The mirror is a lossy projection of it.
- **For the classification + cutover logic: no.** The bootstrap pipeline contributes evidence-strength classification, confidence scoring, the cutover, and the claim flow (§9.1, §9.2, gates G12/G23/G24). The DB is a **better input** to that logic, not a replacement for it.
- **Net:** the DB likely supersedes the mirror as the *data source*, while the bootstrap *pipeline* stays. The correct move is to re-source the inputs and reconcile, not to parallel-load. This is a **[A]** that Dave should ratify, because the bootstrap has already run and is gated.

### Migration / reconciliation dangers
- Duplicate clubs (DB load on top of mirror-loaded rows). **[E/A]**
- Legacy `ClubID` vs bootstrap `mapped_club_id` drift -> fuzzy matching. **[A]**
- `Approved=false` resurrection. **[E]**
- `MemberID` namespace mismatch (clubcontacts vs mirror ids vs §18). **[A]**
- Overwriting bootstrap classification/confidence with raw DB rows (losing evidence-strength work). **[E/A]**
- Disturbing already-gated state (G12 club-only persons; G23/G24 auto-link). **[A]**
- Operational: `reset-local-db.sh` is David-owned and has a known leader-loader gap; coordination required. **[E]**

### Proposed provenance model (recommendation, not a load plan)
1. **Extract clubs into the archive layer only** (raw seal -> parsed NDJSON -> forensic), exactly like news. Do NOT load into the live `clubs` table.
2. **Build a read-only reconciliation report**: match legacy `ClubID` to bootstrap candidates (on `ClubID` if available, else name+location with a confidence score). Bucket each club as: matched, DB-only (incl. unapproved + mirror-missed), bootstrap-only (mirror inference with no DB row), or conflicting.
3. **Preserve `Approved` as a provenance field** on every reconciled club, separate from the modern `category`. Default `Approved=false` -> archival only.
4. **Stage `clubcontacts.MemberID` as an authoritative-contact signal**, gated behind the `legacy_member_id` namespace validation (§18). Do not wire club -> member until that gate clears.
5. **Output feeds a human/curator decision**, not an automatic merge. The decision on "DB supersedes mirror" is Dave's (it touches the gated bootstrap pipeline and the members namespace).

---

## What this memo does NOT decide
- Whether to actually re-source clubs from the DB (Dave's call; gated pipeline + members namespace).
- Any wiring of `clubcontacts.MemberID` to members (blocked on §18 namespace confirmation).
- Any change to the bootstrap classification, the live `clubs` table, or the gates.

## Recommended next step
Extract clubs into the **archive/forensic layer** (seal + ingest -> NDJSON, like news), then produce the **reconciliation report** in (2) above. No live-table load, no member wiring, until Dave ratifies the source-of-truth question and the members `legacy_member_id` namespace is confirmed.
