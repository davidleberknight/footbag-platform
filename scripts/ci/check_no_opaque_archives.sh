#!/usr/bin/env bash
# Opaque-container gate: the repository tracks no archives, and no Terraform
# state in any form.
#
# Why this exists, from an incident rather than a principle. A saved Terraform
# plan was committed on 2026-07-06 under a filename the ignore rules did not
# match. A saved plan is a zip, and inside it were two full state files carrying
# three live secrets in plaintext: the staging session-signing secret, the
# CloudFront origin-verify header, and a Google API key. It sat in public history
# for seven weeks.
#
# Every other control the repository has for this reads TEXT. `gitleaks` runs
# over full history in CI and scans blobs as text; it cannot decompress an
# archive, so it never saw those secrets and CI stayed green the entire time.
# The conventions greps, code review and diff reading are blind for the same
# reason. Only two rules could ever have caught the file: a filename glob, which
# is what failed, and the allowlist in check_no_terraform_artifacts.sh, which
# looks only under terraform/.
#
# So the rule is not "do not commit plan files". It is: an archive is a container
# no scanner here can read, and the repository does not track one. That holds
# whatever the file is called and wherever it is put, which is precisely what the
# filename and directory rules could not do.
#
# There are zero archive-shaped tracked files today, so this costs nothing to
# adopt. If a legitimate one is ever needed, add it here deliberately with the
# reason written down, the same way a destructive migration declares itself.
#
# Resolves its own root through git, so a test can stand up a throwaway
# repository and run this inside it rather than writing a fixture into the real
# tree. Delegated from scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

python3 - <<'PY'
import subprocess, sys

# Magic bytes rather than extensions: the whole point is that the name proves
# nothing. A renamed archive is still an archive.
MAGIC = {
    b'PK\x03\x04': 'zip',
    b'PK\x05\x06': 'zip (empty)',
    b'\x1f\x8b': 'gzip',
    b'\xfd7zXZ': 'xz',
    b'7z\xbc\xaf': '7z',
    b'BZh': 'bzip2',
    b'\x28\xb5\x2f\xfd': 'zstd',
    b'Rar!': 'rar',
}

archives, states = [], []
files = [f for f in subprocess.run(
    ['git', 'ls-files', '-z'], capture_output=True).stdout.split(b'\0') if f]

for raw in files:
    path = raw.decode('utf-8', 'replace')
    try:
        with open(path, 'rb') as fh:
            head = fh.read(4096)
    except OSError:
        continue
    hit = next((name for magic, name in MAGIC.items() if head.startswith(magic)), None)
    if hit:
        archives.append((path, hit))
        continue
    # An uncompressed state file is text, so an archive check alone would miss
    # it. These two keys together are what a Terraform state always carries and
    # nothing else does.
    if head.lstrip()[:1] == b'{' and b'"terraform_version"' in head and b'"lineage"' in head:
        states.append(path)

if archives or states:
    for path, kind in archives:
        print(f'{path}: {kind} archive', file=sys.stderr)
    for path in states:
        print(f'{path}: Terraform state', file=sys.stderr)
    print('', file=sys.stderr)
    print('  FAIL: the repository tracks no archives and no Terraform state.', file=sys.stderr)
    print('        An archive is opaque to every secret scanner here, including the', file=sys.stderr)
    print('        gitleaks history scan, so anything inside one is unreviewable and', file=sys.stderr)
    print('        undetectable. A saved Terraform plan is a zip: that is how three', file=sys.stderr)
    print('        live secrets reached public history and stayed there for seven', file=sys.stderr)
    print('        weeks with CI green.', file=sys.stderr)
    sys.exit(1)

print(f'[opaque-archives] pass ({len(files)} tracked files scanned)')
PY
