#!/usr/bin/env bash
# run_pipeline.sh — Footbag Results Pipeline runner
#
# Usage:
#   ./run_pipeline.sh [MODE]
#
# Modes:
#   setup    — Create .venv, install dependencies, create out/ directory
#   rebuild  — Parse HTML mirror → canonical stage-2 events (stages 01–02)
#   release  — Apply identity lock → workbooks + canonical CSVs (stages 02p5–05)
#   qc       — Run all QC checks (master, post-release, schema/logic)
#   all      — Full pipeline: rebuild → release → qc  [default]
#
# Examples:
#   ./run_pipeline.sh setup
#   ./run_pipeline.sh rebuild
#   ./run_pipeline.sh release
#   ./run_pipeline.sh all

set -euo pipefail

PYTHON=".venv/bin/python"
MODE="${1:-all}"

# ── Helpers ────────────────────────────────────────────────────────────────────

step() { echo; echo ">>> $*"; }

require_venv() {
    if [[ ! -f "$PYTHON" ]]; then
        echo "ERROR: .venv not found. Run: ./run_pipeline.sh setup" >&2
        exit 1
    fi
}

require_mirror() {
    if [[ ! -d "mirror" ]]; then
        echo "ERROR: mirror/ directory not found." >&2
        echo "       Obtain mirror.tar.gz from the GitHub Release assets and extract it:" >&2
        echo "         tar -xzf mirror.tar.gz" >&2
        echo "       Or, if you have mirror_full/:" >&2
        echo "         ln -s mirror_full mirror" >&2
        exit 1
    fi
}

require_stage2() {
    if [[ ! -f "out/stage2_canonical_events.csv" ]]; then
        echo "ERROR: out/stage2_canonical_events.csv not found." >&2
        echo "       Run: ./run_pipeline.sh rebuild" >&2
        exit 1
    fi
}

# ── Modes ──────────────────────────────────────────────────────────────────────

do_setup() {
    step "Setting up virtual environment…"
    python3 -m venv .venv
    .venv/bin/pip install --quiet -r requirements.txt
    mkdir -p out
    echo "Setup complete. Run ./run_pipeline.sh rebuild to parse the mirror."
}

do_rebuild() {
    require_venv
    require_mirror
    step "Stage 01: parse HTML mirror"
    "$PYTHON" pipeline/01_parse_mirror.py

    step "Stage 01b: import legacy results"
    "$PYTHON" pipeline/01b_import_old_results.py

    step "Stage 01b1: merge consecutives reference data"
    "$PYTHON" pipeline/01b1_merge_consecutives.py

    step "Stage 01c: merge stage-1 sources"
    "$PYTHON" pipeline/01c_merge_stage1.py

    step "Stage 02: canonicalize results → stage2_canonical_events.csv"
    "$PYTHON" pipeline/02_canonicalize_results.py

    echo
    echo "Rebuild complete. Run ./run_pipeline.sh release to produce final outputs."
}

do_release() {
    require_venv
    require_stage2

    step "Stage 01b1: merge consecutives reference data"
    "$PYTHON" pipeline/01b1_merge_consecutives.py

    step "Stage 02p5: apply identity lock"
    "$PYTHON" pipeline/02p5_player_token_cleanup.py \
        --identity_lock_placements_csv inputs/identity_lock/Placements_ByPerson_v66.csv \
        --persons_truth_csv            inputs/identity_lock/Persons_Truth_Final_v42.csv \
        --out_dir                      out

    step "Stage 03: build canonical Excel workbook"
    "$PYTHON" pipeline/03_build_excel.py

    step "Stage 04: build analytics + coverage + lock sentinel"
    "$PYTHON" pipeline/04_build_analytics.py

    step "Stage 04B: build community Excel workbook"
    "$PYTHON" tools/build_final_workbook_v12.py

    step "Stage 05: export relational CSV files"
    "$PYTHON" pipeline/05_export_canonical_csv.py

    echo
    echo "Release complete. Outputs written to out/"
}

do_qc() {
    require_venv
    require_stage2

    step "QC: stage-2 and stage-3 integrity"
    "$PYTHON" qc/qc_master.py

    step "QC: post-release data integrity (6 checks)"
    "$PYTHON" tools/32_post_release_qc.py

    step "QC: schema and logic consistency (7 checks)"
    "$PYTHON" tools/33_schema_logic_qc.py

    echo
    echo "QC complete."
}

# ── Dispatch ───────────────────────────────────────────────────────────────────

case "$MODE" in
    setup)   do_setup   ;;
    rebuild) do_rebuild ;;
    release) do_release ;;
    qc)      do_qc      ;;
    all)
        do_rebuild
        do_release
        do_qc
        echo
        echo "Full pipeline complete."
        ;;
    *)
        echo "Unknown mode: $MODE"
        echo "Usage: $0 [setup|rebuild|release|qc|all]"
        exit 1
        ;;
esac
