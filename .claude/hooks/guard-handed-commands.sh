#!/usr/bin/env bash
# Stop hook: block a message that hands the human a state-changing command to type,
# so the change goes through the script that owns it instead. A command the human
# types by hand skips the preconditions, the typed confirmation, the verification
# and the cleanup that the owning script carries, and the run leaves no closing
# report. Backstop for root CLAUDE.md rule 6.
#
# What counts as handed over: a line inside a fenced block (unless the fence is
# marked text, output or log, which is quoted output), a line starting "$ " or
# "! " (after any list marker), and an inline code span. A leading "!" (Claude
# Code's shell-mode prefix) is stripped before judging. A trailing backslash joins
# a line to the next. Each piece of a compound command (split at &&, ||, ; and |)
# is judged on its own, and a bash -c or sh -c string is judged in turn.
#
# What blocks: a sudo; a package install or removal (apt, apt-get, dpkg, snap,
# npm -g, pip); a Docker prune, removal, stop, run or Compose up/down; a systemctl
# state change; an AWS mutating verb; a Terraform apply, destroy, import, taint or
# state change; an ssh carrying a remote command; a recursive rm; and a script run
# (by bash, sh, source, an interpreter, or by its path) whose file is not in the
# repository's working tree: missing, outside the checkout (the session
# scratchpad, /tmp, a companion checkout) or gitignored.
# What passes: a script in the repository tree, every read-only command, and prose.
#
# A hook-forced continuation is judged too, since it is where a closing list is
# written; Claude Code's consecutive-continuation cap bounds any loop.
#
# Fail-open: any parse problem or missing tool lets the turn through untouched,
# because this is a reply-quality backstop and the rule text is the primary control.
set -euo pipefail
input="$(cat)"

msg="$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("last_assistant_message") or "")' 2>/dev/null || true)"
if [ -z "$msg" ]; then
transcript="$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("transcript_path",""))' 2>/dev/null || true)"
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0
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
fi
[ -n "$msg" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-}"
[ -n "$root" ] || root="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null || true)"
[ -n "$root" ] || root="$(pwd)"

offending="$(HANDED_MSG="$msg" HANDED_ROOT="$root" python3 - <<'PY' 2>/dev/null || true
import os, re, shlex

msg = os.environ["HANDED_MSG"]
root = os.environ["HANDED_ROOT"]

# Candidate commands: (text, is_inline). An inline span is judged only when it
# opens with a command head; a bare path in backticks is a reference, not a command.
cands = []
lines = msg.split("\n")
in_fence = False
skip_fence = False
buf = ""
for raw in lines:
    stripped = raw.strip()
    m = re.match(r"^(```+|~~~+)\s*([A-Za-z0-9_+-]*)", stripped)
    if m:
        if not in_fence:
            in_fence = True
            skip_fence = m.group(2).lower() in ("text", "output", "log")
        else:
            in_fence = False
            skip_fence = False
        buf = ""
        continue
    if in_fence:
        if skip_fence:
            continue
        line = stripped
        if line.endswith("\\"):
            buf += line[:-1] + " "
            continue
        line = buf + line
        buf = ""
        line = re.sub(r"^(?:\$\s+|!\s*)", "", line)
        if line and not line.startswith("#"):
            cands.append((line, False))
        continue
    m = re.match(r"^\s*(?:[-*]\s+|\d+\.\s+)?[$!]\s+(\S.*)$", raw)
    if m:
        cands.append((m.group(1).strip(), False))
    for span in re.findall(r"`([^`\n]+)`", raw):
        cands.append((re.sub(r"^!\s*", "", span.strip()), True))

SCRIPT_RUNNERS = ("bash", "sh", "zsh", "source", ".", "python", "python3", "node", "tsx")

def script_path(tok):
    return os.path.expanduser(tok)

def script_exists(path):
    # In the repository tree, after resolving links, and not gitignored: a file in the
    # session scratchpad, /tmp or a companion checkout is not a committed script.
    p = path if os.path.isabs(path) else os.path.join(root, path)
    if not os.path.isfile(p):
        return False
    real = os.path.realpath(p)
    top = os.path.realpath(root)
    if os.path.commonpath([real, top]) != top:
        return False
    rel = os.path.relpath(real, top)
    import subprocess
    try:
        ignored = subprocess.run(["git", "-C", top, "check-ignore", "-q", "--", rel],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    except Exception:
        ignored = False
    return not ignored

def looks_like_script(tok):
    return bool(re.match(r"^(\./|/|~/)?([\w.-]+/)*[\w.-]+\.(sh|bash|py|ts|js|mjs)$", tok))

AWS_VERB = re.compile(r"^(create|delete|put|update|modify|attach|detach|terminate|start|stop|reboot|run|send|set|tag|untag|remove|add|associate|disassociate|enable|disable|invoke|publish|restore|copy|import|register|deregister|revoke|authorize|reset|rotate|cancel)-")

def judge(piece, inline):
    try:
        toks = shlex.split(piece, comments=False)
    except ValueError:
        toks = piece.split()
    if not toks:
        return None
    # Environment assignments and env prefix.
    while toks and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]):
        toks = toks[1:]
    if toks and toks[0] == "env":
        toks = toks[1:]
        while toks and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]):
            toks = toks[1:]
    if not toks:
        return None
    head = os.path.basename(toks[0])
    args = toks[1:]
    # A bare `sudo` in inline code names the tool in prose; with arguments it is a command.
    if head == "sudo" and (args or not inline):
        return "a sudo"
    # A shell given a command string: judge the string.
    if head in ("bash", "sh", "zsh") and len(args) >= 2 and args[0] == "-c":
        for sub in re.split(r"\s*(?:&&|\|\||;|\|)\s*", args[1]):
            why = judge(sub.strip(), False) if sub.strip() else None
            if why:
                return why
        return None
    # A script invocation passes only when the script is in the repository tree.
    NOT_IN_TREE = "a script that is not in the repository (scratchpad, /tmp, a companion checkout or missing)"
    sargs = [x for x in args if not x.startswith("-")]
    if head in SCRIPT_RUNNERS and sargs and looks_like_script(sargs[0]):
        return None if script_exists(script_path(sargs[0])) else NOT_IN_TREE
    # A direct invocation (./x.sh, scripts/x.sh, /tmp/x.sh). A bare path in inline code
    # with no arguments is a reference to the file, not a command, and is left alone.
    if looks_like_script(toks[0]) and "/" in toks[0]:
        if inline and not args and not toks[0].startswith("./"):
            return None
        return None if script_exists(script_path(toks[0])) else NOT_IN_TREE
    a = args
    first = a[0] if a else ""
    second = a[1] if len(a) > 1 else ""
    if head in ("apt", "apt-get", "aptitude") and first in ("install", "upgrade", "full-upgrade", "dist-upgrade", "remove", "purge", "autoremove", "reinstall"):
        return "a package change"
    if head == "dpkg" and any(x in ("-i", "-r", "-P", "--install", "--remove", "--purge", "--configure") for x in a):
        return "a package change"
    if head == "snap" and first in ("install", "remove", "refresh"):
        return "a package change"
    if head in ("npm", "pnpm", "yarn") and first in ("i", "install", "add") and any(x in ("-g", "--global") for x in a):
        return "a global package install"
    if head in ("pip", "pip3") and first in ("install", "uninstall"):
        return "a package change"
    if head in ("docker", "docker-compose"):
        rest = a
        if head == "docker" and first == "compose":
            rest = a[1:]
            sub = [x for x in rest if not x.startswith("-")]
            if sub and sub[0] in ("down", "up", "rm", "stop", "restart", "kill", "pull", "build"):
                return "a Docker change"
            return None
        if head == "docker-compose":
            sub = [x for x in rest if not x.startswith("-")]
            if sub and sub[0] in ("down", "up", "rm", "stop", "restart", "kill", "pull", "build"):
                return "a Docker change"
            return None
        if first in ("system", "builder", "image", "volume", "container", "network", "buildx") and "prune" in a:
            return "a Docker prune"
        if first in ("rm", "rmi", "stop", "kill", "restart", "load", "pull", "build", "run", "tag", "push"):
            return "a Docker change"
        return None
    if head == "systemctl" and any(x in ("start", "stop", "restart", "reload", "enable", "disable", "mask", "unmask", "kill") for x in a):
        return "a service state change"
    if head == "aws":
        pos = []
        j = 0
        while j < len(a):
            if a[j].startswith("--"):
                if "=" not in a[j] and j + 1 < len(a) and not a[j + 1].startswith("-"):
                    j += 1
                j += 1
                continue
            pos.append(a[j])
            j += 1
        if len(pos) >= 2:
            if pos[0] == "s3" and pos[1] in ("rm", "cp", "mv", "sync", "rb", "mb"):
                return "an AWS change"
            if AWS_VERB.match(pos[1]):
                return "an AWS change"
        return None
    tfirst = next((x for x in a if not x.startswith("-")), "")
    if head == "terraform" and tfirst in ("apply", "destroy", "import", "taint", "untaint", "state", "force-unlock"):
        return "a Terraform change"
    if head == "ssh":
        pos = []
        j = 0
        takes = set("bcDEeFIiJLlmOopQRSWw")
        while j < len(a):
            x = a[j]
            if x.startswith("-") and len(x) >= 2:
                if x[-1] in takes and len(x) == 2:
                    j += 1
                j += 1
                continue
            pos.append(x)
            j += 1
        if len(pos) >= 2:
            return "an ssh carrying a remote command"
        return None
    if head == "rm" and any(re.match(r"^-[A-Za-z]*[rR]", x) or x == "--recursive" for x in a):
        return "a recursive rm"
    return None

for text, inline in cands:
    for piece in re.split(r"\s*(?:&&|\|\||;|\|)\s*", text):
        piece = piece.strip()
        if not piece:
            continue
        why = judge(piece, inline)
        if why:
            print(f"{why}: {piece[:200]}")
            raise SystemExit(0)
PY
)"

[ -n "$offending" ] || exit 0
reason="Your message hands the human a state-changing command to type (${offending}). Root CLAUDE.md rule 6: name the scripts/ script that owns the change, with its flags (search scripts/ first; workstation tools and pins are scripts/setup-dev-workstation.sh and scripts/bump-tool.sh), or write one under scripts/ with its companion test and runbook entry, and name that. A script in the scratchpad or /tmp is never handed over, with or without the ! prefix, and a hook that blocked you is not a reason to. Quote a command only as output, in a fence marked text."
printf '{"decision":"block","reason":%s}\n' "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$reason")"
exit 0
