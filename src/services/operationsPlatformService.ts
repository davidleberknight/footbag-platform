/**
 * OperationsPlatformService -- operational health and background-job
 * orchestration.
 *
 * Owns:
 *   - Readiness composition for GET /health/ready (database probe + container
 *     memory pressure)
 *   - The system_job_runs lifecycle wrapper (`recordJobRun`): insert on start,
 *     succeeded/failed on completion, stale-running reap for crash recovery
 *   - The continuous pollers' entry points and intervals: outbox drain and
 *     notification-feed drain (the bounce/complaint and alarm queues)
 *   - The scheduled jobs' entry points, each one run through `recordJobRun`:
 *     Active Player expiry, administrator-loss sweep, PII purge scan, expired
 *     token cleanup, hashtag-stats rebuild, admin work-queue digest and stale
 *     escalation, payment reconciliation, its digest and the resolved-issue
 *     purge, the audit retention purge, the unfinished-account deletion, and
 *     the media-lease reclaim. When each runs is the job registry's decision,
 *     never the entry point's.
 *   - Unfinished-account deletion: which prospective members' accounts are idle
 *     past `unfinished_account_cleanup_days`, and their outright deletion with
 *     every row they own; no audit row, since the log holds none about them
 *   - PII purge eligibility: which members' grace windows have expired and
 *     which erasure shape applies (full purge for soft-deleted accounts,
 *     contact scrub for deceased ones), plus anonymizing payments past the
 *     compliance-retention window (ballots are out of scope: destroying IFPA
 *     vote records is the IFPA secretary's decision, not an operator job), plus
 *     deleting delivered outbox copies past the outbound-copy retention window
 *   - The audit retention purge: deleting audit rows past audit_retention_days,
 *     never less than seven years; the delete trigger refuses anything younger
 *
 * Does not own:
 *   - When a scheduled job runs, its run-row pruning and the missed-run
 *     heartbeat (JobRegistry)
 *   - The delegated job bodies (ActivePlayerExpiryService, CommunicationService drain,
 *     MembershipTieringService administrator-loss sweep)
 *   - Outbox row mechanics (CommunicationService)
 *   - Row-level PII erasure (MemberService primitives)
 *
 * Required patterns:
 *   - Every scheduled job runs through `recordJobRun` so operators can see
 *     last-run status and failures in system_job_runs, and is declared in the
 *     job registry, which alone decides when it runs.
 *   - The PII purge scan keeps separate soft-deleted vs deceased branches
 *     with distinct grace configs (member_cleanup_grace_days,
 *     deceased_cleanup_grace_days) read at runtime; the two grace rules are
 *     never collapsed.
 *   - Interval getters clamp config floors so a bad value cannot hot-loop a
 *     worker.
 *
 * Persistence:
 *   system_job_runs, outbox_emails (backlog read +
 *   mailing-list enqueue + retention delete of delivered copies), members
 *   (purge-eligibility read; unfinished-account delete, with that account's
 *   account_tokens, member_onboarding_tasks, member_declared_anchors,
 *   mailing_list_subscriptions, member_links and outbox_emails rows), payments (compliance-retention read + anonymize
 *   write), health (read), system_config (the declared payment mode observed
 *   at boot: read of the current row, append when it changed).
 *
 * Side effects:
 *   - system_job_runs insert/update
 *   - system_config append (`payments_declared_mode`, only when the deployment's
 *     declared arming state differs from the last one recorded, so the admin
 *     payments-health page can say since when the declared mode has held)
 *   - outbox_emails delete (delivered copies past the retention window)
 *   - payments anonymize-write (compliance-retention cleanup)
 *   - audit_entries delete (the retention purge, rows past the window only)
 *   - members hard delete (an unfinished account idle past its period, with
 *     every row it owns)
 *   - audit_entries append (pii_erasure_failed, payment.compliance_anonymize_failed, and
 *     email.outbox_retention_cleanup_failed operational errors; the per-row
 *     erasure audit rows belong to MemberService)
 *   - logger.error on job failure (drives the CloudWatch alarm)
 *
 * Service shape: class singleton (`operationsPlatformService`); adapters are
 * obtained via singleton getters inside method bodies.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  accountTokens, auditEntries, declaredAnchors, health, mailingListSubscriptions, memberLinks,
  memberPurge, outbox, payments, systemConfig, systemJobRuns, transaction, unfinishedAccounts,
} from '../db/db';

// Seven years: the audit log's retention never drops below it, whatever the
// setting says, so lowering the setting cannot erase recent history.
const AUDIT_RETENTION_FLOOR_DAYS = 2555;
import { runSqliteRead } from './sqliteRetry';
import { memberService } from './memberService';
import { hashtagDiscoveryService } from './hashtagDiscoveryService';
import { recordOperationalError } from './operationalErrors';
import { getCommunicationService, type ProcessBatchResult } from './communicationService';
import { getNotificationFeedAdapter } from '../adapters/notificationFeedAdapter';
import { publishedByExpectedTopic } from '../lib/snsSignature';
import { sesFeedbackService } from './sesFeedbackService';
import { systemAlarmService } from './systemAlarmService';
import { workQueueService } from './workQueueService';
import { paymentReconciliationService } from './paymentReconciliationService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
import { logger } from '../config/logger';
import {
  runDailyPass as runActivePlayerExpiryDailyPass,
  type RunDailyPassResult,
  type RunOpts as ActivePlayerExpiryRunOpts,
} from './activePlayerExpiryService';
import { runAdminLossSweep } from './membershipTieringService';

export interface PiiPurgeScanResult {
  deleted: {
    eligible: number;
    purged: number;
    honorsPreserved: number;
    skipped: number;
    errors: { memberId: string; error: string }[];
  };
  deceased: {
    eligible: number;
    scrubbed: number;
    skipped: number;
    errors: { memberId: string; error: string }[];
  };
  // Payment records past the compliance-retention window get their
  // member-linking PII anonymized (the financial record is kept). Ballots are
  // not in scope: their retention is a preserve-only window, and destruction of
  // IFPA vote records is the IFPA secretary's decision, not an operator job.
  payments: {
    eligible: number;
    anonymized: number;
    skipped: number;
    errors: { paymentId: string; error: string }[];
  };
  // Per-recipient outbox copies past the outbound-copy retention window are
  // deleted outright: delivered ones, and dead-lettered ones no operator acted
  // on within the window. The per-send broadcast archive is a separate record
  // with no recipient in it and is kept indefinitely, so it is not in scope
  // here.
  outboxCopies: {
    deliveredDeleted: number;
    deadLetterDeleted: number;
    errors: { error: string }[];
  };
}

export interface ReadinessStatus {
  isReady: boolean;
  checks: {
    database: {
      isReady: boolean;
    };
    memory: {
      isReady: boolean;
      usedPercent: number | null;
    };
  };
}

const MEMORY_PRESSURE_THRESHOLD_PERCENT = 90;
/** The config key holding the declared payment mode observed at boot. */
const DECLARED_PAYMENT_MODE_KEY = 'payments_declared_mode';

// Mutable test seam over the immutable config-derived value. Boot reads
// FOOTBAG_TEST_MEMORY_PERCENT once via src/config/env.ts (which fail-fasts
// in production); tests use setTestMemoryPercentForTests / reset...ForTests
// to drive readiness gating per-case without manipulating real cgroup state.
let testMemoryPercentOverride: number | null | undefined = config.testMemoryPercent;

export function setTestMemoryPercentForTests(value: number | null | undefined): void {
  testMemoryPercentOverride = value;
}

export function resetTestMemoryPercentForTests(): void {
  testMemoryPercentOverride = config.testMemoryPercent;
}

// memory.current includes page cache by design; this matches the value
// CWAgent emits as mem_used_percent so the readiness gate aligns with the
// host-side alarm threshold. Do not subtract cache.
export function readContainerMemoryUsedPercent(): number | null {
  if (testMemoryPercentOverride !== undefined) {
    return testMemoryPercentOverride;
  }
  try {
    const max = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (max === 'max') return null;
    const maxBytes = BigInt(max);
    if (maxBytes === 0n) return null;
    const current = BigInt(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
    return Number((current * 10000n) / maxBytes) / 100;
  } catch {
    return null;
  }
}

/**
 * Operations service surface.
 *
 * Readiness composition belongs here, not in db.ts. Currently the only
 * implemented dependency check is the minimal DB probe from db.ts.
 */
export class OperationsPlatformService {
  /**
   * Single pass over both SNS notification feeds: the SES bounce and complaint
   * feed, and the platform alarm feed. Each queue's envelopes go to the service
   * that owns that feed, and a message is deleted only once its service has
   * returned. A service that throws leaves the message on the queue, so a
   * failure the platform could not record becomes a redelivery rather than a
   * silent loss; the queue's own redrive policy is what stops a message the
   * platform can never handle from blocking the ones behind it.
   *
   * A feed with no queue or no topic configured is not read. The pairing is
   * deliberate: the topic is what a notification is authenticated against once
   * it arrives, so a queue read without one would consume messages the platform
   * has no way to attribute, and a consumed message is gone.
   */
  async runNotificationFeeds(
    opts: { waitTimeSeconds?: number; abortSignal?: AbortSignal } = {},
  ): Promise<{ handled: number; skipped: number }> {
    const feeds = [
      {
        name: 'ses_feedback' as const,
        queueUrl: config.sesFeedbackQueueUrl,
        topicArn: config.sesFeedbackTopicArn,
        handle: (body: string): void => {
          sesFeedbackService.processSnsMessage(body);
        },
      },
      {
        name: 'platform_alarm' as const,
        queueUrl: config.alarmQueueUrl,
        topicArn: config.alarmTopicArn,
        handle: (body: string): void => {
          systemAlarmService.processSnsMessage(body);
        },
      },
    ];

    let handled = 0;
    let skipped = 0;
    const adapter = getNotificationFeedAdapter();

    for (const feed of feeds) {
      if (!feed.queueUrl || !feed.topicArn) continue;
      const messages = await adapter.receive(feed.queueUrl, {
        waitTimeSeconds: opts.waitTimeSeconds,
        abortSignal: opts.abortSignal,
      });
      for (const message of messages) {
        // The publishing topic is checked here rather than left to the feed
        // services, because it decides whether the message belongs to this feed
        // at all. IAM authorizes the read; this is what stops a message
        // delivered onto the wrong queue being processed as though it were the
        // right one. A mismatch is deleted, not retried: redelivering it would
        // only produce the same refusal until the queue aged it out.
        if (!publishedByExpectedTopic(message.body, feed.topicArn)) {
          skipped += 1;
          logger.warn('notification feed: message from an unexpected topic', {
            feed: feed.name,
          });
          await adapter.deleteMessage(feed.queueUrl, message.receiptHandle);
          continue;
        }
        feed.handle(message.body);
        await adapter.deleteMessage(feed.queueUrl, message.receiptHandle);
        handled += 1;
      }
    }

    return { handled, skipped };
  }

  /**
   * The wait a feed poll holds its connection open for. Twenty seconds is the
   * longest the queue service accepts and the right choice at every volume this
   * platform sees: a longer wait costs nothing and a shorter one only turns idle
   * time into empty requests. Not configurable, because there is no operating
   * condition that would want it lower.
   */
  getNotificationFeedWaitSeconds(): number {
    return 20;
  }

  /** Whether either notification feed is configured to be read here. */
  hasNotificationFeeds(): boolean {
    return Boolean(
      (config.sesFeedbackQueueUrl && config.sesFeedbackTopicArn)
      || (config.alarmQueueUrl && config.alarmTopicArn),
    );
  }

  /**
   * Single iteration of the email-outbox drain. Delegates to
   * CommunicationService.processSendQueue and logs the outcome. Returns the
   * structured result so callers (worker loop, tests) can act on it.
   */
  async runEmailWorker(opts: { limit?: number } = {}): Promise<ProcessBatchResult> {
    const comms = getCommunicationService();
    const result = await comms.processSendQueue({ limit: opts.limit });
    if (result.paused) {
      logger.info('email worker: paused', { ...result });
    } else if (result.claimed > 0) {
      logger.info('email worker: drained batch', { ...result });
    }
    return result;
  }

  /**
   * Returns the configured polling interval in milliseconds. Reads from
   * system_config, clamped to a safe minimum so a misconfiguration cannot
   * pin the worker in a hot loop.
   */
  getOutboxPollIntervalMs(): number {
    const seconds = readIntConfig('outbox_poll_interval_seconds', 30);
    const clamped = Math.max(1, seconds);
    return clamped * 1000;
  }

  /** Deliverable email backlog (pending + sending rows); the worker logs it each
   * cycle, at warn only above the CloudWatch outbox-depth alarm's threshold. */
  getOutboxBacklogDepth(): number {
    return (outbox.countBacklog.get() as { n: number }).n;
  }

  /**
   * Generic SYS-job lifecycle wrapper. Inserts a `system_job_runs` row with
   * status='running' before invoking the work callback; updates the same row
   * to 'succeeded' with the callback's return value JSON-serialized into
   * `details_json` on normal return, or to 'failed' with the error message
   * on throw. Errors propagate so the caller's loop can log and continue.
   *
   * `startTime` defaults to wall-clock; tests pass a fixed Date.
   */
  async recordJobRun<T>(
    jobName: string,
    work: () => Promise<T> | T,
    startTime?: Date,
  ): Promise<T> {
    const startedAt = (startTime ?? new Date()).toISOString();
    // Reap this job's stale 'running' rows before starting a new one. A kill,
    // an out-of-memory stop, or a process replace leaves a row in 'running' for
    // good, because the success and failure marks only fire on a clean return
    // or throw. Every job runs through here, so every job is reaped: wiring the
    // reap to one job left every other one reading as still running for ever on
    // the health page, and never counted as a failure. The threshold sits well
    // above any job's expected runtime and well below the point an operator
    // would still believe it was running.
    const STALE_RUNNING_THRESHOLD_MS = 60 * 60 * 1000;
    const reapCutoffIso = new Date(Date.parse(startedAt) - STALE_RUNNING_THRESHOLD_MS).toISOString();
    systemJobRuns.reapStaleRunning.run(startedAt, startedAt, jobName, reapCutoffIso);

    const jobRunId  = `jr_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    systemJobRuns.insertRun.run(
      jobRunId,
      startedAt,
      startedAt,
      jobName,
      startedAt,
    );
    try {
      const result = await work();
      // A caller that injects a fixed clock (tests, deterministic replay) stamps
      // the completion on that same clock, so the once-per-UTC-day and
      // interval gates that key off the recorded finish time behave
      // deterministically. Production passes no clock and records the real
      // completion instant.
      const finishedAt = (startTime ?? new Date()).toISOString();
      systemJobRuns.markSucceeded.run(
        finishedAt,
        JSON.stringify(result),
        finishedAt,
        jobRunId,
      );
      logger.info(`${jobName}: succeeded`, { jobRunId });
      return result;
    } catch (err) {
      const finishedAt = (startTime ?? new Date()).toISOString();
      const errMsg = err instanceof Error ? err.message : String(err);
      systemJobRuns.markFailed.run(finishedAt, errMsg, finishedAt, jobRunId);
      logger.error(`${jobName}: failed`, { jobRunId, error: errMsg });
      throw err;
    }
  }

  /**
   * SYS_Check_Active_Player_Expiry daily entry point. Delegates the candidate
   * scan + reminder enqueue + applyExpiry orchestration to the AP-expiry
   * service; wraps the call with `recordJobRun` so admin tooling sees one
   * `system_job_runs` row per pass with the counter struct in `details_json`.
   */
  async runActivePlayerExpiryCheck(
    opts: ActivePlayerExpiryRunOpts = {},
  ): Promise<RunDailyPassResult> {
    return this.recordJobRun(
      'SYS_Check_Active_Player_Expiry',
      () => runActivePlayerExpiryDailyPass(opts),
      opts.now,
    );
  }

  /**
   * SYS_Cleanup_Expired_Tokens. Deletes account tokens that can no longer do
   * anything and have been that way for longer than the configured threshold.
   *
   * It reports the count by token type, and the age of the oldest row it left
   * behind as well as the number it removed, because a sweep that deletes a
   * healthy number every night and still leaves a row from months ago is not
   * working, and a count alone cannot say so.
   */
  async runExpiredTokenCleanup(
    startTime?: Date,
  ): Promise<{
    deleted: number;
    deletedByType: Record<string, number>;
    oldestRemainingAgeDays: number | null;
  }> {
    return this.recordJobRun('SYS_Cleanup_Expired_Tokens', () => {
      const now = startTime ?? new Date();
      const thresholdDays = readIntConfig('token_cleanup_threshold_days', 7);
      const cutoff = new Date(now.getTime() - thresholdDays * 86_400_000).toISOString();

      const { deleted, deletedByType } = transaction(() => {
        const byType: Record<string, number> = {};
        for (const row of accountTokens.countSpentOlderThanByType.all(cutoff, cutoff) as
          { token_type: string; n: number }[]) {
          byType[row.token_type] = row.n;
        }
        return {
          deleted: accountTokens.deleteSpentOlderThan.run(cutoff, cutoff).changes,
          deletedByType: byType,
        };
      });
      const oldest = accountTokens.oldestRemainingIssuedAt.get() as { oldest_issued_at: string | null };
      const oldestRemainingAgeDays = oldest.oldest_issued_at
        ? Math.floor((now.getTime() - Date.parse(oldest.oldest_issued_at)) / 86_400_000)
        : null;

      logger.info('token cleanup', { deleted, deletedByType, thresholdDays, oldestRemainingAgeDays });
      return { deleted, deletedByType, oldestRemainingAgeDays };
    }, startTime);
  }

  /**
   * SYS_Purge_Audit_Entries daily entry point. Deletes audit rows older than the
   * retention window: audit_retention_days, never less than seven years. The
   * job-run row is its trail; the purge writes no audit row about itself. No
   * cadence gate: the delete is cheap and idempotent. The delete trigger
   * refuses anything inside the window, so a wrong cutoff here fails loudly
   * rather than erasing recent history.
   */
  async runAuditRetentionPurge(
    startTime?: Date,
  ): Promise<{ deleted: number; retentionDays: number; oldestRemainingAgeDays: number | null }> {
    return this.recordJobRun('SYS_Purge_Audit_Entries', () => {
      const now = startTime ?? new Date();
      const retentionDays = Math.max(AUDIT_RETENTION_FLOOR_DAYS, readIntConfig('audit_retention_days', AUDIT_RETENTION_FLOOR_DAYS));
      const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
      const deleted = auditEntries.deleteOlderThan.run(cutoff).changes;
      const oldest = auditEntries.oldestOccurredAt.get() as { oldest: string | null };
      const oldestRemainingAgeDays = oldest.oldest
        ? Math.floor((now.getTime() - Date.parse(oldest.oldest)) / 86_400_000)
        : null;
      logger.info('audit retention purge', { deleted, retentionDays, oldestRemainingAgeDays });
      return { deleted, retentionDays, oldestRemainingAgeDays };
    }, startTime);
  }

  /**
   * SYS_Rebuild_Hashtag_Stats daily entry point. Recomputes the aggregated
   * hashtag usage counts from scratch so the figures cannot drift from the
   * incremental updates over time. The rebuild runs in a single transaction,
   * so a failure leaves the existing stats in place; `recordJobRun` writes one
   * `system_job_runs` row per pass with the upsert count in `details_json`.
   */
  async runHashtagStatsRebuild(
    startTime?: Date,
  ): Promise<{ rowsUpserted: number }> {
    return this.recordJobRun(
      'SYS_Rebuild_Hashtag_Stats',
      () => hashtagDiscoveryService.rebuildTagStats(),
      startTime,
    );
  }

  /**
   * SYS_Admin_Queue_Digest entry point. Emails each administrator a rollup of
   * the open routine work-queue items. The job registry runs it on the cadence
   * set by `admin_queue_digest_interval_days` (default daily).
   */
  async runAdminQueueDigest(
    startTime?: Date,
  ): Promise<{ admins: number; sent: number; openRoutineItems: number }> {
    return this.recordJobRun(
      'SYS_Admin_Queue_Digest',
      () => workQueueService.sendAdminQueueDigests(),
      startTime,
    );
  }

  /**
   * SYS_Reconcile_Payments_Nightly entry point. The job registry runs it once
   * per UTC day, on the first tick of a day it has not yet succeeded on.
   */
  async runPaymentReconciliation(
    startTime?: Date,
  ): Promise<{ issuesRaised: number; duplicatesSkipped: number }> {
    const now = startTime ?? new Date();
    const result = await this.recordJobRun(
      'SYS_Reconcile_Payments_Nightly',
      () => paymentReconciliationService.runReconciliation({ now }),
      startTime,
    );
    return {
      issuesRaised: result.issuesRaised,
      duplicatesSkipped: result.duplicatesSkipped,
    };
  }

  /**
   * Records the payment mode this deployment declares, when it differs from
   * the last one recorded.
   *
   * The arming switch is an out-of-band parameter the deploy derives the
   * adapter from, and its history lives in the parameter store, which the
   * admin health page must not call. Observing the declared mode at each boot
   * and appending a config row only when it changed gives that page a local
   * answer to "since when": the row's own effective time. Restarts on an
   * unchanged mode append nothing, so the table records changes, not boots.
   */
  recordDeclaredPaymentMode(now: Date = new Date()): { changed: boolean; mode: 'armed' | 'dark' } {
    const mode: 'armed' | 'dark' = config.paymentsArmed === 'armed' ? 'armed' : 'dark';
    const current = systemConfig.getCurrentRowByKey.get(DECLARED_PAYMENT_MODE_KEY) as
      | { value_json: string; effective_start_at: string }
      | undefined;
    let held: unknown = null;
    if (current) {
      try {
        held = JSON.parse(current.value_json);
      } catch {
        held = null;
      }
    }
    if (held === mode) return { changed: false, mode };
    const nowIso = now.toISOString();
    systemConfig.insert.run(
      `cfg_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      nowIso,
      DECLARED_PAYMENT_MODE_KEY,
      JSON.stringify(mode),
      nowIso,
      'Declared payment mode observed at process start; recorded so the payments health page can say when the declared mode last changed.',
      null,
    );
    logger.info('declared payment mode recorded', { mode, previous: held });
    return { changed: true, mode };
  }

  /**
   * SYS_Reconciliation_Digest entry point: the periodic reconciliation digest to
   * administrators. The job registry runs it on the cadence set by
   * `reconciliation_summary_interval_days`.
   */
  async runReconciliationDigest(
    startTime?: Date,
  ): Promise<{ recipient: string | null; sent: number; outstanding: number }> {
    const now = startTime ?? new Date();
    return this.recordJobRun(
      'SYS_Reconciliation_Digest',
      () => paymentReconciliationService.sendReconciliationDigest({ now }),
      startTime,
    );
  }

  /**
   * SYS_Purge_Reconciliation_Issues daily entry point. Deletes resolved
   * reconciliation issues whose retention has expired, and the webhook-failure
   * counters that age out on the same key; outstanding issues are never
   * touched. The reported count covers both tables. The delete is cheap and
   * idempotent, so the job registry runs it daily with nothing to track beyond
   * its run row.
   */
  async runReconciliationIssuePurge(startTime?: Date): Promise<{ deleted: number }> {
    return this.recordJobRun(
      'SYS_Purge_Reconciliation_Issues',
      () => paymentReconciliationService.purgeExpiredResolvedIssues({ now: startTime }),
      startTime,
    );
  }

  /**
   * SYS_Admin_Queue_Escalation daily entry point. Escalates each open,
   * unclaimed routine work-queue item older than the stale threshold with a
   * single one-time email to all administrators; the per-item outbox
   * idempotency key makes the escalation fire exactly once per item.
   */
  async runStaleQueueEscalation(startTime?: Date): Promise<{ escalated: number }> {
    return this.recordJobRun(
      'SYS_Admin_Queue_Escalation',
      () => workQueueService.escalateStaleQueueItems(),
      startTime,
    );
  }

  /**
   * SYS_Delete_Unfinished_Accounts daily pass. Deletes the account of a
   * prospective member (registered, onboarding not finished) idle longer than
   * `unfinished_account_cleanup_days`, measured from its latest activity. Such
   * an account holds only its own rows, so it is deleted outright, one
   * transaction per account: its outgoing mail, tokens, onboarding task rows,
   * declared anchors, subscriptions and links, then the member row. Idleness is
   * re-read inside that transaction before anything is removed, so an account
   * that finished onboarding or came back after the listing keeps every row.
   *
   * An account holding a row it should not (an audit row, a tier grant) fails
   * the member delete on its foreign key; that account is rolled back whole,
   * kept, counted and named by id on the run row and in a warn line, because
   * the row that blocked it is a defect an operator should find. The job
   * writes no audit row: the audit log holds none about a prospective member.
   */
  async runUnfinishedAccountCleanup(
    startTime?: Date,
  ): Promise<{
    eligible: number;
    deleted: number;
    noLongerIdle: number;
    blocked: number;
    blockedMemberIds: string[];
    failed: number;
  }> {
    return this.recordJobRun('SYS_Delete_Unfinished_Accounts', () => {
      const now = startTime ?? new Date();
      const idleDays = readIntConfig('unfinished_account_cleanup_days', 90);
      const cutoff = new Date(now.getTime() - idleDays * 86_400_000).toISOString();
      const ids = (unfinishedAccounts.listIdleBefore.all(cutoff) as { id: string }[]).map((r) => r.id);
      const result = {
        eligible: ids.length, deleted: 0, noLongerIdle: 0, blocked: 0,
        blockedMemberIds: [] as string[], failed: 0,
      };
      for (const memberId of ids) {
        try {
          const removed = transaction(() => {
            if (!unfinishedAccounts.isIdleBefore.get(memberId, cutoff)) return false;
            unfinishedAccounts.deleteOutboxForRecipient.run(memberId);
            unfinishedAccounts.deleteTokensForMember.run(memberId);
            unfinishedAccounts.deleteOnboardingTasksForMember.run(memberId);
            declaredAnchors.deleteAllForMember.run(memberId);
            mailingListSubscriptions.deleteAllForMember.run(memberId);
            memberLinks.deleteAllForMember.run(memberId);
            unfinishedAccounts.deleteMember.run(memberId);
            return true;
          });
          if (removed) result.deleted += 1;
          else result.noLongerIdle += 1;
        } catch (err) {
          if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            result.blocked += 1;
            result.blockedMemberIds.push(memberId);
          } else {
            result.failed += 1;
            logger.error('SYS_Delete_Unfinished_Accounts: account delete failed', {
              memberId,
              errorClass: err instanceof Error ? err.name : typeof err,
            });
          }
        }
      }
      if (result.blocked > 0) {
        logger.warn('unfinished account cleanup kept accounts holding a protected row', {
          blocked: result.blocked,
          memberIds: result.blockedMemberIds,
        });
      }
      return result;
    }, startTime);
  }

  /**
   * SYS_Reclaim_Expired_Media_Jobs entry point. Re-runs the transcode worker's
   * expired-lease recovery, because a media job claimed just before a restart
   * holds a live lease at boot and would otherwise be orphaned when that lease
   * expires with no further boot coming. The worker hands in its own reclaim
   * function, since the transcode worker instance lives in the worker process.
   */
  async runMediaJobReap(
    reap: () => Promise<{ reclaimedIds: string[] }>,
    startTime?: Date,
  ): Promise<{ reclaimed: number }> {
    return this.recordJobRun(
      'SYS_Reclaim_Expired_Media_Jobs',
      async () => ({ reclaimed: (await reap()).reclaimedIds.length }),
      startTime,
    );
  }

  /**
   * SYS_Detect_Admin_Loss sweep. Finds administrators who can no longer serve
   * while still holding the role (account soft-deleted, member deceased, or no
   * sign-in within the configured inactivity window) and raises the recruitment
   * alert for each, so the remaining administrators are prompted to recruit.
   * The sweep reads and alerts; it changes no `is_admin` value. Idempotent: an
   * administrator with the alert already open is skipped, so re-running raises
   * nothing new.
   */
  async runAdminLossSweep(
    startTime?: Date,
  ): Promise<{ examined: number; raised: number; failed: number }> {
    return this.recordJobRun('SYS_Detect_Admin_Loss', () => runAdminLossSweep(), startTime);
  }

  /**
   * SYS_Cleanup_Soft_Deleted_Records daily pass: the PII purge-eligibility
   * scan. Two branches with distinct grace rules that must never be
   * collapsed:
   *
   *   - soft-deleted accounts past `member_cleanup_grace_days` get the full
   *     purge (`memberService.purgeAccountPII`)
   *   - deceased accounts past `deceased_cleanup_grace_days` get the
   *     contact-only scrub (`memberService.scrubDeceasedMemberPII`)
   *
   * A member both deceased and soft-deleted goes to the deleted branch (the
   * full purge supersedes the scrub). Eligibility excludes system accounts
   * and rows whose erasure_log entries show the shape already applied, so
   * the pass is idempotent. One failing row never aborts the pass: the
   * failure is recorded as a member.pii_erasure_failed operational error and
   * counted, and the scan continues. The job registry runs it daily.
   *
   * A third branch anonymizes payments past the compliance-retention window
   * (member-linking PII stripped, anonymized financial record kept, including
   * the donor's note, which is the gift's own meaning rather than a link to the
   * donor), idempotent via the member_id-not-null marker. Vote ballots are deliberately not
   * touched: their retention window only permits cleanup, and destroying IFPA
   * vote records is the IFPA secretary's decision rather than an operator job.
   *
   * A fourth branch deletes per-recipient outbox copies past
   * `outbox_retention_days`. Each is one message to one recipient, holding that
   * recipient's address and the rendered body. Delivered rows age on `sent_at`,
   * because they are kept only while bounce correlation and delivery questions
   * can still use them; dead-lettered rows age on their last attempt, because a
   * failure nobody reviewed within a whole window will not be reviewed now.
   * Pending and failed rows are live work the drain still owns, and a
   * manual_review row is an unresolved question about whether a real person
   * received a message, so neither ages out. The per-send broadcast archive is a
   * different record, names no recipient, and is kept indefinitely.
   */
  async runPiiPurgeScan(opts: { now?: Date } = {}): Promise<PiiPurgeScanResult> {
    return this.recordJobRun('SYS_Cleanup_Soft_Deleted_Records', () => {
      const now = opts.now ?? new Date();
      const deletedGraceDays  = readIntConfig('member_cleanup_grace_days', 90);
      const deceasedGraceDays = readIntConfig('deceased_cleanup_grace_days', 30);
      const deletedCutoff  = new Date(now.getTime() - deletedGraceDays  * 86_400_000).toISOString();
      const deceasedCutoff = new Date(now.getTime() - deceasedGraceDays * 86_400_000).toISOString();

      const deleted: PiiPurgeScanResult['deleted'] = {
        eligible: 0, purged: 0, honorsPreserved: 0, skipped: 0, errors: [],
      };
      const deletedRows = memberPurge.listDeletedEligible.all(deletedCutoff) as { id: string }[];
      deleted.eligible = deletedRows.length;
      for (const { id } of deletedRows) {
        try {
          const res = memberService.purgeAccountPII(id);
          if (res.status === 'purged') {
            deleted.purged += 1;
            if (res.honorsPreserved) deleted.honorsPreserved += 1;
          } else {
            deleted.skipped += 1;
          }
        } catch (err) {
          deleted.errors.push({ memberId: id, error: err instanceof Error ? err.message : String(err) });
          recordOperationalError({
            actionType: 'member.pii_erasure_failed',
            entityType: 'member',
            entityId:   id,
            reasonText: 'PII purge scan: full purge of a grace-expired soft-deleted account failed',
            cause:      err,
          });
        }
      }

      const deceased: PiiPurgeScanResult['deceased'] = {
        eligible: 0, scrubbed: 0, skipped: 0, errors: [],
      };
      const deceasedRows = memberPurge.listDeceasedEligible.all(deceasedCutoff) as { id: string }[];
      deceased.eligible = deceasedRows.length;
      for (const { id } of deceasedRows) {
        try {
          const res = memberService.scrubDeceasedMemberPII(id);
          if (res.status === 'scrubbed') {
            deceased.scrubbed += 1;
          } else {
            deceased.skipped += 1;
          }
        } catch (err) {
          deceased.errors.push({ memberId: id, error: err instanceof Error ? err.message : String(err) });
          recordOperationalError({
            actionType: 'member.pii_erasure_failed',
            entityType: 'member',
            entityId:   id,
            reasonText: 'PII purge scan: contact scrub of a grace-expired deceased account failed',
            cause:      err,
          });
        }
      }

      // Payment compliance cleanup: after the retention window, strip the
      // member-linking PII from old payments while keeping the anonymized
      // financial record. One failing row never aborts the pass.
      const paymentRetentionDays = readIntConfig('payment_retention_days', 2555);
      const paymentCutoff = new Date(now.getTime() - paymentRetentionDays * 86_400_000).toISOString();
      const nowIso = now.toISOString();
      const paymentsResult: PiiPurgeScanResult['payments'] = {
        eligible: 0, anonymized: 0, skipped: 0, errors: [],
      };
      const paymentRows = payments.listComplianceExpired.all(paymentCutoff) as { id: string }[];
      paymentsResult.eligible = paymentRows.length;
      for (const { id } of paymentRows) {
        try {
          payments.anonymizeForCompliance.run(nowIso, 'system', id);
          paymentsResult.anonymized += 1;
        } catch (err) {
          paymentsResult.errors.push({ paymentId: id, error: err instanceof Error ? err.message : String(err) });
          recordOperationalError({
            actionType: 'payment.compliance_anonymize_failed',
            entityType: 'payment',
            entityId:   id,
            reasonText: 'PII purge scan: compliance-retention anonymization of an aged payment failed',
            cause:      err,
          });
        }
      }

      // Outbound-copy cleanup: a per-recipient copy holds that recipient's
      // address and the rendered body. A delivered one serves bounce
      // correlation and delivery questions that go stale within weeks; a
      // dead-lettered one is an operator's to review, but past a whole
      // retention window nobody is going to act on it and the address should
      // not outlive the review. A failure here never aborts the pass.
      const outboxRetentionDays = readIntConfig('outbox_retention_days', 90);
      const outboxCutoff = new Date(now.getTime() - outboxRetentionDays * 86_400_000).toISOString();
      const outboxCopies: PiiPurgeScanResult['outboxCopies'] = {
        deliveredDeleted: 0, deadLetterDeleted: 0, errors: [],
      };
      try {
        outboxCopies.deliveredDeleted  = outbox.deleteSentBefore.run(outboxCutoff).changes;
        outboxCopies.deadLetterDeleted = outbox.deleteDeadLetterBefore.run(outboxCutoff).changes;
      } catch (err) {
        outboxCopies.errors.push({ error: err instanceof Error ? err.message : String(err) });
        recordOperationalError({
          actionType: 'email.outbox_retention_cleanup_failed',
          entityType: 'system',
          entityId:   'outbox_retention',
          reasonText: 'PII purge scan: deletion of delivered outbox copies past the retention window failed',
          cause:      err,
        });
      }

      return { deleted, deceased, payments: paymentsResult, outboxCopies };
    }, opts.now);
  }

  checkReadiness(): ReadinessStatus {
    const memoryPercent = readContainerMemoryUsedPercent();
    const memoryReady = memoryPercent === null
      ? true
      : memoryPercent < MEMORY_PRESSURE_THRESHOLD_PERCENT;

    try {
      const row = runSqliteRead('checkReadiness', () =>
        health.checkReady.get() as { is_ready: number } | undefined,
      );

      const databaseReady = row?.is_ready === 1;

      return {
        isReady: databaseReady && memoryReady,
        checks: {
          database: { isReady: databaseReady },
          memory: { isReady: memoryReady, usedPercent: memoryPercent },
        },
      };
    } catch {
      return {
        isReady: false,
        checks: {
          database: { isReady: false },
          memory: { isReady: memoryReady, usedPercent: memoryPercent },
        },
      };
    }
  }
}

export const operationsPlatformService = new OperationsPlatformService();
