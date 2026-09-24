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

# aws_cred_remove_section <credentials-file> <profile>
#
# Removes one whole section and everything in it, keeping every other byte of
# the file, and returns 2 when there is no such section so a re-run can say so
# rather than fail.
#
# The only destructive operation in this library, and it exists for exactly one
# job: retiring a profile name whose credential has already been written
# somewhere else and proved there. Never call it before that proof. A section
# removed while the replacement is unproved leaves a workstation with no working
# identity and nothing on disk to go back to, since the secret it held was never
# anywhere but this file and the vault.
#
# Atomic and shredded for the same reasons aws_cred_put is: the temp file holds
# the secret this call is destroying, and a half-written credentials file breaks
# every AWS call on the machine.
aws_cred_remove_section() {
  local file="$1" profile="$2"
  local dir tmp line norm in_target=0 found=0

  AWS_CRED_ERROR=""

  if [[ -z "$file" || -z "$profile" ]]; then
    AWS_CRED_ERROR="aws_cred_remove_section needs a file and a profile"
    return 1
  fi

  [[ -f "$file" ]] || return 2

  if [[ -L "$file" ]]; then
    local resolved
    if ! resolved="$(readlink -f -- "$file")" || [[ -z "$resolved" ]]; then
      AWS_CRED_ERROR="${file} is a symlink whose target cannot be resolved"
      return 1
    fi
    file="$resolved"
  fi

  aws_cred_has_section "$file" "$profile" || return 2

  dir="$(dirname -- "$file")"
  tmp="$(umask 077 && mktemp "${dir}/.aws-credentials.XXXXXX")" || {
    AWS_CRED_ERROR="could not create a temp file beside ${file}"
    return 1
  }
  secret_file_register "$tmp"
  # shellcheck disable=SC2064
  trap "secret_file_destroy '${tmp}'; trap - RETURN" RETURN

  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    if [[ "$norm" == \[*\] ]]; then
      if [[ "$norm" == "[${profile}]" ]]; then
        in_target=1
        found=1
        continue
      fi
      in_target=0
    fi
    (( in_target )) && continue
    printf '%s\n' "$line" >> "$tmp"
  done < "$file"

  if (( ! found )); then
    return 2
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

# aws_cred_has_section <credentials-file> <profile>
#
# True when the credentials file carries a `[<name>]` section. The credentials
# file spells a profile without the `profile ` prefix the config file uses,
# which is why this is not the same test as aws_config_has_profile.
aws_cred_has_section() {
  local file="$1" profile="$2" line norm
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    [[ "$norm" == "[${profile}]" ]] && return 0
  done < "$file"
  return 1
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

# aws_config_has_section <config-file> <header>
#
# True when the file carries a section whose header is exactly <header>, given
# without its brackets: "profile footbag-operator", "sso-session footbag". The
# config file holds several kinds of section and only one of them is a profile,
# so the sso-session block a federated profile points at cannot be found by
# asking about profiles.
#
# Whitespace inside the header is ignored on both sides of the comparison, the
# same as the profile check above, because the AWS tools accept "[profile  x]"
# and an operator's editor sometimes produces it.
aws_config_has_section() {
  local file="$1" header="$2" line norm want
  want="[${header//[[:space:]]/}]"
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    [[ "$norm" == "$want" ]] && return 0
  done < "$file"
  return 1
}

# aws_config_profile_key_id <config-file> <profile>
#
# Prints the access key id recorded directly in a `[profile <name>]` section of
# the CONFIG file, and nothing when there is none.
#
# It exists because a static key is allowed to live in either file, and the one
# question that matters before writing a role-assuming section is whether a
# static key already occupies that name in either. A key found here resolves
# ahead of the role session the SDK would mint for the caller, silently, so a
# caller that asked only about the credentials file would write a section that
# looks configured and is never used.
aws_config_profile_key_id() {
  local file="$1" profile="$2" line norm in_target=0
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    if [[ "$norm" == \[*\] ]]; then
      in_target=0
      [[ "$norm" == "[profile${profile}]" ]] && in_target=1
      continue
    fi
    if (( in_target )) && [[ "$norm" == aws_access_key_id=* ]]; then
      printf '%s' "${norm#aws_access_key_id=}"
      return 0
    fi
  done < "$file"
  return 0
}

# aws_config_profile_source <config-file> <profile>
#
# Prints the `source_profile` recorded in a `[profile <name>]` section, and
# nothing when the section has none or does not exist.
#
# For a caller that leaves an existing section alone, as everything here does,
# but still needs to say what that section points at. A chained profile sourcing
# one identity or another both work; which one it is decides whose name ends up
# on the calls, and that is worth reporting rather than silently accepting.
aws_config_profile_source() {
  local file="$1" profile="$2" line norm in_target=0
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    norm="${line//[[:space:]]/}"
    if [[ "$norm" == \[*\] ]]; then
      in_target=0
      [[ "$norm" == "[profile${profile}]" ]] && in_target=1
      continue
    fi
    if (( in_target )) && [[ "$norm" == source_profile=* ]]; then
      printf '%s' "${norm#source_profile=}"
      return 0
    fi
  done < "$file"
  return 0
}

# aws_config_append_section <config-file> <header> <body-line>...
#
# Appends one section, header given without its brackets, and does nothing at
# all when a section of that header already exists, returning 2 so the caller
# can say so.
#
# Additive for the same reason aws_config_add_role_profile below is: a config
# section is the operator's, and it may carry a duration, an output format or an
# mfa_serial somebody set for a reason this script cannot see. The write is
# atomic for the same reason too: a half-written config file breaks every AWS
# call on the machine and the operator has no copy of what was there.
#
# Nothing that goes through here is a secret. A role ARN, an account id and the
# name of the section a chain sources from are not credentials; no key material
# passes through this function, which is what separates it from aws_cred_put
# above.
aws_config_append_section() {
  local file="$1" header="$2"
  shift 2
  local dir tmp line

  AWS_CRED_ERROR=""

  if [[ -z "$file" || -z "$header" || $# -eq 0 ]]; then
    AWS_CRED_ERROR="aws_config_append_section needs a file, a header and at least one line"
    return 1
  fi

  if [[ -e "$file" && ! -f "$file" ]]; then
    AWS_CRED_ERROR="${file} exists and is not a regular file"
    return 1
  fi

  # A symlink here is a legitimate way to point the config into a checkout, and
  # the rename below would replace the link with a file rather than write
  # through it.
  if [[ -L "$file" ]]; then
    local resolved
    if ! resolved="$(readlink -f -- "$file")" || [[ -z "$resolved" ]]; then
      AWS_CRED_ERROR="${file} is a symlink whose target cannot be resolved"
      return 1
    fi
    file="$resolved"
  fi

  if aws_config_has_section "$file" "$header"; then
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
    printf '[%s]\n' "$header"
    for line in "$@"; do
      printf '%s\n' "$line"
    done
  } >> "$tmp"

  chmod 600 "$tmp"
  if ! mv -f -- "$tmp" "$file"; then
    rm -f -- "$tmp"
    AWS_CRED_ERROR="could not install ${file}"
    return 1
  fi
  return 0
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
# The optional sixth argument is the role session name. Omit it and the SDK
# invents one, currently `botocore-session-<epoch>`, which is fine for a role
# that does not care who assumed it and fatal for one that does: a trust policy
# conditioned on the session name matching the assuming user refuses every
# generated name, and the refusal reads as a broken credential rather than as a
# missing config line. Where the role carries that condition, pass it.
aws_config_add_role_profile() {
  local file="$1" profile="$2" role_arn="$3" source_profile="$4" region="$5"
  local session_name="${6:-}"
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
    [[ -n "$session_name" ]] && printf 'role_session_name = %s\n' "$session_name"
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
