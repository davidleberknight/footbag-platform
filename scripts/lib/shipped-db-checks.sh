#!/usr/bin/env bash
# scripts/lib/shipped-db-checks.sh -- every data-quality check, run on the
# database a production deploy is about to ship.
#
# Sourced, never run. A production deploy that ships a database refuses one that
# fails any data-quality check or carries development residue, and this file is
# the one place that set is named. scripts/deploy-rebuild.sh calls it on a
# production ship, after the last step that writes the file and before anything
# reaches the host, so it judges the file exactly as shipped. Staging is held to
# none of it: staging is where uncommitted work is tried, and it seeds the test
# personas the residue audit refuses.
#
# The checks, each run against the path given rather than whatever the caller's
# environment names:
#   - a member load is present: at least one account imported from the legacy
#     site, because a production database without one is not the migration load;
#   - the legacy import gates, where the "no member load" exit is a failure too;
#   - the real-data invariants;
#   - the club candidate, bootstrap leader and name variant gates;
#   - the showcase event and its system member;
#   - a safety verdict on every gallery external link, since an unverified link
#     is hidden from the public;
#   - the residue audit (test personas, developer grants, developer settings);
#   - the honours flags traced to the rosters;
#   - the member-data audits against the figures audited for the delivery.
#
# REFUSED: any check failing or not able to run. No check is a warning. Every
# check runs, so one refusal lists every failure rather than the first.
#
# Output is withheld for a check whose output carries an address, which then
# fails, because a deploy's output is what a wrapper, a CI job or an agent
# session captures.
#
# TEST SEAM: the repository root is an argument, so a suite points it at a
# throwaway tree of stand-in checks; the interpreter follows python-env.sh's own
# seam, FOOTBAG_REPO_ROOT, which announces itself on stderr.

_SDC_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-env.sh
source "${_SDC_LIB_DIR}/python-env.sh"

# _sdc_run <label> <root> <db> <command...>
# Runs one check from the repository root with the database named for it, and
# records a failure in SDC_FAILED. The import gates' "no member load" exit is
# named rather than reported as a bare status.
_sdc_run() {
  local label="$1" root="$2" db="$3"
  shift 3
  local out rc
  # The status is taken in the same list, so a caller running under errexit
  # records a failing check rather than exiting on it.
  out="$(cd -- "$root" && FOOTBAG_DB_PATH="$db" PYTHONDONTWRITEBYTECODE=1 "$@" 2>&1)" && rc=0 || rc=$?
  if grep -q '@' <<< "$out"; then
    echo "  FAIL ${label}: output withheld because it carries an address; run the check by hand on this machine" >&2
    SDC_FAILED+=("${label}")
    return 0
  fi
  [[ -n "$out" ]] && sed 's/^/      /' <<< "$out" >&2
  if (( rc == 0 )); then
    echo "  PASS ${label}" >&2
  elif (( rc == 78 )) && [[ "$label" == "legacy import gates" ]]; then
    echo "  FAIL ${label}: the database carries no member load" >&2
    SDC_FAILED+=("${label}")
  else
    echo "  FAIL ${label} (exit ${rc})" >&2
    SDC_FAILED+=("${label}")
  fi
  return 0
}

# _sdc_member_load <db>
# Succeeds when at least one account was imported from the legacy site.
_sdc_member_load() {
  local n
  n="$(sqlite3 -readonly "$1" \
    "SELECT COUNT(*) FROM legacy_members WHERE import_source = 'legacy_site_data';" 2>&1)" || {
    echo "the account table could not be read"
    return 1
  }
  echo "${n} accounts imported from the legacy site"
  [[ "$n" =~ ^[0-9]+$ ]] && (( n > 0 ))
}

# shipped_db_checks <repo-root> <db-path>
# Runs every check on the database at <db-path>. Returns 1 when any fails.
shipped_db_checks() {
  local root="$1" db="$2" py=""
  SDC_FAILED=()
  if [[ ! -f "$db" ]]; then
    echo "ERROR: the database to ship is not at ${db}" >&2
    return 1
  fi
  local scripts="${root}/scripts" mds="${root}/legacy_data/member_data_scripts"
  echo "==> Data-quality checks on the database to ship (${db}):" >&2
  _sdc_run "member load present" "$root" "$db" _sdc_member_load "$db"
  _sdc_run "legacy import gates" "$root" "$db" bash "${scripts}/validate-legacy-import-gates.sh"
  _sdc_run "real-data invariants" "$root" "$db" bash "${scripts}/validate-realdata-ri.sh"
  _sdc_run "club candidates" "$root" "$db" bash "${scripts}/validate-club-candidates.sh"
  _sdc_run "bootstrap leaders" "$root" "$db" bash "${scripts}/validate-bootstrap-leaders.sh"
  _sdc_run "name variants" "$root" "$db" bash "${scripts}/validate-name-variants.sh"
  _sdc_run "showcase presence" "$root" "$db" bash "${scripts}/validate-showcase-presence.sh"
  _sdc_run "gallery link verdicts" "$root" "$db" bash "${scripts}/validate-gallery-link-verdicts.sh"
  _sdc_run "development residue" "$root" "$db" bash "${scripts}/audit-dev-shortcuts.sh"
  if py="$(footbag_python pipeline fail)"; then
    _sdc_run "honours flags" "$root" "$db" "$py" "${mds}/validate_legacy_honors.py" \
      --flags-from-db --db "$db" \
      --hof-csv "${root}/legacy_data/inputs/hof.csv" \
      --bap-csv "${root}/legacy_data/inputs/bap_data_updated.csv"
    _sdc_run "member-data audits" "$root" "$db" "$py" "${mds}/audit_member_data.py" --db "$db"
  else
    echo "  FAIL honours flags and member-data audits: the legacy-data Python environment is missing" >&2
    SDC_FAILED+=("honours flags" "member-data audits")
  fi
  if (( ${#SDC_FAILED[@]} > 0 )); then
    echo "ERROR: this database may not ship to production; ${#SDC_FAILED[@]} check(s) failed:" >&2
    printf '  - %s\n' "${SDC_FAILED[@]}" >&2
    return 1
  fi
  echo "==> Data-quality checks: every check passed on the database to ship." >&2
  return 0
}
