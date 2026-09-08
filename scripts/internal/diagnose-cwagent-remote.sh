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

AGENT_DIR="/opt/aws/amazon-cloudwatch-agent"
CREDS="/etc/amazon-cloudwatch-agent.aws/credentials"

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
grep -o '"namespace"[^,]*' "${AGENT_DIR}/etc/amazon-cloudwatch-agent.json" 2>/dev/null | sed 's/^/  json: /' || echo "  json: unreadable"
grep -o 'namespace *= *"[^"]*"' "${AGENT_DIR}/etc/amazon-cloudwatch-agent.toml" 2>/dev/null | head -3 | sed 's/^/  toml: /' || echo "  toml: absent"

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
