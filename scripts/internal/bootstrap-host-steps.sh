# shellcheck shell=bash
#
# The host bootstrap's steps, what proves each one done, and the command that
# finishes it. Sourced by scripts/bootstrap-host.sh, which runs the steps, and by
# scripts/bringup-status.sh, which reports them, so the two cannot disagree about
# what "done" means: a step the dashboard calls done is a step the bootstrap
# skips, and a step it calls pending names the command the bootstrap would run.
#
# Every verdict reads an outcome, never a marker a step left behind: the
# daemon's effective configuration, the package manager's record, the host
# resolving its own credential chain, the containers' own health checks, the
# Terraform plans, the pin file verified against the Lightsail API. The probes
# below gather those facts into the caller's associative array P; the verdict
# function judges one step from P and from nothing else, so a test can hand it a
# finished host and take one fact away at a time.
#
# The caller declares `declare -A P`, sets BH_TARGET, and has sourced
# scripts/lib/host-env-remote.sh (for the wire and the announced ssh seam).

BH_STEPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BH_REPO_ROOT="$(cd "${BH_STEPS_DIR}/../.." && pwd)"
BH_STATUS_HALF="${BH_STEPS_DIR}/bootstrap-host-status-remote.sh"
# The backup probe reads the bucket's name from Terraform.
# shellcheck source=../lib/terraform-output.sh
declare -F tf_output_read >/dev/null || source "${BH_REPO_ROOT}/scripts/lib/terraform-output.sh"

# The containers the deployed runtime consists of. A deploy that brought up some
# of them is not a deployed runtime: a missing worker sends no mail, a missing
# image service serves no media, and either looks healthy from the front page.
BH_CONTAINERS=(web worker image nginx)
# The ones that ship their output to CloudWatch Logs. The image service logs
# locally by design.
BH_LOGGING_CONTAINERS=(web worker nginx)
# The account the containers run as, which owns the database directory.
BH_APP_UID=1000

# The steps, in the order the bootstrap runs them.
BH_STEPS=(terraform pin account packages layout envrecord dbdir credentials cwagent deploy backup feeds sshd swap operatorkeys snapshot)

# Test seams (CI only; operators never set these). Each replaces one external
# binary or the directory sibling scripts are found in, and each is announced,
# because a run through a stand-in proves nothing about the estate.
BH_TF_BIN="${BOOTSTRAP_HOST_TF_BIN:-terraform}"
BH_AWS_BIN="${BOOTSTRAP_HOST_AWS_BIN:-aws}"
BH_SCRIPTS="${BOOTSTRAP_HOST_SCRIPTS_DIR:-${BH_REPO_ROOT}/scripts}"
BH_DEPLOY="${BOOTSTRAP_HOST_SCRIPTS_DIR:+${BOOTSTRAP_HOST_SCRIPTS_DIR}/deploy_to_aws.sh}"
BH_DEPLOY="${BH_DEPLOY:-${BH_REPO_ROOT}/deploy_to_aws.sh}"
BH_DEPLOY_CODE="${BH_SCRIPTS}/deploy-code.sh"
bh_announce_seams() {
  [[ -n "${BOOTSTRAP_HOST_TF_BIN:-}" ]] && echo "SYNTHETIC: terraform='${BH_TF_BIN}' -- this run proves nothing about the estate." >&2
  [[ -n "${BOOTSTRAP_HOST_AWS_BIN:-}" ]] && echo "SYNTHETIC: aws='${BH_AWS_BIN}' -- this run proves nothing about the estate." >&2
  [[ -n "${BOOTSTRAP_HOST_SCRIPTS_DIR:-}" ]] && echo "SYNTHETIC: sibling scripts from '${BH_SCRIPTS}' -- this run proves nothing about the estate." >&2
  return 0
}

# ── Probes ───────────────────────────────────────────────────────────────────

# bh_parse_status <stream>
# Reads the status half's KEY=VALUE lines into P. Returns 1 when the stream
# carries no status section, which is a host that did not answer.
bh_parse_status() {
  local stream="$1" line in=0
  grep -q '^---FOOTBAG-BOOTSTRAP-STATUS---$' <<< "$stream" || return 1
  while IFS= read -r line; do
    if [[ "$line" == "---FOOTBAG-BOOTSTRAP-STATUS---" ]]; then in=1; continue; fi
    [[ "$line" == "---FOOTBAG-END---" ]] && break
    (( in )) || continue
    [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] && P["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
  done <<< "$stream"
  return 0
}

# bh_probe_host <alias>
# Two sessions as the alias's account, through the wire. The first logs in and
# runs nothing privileged; the second runs the status body under sudo. Answering
# the second proves a key login on the alias's port and sudo accepting the
# password, which is the shared account's whole outcome; the body then reports
# everything else.
#
# The first exists because a host that does not answer the second can be in
# three states that call for opposite actions, and folding them together is what
# once sent a re-run down the first-login path on a working host:
#   unreachable     nothing answered on the alias's port. On a fresh instance
#                   that is expected, since only port 22 listens there.
#   login-refused   the host answered and refused footbag's key: no account yet,
#                   or an account without the key.
#   sudo-refused    footbag logged in, and sudo refused the password. That is an
#                   account that exists and is in use, so it is reported and
#                   never repaired: the first-login path would reset a password
#                   other people hold.
# P[HOST_PROBE] carries the state and P[HOST_PROBE_SAID] the client's own last
# line, so the operator reads what ssh said rather than a guess at it.
BH_LOGIN_SENTINEL="---FOOTBAG-LOGIN-OK---"
bh_probe_host() {
  local alias="$1" stream="" login="" rc=0
  P[HOST_REACHED]=no
  P[HOST_PROBE]=unknown
  P[HOST_PROBE_SAID]=""
  require_host_ssh_opts || { P[HOST_REACHED]=unknown; return 0; }
  login="$("$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$alias" "echo ${BH_LOGIN_SENTINEL}" </dev/null 2>&1)" || rc=$?
  if ! grep -qxF -- "$BH_LOGIN_SENTINEL" <<< "$login"; then
    P[HOST_PROBE_SAID]="$(grep -v '^[[:space:]]*$' <<< "$login" | tail -1 || true)"
    # OpenSSH's client reports an authentication failure as
    # "<user>@<host>: Permission denied (<methods>)." and exits 255; any other
    # failure to get a shell (refused, timed out, no route) is the host not
    # answering at all.
    if (( rc == 255 )) && grep -q 'Permission denied' <<< "$login"; then
      P[HOST_PROBE]=login-refused
    else
      P[HOST_PROBE]=unreachable
    fi
    return 0
  fi
  stream="$(
    {
      printf '%s\n' "$SUDO_PASS"
      cat "$BH_STATUS_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash -s footbag-bootstrap-status' 2>/dev/null
  )" || true
  if bh_parse_status "$stream"; then
    P[HOST_REACHED]=yes
    P[HOST_PROBE]=ok
  else
    P[HOST_PROBE]=sudo-refused
  fi
  return 0
}

# bh_probe_host_env <target>
# The host env verifier, which holds every value on the host against what
# Terraform publishes and the committed host config. Run only on a host that
# answered, with the one password line; P[HOST_ENV_VERIFY] stays unset otherwise,
# and the row says the verifier was not run rather than calling the record done.
bh_probe_host_env() {
  local rc=0
  [[ "${P[HOST_REACHED]:-}" == "yes" ]] || return 0
  printf '%s\n' "$SUDO_PASS" | bash "${BH_SCRIPTS}/verify-host-env.sh" --target "$1" >/dev/null 2>&1 || rc=$?
  (( rc == 0 )) && P[HOST_ENV_VERIFY]=ok || P[HOST_ENV_VERIFY]=fail
  return 0
}

# bh_backup_limit
# Sets BH_BACKUP_LIMIT to the oldest a healthy host's newest backup can be, in
# seconds: one timer interval plus the timer's own jitter, read from the unit the
# deploy installs. Returns 1 when the timer file cannot be read.
bh_backup_limit() {
  local timer="${BH_REPO_ROOT}/ops/systemd/footbag-backup.timer" interval jitter
  BH_BACKUP_LIMIT=""
  bh_to_secs() {
    local v="$1"
    case "$v" in
      *min) echo $(( ${v%min} * 60 )) ;;
      *s) echo "${v%s}" ;;
      *) echo "$v" ;;
    esac
  }
  interval="$(bh_to_secs "$(grep -E '^OnUnitActiveSec=' "$timer" 2>/dev/null | cut -d= -f2)")"
  jitter="$(bh_to_secs "$(grep -E '^RandomizedDelaySec=' "$timer" 2>/dev/null | cut -d= -f2)")"
  [[ "$interval" =~ ^[0-9]+$ && "${jitter:-0}" =~ ^[0-9]+$ ]] || return 1
  BH_BACKUP_LIMIT=$(( interval + ${jitter:-0} ))
}

# bh_newest_backup <bucket>
# Sets BH_NEWEST_BACKUP to the LastModified time of the newest routine backup
# object written today or yesterday (UTC), empty when there is none. Returns 1
# when the bucket could not be listed, which is not the same as no backup.
bh_newest_backup() {
  local bucket="$1" day newest
  BH_NEWEST_BACKUP=""
  for day in "$(date -u +%Y/%m/%d)" "$(date -u -d '1 day ago' +%Y/%m/%d)"; do
    # Every time, sorted here: an empty prefix has no Contents, which a projection
    # reads as None where a function over it would fail the whole call. The ISO
    # timestamps the listing returns sort as text.
    newest="$("$BH_AWS_BIN" s3api list-objects-v2 --bucket "$bucket" --prefix "routine/${day}/" \
      --query 'Contents[].LastModified' --output text </dev/null 2>/dev/null)" || return 1
    newest="$(tr -s '[:space:]' '\n' <<< "$newest" | grep -v -e '^$' -e '^None$' | sort | tail -1 || true)"
    if [[ -n "$newest" ]]; then
      BH_NEWEST_BACKUP="$newest"
      return 0
    fi
  done
  return 0
}

# bh_probe_pin <target>
bh_probe_pin() {
  local rc=0
  bash "${BH_SCRIPTS}/install-known-hosts.sh" --target "$1" --check </dev/null >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) P[PIN]=current ;;
    1) P[PIN]=stale ;;
    *) P[PIN]=unknown ;;
  esac
}

# bh_probe_terraform <target>
# The three trees an environment stands on, planned for drift.
bh_probe_terraform() {
  local target="$1" tree key rc
  for tree in "$target" shared identity; do
    key=TF_PLAN
    [[ "$tree" == shared ]] && key=TF_PLAN_SHARED
    [[ "$tree" == identity ]] && key=TF_PLAN_IDENTITY
    rc=0
    "$BH_TF_BIN" -chdir="${BH_REPO_ROOT}/terraform/${tree}" plan -detailed-exitcode -input=false -lock=false \
      </dev/null >/dev/null 2>&1 || rc=$?
    case "$rc" in
      0) P[$key]=insync ;;
      2) P[$key]=drift ;;
      *) P[$key]=unknown ;;
    esac
  done
  local state
  state="$("$BH_TF_BIN" -chdir="${BH_REPO_ROOT}/terraform/${target}" state list </dev/null 2>/dev/null || true)"
  if [[ -n "$state" ]]; then
    grep -q 'aws_sns_topic_subscription\.ses_feedback_feed' <<< "$state" \
      && P[TF_SES_SUBSCRIPTION]=present || P[TF_SES_SUBSCRIPTION]=absent
  fi
}

# bh_probe_aws <target>
# The identities a rebuilt host takes over, which keys each holds, whether the
# agent's metrics arrive where the alarms read them, the automatic snapshot,
# the feeds flag the values file declares, and on production the go-live
# marker. Each reads unknown rather than failing when it cannot be read.
bh_probe_aws() {
  local target="$1" ids rc
  ids="$("$BH_AWS_BIN" iam list-access-keys --user-name "footbag-${target}-source-profile" \
    --query 'AccessKeyMetadata[].AccessKeyId' --output text </dev/null 2>/dev/null)" \
    && P[IAM_SRC_KEYS]="$(tr -s '[:space:]' ' ' <<< "$ids" | sed 's/^ //; s/ $//; s/None//')" \
    || P[IAM_SRC_KEYS]=unknown
  ids="$("$BH_AWS_BIN" iam list-access-keys --user-name "footbag-${target}-cwagent-publisher" \
    --query 'AccessKeyMetadata[].AccessKeyId' --output text </dev/null 2>/dev/null)" \
    && P[IAM_CW_KEYS]="$(tr -s '[:space:]' ' ' <<< "$ids" | sed 's/^ //; s/ $//; s/None//')" \
    || P[IAM_CW_KEYS]=unknown
  # The inactive ones apart, because what may be done with a key depends on it:
  # an active key the host does not hold is retired, and only one already
  # inactive when it is read is ever deleted.
  ids="$("$BH_AWS_BIN" iam list-access-keys --user-name "footbag-${target}-source-profile" \
    --query 'AccessKeyMetadata[?Status==`Inactive`].AccessKeyId' --output text </dev/null 2>/dev/null)" \
    && P[IAM_SRC_INACTIVE]="$(tr -s '[:space:]' ' ' <<< "$ids" | sed 's/^ //; s/ $//; s/None//')" \
    || P[IAM_SRC_INACTIVE]=unknown
  ids="$("$BH_AWS_BIN" iam list-access-keys --user-name "footbag-${target}-cwagent-publisher" \
    --query 'AccessKeyMetadata[?Status==`Inactive`].AccessKeyId' --output text </dev/null 2>/dev/null)" \
    && P[IAM_CW_INACTIVE]="$(tr -s '[:space:]' ' ' <<< "$ids" | sed 's/^ //; s/ $//; s/None//')" \
    || P[IAM_CW_INACTIVE]=unknown

  # The newest backup object, which is what the timer exists to produce: a timer
  # active and enabled whose runs all fail reads done on its own state alone.
  P[BACKUP_AGE]=unknown
  if tf_output_read "${BH_REPO_ROOT}/terraform/${target}" snapshots_bucket_name 2>/dev/null \
       && [[ -n "$TF_OUTPUT_VALUE" ]] && bh_newest_backup "$TF_OUTPUT_VALUE"; then
    if [[ -z "$BH_NEWEST_BACKUP" ]]; then
      P[BACKUP_AGE]=none
    else
      local newest_epoch
      newest_epoch="$(date -u -d "$BH_NEWEST_BACKUP" +%s 2>/dev/null)" \
        && P[BACKUP_AGE]=$(( $(date -u +%s) - newest_epoch ))
    fi
  fi

  rc=0
  bash "${BH_SCRIPTS}/verify-cwagent-metrics.sh" --target "$target" </dev/null >/dev/null 2>&1 || rc=$?
  (( rc == 0 )) && P[CW_METRICS]=ok || P[CW_METRICS]=fail

  rc=0
  bash "${BH_SCRIPTS}/verify-host-snapshots.sh" --target "$target" </dev/null >/dev/null 2>&1 || rc=$?
  (( rc == 0 )) && P[SNAPSHOT]=ok || P[SNAPSHOT]=fail

  P[FEEDS_FLAG]="$(bh_tfvars_flag "$target" enable_feed_queues)"

  if [[ "$target" == "production" ]]; then
    local marker
    marker="$("$BH_AWS_BIN" ssm get-parameter --name /footbag/production/app/production_live \
      --region us-east-1 --query Parameter.Value --output text </dev/null 2>/dev/null || true)"
    case "$marker" in
      true|false) P[MARKER]="$marker" ;;
      *) P[MARKER]=unknown ;;
    esac
  fi
}

# bh_tfvars_flag <target> <name>
# Prints true or false as the environment's values file declares the flag, false
# when it does not mention it (every gate defaults off), unknown when the file
# cannot be read.
bh_tfvars_flag() {
  local file="${BOOTSTRAP_HOST_TFVARS:-${BH_REPO_ROOT}/terraform/$1/terraform.tfvars}" value
  [[ -r "$file" ]] || { echo unknown; return 0; }
  value="$(grep -E "^[[:space:]]*$2[[:space:]]*=" "$file" | tail -1 | sed -E 's/.*=[[:space:]]*([a-z]+).*/\1/' || true)"
  case "$value" in
    true) echo true ;;
    *) echo false ;;
  esac
}

# bh_manifest_pins
# The versions the host-tools manifest pins, which the packages and agent steps
# are judged against.
bh_manifest_pins() {
  host_tool COMPOSE_VERSION 2>/dev/null && P[PIN_COMPOSE_VERSION]="$HOST_TOOL_VALUE"
  host_tool CWAGENT_VERSION 2>/dev/null && P[PIN_CWAGENT_VERSION]="$HOST_TOOL_VALUE"
  return 0
}

# ── Verdicts ─────────────────────────────────────────────────────────────────

BH_STATE=""
BH_TITLE=""
BH_DETAIL=""
BH_NEXT=""

bh_has_word() { [[ " $1 " == *" $2 "* ]]; }
bh_sorted_words() { tr -s '[:space:]' '\n' <<< "$1" | grep -v '^$' | sort -u | tr '\n' ' ' || true; }

# bh_container_health <name>
# Prints the status the named service's container reports, or "absent".
bh_container_health() {
  local svc="$1" entry
  local IFS=','
  for entry in ${P[CONTAINERS]:-}; do
    entry="${entry# }"
    local name="${entry%% *}" status="${entry#* }"
    if [[ "$name" =~ (^|[-_])${svc}([-_][0-9]+)?$ ]]; then
      printf '%s' "$status"
      return 0
    fi
  done
  printf 'absent'
}

# bh_extra_keys <iam-key-list> <host-key-id>
# The user's keys other than the one the host holds: the dead host's, to retire.
bh_extra_keys() {
  local k out=""
  for k in $1; do
    [[ "$k" == "$2" ]] || out+="${k} "
  done
  printf '%s' "${out% }"
}

# bh_keys_in <key-list> <subset-list>
# The keys of the first list that are also in the second.
bh_keys_in() {
  local k out=""
  for k in $1; do
    bh_has_word "$2" "$k" && out+="${k} "
  done
  printf '%s' "${out% }"
}

# bh_cwagent_key_in_service
# True when the agent on the host holds one of the publisher's keys, so an
# upgrade can keep it rather than mint another.
bh_cwagent_key_in_service() {
  [[ -n "${P[CWAGENT_KEY_ID]:-}" && "${P[IAM_CW_KEYS]-unknown}" != "unknown" ]] \
    && bh_has_word "${P[IAM_CW_KEYS]}" "${P[CWAGENT_KEY_ID]}"
}

# bh_retirement_verdict <keys> <inactive> <host-key> <done-detail> <subject> <retire-cmd> <delete-cmd>
# The pending state of a user still holding keys its host does not use. An
# active one is retired; one already inactive is deleted. The two are never the
# same run for the same key: a key is deleted only once it has been seen
# inactive, so whatever still held it has had the time between to fail visibly.
bh_retirement_verdict() {
  local keys="$1" inactive="$2" host_key="$3" done_detail="$4" subject="$5" retire="$6" delete="$7"
  local extra active dead k
  extra="$(bh_extra_keys "$keys" "$host_key")"
  if [[ -z "$extra" ]]; then
    BH_STATE=DONE; BH_DETAIL="$done_detail"
    return 0
  fi
  dead="$(bh_keys_in "$extra" "$inactive")"
  active=""
  for k in $extra; do bh_has_word "$dead" "$k" || active+="${k} "; done
  active="${active% }"
  BH_STATE=PENDING
  if [[ -n "$active" ]]; then
    BH_DETAIL="${subject} still holds ${active}, active, which the host does not use"
    BH_NEXT="${retire} --retire <id>, for: ${active}; then, on a later run once it reads inactive, ${delete} --delete <id>"
    [[ -n "$dead" ]] && BH_DETAIL+="; and ${dead}, already inactive, to delete"
  else
    BH_DETAIL="${subject} still holds ${dead}, inactive, which the host does not use"
    BH_NEXT="${delete} --delete <id>, for: ${dead}"
  fi
  return 0
}

# bh_verdict <step>
# Sets BH_TITLE, BH_STATE (DONE, PENDING, UNKNOWN, N-A or INFO), BH_DETAIL and
# BH_NEXT, the command that finishes the step, from P alone.
bh_verdict() {
  local step="$1" t="$BH_TARGET" cred="${BH_CRED:-<operator credential file>}"
  local reached="${P[HOST_REACHED]:-unknown}" missing="" k
  BH_STATE=UNKNOWN; BH_DETAIL=""; BH_NEXT=""
  local self="< ${cred} bash scripts/bootstrap-host.sh --target ${t}"

  # Every host-side verdict needs the host to have answered. One that did not is
  # pending on the account step, which is the first thing a fresh instance lacks,
  # and unknown everywhere after it.
  host_gate() {
    if [[ "$reached" == "yes" ]]; then return 0; fi
    BH_STATE=UNKNOWN
    BH_DETAIL="the host did not answer as the shared account, so this was not read"
    BH_NEXT="$self"
    return 1
  }

  case "$step" in
    terraform)
      BH_TITLE="Terraform"
      local pending="" unread=""
      for k in shared:TF_PLAN_SHARED identity:TF_PLAN_IDENTITY "${t}:TF_PLAN"; do
        case "${P[${k#*:}]:-unknown}" in
          insync) ;;
          drift) pending+="${k%%:*} " ;;
          *) unread+="${k%%:*} " ;;
        esac
      done
      if [[ -n "$pending" ]]; then
        BH_STATE=PENDING; BH_DETAIL="pending changes in: ${pending% }"
      elif [[ -n "$unread" ]]; then
        BH_STATE=UNKNOWN; BH_DETAIL="plan not read for: ${unread% }"
      else
        BH_STATE=DONE; BH_DETAIL="no changes pending in shared, identity or ${t}"
      fi
      BH_NEXT="bash scripts/terraform-apply-all.sh --target ${t}"
      ;;

    pin)
      BH_TITLE="Pinned host key"
      case "${P[PIN]:-unknown}" in
        current) BH_STATE=DONE; BH_DETAIL="the pin matches the keys Lightsail reports for ${P[INSTANCE]:-the ${t} web instance}" ;;
        stale) BH_STATE=PENDING; BH_DETAIL="the pin is missing, stale, or still carries a previous address" ;;
        *) BH_STATE=UNKNOWN; BH_DETAIL="the pin was not checked" ;;
      esac
      BH_NEXT="bash scripts/install-known-hosts.sh --target ${t}"
      ;;

    account)
      BH_TITLE="Shared account, sshd ports"
      BH_NEXT="$self"
      if [[ "$reached" == "no" ]]; then
        BH_STATE=PENDING
        local said="${P[HOST_PROBE_SAID]:-}"
        case "${P[HOST_PROBE]:-}" in
          sudo-refused)
            BH_DETAIL="footbag logs in on the alias, but sudo refuses the password on line 1 of ${cred}. The account exists and is in use, so this is reported and never repaired: the bootstrap does not reset an existing account's password"
            BH_NEXT="check line 1 of ${cred} against the vault entry for the ${t} host account; a password that must change is changed on the host, through the Lightsail browser console"
            ;;
          login-refused)
            BH_DETAIL="the host refuses footbag's key (${said:-no reason given}); a fresh instance has no footbag account yet, and its first login is ec2-user on port 22"
            ;;
          unreachable)
            BH_DETAIL="nothing answered as footbag on the alias's port (${said:-no reason given}); a fresh instance listens on port 22 only, and its first login is ec2-user there"
            ;;
          *)
            BH_DETAIL="the shared footbag account does not answer on the alias with its sudo password (a fresh instance: first login is ec2-user on port 22)"
            ;;
        esac
      elif [[ "$reached" != "yes" ]]; then
        BH_STATE=UNKNOWN; BH_DETAIL="the host was not probed"
      else
        [[ "${P[ACCOUNT_WHEEL]:-}" == "yes" ]] || missing+="footbag in wheel; "
        [[ "${P[ACCOUNT_KEYS]:-0}" =~ ^[1-9][0-9]*$ ]] || missing+="an authorized key on footbag; "
        # Both the configuration sshd would run and the sockets the running daemon
        # holds: a drop-in written and never reloaded names 2222 in the first and
        # leaves nothing listening there.
        bh_has_word "${P[SSHD_PORTS]:-}" 22 || missing+="sshd configured on 22; "
        bh_has_word "${P[SSHD_PORTS]:-}" 2222 || missing+="sshd configured on 2222; "
        bh_has_word "${P[SSHD_LISTEN]:-}" 22 || missing+="sshd listening on 22 (listening on: ${P[SSHD_LISTEN]:-nothing}); "
        bh_has_word "${P[SSHD_LISTEN]:-}" 2222 || missing+="sshd listening on 2222 (listening on: ${P[SSHD_LISTEN]:-nothing}); "
        if [[ -z "$missing" ]]; then
          BH_STATE=DONE; BH_DETAIL="footbag logs in with its key, sudo takes its password, in wheel; sshd listens on ${P[SSHD_LISTEN]}"
        else
          BH_STATE=PENDING; BH_DETAIL="missing: ${missing%; }"
        fi
      fi
      ;;

    packages)
      BH_TITLE="Host tools"
      BH_NEXT="$self"
      host_gate || return 0
      [[ "${P[DOCKER_ACTIVE]:-}" == "active" && "${P[DOCKER_ENABLED]:-}" == "enabled" ]] || missing+="docker running and enabled; "
      local want="${P[PIN_COMPOSE_VERSION]:-}" have="${P[COMPOSE_VERSION]:-none}"
      [[ -n "$want" && "v${have#v}" == "$want" ]] || missing+="Compose plugin ${want:-<unpinned>} (host has ${have}); "
      [[ "${P[SQLITE]:-}" == "yes" ]] || missing+="sqlite3; "
      [[ "${P[RSYNC]:-}" == "yes" ]] || missing+="rsync; "
      [[ "${P[AWSCLI]:-}" == "yes" ]] || missing+="the aws CLI; "
      if [[ -z "$missing" ]]; then
        BH_STATE=DONE; BH_DETAIL="docker running, Compose ${want}, sqlite3, rsync, aws"
      else
        BH_STATE=PENDING; BH_DETAIL="missing: ${missing%; }"
      fi
      ;;

    layout)
      BH_TITLE="/srv/footbag and env file"
      BH_NEXT="$self"
      host_gate || return 0
      [[ "${P[SRV_DIR]:-absent}" == root:root* ]] || missing+="/srv/footbag root-owned (${P[SRV_DIR]:-absent}); "
      [[ "${P[ENV_FILE]:-absent}" == "root:root 600" ]] || missing+="/srv/footbag/env root:root 600 (${P[ENV_FILE]:-absent}); "
      if [[ -z "$missing" ]]; then
        BH_STATE=DONE; BH_DETAIL="/srv/footbag root-owned, env file root:root 600"
      else
        BH_STATE=PENDING; BH_DETAIL="missing: ${missing%; }"
      fi
      ;;

    envrecord)
      BH_TITLE="Host environment record"
      BH_NEXT="< ${cred} bash scripts/set-host-env.sh --target ${t}"
      host_gate || return 0
      # The record naming the environment is what every later step asks the host
      # first, but the file holds every value the runtime reads, so the row reads
      # done only on the verifier that holds each one against what Terraform
      # publishes and the committed host config.
      case "${P[FOOTBAG_ENV]:-}" in
        "$t")
          case "${P[HOST_ENV_VERIFY]:-}" in
            ok) BH_STATE=DONE; BH_DETAIL="the host records FOOTBAG_ENV=${t}, and scripts/verify-host-env.sh passes" ;;
            fail) BH_STATE=PENDING
                  BH_DETAIL="the host records FOOTBAG_ENV=${t}, but scripts/verify-host-env.sh fails: a value on the host differs from what the estate declares"
                  BH_NEXT="< ${cred} bash scripts/verify-host-env.sh --target ${t}   (each FAIL names its fix; most are closed by a deploy)" ;;
            *) BH_STATE=UNKNOWN
               BH_DETAIL="the host records FOOTBAG_ENV=${t}; the host env verifier was not run, so the rest of the file was not checked"
               BH_NEXT="< ${cred} bash scripts/verify-host-env.sh --target ${t}" ;;
          esac
          ;;
        "") BH_STATE=PENDING; BH_DETAIL="the host records no FOOTBAG_ENV" ;;
        *) BH_STATE=PENDING
           BH_DETAIL="the host records FOOTBAG_ENV=${P[FOOTBAG_ENV]}: this alias reaches the other environment's host"
           BH_NEXT="check the HostName for footbag-${t} in ~/.ssh/config; nothing may run against this host as ${t}" ;;
      esac
      ;;

    dbdir)
      BH_TITLE="Database directory"
      BH_NEXT="$self"
      host_gate || return 0
      if [[ "${P[DB_DIR]:-absent}" == "${BH_APP_UID}:${BH_APP_UID}" ]]; then
        BH_STATE=DONE; BH_DETAIL="/srv/footbag/db owned ${BH_APP_UID}:${BH_APP_UID}"
      else
        BH_STATE=PENDING; BH_DETAIL="/srv/footbag/db is ${P[DB_DIR]:-absent}, not ${BH_APP_UID}:${BH_APP_UID}"
      fi
      ;;

    credentials)
      BH_TITLE="Host credential chain"
      host_gate || return 0
      local installer="scripts/install-host-credentials.sh --target ${t}"
      if [[ "${P[CRED_CHAIN]:-fail}" != "ok" ]]; then
        BH_STATE=PENDING; BH_DETAIL="the host does not resolve its runtime role"
        BH_NEXT="< ${cred} bash ${installer} --rotate"
      elif [[ "${P[IAM_SRC_KEYS]-unknown}" == "unknown" ]]; then
        BH_STATE=UNKNOWN; BH_DETAIL="the host resolves its runtime role; the user's keys were not read"
      elif [[ -z "${P[CRED_KEY_ID]:-}" ]]; then
        BH_STATE=UNKNOWN
        BH_DETAIL="the host resolves its runtime role, but the key id it holds reads empty, so the user's keys cannot be told apart and none is retired"
        BH_NEXT="< ${cred} bash ${installer} --rotate   (gives the host a key whose id it records)"
      else
        bh_retirement_verdict "${P[IAM_SRC_KEYS]}" "${P[IAM_SRC_INACTIVE]:-}" "${P[CRED_KEY_ID]}" \
          "the host resolves its runtime role with ${P[CRED_KEY_ID]}, the user's only key" \
          "the host resolves its chain; the user" "< ${cred} bash ${installer}" "bash ${installer}"
      fi
      ;;

    cwagent)
      BH_TITLE="CloudWatch agent"
      host_gate || return 0
      local cw="scripts/install-cwagent-${t}.sh" want="${P[PIN_CWAGENT_VERSION]:-}"
      if [[ "${P[CWAGENT_ACTIVE]:-}" != "active" || "${P[CWAGENT_ENABLED]:-}" != "enabled" ]]; then
        BH_STATE=PENDING; BH_DETAIL="the agent is not running and enabled"
        BH_NEXT="< ${cred} bash ${cw} --rotate"
      elif [[ -z "$want" || "${P[CWAGENT_VERSION]:-}" != "$want" ]]; then
        BH_STATE=PENDING; BH_DETAIL="the agent runs ${P[CWAGENT_VERSION]:-an unknown version}, not the pinned ${want:-<unpinned>}"
        # A version bump is a package change, not a credential change: a host
        # holding one of the publisher's keys keeps it.
        if bh_cwagent_key_in_service; then
          BH_NEXT="< ${cred} bash ${cw} --upgrade"
        else
          BH_NEXT="< ${cred} bash ${cw} --rotate"
        fi
      elif [[ "${P[CW_METRICS]:-}" != "ok" ]]; then
        BH_STATE=PENDING; BH_DETAIL="the agent runs, but its metrics are not arriving where the alarms read them"
        BH_NEXT="bash scripts/verify-cwagent-metrics.sh --target ${t}   (allow a few minutes after an install)"
      elif [[ "${P[IAM_CW_KEYS]-unknown}" == "unknown" ]]; then
        BH_STATE=UNKNOWN; BH_DETAIL="the agent publishes; the publisher's keys were not read"
      elif [[ -z "${P[CWAGENT_KEY_ID]:-}" ]]; then
        BH_STATE=UNKNOWN
        BH_DETAIL="the agent publishes, but the key id the host holds reads empty, so the publisher's keys cannot be told apart and none is retired"
        BH_NEXT="< ${cred} bash ${cw} --rotate"
      else
        bh_retirement_verdict "${P[IAM_CW_KEYS]}" "${P[IAM_CW_INACTIVE]:-}" "${P[CWAGENT_KEY_ID]}" \
          "agent ${want} running, metrics arriving, publishing with the publisher's only key" \
          "the agent publishes; the publisher" "< ${cred} bash ${cw}" "bash ${cw}"
      fi
      ;;

    deploy)
      BH_TITLE="Deployed runtime"
      if [[ "$t" == "staging" ]]; then
        BH_NEXT="./deploy_to_aws.sh --target staging --from-csv"
      else
        case "${P[MARKER]:-unknown}" in
          true) BH_NEXT="$self   (production is live, so the rebuild deploy is refused for good: on a host with no database it installs the release without starting it, restores the database with scripts/restore-db.sh --onto-empty, whose erasure replay runs before the site serves, then runs ./deploy_to_aws.sh --target production)" ;;
          false) BH_NEXT="./deploy_to_aws.sh --target production --all-data -W" ;;
          *) BH_NEXT="read the production-live marker first (scripts/production-live-marker.sh --status --profile <profile>): it decides between the rebuild deploy and a restore" ;;
        esac
      fi
      host_gate || return 0
      # A restore whose erasure replay did not finish holds the site down by
      # design, and no deploy brings it back; the replay's own resume does.
      if [[ "${P[REPLAY_PENDING]:-no}" == "yes" ]]; then
        BH_STATE=PENDING
        BH_DETAIL="a restore's erasure replay is pending on the host, so the site is held down and backups are paused"
        BH_NEXT="< ${cred} bash scripts/restore-db.sh --target ${t} --resume-erasure-replay"
        return 0
      fi
      local svc health
      for svc in "${BH_CONTAINERS[@]}"; do
        health="$(bh_container_health "$svc")"
        [[ "$health" == Up*"(healthy)"* ]] || missing+="${svc} (${health}); "
      done
      local drivers="${P[LOG_DRIVERS]:-}"
      for svc in "${BH_LOGGING_CONTAINERS[@]}"; do
        grep -qE "(^|[[:space:]])[^[:space:]]*[-_]?${svc}([-_][0-9]+)?:awslogs([[:space:]]|$)" <<< "$drivers" \
          || missing+="${svc} shipping logs to CloudWatch; "
      done
      [[ "${P[SERVICE_ENABLED]:-}" == "enabled" ]] || missing+="footbag.service enabled at boot; "
      if [[ -z "$missing" ]]; then
        BH_STATE=DONE; BH_DETAIL="web, worker, image and nginx healthy; logs shipping; the service starts at boot"
      else
        BH_STATE=PENDING; BH_DETAIL="not yet: ${missing%; }"
      fi
      ;;

    backup)
      BH_TITLE="Backup timer"
      BH_NEXT="< ${cred} bash scripts/install-backup-timer.sh --target ${t}"
      host_gate || return 0
      if [[ "${P[TIMER_ACTIVE]:-}" != "active" || "${P[TIMER_ENABLED]:-}" != "enabled" ]]; then
        BH_STATE=PENDING; BH_DETAIL="footbag-backup.timer is ${P[TIMER_ACTIVE]:-unknown} / ${P[TIMER_ENABLED]:-unknown}"
        return 0
      fi
      # The timer running is not the backups landing: what the step exists to
      # produce is an object in the bucket, recent enough that a host lost now
      # loses at most one interval.
      local age="${P[BACKUP_AGE]:-unknown}" limit=""
      bh_backup_limit && limit="$BH_BACKUP_LIMIT"
      local inspect="bash scripts/host-diagnostics.sh --target ${t} status   (the backup service's journal says why its runs fail)"
      if [[ "$age" == "none" ]]; then
        BH_STATE=PENDING; BH_DETAIL="the timer is active and enabled, but the bucket holds no backup from today or yesterday"
        BH_NEXT="$inspect"
      elif [[ ! "$age" =~ ^[0-9]+$ || -z "$limit" ]]; then
        BH_STATE=UNKNOWN; BH_DETAIL="the timer is active and enabled; the newest backup object was not read"
        BH_NEXT=""
      elif (( age > limit )); then
        BH_STATE=PENDING; BH_DETAIL="the timer is active and enabled, but the newest backup is ${age}s old, older than one interval (${limit}s)"
        BH_NEXT="$inspect"
      else
        BH_STATE=DONE; BH_DETAIL="footbag-backup.timer active and enabled; the newest backup is ${age}s old"
      fi
      ;;

    feeds)
      BH_TITLE="Notification feeds"
      BH_NEXT="< ${cred} bash scripts/activate-notification-feeds.sh --target ${t} --state on"
      case "${P[FEEDS_FLAG]:-unknown}" in
        false) BH_STATE=N-A; BH_DETAIL="enable_feed_queues is off in the values file"; BH_NEXT="" ;;
        true)
          # Subscribed in Terraform state is half of it: the worker polls only the
          # queues whose URLs the host holds, and the activation's deploy is what
          # puts them there.
          case "${P[TF_SES_SUBSCRIPTION]:-unknown}" in
            present)
              if [[ "$reached" != "yes" ]]; then
                BH_STATE=UNKNOWN; BH_DETAIL="on in the values file and subscribed in Terraform state; the host was not read for its queue URLs"
              elif [[ "${P[FEED_SES_QUEUE]:-}" == "set" && "${P[FEED_ALARM_QUEUE]:-}" == "set" ]]; then
                BH_STATE=DONE; BH_DETAIL="on in the values file, subscribed in Terraform state, and the host holds both queue URLs"
              else
                BH_STATE=PENDING
                BH_DETAIL="subscribed in Terraform state, but the host holds SES_FEEDBACK_QUEUE_URL ${P[FEED_SES_QUEUE]:-unset} and ALARM_QUEUE_URL ${P[FEED_ALARM_QUEUE]:-unset}, so the worker polls nothing"
              fi
              ;;
            absent) BH_STATE=PENDING; BH_DETAIL="on in the values file, but no queue is subscribed in Terraform state" ;;
            *) BH_STATE=UNKNOWN; BH_DETAIL="on in the values file; Terraform state was not read" ;;
          esac
          ;;
        *) BH_STATE=UNKNOWN; BH_DETAIL="the values file could not be read" ;;
      esac
      ;;

    sshd)
      BH_TITLE="sshd posture"
      host_gate || return 0
      if [[ "${P[SSHD_REVERT_PENDING]:-no}" == "yes" ]]; then
        BH_STATE=PENDING; BH_DETAIL="a hardening change is applied but unconfirmed, and its revert timer is running"
        BH_NEXT="< ${cred} bash scripts/harden-sshd.sh --target ${t} --confirm"
      elif [[ "$(bh_sorted_words "${P[SSHD_PORTS]:-}")" != "$(bh_sorted_words "${P[SSHD_LISTEN]:-}")" ]]; then
        # sshd -T reads the configuration a daemon would start with; the sockets
        # are what the running one holds. Apart, the posture read above is the
        # file's, not the daemon's, which has not been reloaded since it changed.
        BH_STATE=PENDING
        BH_DETAIL="sshd's configuration names ports '${P[SSHD_PORTS]:-}', but the running daemon listens on '${P[SSHD_LISTEN]:-nothing}': it has not been reloaded since its configuration changed"
        BH_NEXT="< ${cred} bash scripts/harden-sshd.sh --target ${t} --apply"
      elif [[ "${P[SSHD_ROOT]:-}" == "no" && "${P[SSHD_PASSWORD]:-}" == "no" && "${P[SSHD_KBD]:-}" == "no" ]]; then
        BH_STATE=DONE; BH_DETAIL="root, password and keyboard-interactive login all refused; the running daemon listens on ${P[SSHD_LISTEN]}"
      else
        BH_STATE=PENDING
        BH_DETAIL="permitrootlogin ${P[SSHD_ROOT]:-?}, passwordauthentication ${P[SSHD_PASSWORD]:-?}, kbdinteractiveauthentication ${P[SSHD_KBD]:-?}"
        BH_NEXT="< ${cred} bash scripts/harden-sshd.sh --target ${t} --apply"
      fi
      ;;

    swap)
      BH_TITLE="Swap"
      BH_NEXT="$self   (the deploy provisions the swap file; the bootstrap's closing reboot retires compressed swap on staging)"
      host_gate || return 0
      [[ "${P[SWAPFILE]:-}" == "yes" ]] || missing+="the disk swap file; "
      if [[ "$t" == "staging" ]]; then
        [[ "${P[ZRAM_ACTIVE]:-}" == "no" ]] || missing+="compressed in-RAM swap still active (suppressed: ${P[ZRAM_SUPPRESSED]:-?}; takes a reboot); "
      fi
      if [[ -z "$missing" ]]; then
        BH_STATE=DONE; BH_DETAIL="disk swap file active"
        if [[ "$t" == "staging" ]]; then BH_DETAIL+="; no compressed in-RAM swap"; fi
      else
        BH_STATE=PENDING; BH_DETAIL="not yet: ${missing%; }"
      fi
      ;;

    operatorkeys)
      BH_TITLE="Administrator keys"
      BH_NEXT="< ${cred} bash scripts/authorize-operator-key.sh --target ${t} --account footbag --operator '<name>' --key-line '<key>'   (once per administrator)"
      host_gate || return 0
      BH_STATE=INFO
      BH_DETAIL="${P[ACCOUNT_KEYS]:-0} key(s) on footbag. No record lists the administrators' keys, so who else needs one is not checkable here"
      ;;

    snapshot)
      BH_TITLE="Recent host snapshot"
      BH_NEXT="bash scripts/verify-host-snapshots.sh --target ${t}   (the daily automatic snapshot appears within a day of the instance's creation)"
      case "${P[SNAPSHOT]:-unknown}" in
        ok) BH_STATE=DONE; BH_DETAIL="an automatic snapshot younger than a day and two hours" ;;
        fail) BH_STATE=PENDING; BH_DETAIL="no automatic snapshot younger than a day and two hours" ;;
        *) BH_STATE=UNKNOWN; BH_DETAIL="not read" ;;
      esac
      ;;

    *)
      BH_TITLE="$step"; BH_STATE=UNKNOWN; BH_DETAIL="no such step"
      ;;
  esac
  return 0
}

# The milestone-gated steps, which the bootstrap names and stops before. Each
# waits on an event no script can decide, so running it here would be running it
# early, and skipping it in silence would leave it forgotten.
bh_milestones() {
  local t="$1"
  echo "Stopped before the milestone-gated steps, which run when their milestone arrives:"
  if [[ "$t" == "production" ]]; then
    echo "  - payments activation (at the payments-activation milestone):"
    echo "      < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/activate-payments.sh \\"
    echo "        --target production --profile <prod-profile>"
    echo "  - first admin (once, on a production with no administrator):"
    echo "      bash scripts/admin-bootstrap-token.sh --target production \\"
    echo "        --profile <prod-profile> provision"
    echo "  - cutover login alarm (for the cutover window only):"
    echo "      enable_cutover_login_alarm = true in the values file, then"
    echo "      bash scripts/terraform-apply.sh --target production"
  else
    echo "  - payments activation, first admin and the cutover login alarm are"
    echo "    production steps; staging runs the stub payment adapter and takes its"
    echo "    administrators from the dev bootstrap."
  fi
}
