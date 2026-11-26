#!/usr/bin/env bash
# Output-prefix gate: no operator script prints a line that starts with two
# equals signs, a greater-than sign and a space.
#
# Why this exists. An operator copies lines out of a run and pastes them back
# into a shell, and a line beginning with that prefix is read there as a command
# whose `>` redirects into a file named after the next word: pasting the AWS
# identity line created a file called AWS in the working directory. Operator
# scripts mark a step with two equals signs and a space instead, which a shell
# reads as an unknown command and leaves the working directory alone.
#
# What counts. Any occurrence of the prefix in a scanned file, in an echo, a
# printf, a heredoc or a comment: a comment describing the output is how the old
# form gets copied back in. The pattern is assembled at run time so that this
# file does not match itself.
#
# Scope is every file under scripts/ apart from virtual environments, bytecode
# caches and node_modules, plus deploy_to_aws.sh at the repository root, read
# from the working tree so a new file is checked before it is added. A file that
# is not UTF-8 text is skipped. There are no exemptions. An empty scope fails
# rather than passes. Resolves its own root through git, so a test can run it
# inside a throwaway repository. Delegated from scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

python3 - <<'PY'
import os, sys

PRUNE = {'.venv', '__pycache__', 'node_modules'}
ROOT_FILES = ['deploy_to_aws.sh']
PREFIX = '==' + '> '

files = []
if os.path.isdir('scripts'):
    for dirpath, dirnames, filenames in os.walk('scripts'):
        dirnames[:] = sorted(n for n in dirnames if n not in PRUNE)
        files += [os.path.join(dirpath, n) for n in sorted(filenames)]
files += [n for n in ROOT_FILES if os.path.isfile(n)]

if not files:
    print('FAIL: the output-prefix scan matched no files at all. Refusing to report a pass', file=sys.stderr)
    print('      for a scope that has shrunk to nothing.', file=sys.stderr)
    sys.exit(1)

violations = []
for path in files:
    try:
        with open(path, encoding='utf-8') as fh:
            lines = fh.read().splitlines()
    except UnicodeDecodeError:
        continue
    except OSError as e:
        print(f'FAIL: could not read {path}: {e}', file=sys.stderr)
        sys.exit(1)
    for n, line in enumerate(lines, 1):
        if PREFIX in line:
            violations.append(f'{path}:{n}: {line.strip()}')

if violations:
    print('FAIL: an operator script prints a line a shell would read as a redirect when the', file=sys.stderr)
    print('      operator pastes it back, creating a file named after the next word:', file=sys.stderr)
    for v in violations:
        print(f'        {v}', file=sys.stderr)
    print('      Start the line with two equals signs and a space instead, for example:', file=sys.stderr)
    print('        echo "== Rsyncing source to host..."', file=sys.stderr)
    sys.exit(1)

print(f'output prefix: {len(files)} files scanned, no line starts a redirect when pasted')
PY
