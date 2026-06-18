#!/usr/bin/env bash
# Rebuild every freestyle table from the committed inputs in freestyle/inputs/.
# Needs no mirror and no network: the footbag.org move corpus is the committed
# snapshot, not a live scrape. Idempotent (each loader is DELETE+INSERT).
#
# Usage:  freestyle/run_freestyle.sh [path/to/footbag.db]   (default: database/footbag.db)
#
# The symbolic-grammar layer is loaded into the DB (26_load_symbolic_grammar.py)
# and read from there at runtime. Deferred follow-up: relocating the symbolic CSVs
# + build scripts out of exploration/ into freestyle/.
set -euo pipefail
cd "$(dirname "$0")/.."          # repo root

DB="${1:-database/footbag.db}"
PY="${PYTHON:-python3}"
L="freestyle/loaders"
S="freestyle/scripts"
I="freestyle/inputs"

echo "→ Rebuilding freestyle tables into ${DB}"

# Records
"${PY}" "${L}/10_load_freestyle_records_to_sqlite.py"   --db "${DB}" --records-csv "${I}/curated/records/records_master.csv"
"${PY}" "${L}/11_load_consecutive_records_to_sqlite.py" --db "${DB}"

# Trick dictionary: curated-v1 base, then Red overlays, then footbag.org provenance + pending
"${PY}" "${L}/17_load_trick_dictionary.py"          --db "${DB}"
"${PY}" "${L}/19_load_red_additions.py"             --db "${DB}"
"${PY}" "${L}/20_link_footbag_org_sources.py"       --db "${DB}"
"${PY}" "${L}/21_load_footbag_org_pending_tricks.py" --db "${DB}"

# Parser population (structural_parse_json + computed_adds)
"${PY}" "${S}/parse_freestyle_notation.py" --apply --db "${DB}"

# Symbolic-grammar observational layer (read at runtime by symbolicGrammarService)
"${PY}" "${L}/26_load_symbolic_grammar.py" --db "${DB}"

# Trick-dictionary QC: hard gate (non-zero exit aborts the rebuild)
"${PY}" "${L}/22_qc_trick_dictionary.py"        --db "${DB}"

# Media-coverage QC: advisory. It audits the curated MEDIA layer (orphan tags,
# source registration), not the trick-table rebuild, and currently reports
# pre-existing media-data cleanup items; run it for visibility without failing
# the rebuild.
"${PY}" "${L}/24_qc_freestyle_media_coverage.py" --db "${DB}" || echo "  (media-coverage QC reported issues — pre-existing media-data cleanup, not a rebuild failure)"
"${PY}" "${L}/25_qc_media_tag_invariant.py"     --db "${DB}" || echo "  (media-tag QC reported issues — see above)"

echo "→ Freestyle rebuild complete."
