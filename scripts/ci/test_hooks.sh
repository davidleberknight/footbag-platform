#!/usr/bin/env bash
# Fixture tests for the PreToolUse guard hooks: pipe a synthetic tool event into a
# hook exactly as Claude Code would and assert the permission decision it emits.
# "defer" means the hook stays silent (exit 0, no decision) and the normal
# permission flow decides. Aggregates failures and exits non-zero if any fixture
# mismatches. Currently covers guard-secret-reads.sh; extend with fixtures for the
# sibling guards as they change.
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

H=allow-readonly-bash.sh

# Plain read-only commands, pipelines, and loops auto-approve.
expect "$H" 'grep -rn "foo" src/' allow
expect "$H" 'cat a.txt | wc -l' allow
expect "$H" 'find footbag.org -path "*/backups/latest.sql"' allow
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
# reference-clone symlink included); out-of-tree targets, ..-escapes, and mutating
# subcommands still fall through.
expect "$H" "git -C $CLAUDE_PROJECT_DIR log -1" allow
expect "$H" "git -C $CLAUDE_PROJECT_DIR/footbag.org log -1 --format='%ai %s'" allow
expect "$H" 'git -C /somewhere/else log -1' defer
expect "$H" "git -C $CLAUDE_PROJECT_DIR/../elsewhere log -1" defer
expect "$H" "git -C $CLAUDE_PROJECT_DIR push" defer

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
# git -C is accepted only when it targets the project directory itself (the form the
# root CLAUDE.md prefers over a leading cd); any other -C target, any -c override,
# and a mutation behind an accepted -C all fall through.
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
