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
# gated. Spacing does not matter: `>out` leaks exactly as `> out` would.
RSCAN="$(printf '%s' "$COMMAND" | sed -E 's#[0-9]*>&[0-9-]+##g; s#&>>?[[:space:]]*/dev/null##g; s#[0-9]*>>?[[:space:]]*/dev/null##g')"
case "$COMMAND" in
  *..*) : ;;
  *) RSCAN="$(printf '%s' "$RSCAN" | sed -E 's#[0-9]*>>?[[:space:]]*/tmp/claude-[A-Za-z0-9._/-]+##g')" ;;
esac
# Remove inert quoted regions so a literal `>` in an argument (grep '=>' , grep '->' ,
# --grep='a>b') is not mistaken for a redirect operator. A real redirect `>` can never sit
# inside single quotes, so stripping single-quoted regions can never hide a genuine write.
# Double-quoted regions are stripped only when they hold no `$` or backtick, so a redirect
# hidden in a command substitution (`"$(cmd > f)"`) is left in place and still asks.
RSCAN="$(printf '%s' "$RSCAN" | sed -E "s/'[^']*'//g; s/\"[^\"\$\`]*\"//g")"
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
