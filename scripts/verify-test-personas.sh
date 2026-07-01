#!/usr/bin/env bash
# verify-test-personas.sh
#
# Verify that the canonical persona catalog actually landed on a deployed
# Lightsail host via the ./deploy_to_aws.sh --seed-test-personas pipeline.
# Read-only; queries the staging DB inside the web container via better-sqlite3
# readonly mode.
#
# Emits a single JSON line on stdout with shape:
#   {"personasSeeded":N,"auditRowsSeeded":N,"tierGrantsSeeded":N,
#    "passwordHashesArgon2":N}
# All diagnostics go to stderr; stdout carries the JSON line only so a caller
# (the persona smoke spec) can parse without filtering chrome.
#
# Marker semantics (set by src/testkit/personaFactory.ts seedPersona):
#   - members.id LIKE 'member_persona_%'                 one row per persona (all tiers)
#   - audit_entries.action_type = 'testkit.persona_seed'     one row per seeded persona
#   - member_tier_grants.reason_code =                   one row per tier1+ persona
#       'dev_persona_seed.tier_grant'                    (tier0 personas have no grant)
# Re-running the seed skips existing slugs, so auditRowsSeeded equals
# personasSeeded (no duplicate rows on replay).
#
# Password handling: `ssh -t`
# allocates a remote PTY so the remote sudo prompts on the LOCAL terminal;
# the operator types the password directly into sudo's noecho prompt; it is
# never piped, never captured, never logged. We do NOT use `sudo -S` (project
# memory: piping a password into a stdin-reading command leaks it into the
# consumer). A trap removes the staged remote temp file on every exit path.
#
# Usage:
#   scripts/verify-test-personas.sh                       # defaults to footbag-staging
#   scripts/verify-test-personas.sh footbag-staging
#   scripts/verify-test-personas.sh <ssh-alias>
#
# Invoked from: tests/smoke/test-personas.smoke.test.ts.
# Standalone use is also supported: pipe stdout to `jq` to inspect.

set -euo pipefail

SSH_ALIAS="${1:-footbag-staging}"
REMOTE_TMP="/tmp/footbag-persona-verify-$$.json"

cleanup_remote() {
  ssh -o BatchMode=yes "$SSH_ALIAS" "rm -f $REMOTE_TMP" 2>/dev/null || true
}
trap cleanup_remote EXIT INT TERM

{
  echo "Querying persona-seed state on $SSH_ALIAS."
  echo "You will be prompted for your sudo password on this terminal."
  echo "The password is typed directly into sudo; NOT captured, NOT echoed, NOT logged."
  echo ""
} >&2

# ssh -t allocates a remote PTY so the remote sudo can prompt on the local
# terminal. The remote bash pipes node's stdout into $REMOTE_TMP (created by
# the operator's non-root shell as the parent of the sudo'd compose command,
# so the file is operator-owned without an explicit chown). The entire ssh -t
# step's stdout is redirected to stderr so any docker / compose chrome stays
# out of the script's stdout (reserved for the JSON line emitted by the
# follow-up plain ssh + cat).
#
# Outer heredoc REMOTE_BASH is unquoted so $REMOTE_TMP expands locally. Inner
# heredoc 'JS' is single-quoted so the remote bash passes the node script
# verbatim to docker compose exec; $argon2id$ in the JS source is escaped at
# the outer (local) layer to defer expansion to the remote (where the inner
# quoted heredoc then prevents any expansion).
ssh -t "$SSH_ALIAS" "bash -s" >&2 <<REMOTE_BASH
set -euo pipefail
sudo docker compose --env-file /srv/footbag/env \
  -f /home/footbag/footbag-release/docker/docker-compose.yml \
  -f /home/footbag/footbag-release/docker/docker-compose.prod.yml \
  exec -T web node > $REMOTE_TMP <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const members = db.prepare(
  "SELECT id, password_hash FROM members WHERE id LIKE 'member_persona_%'"
).all();
const ae = db.prepare(
  "SELECT COUNT(*) c FROM audit_entries WHERE action_type='testkit.persona_seed'"
).get().c;
const tg = db.prepare(
  "SELECT COUNT(*) c FROM member_tier_grants WHERE reason_code='dev_persona_seed.tier_grant'"
).get().c;
let a2 = 0;
for (const r of members) {
  if ((r.password_hash || '').startsWith('\$argon2id\$')) a2++;
}
console.log(JSON.stringify({
  personasSeeded: members.length,
  auditRowsSeeded: ae,
  tierGrantsSeeded: tg,
  passwordHashesArgon2: a2,
}));
JS
chmod 0600 $REMOTE_TMP
REMOTE_BASH

# Plain ssh (no PTY, no sudo, no prompt): fetch the JSON line.
ssh -o BatchMode=yes "$SSH_ALIAS" "cat $REMOTE_TMP"
