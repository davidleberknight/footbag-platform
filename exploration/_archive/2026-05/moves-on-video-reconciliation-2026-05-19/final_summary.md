# Moves-on-Video Reconciliation -- Final Summary -- 2026-05-19

Single-page synthesis of the `moves-on-video.txt` reconciliation slice. Final source in the 9-audit fborg corpus.

Source: `exploration/fborg/moves-on-video.txt` (footbag.org "Video Moves" reference list; 307 lines; circa late-1990s/early-2000s video-lesson curation).

Companion audits (all 2026-05-19): add-multiplier-doctrine, job-notation, fundamental-moves, paradox-moves, gyro-moves, blurry-moves, pixie-moves, footbag-sets, add-categories. This slice closes the corpus.

---

## THE three single most important findings

1. **33 of 33 in-DB tricks AGREE on ADD with IFPA.** Zero real ADD disagreements surfaced. This is the cleanest fborg source in the 9-audit corpus — likely because it predates the looser folk-name expansion that produced the 1-ADD divergences seen across pixie / blurry / paradox / gyro families.

2. **The single "mismatch" (Clipper IFPA=1 vs MoV=2) is a known CORE-ATOM-CANONICAL-RECONCILE-1 aliasing artifact, not a real disagreement.** Bare "Clipper" in fborg parses as the clipper-stall (ADD=2) per source convention; IFPA `clipper` slug refers to the clipper-kick body atom (ADD=1). The workbook generator already routes bare "Clipper" to `clipper-stall` via `NAME_ALIASES["clipper-stall"]`. No action.

3. **Source contributes zero new ADD disagreements to Red Wave 3 Q5.** The open ADD disagreement queue (omelette, fury, surging) is unchanged. MoV does not corroborate FM's higher-ADD readings on these three.

---

## Counts

| Metric | Value |
|---|---:|
| Source size | 307 lines |
| Source ADD-anchored entries | 32 |
| Parser-expanded lookup keys | 50 (parenthetical-pair split per the 2026-05-19 parser fix) |
| Distinct trick concepts | 39 (after de-dup of parenthetical-paired alt forms) |
| In-DB IFPA match | 33 |
| Placeholder slug match (in NAME_ALIASES, no DB row) | 5 (baroque, double-down, gyro-drifter, paradox-double-leg-over, stepping-paradox-whirl) |
| Unmatched (no IFPA slug at all) | 11 |
| ADD agreement on in-DB rows | 33 of 33 (100%) |
| Real ADD disagreements | 0 |
| Aliasing-artifact "mismatches" | 1 (clipper) |

---

## Agreement rates

| Comparison | Count | % |
|---|---:|---:|
| In-DB rows: ADD agreement | 33 of 33 | 100% |
| Source coverage of IFPA active rows (166 active DB rows) | 33 of 166 | 20% (modest — MoV is a small curated list) |
| Cross-source consistency (entries also in other fborg files) | 22 of 39 distinct concepts also appear in fundamentalmoves / paradoxMoves / gyroMoves / blurryMoves | 56% |
| MoV-exclusive content (not in any other audited fborg file) | 17 of 39 distinct concepts | 44% |

---

## Major alignments

1. **100% ADD agreement on the 33-row in-DB overlap.** Every shared trick (drifter, barfly, blender, butterfly compounds, paradox compounds, gyro family, mobius, blur, blurry-whirl, vortex, paradon, ripstein, ripwalk, etc.) matches IFPA's official ADD exactly.
2. **Parser-split parenthetical alt-names all reconcile.** Every `Primary (Alt)` MoV entry produces two lookup keys that map to the same canonical slug (verified across 11 paren-paired entries).
3. **Canonical-reading consistency on direction-variant compounds.** Mobius / Gyro Torque both map to slug `mobius` with the same ADD=5; Torque / Stepping Opposite Osis both map to slug `torque` with ADD=4 — confirming the multiple-readings doctrine.

---

## Major doctrine divergences

**None.** Unlike the other 8 audits, MoV produced zero new doctrine questions. The corpus is internally consistent with IFPA on every shared trick.

The single mismatch (`Clipper` 1 vs 2) is a name-collision artifact already governed by CORE-ATOM-CANONICAL-RECONCILE-1, captured in code (`NAME_ALIASES["clipper-stall"]` and `NAME_ALIASES["clipper"]` segregate the two readings).

---

## Historical lineage findings

1. **MoV is the cleanest fborg source in the corpus** — likely because the entries are tightly curated to specific video lessons, with the source author exercising more care than in the broader Paradox / Pixie / Blurry expansion lists.
2. **Cross-source redundancy is high** (22 of 39 concepts appear in other fborg files), but the redundancy is *consistent*. No ADD drift between MoV and the other 8 audited fborg files on shared rows.
3. **Symposium-class compounds (Symposium DLO, Symposium Eggbeater) appear in MoV but not in pixie/blurry/paradox families** — suggesting Symposium was already established as a separate operator class at video-lesson time, before the modern modifier-table consolidation.

---

## Unmatched entries (11) -- adjudication

Detail in `mov_unmatched_candidates.csv`. Three categories:

| Category | Count | Action |
|---|---:|---|
| Alt-name of an existing IFPA slug (already in NAME_ALIASES as the primary's alt) | 4 | Optional: add MoV-side primary as an additional alias. Pure documentation completeness. Examples: Butterfly Swirl → spyro-gyro; Double Swirl → ripstein; Stepping Opposite Osis → torque; Stepping Opposite Side Butterfly → ripwalk. |
| Parenthetical-pair split (already covered) | 2 | No action. Spinning Down Double-Down and Scorpion's Tail (Spinning Down Double-Down) reduce to the same Scorpion's Tail entry. |
| Distinct trick not in IFPA canon | 5 | Red Wave 3 supplement candidates. See below. |

---

## Red Wave 3 supplement candidates (5)

Detail in `mov_red_wave3_supplement_candidates.csv`. None are release-blocking. All are deferrable.

| Name | ADD | Question |
|---|---:|---|
| Double-Over Down | 4 | Distinct from Down Double-Down (DDD)? Both ADD=4, both 2-dex compounds; entry/exit shape differs (toe-set vs clipper-set). |
| Hop Over Swirl | 4 | Canonical row, or derivable structural form (hop-over modifier + swirl base)? |
| Scorpion's Tail | 5 | Folk-named trick = Spinning Down Double-Down. Canonical add candidate? |
| Symposium Double Leg Over | 4 | Derivable per §10. Confirm placeholder-only treatment. |
| Symposium Eggbeater | 4 | Derivable per §10. Confirm placeholder-only treatment. |

Sequencing recommendation: append to Red Wave 3 packet as section Q6.D (source-confirmed canonical candidates) alongside the existing Q6 entries (stomping / slur / Down Diver Down). Not urgent.

---

## Glossary opportunities

**Zero.** MoV does not introduce new conceptual terminology beyond what the prior 8 audits already surfaced. Every term used is already in glossary v5 (§1-§11) or in the existing glossary candidate queues.

---

## What this audit does NOT propose

- Does not modify any code or canonical CSV.
- Does not add any NAME_ALIASES entry (the 4 alt-name completeness adds are *optional* and can be deferred; recommendation only).
- Does not promote any unmatched entry to canonical IFPA row.
- Does not change any ADD value.

The audit's deliverable is the trio of CSVs + this summary. Application of any recommendation is curator-paced.

---

## Cross-references

- Workbook governance gate: `legacy_data/reports/trick_reconciliation_summary.md` (auto-regenerable)
- Generator: `legacy_data/scripts/build_trick_reconciliation_workbook.py`
- Companion audits: 8 prior reconciliation slices at `exploration/{add-multiplier-doctrine,job-notation,fundamental-moves,paradox-moves,gyro-moves,blurry-moves,pixie-moves,footbag-sets,add-categories}-reconciliation-2026-05-19/`
- Red Wave 3 packet: `exploration/red-wave-3-packet-2026-05-19/RED_WAVE3_PACKET.md`
- Next-step recommendation (workbook completion bundle): `exploration/workbook-completion-2026-05-19/next_step_recommendation.md`

This audit closes recommendation step 6 ("Audit moves-on-video.txt — final fborg source").

---

## Deliverables in this directory

| File | Rows | Purpose |
|---|---:|---|
| `final_summary.md` | (this file) | Single-page synthesis |
| `mov_ifpa_reconciliation.csv` | 50 | Per-entry IFPA-vs-MoV reconciliation with verdict + cross-source citation |
| `mov_unmatched_candidates.csv` | 11 | Detailed adjudication of the 11 unmatched entries with category + recommendation |
| `mov_red_wave3_supplement_candidates.csv` | 5 | The 5 distinct-trick candidates for optional Red Wave 3 supplement Q6.D |
