#!/usr/bin/env bash
# Stop hook: block a question to the human that still carries internal shorthand the
# reader was not given -- section signs, operational-state numbers, pointers to a
# documentation file, or a gate/finding code used as a bare label -- so the rewrite
# happens before the human sees it. Backstop for .claude/rules/asking.md.
# Fail-open: any parse problem or missing tool lets the turn through untouched.
set -euo pipefail
input="$(cat)"

# Avoid loops: if we already blocked once this turn, let it through.
printf '%s' "$input" | grep -q '"stop_hook_active":[[:space:]]*true' && exit 0

transcript="$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("transcript_path",""))' 2>/dev/null || true)"
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Text of the last assistant message in the transcript.
msg="$(python3 - "$transcript" <<'PY' 2>/dev/null || true
import sys, json
last = ""
for line in open(sys.argv[1]):
    line = line.strip()
    if not line:
        continue
    try:
        o = json.loads(line)
    except Exception:
        continue
    if o.get("type") == "assistant":
        c = o.get("message", {}).get("content", [])
        if isinstance(c, list):
            t = "".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
            if t.strip():
                last = t
print(last)
PY
)"
[ -n "$msg" ] || exit 0

# Only enforce on messages that ask the human something.
printf '%s' "$msg" | grep -q '?' || exit 0

# Banned references inside a question to the human. Three families, any one blocks:
#   1. a section sign, or an operational-state number ("State" + a digit) -- internal
#      markers the reader was never handed;
#   2. a pointer to a documentation file (docs/..., .claude/..., or a bare *.md) --
#      a question must stand on its own, never send the reader off to read a doc;
#   3. a gate or finding code used as a LABEL -- bold-wrapped, or the leading token on
#      a line before a colon or dash. An explained inline mention is deliberately left
#      alone: only the asking rule and the model can judge whether the reader has that
#      code, and a blunt presence match over-blocks (it fires on questions that merely
#      discuss the codes).
core='(§|\bState [0-9]\b)'
docref='(docs/[[:alnum:]_./-]+|\.claude/[[:alnum:]_./-]+|\b[[:alnum:]_-]+\.md\b)'
labelcode='(\*\*[[:space:]]*(UX-)?[A-Z]{1,3}[0-9]+|^[[:space:]]*([-*][[:space:]]+|[0-9]+\.[[:space:]]+)?(UX-)?[A-Z]{1,3}[0-9]+[[:space:]]*(:|-|—))'
if printf '%s' "$msg" | grep -Eq "$core" \
  || printf '%s' "$msg" | grep -Eq "$docref" \
  || printf '%s' "$msg" | grep -Eq "$labelcode"; then
  reason='Your question carries a reference the reader was not given: a section number, an operational-state number, a pointer to a documentation file, or a gate or finding code used as a bare label. Rewrite it in plain self-contained English -- full context inline, one recommended answer, and the first time you name any code, explain it in words rather than leading with the bare label.'
  printf '{"decision":"block","reason":%s}\n' "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$reason")"
  exit 0
fi
exit 0
