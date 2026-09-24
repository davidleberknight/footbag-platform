#!/usr/bin/env bash
# shellcheck shell=bash
# ssh-alias.sh — the one edit hiring and firing make to an operator's
# ~/.ssh/config: a named account's Match block beside the deploy alias.
#
# WHY THIS IS A LIBRARY.
#
# Hiring adds the block and firing removes it; the edit is kept apart from those
# commands so its rules about what the block is, and where it goes, live in one
# place.
#
# THE DEFAULT IS NEVER EDITED.
#
# The alias's own stanza is the default: every run connects as the account it
# names, the shared account, unless it is deliberately put elsewhere. A named
# account is reached through one Match block placed above that stanza, which
# applies only while AWS_PROFILE names the job role's profile.
# scripts/as-dev-tester.sh sets exactly that for the one command it wraps, so
# the host account follows the AWS identity for that run and for no other, and
# every script that reads the account through `ssh -G` follows it without
# knowing the block exists. ssh takes the first value it finds for each
# directive, so the block's User wins while it matches and is ignored otherwise.
#
# The test carries no inner quotes because OpenSSH 8.9 rejects them inside an
# exec string, and a rejected Match line stops ssh reading the file at all,
# which would take the default route down with it. Every edit is therefore
# checked with `ssh -G` against the result before it is handed back.
#
# WHAT IT WILL NOT DO.
#
# Invent a stanza. An alias this workstation does not carry is reported to the
# caller, never created: a Host block with a guessed host name and port resolves
# and then connects to nothing, which is worse than the absence it replaced.
#
# Nor does it resolve the way ssh does. It finds the alias as a literal token on
# a Host line in this one file, while `ssh -G` honours wildcard patterns and
# follows Include. So an alias reached through `Host footbag-*`, or through an
# included file, is reported as absent rather than edited. That fails safe: the
# alternative is editing a pattern that governs hosts nobody asked about, or a
# file the operator did not name.
#
# Nor does it write anything. It produces the changed file beside the original
# and hands both to the caller, because showing a diff of a file the operator
# owns and asking before replacing it belongs to the run, not to this.

# ssh_alias_match_block <alias> <account> <profile>
# The block, exactly. Writing, finding and removing all use this text, so they
# can never disagree about what the block is.
ssh_alias_match_block() {
  local alias_name="$1" account="$2" profile="$3"
  ssh_alias_match_line "$alias_name" "$profile"
  printf '  User %s\n' "$account"
  printf '  IdentityFile ~/.ssh/id_ed25519_%s\n' "$account"
}

# ssh_alias_match_line <alias> <profile>: the block's first line alone, which
# names the alias and the profile and so identifies the block for any account.
ssh_alias_match_line() {
  # shellcheck disable=SC2016 # $AWS_PROFILE is for ssh's shell, not this one
  printf 'Match host %s exec "test x$AWS_PROFILE = x%s"\n' "$1" "$2"
}

# ssh_alias_parses <config-file> <alias>: whether ssh reads the file cleanly.
ssh_alias_parses() {
  ssh -G -F "$1" "$2" </dev/null >/dev/null 2>&1
}

# ssh_alias_match_account <config-file> <alias> <profile>
# Prints the account the block for this alias and profile names, or nothing.
ssh_alias_match_account() {
  local config="$1" first
  first="$(ssh_alias_match_line "$2" "$3")"
  [[ -f "$config" ]] || return 0
  FIRST="$first" awk '
    $0 == ENVIRON["FIRST"] { on = 1; next }
    on && /^[ \t]*([Hh][Oo][Ss][Tt]|[Mm][Aa][Tt][Cc][Hh])([ \t]|$)/ { on = 0 }
    on && /^[ \t]*[Uu][Ss][Ee][Rr][ \t]/ { print $2; exit }
  ' "$config"
}

# ssh_alias_add_match_block <config-file> <alias> <account> <profile> <output-file>
#
# Writes the configuration with the block inserted directly above the first
# Host line naming the alias, and nothing else changed. Returns:
#   0  the file would change
#   2  the block is already there for this account, so there is nothing to do
#   3  no Host line naming that alias
#   4  a block for this alias and profile names another account; refused,
#      because one workstation acts as one named person
#   1  the configuration could not be read, or the result would not parse
ssh_alias_add_match_block() {
  local config="$1" alias_name="$2" account="$3" profile="$4" out="$5" rc=0 held

  [[ -f "$config" ]] || return 1
  held="$(ssh_alias_match_account "$config" "$alias_name" "$profile")"
  if [[ -n "$held" ]]; then
    [[ "$held" == "$account" ]] && return 2
    return 4
  fi

  # A Host line may name several aliases, and a carriage return would otherwise
  # ride along on the last of them in a file with Windows endings.
  BLOCK="$(ssh_alias_match_block "$alias_name" "$account" "$profile")" \
  ALIAS_NAME="$alias_name" awk '
    BEGIN { done = 0 }
    {
      stripped = $0
      sub(/\r$/, "", stripped)
      sub(/^[ \t]+/, "", stripped)
      if (!done && stripped ~ /^[Hh][Oo][Ss][Tt][ \t]/) {
        rest = stripped
        sub(/^[^ \t]+[ \t]+/, "", rest)
        n = split(rest, names, /[ \t]+/)
        for (i = 1; i <= n; i++) if (names[i] == ENVIRON["ALIAS_NAME"]) { print ENVIRON["BLOCK"]; done = 1; break }
      }
      print
    }
    END { if (!done) exit 3 }
  ' "$config" > "$out" && rc=0 || rc=$?

  (( rc == 3 )) && return 3
  (( rc != 0 )) && return 1
  ssh_alias_parses "$out" "$alias_name" || return 1
  return 0
}

# ssh_alias_remove_match_block <config-file> <alias> <account> <profile> <output-file>
#
# Writes the configuration without that account's block, matched line for line,
# and nothing else changed. Returns:
#   0  the file would change
#   2  no such block, so there is nothing to do
#   1  the configuration could not be read, or the result would not parse
ssh_alias_remove_match_block() {
  local config="$1" alias_name="$2" account="$3" profile="$4" out="$5" rc=0

  [[ -f "$config" ]] || return 1
  BLOCK="$(ssh_alias_match_block "$alias_name" "$account" "$profile")" awk '
    BEGIN { n = split(ENVIRON["BLOCK"], want, "\n") }
    { lines[NR] = $0 }
    END {
      removed = 0
      for (i = 1; i <= NR; i++) {
        whole = 1
        for (j = 1; j <= n; j++) if (lines[i + j - 1] != want[j]) { whole = 0; break }
        if (whole) { i += n - 1; removed = 1; continue }
        print lines[i]
      }
      if (!removed) exit 2
    }
  ' "$config" > "$out" && rc=0 || rc=$?

  (( rc == 2 )) && return 2
  (( rc != 0 )) && return 1
  ssh_alias_parses "$out" "$alias_name" || return 1
  return 0
}
