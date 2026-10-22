#!/usr/bin/env bash
# Harness self-check: the .claude harness (CLAUDE.md, rules, skills, hooks, agents,
# settings.json) is production configuration, so CI verifies it stays internally
# consistent the same way it verifies code. A dangling skill reference, an unwired
# or non-executable hook, invalid settings JSON, a reference to a deleted doc, an
# explicit-only skill that can still auto-fire, an oversized skill body, or a
# broadly-allowed sqlite3 all ship silently otherwise.
#
# This is the must-have subset. Each check runs independently and the script
# aggregates failures so one run reports every problem, then exits non-zero if any
# check failed.
#
# Usage: assert_claude_harness.sh [--skip-hook-fixtures | --local-settings-only]
#   --skip-hook-fixtures  leave Check 10 to the caller, which runs the hook fixture
#                         suite as a gate of its own. The clean room does, and this is
#                         what keeps a full local run executing that suite once.
#   --local-settings-only run Check 11 alone. It reads the gitignored per-developer
#                         settings file, which the clean room cannot see, so the bare
#                         run's checkout runs it while the room runs every other check.
set -uo pipefail
# Reaches no AWS, and is cut off from it before anything runs, the hook fixture
# suite it starts included.
source "$(dirname "$0")/../lib/aws-isolation.sh"
aws_isolate_self "$@"
cd "$(dirname "$0")/../.."

SKIP_HOOK_FIXTURES=0
LOCAL_SETTINGS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-hook-fixtures) SKIP_HOOK_FIXTURES=1 ;;
    --local-settings-only) LOCAL_SETTINGS_ONLY=1 ;;
    *) echo "[harness] ERROR: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

fail=0
self="scripts/ci/assert_claude_harness.sh"
SETTINGS=".claude/settings.json"

# Heads that can delete or write despite reading in their common form (xargs rm,
# find -delete, echo > f, awk/sed program-text writes), the outright destructive
# ones, and WebFetch(domain:*) meaning every domain. Shared by the committed-allow
# check and the machine-local check, so the two cannot drift into disagreeing
# about what counts as unsafe.
MUTATION_HEAD_RE='^Bash\((xargs|find|echo|awk|sed|rm|mv|cp|dd|tee|truncate|chmod|chown)([: *)]|$)|^WebFetch\(domain:\*\)$'

# Check 11, defined here so --local-settings-only can run it alone.
# settings.local.json is gitignored and per-developer, so it is absent in CI and this check
# runs only where the file exists (a developer's machine). Its only routine writer is the
# "don't ask again" click at a permission prompt, which saves permanently and cannot be
# made session-only, so it drifts toward over-permission by construction.
#
# A saved click lasts one session here: strip-local-allows.sh removes every allow and ask
# rule from this file when a fresh session starts. An allow or ask rule found now was saved
# in this session, or survived a failed strip; either way it is not a permanent rule. A
# permanent never-ask is written by hand into the committed settings.json when it is
# shareable, or into the developer's user-scope settings when it names a machine path.
# The file's legitimate content is the env block (machine-local values committed text must
# never name), which is never scanned, and deny rules, which only ever tighten but still
# clear the same mutation-head screen the committed allow list faces.
check_local_settings() {
  local LOCAL=".claude/settings.local.json"
  local local_gated local_deny local_unsafe
  if [ -f "$LOCAL" ] && jq empty "$LOCAL" >/dev/null 2>&1; then
    local_gated=$(jq -r '((.permissions.allow // []) + (.permissions.ask // []))[]' "$LOCAL" 2>/dev/null | grep -v '^[[:space:]]*$' | sort -u || true)
    local_deny=$(jq -r '(.permissions.deny // [])[]' "$LOCAL" 2>/dev/null | grep -v '^[[:space:]]*$' | sort -u || true)
    local_unsafe=$(printf '%s\n' "$local_deny" | grep -v '^[[:space:]]*$' | grep -E "$MUTATION_HEAD_RE" || true)
    if [ -n "$local_gated" ]; then
      echo "[harness] FAIL: $LOCAL carries saved allow or ask rule(s); the next fresh session removes them, or delete them now and put a permanent one in $SETTINGS or user-scope settings by hand:" >&2
      ( IFS=$'\n'; printf '  %s\n' $local_gated >&2 )
      fail=1
    fi
    if [ -n "$local_unsafe" ]; then
      echo "[harness] FAIL: $LOCAL carries mutation-capable or unscoped deny rule(s):" >&2
      ( IFS=$'\n'; printf '  %s\n' $local_unsafe >&2 )
      fail=1
    fi
    if [ -z "$local_gated" ] && [ -z "$local_unsafe" ]; then
      echo "[harness] $LOCAL carries no saved allow or ask rules"
    fi
  else
    echo "[harness] $LOCAL absent or empty (nothing to scan)"
  fi
}

if [ "$LOCAL_SETTINGS_ONLY" -eq 1 ]; then
  check_local_settings
  if [ "$fail" -ne 0 ]; then
    echo "[harness] FAIL: the machine-local settings check failed." >&2
    exit 1
  fi
  echo "[harness] pass (machine-local settings check only)"
  exit 0
fi

# Harness prose files scanned for path references (concrete, single-file paths only).
# Nested CLAUDE.md files load like the root one, and the Claude Code guide cites the
# harness by path, so a moved skill file left cited in either rots just the same.
harness_md() {
  { echo CLAUDE.md
    echo PROJECT_SUMMARY_CONCISE.md
    [ -f docs/CLAUDE_CODE_GUIDE.md ] && echo docs/CLAUDE_CODE_GUIDE.md
    git ls-files --cached --others --exclude-standard -- ':(glob)**/CLAUDE.md' 2>/dev/null
    find .claude -name '*.md'
  } | sort -u
}

# --- Check 1: settings.json is valid JSON ---
if jq empty "$SETTINGS" >/dev/null 2>&1; then
  echo "[harness] settings.json is valid JSON"
else
  echo "[harness] FAIL: $SETTINGS is not valid JSON" >&2
  fail=1
fi

# --- Check 2: every wired hook points to an existing, executable file ---
if jq empty "$SETTINGS" >/dev/null 2>&1; then
  bad_hooks=""
  while IFS= read -r cmd; do
    [ -n "$cmd" ] || continue
    path=$(printf '%s' "$cmd" | sed 's#^"\$CLAUDE_PROJECT_DIR"/##')
    if [ ! -f "$path" ]; then
      bad_hooks="${bad_hooks}  missing: ${path}"$'\n'
    elif [ ! -x "$path" ]; then
      bad_hooks="${bad_hooks}  not executable: ${path}"$'\n'
    fi
  done < <(jq -r '.hooks | .. | .command? // empty' "$SETTINGS")
  if [ -n "$bad_hooks" ]; then
    echo "[harness] FAIL: wired hook(s) missing or not executable:" >&2
    printf '%s' "$bad_hooks" >&2
    fail=1
  else
    echo "[harness] all wired hooks exist and are executable"
  fi
fi

# --- Check 3: no live harness/canonical file references a deleted doc ---
# exploration/ holds frozen historical design docs that legitimately cite docs
# deleted later; they are archives, not the live surface, so they are excluded.
# The deleted issue-template directory and bug-tracker setup script are named here too:
# a retired surface is a retired surface whether or not it was a .md file.
# Names with no surviving counterpart match bare, so an extension-less mention
# ("follow IMPLEMENTATION_PLAN") is caught as well.
# DEVOPS_GUIDE.md is the exception: it was not deleted, it moved to the private operations
# repository, and public text names it there deliberately. Only the dead public PATH is
# banned, so a stale pointer at the removed copy still fails while naming the live private
# doc stays legal.
# The two catalogs keep their \.md anchor because their bare names legitimately appear
# inside the doc-reference detector regexes that other checks and skills carry, and matching
# those bare would fail the build on the detectors themselves.
DELETED_DOCS='SERVICE_CATALOG\.md|VIEW_CATALOG\.md|IMPLEMENTATION_PLAN|BUG_REPORT|docs/DEVOPS_GUIDE|ISSUE_TEMPLATE|setup-bug-tracker-project'
if refs=$(git grep --untracked -lE "$DELETED_DOCS" -- ":!$self" ':!exploration' 2>/dev/null); then
  echo "[harness] FAIL: reference(s) to a deleted doc or retired surface (SERVICE_CATALOG.md / VIEW_CATALOG.md / IMPLEMENTATION_PLAN.md / BUG_REPORT.md / the removed docs/DEVOPS_GUIDE.md path / .github/ISSUE_TEMPLATE / scripts/setup-bug-tracker-project.sh):" >&2
  ( IFS=$'\n'; printf '  %s\n' $refs >&2 )
  fail=1
else
  echo "[harness] no references to deleted docs"
fi

# --- Check 3b: a named private ops doc is always marked private ---
# Public text names the private operations docs rather than describing them vaguely, because
# a reader is better served by a real filename than by a role. The name alone is not enough:
# DEVOPS_GUIDE.md is also what the removed public copy was called, so a bare mention reads as
# a file in this repository that a reader will then fail to find. Every line naming it must
# therefore also carry the word "private". Line-level matching is deliberate (`--and --not`):
# filtering git grep's output instead would test the file PATH too, and a path that itself
# contains "private" would mask an unmarked line inside it.
unmarked=$(git grep --untracked -n -e 'DEVOPS_GUIDE\.md' --and --not -e 'private' -- ":!$self" ':!exploration' 2>/dev/null || true)
if [ -n "$unmarked" ]; then
  echo "[harness] FAIL: DEVOPS_GUIDE.md named without marking it private on the same line:" >&2
  printf '%s\n' "$unmarked" >&2
  fail=1
else
  echo "[harness] every private ops doc mention is marked private"
fi

# --- Check 4: explicit-only skills carry disable-model-invocation ---
bad_invocation=""
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  fm=$(awk 'NR==1&&/^---[[:space:]]*$/{f=1;next} f&&/^---[[:space:]]*$/{exit} f{print}' "$f")
  if grep -qiE 'invoke only|only when the (user|human) explicitly|only on explicit' <<< "$fm"; then
    if ! grep -qE '^disable-model-invocation:[[:space:]]*true' <<< "$fm"; then
      bad_invocation="${bad_invocation}  ${f}"$'\n'
    fi
  fi
done
if [ -n "$bad_invocation" ]; then
  echo "[harness] FAIL: explicit-only skill(s) missing 'disable-model-invocation: true':" >&2
  printf '%s' "$bad_invocation" >&2
  fail=1
else
  echo "[harness] explicit-only skills carry disable-model-invocation"
fi

# --- Check 5: each SKILL.md stays under the line ceiling ---
# The body loads whole whenever the skill fires, so the ceiling applies to it
# regardless of what else sits in the folder; long reference material moves
# into a supporting file the body links to.
CEILING=500
bad_size=""
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f")
  if [ "$lines" -gt "$CEILING" ]; then
    bad_size="${bad_size}  ${f} (${lines} lines)"$'\n'
  fi
done
if [ -n "$bad_size" ]; then
  echo "[harness] FAIL: SKILL.md over ${CEILING} lines; move reference material into a supporting file:" >&2
  printf '%s' "$bad_size" >&2
  fail=1
else
  echo "[harness] all SKILL.md within ${CEILING} lines"
fi

# --- Check 6: sqlite3 is never auto-allowed without -readonly ---
sqlite_bad=$(jq -r '(.permissions.allow // [])[]' "$SETTINGS" 2>/dev/null \
  | grep -iE 'sqlite3' | grep -v -- '-readonly' || true)
if [ -n "$sqlite_bad" ]; then
  echo "[harness] FAIL: sqlite3 allowed without -readonly:" >&2
  ( IFS=$'\n'; printf '  %s\n' $sqlite_bad >&2 )
  fail=1
else
  echo "[harness] sqlite3 is not auto-allowed without -readonly"
fi

# --- Check 7: concrete .claude/ rule/skill/hook/agent references from harness files resolve ---
# Extract single-file paths (globs and brace-expansions naturally excluded: the char
# class stops at '*' and '{'). Scoped to .claude/ paths: doc references in rule prose
# are frequently illustrative placeholders (docs/FOO.md), so a docs/*.md existence
# check would be noise; the deleted-doc check above covers the concrete doc case.
missing_refs=""
while IFS= read -r ref; do
  [ -n "$ref" ] || continue
  [ -e "$ref" ] || missing_refs="${missing_refs}  ${ref}"$'\n'
done < <(harness_md | xargs grep -rhoE \
  '\.claude/(rules|skills|hooks|agents)/[A-Za-z0-9_/.-]+\.(md|sh)' \
  2>/dev/null | sort -u)
if [ -n "$missing_refs" ]; then
  echo "[harness] FAIL: harness file(s) reference a path that does not exist:" >&2
  printf '%s' "$missing_refs" >&2
  fail=1
else
  echo "[harness] all concrete rule/skill/hook/agent/doc references resolve"
fi

# --- Check 7b: every rule's paths: glob matches at least one file ---
# A glob matching nothing means the rule never attaches, and nothing else notices.
# Untracked files that are not ignored count, so a rule and the files it governs can
# land together. A glob under a gitignored tree (a companion checkout reached by a
# symlink) is exempt: that tree is never in the index, so it matches nothing here by
# design.
dead_globs=""
for f in .claude/rules/*.md; do
  [ -f "$f" ] || continue
  fm=$(awk 'NR==1&&/^---[[:space:]]*$/{f=1;next} f&&/^---[[:space:]]*$/{exit} f{print}' "$f")
  globs=$(printf '%s\n' "$fm" | sed -n 's/^[[:space:]]*-[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p')
  while IFS= read -r glob; do
    [ -n "$glob" ] || continue
    lead=${glob%%/*}
    if [ "$lead" != "$glob" ] && git check-ignore -q --no-index -- "$lead" 2>/dev/null; then
      continue
    fi
    if [ -z "$(git ls-files --cached --others --exclude-standard -- ":(glob)$glob" 2>/dev/null | head -n 1)" ]; then
      dead_globs="${dead_globs}  ${f}: ${glob}"$'\n'
    fi
  done <<<"$globs"
done
if [ -n "$dead_globs" ]; then
  echo "[harness] FAIL: rule paths: glob(s) matching no file, so the rule never attaches:" >&2
  printf '%s' "$dead_globs" >&2
  fail=1
else
  echo "[harness] every rule paths: glob matches a file"
fi

# --- Check 8: the allow list never regains a mutation-capable command head ---
# The read-only auto-approve hook covers the safe forms of these commands, so an
# allow entry buys nothing and reopens the hole.
allow_bad=$(jq -r '(.permissions.allow // [])[]' "$SETTINGS" 2>/dev/null \
  | grep -E "$MUTATION_HEAD_RE" || true)
if [ -n "$allow_bad" ]; then
  echo "[harness] FAIL: mutation-capable or unscoped allow entr(y/ies):" >&2
  printf '  %s\n' "$allow_bad" >&2
  fail=1
else
  echo "[harness] allow list carries no mutation-capable heads or unscoped WebFetch"
fi

# --- Check 9: no harness file cites a memory-store path ---
# The memory store is machine-local and prunable; a rule or skill depending on a
# memory entry either needs the fact promoted into the repo or stated inline.
memory_refs=$(harness_md | xargs grep -lE '(^|[^A-Za-z0-9_./-])memory/[A-Za-z0-9_-]+\.md' 2>/dev/null || true)
if [ -n "$memory_refs" ]; then
  echo "[harness] FAIL: harness file(s) reference a memory-store entry (promote the fact or state it inline):" >&2
  ( IFS=$'\n'; printf '  %s\n' $memory_refs >&2 )
  fail=1
else
  echo "[harness] no harness file references a memory-store path"
fi

# --- Check 10: the hook fixture suite passes ---
# Existence and executability (Check 2) do not prove a guard still makes the right
# decision. The fixtures pipe synthetic tool events through each hook and assert the
# permission decision, so a regression in a guard or the read-only auto-approver
# (a reopened bypass, an over-block) fails the build here.
if [ "$SKIP_HOOK_FIXTURES" -eq 1 ]; then
  echo "[harness] hook fixture suite not run here: the caller runs it as its own gate"
elif [ -x scripts/ci/test_hooks.sh ]; then
  # Captured rather than discarded. The suite is silent on success and prints one
  # self-contained line per failing fixture, naming the hook, the command and the
  # decision it wanted, so re-showing it costs nothing on a green run and is the
  # whole diagnosis on a red one. Sending it to /dev/null and telling the reader
  # to re-run it by hand threw away the answer that was already in hand.
  if hook_output="$(scripts/ci/test_hooks.sh 2>&1)"; then
    echo "[harness] hook fixture suite passes"
  else
    echo "[harness] FAIL: hook fixture suite (scripts/ci/test_hooks.sh) failed:" >&2
    printf '%s\n' "$hook_output" | sed 's/^/  /' >&2
    fail=1
  fi
else
  echo "[harness] FAIL: scripts/ci/test_hooks.sh missing or not executable" >&2
  fail=1
fi

# --- Check 11: the machine-local settings file holds no saved allow or ask rules ---
check_local_settings

# --- Check 12: agent frontmatter hooks resolve and mirror the settings Bash chain ---
# A custom agent with Bash declares the guard chain in its own frontmatter so it stays
# protected on a client version that does not fire settings hooks inside subagents.
# That chain drifts silently when a hook is added to settings.json but not the agent
# (or vice versa), and a typo'd frontmatter path never fires at all.
agent_bad=""
settings_chain=$(jq -r '(.hooks.PreToolUse // [])[] | select(.matcher=="Bash") | .hooks[].command' "$SETTINGS" 2>/dev/null | sed 's#.*/##')
for f in .claude/agents/*.md; do
  [ -f "$f" ] || continue
  fm=$(awk 'NR==1&&/^---[[:space:]]*$/{f=1;next} f&&/^---[[:space:]]*$/{exit} f{print}' "$f")
  cmds=$(printf '%s\n' "$fm" | grep -E '^[[:space:]]*command:' | sed 's/^[[:space:]]*command:[[:space:]]*//; s/"//g')
  while IFS= read -r cmd; do
    [ -n "$cmd" ] || continue
    path=${cmd#\$CLAUDE_PROJECT_DIR/}
    if [ ! -f "$path" ] || [ ! -x "$path" ]; then
      agent_bad="${agent_bad}  ${f}: hook missing or not executable: ${path}"$'\n'
    fi
  done <<<"$cmds"
  if grep -qE '^[[:space:]]*-[[:space:]]*Bash[[:space:]]*$|^tools:.*[[:space:],]Bash([[:space:],]|$)' <<< "$fm"; then
    agent_chain=$(printf '%s\n' "$cmds" | sed 's#.*/##')
    if [ "$agent_chain" != "$settings_chain" ]; then
      agent_bad="${agent_bad}  ${f}: frontmatter Bash hook chain differs from the settings.json Bash chain"$'\n'
    fi
  fi
done
if [ -n "$agent_bad" ]; then
  echo "[harness] FAIL: agent frontmatter hook problem(s):" >&2
  printf '%s' "$agent_bad" >&2
  fail=1
else
  echo "[harness] agent frontmatter hooks resolve and mirror the settings Bash chain"
fi

# --- Check 13: every project MCP server starts with its committed config ---
# A server that dies at startup shows only as "connection closed" in a
# session, and every session after it loses the tool without anyone being
# told. Start each server exactly as .mcp.json does and
# require an answer to the MCP initialize handshake. A checkout without the
# server installed (the CI harness job installs no packages) skips with a note.
mcp_init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"harness","version":"1"}}}'
mcp_bad=""
for server in $(jq -r '.mcpServers | keys[]' .mcp.json); do
  cmd=$(jq -r --arg s "$server" '.mcpServers[$s].command' .mcp.json)
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[harness] note: MCP server $server not installed here ($cmd); start check skipped"
    continue
  fi
  mapfile -t args < <(jq -r --arg s "$server" '.mcpServers[$s].args[]?' .mcp.json)
  mcp_reply=$(printf '%s\n' "$mcp_init" \
    | timeout 30 "$cmd" "${args[@]}" 2>/dev/null || true)
  if ! grep -q '"serverInfo"' <<< "$mcp_reply"; then
    mcp_bad+="  $server did not answer the initialize handshake; start it by hand to see why"$'\n'
  fi
done
if [ -n "$mcp_bad" ]; then
  echo "[harness] FAIL: project MCP server(s) do not start:" >&2
  printf '%s' "$mcp_bad" >&2
  fail=1
else
  echo "[harness] project MCP servers start and answer"
fi

# --- Check 14: every maintainer-gated command is also an ask rule ---
# guard-maintainer-gate.sh denies a gated command once so Claude says why, then leaves
# the reissue to the permissions.ask entry it copies. A gated entry missing from the ask
# list would let the reissue run unprompted, so the ask list must stay the floor. A tree
# without the hook skips this with a note; the wired-hooks check catches a hook that
# settings.json wires but the tree lacks.
GATE_HOOK=".claude/hooks/guard-maintainer-gate.sh"
if [ -f "$GATE_HOOK" ]; then
  gate_rules=$(grep -oE "^  'Bash\(.*\)'$" "$GATE_HOOK" | sed -E "s/^  '(.*)'$/\1/" || true)
  ask_rules=$(jq -r '(.permissions.ask // [])[]' "$SETTINGS")
  gate_missing=$(printf '%s\n' "$gate_rules" | grep -v '^$' | grep -vxF -f <(printf '%s\n' "$ask_rules") || true)
fi
if [ ! -f "$GATE_HOOK" ]; then
  echo "[harness] note: $GATE_HOOK absent; maintainer-gate ask check skipped"
elif [ -z "$gate_rules" ]; then
  echo "[harness] FAIL: no gated rules found in $GATE_HOOK" >&2
  fail=1
elif [ -n "$gate_missing" ]; then
  echo "[harness] FAIL: $GATE_HOOK gates rule(s) missing from permissions.ask in $SETTINGS:" >&2
  ( IFS=$'\n'; printf '  %s\n' $gate_missing >&2 )
  fail=1
else
  echo "[harness] every maintainer-gated command is an ask rule"
fi

if [ "$fail" -ne 0 ]; then
  echo "[harness] FAIL: one or more harness checks failed." >&2
  exit 1
fi
echo "[harness] pass"
