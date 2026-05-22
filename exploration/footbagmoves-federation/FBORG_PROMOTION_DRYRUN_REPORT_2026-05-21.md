# FB.org → DB Promotion — Dry-Run Report — 2026-05-21

Dry-run for promoting `first_class_ready` rows from the master
spreadsheet (`SYMBOLIC_GRAMMAR_MASTER.csv`) into the live canonical
`freestyle_tricks` table. **No DB writes performed.** This report
exists so the loader is implemented only after the dry-run is reviewed.

**Recommendation up front: do NOT proceed to a bulk loader. The 82
proposed INSERTs need explicit curator selection first — see §4.**

---

## 1. Phase 1 — first_class correction (APPLIED)

The curator correction was applied to the master before the dry-run.
`first_class=true` now requires all three: `doctrine_status=settled`,
`curator_review_needed=false`, clean notation. Audit was
**downgrade-only** (a `first_class=false` flag may be a deliberate
curator call; rows are never auto-upgraded).

| Outcome | Count |
|---|---:|
| Passed all 3 → stay `first_class=true`, `publication_status=first_class_ready` | 184 |
| Failed → downgraded to `first_class=false`, `publication_status=observational` | 11 |
| `first_class=false`, doctrine settled + notation → `publication_status=candidate` | 8 |
| `first_class=false`, hedged/pending → `publication_status=observational` | 91 |

**11 downgrades** (all failed on `doctrine_status=hedged`): Terrage,
Big Apple, Blurrier, Blurriest, Blurry Drifter, Bullwhip, Mobius,
Paradox Blur, Blistering Whirl, Blurry Symposium Whirl, Blurry
Whirling Swirl.

## 2. Dry-run promotion counts

184 `first_class_ready` rows matched against the 167-row live
`freestyle_tricks` table (match: exact `slug`, then normalized
`canonical_name`/alias).

| Disposition | Count |
|---|---:|
| **UPDATE** — already in DB | **102** |
| **INSERT** — genuinely missing from DB | **82** |
| **BLOCKED** — integrity failure | **0** |

All 184 have a usable slug, display_name, and ADD value — 0 blocked.

Detail CSV: `FBORG_PROMOTION_DRYRUN_2026-05-21.csv` (184 rows, one per
`first_class_ready` trick, with action + DB-match + provenance).

## 3. The UPDATE set (102 rows) — low risk

These tricks already exist in the live dictionary. A promotion UPDATE
should be **gap-fill only** — populate empty DB fields (e.g.
`jobs_notation_raw`, `computed_add_formula`) from the master, and
**never overwrite** populated canonical content (descriptions,
UX-pilot prose, curator-set ADD). Most live rows already have these
fields from the parser-population pass, so the majority of these 102
UPDATEs would be **noops or near-noops**. This set is safe to promote
with a strictly additive gap-fill loader.

## 4. The INSERT set (82 rows) — STOP, needs curator selection

82 `first_class_ready` rows are absent from the live DB. Inserting all
82 would expand the canonical dictionary 167 → 249 — **a 49%
expansion, almost entirely FB.org-sourced** (74 of 82 are `fborg`/
`footbagmoves`/`passback` rows; tier spread 1–7 ADD, concentrated at
4-ADD with 36).

**Why this is not "clean" to bulk-load:**

1. **The live `freestyle_tricks` table is a deliberately curated
   subset, not a complete dictionary.** Proof: it contains
   `ducking-butterfly` / `ducking-clipper` / `ducking-osis` /
   `ducking-whirl` but **not** `ducking-mirage`; `spinning-butterfly` /
   `-clipper` / `-osis` / `-whirl` / `-torque` but **not**
   `spinning-pickup`. The curator has been selective about which
   compounds enter the public dictionary. 82 bulk INSERTs would
   override that curation.

2. **`first_class_ready` means publication-*ready*, not
   publication-*selected*.** The Phase 1 criteria (settled doctrine +
   notation + no review flag) certify a row is mechanically sound.
   They do **not** certify that the curator wants this specific trick
   as a public dictionary page. Those are different decisions.

3. **Federation boundary.** The master is the observational federation
   layer (footbagmoves + passback + fborg); `freestyle_tricks` is the
   IFPA canonical dictionary. The entire FB.org ingest arc was
   explicitly "spreadsheet-first, no DB promotion." 82 INSERTs is the
   first and largest crossing of that boundary — it warrants an
   explicit, eyes-open curator decision, not a "looks clean → run it."

4. **Match-quality risk.** The match is exact-slug + normalized-name
   only. It has no fuzzy/structural matching, so some "INSERT" rows
   could be false negatives — a trick already in the DB under a
   variant slug. A bulk INSERT of a false negative creates a
   **duplicate canonical row**. Spot-checks (ducking-mirage,
   spinning-pickup) confirmed those two are genuinely absent, but all
   82 need a match-quality pass before any INSERT.

**Recommended handling of the 82:**

- **Option A (recommended): split the loader.** Implement only the
  additive, gap-fill **UPDATE loader** for the 102 (safe, mostly
  noop). Stage the 82 INSERTs as a separate curator-selection queue —
  the curator picks which compounds genuinely belong in the public
  dictionary, in reviewed batches (the SCALE-pilot model the live DB
  was built with).
- **Option B:** curator green-lights all 82 explicitly after reviewing
  the dry-run CSV — then a guarded INSERT loader runs with a
  match-quality pre-check.
- **Option C:** defer all promotion until the Red packet (Pogo /
  Fairy / Spyro / Shooting family governance) is answered — several
  INSERT candidates are members of families whose governance is the
  subject of the open packet.

This report does **not** pick for you. The dry-run's job was to make
the 82-INSERT magnitude visible; it is now visible.

## 5. INSERT candidates by source / tier

| Source / tier | Count |
|---|---:|
| fborg 1–2 ADD | 4 |
| fborg 3 ADD | 7 |
| fborg 4 ADD | 28 |
| fborg 5 ADD | 15 |
| fborg 6–7 ADD | 3 |
| footbagmoves 3–4 ADD | 10 |
| footbagmoves 5–7 ADD | 13 |
| passback 3 ADD | 1 |
| curator (manual: double-knee) | 1 |

Full list in `FBORG_PROMOTION_DRYRUN_2026-05-21.csv` (filter
`action=INSERT`).

## 6. Loader — NOT implemented this slice

Per the task's own gate ("only after dry-run looks clean, implement
the loader") and §4 above, the loader is **not written**. It should be
implemented only after the curator decides the disposition of the 82
INSERTs (§4 Option A / B / C). When it is built:

- **UPDATE path:** strictly additive gap-fill; never overwrite a
  populated canonical field; preserve `provenance_notes`.
- **INSERT path:** only the curator-selected subset; with a
  match-quality pre-check (reject if a fuzzy DB match exists);
  `review_status` should enter as a non-`curated` value so new rows
  are visibly federation-sourced, not silently canonical.
- **Idempotence:** re-running must be a noop — QC test required
  (deliverable 6, pending the loader).

## 7. Hard constraints — status

| Constraint | Status |
|---|---|
| No mass DB promotion | **Held** — no loader run; 82 INSERTs paused for review |
| No silent overwrite of canonical rows | Held — no DB writes |
| No promotion of hedged rows | Held — hedged rows are `observational`, excluded |
| No promotion of curator-review rows | Held — review rows excluded |
| Preserve historical source divergences | Held — divergence rows stay in the observational layer |
| Spreadsheet remains authoritative staging | Held |
| DB remains publication/canonical layer | Held |
| Observational layer explicitly non-canonical | Held — see the observational export |

## Files produced

```
new   exploration/footbagmoves-federation/FBORG_PROMOTION_DRYRUN_REPORT_2026-05-21.md   (this file)
new   exploration/footbagmoves-federation/FBORG_PROMOTION_DRYRUN_2026-05-21.csv          (184-row detail)
new   exploration/footbagmoves-federation/FBORG_OBSERVATIONAL_EXPORT_2026-05-21.csv      (670-row observational layer — Goal B)
mod   exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv                    (Phase 1: first_class audit + publication_status)
```

No DB files modified. `freestyle_tricks` unchanged at 167 rows.
