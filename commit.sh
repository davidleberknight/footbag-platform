#!/usr/bin/env bash
# Path-only repoint of the moved freestyle loader/script references in the three
# skill files (edit authorized). commit.sh is never staged; nothing is pushed.
set -euo pipefail
cd "$(dirname "$0")"

git commit \
  -m "docs(skills): repoint moved freestyle loader/script paths after the folder lift" \
  -m "Path-only: legacy_data/event_results/scripts/<loader>.py -> freestyle/loaders/<loader>.py, and the gated scrape + notation parser -> freestyle/scripts/. No wording, structure, or doctrine changes. Touches footbag-curated-media, footbag-freestyle-dictionary, and pipeline-invariant-enforcer. Bare filenames and input-CSV paths are unchanged." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" \
  -- \
  .claude/skills/footbag-curated-media/SKILL.md \
  .claude/skills/footbag-freestyle-dictionary/SKILL.md \
  .claude/skills/pipeline-invariant-enforcer/SKILL.md

echo "Commit created. Review with 'git show --stat'."
