#!/usr/bin/env bash
# Stop hook: a turn ends with an honest status. Two checks.
# 1. Work in flight. Claude Code passes the session's own task registry in the Stop
#    input (background_tasks: background shell commands, subagents, monitors,
#    workflows), so only what this session started is ever named, never a process the
#    maintainer started himself. When the registry holds a task and the final message
#    has no line starting "Still running:", or ends by claiming "Session done", block:
#    Claude stops each task whose work is done with TaskStop, including any dev server
#    it started, and names on that line each one it is deliberately leaving up.
#    Scheduled wakeups (session_crons, from /loop and ScheduleWakeup) are deliberate
#    and not checked.
# 2. Closing status. The final message, fenced blocks aside, ends with a last line
#    starting "Session done" or carries a "Not done:" list. A message whose last line
#    asks a question is exempt (guard-question-quality.sh governs it), and so is plan
#    mode. A message with a question line anywhere but a last line that is not a
#    question is blocked once, so an owed question is never buried above a status
#    list: its last line must restate it ("Your call: ...?"). Also on a first pass (plan
#    mode included): a "Still running:" line below the first question line blocks, and so
#    does a "Question N of M" count or a "Not done:" item naming a question, ruling or
#    decision, since a message asks one question and names no later one. A missing status gets non-error feedback (additionalContext) naming the
#    audit; the hook cannot see plan steps, verification or promises, so that audit is
#    Claude's.
# Claude Code ends the turn after eight consecutive continuations, which bounds a stuck
# loop. Fail-open: a parse problem, or an input without the final message, lets the
# turn end.
set -uo pipefail
input="$(cat)"
jq -e 'has("last_assistant_message")' <<<"$input" >/dev/null 2>&1 || exit 0
msg="$(jq -r '.last_assistant_message // ""' <<<"$input" 2>/dev/null)" || exit 0
body="$(printf '%s\n' "$msg" | sed '/^[[:space:]]*```/,/^[[:space:]]*```/d')"
last="$(printf '%s\n' "$body" | grep -v '^[[:space:]]*$' | tail -n 1)"
done_re='^[[:space:]]*(\*\*)?Session done'
tasks="$(jq -r '.background_tasks // [] | map("- " + (.type // "task") + " " + (.id // "?") + ": " + ((.command // .description // .agent_type // .name // "") | tostring | .[0:160])) | join("\n")' <<<"$input" 2>/dev/null)" || tasks=""
if [ -n "$tasks" ]; then
  claims_done=0
  printf '%s\n' "$last" | grep -Eq "$done_re" && claims_done=1
  if [ "$claims_done" -eq 1 ] || ! printf '%s\n' "$msg" | grep -Eq '^[[:space:]]*([-*][[:space:]]+)?(\*\*)?Still running:'; then
    dev=""
    if printf '%s' "$tasks" | grep -Eiq 'run_dev\.sh|scripts/dev\.sh|npm run dev|dev server'; then
      dev=' A dev server is among them: after stopping it, run lsof -t -i:3000 -i:4001 -i:3100 and kill any process still holding those ports, so no web server or worker outlives its task.'
    fi
    contra=""
    [ "$claims_done" -eq 1 ] && contra='Your message says "Session done" while this work is still registered, which is not true yet. '
    reason="This session still has background work in flight:
${tasks}
${contra}Before ending the turn, stop each task whose work is finished or no longer needed with TaskStop, including a subagent that has already reported back.${dev} Keep one running only if you are waiting on its result for the current task or the maintainer asked for it to stay up; then name each one you are leaving, and why, on a line starting \"Still running:\" placed above any question to the human, never after it. If you already asked a question, do not repeat or re-ask it: write the Still running line and, below it, a \"Not done:\" list if the message had no closing status. Then finish the turn."
    jq -cn --arg r "$reason" '{decision:"block",reason:$r}'
    exit 0
  fi
fi
q_re='\?[[:space:]*]*$'
active="$(jq -r '.stop_hook_active // false' <<<"$input" 2>/dev/null)"
if [ "$active" != true ]; then
  # Status sits above the question, so the question is the last thing read.
  q_line="$(printf '%s\n' "$body" | grep -nE "$q_re" | head -n 1 | cut -d: -f1)"
  sr_line="$(printf '%s\n' "$body" | grep -nE '^[[:space:]]*([-*][[:space:]]+)?(\*\*)?Still running:' | tail -n 1 | cut -d: -f1)"
  if [ -n "$q_line" ] && [ -n "$sr_line" ] && [ "$sr_line" -gt "$q_line" ]; then
    jq -cn --arg r 'Your "Still running:" line comes after your question to the human. Put every status line, and any "Not done:" list, above the question, so the message ends on it.' '{decision:"block",reason:$r}'
    exit 0
  fi
  # One question per message: a later question is never counted, previewed or carried
  # as a status item; it is first mentioned when it is asked.
  nd_items="$(printf '%s\n' "$body" | sed -En '/^[[:space:]]*(\*\*)?Not done:/,$p' | sed '1d' \
    | grep -E '^[[:space:]]*[-*][[:space:]]' | grep -v 'Still running:' || true)"
  if printf '%s\n' "$body" | grep -Eiq '\bQuestions? [0-9]+ (of|to|and) [0-9]+' \
    || printf '%s\n' "$nd_items" | grep -Eiq '\b(questions?|rulings?|decisions?|your answer|your call)\b'; then
    jq -cn --arg r 'Your message counts, previews or lists a question to the human beyond the one it asks (a "Question N of M" count, or a "Not done:" item naming a question, ruling or decision). Ask one question and name no other: drop the count or the item; a later question is first mentioned when it is asked.' '{decision:"block",reason:$r}'
    exit 0
  fi
fi
[ "$(jq -r '.permission_mode // empty' <<<"$input" 2>/dev/null)" = plan ] && exit 0
if [ "$active" != true ] \
  && printf '%s\n' "$body" | grep -Eq "$q_re" \
  && ! printf '%s\n' "$last" | grep -Eq "$q_re"; then
  qreason='Your message asks the human a question that is not on its last line, so it will scroll out of sight under the status list. Keep the full question where it is, and end the message, after any "Not done:" list, with one last line: "Your call: <one sentence, recommended answer first>?". If the earlier line was not a question owed to the human, reword it so it does not end in a question mark.'
  jq -cn --arg r "$qreason" '{decision:"block",reason:$r}'
  exit 0
fi
printf '%s\n' "$last" | grep -Eq "$done_re" && exit 0
printf '%s\n' "$body" | grep -Eq '^[[:space:]]*(\*\*)?Not done:' && exit 0
printf '%s\n' "$last" | grep -Eq '\?[[:space:]*]*$' && exit 0
note='Your message has no closing status. Before handing back, audit for loose ends: background shells and subagents this session started; each step of the approved plan, follow-on and closing steps included; any question owed to the human; whether every change was verified and its result reported; anything you said you would do. Do now whatever is yours and doable. Then end with a last line starting "Session done" if nothing remains, or a "Not done:" list giving each open item and whether it waits on you or on the human. List only what genuinely waits: an item already filed in the tracker, or a call the human makes at his own discretion, is not open.'
jq -cn --arg n "$note" '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:$n}}'
exit 0
