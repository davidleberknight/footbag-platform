"""
create_mirror_footbag_org.py: footbag.org local mirror (offline archival copy)

WARNING:
- This is a long-running archival script.
- Expect roughly ~60 GB disk usage (can vary).
- Expect it to take multiple days to complete, depending on network speed and site responsiveness.
- It downloads and rewrites a large amount of content, including media.
- ffmpeg is required: every ingested image and video is re-encoded through ffmpeg as a malware-stripping requirement (not just legacy-format conversion).

This is AI-assisted code: a bit messy in places, but it gets the job done.

What it does
- Logs into footbag.org (for member-only content access; the login cookie is
  pinned to the www host and never sent anywhere else)
- Crawls pages and media from the two live content hosts: www.footbag.org and
  the WordPress vhost sites.footbag.org (vhost pages map under the reserved
  /sites/<slug>/ prefix inside the single serving tree; DNS aliases fold onto
  www; per-host request pacing)
- Loads every seed list in mirror_seeds/ by default, so index-hidden content
  is captured too (--seeds narrows to specific lists)
- Refuses every admin/editor/mutation surface before any request is issued
- Rewrites links for offline browsing (links to hosts that are never crawled
  resolve offline: kept when a past capture exists, otherwise removed)
- Converts legacy media formats when needed
- Generates the archive navigation at the end of each run: the Archive
  Directory page, complete per-area browse indexes, and a homepage card
- Saves progress so it can resume after interruption
- --video-backfill: downloads the videos recorded by skip-mode crawls and
  repairs their referring pages

Requirements
- Python 3.10+ (likely works on nearby versions)
- ffmpeg
- pip packages: requests, beautifulsoup4

Quick setup
    sudo apt update
    sudo apt install ffmpeg

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

Usage (current CLI)
    python create_mirror_footbag_org.py <username_or_email> <password>
    python create_mirror_footbag_org.py <username_or_email> <password> -fresh
    python create_mirror_footbag_org.py <username_or_email> <password> --process-videos
    python create_mirror_footbag_org.py <username_or_email> <password> --seeds mirror_seeds/members.txt
    python create_mirror_footbag_org.py <username_or_email> <password> --video-backfill

Notes
- '-fresh' wipes previous mirror state before starting.
- '-log' enables logging to file (mirror.log).
- Progress is periodically saved and also saved on Ctrl+C / SIGTERM.
- Output is written under <script dir>/mirror_footbag_org; progress, robots
  cache, and log files also anchor to the script directory, so the crawl
  resumes correctly no matter which directory it is invoked from.
- Passing a password on the command line is convenient but not ideal (it may end up in shell history / process lists).

Video handling (videos are SKIPPED by default; pass '--process-videos' to include them)
- The primary archival crawl runs WITHOUT video binaries: the video corpus is
  large, dominated the previous multi-day crawl through the per-file ffmpeg
  re-encode, and is captured by a separate videos-only pass. Excluding binaries
  makes the page crawl fast, restartable, and auditable, so it is the default;
  '--process-videos' downloads and re-encodes them in-crawl when wanted.
- What IS still captured in this mode: every HTML page (including pages that
  contain or link to videos), images and gallery thumbnails, video poster
  images, captions and surrounding text, PDFs/documents, CSS/JS, and redirect
  pages. A page is never skipped because it contains a video.
- What is skipped: recognized video BINARIES only, detected by normalized URL
  extension (the accepted video set below plus .ogv) or, when the extension is
  not a video, by a video/* response Content-Type read from the streamed
  response headers before the body is consumed. An HTML page whose URL merely
  contains the word "video" is NOT a video.
- Every skipped video is recorded (deduplicated by normalized URL, all
  referring pages retained) in <mirror dir>/skipped_videos.json, with a
  human-readable rollup in <mirror dir>/skipped_videos_summary.txt. The
  manifest carries enough (original URL, referrers, extension, content type,
  declared length where known) to drive a future videos-only download pass.
- Skipped video links in the mirror keep their ORIGINAL absolute URL (no
  rewrite to a nonexistent local file), each marked with an HTML comment noting
  the binary was not mirrored. Skipped videos are a distinct state from
  downloaded/failed/blocked: they are never counted as failures and are not
  re-requested on resume.

Accepted robustness trade-off (documented per the mirror-gaps item): the crawl
loop marks a URL visited before its page file is written, so a crash in the
narrow window between the two loses that one page on resume. Page writes are
atomic (temp + rename), so the mirror never contains truncated files; the
visited-first ordering itself is kept because it prevents re-crawl loops after
mid-write crashes, which cost far more than one lost page.
"""

import os
import time
import requests
import logging
import mimetypes
import hashlib
import argparse
import json
from urllib.parse import urljoin, urlparse, urlunparse, unquote, parse_qs, unquote_plus, urlencode, quote
from pathlib import Path
import signal
import sys
from datetime import datetime, timedelta
import re
from bs4 import BeautifulSoup, Comment, NavigableString
import subprocess
import shutil

# ========== CONFIGURATION ==========
USERNAME = None # '<<YOU>>@footbag.org'
PASSWORD = None # '<<YOUR PASSWORD>>'

# All state paths anchor to the script directory, never the process CWD: a
# resume invoked from any directory must find the same progress file, robots
# cache, and mirror tree, or it silently restarts the multi-day crawl.
SCRIPT_DIR = Path(__file__).resolve().parent

MIRROR_DIR = str(SCRIPT_DIR / "mirror_footbag_org")
BASE_URL = 'http://www.footbag.org'
WWW_HOST = 'www.footbag.org'

# Hosts the crawler fetches pages AND media from. www.footbag.org is the legacy
# PHP main site and serves at the archive root; sites.footbag.org is the
# WordPress multisite vhost, whose pages map under a reserved prefix inside the
# www tree (HOST_TREE_PREFIX). Every other *.footbag.org host is a www alias,
# dead, mail-only, or admin/internal, and is never crawled as its own host.
CRAWL_HOSTS = frozenset({'www.footbag.org', 'sites.footbag.org'})

# Non-www content hosts map their pages under ONE reserved, hostname-free
# top-level prefix INSIDE the www serving tree, so the whole capture serves as a
# single host (archive.footbag.org) with correct relative links and no legacy
# hostname in the HTML. www itself stays at the tree root, unchanged. The prefix
# is refused as a real www path segment (both directions), so it can never
# collide with legacy content.
HOST_TREE_PREFIX = {
    'sites.footbag.org': 'sites',
}
RESERVED_HOST_PREFIXES = frozenset(HOST_TREE_PREFIX.values())

# DNS aliases of the main site (CNAME to www or the apex, same content).
# normalize_url folds them onto www so one page has one key, one file, and one
# rewritten link target; an alias hostname therefore never reaches the mirror.
WWW_ALIAS_HOSTS = frozenset({
    'footbag.org', 'v.footbag.org', 'worlds.footbag.org',
    'worldchampionships.footbag.org', 'fi.footbag.org', 'ftp.footbag.org',
})

# WordPress sites verified to serve the SAME pages on www (cross-published):
# their vhost URLs canonicalize to the www twin so each page is stored once, in
# the www tree. A site enters this set only after its path-equivalence is
# verified against the live hosts; an unverified site double-stores under the
# reserved prefix instead, because losing vhost content is worse than storing
# it twice.
CROSS_PUBLISHED_SITES = frozenset()

# Video handling: by default the crawl EXCLUDES video binaries while still
# capturing every page, poster, thumbnail, caption, and link that surrounds
# them; pass --process-videos to download and re-encode them instead. Set from
# the CLI in main(). Skipping is the default because video binaries dominate
# crawl time and disk; each skipped video is recorded for a later videos-only pass.
SKIP_VIDEOS = True
# Distinct return marker for a deliberately skipped video: callers must keep
# the original reference (it is neither a local filepath nor a failure).
SKIPPED_VIDEO = '__SKIPPED_VIDEO__'
SKIPPED_VIDEO_MANIFEST = 'skipped_videos.json'
SKIPPED_VIDEO_SUMMARY = 'skipped_videos_summary.txt'

START_URLS = [
    BASE_URL + '/members/home/',
    BASE_URL + '/',
    BASE_URL + '/events/show/1741024635', # See a recent event in the queue
    'http://sites.footbag.org/',          # WordPress vhost root (lists the sites)
]

# Seed-URL lists: whole content classes the live site's own filtered indexes
# never link (hidden clubs, invisible gallery sets, news permalinks, ...), fed
# to the crawler directly. By default EVERY .txt in this directory is loaded —
# the archival crawl wants all content; --seeds narrows to specific files for a
# targeted run (e.g. a members-profile-only crawl).
SEEDS_DIR = str(SCRIPT_DIR / 'mirror_seeds')

DELAY_SECONDS = 0.25 # Polite delay between requests to live site.
MAX_RETRIES = 1  # Retry only once after failure
TRANSIENT_RETRY_CODES = {500, 502, 503, 504} # as opposed to permanent failures 
SITEMAP_FILE = 'sitemap.txt'
LOG_FILE = str(SCRIPT_DIR / 'mirror.log')
LOG_TO_FILE = False  # default off; set True if you want mirror.log
PROGRESS_FILE = str(SCRIPT_DIR / 'mirror_progress.json')
ROBOTS_CACHE_FILE = str(SCRIPT_DIR / 'robots_cache.json')

def parse_args():
    parser = argparse.ArgumentParser(
        description="Create a local mirror of footbag.org."
    )
    parser.add_argument("username", help="footbag.org username/email")
    parser.add_argument("password", help="footbag.org password")
    parser.add_argument(
        "-fresh",
        action="store_true",
        help=f"Wipe previous mirror dir ({MIRROR_DIR}) and progress file ({PROGRESS_FILE}) before starting"
    )
    parser.add_argument(
        "-log",
        dest="log_to_file",
        action="store_true",
        help="Enable logging to file"
    )
    parser.add_argument(
        "--process-videos",
        dest="process_videos",
        action="store_true",
        help=(
            "Download and re-encode video binaries in this crawl. Without this "
            "flag videos are SKIPPED (the default for the primary archival "
            "crawl): pages, posters, thumbnails, captions, and links are still "
            "captured, and every skipped video is recorded in "
            f"{SKIPPED_VIDEO_MANIFEST} inside the mirror directory with its "
            "original URL, for a later videos-only pass."
        )
    )
    parser.add_argument(
        "--skip-videos",
        dest="skip_videos",
        action="store_true",
        help=(
            "No-op: video binaries are skipped by default. Accepted so existing "
            "commands keep working. Pass --process-videos to include videos."
        )
    )
    parser.add_argument(
        "--seeds",
        dest="seeds",
        nargs='+',
        metavar='PATH',
        default=None,
        help=(
            "Seed-list files or directories of .txt files (absolute URLs, one "
            "per line) to enqueue at depth 0. Default: every .txt in "
            f"{SEEDS_DIR} — the archival crawl loads all seed classes. Pass "
            "specific files to narrow a targeted run."
        )
    )
    parser.add_argument(
        "--video-backfill",
        dest="video_backfill",
        action="store_true",
        help=(
            "Instead of crawling, download and re-encode every video recorded "
            f"in {SKIPPED_VIDEO_MANIFEST} by earlier skip-mode crawls, then "
            "rewrite the referring pages to link the local mp4 files. Each "
            "record's outcome is written back to the manifest."
        )
    )

    # If run with no args, show the full help text (instead of just a terse error)
    if len(sys.argv) == 1:
        parser.print_help()
        parser.exit(2)

    return parser.parse_args()

def wipe_previous_mirror_state():
    if os.path.isdir(MIRROR_DIR):
        shutil.rmtree(MIRROR_DIR)
        logging.info(f"Removed mirror directory: {MIRROR_DIR}")
    else:
        logging.info(f"No mirror directory to remove: {MIRROR_DIR}")

    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
        logging.info(f"Removed progress file: {PROGRESS_FILE}")
    else:
        logging.info(f"No progress file to remove: {PROGRESS_FILE}")
    
    if os.path.exists(ROBOTS_CACHE_FILE):
        os.remove(ROBOTS_CACHE_FILE)
        logging.info(f"Removed robots cache file: {ROBOTS_CACHE_FILE}")
    else:
        logging.info(f"No robots cache file to remove: {ROBOTS_CACHE_FILE}")
    
    if os.path.exists(LOG_FILE):
        os.remove(LOG_FILE)
        logging.info(f"Removed log file: {LOG_FILE}")
    else:
        logging.info(f"No log file to remove: {LOG_FILE}")

LOGIN_URL = 'http://www.footbag.org/members/authorize'
LOGIN_TARGET = '/members/home'

MAX_DEPTH = 50 # Will stop at very old event and news pages (back to 1975)
MAX_URLS = 1000000
MAX_FILE_SIZE = 160 * 1024 * 1024  # 160MB # 167279451 bytes is largest known
SKIP_EXTENSIONS = [
    '.zip', '.tar.gz', '.exe', '.dmg', '.asx', '.php', '.sh', '.xml',
    '.mp3', '.ogg', '.wav', '.aac', '.m4a',
    '.svg',
]
RESUME_ON_RESTART = True
# This is the IFPA's own sanctioned full-archive backup of sites it owns, run by
# an administrator, so robots.txt is advisory and not honored: the WordPress
# vhost ships the default "discourage search engines" Disallow: / that would
# otherwise block the entire microsite capture, and the main site's robots
# excludes legacy content the backup wants. Ignoring robots does not make the
# crawl harmful: it stays read-only (GET only), refuses every state-changing and
# admin/editor route before issuing a request (is_unsafe_url), paces requests
# per host, caps file size, and pins the member cookie to the main host. The
# flag is kept so a non-owner run can re-enable robots.
RESPECT_ROBOTS_TXT = False
USER_AGENT = 'FootbagMirror/1.0 (Archival/Backup Purpose)'
SESSION_TIMEOUT = 360000  # 1 hour
DUPLICATE_DETECTION = True

# All accepted media extensions are flagged convertible=True: every image and video
# is re-encoded through ffmpeg/Sharp-equivalent on ingest as a malware-stripping
# requirement (DD §6.8 line 2492). Audio (.mp3 etc.) and .svg are not in the
# accepted set; they live in SKIP_EXTENSIONS above.
MEDIA_FORMATS = {
    '.mp4':  ('video/mp4', True),
    '.mov':  ('video/quicktime', True),
    '.avi':  ('video/x-msvideo', True),
    '.mkv':  ('video/x-matroska', True),
    '.webm': ('video/webm', True),
    '.wmv':  ('video/x-ms-wmv', True),
    '.divx': ('video/x-msvideo', True),
    '.mpg':  ('video/mpeg', True),
    '.mpeg': ('video/mpeg', True),
    '.flv':  ('video/x-flv', True),
    '.m4v':  ('video/mp4', True),
    '.ogv':  ('video/ogg', True),
    '.jpg':  ('image/jpeg', True),
    '.jpeg': ('image/jpeg', True),
    '.png':  ('image/png', True),
    # GIFs stay as GIFs (animation preserved). ffmpeg roundtrip still
    # runs for malware stripping; output is .gif, not .jpg.
    '.gif':  ('image/gif', True),
    '.bmp':  ('image/bmp', True),
    '.tiff': ('image/tiff', True),
    '.tif':  ('image/tiff', True),
    '.webp': ('image/webp', True),
}

VIDEO_EXTENSIONS = {ext for ext, (mime, _) in MEDIA_FORMATS.items() if mime.startswith('video/')}
IMAGE_EXTENSIONS = {ext for ext, (mime, _) in MEDIA_FORMATS.items() if mime.startswith('image/')}
CONVERTIBLE_EXTENSIONS = {ext for ext, (_, convertible) in MEDIA_FORMATS.items() if convertible}

# URL Query Parameters used on live site - that we care about:
# /clubs/list', 'Country'),
# /events/past', 'year'),
# /events/results', 'year'),
# /clubs/showmembers', 'ClubID'),
# /news/list', 'Year'),
# /faq/show?id=paradox-tutorial (also sid=...)
# /registration/register', 'tid'),       
# /registration/regsummary', 'tid'),       
# /registration/listevent?eid= (We ignore event ids but we could add this feature)
# /newmoves/addhint?id=21 (ignored for now, creates incorrect newmoves/addhint/index.html, not a big deal)

def _atomic_write_text(path, text):
    """Write a text file via temp + rename so a crash never leaves a truncated
    file that a resumed crawl (which trusts visited/exists state) would keep."""
    temp_path = str(path) + '.tmp'
    with open(temp_path, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(temp_path, path)


class MirrorState:
    def __init__(self):
        self.visited = set()
        self.failed_urls = set()
        self.failed_conversion_videos = set()
        # Deliberately skipped videos (--skip-videos): normalized URL -> record.
        # A distinct state from downloaded / failed / blocked / unvisited; never
        # counted as a failure and never re-requested on resume.
        self.skipped_videos = {}
        self.sitemap = []
        self.queue = []
        self.url_depth = {}
        self.content_hashes = {}
        self.stats = {}
        self.regsummary_map = {}
        self.stats.setdefault('media_input_bytes', 0)
        self.stats.setdefault('media_output_bytes', 0)
        self.stats['total_urls'] = 0
        self.stats['successful_downloads'] = 0
        self.stats['failed_downloads'] = 0
        self.stats['bytes_downloaded'] = 0
        self.stats['skipped_too_large'] = 0
        self.stats['regsummary_links_detected'] = 0
        self.stats['video_conversions'] = 0
        self.stats['image_conversions'] = 0
        self.stats['magic_byte_failures'] = 0
        self.stats['skipped_videos'] = 0
        self.stats['skipped_video_declared_bytes'] = 0
        self.session_start = time.time()
        self.duplicate_redirects = {}

    def record_skipped_video(self, url, referrer=None, ext='', content_type='',
                             reason='extension', status=None, content_length=None,
                             thumbnail_or_poster=False):
        """Record a deliberately skipped video, deduplicated by normalized URL.

        Every referring page is retained on the one record. The record carries
        enough to drive a future videos-only download pass, and notes whether
        the URL's localized output already exists from a prior full crawl.
        """
        norm = normalize_url(url)
        rec = self.skipped_videos.get(norm)
        if rec is None:
            local_target = url_to_filepath(strip_query(url))
            previously_localized = False
            if local_target:
                sanitized_target = str(Path(local_target).with_suffix('.mp4'))
                previously_localized = os.path.exists(local_target) or os.path.exists(sanitized_target)
            rec = {
                'url': url,
                'normalized_url': norm,
                'referrers': [],
                'host': urlparse(url).netloc,
                'extension': ext or get_extension(url),
                'content_type': content_type,
                'detection': reason,
                'first_seen': datetime.now().isoformat(),
                'status': status,
                'content_length': int(content_length) if content_length else None,
                'thumbnail_or_poster_captured': bool(thumbnail_or_poster),
                'previously_localized': previously_localized,
                'disposition': 'skipped_video',
            }
            self.skipped_videos[norm] = rec
            self.stats['skipped_videos'] = len(self.skipped_videos)
            if content_length:
                try:
                    self.stats['skipped_video_declared_bytes'] += int(content_length)
                except (TypeError, ValueError):
                    pass
            logging.info(f"Skipped video ({reason}): {norm}")
        else:
            # A later sighting may carry evidence the first lacked.
            if content_type and not rec['content_type']:
                rec['content_type'] = content_type
            if status is not None and rec['status'] is None:
                rec['status'] = status
            if content_length and not rec['content_length']:
                try:
                    rec['content_length'] = int(content_length)
                    self.stats['skipped_video_declared_bytes'] += int(content_length)
                except (TypeError, ValueError):
                    pass
            if thumbnail_or_poster:
                rec['thumbnail_or_poster_captured'] = True
        if referrer and referrer not in rec['referrers']:
            rec['referrers'].append(referrer)
            rec['referrers'].sort()
        return rec

    def write_skipped_video_manifest(self):
        """Write the machine-readable manifest + human summary (atomic, sorted)."""
        if not SKIP_VIDEOS and not self.skipped_videos:
            return
        os.makedirs(MIRROR_DIR, exist_ok=True)
        manifest_path = os.path.join(MIRROR_DIR, SKIPPED_VIDEO_MANIFEST)
        records = [self.skipped_videos[k] for k in sorted(self.skipped_videos)]
        _atomic_write_text(manifest_path, json.dumps(records, indent=2, ensure_ascii=False))

        by_host, by_ext, by_area = {}, {}, {}
        total_bytes = 0
        # Tolerant field access: records re-loaded from an on-disk manifest
        # (e.g. by the backfill pass, possibly written by an earlier crawler
        # version) may lack optional fields a fresh record always carries.
        for rec in records:
            host = rec.get('host') or '(unknown host)'
            ext = rec.get('extension') or rec.get('content_type') or '(unknown type)'
            by_host[host] = by_host.get(host, 0) + 1
            by_ext[ext] = by_ext.get(ext, 0) + 1
            for ref in rec.get('referrers') or ['(direct)']:
                segs = [s for s in urlparse(ref).path.split('/') if s]
                area = segs[0] if segs else '(root)'
                by_area[area] = by_area.get(area, 0) + 1
            if rec.get('content_length'):
                total_bytes += rec['content_length']
        lines = [
            '# Skipped videos summary (--skip-videos mode)',
            f'# Generated: {datetime.now().isoformat()}',
            f'Total skipped video URLs: {len(records)}',
            f'Declared byte total (where the server stated a length): {total_bytes}',
            '',
            'By host:',
            *(f'  {h}: {n}' for h, n in sorted(by_host.items())),
            '',
            'By extension / content type:',
            *(f'  {e}: {n}' for e, n in sorted(by_ext.items())),
            '',
            'By referring site area (per referrer):',
            *(f'  {a}: {n}' for a, n in sorted(by_area.items())),
            '',
        ]
        _atomic_write_text(os.path.join(MIRROR_DIR, SKIPPED_VIDEO_SUMMARY), '\n'.join(lines))
        logging.info(f"Skipped-video manifest written: {manifest_path} ({len(records)} records)")

    def save_progress(self):
        """Save progress atomically to prevent corruption on interruption."""
        progress_data = {
            'visited': list(self.visited),
            'failed_urls': list(self.failed_urls),
            'failed_conversion_videos': list(self.failed_conversion_videos),
            'skipped_videos': self.skipped_videos,
            'sitemap': self.sitemap,
            'queue': self.queue,
            'url_depth': self.url_depth,
            'content_hashes': self.content_hashes,
            'stats': self.stats,
            'regsummary_map': self.regsummary_map,
            'timestamp': datetime.now().isoformat()
        }
        
        # Atomic write using temp file + rename to prevent corruption
        temp_file = PROGRESS_FILE + '.tmp'
        try:
            with open(temp_file, 'w') as f:
                json.dump(progress_data, f, indent=2)
            # os.replace() is atomic on POSIX systems
            os.replace(temp_file, PROGRESS_FILE)
            logging.info(f"Progress saved to {PROGRESS_FILE}")
        except Exception as e:
            logging.error(f"Failed to save progress: {e}")
            # Clean up temp file if it exists
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
            raise
    
    def load_progress(self):
        if not os.path.exists(PROGRESS_FILE):
            return False
        try:
            with open(PROGRESS_FILE, 'r') as f:
                data = json.load(f)
            
            self.visited = set(data.get('visited', []))
            self.failed_urls = set(data.get('failed_urls', []))
            self.failed_conversion_videos = set(data.get('failed_conversion_videos', []))
            self.skipped_videos = data.get('skipped_videos', {})
            self.sitemap = data.get('sitemap', [])
            self.queue = data.get('queue', [])
            self.url_depth = data.get('url_depth', {})
            self.content_hashes = data.get('content_hashes', {})
            self.stats = data.get('stats', self.stats)
            self.regsummary_map = data.get('regsummary_map', {})
            # Ensure all stats keys exist (for backwards compatibility with old progress files)
            self.stats.setdefault('media_input_bytes', 0)
            self.stats.setdefault('media_output_bytes', 0)
            self.stats.setdefault('total_urls', 0)
            self.stats.setdefault('successful_downloads', 0)
            self.stats.setdefault('failed_downloads', 0)
            self.stats.setdefault('bytes_downloaded', 0)
            self.stats.setdefault('skipped_too_large', 0)
            self.stats.setdefault('regsummary_links_detected', 0)
            self.stats.setdefault('video_conversions', 0)
            self.stats.setdefault('image_conversions', 0)
            self.stats.setdefault('magic_byte_failures', 0)
            self.stats.setdefault('skipped_videos', len(self.skipped_videos))
            self.stats.setdefault('skipped_video_declared_bytes', 0)
            logging.info(f"Progress loaded from {PROGRESS_FILE}")
            logging.info(f"Resuming with {len(self.visited)} visited URLs, {len(self.queue)} queued")
            return True
        except (json.JSONDecodeError, KeyError) as e:
            logging.error(f"Failed to load progress: {e}")
            return False

def _parse_robots_groups(text):
    """Parse robots.txt into [(user_agent_tokens, [(kind, path), ...]), ...].

    Standard group semantics: one or more consecutive User-agent lines open a
    group; the Allow/Disallow rules that follow belong to every agent named.
    Unknown directives and comments are ignored; malformed lines are skipped.
    """
    groups = []
    agents, rules, collecting_agents = [], [], True
    for raw in (text or '').splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line or ':' not in line:
            continue
        field, value = line.split(':', 1)
        field, value = field.strip().lower(), value.strip()
        if field == 'user-agent':
            if not collecting_agents and agents:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
            collecting_agents = True
        elif field in ('allow', 'disallow'):
            if agents:
                rules.append((field, value))
                collecting_agents = False
        # sitemap/crawl-delay/unknown fields end the agent-collection run but
        # otherwise do not affect matching.
        elif agents:
            collecting_agents = False
    if agents:
        groups.append((agents, rules))
    return groups


def _select_robots_group(groups, user_agent):
    """The applicable rule set for our crawler: the group whose agent token is
    the LONGEST case-insensitive substring match of our User-Agent product
    token wins; the '*' group applies only when no specific group matches."""
    ua = (user_agent or '').lower()
    best_rules, best_len = None, -1
    star_rules = None
    for agents, rules in groups:
        for agent in agents:
            if agent == '*':
                if star_rules is None:
                    star_rules = rules
            elif agent and agent in ua and len(agent) > best_len:
                best_rules, best_len = rules, len(agent)
    return best_rules if best_rules is not None else star_rules


def _robots_rule_matches(pattern, path):
    """RFC 9309 path matching: '*' matches any run, '$' anchors the end."""
    if not pattern:
        return False
    anchored = pattern.endswith('$')
    if anchored:
        pattern = pattern[:-1]
    regex = ''.join('.*' if ch == '*' else re.escape(ch) for ch in pattern)
    regex = '^' + regex + ('$' if anchored else '')
    return re.match(regex, path) is not None


def _robots_decision(rules, path):
    """Longest-match precedence between Allow and Disallow; ties go to Allow;
    no matching rule (or an empty Disallow) means allowed."""
    best_kind, best_len = None, -1
    for kind, pattern in rules or []:
        if not pattern:
            continue          # 'Disallow:' with no path allows everything
        if _robots_rule_matches(pattern, path):
            plen = len(pattern.rstrip('$'))
            if plen > best_len or (plen == best_len and kind == 'allow'):
                best_kind, best_len = kind, plen
    return best_kind != 'disallow'


class RobotChecker:
    """robots.txt enforcement with correct group semantics.

    The raw robots text (or an 'unavailable' marker) is cached per host in
    ROBOTS_CACHE_FILE, so a resumed crawl makes the same decisions without a
    refetch; parsing is deterministic over the cached text. The robots file is
    fetched with the crawl's own scheme and the crawler's own User-Agent.
    Documented fallback: an unfetchable, error-status, or malformed robots
    file allows the crawl — this is an authorized archival crawl of the
    operator's own site, so a missing robots file must not stall it.
    """
    def __init__(self):
        self.robots_cache = {}
        self._parsed = {}
        self.load_cache()

    def load_cache(self):
        if os.path.exists(ROBOTS_CACHE_FILE):
            try:
                with open(ROBOTS_CACHE_FILE, 'r') as f:
                    self.robots_cache = json.load(f)
            except json.JSONDecodeError:
                self.robots_cache = {}

    def save_cache(self):
        """Save robots.txt cache atomically to prevent corruption."""
        temp_file = ROBOTS_CACHE_FILE + '.tmp'
        try:
            with open(temp_file, 'w') as f:
                json.dump(self.robots_cache, f, indent=2)
            os.replace(temp_file, ROBOTS_CACHE_FILE)
        except Exception as e:
            logging.error(f"Failed to save robot cache: {e}")
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
            raise

    def _rules_for(self, domain):
        if domain in self._parsed:
            return self._parsed[domain]
        entry = self.robots_cache.get(domain)
        rules = None
        if entry and entry.get('status') == 'ok':
            rules = _select_robots_group(_parse_robots_groups(entry.get('text', '')), USER_AGENT)
        self._parsed[domain] = rules
        return rules

    def can_fetch(self, url):
        if not RESPECT_ROBOTS_TXT:
            return True

        parsed = urlparse(url)
        domain = parsed.netloc
        if domain not in self.robots_cache:
            self.robots_cache[domain] = self._fetch_robots(domain)
            self._parsed.pop(domain, None)
            self.save_cache()

        rules = self._rules_for(domain)
        if rules is None:
            return True
        return _robots_decision(rules, parsed.path or '/')

    def _fetch_robots(self, domain):
        # Same effective scheme as the crawl itself, and the crawler's own UA.
        scheme = urlparse(BASE_URL).scheme or 'http'
        robots_url = f"{scheme}://{domain}/robots.txt"
        try:
            response = requests.get(robots_url, timeout=10,
                                    headers={'User-Agent': USER_AGENT})
            if response.status_code == 200:
                return {'status': 'ok', 'text': response.text}
        except requests.RequestException:
            pass
        return {'status': 'unavailable'}

class WwwPinnedCookieJar(requests.cookies.RequestsCookieJar):
    # The legacy app may scope its member session cookie to '.footbag.org'.
    # Stored as-is, a domain cookie is replayed to every *.footbag.org host,
    # including hosts that must never see a member session. Pin every
    # footbag-rooted cookie to the www host and drop cookies from any other
    # origin, so the member cookie can only ever travel to www — even when a
    # redirect chain hops through another host.
    def set_cookie(self, cookie, *args, **kwargs):
        domain = (cookie.domain or '').lstrip('.').lower()
        if domain in ('', 'footbag.org', WWW_HOST):
            cookie.domain = WWW_HOST
            cookie.domain_initial_dot = False
            cookie.domain_specified = True
            return super().set_cookie(cookie, *args, **kwargs)
        logging.warning(f"Dropping cookie scoped to non-www domain: {cookie.domain}")
        return None


class CookielessJar(requests.cookies.RequestsCookieJar):
    # The public (non-www) session is deliberately stateless: nothing is ever
    # stored, whatever the source (server Set-Cookie or program code), so vhost
    # fetches are reproducible and carry no session identity of any kind.
    def set_cookie(self, cookie, *args, **kwargs):
        return None


# Global instances
session = requests.Session()
session.headers.update({'User-Agent': USER_AGENT})
session.cookies = WwwPinnedCookieJar()
# Cookie-less session for every host other than www (the vhost is public; the
# member session must never be presented to it).
public_session = requests.Session()
public_session.headers.update({'User-Agent': USER_AGENT})
public_session.cookies = CookielessJar()
mirror_state = MirrorState()
robot_checker = RobotChecker()


def session_for(url, www_session=None):
    # Select the session by TARGET host at every call entry: the authenticated
    # member session is used only for www; every other host gets the shared
    # cookie-less session. www_session lets a caller that received an explicit
    # session (or a test double) keep using it for www targets. Host matching
    # is case-folded so a case-varied www URL still fetches authenticated
    # (the cookie direction stays safe either way: the pinned jar never
    # releases the cookie to a non-www host).
    if urlparse(url).netloc.lower() == WWW_HOST:
        return www_session if www_session is not None else session
    return public_session


# Per-host politeness: www (rimu3) and the WordPress vhost (rimu2) are
# different physical machines, so the courtesy interval applies per host, not
# globally. Called immediately before each live request; requests to one host
# never delay requests to another.
_last_request_at = {}

def polite_wait(url):
    host = urlparse(url).netloc
    last = _last_request_at.get(host)
    if last is not None:
        remaining = DELAY_SECONDS - (time.time() - last)
        if remaining > 0:
            time.sleep(remaining)
    _last_request_at[host] = time.time()

log_handlers = [logging.StreamHandler()]
if LOG_TO_FILE:
    log_handlers.insert(0, logging.FileHandler(LOG_FILE))

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    handlers=log_handlers
)

def signal_handler(signum, frame):
    logging.info("Received interrupt signal, saving progress...")
    
    # Wrap saves in try/except to prevent crash during shutdown
    try:
        mirror_state.save_progress()
        logging.info("Progress saved successfully")
    except Exception as e:
        logging.error(f"Failed to save progress during shutdown: {e}")

    try:
        mirror_state.write_skipped_video_manifest()
    except Exception as e:
        logging.error(f"Failed to write skipped-video manifest during shutdown: {e}")
    
    try:
        robot_checker.save_cache()
        logging.info("Robot cache saved successfully")
    except Exception as e:
        logging.error(f"Failed to save robot cache during shutdown: {e}")
    
    logging.info("Shutdown complete")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def is_footbag_domain(url):
    # Classify a link as footbag-internal for rewriting. Match only the
    # footbag.org apex and its subdomains, never a lookalike such as
    # 'evilfootbag.org' that merely ends with the same text (a bare
    # endswith('footbag.org') would). The fetch allowlist is the exact-host
    # CRAWL_HOSTS set, unaffected by this predicate; a hostname belonging to the
    # footbag domain is still only fetched when it is one of the two crawl hosts.
    host = urlparse(url).netloc.lower()
    # Drop any :port so 'www.footbag.org:80' still classifies as internal.
    host = host.split(':', 1)[0]
    return host == 'footbag.org' or host.endswith('.footbag.org')

# Section/action routes whose handlers mutate server state (DELETE/UPDATE/INSERT),
# enumerated from the footbag.org application source. Fetching any of these as an
# authenticated member could change or destroy live data, so the crawler must
# never request them. registration/regsummary is intentionally NOT listed: its
# ?tid= read view is wanted archival content, while its destructive ?unreg= mode
# is blocked via DESTRUCTIVE_PARAMS below.
DESTRUCTIVE_ROUTES = frozenset({
    'clubs/edit2', 'clubs/delete', 'clubs/updatecontact', 'clubs/addcontact',
    'clubs/leaveclub', 'clubs/new2', 'clubs/deactivate', 'clubs/removecontact',
    'clubs/editclubinfo2', 'clubs/editclub2',
    'events/convertdates', 'events/edit', 'events/edit2', 'events/new2',
    'events/addresults2', 'events/rm',
    'faq/new2', 'faq/newsection2',
    'gallery/fixthumbnails', 'gallery/newalt2', 'gallery/new2', 'gallery/newset2',
    'gallery2/fixthumbnails', 'gallery2/newalt2', 'gallery2/newset2', 'gallery2/new2',
    'groups/newgroup2', 'groups/upload2', 'groups/deletefile2',
    'groups2/newgroup2', 'groups2/cullpending', 'groups2/upload2', 'groups2/deletefile2',
    'ifpa/removepending', 'ifpa/approvemembers2', 'ifpa/countvotes',
    'ifpa/editelectioninfo2', 'ifpa/tmpcreate', 'ifpa/upload2', 'ifpa/newissue2',
    'ifpa/newballot2',
    'index2/editimage', 'index2/addimage2',
    'localize/mk-en', 'localize/tmpfix', 'localize/unicodify',
    'members/delete', 'members/optout2', 'members/bademail', 'members/updateprofile',
    'members/logout', 'members/validate2', 'members/join4', 'members/join2',
    'moves/new2', 'moves/deletehint', 'moves/addhint2', 'moves/delete',
    'moves2/delete', 'moves2/addhint2', 'moves2/addjournal', 'moves2/deletehint',
    'moves2/vote', 'moves2/new2',
    'newgallery/convert',
    'news/delete', 'news/new2',
    'poll/delete', 'poll/edit2', 'poll/new2', 'poll/vote',
    'ranking/xaddresults', 'ranking/removeevent', 'ranking/removeteam',
    'ranking/addresults', 'ranking/doranks', 'ranking/newplayer2',
    'ranking/doranks_latest_wip',
    'registration/regedit2', 'registration/fixbyes', 'registration/editevent2',
    'registration/regcreate', 'registration/clonetournament', 'registration/submit',
    'registration/fixupemptyevents', 'registration/unreg', 'registration/fixupteamnames',
    'registration/regsetup2', 'registration/fixuptemplates', 'registration/assignannual',
    'registration/deleteevent', 'registration/maketemplates',
    'rules/edit2', 'rules/new2', 'rules/import',
})

# Editor / confirm / moderation / admin VIEWS enumerated from the legacy PHP app
# source (footbag_legacy_repo), keyed by section/action like DESTRUCTIVE_ROUTES.
# Distinct purpose: these are a CAPTURE prohibition, not only mutation safety. A
# member-crawler must never fetch them because they expose admin/editor content
# the member-only archive excludes, and several mutate on a plain GET (e.g.
# gallery/rotate, gallery/raiseset, clubs/activate, members/validate,
# registration/seedteams do an UPDATE with no POST/confirm guard). Read views a
# member legitimately sees are intentionally NOT here, so archival coverage of
# reader content is unchanged. Routes whose read-vs-admin status could not be
# settled from the source (e.g. ifpa/ballots, ifpa/issues, ranking/showranks)
# are deliberately omitted pending a per-route ruling, so no reader content is
# lost by guessing.
EDITOR_ADMIN_ROUTES = frozenset({
    'clubs/edit', 'clubs/editclub', 'clubs/editclubinfo', 'clubs/editcontacts',
    'clubs/new', 'clubs/joinclub', 'clubs/joinclub2', 'clubs/joinlocal',
    'clubs/activate', 'clubs/requestdelete',
    'events/addresults', 'events/new',
    'faq/edit', 'faq/edit2', 'faq/editsection', 'faq/editsection2', 'faq/new',
    'faq/newsection', 'faq/localize', 'faq/localize2', 'faq/localizesection',
    'faq/localizesection2', 'faq/fixfaq',
    'gallery/delete', 'gallery/deleteset', 'gallery/edit', 'gallery/edit2',
    'gallery/editset', 'gallery/editsetinfo', 'gallery/editsetinfo2', 'gallery/modset',
    'gallery/modset2', 'gallery/new', 'gallery/newalt', 'gallery/newset',
    'gallery/newbatch', 'gallery/batchupload', 'gallery/batchupload-prev',
    'gallery/lowerimage', 'gallery/lowerset', 'gallery/raiseimage', 'gallery/raiseset',
    'gallery/rotate', 'gallery/thumbnail', 'gallery/thumbnail2',
    'gallery2/delete', 'gallery2/deleteset', 'gallery2/edit', 'gallery2/edit2',
    'gallery2/editset', 'gallery2/editsetinfo', 'gallery2/editsetinfo2', 'gallery2/modset',
    'gallery2/modset2', 'gallery2/new', 'gallery2/newalt', 'gallery2/newset',
    'gallery2/newbatch', 'gallery2/batchupload', 'gallery2/batchupload-prev',
    'gallery2/lowerimage', 'gallery2/lowerset', 'gallery2/raiseimage', 'gallery2/raiseset',
    'gallery2/rotate', 'gallery2/thumbnail', 'gallery2/thumbnail2',
    'groups/approve', 'groups/approve2', 'groups/reject', 'groups/reject2',
    'groups/clonegroup', 'groups/deletefile', 'groups/deletemessage', 'groups/edit',
    'groups/editfile', 'groups/editfile2', 'groups/editgroup', 'groups/editgroup2',
    'groups/editgroupinfo', 'groups/editgroupinfo2', 'groups/leave', 'groups/leavegroup',
    'groups/lowermember', 'groups/raisemember', 'groups/newgroup', 'groups/removegroup',
    'groups/upload', 'groups/viewpending',
    'groups2/approve', 'groups2/approve2', 'groups2/reject', 'groups2/reject2',
    'groups2/clonegroup', 'groups2/deletefile', 'groups2/deletemessage', 'groups2/edit',
    'groups2/editfile', 'groups2/editfile2', 'groups2/editgroup', 'groups2/editgroup2',
    'groups2/editgroupinfo', 'groups2/editgroupinfo2', 'groups2/leave', 'groups2/leavegroup',
    'groups2/lowermember', 'groups2/raisemember', 'groups2/newgroup', 'groups2/removegroup',
    'groups2/upload', 'groups2/viewpending',
    'ifpa/announce', 'ifpa/announce_send', 'ifpa/approvemembers', 'ifpa/authorizemember',
    'ifpa/editelection', 'ifpa/editelectioninfo', 'ifpa/editissue', 'ifpa/editissue2',
    'ifpa/editmember', 'ifpa/editmember2', 'ifpa/lowerissue', 'ifpa/raiseissue',
    'ifpa/membermail', 'ifpa/memberpayments', 'ifpa/newballot', 'ifpa/newissue',
    'ifpa/upload', 'ifpa/vote', 'ifpa/join', 'ifpa/join2', 'ifpa/join3', 'ifpa/join2b',
    'ifpa/join3-auth', 'ifpa/joinbymail', 'ifpa/renew', 'ifpa/nominate', 'ifpa/nominate2',
    'ifpa/sanctionclub', 'ifpa/sanctionevent', 'ifpa/sanctionevent2',
    'ifpa/ifpa_instant_join', 'ifpa/paypalreturn', 'ifpa/blessmember',
    'index2/addimage', 'index2/editimage2',
    'localize/editlocale', 'localize/editrealm', 'localize/localize', 'localize/makelocale',
    'localize/bulklocalize', 'localize/fix-jp', 'localize/unicodify-saved',
    'members/editprofile', 'members/neweditprofile', 'members/optout', 'members/validate',
    'members/join3', 'members/bulkbademail', 'members/requesthelp2', 'members/activate',
    'moves/edit', 'moves/edit2', 'moves/edithint', 'moves/new', 'moves/addhint',
    'moves2/edit', 'moves2/edit2', 'moves2/edithint', 'moves2/new', 'moves2/addhint',
    'moves2/journal', 'moves2/journalcheck', 'moves2/localize', 'moves2/localize2',
    'news/edit', 'news/edit2', 'news/new', 'news/translate', 'news/translate2',
    'poll/conduct', 'poll/edit', 'poll/new', 'poll/showvotes',
    'ranking/addplayer', 'ranking/addteam', 'ranking/addtournament', 'ranking/newplayer',
    'ranking/ranks2seeds',
    'registration/addevent', 'registration/addevent2', 'registration/approve',
    'registration/approve2', 'registration/checkin', 'registration/checkintemplate',
    'registration/console', 'registration/defer-payment', 'registration/editevent',
    'registration/entrants2memberships', 'registration/ifpa-auto-join', 'registration/memo',
    'registration/playersummary', 'registration/rankteams', 'registration/regedit',
    'registration/regsetup', 'registration/register2', 'registration/removetranslations',
    'registration/sendmusicreminder', 'registration/sendpaymentnotice',
    'registration/translateevent', 'registration/translateevent2', 'registration/unregister',
    'registration/unregister2', 'registration/dumpifpa', 'registration/dumpregdata',
    'registration/regdumplogin', 'registration/getbadpartners', 'registration/mailin-payment',
    'registration/makeresultsfromatib', 'registration/seedteams', 'registration/pay',
    'registration/pay2', 'registration/autoreturn',
    'rules/edit', 'rules/new', 'rules/localize', 'rules/localize2',
    'actions/confirm',
    'payments/authorize', 'payments/instant-join',
})

# Query parameters that trigger a state change on an otherwise-readable route
# (e.g. registration/regsummary?unreg=1 unregisters a person/team). UI-only
# params (mode/really/cachebuster) are already stripped by normalize_url.
DESTRUCTIVE_PARAMS = frozenset({
    'unreg', 'delete', 'remove', 'confirm', 'approve', 'reject', 'vote',
})

# WordPress admin / exec endpoints (the sites.footbag.org vhost is WordPress).
# Refused on every host as a path segment: these are the admin dashboard, the
# login form, and the XML-RPC endpoint — never archival content. Every WordPress
# post, page, and wp-content upload is still captured; only these admin/exec
# surfaces are skipped.
WORDPRESS_ADMIN_SEGMENTS = frozenset({'wp-admin', 'wp-login.php', 'xmlrpc.php'})

# MediaWiki (the reference/ wiki) editor / mutation actions. The wiki's admin
# surface is query-driven (?action=edit&title=...), so the section/action route
# keying never catches it. Only the edit/mutation actions are refused; article
# READ views (no action, or action=view/history/raw) stay captured, so every
# wiki page is preserved.
MEDIAWIKI_MUTATION_ACTIONS = frozenset({
    'edit', 'submit', 'delete', 'protect', 'unprotect', 'rollback', 'purge',
    'watch', 'unwatch',
})

def is_unsafe_url(url):
    # True for any footbag.org URL that could mutate server state or is an admin/
    # editor surface, so the crawler refuses it before issuing a request. Reader
    # content is unaffected, so archival coverage is unchanged. Route keys use the
    # first two path segments (section/action), matching the app's routing, so
    # /gallery/show/123, /members/profile/456, /registration/register?tid=1, and
    # sections that merely end in "2" (/index2/..., /gallery2/...) are allowed.
    p = urlparse(url)
    segs = [s for s in p.path.lower().split('/') if s]
    seg_set = set(segs)
    if 'admin' in seg_set:
        return True
    # WordPress admin/exec surfaces (vhost is WordPress); never content.
    if seg_set & WORDPRESS_ADMIN_SEGMENTS:
        return True
    if len(segs) >= 2:
        route_key = f"{segs[0]}/{segs[1]}"
        if route_key in DESTRUCTIVE_ROUTES or route_key in EDITOR_ADMIN_ROUTES:
            return True
    # Query keys are matched case-insensitively for BOTH refusal checks, so a
    # case-varied '?Action=edit' is refused the same as '?action=edit'.
    qs_lower = {}
    for k, v in parse_qs(p.query).items():
        qs_lower.setdefault(k.lower(), []).extend(v)
    if set(qs_lower) & DESTRUCTIVE_PARAMS:
        return True
    # MediaWiki editor/mutation actions (reference/ wiki); article reads pass.
    if {v.lower() for v in qs_lower.get('action', [])} & MEDIAWIKI_MUTATION_ACTIONS:
        return True
    return False

def get_extension(url_or_path):
    return Path(urlparse(url_or_path).path.lower()).suffix

def is_media_file(url_or_path):
    return get_extension(url_or_path) in MEDIA_FORMATS

def is_video_file(url_or_path):
    ext = get_extension(url_or_path)
    return ext in VIDEO_EXTENSIONS

def is_convertible_video(url_or_path):
    ext = get_extension(url_or_path)
    return ext in CONVERTIBLE_EXTENSIONS

# Per-extension magic-byte signatures. Each entry is (offset, [candidate_bytes]).
# Compared against the first 16 bytes of the downloaded file. Match = first
# `candidate_bytes` found at the given offset.
_MAGIC_BYTES = {
    '.jpg':  (0, [b'\xff\xd8\xff']),
    '.jpeg': (0, [b'\xff\xd8\xff']),
    '.png':  (0, [b'\x89PNG\r\n\x1a\n']),
    '.gif':  (0, [b'GIF87a', b'GIF89a']),
    '.bmp':  (0, [b'BM']),
    '.tiff': (0, [b'II*\x00', b'MM\x00*']),
    '.tif':  (0, [b'II*\x00', b'MM\x00*']),
    '.webp': (0, [b'RIFF']),  # also has 'WEBP' at offset 8; loose check is acceptable
    '.mp4':  (4, [b'ftyp']),
    '.m4v':  (4, [b'ftyp']),
    '.mov':  (4, [b'ftyp']),  # QuickTime shares ISO BMFF container shape
    '.webm': (0, [b'\x1aE\xdf\xa3']),  # EBML header
    '.mkv':  (0, [b'\x1aE\xdf\xa3']),
    '.avi':  (0, [b'RIFF']),  # also has 'AVI ' at offset 8; loose check is acceptable
    '.wmv':  (0, [b'\x30\x26\xb2\x75\x8e\x66\xcf\x11']),  # ASF header GUID prefix
    '.mpg':  (0, [b'\x00\x00\x01\xba', b'\x00\x00\x01\xb3']),
    '.mpeg': (0, [b'\x00\x00\x01\xba', b'\x00\x00\x01\xb3']),
    '.flv':  (0, [b'FLV']),
    '.divx': (0, [b'RIFF']),
}

def verify_magic_bytes(filepath, ext):
    # Returns True if the file's magic bytes match its declared extension.
    # Returns False (and increments magic_byte_failures) on any mismatch or
    # missing-signature-table entry. Protects against a footbag.org URL
    # serving a disguised payload under a benign extension before that
    # bytestream reaches ffmpeg.
    spec = _MAGIC_BYTES.get(ext.lower())
    if spec is None:
        # No signature in table → conservative reject. Covers extensions
        # newly added to MEDIA_FORMATS without a corresponding _MAGIC_BYTES entry.
        logging.warning(f"No magic-byte signature defined for ext {ext}: {filepath}")
        mirror_state.stats['magic_byte_failures'] += 1
        return False

    offset, candidates = spec
    try:
        with open(filepath, 'rb') as f:
            head = f.read(16)
    except OSError as e:
        logging.error(f"Failed to read header for magic-byte check: {filepath} → {e}")
        mirror_state.stats['magic_byte_failures'] += 1
        return False

    for sig in candidates:
        end = offset + len(sig)
        if len(head) >= end and head[offset:end] == sig:
            return True

    logging.warning(
        f"Magic-byte mismatch for {filepath} (declared {ext}): "
        f"first 16 bytes = {head.hex()}"
    )
    mirror_state.stats['magic_byte_failures'] += 1
    return False

def get_media_mime_type(filepath):
    ext = Path(filepath).suffix.lower()
    return MEDIA_FORMATS.get(ext, (mimetypes.guess_type(filepath)[0], False))[0] or 'application/octet-stream'

def is_image_file(url_or_path):
    ext = Path(urlparse(url_or_path).path).suffix.lower()
    return ext in mimetypes.types_map and mimetypes.types_map[ext].startswith("image/")

# Extensions that are intentionally not mirrored per DD §6.4 (only mp4 and jpg
# are preserved). Returns a short human-readable label for the skipped class,
# or None if the extension is not a known skipped media class.
def _skipped_media_label(ext):
    ext = (ext or '').lower()
    if ext in {'.mp3', '.ogg', '.wav', '.aac', '.m4a'}:
        return 'Audio'
    if ext == '.svg':
        return 'SVG image'
    return None

def is_convertible_image(url_or_path):
    ext = get_extension(url_or_path)
    return ext in IMAGE_EXTENSIONS and ext in CONVERTIBLE_EXTENSIONS

def strip_query(url):
    # Remove query (e.g. ?cacheBuster=...) from URL
    return url.split('?', 1)[0]

def media_fail_key(url: str) -> str:
    return normalize_url(strip_query(url))

def is_failed_conversion_video(url: str) -> bool:
    return media_fail_key(url) in mirror_state.failed_conversion_videos

def _slugify(s: str) -> str:
    s = unquote_plus(str(s)).strip().lower()
    s = re.sub(r'[^a-z0-9._-]+', '-', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s or 'untitled'

def _collapse_amp_entities(url):
    # Collapse an HTML-escaped ampersand ('&amp;', and the double-escaped
    # '&amp;amp;' the live gallery emits) back to a literal '&', so a URL parsed
    # out of an HTML attribute canonicalizes identically for fetching and for
    # local-link rewriting. A media filename carrying a literal '&' (e.g.
    # 'Lisa&Andy.mp4') otherwise round-trips to 'Lisa&amp;amp;Andy.mp4' in the
    # rewritten link while the file on disk is 'Lisa&Andy.mp4', breaking it.
    # Scoped to the '&amp;' sequence only, so a query parameter named like a
    # legacy entity (e.g. '?copy=1', '?reg=2') is never mangled the way a blanket
    # html.unescape would mangle it. Idempotent.
    while '&amp;' in url:
        url = url.replace('&amp;', '&')
    return url


def _canonicalize_calendar_scheme(url):
    # The event pages link their iCalendar exports with the 'webcal://' scheme
    # ('webcal://.../events/vcal/<id>.ics' per event, 'webcal://.../events/ical'
    # for the whole-calendar feed). webcal is http over the wire, so canonicalize
    # it to http:// here; the crawler then fetches, scopes, saves, and rewrites
    # those exports through the ordinary path instead of skipping an unknown
    # scheme.
    for prefix in ('webcal://', 'WEBCAL://'):
        if url.startswith(prefix):
            return 'http://' + url[len(prefix):]
    return url


def normalize_url(url):
    # Normalize a URL by:
    #  - collapsing HTML-escaped ampersands and the webcal:// calendar scheme
    #  - stripping UI-only query parameters like 'mode' and 'really' and cachebuster
    #  - stripping fragments (#...)
    #  - normalizing gallery/show/-ID to gallery/show/ID
    #  - preserving trailing slash only if present in original
    url = _collapse_amp_entities(url)
    url = _canonicalize_calendar_scheme(url)
    p = urlparse(url)

    # Fold DNS aliases of the main site onto www, so one page has exactly one
    # visited-key, one file, and one link target, and no alias hostname ever
    # reaches the mirror.
    if p.netloc.lower() in WWW_ALIAS_HOSTS:
        p = p._replace(netloc=WWW_HOST)

    # UI-only query params carry no distinct content and only multiply URLs.
    # The base set is the legacy app's; the WordPress vhost adds the transposh
    # translation param (?lang= multiplies every URL by the language count) and
    # comment-reply targeting (?replytocom= multiplies by comment count).
    ui_params = ('mode', 'really', 'cachebuster', 'cachebust')
    if p.netloc.lower() in HOST_TREE_PREFIX:
        ui_params = ui_params + ('lang', 'replytocom')

    decoded_path = unquote(p.path)
    if '%3f' in p.path.lower() or '?' in decoded_path:
        # Split on real '?' or encoded '%3F'
        if '?' in decoded_path:
            real_path, fake_query = decoded_path.split('?', 1)
        else:
            real_path, fake_query = decoded_path.split('%3f', 1)

        fake_qs = parse_qs(fake_query, keep_blank_values=True)
        fake_qs = {
            k: v for k, v in fake_qs.items()
            if k.lower() not in ui_params
        }

        # Rebuild path without unwanted params
        if fake_qs:
            decoded_path = real_path + '?' + urlencode(fake_qs, doseq=True)
        else:
            decoded_path = real_path

        p = p._replace(path=quote(decoded_path))

    original_query = parse_qs(p.query, keep_blank_values=True)

    stripped_query = {
        k: v for k, v in original_query.items()
        if k.lower() not in ui_params
    }

    new_query = urlencode(stripped_query, doseq=True)
    p = p._replace(query=new_query, fragment='')

    # === BEGIN: FAQ/Facts canonicalization (www app only: a vhost site whose
    # slug happens to be 'facts' or 'faq' must keep its own paths) ===
    _pre_faq_url = urlunparse(p)
    path_l = p.path.lower() if p.netloc == WWW_HOST else ''
    # (a) Alias prefixes → /faq/...
    if path_l == '/facts':
        p = p._replace(path='/faq/')
    elif path_l.startswith('/facts/'):
        p = p._replace(path='/faq' + p.path[6:])  # replace '/facts' prefix
    # Optional: normalize 'newfaq' as well (seen in the wild)
    if path_l == '/newfaq':
        p = p._replace(path='/faq/')
    elif path_l.startswith('/newfaq/'):
        p = p._replace(path='/faq' + p.path[7:])  # replace '/newfaq' prefix
    # (b) /faq/show: unify both forms to PATH form /faq/show/<segment>
    #     - /faq/show?id=123            → /faq/show/123
    #     - /faq/show?id=paradox...     → /faq/show/paradox...
    #     - bare /faq/show (no id)      → /faq/
    if p.netloc == WWW_HOST and p.path.rstrip('/').lower() == '/faq/show':
        qs = {k.lower(): v for k, v in parse_qs(p.query).items()}
        art = (qs.get('id') or [None])[0]
        if art:
            p = p._replace(path=f"/faq/show/{art}", query='')
        else:
            p = p._replace(path='/faq/', query='')
    # (c) /faq/list: keep ONLY sid (if present); drop UI-only junk
    if p.netloc == WWW_HOST and p.path.rstrip('/').lower() == '/faq/list':
        qs = {k.lower(): v for k, v in parse_qs(p.query).items()}
        sid = (qs.get('sid') or [None])[0]
        p = p._replace(query=('sid=' + sid) if sid else '')
    _post_faq_url = urlunparse(p)
    if _post_faq_url != _pre_faq_url:
        logging.info(f"Normalized FAQ URL: '{_pre_faq_url}' → '{_post_faq_url}'")
    # === END: FAQ/Facts canonicalization ===

    normalized = urlunparse(p).rstrip('/')

    # Normalize gallery/show/-ID → gallery/show/ID. Only the www gallery uses this
    # id scheme, so gate the www-host rebuild on host==www: a non-www URL must
    # keep its own host, never be silently re-homed onto www.
    match = re.match(r'^https?://([^/]+)/gallery/show/-?(\d+)$', normalized)
    if match and match.group(1) == WWW_HOST:
        id_str = match.group(2)
        normalized = f"{BASE_URL}/gallery/show/{id_str}"

    # Only add trailing slash for root URLs
    if p.path in ['', '/']:
        normalized = normalized.rstrip('/') + '/'
    
    # Clean up any remaining bogus cacheBuster patterns and stray ? characters
    cleaned_url = re.sub(r'[?%3F]+[Cc]ache[Bb]uster=\d+', '', normalized, flags=re.IGNORECASE)
    
    # Only remove stray ? characters if there's no legitimate query string
    if '?' in cleaned_url:
        # Parse to check if there's a real query string
        parsed_cleaned = urlparse(cleaned_url)
        if not parsed_cleaned.query:
            # No query string, so the ? is bogus
            cleaned_url = cleaned_url.replace('?', '')
    else:
        # No ? at all, safe to remove any stray ones
        cleaned_url = cleaned_url.replace('?', '')
        
    if cleaned_url != normalized:
        logging.info(f"Cleaned bogus cacheBuster from URL: '{normalized}' → '{cleaned_url}'")
        normalized = cleaned_url

    return normalized

def canonicalize_cross_published(url):
    # A vhost page whose site is VERIFIED to serve the same bytes on www maps
    # to its www twin, so the page is stored once, in the www tree. Deliberately
    # a separate, narrowly-applied step (link enqueue and the filepath host
    # gate), never part of normalize_url: normalize_url feeds visited-keys and
    # fetch targets, and rewriting the host there would corrupt the vhost's own
    # crawl bookkeeping for unverified sites.
    p = urlparse(url)
    if p.netloc not in HOST_TREE_PREFIX:
        return url
    segs = [s for s in p.path.split('/') if s]
    if segs and segs[0].lower() in CROSS_PUBLISHED_SITES:
        return urlunparse(p._replace(netloc=WWW_HOST))
    return url


def inject_as_of_note(html):
    soup = BeautifulSoup(html, 'html.parser')
    note = soup.new_tag('p')
    note.string = f"(Local Mirror created on {datetime.now().strftime('%-d %B %Y')})"
    note['style'] = 'font-style: italic; color: gray;'
    if soup.body:
        soup.body.insert(0, note)
    return str(soup)

def should_inject_as_of_note(url: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path.rstrip('/')
    return path in ['', '/', '/index.html', '/news/list', '/events/list']

def create_news_list_redirector():
    # Create /news/list/index.html → list_<current>/index.html
    current_year = str(datetime.now().year)
    from_path = os.path.join(
        MIRROR_DIR, 'www.footbag.org', 'news', 'list', 'index.html')
    to_path = os.path.join(
        MIRROR_DIR, 'www.footbag.org', 'news', f'list_{current_year}', 'index.html')

    os.makedirs(os.path.dirname(from_path), exist_ok=True)
    rel_path = calculate_relative_path(from_path, to_path)

    html = f"""<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url={rel_path}">
    <title>Redirecting</title>
  </head>
  <body>
    <p>Redirecting to <a href="{rel_path}">{rel_path}</a></p>
  </body>
</html>"""
    _atomic_write_text(from_path, html)
    logging.info(f"Redirector created: /news/list/index.html → /list_{current_year}/index.html")

def create_events_results_redirector():
    # Create /events/results/index.html → results_year_<current>/index.html
    current_year = str(datetime.now().year)
    from_path = os.path.join(
        MIRROR_DIR, 'www.footbag.org', 'events', 'results', 'index.html')
    to_path = os.path.join(
        MIRROR_DIR, 'www.footbag.org', 'events', f'results_year_{current_year}', 'index.html')

    os.makedirs(os.path.dirname(from_path), exist_ok=True)
    rel_path = calculate_relative_path(from_path, to_path)

    html = f"""<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url={rel_path}">
    <title>Redirecting</title>
  </head>
  <body>
    <p>Redirecting to <a href="{rel_path}">{rel_path}</a></p>
  </body>
</html>"""
    _atomic_write_text(from_path, html)
    logging.info(f"Redirector created: /events/results/index.html → /results_year_{current_year}/index.html")

def create_events_past_redirector():
    # Create /events/past/index.html → past_year_<current>/index.html 
    current_year = str(datetime.now().year)
    from_path = os.path.join(
        MIRROR_DIR, 'www.footbag.org', 'events', 'past', 'index.html')
    to_path = os.path.join(
        MIRROR_DIR, 'www.footbag.org', 'events', f'past_year_{current_year}', 'index.html')

    os.makedirs(os.path.dirname(from_path), exist_ok=True)
    rel_path = calculate_relative_path(from_path, to_path)

    html = f"""<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url={rel_path}">
    <title>Redirecting</title>
  </head>
  <body>
    <p>Redirecting to <a href="{rel_path}">{rel_path}</a></p>
  </body>
</html>"""
    _atomic_write_text(from_path, html)
    logging.info(f"Redirector created: /events/past/index.html → /past_year_{current_year}/index.html")

def login():
    # Sets cookies and session state needed for downloading member-only content.
    logging.info("Attempting login...")

    try:
        init_url = BASE_URL + '/members/'
        init_resp = session.get(init_url, timeout=10)
        init_resp.raise_for_status()

        payload = {
            'MemberID': USERNAME.split('@')[0],  # use only alias part
            'MemberPassword': PASSWORD,
            'login_retry': '1'
        }

        login_url = BASE_URL + '/members/home'
        login_resp = session.post(login_url, data=payload, timeout=15, allow_redirects=True)
        login_resp.raise_for_status()

        verify_url = BASE_URL + '/members/home'
        verify_resp = session.get(verify_url, timeout=10)
        verify_resp.raise_for_status()

        soup = BeautifulSoup(verify_resp.text, 'html.parser')

        still_login_form = soup.find('form', {'name': 'loginform'})
        title_tag = soup.find('title')
        title_text = title_tag.get_text(strip=True).lower() if title_tag else ""

        if still_login_form or "member sign-in" in title_text:
            raise RuntimeError("Login failed — still seeing login page.")

        logging.info("Login successful — authenticated content verified")

    except requests.RequestException as e:
        raise RuntimeError(f"Login failed due to network error: {e}")

def _sanitized_marker_path(output_filepath):
    return output_filepath + '.sanitized'

def _is_already_sanitized(output_filepath):
    # Output is considered sanitized only when both the file and its
    # `.sanitized` sidecar exist. A bare output file (no sidecar) means a
    # pre-fix run produced unsanitized bytes, or a partial run was interrupted
    # mid-encode; either way, re-encode.
    return os.path.exists(output_filepath) and os.path.exists(_sanitized_marker_path(output_filepath))

def _write_sanitized_marker(output_filepath):
    try:
        Path(_sanitized_marker_path(output_filepath)).touch()
    except OSError as e:
        logging.warning(f"Failed to write sanitized marker for {output_filepath}: {e}")

# Malware-stripping ffmpeg flags shared by both transcode attempts (DD §6.8 lines 2475-2481).
# These drop subtitle/data/attachment streams, container metadata, and chapter markers
# that can carry payloads, regardless of what the source container happens to contain.
_FFMPEG_MALWARE_STRIP_FLAGS = [
    '-map', '0:v', '-map', '0:a?',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
]

def convert_to_mp4(input_filepath):
    # Re-encode any accepted video to .mp4 via ffmpeg, destroying container-,
    # codec-, and metadata-level malware by rebuilding the bytes from the
    # essential signal. Returns the output path on success, None on failure.
    input_path = Path(input_filepath)
    ext = input_path.suffix.lower()

    if ext not in CONVERTIBLE_EXTENSIONS:
        logging.error(f"No conversion rule for: {input_filepath}")
        return input_filepath  # Return original

    output_filepath = str(input_path.with_suffix('.mp4'))

    if _is_already_sanitized(output_filepath):
        logging.info(f"Already sanitized: {output_filepath}")
        return output_filepath

    # Same-extension inputs (.mp4 → .mp4) collide source and target paths.
    # Encode to a temp suffix and rename on success so the source bytes are
    # never overwritten in place mid-encode.
    temp_output = str(input_path.with_suffix('.reenc.mp4'))

    # First attempt: Fast, high-quality settings for newer videos.
    try:
        logging.info(f"Converting {input_filepath} to .mp4 ...")
        subprocess.run([
            'ffmpeg', '-i', str(input_filepath),
            *_FFMPEG_MALWARE_STRIP_FLAGS,
            '-c:v', 'libx264', '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-movflags', 'faststart',
            '-y',
            temp_output
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        os.replace(temp_output, output_filepath)
        _write_sanitized_marker(output_filepath)
        mirror_state.stats['video_conversions'] += 1
        return output_filepath

    except subprocess.CalledProcessError as e:
        if os.path.exists(temp_output):
            try:
                os.remove(temp_output)
            except:
                pass

    # Second attempt: Conservative settings for extremely old/corrupt videos.
    try:
        logging.info(f"Trying conservative conversion for {input_filepath}")
        subprocess.run([
            'ffmpeg', '-i', str(input_filepath),
            *_FFMPEG_MALWARE_STRIP_FLAGS,
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
            '-c:a', 'aac', '-b:a', '96k', '-ar', '44100',
            '-movflags', 'faststart',
            '-max_muxing_queue_size', '2048',
            '-pix_fmt', 'yuv420p',
            '-avoid_negative_ts', 'make_zero',  # Handle timestamp issues
            '-fflags', '+genpts',  # Generate presentation timestamps
            '-r', '25',  # Force frame rate for problematic videos
            '-y',
            temp_output
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        os.replace(temp_output, output_filepath)
        _write_sanitized_marker(output_filepath)
        mirror_state.stats['video_conversions'] += 1
        logging.info(f"Successfully converted : {output_filepath}")
        return output_filepath

    except subprocess.CalledProcessError as e:
        if os.path.exists(temp_output):
            try:
                os.remove(temp_output)
            except:
                pass
        logging.warning(f"All conversion attempts failed for {input_filepath}.")
        return None

def convert_image_to_jpg(filepath):
    # Re-encode any accepted still image (jpg/jpeg/png/bmp/tiff/webp) to .jpg
    # via ffmpeg, stripping EXIF/ICC and destroying image-format malware by
    # rebuilding the bytes. GIFs are handled separately via convert_gif_to_gif.
    try:
        output_path = str(Path(filepath).with_suffix('.jpg'))

        if _is_already_sanitized(output_path):
            logging.info(f"JPEG already sanitized: {output_path}")
            return output_path

        # Same-extension inputs (.jpg → .jpg) collide source and target.
        # Encode to a temp suffix and rename on success.
        temp_output = str(Path(filepath).with_suffix('.reenc.jpg'))

        logging.info(f"Converting image to JPG: {filepath} → {output_path}")
        subprocess.run([
            'ffmpeg',
            '-i', filepath,
            '-frames:v', '1',  # Single-frame output (explicit; not muxer-default)
            '-q:v', '4',  # ~JPEG quality 85 (scale 2-31, lower is better)
            '-y',
            temp_output,
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        os.replace(temp_output, output_path)
        _write_sanitized_marker(output_path)
        mirror_state.stats['image_conversions'] += 1
        return output_path
    except subprocess.CalledProcessError as e:
        # Clean up any temp output ffmpeg may have left behind
        try:
            if 'temp_output' in locals() and os.path.exists(temp_output):
                os.remove(temp_output)
        except OSError:
            pass
        logging.error(f"ffmpeg failed to convert image to JPG: {filepath} → {e}")
        return None
    except Exception as e:
        logging.error(f"Failed to convert image to JPG: {filepath} → {e}")
        return None

def convert_gif_to_gif(filepath):
    # ffmpeg roundtrip on a .gif: rebuild bytes from the pixel signal to
    # destroy embedded malware while preserving animation and the .gif format.
    try:
        output_path = str(Path(filepath).with_suffix('.gif'))

        if _is_already_sanitized(output_path):
            logging.info(f"GIF already sanitized: {output_path}")
            return output_path

        # Same-extension input → temp-rename so source isn't overwritten mid-encode.
        temp_output = str(Path(filepath).with_suffix('.reenc.gif'))

        logging.info(f"Re-encoding GIF: {filepath}")
        subprocess.run([
            'ffmpeg',
            '-i', filepath,
            '-y',
            temp_output,
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        os.replace(temp_output, output_path)
        _write_sanitized_marker(output_path)
        mirror_state.stats['image_conversions'] += 1
        return output_path
    except subprocess.CalledProcessError as e:
        try:
            if 'temp_output' in locals() and os.path.exists(temp_output):
                os.remove(temp_output)
        except OSError:
            pass
        logging.error(f"ffmpeg failed to re-encode GIF: {filepath} → {e}")
        return None
    except Exception as e:
        logging.error(f"Failed to re-encode GIF: {filepath} → {e}")
        return None

def delete_original_file_if_converted(original_path, converted_path, media_type="media"):
    if (
        converted_path and
        converted_path != original_path and
        os.path.exists(original_path)
    ):
        try:
            os.remove(original_path)
            logging.debug(f"Deleted original {media_type} file after conversion: {original_path}")
        except Exception as e:
            logging.error(f"Failed to delete original {media_type} file: {original_path} → {e}")

def convert_and_cleanup(filepath, ext):
    try:
        ext = (ext or "").lower()
        orig_size = os.path.getsize(filepath)
    except OSError:
        orig_size = 0

    # --- Videos: must convert to MP4 or we consider it unusable ---
    if ext in VIDEO_EXTENSIONS:
        final = convert_to_mp4(filepath)
        if final and final != filepath and os.path.exists(final):
            try:
                out_size = os.path.getsize(final)
            except OSError:
                out_size = 0
            mirror_state.stats['media_output_bytes']     += out_size
            delete_original_file_if_converted(filepath, final, media_type="video")
            return final
        else:
            # Conversion failed → remove original so nothing points to a bogus file
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logging.info(f"Deleted original video after failed conversion: {filepath}")
                else:
                    logging.warning(f"Original video already absent after failed conversion: {filepath}")
            except Exception as e:
                logging.error(f"Failed to delete unplayable video after failed conversion: {filepath} → {e}")
            return None

    elif ext == '.gif':
        # GIF stays as GIF (own category, not an image-to-JPG candidate).
        final = convert_gif_to_gif(filepath)
        if final and os.path.exists(final):
            try:
                out_size = os.path.getsize(final)
            except OSError:
                out_size = 0
            mirror_state.stats['media_output_bytes'] += out_size
            return final
        else:
            # Re-encode failed → keep original GIF on disk (do not delete; a
            # passing magic-byte check upstream means the bytes are at least
            # a valid GIF header).
            mirror_state.stats['media_output_bytes'] += orig_size
            return filepath

    elif ext in IMAGE_EXTENSIONS:
        final = convert_image_to_jpg(filepath)
        if final and final != filepath and os.path.exists(final):
            try:
                out_size = os.path.getsize(final)
            except OSError:
                out_size = 0
            mirror_state.stats['media_output_bytes']     += out_size
            delete_original_file_if_converted(filepath, final, media_type="image")
            return final
        else:
            # Keep original image on disk
            mirror_state.stats['media_output_bytes'] += orig_size
            return filepath
    else:
        mirror_state.stats['media_output_bytes'] += orig_size
        return filepath

def download_and_process_media(url, session, referrer=None, thumbnail_or_poster=False):
    # Download media file and convert formats (video/audio/image) as needed.
    # Returns the final usable filepath (converted or original), None if
    # unavailable, or SKIPPED_VIDEO when --skip-videos deliberately excluded a
    # video binary (callers keep the original reference for that case).
    # Collapse any HTML-escaped ampersand so the fetched URL, the on-disk path,
    # and the rewritten link all agree on the literal '&' in a media filename.
    url = _collapse_amp_entities(url)
    if is_unsafe_url(url):
        logging.info(f"Refusing admin/mutating URL (media): {url}")
        return None
    try:
        if "openVideoWindow" in url:
            logging.debug(f"Skipping JS-based media placeholder: {url}")
            return None  # will be handled later.

        # Early skip for conversion-failed videos
        if is_failed_conversion_video(url):
            key = media_fail_key(url)
            logging.info(f"Skipping failed-conversion media URL: {key}")
            return None

        parsed = urlparse(url)
        if not is_footbag_domain(url):
            logging.warning(f"Skipping offsite media file: {url}")
            return None

        clean_url = strip_query(url)
        filepath = url_to_filepath(clean_url)
        ext = get_extension(url)

        # --skip-videos: a recognized video extension is excluded before any
        # request is made (zero network cost, no retries, no hashing). The
        # record keeps every referring page; a re-sighting from another page
        # only appends its referrer.
        if SKIP_VIDEOS and ext in VIDEO_EXTENSIONS:
            mime, _ = MEDIA_FORMATS.get(ext, ('', False))
            mirror_state.record_skipped_video(
                url, referrer=referrer, ext=ext, content_type=mime,
                reason='extension', thumbnail_or_poster=thumbnail_or_poster)
            return SKIPPED_VIDEO

        is_convertible = ext in CONVERTIBLE_EXTENSIONS

        if not filepath:
            logging.error(f"Could not determine filepath for media: {url}")
            return None

        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        # Cheap skip if the sanitized output for this URL already exists.
        # Gated on the `.sanitized` sidecar so a pre-fix run's bare output
        # does NOT short-circuit; it must be re-encoded. Avoids re-downloading
        # a source whose converted output is already present (e.g. the same
        # spacer .gif referenced from many pages).
        if is_convertible:
            if ext in VIDEO_EXTENSIONS:
                target_path = str(Path(filepath).with_suffix('.mp4'))
            elif ext == '.gif':
                target_path = str(Path(filepath).with_suffix('.gif'))
            elif ext in IMAGE_EXTENSIONS:
                target_path = str(Path(filepath).with_suffix('.jpg'))
            else:
                target_path = None

            if target_path and _is_already_sanitized(target_path):
                logging.debug(f"Already-sanitized output exists, skipping: {target_path}")
                return target_path

        # If source file already exists, magic-byte verify (when applicable),
        # then attempt conversion/cleanup in place.
        if os.path.exists(filepath):
            if is_convertible and not verify_magic_bytes(filepath, ext):
                try:
                    os.remove(filepath)
                except OSError:
                    pass
                mirror_state.failed_urls.add(media_fail_key(url))
                return None
            result = convert_and_cleanup(filepath, ext) if is_convertible else filepath
            if result is None and ext in VIDEO_EXTENSIONS:
                key = media_fail_key(url)
                mirror_state.failed_urls.add(key)
                mirror_state.failed_conversion_videos.add(key)
                logging.info(f"Recorded failed-conversion video URL: {key}")
            return result

        try:
            polite_wait(url)
            # Session by TARGET host: the caller's (member) session only when the
            # media itself lives on www; any other host gets the cookie-less one.
            response = session_for(url, www_session=session).get(url, stream=True, timeout=15)
            response.raise_for_status()  # keep your behavior
        except requests.exceptions.RequestException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status is not None:
                # HTTP error: only count permanent (non-transient) as failed_downloads
                if status in TRANSIENT_RETRY_CODES:
                    logging.info(f"Media retryable HTTP {status}: {url}")
                    return None
                else:
                    mirror_state.stats['failed_downloads'] += 1
                    logging.info(f"Permanent failure {status}: {url}")
                    return None
            else:
                # Transport error (DNS/timeout/reset): retryable → do not bump failed_downloads
                logging.info(f"Failed to download media: {url}")
                return None

        content_length = response.headers.get('Content-Length')

        # --skip-videos: a video Content-Type on a non-video extension (a
        # mislabeled or extensionless media URL) is rejected from the streamed
        # response headers, before the body is read.
        if SKIP_VIDEOS:
            served_type = (response.headers.get('Content-Type') or '').split(';')[0].strip().lower()
            if served_type.startswith('video/'):
                mirror_state.record_skipped_video(
                    url, referrer=referrer, ext=ext, content_type=served_type,
                    reason='content-type', status=response.status_code,
                    content_length=content_length,
                    thumbnail_or_poster=thumbnail_or_poster)
                response.close()
                return SKIPPED_VIDEO

        if content_length and int(content_length) > MAX_FILE_SIZE:
            mirror_state.stats['skipped_too_large'] += 1
            logging.warning(f"Media file too large, skipping: {url} ({content_length} bytes)")
            return None

        temp_filepath = filepath + '.tmp'
        with open(temp_filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        os.rename(temp_filepath, filepath)
        logging.info(f"Downloaded: {filepath}")

        try:
            size = os.path.getsize(filepath)
        except OSError:
            size = 0
        mirror_state.stats['bytes_downloaded'] += size
        mirror_state.stats['media_input_bytes'] += size
        mirror_state.stats['successful_downloads'] += 1

        if not is_convertible:
            mirror_state.stats['media_output_bytes'] += size

        # Magic-byte verify before any ffmpeg/PIL processing. A disguised
        # payload under a benign extension is dropped before it can reach
        # the conversion pipeline.
        if is_convertible and not verify_magic_bytes(filepath, ext):
            try:
                os.remove(filepath)
            except OSError:
                pass
            mirror_state.failed_urls.add(media_fail_key(url))
            return None

        result = convert_and_cleanup(filepath, ext) if is_convertible else filepath
        if result is None and ext in VIDEO_EXTENSIONS:
            key = media_fail_key(url)
            mirror_state.failed_urls.add(key)
            mirror_state.failed_conversion_videos.add(key)
            logging.info(f"Recorded failed-conversion video URL : {key}")
        return result

    except Exception as e:
        logging.error(f"General failure in download_and_process_media: {url} → {e}")
        return None

def _general_url_path(parsed, url):
    # Map an arbitrary URL path to a mirror-relative file path: strip traversal,
    # append index.html for directory-style paths, and clean legacy cacheBuster
    # junk from filenames. Shared by the www tree and the reserved host prefixes,
    # so a vhost path and a www path get identical filename handling.
    path = unquote(parsed.path)
    path = re.sub(r'(^|/)\.\.(?=/|$)', '', path)
    path = path.replace('\\', '/').replace('//', '/').lstrip('/')

    if path.endswith('/') or path == '':
        path += 'index.html'
    else:
        dirname = os.path.dirname(path)
        basename = os.path.basename(path)
        original_basename = basename  # Save the original for logging

        # Clean up buggy filenames with embedded cacheBuster/cachebuster parameters
        if '%3FcacheBuster=' in basename or '%3Fcachebuster=' in basename or '?cacheBuster=' in basename or '?cachebuster=' in basename:
            # Remove URL-encoded and regular cacheBuster parameters
            basename = re.sub(r'%3F[Cc]ache[Bb]uster=\d+', '', basename)
            basename = re.sub(r'\?[Cc]ache[Bb]uster=\d+', '', basename)
            # Clean up any remaining URL-encoded question marks and stray question marks
            basename = basename.replace('%3F', '')
            basename = basename.replace('?', '')
            logging.info(f"Cleaned buggy filename with cacheBuster from '{original_basename}' to '{basename}' for URL: {url}")

        # Find file extension at the end, preceded by one dot
        ext_pattern = r'\.([a-zA-Z0-9]{2,5})$'
        match = re.search(ext_pattern, basename)

        if match:
            extension = '.' + match.group(1)
            name_part = basename[:match.start()]
            if not name_part:
                name_part = "unnamed"
            else:
                name_part = re.sub(r'\.{2,}', '.', name_part)
                name_part = name_part.rstrip('. ')
                if not name_part:
                    name_part = "unnamed"

            clean_basename = name_part + extension
            if clean_basename != original_basename:
                logging.info(f"Filename changed from '{original_basename}' to '{clean_basename}' for URL: {url}")

            if dirname:
                path = os.path.join(dirname, clean_basename).replace('\\', '/')
            else:
                path = clean_basename
        else:
            path += '/index.html'
    return path

def url_to_filepath(url):
    url = normalize_url(url)
    # Final guard: a verified cross-published vhost URL files at its www twin's
    # path, so the page can never be stored twice under two names.
    url = canonicalize_cross_published(url)
    parsed = urlparse(url)
    query_parts = {k.lower(): v for k, v in parse_qs(parsed.query).items()}

    # Non-www content host (the WordPress vhost): skip EVERY www-specific section
    # special-case and map the path through the shared general handler, then
    # place it under the host's reserved prefix. Guarding here rather than
    # per-branch is what stops a vhost slug like 'faq' or 'clubs' from being
    # misfiled into the www section tree.
    host_prefix = HOST_TREE_PREFIX.get(parsed.netloc)
    if host_prefix is not None:
        path = f"{host_prefix}/{_general_url_path(parsed, url)}"
        local_path = os.path.abspath(os.path.join(MIRROR_DIR, 'www.footbag.org', path))
        if not local_path.startswith(os.path.abspath(MIRROR_DIR)):
            raise ValueError(f"Path traversal attempt detected: {url}")
        return local_path

    if parsed.path == '/clubs/list':
        segments = []
        for key in sorted(query_parts):
            val = query_parts[key][0]
            key_clean = key.replace(' ', '_')
            val_clean = unquote_plus(val).replace(' ', '_')
            segments.append(f"{key_clean}_{val_clean}")
        subpath = 'list/index.html' if not segments else '/'.join(segments) + '/index.html'
        path = f'clubs/{subpath}'

    elif parsed.path == '/clubs/showmembers':
        club_id = query_parts.get('clubid', [None])[0]
        if club_id:
            path = f'clubs/ClubID_{club_id}/showmembers/index.html'
        else:
            path = f'clubs/showmembers/index.html'

    elif parsed.path == '/events/past':
        year = query_parts.get('year', [None])[0]
        try:
            if year and year.isdigit() and len(year) == 4 and 1900 <= int(year) <= 2100:
                path = f'events/past_year_{year}/index.html'
            else:
                raise ValueError
        except Exception:
            current_year = str(datetime.now().year)
            path = f'events/past_year_{current_year}/index.html'

    elif parsed.path == '/events/results':
        year = query_parts.get('year', [None])[0]
        try:
            if year and year.isdigit() and len(year) == 4 and 1900 <= int(year) <= 2100:
                path = f'events/results_year_{year}/index.html'
            else:
                raise ValueError
        except Exception:
            current_year = str(datetime.now().year)
            path = f'events/results_year_{current_year}/index.html'

    elif parsed.path in ('/events/ical', '/events/ical/'):
        # The whole-calendar iCalendar feed carries no per-event id and returns
        # text/calendar, so give it a stable '.ics' file instead of the generic
        # '.../index.html' the fallthrough would assign (which mislabels a
        # calendar as HTML and left the feed uncaptured). Per-event exports are
        # the distinct '/events/vcal/<id>.ics' route, which already resolves to
        # its own '.ics' file through the general handler.
        path = 'events/ical/index.ics'

    elif parsed.path in ('/forum', '/forum/'):
        # The forum is permanently retired; the live section root serves the flat
        # 'forum-down.html' notice, which is present in the mirror. Map the root
        # straight to that file so the site-wide nav link (every page carries it)
        # resolves to a real file, rather than the 'forum/index.html' directory
        # index the fallthrough would invent — the flat file being treated as a
        # directory. Deeper cached forum URLs ('/forum/viewforum.php', ...) keep
        # their own paths under 'forum/' and are unaffected.
        path = 'forum-down.html'

    elif parsed.path == '/registration/register':
        tid = query_parts.get('tid', [None])[0]
        if tid and tid.isdigit():
            path = f'registration/register/{tid}/index.html'
        else:
            path = f'registration/register/index.html'

    elif parsed.path == '/registration/regsummary':
        tid = query_parts.get('tid', [None])[0]
        if tid and tid.isdigit():
            path = f'registration/regsummary/{tid}/index.html'
        else:
            path = f'registration/regsummary/index.html'

    elif parsed.path == '/news/list':
        year = query_parts.get('year', [None])[0]
        f_param = query_parts.get('f', [None])[0]
        from_param = query_parts.get('from', [None])[0]

        try:
            if year and year.isdigit():
                if len(year) == 1:
                    year = f"200{year}"
                elif len(year) == 2:
                    year_int = int(year)
                    year = f"20{year}" if year_int <= 30 else f"19{year}"
                elif len(year) == 3:
                    # Heuristic: Treat "003" → "2003"
                    year = f"200{year[-1]}"
                elif len(year) == 4 and 1900 <= int(year) <= 2100:
                    pass  # Already valid
                else:
                    raise ValueError
                path = f'news/list_{year}/index.html'
            else:
                raise ValueError
        except Exception:
            current_year = str(datetime.now().year)
            path = f'news/list_{current_year}/index.html'
    
    elif parsed.path in ('/faq', '/faq/'):
        path = 'faq/index.html'

    elif parsed.path == '/faq/list':
        sid = query_parts.get('sid', [None])[0]
        if sid:
            safe_sid = _slugify(sid)
            path = f'faq/list/SID_{safe_sid}/index.html'
            if safe_sid != str(sid).strip().lower():
                logging.info(f"FAQ sid sanitized from '{sid}' to '{safe_sid}' for URL: {url}")
        else:
            path = 'faq/list/index.html'

    elif parsed.path.startswith('/faq/show/'):
        seg = parsed.path.split('/faq/show/', 1)[1]
        safe_seg = _slugify(seg)
        path = f'faq/show/{safe_seg}/index.html'
        if safe_seg != str(seg).strip().lower():
            logging.info(f"FAQ show segment sanitized from '{seg}' to '{safe_seg}' for URL: {url}")

    elif parsed.path == '/faq/show':
        art = query_parts.get('id', [None])[0]
        if art:
            safe_seg = _slugify(art)
            path = f'faq/show/{safe_seg}/index.html'
            logging.info(f"FAQ show (safety) id '{art}' → '{safe_seg}' for URL: {url}")
        else:
            path = 'faq/index.html'
    else:
        path = _general_url_path(parsed, url)
    local_path = os.path.join(MIRROR_DIR, 'www.footbag.org', path)
    local_path = os.path.abspath(local_path)

    if not local_path.startswith(os.path.abspath(MIRROR_DIR)):
        raise ValueError(f"Path traversal attempt detected: {url}")
    return local_path

def calculate_relative_path(from_file, to_file):
    from_dir = os.path.dirname(from_file)
    rel_path = os.path.relpath(to_file, from_dir)
    rel_path = rel_path.replace(os.sep, '/')
    return rel_path

def get_site_root_relative_path(current_page_url):
    parsed = urlparse(current_page_url)
    path = parsed.path
    clean_path = path.strip('/')
    parts = clean_path.split('/') if clean_path else []

    if parts and '.' in parts[-1]:
        levels_up = len(parts) - 1
    else:
        levels_up = len(parts)
    return './' if levels_up == 0 else '../' * levels_up

def resolve_actual_video_url(popup_url):
    # Resolve a popup page URL (e.g. /gallery/show/foo?Mode=popup (mode should be stripped))
    if is_unsafe_url(popup_url):
        logging.info(f"Refusing admin/mutating URL (popup): {popup_url}")
        return None
    try:
        # A relative popup path joins against www (only the www gallery emits
        # these popups); an absolute popup URL keeps its own host, and links
        # found inside the popup page resolve against the page they came from,
        # never blindly onto www.
        absolute_popup = normalize_url(urljoin(BASE_URL, popup_url))
        logging.debug(f"Resolving actual media from popup: {absolute_popup}")
        polite_wait(absolute_popup)
        resp = session_for(absolute_popup).get(absolute_popup, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        for link in soup.find_all('a', href=True):
            href = link['href'].strip()
            parsed_href = urlparse(href)
            path = parsed_href.path.lower()

            if is_media_file(href):
                resolved = normalize_url(urljoin(absolute_popup, href))
                logging.info(f"Resolved media URL: {resolved}")
                return resolved
        logging.error(f"Could not find any media file in popup: {popup_url}")
        return None
    except Exception as e:
        logging.error(f"Failed to resolve actual media from {popup_url}: {e}")
        return None

def resolve_canonical_gallery_url(url):
    parsed = urlparse(url)
    match = re.match(r"^/gallery/show/(-?\d+)/?$", parsed.path)
    if not match:
        return url

    id_str = match.group(1).lstrip('-')
    pos_url = f"{BASE_URL}/gallery/show/{id_str}"
    neg_url = f"{BASE_URL}/gallery/show/-{id_str}"
    # Unconditionally map -ID → +ID 
    mirror_state.duplicate_redirects[neg_url] = pos_url
    return pos_url
                   
def remove_fallback_viewer_row(element, page_url, soup):
    # Removes the adjacent <tr> row if it contains a link to any /gallery/show/* page.
    # Live site has redundant links.    
    outer_td = element.find_parent('td')
    outer_tr = outer_td.find_parent('tr') if outer_td else None
    next_tr = outer_tr.find_next_sibling('tr') if outer_tr else None

    if next_tr:
        a_tags = next_tr.find_all('a', href=True)
        for a_tag in a_tags:
            abs_href = urljoin(page_url, a_tag['href'])
            if urlparse(abs_href).path.startswith('/gallery/show/'):
                new_tr = soup.new_tag('tr')
                new_td = soup.new_tag('td')
                new_td.append(Comment("Mirror has removed JavaScript popup window."))
                new_tr.append(new_td)
                next_tr.replace_with(new_tr)
                logging.info(f"Removed redundant video viewer: {a_tag['href']}")
                break

def drop_broken_video_element(elem, fallback_text):
    # Replace an <a>/<video>/<source> that points to a failed video with a tiny inline fallback.
    # Does not climb beyond the nearest <video>; no table-row surgery. Silent no-op on edge cases.
    try:
        note = Comment("Mirror: video conversion failed")
        msg  = NavigableString(f"Video {fallback_text} not available.")

        # If we’re in a <source>, remove its owning <video>.
        if getattr(elem, "name", None) == 'source':
            v = elem.find_parent('video')
            target = v if v else elem
        # If we’re in a <video>, remove the whole <video>.
        elif getattr(elem, "name", None) == 'video':
            target = elem
        # Otherwise (e.g., <a>), just remove the element itself.
        else:
            target = elem

        target.insert_before(note)
        target.insert_after(msg)
        target.decompose()
    except Exception:
        # Fail quietly
        pass

def _rewrite_noncapturable_footbag_link(element, attr_name, full_url, current_filepath, soup):
    # A footbag.org host the crawler never contacts (dead media box, mail-only,
    # internal). A target a past crawl already folded into the tree keeps a
    # working relative link; otherwise the reference is removed, because served
    # HTML may carry neither a legacy hostname nor a link that is known broken.
    try:
        candidate = url_to_filepath(strip_query(full_url))
    except ValueError:
        candidate = None
    if candidate and os.path.exists(candidate):
        element[attr_name] = calculate_relative_path(current_filepath, candidate)
        return
    if element.name == 'a':
        text = element.get_text(strip=True)
        element.insert_before(Comment("Mirror: link to unarchived legacy host removed"))
        if text:
            element.insert_before(NavigableString(text))
    else:
        element.insert_before(Comment("Mirror: reference to unarchived legacy host removed"))
    element.decompose()


def rewrite_links(html, page_url):
    # Rewrites footbag.org links to relative local file paths, resolving redirects and broken links.
    try:
        if page_url.startswith("file://"):
            raise ValueError(f"BUG: page_url is a file:// path — must be HTTP! Got: {page_url}")

        soup = BeautifulSoup(html, 'html.parser')
        for base_tag in soup.find_all('base'):
            base_tag.decompose()

        current_filepath = url_to_filepath(page_url)
        # Track embedded video files to suppress redundant viewer pages
        embedded_video_refs = set()

        # Skipped media classes (audio, SVG) are intentionally not mirrored.
        # Replace any <a>/<audio>/<source> reference to a skipped extension
        # with a visible inline note so the archive viewer sees the gap
        # explicitly rather than a broken link.
        for tag in list(soup.find_all(['a', 'audio', 'source'])):
            href_or_src = tag.get('href') or tag.get('src')
            if not href_or_src:
                continue
            try:
                abs_url = urljoin(page_url, href_or_src)
            except Exception:
                continue
            skip_label = _skipped_media_label(get_extension(abs_url))
            if skip_label:
                note = soup.new_tag('span')
                note['class'] = 'mirror-skipped-media'
                note.string = f"[{skip_label}: not mirrored]"
                tag.insert_before(note)
                tag.decompose()
                logging.debug(f"Replaced skipped {skip_label} reference with note: {abs_url}")

        # Embedded <video>/<source> tags
        for tag in soup.find_all(['video', 'source']):
            src = tag.get('src')
            if src:
                abs_url = urljoin(page_url, src)
                embedded_video_refs.add(normalize_url(abs_url))

                if is_media_file(abs_url):
                    clean_url = strip_query(abs_url)
                    has_poster = bool(tag.get('poster')) or bool(tag.find_parent('video') and tag.find_parent('video').get('poster'))
                    processed_path = download_and_process_media(clean_url, session, referrer=page_url,
                                                                thumbnail_or_poster=has_poster)
                    if processed_path == SKIPPED_VIDEO:
                        # Deliberate skip: keep the element and its poster, point
                        # src at the ORIGINAL absolute URL, never a local path.
                        tag['src'] = abs_url
                        tag.insert_before(Comment("Mirror: video binary not mirrored (skip-videos); original URL retained"))
                    elif processed_path:
                        rel_path = calculate_relative_path(current_filepath, processed_path)
                        tag['src'] = rel_path
                        # Only <source> should get a type attribute
                        if tag.name == 'source':
                            tag['type'] = get_media_mime_type(processed_path)
                    else:
                        # Strict fallback for failed VIDEO conversions in embedded players
                        if is_video_file(abs_url):
                            fallback_text = os.path.basename(urlparse(abs_url).path)
                            remove_fallback_viewer_row(tag, page_url, soup)
                            drop_broken_video_element(tag, fallback_text)
                            logging.info(f"Replaced broken embedded video with fallback on: {page_url}")

        # Embedded direct links like <a href="video.mov">
        for a in soup.find_all('a'):
            href = a.get('href')
            if href and is_video_file(href):
                abs_url = urljoin(page_url, href)
                embedded_video_refs.add(normalize_url(abs_url))

                if is_media_file(abs_url):
                    clean_url = strip_query(abs_url)
                    processed_path = download_and_process_media(clean_url, session, referrer=page_url,
                                                                thumbnail_or_poster=bool(a.find('img')))
                    if processed_path == SKIPPED_VIDEO:
                        # Deliberate skip: keep the link and its text/thumbnail,
                        # pointing at the ORIGINAL absolute URL.
                        a['href'] = abs_url
                        a.insert_before(Comment("Mirror: video binary not mirrored (skip-videos); original URL retained"))
                    elif processed_path:
                        rel_path = calculate_relative_path(current_filepath, processed_path)
                        a['href'] = rel_path  # Rewrite to local .mp4 path

                        # Fix link text if it’s generic
                        filename = os.path.basename(processed_path)
                        current_text = a.get_text(strip=True).lower()
                        if current_text in ['view', 'download', 'view video', 'play video', 'video', 'direct link to movie']:
                            a.string = f"Direct Link To {filename}"
                    else:
                        # Strict fallback for failed VIDEO conversions in direct links
                        fallback_text = os.path.basename(urlparse(abs_url).path)
                        remove_fallback_viewer_row(a, page_url, soup)
                        drop_broken_video_element(a, fallback_text)
                        logging.info(f"Replaced broken video link with fallback on: {page_url}")

        # Handle javascript:popupprofile('NNNNN') links
        for a in soup.find_all('a', href=True):
            href = a['href']
            match = re.match(r"javascript:popupprofile\(['\"]?(\d{3,10})['\"]?\)", href)
            if match:
                member_id = match.group(1)
                profile_url = f"{BASE_URL}/members/profile/{member_id}"
                normalized_profile_url = normalize_url(profile_url)
                profile_filepath = url_to_filepath(normalized_profile_url)
                rel_path = calculate_relative_path(current_filepath, profile_filepath)

                a['href'] = rel_path
                a['target'] = '_blank'  # mimic popup behavior

                # Enqueue for mirroring
                if is_in_scope(normalized_profile_url):
                    if normalized_profile_url not in mirror_state.visited and normalized_profile_url not in mirror_state.queue:
                        mirror_state.queue.append(normalized_profile_url)
                        mirror_state.url_depth[normalized_profile_url] = mirror_state.url_depth.get(page_url, 0) + 1
                        logging.info(f"Enqueued profile: {normalized_profile_url}")

                logging.info(f"Rewrote popupprofile({member_id}) → {rel_path}")

        url_attributes = {
            'a': ['href'],
            'img': ['src'],
            'script': ['src'],
            'link': ['href'],
            'iframe': ['src'],
            'object': ['data'],
            'form': ['action'],
            'area': ['href'],
            'embed': ['src'],
            'source': ['src', 'srcset'],
            'track': ['src'],
            'video': ['src', 'poster'],
            'audio': ['src'],
            'input': ['src'],
            'meta': ['content']
        }

        for tag_name, attributes in url_attributes.items():
            for element in soup.find_all(tag_name):

                # Special case: remove <a href="/registration/listevent?eid=...">, keep text bold
                if tag_name == 'a':
                    href = element.get('href', '')
                    if '/registration/listevent' in href and 'eid=' in href:
                        inner_text = element.get_text(strip=True)
                        bold_tag = soup.new_tag('b')
                        bold_tag.string = inner_text
                        element.insert_before(bold_tag)
                        element.decompose()
                        logging.debug(f"Removed listevent link but preserved text: {inner_text}")
                        continue  # Skip rest of URL rewriting for this <a> tag

                for attr_name in attributes:
                    if not hasattr(element, 'get'):
                        continue

                    original_value = element.get(attr_name)
                    if not original_value:
                        continue

                    match = re.search(r"openVideoWindow\(['\"]([^'\"]+)['\"]\)", original_value)
                    if match:
                        popup_url = match.group(1)
                        absolute_popup_url  = urljoin(page_url, popup_url)
                        canonical_popup_url = resolve_canonical_gallery_url(absolute_popup_url)

                        resolved_video_url = resolve_actual_video_url(canonical_popup_url)

                        # A) Could not resolve popup → fallback and remove legacy viewer row
                        if not resolved_video_url:
                            logging.error(f"Could not resolve popup video: {popup_url}")

                            fallback_text  = os.path.basename(urlparse(popup_url).path)
                            fallback_note  = Comment("Popup can not be fixed in Mirror, broken link from footbag.org.")
                            fallback_string = f"Video {fallback_text} not available."

                            if tag_name == 'a':
                                element.insert_before(fallback_note)
                                element.insert_after(NavigableString(fallback_string))
                                # IMPORTANT: remove the adjacent viewer row BEFORE decompose()
                                remove_fallback_viewer_row(element, page_url, soup)
                                element.decompose()
                            continue

                        processed_filepath = download_and_process_media(
                            resolved_video_url, session, referrer=page_url,
                            thumbnail_or_poster=bool(tag_name == 'a' and element.find('img')))

                        # Deliberate skip (--skip-videos): rewrite the JS popup to
                        # the ORIGINAL video URL so the link stays intelligible;
                        # keep the thumbnail; remove the redundant viewer row
                        # exactly as the success path does.
                        if processed_filepath == SKIPPED_VIDEO:
                            element[attr_name] = resolved_video_url
                            element.insert_before(Comment("Mirror: JS popup rewritten to original video URL; binary not mirrored (skip-videos)"))
                            remove_fallback_viewer_row(element, page_url, soup)
                            continue

                        # B) Resolved but conversion failed → fallback and remove legacy viewer row
                        if not processed_filepath:
                            logging.info(f"Could not download or convert video: {resolved_video_url}")

                            fallback_text  = os.path.basename(urlparse(resolved_video_url).path)
                            fallback_note  = Comment("Popup can not be fixed in Mirror, broken media file.")
                            fallback_string = f"Video {fallback_text} not available."

                            if tag_name == 'a':
                                element.insert_before(fallback_note)
                                element.insert_after(NavigableString(fallback_string))
                                # IMPORTANT: remove the adjacent viewer row BEFORE decompose()
                                remove_fallback_viewer_row(element, page_url, soup)
                                element.decompose()
                            continue

                        # C) Success → rewrite link AND remove legacy viewer row
                        rel_video_path = calculate_relative_path(current_filepath, processed_filepath)
                        filename       = os.path.basename(processed_filepath)

                        # <a> with <img>
                        if tag_name == 'a' and element.find('img'):
                            element[attr_name] = rel_video_path
                            element.insert_before(Comment("Popup thumbnail rewritten to direct MP4 link"))
                            # IMPORTANT: also nuke the adjacent 'Click here...' viewer row
                            remove_fallback_viewer_row(element, page_url, soup)
                            logging.info(f"Popup thumbnail link replaced with: {rel_video_path}")

                        # Plain <a>
                        elif tag_name == 'a':
                            element[attr_name] = rel_video_path
                            element.string = f"Direct Link to {filename}"
                            element.insert_before(Comment("JS popup replaced with direct MP4 link"))
                            # IMPORTANT: also nuke the adjacent 'Click here...' viewer row
                            remove_fallback_viewer_row(element, page_url, soup)
                            logging.info(f"Popup text link replaced with: {rel_video_path}")

                        # Weird case: openVideoWindow on non-<a> — still rewrite and clean row
                        else:
                            element[attr_name] = rel_video_path
                            element.insert_before(Comment("JS popup attribute rewritten to direct MP4 link"))
                            remove_fallback_viewer_row(element, page_url, soup)
                        continue

                    if '<%' in original_value or '%>' in original_value:
                        continue
                    if original_value.startswith(('mailto:', 'javascript:', 'tel:', 'data:', '#')):
                        continue

                    # Meta redirect handling
                    if tag_name == 'meta':
                        http_equiv = element.get('http-equiv', '').lower()
                        if http_equiv == 'refresh' and 'url=' in original_value.lower():
                            match = re.search(r'url=([^;]+)', original_value, re.IGNORECASE)
                            if match:
                                redirect_url = match.group(1).strip()
                                full_url = urljoin(page_url, redirect_url)
                                full_url = mirror_state.duplicate_redirects.get(full_url, full_url)
                                if is_footbag_domain(full_url):
                                    if full_url in mirror_state.failed_urls:
                                        comment = Comment(f"Broken link removed: {redirect_url}")
                                        element.insert_before(comment)
                                        element.decompose()
                                        continue
                                    target_filepath = url_to_filepath(full_url)
                                    relative_path = calculate_relative_path(current_filepath, target_filepath)
                                    element[attr_name] = original_value.replace(redirect_url, relative_path)
                            continue

                    # srcset (special case)
                    if attr_name == 'srcset':
                        new_items = []
                        for item in original_value.split(','):
                            parts = item.strip().split()
                            if not parts:
                                continue
                            url_part = parts[0]
                            descriptor = ' '.join(parts[1:]) if len(parts) > 1 else ''
                            full_url = urljoin(page_url, url_part)
                            full_url = mirror_state.duplicate_redirects.get(full_url, full_url)

                            if is_footbag_domain(full_url):
                                if full_url in mirror_state.failed_urls:
                                    comment = Comment(f"Broken link removed from srcset: {full_url}")
                                    element.insert_before(comment)
                                    continue

                                # Unreachable footbag host: resolve offline —
                                # keep the entry only when a past crawl captured
                                # the file; never issue a request for it.
                                if urlparse(normalize_url(full_url)).netloc not in CRAWL_HOSTS:
                                    try:
                                        candidate = url_to_filepath(strip_query(full_url))
                                    except ValueError:
                                        candidate = None
                                    if candidate and os.path.exists(candidate):
                                        rel = calculate_relative_path(current_filepath, candidate)
                                        new_items.append(rel + (' ' + descriptor if descriptor else ''))
                                    else:
                                        element.insert_before(Comment(
                                            "Mirror: srcset entry on unarchived legacy host removed"))
                                    continue

                                if is_media_file(full_url):
                                    clean_url = strip_query(full_url)
                                    processed_filepath = download_and_process_media(clean_url, session, referrer=page_url)
                                    if processed_filepath == SKIPPED_VIDEO:
                                        # Deliberate skip: keep the original URL in the srcset.
                                        new_items.append(full_url + (' ' + descriptor if descriptor else ''))
                                    elif processed_filepath:
                                        relative_path = calculate_relative_path(current_filepath, processed_filepath)
                                        new_items.append(relative_path + (' ' + descriptor if descriptor else ''))
                                    else:
                                        # Fallback to original behavior for non-video or if you still want to list it
                                        target_filepath = url_to_filepath(clean_url)
                                        if target_filepath:
                                            relative_path = calculate_relative_path(current_filepath, target_filepath)
                                            new_items.append(relative_path + (' ' + descriptor if descriptor else ''))
                                            # Queue the clean URL for downloading
                                            if is_in_scope(clean_url):
                                                norm_clean_url = normalize_url(clean_url)
                                                if norm_clean_url not in mirror_state.visited and norm_clean_url not in mirror_state.queue:
                                                    mirror_state.queue.append(norm_clean_url)
                                                    mirror_state.url_depth[norm_clean_url] = mirror_state.url_depth.get(page_url, 0) + 1
                                    continue

                                target_filepath = url_to_filepath(full_url)
                                if not target_filepath:
                                    continue
                                relative_path = calculate_relative_path(current_filepath, target_filepath)
                                new_items.append(relative_path + (' ' + descriptor if descriptor else ''))
                            else:
                                new_items.append(item)
                        element[attr_name] = ', '.join(new_items)
                        continue

                    # Now handle all other internal URLs
                    full_url = urljoin(page_url, original_value)
                    parsed = urlparse(full_url)

                    # A footbag host the crawler never contacts (dead media box,
                    # mail-only, internal — anything normalize_url does not fold
                    # onto a crawl host) is resolved offline: keep a working
                    # relative link when a past crawl captured the target, else
                    # remove the reference. Checked BEFORE the media branch so
                    # no request is ever issued to an unreachable host.
                    if is_footbag_domain(full_url):
                        canonical_host = urlparse(normalize_url(full_url)).netloc
                        if canonical_host not in CRAWL_HOSTS:
                            _rewrite_noncapturable_footbag_link(
                                element, attr_name, full_url, current_filepath, soup)
                            continue

                    if is_footbag_domain(full_url) and is_media_file(full_url):
                        clean_url = strip_query(full_url)
                        try:
                            processed_filepath = download_and_process_media(
                                clean_url, session, referrer=page_url,
                                thumbnail_or_poster=bool(attr_name == 'poster' or (tag_name == 'a' and element.find('img'))))
                            if processed_filepath == SKIPPED_VIDEO:
                                # Deliberate skip: retain the original absolute URL
                                # (idempotent when an earlier pass already set it).
                                if element.get(attr_name) != full_url:
                                    element[attr_name] = full_url
                                    element.insert_before(Comment("Mirror: video binary not mirrored (skip-videos); original URL retained"))
                                continue
                            if processed_filepath:
                                relative_path = calculate_relative_path(current_filepath, processed_filepath)
                                element[attr_name] = relative_path

                                if tag_name == 'source' and element.get('type'):
                                    element['type'] = get_media_mime_type(processed_filepath)

                                # Update link text for <a> tags to show filename
                                if tag_name == 'a':
                                    filename = os.path.basename(processed_filepath)
                                    if filename:
                                        # Check if the link text is generic
                                        current_text = element.get_text(strip=True)
                                        if current_text.lower() in ['view video', 'play video', 'download', 'view', 'play']:
                                            if any(processed_filepath.lower().endswith(ext) for ext in VIDEO_EXTENSIONS):
                                                element.string = f"View Video: {filename}"
                                            else:
                                                element.string = f"Play Audio: {filename}"
                                        elif not current_text or current_text.lower() == 'video':
                                            element.string = filename

                                continue  # Skip normal processing for media files

                            else:
                                # Fallback for failed VIDEO conversion (general handler)
                                if is_video_file(full_url):
                                    fallback_text = os.path.basename(urlparse(full_url).path)
                                    remove_fallback_viewer_row(element, page_url, soup)
                                    drop_broken_video_element(element, fallback_text)
                                    logging.info(f"Replaced broken video with fallback on: {page_url}")
                                    continue

                                # Non-video media: keep existing behavior
                                target_filepath = url_to_filepath(clean_url)
                                if target_filepath:
                                    relative_path = calculate_relative_path(current_filepath, target_filepath)
                                    element[attr_name] = relative_path

                                    if tag_name == 'a':
                                        filename = os.path.basename(urlparse(clean_url).path)
                                        if filename:
                                            current_text = element.get_text(strip=True)
                                            if current_text.lower() in ['view video', 'play video', 'download', 'view', 'play']:
                                                element.string = f"View Video {filename}"
                                            elif not current_text or current_text.lower() == 'video':
                                                element.string = filename

                                    # Queue the clean URL for downloading (unchanged)
                                    if is_in_scope(clean_url):
                                        norm_clean_url = normalize_url(clean_url)
                                        if norm_clean_url not in mirror_state.visited and norm_clean_url not in mirror_state.queue:
                                            mirror_state.queue.append(norm_clean_url)
                                            mirror_state.url_depth[norm_clean_url] = mirror_state.url_depth.get(page_url, 0) + 1
                                continue  # Skip normal processing for media files
                        except Exception as e:
                            logging.error(f"Failed to rewrite media link: {full_url} → {e}")
                            continue

                    # Special logic for /news/list with Year=... and any other parameters
                    # (www app route; a vhost path of the same shape passes through)
                    if parsed.netloc == WWW_HOST and parsed.path == '/news/list' and 'Year=' in parsed.query:
                        try:
                            # Convert query parameters to always use f=10 (show all)
                            query_parts = parse_qs(parsed.query)
                            year = query_parts.get('Year', [None])[0]

                            if year:
                                show_all_url = f"{BASE_URL}/news/list?f=10&from=0&Year={year}"

                                target_filepath = url_to_filepath(show_all_url)
                                relative_path = calculate_relative_path(current_filepath, target_filepath)

                                element[attr_name] = relative_path
                                norm_url = normalize_url(show_all_url)
                                if is_in_scope(norm_url):
                                    if norm_url not in mirror_state.visited and norm_url not in mirror_state.queue:
                                        mirror_state.queue.append(norm_url)
                                        mirror_state.url_depth[norm_url] = mirror_state.url_depth.get(page_url, 0) + 1
                                        logging.info(f"Enqueued news URL: {norm_url}")
                            continue
                        except Exception as e:
                            logging.error(f"Failed to rewrite /news/list link: {full_url} → {e}")
                            continue

                    # Fix known bug in live site: results?year=YYYY-1 inside past?year=YYYY page
                    if '/events/past' in page_url and 'year=' in page_url:
                        match_past = re.search(r'year=(\d{4})', page_url)
                        match_results = re.search(r'/events/results\?year=(\d{4})', full_url)

                        if match_past and match_results:
                            year_past = int(match_past.group(1))
                            year_results = int(match_results.group(1))

                            if year_results == year_past - 1:
                                # Fix the broken link
                                corrected_url = f"{BASE_URL}/events/results?year={year_past}"
                                full_url = corrected_url
                                element[attr_name] = calculate_relative_path(current_filepath, url_to_filepath(corrected_url))
                                logging.warning(f"Corrected broken results link on {page_url}: {original_value} → {corrected_url}")

                    if parsed.netloc == WWW_HOST and parsed.path == '/clubs/list' and 'Country=' in parsed.query:
                        try:
                            target_filepath = url_to_filepath(full_url)
                            relative_path = calculate_relative_path(current_filepath, target_filepath)

                            element[attr_name] = relative_path
                            norm_url = normalize_url(full_url)
                            if is_in_scope(norm_url):
                                if norm_url not in mirror_state.visited and norm_url not in mirror_state.queue:
                                    mirror_state.queue.append(norm_url)
                                    mirror_state.url_depth[norm_url] = mirror_state.url_depth.get(page_url, 0) + 1
                                    logging.info(f"Enqueued: {norm_url}")
                            continue
                        except Exception as e:
                            logging.error(f"Failed to rewrite /clubs/list link: {full_url} → {e}")
                            continue

                    if parsed.netloc == WWW_HOST and parsed.path == '/clubs/showmembers' and 'ClubID=' in parsed.query:
                        try:
                            target_filepath = url_to_filepath(full_url)
                            relative_path = calculate_relative_path(current_filepath, target_filepath)

                            element[attr_name] = relative_path
                            if is_in_scope(full_url):
                                visited_key = normalize_url(full_url)

                                if visited_key not in mirror_state.visited and visited_key not in mirror_state.queue:
                                    mirror_state.queue.append(visited_key)
                                    mirror_state.url_depth[visited_key] = mirror_state.url_depth.get(normalize_url(page_url), 0) + 1
                                    logging.info(f"Enqueued: {visited_key}")
                            continue
                        except Exception as e:
                            logging.error(f"Failed to rewrite /clubs/showmembers link: {full_url} → {e}")
                            continue

                    if parsed.netloc == WWW_HOST and parsed.path == '/events/past':
                        try:
                            target_filepath = url_to_filepath(full_url)
                            relative_path = calculate_relative_path(current_filepath, target_filepath)
                            element[attr_name] = relative_path

                            if is_in_scope(full_url):
                                visited_key = normalize_url(full_url)

                                if visited_key not in mirror_state.visited and visited_key not in mirror_state.queue:
                                    mirror_state.queue.append(visited_key)
                                    mirror_state.url_depth[visited_key] = mirror_state.url_depth.get(normalize_url(page_url), 0) + 1
                                    logging.info(f"Enqueued: {visited_key}")
                            continue
                        except Exception as e:
                            logging.error(f"Failed to rewrite /events/past link: {full_url} → {e}")
                            continue

                    if parsed.netloc == WWW_HOST and parsed.path == '/events/results':
                        try:
                            target_filepath = url_to_filepath(full_url)
                            relative_path = calculate_relative_path(current_filepath, target_filepath)
                            element[attr_name] = relative_path

                            if is_in_scope(full_url):
                                visited_key = normalize_url(full_url)

                                if visited_key not in mirror_state.visited and visited_key not in mirror_state.queue:
                                    mirror_state.queue.append(visited_key)
                                    mirror_state.url_depth[visited_key] = mirror_state.url_depth.get(normalize_url(page_url), 0) + 1
                                    logging.info(f"Enqueued: {visited_key}")
                            continue
                        except Exception as e:
                            logging.error(f"Failed to rewrite /events/results link: {full_url} → {e}")
                            continue

                    full_url = mirror_state.duplicate_redirects.get(full_url, full_url)

                    if is_footbag_domain(full_url):
                        if full_url in mirror_state.failed_urls:
                            comment = Comment(f"Broken link removed: {original_value}")
                            element.insert_before(comment)
                            element.decompose()
                            continue
                        try:
                            target_filepath = url_to_filepath(full_url)
                            relative_path = calculate_relative_path(current_filepath, target_filepath)
                            element[attr_name] = relative_path
                        except Exception as e:
                            logging.error(f"Failed to rewrite link {original_value}: {e}")
                            continue

        # Fix inline CSS styles
        for element in soup.find_all(attrs={"style": True}):
            style = element.get('style', '')
            style = re.sub(r'url\s*\(\s*["\']?https?://[^)]+\)', 'url("")', style)
            element['style'] = style

        for style_tag in soup.find_all('style'):
            if style_tag.string:
                css = style_tag.string
                css = re.sub(r'url\s*\(\s*["\']?https?://[^)]+\)', 'url("")', css)
                style_tag.string = css

        remove_redundant_preview = False
        if remove_redundant_preview:
            # Remove redundant preview links like ../../show/-8830/index.html if ../../show/8830/index.html exists
            for a_tag in soup.find_all('a', href=True):
                href = a_tag['href']

                # Match preview link like ../../show/-8830/index.html
                match = re.match(r'\.\./\.\./show/-(\d+)/index\.html$', href)
                if not match:
                    continue

                gallery_id = match.group(1)
                positive_href = f"../../show/{gallery_id}/index.html"

                # Look for the corresponding positive ID link in the same <td>
                td = a_tag.find_parent('td')
                if not td or not td.find('a', href=positive_href):
                    continue

                # Find the <font> tag containing the preview link
                font_tag = a_tag.find_parent('font')
                if not font_tag or not font_tag.parent:
                    continue

                parent = font_tag.parent  # likely a <td>
                children = parent.contents
                try:
                    idx = children.index(font_tag)
                except ValueError:
                    continue

                # Delete brackets ONLY IF they exist AND are live in the DOM
                if idx > 0:
                    prev = children[idx - 1]
                    if isinstance(prev, NavigableString) and prev.strip() == '[':
                        prev.extract()

                if idx + 1 < len(children):
                    next_ = children[idx + 1]
                    if isinstance(next_, NavigableString) and next_.strip() == ']':
                        next_.extract()

                # Replace the preview font tag with a comment
                font_tag.insert_before(Comment(f"Mirror removed redundant preview for gallery/show/-{gallery_id}"))
                font_tag.extract()
                logging.info(f"Removed redundant page for gallery/show/-{gallery_id}")

        remove_redundant_preview = True
        if remove_redundant_preview:
            # Remove redundant preview links like ../../show/-8830/index.html if ../../show/8830/index.html exists
            for a_tag in soup.find_all('a', href=True):
                href = a_tag['href']

                # Match preview link like ../../show/-8830/index.html
                match = re.match(r'\.\./\.\./show/-(\d+)/index\.html$', href)
                if not match:
                    continue

                gallery_id = match.group(1)
                positive_href = f"../../show/{gallery_id}/index.html"

                # Look for the corresponding positive ID link in the same <td>
                td = a_tag.find_parent('td')
                if not td or not td.find('a', href=positive_href):
                    continue

                # Use live sibling pointers instead of stale index list
                font_tag = a_tag.find_parent('font')
                if not font_tag or not font_tag.parent:
                    continue

                prev = font_tag.previous_sibling
                next_ = font_tag.next_sibling

                if isinstance(prev, NavigableString) and prev.strip() == '[':
                    prev.extract()
                if isinstance(next_, NavigableString) and next_.strip() == ']':
                    next_.extract()

                # Replace the font tag with a comment
                font_tag.insert_before(Comment(f"Mirror removed redundant preview for gallery/show/-{gallery_id}"))
                font_tag.extract()
                logging.info(f"Removed redundant page for gallery/show/-{gallery_id}")

        # Strip target="_blank" from internal links; ensure it on externals
        for a in soup.find_all('a', href=True):
            href = a['href']
            abs_url = urljoin(page_url, href)

            if is_footbag_domain(abs_url):
                if 'target' in a.attrs:
                    del a.attrs['target']
                    logging.debug(f"Removed target='_blank' from internal link: {href}")
            else:
                a['target'] = '_blank'
                logging.debug(f"Ensured target='_blank' for external link: {href}")

        # Inject regsummary banner on event pages
        if '/events/show/' in page_url:
            tid_match = re.search(r'/events/show/(\d+)', page_url)
            if tid_match:
                tid = tid_match.group(1)
                reg_url = mirror_state.regsummary_map.get(tid)
                if reg_url:
                    reg_path = url_to_filepath(reg_url)
                    rel_link = calculate_relative_path(current_filepath, reg_path)
                    notice = soup.new_tag('p')
                    notice['style'] = (
                        'background-color: #eef; '
                        'border: 1px dashed #336; '
                        'padding: 6px; '
                        'font-family: monospace; '
                        'font-size: 90%;'
                    )
                    notice.append("<< Mirror added link to registration summary: ")
                    logging.info(f"Added link to registration summary for event: {page_url}")

                    a_tag = soup.new_tag('a', href=rel_link)
                    a_tag.string = f"regsummary/{tid}"
                    notice.append(a_tag)
                    notice.append(" >>")
                    if soup.body:
                        soup.body.insert(0, notice)
        return str(soup)
    except Exception as e:
        logging.error(f"Error rewriting links in {page_url}: {e}")
        return html

def save_content(url, content, is_html):
    try:
        if re.match(r'^.*/gallery/show/-\d+/?$', url):
            canonical_url = resolve_canonical_gallery_url(url)
            logging.error(f"Skipping save for negative gallery ID: {url} → {canonical_url}")
            return

        parsed = urlparse(url)
        if not is_footbag_domain(url):
            logging.info(f"Skipping save of offsite content: {url}")
            return

        url = normalize_url(url)  
        filepath = url_to_filepath(url)
        if not filepath:
            logging.error(f"Skipping save — invalid filepath for: {url}")
            return

        # Prevent redirected content from overwriting index.html
        if url in mirror_state.duplicate_redirects:
            redirect_target = mirror_state.duplicate_redirects[url]
            target_filepath = url_to_filepath(redirect_target)

            if not target_filepath:
                logging.error(f"Skipping redirect — invalid target for: {url}")
                return

            if os.path.basename(filepath) == "index.html" and os.path.basename(target_filepath) != "index.html":
                logging.error(
                    f"  Prevented overwrite of index.html with redirected content:\n"
                    f"    Original URL: {url}\n"
                    f"    Redirected to: {redirect_target}\n"
                    f"    Would save to: {filepath} ← blocked"
                )
                return

        # Prevent redirector loop
        if url in mirror_state.duplicate_redirects:
            redirect_target = mirror_state.duplicate_redirects[url]
            target_filepath = url_to_filepath(redirect_target)

            if os.path.abspath(filepath) == os.path.abspath(target_filepath):
                logging.info(f"Skipping self-redirect for: {url}")
                return

            # Write a local redirector HTML page
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            rel_path = calculate_relative_path(filepath, target_filepath)

            html = f"""<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url={rel_path}">
    <title>Redirecting</title>
  </head>
  <body>
    <p>Redirecting to <a href="{rel_path}">{rel_path}</a></p>
  </body>
</html>"""
            _atomic_write_text(filepath, html)

            mirror_state.stats['successful_downloads'] += 1
            mirror_state.sitemap.append(filepath)

            logging.info(f"Created local redirect: {filepath} → {rel_path}")
            return

        # Content dedup preserves every URL: two distinct URLs with identical
        # rendered bytes each keep a resolvable file at their own path (the
        # first stored copy stays the canonical hash owner). HTML duplicates
        # write their (already link-rewritten) content in place, so relative
        # links keep working from both locations; non-HTML duplicates hard-link
        # to the canonical copy where the filesystem allows, so large identical
        # binaries share storage, falling back to a plain copy.
        content_hash = hashlib.sha256(content if isinstance(content, bytes) else content.encode()).hexdigest()
        existing_path = mirror_state.content_hashes.get(content_hash)
        is_duplicate = bool(
            existing_path
            and os.path.exists(existing_path)
            and os.path.abspath(existing_path) != os.path.abspath(filepath)
        )

        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        if is_duplicate and not is_html:
            if not os.path.exists(filepath):
                try:
                    os.link(existing_path, filepath)
                except OSError:
                    shutil.copyfile(existing_path, filepath)
            logging.info(f"Duplicate content preserved (shared storage): {url} == {existing_path}")
            mirror_state.stats['duplicate_content_preserved'] = mirror_state.stats.get('duplicate_content_preserved', 0) + 1
        else:
            if is_html:
                _atomic_write_text(filepath, content)
            else:
                with open(filepath, 'wb') as f:
                    f.write(content)
            if is_duplicate:
                logging.info(f"Duplicate content preserved (own copy): {url} == {existing_path}")
                mirror_state.stats['duplicate_content_preserved'] = mirror_state.stats.get('duplicate_content_preserved', 0) + 1
            else:
                mirror_state.content_hashes[content_hash] = filepath
            mirror_state.stats['bytes_downloaded'] += len(content if isinstance(content, bytes) else content.encode())

        mirror_state.stats['successful_downloads'] += 1
        if filepath not in mirror_state.sitemap:
            mirror_state.sitemap.append(filepath)
        logging.info(f"Saved: {filepath}")

    except Exception as e:
        logging.error(f" Failed to save {url}: {e}")
        mirror_state.stats['failed_downloads'] += 1

def is_in_scope(url):
    if is_unsafe_url(url):
        return False
    parsed = urlparse(url)
    # Only the crawl hosts (www + the WordPress vhost) are fetched. Every other
    # footbag.org host — aliases, the now-dead media hosts, mail/internal — is out
    # of scope and never enqueued.
    if parsed.netloc not in CRAWL_HOSTS:
        return False
    segs = [s for s in parsed.path.split('/') if s]
    # Reserved-prefix collision guard, both directions: a www URL must never use a
    # reserved vhost prefix as its top segment, and a vhost slug must never BE a
    # reserved prefix, or the two host namespaces would overwrite each other in
    # the single served tree.
    if segs and segs[0].lower() in RESERVED_HOST_PREFIXES:
        logging.warning(f"Refusing reserved-prefix collision: {url}")
        return False
    if parsed.netloc in HOST_TREE_PREFIX:
        # WordPress crawl traps and non-content endpoints. Date-archive INDEX
        # pages (/<site>/YYYY[/MM[/DD]]/) multiply URLs without adding content
        # (a dated permalink with a post slug after the date still passes);
        # ?p=/?page_id= style ids duplicate every permalink; wp-json, feeds,
        # and trackbacks are API/subscription endpoints, not archive pages.
        # Everything they serve is reachable via permalinks and the wp-json-
        # derived seed lists.
        if re.search(r'^/[^/]+/\d{4}(/\d{2}){0,2}/?$', parsed.path):
            return False
        lower_segs = {s.lower() for s in segs}
        if lower_segs & {'wp-json', 'feed', 'trackback'}:
            return False
        if {k.lower() for k in parse_qs(parsed.query)} & {
                'p', 'page_id', 'cat', 'm', 'paged', 'attachment_id'}:
            return False
    path = parsed.path.lower()
    if any(path.endswith(ext) for ext in SKIP_EXTENSIONS):
        return False
    if not robot_checker.can_fetch(url):
        return False
    return True

def print_stats():
    s = mirror_state.stats

    def fmt_bytes(n):
        # IEC units to match `du -sh` (KiB/MiB/GiB)
        try:
            n = int(n)
        except Exception:
            return str(n)
        units = ["B", "KB", "MB", "GB", "TB"]
        val = float(n)
        i = 0
        while val >= 1024 and i < len(units) - 1:
            val /= 1024.0
            i += 1
        human = f"{val:.2f} {units[i]}" if i > 0 else f"{int(val)} {units[i]}"
        return f"{human}"

    print("\n=== Mirror Statistics ===")
    print(f"URLs visited: {len(mirror_state.visited)}")
    print(f"URLs in queue: {len(mirror_state.queue)}")
    print(f"Successful downloads (files written): {s.get('successful_downloads', 0):,}")
    print(f"Failed downloads (permanent): {s.get('failed_downloads', 0):,}")
    print(f"Bytes downloaded (all types): {fmt_bytes(s.get('bytes_downloaded', 0))}")
    mi = s.get('media_input_bytes', 0)
    mo = s.get('media_output_bytes', 0)
    print(f"Media input bytes:  {fmt_bytes(mi)}")
    print(f"Media output bytes: {fmt_bytes(mo)}")
    print(f"Video conversions: {s.get('video_conversions', 0):,}")
    print(f"Failed video conversions: {len(mirror_state.failed_conversion_videos)}")
    if mirror_state.skipped_videos or s.get('skipped_videos', 0):
        print(f"Skipped videos (skip-videos mode): {len(mirror_state.skipped_videos):,}")
        print(f"Skipped video declared bytes: {fmt_bytes(s.get('skipped_video_declared_bytes', 0))}")
    print(f"Image conversions: {s.get('image_conversions', 0):,}")
    print(f"Magic-byte failures: {s.get('magic_byte_failures', 0):,}")
    if s.get('skipped_too_large', 0) > 0:
        print(f"Skipped too large: {s.get('skipped_too_large', 0):,}")
    print(f"Regsummaries added: {s.get('regsummary_links_detected', 0):,}")
    print("========================\n")

def save_redirect_map():
    # Save all known redirect mappings from original URL to final URL
    redirect_path = os.path.join(MIRROR_DIR, 'redirect_map.json')
    _atomic_write_text(redirect_path, json.dumps(mirror_state.duplicate_redirects, indent=2))
    logging.info(f"Saved redirect map to {redirect_path}")

def save_sitemap():
    sitemap_path = os.path.join(MIRROR_DIR, SITEMAP_FILE)

    lines = [
        "# Footbag.org Mirror Sitemap",
        f"# Generated: {datetime.now().isoformat()}",
        f"# Total files: {len(mirror_state.sitemap)}",
        "# Mirror statistics:",
    ]
    lines += [f"#   {key}: {value}" for key, value in mirror_state.stats.items()]
    lines.append("")
    lines += sorted(mirror_state.sitemap)
    _atomic_write_text(sitemap_path, '\n'.join(lines) + '\n')
    logging.info(f"Sitemap written to {sitemap_path}")

def verify_authenticated_session():
    test_url = BASE_URL + '/members/home'
    resp = session.get(test_url, timeout=10)
    if 'Logout' in resp.text or 'Your Account' in resp.text or 'Welcome' in resp.text:
        logging.info("Authenticated content confirmed in session.")
        return True
    else:
        logging.error("Session is not authenticated — fallback or login required.")
        return False

# ---------- Reachability: Archive Directory, homepage card, browse indexes ----------
#
# The archive serves statically (no directory listing), so a captured page that
# no link-chain reaches from the landing page is invisible to a member. The
# orphans are exactly (a) the vhost microsites under /sites/ and (b) the
# seed-injected content the live site's own filtered indexes never linked.
# Three generated, JavaScript-free pieces close the gap, all rebuilt at the end
# of every crawl from what is ACTUALLY on disk so they never link a missing
# file: complete per-area browse indexes, one topic-grouped directory page, and
# a native-looking card on the homepage pointing at the directory.

ARCHIVE_DIRECTORY_FILENAME = 'archive-directory.html'
ARCHIVE_INDEX_DIRNAME = 'archive-index'
DIRECTORY_CARD_MARKER = 'mirror-archive-directory-card'
INDEX_PAGE_SIZE = 1000

# One row per browsable area: (slug, heading, seed list, sort-by-label). The
# browse index for an area lists every seed item whose capture file exists;
# areas whose seed ids are chronological (news, events) keep seed order.
ARCHIVE_AREAS = [
    ('news', 'News', 'news.txt', False),
    ('events', 'Events', 'events.txt', False),
    ('clubs', 'Clubs', 'clubs.txt', True),
    ('gallery', 'Gallery sets', 'gallery.txt', True),
    ('members', 'Member profiles', 'members.txt', True),
    ('moves', 'Moves', 'moves.txt', True),
    ('faq', 'FAQ', 'faq.txt', True),
    ('rules', 'Rulebook chapters', 'rules.txt', False),
    ('polls', 'Polls', 'polls.txt', False),
    ('ranking', 'Rankings', 'ranking.txt', False),
]

_TITLE_RE = re.compile(rb'<title[^>]*>(.*?)</title>', re.IGNORECASE | re.DOTALL)


def _www_root():
    return os.path.join(MIRROR_DIR, 'www.footbag.org')


def _page_label(filepath, fallback):
    # Human label for an index row: the captured page's own <title>, with the
    # site-name prefix dropped; the URL tail when a title is absent.
    try:
        with open(filepath, 'rb') as f:
            head = f.read(4096)
    except OSError:
        return fallback
    m = _TITLE_RE.search(head)
    if not m:
        return fallback
    title = m.group(1).decode('utf-8', errors='replace')
    title = re.sub(r'\s+', ' ', title).strip()
    for prefix in ('footbag.org:', 'Footbag WorldWide!', 'footbag.org'):
        if title.startswith(prefix):
            title = title[len(prefix):].lstrip(' :')
    return title or fallback


_ARCHIVE_PAGE_STYLE = (
    'body{font-family:Verdana,Arial,sans-serif;font-size:10pt;margin:1em 2em;'
    'background:#fff;color:#000}h1{font-size:14pt}h2{font-size:11pt;'
    'border-bottom:1px solid #999;padding-bottom:2px}a{color:#039}'
    'ul{margin:0.3em 0 1em 1.2em;padding:0}li{margin:0.15em 0}'
    '.pagenav{margin:0.6em 0;color:#666}.count{color:#666;font-size:8pt}'
)


def _archive_page(title, body_html):
    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        f'<title>{title}</title>\n<style>{_ARCHIVE_PAGE_STYLE}</style>\n'
        '</head>\n<body>\n'
        f'{body_html}'
        '\n<p class="count">(Generated from the footbag.org archive capture; '
        'every link on this page points at a preserved page.)</p>\n'
        '</body>\n</html>\n'
    )


def generate_browse_indexes(seeds_dir=None):
    # One complete, paginated index per area, listing every seed item whose
    # capture exists on disk. Whole-file overwrites: regenerating after a
    # longer crawl only ever adds rows.
    seeds_dir = Path(seeds_dir or SEEDS_DIR)
    results = {}
    for slug, heading, seed_name, sort_by_label in ARCHIVE_AREAS:
        seed_file = seeds_dir / seed_name
        if not seed_file.is_file():
            continue
        entries = []
        for line in seed_file.read_text(encoding='utf-8').splitlines():
            url = line.strip()
            if not url or url.startswith('#'):
                continue
            try:
                target = url_to_filepath(url)
            except ValueError:
                continue
            if not target or not os.path.exists(target):
                continue
            tail = [s for s in urlparse(url).path.split('/') if s]
            entries.append((target, _page_label(target, tail[-1] if tail else url)))
        if not entries:
            continue
        if sort_by_label:
            entries.sort(key=lambda e: e[1].casefold())
        index_dir = os.path.join(_www_root(), ARCHIVE_INDEX_DIRNAME, slug)
        os.makedirs(index_dir, exist_ok=True)
        pages = [entries[i:i + INDEX_PAGE_SIZE]
                 for i in range(0, len(entries), INDEX_PAGE_SIZE)]

        def page_file(num):
            return 'index.html' if num == 1 else f'page{num}.html'

        for num, page_entries in enumerate(pages, start=1):
            page_path = os.path.join(index_dir, page_file(num))
            nav = ''
            if len(pages) > 1:
                links = ' '.join(
                    f'<b>{n}</b>' if n == num else f'<a href="{page_file(n)}">{n}</a>'
                    for n in range(1, len(pages) + 1))
                nav = f'<p class="pagenav">Pages: {links}</p>\n'
            items = '\n'.join(
                f'<li><a href="{calculate_relative_path(page_path, target)}">'
                f'{label}</a></li>'
                for target, label in page_entries)
            body = (
                f'<h1>{heading} — complete archive index</h1>\n'
                f'<p class="count">{len(entries)} captured pages'
                f'{f", {len(pages)} index pages" if len(pages) > 1 else ""}.</p>\n'
                f'<p><a href="../../{ARCHIVE_DIRECTORY_FILENAME}">'
                'Back to the Archive Directory</a></p>\n'
                f'{nav}<ul>\n{items}\n</ul>\n{nav}'
            )
            _atomic_write_text(page_path, _archive_page(
                f'{heading} — footbag.org archive index', body))
        results[slug] = (heading, len(entries))
        logging.info(f"Archive index generated: {slug} ({len(entries)} entries)")
    return results


def _worlds_year(name):
    m = re.fullmatch(r'worlds(\d{2,4})', name)
    if not m:
        return None
    year = int(m.group(1))
    return year + 1900 if year < 100 else year


def generate_archive_directory(index_counts):
    # The one human hub: content areas by TOPIC (never by disk layout), the
    # World Championships across BOTH trees interleaved chronologically, and
    # every other microsite. Only links whose target file exists are emitted.
    www = _www_root()
    sections = []

    area_rows = []
    for slug, heading, _seed, _sort in ARCHIVE_AREAS:
        if slug not in index_counts:
            continue
        _heading, count = index_counts[slug]
        area_rows.append(
            f'<li><a href="{ARCHIVE_INDEX_DIRNAME}/{slug}/index.html">{heading}</a>'
            f' <span class="count">({count} pages)</span></li>')
    if area_rows:
        sections.append('<h2>Browse by area</h2>\n<ul>\n' + '\n'.join(area_rows) + '\n</ul>')

    # Rank 0 = www tree, 1 = vhost tree: a year captured in both trees (a
    # cross-published championship stored twice) gets ONE row, the www copy.
    worlds = []
    for entry in sorted(os.listdir(www)) if os.path.isdir(www) else []:
        year = _worlds_year(entry)
        if year and os.path.exists(os.path.join(www, entry, 'index.html')):
            worlds.append((year, 0, f'{entry}/index.html', f'World Championships {year}'))
    sites_root = os.path.join(www, 'sites')
    microsites = []
    if os.path.isdir(sites_root):
        for entry in sorted(os.listdir(sites_root)):
            if not os.path.exists(os.path.join(sites_root, entry, 'index.html')):
                continue
            year = _worlds_year(entry)
            if year:
                worlds.append((year, 1, f'sites/{entry}/index.html',
                               f'World Championships {year}'))
            else:
                microsites.append(f'<li><a href="sites/{entry}/index.html">{entry}</a></li>')
    if worlds:
        worlds.sort()
        seen_years = set()
        rows = []
        for year, _rank, href, label in worlds:
            if year in seen_years:
                continue
            seen_years.add(year)
            rows.append(f'<li><a href="{href}">{label}</a></li>')
        sections.append('<h2>World Championships</h2>\n<ul>\n' + '\n'.join(rows) + '\n</ul>')
    if microsites:
        sections.append('<h2>Microsites</h2>\n<ul>\n' + '\n'.join(microsites) + '\n</ul>')

    wikis = []
    for href, label in (('reference2/index.html', 'Reference wiki (captured from www)'),
                        ('sites/reference/index.html', 'Reference site (captured from the sites host)')):
        if os.path.exists(os.path.join(www, href)):
            wikis.append(f'<li><a href="{href}">{label}</a></li>')
    if wikis:
        sections.append('<h2>Reference</h2>\n<ul>\n' + '\n'.join(wikis) + '\n</ul>')

    body = (
        '<h1>The footbag.org Archive Directory</h1>\n'
        '<p>Every page preserved in this archive is reachable from here: the '
        'complete per-area indexes below include content the original site '
        'never linked from its own menus.</p>\n'
        '<p><a href="index.html">Back to the archive home page</a></p>\n'
        + '\n'.join(sections)
    )
    path = os.path.join(www, ARCHIVE_DIRECTORY_FILENAME)
    os.makedirs(www, exist_ok=True)
    _atomic_write_text(path, _archive_page('footbag.org Archive Directory', body))
    logging.info(f"Archive Directory generated: {path}")
    return path


def insert_homepage_directory_card():
    # One native-looking content card on the homepage, built from the page's
    # own block classes so the site stylesheet renders it like its neighbors.
    # Marker-guarded: a resumed or repeated run never inserts it twice; string
    # insertion so the rest of the homepage stays byte-identical.
    homepage = os.path.join(_www_root(), 'index.html')
    if not os.path.exists(homepage):
        logging.warning("Homepage not captured yet; archive-directory card not inserted")
        return False
    html = Path(homepage).read_text(encoding='utf-8', errors='replace')
    if DIRECTORY_CARD_MARKER in html:
        return True
    card = (
        f'\n<!-- {DIRECTORY_CARD_MARKER} -->\n'
        '<div class="indexEvents">\n'
        '<h2>Complete Archive</h2>\n'
        '<div class="indexEventsIndent">\n'
        f'<div class="newsHeadline"><a href="{ARCHIVE_DIRECTORY_FILENAME}">'
        'Browse the complete footbag.org archive</a></div>\n'
        '<div class="newsDetails">News, events, clubs, gallery sets, member '
        'profiles, moves, rules, FAQ, polls, rankings, and the World '
        'Championships sites — every preserved page, in one directory.</div>\n'
        '</div>\n'
        '</div>\n'
    )
    for anchor in ('<div class="indexNotices">', '</body>'):
        pos = html.find(anchor)
        if pos != -1:
            html = html[:pos] + card + html[pos:]
            _atomic_write_text(homepage, html)
            logging.info("Archive-directory card inserted on the homepage")
            return True
    logging.warning("No insertion anchor found on the homepage; card not inserted")
    return False


def generate_reachability_pages(seeds_dir=None):
    counts = generate_browse_indexes(seeds_dir)
    generate_archive_directory(counts)
    insert_homepage_directory_card()


# ---------- Video backfill: consume the skipped-videos manifest ----------
#
# Skip-mode crawls record every excluded video (with all referring pages) in
# the manifest instead of downloading it. This second pass completes the
# archive: fetch each recorded binary through the same refusal / session /
# politeness / magic-byte / re-encode path as any other media, then repair the
# referring pages so their elements point at the local mp4 instead of the
# retained original URL. Outcomes are written back into the manifest, so what
# remains un-backfilled is always visible with reasons.

def _load_skipped_video_manifest():
    manifest_path = os.path.join(MIRROR_DIR, SKIPPED_VIDEO_MANIFEST)
    if not os.path.exists(manifest_path):
        raise SystemExit(
            f"MISSING: {manifest_path}\n"
            "The video backfill consumes the skipped-videos manifest that a "
            "skip-mode crawl writes into the mirror directory. Run the crawl "
            "first (videos are skipped by default), then re-run with "
            "--video-backfill.")
    records = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    return {rec.get('normalized_url') or normalize_url(rec['url']): rec
            for rec in records}


def _element_matches_video(tag, attr, page_url, rec_norm):
    value = tag.get(attr)
    if not value or value.startswith(('mailto:', 'javascript:', 'tel:', 'data:', '#')):
        return False
    try:
        return normalize_url(urljoin(page_url, value)) == rec_norm
    except Exception:
        return False


def _strip_adjacent_skip_marker(tag):
    # The skip pass left an explanatory comment right before the element it
    # kept pointing at the original URL; once the element is repaired (or
    # replaced by the failure fallback) that comment is stale. Scan back over
    # any intervening text nodes (whitespace or not), stopping at the first
    # real element, so the marker is found even when text sits between it and
    # the video element.
    prev = tag.previous_sibling
    while prev is not None and isinstance(prev, NavigableString) and not isinstance(prev, Comment):
        prev = prev.previous_sibling
    if isinstance(prev, Comment) and 'skip-videos' in prev:
        prev.extract()


def _rewrite_referrer_page(referrer_url, page_records):
    # Repair one referring page in place: every element whose target normalizes
    # to a backfilled video gets the relative local path; elements whose video
    # failed conversion get the standard broken-video fallback. Matching is by
    # normalized URL, never raw string equality, so escaped ampersands and
    # UI-param noise cannot cause a silent miss.
    try:
        page_path = url_to_filepath(referrer_url)
    except ValueError:
        logging.warning(f"Backfill: unmappable referrer skipped: {referrer_url}")
        return 0
    if not page_path or not os.path.exists(page_path):
        logging.info(f"Backfill: referrer page not in mirror, skipped: {referrer_url}")
        return 0
    html = Path(page_path).read_text(encoding='utf-8', errors='replace')
    soup = BeautifulSoup(html, 'html.parser')
    repaired = 0
    for rec_norm, rec, processed_path in page_records:
        for tag in soup.find_all(['a', 'video', 'source', 'embed']):
            for attr in ('href', 'src'):
                if not _element_matches_video(tag, attr, referrer_url, rec_norm):
                    continue
                _strip_adjacent_skip_marker(tag)
                if processed_path:
                    tag[attr] = calculate_relative_path(page_path, processed_path)
                    if tag.name == 'source':
                        tag['type'] = get_media_mime_type(processed_path)
                    tag.insert_before(Comment("Mirror: video backfilled to local file"))
                else:
                    fallback = os.path.basename(urlparse(rec['url']).path)
                    drop_broken_video_element(tag, fallback)
                repaired += 1
                break
    if repaired:
        _atomic_write_text(page_path, str(soup))
        logging.info(f"Backfill: {repaired} element(s) repaired on {referrer_url}")
    return repaired


def run_video_backfill():
    # The whole point of this pass is downloading videos, so the module-level
    # skip flag must be off (main() clears it for --video-backfill). Guard the
    # seam: with it on, download_and_process_media would re-skip every record
    # and mark them all failed.
    global SKIP_VIDEOS
    SKIP_VIDEOS = False
    manifest = _load_skipped_video_manifest()
    mirror_state.skipped_videos = manifest
    logging.info(f"Video backfill: {len(manifest)} recorded videos")

    outcomes = {'backfilled': 0, 'already_done': 0, 'failed': 0, 'refused': 0}
    by_referrer = {}
    for rec_norm, rec in manifest.items():
        if rec.get('disposition') == 'backfilled':
            outcomes['already_done'] += 1
            continue
        url = rec['url']
        if is_unsafe_url(url):
            rec['disposition'] = 'backfill_refused_unsafe'
            outcomes['refused'] += 1
            continue
        processed = download_and_process_media(url, session, referrer=None)
        if processed and processed != SKIPPED_VIDEO:
            rec['disposition'] = 'backfilled'
            rec['local_file'] = processed
            outcomes['backfilled'] += 1
        else:
            processed = None
            rec['disposition'] = 'backfill_failed'
            outcomes['failed'] += 1
        for referrer in rec.get('referrers') or []:
            by_referrer.setdefault(referrer, []).append((rec_norm, rec, processed))

    repaired_pages = sum(
        1 for referrer, page_records in sorted(by_referrer.items())
        if _rewrite_referrer_page(referrer, page_records))

    mirror_state.write_skipped_video_manifest()
    logging.info(
        f"Video backfill complete: {outcomes['backfilled']} backfilled, "
        f"{outcomes['already_done']} already done, {outcomes['failed']} failed, "
        f"{outcomes['refused']} refused; {repaired_pages} referrer pages repaired")
    return outcomes


def create_root_index():
    root_index_path = os.path.join(MIRROR_DIR, 'index.html')
    
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Footbag.org Mirror</title>
    <meta http-equiv="refresh" content="0; url=www.footbag.org/index.html">
</head>
<body>
    <h1>Footbag.org Mirror</h1>
    <p>Redirecting to main site...</p>
    <p>If you are not redirected automatically, <a href="www.footbag.org/index.html">click here</a>.</p>
</body>
</html>"""
    _atomic_write_text(root_index_path, html_content)
    logging.info(f"Created root index.html at {root_index_path}")

def _looks_like_login_page_bytes(content):
    """True when an HTML body is the site's login page (session lapsed and the
    server answered 200 with the sign-in form instead of redirecting). Keyed on
    the login form's own markers, the same ones login() verifies against, so an
    ordinary member page that merely mentions passwords does not match."""
    try:
        sample = content[:20000].decode('utf-8', errors='ignore').lower()
    except Exception:
        return False
    return ('name="loginform"' in sample or 'member sign-in' in sample) \
        and 'memberpassword' in sample


def is_dns_error(exception):
    error_msg = str(exception).lower()
    return 'name resolution' in error_msg or 'failed to resolve' in error_msg

def is_events_show_url(url):
    """True if URL is any event show page (/events/show/<id>). Fetched without auth so we get the public view."""
    try:
        parsed = urlparse(url)
        return bool(re.match(r'^/events/show/\d+/?$', (parsed.path or '').strip()))
    except Exception:
        return False

def fetch(url):
    if is_unsafe_url(url):
        logging.info(f"Refusing admin/mutating URL (fetch): {url}")
        return None, None
    attempt = 0
    max_attempts = 1 + MAX_RETRIES  # total attempts = initial + retries
    auth_redirects = 0  # Track auth redirect loops
    last_failure_kind = None  # 'permanent_http' | 'retryable_http' | 'retryable_transport' | None
    last_status = None

    while attempt < max_attempts:
        try:
            # Handle re-authentication on session timeout
            if time.time() - mirror_state.session_start > SESSION_TIMEOUT:
                logging.info("Session timeout, re-authenticating...")
                login()
                mirror_state.session_start = time.time()

            # Canonicalize negative gallery URLs
            if re.search(r'/gallery/show/-\d+/?$', url):
                url = resolve_canonical_gallery_url(url)

            original_url = normalize_url(url)
            polite_wait(original_url)
            if is_events_show_url(original_url):
                # Event show/results pages: fetch as unauthenticated visitor (no session cookies).
                resp = requests.get(original_url, headers={'User-Agent': USER_AGENT}, timeout=30, stream=True, allow_redirects=True)
            else:
                # Session picked by target host: the member session only for www.
                resp = session_for(original_url).get(original_url, timeout=30, stream=True, allow_redirects=True)
            final_url = normalize_url(resp.url)

            # Detect forced login redirect (e.g. session expired)
            if 'newauthorize' in final_url and 'target=' in final_url:
                auth_redirects += 1

                # Prevent infinite auth loops
                if auth_redirects >= 3:
                    logging.warning(f"URL {original_url} keeps redirecting to auth after {auth_redirects} attempts, skipping")
                    mirror_state.failed_urls.add(url)
                    mirror_state.stats['failed_downloads'] += 1
                    return None, None

                parsed = urlparse(final_url)
                match = re.search(r'target=([^&]+)', parsed.query)
                if match:
                    target_path = unquote(match.group(1))
                    target_url = normalize_url(urljoin(BASE_URL, target_path))
                    logging.warning(f"Detected newauthorize redirect for {original_url} (auth attempt {auth_redirects}). Re-authenticating.")
                    mirror_state.duplicate_redirects[original_url] = target_url
                    login()
                    mirror_state.session_start = time.time()
                    # Don't increment attempt counter for re-auth retries
                    continue

            # Record permanent redirect
            if final_url != original_url:
                mirror_state.duplicate_redirects[original_url] = final_url
                mirror_state.duplicate_redirects[original_url.rstrip('/')] = final_url
                mirror_state.duplicate_redirects[original_url + '/'] = final_url
                logging.debug(f"Redirected: {original_url} → {final_url}")

            # Raise HTTP error if status is 4xx or 5xx (keep your behavior)
            try:
                resp.raise_for_status()
            except requests.exceptions.HTTPError as e:
                status = getattr(e.response, 'status_code', None)
                last_status = status

                if status == 404:
                    # 404 is permanent - don't retry
                    logging.info(f"Failed to fetch (not found): {url}")
                    mirror_state.failed_urls.add(url)
                    mirror_state.stats['failed_downloads'] += 1
                    return None, None

                elif status in TRANSIENT_RETRY_CODES:
                    attempt += 1
                    if attempt < max_attempts:
                        wait_time = (2 ** (attempt - 1)) * DELAY_SECONDS
                        logging.info(f"HTTP error {status} for {url} (attempt {attempt}/{max_attempts})...")
                        time.sleep(wait_time)
                        # keep looping
                        continue
                    else:
                        # Final attempt failed (retryable HTTP) → do NOT count as failed_downloads
                        logging.warning(f"HTTP error {status} for {url} after {max_attempts} attempts.")
                        last_failure_kind = 'retryable_http'
                        break
                else:
                    # Non-transient HTTP error (treat as permanent)
                    logging.warning(f"HTTP error {status} for {url}: {e}")
                    last_failure_kind = 'permanent_http'
                    break

            # --skip-videos: reject a video Content-Type from the streamed
            # headers before resp.content reads the whole body. Detection is by
            # served type (and extension as a backstop), never by the URL
            # containing the word "video": an HTML page under /video/ passes.
            if SKIP_VIDEOS:
                served_type = (resp.headers.get('Content-Type') or '').split(';')[0].strip().lower()
                if served_type.startswith('video/') or get_extension(final_url) in VIDEO_EXTENSIONS:
                    mirror_state.record_skipped_video(
                        final_url, referrer=original_url if final_url != original_url else None,
                        ext=get_extension(final_url), content_type=served_type,
                        reason='content-type' if served_type.startswith('video/') else 'extension',
                        status=resp.status_code,
                        content_length=resp.headers.get('Content-Length'))
                    resp.close()
                    time.sleep(DELAY_SECONDS)
                    return None, final_url

            # Check size limit
            content = resp.content
            if len(content) > MAX_FILE_SIZE:
                mirror_state.stats['skipped_too_large'] += 1
                logging.warning(f"Content too large ({len(content)} bytes), skipping: {original_url}")
                return None, None

            # Session-expiry backstop: a session that lapsed mid-crawl can
            # return HTTP 200 with the login form as the BODY (no redirect),
            # which the URL-based newauthorize check above never sees. Detect
            # the login page by its own markers and re-authenticate once
            # rather than saving it as real content.
            served_type = (resp.headers.get('Content-Type') or '').lower()
            if 'text/html' in served_type and _looks_like_login_page_bytes(content) \
                    and 'newauthorize' not in final_url:
                auth_redirects += 1
                if auth_redirects >= 3:
                    logging.warning(f"URL {original_url} keeps returning the login page after {auth_redirects} re-auths, skipping")
                    return None, None
                logging.warning(f"Login-form body detected at {final_url}; re-authenticating.")
                login()
                mirror_state.session_start = time.time()
                continue

            time.sleep(DELAY_SECONDS)
            return resp, final_url

        except requests.exceptions.RequestException as e:
            # Transport/network errors → retryable; DO NOT count as failed_downloads on exhaustion
            if is_dns_error(e):
                wait_time = 240  # 4 minutes for DNS errors
                logging.warning(f"DNS error on {url} (attempt {attempt + 1}/{max_attempts}), waiting {wait_time}s...")
            else:
                wait_time = (2 ** attempt) * DELAY_SECONDS
                logging.info(f"Network error on {url} (attempt {attempt + 1}/{max_attempts}), waiting {wait_time}s...")

            attempt += 1
            if attempt < max_attempts:
                time.sleep(wait_time)
                continue
            else:
                logging.warning(f"Unrecoverable error on {url} after {max_attempts} attempts.")
                last_failure_kind = 'retryable_transport'
                break

    # All attempts exhausted — only count permanent failures
    if last_failure_kind == 'permanent_http':
        mirror_state.failed_urls.add(url)
        mirror_state.stats['failed_downloads'] += 1
        logging.info(f"Failed to fetch {url} (permanent HTTP {last_status})")
    else:
        # retryable_http or retryable_transport → don't mark failed_downloads
        logging.info(f"Giving up on {url} after retries (retryable failure: {last_failure_kind or 'unknown'})")
    return None, None

def extract_links(html, base_url):
    try:
        if base_url.startswith("file://"):
            logging.error(f"Invalid base_url: {base_url}")
            return set()

        soup = BeautifulSoup(html, 'html.parser')
        links = set()
        # suppress redundant links
        redundant_preview_ids = set()
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            match = re.match(r'\.\./\.\./show/-(\d+)/index\.html$', href)
            if not match:
                continue

            gallery_id = match.group(1)
            positive_href = f"../../show/{gallery_id}/index.html"

            td = a_tag.find_parent('td')
            if td and td.find('a', href=positive_href):
                redundant_preview_ids.add(gallery_id)

        # Scan all elements for links
        for element in soup.find_all(True):
            for attr in ['href', 'src', 'action', 'data']:
                link = element.get(attr)
                if not link or '<%' in link or '%>' in link:
                    continue
                if link.startswith(('mailto:', 'javascript:', 'tel:', 'data:', '#')):
                    continue

                # Suppress link if it's a known redundant preview
                match = re.match(r'\.\./\.\./show/-(\d+)/index\.html$', link)
                if match and match.group(1) in redundant_preview_ids:
                    logging.info(f"Skipping redundant preview link: {link}")
                    continue

                try:
                    full_url = urljoin(base_url, link)
                    if full_url.startswith("file://"):
                        logging.error(f"Skipping invalid join: base={base_url} + link={link} → {full_url}")
                        continue

                    final_url = mirror_state.duplicate_redirects.get(full_url, full_url)
                    # Enqueue point for cross-published dedup: the vhost twin of
                    # a verified www page never enters the queue.
                    processed_url = canonicalize_cross_published(normalize_url(final_url))

                    parsed = urlparse(final_url)
                    if parsed.path in ['/registration/register', '/registration/regsummary'] and 'tid=' in parsed.query:
                        processed_url = final_url  # preserve full URL with tid=

                    if is_in_scope(processed_url):
                        ext = get_extension(processed_url).lower()

                        # Canonicalize /gallery/show links
                        if re.search(r'/gallery/show/-?\d+/?$', processed_url):
                            processed_url = resolve_canonical_gallery_url(processed_url)

                        if is_failed_conversion_video(processed_url):
                            logging.info(f"Skipping link to failed-conversion video: {processed_url}")
                            continue

                        links.add(processed_url)

                except Exception as e:
                    logging.error(f"Skipping malformed link {link}: {e}")
                    continue

        # Embedded media via <source> tags
        for source in soup.find_all("source"):
            src = source.get("src")
            if not src:
                continue
            try:
                media_url = urljoin(base_url, src)
                if media_url.startswith("file://"):
                    logging.error(f"Skipping bad media join: {base_url} + {src}")
                    continue

                media_url = mirror_state.duplicate_redirects.get(media_url, media_url)
                processed_url = canonicalize_cross_published(normalize_url(media_url))

                if is_media_file(processed_url) and is_in_scope(processed_url):
                    logging.debug(f"Found embedded media in <source>: {processed_url}")
                    ext = get_extension(processed_url).lower()

                    if is_failed_conversion_video(processed_url):
                        logging.info(f"Skipping link to failed-conversion video at extraction: {processed_url}")
                        continue

                    links.add(processed_url)

            except Exception as e:
                logging.error(f"Skipping malformed <source> src {src}: {e}")
                continue
        return links

    except Exception as e:
        logging.error(f"Error extracting links from {base_url}: {e}")
        return set()

def load_seed_urls(paths):
    # Read seed URLs from the given files, or from every .txt inside a given
    # directory. Lines are absolute URLs, one per line; blanks and '#' comment
    # lines are tolerated. A missing path is a one-line actionable warning, not
    # a crash: the seed lists come from build_archive_seed_lists.py and a clone
    # without them can still run a plain link-following crawl.
    files = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.glob('*.txt')))
        elif path.is_file():
            files.append(path)
        else:
            logging.warning(
                f"Seed path not found: {p} (generate seed lists with "
                f"legacy_data/scripts/build_archive_seed_lists.py)")
    urls = []
    for f in files:
        count = 0
        for line in f.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            urls.append(line)
            count += 1
        logging.info(f"Seed list {f.name}: {count} URLs")
    return urls


def enqueue_seed_urls(urls):
    # Enqueue seed URLs at depth 0. Unsafe and out-of-scope seeds are refused
    # by the same predicates as discovered links; already-visited and
    # already-queued URLs are skipped, so re-running a seeded crawl only
    # fetches what is still missing.
    queued = set(mirror_state.queue)
    added = skipped_seen = refused = 0
    for url in urls:
        norm = canonicalize_cross_published(normalize_url(url))
        if norm in mirror_state.visited or norm in queued:
            skipped_seen += 1
            continue
        if not is_in_scope(norm):
            refused += 1
            logging.info(f"Seed refused (unsafe or out of scope): {norm}")
            continue
        mirror_state.queue.append(norm)
        mirror_state.url_depth[norm] = 0
        queued.add(norm)
        added += 1
    logging.info(f"Seeds enqueued: {added} added, {skipped_seen} already "
                 f"visited/queued, {refused} refused")
    return added


def _ensure_start_urls(start_urls):
    # Start URLs are always present on a fresh crawl, even when seed lists
    # pre-populated the queue; on a resume, a visited start URL is not re-added.
    queued = set(mirror_state.queue)
    front = []
    for url in start_urls:
        norm_url = normalize_url(url)
        if norm_url in mirror_state.visited or norm_url in queued:
            continue
        front.append(norm_url)
        mirror_state.url_depth[norm_url] = 0
    # Prepend so the homepage and entry pages are crawled before seed backlog.
    mirror_state.queue[:0] = front


def crawl(start_urls):
    _ensure_start_urls(start_urls)

    while mirror_state.queue and len(mirror_state.visited) < MAX_URLS:
        original_url = mirror_state.queue.pop(0)

        parsed = urlparse(original_url)
        visited_key = normalize_url(original_url)

        if visited_key in mirror_state.visited:
            continue

        # BUG FIX: Mark as visited immediately after pop to prevent loss if crash occurs
        # before periodic save. This ensures queue and visited stay consistent.
        mirror_state.visited.add(visited_key)

        current_depth = mirror_state.url_depth.get(original_url, 0)
        if current_depth > MAX_DEPTH:
            logging.info(f"Depth limit reached for {original_url}")
            continue

        mirror_state.stats['total_urls'] += 1
        logging.info(f"Fetching: {original_url} (depth: {current_depth})")

        resp, final_url = fetch(original_url)
        if not final_url:
            logging.debug(f"Skipping {original_url} — no final URL")
            continue

        parsed_final = urlparse(final_url)
        final_visited_key = normalize_url(final_url)

        # Also mark final URL as visited (may be same as original if no redirect)
        mirror_state.visited.add(final_visited_key)

        if final_url != original_url:
            orig_visited_key = normalize_url(original_url)
            # original_url already in visited from line above, but ensure it's there
            mirror_state.visited.add(orig_visited_key)

            original_url = normalize_url(original_url)
            final_url = normalize_url(final_url)

            mirror_state.duplicate_redirects[original_url] = final_url
            mirror_state.duplicate_redirects[original_url.rstrip('/')] = final_url
            mirror_state.duplicate_redirects[original_url + '/'] = final_url

            redirect_source_path = url_to_filepath(original_url)
            if is_footbag_domain(final_url):
                redirect_target_path = url_to_filepath(final_url)
            else:
                redirect_target_path = None  # Offsite — no path

            if (
                redirect_source_path and
                (
                    redirect_target_path is None or
                    os.path.abspath(redirect_source_path) != os.path.abspath(redirect_target_path)
                ) and
                not os.path.exists(redirect_source_path)
            ):
                try:
                    os.makedirs(os.path.dirname(redirect_source_path), exist_ok=True)
                    rel_path = (
                        calculate_relative_path(redirect_source_path, redirect_target_path)
                        if redirect_target_path else final_url
                    )
                    html = f"""<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url={rel_path}">
    <title>Redirecting</title>
  </head>
  <body>
    <p>Redirecting to <a href="{rel_path}">{rel_path}</a></p>
  </body>
</html>"""
                    _atomic_write_text(redirect_source_path, html)
                    mirror_state.sitemap.append(redirect_source_path)
                    mirror_state.stats['successful_downloads'] += 1
                    logging.debug(f"Incremental redirect created: {redirect_source_path} → {rel_path}")
                except Exception as e:
                    logging.error(f"Failed to write redirect page: {redirect_source_path}: {e}")
            elif redirect_source_path == redirect_target_path:
                logging.debug(f"Skipped self-redirect for: {redirect_source_path}")

        if not resp:
            logging.debug(f"No content fetched for {original_url} → {final_url}")
            continue

        content_type = resp.headers.get('Content-Type', '').lower()
        parsed_path = urlparse(final_url).path.lower()
        filename = os.path.basename(parsed_path)

        is_html = (
            'text/html' in content_type or
            filename.endswith(('.html', '.htm')) or
            '.' not in filename  # No extension — default page like index
        )

        # Special handlers below are all www app routes: a vhost path of the
        # same shape must take the general save path instead.
        www_page = parsed.netloc == WWW_HOST
        if (
            is_html and www_page and
            original_url.rstrip('/').endswith('/news/list') and
            'Year=' not in original_url
        ):
            try:
                current_year = str(datetime.now().year)
                show_all_url = f"{BASE_URL}/news/list?f=10&from=0&Year={current_year}"
                if final_url != show_all_url:
                    show_all_resp, show_all_final_url = fetch(show_all_url)
                    if show_all_resp:
                        resp = show_all_resp
                        final_url = show_all_final_url

                filepath = os.path.join(
                    MIRROR_DIR, 'www.footbag.org', 'news', f'list_{current_year}', 'index.html'
                )
                rewritten_html = inject_as_of_note(rewrite_links(resp.text, final_url))
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                _atomic_write_text(filepath, rewritten_html)
                mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                mirror_state.sitemap.append(filepath)
                mirror_state.stats['successful_downloads'] += 1
                
                mirror_state.visited.add(visited_key)
                logging.info(f"Saved current-year news to: {filepath}")
                create_news_list_redirector()
            except Exception as e:
                logging.error(f"Error handling /news/list page: {e}")
            continue

        if (
            is_html and www_page and parsed.path == '/news/list' and 'Year=' in parsed.query
        ):
            try:
                query_parts = parse_qs(parsed.query)
                year = query_parts.get('Year', [None])[0]
                if year:
                    show_all_url = f"{BASE_URL}/news/list?f=10&from=0&Year={year}"
                    if final_url != show_all_url:
                        show_all_resp, show_all_final_url = fetch(show_all_url)
                        if show_all_resp:
                            resp = show_all_resp
                            final_url = show_all_final_url
                    if year.isdigit():
                        if len(year) == 1:
                            year = f"200{year}"
                        elif len(year) == 2:
                            year = f"20{year}" if int(year) <= 30 else f"19{year}"
                        elif len(year) == 3:
                            year = f"200{year[-1]}"
                    filepath = os.path.join(MIRROR_DIR, 'www.footbag.org', 'news', f'list_{year}', 'index.html')
                    rewritten_html = inject_as_of_note(rewrite_links(resp.text, final_url))
                    os.makedirs(os.path.dirname(filepath), exist_ok=True)
                    _atomic_write_text(filepath, rewritten_html)
                    mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                    mirror_state.sitemap.append(filepath)
                    mirror_state.stats['successful_downloads'] += 1
                    mirror_state.visited.add(visited_key)
                    logging.info(f"Saved {year} news to: {filepath}")
            except Exception as e:
                logging.error(f"Error handling /news/list?Year={year} page: {e}")
            continue

        if (
            is_html and
            www_page and
            original_url.rstrip('/').endswith('/events/past') and
            'year=' not in original_url
        ):
            try:
                current_year = str(datetime.now().year)
                filepath = os.path.join(MIRROR_DIR, 'www.footbag.org', 'events', f'past_year_{current_year}', 'index.html')
                rewritten_html = inject_as_of_note(rewrite_links(resp.text, final_url))
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                _atomic_write_text(filepath, rewritten_html)
                mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                mirror_state.sitemap.append(filepath)
                mirror_state.stats['successful_downloads'] += 1
                mirror_state.visited.add(visited_key)
                logging.info(f"Saved current-year past events to: {filepath}")
                create_events_past_redirector()
            except Exception as e:
                logging.error(f"Error handling /events/past page: {e}")
            continue

        if (
            is_html and
            www_page and
            original_url.rstrip('/').endswith('/events/results') and
            'year=' not in original_url
        ):
            try:
                current_year = str(datetime.now().year)
                filepath = os.path.join(MIRROR_DIR, 'www.footbag.org', 'events', f'results_year_{current_year}', 'index.html')
                rewritten_html = inject_as_of_note(rewrite_links(resp.text, final_url))
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                _atomic_write_text(filepath, rewritten_html)
                mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                mirror_state.sitemap.append(filepath)
                mirror_state.stats['successful_downloads'] += 1
                mirror_state.visited.add(visited_key)
                logging.info(f"Saved current-year results to: {filepath}")
                create_events_results_redirector()
            except Exception as e:
                logging.error(f"Error handling /events/results page: {e}")
            continue

        if is_html and parsed_final.netloc == WWW_HOST and parsed_final.path == '/registration/register' and 'tid=' in parsed_final.query:
            try:
                tid = parse_qs(parsed_final.query).get('tid', [None])[0]
                if tid and tid.isdigit():
                    filepath = os.path.join(\
                        MIRROR_DIR, 'www.footbag.org', 'registration', 'register', tid, 'index.html'
                    )
                    rewritten_html = rewrite_links(resp.text, final_url)
                    os.makedirs(os.path.dirname(filepath), exist_ok=True)
                    _atomic_write_text(filepath, rewritten_html)
                    mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                    mirror_state.sitemap.append(filepath)
                    mirror_state.stats['successful_downloads'] += 1
                    mirror_state.visited.add(visited_key)
                    logging.info(f"Saved registration page for tid={tid} to: {filepath}")
                    continue
            except Exception as e:
                logging.error(f"Error handling /registration/register?tid=...: {e}")
                continue

        if is_html and parsed_final.netloc == WWW_HOST and parsed_final.path == '/registration/regsummary' and 'tid=' in parsed_final.query:
            try:
                tid = parse_qs(parsed_final.query).get('tid', [None])[0]
                if tid and tid.isdigit():
                    filepath = os.path.join(
                        MIRROR_DIR, 'www.footbag.org', 'registration', 'regsummary', tid, 'index.html'
                    )
                    rewritten_html = rewrite_links(resp.text, final_url)
                    os.makedirs(os.path.dirname(filepath), exist_ok=True)
                    _atomic_write_text(filepath, rewritten_html)
                    mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                    mirror_state.sitemap.append(filepath)
                    mirror_state.stats['successful_downloads'] += 1
                    mirror_state.visited.add(visited_key)
                    logging.info(f"Saved regsummary page for tid={tid} to: {filepath}")
                    continue
            except Exception as e:
                logging.error(f"Error handling /registration/regsummary?tid=...: {e}")
                continue
        
        if is_html and re.match(rf'{BASE_URL}/events/show/\d+$', final_url):
            try:
                tid_match = re.search(r'/events/show/(\d+)', final_url)
                if tid_match:
                    tid = tid_match.group(1)
                    regsummary_url = f"{BASE_URL}/registration/regsummary?tid={tid}"
                    try:
                        polite_wait(regsummary_url)
                        reg_resp = session_for(regsummary_url).get(regsummary_url, allow_redirects=True, timeout=15)
                        if reg_resp.status_code == 200:
                            reg_soup = BeautifulSoup(reg_resp.text, 'html.parser')
                            has_members = bool(reg_soup.find('a', href=re.compile(r"javascript:popupprofile\(['\"]?\d{3,10}['\"]?\)")))
                            if has_members:
                                norm_regsummary_url = normalize_url(regsummary_url)
                                if norm_regsummary_url not in mirror_state.visited and norm_regsummary_url not in mirror_state.queue:
                                    mirror_state.queue.append(norm_regsummary_url)
                                    mirror_state.url_depth[norm_regsummary_url] = mirror_state.url_depth.get(final_url, 0) + 1
                                    mirror_state.stats['regsummary_links_detected'] += 1
                                mirror_state.regsummary_map[tid] = norm_regsummary_url
                                logging.info(f"Regsummary with members found for tid={tid}, enqueued")
                            else:
                                logging.info(f"Regsummary for tid={tid} has no members — skipped")
                    except Exception as e:
                        logging.debug(f"No regsummary found for tid={tid}: {e}")
            except Exception as e:
                logging.error(f"Error processing event show page: {e}")

        if is_html:
            try:
                rewritten_html = rewrite_links(resp.text, final_url)
                if should_inject_as_of_note(final_url):
                    rewritten_html = inject_as_of_note(rewritten_html)

                save_content(final_url, rewritten_html, is_html=True)
                new_links = extract_links(resp.text, final_url) 

                for link in new_links:
                    norm_link = normalize_url(mirror_state.duplicate_redirects.get(link, link))
                    if is_failed_conversion_video(norm_link):
                        logging.info(f"Skipping enqueue of failed-conversion video: {norm_link}")
                        continue
                    if SKIP_VIDEOS and get_extension(norm_link) in VIDEO_EXTENSIONS:
                        # Never enqueue a recognized video binary: record it with
                        # its discovering page and spend zero requests on it.
                        mirror_state.record_skipped_video(norm_link, referrer=final_url,
                                                          reason='extension')
                        continue
                    if norm_link not in mirror_state.visited and norm_link not in mirror_state.queue:
                        mirror_state.queue.append(norm_link)
                        mirror_state.url_depth[norm_link] = current_depth + 1
            except Exception as e:
                logging.error(f"Error processing HTML {final_url}: {e}")
        else:
            if is_media_file(final_url):
                processed_filepath = download_and_process_media(final_url, session, referrer=original_url)
                if processed_filepath == SKIPPED_VIDEO:
                    logging.debug(f"Video deliberately skipped (skip-videos): {final_url}")
                elif not processed_filepath:
                    logging.error(f"Failed to process media file: {final_url}")
            else:
                save_content(final_url, resp.content, is_html=False)

        if mirror_state.stats['total_urls'] % 50 == 0:
            mirror_state.save_progress()
            print_stats()

def main():
    global USERNAME, PASSWORD, LOG_TO_FILE, SKIP_VIDEOS

    args = parse_args()
    LOG_TO_FILE = args.log_to_file   # if your parser uses dest="log", change this to: args.log
    USERNAME = args.username
    PASSWORD = args.password
    SKIP_VIDEOS = not args.process_videos
    if args.video_backfill:
        # The backfill's whole purpose is downloading the recorded videos.
        SKIP_VIDEOS = False
    if SKIP_VIDEOS:
        logging.warning(
            "Videos are being SKIPPED (the default). Video binaries are excluded; "
            "pages, posters, thumbnails, captions, and links are still captured, and "
            f"each skipped video is recorded in {SKIPPED_VIDEO_MANIFEST} for a later "
            "videos-only pass. Pass --process-videos to download and re-encode videos.")
    else:
        logging.info("--process-videos enabled: video binaries will be downloaded and "
                     "re-encoded through ffmpeg like all other media.")

    try:
        if args.fresh:
            logging.info("'-fresh' requested — wiping previous mirror state")
            wipe_previous_mirror_state()

        # If -log was requested, attach a file handler for mirror.log in addition to the console handler.
        # IMPORTANT: do this AFTER -fresh so the log file path is recreated and remains visible on disk.
        if LOG_TO_FILE:
            root_logger = logging.getLogger()
            has_file_handler = False
            target_log_path = os.path.abspath(LOG_FILE)

            for handler in root_logger.handlers:
                if isinstance(handler, logging.FileHandler):
                    try:
                        if os.path.abspath(getattr(handler, "baseFilename", "")) == target_log_path:
                            has_file_handler = True
                            break
                    except Exception:
                        continue

            if not has_file_handler:
                file_handler = logging.FileHandler(LOG_FILE)
                file_handler.setLevel(logging.INFO)
                file_handler.setFormatter(
                    logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s')
                )
                root_logger.addHandler(file_handler)

            logging.info(f"File logging enabled: {LOG_FILE}")

        os.makedirs(MIRROR_DIR, exist_ok=True)

        if RESUME_ON_RESTART:
            if mirror_state.load_progress():
                logging.info("Resuming from previous session")
            else:
                logging.info("Starting fresh mirror session")

        # BUG FIX: Always login (fresh or resumed) to ensure session is valid.
        # Set session_start AFTER login, not before, to have correct baseline.
        login()
        mirror_state.session_start = time.time()

        if not verify_authenticated_session():
            raise RuntimeError("Login appeared successful, but authenticated session failed.")

        if args.video_backfill:
            # Consume the manifest and repair referrers; no crawl in this mode.
            run_video_backfill()
            robot_checker.save_cache()
            print_stats()
            logging.info("Video backfill run complete")
            return

        # Seed lists load by default (the archival crawl wants all content);
        # --seeds narrows to specific files for a targeted run.
        seed_paths = args.seeds if args.seeds else [SEEDS_DIR]
        enqueue_seed_urls(load_seed_urls(seed_paths))

        crawl(START_URLS)
        generate_reachability_pages(seed_paths[0] if len(seed_paths) == 1
                                    and Path(seed_paths[0]).is_dir() else SEEDS_DIR)
        create_root_index()
        save_sitemap()
        save_redirect_map()
        mirror_state.save_progress()
        mirror_state.write_skipped_video_manifest()
        robot_checker.save_cache()
        print_stats()
        logging.info("Footbag.org Mirror complete!!!")

    except KeyboardInterrupt:
        logging.info("Mirror interrupted by user")
        signal_handler(signal.SIGINT, None)
    except Exception as e:
        logging.error(f"Critical error: {e}")
        mirror_state.save_progress()
        raise


if __name__ == '__main__':
    main()