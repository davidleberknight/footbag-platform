#!/usr/bin/env bash
# Read-only status check for the production mirror crawl. Prints only operational
# status (session, process, log tail, progress counts, file count, disk, git).
# Never prints credentials, cookies, member-profile contents, or raw private data.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

MIRROR_DIR="legacy_data/mirror_footbag_org"
PROGRESS_FILE="legacy_data/mirror_progress.json"
LOG_FILE="legacy_data/mirror.log"

echo "== tmux session 'footbag-mirror' =="
if tmux has-session -t footbag-mirror 2>/dev/null; then
  echo "  present"
else
  echo "  absent"
fi

echo "== crawler process =="
# argv is 'python create_mirror_footbag_org.py JLeberknight -fresh -log' — no
# password (getpass), so this is safe to display.
pgrep -af "create_mirror_footbag_org\.py" | grep -v "check_production_mirror" || echo "  not running"

echo "== latest log lines (status / URLs only) =="
if [ -f "$LOG_FILE" ]; then
  tail -n 15 "$LOG_FILE"
else
  echo "  (no log yet)"
fi

echo "== progress counts =="
if [ -f "$PROGRESS_FILE" ]; then
  legacy_data/.venv/bin/python - "$PROGRESS_FILE" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    def n(k):
        v = d.get(k)
        return len(v) if isinstance(v, (list, dict, set)) else v
    print("  visited:", n('visited'), "| queue:", n('queue'),
          "| failed_urls:", n('failed_urls'), "| skipped_videos:", n('skipped_videos'))
    st = d.get('stats', {}) or {}
    keys = [k for k in st if any(t in k.lower() for t in
            ('download', 'saved', 'convert', 'fail', 'skip', 'byte', 'regsummar'))]
    for k in sorted(keys):
        print(f"  stats.{k}:", st[k])
except Exception as e:
    print("  (could not read progress:", e, ")")
PY
else
  echo "  (no progress file yet)"
fi

echo "== mirror size =="
if [ -d "$MIRROR_DIR" ]; then
  echo "  files: $(find "$MIRROR_DIR" -type f | wc -l)"
  echo "  disk : $(du -sh "$MIRROR_DIR" 2>/dev/null | cut -f1)"
  echo "  member profiles: $(find "$MIRROR_DIR" -path '*members/profile/*' -name index.html 2>/dev/null | wc -l)"
else
  echo "  (no mirror dir yet)"
fi

echo "== git status (tracked tree) =="
git status --short || true
