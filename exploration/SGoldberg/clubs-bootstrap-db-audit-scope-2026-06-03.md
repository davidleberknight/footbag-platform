# Clubs bootstrap — DB-as-source audit & scoping memo

**Date:** 2026-06-03
**Type:** scoping + audit memo. No implementation. No imports, no production writes, no schema changes, no code changes, no member-data parsing.
**Framing (corrected):** the existing club bootstrap pipeline already systematically excludes stale clubs. The question is **whether the structured DB source improves or validates the existing classifications**, not whether stale-filtering needs reinventing. Use the DB to **audit and strengthen** the pipeline, not replace it.

**Inputs (read-only):** DB extract `parsed/clubs/clubs.ndjson` (602) + `clubcontacts.ndjson` (1,400); existing `legacy_club_candidates.csv` (311), `club_bootstrap_leaders.csv` (177), `legacy_person_club_affiliations.csv` (2,400); reconciliation audit (`clubs-reconciliation-audit-2026-06-03.md`).

---

## Key correction to the original framing

The reconciliation showed `mirror_only = 0` and `db_only = 290`. The 290 DB-only clubs were **never inputs to the bootstrap** (the bootstrap classified the mirror's 312, not these). So the pipeline did not "rule them out"; it never saw them. Two distinct audit questions follow:

- **(A) On the 312 the pipeline did see:** does the DB *confirm* the existing classifications, or surface false positives?
- **(B) On the 290 it never saw:** are any genuine *false negatives* (real active clubs the mirror missed)?

The evidence answers both: **(A) the DB confirms, (B) effectively no false negatives.**

---

## 1. Current pipeline summary

- **Source:** `extract_clubs.py` scrapes the mirror HTML -> `seed/clubs.csv` (312 clubs; only the actively-listed approved subset). Contacts are *inferred* from `members/profile/{id}` links.
- **Classification:** `02_build_legacy_club_candidates.py` (§9.1 R1-R10) -> 311 candidates with `confidence_score` and `bootstrap_eligible`. **139 eligible** (`pre_populate`), 172 excluded (dormant/junk/onboarding). The decisive signals are member-linkability (`member_rows`, `unique_member_names`, `linkable_member_count`), not raw club metadata.
- **Promotion:** `04_build_club_bootstrap_leaders.py` -> **177** leaders (`confidence >= 0.70` + eligible); `legacy_person_club_affiliations` (2,400). Cutover at Phase H; claim flow + wizard handle the rest.
- **Net:** the pipeline already reduces 312 -> 139 eligible -> 177 leaders, using member-linkability as the strength signal. Stale-filtering is intrinsic to this.

## 2. Proposed DB-sourced pipeline summary

The DB is layered in as a **provenance + contact authority underneath the existing classifier**, not a re-derivation that re-invents filtering:

- Replace `seed/clubs.csv` as the **roster + identity + status source** with the sealed DB extract (canonical `ClubID`, `Approved`, structured fields).
- Keep the existing **classifier and confidence model unchanged** (§9.1 R1-R10). It runs on the DB-sourced roster; the 290 DB-only clubs become *additional candidates* it now evaluates (most will classify as dormant/junk on the same member-linkability rules).
- Replace **inferred contacts** with `clubcontacts` (authoritative, 98.5% coverage), gated on the §18 member namespace before any persons/member wiring.
- Carry `Approved` as a **hard publish-gate** and `ClubID` as the canonical provenance key on every candidate.

The classifier is the authority on *eligibility*; the DB is the authority on *identity, status, and contacts*.

## 3. Activity-gating rules (honest version)

The DB's club-level activity fields are **weak and must not be the primary gate**:

- `ContactValid` on the `clubs` table is **0 for all 602 clubs** (inert). *(The per-contact `ContactValid` in `clubcontacts` is unassessed here and may carry signal — flag for the full audit.)*
- `LastValidated` is **sparse and mostly old**: only 28 of the matched 312 and 1 of the 290 DB-only are `>= 2015`; 158 of 290 were never validated.

Therefore:
- **Primary gate stays the existing member-linkability classification + confidence** (it is stronger than any DB activity field).
- **`Approved=1` is a hard prerequisite** (publish-state), not a promotion signal on its own.
- **`LastValidated` is a tiebreaker / corroboration signal only**, never a sole gate.
- A DB-only club is promotable only if it *both* clears the existing classifier *and* is `Approved=1` *and* shows corroborating activity. By the data, that set is ~empty.

## 4. Classification mapping (the audit)

| Cohort | Count | Existing decision | DB cross-check | Verdict |
|---|---|---|---|---|
| **Overlap (312)** | 312 | 139 eligible / 172 excluded | Approved aligns; contacts agree **312/312**; activity weak (28 `LastValidated>=2015`, ContactValid inert) | DB **confirms**; no activity-driven false positives; contacts corroborate the leader inferences |
| **DB-only approved stale** | 285 | never seen by pipeline | 0 `ContactValid`, 1 `LastValidated>=2015`, 0 active-looking | Correctly excludable; **~0 false negatives**; would classify dormant/junk on the same rules |
| **DB-only unapproved** | 5 | never seen | `Approved=0` | Archival; correctly excluded by the publish-gate |
| **Duplicate clusters** | 13 (DB name-clusters >1 ClubID) | mirror saw 4 | `ClubID` disambiguates at the key level | Dedup review; not a classification change |

- **False negatives (real clubs missed by mirror/bootstrap):** essentially **none** (1 borderline by `LastValidated`, 0 active-looking). The mirror's omission of the 290 was effectively correct.
- **False positives (pre-populated clubs the DB weakens):** **none surfaced by DB activity** (the fields are too weak to weaken anything); instead `clubcontacts` *strengthens* confidence in the promoted set (100% contact agreement on the overlap).
- **Do DB fields strengthen the rules?** `Approved` yes (clean publish-gate), `clubcontacts` yes (authoritative contacts replacing inference + the §9.2 affiliation graph), `ClubID` yes (stable provenance + dedup key). `LastValidated` weak; `ContactValid` (clubs) inert.

## 5. Required code / data changes (if pursued)

Minimal, and audit-first:
- **Audit (no pipeline change):** a read-only cross-check joining DB clubs/clubcontacts to `legacy_club_candidates` by `ClubID`, emitting a per-club confirm/false-neg/false-pos report. (The reconciliation script is the seed for this.)
- **Re-source (optional, Dave-gated):** point `extract_clubs.py`'s output, or a new sibling producer, at the sealed DB extract instead of mirror HTML, preserving the `legacy_club_key = ClubID` contract so the classifier is unchanged.
- **Contacts:** add `clubcontacts` as the authoritative contact input to `03_build_legacy_person_club_affiliations.py`, gated behind the §18 namespace check.
- **No schema changes.** `legacy_club_candidates` / `club_bootstrap_leaders` shapes are unchanged; only the input source and the contact provenance change.

## 6. Risks

- **Re-classifying 602 vs 312** adds 290 candidates to the classifier run (mostly dormant/junk; low risk but real curation surface).
- **`clubcontacts` wiring couples to the members critical path** (§18 `legacy_member_id` namespace must validate first).
- **Over-trusting `Approved`** would resurrect the 290 stale clubs; the publish-gate must be paired with the existing classifier, never used alone.
- **Provenance churn:** swapping the source for an already-run Phase H pipeline means reconciling against what was already promoted (177 leaders) — a diff, not a reload.
- **`reset-local-db.sh` is David-owned** with a known leader-loader gap; coordination required for any input-source change.

## 7. Open decisions for Dave

1. **Source-of-truth ratification:** adopt the DB as the roster/identity/status/contact authority (classifier unchanged), or keep the mirror and use the DB as an *audit overlay* only?
2. **Contacts:** wire `clubcontacts` into the affiliation/leader producers (better signal, §18-gated), or defer until members is reconciled?
3. **The 290 DB-only:** confirm they default to archival/revalidation-candidate (not promoted), pending classifier evaluation?
4. **Re-run vs overlay:** re-source and re-run the classifier on 602, or run the DB purely as a confirmation/audit pass over the existing Phase H output?
5. **Dedup:** who adjudicates the 13 within-DB name-clusters?

## 8. Questions for Steve

1. **Active-listing logic:** what made exactly those ~312 clubs appear on the live site (vs the 290 approved-but-unlisted)? Is there a "currently displayed" flag beyond `Approved` (the DB shows `Approved=1` for 597, but only 312 were listed)?
2. **`ContactValid`:** the `clubs.ContactValid` column is 0 for every club. Is the live contact-validity carried on `clubcontacts` per-contact instead, and is it meaningful?
3. **`LastValidated`:** how is it set (manual revalidation vs automated)? Many approved clubs have `LastValidated=0` — does 0 mean "never revalidated" or "pre-dates the field"?
4. **clubcontacts multiplicity:** a club can have multiple contacts (`ContactPriority`). Is the lowest-priority/first row the canonical leader, or is there another rule?

---

## Conclusion (deliberately open)

The evidence leans to: **the existing pipeline is already correct on the cohort it evaluated, and the DB's primary value is stronger provenance (canonical `ClubID`, `Approved`) and authoritative contacts (`clubcontacts`), not a better activity filter.** The DB *confirms* the classifications, surfaces ~no false negatives, and *strengthens* (does not weaken) the promoted set. The DB likely improves **edge cases** (the one rename, the publish-gate on unapproved clubs, the 13 dedup clusters, contact authority) **without changing the core classification model.** Whether to re-source vs run the DB as an audit overlay is Dave's call; either way the classifier stays as-is.
