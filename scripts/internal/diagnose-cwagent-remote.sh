#!/usr/bin/env bash
# diagnose-cwagent-remote.sh — root-side half of the CloudWatch agent diagnostic.
#
# Read-only. Answers the one question the workstation cannot: the agent's
# service can be running while the agent has no configuration to run, because
# the control script's fetch-config step is what translates the JSON config into
# the TOML the service actually reads, and that step fails on this stack. From
# outside, "publishing nothing because it was denied" and "publishing nothing
# because it was never configured" look identical, so this reports both.
#
# Never prints the secret access key. The credentials file is inspected for
# shape only: which profile stanza it declares and whether both fields are
# present, never their values.

set -uo pipefail

AGENT_DIR="${CWAGENT_AGENT_DIR:-/opt/aws/amazon-cloudwatch-agent}"
# Test seam (only the suite sets it): a stand-in agent tree. Announced, because
# a run against a stand-in says nothing about the host.
[[ -n "${CWAGENT_AGENT_DIR:-}" ]] && echo "SYNTHETIC: CWAGENT_AGENT_DIR is set -- this run proves nothing about the host." >&2
CREDS="${CWAGENT_CREDS_FILE:-/etc/amazon-cloudwatch-agent.aws/credentials}"
[[ -n "${CWAGENT_CREDS_FILE:-}" ]] && echo "SYNTHETIC: CWAGENT_CREDS_FILE is set -- this run proves nothing about the host." >&2

echo "=== service ==="
systemctl is-enabled amazon-cloudwatch-agent 2>&1 | sed 's/^/  enabled: /'
systemctl is-active amazon-cloudwatch-agent 2>&1 | sed 's/^/  active:  /'

echo
echo "=== configuration the service actually reads ==="
# The JSON is what the installer writes; the TOML is what the agent runs from.
# A JSON with no TOML beside it is the failure this script exists to name.
ls -l "${AGENT_DIR}/etc/amazon-cloudwatch-agent.json" 2>&1 | sed 's/^/  /'
ls -l "${AGENT_DIR}/etc/amazon-cloudwatch-agent.toml" 2>&1 | sed 's/^/  /'
ls -l "${AGENT_DIR}/etc/amazon-cloudwatch-agent.d/" 2>&1 | sed 's/^/  /'

echo
echo "=== namespace the agent was told to publish to ==="
# namespace_lines <label> <file> <ERE>
# Three answers that mean different things on a host, and are kept apart: no
# file at all (the translator never ran), a file that cannot be read, and a file
# that is there but names no namespace (the translator ran and wrote a config
# that publishes to the agent's default). The matches are read into a variable
# first and grep's own status decides, so a pipe closing early can never print a
# second verdict after the real lines.
namespace_lines() {
  local label="$1" file="$2" ere="$3" found rc
  if [[ ! -e "$file" ]]; then
    echo "  ${label}: absent (no file at ${file})"
    return 0
  fi
  found="$(grep -oE -m 3 -- "$ere" "$file" 2>&1)"
  rc=$?
  case "$rc" in
    0) printf '%s\n' "$found" | sed "s/^/  ${label}: /" ;;
    1) echo "  ${label}: present, no namespace line (${file})" ;;
    *) echo "  ${label}: unreadable (${file}): ${found##*$'\n'}" ;;
  esac
}
namespace_lines json "${AGENT_DIR}/etc/amazon-cloudwatch-agent.json" '"namespace"[^,}]*'
# TOML allows any indentation, any spacing around the equals sign, and either
# basic ("...") or literal ('...') strings; the key may sit in any table.
namespace_lines toml "${AGENT_DIR}/etc/amazon-cloudwatch-agent.toml" \
  "^[[:space:]]*namespace[[:space:]]*=[[:space:]]*(\"[^\"]*\"|'[^']*')"

echo
echo "=== credentials wiring (shape only, no values) ==="
if [[ -r "$CREDS" ]]; then
  stat -c '  mode %a owner %U:%G' "$CREDS"
  grep -o '^\[.*\]' "$CREDS" | sed 's/^/  profile stanza: /'
  grep -c '^aws_access_key_id' "$CREDS" | sed 's/^/  access key id lines: /'
  grep -c '^aws_secret_access_key' "$CREDS" | sed 's/^/  secret lines: /'
else
  echo "  $CREDS is missing or unreadable"
fi
grep -o 'shared_credential_profile.*' "${AGENT_DIR}/etc/common-config.toml" 2>/dev/null | sed 's/^/  common-config: /' || echo "  common-config: absent"

echo
echo "=== agent control status ==="
"${AGENT_DIR}/bin/amazon-cloudwatch-agent-ctl" -a status 2>&1 | sed 's/^/  /' || true

echo
echo "=== agent log, last 40 lines (look for AccessDenied, 403, no config) ==="
tail -n 40 "${AGENT_DIR}/logs/amazon-cloudwatch-agent.log" 2>&1 | sed 's/^/  /' || echo "  no log"

# The configs the translator merges. The service's start wrapper translates the
# installer's JSON together with every file in the drop-in directory, so a stale
# drop-in is part of what the agent runs. Configs hold no secret; the
# credentials file is never printed.
echo
echo "=== configs the translator merges ==="
for cfg in "${AGENT_DIR}/etc/amazon-cloudwatch-agent.json" "${AGENT_DIR}"/etc/amazon-cloudwatch-agent.d/*; do
  [[ -f "$cfg" ]] || continue
  echo "  --- ${cfg} ($(stat -c '%s bytes, modified %y' "$cfg"))"
  sed 's/^/    /' "$cfg"
done

# The translator's own verdict and message, with the inputs the start wrapper
# gives it, written to a throwaway directory so the agent's own TOML is left
# alone. The log only ever says "exit status 1"; this says why.
echo
echo "=== the translator's verdict on those configs ==="
translator="${AGENT_DIR}/bin/config-translator"
if [[ -x "$translator" ]]; then
  scratch="$(mktemp -d)"
  trap 'rm -rf "$scratch"' EXIT
  trap "trap '' INT TERM; exit 130" INT
  trap "trap '' INT TERM; exit 143" TERM
  "$translator" --output "${scratch}/agent.toml" --mode auto \
    --input "${AGENT_DIR}/etc/amazon-cloudwatch-agent.json" \
    --input-dir "${AGENT_DIR}/etc/amazon-cloudwatch-agent.d" \
    --config "${AGENT_DIR}/etc/common-config.toml" > "${scratch}/out" 2>&1
  rc=$?
  sed 's/^/  /' "${scratch}/out"
  echo "  translator exit: ${rc}"
else
  echo "  ${translator} is missing or not executable"
fi
