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
#   CWAGENT_AKID     AWS access key id for the cwagent IAM user (not with
#                    CWAGENT_KEEP_CREDENTIALS=1, the upgrade, which keeps the
#                    credentials file the host holds and sends no key)
#   CWAGENT_SAK      AWS secret access key for the cwagent IAM user (likewise)
#   CWAGENT_VERSION  the pinned agent version, from ops/host-tools.env
#   CWAGENT_URL      where that version's package is published
#   CWAGENT_SHA256   the digest the package must match before it is installed
#
# The package is pinned and checked rather than taken from the publisher's
# "latest" address. An unpinned install puts whichever build was current that
# day onto the host, so two hosts built a week apart run different agents, and
# a package nothing compared against a known digest is one a mistaken or
# hostile upload could replace unnoticed. A placeholder or malformed pin is
# refused before anything is downloaded.

set -euo pipefail

# An upgrade keeps the key the host already holds: no key travels, and the
# credentials file is left exactly as it is, so a version bump never turns into
# a rotation nobody asked for.
CWAGENT_KEEP_CREDENTIALS="${CWAGENT_KEEP_CREDENTIALS:-0}"
if [[ "$CWAGENT_KEEP_CREDENTIALS" != "1" ]]; then
  : "${CWAGENT_AKID:?missing CWAGENT_AKID variable in pipe}"
  : "${CWAGENT_SAK:?missing CWAGENT_SAK variable in pipe}"
fi
: "${CWAGENT_VERSION:?missing CWAGENT_VERSION variable in pipe}"
: "${CWAGENT_URL:?missing CWAGENT_URL variable in pipe}"
: "${CWAGENT_SHA256:?missing CWAGENT_SHA256 variable in pipe}"

# Checked here as well as on the workstation, because this body is what
# installs, and a caller that skipped its own check must still not install an
# unverified package.
if [[ "${CWAGENT_VERSION}${CWAGENT_URL}${CWAGENT_SHA256}" == *REPLACE_WITH_* ]]; then
  echo "ERROR: the CloudWatch agent pin is still a placeholder; nothing installed." >&2
  exit 1
fi
if [[ ! "$CWAGENT_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: CWAGENT_SHA256 is not a SHA-256 digest; nothing installed." >&2
  exit 1
fi

# Operator can override per env; defaults match staging. Production install
# should pass these via env (e.g. INSTANCE_NAME=footbag-production-web
# CWAGENT_PROFILE=footbag-production-cwagent bash install-cwagent-remote.sh).
# Mechanical, follows the env-naming convention documented in DD §7.7.
INSTANCE_NAME="${INSTANCE_NAME:-footbag-staging-web}"
NAMESPACE="${CWAGENT_NAMESPACE:-CWAgent}"
CWAGENT_PROFILE="${CWAGENT_PROFILE:-footbag-staging-cwagent}"
# The agent's credentials file. A named test seam, because a test drives this
# body as an ordinary user with no /etc to write; announced, since a run against
# another file proves nothing about the host's.
CWAGENT_CREDS="${CWAGENT_CREDS_FILE:-/etc/amazon-cloudwatch-agent.aws/credentials}"
if [[ -n "${CWAGENT_CREDS_FILE:-}" ]]; then
  echo "SYNTHETIC: CWAGENT_CREDS_FILE='${CWAGENT_CREDS_FILE}' -- this run proves nothing about the estate." >&2
fi

# Checked before anything is installed: an upgrade that restarted the agent with
# no credential to publish with would stop the host's metrics.
if [[ "$CWAGENT_KEEP_CREDENTIALS" == "1" ]] \
     && ! grep -qE "^[[:space:]]*\[${CWAGENT_PROFILE}\][[:space:]]*$" "$CWAGENT_CREDS" 2>/dev/null; then
  echo "ERROR: an upgrade keeps the host's credentials, and ${CWAGENT_CREDS} holds no" >&2
  echo "       [${CWAGENT_PROFILE}] profile. Nothing installed; give the host a key with --rotate." >&2
  exit 1
fi

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
# The interrupt handlers only end the run; the exit that follows runs the one
# cleanup. A handler that cleaned up and returned would let bash carry on from
# the next command, so an interrupted install would go on to write the secret
# key and restart the agent with its temp-file registry already swept.
trap cwagent_remote_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

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
echo "=== Step 1: install amazon-cloudwatch-agent ${CWAGENT_VERSION} (rpm) ==="
# The version the installed agent reports about itself, which is the string the
# publisher files the package under. Empty when no agent is installed.
installed_version=""
if rpm -q amazon-cloudwatch-agent >/dev/null 2>&1; then
  installed_version="$(/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status 2>/dev/null \
    | grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"$' | tr -d '"' || true)"
fi
if [[ -n "$installed_version" && "$installed_version" == "$CWAGENT_VERSION" ]]; then
  echo "  Already installed at the pinned version: ${installed_version}"
else
  [[ -n "$installed_version" ]] && echo "  Installed version ${installed_version} is not the pinned ${CWAGENT_VERSION}; replacing it."
  # No trap of its own: the file-level handler above removes this directory, and a
  # second handler here would replace that one rather than add to it.
  tmpdir=$(mktemp -d)
  curl -fsSL "$CWAGENT_URL" -o "${tmpdir}/amazon-cloudwatch-agent.rpm"
  # The digest decides, before the package manager sees the file. A mismatch
  # leaves whatever agent was already there untouched.
  if ! printf '%s  %s\n' "$CWAGENT_SHA256" "${tmpdir}/amazon-cloudwatch-agent.rpm" \
       | sha256sum -c --quiet - >/dev/null 2>&1; then
    echo "ERROR: the downloaded agent package does not match the pinned SHA-256; nothing installed." >&2
    echo "       pinned:     ${CWAGENT_SHA256}" >&2
    echo "       downloaded: $(sha256sum "${tmpdir}/amazon-cloudwatch-agent.rpm" | cut -d' ' -f1)" >&2
    exit 1
  fi
  echo "  Package matches the pinned SHA-256."
  # install takes a newer package over an older one; downgrade covers a pin
  # moved backwards, which install alone refuses.
  dnf install -y "${tmpdir}/amazon-cloudwatch-agent.rpm" \
    || dnf downgrade -y "${tmpdir}/amazon-cloudwatch-agent.rpm"
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
# Every custom metric is billed, so collecting others would buy diagnostic
# breadth nobody consumes.
#
# There is deliberately no append_dimensions block. fetch-config's translator
# drops it, so an InstanceId declared there never reaches CloudWatch. Keeping
# one would be worse than useless: an agent version that honoured it
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
if [[ "$CWAGENT_KEEP_CREDENTIALS" == "1" ]]; then
  echo "  Upgrade: ${CWAGENT_CREDS} kept as it is."
else
install_via_tmp "$CWAGENT_CREDS" 0600 <<CREDS
[$CWAGENT_PROFILE]
aws_access_key_id = $CWAGENT_AKID
aws_secret_access_key = $CWAGENT_SAK
CREDS
fi

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
# and treating its exit status as the install's verdict would abort the run
# after the config and credentials were already written, leaving a
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
