#!/usr/bin/env bash
# =============================================================================
# run_pipeline.sh v2
#
# The run_v0_backbone() function below is preserved VERBATIM from
# run_pipeline.sh_V0 `complete` mode. Script paths, arguments, and execution
# order are identical to V0. Phases C–F are appended after the backbone's
# canonical QC gate and DB load complete.
#
# Modes:
#   full            : V0 backbone, preflight, phases C-F, G (soup to nuts)
#   canonical_only  : V0 backbone only (mirror access required)
#   enrichment_only : preflight, phases C-F, G (requires canonical outputs)
#   csv_only        : canonical bootstrap + QC gate, DB load from existing
#                     CSVs, phases C-F, G
#                     (no mirror access required; seed and canonical_input must exist)
#
# Run from: legacy_data/
# Bootstraps and activates a Python venv (.venv) on first run.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$SCRIPT_DIR"

# Reuse an existing venv when present (VENV_DIR override, or a committed
# footbag_venv / hand-made .venv / venv); otherwise create .venv and install
# requirements, so a fresh checkout on a python3-only host needs no manual venv
# setup. The bare `python` calls below run inside this venv, which provides a
# `python` even where the host ships only `python3`.
_venv=""
for candidate in "${VENV_DIR:-}" .venv footbag_venv venv; do
  if [ -n "$candidate" ] && [ -f "$candidate/bin/activate" ]; then
    _venv="$candidate"
    break
  fi
done
if [ -z "$_venv" ]; then
  echo "── Bootstrapping Python venv (.venv) ──────────────────────────────────"
  python3 -m venv .venv
  _venv=".venv"
fi
"${_venv}/bin/pip" install --quiet -r requirements.txt
. "${_venv}/bin/activate"

MODE="${1:-full}"

# The platform DB the load phases mutate can be a restored copy of the live
# database; the in-database post-cutover marker travels with every such copy,
# and a destructive reload would delete admin- and member-authored rows that
# have no committed seed inputs. Refuse up front, before any phase runs.
# Missing DB or missing marker means pre-cutover and is allowed. Invoked with
# the venv python (already active here), like every other stage of this script.
python "${REPO_ROOT}/scripts/lib/db_cutover_guard.py" "${REPO_ROOT}/database/footbag.db"

# =============================================================================
# CURATED-TREE GUARD
# =============================================================================
# Three trees hold hand-authored data that every stage may read and no stage may
# write: the corrections and overrides, the curated pre-1997 intake, and the
# frozen identity lock. CLAUDE.md states that invariant; this makes it
# mechanical, because a correction silently reverted by a rebuild is a failure
# this pipeline has already produced.
#
# Prevention first: the write bit comes off for the duration of the run, so a
# stage that tries to write fails at that instant naming its own path rather
# than succeeding quietly. Detection second: a per-file SHA-256 manifest is
# recompared on the way out, so a write that lands anyway cannot pass unseen.
#
# Prevention rather than detection alone because a handful of identity-lock
# snapshots are gitignored and exist only on the machine that made them. For
# those, a report after the fact would arrive with nothing left to restore.
#
# The EXIT trap restores the recorded modes on every path out, including a
# failed stage, a signal and Ctrl-C, so the operator is never left with a
# read-only tree and nothing to remember.
CURATED_TREES=(
    "${SCRIPT_DIR}/overrides"
    "${SCRIPT_DIR}/inputs/curated"
    "${SCRIPT_DIR}/inputs/identity_lock"
)
CURATED_MODES="$(mktemp -t footbag-curated-modes.XXXXXX)"
CURATED_HASHES_BEFORE="$(mktemp -t footbag-curated-hashes.XXXXXX)"
CURATED_HASHES_AFTER="$(mktemp -t footbag-curated-hashes.XXXXXX)"

curated_present_trees() {
    local t
    for t in "${CURATED_TREES[@]}"; do
        [ -d "$t" ] && printf '%s\n' "$t"
    done
    # Always succeed. A checkout without one of these trees is supported, and
    # under `set -euo pipefail` a trailing failed test would abort the whole
    # run from inside a command substitution, with no output to explain it.
    return 0
}

curated_hashes() {
    local t
    curated_present_trees | while read -r t; do
        find "$t" -type f -print0
    done | LC_ALL=C sort -z | xargs -0 --no-run-if-empty sha256sum
}

curated_lock() {
    local t bad
    # Whitespace in these paths would break the manifest parsing below. Refuse
    # rather than mis-parse: a guard that quietly compares the wrong thing is
    # worse than no guard.
    bad="$(curated_present_trees | while read -r t; do find "$t" -name '* *' -o -name '*	*'; done)"
    if [ -n "$bad" ]; then
        echo "ERROR: curated guard cannot run — whitespace in a protected path:" >&2
        echo "$bad" >&2
        exit 1
    fi
    curated_present_trees | while read -r t; do find "$t" -printf '%m %p\n'; done > "$CURATED_MODES"
    curated_hashes > "$CURATED_HASHES_BEFORE"
    curated_present_trees | while read -r t; do chmod -R a-w "$t"; done
    echo "── Curated-tree guard ─────────────────────────────────────────────────"
    echo "  $(wc -l < "$CURATED_HASHES_BEFORE") hand-authored file(s) locked read-only for this run."
}

curated_unlock_and_verify() {
    local rc=$? mode path drift
    # Restore first, unconditionally, so no exit path can leave the trees locked.
    if [ -s "$CURATED_MODES" ]; then
        # `if` rather than `&&`: under `set -e` a trailing false test would end
        # the trap early and leave the rest of the trees locked, which is the
        # one outcome this function exists to make impossible.
        while read -r mode path; do
            if [ -e "$path" ]; then
                chmod "$mode" "$path"
            fi
        done < "$CURATED_MODES"
    fi
    if [ -s "$CURATED_HASHES_BEFORE" ]; then
        curated_hashes > "$CURATED_HASHES_AFTER"
        if ! drift="$(diff "$CURATED_HASHES_BEFORE" "$CURATED_HASHES_AFTER")"; then
            echo "" >&2
            echo "FATAL: a pipeline stage changed hand-authored data." >&2
            echo "  These trees are read-only inputs. A correction written into one of" >&2
            echo "  them is the only durable home it has; a stage rewriting one destroys" >&2
            echo "  work no rebuild can reproduce. Lines starting '<' were there before" >&2
            echo "  this run, lines starting '>' are what is there now:" >&2
            echo "$drift" >&2
            rm -f "$CURATED_MODES" "$CURATED_HASHES_BEFORE" "$CURATED_HASHES_AFTER"
            exit 1
        fi
    fi
    rm -f "$CURATED_MODES" "$CURATED_HASHES_BEFORE" "$CURATED_HASHES_AFTER"
    return $rc
}

trap curated_unlock_and_verify EXIT
curated_lock

# =============================================================================
# PREFLIGHT
# =============================================================================
run_alias_registry_preflight() {
    echo ""
    echo "── Alias registry preflight ───────────────────────────────────────────"
    if ! python "${SCRIPT_DIR}/pipeline/qc/check_alias_registry.py" --mode preflight; then
        echo "  ERROR: alias registry preflight failed — see out/qc_alias_registry.csv" >&2
        exit 1
    fi
}

# =============================================================================
# PREFLIGHT (full mode)
#
# Verifies inputs the orchestrator cannot produce on its own. Identity-lock
# files are intentionally NOT checked here; run_v0_backbone validates them
# inline, and the pending IP item to drop identity-lock version suffixes
# will rework that check. Avoid duplication.
# =============================================================================
run_full_mode_preflight() {
    echo ""
    echo "── full-mode preflight ────────────────────────────────────────────────"

    local missing=()

    # Mirror data is reached through the canonical repo-root symlink
    # footbag_legacy_mirror (machine-specific target; on the producing machine
    # it points at legacy_data/legacy_mirror/mirror_footbag_org). We test the
    # homepage index file: a stable structural marker. [[ -f ]] follows
    # symlinks; find without -L does not, which is why an HTML-scan check
    # fails on the symlink layout.
    local mirror_root="../footbag_legacy_mirror"
    local mirror_marker="${mirror_root}/www.footbag.org/index.html"
    if [[ ! -d "$mirror_root" ]] || [[ ! -f "$mirror_marker" ]]; then
        missing+=("footbag_legacy_mirror (repo-root symlink to the mirror crawl output; expected ${mirror_marker}; wire it with 'ln -s legacy_data/legacy_mirror/mirror_footbag_org footbag_legacy_mirror' from the repo root, or obtain the crawl from operator handoff)")
    fi

    # Membership roster input: real member data, operator-provided and held
    # locally only (gitignored, like the mirror). Not present on a fresh clone.
    [[ -f "membership/inputs/membership_input_normalized.csv" ]] \
        || missing+=("membership/inputs/membership_input_normalized.csv (operator-provided member roster; gitignored, obtain from operator handoff)")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "  ERROR: full-mode preflight failed; resolve before re-running ./run_pipeline.sh full" >&2
        for f in "${missing[@]}"; do echo "    MISSING: $f" >&2; done
        exit 1
    fi

    echo "  full-mode preflight passed"
    echo "───────────────────────────────────────────────────────────────────────"
    echo ""
}

# =============================================================================
# PREFLIGHT (enrichment_only mode)
#
# Verifies that an earlier canonical_only run plus mirror extraction have
# produced the seed and canonical_input artifacts the enrichment phases
# consume. Not used by full mode.
# =============================================================================
run_preflight_enrichment_only() {
    echo ""
    echo "── Preflight checks ───────────────────────────────────────────────────"

    local missing=()

    [[ -f "event_results/canonical_input/persons.csv"          ]] || missing+=("event_results/canonical_input/persons.csv")
    [[ -f "membership/inputs/membership_input_normalized.csv"  ]] || missing+=("membership/inputs/membership_input_normalized.csv (operator-provided member roster; gitignored, obtain from operator handoff)")
    [[ -f "seed/clubs.csv"                                     ]] || missing+=("seed/clubs.csv")
    [[ -f "seed/club_members.csv"                              ]] || missing+=("seed/club_members.csv")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "  ERROR: preflight failed — missing required files:" >&2
        for f in "${missing[@]}"; do
            echo "    MISSING: $f" >&2
        done
        echo "" >&2
        echo "  How to get each missing input:" >&2
        echo "    - canonical_input/*.csv and seed/*.csv come from a canonical_only run:" >&2
        echo "      ./run_pipeline.sh canonical_only (needs the legacy mirror)." >&2
        echo "    - membership/inputs/membership_input_normalized.csv is the curated IFPA" >&2
        echo "      membership roster (real member data), curated from the IFPA membership" >&2
        echo "      export. It is gitignored and never committed, and cannot be regenerated" >&2
        echo "      from the mirror or the dump; obtain it from the operator." >&2
        echo "  To build without membership/club enrichment, run the default ./run_dev.sh." >&2
        exit 1
    fi

    echo "  Preflight passed"
    echo "───────────────────────────────────────────────────────────────────────"
    echo ""
}

# =============================================================================
# PREFLIGHT (csv_only)
#
# Verifies all CSV artifacts that csv_only mode requires are already present.
# These are produced by a prior canonical_only run (and mirror extraction for
# clubs seed).  csv_only validates the committed canonical snapshot through the
# same QC gate the mirror pipeline runs, then loads existing seed files into
# the DB and runs enrichment phases C–F and G. The workbook build stays a
# mirror-pipeline step and does not run here.
#
# Required files:
#   event_results/canonical_input/   — 5 platform-export CSVs
#   membership/inputs/               — membership normalized CSV
#   seed/                            — clubs + club_members CSVs
# (mvfp_full seed CSVs are built from canonical_input at load time, not required here.)
# =============================================================================
run_preflight_csv_only() {
    echo ""
    echo "── csv_only preflight ─────────────────────────────────────────────────"

    local missing=()

    # Canonical platform export (produced by export_canonical_platform.py)
    for f in events event_disciplines event_results event_result_participants persons; do
        [[ -f "event_results/canonical_input/${f}.csv" ]] \
            || missing+=("event_results/canonical_input/${f}.csv")
    done

    # The mvfp_full seed CSVs are not required here: run_db_load_canonical now
    # builds them from canonical_input via script 07 before loading.

    # Membership roster input: real member data, operator-provided and held
    # locally only (gitignored, like the mirror). Not present on a fresh clone.
    [[ -f "membership/inputs/membership_input_normalized.csv" ]] \
        || missing+=("membership/inputs/membership_input_normalized.csv (operator-provided member roster; gitignored, obtain from operator handoff)")

    # Club seed inputs
    [[ -f "seed/clubs.csv"        ]] || missing+=("seed/clubs.csv")
    [[ -f "seed/club_members.csv" ]] || missing+=("seed/club_members.csv")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "  ERROR: csv_only preflight failed — missing required files:" >&2
        for f in "${missing[@]}"; do
            echo "    MISSING: $f" >&2
        done
        echo "" >&2
        echo "  How to get each missing input:" >&2
        echo "    - event_results/canonical_input/*.csv come from a canonical_only run:" >&2
        echo "      ./run_pipeline.sh canonical_only (needs the legacy mirror)." >&2
        echo "    - membership/inputs/membership_input_normalized.csv is the curated IFPA" >&2
        echo "      membership roster (real member data), curated from the IFPA membership" >&2
        echo "      export. It is gitignored and never committed, and cannot be regenerated" >&2
        echo "      from the mirror or the dump; obtain it from the operator." >&2
        echo "  To build without membership/club enrichment, run the default ./run_dev.sh." >&2
        exit 1
    fi

    echo "  csv_only preflight passed"
    echo "───────────────────────────────────────────────────────────────────────"
    echo ""
}

# =============================================================================
# CANONICAL BOOTSTRAP + QC GATE (csv_only)
#
# csv_only never runs run_v0_backbone, the only mirror-based producer of
# out/canonical/, so materialize out/canonical/ from the committed
# canonical_input snapshot and validate it through the same QC gate the
# backbone runs. The copy keeps the QC gate, Phase D (which reads
# out/canonical/events.csv), and the DB load all reading the same bytes even
# when a stale out/canonical/ from an earlier mirror run is present. A QC
# failure aborts the pipeline (set -e). The stage2 mirror-support and
# workbook checks self-skip or warn when their mirror-pipeline inputs are
# absent, which is the expected state on a csv_only build.
# =============================================================================
run_csv_only_canonical_bootstrap_and_qc() {
    echo ""
    echo "── canonical bootstrap (committed snapshot → out/canonical) ───────────"
    mkdir -p out/canonical
    local f
    for f in events event_disciplines event_results event_result_participants persons; do
        cp "event_results/canonical_input/${f}.csv" "out/canonical/${f}.csv"
    done
    echo "  out/canonical refreshed from event_results/canonical_input"
    echo ""
    echo "── QC GATE ────────────────────────────────────────────────────────────"
    # Blocking: a hard QC failure aborts the build unconditionally (the
    # line-numbered alias-registry artifact is out/qc_alias_registry.csv).
    if ! python pipeline/qc/run_qc.py; then
        echo "ERROR: QC gate failed; aborting the build." >&2
        exit 1
    fi
    echo ""
}

# Count data rows in the club seed, 0 when it is absent. Parsed as CSV rather
# than counted as lines because a club description can carry embedded newlines,
# which makes a line count read far higher than the number of clubs.
_clubs_seed_row_count() {
    python - <<'PY'
import csv, pathlib
p = pathlib.Path("seed/clubs.csv")
if not p.exists():
    print(0)
else:
    with p.open(newline="", encoding="utf-8") as f:
        print(max(0, sum(1 for _ in csv.reader(f)) - 1))
PY
}

# =============================================================================
# PHASE B — Mirror extraction (clubs + club_members seed CSVs)
#
# Produces:
#   seed/clubs.csv         (consumed by load_clubs_seed.py + Phase D)
#   seed/club_members.csv  (consumed by load_club_members_seed.py + Phase D)
#
# Both extract scripts are idempotent: they skip when the output CSV is
# newer than the source mirror HTML. Safe to re-run on every pipeline
# invocation.
# =============================================================================
run_phase_b_mirror_extract() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE B: MIRROR EXTRACTION                          ║"
    echo "╚══════════════════════════════════════════════════════╝"
    # The club seed must never come out of this phase smaller than it went in.
    # The check spans both steps below rather than living inside either one,
    # because neither produces a comparable number on its own: the extractor
    # sees only the clubs the legacy site still serves as active, and the
    # overlay adds back the approved clubs it no longer serves. Only the pair's
    # combined output is comparable to the committed seed, so the count is taken
    # before the first step and tested after the last.
    local clubs_before clubs_after
    clubs_before="$(_clubs_seed_row_count)"

    python scripts/extract_clubs.py
    # Reconcile the mirror-extracted seed against the authoritative approved-club
    # universe from the legacy clubs dump: preserve the mirror-enriched rows,
    # add the approved clubs the mirror never captured, and drop any seeded key
    # the dump no longer approves. Runs before URL verification so the added
    # clubs' URLs are verified, and before the classifier so it sees the full
    # universe. A clean no-op when the machine-local dump is absent.
    python scripts/overlay_clubs_from_dump.py

    clubs_after="$(_clubs_seed_row_count)"
    if (( clubs_after < clubs_before )) && [[ "${ALLOW_CLUB_SEED_SHRINK:-0}" != "1" ]]; then
        echo "" >&2
        echo "ERROR: the club seed shrank across mirror extraction: ${clubs_before} rows before, ${clubs_after} after." >&2
        echo "       seed/clubs.csv has NOT been left in a good state and the run is stopping here." >&2
        echo "" >&2
        echo "       The usual cause is that the approved-club dump was unavailable, which makes" >&2
        echo "       scripts/overlay_clubs_from_dump.py a no-op and leaves only the clubs the mirror" >&2
        echo "       still serves as active. That dump is machine-local, reached through the" >&2
        echo "       footbag_legacy_repo symlink; confirm it resolves and holds the clubs module." >&2
        echo "       The other cause is a genuinely depleted clubs/show mirror." >&2
        echo "" >&2
        echo "       Re-run ./run_pipeline.sh once the dump or the mirror is in place. If the" >&2
        echo "       reduction is real and intended, re-run with ALLOW_CLUB_SEED_SHRINK=1." >&2
        exit 1
    fi
    python scripts/extract_club_members.py
    python scripts/extract_member_usernames.py
    # Stamp URL safety verdicts for club URLs at data-prep time, so the deployed
    # app never makes a URL callout. Idempotent: when the committed seed and
    # verdict file already agree every row is kept and no network call is made,
    # so a normal soup-to-nuts run stays callout-free; only genuinely new or
    # changed URLs are checked here. Real Safe Browsing verdicts require the live
    # adapter configured in this environment.
    #
    # Without that live adapter the verifier refuses to record anything, because
    # every verdict would be an invented answer that then ships as though a real
    # check had happened. That refusal is right, and on a production data-prep
    # run it must stop everything. On a workstation running the stub it would
    # instead halt every rebuild that touches a club URL, for a step whose whole
    # output is advisory: an unstamped URL is simply hidden on the public read,
    # so the cost of skipping is that club links do not render, not that anything
    # is wrong. So report what a real run would do, say plainly what is deferred,
    # and continue.
    if [[ "${SAFE_BROWSING_ADAPTER:-stub}" == "live" ]]; then
        ( cd "${REPO_ROOT}" && npm run --silent verify:seed-urls -- --clubs-only )
    else
        echo "── Club URL verdicts: skipped (Safe Browsing adapter is not live) ────"
        ( cd "${REPO_ROOT}" && npm run --silent verify:seed-urls -- --clubs-only --dry-run ) || true
        echo "   Nothing was recorded. Club links without a stored verdict stay hidden"
        echo "   on the public read until a run with the live adapter stamps them."
    fi
    echo ""
}

# =============================================================================
# PHASE I — Club-members seed load (initial mirror-derived affiliation snapshot)
#
# Loads seed/club_members.csv into the platform DB. Idempotent (INSERT OR
# IGNORE patterns).
#
# Writes:
#   legacy_club_candidates           (mirror-derived initial; later refreshed
#                                     by Phase G's DELETE+INSERT)
#   legacy_person_club_affiliations  (mirror-derived initial; later refreshed
#                                     by Phase G's DELETE+INSERT)
#
# Must run AFTER the V0 backbone (which loads canonical historical_persons
# that load_club_members_seed needs for name-match attempts) and BEFORE
# Phase H (which FKs club_bootstrap_leaders → clubs.id).
#
# Production-vs-dev distinction:
#   load_clubs_seed.py is INTENTIONALLY EXCLUDED from this production
#   pipeline. The production migration architecture is classifier-driven:
#   Phase D (clubs/scripts/02_build_legacy_club_candidates.py) classifies
#   each mirror club into pre_populate / onboarding_visible / dormant /
#   junk; Phase G loads that classification into the DB; Phase H
#   (06_cutover_pre_populated_clubs.py) is the SOLE creator of live
#   `clubs` rows at cutover, and only for the pre_populate-class
#   candidates (~59 of 311). Onboarding_visible / dormant / junk
#   candidates remain in `legacy_club_candidates` (staging) until
#   promoted via the onboarding wizard or admin.
#
#   Bulk-loading every seed/clubs.csv row into `clubs` here would defeat
#   that gating: Phase H's INSERT OR IGNORE would no-op against all 311
#   pre-existing rows and the production DB would carry 252 non-eligible
#   clubs that shouldn't be live yet.
#
#   The dev workflow (scripts/reset-local-db.sh) continues
#   to call load_clubs_seed.py directly for local-browse convenience.
#   Dev DBs intentionally carry all 311 mirror clubs; production cutover
#   DBs carry only the 59 pre_populate clubs. The divergence is
#   intentional and documented.
# =============================================================================
run_phase_clubs_seed_load() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE I: CLUB-MEMBERS SEED LOAD                     ║"
    echo "╚══════════════════════════════════════════════════════╝"
    # load_clubs_seed.py is excluded here on purpose — see the header
    # comment above. Phase H's 06_cutover_pre_populated_clubs.py is the
    # sole creator of live `clubs` rows in production.
    python scripts/load_club_members_seed.py --db "${REPO_ROOT}/database/footbag.db"
    echo ""
}

# =============================================================================
# DB LOAD (canonical seed only — step 7 of V0 backbone, extracted for reuse)
# =============================================================================
run_db_load_canonical() {
    echo ""
    echo "── DB load: canonical seed ────────────────────────────────────────────"
    # Seed legacy_members before the canonical load so the FK
    # historical_persons.legacy_member_id -> legacy_members is satisfied with
    # foreign-key enforcement on. Idempotent (INSERT OR IGNORE).
    python scripts/load_legacy_members_seed.py --db "${REPO_ROOT}/database/footbag.db"
    # Build the mvfp_full seed CSVs from the committed canonical_input so this
    # no-mirror path produces them itself rather than depending on a prior run
    # having left them on disk.
    python event_results/scripts/07_build_mvfp_seed_full.py
    python event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
        --db "${REPO_ROOT}/database/footbag.db" \
        --seed-dir "event_results/seed/mvfp_full"
    # Freestyle records are built by the self-contained freestyle pipeline
    # (freestyle/run_freestyle.sh), which lives outside legacy_data/ so it
    # survives the cutover freeze. The legacy pipeline no longer builds them.
    echo "───────────────────────────────────────────────────────────────────────"
    echo ""
}

# =============================================================================
# V0 BACKBONE — verbatim from run_pipeline.sh_V0 `complete` mode
# Do NOT change script paths, arguments, or order.
# =============================================================================
run_v0_backbone() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  FOOTBAG COMPLETE PIPELINE                           ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""

    echo "── [1/7] REBUILD ──────────────────────────────────────"
    local _id_persons="inputs/identity_lock/Persons_Truth_Final.csv"
    local _id_placements="inputs/identity_lock/Placements_ByPerson.csv"
    local _id_missing=()
    [[ -f "${_id_persons}"    ]] || _id_missing+=("${_id_persons}")
    [[ -f "${_id_placements}" ]] || _id_missing+=("${_id_placements}")
    if [[ ${#_id_missing[@]} -gt 0 ]]; then
        echo "ERROR: identity-lock CSV(s) not found:" >&2
        for _f in "${_id_missing[@]}"; do echo "  MISSING: ${_f}" >&2; done
        echo "Recommendation: see legacy_data/runbooks/rebuild-identity-pipeline.md." >&2
        exit 1
    fi
    python pipeline/adapters/mirror_results_adapter.py --mirror ../footbag_legacy_mirror
    python pipeline/adapters/curated_events_adapter.py
    python pipeline/01c_merge_stage1.py
    python pipeline/02_canonicalize_results.py
    python pipeline/02p5_player_token_cleanup.py \
        --identity_lock_persons_csv "${_id_persons}" \
        --identity_lock_placements_csv "${_id_placements}"
    python pipeline/02p6_structural_cleanup.py
    echo ""

    echo "── [2/7] RELEASE ──────────────────────────────────────"
    python pipeline/historical/export_historical_csvs.py
    python pipeline/05p5_remediate_canonical.py
    python pipeline/platform/export_canonical_platform.py
    echo ""

    # Regenerate inputs/name_variants.csv from canonical + identity-lock
    # sources. Deterministic + idempotent. Must run before the QC gate
    # so pipeline/qc/check_name_variants.py sees the fresh CSV.
    echo "── [2b] NAME VARIANTS (build) ─────────────────────────"
    python pipeline/identity/build_name_variants.py
    echo ""

    echo "── [3/7] SUPPLEMENT CLASS B (Placements_Flat) ─────────"
    python pipeline/02p5b_supplement_class_b.py
    echo ""

    echo "── [4/7] QC GATE ──────────────────────────────────────"
    python pipeline/qc/run_qc.py
    echo ""

    echo "── [4b] QC VIEWER ─────────────────────────────────────"
    python pipeline/event_comparison_viewerV13.py
    echo ""

    echo "── [5/7] WORKBOOK ─────────────────────────────────────"
    python pipeline/build_workbook_release.py
    echo ""

    echo "── [6/7] SEED BUILD ───────────────────────────────────"
    python event_results/scripts/07_build_mvfp_seed_full.py
    echo ""

    echo "── [7/7] DB LOAD ──────────────────────────────────────"
    # Seed legacy_members before the canonical load so the FK
    # historical_persons.legacy_member_id -> legacy_members is satisfied with
    # foreign-key enforcement on. Idempotent (INSERT OR IGNORE).
    python scripts/load_legacy_members_seed.py --db "${REPO_ROOT}/database/footbag.db"
    python event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
        --db "${REPO_ROOT}/database/footbag.db" \
        --seed-dir "event_results/seed/mvfp_full"
    # Freestyle records are built by the self-contained freestyle pipeline
    # (freestyle/run_freestyle.sh), which lives outside legacy_data/ so it
    # survives the cutover freeze. The legacy pipeline no longer builds them.
    echo ""

    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  V0 BACKBONE DONE                                    ║"
    echo "╚══════════════════════════════════════════════════════╝"
}

# =============================================================================
# PHASE C — Membership enrichment
# Reads:    membership/inputs/membership_input_normalized.csv
#           event_results/canonical_input/persons.csv
# Produces: membership/out/
# =============================================================================
run_phase_c() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE C: MEMBERSHIP ENRICHMENT                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python membership/scripts/01_build_membership_enrichment.py
    echo ""
}

# =============================================================================
# PHASE D — Clubs inference pipeline
# Reads:    seed/clubs.csv, seed/club_members.csv
#           membership/out/, event_results/canonical_input/persons.csv
# Produces: clubs/out/
# =============================================================================
run_phase_d() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE D: CLUBS PIPELINE                             ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python clubs/scripts/01_build_club_person_universe.py
    python clubs/scripts/02_build_legacy_club_candidates.py
    python clubs/scripts/03_build_legacy_person_club_affiliations.py
    # The candidate builder and the affiliations builder are a fixed-point pair:
    # the candidate builder classifies clubs using affiliation-recency signals,
    # while the affiliations builder reads only the club roster (club_key, name),
    # which is invariant to classification. Re-run the candidate builder so the
    # final categories reflect this run's affiliations. On a clean tree the first
    # pass bootstrapped with empty affiliations; on a populated tree this refresh
    # replaces the previous run's affiliations with the current run's. The
    # affiliations builder needs no second pass.
    python clubs/scripts/02_build_legacy_club_candidates.py
    python clubs/scripts/04_build_club_bootstrap_leaders.py
    python clubs/scripts/04a_compute_bootstrap_leader_signals.py
    python clubs/scripts/05_build_club_only_persons.py
    echo ""
}

# =============================================================================
# PHASE E — Provisional persons
# Reads:    membership/out/membership_only_persons.csv
#           clubs/out/club_only_persons.csv
# Produces: persons/provisional/out/
# =============================================================================
run_phase_e() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE E: PROVISIONAL PERSONS                        ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python persons/provisional/scripts/01_build_provisional_persons_master.py
    python persons/provisional/scripts/02_build_provisional_identity_candidates.py
    python persons/provisional/scripts/03_reconcile_provisional_to_historical.py
    python persons/provisional/scripts/04_promote_provisional_to_historical_candidates.py
    echo ""
}

# =============================================================================
# PHASE F — Persons master
# Reads:    event_results/canonical_input/persons.csv
#           persons/provisional/out/
# Produces: persons/out/persons_master.csv
# =============================================================================
run_phase_f() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE F: PERSONS MASTER                             ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python persons/scripts/05_build_persons_master.py
    echo ""
}

# =============================================================================
# PHASE G — Enrichment DB load
# Reads:    persons/out/persons_master.csv
#           clubs/out/legacy_club_candidates.csv
#           clubs/out/legacy_person_club_affiliations.csv
# Produces: historical_persons (PROVISIONAL), legacy_club_candidates,
#           legacy_person_club_affiliations rows in footbag.db
# Note:     club_bootstrap_leaders deferred — requires live clubs.id FK
# =============================================================================
run_phase_g() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE G: ENRICHMENT DB LOAD                         ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python event_results/scripts/09_load_enrichment_to_sqlite.py \
        --db "${REPO_ROOT}/database/footbag.db" \
        --persons-csv      persons/out/persons_master.csv \
        --candidates-csv   clubs/out/legacy_club_candidates.csv \
        --affiliations-csv clubs/out/legacy_person_club_affiliations.csv
    echo ""
}

# =============================================================================
# PHASE H: Club cutover + bootstrap leaders + event→club linkage
# Step 1: 06_cutover_pre_populated_clubs.py — sets mapped_club_id on the
#         59 bootstrap-eligible candidates and ensures matching live clubs
#         rows exist (idempotent INSERT OR IGNORE fallback).
# Step 2: 07_load_bootstrap_leaders.py — loads club_bootstrap_leaders from
#         the CSV. Depends on Step 1 (FK club_id → clubs.id via mapped_club_id).
# Step 3: 08_resolve_event_host_clubs.py — resolves events.host_club_id from
#         canonical events.csv host_club text against the live clubs table.
#         Depends on Step 1 (clubs must exist) + the earlier events load
#         (step 08 in event_results/scripts, which inserts host_club_id=NULL).
# Reads:  legacy_club_candidates, seed/clubs.csv, clubs/out/club_bootstrap_leaders.csv,
#         event_results/canonical_input/events.csv, clubs table, events table.
# Writes: clubs (idempotent), legacy_club_candidates.mapped_club_id,
#         club_bootstrap_leaders (DELETE + INSERT), events.host_club_id (UPDATE).
# =============================================================================
run_phase_h() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE H: CLUB CUTOVER + BOOTSTRAP LEADERS           ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python clubs/scripts/06_cutover_pre_populated_clubs.py \
        --db "${REPO_ROOT}/database/footbag.db"
    python clubs/scripts/07_load_bootstrap_leaders.py \
        --db "${REPO_ROOT}/database/footbag.db"
    python clubs/scripts/07a_load_bootstrap_leader_signals.py \
        --db "${REPO_ROOT}/database/footbag.db"
    python clubs/scripts/08_resolve_event_host_clubs.py \
        --db "${REPO_ROOT}/database/footbag.db"
    echo ""
}

# =============================================================================
# PHASE V — Name variants DB load (HIGH-confidence only)
# Reads:    inputs/name_variants.csv (generated by build step 2b)
# Produces: name_variants rows in footbag.db (source='mirror_mined')
# Note:     Loader enforces HIGH-only; MEDIUM rows go to a deferred
#           artifact for review and are not inserted.
# =============================================================================
run_phase_v() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE V: NAME VARIANTS DB LOAD                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    python scripts/load_name_variants_seed.py \
        --db "${REPO_ROOT}/database/footbag.db" \
        --apply
    python scripts/load_given_name_variants_to_sqlite.py \
        --db "${REPO_ROOT}/database/footbag.db"
    echo ""
}

# =============================================================================
# PHASE NET — Net enrichment layer
#
# Reads (read-only against canonical tables — never modifies them):
#   event_disciplines, event_result_entries, event_result_entry_participants,
#   events, historical_persons
#
# Writes (additive enrichment tables only):
#   net_discipline_group   — discipline name → canonical group mapping
#   net_team               — stable doubles team entities
#   net_team_member        — per-team member rows
#   net_team_appearance    — per-team × event_discipline placement cache
#   net_stat_policy        — evidence class policy registry
#   net_review_queue       — QC items and quarantine events
#
# Scripts run in order: 12 → 13 → 14
# Script 15 is NOT included (net_relative_performance deferred from phase 1).
#
# Requires: canonical DB already loaded (run canonical_only or csv_only first).
# =============================================================================
run_phase_net() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE NET: NET ENRICHMENT LAYER                     ║"
    echo "╚══════════════════════════════════════════════════════╝"

    python event_results/scripts/12_build_net_discipline_groups.py \
        --db "${REPO_ROOT}/database/footbag.db"

    python event_results/scripts/13_build_net_teams.py \
        --db "${REPO_ROOT}/database/footbag.db"

    python event_results/scripts/14_import_net_review_queue.py \
        --db "${REPO_ROOT}/database/footbag.db"

    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  PHASE NET DONE                                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
}

# =============================================================================
# Main
# =============================================================================
run_alias_registry_preflight

case "$MODE" in
    full)
        run_full_mode_preflight
        run_phase_b_mirror_extract
        run_v0_backbone
        run_phase_clubs_seed_load
        run_phase_net
        run_phase_c
        run_phase_d
        run_phase_e
        run_phase_f
        run_phase_g
        run_phase_h
        run_phase_v
        echo ""
        echo "╔══════════════════════════════════════════════════════╗"
        echo "║  FULL PIPELINE DONE                                  ║"
        echo "╚══════════════════════════════════════════════════════╝"
        ;;

    canonical_only)
        run_v0_backbone
        ;;

    enrichment_only)
        run_preflight_enrichment_only
        run_phase_clubs_seed_load
        run_phase_c
        run_phase_d
        run_phase_e
        run_phase_f
        run_phase_g
        run_phase_h
        run_phase_v
        echo ""
        echo "╔══════════════════════════════════════════════════════╗"
        echo "║  ENRICHMENT PIPELINE DONE                            ║"
        echo "╚══════════════════════════════════════════════════════╝"
        ;;

    csv_only)
        # No mirror access required.  Bootstraps out/canonical from the
        # committed snapshot and QC-gates it, loads existing seed → DB, then
        # runs all enrichment phases (C–F), enrichment DB load (G), club
        # cutover (H), and name_variants DB load (V).
        run_preflight_csv_only
        run_csv_only_canonical_bootstrap_and_qc
        run_db_load_canonical
        run_phase_clubs_seed_load
        run_phase_c
        run_phase_d
        run_phase_e
        run_phase_f
        run_phase_g
        run_phase_h
        run_phase_v
        echo ""
        echo "╔══════════════════════════════════════════════════════╗"
        echo "║  CSV-ONLY PIPELINE DONE                              ║"
        echo "╚══════════════════════════════════════════════════════╝"
        ;;

    net_enrichment)
        # Runs net enrichment layer only (scripts 12→13→14).
        # Requires the canonical DB to already be loaded.
        run_phase_net
        ;;

    *)
        echo "Usage: $0 {full|canonical_only|enrichment_only|csv_only|net_enrichment}" >&2
        exit 1
        ;;
esac
