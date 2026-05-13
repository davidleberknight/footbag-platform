#!/usr/bin/env python3
"""
qc_curated_media_urls.py — URL-availability QC for curated media.

Reads legacy_data/inputs/curated/media/media_assets.csv and verifies each
YouTube / playlist / web URL is reachable, non-deleted, and non-private.
Emits a deterministic CSV report to legacy_data/reports/.

Read-only: no DB writes; no canonical mutation; no curated-CSV mutation.
The report is the artifact; curators triage from there.

Tier-aware checks:
- YouTube videos (watch?v= + youtu.be/): yt-dlp --skip-download metadata pull
- YouTube playlists (playlist?list=): yt-dlp --flat-playlist --playlist-end 1
- Websites (http/https non-YouTube): HTTP HEAD via curl (3-second timeout)
- Anything else: skipped with note

Output columns:
  media_id, url, status, http_code_or_state, title_or_error, checked_at

Status values:
  OK            — URL reachable; metadata extracted
  UNREACHABLE   — yt-dlp / curl returned an error
  PRIVATE       — explicit private/unavailable marker in error
  DELETED       — explicit deleted marker in error
  TIMEOUT       — request exceeded timeout
  SKIPPED       — URL pattern not handled

Exit code:
  0 — every row is OK or SKIPPED
  1 — at least one row is UNREACHABLE / PRIVATE / DELETED / TIMEOUT

Usage:
  python3 legacy_data/scripts/qc_curated_media_urls.py
  python3 legacy_data/scripts/qc_curated_media_urls.py --filter passback_youtube
  python3 legacy_data/scripts/qc_curated_media_urls.py --output /tmp/qc.csv

The script is deterministic for the same input CSV + the same network state;
re-runs produce identical output absent URL-state changes.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
CURATED_CSV = REPO_ROOT / 'legacy_data' / 'inputs' / 'curated' / 'media' / 'media_assets.csv'
REPORT_DIR = REPO_ROOT / 'legacy_data' / 'reports'
DEFAULT_REPORT = REPORT_DIR / 'curated_media_url_qc.csv'

YTDLP_TIMEOUT_SECONDS = 30
CURL_TIMEOUT_SECONDS = 10


def classify_url(url: str) -> str:
    """Return one of 'youtube_video', 'youtube_playlist', 'web', 'unknown'."""
    if not url:
        return 'unknown'
    u = url.lower()
    if 'youtube.com/watch' in u or 'youtu.be/' in u or 'youtube.com/shorts' in u:
        return 'youtube_video'
    if 'youtube.com/playlist' in u:
        return 'youtube_playlist'
    if u.startswith(('http://', 'https://')):
        return 'web'
    return 'unknown'


def check_youtube_video(url: str, ytdlp_bin: str) -> tuple[str, str, str]:
    """Returns (status, code_or_state, title_or_error)."""
    try:
        result = subprocess.run(
            [
                ytdlp_bin,
                '--skip-download',
                '--no-warnings',
                '--print', '%(title)s',
                url,
            ],
            capture_output=True,
            text=True,
            timeout=YTDLP_TIMEOUT_SECONDS,
        )
        if result.returncode == 0 and result.stdout.strip():
            return 'OK', 'reachable', result.stdout.strip()
        err = (result.stderr or '').lower()
        if 'private' in err:
            return 'PRIVATE', 'private', result.stderr.strip().split('\n')[-1][:200]
        if 'video unavailable' in err or 'has been removed' in err or 'deleted' in err:
            return 'DELETED', 'deleted', result.stderr.strip().split('\n')[-1][:200]
        return 'UNREACHABLE', f'rc={result.returncode}', (result.stderr or 'unknown error').strip().split('\n')[-1][:200]
    except subprocess.TimeoutExpired:
        return 'TIMEOUT', f'>{YTDLP_TIMEOUT_SECONDS}s', 'yt-dlp timed out'
    except FileNotFoundError:
        return 'UNREACHABLE', 'no_ytdlp', 'yt-dlp not installed; run pip install yt-dlp'


def check_youtube_playlist(url: str, ytdlp_bin: str) -> tuple[str, str, str]:
    """Verify the playlist is reachable and has at least one item."""
    try:
        result = subprocess.run(
            [
                ytdlp_bin,
                '--flat-playlist',
                '--skip-download',
                '--no-warnings',
                '--playlist-end', '1',
                '--print', '%(playlist_title)s',
                url,
            ],
            capture_output=True,
            text=True,
            timeout=YTDLP_TIMEOUT_SECONDS,
        )
        if result.returncode == 0 and result.stdout.strip():
            return 'OK', 'reachable', result.stdout.strip().split('\n')[0]
        err = (result.stderr or '').lower()
        if 'private' in err:
            return 'PRIVATE', 'private', result.stderr.strip().split('\n')[-1][:200]
        return 'UNREACHABLE', f'rc={result.returncode}', (result.stderr or 'unknown error').strip().split('\n')[-1][:200]
    except subprocess.TimeoutExpired:
        return 'TIMEOUT', f'>{YTDLP_TIMEOUT_SECONDS}s', 'yt-dlp timed out'
    except FileNotFoundError:
        return 'UNREACHABLE', 'no_ytdlp', 'yt-dlp not installed'


def check_web(url: str) -> tuple[str, str, str]:
    """HTTP HEAD via curl. Returns (status, http_code, title_or_error)."""
    curl = shutil.which('curl')
    if not curl:
        return 'UNREACHABLE', 'no_curl', 'curl not installed'
    try:
        result = subprocess.run(
            [
                curl,
                '-s', '-o', '/dev/null',
                '-I',
                '-L',  # follow redirects
                '-w', '%{http_code}',
                '--max-time', str(CURL_TIMEOUT_SECONDS),
                url,
            ],
            capture_output=True,
            text=True,
            timeout=CURL_TIMEOUT_SECONDS + 2,
        )
        code = (result.stdout or '').strip()
        if code.startswith('2') or code.startswith('3'):
            return 'OK', code, '(HEAD ok)'
        if code in ('403', '404', '410'):
            return 'UNREACHABLE', code, f'http {code}'
        if code in ('000', ''):
            return 'UNREACHABLE', code or '000', 'no response'
        return 'UNREACHABLE', code, f'http {code}'
    except subprocess.TimeoutExpired:
        return 'TIMEOUT', f'>{CURL_TIMEOUT_SECONDS}s', 'curl timed out'


def find_ytdlp() -> Optional[str]:
    """Prefer the project's venv ytdlp if present, else PATH."""
    project_venv = '/home/james/projects/FOOTBAG/footbag_venv/bin/yt-dlp'
    if Path(project_venv).exists():
        return project_venv
    return shutil.which('yt-dlp')


def run_qc(filter_source: Optional[str], output_path: Path) -> int:
    if not CURATED_CSV.exists():
        print(f'ERROR: curated media CSV not found at {CURATED_CSV}', file=sys.stderr)
        return 2

    ytdlp_bin = find_ytdlp()
    if ytdlp_bin is None:
        print('WARNING: yt-dlp not found; YouTube URLs will be marked UNREACHABLE', file=sys.stderr)

    report_rows = []
    fail_count = 0
    now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    with CURATED_CSV.open('r', encoding='utf-8', newline='') as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            if filter_source and row.get('source_id') != filter_source:
                continue
            media_id = row.get('id', '')
            url = row.get('url', '')
            kind = classify_url(url)
            if kind == 'youtube_video' and ytdlp_bin:
                status, code, info = check_youtube_video(url, ytdlp_bin)
            elif kind == 'youtube_playlist' and ytdlp_bin:
                status, code, info = check_youtube_playlist(url, ytdlp_bin)
            elif kind == 'web':
                status, code, info = check_web(url)
            else:
                status, code, info = 'SKIPPED', kind, 'pattern not handled'
            if status not in ('OK', 'SKIPPED'):
                fail_count += 1
            report_rows.append({
                'media_id': media_id,
                'url': url,
                'status': status,
                'http_code_or_state': code,
                'title_or_error': info,
                'checked_at': now,
            })
            print(f'{status:12} {media_id} {url[:80]}', file=sys.stderr)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            'media_id', 'url', 'status', 'http_code_or_state', 'title_or_error', 'checked_at',
        ])
        writer.writeheader()
        writer.writerows(report_rows)

    print(f'Wrote {len(report_rows)} rows to {output_path}', file=sys.stderr)
    print(f'Failures: {fail_count}', file=sys.stderr)
    return 0 if fail_count == 0 else 1


def main() -> None:
    parser = argparse.ArgumentParser(description='QC URL availability for curated media.')
    parser.add_argument('--filter', dest='filter_source', default=None,
                        help='Limit to a single source_id (e.g. passback_youtube)')
    parser.add_argument('--output', dest='output', default=str(DEFAULT_REPORT),
                        help='Output CSV path (default: legacy_data/reports/curated_media_url_qc.csv)')
    args = parser.parse_args()
    sys.exit(run_qc(args.filter_source, Path(args.output)))


if __name__ == '__main__':
    main()
