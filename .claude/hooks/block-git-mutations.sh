#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
#
# The human owns every write to this repository and to its GitHub remote. Claude
# reads freely and writes nothing: no staging, no commit, no push, no pull, no
# branch, no tag, no stash, no reset, no pull request, no release.
#
# Why a token parser rather than a list of forbidden verb spellings: a spelling
# list only blocks the verbs someone thought to list. An earlier version listed
# four of them, and creating a branch — which is neither of those four — went
# straight through. This walks each invocation the way a shell would: strip the
# environment assignments and wrappers, find the binary, skip the global options,
# and judge the verb that is actually being run. A verb it cannot resolve (hidden
# behind a variable or a command substitution) is denied rather than allowed,
# because an invocation the gate cannot read is the case it exists for.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

GIT_DENY="HARD BLOCK: the human owns every change to this repository. Claude may read history and working-tree state, and may never stage, commit, push, pull, branch, switch, checkout, merge, rebase, tag, stash, reset, or otherwise write to the repository. Say what needs running and let the human run it."

GH_DENY="HARD BLOCK: the human owns every change to the GitHub repository. Claude may read GitHub and may operate the maintainers' private issue tracker, and may never create or modify branches, pull requests, releases, workflow runs, keys, or repository settings."

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# unresolvable <token>: a verb or subcommand assembled at runtime, from a variable
# or a command substitution, cannot be judged. Deny instead of guessing.
unresolvable() {
  case "$1" in
    ''|*'$'*|*'`'*) return 0 ;;
    *) return 1 ;;
  esac
}

# first_subcommand: the first non-flag argument, which is the subcommand for every
# verb judged by subcommand below.
first_subcommand() {
  local a
  for a in "$@"; do
    case "$a" in -*) continue ;; *) printf '%s' "$a"; return 0 ;; esac
  done
  printf '%s' '<none>'
}

# judge_subcommand <space-separated read-only subcommands> <args...>
judge_subcommand() {
  local allowed="$1"; shift
  local sub
  sub="$(first_subcommand "$@")"
  unresolvable "$sub" && deny "$GIT_DENY"
  case " $allowed " in
    *" $sub "*) return 0 ;;
  esac
  deny "$GIT_DENY"
}

# `git branch` and `git tag` both list when given only read-only flags and both
# create when given a name, so the name is what decides. Walk the arguments,
# consuming the values of the flags that take one, and deny on a name that is not
# a listing pattern.
judge_branch() {
  local expect_value=0 listing=0 a
  for a in "$@"; do
    if [ "$expect_value" -eq 1 ]; then expect_value=0; continue; fi
    case "$a" in
      -d|-D|-m|-M|-c|-C|-f|-u|--delete|--move|--copy|--force|--track|--no-track \
      |--set-upstream|--set-upstream-to|--set-upstream-to=*|--unset-upstream \
      |--edit-description|--create-reflog)
        deny "$GIT_DENY" ;;
      --contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format|--column)
        expect_value=1 ;;
      -l|--list) listing=1 ;;
      -*) : ;;
      *)
        unresolvable "$a" && deny "$GIT_DENY"
        [ "$listing" -eq 1 ] || deny "$GIT_DENY" ;;
    esac
  done
}

judge_tag() {
  local expect_value=0 listing=0 a
  for a in "$@"; do
    if [ "$expect_value" -eq 1 ]; then expect_value=0; continue; fi
    case "$a" in
      -a|-s|-d|-f|-m|-F|-u|--annotate|--sign|--delete|--force|--edit \
      |--message|--message=*|--file|--file=*|--local-user|--local-user=* \
      |--cleanup|--cleanup=*|--create-reflog)
        deny "$GIT_DENY" ;;
      --contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format|--column)
        expect_value=1 ;;
      -l|--list|-n|-n[0-9]*) listing=1 ;;
      -*) : ;;
      *)
        unresolvable "$a" && deny "$GIT_DENY"
        [ "$listing" -eq 1 ] || deny "$GIT_DENY" ;;
    esac
  done
}

# `git config` reads and writes through the same verb, and the read forms all name
# themselves. Anything else is treated as a write.
judge_config() {
  local a
  for a in "$@"; do
    case "$a" in
      --get|--get-all|--get-regexp|--get-urlmatch|--get-color|--get-colorbool|-l|--list)
        return 0 ;;
    esac
  done
  deny "$GIT_DENY"
}

# The GitHub CLI reaches the same repository over the API, so the same rule holds
# there. The one sanctioned exception is the maintainers' private issue tracker,
# whose create/edit/comment/close operations this project's permission rules grant
# on their own merits; everything that changes repository state is refused.
judge_gh_api() {
  local expect_method=0 a
  for a in "$@"; do
    if [ "$expect_method" -eq 1 ]; then
      expect_method=0
      case "$a" in GET|get|HEAD|head) continue ;; *) deny "$GH_DENY" ;; esac
    fi
    case "$a" in
      -X|--method) expect_method=1 ;;
      -XGET|-Xget|--method=GET|--method=get) : ;;
      -X*|--method=*) deny "$GH_DENY" ;;
      # A field flag makes the request a POST even with no explicit method.
      -f|-F|--field|--raw-field|--input|-f*|-F*|--field=*|--raw-field=*|--input=*)
        deny "$GH_DENY" ;;
    esac
  done
}

judge_gh() {
  # A flag can sit in front of the command word, so resolve past one the same way
  # the subcommand below is resolved rather than reading the flag as the command.
  while [ $# -gt 0 ]; do
    case "$1" in -*) shift ;; *) break ;; esac
  done
  local cmd="${1:-}"
  [ $# -gt 0 ] && shift
  unresolvable "$cmd" && deny "$GH_DENY"
  local sub
  sub="$(first_subcommand "$@")"
  case "$cmd" in
    api) judge_gh_api "$@" ;;
    # Tracker operations stay open; destroying or moving a card does not.
    issue) case "$sub" in delete|transfer) deny "$GH_DENY" ;; esac ;;
    # `gh pr checkout` creates a local branch, so it sits with the write forms.
    pr) case "$sub" in list|view|diff|checks|status) : ;; *) deny "$GH_DENY" ;; esac ;;
    repo) case "$sub" in list|view|clone|license|gitignore) : ;; *) deny "$GH_DENY" ;; esac ;;
    release) case "$sub" in list|view|download) : ;; *) deny "$GH_DENY" ;; esac ;;
    run) case "$sub" in list|view|watch|download) : ;; *) deny "$GH_DENY" ;; esac ;;
    workflow) case "$sub" in list|view) : ;; *) deny "$GH_DENY" ;; esac ;;
    label|gist|cache) case "$sub" in list|view) : ;; *) deny "$GH_DENY" ;; esac ;;
    secret|variable|ssh-key|gpg-key|auth|alias|extension|codespace|org|project|ruleset)
      case "$sub" in list|view|status) : ;; *) deny "$GH_DENY" ;; esac ;;
    *) : ;;
  esac
}

# analyze <tokens of one command>: resolve what is actually being run and judge it.
analyze() {
  local bin verb
  # Strip everything that can sit in front of the real binary: environment
  # assignments, and the wrappers that run a command on your behalf. The flag and
  # number arms matter as much as the names — `timeout 5 git commit` and
  # `bash --login -c "git commit"` both put a token between the wrapper and the
  # verb, and a wrapper list that stops at the first unrecognised token lets the
  # command through.
  while [ $# -gt 0 ]; do
    case "$1" in
      env|command|builtin|exec|eval|sudo|doas|nohup|time|timeout|nice|ionice \
      |stdbuf|setsid|script|flock|xargs) shift ;;
      [A-Za-z_]*=*) shift ;;
      -*) shift ;;
      [0-9]*) shift ;;
      *) break ;;
    esac
  done
  [ $# -gt 0 ] || return 0
  bin="$1"; shift
  case "$bin" in
    bash|sh|zsh|dash|*/bash|*/sh|*/zsh|*/dash)
      # A shell wrapper hides the real command among its own arguments; judge that.
      while [ $# -gt 0 ]; do
        case "$1" in -c|-lc|-e|-x|--) shift ;; *) break ;; esac
      done
      analyze "$@"
      return 0 ;;
    gh|*/gh)
      judge_gh "$@"
      return 0 ;;
    git|*/git) : ;;
    *) return 0 ;;
  esac

  # Skip git's own global options so a leading `-C DIR` or `-c k=v` cannot hide
  # the verb behind it.
  while [ $# -gt 0 ]; do
    case "$1" in
      -c|-C|--git-dir|--work-tree|--namespace|--super-prefix|--exec-path)
        if [ $# -ge 2 ]; then shift 2; else shift; fi ;;
      -*) shift ;;
      *) break ;;
    esac
  done

  verb="${1:-}"
  [ $# -gt 0 ] && shift
  unresolvable "$verb" && deny "$GIT_DENY"

  case "$verb" in
    # Verbs with no read-only form at all. The plumbing on the second and third
    # lines writes objects, refs or working-tree files just as surely as the
    # porcelain above it, and a gate that lists only the everyday spellings is
    # the same mistake one layer down.
    add|am|apply|bisect|checkout|cherry-pick|clean|commit|commit-tree|fast-import \
    |filter-branch|filter-repo|gc|init|merge|mv|prune|pull|push|rebase|replace \
    |reset|restore|revert|rm|switch|update-index|update-ref|send-email|daemon \
    |hash-object|write-tree|read-tree|checkout-index|mktree|symbolic-ref|pack-refs \
    |repack|prune-packed|unpack-objects|index-pack|merge-file|merge-index \
    |mailinfo|mailsplit|update-server-info|clone|submodule--helper)
      deny "$GIT_DENY" ;;
    branch) judge_branch "$@" ;;
    tag) judge_tag "$@" ;;
    config) judge_config "$@" ;;
    remote) judge_subcommand "<none> show get-url" "$@" ;;
    worktree) judge_subcommand "list" "$@" ;;
    stash) judge_subcommand "list show" "$@" ;;
    submodule) judge_subcommand "status summary" "$@" ;;
    notes) judge_subcommand "list show" "$@" ;;
    reflog) judge_subcommand "<none> show exists" "$@" ;;
    # Everything else (status, log, diff, show, grep, blame, rev-parse, fetch, …)
    # reads, and falls through to the rest of the permission chain.
    *) : ;;
  esac
}

# One potential invocation per line: a real command sits at the start of a segment,
# while the same words inside an echo or a grep pattern do not.
set -f
while IFS= read -r segment; do
  case "$segment" in
    *[![:space:]]*) ;;
    *) continue ;;
  esac
  # shellcheck disable=SC2086
  analyze $segment
done <<EOF
$(printf '%s' "$COMMAND" | tr -d '"'"'" | sed -E 's/(&&|\|\||\$\(|[;&|`(){}])/\n/g')
EOF

exit 0
