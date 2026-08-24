#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): the container
# hardening properties the design requires, asserted mechanically so none of
# them can be dropped by an edit that looks harmless.
#
# Every property here was absent at some point and had to be added deliberately,
# which is exactly the kind of thing that regresses quietly: a Dockerfile that
# forgets its USER still builds and runs, a floating base tag still pulls, and a
# compose service missing its capability drop still starts. Only a gate notices.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=""
note() { violations="${violations}$1\n"; }

# ── Dockerfiles ──────────────────────────────────────────────────────────────
shopt -s nullglob
dockerfiles=(docker/*/Dockerfile)
if [ ${#dockerfiles[@]} -eq 0 ]; then
  echo "[dockerfile-hardening] FAIL: no Dockerfiles found under docker/*/" >&2
  exit 1
fi

for df in "${dockerfiles[@]}"; do
  # Base images pinned by digest. A tag can be repointed at different bytes by
  # whoever controls the upstream repository; a digest cannot.
  digests=""
  while IFS= read -r from_line; do
    ref=$(printf '%s\n' "$from_line" | sed -E 's/^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+//; s/[[:space:]]+[Aa][Ss][[:space:]]+.*$//; s/[[:space:]]*$//')
    case "$ref" in
      # A later stage building on an earlier one by name carries no image ref.
      builder|runtime) continue ;;
    esac
    after="${ref##*@}"
    if [ "$after" = "$ref" ] || ! printf '%s' "$after" | grep -qE '^sha256:[0-9a-f]{64}$'; then
      note "${df}: FROM ${ref} is not pinned by @sha256 digest"
    else
      digests="${digests}${after}\n"
    fi
  done < <(grep -iE '^[[:space:]]*FROM[[:space:]]' "$df" || true)

  # Both stages of one file must share a digest: the runtime stage reuses native
  # code compiled in the builder, so two different bases could pair binaries
  # with a C library they were not built against.
  distinct=$(printf '%b' "$digests" | grep -c . || true)
  unique=$(printf '%b' "$digests" | sort -u | grep -c . || true)
  if [ "$distinct" -gt 1 ] && [ "$unique" -ne 1 ]; then
    note "${df}: build stages pin different base digests (native addons are copied between them)"
  fi

  # A runtime USER, declared after the last FROM so it applies to the shipped
  # stage rather than a discarded builder.
  last_from=$(grep -niE '^[[:space:]]*FROM[[:space:]]' "$df" | tail -1 | cut -d: -f1)
  user_line=$(grep -niE '^[[:space:]]*USER[[:space:]]' "$df" | tail -1 | cut -d: -f1 || true)
  if [ -z "$user_line" ]; then
    note "${df}: no USER directive (the container would run as root)"
  elif [ "$user_line" -lt "$last_from" ]; then
    note "${df}: USER is declared before the final FROM, so the runtime stage still runs as root"
  fi

  # Repository files copied into the shipped stage carry the build context's
  # permission bits, and the account declared above owns none of them. Git
  # records only the executable bit, so an owner-only file reads as clean
  # everywhere upstream and still reaches the image unreadable; the build is the
  # only place the mode can be guaranteed. Copies sourced from another stage are
  # exempt: their content is produced by the build rather than carried in from
  # somebody's filesystem.
  # Each grep legitimately matches nothing on some Dockerfile, and a bare
  # non-zero under `set -e` with `pipefail` would abort the gate silently rather
  # than report the case it is looking for.
  repo_copy_line=$(grep -niE '^[[:space:]]*COPY[[:space:]]' "$df" \
    | grep -viE 'COPY[[:space:]]+--from' \
    | cut -d: -f1 \
    | awk -v start="$last_from" '$1+0 > start+0 { last = $1 } END { if (last) print last }' || true)
  if [ -n "$repo_copy_line" ]; then
    normalize_line=$(grep -niE 'chmod' "$df" \
      | grep -vE '^[0-9]+:[[:space:]]*#' \
      | cut -d: -f1 \
      | awk -v start="$repo_copy_line" '$1+0 > start+0 { last = $1 } END { if (last) print last }' || true)
    first_normalize_line=$(grep -niE 'chmod' "$df" \
      | grep -vE '^[0-9]+:[[:space:]]*#' \
      | cut -d: -f1 \
      | awk -v start="$repo_copy_line" '$1+0 > start+0 { print $1; exit }' || true)
    if [ -z "$normalize_line" ]; then
      note "${df}: copies repository paths into the shipped stage but never normalizes their modes, so the build context's permission bits reach the image where the non-root account owns none of them"
    elif [ -n "$user_line" ] && [ "$normalize_line" -gt "$user_line" ]; then
      note "${df}: normalizes copied-file modes after its USER line, where the step runs unprivileged and cannot change files it does not own"
    else
      # A chmod EXISTING is not the same as a chmod COVERING. Checking only that
      # the word appears somewhere below the copies passes a Dockerfile whose
      # only mode change touches an unrelated path, which is a gate that reports
      # safety it never checked. Every source named on a repository COPY has to
      # appear in the normalizing step, and every source on the line is checked,
      # not just the first: a lockfile arrives as the second name on its COPY.
      normalize_text=$(tail -n +"$first_normalize_line" "$df" | grep -vE '^[[:space:]]*#' || true)
      copy_sources=$(tail -n +"$last_from" "$df" \
        | grep -E '^[[:space:]]*COPY[[:space:]]' \
        | grep -vE '^[[:space:]]*COPY[[:space:]]+--from' \
        | sed -E 's/^[[:space:]]*COPY[[:space:]]+//' \
        | awk '{ for (i = 1; i < NF; i++) { s = $i; sub(/\/+$/, "", s); print s } }' \
        | sort -u)
      for src in $copy_sources; do
        case "$normalize_text" in
          *"$src"*) ;;
          *) note "${df}: copies ${src} into the shipped stage but its mode-normalizing step does not cover it, so that path reaches the image with whatever bits the build context carried" ;;
        esac
      done
    fi
  fi

  # A long-running image describes its own liveness.
  if ! grep -qiE '^[[:space:]]*HEALTHCHECK[[:space:]]' "$df"; then
    note "${df}: no HEALTHCHECK"
  fi

  # The build toolchain belongs in the builder stage only. Anything after the
  # final FROM that installs a compiler has put one in the shipped image.
  if [ -n "$last_from" ]; then
    runtime_toolchain=$(tail -n +"$last_from" "$df" | grep -nE 'apk[[:space:]]+add' | grep -E '(^|[[:space:]])(g\+\+|make|python3)([[:space:]]|$)' || true)
    if [ -n "$runtime_toolchain" ]; then
      note "${df}: the runtime stage installs a build toolchain (g++/make/python3); build in the builder stage and copy the result"
    fi
  fi
done

# ── Build context ────────────────────────────────────────────────────────────
# Without this file the whole repository is sent to the daemon, including the
# real environment file and the working database.
if [ ! -f .dockerignore ]; then
  note ".dockerignore is missing (the build context would be the entire repository)"
else
  # The first rule that is not a comment or a blank line must be the catch-all,
  # so the file denies by default and every admitted path is named after it.
  first_rule=$(grep -vE '^[[:space:]]*(#|$)' .dockerignore | head -1 | tr -d '[:space:]')
  if [ "$first_rule" != "*" ]; then
    note ".dockerignore's first rule is '${first_rule}', not '*' (it must deny by default and re-admit named paths)"
  fi
fi

# ── Compose ──────────────────────────────────────────────────────────────────
COMPOSE=docker/docker-compose.yml
if [ ! -f "$COMPOSE" ]; then
  note "${COMPOSE} not found"
else
  # Any image pulled rather than built is pinned the same way as a FROM.
  while IFS= read -r img; do
    ref=$(printf '%s\n' "$img" | sed -E 's/^[[:space:]]*image:[[:space:]]*//; s/[[:space:]]*#.*$//; s/[[:space:]]*$//')
    after="${ref##*@}"
    if [ "$after" = "$ref" ] || ! printf '%s' "$after" | grep -qE '^sha256:[0-9a-f]{64}$'; then
      note "${COMPOSE}: image ${ref} is not pinned by @sha256 digest"
    fi
  done < <(grep -E '^[[:space:]]*image:[[:space:]]' "$COMPOSE" || true)

  # One declaration per service of each. Counting is enough: the file is small
  # and reviewed, and a count mismatch is the signal that a service was added
  # without them.
  service_count=$(grep -cE '^  [a-z][a-z0-9_-]*:$' "$COMPOSE" || true)
  nnp_count=$(grep -cE '^[[:space:]]*-[[:space:]]*no-new-privileges:true[[:space:]]*$' "$COMPOSE" || true)
  capdrop_count=$(grep -cE '^[[:space:]]*cap_drop:[[:space:]]*$' "$COMPOSE" || true)
  if [ "$nnp_count" -lt "$service_count" ]; then
    note "${COMPOSE}: ${nnp_count} services declare no-new-privileges but ${service_count} services exist"
  fi
  if [ "$capdrop_count" -lt "$service_count" ]; then
    note "${COMPOSE}: ${capdrop_count} services declare cap_drop but ${service_count} services exist"
  fi
fi

if [ -n "$violations" ]; then
  printf 'container hardening violations:\n%b' "$violations" >&2
  echo "[dockerfile-hardening] FAIL: see the violations above" >&2
  exit 1
fi
echo "[dockerfile-hardening] pass"
