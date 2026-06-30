# Footbag Website Modernization Project -- DevOps Guide

This file is the operator manual for the deployed platform. `DEV_ONBOARDING.md` takes a contributor from
nothing to a running local app, then to a stood-up staging environment, then to an activated production
environment (its Paths A through I). This guide takes over from there: it is what a System Administrator uses
to run, secure, deploy, monitor, back up, restore, and maintain the platform once it is live. It assumes the
solution architecture, functional requirements, and service boundaries are defined elsewhere and does not
repeat them.

## Table of Contents

**Front matter**
- [1. Operator Journey and Prerequisites](#1-operator-journey-and-prerequisites)
- [2. Operating Baseline](#2-operating-baseline)
- [3. Environment Differences](#3-environment-differences)
- [4. Runbook and Checklist Index](#4-runbook-and-checklist-index)

**Respond**
- [5. Incident Response and Troubleshooting](#5-incident-response-and-troubleshooting)
- [6. Operator Checklists](#6-operator-checklists)

**AWS**
- [7. AWS Account and Resource Map](#7-aws-account-and-resource-map)
- [8. AWS Operations, IAM, and Zero-Trust Access Control](#8-aws-operations-iam-and-zero-trust-access-control)
- [9. Runtime Topology and AWS Resource Layout](#9-runtime-topology-and-aws-resource-layout)
- [10. Configuration, Secrets, and Key Management](#10-configuration-secrets-and-key-management)
- [11. Terraform and Infrastructure Change Control](#11-terraform-and-infrastructure-change-control)
- [12. Monitoring, Logging, Alerting, and Cost Control](#12-monitoring-logging-alerting-and-cost-control)

**Deploy and release**
- [13. CI/CD, Release Promotion, and Deployment Workflow](#13-cicd-release-promotion-and-deployment-workflow)
- [14. Health Endpoints, Maintenance Mode, and Readiness](#14-health-endpoints-maintenance-mode-and-readiness)
- [15. SQLite, Schema Migration, and Data Operations](#15-sqlite-schema-migration-and-data-operations)

**Reliability**
- [16. Backup, Restore, and Disaster Recovery](#16-backup-restore-and-disaster-recovery)
- [17. Background Jobs and Scheduler Operations](#17-background-jobs-and-scheduler-operations)

**Routine operations**
- [18. Routine Security and Platform Operations](#18-routine-security-and-platform-operations)
- [19. Staging Refresh and Anonymization](#19-staging-refresh-and-anonymization)
- [20. Test-data Operations](#20-test-data-operations)

A detailed task-to-section index is in §4.

---

## 1. Operator Journey and Prerequisites

### 1.1 Where this guide sits

A contributor arrives at this guide after completing the relevant `DEV_ONBOARDING.md` paths:

| You have done (in DEV_ONBOARDING) | This guide is how you |
|---|---|
| Path A–C: run the app locally, learned the architecture | understand the deployed runtime you are now operating |
| Path D–F: stood up staging, learned the repeatable deploy | deploy, monitor, back up, and recover staging |
| Path G–I: hardened and activated production | run production change control, incident response, and DR |

New developers and testers operate staging only; production operations in this guide are for the initial
operator / AWS maintainer. Onboarding owns first-time bring-up and activation; this guide owns the recurring
operation of an already-live system. Where a runbook here needs a one-time setup that onboarding performs,
it points back rather than repeating the steps.

### 1.2 Operator prerequisites

Before using the privileged runbooks in this guide, confirm you have each of the following. Each is
established once during onboarding; this is the checklist, not the setup procedure.

- **Operator AWS identity.** A per-human IAM operator user with MFA, signed in per the console sign-in rules
  in §8.3. Credentials and the TOTP seed live in the KeePassXC operator credential vault
  (`DEV_ONBOARDING.md` §4.7). No shared accounts.
- **Workstation AWS runtime profile.** `~/.aws/config` carries the chained `*-runtime` AssumeRole profile
  over the operator profile, so workstation runbooks and smoke tests reach the same role the app uses
  (one-time setup in §18.8).
- **Host shell access.** A named non-root operator account on the target host with `sudo`, your own SSH key
  installed, and an `~/.ssh/config` alias (`footbag-<target>`); your current source IP within the
  Terraform-managed `operator_cidrs` allowlist (§8.5).
- **Terraform initialized per environment.** `terraform init` has been run in `terraform/staging/` and
  `terraform/production/` so `terraform output` and plan/apply resolve.
- **Workstation tooling.** Node 22, AWS CLI v2, Terraform >= 1.11, `sqlite3`, `rsync`, `jq`, Docker (for
  parity and the heavyweight pentest legs), per `DEV_ONBOARDING.md` §1.3–§1.4.

If any prerequisite is missing, complete the named onboarding section before proceeding.

### 1.3 Where credentials and facts live

The values an operator needs are sensitive or environment-specific, and none are committed to the repository.
Each lives in one of a few well-known places; this guide names the place, never the value.

| What you need | Where it lives | How to get it |
|---|---|---|
| Operator AWS console + CLI credentials and MFA TOTP seed | project credential vault (KeePassXC) | open the vault |
| Host `sudo` password | project credential vault | open the vault |
| Source-profile and CloudWatch-publisher IAM access keys | project credential vault | open the vault |
| Operator SSH private key | the operator's `~/.ssh` (per machine); the public key is Terraform-managed | local |
| Account id, static IP, KMS key ARN, bucket names, SNS topic ARN, CloudFront domain/id, instance name | Terraform state | `terraform -chdir=terraform/<env> output` |
| Runtime secrets (`SESSION_SECRET`, `X_ORIGIN_VERIFY_SECRET`) | SSM `/footbag/{env}/secrets/...`, mirrored to `/srv/footbag/env` on deploy | §10.4 |
| Operator-managed host secrets (Stripe keys, webhook secret, SES feedback key) | host `/srv/footbag/env` (root:root 0600) | §10 |

Select the CLI profile each shell session (`export AWS_PROFILE=<profile>`); it does not persist across
terminals. Regions: `us-east-1` is primary (all project resources, and the CloudFront-attached certificate),
`us-west-2` is the disaster-recovery region (§16).

---

## 2. Operating Baseline

### 2.1 Environment model

The platform runs three environments (development, staging, production) that share one logical shape but
differ in data, identity, adapter wiring, and sizing. The full per-environment difference matrix is §3. In
summary: development is local Docker Compose on synthetic data with no production credentials; staging is a
single AWS instance on anonymized production-derived data, used for deployment, rollback, secret-rotation,
and restore rehearsal; production is the live footbag.org service on real user data under conservative
change control, MFA-backed access, and full auditability.

### 2.2 Runtime shape

Production and staging use the same logical shape:

- one AWS Lightsail instance as the application origin
- CloudFront distribution(s) in front of the origin and media surfaces as required
- one SQLite database file on the instance for primary relational state
- S3 for media, backup snapshots, maintenance-page assets, and disaster-recovery storage
- CloudWatch for logs, metrics, alarms, and dashboards
- Parameter Store and KMS for secrets and cryptographic keys
- SES for email delivery
- Route 53 for DNS
- hardened per-operator SSH for exceptional operator shell access

The single-instance, no-rolling-deploy property and its consequences are described in §3.3.

### 2.3 Container roles

| Container | Role | Durable state | Operational notes |
|---|---|---|---|
| `nginx` | reverse proxy to app containers; origin-facing web entrypoint | none | small memory footprint; restart is low-risk |
| `web` | Node.js web application | none | serves HTTP requests; participates in `/health/live` and `/health/ready` |
| `worker` | background jobs, outbox processing, cleanup jobs | none | operationally critical; job failures often begin here |
| `image` | isolated image processing | none | restart independently if image processing fails; does not hold primary state |

### 2.4 State placement

| State type | Canonical location | Notes |
|---|---|---|
| relational application data | SQLite file on Lightsail instance | primary live database |
| media objects | S3 | photo originals discarded after processing; stored variants are authoritative |
| backup snapshots | S3 primary backup bucket | versioned snapshot history |
| cross-region DR copies | S3 DR bucket | Object Lock retention for disaster recovery |
| runtime admin-configurable settings | `system_config_current` view | read directly by jobs and services at runtime |
| secrets | Parameter Store `SecureString` or KMS | never in code, image layers, or committed files |
| JWT signing keys | KMS asymmetric key | non-exportable key material |
| ballot encryption master keys | KMS | runtime assumed role may generate data keys; tally role may decrypt |

### 2.5 Operating posture

This guide assumes a conservative operating posture:

- simple, explicit, reproducible changes
- Terraform authority for infrastructure
- documented runbooks for every privileged task
- CloudWatch-first monitoring
- fast restore over complex failover
- no shared credentials
- no standing production access beyond what is operationally required

---

## 3. Environment Differences

Three environments run the same logical shape but differ in data, identity, adapter wiring, and sizing. This
table is the single reference; later sections operate each row but do not redefine the per-environment values.

### 3.1 What differs by environment

| Dimension | Development | Staging | Production |
|---|---|---|---|
| Purpose | local feature work and debugging | production-like validation, migration/restore/rotation rehearsal | live footbag.org service |
| Compute | local Docker Compose | single Lightsail `nano_3_0` (512 MB) | single Lightsail `medium_3_0` (4 GB) |
| Data policy | synthetic / fixture data | anonymized production-derived data only | real user data |
| `SES_ADAPTER` | `stub` | `stub` (deploy forces; boot-fails on `live`) | `live` (boot-fails if not `live`) |
| `PAYMENT_ADAPTER` | `stub` | `stub` (seeded where absent; `live` allowed for rehearsal) | `live` (boot-fails on `stub`) |
| `MEDIA_STORAGE_ADAPTER` | `local` | `s3` | `s3` |
| `SECRETS_ADAPTER` | `local` (`.local/secrets.json`) | `live` (SSM) | `live` (SSM) |
| `SAFE_BROWSING_ADAPTER` | `stub` | `live` | `live` |
| `JWT_SIGNER` | `local` (PEM) | `kms` | `kms` |
| `CAPTCHA_ADAPTER` (Turnstile) | `stub` | `stub` | `stub` by default; set `CAPTCHA_ADAPTER=live` to enable real Turnstile (not auto-forced) |
| `HTTP_REACHABILITY_ADAPTER` | `stub` | `live` | must be set explicitly to `live` or `disabled` (no default; boot-fails if unset) |
| `TRUST_PROXY` hop count | `0` | `2` (nginx + CloudFront) | clean cutover chain is CloudFront → nginx = `2` from go-live; no legacy front-door hop |
| `LOG_LEVEL` | `info` | `info` | `warn` |
| SSM namespace | `/footbag/development/...` | `/footbag/staging/...` | `/footbag/production/...` |
| KMS key alias | none (local keypair) | `alias/footbag-staging` | `alias/footbag-production` |
| Stripe key mode | n/a | test-mode `sk_test_...` | live-mode `sk_live_...` |
| Dev shortcuts (`FOOTBAG_DEV_*`, persona harness) | enabled | `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` via deploy transport; persona harness on | absent from image; boot-refused if set |
| First-admin mechanism | email allowlist | `--seed-dev-admins` deploy flag | single-shot SSM claim token (`/admin/bootstrap-claim`) |
| Continuous DB backup / DR | not used | systemd timer + nightly cross-region DR | systemd timer + nightly cross-region DR |

### 3.2 Container sizing per environment

Memory limits and encoder tuning are env-driven so the same `docker-compose.prod.yml` overlay sizes correctly
from the committed `docker/env/<environment>.env`, seeded into `/srv/footbag/env` on deploy and asserted by
the host-env verification runbook (§10.13).

| Variable | Staging (`docker/env/staging.env`) | Production (`docker/env/production.env`) |
|---|---|---|
| `NGINX_MEMORY_LIMIT` | `64M` | `128M` |
| `WEB_MEMORY_LIMIT` | `192M` | `512M` |
| `WORKER_MEMORY_LIMIT` | `96M` | `384M` |
| `IMAGE_MEMORY_LIMIT` | `256M` | `896M` |
| `IMAGE_MAX_CONCURRENT` | `1` | `2` |
| `VIDEO_X264_PRESET` | `veryfast` | `medium` (x264 default; `production.env` sets no override) |
| `VIDEO_X264_THREADS` | `1` | auto (x264 default) |
| `VIDEO_X264_RC_LOOKAHEAD` | `10` | `40` (x264 default) |

Video-encoder tuning is env-driven: `docker/env/staging.env` sets `VIDEO_X264_PRESET` / `_THREADS` /
`_RC_LOOKAHEAD` explicitly to fit the small staging host. `docker/env/production.env` sets no override,
and the `docker-compose.prod.yml` overlay passes an empty value through when none is set, so production
transcodes at x264's canonical defaults (`medium` preset, auto threads, rc-lookahead 40).

### 3.3 Single-instance property

Production and staging each run as a single Lightsail node with no rolling deploy: a deploy brings the stack
down (`compose down`) and back up (`compose up`); there is no canary, no blue/green, no parallel instance.
Backward-incompatible env-var or trust-chain changes therefore land cleanly without an in-flight version
mismatch. This property is load-bearing: any future move to a multi-instance topology must re-evaluate
trust-proxy parsing, env-var migration ordering, and secret-rotation atomicity.

---

## 4. Runbook and Checklist Index

Every privileged operation has a runbook or checklist. Find the task, go to the section.

### 4.1 Deploy and release
- Standard deployment runbook (§13.3); rollback (§13.4); restart (§13.5); cutover rollback (§13.6).
- Pre-deploy host-env verification (§10.13); pre-deploy drift check (§11.7).

### 4.2 Secrets and key rotation (§10)
- Stripe key / webhook secret (§10.5); JWT/KMS signing key (§10.6); source-profile access keys (§10.7);
  `SESSION_SECRET` (§10.8); origin-verify shared secret (§10.9); Safe Browsing API key (§10.10);
  SES feedback webhook key (§10.11); Turnstile keys (§10.14).

### 4.3 Backup, restore, and DR (§16)
- Snapshot restore (§16.5); cross-region disaster restore (§16.6); backup-timer install (§16.2);
  backup validation and restore drills (§16.7).

### 4.4 Data and migration
- Schema migration runbook (§15.3); data-access rules (§15.4); staging refresh and anonymization (§19);
  test-data / dev-admin seed (§20); production first-admin bootstrap (§10.12 / §20.8).

### 4.5 AWS and infrastructure
- ACM certificate issuance (§9.2.1); SES production-access ticket (§9.5); SES feedback-loop activation
  (§10.11); cost-alarm threshold tuning (§12.7); Terraform standard workflow (§11.3); emergency
  console-change reconciliation (§11.5).

### 4.6 Cutover
- Cutover preflight checklist (§6.6); DNS cutover sequence (§6.7); external DNS/mail upstream coordination
  (§6.8); MX-to-Google mail cutover (§6.8); environment bring-up sequence (§6.9).

### 4.7 Respond (§5)
- Standard incident flow (§5.1); first-checks-by-symptom (§5.2); readiness-failure (§5.3), secret/config
  (§5.4), and SSH (§5.5) troubleshooting; Stripe webhook incident response (§5.7); log-collection commands
  (§5.6); postmortem template (§5.8); on-call and escalation (§18.9).

### 4.8 Operator checklists (§6)
- Production deployment (§6.1); secret rotation (§6.2); snapshot restore (§6.3); access review (§6.4);
  backup drill (§6.5); cutover preflight (§6.6).

---

## 5. Incident Response and Troubleshooting

### 5.1 Standard incident flow

1. Detect via alarm, dashboard, or user report.
2. Classify: deploy issue, origin issue, database issue, job issue, secret/config issue, AWS service issue, cost/security issue.
3. Stabilize the user experience; maintenance page is acceptable while diagnosing.
4. Gather evidence from logs, metrics, and recent changes.
5. Recover using the smallest safe runbook: restart, rollback, restore, or infra fix.
6. Verify health.
7. Document cause, action, and follow-up.

### 5.2 First checks by symptom

| Symptom | First checks |
|---|---|
| CloudFront showing maintenance page | origin reachability, recent deploy, readiness failure, memory alarms, nginx/web process health |
| `/health/live` fails | process crash, container restart loop, host issue |
| `/health/live` passes but `/health/ready` fails | SQLite access, memory pressure (backup freshness is alarm-surfaced per §16, not a readiness signal) |
| spike in 5xx | recent deploy, migration, secret rotation, upstream AWS auth errors, DB contention |
| backups failing | worker health, S3 permissions, bucket reachability, disk space, WAL/checkpoint issues |
| Stripe webhooks failing | webhook secret mismatch, signature validation, recent rotation, handler logs |
| SES complaint/bounce spike | sender reputation, template issue, recipient list problem, SES status |
| repeated `SQLITE_BUSY` | long transaction, backup overlap issue, migration, abnormal write load |
| no transactional email arriving (verify, password reset, confirmation) | locate the stuck outbox stage per §9.5 pipeline table; check worker container status; check SES sandbox verification for sender and recipient |
| high memory | image job pressure, worker leak, large request behavior, recent release |
| host unreachable on every port right after a deploy | suspected host OOM (rare now that the host never builds) or a wedged host; the control plane may still report `running` — recover per §13.1 |

### 5.3 Readiness-failure troubleshooting

If `/health/ready` is failing:
1. inspect the readiness output/check list
2. confirm the SQLite file is accessible and not corrupt
3. confirm the application boot completed far enough to serve the public slice
4. inspect recent deploy logs and restart history
5. if failure began after deploy, consider rollback
6. if failure is data-related, consider the restore path

If backup freshness alarms are firing while readiness still passes:
1. inspect worker health and job-run history
2. inspect S3 permissions and bucket reachability
3. inspect WAL/checkpoint and disk-space conditions
4. repair backup operations without redefining readiness semantics

### 5.4 Secret/config troubleshooting

Common causes:

- wrong `/footbag/{env}/...` path
- stale container process with cached startup values
- KMS permission mismatch
- wrong environment secret used in deployment
- missing restart after secret change
- container missing an env var that the shared config loader (`src/config/env.ts`) validates at module load, even if that container does not functionally use the var. The `worker` service imports the same config loader as `web` and therefore requires `PORT`, `PUBLIC_BASE_URL`, and `SESSION_SECRET` in its compose environment despite binding no port and signing no cookies; symptom is `Missing required environment variable: <NAME>` at startup and a crash-loop `Restarting (1)` status from `docker ps`.

Resolution order:

1. verify path and environment
2. verify IAM and KMS rights
3. verify parameter metadata and last update
4. restart or redeploy affected container
5. re-test the dependent path

### 5.5 SSH access troubleshooting

If SSH access fails:

- verify the instance is running and that you are using the correct public IP or static IP
- verify the Lightsail firewall still permits port 22 from your current approved source IP or CIDR
- verify you are using the correct named host account
- verify you are using the correct private key and that the matching public key is still installed on the host
- verify the host account has not been disabled or had `sudo` removed
- if emergency access requires a temporary firewall change, document the reason and narrow the rule again immediately after recovery

### 5.6 Standard log-collection commands

Run these from the operator workstation (replace `footbag-staging` with the target host SSH alias).

```bash
# Service status
ssh footbag-staging "sudo systemctl status footbag --no-pager -l"

# Recent journal entries
ssh footbag-staging "sudo journalctl -u footbag -n 50 --no-pager"

# Extended journal with full context (use for startup failures)
ssh footbag-staging "sudo journalctl -xeu footbag.service --no-pager | tail -50"

# Running containers
ssh footbag-staging "docker ps"

# Web container logs via Compose
ssh footbag-staging "sudo docker compose \
  -f /srv/footbag/docker/docker-compose.yml \
  -f /srv/footbag/docker/docker-compose.prod.yml \
  logs web --tail=30"

# Web container logs directly (useful when Compose context is unavailable)
ssh footbag-staging "sudo docker logs docker-web-1 2>&1 | tail -30"
```

Always use `sudo systemctl restart footbag`, not `start`. The `start` command is a no-op if the service is already active.

#### Staging diagnostics harness

`scripts/staging_diagnostics.sh` is the operator-side, read-only inspection harness: it SSHes to the host and runs `docker compose exec` queries against the staging SQLite DB plus host-level checks (read-only except an explicit `state-change` group). Run `bash scripts/staging_diagnostics.sh help` for the full menu. Useful groups:

- **Service/host:** `status`, `health`, `systemd`, `mem`, `disk`, `worker-status`, `image-status`.
- **Logs:** `web-logs`, `worker-logs`, `nginx-logs`, `all-logs`.
- **Background jobs:** `job-runs [name]`, `ap-expiry-health`, `stale-runs`, `work-queue`.
- **Email/outbox:** `outbox`, `outbox-pending`, `dead-letter`, `ses-identity`, `ses-quota`, `ses-suppression <email>`, `ses-bounces`.
- **Identity/claim:** `member <email|slug>`, `tier-status <member>`, `legacy-claims`, `account-tokens [member]`.
- **AWS/edge:** `aws-whoami`, `kms-probe`, `jwt-kid`, `tls-cert`, `origin-probe`, `nginx-test`, `dns-check`.
- **Data integrity:** `db-counts`, `integrity`, `wal-size`, `orphans`, `slug-collisions`, `email-dupes`.

Reach for it first during an incident: it surfaces the stuck outbox stage, a crash-looping worker, a claim/token problem, or an AWS-identity break without hand-writing SSH and SQL each time.

### 5.7 Stripe webhook health and incident response

Symptom-to-checks tree:

| Symptom | First checks |
|---|---|
| Stripe Dashboard shows webhook delivery failures | webhook endpoint reachable from public internet; CloudFront not blocking the webhook path; nginx X-Origin-Verify header is not breaking the request (Stripe does not send X-Origin-Verify, so the path must be exempt at the edge); CloudFront cache behavior for `/payments/webhook` does not strip the POST body |
| Signature validation failures in app logs | the host env `STRIPE_WEBHOOK_SECRET` (`/srv/footbag/env`) matches the signing secret in the Stripe Dashboard for that endpoint; recent rotation per §10.5 was completed and the app was restarted afterward; request timestamp skew (Stripe rejects events older than 5 minutes by default; the app should match); raw payload preserved exactly (Express body parsing must capture the raw body before JSON parsing) |
| Idempotency table grows without corresponding payment progress | the handler is inserting into `stripe_events` but failing in the subsequent transaction; check error logs for the specific `event_id`; verify the state-machine transitions are valid for the incoming event |
| Stripe retries exhausted (event marked failed in the Dashboard) | use the Stripe Dashboard event view to replay the event manually; if the issue is now fixed, the replay succeeds; if not, fix the root cause and replay |

Resolution order:

1. Confirm the webhook endpoint is reachable: `curl -I https://<domain>/payments/webhook` from outside the network. Expect 405 Method Not Allowed (or 200 to OPTIONS), not connection refused or 404.
2. Verify the signing secret: confirm `STRIPE_WEBHOOK_SECRET` in `/srv/footbag/env` matches the Stripe Dashboard webhook view.
3. Check app logs for the failing `event_id`; distinguish signature-validation error from handler error.
4. If the signing secret was recently rotated, confirm the app has restarted since rotation (per §10.5).
5. If the issue is transient or fixed, replay the failed event from the Stripe Dashboard. If the failure persists, escalate per §18.9.

### 5.8 Incident postmortem template

Use after any SEV-1 or SEV-2 incident (per §18.9). Within one week of resolution, capture the following sections:

**Title**: one-line incident name plus severity plus duration (e.g. "SEV-1 origin outage 2026-04-27 14:15 to 15:02 UTC").

**Summary**: one paragraph covering what happened, who noticed, how it was resolved.

**Timeline**: chronological list, each entry `<UTC time>: <event or action>`. Start at first signal (alarm fired, user report) and end at full recovery.

**Impact**: users affected (count or fraction), transactions lost, revenue impact (Stripe webhook gap), data integrity (any rows affected). If unknown, say so explicitly and add a follow-up to investigate.

**Root cause**: the single change or condition that caused the incident. If multiple, identify the primary one and list contributors separately.

**Contributing factors**: anything that made the incident worse than it had to be (slow detection, missing alarm, ambiguous runbook, deferred work).

**Immediate fix**: what was done to recover. Include any temporary workarounds left in place.

**Prevention measures**: concrete actions to prevent recurrence. Each one carries an owner and a due date. Example: "Add CloudWatch alarm on `BackupAgeMinutes` exceeding 10 minutes (owner: maintainer, due: 2026-05-15)".

**Lessons learned**: short list of generalizable insights (not action items, just observations).

Cadence and rules:

- postmortem complete within one week of resolution
- reviewed at the next monthly routine task per §18.1
- blameless framing: focus on systems, processes, and decisions; do not name individuals as responsible parties
- prevention measures are tracked to completion; carry forward each month if not done by the due date

Storage: a `docs/postmortems/` subdirectory committed to the repository, one Markdown file per incident named `YYYY-MM-DD-<short-slug>.md`. Postmortems are part of the operational record and are reviewed during volunteer onboarding per §18.6.

---

## 6. Operator Checklists

### 6.1 Production deployment checklist

- CI green
- Terraform changes reviewed and applied if needed
- staging validated
- migration reviewed if applicable
- backup current
- secret changes verified
- no CloudFront invalidation already in flight (relevant when the deploy changes a cached public template)
- deploy completed
- `/health/live` passes
- `/health/ready` passes
- smoke tests pass
- alarms quiet
- working tree committed and pushed (the deploy ships the local working tree via Dockerfile COPY, not git HEAD; CI validates the change only once it is pushed)

### 6.2 Secret rotation checklist

- change approved
- new value created
- stored under correct `/footbag/{env}/...` path (or `/srv/footbag/env` for `SESSION_SECRET` per §10.8)
- staging validated
- deploy/restart completed
- live verification completed
- grace period observed if dual-key flow used
- old value removed
- audit note recorded

Per-secret runbooks: §10.5 (Stripe), §10.6 (JWT/KMS), §10.7 (source-profile access keys), §10.8 (`SESSION_SECRET`), §10.9 (origin-verify), §10.10 (Safe Browsing), §10.14 (Turnstile).

### 6.3 Snapshot restore checklist

- maintenance state active
- restore point identified
- integrity check passed
- live DB replaced safely
- services restarted
- health endpoints pass
- smoke tests pass
- maintenance state removed
- incident notes updated

### 6.4 Access review checklist

- current System Administrator list reviewed
- production access list reviewed
- unused access removed
- offboarding completed
- Parameter Store write access reviewed
- KMS key policy reviewed
- findings documented

### 6.5 Backup-drill checklist

- snapshot selected
- restore target prepared
- restore executed
- health verified
- critical workflows tested
- timing recorded
- issues logged
- follow-up actions assigned

### 6.6 Cutover preflight checklist

The cutover preflight orchestrator sequences the validation gates from `MIGRATION_PLAN.md` §24. Manual operator preconditions before invoking it:

- ACM certificate for footbag.org issued in us-east-1 and attached to the production CloudFront distribution. Issuance is operator-initiated through AWS Support and allows several days of lead time; the cert is requested with both `footbag.org` and `www.footbag.org` covered.
- SES sending domain verified end-to-end on the production account, SPF/DKIM/DMARC records published, sandbox exit complete, bounce and complaint SNS topics subscribed. See §9.5 and §18.5. A test send from the production account to the operator mailbox confirms the path.
- DNS TTL on the legacy footbag.org zone reduced to 60 seconds at least 48 hours before the DNS swap. Webmaster coordination per `MIGRATION_PLAN.md` §19 item 18; capture the lowered-TTL timestamp in the cutover log.
- `footbag.org` MX already repointed to Google Managed Services in the discrete pre-T-0 mail-cutover step, all active `@footbag.org` aliases provisioned on Google, and inbound delivery verified end-to-end (MIGRATION_PLAN gate EX7 / §29.12a; runbook §6.8 MX-to-Google mail cutover). The web cutover does not change MX.
- Pre-cutover database snapshot taken and integrity verified per §16.5. Manifest captured (snapshot id, byte size, row counts for `members`, `legacy_members`, `historical_persons`, `name_variants`, `club_bootstrap_leaders`).
- Dev-admin shortcuts confirmed absent from the production runtime via `scripts/audit-dev-shortcuts.sh`; expected count is zero.
- `npm run test:smoke` and `npm run test:e2e` green against the production origin.

Each precondition halts the cutover if it fails. The orchestrator's pass means all gates are satisfied; the operator's go signal completes the cutover. After DNS swap, follow up with §18.10 (HoF and BAP honors oversight) and §13.6 (Cutover rollback decision rule) as needed.

The orchestrator's `CLAIM-SAFETY` gate re-runs the integration suite against the shipped working tree. Because a deploy ships the working tree rather than a committed SHA, this is the authoritative check that the artifact going live passes the claim-flow safety gates (anti-enumeration, rate limiting, claim and auto-link, mailbox-control round-trip, admin help-request). A cutover deploy must not pass `SKIP_TESTS=yes`, which would bypass the equivalent deploy-time `npm test`; the preflight gate is the backstop that the live artifact is verified.

### 6.7 DNS cutover sequence runbook

The DNS cutover swaps `footbag.org` and `www.footbag.org` from the legacy origin to the CloudFront distribution attached to the production certificate. The sequence is gated on §6.6 having passed; once started it is operator-driven and runs to completion before any further write traffic is taken. This sequence swaps only the apex and `www` A/AAAA records; it does not touch MX. The `@footbag.org` MX move to Google is a separate, earlier step (§6.8 MX-to-Google mail cutover; MIGRATION_PLAN §29.12a) completed before T-0, so the apex swap is MX-neutral. Retained `*.footbag.org` subdomains (including the `ifpa.` mail host) keep their existing records and must not be altered or clobbered by the apply.

The numerics below (60s TTL pre-shrink, T+24h TTL restore, T-0 to T+1h rollback window) are the generic-procedure defaults used for staging dry-runs and any cutover without its own overrides. For production footbag.org: the go-live cutover is the `www`/apex DNS switch itself (MIGRATION_PLAN §29.12), so this runbook applies at cutover, and it governs again later at the post-stability Route 53 zone migration, where MIGRATION_PLAN §29.12 additionally requires a fresh zone snapshot first so mail and retained-subdomain records copy faithfully into Route 53. Where MIGRATION_PLAN §29.12 and this section disagree, MIGRATION_PLAN §29.12 wins for footbag.org.

Sequence:

**T-48 hours -- TTL drop.** Run `scripts/dns-ttl-preflight.sh` (or apply the equivalent Terraform change) to lower the TTL on the apex and `www` records on the *legacy* zone to 60 seconds. Both A/AAAA records are covered. Record the timestamp + resolver-observed TTL in the cutover log. From this point, any rollback before T-0 propagates within one minute.

**T-0 -- record swap.** Replace the legacy-origin A/AAAA records with `aws_route53_record` ALIAS entries pointing at the production CloudFront distribution (Z2FDTNDATAQYW2 for CloudFront). Apply via Terraform from `terraform/production/`. Record the apply timestamp and the Route 53 ChangeInfo id (`aws route53 get-change --id <id>` returns `INSYNC` when Route 53's authoritative servers have propagated; this typically lands in 30-60 seconds).

**T+1 hour -- propagation check across three resolvers.** Run from the operator workstation:

```
for resolver in 1.1.1.1 8.8.8.8 9.9.9.9; do
  echo "=== ${resolver} ==="
  dig @${resolver} footbag.org A +short
  dig @${resolver} www.footbag.org A +short
done
```

All three should return CloudFront edge IPs (the `aws-cloudfront-net` block) and not the legacy origin. If one resolver still returns the legacy IP after one hour, re-check the TTL on the *legacy* zone's authoritative servers; some upstream resolvers honor the long-cached SOA negative-cache window beyond the record TTL. A single straggler that resolves correctly via the others is tolerable; broad divergence is a rollback trigger.

**T+1 hour -- end-to-end verification.** `curl -sf https://footbag.org/health/live` and `curl -sf https://www.footbag.org/health/live` from at least one network outside the operator's primary ISP. Both must return HTTP 200 with the production cert presented. A 4xx/5xx from the new origin is a rollback trigger.

**T+1 hour -- retained-subdomain check.** Confirm every retained `*.footbag.org` subdomain (per `MIGRATION_PLAN.md` §19 item 16) still resolves to the legacy host and was not altered by the apply. Do not print any private operator-only subdomain into shared logs or output.

**T+24 hours -- TTL restore.** With the cutover stable, raise the TTL on the (now Route 53-managed) apex + `www` records to the long-term default (3600s). Re-apply Terraform; record the timestamp.

Rollback (anywhere from T-0 to T+1 hour): apply the prior Terraform state pinning the legacy-origin A/AAAA records. With TTLs at 60s, world resolves to the legacy origin inside two minutes. Past T+1 hour, rollback is still possible but accumulates the cost of any writes that landed on the new origin while DNS was diverging; consult the rollback decision framework in `MIGRATION_PLAN.md` §27 before triggering.

Dry-run note: dry-run the full sequence against the staging zone before production. Staging uses `staging.footbag.org` (or whatever the staging zone resolves to in `terraform/staging/route53.tf`); the same sequence applies and exercises the same Terraform pathways. A green dry-run confirms the Terraform module, the AWS profile permissions, and the propagation-check tooling all work before they're load-bearing on production.

### 6.8 External DNS/mail upstream coordination runbook

Whenever the platform's DNS zone or MX records are owned by an external operator (the legacy-site webmaster today; potentially other upstreams in future), changes that touch the records below cannot be applied without coordinated action. This runbook covers the long-term coordination pattern; cutover-specific applications layer their own gates on top (e.g. `MIGRATION_PLAN.md` §19 for the legacy-webmaster contract, §29.12 for the DNS cutover).

When this runbook applies:

- The maintainer needs ACM DNS validation records published on an upstream-owned zone.
- The maintainer needs apex or `www` A/AAAA/CNAME/ALIAS records swapped on an upstream-owned zone.
- The maintainer needs MX records updated or repointed.
- Any of the above need to be reverted under time pressure (DNS rollback).

When this runbook does NOT apply:

- The zone is in the maintainer's own Route 53 account (apply via Terraform directly; no external coordination needed).
- The change is read-only (DNS lookups, propagation checks). Read-only verification does not require upstream action.

Communication touchpoints:

- Primary contact: the operator's documented address for the upstream. For the legacy-site webmaster this is `brat@footbag.org` (DD §5.5); for other upstreams, capture the address in the operator's local secrets store alongside other per-upstream credentials.
- Lead time: minimum 7 days for any scheduled change (TTL pre-shrink, ACM validation publication, record swap window). Emergency rollback is faster (single record revert; see "Emergency rollback" below) but should still page the upstream operator immediately so they're aware the platform is in incident state.
- Handoff payload: the maintainer hands over a single message containing (a) the records to change with exact name + type + value + TTL, (b) the requested time window, (c) the maintainer's verification step the upstream operator can run after applying (typically `dig @<upstream-resolver> <name> <type>`), and (d) the rollback record values to keep in their back pocket.

Zone-authority handoff checklist (when transferring ownership of an upstream-owned zone to the maintainer's Route 53 account):

1. Stand up the target Route 53 hosted zone in the maintainer's account; capture the NS records the zone advertises.
2. Mirror every existing record from the upstream zone into the Route 53 zone. Verify with `dig @<target-NS> <name> <type>` from outside that the new authoritative servers return the same answers as the upstream.
3. Coordinate a registrar NS change with the registrar of record (this is a registrar action, not an upstream DNS-host action; identify the registrar via `whois <domain>`). NS changes propagate inside 24-48 hours but can take longer at non-compliant resolvers.
4. After NS change, leave the upstream zone live for at least 7 days so resolvers that cached the old NS records continue to get correct answers during the propagation window.
5. After 7 days, retire the upstream zone or hand it back to the upstream operator per their preference.

Emergency rollback:

- The upstream operator's contact path must be reachable on demand; document the secondary contact (phone, alternate email) before any cutover involving their zone.
- Rollback content: the prior record values are captured at change-publish time so a revert requires re-publishing one or two records, not re-deriving them. Keep these in the cutover log.
- TTL implications: if the cutover lowered TTLs to a propagation-friendly value (60-300s), rollback propagates within that TTL. If TTLs were not lowered (a change made under time pressure without the §6.7 pre-shrink), rollback propagation is bounded by the original record TTL.

Audit trail: every coordinated change produces (a) the maintainer's handoff message, (b) the upstream operator's confirmation that the change is live, and (c) the maintainer's post-change verification log (`dig` output from three resolvers per §6.7). Retain these in the operations log alongside the change itself; they are the evidence trail for the cutover sign-off and for any future rollback decision.

#### MX-to-Google mail cutover (footbag.org)

The ordinary `@footbag.org` inbound move to Google Managed Services is a discrete step run before the apex/`www` web cutover (decoupled; `MIGRATION_PLAN.md` §28 Email transition and §29.12a). It is gated by zone authority and a confirmed alias inventory, and tracked by MIGRATION_PLAN gate EX7. Outbound SES is unaffected (DKIM-based, MX-independent). `@ifpa.footbag.org` on llic.net is untouched.

Skeleton (detailed provider click-paths are filled in when the step is first executed and validated):

1. Provision every active `@footbag.org` mailbox or alias on Google from the confirmed inventory; send a test message to each and confirm receipt.
2. Update the `footbag.org` SPF record to authorize both AWS SES (outbound) and Google (inbound); publish Google's required DNS records alongside the SES DKIM CNAMEs.
3. Pre-shrink the `footbag.org` MX TTL (coordinate via the §6.8 upstream handoff if the zone is upstream-owned).
4. Repoint the `footbag.org` MX to Google. Optionally keep the legacy mail server as a transient lower-priority backup MX until Google delivery is confirmed.
5. Verify inbound end-to-end to every provisioned address from an external account; confirm DMARC alignment holds.
6. Once confirmed, withdraw legacy `@footbag.org` delivery and remove the backup MX.

Rollback: if Google inbound fails verification, revert the `footbag.org` MX to the legacy mail server (authoritative until step 6). The web cutover (§6.7) is independent and unaffected. Never modify the `ifpa.footbag.org` MX during this step.

### 6.9 Environment bring-up sequence

The ordered sequence for standing up a staging or production environment from provisioned infrastructure to serving traffic. Steps 3, 5, 6, and 7 are milestone-gated rather than same-day: run them when their milestone arrives, not eagerly. At any point, `scripts/bringup-status.sh --target <staging|production> --profile <profile>` reports each step as DONE / PENDING / UNKNOWN with the exact next command.

1. **Host env file** (`/srv/footbag/env`, per host). Set `TRUST_PROXY` to the exact X-Forwarded-For hop count (staging 2; production 2 under the clean cutover, the CloudFront → nginx chain with no legacy front-door hop) and `BACKUP_S3_BUCKET` to the environment's db-snapshots bucket. A missing `TRUST_PROXY` degrades to coarse per-edge rate limiting; a missing `BACKUP_S3_BUCKET` blocks step 4's uploads. Verify: `scripts/verify-staging-env.sh --target <t>` (§10.13).
2. **Terraform** (staging first, then production). `terraform -chdir=terraform/<t> plan`, review, `terraform import` any Console-created resource before applying (§11), then apply. The gated flags (`enable_backup_alarm`, `ses_feedback_webhook_url`, and on production only `enable_cutover_login_alarm`) default off and are flipped by the later steps.
3. **Payments activation** (at the payments-activation milestone, not before). `scripts/activate-payments.sh --target production --profile <prod-profile>` (§10.5): Stripe key to SSM, Dashboard webhook endpoint (manual, the script pauses for it), host env flip to `PAYMENT_ADAPTER=live` + `STRIPE_WEBHOOK_SECRET`, PAYMENTS-BOOT gate. Production refuses to boot on the stub adapter, so this precedes the production go-live deploy.
4. **Backup timer.** `scripts/install-backup-timer.sh --target <t>` (§16): installs and starts the systemd pair and runs the first snapshot immediately. After two `BackupAgeMinutes` datapoints, set `enable_backup_alarm = true` in `terraform/<t>/terraform.tfvars` and apply.
5. **SES feedback loop** (§10.11). Set the `ses_feedback_webhook_url` tfvar (full webhook URL including `?key=<SES_FEEDBACK_WEBHOOK_KEY>`; the variable is sensitive, keep it out of committed tfvars), apply, confirm the SNS SubscribeURL recorded in the `email.sns_subscription_pending` audit row, then validate with `scripts/verify-prod-email.sh --profile <prod-profile> --confirm-production --bounce-probe`.
6. **First admin** (production; §10.12). Provision the single-shot bootstrap token in SSM, hand it off out-of-band, and verify the parameter self-deletes after the claim.
7. **Cutover login alarm** (production, cutover window only). Set `enable_cutover_login_alarm = true` and apply for the window; set it back to false and apply after. The variable exists only in `terraform/production/`; steady state is off. (Staging has no cutover-login alarm.)
8. **Deploy.** `./deploy_to_aws.sh` (ships the local working tree; §13). The per-deploy gates live in §6.1.

---

## 7. AWS Account and Resource Map

Every AWS resource the platform depends on, what it is for, and the section that operates it. Concrete
account IDs, IP addresses, and bucket names are operator-local and are never committed; this map names
resource roles, not literal identifiers.

| Resource | Role | Operated in |
|---|---|---|
| AWS account + region (`us-east-1`) | all project resources; CloudFront-attached certs must be us-east-1 | §8 (access); §11 (Terraform) |
| Lightsail instance + static IP + firewall | application origin; ports 80 (CloudFront), 22/2222 (operator CIDRs) | §9.6; §8.5 |
| CloudFront distribution(s) | edge cache, TLS termination, maintenance-page fallback, `/media/*` OAC origin | §9.1; §14 |
| ACM certificate (us-east-1) | apex + `www` TLS for the distribution | §9.2.1 |
| S3 media bucket + media DR bucket | processed media; cross-region replica | §16.4 |
| S3 primary snapshot bucket + snapshot DR bucket | 5-minute SQLite snapshots; nightly DR with Object Lock | §16.2, §16.3 |
| S3 maintenance-asset bucket/prefix | CloudFront maintenance page assets | §14.3 |
| KMS JWT signing key (asymmetric) | non-exportable token signing; `Sign` + `GetPublicKey` | §10.6 |
| KMS ballot master key | envelope encryption; decrypt reserved to tally role | §10.6 |
| Parameter Store `/footbag/{env}/...` | secrets and config references; `SecureString` for secrets | §10.2 |
| SES (outbound only) | transactional mail from verified domain identities | §9.5 |
| Route 53 | public DNS when a real domain is attached | §9.2; §6.7 |
| CloudWatch logs/metrics/alarms/dashboards | monitoring substrate | §12 |
| SNS topics | alarm and SES feedback fan-out | §12.5; §10.11 |
| AWS Budgets + cost alarms | spend tracking and overrun alerting | §12.6, §12.7 |

Inbound `@footbag.org` mail is handled by Google Managed Services, not SES or any AWS resource; SES is
outbound-only and configures no receiving rules.

---

## 8. AWS Operations, IAM, and Zero-Trust Access Control

### 8.1 Access-control principles

The AWS side of this project must be operated as a zero-trust environment:

- every human and workload identity is authenticated explicitly
- every permission is environment-scoped and least-privilege
- production access is narrower than development and staging access
- all privileged actions are auditable
- no role in the web app implies AWS access
- application-level administration and AWS/system administration remain separate
- production access requires MFA and must be temporary whenever practical
- shell access uses hardened per-operator SSH with restricted source IPs, not shared shell credentials

### 8.2 Role and boundary matrix

| Role | Where it exists | May do | Must not do |
|---|---|---|---|
| Application Administrator | inside the web app | moderate content, manage work queues, view app health, acknowledge alarms, adjust application runtime settings exposed by the app | change AWS resources, rotate secrets in AWS, modify IAM, view CloudTrail, run Terraform |
| System Administrator | AWS + repository + CI/CD | provision and change infrastructure, deploy code, rotate secrets, manage IAM, manage CloudWatch, restore backups, respond to incidents | use AWS access as a substitute for ordinary app administration; make undocumented console changes |
| Host System Administrator shell account | Lightsail host | connect by SSH for deployment, restore, patching, and diagnostics using a named non-root account with `sudo` and an individually assigned key | act as a shared account, use a shared private key, or stand in for the application runtime principal |
| Application runtime assumed role | selected through AWS shared config/shared credentials and service-specific profile selection | access only the AWS APIs the running application needs | perform broad account administration or stand in for human operator access |
| Voting tally role | restricted privileged role | decrypt ballot envelope keys during controlled tally operations only | run normal web traffic; broad infrastructure management |
| CI/CD deploy role | GitHub Actions or equivalent deployment identity | build, publish, and deploy the approved release path | read unrelated secrets or perform manual troubleshooting tasks |

### 8.3 Human AWS access rules

#### Non-negotiable rules

- No shared AWS usernames or shared shell accounts.
- Production access requires MFA.
- Production access must be justified by an approved change, deployment, incident, drill, or access review.
- Use temporary credentials or role assumption whenever the chosen AWS account model allows it.
- Separate non-production access from production access.
- Access to Parameter Store, KMS, S3, SES, CloudWatch, and Terraform state must be granted separately by role and environment.
- A person who can administer the application in the browser is **not** automatically a System Administrator.
- Direct inspection of member data through shell or SQLite tools is exceptional and must be tied to a documented incident, migration, or recovery need.

#### Minimum access review cadence

| Review | Cadence | Owner |
|---|---|---|
| IAM user/role membership review | quarterly | System Administrator lead |
| production-access and host SSH access review | quarterly and after volunteer offboarding | System Administrator lead |
| Parameter Store access review | quarterly | System Administrator lead |
| KMS key policy review | annually and after major role changes | System Administrator lead |
| CloudTrail review for privileged activity | monthly | System Administrator lead |
| break-glass / emergency access review | after every use | incident lead |

#### Operator console sign-in

AWS Console sign-in for any IAM operator user requires three credential elements:

1. AWS account ID.
2. IAM user name.
3. Password and a time-based one-time-password (TOTP) MFA code.

The account ID, password, and TOTP seed for each operator's IAM user are held in the project's operator credential vault (see `docs/DEV_ONBOARDING.md` §4.7), managed in KeePassXC. The vault stores the TOTP seed alongside the password, so the same tool that autofills the password also generates each MFA code.

- Vault access is restricted to current project maintainers. Volunteer turnover requires explicit vault handoff through a private, unarchived channel. Never share the vault file or its master key over email, chat, any repository, or any archived medium.
- Root sign-in is reserved for account recovery and billing. Do not use root for routine operations. See `docs/DEV_ONBOARDING.md` §4.5 for root MFA setup.
- Operator IAM users are per-human. Do not share an operator user's credentials or MFA device across contributors.
- Revoke operator access per §18.6: remove the IAM user's MFA device, deactivate and delete its access keys, and remove the vault entry. Confirm no other shared resource grants retained access.

After sign-in, confirm the Console region selector (top-right) is `US East (N. Virginia) us-east-1` before making resource changes. Project resources live in `us-east-1`; wrong-region edits produce silent drift or `NotFoundException` at runtime.

### 8.4 Workload IAM model

The workload AWS principal must be a narrow and explicit runtime assumed role. Do not describe it as an EC2-style role attached to the Lightsail host. Operator SSH access to the host is a separate mechanism and must not be confused with the runtime principal.

Lightsail does not support EC2 instance profiles. The runtime AWS principal is a source-profile IAM user plus an AssumeRole chain to `app-runtime`: the source-profile access keys live at `/root/.aws/credentials` on the host (root-owned, 0600) and the app runs under `AWS_PROFILE=<env>-runtime` which resolves via `sts:AssumeRole`. Do not add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or any AWS credential to `/srv/footbag/env`. Do not mount the human operator CLI credentials into containers. The source-profile is a machine service account: it has no console access and no MFA; MFA is enforced for human operator IAM users and the root account. Its long-lived keys are rotated per §10.7.

| AWS service | Runtime access | Notes |
|---|---|---|
| S3 media bucket | read/write only as required for media operations | no wildcard access to unrelated buckets |
| S3 primary backup bucket | write snapshots, read when validating readiness or restore support requires it | versioning is expected |
| S3 DR bucket | write only for the sync path or restore validation path if required | avoid broad delete rights |
| SES | send only from verified domain identities used by the app | no broad SES administration |
| Parameter Store | read-only under `/footbag/{env}/...` | runtime reads only |
| CloudWatch Logs / Metrics | write metrics and logs for the application | no broad CloudWatch account administration from runtime |
| KMS JWT key | `Sign` and `GetPublicKey` only as needed by auth runtime | private key remains non-exportable |
| KMS ballot key | runtime assumed role may request data keys for ballot encryption; decrypt is reserved to tally role | keep decrypt out of the normal runtime assumed role |

#### Why this credential model

Lightsail has no EC2 instance profile, the single hardest AWS constraint on this project: every runtime AWS call (SSM, KMS, S3, SES) needs credentials from one of three sources, and the project deliberately uses the first.

- **Source-profile IAM user + AssumeRole chain (chosen).** Long-lived source-profile keys at `/root/.aws/credentials` (root-owned, 0600); the app assumes `app-runtime` via `sts:AssumeRole`. Simple, no agent, no startup network dependency. Keys rotate per §10.7.
- **SSM Hybrid Activation (evaluated, not used).** Registers the host as a managed node so the SSM Agent vends 30-minute credentials with no long-lived keys and full CloudTrail per call. Rejected for operational weight and risk: the Agent runs as root and caches credentials under `/root/.aws/` readable by any root process; it carries a real CVE history needing ongoing patching; refresh needs continuous outbound reach to the SSM endpoints (a network blip past expiry drops AWS access with no cached fallback); and `AmazonSSMManagedInstanceCore` grants Run Command / Session Manager that a compromised node can pivot through, so it must be scoped to a custom least-privilege role.
- **IAM Roles Anywhere (rejected).** Requires operating a certificate authority (managed Private CA is roughly $400/month, self-managed CA is high operational burden); disproportionate for this footprint.

Anti-patterns to reject: do not mount the human operator's CLI credentials into containers; do not place a single-consumer secret (such as the session-signing key) in Parameter Store, which adds an AWS dependency without reducing attack surface.

### 8.5 Operator shell access

Hardened per-operator SSH is the standard host shell-access path on Lightsail.

Host shell access is exceptional. It exists for deployment, restore, patching, diagnostic verification, and incident response. It is not the normal path for application administration or AWS control-plane work.

#### Required operating rules

- Use named non-root Linux operator accounts with `sudo`.
- Do not use shared shell accounts.
- Do not use shared private SSH keys.
- Use key-based authentication only; disable password authentication.
- Do not use direct root login as the normal operator path.
- Restrict inbound SSH ports 22 and 2222 to approved operator IPv4 and IPv6 source ranges (Terraform-managed via `operator_cidrs` in `lightsail.tf`); never leave SSH open to the world. Port 2222 is the reliable operator port; some ISPs block outbound port 22 to AWS EC2 IP ranges. Both ports are restricted to `operator_cidrs`; only port 80 (for CloudFront origin traffic) is open to the world.
- Keep a host-access inventory that records, at minimum, the operator name, host account, public-key fingerprint, environments allowed, approval date, and removal date when offboarded.
- Distribute only public keys for host access. Private keys remain under the custody of the individual operator and must not be stored in the repository, Parameter Store, application containers, or shared team storage.
- Onboard a System Administrator by creating or enabling the named host account, installing the approved public key, verifying SSH login, verifying `sudo`, and recording the inventory entry.
- Offboard a System Administrator by removing the public key or disabling the host account immediately, verifying loss of access, and reviewing `authorized_keys` / `sudoers` for stale access.
- Every shell session must have a clear reason: deployment, incident, restore, patching, diagnostic verification, or drill.
- Lightsail Console browser SSH is a permanent supplement to CLI SSH, declared in HCL via the `lightsail-connect` source-IP alias on port 22. It provides stable shell access when the operator workstation IP changes faster than `operator_cidrs` can be updated (mobile networks, VPN, transient ISP DHCP). The browser path requires AWS Console MFA on the operator identity plus the host's authorized public key; it does not bypass per-operator account isolation, key custody rules, or sudo discipline. Use the CLI path for routine administration; switch to the browser path when the CLI path is unavailable from the current network.
- Standard connection pattern: `ssh -i ~/.ssh/<keyfile> -p 2222 <operator-user>@<static-ip>`. Use port 22 only if your network does not block it.
- If port 2222 stops responding after an instance rebuild (sshd not yet configured to listen on it), recover through the Lightsail Console browser SSH: log in, then re-add the port and reload sshd (append-only, never an in-place edit): `printf 'Port 22\nPort 2222\n' | sudo tee -a /etc/ssh/sshd_config >/dev/null && sudo systemctl reload sshd`.

#### Operator checklist

1. Confirm you are in the correct AWS account and environment.
2. Confirm MFA-backed AWS credentials are active if the task also requires AWS-side changes.
3. Confirm the change, deployment, incident, or drill reference.
4. Confirm your current source IP is still within the approved SSH allowlist.
5. Connect using your named operator account and your own private key.
6. Capture commands or notes in the incident/change log.
7. Exit the session and verify any required follow-up notes or access changes were recorded.

### 8.6 S3 bucket policy rules

Bucket policies must explicitly deny access outside the approved principals.

Required policy stance:

- media buckets: runtime assumed role + explicitly approved System Administrator principals only
- primary backup bucket: runtime assumed role writes snapshots; System Administrators read for restore and validation
- DR bucket: tightly restricted write and restore access; Object Lock enabled according to retention policy
- maintenance-page bucket/prefix: public-read only for the specific maintenance asset path behind CloudFront, or origin-restricted according to the chosen CloudFront pattern
- no anonymous write access anywhere

### 8.7 CloudTrail and auditability

All privileged AWS activity must be traceable.

Required controls:

- CloudTrail enabled for the account and retained according to policy
- review privileged production actions monthly
- investigate unusual Parameter Store, KMS, IAM, and S3 access
- ensure Terraform changes and console changes can be correlated to named humans
- document why any emergency manual action occurred and how it was reconciled back into code

### 8.8 Break-glass access

Break-glass means a privileged action outside the normal deployment or change path, typically during an outage or security incident.

Break-glass rules:

- use only for live incidents, blocked restores, or security containment
- require MFA-backed access
- record the reason before or immediately after action
- prefer temporary changes
- reconcile infrastructure drift back into Terraform immediately after stabilization
- review the action in the incident retrospective

---

## 9. Runtime Topology and AWS Resource Layout

### 9.1 Edge and request flow

1. Viewer traffic terminates at CloudFront.
2. CloudFront serves cached static assets and forwards dynamic requests to the Lightsail origin.
3. If the origin returns configured 5xx responses or is unreachable, CloudFront serves the maintenance page.
4. The origin runs nginx, which proxies to the Node.js web application.
5. The worker container executes background jobs and operational tasks.
6. Media is served from S3/CloudFront according to the configured media path.

Important limitation: browsing traffic gets the maintenance page during origin failure, but state-changing requests may still fail as connection errors or timeouts rather than receiving the branded page.

### 9.2 Networking and TLS

- viewer TLS terminates at CloudFront
- Route 53 points public DNS at the CloudFront distribution when a real domain is attached
- custom domains and certificates must be managed as infrastructure
- origin exposure should be minimized; direct origin access is not the user-facing path
- standing edge protection is AWS Shield Standard, with Turnstile and in-process rate limiting at the application; a WAFv2 web ACL is a deferred lever, attached only if observed abuse warrants it

CloudFront operating facts:

- **Origin must be a resolvable hostname** (§9.6): staging uses `<static-ip>.nip.io`, production a real A record.
- **Two-pass bring-up.** The distribution is applied in two passes: first with `enable_cloudfront = false` (origin/Lightsail resources only), then `enable_cloudfront = true` with the origin DNS set. This avoids a chicken-and-egg between the origin host and the distribution.
- **Protocol forwarding.** CloudFront strips `X-Forwarded-Proto` from origin requests but forwards `CloudFront-Forwarded-Proto`; nginx maps it back to `X-Forwarded-Proto` (`docker/nginx/nginx.conf.template`) so the app sets the `Secure` flag on session cookies. Session cookies arriving without `Secure` point at a broken map.
- **Cache behaviors.** HTML and `/health/*` use `Managed-CachingDisabled` (the origin controls caching); `/css/*`, `/js/*`, `/img/*`, `/fonts/*` use `Managed-CachingOptimized` (long TTL); `/media-store/*` uses a custom policy that keeps the `?v=` query string in the cache key for media cache-busting.

#### 9.2.1 ACM certificate for footbag.org runbook

CloudFront-attached certificates must live in the `us-east-1` region regardless of where the rest of the platform runs. The cert covers both the apex (`footbag.org`) and `www.footbag.org` so a single distribution handles both names. Retained `*.footbag.org` subdomains (for example `lists.` and the legacy `ifpa.` mail host) are not covered by this cert and keep their own DNS and TLS on the legacy host; do not add them to the SAN list. Issuance is operator-initiated; DNS validation takes 5-30 minutes on average and can take several hours, so request well ahead of any cutover.

Preconditions:

- Route 53 hosted zone for `footbag.org` is reachable from the operator's AWS profile, or the webmaster is on standby to publish the DNS validation records on the upstream zone.
- The production CloudFront distribution exists and its terraform state is in sync. (If not, run `terraform plan` first; a missing distribution is its own remediation track.)

Operator steps:

1. Request the certificate via Terraform in `terraform/production/`, not the console. The resource declares `provider = aws.us_east_1` and both `domain_name = "footbag.org"` + `subject_alternative_names = ["www.footbag.org"]`. `validation_method = "DNS"`.
2. `terraform apply`. ACM emits two `DomainValidationOption` records (apex + www); capture them from the plan output.
3. Publish the DNS validation records. If `footbag.org`'s Route 53 zone is owned by the same account, declare the `aws_route53_record` validation records alongside the cert in the same module and re-apply. If the zone is upstream-owned, hand the records to the webmaster (see §6.8, external DNS/mail upstream coordination) and wait for confirmation that they are live.
4. Poll cert status: `aws acm describe-certificate --region us-east-1 --certificate-arn <arn> --query 'Certificate.Status'`. Expected progression: `PENDING_VALIDATION` → `ISSUED`. If status sticks at `PENDING_VALIDATION` past one hour, re-verify the DNS validation records resolve (`dig _<token>.footbag.org CNAME`).
5. Attach to the production CloudFront distribution. Update the `viewer_certificate` block on the distribution resource to reference the issued cert arn and set `ssl_support_method = "sni-only"`, `minimum_protocol_version = "TLSv1.2_2021"`. `terraform apply`.
6. Post-attachment verification:
   - `curl -vIk https://footbag.org/health/live` returns HTTP 200 and the TLS handshake reports the new cert's subject + SAN.
   - `openssl s_client -connect www.footbag.org:443 -servername www.footbag.org </dev/null 2>/dev/null | openssl x509 -noout -subject -dates` shows both names and a `notAfter` consistent with ACM's 13-month validity.
   - CloudFront's `Status` reports `Deployed` (the in-flight `InProgress` state lasts 5-15 minutes after `terraform apply`).

Rollback: re-apply the prior `viewer_certificate` block (the default CloudFront cert, or the previous cert arn) and `terraform apply`. The cert resource itself can stay; an unattached cert is benign and saves the next-attempt issuance round-trip.

Dry-run note: ACM does not provide a sandbox. Dry-run testing is limited to applying the same Terraform module against the staging zone (`terraform/staging/`) and verifying issuance + DNS validation + a staging CloudFront distribution attachment before production.

### 9.3 S3 layout expectations

At minimum, the AWS layout needs the following logical storage surfaces:

| Storage surface | Purpose |
|---|---|
| media bucket | processed photo objects and related media assets (primary region) |
| media DR bucket | continuous cross-region replica of the media bucket (separate region) |
| primary snapshot bucket | 5-minute SQLite snapshots with version history |
| snapshot DR bucket | nightly replicated SQLite snapshots with Object Lock retention (separate region) |
| maintenance asset bucket or prefix | static maintenance page assets served by CloudFront |
| static asset storage | versioned application assets if separated from the instance |

### 9.4 Container sizing and restart behavior

Container memory limits are deployment settings, not app-admin runtime settings. The per-environment values are in §3.2.

Operational rules:

- keep explicit memory limits in Compose or the chosen runtime config
- alert on sustained high memory before OOM
- automatic restart should recover transient failures
- repeated restarts indicate a real fault and require investigation
- any sizing change must be tested in staging and committed to version control

Minimum operator expectations:

- review per-container memory monthly
- investigate warning alarms before they become OOM restarts
- document before/after values and reason for any memory change
- keep enough host headroom for the OS and burst traffic

### 9.5 SES operations

System Administrators own SES account-level and DNS-level setup:

- verify sending domain
- publish SPF, DKIM, and DMARC records
- move SES out of sandbox before live production mail
- configure bounce and complaint notifications into the application webhook path
- monitor sender reputation and bounce/complaint rates
- coordinate DNS, SES, and app configuration changes together

First-time production SES activation (domain identity, DKIM, sandbox exit) is the onboarding operator path; see `DEV_ONBOARDING.md` §9.6 (production-access) and §9.7 (domain identity with DKIM). This section is the steady-state operational reference and the feedback-loop activation runbook is §10.11.

Inbound `@footbag.org` mail is handled by Google Managed Services, not SES or any AWS resource; SES is outbound-only and the platform configures no SES receiving rules. The `footbag.org` SPF record must authorize both AWS SES (the outbound sender) and Google (the inbound provider), and the DMARC policy must align across both; the SES DKIM CNAMEs and Google's required records coexist in the zone. `@ifpa.footbag.org` is a separate mail domain on llic.net (MIGRATION_PLAN §29.12a) and is not touched by SES or by the `footbag.org` MX move.

#### SES sandbox behavior

New AWS accounts start in SES sandbox mode. In sandbox, **both the sender identity and every recipient address must be explicitly verified in SES before `SendEmail` will succeed.** An unverified recipient returns `MessageRejected: Email address is not verified` from SES; the outbox row returns to `pending` with that message in `last_error` and an incremented `retry_count`, retrying up to `outbox_max_retry_attempts` before dead-lettering. Sandbox is per-region; check the SES console in the app's primary region. Request production access only once the sending domain is verified end-to-end and bounce/complaint handling is wired.

For staging-mode testing without enumerating every tester, AWS provides `success@simulator.amazonses.com` as an always-verified destination that accepts any send from any verified sender.

#### SES production-access ticket procedure

AWS support tickets to move SES out of sandbox have a typical 24-48h response window; file before the production sending need. This is part of first-time production activation; the onboarding home is `DEV_ONBOARDING.md` §9.6. The procedure is reproduced here as the operational reference.

Operator steps:

1. Confirm preconditions: sending domain is verified end-to-end on the target account; SPF, DKIM, DMARC records published; bounce/complaint SNS topic created and subscribed; outbound notification batch volume estimated.
2. File via the AWS Support Center: open a "Service limit increase" ticket → service: SES → type: "Sending limits" → request "Move out of sandbox / production access." Include the estimated daily send volume, the use case (transactional notification batch for migration cutover + ongoing account-management mail), and a description of bounce/complaint handling.
3. AWS may request a sample of email content. Provide the verification, password-reset, and notification-batch templates.
4. Track the ticket; expect a response in 24-48h. Approval moves the account out of sandbox in the SES console (verify under "Account dashboard → Sending statistics → Sandbox: No").
5. After approval, confirm the production env file sets `SES_ADAPTER=live` and restart the app. Production is the only environment with live SES delivery; dev and staging run `SES_ADAPTER=stub` and surface captured mail via the in-page simulated-email card (DD §5.6).
6. Smoke-test end-to-end: trigger a verification email to an unverified address (one that would have been rejected in sandbox); confirm delivery.

Record the ticket ID and approval timestamp in the operations log.

#### Outbound email pipeline (stages, observable state)

Transactional mail flows through four stages. Each stage fails differently; diagnose by locating the stuck stage.

| Stage | Actor | Observable |
|---|---|---|
| 1. Enqueue | `web` container (`CommunicationService.enqueueEmail`) | new row in `outbox_emails` with `status='pending'` |
| 2. Poll | `worker` container (polls every `outbox_poll_interval_seconds`) | row flips to `status='sending'` with a `last_attempt_at` timestamp |
| 3. Send | `worker` container (`LiveSesAdapter.sendEmail` → AWS SES) | on success: `status='sent'`; on failure: `status` returns to `pending` with `retry_count` incremented and `last_error` populated, reaching `dead_letter` only after `outbox_max_retry_attempts` is exhausted |
| 4. Deliver | AWS SES → recipient mailbox | outside the app; observable in SES CloudWatch metrics and recipient inbox |

Diagnosis for "no email arrived":

- **No outbox row at all** → enqueue never ran. Either the triggering request (registration, password-reset, password-change) never reached the app, was rejected by validation, or hit an anti-enumeration silent branch (e.g., password-reset for an unknown email deliberately no-ops to prevent account enumeration).
- **Row stuck at `pending` with no `last_error`** → worker not draining. Check the `worker` container is running (`docker ps`), check worker logs for startup errors, check the admin `email_outbox_paused` config flag, check the worker's AWS credential chain via `aws sts get-caller-identity` on the host.
- **Row at `dead_letter`, or at `pending` with `last_error` set and a rising `retry_count`** → the send is failing; the `last_error` column names the SES rejection (unverified recipient, IAM missing `ses:SendEmail`, suppression-list hit, rate limit). Read the column; do not guess.
- **Row at `sent`** → SES accepted the send. Check recipient spam folder and SES account suppression list (a prior hard bounce to that address silently suppresses future sends).

Do not mock the DB to reproduce these states locally; the outbox schema constraints are load-bearing and must be exercised against a real SQLite file.

### 9.6 Lightsail operational constraints

Lightsail differs from EC2 in ways that shape day-to-day operation:

- **One namespace for instances and static IPs.** A Lightsail static IP and instance cannot share a name; the static IP carries an `-ip` suffix to stay distinct from its instance. A name clash fails the apply with `InvalidInputException: Some names are already in use`.
- **No public DNS hostname.** Lightsail does not vend a public DNS name (`publicDnsName` is always empty), and CloudFront requires a resolvable origin hostname rather than a raw IP. Staging therefore uses `<static-ip>.nip.io` as the origin host; production uses a real DNS A record (for example `origin.footbag.org`). Never use nip.io in production.
- **No `user_data`.** Lightsail has no cloud-init user-data hook; host bootstrap is performed manually over SSH (the host bootstrap steps live in `DEV_ONBOARDING.md` Path D).
- **No EC2 instance profile.** The runtime AWS principal is a source-profile IAM user plus an AssumeRole chain, not an attached instance role (§8.4).
- **Firewall is Terraform-managed.** Inbound rules come from `operator_cidrs` in `lightsail.tf`; changes made in the Lightsail console are silently overwritten on the next `terraform apply` (§8.5, §11.4).

---

## 10. Configuration, Secrets, and Key Management

### 10.1 Configuration boundary

There are three distinct configuration classes.

| Class | Canonical location | Changed by | Examples |
|---|---|---|---|
| infrastructure configuration | Terraform + deployment files | System Administrator | instance size, bucket names, firewall rules, CloudFront settings, job scheduler configuration |
| secrets and cryptographic material references | Parameter Store and KMS | System Administrator | Stripe keys, webhook secrets, bootstrap secrets, KMS key references |
| application runtime policy/config | `system_config_current` | Application Administrator through app workflows, with audit logging | reminder offsets, retention windows, pricing, pause flags, some job-related windows |

Never blur these boundaries.

- Do **not** place app-admin runtime policy in Terraform.
- Do **not** place deploy-time infrastructure settings in `system_config_current`.
- Do **not** put secrets in `system_config_current`.
- Do **not** query the raw `system_config` table for runtime use; jobs and services read `system_config_current`.

### 10.2 Parameter Store namespace

All Parameter Store paths must follow:

```text
/footbag/{env}/...
```

Examples:

```text
/footbag/production/secrets/stripe_secret_key
/footbag/production/app/bootstrap/admin_token
/footbag/staging/secrets/stripe_secret_key
/footbag/development/test/ses_sender
```

Rules:

- no `/fw/...` paths
- no cross-environment reads
- name paths by purpose, not by person
- use tags and descriptions
- never print parameter values to logs or terminal output

The running application reads `/srv/footbag/env`, not SSM directly. An `aws ssm put-parameter` does not change the running app; the value reaches the host only when the next deploy mirrors it into `/srv/footbag/env` (§10.4). The rotation runbooks therefore always include a deploy or restart step.

### 10.3 What goes in Parameter Store vs KMS

| Item | Store in | Reason |
|---|---|---|
| Stripe API keys | Parameter Store `SecureString` | secret value needed by app |
| Stripe webhook secrets | Parameter Store `SecureString` | secret value needed by app |
| administrative bootstrap secrets | Parameter Store `SecureString` | secret value needed by app/tooling |
| JWT signing key | KMS asymmetric key | non-exportable signing key material |
| ballot master key capability | KMS | envelope-encryption flow; keep decryption tightly scoped |
| ordinary runtime policy values | `system_config_current` | not secrets; admin-managed runtime config |

Use customer-managed KMS keys for sensitive `SecureString` parameters and for application cryptographic operations.

### 10.4 Secret-handling rules

- secrets are never committed to Git
- secrets are never baked into Docker images
- secrets are never stored in plaintext `.env` files outside explicitly local-only development stubs
- runtime loads secrets from Parameter Store or KMS-backed abstractions
- Terraform creates parameter structure, not secret values
- production secrets are rotated with a documented runbook and verification step
- after any secret rotation, restart or redeploy the containers that cache the value at startup
- the host stores the source AWS shared config/credential material for role assumption in a root-owned path
- only the containers that need AWS access receive the specific config/credential material they need, mounted read-only
- each AWS-enabled service must select its intended runtime assumed role explicitly, for example with `AWS_PROFILE`
- `SESSION_SECRET` is generated by the `random_id.session_secret` Terraform resource (`terraform/{env}/ssm.tf`), stored in SSM as a `SecureString` under `/footbag/{env}/secrets/session_secret`, and mirrored into the host's `/srv/footbag/env` (root:root 0600) by the deploy remote-half on every deploy. The application and the deploy script both reject any value containing the substring `changeme` or shorter than 32 characters. The staging and production resources are independent, so the value is never shared across environments. Rotation is Terraform-driven (§10.8).
- `X_ORIGIN_VERIFY_SECRET` is generated by the `random_id.origin_verify_secret` Terraform resource (`terraform/{env}/ssm.tf`), stored in SSM as a `SecureString` under `/footbag/{env}/secrets/origin_verify_secret`, and mirrored into the host's `/srv/footbag/env` by the deploy remote-half on every deploy. It is the shared secret CloudFront injects as `X-Origin-Verify` and nginx enforces (444 on mismatch). Rotation is Terraform-driven (§10.9), not via `aws ssm put-parameter --overwrite`.
- `INTERNAL_EVENT_SECRET` (the web↔worker IPC shared secret) is auto-seeded into `/srv/footbag/env` by the deploy when absent. Rotate it by deleting the line and redeploying; the seed regenerates it and the worker container picks up the new value on its next restart.

### 10.5 Stripe key and webhook-secret rotation runbook

This is the direct operationalization of the `SA_Rotate_Stripe_Keys` responsibility. First-time staging and production activation is also covered, step by step, in `DEV_ONBOARDING.md` §8.15 (staging) and §9.13 (production); the first-time block below is the operational reference.

#### First-time activation (turning live payments on)

The application-side switch is `PAYMENT_ADAPTER` in `/srv/footbag/env`; everything else is credential provisioning. Production refuses to boot with `PAYMENT_ADAPTER=stub`, so on the production host these steps are boot prerequisites, not optional hardening. Staging normally runs `PAYMENT_ADAPTER=stub` (the programmable in-memory Stripe mirror); staging may be pointed at real Stripe by running the same steps with test-mode credentials.

`scripts/activate-payments.sh --target <staging|production> --profile <profile>` walks this sequence end to end: the SSM key write (step 1), the host env rewrite with a masked confirmation diff (step 3), and the PAYMENTS-BOOT gate. Step 2 (the Stripe Dashboard webhook endpoint) is inherently manual; the script pauses for it and prompts for the resulting signing secret. The numbered steps below remain the canonical procedure the script implements.

1. **Secret API key (SSM).** `terraform apply` creates the SecureString shell `/footbag/{env}/secrets/stripe_secret_key` with a `TODO-` placeholder. Supply the real key (live-mode `sk_live_...` for production; test-mode `sk_test_...` for staging):

   ```
   aws ssm put-parameter \
     --name "/footbag/production/secrets/stripe_secret_key" \
     --value file:///tmp/stripe-key --type SecureString \
     --key-id alias/footbag-production --overwrite
   ```

   (`file://` hygiene keeps the key out of shell history; delete the temp file after.) The live adapter resolves the key lazily on the first payment operation and rejects the `TODO-` placeholder loudly, so a deploy that skips this step fails the first checkout, never silently.

2. **Webhook endpoint (Stripe Dashboard).** Create a webhook endpoint pointing at `https://footbag.org/payments/webhook` (the environment's `PUBLIC_BASE_URL` + `/payments/webhook`), subscribed to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `checkout.session.expired`. Other event types are acknowledged and ignored; recurring-donation support adds its subscription and invoice events. Copy the endpoint's signing secret (`whsec_...`).

3. **Host env (`/srv/footbag/env`).** Set `PAYMENT_ADAPTER=live` and `STRIPE_WEBHOOK_SECRET=whsec_...`. The boot guard rejects a `whsec_stub`-prefixed webhook secret in production, and live mode refuses to boot without a webhook secret at all. `SECRETS_ADAPTER=live` must already be set so the SSM key lookup works.

4. **Deploy / restart** via `./deploy_to_aws.sh`. Boot-time config validation enforces the env pair; the SSM key is validated on first checkout.

5. **Verify** per Required verification below: one real checkout (smallest tier), webhook signature validation observed in logs, payment row `succeeded` plus the tier grant present, then refund the test transaction from the Stripe Dashboard and confirm the refund webhook transitions the row to `refunded` while the tier grant is preserved.

#### When to run

- scheduled credential rotation
- suspected key exposure
- Stripe-side security requirement
- migration to a new Stripe configuration

#### Procedure

1. Generate the new key or webhook secret in Stripe.
2. Add the new value to the correct `/footbag/{env}/...` Parameter Store path according to the dual-key or staged-cutover design used by the application.
3. Validate in staging first.
4. Deploy the application change or restart path that picks up the new secret.
5. Run payment smoke tests and webhook verification.
6. Observe production for the grace period.
7. Remove the old secret only after successful verification.

#### Required verification

- successful API calls with the new key
- successful webhook signature validation (the signed-webhook integration tests are in `docs/TESTING.md` §7.2)
- no spike in payment or webhook failures
- incident/change record updated with actor and timestamp

### 10.6 JWT and ballot-key controls

- JWT signing uses KMS asymmetric signing; the application may call `Sign`, but the private key must remain non-exportable.
- Token verification should use cached public key material and must not call KMS on every request.
- Ballot encryption uses envelope encryption.
- The normal runtime role may request data keys for encryption but must not hold broad decrypt permission.
- Tally operations use a separate privileged role with tightly scoped decrypt permission.
- Key policy changes are infrastructure changes and require code review.

#### JWT signing-key rotation procedure

The 24h-overlap rotation pattern exercises both KMS signing keys simultaneously so no users are forced to re-authenticate.

1. Provision a new KMS asymmetric signing key in staging (Terraform `aws_kms_key.jwt_signing_v2` or equivalent). Wait for it to be `Enabled`.
2. Export the public key from the new KMS key via `kms:GetPublicKey`; verify the algorithm and modulus match the existing key's parameters.
3. Update the app config to add the new key's ARN and `kid` to the verification keyset (so JWTs signed by either key verify cleanly during the overlap window).
4. Deploy the app to staging; confirm via curl that login still issues a JWT signed by the original key and the app accepts it for an authenticated route.
5. Flip the active signer config to the new key. Restart the web container.
6. Confirm via curl that login issues a JWT with the new `kid` header, and that an existing session cookie (signed by the old key) still verifies for the duration of its TTL.
7. Wait 24h to let any in-flight tokens signed by the old key expire naturally.
8. Disable the old key in KMS (`kms:DisableKey`). Confirm that any synthetic JWT signed by the old key now fails verification.
9. After a stability window, schedule the old key for deletion via `kms:ScheduleKeyDeletion` (minimum 7-day window per AWS policy).
10. Record drill output (cutover audit log entry): start time, end time, observations, any deviations.

The procedure runs identically against any environment's KMS keys; production rotation reuses the same steps with production resource ARNs.

#### Required verification

- `npm run test:smoke` passes the KMS signing-key assertions (the staging-readiness probe, §18.8): `kms:GetPublicKey` returns the expected key spec and the KmsJwtAdapter signs and verifies a round-trip against real KMS.
- login issues a JWT with the new `kid`, and an existing session cookie still verifies for its TTL.

### 10.7 Source-profile access-key rotation

Access keys issued for the `footbag-staging-source-profile` IAM user (provisioned per DEV_ONBOARDING Path H, §8.7) are the long-lived AWS credentials on the staging host. The runtime role (`footbag-staging-app-runtime`) is assumed via `sts:AssumeRole` using these keys and is not itself rotated. CIS Benchmark calls for rotation at least every 90 days; AWS IAM guidance prefers short-lived credentials overall and flags unused keys via last-accessed information.

Procedure (modeled on §10.5):

**Never delete and recreate** the `footbag-staging-source-profile` IAM user to rotate credentials. AWS resolves the runtime role's trust policy to the source-profile user's internal unique ID at save time, not the ARN text; a recreated user with the same name produces a trust that looks correct in JSON but silently refuses `AssumeRole` until the trust policy is re-edited. Rotation is always "issue a second key under the existing user" (see DEV_ONBOARDING §8.9 step 4c for the principal-ARN pitfall).

1. Create a second access key for `footbag-staging-source-profile` while the first is still active.
2. Update the key values in `/root/.aws/credentials` on the staging host under the stanza `[footbag-staging-source-profile]` (no `profile ` prefix in the credentials file; the role profile in `/root/.aws/config` is the one that takes `[profile footbag-staging-runtime]`). Swapping either stanza-prefix silently returns the source-user identity from `get-caller-identity` instead of the assumed role; see DEV_ONBOARDING §8.10 step 5a "Stanza-prefix footgun" for the full rule. Root-owned, 0600. `/srv/footbag/env` is not touched; it holds only `AWS_PROFILE` and other non-secret runtime config.
3. Restart `footbag.service` on the host so the app re-runs the assumed-role chain with the new keys.
4. Validate `aws sts get-caller-identity --profile footbag-staging-runtime` still returns the assumed-role ARN, then validate the new keys exercise both KMS Sign (login → JWT issue) and SES Send (password-forgot → outbox row transitions to `sent`) paths.
5. Deactivate the old key; observe for a grace window; delete once stable.

Production rotation follows the same procedure with production resource ARNs (DEV_ONBOARDING Path I).

#### Required verification

- `npm run test:smoke` passes end to end (the staging-readiness probe, §18.8) — it exercises the assumed-role identity, KMS Sign, and SES Send paths the rotated keys feed.
- `aws sts get-caller-identity --profile footbag-<env>-runtime` returns the assumed-role ARN, not the source-user identity.

### 10.8 SESSION_SECRET rotation runbook

`SESSION_SECRET` is generated by the `random_id.session_secret` Terraform resource and lives canonically in SSM (`terraform/{env}/ssm.tf`); the host's `/srv/footbag/env` (root:root 0600) is a deploy-time mirror written on every deploy. It is never committed to Git and never present in any Docker image. The application and the deploy script both reject any value containing the substring `changeme` or shorter than 32 characters (defense against accidental `.env.example` carry-over). Rotation is Terraform-driven; a manual host-side edit would be reverted on the next deploy.

#### When to run

- scheduled rotation (recommended at least annually for a per-host secret)
- suspected exposure (host snapshot leaked, credential file inadvertently shared, operator handover)
- after any security incident touching the host
- as part of staging-restore drills

#### Procedure

1. Regenerate the secret via Terraform (the SSM parameter updates in place):
   ```bash
   cd terraform/{env} && terraform apply -replace=random_id.session_secret
   ```
2. Confirm the new value satisfies the guards: contains no `#` (systemd EnvironmentFile parsing), no `changeme`, length ≥ 32. The deploy script enforces all three.
3. Redeploy so the deploy remote-half fetches the new value from SSM into `/srv/footbag/env` and restarts the service:
   ```bash
   DEPLOY_TARGET=footbag-{env} ./deploy_to_aws.sh
   ```
4. Expect: every active session is immediately invalidated. All currently-signed-in users will be redirected to login on their next request.
5. Smoke-test login with a known account and confirm a fresh `footbag_session` cookie issues.
6. Record the rotation timestamp in your operator notes.

#### Required verification

- service comes back cleanly (no startup error in `journalctl -u footbag`)
- login flow works end-to-end against a known account
- no new error spike in `/health/ready` or in the access log

### 10.9 Origin-verify shared-secret rotation runbook

`X_ORIGIN_VERIFY_SECRET` is the shared secret CloudFront injects on every origin request and nginx compares against to reject direct-to-origin probes (§10.2 Parameter Store namespace / `terraform/{env}/cloudfront.tf` / `docker/nginx/nginx.conf.template`). It is generated by the `random_id.origin_verify_secret` Terraform resource and lives canonically in SSM; the host's `/srv/footbag/env` is a deploy-time mirror. Rotation is Terraform-driven; manual `aws ssm put-parameter --overwrite` would be reverted on the next apply.

#### When to run

- scheduled rotation (annually is sufficient; per-environment, no third-party dependency)
- suspected exposure (workstation snapshot leaked, audit incident, SSM history review)
- after any change to the workstation-to-host transport posture

#### Procedure

1. From the workstation, regenerate the secret in Terraform:
   ```bash
   cd terraform/{env}      # staging or production
   terraform apply -replace=random_id.origin_verify_secret
   ```
   The CloudFront `data` source for the parameter re-reads on the same apply, so the origin `custom_header` value updates atomically.

2. Run a deploy. The remote-half fetches the new SSM value, validates the 64-hex shape, and atomically rewrites the `X_ORIGIN_VERIFY_SECRET=` line in `/srv/footbag/env`:
   ```bash
   ./deploy_to_aws.sh -k
   ```

3. There is a brief 30-to-90-second window between step 1 and step 2 where CloudFront sends the new secret and nginx still expects the old one (every CloudFront request returns 444). Run them adjacent to minimize.

#### Required verification

- `aws ssm get-parameter --with-decryption --name /footbag/{env}/secrets/origin_verify_secret --query Parameter.Value --output text` returns a 64-character lowercase hex string (not `TODO-...`).
- A request through CloudFront returns 200 (`/health/ready`).
- A request directly to the Lightsail static IP fails with TCP RST or `curl exit 52` (the Lightsail firewall blocks non-CloudFront source IPs at the network layer per `terraform/{env}/lightsail.tf`).

### 10.10 Safe Browsing API key rotation runbook

Bootstrap lives in DEV_ONBOARDING §4.10. This section covers recurring rotation.

#### When to run

- scheduled credential rotation
- suspected key exposure (key value appeared in logs, was committed by accident, or was shared with an off-platform party)
- migration to a new Google Cloud project
- quota tier change

#### Procedure

1. Sign in at `console.cloud.google.com`. Regenerate the API key (or revoke and create new).
2. Copy the new value to a temp file:
   ```
   printf %s '<paste-key>' > /tmp/sb-key && chmod 600 /tmp/sb-key
   ```
3. Overwrite the SSM SecureString:
   ```
   AWS_PROFILE=footbag-<env>-runtime aws ssm put-parameter \
     --name /footbag/<env>/secrets/safe_browsing_api_key \
     --value "file:///tmp/sb-key" \
     --type SecureString \
     --key-id alias/footbag-<env> \
     --overwrite
   ```
4. Remove the temp file:
   ```
   shred -u /tmp/sb-key
   ```
5. Restart the runtime to invalidate the in-process cache:
   ```
   sudo systemctl restart footbag.service
   ```

#### Required verification

- `npm run test:smoke` passes the Safe Browsing cases in `tests/smoke/safe-browsing.smoke.test.ts` from the operator workstation.
- Submit a known-malware URL through any external-link form on the target host; validation rejects with the user-facing "This URL is not allowed."
- Application logs show the matched threat category for one operator-review entry.

#### Failure modes and recovery

- `aws ssm put-parameter` returns `AccessDenied`: operator profile is not assuming `*-runtime` correctly, or the runtime role lacks `ssm:PutParameter`. Verify `/root/.aws/credentials` source profile + workstation `~/.aws/config` runtime profile per §8.4.
- Smoke reports `bootstrap placeholder ("TODO-...")`: step 3 was skipped or pointed at the wrong env. Rerun with the correct profile and parameter path.
- Validator returns "URL could not be reached" instead of Safe Browsing rejection: the reachability check (preceding gate) is failing first; not a Safe Browsing wiring issue.
- Quota errors (HTTP 429): rate limit exceeded. Check daily lookup volume in GCP Console; back off and retry. If sustained, application traffic exceeds the free tier; reduce or upgrade the GCP billing tier.

### 10.11 SES feedback loop activation

Bounce and complaint notifications flow SES → SNS → the app's public webhook, which marks the matching member's `email_status` so transactional sends skip dead or complaining addresses.

First-time setup chooses the SNS consumer pattern (inline HTTPS vs SQS) and stands up the SNS topic; that one-time infrastructure decision is the onboarding operator path (`DEV_ONBOARDING.md` §9.10). This section is the scripted activation that runs once the topic exists and the pattern is chosen.

1. Run `scripts/activate-ses-feedback.sh --target <t>`. It generates the dedicated `SES_FEEDBACK_WEBHOOK_KEY`, installs it into `/srv/footbag/env` on the host (refusing to clobber a live key without `--rotate`), and prints the exact `ses_feedback_webhook_url` value once. The key is its own secret, never `INTERNAL_EVENT_SECRET`: the query string lands in access logs, and a leak there must not extend to the worker IPC endpoints. The runtime requires the key only when `SES_ADAPTER=live`, so this runs at live-email activation, not before. Set the printed value as the Terraform variable (it is `sensitive`; keep it out of committed tfvars files) and apply.
2. SNS posts a subscription-confirmation message. The app never auto-fetches the SubscribeURL (that would fetch an attacker-suppliable URL); it records it in an `email.sns_subscription_pending` audit row. Read the URL from that row and confirm it once:
   `sqlite3 database/footbag.db "SELECT metadata_json FROM audit_entries WHERE action_type = 'email.sns_subscription_pending' ORDER BY created_at DESC LIMIT 1;"`
   then open the `subscribe_url` value (curl or browser).
3. Validate end-to-end with a reputation-safe synthetic bounce: `scripts/verify-prod-email.sh --profile <prod-profile> --confirm-production --bounce-probe`, then check for the `email.bounce_recorded` audit row the probe's output describes.

### 10.12 Production first-admin bootstrap

The production platform launches with zero admins; the single-shot bootstrap token creates the first one. Design intent and audit-row shape are in DESIGN_DECISIONS §2.9; the staging rehearsal that validates this procedure before cutover is §20.8.

1. Provision the token (a System Administrator action, never committed anywhere). Write it to a restricted temp file so it never lands in argv (`ps`) or shell history, then pass it by `file://`:
   ```
   openssl rand -hex 32 > /tmp/admin-token && chmod 600 /tmp/admin-token
   aws ssm put-parameter --name /footbag/production/app/bootstrap/admin_token \
     --type SecureString --value file:///tmp/admin-token \
     --key-id alias/footbag-production --profile <prod-profile>
   shred -u /tmp/admin-token
   ```
   (`scripts/admin-bootstrap-token.sh --target production --profile <prod-profile> provision` automates this safely.)
2. Hand the token to the intended first admin out-of-band. They register a normal account, sign in, and submit the token at `/admin/bootstrap-claim`. On a match the platform writes `is_admin=1` plus the Tier 2 invariant grant plus the `grant_admin_bootstrap` audit row atomically, then deletes the parameter.
3. Verify closure: `aws ssm get-parameter --name /footbag/production/app/bootstrap/admin_token` must return ParameterNotFound. If the grant succeeded but deletion failed, an `admin.bootstrap_token_delete_failed` operational error is raised; delete the parameter by hand.

### 10.13 Host env verification

`/srv/footbag/env` on each Lightsail host is operator-managed plain text (root:root 0600) and is not reconciled by Terraform automatically. `scripts/verify-staging-env.sh` reads the host env file over ssh and compares it against the terraform-output contract (KMS JWT key ARN, SES sender identity, media bucket name) plus the production-hardening invariants enforced by `src/config/env.ts` (NODE_ENV cross-invariant, SESSION_SECRET length and non-placeholder shape, internal-event secret non-default, image worker URL non-localhost, dev-shortcut posture per target).

#### When to run

- before any deploy to staging or production
- after any change to `/srv/footbag/env` on a deployed host
- after `terraform apply` changes a value the host env references (KMS key rotation, SES identity change, media bucket rename)
- after the dev-only scaffolding (persona harness / dev-bootstrap) changes shape (a new `FOOTBAG_DEV_*` env var is added)

#### Procedure

1. From the operator workstation, run against the target host:
   ```
   ./scripts/verify-staging-env.sh --target staging
   ./scripts/verify-staging-env.sh --target production
   ```
   The ssh alias defaults to `footbag-<target>` (overridable with `--ssh-alias <name>`). The script uses `ssh -t` + interactive sudo to read `/srv/footbag/env` (which is root-owned 0600); you will be prompted for your sudo password on the local terminal once per invocation. The password is typed directly into sudo's noecho prompt; the script does not capture, echo, or log it.
2. Read the report. Each invariant is reported as `PASS`, `FAIL`, or `WARN`.
3. Fix any `FAIL` lines before deploying. `WARN` lines are advisory.
4. Re-run until the script exits 0 with the "All critical invariants passed" summary line.

#### Required verification

- The script exits 0 with the summary `All critical invariants passed`.
- Any `WARN` entries are reviewed and either intentional or remediated in the host env file. `TRUST_PROXY` warns unless it is the exact integer hop count (staging 2; production 2 under the clean cutover, the CloudFront → nginx chain with no legacy front-door hop); a missing value degrades to coarse per-edge rate limiting rather than blocking boot.

#### Failure modes and recovery

- `failed to stage /srv/footbag/env on <alias>`: the ssh alias is missing from `~/.ssh/config`, the sudo password was entered incorrectly or canceled, `/srv/footbag/env` does not exist (host bootstrap incomplete), or the operator user lacks general sudo access on the host. See §8.5 for operator shell access.
- `required terraform outputs are empty`: `terraform apply` has not run for the target environment, or the operator is not in the project root. Run `terraform -chdir=terraform/<target> output` to confirm.
- `JWT KMS key ARN matches terraform: FAIL`: the host env file references a different KMS key than the latest terraform state. Either terraform has been re-applied with a new key (update `/srv/footbag/env` to match) or the env file was hand-edited (compare against §10.6).
- `SESSION_SECRET contains 'changeme'` or `is N chars (need >= 32)`: the host env file still carries the bootstrap placeholder. Generate with `openssl rand -hex 32` per §10.4 / §10.8 and overwrite the value on the host.
- `INTERNAL_EVENT_SECRET is the dev-default literal`: the operator copied a dev `.env` to the host. Generate a fresh value with `openssl rand -hex 32` and update `/srv/footbag/env`.
- `IMAGE_PROCESSOR_URL references localhost`: the host env still carries the dev fallback. Set to the docker-compose service name (e.g. `http://image:4000`). Staging and production require it explicitly (the app refuses to boot without it); only local development defaults to `http://localhost:4001`.
- `FOOTBAG_DEV_ADMIN_GRANT_TIER2`, `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`, or a similar dev-bootstrap var present on a production host env: remove the line. The env-config boot guard refuses to start the container with these set on production, so the deploy would also fail at container boot; the script catches the misconfiguration earlier.
- `BACKUP_S3_BUCKET unset` (WARN): the app boots without it, but `footbag-backup.timer` cannot upload snapshots. Set it to the environment's db-snapshots bucket name (terraform output) before installing the timer per §16.

#### Synthetic mode

`tests/integration/verify-staging-env.script.test.ts` exercises the script's check logic against synthetic env files via the `--env-file <path>` flag plus the `TF_JWT_KMS_KEY_ARN` / `TF_SES_SENDER` / `TF_MEDIA_BUCKET` env vars. Operators never set these flags directly; the synthetic mode exists so the script's invariant matrix is regression-tested in CI without a live staging host.

### 10.14 Turnstile key rotation runbook

Cloudflare Turnstile protects the public forms when `CAPTCHA_ADAPTER=live` (production opt-in; dev and staging run the stub). First-time activation is the onboarding operator path (`DEV_ONBOARDING.md` §8.16 staging, §9.14 production). This section covers recurring key rotation.

#### When to run

- scheduled credential rotation
- suspected exposure of the Turnstile secret key
- migration to a new Cloudflare site

#### Procedure

1. In the Cloudflare dashboard, rotate (or create a new widget and capture) the site key and secret key for the production widget.
2. Write the secret key to SSM `SecureString`:
   ```
   printf %s '<paste-secret>' > /tmp/ts-key && chmod 600 /tmp/ts-key
   AWS_PROFILE=footbag-production-runtime aws ssm put-parameter \
     --name /footbag/production/secrets/turnstile_secret_key \
     --value "file:///tmp/ts-key" --type SecureString \
     --key-id alias/footbag-production --overwrite
   shred -u /tmp/ts-key
   ```
3. Update the public site key (non-secret) where the deploy sources it, and confirm `CAPTCHA_ADAPTER=live` in `/srv/footbag/env`.
4. Restart the runtime to invalidate the in-process cache: `sudo systemctl restart footbag.service`.

#### Required verification

- Load a Turnstile-protected public form (register, password-forgot) and confirm the widget renders and a submission succeeds.
- Confirm a deliberately failed/blank challenge is rejected at submission.

---

## 11. Terraform and Infrastructure Change Control

### 11.1 Terraform authority

Terraform is the source of truth for AWS infrastructure.

Infrastructure under Terraform control includes at minimum:

- Lightsail instance
- static IP and firewall rules
- S3 buckets and lifecycle/versioning/Object Lock settings
- CloudFront distributions and custom error responses
- IAM roles and policies
- Parameter Store structure
- KMS resources and aliases
- CloudWatch log groups, metrics, alarms, dashboards
- Route 53 records
- SNS topics and subscriptions
- budgets and budget alarms

### 11.1.1 Manual bootstrap boundary
A blank AWS account still requires one temporary manual bootstrap identity.

 That identity is allowed only to:
  1. harden the root account and establish billing alerts,
  2. create the remote Terraform state backend required by the current Terraform setup,
  3. apply the account-baseline Terraform root,
  4. create Terraform-managed IAM roles and policies,
  5. hand off routine administration to Terraform-managed roles.

Use clearly separated Terraform state backends for dev, staging, and production.

### 11.2 State management

- use remote state with locking
- keep environment state separated
- protect access to state because it is sensitive operational metadata
- never bypass locking for routine operations
- treat state changes as production-impacting changes
- Terraform >= 1.11 is required; `use_lockfile = true` (S3 native locking) requires this version floor; do not use DynamoDB locking
- AWS provider is pinned to `~> 5.0` in `providers.tf`; do not upgrade to v6 without reviewing the migration guide (v6 has breaking changes)
- `terraform.tfvars` is excluded from git via `*.tfvars` in `.gitignore`; never commit it; it contains real IP addresses and account IDs; `*.tfvars.example` files are tracked and safe to commit
- `use_lockfile = true` requires `s3:PutObject` and `s3:DeleteObject` on `<bucket>/<key>*.tflock`; ensure the operator IAM policy includes these or `terraform apply` will fail with `AccessDenied` at lock acquisition

### 11.3 Standard workflow

Use this order for initial bootstrap and steady-state applies:

1. `terraform fmt -recursive`
2. `terraform validate`
3. `terraform plan -out=tfplan`
4. review the plan in PR
5. `terraform apply tfplan`
6. capture outputs required by deployment (static IP, bucket names, CloudFront domain, certificate ARN, and any documented firewall or allowlist inputs required for operator SSH access)
7. verify the applied AWS state and dashboards

For the initial blank-account bootstrap, apply in this sequence:
1. account baseline
2. Terraform-managed human/IAM access
3. Route 53 zone (if hosted in the same account)
4. ACM public certificate in `us-east-1`
5. S3 foundation buckets
6. Lightsail origin, Systems Manager hybrid-activation prerequisites/service role, and application runtime assumed role(s)
7. CloudWatch observability resources
8. CloudFront distribution
9. public DNS records

Steps 3, 4, and 9 apply only when a real domain is attached to the distribution; they are skipped when the CloudFront default `*.cloudfront.net` URL is in use. The `terraform/shared/` module must be applied first to create the state bucket before applying `terraform/staging/` or `terraform/production/`. See `DEV_ONBOARDING.md` §4.6 for the full bootstrap sequence.

### 11.4 Environment separation

Use clearly separated Terraform workspaces, stacks, or state backends for dev, staging, and production.

Rules:

- never apply a staging plan to production
- keep variable files or workspace variables explicit
- environment-specific names, tags, bucket paths, and alarms must be deterministic
- do not allow a single command to mutate multiple environments implicitly

Milestone-gated variables (default off; flip at the DNS-handover milestone, when the zone moves to Route 53):

- `enable_apex_alias_records`: creates the apex/www ALIAS records to CloudFront in Route 53. Before handover the zone is authoritative on the webmaster's bind9 (not Route 53), where the webmaster points the apex at the distribution during the go-live cutover; these Route 53 records apply only once Route 53 serves the zone.
- `ses_enable_domain_auth`: provisions the SES domain identity, DKIM, and SPF/DMARC records in Route 53. Requires a zone Route 53 actually serves.

### 11.5 Emergency console changes

Console changes are allowed only for emergency troubleshooting or containment.

If a console change happens:

1. stabilize the incident
2. record exactly what changed
3. update Terraform to match reality
4. run plan and confirm the drift is reconciled
5. close the incident only after parity is restored

### 11.6 What not to do

- do not treat the console as the primary config surface
- do not leave unexplained drift in place
- do not edit prod and promise to “clean it up later”
- do not store secret values in Terraform state intentionally

### 11.7 Pre-deploy drift check

Before a deploy that depends on infrastructure state, run `terraform -chdir=terraform/<env> plan -refresh-only` and inspect for "Objects have changed outside of Terraform". Reconcile any drift via `terraform import` before any apply that would otherwise recreate an existing resource. CI runs only `fmt -check` and `validate`, not `plan` against backend state, so drift detection is operator-side.

---

## 12. Monitoring, Logging, Alerting, and Cost Control

### 12.1 CloudWatch-first model

CloudWatch is the default monitoring substrate.

Use CloudWatch for:

- structured application logs
- infrastructure metrics
- custom application metrics
- job success/failure and duration metrics
- dashboards
- alarms
- host and platform logs that the runbooks explicitly choose to forward for operational visibility
- notification fan-out via SNS where configured

Optional external tools may be added only when they solve a concrete problem that CloudWatch does not solve well enough, and only if they do not materially increase volunteer burden, privacy risk, or cost.

### 12.2 Logging rules

Application logs must be structured and safe.

Required rules:

- structured JSON logs
- correlation IDs
- actor context where appropriate
- never log raw secrets, JWTs, reset tokens, webhook secrets, cookies, or full sensitive payloads
- log enough metadata to diagnose without exposing unnecessary personal data
- use CloudWatch Insights as the default search/query surface
- every log surface has bounded growth via rotation, age cap, or external retention; unbounded local logs are not allowed
- new on-host log producers ship a `/etc/logrotate.d/<name>` config (installed by the producer's bootstrap script in `scripts/`); new CloudWatch log groups set `retention_in_days` in Terraform; container logs use Docker's `json-file` driver size/file caps in `docker/docker-compose.prod.yml`

### 12.3 Alarm model

#### Core infrastructure alarms

- origin 5xx / origin availability problems
- instance CPU and memory pressure
- container restart loops
- disk pressure
- S3 operation failures
- unusual Parameter Store access patterns
- KMS error rate or latency for auth/voting paths

#### Core application alarms

- application 5xx rate
- readiness failures
- backup age and backup failure
- job missed-run counts
- Stripe webhook failures
- SES bounce/complaint thresholds (account `Reputation.BounceRate` > 5% and `Reputation.ComplaintRate` > 0.25%; SES pauses sending near double those levels)
- dead-letter / outbox failure growth (`OutboxDepth` metric from the worker's per-cycle `outbox.depth` log line; backlog alarm at > 50 sustained 15 minutes)
- CloudFront p90 `OriginLatency` (> 3s sustained; requires the per-distribution additional-metrics subscription)
- ACM `DaysToExpiry` for the CloudFront certificate (< 30 days; lives in us-east-1 with a sibling SNS topic, since alarm actions must target a same-region topic)
- cutover zero-logins watch (`LoginSuccessCount` from the `auth.login_success` log line; gated by Terraform `enable_cutover_login_alarm`, which exists only in `terraform/production/`; enabled for the cutover monitoring window only and disabled in steady state, where quiet overnight hours would false-positive)
- any `logger.error()` line in the app log group — a CloudWatch log metric filter on `{ $.level = "error" }` increments a count routed through SNS to the admin email. Every error worth logging surfaces to an operator automatically.

#### Administrator-visible summaries

The Application Administrator dashboard may show summarized health and alarm state, but it must not become an AWS operations console.

### 12.4 Suggested operational thresholds

These values should be implemented and tuned conservatively, then reviewed based on real data.

| Signal | Warning | Critical |
|---|---|---|
| CPU | >80% for 10 minutes | >90% for 5 minutes |
| per-container memory | >80% sustained | >90% sustained or restart risk |
| application 5xx rate | investigate sustained increase | >5% for 1–2 minutes |
| backup age | investigate if trend is rising | >15 minutes |
| missed scheduled job | 1 missed execution | 3 consecutive misses or restart loop |
| WAL size | investigate growth trend | >1 GB |
| checkpoint latency | investigate trend | >5 seconds |
| `SQLITE_BUSY` frequency | investigate | >5% of operations |
| DB file / disk use | >80% | >90% |

### 12.5 Dashboards and notifications

Maintain at least:

- an operations dashboard for System Administrators
- an application health summary for Application Administrators
- a cost dashboard or budget view

Notifications should be sent to the appropriate audience:

- infrastructure/incident alarms to System Administrators
- app-visible alarms and work queue notifications to the `admin-alerts` path where appropriate
- cost alarms to the designated budget owners

### 12.6 Cost control

Target operational cost remains modest. Operators must:

- track monthly spend against budget
- alarm on meaningful overrun or projection
- review unexplained spend spikes promptly
- evaluate any new AWS service against both dollar cost and volunteer support cost

### 12.7 Cost-alarm threshold tuning runbook

When to run:

- alarm fatigue: cost alarms fire frequently on normal usage and the operator has started ignoring them
- alarm silence: no cost alarm has fired over a full quarter despite known spend variance
- a new AWS service is added (the threshold model needs a new baseline)
- a budget change from IFPA shifts the absolute spend envelope

Procedure:

1. In AWS Cost Explorer, pull daily cost for the last 90 days, grouped by service. Export to CSV if needed for offline analysis.
2. For each service the alarm watches, compute the baseline mean and standard deviation over the 90-day window. Discount any known spike days (e.g. one-time data transfer for a restore drill) before computing.
3. Set thresholds:

   - warning: `baseline_mean + 1.5 * baseline_stddev`, or `1.5 * baseline_mean` if stddev is small
   - critical: `baseline_mean + 3 * baseline_stddev`, or `2 * baseline_mean` if stddev is small

4. Update the cost-alarm threshold Terraform variable for the alarm (in `terraform/{env}/cloudwatch.tf`).
5. `terraform plan` and review the diff; confirm no other alarms move unexpectedly.
6. `terraform apply` to push the new threshold.
7. Verify with a synthetic test: temporarily set the threshold to a value below current spend; confirm the alarm fires within the alarm period; restore the real threshold; confirm the alarm clears.

Required verification: the alarm test fires on a known-bad value and clears on restore. Document the new threshold and the rationale (baseline window, computed mean / stddev, any spikes excluded) in the access-review notes for the next §18.6 cycle.

### 12.8 CloudWatch agent install (one-time per host)

Host-level CPU / memory / disk metrics come from the Amazon CloudWatch agent, installed once per host via `scripts/install-cwagent-staging.sh` (the canonical pattern for a future `install-cwagent-production.sh`). It is idempotent and safe to re-run. Preconditions: the `~/.ssh/config` operator alias, `terraform` applied for the target (the CloudWatch-publisher IAM user must exist), and `jq` locally.

1. Generate the publisher IAM user's access key into a 0600 temp file and record it in the project credential vault:
   ```bash
   umask 077
   aws iam create-access-key --user-name <env>-cwagent-publisher > /tmp/cwagent-keys.json
   ```
2. Run the installer; it reads the sudo password from stdin (never argv) and takes the keys file as its only argument:
   ```bash
   < <your-operator-credential-file> bash scripts/install-cwagent-staging.sh /tmp/cwagent-keys.json
   ```
3. `shred -u /tmp/cwagent-keys.json`.

The agent runs in onPremise mode using the publisher user's long-lived keys at `/etc/amazon-cloudwatch-agent.aws/credentials` (root-owned, 0600), because the agent does not honor source-profile chaining. Known gotcha: `amazon-cloudwatch-agent-ctl -a fetch-config` may reject the JSON config; `sudo systemctl restart amazon-cloudwatch-agent` is the working path. The agent emits telegraf-native dimensions, so scope alarms by the emitted dims. Once metrics flow, arm the alarms by flipping the `enable_cwagent_alarms` Terraform variable.

---

## 13. CI/CD, Release Promotion, and Deployment Workflow

### 13.1 Deployment model

Deployment is operator-driven: the maintainer builds locally and ships via the `./deploy_to_aws.sh` entry point, which orchestrates the build, the SSH image transfer (`docker save | ssh | docker load`), and the compose restart on the host. The standard runbook in §13.3 documents the operator path.

The platform's longer-term design intent is an automated CI/CD deploy pipeline that satisfies §13.1.1's CI responsibilities, publishes a versioned artifact, and promotes to staging and production through §13.2. The script-based path remains as the operator fallback for emergencies and isolated-environment deploys; the artifact format and validation gates are the same on both paths.

**Why the workstation builds the images.** The host has too little memory to run `docker compose build`: a parallel web+worker build peaks well above the small Lightsail bundle's RAM and has OOM-killed the host (taking out sshd). Images are therefore built on the operator workstation and shipped via `docker save | ssh | docker load`; `footbag.service` runs `compose up --no-build` (detached) and fails fast if an image is missing rather than triggering a host-side build. The deploy feeds the host `sudo` password over stdin at every hop, never in process argv; the residual risks it does not close are a plaintext operator-credential file at rest and same-uid memory inspection on the workstation.

**Recovering a host OOM.** The tell is that the Lightsail control plane reports the instance `running` with ports `open` while every TCP connection from the workstation times out. Recover with a cold `aws lightsail stop-instance` followed by `start-instance` (more reliable than `reboot-instance`, which can re-trigger a boot-loop OOM if the service was enabled at the time).

### 13.1.1 CI responsibilities

CI must at minimum:

- lint and type-check the codebase
- run the test suite
- run the convention gate (`scripts/ci/assert_conventions.sh`)
- build the deployable artifacts or container images
- publish versioned artifacts for approved branches/tags
- fail fast on migration or config-shape problems that can be detected automatically

#### Convention gate and pre-push verification

The convention gate `scripts/ci/assert_conventions.sh` (with its delegated `scripts/ci/check_*.sh` checkers) statically enforces the mechanically-checkable layer rules and data invariants catalogued in DD §1.15 at merge, and runs locally. A failure prints the offending `file:line` and the canonical site to fix.

Run the convention gate alone for fast local feedback; run the full suite before every push:

```bash
bash scripts/ci/assert_conventions.sh   # quick: convention gate only
./run_all_tests.sh                       # full pre-push suite (includes the gate)
```

`./run_all_tests.sh` is the authoritative pre-push suite: it runs the convention gate plus build, lint, dependency audit, secret scan, and the unit, integration, and e2e tests. Push only after it passes.

To add a rule: add the check to `scripts/ci/assert_conventions.sh`, or to a delegated `scripts/ci/check_*.sh` wired into it, paired with the layer rule or design decision it enforces. The check fails closed with an offending `file:line`, and scopes out false positives with explicit exclusions. Rules that need judgment, or that range over a growing set, are carried by the bug-hunt review, not the gate.

### 13.2 Promotion policy

| Target | Promotion rule |
|---|---|
| Development | fast iteration; developers may deploy frequently |
| Staging | only from reviewed branches; used for migration rehearsal, restore rehearsal, smoke tests, and secret-rotation rehearsal |
| Production | promote only a version already validated in staging unless incident response requires emergency hotfix flow |

### 13.3 Standard deployment runbook

The deploy is operator-driven from the maintainer workstation. CI lints, type-checks, and runs the test suite; the deploy itself is one local script invocation against the target origin. The deploy trigger remains a local manual step by design: GitHub-hosted runners use dynamic IPs, while the Lightsail firewall remains locked to explicit operator CIDRs.

#### Preconditions

- green CI
- reviewed code and infrastructure diffs
- if schema changed: migration plan reviewed and §15.3 followed for live data
- if secrets changed: rotation verification plan ready
- staging validation complete
- rollback path identified

`deploy_to_aws.sh` runs its own preflight before reading any credentials: it verifies the required tools (`ssh`, `rsync`, `docker`, `jq`), that the SSH alias resolves, that there is at least ~2 GB free in the working directory, that the local DB is not held by another process (when a rebuild is involved), and that the operator credential source is readable. Each check fails with a generic recommendation and prints no on-disk path.

#### Workflow

1. Make the change locally.
2. Run the local quality gate.
3. Push a branch and open a PR.
4. Let CI run.
5. Let branch protection block merge until checks pass.
6. Merge.
7. Run exactly one deploy command from your local machine against the target origin.
8. Verify the origin.
9. If CloudFront is enabled, verify CloudFront too.

#### Pre-deploy: check the env file

The host env file `/srv/footbag/env` is the runtime source of truth. The deploy remote-half reconciles the deploy-managed keys at every deploy: `FOOTBAG_ENV` (the deploy target), the SSM-sourced secrets (`X_ORIGIN_VERIFY_SECRET` and `SESSION_SECRET`), the adapter-mode defaults, and the container-sizing values from `docker/env/<env>.env`. Operator-managed secrets (such as the Stripe keys) are left untouched by the deploy. Review the operator-managed keys before any deploy that introduces a new required environment variable or changes runtime behavior.

At minimum, the host env file must define:

- `NODE_ENV`
- `LOG_LEVEL`
- `FOOTBAG_DB_PATH`
- `FOOTBAG_DB_DIR`
- `PUBLIC_BASE_URL`
- `SESSION_SECRET`

Container memory limits and encoder tuning are env-driven so the same `docker-compose.prod.yml` overlay sizes correctly for the host bundle. These values are version-controlled, not hand-set: the deploy seeds them into `/srv/footbag/env` from the committed `docker/env/<environment>.env` (the source of truth), keyed on `FOOTBAG_ENV`, validated against a sizing-key allowlist, and `verify-staging-env.sh` asserts the host matches the committed file. The per-environment values are tabulated in §3.2.

`docker/docker-compose.prod.yml` bind-mounts `${FOOTBAG_DB_DIR}` into `/app/db`, and `footbag.service` starts Docker Compose with `--env-file /srv/footbag/env`. If the env file is wrong, the deploy can succeed mechanically but still fail at runtime.

Warning: do not use `#` in env-file values. systemd `EnvironmentFile` parsing treats `#` as an inline comment delimiter.

#### Pre-deploy: local quality gate

Always run:

```bash
npm test
```

Before a production deploy, run the full pre-push suite (build + conventions + lint + audit + unit + integration + e2e), not just `npm test`:

```bash
./run_all_tests.sh
```

Optionally run Docker parity when the change touches runtime shape, static assets, containerization, or environment handling.

#### Deploy options

**Option A; routine code-only deploy (the default)**

Use this when the host DB should remain untouched. A bare deploy (no flags) is code-only; `-k` is the explicit equivalent.

```bash
./deploy_to_aws.sh
```

This path preserves `/srv/footbag/env` and the live DB. If `database/schema.sql` differs from the schema of the DB deployed on the host, the deploy detects the drift (read-only over SSH) and prompts to rebuild instead, since a code-only deploy does not reapply schema; on confirmation it re-runs as `--from-csv`.

**Option B; destructive schema/dev deploy**

Use this when the change requires rebuilding and replacing the host DB from scratch and the target's data is disposable (staging only).

```bash
./deploy_to_aws.sh --from-csv
```

This path preserves `/srv/footbag/env` but intentionally destroys and replaces the live host DB. `--from-csv` rebuilds from the canonical CSVs without mirror access, but it still requires the operator's gitignored membership roster (it runs the full enrichment pipeline) — it is not a committed-data-only path. Pass `--soup-to-nuts` instead to rebuild from the legacy mirror and turn on the full seed set (curated media, personas, dev-admins; opt out per axis with `--no-media` / `--no-personas` / `--no-dev-admins`); that path regenerates committed canonical_input, name_variants, and seed files as a side effect, so the working tree may show diffs after the run.

For schema changes against a target with non-disposable data (production), follow the migration runbook in §15.3 instead of Option B.

Do not document manual `scp` + `ssh sudo cp` DB-replacement procedures. Those manual destructive flows are superseded by the entry-point deploy, `./deploy_to_aws.sh` (which delegates to `scripts/deploy-rebuild.sh`).

#### Operational invariants enforced by the deploy

The script-based deploy path enforces these; manual deploys must check them.

- root-owned host AWS shared config/shared credentials source material is in place for runtime role assumption
- only the intended containers receive the required AWS config/credential mounts, read-only
- each AWS-enabled service selects the intended runtime profile explicitly
- effective caller identity for the AWS-enabled service path is verified before declaring deployment success
- `/srv/footbag/env` is owned `root:root` with mode 0600
- image-digest equality is verified after `docker load`; an ID mismatch aborts the deploy
- `X_ORIGIN_VERIFY_SECRET` is fetched from SSM and `FOOTBAG_ENV` is reconciled into `/srv/footbag/env` before the compose restart (§10.9)
- environment-conditional adapter selectors are reconciled before the compose restart: `SES_ADAPTER` is forced to `stub` on staging and development hosts so non-production never sends real mail (production is operator-set to `live` and validated, not overwritten), and `PAYMENT_ADAPTER` is seeded to `stub` where absent on non-production hosts
- the host SQLite file exists and its parent directory is mounted into the compose stack at `/app/db`, with the DB visible inside the container at `/app/db/footbag.db`

#### Post-deploy verification

Always verify the origin first.

```bash
BASE_URL=http://<origin> bash scripts/smoke-local.sh
```

Also verify manually in the browser when the change affects routing, rendering, or static assets.

If CloudFront is enabled, also verify CloudFront after the origin is confirmed healthy:

```bash
BASE_URL=https://<cloudfront-domain> bash scripts/smoke-local.sh
```

Why origin-first still matters: if the origin fails, CloudFront only obscures the root cause.

Confirm the worker container has logged its job/backup loop activity for the deploy window, then end the change window. End the change window only after post-deploy verification is clean.

### 13.4 Rollback runbook

Rollback is required when:

- readiness does not recover
- critical user flows fail
- alarms spike immediately after deploy
- secret rotation validation fails
- migration-related behavior is unsafe to continue

#### Procedure

1. Stop further rollout activity.
2. Check out the last known-good commit and re-run the code-only deploy:

```bash
git checkout <known-good-ref>
./deploy_to_aws.sh -k
```

The database is not touched by the code-only deploy (`./deploy_to_aws.sh -k`).

3. Verify `/health/live` and `/health/ready` on the origin.
4. Re-run smoke tests against the origin and (if enabled) CloudFront via `scripts/smoke-local.sh`.
5. Document the rollback trigger and next action.

If the failure is schema-related, use the migration rollback rules in §15 before serving traffic again.

### 13.5 Restart runbook

Use targeted restarts for:

- stale cached secret/config values loaded at startup
- worker stuck state
- isolated image processor failure
- nginx reload after safe config change

Do **not** use restarts as a substitute for root-cause analysis when alarms or crash loops continue.

#### Required verification

After any restart, confirm the service recovered before closing the action:

- `/health/live` and `/health/ready` return 200 on the origin.
- `docker ps` shows the restarted container(s) `healthy`, not `Restarting`.
- `BASE_URL=http://<origin> bash scripts/smoke-local.sh` passes.
- the worker has logged its job/backup loop activity for the window (when the worker was restarted).

### 13.6 Cutover rollback

Cutover rollback decisions follow a hard time boundary.

**Within T+4 hours of the DNS swap:** rollback is the operator's call. Procedure:

1. Enable maintenance mode per §14.3.
2. Restore the pre-cutover snapshot per §16.5 Snapshot restore.
3. Disable maintenance mode.
4. Run smoke tests against the origin per §18.8.
5. Document the rollback trigger and the remediation plan.

The pre-cutover snapshot is taken as State 4 step 9 (after the batch auto-link and validation, before the DNS switch). The snapshot includes the auto-link results, so the restore does not need to re-run the batch.

**After T+4 hours:** rollback discards accumulated new user activity (registrations, claim confirmations, content edits). The decision requires governance sign-off. Procedure:

1. Convene the maintainer, the IFPA primary contact, and any active operators.
2. Quantify the in-window writes (count registrations, claim audit rows, content edits) before deciding.
3. If proceeding: run the within-T+4h procedure above. If not: document why fix-forward is preferred over rollback.

The T+4-hour boundary is a default; the maintainer may adjust the window based on observed traffic volume after cutover.

---

## 14. Health Endpoints, Maintenance Mode, and Readiness

### 14.1 `/health/live`

Purpose: cheap process liveness check.

Rules:

- return success only when the process is running
- do **not** call external dependencies
- do **not** call Stripe or SES
- keep the handler cheap and stable
- use this to distinguish dead process from dependency failure

### 14.2 `/health/ready`

Purpose: safe-to-serve-traffic readiness signal.

Readiness validates two serve-traffic gates:

- SQLite connectivity
- container memory pressure (returns 503 above the §12.4 threshold, which triggers the CloudFront maintenance page on subsequent organic traffic)

Readiness must **not**:

- call Stripe
- call SES
- call KMS
- call S3 or any other external dependency
- check backup freshness (alarm-surfaced per §16, not a readiness signal)
- perform expensive dependency fan-out
- hide partial failure by always returning success

Operational rule: if readiness fails persistently, treat the origin as not safe to receive traffic and recover or roll back.

### 14.3 Maintenance mode

Maintenance mode is the binary working-versus-maintenance model served at the CloudFront edge: CloudFront custom error responses for an origin returning `500/502/503/504` (or being unreachable) serve the branded maintenance page asset from S3, with a short error-cache TTL so recovery becomes visible quickly. Browsing requests (GET/HEAD) see either the live application or the maintenance page; state-changing requests may fail with connection errors during an origin outage.

For **planned** maintenance the operator induces that state deliberately by taking the origin out of rotation (stop the app container so the origin is unreachable), then performs the change directly against the host: the DB file under `/srv/footbag/db/` stays accessible for migrations and host-side batch work while public traffic sees the maintenance page. Restoring the origin (start the container, readiness green) ends maintenance.

For **unplanned** origin loss the same CloudFront layer is the automatic safety net.

### 14.4 Planned maintenance

Use a maintenance window for:

- schema migrations with required downtime
- container/resource changes that require restart
- restore drills in staging
- security changes with expected brief service interruption

During planned maintenance:

1. ensure maintenance page path and CloudFront error behavior are correct
2. communicate maintenance window internally
3. stop or drain traffic as needed
4. run the change
5. verify origin health
6. confirm CloudFront returns to live content

### 14.5 Unplanned outage handling

If CloudFront is serving the maintenance page:

- verify whether the origin is actually down or merely not-ready
- check recent deploys, restarts, memory alarms, backup alarms, and database contention
- recover the origin first; CloudFront will return to live content automatically once healthy responses resume

---

## 15. SQLite, Schema Migration, and Data Operations

### 15.1 SQLite operating model

SQLite is the live primary database.

Operational implications:

- migrations require discipline and usually a short maintenance window
- WAL mode is part of the backup/recovery design
- the DB file on the instance is an intentional simplicity trade-off
- instance access and backup access must therefore be tightly controlled
- volunteers need basic SQL literacy for diagnostics and migrations

### 15.2 Migration rules

- use sequential, reviewed migration files
- prefer backward-compatible changes when feasible
- rehearse in staging using production-like anonymized data
- take or verify a current backup before migration
- run migrations during a maintenance window when required
- verify post-migration readiness before reopening traffic

### 15.3 Migration runbook

1. Confirm current snapshot is healthy and recent.
2. Put the site into the planned maintenance state.
3. Stop or drain write traffic.
4. Apply migrations in order.
5. Run integrity and smoke checks: `PRAGMA integrity_check` against the migrated DB on the host (`ssh footbag-<env> "sqlite3 /srv/footbag/db/footbag.db 'PRAGMA integrity_check;'"`, expect `ok`), then `BASE_URL=http://<origin> bash scripts/smoke-local.sh`.
6. Restart services if required.
7. Verify `/health/live` and `/health/ready`.
8. Remove maintenance state.
9. Monitor logs and alarms for at least one stability window.

#### Required verification

- `PRAGMA integrity_check` returns `ok`.
- `scripts/smoke-local.sh` passes against the origin, and `/health/ready` is green.
- against a production-like target, the migration was first rehearsed in staging on anonymized data (§15.2).

### 15.4 Data-access rules for operators

- use sqlite tools only when the app, runbook, or restore workflow requires it
- do not make ad hoc data edits in production unless a documented emergency fix is approved
- prefer audited application workflows for normal administrative changes
- if a direct DB fix is unavoidable, record the exact SQL and reconcile any permanent rule change into code or migration files

### 15.5 Contention and performance alarms

Investigate immediately when you see:

- backup age beyond threshold
- repeated `SQLITE_BUSY`
- slow query log growth
- WAL file growth beyond threshold
- long checkpoint latency
- disk usage approaching capacity

Common first checks:

- recent deploy or migration
- long-running write transaction
- worker backup failure
- abnormal import or cleanup workload
- host disk pressure

---

## 16. Backup, Restore, and Disaster Recovery

### 16.1 Recovery objectives by scenario

| Scenario | Target RPO | Target RTO | Notes |
|---|---|---|---|
| common database restore from recent snapshot | 5–10 minutes | ~5 minutes | primary operational recovery path |
| full service restore after application or host failure in-region | recent snapshot window | operator-paced; typically short if infra is intact | CloudFront serves maintenance page while recovering |
| cross-region regional disaster restore | up to last cross-region sync for DB; media replication target is tighter | 2–4 hours | requires manual rebuild and cutover |

### 16.2 Continuous database backup

Required behavior:

- run every `continuous_backup_interval_minutes` minutes (default 5)
- checkpoint WAL before snapshot
- use SQLite backup API for a consistent snapshot
- upload to the primary snapshot bucket
- retry on transient upload failure
- update backup success/failure metadata for logs and job history
- raise an alarm after repeated failure
- wait for in-flight backup completion on controlled shutdown when that shutdown hook exists

Operator wiring: the producer is `scripts/backup-db.sh`, scheduled by the systemd pair `ops/systemd/footbag-backup.service` + `footbag-backup.timer` (5-minute cadence). Install from the operator workstation with `scripts/install-backup-timer.sh --target <staging|production>`, which stages both units onto the host, installs them into `/etc/systemd/system/`, enables the timer, and runs the service once so a missing prerequisite fails loudly at install time. The script requires `BACKUP_S3_BUCKET` in `/srv/footbag/env` and emits the `BackupAgeMinutes` CloudWatch heartbeat; once the metric flows, flip the Terraform variable `enable_backup_alarm` to arm the staleness alarm (`treat_missing_data = breaching`, so arming it before the metric exists pages immediately).

### 16.3 Nightly cross-region DR sync

A separate nightly sync protects against regional failure.

Required behavior:

- copy relevant primary backup state to the DR bucket
- verify integrity of the copied content
- enforce DR retention through Object Lock in GOVERNANCE mode with a 30-day retention period, overridable only by a tightly scoped role holding `s3:BypassGovernanceRetention` so a lawful erasure request can be honored on backup objects that contain personal data
- log run metadata and failures
- raise alarms on failure

### 16.4 Media backup

Required stance:

- the media bucket has versioning enabled and a 30-day `NoncurrentVersionExpiration` lifecycle. Avatar keys are stable per member, so replacement uploads overwrite-in-place; the lifecycle rule prevents indefinite accumulation of noncurrent bytes. Cache invalidation is URL-versioned via the `?v={media_id}` query string.
- continuous S3 cross-region replication runs from the primary media bucket to a dedicated media DR bucket (ONEZONE_IA storage class). Delete markers replicate so account-erasure deletions propagate.
- Object Lock is intentionally not applied to the media DR bucket: photo deletion must propagate to the DR side to honor member-account-erasure. Operator-recovery headroom comes from versioning plus the 30-day noncurrent expiration on both buckets.
- verify replication health after any Terraform apply touching the photo path (use `aws s3api get-bucket-replication` and a marker round-trip into the DR bucket).
- treat media restore as a storage operation, not a SQLite restore operation.
- the recovery procedure: promote the DR bucket to primary by updating the CloudFront `/media/*` origin and the `MEDIA_STORAGE_S3_BUCKET` env var together in the same operator step (both must change atomically; if CloudFront points at the new bucket but the env var still names the old one, the app writes to a bucket CloudFront no longer serves; if the env var is updated first, the app writes to S3 keys that CloudFront does not yet serve). Alternatively, restore objects from the DR bucket to a new primary bucket. When updating the origin, confirm the `/media/*` cache behavior retains no origin request policy.
- when a photo key does not exist, S3 returns 403 AccessDenied (not 404) because the bucket policy grants only `s3:GetObject` to CloudFront, not `s3:ListBucket`. This is intentional: without ListBucket, S3 cannot confirm whether the key is absent or forbidden, so it returns 403 for both cases, preventing enumeration of bucket contents. A 403 on a `/media/*` URL is therefore not necessarily a permissions regression; first confirm the key exists in S3 before investigating IAM.

#### Photo storage pipeline operations

The avatar/photo pipeline runs on a four-container topology (nginx + web + worker + image), with photo bytes stored in S3 and served by CloudFront with OAC. Per-environment configuration lives in `/srv/footbag/env`, not Parameter Store (these are non-secret deploy-time values per §10.3). The `image` container runs Sharp (avatar/photo) and ffmpeg (curator video transcode) internally on the docker network and is reachable only from web.

##### Required `/srv/footbag/env` variables

- `MEDIA_STORAGE_ADAPTER=s3` (production/staging) or `local` (operator parity check only)
- `MEDIA_STORAGE_S3_BUCKET=<terraform output media_bucket_name>`
- `IMAGE_PROCESSOR_URL=http://image:4000`
- `IMAGE_MAX_CONCURRENT=2` (default; tune under observed load)
- `IMAGE_VIDEO_MAX_CONCURRENT=1` (default; raise only when host memory headroom permits a second concurrent ffmpeg)

##### Replication verification (after any TF apply touching s3.tf)

1. `aws s3api get-bucket-replication --bucket <media>` -- expect `Status: Enabled`, destination `<dr_bucket_arn>`.
2. Put a marker: `aws s3api put-object --bucket <media> --key replication-test/$(date +%s).txt --body /etc/hostname`.
3. Wait 5 minutes.
4. `aws s3api head-object --bucket <dr> --key <marker_key>` -- expect 200 with `ReplicationStatus: REPLICA`.
5. Delete the marker from both buckets.

##### OAC bucket-policy verification

`aws s3api get-bucket-policy --bucket <media>` -- the `Principal` should be `cloudfront.amazonaws.com` and the `Condition.StringEquals."aws:SourceArn"` should match the CloudFront distribution ARN. Any other principal is a misconfiguration.

Also confirm no origin request policy is attached to the `/media/*` cache behavior: `aws cloudfront get-distribution-config --id <dist-id>` and inspect the `/media/*` ordered cache behavior's `OriginRequestPolicyId` field, which must be empty or absent. A `Managed-AllViewer` policy (or any policy that forwards `Host`) re-introduces the virtual-host routing bug that causes S3 to return `<Code>NotFound</Code>` before evaluating the bucket policy.

##### Smoke trigger

After every `terraform apply` that touches `s3.tf`, `iam.tf`, or `cloudfront.tf` for the media path, run `npm run test:smoke` from a workstation. The `tests/smoke/media-storage.smoke.test.ts` cases must be green before declaring the change successful.

##### Cutover sequence (one-time, when transitioning a fresh environment from local-fs to S3)

1. Verify the photo-pipeline S3 infrastructure is in place: bucket versioning enabled, replication active, app_runtime has `app_s3_media` policy.
2. `terraform plan` for cloudfront.tf + s3.tf bucket policy. Review.
3. `terraform apply`. CloudFront propagation takes ~5-15 minutes; monitor via `aws cloudfront get-distribution --id <id>`.
4. SSH to host. Edit `/srv/footbag/env` (root-owned, 0600). Add the four lines listed above.
5. `systemctl restart footbag.service`. Wait for `docker compose ps` to show all four containers healthy.
6. `npm run test:smoke` from a workstation. Must be green.
7. Manual verification: log in as the preview-user; upload a JPEG avatar; refresh the profile-edit page; confirm display works and the URL has a `?v=` UUID; confirm `aws s3 ls s3://<media>/avatars/{member_id}/` shows two keys.

##### Rollback

If the cutover fails after step 4:

- Revert `/srv/footbag/env`: remove the four lines added in step 4.
- `systemctl restart footbag.service`.
- `terraform apply` a revert of `cloudfront.tf` to restore the prior `/media/*` cache behavior topology (whatever was in place before `/media/*` was migrated to S3 origin via OAC). Required because CloudFront still serves media from S3 until the TF revert lands; with the env reverted but CloudFront still on S3, displays will 404.

A clean rollback requires both an env revert AND a CloudFront TF revert.

#### Curator media seeding

System-account-owned content (FH avatar, landing-page demo loops, future illustrations and historical content) is seeded operationally rather than uploaded interactively. The seed script (`scripts/seed_fh_curator.py`) reads source assets from `curated/`, transcodes videos through ffmpeg with the canonical malware-stripping options (DD §6.8), processes photos through PIL, writes the processed outputs to a local filesystem directory, and INSERTs the corresponding `media_items` + `media_tags` rows owned by the system member. Auto-applies the `#curated` tag on every row.

The curator media cycle has two parts on `./deploy_to_aws.sh`. The seed step (sidecars in `/curated/` -> `media_items` rows) runs unconditionally on every deploy that ships a DB to staging; the orchestrator invokes `scripts/seed_fh_curator.py` against the local DB before the rsync push. Set `CURATOR_SEED=no` to skip it (rare; used when sidecars are known broken). The S3 media cycle builds the curated media fresh from `curated/` into an ephemeral `.curated-build/` directory (the dev `s3-adapter-local/` store is never shipped) and `aws s3 sync`s it to the bucket. It is opt-in via `-m` / `--sync-media` (default off): curated `media_items` rows ship with `footbag.db` on every deploy regardless, and existing S3 bytes persist across deploys, so `-m` is only needed when the curated binaries in `curated/` actually changed. With `-m`, the sync uses `--delete` (a clean wipe of stale objects) by default when a DB rebuild is happening (avatar S3 keys remap on a fresh DB seed) and is additive (`--size-only`) with `-W` / `--no-s3-wipe`. URL-reference content (YouTube/Vimeo) needs no S3 bytes and is up to date after any DB-bearing deploy (the curator rows ship with footbag.db).

Run order in dev: included automatically in `bash scripts/reset-local-db.sh` (the seed step is gated on `CURATOR_SEED`, which defaults to yes when `reset-local-db.sh` is invoked outside the deploy orchestrator).

Run order in staging:

1. `./deploy_to_aws.sh --from-csv` (rebuild + sidecar seed, no S3 media sync; prompts before each destructive step). A bare `./deploy_to_aws.sh` is code-only and ships no DB, so it does not re-run the sidecar seed. `./deploy_to_aws.sh --from-csv -y` accepts the default-yes answers without prompting (CI). Add `-m` / `--sync-media` to also build `.curated-build/` and push it to S3.
2. When `-m` is set, the remote-half `aws s3 sync`s `RELEASE_DIR/.curated-build/` to the bucket: with `--delete` (removing stale objects) when wipe=Y, or additively (`--size-only`) when `-W`/wipe=N.
3. CloudFront serves the seeded URLs at `/media-store/{key}` via OAC.

`media_id` is derived from a SHA of the id_seed plus source bytes, so updating a source asset (e.g., swapping the FH avatar) produces a new render URL on the next seed run; browser cache busts naturally without manual invalidation.

For ad-hoc lifecycle work that does not require a deploy (e.g., fixing a caption or tag on already-published content), use the admin UI at `/admin/curator/media` (see USER_STORIES `A_Upload_Curated_Media`, which covers the full curator lifecycle: upload, edit, delete, and category creation). Edit/delete via the admin UI mutate the live DB + S3 directly without a deploy cycle.

**After go-live**, the production DB is persistent and is the source of truth for curator media. The curator seeder (`scripts/seed_fh_curator.py`) is **not** run against the production DB: its reconcile and orphan-cleanup model deletes rows that have no `/curated/` sidecar, which post-go-live includes admin- and member-created content. Curator lifecycle (upload, edit, delete, gallery management) is admin-UI -> DB directly, per USER_STORIES `A_Upload_Curated_Media` and `A_Manage_Curated_Gallery`. Data-preserving deploys against the persistent DB use the migration deploy path (`scripts/deploy-migrate.sh`), not the destructive rebuild path; curator content is recovered through the standard DB backup and restore path (§16), the same as all other persistent data. `/curated/` remains the dev and pre-go-live authoring and seed source.

### 16.5 Snapshot restore runbook

Use this for corruption, bad deploy with data damage, or accidental destructive bug.

1. Put the site in maintenance mode.
2. Identify the restore point: routine snapshots live in the primary `BACKUP_S3_BUCKET` (the `<prefix>-db-snapshots` bucket) under `routine/YYYY/MM/DD/footbag-<timestamp>.db.gz`; list with `aws s3 ls s3://<bucket>/routine/`.
3. Download the selected snapshot to the host and decompress it: `aws s3 cp s3://<bucket>/routine/YYYY/MM/DD/footbag-<timestamp>.db.gz /srv/footbag/db/restore.db.gz && gunzip /srv/footbag/db/restore.db.gz`.
4. Run `PRAGMA integrity_check` on the decompressed file: `sqlite3 /srv/footbag/db/restore.db 'PRAGMA integrity_check;'` (expect `ok`).
5. Replace the live DB file with the validated snapshot.
6. Restart affected containers.
7. Verify `/health/live` and `/health/ready`.
8. Run targeted smoke checks: `BASE_URL=http://<origin> bash scripts/smoke-local.sh`.
9. Remove maintenance mode and monitor.

### 16.6 Cross-region disaster restore runbook

Use this only when the primary region or primary storage path is unavailable for extended recovery.

1. Provision replacement infrastructure in the recovery region or approved alternate target.
2. Restore application code and container configuration.
3. Restore the SQLite snapshot from the DR bucket.
4. Reconnect or re-point media storage according to the DR design.
5. Update Route 53 and CloudFront origin configuration.
6. Verify end-to-end application function.
7. Communicate status and monitor carefully.

#### Required verification

- `/health/live` and `/health/ready` return 200 against the recovery origin.
- `BASE_URL=http://<recovery-origin> bash scripts/smoke-local.sh` passes; if a domain is attached, also run it against the CloudFront URL.
- the post-restore checklist in §16.8 passes (critical read paths, admin dashboard backup/job state, no environment-crossing secrets introduced).

### 16.7 Backup validation and restore drills

Backups do not count as working until restore is proven.

Minimum drill expectations:

| Drill | Cadence | Required output |
|---|---|---|
| recent snapshot restore in staging | quarterly | restore time, issues found, verification checklist |
| cross-region DR rehearsal | at least annually or after major infra change | cutover notes, missing dependencies, revised timing estimate |
| backup-content validation | weekly automated check plus human review of failures | evidence that expected files and object paths exist |

### 16.8 What to verify after any restore

- application starts cleanly
- health endpoints pass
- critical read paths work
- admin dashboard shows expected backup/job state
- logs and alarms are normalizing
- no environment-crossing secrets or endpoints were introduced accidentally

---

## 17. Background Jobs and Scheduler Operations

### 17.1 Ownership model

`OperationsPlatformService` owns job orchestration, job-run logging, cleanup jobs, readiness composition, and alarm raise/ack integration for the in-app periodic jobs. Job logic belongs in application code; schedule ownership belongs to the infrastructure/operator layer. Database backup is the deliberate exception: it runs as a host-side systemd one-shot (`scripts/backup-db.sh`) so it keeps producing snapshots independent of application health, and therefore is not an `OperationsPlatformService` job and does not write a `system_job_runs` row.

### 17.2 Job catalog

| Job | Cadence | Purpose | Operator concern |
|---|---|---|---|
| `SYS_Send_Email` | every `outbox_poll_interval_seconds` | send queued mail from `outbox_emails` via `LiveSesAdapter` | dead-letter growth, bounce/complaint alarms, worker container crash-loop on missing shared-config env vars (see §5.4) |
| `SYS_Check_Active_Player_Expiry` | daily | expire or remind Active Player status (Tier 0 only) | missed runs or unusual reminder spikes |
| `SYS_Open_Vote` | at least hourly | open scheduled votes | failed openings, admin-alerts flow |
| `SYS_Close_Vote` | at least hourly | close scheduled votes | failed closures, tally readiness |
| `SYS_Reconcile_Payments_Nightly` | nightly | reconciliation and digest generation | payment mismatches, digest failures |
| `SYS_Cleanup_Soft_Deleted_Records` | daily | PII purge and retention cleanup | retention correctness and audit trail |
| `SYS_Cleanup_Expired_Tokens` | daily | remove expired tokens | table growth, auth cleanup health |
| `SYS_Rebuild_Hashtag_Stats` | daily | rebuild tag stats | stale discovery stats |
| `SYS_Continuous_Database_Backup` (host-side; see §17.1) | every 5 minutes by default | create SQLite snapshots via the `scripts/backup-db.sh` systemd one-shot, not an `OperationsPlatformService` job | backup age and failure alarms (surfaced via the `BackupAgeMinutes` metric, not `system_job_runs`) |
| `SYS_Nightly_Backup_Sync` | nightly | sync to cross-region DR bucket | DR freshness and validation |
| `SYS_Cleanup_Static_Asset_Versions` | daily off-peak | remove obsolete versioned assets | rollback window preservation vs storage growth |
| webhook processors | event-driven | Stripe / SES durable inbound processing | idempotency failures, signature failures |

### 17.3 Scheduler rules

- schedules are infrastructure-managed, not app-admin managed
- schedule changes must be code-reviewed
- schedule definitions live with infrastructure configuration
- in-app job execution status is visible in the app health view, but schedule changes are not exposed in the app; the host-side database backup surfaces instead via its `BackupAgeMinutes` CloudWatch metric and `db-backup-stale` alarm
- missed job executions must alert before user-visible damage accumulates

### 17.4 Job failure response

For any failed job:

1. confirm whether it is a one-off or repeated failure
2. inspect CloudWatch logs and recent deploys
3. confirm required secrets/config are present
4. confirm dependent AWS services are reachable and authorized
5. rerun safely only if the job is idempotent or the runbook explicitly permits rerun
6. document operator action and outcome

### 17.5 Job-run logging

Every in-app job run records, in `system_job_runs`:

- job name
- start and end time
- success/failure state
- error summary if failed
- operator correlation where manually rerun
- key metrics such as processed counts when relevant

The host-side database backup is the exception: it surfaces via the `BackupAgeMinutes` CloudWatch metric and the `db-backup-stale` alarm (a dead timer, a failing upload, and a wedged host all breach it) rather than a `system_job_runs` row.

### 17.6 Curator video transcode job inspection

The asynchronous interactive admin video upload (DD §6.8 "Asynchronous orchestration") records each upload in the `media_jobs` table with a state machine: `pending_upload` → `pending_transcode` → `processing` → `succeeded` | `failed` | `abandoned`. The dispatch handler runs in the worker container's HTTP server alongside the email-outbox loop; ffmpeg runs in the existing image container.

Inspection queries:

```sql
-- Recent jobs across all admins
SELECT id, state, retry_count, last_error, created_at, updated_at
FROM media_jobs
ORDER BY created_at DESC
LIMIT 20;

-- Stuck-looking jobs (processing past their dispatch lease, or terminal failures)
SELECT id, state, admin_member_id, last_error, last_attempted_at, lease_expires_at
FROM media_jobs
WHERE state IN ('processing','failed')
ORDER BY updated_at DESC;
```

Failure response:

- A `processing` row whose `lease_expires_at` is in the past indicates the worker crashed mid-transcode. The worker's one-shot boot-time recovery sweep resets such rows to `pending_transcode` for re-dispatch; restart the worker container to trigger the sweep.
- A `failed` row is terminal. The admin re-uploads to retry; there is no in-place retry from the operator side.
- Pending S3 source bytes live under `pending/<jobId>/`. The worker deletes them on success; an S3 lifecycle rule on the `pending/` prefix expires anything left after 24 hours, so orphaned uploads do not require manual cleanup.

---

## 18. Routine Security and Platform Operations

### 18.1 Monthly routine tasks

- review CloudWatch alarm history
- review CloudTrail for privileged production activity
- verify backup success and drill recency
- review SES reputation and bounce/complaint rates
- review container memory and restart trends
- review budget status and forecast
- run `npm run audit` from a clean checkout; triage any moderate-or-higher dependency advisories (per `docs/TESTING.md` §9)

### 18.2 Quarterly routine tasks

- IAM and access review
- Parameter Store namespace cleanup
- backup restore rehearsal
- secret and key rotation review
- alert-threshold tuning review
- production access, SSH authorized-key inventory, and offboarding review
- GitHub repository security posture: branch protection rules, required-checks list, open code-scanning alerts, and Dependabot alerts (via `gh api repos/<owner>/footbag-platform/...`)

### 18.3 Patch management

- apply OS security updates on a documented cadence
- patch outside peak traffic when restart is required
- verify health endpoints and logs after patching
- record the patch date and any notable changes

### 18.4 Parameter Store hygiene

- remove unused parameters only after verifying no code path depends on them
- keep descriptions and tags current
- review prod write permissions carefully
- never leave obsolete secrets accessible longer than necessary

### 18.5 SES and deliverability maintenance

- verify DNS authentication records remain intact
- monitor reputation and quota
- investigate bounce/complaint spikes
- keep webhook processing healthy and idempotent
- test email paths after any sender-domain or secret change

### 18.6 Access reviews and volunteer turnover

When a volunteer leaves or no longer needs access:

1. remove AWS access promptly
2. remove repository and CI/CD access
3. rotate any credentials that were directly known to that person if required
4. verify there are no forgotten personal email subscriptions on alerting paths
5. document completion

### 18.7 Resource tuning

This guide treats resource tuning as a runbook, not guesswork.

When tuning memory or instance size:

- use observed CloudWatch data
- change one variable at a time where possible
- rehearse in staging first
- document the reason and expected effect
- verify after deployment

### 18.8 Operator-workstation staging readiness smoke test

`tests/smoke/staging-readiness.test.ts` is the canonical end-to-end probe of the staging AWS runtime identity wiring. Its assertions all run against real AWS:

1. `sts:GetCallerIdentity` resolves to an `assumed-role` ARN under the staging app-runtime role.
2. `kms:GetPublicKey` on the JWT signing key (by ARN) returns RSA-2048 SIGN_VERIFY with RSASSA_PKCS1_V1_5_SHA_256 support.
3. `kms:GetPublicKey` resolves the same key by its alias.
4. KmsJwtAdapter signs and verifies a short-lived JWT round-trip against real KMS.
5. `ses:SendEmail` to `success@simulator.amazonses.com` from the default sender succeeds end-to-end.
6. `ses:SendEmail` honors a per-message `from` override.

Run after any change that could affect the runtime identity chain: IAM policy edits on the source-profile user or the runtime role, KMS key policy edits, SES identity changes, runtime trust-policy changes, source-profile access-key rotation, or a host rebuild that touches `/root/.aws/`.

#### Workstation profile (one-time setup)

Append to the operator's `~/.aws/config`:

```ini
[profile <env>-runtime]
role_arn       = arn:aws:iam::<account-id>:role/footbag-<env>-app-runtime
source_profile = footbag-operator
region         = us-east-1
```

The operator-IAM-user keys are already in `~/.aws/credentials` for the operator profile; no new long-lived key material on the workstation. The chained AssumeRole into the staging runtime role inherits operator credentials at AWS-API call time. `mfa_serial` is intentionally omitted: the runtime role's permissions are a strict subset of the operator's `AdministratorAccess`, so MFA on this chained AssumeRole adds no defense beyond what the operator already carries. To require MFA prompts on this profile, add `mfa_serial = arn:aws:iam::<account-id>:mfa/<operator-mfa-device>`.

#### Invocation

```bash
npm run test:smoke
```

The runner script reads the KMS signing-key ARN and SES sender identity from `terraform -chdir=terraform/staging output -raw` and hardcodes `AWS_PROFILE`, `AWS_REGION`, and the smoke gate. The operator's workstation must already have `terraform init` run in `terraform/staging/`.

Expected: 6 passes, runtime under 15 seconds. The suite is excluded from the default `npm test` run via the `test:smoke` script's `tests/smoke/` glob, so dev and CI never accidentally reach AWS.

#### Failure modes

Each assertion has a distinct failure cause. The test file's header comment block (`tests/smoke/staging-readiness.test.ts`) carries the per-error mapping. When a smoke run fails, read that legend before changing IAM, KMS, or SES. The common symptom-to-cause map:

| Symptom | Likely cause |
|---|---|
| `sts:GetCallerIdentity` returns the source IAM user's ARN, not an `assumed-role/...` ARN | runtime role trust missing the source-profile principal, source-profile policy missing `sts:AssumeRole`, or a mislabeled `[profile <env>-runtime]` stanza |
| `kms:GetPublicKey` / `kms:Sign` → `AccessDeniedException` | runtime role policy missing `kms:GetPublicKey` / `kms:Sign` on the key ARN |
| `kms:GetPublicKey` → `NotFoundException` | wrong region for the key ARN, or the key was disabled/deleted |
| `kms:Sign` → `KMSInvalidStateException` | key usage is not `SIGN_VERIFY`, or the key is disabled/pending deletion |
| `ses:SendEmail` → `MessageRejected: ... not verified` | sender (or recipient, in sandbox) not verified in SES (§9.5) |
| `ses:SendEmail` → `AccessDeniedException` | runtime role policy missing `ses:SendEmail` on the identity ARN |

What the smoke deliberately does not cover: outbox drain timing (the worker's send loop, covered by integration tests against the stub), end-to-end password-reset against a real member, CloudFront routing / `Secure`-cookie behavior (covered by the deploy smoke), and production (no production-targeted smoke exists; production cutover has its own runbook).

#### On-host alternative

The same suite can run from the staging host using the host's existing `[profile footbag-staging-runtime]` chain configured at `/root/.aws/config`. The host path is operationally heavier (requires SSH plus a Node 22 runtime on the host, which this project does not install by default) and is rarely needed: the workstation path exercises the identical AWS API call paths.

### 18.9 On-call rotation and escalation policy

On-call model: a single maintainer with implicit on-call. The maintainer subscribes to the operator SNS topic for SEV-1 alarms and reviews SEV-2 / SEV-3 alarms during routine maintenance windows.

Severity definitions:

- **SEV-1**: service is unreachable or actively returning errors to users. Examples: origin returning 5xx for sustained periods, CloudFront serving the maintenance page from origin failure, backup gap exceeds RTO, KMS access lost so login or ballot operations fail.
- **SEV-2**: service is degraded but reachable. Examples: elevated 5xx rate, slow response times, partial feature failure (Stripe webhook backlog, SES bounce spike), resource pressure approaching alarm threshold.
- **SEV-3**: warning. Examples: single failed alarm not yet recurring, unexpected cost spike, SES sandbox warning, certificate expiry approaching.

Acknowledgment targets:

- SEV-1: 15 minutes during waking hours; next morning if outside waking hours unless the maintainer is available. Mitigation begins immediately on acknowledgment.
- SEV-2: 1 hour during waking hours; next business day otherwise.
- SEV-3: reviewed during the next monthly routine task per §18.1.

Notification routing:

- SEV-1: SMS via the operator SNS topic (subscribed for SEV-1 only) plus email.
- SEV-2 and SEV-3: email via the operator SNS topic.

When the team grows beyond one maintainer:

- weekly primary plus backup rotation, calendar-tracked
- both primary and backup subscribed to the SEV-1 SNS topic
- escalation: backup paged if primary does not acknowledge within the SEV-1 acknowledgment target
- §18.6 access reviews include a check that the rotation calendar is current and SNS subscriptions match

The severity definitions and acknowledgment targets above are the operational policy; update this section if the project's reality shifts.

### 18.10 Hall of Fame and Big Add Posse honors oversight

Honors-bearing claims (a claim landing on a member who carries a Hall of Fame or Big Add Posse flag) apply on the member's own wizard confirmation, the same as any other claim. Trustworthiness is established a priori: the imported `is_hof` / `is_bap` flags are cross-checked before go-live against the authoritative public rosters (footbaghalloffame.net for Hall of Fame, bigaddposse.com for Big Add Posse), and mismatches are curated out, so an honor-driven tier grant rests only on a validated flag.

After go-live, ongoing oversight is community self-policing plus the admin dispute-revert path: if a wrong honors-bearing link surfaces, route it through the dispute-revert procedure per §18.11.

### 18.11 Claim dispute and revert handling

When a confirmed claim is disputed (a member believes their own confirmation was wrong, or a real person arrives after someone else confirmed a claim under their identity), the dispute routes through the member-initiated help request reviewed under `A_Review_Member_Link_Help_Requests` (MIGRATION_PLAN §13 carries the system-side contract).

Operator workflow:

1. Open the admin work queue and review the dispute item alongside the original claim audit row to understand the chronology and the evidence-strength tag the claim carried.
2. Decide: revert (clear the back-link columns and revoke the claim tier grant; the legacy account or historical person becomes claimable by the correct person), decline (the original claim stands; reason required), or defer.
3. Record the decision per the audit rules in `A_Review_Member_Link_Help_Requests`: audit-logged with actor, original claim audit id, decision, optional reason, timestamp.
4. Notify the disputing member of the outcome by email, with a contact path for follow-up.

### 18.12 Heavyweight pentest harness

The operator-invoked pentest harness runs black-box probes against a throwaway local stack. It boots its own ephemeral database and server, seeds the canonical personas, and writes all reports to a temp directory outside the working tree, so it is safe to run on a workstation.

- Default run: `npm run test:pentest:heavy`. Runs the scriptable probes (security headers, internal-surface gating, upload abuse, origin-pin CSRF, open redirect, login rate-limit, SSRF input, session-cookie attributes) plus a report-only OWASP ZAP passive baseline, then prints a per-probe summary. A non-zero exit means a probe found a regression; triage it into a fix plus a regression test per `docs/TESTING.md` §9.6.
- Opt-in heavy legs pass through npm with `--`: `-- --zap-active` runs the ZAP full active scan (attacks the target, minutes-long), `-- --deps` runs the dependency / supply-chain scan (`npm audit`, plus Snyk when `SNYK_TOKEN` is set), and `-- --all` runs both. These legs are report-only.
- The ZAP legs require Docker; without it they skip with a message and the scriptable probes still run. Point the active scan only at the local stack or an environment explicitly authorized for active scanning, never at production.

---

## 19. Staging Refresh and Anonymization

### 19.1 Goal

Staging should be realistic enough for deployment rehearsal and debugging, but it must not become a raw production clone.

### 19.2 Required workflow

1. Export a production-derived snapshot using the approved operator path.
2. Restore into an isolated staging workspace or temporary copy.
3. Run the anonymization/purge transformation.
4. remove or replace production-only secrets and external integration endpoints
5. import the sanitized dataset into staging
6. verify the anonymization result
7. run smoke tests

### 19.3 Required anonymization checks

Before staging is declared ready, verify:

- no raw production login emails remain where policy requires anonymization
- no production Stripe secrets or webhook secrets remain
- no production SES sending configuration is active in staging
- no production-only admin bootstrap values remain
- no raw sensitive contact fields remain when they should be anonymized
- any test mail or payments route to test systems only

### 19.4 What not to do

- do not point staging at production secrets
- do not allow staging to send real production mail
- do not retain raw production data in staging longer than required
- do not skip post-refresh verification

---

## 20. Test-data Operations

### 20.1 Scope and isolation model

Dev-admin shortcut data is data inserted to enable maintainer admin login on dev or staging. It is distinct from production-derived data, which is the subject of §19. Production must never receive dev-admin shortcut data; six independent guard layers refuse the operation, and one regression test enforces that the credential literal driving dev-admin accounts lives in a single file. (The term "test data" and the `--seed-test-data` flag are reserved for a future class of seed mechanisms covering fixtures, ballots, and similar test artifacts. They are not the subject of this section.)

The pattern lives under `src/dev-bootstrap/`. The admin seed is the only current instance. Future test-data seeds (ballots, event results, photos, fixtures) will share a similar shape but live under a separate subtree and are not part of the dev-shortcuts cutover-removal concern.

The tester-facing persona harness (`src/testkit/`: the canonical persona catalog, `/dev/switch`, `/dev/personas`) is a separate concern from this dev-admin seed and runs on development and staging; its operator and tester runbook lives in `docs/TESTING.md` §16.

### 20.2 Staging admin seed

Staging admin accounts seed directly into the running database via an opt-in `--seed-dev-admins` flag on the standard deploy entry point. The flag is allowlisted to `DEPLOY_TARGET=footbag-staging` only; any other target is hard-refused before the SSH connection.

1. Maintain `.local/staging-admin-seed.json` on the workstation. Gitignored, per-maintainer. Same JSON shape as the dev seed described in `docs/DEV_ONBOARDING.md` §1.14.2. Review the content before each deploy that uses the flag.

2. Run a deploy with the flag:

   ```bash
   ./deploy_to_aws.sh --seed-dev-admins
   ```

   Combinable with the bare/`-k` code-only deploy, `-r` for ship-current-DB, or a rebuild deploy (`--from-csv` / `--soup-to-nuts`). The seed always runs at the same phase: after the web service is up and healthy.

3. The pre-deploy plan summary shows `seed dev admins: yes`. Confirm before approving the deploy.

4. The remote half reports each entry's outcome on stdout: `seeded admin`, `no-op (dev-admin-seed marker present)`, or `CONFLICT (member exists without dev-admin-seed marker; not modifying)`. The deploy succeeds even if the seed step exits non-zero; the service is already up. Re-run after resolving the conflict.

5. Verify on the staging host:

   ```bash
   ssh footbag-staging 'sudo sqlite3 /srv/footbag/db/footbag.db "
     SELECT m.login_email, m.is_admin, mtg.reason_code
     FROM members m
     JOIN member_tier_grants mtg ON mtg.member_id = m.id
     WHERE mtg.reason_code = ''dev_admin_seed.admin_tier2''
     ORDER BY mtg.created_at DESC;
   "'
   ```

6. Log in to the staging URL with the seeded email plus the fixed dev-only password (see `src/dev-bootstrap/seedConfig.ts`).

### 20.3 Transport and argv-leak hardening

Sensitive values must never appear in a process's argv on any host. The deploy pipeline carries the seed content through three boundaries; each boundary uses stdin, not argv.

1. Workstation: `jq -c -e` validates and compacts `.local/staging-admin-seed.json`. The compacted JSON is appended to the SSH cat-pipe alongside the sudo password and `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`. Shell-builtin `printf` does not fork, so the value is not visible to any workstation-side process listing.

2. Staging host bash: receives the value as a shell environment variable (assigned by reading its own stdin). It is NOT written to `/srv/footbag/env`; the value is transient and exists for one deploy only.

3. Container: the staging-host bash pipes the value to `docker compose exec -T` via stdin, and the in-container shell reassigns it from `$(cat)` before invoking the seed binary. Passing the value via `docker compose exec -e VAR=value` is forbidden because the value would land in the exec subprocess's argv, visible to any `ps -ef` reader on the host.

Inside the container, the compiled seed (`node dist/dev-bootstrap/seed.js`) reads the env-var, validates the JSON shape, argon2-hashes the fixed dev-only password, and inserts the seed rows in a single transaction.

### 20.4 Adding a new dev-shortcut mechanism

Future dev-shortcut scripts follow the admin-seed shape. The acceptance bar:

- Lives at `src/dev-bootstrap/<additional-mechanism>.ts`. Compiles via the project `tsc` (no Dockerfile changes; `dist/` already ships).
- Imports `src/dev-bootstrap/seedConfig.ts` for the env-guard and shared marker conventions. Adds its own mechanism-specific exports (env-var name, seed file paths, marker constants).
- Reads from `FOOTBAG_DEV_<MECHANISM>_JSON` if set; otherwise from `.local/dev-<mechanism>.json`. Missing both is fatal (exit 1): silent no-ops mask operator mistakes.
- Writes marker columns under the `dev_admin_*` namespace with `created_by = 'dev-shortcuts/<mechanism>'` and an `audit_entries.action_type = 'grant_admin_dev_<mechanism>'`.
- Is idempotent on the marker; reports conflicts without modifying; exits 0 / 1 / 2 as the admin seed does.
- Adds a `--seed-<mechanism>` action to `scripts/manage-dev-admin-seed.sh` (or shares the `--seed-dev-admins` umbrella, running every dev-shortcut script whose staging file exists).
- Wires deploy transport in `scripts/deploy-code.sh` and `scripts/deploy-rebuild.sh` (cat-pipe of the compact JSON) and staging-side exec in `scripts/internal/deploy-code-remote.sh` and `scripts/internal/deploy-rebuild-remote.sh` (stdin-piped `docker compose exec`).
- Lands with a schema-coupling test under `tests/integration/devAdminSeed.<mechanism>.schemaCoupling.test.ts`. The env-guard contract test in `tests/integration/devAdminSeed.envGuard.test.ts` covers all mechanisms by exercising `seedConfig` once.

### 20.5 Guardrails

Dev-admin shortcut data must not reach production, and seed content must not leak via argv. The following invariants hold for every mechanism:

- **Module-import guard.** `src/dev-bootstrap/seedConfig.ts` throws on import unless `FOOTBAG_ENV ∈ {development, staging}`. Production-mode app processes fail fast at module load.
- **Script env-check.** `scripts/manage-dev-admin-seed.sh` refuses if `NODE_ENV=production` or `FOOTBAG_ENV=production`.
- **Deploy entry-point gate.** `deploy_to_aws.sh` allowlists `--seed-dev-admins` to `DEPLOY_TARGET=footbag-staging` only; any other target is refused before any SSH connection.
- **JSON validation gate.** `--seed-dev-admins` strips JSONC `//` line comments and runs `jq -e .` against the workstation-side seed file; malformed JSON aborts before SSH.
- **Container env source.** The staging remote scripts no longer override `FOOTBAG_ENV` for the seed exec; the container reads the value from its `/srv/footbag/env` file (set per host). `seedConfig.ts` then throws on import when the host says `FOOTBAG_ENV=production`, even if the operator misconfigured the deploy chain.
- **IAM/SSM namespace isolation.** The staging deploy role is bound to `/footbag/staging/*` SSM and cannot reach `/footbag/production/*`.
- **argv-leak hardening.** Seed content travels stdin only at every boundary: workstation→ssh, ssh→bash, bash→docker compose exec→in-container shell. `-e VAR=value` is never used for seed content. The principle is the hard rule in `.claude/rules/script-secret-safety.md` (operator rationale in §20.3) and is enforced by code review.
- **Image-content gate (production only).** Production images are built with `INCLUDE_DEV_SHORTCUTS=0`, set by `scripts/deploy-rebuild.sh` when `FOOTBAG_ENV=production` and reinforced by per-service `build.args.INCLUDE_DEV_SHORTCUTS: 0` in `docker/docker-compose.prod.yml`. The compiled `dist/testkit/` and `dist/dev-bootstrap/` subtrees are absent from the production image; an operator who execs into a production container cannot run the seed even with a misconfigured env.

### 20.6 Password-leak protections

The fixed dev-admin-seed password literal in `src/dev-bootstrap/seedConfig.ts` is hard-coded for dev/staging convenience. Five invariants hold:

- **Single-source containment in code.** Regression test `tests/integration/devAdminSeed.passwordLeak.test.ts` greps source-controlled CODE files (.ts/.js/.sh/.hbs/.json/.yml) and fails if the literal appears in any file other than `src/dev-bootstrap/seedConfig.ts`. Documentation files are excluded from the scan; the discipline of keeping the literal out of docs is governed by doc-sync and human review.
- **No log emission.** Seed scripts emit `loginEmail`, outcome counts, and the env diagnostic only. The password literal is never logged. The argon2 hash is never logged either.
- **No network exposure.** The transport carries the seed JSON (emails, names, optional tier). The password literal does not cross the workstation→staging boundary; hashing happens inside the container at seed time.
- **Production-import refusal.** The module-import guard prevents the literal from being loaded under `FOOTBAG_ENV=production`.
- **Operator-level env guards.** The bash refusal gates at every entry point prevent the seed from being invoked against production-named targets.

Weakening any of these invariants requires removing the corresponding regression-test assertion.

### 20.7 Removal

There is no automated unseed action. Re-rebuild the staging database (`./deploy_to_aws.sh --from-csv`) to clear all seeded rows. To audit leftover rows on either dev or staging, grep the marker columns:

```sql
SELECT COUNT(*) FROM member_tier_grants WHERE created_by LIKE 'dev-shortcuts/%';
SELECT COUNT(*) FROM audit_entries     WHERE action_type LIKE 'grant_admin_dev_%';
SELECT COUNT(*) FROM member_tier_grants WHERE reason_code LIKE 'dev_admin_%';
SELECT COUNT(*) FROM audit_entries     WHERE action_type = 'dev_admin_invariant_repair';
```

All four counts must be zero before any production deploy. `scripts/audit-dev-shortcuts.sh` runs these queries and exits non-zero if any return > 0; suitable as a CI gate at cutover. The `dev_admin_invariant_repair` marker comes from the dev-only `FOOTBAG_DEV_ADMIN_GRANT_TIER2` invariant-repair pass (see `docs/DEV_ONBOARDING.md` §1.14.3). The `dev_admin_register_allowlist.admin_tier2` marker comes from the dev/staging email-allowlist bootstrap (the unified handler in `src/dev-bootstrap/runtime.ts`); production-first-admin uses a different reason_code and is documented in §20.8. The env-config fail-fast guard prevents any of the dev/staging shortcuts from being set in production, so a non-zero count on production indicates an env-gate bypass and warrants investigation.

### 20.8 Production first-admin bootstrap

Production seeds its first administrator through a single-shot SSM-stored claim token, not the dev/staging email allowlist used by §20.2. The two mechanisms are environment-isolated: production deploys refuse to write `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`, the production process refuses to boot if the var is present, and the production overlay carries an explanatory comment documenting the no-op intent.

Design intent and audit-row shape are in DESIGN_DECISIONS §2.9. The operational provisioning runbook (token provision, hand-off, self-delete verification) is §10.12. The route is `/admin/bootstrap-claim`. The SSM parameter path is `/footbag/production/app/bootstrap/admin_token` (SecureString). The token format is a 64-byte hex string generated by `openssl rand -hex 32`. After a successful claim the endpoint deletes the SSM parameter; subsequent attempts return the same response shape whether the token is missing or wrong.

Staging rehearsal (go-live blocker, MIGRATION_PLAN PC8): the full procedure is rehearsed on staging before cutover. `scripts/admin-bootstrap-token.sh --target staging --profile <staging-profile> provision` generates and stores the token (refusing to overwrite a live one) and prints it once; a non-admin staging account submits it at `/admin/bootstrap-claim`; the `status` action must then report the parameter ABSENT (a successful claim self-deletes it). If `status` reports PRESENT after a successful claim, the self-delete failed, the `admin.bootstrap_token_delete_failed` operational alarm fires, and the `cleanup` action kills the token by hand. An optional drill of `provision` followed by `cleanup` exercises the refuse-to-overwrite and manual-kill guards. The same script with `--target production` is the production provisioning step, per §10.12.
