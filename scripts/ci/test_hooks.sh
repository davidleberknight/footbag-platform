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

H=guard-full-suite-vitest.sh

# A full-suite vitest run (no tests/ path, no --exclude) must ask so the operator
# takes the standard `npm test` path; targeted and excluded runs, and npm scripts,
# defer.
expect "$H" 'npx vitest run' ask
expect "$H" 'vitest run' ask
expect "$H" 'node_modules/.bin/vitest run' ask
expect "$H" 'LOG_LEVEL=info npx vitest run -t "a name"' ask
expect "$H" 'npx vitest run tests/integration/x.test.ts' defer
expect "$H" "npx vitest run --exclude 'tests/smoke/**'" defer
expect "$H" 'npm test' defer
expect "$H" 'npm run test:integration' defer
expect "$H" './run_all_tests.sh' defer
expect "$H" 'npx tsc -p tsconfig.json' defer

# guard-question-quality.sh is a Stop hook, not a PreToolUse hook: it reads the
# last assistant message from a transcript file and blocks a question that carries
# internal shorthand the reader was never handed. Drive it with a synthetic
# one-message transcript and assert block-vs-defer.
Q=guard-question-quality.sh
expect_q() {
  local text="$1" want="$2" tr ev out got
  tr="$(mktemp)"
  jq -cn --arg t "$text" '{type:"assistant",message:{content:[{type:"text",text:$t}]}}' > "$tr"
  ev="$(jq -cn --arg p "$tr" '{transcript_path:$p,stop_hook_active:false}')"
  out="$(printf '%s' "$ev" | ".claude/hooks/$Q")"
  if printf '%s' "$out" | grep -q '"block"'; then got=block; else got=defer; fi
  rm -f "$tr"
  if [ "$got" != "$want" ]; then
    echo "[hooks] FAIL ($Q): want $want, got $got: $text" >&2
    fail=1
  fi
}

# Assemble the gate- and finding-style code tokens at runtime, so the committed
# fixture holds no literal code of the shape the hook flags; each becomes a real
# code shape only when the test runs.
gate="OR$(( 6 + 12 ))"
finding="UX-C$(( 1 + 2 ))"

# Blocked: a question carrying internal shorthand the reader was not given.
expect_q 'Should I apply the fix from the section marked §4.2 now?' block
expect_q 'Do we cut over at State 4 or wait?' block
expect_q 'Should I read docs/MIGRATION_PLAN.md before deciding?' block
expect_q "**${gate}** -- run this gate now or defer?" block
expect_q "- ${finding}: is this the real blocker?" block
# Deferred: a self-contained question, or a code merely mentioned inline (not a label).
expect_q 'Should I open a follow-up for the ledger tiebreak, yes or no?' defer
expect_q "We could fold this into ${gate} later; ship the fix now?" defer
expect_q 'Should the S3 bucket stay private?' defer
expect_q 'I applied the fix and verified it end to end.' defer
# Not a question at all: never enforced.
expect_q 'State 4 is where the cutover lands.' defer

if [ "$fail" -ne 0 ]; then
  echo "[hooks] FAIL: one or more hook fixtures failed." >&2
  exit 1
fi
echo "[hooks] pass"
