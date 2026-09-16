#!/usr/bin/env bash
# check_migrations_additive.sh
#
# A migration file is additive. It does not drop, it does not rename, and it
# does not quietly rewrite the rows that are already there.
#
# Reason: the migrating deploy promotes the new code and images BEFORE it runs
# the migration, and restoring the pre-migration database on failure does not
# put the old code back. The host therefore comes up running the new release
# against the old schema, and the only thing that makes that state serviceable
# rather than broken is expand-and-contract: add a column in one release, read
# it in the next, remove it in a third once nothing reads it. An additive
# migration is also the only shape that survives a restore to a snapshot taken
# before it ran, which is the recovery path the whole backup story rests on.
#
# Two kinds of statement are refused, and each declares itself with its own
# marker, because they are different admissions:
#
#   -- CONTRACTION: <why nothing reads this any more>
#       A schema removal, which is the third release of expand-and-contract.
#       Covers a drop, a rename, and a direct edit of the schema table, which
#       removes a table's definition while containing neither word.
#
#   -- DATA CHANGE: <what it writes, and why a restore still serves>
#       A statement that writes or removes rows. The deploy path names an
#       additive backfill against live data as an intended use, so this is not
#       forbidden; it is the one shape of migration whose damage a schema read
#       cannot show afterwards, so it says what it is doing. Deleting rows is in
#       this class too: nothing about a delete is visible in the schema, and no
#       later release puts the rows back.
#
# The marker is read per statement, not per file: it sits on the statement's own
# line or in the few lines above it, which is where the explanation belongs. A
# file-scoped marker meant one acknowledged contraction bought immunity for
# every statement under it, including ones written later by someone reading the
# header as already settled.
#
# Comment lines are exempt from the match, so a header explaining what a
# migration deliberately does not do cannot trip its own gate.
#
# Resolves its own root through git, so a test can stand up a throwaway
# repository and run this inside it rather than writing a fixture into the real
# tree. Delegated from scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MIGRATIONS_DIR="${ROOT}/database/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[migrations-additive] pass (no migrations directory)"
  exit 0
fi

python3 - "$MIGRATIONS_DIR" <<'PY'
import pathlib, re, sys

# How far above a statement its marker may sit. Wide enough for the sentence
# that explains the admission, narrow enough that it cannot reach past the
# statement before it.
WINDOW = 8

# A statement is matched wherever its keyword begins a line, so a bare `DROP
# TABLE` with nothing in front of it is caught: requiring a character before the
# keyword once exempted the plainest case of all. Comment lines are dropped
# before any of this runs, which is what keeps a header describing a drop from
# being read as one.
RULES = (
    (re.compile(r'\b(DROP\s+(TABLE|INDEX|VIEW|TRIGGER|COLUMN)'
                r'|RENAME\s+(TO|COLUMN)'
                r'|PRAGMA\s+writable_schema)\b', re.I), 'CONTRACTION'),
    (re.compile(r'\b(DELETE\s+FROM|TRUNCATE|UPDATE)\b', re.I), 'DATA CHANGE'),
)

MARKER = re.compile(r'^\s*--\s*(CONTRACTION|DATA CHANGE)\s*:', re.I)

WHY = {
    'CONTRACTION': '-- CONTRACTION: <why nothing reads this any more>',
    'DATA CHANGE': '-- DATA CHANGE: <what it writes, and why a restore still serves>',
}

root = pathlib.Path(sys.argv[1])
findings = []

for path in sorted(root.rglob('*.sql')):
    lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
    # Where the previous matched statement sat. A marker never reaches back past
    # one, so an acknowledgement covers the statement it was written for and not
    # the one somebody adds underneath it.
    previous = -1
    for i, line in enumerate(lines):
        if line.lstrip().startswith('--'):
            continue
        for pattern, kind in RULES:
            if not pattern.search(line):
                continue
            window = lines[max(0, i - WINDOW, previous + 1):i + 1]
            declared = {m.group(1).upper() for m in
                        (MARKER.match(w) for w in window) if m}
            if kind not in declared:
                findings.append((f'{path}:{i + 1}', line.strip()[:100], kind))
            previous = i
            break

if findings:
    for where, statement, kind in findings:
        print(f'{where}: {statement}  [needs {kind}]', file=sys.stderr)
    print('', file=sys.stderr)
    print('  FAIL: a migration must be additive.', file=sys.stderr)
    print('        The deploy promotes new code before the migration runs and does not roll the',
          file=sys.stderr)
    print('        code back if it fails, so the release must work against the previous schema,',
          file=sys.stderr)
    print('        and a restore to a snapshot taken before the migration must still serve.',
          file=sys.stderr)
    print('        A statement that means it says so, on its own line or just above it:',
          file=sys.stderr)
    for kind in ('CONTRACTION', 'DATA CHANGE'):
        print(f'          {WHY[kind]}', file=sys.stderr)
    sys.exit(1)
PY

migration_count=$(find "$MIGRATIONS_DIR" -name '*.sql' -type f | wc -l | tr -d ' ')
echo "[migrations-additive] pass (${migration_count} migration file(s))"
