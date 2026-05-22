# Cross-Source Freestyle Vocabulary Reconciliation Audit — 2026-05-21

Reconciles every documented freestyle trick name across the master
spreadsheet (which already integrates FootbagMoves / footbag.org /
PassBack), the live `freestyle_tricks` table, the alias/equivalence
mappings, and the observational topology exports — classifying each
unique name into one of nine governance states.

Read-only. No mutation, no promotion, no name collapse.

Tool: `legacy_data/scripts/audit_vocabulary_reconciliation.py`
(re-runnable; functions as ontology / governance / parser QC).
Unified data: `RECONCILIATION.csv` (761 rows, one per unique name).

**Method honesty:** state assignment is *heuristic* — derived from the
master's governance columns + keyword signals, priority-ordered,
first-match. It is a strong first pass and a curator-refinable
starting point, not a final ruling. Where a heuristic is weak this
report says so.

---

## 1. Cross-source coverage summary

761 unique names reconciled (from 854 master rows + 171 live DB rows;
the gap is multi-source names collapsing to one entry).

| Governance state | Names |
|---|---:|
| 1 Published Canonical | 203 |
| 2 Covered via alias / equivalence | 3 |
| 3 Observationally represented | 478 |
| 4 Pending symbolic resolution | 52 |
| 5 Policy-dependent | 22 |
| 6 Historical / obsolete naming | 0 *(heuristic)* |
| 7 Structurally ambiguous | 3 |
| 8 Insufficiently sourced | 0 *(heuristic)* |
| 9 Truly untracked | 0 *(un-enumerable — see §3)* |

Notes:
- **203 Published Canonical > 171 DB rows** — several distinct names
  map to one published trick (e.g. "Clipper Kick" and "Clipper" both
  resolve to `clipper`). The audit is name-level; this is correct, not
  double-counting.
- **478 Observationally represented** is the bulk — real freestyle
  vocabulary, catalogued, sourced, *not yet published*. This is the
  number the missing-tricks anxiety is really about, and the registry
  exists to make it visible.
- **States 6 and 8 returned 0 by heuristic.** Not a claim that no
  obsolete or weakly-sourced names exist — the keyword heuristics
  (obsolete/deprecated/superseded; single-source + low confidence) are
  deliberately narrow to avoid false positives. Both states need a
  curator pass to populate (see §8).

Cross-source presence: **42 names appear in 2+ sources**; **47 names
are DB-only** (live-canonical but absent from the observational
master corpus — see §3).

## 2. Unified reconciliation CSV

`RECONCILIATION.csv` — 761 rows, one per unique name, columns: name,
slug, governance_state, issue_type, sources, n_sources, source_adds,
in_db, equivalent_to, doctrine_status, publication_status,
parse_confidence, add_confidence, family, primary_operator,
add_formula, parser_notes, unresolved_questions, provenance_notes.

This CSV is the audit's primary artifact and the **direct seed for the
Vocabulary Registry** (§10). Sorted by governance state then name.

## 3. "Truly missing" — honest scoping

**State 9 (Truly untracked) is structurally un-enumerable by this
audit.** An audit can only classify names *present in* the corpus it
reads. A trick name that exists in freestyle culture but in *no* source
(FootbagMoves, footbag.org, PassBack, IFPA, Holden sets) cannot be
listed — there is nothing to list it from. Reporting "0 truly
untracked" is therefore a statement about audit reach, not a claim of
completeness.

What the audit *can* surface as gap-shaped:

- **47 DB-only names** — live-canonical tricks absent from the
  observational master. Mostly modifier-stub rows (`atomic`,
  `paradox`, `spinning`, …) and IFPA-curated atoms (`clipper-stall`,
  `legover`, the stalls) — expected, per the QC report; not a defect.
  A few are slug-format mismatches (`leg-over` vs `legover`).
- **The 478 observational names** are "missing from the *published
  dictionary*" but emphatically *not* missing from the *system*.

The genuine "truly missing" capture mechanism is the **Vocabulary
Registry itself**: as new names are discovered they enter the registry
at state 3/8, and the corpus boundary moves. The audit cannot
pre-populate state 9; the registry operationalises closing it.

## 4. Alias / equivalence candidate clusters

- **3 names** classified *Covered via alias/equivalence* — the name is
  not itself published, but its `equivalent_to` target IS a published
  trick, so the *trick* is covered under another name.
- **100 master rows carry a populated `equivalent_to`** — the broader
  pool of equivalence links; most point at already-published canon
  (which is why their *names* land in state 1, not 2).
- **42 multi-source names** are alias-reconciliation candidates by
  construction — the same name in 2+ sources is the cleanest
  equivalence signal.
- Known equivalence work already done this session: the blurry/stepping
  triage (19 rows), the `clipper-kick`/`clipper` naming note, the
  `blurrage` byte-identical duplicate. Filter `RECONCILIATION.csv` on
  `equivalent_to` non-empty for the full candidate set.

**Constraint honored:** no name was collapsed. Equivalence is recorded
as a *relationship*, never a merge.

## 5. Source divergence report

The cross-source ADD/decomposition divergences are already fully
catalogued — `FBORG_CROSS_SOURCE_DIVERGENCE_REGISTER_2026-05-21.md`,
**11 divergences** in three patterns (FM systematic over-count ×6;
IFPA hidden-X-Dex up-count ×2–3; isolated ×3). This audit does not
re-derive them; it cross-references the register.

New from this audit: the 42 multi-source names are the surface where
*future* divergences will appear — they are the watch-list. Preserve
per-source `source_adds`; never collapse (Red 2026-05-21 doctrine).

## 6. Parser / decomposition gap report

- **52 names — Pending symbolic resolution** — `doctrine_status` ∈
  {hedged, pending} or parser-incomplete; the structural reading is
  not settled. Issue type: parser limitation / ontology limitation.
- **302 master rows have `parse_confidence='none'`** — the wider
  parser-coverage gap. Most are governance-untouched footbagmoves/
  passback rows the parser has not yet been pointed at; a parser-
  population pass over the master would shrink this.
- These are not errors — they are honest "not yet decomposed" states.
  The fix is parser coverage + curator decomposition, not a data
  correction.

## 7. Policy / doctrine conflict report

- **22 names — Policy-dependent** — `doctrine_status='hedged'` with a
  doctrine/policy/Wave-2/Red signal in the notes. These wait on a
  doctrine ruling, not on parser work or curation.
- Concentrations: fairy-family (pt12 Q4 — fairy-as-modifier weight),
  the cross-source-divergence rows (Atom Smasher, Witchdoctor, Triage,
  S&M Smasher), and the hedged blurry/stepping rows.
- All are Red-consultation-adjacent. None is resolvable inside an
  audit — they are the legitimate "wait for Red" set.

## 8. Historical naming-drift report

- **0 names flagged Historical/obsolete by heuristic** — the keyword
  scan (obsolete/deprecated/superseded) is deliberately narrow.
- The genuine naming-drift phenomenon IS documented — the
  blurry→stepping evolution (`BLURRY_STEPPING_TRIAGE_2026-05-21.md`,
  Red 2026-05-21 Doctrine C). Crucially, blurry-family names are *not*
  obsolete — Doctrine C holds that the compressed and explicit layers
  *coexist*. So "Historical/obsolete" being near-empty is doctrinally
  correct: freestyle rarely *retires* a name, it *layers* it.
- Recommendation: state 6 needs a small curator allow-list of names
  that are genuinely deprecated (if any) — it cannot be heuristic-derived.

## 9. High-ROI future publication candidates

- **78 names** are `first_class_ready` but not yet in the DB —
  mechanically publication-ready (settled doctrine, clean notation, no
  review flag), held only by the curator-selection gate.
- These are already sorted in `FBORG_CURATOR_SELECTION_QUEUE_2026-05-21.csv`
  (9 foundational/pedagogical · 33 topology-critical · 13 live-adjacent
  · 16 historical oddity · 6 defer). The audit confirms that queue as
  the high-ROI list.
- Recommended first batch unchanged: the 9 foundational/pedagogical
  names, then topology-critical as family batches with prose authored
  first (SCALE-pilot model).

## 10. Vocabulary Registry seeding recommendations

`RECONCILIATION.csv` **is the registry seed.** The audit's 9 governance
states map directly onto the Vocabulary Registry design
(`exploration/vocabulary-registry-2026-05-21/DESIGN.md` §5):

| Audit state | Registry status |
|---|---|
| 1 Published Canonical | Published Canonical |
| 2 Covered via alias/equivalence | Alias / Equivalence Candidate |
| 3 Observationally represented | Observed / Historical |
| 4 Pending symbolic resolution | Pending Symbolic Resolution |
| 5 Policy-dependent | Policy-Dependent |
| 6 Historical/obsolete | Historical / Obsolete Naming |
| 7 Structurally ambiguous | (Pending Symbolic Resolution — sub-flag) |
| 8 Insufficiently sourced | Insufficiently Sourced |
| 9 Truly untracked | (the registry's open growth frontier) |

Seeding recommendations:
1. **Seed the registry MVP directly from `RECONCILIATION.csv`** — the
   761 rows + the state column are the registry's initial content. No
   further data work needed for the MVP.
2. **Re-derive on every master change** — the audit script is the
   registry's generation step; run it as the build (registry status
   stays in sync with the master, never hand-kept — DESIGN §5).
3. **States 6 and 8 ship empty initially** — that is honest; a curator
   pass populates them. The registry must not heuristically guess
   "obsolete" or "weakly sourced."
4. **State 7 (3 names — structurally ambiguous)** surfaces as a
   sub-flag on Pending Symbolic Resolution, not its own registry
   status (the registry design has 8 statuses, not 9).

## Constraints — compliance

| Constraint | Status |
|---|---|
| Observational ≠ canonical | Held — states 1 vs 3 are the explicit boundary |
| Never auto-promote | Held — read-only audit; nothing promoted |
| Never silently collapse names | Held — equivalence is a relationship; 761 distinct names preserved |
| Preserve historical divergence honestly | Held — divergences referenced, not resolved (§5) |
| Lexical ≠ structural identity | Held — multi-source same-name entries kept distinct from structural-equivalence claims |
| Preserve uncertainty explicitly | Held — states 4/5/7 + the heuristic-honesty caveats |

## Files

```
new  legacy_data/scripts/audit_vocabulary_reconciliation.py   (re-runnable audit tool)
new  exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv   (761 rows)
new  exploration/vocabulary-reconciliation-audit-2026-05-21/AUDIT_REPORT.md      (this file)
```

No source data, master, or DB modified.
