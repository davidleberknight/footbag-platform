#!/usr/bin/env bash
# terraform-apply-all.sh -- apply every Terraform tree one environment depends on,
# in the order they depend on each other, so nothing pending is left behind.
#
# WHY THIS EXISTS.
#
# The apply wrapper takes one tree at a time, and an environment stands on three:
# the shared tree, which holds the state bucket every tree's state lives in and
# the account's own controls; the identity tree, which declares the dev-and-tester
# role that staging's runtime trust names; and the environment's own tree. Applied
# by hand, the two account trees are the ones forgotten, because nothing an
# operator does day to day plans them and no deploy checks them. A change
# committed to either then sits unapplied until somebody happens to look. This is
# the one command that leaves nothing pending, and the first step a from-scratch
# host rebuild runs.
#
# ORDER: shared, then identity, then the environment. Shared first because every
# other tree keeps its state in the bucket it owns. Identity before the
# environment because staging's runtime trust names the dev-and-tester role, and
# AWS refuses a trust policy naming a role that does not exist. Production does
# not depend on identity, and identity is still applied on a production run: the
# purpose is that nothing is left pending, and a clean tree costs one plan and no
# prompt.
#
# Each tree goes through scripts/terraform-apply.sh with --init and
# --skip-empty-plan. Every plan is printed in full and every tree with changes
# takes its own typed APPLY, so one command never applies a tree its operator did
# not read. A tree with nothing pending ends without a prompt. A failure or a
# declined confirmation stops the run at that tree; a re-run is safe, because a
# tree already applied plans empty and is passed over.
#
# WHAT IT REFUSES.
#
#   - Any target but one environment. The account trees are applied as part of an
#     environment's run, never named on their own here; for one tree alone, use
#     scripts/terraform-apply.sh.
#   - Bootstrapping an empty account. The first shared apply has nowhere to keep
#     its state, so it belongs to scripts/bootstrap-shared-state.sh. When the
#     shared step fails, the run stops and names that script's --check.
#   - Running as the dev-and-tester job role. That role cannot read the shared or
#     identity state, so the first plan fails before anything is applied.
#
# Usage:
#   bash scripts/terraform-apply-all.sh --target production
#   bash scripts/terraform-apply-all.sh --target staging --dry-run
#
#   --target   staging or production. Required, with no default.
#   --dry-run  states the trees and the order, and plans nothing.
#
# Exits 0 when every tree is applied or had nothing pending; otherwise the exit
# status of the tree that stopped the run.
#
# Test seams (CI only; operators never set these): none of its own. The apply
# wrapper's TERRAFORM_APPLY_BIN and the identity library's stubs pass through,
# and each announces itself on stderr.

set -euo pipefail

TARGET=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires a value" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      # The whole header, read to the first line that is not a comment, so the
      # tail with the exit contract and the seams is never cut off.
      sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "ERROR: --target is required (staging or production)." >&2
  exit 2
fi
if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be staging or production (got '$TARGET')." >&2
  echo "       The shared and identity trees are applied as part of an environment's" >&2
  echo "       run; for one tree alone, use scripts/terraform-apply.sh." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TREES=(shared identity "$TARGET")

if (( DRY_RUN )); then
  echo "Would run, in order, stopping at the first tree that does not finish:"
  step=1
  for tree in "${TREES[@]}"; do
    echo "  ${step}. bash scripts/terraform-apply.sh --target ${tree} --init --skip-empty-plan"
    step=$(( step + 1 ))
  done
  echo ""
  echo "Each tree with changes prints its plan and asks for its own typed APPLY;"
  echo "a tree with nothing pending ends without a prompt."
  exit 0
fi

declare -a SUMMARY=()
for i in "${!TREES[@]}"; do
  tree="${TREES[$i]}"
  echo ""
  echo "== Tree $(( i + 1 )) of ${#TREES[@]}: terraform/${tree} =="
  rc=0
  # Run on this script's own stdout and stderr, never through a pipe: the
  # wrapper asks for its typed APPLY only when its output is a terminal, so a
  # pipe here would turn every confirmation into a refusal.
  bash "$REPO_ROOT/scripts/terraform-apply.sh" --target "$tree" --init --skip-empty-plan || rc=$?
  if (( rc != 0 )); then
    echo "" >&2
    echo "ERROR: terraform/${tree} did not finish (exit ${rc}). The run stops here." >&2
    if (( ${#SUMMARY[@]} > 0 )); then
      printf '       Done before it: %s\n' "${SUMMARY[@]}" >&2
    fi
    remaining=("${TREES[@]:$i}")
    echo "       Not applied: ${remaining[*]}." >&2
    if [[ "$tree" == "shared" ]]; then
      echo "       On an account whose state bucket does not exist yet, the first" >&2
      echo "       shared apply is not this script's: bash scripts/bootstrap-shared-state.sh --check" >&2
    fi
    echo "       Re-run once resolved; a tree already applied plans empty and is passed over." >&2
    exit "$rc"
  fi
  SUMMARY+=("${tree}: finished")
done

echo ""
echo "== Every tree for ${TARGET} is applied =="
printf '  %s\n' "${SUMMARY[@]}"
