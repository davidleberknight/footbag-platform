#!/usr/bin/env bash
# Fixture tests for the PreToolUse guard hooks: pipe a synthetic tool event into a
# hook exactly as Claude Code would and assert the permission decision it emits.
# "defer" means the hook stays silent (exit 0, no decision) and the normal
# permission flow decides. Aggregates failures and exits non-zero if any fixture
# mismatches. Covers the Bash-command guards (command-style events), the Edit/Write
# secret-file guard (file_path-style events), and the Stop-hook question gate.
set -uo pipefail
cd "$(dirname "$0")/../.."

# The read-only approver accepts `git -C` only for the project directory or a path
# under it; a live session sets this, so default it here for direct and CI runs.
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

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

SETTINGS=".claude/settings.json"

# expect_chain_deny <command>: pipe the command through EVERY Bash PreToolUse hook
# wired in settings.json, in order, and assert at least one returns `deny`. Because
# deny is the most-restrictive decision and always wins the harness merge, one deny
# means the whole chain denies. This pins the cross-guard outcome that a single-hook
# fixture cannot: the read-only approver treats `cd` as a read-only head and would
# ALLOW `cd src && ls`, so only running the full chain proves guard-leading-cd's deny
# overrides that and the command is blocked end to end.
expect_chain_deny() {
  local cmd="$1" any_deny=0 hook path out decision event
  event="$(printf '{"tool_input":{"command":%s}}' "$(printf '%s' "$cmd" | jq -Rs .)")"
  while IFS= read -r hook; do
    [ -n "$hook" ] || continue
    path="${hook#\"\$CLAUDE_PROJECT_DIR\"/}"
    [ -x "$path" ] || continue
    out="$(printf '%s' "$event" | "./$path" 2>/dev/null)" || true
    [ -n "$out" ] || continue
    decision="$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "defer"')"
    [ "$decision" = deny ] && any_deny=1
  done < <(jq -r '.hooks.PreToolUse[] | select(.matcher=="Bash") | .hooks[].command' "$SETTINGS")
  if [ "$any_deny" -ne 1 ]; then
    echo "[hooks] FAIL (chain): expected a deny somewhere in the Bash chain for: $cmd" >&2
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
expect "$H" 'cat ~/.netrc' deny
expect "$H" 'cat ~/.git-credentials' deny
expect "$H" 'cat ~/.pgpass' deny
expect "$H" 'cat ~/.docker/config.json' deny
expect "$H" 'cat ~/.kube/config' deny
# Quote/backslash token-splitting must not slip a secret read past the guard.
expect "$H" "cat .e''nv" deny
expect "$H" 'cat .en\v' deny

# Harmless commands that merely resemble secret references must defer.
expect "$H" 'cat .env.example' defer
expect "$H" 'grep -rn "process.env.FOO" src/' defer
expect "$H" "node -e 'Object.keys(o)'" defer
expect "$H" "jq '.key' package.json" defer
expect "$H" 'ls -la src' defer
expect "$H" 'git status' defer
expect "$H" 'npm run build' defer

# expect_file <hook-file> <file-path> <deny|ask|allow|defer>: same assertion as
# expect, but the synthetic event carries tool_input.file_path (an Edit/Write
# event), which is what the file-matcher hooks read.
expect_file() {
  local hook="$1" path="$2" want="$3" out decision rc
  out="$(printf '{"tool_input":{"file_path":%s}}' "$(printf '%s' "$path" | jq -Rs .)" \
    | ".claude/hooks/$hook")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "[hooks] FAIL ($hook): errored (exit $rc) on: $path" >&2
    fail=1
    return
  fi
  if [ -z "$out" ]; then
    decision="defer"
  else
    decision="$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "defer"')"
  fi
  if [ "$decision" != "$want" ]; then
    echo "[hooks] FAIL ($hook): want $want, got $decision: $path" >&2
    fail=1
  fi
}

H=block-secrets.sh

# Editing a secret-bearing or private-local file inside the project is hard-denied.
expect_file "$H" "$CLAUDE_PROJECT_DIR/.env" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/.env.staging" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/server.key" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/certs/tls.pem" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/secrets/api.json" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/.npmrc" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/terraform/staging/terraform.tfstate" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/terraform.tfstate.backup" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/.aws/credentials" deny
expect_file "$H" "$CLAUDE_PROJECT_DIR/.ssh/id_rsa" deny
# The checked-in placeholder templates and ordinary project files defer, as does a
# path outside the project (other layers own out-of-tree policy) and a command-style
# event with no file_path at all.
expect_file "$H" "$CLAUDE_PROJECT_DIR/.env.example" defer
expect_file "$H" "$CLAUDE_PROJECT_DIR/src/app.ts" defer
expect_file "$H" "$CLAUDE_PROJECT_DIR/docs/README.md" defer
expect_file "$H" "/etc/passwd" defer
expect "$H" 'cat .env' defer

H=block-git-mutations.sh

# The staging/commit/push/pull mutations are hard-denied, including behind a git global
# option (git -C DIR commit, git -c k=v commit); read-only git defers.
expect "$H" 'git add -A' deny
expect "$H" 'git commit -m x' deny
expect "$H" 'git push origin main' deny
expect "$H" 'git pull' deny
expect "$H" 'git -C . commit -m x' deny
expect "$H" 'git -c user.email=e@x commit -m x' deny
expect "$H" 'git --git-dir=/tmp/g push' deny
expect "$H" 'git status' defer
expect "$H" 'git log --oneline' defer
expect "$H" 'git diff HEAD' defer

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

# Executing the reset script asks; merely naming its path to a read-only command defers.
expect "$H" 'bash scripts/reset-local-db.sh' ask
expect "$H" './scripts/reset-local-db.sh --reset' ask
expect "$H" 'scripts/reset-local-db.sh' ask
expect "$H" 'FOOTBAG_DB_PATH=/tmp/x.db scripts/reset-local-db.sh' ask
expect "$H" 'npm run build && bash scripts/reset-local-db.sh' ask
expect "$H" 'sh scripts/reset-local-db.sh; echo done' ask
expect "$H" 'git log --oneline -- scripts/reset-local-db.sh' defer
expect "$H" 'cat scripts/reset-local-db.sh' defer
expect "$H" 'grep -n reset scripts/reset-local-db.sh' defer
expect "$H" 'wc -l scripts/reset-local-db.sh' defer
expect "$H" 'diff scripts/reset-local-db.sh scripts/deploy-local-data.sh' defer

H=guard-dangerous-git.sh

# Executing a destructive git verb asks; a read-only mention of it defers.
expect "$H" 'git reset --hard HEAD~1' ask
expect "$H" 'foo && git reset --hard' ask
expect "$H" 'git restore src/' ask
expect "$H" 'git checkout -- src/app.ts' ask
expect "$H" 'git branch -D feature' ask
expect "$H" 'git clean -fd' ask
expect "$H" 'echo git restore drops local edits' defer
expect "$H" 'echo "run git reset --hard to undo"' defer
expect "$H" 'grep -rn "git reset --hard" docs' defer
expect "$H" 'git log --oneline -20' defer
# A command-running or file-writing git flag on ANY subcommand asks -- notably git fetch,
# which is a static allow yet shell-execs via --upload-pack; a plain fetch and a read-only
# mention still defer.
expect "$H" 'git fetch --upload-pack=/tmp/evil.sh repo' ask
expect "$H" 'git fetch --upload-pack="touch /tmp/x; git-upload-pack" origin' ask
expect "$H" 'git ls-remote --receive-pack=cmd repo' ask
expect "$H" 'git grep --open-files-in-pager=cmd foo' ask
expect "$H" 'git log --output=/tmp/f -1' ask
expect "$H" 'git fetch origin' defer
expect "$H" 'git fetch --depth=1 origin main' defer
expect "$H" 'echo "run git fetch --upload-pack=x to exploit"' defer

H=guard-prod-ops.sh

# Executing a prod-ops mutation asks; a read-only mention of it defers.
expect "$H" 'systemctl restart footbag' ask
expect "$H" 'sudo systemctl stop footbag' ask
expect "$H" 'foo && systemctl reload nginx' ask
expect "$H" 'echo "run systemctl restart footbag on production"' defer
expect "$H" 'grep -rn "systemctl restart" ops/systemd' defer
expect "$H" 'echo terraform apply to production' defer

H=guard-readonly-bash.sh

# Writes hidden behind read-only command heads must ask.
expect "$H" 'echo x > notes.txt' ask
expect "$H" 'printf "%s" x >> notes.txt' ask
expect "$H" 'awk "{print}" a.txt > b.txt' ask
expect "$H" 'jq . a.json > b.json' ask
expect "$H" 'cat a.txt >> b.txt' ask
expect "$H" 'find . -name "*.bak" -delete' ask
expect "$H" 'sort -o out.txt in.txt' ask
# A dangerous-flag token belonging to a DIFFERENT command than the guarded head -- past a
# ; & or | separator, or only argument text -- must not false-trigger: the span between a
# head and its flag cannot cross a command separator. A real flag in the head's own
# command still asks, including when the head follows a pipe.
expect "$H" 'echo "x sort y"; ls -o /tmp/z' defer
expect "$H" 'echo find here; grep -delete x' defer
expect "$H" 'sort -n -o out.txt in.txt' ask
expect "$H" 'ls | sort -o out.txt' ask
expect "$H" 'curl -X POST https://example.com' ask
expect "$H" 'curl -d @payload https://example.com' ask
# curl to a discard target (/dev/null, or - for stdout) is a read-only probe, not a
# write, and must defer; a real output filename still asks.
expect "$H" 'curl -sf -o /dev/null https://example.com/health' defer
expect "$H" 'curl -s -o - https://example.com' defer
expect "$H" 'curl -o report.json https://example.com' ask
# Redirecting a read-only command to the discard device writes nothing; a real file
# target still asks.
expect "$H" 'grep foo bar.txt > /dev/null' defer
# A read-only command redirecting into the AI session scratch directory writes only scratch,
# so it must defer, like /dev/null; a scratch path escaping via .. still asks.
expect "$H" 'grep foo src > /tmp/claude-1000/x/scratchpad/list.txt' defer
expect "$H" 'grep foo src > /tmp/claude-1000/x/../etc/o.txt' ask
# Only the scratchpad is exempt, not the whole /tmp/claude-* namespace: a /tmp/claude-* path
# without a scratchpad segment still asks (write must gate exactly where delete gates in guard-rm).
expect "$H" 'grep foo src > /tmp/claude-1000/notscratch.txt' ask
expect "$H" 'grep foo src > /tmp/claude-x' ask
expect "$H" 'grep foo f > /tmp/claude-1000scratchpad.txt' ask

# A write redirect must gate no matter which command head precedes it, because a static allow
# rule for that head (egrep, fgrep, date, pgrep, a read-only git subcommand) would otherwise
# auto-approve the write; the guard must not depend on a head list. Spacing after > is irrelevant.
expect "$H" 'egrep foo x > out.txt' ask
expect "$H" 'fgrep foo x > out.txt' ask
expect "$H" 'date > stamp.txt' ask
expect "$H" 'pgrep node > pids.txt' ask
expect "$H" 'git log > history.txt' ask
expect "$H" 'git show HEAD > commit.txt' ask
expect "$H" 'cat a.txt >out.txt' ask
# A real-file write alongside a /dev/null redirect still asks (the exempt target does not
# excuse the real one); fd duplications and a bare /dev/null write are not writes to gate.
expect "$H" 'cat a.txt > out.txt 2>/dev/null' ask
expect "$H" 'grep foo bar.txt >/dev/null' defer
expect "$H" 'grep foo bar.txt 2>&1' defer
expect "$H" 'ls -l >&2' defer
# A literal > inside a quoted argument is a search pattern, not a redirect: a read-only
# command must still defer. A real redirect alongside a quoted > still asks.
expect "$H" "grep -rn '=>' src" defer
expect "$H" "grep -rn '->' src" defer
expect "$H" "git log --grep='a>b'" defer
expect "$H" 'grep -rn "=>" src' defer
expect "$H" "grep -rn '=>' src > out.txt" ask
# A quoted string spanning lines (an inline SQL <> comparison, a node -e script with
# arrow functions) is argument text, not a redirect; a real redirect elsewhere in a
# multiline command still asks.
expect "$H" 'sqlite3 -readonly db.sqlite "SELECT
 a FROM t WHERE b<>2"' defer
expect "$H" 'node -e "
fetch(u).then(r=>r.text()).then(t=>console.log(t))"' defer
expect "$H" 'grep foo f
sort x > out.txt' ask
# A $-bearing quoted argument ("$DB") kept next to the double-quoted inline SQL must not
# desync quote pairing and expose the SQL's <> (or a bare < / >) as a phantom redirect: a
# read-only query still defers. A real redirect after them still asks, and a redirect hidden
# in a command substitution still asks (the $-region is left intact, so its > survives).
expect "$H" 'sqlite3 -readonly "$DB" "SELECT a FROM t WHERE x<>2"' defer
expect "$H" 'sqlite3 -readonly "$DB" "SELECT a FROM t WHERE c<3 AND d>1"' defer
expect "$H" 'sqlite3 -readonly "$DB" "SELECT 1" > out.txt' ask
expect "$H" 'echo "$(date > f.txt)"' ask
# A benign > (arrow, comparison) sharing ONE quoted region with a parameter expansion is
# still inert: the shell parses redirections before expanding a variable, so a value can
# never introduce one. A plain $x / ${n} / $HOME in the region must NOT force the arrow to
# be read as a redirect -- these defer.
expect "$H" 'echo "a -> b $x"' defer
expect "$H" 'echo "count ${n} -> done"' defer
expect "$H" 'echo "path=$HOME -> $PWD"' defer
expect "$H" 'echo "$user wrote a->b"' defer
# ...but a command substitution in the region runs a command, so a > stays gated (a real
# hidden redirect must be caught); a real redirect after a substitution, a backtick, and
# arithmetic all keep asking as the conservative, safe direction.
expect "$H" 'echo "a -> $(date)"' ask
expect "$H" 'echo "$(cat f)" > realfile.txt' ask
expect "$H" 'echo "a -> `date`"' ask
expect "$H" 'echo "$((3>2))"' ask

# sed writing or executing without -i: w/W write-command, s///w write-flag, e exec.
expect "$H" 'sed -i "s/a/b/" f.txt' ask
expect "$H" 'sed --in-place "s/a/b/" f.txt' ask
expect "$H" "sed -n 'w out.txt' f.txt" ask
expect "$H" "sed 's/a/b/w out.txt' f.txt" ask
expect "$H" "sed '3e touch x' f.txt" ask
# tree writing to a file.
expect "$H" 'tree -o out.txt src' ask
expect "$H" 'tree --output out.txt src' ask
# sort running an external program on its temp-file spill (--compress-program) is an exec
# vector, like sort -o is a write; a plain read-only sort still defers.
expect "$H" 'sort --compress-program=/tmp/evil.sh f' ask
expect "$H" 'sort -S1 --compress-program=id big.txt' ask
expect "$H" 'sort -u file.txt' defer
# curl writes one output file per URL, so a second real-file -o must ask even when an
# earlier -o discards to /dev/null; a lone discard probe still defers.
expect "$H" 'curl -o /dev/null http://localhost/a -o real.txt http://localhost/b' ask
expect "$H" 'curl --output /dev/null http://localhost/a --output real.txt http://localhost/b' ask
expect "$H" 'curl http://localhost/a -o real.txt http://localhost/b -o /dev/null' ask
expect "$H" 'curl -sf -o /dev/null http://localhost:3000/health' defer
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
# Quote- and backslash-obfuscated predicates must still be denied.
expect "$H" "find . '-exec' rm {} \;" deny
expect "$H" 'find . -exe\c rm {} \;' deny
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

H=guard-leading-cd.sh

# A command that begins with cd/pushd is denied so it gets rewritten with an absolute
# path or a directory flag; a leading cd even just inside a subshell paren is caught.
expect "$H" 'cd src && ls' deny
expect "$H" '  cd ..' deny
expect "$H" 'cd' deny
expect "$H" 'cd /tmp/x' deny
expect "$H" '(cd terraform/staging && terraform plan)' deny
expect "$H" '( cd x && ls )' deny
expect "$H" 'pushd src' deny
# Must NOT over-block: cd not at the start, a different head that merely starts "cd",
# or cd appearing only as an argument or match text, all defer.
expect "$H" 'ls src' defer
expect "$H" 'git -C /repo log' defer
expect "$H" 'grep -rn cd src/' defer
expect "$H" 'echo "cd later"' defer
expect "$H" 'cdb --version' defer
expect "$H" 'find . -name cd' defer
expect "$H" 'foo && cd x' defer

H=guard-shell-loop.sh

# A shell loop (while/for/until ... do) is denied so it gets rewritten as simple
# statically-analyzable commands or the Grep/Read tools; the loop makes the whole command
# un-analyzable and would otherwise trip the built-in approval prompt. A loop after a pipe
# (the common read-only-scan shape) is caught, not only a leading loop.
expect "$H" 'grep -n x f | while read -r l; do sed -n "${l}p" f; done' deny
expect "$H" 'for f in *.ts; do wc -l "$f"; done' deny
expect "$H" 'until curl -sf localhost; do sleep 1; done' deny
expect "$H" '(for f in a b; do echo "$f"; done)' deny
# Must NOT over-block: a loop keyword only as an argument, inside quotes, as part of a
# longer word, or a quoted separator+keyword with no `do`, all defer.
expect "$H" 'grep -w for file' defer
expect "$H" 'grep -rn "for " src/' defer
expect "$H" 'echo "while true"' defer
expect "$H" 'echo "a; while b"' defer
expect "$H" 'cat foreground.txt' defer
expect "$H" 'grep -n x file' defer
expect "$H" 'find . -name "*.ts" | sort | uniq' defer

H=guard-rm.sh

# rm that deletes ONLY files under the AI session scratchpad auto-approves (allow); flags
# and multiple scratch operands are fine.
expect "$H" 'rm /tmp/claude-1000/proj/sess/scratchpad/f.txt' allow
expect "$H" 'rm -rf /tmp/claude-1000/proj/sess/scratchpad/sub' allow
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/x /tmp/claude-1000/a/scratchpad/y' allow
expect "$H" 'rm -f /tmp/claude-1000/a/b/c/scratchpad/deep/file' allow
# Any rm that leaves scratch, could hide a target, or climbs out via .. must ask.
expect "$H" 'rm /etc/passwd' ask
expect "$H" 'rm -rf /' ask
expect "$H" 'rm file.txt' ask
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/../../../etc/passwd' ask
expect "$H" 'rm /tmp/claude-1000/a/notscratch/f' ask
expect "$H" 'rm -rf /tmp/claude-1000/a/scratchpad' ask
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/f /etc/x' ask
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/f; rm /etc/x' ask
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/f && rm /etc/y' ask
expect "$H" 'rm "$(echo /etc/passwd)"' ask
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/f > /etc/log' ask
expect "$H" 'rm' ask
# An embedded newline is a statement separator: a scratch-scoped rm line must not smuggle a
# second command (here, executing a scratchpad script) past the word-split into an allow.
expect "$H" 'rm /tmp/claude-1000/a/scratchpad/f
/tmp/claude-1000/a/scratchpad/evil.sh' ask
# rm merely named as an argument (not the command) is not gated here (defers).
expect "$H" 'echo "rm -rf /tmp/x"' defer
expect "$H" 'grep -rn rm src/' defer

H=allow-readonly-bash.sh

# Plain read-only commands, pipelines, and loops auto-approve.
expect "$H" 'grep -rn "foo" src/' allow
expect "$H" 'cat a.txt | wc -l' allow
expect "$H" 'find footbag_legacy_repo -path "*/backups/latest.sql"' allow
expect "$H" 'for f in a b c; do cat "$f"; done' allow
expect "$H" 'git status' allow

# Literal backticks -- single-quoted, or backslash-escaped -- are plain text, not
# substitution, and must not force a prompt; an ACTIVE backtick substitution still
# falls through, as does a mutation after a neutralized literal.
expect "$H" 'grep -c "INSERT INTO \`ifpa_group_messages\`" dump.sql' allow
expect "$H" "grep 'a \`quoted\` word' notes.txt" allow
expect "$H" 'ls \`pwd\`' allow
expect "$H" 'echo `rm -rf x`' defer
expect "$H" 'echo "`rm -rf x`"' defer
expect "$H" 'echo $(cat `evil`)' defer
expect "$H" 'grep "x\`y" f.txt; rm z' defer

# git -C auto-approves for the project directory and paths under it (the read-only
# reference-clone symlink and the maintainers' private-checkout symlink included);
# out-of-tree targets, ..-escapes, and mutating subcommands still fall through.
expect "$H" "git -C $CLAUDE_PROJECT_DIR log -1" allow
expect "$H" "git -C $CLAUDE_PROJECT_DIR/footbag_legacy_repo log -1 --format='%ai %s'" allow
expect "$H" "git -C $CLAUDE_PROJECT_DIR/footbag_private_repo log -1" allow
expect "$H" 'git -C /somewhere/else log -1' defer
expect "$H" "git -C $CLAUDE_PROJECT_DIR/../elsewhere log -1" defer
expect "$H" "git -C $CLAUDE_PROJECT_DIR push" defer
expect "$H" 'git -C footbag_private_repo log -1' allow
expect "$H" 'git -C footbag_legacy_repo status' allow
expect "$H" 'git -C docs log -1' allow
expect "$H" 'git -C ../elsewhere log -1' defer
expect "$H" 'git -C ~ log -1' defer

# git remote reads (bare / -v / show / get-url) auto-approve; mutating subverbs fall through.
expect "$H" 'git remote -v' allow
expect "$H" "git -C $CLAUDE_PROJECT_DIR remote -v" allow
expect "$H" 'git remote show origin' allow
expect "$H" 'git remote add x https://example/r' defer
expect "$H" 'git remote set-url origin https://example/r' defer

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
# A backslash-escaped separator is literal text to bash wherever it sits (quoted or
# bare) and must not split a phantom segment; a double-backslash before a separator
# leaves that separator real, so the mutation after it still falls through.
expect "$H" 'grep "A\|B" f.txt' allow
expect "$H" 'grep A\|B f.txt' allow
expect "$H" 'grep foo\\; rm x' defer
# A quoted string spanning lines is one argument (quote state carries across the
# newline); a newline outside quotes still separates commands, so the mutation on
# the next line still falls through.
expect "$H" 'grep "foo
bar" x.txt' allow
expect "$H" 'grep a f
rm x' defer

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

# Approver self-sufficiency: heads that can write/exec via a predicate or flag must NOT
# auto-approve, even when the sibling guard would also catch them (defense in depth).
# Quote/backslash obfuscation of the find predicate is stripped before matching.
expect "$H" 'find . -exec rm {} \;' defer
expect "$H" "find . '-exec' rm {} \;" defer
expect "$H" 'find . -delete' defer
expect "$H" 'sort -o out.txt in.txt' defer
expect "$H" 'sort --compress-program=/tmp/evil.sh f' defer
expect "$H" 'sort -S1 --compress-program=id big.txt' defer
expect "$H" 'date -s 2020-01-01' defer
expect "$H" 'hostname evil' defer
expect "$H" 'printenv' defer
# Bash 5.2 function substitution executes a command inside ${...}; never auto-approve.
expect "$H" 'echo "${ rm x; }"' defer
expect "$H" 'echo "${| rm x; }"' defer
# ...while the genuinely read-only forms of those same heads still auto-approve.
expect "$H" 'find src -name "*.ts"' allow
expect "$H" 'date +%s' allow
expect "$H" 'hostname -I' allow
expect "$H" 'git check-ignore -v src/app.ts' allow
expect "$H" 'git check-attr -a src/app.ts' allow
# Read-only git behind a global pager option still auto-approves; a mutation behind one
# still falls through (and block-git-mutations denies it).
expect "$H" 'git --no-pager diff HEAD' allow
expect "$H" 'git --no-pager log --oneline -5' allow
expect "$H" 'git -P show HEAD:src/app.ts' allow
expect "$H" 'git --no-pager commit -m x' defer
# git -C is accepted for the project directory or a path under it (the in-project
# symlink to a read-only reference clone counts -- the form the root CLAUDE.md
# prefers over a leading cd); other -C targets, any -c override, and a mutation
# behind an accepted -C all fall through.
expect "$H" "git -C $CLAUDE_PROJECT_DIR log --oneline -5" allow
expect "$H" "git -C $CLAUDE_PROJECT_DIR diff --stat notes.md" allow
expect "$H" 'git -C /somewhere/else log' defer
expect "$H" "git -C $CLAUDE_PROJECT_DIR push" defer
expect "$H" 'git -c core.pager=touch log' defer

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

# gh: read-only subcommands (and a read-only gh api GET) auto-approve, including inside a
# compound; every mutating, download, checkout, sensitive-read, and gh-api-write form falls through.
expect "$H" 'gh run view 123' allow
expect "$H" 'gh run list --limit 5' allow
expect "$H" 'gh pr view 7' allow
expect "$H" 'gh pr checks' allow
expect "$H" 'gh pr diff 7' allow
expect "$H" 'gh api repos/o/r/commits' allow
expect "$H" 'echo hi; gh run view 123 | head -40' allow
expect "$H" 'gh search prs --state open' allow
expect "$H" 'gh project item-list 5 --owner o --format json' allow
expect "$H" 'gh project view 5 --owner o' allow
expect "$H" 'gh project field-list 5 --owner o' allow
expect "$H" 'gh project item-edit --id X --field-id Y' defer
expect "$H" 'gh project create --owner o --title Board' defer
expect "$H" 'gh issue list -R "$FOOTBAG_PRIVATE_REPO"' allow
expect "$H" 'gh issue create -R o/r --title x --body y' defer
expect "$H" 'gh repo edit o/r --enable-issues=false' defer
expect "$H" 'gh pr create --title x --body y' defer
expect "$H" 'gh run rerun 123' defer
expect "$H" 'gh pr merge 7' defer
expect "$H" 'gh pr checkout 7' defer
expect "$H" 'gh run download 123' defer
expect "$H" 'gh api -X POST repos/o/r/issues' defer
expect "$H" 'gh api repos/o/r/issues -f title=x' defer
expect "$H" 'gh auth token' defer
expect "$H" 'gh secret list' defer

# sqlite3: a read-only inline query auto-approves (even with < in the SQL, or piped to a
# reader); every escape form -- no -readonly, a shell/file dot-command, or a query read from
# stdin/pipe/redirect -- falls through.
expect "$H" 'sqlite3 -readonly db.sqlite "SELECT 1"' allow
expect "$H" 'sqlite3 -readonly db.sqlite "SELECT * FROM t WHERE x<5"' allow
expect "$H" 'sqlite3 -readonly db.sqlite "SELECT 1" | grep 1' allow
expect "$H" 'sqlite3 -readonly db.sqlite ".tables"' allow
expect "$H" 'sqlite3 db.sqlite "SELECT 1"' defer
expect "$H" 'sqlite3 -readonly db.sqlite ".shell rm -rf x"' defer
expect "$H" 'sqlite3 -readonly db.sqlite ".output /tmp/x" ".dump"' defer
expect "$H" 'echo ".shell rm x" | sqlite3 -readonly db.sqlite' defer
expect "$H" 'cat evil.sql | sqlite3 -readonly db.sqlite' defer
expect "$H" 'sqlite3 -readonly db.sqlite < evil.sql' defer
expect "$H" 'sqlite3 -readonly db.sqlite' defer
# The file:...?mode=ro URI opens the database read-only exactly like -readonly and
# auto-approves, including with a multiline query whose <> comparison is quoted
# argument text; any other URI mode and the dot-command escapes still fall through.
expect "$H" 'sqlite3 "file:db.sqlite?mode=ro" ".tables"' allow
expect "$H" 'sqlite3 "file:db.sqlite?mode=ro&cache=shared" "SELECT 1"' allow
expect "$H" 'sqlite3 -readonly db.sqlite "SELECT
 (SELECT COUNT(*) FROM t WHERE x<>2) AS n;"' allow
expect "$H" 'sqlite3 "file:db.sqlite?mode=rwc" "SELECT 1"' defer
expect "$H" 'sqlite3 "file:db.sqlite?mode=ro" ".shell rm -rf x"' defer
# A $-bearing quoted database argument ("$DB") kept next to the double-quoted SQL must still
# auto-approve a read-only query whose <> / < / > is quoted argument text; a real redirect
# after it still falls through to the guard.
expect "$H" 'sqlite3 -readonly "$DB" "SELECT a FROM t WHERE x<>2"' allow
expect "$H" 'sqlite3 -readonly "$DB" "SELECT a FROM t WHERE c<3 AND d>1"' allow
expect "$H" 'sqlite3 -readonly "$DB" "SELECT 1" > out.txt' defer

# sed writing or executing (w/W command, s///w flag, e exec) is refused by the approver
# itself, not only the sibling guard; a read-only transform with a "w" in it still approves.
expect "$H" "sed -n 'w out.txt' f.txt" defer
expect "$H" "sed 's/a/b/w out.txt' f.txt" defer
expect "$H" "sed '3e touch x' f.txt" defer
expect "$H" "sed 's/word/X/' f.txt" allow

# A read-only command redirecting into the AI session scratch directory (or /dev/null)
# auto-approves; a real-file target or a scratch path escaping via .. falls through.
expect "$H" 'grep -rn foo src > /tmp/claude-1000/x/scratchpad/list.txt' allow
expect "$H" 'grep foo src | sort -u > /tmp/claude-1000/x/scratchpad/o.txt' allow
expect "$H" 'grep foo src > realfile.txt' defer
expect "$H" 'grep foo src > /tmp/claude-1000/x/../etc/o.txt' defer
# The write exemption is the scratchpad, not the whole /tmp/claude-* namespace: a /tmp/claude-*
# path without a scratchpad segment (a bare session-root file, or a lookalike name) is not the
# sanctioned target and still falls through.
expect "$H" 'grep foo src > /tmp/claude-1000/notscratch.txt' defer
expect "$H" 'grep foo src > /tmp/claude-x' defer
expect "$H" 'grep foo f > /tmp/claude-1000scratchpad.txt' defer

# curl is auto-approved ONLY as a loopback health probe that discards its body (-o /dev/null);
# a content-returning curl, a non-loopback host, a file write, a mutating method, or a
# connection redirect all fall through to a prompt (content is fetched via WebFetch).
expect "$H" 'curl -sf -o /dev/null http://localhost:3000/health' allow
expect "$H" 'curl -s -o /dev/null https://127.0.0.1/status' allow
expect "$H" 'curl --output /dev/null http://localhost/live' allow
expect "$H" 'curl -sf http://localhost/health' defer
expect "$H" 'curl -o /dev/null https://example.com' defer
expect "$H" 'curl -o report.json http://localhost/x' defer
expect "$H" 'curl -X POST -o /dev/null http://localhost/x' defer
expect "$H" 'curl -o /dev/null -x http://proxy:3128 http://localhost/x' defer
expect "$H" 'curl -o /dev/null --resolve localhost:80:1.2.3.4 http://localhost/x' defer
expect "$H" 'curl -o /dev/null -L http://localhost/redir' defer
# curl writes one output file per URL: a second real-file -o must fall through even when an
# earlier -o discards to /dev/null (the bare -o names its target in the NEXT token, so the
# real file cannot hide behind the discard). Separated --output and reordered forms too.
expect "$H" 'curl -o /dev/null http://localhost/a -o real.txt http://localhost/b' defer
expect "$H" 'curl -o /dev/null http://localhost/a -o /root/x http://localhost/b' defer
expect "$H" 'curl --output /dev/null http://localhost/a --output real.txt http://localhost/b' defer
expect "$H" 'curl http://localhost/a -o real.txt http://localhost/b -o /dev/null' defer

# unzip auto-approves ONLY in a read-only mode that never writes to disk: -p streams a
# member to stdout, -l/-v list, -t tests, -Z is zipinfo. Every extracting form -- the
# default, -o overwrite, -d extract-to-dir -- writes files and falls through to a prompt.
expect "$H" 'unzip -p archive.zip member' allow
expect "$H" 'unzip -l archive.zip' allow
expect "$H" 'unzip -v archive.zip' allow
expect "$H" 'unzip -t archive.zip' allow
expect "$H" 'unzip -Z archive.zip' allow
expect "$H" 'unzip -p archive.zip tfstate | jq .' allow
expect "$H" 'unzip archive.zip' defer
expect "$H" 'unzip -o archive.zip' defer
expect "$H" 'unzip -d /tmp/x archive.zip' defer
expect "$H" 'unzip -p -d /tmp/x archive.zip' defer

# Read-only sqlite3 inside a command substitution auto-approves: the quote-aware
# resolver reads past a quoted count(*) and vets the inner as a read-only query, the
# same rigor as a top-level sqlite3. Loops and assignments wrapping it are covered too.
expect "$H" 'echo "$(sqlite3 -readonly db "SELECT count(*) FROM t")"' allow
expect "$H" 'for t in $(sqlite3 -readonly db "SELECT name FROM sqlite_schema"); do echo "$t"; done' allow
expect "$H" 'n=$(sqlite3 "file:db?mode=ro" "SELECT count(*) FROM t")' allow
# A read-only sub nested inside another read-only sub still resolves (innermost first)...
expect "$H" 'cat "$(dirname "$(pwd)")/x"' allow
# ...but the catastrophic substitution cases must STILL defer: a hidden mutation, a
# hidden write redirect, a nested non-read-only sub (the inner runs even inside double
# quotes), arithmetic, and a quoted-paren sub whose head is not read-only.
expect "$H" 'echo "$(rm -rf x)"' defer
expect "$H" 'echo "$(cat a > b)"' defer
expect "$H" 'echo "$(a $(b))"' defer
expect "$H" 'echo "$((1 + 2))"' defer
expect "$H" 'echo "$(grep -E "(a|b)" f)"' defer
expect "$H" 'cat "$(dirname "$p")/x"' allow
expect "$H" 'cat "$(dirname "$(rm x)")/y"' defer
# A read-only sqlite3 sub carrying a second command or a redirect in its inner defers.
expect "$H" 'echo "$(sqlite3 -readonly db "SELECT 1"; rm x)"' defer
expect "$H" 'echo "$(sqlite3 -readonly db "SELECT 1" > f)"' defer
# ANSI-C $'...' quoting is never reasoned about: the whole command falls through, which
# also closes a pre-existing desync where a following separator was wrongly approved.
expect "$H" "grep x \$'a\\'b' ; rm y" defer
expect "$H" "echo \$'a\\'b' \$(rm x)" defer
# Read-only sqlite3 detection is not fooled by a duplicate/writable URI mode, a writable
# statement, or an ATTACH, at top level or reached through a substitution.
expect "$H" 'sqlite3 "file:db?mode=rwc&mode=ro" "PRAGMA journal_mode=WAL"' defer
expect "$H" 'sqlite3 "file:db?mode=ro&mode=rwc" "SELECT 1"' defer
expect "$H" 'echo "$(sqlite3 "file:db?mode=rwc&mode=ro" "SELECT 1")"' defer
expect "$H" 'sqlite3 -readonly db "SELECT 1; DROP TABLE t"' defer
expect "$H" "echo \"\$(sqlite3 -readonly db \"ATTACH 'o.db' AS o; SELECT 1\")\"" defer
# An unquoted newline inside a substitution separates commands just like `;`, so a
# read-only head or a read-only sqlite3 followed by a newline-and-mutation still defers.
expect "$H" 'echo "$(grep foo f
rm x)"' defer
expect "$H" 'echo "$(sqlite3 -readonly db "SELECT 1"
rm x)"' defer
# A write/exec flag that rides mid-arguments on an otherwise read-only head must defer
# INSIDE a substitution exactly as at top level: the inner is vetted for the same
# per-head flags, not just its head word. Each of these executes a write/exec in bash.
expect "$H" 'echo "$(git ls-remote --upload-pack=/tmp/evil.sh /tmp/r)"' defer
expect "$H" 'X=$(rg --pre=/tmp/evil.sh foo src/)' defer
expect "$H" 'X=$(sed -i s/a/b/ f.txt)' defer
expect "$H" "echo \"\$(sed -n 'w out.txt' f.txt)\"" defer
expect "$H" "X=\$(find . -name '*.bak' -delete)" defer
expect "$H" 'echo "$(git log --output=/tmp/pwned -1)"' defer
expect "$H" 'X=$(uniq in.txt out.txt)' defer
expect "$H" 'X=$(sort -o out.txt in.txt)' defer
expect "$H" 'X=$(date -s 2020-01-01)' defer
expect "$H" 'X=$(hostname evil)' defer
expect "$H" 'X=$(tree -o out.txt src)' defer
expect "$H" 'X=$(git grep --open-files-in-pager=/tmp/evil.sh foo)' defer
# ...while the genuinely read-only forms of those same heads still auto-approve in a sub.
expect "$H" 'echo "$(find src -name "*.ts")"' allow
expect "$H" 'X=$(sort in.txt)' allow
expect "$H" 'echo "$(sed -n 1,5p f.txt)"' allow
expect "$H" 'echo "$(uniq in.txt)"' allow
expect "$H" 'echo "$(git log --oneline -5)"' allow
# sed's write (w/W command, s///w flag) and exec (e command / s///e flag) are detected in
# every address form (1w, $w, /re/w, 1,5w) and either quote style, and -f/--file (an opaque
# external script) is refused -- at top level and inside a substitution. A `w` inside an
# s/// pattern, and read-only print/substitute, still auto-approve.
expect "$H" "sed -n '1w /tmp/out' /tmp/in" defer
expect "$H" 'sed -n "w /tmp/out" /tmp/in' defer
expect "$H" 'sed "3e id" /tmp/in' defer
expect "$H" "sed '\$w /tmp/out' /tmp/in" defer
expect "$H" "sed 's/a/b/w out.txt' f.txt" defer
expect "$H" 'sed -f script.sed /tmp/in' defer
expect "$H" 'sed --file=script.sed /tmp/in' defer
expect "$H" 'sed -nf script.sed /tmp/in' defer
expect "$H" "echo \$(sed -n '1w /tmp/out' /tmp/in)" defer
expect "$H" 'echo "$(sed "3e id" /tmp/in)"' defer
expect "$H" "sed 's/w/x/' f.txt" allow
expect "$H" "sed 's/new file/x/' f.txt" allow
expect "$H" 'echo "$(sed -n 1,5p f.txt)"' allow
# The s///-flag write (s/a/b/gw file) and exec (s/a/b/ge cmd) have other flags before the
# w/e, and a quoted ; earlier in the args must not hide a later write from the approver
# (its span across the command text is unbounded, so over-scan only over-prompts). A plain
# read-only s/// flag set still auto-approves.
expect "$H" "sed 's/a/b/gw out.txt' f.txt" defer
expect "$H" "sed 's@a@b@w /tmp/out' f.txt" defer
expect "$H" "sed 's|a|b|gw out.txt' f.txt" defer
expect "$H" "sed 's/a/b/ew /tmp/pwned' f.txt" defer
expect "$H" "sed 's/a/b/we /tmp/pwned' f.txt" defer
expect "$H" "sed 's,a,b,ew /tmp/pwned' f.txt" defer
expect "$H" "sed 's/a/b/e' f.txt" defer
expect "$H" "sed 's/a/b/gp' f.txt" allow
# git subcommands that can mutate (branch/remote/tag create, --output writes) are not in
# the approver's read-only git set / are refused by its flag check, so the approver defers
# and -- with their over-broad static allows now removed -- they prompt.
expect "$H" 'git branch feature' defer
expect "$H" 'git remote add evil https://example.com/x.git' defer
expect "$H" 'git tag v9.9.9' defer
# git reflog is read-only in its show/list forms but MUTATES via expire/delete (prune or drop
# reflog entries). Those subverbs must fall through; the read-only forms still auto-approve --
# at top level and reached through a substitution.
expect "$H" 'git reflog delete --rewrite --updateref HEAD@{0}' defer
expect "$H" 'git reflog expire --expire=now --all' defer
expect "$H" 'echo "$(git reflog delete HEAD@{0})"' defer
expect "$H" 'git reflog show' allow
expect "$H" 'git reflog' allow
expect "$H" 'git reflog --oneline -5' allow
expect "$H" "sed 's/a/b/ge cmd' f.txt" defer
expect "$H" "sed -n 'x;y' 's/a/b/gw /tmp/out' in.txt" defer
expect "$H" 'sed -n "x;y" -n "1w /tmp/out" in.txt' defer
expect "$H" "sed 's/a/b/g' f.txt" allow
# A read-only pipeline inside a <(...) process substitution auto-approves: the inner is
# split on its unquoted pipes/separators and every piece is vetted as read-only, the same
# rigor as a top-level segment. The diff/comm-of-two-pipelines idiom.
expect "$H" 'comm -12 <(git diff --name-only | sort) <(git diff --name-only HEAD origin/main | sort)' allow
expect "$H" 'diff <(sort a.txt) <(sort b.txt)' allow
expect "$H" 'cat <(grep foo a) <(grep bar b)' allow
expect "$H" 'diff <(git show HEAD:f) <(cat f)' allow
# A write, a mutating flag, a redirect, or a second command hidden in a <(...) inner must
# NOT auto-approve; a >(...) write form is never peeled and still falls through.
expect "$H" 'cat <(rm -rf x)' defer
expect "$H" 'cat <(cat a > b)' defer
expect "$H" 'diff <(sort a) <(sed -i s/x/y/ b)' defer
expect "$H" 'cat <(sort -o out.txt in.txt)' defer
expect "$H" 'sort <(cat a; rm b)' defer
expect "$H" 'diff <(cat a) >(tee out.txt)' defer
expect "$H" 'cat <(git ls-remote --upload-pack=/tmp/evil.sh /tmp/r)' defer
# A <<( heredoc operator is not a <( process substitution; a <( inside quotes is literal
# text. Both stay deferring (the quoted case matches quoted $( behavior).
expect "$H" 'cat <<(echo hi)' defer
expect "$H" 'echo "<(rm x)"' defer
expect "$H" 'echo '"'"'<(rm x)'"'"'' defer
# A quoted pipe inside a procsub piece is not a split point, so the piece keeps its raw
# pipe and stays conservative (an extra prompt, never an unsafe allow).
expect "$H" 'cat <(grep '"'"'a|b'"'"' f)' defer

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

# Cross-guard precedence: a leading-cd command that the read-only approver would
# otherwise auto-allow must still be denied once the full Bash chain runs.
expect_chain_deny 'cd src && ls'
expect_chain_deny '(cd terraform/staging && terraform plan)'

if [ "$fail" -ne 0 ]; then
  echo "[hooks] FAIL: one or more hook fixtures failed." >&2
  exit 1
fi
echo "[hooks] pass"
