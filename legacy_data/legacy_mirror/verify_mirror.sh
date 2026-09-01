#!/usr/bin/env bash
#
# Check a finished capture against everything the archive promises. Read-only:
# it never writes into the capture. Exit status is 0 only when every check
# passed, so it can gate a publish.
#
# The verification has to be given the same inputs the crawl ran with, or it
# quietly checks less than it appears to. The three ancestor-walk exclusion
# lists come from the same places create_mirror.sh takes them from (the
# verifier auto-loads the fourth, exact-match one itself, the same as a real
# crawl does), and the personal details
# come out of create_mirror.sh itself, which is the single home for them and
# is not committed. Anything missing is reported and skipped rather than
# silently passing.
#
#   ./verify_mirror.sh                 # the capture beside this script
#   ./verify_mirror.sh --examples 20   # more offending paths per failed check
#   ./verify_mirror.sh --mirror DIR    # some other capture
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/../footbag_venv/bin/python"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
VERIFIER="$SCRIPT_DIR/scripts/verify_archive_tree.py"
CRAWL_WRAPPER="$SCRIPT_DIR/create_mirror.sh"

GROUP_EXCLUSIONS="$REPO_ROOT/footbag_private_repo/private-custody/ifpa-group-files/CRAWL_EXCLUSIONS.txt"
MEMBER_EXCLUSIONS="$SCRIPT_DIR/member_area_exclusions.txt"
SUPERSEDED_EXCLUSIONS="$SCRIPT_DIR/superseded_feature_exclusions.txt"

if [[ ! -x "$VENV_PYTHON" ]]; then
    echo "Error: venv python not found at $VENV_PYTHON" >&2
    exit 1
fi

ARGS=()
for list in "$GROUP_EXCLUSIONS" "$MEMBER_EXCLUSIONS" "$SUPERSEDED_EXCLUSIONS"; do
    if [[ -f "$list" ]]; then
        ARGS+=(--exclusion-list "$list")
    else
        echo "Note: exclusion list not found, its surfaces go unchecked: $list" >&2
    fi
done

# The values live in the crawl wrapper because they are personal data that is
# never committed. Read them out rather than keeping a second copy here, which
# would drift the moment one of them changes.
if [[ -f "$CRAWL_WRAPPER" ]]; then
    FOOTBAG_MIRROR_REDACT="$(
        sed -n '/^export FOOTBAG_MIRROR_REDACT="/,/"$/p' "$CRAWL_WRAPPER" \
            | sed '1s/^export FOOTBAG_MIRROR_REDACT="//; $s/"$//'
    )"
    export FOOTBAG_MIRROR_REDACT
else
    echo "Note: $CRAWL_WRAPPER not found, so the personal-detail check is skipped." >&2
fi

exec "$VENV_PYTHON" "$VERIFIER" "${ARGS[@]}" "$@"
