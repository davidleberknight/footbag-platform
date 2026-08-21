#!/usr/bin/env bash
# Script credential-handling gate. The deploy/operations scripts follow a
# stdin/no-argv discipline for secrets by hand; this gate blocks the
# high-signal regressions a reviewer can miss:
#
#   1. --password style CLI flags: argv is visible to every local process
#      via ps and lands in shell history.
#   2. user:password@ URLs: credentials embedded in a URL leak into logs,
#      proxies, and error messages.
#   3. `sudo -S` piped into a stdin-consuming file writer (tee/cat/dd):
#      with cached sudo credentials the password on stdin flows straight
#      through into the target file. Piping `sudo -S ... bash` with the
#      password as the first stdin line is the accepted remote-exec pattern
#      and is not flagged.
#   4. `ssh -t` anywhere under scripts/: a remote PTY exists to let sudo
#      prompt a human, which is the pattern the canonical wire form replaces.
#      An interactive prompt cannot be driven by a test, it makes the operator
#      hold a step in their head, and a tree carrying both forms drifts back to
#      the weaker one. Comments count: a comment describing the interactive
#      flow is how the superseded doctrine survived a revert and got cited back
#      as though it were the rule.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=0

scan() {
  # -e keeps a pattern beginning with "--" (the CLI-flag check) from being
  # swallowed as a grep option terminator, which would silently skip the scan.
  grep -rnE -e "$1" scripts/ legacy_data/scripts/ legacy_data/tools/ --include='*.sh' --include='*.ts' --include='*.py' 2>/dev/null \
    | grep -v 'scripts/\.venv/' \
    | grep -v 'scripts/ci/check_script_credentials\.sh' \
    || true
}

hits=$(scan '--password[ =]')
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "FAIL: secrets must not ride CLI flags; read them from stdin or a 600-mode file" >&2
  violations=$((violations + 1))
fi

hits=$(scan '[a-z][a-z0-9+.-]*://[^/@ "'"'"']+:[^/@ "'"'"']+@')
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "FAIL: credentials must not be embedded in URLs" >&2
  violations=$((violations + 1))
fi

hits=$(scan 'sudo -S[^|]*\|[ ]*(tee|cat|dd)\b|sudo -S (-p [^ ]+ )?(tee|cat|dd)\b')
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "FAIL: sudo -S must never feed a stdin-consuming file writer; the cached-credential case pipes the password into the target file" >&2
  violations=$((violations + 1))
fi

# The t may sit anywhere in a combined short-option cluster, not only at its end:
# -tN requests a terminal exactly as -t does, and a guard anchored on the last
# letter would wave it through.
hits=$(scan '\bssh\b[^|;&]* -[a-zA-Z]*t[a-zA-Z]*\b')
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "FAIL: no ssh -t under scripts/; a privileged remote step goes through the wire pattern" >&2
  echo "      (password as stdin line 1 + printf %q assignments + cat-piped remote half" >&2
  echo "      into 'sudo -k -S -p \"\" bash'). Model: scripts/install-cwagent-staging.sh." >&2
  violations=$((violations + 1))
fi

# An operator prompt reading stdin, in a script with no terminal guard. This is
# the reverse of the rule above and bites the caller rather than the author: the
# script never asks for a credential, so nothing stops someone invoking it with
# one redirected in, and `read` then consumes the password as the answer to a
# confirmation prompt. The fix is either to read the answer from /dev/tty, or to
# refuse unless stdin/stdout/stderr are all TTYs the way deploy_to_aws.sh does.
# Loop reads (`while … read`), here-strings and here-docs are data plumbing, not
# prompts, so they are excluded, as is any read carrying its own `<` redirect:
# naming the source means it is not consuming whatever the caller happened to
# attach. A file already carrying a guard passes.
prompt_offenders=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  prompt_hits=$(grep -nE '(^|[^a-zA-Z_])read +-[a-zA-Z]*r' "$f" 2>/dev/null \
    | grep -vE '<<<|<<|while|done <|/dev/tty|read [^|;&]*< ' || true)
  [ -n "$prompt_hits" ] || continue
  grep -qE '\-t 0|/dev/tty' "$f" && continue
  prompt_offenders="${prompt_offenders}${prompt_hits}
"
done <<EOF
$(find scripts -name '*.sh' -not -path 'scripts/.venv/*' 2>/dev/null | sort)
EOF
if [ -n "$(printf '%s' "$prompt_offenders" | tr -d '[:space:]')" ]; then
  printf '%s' "$prompt_offenders" >&2
  echo "FAIL: an operator prompt reads stdin in a script with no terminal guard;" >&2
  echo "      a caller who redirects a credential file in would have the password" >&2
  echo "      consumed as the answer. Read the answer from /dev/tty, or refuse a" >&2
  echo "      non-TTY stdin. Model: scripts/arming.sh." >&2
  violations=$((violations + 1))
fi

if [ "$violations" -gt 0 ]; then
  exit 1
fi

echo "[script-credentials] pass"
