#!/usr/bin/env bash
# Synthetic-only identifier gate for committed test, content, script, and
# seed-data surfaces. Real community or maintainer identifiers must never be committed
# as fixtures, examples, or content; fixtures use example.* / *.test /
# *.invalid / footbag.org addresses and clearly synthetic names.
#
# What this catches deterministically: personal-mailbox provider addresses
# (gmail, yahoo, ...) anywhere in the scanned trees. A personal-provider
# address in a fixture or usage example is always a real person's mailbox.
#
# What it cannot catch: real NAMES used as fixture data. Names have no
# machine-checkable shape; that class stays with human review and the
# periodic bug-hunt sweeps.
#
# docs/ is deliberately NOT scanned: documentation may publish real contact
# channels (e.g. the security-disclosure mailbox in docs/BUG_REPORT.md).
# The synthetic-only rule governs fixtures and content, not published
# contact information.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Personal-mailbox providers. Domain-anchored so synthetic domains that merely
# contain a provider string (e.g. gmail.example.com) do not trip it.
PROVIDERS='gmail|googlemail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|proton|protonmail|gmx|yandex'

hits=$(grep -rnoE "[A-Za-z0-9._%+-]+@(${PROVIDERS})\.[A-Za-z.]{2,}" \
  tests/ src/content/ src/testkit/ src/views/ scripts/ legacy_data/seed/ 2>/dev/null \
  | grep -v 'scripts/\.venv/' \
  | grep -v 'scripts/ci/check_synthetic_identifiers\.sh' \
  || true)

if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "FAIL: personal-mailbox addresses are forbidden in committed fixtures/content/scripts; use example.com or another synthetic domain" >&2
  exit 1
fi

echo "[synthetic-identifiers] pass"
