#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): every version of every
# package, library, runtime and image this repository installs is pinned.
#
# A range, a floating tag or an unlocked install lets an upstream release reach
# a build, a CI run or a workstation without anybody deciding it should, and two
# machines built from one commit then run different code with nothing recording
# which. Each refusal below names a form that did exactly that here.
#
#   package.json   every dependency, devDependency and override is an exact
#                  version, never a range; the lockfile pins what they pull in.
#   pip install    reads a hash-pinned requirements file (pip-tools output) with
#                  --require-hashes, never bare names, which leave the closure
#                  floating; the flag makes pip refuse any unhashed line.
#   CI runners     name a release (ubuntu-24.04), never *-latest, which moves to
#                  a new operating system on the provider's schedule.
#   images         a remote image a script runs is pinned by digest; a tag can be
#                  moved to different bytes. Dockerfiles and compose are checked by
#                  check_dockerfile_hardening.sh.
#   npx --yes      names an exact version; without one it fetches the newest.
#
# Scope is the files git tracks or would track, so a fixture repository can be
# checked the same way this one is.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

command -v jq >/dev/null 2>&1 || { echo "[version-pins] FAIL: jq is required to read package.json." >&2; exit 1; }

violations=""
add() { violations="${violations}  $1\n"; }

mapfile -t FILES < <(git ls-files --cached --others --exclude-standard)

# The runtime pin files must reach every checkout: CI and the clean room read
# them, and an ignored one is simply absent there.
for pin_file in .nvmrc .python-version; do
  [[ -f "$pin_file" ]] || { add "${pin_file} is missing; it pins the runtime CI and the local runners read"; continue; }
  git check-ignore -q "$pin_file" && add "${pin_file} is gitignored, so it never reaches CI or the clean room"
done

# Code lines only: a line whose first non-blank character is # is a comment.
code_lines() {
  grep -nE "$1" "$2" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*#' || true
}

# ── package.json ─────────────────────────────────────────────────────────────
if [[ -f package.json ]]; then
  while IFS=$'\t' read -r name version; do
    [[ -n "$name" ]] || continue
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
      add "package.json: ${name} is \"${version}\", not an exact version"
    fi
  done < <(jq -r '
    [(.dependencies // {}), (.devDependencies // {}), (.optionalDependencies // {}), (.overrides // {})]
    | map(to_entries[]) | .[]
    | select(.value | type == "string")
    | "\(.key)\t\(.value)"' package.json)
fi

for file in "${FILES[@]}"; do
  case "$file" in
    *.sh|*.bash|*.yml|*.yaml|*Dockerfile*) ;;
    *) continue ;;
  esac
  # This file's own patterns describe the forms it refuses.
  [[ "$file" == "scripts/ci/check_version_pins.sh" ]] && continue
  [[ -f "$file" ]] || continue

  # ── pip install ────────────────────────────────────────────────────────────
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    if ! [[ "$hit" == *"--require-hashes"* ]] || ! [[ "$hit" =~ -r[[:space:]]+[^[:space:]] ]]; then
      add "${file}:${hit%%:*}: pip install must read a hash-pinned requirements file with --require-hashes"
    fi
  done < <(code_lines 'pip3?"?[[:space:]]+install' "$file")

  # ── CI runners ─────────────────────────────────────────────────────────────
  case "$file" in
    .github/workflows/*)
      while IFS= read -r hit; do
        [[ -n "$hit" ]] && add "${file}:${hit%%:*}: runs-on names a moving image; name a release such as ubuntu-24.04"
      done < <(code_lines 'runs-on:[[:space:]]*[a-z]+-latest' "$file")
      ;;
  esac

  # ── images run by scripts ──────────────────────────────────────────────────
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    [[ "$hit" == *"@sha256:"* ]] || add "${file}:${hit%%:*}: a remote image must be pinned by digest (@sha256:...)"
  done < <(code_lines '[A-Z_]*IMAGE="?[a-z0-9.-]+/' "$file")
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    [[ "$hit" == *"@sha256:"* || "$hit" == *'@${'* ]] || add "${file}:${hit%%:*}: a remote image must be pinned by digest (@sha256:...)"
  done < <(code_lines 'docker[[:space:]]+(run|pull)[^#]*[[:space:]"][a-z0-9.-]+/[a-z0-9._/-]+:[A-Za-z0-9._${}-]+' "$file")

  # ── npx --yes ──────────────────────────────────────────────────────────────
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    [[ "$hit" =~ npx[[:space:]]+(--yes|-y)[[:space:]]+(@?[A-Za-z0-9._/-]+)@[0-9] ]] \
      || add "${file}:${hit%%:*}: npx --yes must name an exact version (package@x.y.z)"
  done < <(code_lines 'npx[[:space:]]+(--yes|-y)[[:space:]]' "$file")
done

if [[ -n "$violations" ]]; then
  printf 'unpinned versions:\n%b' "$violations" >&2
  echo "[version-pins] FAIL: every package, library, runtime and image is pinned to an exact version" >&2
  exit 1
fi
echo "[version-pins] pass (${#FILES[@]} files scanned)"
