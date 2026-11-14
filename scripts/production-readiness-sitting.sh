#!/usr/bin/env bash
# production-readiness-sitting.sh -- run the production-readiness sitting's
# first pass, the one that needs no DNS, for one environment: every step's own
# script in order, every check only a person can make asked at the terminal, and
# a row in the cutover log for each step as it ends.
#
# WHY THIS EXISTS.
#
# The pass is some fifty steps across a dozen scripts, with human checks between
# them (did the alarm mail arrive, is a member signed in). Run by hand from a
# list, a step is skipped or run out of order under pressure, a check is
# remembered rather than asked, and the record is written afterwards from memory.
# Here the order, the questions and the record are the script's: it stops at the
# first step that does not finish, names every step that did not run, and prints
# the one command that resumes from where it stopped.
#
# HOW A STEP RUNS. Each step's script runs as a child, at this terminal, with its
# closing report collected privately so the step's outcome is read from it and
# its warnings carried into this run's report. Every step is one of:
#   read     a check; run every time, and its exit decides it.
#   idem     an apply whose re-run is its own proof; run every time.
#   once     an act that is not repeated; a log row never skips it.
#   ask      a yes/no question at the terminal; only "yes" passes. One whose
#            proof is a read is not asked when that read already passes.
#   digest   the preserved tables' digests, saved before a migration and
#            compared after it.
#   blocked  work not yet scriptable; it stops the run, so the pass cannot read
#            as done. Blocked steps come last, so nothing runnable waits on them.
#   mailwalk the alarm-mail confirmation walk, at the terminal. Every
#            subscription confirmed is ok; a topic the operator leaves pending
#            (its exit 3) is recorded as deferred and the run carries on, since
#            alarm mail must not block the pass; any other failure stops it.
# A kind ending in "+mail" needs a confirmed alarm-mail subscription (a test
# alarm, a drill or proof that asks whether its email arrived). Each target's
# mailwalk step comes before its first such step; until the environment's
# subscription status reads clean, such a step is recorded as deferred and the
# run carries on, and the closing report lists it as not proven.
#
# THE CREDENTIAL. The host sudo password arrives once, on stdin, from the file
# the environment's alias selects. It goes on stdin to exactly the steps that
# take it, never in argv; every other step reads the terminal on stdin. The
# production deploy reads its own password at the terminal, by its own design.
#
# WHAT IT REFUSES.
#   - A run with no --target, or any target but staging or production.
#   - A real run with a terminal on stdin (the credential file is named), or
#     with no terminal to ask on.
#   - Any AWS identity but the footbag-operator IAM user.
#   - A cutover log that is missing. Each row goes at the end of this pass's
#     own section, so a section added after it is left where it is.
#   - A --from-step or --to-step naming no step of the target's list.
#
# Usage:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/production-readiness-sitting.sh \
#     --target staging [--from-step <id>] [--to-step <id>]
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#     bash scripts/production-readiness-sitting.sh --target production
#   bash scripts/production-readiness-sitting.sh --target <env> --dry-run
#   < <credential file> bash scripts/production-readiness-sitting.sh \
#     --target <env> --status
#
# Flags:
#   --target <staging|production>  Required, no default.
#   --from-step <id>, --to-step <id>  Run only that stretch of the list.
#   --dry-run   List the steps and their commands. Reads nothing, runs nothing,
#               writes nothing, and needs no credential.
#   --status    Run only the proof commands, read the rest from the log, and
#               write nothing. Without a credential on stdin the proofs that
#               need one read UNKNOWN.
#
# Exit: 0 every step done; 1 a step failed or was declined, or a refusal;
# 2 usage error; 3 a blocked step reached, or (--status) anything pending.
#
# Test seams (CI only), each announced on stderr:
#   SITTING_ROOT       the tree holding the child scripts and the cutover log
#   SITTING_NPM_BIN    replaces npm
#   SITTING_AWS_BIN    replaces the aws CLI for the snapshot listing
#   SITTING_POLL_SECS  replaces the minute between not-before checks
set -euo pipefail

TARGET=""
FROM_STEP=""
TO_STEP=""
MODE=run

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --from-step) FROM_STEP="${2:-}"; shift 2 || { echo "ERROR: --from-step requires an argument" >&2; exit 2; } ;;
    --to-step) TO_STEP="${2:-}"; shift 2 || { echo "ERROR: --to-step requires an argument" >&2; exit 2; } ;;
    --dry-run) MODE=dry; shift ;;
    --status) MODE=status; shift ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
require_target "$TARGET" staging production || exit 2

ROOT="${SITTING_ROOT:-$REPO_ROOT}"
NPM_BIN="${SITTING_NPM_BIN:-npm}"
AWS_BIN="${SITTING_AWS_BIN:-aws}"
POLL_SECS="${SITTING_POLL_SECS:-60}"
for seam in SITTING_ROOT SITTING_NPM_BIN SITTING_AWS_BIN SITTING_POLL_SECS; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done
LOG="${ROOT}/footbag_private_repo/cutover/CUTOVER_LOG.md"
SECTION='## 9. Production-readiness sitting'

# ── The steps ────────────────────────────────────────────────────────────────
# id | kind | stdin | proof | command, question or reason | fallback
#
# stdin: cred (the password on line 1) or tty. proof:
#   -                       nothing beyond the step's own exit
#   log                     the log row is the record
#   rerun                   the idempotent re-run is the proof
#   <stdin>:<codes>=<cmd>   a read, run after the step, whose exit is one of
#                           <codes> confirms it
#   fact=<name>             the step's report must carry this fact
#   stdout=<ERE>            the step's output must match
#   save, match             (digest) save the digests, or compare with the saved
#   after=<id>+<minutes>    (read) not before <id> finished plus the minutes
# Placeholders, each checked against a strict pattern before use:
#   {SNAPSHOT}, {SNAPSHOT>id}  the newest routine backup key (newer than <id>)
#   {SINCE<id>}                the UTC time step <id> started
#   {MIGRATION}                a probe migration made fresh for this run
#   {PROBE_CLEANUP<id>}        a migration removing step <id>'s probe table
# fallback: offered, when the step fails, as one more command to finish it.

STAGING_STEPS=(
  's01a|read|tty|-|scripts/apply-account-baseline.sh --enable-guardduty --dry-run'
  's01b|idem|tty|rerun|scripts/apply-account-baseline.sh --enable-guardduty'
  's01c|idem|tty|rerun|scripts/terraform-apply-all.sh --target staging'
  's02|idem|cred|cred:0=scripts/bootstrap-host.sh --target staging --status|scripts/bootstrap-host.sh --target staging'
  's03|mailwalk|tty|log|scripts/confirm-alarm-subscription.sh --target staging'
  's04a|once+mail|tty|log|scripts/send-test-alarm.sh --target staging --region us-west-2 --alarm footbag-staging-media-replication-backlog'
  's04b|ask+mail|-|log|Alarm mail check. s04a raised footbag-staging-media-replication-backlog (us-west-2) to ALARM and back to OK. The operations mailbox should now hold two emails from AWS Notifications, one with a subject starting ALARM: "footbag-staging-media-replication-backlog" and then one starting OK: with the same name (in Gmail, search from:no-reply@sns.amazonaws.com in:anywhere newer_than:1d and look for that subject; Gmail can file it inside an older conversation with the same subject). s04c and s04d then read that the alarm is back to OK and that the admin alarms page lists nothing active. Did both emails arrive?'
  's04c|read+mail|tty|-|scripts/send-test-alarm.sh --target staging --region us-west-2 --status --expect OK --wait-minutes 10 --alarm footbag-staging-media-replication-backlog'
  's04d|read+mail|tty|-|scripts/host-diagnostics.sh --target staging active-alarms'
  's05a|ask|-|log|Durability check (1 of 2). In a browser signed in as a staging admin, change one small thing now (for example, add a word to a gallery'"'"'s description under /admin/curator/galleries) and note what you changed. Next, the tables are snapshotted, a throwaway migration is deployed, and you are asked whether your change survived. Made the change?'
  's05b|digest|tty|save|scripts/host-diagnostics.sh --target staging table-digests'
  's05c|once|cred|fact=migration-applied|scripts/deploy-migrate.sh --target staging --migration {MIGRATION}'
  's05d|ask|-|log|Durability check (2 of 2). Reload the page where you made the change at s05a. Is your change still there? A no means the throwaway migration lost data.'
  's05e|digest|tty|match|scripts/host-diagnostics.sh --target staging table-digests'
  's06|once|cred|log|scripts/restore-db.sh --target staging --snapshot {SNAPSHOT}|scripts/restore-db.sh --target staging --resume-erasure-replay'
  's07a|ask|-|log|Session check (1 of 2). In a browser, sign in to staging as a member now and leave that tab open. The next steps rotate the signing key and the session secret and redeploy, which should sign you out. Signed in?'
  's07b|once|cred|log|scripts/rotate-jwt-signing-key.sh --target staging'
  's07c|once|tty|log|scripts/provision-ssm-secret.sh --target staging --secret session_secret store'
  's07d|once|cred|log|scripts/deploy-migrate.sh --target staging --migration {PROBE_CLEANUP<s05c}'
  's07e|ask|-|log|Session check (2 of 2). Reload the tab where you signed in at s07a. You should now be signed out; sign in again with your password. Were you signed out, and did signing in again work? Answer yes only if both are true.'
  's08a|read|tty|-|scripts/arming.sh --target staging --status'
  's08b|idem|tty|rerun|scripts/arming.sh --target staging --state dark'
  's08c|read|tty|-|scripts/arming.sh --target staging --status'
  's08d|idem|tty|rerun|scripts/arming.sh --target staging --state armed'
  's08e|read|tty|-|scripts/arming.sh --target staging --status'
  's09e|idem|tty|rerun|scripts/admin-bootstrap-token.sh --target staging cleanup'
  's09f|read|tty|stdout=^ABSENT:|scripts/admin-bootstrap-token.sh --target staging status'
  's10a|once+mail|cred|log|scripts/incident-drill.sh --target staging'
  's98|ask+mail|-|log|Second-operator check. The next step, s99, runs the staging incident drill again and records whoever runs it as the second operator; the second operator runs it from their own workstation, with their own credential, in their remote session. Is the second operator the one at this keyboard now, on their own workstation? If not, answer no: this run stops here.'
  's99|once+mail|cred|log|scripts/incident-drill.sh --target staging'
)

PRODUCTION_STEPS=(
  'p01a|read|tty|-|scripts/verify-production-release.sh'
  'p01b|read|tty|-|npm run test:smoke -- --target production captcha'
  'p02a|read|tty|-|scripts/check-versions.sh'
  'p02b|idem|cred|cred:0=scripts/bootstrap-host.sh --target production --status|scripts/bootstrap-host.sh --target production'
  'p02c|idem|cred|rerun|scripts/step-amazon-linux.sh --target production'
  'p03|idem|tty|rerun|scripts/terraform-apply-all.sh --target production'
  'p04a|once|tty|log|deploy_to_aws.sh --target production --all-data -W'
  'p04b|read|tty|-|npm run test:deployed -- --target production'
  'p05a|read|cred|-|scripts/step-amazon-linux.sh --target production --status'
  'p05b|read|cred|-|scripts/check-vulnerabilities.sh --target production'
  'p05c|once|cred|log|scripts/restart-host.sh --target production'
  'p05d|read|cred|-|scripts/harden-sshd.sh --target production'
  'p06a|read|cred|-|scripts/verify-host-env.sh --target production'
  'p06b|read|tty|-|scripts/verify-cwagent-metrics.sh --target production --profile footbag-operator'
  'p06c|read|tty|-|scripts/verify-cwagent-metrics.sh --target production --profile footbag-operator --containers'
  'p06d|read|tty|-|scripts/verify-host-snapshots.sh --target production'
  'p07a|ask|-|log|Open PRODUCTION_READINESS_RUNBOOK.md in the private checkout (footbag_private_repo/) and read its opening and its section 1, Reads: what this pass changes on production, what to have ready, and what to look for in each read. p07h to p07n run those reads later in this pass. Read it?'
  'p07b|read|tty|-|scripts/arming.sh --target production --status --profile footbag-operator'
  'p07c|read|tty|-|scripts/production-live-marker.sh --status --profile footbag-operator'
  'p07d|read|tty|-|scripts/production-live-marker.sh --set live --dry-run --profile footbag-operator'
  'p07e|read|cred|-|scripts/bringup-status.sh --target production --profile footbag-operator'
  'p07f|read|tty|-|scripts/create-stripe-endpoint.sh --target production --mode live --verify'
  'p07g|read|tty|-|scripts/verify-replication.sh --target production'
  'p08a|read|cred|-|scripts/restore-db.sh --target production --drill'
  'p08b|read|cred|-|scripts/restore-db.sh --target production --drill --bucket footbag-production-db-snapshots-dr'
  'p08c|read|cred|-|scripts/pre-cutover-checklist.sh --target production --no-snapshot --skip-tests --skip-dns-ttl'
  'p07h|read|tty|-|scripts/apply-snapshot-retention.sh --target production --verify --profile footbag-operator'
  'p07i|read|tty|-|scripts/apply-bucket-tls-baseline.sh --verify-only --profile footbag-operator'
  'p07j|read|cred|-|scripts/diagnose-cwagent.sh --target production'
  'p07k|read|tty|-|scripts/provision-ssm-secret.sh --target production --secret session_secret status --profile footbag-operator'
  'p07l|read|tty|-|scripts/verify-cutover-notice.sh --function --expect-live --profile footbag-operator'
  'p07m|read|cred|-|scripts/activate-notification-feeds.sh --target production --status --profile footbag-operator'
  'p07n|read|cred|-|scripts/payments-pause.sh --target production --status'
  'p07o|read|tty|-|scripts/verify-dev-tester-role-denials.sh --profile footbag-operator'
  'p08d|once|cred|log|scripts/verify-prod-email.sh --profile footbag-production-runtime --read-profile footbag-operator --outbox --inbox-from-tty'
  'p08d1|ask|-|log|Outbox mail check. p08d sent one message through the production outbox to the inbox you typed. Open that inbox. Did the message arrive, and does its original source (in Gmail: the three-dot menu, Show original) show DKIM: PASS? Answer yes only if both are true.'
  'p08e|once|tty|log|scripts/verify-prod-email.sh --profile footbag-production-runtime --read-profile footbag-operator --bounce-probe'
  'p08f|read|tty|after=p08e+5|scripts/host-diagnostics.sh --target production ses-bounces --since {SINCE<p08e}'
  'p09|once|cred|log|scripts/restore-db.sh --target production --snapshot {SNAPSHOT>p04a}|scripts/restore-db.sh --target production --resume-erasure-replay'
  'p10a|ask|-|log|First admin. In a browser on the production cloudfront.net address, register the person who will be the first admin at /register as an ordinary member, verify their email, and finish the sign-up wizard: the claim page sends anyone mid-wizard back to it. Next, p10b mints a one-time admin claim token and prints it here; paste it at /admin/bootstrap-claim rather than typing it, since five wrong tries lock the claim for an hour. Is that account registered, verified and through the wizard?'
  'p10b|once|tty|log|scripts/admin-bootstrap-token.sh --target production --profile footbag-operator provision'
  'p10c|read|tty|stdout=^ABSENT:|scripts/admin-bootstrap-token.sh --target production --profile footbag-operator status --wait-minutes 30'
  'p10d|read|cred|stdout=6\. First admin +DONE|scripts/bringup-status.sh --target production --profile footbag-operator'
  'p10f|mailwalk|tty|log|scripts/confirm-alarm-subscription.sh --target production'
  'p10g|ask+mail|-|log|Break-glass operator check. The next two steps, p11a and p11b, run the staging break-glass drill and record whoever runs it as the second operator; Julie runs them from her own workstation in her remote session. Is Julie the one at this keyboard now? If not, answer no: this run stops here, and you resume with --from-step p12a.'
  'p11a|once+mail|tty|log|scripts/host-break-glass.sh --drill --target staging'
  'p11b|read+mail|tty|-|scripts/list-host-access-mints.sh --since {SINCE<p11a}'
  'p12a|ask|-|log|Session check (1 of 2). In a browser, sign in to production as a member now and leave that tab open. The next steps rotate the signing key and the session secret and redeploy, which should sign you out. Signed in?'
  'p12b|once|cred|log|scripts/rotate-jwt-signing-key.sh --target production'
  'p12c|once|tty|log|scripts/provision-ssm-secret.sh --target production --secret session_secret store'
  'p12d|once|tty|log|deploy_to_aws.sh --target production'
  'p12e|ask|-|log|Session check (2 of 2). Reload the tab where you signed in at p12a. You should now be signed out; sign in again with your password. Were you signed out, and did signing in again work? Answer yes only if both are true.'
  'p13c|once+mail|tty|log|scripts/send-test-alarm.sh --target production --region us-west-2 --alarm footbag-production-snapshots-hourly-replication-stopped'
  'p13d|idem|tty|rerun|scripts/set-terraform-gate.sh --target production --gate enable_container_alarms --state on'
  'p13e|once+mail|tty|log|scripts/send-test-alarm.sh --target production --alarm-prefix footbag-production-container- --alarm-prefix footbag-production-cf-function- --alarm footbag-production-high-cpu --alarm footbag-production-high-memory --alarm footbag-production-rate-limit-refusals --alarm footbag-production-site-unavailable'
  'p13f|ask+mail|-|log|Alarm mail check. p13c raised footbag-production-snapshots-hourly-replication-stopped (us-west-2), and p13e raised the container, CloudFront function, high CPU, high memory, rate-limit refusals and site-unavailable alarms (us-east-1), each to ALARM and back to OK. For each one the operations mailbox should hold two emails from AWS Notifications, subjects starting ALARM: and then OK: followed by the alarm name (in Gmail, search from:no-reply@sns.amazonaws.com in:anywhere newer_than:1d; Gmail can file a message inside an older conversation with the same subject). p13f1 to p13f3 then read that every alarm is back to OK and that the admin alarms page lists nothing active. Did every pair arrive?'
  'p13f1|read+mail|tty|-|scripts/send-test-alarm.sh --target production --region us-west-2 --status --expect OK --wait-minutes 10 --alarm footbag-production-snapshots-hourly-replication-stopped'
  'p13f2|read+mail|tty|-|scripts/send-test-alarm.sh --target production --status --expect OK --wait-minutes 10 --alarm-prefix footbag-production-container- --alarm-prefix footbag-production-cf-function- --alarm footbag-production-high-cpu --alarm footbag-production-high-memory --alarm footbag-production-rate-limit-refusals --alarm footbag-production-site-unavailable'
  'p13f3|read+mail|tty|-|scripts/host-diagnostics.sh --target production active-alarms'
  'p13g|idem|tty|rerun|scripts/set-terraform-gate.sh --target production --gate enable_host_key_alarm --state on'
  'p13h|idem|tty|rerun|scripts/set-terraform-gate.sh --target production --gate enable_jobs_heartbeat_alarm --state on'
  'p13i|read|tty|-|scripts/send-test-alarm.sh --target production --status --expect OK --wait-minutes 20 --alarm footbag-production-jobs-missed-run --alarm footbag-production-captcha-unavailable'
  'p13j|idem|tty|rerun|scripts/apply-account-baseline.sh --enable-guardduty'
  'p13k|once+mail|tty|log|scripts/prove-audit-alarms.sh'
  'p13l|once|tty|log|scripts/rehearse-planned-maintenance.sh --target production'
  'p13m|idem|tty|rerun|scripts/set-terraform-gate.sh --target production --gate enable_cutover_login_alarm --state on'
  'p13n|read|tty|-|scripts/send-test-alarm.sh --target production --status --expect ALARM --wait-minutes 180 --alarm footbag-production-cutover-zero-logins'
  'p13o|idem|tty|rerun|scripts/set-terraform-gate.sh --target production --gate enable_cutover_login_alarm --state off'
  'p13p|ask|-|log|Login count check (1 of 2). Sign out of production, then sign in again at /login with your own password: only the /login form counts as a sign-in, so the session the email-verification link opened does not. The next step reads that CloudWatch counted the sign-in, which proves the login filter the zero-logins alarm rests on matches a real sign-in. Signed in?'
  'p13q|read|tty|-|scripts/send-test-alarm.sh --target production --status --metric LoginSuccessCount --wait-minutes 10'
  'p14a|once+mail|tty|log|scripts/host-break-glass.sh --drill --target production'
  'p14b|read+mail|tty|-|scripts/list-host-access-mints.sh --since {SINCE<p14a}'
  'p14c|idem|tty|rerun|scripts/production-cutover.sh --target staging --stage archive-base'
  'p15a|idem|tty|rerun|scripts/production-cutover.sh --target production --stage archive-base'
  'p17a|ask|-|tty:0=legacy_data/legacy_mirror/verify_mirror.sh|The archive capture does not verify. Fix it before the publish: move the old capture aside, run bash legacy_data/legacy_mirror/create_mirror.sh -fresh, then the same with --video-backfill once its queue drains. Has that finished? p17b verifies it next.'
  'p17b|read|tty|-|legacy_data/legacy_mirror/verify_mirror.sh'
  'p15b|read|tty|-|scripts/publish-archive.sh --target production --dry-run'
  'p15c|once|tty|log|scripts/publish-archive.sh --target production'
  'p16a|idem|tty|rerun|scripts/set-terraform-gate.sh --target production --gate enable_legacy_mirror_backup --state on'
  'p16b|read|tty|-|scripts/backup-legacy-mirror.sh --target production --dry-run'
  'p16c|once|tty|log|scripts/backup-legacy-mirror.sh --target production'
  'p15d|read|tty|after=p15c+60|scripts/verify-archive-edge.sh --target production --profile footbag-operator --check-logs'
  'p18a|ask|-|log|Is the Safe Browsing key created in the Google Cloud console (APIs and Services, Credentials: a key restricted to the Safe Browsing API) and stored in the vault entry google-safe-browsing? Next, p18b asks you to paste it (input hidden) and stores it for staging and production.'
  'p18b|once|tty|log|scripts/provision-url-screening-key.sh --target both store'
  'p18c|read|tty|-|scripts/provision-url-screening-key.sh --target both status'
  'p18d|read|tty|-|npm run verify:seed-urls -- --galleries-only --safe-browsing-key-from production'
  'p18e|ask|-|log|Have you reviewed the gallery link verdicts p18d wrote to curated/galleries/url_verdicts.json, and dealt with every link it flagged? This run does not commit that file; the maintainer does.'
  'p19a|ask|-|log|Stripe live settings. In the Stripe Dashboard with Test mode off, are steps 1 to 7a of the live dashboard configuration card in the maintainers'"'"' private tracker done? Next, p19b checks the live webhook endpoint and asks for the live secret key, from the credential vault'"'"'s Stripe entry (input hidden).'
  'p19b|read|tty|-|scripts/create-stripe-endpoint.sh --target production --mode live --verify|scripts/create-stripe-endpoint.sh --target production --mode live --verify --repair'
  'p21a|read|tty|-|scripts/create-stripe-endpoint.sh --target production --mode test --verify|scripts/create-stripe-endpoint.sh --target production --mode test --verify --repair'
  'p21b|read|tty|-|scripts/verify-production-release.sh'
  'p21c|once|tty|log|deploy_to_aws.sh --target production'
  'p21c1|ask|-|log|Before the test key goes in. Did the bring-up status at p07e read the Stripe key as live (sk_live_)? If it did, answer no, run CRED bash scripts/activate-payments.sh --target production --profile footbag-operator --deactivate with payments dark, and resume with --from-step p21c1. Is the key a placeholder or a test key?'
  'p21d|once|cred|log|scripts/activate-payments.sh --target production --profile footbag-operator'
  'p21e|once|tty|log|scripts/arming.sh --target production --switch payments --state armed --profile footbag-operator'
  'p21f|ask|-|log|Stripe test mode, one-time payments. Signed in as a member on the production cloudfront.net address, pay with the test cards: 4242 4242 4242 4242 for a success, a declined card, the authentication-required card, and a decline then a second card inside one checkout. Then confirm on the admin payment pages and in the Stripe Dashboard: a membership purchase grants the tier; a decline or a cancel grants nothing; a resent event grants nothing twice; the decline then retry ends succeeded with the attempt in the transition ledger; checkout offers cards only; reaching the cancel page expires the session within seconds; a member who cancelled can choose another tier; a donation with a note shows a Stripe line item reading exactly Donation with no member text, and the acknowledgement shows the note; a maximum-length note is accepted. All of that as described?'
  'p21g|ask|-|log|Stripe test mode, recurring signup. As a member, start a recurring donation with a note. Is the subscription row active, carrying the Stripe subscription id and the member customer id, with the note as the comment on the Stripe subscription? That member now holds a Stripe customer, so the renewal steps next use a different member.'
  'p21h|read|cred|-|scripts/link-stripe-test-clock.sh --target production --member-from-tty'
  'p21i|once|cred|log|scripts/link-stripe-test-clock.sh --target production --member-from-tty --apply --record-dir footbag_private_repo/cutover'
  'p21j|ask|-|log|Stripe test mode, renewal. Sign in as the member p21i linked and start a recurring donation with a note, then in the Stripe Dashboard (Billing, Test clocks) advance the clock p21i printed by a year. Did the signup book one payment row and the renewal a second, in the invoice currency; does the renewal row record the payment intent that settled it; did the subscription event watermark advance; was a redelivered failure for the same cycle refused as stale; and is the note still the comment on the subscription after the renewal?'
  'p21k|ask|-|log|Stripe test mode, dunning. In the Dashboard, give that customer the card 4000 0000 0000 0341 and advance the clock through the retry schedule. Did the subscription go past due on the first failure, did the member see the failed charge on their own dashboard, did the subscription reach canceled when Stripe gave up with the dashboard item clearing, and is a charge settling afterwards still booked?'
  'p21l|ask|-|log|Stripe test mode, cancellation. Cancel a recurring donation from the platform at period end, and mark a test donor deceased as an administrator. Did each set the cancellation flag at Stripe while the local row moved only on the deletion event, the deceased one attributed to the administrator with no renewal receipt? Then in the Dashboard set and clear the cancellation flag and pause collection on another: did the member page and the work queue follow each change?'
  'p21m|ask|-|log|Stripe test mode, refunds. From the Dashboard, refund one payment in part and another in full. Was the partial never recorded as full, did it raise exactly one review item, did a redelivery add no second item or audit row, does the full refund read refunded, and is a refund of a renewal charge attributed to the renewal row? Note the captured charge.refunded events for the golden-payload capture.'
  'p21n|ask|-|log|Stripe test mode, dispute. Pay with the dispute test card 4000 0000 0000 0259, then close the dispute in the Dashboard. Did each stage raise an audit entry and a work-queue item with the Stripe ids and amounts, does the payment still read succeeded, and does its detail page show the dispute?'
  'p21o|ask|-|log|Stripe test mode, signing-secret rotation (1 of 3). In the Dashboard, roll the test endpoint signing secret, leaving the old secret valid for an overlap. Next, p21p installs the new secret; paste it at its prompt. Rolled?'
  'p21p|once|cred|log|scripts/activate-payments.sh --target production --profile footbag-operator --rotate-webhook-secret'
  'p21q|ask|-|log|Signing-secret rotation (2 of 3). Make a test payment, and resend an event signed with the old secret from the Dashboard. Did deliveries signed with either secret verify, with no delivery dropped?'
  'p21r|once|cred|log|scripts/activate-payments.sh --target production --profile footbag-operator --complete-webhook-rotation'
  'p21s|ask|-|log|Signing-secret rotation (3 of 3) and the key. Resend an event signed with the old secret: was it refused? Then roll the test secret key in the Dashboard, so the key the platform holds is revoked, and start a checkout: did the payment call fail? Next, p21t installs the fresh key; paste it at its prompt.'
  'p21t|once|cred|log|scripts/activate-payments.sh --target production --profile footbag-operator --replace-key'
  'p21u|ask|-|log|Key rotation. Ignore the deploy p21t suggests: the platform reloads a test key from Parameter Store within a minute. Wait a minute without restarting or deploying anything, then start a checkout again. Did it reach Stripe with the fresh key?'
  'p21v|once|cred|log|scripts/payments-pause.sh --target production --pause --reason stripe-test-mode-kill-switch-drill'
  'p21w|ask|-|log|Kill switch. With payments paused, are a new donation and a new purchase refused, does a webhook for a payment already in flight still settle, and does the admin payments-health page show the pause?'
  'p21x|once|cred|log|scripts/payments-pause.sh --target production --resume --reason stripe-test-mode-kill-switch-drill-ended'
  'p21y|read|tty|-|scripts/capture-stripe-golden-payloads.sh --target production --list --since {SINCE<p21f}'
  'p21z|ask|-|log|Golden payloads. From the listing p21y printed, write footbag_private_repo/cutover/stripe-golden-manifest.txt with one line per event to keep, in the order its flow replays: event id, what it shows, processed or duplicate or ignored, and its sequence group, separated by the bar character. Keep each flow whole, renewal invoices first, and include a renewal invoice.payment_succeeded, customer.subscription.created, invoice.payment_failed, charge.refunded partial and full, and a one-time payment_intent.succeeded. Written?'
  'p22a|once|tty|log|scripts/capture-stripe-golden-payloads.sh --target production --manifest footbag_private_repo/cutover/stripe-golden-manifest.txt --out tests/fixtures/stripeGoldenPayloads.json'
  'p22b|ask|-|log|Reconciliation. It runs nightly. Once a nightly pass has run since these flows, open /admin/payments/reconciliation: did it raise no issue for them, the invoice, pending-intent, stale-pending and refund passes included? If no pass has run yet, answer no and resume tomorrow with --from-step p22b.'
  'p22c|ask|-|log|Close the test-mode stage (1 of 2). Have the refunds and cancellations above moved their local rows, and is the test endpoint now disabled in the Stripe Dashboard? Next, p22d disarms payments and asks you to type APPLY to confirm the endpoint is disabled.'
  'p22d|once|tty|log|scripts/arming.sh --target production --switch payments --state dark --profile footbag-operator'
  'p22e|once|cred|log|scripts/activate-payments.sh --target production --profile footbag-operator --deactivate'
  'p22f|read|cred|-|scripts/bringup-status.sh --target production --profile footbag-operator'
  'p20a|read|tty|-|scripts/verify-account-baseline.sh --profile footbag-operator'
  'p20b|read|tty|-|scripts/terraform-apply-all.sh --target production --check'
  'p90|blocked|-|-|The host rebuild drills: the backup and restore change they follow is not yet built and deployed'
  'p91|blocked|-|-|The migration case matrix on production: deploy-migrate.sh has no one-off production mode yet'
  'p92|blocked|-|-|The video-curation walk on production: it follows the curation walk on staging'
  'p93|blocked|-|-|The Stripe test-mode exercise of paid event registration: the event organizer and registration flow is not built'
  'p94|blocked|-|-|Forcing the 5xx alarm, proving the backup-age alarm, and the checkpoint-blocked alarm read: each needs its own script or alarm first'
  'p95|blocked|-|-|The pre-live probes (spoofed forwarding header, image strip, Turnstile hostnames, error-line alarm, a known-bad URL refused): verify-prelive-probes.sh is not built'
  'p96|blocked|-|-|The second-operator proof: their allow-listed address and key, their Workspace administrator recovery, and their drill walk'
  'p97|blocked|-|-|The deferred Amazon Linux patch halves, each once its staging half is proved'
)

if [[ "$TARGET" == staging ]]; then
  STEPS=("${STAGING_STEPS[@]}")
else
  STEPS=("${PRODUCTION_STEPS[@]}")
fi

# One record into the step fields.
S_ID=""; S_KIND=""; S_STDIN=""; S_PROOF=""; S_CMD=""; S_FALLBACK=""; S_MAIL=0
parse_step() {
  IFS='|' read -r S_ID S_KIND S_STDIN S_PROOF S_CMD S_FALLBACK <<<"$1"
  S_MAIL=0
  if [[ "$S_KIND" == *+mail ]]; then S_KIND="${S_KIND%+mail}"; S_MAIL=1; fi
}

index_of() {
  local i
  for i in "${!STEPS[@]}"; do
    parse_step "${STEPS[$i]}"
    [[ "$S_ID" == "$1" ]] && { printf '%s' "$i"; return 0; }
  done
  return 1
}

FIRST=0
LAST=$(( ${#STEPS[@]} - 1 ))
if [[ -n "$FROM_STEP" ]]; then
  FIRST="$(index_of "$FROM_STEP")" || { echo "ERROR: --from-step '${FROM_STEP}' is no step of the ${TARGET} list." >&2; exit 2; }
fi
if [[ -n "$TO_STEP" ]]; then
  LAST="$(index_of "$TO_STEP")" || { echo "ERROR: --to-step '${TO_STEP}' is no step of the ${TARGET} list." >&2; exit 2; }
fi
(( FIRST <= LAST )) || { echo "ERROR: --from-step comes after --to-step." >&2; exit 2; }

# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

# ── Dry run: list, touch nothing ─────────────────────────────────────────────
if [[ "$MODE" == dry ]]; then
  echo "The ${TARGET} pass, in order (nothing is run, read or written):"
  for (( i = FIRST; i <= LAST; i++ )); do
    parse_step "${STEPS[$i]}"
    kind="$S_KIND"; (( S_MAIL )) && kind+="+mail"
    case "$S_KIND" in
      ask|blocked) printf '  %-5s %-9s %s\n' "$S_ID" "$kind" "$S_CMD" ;;
      *) printf '  %-5s %-9s %s%s\n' "$S_ID" "$kind" "$([[ "$S_STDIN" == cred ]] && echo '[password on stdin] ' || true)" "$S_CMD" ;;
    esac
  done
  cr_unproved "every step (a dry run runs nothing)"
  cr_finish
fi

# ── Preflight ────────────────────────────────────────────────────────────────
# shellcheck source=lib/terminal.sh
source "${REPO_ROOT}/scripts/lib/terminal.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${REPO_ROOT}/scripts/lib/aws-identity.sh"

SITTING_VERDICT=""
sitting_verdict() { if [[ -n "$SITTING_VERDICT" ]]; then printf '%s' "$SITTING_VERDICT"; else printf '%s' "$3"; fi; }
cr_verdict_with sitting_verdict

terminal_present || cr_die "no terminal to ask on: run this from an interactive shell"

HAVE_CRED=0
SUDO_PASS=""
if [[ "$MODE" == run ]]; then
  require_operator_stdin "scripts/production-readiness-sitting.sh --target ${TARGET}" "footbag-${TARGET}" "$TARGET" || exit 1
  HAVE_CRED=1
elif [[ ! -t 0 ]]; then
  IFS= read -r SUDO_PASS || SUDO_PASS=""
  [[ -n "$SUDO_PASS" ]] && HAVE_CRED=1
fi
exec 0</dev/null

aws_profile_ensure || cr_die "no AWS identity could be settled; nothing was run"
aws_identity_require_direct_user footbag-operator || cr_die "this pass runs only as the footbag-operator IAM user"

[[ -f "$LOG" ]] || cr_die "no cutover log at ${LOG}: the private operations checkout is missing"

SCRATCH="$(mktemp -d)"
cr_cleanup rm -rf -- "$SCRATCH"

# ── The log ──────────────────────────────────────────────────────────────────
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# A cell: no control characters, no table break, at most 200 characters.
cell() {
  local s
  s="$(printf '%s' "$1" | tr -d '\000-\037\177')"
  s="${s:0:200}"
  printf '%s' "${s//|/\\|}"
}

ensure_section() {
  grep -qxF -- "$SECTION" "$LOG" && return 0
  printf '\n%s\n\nOne row per step, written by the sitting script as each step ends.\n\n%s\n%s\n' \
    "$SECTION" \
    '| Started (UTC) | Finished (UTC) | Target | Step | Command | Result | Notes |' \
    '|---|---|---|---|---|---|---|' >> "$LOG"
}

declare -A STARTED=() FINISHED=()

log_row() {
  local id="$1" started="$2" command="$3" result="$4" notes="${5:-}" finished row
  finished="$(now_utc)"
  FINISHED["$id"]="$finished"
  row="| ${started} | ${finished} | ${TARGET} | ${id} | $(cell "$command") | ${result} | $(cell "$notes") |"
  echo "LOG: ${row}"
  # The row goes at the end of this pass's section, after its last table row,
  # so a section added after it (a later pass's records) stays where it is.
  # Written through the symlink with cat, never moved, so the link into the
  # private checkout survives.
  local at tmp
  at="$(awk -v sec="$SECTION" '
    $0 == sec { on = 1; at = NR; next }
    on && /^## / { on = 0 }
    on && /^\|/ { at = NR }
    END { print at + 0 }' "$LOG")"
  if (( at == 0 )); then
    printf '%s\n' "$row" >> "$LOG"
    return 0
  fi
  tmp="$(mktemp "${SCRATCH}/log.XXXXXX")"
  ROW="$row" awk -v at="$at" '{ print } NR == at { print ENVIRON["ROW"] }' "$LOG" > "$tmp"
  cat "$tmp" > "$LOG"
  rm -f -- "$tmp"
}

# The last row of this pass's section for a step: started, finished, result, command.
log_last() {
  local id="$1"
  awk -v sec="$SECTION" '$0 == sec { on = 1; next } /^## / { on = 0 } on' "$LOG" \
    | sed 's/\\|/\x01/g' \
    | awk -F'|' -v t="$TARGET" -v id="$1" '{ for (i = 1; i <= NF; i++) gsub(/^ +| +$/, "", $i) }
        $4 == t && $5 == id { line = $2 "\t" $3 "\t" $7 "\t" $6 } END { if (line != "") print line }'
}

# The UTC time a step started or finished, from this run or the log.
step_time() {
  local which="$1" id="$2" row
  if [[ "$which" == started && -n "${STARTED[$id]:-}" ]]; then printf '%s' "${STARTED[$id]}"; return 0; fi
  if [[ "$which" == finished && -n "${FINISHED[$id]:-}" ]]; then printf '%s' "${FINISHED[$id]}"; return 0; fi
  row="$(log_last "$id")"
  [[ -n "$row" && "$(cut -f3 <<<"$row")" == ok* ]] || return 1
  if [[ "$which" == started ]]; then cut -f1 <<<"$row"; else cut -f2 <<<"$row"; fi
}

# ── Placeholders ─────────────────────────────────────────────────────────────
MIGRATION_FILE=""
resolve_word() {
  local word="$1" ref key when epoch_after line
  case "$word" in
    '{MIGRATION}')
      if [[ -z "$MIGRATION_FILE" ]]; then
        local stamp; stamp="$(date -u +%Y%m%d%H%M%S)"
        MIGRATION_FILE="${SCRATCH}/sitting_durability_${stamp}.sql"
        # A real migration the host records, which leaves the schema as it
        # found it: a probe table left behind would make every later code-only
        # deploy see the deployed schema differ from schema.sql and refuse.
        printf 'CREATE TABLE sitting_durability_%s (id INTEGER PRIMARY KEY);\nDROP TABLE sitting_durability_%s;\n' "$stamp" "$stamp" > "$MIGRATION_FILE"
      fi
      printf '%s' "$MIGRATION_FILE" ;;
    '{PROBE_CLEANUP<'*'}')
      # Removes the probe table step <ref> created. The probe drops its own
      # table, so this is normally a no-op the host still records; it is what
      # clears a table a probe left behind, which a restore of a backup taken
      # after the probe also brings back.
      ref="${word#'{PROBE_CLEANUP<'}"; ref="${ref%'}'}"
      local stamp=""
      if [[ -n "$MIGRATION_FILE" ]]; then
        stamp="${MIGRATION_FILE##*sitting_durability_}"
      else
        line="$(log_last "$ref")"
        [[ -n "$line" && "$(cut -f3 <<<"$line")" == ok* ]] || { echo "step ${ref} has no ok row, so there is no probe table to remove" >&2; return 1; }
        stamp="$(cut -f4 <<<"$line")"; stamp="${stamp##*sitting_durability_}"
      fi
      stamp="${stamp%.sql}"
      [[ "$stamp" =~ ^[0-9]{14}$ ]] || { echo "step ${ref}'s probe migration name gives no timestamp ('${stamp}')" >&2; return 1; }
      key="${SCRATCH}/sitting_durability_cleanup_${stamp}.sql"
      printf 'DROP TABLE IF EXISTS sitting_durability_%s;\n' "$stamp" > "$key"
      printf '%s' "$key" ;;
    '{SINCE<'*'}')
      ref="${word#'{SINCE<'}"; ref="${ref%'}'}"
      when="$(step_time started "$ref")" || { echo "no start time recorded for step ${ref}" >&2; return 1; }
      [[ "$when" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || { echo "step ${ref}'s start time '${when}' is not a UTC time" >&2; return 1; }
      printf '%s' "$when" ;;
    '{SNAPSHOT}'|'{SNAPSHOT>'*'}')
      ref=""
      [[ "$word" == '{SNAPSHOT>'* ]] && { ref="${word#'{SNAPSHOT>'}"; ref="${ref%'}'}"; }
      # The two snapshot buckets are not named alike: production's carries a
      # db- infix and staging's does not, as restore-db.sh reads them.
      local listing bucket
      case "$TARGET" in
        production) bucket="footbag-production-db-snapshots" ;;
        staging)    bucket="footbag-staging-snapshots" ;;
      esac
      listing="$("$AWS_BIN" s3api list-objects-v2 --bucket "$bucket" --prefix routine/ \
        --query 'Contents[].[LastModified,Key]' --output text 2>&1)" \
        || { echo "the routine backups could not be listed: ${listing##*$'\n'}" >&2; return 1; }
      epoch_after=0
      if [[ -n "$ref" ]]; then
        when="$(step_time finished "$ref")" || { echo "step ${ref} has not finished, so no backup can be newer than it" >&2; return 1; }
        epoch_after="$(date -u -d "$when" +%s)"
      fi
      key=""; local best=0 modified k e
      while IFS=$'\t' read -r modified k; do
        [[ "$k" =~ ^routine/[0-9]{4}/[0-9]{2}/[0-9]{2}/footbag-[A-Za-z0-9._:-]+\.db\.gz$ ]] || continue
        e="$(date -u -d "$modified" +%s 2>/dev/null)" || continue
        (( e > epoch_after && e > best )) && { best="$e"; key="$k"; }
      done <<<"$listing"
      if [[ -z "$key" ]]; then
        if [[ -n "$ref" ]]; then echo "no routine backup is newer than step ${ref}: wait for the next routine backup" >&2
        else echo "no routine backup was found in ${bucket}" >&2; fi
        return 1
      fi
      printf '%s' "$key" ;;
    '{'*) echo "unknown placeholder ${word}" >&2; return 1 ;;
    *) printf '%s' "$word" ;;
  esac
}

# Fills CMD_WORDS from a command string, placeholders resolved word by word.
CMD_WORDS=()
resolve_command() {
  local raw w v
  read -r -a raw <<<"$1"
  CMD_WORDS=()
  for w in "${raw[@]}"; do
    v="$(resolve_word "$w")" || return 1
    CMD_WORDS+=("$v")
  done
}

# ── Running a child ──────────────────────────────────────────────────────────
# run_child <stdin> <report> <stdout-file or ""> <words...>
# Runs the command from the tree root, its closing report into <report>.
run_child() {
  local stdin="$1" report="$2" out="$3" exe
  shift 3
  local -a cmd=("$@")
  case "${cmd[0]}" in
    npm) cmd=("$NPM_BIN" "${cmd[@]:1}") ;;
    *.sh) cmd=(bash "${ROOT}/${cmd[0]}" "${cmd[@]:1}") ;;
  esac
  local rc=0
  if [[ "$stdin" == cred ]]; then
    if [[ -n "$out" ]]; then
      printf '%s\n' "$SUDO_PASS" | (cd "$ROOT" && FOOTBAG_CR_REPORT_TO="$report" "${cmd[@]}") >"$out" || rc=$?
    else
      printf '%s\n' "$SUDO_PASS" | (cd "$ROOT" && FOOTBAG_CR_REPORT_TO="$report" "${cmd[@]}") || rc=$?
    fi
  else
    if [[ -n "$out" ]]; then
      (cd "$ROOT" && FOOTBAG_CR_REPORT_TO="$report" "${cmd[@]}") </dev/tty >"$out" || rc=$?
    else
      (cd "$ROOT" && FOOTBAG_CR_REPORT_TO="$report" "${cmd[@]}") </dev/tty || rc=$?
    fi
  fi
  [[ -n "$out" ]] && cat -- "$out"
  return "$rc"
}

new_report() { mktemp "${SCRATCH}/report.XXXXXX"; }

# A child's problems into this run's report; with "warn", its errors as warnings.
hand_on() {
  local report="$1" how="${2:-}"
  [[ -s "$report" ]] || return 0
  if [[ "$how" == warn ]]; then
    sed $'s/^ERROR\t/WARN\t/' "$report" >> "$FOOTBAG_CR_REPORT_TO"
  else
    cat "$report" >> "$FOOTBAG_CR_REPORT_TO"
  fi
}

first_error() { grep -m1 $'^ERROR\t' "$1" | cut -f2- || [[ $? == 1 ]]; }

# proof_passes <proof> <report-out>: runs a <stdin>:<codes>=<cmd> proof.
PROOF_SAID=""
proof_passes() {
  local proof="$1" stdin codes cmd rc=0 report
  stdin="${proof%%:*}"; codes="${proof#*:}"; codes="${codes%%=*}"; cmd="${proof#*=}"
  PROOF_SAID="$cmd"
  if [[ "$stdin" == cred ]] && (( ! HAVE_CRED )); then return 2; fi
  # The step's own words are kept, so a read made between preparing a step and
  # running it cannot replace them.
  local -a step_words=("${CMD_WORDS[@]+"${CMD_WORDS[@]}"}")
  resolve_command "$cmd" || { CMD_WORDS=("${step_words[@]+"${step_words[@]}"}"); return 1; }
  report="$(new_report)"
  run_child "$stdin" "$report" "" "${CMD_WORDS[@]}" >/dev/null 2>&1 || rc=$?
  rm -f -- "$report"
  CMD_WORDS=("${step_words[@]+"${step_words[@]}"}")
  [[ ",${codes}," == *",${rc},"* ]]
}

ask_yes() {
  local answer=""
  printf '%s (yes/no; anything but yes stops the run here): ' "$1" > /dev/tty
  read -r answer < /dev/tty || answer=""
  [[ "$answer" == yes ]] && return 0
  # Says what was read, quoted, so a line pasted or typed before the question
  # appeared shows as itself: a decline the operator never typed is otherwise
  # indistinguishable from a no.
  printf 'Read %q, which is not yes.\n' "${answer:0:60}" > /dev/tty
  return 1
}

is_proof_command() { [[ "$1" =~ ^(cred|tty):[0-9,]+= ]]; }

# Whether this environment's alarm-mail subscriptions are all confirmed, read
# once per run: the steps that need alarm mail wait on it, and confirming the
# subscriptions is done outside this pass.
MAIL_STATE=""
mail_confirmed() {
  if [[ -z "$MAIL_STATE" ]]; then
    MAIL_STATE=pending
    # 0: every subscription confirmed; 4: confirmed, some by clicking the
    # email link, which receives alarm mail all the same.
    proof_passes "tty:0,4=scripts/reconfirm-alarm-subscriptions.sh --target ${TARGET} --status" && MAIL_STATE=confirmed
  fi
  [[ "$MAIL_STATE" == confirmed ]]
}

# ── Status: proofs and the log, nothing run that changes anything ───────────
if [[ "$MODE" == status ]]; then
  pending=0
  for (( i = FIRST; i <= LAST; i++ )); do
    parse_step "${STEPS[$i]}"
    row="$(log_last "$S_ID")"
    r_start="$(cut -f1 <<<"$row")"; r_result="$(cut -f3 <<<"$row")"
    state=""
    if [[ "$S_KIND" == blocked ]]; then
      state="BLOCKED: ${S_CMD}"; pending=1
    elif (( S_MAIL )) && [[ "$r_result" != ok* ]]; then
      if mail_confirmed; then state="NOT RUN (alarm mail is confirmed now: run it with --from-step ${S_ID})"
      else state="DEFERRED (alarm mail not confirmed)"; fi
      pending=1
    elif is_proof_command "$S_PROOF"; then
      rc=0; proof_passes "$S_PROOF" || rc=$?
      case "$rc" in
        0) state="DONE (proved by ${PROOF_SAID})" ;;
        2) state="UNKNOWN (its proof needs the credential on stdin)"; pending=1 ;;
        *) state="NOT DONE (${PROOF_SAID} does not prove it)"; pending=1 ;;
      esac
    elif [[ -z "$row" ]]; then
      state="NOT RUN"; pending=1
    elif [[ "$r_result" == ok* ]]; then
      if [[ "$S_KIND" == ask ]]; then state="ATTESTED at ${r_start} (log only)"
      elif [[ "$S_PROOF" == rerun ]]; then state="RE-RUN PROVES; recorded ok at ${r_start}"
      else state="RECORDED ok at ${r_start} (log only)"; fi
    else
      state="${r_result^^} at ${r_start}"; pending=1
    fi
    printf '  %-5s %s\n' "$S_ID" "$state"
  done
  if (( pending )); then
    cr_unproved "every ${TARGET} step done"
    cr_finish_with 3 PENDING
  fi
  cr_proved "every ${TARGET} step done or recorded"
  cr_finish
fi

# ── The run ──────────────────────────────────────────────────────────────────
ensure_section

CURRENT=""; CURRENT_START=""; CURRENT_CMD=""
on_interrupt() {
  case "$(cr_exit_status)" in 130|143|129) ;; *) return 0 ;; esac
  [[ -n "$CURRENT" ]] || return 0
  log_row "$CURRENT" "$CURRENT_START" "$CURRENT_CMD" interrupted
}
cr_cleanup on_interrupt

not_run_after() {
  local from="$1" j ids=()
  for (( j = from; j <= LAST; j++ )); do parse_step "${STEPS[$j]}"; ids+=("$S_ID"); done
  printf '%s' "${ids[*]}"
}

stop_at() {
  local i="$1" word="$2" why="$3" rest
  parse_step "${STEPS[$i]}"
  rest="$(not_run_after $(( i + 1 )))"
  cr_error "step ${S_ID} ${why}"
  [[ -n "$rest" ]] && cr_unproved "not run: ${rest}"
  # The offer reads other steps, so this step is parsed again after it.
  offer_gate_off
  parse_step "${STEPS[$i]}"
  echo "" >&2
  echo "Stopped at ${S_ID}. Resume with:" >&2
  echo "  < <credential file> bash scripts/production-readiness-sitting.sh --target ${TARGET} --from-step ${S_ID}" >&2
  SITTING_VERDICT="${word} AT ${S_ID}"
  CURRENT=""
  cr_finish_with 1 "${word} AT ${S_ID}"
}

# offer_gate_off: on production, when the log shows p13m turned the zero-logins
# gate on and no p13o has turned it off since, the stop offers to run p13o. The
# gate arms an alarm that exists only for the fire test, so a run that stops
# between the two would otherwise leave it on. The stopped step keeps its own
# failure: turning the gate off proves nothing about the alarm.
offer_gate_off() {
  [[ "$TARGET" == production ]] || return 0
  local on off on_done off_done k gate_cmd="" report rc=0
  on="$(log_last p13m)"
  [[ "$(cut -f3 <<<"$on")" == ok* ]] || return 0
  on_done="$(cut -f2 <<<"$on")"
  off="$(log_last p13o)"
  if [[ -n "$off" && "$(cut -f3 <<<"$off")" == ok* ]]; then
    off_done="$(cut -f2 <<<"$off")"
    [[ "$off_done" < "$on_done" ]] || return 0
  fi
  for k in "${!STEPS[@]}"; do
    parse_step "${STEPS[$k]}"
    [[ "$S_ID" == p13o ]] && { gate_cmd="$S_CMD"; break; }
  done
  [[ -n "$gate_cmd" ]] || return 0
  echo "" >&2
  echo "The zero-logins gate is still on: p13m turned it on and p13o has not turned it off." >&2
  if ask_yes "Turn it off now with ${gate_cmd}?"; then
    resolve_command "$gate_cmd" || { cr_error "the gate-off command could not be prepared; run it by hand: ${gate_cmd}"; return 0; }
    report="$(new_report)"
    run_child tty "$report" "" "${CMD_WORDS[@]}" || rc=$?
    hand_on "$report"
    rm -f -- "$report"
    if (( rc == 0 )); then
      log_row p13o "$(now_utc)" "$gate_cmd" ok "offered by the stop"
    else
      cr_error "the zero-logins gate is still on: ${gate_cmd} exited ${rc}"
    fi
  else
    cr_error "the zero-logins gate is still on; turn it off with ${gate_cmd}"
  fi
}

declare -A DIGESTS=()

for (( i = FIRST; i <= LAST; i++ )); do
  parse_step "${STEPS[$i]}"
  echo ""
  echo "== ${S_ID} (${S_KIND}) =="
  started="$(now_utc)"
  STARTED["$S_ID"]="$started"
  CURRENT="$S_ID"; CURRENT_START="$started"; CURRENT_CMD="$S_CMD"

  if (( S_MAIL )) && ! mail_confirmed; then
    log_row "$S_ID" "$started" "$S_CMD" "deferred (alarm mail not confirmed)"
    cr_unproved "deferred until alarm mail is confirmed: ${S_ID}"
    echo "Deferred: ${S_ID} needs a confirmed alarm-mail subscription; run it with --from-step once confirmed."
    CURRENT=""
    continue
  fi

  case "$S_KIND" in
    blocked)
      rest="$(not_run_after "$i")"
      log_row "$S_ID" "$started" "-" blocked "$S_CMD"
      cr_unproved "blocked: ${rest}; ${S_CMD}"
      echo "Blocked: ${S_CMD}" >&2
      SITTING_VERDICT="BLOCKED AT ${S_ID}"
      CURRENT=""
      cr_finish_with 3 BLOCKED
      ;;
    ask)
      # A question whose answer a read can already prove is not asked.
      if is_proof_command "$S_PROOF" && proof_passes "$S_PROOF"; then
        log_row "$S_ID" "$started" "$PROOF_SAID" ok "not asked: proved by ${PROOF_SAID}"
        cr_proved "${S_ID}: proved by ${PROOF_SAID}, so not asked"
        continue
      fi
      if ask_yes "$S_CMD"; then
        log_row "$S_ID" "$started" "-" ok "answered yes: ${S_CMD}"
        cr_proved "${S_ID}: answered yes: ${S_CMD}"
      else
        log_row "$S_ID" "$started" "-" declined "not answered yes: ${S_CMD}"
        stop_at "$i" STOPPED "was declined: ${S_CMD}"
      fi
      continue
      ;;
  esac

  if [[ "$S_KIND" == read && "$S_PROOF" == after=* ]]; then
    ref="${S_PROOF#after=}"; minutes="${ref#*+}"; ref="${ref%%+*}"
    if when="$(step_time finished "$ref")"; then
      not_before=$(( $(date -u -d "$when" +%s) + minutes * 60 ))
      while (( $(date -u +%s) < not_before )); do
        echo "  ${S_ID} runs no sooner than $(date -u -d "@${not_before}" +%H:%M:%SZ) (${minutes} minutes after ${ref}); Ctrl-C and --from-step ${S_ID} also work."
        sleep "$POLL_SECS"
      done
    else
      stop_at "$i" STOPPED "cannot run yet: step ${ref} has no finish recorded"
    fi
  fi

  if ! resolve_command "$S_CMD" 2>"${SCRATCH}/resolve.err"; then
    msg="$(tail -n 1 "${SCRATCH}/resolve.err")"
    log_row "$S_ID" "$started" "$S_CMD" failed "$msg"
    stop_at "$i" STOPPED "could not be prepared: ${msg}"
  fi
  CURRENT_CMD="${CMD_WORDS[*]}"
  notes=""

  out=""
  [[ "$S_KIND" == digest || "$S_PROOF" == stdout=* ]] && out="${SCRATCH}/${S_ID}.out"
  report="$(new_report)"
  rc=0; run_child "$S_STDIN" "$report" "$out" "${CMD_WORDS[@]}" || rc=$?
  failed=""

  # The confirmation walk: a topic left pending defers, never stops; what it
  # confirmed is read afresh by the next step that needs mail.
  if [[ "$S_KIND" == mailwalk ]]; then
    MAIL_STATE=""
    if (( rc == 3 )); then
      hand_on "$report" warn
      rm -f -- "$report"
      log_row "$S_ID" "$started" "$CURRENT_CMD" "deferred (alarm mail not confirmed)"
      cr_unproved "deferred until alarm mail is confirmed: ${S_ID}"
      echo "Deferred: ${S_ID} left a subscription pending; run it again with --from-step ${S_ID} once the emails are to hand."
      CURRENT=""
      continue
    fi
  fi
  (( rc == 0 )) || failed="exit ${rc}"

  if [[ -z "$failed" ]]; then
    case "$S_PROOF" in
      fact=*)
        grep -qxF -- $'FACT\t'"${S_PROOF#fact=}" "$report" || failed="no ${S_PROOF#fact=} fact: the step changed nothing it can prove" ;;
      stdout=*)
        grep -qE -- "${S_PROOF#stdout=}" "$out" || failed="its output did not match ${S_PROOF#stdout=}" ;;
      save)
        DIGESTS["$TARGET"]="$(grep -E '^DIGEST ' "$out" || [[ $? == 1 ]])"
        [[ -n "${DIGESTS[$TARGET]}" ]] || failed="it printed no digests" ;;
      match)
        now_digests="$(grep -E '^DIGEST ' "$out" || [[ $? == 1 ]])"
        if [[ -z "${DIGESTS[$TARGET]:-}" ]]; then failed="no digests were saved earlier in this run to compare with"
        elif [[ "$now_digests" != "${DIGESTS[$TARGET]}" ]]; then
          failed="the preserved tables changed: $(diff <(printf '%s\n' "${DIGESTS[$TARGET]}") <(printf '%s\n' "$now_digests") | grep -E '^>' | tr '\n' ' ' || [[ $? == 1 ]])"
        fi ;;
    esac
  fi

  # A step that names a fallback (the erasure replay a restore can leave
  # unfinished) offers it once. Its own errors become warnings only if the
  # fallback then finishes the work.
  if [[ -n "$failed" && -n "$S_FALLBACK" ]] && ask_yes "${S_ID} did not finish (${failed}). Run ${S_FALLBACK} now?"; then
    resolve_command "$S_FALLBACK" || stop_at "$i" STOPPED "its fallback could not be prepared"
    fallback_report="$(new_report)"
    frc=0; run_child "$S_STDIN" "$fallback_report" "" "${CMD_WORDS[@]}" || frc=$?
    if (( frc == 0 )); then
      hand_on "$report" warn
      rm -f -- "$report"
      report="$fallback_report"
      failed=""
      notes="finished by --${S_FALLBACK##*--}"
    else
      hand_on "$fallback_report"
      rm -f -- "$fallback_report"
      failed="${failed}, and its fallback exit ${frc}"
    fi
  fi

  if [[ -n "$failed" ]]; then
    said="$(first_error "$report")"
    hand_on "$report"
    rm -f -- "$report"
    log_row "$S_ID" "$started" "$CURRENT_CMD" "failed (${failed%%:*})" "${said:-$failed}"
    stop_at "$i" STOPPED "failed (${failed})"
  fi
  hand_on "$report"
  rm -f -- "$report"

  # A proof command after an apply or an act confirms it.
  if [[ "$S_KIND" == once || "$S_KIND" == idem ]] && is_proof_command "$S_PROOF"; then
    if ! proof_passes "$S_PROOF"; then
      log_row "$S_ID" "$started" "$CURRENT_CMD" "failed (proof)" "${PROOF_SAID} does not prove it done"
      stop_at "$i" STOPPED "finished, but ${PROOF_SAID} does not prove it done"
    fi
    notes="${notes:+${notes}; }proved by ${PROOF_SAID}"
  fi
  log_row "$S_ID" "$started" "$CURRENT_CMD" ok "$notes"
  cr_proved "${S_ID}: ${CURRENT_CMD}"
  CURRENT=""
done

# ── Close ────────────────────────────────────────────────────────────────────
if ! uncommitted="$(git -C "${ROOT}/footbag_private_repo" status --porcelain 2>&1 | cut -c4- | tr '\n' ' ')"; then
  cr_warn "could not read the private checkout's git status, so its uncommitted files are not listed: ${uncommitted}"
  uncommitted=""
fi
[[ -n "${uncommitted// /}" ]] && cr_unproved "the private checkout has uncommitted files (${uncommitted% }); the maintainer commits them"
if (( LAST < ${#STEPS[@]} - 1 )); then
  cr_unproved "the steps after ${TO_STEP}: not run (--to-step)"
fi
cr_finish
