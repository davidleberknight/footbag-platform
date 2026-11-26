#!/usr/bin/env bash
# production-readiness-sitting.sh -- run one pass of the production-readiness
# sitting for one environment: every step's own script in order, every check
# only a person can make asked at the terminal, and a row in the cutover log for
# each step as it ends. Pass 1 needs no DNS and runs on staging and production;
# pass 2 (after the nameserver move, the go-live window rehearsed) and pass 3
# (the final pass on the frozen commit) are production's alone.
#
# WHY THIS EXISTS.
#
# Each pass is many steps across dozens of scripts, with human checks between
# them (did the alarm mail arrive, is a member signed in). Run by hand from a
# list, a step is skipped or run out of order under pressure, a check is
# remembered rather than asked, and the record is written afterwards from memory.
# Here the order, the questions and the record are the script's: it stops at the
# first step that does not finish, names every step that did not run, and prints
# the one command that resumes from where it stopped. Every row names the commit
# it ran at, how many of the paths its step runs differed from it, and a
# fingerprint of those differences, so a row can be matched to the code that
# wrote it.
#
# HOW A STEP RUNS. Each step's script runs as a child, at this terminal, with its
# closing report collected privately so the step's outcome is read from it and
# its warnings carried into this run's report. Every step is one of:
#   read     a check; run every time, and its exit decides it. One that must
#            wait on an earlier step (after=) waits at the terminal when the
#            time is within the hour; further off, it is recorded as deferred
#            and the run carries on and ends pending.
#   idem     an apply whose re-run is its own proof; run every time.
#   once     an act that is not repeated; a log row never skips it.
#   ask      a yes/no question at the terminal; only "yes" passes. One whose
#            proof is a read is not asked when that read already passes.
#   digest   the preserved tables' digests, saved before a migration and
#            compared after it.
#   blocked  work not yet scriptable; it is recorded and passed over, and the
#            run ends pending (exit 3), so the pass cannot read as done. A step
#            that stands on it (named beside the list, as "<step>:<needed>")
#            is recorded as skipped and not run; every other step still runs.
#   mailwalk the alarm-mail confirmation walk, at the terminal. Every
#            subscription confirmed is ok; a topic the operator leaves pending
#            (its exit 3) is recorded as deferred and the run carries on, since
#            alarm mail must not block the pass, and ends pending; any other
#            failure stops it.
# A kind ending in "+mail" needs a confirmed alarm-mail subscription (a test
# alarm, a drill or proof that asks whether its email arrived). Each target's
# mailwalk step comes before its first such step; until the environment's
# subscription status reads clean, such a step is recorded as deferred and the
# run carries on, and the closing report lists it as not proven.
# A kind carrying "+heavy" (a host rebuild, a restore, a fresh instance's
# bootstrap) runs only after scripts/check-env-health.sh finds the host's CPU
# burst capacity in hand and no critical alarm firing, and is followed by the
# same read of the alarms alone, which waits for the step's own expected alarms
# to clear; either failing stops the run.
# A heavy step also carrying "+fresh" (the bootstrap of a fresh instance, which
# restores its database) gives the read before it --fresh-instance: the instance
# has no database for its backups to read, so the backup alarms stay in ALARM
# until this step ends them. The read after it waits 25 minutes rather than 10,
# long enough for the first backups to run and those alarms, which judge
# ten-minute periods, to return to OK.
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
#   - A tree with no commit to name in its rows (not a git checkout).
#   - A --from-step or --to-step naming no step of the pass's list.
#   - Pass 2 or 3 on staging, or a pass that is not 1, 2 or 3.
#
# Usage:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/production-readiness-sitting.sh \
#     --target staging [--from-step <id>] [--to-step <id>]
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#     bash scripts/production-readiness-sitting.sh --target production
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#     bash scripts/production-readiness-sitting.sh --target production --pass 2
#   bash scripts/production-readiness-sitting.sh --target <env> --dry-run
#   < <credential file> bash scripts/production-readiness-sitting.sh \
#     --target <env> --status
#
# Flags:
#   --target <staging|production>  Required, no default.
#   --pass <1|2|3>  Which pass to run; 1 when not given. 2 and 3 are
#               production's, each recorded in its own cutover log section.
#   --from-step <id>, --to-step <id>  Run only that stretch of the list.
#   --dry-run   List the steps and their commands. Reads nothing, runs nothing,
#               writes nothing, and needs no credential.
#   --status    Run only the proof commands, read the rest from the log, and
#               write nothing. Without a credential on stdin the proofs that
#               need one read UNKNOWN. A read proved by its own output
#               (stdout=) is read from the log here, as it is not re-run. A
#               row recorded ok reads LAPSED, and pending, when it names no
#               commit or the code it ran has changed since. The staging pass
#               is not run again, so on staging a row whose code has changed
#               since still stands, saying so; one naming no commit, or
#               uncommitted code since gone, still reads LAPSED. A heavy
#               step refused for the host's health does not hide an earlier
#               ok row for it.
#
# Exit: 0 every step done; 1 a step failed or was declined, any error, or a
# refusal; 2 usage error; 3 nothing failed but a step was blocked, skipped or
# deferred, or (--status) anything is pending.
#
# Test seams (CI only), each announced on stderr:
#   SITTING_ROOT       the tree holding the child scripts and the cutover log
#   SITTING_NPM_BIN    replaces npm
#   SITTING_AWS_BIN    replaces the aws CLI for the snapshot listing
#   SITTING_POLL_SECS  replaces the minute between not-before checks
set -euo pipefail

TARGET=""
PASS=1
FROM_STEP=""
TO_STEP=""
MODE=run

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --pass) PASS="${2:-}"; shift 2 || { echo "ERROR: --pass requires an argument" >&2; exit 2; } ;;
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
case "$PASS" in
  1) ;;
  2|3) [[ "$TARGET" == production ]] || { echo "ERROR: pass ${PASS} is production's alone: staging has no custom domain, preview or go-live window to rehearse." >&2; exit 2; } ;;
  *) echo "ERROR: --pass takes 1, 2 or 3 (got '${PASS}')" >&2; exit 2 ;;
esac

ROOT="${SITTING_ROOT:-$REPO_ROOT}"
NPM_BIN="${SITTING_NPM_BIN:-npm}"
AWS_BIN="${SITTING_AWS_BIN:-aws}"
POLL_SECS="${SITTING_POLL_SECS:-60}"
for seam in SITTING_ROOT SITTING_NPM_BIN SITTING_AWS_BIN SITTING_POLL_SECS; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done
LOG="${ROOT}/footbag_private_repo/cutover/CUTOVER_LOG.md"
# Each pass writes its own section, so a later pass's re-run of a step is read
# apart from the earlier pass's row for it.
case "$PASS" in
  1) SECTION='## 9. Production-readiness sitting' ;;
  2) SECTION='## 10. Production-readiness sitting, pass 2' ;;
  3) SECTION='## 11. Production-readiness sitting, pass 3' ;;
esac

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
#   stdout=<ERE>[ && <ERE>...]  every pattern must match a line of the step's
#                           output; no pattern may hold "|" or a quote
#   save, match             (digest) save the digests, or compare with the saved
#   after=<id>+<minutes>    (read) not before <id> finished plus the minutes;
#                           more than an hour off, recorded as deferred
#   exit=<codes>            (read) the step's own exits that count as done
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
  # The host and workstation reads production runs at p02a, p05a, p05d, p06a,
  # p07g and p04b, each proved on staging first.
  's02a|read|tty|-|scripts/check-versions.sh'
  's02b|read|cred|-|scripts/step-amazon-linux.sh --target staging --status'
  's02c|read|cred|-|scripts/harden-sshd.sh --target staging --expect-hardened'
  's02d|read|cred|-|scripts/verify-host-env.sh --target staging'
  's02e|read|tty|-|scripts/verify-replication.sh --target staging'
  's02f|read|tty|-|npm run test:deployed -- --target staging'
  's03|mailwalk|tty|log|scripts/confirm-alarm-subscription.sh --target staging'
  's04a|once+mail|tty|log|scripts/send-test-alarm.sh --target staging --region us-west-2 --alarm footbag-staging-media-replication-backlog'
  's04b|ask+mail|-|log|Alarm mail check. s04a raised footbag-staging-media-replication-backlog (us-west-2) to ALARM and back to OK. The operations mailbox should now hold two emails from AWS Notifications, one with a subject starting ALARM: "footbag-staging-media-replication-backlog" and then one starting OK: with the same name (in Gmail, search from:no-reply@sns.amazonaws.com in:anywhere newer_than:1d and look for that subject; Gmail can file it inside an older conversation with the same subject). s04c and s04d then read that the alarm is back to OK and that the admin alarms page lists nothing active. Did both emails arrive?'
  's04c|read+mail|tty|-|scripts/send-test-alarm.sh --target staging --region us-west-2 --status --expect OK --wait-minutes 10 --alarm footbag-staging-media-replication-backlog'
  's04d|read+mail|tty|-|scripts/host-diagnostics.sh --target staging active-alarms'
  # A real outage line through the log group and the metric filter to the
  # alarm, so the alarm is proved watching its metric, not only set by hand.
  's04e|once+mail|tty|log|scripts/verify-captcha-outage-alarm.sh --target staging'
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
  's08a|read|tty|stdout=^SSM  \(/footbag/staging/app/payments_armed\): [a-z]+$|scripts/arming.sh --target staging --status --profile footbag-operator'
  's08b|idem|tty|rerun|scripts/arming.sh --target staging --state dark --profile footbag-operator'
  's08c|read|tty|stdout=^tfvars .*: payments_armed = dark$ && ^SSM  \(/footbag/staging/app/payments_armed\): dark$|scripts/arming.sh --target staging --status --profile footbag-operator'
  's08d|idem|tty|rerun|scripts/arming.sh --target staging --state armed --profile footbag-operator'
  's08e|read|tty|stdout=^tfvars .*: payments_armed = armed$ && ^SSM  \(/footbag/staging/app/payments_armed\): armed$|scripts/arming.sh --target staging --status --profile footbag-operator'
  's09e|idem|tty|rerun|scripts/admin-bootstrap-token.sh --target staging cleanup'
  's09f|read|tty|stdout=^ABSENT:|scripts/admin-bootstrap-token.sh --target staging status'
  's10a|once+mail|cred|log|scripts/incident-drill.sh --target staging'
  # The host rebuild drills, timed by their log rows against the four-hour
  # objective: a restore from the automatic snapshot, then a fresh instance.
  's11a|read|tty|-|scripts/verify-host-snapshots.sh --target staging'
  's11b|read|cred|-|scripts/bootstrap-host.sh --target staging --status'
  's11c|once+heavy|cred|log|scripts/restore-host.sh --target staging'
  's11d|once|tty|log|deploy_to_aws.sh --target staging'
  's11e|read|cred|-|scripts/bootstrap-host.sh --target staging --status'
  's11f|read|tty|-|scripts/verify-account-baseline.sh --profile footbag-operator'
  's11g|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target staging --drill'
  's11h|ask+mail|-|log|Alarm check, snapshot restore. Since s11c began, the operations mailbox should hold an IAM-write or alerting-disabled alarm email only for an apply the restore or the deploy made, and a break-glass alarm email for each host-key read the restore made. Does every such email match one of those?'
  's11i|once|cred|log|scripts/restore-host.sh --target staging --delete-old'
  's11j|once|cred|log|scripts/bootstrap-host.sh --target staging --replace-instance'
  # The fresh instance comes back the way a live production's does: the
  # release installed unstarted, the newest backup restored with its erasure
  # replay, then the code deploy, all inside the bootstrap.
  's11k|idem+heavy+fresh|cred|cred:0=scripts/bootstrap-host.sh --target staging --status|scripts/bootstrap-host.sh --target staging --restore-database'
  's11l|read|tty|-|scripts/verify-account-baseline.sh --profile footbag-operator'
  's11m|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target staging --drill'
  's11n|ask+mail|-|log|Alarm check, fresh instance. Since s11j began, does every IAM-write, alerting-disabled or break-glass alarm email in the operations mailbox match an apply or a host-key read the replacement or the bootstrap made?'
  # The fresh instance proved to come back hardened, wired and serving.
  's11o|read|cred|-|scripts/harden-sshd.sh --target staging --expect-hardened'
  's11p|read|cred|-|scripts/verify-host-env.sh --target staging'
  's11q|read|tty|-|npm run test:deployed -- --target staging'
  # The retention rules' outcome on the snapshots bucket, and a deleted
  # object brought back into each served bucket by both of its recoveries.
  's12|read|tty|-|scripts/apply-snapshot-retention.sh --target staging --verify --profile footbag-operator'
  's13a|once|tty|log|scripts/restore-bucket.sh --target staging --bucket media --drill'
  's13b|once|tty|log|scripts/restore-bucket.sh --target staging --bucket archive --drill'
  # The fresh instance's own automatic snapshot. The first one is taken at the
  # next daily window, up to a day after the instance is created, so it is
  # read 26 hours after the replacement: the day and the two-hour grace every
  # daily job is allowed.
  's13c|read|tty|after=s11j+1560|scripts/verify-host-snapshots.sh --target staging --require-taken'
  's95|once+mail|cred|log|scripts/verify-prelive-probes.sh --target staging'
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
  'p05d|read|cred|-|scripts/harden-sshd.sh --target production --expect-hardened'
  'p06a|read|cred|-|scripts/verify-host-env.sh --target production'
  'p06b|read|tty|-|scripts/verify-cwagent-metrics.sh --target production --profile footbag-operator'
  'p06c|read|tty|-|scripts/verify-cwagent-metrics.sh --target production --profile footbag-operator --containers'
  'p06d|read|tty|-|scripts/verify-host-snapshots.sh --target production'
  'p07a|ask|-|log|Open PRODUCTION_READINESS_RUNBOOK.md in the private checkout (footbag_private_repo/) and read its opening and its section 1, Reads: what this pass changes on production, what to have ready, and what to look for in each read. p07h to p07n run those reads later in this pass. Read it?'
  'p07b|read|tty|stdout=^tfvars .*: payments_armed = dark$ && ^SSM  \(/footbag/production/app/payments_armed\): dark$|scripts/arming.sh --target production --status --profile footbag-operator'
  'p07c|read|tty|-|scripts/production-live-marker.sh --status --profile footbag-operator'
  'p07d|read|tty|-|scripts/production-live-marker.sh --set live --dry-run --profile footbag-operator'
  'p07e|read|cred|stdout=^ 2\. Terraform +DONE  && ^ 3\. Payments +N-A +payments dark && ^ 4\. Backup pipeline +DONE  && ^ 8\. Deployed runtime +DONE |scripts/bringup-status.sh --target production --profile footbag-operator'
  'p07f|read|tty|-|scripts/create-stripe-endpoint.sh --target production --mode live --verify'
  'p07g|read|tty|-|scripts/verify-replication.sh --target production'
  'p08a|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target production --drill'
  'p08b|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target production --drill --bucket footbag-production-db-snapshots-dr'
  'p08c|read|cred|-|scripts/pre-cutover-checklist.sh --target production --no-snapshot --skip-tests --skip-dns-ttl'
  'p07h|read|tty|-|scripts/apply-snapshot-retention.sh --target production --verify --profile footbag-operator'
  'p07i|read|tty|-|scripts/apply-bucket-tls-baseline.sh --verify-only --profile footbag-operator'
  'p07j|read|cred|stdout=^  enabled: enabled$ && ^  active:  active$ && ^  toml: .*namespace *= *.CWAgent/production.|scripts/diagnose-cwagent.sh --target production'
  'p07k|read|tty|-|scripts/provision-ssm-secret.sh --target production --secret session_secret status --profile footbag-operator'
  'p07l|read|tty|-|scripts/verify-cutover-notice.sh --function --expect-live --profile footbag-operator'
  'p07m|read|cred|stdout=^live feed queues: .*/footbag-production-alarm-feed([[:space:]].*)?$ && ^live feed queues: .*/footbag-production-ses-feedback-feed([[:space:]].*)?$|scripts/activate-notification-feeds.sh --target production --status --profile footbag-operator'
  'p07n|read|cred|-|scripts/payments-pause.sh --target production --status'
  'p07o|read|tty|stdout=^No findings\.$|scripts/verify-dev-tester-role-denials.sh --profile footbag-operator'
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
  'p12d1|read|tty|-|npm run test:deployed -- --target production'
  'p12e|ask|-|log|Session check (2 of 2). Reload the tab where you signed in at p12a. You should now be signed out; sign in again with your password. Then, still signed in, open the browser developer tools (Application, then Cookies) and read the session cookie. Were you signed out, did signing in again work, and is the session cookie named with the __Host- prefix and marked HttpOnly, Secure, SameSite=Lax and Path=/? Answer yes only if all of that is true.'
  # Every email subscription on production's alarm topics, main and critical
  # (and the us-west-2 one), read and recorded with its warnings before the
  # drills that raise them: 0 every one authenticated, 4 some confirmed by a
  # click, which still receives mail. While any is pending it is deferred, as
  # the drills are.
  'p13b|read+mail|tty|exit=0,4|scripts/reconfirm-alarm-subscriptions.sh --target production --status'
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
  'p21c0|read|tty|-|npm run test:deployed -- --target production'
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
  # The host rebuild drills, with every lesson the staging drill taught. They
  # refuse a live production, where each replaces the serving host. The trees
  # must hold nothing unapplied, since a status read fails on any. Email must
  # read dark: a restored host's worker sends with the switch its snapshot
  # carries until the restore holds it, and restore-host.sh also refuses a
  # switch changed since that snapshot. Every run reaching here has deployed
  # this tree at p12d and p21c, so the backup guards the drills prove are on
  # the host.
  'p90a|read|tty|stdout=currently reads: false$|scripts/production-live-marker.sh --status --profile footbag-operator'
  'p90b|read|tty|-|scripts/terraform-apply-all.sh --target production --check'
  'p90c|read|tty|stdout=^SSM .*email_send_armed\): dark$|scripts/arming.sh --target production --switch email --status --profile footbag-operator'
  'p90d|read|tty|-|scripts/verify-host-snapshots.sh --target production'
  'p90e|read|cred|-|scripts/bootstrap-host.sh --target production --status'
  'p90f|once+heavy|cred|log|scripts/restore-host.sh --target production'
  'p90g|once|tty|log|deploy_to_aws.sh --target production'
  'p90g1|read|tty|-|npm run test:deployed -- --target production'
  'p90h|read|cred|-|scripts/bootstrap-host.sh --target production --status'
  'p90i|read|tty|-|scripts/verify-account-baseline.sh --profile footbag-operator'
  'p90j|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target production --drill'
  'p90k|ask+mail|-|log|Alarm check, snapshot restore. Since p90f began, the operations mailbox should hold an IAM-write or alerting-disabled alarm email only for an apply the restore or the deploy made, and a break-glass alarm email for each host-key read the restore made. Does every such email match one of those?'
  'p90l|once|cred|log|scripts/restore-host.sh --target production --delete-old'
  'p90m|once|cred|log|scripts/bootstrap-host.sh --target production --replace-instance'
  # As on staging, the fresh instance comes back the way it will after go-live,
  # which also keeps the first-admin claim and the rest of pass 1's database.
  'p90n|idem+heavy+fresh|cred|cred:0=scripts/bootstrap-host.sh --target production --status|scripts/bootstrap-host.sh --target production --restore-database'
  'p90o|read|tty|-|scripts/verify-account-baseline.sh --profile footbag-operator'
  'p90p|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target production --drill --bucket footbag-production-db-snapshots-dr'
  'p90q|ask+mail|-|log|Alarm check, fresh instance. Since p90m began, does every IAM-write, alerting-disabled or break-glass alarm email in the operations mailbox match an apply or a host-key read the replacement or the bootstrap made?'
  # The fresh instance proved to come back hardened, wired and serving, as
  # staging's is at s11o to s11q.
  'p90q1|read|cred|-|scripts/harden-sshd.sh --target production --expect-hardened'
  'p90q2|read|cred|-|scripts/verify-host-env.sh --target production'
  'p90q3|read|tty|-|npm run test:deployed -- --target production'
  'p90r|once|tty|log|scripts/restore-bucket.sh --target production --bucket media --drill'
  'p90s|once|tty|log|scripts/restore-bucket.sh --target production --bucket archive --drill'
  # As at s13c, the fresh instance's first automatic snapshot.
  'p90t|read|tty|after=p90m+1560|scripts/verify-host-snapshots.sh --target production --require-taken'
  'p91|blocked|-|-|The migration case matrix on production: deploy-migrate.sh has no one-off production mode yet'
  'p92|blocked|-|-|The video-curation walk on production: it follows the curation walk on staging'
  'p93|blocked|-|-|The Stripe test-mode exercise of paid event registration: the flow is built, and its exercise is not yet written as steps'
  'p94|blocked|-|-|Forcing the 5xx alarm, proving the backup-age alarm, and the checkpoint-blocked alarm read: each needs its own script or alarm first'
  'p95|once+mail|cred|log|scripts/verify-prelive-probes.sh --target production'
  'p96|blocked|-|-|The second-operator proof: their allow-listed address and key, their Workspace administrator recovery, and their drill walk'
  'p97|blocked|-|-|The deferred Amazon Linux patch halves, each once its staging half is proved'
)

# Pass 2, production only: after the nameserver move, the go-live window
# rehearsed (runbook P2-1 to P2-9). Every stage that takes a typed APPLY reads
# the terminal, so none has a stdout proof, which would take its terminal away.
PRODUCTION_PASS2_STEPS=(
  'p2-1|once|tty|log|scripts/production-cutover.sh --target production --stage custom-domain'
  'p2-2|ask|-|log|Turnstile: in the Cloudflare dashboard (Turnstile, the production widget, Hostname management), is preview.footbag.org added to the one widget, and does the widget render and complete on the preview sign-in and registration pages?'
  'p2-3a|once|tty|log|scripts/production-cutover.sh --target production --stage ses-domain'
  'p2-3b|once|cred|log|scripts/ses-sender-cutover.sh --target production'
  'p2-3c|read|cred|-|scripts/verify-host-env.sh --target production'
  'p2-3d|once|cred|log|scripts/verify-prod-email.sh --profile footbag-production-runtime --read-profile footbag-operator --outbox --inbox-from-tty'
  'p2-3e|once|tty|log|scripts/arming.sh --target production --switch email --state armed --profile footbag-operator'
  'p2-3f|read|tty|stdout=^tfvars .*: email_send_armed = armed$ && ^SSM  \(/footbag/production/app/email_send_armed\): armed$|scripts/arming.sh --target production --switch email --status --profile footbag-operator'
  'p2-3g|once|tty|log|scripts/mail-domain-cutover.sh --target production --stage ifpa-move'
  'p2-3h|ask|-|log|IFPA list domain: has scripts/mail-domain-cutover.sh --target production --stage ifpa-verify --token google-site-verification=<token> --resolver 8.8.8.8 run with the token Julie read in the Workspace console, and has Julie verified ifpa.footbag.org as a secondary domain?'
  'p2-4a|ask|-|log|Google signing: has scripts/verify-mail-records.sh --stage signing --nameserver <route53-ns> --resolver 8.8.8.8 --tfvars <values-file> passed against Route 53, and does a message from an IFPA account to a personal Gmail show dkim=pass header.d=footbag.org under Show original?'
  'p2-5|blocked|-|-|Origin TLS, then the origin-verify secret rotation: scripts/provision-origin-tls.sh is not built'
  'p2-6a|once|tty|log|scripts/production-cutover.sh --target production --stage window'
  'p2-6b|once|tty|log|deploy_to_aws.sh --target production'
  'p2-6c|read|cred|-|scripts/verify-host-env.sh --target production'
  'p2-6d|read|tty|-|scripts/verify-cutover-notice.sh --function --expect-notice --profile footbag-operator'
  'p2-7a|read|tty|-|scripts/verify-archive-edge.sh --target production --profile footbag-operator'
  'p2-7b|read|tty|-|scripts/verify-preview.sh --target production --profile footbag-operator'
  'p2-7c|once+mail|cred|log|scripts/verify-prelive-probes.sh --target production'
  'p2-7d|ask|-|log|Does Search Console still show footbag.org verified?'
  'p2-8a|blocked|-|-|The three archive cookie host values on the host: their publisher is not built'
  'p2-8b|ask|-|log|Preview and archive walk: signed in on preview, do the three CloudFront cookies carry the parent domain and the session cookie read host-only in the developer tools, does the Legacy Archive link load with no second login, and is the next archive request refused after signing out?'
  'p2-9a|ask|-|log|Before the dress rehearsal: are www.footbag.org and the apex added to the one Turnstile widget, and has the outbox sent everything queued?'
  'p2-9b|once|tty|log|scripts/production-cutover.sh --target production --stage rehearsal'
  'p2-9c|once|tty|log|deploy_to_aws.sh --target production'
  'p2-9d|ask|-|log|Dress rehearsal (gate OR15): reached through a CloudFront edge address with curl --resolve, does www.footbag.org serve the platform, does the apex answer 301, and have the testers walked www the same way?'
  'p2-9e|once|tty|log|scripts/production-cutover.sh --target production --stage window'
  'p2-9f|once|tty|log|deploy_to_aws.sh --target production'
  'p2-9g|read|cred|-|scripts/verify-host-env.sh --target production'
  'p2-4b|ask|-|log|Has Julie renamed the legacy webmaster account to brat@footbag.org, after the webmaster@ rehearsal sent with dkim=pass header.d=footbag.org and at least two days before T-0?'
)

# The section 1 reads (p07b to p07o), taken from the pass 1 list itself so the
# commands have one home, under new ids, with the notice expected on, since
# production now rests in the window state.
pass3_reads() {
  local prefix="$1" row id
  for row in "${PRODUCTION_STEPS[@]}"; do
    id="${row%%|*}"
    [[ "$id" =~ ^p07[b-o]$ ]] || continue
    row="${prefix}${id#p07}|${row#*|}"
    printf '%s\n' "${row/--expect-live/--expect-notice}"
  done
}

# Pass 3, production only: the final pass, on the frozen commit (runbook P3-1 to
# P3-5). Every row of this run names the commit it ran at.
mapfile -t PASS3_READS_2 < <(pass3_reads p3-2-)
mapfile -t PASS3_READS_3 < <(pass3_reads p3-3-)
PRODUCTION_PASS3_STEPS=(
  'p3-1|ask|-|log|Release candidate frozen (gate OR26): is one commit through the release gate tagged, with its tag and SHA in the cutover log, staging deployed from it, and the closing personal-data greps over the public tree (GV3) clean?'
  "${PASS3_READS_2[@]}"
  'p3-2p|read|tty|-|scripts/verify-archive-edge.sh --target production --profile footbag-operator'
  'p3-2q|read|tty|-|scripts/verify-preview.sh --target production --profile footbag-operator'
  'p3-2r|once+mail|cred|log|scripts/verify-prelive-probes.sh --target production'
  'p3-2s|read|tty|-|npm run test:deployed -- --target production'
  'p3-2t|ask|-|log|The prompted checklist on preview: walked, including the session cookie read in the developer tools after a real sign-in, named with the __Host- prefix and marked HttpOnly, Secure, SameSite=Lax and Path=/?'
  'p3-3a|ask|-|log|Are three or fewer sign-in-capable accounts left on production, the test accounts from P1-9a, P1-17 and P2-8 removed through the member account-deletion flow? The rebuild refuses above three.'
  'p3-3b|once|tty|log|deploy_to_aws.sh --target production --all-data -W'
  "${PASS3_READS_3[@]}"
  'p3-3p|read|cred|-|scripts/pre-cutover-checklist.sh --target production --no-snapshot --skip-tests --skip-dns-ttl'
  'p3-3q|read|cred|stdout=jwt_expiry_hours current=24([[:space:]].*)?$|scripts/reconcile-host-config.sh --target production --status --key jwt_expiry_hours'
  'p3-4a|once|tty|log|scripts/admin-bootstrap-token.sh --target production --profile footbag-operator provision'
  'p3-4b|read|tty|stdout=^ABSENT:|scripts/admin-bootstrap-token.sh --target production --profile footbag-operator status --wait-minutes 30'
  'p3-4c|ask|-|log|First administrator identity match: claimed at /admin/bootstrap-claim on preview, have they finished the onboarding wizard claim task, and did it resolve to their historical record (go-live plan step 13a)?'
  'p3-5a|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target production --drill'
  'p3-5b|read|cred|stdout=^  Members: +[1-9][0-9]*$ && ^  Newest audit: +[0-9]{4}-|scripts/restore-db.sh --target production --drill --bucket footbag-production-db-snapshots-dr'
)

# What a step stands on, as "<step>:<the step it needs>" pairs. A step whose
# needed step has no ok row in this pass's section is recorded as skipped and
# not run: run without it, it acts on a state that does not exist (a restore
# onto a fresh instance nobody built) or attests to one (a question about the
# replacement), and its row would read as proof. A step not listed stands on
# nothing a blocked step does, so it runs.
STAGING_NEEDS=""
PRODUCTION_NEEDS="p90n:p90m p90q:p90m"
# Pass 2: the window, the checks on the real names, the walks and the dress
# rehearsal all stand on the hop from CloudFront to the origin being encrypted
# first, since each rehearses what members will use; the archive walk stands on
# the cookie values its publisher sets.
PRODUCTION_PASS2_NEEDS="p2-8b:p2-8a"
for id in p2-6a p2-6b p2-6c p2-6d p2-7a p2-7b p2-7c p2-7d p2-8b p2-9a p2-9b p2-9c p2-9d p2-9e p2-9f p2-9g; do
  PRODUCTION_PASS2_NEEDS+=" ${id}:p2-5"
done
PRODUCTION_PASS3_NEEDS=""

case "${TARGET}:${PASS}" in
  staging:1)    STEPS=("${STAGING_STEPS[@]}");          NEEDS_PAIRS="$STAGING_NEEDS" ;;
  production:1) STEPS=("${PRODUCTION_STEPS[@]}");       NEEDS_PAIRS="$PRODUCTION_NEEDS" ;;
  production:2) STEPS=("${PRODUCTION_PASS2_STEPS[@]}"); NEEDS_PAIRS="$PRODUCTION_PASS2_NEEDS" ;;
  production:3) STEPS=("${PRODUCTION_PASS3_STEPS[@]}"); NEEDS_PAIRS="$PRODUCTION_PASS3_NEEDS" ;;
esac
declare -A NEEDS=()
for pair in $NEEDS_PAIRS; do
  NEEDS["${pair%%:*}"]="${NEEDS[${pair%%:*}]:+${NEEDS[${pair%%:*}]} }${pair#*:}"
done

# One record into the step fields.
S_ID=""; S_KIND=""; S_STDIN=""; S_PROOF=""; S_CMD=""; S_FALLBACK=""; S_MAIL=0; S_HEAVY=0; S_FRESH=0
parse_step() {
  IFS='|' read -r S_ID S_KIND S_STDIN S_PROOF S_CMD S_FALLBACK <<<"$1"
  S_MAIL=0; S_HEAVY=0; S_FRESH=0
  if [[ "$S_KIND" == *+fresh* ]]; then S_KIND="${S_KIND/+fresh/}"; S_FRESH=1; fi
  if [[ "$S_KIND" == *+heavy* ]]; then S_KIND="${S_KIND/+heavy/}"; S_HEAVY=1; fi
  if [[ "$S_KIND" == *+mail ]]; then S_KIND="${S_KIND%+mail}"; S_MAIL=1; fi
}

# A heavy step (a host rebuild, a restore, a fresh instance's bootstrap) starts
# only on a host with CPU burst capacity in hand and no critical alarm firing,
# and is followed by a read that its own expected alarms have cleared. A
# Lightsail host with its burst spent runs at baseline CPU, where a heavy step
# crawls, times out and fails; and an alarm fired during a long run is only
# email unless the run stops on it.
# A fresh instance's bootstrap also lets the backup alarms through before it
# and waits longer after it, for the reason the header gives under "+fresh".
health_before() {
  printf 'scripts/check-env-health.sh --target %s --allow-site-down' "$TARGET"
  (( S_FRESH )) && printf ' --fresh-instance'
  return 0
}
health_after() {
  local minutes=10
  (( S_FRESH )) && minutes=25
  printf 'scripts/check-env-health.sh --target %s --alarms-only --wait-minutes %s' "$TARGET" "$minutes"
}
# The alarms a heavy step is expected to trip are muted for it, so the one that
# matters is not buried in their mail. Every way the run ends lifts it, an
# interrupt included; it also ends on its own after four hours, longer than the
# longest heavy step yet seen (a fresh instance's bootstrap at baseline CPU ran
# two), so only a run killed outright leaves it standing that long. A mute that
# cannot be made is a warning.
mute_cmd()   { printf 'scripts/mute-expected-alarms.sh --target %s --minutes 240' "$TARGET"; }
unmute_cmd() { printf 'scripts/mute-expected-alarms.sh --target %s --clear' "$TARGET"; }
HEAVY_MUTED=0
# run_aside <command>: a child whose failure is this run's warning, not its stop.
run_aside() {
  local report rc=0
  resolve_command "$1"
  report="$(new_report)"
  run_child tty "$report" "" "${CMD_WORDS[@]}" || rc=$?
  if (( rc == 0 )); then hand_on "$report"; else hand_on "$report" warn; cr_warn "${1} exited ${rc}"; fi
  rm -f -- "$report"
}
unmute_if_muted() {
  (( HEAVY_MUTED )) || return 0
  HEAVY_MUTED=0
  run_aside "$(unmute_cmd)"
}

# The resume command a stop prints, carrying the run's own --to-step so a
# resumed stretch ends where it was meant to.
resume_line() {
  local pass_flag=""
  (( PASS == 1 )) || pass_flag=" --pass ${PASS}"
  echo "  < <credential file> bash scripts/production-readiness-sitting.sh --target ${TARGET}${pass_flag} --from-step $1${TO_STEP:+ --to-step ${TO_STEP}}"
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
  echo "The ${TARGET} pass ${PASS}, in order (nothing is run, read or written):"
  for (( i = FIRST; i <= LAST; i++ )); do
    parse_step "${STEPS[$i]}"
    kind="$S_KIND"; (( S_HEAVY )) && kind+="+heavy"; (( S_FRESH )) && kind+="+fresh"; (( S_MAIL )) && kind+="+mail"
    (( S_HEAVY )) && printf '  %-5s %-9s %s\n' "" "before" "$(health_before)" "" "mute" "$(mute_cmd)"
    case "$S_KIND" in
      ask|blocked) printf '  %-5s %-9s %s\n' "$S_ID" "$kind" "$S_CMD" ;;
      *) printf '  %-5s %-9s %s%s\n' "$S_ID" "$kind" "$([[ "$S_STDIN" == cred ]] && echo '[password on stdin] ' || true)" "$S_CMD" ;;
    esac
    (( S_HEAVY )) && printf '  %-5s %-9s %s\n' "" "after" "$(health_after)" "" "unmute" "$(unmute_cmd)"
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
# A run that met an error is a failure whatever else it left pending, so a
# caller branching on "pending" never carries on past one.
sitting_verdict() {
  if [[ -n "$SITTING_VERDICT" ]] && ! { (( $1 > 0 )) && [[ "$SITTING_VERDICT" == PENDING* ]]; }; then
    printf '%s' "$SITTING_VERDICT"
  else
    printf '%s' "$3"
  fi
}
# The steps this run passed over, each a reason the pass is not done.
BLOCKED=(); SKIPPED=(); DEFERRED=()
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
# Every row names the commit it ran at, so a run needs one to name.
if [[ "$MODE" == run ]] && ! git -C "$ROOT" --no-optional-locks rev-parse --verify -q HEAD >/dev/null 2>&1; then
  cr_die "${ROOT} is not a git checkout with a commit, so no row could name the code it ran"
fi

SCRATCH="$(mktemp -d)"
cr_cleanup rm -rf -- "$SCRATCH"

# One run at a time writes the cutover log, whichever target it runs: two runs
# at once interleave their steps (a second run once started p14c and p15a while
# the first was inside p15a) and rewrite the log over each other's rows. The
# lock is a directory, made atomically, holding the owner's process id; a lock
# whose process is gone (a run killed outright) is taken over. A listing or a
# status read writes nothing and takes no lock.
if [[ "$MODE" == run ]]; then
  LOCK_DIR="${TMPDIR:-/tmp}/footbag-sitting-$(readlink -f -- "$LOG" | sha256sum | cut -c1-16).lock"
  if ! mkdir -- "$LOCK_DIR" 2>/dev/null; then
    holder=""
    [[ -r "${LOCK_DIR}/pid" ]] && holder="$(<"${LOCK_DIR}/pid")"
    if [[ "$holder" =~ ^[0-9]+$ ]] && kill -0 "$holder" 2>/dev/null; then
      cr_die "another sitting run (process ${holder}) is writing ${LOG}; wait for it to end, or stop it, before starting this one"
    fi
    echo "NOTE: taking over the run lock of a sitting run that is no longer running (${holder:-no process recorded})." >&2
    rm -rf -- "$LOCK_DIR"
    mkdir -- "$LOCK_DIR" || cr_die "could not take the cutover log's run lock at ${LOCK_DIR}"
  fi
  printf '%s\n' "$$" > "${LOCK_DIR}/pid"
  cr_cleanup rm -rf -- "$LOCK_DIR"
fi

# ── The log ──────────────────────────────────────────────────────────────────
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# A cell: no control characters, no table break, at most 300 characters, room
# for the row's commit prefix and the step's own notes after it.
cell() {
  local s
  s="$(printf '%s' "$1" | tr -d '\000-\037\177')"
  s="${s:0:300}"
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

# ── What a step runs ─────────────────────────────────────────────────────────
# watched_paths <command>: fills WATCHED with the pathspecs holding the code a
# step's command runs, read from the tree as it stands. For a script: the
# script, its own halves (scripts/internal/<stem>*), and every script under
# scripts, scripts/lib or scripts/internal, or deploy_to_aws.sh, that it
# names, and so on through each file so named, so a script a step hands off
# to (the bootstrap's restore, deploy and agent install) is watched as surely
# as one it sources. A name counts whether it is sourced, sent to a host or shipped, so
# a remote half a script sends is traced as surely as a library it sources.
# Host configuration comes in only when a traced file refers to it:
# ops/tool-versions.env for "tool-versions", ops/systemd for "ops/systemd",
# all of ops for a shipped "ops/***". The trace fails closed: a traced file
# that sources what no name in it spells (a variable, a glob), or a file that
# cannot be read, brings in all of scripts/lib and ops. The deploy watches its
# own scripts, their halves and the container build, and traces from each of
# them. A command naming none of these watches nothing, and WATCHED is empty.
declare -A TRACE_NAMES=() TRACE_FILE=()
TRACE_LOADED=0
trace_load() {
  (( TRACE_LOADED )) && return 0
  local f
  for f in "${ROOT}"/scripts/*.sh "${ROOT}"/scripts/lib/*.sh "${ROOT}"/scripts/internal/* "${ROOT}"/deploy_to_aws.sh; do
    [[ -f "$f" ]] || continue
    TRACE_NAMES["${f##*/}"]+="${TRACE_NAMES[${f##*/}]:+ }${f#"${ROOT}"/}"
  done
  TRACE_LOADED=1
}
# trace_file <path>: sets TRACE_OUT, read once per file and then from memory,
# to the words of the file that could be names, then a line per flag: F-all
# for a source line that names no file, F-tool, F-systemd and F-ops for the
# host configuration it refers to.
TRACE_OUT=""
trace_file() {
  if [[ -z "${TRACE_FILE[$1]+set}" ]]; then
    if [[ -f "${ROOT}/$1" && -r "${ROOT}/$1" ]]; then
      TRACE_FILE["$1"]="$(awk '
        index($0, "tool-versions") { f["F-tool"] = 1 }
        index($0, "ops/systemd") { f["F-systemd"] = 1 }
        index($0, "ops/***") { f["F-ops"] = 1 }
        $0 !~ /^[[:space:]]*#/ {
          # A source command, where a command starts, names its file when a
          # word ending in .sh or .env follows it on the line and its first
          # word holds no glob. The word "source" in prose or as an argument
          # is not a command, and is not read as one.
          line = $0
          while (match(line, /(^|[;&|({]|(^|[^A-Za-z0-9_])(then|do|else))[[:space:]]*(source|\.)[[:space:]]+/)) {
            rest = substr(line, RSTART + RLENGTH)
            if (substr(line, RSTART, RLENGTH) ~ /\.[[:space:]]+$/ && rest !~ /^(["$~]|\/[^\/]|\.\.?\/)/) { line = rest; continue }
            if (rest !~ /[A-Za-z0-9_-]\.(sh|env)/ || rest ~ /^[^[:space:]]*\*/) f["F-all"] = 1
            line = rest
          }
        }
        { n = split($0, a, /[^A-Za-z0-9_.-]+/); for (i = 1; i <= n; i++) if (a[i] ~ /\./) w[a[i]] = 1 }
        END { for (k in w) print k; for (k in f) print k }' "${ROOT}/$1")" || TRACE_FILE["$1"]="F-all"
    else
      TRACE_FILE["$1"]="F-all"
    fi
  fi
  TRACE_OUT="${TRACE_FILE[$1]}"
}
WATCHED=()
watched_paths() {
  local w stem f tok i=0 all=0 tool=0 systemd=0 ops=0
  local -a queue=()
  local -A seen=() listed=()
  WATCHED=()
  trace_load
  for w in $1; do
    case "$w" in
      deploy_to_aws.sh)
        WATCHED+=(deploy_to_aws.sh ':(glob)scripts/deploy-*.sh' ':(glob)scripts/internal/deploy-*' docker)
        queue+=(deploy_to_aws.sh)
        for f in "${ROOT}"/scripts/deploy-*.sh "${ROOT}"/scripts/internal/deploy-*; do
          [[ -f "$f" ]] && queue+=("${f#"${ROOT}"/}")
        done ;;
      scripts/*.sh|legacy_data/*.sh)
        stem="${w##*/}"; stem="${stem%.sh}"
        WATCHED+=("$w" ":(glob)scripts/internal/${stem}*")
        queue+=("$w")
        for f in "${ROOT}/scripts/internal/${stem}"*; do
          [[ -f "$f" ]] && queue+=("${f#"${ROOT}"/}")
        done ;;
      # npm run test:deployed runs scripts/test-deployed.sh over the suite.
      test:deployed)
        WATCHED+=(tests/e2e/deployed scripts/test-deployed.sh)
        queue+=(scripts/test-deployed.sh) ;;
    esac
  done
  while (( i < ${#queue[@]} )); do
    f="${queue[$i]}"; i=$(( i + 1 ))
    [[ -n "${seen[$f]:-}" ]] && continue
    seen["$f"]=1
    trace_file "$f"
    while IFS= read -r tok; do
      case "$tok" in
        F-all) all=1 ;;
        F-tool) tool=1 ;;
        F-systemd) systemd=1 ;;
        F-ops) ops=1 ;;
        '') ;;
        *)
          [[ -n "${TRACE_NAMES[$tok]:-}" ]] || continue
          for w in ${TRACE_NAMES[$tok]}; do
            [[ -n "${listed[$w]:-}" ]] && continue
            listed["$w"]=1
            WATCHED+=("$w"); queue+=("$w")
          done ;;
      esac
    done <<<"$TRACE_OUT"
  done
  (( ${#WATCHED[@]} )) || return 0
  if (( all )); then WATCHED+=(scripts/lib ops); return 0; fi
  if (( ops )); then WATCHED+=(ops)
  else
    (( tool )) && WATCHED+=(ops/tool-versions.env)
    (( systemd )) && WATCHED+=(ops/systemd)
  fi
  return 0
}

# Which code a row was written by: the commit, how many paths differ from it,
# and a fingerprint of those differences. The deploy ships the working tree, so
# a commit alone does not name the code that ran; the fingerprint covers every
# tracked change and every untracked, unignored file by content. Both are taken
# over what the step runs (WATCHED), so a stray file elsewhere in the tree
# neither counts nor moves the fingerprint, and such a row says so with
# "(what it runs)" after the fingerprint; a step that runs no traced code is
# taken over the whole tree, as every row once was, and carries no mark. Read
# with no optional locks, so a row never contends with the operator's own git
# work. Sets ROW_CODE; a read that fails says so in the row and in the report,
# and never stops the run, since the row still records what happened.
ROW_CODE=""
# tree_fingerprint [<pathspec>...]: over those paths, or the whole tree.
tree_fingerprint() {
  local f
  local -a scope=()
  (( $# )) && scope=(-- "$@")
  {
    git -C "$ROOT" --no-optional-locks diff HEAD --binary "${scope[@]}" || return 1
    git -C "$ROOT" --no-optional-locks ls-files --others --exclude-standard -z "${scope[@]}" || return 1
    while IFS= read -r -d '' f; do
      printf '%s\n' "$f"
      sha256sum < "${ROOT}/${f}" || return 1
    done < <(git -C "$ROOT" --no-optional-locks ls-files --others --exclude-standard -z "${scope[@]}")
  } | sha256sum | cut -c1-12
}
row_code() {
  local head changed fp mark=""
  local -a scope=()
  watched_paths "$1"
  if (( ${#WATCHED[@]} )); then scope=(-- "${WATCHED[@]}"); mark=" (what it runs)"; fi
  if head="$(git -C "$ROOT" --no-optional-locks rev-parse --verify -q HEAD 2>&1)" \
     && changed="$(git -C "$ROOT" --no-optional-locks status --porcelain "${scope[@]}" 2>&1)" \
     && fp="$(tree_fingerprint "${WATCHED[@]}" 2>&1)" && [[ "$fp" =~ ^[0-9a-f]{12}$ ]]; then
    ROW_CODE="at ${head}, $(grep -c . <<<"$changed" || [[ $? == 1 ]]) uncommitted, tree ${fp}${mark}"
  else
    ROW_CODE="commit unreadable"
    cr_warn "a log row could not record the commit it ran at, so that row names no code"
  fi
}

log_row() {
  local id="$1" started="$2" command="$3" result="$4" notes="${5:-}" finished row
  finished="$(now_utc)"
  FINISHED["$id"]="$finished"
  row_code "$command"
  # The Target column is the sitting's own target, which every lookup of a row
  # keys on. A step whose command names another environment (the staging
  # archive stage, the staging break-glass drill, run from the production list)
  # says so in its notes, so the row does not read as acting on this one.
  local cmd_target=""
  [[ " ${command} " =~ \ --target\ ([a-z]+)\  ]] && cmd_target="${BASH_REMATCH[1]}"
  [[ -n "$cmd_target" && "$cmd_target" != "$TARGET" ]] && notes="runs against ${cmd_target}${notes:+; ${notes}}"
  notes="${ROW_CODE}${notes:+; ${notes}}"
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

# The last row of this pass's section for a step: started, finished, result,
# command, notes. A heavy step refused for the host's health never started,
# so its row does not stand in front of an earlier ok row for the step; a
# step whose only rows are such refusals still reads failed.
log_last() {
  local id="$1"
  awk -v sec="$SECTION" '$0 == sec { on = 1; next } /^## / { on = 0 } on' "$LOG" \
    | sed 's/\\|/\x01/g' \
    | awk -F'|' -v t="$TARGET" -v id="$1" '{ for (i = 1; i <= NF; i++) gsub(/^ +| +$/, "", $i) }
        $4 == t && $5 == id {
          if ($7 == "failed (health)" && res ~ /^ok/) next
          res = $7; line = $2 "\t" $3 "\t" $7 "\t" $6 "\t" $8
        }
        END { if (line != "") print line }'
}

# row_lapsed <notes> <command>: sets LAPSE to why an ok row no longer proves
# its step, or to nothing when it still does. A row proves the code it ran,
# so it lapses when it names no commit, when its commit is not in this
# checkout, when what the step runs (WATCHED: its script, the halves and
# libraries traced from it, and the host configuration they refer to)
# changed since that commit, or when it ran on uncommitted changes the tree no
# longer holds. Those changes are fingerprinted over the scope the row was
# written with: what it runs for a row marked "(what it runs)", the whole
# tree for an older row, so an older row is judged as it always was.
LAPSE=""
row_lapsed() {
  local notes="$1" cmd="$2" sha count fp scoped now_head now_fp
  LAPSE=""
  if [[ ! "$notes" =~ ^at\ ([0-9a-f]{40}),\ ([0-9]+)\ uncommitted,\ tree\ ([0-9a-f]{12})( \(what it runs\))? ]]; then
    LAPSE='the row names no commit'
    return 0
  fi
  sha="${BASH_REMATCH[1]}"; count="${BASH_REMATCH[2]}"; fp="${BASH_REMATCH[3]}"; scoped="${BASH_REMATCH[4]}"
  if ! git -C "$ROOT" --no-optional-locks cat-file -e "${sha}^{commit}" 2>/dev/null; then
    LAPSE="its commit ${sha:0:8} is not in this checkout"
    return 0
  fi
  watched_paths "$cmd"
  if (( ${#WATCHED[@]} )) && ! git -C "$ROOT" --no-optional-locks diff --quiet "$sha" -- "${WATCHED[@]}"; then
    LAPSE="what it runs changed since ${sha:0:8}"
    return 0
  fi
  if (( count > 0 )); then
    now_head="$(git -C "$ROOT" --no-optional-locks rev-parse --verify -q HEAD)" || now_head=""
    if [[ -n "$scoped" ]]; then now_fp="$(tree_fingerprint "${WATCHED[@]}")" || now_fp=""
    else now_fp="$(tree_fingerprint)" || now_fp=""; fi
    if [[ "$now_head" != "$sha" || "$now_fp" != "$fp" ]]; then
      LAPSE="it ran on ${count} uncommitted change(s) the tree no longer holds"
      return 0
    fi
  fi
}

# The steps <id> needs that have no ok row in this pass's section, space-separated.
unmet_needs() {
  local need row unmet=""
  for need in ${NEEDS[$1]:-}; do
    row="$(log_last "$need")"
    [[ "$(cut -f3 <<<"$row")" == ok* ]] || unmet+="${unmet:+ }${need}"
  done
  printf '%s' "$unmet"
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
    unmet="$(unmet_needs "$S_ID")"
    if [[ "$S_KIND" == blocked ]]; then
      state="BLOCKED: ${S_CMD}"; pending=1
    elif [[ -n "$unmet" ]]; then
      state="SKIPPED (needs ${unmet})"; pending=1
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
    elif [[ "$r_result" == ok* ]] && row_lapsed "$(cut -f5 <<<"$row")" "$(cut -f4 <<<"$row")" && [[ -n "$LAPSE" ]]; then
      # The staging pass is not run again: a staging row whose code has
      # changed since, or that ran beside uncommitted changes since gone,
      # still stands as the record of that pass, and says which. A row naming
      # no commit, or a commit this checkout lacks, names no known code, so it
      # does not.
      if [[ "$TARGET" == staging && "$LAPSE" == "what it runs changed since "* ]]; then
        state="RECORDED ok at ${r_start}; code changed since ${LAPSE##* }"
      elif [[ "$TARGET" == staging && "$LAPSE" == "it ran on "* ]]; then
        state="RECORDED ok at ${r_start}; ${LAPSE}"
      else
        state="LAPSED (${LAPSE}): recorded ok at ${r_start}, run it again"; pending=1
      fi
    elif [[ "$r_result" == "deferred (not due until "* ]]; then
      state="DEFERRED (${r_result#deferred (}: run it with --from-step ${S_ID} once due"; pending=1
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
# Cleanups run newest first: the interrupted step's row, then the mute lifted,
# then the run lock released.
cr_cleanup unmute_if_muted
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
  unmute_if_muted
  parse_step "${STEPS[$i]}"
  # The offer reads other steps, so this step is parsed again after it.
  offer_gate_off
  parse_step "${STEPS[$i]}"
  echo "" >&2
  echo "Stopped at ${S_ID}. Resume with:" >&2
  resume_line "$S_ID" >&2
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

  unmet="$(unmet_needs "$S_ID")"
  if [[ -n "$unmet" ]]; then
    log_row "$S_ID" "$started" "-" "skipped (needs ${unmet})" "$S_CMD"
    SKIPPED+=("$S_ID")
    cr_unproved "skipped, because ${unmet} has not been done: ${S_ID}"
    echo "Skipped: ${S_ID} stands on ${unmet}, which has not been done."
    CURRENT=""
    continue
  fi

  if (( S_MAIL )) && ! mail_confirmed; then
    log_row "$S_ID" "$started" "$S_CMD" "deferred (alarm mail not confirmed)"
    DEFERRED+=("$S_ID")
    cr_unproved "deferred until alarm mail is confirmed: ${S_ID}"
    echo "Deferred: ${S_ID} needs a confirmed alarm-mail subscription; run it with --from-step once confirmed."
    CURRENT=""
    continue
  fi

  case "$S_KIND" in
    blocked)
      # Recorded and passed over: the steps after it that stand on nothing it
      # does still run, and the run ends pending, so the pass cannot read as
      # done while this is outstanding.
      log_row "$S_ID" "$started" "-" blocked "$S_CMD"
      BLOCKED+=("$S_ID")
      cr_unproved "blocked: ${S_ID}: ${S_CMD}"
      echo "Blocked: ${S_CMD}" >&2
      CURRENT=""
      continue
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
      # More than an hour off, the step is not waited for at the terminal: it
      # is recorded as deferred, as a step awaiting alarm mail is, and the run
      # carries on and ends pending.
      if (( not_before - $(date -u +%s) > 3600 )); then
        due="$(date -u -d "@${not_before}" '+%H:%M:%SZ %Y-%m-%d')"
        log_row "$S_ID" "$started" "$S_CMD" "deferred (not due until ${due})"
        DEFERRED+=("$S_ID")
        cr_unproved "deferred until ${due} (${minutes} minutes after ${ref}): ${S_ID}"
        echo "Deferred: ${S_ID} runs no sooner than ${due}; run it then with --from-step ${S_ID}."
        CURRENT=""
        continue
      fi
      while (( $(date -u +%s) < not_before )); do
        echo "  ${S_ID} runs no sooner than $(date -u -d "@${not_before}" +%H:%M:%SZ) (${minutes} minutes after ${ref}); Ctrl-C and --from-step ${S_ID} also work."
        sleep "$POLL_SECS"
      done
    else
      stop_at "$i" STOPPED "cannot run yet: step ${ref} has no finish recorded"
    fi
  fi

  if (( S_HEAVY )); then
    resolve_command "$(health_before)"
    hreport="$(new_report)"
    hrc=0; run_child tty "$hreport" "" "${CMD_WORDS[@]}" || hrc=$?
    if (( hrc != 0 )); then
      said="$(first_error "$hreport")"
      hand_on "$hreport"
      rm -f -- "$hreport"
      log_row "$S_ID" "$started" "$(health_before)" "failed (health)" "${said:-exit ${hrc}}"
      stop_at "$i" STOPPED "was not started: the ${TARGET} host is not fit for a heavy step (${said:-its health read exited ${hrc}})"
    fi
    hand_on "$hreport"
    rm -f -- "$hreport"
    # Marked before the call, so an interrupt while the mute is being made
    # still lifts it on the way out.
    HEAVY_MUTED=1
    run_aside "$(mute_cmd)"
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
      DEFERRED+=("$S_ID")
      cr_unproved "deferred until alarm mail is confirmed: ${S_ID}"
      echo "Deferred: ${S_ID} left a subscription pending; run it again with --from-step ${S_ID} once the emails are to hand."
      CURRENT=""
      continue
    fi
  fi
  if [[ "$S_PROOF" == exit=* ]]; then
    [[ ",${S_PROOF#exit=}," == *",${rc},"* ]] || failed="exit ${rc}"
  else
    (( rc == 0 )) || failed="exit ${rc}"
  fi

  if [[ -z "$failed" ]]; then
    case "$S_PROOF" in
      fact=*)
        grep -qxF -- $'FACT\t'"${S_PROOF#fact=}" "$report" || failed="no ${S_PROOF#fact=} fact: the step changed nothing it can prove" ;;
      stdout=*)
        # One or more patterns joined by " && ", each of which must match a
        # line: a state spread over several lines is proved line by line. A
        # pattern grep cannot read fails the step rather than passing it.
        rest="${S_PROOF#stdout=}"
        while [[ -n "$rest" && -z "$failed" ]]; do
          one="${rest%% && *}"
          if [[ "$one" == "$rest" ]]; then rest=""; else rest="${rest#* && }"; fi
          grep -qE -- "$one" "$out" || failed="its output did not match ${one}"
        done ;;
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

  # The step is done and recorded; a critical alarm still firing after it, once
  # its own expected alarms have had time to clear, stops the run before the
  # next step.
  if (( S_HEAVY )); then
    done_id="$S_ID"
    resolve_command "$(health_after)"
    hreport="$(new_report)"
    hrc=0; run_child tty "$hreport" "" "${CMD_WORDS[@]}" || hrc=$?
    hand_on "$hreport"
    rm -f -- "$hreport"
    unmute_if_muted
    if (( hrc != 0 )); then
      if (( i < LAST )); then
        stop_at $(( i + 1 )) STOPPED "was not started: a critical ${TARGET} alarm is still in ALARM after ${done_id}"
      fi
      cr_error "a critical ${TARGET} alarm is still in ALARM after ${done_id}"
    fi
  fi
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
# Everything that ran finished; what was passed over makes the run pending, and
# any error makes it a failure instead.
if (( ${#CR_ERRORS[@]} == 0 && ${#BLOCKED[@]} + ${#SKIPPED[@]} + ${#DEFERRED[@]} > 0 )); then
  pending=()
  (( ${#BLOCKED[@]} )) && pending+=("blocked ${BLOCKED[*]}")
  (( ${#SKIPPED[@]} )) && pending+=("skipped ${SKIPPED[*]}")
  (( ${#DEFERRED[@]} )) && pending+=("deferred ${DEFERRED[*]}")
  SITTING_VERDICT="PENDING: ${pending[0]}"
  for part in "${pending[@]:1}"; do SITTING_VERDICT+="; ${part}"; done
  cr_finish_with 3 PENDING
fi
cr_finish
