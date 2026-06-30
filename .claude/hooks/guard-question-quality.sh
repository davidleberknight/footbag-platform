#!/usr/bin/env bash
# Stop hook: block a question to the human that still carries internal shorthand the
# reader was not given (section signs, gate/finding codes, operational-state numbers), so
# the rewrite happens before the human sees it. Backstop for .claude/rules/asking.md.
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

# Banned references inside a question to the human.
# Narrow to unambiguous internal-only markers (section signs, cutover-state numbers).
# A bare letter+digit code is NOT flagged: it may be a shared finding ID the human has
# (e.g. a BUGS.md row). The asking rule, not this hook, judges given-vs-not-given.
banned='(§|\bState [0-6]\b)'
if printf '%s' "$msg" | grep -Eq "$banned"; then
  reason='Your question carries internal shorthand the human was not given (a section number, gate/finding code, or operational-state number). Rewrite it per .claude/rules/asking.md: plain self-contained English, full context inline, one recommended answer, no codes.'
  printf '{"decision":"block","reason":%s}\n' "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$reason")"
  exit 0
fi
exit 0
