#!/usr/bin/env bash
# scripts/bump-tool.sh -- moves one pinned tool in ops/tool-versions.env.
#
# Why this exists: patching is a decision the maintainer makes, and each bump
# has to change a version, its download address and its digest together, and
# every other copy of that version in the repository with them. Done by hand,
# one of those is the one forgotten. This makes the change in one step and
# refuses to make it while any copy still holds the old version.
#
# What it does: reads <KEY> (a *_VERSION key, or a key that holds only a
# version) and scans the repository for every other copy of the old version,
# showing what it finds. It derives the new download address by replacing the
# old version in the old address, downloads it twice, computes its digest with
# the algorithm the key already uses (SHA-256 or SHA3-256) and requires both
# downloads to agree, and shows the change as a diff. With --apply, and only
# once the scan has found no other copy, it writes the list.
#
# Two keys carry more than a version:
#   - PYTHON_VERSION: its address also names the python-build-standalone release
#     date that carries the build. Pass it with --python-build <YYYYMMDD>; it is
#     never guessed, because the same version is published under several dates.
#   - AMAZON_LINUX_RELEASE: AMAZONLINUX_IMAGE moves with it, to the tag
#     amazonlinux:<release>.0 and the index digest the registry lists for that
#     tag, read now. DOCKER_ENGINE_HOST is what the release serves; this does
#     not move it, and scripts/check-versions.sh says whether it must.
#
# What it refuses to do:
#   - Write without --apply. A run without it shows the scan, the diff, and
#     changes nothing.
#   - Write while another copy of the old version remains outside tests/; move
#     each one first, then re-run.
#   - Move SQLITE_VERSION. That pin follows the engine better-sqlite3 bundles and
#     carries two source digests; it moves with the npm bump, by hand.
#   - Accept a download it could not fetch, two downloads that differ, an image
#     digest it could not resolve, or a key the list does not hold.
#   - Move PYTHON_VERSION without --python-build.
#   - Call a key "already" at its version while an earlier half-done bump of it
#     left copies of the committed value behind.
#
# A digest computed here holds the download to the file fetched today. Where
# the publisher lists a digest, compare it with the one this prints before
# committing; that comparison is what ties the file to its publisher.
#
# Usage:
#   bash scripts/bump-tool.sh <KEY> <new-version> [--apply] [--python-build <YYYYMMDD>]
#
# Test seams, each announced on stderr:
#   FOOTBAG_TOOL_VERSIONS  the list to read and write (the reader's own seam)
#   FOOTBAG_BUMP_FETCH     replaces curl: called as <cmd> <url> <out-file>
#   FOOTBAG_BUMP_DOCKER    replaces docker for resolving an image tag's digest
#   FOOTBAG_BUMP_ROOT      the tree scanned for other copies
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"

usage() { sed -n '/^# Usage:/,/^# Test seams/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

KEY="" NEW="" APPLY=0 PY_BUILD=""
while (( $# )); do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --python-build) [[ -n "${2:-}" ]] || { cr_error "--python-build needs a date (YYYYMMDD)."; exit 2; }; PY_BUILD="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) cr_error "unknown flag: $1"; usage; exit 2 ;;
    *) if [[ -z "$KEY" ]]; then KEY="$1"; elif [[ -z "$NEW" ]]; then NEW="$1"; else cr_error "unexpected argument: $1"; exit 2; fi; shift ;;
  esac
done
[[ -n "$KEY" && -n "$NEW" ]] || { usage; cr_error "a key and a new version are both required."; exit 2; }
[[ "$NEW" =~ ^[A-Za-z0-9._:~+-]+$ ]] || { cr_error "'${NEW}' is not a version string."; exit 2; }
if [[ "$KEY" == SQLITE_VERSION ]]; then
  cr_die "SQLITE_VERSION follows the engine better-sqlite3 bundles and carries two source digests; move it with that npm bump, by hand. Nothing changed."
fi
if [[ "$KEY" == PYTHON_VERSION ]]; then
  [[ -n "$PY_BUILD" ]] || { cr_error "PYTHON_VERSION needs --python-build <YYYYMMDD>, the python-build-standalone release date that carries ${NEW}. Nothing changed."; exit 2; }
  [[ "$PY_BUILD" =~ ^[0-9]{8}$ ]] || { cr_error "--python-build '${PY_BUILD}' is not a date (YYYYMMDD). Nothing changed."; exit 2; }
elif [[ -n "$PY_BUILD" ]]; then
  cr_error "--python-build is for PYTHON_VERSION only. Nothing changed."
  exit 2
fi

FETCH="${FOOTBAG_BUMP_FETCH:-}"
if [[ -n "$FETCH" ]]; then
  echo "SYNTHETIC: FOOTBAG_BUMP_FETCH is set; downloads are stand-ins." >&2
  cr_unproved "that the digest is the publisher's file: FOOTBAG_BUMP_FETCH stood in for the download"
fi
DOCKER="${FOOTBAG_BUMP_DOCKER:-docker}"
if [[ -n "${FOOTBAG_BUMP_DOCKER:-}" ]]; then
  echo "SYNTHETIC: FOOTBAG_BUMP_DOCKER is set; image digests are stand-ins." >&2
  cr_unproved "that an image digest is the registry's: FOOTBAG_BUMP_DOCKER stood in for docker"
fi
SCAN_ROOT="${FOOTBAG_BUMP_ROOT:-$REPO_ROOT}"
[[ -n "${FOOTBAG_BUMP_ROOT:-}" ]] && echo "SYNTHETIC: FOOTBAG_BUMP_ROOT is set; scanning ${SCAN_ROOT}." >&2

WORK="$(mktemp -d)"
cr_cleanup rm -rf "$WORK"

# Every other copy of a value, in the places a copy of a pin can live: the
# deploy and build surfaces, the application, the tests, the other pin files
# (ops/, .nvmrc, .python-version), never the data trees. The value itself is
# matched, not a line that also names the tool, because a copy rarely names it
# (terraform's required_version, a script's IMAGE_VERSION=), and so every key
# form is caught however the line spells the tool. Two things keep false
# positives manageable: the match is bounded, so 4.2.1 does not match 4.2.10 or
# 14.2.1, and vendored trees (.venv, node_modules, .terraform), which carry
# other projects' version numbers, are not read. A value pinned with a leading v
# (v9.4.0) is also looked for without it, the form most tools print. Copies under
# tests/ are reported as warnings, not errors: a test's fixture usually holds its
# own stand-in values and keeps passing after a bump, so the list is shown for
# the maintainer to judge rather than blocking the write. The list itself is
# never a copy.
# Sets STALE (errors) and STALE_TESTS (warnings). Returns 1 when the scan could
# not read its tree.
STALE="" STALE_TESTS=""
scan_for() {
  local old="$1" forms=("$1") paths=() p re hits rc=0 list_real
  [[ "$old" =~ ^v[0-9] ]] && forms+=("${old#v}")
  for p in scripts .github docker terraform package.json ops src tests .nvmrc .python-version; do
    [[ -e "${SCAN_ROOT}/${p}" ]] && paths+=("${SCAN_ROOT}/${p}")
  done
  STALE="" STALE_TESTS=""
  (( ${#paths[@]} )) || { cr_error "the scan found none of its paths under ${SCAN_ROOT}"; return 1; }
  re=""
  for p in "${forms[@]}"; do
    re+="${re:+|}$(printf '%s' "$p" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"
  done
  re="(^|[^0-9.])(${re})(\$|[^0-9A-Za-z.]|\\.([^0-9]|\$))"
  hits="$(grep -rnIE --exclude-dir=.venv --exclude-dir=node_modules --exclude-dir=.terraform \
            -e "$re" -- "${paths[@]}" 2>"${WORK}/scan.err")" || rc=$?
  if (( rc > 1 )); then
    cr_error "the copy scan could not read its tree: $(tail -n 1 "${WORK}/scan.err")"
    return 1
  fi
  list_real="$(realpath "$TOOL_VERSIONS")"
  while IFS= read -r p; do
    [[ -n "$p" ]] || continue
    [[ "$(realpath "${p%%:*}")" == "$list_real" ]] && continue
    [[ "${p%%:*}" == "${SCAN_ROOT}/ops/tool-versions.env" ]] && continue
    if [[ "$p" == "${SCAN_ROOT}/tests/"* ]]; then
      STALE_TESTS+="${p#"${SCAN_ROOT}/"}"$'\n'
    else
      STALE+="${p#"${SCAN_ROOT}/"}"$'\n'
    fi
  done <<< "$hits"
  return 0
}

# show_scan <old> <kind>: lists what the scan found; <kind> is error or warn for
# the copies outside tests/.
show_scan() {
  local old="$1" kind="$2" line
  if [[ -n "$STALE" ]]; then
    echo "--- other copies of ${old} outside tests/:" >&2
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      if [[ "$kind" == error ]]; then cr_error "still holds ${old}: ${line}"; else cr_warn "still holds ${old}: ${line}"; fi
    done <<< "$STALE"
  fi
  if [[ -n "$STALE_TESTS" ]]; then
    echo "--- copies of ${old} under tests/ (fixtures usually stand alone; move any that stand for the pin):" >&2
    while IFS= read -r line; do
      [[ -n "$line" ]] && cr_warn "a test holds ${old}: ${line}"
    done <<< "$STALE_TESTS"
  fi
  return 0
}

tool_pin "$KEY" || cr_die "${KEY} is not in ${TOOL_VERSIONS}."
OLD="$TOOL_PIN_VALUE"

# Already at the version. A re-run after a half-done bump lands here with the
# list moved and copies left behind, so the committed list's value, where it
# differs, is what is scanned for: a half-done bump has not been committed.
if [[ "$OLD" == "$NEW" ]]; then
  committed=""
  if committed_list="$(git -C "$(dirname "$TOOL_VERSIONS")" show "HEAD:./$(basename "$TOOL_VERSIONS")" 2>"${WORK}/git.err")"; then
    committed="$(printf '%s\n' "$committed_list" | sed -n "s/^${KEY}=//p" | tail -1)"
  else
    cr_warn "no committed copy of the list to compare with ($(tail -n 1 "${WORK}/git.err")), so a half-done earlier bump of ${KEY} cannot be detected"
  fi
  if [[ -n "$committed" && "$committed" != "$NEW" ]]; then
    echo "==> ${KEY} is ${NEW} in the list but ${committed} in the committed list; scanning for ${committed}"
    if scan_for "$committed"; then
      show_scan "$committed" error
      if [[ -z "$STALE" ]]; then
        cr_proved "no copy of ${committed} remains outside tests/"
      fi
    fi
  fi
  echo "${KEY} is already ${NEW}; nothing to write."
  cr_proved "${KEY} is ${NEW} in the list"
  cr_finish
fi

PREFIX="${KEY%_VERSION}"
URL_KEY="" DIGEST_KEY="" ALGO="" OLD_URL=""
if [[ "$PREFIX" != "$KEY" ]] && tool_pin "${PREFIX}_URL" 2>/dev/null; then
  URL_KEY="${PREFIX}_URL"; OLD_URL="$TOOL_PIN_VALUE"
  if tool_pin "${PREFIX}_SHA3_256" 2>/dev/null; then DIGEST_KEY="${PREFIX}_SHA3_256"; ALGO=sha3-256
  elif tool_pin "${PREFIX}_SHA256" 2>/dev/null; then DIGEST_KEY="${PREFIX}_SHA256"; ALGO=sha256
  fi
fi

# The scan comes first, against the old value, so nothing is fetched or
# written for a bump that cannot finish.
echo "==> Scanning for other copies of ${OLD}"
scan_for "$OLD" || exit 1
if (( APPLY )); then show_scan "$OLD" error; else show_scan "$OLD" warn; fi

NEXT="${WORK}/tool-versions.env"
cp "$TOOL_VERSIONS" "$NEXT"

set_key() {
  local k="$1" v="$2" tmp="${WORK}/set" line
  grep -qE "^${k}=" "$NEXT" || cr_die "${k} is not in the list. Nothing written."
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${k}="* ]]; then printf '%s=%s\n' "$k" "$v"; else printf '%s\n' "$line"; fi
  done < "$NEXT" > "$tmp"
  mv "$tmp" "$NEXT"
}

# fetch_digest <url> <n>: downloads into the work directory and prints the
# digest, or nothing when the download or the digest failed.
fetch_digest() {
  local url="$1" out="${WORK}/artifact.$2"
  if [[ -n "$FETCH" ]]; then
    "$FETCH" "$url" "$out" || return 1
  else
    curl -fsSL "$url" -o "$out" || return 1
  fi
  openssl dgst "-${ALGO}" "$out" | sed 's/^.*= //'
}

set_key "$KEY" "$NEW"
if [[ -n "$URL_KEY" ]]; then
  NEW_URL="${OLD_URL//"$OLD"/"$NEW"}"
  [[ "$NEW_URL" != "$OLD_URL" ]] || cr_die "${URL_KEY} does not contain ${OLD}, so the new address cannot be derived; set it by hand. Nothing written."
  if [[ "$KEY" == PYTHON_VERSION ]]; then
    [[ "$OLD_URL" =~ /download/([0-9]{8})/ ]] \
      || cr_die "${URL_KEY} names no release date (/download/YYYYMMDD/), so --python-build cannot be applied; set it by hand. Nothing written."
    NEW_URL="${NEW_URL//"${BASH_REMATCH[1]}"/"$PY_BUILD"}"
  fi
  set_key "$URL_KEY" "$NEW_URL"
  if [[ -n "$DIGEST_KEY" ]]; then
    # Downloaded twice: a digest is only worth pinning if the address serves the
    # same bytes each time, so a moving or interrupted download is refused.
    first="$(fetch_digest "$NEW_URL" 1)" || cr_die "could not download ${NEW_URL}; nothing written."
    second="$(fetch_digest "$NEW_URL" 2)" || cr_die "could not download ${NEW_URL} a second time; nothing written."
    [[ "$first" =~ ^[0-9a-f]{64}$ ]] || cr_die "could not compute the ${ALGO} digest; nothing written."
    [[ "$first" == "$second" ]] \
      || cr_die "two downloads of ${NEW_URL} differ (${first} and ${second}), so neither digest can be pinned; nothing written."
    set_key "$DIGEST_KEY" "$first"
    echo "${DIGEST_KEY} computed from two matching downloads: ${first}"
    echo "Compare it with the publisher's listed digest, where one is published, before committing."
    cr_proved "${DIGEST_KEY} is the digest of two downloads that agree"
  fi
fi

if [[ "$KEY" == AMAZON_LINUX_RELEASE ]]; then
  # The image the advisory scan and the release query read moves with the
  # release, pinned by the index digest the registry lists for its tag now. A
  # digest that cannot be read is refused rather than the old one carried.
  tag="amazonlinux:${NEW}.0"
  manifest="$("$DOCKER" buildx imagetools inspect "$tag" --format '{{json .Manifest}}' 2>"${WORK}/docker.err")" \
    || cr_die "could not resolve ${tag}: $(tail -n 1 "${WORK}/docker.err"). Nothing written."
  digest="$(printf '%s' "$manifest" | jq -r '.digest // empty' 2>"${WORK}/jq.err")" \
    || cr_die "could not read the digest of ${tag}: $(tail -n 1 "${WORK}/jq.err"). Nothing written."
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || cr_die "the registry gave no index digest for ${tag}, so AMAZONLINUX_IMAGE cannot move with the release. Nothing written."
  set_key AMAZONLINUX_IMAGE "${tag}@${digest}"
  cr_proved "AMAZONLINUX_IMAGE moves to ${tag}, at the digest the registry lists for it"
  cr_unproved "that DOCKER_ENGINE_HOST is what ${NEW} serves: scripts/check-versions.sh asks the release"
fi

echo "--- change to ${TOOL_VERSIONS}"
diff -u "$TOOL_VERSIONS" "$NEXT" || [[ $? == 1 ]]

if [[ -n "$STALE" ]]; then
  if (( APPLY )); then
    echo "Nothing written: move each copy listed above to ${NEW}, then re-run." >&2
    cr_unproved "the bump: other copies of ${OLD} remain"
  else
    cr_unproved "that --apply would write: other copies of ${OLD} remain; move them first"
  fi
  cr_finish
fi
cr_proved "no copy of ${OLD} remains outside tests/"

if (( ! APPLY )); then
  echo "Dry run: nothing written. Re-run with --apply to write it."
  cr_unproved "the list: a dry run writes nothing"
  cr_finish
fi
cat "$NEXT" > "$TOOL_VERSIONS"
echo "==> ${KEY} moved from ${OLD} to ${NEW} in the list"
cr_proved "${KEY} moved from ${OLD} to ${NEW} in ${TOOL_VERSIONS}"
cr_finish
