#!/usr/bin/env bash
# realdata-staging.sh
#
# The real-data invariants of ./run_all_tests.sh --staging, run against staging's
# copy of the dataset rather than a local one.
#
# WHY IT EXISTS.
#
# The whole-population invariants need the real footbag.org member dataset. That
# dataset is not to be copied to a workstation, and staging already carries it.
# So the checks go to the data rather than the data coming to the checks: this
# script opens one ssh session to the staging host, reads the live database
# there read-only, and brings back only what the governance of that data allows
# off the host: counts, PASS/FAIL gate lines, and one opaque legacy member id.
#
# Two subcommands:
#
#   probe       prints RDI_MEMBERS, RDI_AUTHORITATIVE and RDI_CLAIMABLE (counts)
#               and RDI_TARGET_ID (the lowest claimable record), for the
#               --staging preflight.
#   invariants  runs the legacy import gates and the referential-integrity checks
#               on the host, against the live database, and prints their GATE:
#               lines. The check scripts travel on the stream from this checkout,
#               so the host runs exactly the checks this tree carries.
#
# WHAT IT REFUSES.
#
#   - Any environment but staging. There is no --target: staging is the only
#     place this reads, because it is the only environment whose real data a
#     dev-tester's run may inspect before go-live.
#   - A missing credential file, or one whose mode is not 600 or 400, by name.
#   - A workstation with no ssh alias for staging, or no pinned host key.
#   - Any line from the host that is not a gate line of the shape the check
#     scripts print (GATE: G1-G6 or RI1-RI3, PASS or FAIL, then the reason) or a
#     known RDI_ key of the expected shape. Everything else is dropped, never
#     printed.
#   - An invariants run in which any of the nine gates reported no line, however
#     clean the exit codes look.
#   - A target id that is not a short run of letters, digits, underscores and
#     hyphens. The id is the one value that is not a count, so its shape is held
#     to what a legacy member id looks like and nothing that could carry more.
#
# Nothing is written to disk on either side. The host's reply is held in memory
# and filtered before it is printed.
#
# Exit status: 0 when every check passed (probe: when the host answered);
# 78 when the gates report the loaded members as entirely mirror-derived, which
# the runner treats as "no authoritative load"; 1 otherwise; 2 on a usage error.
#
# Usage (the sudo password is read from the credential file the shared rule
# selects for the account the alias connects as; nothing is redirected in):
#   bash scripts/realdata-staging.sh probe
#   bash scripts/realdata-staging.sh invariants
#
# A dev-tester runs it through the named-account switch, which selects their own
# credential file:
#   scripts/as-dev-tester.sh --account <name> bash scripts/realdata-staging.sh probe
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  probe|invariants) ;;
  -h|--help)
    # Bounded by the first `set -eu` rather than a line number, so editing the
    # header cannot silently truncate the help text.
    sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
    exit 0
    ;;
  "") echo "ERROR: a subcommand is required: probe or invariants" >&2; exit 2 ;;
  *)  echo "ERROR: unknown subcommand '$MODE' (expected probe or invariants)" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  echo "ERROR: unexpected argument '$2'" >&2
  exit 2
fi

TARGET="staging"
SSH_ALIAS="footbag-staging"

# Named test seam: replaces the ssh binary for the connection itself. A run
# using it says so on stderr, because a stubbed run proves nothing about the
# estate.
SSH_BIN="${FOOTBAG_REALDATA_SSH:-ssh}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/realdata-invariants-remote.sh"
GATES_SCRIPT="${SCRIPT_DIR}/validate-legacy-import-gates.sh"
RI_SCRIPT="${SCRIPT_DIR}/validate-realdata-ri.sh"

# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

# The credential is resolved here rather than redirected in: nothing in this
# script reads stdin, and the value never reaches argv. Which file, and the
# mode bar it has to meet, both come from the shared rule.
require_operator_credential "$SSH_ALIAS" "$TARGET" || exit 1
IFS= read -r SUDO_PASS < "$OPERATOR_CREDENTIAL_FILE" || true
if [[ -z "$SUDO_PASS" ]]; then
  echo "ERROR: the credential file's first line is empty; expected the host sudo password." >&2
  exit 1
fi

require_ssh_alias "$SSH_ALIAS" || exit 1
require_host_ssh_opts || exit 1
HOST_SSH_BIN="$SSH_BIN"
require_host_is "$SSH_ALIAS" "$TARGET" || exit 1
for f in "$REMOTE_HALF" "$GATES_SCRIPT" "$RI_SCRIPT"; do
  [[ -r "$f" ]] || { echo "ERROR: missing script: $f" >&2; exit 1; }
done

if [[ "$SSH_BIN" != "ssh" ]]; then
  # WARNING rather than a note, because the runner collects WARNING lines into
  # its end-of-run notices, and a stubbed run must not end looking like a real one.
  echo "WARNING: TEST SEAM in use (FOOTBAG_REALDATA_SSH); this run proves nothing about the estate." >&2
fi

GATES_B64=""
RI_B64=""
if [[ "$MODE" == "invariants" ]]; then
  GATES_B64="$(base64 -w0 "$GATES_SCRIPT")"
  RI_B64="$(base64 -w0 "$RI_SCRIPT")"
fi

# One session, one stream: the password on line one for sudo, the values the
# root-side body needs, then the body itself.
reply_rc=0
reply="$(
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'RDI_MODE=%q\n'  "$MODE"
    printf 'GATES_B64=%q\n' "$GATES_B64"
    printf 'RI_B64=%q\n'    "$RI_B64"
    cat "$REMOTE_HALF"
  } | "$SSH_BIN" "${HOST_SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'
)" || reply_rc=$?
unset SUDO_PASS

if (( reply_rc != 0 )); then
  echo "ERROR: the staging host did not complete the ${MODE} (exit ${reply_rc})." >&2
  exit 1
fi

# Only gate lines and the known keys, in the shape each is allowed to have, are
# kept. Anything else the host said is dropped without being printed, because
# the point of this filter is that nothing unexpected leaves the host. A gate
# line is held to the shape the two check scripts print: a known gate id, a
# verdict, then the reason.
GATE_LINE_RE='^GATE: (G[1-6]|RI[1-3]) (PASS|FAIL): .+$'
REQUIRED_GATES=(G1 G2 G3 G4 G5 G6 RI1 RI2 RI3)
kept=()
seen_gates=" "
target_id=""
gates_rc=""
ri_rc=""
while IFS= read -r line; do
  if [[ "$line" =~ $GATE_LINE_RE ]]; then
    kept+=("$line")
    seen_gates+="${BASH_REMATCH[1]} "
  elif [[ "$line" =~ ^RDI_(MEMBERS|AUTHORITATIVE|CLAIMABLE|GATES_RC|RI_RC)=([0-9]+)$ ]]; then
    kept+=("$line")
    case "${BASH_REMATCH[1]}" in
      GATES_RC) gates_rc="${BASH_REMATCH[2]}" ;;
      RI_RC)    ri_rc="${BASH_REMATCH[2]}" ;;
    esac
  elif [[ "$line" == RDI_TARGET_ID=* ]]; then
    target_id="${line#RDI_TARGET_ID=}"
    if [[ -n "$target_id" && ! "$target_id" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
      echo "ERROR: the host returned a target id that is not the shape of a legacy member id; refusing it." >&2
      exit 1
    fi
    kept+=("RDI_TARGET_ID=${target_id}")
  fi
done <<< "$reply"

if (( ${#kept[@]} > 0 )); then
  printf '%s\n' "${kept[@]}"
fi

if [[ "$MODE" == "probe" ]]; then
  exit 0
fi

if [[ -z "$gates_rc" || -z "$ri_rc" ]]; then
  echo "ERROR: the host did not report both check results; treating the run as failed." >&2
  exit 1
fi
# Clean exit codes with checks missing is not a pass: a body that ran nothing
# would report exactly that. Every gate must have reported its own line.
missing=()
for g in "${REQUIRED_GATES[@]}"; do
  [[ "$seen_gates" == *" $g "* ]] || missing+=("$g")
done
if (( ${#missing[@]} > 0 )); then
  echo "ERROR: the host reported no result for: ${missing[*]}; treating the run as failed." >&2
  exit 1
fi
if [[ "$gates_rc" == "78" ]]; then
  exit 78
fi
if [[ "$gates_rc" == "0" && "$ri_rc" == "0" ]]; then
  exit 0
fi
exit 1
