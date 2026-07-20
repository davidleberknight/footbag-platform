#!/usr/bin/env python3
"""Member-baseline inventory, crawl delta, and a privacy-redacted curation queue.

This tool is deterministic and READ-ONLY. It never mutates member records, never
merges identities, and never launches a crawl. It produces recommendations only.

Three jobs:

  1. baseline  -- inventory the captured member-profile pages in a chosen mirror
                  and write a machine-readable manifest (the frozen pre-crawl
                  baseline). The mirror root is an explicit argument: the small
                  in-repo mirror is a developer sample, NOT necessarily the full
                  historical baseline, so the operator must point this at the
                  real baseline corpus.

  2. delta     -- inventory the mirror again after a crawl and compute which
                  profiles are newly captured, changed, unchanged, or missing
                  versus the baseline manifest.

  3. queue     -- for the newly captured profiles, associate each with a dump
                  member id where confident, deduplicate against the existing
                  members and historical_persons in the platform DB, and emit a
                  privacy-redacted curation queue (recommendations only).

Privacy: the curation queue carries ONLY an identity-resolution allowlist of
fields. Email addresses, phone numbers, street addresses, and any credential or
authentication material are never extracted into any record, manifest, or queue.
The profile parser deliberately does not read those fields; the redaction step is
a second, enforced allowlist guard on top of that.

"Captured member profile" means a saved '.../members/profile/<id>/index.html'
page under the mirror tree. <id> is the path segment; a purely numeric id is the
dump member id.

Usage (read-only; from repo root):
    P=legacy_data/.venv/bin/python
    $P legacy_data/scripts/build_member_delta_queue.py baseline \
        --mirror-root legacy_data/mirror_footbag_org --out baseline.json
    $P legacy_data/scripts/build_member_delta_queue.py delta \
        --baseline baseline.json --mirror-root legacy_data/mirror_footbag_org \
        --out delta.json
    $P legacy_data/scripts/build_member_delta_queue.py queue \
        --delta delta.json --current current.json --db database/footbag.db \
        --out curation_queue.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup

# The only fields any queue row may carry. Anything outside this allowlist is
# dropped by redact_queue_row(); private contact fields are never on the list, so
# they cannot leak even if a future parser change started extracting them.
ALLOWED_QUEUE_FIELDS = frozenset({
    'dump_member_id', 'archived_url', 'source_host', 'captured_display_name',
    'normalized_name', 'existing_candidates', 'club_relationships',
    'city', 'country', 'event_relationships', 'honor_evidence',
    'archive_provenance', 'confidence', 'recommended_action', 'ambiguity_notes',
})

# Field/label substrings whose VALUES must never appear in any output. Used only
# as a defensive assertion; the parser already declines to read them.
FORBIDDEN_VALUE_KEYS = ('email', 'e-mail', 'phone', 'address', 'password',
                        'cookie', 'token', 'secret')


def normalize_name(s: str) -> str:
    """Deterministic name normalization: NFKC, casefold, collapse whitespace."""
    s = unicodedata.normalize('NFKC', s or '')
    return ' '.join(s.split()).strip().casefold()


# ── Profile discovery + parsing ──────────────────────────────────────────────

def discover_profile_files(mirror_root: str) -> list[tuple[str, Path]]:
    """Every captured member profile page under the mirror, as (member_id, path),
    sorted by member id. Matches '.../members/profile/<id>/index.html' anywhere in
    the tree (host-tree-prefix agnostic)."""
    root = Path(mirror_root)
    out: list[tuple[str, Path]] = []
    for p in root.rglob('members/profile/*/index.html'):
        member_id = p.parent.name
        out.append((member_id, p))
    out.sort(key=lambda t: (0, int(t[0])) if t[0].isdigit() else (1, t[0]))
    return out


def parse_profile(html: str) -> dict:
    """Extract ONLY curation-safe fields from a profile page. Never reads email,
    phone, or street address values. Returns display_name, city, country, clubs,
    honor_evidence, and a boolean noting that private contact fields exist on the
    page (evidence flag only, never their values)."""
    soup = BeautifulSoup(html, 'html.parser')

    name_el = soup.find(class_='membersProfileName')
    if name_el and name_el.get_text(strip=True):
        display_name = name_el.get_text(strip=True)
    else:
        title = soup.find('title')
        t = title.get_text(strip=True) if title else ''
        display_name = t.split('Member Profile for', 1)[1].strip() if 'Member Profile for' in t else t

    city = _labeled_value(soup, 'City')
    country = _labeled_value(soup, 'Country')

    clubs = []
    seen = set()
    for a in soup.find_all('a', href=True):
        m = a['href']
        idx = m.find('clubs/show/')
        if idx != -1:
            cid = m[idx + len('clubs/show/'):].split('/')[0].split('?')[0]
            if cid and cid not in seen:
                seen.add(cid)
                clubs.append({'club_id': cid, 'name': a.get_text(strip=True)})

    page_text = soup.get_text(' ', strip=True)
    honor_evidence = []
    if 'Hall of Fame' in page_text:
        honor_evidence.append('hall_of_fame_mentioned')
    if 'BAP' in page_text or 'Best All' in page_text:
        honor_evidence.append('bap_mentioned')

    has_private = any(k in page_text.lower() for k in ('e-mail', 'email', 'phone', 'address'))

    return {
        'display_name': display_name,
        'city': city,
        'country': country,
        'clubs': clubs,
        'honor_evidence': honor_evidence,
        'private_fields_present_on_page': has_private,
    }


def _labeled_value(soup, label: str) -> str | None:
    """Best-effort value for a 'Label:' cell/row, for curation-safe labels only
    (City / Country). Returns None when not confidently found."""
    for cell in soup.find_all(['td', 'th', 'span', 'div', 'li']):
        txt = cell.get_text(' ', strip=True)
        if txt.rstrip(':').strip().casefold() == label.casefold():
            nxt = cell.find_next_sibling()
            if nxt:
                val = nxt.get_text(' ', strip=True)
                if val:
                    return val
    return None


# ── Manifest ─────────────────────────────────────────────────────────────────

def profile_record(mirror_root: str, member_id: str, path: Path) -> dict:
    html = path.read_text(encoding='utf-8', errors='replace')
    parsed = parse_profile(html)
    rel = path.relative_to(mirror_root).as_posix()
    source_host = rel.split('/', 1)[0]  # www.footbag.org (single-tree archive)
    content_hash = hashlib.sha256(html.encode('utf-8', 'replace')).hexdigest()
    return {
        'member_id': member_id,
        'is_dump_member_id': member_id.isdigit(),
        'archived_url': f'http://www.footbag.org/members/profile/{member_id}/',
        'source_host': source_host,
        'display_name': parsed['display_name'],
        'normalized_name': normalize_name(parsed['display_name']),
        'city': parsed['city'],
        'country': parsed['country'],
        'clubs': parsed['clubs'],
        'honor_evidence': parsed['honor_evidence'],
        'private_fields_present_on_page': parsed['private_fields_present_on_page'],
        'content_hash': content_hash,
        'file_rel': rel,
    }


def build_manifest(mirror_root: str) -> dict:
    profiles = [profile_record(mirror_root, mid, p)
                for mid, p in discover_profile_files(mirror_root)]
    return {
        'kind': 'member_profile_manifest',
        'mirror_root': str(mirror_root),
        'profile_count': len(profiles),
        'profiles': profiles,
    }


# ── Delta ────────────────────────────────────────────────────────────────────

def compute_delta(baseline: dict, current: dict) -> dict:
    base = {r['member_id']: r for r in baseline.get('profiles', [])}
    cur = {r['member_id']: r for r in current.get('profiles', [])}
    new, changed, unchanged, missing = [], [], [], []
    for mid, r in cur.items():
        if mid not in base:
            new.append(r)
        elif r['content_hash'] != base[mid]['content_hash']:
            changed.append(r)
        else:
            unchanged.append(r)
    for mid, r in base.items():
        if mid not in cur:
            missing.append(r)
    key = lambda r: r['member_id']
    return {
        'kind': 'member_profile_delta',
        'baseline_count': len(base),
        'current_count': len(cur),
        'new': sorted(new, key=key),
        'changed': sorted(changed, key=key),
        'unchanged': sorted(unchanged, key=key),
        'missing': sorted(missing, key=key),
    }


# ── Existing-identity dedup ──────────────────────────────────────────────────

def load_existing_identities(db_path: str) -> dict:
    """Read the identities the queue deduplicates against: legacy members
    (dump ids), canonical historical persons, and live members. Read-only."""
    conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    try:
        legacy = [dict(r) for r in conn.execute(
            "SELECT legacy_member_id, display_name, display_name_normalized, "
            "claimed_by_member_id FROM legacy_members")]
        # historical_persons names its person 'person_name' (no *_normalized
        # column); alias it so the shared index builder normalizes it itself.
        persons = [dict(r) for r in conn.execute(
            "SELECT person_id, legacy_member_id, person_name AS display_name, "
            "hof_member, bap_member FROM historical_persons")]
        members = [dict(r) for r in conn.execute(
            "SELECT id, display_name, display_name_normalized FROM members "
            "WHERE deleted_at IS NULL")]
    finally:
        conn.close()
    return build_identity_index(legacy, persons, members)


def build_identity_index(legacy, persons, members) -> dict:
    """Pure index builder (tested directly with synthetic rows)."""
    by_legacy_id: dict[str, list] = {}
    by_norm: dict[str, list] = {}

    def add(kind, legacy_id, norm, label, extra):
        rec = {'kind': kind, 'legacy_member_id': legacy_id,
               'normalized_name': norm, 'label': label, **extra}
        if legacy_id:
            by_legacy_id.setdefault(str(legacy_id), []).append(rec)
        if norm:
            by_norm.setdefault(norm, []).append(rec)

    for r in legacy:
        norm = r.get('display_name_normalized') or normalize_name(r.get('display_name') or '')
        add('legacy_member', r.get('legacy_member_id'), norm, r.get('display_name'),
            {'claimed_by_member_id': r.get('claimed_by_member_id')})
    for r in persons:
        norm = r.get('display_name_normalized') or normalize_name(r.get('display_name') or '')
        add('historical_person', r.get('legacy_member_id'), norm, r.get('display_name'),
            {'person_id': r.get('person_id')})
    for r in members:
        norm = r.get('display_name_normalized') or normalize_name(r.get('display_name') or '')
        add('member', None, norm, r.get('display_name'), {'member_id': r.get('id')})
    return {'by_legacy_id': by_legacy_id, 'by_normalized_name': by_norm}


def match_identity(record: dict, identities: dict) -> dict:
    """Deterministic identity resolution for one captured profile. Never merges;
    returns a recommendation and candidate evidence only."""
    mid = record['member_id']
    norm = record['normalized_name']

    if record.get('is_dump_member_id') and mid in identities['by_legacy_id']:
        cands = identities['by_legacy_id'][mid]
        return {
            'confidence': 'high',
            'existing_candidates': _slim(cands),
            'recommended_action': 'link-to-existing-identity',
            'ambiguity_notes': '',
        }

    name_cands = identities['by_normalized_name'].get(norm, []) if norm else []
    if len(name_cands) == 1:
        return {
            'confidence': 'medium',
            'existing_candidates': _slim(name_cands),
            'recommended_action': 'human-review-probable-name-match',
            'ambiguity_notes': 'single normalized-name match; no dump-id linkage',
        }
    if len(name_cands) > 1:
        return {
            'confidence': 'low',
            'existing_candidates': _slim(name_cands),
            'recommended_action': 'human-review-ambiguous',
            'ambiguity_notes': f'{len(name_cands)} identities share this normalized name',
        }
    return {
        'confidence': 'none',
        'existing_candidates': [],
        'recommended_action': 'human-review-new-person',
        'ambiguity_notes': 'no dump-id or name match against existing data',
    }


def _slim(cands: list) -> list:
    out = []
    for c in cands:
        out.append({k: c.get(k) for k in
                    ('kind', 'legacy_member_id', 'person_id', 'member_id',
                     'claimed_by_member_id', 'label') if c.get(k) is not None})
    return out


# ── Curation queue (redacted) ────────────────────────────────────────────────

def redact_queue_row(row: dict) -> dict:
    """Enforce the field allowlist and assert no private value slipped through."""
    clean = {k: v for k, v in row.items() if k in ALLOWED_QUEUE_FIELDS}
    blob = json.dumps(clean, ensure_ascii=False).lower()
    for k in FORBIDDEN_VALUE_KEYS:
        # 'honor_evidence' legitimately may contain no forbidden substrings; the
        # allowlist has no email/phone/address field, so this is belt-and-braces.
        assert f'"{k}"' not in blob, f'redaction failed: forbidden key {k!r} in queue row'
    return clean


def build_curation_queue(delta: dict, identities: dict) -> list[dict]:
    queue = []
    for record in delta.get('new', []):
        match = match_identity(record, identities)
        row = {
            'dump_member_id': record['member_id'] if record.get('is_dump_member_id') else None,
            'archived_url': record['archived_url'],
            'source_host': record['source_host'],
            'captured_display_name': record['display_name'],
            'normalized_name': record['normalized_name'],
            'existing_candidates': match['existing_candidates'],
            'club_relationships': record.get('clubs', []),
            'city': record.get('city'),
            'country': record.get('country'),
            'event_relationships': [],  # populated by a later results-join pass
            'honor_evidence': record.get('honor_evidence', []),
            'archive_provenance': {'file_rel': record['file_rel'],
                                   'content_hash': record['content_hash']},
            'confidence': match['confidence'],
            'recommended_action': match['recommended_action'],
            'ambiguity_notes': match['ambiguity_notes'],
        }
        queue.append(redact_queue_row(row))
    return queue


# ── CLI ──────────────────────────────────────────────────────────────────────

def _load_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding='utf-8'))


def _write_json(obj, path: str) -> None:
    Path(path).write_text(json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False) + '\n',
                          encoding='utf-8')


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)

    b = sub.add_parser('baseline', help='inventory profiles -> manifest')
    b.add_argument('--mirror-root', required=True)
    b.add_argument('--out', required=True)

    d = sub.add_parser('delta', help='compare a fresh inventory against a baseline')
    d.add_argument('--baseline', required=True)
    d.add_argument('--mirror-root', required=True)
    d.add_argument('--out', required=True)
    d.add_argument('--current-out', default=None,
                   help='also write the fresh inventory manifest here')

    q = sub.add_parser('queue', help='emit a privacy-redacted curation queue')
    q.add_argument('--delta', required=True)
    q.add_argument('--db', required=True)
    q.add_argument('--out', required=True)

    args = parser.parse_args(argv)

    if args.cmd == 'baseline':
        manifest = build_manifest(args.mirror_root)
        _write_json(manifest, args.out)
        print(f'baseline: {manifest["profile_count"]} profiles -> {args.out}')
        print('NOTE: confirm this mirror root is the real historical baseline, '
              'not a partial developer sample.')
        return 0

    if args.cmd == 'delta':
        baseline = _load_json(args.baseline)
        current = build_manifest(args.mirror_root)
        if args.current_out:
            _write_json(current, args.current_out)
        delta = compute_delta(baseline, current)
        _write_json(delta, args.out)
        print(f'delta: new={len(delta["new"])} changed={len(delta["changed"])} '
              f'unchanged={len(delta["unchanged"])} missing={len(delta["missing"])} -> {args.out}')
        return 0

    if args.cmd == 'queue':
        delta = _load_json(args.delta)
        identities = load_existing_identities(args.db)
        queue = build_curation_queue(delta, identities)
        _write_json({'kind': 'member_curation_queue', 'row_count': len(queue),
                     'rows': queue}, args.out)
        by_conf = {}
        for r in queue:
            by_conf[r['confidence']] = by_conf.get(r['confidence'], 0) + 1
        print(f'queue: {len(queue)} rows -> {args.out}  by-confidence={by_conf}')
        print('Recommendations only: no member record was merged or mutated.')
        return 0

    return 2


if __name__ == '__main__':
    sys.exit(main())
