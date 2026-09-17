#!/usr/bin/env bash
# setup_private_repo.sh
#
# Wires this checkout to the companion operations checkout: the two repo-root
# symlinks and the five Terraform values-file symlinks.
#
# WHY THIS EXISTS.
#
# These links were hand-typed `ln -s` commands in an onboarding
# document, and onboarding wired two of them. The other five are the ones that
# matter for AWS work, and every failure mode they have is silent:
#
#   - a missing values link means terraform reads no variables for that
#     environment and fails with a message about undeclared variables, naming
#     nothing about a link;
#   - a link pointing at a file the private checkout does not have looks
#     perfectly healthy in `ls -l` and fails only when terraform reads it;
#   - a link created from the wrong directory resolves to nothing, because the
#     targets are relative by design;
#   - and a real values file sitting where a link belongs is somebody's local
#     edit that a careless `ln -sf` would destroy without asking.
#
# The targets are deliberately relative and go through the `footbag_private_repo`
# link rather than to wherever the private checkout actually sits, so the five
# values links are identical on every machine and only one link is
# machine-specific. That is worth preserving, and it is the part most easily got
# wrong by hand.
#
# WHAT IT REFUSES TO DO.
#
#   - Replace a regular file with a link. A real file at one of these paths is
#     somebody's values file, and it is not this script's to destroy. It is
#     reported and the run stops.
#   - Create a link whose target does not exist. A broken link is worse than an
#     absent one: it passes every casual check and fails at terraform.
#   - Edit `.claude/settings.local.json`. That is the harness's own file, the
#     human applies harness changes, and the exact command is printed instead.
#   - Touch anything without showing you the plan first and taking a typed
#     confirmation.
#
# Idempotent. A re-run over a correctly wired tree changes nothing and says so.
# An interrupted run leaves whatever links it had already made, which is a
# partially wired tree that a re-run completes; there is nothing to undo,
# because a correct link is correct whether or not its siblings exist yet.
#
# Usage:
#   bash scripts/setup_private_repo.sh --private-repo ../ops
#   bash scripts/setup_private_repo.sh --private-repo ../ops \
#     --legacy-repo ../legacy
#   bash scripts/setup_private_repo.sh --check
#
# Flags:
#   --private-repo <path>  The companion operations checkout. Required unless
#                          --check, or unless the root link already points at a
#                          directory, in which case that is reused.
#   --legacy-repo <path>   The read-only legacy site clone. Optional: it is
#                          needed only for historical-pipeline work, and a
#                          developer without it is a supported configuration.
#   --check                Report the state of every link this run considers and
#                          exit: the six an ordinary operator wires, plus the
#                          legacy-clone link only when --legacy-repo is given, so
#                          a bare --check reports six. Changes
#                          nothing, takes no confirmation, and exits non-zero if
#                          any link is missing, broken or blocked.
#   --yes                  Accept the typed confirmation in advance.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

PRIVATE_REPO=""
LEGACY_REPO=""
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --private-repo)
      PRIVATE_REPO="${2:-}"
      shift 2 || { echo "ERROR: --private-repo requires a path" >&2; exit 2; }
      ;;
    --legacy-repo)
      LEGACY_REPO="${2:-}"
      shift 2 || { echo "ERROR: --legacy-repo requires a path" >&2; exit 2; }
      ;;
    --check) CHECK_ONLY=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

cd "$REPO_ROOT"

# ── The link set ─────────────────────────────────────────────────────────────
#
# One entry per line, "<path-relative-to-repo-root>|<target>". The five values
# links have fixed targets because they resolve through the root link; only the
# two root links vary by machine.
VALUES_LINKS=(
  "terraform/staging/terraform.tfvars|../../footbag_private_repo/terraform/staging.tfvars"
  "terraform/staging/secrets.auto.tfvars|../../footbag_private_repo/terraform/staging.secrets.auto.tfvars"
  "terraform/production/terraform.tfvars|../../footbag_private_repo/terraform/production.tfvars"
  "terraform/production/secrets.auto.tfvars|../../footbag_private_repo/terraform/production.secrets.auto.tfvars"
  "terraform/shared/terraform.tfvars|../../footbag_private_repo/terraform/shared.tfvars"
)

# If no private repo was named and the root link already points somewhere real,
# reuse it. Re-running after the first setup should not require re-typing a path
# the tree already records.
if [[ -z "$PRIVATE_REPO" && -L "footbag_private_repo" && -d "footbag_private_repo" ]]; then
  PRIVATE_REPO="$(readlink -- "footbag_private_repo")"
fi

if [[ -z "$PRIVATE_REPO" && "$CHECK_ONLY" -eq 0 ]]; then
  echo "ERROR: --private-repo is required, and there is no default." >&2
  echo "       Where the companion checkout lives is a property of this" >&2
  echo "       machine, and guessing at it is how a link comes to point at" >&2
  echo "       nothing. Clone it as a sibling and name it:" >&2
  echo "         bash scripts/setup_private_repo.sh --private-repo ../ops" >&2
  exit 2
fi

# ── State of one link ────────────────────────────────────────────────────────
#
# OK       a symlink already pointing where it should
# MISSING  nothing there
# WRONG    a symlink pointing somewhere else
# BROKEN   a symlink pointing at something that does not exist
# BLOCKED  a regular file or directory, which is never ours to replace
link_state() {
  local path="$1" want="$2" have
  if [[ -L "$path" ]]; then
    have="$(readlink -- "$path")"
    if [[ "$have" != "$want" ]]; then
      echo "WRONG"
    elif [[ ! -e "$path" ]]; then
      echo "BROKEN"
    else
      echo "OK"
    fi
  elif [[ -e "$path" ]]; then
    echo "BLOCKED"
  else
    echo "MISSING"
  fi
}

# ── Build the plan ───────────────────────────────────────────────────────────
PLAN=()
BLOCKED=()
PROBLEMS=0
OK_COUNT=0

consider() {
  local path="$1" want="$2" state
  state="$(link_state "$path" "$want")"
  case "$state" in
    OK)
      OK_COUNT=$((OK_COUNT + 1))
      printf '  ok       %s\n' "$path"
      ;;
    BLOCKED)
      BLOCKED+=("$path")
      PROBLEMS=$((PROBLEMS + 1))
      printf '  BLOCKED  %s (a real file or directory, not a link)\n' "$path"
      ;;
    WRONG)
      PLAN+=("${path}|${want}")
      PROBLEMS=$((PROBLEMS + 1))
      printf '  repoint  %s\n             from %s\n             to   %s\n' \
        "$path" "$(readlink -- "$path")" "$want"
      ;;
    BROKEN)
      PLAN+=("${path}|${want}")
      PROBLEMS=$((PROBLEMS + 1))
      printf '  rebuild  %s (points at %s, which does not exist)\n' "$path" "$want"
      ;;
    MISSING)
      PLAN+=("${path}|${want}")
      PROBLEMS=$((PROBLEMS + 1))
      printf '  create   %s -> %s\n' "$path" "$want"
      ;;
  esac
}

echo "Companion checkout wiring for ${REPO_ROOT}"
echo ""

[[ -n "$PRIVATE_REPO" ]] && consider "footbag_private_repo" "$PRIVATE_REPO"
[[ -n "$LEGACY_REPO" ]] && consider "footbag_legacy_repo" "$LEGACY_REPO"

for entry in "${VALUES_LINKS[@]}"; do
  consider "${entry%%|*}" "${entry##*|}"
done

echo ""

# ── Refusals ─────────────────────────────────────────────────────────────────
if [[ "${#BLOCKED[@]}" -gt 0 ]]; then
  echo "REFUSING: a real file or directory sits where a link belongs:" >&2
  printf '  %s\n' "${BLOCKED[@]}" >&2
  echo "" >&2
  echo "       That is somebody's own values file, and replacing it would" >&2
  echo "       destroy an edit this script knows nothing about. Move it aside" >&2
  echo "       yourself, confirm the private checkout carries the value it" >&2
  echo "       held, then re-run. Nothing has been changed." >&2
  exit 1
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  if [[ "$PROBLEMS" -eq 0 ]]; then
    echo "All ${OK_COUNT} links are wired and resolve."
    exit 0
  fi
  echo "${PROBLEMS} link(s) need attention; re-run without --check to fix them." >&2
  exit 1
fi

if [[ "$PROBLEMS" -eq 0 ]]; then
  echo "Already wired: all ${OK_COUNT} links present and resolving. Nothing to do."
  exit 0
fi

# The private checkout has to actually carry the files, or every link this makes
# is a broken one that passes `ls -l` and fails at terraform.
if [[ ! -d "$PRIVATE_REPO" ]]; then
  echo "ERROR: ${PRIVATE_REPO} is not a directory." >&2
  exit 1
fi

# The legacy checkout gets the same check. It did not, so a typo in its path
# produced a dangling link that the verification then failed on -- leaving the
# broken link behind, which is precisely the state the header promises never to
# create. Checked here, before anything is written.
if [[ -n "$LEGACY_REPO" && ! -d "$LEGACY_REPO" ]]; then
  echo "ERROR: ${LEGACY_REPO} is not a directory." >&2
  echo "       A link to it would resolve to nothing, pass every casual check," >&2
  echo "       and fail only when something reads through it. Nothing done." >&2
  exit 1
fi

MISSING_TARGETS=()
for entry in "${VALUES_LINKS[@]}"; do
  target="${entry##*|}"
  # Strip the leading ../../ and the root-link name to get the path inside the
  # private checkout, which is what has to exist.
  inner="${target#../../footbag_private_repo/}"
  [[ -e "${PRIVATE_REPO}/${inner}" ]] || MISSING_TARGETS+=("$inner")
done

if [[ "${#MISSING_TARGETS[@]}" -gt 0 ]]; then
  echo "REFUSING: the companion checkout does not carry these files:" >&2
  printf '  %s\n' "${MISSING_TARGETS[@]}" >&2
  echo "" >&2
  echo "       Linking to them anyway produces links that look healthy and" >&2
  echo "       fail only when terraform reads them, which is the failure this" >&2
  echo "       script exists to prevent. Check the checkout is current" >&2
  echo "       (git -C ${PRIVATE_REPO} pull) and that you have the access that" >&2
  echo "       carries these files. Nothing has been changed." >&2
  exit 1
fi

if ! confirm_from_tty "Type 'APPLY' to wire these links: " "APPLY"; then
  echo "Not confirmed; nothing has been changed." >&2
  exit 1
fi

# ── Apply ────────────────────────────────────────────────────────────────────
for entry in "${PLAN[@]}"; do
  path="${entry%%|*}"
  want="${entry##*|}"
  mkdir -p -- "$(dirname -- "$path")"
  # -n so an existing link is replaced rather than followed, which would
  # otherwise create the new link INSIDE the directory the old one points at.
  ln -sfn -- "$want" "$path"
  echo "    wired ${path}"
done

# ── Verify the outcome, not the invocation ───────────────────────────────────
echo ""
echo "==> Verifying every link resolves"
FAILED=0
verify_one() {
  local path="$1"
  if [[ ! -L "$path" ]]; then
    echo "  FAIL ${path}: not a symlink after wiring" >&2
    FAILED=1
  elif [[ ! -e "$path" ]]; then
    echo "  FAIL ${path}: resolves to nothing (-> $(readlink -- "$path"))" >&2
    FAILED=1
  else
    echo "    ${path}"
  fi
}

[[ -n "$PRIVATE_REPO" ]] && verify_one "footbag_private_repo"
[[ -n "$LEGACY_REPO" ]] && verify_one "footbag_legacy_repo"
for entry in "${VALUES_LINKS[@]}"; do
  verify_one "${entry%%|*}"
done

if (( FAILED )); then
  echo "" >&2
  echo "ERROR: at least one link does not resolve. A link that resolves to" >&2
  echo "       nothing passes every casual check and fails at terraform." >&2
  exit 1
fi

# ── The one thing this does not wire ─────────────────────────────────────────
SETTINGS=".claude/settings.local.json"
echo ""
if [[ -f "$SETTINGS" ]] && grep -q 'FOOTBAG_PRIVATE_REPO' "$SETTINGS"; then
  echo "Tracker slug already present in ${SETTINGS}."
else
  echo "One thing left, and it is yours rather than this script's: the tracker"
  echo "slug in ${SETTINGS}. That is the harness's own configuration file, which"
  echo "a human applies rather than a script. Merge this into its top-level"
  echo "object, keeping whatever else is already there:"
  echo ""
  echo '  "env": { "FOOTBAG_PRIVATE_REPO": "<owner>/<repo>" }'
  echo ""
  echo "Without it, tracker reads are skipped with a one-line notice and"
  echo "everything else continues; it is not a prerequisite for the links above."
fi

echo ""
echo "Wired. Re-run with --check any time to confirm nothing has drifted."
