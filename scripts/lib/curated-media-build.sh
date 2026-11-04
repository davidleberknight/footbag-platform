#!/usr/bin/env bash
#
# Build the curated media set for the database a deploy ships, and leave the
# development stack's curated store matching that database.
#
# Before go-live the deploy builds its database in the developer's own
# database/footbag.db, so the curator rows it writes are also the rows the local
# app serves. Those rows name content-addressed files, and the local app serves
# them from .curated-build/, the store the seeder fills by default. The deploy
# ships that same folder to the media bucket with a deleting sync, so it must
# hold exactly what the database references: nothing missing, and nothing stale
# for the sync to copy up.
#
# So the seeder writes into a scratch folder first, and only a seed that
# finishes replaces the store, mirrored with deletion. A seed that fails leaves
# the store as it was, matching the rows the failed seed did not replace. The
# store is never deleted: it is the local app's only copy of any clip added
# since the last full reset, and removing it leaves rows whose files are gone.
#
# Usage, sourced:
#
#     source "${REPO_ROOT}/scripts/lib/curated-media-build.sh"
#     curated_media_build "$REPO_ROOT" "$LOCAL_DB" || exit 1
#
# Test seam: CURATED_MEDIA_SEED_CMD replaces the seeder. It is run with the
# arguments --db <path> --media-dir <scratch>, and its use is announced on
# stderr, because a stubbed run proves nothing about the real seed.
#
# Returns non-zero, with the reason on stderr, when the seed or the mirror fails.

curated_media_build() {
  local root="$1" db="$2" store scratch status=0
  local -a seed_cmd
  store="${root}/.curated-build"

  if [[ -n "${CURATED_MEDIA_SEED_CMD:-}" ]]; then
    echo "SYNTHETIC: curator seeder replaced by CURATED_MEDIA_SEED_CMD=${CURATED_MEDIA_SEED_CMD}" >&2
    seed_cmd=("$CURATED_MEDIA_SEED_CMD")
  else
    seed_cmd=("${root}/scripts/.venv/bin/python3" "${root}/scripts/seed_fh_curator.py")
  fi

  scratch="$(mktemp -d "${TMPDIR:-/tmp}/footbag-curated-build.XXXXXX")" || {
    echo "ERROR: could not create a scratch folder for the curated media build." >&2
    return 1
  }
  # An interrupt removes only the scratch folder this call made; the store is
  # untouched until the seed has finished. Ordinary returns clean up below. The
  # caller's own INT and TERM handlers (a closing report's, say) are put back
  # both on the way out and before the signal is passed on, so the caller still
  # runs its cleanup and prints its report.
  local caller_traps
  caller_traps="trap - INT TERM; $(trap -p INT TERM)"
  trap 'rm -rf -- "'"$scratch"'"; eval "$caller_traps"; kill -s INT $$' INT
  trap 'rm -rf -- "'"$scratch"'"; eval "$caller_traps"; kill -s TERM $$' TERM

  if ! "${seed_cmd[@]}" --db "$db" --media-dir "$scratch"; then
    echo "ERROR: the curator seed failed; ${store} is left as it was." >&2
    status=1
  elif ! mkdir -p -- "$store" || ! rsync -a --delete -- "${scratch}/" "${store}/"; then
    echo "ERROR: the curator seed finished but ${store} could not be refreshed from it." >&2
    echo "       The database now names files the store may not hold; re-run the seed:" >&2
    echo "         scripts/.venv/bin/python3 scripts/seed_fh_curator.py --db ${db}" >&2
    status=1
  fi

  rm -rf -- "$scratch"
  eval "$caller_traps"
  return "$status"
}
