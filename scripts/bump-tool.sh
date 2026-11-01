#!/usr/bin/env bash
# scripts/bump-tool.sh -- moves one pinned tool in ops/tool-versions.env.
#
# Why this exists: patching is a decision the maintainer makes, and each bump
# has to change a version, its download address and its digest together, and
# every other copy of that version in the repository with them. Done by hand,
# one of those is the one forgotten. This makes the change in one step and
# refuses to call it done while any copy still holds the old version.
#
# What it does: reads <KEY> (a *_VERSION key, or a key that holds only a
# version), derives the new download address by replacing the old version in
# the old address, downloads it, computes its digest with the algorithm the key
# already uses (SHA-256 or SHA3-256), shows the change as a diff, and with
# --apply writes it. It then scans the repository for any other copy of the old
# version on a line that names the tool, and fails while one remains.
#
# What it refuses to do:
#   - Write without --apply. A run without it shows the diff and changes nothing.
#   - Move SQLITE_VERSION. That pin follows the engine better-sqlite3 bundles and
#     carries two source digests; it moves with the npm bump, by hand.
#   - Accept a download it could not fetch, or a key the list does not hold.
#   - Report success while another copy of the old version remains.
#
# A digest computed here holds the download to the file fetched today. Where
# the publisher lists a digest, compare it with the one this prints before
# committing; that comparison is what ties the file to its publisher.
#
# Usage:
#   bash scripts/bump-tool.sh <KEY> <new-version> [--apply]
#
# Test seams, each announced on stderr:
#   FOOTBAG_TOOL_VERSIONS  the list to read and write (the reader's own seam)
#   FOOTBAG_BUMP_FETCH     replaces curl: called as <cmd> <url> <out-file>
#   FOOTBAG_BUMP_ROOT      the tree scanned for other copies
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"

usage() { sed -n '/^# Usage:/,/^# Test seams/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

KEY="" NEW="" APPLY=0
while (( $# )); do
  case "$1" in
    --apply) APPLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "ERROR: unknown flag: $1" >&2; usage; exit 2 ;;
    *) if [[ -z "$KEY" ]]; then KEY="$1"; elif [[ -z "$NEW" ]]; then NEW="$1"; else echo "ERROR: unexpected argument: $1" >&2; exit 2; fi; shift ;;
  esac
done
[[ -n "$KEY" && -n "$NEW" ]] || { usage; exit 2; }
[[ "$NEW" =~ ^[A-Za-z0-9._:~+-]+$ ]] || { echo "ERROR: '${NEW}' is not a version string." >&2; exit 2; }
[[ "$KEY" == SQLITE_VERSION ]] && {
  echo "ERROR: SQLITE_VERSION follows the engine better-sqlite3 bundles and carries two source" >&2
  echo "       digests; move it with that npm bump, by hand. Nothing changed." >&2
  exit 1
}

FETCH="${FOOTBAG_BUMP_FETCH:-}"
[[ -n "$FETCH" ]] && echo "SYNTHETIC: FOOTBAG_BUMP_FETCH is set; downloads are stand-ins." >&2
SCAN_ROOT="${FOOTBAG_BUMP_ROOT:-$REPO_ROOT}"
[[ -n "${FOOTBAG_BUMP_ROOT:-}" ]] && echo "SYNTHETIC: FOOTBAG_BUMP_ROOT is set; scanning ${SCAN_ROOT}." >&2

tool_pin "$KEY" || exit 1
OLD="$TOOL_PIN_VALUE"
[[ "$OLD" != "$NEW" ]] || { echo "${KEY} is already ${NEW}; nothing to do."; exit 0; }

PREFIX="${KEY%_VERSION}"
URL_KEY="" DIGEST_KEY="" ALGO=""
if [[ "$PREFIX" != "$KEY" ]] && tool_pin "${PREFIX}_URL" 2>/dev/null; then
  URL_KEY="${PREFIX}_URL"; OLD_URL="$TOOL_PIN_VALUE"
  if tool_pin "${PREFIX}_SHA3_256" 2>/dev/null; then DIGEST_KEY="${PREFIX}_SHA3_256"; ALGO=sha3-256
  elif tool_pin "${PREFIX}_SHA256" 2>/dev/null; then DIGEST_KEY="${PREFIX}_SHA256"; ALGO=sha256
  fi
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM
NEXT="${WORK}/tool-versions.env"
cp "$TOOL_VERSIONS" "$NEXT"

set_key() {
  local k="$1" v="$2" tmp="${WORK}/set"
  grep -qE "^${k}=" "$NEXT" || { echo "ERROR: ${k} is not in the list." >&2; exit 1; }
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${k}="* ]]; then printf '%s=%s\n' "$k" "$v"; else printf '%s\n' "$line"; fi
  done < "$NEXT" > "$tmp"
  mv "$tmp" "$NEXT"
}

set_key "$KEY" "$NEW"
if [[ -n "$URL_KEY" ]]; then
  NEW_URL="${OLD_URL//"$OLD"/"$NEW"}"
  [[ "$NEW_URL" != "$OLD_URL" ]] || { echo "ERROR: ${URL_KEY} does not contain ${OLD}, so the new address cannot be derived; set it by hand." >&2; exit 1; }
  set_key "$URL_KEY" "$NEW_URL"
  if [[ -n "$DIGEST_KEY" ]]; then
    if [[ -n "$FETCH" ]]; then $FETCH "$NEW_URL" "${WORK}/artifact"; else curl -fsSL "$NEW_URL" -o "${WORK}/artifact"; fi \
      || { echo "ERROR: could not download ${NEW_URL}; nothing changed." >&2; exit 1; }
    DIGEST="$(openssl dgst "-${ALGO}" "${WORK}/artifact" | sed 's/^.*= //')"
    [[ "$DIGEST" =~ ^[0-9a-f]{64}$ ]] || { echo "ERROR: could not compute the ${ALGO} digest; nothing changed." >&2; exit 1; }
    set_key "$DIGEST_KEY" "$DIGEST"
    echo "${DIGEST_KEY} computed from the download: ${DIGEST}"
    echo "Compare it with the publisher's listed digest, where one is published, before committing."
  fi
fi

echo "--- change to ${TOOL_VERSIONS}"
diff -u "$TOOL_VERSIONS" "$NEXT" || true

if (( ! APPLY )); then
  echo "Dry run: nothing written. Re-run with --apply to write it."
  exit 0
fi
cat "$NEXT" > "$TOOL_VERSIONS"
echo "==> ${KEY} moved from ${OLD} to ${NEW} in the list"

# Every other copy of the old version on a line naming the tool. The tool's name
# is the key's prefix, lowercased; the scan reads the deploy and build surfaces,
# where a copy of a pin can live, never the data trees.
name="$(printf '%s' "$PREFIX" | tr 'A-Z_' 'a-z-')"
stale="$(grep -rnF -- "$OLD" "${SCAN_ROOT}/scripts" "${SCAN_ROOT}/.github" "${SCAN_ROOT}/docker" \
           "${SCAN_ROOT}/terraform" "${SCAN_ROOT}/package.json" 2>/dev/null \
         | grep -i -- "$name" || true)"
if [[ -n "$stale" ]]; then
  echo "ERROR: the bump is half done; these lines still hold ${OLD}:" >&2
  printf '%s\n' "$stale" | sed 's/^/  /' >&2
  echo "       The list is written; move each of these to ${NEW} in the same change." >&2
  exit 1
fi
echo "    no other copy of ${OLD} remains"
