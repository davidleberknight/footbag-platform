#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
#
# Asks before anything that reaches AWS. Claude never touches AWS infrastructure
# on its own judgement, so this hook prompts for every invocation rather than
# classifying reads as safe: an approval is per-command and is never cached into
# an allow rule.
#
# The reason this exists as a hook rather than a permission rule: a permission
# rule matches the literal command prefix, and a wrapper script's name reveals
# nothing about the AWS calls inside it. Running a script whose text contained
# neither "aws" nor "terraform" reached SSM and Terraform state through the
# script body. This hook therefore reads the scripts a command names, and the
# npm scripts those resolve to, instead of matching on the command alone.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Every reason opens with what the human is approving and the command it is about, so the
# prompt stands on its own.
ask() {
  jq -n --arg reason "APPROVE AWS ACCESS: $COMMAND. $1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Terraform subcommands that reach the AWS account or the remote S3 backend.
# `fmt` and `validate` are purely local and stay out of it, so formatting and
# syntax checks never prompt.
TF_AWS_SUBCOMMANDS='init|plan|apply|destroy|output|refresh|import|taint|untaint|state|show|providers|force-unlock|login'

# Text signature of an AWS-reaching call, used both on the command itself and on
# the body of any script the command names.
#
# Anchored to command position (start of a line, or after a separator), with
# optional leading VAR=value assignments. `aws` as a bare argument is not a
# call: `grep -rn aws src/` and a comment mentioning the CLI must not prompt,
# or the guard becomes noise and gets clicked through.
CMD_START='(^|[;&|`({]|&&|\|\|)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
# Words that run the command after them rather than being the command: `env`
# with its options and assignments, `sudo`, `command`, `exec`, `nohup`, `time`
# and `xargs` with their flags. `env -i aws ...` is an aws call, and without
# these the guard read it as an argument and stayed silent.
WRAPPERS='((env([[:space:]]+(-[A-Za-z-]*([[:space:]]+[A-Za-z_][A-Za-z0-9_]*)?|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*))*|sudo([[:space:]]+-[A-Za-z]+)*|command|exec([[:space:]]+-[A-Za-z]+)*|nohup|time|xargs([[:space:]]+-[A-Za-z0-9]+)*)[[:space:]]+)*'

aws_reaching_text() {
  printf '%s' "$1" | grep -Eq "${CMD_START}${WRAPPERS}aws([[:space:]]|$)" && return 0
  printf '%s' "$1" | grep -Eq "${CMD_START}${WRAPPERS}terraform([[:space:]]+-[^[:space:]]+)*[[:space:]]+($TF_AWS_SUBCOMMANDS)([[:space:]]|$)" && return 0
  return 1
}

# ---- 1. The command itself names aws or an AWS-reaching terraform subcommand.
if aws_reaching_text "$COMMAND"; then
  ask "Command reaches AWS (aws CLI or a Terraform subcommand that contacts the account or remote state). Claude runs no AWS operation without explicit per-invocation approval; approve only if this is a read you want, and run mutations yourself."
fi

# ---- 2. The command names a repo script whose body reaches AWS.
# Collected candidates: literal .sh paths, plus the scripts an `npm run <name>`
# resolves to. Scanned one level deeper so a wrapper that shells out to an
# AWS-touching script is caught too.
collect_npm_script_bodies() {
  local text="$1" name body
  printf '%s' "$text" | grep -oE 'npm[[:space:]]+run[[:space:]]+[A-Za-z0-9:_.-]+' | while read -r match; do
    name="${match##*[[:space:]]}"
    [ -f package.json ] || continue
    body="$(jq -r --arg s "$name" '.scripts[$s] // empty' package.json 2>/dev/null || true)"
    [ -n "$body" ] && printf '%s\n' "$body"
  done
}

# What a script body says as code, as opposed to what it carries as data.
#
# Read as plain text, a body prompts on things that run nothing: a regex
# alternation such as 'a|aws s3 ls|b' reads as a pipe into aws, a test
# fixture string naming the CLI reads as a call, and a .sh path inside a printed
# message reads as a script being run. Each of those trained the operator to
# click through this guard. So the body is read the way the shell reads it:
# comments and the contents of quoted strings are blanked before matching.
#
# A quoted string is data only while nothing turns it back into code, so the
# raw text is kept wherever that can happen:
#   - a line carrying an evaluator outside quotes (eval, ssh, sudo, su, xargs,
#     runuser, flock, watch, tmux, parallel, an interpreter's -c, docker exec,
#     env -S, a pipe into a shell, a heredoc fed to a shell, sourcing stdin or a
#     process substitution), or an inline program (python -c, perl -e, node -e,
#     awk's system()), and the rest of any quote that line leaves open;
#   - a command substitution, whose text is code even inside quotes;
#   - every heredoc body, since what consumes it is not tracked;
#   - the whole file, when a command is run from a variable or an evaluator is
#     handed a variable (a function forwarding its arguments to ssh or eval),
#     or a quote or substitution is never closed, because the data can then
#     reach code on a line this reading cannot connect it to.
# The plain-text reading only ever matched quoted text with a separator before
# aws, so the loss is confined to a string executed by a route not listed above.
# Every route the repository's scripts use is listed, and a new one belongs in
# this list and in the fixture suite.
#
# Modes: `code` for the aws/terraform match; `refs` additionally keeps raw any
# line whose command runs a script (an interpreter word, `.`, or a quoted command
# head), so a quoted script operand is still followed; `iso` is the view the
# isolation check reads, where only evaluators keep the raw text, because what
# that check looks for is a credential source being put back, and a string can
# only do that once evaluated.
VIEW_AWK="$(cat <<'AWK'
# True when the text so far leaves the next word in command position: line
# start (unless the previous line continued), after a separator or an opening
# brace, after a control keyword, or after leading assignments.
function at_head(pre) {
  if (pre ~ /^[ \t]*$/) return !cont
  if (pre ~ /[$][(][ \t]*$/) return 1
  return pre ~ /(^|[;&|{]|[ \t](then|do|else))[ \t]*([A-Za-z_][A-Za-z0-9_]*=[^ \t(]*[ \t]+)*$/
}
BEGIN {
  q = "'"; dq = "\""
  ev  = "(^|[^A-Za-z0-9_./-])(eval|ssh|su|runuser|flock|watch|tmux|parallel)([^A-Za-z0-9_-]|$)"
  evw = "(^|[^A-Za-z0-9_./-])(sudo|xargs)([^A-Za-z0-9_-]|$)"
  evl = "(^|[^A-Za-z0-9_./-])(python[0-9.]*|perl|ruby|node)[ \t]+(-[A-Za-z0-9]+[ \t]+)*-[A-Za-z]*[ce]([ \t]|$)"
  evc = "(^|[^A-Za-z0-9_./-])(bash|sh|zsh|dash|ksh)[ \t]+(-[-A-Za-z]+[ \t]+)*-[A-Za-z]*c([ \t]|$)"
  evx = "docker[ \t]+exec|env[ \t]+(-[A-Za-z]+[ \t]+)*-[A-Za-z]*S|(source|[.])[ \t]+(/dev/stdin|<[(])|(bash|sh|zsh)[ \t]*<[ \t]*<[(]"
  evp = "[|][ \t]*([^|;&]*/)?(bash|sh|zsh|dash|ksh)([ \t]|$)"
  evh = "(bash|sh|zsh|dash|ksh|ssh)[^|;&]*<<"
  ipw = "(^|[^A-Za-z0-9_./-])(bash|sh|zsh|dash|ksh|source|exec)([ \t]|$)"
  ipd = "(^|[;&|({])[ \t]*[.][ \t]"
  ipq = "(^|[;&|({])[ \t]*[\"']"
  inq = ""; hd = ""; whole = 0; contraw = 0; cont = 0
}
{
  line = $0
  if (hd != "") {
    t = line; if (hds) sub(/^\t+/, "", t)
    # A heredoc fed to another language (python, a pager) is that program's
    # text: kept for the aws match, but a script path in it is not a shell run.
    out[NR] = (mode == "refs" && !hsh) ? "" : line; raw[NR] = out[NR]
    if (t == hd) hd = ""
    next
  }
  b = ""; n = length(line); i = 1; cut = n; phd = ""
  lr = (inq != "" && contraw) ? 1 : 0
  while (i <= n) {
    c = substr(line, i, 1)
    if (inq == "s") { if (c == q) { inq = ""; b = b c } else b = b " "; i++; continue }
    if (inq == "a" || inq == "d") {
      if (c == "\\") { b = b "  "; i += 2; continue }
      if ((inq == "a" && c == q) || (inq == "d" && c == dq)) { inq = ""; b = b c; i++; continue }
      # A command substitution runs inside double quotes: its text is code, with
      # quoting of its own, until its closing paren returns to the string.
      if (inq == "d" && c == "$" && substr(line, i + 1, 1) == "(") {
        sd++; st[sd] = "d"; lr = 1; pc[sd] = 0; inq = ""; b = b "$("; i += 2; continue
      }
      if (inq == "d" && c == "`") lr = 1
      b = b " "; i++; continue
    }
    if (c == "\\") { b = b substr(line, i, 2); i += 2; continue }
    # A variable run as a command, quoted or not: what it runs is not in the text.
    # ($'...' and $"..." are literal strings, not variables.)
    if (((c == "$" && substr(line, i + 1, 1) !~ /["']/) || (c == dq && substr(line, i + 1, 1) == "$")) && mode != "iso" && at_head(b)) whole = 1
    if (c == "$" && substr(line, i + 1, 1) == "(") { sd++; st[sd] = ""; pc[sd] = 0; b = b "$("; i += 2; continue }
    if (sd > 0 && c == "(") pc[sd]++
    if (sd > 0 && c == ")") {
      if (pc[sd] > 0) pc[sd]--
      else { inq = st[sd]; sd--; b = b c; i++; continue }
    }
    if (c == q) { inq = "s"; b = b c; i++; continue }
    if (c == "$" && substr(line, i + 1, 1) == q) { inq = "a"; b = b "$" q; i += 2; continue }
    if (c == dq) { inq = "d"; b = b c; i++; continue }
    if (c == "#" && (i == 1 || substr(line, i - 1, 1) ~ /[ \t;&|(]/)) { cut = i - 1; break }
    # (`$((1 << n))` is a shift, not a heredoc.)
    if (substr(line, i, 2) == "<<" && substr(line, i + 2, 1) != "<" && line !~ /[(][(]/) {
      rest = substr(line, i + 2); s = 0
      if (substr(rest, 1, 1) == "-") { s = 1; rest = substr(rest, 2) }
      sub(/^[ \t]+/, "", rest)
      if (match(rest, /^["']?[A-Za-z_][A-Za-z0-9_]*["']?/)) {
        phd = substr(rest, 1, RLENGTH); gsub(/["']/, "", phd); phs = s
      }
      b = b "<<"; i += 2; continue
    }
    b = b c; i++
  }
  nc = substr(line, 1, cut)
  # A string evaluator handed a variable can run data from anywhere in the file.
  if (b ~ ev || b ~ evc || b ~ evx || b ~ evp || b ~ evh) {
    lr = 1
    if (mode != "iso" && nc ~ /[$]/) whole = 1
  }
  if (b ~ evw) lr = 1
  # An inline program (`python3 -c '...'`, `perl -e`, awk's system()) runs its
  # own quoted text, so that line stays raw; the variables after it are its
  # file arguments, not code, so the rest of the file is unaffected.
  if (b ~ evl || (b ~ /(^|[^A-Za-z0-9_])awk([^A-Za-z0-9_]|$)/ && nc ~ /system[ \t]*[(]/)) lr = 1
  if (mode == "refs" && (b ~ ipw || b ~ ipd || b ~ ipq)) lr = 1
  # A script path stored in a variable is run later as `bash "$X"`, which names
  # no path, so the assignment is where the path has to be read.
  if (mode == "refs" && nc ~ /^[ \t]*((export|readonly|local|declare)[ \t]+(-[A-Za-z]+[ \t]+)*)?[A-Za-z_][A-Za-z0-9_]*[+]?=/ && nc ~ /[.]sh/) lr = 1
  contraw = (inq != "") ? lr : 0
  cont = (inq == "" && b ~ /\\$/) ? 1 : 0
  out[NR] = lr ? nc : b
  # On a line nothing turns raw, a script path is run only in command position;
  # as an argument (`grep p x.sh`, `sed ... x.sh`) it is read. A case pattern
  # (`a.sh|b.sh)`) is neither, so only what follows its paren counts.
  if (mode == "refs" && !lr) {
    t = b; o = ""
    if (t ~ /^[ \t]*[^ \t()=]+\)/) t = substr(t, index(t, ")") + 1)
    while (match(t, /(^|[;&|({])[ \t]*([A-Za-z_][A-Za-z0-9_]*=[^ \t]*[ \t]+)*((command|nohup|time|exec|nice|setsid|ionice|stdbuf|timeout[ \t]+[0-9smhd]+|env([ \t]+[A-Za-z_][A-Za-z0-9_]*=[^ \t]*)*|then|do|else|elif|if|while|until|!|find[^;&|]*-exec)[ \t]+)*[A-Za-z0-9_.\/-]*\.sh([ \t;&|)]|$)/)) {
      o = o " " substr(t, RSTART, RLENGTH); t = substr(t, RSTART + RLENGTH)
    }
    out[NR] = o
  }
  raw[NR] = nc
  # A line that only prints (echo or printf, its quotes closed, with no command
  # substitution, backtick or pipe) runs nothing, so the message it prints is
  # data even in a file read whole: a hint naming another script is not a run.
  if (mode != "iso" && !lr && inq == "" && sd == 0 && b ~ /^[ \t]*(echo|printf)([ \t]|$)/ && b !~ /[|`]/ && b !~ /[$][(]/) raw[NR] = b
  if (phd != "") { hd = phd; hds = phs; hsh = (b ~ evh) }
}
END {
  if ((inq != "" || sd > 0) && mode != "iso") whole = 1
  if (whole) print "\001W"
  for (k = 1; k <= NR; k++) print (whole ? raw[k] : out[k])
}
AWK
)"

code_view() { printf '%s\n' "$2" | awk -v mode="$1" "$VIEW_AWK"; }

# Does a script body reach AWS? A body whose code view came back whole (marked
# by its first line) runs commands from variables, so the program it runs is
# whatever a variable holds: a value such as TF_BIN="${X:-terraform}",
# AWS_BIN=aws or cmd=(aws s3 ls) is the call. There, aws or terraform in value
# position counts; a sentence naming either in a message does not. Elsewhere
# the command-position match decides.
body_reaches_aws() {
  local view
  # A reading that failed proves nothing, so it counts as a reach.
  view="$(code_view code "$1")" || return 0
  if [ "${view%%$'\n'*}" = $'\001W' ]; then
    printf '%s' "$view" | grep -Eq '([A-Za-z_][A-Za-z0-9_]*=|:-|:=|[A-Za-z_][A-Za-z0-9_]*=\()["'"'"']?(aws|terraform)(["'"'"'}) \t]|$)' && return 0
  fi
  aws_reaching_text "$view"
}

# A script whose first command cuts it off from AWS cannot reach it, whatever
# its text names: `aws_isolate_self "$@"` from scripts/lib/aws-isolation.sh
# re-runs it with every credential source broken, and everything it starts
# inherits that. Such a script is trusted without reading its body, which is
# what keeps the hook fixture suite, whose fixtures name the aws CLI as data,
# from prompting. Only the code counts: comments and blank lines are skipped,
# and the only commands allowed ahead of the call are `set` and the sourcing of
# that library. A script that later exports, unsets or reassigns an AWS_
# variable, runs `env -i` / `env -u`, or evaluates a string (where any of those
# could hide), could undo the isolation, so it is read as usual. The undoing is
# looked for in the code view, so a fixture string that spells one out as data
# does not cost the script its trust.
script_is_aws_isolated() {
  local code line iso
  code="$(printf '%s\n' "$1" | sed -e 's/^[[:space:]]*//' | grep -v -e '^#' -e '^$' || true)"
  iso="$(code_view iso "$1")" || return 1
  # Anything that could put a credential source back: a statement naming an
  # AWS_ variable at command position (assignment, export, unset, declare,
  # readonly, with or without option flags, at line start or after a
  # separator), an `env` that empties or edits the environment, `exec -c`,
  # `sudo`, whose environment reset hands back the target user's credentials,
  # and `eval` or an interpreter's `-c`, which run a string this check cannot see.
  local sep='(^|[;&|(`{][[:space:]]*)'
  if printf '%s\n' "$iso" | sed -e 's/^[[:space:]]*//' | grep -Eq \
      -e "${sep}((export|unset|declare|typeset|local|readonly)([[:space:]]+-[A-Za-z-]*)*[[:space:]]+)?AWS_[A-Z_]*(=|[[:space:]]|\$)" \
      -e "${sep}env([[:space:]]+[^[:space:]]+)*[[:space:]]+(-|-[A-Za-z]*[iu][A-Za-z]*|--unset(=[^[:space:]]*)?|--ignore-environment)([[:space:]]|\$)" \
      -e "${sep}exec[[:space:]]+-[A-Za-z]*c" \
      -e "${sep}sudo([[:space:]]|\$)" \
      -e "${sep}eval([[:space:]]|\$)" \
      -e "${sep}(bash|sh|zsh|dash|ksh)([[:space:]]+-[-A-Za-z]+)*[[:space:]]+-[A-Za-z]*c([[:space:]]|\$)"; then
    return 1
  fi
  # Only plain setup may precede the call, each in one exact form: a `set` line
  # of option flags, or the sourcing of the isolation library by one of its two
  # fixed spellings. Anything else, a substitution or separator included, could
  # hide a command, so it ends the trust.
  while IFS= read -r line; do
    if printf '%s\n' "$line" | grep -Eq '^set( [-+][a-zA-Z]+( [a-z]+)?)+$'; then
      continue
    fi
    case "$line" in
      'source "$(dirname "$0")/../lib/aws-isolation.sh"'|'source scripts/lib/aws-isolation.sh') continue ;;
      'aws_isolate_self "$@"') return 0 ;;
      *) return 1 ;;
    esac
  done <<EOF
$code
EOF
  return 1
}

scan_script() {
  local path="$1" depth="$2" body nested refs
  [ -f "$path" ] || return 1
  [ "$depth" -gt 2 ] && return 1
  # The reading is a per-character walk; a script far larger than any written
  # by hand (a generated or embedded payload) could outlast the hook's timeout,
  # and a timed-out hook lets the call through, so such a script asks instead.
  [ "$(wc -c < "$path")" -gt 262144 ] && return 0
  body="$(cat "$path" 2>/dev/null || true)"
  [ -n "$body" ] || return 1
  script_is_aws_isolated "$body" && return 1
  body_reaches_aws "$body" && return 0

  # Follow npm scripts named inside this script, then the .sh files either the
  # script or those npm scripts name. Read from the code view, so a path or an
  # `npm run` inside a printed message is not taken for a run.
  refs="$(code_view refs "$body")" || return 0
  nested="$(collect_npm_script_bodies "$refs"; printf '%s' "$refs" | grep -oE "$SH_PATH" || true)"
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    aws_reaching_text "$ref" && return 0
    local rel="${ref#./}"
    case "$rel" in
      */*|*.sh) ;;
      *) continue ;;
    esac
    # A library sourced as "${SCRIPT_DIR}/lib/x.sh" or "$(dirname "$0")/../lib/x.sh"
    # leaves a path relative to the script's own directory once the variable is
    # dropped, and that library is where such a script's AWS calls live.
    if [ ! -f "$rel" ] && [ -f "$(dirname "$path")/$rel" ]; then
      rel="$(dirname "$path")/$rel"
    fi
    [ "$rel" = "$path" ] && continue
    scan_script "$rel" "$((depth + 1))" && return 0
  done <<EOF
$nested
EOF
  return 1
}

# A .sh path means "this command runs that script" only where the shell would
# run it: as a command, or as an interpreter's script operand (`bash x.sh`,
# `sh -e "x.sh"`, `source x.sh`), behind any assignments and plain wrappers
# (`env A=1`, `command`, `nohup`, `time`). A path that is merely an ARGUMENT --
# `cat x.sh`, `grep p scripts/x.sh`, or text inside another command's quoted
# argument such as a jq filter -- runs nothing, and treating it as a run made
# reads, and every command that feeds a hook test input, prompt.
#
# The command is split into words the way the shell splits it, quotes removed.
# Wherever that reading cannot tell what runs, every .sh path in the command
# stays a candidate instead, as before: a command substitution or backtick, an
# ANSI-C quote, a heredoc, an unclosed quote, an interpreter's -c or -s, an
# interpreter given no script (it runs its stdin, as in `cat x.sh | bash`),
# and the wrappers that take arguments or run a string (sudo, su, doas, exec,
# env with options, xargs, eval, ssh). Over-matching costs a prompt;
# under-matching costs an unprompted AWS reach.
SH_PATH='(\./)?[A-Za-z0-9_.][A-Za-z0-9_./-]*\.sh'

TOKEN_AWK="$(cat <<'AWK'
function flush() {
  if (have) { gsub(/\n/, " ", tok); print (redir ? "\001R" : "") tok; redir = 0 }
  tok = ""; have = 0
}
BEGIN { q = "'"; dq = "\"" }
{ s = (NR == 1) ? $0 : s "\n" $0 }
END {
  n = length(s); i = 1; tok = ""; have = 0; inq = ""; redir = 0
  while (i <= n) {
    c = substr(s, i, 1)
    if (inq == "s") { if (c == q) inq = ""; else tok = tok c; i++; continue }
    if (inq == "d") {
      if (c == "\\") {
        nx = substr(s, i + 1, 1)
        if (nx ~ /["$`\\]/) { tok = tok nx; i += 2 } else { tok = tok c; i++ }
        continue
      }
      if (c == dq) { inq = ""; i++; continue }
      if (c == "`" || (c == "$" && substr(s, i + 1, 1) == "(")) { print "\001C"; exit }
      tok = tok c; i++; continue
    }
    if (c == "\\" && substr(s, i + 1, 1) == "\n") { i += 2; continue }
    if (c == "\\") { tok = tok substr(s, i + 1, 1); have = 1; i += 2; continue }
    if (c == q) { inq = "s"; have = 1; i++; continue }
    if (c == dq) { inq = "d"; have = 1; i++; continue }
    if (c == "`" || (c == "$" && substr(s, i + 1, 1) ~ /[(']/)) { print "\001C"; exit }
    if (c ~ /[ \t]/) { flush(); i++; continue }
    if (c ~ /[;&|()\n]/) { flush(); print "\001S"; i++; continue }
    if (c == "<" || c == ">") {
      if (substr(s, i, 2) == "<<") { print "\001C"; exit }
      if (tok ~ /^[0-9]+$/) { tok = ""; have = 0 }
      flush(); redir = 1; i++
      while (substr(s, i, 1) ~ /[<>&]/) i++
      continue
    }
    tok = tok c; have = 1; i++
  }
  if (inq != "") { print "\001C"; exit }
  flush()
}
AWK
)"

# Prints the .sh paths the command runs, one per line; returns 2 when the
# command cannot be read that precisely.
command_candidates() {
  local toks t state="head" skipnext=0
  toks="$(printf '%s' "$COMMAND" | awk "$TOKEN_AWK")" || return 2
  if printf '%s\n' "$toks" | grep -q $'^\001C$'; then return 2; fi
  while IFS= read -r t; do
    if [ "$t" = $'\001S' ]; then
      case "$state" in interp|operand) return 2 ;; esac
      state="head"; skipnext=0; continue
    fi
    case "$t" in
      $'\001R'*)
        # A redirect target: `bash < x.sh` runs it, and any other .sh target
        # costs at most a read of that file.
        t="${t#$'\001R'}"
        case "$t" in *.sh) printf '%s\n' "$t" ;; esac
        continue ;;
    esac
    if [ "$skipnext" = 1 ]; then skipnext=0; continue; fi
    case "$state" in
      env)
        case "$t" in -*) return 2 ;; esac
        state="head" ;;
    esac
    case "$state" in
      head)
        if [[ "$t" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then continue; fi
        case "${t##*/}" in
          env) state="env" ;;
          sudo|su|doas|exec|xargs|eval|ssh) return 2 ;;
          nohup|'!'|'{'|'}'|if|then|else|elif|do|while|until) ;;
          # Runners whose own options come first and whose arguments then run
          # (`timeout 5 bash x.sh`, `nice -n 5 x.sh`, `flock f bash x.sh`):
          # any script path among those arguments counts.
          command|builtin|time|timeout|nice|setsid|ionice|stdbuf|flock|parallel|watch|chrt|taskset|busybox|unbuffer|strace|ltrace|valgrind)
            state="args" ;;
          bash|sh|zsh|dash|ksh|source|.) state="interp" ;;
          *.sh) printf '%s\n' "$t"; state="done" ;;
          *) state="done" ;;
        esac ;;
      interp)
        case "$t" in
          --) state="operand" ;;
          --rcfile|--init-file|-o|+o|-O|+O) skipnext=1 ;;
          --*) ;;
          -*c*|-*s*) return 2 ;;
          [-+]*) ;;
          # A script named by a variable (`bash "$s"`) is not readable here.
          *) case "$t" in *.sh) printf '%s\n' "$t" ;; *\$*) return 2 ;; esac; state="done" ;;
        esac ;;
      operand)
        case "$t" in *.sh) printf '%s\n' "$t" ;; *\$*) return 2 ;; esac
        state="done" ;;
      args)
        case "$t" in *.sh) printf '%s\n' "$t" ;; *\$*) return 2 ;; esac ;;
    esac
  done <<EOF
$toks
EOF
  case "$state" in interp|operand) return 2 ;; esac
  return 0
}

# The fallback stays as broad as the old reading only where something in the
# command can run a script: an interpreter, an evaluator or a privilege wrapper.
# Without one, a command substitution or heredoc in, say, a commit message
# runs nothing, and only a path in command position counts.
if ! SH_CANDIDATES="$(command_candidates)"; then
  if printf '%s' "$COMMAND" | grep -Eq '(^|[^A-Za-z0-9_./-])(bash|sh|zsh|dash|ksh|source|eval|xargs|sudo|su|doas|exec|ssh|env)([^A-Za-z0-9_-]|$)'; then
    SH_CANDIDATES="$(printf '%s' "$COMMAND" | grep -oE "$SH_PATH" || true)"
  else
    SH_CANDIDATES="$(printf '%s' "$COMMAND" | grep -oE "${CMD_START}${SH_PATH}" | grep -oE "$SH_PATH" || true)"
  fi
fi

CANDIDATES="$(
  { printf '%s' "$SH_CANDIDATES"
    collect_npm_script_bodies "$COMMAND"; } 2>/dev/null || true
)"

while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  if aws_reaching_text "$candidate"; then
    ask "Command runs an npm script that reaches AWS. Claude runs no AWS operation without explicit per-invocation approval."
  fi
  rel="${candidate#./}"
  case "$rel" in
    *.sh) ;;
    *) continue ;;
  esac
  if scan_script "$rel" 1; then
    ask "Script '$rel' reaches AWS (its body, or a script or npm script it invokes, calls the aws CLI or Terraform against the account or remote state). Claude runs no AWS operation without explicit per-invocation approval; a script's name does not show what it touches, so approve only if you want this to run now."
  fi
done <<EOF
$CANDIDATES
EOF

exit 0
