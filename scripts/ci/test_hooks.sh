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

# sed writing or executing without -i: w/W write-command, s///w write-flag, e exec.
expect "$H" 'sed -i "s/a/b/" f.txt' ask
expect "$H" 'sed --in-place "s/a/b/" f.txt' ask
expect "$H" "sed -n 'w out.txt' f.txt" ask
expect "$H" "sed 's/a/b/w out.txt' f.txt" ask
expect "$H" "sed '3e touch x' f.txt" ask
# tree writing to a file.
expect "$H" 'tree -o out.txt src' ask
expect "$H" 'tree --output out.txt src' ask
# sed in-place in attached / bundled spellings the -i prefix rule misses.
expect "$H" 'sed -i.bak "s/a/b/" f.txt' ask
expect "$H" "sed -i's/a/b/' f.txt" ask
expect "$H" "sed -ni 's/a/b/' f.txt" ask
expect "$H" 'sed --in-place=bak "s/a/b/" f' ask

# Plain reads and pipelines with no file write must defer.
expect "$H" 'grep -rn "foo" src/' defer
expect "$H" 'echo hello' defer
expect "$H" 'cat a.txt | wc -l' defer
expect "$H" 'find src -name "*.ts"' defer
# Read-only sed transforms (print, substitute-to-stdout) are not a write.
expect "$H" "sed -n '1,5p' f.txt" defer
expect "$H" "sed 's/a/b/g' f.txt" defer
expect "$H" "sed 's/w/x/' f.txt" defer

H=guard-find-exec.sh

# find running a command per match — -exec/-execdir and interactive -ok/-okdir — is
# hard-denied; a plain read-only find defers.
expect "$H" 'find . -exec rm {} \;' deny
expect "$H" 'find . -execdir rm {} \;' deny
expect "$H" 'find . -ok rm {} \;' deny
expect "$H" 'find . -okdir rm {} \;' deny
expect "$H" 'find src -name "*.ts"' defer
expect "$H" 'find . -delete' defer

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

H=allow-readonly-bash.sh

# Plain read-only commands, pipelines, and loops auto-approve.
expect "$H" 'grep -rn "foo" src/' allow
expect "$H" 'cat a.txt | wc -l' allow
expect "$H" 'find footbag.org -path "*/backups/latest.sql"' allow
expect "$H" 'for f in a b c; do cat "$f"; done' allow
expect "$H" 'git status' allow

# Read-only command substitution auto-approves (the case that regressed to a prompt).
expect "$H" 'echo "size $(wc -c < f.txt)"' allow
expect "$H" 'cat "$(dirname "$p")/x"' allow
expect "$H" 'grep foo "$(git rev-parse --show-toplevel)/README.md"' allow

# Substitution hiding a write or a non-read-only head must NOT auto-approve (defer;
# a substitution-hidden rm is not matched by the settings rm ask-rule, so this bail
# is load-bearing).
expect "$H" 'echo "$(rm -rf x)"' defer
expect "$H" 'X=$(git push) echo done' defer
expect "$H" 'echo "$(cat a > b)"' defer
expect "$H" 'echo "$(a $(b))"' defer
expect "$H" 'echo "$((1 + 2))"' defer
expect "$H" 'echo "$(grep -E "(a|b)" f)"' defer

# Top-level writes and mutating heads still fall through (sibling guards ask/deny).
expect "$H" 'echo x > notes.txt' defer
expect "$H" 'rm file.txt' defer

# A backslash-escaped quote must NOT open a phantom quoted region that swallows a
# following separator; the real command after it has to be vetted (and fall through).
# `grep "a\"; rm x"` is genuinely one quoted argument and stays read-only.
expect "$H" 'grep foo\" ; rm x' defer
expect "$H" 'grep foo\" ; ./evil.sh' defer
expect "$H" 'cat a\" && bash evil.sh' defer
expect "$H" 'grep "a\"; rm x"' allow

# In-place sed in any spelling is a write and must fall through (guard then asks).
expect "$H" 'sed -i.bak "s/a/b/" f.txt' defer
expect "$H" "sed -ni 's/a/b/' f.txt" defer
# ...while a read-only sed transform still auto-approves.
expect "$H" "sed -n '1,5p' f.txt" allow
expect "$H" "sed 's/a/b/g' f.txt" allow

# Command-runner heads must NOT auto-approve the command they run: env/command exec
# their argument, so a prefix rule never sees the real head. These must fall through.
expect "$H" 'env rm -rf /tmp/x' defer
expect "$H" 'command rm -rf /tmp/x' defer
# A read-only wrapper is stripped and the wrapped command is vetted, so a wrapped
# read-only command still auto-approves and a wrapped mutation still falls through.
expect "$H" 'timeout 30 grep -rn foo src/' allow
expect "$H" 'nice grep foo f' allow
expect "$H" 'nice -n 10 grep foo f' allow
expect "$H" 'time grep foo f' allow
expect "$H" 'command ls -la' allow
expect "$H" 'command -v git' allow
expect "$H" 'command -V cat' allow

# Write via a file operand on an otherwise read-only head must fall through.
expect "$H" 'uniq in.txt out.txt' defer
expect "$H" 'xxd a.bin out.bin' defer
expect "$H" 'tree -o out.txt src' defer
# ...while their read-only forms still auto-approve.
expect "$H" 'uniq in.txt' allow
expect "$H" 'uniq -c sorted.txt' allow
expect "$H" 'tree src' allow

# Exec/write flags riding mid-arguments on a read-only git subcommand or ripgrep
# must fall through (a prefix rule cannot see them): --output writes, --upload-pack /
# --open-files-in-pager / rg --pre execute a command.
expect "$H" 'git log --output=/tmp/pwned -1' defer
expect "$H" 'git ls-remote --upload-pack=touch repo' defer
expect "$H" 'git grep --open-files-in-pager=touch foo' defer
expect "$H" 'rg --pre=/tmp/evil.sh foo src/' defer
# ...while ordinary read-only git and rg still auto-approve.
expect "$H" 'git log --oneline -5' allow
expect "$H" 'git diff HEAD~1' allow
expect "$H" 'rg -n foo src/' allow

# Control constructs: a command hidden behind a conditional, grouping, or negation
# is still vetted (must not skip a mutation), while a read-only conditional allows.
expect "$H" 'if [[ -f x ]]; then echo hi; else echo bye; fi' allow
expect "$H" 'if grep -q foo f; then echo yes; fi' allow
expect "$H" '( grep foo x )' allow
expect "$H" '( rm -rf x )' defer
expect "$H" '{ rm x; }' defer
expect "$H" '! rm x' defer
expect "$H" 'case $x in a) rm y;; esac' defer
expect "$H" 'if rm x; then echo hi; fi' defer

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
