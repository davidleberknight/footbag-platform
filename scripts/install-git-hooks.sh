#!/usr/bin/env bash
# Activate this repository's git hooks on the machine you are sitting at.
#
# The hooks are committed under .githooks/, but git does not look there by
# default: it looks inside the repository's own git directory, which holds only
# the sample templates git writes at init time. So a freshly cloned checkout
# ships the hooks and runs none of them, and nothing about that is visible —
# committing and pushing simply work, quietly unguarded. This script is how the
# switch gets thrown, so it is a step someone runs rather than a command someone
# has to remember.
#
# Idempotent: running it twice is the same as running it once. It verifies the
# result rather than assuming it, and reports what each hook will and will not be
# able to do on this machine.
set -euo pipefail
cd "$(dirname "$0")/.."

HOOKS_DIR=".githooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: $HOOKS_DIR does not exist; run this from a full checkout." >&2
  exit 1
fi

echo "→ Activating repository git hooks"

current="$(git config --get core.hooksPath || true)"
if [ "$current" = "$HOOKS_DIR" ]; then
  echo "  hooks path already points at $HOOKS_DIR"
else
  [ -n "$current" ] && echo "  hooks path was: $current"
  git config core.hooksPath "$HOOKS_DIR"
  echo "  hooks path set to $HOOKS_DIR"
fi

# A hook that is not executable is skipped by git in silence, which is the same
# failure as not having it, so make it so rather than reporting on it.
for hook in "$HOOKS_DIR"/*; do
  [ -f "$hook" ] || continue
  if [ ! -x "$hook" ]; then
    chmod +x "$hook"
    echo "  made executable: $(basename "$hook")"
  fi
done

# Verify rather than assume.
verified="$(git config --get core.hooksPath || true)"
if [ "$verified" != "$HOOKS_DIR" ]; then
  echo "ERROR: hooks path is '$verified' after configuring it; activation failed." >&2
  exit 1
fi

echo
echo "  Active hooks:"
for hook in "$HOOKS_DIR"/*; do
  [ -f "$hook" ] || continue
  echo "    $(basename "$hook")"
done

# The commit-time scan degrades to a warning when no scanner is installed, which
# is the right behaviour for a hook that must not block every commit on a machine
# without the tool. Say so plainly here, because a warning nobody was told to
# expect reads as noise and gets ignored.
echo
if command -v gitleaks >/dev/null 2>&1; then
  echo "  Secret scanner: gitleaks on PATH. Commits will be scanned and refused on a finding."
elif command -v docker >/dev/null 2>&1; then
  echo "  Secret scanner: docker. Commits will be scanned and refused on a finding."
else
  echo "  Secret scanner: NOT AVAILABLE on this machine."
  echo "  The commit hook will warn and allow rather than block. Install gitleaks,"
  echo "  or start docker, for the commit-time scan to actually protect you."
fi

echo
echo "  Done. To undo: git config --unset core.hooksPath"
