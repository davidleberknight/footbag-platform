"""Byte-level checks on the files an archive edit would write to the bucket.

Once the production archive bucket is the source of truth, a change to the
archive is a handful of pages and media files edited by hand and pushed back.
Nothing re-crawls them and nothing re-sanitizes them, so every promise the
archive makes about what it serves has to hold for the edited bytes before
they leave the workstation. This is that check. It is read-only and uses the
standard library only, so it runs on any workstation without an environment.

What it refuses, one finding per offending file and rule:
  - a file type the archive does not serve: anything outside pages, jpg, gif,
    mp4, PDF, stylesheets and their fonts, calendar exports, favicons, plain
    text and PostScript, or anything the publish exclusion list withholds;
  - code of any kind: a script, applet or server program by file type, a
    <script> element, or a server-side include directive left in a comment;
  - a form control, whose backend no longer exists, and a password field;
  - a page with no character-set declaration near its top, where a browser
    falls back to a legacy encoding and every accented name turns to mojibake;
  - image or binary bytes under a page name, and a page under a media name;
  - an absolute address on the retired legacy hosts, which goes dark at
    shutdown, and any resource loaded from another website, which runs code
    or reports the reader to a third party;
  - a page that renders nothing (a husk);
  - an in-archive link that resolves to no key, judged against the bucket's
    own key listing plus the files being written, minus the keys being
    deleted; and any page anywhere in the pulled tree that still links to a
    key being deleted.

XML the legacy site served under an .html name (feeds, JSON endpoints) is
data rather than a page, and the page rules leave it alone.

Usage:
    python3 scripts/check-archive-pages.py --root DIR --bucket-keys FILE
                                           [--only FILE] [--deleted FILE]

  --root DIR          the pulled tree; a file's path under it is its key
  --bucket-keys FILE  every key the bucket holds, one per line
  --only FILE         the paths under DIR to check, one per line (default:
                      every file under DIR); pages outside it are still read
                      for links to deleted keys
  --deleted FILE      keys the edit deletes, one per line

Prints one line per finding, '<key>: <rule>: <detail>', and exits 1 when there
is any, 0 when there is none, 2 on a usage error.
"""
import argparse
import fnmatch
import html
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

SCRIPT_DIR = Path(__file__).resolve().parent
PUBLISH_EXCLUSIONS = SCRIPT_DIR / 'archive-publish-exclusions.txt'

PAGE_SUFFIXES = ('.html', '.htm')

# What the archive is made of. The same set the publisher serves: pages, the
# image and video formats the capture was converted to, stylesheets and their
# fonts, published documents, calendar exports and favicons, and the plain-text
# results and PostScript panel patterns nothing else holds.
SERVED_SUFFIXES = frozenset({
    '.html', '.htm', '.jpg', '.gif', '.mp4', '.css', '.pdf', '.ics', '.ttf',
    '.eot', '.woff', '.woff2', '.ico', '.txt', '.ps',
})

# Types a static archive cannot hold whatever they contain, because each one
# runs: browser script, applets and behaviour files, macro-enabled office
# documents, server programs and native executables. Listed apart from the
# served set so a finding says "code" rather than only "not served".
CODE_PATTERNS = (
    '*.js', '*.mjs', '*.swf', '*.htc', '*.xltm', '*.xlsm', '*.xlam', '*.docm',
    '*.dotm', '*.pptm', '*.php', '*.phtml', '*.cgi', '*.pl', '*.py', '*.sh',
    '*.asp', '*.aspx', '*.jsp', '*.exe', '*.dll', '*.bat', '*.cmd', '*.vbs',
    '*.wsf', '*.hta', '*.jar', '*.class', '*.ps1', '*.map',
)

# The two hosts the archive was captured from, and the DNS aliases of the main
# site. An absolute address on any of them resolves only while the legacy
# server answers.
CRAWL_HOSTS = frozenset({'www.footbag.org', 'sites.footbag.org'})
WWW_ALIAS_HOSTS = frozenset({
    'footbag.org', 'v.footbag.org', 'worlds.footbag.org',
    'worldchampionships.footbag.org', 'fi.footbag.org', 'ftp.footbag.org',
})
RETIRED_HOST_ATTRS = ('href', 'src', 'poster', 'altsrc')

# Attributes through which a page loads a resource, rather than links to one.
OFFSITE_RESOURCE_ATTRS = {
    'img': ('src', 'srcset'), 'iframe': ('src',), 'frame': ('src',),
    'embed': ('src',), 'object': ('data',), 'param': ('value',),
    'source': ('src', 'srcset'), 'track': ('src',),
    'video': ('src', 'poster'), 'audio': ('src',), 'input': ('src',),
}

META_REFRESH_RE = re.compile(
    r'^\s*([^;,]*)[;,]\s*url\s*=\s*([\'"]?)(.*?)\2\s*$', re.IGNORECASE)

# A server-side include: an instruction to the old web server kept in a
# comment. No browser runs it, but it is server code and the archive holds none.
SERVER_DIRECTIVE_RE = re.compile(
    rb'<!--\s*#\s*(?:include|exec|echo|config|set|if|elif|else|endif|flastmod|'
    rb'fsize|printenv)\b.*?-->', re.S | re.I)

# A real encoding declaration, not merely the word, within the window a
# browser sniffs. The '=' is what keeps a spreadsheet export's
# 'mso-font-charset:' CSS property from passing for one.
CHARSET_DECLARATION_RE = re.compile(
    r'<meta[^>]+charset\s*=|charset\s*=\s*["\']?[\w-]+', re.IGNORECASE)
CHARSET_WINDOW = 2048

# Byte shapes no text page carries in its head: image container markers and a
# NUL byte, which no UTF-8 page holds and every binary container does.
BINARY_UNDER_PAGE_HINTS = (b'JFIF', b'\x89PNG', b'GIF87a', b'GIF89a', b'\x00')
IMAGE_MAGIC = (b'\xff\xd8\xff', b'\x89PNG\r\n\x1a\n', b'GIF87a', b'GIF89a')
MEDIA_SUFFIXES = ('.jpg', '.gif', '.mp4')

# The archive's own header and footer bands, which are not the page's content.
HEADER_BAND_RE = re.compile(
    rb'<div\b[^>]*\bid=["\']mirror-archive-banner["\'][^>]*>.*?</div>', re.S | re.I)
FOOTER_BAND_RE = re.compile(
    rb'<div\b[^>]*\bid=["\']mirror-archive-footer["\'][^>]*>.*?</div>', re.S | re.I)

# In-archive references a browser requests, read from the bytes. Markup inside
# a comment, and markup the page escaped so it displays as words, requests
# nothing and is removed first.
LOCAL_REF_RE = re.compile(
    rb'(?:href|src|xlink:href|background)=(?:"([^"]{1,400})"|\'([^\']{1,400})\')',
    re.IGNORECASE)
MARKUP_COMMENT_RE = re.compile(rb'<!--.*?-->', re.DOTALL)
ESCAPED_MARKUP_RE = re.compile(rb'&lt;[A-Za-z/!][^&]{0,400}?&gt;', re.IGNORECASE)
OFFSITE_REF_PREFIXES = ('#', 'http:', 'https:', 'mailto:', 'javascript:', 'data:', '//')


class Elements(HTMLParser):
    """Every real element on a page with its attributes. Comments are skipped,
    because markup the legacy site commented out renders nothing."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.found = []

    def handle_starttag(self, tag, attrs):
        self.found.append((tag, {k: (v or '') for k, v in attrs}))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def elements(blob):
    parser = Elements()
    try:
        parser.feed(blob.decode('utf-8', errors='replace'))
        parser.close()
    except Exception:  # noqa: BLE001 -- a page the parser cannot finish is still judged on what it read
        pass
    return parser.found


def is_xml(blob):
    return blob[:200].lstrip().startswith(b'<?xml')


def load_exclusions():
    patterns = []
    if not PUBLISH_EXCLUSIONS.is_file():
        return patterns
    for line in PUBLISH_EXCLUSIONS.read_text(encoding='utf-8').splitlines():
        line = line.split('#', 1)[0].strip()
        if line:
            patterns.append(line)
    return patterns


def matches_any(key, patterns):
    name = key.rsplit('/', 1)[-1]
    return any(fnmatch.fnmatchcase(key, p) or fnmatch.fnmatchcase(name, p) for p in patterns)


def names_retired_host(url):
    if not isinstance(url, str):
        return False
    url = re.sub(r'[\t\r\n]', '', url).strip()
    if not url.lower().startswith(('http://', 'https://')):
        return False
    parts = urlsplit(url)
    host = parts.netloc.lower().split('@')[-1].split(':', 1)[0]
    if host in WWW_ALIAS_HOSTS:
        host = 'www.footbag.org'
    # The site root is the archive banner's deliberate way out to the live site.
    return host in CRAWL_HOSTS and parts.path not in ('', '/')


def offsite_url(value):
    if not isinstance(value, str):
        return None
    url = re.sub(r'[\t\r\n]', '', value).strip()
    while '&amp;' in url:
        url = url.replace('&amp;', '&')
    if url.startswith('//'):
        url = 'http:' + url
    if not url.lower().startswith(('http://', 'https://')):
        return None
    host = urlsplit(url).netloc.lower().split('@')[-1].split(':', 1)[0]
    if host == 'footbag.org' or host.endswith('.footbag.org'):
        return None
    return url


def srcset_urls(value):
    return [item.strip().split()[0] for item in (value or '').split(',') if item.strip()]


def page_local_refs(blob):
    inert = ESCAPED_MARKUP_RE.sub(b'', MARKUP_COMMENT_RE.sub(b'', blob))
    for m in LOCAL_REF_RE.finditer(inert):
        raw = m.group(1) if m.group(1) is not None else m.group(2)
        ref = html.unescape(raw.decode('utf-8', errors='replace')).strip()
        if ref and not ref.startswith(OFFSITE_REF_PREFIXES):
            yield ref


def resolve_ref(ref, page_key):
    """The key a reference lands on, or None when it leaves the archive.

    A reference beginning '/' is relative to the archive root; anything else is
    relative to the page's own directory. A directory address resolves to the
    directory's index page, which is what the archive's edge function serves.
    """
    target = unquote(urlsplit(ref).path)
    if not target:
        return None
    if target.startswith('/'):
        joined = target.lstrip('/')
    else:
        joined = os.path.join(os.path.dirname(page_key), target)
    resolved = os.path.normpath(joined) if joined else '.'
    if resolved.startswith('..'):
        return None
    if resolved == '.':
        resolved = ''
    if target.endswith('/') and resolved:
        resolved += '/'
    return resolved


def lands_on(resolved, keys):
    if resolved == '' or resolved.endswith('/'):
        return resolved + 'index.html' in keys
    return resolved in keys or resolved + '/index.html' in keys


def check_page(key, blob, keys, out):
    found = elements(blob)
    tags = {tag for tag, _ in found}
    if 'form' in tags:
        out.append((key, 'form control', 'a <form> whose backend no longer exists'))
    if 'script' in tags:
        out.append((key, 'code', 'a <script> element'))
    for tag, attrs in found:
        if tag == 'input' and 'password' in (attrs.get('name', '') + ' ' + attrs.get('type', '')).lower():
            out.append((key, 'credential field', 'a password input'))
            break
    if SERVER_DIRECTIVE_RE.search(blob):
        out.append((key, 'code', 'a server-side include directive'))

    head = blob[:CHARSET_WINDOW].decode('utf-8', errors='replace')
    if not CHARSET_DECLARATION_RE.search(head):
        out.append((key, 'no character set', 'no encoding declared near the top of the page'))

    for tag, attrs in found:
        for url in srcset_urls(attrs.get('srcset')):
            if names_retired_host(url):
                out.append((key, 'live-host reference', f'srcset {url}'))
        if tag == 'meta' and attrs.get('http-equiv', '').strip().lower() == 'refresh':
            m = META_REFRESH_RE.match(attrs.get('content', ''))
            if m and names_retired_host(m.group(3).strip()):
                out.append((key, 'live-host reference', f'refresh {m.group(3).strip()}'))
        for attr in RETIRED_HOST_ATTRS:
            if names_retired_host(attrs.get(attr)):
                out.append((key, 'live-host reference', attrs[attr]))
        resource_attrs = list(OFFSITE_RESOURCE_ATTRS.get(tag, ()))
        if 'background' in attrs:
            resource_attrs.append('background')
        for attr in resource_attrs:
            values = srcset_urls(attrs.get(attr)) if attr == 'srcset' else [attrs.get(attr)]
            for value in values:
                url = offsite_url(value)
                if url:
                    out.append((key, 'off-site resource', f'<{tag} {attr}> {url}'))

    body = HEADER_BAND_RE.sub(b'', FOOTER_BAND_RE.sub(b'', blob)).decode('utf-8', errors='replace')
    if not re.sub(r'<[^>]*>', '', body).strip() and not re.search(
            r'<(?:img|a|video|embed|object|iframe|frame)\b', body, re.I):
        out.append((key, 'empty page', 'renders nothing'))

    for ref in dict.fromkeys(page_local_refs(blob)):
        resolved = resolve_ref(ref, key)
        if resolved is not None and not lands_on(resolved, keys):
            out.append((key, 'dead link', ref))


def check_file(key, path, keys, exclusions, out):
    suffix = os.path.splitext(key)[1].lower()
    if matches_any(key, CODE_PATTERNS):
        out.append((key, 'code', 'a file type that runs'))
    elif suffix not in SERVED_SUFFIXES:
        out.append((key, 'type not served', suffix or 'no extension'))
    elif matches_any(key, exclusions):
        out.append((key, 'type not served', 'withheld by the publish exclusion list'))
    try:
        blob = path.read_bytes()
    except OSError as exc:
        out.append((key, 'unreadable', str(exc)))
        return
    if suffix in PAGE_SUFFIXES:
        head = blob[:512]
        if head.startswith(IMAGE_MAGIC) or any(h in head for h in BINARY_UNDER_PAGE_HINTS):
            out.append((key, 'binary under a page name', 'image or binary bytes'))
            return
        if not is_xml(blob):
            check_page(key, blob, keys, out)
    elif suffix in MEDIA_SUFFIXES:
        if blob[:512].lstrip().lower().startswith((b'<!doctype', b'<html', b'<meta')):
            out.append((key, 'page under a media name', 'an HTML document'))


def read_lines(path):
    return [line for line in Path(path).read_text(encoding='utf-8').splitlines() if line]


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', required=True)
    parser.add_argument('--bucket-keys', required=True)
    parser.add_argument('--only')
    parser.add_argument('--deleted')
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f'no tree at {root}', file=sys.stderr)
        return 2
    try:
        bucket_keys = set(read_lines(args.bucket_keys))
        deleted = set(read_lines(args.deleted)) if args.deleted else set()
        local = sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file())
        only = read_lines(args.only) if args.only else local
    except OSError as exc:
        print(f'cannot read an input: {exc}', file=sys.stderr)
        return 2

    keys = (bucket_keys | set(local)) - deleted
    exclusions = load_exclusions()
    findings = []
    for key in only:
        check_file(key, root / key, keys, exclusions, findings)

    # A deleted key must leave no page pointing at it. Every page in the pulled
    # tree is read, changed or not; a page the pull did not bring down is not.
    if deleted:
        for key in local:
            if key in deleted or os.path.splitext(key)[1].lower() not in PAGE_SUFFIXES:
                continue
            try:
                blob = (root / key).read_bytes()
            except OSError:
                continue
            for ref in dict.fromkeys(page_local_refs(blob)):
                resolved = resolve_ref(ref, key)
                if resolved is None:
                    continue
                landed = resolved + 'index.html' if resolved == '' or resolved.endswith('/') else resolved
                if landed in deleted or resolved + '/index.html' in deleted:
                    findings.append((key, 'links to a deleted key', ref))

    for key, rule, detail in findings:
        print(f'{key}: {rule}: {detail}')
    return 1 if findings else 0


if __name__ == '__main__':
    sys.exit(main())
