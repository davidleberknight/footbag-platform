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

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=0

scan() {
  grep -rnE "$1" scripts/ --include='*.sh' --include='*.ts' --include='*.py' 2>/dev/null \
    | grep -v 'scripts/\.venv/' \
    | grep -v 'scripts/ci/check_script_credentials\.sh' \
    || true
}

hits=$(scan -- '--password[ =]')
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

if [ "$violations" -gt 0 ]; then
  exit 1
fi

echo "[script-credentials] pass"
