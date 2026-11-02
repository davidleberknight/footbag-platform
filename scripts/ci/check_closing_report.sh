#!/usr/bin/env bash
# Closing-report gate: every script a person or a runner invokes ends with one
# closing report, through the shared library.
#
# Why this exists. A script that prints a warning mid-stream and finishes on a
# success line has dropped the problem: the operator reads the end of a run, not
# the middle. The CloudWatch agent installer reported "upgraded" over an agent
# that was crash-looping, and the host bootstrap streamed package scriptlet
# errors it never listed. The mechanism is scripts/lib/closing-report.sh, and a
# remote half reports through scripts/lib/closing-report-remote.sh; this gate
# refuses a script that uses neither.
#
# What counts as using it. A script sources scripts/lib/closing-report.sh; a
# remote half, which arrives on an ssh stream and cannot source anything, ends
# with crr_finish; a test runner sources scripts/lib/verdict-banner.sh, whose
# final report is the runners' own. Lines are read as code, so a comment naming
# the library is not a use of it.
#
# Scope is every shell script under scripts/ apart from the shared libraries
# (scripts/lib/) and the CI gates (scripts/ci/), plus the repository-root
# scripts and the top-level scripts of legacy_data/ and freestyle/. A file whose
# first line is `# shellcheck shell=bash` is a sourced library and is exempt.
#
# The baseline. Scripts not yet moved onto the library are listed in
# scripts/ci/closing-report-baseline.txt, which only shrinks: a script outside it
# that does not comply fails, and a listed script that now complies, or no longer
# exists, fails until its line is deleted, so the list never claims more than is
# true. An empty scope fails rather than passes. Resolves its own root through
# git, so a test can run it inside a throwaway repository. Delegated from
# scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

python3 - <<'PY'
import os, re, sys

BASELINE = 'scripts/ci/closing-report-baseline.txt'
PRUNE = {'.venv', '__pycache__', 'node_modules'}

files = []
if os.path.isdir('scripts'):
    for dirpath, dirnames, filenames in os.walk('scripts'):
        dirnames[:] = sorted(n for n in dirnames if n not in PRUNE)
        if dirpath in ('scripts/lib', 'scripts/ci') or dirpath.startswith(('scripts/lib/', 'scripts/ci/')):
            continue
        files += [os.path.join(dirpath, n) for n in sorted(filenames) if n.endswith('.sh')]
files += sorted(n for n in os.listdir('.') if n.endswith('.sh') and os.path.isfile(n))
for d in ('legacy_data', 'freestyle'):
    if os.path.isdir(d):
        files += sorted(os.path.join(d, n) for n in os.listdir(d)
                        if n.endswith('.sh') and os.path.isfile(os.path.join(d, n)))

if not files:
    print('FAIL: the closing-report scan matched no shell scripts at all. Refusing to report', file=sys.stderr)
    print('      a pass for a scope that has shrunk to nothing.', file=sys.stderr)
    sys.exit(1)

USES = [
    re.compile(r'^\s*(?:source|\.)\s+.*closing-report\.sh\b'),
    re.compile(r'^\s*(?:source|\.)\s+.*verdict-banner\.sh\b'),
    re.compile(r'(?:^|[;&|{(]|\bthen\b|\bdo\b)\s*crr_finish\b'),
]


def code_lines(text):
    for raw in text.splitlines():
        line = raw.split('#', 1)[0] if raw.lstrip().startswith('#') else raw
        if line.strip():
            yield line


def is_sourced_library(text):
    first = text.split('\n', 1)[0].strip()
    return first == '# shellcheck shell=bash'


def complies(text):
    return any(p.search(line) for line in code_lines(text) for p in USES)


baseline = []
if os.path.isfile(BASELINE):
    with open(BASELINE, encoding='utf-8') as fh:
        baseline = [l.strip() for l in fh if l.strip() and not l.lstrip().startswith('#')]
listed = set(baseline)

problems = 0
in_scope = set()
for path in files:
    with open(path, encoding='utf-8', errors='replace') as fh:
        text = fh.read()
    if is_sourced_library(text):
        continue
    in_scope.add(path)
    ok = complies(text)
    if not ok and path not in listed:
        print(f'{path}:1: FAIL: ends with no closing report. Source scripts/lib/closing-report.sh '
              '(a remote half: send scripts/lib/closing-report-remote.sh ahead of it and end with '
              'crr_finish).', file=sys.stderr)
        problems += 1
    elif ok and path in listed:
        print(f'{BASELINE}: FAIL: {path} now uses the closing-report library; delete its line.',
              file=sys.stderr)
        problems += 1

for path in baseline:
    if path not in in_scope:
        print(f'{BASELINE}: FAIL: {path} is not an in-scope script (moved, deleted or a sourced '
              'library); delete its line.', file=sys.stderr)
        problems += 1

if problems:
    print(f'closing report: {problems} problem(s).', file=sys.stderr)
    sys.exit(1)
print(f'closing report: {len(in_scope)} scripts in scope, {len(baseline)} on the baseline.')
PY
