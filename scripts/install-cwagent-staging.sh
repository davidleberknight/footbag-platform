#!/usr/bin/env bash
# install-cwagent-staging.sh
#
# Installs and configures the Amazon CloudWatch Agent on the staging
# Lightsail host. Idempotent: safe to re-run on an already-configured host.
#
# Runs locally on the operator workstation; SSHes to the host and uses
# `sudo -S` non-interactively, matching the deploy-code.sh / deploy-rebuild.sh
# pattern. No copy of this script lives on the host.
#
# Prerequisites:
#   - ~/.ssh/config alias "footbag-staging" configured with User footbag
#   - terraform/staging applied (cloudwatch_publisher IAM user must exist)
#   - jq installed locally
#
# Usage:
#   1. Generate keys for the cwagent_publisher IAM user:
#      umask 077; aws iam create-access-key \
#        --user-name footbag-staging-cwagent-publisher > /tmp/cwagent-keys.json
#
#   2. Save AccessKeyId + SecretAccessKey from /tmp/cwagent-keys.json to
#      vault entry 'aws-footbag-staging-cwagent-publisher' (KeePassXC).
#
#   3. Run this script (sudo password and keys file are positional args;
#      wrap each with $(cat <file>) to keep them out of shell history):
#      bash scripts/install-cwagent-staging.sh "$(cat ~/.footbag-pass)" /tmp/cwagent-keys.json
#
#   4. shred -u /tmp/cwagent-keys.json
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-staging bash scripts/install-cwagent-staging.sh ...

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/install-cwagent-staging.sh <sudo-password> <keys-file>

  <sudo-password>   sudo password for the footbag account on the staging host
  <keys-file>       path to JSON output from `aws iam create-access-key`
                    for IAM user footbag-staging-cwagent-publisher

Override the SSH target:
  DEPLOY_TARGET=footbag-staging bash scripts/install-cwagent-staging.sh ...
EOF
}

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 1
fi

FOOTBAG_PASS="$1"
KEYS_FILE="$2"
REMOTE="${DEPLOY_TARGET:-footbag-staging}"

[[ -r "$KEYS_FILE" ]] || { echo "ERROR: cannot read keys file: $KEYS_FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq is required locally" >&2; exit 1; }

CWAGENT_AKID=$(jq -r '.AccessKey.AccessKeyId // empty' "$KEYS_FILE")
CWAGENT_SAK=$(jq -r '.AccessKey.SecretAccessKey // empty' "$KEYS_FILE")
if [[ -z "$CWAGENT_AKID" || -z "$CWAGENT_SAK" ]]; then
  echo "ERROR: $KEYS_FILE does not contain .AccessKey.AccessKeyId / .SecretAccessKey" >&2
  exit 1
fi

# Shell-quote for safe embedding in the remote heredoc body. printf '%q'
# produces a bash-safe representation regardless of special characters.
PASS_Q=$(printf '%q' "$FOOTBAG_PASS")
AKID_Q=$(printf '%q' "$CWAGENT_AKID")
SAK_Q=$(printf '%q' "$CWAGENT_SAK")

INSTANCE_NAME="footbag-staging-web"
NAMESPACE="CWAgent"
CWAGENT_PROFILE="footbag-staging-cwagent"
RPM_URL="https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm"

echo "==> Deploy target: $REMOTE"
ssh "$REMOTE" "echo '    SSH OK'"

# All host-side work runs in one heredoc.
# Outer EOF is unquoted: $LOCAL_VAR expands locally; \$REMOTE_VAR reaches the
# remote literal as $REMOTE_VAR for remote bash to expand.
ssh "$REMOTE" bash <<EOF
set -euo pipefail
PASS=$PASS_Q
AKID=$AKID_Q
SAK=$SAK_Q

run_sudo() { printf '%s\n' "\$PASS" | sudo -S -p '' "\$@"; }

# Write stdin to a destination file via a user-owned tmpfile, then promote
# with sudo install. Avoids the trap where, if sudo has cached credentials,
# the password piped to "sudo -S" is not consumed and flows through to the
# wrapped command's stdin (tee, etc.), leaking into the destination file.
# Usage:  install_via_tmp <dest> <mode> <<'EOF'
#           ...content...
#         EOF
install_via_tmp() {
  local dest="\$1"
  local mode="\$2"
  local tmp
  tmp=\$(mktemp)
  cat > "\$tmp"
  run_sudo install -m "\$mode" -o root -g root "\$tmp" "\$dest"
  rm -f "\$tmp"
}

echo "=== Pre-flight 1: root fstype ==="
fstype=\$(findmnt -no FSTYPE /)
echo "  Root fstype: \${fstype}"
if [[ "\${fstype}" != "xfs" ]]; then
  echo "  WARNING: fstype is \${fstype}, not xfs. Update" >&2
  echo "  terraform/staging/cloudwatch.tf high_disk.dimensions.fstype before" >&2
  echo "  setting enable_cwagent_alarms = true." >&2
fi

echo
echo "=== Pre-flight 2: IMDS instance-id (informational) ==="
token=\$(curl -sf -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
if [[ -n "\${token}" ]]; then
  imds_id=\$(curl -sf -H "X-aws-ec2-metadata-token: \${token}" http://169.254.169.254/latest/meta-data/instance-id || echo 'UNKNOWN')
else
  imds_id=\$(curl -sf http://169.254.169.254/latest/meta-data/instance-id || echo 'UNKNOWN')
fi
echo "  IMDS instance-id: \${imds_id}"

echo
echo "=== Step 1: install amazon-cloudwatch-agent (rpm) ==="
if rpm -q amazon-cloudwatch-agent >/dev/null 2>&1; then
  echo "  Already installed: \$(rpm -q amazon-cloudwatch-agent)"
else
  tmpdir=\$(mktemp -d)
  trap 'rm -rf "\${tmpdir}"' EXIT
  curl -fsSL "$RPM_URL" -o "\${tmpdir}/amazon-cloudwatch-agent.rpm"
  run_sudo dnf install -y "\${tmpdir}/amazon-cloudwatch-agent.rpm"
fi

echo
echo "=== Step 2: write agent JSON config ==="
run_sudo install -d -m 0755 -o root -g root /opt/aws/amazon-cloudwatch-agent/etc
install_via_tmp /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json 0644 <<'JSON'
{
  "agent": {
    "region": "us-east-1",
    "metrics_collection_interval": 60,
    "logfile": "/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log"
  },
  "metrics": {
    "namespace": "$NAMESPACE",
    "append_dimensions": {
      "InstanceId": "$INSTANCE_NAME"
    },
    "metrics_collected": {
      "cpu": {
        "measurement": ["usage_active", "usage_idle", "usage_iowait", "usage_user", "usage_system"],
        "totalcpu": true
      },
      "mem": {
        "measurement": ["mem_used_percent", "mem_available_percent"]
      },
      "disk": {
        "measurement": ["used_percent"],
        "resources": ["/"],
        "drop_device": true
      }
    }
  }
}
JSON

echo
echo "=== Step 3: dedicated credentials file + common-config.toml ==="
run_sudo install -d -m 0700 -o root -g root /etc/amazon-cloudwatch-agent.aws
install_via_tmp /etc/amazon-cloudwatch-agent.aws/credentials 0600 <<CREDS
[$CWAGENT_PROFILE]
aws_access_key_id = \$AKID
aws_secret_access_key = \$SAK
CREDS

install_via_tmp /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml 0644 <<'CC'
[credentials]
   shared_credential_file = "/etc/amazon-cloudwatch-agent.aws/credentials"
   shared_credential_profile = "$CWAGENT_PROFILE"
CC

echo
echo "=== Step 3b: install logrotate config ==="
# CWAgent rpm ships no logrotate config; project invariant per
# DEVOPS_GUIDE §12.2 is no log surface with unbounded growth. This caps the
# self-log to 4 x 10M compressed (~40M worst case). copytruncate is required:
# CWAgent does not reopen on SIGHUP.
install_via_tmp /etc/logrotate.d/amazon-cloudwatch-agent 0644 <<'LR'
/opt/aws/amazon-cloudwatch-agent/logs/*.log {
    daily
    rotate 4
    size 10M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
LR
run_sudo logrotate --debug /etc/logrotate.d/amazon-cloudwatch-agent >/dev/null 2>&1 \
  && echo "  logrotate config installed and validated." \
  || echo "  WARNING: logrotate validation failed; check /etc/logrotate.d/amazon-cloudwatch-agent" >&2

echo
echo "=== Step 4: fetch-config and start agent (onPremise mode) ==="
run_sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m onPremise \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s
run_sudo systemctl status amazon-cloudwatch-agent --no-pager || true

echo
echo "=== Step 5: agent log tail (look for 403/AccessDenied/ExpiredToken) ==="
sleep 5
run_sudo tail -n 50 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log || true

echo
echo "=== Capture for AWS_PROJECT_SPECIFICS.md ==="
echo "  Root fstype:       \${fstype}"
echo "  IMDS instance-id:  \${imds_id}"
echo
echo "Verify metrics from operator workstation:"
echo "  aws cloudwatch list-metrics --namespace $NAMESPACE \\\\"
echo "    --dimensions Name=InstanceId,Value=$INSTANCE_NAME"
EOF
