#!/usr/bin/env bash
# Build guard: no non-test pipeline script may perform a live network fetch of a
# host that goes away at cutover (footbag.org and the honor-roster sites). The
# freestyle rebuild and the legacy pipeline must run from the committed snapshot
# and the local mirror, never the live internet, or they break for good once the
# old site is shut down.
#
# A file fails when it BOTH performs a fetch (urlopen / requests.*) AND names a
# cutover host. Allowlisted files are the reviewed, deliberately-gated or opt-in
# fetchers; every other pipeline script must read committed data. A file that
# only stores such a URL as metadata (no fetch call) does not fail.
set -euo pipefail
cd "$(dirname "$0")/../.."

HOSTS='footbag\.org|footbaghalloffame\.net|bigaddposse\.com'
FETCH='urlopen|requests\.(get|post|head|put|delete)'
# Mirror crawler (builds the mirror), opt-in honor-roster drift check (never wired
# into CI), the gated pre-cutover move scrape (--live), the one-time demo-media
# downloader, the opt-in authenticated groups crawl (settings + membership).
# Everything else must read committed inputs.
ALLOW='create_mirror_footbag_org\.py|diff_live_honor_rosters\.py|18_scrape_footbag_org_moves\.py|acquire_footbag_org_demos\.py|scrape_footbag_org_groups\.py'

offenders=""
while IFS= read -r f; do
  if grep -qE "$FETCH" "$f" && grep -qE "$HOSTS" "$f"; then
    offenders="${offenders}  ${f}"$'\n'
  fi
done < <(find legacy_data scripts freestyle -name '*.py' \
           -not -path '*/.venv/*' -not -path '*/tests/*' -not -path '*/fixtures/*' 2>/dev/null \
           | grep -vE "$ALLOW")

if [ -n "$offenders" ]; then
  echo "[no-live-pipeline-fetch] FAIL: live fetch of a cutover host in non-allowlisted pipeline script(s):" >&2
  printf '%s' "$offenders" >&2
  echo "Read the committed snapshot or the local mirror instead, or add a reviewed gated tool to the allowlist." >&2
  exit 1
fi
echo "[no-live-pipeline-fetch] pass"
