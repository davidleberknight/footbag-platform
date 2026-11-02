#!/usr/bin/env bash
# run_legacy_delivery.sh -- process one legacy webmaster delivery, end to end, in order.
#
# Why it exists: the final refresh at the cutover freeze must be one sequence that
# has already run unchanged against a real delivery. Each step below was once run
# by hand, and every skipped or reordered step looked like success until the member
# load: a deploy started before the publish, figures carried forward from an older
# delivery, rulings fitted to another export. This runs the steps in their only
# correct order and stops at the first one that needs a person, saying what.
#
# What it runs, in order:
#   1. the refresh over the pulled delivery, then the refresh again, and refuses
#      unless the second run leaves every export file byte-identical;
#   2. the publish, with the cutover date given (never the run day);
#   3. the member-data checks that need no database (audit --pre-build), which fail
#      when the audited figures were not re-audited for this delivery;
#   4. the local data build with the member load and the final-load gate, exactly
#      as the cutover load runs it, so a membership-only person left without a
#      link or a recorded decision fails here, not on production;
#   5. the account-ruling re-fit check, which lists every ruling to restamp or for
#      a person.
#
# What it refuses to do: it never commits, pushes or pulls anywhere (the
# maintainer pulls the delivery and commits each repository after review), never
# applies a re-fit or edits a ruling or a figure (those are decisions, made through
# the legacy-delivery skill and recorded in their files), and never deploys. Step 4
# replaces the local development database.
#
# Usage:
#   bash legacy_data/scripts/run_legacy_delivery.sh --cutover-date YYYY-MM-DD
#
#   --cutover-date   the moment annual memberships are measured against: the freeze
#                    date at the cutover, the previous publish's date in a rehearsal.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"
cd "${REPO_ROOT}"
# shellcheck source=../../scripts/lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

CUTOVER_DATE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cutover-date) CUTOVER_DATE="${2:-}"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "run_legacy_delivery: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ ! "${CUTOVER_DATE}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "run_legacy_delivery: --cutover-date YYYY-MM-DD is required (the freeze date at" >&2
  echo "  the cutover; in a rehearsal, the previous publish's date)." >&2
  exit 2
fi

PY="${REPO_ROOT}/legacy_data/footbag_venv/bin/python"
[[ -x "${PY}" ]] || cr_die "the legacy Python environment is missing; run bash legacy_data/run_pipeline.sh venv"
[[ -d "${REPO_ROOT}/footbag_private_repo" ]] \
  || cr_die "the private checkout (footbag_private_repo) is not reachable; wire it with scripts/setup_private_repo.sh"
[[ -d "${REPO_ROOT}/footbag_legacy_repo" ]] \
  || cr_die "the legacy clone (footbag_legacy_repo) is not on this machine; the refresh reads it"
EXPORT="${REPO_ROOT}/footbag_private_repo/legacy-export"

export_checksums() {
  find "${EXPORT}" -type f -print0 | xargs -0 sha256sum | sort -k2
}

echo "==> 1. refresh the pulled delivery"
cr_run "refresh" -- "${PY}" legacy_data/scripts/refresh_legacy_repo_data.py \
  || cr_die "the refresh refused the delivery; its message above names why (a new module, table or column is held for a person to classify with --accept-new)"
FIRST="$(mktemp)"; cr_cleanup rm -f "${FIRST}"
export_checksums > "${FIRST}"

echo "==> 1b. refresh again: a second run over the same delivery must change nothing"
cr_run "second refresh" -- "${PY}" legacy_data/scripts/refresh_legacy_repo_data.py \
  || cr_die "the second refresh failed"
if export_checksums | cmp -s - "${FIRST}"; then
  cr_proved "the refresh is repeatable: a second run left every export file byte-identical"
else
  cr_die "the second refresh changed the export; the refresh is not repeatable over this delivery"
fi

# The refresh writes its findings report against the last committed delivery. Over
# a delivery that is already committed, that report says nothing changed and would
# replace the committed one, which is the record of what the delivery changed. When
# the export data matches what is committed, keep the committed report.
PRIV="${REPO_ROOT}/footbag_private_repo"
REPORTS=(legacy-export/REFRESH_REPORT.md legacy-export/REFRESH_REPORT_DETAIL.tsv)
if git -C "${PRIV}" diff --quiet -- legacy-export \
    ":(exclude)${REPORTS[0]}" ":(exclude)${REPORTS[1]}" \
    && git -C "${PRIV}" cat-file -e "HEAD:${REPORTS[0]}" 2>/dev/null; then
  for_report="${REPORTS[0]}"; git -C "${PRIV}" show "HEAD:${for_report}" > "${PRIV}/${for_report}"
  for_report="${REPORTS[1]}"; git -C "${PRIV}" show "HEAD:${for_report}" > "${PRIV}/${for_report}"
  cr_proved "this delivery is already committed; its committed findings report is kept"
fi

echo "==> 2. publish for cutover date ${CUTOVER_DATE}"
cr_run "publish" -- "${PY}" legacy_data/scripts/publish_legacy_repo_data.py \
  --cutover-date "${CUTOVER_DATE}" || cr_die "the publish refused; its message above names why"

echo "==> 3. member-data checks that need no database"
if ! cr_run "pre-build audit" -- "${PY}" legacy_data/member_data_scripts/audit_member_data.py --pre-build; then
  cr_die "re-audit the figures this delivery moved (legacy-publish/audit/audited_figures.json in the private checkout, with its export_sha256), then re-run"
fi

echo "==> 4. local data build with the member load and the final-load gate"
# The shared failure grammar reads any "violation" as an error, but the build's
# gates print their passing count as "violations: 0". Here a violation line is an
# error only when it counts one or more; every other failure word still counts.
BUILD_ERRORS="${FOOTBAG_FAILURE_GRAMMAR//\[Vv\]iolat|VIOLAT|/}|[1-9][0-9]* violations?|violations?: *[1-9]"
if cr_run --errors "${BUILD_ERRORS}" "member-load rehearsal" -- env FOOTBAG_DATA_BUILD_ENTRY=run_dev \
    bash scripts/deploy-local-data.sh --all-data --apply-members --final-load; then
  cr_proved "the final-load rehearsal passed every member-data audit with nobody awaiting a decision"
else
  cr_error "the final-load rehearsal did not pass; the account rulings below, or the build's own message above, say what needs a person"
fi

echo "==> 5. account rulings against this delivery"
if [[ -s "${REPO_ROOT}/legacy_data/member_data_scripts/out/legacy_members_final.csv" ]]; then
  if cr_run "ruling re-fit check" -- "${PY}" legacy_data/member_data_scripts/refit_rulings.py; then
    cr_proved "every recorded account ruling fits this delivery"
  else
    cr_error "rulings need restamping (refit_rulings.py --apply) or a person; see the list above"
  fi
else
  cr_unproved "the account rulings were not checked: the build stopped before the member CSV was written"
fi

cr_unproved "nothing was committed or deployed: review and commit each repository, then deploy staging"
cr_finish
