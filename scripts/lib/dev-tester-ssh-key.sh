# shellcheck shell=bash
# dev-tester-ssh-key.sh — the Match block that lets one command reach the host as
# a named account, on the workstation that accepted that account's onboarding.
#
# The alias itself is the default and is never edited here: it connects as the
# shared account, always. The named account is reached through a Match block
# that applies only under the job role's profile (see ssh-alias.sh), so a
# command acts as the named person only when run through
# scripts/as-dev-tester.sh --account <name>.
#
# Callers set DTSK_SSH_BIN to replace the client in tests, and must have sourced
# host-env-remote.sh (for the typed confirmation) and ssh-alias.sh.

DTSK_SSH_BIN="${DTSK_SSH_BIN:-ssh}"
DTSK_SHARED_ACCOUNT="footbag"

# dtsk_resolved_user <alias> [<aws-profile>]
# The account ssh resolves the alias as, with AWS_PROFILE set to the given
# profile or, with none given, cleared.
dtsk_resolved_user() {
  local alias_name="$1" profile="${2:-}"
  if [[ -n "$profile" ]]; then
    AWS_PROFILE="$profile" "$DTSK_SSH_BIN" -G "$alias_name" </dev/null 2>/dev/null | awk '/^user /{print $2}' | tail -1
  else
    env -u AWS_PROFILE "$DTSK_SSH_BIN" -G "$alias_name" </dev/null 2>/dev/null | awk '/^user /{print $2}' | tail -1
  fi
}

# dtsk_ensure_match_block <config-file> <alias> <account> <profile>
# Adds the named account's Match block above the alias, after a diff and a
# typed APPLY, and proves both outcomes the way every run resolves the alias:
# the shared account by default, the named account under the job role's profile.
dtsk_ensure_match_block() {
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

  got="$(dtsk_resolved_user "$alias_name")"
  if [[ "$got" != "$DTSK_SHARED_ACCOUNT" ]]; then
    echo "ERROR: by default ${alias_name} now resolves as '${got:-nothing}', not ${DTSK_SHARED_ACCOUNT}." >&2
    return 1
  fi
  got="$(dtsk_resolved_user "$alias_name" "$profile")"
  if [[ "$got" != "$account" ]]; then
    echo "ERROR: under AWS_PROFILE=${profile}, ${alias_name} resolves as '${got:-nothing}'," >&2
    echo "       not ${account}. An earlier Host pattern or an included file sets User" >&2
    echo "       first and wins. Fix that and re-run." >&2
    return 1
  fi
  echo "  ${alias_name} connects as ${DTSK_SHARED_ACCOUNT} by default, and as ${account} only"
  echo "  for a command run through scripts/as-dev-tester.sh --account ${account}"
}
