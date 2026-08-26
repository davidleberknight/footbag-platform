#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# An interpreter fed its program on standard input writes files without any shell
# redirect, so the redirect guard cannot see it: `python3 - <<'PY'` carrying
# open(path,'w') looks like an ordinary command and edits the tree. Root CLAUDE.md
# already forbids the construct ("Edit files only through the Edit/Write tools"),
# and the rewrite is always available, so this denies rather than asks -- the same
# reasoning the leading-cd, shell-loop and process-substitution guards use, where a
# false deny costs a rewrite and a prompt costs a human interruption.
#
# The condition is deliberately narrow: an interpreter AND an inline program AND a
# construct that writes. Read-only interpreter use -- parsing JSON, computing line
# numbers, shaping output that no shell tool shapes well -- is legitimate and stays
# untouched. Denying every inline program would push that work into worse forms.
# The version suffix is not decoration: the name has to be followed by
# whitespace or end of line, and `python3.11` or `python2` is neither, so a
# bare `python3?` did not recognise them as interpreters at all.
INTERP='(^|[[:space:]]|[|;&(])(python[0-9.]*|node|nodejs|perl[0-9.]*|ruby[0-9.]*)([[:space:]]|$)'
printf '%s' "$COMMAND" | grep -Eq "$INTERP" || exit 0

# The program has to be inline for this to be the construct in question. A heredoc
# (`<<`, `<<-`, quoted or not) or an inline `-c`/`-e` program both qualify; a named
# script file does not, because a committed script is reviewable and is the correct
# way to do this work.
# Three spellings, because the flag does not need a space after it and does not
# have to be short: `node -erequire(...)` and `node --eval '...'` are the same
# construct as `node -e '...'`, and requiring the trailing space let both past.
printf '%s' "$COMMAND" | grep -Eq '<<-?|[[:space:]]-[ce]([[:space:]]|$|[^[:space:]-])|[[:space:]]--(eval|exec|execute)([[:space:]]|=|$)' || exit 0

# Write constructs, per interpreter family. `open(...)` is matched only in a write
# or append mode so a read stays clear; the mode may be positional or keyword, and
# may use either quote style. Perl spells that mode `>` or `>>` rather than `w`,
# in both the two- and three-argument forms, and Ruby writes through File.write,
# IO.write or File.open with a write mode -- all four languages are named above,
# so all four need a pattern here or the two without one are listed and unguarded.
#
# No redirect clause. It matched a shell redirect into a source-file extension,
# which guard-readonly-bash.sh already gates and which it deliberately exempts
# for the session scratchpad; since a deny outranks that guard's ask, the clause
# hard-blocked sanctioned scratchpad writes and added no coverage of its own.
WRITES='open\([^)]*[,[:space:]]("|'"'"')[wax]|open\([^)]*("|'"'"')>>?|\.write_text\(|\.write_bytes\(|writeFileSync|appendFileSync|createWriteStream|os\.replace\(|os\.rename\(|shutil\.(copy|copy2|move)\(|fs\.renameSync|fs\.writeFile|File\.write\(|IO\.write\(|File\.open\([^)]*("|'"'"')[wa]|\.dump\([^)]*,'

if printf '%s' "$COMMAND" | grep -Eq "$WRITES"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: do not write files from an inline interpreter program. A heredoc or -c program that calls open(...,'w'), writeFileSync, write_text, os.replace, shutil.move or similar edits the tree with no diff preview and no review. Use the Edit tool for a change to an existing file, the Write tool for a new one, or commit a real script under scripts/ if the transformation is worth keeping. Read-only interpreter programs are unaffected."
    }
  }'
  exit 0
fi
