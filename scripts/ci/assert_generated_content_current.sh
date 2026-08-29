#!/usr/bin/env bash
# Regeneration-is-a-no-op guard for the generated freestyle content modules.
#
# src/content/freestyleObservationalUniverse.ts and
# src/content/freestyleTrackedNames.ts are generated from committed inputs plus,
# for the observational module, the adjudication table that decides what each
# observational name IS. This runs both generators and fails if a committed
# module differs from a fresh regeneration, i.e. an input changed without the
# module being regenerated and committed. (The live publication-state exclusion
# for the rendered Emerging Vocabulary surface is applied at request time by the
# service, not baked into these modules.)
#
# The adjudication authority is a database table, and this tier has no database,
# so the guard builds a disposable one from the committed inputs: the dictionary
# loaders create the trick rows the rulings link to, and the seed loader fills
# the table from the committed ruling ledger. It lands in a temp directory and is
# deleted on exit, so no real-data path is touched and no FOOTBAG_DB_PATH is
# read. A developer regenerating locally needs none of this: the generator
# defaults to the checkout's own database, which the freestyle rebuild fills.
#
# On failure the regenerated modules are left in place so the diff is
# inspectable and directly committable; the workspace is disposable in CI.
set -euo pipefail
cd "$(dirname "$0")/../.."

MODULES=(
  src/content/freestyleObservationalUniverse.ts
  src/content/freestyleTrackedNames.ts
)

WORKDIR="$(mktemp -d -t footbag-generated-content-XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT
AUTHORITY_DB="${WORKDIR}/authority.db"

echo "[generated-content] building a disposable adjudication authority..."
python3 -c 'import sqlite3, sys; con = sqlite3.connect(sys.argv[1]); con.executescript(open("database/schema.sql", encoding="utf-8").read()); con.close()' "${AUTHORITY_DB}"

# The order the freestyle rebuild uses: the rulings that name a trick row link to
# it by foreign key, and rows 17, 19 and 21 create those targets.
for loader in \
  freestyle/loaders/17_load_trick_dictionary.py \
  freestyle/loaders/19_load_red_additions.py \
  freestyle/loaders/20_link_footbag_org_sources.py \
  freestyle/loaders/21_load_footbag_org_pending_tricks.py \
  freestyle/loaders/28_load_ev_adjudications.py
do
  python3 "${loader}" --db "${AUTHORITY_DB}" >/dev/null
done

FREESTYLE_EV_AUTHORITY_DB="${AUTHORITY_DB}" \
  python3 freestyle/scripts/build_observational_universe_content.py >/dev/null
python3 freestyle/scripts/build_tracked_names_content.py >/dev/null

if git diff --exit-code -- "${MODULES[@]}" >/dev/null; then
  echo "[generated-content] current: regeneration is a no-op."
else
  echo "[generated-content] FAIL: a committed generated module is stale vs its inputs." >&2
  echo "  A source input changed without regenerating. Re-run the generators and" >&2
  echo "  commit the regenerated modules:" >&2
  echo "    python3 freestyle/scripts/build_observational_universe_content.py" >&2
  echo "    python3 freestyle/scripts/build_tracked_names_content.py" >&2
  git --no-pager diff --stat -- "${MODULES[@]}" >&2
  exit 1
fi
