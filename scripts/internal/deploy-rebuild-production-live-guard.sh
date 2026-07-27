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
# There is deliberately no in-band override. Disaster reconstruction of a live
# production host requires the documented out-of-band root steps (flip the SSM
# marker back and remove the member data), each a deliberate act.

PROD_LIVE_GUARD_ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
PROD_LIVE_GUARD_DB_PATH="${DB_PATH:-/srv/footbag/db/footbag.db}"

if [[ "${FOOTBAG_ENV:-}" == "production" ]]; then
  prod_live_guard_env() {
    grep -E "^$1=" "$PROD_LIVE_GUARD_ENV_PATH" 2>/dev/null | tail -1 | cut -d= -f2-
  }
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
    echo "       unreadable marker refuses too (fail closed). If production is still" >&2
    echo "       pre-live, run terraform apply for the production tree (which seeds the" >&2
    echo "       marker \"false\") or fix the host's AWS profile, then retry. Use" >&2
    echo "       scripts/deploy-code.sh for code deploys. There is no bypass flag." >&2
    exit 1
  fi

  if [[ -f "$PROD_LIVE_GUARD_DB_PATH" ]]; then
    if ! command -v sqlite3 >/dev/null 2>&1; then
      echo "ERROR: refusing the database-replacing deploy: sqlite3 is unavailable, so" >&2
      echo "       the real-member tripwire cannot inspect $PROD_LIVE_GUARD_DB_PATH" >&2
      echo "       (fail closed). Install sqlite3 on the host and retry." >&2
      exit 1
    fi
    if ! sqlite3 "file:${PROD_LIVE_GUARD_DB_PATH}?mode=ro" 'SELECT 1;' >/dev/null 2>&1; then
      echo "ERROR: refusing the database-replacing deploy: $PROD_LIVE_GUARD_DB_PATH" >&2
      echo "       exists but could not be read, so the real-member tripwire cannot" >&2
      echo "       rule out live member data (fail closed)." >&2
      exit 1
    fi
    PROD_LIVE_HAS_MEMBERS_TABLE=$(
      sqlite3 "file:${PROD_LIVE_GUARD_DB_PATH}?mode=ro" \
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='members';" 2>/dev/null
    ) || PROD_LIVE_HAS_MEMBERS_TABLE=""
    if [[ "$PROD_LIVE_HAS_MEMBERS_TABLE" == "1" ]]; then
      PROD_LIVE_MEMBER_COUNT=$(
        sqlite3 "file:${PROD_LIVE_GUARD_DB_PATH}?mode=ro" \
          "SELECT COUNT(*) FROM members WHERE password_hash IS NOT NULL AND id NOT LIKE 'member_persona_%';" 2>/dev/null
      ) || PROD_LIVE_MEMBER_COUNT=""
      if [[ ! "$PROD_LIVE_MEMBER_COUNT" =~ ^[0-9]+$ ]]; then
        echo "ERROR: refusing the database-replacing deploy: the real-member tripwire" >&2
        echo "       query failed against $PROD_LIVE_GUARD_DB_PATH (fail closed)." >&2
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
fi
