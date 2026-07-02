#!/usr/bin/env bash
# Fixture tests for the PreToolUse guard hooks: pipe a synthetic tool event into a
# hook exactly as Claude Code would and assert the permission decision it emits.
# "defer" means the hook stays silent (exit 0, no decision) and the normal
# permission flow decides. Aggregates failures and exits non-zero if any fixture
# mismatches. Currently covers guard-secret-reads.sh; extend with fixtures for the
# sibling guards as they change.
set -uo pipefail
cd "$(dirname "$0")/../.."

fail=0

# expect <hook-file> <command-string> <deny|ask|allow|defer>
expect() {
  local hook="$1" cmd="$2" want="$3" out decision rc
  out="$(printf '{"tool_input":{"command":%s}}' "$(printf '%s' "$cmd" | jq -Rs .)" \
    | ".claude/hooks/$hook")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "[hooks] FAIL ($hook): errored (exit $rc) on: $cmd" >&2
    fail=1
    return
  fi
  if [ -z "$out" ]; then
    decision="defer"
  else
    decision="$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "defer"')"
  fi
  if [ "$decision" != "$want" ]; then
    echo "[hooks] FAIL ($hook): want $want, got $decision: $cmd" >&2
    fail=1
  fi
}

H=guard-secret-reads.sh

# Secret-bearing reads and writes must be denied.
expect "$H" 'cat .env' deny
expect "$H" 'head -3 ./.env' deny
expect "$H" 'cat .env.production' deny
expect "$H" 'cat *.env' deny
expect "$H" 'echo X > .env' deny
expect "$H" 'base64 secrets/api.json' deny
expect "$H" 'cat ~/.ssh/id_rsa' deny
expect "$H" 'cat /home/user/.ssh/config' deny
expect "$H" 'openssl rsa -in server.key' deny
expect "$H" 'cat ~/.aws/credentials' deny
expect "$H" 'cat terraform.tfstate' deny
expect "$H" 'cat ~/.npmrc' deny

# Harmless commands that merely resemble secret references must defer.
expect "$H" 'cat .env.example' defer
expect "$H" 'grep -rn "process.env.FOO" src/' defer
expect "$H" "node -e 'Object.keys(o)'" defer
expect "$H" "jq '.key' package.json" defer
expect "$H" 'ls -la src' defer
expect "$H" 'git status' defer
expect "$H" 'npm run build' defer

H=guard-db-destructive.sh

# Writable or destructive SQLite must ask; read-only queries must defer.
expect "$H" 'sqlite3 database/footbag.db "DROP TABLE members"' ask
expect "$H" 'sqlite3 database/footbag.db "DELETE FROM members WHERE id=1"' ask
expect "$H" 'sqlite3 database/footbag.db "INSERT INTO t VALUES (1)"' ask
expect "$H" "sqlite3 -readonly database/footbag.db \"ATTACH 'other.db' AS o\"" ask
expect "$H" "sqlite3 -readonly database/footbag.db \"ATTACH DATABASE 'other.db' AS o\"" ask
expect "$H" 'rm database/footbag.db' ask
expect "$H" 'sqlite3 -readonly database/footbag.db "SELECT COUNT(*) FROM members"' defer
expect "$H" 'sqlite3 -readonly database/footbag.db ".tables"' defer

H=guard-readonly-bash.sh

# Writes hidden behind read-only command heads must ask.
expect "$H" 'echo x > notes.txt' ask
expect "$H" 'printf "%s" x >> notes.txt' ask
expect "$H" 'awk "{print}" a.txt > b.txt' ask
expect "$H" 'jq . a.json > b.json' ask
expect "$H" 'cat a.txt >> b.txt' ask
expect "$H" 'find . -name "*.bak" -delete' ask
expect "$H" 'sort -o out.txt in.txt' ask
expect "$H" 'curl -X POST https://example.com' ask
expect "$H" 'curl -d @payload https://example.com' ask

# Plain reads and pipelines with no file write must defer.
expect "$H" 'grep -rn "foo" src/' defer
expect "$H" 'echo hello' defer
expect "$H" 'cat a.txt | wc -l' defer
expect "$H" 'find src -name "*.ts"' defer

if [ "$fail" -ne 0 ]; then
  echo "[hooks] FAIL: one or more hook fixtures failed." >&2
  exit 1
fi
echo "[hooks] pass"
