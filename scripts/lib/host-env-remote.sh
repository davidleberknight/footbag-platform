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

# accept-new pins the host key on first contact and fails closed if it later
# changes; ConnectTimeout fails fast on a dead target; ServerAliveInterval keeps
# the pipe alive across NAT idle timeouts. Same set the deploy scripts use.
HOST_SSH_OPTS=(-o "StrictHostKeyChecking=accept-new" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

HOST_ENV_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_ENV_READ_HALF="${HOST_ENV_LIB_DIR}/../internal/host-env-read-remote.sh"
HOST_ENV_WRITE_HALF="${HOST_ENV_LIB_DIR}/../internal/host-env-write-remote.sh"
HOST_LOG_GREP_HALF="${HOST_ENV_LIB_DIR}/../internal/host-log-grep-remote.sh"

# Set by require_operator_stdin, read by every function that opens a pipe. One
# credential line serves any number of ssh invocations, which a single shared
# stdin could not: the first consumer would drain it.
SUDO_PASS=""

# require_operator_stdin <invocation-example>
# Refuses an interactive stdin rather than hanging on a password nobody is going
# to type, and names the exact form to re-run with.
require_operator_stdin() {
  local invocation="$1"
  if [[ -t 0 ]]; then
    echo "ERROR: must receive the host sudo password on stdin." >&2
    echo "       Run via: < <operator credential file> bash ${invocation}" >&2
    return 1
  fi
  IFS= read -r SUDO_PASS || true
  if [[ -z "$SUDO_PASS" ]]; then
    echo "ERROR: the first line of stdin was empty; expected the host sudo password." >&2
    echo "       Run via: < <operator credential file> bash ${invocation}" >&2
    return 1
  fi
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
# the variable's NAME, and `alarm_webhook_url` carries neither, so it would
# print the key in full. Here the secret is in the value's query string.
tfvars_mask() {
  sed -E 's/([?&]key=)[A-Za-z0-9._~-]+/\1********/g' "$1"
}

# resolve_tfvars_target <path> <repo-root>
# Prints the real path to write a values file at, after proving git will not
# pick it up. Creates it at mode 0600 when absent.
#
# The only thing that matters here is that a live webhook secret cannot be
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
        echo "       This file takes a live webhook secret; writing it where git can" >&2
        echo "       pick it up is how that secret gets committed. Point --tfvars at an" >&2
        echo "       ignored path (*.tfvars is ignored) or at one outside the tree." >&2
        return 1
      fi
      ;;
  esac

  printf '%s' "$resolved"
}

# write_tfvars_url <resolved-path> <var-name> <url>
# Replace-or-append a terraform string assignment, show a key-masked diff,
# confirm, install. Duplicates collapse, because terraform takes the last
# assignment and a stale duplicate below the rewritten line would win over the
# value the operator was shown.
write_tfvars_url() {
  local path="$1" var="$2" url="$3" tmp
  umask 077
  tmp="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"

  VAR_NAME="$var" URL_VALUE="$url" awk '
    BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*="; seen = 0 }
    $0 ~ pattern {
      if (!seen) { printf "%s = \"%s\"\n", ENVIRON["VAR_NAME"], ENVIRON["URL_VALUE"]; seen = 1 }
      next
    }
    { print }
    END { if (!seen) printf "%s = \"%s\"\n", ENVIRON["VAR_NAME"], ENVIRON["URL_VALUE"] }
  ' "$path" > "$tmp"

  echo ""
  echo "Terraform values change in ${path} (key masked):"
  diff -u <(tfvars_mask "$path") <(tfvars_mask "$tmp") || true
  echo ""

  if ! confirm_from_tty "Write this to ${path}? (yes/no): " "yes"; then
    rm -f "$tmp"
    echo ""
    echo "Aborted: the values file is unchanged. The key is installed on the host," >&2
    echo "so re-run with --rotate to generate a fresh one and write it in one pass." >&2
    return 1
  fi

  cat "$tmp" > "$path"
  rm -f "$tmp"
  echo "    wrote ${var} to ${path}"
  return 0
}

# Set to "yes" by a caller's --yes flag, matching the deploy wrapper's -y.
ASSUME_YES="${ASSUME_YES:-no}"

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
confirm_from_tty() {
  local prompt="$1" expected="$2" answer=""
  if [[ "$ASSUME_YES" == "yes" ]]; then
    echo "${prompt}[--yes]" >&2
    return 0
  fi
  if [[ ! -t 1 || ! -t 2 ]] || ! { true >/dev/tty; } 2>/dev/null; then
    echo "" >&2
    echo "ERROR: no terminal to confirm on, and --yes was not given." >&2
    echo "       Re-run from an interactive shell, or pass --yes to accept this change." >&2
    return 1
  fi
  printf '%s' "$prompt" > /dev/tty
  read -r answer < /dev/tty || answer=""
  [[ "$answer" == "$expected" ]]
}
