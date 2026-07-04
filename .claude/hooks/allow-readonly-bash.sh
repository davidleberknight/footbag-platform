#!/usr/bin/env bash
# Auto-approve Bash commands that are provably read-only, including compound
# pipelines and loops that static allow-rules cannot express. Conservative:
# any segment whose command head is not on the read-only list, or any command
# that can hide work in substitution or file redirection, falls through to the
# normal permission flow. Mutating variants of listed commands (sed -i, find
# -delete, git reset) are caught by sibling guards and settings ask/deny rules,
# whose decisions always override this allow.
#
# Command substitution is handled fail-closed: a substitution is accepted only
# when its whole content is one simple read-only command (a read-only head, no
# inner parens, no separators, no write redirect, no nesting, no backtick).
# Anything more complex (nested substitution, quoted parens, a pipeline inside
# the substitution) is not proven safe, so the command falls through to a prompt
# rather than being auto-approved -- an extra prompt, never an unsafe allow.
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Command heads that never write. Dangerous flags on these (sed -i, find
# -delete) are handled by sibling ask/deny hooks, which win over allow.
# `env`/`command` are command-runners (`env rm`, `command rm` execute their
# argument), and `xxd`/`uniq`/`tree`/`sort`/`sed` can write a file operand or flag;
# those write/exec forms are handled below (dropped from this list, guarded, or
# bailed on a mid-arg flag) so only their genuinely read-only uses reach `allow`.
readonly_heads='ls cat head tail wc grep egrep fgrep rg find tree stat file echo printf pwd which type dirname basename realpath readlink sort uniq cut comm tr nl tac fold column jq date printenv id whoami hostname uname sed true false : diff cmp strings od hexdump base64 base32 cksum md5sum sha1sum sha224sum sha256sum sha384sum sha512sum shasum b2sum sum rev fmt expand unexpand paste join pr look seq numfmt tsort ps pgrep pidof df du free uptime groups users who w tty nproc arch getconf locale lscpu lsblk lsmem getent lsof cd pushd popd dirs test'

# Git subcommands that only read. Anything else under git falls through.
readonly_git='status log diff show blame rev-parse describe shortlog ls-files ls-tree cat-file for-each-ref reflog rev-list merge-base show-ref name-rev ls-remote var count-objects cherry whatchanged verify-commit verify-tag grep annotate range-diff show-branch'

contains() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }

# Is the given string a single, simple read-only command? Used to vet the
# content of a command substitution. Rejects anything that is not one plain
# read-only-headed command with only argument text after it.
simple_readonly_command() {
  local content="$1"
  # No backtick, no separators, no write redirect inside the substitution.
  case "$content" in
    *'`'*|*';'*|*'|'*|*'&'*|*'>'*|*'<('*|*'>('*) return 1 ;;
  esac
  # Word-split (no globbing) and drop leading env-assignment prefixes.
  set -f; set -- $content; set +f
  while [ $# -gt 0 ]; do case "$1" in *=*) shift ;; *) break ;; esac; done
  [ $# -gt 0 ] || return 1
  if [ "$1" = git ]; then
    contains "$readonly_git" "${2:-}" || return 1
    return 0
  fi
  contains "$readonly_heads" "$1" || return 1
  return 0
}

# Strip harmless redirections (fd dups like 2>&1 / >&2, and writes to
# /dev/null) so common read-only idioms survive the write check and the
# separator split below. Redirections to real files are left in place.
SCAN="$(printf '%s' "$COMMAND" | sed -E 's/&>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>&[0-9-]+//g')"

# Backtick command substitution is never reasoned about; fall through.
case "$SCAN" in *'`'*) exit 0 ;; esac

# Resolve `$( ... )` command substitutions fail-closed. Each accepted
# substitution is replaced with an inert placeholder so the remaining
# write-redirect check and segment vetting run on substitution-free text. A
# substitution that is not provably a single simple read-only command -- or any
# `$(` that does not form a paren-free `$( ... )` (nested, arithmetic `$((`,
# quoted parens) -- causes a fall-through to the normal permission flow.
sub_re='\$\(([^()]*)\)'
while [[ "$SCAN" == *'$('* ]]; do
  if [[ "$SCAN" =~ $sub_re ]]; then
    matched="${BASH_REMATCH[0]}"
    inner="${BASH_REMATCH[1]}"
    simple_readonly_command "$inner" || exit 0
    SCAN="${SCAN/"$matched"/__ROSUB__}"
  else
    # A `$(` remains but no simple `$( ... )` matched: nested, arithmetic, or
    # parens inside the substitution. Not proven safe.
    exit 0
  fi
done

# Refuse remaining hidden-write forms: process substitution, append, or a
# file-writing redirect. (Command substitution has already been resolved.)
if printf '%s' "$SCAN" | grep -Eq '<\(|>\(|>>|>[[:space:]]*[^&]'; then
  exit 0
fi

# Neutralize shell separators that appear INSIDE quotes (e.g. a quoted regex in
# grep -E "a|b|c"), so the split below does not manufacture phantom segments from
# argument text. Command/process substitution and real redirects were already
# rejected/resolved above, so quoted content remaining here is inert literal
# text, safe to rewrite for splitting purposes only.
#
# Backslash escaping is honored so a backslash-escaped quote does NOT open a quoted
# region: outside quotes and inside double quotes, `\<c>` is a literal pair the
# tracker skips, so `grep foo\" ; rm x` keeps its `;` a real separator (the `rm`
# segment is then vetted and the command falls through) instead of the `\"` opening
# a phantom quote that swallows `; rm x`. Inside single quotes bash does not process
# backslashes, so escaping is not applied there.
NEUTRAL="$(printf '%s' "$SCAN" | awk 'BEGIN{dq=sprintf("%c",34); sq=sprintf("%c",39); bs=sprintf("%c",92)} {out="";q=""; n=length($0); for(i=1;i<=n;i++){c=substr($0,i,1); if(q==sq){ if(c==sq){q="";out=out c} else if(c==";"||c=="|"||c=="&"){out=out "_"} else {out=out c}; continue } if(c==bs){ out=out c; i++; if(i<=n) out=out substr($0,i,1); continue } if(q==""){ if(c==dq||c==sq){q=c} out=out c } else { if(c==q){q="";out=out c} else if(c==";"||c=="|"||c=="&"){out=out "_"} else {out=out c} } } print out}')"

# Break into segments on shell separators, then vet the head word of each.
segments="$(printf '%s' "$NEUTRAL" | tr '\n' ';' | sed -E 's/\|\||&&|[;|&]/\n/g')"

while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # trim leading whitespace
  [ -n "$seg" ] || continue

  set -f; set -- $seg; set +f             # word-split without globbing

  # Drop leading env-assignment prefixes (VAR=value cmd ...).
  while [ $# -gt 0 ]; do case "$1" in *=*) shift ;; *) break ;; esac; done
  [ $# -gt 0 ] || continue

  # Strip leading env-assignments, control keywords, grouping, and negation until
  # the real command head is exposed, so a command hidden behind them is still
  # vetted (e.g. `( rm x )`, `{ rm x; }`, `! rm x` must NOT auto-approve). Skip the
  # segment only for a construct that carries no command in it (loop/select
  # header, block terminator, or a `[[`/`[` test conditional, which is read-only).
  # A `case` branch body lives in the same segment as its pattern and cannot be
  # vetted here, so fall through to the normal permission flow rather than risk
  # skipping a command.
  skip=0
  while [ $# -gt 0 ]; do
    case "$1" in
      *=*)                                                   shift ;;
      while|until|if|elif|then|else|do|'!'|'{'|'}'|'('|')')  shift ;;
      for|select|done|fi|esac)                               skip=1; break ;;
      '[['|'['|']]'|']')                                     skip=1; break ;;
      case)                                                  exit 0 ;;
      *)                                                     break ;;
    esac
  done
  [ "$skip" = 1 ] && continue
  [ $# -gt 0 ] || continue

  # Normalize leading read-only wrappers so the wrapped command is what gets vetted:
  #   timeout/nice/stdbuf/nohup/time -> strip the wrapper (and its own options) and
  #     vet the command it runs (`timeout 30 grep ...` is vetted on `grep`);
  #   command -v/-V/-p X             -> a read-only lookup, so the segment is accepted;
  #   command CMD ...                -> runs CMD, so strip `command` and vet CMD.
  # Any wrapper option shape not parsed here leaves a non-command head that simply
  # fails the read-only check below -> a prompt, never an unsafe allow.
  accept_segment=0
  while [ $# -gt 0 ]; do
    case "$1" in
      timeout)
        shift
        case "${1:-}" in -*) exit 0 ;; esac   # an option we do not parse -> fall through
        [ $# -gt 0 ] && shift ;;              # drop the DURATION operand
      nice)
        shift
        case "${1:-}" in
          -n) shift; [ $# -gt 0 ] && shift ;;
          --adjustment=*) shift ;;
          -*) exit 0 ;;
        esac ;;
      stdbuf)
        shift
        while [ $# -gt 0 ]; do case "$1" in -*) shift ;; *) break ;; esac; done ;;
      nohup|time) shift ;;
      command)
        case "${2:-}" in
          -v|-V|-p) accept_segment=1; break ;;
          *)        shift ;;
        esac ;;
      *) break ;;
    esac
  done
  [ "$accept_segment" = 1 ] && continue
  [ $# -gt 0 ] || continue

  head="$1"
  if [ "$head" = git ]; then
    contains "$readonly_git" "${2:-}" || exit 0
    # An exec/write flag can ride mid-arguments on a read-only git subcommand
    # (`git log --output=f`, `git ls-remote --upload-pack=cmd`); a prefix rule
    # cannot see it, so bail here.
    for a in "$@"; do
      case "$a" in
        --output|--output=*|--upload-pack|--upload-pack=*|--receive-pack|--receive-pack=*|--open-files-in-pager|--open-files-in-pager=*|--exec-path|--exec-path=*|-O*) exit 0 ;;
      esac
    done
    continue
  fi
  contains "$readonly_heads" "$head" || exit 0

  # Exec/write flags that ride mid-arguments on an otherwise read-only head.
  case "$head" in
    sed)
      # In-place edit in any spelling (-i, -i.bak, -i's/../', -ni, --in-place[=x]) is
      # a write; the w/W/e write/exec sed-commands live inside the script argument and
      # are caught by guard-readonly-bash (ask). Bail here so no in-place form allows.
      for a in "$@"; do case "$a" in -i*|-[!-]*i*|--in-place|--in-place=*) exit 0 ;; esac; done ;;
    rg)
      for a in "$@"; do case "$a" in --pre|--pre=*|--pre-glob|--pre-glob=*) exit 0 ;; esac; done ;;
    tree)
      for a in "$@"; do case "$a" in -o|-o*|--output|--output=*) exit 0 ;; esac; done ;;
    uniq)
      # uniq [opts] [INPUT [OUTPUT]]: a 2nd non-option operand is an output file it
      # truncates. Over-count (e.g. a separated option-argument) only over-prompts.
      shift; ops=0
      for a in "$@"; do case "$a" in -*) ;; *) ops=$((ops + 1)) ;; esac; done
      [ "$ops" -ge 2 ] && exit 0 ;;
  esac
done <<<"$segments"

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "All command segments are read-only."
  }
}'
