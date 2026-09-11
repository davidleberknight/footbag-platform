#!/usr/bin/env bash
# arming.sh
#
# Arms or disarms one of the environment's four arming switches, end to end and
# in the one order that is safe: payments, email, url_screening, reachability.
#
# Arming is three separate actions that must all happen and must happen in
# order: the tfvars flag, `terraform apply` to publish it as the SSM arming
# parameter, and a deploy, which is what derives the adapter on the host
# (armed -> live, dark -> stub). Typed from memory under pressure the sequence
# loses a step, and a half-applied arming state is invisible: the tfvars says
# one thing and the running host does another. That hazard is what this script
# exists for, and it is identical for all four switches, which is why none of
# them is armed by hand.
#
# The four fall into two groups that differ in what a wrong move costs and in
# what can be checked from here.
#
#   payments and email withhold a REAL-WORLD SIDE EFFECT when dark. Arming one
#     moves money or delivers mail, so each carries a provider-side precondition
#     this script cannot verify, and the operator attests to it.
#
#   url_screening and reachability withhold a PROTECTION when dark, which is the
#     opposite polarity: dark is the exposed state, not the safe one. They are
#     also not inert below production, unlike the pair above: staging derives its
#     adapters from them too, so this script's messaging is target-aware for
#     these and a staging run is a real change rather than a rehearsal.
#
# Each switch carries its own precondition, and each must be settled FIRST.
#
#   payments, going dark: disable the Stripe webhook endpoint. Once the host is
#     dark it verifies signatures against the stub secret, so every live
#     delivery fails with 400. Stripe retries for days and eventually disables
#     the endpoint itself, and the deliveries that matter — the payout events —
#     arrive a week or two later into an endpoint Stripe has given up on.
#
#   email, going armed: two different hazards, and only one of them stops the
#     host.
#
#     What DOES stop the host: SES_FROM_IDENTITY missing from /srv/footbag/env.
#     It is required at boot under the live adapter and the compose file
#     interpolates it with no default, so arming without it crash-loops
#     production. A code-only deploy neither writes it nor checks it, and
#     verify-host-env.sh cannot warn you beforehand because its SES checks
#     self-neutralise while the host is still dark. Step 1 reads the host env
#     file itself and REFUSES when the line is missing or empty, rather than
#     asking an operator to go and look.
#
#     What does NOT stop the host: a missing bounce and complaint queue. Boot
#     deliberately does not require it, because a queue is created and subscribed
#     independently of a deploy. The cost is quieter and still serious: mail goes
#     out with nothing recording which addresses died. Step 1 reads that line
#     too, and reports it rather than refusing, because blocking an arm for a
#     degraded bounce record would be the wrong trade.
#
#     What this script genuinely cannot see: whether the sender identity is
#     verified with AWS, whether the account is out of the SES sandbox, and
#     whether domain authentication is aligned. Those three stay an attestation,
#     because nothing on the workstation can settle them.
#
#     Both host reads need AWS_OPERATOR_FILE (see Environment below). Without it
#     they self-skip, say so, and fall back to asking for all of them.
#
#   url_screening, going armed: the Safe Browsing key must already be a real
#     value in this environment's Parameter Store. This is the one precondition
#     the script can settle itself rather than asking, so it does: it classifies
#     the parameter and REFUSES on a placeholder, an empty value or an
#     unreadable one. Arming without a usable key is not a partial success, it
#     is an outage — every URL-bearing form on the site fails closed, because a
#     screening lookup that cannot run is treated as a link that cannot be
#     cleared. A check that cannot be defeated by a distracted 'yes' is worth
#     more than a typed confirmation, so this switch gets the stronger gate.
#
#   url_screening, going dark: nothing breaks, which is exactly the hazard. The
#     site keeps working and silently stops screening member-submitted links
#     against Google's malware and phishing corpus. There is no alarm for it and
#     no page that looks different, so the only record is the parameter history
#     and this script's own confirmation.
#
#   reachability, either direction: no precondition. The probe needs no
#     credential and calls no third party's API. Dark means no outbound probe
#     and every submitted link reported reachable, so a link to a host that no
#     longer answers is accepted and published.
#
# This script is the FULL stop, not the first one to reach for. The fast stop is
# scripts/payments-pause.sh, which sets the platform's payments_paused runtime
# switch in seconds: new purchases and donations are refused immediately, while
# webhooks keep processing so money already in flight still settles and still
# grants what it paid for. Reach for that first.
#
# Disarming is what this script does, and it is the stop for when the provider
# integration itself is the problem: it swaps the live adapter out entirely. It
# takes a few minutes, it is a deploy, and going dark requires the Stripe
# webhook endpoint be disabled first. Know that before you need it.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  the provider-side precondition for this switch and direction
#   2  rewrite the arming flag in the environment tfvars
#   3  terraform apply
#   4  re-check this workstation's egress address, then deploy (code-only)
#   5  verify the running host and print what to expect afterwards
#
# Usage:
#   scripts/arming.sh --target production --status
#   scripts/arming.sh --target production --state dark
#   scripts/arming.sh --target production --state armed
#   scripts/arming.sh --target production --switch email --state armed
#   scripts/arming.sh --target production --switch url_screening --state armed
#   scripts/arming.sh --target staging    --switch reachability  --state dark
#   scripts/arming.sh --target production --state dark --dry-run
#   scripts/arming.sh --target production --state armed --from-step 3
#
# Do NOT redirect the operator credential file into this script. Its confirmations
# read standard input, so a redirect makes the credential the answer to a prompt
# and echoes it on the failed comparison. It refuses to run unless stdin, stdout
# and stderr are all terminals, for that reason.
#
# Environment:
#   AWS_OPERATOR_FILE   Path to this environment's operator credential file, whose
#                       first line is the host sudo password. Optional, and worth
#                       setting: it is how the two steps that read the host get to
#                       do so. Without it, step 1 cannot check the two SES values
#                       that live in the host env file and asks you to confirm them
#                       by hand, and step 5's host-side rows come back UNKNOWN,
#                       which reads like a verification that ran and found nothing
#                       rather than one that did not run. Set it rather than
#                       redirect it:
#                         AWS_OPERATOR_FILE=~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#                           scripts/arming.sh --target production --switch email --state armed
#
# Synthetic mode (CI tests only; operators never use this):
#   --tfvars <path> points the rewrite at a local file and stops after step 2,
#   printing the remaining steps instead of running terraform or a deploy.
set -euo pipefail

# No default target. Which environment an arming change lands on is exactly the
# decision this script must not make for the operator: defaulting it meant
# `--state dark` disarmed production having been told no environment at all.
TARGET=""
STATE=""
MODE=""
SWITCH="payments"
DRY_RUN=0
FROM_STEP=1
TFVARS_OVERRIDE=""
AWS_PROFILE_ARG=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Sourced for host_env_fetch and require_ssh_alias, which step 1 uses to read the
# two SES readiness values that live in the host env file rather than asking the
# operator to confirm them. Sourced before the flag loop, because the library
# assigns the accept-without-asking flag unconditionally and a caller parsing
# flags first would have its answer overwritten.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

# Every temp file this run creates, removed on any exit path. One handler rather
# than a trap per step: a second `trap` call REPLACES the first, so a later step
# installing its own would silently stop cleaning up an earlier step's file, and
# one of these files holds the host's entire secret set.
ARMING_TMPS=()
arming_cleanup() {
  local f
  for f in ${ARMING_TMPS[@]+"${ARMING_TMPS[@]}"}; do
    [[ -n "$f" ]] || continue
    # Overwritten rather than unlinked: the host env copy carries the session
    # signing key and the worker channel secret, and an unlink leaves the blocks
    # readable. shred is best-effort on a journalling filesystem; the plain
    # removal stays as the fallback so the sweep cannot itself leave the file.
    shred -u "$f" 2>/dev/null || rm -f "$f" 2>/dev/null || true
  done
}
trap arming_cleanup EXIT INT TERM

# The deploy command and its flags live in one place so the preview printed in
# synthetic mode and the command actually run in step 4 cannot drift apart. The
# flags are a safety property, not a convenience: see the note at the invocation.
# ARMING_DEPLOY_CMD exists only so a test can execute step 4 against a recorder
# and assert the real argument list; it is never set in operator use. It is NOT
# on its own a safety interlock: what stops a test reaching real infrastructure
# is synthetic mode, which --tfvars turns on and which returns before step 3.
# Setting ARMING_DEPLOY_CMD without --tfvars runs the real terraform apply and
# then hands the injected command a real deploy, so a test must always pass
# both.
DEPLOY_CMD="${ARMING_DEPLOY_CMD:-$REPO_ROOT/deploy_to_aws.sh}"
DEPLOY_ARGS=(-k)
if [[ -n "${ARMING_DEPLOY_CMD:-}" ]]; then
  # Announced, because it was not: a real run with this set applies for real and
  # then hands the injected command the deploy, which is precisely the
  # half-applied state this script exists to prevent, and it did so silently.
  echo "SYNTHETIC: deploy command='${DEPLOY_CMD}' -- not the real deploy." >&2
  echo "           Pass --tfvars as well, or this run applies for real." >&2
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --state)
      MODE="set"
      STATE="${2:-}"
      shift 2 || { echo "ERROR: --state requires 'armed' or 'dark'" >&2; exit 2; }
      ;;
    --status)
      MODE="status"
      shift
      ;;
    --switch)
      SWITCH="${2:-}"
      shift 2 || { echo "ERROR: --switch requires 'payments' or 'email'" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --tfvars)
      TFVARS_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --tfvars requires a path" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing
      # the header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

case "$TARGET" in
  staging|production) ;;
  '')
    echo "ERROR: --target is required ('staging' or 'production')" >&2
    exit 2
    ;;
  *)
    echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2
    exit 2
    ;;
esac

case "$SWITCH" in
  payments)
    TFVAR_NAME="payments_armed"
    SSM_SUFFIX="payments_armed"
    ADAPTER_LABEL="PAYMENT_ADAPTER"
    HOST_ARMED_VAR="PAYMENTS_ARMED"
    ;;
  email)
    TFVAR_NAME="email_send_armed"
    SSM_SUFFIX="email_send_armed"
    ADAPTER_LABEL="SES_ADAPTER"
    HOST_ARMED_VAR="EMAIL_SEND_ARMED"
    ;;
  url_screening)
    TFVAR_NAME="url_screening_armed"
    SSM_SUFFIX="url_screening_armed"
    ADAPTER_LABEL="SAFE_BROWSING_ADAPTER"
    HOST_ARMED_VAR="URL_SCREENING_ARMED"
    ;;
  reachability)
    TFVAR_NAME="reachability_armed"
    SSM_SUFFIX="reachability_armed"
    ADAPTER_LABEL="HTTP_REACHABILITY_ADAPTER"
    HOST_ARMED_VAR="REACHABILITY_ARMED"
    ;;
  *)
    echo "ERROR: --switch must be one of 'payments', 'email', 'url_screening'," >&2
    echo "       'reachability' (got '$SWITCH')" >&2
    exit 2
    ;;
esac

if [[ -z "$MODE" ]]; then
  echo "ERROR: one of --status or --state armed|dark is required." >&2
  exit 2
fi

if [[ "$MODE" == "set" && "$STATE" != "armed" && "$STATE" != "dark" ]]; then
  echo "ERROR: --state takes 'armed' or 'dark' (got '$STATE')." >&2
  exit 2
fi

if [[ ! "$FROM_STEP" =~ ^[1-5]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 5 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
SSH_ALIAS="footbag-$TARGET"

# The values file carries operator CIDR ranges, so what matters is that git
# cannot pick it up. That is gitignore's job, not the file's location: `*.tfvars`
# is ignored, so the ordinary in-tree path is safe, and a path outside the tree
# is unreachable by git anyway.
#
# Some machines symlink these files into a separate operations checkout. That is
# a placement preference and is followed where it exists, never required: an
# operator holding only a local credential file must be able to arm an
# environment, and demanding a second repository to do it would stop them.
resolve_tfvars() {
  local link resolved
  link="${TFVARS_OVERRIDE:-$TF_DIR/terraform.tfvars}"
  if [[ ! -e "$link" ]]; then
    echo "ERROR: $link does not exist. Create the environment's values file, or pass" >&2
    echo "       --tfvars with a path that does." >&2
    exit 1
  fi
  # Resolved, not the link, and checked on both paths including the synthetic
  # one: a guard that a test cannot reach is a guard nobody has seen work.
  resolved="$(readlink -f "$link")"
  if [[ -z "$resolved" || ! -f "$resolved" ]]; then
    echo "ERROR: $link does not resolve to a file (dangling symlink)." >&2
    exit 1
  fi
  case "$resolved" in
    "$REPO_ROOT"/*)
      if ! git -C "$REPO_ROOT" check-ignore -q "$resolved" 2>/dev/null; then
        echo "ERROR: $resolved is inside this repository and git does not ignore it." >&2
        echo "       The values file carries operator CIDR ranges; writing it where git" >&2
        echo "       can pick it up is how those get committed. Point --tfvars at an" >&2
        echo "       ignored path (*.tfvars is ignored) or at one outside the tree." >&2
        exit 1
      fi
      ;;
  esac
  printf '%s' "$resolved"
}

read_tfvars_armed() {
  grep -E "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$1" | tail -1 \
    | sed -E 's/.*=[[:space:]]*"?([a-z]+)"?.*/\1/' || true
}

read_ssm_armed() {
  [[ -z "$AWS_PROFILE_ARG" ]] && { echo "(no --profile; not read)"; return 0; }
  aws ssm get-parameter \
    --name "/footbag/$TARGET/app/$SSM_SUFFIX" \
    --query 'Parameter.Value' --output text \
    --profile "$AWS_PROFILE_ARG" 2>/dev/null || echo "<unreadable>"
}

TFVARS_PATH="$(resolve_tfvars)"
CURRENT_TFVARS="$(read_tfvars_armed "$TFVARS_PATH")"

if [[ "$MODE" == "status" ]]; then
  echo "== $SWITCH arming: $TARGET =="
  echo ""
  echo "tfvars ($TFVARS_PATH): $TFVAR_NAME = ${CURRENT_TFVARS:-<absent>}"
  echo "SSM  (/footbag/$TARGET/app/$SSM_SUFFIX): $(read_ssm_armed)"
  echo ""
  echo "The host's $ADAPTER_LABEL is derived from the SSM value at deploy time."
  echo "For the running host, and everything else in the bring-up sequence:"
  echo "  scripts/bringup-status.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
  exit 0
fi

WEBHOOK_PATH="/payments/webhook"

# Which direction of which switch has a provider-side precondition, and what it
# is. Payments needs one on the way down, email on the way up, and each is
# something this script cannot verify from the workstation.
PRECONDITION=""
if [[ "$SWITCH" == "payments" && "$STATE" == "dark" ]]; then
  PRECONDITION="stripe-endpoint"
elif [[ "$SWITCH" == "payments" && "$STATE" == "armed" ]]; then
  PRECONDITION="payments-readiness"
elif [[ "$SWITCH" == "email" && "$STATE" == "armed" ]]; then
  PRECONDITION="ses-readiness"
elif [[ "$SWITCH" == "email" && "$STATE" == "dark" ]]; then
  PRECONDITION="outbox-drained"
elif [[ "$SWITCH" == "url_screening" && "$STATE" == "armed" ]]; then
  # The only precondition in this list the script settles rather than asks.
  PRECONDITION="screening-key"
elif [[ "$SWITCH" == "url_screening" && "$STATE" == "dark" ]]; then
  PRECONDITION="screening-exposure"
fi
# reachability has no precondition in either direction: no credential, no third
# party, and nothing that has to be settled elsewhere first. Its consequence is
# still stated at step 5, because "no probe" is not the same as "no change".

# The two SES readiness items that are lines in the host env file rather than
# facts about the provider. A precondition an operator is asked to check is one
# that gets skipped under pressure, and one of these takes production down rather
# than degrading it, so both are read here and the operator attests only to what
# this workstation genuinely cannot see.
#
# The sudo password cannot arrive on stdin: this script's confirmations read stdin
# and it refuses to run unless stdin is a terminal, so a redirected credential file
# would be consumed as an answer to a prompt. It is taken from the first line of
# the operator credential file named by AWS_OPERATOR_FILE instead, which is a file
# read and puts nothing in any process's argument list. That is the same credential
# step 5 already hands to the status view.
#
# Every failure here leaves the state "unchecked" and says why, so a run that
# cannot reach the host falls back to asking rather than reporting a value absent
# that it never looked for.
HOST_SES_IDENTITY_STATE="unchecked"
HOST_SES_QUEUE_STATE="unchecked"

# Reads this switch's arming value off the host, for the already-there check
# above. Every failure to read returns the same sentinel rather than a guess: the
# caller treats anything but the exact state as "not agreement", so a host that
# could not be reached can never be mistaken for a host that agrees. Quiet by
# design, because it runs before the script has announced anything, and the
# caller prints what it found.
read_host_armed_value() {
  local alias="footbag-$TARGET" env_local="" pass="" value=""

  [[ -n "${AWS_OPERATOR_FILE:-}" ]] || { echo "(not read: no credential file)"; return 0; }
  [[ -r "${AWS_OPERATOR_FILE}" ]] || { echo "(not read: credential file unreadable)"; return 0; }
  IFS= read -r pass < "$AWS_OPERATOR_FILE" || true
  [[ -n "$pass" ]] || { echo "(not read: credential file has no first line)"; return 0; }
  require_ssh_alias "$alias" >/dev/null 2>&1 || { echo "(not read: no ssh alias)"; return 0; }

  env_local="$(mktemp "${TMPDIR:-/tmp}/footbag-arming-env.XXXXXX")"
  chmod 600 "$env_local"
  ARMING_TMPS+=("$env_local")
  SUDO_PASS="$pass" host_env_fetch "$alias" "$env_local" >/dev/null 2>&1 \
    || { echo "(not read: host env fetch failed)"; return 0; }

  # `|| [[ $? -eq 1 ]]`, not `|| true`: grep exits 1 when the key is simply absent,
  # which is a real answer here, and 2 on a read error, which is not an answer at
  # all and must not read as one.
  value="$(grep -E "^${HOST_ARMED_VAR}=" "$env_local" | tail -1 | cut -d= -f2-)" \
    || [[ $? -eq 1 ]]
  [[ -n "$value" ]] || { echo "(not read: $HOST_ARMED_VAR absent from the host env file)"; return 0; }
  printf '%s\n' "$value"
}

read_host_ses_values() {
  local alias="footbag-$TARGET" env_local=""

  if [[ -z "${AWS_OPERATOR_FILE:-}" ]]; then
    echo "  Host env file NOT read: AWS_OPERATOR_FILE is not set, so the two values"
    echo "  below marked (host) have to be confirmed by hand. Set it to this"
    echo "  environment's operator credential file to have them checked instead."
    return 0
  fi
  if [[ ! -r "${AWS_OPERATOR_FILE}" ]]; then
    echo "  Host env file NOT read: AWS_OPERATOR_FILE names a file this run cannot"
    echo "  read, so the two values below marked (host) have to be confirmed by hand."
    return 0
  fi

  IFS= read -r SUDO_PASS < "$AWS_OPERATOR_FILE" || true
  if [[ -z "${SUDO_PASS:-}" ]]; then
    echo "  Host env file NOT read: the first line of the operator credential file is"
    echo "  empty, where the host sudo password was expected."
    return 0
  fi

  require_ssh_alias "$alias" || return 0

  env_local="$(mktemp "${TMPDIR:-/tmp}/footbag-arming-env.XXXXXX")"
  chmod 600 "$env_local"
  ARMING_TMPS+=("$env_local")

  echo "  Reading /srv/footbag/env from $alias to check the two host values."
  host_env_fetch "$alias" "$env_local" || return 0

  # Present means present AND non-empty: the live adapter requires a value at
  # boot, and a bare `SES_FROM_IDENTITY=` satisfies a grep for the key while
  # crash-looping the host exactly as an absent line would.
  if grep -qE '^SES_FROM_IDENTITY=.+' "$env_local"; then
    HOST_SES_IDENTITY_STATE="present"
  else
    HOST_SES_IDENTITY_STATE="absent"
  fi
  if grep -qE '^SES_FEEDBACK_QUEUE_URL=.+' "$env_local"; then
    HOST_SES_QUEUE_STATE="present"
  else
    HOST_SES_QUEUE_STATE="absent"
  fi
  return 0
}

# Reads a secret parameter's value only to classify it: present and real, still
# the bootstrap placeholder, or unreadable. The value itself is never printed.
classify_secret_param() {
  local param="/footbag/$TARGET/secrets/$1" value
  # --profile is omitted rather than passed empty when no profile was given.
  # `--profile ""` is not "use the ambient credentials": it names a profile that
  # does not exist, so the call fails and the parameter reads as unreadable,
  # which sent the operator to fix KMS access for what was a missing flag.
  local -a profile_args=()
  [[ -n "$AWS_PROFILE_ARG" ]] && profile_args=(--profile "$AWS_PROFILE_ARG")
  if ! value=$(
    aws ssm get-parameter --name "$param" --with-decryption \
      --query 'Parameter.Value' --output text \
      "${profile_args[@]}" 2>/dev/null
  ); then
    echo "unreadable"
    return 0
  fi
  case "$value" in
    ''|TODO-*) echo "placeholder" ;;
    *)         echo "set" ;;
  esac
}

echo "== $SWITCH arming: $TARGET -> $STATE =="
echo ""
echo "tfvars: $TFVARS_PATH"
echo "  $TFVAR_NAME currently reads: ${CURRENT_TFVARS:-<absent>}"
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  case "$PRECONDITION" in
    stripe-endpoint)
      echo "  1. Confirm the Stripe webhook endpoint has been DISABLED in the dashboard"
      echo "     (endpoint path $WEBHOOK_PATH). Disarming first leaves Stripe retrying"
      echo "     against a host that can no longer validate signatures."
      ;;
    payments-readiness)
      echo "  1. Confirm the Stripe credentials are actually in Parameter Store. An"
      echo "     armed production REFUSES TO BOOT unless the payment adapter is live"
      echo "     with a webhook secret present, so arming before activation has"
      echo "     finished takes production down instead of turning payments on."
      ;;
    ses-readiness)
      echo "  1. Read the two SES values that live in the host env file, REFUSE if the"
      echo "     sender identity is missing (the live adapter requires it at boot, so"
      echo "     arming without it takes the host down), and confirm the rest. Without"
      echo "     the bounce and complaint queue, arming turns mail on with nothing"
      echo "     recording which addresses died; that one is reported, not refused."
      ;;
    outbox-drained)
      echo "  1. Confirm what happens to mail already queued. Disarming is not a"
      echo "     pause: a dark production holds the outbox rather than draining it,"
      echo "     so queued mail waits, undelivered, until email is armed again."
      echo "     To stop mail and then continue, the reversible lever is"
      echo "     scripts/outbound-mail-pause.sh, which needs no deploy."
      ;;
    screening-key)
      echo "  1. Classify /footbag/$TARGET/secrets/safe_browsing_api_key and REFUSE"
      echo "     unless it holds a real value. Arming with a placeholder or an"
      echo "     unreadable key fails every URL-bearing form on $TARGET, because a"
      echo "     screening lookup that cannot run is treated as a link that cannot"
      echo "     be cleared. This one is checked, not attested."
      ;;
    screening-exposure)
      echo "  1. Confirm the exposure. Going dark breaks nothing and shows nothing:"
      echo "     $TARGET keeps working and silently stops screening member-submitted"
      echo "     links against Google's malware and phishing corpus."
      ;;
    *)
      echo "  1. (no provider-side precondition for $SWITCH going $STATE)"
      ;;
  esac
  echo "  2. Rewrite $TFVAR_NAME = \"$STATE\" in $TFVARS_PATH (diff shown, confirmed)"
  echo "  3. terraform -chdir=$TF_DIR apply (publishes SSM app/$SSM_SUFFIX)"
  echo "  4. Re-check this workstation's egress address, then:"
  echo "     DEPLOY_TARGET=$SSH_ALIAS ./deploy_to_aws.sh   (code-only; never --all-data)"
  echo "  5. Verify with scripts/bringup-status.sh and report what to expect"
  if [[ "$SWITCH" == "payments" && "$STATE" == "dark" ]]; then
    echo ""
    echo "After disarming, expect one false reconciliation issue within a day: the"
    echo "nightly pass runs whatever the adapter is, and the stub's ledger is empty."
  fi
  if [[ "$SWITCH" == "email" && "$STATE" == "armed" ]]; then
    echo ""
    echo "Arming email also stops the check-email page rendering the verification"
    echo "link on screen. That on-screen link is keyed on the mail adapter being"
    echo "stubbed, so anyone mid-registration relies on real mail from that moment."
  fi
  exit 0
fi

# Every confirmation below is read from stdin, and this script is documented to
# run with stdin attached to the operator's terminal. Redirect anything into it
# and `read` consumes that instead: point an operator credential file at it and
# the host's sudo password silently becomes the answer to a confirmation prompt,
# and lands in the terminal scrollback of a failed comparison. Refusing a
# non-terminal stdin costs nothing here, because nothing this script does is
# scriptable anyway: every state change is gated on a typed phrase.
# Synthetic mode (--tfvars) is the CI test path: it rewrites a local file, stops
# before terraform and the deploy, and drives the prompts from piped stdin by
# design. It is never an operator invocation, so the terminal requirement below
# does not apply to it.
if [[ -z "$TFVARS_OVERRIDE" ]] && ! { [[ -t 0 ]] && [[ -t 1 ]] && [[ -t 2 ]]; }; then
  echo "ERROR: arming requires an interactive terminal for its typed confirmations," >&2
  echo "       but stdin/stdout/stderr are not all TTYs." >&2
  echo "       Re-run from an interactive shell. Do NOT redirect a credential file" >&2
  echo "       into this script: its prompts read stdin, so the credential would be" >&2
  echo "       consumed as an answer. Nothing has been changed." >&2
  exit 1
fi

# ── Already there? Then say so and stop, before asking for anything ──────────
#
# Arming is three places that must agree: the tfvars flag, the SSM parameter the
# apply publishes, and the adapter the host derives at deploy time. When all three
# already read the requested state there is no work, and a run that asks the
# operator to attest to provider-side facts and then authorise an apply and a
# deploy is asking permission to redo what it has just finished reporting as done.
# That is the operator-script rule's idempotency invariant, and it was being
# broken in the loudest possible way: two typed confirmations for a no-op.
#
# The short-circuit needs positive evidence from all three, and it is deliberately
# conservative about what counts. A read it could not take is not agreement: no
# --profile means no SSM read, no credential file means no host read, and either
# one leaves the possibility this run exists to fix, which is the half-applied
# state where the tfvars says one thing and the host does another. So a missing
# read falls through to the full sequence and says why, and a disagreement falls
# through naming the part that is behind. Only unanimity stops.
#
# A resume (--from-step) never short-circuits: the operator has said which step to
# start at, and second-guessing that with a state read is how a resume silently
# does nothing.
#
# Synthetic mode is not excluded, deliberately: the check has to be reachable by a
# test, and there it cannot fire by accident, because a run with no --profile and
# no credential file takes neither of the two reads it requires.
if (( FROM_STEP <= 1 )) && [[ "$MODE" != "status" ]]; then
  sc_ssm="$(read_ssm_armed)"
  sc_host="$(read_host_armed_value)"
  if [[ "$CURRENT_TFVARS" == "$STATE" && "$sc_ssm" == "$STATE" && "$sc_host" == "$STATE" ]]; then
    echo "Already $STATE, in all three places that have to agree:"
    echo "  tfvars ($TFVARS_PATH): $TFVAR_NAME = $CURRENT_TFVARS"
    echo "  SSM (/footbag/$TARGET/app/$SSM_SUFFIX): $sc_ssm"
    echo "  host footbag-$TARGET (/srv/footbag/env): $HOST_ARMED_VAR=$sc_host"
    echo ""
    echo "Nothing to do, so nothing was asked and nothing was run. The adapter the"
    echo "host derives from this switch is reported by:"
    echo "  scripts/bringup-status.sh --target $TARGET"
    echo ""
    echo "To re-publish the parameter and re-derive the adapter anyway, name the step:"
    echo "  scripts/arming.sh --target $TARGET --switch $SWITCH --state $STATE --from-step 3"
    exit 0
  fi
  if [[ "$CURRENT_TFVARS" == "$STATE" ]]; then
    # Worth stating rather than quietly proceeding: this is the shape the script
    # exists for, and the operator should know which half is behind before they
    # start typing.
    if [[ "$sc_ssm" != "$STATE" ]] || [[ "$sc_host" != "$STATE" ]]; then
      echo "NOTE: the tfvars already reads \"$STATE\", so this run is finishing a"
      echo "      sequence rather than starting one:"
      echo "        SSM (/footbag/$TARGET/app/$SSM_SUFFIX): $sc_ssm"
      echo "        host footbag-$TARGET: ${sc_host}"
      echo "      A value shown as not-read is a read this run could not take, not a"
      echo "      value that disagrees; pass --profile and AWS_OPERATOR_FILE to have"
      echo "      both checked."
      echo ""
    fi
  fi
  unset sc_ssm sc_host
fi

# ── Step 1: the provider side, which this script cannot do for you ───────────
if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "ses-readiness" ]]; then
  echo "-- step 1: SES readiness --"
  echo ""
  read_host_ses_values
  echo ""

  # Refused rather than asked. This is the one item that takes production DOWN
  # rather than degrading it: the live adapter requires the value at boot and the
  # compose file interpolates it with no default, so arming without it
  # crash-loops the host. The script already refuses rather than asks on the one
  # other precondition it can settle, for the reason stated there -- a check that
  # cannot be defeated by a distracted 'yes' is worth more than a typed
  # confirmation -- and this one now qualifies.
  if [[ "$HOST_SES_IDENTITY_STATE" == "absent" ]]; then
    echo "REFUSING: SES_FROM_IDENTITY is not set in /srv/footbag/env on $TARGET." >&2
    echo "" >&2
    echo "  Arming email makes the mail adapter live, and the live adapter requires that" >&2
    echo "  value at boot. The compose file interpolates it with no default, so the" >&2
    echo "  containers would crash-loop and $TARGET would be down rather than degraded." >&2
    echo "" >&2
    echo "  A code-only deploy neither writes nor checks it, and verify-host-env.sh" >&2
    echo "  cannot warn you while the host is still dark, because its SES checks" >&2
    echo "  self-neutralise until the adapter is live. That is why this is checked here." >&2
    echo "" >&2
    echo "  Write it, then re-run:" >&2
    echo "    scripts/set-host-env.sh --target $TARGET" >&2
    echo "" >&2
    echo "  Nothing has been changed. Email stays dark, which is the safe state." >&2
    exit 1
  fi

  echo "Arming email with any of these unmet does harm rather than nothing:"
  echo ""
  case "$HOST_SES_IDENTITY_STATE" in
    present)
      echo "  0. SES_FROM_IDENTITY in /srv/footbag/env ..... CHECKED, present (host)"
      ;;
    *)
      echo "  0. SES_FROM_IDENTITY is present in /srv/footbag/env on the host. (host)"
      echo "     This is the one that takes production DOWN rather than degrading"
      echo "     it: the live adapter requires it at boot, the compose file has no"
      echo "     default for it, and a code-only deploy neither writes nor checks"
      echo "     it. verify-host-env.sh cannot warn you while the host is still"
      echo "     dark, because its SES checks self-neutralise until the adapter is"
      echo "     live. Read the host env file and confirm the line is there."
      ;;
  esac
  case "$HOST_SES_QUEUE_STATE" in
    present)
      echo "  a. SES_FEEDBACK_QUEUE_URL in /srv/footbag/env . CHECKED, present (host)"
      ;;
    absent)
      # Reported rather than refused: boot deliberately does not require the
      # queue, because a queue is created and subscribed independently of a
      # deploy. The cost is quieter and still serious, so it stays an item the
      # operator has to accept deliberately.
      echo "  a. SES_FEEDBACK_QUEUE_URL in /srv/footbag/env . CHECKED, ABSENT (host)"
      echo "     Nothing will record a bounce: sending carries on while the"
      echo "     platform's view of which mailboxes are dead stops being updated."
      echo "     This does not stop the host, so it is yours to accept or fix:"
      echo "     enable the feed queues in terraform, apply, then"
      echo "     scripts/set-host-env.sh --target $TARGET"
      ;;
    *)
      echo "  a. The bounce and complaint queue is on the host, as (host)"
      echo "     SES_FEEDBACK_QUEUE_URL. Without it nothing records a bounce: sending"
      echo "     carries on while the platform's view of which mailboxes are dead"
      echo "     stops being updated. Enable the feed queues in terraform, apply, then"
      echo "     scripts/set-host-env.sh --target $TARGET"
      ;;
  esac
  echo "  b. The queue is subscribed to the feedback topic, which the same apply"
  echo "     does, and the worker is running a build that polls it."
  echo "  c. The sender identity is VERIFIED with AWS, not Pending."
  echo "  d. The account is OUT of the SES sandbox. Inside it, mail is accepted and"
  echo "     delivered only to individually verified addresses, so 'live' silently"
  echo "     reaches nobody."
  echo "  e. Domain authentication is on and DMARC is DKIM-aligned. Without it the"
  echo "     password-reset, claim and verify emails land in spam at the major"
  echo "     providers, which is worse than dark: dark at least renders the"
  echo "     verification link on screen where the member can use it."
  echo ""
  if [[ "$HOST_SES_IDENTITY_STATE" == "present" && "$HOST_SES_QUEUE_STATE" != "unchecked" ]]; then
    echo "Items 0 and a were read off the host just now. You are attesting to b-e,"
    echo "which this workstation cannot see."
    printf "Type 'APPLY' only if every one of b-e is true: "
  else
    printf "Type 'APPLY' only if every one of 0 and a-e is true: "
  fi
  read -r TYPED
  if [[ "$TYPED" != "APPLY" ]]; then
    echo "Aborted: nothing has been changed. Email stays dark, which is the safe" >&2
    echo "state: the check-email page keeps rendering the verification link on" >&2
    echo "screen, so registration still works end to end." >&2
    exit 1
  fi
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "outbox-drained" ]]; then
  echo "-- step 1: what happens to mail already queued --"
  echo ""
  echo "Disarming email is not a pause. A dark production holds the outbox: the"
  echo "worker stops draining, and every queued message waits, undelivered, until"
  echo "email is armed again. Anyone mid-registration waits with it, because their"
  echo "verification mail is in that queue and the on-screen link comes back only"
  echo "on the next deploy."
  echo ""
  echo "If the intent is to stop mail and then continue, the reversible lever is"
  echo "  scripts/outbound-mail-pause.sh --target $TARGET --pause --reason '...'"
  echo "which stops the drain in seconds without a deploy and keeps the queue."
  echo "Disarm when the sender itself must go away, not merely stop."
  echo ""
  printf "Type 'APPLY' to disarm email anyway: "
  read -r TYPED
  if [[ "$TYPED" != "APPLY" ]]; then
    echo "Aborted: nothing has been changed. Email stays armed." >&2
    exit 1
  fi
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "payments-readiness" ]]; then
  echo "-- step 1: Stripe credentials --"
  echo ""
  echo "Arming payments makes the deploy derive PAYMENT_ADAPTER=live. A production"
  echo "host refuses to boot with the live adapter unless the Stripe webhook secret"
  echo "is present, so arming before activation has finished does not turn payments"
  echo "on: it takes the site down, and getting back up means editing the values"
  echo "file, applying, and deploying again while it stays down."
  echo ""
  if [[ -z "$AWS_PROFILE_ARG" ]]; then
    echo "No --profile was given, so this cannot be checked from here. Re-run with"
    echo "--profile to have it checked, or attest to it."
    echo ""
    printf "Type 'APPLY' only if activation has already run: "
    read -r TYPED
    if [[ "$TYPED" != "APPLY" ]]; then
      echo "Aborted: nothing has been changed. Run scripts/activate-payments.sh first." >&2
      exit 1
    fi
  else
    KEY_STATE="$(classify_secret_param stripe_secret_key)"
    WS_STATE="$(classify_secret_param stripe_webhook_secret)"
    echo "  Stripe API key parameter:      $KEY_STATE"
    echo "  Stripe webhook secret parameter: $WS_STATE"
    echo ""
    if [[ "$KEY_STATE" != "set" || "$WS_STATE" != "set" ]]; then
      echo "Aborted: nothing has been changed. Arming now would stop the host booting." >&2
      echo "Run scripts/activate-payments.sh --target $TARGET --profile <profile> first," >&2
      echo "then re-run this. If a parameter reads unreadable, fix the credentials rather" >&2
      echo "than arming past it: this check is the only thing standing between a missing" >&2
      echo "secret and a production outage." >&2
      exit 1
    fi
    echo "  Both parameters hold real values."
  fi
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "screening-key" ]]; then
  echo "-- step 1: URL screening key --"
  echo ""
  echo "Arming screening makes the deploy derive SAFE_BROWSING_ADAPTER=live, and the"
  echo "live adapter needs a real key from Parameter Store. Without one it cannot"
  echo "clear a link, and a link it cannot clear is refused: every URL-bearing form"
  echo "on $TARGET starts rejecting valid input. That is an outage, not a partial"
  echo "arming, so this is checked here rather than attested."
  echo ""
  KEY_STATE="$(classify_secret_param safe_browsing_api_key)"
  echo "  Safe Browsing key parameter: $KEY_STATE"
  echo ""
  if [[ "$KEY_STATE" != "set" ]]; then
    echo "Aborted: nothing has been changed. Arming now would break every URL-bearing" >&2
    echo "form on $TARGET." >&2
    echo "Store the key first:" >&2
    echo "  scripts/provision-url-screening-key.sh --env $TARGET store" >&2
    echo "then re-run this. If the parameter reads unreadable, fix the profile's KMS" >&2
    echo "access rather than arming past it: this check is the only thing standing" >&2
    echo "between a missing key and a site that refuses every link." >&2
    exit 1
  fi
  echo "  The key holds a real value."
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "screening-exposure" ]]; then
  echo "-- step 1: screening exposure --"
  echo ""
  echo "Disarming screening is silent. $TARGET keeps working, every page looks the"
  echo "same, and member-submitted links stop being checked against Google's malware"
  echo "and phishing corpus. Nothing alarms on it; the parameter history and this"
  echo "confirmation are the only record that it was deliberate."
  echo ""
  printf "Type 'APPLY' to confirm that is what you mean: "
  read -r TYPED
  if [[ "$TYPED" != "APPLY" ]]; then
    echo "Aborted: nothing has been changed. Screening stays armed." >&2
    exit 1
  fi
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "stripe-endpoint" ]]; then
  echo "-- step 1: Stripe webhook endpoint --"
  echo ""
  echo "Disable the live webhook endpoint in the Stripe Dashboard NOW, before this"
  echo "host goes dark (Developers > Webhooks > the endpoint > Disable). Its path is"
  echo "$WEBHOOK_PATH on this environment's public base URL."
  echo ""
  echo "A dark host verifies signatures against the stub secret, so every live"
  echo "delivery fails with 400. Stripe retries for days and then disables the"
  echo "endpoint itself — typically right when the payout events arrive."
  echo ""
  printf "Type 'APPLY' once you have done it: "
  read -r TYPED
  if [[ "$TYPED" != "APPLY" ]]; then
    echo "Aborted: the endpoint must be disabled before the host goes dark." >&2
    echo "Nothing has been changed. Re-run when it is done." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 2: the declared value ───────────────────────────────────────────────
if (( FROM_STEP <= 2 )); then
  echo "-- step 2: tfvars --"
  if [[ "$CURRENT_TFVARS" == "$STATE" ]]; then
    echo "  $TFVAR_NAME is already \"$STATE\"; leaving the file alone."
  else
    if ! grep -qE "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH"; then
      echo "ERROR: no $TFVAR_NAME assignment found in $TFVARS_PATH." >&2
      echo "       Add one rather than letting this script invent the line." >&2
      exit 1
    fi
    TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"
    ARMING_TMPS+=("$TFVARS_TMP")
    STATE_VALUE="$STATE" VAR_NAME="$TFVAR_NAME" awk '
      BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=" }
      $0 ~ pattern && !done {
        match($0, pattern "[ \t]*")
        printf "%s\"%s\"\n", substr($0, 1, RLENGTH), ENVIRON["STATE_VALUE"]
        done = 1
        next
      }
      { print }
    ' "$TFVARS_PATH" > "$TFVARS_TMP"

    echo ""
    diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
    echo ""
    printf "Apply this change to %s? (yes/no): " "$TFVARS_PATH"
    read -r CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
      echo "Aborted: tfvars not changed." >&2
      exit 1
    fi
    cat "$TFVARS_TMP" > "$TFVARS_PATH"
    echo "  $TFVAR_NAME = \"$STATE\" written."
  fi
  echo ""
fi

SYNTHETIC=0
[[ -n "$TFVARS_OVERRIDE" ]] && SYNTHETIC=1

if (( SYNTHETIC )); then
  echo "-- synthetic mode: stopping before terraform and deploy --"
  echo "Would next run:"
  echo "  terraform -chdir=$TF_DIR apply"
  echo "  DEPLOY_TARGET=$SSH_ALIAS $DEPLOY_CMD ${DEPLOY_ARGS[*]}"
  # Test seam. With an injected deploy command, run that one command so its
  # argument list is observable, then stop. Nothing else in the real sequence
  # runs: no terraform, no SSH, no host probe, and not the egress lookup either.
  # The flags carried here are a safety property, so a test that cannot execute
  # this line can only ever assert the sentence above it.
  if [[ -n "${ARMING_DEPLOY_CMD:-}" ]]; then
    DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" "${DEPLOY_ARGS[@]}"
  fi
  exit 0
fi

# ── Step 3: publish it ───────────────────────────────────────────────────────
if (( FROM_STEP <= 3 )); then
  echo "-- step 3: terraform apply --"
  # Re-read the file rather than trusting what step 2 believed. Step 1 reads it
  # once at startup, and a resume with --from-step 3 never revisits step 2, so
  # an operator who aborted at the step-2 prompt and came back later would
  # otherwise publish the OLD value while every message on screen announces the
  # new one. The half-applied state that results is invisible: tfvars says one
  # thing and the running host does another, which is the failure this whole
  # script exists to prevent.
  ON_DISK="$(read_tfvars_armed "$TFVARS_PATH")"
  if [[ "$ON_DISK" != "$STATE" ]]; then
    echo "ERROR: $TFVARS_PATH declares $TFVAR_NAME = \"${ON_DISK:-<absent>}\", not \"$STATE\"." >&2
    echo "       Apply would publish the value on disk, not the one asked for here." >&2
    echo "       Re-run from step 2 to write it: --from-step 2" >&2
    exit 1
  fi
  echo ""
  echo "This publishes $TFVAR_NAME = \"$STATE\" as SSM /footbag/$TARGET/app/$SSM_SUFFIX."
  echo "Blast radius is small: the arming parameter, plus the CloudFront origin CIDR"
  echo "refresh that every apply performs. Nothing recreates the host."
  echo ""
  printf "Type 'APPLY' to run terraform apply: "
  read -r TYPED
  if [[ "$TYPED" != "APPLY" ]]; then
    echo "Aborted before terraform apply. The tfvars change is already written;" >&2
    echo "resume with --from-step 3 when ready." >&2
    exit 1
  fi
  if ! terraform -chdir="$TF_DIR" apply; then
    echo "ERROR: terraform apply failed. Resume with --from-step 3 once fixed." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 4: the deploy, which has an SSH half ────────────────────────────────
if (( FROM_STEP <= 4 )); then
  echo "-- step 4: deploy --"
  echo ""
  # SSH to the host is restricted to the operator CIDRs in this environment's
  # tfvars. A travelling workstation's address changes, and a rotation between
  # the apply and the deploy strands the deploy part-way through its remote
  # half, which is the worst moment to discover it.
  EGRESS_IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]')" || EGRESS_IP=""
  if [[ -z "$EGRESS_IP" ]]; then
    echo "  Could not determine this workstation's egress address (no network answer)."
    echo "  The deploy needs SSH to $SSH_ALIAS from an allowlisted address."
  else
    echo "  This workstation's egress address: $EGRESS_IP"
    # Fixed-string, and quoted as the list actually writes it. An unanchored
    # regex here matched far too much: dots match any character, so 1.2.3.4
    # "passed" against an entry for 51.2.3.4/32 by substring alone, and the
    # check then reported the address covered when it was not. The deploy
    # strands part-way through its remote half, which is exactly what this
    # check exists to prevent.
    if grep -qF -- "\"$EGRESS_IP/32\"" "$TFVARS_PATH"; then
      echo "  Found $EGRESS_IP/32 in the operator allowlist."
    else
      echo "  $EGRESS_IP/32 is not listed verbatim in operator_cidrs; it may still fall"
      echo "  inside a configured range. Current operator_cidrs:"
      sed -n '/operator_cidrs/,/]/p' "$TFVARS_PATH" | sed 's/^/    /'
      echo ""
      printf "  Is this address covered? (yes/no): "
      read -r COVERED
      if [[ "$COVERED" != "yes" ]]; then
        echo "Aborted before the deploy. Add today's address to operator_cidrs (add, never" >&2
        echo "replace, or the standing ranges are lost), terraform apply, then resume with" >&2
        echo "--from-step 4." >&2
        exit 1
      fi
    fi
  fi
  echo ""
  echo "  Running a CODE-ONLY deploy. Expect 15-25 seconds of degraded service."
  echo ""
  # The -k in DEPLOY_ARGS is load-bearing, not decoration. A bare wrapper
  # invocation is the one form that treats schema drift as an invitation to
  # rebuild: it offers to replace the deployed database and that prompt defaults
  # to yes, so an operator pressing enter to get past it re-runs the whole deploy
  # as a data-replacing one. With -k the same drift routes to a prompt that
  # defaults to no and aborts. Arming must never be able to become a database
  # replace, whatever is answered here.
  if ! DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" "${DEPLOY_ARGS[@]}"; then
    # Read it rather than assert it. This message used to state that SSM
    # already declared the new value, which the script had never checked: on a
    # --from-step 4 resume the apply may never have run, and the operator was
    # being told the parameter was published when it was not.
    echo "ERROR: the deploy failed. Resume with --from-step 4." >&2
    echo "       SSM /footbag/$TARGET/app/$SSM_SUFFIX reads: $(read_ssm_armed)" >&2
    echo "       If that is not \"$STATE\", step 3 has not run; resume with --from-step 3." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 5: prove it, and say what happens next ──────────────────────────────
echo "-- step 5: verify --"
echo ""
# The status view reads the host env file, which needs the sudo password on its
# stdin. This script's own stdin is the operator's terminal, so pass the
# credential file through when one was supplied; without it the remote probe
# self-skips and the very rows this step tells the operator to confirm come back
# UNKNOWN, which reads as a verification that ran rather than one that did not.
if [[ -n "${AWS_OPERATOR_FILE:-}" && -r "${AWS_OPERATOR_FILE}" ]]; then
  bash "$REPO_ROOT/scripts/bringup-status.sh" --target "$TARGET" ${AWS_PROFILE_ARG:+--profile "$AWS_PROFILE_ARG"} \
    < "$AWS_OPERATOR_FILE" || true
else
  bash "$REPO_ROOT/scripts/bringup-status.sh" --target "$TARGET" ${AWS_PROFILE_ARG:+--profile "$AWS_PROFILE_ARG"} \
    --skip-remote || true
  echo ""
  echo "The host-side rows above are UNKNOWN because they were not read, not because"
  echo "the host is in an unknown state: this step needs AWS_OPERATOR_FILE set to this"
  echo "environment's operator credential file. Set it for the whole run and step 1"
  echo "checks its two host values as well."
  echo "For the full picture, re-run:"
  if [[ "$TARGET" == "production" ]]; then
    echo "  < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/bringup-status.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
  else
    echo "  < ~/AWS/AWS_OPERATOR.txt bash scripts/bringup-status.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
  fi
fi
echo ""
echo "Confirm above that the host reads $SWITCH $STATE and that $ADAPTER_LABEL is"
echo "$([[ "$STATE" == "armed" ]] && echo live || echo stub). The go-live marker is not touched by arming;"
echo "move it deliberately with scripts/production-live-marker.sh if that is what you meant."

if [[ "$SWITCH" == "email" && "$STATE" == "armed" ]]; then
  echo ""
  echo "The check-email page no longer renders the verification link on screen: that"
  echo "behaviour is keyed on the mail adapter being stubbed. Anyone registering from"
  echo "now on depends on real mail arriving, so send yourself one before trusting it."
fi

if [[ "$SWITCH" == "email" && "$STATE" == "dark" ]]; then
  echo ""
  echo "The outbox is now held rather than drained: queued mail waits and nothing"
  echo "is sent. Watch the backlog while it stays dark, and expect anyone who"
  echo "registered in the meantime to be waiting on a verification email that"
  echo "arrives when email is armed again."
fi

if [[ "$SWITCH" == "url_screening" && "$STATE" == "armed" ]]; then
  echo ""
  echo "Screening is live on $TARGET now, so prove it rather than assuming it:"
  echo "submit a known-bad URL through any external-link form and confirm it is"
  echo "refused with \"This URL is not allowed.\", then submit an ordinary link and"
  echo "confirm it still saves. A key that is present but rejected by Google looks"
  echo "exactly like this step never running."
fi

if [[ "$SWITCH" == "url_screening" && "$STATE" == "dark" ]]; then
  echo ""
  echo "$TARGET no longer screens member-submitted links. Nothing on the site says"
  echo "so and no alarm fires, so treat this as a state someone has to remember to"
  echo "leave: re-arm it as soon as whatever forced this is resolved."
fi

if [[ "$SWITCH" == "reachability" && "$STATE" == "dark" ]]; then
  echo ""
  echo "$TARGET no longer probes submitted links, so every one is reported reachable."
  echo "A link to a host that has gone away is now accepted and published, and the"
  echo "first person to notice is a member following a dead link."
fi

if [[ "$SWITCH" == "payments" && "$STATE" == "dark" ]]; then
  echo ""
  echo "Expect one false reconciliation issue within a day. The nightly pass runs"
  echo "whatever the adapter is, and the stub's ledger is empty, so it will raise a"
  echo "\"payment missing at provider\" issue against every real payment and put a"
  echo "work-queue card in front of the administrator. Resolve it with a note saying"
  echo "what it was; it is an artefact of disarming, not a discrepancy."
fi
