#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# find with -delete — a predicate that appears anywhere in the args,
# so a static Bash(find -delete:*) rule in settings.json cannot match it.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])find([[:space:]].*)?[[:space:]]-delete([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "find with -delete detected. Confirm before running."
    }
  }'
  exit 0
fi

# sort writing its output to a file (-o / --output) — a write via a flag, not a
# shell redirect, so the redirect guard below cannot see it. `sort` is on the
# read-only allow-list (it reads in its common form), so without this it would
# auto-approve a file truncate.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])sort([[:space:]].*)?[[:space:]](-o[[:space:]]|-o$|--output)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "sort -o / --output writes a file. Confirm before running."
    }
  }'
  exit 0
fi

# find writing to a file via -fprint / -fprintf / -fls — write predicates that
# can appear anywhere in the args (like -delete). `find` is on the read-only
# allow-list, so these need an explicit ask.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])find([[:space:]].*)?[[:space:]]-(fprint|fprintf|fls)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "find with -fprint/-fprintf/-fls writes a file. Confirm before running."
    }
  }'
  exit 0
fi

# sed writing or executing without -i: the `w`/`W` commands and the `s///w file`
# flag write a file, and GNU sed's `e` command runs a shell command. `sed` is on the
# read-only allow-list (its common form only reads), so these need an explicit ask.
# The -i / --in-place form is also in settings.json ask, mirrored here for subagents.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])sed([[:space:]].*)?[[:space:]](-[a-zA-Z]*i([[:space:]]|=|$|[.'"'"'"/])|--in-place)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "sed -i / --in-place edits a file. Confirm before running."
    }
  }'
  exit 0
fi
if printf '%s' "$COMMAND" | grep -Eq "(^|[;&|[:space:]])sed([[:space:]]|$).*([[:space:]']([wW]|[0-9,~+]*e)[[:space:]]|s[/|,#].*[/|,#][gpimw0-9]*w[[:space:]])"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "sed with a w/W write-command, s///w write-flag, or e exec-command detected. Confirm before running."
    }
  }'
  exit 0
fi

# tree writing its output to a file (-o / --output) — like sort -o, a write via a
# flag that the redirect guard cannot see. `tree` is on the read-only allow-list.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])tree([[:space:]].*)?[[:space:]](-o([[:space:]]|$)|--output)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "tree -o / --output writes a file. Confirm before running."
    }
  }'
  exit 0
fi

# curl with state-changing HTTP methods — -X POST/PUT/DELETE/PATCH can appear
# anywhere in a long curl invocation, so again not expressible as a static rule.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])curl([[:space:]].*)?[[:space:]](-X[[:space:]]+(POST|PUT|DELETE|PATCH)|--request[[:space:]]+(POST|PUT|DELETE|PATCH))([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "curl with mutating HTTP method detected. Confirm before sending."
    }
  }'
  exit 0
fi

# curl uploading data or a request body — -d/-F/-T flags can appear anywhere.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])curl([[:space:]].*)?[[:space:]](-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|-T|--upload-file)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "curl with request-body or upload flag detected. Confirm before running."
    }
  }'
  exit 0
fi

# curl -o / --output writing a real file. A discard target (/dev/null, or - for stdout)
# writes nothing, so this guard does not ask on it: a `curl -sf -o /dev/null <loopback>`
# health probe is auto-approved by the read-only approver (loopback discard only). Every
# other curl still prompts (no static curl allow), because content is fetched through
# domain-scoped WebFetch, not an auto-approved curl to an arbitrary host.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])curl([[:space:]].*)?[[:space:]](-o|--output)[[:space:]]+' \
  && ! printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])curl([[:space:]].*)?[[:space:]](-o|--output)[[:space:]]+(/dev/null|-)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "curl -o / --output writes a file. Confirm before running."
    }
  }'
  exit 0
fi

# Output redirection (>, >>) to a real file writes it, whatever command precedes it. A
# statically-allowed read-only head (cat, egrep, fgrep, date, pgrep, a read-only git
# subcommand, ...) would otherwise have `<head> ... > file` auto-approved by its own allow
# rule, because the read-only approver only DEFERS on a redirect and so cannot override an
# allow. Do not anchor on a head list (it drifts out of sync with the allow list): strip the
# redirect forms that write nothing worth gating -- fd duplications (2>&1, >&2), the discard
# device (/dev/null), and the AI's own session scratch dir (/tmp/claude-*) -- then ask if any
# redirect remains. `..` in the command keeps the scratch exemption off so a path escape stays
# gated. Spacing does not matter: `>out` leaks exactly as `> out` would. Newlines are
# flattened first: the stripping below is line-based, and a quoted string spanning lines
# (an inline SQL query with a <> comparison, a node -e script with arrow functions) would
# otherwise leave its literal > unstripped and raise a false ask.
RSCAN="$(printf '%s' "$COMMAND" | tr '\n' ' ' | sed -E 's#[0-9]*>&[0-9-]+##g; s#&>>?[[:space:]]*/dev/null##g; s#[0-9]*>>?[[:space:]]*/dev/null##g')"
case "$COMMAND" in
  *..*) : ;;
  *) RSCAN="$(printf '%s' "$RSCAN" | sed -E 's#[0-9]*>>?[[:space:]]*/tmp/claude-[A-Za-z0-9._/-]+##g')" ;;
esac
# Neutralize a literal `>` that sits INSIDE quotes so an argument like grep '=>', grep
# '->', or an inline SQL <> comparison is not mistaken for a redirect operator. A single
# character walk pairs quotes correctly even when a $-bearing quoted region (like "$DB")
# sits next to a plain one; a regex strip mis-pairs the kept region's quote with the next
# region's quote and exposes that region's `>`, raising a false ask. Security property kept
# intact: a `>` in a single-quoted region is always inert (bash never expands there), but a
# `>` in a DOUBLE-quoted region is neutralized only when that region holds no $ or backtick,
# so a redirect hidden in a command substitution ("$(cmd > f)") keeps its `>` and still asks.
# An unterminated quote (a malformed command) is emitted verbatim, so a stray `>` still asks.
RSCAN="$(printf '%s' "$RSCAN" | awk 'BEGIN{dq=sprintf("%c",34); sq=sprintf("%c",39); q=""; buf=""; xp=0} {out=""; n=length($0); for(i=1;i<=n;i++){c=substr($0,i,1); if(q==""){ if(c==sq){q=sq; buf=""} else if(c==dq){q=dq; buf=""; xp=0} else {out=out c}; continue } if(q==sq){ if(c==sq){gsub(/[<>]/,"_",buf); out=out sq buf sq; q=""} else {buf=buf c}; continue } if(c==dq){ if(xp==0){gsub(/[<>]/,"_",buf)}; out=out dq buf dq; q=""; continue } if(c=="$"||c=="\140"){xp=1} buf=buf c } if(q!=""){ out=out buf } print out}')"
if printf '%s' "$RSCAN" | grep -q '>'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Shell output redirection (>, >>) to a real file would write it, and a static allow rule for the leading command could auto-approve it. Confirm before running. The discard device (/dev/null) and the session scratch dir are exempt."
    }
  }'
  exit 0
fi
