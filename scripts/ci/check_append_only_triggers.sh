#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): every append-only /
# immutability trigger that DATA_MODEL §7 documents as intentionally retained
# must exist in database/schema.sql. A schema refactor or table rebuild that
# silently drops one removes a permanent immutability guard on an audit, ballot,
# tier-grant, payment, vouch, or config ledger, corrupting a record that must
# never change. The canonical list below mirrors the 26 triggers in DATA_MODEL
# §7; when a new immutable ledger is introduced, add its trigger to both places.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
SCHEMA="database/schema.sql"

triggers=(
  trg_vote_eligibility_no_update trg_vote_eligibility_no_delete
  trg_ballots_no_update trg_ballots_no_delete
  trg_audit_no_update trg_audit_no_delete
  trg_erasure_log_no_update trg_erasure_log_no_delete
  trg_recurring_sub_transitions_no_update trg_recurring_sub_transitions_no_delete
  trg_payment_transitions_no_update trg_payment_transitions_no_delete
  trg_tier_grants_no_update trg_tier_grants_no_delete
  trg_system_config_no_update trg_system_config_no_delete
  trg_active_player_vouches_no_update trg_active_player_vouches_no_delete
  trg_active_player_grants_no_update trg_active_player_grants_no_delete
  trg_active_player_reminder_sent_no_update trg_active_player_reminder_sent_no_delete
  trg_vote_options_lock_insert trg_vote_options_lock_update trg_vote_options_lock_delete
  trg_payments_status_monotonicity
)

missing=""
for t in "${triggers[@]}"; do
  if ! grep -qE "CREATE TRIGGER ${t}([^A-Za-z0-9_]|$)" "$SCHEMA"; then
    missing="${missing}${t}\n"
  fi
done

if [ -n "$missing" ]; then
  printf 'missing append-only triggers:\n%b' "$missing" >&2
  echo "[append-only-triggers] FAIL: database/schema.sql is missing a documented append-only/immutability trigger (DATA_MODEL §7)" >&2
  exit 1
fi
echo "[append-only-triggers] pass"
