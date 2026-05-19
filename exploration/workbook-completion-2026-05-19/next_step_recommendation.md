# Next-Step Recommendation -- 2026-05-19

Meta-recommendation deliverable: when FootbagMoves (Phase 4) ingestion should begin, and gating criteria.

Per curator brief: "Do NOT begin FootbagMoves ingestion until: footbag.org mapping is complete; canonical workbook fields are filled/classified; PassBack observational layer is finalized; Observed Tricks surface can scale."

---

## 1. Phase status snapshot

| Phase | Goal | Status | Blocker |
|---|---|---|---|
| **Phase 1** | Finish footbag.org mapping | **Workbook now has full active-DB scope; per-field statuses live** | Optional: NAME_ALIASES extension (~120 entries from audit corpus) — increases fborg/PB coverage |
| **Phase 2** | Complete required workbook fields | **Per-field status enums live; 12 status columns active** | Curator-paced authoring (47-row chain reading queue + 48-row operational notation queue) |
| **Phase 3** | Finalize PassBack observational | **Plan deliverable ready** (passback_observational_finalization_plan.md + observed_tricks_scalability_plan.md) | Curator availability for PB staging triage; observedTricks content module + service + view layer |
| **Phase 4** | Incorporate FootbagMoves | **NOT STARTED** | All Phase 1-3 gates |

---

## 2. Gating criteria for Phase 4 (FootbagMoves ingestion)

Each criterion below must be satisfied before FootbagMoves ingestion begins.

### 2.1 Phase 1 gate

| Criterion | Status |
|---|---|
| Workbook scope includes all active canonical DB rows | ✅ Live (166 active + 31 placeholder = 197) |
| Workbook output includes per-field status enums | ✅ Live (12 status columns) |
| `fborg_status` column accurately reflects fborg-source coverage | ⚠️ Limited (10% match rate; gated on NAME_ALIASES extension) |
| `pb_status` column accurately reflects PB-source coverage | ⚠️ Limited (44% match rate; same NAME_ALIASES gate) |
| 9-audit fborg reconciliation corpus complete | ✅ Live (10 sources reviewed; 1 minor unreviewed: moves-on-video.txt) |

**Phase 1 nominally complete; one quality improvement (NAME_ALIASES extension) recommended before Phase 4.**

### 2.2 Phase 2 gate

| Criterion | Status |
|---|---|
| Per-field status enums applied consistently | ✅ Live |
| `wave2_blocked` rows correctly flagged | ✅ Live (3 slugs: rev-up, tomahawk, atom-smasher) |
| `not_applicable` rows for body primitives | ✅ Live (7 slugs in BODY_PRIMITIVE_SLUGS) |
| `needs_curator` rows for curator-paced fields | ✅ Live (job_notation 100% needs_curator) |
| Cross-audit Wave 2 candidates (103) accessible | ✅ Live (in per-audit `*_wave2_candidates.csv` files) |
| `source_absent` correctly distinguished from `missing` | ✅ Live |

**Phase 2 complete. The workbook is governance-ready.**

### 2.3 Phase 3 gate

| Criterion | Status |
|---|---|
| PassBack observational finalization plan delivered | ✅ Live (`passback_observational_finalization_plan.md`) |
| Observed Tricks scalability plan delivered | ✅ Live (`observed_tricks_scalability_plan.md`) |
| Curator triage of 187 PB new_candidate entries complete | ❌ Not started (curator-paced) |
| `observed_tricks.csv` + content module + service + view layer in place | ❌ Not started (post-triage) |
| Observed Tricks surface live at `/freestyle/observed-tricks` | ❌ Not started |

**Phase 3 plans ready; implementation queued for curator availability.**

### 2.4 Phase 4 gate (FootbagMoves)

| Criterion | Status |
|---|---|
| FM parser investigated (0% match rate is suspicious) | ❌ Not started |
| FM 487-entry corpus reviewed for observational-first ingestion | ❌ Not started |
| FM ingestion follows observational-first pattern (no auto-canonicalization) | ❌ Plan needed |
| Observed Tricks surface scales to PB + FM combined ~700 entries | ❌ Gated on Phase 3 |

**Phase 4 BLOCKED by Phase 3 + FM parser fix.**

---

## 3. Recommended sequencing

| Order | Step | Effort | Risk | Curator decision needed |
|---|---|---|---|---|
| 1 | Commit current workbook generator + outputs (this slice) | Trivial | Low | None |
| 2 | Commit 5 markdown deliverables (this slice's bundle) | Trivial | Low | None |
| 3 | (OPTIONAL) Extend NAME_ALIASES with ~120 entries from audit corpus | 1 hour edit + workbook regen | Low | Curator approval of alias scope |
| 4 | Investigate FM parser (0% match) | 30 min debug | Low | None |
| 5 | Begin Phase 3 implementation (PassBack observational) | Multi-day curator-paced | Medium | Curator availability + UI plan approval |
| 6 | Audit moves-on-video.txt (final fborg source) | 30 min audit | Low | Optional; informs nothing critical |
| 7 | Consolidate 103+ Wave 2 candidates into Red Wave 2 packet | Half day | Low | Curator + Red availability |
| 8 | After Phase 3 implementation: re-evaluate Phase 4 readiness | TBD | Low | Curator decision |

Steps 3 + 4 are quick mechanical improvements that would strengthen the governance gate before Phase 3 begins. Steps 6 + 7 are curator-paced consolidation slices.

---

## 4. Phase 4 (FootbagMoves) detailed pattern

When Phase 4 begins, the ingestion should mirror Phase 3 (PassBack observational):

| Step | Action |
|---|---|
| F1 | FM parser investigation + fix (currently 0% match rate; likely NAME_ALIASES gap or parser bug) |
| F2 | After fix: regenerate workbook → fm_status column should populate for matched rows |
| F3 | Identify FM new_candidate entries (entries in FM but no matching canonical row) |
| F4 | Curator triage of FM new_candidate set |
| F5 | Add FM rows to observed_tricks.csv (extending PassBack work) |
| F6 | UI surface auto-scales (per scalability plan; alphabetical+ADD grouping handles increased volume) |
| F7 | Source attribution: FM rows badged `FM` (distinct from PB's `PB` badge) |
| F8 | Per Phase 4 brief: observational first; compare formulas/names/ADDs; no auto-canonicalization; feed workbook discrepancy queues |

The architecture established in Phase 3 (observed_tricks.csv + observedTricks.ts + service + template) directly accommodates Phase 4 by extending the source list and CSV row set.

---

## 5. Strong recommendations

### 5.1 DO

- Treat the workbook as the governance gate; resist new-source ingestion until workbook fields are clarified
- Extend NAME_ALIASES from audit corpus before Phase 3 (quick win)
- Investigate FM parser BEFORE Phase 4 (parser gap is suspicious; fixing it is a Phase 4 prerequisite)
- Sequence Phase 3 before Phase 4 (curator brief is explicit; Phase 4 builds on Phase 3 architecture)

### 5.2 DO NOT

- Begin FootbagMoves ingestion before Phase 3 completes (curator brief is explicit)
- Auto-promote any observed trick to canonical (preserves canonical/observational separation)
- Bypass the workbook governance gate by ingesting candidates directly via DB writes
- Expand the workbook with additional source columns until Phase 4 ingestion is approved (premature)

---

## 6. Resource considerations

The Wave 2 candidate count (now 103+ across 9 audits) is itself a Red consultation queue worth consolidating BEFORE further audit work. The 103 candidates span 24 cross-cutting questions:

| Cross-cutting question | Audit frequency |
|---|---:|
| Spinning/Gyro axis (LEAD) | 5 audits |
| Inspinning operator | 5 audits |
| (plant) marker grammar | 7 audits |
| Pogo/Symposium (resolution candidate surfaced) | 5 audits |
| Terraging Double-Pixie tangle | 3 audits |
| ATAM operational-notation token grammar | 3 audits |
| OP BACK SWIRL grammar | 3 audits |
| Pixie dual identity (confirmed) | 2 audits |
| In/out alternation token | 2 audits |
| Pogo flag-count reconciliation (RESOLUTION CANDIDATE) | 1 audit (Add Categories) |
| Tomahawk reading divergence | 1 audit |
| Rake element historical precedent | 1 audit (Sprint 6 pedigree) |
| Parkwalk vs Dimwalk | 1 audit |
| Jump-land grammar | 1 audit |
| Direction-reversed whirling | 1 audit |
| UNS set primitives | 1 audit |
| Set/component distinction | 1 audit |
| Sailing partial dual identity | 1 audit |
| 4-primitive dual identity matrix | 1 audit (confirmed) |
| Down Diver Down trick | 1 audit |
| Stomping concept | 1 audit |
| Slur concept | 1 audit |
| Mobius multi-reading | 1 audit |
| Surging decomposition | 1 audit |

**Recommended: consolidate these 24 questions into a single Red Wave 2 packet document** (step 7 in the sequencing above). This document becomes the formal Red consultation input + serves as the gating-criteria board for the workbook's `wave2_blocked` status enum.

---

## 7. Single most important takeaway

**The workbook governance gate is operational.** Phase 1 + 2 are nominally complete. Phase 3 + 4 are planned. The recommended next slice is NOT another fborg source audit but rather:

1. Commit this slice (workbook code + 5 markdown deliverables; 2 commits total)
2. Apply the NAME_ALIASES extension (quick win for Phase 1 quality)
3. Investigate the FM parser (Phase 4 prerequisite)
4. Begin Phase 3 implementation (PassBack observational layer) when curator is ready

Phase 4 (FootbagMoves) should not begin until all of (1) curator availability for Phase 3, (2) FM parser fix, (3) Observed Tricks surface scaling proof are in place.

The governance gate's success criterion is satisfied: **the spreadsheet now tells us what we know, what we disagree about, and what remains unresolved.** New-candidate ingestion is appropriately gated.
