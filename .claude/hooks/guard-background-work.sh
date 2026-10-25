#!/usr/bin/env bash
# Stop hook: a turn does not end quietly while work this session started is still in
# flight. Claude Code passes the session's own task registry in the Stop input
# (background_tasks: background shell commands, subagents, monitors, workflows), so
# only what this session started is ever named, never a process the maintainer started
# himself. When the registry holds a task and the final message has no line starting
# "Still running:", block: Claude stops each task whose work is done with TaskStop,
# including any dev server it started, and names on that line each one it is
# deliberately leaving up (a test run it is waiting on, a server the maintainer asked
# to keep), so the human never has to ask what is still running.
# Scheduled wakeups (session_crons, from /loop and ScheduleWakeup) are deliberate and
# not checked. Claude Code ends the turn after eight consecutive blocks, which bounds a
# stuck loop. Fail-open: a parse problem, or an input without the registry or the final
# message, lets the turn end.
set -uo pipefail
input="$(cat)"
jq -e 'has("background_tasks") and has("last_assistant_message")' <<<"$input" >/dev/null 2>&1 || exit 0
tasks="$(jq -r '.background_tasks // [] | map("- " + (.type // "task") + " " + (.id // "?") + ": " + ((.command // .description // .agent_type // .name // "") | tostring | .[0:160])) | join("\n")' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$tasks" ] || exit 0
msg="$(jq -r '.last_assistant_message // ""' <<<"$input" 2>/dev/null)"
printf '%s\n' "$msg" | grep -Eq '^[[:space:]]*([-*][[:space:]]+)?(\*\*)?Still running:' && exit 0
dev=""
if printf '%s' "$tasks" | grep -Eiq 'run_dev\.sh|scripts/dev\.sh|npm run dev|dev server'; then
  dev=' A dev server is among them: after stopping it, run lsof -t -i:3000 -i:4001 -i:3100 and kill any process still holding those ports, so no web server or worker outlives its task.'
fi
reason="This session still has background work in flight:
${tasks}
Before ending the turn, stop each task whose work is finished or no longer needed with TaskStop, including a subagent that has already reported back.${dev} Keep one running only if you are waiting on its result for the current task or the maintainer asked for it to stay up; then add a line starting \"Still running:\" that names each one you are leaving and why. Then finish the turn."
jq -cn --arg r "$reason" '{decision:"block",reason:$r}'
exit 0
