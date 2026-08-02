"""Check a finished capture against everything the archive promises.

The crawler enforces its rules while it runs, which proves the rules fired,
not that the tree they produced is sound. This reads the finished tree and
tests each promise directly, so a capture is judged on what it actually
contains rather than on the log of how it was made. It is the gate to pass
before publishing, and it is read-only: it never writes into the capture.

Every rule comes from the crawler module itself rather than being restated
here, so a rule that changes there cannot leave a stale copy passing here.
That includes the exclusion entries, the personal-detail matchers, the banner
marker, the live-site URL and the front-door derivation.

Two checks need what the operator supplies at runtime and say so loudly rather
than passing quietly when it is missing: the personal-detail scrub needs the
same FOOTBAG_MIRROR_REDACT the crawl ran with, and the exclusion check needs
the same exclusion lists.

Usage:
    python verify_archive_tree.py [--mirror DIR] [--exclusion-list PATH]...
                                  [--examples N]

Exit status is 0 only when every check passed.
"""
import argparse
import importlib.util
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CRAWLER = SCRIPT_DIR.parent / 'create_mirror_footbag_org.py'

spec = importlib.util.spec_from_file_location('mirror_crawler', str(CRAWLER))
crawler = importlib.util.module_from_spec(spec)
sys.modules['mirror_crawler'] = crawler
spec.loader.exec_module(crawler)

PAGE_SUFFIXES = ('.html', '.htm')
# What the publish step will accept. Anything else with a media-looking
# extension is a conversion the crawler never finished.
PUBLISHABLE_MEDIA = ('.mp4', '.jpg', '.gif')
UNCONVERTED_MEDIA = ('.mov', '.avi', '.wmv', '.mpg', '.mpeg', '.flv', '.ogv',
                     '.png', '.jpeg', '.bmp', '.tif', '.tiff', '.webp', '.mkv')


class Report:
    """Collects one line per check so the whole picture prints at the end."""

    def __init__(self, examples):
        self.examples = examples
        self.rows = []

    def add(self, name, failures, detail='', skipped=False):
        self.rows.append((name, list(failures), detail, skipped))

    def print(self):
        width = max(len(name) for name, *_ in self.rows)
        failed = 0
        skipped = 0
        for name, failures, detail, was_skipped in self.rows:
            if was_skipped:
                status = 'SKIP'
                skipped += 1
            elif failures:
                status = 'FAIL'
                failed += 1
            else:
                status = 'ok  '
            suffix = f'  ({detail})' if detail else ''
            print(f'  {status}  {name:{width}}{suffix}')
            for example in failures[:self.examples]:
                print(f'          {example}')
            if len(failures) > self.examples:
                print(f'          ... and {len(failures) - self.examples} more')
        print()
        print(f'{len(self.rows) - failed - skipped}/{len(self.rows)} checks passed'
              + (f', {skipped} skipped' if skipped else '')
              + (f', {failed} FAILED' if failed else ''))
        return failed == 0


def pages(www_root):
    return [p for p in sorted(www_root.rglob('*'))
            if p.is_file() and p.suffix.lower() in PAGE_SUFFIXES]


def is_xml(page):
    # XML the legacy site served under an .html name. Not a page, and every
    # page rule has to leave it alone.
    try:
        with open(page, 'rb') as handle:
            return handle.read(200).lstrip().startswith(b'<?xml')
    except OSError:
        return False


def read(page):
    try:
        return page.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return ''


def rel(path, root):
    try:
        return str(Path(path).relative_to(root))
    except ValueError:
        return str(path)


def check_personal_details(report, html_pages, www_root):
    matchers = crawler._identity_patterns()
    if not matchers:
        report.add('no personal detail of the account owner', [],
                   'no values supplied; set FOOTBAG_MIRROR_REDACT and the '
                   'sign-in address', skipped=True)
        return
    carriers = [rel(p, www_root) for p in html_pages
                if crawler.page_carries_account_identity(read(p))]
    report.add('no personal detail of the account owner', carriers,
               f'{len(matchers)} value(s) matched against {len(html_pages)} pages')


def check_exclusions(report, html_pages, www_root):
    if not crawler.CONTENT_EXCLUSIONS:
        report.add('no excluded surface survived', [],
                   'no exclusion list loaded; pass --exclusion-list', skipped=True)
        return
    base = crawler.BASE_URL.rstrip('/')
    present = []
    for page in html_pages:
        site_path = '/' + rel(page, www_root).replace(os.sep, '/')
        site_path = re.sub(r'/index\.html?$', '', site_path) or '/'
        if crawler.is_excluded_url(base + site_path):
            present.append(site_path)
    report.add('no excluded surface survived', present,
               f'{len(crawler.CONTENT_EXCLUSIONS)} exclusion entries')


def check_no_forms(report, html_pages, www_root):
    # Every form's backend stops existing at shutdown, so a surviving control
    # is a button that silently does nothing, or worse posts to the live site.
    carriers = [rel(p, www_root) for p in html_pages
                if not is_xml(p) and re.search(r'<form[\s>]', read(p), re.I)]
    report.add('no form controls anywhere', carriers)


def check_no_javascript(report, html_pages, www_root):
    carriers = [rel(p, www_root) for p in html_pages
                if not is_xml(p) and re.search(r'<script[\s>]', read(p), re.I)]
    report.add('no script elements anywhere', carriers)


def check_no_credentials(report, html_pages, www_root):
    # The legacy registration form carried the account's password in a hidden
    # input. Form stripping removes it; this is the proof, not the assumption.
    pattern = re.compile(r'memberpassword|name="password"|type="password"', re.I)
    carriers = [rel(p, www_root) for p in html_pages if pattern.search(read(p))]
    report.add('no credential field survived', carriers)


def check_banner(report, html_pages, www_root):
    marker = crawler.ARCHIVE_BANNER_MARKER
    front_doors = {Path(p).resolve() for p in crawler._front_door_pages()}
    if not front_doors:
        report.add('archive banner on every front door', [],
                   'no front doors derived; is the capture complete?', skipped=True)
        return

    missing = []
    for door in sorted(front_doors):
        if not door.is_file() or is_xml(door):
            continue
        if marker not in read(door):
            missing.append(rel(door, www_root))
    report.add('archive banner on every front door', missing,
               f'{len(front_doors)} doors derived from the capture')

    stacked = [rel(p, www_root) for p in html_pages if read(p).count(marker) > 1]
    report.add('archive banner never stacked', stacked)

    deep = [rel(p, www_root) for p in html_pages
            if p.resolve() not in front_doors and marker in read(p)]
    report.add('archive banner nowhere but the front doors', deep)

    doors_without_link = [
        rel(door, www_root) for door in sorted(front_doors)
        if door.is_file() and not is_xml(door)
        and marker in read(door) and crawler.LIVE_SITE_URL not in read(door)]
    report.add('every banner links the live site', doors_without_link,
               crawler.LIVE_SITE_URL)


def check_xml_untouched(report, html_pages, www_root):
    # XML under an .html name is data, not a page: no banner, no rewriting.
    damaged = [rel(p, www_root) for p in html_pages
               if is_xml(p) and crawler.ARCHIVE_BANNER_MARKER in read(p)]
    report.add('xml stored under an html name left alone', damaged)


def check_listing_page(report, www_root):
    listing = www_root / crawler.ARCHIVE_DIRECTORY_FILENAME
    if not listing.is_file():
        report.add('listing page built', [str(listing)])
        return
    body = read(listing)
    problems = []
    if 'complete' in body.lower():
        problems.append('claims to be complete')
    if '<script' in body.lower():
        problems.append('carries script')
    entries = len(re.findall(r'<li><a href=', body))
    if entries == 0:
        problems.append('lists nothing')
    report.add('listing page built', problems, f'{entries} entries')

    dangling = [ref for ref, fix in crawler._dangling_refs(listing, www_root)]
    report.add('every listing link resolves', dangling)


def check_member_notice(report, www_root):
    notice = www_root / 'members' / 'home' / 'index.html'
    if not notice.is_file():
        report.add('member area replaced by the notice', [str(notice)])
        return
    body = read(notice)
    problems = []
    if crawler.LIVE_SITE_URL not in body:
        problems.append('does not link the live site')
    if re.search(r'\bsign in\b.*<input', body, re.I | re.S):
        problems.append('still renders a sign-in control')
    report.add('member area replaced by the notice', problems)


def check_dead_links(report, html_pages, www_root):
    dangling = []
    for page in html_pages:
        for ref, _fix in crawler._dangling_refs(page, www_root):
            dangling.append(f'{rel(page, www_root)} -> {ref}')
    report.add('no link points at a file that is not there', dangling)


def check_media(report, www_root):
    unsanitized = []
    for media in www_root.rglob('*'):
        if not media.is_file():
            continue
        suffix = media.suffix.lower()
        if suffix in PUBLISHABLE_MEDIA and not crawler._is_already_sanitized(str(media)):
            unsanitized.append(rel(media, www_root))
    report.add('every media file carries its sanitization sidecar', unsanitized)

    leftovers = [rel(p, www_root) for p in www_root.rglob('*')
                 if p.is_file() and p.suffix.lower() in UNCONVERTED_MEDIA]
    report.add('no unconverted media left behind', leftovers)


def check_videos(report, mirror_root, html_pages, www_root):
    manifest_path = mirror_root / crawler.SKIPPED_VIDEO_MANIFEST
    if not manifest_path.is_file():
        report.add('every recorded video was backfilled', [],
                   'no video manifest; the capture recorded none', skipped=True)
        return
    manifest = crawler._load_skipped_video_manifest()
    outstanding = [f'{record.get("disposition", "not attempted")}: {key}'
                   for key, record in manifest.items()
                   if record.get('disposition') != 'backfilled']
    report.add('every recorded video was backfilled', outstanding,
               f'{len(manifest)} recorded')

    # A page still pointing at the live site for its video means the referrer
    # rewrite did not reach it, and the archive links a host that is going away.
    video_exts = '|'.join(ext.lstrip('.') for ext in crawler.VIDEO_EXTENSIONS)
    absolute = re.compile(r'https?://[^"\'\s>]+\.(?:' + video_exts + r')', re.I)
    unrelinked = [rel(p, www_root) for p in html_pages if absolute.search(read(p))]
    report.add('no page still links a video off-site', unrelinked)


def check_manifests_are_outside_the_published_subtree(report, mirror_root, www_root):
    # The publish step uploads the www subtree. sitemap.txt holds absolute
    # local filesystem paths, so a copy inside that subtree would publish the
    # crawling workstation's directory layout.
    names = (crawler.SKIPPED_VIDEO_MANIFEST, 'sitemap.txt', 'redirect_map.json',
             'mirror_progress.json')
    inside = [rel(p, www_root) for p in www_root.rglob('*')
              if p.is_file() and p.name in names]
    report.add('no crawl manifest inside the published subtree', inside)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mirror', default=crawler.MIRROR_DIR,
                        help='capture root (the directory holding www.footbag.org/)')
    parser.add_argument('--exclusion-list', action='append', default=[],
                        metavar='PATH',
                        help='the same list(s) the crawl ran with; repeatable')
    parser.add_argument('--examples', type=int, default=5,
                        help='how many offending paths to print per failed check')
    args = parser.parse_args()

    crawler.MIRROR_DIR = str(Path(args.mirror).resolve())
    mirror_root = Path(crawler.MIRROR_DIR)
    www_root = Path(crawler._www_root())
    if not www_root.is_dir():
        sys.exit(f'No capture at {www_root}')

    for path in args.exclusion_list:
        crawler.CONTENT_EXCLUSIONS |= crawler.load_content_exclusions(path)
    crawler.ACCOUNT_REDACTIONS = crawler.parse_redaction_values(
        os.environ.get(crawler.REDACTIONS_ENV_VAR, ''))
    if crawler.ACCOUNT_REDACTIONS:
        # The sign-in address is normally the first matcher and comes from the
        # username. Verification has no username, so the supplied values are
        # the whole set and the operator is told so.
        print(f'Personal-detail values supplied: {len(crawler.ACCOUNT_REDACTIONS)}')

    html_pages = pages(www_root)
    print(f'Capture: {www_root}')
    print(f'Pages: {len(html_pages)}\n')

    report = Report(args.examples)
    check_personal_details(report, html_pages, www_root)
    check_exclusions(report, html_pages, www_root)
    check_no_forms(report, html_pages, www_root)
    check_no_javascript(report, html_pages, www_root)
    check_no_credentials(report, html_pages, www_root)
    check_banner(report, html_pages, www_root)
    check_xml_untouched(report, html_pages, www_root)
    check_listing_page(report, www_root)
    check_member_notice(report, www_root)
    check_dead_links(report, html_pages, www_root)
    check_media(report, www_root)
    check_videos(report, mirror_root, html_pages, www_root)
    check_manifests_are_outside_the_published_subtree(report, mirror_root, www_root)

    sys.exit(0 if report.print() else 1)


if __name__ == '__main__':
    main()
