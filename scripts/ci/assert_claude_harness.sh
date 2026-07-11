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
set -uo pipefail
cd "$(dirname "$0")/../.."

fail=0
self="scripts/ci/assert_claude_harness.sh"
SETTINGS=".claude/settings.json"

# Harness prose files scanned for path references (concrete, single-file paths only).
harness_md() {
  { echo CLAUDE.md
    echo PROJECT_SUMMARY_CONCISE.md
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
DELETED_DOCS='SERVICE_CATALOG\.md|VIEW_CATALOG\.md'
if refs=$(git grep -lE "$DELETED_DOCS" -- ":!$self" ':!exploration' 2>/dev/null); then
  echo "[harness] FAIL: reference(s) to a deleted doc (SERVICE_CATALOG.md / VIEW_CATALOG.md):" >&2
  printf '  %s\n' $refs >&2
  fail=1
else
  echo "[harness] no references to deleted docs"
fi

# --- Check 4: explicit-only skills carry disable-model-invocation ---
bad_invocation=""
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  fm=$(awk 'NR==1&&/^---[[:space:]]*$/{f=1;next} f&&/^---[[:space:]]*$/{exit} f{print}' "$f")
  if printf '%s' "$fm" | grep -qiE 'invoke only|only when the user explicitly|only on explicit'; then
    if ! printf '%s' "$fm" | grep -qE '^disable-model-invocation:[[:space:]]*true'; then
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

# --- Check 5: each SKILL.md stays under the line ceiling or has a supporting reference file ---
CEILING=500
bad_size=""
for f in .claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f")
  dir=$(dirname "$f")
  supporting=$(find "$dir" -maxdepth 1 -name '*.md' ! -name 'SKILL.md' | head -1)
  if [ "$lines" -gt "$CEILING" ] && [ -z "$supporting" ]; then
    bad_size="${bad_size}  ${f} (${lines} lines, no supporting reference file)"$'\n'
  fi
done
if [ -n "$bad_size" ]; then
  echo "[harness] FAIL: SKILL.md over ${CEILING} lines without a supporting file:" >&2
  printf '%s' "$bad_size" >&2
  fail=1
else
  echo "[harness] all SKILL.md within ${CEILING} lines or backed by a supporting file"
fi

# --- Check 6: sqlite3 is never auto-allowed without -readonly ---
sqlite_bad=$(jq -r '(.permissions.allow // [])[]' "$SETTINGS" 2>/dev/null \
  | grep -iE 'sqlite3' | grep -v -- '-readonly' || true)
if [ -n "$sqlite_bad" ]; then
  echo "[harness] FAIL: sqlite3 allowed without -readonly:" >&2
  printf '  %s\n' $sqlite_bad >&2
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

# --- Check 8: the allow list never regains a mutation-capable command head ---
# xargs/find/echo/awk/sed can delete or write files despite reading in their common
# form (xargs rm, find -delete, echo > f, awk/sed program-text writes), and
# WebFetch(domain:*) means every domain. The read-only auto-approve hook covers the
# safe forms of these commands, so an allow entry buys nothing and reopens the hole.
allow_bad=$(jq -r '(.permissions.allow // [])[]' "$SETTINGS" 2>/dev/null \
  | grep -E '^Bash\((xargs|find|echo|awk|sed)([: *)]|$)|^WebFetch\(domain:\*\)$' || true)
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
  printf '  %s\n' $memory_refs >&2
  fail=1
else
  echo "[harness] no harness file references a memory-store path"
fi

# --- Check 10: the hook fixture suite passes ---
# Existence and executability (Check 2) do not prove a guard still makes the right
# decision. The fixtures pipe synthetic tool events through each hook and assert the
# permission decision, so a regression in a guard or the read-only auto-approver
# (a reopened bypass, an over-block) fails the build here.
if [ -x scripts/ci/test_hooks.sh ]; then
  if scripts/ci/test_hooks.sh >/dev/null 2>&1; then
    echo "[harness] hook fixture suite passes"
  else
    echo "[harness] FAIL: hook fixture suite (scripts/ci/test_hooks.sh) failed; run it directly for detail" >&2
    fail=1
  fi
else
  echo "[harness] FAIL: scripts/ci/test_hooks.sh missing or not executable" >&2
  fail=1
fi

# --- Check 11: the machine-local settings file carries no dangerous broad allow ---
# settings.local.json is gitignored and per-developer, so it is absent in CI and this check
# runs only where the file exists (a developer's machine). It is where "always allow" clicks
# accumulate, so it is exactly where an un-readonly sqlite3, an interpreter/shell wildcard
# (effectively Bash(*)), or a broad container-exec allow hides from the committed-file checks.
LOCAL=".claude/settings.local.json"
if [ -f "$LOCAL" ] && jq empty "$LOCAL" >/dev/null 2>&1; then
  local_allows=$(jq -r '(.permissions.allow // [])[]' "$LOCAL" 2>/dev/null)
  local_bad=$( {
    printf '%s\n' "$local_allows" | grep -iE 'sqlite3' | grep -iv -- '-readonly'
    printf '%s\n' "$local_allows" | grep -E '^Bash\((xargs|find|echo|awk|sed)([: *)]|$)'
    printf '%s\n' "$local_allows" | grep -E '^Bash\((python3?|node|nodejs|ruby|perl|bash|sh|zsh|deno|bun|npx|cd|eval|exec)([[:space:]:]\*)?\)$'
    printf '%s\n' "$local_allows" | grep -E '^Bash\(docker[[:space:]]+(run|exec|cp)([[:space:]]|\*)'
    printf '%s\n' "$local_allows" | grep -E '^WebFetch\(domain:\*\)$'
  } 2>/dev/null | grep -v '^[[:space:]]*$' | sort -u || true )
  if [ -n "$local_bad" ]; then
    echo "[harness] FAIL: $LOCAL carries dangerous broad allow(s) — promote a safe scoped rule to $SETTINGS, or delete:" >&2
    printf '  %s\n' $local_bad >&2
    fail=1
  else
    echo "[harness] $LOCAL carries no dangerous broad allow"
  fi
else
  echo "[harness] $LOCAL absent or empty (nothing to scan)"
fi

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
  if printf '%s\n' "$fm" | grep -qE '^[[:space:]]*-[[:space:]]*Bash[[:space:]]*$|^tools:.*[[:space:],]Bash([[:space:],]|$)'; then
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

if [ "$fail" -ne 0 ]; then
  echo "[harness] FAIL: one or more harness checks failed." >&2
  exit 1
fi
echo "[harness] pass"
