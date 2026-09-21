#!/usr/bin/env bash
# setup-operator-workstation.sh
#
# Brings a new operator's workstation to the point where a deploy will run, and
# says plainly what is left when it cannot finish the job itself.
#
# WHY THIS EXISTS.
#
# Everything below used to be hand-typed out of an onboarding card: seven tools
# checked one at a time, two gitignored files created with the right umask, an
# SSH stanza with five fields, a credential file whose mode matters, and a
# verification block of three commands whose output the operator interpreted.
# None of it is hard and all of it is the kind of step that is skipped under
# pressure or half-done, and every failure surfaces later as something that
# reads like an outage: a refused connection that looks like a firewall fault, a
# credential error that is really a missing stanza, a deploy that stops at
# terraform saying a variable is undeclared when the real answer is a symlink.
#
# So the card becomes: run this, fix what it names, run it again.
#
# WHAT IT REFUSES TO DO.
#
#   - Take a secret from anywhere but the keyboard. The sudo password is typed,
#     never passed as a flag, never read from a file this script names.
#   - Install system packages. It reports what is missing and how to get it,
#     because `sudo apt install` on somebody's machine is not this script's to
#     decide, and the instructions differ per platform.
#   - Clone anything, or choose where a checkout lives.
#   - Overwrite an SSH stanza or a credential file that already exists. Both may
#     hold something deliberate, and replacing either silently is how an
#     operator loses a working configuration.
#   - Report success on a step it only attempted.
#
# Usage:
#   bash scripts/setup-operator-workstation.sh --target staging
#   bash scripts/setup-operator-workstation.sh --target staging --check
#
# Flags:
#   --target <staging|production>  which environment to set this machine up for.
#                                  No default: never inherited from ambient state.
#   --check                        report what is missing, change nothing, and
#                                  exit non-zero if anything is.
#
# Safe to re-run. Every step reports "already done" rather than repeating work,
# which is what makes `--check` and the real run the same list in the same order.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/terminal.sh
source "${SCRIPT_DIR}/lib/terminal.sh"
# The AWS identity this run uses, supplied rather than exported by the operator,
# and the Terraform reads that identity makes possible.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"
# require_target: the shared environment guard, so the refusal reads the same
# here as everywhere else.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""
CHECK=0
TODO=0
PRIVATE_REPO=""
# The shared job role a named operator assumes. Spelled here because this check
# reads the role out of a resolved ARN, which is a different thing from the
# profile name the library owns.
DEV_TESTER_ROLE_NAME="FootbagDevTester"
# Whether this run has an AWS identity that actually authenticates. Every step
# below that reaches AWS reads it, so that one dead credential is reported once,
# where it can be fixed, instead of three times in three other vocabularies.
IDENTITY_OK=0

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-operator-workstation.sh --target <staging|production>
         [--private-repo <path>] [--check]

Checks and completes the workstation setup a deploy needs: tools, the private
checkout wiring, the Terraform variable files, the AWS profiles, the SSH alias,
the operator credential file and the pinned host-key file. Reports what it
cannot do itself.

  --target <env>          staging or production. Required; never defaulted.
  --private-repo <path>   your footbag-ops checkout. Needed only before the
                          wiring exists, because two of the files checked here
                          live in it and are reached through a link that is not
                          made yet.
  --check                 report only, change nothing, non-zero if anything is
                          missing.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --private-repo)
      PRIVATE_REPO="${2:-}"
      shift 2 || { echo "ERROR: --private-repo requires an argument" >&2; exit 2; }
      ;;
    --check) CHECK=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# The shared refusal rather than another copy of it, so an operator meets the
# same words here as in every other script that names an environment.
require_target "$TARGET" staging production || exit 2

ALIAS="footbag-${TARGET}"
PIN="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"

# Which credential file this workstation needs follows the account the alias
# connects as, by the shared rule rather than a second copy of it here. The
# selection can fail on a machine this script is meant to report on rather than
# refuse -- no ssh yet, or a config that does not parse -- so a failure leaves
# the name empty and the step below says so. Guessing a name instead is exactly
# how one account's password ends up filed under another's.
CRED_FILE=""
CRED_ACCOUNT=""
if operator_credential_select "$ALIAS" "$TARGET" 2>/dev/null; then
  CRED_FILE="$OPERATOR_CREDENTIAL_FILE"
  CRED_ACCOUNT="$OPERATOR_CREDENTIAL_ACCOUNT"
fi

ok()   { printf '  [ok]    %s\n' "$1"; }
todo() { printf '  [TODO]  %s\n' "$1" >&2; TODO=$(( TODO + 1 )); }
step() { printf '\n== %s\n' "$1"; }
# Deliberately not counted, and deliberately not [ok]. For a state that is
# correct for one tier and a gap for another, which this script cannot tell
# apart because nothing on the machine says which tier its owner is. Counting it
# would fail a dev-and-tester for not holding a credential they must not hold;
# calling it ok would tell a super admin their break-glass route is fine when it
# is absent.
note() { printf '  [note]  %s\n' "$1"; }

# ── 1. Tools ─────────────────────────────────────────────────────────────────
#
# Reported rather than installed, and reported ALL AT ONCE. The card had the
# operator run one `command -v` over seven names and count the lines of output,
# which answers "how many" rather than "which", so a missing tool was found by
# subtraction.
step "Tools the deploy needs"
declare -A TOOL_HINT=(
  [ssh]="openssh-client"
  [rsync]="rsync"
  [jq]="jq"
  [docker]="the container runtime install in the developer onboarding guide"
  [aws]="the AWS CLI v2"
  [terraform]="terraform"
  [sqlite3]="sqlite3"
)
for tool in ssh rsync jq docker aws terraform sqlite3; do
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool"
  else
    todo "$tool is not installed — ${TOOL_HINT[$tool]}"
  fi
done

# Installed is not running, and the rule these scripts follow is that a check
# asserts the outcome rather than the invocation. On Windows with Docker Desktop
# not started, `command -v docker` passes and the deploy fails much later at the
# image build, which reads as a deploy fault rather than as a daemon nobody
# started.
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    ok "the docker daemon is running"
  else
    todo "docker is installed but its daemon is not reachable — start Docker Desktop, or the docker service, before deploying"
  fi
fi

# ── 2. The two gitignored Terraform variable files ───────────────────────────
#
# BEFORE the wiring, and that order is the whole point. The wiring script links
# all seven values files and refuses, all or nothing, when the checkout lacks one
# — and its refusal blames a stale clone and suggests a `git pull`, which is the
# wrong diagnosis: these two are gitignored and are the operator's to create, so
# a correct clone always lands there. Checked after the wiring, this step could
# not even run, because it looked for the files THROUGH the link the wiring had
# just refused to create. That is a loop with no way out of it in the output.
#
# Resolved from the checkout path rather than through the link, for the same
# reason.
step "Terraform variable files that no clone can give you"
PRIVATE_LINK="${REPO_ROOT}/footbag_private_repo"
PRIVATE_DIR=""
if [[ -n "$PRIVATE_REPO" ]]; then
  PRIVATE_DIR="$PRIVATE_REPO"
elif [[ -d "$PRIVATE_LINK" ]]; then
  PRIVATE_DIR="$PRIVATE_LINK"
fi

if [[ -z "$PRIVATE_DIR" ]]; then
  todo "cannot find the companion checkout: re-run with --private-repo <path to your footbag-ops clone>"
  todo "and inside it create both gitignored files, each one line reading alarm_email = \"<the operations mailbox on the mail-ifpa-aws vault entry>\": terraform/staging.secrets.auto.tfvars and terraform/production.secrets.auto.tfvars, mode 600"
elif [[ ! -d "${PRIVATE_DIR}/terraform" ]]; then
  todo "${PRIVATE_DIR}/terraform does not exist; is that really the footbag-ops checkout?"
else
  for env_name in staging production; do
    secrets="${PRIVATE_DIR}/terraform/${env_name}.secrets.auto.tfvars"
    if [[ -f "$secrets" ]]; then
      ok "${env_name}.secrets.auto.tfvars exists"
    elif (( CHECK )); then
      # The path and the contents, in the message the operator actually sees.
      # `--check` is what the card tells her to run first, so a TODO that only
      # names the file is the one message that never helps.
      todo "${secrets} is missing; create it with one line: alarm_email = \"<the operations mailbox on the mail-ifpa-aws vault entry>\", mode 600"
    else
      ( umask 077 && : >> "$secrets" ) || { todo "could not create ${secrets}"; continue; }
      chmod 600 "$secrets" 2>/dev/null || true
      ok "${env_name}.secrets.auto.tfvars created, empty"
      todo "${secrets} needs its one line: alarm_email = \"<the operations mailbox on the mail-ifpa-aws vault entry>\""
    fi
  done
fi

# ── 3. The companion checkout and its symlinks ───────────────────────────────
#
# Delegated rather than reimplemented: that script already verifies every link
# resolves, which is the check nobody does by hand and the reason a link to a
# file the private checkout lacks looks healthy in `ls -l`.
step "Private checkout wiring"
if bash "${SCRIPT_DIR}/setup_private_repo.sh" --check >/dev/null 2>&1; then
  ok "all links wired and resolving"
elif [[ -n "$PRIVATE_REPO" ]]; then
  todo "links are not wired — run: bash scripts/setup_private_repo.sh --private-repo ${PRIVATE_REPO}"
  todo "if that run refuses saying the checkout does not carry some files, it means the two gitignored ones above are still missing, not that your clone is stale"
else
  todo "links are not wired — run: bash scripts/setup_private_repo.sh --private-repo <path to your footbag-ops clone>"
fi

# ── 4. AWS credentials and the chained runtime profiles ──────────────────────
#
# Proved, not listed, and this step is where that distinction was missing. A
# profile name in `aws configure list-profiles` answers "is one configured",
# which is a different question from "does it still authenticate": a key that
# has been deactivated, deleted or rotated away leaves its profile in that list
# untouched. So a dead credential collected three `[ok]` lines here and then
# surfaced four steps down as a terraform read failing on its own terms, which
# reads as an uninitialised tree. That is exactly the failure class
# scripts/lib/aws-profile.sh exists to end, and this was the last step in the
# run still reporting the invocation rather than the outcome.
#
# One call to AWS for the operator identity, latched inside the library so steps
# 7, 7a and 8 pay nothing further, plus one per chained runtime profile. The
# chain is proved for the same reason and for one more: the deploy runs a smoke
# check that assumes one of those roles, so a runtime profile that exists but
# cannot be assumed fails the deploy at its last step rather than here.
step "AWS profiles"
if ! command -v aws >/dev/null 2>&1; then
  todo "the AWS CLI is not installed, so no profile can be checked or proved"
elif ! aws_profile_ensure; then
  # The library has already named the credential and printed the command that
  # installs the current one, so this adds the verdict and repeats none of it.
  todo "the AWS identity this run would use does not authenticate; the message just above names the fix"
else
  IDENTITY_OK=1
  # The ARN is on the library's own line immediately above, in the wording every
  # script in this tree uses, and it may name a profile this script supplied or
  # one the operator's shell already carried. Repeating it here would say the
  # same thing twice and would have to guess which of those two it was.
  ok "that identity authenticates against AWS"

  # Which tier this machine belongs to, reported rather than assumed, because
  # the two carry different profiles and half the findings below depend on
  # which one this is. The directly authenticated profile is the super admin's
  # and a dev-and-tester never holds it, so its absence is the correct state
  # for them and not a finding.
  _has_key_profile=0
  if aws_profile_exists "$FOOTBAG_OPERATOR_PROFILE"; then
    _has_key_profile=1
    ok "the directly authenticated profile ${FOOTBAG_OPERATOR_PROFILE} is configured"
  else
    note "no ${FOOTBAG_OPERATOR_PROFILE} profile here, which is correct unless you are the super admin holding that key. If you are: bash scripts/install-operator-key.sh"
  fi

  # The job role a named operator assumes for everyday work, and the session
  # name it carries. On a shared role the session name IS the attribution, so a
  # chain that resolves under the wrong name is worse than one that does not
  # resolve: it works, and it records this person's actions as somebody else's.
  if aws_profile_exists "$FOOTBAG_DEV_TESTER_PROFILE"; then
    # Resolved rather than merely listed, and then read: the ARN is what says
    # both that the assume-role step happened and whose name the session
    # carries. Either alone would pass on a chain that works and misattributes.
    if aws_identity_resolve "$FOOTBAG_DEV_TESTER_PROFILE"; then
      if [[ "$AWS_IDENTITY_ARN" == *":assumed-role/${DEV_TESTER_ROLE_NAME}/"* ]]; then
        ok "${FOOTBAG_DEV_TESTER_PROFILE} assumes ${DEV_TESTER_ROLE_NAME} as ${AWS_IDENTITY_ARN##*/}"
      else
        todo "${FOOTBAG_DEV_TESTER_PROFILE} resolves to ${AWS_IDENTITY_ARN}, which is not a ${DEV_TESTER_ROLE_NAME} session, so the assume-role step did not happen"
      fi
    else
      todo "${FOOTBAG_DEV_TESTER_PROFILE} is configured but does not resolve; ask the super admin to re-run the onboarding for you"
    fi
  elif (( _has_key_profile )); then
    note "no ${FOOTBAG_DEV_TESTER_PROFILE} profile here, which is correct for a machine that works as the directly authenticated identity"
  else
    todo "${FOOTBAG_DEV_TESTER_PROFILE} is missing — ask the super admin to run, at this keyboard: bash scripts/manage-human-operator.sh --onboard <your-name>"
  fi

  # Missing and unassumable are different faults with different owners, so they
  # are reported separately: the installer writes a missing profile, whereas a
  # profile that resolves to its own source identity means the assume-role grant
  # on the principal it sources from is absent, which is not the newcomer's to
  # fix.
  #
  # The staging chain is a finding for everybody, because everybody can produce
  # it: the onboarding writes it for a named operator, chained off the job
  # role, and the key install writes it for the super admin. The production
  # chain is a finding only for somebody who could have it. It is written for
  # the directly authenticated identity alone, because production's runtime
  # role trusts that user and not the job role, so for a dev-and-tester its
  # absence is the boundary working rather than a gap.
  _runtime_missing=0
  for rt in footbag-staging-runtime footbag-production-runtime; do
    if ! aws_profile_exists "$rt"; then
      if [[ "$rt" == *production* ]] && (( ! _has_key_profile )); then
        note "$rt is not here. It is written only for the directly authenticated identity, because production's runtime role does not trust ${DEV_TESTER_ROLE_NAME}: a profile that resolved and then could not assume would read as a fault rather than as that boundary working"
      elif (( _has_key_profile )); then
        todo "$rt is missing — run: bash scripts/install-operator-key.sh (it writes both chains for the directly authenticated identity)"
      else
        todo "$rt is missing — ask the super admin to run, at this keyboard: bash scripts/manage-human-operator.sh --onboard <your-name>"
      fi
      _runtime_missing=1
    fi
  done
  if (( _runtime_missing == 0 )); then
    if aws_identity_require_chain footbag-staging-runtime footbag-production-runtime; then
      ok "both chained runtime profiles assume their roles"
    else
      todo "a chained runtime profile is configured but does not assume its role. That is the assume-role permission on whichever principal it sources from, rather than anything on this machine, so report it rather than reinstalling."
    fi
  fi
  unset _runtime_missing _has_key_profile
fi

# ── 5. The SSH alias ─────────────────────────────────────────────────────────
#
# Checked through `ssh -G`, which is what the deploy itself resolves, rather
# than by reading the config file: an alias can be defined in an Include, and a
# stanza that exists but does not match is the failure this is looking for.
#
# Not written by this script. The `User` line is the whole identity switch and
# the key path is the operator's own; guessing either is how a run silently
# connects as the wrong account.
step "SSH alias ${ALIAS}"
if command -v ssh >/dev/null 2>&1; then
  # Read once, and tolerate a failure rather than aborting on it. `ssh -G` exits
  # 0 for an alias it does not know, echoing the name back, which is the case
  # handled below; but a malformed ~/.ssh/config makes it exit non-zero, and
  # under `pipefail` that would kill this run instead of reporting it.
  SSH_G="$(ssh -G "$ALIAS" 2>/dev/null || true)"
  RESOLVED_HOST="$(printf '%s\n' "$SSH_G" | awk '/^hostname /{print $2}' | tail -1)"
  RESOLVED_USER="$(printf '%s\n' "$SSH_G" | awk '/^user /{print $2}' | tail -1)"
  RESOLVED_PORT="$(printf '%s\n' "$SSH_G" | awk '/^port /{print $2}' | tail -1)"
  if [[ -z "$SSH_G" ]]; then
    todo "ssh could not read your SSH configuration at all; check ~/.ssh/config parses"
  elif [[ -z "$RESOLVED_HOST" || "$RESOLVED_HOST" == "$ALIAS" ]]; then
    todo "${ALIAS} does not resolve — add a Host stanza naming Hostname, Port 2222, User, IdentityFile and IdentitiesOnly yes"
  else
    ok "${ALIAS} resolves to ${RESOLVED_HOST}, connecting as ${RESOLVED_USER} on port ${RESOLVED_PORT}"
    [[ "$RESOLVED_PORT" == "2222" ]] || todo "${ALIAS} resolves to port ${RESOLVED_PORT}; the deploy alias uses 2222"
    # The User line is the whole identity switch. It decides which account the
    # host sees AND, through the shared credential rule, which of the four files
    # every script on this path reads, so changing this one line is the entire
    # act of switching identity. Both answers are legitimate, which is why
    # neither is a TODO; what is worth saying out loud is which one this alias
    # has chosen, because an alias naming an account that does not exist on the
    # host fails the first connection as `Permission denied (publickey)`, and
    # that reads as a broken key and is not one. The sudo proof at the end of
    # this run is what actually settles it.
    if [[ "$RESOLVED_USER" == "$OPERATOR_SHARED_ACCOUNT" ]]; then
      ok "${ALIAS} connects as the shared '${RESOLVED_USER}' account"
    else
      ok "${ALIAS} connects as the named account '${RESOLVED_USER}', which must already exist on the host"
    fi
    # IdentitiesOnly matters: without it ssh offers every key the agent holds and
    # the server can refuse the lot before reaching hers.
    if ! printf '%s\n' "$SSH_G" | grep -qi '^identitiesonly yes'; then
      todo "${ALIAS} does not set 'IdentitiesOnly yes'; without it ssh offers every key your agent holds and the host can refuse them all before reaching yours"
    fi

    # Nothing here inspects the alias's host-key settings, and that is deliberate.
    # The pin is carried by the scripts, which pass it on their own command line
    # where it outranks any configuration file. An operator's alias does not need
    # to carry it because no operator types a command against these hosts: every
    # connection on this path is made by a script, including the login and sudo
    # proof at the end of this run. A runbook that hands somebody a raw ssh is the
    # defect, and the answer is to remove the raw ssh rather than to reach into
    # anybody's ~/.ssh/config.
  fi
else
  todo "ssh is not installed, so the alias cannot be checked"
fi

# ── 6. The operator credential file ──────────────────────────────────────────
#
# The password is typed, never taken from a flag or a file this script names.
# What is automated is everything around it: the directory mode, the file mode,
# the single-line shape, and the check that it is not empty. A stray character
# becomes part of the password and fails on the host as a permissions problem.
step "Operator credential file"
if [[ -z "$CRED_FILE" ]]; then
  todo "cannot tell which credential file this workstation needs, because the account ${ALIAS} connects as could not be read. Fix the SSH alias first: the account picks the file, and the shared account's file is not a safe default for a named one"
elif [[ -f "$CRED_FILE" ]]; then
  mode="$(stat -c '%a' "$CRED_FILE" 2>/dev/null || echo "")"
  # `|| true`, not `|| echo 0`: `grep -c` PRINTS its count and THEN exits 1 when
  # that count is zero, so the fallback appended a second line and the arithmetic
  # below died on "0\n0" — a bash syntax error that aborts this whole run under
  # `set -e`, turning a report into a crash on exactly the empty-file case this
  # check exists to catch.
  lines="$(grep -c . "$CRED_FILE" 2>/dev/null || true)"
  [[ "$lines" =~ ^[0-9]+$ ]] || lines=0
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    todo "$(basename "$CRED_FILE") has mode ${mode:-unknown}; the deploy refuses anything but 600 or 400, and a file that was readable must be assumed to have been read, so rotate the password as well as the mode"
  elif (( lines != 1 )); then
    todo "$(basename "$CRED_FILE") holds ${lines} non-empty lines; it must hold exactly one, the password alone"
  else
    ok "$(basename "$CRED_FILE") present, one line, mode ${mode}"
  fi
elif (( CHECK )); then
  todo "$(basename "$CRED_FILE") is missing"
else
  mkdir -p -m 700 "${HOME}/AWS"
  if terminal_present --with-stdin; then
    echo "  The ${TARGET} host sudo password for '${CRED_ACCOUNT}', the account ${ALIAS}"
    echo "  connects as. It is not shown as you type."
    printf '  Password: '
    IFS= read -rs typed < /dev/tty || typed=""
    printf '\n'
    if [[ -z "$typed" ]]; then
      todo "nothing was typed, so $(basename "$CRED_FILE") was not created"
    else
      ( umask 077 && printf '%s\n' "$typed" > "$CRED_FILE" )
      chmod 600 "$CRED_FILE"
      unset typed
      ok "$(basename "$CRED_FILE") written, one line, mode 600"
    fi
  else
    todo "$(basename "$CRED_FILE") is missing and there is no terminal to type it on; re-run from an interactive shell"
  fi
fi

# ── 7. The Terraform tree, which the pin step reads the host address from ────
#
# Its own step, because otherwise its failure arrives disguised. The pin step
# below discards install-known-hosts' output, so an uninitialised tree, an
# expired key and a genuinely stale pin all produced the same sentence: "missing
# or stale". Named here, the operator gets the one that is true.
step "Terraform tree for ${TARGET}"
if [[ -d "${REPO_ROOT}/terraform/${TARGET}/.terraform" ]]; then
  ok "terraform/${TARGET} is initialised"
elif (( CHECK )); then
  todo "terraform/${TARGET} has never been initialised; re-run without --check and this is done for you"
elif ! command -v terraform >/dev/null 2>&1; then
  todo "terraform is not installed, so the tree cannot be initialised"
elif (( IDENTITY_OK == 0 )); then
  # Said once, above, where it can be fixed. Without this the init below would
  # meet the same refusal and print it a second time, which reads as a second
  # fault rather than the same one.
  todo "terraform/${TARGET} cannot be initialised without a working AWS identity; fix the AWS profiles step above first"
else
  # Run rather than instructed. It downloads providers and connects to the remote
  # state, changes no infrastructure and is safe to repeat, so there is nothing
  # here for a person to decide.
  #
  # The identity comes from the shared library, which is the whole reason this is
  # not a command in a document: a hand-typed terraform has no identity on a
  # workstation with no default profile, so the card had to teach an AWS_PROFILE=
  # prefix — the export-a-variable-to-choose-an-identity shape removed everywhere
  # else in this tree.
  echo "    initialising (downloads providers, changes no infrastructure)..."
  if aws_profile_ensure && terraform -chdir="terraform/${TARGET}" init -input=false >/dev/null 2>&1; then
    ok "terraform/${TARGET} initialised"
  else
    todo "could not initialise terraform/${TARGET}. Re-run this to see terraform's own message: terraform -chdir=terraform/${TARGET} init"
  fi
fi

# ── 7a. The host address, so the SSH stanza does not need a typed command ────
#
# The stanza below is the operator's to write, and it needs one value nothing
# else on the workstation has. Printed here rather than left to a hand-typed
# `terraform output`, which needs an identity this machine has no default for.
step "Host address for ${TARGET}"
if (( IDENTITY_OK == 0 )); then
  # The read below needs an identity, and without this guard its failure was
  # reported as an uninitialised tree. On a machine whose tree IS initialised
  # that produced the one message an operator cannot act on: advice to
  # initialise a tree this run had just reported as initialised, two steps up.
  todo "cannot read the ${TARGET} host address without a working AWS identity; fix the AWS profiles step above"
elif tf_output_read "terraform/${TARGET}" lightsail_static_ip 2>/dev/null; then
  ok "${TARGET} host address: ${TF_OUTPUT_VALUE}"
  echo "         (this is the Hostname line your ~/.ssh/config stanza needs)"
else
  todo "could not read the ${TARGET} host address; it comes from Terraform and is written down nowhere else, so initialise the tree first"
fi

# ── 8. The pinned host-key file ──────────────────────────────────────────────
#
# Output shown rather than discarded. It names its own cause when it fails, and
# hiding that was what made every distinct failure read as the same one.
step "Pinned host-key file"
if (( IDENTITY_OK == 0 )); then
  # The pin is built from the Lightsail API and the Terraform output, so it
  # needs the same identity. Named here rather than left to read as a stale pin.
  todo "cannot build or check the pin for ${TARGET} without a working AWS identity: it is read from the Lightsail API and the Terraform output. Fix the AWS profiles step above."
elif (( CHECK )); then
  if bash "${SCRIPT_DIR}/install-known-hosts.sh" --target "$TARGET" --check >/dev/null 2>&1; then
    ok "pinned and current for ${TARGET}"
  else
    todo "the pin for ${TARGET} is missing, stale, or could not be built — run this to see why: bash scripts/install-known-hosts.sh --target ${TARGET}"
  fi
elif bash "${SCRIPT_DIR}/install-known-hosts.sh" --target "$TARGET"; then
  ok "pinned and verified"
else
  todo "could not build the pin; the message above says why"
fi

# ── 9. Prove the login and the sudo password, rather than inferring them ─────
#
# The files being present is not the same as the credentials working, and the
# rule these scripts follow is that a check asserts the outcome. A wrong password
# in a well-formed file passes every check above and is then discovered mid-deploy,
# after it has already been piped to the host.
#
# This also removes the last hand-typed `ssh` from the operator's path. The card
# used to ask for `ssh <alias> "uptime"` and `ssh <alias> "sudo -v"` by hand, which
# is a runbook doing a script's job: a hand-typed ssh does not carry the pinned
# host-key file, so the very command an operator ran to check their access was the
# one connection in the whole path with nothing verifying the host it reached.
# Here it goes through the same pin the deploy uses.
step "Login and sudo on ${ALIAS}"
if [[ -f "$CRED_FILE" ]] && command -v ssh >/dev/null 2>&1 && require_pinned_known_hosts 2>/dev/null; then
  _probe_pass=""
  IFS= read -r _probe_pass < "$CRED_FILE" || _probe_pass=""
  if [[ -z "$_probe_pass" ]]; then
    todo "cannot prove sudo: $(basename "$CRED_FILE") is empty"
  else
    # One session, the password as line one, exactly the wire pattern every
    # privileged step in this tree uses. `sudo -k` ignores any cached timestamp
    # so the host consumes precisely the line supplied.
    # ControlPath=none, because this check is worthless on a reused connection.
    #
    # OpenSSH shares connections when the operator's own configuration sets
    # ControlMaster and ControlPath: the first session opens a socket and later
    # ones ride it instead of authenticating again. Everywhere else in this tree
    # that is a harmless speed-up. Here it is the whole question, because this
    # step exists to prove that the key and the password work NOW. Riding a
    # socket opened before an account was retired, a key was withdrawn or a
    # password was rotated reports success on the strength of an authentication
    # that happened earlier, which is exactly the case an operator runs this to
    # rule out. Offboarding is where that matters most: it withdraws an
    # account's keys and then asks for proof that another account still works.
    #
    # ControlPath rather than ControlMaster: ControlMaster=no only declines to
    # BECOME a master, and still joins an existing socket. Setting the path to
    # none is what disables sharing for this connection.
    #
    # Scoped to this one call rather than added to the shared pin options, so
    # the deploy's several connections keep whatever sharing the operator has
    # configured. Nothing else in the tree is asking "is this credential live".
    if printf '%s\n' "$_probe_pass" \
        | ssh "${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" \
            -o "ControlPath=none" "$ALIAS" \
            'sudo -k -S -p "" true' >/dev/null 2>&1; then
      ok "connected as the alias account and sudo accepted the password"
    else
      todo "could not connect to ${ALIAS} and run sudo. Either your SSH key is passphrase-protected and no agent is holding it, the host is unreachable, the key is not accepted, the pinned host key does not match, or the password in $(basename "$CRED_FILE") is wrong. Check the passphrase case first, because it is the one that looks like a rejected key: run 'ssh-add -l' and, if it says the agent has no identities, run 'ssh-add' and try again. Otherwise run 'bash scripts/install-known-hosts.sh --target ${TARGET} --check'; if the pin is current, the password is the next thing to check."
    fi
  fi
  unset _probe_pass
else
  todo "cannot prove login and sudo yet: the credential file or the pinned host-key file is still missing"
fi

# ── The verdict ──────────────────────────────────────────────────────────────
echo ""
if (( TODO == 0 )); then
  echo "This workstation is ready to deploy to ${TARGET}."
  echo ""
  echo "Next, in order:"
  echo "  bash deploy_to_aws.sh -n     # changes nothing; it does connect, to read the"
  echo "                               # deployed schema, so this also proves your login"
  echo "  bash deploy_to_aws.sh        # code-only by default; leaves the DB and media alone"
  exit 0
fi

echo "${TODO} thing(s) still to do, listed above as [TODO]." >&2
echo "None of them is a failure of this run: they are the steps that need you." >&2
echo "Fix them and run this again; it repeats nothing that is already done." >&2
exit 1
