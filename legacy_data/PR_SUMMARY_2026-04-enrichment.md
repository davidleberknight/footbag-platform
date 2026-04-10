 PR Summary — Legacy enrichment pipeline + canonical data fix

  Target: davidleberknight/footbag-platform ← James's main
Q4SFHUNJHLS5LCFW
  ---
  What changed

  1. run_pipeline.sh v2 — three explicit modes replacing the V0 single complete mode:
    - canonical_only — V0 backbone verbatim (mirror → canonical CSVs → QC → workbook → DB)
    - enrichment_only — Phases C–F (membership, clubs, provisional persons, persons master)
    - full — both in sequence
    - Brother's venv auto-detection loop merged in (VENV_DIR → .venv → footbag_venv → venv)
  2. Enrichment pipeline (Phases C–F) — five new scripts:
    - membership/scripts/01_build_membership_enrichment.py — matches 2,009 membership rows to 619 canonical persons; 375 unmatched →
  provisional
    - clubs/scripts/01–05 — confidence-scored club candidate scoring, person-club affiliation graph, bootstrap leader selection (139
  eligible clubs, 176 provisional assignments)
    - persons/provisional/scripts/01–04 — provisional persons master, identity candidates, reconciliation, promotion
    - persons/scripts/05_build_persons_master.py — unified persons master (5,072 rows)
  3. pipeline/05p5_remediate_canonical.py Fix 9 — bare division labels in multi-category events upgraded to explicit Net labels (e.g.
  "Open Singles" → "Open Singles Net" for Worlds 1996 and 241 similar cases). 242 labels fixed, QC PASS, zero orphaned refs.
  4. Snapshots — clubs/snapshots/2026-04-membership-club-pass1/ and snapshots/2026-04-persons-clubs-v1/ committed as baseline
  reference.
  5. Docs — README.md rewritten (was stale pre-pipeline content), CLAUDE.md updated to document three pipeline modes and individual
  stage commands, IMPLEMENTATION_PLAN.md updated with sprint status.
  6. .gitignore — persons/out/ and persons/provisional/out/ added (mirrors existing clubs/out/, membership/out/ exclusions).

  ---
  Why

  James's sprint: enrichment pipeline builds the data needed for club bootstrap, provisional member identity, and the persons master
  that feeds platform go-live. The division label fix eliminates a data quality issue affecting all downstream artifacts (canonical
  CSVs, workbook, platform DB) for multi-discipline events including multiple Worlds Championships.

  ---
  Key files changed

  ┌──────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────┐
  │                               File                               │                    Role                     │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/run_pipeline.sh                                      │ Replaced V0 with v2 three-mode orchestrator │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/pipeline/05p5_remediate_canonical.py                 │ Fix 9: bare Net label disambiguation        │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/membership/scripts/01_build_membership_enrichment.py │ Phase C                                     │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/clubs/scripts/01–05_*.py                             │ Phase D                                     │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/persons/provisional/scripts/01–04_*.py               │ Phase E                                     │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/persons/scripts/05_build_persons_master.py           │ Phase F                                     │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ legacy_data/README.md / CLAUDE.md / IMPLEMENTATION_PLAN.md       │ Docs                                        │
  └──────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────┘

  ---
  Tests

  - npm test — 265/265 passed
  - npm run build (tsc) — PASS, no errors
  - Pipeline QC gate — QC STATUS: PASS (0 hard failures)

  ---
  Architecture compliance

  This PR touches only legacy_data/ (Python pipeline) and .gitignore. No TypeScript application code changed except src/db/db.ts which
  was part of the previous soup2nuts PR. All non-negotiable rules are unaffected.

  ---
  doc-sync

  Not required — no changes to public routes, service contracts, or DB schema. legacy_data/ is a self-contained pipeline subtree.

  ---
  Risks and tradeoffs

  - Fix 9 scope: 242 division labels renamed across 4 canonical CSVs + platform DB. All are multi-category events where the bare label
  was already mis-categorized as "freestyle" by stage 2. QC PASS confirms referential integrity. Reviewer should spot-check a few
  events (Worlds 1996, 2023 Euro Champs) in the workbook and DB.
  - Enrichment outputs not yet in platform DB: Phases C–F produce persons_master.csv, club candidates, and bootstrap leaders — these
  are not yet loaded into the platform DB. That is intentional (next sprint step).
  - Snapshot CSVs are large: The two snapshots add ~34k lines of CSV. These are point-in-time baselines, not live outputs.

  ---
  Open questions for reviewer

  1. Fix 9 upgraded "Last Man Standing" → "Last Man Standing Net" and "Open Big One" → "Open Big One Net" for Polish/Euro events. Are
  these correct net format names in those tournaments?
  2. Unknown and Women's Overall were intentionally preserved (not upgraded). Confirm that's correct for 1996 Worlds.

  ---
  Follow-up (next sprint)

  - Load persons_master, club candidates, and bootstrap leaders into platform DB
  - Wire enrichment outputs into reset-local-db.sh
  - Name variants (~290 pairs), world records CSV, legacy member identity extraction
  - Data review sign-off (blocks members ungating)
