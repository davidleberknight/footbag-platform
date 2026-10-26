#!/usr/bin/env bash
# Root-side body that reports, read-only, the state every host step of
# scripts/bootstrap-host.sh leaves behind. Never run directly: it runs as root
# because most of what it reads is root's, and the caller pipes it into sudo.
#
# Invoked via the wire pattern:
#   { printf '%s\n' "$SUDO_PASS";
#     cat scripts/internal/bootstrap-host-status-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-bootstrap-status'
#
# Each line between the sentinels is KEY=VALUE, one fact per line, read from the
# thing itself rather than from a marker a step left: the daemon's effective
# configuration rather than its file, the package manager's record rather than a
# path existing, the credential chain resolved rather than the credential file
# present. The bootstrap's status mode and scripts/bringup-status.sh both judge
# the steps from these lines, so a step reads done only on the outcome it exists
# to produce.
#
# Nothing secret crosses the wire. The env file is read for the environment
# record and the database directory, and for whether the two queue addresses are
# set, never their values; the credential files only for their key ids, which
# are identifiers. It changes nothing and writes no file.

set -uo pipefail

emit() {
  # One line per fact: a value carrying a newline would split into a second,
  # unrelated line on the reading side.
  printf '%s=%s\n' "$1" "$(printf '%s' "$2" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
}

key_id_in() {
  local file="$1" profile="$2"
  [[ -r "$file" ]] || return 0
  awk -v want="[$profile]" '
    /^[[:space:]]*\[/ { gsub(/[[:space:]]/, ""); in_section = ($0 == want); next }
    in_section && /^[[:space:]]*aws_access_key_id[[:space:]]*=/ {
      sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print; exit
    }' "$file"
}

owner_mode() {
  [[ -e "$1" ]] && stat -c '%U:%G %a' "$1" 2>/dev/null || echo "absent"
}

owner_ids() {
  [[ -e "$1" ]] && stat -c '%u:%g' "$1" 2>/dev/null || echo "absent"
}

yes_if() { if "$@" >/dev/null 2>&1; then echo yes; else echo no; fi; }

env_value() {
  awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print}' /srv/footbag/env 2>/dev/null | tail -1
}
env_record="$(env_value FOOTBAG_ENV)"

echo "---FOOTBAG-BOOTSTRAP-STATUS---"

# The connecting account, and whether it is the shared one in wheel. Reaching
# this body at all already proved its key login on the alias's port and sudo
# accepting its password.
emit ACCOUNT_USER "${SUDO_USER:-}"
groups_of_footbag="$(id -nG footbag 2>/dev/null || true)"
emit ACCOUNT_WHEEL "$([[ " ${groups_of_footbag} " == *" wheel "* ]] && echo yes || echo no)"
emit ACCOUNT_KEYS "$(grep -cE '^(ssh-|ecdsa-)' "$(getent passwd footbag | cut -d: -f6)/.ssh/authorized_keys" 2>/dev/null || echo 0)"

# sshd, as the daemon would run it.
sshd_eff="$(sshd -T 2>/dev/null || true)"
emit SSHD_PORTS "$(grep -E '^port ' <<< "$sshd_eff" | cut -d' ' -f2 | sort -un | tr '\n' ' ')"
emit SSHD_ROOT "$(grep -E '^permitrootlogin ' <<< "$sshd_eff" | cut -d' ' -f2)"
emit SSHD_PASSWORD "$(grep -E '^passwordauthentication ' <<< "$sshd_eff" | cut -d' ' -f2)"
emit SSHD_KBD "$(grep -E '^kbdinteractiveauthentication ' <<< "$sshd_eff" | cut -d' ' -f2)"
emit SSHD_REVERT_PENDING "$(yes_if systemctl is-active --quiet footbag-sshd-revert.timer)"
# sshd, as the running daemon holds it: the ports its listening sockets are bound
# to. sshd -T above reads the configuration a fresh daemon would start with, so a
# drop-in written and never reloaded reads as listening when nothing is.
emit SSHD_LISTEN "$(ss -Hltnp 2>/dev/null | grep '"sshd"' | tr -s ' ' | cut -d' ' -f4 | grep -oE '[0-9]+$' | sort -un | tr '\n' ' ')"

# Tools.
emit ARCH "$(uname -m)"
emit DOCKER_ACTIVE "$(systemctl is-active docker 2>/dev/null || true)"
emit DOCKER_ENABLED "$(systemctl is-enabled docker 2>/dev/null || true)"
emit COMPOSE_VERSION "$(docker compose version --short 2>/dev/null || echo none)"
emit SQLITE "$(yes_if command -v sqlite3)"
emit RSYNC "$(yes_if command -v rsync)"
emit AWSCLI "$(yes_if command -v aws)"

# Layout.
emit SRV_DIR "$(owner_mode /srv/footbag)"
emit ENV_FILE "$(owner_mode /srv/footbag/env)"
emit DB_DIR "$(owner_ids /srv/footbag/db)"
emit FOOTBAG_ENV "$env_record"

# The database the containers open, and whether a restore's erasure replay is
# still pending beside it. A live production rebuilt onto a fresh instance gets
# its database back by restore, never by a rebuild, and these say which of the
# restore's steps the host has reached.
db_dir="$(env_value FOOTBAG_DB_DIR)"
db_dir="${db_dir:-/srv/footbag/db}"
emit DB_FILE "$([[ -f "${db_dir}/footbag.db" ]] && echo present || echo absent)"
emit REPLAY_PENDING "$([[ -e "${db_dir}/.erasure-replay-pending" ]] && echo yes || echo no)"

# Whether the host holds the notification queues' addresses, by presence only.
# Subscribed in Terraform is not polled: the worker reads only these.
emit FEED_SES_QUEUE "$([[ -n "$(env_value SES_FEEDBACK_QUEUE_URL)" ]] && echo set || echo unset)"
emit FEED_ALARM_QUEUE "$([[ -n "$(env_value ALARM_QUEUE_URL)" ]] && echo set || echo unset)"

# The host's own credential chain, resolved by the host. A runtime profile that
# answers with anything but an assumed role is a chain that does not work.
cred_chain="fail"
if [[ -n "$env_record" && -r /root/.aws/credentials ]]; then
  run_arn="$(AWS_CONFIG_FILE=/root/.aws/config AWS_SHARED_CREDENTIALS_FILE=/root/.aws/credentials \
    timeout 30 aws sts get-caller-identity --profile "footbag-${env_record}-runtime" \
    --query Arn --output text 2>/dev/null || true)"
  [[ "$run_arn" == *:assumed-role/* ]] && cred_chain="ok"
fi
emit CRED_CHAIN "$cred_chain"
emit CRED_KEY_ID "$([[ -n "$env_record" ]] && key_id_in /root/.aws/credentials "footbag-${env_record}-source-profile")"

# The monitoring agent and the container log shipping.
emit CWAGENT_ACTIVE "$(systemctl is-active amazon-cloudwatch-agent 2>/dev/null || true)"
emit CWAGENT_ENABLED "$(systemctl is-enabled amazon-cloudwatch-agent 2>/dev/null || true)"
emit CWAGENT_VERSION "$(/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status 2>/dev/null \
  | grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"$' | tr -d '"')"
emit CWAGENT_KEY_ID "$([[ -n "$env_record" ]] && key_id_in /etc/amazon-cloudwatch-agent.aws/credentials "footbag-${env_record}-cwagent")"
# One inspect over every running container, each answering name:driver.
running_ids="$(docker ps -q 2>/dev/null || true)"
log_drivers=""
if [[ -n "$running_ids" ]]; then
  # shellcheck disable=SC2086  # one id per word is the intent
  log_drivers="$(docker inspect --format '{{.Name}}:{{.HostConfig.LogConfig.Type}}' $running_ids 2>/dev/null | sed 's#^/##' || true)"
fi
emit LOG_DRIVERS "$log_drivers"

# The deployed runtime and the backup timer.
emit SERVICE_ENABLED "$(systemctl is-enabled footbag 2>/dev/null || true)"
emit CONTAINERS "$(docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | paste -sd ',' - | sed 's/,/, /g')"
emit TIMER_ACTIVE "$(systemctl is-active footbag-backup.timer 2>/dev/null || true)"
emit TIMER_ENABLED "$(systemctl is-enabled footbag-backup.timer 2>/dev/null || true)"

# Swap. The deploy suppresses the compressed in-RAM device on staging for the
# next boot; until the host has rebooted it is still active.
swaps="$(swapon --show=NAME --noheadings 2>/dev/null || true)"
emit ZRAM_ACTIVE "$(grep -q '^/dev/zram' <<< "$swaps" && echo yes || echo no)"
emit ZRAM_SUPPRESSED "$([[ -f /etc/systemd/zram-generator.conf && ! -s /etc/systemd/zram-generator.conf ]] && echo yes || echo no)"
emit SWAPFILE "$(grep -qx /swapfile <<< "$swaps" && echo yes || echo no)"

echo "---FOOTBAG-END---"
