#!/usr/bin/env bash
# check_migration_names.sh
#
# Every migration file is named NNNN_snake_case_description.sql, and the numbers
# run 0001, 0002, 0003 ... with none repeated and none missing.
#
# Reason: a migration is applied to the live database one named file at a time,
# and the migrating deploy refuses a file unless every lower-numbered one is
# already in the database's ledger. That refusal is only as good as the numbers:
# two files sharing a number, or a gap, would let two hosts reach the same
# schema by different orders, or let a step be skipped without anything
# noticing. Holding the directory to a gapless sequence here means the order is
# settled in review, before any host sees it.
#
# Resolves its own root through git, so a test can stand up a throwaway
# repository and run this inside it rather than writing a fixture into the real
# tree. Delegated from scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MIGRATIONS_DIR="${ROOT}/database/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "[migration-names] pass (no migrations directory)"
  exit 0
fi

findings=()
numbers=()
shopt -s nullglob
for path in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$path")"
  if [[ ! "$name" =~ ^([0-9]{4})_[a-z0-9_]+\.sql$ ]]; then
    findings+=("${name}: not named NNNN_snake_case_description.sql")
    continue
  fi
  numbers+=("$((10#${BASH_REMATCH[1]}))")
done
shopt -u nullglob

if (( ${#numbers[@]} > 0 )); then
  mapfile -t sorted < <(printf '%s\n' "${numbers[@]}" | sort -n)
  expected=1
  previous=0
  for n in "${sorted[@]}"; do
    if (( n == previous )); then
      findings+=("$(printf '%04d' "$n"): used by more than one file")
      continue
    fi
    while (( expected < n )); do
      findings+=("$(printf '%04d' "$expected"): missing; the numbers must run from 0001 with no gap")
      expected=$((expected + 1))
    done
    expected=$((n + 1))
    previous=$n
  done
fi

if (( ${#findings[@]} > 0 )); then
  printf '  %s\n' "${findings[@]}" >&2
  echo "  FAIL: migration files are numbered 0001, 0002, ... with no repeat and no gap," >&2
  echo "        named NNNN_snake_case_description.sql, because the deploy applies each one" >&2
  echo "        only on top of every lower-numbered one." >&2
  exit 1
fi
echo "[migration-names] pass (${#numbers[@]} migration file(s))"
