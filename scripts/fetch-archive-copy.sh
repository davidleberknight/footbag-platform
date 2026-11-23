#!/usr/bin/env bash
# fetch-archive-copy.sh
#
# Fetches a developer's copy of production's Legacy Archive, whole or one key
# prefix of it, to a fixed place outside the repository. After go-live the
# production archive bucket is the source of truth, and an invited developer
# may hold a copy under the same controls as a database copy: the copy lands
# only on a machine whose disk the developer has attested is encrypted, and
# fetching a new copy deletes the one it replaces, so no machine accumulates
# old captures.
#
# Run it as the dev-and-tester job role, under your own name:
#   bash scripts/as-dev-tester.sh --account <your_name> \
#     bash scripts/fetch-archive-copy.sh [--prefix <key-prefix>]
# The role reads production's archive bucket and nothing else of production's,
# and the trail names the person who fetched.
#
# Where the copy goes: ~/.local/share/footbag/archive-copy, created mode 700.
# Fixed, never inside the checkout: a copy inside it is one `git add` away from
# a commit, and the capture's pages carry old member contact details.
#
# What it refuses to do:
#   - Run as anything but a session of the FootbagDevTester role carrying a
#     session name, proved by sts get-caller-identity.
#   - Fetch without the encrypted-disk attestation for this machine. The first
#     fetch on a machine asks for it at the terminal, once, and records it;
#     with no terminal and no record it refuses.
#   - Keep the previous copy. It is deleted, and its absence proved, before the
#     download starts; a prefix fetch replaces a whole copy too.
#   - Delete anything when the prefix matches no key: the refusal comes first.
#   - Write the copy inside the repository checkout.
#
# Usage:
#   bash scripts/fetch-archive-copy.sh                       # the whole archive
#   bash scripts/fetch-archive-copy.sh --prefix newsletters/ # one key prefix
#
# Flags:
#   --prefix <p>   Fetch only the keys beginning with <p>. Letters, digits and
#                  . _ - / only, no leading slash and no `..`.
#   -h, --help     This text.
#
# Test seam (CI only; developers never set this): FOOTBAG_AWS_BIN replaces the
# AWS CLI for the listing and the download, and the run says so on stderr,
# because a run through a stand-in proves nothing about the archive. The
# identity proof has its own seams in the shared identity library.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

PREFIX=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)
      PREFIX="${2:-}"
      shift 2 || { echo "ERROR: --prefix requires an argument" >&2; exit 2; }
      [[ -n "$PREFIX" ]] || { echo "ERROR: --prefix requires a non-empty argument" >&2; exit 2; }
      ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

# The prefix becomes a sync filter, where * ? [ are patterns, and a path under
# the copy's root, where .. climbs out of it, so both are kept out.
if [[ -n "$PREFIX" ]]; then
  if [[ ! "$PREFIX" =~ ^[A-Za-z0-9._-][A-Za-z0-9._/-]*$ || "$PREFIX" == *..* ]]; then
    echo "ERROR: --prefix must be letters, digits and . _ - / only, with no leading slash and no '..': ${PREFIX}" >&2
    exit 2
  fi
fi

# The AWS identity this run uses, proved rather than inherited.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/dev-copy-attestation.sh
source "${SCRIPT_DIR}/lib/dev-copy-attestation.sh"
# Every refusal and every problem the tools print is listed once in the closing
# report at the end; the exit status follows from it.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the archive." >&2

# Spelled out rather than read from terraform output: the role cannot read
# production's state, and the grant on the role names this same bucket, which
# the production tree names footbag-<environment>-archive.
SOURCE_BUCKET="footbag-production-archive"
COPY_ROOT="${HOME}/.local/share/footbag/archive-copy"

# ---- 1. Where the copy goes -----------------------------------------------------

# Resolved through any symlink on the way, so a link from the home directory
# into the checkout is caught as well as a home directory inside it. The check
# resolves the deepest folder that already exists and runs before anything is
# created, so a refused run leaves no folder behind inside the checkout.
copy_parent="${COPY_ROOT%/*}"
existing="$copy_parent"
missing=""
while [[ ! -d "$existing" ]]; do
  missing="/${existing##*/}${missing}"
  existing="${existing%/*}"
done
copy_parent_real="$(cd "$existing" && pwd -P)${missing}"
repo_real="$(cd "$REPO_ROOT" && pwd -P)"
if [[ "$copy_parent_real/" == "$repo_real/"* ]]; then
  cr_die "the copy would land inside the repository checkout (${copy_parent_real}); nothing was fetched"
fi
mkdir -p -m 700 "$copy_parent"
chmod 700 "$copy_parent"

# ---- 2. Identity --------------------------------------------------------------

aws_profile_ensure || cr_die "could not settle the AWS identity this run fetches as"
aws_identity_require_assumed_role "$FOOTBAG_DEV_TESTER_ROLE" \
  || cr_die "a developer's archive copy is fetched as the ${FOOTBAG_DEV_TESTER_ROLE} role, through scripts/as-dev-tester.sh"
echo "==> fetching as ${AWS_IDENTITY_SESSION_NAME}" >&2

# ---- 3. The encrypted-disk attestation -----------------------------------------

dev_copy_attestation_require "production's Legacy Archive" \
  || cr_die "no encrypted-disk attestation for this machine; nothing was fetched or deleted"

# ---- 4. What there is to fetch -------------------------------------------------

WORK_DIR="$(mktemp -d /tmp/footbag-fetch-archive.XXXXXX)"
cr_cleanup rm -rf "${WORK_DIR}"

# `aws s3 ls --recursive` lines are date, time, size, key; a key ending in a
# slash is a folder marker with no file behind it. A failed listing is not an
# empty archive, so it refuses with the CLI's own message.
if ! "$AWS_BIN" s3 ls "s3://${SOURCE_BUCKET}/${PREFIX}" --recursive > "${WORK_DIR}/listing.raw" 2> "${WORK_DIR}/listing.err"; then
  ls_said="$(grep -v '^[[:space:]]*$' "${WORK_DIR}/listing.err" | tail -n 1 || [[ $? == 1 ]])"
  # The CLI exits 1 on a listing that matched nothing and printed nothing, which
  # is the not-found answer rather than a failure.
  if [[ -n "$ls_said" || -s "${WORK_DIR}/listing.raw" ]]; then
    cr_die "could not list s3://${SOURCE_BUCKET}/${PREFIX}: ${ls_said:-the listing was cut short}; nothing was deleted"
  fi
fi
sed -nE 's/^[0-9-]+ [0-9:]+ +[0-9]+ (.*)$/\1/p' "${WORK_DIR}/listing.raw" \
  | { grep -v '/$' || [[ $? == 1 ]]; } \
  | LC_ALL=C sort > "${WORK_DIR}/expected.txt"
EXPECTED_COUNT="$(grep -c '' "${WORK_DIR}/expected.txt" || [[ $? == 1 ]])"
if [[ "$EXPECTED_COUNT" -eq 0 ]]; then
  cr_die "no key in s3://${SOURCE_BUCKET} begins with '${PREFIX}'; the previous copy was left as it was"
fi
echo "To fetch: ${EXPECTED_COUNT} object(s) from s3://${SOURCE_BUCKET}/${PREFIX}"

# ---- 5. The previous copy goes first ---------------------------------------------

if [[ -e "$COPY_ROOT" || -L "$COPY_ROOT" ]]; then
  previous_count="$(find "$COPY_ROOT" -type f | grep -c '' || [[ $? == 1 ]])"
  rm -rf -- "$COPY_ROOT"
  if [[ -e "$COPY_ROOT" || -L "$COPY_ROOT" ]]; then
    cr_die "the previous copy at ${COPY_ROOT} could not be deleted; nothing was fetched"
  fi
  echo "Previous copy deleted: ${previous_count} file(s) at ${COPY_ROOT}, and confirmed gone."
  cr_proved "the previous copy (${previous_count} file(s)) is deleted"
else
  echo "No previous copy at ${COPY_ROOT}."
fi
mkdir -m 700 "$COPY_ROOT"

# ---- 6. Download ------------------------------------------------------------------

FETCH_ARGS=(s3 sync "s3://${SOURCE_BUCKET}/" "${COPY_ROOT}/" --no-progress)
if [[ -n "$PREFIX" ]]; then
  FETCH_ARGS+=(--exclude "*" --include "${PREFIX}*")
fi
echo "Downloading to ${COPY_ROOT} ..."
fetch_rc=0
( umask 077; "$AWS_BIN" "${FETCH_ARGS[@]}" ) > "${WORK_DIR}/fetch.txt" 2>&1 || fetch_rc=$?
cr_harvest --errors '^download failed:|^fatal error:' --warnings '^warning:' "s3 sync" "${WORK_DIR}/fetch.txt"
if [[ "$fetch_rc" -ne 0 ]]; then
  cr_die "the download exited ${fetch_rc}; the copy at ${COPY_ROOT} is incomplete. Run this again to replace it."
fi

# ---- 7. The copy is what was listed ------------------------------------------------

( cd "$COPY_ROOT" && find . -type f | sed 's|^\./||' | LC_ALL=C sort ) > "${WORK_DIR}/fetched.txt"
if ! diff "${WORK_DIR}/expected.txt" "${WORK_DIR}/fetched.txt" > "${WORK_DIR}/diff.txt"; then
  echo "The copy differs from the listing (< listed, > on disk):" >&2
  head -20 "${WORK_DIR}/diff.txt" >&2
  cr_die "the copy at ${COPY_ROOT} does not hold exactly the listed keys: $(grep -c '^[<>]' "${WORK_DIR}/diff.txt") differing line(s)"
fi
# find's exact-mode test rather than stat, whose flags differ between Linux and
# macOS.
if [[ -z "$(find "$COPY_ROOT" -maxdepth 0 -perm 0700)" ]]; then
  cr_die "the copy's directory ${COPY_ROOT} is not mode 700"
fi
cr_proved "${COPY_ROOT} (mode 700) holds exactly the ${EXPECTED_COUNT} object(s) listed under s3://${SOURCE_BUCKET}/${PREFIX}"

echo "FETCH: ${EXPECTED_COUNT} object(s) of the Legacy Archive in ${COPY_ROOT}"
cr_finish
