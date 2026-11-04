#!/usr/bin/env bash
# scripts/internal/check-vulnerabilities-remote.sh -- root-side half of
# scripts/check-vulnerabilities.sh. Runs on the host as root; never run directly.
#
# Lists the security advisories the newest Amazon Linux 2023 release fixes in
# the packages this host has installed, and the installed version of every
# package, so the operator side can say which package is behind and by which
# advisory. A release is immutable once published, so advisories issued since
# the host's pinned release appear only in the metadata of the latest one,
# which is why the listing asks for --releasever=latest. It installs nothing.
#
# It arrives on the ssh stream behind scripts/lib/closing-report-remote.sh, and
# every problem it meets is a marked line the operator side lists in its own
# closing report; it ends with crr_finish, whose status says whether any was an
# error.
#
# Lines for the operator side to read:
#   ---FOOTBAG-UPDATEINFO--- <a line dnf printed on its standard output>
#   ---FOOTBAG-INSTALLED--- <name> <version>-<release>
#   ---FOOTBAG-LISTED---    printed only once the listing itself succeeded
#
# Required shell variables: none. Optional, set only by the suite: none.

set -uo pipefail

# The package manager's own failure and warning lines.
DNF_ERRORS='^(Error|error):'
DNF_WARNINGS='^(warning|Warning):'

out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
trap "trap '' HUP INT TERM; exit 130" INT
trap "trap '' HUP INT TERM; exit 143" TERM

# Quiet, so the metadata and repository download lines dnf prints as progress
# are not on standard output, where each would be read as an advisory line.
rc=0
dnf -q updateinfo --releasever=latest --list > "$out" 2> "$err" || rc=$?
cat "$err" >&2
while IFS=$'\t' read -r kind line; do
  if [[ "$kind" == ERROR ]]; then
    crr_error "dnf updateinfo: ${line}"
  else
    crr_warn "dnf updateinfo: ${line}"
  fi
done < <(cr_grep_problems "$err" "$DNF_ERRORS" "$DNF_WARNINGS")
if (( rc )); then
  crr_error "dnf updateinfo: exit ${rc}: $(tail -n 1 "$err")"
else
  while IFS= read -r line; do
    printf '%s %s\n' '---FOOTBAG-UPDATEINFO---' "$line"
  done < "$out"
  echo '---FOOTBAG-LISTED---'
fi

if ! rpm -qa --qf '---FOOTBAG-INSTALLED--- %{NAME} %{VERSION}-%{RELEASE}\n' > "$out" 2> "$err"; then
  crr_error "rpm -qa: $(tail -n 1 "$err")"
fi
cat "$out"

crr_finish
