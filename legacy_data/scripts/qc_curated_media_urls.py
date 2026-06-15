#!/usr/bin/env python3
"""
qc_curated_media_urls.py — URL-availability QC for curated media sidecars.

Scans every curated media sidecar (curated/**/*.meta.json) and verifies each
video URL is reachable, non-deleted, and non-private. Emits a deterministic CSV
report to legacy_data/reports/.

Read-only: no DB writes; no canonical mutation; no curated mutation. The report
is the artifact; curators triage from there.

Checks:
- YouTube videos (watch?v= / youtu.be/ / shorts/): yt-dlp metadata pull when
  yt-dlp is installed; otherwise the YouTube oEmbed endpoint via curl
  (200 = live, 401/403 = embedding disabled or private, 404 = deleted).
- YouTube playlists: yt-dlp flat-playlist probe (skipped without yt-dlp).
- Websites (non-YouTube http/https): HTTP HEAD via curl.
- Anything else: skipped.

Rate-limit handling: a configurable inter-request delay plus retry-with-backoff
on transient failures (UNREACHABLE / TIMEOUT) only, so a throttled request does
not mark a live video dead. An earlier oEmbed-only sweep without backoff
produced inconsistent dead-sets between runs; this is the durable replacement.

Output columns:
  sidecar, url, source_id, status, http_code_or_state, title_or_error, checked_at

Status values:
  OK            — URL reachable; metadata extracted
  UNREACHABLE   — yt-dlp / curl returned an error (after retries)
  PRIVATE       — explicit private / embedding-disabled marker
  DELETED       — explicit deleted / 404 marker
  TIMEOUT       — request exceeded timeout (after retries)
  SKIPPED       — URL pattern not handled, or sidecar carries no URL

Exit code:
  0 — every checked row is OK or SKIPPED
  1 — at least one row is UNREACHABLE / PRIVATE / DELETED / TIMEOUT

Usage:
  python3 legacy_data/scripts/qc_curated_media_urls.py
  python3 legacy_data/scripts/qc_curated_media_urls.py --filter passback_basics
  python3 legacy_data/scripts/qc_curated_media_urls.py --delay 1.5 --retries 3
  python3 legacy_data/scripts/qc_curated_media_urls.py --output /tmp/qc.csv

Deterministic for the same sidecar set + the same network state absent URL-state
changes; sidecars are walked in sorted path order so the report is stable.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterator, Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
SIDECAR_ROOT = REPO_ROOT / 'curated'
REPORT_DIR = REPO_ROOT / 'legacy_data' / 'reports'
DEFAULT_REPORT = REPORT_DIR / 'curated_media_url_qc.csv'

YTDLP_TIMEOUT_SECONDS = 30
CURL_TIMEOUT_SECONDS = 10

# Statuses that are definitive: retrying them wastes requests and cannot change
# the verdict. Only UNREACHABLE / TIMEOUT (transient / throttle) are retried.
DEFINITIVE = {'OK', 'PRIVATE', 'DELETED', 'SKIPPED'}


def classify_url(url: str) -> str:
    """Return one of 'youtube_video', 'youtube_playlist', 'web', 'unknown'."""
    if not url:
        return 'unknown'
    u = url.lower()
    if 'youtube.com/playlist' in u:
        return 'youtube_playlist'
    if 'youtube.com/watch' in u or 'youtu.be/' in u or 'youtube.com/shorts' in u:
        return 'youtube_video'
    if u.startswith(('http://', 'https://')):
        return 'web'
    return 'unknown'


def check_youtube_oembed(url: str) -> tuple[str, str, str]:
    """YouTube liveness via the public oEmbed endpoint (no yt-dlp needed)."""
    curl = shutil.which('curl')
    if not curl:
        return 'UNREACHABLE', 'no_curl', 'curl not installed'
    oembed = f'https://www.youtube.com/oembed?url={url}&format=json'
    try:
        result = subprocess.run(
            [curl, '-s', '-m', str(CURL_TIMEOUT_SECONDS), '-o', '/dev/null',
             '-w', '%{http_code}', oembed],
            capture_output=True, text=True, timeout=CURL_TIMEOUT_SECONDS + 2,
        )
        code = (result.stdout or '').strip()
        if code == '200':
            return 'OK', code, '(oembed ok)'
        if code in ('401', '403'):
            return 'PRIVATE', code, 'private or embedding disabled'
        if code in ('400', '404'):
            return 'DELETED', code, f'oembed {code}'
        if code in ('000', ''):
            return 'UNREACHABLE', '000', 'no response'
        return 'UNREACHABLE', code, f'oembed {code}'  # 429 etc. -> retried
    except subprocess.TimeoutExpired:
        return 'TIMEOUT', f'>{CURL_TIMEOUT_SECONDS}s', 'oembed timed out'


def check_youtube_video(url: str, ytdlp_bin: Optional[str]) -> tuple[str, str, str]:
    """Prefer yt-dlp metadata; fall back to oEmbed when yt-dlp is absent."""
    if not ytdlp_bin:
        return check_youtube_oembed(url)
    try:
        result = subprocess.run(
            [ytdlp_bin, '--skip-download', '--no-warnings', '--print', '%(title)s', url],
            capture_output=True, text=True, timeout=YTDLP_TIMEOUT_SECONDS,
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
        return check_youtube_oembed(url)


def check_youtube_playlist(url: str, ytdlp_bin: Optional[str]) -> tuple[str, str, str]:
    """Verify the playlist is reachable and has at least one item."""
    if not ytdlp_bin:
        return 'SKIPPED', 'no_ytdlp', 'playlist check needs yt-dlp'
    try:
        result = subprocess.run(
            [ytdlp_bin, '--flat-playlist', '--skip-download', '--no-warnings',
             '--playlist-end', '1', '--print', '%(playlist_title)s', url],
            capture_output=True, text=True, timeout=YTDLP_TIMEOUT_SECONDS,
        )
        if result.returncode == 0 and result.stdout.strip():
            return 'OK', 'reachable', result.stdout.strip().split('\n')[0]
        err = (result.stderr or '').lower()
        if 'private' in err:
            return 'PRIVATE', 'private', result.stderr.strip().split('\n')[-1][:200]
        return 'UNREACHABLE', f'rc={result.returncode}', (result.stderr or 'unknown error').strip().split('\n')[-1][:200]
    except subprocess.TimeoutExpired:
        return 'TIMEOUT', f'>{YTDLP_TIMEOUT_SECONDS}s', 'yt-dlp timed out'


def check_web(url: str) -> tuple[str, str, str]:
    """HTTP HEAD via curl. Returns (status, http_code, title_or_error)."""
    curl = shutil.which('curl')
    if not curl:
        return 'UNREACHABLE', 'no_curl', 'curl not installed'
    try:
        result = subprocess.run(
            [curl, '-s', '-o', '/dev/null', '-I', '-L', '-w', '%{http_code}',
             '--max-time', str(CURL_TIMEOUT_SECONDS), url],
            capture_output=True, text=True, timeout=CURL_TIMEOUT_SECONDS + 2,
        )
        code = (result.stdout or '').strip()
        if code.startswith('2') or code.startswith('3'):
            return 'OK', code, '(HEAD ok)'
        if code in ('403', '404', '410'):
            return 'DELETED' if code in ('404', '410') else 'PRIVATE', code, f'http {code}'
        if code in ('000', ''):
            return 'UNREACHABLE', '000', 'no response'
        return 'UNREACHABLE', code, f'http {code}'
    except subprocess.TimeoutExpired:
        return 'TIMEOUT', f'>{CURL_TIMEOUT_SECONDS}s', 'curl timed out'


def check_once(kind: str, url: str, ytdlp_bin: Optional[str]) -> tuple[str, str, str]:
    if kind == 'youtube_video':
        return check_youtube_video(url, ytdlp_bin)
    if kind == 'youtube_playlist':
        return check_youtube_playlist(url, ytdlp_bin)
    if kind == 'web':
        return check_web(url)
    return 'SKIPPED', kind, 'pattern not handled'


def check_with_backoff(
    kind: str, url: str, ytdlp_bin: Optional[str], retries: int, delay: float,
) -> tuple[str, str, str]:
    """Retry transient (UNREACHABLE / TIMEOUT) results with exponential backoff;
    definitive verdicts return immediately."""
    status, code, info = check_once(kind, url, ytdlp_bin)
    attempt = 0
    while status not in DEFINITIVE and attempt < retries:
        time.sleep(delay * (2 ** attempt))
        attempt += 1
        status, code, info = check_once(kind, url, ytdlp_bin)
    return status, code, info


def find_ytdlp() -> Optional[str]:
    """Prefer the project's venv yt-dlp if present, else PATH."""
    project_venv = '/home/james/projects/FOOTBAG/footbag_venv/bin/yt-dlp'
    if Path(project_venv).exists():
        return project_venv
    return shutil.which('yt-dlp')


def gather_sidecar_urls(filter_source: Optional[str]) -> Iterator[tuple[str, str, str]]:
    """Yield (sidecar_relpath, url, source_id) for every curated media sidecar
    that carries a video URL, in sorted path order."""
    for path in sorted(SIDECAR_ROOT.glob('**/*.meta.json')):
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            continue
        url = data.get('videoUrl') or data.get('url') or ''
        if not url:
            continue
        source_id = data.get('sourceId') or ''
        if filter_source and source_id != filter_source:
            continue
        yield str(path.relative_to(SIDECAR_ROOT)), url, source_id


def run_qc(
    filter_source: Optional[str], output_path: Path, delay: float, retries: int,
    method: str, cooldown: float, cooldown_after: int,
) -> int:
    if not SIDECAR_ROOT.is_dir():
        print(f'ERROR: curated sidecar root not found at {SIDECAR_ROOT}', file=sys.stderr)
        return 2

    # YouTube throttles bulk yt-dlp extraction after ~100 rapid requests, which
    # turns a single-pass sweep into a wall of false UNREACHABLE. oEmbed is a
    # lighter request that tolerates a longer run; method='oembed' forces it.
    ytdlp_bin = find_ytdlp() if method != 'oembed' else None
    if method != 'oembed' and ytdlp_bin is None:
        print('NOTE: yt-dlp not found; YouTube checks use the oEmbed endpoint', file=sys.stderr)

    report_rows = []
    fail_count = 0
    consecutive_fail = 0
    now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    for sidecar, url, source_id in gather_sidecar_urls(filter_source):
        kind = classify_url(url)
        if kind == 'unknown':
            status, code, info = 'SKIPPED', kind, 'pattern not handled'
        else:
            status, code, info = check_with_backoff(kind, url, ytdlp_bin, retries, delay)
            # Throttle guard: a run of transient failures is almost always the
            # host rate-limiting us, not a cluster of genuinely-dead videos.
            # Cool down and re-check the current item so it is not falsely
            # recorded dead.
            if status in ('UNREACHABLE', 'TIMEOUT'):
                consecutive_fail += 1
                if cooldown > 0 and consecutive_fail >= cooldown_after:
                    print(f'... {consecutive_fail} consecutive failures; cooling down {cooldown:.0f}s', file=sys.stderr)
                    time.sleep(cooldown)
                    consecutive_fail = 0
                    status, code, info = check_with_backoff(kind, url, ytdlp_bin, retries, delay)
            else:
                consecutive_fail = 0
        if status not in ('OK', 'SKIPPED'):
            fail_count += 1
        report_rows.append({
            'sidecar': sidecar,
            'url': url,
            'source_id': source_id,
            'status': status,
            'http_code_or_state': code,
            'title_or_error': info,
            'checked_at': now,
        })
        print(f'{status:12} {sidecar} {url[:70]}', file=sys.stderr)
        if delay:
            time.sleep(delay)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            'sidecar', 'url', 'source_id', 'status', 'http_code_or_state',
            'title_or_error', 'checked_at',
        ])
        writer.writeheader()
        writer.writerows(report_rows)

    print(f'Wrote {len(report_rows)} rows to {output_path}', file=sys.stderr)
    print(f'Failures: {fail_count}', file=sys.stderr)
    return 0 if fail_count == 0 else 1


def main() -> None:
    parser = argparse.ArgumentParser(description='QC URL availability for curated media sidecars.')
    parser.add_argument('--filter', dest='filter_source', default=None,
                        help='Limit to a single sourceId (e.g. passback_basics)')
    parser.add_argument('--output', dest='output', default=str(DEFAULT_REPORT),
                        help='Output CSV path (default: legacy_data/reports/curated_media_url_qc.csv)')
    parser.add_argument('--delay', dest='delay', type=float, default=1.0,
                        help='Seconds to wait between requests (rate-limit guard; default 1.0)')
    parser.add_argument('--retries', dest='retries', type=int, default=2,
                        help='Retry count for transient failures, exponential backoff (default 2)')
    parser.add_argument('--method', dest='method', choices=('auto', 'oembed', 'ytdlp'), default='auto',
                        help="YouTube check method: 'oembed' (lighter, survives a full sweep), "
                             "'ytdlp' / 'auto' (richer per-request, throttles in bulk). Default auto.")
    parser.add_argument('--cooldown', dest='cooldown', type=float, default=0.0,
                        help='Seconds to pause after a run of failures (throttle recovery; 0 = off)')
    parser.add_argument('--cooldown-after', dest='cooldown_after', type=int, default=3,
                        help='Consecutive failures that trigger a cooldown (default 3)')
    args = parser.parse_args()
    sys.exit(run_qc(
        args.filter_source, Path(args.output), args.delay, args.retries,
        args.method, args.cooldown, args.cooldown_after,
    ))


if __name__ == '__main__':
    main()
