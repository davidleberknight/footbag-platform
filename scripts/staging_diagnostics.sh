#!/usr/bin/env bash
#
# staging_diagnostics.sh: single-file diagnostic toolkit for the footbag
# staging host. Read-only by default. The only state-changing operation is
# `force-tick`, which must be invoked explicitly with `-y`.
#
# ----------------------------------------------------------------------------
# Upload instructions
# ----------------------------------------------------------------------------
#
# From your local workstation, after pulling latest:
#
#   scp scripts/staging_diagnostics.sh footbag-staging:/home/footbag/
#   ssh footbag-staging 'chmod +x /home/footbag/staging_diagnostics.sh'
#
# Then on staging:
#
#   ~/staging_diagnostics.sh help
#   ~/staging_diagnostics.sh outbox davidleberknightphone@gmail.com
#   ~/staging_diagnostics.sh worker-logs 60
#   ~/staging_diagnostics.sh force-tick -y
#
# Alternatively, the next `./deploy_to_aws.sh` also places a copy at
#   /home/footbag/footbag-release/scripts/staging_diagnostics.sh
# which you can invoke directly without re-uploading.
#
# Requires: sudo docker, node inside the web container (already present),
# and outbound AWS credentials for the aws-* subcommands (already present via
# /root/.aws on staging).
#
# argv-leak rule: when invoking `compose exec -T web sh -c '...'` with a value
# read from /srv/footbag/env, the operator's argv, or another sensitive
# source, pipe the value to stdin and rebind inside the in-container shell
# (e.g. `printf '%s' "$val" | compose exec -T web sh -c 'v=$(cat); cmd "$v"'`).
# Do NOT inline the value into the `sh -c` string (interpolation lands the
# value in argv of the docker compose subprocess on the staging host, visible
# to any `ps -ef` reader). This matches the SUDO_PASS cat-pipe pattern in
# scripts/internal/deploy-*-remote.sh.
#
# ----------------------------------------------------------------------------

set -euo pipefail

ENV_FILE='/srv/footbag/env'
COMPOSE_BASE='/home/footbag/footbag-release/docker/docker-compose.yml'
COMPOSE_PROD='/home/footbag/footbag-release/docker/docker-compose.prod.yml'
DB_HOST_PATH='/srv/footbag/db/footbag.db'

compose() {
  sudo docker compose --env-file "$ENV_FILE" -f "$COMPOSE_BASE" -f "$COMPOSE_PROD" "$@"
}

node_run() { compose exec -T web node; }

banner() { printf '\n==> %s\n' "$*"; }

confirm() {
  local prompt="$1"
  read -r -p "$prompt [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]]
}

# ---------------- Runtime state ----------------

cmd_status() {
  banner "docker compose ps"
  compose ps
}

cmd_health() {
  banner "GET /health (inside web container)"
  compose exec -T web sh -c 'wget -q -O- --timeout=3 http://localhost:3000/health && echo' || echo "(wget failed)"
  banner "GET /health/ready"
  compose exec -T web sh -c 'wget -q -O- --timeout=3 http://localhost:3000/health/ready && echo' || echo "(wget failed)"
}

cmd_time() {
  banner "Host UTC"; date -u
  banner "Container UTC"; compose exec -T web date -u
}

cmd_git_sha() {
  banner "Release dir SHA"
  (cd /home/footbag/footbag-release 2>/dev/null && git rev-parse HEAD 2>/dev/null) || echo "(not a git tree)"
}

# ---------------- DB inspection ----------------

cmd_db_counts() {
  banner "DB row counts"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const one = (sql) => db.prepare(sql).get().c;
const many = (sql) => db.prepare(sql).all();
console.log('members                 :', one('SELECT COUNT(*) c FROM members'));
console.log('historical_persons      :', one('SELECT COUNT(*) c FROM historical_persons'));
console.log('legacy_members          :', one('SELECT COUNT(*) c FROM legacy_members'));
console.log('audit_entries           :', one('SELECT COUNT(*) c FROM audit_entries'));
console.log('outbox_emails by status :', many(`SELECT status, COUNT(*) c FROM outbox_emails GROUP BY status`));
JS
}

cmd_outbox() {
  local email="${1:-}"
  banner "outbox_emails${email:+ for $email}"
  compose exec -T -e EMAIL="$email" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const email = process.env.EMAIL || '';
const rows = email
  ? db.prepare(`SELECT id, recipient_email, status, retry_count, last_attempt_at, sent_at, substr(last_error,1,160) err, created_at FROM outbox_emails WHERE recipient_email = ? ORDER BY created_at DESC LIMIT 20`).all(email)
  : db.prepare(`SELECT id, recipient_email, status, retry_count, substr(last_error,1,80) err, created_at FROM outbox_emails ORDER BY created_at DESC LIMIT 20`).all();
console.log(rows);
JS
}

cmd_outbox_pending() {
  banner "outbox_emails status='pending'"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.prepare(`SELECT id, recipient_email, scheduled_for, retry_count, last_attempt_at, created_at FROM outbox_emails WHERE status='pending' ORDER BY created_at ASC LIMIT 50`).all());
JS
}

cmd_outbox_retrying() {
  banner "outbox_emails retry_count > 0 (not yet dead-lettered)"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.prepare(`SELECT id, recipient_email, status, retry_count, substr(last_error,1,160) err, last_attempt_at FROM outbox_emails WHERE retry_count > 0 AND status != 'dead_letter' ORDER BY last_attempt_at DESC LIMIT 50`).all());
JS
}

cmd_dead_letter() {
  banner "outbox_emails status='dead_letter'"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.prepare(`SELECT id, recipient_email, retry_count, substr(last_error,1,200) err, last_attempt_at, created_at FROM outbox_emails WHERE status='dead_letter' ORDER BY last_attempt_at DESC LIMIT 50`).all());
JS
}

cmd_member() {
  local key="${1:?usage: member <email|slug>}"
  banner "member lookup: $key"
  compose exec -T -e KEY="$key" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const key = process.env.KEY;
const rows = db.prepare(`SELECT id, slug, display_name, login_email, login_email_normalized, email_verified_at, created_at FROM members WHERE login_email_normalized = ? OR slug = ? LIMIT 5`).all(key.toLowerCase(), key);
console.log(rows);
JS
}

cmd_config() {
  local key="${1:-}"
  banner "system_config_current${key:+ for config_key LIKE %$key%}"
  compose exec -T -e KEY="$key" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const key = process.env.KEY || '';
const rows = key
  ? db.prepare(`SELECT config_key, value_json, effective_start_at FROM system_config_current WHERE config_key LIKE ? ORDER BY config_key`).all('%'+key+'%')
  : db.prepare(`SELECT config_key, value_json, effective_start_at FROM system_config_current ORDER BY config_key`).all();
console.log(rows);
JS
}

cmd_integrity() {
  banner "PRAGMA integrity_check (inside container)"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.pragma('integrity_check'));
JS
}

# ---------------- Logs ----------------

cmd_worker_logs() { banner "worker logs --tail=${1:-80}"; compose logs worker --tail="${1:-80}"; }
cmd_web_logs()    { banner "web logs --tail=${1:-80}";    compose logs web    --tail="${1:-80}"; }
cmd_nginx_logs()  { banner "nginx logs --tail=${1:-80}";  compose logs nginx  --tail="${1:-80}"; }
cmd_all_logs()    { banner "all logs --tail=${1:-80}";    compose logs        --tail="${1:-80}"; }

# ---------------- Host ----------------

cmd_mem()     { banner "free -h"; free -h; }
cmd_disk() {
  banner "df -h /"
  df -h /
  banner "DB file + WAL + SHM sizes on host"
  sudo ls -lh "$DB_HOST_PATH"* 2>/dev/null || echo "(no host DB file at $DB_HOST_PATH)"
}
cmd_systemd() { banner "systemctl status footbag.service"; sudo systemctl status footbag.service --no-pager -l || true; }

# ---------------- AWS ----------------

cmd_aws_whoami() {
  banner "aws sts get-caller-identity (from inside web container)"
  compose exec -T web sh -c 'aws sts get-caller-identity 2>&1' || echo "(aws cli not present — falling back to host)"
}

cmd_ses_identity() {
  banner "SES identity verification for SES_FROM_IDENTITY"
  local ident
  ident=$(sudo awk -F= '$1=="SES_FROM_IDENTITY"{sub(/^[^=]*=/,""); print}' "$ENV_FILE" | tail -1)
  if [[ -z "$ident" ]]; then
    echo "SES_FROM_IDENTITY not set in $ENV_FILE"
    return
  fi
  echo "Identity: $ident"
  # argv-leak hardening: pipe the identity into the container via stdin and
  # rebind inside the in-container shell. Avoids inlining $ident into the
  # `sh -c` argument (which lands the value in argv of the docker compose
  # subprocess on the staging host).
  printf '%s' "$ident" \
    | compose exec -T web sh -c 'ident=$(cat); aws ses get-identity-verification-attributes --identities "$ident" 2>&1' \
    || true
}

cmd_ses_quota() {
  banner "SES send quota"
  compose exec -T web sh -c 'aws ses get-send-quota 2>&1' || true
}

cmd_ses_suppression() {
  local email="${1:?usage: ses-suppression <email>}"
  banner "SES suppression for $email"
  # argv-leak hardening: pipe the email into the container via stdin and
  # rebind inside the in-container shell. Same pattern as cmd_ses_identity.
  printf '%s' "$email" \
    | compose exec -T web sh -c 'email=$(cat); aws sesv2 get-suppressed-destination --email-address "$email" 2>&1' \
    || true
}

cmd_ses_bounces() {
  banner "SES bounce/complaint events (requires feedback SNS topic + subscription; stub until wired)"
  echo "Path H follow-up: wire SNS feedback topic and log table, then replace this stub."
}

cmd_kms_probe() {
  banner "KMS Sign probe (minimal payload against JWT_KMS_KEY_ID)"
  compose exec -T web sh -c 'node -e "const {KMSClient,SignCommand}=require(\"@aws-sdk/client-kms\"); const c=new KMSClient({region:process.env.AWS_REGION}); c.send(new SignCommand({KeyId:process.env.JWT_KMS_KEY_ID,Message:Buffer.from(\"probe\"),SigningAlgorithm:\"RSASSA_PKCS1_V1_5_SHA_256\"})).then(r=>console.log(\"ok kid=\"+r.KeyId)).catch(e=>console.error(\"KMS probe failed:\",e.name,e.message))"' || true
}

cmd_jwt_kid() {
  banner "JWT_KMS_KEY_ID the signer is configured to use"
  # ENV_FILE is root:root 0600, so a non-root grep returns nothing and the
  # subsequent `sudo cat` reads an empty pipe. Use sudo for the grep itself
  # so the diagnostic actually returns the value. The KMS key id is not a
  # secret (it is logged by `aws kms describe-key` against any principal
  # with kms:DescribeKey), so reading it via sudo is operationally safe.
  sudo grep '^JWT_KMS_KEY_ID=' "$ENV_FILE" 2>/dev/null || echo "(cannot read $ENV_FILE)"
}

# ---------------- Data integrity ----------------

cmd_orphans() {
  banner "Orphan checks (dangling FKs)"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const check = (label, sql) => console.log(label + ':', db.prepare(sql).get().c);
check('outbox_emails with missing member',
  `SELECT COUNT(*) c FROM outbox_emails o WHERE o.recipient_member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = o.recipient_member_id)`);
check('members with missing historical_person_id',
  `SELECT COUNT(*) c FROM members m WHERE m.historical_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM historical_persons hp WHERE hp.person_id = m.historical_person_id)`);
check('audit_entries with actor_member_id pointing nowhere',
  `SELECT COUNT(*) c FROM audit_entries a WHERE a.actor_member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = a.actor_member_id)`);
JS
}

cmd_stubs() {
  banner "Stub historical_persons (person_id prefix 'stub_')"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.prepare(`SELECT person_id, person_name, created_at FROM historical_persons WHERE person_id LIKE 'stub_%' ORDER BY created_at DESC LIMIT 50`).all());
JS
}

cmd_unverified_members() {
  local days="${1:-1}"
  banner "Members unverified older than ${days} day(s)"
  compose exec -T -e DAYS="$days" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const days = parseInt(process.env.DAYS || '1', 10);
const rows = db.prepare(`SELECT id, slug, login_email, created_at FROM members WHERE email_verified_at IS NULL AND created_at < datetime('now', ?) ORDER BY created_at DESC LIMIT 50`).all('-' + days + ' days');
console.log(rows);
JS
}

cmd_merge_drift() {
  banner "Members with HP-field drift vs historical_persons"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const rows = db.prepare(`SELECT m.slug, m.country AS m_country, hp.country AS hp_country, m.is_hof AS m_hof, hp.hof_member AS hp_hof, m.hof_inducted_year AS m_year, hp.hof_induction_year AS hp_year FROM members m JOIN historical_persons hp ON hp.person_id = m.historical_person_id WHERE m.deleted_at IS NULL AND m.personal_data_purged_at IS NULL AND ((m.country IS NULL AND hp.country IS NOT NULL) OR (COALESCE(m.is_hof,0) <> COALESCE(hp.hof_member,0)) OR (m.hof_inducted_year IS NULL AND hp.hof_induction_year IS NOT NULL)) LIMIT 50`).all();
console.log(rows);
JS
}

cmd_slug_collisions() {
  banner "Case-insensitive slug collisions"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.prepare(`SELECT lower(slug) lslug, COUNT(*) c FROM members GROUP BY lower(slug) HAVING c > 1`).all());
JS
}

cmd_email_dupes() {
  banner "login_email_normalized duplicates"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log(db.prepare(`SELECT login_email_normalized, COUNT(*) c FROM members GROUP BY login_email_normalized HAVING c > 1`).all());
JS
}

# ---------------- Audit ----------------

cmd_worker_status() {
  # Worker container health: restart count, last restart timestamp, current
  # process inside the container. Distinct from worker-logs (which tails
  # stdout); this is "is the process actually running and how often does it
  # crash."
  banner "worker container status"
  compose ps worker
  echo ""
  banner "worker container restart history (last 5)"
  # docker inspect surfaces RestartCount and the timestamps of the last
  # state transitions. Useful to detect crash-loops.
  local cid
  cid=$(compose ps -q worker || true)
  if [[ -z "$cid" ]]; then
    echo "worker container not running."
    return
  fi
  docker inspect --format \
    'RestartCount: {{.RestartCount}}
StartedAt:    {{.State.StartedAt}}
FinishedAt:   {{.State.FinishedAt}}
Status:       {{.State.Status}}
ExitCode:     {{.State.ExitCode}}
Error:        {{.State.Error}}' \
    "$cid"
  echo ""
  banner "process tree inside worker"
  compose exec -T worker ps -ef 2>/dev/null || true
}

cmd_image_status() {
  # Image worker container health (the standalone Sharp pipeline served via
  # HTTP). Same shape as worker-status. Confirms the image:4000 service is
  # alive on the docker network so web's avatar processing doesn't 502.
  banner "image container status"
  compose ps image
  echo ""
  local cid
  cid=$(compose ps -q image || true)
  if [[ -z "$cid" ]]; then
    echo "image container not running."
    return
  fi
  docker inspect --format \
    'RestartCount: {{.RestartCount}}
StartedAt:    {{.State.StartedAt}}
Status:       {{.State.Status}}
Health:       {{.State.Health.Status}}' \
    "$cid"
  echo ""
  banner "image worker /health probe (from inside web container)"
  compose exec -T web wget -qO- http://image:4000/health 2>&1 || echo "image /health unreachable"
}

cmd_legacy_claims() {
  # Recent claim merges (audit-trail). Shows both legacy-account claims and
  # HP claims, ordered by most recent. Useful for verifying claim flow is
  # exercised in staging and for investigating disputed merges.
  local n="${1:-20}"
  banner "audit_entries — recent claim merges (last $n)"
  compose exec -T -e N="$n" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const n = parseInt(process.env.N || '20', 10);
const rows = db.prepare(`
  SELECT occurred_at, action_type, actor_member_id, entity_id,
         substr(metadata_json, 1, 200) metadata
  FROM audit_entries
  WHERE action_type IN ('claim.legacy_account', 'claim.historical_person')
  ORDER BY occurred_at DESC LIMIT ?
`).all(n);
console.log(rows);
JS
}

cmd_account_tokens() {
  # Recent account_tokens for a member (or all if no arg). Surfaces token
  # state (used vs unused vs expired) for the two-step claim, password reset,
  # email verify, and data export flows. Useful for "the user says their
  # claim link doesn't work" investigations.
  local member="${1:-}"
  banner "account_tokens${member:+ for $member}"
  compose exec -T -e MEMBER="$member" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const member = process.env.MEMBER || '';
const sql = member
  ? `SELECT id, member_id, token_type, target_legacy_member_id,
            issued_at, expires_at, used_at,
            CASE
              WHEN used_at IS NOT NULL THEN 'used'
              WHEN expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired'
              ELSE 'active'
            END AS state
     FROM account_tokens WHERE member_id = ? ORDER BY issued_at DESC LIMIT 20`
  : `SELECT id, member_id, token_type, issued_at, expires_at, used_at,
            CASE
              WHEN used_at IS NOT NULL THEN 'used'
              WHEN expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired'
              ELSE 'active'
            END AS state
     FROM account_tokens ORDER BY issued_at DESC LIMIT 20`;
const rows = member ? db.prepare(sql).all(member) : db.prepare(sql).all();
console.log(rows);
JS
}

cmd_work_queue() {
  # work_queue_items inspection. Surfaces the batch auto-link queue and any
  # other work-queue-driven flows. Filter by item_type ('auto_link_match',
  # etc.) to focus on a specific producer.
  local item_type="${1:-}"
  banner "work_queue_items${item_type:+ type=$item_type}"
  compose exec -T -e ITEM_TYPE="$item_type" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const t = process.env.ITEM_TYPE || '';
const sql = t
  ? `SELECT id, queue, item_type, entity_type, entity_id, priority,
            ready_at, started_at, completed_at, substr(notes, 1, 80) notes
     FROM work_queue_items WHERE item_type = ?
     ORDER BY ready_at DESC LIMIT 20`
  : `SELECT id, queue, item_type, entity_type, entity_id, priority,
            ready_at, started_at, completed_at
     FROM work_queue_items
     ORDER BY ready_at DESC LIMIT 20`;
const rows = t ? db.prepare(sql).all(t) : db.prepare(sql).all();
console.log(rows);
JS
}

cmd_tier_status() {
  # Effective member tier: what the predicates (hasTier1Benefits / isTier2Plus
  # / isTier3) actually return for a given member, including admin
  # short-circuit. Resolves the gap between "what's in member_tier_grants"
  # (raw data) and "what does the gate decide" (effective behavior).
  local member="${1:?usage: tier-status <member-id-or-slug>}"
  banner "tier predicates for $member"
  compose exec -T -e MEMBER="$member" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const m = process.env.MEMBER;
const memberRow = db.prepare(`
  SELECT id, slug, is_admin FROM members
  WHERE id = ? OR slug = ? AND personal_data_purged_at IS NULL
  LIMIT 1
`).get(m, m);
if (!memberRow) {
  console.error(`No member found for '${m}'.`);
  process.exit(2);
}
console.log('member          :', memberRow);
const tier = db.prepare(`
  SELECT * FROM member_tier_current WHERE member_id = ?
`).get(memberRow.id);
console.log('tier_current    :', tier);
const ap = db.prepare(`
  SELECT * FROM active_player_current WHERE member_id = ?
`).get(memberRow.id);
console.log('ap_current      :', ap);
console.log('admin short-circuit:', memberRow.is_admin === 1
  ? 'YES — predicates return true regardless of tier_current/ap_current'
  : 'no — predicates evaluate tier_current and ap_current');
JS
}

cmd_ap_reminders() {
  # active_player_reminder_sent inspection: which members have received
  # which reminders (idempotency-marker-table for the AP expiry worker).
  local member="${1:-}"
  banner "active_player_reminder_sent${member:+ for $member}"
  compose exec -T -e MEMBER="$member" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const m = process.env.MEMBER || '';
const sql = m
  ? `SELECT id, member_id, expires_at, offset_days, sent_at
     FROM active_player_reminder_sent WHERE member_id = ?
     ORDER BY sent_at DESC LIMIT 20`
  : `SELECT id, member_id, expires_at, offset_days, sent_at
     FROM active_player_reminder_sent ORDER BY sent_at DESC LIMIT 20`;
const rows = m ? db.prepare(sql).all(m) : db.prepare(sql).all();
console.log(rows);
JS
}

cmd_stale_runs() {
  # Stale 'running' rows in system_job_runs: left behind by SIGKILL / OOM
  # of a worker pass. The next runBatchAutoLink reaps these (>1h old)
  # automatically; this command surfaces them so operators can investigate
  # the cause (worker crash? host reboot? OOM?) before the auto-reap fires.
  banner "system_job_runs status='running' older than 1h (likely stale)"
  compose exec -T web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const rows = db.prepare(`
  SELECT id, job_name, started_at, version
  FROM system_job_runs
  WHERE status = 'running' AND started_at < ?
  ORDER BY started_at DESC
`).all(cutoff);
if (rows.length === 0) {
  console.log('OK: no stale running rows.');
} else {
  console.log(`FOUND ${rows.length} stale running row(s):`);
  console.log(rows);
}
JS
}

cmd_rate_limit_status() {
  # Process-local in-memory rate-limit buckets aren't persisted to the DB
  # (rateLimitService.ts uses a Map<string, Bucket>). They reset on container
  # restart. There is no on-host inspection; this command reports the design
  # so operators don't waste time looking for a table that doesn't exist.
  # If a future implementation moves rate-limits to a persisted table, this
  # command becomes the inspection surface.
  banner "rate-limit buckets (in-memory; no persisted state to query)"
  cat <<'EOF'
Rate-limit state lives in process memory (rateLimitService.ts: const buckets
= new Map<string, Bucket>()). Buckets reset on container restart. There is
no per-key persistence to inspect.

Common keys:
  legclaim-init:<member_id>           5/hr per member (legacy claim init)
  legclaim-target:<legacy_member_id>  3/hr per target (per-mailbox cap)
  verify-resend:<email_normalized>    3/hr per email (verify resend)
  login:<...>                         login attempt limit (see env-config tests)

To diagnose "why did X get rate-limited?": container-restart resets all
buckets immediately. To diagnose "is X at the limit right now?": no
inspection possible without code change.
EOF
}

cmd_job_runs() {
  # SYS-job lifecycle inspection. The AP expiry worker writes a row per pass;
  # operator checks here to confirm the worker is alive and not silently
  # failing. A missing recent row means the worker isn't running; a 'failed'
  # status means the work threw and the operator needs to chase the error.
  local job_filter="${1:-}"
  banner "system_job_runs (latest 10${job_filter:+ for $job_filter})"
  compose exec -T -e JOB_FILTER="$job_filter" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const filter = process.env.JOB_FILTER || '';
const sql = filter
  ? `SELECT id, job_name, status, started_at, finished_at, substr(last_error,1,80) err
     FROM system_job_runs WHERE job_name = ? ORDER BY started_at DESC LIMIT 10`
  : `SELECT id, job_name, status, started_at, finished_at, substr(last_error,1,80) err
     FROM system_job_runs ORDER BY started_at DESC LIMIT 10`;
const rows = filter ? db.prepare(sql).all(filter) : db.prepare(sql).all();
console.log(rows);
JS
}

cmd_ap_expiry_health() {
  # Single-purpose health gate for the AP expiry worker. Asserts a recent
  # successful pass exists (within ~26h, slightly above the 24h tick interval).
  # Useful as a post-deploy smoke from the operator workstation:
  #   bash scripts/staging_diagnostics.sh ap-expiry-health
  banner "AP expiry worker health (SYS_Check_Active_Player_Expiry)"
  compose exec -T web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const row = db.prepare(`
  SELECT id, status, started_at, finished_at, substr(last_error,1,200) err, substr(details_json, 1, 200) details
  FROM system_job_runs
  WHERE job_name = 'SYS_Check_Active_Player_Expiry'
  ORDER BY started_at DESC LIMIT 1
`).get();
if (!row) {
  console.error('FAIL: no SYS_Check_Active_Player_Expiry row in system_job_runs.');
  console.error('Cause: worker has not run yet, or rows were truncated.');
  process.exit(2);
}
console.log(row);
const ageMs = Date.now() - new Date(row.started_at).getTime();
const ageHours = ageMs / 3600000;
if (row.status === 'failed') {
  console.error(`FAIL: latest pass status='failed' (started_at=${row.started_at}). last_error: ${row.err}`);
  process.exit(2);
}
if (row.status === 'running' && ageHours > 1) {
  console.error(`WARN: latest pass status='running' for ${ageHours.toFixed(1)}h (likely stale; reaped on next run).`);
  process.exit(2);
}
if (row.status === 'succeeded' && ageHours > 26) {
  console.error(`FAIL: latest succeeded pass is ${ageHours.toFixed(1)}h old (interval is 24h).`);
  process.exit(2);
}
console.log(`OK: latest pass status='${row.status}', age=${ageHours.toFixed(1)}h.`);
JS
}

cmd_admin_audit() {
  local n="${1:-20}"
  banner "Recent admin audit_entries (last $n)"
  compose exec -T -e N="$n" web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const n = parseInt(process.env.N || '20', 10);
console.log(db.prepare(`SELECT occurred_at, action_type, entity_type, entity_id, actor_member_id, category FROM audit_entries WHERE actor_type = 'admin' ORDER BY occurred_at DESC LIMIT ?`).all(n));
JS
}

# ---------------- Performance ----------------

cmd_db_sizes() {
  banner "Per-table row counts (sorted desc)"
  node_run <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map(r => r.name);
const rows = tables.map(t => ({ table: t, rows: db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c }));
rows.sort((a,b) => b.rows - a.rows);
console.table(rows);
JS
}

cmd_wal_size() {
  banner "WAL / SHM sizes on host and inside container"
  sudo ls -lh "$DB_HOST_PATH"* 2>/dev/null || echo "(no host DB file)"
  compose exec -T web sh -c 'ls -lh /app/db/footbag.db* 2>/dev/null' || true
}

cmd_split_wal_check() {
  banner "DB view comparison: host vs web vs worker"
  echo "--- HOST ---"
  sudo ls -lh "$DB_HOST_PATH"* 2>/dev/null || echo "(no host DB files)"
  sudo sqlite3 "$DB_HOST_PATH" "SELECT status, COUNT(*) FROM outbox_emails GROUP BY status;" 2>&1 || true
  sudo sqlite3 "$DB_HOST_PATH" "SELECT COUNT(*) AS members FROM members;" 2>&1 || true

  echo
  echo "--- WEB (inside container) ---"
  compose exec -T web sh -c 'ls -lh /app/db/footbag.db* 2>/dev/null' || true
  compose exec -T web node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log('outbox by status:', db.prepare('SELECT status, COUNT(*) c FROM outbox_emails GROUP BY status').all());
console.log('members:', db.prepare('SELECT COUNT(*) c FROM members').get().c);
JS

  echo
  echo "--- WORKER (inside container) ---"
  compose exec -T worker sh -c 'ls -lh /app/db/footbag.db* 2>/dev/null' || true
  compose exec -T worker node <<'JS'
const db = require('better-sqlite3')('/app/db/footbag.db', { readonly: true });
console.log('outbox by status:', db.prepare('SELECT status, COUNT(*) c FROM outbox_emails GROUP BY status').all());
console.log('members:', db.prepare('SELECT COUNT(*) c FROM members').get().c);
JS

  echo
  echo "Interpretation:"
  echo "  If web sees rows that worker does not, WAL sidecars live in separate"
  echo "  container overlays (file bind mount, not directory). Fix is to bind"
  echo "  the DB directory, not the DB file, in docker-compose.prod.yml."
}

# ---------------- Production readiness ----------------

cmd_tls_cert() {
  banner "TLS cert expiry for PUBLIC_BASE_URL"
  local url
  url=$(sudo awk -F= '$1=="PUBLIC_BASE_URL"{sub(/^[^=]*=/,""); print}' "$ENV_FILE" | tail -1)
  local host="${url#https://}"; host="${host#http://}"; host="${host%%/*}"
  if [[ -z "$host" ]]; then echo "PUBLIC_BASE_URL not set"; return; fi
  echo "Host: $host"
  echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -subject -issuer -dates || echo "(openssl failed)"
}

cmd_origin_probe() {
  banner "Fetch /health via PUBLIC_BASE_URL (CloudFront → nginx → web)"
  local url
  url=$(sudo awk -F= '$1=="PUBLIC_BASE_URL"{sub(/^[^=]*=/,""); print}' "$ENV_FILE" | tail -1)
  curl -sS -o - -w "\n---\nhttp_code=%{http_code}\ntime_total=%{time_total}s\n" "${url%/}/health" || true
}

cmd_nginx_test() {
  banner "nginx -t inside nginx container"
  compose exec -T nginx nginx -t 2>&1 || true
}

cmd_dns_check() {
  banner "DNS A record for PUBLIC_BASE_URL"
  local url host
  url=$(sudo awk -F= '$1=="PUBLIC_BASE_URL"{sub(/^[^=]*=/,""); print}' "$ENV_FILE" | tail -1)
  host="${url#https://}"; host="${host#http://}"; host="${host%%/*}"
  [[ -n "$host" ]] && (dig +short "$host" A; dig +short "$host" AAAA) || echo "(no host)"
}

# ---------------- Rollback visibility ----------------

cmd_deploy_history() {
  local n="${1:-20}"
  banner "Last $n footbag.service restarts (from journalctl)"
  sudo journalctl -u footbag.service --no-pager -n "$n" --output=short-iso | grep -E "Started|Stopped|Deactivated|Main process exited" || true
}

cmd_previous_release() {
  banner "Release / live directories"
  sudo ls -ld /home/footbag/footbag-release /srv/footbag 2>/dev/null || true
  banner "Any sibling release backups"
  sudo ls -ld /home/footbag/footbag-release.* 2>/dev/null || echo "(no sibling backups)"
}

# ---------------- State-change (force-tick only) ----------------

cmd_force_tick() {
  if [[ "${1:-}" != "-y" ]]; then
    echo "force-tick will trigger an immediate outbox drain inside the web container."
    echo "This performs real SES send attempts on pending rows and flips their status."
    echo "Re-run with -y to confirm:   $0 force-tick -y"
    exit 1
  fi
  banner "force-tick: operationsPlatformService.runEmailWorker()"
  node_run <<'JS'
(async () => {
  const svc = require('/app/dist/services/operationsPlatformService').operationsPlatformService;
  const result = await svc.runEmailWorker();
  console.log(result);
})().catch(e => { console.error(e); process.exit(1); });
JS
}

# ---------------- Help ----------------

cmd_help() {
  cat <<'HELP'
staging_diagnostics.sh — subcommands

  Runtime
    status                   docker compose ps
    health                   GET /health and /health/ready
    time                     host and container UTC
    git-sha                  release dir git SHA

  DB inspection
    db-counts                counts by key table
    outbox [email]           last 20 outbox rows (optionally filtered)
    outbox-pending           pending rows
    outbox-retrying          rows with retry_count > 0
    dead-letter              rows with status='dead_letter'
    member <email|slug>      lookup a member row
    config [key-substr]      system_config (optionally filtered)
    integrity                PRAGMA integrity_check

  Logs
    worker-logs [n]          tail worker logs (default 80)
    web-logs [n]             tail web logs
    nginx-logs [n]           tail nginx logs
    all-logs [n]             tail all services

  Host
    mem                      free -h
    disk                     df -h plus DB file sizes
    systemd                  systemctl status footbag.service

  Workers
    worker-status            worker container status + restart history
    image-status             image worker container status + /health probe

  Background jobs
    job-runs [job-name]      latest 10 system_job_runs (optionally filtered)
    ap-expiry-health         single-purpose health gate for AP expiry worker
    stale-runs               'running' rows older than 1h (likely stale)
    ap-reminders [member]    active_player_reminder_sent rows
    work-queue [item-type]   work_queue_items (optionally filtered)

  AWS
    aws-whoami               aws sts get-caller-identity (inside web)
    ses-identity             SES identity verification state
    ses-quota                SES send quota
    ses-suppression <email>  SES suppression check
    ses-bounces              (stub — requires SNS feedback wiring)
    kms-probe                minimal KMS Sign call against JWT_KMS_KEY_ID
    jwt-kid                  show JWT_KMS_KEY_ID from env file

  Data integrity
    orphans                  FKs pointing at nonexistent rows
    stubs                    stub historical_persons rows
    unverified-members [d]   members unverified > d days (default 1)
    merge-drift              members vs HP field drift
    slug-collisions          case-insensitive slug dupes
    email-dupes              login_email_normalized dupes

  Identity & claims
    legacy-claims [n]        recent claim merges (last n audit_entries)
    account-tokens [member]  account_tokens with state (active/used/expired)
    tier-status <member>     effective tier predicates incl. admin short-circuit
    rate-limit-status        notes on in-memory rate-limit state (no inspection)

  Audit
    admin-audit [n]          last n admin audit_entries

  Performance
    db-sizes                 per-table row counts
    wal-size                 WAL/SHM sizes (host + container)
    split-wal-check          compare host vs web vs worker DB views

  Production readiness
    tls-cert                 TLS cert expiry for PUBLIC_BASE_URL
    origin-probe             curl PUBLIC_BASE_URL/health
    nginx-test               nginx -t inside nginx container
    dns-check                dig A/AAAA for PUBLIC_BASE_URL host

  Rollback visibility
    deploy-history [n]       last n service restarts
    previous-release         release + live dirs, sibling backups

  State-change (confirm-required)
    force-tick -y            force immediate outbox drain

  help                       this message
HELP
}

# ---------------- Dispatcher ----------------

main() {
  local sub="${1:-help}"; shift || true
  case "$sub" in
    status)               cmd_status ;;
    health)               cmd_health ;;
    time)                 cmd_time ;;
    git-sha)              cmd_git_sha ;;

    db-counts)            cmd_db_counts ;;
    outbox)               cmd_outbox "${1:-}" ;;
    outbox-pending)       cmd_outbox_pending ;;
    outbox-retrying)      cmd_outbox_retrying ;;
    dead-letter)          cmd_dead_letter ;;
    member)               cmd_member "${1:?usage: member <email|slug>}" ;;
    config)               cmd_config "${1:-}" ;;
    integrity)            cmd_integrity ;;

    worker-logs)          cmd_worker_logs "${1:-80}" ;;
    web-logs)             cmd_web_logs "${1:-80}" ;;
    nginx-logs)           cmd_nginx_logs "${1:-80}" ;;
    all-logs)             cmd_all_logs "${1:-80}" ;;

    mem)                  cmd_mem ;;
    disk)                 cmd_disk ;;
    systemd)              cmd_systemd ;;

    aws-whoami)           cmd_aws_whoami ;;
    ses-identity)         cmd_ses_identity ;;
    ses-quota)            cmd_ses_quota ;;
    ses-suppression)      cmd_ses_suppression "${1:?usage: ses-suppression <email>}" ;;
    ses-bounces)          cmd_ses_bounces ;;
    kms-probe)            cmd_kms_probe ;;
    jwt-kid)              cmd_jwt_kid ;;

    orphans)              cmd_orphans ;;
    stubs)                cmd_stubs ;;
    unverified-members)   cmd_unverified_members "${1:-1}" ;;
    merge-drift)          cmd_merge_drift ;;
    slug-collisions)      cmd_slug_collisions ;;
    email-dupes)          cmd_email_dupes ;;

    admin-audit)          cmd_admin_audit "${1:-20}" ;;
    job-runs)             cmd_job_runs "${1:-}" ;;
    ap-expiry-health)     cmd_ap_expiry_health ;;
    legacy-claims)        cmd_legacy_claims "${1:-20}" ;;
    account-tokens)       cmd_account_tokens "${1:-}" ;;
    work-queue)           cmd_work_queue "${1:-}" ;;
    tier-status)          cmd_tier_status "${1:?usage: tier-status <member-id-or-slug>}" ;;
    ap-reminders)         cmd_ap_reminders "${1:-}" ;;
    stale-runs)           cmd_stale_runs ;;
    rate-limit-status)    cmd_rate_limit_status ;;
    worker-status)        cmd_worker_status ;;
    image-status)         cmd_image_status ;;


    db-sizes)             cmd_db_sizes ;;
    wal-size)             cmd_wal_size ;;
    split-wal-check)      cmd_split_wal_check ;;

    tls-cert)             cmd_tls_cert ;;
    origin-probe)         cmd_origin_probe ;;
    nginx-test)           cmd_nginx_test ;;
    dns-check)            cmd_dns_check ;;

    deploy-history)       cmd_deploy_history "${1:-20}" ;;
    previous-release)     cmd_previous_release ;;

    force-tick)           cmd_force_tick "${1:-}" ;;

    help|-h|--help)       cmd_help ;;
    *) echo "unknown subcommand: $sub"; cmd_help; exit 2 ;;
  esac
}

main "$@"
