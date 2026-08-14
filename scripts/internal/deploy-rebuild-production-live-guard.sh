#!/usr/bin/env bash
# Production-live refusal for the destructive database-replacing deploy.
#
# Two independent checks, both fail closed, both production-only (staging and
# development hosts are exempt: the full refresh is their normal deploy):
#
#   1. SSM marker. /footbag/production/app/production_live must read exactly
#      "false" (pre-live). "true", any other value, a missing parameter, or an
#      unreadable SSM all refuse: flipping the marker to "true" is the named
#      go-live runbook step after which the full-refresh deploy is forbidden
#      permanently, and an unreadable marker must never be mistaken for
#      permission.
#   2. Real-member tripwire, independent of the marker. The deploy refuses
#      when the on-host database already holds login-capable member accounts
#      beyond the pre-launch operator allowance, whatever the marker says.
#      THRESHOLD: more than 3 members rows with a password hash and a
#      non-persona id. The allowance covers the maintainer and admin-bootstrap
#      registrations made while proving pre-cutover production; real members
#      arrive only with the final data load, after which this deploy path is
#      dead. If the threshold is wrong the guard silently fails to protect,
#      so it lives here in the header, stated with its reasoning.
#      A missing database file or a database without a members table is a
#      fresh host and passes; a present-but-unreadable database, or missing
#      sqlite3 tooling, refuses.
#
# Invocation: prepended by scripts/deploy-rebuild.sh into the root ssh stream
# between the post-cutover guard and the remote half, so it runs on the host
# as root BEFORE any live mutation; a non-zero exit aborts the whole remote
# body. It also runs standalone for its tests, which point ENV_PATH and
# DB_PATH at fixture files.
#
# Two preludes run for every environment, before the production-only checks:
#   - Host-identity reconciliation. The workstation asserts FOOTBAG_ENV from
#     the SSH alias; if the host env file records a different value, the
#     alias is misrouted and every production-only check below would
#     silently skip, so the mismatch refuses first. A host with no recorded
#     value is a first deploy and passes.
#   - Handshake. The guard's last act sets PROD_LIVE_GUARD_RAN=1 in the
#     shared shell stream; the destructive remote half refuses to run
#     without it, so a direct invocation of the remote half cannot bypass
#     these checks.
#
# There is deliberately no in-band override. Disaster reconstruction of a live
# production host requires the documented out-of-band root steps (flip the SSM
# marker back and remove the member data), each a deliberate act.

PROD_LIVE_GUARD_ENV_PATH="${ENV_PATH:-/srv/footbag/env}"

prod_live_guard_env() {
  grep -E "^$1=" "$PROD_LIVE_GUARD_ENV_PATH" 2>/dev/null | tail -1 | cut -d= -f2-
}

PROD_LIVE_GUARD_HOST_ENV="$(prod_live_guard_env FOOTBAG_ENV)"
if [[ -n "$PROD_LIVE_GUARD_HOST_ENV" && "$PROD_LIVE_GUARD_HOST_ENV" != "${FOOTBAG_ENV:-}" ]]; then
  echo "ERROR: refusing the database-replacing deploy: the workstation asserted" >&2
  echo "       FOOTBAG_ENV='${FOOTBAG_ENV:-}' but $PROD_LIVE_GUARD_ENV_PATH records" >&2
  echo "       FOOTBAG_ENV='$PROD_LIVE_GUARD_HOST_ENV'. A misrouted SSH alias must never" >&2
  echo "       skip this host's guards. Fix the deploy target and retry." >&2
  exit 1
fi

# The host env file's FOOTBAG_DB_PATH is authoritative (the remote half
# deploys against it); the literal default is the last resort for a host
# with no env record yet. An explicit DB_PATH (the standalone fixture runs)
# wins over both.
if [[ -n "${DB_PATH:-}" ]]; then
  PROD_LIVE_GUARD_DB_PATH="$DB_PATH"
else
  PROD_LIVE_GUARD_DB_PATH="$(prod_live_guard_env FOOTBAG_DB_PATH)"
  PROD_LIVE_GUARD_DB_PATH="${PROD_LIVE_GUARD_DB_PATH:-/srv/footbag/db/footbag.db}"
fi

if [[ "${FOOTBAG_ENV:-}" == "production" ]]; then
  PROD_LIVE_AWS_PROFILE="$(prod_live_guard_env AWS_PROFILE)"
  PROD_LIVE_AWS_REGION="$(prod_live_guard_env AWS_REGION)"
  PROD_LIVE_MARKER=$(
    AWS_PROFILE="$PROD_LIVE_AWS_PROFILE" aws ssm get-parameter \
      --region "${PROD_LIVE_AWS_REGION:-us-east-1}" \
      --name "/footbag/production/app/production_live" \
      --query 'Parameter.Value' \
      --output text 2>/dev/null
  ) || PROD_LIVE_MARKER="<unreadable>"
  if [[ "$PROD_LIVE_MARKER" != "false" ]]; then
    echo "ERROR: refusing the database-replacing deploy: the production-live marker" >&2
    echo "       /footbag/production/app/production_live did not read exactly \"false\"" >&2
    echo "       (read: '$PROD_LIVE_MARKER'). Pre-live is the only state in which the" >&2
    echo "       production database may be replaced; from the go-live flip onward the" >&2
    echo "       full-refresh deploy is forbidden permanently, and a missing or" >&2
    echo "       unreadable marker refuses too (fail closed)." >&2
    echo "" >&2
    echo "       Terraform cannot fix this: the marker resource carries ignore_changes on" >&2
    echo "       its value, so an apply leaves it exactly where it is. Check what the" >&2
    echo "       marker actually reads, and move it deliberately if production really is" >&2
    echo "       still pre-live:" >&2
    echo "         scripts/production-live-marker.sh --status --profile <prod-profile>" >&2
    echo "         scripts/production-live-marker.sh --set pre-live --profile <prod-profile>" >&2
    echo "       An unreadable marker is usually the host's AWS profile, not the value." >&2
    echo "       Use scripts/deploy-code.sh for code deploys. There is no bypass flag." >&2
    exit 1
  fi

  # A host whose env file still carries the pre-migration DB location keeps
  # its database there until the remote half migrates it, which runs after
  # this guard; the tripwire inspects that location too, or an unmigrated
  # host would read as fresh and the check would silently pass. An explicit
  # DB_PATH (the standalone fixture runs) is inspected alone.
  if [[ -n "${DB_PATH:-}" ]]; then
    PROD_LIVE_GUARD_DB_CANDIDATES=("$DB_PATH")
  else
    PROD_LIVE_GUARD_DB_CANDIDATES=("$PROD_LIVE_GUARD_DB_PATH")
    if [[ "$PROD_LIVE_GUARD_DB_PATH" != "/srv/footbag/footbag.db" ]]; then
      PROD_LIVE_GUARD_DB_CANDIDATES+=("/srv/footbag/footbag.db")
    fi
  fi

  for PROD_LIVE_GUARD_DB_CANDIDATE in "${PROD_LIVE_GUARD_DB_CANDIDATES[@]}"; do
    if [[ -f "$PROD_LIVE_GUARD_DB_CANDIDATE" ]]; then
      if ! command -v sqlite3 >/dev/null 2>&1; then
        echo "ERROR: refusing the database-replacing deploy: sqlite3 is unavailable, so" >&2
        echo "       the real-member tripwire cannot inspect $PROD_LIVE_GUARD_DB_CANDIDATE" >&2
        echo "       (fail closed). Install sqlite3 on the host and retry." >&2
        exit 1
      fi
      if ! sqlite3 "file:${PROD_LIVE_GUARD_DB_CANDIDATE}?mode=ro" 'SELECT 1;' >/dev/null 2>&1; then
        echo "ERROR: refusing the database-replacing deploy: $PROD_LIVE_GUARD_DB_CANDIDATE" >&2
        echo "       exists but could not be read, so the real-member tripwire cannot" >&2
        echo "       rule out live member data (fail closed)." >&2
        exit 1
      fi
      PROD_LIVE_HAS_MEMBERS_TABLE=$(
        sqlite3 "file:${PROD_LIVE_GUARD_DB_CANDIDATE}?mode=ro" \
          "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='members';" 2>/dev/null
      ) || PROD_LIVE_HAS_MEMBERS_TABLE=""
      if [[ "$PROD_LIVE_HAS_MEMBERS_TABLE" == "1" ]]; then
        PROD_LIVE_MEMBER_COUNT=$(
          sqlite3 "file:${PROD_LIVE_GUARD_DB_CANDIDATE}?mode=ro" \
            "SELECT COUNT(*) FROM members WHERE password_hash IS NOT NULL AND id NOT LIKE 'member_persona_%';" 2>/dev/null
        ) || PROD_LIVE_MEMBER_COUNT=""
        if [[ ! "$PROD_LIVE_MEMBER_COUNT" =~ ^[0-9]+$ ]]; then
          echo "ERROR: refusing the database-replacing deploy: the real-member tripwire" >&2
          echo "       query failed against $PROD_LIVE_GUARD_DB_CANDIDATE (fail closed)." >&2
          exit 1
        fi
        if (( PROD_LIVE_MEMBER_COUNT > 3 )); then
          echo "ERROR: refusing the database-replacing deploy: the on-host database holds" >&2
          echo "       $PROD_LIVE_MEMBER_COUNT login-capable non-persona member accounts, over the" >&2
          echo "       pre-launch allowance of 3. Real member data must never be replaced" >&2
          echo "       by a rebuild, whatever the production-live marker reads. Use" >&2
          echo "       scripts/deploy-code.sh for code deploys. There is no bypass flag." >&2
          exit 1
        fi
      fi
    fi
  done
fi

# Handshake consumed by the destructive remote half: set only after every
# check above has run (or been correctly skipped below production) in this
# same shell stream.
PROD_LIVE_GUARD_RAN=1
