#!/usr/bin/env bash
# scripts/rename-curated-sidecar-prefixes.sh -- folds the filename prefix of
# every curated URL-reference sidecar to the site's one slug rule.
#
# Why this exists: every slug on the site follows one folding rule (lowercase
# letters, digits and underscores), and the curator upload form now writes
# sidecar filename prefixes that way. Older sidecars under curated/ were named
# with hyphens (`pixie-set-list_124750f2.meta.json`), so the tree held two
# spellings of one convention. This renames each such file to its folded
# prefix (`pixie_set_list_124750f2.meta.json`), keeping the URL hash.
#
# What it does: lists every rename. With --apply it first loads every sidecar
# into a scratch database through the curator seeder's own loader, renames the
# files, loads them again, and requires the two loads to hold the same items
# with the same hashtags, and a second plan to find nothing left to rename. The
# prefix is not part of any item's identity (the media id is a hash of the
# platform and URL), so the loads must match exactly.
#
# What it refuses to do:
#   - Rename without --apply. A run without it lists the renames and changes
#     nothing.
#   - Rename onto a name that already exists, or two files onto one name.
#   - Guess at a prefix holding anything but lowercase letters, digits,
#     hyphens and underscores.
#   - Commit. The maintainer reviews the renames (`git status curated/`) and
#     commits them.
#
# Usage:
#   bash scripts/rename-curated-sidecar-prefixes.sh [--apply] [--curated-dir DIR]
#
# Test seams, each announced on stderr:
#   --curated-dir DIR   the curated tree to work on (default: the repository's
#                       curated/)
#   FOOTBAG_PYTHON      the Python to run the helper with (default: the
#                       scripts virtualenv, else python3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

usage() { sed -n '/^# Usage:/,/^# Test seams/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

APPLY=0
CURATED="${REPO_ROOT}/curated"
while (( $# )); do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --curated-dir)
      [[ -n "${2:-}" ]] || cr_die "--curated-dir needs a directory."
      CURATED="$(cd "$2" 2>/dev/null && pwd)" || cr_die "--curated-dir $2 is not a directory."
      echo "TEST SEAM: working on the curated tree at ${CURATED}" >&2
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; cr_die "unknown argument: $1" ;;
  esac
done
[[ -d "$CURATED" ]] || cr_die "no curated directory at ${CURATED}."

if [[ -n "${FOOTBAG_PYTHON:-}" ]]; then
  PYTHON="$FOOTBAG_PYTHON"
  echo "TEST SEAM: running the helper with ${PYTHON}" >&2
elif [[ -x "${REPO_ROOT}/scripts/.venv/bin/python3" ]]; then
  PYTHON="${REPO_ROOT}/scripts/.venv/bin/python3"
else
  PYTHON="python3"
fi
HELPER="${SCRIPT_DIR}/_rename_curated_sidecar_prefixes.py"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-rename-sidecars.XXXXXX")"
cr_cleanup rm -rf "$WORK"

if ! "$PYTHON" "$HELPER" plan --curated-dir "$CURATED" > "${WORK}/plan.tsv" 2> "${WORK}/plan.err"; then
  while IFS= read -r line; do cr_error "$line"; done < "${WORK}/plan.err"
  cr_unproved "no file was renamed"
  cr_finish
fi
COUNT="$(wc -l < "${WORK}/plan.tsv" | tr -d ' ')"
if [[ "$COUNT" -eq 0 ]]; then
  echo "Every sidecar prefix already follows the slug rule; nothing to rename."
  cr_proved "no sidecar prefix needs folding"
  cr_finish
fi

echo "Renames (${COUNT}):"
while IFS=$'\t' read -r old new; do echo "  ${old}  ->  ${new}"; done < "${WORK}/plan.tsv"

if [[ "$APPLY" -ne 1 ]]; then
  echo ""
  echo "Dry run: nothing changed. Re-run with --apply to rename these ${COUNT} file(s)."
  cr_unproved "no file was renamed (dry run)"
  cr_finish
fi

cr_run "load before renaming" -- \
  "$PYTHON" "$HELPER" seed --curated-dir "$CURATED" --db "${WORK}/before.db" --out "${WORK}/before.tsv" \
  || cr_die "the sidecars do not load as they stand; nothing was renamed."

cr_run "rename" -- "$PYTHON" "$HELPER" apply --curated-dir "$CURATED" \
  || cr_die "the rename step failed part way; run git status on the curated tree, then re-run."

cr_run "load after renaming" -- \
  "$PYTHON" "$HELPER" seed --curated-dir "$CURATED" --db "${WORK}/after.db" --out "${WORK}/after.tsv" \
  || cr_die "the renamed sidecars do not load; restore them with git, then report this."

ITEMS="$(wc -l < "${WORK}/before.tsv" | tr -d ' ')"
# A load that found nothing matches itself and proves nothing.
if [[ "$ITEMS" -eq 0 ]]; then
  cr_error "the load found no curated video item, so it cannot show the renames are safe."
elif ! cmp -s "${WORK}/before.tsv" "${WORK}/after.tsv"; then
  cr_error "the load after renaming differs from the load before it; restore the curated tree with git."
  echo "Items that differ (first 20):" >&2
  comm -3 "${WORK}/before.tsv" "${WORK}/after.tsv" > "${WORK}/differs.tsv"
  head -20 "${WORK}/differs.tsv" >&2
else
  cr_proved "all ${ITEMS} curated video items load after renaming, with the same ids and hashtags as before"
fi

if "$PYTHON" "$HELPER" plan --curated-dir "$CURATED" > "${WORK}/replan.tsv" 2> "${WORK}/replan.err" \
  && [[ ! -s "${WORK}/replan.tsv" ]]; then
  cr_proved "${COUNT} sidecar file(s) renamed; no prefix is left to fold"
else
  cr_error "a second plan still lists renames or refuses; see ${WORK}/replan.err"
fi
cr_unproved "the renames are not committed; review them with git status on the curated tree"
cr_finish
