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

The maintainer's per-file rulings (PLACEMENT_RULINGS.csv, beside the inventory
in custody) win over everything above: a file ruled private goes to custody, a
file ruled into the archive is moved there from custody whatever its scope, a
dropped file leaves the capture and custody, and a logo pack ruled for conversion is held
privately while its logos are served as images. The capture ends holding only
what the archive serves. With --offline nothing is fetched and only the rulings
are applied, which is how a settle-only run reaches the same tree.

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
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
CRAWLER = REPO_ROOT / 'legacy_data/legacy_mirror/create_mirror_footbag_org.py'
CUSTODY = REPO_ROOT / 'footbag_private_repo/private-custody/ifpa-group-files'
ARCHIVE = REPO_ROOT / 'legacy_data/legacy_mirror/mirror_footbag_org/www.footbag.org'
# An earlier capture's www.footbag.org tree, named with --previous; none by default.
PREVIOUS = None

_spec = importlib.util.spec_from_file_location('crawler', str(CRAWLER))
crawler = importlib.util.module_from_spec(_spec)
sys.modules['crawler'] = crawler
_spec.loader.exec_module(crawler)

BASE = 'http://www.footbag.org/'
DELAY = crawler.DELAY_SECONDS


EXCLUSIONS = CUSTODY / 'CRAWL_EXCLUSIONS.txt'
# Every group file with its location, scope and committee visibility. Written by
# legacy_data/scripts/publish_legacy_repo_data.py beside the exclusion list, so
# this program reads nothing of the legacy export itself.
INVENTORY = CUSTODY / 'GROUP_FILES_INVENTORY.csv'


def committees(rows):
    """Each committee the inventory names, by id, with its name and public flag.
    A file whose committee the export did not hold carries empty committee
    columns and contributes nothing here."""
    return {row['FileGroupID']: {'CommitteeName': row['CommitteeName'],
                                 'CommitteePublic': row['CommitteePublic']}
            for row in rows if row['CommitteePublic']}


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
    # Hidden by its uploader: the legacy group page showed it only to its
    # owner, the group's owner and administrators.
    if row.get('FileVisible') == '0':
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
    if not INVENTORY.is_file():
        raise SystemExit(f'{INVENTORY} is missing. Run '
                         'legacy_data/scripts/publish_legacy_repo_data.py to write it, '
                         'then re-run.')
    with INVENTORY.open(encoding='utf-8', errors='replace') as fh:
        return [row for row in csv.DictReader(fh) if (row['FileLocation'] or '').strip()]


# Files the live site no longer serves. The database records an upload, not
# that the file survived, so a miss is ordinary; recording it, with the answer
# the site gave and when, is what lets the closing check account for every row
# rather than fail forever on a file nobody can recover.
GONE_FROM_LIVE = CUSTODY / 'GONE_FROM_LIVE.csv'
GONE_FIELDS = ['path', 'http_status', 'checked_on']
# The answers that mean the file is gone rather than unreachable just now.
GONE_STATUSES = (404, 410)


def gone_from_live():
    if not GONE_FROM_LIVE.is_file():
        return set()
    with GONE_FROM_LIVE.open(encoding='utf-8', newline='') as fh:
        return {row['path'] for row in csv.DictReader(fh)}


def record_gone(rows, dry_run):
    if dry_run or not rows:
        return
    new = not GONE_FROM_LIVE.is_file()
    with GONE_FROM_LIVE.open('a', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh, lineterminator='\n')
        if new:
            writer.writerow(GONE_FIELDS)
        writer.writerows(rows)


# The maintainer's per-file placement rulings, kept privately because they name
# IFPA records. Each row places one inventory file (by FileID) or one captured
# path (for a copy the inventory does not name) in the archive, in custody, or
# nowhere, or marks a logo pack for conversion. The capture holds only what the
# archive serves, so a file is served, held privately, or dropped.
RULINGS = CUSTODY / 'PLACEMENT_RULINGS.csv'
PLACEMENTS = ('archive', 'custody', 'drop', 'convert-logo')


def placement_rulings():
    """The rulings as (by FileID, by path). Refuses when the record is missing
    or names a placement it does not know: a ruling misread is a file put where
    the maintainer said it must not go."""
    if not RULINGS.is_file():
        raise SystemExit(f'{RULINGS} is missing: it records where each group file '
                         'was ruled to go. Restore it from the private repository, '
                         'then re-run.')
    by_id, by_path = {}, {}
    with RULINGS.open(encoding='utf-8', newline='') as fh:
        for line, row in enumerate(csv.DictReader(fh), start=2):
            placement = (row.get('placement') or '').strip()
            if placement not in PLACEMENTS:
                raise SystemExit(f'{RULINGS.name} line {line}: placement {placement!r} '
                                 f'is not one of {", ".join(PLACEMENTS)}')
            file_id = (row.get('FileID') or '').strip()
            path = (row.get('path') or '').strip().lstrip('/')
            if file_id:
                by_id[file_id] = placement
            elif path:
                by_path[path] = placement
            else:
                raise SystemExit(f'{RULINGS.name} line {line}: names no FileID or path')
    return by_id, by_path


def held(rel, gone=frozenset(), dropped=frozenset()):
    """Where the file already is, if anywhere."""
    if rel in dropped:
        return 'dropped by ruling'
    if (ARCHIVE / rel).is_file():
        return 'archive'
    if (CUSTODY / 'www.footbag.org' / rel).is_file():
        return 'custody'
    # An earlier capture's copy outranks the gone record: the site no longer
    # serving a file is no reason to leave a copy we hold unfiled.
    if PREVIOUS is not None and (PREVIOUS / rel).is_file():
        return 'previous capture'
    if rel in gone:
        return 'gone from live'
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


def convert_logo_pack(zip_path, out_dir, dry_run):
    """Render each EPS logo in a held logo pack to a re-encoded JPEG.

    Each EPS is read from the zip in memory, never unpacked by its own name, and
    rendered by Ghostscript in its safe mode into a scratch folder; the crawler's
    own image re-encode then rebuilds the bytes and writes the sidecar the
    publish requires. Output is named <pack>-<logo>.jpg beside where the pack
    was posted. Returns the JPEGs, already-converted ones included."""
    written = []
    pack = Path(zip_path).stem
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            name = PurePosixPath(info.filename)
            if info.is_dir() or '__MACOSX' in name.parts or name.name.startswith('._'):
                continue
            if name.suffix.lower() != '.eps':
                continue
            target = out_dir / f'{pack}-{name.stem}.jpg'
            if crawler._is_already_sanitized(str(target)):
                written.append(target)
                continue
            if dry_run:
                written.append(target)
                continue
            out_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='footbag-logo-') as scratch:
                eps = Path(scratch) / 'logo.eps'
                eps.write_bytes(archive.read(info))
                png = Path(scratch) / f'{target.stem}.png'
                subprocess.run(['gs', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
                                '-dEPSCrop', '-sDEVICE=png16m', '-r150',
                                f'-sOutputFile={png}', str(eps)],
                               check=True, timeout=120,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                jpg = crawler.convert_image_to_jpg(str(png))
                if not jpg:
                    raise RuntimeError(f'{name}: the image re-encode failed')
                os.replace(jpg, target)
                crawler._write_sanitized_marker(str(target))
            written.append(target)
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be recovered and write nothing')
    parser.add_argument('--offline', action='store_true',
                        help='apply the placement rulings to what is already held and '
                             'fetch nothing; a file held nowhere is reported, exit 3')
    parser.add_argument('--previous', type=Path, metavar='DIR',
                        help="an earlier capture's www.footbag.org tree; a file it holds "
                             'is taken from there when the live site cannot serve it')
    parser.add_argument('--archive', type=Path, metavar='DIR',
                        help="the capture's www.footbag.org tree to file member-visible "
                             'files into; the crawl passes its own (default: the '
                             'repository mirror)')
    args = parser.parse_args()
    global PREVIOUS, ARCHIVE
    if args.archive is not None:
        if not args.archive.is_dir():
            parser.error(f'--archive {args.archive} is not a directory')
        ARCHIVE = args.archive
    if args.previous is not None:
        if not args.previous.is_dir():
            parser.error(f'--previous {args.previous} is not a directory')
        PREVIOUS = args.previous
    elif not args.offline:
        print('No --previous capture named; files are taken from the live site only.')

    rows = inventory()
    groups = committees(rows)
    exclusions = excluded_paths()
    ruled, ruled_paths = placement_rulings()
    gone = gone_from_live()
    gone_rows = []
    session = requests.Session()
    session.headers['User-Agent'] = crawler.USER_AGENT

    def ruling(row):
        return ruled.get((row.get('FileID') or '').strip())

    def kept_private(rel, row):
        # A ruling to hold a file privately, or to keep only its conversion,
        # outranks metadata that would publish it. The maintainer's ruling into
        # the archive is the one thing that opens a group-scoped or
        # private-group file to members; the metadata never does.
        if ruling(row) == 'archive':
            return False
        return (ruling(row) in ('custody', 'convert-logo')
                or is_private(rel, row, groups, exclusions))

    dropped = ({row['FileLocation'].lstrip('/') for row in rows if ruling(row) == 'drop'}
               | {path for path, placement in ruled_paths.items() if placement == 'drop'})

    withheld = crawler._publish_withheld_patterns()
    if withheld is None:
        raise SystemExit(f'{crawler.ARCHIVE_PUBLISH_EXCLUSIONS} cannot be read, so which '
                         'files the archive serves is unknown')
    needs_ruling = []
    for row in rows:
        rel = row['FileLocation'].lstrip('/')
        # A member-visible file the archive cannot serve has no place until the
        # maintainer rules on it: the capture holds only what is served, so it
        # would be fetched, stripped and fetched again on every run.
        if (not ruling(row) and not kept_private(rel, row)
                and crawler.publish_would_withhold(rel, withheld)):
            needs_ruling.append(rel)
    needs_ruling = set(needs_ruling)

    fetched_public = fetched_private = copied = failed = relocated = removed = 0
    not_fetched = 0
    manifest_rows = []
    unresolved = []
    last = 0.0

    # Dropped files leave the capture first: the capture holds only what the
    # archive serves, and a dropped file is served nowhere.
    for rel in sorted(dropped):
        if (ARCHIVE / rel).is_file():
            print(f'  DROPPING {rel}: ruled out of the archive')
            if not args.dry_run:
                (ARCHIVE / rel).unlink()
                sidecar = ARCHIVE / (rel + '.sanitized')
                if sidecar.is_file():
                    sidecar.unlink()
            removed += 1

    # Then correct anything already filed in the published archive that must
    # not be there. Routing on a file's own scope alone misses a public file
    # inside a committee that is not, and the published tree is the one place
    # where that mistake reaches a reader.
    for row in rows:
        rel = row['FileLocation'].lstrip('/')
        if not (ARCHIVE / rel).is_file():
            continue
        body = (ARCHIVE / rel).read_bytes()
        by_metadata = kept_private(rel, row)
        by_content = not by_metadata and looks_like_member_roster(body, rel)
        if not (by_metadata or by_content):
            continue
        destination = CUSTODY / 'www.footbag.org' / rel
        reason = ('reads as a member roster export' if by_content
                  else 'ruled private' if ruling(row) else 'committee-scoped')
        print(f'  RELOCATING {rel}: {reason}, belongs in private custody')
        if not args.dry_run:
            write(destination, body, args.dry_run)
            (ARCHIVE / rel).unlink()
        manifest_rows.append((rel, 'file', str(len(body)),
                              hashlib.sha256(body).hexdigest(), note_for(row, groups)))
        relocated += 1

    # A file held privately that the maintainer ruled into the archive is copied
    # in from custody, and its custody copy goes below once the two match. A
    # file that reads as a member roster, or whose type the archive
    # does not serve, is held back and named, so a ruling made from its name and
    # description alone never publishes a roster or an unservable file.
    released = 0
    for row in rows:
        if ruling(row) != 'archive':
            continue
        rel = row['FileLocation'].lstrip('/')
        source = CUSTODY / 'www.footbag.org' / rel
        if (ARCHIVE / rel).is_file() or not source.is_file():
            continue
        body = source.read_bytes()
        if looks_like_member_roster(body, rel):
            print(f'  HELD BACK {rel}: ruled into the archive but reads as a member '
                  'roster export; confirm the ruling')
        elif crawler.publish_would_withhold(rel, withheld):
            print(f'  HELD BACK {rel}: ruled into the archive but the archive does not '
                  f'serve its type; rule it custody or drop in {RULINGS.name}')
        elif needs_sanitization(rel) and not (ARCHIVE / (rel + '.sanitized')).is_file():
            print(f'  HELD BACK {rel}: ruled into the archive but an image or video '
                  'needs the crawler\'s re-encode first')
        else:
            print(f'  RELEASING {rel}: ruled into the archive')
            write(ARCHIVE / rel, body, args.dry_run)
            released += 1
            continue
        failed += 1
        unresolved.append(rel)

    # Every file has one home. A dropped file is held nowhere, so its custody
    # copy goes; a file ruled into the archive is served, so its custody copy
    # goes once the archive holds the same bytes. The private repository's
    # history keeps every removed copy.
    custody_removed = 0
    archived = {row['FileLocation'].lstrip('/') for row in rows if ruling(row) == 'archive'}
    for rel in sorted(dropped | archived):
        copy = CUSTODY / 'www.footbag.org' / rel
        if not copy.is_file():
            continue
        if rel in archived and not (
                (ARCHIVE / rel).is_file()
                and (ARCHIVE / rel).read_bytes() == copy.read_bytes()):
            continue
        reason = 'dropped by ruling' if rel in dropped else 'served from the archive'
        print(f'  REMOVING CUSTODY COPY {rel}: {reason}')
        if not args.dry_run:
            copy.unlink()
        custody_removed += 1

    for row in rows:
        rel = row['FileLocation'].lstrip('/')
        where = held(rel, gone, dropped)
        if rel in needs_ruling and where not in ('custody', 'gone from live'):
            print(f'  NEEDS A RULING {rel}: members could open it, but the archive '
                  f'does not serve its type; add it to {RULINGS.name}')
            failed += 1
            unresolved.append(rel)
            continue
        if where in ('archive', 'custody', 'gone from live', 'dropped by ruling'):
            continue
        scoped = kept_private(rel, row)
        if args.offline and where != 'previous capture':
            # Nothing is fetched offline; the closing check names it.
            not_fetched += 1
            continue
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
            body = kept
            try:
                if args.offline:
                    raise ValueError('offline: the earlier capture is the only source')
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
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in GONE_STATUSES:
                print(f'  GONE {rel}: the live site answers {status}; '
                      f'recorded in {GONE_FROM_LIVE.name}')
                gone_rows.append((rel, str(status), time.strftime('%Y-%m-%d')))
                gone.add(rel)
                continue
            print(f'  FAILED {rel}: {exc}')
            failed += 1
            unresolved.append(rel)
            continue
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

    # A captured copy the inventory does not name, placed by path.
    for rel, placement in sorted(ruled_paths.items()):
        if placement == 'custody' and (ARCHIVE / rel).is_file():
            body = (ARCHIVE / rel).read_bytes()
            print(f'  RELOCATING {rel}: ruled private')
            write(CUSTODY / 'www.footbag.org' / rel, body, args.dry_run)
            if not args.dry_run:
                (ARCHIVE / rel).unlink()
            manifest_rows.append((rel, 'file', str(len(body)),
                                  hashlib.sha256(body).hexdigest(), 'ruled private by path'))
            relocated += 1

    # Logo packs ruled for conversion: the pack is held privately and its logos
    # are served as images where the pack was posted.
    converted = 0
    for row in rows:
        if ruling(row) != 'convert-logo':
            continue
        rel = row['FileLocation'].lstrip('/')
        pack = CUSTODY / 'www.footbag.org' / rel
        if not pack.is_file():
            continue
        try:
            converted += len(convert_logo_pack(pack, (ARCHIVE / rel).parent, args.dry_run))
        except (zipfile.BadZipFile, subprocess.SubprocessError, OSError,
                RuntimeError) as exc:
            print(f'  FAILED converting {rel}: {exc}')
            failed += 1
            unresolved.append(rel)

    append_manifest(manifest_rows, args.dry_run)
    record_gone(gone_rows, args.dry_run)

    print(f'\nrelocated out of the published archive: {relocated}')
    print(f'dropped from the capture by ruling    : {removed}')
    print(f'released from custody by ruling       : {released}')
    print(f'custody copies removed by ruling      : {custody_removed}')
    print(f'recovered into the published archive : {fetched_public}')
    print(f'recovered into private custody       : {fetched_private}')
    print(f'copied from the earlier capture      : {copied}')
    print(f'logos converted for the archive      : {converted}')
    print(f'newly recorded as gone from live     : {len(gone_rows)}')
    print(f'could not be recovered               : {failed}')

    # The closing assertion: every recorded file now has exactly one home, or
    # the live site's own answer that it has none, or a ruling that drops it.
    if args.dry_run:
        print('\ndry run: nothing was written, so the inventory check is skipped')
        return 0
    places = {}
    for row in rows:
        rel = row['FileLocation'].lstrip('/')
        places.setdefault(held(rel, gone, dropped), []).append(rel)
    homeless = places.get(None, []) + places.get('previous capture', [])
    print(f"\nin the archive: {len(places.get('archive', []))}, "
          f"in custody: {len(places.get('custody', []))}, "
          f"dropped by ruling: {len(places.get('dropped by ruling', []))}, "
          f"gone from live: {len(places.get('gone from live', []))}, "
          f'held nowhere: {len(homeless)}')
    if homeless:
        print(f'\nSTILL HELD NOWHERE: {len(homeless)}')
        for rel in homeless:
            print('   ', rel)
        if args.offline:
            print(f'offline: {not_fetched} file(s) were not fetched; a network crawl '
                  'brings them in')
            return 3
        return 1
    if failed:
        return 1
    print(f'\nAll {len(rows)} recorded group files are held or recorded as gone '
          'from the live site. The earlier capture holds nothing unique among them.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
