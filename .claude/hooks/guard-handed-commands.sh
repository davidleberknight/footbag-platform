#!/usr/bin/env bash
# Stop hook: block a message that hands the human a state-changing command to type,
# so the change goes through the script that owns it instead. A command the human
# types by hand skips the preconditions, the typed confirmation, the verification
# and the cleanup that the owning script carries, and the run leaves no closing
# report. Backstop for root CLAUDE.md rule 6.
#
# What counts as handed over: a line inside a fenced block (unless the fence is
# marked text, output or log, which is quoted output), a line starting "$ ", and
# an inline code span. A trailing backslash joins a line to the next. Each piece
# of a compound command (split at &&, ||, ; and |) is judged on its own.
#
# What blocks: a sudo; a package install or removal (apt, apt-get, dpkg, snap,
# npm -g, pip); a Docker prune, removal, stop or Compose up/down; a systemctl
# state change; an AWS mutating verb; a Terraform apply, destroy, import, taint or
# state change; an ssh carrying a remote command; a recursive rm; and a script
# invocation whose path does not exist in the repository.
# What passes: an invocation of a script that exists in the repository, every
# read-only command, and prose.
#
# Fail-open: any parse problem or missing tool lets the turn through untouched,
# because this is a reply-quality backstop and the rule text is the primary control.
set -euo pipefail
input="$(cat)"

[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = true ] && exit 0

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
        line = re.sub(r"^\$\s+", "", line)
        if line and not line.startswith("#"):
            cands.append((line, False))
        continue
    if re.match(r"^\s*\$\s+\S", raw):
        cands.append((re.sub(r"^\s*\$\s+", "", raw).strip(), False))
    for span in re.findall(r"`([^`\n]+)`", raw):
        cands.append((span.strip(), True))

SCRIPT_RUNNERS = ("bash", "sh")

def script_path(tok):
    t = tok
    if t.startswith("./"):
        t = t[2:]
    return t

def script_exists(path):
    p = path if os.path.isabs(path) else os.path.join(root, path)
    return os.path.isfile(p)

def looks_like_script(tok):
    return bool(re.match(r"^(\./)?([\w.-]+/)*[\w.-]+\.(sh|py|ts)$", tok))

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
    # A script invocation passes when the script exists in the repository.
    if head in SCRIPT_RUNNERS and args and looks_like_script(args[0]):
        return None if script_exists(script_path(args[0])) else "a script that does not exist in the repository"
    # A direct invocation (./x.sh, scripts/x.sh). A bare path in inline code with no
    # arguments is a reference to the file, not a command, and is left alone.
    if looks_like_script(toks[0]) and (toks[0].startswith("./") or toks[0].startswith("scripts/")):
        if inline and not args and not toks[0].startswith("./"):
            return None
        return None if script_exists(script_path(toks[0])) else "a script that does not exist in the repository"
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
    if head == "terraform" and first in ("apply", "destroy", "import", "taint", "untaint", "state", "force-unlock"):
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
reason="Your message hands the human a state-changing command to type (${offending}). Rule 8: name the scripts/ script that owns the change, with its flags (search scripts/ first; workstation tools and pins are scripts/setup-dev-workstation.sh and scripts/bump-tool.sh), or write and test one. Quote a command only as output, in a fence marked text."
printf '{"decision":"block","reason":%s}\n' "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$reason")"
exit 0
