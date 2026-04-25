# Event-Equivalence Merge — DONE State Contract

## Summary

A merge is DONE when:
- all conflicting result slots are adjudicated,
- Fix 14 has applied per-row decisions,
- Fix 15 has marked the survivor event with MERGE_ADJUDICATED.

---

Status: PROPOSED — promote to authoritative once approved.

Defines when an event-equivalence merge declared in
`overrides/event_equivalence.csv` (action=merge) is considered DONE / locked,
and when it is BLOCKED. Applies to every pair declared with action=merge
regardless of source-document context (pre-1985 Worlds, mirror duplicates,
future merges).

## Scope

This contract describes state, not procedure. The mechanical "how" lives in:

- `pipeline/05p5_remediate_canonical.py` event-merge pass (line ~2070) —
  applies the merge
- Fix 14 in the same script — applies per-row adjudication decisions to
  canonical
- Fix 15 in the same script — marks fully-adjudicated pairs

Source-precedence rules (Rule 1–8) live in
`event_equivalence_pre1985_worlds_source_precedence.md`. They guide adjudication
decisions; this contract defines when those decisions count as final.

## 1. Pair-level DONE state

A merge pair `(survivor_event_key, doomed_event_key)` is DONE when **all** of
the following hold:

1. The pair appears in `overrides/event_equivalence.csv` with `action=merge`
   (`canonical_event_id=survivor`, `event_id=doomed`).
2. The survivor event exists in `out/canonical/events.csv` and
   `event_results/canonical_input/events.csv` after 05p5.
3. The doomed event is absent from both files after 05p5 (the event-merge pass
   has removed it).
4. Every adjudication row for that pair in
   `overrides/event_equivalence_pre1985_worlds_adjudication.csv`
   (or future per-merge adjudication file) has
   `decision_status ∈ {auto_ready, resolved}` AND
   `recommended_resolution ∉ {needs_review, unresolved}`.
   *Pairs with zero adjudication rows are DONE by absence — no overlap, nothing
   to adjudicate.*
5. Fix 14 has applied per-row `ADJUDICATED_*` markers
   (`ADJUDICATED_KEEP_BOTH`, `ADJUDICATED_KEEP_SURVIVOR`, or
   `ADJUDICATED_USE_DOOMED`) to every result row that the event-merge pass
   flagged with `MERGE_CONFLICT` for that pair. Pairs with zero
   `MERGE_CONFLICT` rows trivially satisfy this.
6. Fix 15 has added a pair-level marker
   `MERGE_ADJUDICATED:from=<doomed_event_key>` to the survivor event row's
   `notes` column in `events.csv`.

## 2. Result-level DONE state

A single result slot `(event_key, discipline_key, placement)` is DONE when:

1. It has **no bare unresolved `MERGE_CONFLICT` note**. After Fix 15 runs on a
   fully-adjudicated pair, all `MERGE_CONFLICT` notes for that survivor are
   compressed to `MERGE_ADJUDICATED:loser=<doomed_event_key>` form.
2. It carries exactly one of these per-row markers:
   - `ADJUDICATED_KEEP_BOTH` — sources agreed at this slot (auto_ready)
   - `ADJUDICATED_KEEP_SURVIVOR` — real conflict; survivor data preserved
   - `ADJUDICATED_USE_DOOMED` — real conflict; survivor participants replaced
     with chosen_participants from the doomed source
3. If `ADJUDICATED_USE_DOOMED`, the row also carries
   `adj_source=<source_file>` recording which doomed source provided the
   chosen data.

A slot that is overlap-free (no MERGE_CONFLICT was ever written) is DONE by
default — no per-row marker required.

## 3. BLOCKED state

A pair is BLOCKED when any of these hold:

- Any adjudication row has `decision_status ∈ {pending, ""}`.
- Any adjudication row has `recommended_resolution ∈ {needs_review,
  unresolved}` regardless of `decision_status`.
- Any survivor result row carries a `MERGE_CONFLICT` note WITHOUT a paired
  `ADJUDICATED_*` marker.
- The doomed event still exists in `events.csv` (the event-merge pass has not
  yet run).

While blocked:

- Fix 15 leaves the pair's `events.csv` notes column untouched (no pair-level
  marker added).
- Fix 15 leaves all per-row notes untouched (no `MERGE_CONFLICT` →
  `MERGE_ADJUDICATED` compression).
- Downstream consumers (workbook, DB queries, future audits) treat the pair
  as work-in-progress.

A pair stays BLOCKED until the LAST pending row is resolved. Partially-
adjudicated pairs do not get partial Fix 15 treatment; the gate is
all-or-nothing per pair.

## 4. Explicit policy — invariants for any merge work

The following are non-negotiable. Violations require a documented exception
in `IMPLEMENTATION_PLAN.md`.

- **Do not remove adjudication CSV rows after completion.** They are the
  audit trail of every per-slot decision. Append-only.
- **Do not remove `event_equivalence.csv` rows.** They are the merge
  declaration. The doomed event_key remains discoverable through the
  declaration even after canonical removal.
- **Do not reintroduce loser event keys.** Once a doomed event_key has been
  removed from canonical by the event-merge pass, it stays out. Re-adding it
  would invalidate every downstream identity-lock and reference.
- **Do not use placement offsets** (e.g. bumping doomed placements by +100 to
  avoid duplicates). The event-merge pass and Fix 14/15 use slot-collision
  semantics, not placement-offset semantics. Offsets break Fix 6's doubles
  normalization and create silent data loss.
- **Do not bypass Fix 6 / duplicate-placement QC** to admit a malformed
  merge. If a merge would create literal duplicate `(event_key, discipline_key,
  placement)` tuples, the merge is wrong — re-design the merge, do not
  silence the QC.
- **Do not manually edit canonical CSVs** (`out/canonical/*` or
  `event_results/canonical_input/*`) to fix a merge outcome. Canonical is
  pipeline-regenerated; manual edits are clobbered on the next run. All
  fixes route through `event_equivalence.csv` declarations and the
  adjudication CSV.

## 5. DONE checklist

Before calling a pair DONE, run this sequence and verify each point:

1. `pipeline/05p5_remediate_canonical.py` — applies the merge, Fix 14, Fix 15
2. `pipeline/platform/export_canonical_platform.py` — propagates to
   `canonical_input/`
3. `pipeline/build_workbook_release.py` — rebuilds the workbook
4. `pipeline/qc/run_qc.py` — runs the full QC gate

Then confirm:

- [ ] `pipeline/qc/run_qc.py` reports `QC STATUS: PASS` with 0 hard failures
- [ ] `workbook_parity` check passes — EVENT INDEX row count equals
      `event_results/canonical_input/events.csv` row count
- [ ] No duplicate `(event_key, discipline_key, placement)` tuples in
      `canonical_input/event_results.csv`
- [ ] No duplicate `(event_key, discipline_key, placement, participant_order)`
      tuples in `canonical_input/event_result_participants.csv`
- [ ] Survivor event row has `MERGE_ADJUDICATED:from=<doomed_event_key>` in
      its `notes` column in `canonical_input/events.csv`
- [ ] Doomed event_key absent from `canonical_input/events.csv`
- [ ] Every survivor result row that previously held `MERGE_CONFLICT` for this
      pair now holds `MERGE_ADJUDICATED:loser=<doomed_key>; ADJUDICATED_*`
- [ ] Doubles partnerships visually intact — spot-check at least one
      contested doubles slot for the pair (every placement still has exactly
      2 participants for `team_type=doubles`)
- [ ] Fix 15 health-report shows the pair counted in
      `Pairs fully adjudicated`

## 6. Cross-references

- Source-precedence rules: `event_equivalence_pre1985_worlds_source_precedence.md`
- Adjudication worksheet: `event_equivalence_pre1985_worlds_adjudication.csv`
- Detail report: `event_equivalence_pre1985_worlds_detail.csv`
- Per-pair status: `event_equivalence_pre1985_worlds_summary.csv`
- Merge declarations: `event_equivalence.csv`

## 7. Future-merge extensibility

This contract is written for the pre-1985 Worlds adjudication CSV today, but
the same structure applies to any future per-merge adjudication file. To
adjudicate a new merge:

1. Add the pair to `event_equivalence.csv` with `action=merge`. The existing
   merge pass (05p5 line ~2070) handles the data merge with conflict-flagging.
2. Create a parallel adjudication CSV
   (`event_equivalence_<scope>_adjudication.csv`) listing every conflicted
   slot with the same 13-column schema as the pre-1985 file.
3. Update Fix 14 + Fix 15 to read the new adjudication file (currently
   single-file scoped; generalisation is straightforward).
4. Apply this DONE contract before considering the pair locked.

The single-source-of-truth principle: per-row decisions live in the
adjudication CSV; per-pair completion lives in `events.csv` notes via Fix 15;
declaration lives in `event_equivalence.csv`. Three files, three
responsibilities, no duplication.
