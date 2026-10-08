#!/usr/bin/env bash
# Signal-trap gate: a shell script that cleans up on an EXIT trap also traps INT
# and TERM, so an interrupt reaches its cleanup through a handler of its own.
#
# Why this exists. Without a trap of its own on a signal, bash ends the script
# through its default handling of that fatal signal, which runs the EXIT trap
# from inside the signal handling. Under bash 5.2 a second signal landing before
# the cleanup's first line ends the shell with the cleanup cut short. A script
# that sets a trap on the signal instead has it queued and run between commands,
# where the handler can make further signals ignored before anything else and
# then exit through the cleanup. The sshd hardening restore lost its file this
# way on a CI runner about three times in a thousand, while bash 5.1 on a
# workstation never showed it, so a clean local run proved nothing.
#
# What counts. A `trap` command whose action is not a reset (`-`) and whose
# signal list names EXIT (or 0) sets an EXIT trap. The file then needs a `trap`
# command naming INT (or 2) and one naming TERM (or 15), with any action other
# than a reset: a handler or an explicit ignore both keep bash's fatal default
# out of the way. Lines are tokenised as the shell would, so a comment or a
# quoted string mentioning a trap is not one.
#
# Scope is every shell script under scripts/, legacy_data/scripts/ and
# legacy_data/tools/, plus the repository-root scripts, read from the working
# tree so a new file is checked before it is added. An empty scope fails rather
# than passes. Resolves its own root through git, so a test can run it inside a
# throwaway repository. Delegated from scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

python3 - <<'PY'
import os, re, shlex, sys

SCAN_DIRS = ['scripts', 'legacy_data/scripts', 'legacy_data/tools']
PRUNE = {'.venv', '__pycache__', 'node_modules'}
EXTS = ('.sh', '.bash')

files = []
for d in SCAN_DIRS:
    if not os.path.isdir(d):
        continue
    for dirpath, dirnames, filenames in os.walk(d):
        dirnames[:] = sorted(n for n in dirnames if n not in PRUNE)
        files += [os.path.join(dirpath, n) for n in sorted(filenames) if n.endswith(EXTS)]
files += sorted(n for n in os.listdir('.') if n.endswith(EXTS) and os.path.isfile(n))

if not files:
    print('FAIL: the signal-trap scan matched no shell scripts at all. Refusing to report a', file=sys.stderr)
    print('      pass for a scope that has shrunk to nothing.', file=sys.stderr)
    sys.exit(1)

ALIASES = {'0': 'EXIT', '1': 'HUP', '2': 'INT', '15': 'TERM'}
# A trap command at the start of a line or after a command separator.
TRAP_AT = re.compile(r'(?:^|[;&|{(]|\bthen\b|\bdo\b|\belse\b)\s*trap\s')
SEPARATORS = {';', '&&', '||', '|', '&', '}', ')'}


def trap_commands(line):
    """Yields (action, signals) for each trap command on one line of code."""
    for m in TRAP_AT.finditer(line):
        rest = line[m.end():]
        try:
            lexer = shlex.shlex(rest, posix=True, punctuation_chars=';&|()')
            lexer.whitespace_split = True
            lexer.commenters = '#'
            tokens = list(lexer)
        except ValueError:
            continue
        if not tokens:
            continue
        action = tokens[0]
        if action.startswith('-') and action != '-':
            continue  # trap -p, trap -l: a listing, not a trap
        signals = []
        for t in tokens[1:]:
            if t in SEPARATORS:
                break
            name = t.upper()
            name = name[3:] if name.startswith('SIG') else name
            signals.append(ALIASES.get(name, name))
        yield action, signals


violations = []
for path in files:
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            lines = fh.read().splitlines()
    except OSError as e:
        print(f'FAIL: could not read {path}: {e}', file=sys.stderr)
        sys.exit(1)
    exit_line = None
    handled = set()
    for n, raw in enumerate(lines, 1):
        code = raw.strip()
        if not code or code.startswith('#'):
            continue
        for action, signals in trap_commands(code):
            if action == '-':
                continue
            if 'EXIT' in signals and action != '' and exit_line is None:
                exit_line = n
            handled.update(s for s in signals if s in ('INT', 'TERM'))
    if exit_line is not None:
        missing = [s for s in ('INT', 'TERM') if s not in handled]
        if missing:
            violations.append(f'{path}:{exit_line}: EXIT trap with no trap on {" or ".join(missing)}')

if violations:
    print('FAIL: a script cleans up on an EXIT trap but leaves an interrupt to bash\'s fatal-signal', file=sys.stderr)
    print('      default, where a second signal can end the shell before the cleanup finishes:', file=sys.stderr)
    for v in violations:
        print(f'        {v}', file=sys.stderr)
    print('      Trap INT and TERM beside it, each making further signals ignored and then', file=sys.stderr)
    print('      exiting, for example:', file=sys.stderr)
    print("        trap \"trap '' HUP INT TERM; exit 130\" INT", file=sys.stderr)
    print("        trap \"trap '' HUP INT TERM; exit 143\" TERM", file=sys.stderr)
    sys.exit(1)

print(f'signal traps: {len(files)} shell scripts scanned, every EXIT trap has INT and TERM traps')
PY
