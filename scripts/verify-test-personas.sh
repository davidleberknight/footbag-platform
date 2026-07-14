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
# Password handling: the remote query needs sudo (docker compose exec), and
# this script must run non-interactively (the smoke suite invokes it with no
# terminal). The sudo password comes from the operator credential file the
# deploy scripts use — line 1 of $HOME/AWS/AWS_OPERATOR.txt (or
# AWS_OPERATOR_PRODUCTION.txt for the production alias; AWS_OPERATOR_FILE
# overrides both) — and travels only as the first line of the ssh stdin
# stream into `sudo -S -p ""`, the same wire-pattern the deploy scripts use:
# never on any process's argv, never echoed, never logged, and the resolved
# credential path is never printed.
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

# Resolve the operator credential file exactly as the deploy wrapper does:
# explicit AWS_OPERATOR_FILE wins; otherwise the path is per-environment so a
# stale env bleed cannot feed staging credentials at a production host. The
# error is generic on purpose: never print the resolved path.
if [[ -z "${AWS_OPERATOR_FILE:-}" ]]; then
  if [[ "$SSH_ALIAS" == "footbag-production" ]]; then
    AWS_OPERATOR_FILE="$HOME/AWS/AWS_OPERATOR_PRODUCTION.txt"
  else
    AWS_OPERATOR_FILE="$HOME/AWS/AWS_OPERATOR.txt"
  fi
fi
if [[ ! -r "$AWS_OPERATOR_FILE" ]]; then
  echo "ERROR: operator credential source unavailable. This check runs on the operator workstation only; testers cannot (and need not) run it." >&2
  echo "Recommendation: verify the configured credential location is readable." >&2
  exit 1
fi
IFS= read -r SUDO_PASS < "$AWS_OPERATOR_FILE"

echo "Querying persona-seed state on $SSH_ALIAS." >&2

# One ssh round trip: the password is the first line of the stream (consumed
# by sudo -S; printf is a bash builtin, so no argv exposure), the remote body
# follows on the same stream. The body runs as root, captures the in-container
# node output, and marks the JSON line with a sentinel prefix so the local
# side can separate it from any docker/compose chrome. The heredoc is quoted:
# nothing in the body expands locally.
out="$(
  {
    printf '%s\n' "$SUDO_PASS"
    cat <<'REMOTE_BASH'
set -euo pipefail
json="$(docker compose --env-file /srv/footbag/env \
  -f /home/footbag/footbag-release/docker/docker-compose.yml \
  -f /home/footbag/footbag-release/docker/docker-compose.prod.yml \
  exec -T web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const members = db.prepare(
  "SELECT id, slug, password_hash FROM members WHERE id LIKE 'member_persona_%'"
).all();
const ae = db.prepare(
  "SELECT COUNT(*) c FROM audit_entries WHERE action_type='testkit.persona_seed'"
).get().c;
const tg = db.prepare(
  "SELECT COUNT(*) c FROM member_tier_grants WHERE reason_code='dev_persona_seed.tier_grant'"
).get().c;
let a2 = 0;
const stale = [];
for (const r of members) {
  const h = r.password_hash || '';
  if (h.startsWith('$argon2id$')) { a2++; }
  // Slugs are synthetic test-data identifiers, safe to report; the hash prefix
  // (never the hash) names the scheme so a stale row is diagnosable at a glance.
  else { stale.push({ slug: r.slug, hashPrefix: h ? h.slice(0, 10) : (r.password_hash === null ? 'NULL' : 'EMPTY') }); }
}
console.log(JSON.stringify({
  personasSeeded: members.length,
  auditRowsSeeded: ae,
  tierGrantsSeeded: tg,
  passwordHashesArgon2: a2,
  staleHashSlugs: stale,
}));
JS
)"
printf 'PERSONA_JSON:%s\n' "$json"
REMOTE_BASH
  } | ssh "$SSH_ALIAS" 'sudo -S -p "" bash'
)"

# Chrome (anything unmarked) to stderr; the sentinel-marked JSON line to stdout.
printf '%s\n' "$out" | grep -v '^PERSONA_JSON:' >&2 || true
json_line="$(printf '%s\n' "$out" | grep '^PERSONA_JSON:' | tail -1 | sed 's/^PERSONA_JSON://')"

# Warn loudly when any persona carries a pre-argon2id hash. The most common
# cause is that no deploy has run the seed step (which re-hashes stale rows in
# place) since the heal landed: the smoke only queries staging, it never
# re-seeds. A `[{` after the key means the array has at least one entry.
if [[ "$json_line" == *'"staleHashSlugs":[{'* ]]; then
  {
    echo ""
    echo "WARNING: one or more personas carry a pre-argon2id password hash."
    echo "  These heal automatically, but only when the seed step runs — deploy staging"
    echo "  with --seed-test-personas (the smoke alone only queries, it never re-seeds)."
    echo "  If a named persona is not in the current canonical catalog, it is an orphan"
    echo "  the in-place heal cannot reach; use the delete-and-reseed persona refresh."
    echo ""
  } >&2
fi

printf '%s\n' "$json_line"
