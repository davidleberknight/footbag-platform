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
# Scope is the tracked tree, deliberately, and not the history behind it. Two
# archive-shaped blobs already sit in this repository's history: the plan file
# from the incident above, whose removal is ruled against, and a spreadsheet,
# which is a zip underneath. A history-reading gate would need both exempted by
# hash forever, would add about a quarter to this gate's running time, and would
# have to be handed a full clone, where the job that runs it fetches one commit
# and would otherwise scan nothing and report a pass. What it would buy is the
# narrow case of an archive added and deleted again within one branch. The trade
# was weighed and declined; the tracked tree is what this refuses.
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
    # A database file is as opaque to a text scanner as a compressed archive: the
    # secret sits in a page nobody reads, and a diff of it says nothing.
    b'SQLite format 3\x00': 'SQLite database',
    # Encrypted containers. Whatever is inside is unreviewable by construction,
    # which is the same property the rule is about, arrived at deliberately.
    b'age-encryption.org/v1': 'age container',
    b'-----BEGIN PGP': 'PGP message',
}

# Two container shapes the prefix table cannot express.
#
# A tar is not compressed and carries no leading signature at all: its marker is
# the six bytes at offset 257 of the first header block. A tar of a state
# directory is therefore as readable to this check as a zip was to the filename
# rules, which is to say not at all.
TAR_MARKER_OFFSET = 257
TAR_MARKERS = (b'ustar\x00', b'ustar ')

# The binary form of an OpenPGP message. These are the old-format packet tags a
# message realistically starts with: an encrypted session key, a public key, a
# trust packet. The armoured form is text and sits in the table above.
PGP_PACKET_TAGS = (b'\x85', b'\x99', b'\xa6')


def container_kind(head):
    """The kind of opaque container this file is, or None for ordinary content."""
    for magic, name in MAGIC.items():
        if head.startswith(magic):
            return name
    if head[TAR_MARKER_OFFSET:TAR_MARKER_OFFSET + 6] in TAR_MARKERS:
        return 'tar archive'
    if head[:1] in PGP_PACKET_TAGS:
        return 'PGP message'
    return None

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
    hit = container_kind(head)
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
