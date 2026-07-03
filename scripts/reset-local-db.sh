#!/usr/bin/env bash
# reset-local-db.sh
# Drops and rebuilds the local SQLite database from schema + full seed pipeline.
# Safe to run repeatedly; destroys all local data each time.
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

if [[ "${CURATOR_SEED:-yes}" != "no" ]] && ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg not found, but the curator seed needs it to transcode the demo videos."
  echo "  Ubuntu/Debian: sudo apt-get install ffmpeg"
  echo "  macOS:         brew install ffmpeg"
  echo "  Or skip the curator seed: CURATOR_SEED=no bash scripts/reset-local-db.sh"
  exit 1
fi

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SCHEMA="database/schema.sql"
CANONICAL_INPUT_DIR="legacy_data/event_results/canonical_input"
SEED_DIR="legacy_data/event_results/seed/mvfp_full"
CLUBS_SEED_CSV="legacy_data/seed/clubs.csv"
CLUB_MEMBERS_SEED_CSV="legacy_data/seed/club_members.csv"
VENV="scripts/.venv"
REQUIREMENTS="scripts/requirements.txt"

# Preflight: required local files. This script does NOT regenerate canonical
# inputs or extract from the mirror; it loads existing committed artifacts. The
# canonical event inputs under legacy_data/event_results/canonical_input/ are
# committed real competitor data, so a fresh clone has them and the preflight
# below passes. The seed CSVs (clubs.csv, club_members.csv) are produced by
# legacy_data/scripts/extract_*.py and committed under legacy_data/seed/.
_missing=()
for _f in "${CANONICAL_INPUT_DIR}/events.csv" \
          "${CANONICAL_INPUT_DIR}/event_disciplines.csv" \
          "${CANONICAL_INPUT_DIR}/event_results.csv" \
          "${CANONICAL_INPUT_DIR}/event_result_participants.csv" \
          "${CANONICAL_INPUT_DIR}/persons.csv" \
          "${CLUBS_SEED_CSV}" \
          "${CLUB_MEMBERS_SEED_CSV}" \
          "${SCHEMA}"; do
  [[ -f "${_f}" ]] || _missing+=("${_f}")
done
if [[ ${#_missing[@]} -gt 0 ]]; then
  echo "ERROR: required local file(s) not present:" >&2
  for _f in "${_missing[@]}"; do echo "  MISSING: ${_f}" >&2; done
  echo "" >&2
  echo "Recommendation:" >&2
  echo "  - The canonical inputs under legacy_data/event_results/canonical_input/ are committed real data; a missing file means an incomplete checkout. Restore them with 'git checkout -- legacy_data/event_results/canonical_input legacy_data/seed'." >&2
  echo "  - Maintainers rebuilding from real data: 'bash scripts/deploy-local-data.sh --from-csv' (or --soup-to-nuts to refresh CSVs from the mirror)." >&2
  exit 1
fi

if [ ! -f "${VENV}/bin/python3" ]; then
  echo "  → Creating Python venv..."
  python3 -m venv "${VENV}"
fi
"${VENV}/bin/pip" install --quiet -r "${REQUIREMENTS}"

PYTHON="${VENV}/bin/python3"

phase_slate() {
echo "Resetting database: ${DB_FILE}"

rm -f "${DB_FILE}" "${DB_FILE}-wal" "${DB_FILE}-shm"

# Apply schema
echo "  → Applying schema..."
sqlite3 "${DB_FILE}" < "${SCHEMA}"

# Local dev only: poll the email outbox every 2s instead of the 30s production
# default, so a stub-captured email appears at /dev/outbox within a refresh or
# two rather than a half-minute. system_config is append-only; this layers a
# later-effective override row that system_config_current resolves ahead of the
# schema's epoch-seeded default, leaving the production seed untouched.
echo "  → Setting fast local outbox poll interval..."
sqlite3 "${DB_FILE}" "INSERT INTO system_config (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id) VALUES ('cfg_dev_outbox_poll', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'outbox_poll_interval_seconds', '2', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'Local dev fast outbox poll so the captured-email viewer updates promptly', NULL);"

# TEMP-DEVIATION: legacy_members seed source.
# Current: legacy_members is seeded from the mirror-derived extract before
#   historical_persons loads, so the FK historical_persons.legacy_member_id
#   -> legacy_members(legacy_member_id) is satisfied by script 08 below.
# Target: replace the mirror-derived seed with the authoritative legacy-site
#   data export when it becomes available.
echo "  → Loading legacy_members seed (temporary, mirror-derived)..."
"${PYTHON}" legacy_data/scripts/load_legacy_members_seed.py --db "${DB_FILE}"
}

phase_canonical_seed() {
# Build seed CSVs from canonical input. Script 07 stamps source_scope='CANONICAL'
# on persons, which the /history Players query requires. This replaces the prior
# cp-based shortcut, which dropped source_scope and broke the /history listing.
echo "  → Building seed CSVs from canonical input..."
"${PYTHON}" legacy_data/event_results/scripts/07_build_mvfp_seed_full.py \
  --input-dir "${CANONICAL_INPUT_DIR}" \
  --output-dir "${SEED_DIR}"

# Load seed CSVs into database. This also seeds the showcase event and the
# Footbag Hacky historical person, which load unconditionally in every
# environment so the system account's identity link resolves.
echo "  → Loading seed data into database..."
"${PYTHON}" legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
  --db "${DB_FILE}" \
  --seed-dir "${SEED_DIR}"
}

phase_post_canonical() {
# Build the freestyle tables via the self-contained freestyle pipeline: records,
# consecutive records, trick dictionary (curated-v1 + Red overlays + footbag.org
# provenance + pending), the notation parser, and QC. Freestyle lives outside
# legacy_data/ so it survives the cutover freeze; this delegates so the build is
# defined in exactly one place (freestyle/run_freestyle.sh).
echo "  → Building freestyle tables (freestyle/run_freestyle.sh)..."
PYTHON="${PYTHON}" bash freestyle/run_freestyle.sh "${DB_FILE}"

# Seed name_variants (HIGH-confidence only; MEDIUM rows are deferred to a
# review artifact). Required for verify-time auto-link tier1/tier2 matching.
echo "  → Loading name_variants seed..."
"${PYTHON}" legacy_data/scripts/load_name_variants_seed.py \
  --db "${DB_FILE}" \
  --apply

echo "  → Loading given_name_variants..."
"${PYTHON}" legacy_data/scripts/load_given_name_variants_to_sqlite.py \
  --db "${DB_FILE}"

# Net enrichment layer (discipline groups, teams, appearances, review queue).
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

# Club enrichment load. Reads classifier output CSVs from
# legacy_data/clubs/out/ + legacy_data/persons/out/ and DELETE+INSERTs the
# real legacy_club_candidates (with R1-R10 evidence + real classification) +
# legacy_person_club_affiliations (resolution_status='pending').
# Skipped when any required CSV is absent (CI smoke fixtures + fresh clones).
if [[ -f legacy_data/clubs/out/legacy_club_candidates.csv \
   && -f legacy_data/clubs/out/legacy_person_club_affiliations.csv \
   && -f legacy_data/persons/out/persons_master.csv ]]; then
  echo "  → Loading club enrichment..."
  "${PYTHON}" legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py \
    --db "${DB_FILE}" \
    --persons-csv      legacy_data/persons/out/persons_master.csv \
    --candidates-csv   legacy_data/clubs/out/legacy_club_candidates.csv \
    --affiliations-csv legacy_data/clubs/out/legacy_person_club_affiliations.csv
else
  echo "  → Skipping club enrichment (classifier CSVs absent)."
fi

# Club-candidate linking: stamp mapped_club_id for every candidate whose clubs row
# exists. In dev (load_clubs_seed.py above created all 311 clubs) this links
# all 311 candidates. In prod the script also creates the 41 pre_populate
# clubs rows on first run; here those rows already exist so it only links.
if [[ -f legacy_data/seed/clubs.csv ]]; then
  echo "  → Stamping mapped_club_id for matching candidates..."
  "${PYTHON}" legacy_data/clubs/scripts/06_cutover_pre_populated_clubs.py --db "${DB_FILE}"
else
  echo "  → Skipping mapped_club_id stamping (legacy_data/seed/clubs.csv absent)."
fi

# Club bootstrap leaders: load from
# legacy_data/clubs/out/club_bootstrap_leaders.csv (~51 rows). Depends on
# legacy_club_candidates and historical_persons being loaded by earlier
# steps. Skipped when the CSV is absent (CI smoke fixtures + fresh clones);
# the CSV is owned by the James-track classifier and is not regenerated here.
if [[ -f legacy_data/clubs/out/club_bootstrap_leaders.csv ]]; then
  echo "  → Loading club bootstrap leaders..."
  "${PYTHON}" legacy_data/clubs/scripts/07_load_bootstrap_leaders.py --db "${DB_FILE}"
else
  echo "  → Skipping club bootstrap leaders (legacy_data/clubs/out/club_bootstrap_leaders.csv absent)."
fi

# Club bootstrap leader signals: load from
# legacy_data/clubs/out/club_bootstrap_leader_signals.csv (~7 signals per
# leader). Depends on club_bootstrap_leaders rows existing (step 2 above);
# the FK chain resolves bootstrap_leader_id by stable_id formula. Skipped
# when the CSV is absent (CI smoke fixtures + fresh clones); the CSV is
# owned by the James-track classifier and is not regenerated here.
if [[ -f legacy_data/clubs/out/club_bootstrap_leader_signals.csv ]]; then
  echo "  → Loading club bootstrap leader signals..."
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
# site on every DB-bearing deploy (a code-only deploy ships no DB, so no
# curator rows change).
if [[ "${CURATOR_SEED:-yes}" != "no" ]]; then
  echo "  → Seeding FH (Footbag Hacky) and curator content..."
  "${PYTHON}" scripts/seed_fh_curator.py --db "${DB_FILE}"
else
  echo "  → Skipping FH/curator seed (CURATOR_SEED=no; --no-curator-seed was passed)."
fi

# Rebuild tag_stats (denormalized tag discovery cache) after all seeders.
# Uses inline Python + SQLite (matching every other seeder step) to avoid
# pulling in the full app env.ts config chain that npx tsx would require.
echo "  → Rebuilding tag stats..."
"${PYTHON}" - "${DB_FILE}" <<'PYEOF'
import sys, sqlite3, datetime
db_path = sys.argv[1]
con = sqlite3.connect(db_path)
con.execute("PRAGMA foreign_keys = ON")
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
rows = con.execute("""
    SELECT mt.tag_id,
           COUNT(*) AS usage_count,
           COUNT(DISTINCT mi.uploader_member_id) AS distinct_member_count,
           MAX(mi.uploaded_at) AS last_used_at
    FROM media_tags mt
    JOIN media_items mi ON mi.id = mt.media_id
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
    GROUP BY mt.tag_id
""").fetchall()
con.execute("DELETE FROM tag_stats")
for tag_id, usage_count, distinct_member_count, last_used_at in rows:
    con.execute("""
        INSERT INTO tag_stats (tag_id, usage_count, distinct_member_count, last_used_at, created_at, updated_at, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tag_id) DO UPDATE SET
          usage_count = excluded.usage_count,
          distinct_member_count = excluded.distinct_member_count,
          last_used_at = excluded.last_used_at,
          updated_at = excluded.updated_at,
          computed_at = excluded.computed_at
    """, (tag_id, usage_count, distinct_member_count, last_used_at, now, now, now))
con.commit()
con.close()
print(f"    tag_stats rows: {len(rows)}")
PYEOF

# Sanity check
EVENT_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM events;")
CLUB_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM clubs;")
MEMBER_COUNT=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM legacy_person_club_affiliations;")
echo "  → Done. ${EVENT_COUNT} events, ${CLUB_COUNT} clubs, ${MEMBER_COUNT} club affiliations in database."
echo "Reset complete: ${DB_FILE}"
}

# Phase dispatch. No argument runs the full standalone reset (slate + canonical
# seed + post), preserving prior behavior for `run_dev --reset`, `--db-only`,
# deploy-rebuild.sh, and direct invocation. The deploy two-pass
# (deploy-local-data.sh soup-to-nuts / from-csv) calls --slate, then
# run_pipeline.sh (which reseeds canonical loader 08 on the empty slate and
# rebuilds net/clubs/enrichment), then --post-canonical to layer freestyle,
# the full clubs seed, curator content, and tag_stats while idempotently
# refreshing the rest. Splitting it this way keeps loader 08 off an
# already-populated DB, which is what made the in-place reseed abort on the
# net_* foreign keys.
case "${1:-all}" in
  --slate)          phase_slate ;;
  --post-canonical) phase_post_canonical ;;
  all|"")           phase_slate; phase_canonical_seed; phase_post_canonical ;;
  *)
    echo "usage: $(basename "$0") [--slate|--post-canonical]" >&2
    exit 1
    ;;
esac
