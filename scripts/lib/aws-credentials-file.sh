#!/usr/bin/env bash
# shellcheck shell=bash
# aws-credentials-file.sh — put a long-lived key into an AWS credentials file
# without disturbing anything else in it.
#
# This is the one file in the estate that an operator has always edited by hand,
# because no script owned it. Hand-editing it has three failure modes and all
# three have bitten somebody somewhere:
#
#   - a truncated paste. An access key id or secret that lost characters on the
#     way out of a vault produces an InvalidClientTokenId or a signature error
#     hours later, in whatever tool is run next, and reads as an outage.
#   - a stale session token. A credentials profile that still carries
#     aws_session_token beside a freshly pasted long-lived key fails every call
#     with a message about the token rather than about the key.
#   - a half-written file. An editor or a redirect that dies mid-write leaves a
#     credentials file that parses as far as the damage and then does not, and
#     the operator has no copy of what was there.
#
# So the write is atomic and the section is replaced in place: the new file is
# built beside the old one and renamed over it, which on one filesystem is a
# rename a reader cannot observe halfway. Everything outside the named profile
# survives byte for byte, and inside it anything that is not a credential --
# a region, an output format -- is kept, because it is not ours to discard.
#
# The values arrive as function arguments, which are internal to the shell and
# never reach any process's argv. Nothing here writes a secret to a path the
# caller did not name, and nothing here logs one.

AWS_CRED_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=secret-file.sh
source "${AWS_CRED_LIB_DIR}/secret-file.sh"

# The reason the last call failed, empty on success.
AWS_CRED_ERROR=""

# aws_cred_key_id_looks_valid <access-key-id>
#
# Shape only; it says nothing about whether the key exists. The point is to
# catch the paste that lost characters before it is written and believed.
#
# AKIA is the prefix of a long-lived key belonging to an IAM user. ASIA is a
# temporary session credential, which is a different thing that expires, and an
# operator who pastes one has copied the wrong line: it is refused here rather
# than installed and left to stop working in a few hours.
aws_cred_key_id_looks_valid() {
  [[ "$1" =~ ^AKIA[A-Z0-9]{16}$ ]]
}

# aws_cred_secret_looks_valid <secret-access-key>
aws_cred_secret_looks_valid() {
  [[ "$1" =~ ^[A-Za-z0-9/+=]{40}$ ]]
}

# aws_cred_put <file> <profile> <access-key-id> <secret>
#
# Replaces the two credential lines of <profile> in place, keeping the section
# where it sits and keeping every other line of the file. Creates the section,
# and the file, when either is absent.
aws_cred_put() {
  local file="$1" profile="$2" akid="$3" sak="$4"
  local dir tmp line norm
  local in_target=0 emitted=0

  AWS_CRED_ERROR=""

  if [[ -z "$file" || -z "$profile" || -z "$akid" || -z "$sak" ]]; then
    AWS_CRED_ERROR="aws_cred_put needs a file, a profile, a key id and a secret"
    return 1
  fi

  if [[ -e "$file" && ! -f "$file" ]]; then
    AWS_CRED_ERROR="${file} exists and is not a regular file"
    return 1
  fi

  # A symlink passes the `-f` test above, because that follows it. The atomic
  # rename below would then replace the LINK with a regular file: the link's
  # target keeps the old key, the link is gone, and re-creating it later
  # reinstates a credential that was supposed to have been retired. Nobody would
  # connect that to this run.
  #
  # Resolved rather than refused, because pointing this file into a checkout or
  # a synced folder is a legitimate thing to do. What is not legitimate is
  # silently turning the link into a file.
  if [[ -L "$file" ]]; then
    local resolved
    if ! resolved="$(readlink -f -- "$file")" || [[ -z "$resolved" ]]; then
      AWS_CRED_ERROR="${file} is a symlink whose target cannot be resolved"
      return 1
    fi
    file="$resolved"
  fi

  dir="$(dirname -- "$file")"
  if [[ ! -d "$dir" ]]; then
    mkdir -p -m 700 -- "$dir" || {
      AWS_CRED_ERROR="could not create ${dir}"
      return 1
    }
  fi

  # Beside the target rather than in a temp directory, so the promotion below is
  # a rename within one filesystem. A rename across filesystems is a copy and a
  # delete, which is exactly the half-written window this avoids.
  tmp="$(umask 077 && mktemp "${dir}/.aws-credentials.XXXXXX")" || {
    AWS_CRED_ERROR="could not create a temp file beside ${file}"
    return 1
  }
  # Shredded rather than unlinked: between creation and the rename this file
  # holds the secret, and every path out of here that is not the rename leaves
  # it behind. Safe after a successful rename too, because the path is gone by
  # then and destroying a path that does not exist is a no-op.
  #
  # Clears itself: a RETURN trap fires for the function that set it and then
  # stays set on the shell, where it would run against a freed path at the
  # caller's next source.
  #
  # RETURN alone is not enough, because it does not fire on an interrupt. It stays
  # because it destroys the file the moment this function is finished with it,
  # which is sooner than the run ends; the registry is what covers Ctrl-C, swept
  # by the caller's own EXIT/INT/TERM trap.
  secret_file_register "$tmp"
  # shellcheck disable=SC2064
  trap "secret_file_destroy '${tmp}'; trap - RETURN" RETURN

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Whitespace-stripped copy for matching only; the line itself is written
      # back untouched unless it is one of ours to replace.
      norm="${line//[[:space:]]/}"

      if [[ "$norm" == \[*\] ]]; then
        in_target=0
        if [[ "$norm" == "[${profile}]" ]]; then
          in_target=1
          emitted=1
          printf '[%s]\n' "$profile" >> "$tmp"
          printf 'aws_access_key_id = %s\n' "$akid" >> "$tmp"
          printf 'aws_secret_access_key = %s\n' "$sak" >> "$tmp"
          continue
        fi
        printf '%s\n' "$line" >> "$tmp"
        continue
      fi

      if (( in_target )); then
        case "$norm" in
          # The session token goes with them. Left behind beside a new
          # long-lived key it is not merely stale, it takes precedence, and
          # every call then fails describing the token rather than the key.
          aws_access_key_id=* | aws_secret_access_key=* | aws_session_token=*)
            continue
            ;;
        esac
      fi

      printf '%s\n' "$line" >> "$tmp"
    done < "$file"
  fi

  if (( ! emitted )); then
    [[ -s "$tmp" ]] && printf '\n' >> "$tmp"
    printf '[%s]\n' "$profile" >> "$tmp"
    printf 'aws_access_key_id = %s\n' "$akid" >> "$tmp"
    printf 'aws_secret_access_key = %s\n' "$sak" >> "$tmp"
  fi

  chmod 600 -- "$tmp" || {
    AWS_CRED_ERROR="could not restrict the mode of the new file"
    return 1
  }
  mv -f -- "$tmp" "$file" || {
    AWS_CRED_ERROR="could not promote the new file over ${file}"
    return 1
  }
  return 0
}

# aws_cred_current_key_id <file> <profile>
#
# The access key id currently recorded for a profile, empty when there is none.
# Reads only the id, never the secret: this exists so a run can show the
# operator what is being replaced.
aws_cred_current_key_id() {
  local file="$1" profile="$2" line norm in_target=0
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    if [[ "$norm" == \[*\] ]]; then
      in_target=0
      [[ "$norm" == "[${profile}]" ]] && in_target=1
      continue
    fi
    if (( in_target )) && [[ "$norm" == aws_access_key_id=* ]]; then
      printf '%s' "${norm#aws_access_key_id=}"
      return 0
    fi
  done < "$file"
  return 0
}

# aws_config_has_profile <config-file> <profile>
#
# True when the file already carries a `[profile <name>]` section. The config
# file spells a named profile with that prefix, unlike the credentials file,
# which is the difference that makes a hand-copied stanza land in the wrong
# shape and resolve as nothing.
aws_config_has_profile() {
  local file="$1" profile="$2" line norm
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    [[ "$norm" == "[profile${profile}]" ]] && return 0
  done < "$file"
  return 1
}

# aws_config_add_role_profile <config-file> <profile> <role-arn> <source-profile> <region>
#
# Appends a chained role profile, and does nothing at all when one of that name
# already exists.
#
# Additive rather than replacing, which is the opposite of aws_cred_put beside
# it, and the difference is deliberate. A credentials section is ours: it holds
# one key and rewriting it is the whole job. A config section is the operator's:
# it may carry an mfa_serial, an output format, a role_session_name or a
# duration somebody set for a reason this script cannot see, and silently
# rewriting it would discard that with no diff and no warning. So an existing
# section is left exactly as it is and reported, and the caller decides.
#
# Nothing here is a secret: a role ARN and a profile name are not credentials.
# The atomic rename is kept anyway, because a half-written config file breaks
# every AWS call on the machine and the operator has no copy of what was there.
aws_config_add_role_profile() {
  local file="$1" profile="$2" role_arn="$3" source_profile="$4" region="$5"
  local dir tmp

  AWS_CRED_ERROR=""

  if [[ -z "$file" || -z "$profile" || -z "$role_arn" || -z "$source_profile" ]]; then
    AWS_CRED_ERROR="aws_config_add_role_profile needs a file, a profile, a role arn and a source profile"
    return 1
  fi

  if [[ -e "$file" && ! -f "$file" ]]; then
    AWS_CRED_ERROR="${file} exists and is not a regular file"
    return 1
  fi

  # Same reasoning as the credentials file: a symlink here is a legitimate way to
  # point the config into a checkout, and the rename below would replace the link
  # with a file rather than write through it.
  if [[ -L "$file" ]]; then
    local resolved
    if ! resolved="$(readlink -f -- "$file")" || [[ -z "$resolved" ]]; then
      AWS_CRED_ERROR="${file} is a symlink whose target cannot be resolved"
      return 1
    fi
    file="$resolved"
  fi

  if aws_config_has_profile "$file" "$profile"; then
    return 2
  fi

  dir="$(dirname -- "$file")"
  if [[ ! -d "$dir" ]]; then
    mkdir -p -m 700 -- "$dir" || {
      AWS_CRED_ERROR="could not create ${dir}"
      return 1
    }
  fi

  tmp="$(umask 077 && mktemp "${dir}/.aws-config.XXXXXX")" || {
    AWS_CRED_ERROR="could not create a temp file beside ${file}"
    return 1
  }

  if [[ -f "$file" ]]; then
    cat -- "$file" >> "$tmp" || {
      rm -f -- "$tmp"
      AWS_CRED_ERROR="could not read ${file}"
      return 1
    }
    # A file whose last line has no newline would otherwise glue the section
    # header onto it, and the result parses as neither.
    if [[ -s "$tmp" ]] && [[ -n "$(tail -c1 -- "$tmp")" ]]; then
      printf '\n' >> "$tmp"
    fi
  fi

  {
    printf '[profile %s]\n' "$profile"
    printf 'role_arn       = %s\n' "$role_arn"
    printf 'source_profile = %s\n' "$source_profile"
    [[ -n "$region" ]] && printf 'region         = %s\n' "$region"
  } >> "$tmp"

  chmod 600 "$tmp"
  if ! mv -f -- "$tmp" "$file"; then
    rm -f -- "$tmp"
    AWS_CRED_ERROR="could not install ${file}"
    return 1
  fi
  return 0
}
