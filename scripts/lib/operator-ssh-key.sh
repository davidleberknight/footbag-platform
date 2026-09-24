# shellcheck shell=bash
# operator-ssh-key.sh — the named account's own SSH key, on the workstation
# that onboards it, and the logins that prove where each key is accepted.
#
# WHY THIS IS A LIBRARY.
#
# Hiring a footbag-operator holder's named identity is one command, and the key
# is minted by that command on the holder's own machine. It has to be held by
# the agent before the host step, whose logins prove it in batch mode. Firing
# sweeps a named account's keys off every account on the host, the shared one
# included, so the named key must never be the key the shared account holds.
# These functions are that half of the hire, kept apart from the command that
# sequences it so its rules about which key is which live in one place.
#
# The alias itself is the default and is never edited here: it connects as the
# shared account, always. The named account is reached through a Match block
# that applies only under the job role's profile (see ssh-alias.sh).
#
# Two keys, and which is which is always read, never guessed:
#   main key  the one IdentityFile on the alias that is not the named key; the
#             shared account holds it
#   named key ~/.ssh/id_ed25519_<account>, made here if absent, never overwritten
#
# Callers set OSK_SSH_BIN and OSK_SSH_ADD_BIN to replace the clients in tests,
# and must have sourced host-env-remote.sh (for the terminal test and the pinned
# host-key options) and ssh-alias.sh.

OSK_SSH_BIN="${OSK_SSH_BIN:-ssh}"
OSK_SSH_ADD_BIN="${OSK_SSH_ADD_BIN:-ssh-add}"
OSK_SSH_AGENT_BIN="${OSK_SSH_AGENT_BIN:-ssh-agent}"
# Set when this run started the agent it uses, so the run stops that agent, and
# only that one, when it ends.
OSK_STARTED_AGENT=0
OSK_SHARED_ACCOUNT="footbag"

OSK_USER=""
OSK_HOST=""
OSK_PORT=""
OSK_MAIN_KEY=""
OSK_MAIN_FP=""
OSK_NAMED_KEY=""
OSK_NAMED_KEY_TILDE=""
OSK_NAMED_FP=""

osk_expand_home() {
  local p="$1"
  [[ "$p" == "~/"* ]] && p="${HOME}/${p#\~/}"
  printf '%s\n' "$p"
}

osk_fingerprint() {
  ssh-keygen -l -f "$1" 2>/dev/null | cut -d' ' -f2
}

osk_need_terminal() {
  if ! terminal_present; then
    echo "ERROR: $1 needs a terminal, and there is none. Re-run from an interactive shell." >&2
    return 1
  fi
}

# osk_resolve_alias <alias> <account>
# Reads the alias the way every run resolves it and names the two keys. The
# alias must connect as the shared account: that is the default every run
# relies on, and a hire or a fire that found it pointing elsewhere would be
# acting on a workstation whose default has already been changed.
osk_resolve_alias() {
  local alias_name="$1" account="$2" g only count=0 path
  OSK_NAMED_KEY_TILDE="~/.ssh/id_ed25519_${account}"
  OSK_NAMED_KEY="${HOME}/.ssh/id_ed25519_${account}"
  OSK_MAIN_KEY=""

  # The default, read with the job role's profile out of the way.
  g="$(env -u AWS_PROFILE "$OSK_SSH_BIN" -G "$alias_name" </dev/null 2>/dev/null || true)"
  OSK_USER="$(awk '/^user /{print $2}' <<<"$g" | tail -1)"
  OSK_HOST="$(awk '/^hostname /{print $2}' <<<"$g" | tail -1)"
  OSK_PORT="$(awk '/^port /{print $2}' <<<"$g" | tail -1)"
  only="$(awk '/^identitiesonly /{print $2}' <<<"$g" | tail -1)"

  if [[ -z "$OSK_HOST" || "$OSK_HOST" == "$alias_name" ]]; then
    echo "ERROR: the '${alias_name}' alias is not configured on this workstation." >&2
    return 1
  fi
  if [[ "$OSK_USER" != "$OSK_SHARED_ACCOUNT" ]]; then
    echo "ERROR: '${alias_name}' connects as '${OSK_USER:-nothing}', not the shared account" >&2
    echo "       '${OSK_SHARED_ACCOUNT}'. That is the default every run relies on. Change its" >&2
    echo "       User line back to ${OSK_SHARED_ACCOUNT} and re-run." >&2
    return 1
  fi
  if [[ "$only" != "yes" ]]; then
    echo "ERROR: '${alias_name}' does not set 'IdentitiesOnly yes'. Without it the client" >&2
    echo "       offers every key the agent holds, so which key the host accepted proves" >&2
    echo "       nothing. Add the line to the stanza and re-run." >&2
    return 1
  fi

  # The named key is skipped rather than counted, so a stanza that still lists
  # it from an earlier hire is read the same way as one that does not.
  while read -r _ path; do
    path="$(osk_expand_home "$path")"
    [[ "$path" == "$OSK_NAMED_KEY" ]] && continue
    OSK_MAIN_KEY="$path"
    count=$(( count + 1 ))
  done < <(grep '^identityfile ' <<<"$g" || true)

  if (( count != 1 )) || [[ ! -f "$OSK_MAIN_KEY" || ! -f "${OSK_MAIN_KEY}.pub" ]]; then
    echo "ERROR: '${alias_name}' must name exactly one key besides ${OSK_NAMED_KEY_TILDE}:" >&2
    echo "       the main key the shared account holds, as an IdentityFile whose private" >&2
    echo "       and public halves are both on this machine. It names ${count}. Which key" >&2
    echo "       is the main one is read from the stanza, never guessed." >&2
    return 1
  fi
  OSK_MAIN_FP="$(osk_fingerprint "${OSK_MAIN_KEY}.pub")"
  if [[ -z "$OSK_MAIN_FP" ]]; then
    echo "ERROR: could not read the fingerprint of ${OSK_MAIN_KEY}.pub." >&2
    return 1
  fi
  return 0
}

# osk_ensure_pair <account>
# Makes the named pair if it is absent, with no passphrase, like the main key,
# and refuses one that is the main key under another name.
osk_ensure_pair() {
  local account="$1"
  if [[ -f "$OSK_NAMED_KEY" && -f "${OSK_NAMED_KEY}.pub" ]]; then
    echo "  already made: ${OSK_NAMED_KEY}"
  elif [[ -e "$OSK_NAMED_KEY" || -e "${OSK_NAMED_KEY}.pub" ]]; then
    echo "ERROR: only one half of ${OSK_NAMED_KEY} exists. It is left alone rather than" >&2
    echo "       overwritten. Restore the missing half, or move both aside, and re-run." >&2
    return 1
  else
    echo "  making ${OSK_NAMED_KEY}"
    # Standard input carries the sudo password, so ssh-keygen is given none.
    ssh-keygen -q -t ed25519 -N '' -C "$account" -f "$OSK_NAMED_KEY" </dev/null || return 1
  fi
  OSK_NAMED_FP="$(osk_fingerprint "${OSK_NAMED_KEY}.pub")"
  if [[ -z "$OSK_NAMED_FP" ]]; then
    echo "ERROR: could not read the fingerprint of ${OSK_NAMED_KEY}.pub." >&2
    return 1
  fi
  if [[ "$OSK_NAMED_FP" == "$OSK_MAIN_FP" ]]; then
    echo "ERROR: ${OSK_NAMED_KEY} is the main key (same fingerprint, ${OSK_MAIN_FP})." >&2
    echo "       The shared account would lose it the day this account is fired. Move" >&2
    echo "       that pair aside and re-run to make a new one." >&2
    return 1
  fi
  echo "  main key:  ${OSK_MAIN_KEY}  ${OSK_MAIN_FP}"
  echo "  named key: ${OSK_NAMED_KEY}  ${OSK_NAMED_FP}"
}

# osk_stop_agent
# Stops the agent this run started, and nothing else. Safe to call from a trap
# and more than once. An agent the operator already had is theirs and is left
# running with whatever this run loaded into it.
osk_stop_agent() {
  if (( OSK_STARTED_AGENT )); then
    "$OSK_SSH_AGENT_BIN" -k >/dev/null 2>&1 || true
    OSK_STARTED_AGENT=0
  fi
}

# osk_ensure_agent
# Both keys in the agent. The logins that prove which account takes which key
# run in batch mode, which cannot ask for a passphrase: a key the agent does not
# hold is simply not offered, and a refusal would then read as a proof.
#
# With no agent reachable, the run starts one for itself rather than sending
# the operator off to start one: the host step it runs as a child inherits it,
# and the caller's trap stops it when the run ends.
osk_ensure_agent() {
  local list rc=0 pair key fp started
  list="$("$OSK_SSH_ADD_BIN" -l 2>/dev/null)" || rc=$?
  if (( rc == 2 )); then
    if ! started="$("$OSK_SSH_AGENT_BIN" -s 2>/dev/null)"; then
      echo "ERROR: no SSH agent is reachable, and starting one failed." >&2
      return 1
    fi
    # The agent prints the two variables that reach it, as shell assignments.
    eval "$started" >/dev/null
    OSK_STARTED_AGENT=1
    echo "  started an SSH agent for this run; it stops when the run ends"
    rc=0
    list="$("$OSK_SSH_ADD_BIN" -l 2>/dev/null)" || rc=$?
    if (( rc == 2 )); then
      echo "ERROR: started an SSH agent, but it is not reachable." >&2
      return 1
    fi
  fi
  for pair in "${OSK_MAIN_KEY}|${OSK_MAIN_FP}" "${OSK_NAMED_KEY}|${OSK_NAMED_FP}"; do
    key="${pair%%|*}"
    fp="${pair#*|}"
    if grep -qF " ${fp} " <<<"${list} "; then
      echo "  the agent holds ${key}"
    else
      osk_need_terminal "Loading ${key} into the agent" || return 1
      # From the terminal: ssh-add reads a passphrase from standard input when it
      # is not a terminal, and standard input is the sudo password.
      "$OSK_SSH_ADD_BIN" "$key" </dev/tty || return 1
      echo "  loaded ${key}"
    fi
  done
}

# osk_resolved_user <alias> [<aws-profile>]
# The account ssh resolves the alias as, with AWS_PROFILE set to the given
# profile or, with none given, cleared.
osk_resolved_user() {
  local alias_name="$1" profile="${2:-}"
  if [[ -n "$profile" ]]; then
    AWS_PROFILE="$profile" "$OSK_SSH_BIN" -G "$alias_name" </dev/null 2>/dev/null | awk '/^user /{print $2}' | tail -1
  else
    env -u AWS_PROFILE "$OSK_SSH_BIN" -G "$alias_name" </dev/null 2>/dev/null | awk '/^user /{print $2}' | tail -1
  fi
}

# osk_ensure_match_block <config-file> <alias> <account> <profile>
# Adds the named account's Match block above the alias, after a diff and a
# typed APPLY, and proves both outcomes the way every run resolves the alias:
# the shared account by default, the named account under the job role's profile.
osk_ensure_match_block() {
  local config="$1" alias_name="$2" account="$3" profile="$4" tmp rc=0 got
  if [[ ! -f "$config" ]]; then
    echo "ERROR: ${config} does not exist, so there is no ${alias_name} stanza to add beside." >&2
    return 1
  fi
  tmp="$(mktemp "${TMPDIR:-/tmp}/footbag-ssh-config.XXXXXX")"
  chmod 600 "$tmp"
  ssh_alias_add_match_block "$config" "$alias_name" "$account" "$profile" "$tmp" || rc=$?
  case "$rc" in
    0)
      echo ""
      echo "  The lines it adds to ${config}. The ${alias_name} stanza itself is unchanged:"
      echo ""
      diff -u "$config" "$tmp" || true
      echo ""
      if ! confirm_from_tty "  Type 'APPLY' to add them: " "APPLY"; then
        rm -f -- "$tmp"
        echo "  Not confirmed; ${config} is unchanged." >&2
        return 1
      fi
      cat "$tmp" > "$config"
      ;;
    2) echo "  already present in ${config}" ;;
    3)
      rm -f -- "$tmp"
      echo "ERROR: no Host line naming ${alias_name} in ${config}. An alias reached through" >&2
      echo "       a wildcard or an included file reads as absent here, deliberately." >&2
      return 1
      ;;
    4)
      rm -f -- "$tmp"
      echo "ERROR: ${config} already has a block for ${alias_name} naming another account." >&2
      echo "       One workstation acts as one named person. Nothing changed." >&2
      return 1
      ;;
    *)
      rm -f -- "$tmp"
      echo "ERROR: could not read ${config}, or the result would not parse. Nothing changed." >&2
      return 1
      ;;
  esac
  rm -f -- "$tmp"

  got="$(osk_resolved_user "$alias_name")"
  if [[ "$got" != "$OSK_SHARED_ACCOUNT" ]]; then
    echo "ERROR: by default ${alias_name} now resolves as '${got:-nothing}', not ${OSK_SHARED_ACCOUNT}." >&2
    return 1
  fi
  got="$(osk_resolved_user "$alias_name" "$profile")"
  if [[ "$got" != "$account" ]]; then
    echo "ERROR: under AWS_PROFILE=${profile}, ${alias_name} resolves as '${got:-nothing}'," >&2
    echo "       not ${account}. An earlier Host pattern or an included file sets User" >&2
    echo "       first and wins. Fix that and re-run." >&2
    return 1
  fi
  echo "  ${alias_name} connects as ${OSK_SHARED_ACCOUNT} by default, and as ${account} only"
  echo "  for a command run through scripts/as-dev-tester.sh --account ${account}"
}

# osk_probe <account> <key>: prints accepted, refused or unproven.
# One key is offered and nothing else: the alias's own configuration is set
# aside so its IdentityFile list cannot add a second, and the host and port it
# resolved are given directly. No connection is shared, since a reused one
# would prove an earlier login rather than this one.
osk_probe() {
  local account="$1" key="$2" err rc=0
  err="$("$OSK_SSH_BIN" -F /dev/null "${FOOTBAG_SSH_PIN_OPTS[@]}" \
    -o "User=${account}" -o "Port=${OSK_PORT}" -o "IdentityFile=${key}" \
    -o "IdentitiesOnly=yes" -o "BatchMode=yes" -o "ControlPath=none" \
    -o "ConnectTimeout=10" "$OSK_HOST" true 2>&1 >/dev/null </dev/null)" || rc=$?
  if (( rc == 0 )); then
    echo accepted
  elif (( rc == 255 )) && grep -q 'Permission denied' <<<"$err"; then
    echo refused
  else
    echo unproven
  fi
}

# osk_sudo_filed <account> <target>: prints yes, no or unproven.
# Whether the account's password file on this machine was written after the
# named key was made and is accepted by sudo on the host. The host step files
# that password only after VAULTED and its own proof, so this is what tells a
# finished hire from one stopped part way.
osk_sudo_filed() {
  local account="$1" target="$2" pass="" rc=0
  operator_credential_file_for "$account" "$target" || { echo no; return 0; }
  if [[ ! -f "$OPERATOR_CREDENTIAL_FILE" || ! "$OPERATOR_CREDENTIAL_FILE" -nt "${OSK_NAMED_KEY}.pub" ]]; then
    echo no
    return 0
  fi
  IFS= read -r pass < "$OPERATOR_CREDENTIAL_FILE" || true
  if [[ -z "$pass" ]]; then
    echo no
    return 0
  fi
  # The password is line one of the stream and sudo reads it from there; it
  # never reaches an argument list.
  printf '%s\n' "$pass" | "$OSK_SSH_BIN" -F /dev/null "${FOOTBAG_SSH_PIN_OPTS[@]}" \
    -o "User=${account}" -o "Port=${OSK_PORT}" -o "IdentityFile=${OSK_NAMED_KEY}" \
    -o "IdentitiesOnly=yes" -o "BatchMode=yes" -o "ControlPath=none" \
    -o "ConnectTimeout=10" "$OSK_HOST" 'sudo -k -S -p "" -v' >/dev/null 2>&1 || rc=$?
  pass=""
  if (( rc == 0 )); then
    echo yes
  elif (( rc == 255 )); then
    echo unproven
  else
    echo no
  fi
}
