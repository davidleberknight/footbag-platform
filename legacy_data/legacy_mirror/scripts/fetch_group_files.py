#!/usr/bin/env python3
"""Recover the legacy group files the crawl can no longer see.

The legacy database records every file uploaded to a committee or group. The
crawl reaches them only through each file's detail page, and those pages show no
file rows to the account the crawl signs in as, so the current capture holds
almost none of them. The files themselves are still served at their own
addresses, so this recovers them from the inventory rather than by crawling.

Where each file belongs is the database's own answer. A file scoped to a
committee is not member-visible and goes to private custody; an unscoped one was
readable by any member and belongs in the published archive at the same path the
crawl would have written. A file an earlier capture already holds is copied from
there and checked against what the site still serves, rather than downloaded
again.

Read-only against the live site, re-runnable, and it never overwrites a file that
is already held. Run from the repo root:

    legacy_data/footbag_venv/bin/python \\
        legacy_data/legacy_mirror/scripts/fetch_group_files.py --dry-run
"""
import argparse
import csv
import hashlib
import importlib.util
import os
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
CRAWLER = REPO_ROOT / 'legacy_data/legacy_mirror/create_mirror_footbag_org.py'
INVENTORY = REPO_ROOT / 'footbag_private_repo/legacy-export/groups/ifpa_group_files.csv'
COMMITTEES = REPO_ROOT / 'footbag_private_repo/legacy-export/groups/ifpa_committees.csv'
CUSTODY = REPO_ROOT / 'footbag_private_repo/private-custody/ifpa-group-files'
ARCHIVE = REPO_ROOT / 'legacy_data/legacy_mirror/mirror_footbag_org/www.footbag.org'
PREVIOUS = Path('/home/footbag/GITHUB/mirror_footbag_org.OLD/www.footbag.org')

_spec = importlib.util.spec_from_file_location('crawler', str(CRAWLER))
crawler = importlib.util.module_from_spec(_spec)
sys.modules['crawler'] = crawler
_spec.loader.exec_module(crawler)

BASE = 'http://www.footbag.org/'
DELAY = crawler.DELAY_SECONDS


EXCLUSIONS = CUSTODY / 'CRAWL_EXCLUSIONS.txt'


def committees():
    with COMMITTEES.open(encoding='utf-8', errors='replace') as fh:
        return {row['CommitteeID']: row for row in csv.DictReader(fh)}


def excluded_paths():
    """The paths the crawl and the publish gate both treat as unpublishable.

    This list is the authority on what may not reach the member archive, and it
    is derived from the same database columns read here, so agreeing with it is
    what keeps a recovered file from landing where the gate will refuse it.
    """
    return {line.strip() for line in
            EXCLUSIONS.read_text(encoding='utf-8', errors='replace').splitlines()
            if line.strip() and not line.startswith('#')}


def is_private(rel, row, groups, exclusions):
    """Whether a file is committee-scoped, by every test that governs it.

    A file's own scope is not the whole answer: an unscoped file inside a
    committee that is not public was never member-visible either, and the
    exclusion list names both kinds. Routing on scope alone puts a private
    committee's documents into the published archive.
    """
    if rel in exclusions:
        return True
    if (row.get('FileScope') or '0') != '0':
        return True
    committee = groups.get(row.get('FileGroupID') or '')
    return bool(committee) and committee.get('CommitteePublic') == '0'


# A phone-number-shaped run of digits. Loose on purpose: this only has to catch
# a dense cluster of them, not validate a single one.
_PHONE_RE = re.compile(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b')
_ROSTER_HEADING_RE = re.compile(r'member search results|member roster|membership list', re.I)
# A handful of digit runs that happen to be phone-shaped is coincidence; a
# roster export carries dozens. This is well below the true count in either
# file found this session (23 and 51) and above what stray content plausibly
# produces.
_MIN_PHONE_MATCHES = 5


def _extractable_text(body, ext):
    """Best-effort plain text for the content scan below.

    RTF wraps its text in control words neither pattern would see through, so
    those are stripped first. A format not handled here yields no text and
    therefore no match, which is a silent pass rather than a crash: this check
    is an added net alongside the metadata tests in is_private, not their
    replacement, so a format it cannot read is no worse off than before this
    existed.
    """
    if ext == '.rtf':
        text = body.decode('latin-1', errors='replace')
        text = re.sub(r'\\[a-zA-Z]+-?\d*\s?', ' ', text)
        return text.replace('{', ' ').replace('}', ' ')
    if ext == '.txt':
        return body.decode('utf-8', errors='replace')
    return ''


def looks_like_member_roster(body, rel):
    """A content-level catch the scope and committee metadata cannot see.

    A committee can be marked public and a file unscoped and still be a raw
    export of member names, aliases and phone numbers that committee uploaded
    itself -- exactly what two files did this session, past every metadata
    test `is_private` runs. This is a narrow, literal check for the shape that
    leak took, not a general PII scanner: it exists to catch the next file
    built the same way, not to replace human review of what gets published.
    """
    text = _extractable_text(body, Path(rel).suffix.lower())
    if not text:
        return False
    if _ROSTER_HEADING_RE.search(text):
        return True
    return len(_PHONE_RE.findall(text)) >= _MIN_PHONE_MATCHES


def inventory():
    with INVENTORY.open(encoding='utf-8', errors='replace') as fh:
        return [row for row in csv.DictReader(fh) if (row['FileLocation'] or '').strip()]


# A database FileLocation whose recorded path is no longer where the content
# actually lives, because a human deliberately replaced it with something
# else. Without this, `held()` sees the old path as empty and this script
# re-fetches and re-writes exactly what was just replaced, on every future
# run including one at the site freeze.
SUPERSEDED = {
    'ifpa/groups/marketing/IFPA_LOGO_EPS.zip':
        'extracted; the three real logos inside now sit beside this path as '
        'IFPA_logo_vector.eps, IFPA_logo_vector_BW.eps and '
        'IFPA_logo_vector_BW_negative.eps, the zip container and its macOS '
        'resource-fork junk discarded',
}


def held(rel):
    """Where the file already is, if anywhere."""
    if rel in SUPERSEDED:
        return 'superseded'
    if (ARCHIVE / rel).is_file():
        return 'archive'
    if (CUSTODY / 'www.footbag.org' / rel).is_file():
        return 'custody'
    if (PREVIOUS / rel).is_file():
        return 'previous capture'
    return None


def note_for(row, groups):
    committee = groups.get(row.get('FileGroupID') or '', {}).get('CommitteeName',
                                                                'unknown committee')
    return (f"FileID={row.get('FileID')} scope={row.get('FileScope')} "
            f"vis={row.get('FileVisible')} [{committee}] recovered by inventory")


def fetch(session, rel):
    url = BASE + quote(rel)
    response = session.get(url, timeout=60)
    response.raise_for_status()
    body = response.content
    # The declared length describes the bytes on the wire, so it only matches the
    # file when the server sent it uncompressed. Comparing the two across a gzip
    # response reports every compressible document as truncated.
    declared = response.headers.get('Content-Length')
    if declared and not response.headers.get('Content-Encoding'):
        if int(declared) != len(body):
            raise ValueError(f'{rel}: server declared {declared} bytes, '
                             f'delivered {len(body)}')
    if not body:
        raise ValueError(f'{rel}: the site served an empty file')
    return body


# The publish gate refuses any file of these types that does not carry the
# crawler's sidecar proving its bytes were re-encoded. This script downloads
# rather than crawling, so it cannot earn that sidecar, and writing an empty one
# would assert a scan that never happened.
GATE_SCANNED_MEDIA = ('.jpg', '.jpeg', '.gif', '.mp4')


def needs_sanitization(rel):
    return Path(rel).suffix.lower() in GATE_SCANNED_MEDIA


def write(destination, body, dry_run):
    if dry_run:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.partial')
    temporary.write_bytes(body)
    os.replace(temporary, destination)


def append_manifest(rows, dry_run):
    if dry_run or not rows:
        return
    manifest = CUSTODY / 'MANIFEST.tsv'
    with manifest.open('a', encoding='utf-8') as fh:
        for row in rows:
            fh.write('\t'.join(row) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be recovered and write nothing')
    args = parser.parse_args()

    groups = committees()
    exclusions = excluded_paths()
    rows = inventory()
    session = requests.Session()
    session.headers['User-Agent'] = crawler.USER_AGENT

    fetched_public = fetched_private = copied = failed = relocated = 0
    manifest_rows = []
    unresolved = []
    last = 0.0

    # First, correct anything already filed in the published archive that must
    # not be there. Routing on a file's own scope alone misses a public file
    # inside a committee that is not, and the published tree is the one place
    # where that mistake reaches a reader.
    for row in rows:
        rel = row['FileLocation'].lstrip('/')
        if not (ARCHIVE / rel).is_file():
            continue
        body = (ARCHIVE / rel).read_bytes()
        by_metadata = is_private(rel, row, groups, exclusions)
        by_content = not by_metadata and looks_like_member_roster(body, rel)
        if not (by_metadata or by_content):
            continue
        destination = CUSTODY / 'www.footbag.org' / rel
        reason = 'reads as a member roster export' if by_content else 'committee-scoped'
        print(f'  RELOCATING {rel}: {reason}, belongs in private custody')
        if not args.dry_run:
            write(destination, body, args.dry_run)
            (ARCHIVE / rel).unlink()
        manifest_rows.append((rel, 'file', str(len(body)),
                              hashlib.sha256(body).hexdigest(), note_for(row, groups)))
        relocated += 1

    for row in rows:
        rel = row['FileLocation'].lstrip('/')
        where = held(rel)
        if where in ('archive', 'custody', 'superseded'):
            continue
        scoped = is_private(rel, row, groups, exclusions)
        if not scoped and needs_sanitization(rel) and not (ARCHIVE / (rel + '.sanitized')).is_file():
            # It would publish unscanned bytes, and the sidecar that says
            # otherwise is not this script's to write. Held for the crawler's
            # media path to bring in, and named so it is not simply lost.
            print(f'  WITHHELD {rel}: an image or video needs the crawler\'s '
                  're-encode before it can be published')
            unresolved.append(rel)
            failed += 1
            continue

        if where == 'previous capture':
            # An earlier capture holds it, but the live site is the authority
            # until it goes away, so take the file from the site and fall back to
            # the kept copy only if the site cannot serve it any more.
            kept = (PREVIOUS / rel).read_bytes()
            try:
                wait = DELAY - (time.time() - last)
                if wait > 0:
                    time.sleep(wait)
                last = time.time()
                body = fetch(session, rel)
                if len(body) != len(kept):
                    print(f'  DIFFERS {rel}: earlier capture {len(kept)} bytes, '
                          f'site now serves {len(body)}; taking the site')
            except (requests.RequestException, ValueError) as exc:
                print(f'  NOTE {rel}: the site could not serve it ({exc}); '
                      'keeping the earlier capture')
                body = kept
            if not scoped and looks_like_member_roster(body, rel):
                scoped = True
                print(f'  CONTENT MATCH {rel}: reads as a member roster export; '
                      'routing to private custody despite public metadata')
            destination = (CUSTODY / 'www.footbag.org' / rel) if scoped else (ARCHIVE / rel)
            write(destination, body, args.dry_run)
            copied += 1
            if scoped:
                manifest_rows.append((rel, 'file', str(len(body)),
                                      hashlib.sha256(body).hexdigest(), note_for(row, groups)))
            continue

        try:
            wait = DELAY - (time.time() - last)
            if wait > 0:
                time.sleep(wait)
            last = time.time()
            body = fetch(session, rel)
        except (requests.RequestException, ValueError) as exc:
            print(f'  FAILED {rel}: {exc}')
            failed += 1
            unresolved.append(rel)
            continue
        if not scoped and looks_like_member_roster(body, rel):
            scoped = True
            print(f'  CONTENT MATCH {rel}: reads as a member roster export; '
                  'routing to private custody despite public metadata')
        destination = (CUSTODY / 'www.footbag.org' / rel) if scoped else (ARCHIVE / rel)
        write(destination, body, args.dry_run)
        if scoped:
            fetched_private += 1
            manifest_rows.append((rel, 'file', str(len(body)),
                                  hashlib.sha256(body).hexdigest(), note_for(row, groups)))
        else:
            fetched_public += 1

    append_manifest(manifest_rows, args.dry_run)

    print(f'\nrelocated out of the published archive: {relocated}')
    print(f'recovered into the published archive : {fetched_public}')
    print(f'recovered into private custody       : {fetched_private}')
    print(f'copied from the earlier capture      : {copied}')
    print(f'could not be recovered               : {failed}')

    # The closing assertion: every recorded file now has exactly one home.
    if args.dry_run:
        print('\ndry run: nothing was written, so the inventory check is skipped')
        return 0
    homeless = [row['FileLocation'].lstrip('/') for row in rows
                if held(row['FileLocation'].lstrip('/')) in (None, 'previous capture')]
    if homeless:
        print(f'\nSTILL HELD NOWHERE: {len(homeless)}')
        for rel in homeless[:20]:
            print('   ', rel)
        return 1
    print(f'\nAll {len(rows)} recorded group files are held. '
          'The earlier capture holds nothing unique among them.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
