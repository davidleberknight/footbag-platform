#!/usr/bin/env bash
# Root-side body of scripts/install-cwagent-staging.sh.
#
# Invoked via:
#   { cat;
#     printf 'CWAGENT_AKID=%q\n' "$AKID";
#     printf 'CWAGENT_SAK=%q\n' "$SAK";
#     cat scripts/internal/install-cwagent-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# (cat consumes operator stdin = password line; the printf lines emit shell
# variable assignments; the final cat appends this body. ssh stdin = password
# + assignments + body. sudo -S consumes the password; bash inherits the rest
# and runs the assignments and this body as root.)
#
# Required shell variables (provided by the caller's prepended assignments):
#   CWAGENT_AKID  AWS access key id for the cwagent IAM user
#   CWAGENT_SAK   AWS secret access key for the cwagent IAM user

set -euo pipefail

: "${CWAGENT_AKID:?missing CWAGENT_AKID variable in pipe}"
: "${CWAGENT_SAK:?missing CWAGENT_SAK variable in pipe}"

# Operator can override per env; defaults match staging. Production install
# should pass these via env (e.g. INSTANCE_NAME=footbag-production-web
# CWAGENT_PROFILE=footbag-production-cwagent bash install-cwagent-remote.sh).
# Mechanical, follows the env-naming convention documented in DD §7.7.
INSTANCE_NAME="${INSTANCE_NAME:-footbag-staging-web}"
NAMESPACE="${CWAGENT_NAMESPACE:-CWAgent}"
CWAGENT_PROFILE="${CWAGENT_PROFILE:-footbag-staging-cwagent}"
RPM_URL="https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm"

# Write stdin to a destination file via a user-owned tmpfile, then promote
# with `install` (avoids piping secrets to a wrapped command's stdin, which
# can leak when sudo creds are cached).
# The temp file is created restricted, trapped, and shredded rather than
# unlinked. One of its callers writes the AWS secret key: with a plain `rm -f`
# and no trap, an `install` that failed on a full or read-only filesystem, or a
# signal between the write and the promote, left that key sitting in /tmp
# indefinitely. The rule names this function as the shape every privileged writer
# should copy, which is why it is worth getting exactly right here.
# Bash keeps ONE handler per signal, so exactly one handler owns cleanup here and
# everything that creates something to clean up registers it. The previous shape
# had this function install its own EXIT INT TERM handler and then clear all three
# on the way out, which replaced and then discarded the package-directory handler
# the install step sets below: a fresh install left its downloaded package
# directory behind on every run, and an interrupt after the first promoted file
# left it behind with nothing watching. A per-function trap cannot coexist with a
# file-level one; a registry can.
CWAGENT_TMPS=()
cwagent_remote_cleanup() {
  local t
  for t in "${CWAGENT_TMPS[@]+"${CWAGENT_TMPS[@]}"}"; do
    [[ -e "$t" ]] || continue
    # Shredded rather than unlinked: one caller writes the AWS secret key, and an
    # `install` that failed on a full or read-only filesystem leaves the value in
    # the temp file.
    shred -u "$t" 2>/dev/null || rm -f "$t"
  done
  if [[ -n "${tmpdir:-}" && -d "${tmpdir:-}" ]]; then
    rm -rf "$tmpdir"
  fi
  return 0
}
trap cwagent_remote_cleanup EXIT INT TERM

install_via_tmp() {
  local dest="$1"
  local mode="$2"
  local tmp
  tmp=$(umask 077 && mktemp)
  CWAGENT_TMPS+=("$tmp")
  cat > "$tmp"
  install -m "$mode" -o root -g root "$tmp" "$dest"
  shred -u "$tmp" 2>/dev/null || rm -f "$tmp"
}

echo "=== Pre-flight 1: root fstype ==="
fstype=$(findmnt -no FSTYPE /)
echo "  Root fstype: ${fstype}"
if [[ "${fstype}" != "xfs" ]]; then
  echo "  WARNING: fstype is ${fstype}, not xfs. Update" >&2
  echo "  terraform/staging/cloudwatch.tf high_disk.dimensions.fstype before" >&2
  echo "  setting enable_cwagent_alarms = true." >&2
fi

echo
echo "=== Pre-flight 2: IMDS instance-id (informational) ==="
token=$(curl -sf -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
if [[ -n "${token}" ]]; then
  imds_id=$(curl -sf -H "X-aws-ec2-metadata-token: ${token}" http://169.254.169.254/latest/meta-data/instance-id || echo 'UNKNOWN')
else
  imds_id=$(curl -sf http://169.254.169.254/latest/meta-data/instance-id || echo 'UNKNOWN')
fi
echo "  IMDS instance-id: ${imds_id}"

echo
echo "=== Step 1: install amazon-cloudwatch-agent (rpm) ==="
if rpm -q amazon-cloudwatch-agent >/dev/null 2>&1; then
  echo "  Already installed: $(rpm -q amazon-cloudwatch-agent)"
else
  # No trap of its own: the file-level handler above removes this directory, and a
  # second handler here would replace that one rather than add to it.
  tmpdir=$(mktemp -d)
  curl -fsSL "$RPM_URL" -o "${tmpdir}/amazon-cloudwatch-agent.rpm"
  dnf install -y "${tmpdir}/amazon-cloudwatch-agent.rpm"
fi

echo
# aggregation_dimensions states the dimension sets this host publishes on,
# rather than leaving them to be whatever tags the installed agent build happens
# to attach. Newer builds add a telegraf `host` tag that older ones did not, and
# an alarm binds to one exact dimension set, so an agent upgrade would otherwise
# unbind every host alarm silently. The three sets listed are exactly what the
# alarms in each environment's cloudwatch.tf match on: cpu-total for processor,
# path plus filesystem type for disk, and the empty set for memory. The
# host-tagged originals are still published alongside them.
#
# Only the three measurements the alarms and the dashboard read are collected.
# The others were published and read by nothing, and every custom metric is
# billed, so collecting them bought diagnostic breadth nobody consumed.
#
# There is deliberately no append_dimensions block. fetch-config's translator
# drops it, so the InstanceId it used to declare never reached CloudWatch, and
# three documents went on describing an instance dimension that has never
# existed. Keeping it was worse than useless: an agent version that honoured it
# would add a dimension to every metric at once and unbind all three alarms,
# which treat missing data as missing and would then report insufficient data
# for a host that is publishing normally. Hosts are told apart by namespace,
# which is what the alarms scope by.
echo "=== Step 2: write agent JSON config ==="
install -d -m 0755 -o root -g root /opt/aws/amazon-cloudwatch-agent/etc
install_via_tmp /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json 0644 <<JSON
{
  "agent": {
    "region": "us-east-1",
    "metrics_collection_interval": 60,
    "logfile": "/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log"
  },
  "metrics": {
    "namespace": "$NAMESPACE",
    "aggregation_dimensions": [["cpu"], ["path", "fstype"], []],
    "metrics_collected": {
      "cpu": {
        "measurement": ["usage_active"],
        "totalcpu": true
      },
      "mem": {
        "measurement": ["mem_used_percent"]
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
install -d -m 0700 -o root -g root /etc/amazon-cloudwatch-agent.aws
install_via_tmp /etc/amazon-cloudwatch-agent.aws/credentials 0600 <<CREDS
[$CWAGENT_PROFILE]
aws_access_key_id = $CWAGENT_AKID
aws_secret_access_key = $CWAGENT_SAK
CREDS

install_via_tmp /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml 0644 <<CC
[credentials]
   shared_credential_file = "/etc/amazon-cloudwatch-agent.aws/credentials"
   shared_credential_profile = "$CWAGENT_PROFILE"
CC

echo
echo "=== Step 3b: install logrotate config ==="
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
logrotate --debug /etc/logrotate.d/amazon-cloudwatch-agent >/dev/null 2>&1 \
  && echo "  logrotate config installed and validated." \
  || echo "  WARNING: logrotate validation failed; check /etc/logrotate.d/amazon-cloudwatch-agent" >&2

echo
echo "=== Step 4: fetch-config and start agent (onPremise mode) ==="
# fetch-config is the documented way to load a config, and on this stack it
# exits nonzero even when the config is good: the agent's own control script
# fails its validation step and reports a credentials or region complaint. That
# is a known property of this build here rather than a signal about the config,
# and treating its exit status as the install's verdict is what used to abort
# the run after the config and credentials were already written, leaving a
# half-installed agent and a withdrawn key. Its failure is therefore tolerated
# and systemd is what actually starts the agent.
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m onPremise \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s \
  || echo "  fetch-config exited nonzero, which is expected on this host; systemd starts the agent below."

# enable as well as start, so the agent comes back after a reboot. Without it a
# restarted host publishes nothing, and the alarms would report insufficient
# data for a machine that is otherwise perfectly healthy.
systemctl enable amazon-cloudwatch-agent
systemctl restart amazon-cloudwatch-agent

if ! systemctl is-active --quiet amazon-cloudwatch-agent; then
  echo "ERROR: the CloudWatch agent is not running after the restart." >&2
  systemctl status amazon-cloudwatch-agent --no-pager >&2 || true
  tail -n 50 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log >&2 || true
  exit 1
fi
systemctl status amazon-cloudwatch-agent --no-pager || true

echo
echo "=== Step 5: agent log tail (look for 403/AccessDenied/ExpiredToken) ==="
sleep 5
tail -n 50 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log || true

echo
echo "=== Capture for your local operator AWS specifics ==="
echo "  Host:              ${INSTANCE_NAME}"
echo "  Metric namespace:  ${NAMESPACE}"
echo "  Root fstype:       ${fstype}"
echo "  IMDS instance-id:  ${imds_id}"
echo
echo "Verify from the operator workstation. This is the check that gates arming,"
echo "and the alarms stay disarmed until it passes:"
echo "  scripts/verify-cwagent-metrics.sh --target <env>"
echo
echo "It asks for recent datapoints on the exact dimensions the alarms bind to."
echo "These metrics carry no instance dimension, so a listing filtered on one"
echo "returns nothing even from a healthy host."
