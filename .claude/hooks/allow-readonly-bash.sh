#!/usr/bin/env bash
# Auto-approve Bash commands that are provably read-only, including compound
# pipelines and loops that static allow-rules cannot express. Conservative:
# any segment whose command head is not on the read-only list, or any command
# that can hide work in substitution or file redirection, falls through to the
# normal permission flow. Mutating variants of listed commands (sed -i, find
# -delete, git reset) are caught by sibling guards and settings ask/deny rules,
# whose decisions always override this allow.
#
# Command substitution `$(...)` is handled fail-closed: it is accepted only when its
# whole content is one simple read-only command (a read-only head, no unquoted subshell
# parens, no separators, no write redirect, no nesting, no backtick); quoted parens (a
# sqlite3 `count(*)`) are inert and allowed. Anything more complex there (nested
# substitution, an unquoted subshell, a pipeline) is not proven safe, so the command
# falls through to a prompt rather than being auto-approved -- an extra prompt, never an
# unsafe allow. Input process substitution `<(...)` is accepted as a read-only PIPELINE:
# its inner is split on unquoted separators and every piece must be a simple read-only
# command. Output `>(...)` writes and is never accepted here.
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# ANSI-C `$'...'` quoting follows different escape rules than ordinary quotes: a
# backslash-escaped quote (`\'`) does NOT close the string. The quote walks below do
# not model that, so a `$'...'` region can desync quote state and make a live
# separator or command substitution look quoted (and be wrongly neutralized). Never
# reasoned about; fall through. The only cost is an extra prompt on a rare read-only
# argument like `grep $'\t' f`.
case "$COMMAND" in *\$\'*) exit 0 ;; esac

# Command heads that never write. Dangerous flags on these (sed -i, find
# -delete) are handled by sibling ask/deny hooks, which win over allow.
# `env`/`command` are command-runners (`env rm`, `command rm` execute their
# argument), and `xxd`/`uniq`/`tree`/`sort`/`sed` can write a file operand or flag;
# those write/exec forms are handled below (dropped from this list, guarded, or
# bailed on a mid-arg flag) so only their genuinely read-only uses reach `allow`.
readonly_heads='ls cat head tail wc grep egrep fgrep rg find tree stat file echo printf pwd which type dirname basename realpath readlink sort uniq cut comm tr nl tac fold column jq date id whoami hostname uname sed true false : diff cmp strings od hexdump base64 base32 cksum md5sum sha1sum sha224sum sha256sum sha384sum sha512sum shasum b2sum sum rev fmt expand unexpand paste join pr look seq numfmt tsort ps pgrep pidof df du free uptime groups users who w tty nproc arch getconf locale lscpu lsblk lsmem getent lsof cd pushd popd dirs test'

# Git subcommands that only read. Anything else under git falls through. Every entry must be
# read-only in ALL its subverbs; `reflog` is the one exception (its `expire`/`delete` mutate) and
# is gated in head_arg_unsafe below, so it can stay here for its read-only `show`/`list` forms.
readonly_git='status log diff show blame rev-parse describe shortlog ls-files ls-tree cat-file for-each-ref reflog rev-list merge-base show-ref name-rev ls-remote remote var count-objects cherry whatchanged verify-commit verify-tag grep annotate range-diff show-branch check-ignore check-attr check-mailmap'

contains() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }

# Does a write/exec-capable flag or operand ride mid-arguments on an otherwise
# read-only head? A prefix allow-rule cannot see it. Shared by the top-level segment
# loop and the substitution-inner vetting so the two cannot drift: the class of bug
# where `$(sed -i ...)`, `$(find . -delete)`, `$(sort -o f)`, or
# `$(git ls-remote --upload-pack=cmd)` slip through because the inner was head-vetted
# only. Args: head, the command text to scan for sed's w/e script commands, then the
# args AFTER the head. Returns 0 (true) if a write/exec form is present.
head_arg_unsafe() {
  local head="$1" cmdtext="$2"; shift 2
  local a b ops=0
  case "$head" in
    sed)
      # In-place edit (-i, -i.bak, -ni, --in-place[=x]) writes; -f/--file runs an external
      # script whose contents are opaque to this checker. Both are unsafe.
      for a in "$@"; do case "$a" in -i*|-[!-]*i*|--in-place|--in-place=*|-f*|-[!-]*f*|--file|--file=*) return 0 ;; esac; done
      # The w/W write-command and the s///w write-flag are always followed by a filename, so
      # a boundary/address-prefixed w/W before whitespace flags them in every address form
      # (1w, $w, /re/w, 1,5w) and either quote style, while a `w` inside an s/// pattern
      # (s/w/x/) is followed by a delimiter, not whitespace, and a word ending in w before a
      # space (a replacement like `new file`) is preceded by a letter, not a boundary. The e
      # exec-command is a boundary/address-prefixed e before whitespace, a quote, or end of
      # script (covering `1e cmd`, bare `e`, and the s///e flag).
      if printf '%s' "$cmdtext" | grep -Eq "(^|[;&|[:space:]])sed([[:space:]]|\$).*([[:space:]'\";}/][0-9\$,~+]*([wW][[:space:]]|e([[:space:]]|['\"]|\$))|s[^[:alnum:][:space:]].*[^[:alnum:][:space:]][gpimIM0-9]*[weWE])"; then return 0; fi ;;
    find)
      # Action predicates run a command or write/delete a file; they ride anywhere and can
      # be quote/backslash-obfuscated (find . '-exec' rm ...), so strip quotes and
      # backslashes per arg before matching.
      for a in "$@"; do
        b="$a"; b="${b//\'/}"; b="${b//\"/}"; b="${b//\\/}"
        case "$b" in -exec|-execdir|-ok|-okdir|-delete|-fprint|-fprintf|-fls) return 0 ;; esac
      done ;;
    sort)
      # -o/--output writes the sorted result to a file; --compress-program runs an
      # external program to (de)compress sort's temporary spill files, which is an exec
      # vector whenever the input spills (a tiny -S buffer forces it). Both are unsafe.
      for a in "$@"; do case "$a" in -o|-o*|--output|--output=*|--compress-program|--compress-program=*) return 0 ;; esac; done ;;
    date) for a in "$@"; do case "$a" in -s|-s*|--set|--set=*) return 0 ;; esac; done ;;
    hostname) for a in "$@"; do case "$a" in -*) : ;; *) return 0 ;; esac; done ;;   # hostname NAME sets it
    rg) for a in "$@"; do case "$a" in --pre|--pre=*|--pre-glob|--pre-glob=*) return 0 ;; esac; done ;;
    tree) for a in "$@"; do case "$a" in -o|-o*|--output|--output=*) return 0 ;; esac; done ;;
    uniq)
      # A 2nd non-option operand is an output file uniq truncates. Over-count only over-prompts.
      for a in "$@"; do case "$a" in -*) : ;; *) ops=$((ops + 1)) ;; esac; done
      [ "$ops" -ge 2 ] && return 0 ;;
    git)
      # `git reflog` reads in its show/list forms but MUTATES via `expire` (prune) and `delete`
      # (drop entries); the subverb is the first arg after `reflog`. Refuse those here so the
      # entry can stay on the read-only git list for its read-only forms.
      case "${1:-}" in reflog) case "${2:-}" in expire|delete) return 0 ;; esac ;; esac
      # `git remote` reads in its bare / `-v` / `show` / `get-url` forms but MUTATES via add,
      # rename, remove, set-url, set-head, set-branches, prune, and update; the subverb is the
      # first arg after `remote`. Refuse those so `remote` can stay on the read-only git list
      # for its read forms.
      case "${1:-}" in remote) case "${2:-}" in add|rename|remove|rm|set-head|set-branches|set-url|prune|update) return 0 ;; esac ;; esac
      # An exec/write flag on a read-only git subcommand (`git log --output=f`,
      # `git ls-remote --upload-pack=cmd`).
      for a in "$@"; do
        case "$a" in --output|--output=*|--upload-pack|--upload-pack=*|--receive-pack|--receive-pack=*|--open-files-in-pager|--open-files-in-pager=*|--exec-path|--exec-path=*|-O*) return 0 ;; esac
      done ;;
  esac
  return 1
}

# Is the given string a single, simple read-only command? Used to vet the
# content of a command substitution. Rejects anything that is not one plain
# read-only-headed command with only argument text after it.
simple_readonly_command() {
  local content="$1"
  # No backtick, no separators (an unquoted newline separates commands like `;`), no
  # write redirect inside the substitution.
  case "$content" in
    *'`'*|*';'*|*'|'*|*'&'*|*'>'*|*'<('*|*'>('*|*$'\n'*) return 1 ;;
  esac
  # Word-split (no globbing) and drop leading env-assignment prefixes.
  set -f; set -- $content; set +f
  while [ $# -gt 0 ]; do case "$1" in *=*) shift ;; *) break ;; esac; done
  [ $# -gt 0 ] || return 1
  local head="$1"; shift
  if [ "$head" = git ]; then
    contains "$readonly_git" "${1:-}" || return 1
    head_arg_unsafe git "$content" "$@" && return 1
    return 0
  fi
  contains "$readonly_heads" "$head" || return 1
  head_arg_unsafe "$head" "$content" "$@" && return 1
  return 0
}

# Vet a sqlite3 invocation as a provably read-only inline query. Shared by the
# top-level segment loop and the command-substitution vetting so the two cannot
# drift. Args: $1 = the full command text to scan for dangerous SQL / dot-commands;
# $@ (after the shift) = the argv AFTER `sqlite3`. Returns 0 iff read-only.
#
# sqlite3 escapes the database even opened read-only: dot-commands can run a shell
# (.shell/.system/.!) or write a file (.output/.once/.backup/...), an ATTACH opens a
# second database that -readonly does not cover, and a value-setting PRAGMA mutates.
# The read-only open is required via the -readonly flag or the file:...?mode=ro URI;
# the URI is rejected if it also carries a writable/alternate mode (mode=rw / rwc /
# memory) or a vfs= parameter, so a duplicate-mode spoof (file:db?mode=rwc&mode=ro)
# does not read as read-only. A query read from stdin/pipe/redirect is invisible here
# and is refused. This function refuses every write/exec form itself rather than
# leaning on a sibling guard.
readonly_sqlite3_ok() {
  local cmdtext="$1"; shift
  local a b ro=0 operands=0
  for a in "$@"; do
    case "$a" in
      -readonly|--readonly) ro=1 ;;
      *) b="$a"; b="${b//\"/}"; b="${b//\'/}"
         case "$b" in
           file:*)
             case "$b" in
               *vfs=*|*mode=rw*|*mode=memory*) : ;;   # writable / alt vfs -> not read-only
               *mode=ro*) ro=1 ;;
             esac ;;
         esac ;;
    esac
  done
  [ "$ro" = 1 ] || return 1
  case "$cmdtext" in
    *.shell*|*.system*|*'.!'*|*.output*|*.once*|*.excel*|*.import*|*.backup*|\
    *.save*|*.clone*|*.log*|*.read*|*.recover*|*.expert*|*.archive*) return 1 ;;
  esac
  # ATTACH (opens another db that -readonly does not cover), a write DML/DDL verb, and
  # a value-setting PRAGMA (`PRAGMA name = ...`) are refused directly rather than left
  # to the engine's read-only enforcement or a sibling guard. A read-only PRAGMA query
  # carries no `=`. Word-boundary anchored, so an identifier or string that merely
  # contains a verb (a `delete_log` column) does not trip it; the cost of a false
  # match is only an extra prompt.
  if printf '%s' "$cmdtext" \
    | grep -Eqi '(^|[^[:alpha:]])(attach|insert|update|delete|drop|create|alter|replace|truncate|reindex|vacuum)[[:space:]]|(^|[^[:alpha:]])pragma[[:space:]]+[[:alpha:]_]+[[:space:]]*='; then
    return 1
  fi
  while [ $# -gt 0 ]; do
    case "$1" in
      '<'|'<<'|'>'|'>>'|'0<') return 1 ;;
      -init|-cmd|-separator|-nullvalue|-newline) shift; [ $# -gt 0 ] && shift ;;
      -lookaside|-pagecache) shift; [ $# -gt 0 ] && shift; [ $# -gt 0 ] && shift ;;
      -*) shift ;;
      *) operands=$((operands + 1)); shift ;;
    esac
  done
  # Fewer than two operands means no inline query (a db alone reads stdin).
  [ "$operands" -ge 2 ] || return 1
  return 0
}

# Does the string carry a shell-significant character OUTSIDE quotes -- a separator
# (; | &), a redirect (< >), a subshell/grouping paren, a command substitution `$(`,
# or a backtick? Quote-aware: inside single quotes nothing is significant; inside
# double quotes `$(` and a backtick are still active (command substitution runs in
# double quotes) but a bare paren/separator is literal. Used to reject a substitution
# inner that hides a second command around a read-only sqlite3 (e.g. `sqlite3 ... ; rm x`).
inner_has_unquoted_sep() {
  local s="$1"
  local n=${#s} i=0 c q="" esc=0
  while [ "$i" -lt "$n" ]; do
    c="${s:i:1}"
    if [ "$esc" = 1 ]; then esc=0; i=$((i+1)); continue; fi
    if [ "$q" = "'" ]; then [ "$c" = "'" ] && q=""; i=$((i+1)); continue; fi
    if [ "$q" = '"' ]; then
      if [ "$c" = '\' ]; then esc=1; i=$((i+1)); continue; fi
      if [ "$c" = '"' ]; then q=""; i=$((i+1)); continue; fi
      if [ "$c" = '`' ]; then return 0; fi
      if [ "$c" = '$' ] && [ "${s:i+1:1}" = "(" ]; then return 0; fi
      i=$((i+1)); continue
    fi
    # An unquoted newline is a command separator exactly like `;`.
    if [ "$c" = $'\n' ]; then return 0; fi
    case "$c" in
      '\') esc=1 ;;
      "'") q="'" ;;
      '"') q='"' ;;
      ';'|'|'|'&'|'<'|'>'|'('|')'|'`') return 0 ;;
      '$') [ "${s:i+1:1}" = "(" ] && return 0 ;;
    esac
    i=$((i+1))
  done
  return 1
}

# Vet the inner content of a command substitution. A read-only head / read-only git
# goes through simple_readonly_command (its raw separator reject is fine: a genuine
# read-only pipeline is never wrapped in one substitution). A sqlite3 head goes
# through the shared read-only-sqlite3 vetting, but first the inner must carry no
# UNQUOTED separator, so `$(sqlite3 -readonly db "SELECT 1"; rm x)` is refused while
# `$(sqlite3 -readonly db "SELECT count(*) FROM t")` (parens/`;` only inside quotes)
# is allowed.
vet_readonly_sub_inner() {
  local inner="$1"
  set -f; set -- $inner; set +f
  while [ $# -gt 0 ]; do case "$1" in *=*) shift ;; *) break ;; esac; done
  [ $# -gt 0 ] || return 1
  if [ "$1" = sqlite3 ]; then
    inner_has_unquoted_sep "$inner" && return 1
    shift
    readonly_sqlite3_ok "$inner" "$@"
    return $?
  fi
  simple_readonly_command "$inner"
}

# Vet the inner of a `<(...)` process substitution as a read-only PIPELINE. Unlike a
# $(...) command substitution (one command), a process substitution routinely feeds a
# pipeline into a diff/comm, so the inner is split on its UNQUOTED separators and pipes
# and every piece must be one simple read-only command. A quoted separator stays inside
# its piece, where simple_readonly_command's own raw reject still refuses it -- an extra
# prompt, never an unsafe allow. A write redirect, a backtick, or an unresolved nested
# substitution left in any piece is refused the same way. Only `<(` reaches here; `>(`
# is a write form and is never peeled.
vet_procsub_inner() {
  local inner="$1"
  local n=${#inner} i=0 c q="" esc=0 buf=""
  local -a pieces=()
  while [ "$i" -lt "$n" ]; do
    c="${inner:i:1}"
    if [ "$esc" = 1 ]; then esc=0; buf+="$c"; i=$((i+1)); continue; fi
    if [ "$q" = "'" ]; then [ "$c" = "'" ] && q=""; buf+="$c"; i=$((i+1)); continue; fi
    if [ "$q" = '"' ]; then
      if [ "$c" = '\' ]; then esc=1; buf+="$c"; i=$((i+1)); continue; fi
      [ "$c" = '"' ] && q=""
      buf+="$c"; i=$((i+1)); continue
    fi
    case "$c" in
      '\') esc=1; buf+="$c" ;;
      "'") q="'"; buf+="$c" ;;
      '"') q='"'; buf+="$c" ;;
      ';'|'|'|'&'|$'\n') pieces+=("$buf"); buf="" ;;
      *) buf+="$c" ;;
    esac
    i=$((i+1))
  done
  pieces+=("$buf")
  local p
  for p in "${pieces[@]}"; do
    p="${p#"${p%%[![:space:]]*}"}"          # trim leading whitespace
    [ -n "$p" ] || continue                 # empty piece (&& / || / trailing &) is inert
    simple_readonly_command "$p" || return 1
  done
  return 0
}

# Resolve ONE substitution in the global SCAN, innermost first, quote-aware: a command
# substitution `$(` (in an unquoted or double-quoted context) or an input process
# substitution `<(` (unquoted only, and not the second `<` of a `<<` heredoc), never
# single-quoted, never `$((` arithmetic. The rightmost active open is always innermost,
# so nested read-only substitutions resolve one per call over successive loop iterations.
# Its inner is read fresh (unquoted) from just after the `$(` or `<(` to the first
# unquoted `)`; a bare unquoted `(` inside is a subshell and is not proven safe. A vetted inner is
# replaced with the inert placeholder. Returns 0 on a replacement, 1 otherwise
# (caller then falls through to a prompt). Quoted parens (a sqlite3 `count(*)`, a
# grep `"(a|b)"`) never move the boundary, because the scan skips quoted regions.
resolve_one_sub() {
  local s="$SCAN"
  local n=${#s} i=0 c q="" esc=0 open=-1
  while [ "$i" -lt "$n" ]; do
    c="${s:i:1}"
    if [ "$esc" = 1 ]; then esc=0; i=$((i+1)); continue; fi
    if [ "$q" = "'" ]; then [ "$c" = "'" ] && q=""; i=$((i+1)); continue; fi
    if [ "$q" = '"' ]; then
      if [ "$c" = '\' ]; then esc=1; i=$((i+1)); continue; fi
      if [ "$c" = '"' ]; then q=""; i=$((i+1)); continue; fi
      if [ "$c" = '$' ] && [ "${s:i+1:1}" = "(" ] && [ "${s:i+2:1}" != "(" ]; then open="$i"; fi
      i=$((i+1)); continue
    fi
    case "$c" in
      '\') esc=1 ;;
      "'") q="'" ;;
      '"') q='"' ;;
      '$') if [ "${s:i+1:1}" = "(" ] && [ "${s:i+2:1}" != "(" ]; then open="$i"; fi ;;
      # `<(` opens a process substitution, but only unquoted and only when the `<` is not
      # the second `<` of a `<<` heredoc operator. `${s:i-1:1}` at i=0 wraps to the last
      # char, so a leading `<(` is handled explicitly.
      '<') if [ "${s:i+1:1}" = "(" ] && { [ "$i" = 0 ] || [ "${s:i-1:1}" != "<" ]; }; then open="$i"; fi ;;
    esac
    i=$((i+1))
  done
  [ "$open" -ge 0 ] || return 1
  local j=$((open+2)) close=-1
  q=""; esc=0
  while [ "$j" -lt "$n" ]; do
    c="${s:j:1}"
    if [ "$esc" = 1 ]; then esc=0; j=$((j+1)); continue; fi
    if [ "$q" = "'" ]; then [ "$c" = "'" ] && q=""; j=$((j+1)); continue; fi
    if [ "$q" = '"' ]; then
      if [ "$c" = '\' ]; then esc=1; j=$((j+1)); continue; fi
      if [ "$c" = '"' ]; then q=""; fi
      j=$((j+1)); continue
    fi
    case "$c" in
      '\') esc=1 ;;
      "'") q="'" ;;
      '"') q='"' ;;
      '(') return 1 ;;
      ')') close="$j"; break ;;
    esac
    j=$((j+1))
  done
  [ "$close" -ge 0 ] || return 1
  local mlen=$((close-open+1)) istart=$((open+2)) ilen=$((close-open-2))
  local matched="${s:open:mlen}" inner="${s:istart:ilen}"
  # A `$(...)` inner is one command (vet_readonly_sub_inner keeps the sqlite path); a
  # `<(...)` inner is a read-only pipeline. `$((` never reaches here and `>(` is never
  # opened, so it survives to the write-form reject below.
  if [ "${s:open:1}" = '<' ]; then
    vet_procsub_inner "$inner" || return 1
  else
    vet_readonly_sub_inner "$inner" || return 1
  fi
  SCAN="${SCAN/"$matched"/__ROSUB__}"
  return 0
}

# Strip harmless redirections (fd dups like 2>&1 / >&2, and writes to
# /dev/null) so common read-only idioms survive the write check and the
# separator split below. Redirections to real files are left in place.
SCAN="$(printf '%s' "$COMMAND" | sed -E 's/&>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>&[0-9-]+//g')"

# The AI's own session scratchpad (/tmp/claude-*/.../scratchpad/) is a sanctioned write target,
# so strip a redirect that lands there too, exactly like /dev/null, so a read-only command
# parking output in the scratchpad survives the write check below. The `/scratchpad/` segment is
# required, so a bare /tmp/claude-* path (not the scratchpad) is not exempt and keeps prompting;
# this matches the delete exemption in guard-rm.sh. Fail closed if the command contains `..`: a
# path-escape attempt stays unexempted and keeps prompting.
case "$COMMAND" in
  *..*) : ;;
  *) SCAN="$(printf '%s' "$SCAN" | sed -E 's#[0-9]*>>?[[:space:]]*/tmp/claude-[A-Za-z0-9._/-]*/scratchpad/[A-Za-z0-9._/-]*##g')" ;;
esac

# Neutralize LITERAL backticks first: inside single quotes, or backslash-escaped
# outside them, a backtick is plain text to bash (a grep pattern quoting a SQL
# identifier, for example). The walk tracks quote state like the neutralization
# pass below; a mis-track can only leave a literal backtick un-neutralized (an
# extra prompt), never mark an active one literal.
SCAN="$(printf '%s' "$SCAN" | awk 'BEGIN{dq=sprintf("%c",34); sq=sprintf("%c",39); bs=sprintf("%c",92); bt=sprintf("%c",96); q=""} {out=""; n=length($0); for(i=1;i<=n;i++){c=substr($0,i,1); if(q==sq){ if(c==sq){q=""} else if(c==bt){c="_"}; out=out c; continue } if(c==bs){ out=out c; i++; if(i<=n){ nc=substr($0,i,1); if(nc==bt){out=out "_"} else {out=out nc} }; continue } if(q==""){ if(c==dq||c==sq){q=c}; out=out c } else { if(c==q){q=""}; out=out c } } print out}')"

# A backtick still present is substitution-active and never reasoned about; fall through.
case "$SCAN" in *'`'*) exit 0 ;; esac

# Bash 5.2+ function substitution -- ${ cmd;} and ${| cmd;} -- runs a command inside a
# ${...} that ordinary parameter expansion never would. Never reasoned about; fall through.
case "$SCAN" in *'${ '*|*'${|'*|*"\${"$'\t'*) exit 0 ;; esac

# Resolve `$( ... )` command substitutions and `<( ... )` input process substitutions
# fail-closed, innermost first. Each accepted one is replaced with an inert placeholder
# so the remaining write-redirect check and segment vetting run on substitution-free
# text. resolve_one_sub is quote-and-paren aware, so a quoted `count(*)` in a read-only
# sqlite3 query does not defeat boundary finding; a substitution it cannot prove
# read-only, an arithmetic `$((`, a subshell `$( ( ) )`, or an unbalanced `$(` all
# cause a fall-through to the normal permission flow.
while [[ "$SCAN" == *'$('* || "$SCAN" == *'<('* ]]; do
  resolve_one_sub || exit 0
done

# Quote-aware neutralization: walk the (substitution-resolved) command character by
# character, tracking single/double-quote state and backslash escapes, and replace
# the shell-significant characters (; | & < >) that fall INSIDE quotes with an inert
# placeholder. A single character walk pairs quotes correctly even when a $-bearing
# quoted region (like "$DB") is preserved next to a plain one, which a regex strip
# cannot do: it would mis-pair the kept region's quote with the next region's quote
# and expose that region's contents. This lets a literal > in quoted argument text
# (an inline SQL <> comparison, a node -e arrow function) survive the redirect check
# below, and a quoted separator survive the segment split. A > inside quotes is never
# a shell redirect regardless of any $ in the same region, because command
# substitution was already resolved/rejected above and bash does not re-parse a plain
# expansion for redirection. A newline inside quotes is content (joined with a space);
# outside quotes it stays a separator. A backslash-escaped separator is neutralized
# like a quoted one.
NEUTRAL="$(printf '%s' "$SCAN" | awk 'BEGIN{dq=sprintf("%c",34); sq=sprintf("%c",39); bs=sprintf("%c",92); q=""} {out=""; n=length($0); for(i=1;i<=n;i++){c=substr($0,i,1); if(q==sq){ if(c==sq){q="";out=out c} else if(c==";"||c=="|"||c=="&"||c=="<"||c==">"){out=out "_"} else {out=out c}; continue } if(c==bs){ out=out c; i++; if(i<=n){ nc=substr($0,i,1); if(nc==";"||nc=="|"||nc=="&"||nc=="<"||nc==">"){out=out "_"} else {out=out nc} }; continue } if(q==""){ if(c==dq||c==sq){q=c} out=out c } else { if(c==q){q="";out=out c} else if(c==";"||c=="|"||c=="&"||c=="<"||c==">"){out=out "_"} else {out=out c} } } if(q==""){print out} else {printf "%s ", out}}')"

# Refuse hidden-write forms on the quote-neutralized text: process substitution,
# append, or a file-writing redirect that sits OUTSIDE any quote (in-quote copies are
# now inert placeholders). Command substitution and any read-only input `<(...)` were
# already resolved to placeholders above, so a surviving `<(` is an unproven one and
# `>(` is a write form; both are refused here.
if printf '%s' "$NEUTRAL" | tr '\n' ' ' | grep -Eq '<\(|>\(|>>|>[[:space:]]*[^&]'; then
  exit 0
fi

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
    shift                                   # drop `git`
    # Skip read-only global options that can precede the subcommand, so a common form
    # like `git --no-pager diff` is vetted on `diff`. `-c` is deliberately NOT
    # skipped: it can change behavior, so it falls through.
    while [ $# -gt 0 ]; do
      case "$1" in
        --no-pager|-P|--paginate|--no-optional-locks|--literal-pathspecs) shift ;;
        -C)
          # A `-C` target points at another directory. Accept only an in-project one so
          # read-only research through a companion-checkout symlink auto-approves: a
          # relative path (the working directory is the repo root) or an absolute path at
          # or under the project directory. A parent traversal (`..`), a home-relative
          # `~`, an empty target, or an out-of-tree absolute path falls through to the
          # prompt.
          case "${2:-}" in
            *..*|'~'*|"") exit 0 ;;
            /*)
              [ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0
              case "${2}" in
                "$CLAUDE_PROJECT_DIR"|"$CLAUDE_PROJECT_DIR"/?*) ;;
                *) exit 0 ;;
              esac ;;
          esac
          shift; shift ;;
        *) break ;;
      esac
    done
    contains "$readonly_git" "${1:-}" || exit 0
    # An exec/write flag can ride mid-arguments on a read-only git subcommand
    # (`git log --output=f`, `git ls-remote --upload-pack=cmd`); a prefix rule
    # cannot see it, so bail here (shared with the substitution-inner vetting).
    head_arg_unsafe git "$COMMAND" "$@" && exit 0
    continue
  fi
  if [ "$head" = gh ]; then
    shift                                   # drop `gh`
    while [ $# -gt 0 ]; do
      case "$1" in --version|--help|-h) shift ;; *) break ;; esac
    done
    group="${1:-}"; sub="${2:-}"
    # `gh api` defaults to a GET and mutates only with an explicit method or a
    # request-body/field flag, so approve it only when none of those are present.
    if [ "$group" = api ]; then
      for a in "$@"; do
        case "$a" in
          -X|--method|--method=*|-f|-F|--field|--field=*|--raw-field|--raw-field=*|--input|--input=*) exit 0 ;;
        esac
      done
      continue
    fi
    # Fixed allow-list of read-only gh subcommand paths; every other subcommand
    # (create, edit, merge, close, delete, rerun, download, unlisted) falls through.
    case "$group $sub" in
      "run view"|"run list"|"run watch"|\
      "pr view"|"pr list"|"pr checks"|"pr diff"|"pr status"|\
      "issue view"|"issue list"|"issue status"|\
      "release view"|"release list"|"repo view"|"repo list"|\
      "project list"|"project view"|"project item-list"|"project field-list"|\
      "workflow view"|"workflow list"|"cache list"|"label list"|\
      "search prs"|"search issues"|"search repos"|"search code"|"search commits")
        continue ;;
      *) exit 0 ;;
    esac
  fi
  if [ "$head" = curl ]; then
    # A curl that DISCARDS its response body (-o /dev/null) against a loopback host is a
    # local health / liveness probe: it fetches no content into context and cannot reach
    # off-box, so auto-approve it. Require BOTH the discard and a loopback URL, and reject
    # any flag that could write a file, upload, mutate, or redirect the connection off
    # loopback (-o REALFILE, -O, -c, -D, --trace, --output-dir, -T/-F/-d/--json, -L,
    # -x/--proxy, --resolve, --connect-to, --url, -K). Everything else -- including a
    # content-returning curl -- falls through to the normal prompt; content is fetched
    # through domain-scoped WebFetch, never an auto-approved curl to an arbitrary host.
    shift                                       # drop `curl`
    discard=0 loopback=0
    # A step loop, not `for a in "$@"`, because a bare `-o`/`--output` names its target in
    # the NEXT token: curl writes one output file per URL, so a second `-o REALFILE` must not
    # hide behind an earlier `-o /dev/null`. Only /dev/null is a discard; any real file (or a
    # missing operand) writes and falls through.
    while [ $# -gt 0 ]; do
      case "$1" in
        -o|--output)
          shift
          case "${1:-}" in /dev/null) discard=1 ;; *) exit 0 ;; esac ;;
        -o/dev/null|--output=/dev/null) discard=1 ;;
        -o*|--output=*) exit 0 ;;               # -o to a real file (attached form)
        -O|--remote-name|--remote-name-all|-J|--remote-header-name|\
        -c|--cookie-jar|-D|--dump-header|--trace|--trace-ascii|--trace-time|\
        --output-dir|--create-dirs|\
        -L|--location|-x|--proxy*|--preproxy|--socks4|--socks4a|--socks5|--socks5-hostname|\
        --resolve|--connect-to|--url|--url=*|-K|--config|\
        -T|--upload-file|-F|--form*|-d|--data*|--json|\
        -X|--request|-X*|--request=*) exit 0 ;;
        http://localhost|http://localhost/*|http://localhost:*|\
        https://localhost|https://localhost/*|https://localhost:*|\
        http://127.0.0.1|http://127.0.0.1/*|http://127.0.0.1:*|\
        https://127.0.0.1|https://127.0.0.1/*|https://127.0.0.1:*|\
        'http://[::1]'|'http://[::1]/'*|'http://[::1]:'*|\
        'https://[::1]'|'https://[::1]/'*|'https://[::1]:'*) loopback=1 ;;
        *://*) exit 0 ;;                        # any non-loopback URL scheme
      esac
      shift
    done
    { [ "$discard" = 1 ] && [ "$loopback" = 1 ]; } || exit 0
    continue
  fi
  if [ "$head" = sqlite3 ]; then
    shift                                       # drop `sqlite3`
    readonly_sqlite3_ok "$COMMAND" "$@" || exit 0
    continue
  fi
  if [ "$head" = unzip ]; then
    # unzip writes (extracts to disk) in its default and -d/-o forms, so it is not on
    # the read-only head list. Its read-only modes never write: -p streams a member to
    # stdout, -l/-v list the archive, -t tests it, -Z is zipinfo. Approve only when one
    # of those mode flags is present AND no -d extract-target is given; every extracting
    # form falls through to the normal prompt. Mirrors the flag-gated sqlite3 handling:
    # the approver alone must never approve a disk write. Failing to match a rarer
    # read-only spelling only over-prompts, never over-allows.
    ro=0 extract_dir=0
    for a in "$@"; do
      case "$a" in
        -p|-l|-v|-t|-z|-Z) ro=1 ;;
        -d|-d*) extract_dir=1 ;;
      esac
    done
    { [ "$ro" = 1 ] && [ "$extract_dir" = 0 ]; } || exit 0
    continue
  fi
  contains "$readonly_heads" "$head" || exit 0

  # Exec/write flags that ride mid-arguments on an otherwise read-only head, via the
  # shared check so a substitution inner is vetted identically (no drift).
  head_arg_unsafe "$head" "$COMMAND" "${@:2}" && exit 0
done <<<"$segments"

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "All command segments are read-only."
  }
}'
