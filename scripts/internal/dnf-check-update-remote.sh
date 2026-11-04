# shellcheck shell=bash
#
# scripts/internal/dnf-check-update-remote.sh -- the host-side count of the
# packages `dnf check-update` lists for one Amazon Linux release.
#
# Sent on the ssh stream behind scripts/lib/closing-report-remote.sh and ahead
# of a remote half that counts what a release step would change, the way
# scripts/internal/host-tool-versions-remote.sh travels. Defines functions and
# runs nothing, so it can travel on the wire like the other helpers there.
#
# Why it exists: two halves read the same listing, the host bootstrap's release
# preview and the release step's preview and "nothing left to install" proof,
# and one of them once counted with a grep whose zero matches went unreported.
# `dnf check-update` exits 100 when it lists updates, 0 when there are none and 1
# on an error. Exit 100 with no row this parser can count means the listing has
# a layout it does not understand, so that is an error, never a count of 0: a
# step would otherwise be judged complete, or a confirmation shown "0 packages",
# over updates that exist.
#
# What a row is: one "name.arch version repository" line. The section dnf heads
# "Obsoleting Packages", which follows the updates, names packages a release
# replaces and the installed ones they replace; its rows are not updates and are
# not counted.

# dnf_check_update_rows <listing-file>
# Prints how many update rows the saved listing holds.
dnf_check_update_rows() {
  sed '/^Obsoleting/,$d' "$1" \
    | grep -cE '^[^[:space:]]+\.[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]*$' \
    || [[ $? == 1 ]]
}

# dnf_check_update <releasever> [<context>]
# Runs `dnf check-update` against the release and sets DNF_UPDATE_COUNT and
# DNF_UPDATE_LISTING. On a failed run, or exit 100 with nothing countable, marks
# the error with crr_error (the context, when given, appended after a semicolon)
# and returns 1.
DNF_UPDATE_COUNT=""
DNF_UPDATE_LISTING=""
dnf_check_update() {
  local release="$1" context="${2:-}" rc=0 listing_file
  DNF_UPDATE_COUNT=""
  DNF_UPDATE_LISTING="$(dnf check-update -q --releasever="$release" 2>&1)" || rc=$?
  case "$rc" in
    0)
      DNF_UPDATE_COUNT=0
      return 0
      ;;
    100)
      listing_file="$(mktemp)"
      printf '%s\n' "$DNF_UPDATE_LISTING" > "$listing_file"
      DNF_UPDATE_COUNT="$(dnf_check_update_rows "$listing_file")"
      rm -f "$listing_file"
      if (( DNF_UPDATE_COUNT > 0 )); then
        return 0
      fi
      DNF_UPDATE_COUNT=""
      crr_error "dnf check-update --releasever=${release} said there are updates and listed none this parser can count${context:+; ${context}}"
      return 1
      ;;
    *)
      crr_error "dnf check-update --releasever=${release} failed (exit ${rc}): ${DNF_UPDATE_LISTING##*$'\n'}${context:+; ${context}}"
      return 1
      ;;
  esac
}
