#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): every repository file
# a runtime image copies is readable by an account that does not own it.
#
# The runtime stages drop to an unprivileged user, and COPY carries the build
# context's permission bits into the layer unchanged. Git records only the
# executable bit, so a file left owner-only on a build machine reads as clean to
# `git status`, produces no diff at all when its content is unchanged, survives
# review, and still reaches the image unreadable. The failure then surfaces as a
# permission error naming a file that is present and correct in every checkout,
# which reads as a corrupt image rather than as a mode, and no fresh clone can
# reproduce it.
#
# The images normalize modes themselves, so this gate is not what keeps a
# container working. What it adds is catching the divergence on the machine
# where it actually exists, while the shell that produced it is still the one in
# use, instead of letting it reappear silently on every later build. A restrictive
# umask set for writing a credential file and never restored is the way this
# arises: every later write in that shell is owner-only, including writes into
# this repository.
#
# The paths are read out of the Dockerfiles rather than listed here, so a newly
# copied directory is covered with no second list to keep in step.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

shopt -s nullglob
dockerfiles=(docker/*/Dockerfile)
if [ ${#dockerfiles[@]} -eq 0 ]; then
  echo "[runtime-asset-perms] FAIL: no Dockerfiles found under docker/*/" >&2
  exit 1
fi

violations=""

for df in "${dockerfiles[@]}"; do
  # Runtime-stage COPY sources: COPY lines after the final FROM (so a builder
  # stage's own copies are excluded), minus --from build-artifact copies, whose
  # source is another stage rather than this repository.
  #
  # EVERY source is taken, not just the first. A COPY line names one destination
  # last and any number of sources before it, so reading only the first field
  # silently exempted the second and later files on lines like
  # `COPY package.json package-lock.json ./` — which is precisely the shape a
  # lockfile arrives in, and precisely the file whose mode nobody thinks to
  # check. The gate's stated contract is every repository file a runtime image
  # copies, so it has to look at every one of them.
  last_from=$(grep -n '^FROM ' "$df" | tail -1 | cut -d: -f1)
  [ -n "$last_from" ] || continue
  copy_sources=$(tail -n +"$last_from" "$df" \
    | grep -E '^[[:space:]]*COPY ' \
    | grep -vE '^[[:space:]]*COPY[[:space:]]+--from' \
    | sed -E 's/^[[:space:]]*COPY[[:space:]]+//' \
    | awk '{ for (i = 1; i < NF; i++) { s = $i; sub(/\/+$/, "", s); print s } }')

  for src in $copy_sources; do
    [ -e "$src" ] || continue
    # A directory the runtime account cannot search fails exactly as a file it
    # cannot open does, so both are reported.
    found=$(find "$src" \( \( -type f ! -perm -o+r \) -o \( -type d ! -perm -o+rx \) \) \
      -printf '  %m %p\n' 2>/dev/null || true)
    if [ -n "$found" ]; then
      violations="${violations}${found}"$'\n'
    fi
  done
done

if [ -n "$violations" ]; then
  {
    echo "[runtime-asset-perms] FAIL: repository files a runtime image copies are not readable by its non-root account:"
    printf '%s' "$violations"
    echo "  Each reaches the image unreadable and fails whatever reads it."
    echo "  Git records only the executable bit, so nothing upstream of the build can see this."
    echo "  Restore the modes (files 644, directories 755), then check the shell that wrote"
    echo "  them: a umask set for a credential file and left in place makes every later write"
    echo "  in that shell owner-only. Scope it to the one command instead, as (umask 077 && cmd)."
  } >&2
  exit 1
fi
echo "[runtime-asset-perms] pass"
