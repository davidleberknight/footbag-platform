"""
create_mirror_footbag_org.py: footbag.org local mirror (offline archival copy)

WARNING:
- This is a long-running archival script.
- Expect roughly ~60 GB disk usage (can vary).
- Expect it to take multiple days to complete, depending on network speed and site responsiveness.
- It downloads and rewrites a large amount of content, including media.
- ffmpeg is required for converting older media formats to MP4/JPG.

This is AI-assisted code: a bit messy in places, but it gets the job done.

What it does
- Logs into footbag.org (for member-only content access)
- Crawls pages and media
- Rewrites links for offline browsing
- Converts legacy media formats when needed
- Saves progress so it can resume after interruption

Requirements
- Python 3.10+ (likely works on nearby versions)
- ffmpeg
- pip packages: requests, beautifulsoup4, pillow

Quick setup
    sudo apt update
    sudo apt install ffmpeg

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

Usage (current CLI)
    python create_mirror_footbag_org.py <username_or_email> <password>
    python create_mirror_footbag_org.py <username_or_email> <password> -fresh

Notes
- '-fresh' wipes previous mirror state before starting.
- '-log' enables logging to file (mirror.log).
- Progress is periodically saved and also saved on Ctrl+C / SIGTERM.
- Output is written under ./mirror_footbag_org by default.
- Passing a password on the command line is convenient but not ideal (it may end up in shell history / process lists).
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
from PIL import Image
from datetime import datetime, timedelta
import re
from bs4 import BeautifulSoup, Comment, NavigableString
import subprocess
import shutil

# ========== CONFIGURATION ==========
USERNAME = None # '<<YOU>>@footbag.org'
PASSWORD = None # '<<YOUR PASSWORD>>'

MIRROR_DIR = "./mirror_footbag_org"
BASE_URL = 'http://www.footbag.org'

START_URLS = [
    BASE_URL + '/members/home/',
    BASE_URL + '/',
    BASE_URL + '/events/show/1741024635', # See a recent event in the queue
]

DELAY_SECONDS = 0.25 # Polite delay between requests to live site.
MAX_RETRIES = 1  # Retry only once after failure
TRANSIENT_RETRY_CODES = {500, 502, 503, 504} # as opposed to permanent failures 
SITEMAP_FILE = 'sitemap.txt'
LOG_FILE = 'mirror.log'
LOG_TO_FILE = False  # default off; set True if you want mirror.log
PROGRESS_FILE = 'mirror_progress.json'
ROBOTS_CACHE_FILE = 'robots_cache.json'

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
SKIP_EXTENSIONS = ['.zip', '.tar.gz', '.exe', '.dmg' ,'.asx' ,'.php', '.sh', '.xml']
RESUME_ON_RESTART = True
RESPECT_ROBOTS_TXT = True
USER_AGENT = 'FootbagMirror/1.0 (Archival/Backup Purpose)'
SESSION_TIMEOUT = 360000  # 1 hour
DUPLICATE_DETECTION = True

MEDIA_FORMATS = {
    '.mp4':  ('video/mp4', False),
    '.mov':  ('video/quicktime', True),
    '.avi':  ('video/x-msvideo', True),
    '.mkv':  ('video/x-matroska', True),
    '.webm': ('video/webm', False),
    '.wmv':  ('video/x-ms-wmv', True),
    '.divx': ('video/x-msvideo', True),
    '.mpg':  ('video/mpeg', True),
    '.mpeg': ('video/mpeg', True),
    '.flv':  ('video/x-flv', True),
    '.m4v':  ('video/mp4', True), 
    '.mp3':  ('audio/mpeg', False),
    '.ogg':  ('audio/ogg', True),
    '.wav':  ('audio/wav', True),
    '.aac':  ('audio/aac', True),
    '.m4a':  ('audio/mp4', True),
    '.jpg':  ('image/jpeg', False),
    '.jpeg': ('image/jpeg', False),
    '.png':  ('image/png', False),
    '.gif':  ('image/gif', False),
    '.bmp':  ('image/bmp', True),
    '.tiff': ('image/tiff', True),
    '.tif':  ('image/tiff', True),
    '.webp': ('image/webp', True),
    '.svg':  ('image/svg+xml', True),  
} 

VIDEO_EXTENSIONS = {ext for ext, (mime, _) in MEDIA_FORMATS.items() if mime.startswith('video/')}
AUDIO_EXTENSIONS = {ext for ext, (mime, _) in MEDIA_FORMATS.items() if mime.startswith('audio/')}
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

class MirrorState:
    def __init__(self):
        self.visited = set()
        self.failed_urls = set()  
        self.failed_conversion_videos = set()  
        self.sitemap = []
        self.queue = []
        self.url_depth = {}
        self.content_hashes = {}
        self.stats = {}
        self.regsummary_map = {}
        self.stats.setdefault('media_input_bytes', 0)
        self.stats.setdefault('media_output_bytes', 0)
        self.stats.setdefault('mp3_downloads', 0)  
        self.stats['total_urls'] = 0
        self.stats['successful_downloads'] = 0
        self.stats['failed_downloads'] = 0
        self.stats['bytes_downloaded'] = 0
        self.stats['skipped_too_large'] = 0
        self.stats['regsummary_links_detected'] = 0
        self.stats['video_conversions'] = 0
        self.stats['image_conversions'] = 0
        self.session_start = time.time()
        self.duplicate_redirects = {}  

    def save_progress(self):
        """Save progress atomically to prevent corruption on interruption."""
        progress_data = {
            'visited': list(self.visited),
            'failed_urls': list(self.failed_urls),
            'failed_conversion_videos': list(self.failed_conversion_videos),
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
            self.sitemap = data.get('sitemap', [])
            self.queue = data.get('queue', [])
            self.url_depth = data.get('url_depth', {})
            self.content_hashes = data.get('content_hashes', {})
            self.stats = data.get('stats', self.stats)
            self.regsummary_map = data.get('regsummary_map', {})
            # Ensure all stats keys exist (for backwards compatibility with old progress files)
            self.stats.setdefault('media_input_bytes', 0)
            self.stats.setdefault('media_output_bytes', 0)
            self.stats.setdefault('mp3_downloads', 0)
            self.stats.setdefault('total_urls', 0)
            self.stats.setdefault('successful_downloads', 0)
            self.stats.setdefault('failed_downloads', 0)
            self.stats.setdefault('bytes_downloaded', 0)
            self.stats.setdefault('skipped_too_large', 0)
            self.stats.setdefault('regsummary_links_detected', 0)
            self.stats.setdefault('video_conversions', 0)
            self.stats.setdefault('image_conversions', 0)
            logging.info(f"Progress loaded from {PROGRESS_FILE}")
            logging.info(f"Resuming with {len(self.visited)} visited URLs, {len(self.queue)} queued")
            return True
        except (json.JSONDecodeError, KeyError) as e:
            logging.error(f"Failed to load progress: {e}")
            return False

class RobotChecker:
    def __init__(self):
        self.robots_cache = {}
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
    
    def can_fetch(self, url):
        if not RESPECT_ROBOTS_TXT:
            return True
        
        parsed = urlparse(url)
        domain = parsed.netloc
        if domain not in self.robots_cache:
            self.robots_cache[domain] = self._fetch_robots(domain)
            self.save_cache()
        
        robots_data = self.robots_cache[domain]
        if not robots_data:
            return True
        
        # Simple robots.txt parsing - in production, use robotparser
        disallowed = robots_data.get('disallow', [])
        for pattern in disallowed:
            if parsed.path.startswith(pattern):
                return False
        return True
    
    def _fetch_robots(self, domain):
        robots_url = f"https://{domain}/robots.txt"
        try:
            response = requests.get(robots_url, timeout=10)
            if response.status_code == 200:
                lines = response.text.split('\n')
                disallow = []
                for line in lines:
                    line = line.strip()
                    if line.startswith('Disallow:'):
                        path = line.split(':', 1)[1].strip()
                        if path:
                            disallow.append(path)
                return {'disallow': disallow}
        except requests.RequestException:
            pass
        return None

# Global instances
session = requests.Session()
session.headers.update({'User-Agent': USER_AGENT})
mirror_state = MirrorState()
robot_checker = RobotChecker()

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
        robot_checker.save_cache()
        logging.info("Robot cache saved successfully")
    except Exception as e:
        logging.error(f"Failed to save robot cache during shutdown: {e}")
    
    logging.info("Shutdown complete")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def is_footbag_domain(url):
    parsed = urlparse(url)
    return parsed.netloc.endswith('footbag.org')

def get_extension(url_or_path):
    return Path(urlparse(url_or_path).path.lower()).suffix

def is_media_file(url_or_path):
    return get_extension(url_or_path) in MEDIA_FORMATS

def is_video_file(url_or_path):
    ext = get_extension(url_or_path)
    return ext in VIDEO_EXTENSIONS

def is_audio_file(url_or_path):
    ext = get_extension(url_or_path)
    return ext in AUDIO_EXTENSIONS

def is_convertible_video(url_or_path):
    ext = get_extension(url_or_path)
    return ext in CONVERTIBLE_EXTENSIONS

def get_media_mime_type(filepath):
    ext = Path(filepath).suffix.lower()
    return MEDIA_FORMATS.get(ext, (mimetypes.guess_type(filepath)[0], False))[0] or 'application/octet-stream'

def is_image_file(url_or_path):
    ext = Path(urlparse(url_or_path).path).suffix.lower()
    return ext in mimetypes.types_map and mimetypes.types_map[ext].startswith("image/")

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

def normalize_url(url):
    # Normalize a URL by:
    #  - stripping UI-only query parameters like 'mode' and 'really' and cachebuster
    #  - stripping fragments (#...)
    #  - normalizing gallery/show/-ID to gallery/show/ID
    #  - preserving trailing slash only if present in original
    p = urlparse(url)

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
            if k.lower() not in ('mode', 'really', 'cachebuster', 'cachebust')
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
        if k.lower() not in ('mode', 'really', 'cachebuster', 'cachebust')
    }

    new_query = urlencode(stripped_query, doseq=True)
    p = p._replace(query=new_query, fragment='')

    # === BEGIN: FAQ/Facts canonicalization ===
    _pre_faq_url = urlunparse(p) 
    path_l = p.path.lower()
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
    if p.path.rstrip('/').lower() == '/faq/show':
        qs = {k.lower(): v for k, v in parse_qs(p.query).items()}
        art = (qs.get('id') or [None])[0]
        if art:
            p = p._replace(path=f"/faq/show/{art}", query='')
        else:
            p = p._replace(path='/faq/', query='')
    # (c) /faq/list: keep ONLY sid (if present); drop UI-only junk
    if p.path.rstrip('/').lower() == '/faq/list':
        qs = {k.lower(): v for k, v in parse_qs(p.query).items()}
        sid = (qs.get('sid') or [None])[0]
        p = p._replace(query=('sid=' + sid) if sid else '')
    _post_faq_url = urlunparse(p)
    if _post_faq_url != _pre_faq_url:
        logging.info(f"Normalized FAQ URL: '{_pre_faq_url}' → '{_post_faq_url}'")
    # === END: FAQ/Facts canonicalization ===

    normalized = urlunparse(p).rstrip('/')

    # Normalize gallery/show/-ID → gallery/show/ID
    match = re.match(r'^https?://[^/]+/gallery/show/-?(\d+)$', normalized)
    if match:
        id_str = match.group(1)
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
    with open(from_path, 'w', encoding='utf-8') as f:
        f.write(html)
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
    with open(from_path, 'w', encoding='utf-8') as f:
        f.write(html)
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
    with open(from_path, 'w', encoding='utf-8') as f:
        f.write(html)
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

def convert_to_mp4(input_filepath):
    # Converts a video file (mov, wmv, avi, divx) to mp4 using ffmpeg.
    # Returns the path to the converted file or None if conversion fails.
    input_path = Path(input_filepath)
    ext = input_path.suffix.lower()

    if ext not in CONVERTIBLE_EXTENSIONS:
        logging.error(f"No conversion rule for: {input_filepath}")
        return input_filepath  # Return original

    output_filepath = str(input_path.with_suffix('.mp4'))

    if os.path.exists(output_filepath):
        logging.info(f"Already converted: {output_filepath}")
        return output_filepath

    # First attempt: Fast, high-quality settings for newer videos
    try:
        logging.info(f"Converting {input_filepath} to .mp4 ...")
        subprocess.run([
            'ffmpeg', '-i', str(input_filepath),
            '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'faststart',
            '-y',  # overwrite if needed
            output_filepath
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        mirror_state.stats['video_conversions'] += 1
        return output_filepath
        
    except subprocess.CalledProcessError as e:
        if os.path.exists(output_filepath):
            try:
                os.remove(output_filepath)
            except:
                pass
    
    # Second attempt: Conservative settings for extremely old/corrupt videos
    try:
        logging.info(f"Trying conservative conversion for {input_filepath}")
        result = subprocess.run([
            'ffmpeg', '-i', str(input_filepath),
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
            '-c:a', 'aac', '-b:a', '96k', '-ar', '44100',
            '-movflags', 'faststart',
            '-max_muxing_queue_size', '2048',
            '-pix_fmt', 'yuv420p',
            '-avoid_negative_ts', 'make_zero',  # Handle timestamp issues
            '-fflags', '+genpts',  # Generate presentation timestamps
            '-r', '25',  # Force frame rate for problematic videos
            '-y',  # overwrite if needed
            output_filepath
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        mirror_state.stats['video_conversions'] += 1
        logging.info(f"Successfully converted : {output_filepath}")
        return output_filepath
        
    except subprocess.CalledProcessError as e:
        logging.warning(f"All conversion attempts failed for {input_filepath}.")
        return None

def convert_image_to_jpg(filepath):
    try:
        output_path = str(Path(filepath).with_suffix('.jpg'))
        if os.path.exists(output_path):
            logging.info(f"JPEG already exists: {output_path}")
            return output_path

        logging.info(f"Converting image to JPG: {filepath} → {output_path}")
        with Image.open(filepath) as img:
            rgb_img = img.convert('RGB')
            rgb_img.save(output_path, 'JPEG', quality=85)

        mirror_state.stats['image_conversions'] += 1
        return output_path
    except Exception as e:
        logging.error(f"Failed to convert image to JPG: {filepath} → {e}")
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

def download_and_process_media(url, session):
    # Download media file and convert formats (video/audio/image) as needed.
    # Returns the final usable filepath (converted or original), or None if unavailable.
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

        is_image = is_image_file(url)
        is_audio = is_audio_file(url)
        is_convertible = ext in CONVERTIBLE_EXTENSIONS

        if not filepath:
            logging.error(f"Could not determine filepath for media: {url}")
            return None

        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        if is_convertible:
            if ext in VIDEO_EXTENSIONS:
                target_path = str(Path(filepath).with_suffix('.mp4'))
            elif ext in AUDIO_EXTENSIONS:
                target_path = str(Path(filepath).with_suffix('.mp3'))
            elif ext in IMAGE_EXTENSIONS:
                target_path = str(Path(filepath).with_suffix('.jpg'))
            else:
                target_path = None

            if target_path and os.path.exists(target_path):
                logging.debug(f"Converted file already exists, skipping: {target_path}")
                return target_path

        # If source file already exists, attempt conversion/cleanup in place
        if os.path.exists(filepath):
            result = convert_and_cleanup(filepath, ext) if is_convertible else filepath
            if result is None and ext in VIDEO_EXTENSIONS:
                key = media_fail_key(url)
                mirror_state.failed_urls.add(key)
                mirror_state.failed_conversion_videos.add(key)
                logging.info(f"Recorded failed-conversion video URL: {key}")
            return result

        try:
            response = session.get(url, stream=True, timeout=15)
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

        if ext == '.mp3':
            mirror_state.stats['mp3_downloads'] += 1
            logging.info(f"Audio file : {filepath}")

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

def url_to_filepath(url):
    url = normalize_url(url)
    parsed = urlparse(url)
    query_parts = {k.lower(): v for k, v in parse_qs(parsed.query).items()}

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
        if club_id and club_id.isdigit():
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
        # Handle general URLs
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
    try:
        absolute_popup = normalize_url(urljoin(BASE_URL, popup_url))
        logging.debug(f"Resolving actual media from popup: {absolute_popup}")
        resp = session.get(absolute_popup, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        for link in soup.find_all('a', href=True):
            href = link['href'].strip()
            parsed_href = urlparse(href)
            path = parsed_href.path.lower()

            if is_media_file(href):
                resolved = normalize_url(urljoin(BASE_URL, href))
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

        # Embedded <video>/<source> tags
        for tag in soup.find_all(['video', 'source']):
            src = tag.get('src')
            if src:
                abs_url = urljoin(page_url, src)
                embedded_video_refs.add(normalize_url(abs_url))

                if is_media_file(abs_url):
                    clean_url = strip_query(abs_url)
                    processed_path = download_and_process_media(clean_url, session)
                    if processed_path:
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
                    processed_path = download_and_process_media(clean_url, session)
                    if processed_path:
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

                        processed_filepath = download_and_process_media(resolved_video_url, session)

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

                                if is_media_file(full_url):
                                    clean_url = strip_query(full_url)
                                    processed_filepath = download_and_process_media(clean_url, session)
                                    if processed_filepath:
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

                    if is_footbag_domain(full_url) and is_media_file(full_url):
                        clean_url = strip_query(full_url)
                        try:
                            processed_filepath = download_and_process_media(clean_url, session)
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
                    if parsed.path == '/news/list' and 'Year=' in parsed.query:
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

                    if parsed.path == '/clubs/list' and 'Country=' in parsed.query:
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

                    if parsed.path == '/clubs/showmembers' and 'ClubID=' in parsed.query:
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

                    if parsed.path == '/events/past':
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

                    if parsed.path == '/events/results':
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
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html)

            mirror_state.stats['successful_downloads'] += 1
            mirror_state.sitemap.append(filepath)

            logging.info(f"Created local redirect: {filepath} → {rel_path}")
            return

        # Skip saving if duplicate hash
        content_hash = hashlib.sha256(content if isinstance(content, bytes) else content.encode()).hexdigest()
        if content_hash in mirror_state.content_hashes:
            existing_path = mirror_state.content_hashes[content_hash]
            logging.debug(f"Duplicate content detected: {url} → already saved at: {existing_path}")
            return

        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        if is_html:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        else:
            with open(filepath, 'wb') as f:
                f.write(content)

        mirror_state.content_hashes[content_hash] = filepath
        mirror_state.stats['bytes_downloaded'] += len(content if isinstance(content, bytes) else content.encode())
        mirror_state.stats['successful_downloads'] += 1
        mirror_state.sitemap.append(filepath)
        logging.info(f"Saved: {filepath}")

    except Exception as e:
        logging.error(f" Failed to save {url}: {e}")
        mirror_state.stats['failed_downloads'] += 1

def is_in_scope(url):
    if not is_footbag_domain(url):
        return False
    if not url.startswith(BASE_URL):
        return False
    parsed = urlparse(url)
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
    print(f"Image conversions: {s.get('image_conversions', 0):,}")
    print(f"Audio files: {s.get('mp3_downloads', 0):,}")
    if s.get('skipped_too_large', 0) > 0:
        print(f"Skipped too large: {s.get('skipped_too_large', 0):,}")
    print(f"Regsummaries added: {s.get('regsummary_links_detected', 0):,}")
    print("========================\n")

def save_redirect_map():
    # Save all known redirect mappings from original URL to final URL
    redirect_path = os.path.join(MIRROR_DIR, 'redirect_map.json')
    with open(redirect_path, 'w', encoding='utf-8') as f:
        json.dump(mirror_state.duplicate_redirects, f, indent=2)
    logging.info(f"Saved redirect map to {redirect_path}")

def save_sitemap():
    sitemap_path = os.path.join(MIRROR_DIR, SITEMAP_FILE)
    
    with open(sitemap_path, 'w') as f:
        f.write(f"# Footbag.org Mirror Sitemap\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write(f"# Total files: {len(mirror_state.sitemap)}\n")
        f.write(f"# Mirror statistics:\n")
        for key, value in mirror_state.stats.items():
            f.write(f"#   {key}: {value}\n")
        f.write("\n")

        for path in sorted(mirror_state.sitemap):
            f.write(path + '\n')
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
    with open(root_index_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    logging.info(f"Created root index.html at {root_index_path}")

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
            if is_events_show_url(original_url):
                # Event show/results pages: fetch as unauthenticated visitor (no session cookies).
                resp = requests.get(original_url, headers={'User-Agent': USER_AGENT}, timeout=30, stream=True, allow_redirects=True)
            else:
                resp = session.get(original_url, timeout=30, stream=True, allow_redirects=True)
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

            # Check size limit
            content = resp.content
            if len(content) > MAX_FILE_SIZE:
                mirror_state.stats['skipped_too_large'] += 1
                logging.warning(f"Content too large ({len(content)} bytes), skipping: {original_url}")
                return None, None

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
                    processed_url = normalize_url(final_url)

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
                processed_url = normalize_url(media_url)

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

def crawl(start_urls):
    if not mirror_state.queue:
        for url in start_urls:
            norm_url = normalize_url(url)
            mirror_state.queue.append(norm_url)
            mirror_state.url_depth[norm_url] = 0

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
                    with open(redirect_source_path, 'w', encoding='utf-8') as f:
                        f.write(html)
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

        # Special handlers for known endpoint types preserved:
        if (
            is_html and
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
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(rewritten_html)
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
            is_html and parsed.path == '/news/list' and 'Year=' in parsed.query
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
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(rewritten_html)
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
            original_url.rstrip('/').endswith('/events/past') and
            'year=' not in original_url
        ):
            try:
                current_year = str(datetime.now().year)
                filepath = os.path.join(MIRROR_DIR, 'www.footbag.org', 'events', f'past_year_{current_year}', 'index.html')
                rewritten_html = inject_as_of_note(rewrite_links(resp.text, final_url))
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(rewritten_html)
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
            original_url.rstrip('/').endswith('/events/results') and
            'year=' not in original_url
        ):
            try:
                current_year = str(datetime.now().year)
                filepath = os.path.join(MIRROR_DIR, 'www.footbag.org', 'events', f'results_year_{current_year}', 'index.html')
                rewritten_html = inject_as_of_note(rewrite_links(resp.text, final_url))
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(rewritten_html)
                mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                mirror_state.sitemap.append(filepath)
                mirror_state.stats['successful_downloads'] += 1
                mirror_state.visited.add(visited_key)
                logging.info(f"Saved current-year results to: {filepath}")
                create_events_results_redirector()
            except Exception as e:
                logging.error(f"Error handling /events/results page: {e}")
            continue

        if is_html and parsed_final.path == '/registration/register' and 'tid=' in parsed_final.query:
            try:
                tid = parse_qs(parsed_final.query).get('tid', [None])[0]
                if tid and tid.isdigit():
                    filepath = os.path.join(\
                        MIRROR_DIR, 'www.footbag.org', 'registration', 'register', tid, 'index.html'
                    )
                    rewritten_html = rewrite_links(resp.text, final_url)
                    os.makedirs(os.path.dirname(filepath), exist_ok=True)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(rewritten_html)
                    mirror_state.stats['bytes_downloaded'] += len(resp.content)  
                    mirror_state.sitemap.append(filepath)
                    mirror_state.stats['successful_downloads'] += 1
                    mirror_state.visited.add(visited_key)
                    logging.info(f"Saved registration page for tid={tid} to: {filepath}")
                    continue
            except Exception as e:
                logging.error(f"Error handling /registration/register?tid=...: {e}")
                continue

        if is_html and parsed_final.path == '/registration/regsummary' and 'tid=' in parsed_final.query:
            try:
                tid = parse_qs(parsed_final.query).get('tid', [None])[0]
                if tid and tid.isdigit():
                    filepath = os.path.join(
                        MIRROR_DIR, 'www.footbag.org', 'registration', 'regsummary', tid, 'index.html'
                    )
                    rewritten_html = rewrite_links(resp.text, final_url)
                    os.makedirs(os.path.dirname(filepath), exist_ok=True)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(rewritten_html)
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
                        reg_resp = session.get(regsummary_url, allow_redirects=True, timeout=15)
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
                    if norm_link not in mirror_state.visited and norm_link not in mirror_state.queue:
                        mirror_state.queue.append(norm_link)
                        mirror_state.url_depth[norm_link] = current_depth + 1
            except Exception as e:
                logging.error(f"Error processing HTML {final_url}: {e}")
        else:
            if is_media_file(final_url):
                processed_filepath = download_and_process_media(final_url, session)
                if not processed_filepath:
                    logging.error(f"Failed to process media file: {final_url}")
            else:
                save_content(final_url, resp.content, is_html=False)

        if mirror_state.stats['total_urls'] % 50 == 0:
            mirror_state.save_progress()
            print_stats()

def main():
    global USERNAME, PASSWORD, LOG_TO_FILE

    args = parse_args()
    LOG_TO_FILE = args.log_to_file   # if your parser uses dest="log", change this to: args.log
    USERNAME = args.username
    PASSWORD = args.password

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

        crawl(START_URLS)
        create_root_index()
        save_sitemap()
        save_redirect_map()
        mirror_state.save_progress()
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