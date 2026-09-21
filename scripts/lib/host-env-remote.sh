# shellcheck shell=bash
#
# One wire for every privileged step an operator script runs against a deployed
# host, so the seven scripts that touch /srv/footbag/env do not each carry their
# own copy of it. The companion file host-env-expectations.sh states what the
# operator-owned values should be; this one states how they travel.
#
# The wire is the pattern scripts/install-cwagent-staging.sh models: the sudo
# password is line one of the ssh stdin stream, the values the remote body needs
# follow as shell-quoted assignments emitted by printf (a bash builtin, so no
# fork and no argv), and the body itself is cat'd onto the same stream. Remote
# sudo consumes the password line and bash inherits the rest.
#
#   { printf '%s\n' "$SUDO_PASS"
#     printf 'VAR=%q\n' "$VALUE"
#     cat "$REMOTE_HALF"
#   } | ssh "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash'
#
# Nothing secret reaches any process's argument list on either machine, and no
# terminal is involved, so every one of these steps is scriptable and testable
# rather than something an operator has to sit and type a password into.
#
# -k invalidates any cached sudo timestamp first. Without it, a host where the
# operator recently used sudo would have sudo consume no stdin line at all, and
# the password would fall through to whatever reads stdin next -- into bash as a
# command here, or into the target file where the consumer is a file writer.
# That fall-through is the leak this project already reverted a change over; -k
# closes it rather than relying on the timestamp having expired.
#
# The file content itself travels base64-encoded on a single line between
# sentinels. The remote body writes progress to stderr and only the payload to
# stdout, so a diagnostic can never be mistaken for part of the env file, and a
# value containing newlines or quotes survives the round trip unchanged.

HOST_ENV_PATH_DEFAULT="/srv/footbag/env"

HOST_ENV_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ssh-known-hosts.sh
source "${HOST_ENV_LIB_DIR}/ssh-known-hosts.sh"
# shellcheck source=terminal.sh
source "${HOST_ENV_LIB_DIR}/terminal.sh"
# Which of the four credential files a run reads. Its own file, because the same
# rule is needed by entry points that open no wire and must not inherit this
# one's connection options or its unconditional flag assignments.
# shellcheck source=operator-credential.sh
source "${HOST_ENV_LIB_DIR}/operator-credential.sh"

# The host is verified against the operator's pinned host-key file and an
# unrecognized key aborts before the pipe opens, which is what keeps the sudo
# password on line one from reaching a substituted host; ConnectTimeout fails
# fast on a dead target; ServerAliveInterval keeps the pipe alive across NAT
# idle timeouts. Same set the deploy scripts use.
#
# Filled on first use rather than at source time: several consumers offer a
# dry-run that opens no connection, and those must still run on a workstation
# that has no pin installed.
HOST_SSH_OPTS=()

# require_host_ssh_opts
# Resolves the pinned host-key file and builds the connection options. Every
# function here that opens a connection calls it first, so a missing pin stops
# the step rather than downgrading it.
require_host_ssh_opts() {
  [[ ${#HOST_SSH_OPTS[@]} -gt 0 ]] && return 0
  require_pinned_known_hosts || return 1
  HOST_SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")
  return 0
}
HOST_ENV_READ_HALF="${HOST_ENV_LIB_DIR}/../internal/host-env-read-remote.sh"
HOST_ENV_WRITE_HALF="${HOST_ENV_LIB_DIR}/../internal/host-env-write-remote.sh"
HOST_LOG_GREP_HALF="${HOST_ENV_LIB_DIR}/../internal/host-log-grep-remote.sh"

# Set by require_operator_stdin, read by every function that opens a pipe. One
# credential line serves any number of ssh invocations, which a single shared
# stdin could not: the first consumer would drain it.
SUDO_PASS=""

# require_operator_stdin <invocation-example> <alias> <target>
# Refuses an interactive stdin rather than hanging on a password nobody is going
# to type, and names the exact form to re-run with.
#
# What it does NOT do, stated plainly because the guarantee is easy to overread:
# the password arrives on stdin, so this never opens the credential file and
# cannot tell which one the operator redirected in. It selects, names and refuses
# on absence; whether the named file is the one that was piped is the caller's to
# get right, which is why the selected name is printed on every run.
require_operator_stdin() {
  local invocation="$1" alias="${2:-}" target="${3:-}"
  if [[ -z "$alias" || -z "$target" ]]; then
    echo "ERROR: require_operator_stdin needs the ssh alias and the target as well as the" >&2
    echo "       invocation example; without the alias there is no account to pick a" >&2
    echo "       credential file from. This is a defect in the calling script." >&2
    return 1
  fi
  operator_credential_select "$alias" "$target" || return 1
  local cred="$OPERATOR_CREDENTIAL_DISPLAY"
  if [[ -t 0 ]]; then
    echo "ERROR: must receive the host sudo password on stdin." >&2
    echo "       Run via: < ${cred} bash ${invocation}" >&2
    return 1
  fi
  IFS= read -r SUDO_PASS || true
  if [[ -z "$SUDO_PASS" ]]; then
    echo "ERROR: the first line of stdin was empty; expected the host sudo password." >&2
    echo "       Run via: < ${cred} bash ${invocation}" >&2
    return 1
  fi
  echo "credential: expecting ${cred} ('${alias}' connects as '${OPERATOR_CREDENTIAL_ACCOUNT}'); what arrived on stdin is not checked against it" >&2
  return 0
}

# require_ssh_alias <alias>
# Fails with a plain message on a workstation without the deploy alias, rather
# than surfacing a raw ssh resolution error part-way through a run.
require_ssh_alias() {
  local alias="$1" resolved
  resolved="$(ssh -G "$alias" 2>/dev/null | grep '^hostname ' | tail -1 | cut -d' ' -f2)"
  if [[ -z "$resolved" || "$resolved" == "$alias" ]]; then
    echo "ERROR: SSH alias '${alias}' is not configured; these scripts are operator-only." >&2
    echo "       Add the deploy alias stanza to ~/.ssh/config." >&2
    return 1
  fi
  return 0
}

# host_env_fetch <alias> <env-dest> [report-dest] [env-path]
# Reads the root-owned env file down and decodes it into <env-dest> at mode
# 0600. When <report-dest> is given, the remote body also collects the host
# report (backup timer state and running containers) and it is decoded there.
# Nothing is left behind on the host: the body writes no file, so there is no
# staged copy to shred and no cleanup for a crash to skip.
host_env_fetch() {
  local alias="$1" env_dest="$2" report_dest="${3:-}" env_path="${4:-$HOST_ENV_PATH_DEFAULT}"
  local stream want_report="no"
  [[ -n "$report_dest" ]] && want_report="yes"

  [[ -r "$HOST_ENV_READ_HALF" ]] || {
    echo "ERROR: missing remote half: $HOST_ENV_READ_HALF" >&2
    return 1
  }

  require_host_ssh_opts || return 1

  # The returned stream is held in a variable, never a temp file. It carries the
  # host's entire secret set in base64, and a file holding that would need a
  # trap to survive an interrupt -- a trap this function cannot set without
  # clobbering its caller's. Process memory needs no cleanup and cannot be left
  # behind by a signal.
  if ! stream="$(
        {
          printf '%s\n' "$SUDO_PASS"
          printf 'HOST_ENV_PATH=%q\n'    "$env_path"
          printf 'WANT_HOST_REPORT=%q\n' "$want_report"
          cat "$HOST_ENV_READ_HALF"
        } | ssh "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash'
      )"; then
    echo "ERROR: could not read ${env_path} from ${alias}." >&2
    echo "       Causes: wrong sudo password on line 1 of the credential file;" >&2
    echo "       the operator account lacks sudo on the host; ${env_path} absent." >&2
    return 1
  fi

  host_env_decode_section "$stream" ENV "$env_dest" || return 1
  if [[ -n "$report_dest" ]]; then
    host_env_decode_section "$stream" REPORT "$report_dest" || return 1
  fi
  return 0
}

# host_env_decode_section <stream> <ENV|REPORT> <dest>
# The payload is the single base64 line following its sentinel. An empty payload
# line is a legitimate result: a host env file can be zero bytes, and reporting
# that as "no payload" would send the operator hunting for a transport fault
# that did not happen. A missing sentinel is the real failure.
host_env_decode_section() {
  local stream="$1" name="$2" dest="$3" encoded
  if ! grep -q "^---FOOTBAG-${name}-B64---\$" <<< "$stream"; then
    echo "ERROR: the host returned no ${name} section." >&2
    return 1
  fi
  encoded="$(grep -A1 "^---FOOTBAG-${name}-B64---\$" <<< "$stream" | tail -1)"
  [[ "$encoded" == "---FOOTBAG-${name}-B64---" ]] && encoded=""
  umask 077
  if ! printf '%s' "$encoded" | base64 -d > "$dest"; then
    echo "ERROR: the ${name} payload from the host did not decode." >&2
    return 1
  fi
  chmod 600 "$dest"
  return 0
}

# host_env_install <alias> <local-file> [env-path]
# Installs <local-file> as the host env file, root:root mode 0600. The content
# rides the same pipe as an assignment, so there is no scp, no host-side temp
# path for the caller to name, and no backup copy: a backup is a second, staler
# copy of the whole secret set sitting at rest for as long as nobody deletes it,
# and the file is re-derivable from the parameter store by a deploy.
host_env_install() {
  local alias="$1" src="$2" env_path="${3:-$HOST_ENV_PATH_DEFAULT}" encoded

  [[ -r "$src" ]] || { echo "ERROR: cannot read $src" >&2; return 1; }
  [[ -r "$HOST_ENV_WRITE_HALF" ]] || {
    echo "ERROR: missing remote half: $HOST_ENV_WRITE_HALF" >&2
    return 1
  }

  require_host_ssh_opts || return 1

  encoded="$(base64 -w0 < "$src")"

  if ! {
        printf '%s\n' "$SUDO_PASS"
        printf 'HOST_ENV_PATH=%q\n' "$env_path"
        printf 'NEW_ENV_B64=%q\n'   "$encoded"
        cat "$HOST_ENV_WRITE_HALF"
      } | ssh "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash'; then
    echo "ERROR: could not install ${env_path} on ${alias}." >&2
    return 1
  fi
  return 0
}

# host_env_mask <file>
# Prints the file with every secret-bearing value replaced by asterisks, for
# showing an operator a diff of the host env file.
#
# It masks on the key name rather than on the lines being changed, because the
# hazard is the lines that are NOT changing: diff prints up to three unchanged
# neighbours around every hunk, and an append at the end of the file prints the
# file's last three lines. A script that masks only its own key still prints
# whichever secrets happen to sit next to it. Every secret-bearing name in the
# runtime config carries SECRET or KEY, which is what this matches.
host_env_mask() {
  sed -E 's/^([A-Za-z_][A-Za-z0-9_]*(SECRET|KEY)[A-Za-z0-9_]*)=.*/\1=********/' "$1"
}

# host_log_tail <alias> <fixed-pattern> [scan-lines]
# Prints the last line of the running web container's log matching the pattern.
#
# Exists so a scripted step can read a host's log rather than an operator typing
# `docker logs | grep` by hand. Reading the log needs root, so it goes over the
# same wire as everything else here.
host_log_tail() {
  local alias="$1" pattern="$2" lines="${3:-2000}"

  [[ -r "$HOST_LOG_GREP_HALF" ]] || {
    echo "ERROR: missing remote half: $HOST_LOG_GREP_HALF" >&2
    return 1
  }

  require_host_ssh_opts || return 1

  {
    printf '%s\n' "$SUDO_PASS"
    printf 'LOG_PATTERN=%q\n'    "$pattern"
    printf 'LOG_SCAN_LINES=%q\n' "$lines"
    cat "$HOST_LOG_GREP_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash'
}

# tfvars_mask <file>
# Masks the shared secret inside a webhook URL, leaving the rest of the URL
# readable so the operator can still check the host and route in a diff.
#
# The host env mask cannot be reused here: it keys on SECRET or KEY appearing in
# the variable's NAME, and a variable whose name carries neither would have its
# key printed in full. Here the secret is in the value's query string instead of
# the whole value, which is why this masks a pattern rather than a line.
#
# No variable in either tree needs this today: the feed URLs it was written for
# were retired with the webhook transport. It stays because the failure it
# prevents is silent and the cost of keeping it is a regex.
tfvars_mask() {
  sed -E 's/([?&]key=)[A-Za-z0-9._~-]+/\1********/g' "$1"
}

# resolve_tfvars_target <path> <repo-root>
# Prints the real path to write a values file at, after proving git will not
# pick it up. Creates it at mode 0600 when absent.
#
# The only thing that matters here is that a live value cannot be
# committed. That is decided by gitignore, not by where the file lives: a path
# outside the repository is unreachable by git, and a path inside it is safe
# exactly when `git check-ignore` claims it. `*.tfvars` is ignored, so the
# ordinary in-tree location is fine.
#
# This deliberately does NOT require the maintainers' private checkout. Some
# machines symlink these files there; a machine with only a local credential
# file is a supported configuration and must be able to run this, so a symlink
# is followed where one exists and never demanded.
resolve_tfvars_target() {
  local path="$1" repo_root="$2" resolved

  if [[ -L "$path" && ! -e "$path" ]]; then
    echo "ERROR: $path is a symlink pointing at nothing." >&2
    echo "       Restore its target, or pass --tfvars with a path that exists." >&2
    return 1
  fi

  if [[ ! -e "$path" ]]; then
    # Terraform needs the assignment to live somewhere; refusing here would
    # leave an operator with a correct key and nowhere to put it.
    umask 077
    if ! : > "$path" 2>/dev/null; then
      echo "ERROR: $path does not exist and could not be created." >&2
      return 1
    fi
    echo "    created $path" >&2
  fi

  resolved="$(readlink -f "$path")"
  if [[ -z "$resolved" || ! -f "$resolved" ]]; then
    echo "ERROR: $path does not resolve to a file." >&2
    return 1
  fi

  case "$resolved" in
    "$repo_root"/*)
      if ! git -C "$repo_root" check-ignore -q "$resolved" 2>/dev/null; then
        echo "ERROR: $resolved is inside this repository and git does not ignore it." >&2
        echo "       A values file is gitignored by design, and the callers of this" >&2
        echo "       helper write live account facts into one. Writing where git can" >&2
        echo "       pick it up is how such a value gets committed. Point --tfvars at" >&2
        echo "       an ignored path (*.tfvars is ignored) or at one outside the tree." >&2
        return 1
      fi
      ;;
  esac

  printf '%s' "$resolved"
}

# write_tfvars_string <resolved-path> <var-name> <value> [abort-hint]
# Replace-or-append a terraform string assignment, show a key-masked diff,
# confirm, install. Duplicates collapse, because terraform takes the last
# assignment and a stale duplicate below the rewritten line would win over the
# value the operator was shown.
#
# The abort hint is the caller's, because what a declined write leaves behind
# differs by caller and a generic line would be wrong somewhere: a minted
# webhook key is already installed on a host and needs regenerating, while an
# ARN read back from IAM is still there to be read again. Omitted, the refusal
# says only that the file is unchanged, which is always true.
write_tfvars_string() {
  local path="$1" var="$2" value="$3" hint="${4:-}" tmp
  umask 077
  tmp="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"

  VAR_NAME="$var" VAR_VALUE="$value" awk '
    BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*="; seen = 0 }
    $0 ~ pattern {
      if (!seen) { printf "%s = \"%s\"\n", ENVIRON["VAR_NAME"], ENVIRON["VAR_VALUE"]; seen = 1 }
      next
    }
    { print }
    END { if (!seen) printf "%s = \"%s\"\n", ENVIRON["VAR_NAME"], ENVIRON["VAR_VALUE"] }
  ' "$path" > "$tmp"

  echo ""
  echo "Terraform values change in ${path} (key masked):"
  diff -u <(tfvars_mask "$path") <(tfvars_mask "$tmp") || true
  echo ""

  if ! confirm_from_tty "Write this to ${path}? (yes/no): " "yes"; then
    rm -f "$tmp"
    echo ""
    echo "Aborted: the values file is unchanged." >&2
    [[ -n "$hint" ]] && printf '%s\n' "$hint" >&2
    return 1
  fi

  cat "$tmp" > "$path"
  rm -f "$tmp"
  echo "    wrote ${var} to ${path}"
  return 0
}

# Set to "yes" by a caller's --yes flag, matching the deploy wrapper's -y.
#
# Assigned unconditionally, NOT defaulted from the environment. This used to read
# "${ASSUME_YES:-no}", which meant every script sourcing this file inherited the
# variable from whatever shell launched it: an exported ASSUME_YES=yes accepted
# the typed confirmation on a production apply, on arming live payments, and on
# restoring a database, with no terminal involved and nothing printed to say so.
# The name is generic enough that an unrelated tool could set it.
#
# Each caller was clearing the variable before sourcing to defend against that,
# which is a convention every new script has to remember and one no test can
# enforce from the outside. Assigning here removes the class instead: a caller
# cannot inherit what the library always overwrites, and --yes still works
# because every caller parses its flags after this file is sourced.
ASSUME_YES="no"

# require_target <value> <accepted...> — which environment a run lands on.
#
# Nineteen scripts had their own copy of this, each a hand-written case with its
# own wording and its own accepted set, and the sets had already diverged: the
# apply wrapper takes a third `shared` target, and the production-only levers
# take one. Nothing checked that a new script had the guard at all.
#
# It has produced no defect yet, which is the honest reason this was a card
# rather than a fix. But it is the same structure as the confirmation flag, which
# every script was expected to clear before sourcing: seven had not, and an
# exported value accepted the typed confirmation on a production apply, on arming
# live payments, and on restoring a database. That was fixed here rather than in
# each caller, and this is the same move for the same reason -- a safety property
# that depends on every script independently getting the same thing right belongs
# where every script already goes.
#
# The accepted values are the caller's, so a script whose subject exists in one
# environment expresses that by naming one. What is shared is the refusal, its
# wording, and the fact that there is never a default.
# The flag this script spells it with. Most say --target; the secret
# provisioners say --env, and telling an operator to fix a flag their script
# does not have is worse than the duplication this replaces. Callers set it
# before calling and the default covers the majority.
REQUIRE_TARGET_FLAG="--target"

require_target() {
  local value="$1"
  shift
  local accepted=("$@") candidate
  local flag="${REQUIRE_TARGET_FLAG:---target}"

  if [[ "${#accepted[@]}" -eq 0 ]]; then
    echo "ERROR: require_target was called with no accepted values." >&2
    return 2
  fi

  # The accepted set, written the way nineteen scripts already wrote it:
  # "'a'", "'a' or 'b'", "'a', 'b' or 'c'". Matching the established phrasing
  # rather than inventing a house style is deliberate. Eighteen test files
  # assert on these words, and those assertions are pinning a contract with the
  # operator that has no reason to change just because the implementation moved.
  # A refactor that rewrites every error message is a refactor nobody can review
  # for behaviour, because every diff line looks like a change.
  local list=""
  local i
  for (( i = 0; i < ${#accepted[@]}; i++ )); do
    if (( i == 0 )); then
      list="'${accepted[i]}'"
    elif (( i == ${#accepted[@]} - 1 )); then
      list="${list} or '${accepted[i]}'"
    else
      list="${list}, '${accepted[i]}'"
    fi
  done

  if [[ -z "$value" ]]; then
    echo "ERROR: ${flag} is required (${list})." >&2
    echo "       There is deliberately no default. Which environment a run" >&2
    echo "       lands on is never inherited from ambient state: a forgotten" >&2
    echo "       flag would otherwise send the run somewhere unintended, and" >&2
    echo "       every step after it would succeed just as readily." >&2
    return 2
  fi

  for candidate in "${accepted[@]}"; do
    [[ "$value" == "$candidate" ]] && return 0
  done

  echo "ERROR: ${flag} must be ${list} (got '${value}')." >&2
  return 2
}

# confirm_from_tty <prompt> <expected-word>
# Reads from the terminal rather than stdin, because stdin is the credential
# pipe and a prompt reading from it would swallow the next line of the
# operator's credential file. Returns non-zero unless the operator types the
# expected word exactly, or --yes was given.
#
# The tty is probed by opening it, not with `[ -r /dev/tty ]`. That test checks
# the device node's permissions, which pass in a process with no controlling
# terminal, while the open then fails with "No such device or address" -- so the
# permission test reports a terminal that is not there.
#
# Without a terminal and without --yes this refuses rather than defaulting. The
# prompt guards overwriting a deployed host's configuration, and a default of
# "go ahead" is not one to take on a caller's behalf.
#
# Opening /dev/tty is necessary but not sufficient, because a controlling
# terminal outlives the redirection of the standard streams. A script spawned by
# a test harness from an interactive shell has stdout and stderr on pipes while
# /dev/tty still reaches the developer's terminal, so probing the device alone
# would print a prompt into their session and block the suite on an answer only a
# human could give. Requiring stdout and stderr to be terminals as well makes the
# refusal deterministic wherever output is captured. stdin is deliberately not
# checked: under the credential-pipe pattern it belongs to the piped secret, which
# is the whole reason this reads from /dev/tty instead.
#
# The refusal names no flag, and that is deliberate. Sixteen callers accept
# --yes and seven do not, and several of the seven refuse it correctly: they
# mint a credential, delete an access key, or replace a live database, and a
# non-interactive bypass is the thing that must not exist on those. A refusal
# offering a way out that the caller's own parser rejects costs the reader a
# second failed run before they work out that an interactive shell is the only
# answer. The alternative, a variable each caller sets to declare that it does
# accept the flag, is rejected on principle: a safety or accuracy property that
# depends on every script independently remembering something belongs where
# every script already goes, not in a convention no test can enforce from
# outside. A caller that does take
# --yes documents it in its own usage text, which is where a reader looks for a
# flag.
confirm_from_tty() {
  local prompt="$1" expected="$2" answer=""
  if [[ "$ASSUME_YES" == "yes" ]]; then
    echo "${prompt}[--yes]" >&2
    return 0
  fi
  if ! terminal_present; then
    echo "" >&2
    echo "ERROR: no terminal to confirm on." >&2
    echo "       Re-run this from an interactive shell. If this script accepts a" >&2
    echo "       flag to confirm without asking, its --help says so." >&2
    return 1
  fi
  printf '%s' "$prompt" > /dev/tty
  read -r answer < /dev/tty || answer=""
  [[ "$answer" == "$expected" ]]
}
