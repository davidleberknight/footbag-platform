# Footbag Website Modernization Project -- Background Jobs

**Document Purpose:**

This document is the Source of Truth for the platform's background jobs: the automated processes that act as the system actor, running on a clock, continuously, in response to a system event, or on the host and its storage. Human users (visitors, members, administrators) are covered by the User Stories, and system administrators, the technical staff who operate the platform, by the private DevOps guide. Background jobs are not user stories, but they exist so that the success criteria of the user stories are met, and each one is written here in the same story form.

The shared technical approach (the job registry, the scheduler, run records and their pruning, the missed-run heartbeat, and the catch-up rule) is the Background Jobs design decision. This document states what each job must do; that decision states how every job is run.

## Table of Contents

- [Catalogue](#catalogue)
- [Story Form](#story-form)
- [Scheduled Jobs](#scheduled-jobs)
    - [SYS_Check_Active_Player_Expiry](#sys_check_active_player_expiry)
    - [SYS_Detect_Admin_Loss](#sys_detect_admin_loss)
    - [SYS_Cleanup_Soft_Deleted_Records](#sys_cleanup_soft_deleted_records)
    - [SYS_Cleanup_Expired_Tokens](#sys_cleanup_expired_tokens)
    - [SYS_Delete_Unfinished_Accounts](#sys_delete_unfinished_accounts)
    - [SYS_Rebuild_Hashtag_Stats](#sys_rebuild_hashtag_stats)
    - [SYS_Admin_Queue_Digest](#sys_admin_queue_digest)
    - [SYS_Admin_Queue_Escalation](#sys_admin_queue_escalation)
    - [SYS_Reconcile_Payments_Nightly](#sys_reconcile_payments_nightly)
    - [SYS_Reconciliation_Digest](#sys_reconciliation_digest)
    - [SYS_Purge_Reconciliation_Issues](#sys_purge_reconciliation_issues)
    - [SYS_Purge_Audit_Entries](#sys_purge_audit_entries)
    - [SYS_Reclaim_Expired_Media_Jobs](#sys_reclaim_expired_media_jobs)
    - [SYS_Open_Vote](#sys_open_vote)
    - [SYS_Close_Vote](#sys_close_vote)
- [Continuous Jobs](#continuous-jobs)
    - [SYS_Send_Email](#sys_send_email)
    - [SYS_Handle_SES_Bounce_And_Complaint_Feed](#sys_handle_ses_bounce_and_complaint_feed)
- [Event-driven Jobs](#event-driven-jobs)
    - [SYS_Handle_Stripe_Webhooks](#sys_handle_stripe_webhooks)
    - [SYS_Process_One_Time_Payments](#sys_process_one_time_payments)
    - [SYS_Process_Recurring_Donations](#sys_process_recurring_donations)
- [Host and Infrastructure Jobs](#host-and-infrastructure-jobs)
    - [SYS_Continuous_Database_Backup](#sys_continuous_database_backup)
    - [SYS_Host_Snapshots](#sys_host_snapshots)
    - [SYS_Cross_Region_Replication](#sys_cross_region_replication)
    - [SYS_Storage_Lifecycle_Expiry](#sys_storage_lifecycle_expiry)
- [Standing Rules](#standing-rules)
    - [SYS_Freestyle_Content_Source_Of_Truth](#sys_freestyle_content_source_of_truth)

## Catalogue

Every background job the platform runs. A scheduled job runs from the job registry; "the heartbeat alarm" is the one missed-run alarm the scheduler's heartbeat feeds, and "the error alarm" is the application error alarm every job failure raises. A job's run rows are kept 400 days unless its row says otherwise, always keeping its last success.

| Story | What it does | Cadence | Missed-run grace | Failure alarm | Missed-run alarm | Configuration | Run record |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SYS_Check_Active_Player_Expiry | Sends Active Player reminders and ends lapsed Active Player status | Daily | 2 hours | Error alarm | Heartbeat alarm | `active_player_expiry_reminder_days_1`, `active_player_expiry_reminder_days_2` | Job-run row |
| SYS_Detect_Admin_Loss | Raises the recruit-a-replacement alert for a lost administrator | Daily | 2 hours | Error alarm | Heartbeat alarm | `admin_inactivity_alert_days` | Job-run row |
| SYS_Cleanup_Soft_Deleted_Records | Purges personal data past its grace period and retention windows | Daily | 2 hours | Error alarm | Heartbeat alarm | `member_cleanup_grace_days`, `deceased_cleanup_grace_days`, `payment_retention_days`, `outbox_retention_days` | Job-run row |
| SYS_Cleanup_Expired_Tokens | Deletes spent and expired account tokens | Daily | 2 hours | Error alarm | Heartbeat alarm | `token_cleanup_threshold_days` | Job-run row |
| SYS_Delete_Unfinished_Accounts | Deletes a prospective member's account left unfinished | Daily | 2 hours | Error alarm | Heartbeat alarm | `unfinished_account_cleanup_days` | Job-run row |
| SYS_Rebuild_Hashtag_Stats | Recomputes hashtag usage counts | Daily | 2 hours | Error alarm | Heartbeat alarm | None | Job-run row |
| SYS_Admin_Queue_Digest | Mails each administrator the open routine work-queue items | Every `admin_queue_digest_interval_days` | 15 minutes | Error alarm | Heartbeat alarm | `admin_queue_digest_interval_days` | Job-run row |
| SYS_Admin_Queue_Escalation | Escalates routine work-queue items left unclaimed | Daily | 2 hours | Error alarm | Heartbeat alarm | `admin_queue_stale_escalation_days` | Job-run row |
| SYS_Reconcile_Payments_Nightly | Compares local payment records with the payment provider | Daily | 2 hours | Error alarm | Heartbeat alarm | `reconciliation_window_days`, `reconciliation_grace_minutes`, `reconciliation_expiry_days` | Job-run row, kept for `payment_retention_days` |
| SYS_Reconciliation_Digest | Mails the reconciliation summary to the IFPA treasurer contact | Every `reconciliation_summary_interval_days` | 15 minutes | Error alarm | Heartbeat alarm | `reconciliation_summary_interval_days` | Job-run row |
| SYS_Purge_Reconciliation_Issues | Deletes resolved reconciliation issues past their expiry | Daily | 2 hours | Error alarm | Heartbeat alarm | None (each issue's expiry is set when it is raised) | Job-run row |
| SYS_Purge_Audit_Entries | Deletes audit rows past the audit retention period | Daily | 2 hours | Error alarm | Heartbeat alarm | `audit_retention_days` | Job-run row |
| SYS_Reclaim_Expired_Media_Jobs | Reclaims media processing jobs whose lease expired | A quarter of the media-job lease, run on the five-minute tick | 15 minutes | Error alarm | Heartbeat alarm | The media-job lease (deploy-time setting) | Job-run row, kept 30 days |
| SYS_Send_Email | Drains the email outbox | Continuous | Not applicable | Error alarm | Outbox backlog alarm | `outbox_poll_interval_seconds` and the outbox pacing keys | None (continuous) |
| SYS_Handle_SES_Bounce_And_Complaint_Feed | Reads the bounce, complaint and platform-alarm feeds | Continuous | Not applicable | Error alarm; dead-letter alarms on both queues | Unread-feed alarm on the bounce and complaint queue; the heartbeat alarm for a dead worker | None | None (continuous) |
| SYS_Handle_Stripe_Webhooks | Validates and processes payment-provider events | On each event | Not applicable | Webhook delivery failure alarm | None (the provider redelivers) | None | Processed-event record |
| SYS_Process_One_Time_Payments | Settles one-time payments from provider events | On each event | Not applicable | Webhook delivery failure alarm | None (the provider redelivers) | None | Processed-event record |
| SYS_Process_Recurring_Donations | Records recurring donation billing from provider events | On each event | Not applicable | Webhook delivery failure alarm | None (the provider redelivers) | None | Processed-event record |
| SYS_Continuous_Database_Backup | Snapshots the database to the primary backup bucket | Host timer, every 5 minutes | 15 minutes | Consecutive backup failure alarm | Backup age alarm | Host timer | Backup metrics |
| SYS_Host_Snapshots | Snapshots the whole host | Daily, by the hosting provider | 2 hours | None | `verify-host-snapshots.sh` check | Terraform | The provider's snapshot list |
| SYS_Cross_Region_Replication | Copies backups and media to a second region | Continuous, by the object store | Not applicable | Replication failure alarm | Replication backlog alarm | Terraform | None (no platform code) |
| SYS_Storage_Lifecycle_Expiry | Ages out stored objects by their lifecycle rules | Daily, by the object store | Not applicable | None | None | Terraform | None (no platform code) |

## Story Form

Every background job is written in the same form: Access names the kind of process and the role it runs under, Story says what it does and why, and Success Criteria say what must hold. An Operation block closes each one:

- Cadence: when it runs.
- Configuration: the keys it reads and their defaults.
- Catch-up: what happens after a missed run, a restart, or a redelivered event.
- Run record: what records each run.
- Failure alarm: what fires when it fails.
- Missed-run alarm: what fires when it stops running.
- Audit trail: the audit rows it writes about the records it changes. A job writes no audit row about its own run; its trail is its run record.
- Retention: how long its run records are kept.

## Scheduled Jobs

Scheduled jobs run from the job registry in the worker. They are the only jobs the scheduler runs, and each records every run on its job-run row.

### SYS_Check_Active_Player_Expiry

Access: This scheduled process runs under the system role.

Story: The system checks Active Player expiry every day so that Tier 0 members' temporary Tier 1 benefits and Official IFPA Roster inclusion stay in sync with the IFPA membership rules.

Success Criteria:

- The job evaluates Active Player expiry dates for Tier 0 members, using two configured pre-expiry reminder offsets (for example T-30 and T-7), plus a built-in day-of expiry notification (T+0).
- A reminder offset is due from its day until the expiry date, so a pass that did not run on the offset's exact day still sends it on the next pass. When both offsets have opened, only the more urgent one is sent. No reminder is sent on or after the expiry date; that moment carries the day-of notice instead. A due reminder that has not already been sent for that offset is enqueued as an Active Player expiry reminder email through the notification outbox.
- Reminder emails describe Active Player expiry and ways to regain Active Player status (later qualifying event attendance, or a vouch from a Tier 2 or Tier 3 member). They do not describe the one-time first-club-join grant, which reaches only a member who has never previously been an Active Player and so can never apply to anyone receiving one of these reminders. They must not describe membership-tier expiry or renewal. A reminder is never sent more than once per expiry and configured offset.
- Reminders are not sent for members whose Active Player status has already been extended past the offset window, and the job respects member email preferences and unsubscribes for the relevant reminder category.
- Membership tiers are never downgraded by this job because membership tiers are lifetime.
- When a Tier 0 member's Active Player expiry date has passed, the member remains Tier 0 and Active Player status is marked expired or treated as no longer current. Expired Active Player status ends Tier 1 benefits and Official IFPA Roster inclusion.
- The job does not affect Tier 1, Tier 2, or Tier 3 members because Active Player applies only to Tier 0.

Operation:

- Cadence: daily.
- Configuration: `active_player_expiry_reminder_days_1` (default 30) and `active_player_expiry_reminder_days_2` (default 7).
- Catch-up: the first pass after a missed day sends every reminder still due and not yet sent, and ends every lapsed status; the day-of notice rides on the expiry being written, so a late pass still sends it once.
- Run record: its job-run row, carrying the counts of candidates scanned, reminders enqueued, expiries applied, and each reason a reminder was skipped.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: each Active Player expiry writes an audit entry including member ID, previous Active Player expiry date, reason `active_player_expired`, and the entry's own timestamp.
- Retention: 400 days.

### SYS_Detect_Admin_Loss

Access: This scheduled process runs under the system role.

Story: The system notices when the platform loses an administrator and prompts the remaining administrators to recruit a replacement, so that administrative capacity is renewed by a deliberate decision rather than eroding until only the break-glass re-bootstrap path remains.

Success Criteria:

- An administrator counts as lost in any of these cases: their admin role is revoked; their member account is soft-deleted or marked deceased while they still hold the role; or they have not signed in within an administrator-configurable inactivity window (default 180 days, keyed by `admin_inactivity_alert_days`), measured from their last sign-in, or from account creation for an administrator who has yet to sign in.
- A revocation raises the alert immediately, in the same transaction as the role change. The other cases are found by a daily sweep, so a loss whose triggering action has no in-app surface is still caught.
- Each loss raises one open work-queue item in the system category, naming the lost administrator and the loss reason, and sends one email to the Admin mailing list asking the remaining administrators to recruit a new admin volunteer as soon as possible. The email carries the task type and the entity identifier, matching every other admin notification; the administrator's name and the loss reason are read on the queue card.
- The sweep is idempotent: once an item names that administrator, re-running it leaves that item as the single record, whether it is still open or has been dismissed. A dismissal settles the loss and keeps it settled, because the states the sweep reads outlive the alert. A sign-in after the dismissal starts the clock again, so an administrator who returns and is lost a second time is alerted afresh.
- Role changes stay deliberate human acts under A_Manage_Admin_Role. An inactivity finding is a prompt for the remaining administrators to act on, and the sweep's own writes are the queue item, its audit entry, and the notification.
- An administrator closes the item by dismissing it once a replacement is recruited or the loss is otherwise settled. The dismissal is audit-logged and is an internal record, so it emails no member.
- When no administrator able to sign in remains, every run logs that total loss at error level, so the operator alarm reaches the System Administrator who re-bootstraps the first administrator; the queue item and the Admin mailing list cannot, because only administrators read them.

Operation:

- Cadence: daily.
- Configuration: `admin_inactivity_alert_days` (default 180).
- Catch-up: the sweep reads current state, so the first pass after a missed day finds every loss the missed day would have.
- Run record: its job-run row, with the counts examined, raised and failed.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: each raise writes an audit entry identifying the lost administrator and the loss reason; a raise that fails writes an operational-failure audit row.
- Retention: 400 days.

### SYS_Cleanup_Soft_Deleted_Records

Access: This scheduled process runs under the system role to purge member records after their deletion grace period. Only admins can view or adjust its configuration and logs.

Story: The system anonymizes member records after the deletion grace period so that PII is removed while referential integrity and audit history are preserved.

Success Criteria:

- Member Cleanup (admin-configurable grace period default: 90 days, parameter key: member_cleanup_grace_days): After member_cleanup_grace_days days past deletedAt timestamp, the job performs the following selective operations. PII purge: credential and contact fields (email, phone, passwordHash) are set to NULL. The member row is retained as an anonymized record for referential integrity. For retained non-nullable identity/location fields, the application writes anonymized placeholder values where required by schema. HoF/BAP flagged members receive the same PII NULLing treatment; however, their display name, bio, honor badges (HoF, BAP), and event result history are preserved to honor community history.
- Deceased Member Cleanup (admin-configurable grace period, default 30 days, parameter key: `deceased_cleanup_grace_days`): a deceased member's contact data is cleared once the period has passed since the deceased mark, while historical contributions and honor data are kept; a member both deceased and soft-deleted takes the full purge.
- Photo Cleanup (zero grace period): no job concern required for this. No referential integrity concerns because photos are leaf nodes in data model. When member deletes account, member's photos are deleted immediately.
- Payment Record Cleanup (7-year compliance window, anonymize). This period satisfies financial compliance requirements while enabling GDPR data deletion. Enforced here: payment rows past the window keep the financial record and have their identifying fields cleared.
- Vote Ballot Preservation (7-year hold). Not a deletion schedule and not enforced by this job: the window states how long ballots must be held, and destroying IFPA vote records is a governance decision rather than an operator one.
- Audit Log Retention (7-year minimum, delete). Not enforced by this job: SYS_Purge_Audit_Entries deletes audit rows past their retention.
- Outbound Copy Cleanup (admin-configurable retention, default 90 days, parameter key: `outbox_retention_days`): an `outbox_emails` row is one message to one recipient, carrying that recipient's address and the rendered body. A delivered row is deleted once `outbox_retention_days` have passed since `sent_at`, the period being set by what the copy is for: bounce and complaint correlation and support questions about a specific delivery, both of which go stale within weeks. A dead-lettered row is deleted once the same period has passed since its last delivery attempt, because a failure no operator reviewed within a full retention window will not be reviewed later, and the recipient's address should not outlive the review. Rows still pending or retrying belong to the send worker, and a row parked for manual review is an unresolved question about whether a real person received the message; neither is removed by age.
- Broadcast Archive Preservation (indefinite): the per-send archive row for a mailing-list, event-participant, or announce send is retained indefinitely, holding the subject, body, sender, timestamp, and recipient count of what the platform broadcast in IFPA's name. The row names no recipient, so erasure has nothing in it to reach; the sender's member id is cleared when that member is erased, preserving the record while severing the person.
- Clubs are NEVER hard deleted (historical record preservation); instead they are archived.
- Events with result rows are never hard-deleted once official event-result rows exist for that event (historical record preservation).
- Events and clubs can be marked archived or inactive via admin actions but database records remain indefinitely. When an event organizer or co-leader deletes an account, leadership foreign keys continue to point to the retained/anonymized member record to preserve historical leadership. For non-HoF/BAP members, the display name may be anonymized to "Deleted Member" where required by schema/app policy; for HoF/BAP members, preserve displayName and bio per the deletion policy. Historical event results, participant lists, and club rosters remain intact for community record.

Operation:

- Cadence: daily.
- Configuration: `member_cleanup_grace_days` (default 90), `deceased_cleanup_grace_days` (default 30), `payment_retention_days` (default 2555), `outbox_retention_days` (default 90).
- Catch-up: every rule is a cutoff on age, so the first pass after a missed day handles everything that came due meanwhile.
- Run record: its job-run row carries a comprehensive summary: entity types processed (deleted members, deceased members, payments, outbound copies), counts per entity type (records eligible for cleanup, records anonymized, records preserved due to special rules, records skipped due to errors), and errors encountered with entity IDs and error messages.
- Failure alarm: the error alarm. A record the run fails on also writes an operational-failure audit row naming it, with the error's class.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: purging a member's personal data writes that member's audit row; a record the run fails on writes an operational-failure audit row (a failed member erasure, payment anonymization or outbound-copy deletion).
- Retention: 400 days.

### SYS_Cleanup_Expired_Tokens

Access: This scheduled process runs under the system role. Only admins can view its summary.

Story: The system deletes expired or consumed email verification and password reset token rows so that token tables remain small and old tokens cannot be reused.

Success Criteria:

- The job deletes token rows that are expired or consumed and older than a configured cleanup threshold (default: 7 days).
- Cleanup covers every token type, at least email verification tokens and password reset tokens.
- Each run reports the count of deleted rows by token type and the age of the oldest remaining token (if any).
- Cleanup is safe and idempotent (re-running does not affect correctness).

Operation:

- Cadence: daily.
- Configuration: `token_cleanup_threshold_days` (default 7).
- Catch-up: a cutoff on age, so the first pass after a missed day deletes everything that came due meanwhile.
- Run record: its job-run row, with the total deleted, the count by token type, and the oldest remaining token's age.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none; tokens are not governance records.
- Retention: 400 days.

### SYS_Delete_Unfinished_Accounts

Access: This scheduled process runs under the system role.

Story: The system deletes a prospective member's account left unfinished for the configured period, so that an account that never completed onboarding does not keep the person's personal data indefinitely.

Success Criteria:

- A prospective member is someone who registered and has not finished onboarding; they are not a member.
- An account whose onboarding was left unfinished for `unfinished_account_cleanup_days` (default 90) is deleted. The period is measured from the account's latest activity: its creation, any change to its own record, its last sign-in, its latest onboarding answer or its latest declared anchor. Idleness is re-read inside the deletion, so an account that finished onboarding or came back after the listing keeps every row.
- An account holding a row it should not (an audit row, a tier grant) is kept whole: the deletion is rolled back, counted as blocked, and logged at warn, because the row that blocked it is a defect to find.
- The deletion removes only the account's own rows. An unfinished account holds no shared row by construction: answers that reach beyond the account (a claim on a legacy record, a club affiliation) are held on its own onboarding task rows until onboarding completes.
- No administrator sees a prospective member, and the deletion writes no audit row about one.
- A member, someone who finished onboarding, is never deleted by this job.

Operation:

- Cadence: daily.
- Configuration: `unfinished_account_cleanup_days` (default 90).
- Catch-up: a cutoff on age, so the first pass after a missed day deletes every account that came due meanwhile.
- Run record: its job-run row, with the counts eligible, deleted, no longer idle, blocked and failed, and the ids of the blocked accounts, which the warn line also names.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none, because the audit log holds no row about a prospective member.
- Retention: 400 days.

### SYS_Rebuild_Hashtag_Stats

Access: This scheduled process runs under the system role.

Story: The system recomputes hashtag usage statistics daily so that member-facing pages can show fast, accurate counts for popular hashtags in real time. Hashtag usage can be sorted by popularity.

Success Criteria:

- The job recomputes aggregated hashtag usage counts from media, in one transaction.
- For each tag it records the usage count, the number of distinct members using it, and when it was last used.
- The stats are stored in a format that can be read quickly by the hashtag index on the browse landing and any "popular tags" UI elements.
- If the job fails, existing stats remain in place.

Operation:

- Cadence: daily.
- Configuration: none.
- Catch-up: a full rebuild, so any later pass makes the counts current.
- Run record: its job-run row, with the number of rows written; its run time and outcome are on the admin health page.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none.
- Retention: 400 days.

### SYS_Admin_Queue_Digest

Access: This scheduled process runs under the system role.

Story: The system mails each administrator a rollup of the open routine work-queue items, so that routine work is seen without an administrator having to open the queue every day.

Success Criteria:

- Each administrator subscribed to the admin-alerts list receives one digest listing the open routine work-queue items, leaving out items under another administrator's live claim; an administrator with nothing left to list gets no digest.
- The digest is sent on the interval an administrator configures, and never more often.

Operation:

- Cadence: every `admin_queue_digest_interval_days`, measured from the last successful digest.
- Configuration: `admin_queue_digest_interval_days` (default 1).
- Catch-up: due once the interval has passed since the last success, so a missed digest goes on the first pass after.
- Run record: its job-run row, with the administrators mailed, the messages sent, and the open routine items counted.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none; the outbox records each message.
- Retention: 400 days.

### SYS_Admin_Queue_Escalation

Access: This scheduled process runs under the system role.

Story: The system escalates a routine work-queue item left unclaimed too long, so that an item nobody has picked up is brought to every administrator's attention once.

Success Criteria:

- An open routine item older than `admin_queue_stale_escalation_days` that is unclaimed, or whose claim has gone stale, is escalated with one email to all administrators.
- Each item is escalated exactly once, however many passes find it.

Operation:

- Cadence: daily.
- Configuration: `admin_queue_stale_escalation_days` (default 3).
- Catch-up: the pass reads current state, so the first pass after a missed day escalates every item that came due.
- Run record: its job-run row, with the count escalated.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none; the outbox's per-item idempotency key records each escalation.
- Retention: 400 days.

### SYS_Reconcile_Payments_Nightly

Access: This nightly process runs under the system role to reconcile payments with external providers. Only admins can view its reports.

Story: The system reconciles local payment records against Stripe every night so that discrepancies are detected promptly across both one-time payments and recurring donation subscriptions.

Success Criteria:

The job runs in four passes. The window spans the configured number of days back, or back to the last successful run when that is older, so an outage longer than the configured span does not leave a period no later run ever examines again.

Pass 1; One-time payments: Compares local payment records (membership dues, event registrations, one-time donations) against Stripe PaymentIntent records for the reconciliation window. Discrepancies flagged: local records with no matching Stripe PaymentIntent, Stripe PaymentIntents with no matching local record, amount or status mismatches. A local record carrying no PaymentIntent reference is a checkout still in flight and is left alone until the provider's checkout session has had time to expire; past that it is flagged, because a checkout nobody completed and a settlement whose webhook was lost are indistinguishable locally and only one of them is free to ignore. Where the provider reports a settled PaymentIntent whose local record is still pending, the two are matched on the correlation key the platform stamped on the intent and the status disagreement is flagged: the provider creates the intent when the buyer pays, so the reference reaches the local record only on the settlement event and its absence is not evidence the money never moved.

Pass 2; Recurring donation subscriptions: Compares local donation subscription records against Stripe Subscription objects and their associated Invoice records. Discrepancies flagged: active local subscriptions with no matching active Stripe Subscription, Stripe Subscriptions with no matching local record, local subscription status out of sync with Stripe status (e.g., local shows active but Stripe shows canceled or past_due), Invoice charges recorded in Stripe but missing as local payment records, and renewal charges recorded locally for a different amount or in a different currency than the invoice the provider actually collected.

Pass 3; Unexpected duplicates: Looks for the same member charged the same amount for the same purpose twice in quick succession. This is the one class the platform's own guarantees hide rather than prevent: each attempt mints its own payment id and its own checkout session, so two rows each match a provider settlement exactly and compare clean in every other pass. It is reported as a question rather than a fault, because a second gift minutes after the first is legitimate, and nothing is reversed automatically.

Pass 4; Refunds: Compares refunds the provider recorded in the window against the local payment records they belong to. This pass exists because a refund leaves no trace anywhere else in the provider's ledger: it never moves the PaymentIntent off succeeded, so to every other pass a refunded payment and an unrefunded one are the same record, and a refund whose webhook was lost would be invisible permanently. Refunded amounts are summed per PaymentIntent and compared against the charge rather than merely counted, because the payment record deliberately does not move for a partial refund; a discrepancy is flagged only where the provider has returned the whole charge and the local record still reads settled. Two partial refunds that together return the whole charge are therefore flagged, and a refund that did not succeed returned no money and is ignored.

Amount discrepancy checks compare both the amount AND the currency field: a local record and a Stripe record for the same payment_intent_id that have matching amounts but different currency values MUST be flagged as a discrepancy. Reconciliation reports display amounts alongside currency codes.

Every pass compares only local records of the provider mode the loaded credential is in, because a live key cannot list test-mode objects and the reverse; rows of the other mode are set aside, counted, and reported with the run rather than raised as discrepancies, and rows whose mode was never recorded are compared.

Discrepancies from every pass are stored as durable reconciliation issues with status (Outstanding/Resolved), resolver, timestamps, and resolution notes; shown in admin dashboard; retained 90 days.

Operation:

- Cadence: daily, on the first scheduler tick of a UTC day it has not yet succeeded on, whatever the hour.
- Configuration: `reconciliation_window_days` (default 7), `reconciliation_grace_minutes` (default 30), `reconciliation_expiry_days` (default 90, fixing each raised issue's expiry).
- Catch-up: the window reaches back to the last successful run, so no period goes unexamined after an outage.
- Run record: its job-run row carries the whole report (window, provider mode compared, rows set aside, per-pass findings, issues raised and resolved, gross totals by category and currency); the admin Financial Reports view reads it back.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none about the run; each issue is a durable record of its own.
- Retention: `payment_retention_days` (default 2555), because the run row is the report.

### SYS_Reconciliation_Digest

Access: This scheduled process runs under the system role.

Story: The system mails the IFPA treasurer contact a summary of payment reconciliation on a configured interval, so that outstanding discrepancies are seen without anyone opening the reports.

Success Criteria:

- The digest summarizes the outstanding reconciliation issues and what was resolved during the period.
- The digest is sent on the interval an administrator configures, and never more often.
- Each digest is dated by the run it reports, so two digests are never mistaken for one repeated message.

Operation:

- Cadence: every `reconciliation_summary_interval_days`, measured from the last successful digest; it runs after the reconciliation on the same tick.
- Configuration: `reconciliation_summary_interval_days` (default 30).
- Catch-up: due once the interval has passed since the last success, so a missed digest goes on the first pass after.
- Run record: its job-run row, with the recipient, the messages sent, and the outstanding count.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none; the outbox records each message.
- Retention: 400 days.

### SYS_Purge_Reconciliation_Issues

Access: This scheduled process runs under the system role.

Story: The system deletes resolved reconciliation issues once their retention has passed, so that the issue list holds what is still useful and nothing older.

Success Criteria:

- A resolved issue is deleted once its expiry, fixed when the issue was raised from `reconciliation_expiry_days`, has passed.
- An outstanding issue is never deleted.
- The webhook-failure counters that age out on the same key are deleted with them.

Operation:

- Cadence: daily.
- Configuration: none read by this job; each issue's expiry is fixed from `reconciliation_expiry_days` when the nightly reconciliation raises it.
- Catch-up: a cutoff on expiry, so the first pass after a missed day deletes everything that came due meanwhile.
- Run record: its job-run row, with the issues and counters deleted.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none; a resolved issue's resolution was audited when it was resolved.
- Retention: 400 days.

### SYS_Purge_Audit_Entries

Access: This scheduled process runs under the system role.

Story: The system deletes audit log rows older than the configured retention period so that the log holds the accountability record for as long as it must, and no longer.

Success Criteria:

- The job deletes audit rows older than `audit_retention_days` (default 2555 days), never less than 2555 days whatever the setting.
- The database refuses any delete inside that window, so a wrong cutoff fails rather than erasing recent history.
- A row an account token still references is kept until the token is gone.

Operation:

- Cadence: daily.
- Configuration: `audit_retention_days` (default and minimum 2555).
- Catch-up: a cutoff on age, so the first pass after a missed day deletes everything that came due meanwhile.
- Run record: its job-run row, with the count deleted, the retention applied, and the oldest remaining row's age.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none; the purge writes no audit row about itself.
- Retention: 400 days.

### SYS_Reclaim_Expired_Media_Jobs

Access: This scheduled process runs under the system role.

Story: The system reclaims a media processing job whose lease has expired, so that a video claimed just before a restart is processed rather than left stuck for good.

Success Criteria:

- A media job still marked as processing after its lease has expired is returned to the queue.
- The worker also runs the same reclaim once when it starts.

Operation:

- Cadence: every quarter of the media-job lease, between one and ten minutes, run on the five-minute scheduler tick.
- Configuration: the media-job lease, a deploy-time setting.
- Catch-up: the pass reads current state, so any later pass reclaims every expired lease.
- Run record: its job-run row, with the count reclaimed; the admin health page lists its failures but not its successful runs, which would crowd out every other job.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: none.
- Retention: 30 days.

### SYS_Open_Vote

<< V2 SCOPE >> Ships with the voting subsystem in v2; not part of the v1 launch.

Access: This scheduled process runs under the system role.

Story: The system opens votes at their configured open_datetime so that voting begins on schedule without manual admin action.

Success Criteria:

- The job checks all votes in `draft` status with open_datetime <= now (UTC).
- For each such vote, the job transitions vote.status to `open` and writes eligibility snapshot rows to `vote_eligibility_snapshot` (same logic as A_Create_Vote).
- The system sends notification to all eligible members that the vote is now open (if configured).
- An admin-alerts email is sent for each automatically opened vote.

Operation:

- Cadence: hourly.
- Configuration: none.
- Catch-up: the pass reads current state, so the first pass after a missed hour opens every vote that came due.
- Run record: its job-run row, with the votes opened.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: each transition is audit-logged with vote_id, old status, new status, and eligible member count.
- Retention: 400 days.

### SYS_Close_Vote

<< V2 SCOPE >> Ships with the voting subsystem in v2; not part of the v1 launch.

Access: This scheduled process runs under the system role.

Story: The system transitions votes from `open` to `closed` when their close_datetime has passed, so that tally operations can proceed without manual admin intervention.

Success Criteria:

- The job checks all votes with status `open` and close_datetime in the past (UTC).
- For each such vote, the job sets vote.status to `closed` and records a close timestamp.
- The system sends an email notification to the admin-alerts mailing list when a vote is automatically closed, including the vote title and vote ID.
- No member notifications are sent at close time (only at result publication via A_Publish_Vote_Results).

Operation:

- Cadence: hourly.
- Configuration: none.
- Catch-up: the pass reads current state, so the first pass after a missed hour closes every vote that came due.
- Run record: its job-run row, with the votes closed.
- Failure alarm: the error alarm.
- Missed-run alarm: the heartbeat alarm.
- Audit trail: each transition is audit-logged with vote_id, old status (`open`), new status (`closed`), and close_datetime.
- Retention: 400 days.

## Continuous Jobs

Continuous jobs are pollers with their own worker loops rather than scheduled passes. They write no job-run row, because a row every few seconds would record nothing a backlog figure does not already say; each is watched by an alarm on what it leaves undone.

### SYS_Send_Email

Access: This continuous polling process runs under the system role to send queued emails by polling the email outbox. Only admins can view delivery logs.

Story: The system sends transactional emails so that members stay informed of important events.

Success Criteria:

- System sends emails for: account registration, email verification, password reset, membership purchase or upgrade, Active Player grant/extension/expiry, payment receipt, event registration confirmation, club membership changes, co-organizer/co-leader additions, and other cases. As this is a flexible list, it is not necessary to hard-code all cases now.
- All emails are sent via SES with deliverability tracking. Transactional mail, which is what this story sends, carries no unsubscribe control: it answers an action the member took, and offering to switch it off would let a member turn off their own security mail. The one-click unsubscribe headers belong to bulk mail, per `A_Send_Mailing_List_Email`.
- Worker respects the pause-sending switch (set by operator script, shown read-only to admins): when enabled, the worker does not attempt new sends, but enqueued items remain pending.
- Emails are sent only via the outbox pattern: request-time controllers enqueue outbox entries and never call SES directly; a background worker polls the outbox, sends via SES, and records sent/failed status.
- Failed email deliveries are retried up to 5 times with exponential backoff; after the maximum retry count the outbox item is moved to a dead-letter queue/folder for admin review and possible replay.
- Email templates are stored as plain text in the database and are editable by Administrators through the email-template editor (`A_Manage_Email_Templates`). Template changes are audit-logged.
- Different mailing lists can have different from addresses configured and this job will use them. No list from-identity is a monitored inbox: every one is either the no-reply sender or a role address that sends without accepting replies, and a reply to platform mail is rejected rather than delivered. The route to a person is the in-platform request flow for members, and the contact address published on the legal page for everyone else. A from-identity configured here must also appear in the environment's permitted-sender list, or the send is refused at the outbox drain after appearing to succeed at compose.
- Each send is logged with template ID, member ID, outbox message ID, timestamp, and delivery result (never a raw email address or a full subject line).

Operation:

- Cadence: continuous, polling every `outbox_poll_interval_seconds`.
- Configuration: `outbox_poll_interval_seconds` (default 30), `outbox_batch_limit` (10), `outbox_bulk_batch_limit` (5), `outbox_max_retry_attempts` (5), `outbox_retry_base_seconds` (60), `outbox_throttle_retry_seconds` (120), `outbox_sending_lease_seconds` (600), and the pause switches `email_outbox_paused` and `bulk_send_paused`.
- Catch-up: pending messages wait in the outbox and go on the next poll after a restart.
- Run record: none; each message's outbox row records its own delivery.
- Failure alarm: the error alarm.
- Missed-run alarm: the outbox backlog alarm, which fires when the backlog stays high because the worker is down or SES is failing.
- Audit trail: none about sending; template changes are audit-logged by the editor.
- Retention: not applicable.

### SYS_Handle_SES_Bounce_And_Complaint_Feed

Access: This continuous process runs under the system role, reading the bounce, complaint and platform-alarm feeds from their queues. Only admins can view detailed logs.

Story: The system processes SES bounce and complaint notifications so that mailing lists remain healthy and future sends avoid problematic addresses, and reads the platform alarm feed so that alarms reach the administrators.

Success Criteria:

- Bounce and complaint notifications read from the feed queue update MailingListSubscription status (bounced/complained) and any global member email suppression as applicable.
- Member subscriptions stay consistent with subscription status so future sends skip suppressed addresses.
- Bounce/complaint rates are tracked and can trigger alarms.
- Platform alarm notifications read from the alarm queue are recorded for administrators under A_Acknowledge_Alarm.
- A notification arriving while the platform is down waits in its queue to be read rather than being lost.

Operation:

- Cadence: continuous, long-polling each queue.
- Configuration: none.
- Catch-up: unread notifications wait in their queues and are read after a restart.
- Run record: none; each notification is recorded once by its own message id.
- Failure alarm: the error alarm.
- Missed-run alarm: the unread-feed alarm on the bounce and complaint queue, which fires when notifications wait unread because the worker is not polling; a dead worker also trips the heartbeat alarm, and a notification that cannot be processed lands on its queue's dead-letter queue, which alarms on both queues.
- Audit trail: the suppression changes it makes.
- Retention: not applicable.

## Event-driven Jobs

Event-driven jobs run when an external service sends the platform an event. They have no cadence of their own: the provider redelivers an event the platform did not acknowledge, and each event is processed once, recorded by its event id.

### SYS_Handle_Stripe_Webhooks

Access: This event-driven process runs under the system role when Stripe sends webhook events. Only admins can view logs and failure metrics.

Story: The system validates and processes Stripe webhook events so that payments are confirmed reliably and local records reflect Stripe's source of truth.

Success Criteria:

- Webhook handler validates Stripe webhook signatures using the configured webhook secret.
- Processing is idempotent (replayed events do not double-apply tier changes or create duplicate payment records).
- On successful payment events, the system updates the relevant local payment records and triggers the correct downstream effects (e.g., membership tier upgrades, receipts) consistent with the relevant member/admin stories.
- Failures are logged with sufficient metadata for debugging, and webhook failure counts/time-since-last-success are surfaced in the admin Stripe dashboard health indicators.

Operation:

- Cadence: on each event.
- Configuration: none.
- Catch-up: the provider redelivers an unacknowledged event; the processed-event record makes a redelivery a no-op.
- Run record: the processed-event record, keyed on the event id.
- Failure alarm: the webhook delivery failure alarm.
- Missed-run alarm: none; the provider redelivers, and the nightly reconciliation catches an event that never arrived.
- Audit trail: as each payment story states.
- Retention: not applicable.

### SYS_Process_One_Time_Payments

Access: This event-driven process runs under the system role when Stripe sends payment-related webhook events. Only admins can view logs and failure metrics.

Story: The system handles Stripe webhook events for one-time payments (membership dues, event registrations, one-time donations) so that local payment records are kept in sync with Stripe.

Success Criteria:

- On payment_intent.succeeded: local payment record transitions to `completed`. Tier upgrade or event registration confirmation applied as appropriate. Receipt email enqueued to member. Audit-logged with payment_intent_id, amount, currency, and timestamp. The settled amount and currency on the event are compared with the local record: a disagreement does not stop the settlement or the grant, since the money moved and nothing is ever revoked automatically, but it raises the same amount-mismatch reconciliation issue and administrator work item the nightly pass would, at once rather than the next night, carrying both amounts.
- On payment_intent.payment_failed: the attempt is recorded on the payment's transition ledger and the record stays `pending`, so a later attempt in the same checkout session can still settle it. Failure notification email enqueued to member. Audit-logged.
- On checkout.session.expired: local payment record transitions to `canceled`, settling a checkout the buyer abandoned. Audit-logged.
- On charge.refunded: local payment record transitions to `refunded`. Audit-logged with Stripe charge ID, refund amount, currency, and timestamp. No automatic tier or registration changes are applied by the platform; any required access changes are handled manually by admins via A_Override_Member_Data using "payment issue resolution" as the reason.
- On refund.failed, or refund.updated carrying a failed or canceled status: the payment record does not move, since refunded is its end state. The failure is audit-logged with refund id, charge id, amount, currency and failure reason, shown on the payment's money history, and raised as an administrator work item, because the money is still in the account and must be returned another way at the provider. Idempotent per event id.
- On every card-dispute stage (charge.dispute.created, charge.dispute.updated, charge.dispute.closed, charge.dispute.funds_withdrawn, charge.dispute.funds_reinstated) and on payout.failed: the payment record does not move, since disputes are decided and payouts repaired at the provider. Each writes an audit entry carrying the identifiers needed to find the case at the provider, and every stage other than an evidence update raises an administrator work item. Idempotent per event id.
- All one-time payment webhook processing is idempotent via the stripe_events table (keyed on Stripe event_id), consistent with the global Payment Processing Guarantees.

Operation:

- Cadence: on each event.
- Configuration: none.
- Catch-up: the provider redelivers an unacknowledged event; the processed-event record makes a redelivery a no-op.
- Run record: the processed-event record, keyed on the event id.
- Failure alarm: the webhook delivery failure alarm.
- Missed-run alarm: none; the nightly reconciliation catches a settlement whose event never arrived.
- Audit trail: every event is audit-logged with payment_intent_id, member_id, event type, old status, new status, and timestamp.
- Retention: not applicable.

### SYS_Process_Recurring_Donations

Access: This event-driven process runs under the system role when Stripe sends subscription-related webhook events. Only admins can view logs and failure metrics. Recurring donation billing schedules are owned entirely by Stripe; the platform does not drive charges.

Story: The system handles Stripe Subscription webhook events for recurring donations so that local payment records, member-facing history, and admin reconciliation data are kept in sync with Stripe's billing activity.

Success Criteria:

- The platform runs no scheduled job to initiate recurring donation charges. Stripe owns the annual billing cycle and all retry logic based on the Stripe Billing dunning configuration set by a System Administrator in the Stripe Dashboard.
- On invoice.paid or invoice.payment_succeeded for a donation subscription (the provider raises both for one settlement, and only invoice.paid reports an invoice marked paid out of band; the first to arrive books the charge and the second books nothing): the system creates a new local payment record (linked to the existing donation subscription record via stripeSubscriptionId), enqueues a receipt email to the member, and audit-logs the event with subscription_id, invoice_id, amount, and timestamp. An invoice that collected nothing is acknowledged with an audit entry and books no payment and sends no receipt, because no money moved.
- On invoice.payment_failed for a donation subscription: the system updates the local subscription status to past_due and enqueues a failure notification email to the member. No retry logic is implemented in the platform; Stripe's configured dunning schedule governs further retry attempts.
- On customer.subscription.deleted for a donation subscription (triggered when Stripe exhausts all retries, or when the member cancels via the platform): the system sets the local subscription status to canceled, enqueues a final notification email to the member and an admin alert, and audit-logs the cancellation with subscription_id and reason.
- On customer.subscription.updated (e.g., amount or status changes made in the Stripe Dashboard by a System Administrator): the system updates the local subscription record to reflect the new state and audit-logs the change. The cancel-at-period-end flag is mirrored in both directions, because an administrator can set or clear it at the provider as readily as the member can on their own page and neither direction moves the status or the amount: unmirrored, a cleared flag leaves the member's page saying the gift is ending while the provider goes on charging it, and a set flag leaves the eventual deletion reported to administrators as the provider exhausting its retries. A subscription whose collection the administrator paused is raised as an administrator work item: pausing collection leaves the reported status active while nothing is collected, which is distinct from the provider's own paused status (a trial ending with no payment method) and is the shape an administrator actually produces.
- All subscription webhook processing is idempotent via the stripe_events table (keyed on Stripe event_id) consistent with the global Payment Processing Guarantees.

Operation:

- Cadence: on each event.
- Configuration: none; the billing schedule is the provider's.
- Catch-up: the provider redelivers an unacknowledged event; the processed-event record makes a redelivery a no-op.
- Run record: the processed-event record, keyed on the event id.
- Failure alarm: the webhook delivery failure alarm.
- Missed-run alarm: none; the nightly reconciliation catches an invoice whose event never arrived.
- Audit trail: all subscription lifecycle events are audit-logged with subscription_id, invoice_id (where applicable), member_id, event type, old status, new status, and timestamp.
- Retention: not applicable.

## Host and Infrastructure Jobs

These jobs run outside the application: on the host's own timer, or inside the hosting provider and the object store. They are not in the job registry and write no job-run row; their design is the Backup and Recovery decision, and each is watched by its own alarm where one is stated.

### SYS_Continuous_Database_Backup

Access: This host-level process runs under the system role on a fixed interval set by the host timer that invokes it (every 5 minutes). The cadence is operator configuration rather than an administrator-configurable parameter, because the timer is on the host and the application neither reads nor sets it.

Story: The system continuously backs up the SQLite database to the primary S3 bucket so that recovery is possible with minimal data loss from common issues like corruption, bugs, or accidental deletion. This is the most frequently used recovery mechanism, and is separate from the continuous cross-region replication that copies those snapshots to a second region.

Success Criteria:

- The host timer runs the backup every 5 minutes.
- Process executes: (1) WAL checkpoint commits pending writes to the main database file, (2) SQLite backup API creates a consistent point-in-time snapshot, (3) Upload snapshot to primary S3 bucket with retry (3 attempts, exponential backoff), (4) Update health timestamp. The technical implementation of the WAL checkpoint (including specific PRAGMA commands and busy-timeout handling) is specified in Design Decisions.
- Every run writes a timestamped snapshot to the primary bucket, and lifecycle rules thin the history by age: in production the fine-grained stream is kept two days, the hourly generation thirty days, and the daily generation four hundred days; staging keeps deliberately shorter windows.
- Upload failures trigger retry with exponential backoff (max 3 attempts per cycle).
- Health timestamp tracks last successful backup for monitoring dashboard.
- Cost remains minimal.
- Backup does not interfere with application performance (WAL mode allows concurrent reads).
- When the application stack stops, the containers checkpoint and close the database, and the host's service unit then takes one final backup of the quiescent database.

Operation:

- Cadence: every 5 minutes, by the host timer.
- Configuration: the host timer.
- Catch-up: the timer is persistent, so a run missed while the host was down runs at boot; promotion into the hourly and daily generations checks whether each window already holds a point.
- Run record: the backup age, consecutive-failure and promotion-failure metrics, and the health timestamp.
- Failure alarm: the consecutive backup failure alarm, after 3 consecutive failures, and the promotion failure alarm.
- Missed-run alarm: the backup age alarm, which fires when the age metric stops refreshing.
- Audit trail: none.
- Retention: the lifecycle rules above.

### SYS_Host_Snapshots

Access: This infrastructure process runs in the hosting provider. No platform code runs it.

Story: The hosting provider snapshots the whole host every day so that a lost instance is restored with its hand-bootstrapped setup, rather than rebuilt by hand before any database restore can begin.

Success Criteria:

- A snapshot of the host is taken daily, with seven retained.
- The snapshot is scheduled away from the deploy window, so it never captures a half-migrated database.
- A restore from a snapshot is followed by a database restore from the backup stream, to close the gap since the snapshot.
- A snapshot that stops being taken is found by a check, not by the restore that needed it.

Operation:

- Cadence: daily, at a fixed hour set in Terraform.
- Configuration: Terraform.
- Catch-up: the provider's.
- Run record: the provider's snapshot list.
- Failure alarm: none.
- Missed-run alarm: none, because the provider runs it with no platform code; the read-only check `scripts/verify-host-snapshots.sh` fails when the newest successful snapshot is older than a day plus two hours, and runs with the production alarm proofs and before a host restore relies on a snapshot.
- Audit trail: none.
- Retention: seven snapshots.

### SYS_Cross_Region_Replication

Access: This is infrastructure, not an application process. No platform code runs it.

Story: Every media object, and every database snapshot the retention tiers promote, is copied to a second region as it is written, so that losing the primary region does not lose the platform's data.

Success Criteria:

- Replication is continuous and native to the object store, not a scheduled job: each object is copied to its disaster-recovery bucket as it is written, delete markers included.
- The database disaster-recovery bucket is protected with Object Lock and lifecycle rules that enforce retention, with the lock window and the lifecycle window set to the same period, so an object expires at the moment it first becomes deletable. The media disaster-recovery bucket carries no lock, so a member's erasure reaches its copy too.
- Retention is set in Terraform beside each bucket: 90 days for the database disaster-recovery copies.
- The cutover snapshot is written under a prefix the routine retention rule does not cover, so the one copy whose purpose is to outlive everything else is not aged out by routine retention.
- The staleness of the disaster-recovery copy is itself watched, because that figure is the recovery point actually on offer during an incident. The object store does not retry a failed replication, so every replication alarm names work an operator must do.
- Alarms reach an administrator under A_Acknowledge_Alarm rather than as a card on A_View_System_Health, which is built only from what the platform records itself and excludes infrastructure by design.
- Recovery objectives: the cross-region recovery point is up to an hour, being the interval between promoted snapshots rather than replication lag, and it is accepted deliberately as the price of not replicating the fine-grained stream; the cross-region recovery time is operator-paced against a rebuilt host. Primary recovery uses the frequent snapshot mechanism (see SYS_Continuous_Database_Backup).
- Replication proves copies were made and nothing more. That the copies restore is established by periodically restoring from them, including at least once from the disaster-recovery bucket rather than the primary. That the set of copies is complete is established by comparing the two buckets, because a replication rule never covers objects written before it existed and no alarm fires for an object replication was never asked to copy.

Operation:

- Cadence: continuous, by the object store.
- Configuration: Terraform.
- Catch-up: none; a failed replication is not retried, so an operator re-uploads the object or runs a batch replication.
- Run record: none; no platform code participates, so there is no run to record.
- Failure alarm: the replication failure alarm.
- Missed-run alarm: the replication backlog alarm.
- Audit trail: none.
- Retention: Terraform, as above.

### SYS_Storage_Lifecycle_Expiry

Access: This is infrastructure, not an application process. No platform code runs it.

Story: The object store ages out stored objects by the lifecycle rules set on each bucket, so that backups, media versions and logs are kept as long as their purpose needs and no longer.

Success Criteria:

- Each bucket's lifecycle rules set how long its objects and their superseded versions are kept: the backup generations as Backup and Recovery sets them, with superseded snapshot versions 90 days and abandoned multipart uploads seven days; the database disaster-recovery copies 90 days; superseded media versions 30 days and abandoned pending uploads one day; superseded archive versions 30 days; distribution access logs 90 days; and the audit trail's objects as its bucket sets them.
- Application log groups expire by their own retention, set in Terraform per environment.
- The rules are set in Terraform beside the bucket they govern.

Operation:

- Cadence: daily, by the object store.
- Configuration: Terraform.
- Catch-up: the object store's.
- Run record: none; no platform code participates.
- Failure alarm: none.
- Missed-run alarm: none.
- Audit trail: none.
- Retention: the rules themselves.

## Standing Rules

A standing rule is a system-actor requirement that is not a process: it holds at all times, enforced by guards and tests rather than by a run.

### SYS_Freestyle_Content_Source_Of_Truth

Access: Only admins author freestyle content.

Story: The persistent production database is the single source of truth for freestyle dictionary content, so that freestyle content is edited in the running application, mirroring the curated-media source-of-truth model.

Success Criteria:

- The audited in-app curation surfaces (A_Edit_Freestyle_Trick and the other freestyle admin stories) are the write path for curated freestyle content; a trick page's educational links are decided from the trick's own base trick and modifier links when the page renders, so a published or edited trick needs nothing regenerated; the code-managed registries (the modifier registry and the curated symbolic-grammar layers) change only through a reviewed database migration.
- The freestyle rebuild refuses to run against any non-development database, with no bypass flag, so it never rewrites a live database.
- Freestyle table rows survive a data-preserving deploy that does not run the rebuild.
- Recovery from a bad edit is a corrective in-app edit or a database restore; every in-app edit is recorded in the audit trail.
- Tests pin the rule: freestyle rows survive a data-preserving deploy; the rebuild refuses a production database; and freestyle content is written only through the audited in-app curation surfaces, plus reviewed database migrations for the code-managed registries.
