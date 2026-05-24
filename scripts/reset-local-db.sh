#!/usr/bin/env bash
# reset-local-db.sh
# Drops and rebuilds the local SQLite database from schema + full seed pipeline.
# Safe to run repeatedly — destroys all local data each time.
#
# Usage:
#   ./scripts/reset-local-db.sh
#   FOOTBAG_DB_PATH=./custom.db ./scripts/reset-local-db.sh

set -euo pipefail

# Refuse to run against any environment that smells like staging or production.
# Positive guards only -- no --force or CI=true escape hatch by design. If you
# legitimately need to run on one of these conditions, edit the script with
# informed intent. SEC-DB01.
_GUARD_DB_PATH="${FOOTBAG_DB_PATH:-./database/footbag.db}"
if [[ "${NODE_ENV:-}" == "production" ]] \
  || [[ "${FOOTBAG_ENV:-}" == "production" ]] \
  || [[ "${FOOTBAG_ENV:-}" == "staging" ]] \
  || [[ -z "${_GUARD_DB_PATH}" ]] \
  || [[ "${_GUARD_DB_PATH}" == "/" ]] \
  || [[ "${_GUARD_DB_PATH}" == /srv/footbag/* ]]; then
  echo "refusing to reset DB: this script is dev-only." >&2
  echo "  NODE_ENV=${NODE_ENV:-} FOOTBAG_ENV=${FOOTBAG_ENV:-} FOOTBAG_DB_PATH=${_GUARD_DB_PATH}" >&2
  exit 2
fi
unset _GUARD_DB_PATH

if ! command -v sqlite3 &>/dev/null; then
  echo "Error: sqlite3 CLI not found. Install it first:"
  echo "  Ubuntu/Debian: sudo apt-get install sqlite3"
  echo "  macOS:         brew install sqlite3"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "Error: python3 not found. Install it first."
  exit 1
fi

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SCHEMA="database/schema.sql"
CANONICAL_INPUT_DIR="legacy_data/event_results/canonical_input"
SEED_DIR="legacy_data/event_results/seed/mvfp_full"
RECORDS_MASTER_CSV="legacy_data/inputs/curated/records/records_master.csv"
CLUBS_SEED_CSV="legacy_data/seed/clubs.csv"
CLUB_MEMBERS_SEED_CSV="legacy_data/seed/club_members.csv"
VENV="scripts/.venv"
REQUIREMENTS="scripts/requirements.txt"

# Preflight: required local files. This script does NOT regenerate canonical
# inputs or extract from the mirror; it loads existing artifacts. The seed
# CSVs (clubs.csv, club_members.csv) are produced by
# legacy_data/scripts/extract_*.py and committed under legacy_data/seed/.
# On a fresh clone, run `bash scripts/deploy-local-data.sh --from-csv` first
# (or `--soup-to-nuts` if you have the legacy mirror and want to refresh CSVs).
_missing=()
for _f in "${CANONICAL_INPUT_DIR}/events.csv" \
          "${CANONICAL_INPUT_DIR}/event_disciplines.csv" \
          "${CANONICAL_INPUT_DIR}/event_results.csv" \
          "${CANONICAL_INPUT_DIR}/event_result_participants.csv" \
          "${CANONICAL_INPUT_DIR}/persons.csv" \
          "${RECORDS_MASTER_CSV}" \
          "${CLUBS_SEED_CSV}" \
          "${CLUB_MEMBERS_SEED_CSV}" \
          "${SCHEMA}"; do
  [[ -f "${_f}" ]] || _missing+=("${_f}")
done
if [[ ${#_missing[@]} -gt 0 ]]; then
  echo "ERROR: required local file(s) not present:" >&2
  for _f in "${_missing[@]}"; do echo "  MISSING: ${_f}" >&2; done
  echo "" >&2
  echo "Recommendation: bash scripts/deploy-local-data.sh --from-csv   (or --soup-to-nuts if mirror is available and you want fresh CSVs)." >&2
  exit 1
fi

if [ ! -f "${VENV}/bin/python3" ]; then
  echo "  → Creating Python venv..."
  python3 -m venv "${VENV}"
fi
"${VENV}/bin/pip" install --quiet -r "${REQUIREMENTS}"

PYTHON="${VENV}/bin/python3"

echo "Resetting database: ${DB_FILE}"

rm -f "${DB_FILE}" "${DB_FILE}-wal" "${DB_FILE}-shm"

# Apply schema
echo "  → Applying schema..."
sqlite3 "${DB_FILE}" < "${SCHEMA}"

# TEMP-DEVIATION: legacy_members seed source.
# Current: legacy_members is seeded from the mirror-derived extract before
#   historical_persons loads, so the FK historical_persons.legacy_member_id
#   -> legacy_members(legacy_member_id) is satisfied by script 08 below.
# Target: replace the mirror-derived seed with the authoritative legacy-site
#   data export when it becomes available.
echo "  → Loading legacy_members seed (temporary, mirror-derived)..."
"${PYTHON}" legacy_data/scripts/load_legacy_members_seed.py --db "${DB_FILE}"

# Build seed CSVs from canonical input. Script 07 stamps source_scope='CANONICAL'
# on persons, which the /history Players query requires. This replaces the prior
# cp-based shortcut, which dropped source_scope and broke the /history listing.
echo "  → Building seed CSVs from canonical input..."
"${PYTHON}" legacy_data/event_results/scripts/07_build_mvfp_seed_full.py \
  --input-dir "${CANONICAL_INPUT_DIR}" \
  --output-dir "${SEED_DIR}"

# Load seed CSVs into database
echo "  → Loading seed data into database..."
"${PYTHON}" legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
  --db "${DB_FILE}" \
  --seed-dir "${SEED_DIR}"

# Load freestyle passback records
echo "  → Loading freestyle passback records..."
"${PYTHON}" legacy_data/event_results/scripts/10_load_freestyle_records_to_sqlite.py \
  --db "${DB_FILE}" \
  --records-csv legacy_data/inputs/curated/records/records_master.csv

# Load consecutive kicks records
echo "  → Loading consecutive kicks records..."
"${PYTHON}" legacy_data/event_results/scripts/11_load_consecutive_records_to_sqlite.py \
  --db "${DB_FILE}"

# Load freestyle trick dictionary (tricks + modifiers + aliases + curated-v1 source).
# Script 17 must run BEFORE script 19 (Red expert additions) and script 20 (footbag.org
# overlay) because both layer source-scoped rows on top of script 17's base load.
# All three must run BEFORE the freestyle media loaders below (21/22/23) so that
# media_links.entity_id='trick' rows resolve to existing freestyle_tricks.slug.
echo "  → Loading freestyle trick dictionary..."
"${PYTHON}" legacy_data/event_results/scripts/17_load_trick_dictionary.py \
  --db "${DB_FILE}"

echo "  → Loading Red Husted expert-review trick additions..."
"${PYTHON}" legacy_data/event_results/scripts/19_load_red_additions.py \
  --db "${DB_FILE}"

echo "  → Overlaying footbag.org trick provenance..."
"${PYTHON}" legacy_data/event_results/scripts/20_link_footbag_org_sources.py \
  --db "${DB_FILE}"

# Load freestyle media: sources → assets → links (FK-safe order).
# Sources first (FK target for assets.source_id); assets next (FK target for
# links.media_id); links last. Each loader cascade-deletes its dependents in
# reverse FK order so re-running the chain rebuilds cleanly.
echo "  → Loading freestyle media sources..."
"${PYTHON}" legacy_data/event_results/scripts/21_load_freestyle_media_sources.py \
  --db "${DB_FILE}"

echo "  → Loading freestyle media assets..."
"${PYTHON}" legacy_data/event_results/scripts/22_load_freestyle_media_assets.py \
  --db "${DB_FILE}"

echo "  → Loading freestyle media links..."
"${PYTHON}" legacy_data/event_results/scripts/23_load_freestyle_media_links.py \
  --db "${DB_FILE}"

# Seed name_variants (HIGH-confidence only; MEDIUM rows are deferred to a
# review artifact). Required for verify-time auto-link tier1/tier2 matching.
echo "  → Loading name_variants seed..."
"${PYTHON}" legacy_data/scripts/load_name_variants_seed.py \
  --db "${DB_FILE}" \
  --apply

echo "  → Loading given_name_variants..."
"${PYTHON}" legacy_data/scripts/load_given_name_variants_to_sqlite.py \
  --db "${DB_FILE}"

# Phase NET: net enrichment layer (discipline groups, teams, appearances, review queue).
# Reads canonical tables, writes net_* tables. Must run after script 08.
echo "  → Building net discipline groups..."
"${PYTHON}" legacy_data/event_results/scripts/12_build_net_discipline_groups.py \
  --db "${DB_FILE}"

echo "  → Building net teams..."
"${PYTHON}" legacy_data/event_results/scripts/13_build_net_teams.py \
  --db "${DB_FILE}"

echo "  → Importing net review queue..."
"${PYTHON}" legacy_data/event_results/scripts/14_import_net_review_queue.py \
  --db "${DB_FILE}"

# Load club seed data into database (CSV is preflight-required; produced
# upstream by legacy_data/scripts/extract_clubs.py and committed under
# legacy_data/seed/clubs.csv).
echo "  → Loading club seed data into database..."
"${PYTHON}" legacy_data/scripts/load_clubs_seed.py --db "${DB_FILE}"

# Load club member data into database (CSV is preflight-required; produced
# upstream by legacy_data/scripts/extract_club_members.py and committed under
# legacy_data/seed/club_members.csv).
echo "  → Loading club member data into database..."
"${PYTHON}" legacy_data/scripts/load_club_members_seed.py --db "${DB_FILE}"

# Phase G — enrichment load. Reads classifier output CSVs from
# legacy_data/clubs/out/ + legacy_data/persons/out/ and DELETE+INSERTs the
# real legacy_club_candidates (with R1-R10 evidence + real classification) +
# legacy_person_club_affiliations (resolution_status='pending' per 4ca0909).
# Skipped when any required CSV is absent (CI smoke fixtures + fresh clones).
if [[ -f legacy_data/clubs/out/legacy_club_candidates.csv \
   && -f legacy_data/clubs/out/legacy_person_club_affiliations.csv \
   && -f legacy_data/persons/out/persons_master.csv ]]; then
  echo "  → Loading club enrichment (Phase G)..."
  "${PYTHON}" legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py \
    --db "${DB_FILE}" \
    --persons-csv      legacy_data/persons/out/persons_master.csv \
    --candidates-csv   legacy_data/clubs/out/legacy_club_candidates.csv \
    --affiliations-csv legacy_data/clubs/out/legacy_person_club_affiliations.csv
else
  echo "  → Skipping club enrichment (Phase G; classifier CSVs absent)."
fi

# Phase H step 1 — stamp mapped_club_id for every candidate whose clubs row
# exists. In dev (load_clubs_seed.py above created all 311 clubs) this links
# all 311 candidates. In prod the script also creates the 41 pre_populate
# clubs rows on first run; here those rows already exist so it only links.
if [[ -f legacy_data/seed/clubs.csv ]]; then
  echo "  → Stamping mapped_club_id for matching candidates (Phase H step 1)..."
  "${PYTHON}" legacy_data/clubs/scripts/06_cutover_pre_populated_clubs.py --db "${DB_FILE}"
else
  echo "  → Skipping Phase H step 1 (legacy_data/seed/clubs.csv absent)."
fi

# Phase H step 2 — load club bootstrap leaders from
# legacy_data/clubs/out/club_bootstrap_leaders.csv (~51 rows). Depends on
# legacy_club_candidates and historical_persons being loaded by earlier
# steps. Skipped when the CSV is absent (CI smoke fixtures + fresh clones);
# the CSV is owned by the James-track classifier and is not regenerated here.
if [[ -f legacy_data/clubs/out/club_bootstrap_leaders.csv ]]; then
  echo "  → Loading club bootstrap leaders (Phase H step 2)..."
  "${PYTHON}" legacy_data/clubs/scripts/07_load_bootstrap_leaders.py --db "${DB_FILE}"
else
  echo "  → Skipping club bootstrap leaders (legacy_data/clubs/out/club_bootstrap_leaders.csv absent)."
fi

# Phase H step 3 — load club bootstrap leader signals from
# legacy_data/clubs/out/club_bootstrap_leader_signals.csv (~7 signals per
# leader). Depends on club_bootstrap_leaders rows existing (step 2 above);
# the FK chain resolves bootstrap_leader_id by stable_id formula. Skipped
# when the CSV is absent (CI smoke fixtures + fresh clones); the CSV is
# owned by the James-track classifier and is not regenerated here.
if [[ -f legacy_data/clubs/out/club_bootstrap_leader_signals.csv ]]; then
  echo "  → Loading club bootstrap leader signals (Phase H step 3)..."
  "${PYTHON}" legacy_data/clubs/scripts/07a_load_bootstrap_leader_signals.py --db "${DB_FILE}"
else
  echo "  → Skipping club bootstrap leader signals (legacy_data/clubs/out/club_bootstrap_leader_signals.csv absent)."
fi

# Seed Footbag Hacky (FH) and all FH-owned curator content: FH member row,
# FH avatar, demo loops, event-pinned curator photos, /curated/freestyle_tricks/
# sidecars, and FH-owned named galleries. Single home for everything FH owns
# (DD §2.8). Gated by CURATOR_SEED (default yes). The deploy orchestrator
# exports CURATOR_SEED=yes by default and CURATOR_SEED=no when
# --no-curator-seed is passed. Local dev with the env unset also defaults to
# yes. The S3 cycle (wipe + rsync) is governed independently by SYNC_MEDIA;
# URL-reference sidecars (YouTube/Vimeo) need no S3 bytes and reach the live
# site on every default deploy.
if [[ "${CURATOR_SEED:-yes}" != "no" ]]; then
  echo "  → Seeding FH (Footbag Hacky) and curator content..."
  "${PYTHON}" scripts/seed_fh_curator.py --db "${DB_FILE}"
else
  echo "  → Skipping FH/curator seed (CURATOR_SEED=no; --no-curator-seed was passed)."
fi

# Sanity check
EVENT_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM events;")
CLUB_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM clubs;")
MEMBER_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM legacy_person_club_affiliations;")
echo "  → Done. ${EVENT_COUNT} events, ${CLUB_COUNT} clubs, ${MEMBER_COUNT} club affiliations in database."
echo "Reset complete: ${DB_FILE}"
