#!/usr/bin/env bash
# Routing guard: reach a companion repository only through its repo-root link
# (footbag_private_repo/, footbag_dev_tester_repo/, the legacy links). Claude Code
# loads a companion's path-scoped rule and its own CLAUDE.md only for a path spelled
# through the link, so a file-tool call that names the link's real target is denied
# with the link spelling to use instead. A link whose target sits inside this
# repository needs no guard and is skipped.
# Fails closed: any internal error exits 2, which blocks the call; a rewrite is cheap.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
REQUESTED="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // empty')"
[ -n "$REQUESTED" ] || exit 0
[ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0

case "$REQUESTED" in
  /*) ;;
  *) REQUESTED="$(printf '%s' "$INPUT" | jq -r --arg d "$CLAUDE_PROJECT_DIR" '.cwd // $d')/$REQUESTED" ;;
esac

# Spelled through a companion link, with no `..` to step back out of it: allowed.
for link in "$CLAUDE_PROJECT_DIR"/footbag_*; do
  [ -L "$link" ] || continue
  case "$REQUESTED" in
    */../*|*/..) ;;
    "$link"|"$link"/*) exit 0 ;;
  esac
done

# Physical location of the requested path; its tail may not exist yet (a new file).
dir="$REQUESTED" tail=""
while [ ! -d "$dir" ]; do
  tail="/${dir##*/}$tail"
  dir="${dir%/*}"
  [ -n "$dir" ] || dir=/
done
RESOLVED="$(cd "$dir" && pwd -P)$tail"
PROJECT="$(cd "$CLAUDE_PROJECT_DIR" && pwd -P)"

for link in "$CLAUDE_PROJECT_DIR"/footbag_*; do
  [ -L "$link" ] && [ -d "$link" ] || continue
  real="$(cd "$link" && pwd -P)"
  case "$real" in "$PROJECT"|"$PROJECT"/*) continue ;; esac
  case "$RESOLVED" in
    "$real"|"$real"/*)
      jq -n --arg req "$REQUESTED" --arg use "$link${RESOLVED#"$real"}" '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: ("Reach a companion repository through its repo-root link, never its real path: its rules and its own CLAUDE.md load only through the link. Retry with: " + $use + "\nRequested: " + $req)
        }
      }'
      exit 0 ;;
  esac
done
exit 0
