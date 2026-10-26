#!/usr/bin/env bash
# The catalogue of every value a deployed host's /srv/footbag/env carries, and
# the one sync that writes the Terraform-published ones.
#
# WHY ONE LIST.
#
# Every value in that file has exactly one owner, and the owner decides how the
# value reaches the host. Before this list, each script that had an opinion kept
# its own: both deploy halves named the parameters they synced, the preflight
# named the ones it required, the verifier named the ones it checked, and tests
# held the copies equal. A value added to one and forgotten in another reached
# some hosts and not others, and nothing failed until a host was rebuilt and came
# up without it. Here each value is declared once, with its owner, and every
# consumer reads this.
#
# It is also the per-value documentation. The runbooks point here rather than
# re-listing values, so a list in prose cannot drift from the one the code uses.
#
# HOW IT TRAVELS.
#
# Workstation scripts source it. The deploy halves receive it on the same ssh
# stream as their own body, ahead of it, the way the pruning helper travels, so
# the host never needs operator tooling installed. It defines data and functions
# and runs nothing.
#
# EACH ENTRY is KEY|class|source|required|pattern|reason. The classes:
#
#   param      Terraform publishes it as /footbag/<env>/<source>; every deploy
#              copies it onto the host unchanged. pattern checks its shape.
#   derived    The deploy computes it from a parameter (an adapter selector from
#              its arming switch). source names the parameter it follows.
#   secret     A SecureString parameter under secrets/; the deploy fetches,
#              validates and writes it in a block of its own.
#   committed  docker/env/<env>.env declares it; every deploy applies that file.
#   generated  The deploy generates it on the host when absent, because the
#              channel it protects never leaves the host.
#   record     The host's own record, written once by its bring-up step and only
#              checked afterwards.
#   sent       The deploy writes it from a value the workstation sends.
#   compose    Not held on a host at all: the compose files supply the value, and
#              the line exists only for a workstation's own run.
#   unowned    Declared here so it is not forgotten, with the card that owns
#              closing it named in the reason.
#
# required is "required" or "optional". An optional param whose parameter does
# not exist is cleared from the host rather than left at a stale value.

HOST_VALUES=(
  # Terraform-published identifiers, copied unchanged.
  "MEDIA_STORAGE_S3_BUCKET|param|app/media_bucket|required|^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$|the bucket processed photos and videos are written to and served from"
  "JWT_KMS_KEY_ID|param|app/jwt_kms_key_id|required|^alias/[A-Za-z0-9/_-]+$|stamped into every session token's key-id header; the alias, never the ARN, so the account id is not published"
  "SES_CONFIGURATION_SET_TRANSACTIONAL|param|app/ses_configuration_set_transactional|required|^[A-Za-z0-9_-]+$|keeps password resets on a sending reputation a broadcast cannot damage"
  "SES_CONFIGURATION_SET_BULK|param|app/ses_configuration_set_bulk|required|^[A-Za-z0-9_-]+$|carries broadcast mail on its own reputation"
  "BACKUP_S3_BUCKET|param|app/snapshots_bucket|required|^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$|where the backup timer uploads snapshots; absent, the timer runs and uploads nothing"
  "ALARM_TOPIC_ARN|param|app/alarm_topic_arn|required|^arn:aws:sns:[a-z0-9-]+:[0-9]{12}:[A-Za-z0-9_-]+$|the only topic the platform-alarm feed accepts a message from"
  "SES_FEEDBACK_TOPIC_ARN|param|app/ses_feedback_topic_arn|required|^arn:aws:sns:[a-z0-9-]+:[0-9]{12}:[A-Za-z0-9_-]+$|the only topic the bounce and complaint feed accepts a message from"
  "ALARM_QUEUE_URL|param|app/alarm_queue_url|optional|^https://sqs\.[a-z0-9-]+\.amazonaws\.com/[0-9]{12}/[A-Za-z0-9_-]+$|the queue the worker polls for alarms; absent until the feed queues are enabled"
  "SES_FEEDBACK_QUEUE_URL|param|app/ses_feedback_queue_url|optional|^https://sqs\.[a-z0-9-]+\.amazonaws\.com/[0-9]{12}/[A-Za-z0-9_-]+$|the queue the worker polls for bounces and complaints; absent until the feed queues are enabled"
  "SES_FROM_IDENTITY|param|app/ses_sender_identity|required|^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$|the verified identity every message is sent as; a wrong one fails at the drain, not at boot"
  "PUBLIC_BASE_URL|param|app/public_base_url|required|^https://[A-Za-z0-9.-]+$|the origin every absolute link, redirect and mail link is built against; moves with the custom-domain and notice flags"

  # Values the deploy derives, fetches or generates in blocks of their own.
  "LOG_LEVEL|derived|app/log_level|required||synced from its parameter and checked against the levels the logger accepts"
  "PAYMENTS_ARMED|derived|app/payments_armed|required||the switch the payment selector is derived from"
  "PAYMENT_ADAPTER|derived|app/payments_armed|required||live only when armed on production; the stub everywhere else"
  "EMAIL_SEND_ARMED|derived|app/email_send_armed|required||the switch the mail selector is derived from"
  "SES_ADAPTER|derived|app/email_send_armed|required||live only when armed on production; the stub everywhere else"
  "URL_SCREENING_ARMED|derived|app/url_screening_armed|required||the switch the link-screening selector is derived from"
  "SAFE_BROWSING_ADAPTER|derived|app/url_screening_armed|required||derived from its switch in every deployed environment"
  "REACHABILITY_ARMED|derived|app/reachability_armed|required||the switch the link-reachability selector is derived from"
  "HTTP_REACHABILITY_ADAPTER|derived|app/reachability_armed|required||derived from its switch in every deployed environment"
  "ARCHIVE_URL|derived|app/archive_url|optional||the archive's base address; absent while the archive stack is off, which hides its card"
  "ARCHIVE_LOGIN_REDIRECT|derived|app/archive_login_redirect|optional||where the archive sends a visitor without a cookie; absent while the archive stack is off"
  "SESSION_SECRET|secret|secrets/session_secret|required||generated by Terraform; length and placeholder checked before it is written"
  "X_ORIGIN_VERIFY_SECRET|secret|secrets/origin_verify_secret|required||the header CloudFront adds and nginx requires, so the origin answers nobody else"
  "STRIPE_WEBHOOK_SECRET|secret|secrets/stripe_webhook_secret|optional||the live webhook signing secret, once payments are activated"
  "STRIPE_WEBHOOK_SECRET_PREVIOUS|secret|secrets/stripe_webhook_secret_previous|optional||the outgoing secret during a rotation window"
  "INTERNAL_EVENT_SECRET|generated|host|required||authenticates the worker-to-web channel, which never leaves the host"
  "STRIPE_WEBHOOK_SECRET_STUB|generated|host|optional||the stub adapter's signing secret below production, unique per host"

  # Declared in the committed per-environment file.
  "TRUST_PROXY|committed|docker/env|required||the exact forwarded-for hop count, CloudFront then nginx"
  "FOOTBAG_DB_DIR|committed|docker/env|required||the directory the containers mount at /app/db"
  "FOOTBAG_DB_PATH|committed|docker/env|required||the database file inside that directory, which the rebuild deploy replaces"
  "AWS_REGION|committed|docker/env|required||the region every resource of the environment lives in"
  "AWS_PROFILE|committed|docker/env|required||the host profile that assumes the application's runtime role"
  "MEDIA_STORAGE_ADAPTER|committed|docker/env|required||object storage on every deployed host"
  "SECRETS_ADAPTER|committed|docker/env|required||Parameter Store on every deployed host"
  "JWT_SIGNER|committed|docker/env|required||KMS on every deployed host"
  "CAPTCHA_ADAPTER|committed|docker/env|required||live on production, the stub on staging, which serves no widget"
  "TURNSTILE_SITE_KEY|committed|docker/env|optional||the captcha widget's public key, required wherever the live captcha runs"
  "NGINX_MEMORY_LIMIT|committed|docker/env|required||container sizing for this host"
  "WEB_MEMORY_LIMIT|committed|docker/env|required||container sizing for this host"
  "WORKER_MEMORY_LIMIT|committed|docker/env|required||container sizing for this host"
  "IMAGE_MEMORY_LIMIT|committed|docker/env|required||container sizing for this host"
  "IMAGE_MAX_CONCURRENT|committed|docker/env|required||concurrent image jobs this host can absorb"
  "VIDEO_X264_PRESET|committed|docker/env|optional||encoder speed for this host's CPUs"
  "VIDEO_X264_THREADS|committed|docker/env|optional||encoder threads for this host"
  "VIDEO_X264_RC_LOOKAHEAD|committed|docker/env|optional||encoder lookahead for this host's memory"
  "VIDEO_MAX_HEIGHT|committed|docker/env|optional||the encode height this host is sized for"
  "FFMPEG_TIMEOUT_SECONDS|committed|docker/env|optional||the encoder's own time budget"
  "VIDEO_TRANSCODE_TIMEOUT_MS|committed|docker/env|optional||the caller's deadline, kept above the encoder budget"
  "VIDEO_MIN_HOST_AVAILABLE_MB|committed|docker/env|optional||the memory floor below which an encode is refused"

  # The host's own records, and values the workstation sends.
  "FOOTBAG_ENV|record|bring-up|required||which environment this host is; written once, then only checked"
  "FOOTBAG_CUTOVER_COMPLETE|record|cutover|optional||written by the cutover marker, and again by a restore whose database carries the marker"
  "FOOTBAG_DEV_INITIAL_ADMIN_EMAILS|sent|deploy|optional||staging's initial-admin allowlist, from the private operations checkout"

  # Supplied by the compose files; never held on a host.
  "NODE_ENV|compose|compose|optional||set literally on every service"
  "PORT|compose|compose|optional||set literally on every service"
  "IMAGE_PROCESSOR_URL|compose|compose|optional||the image container's in-network address"
  "WEB_INTERNAL_URL|compose|compose|optional||the web container's in-network address"
  "WORKER_INTERNAL_URL|compose|compose|optional||the worker container's in-network address"
  "FOOTBAG_MEDIA_DIR|compose|compose|optional||the local media directory, used only by the development adapter"
  "JWT_LOCAL_KEYPAIR_PATH|compose|compose|optional||the development signer's keypair, never used on a host"
  "INCLUDE_DEV_SHORTCUTS|compose|compose|optional||development shortcuts, refused on a host"
  "VIDEO_MAX_BYTES|compose|compose|optional||the accepted upload size, at its built-in default"

  # Not yet owned. The publisher is on card #158, and two of the three cannot
  # have a value before the archive's custom domain exists.
  "ARCHIVE_COOKIE_SIGNER|unowned|card 158|optional||how archive cookies are signed; the publisher is tracked on card 158"
  "ARCHIVE_KEY_PAIR_ID|unowned|card 158|optional||the CloudFront key pair archive cookies name; tracked on card 158"
  "ARCHIVE_COOKIE_DOMAIN|unowned|card 158|optional||the parent domain archive cookies are set on; needs the archive custom domain, tracked on card 158"
)

# host_values_keys [class]
# Prints every key, or every key of one class, one per line.
host_values_keys() {
  local want="${1:-}" entry
  for entry in "${HOST_VALUES[@]}"; do
    IFS='|' read -r key class _ <<< "$entry"
    if [[ -z "$want" || "$class" == "$want" ]]; then
      printf '%s\n' "$key"
    fi
  done
}

# host_values_required_parameters
# Prints, once each, the Parameter Store path (below /footbag/<env>/) of every
# required value the deploy reads from there, whatever block writes it. The code
# deploy checks each exists before it promotes anything.
host_values_required_parameters() {
  local entry key class source required
  local -A seen=()
  for entry in "${HOST_VALUES[@]}"; do
    IFS='|' read -r key class source required _ <<< "$entry"
    case "$class" in param|derived|secret) ;; *) continue ;; esac
    [[ "$required" == "required" ]] || continue
    [[ -n "${seen[$source]+x}" ]] && continue
    seen[$source]=1
    printf '%s\n' "$source"
  done
}

# host_value_field <KEY> <class|source|required|pattern|reason>
# Prints one field of one entry. Returns non-zero for a key not in the list, so
# a caller cannot quietly treat an undeclared value as declared.
host_value_field() {
  local want_key="$1" field="$2" entry key class source required pattern reason
  for entry in "${HOST_VALUES[@]}"; do
    IFS='|' read -r key class source required pattern reason <<< "$entry"
    if [[ "$key" == "$want_key" ]]; then
      case "$field" in
        class) printf '%s\n' "$class" ;;
        source) printf '%s\n' "$source" ;;
        required) printf '%s\n' "$required" ;;
        pattern) printf '%s\n' "$pattern" ;;
        reason) printf '%s\n' "$reason" ;;
        *) echo "host_value_field: unknown field '$field'" >&2; return 2 ;;
      esac
      return 0
    fi
  done
  echo "host_value_field: '$want_key' is not a declared host value" >&2
  return 1
}

# host_values_sync_params <env-file> <environment> <aws-profile> <aws-region>
#
# Copies every param-class value from Parameter Store onto the host env file in
# one by-path read and one atomic rename. Refuses, changing nothing, when a
# required parameter is missing or any value fails its pattern, so a host is
# never left with half of the set. An optional parameter that does not exist
# clears its line, so a host stops polling a queue that has been removed.
#
# Runs as root on a deployed host, where the env file is root-owned mode 600;
# the staged copy is written beside it under the prefix the deploy's cleanup
# sweeps, so an interrupt leaves no unswept copy of the host's secrets.
host_values_sync_params() {
  local env_file="$1" environment="$2" profile="$3" region="$4"
  local listing key source required pattern value tmp
  local -A published=()
  if ! listing="$(AWS_PROFILE="$profile" aws ssm get-parameters-by-path \
      --region "$region" \
      --path "/footbag/${environment}/app/" \
      --query 'Parameters[].[Name,Value]' \
      --output text)"; then
    echo "ERROR: could not read /footbag/${environment}/app/ from Parameter Store." >&2
    echo "       Nothing on this host was changed." >&2
    return 1
  fi
  while IFS=$'\t' read -r name value; do
    [[ -n "$name" ]] && published["${name#/footbag/${environment}/}"]="$value"
  done <<< "$listing"

  local -a set_lines=() clear_keys=()
  while IFS= read -r key; do
    source="$(host_value_field "$key" source)"
    required="$(host_value_field "$key" required)"
    pattern="$(host_value_field "$key" pattern)"
    if [[ -z "${published[$source]+present}" ]]; then
      if [[ "$required" == "required" ]]; then
        echo "ERROR: /footbag/${environment}/${source} is missing; it supplies ${key}." >&2
        echo "       Nothing on this host was changed. Apply the ${environment} Terraform tree," >&2
        echo "       which publishes it, then deploy again." >&2
        return 1
      fi
      clear_keys+=("$key")
      continue
    fi
    value="${published[$source]}"
    if [[ ! "$value" =~ $pattern ]]; then
      echo "ERROR: /footbag/${environment}/${source} is '${value}', which is not the shape ${key} needs." >&2
      echo "       Nothing on this host was changed." >&2
      return 1
    fi
    set_lines+=("${key}=${value}")
  done < <(host_values_keys param)

  tmp="$(mktemp "$(dirname "$env_file")/.env.tmp.XXXXXX")" || return 1
  chmod 600 "$tmp"
  local strip_re="" k
  for k in $(host_values_keys param); do
    strip_re+="${strip_re:+|}^${k}="
  done
  # grep exits 1 when it kept no lines, which is normal; 2 is a read error,
  # which would otherwise install a truncated copy over the host's whole file.
  grep -vE "$strip_re" "$env_file" > "$tmp" || [[ $? -eq 1 ]] || { rm -f "$tmp"; return 1; }
  printf '%s\n' "${set_lines[@]}" >> "$tmp"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown root:root "$tmp"
  fi
  mv "$tmp" "$env_file"
  for k in "${set_lines[@]}"; do
    echo "    Synced ${k%%=*} from Parameter Store"
  done
  for k in "${clear_keys[@]}"; do
    echo "    Cleared ${k}: its parameter does not exist in this environment"
  done
}
