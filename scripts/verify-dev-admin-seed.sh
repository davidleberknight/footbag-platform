#!/usr/bin/env bash
# verify-dev-admin-seed.sh
#
# Verify that the dev-admin seed defined in .local/staging-admin-seed.json
# actually landed on a deployed Lightsail host via the
# ./deploy_to_aws.sh --seed-dev-admins pipeline. Read-only; queries the
# staging DB inside the web container via better-sqlite3 readonly mode.
#
# Emits a single JSON line on stdout with shape:
#   {"membersSeeded":N,"membersSeededAdmin":N,"tierGrantsSeeded":N,
#    "auditRowsSeeded":N,"passwordHashesArgon2":N}
# All diagnostics go to stderr; stdout carries the JSON line only so a
# caller (the R3 smoke spec) can parse without filtering chrome.
#
# Password handling: identical pattern to verify-staging-env.sh. `ssh -t`
# allocates a remote PTY so the remote sudo prompts on the LOCAL terminal;
# the operator types the password directly into sudo's noecho prompt; it
# is never piped, never captured, never logged. We do NOT use `sudo -S`
# (project memory: piping a password into a stdin-reading command leaks
# it into the consumer). A trap removes the staged remote temp file on
# every exit path.
#
# Usage:
#   scripts/verify-dev-admin-seed.sh                       # defaults to footbag-staging
#   scripts/verify-dev-admin-seed.sh footbag-staging
#   scripts/verify-dev-admin-seed.sh <ssh-alias>
#
# Invoked from: tests/smoke/dev-admin-seed.smoke.test.ts (R3 smoke).
# Standalone use is also supported: pipe stdout to `jq` to inspect.

set -euo pipefail

SSH_ALIAS="${1:-footbag-staging}"
REMOTE_TMP="/tmp/footbag-seed-verify-$$.json"

cleanup_remote() {
  ssh -o BatchMode=yes "$SSH_ALIAS" "rm -f $REMOTE_TMP" 2>/dev/null || true
}
trap cleanup_remote EXIT INT TERM

{
  echo "Querying dev-admin-seed state on $SSH_ALIAS."
  echo "You will be prompted for your sudo password on this terminal."
  echo "The password is typed directly into sudo; NOT captured, NOT echoed, NOT logged."
  echo ""
} >&2

# ssh -t allocates a remote PTY so the remote sudo can prompt on the local
# terminal. The remote bash pipes node's stdout into $REMOTE_TMP (created
# by the operator's non-root shell as the parent of the sudo'd compose
# command, so the file is operator-owned without an explicit chown). The
# entire ssh -t step's stdout is redirected to stderr so any docker /
# compose chrome stays out of the script's stdout (which is reserved for
# the JSON line emitted by the follow-up plain ssh + cat).
#
# Outer heredoc REMOTE_BASH is unquoted so $REMOTE_TMP expands locally.
# Inner heredoc 'JS' is single-quoted so the remote bash passes the node
# script verbatim to docker compose exec; $argon2id$ in the JS source is
# escaped at the outer (local) layer to defer expansion to the remote
# (where the inner quoted heredoc then prevents any expansion).
ssh -t "$SSH_ALIAS" "bash -s" >&2 <<REMOTE_BASH
set -euo pipefail
sudo docker compose --env-file /srv/footbag/env \
  -f /home/footbag/footbag-release/docker/docker-compose.yml \
  -f /home/footbag/footbag-release/docker/docker-compose.prod.yml \
  exec -T web node > $REMOTE_TMP <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const rows = db.prepare(
  "SELECT m.id, m.is_admin, m.password_hash FROM members m " +
  "WHERE m.id IN (SELECT member_id FROM member_tier_grants WHERE reason_code='dev_admin_seed.admin_tier2')"
).all();
const tg = db.prepare(
  "SELECT COUNT(*) c FROM member_tier_grants WHERE reason_code='dev_admin_seed.admin_tier2'"
).get().c;
const ae = db.prepare(
  "SELECT COUNT(*) c FROM audit_entries WHERE action_type='admin.dev_seed_grant'"
).get().c;
let a2 = 0;
for (const r of rows) {
  if ((r.password_hash || '').startsWith('\$argon2id\$')) a2++;
}
console.log(JSON.stringify({
  membersSeeded: rows.length,
  membersSeededAdmin: rows.filter((r) => r.is_admin === 1).length,
  tierGrantsSeeded: tg,
  auditRowsSeeded: ae,
  passwordHashesArgon2: a2,
}));
JS
chmod 0600 $REMOTE_TMP
REMOTE_BASH

# Plain ssh (no PTY, no sudo, no prompt): fetch the JSON line.
ssh -o BatchMode=yes "$SSH_ALIAS" "cat $REMOTE_TMP"
