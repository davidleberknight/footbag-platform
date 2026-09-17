#!/usr/bin/env bash
# host-shell.sh
#
# Opens an interactive shell on a deployed host over the same pinned connection
# every other privileged step in this tree uses.
#
# WHY THIS EXISTS.
#
# An interactive shell was the last connection on the operator path with no
# scripted form. The runbook gave a hand-typed recipe as the standard pattern:
# a key path, a port and an account, and nothing verifying which host had
# answered. Every other connection here carries the pin on its own command line,
# where it outranks anything in an operator's own SSH configuration, and the
# reason that matters most is the shell: it is the session in which somebody
# then types their sudo password by hand.
#
# A pasted recipe cannot be relied on to carry two extra options. This can.
#
# WHAT IT REFUSES TO DO.
#
#   - Connect without the pinned host-key file, the same refusal the deploy
#     makes, naming the script that builds it.
#   - Connect to an alias this workstation does not define, rather than letting
#     ssh try to resolve the name against the wider world.
#   - Run a command. A one-shot connection allocates no terminal, so `sudo` on
#     the far end fails on it, and the shape invites the hand-typed one-off this
#     script exists to remove. Diagnostics have their own wrapper, named in the
#     refusal.
#   - Open a session with no terminal attached, so no scheduled job or agent
#     session takes a shell on a deployed host.
#
# It asks for no confirmation and reads no credential, because it changes
# nothing: the sudo inside the session is the operator's own, typed there. It
# creates no file either, so there is nothing for a trap to clean up.
#
# Usage:
#   bash scripts/host-shell.sh --target staging
#   bash scripts/host-shell.sh --target production
#
# Flags:
#   --target <staging|production>  which host to connect to. No default: which
#                                  host a session lands on is never inherited
#                                  from ambient state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""

usage() {
  cat <<'EOF'
Usage: bash scripts/host-shell.sh --target <staging|production>

Opens an interactive shell on the host over the pinned connection.

  --target <env>   staging or production. Required; never defaulted.

It takes no command. To run the diagnostics on a host, use:
  bash scripts/host-diagnostics.sh --target <env> [subcommand]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --help|-h) usage; exit 0 ;;
    --*)
      echo "ERROR: unknown flag '$1'" >&2
      usage >&2
      exit 2
      ;;
    *) break ;;
  esac
done

# The shared refusal rather than another copy of it, so an operator meets the
# same words here as in every other script that names an environment.
require_target "$TARGET" staging production || exit 2

# Refused rather than passed through. `ssh host 'cmd'` allocates no terminal, so
# every sudo on the far end fails on it, and a script that accepted a command
# would become the hand-typed one-off this one replaces.
if (( $# > 0 )); then
  echo "ERROR: this script takes no command; it opens a shell." >&2
  echo "       A one-shot connection has no terminal, so sudo fails on it." >&2
  echo "       To run the diagnostics on the host:" >&2
  echo "         bash scripts/host-diagnostics.sh --target ${TARGET} $1" >&2
  exit 2
fi

ALIAS="footbag-${TARGET}"

require_ssh_alias "$ALIAS" || exit 1
require_pinned_known_hosts || exit 1

SSH_BIN="ssh"
if [[ -n "${FOOTBAG_HOST_SHELL_SSH:-}" ]]; then
  # Named seam, announced every time. A stubbed run reaches no host, and a run
  # that says nothing about that would read as evidence about the estate.
  SSH_BIN="$FOOTBAG_HOST_SHELL_SSH"
  echo "NOTE: ssh is stubbed via FOOTBAG_HOST_SHELL_SSH; this run reaches no host." >&2
fi

RESOLVED_USER="$("$SSH_BIN" -G "$ALIAS" 2>/dev/null | awk '/^user /{print $2}' | tail -1)"
echo "Connecting to ${ALIAS} as ${RESOLVED_USER:-unknown}, host key pinned." >&2

# Last, and only for a real connection: a shell with no terminal is not a shell,
# and refusing here is what keeps a scheduled job or an agent session off the
# host. The seam is exempt because it replaces the ssh binary outright, so such
# a run opens no session at all and there is no access left to protect.
if [[ -z "${FOOTBAG_HOST_SHELL_SSH:-}" ]] && { [[ ! -t 0 ]] || [[ ! -t 1 ]]; }; then
  echo "ERROR: no terminal attached, so there is no interactive session to open." >&2
  echo "       Run this from a terminal rather than through a pipe or a job." >&2
  exit 1
fi

exec "$SSH_BIN" "${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" "$ALIAS"
