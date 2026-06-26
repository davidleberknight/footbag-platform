/**
 * OperationsPlatformService -- operational health and background-job
 * orchestration.
 *
 * Owns:
 *   - Readiness composition for GET /health/ready (database probe + container
 *     memory pressure)
 *   - The system_job_runs lifecycle wrapper (`recordJobRun`): insert on start,
 *     succeeded/failed on completion, stale-running reap for crash recovery
 *   - Worker-loop entry points and their config-tunable intervals: outbox
 *     drain, Active Player expiry, staged-candidate expiry, batch auto-link,
 *     PII purge scan, hashtag-stats rebuild
 *   - Batch auto-link routing: classify unlinked Tier-0 members; stage
 *     high/medium-confidence candidates, queue low-confidence ones with an
 *     admin alert
 *   - PII purge eligibility: which members' grace windows have expired and
 *     which erasure shape applies (full purge for soft-deleted accounts,
 *     contact scrub for deceased ones), plus anonymizing payments past the
 *     compliance-retention window (ballots are out of scope: destroying IFPA
 *     vote records is an IFPA governance decision, not an operator job)
 *
 * Does not own:
 *   - The delegated job bodies (ActivePlayerExpiryService,
 *     IdentityAccessService classification/staging, CommunicationService drain)
 *   - Outbox row mechanics (CommunicationService)
 *   - Row-level PII erasure (MemberService primitives)
 *
 * Required patterns:
 *   - Every periodic job runs through `recordJobRun` so operators can see
 *     last-run status and failures in system_job_runs.
 *   - The PII purge scan keeps separate soft-deleted vs deceased branches
 *     with distinct grace configs (member_cleanup_grace_days,
 *     deceased_cleanup_grace_days) read at runtime; the two grace rules are
 *     never collapsed.
 *   - Batch auto-link is idempotent per member: already-linked, already-staged,
 *     and declined candidates are skipped on re-run; each low-confidence
 *     work-queue insert + admin-alert enqueue commits in one transaction.
 *   - Interval getters clamp config floors so a bad value cannot hot-loop a
 *     worker.
 *
 * Persistence:
 *   system_job_runs, work_queue_items, outbox_emails (backlog read +
 *   mailing-list enqueue), members (purge-eligibility read), payments
 *   (compliance-retention read + anonymize write), health (read).
 *
 * Side effects:
 *   - system_job_runs insert/update
 *   - work_queue_items insert (auto_link_match, low confidence)
 *   - outbox_emails enqueue (admin-alerts fan-out)
 *   - payments anonymize-write (compliance-retention cleanup)
 *   - audit_entries append (legacy.auto_link_candidate_failed,
 *     pii_erasure_failed, and payment.compliance_anonymize_failed operational
 *     errors; the per-row erasure audit rows belong to MemberService)
 *   - logger.error on job failure (drives the CloudWatch alarm)
 *
 * Service shape: class singleton (`operationsPlatformService`); adapters are
 * obtained via singleton getters inside method bodies.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { health, systemJobRuns, workQueue, batchAutoLink, memberPurge, outbox, payments, transaction } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { memberService } from './memberService';
import { hashtagDiscoveryService } from './hashtagDiscoveryService';
import { recordOperationalError } from './operationalErrors';
import { getCommunicationService, type ProcessBatchResult } from './communicationService';
import { emailService } from './emailService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
import { logger } from '../config/logger';
import {
  runDailyPass as runActivePlayerExpiryDailyPass,
  type RunDailyPassResult,
  type RunOpts as ActivePlayerExpiryRunOpts,
} from './activePlayerExpiryService';
import { identityAccessService } from './identityAccessService';

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
  // IFPA vote records is an IFPA governance decision, not an operator job.
  payments: {
    eligible: number;
    anonymized: number;
    skipped: number;
    errors: { paymentId: string; error: string }[];
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

  /** Deliverable email backlog (pending + sending rows); the worker logs it
   * each cycle for the CloudWatch outbox-depth alarm. */
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
      const finishedAt = new Date().toISOString();
      systemJobRuns.markSucceeded.run(
        finishedAt,
        JSON.stringify(result),
        finishedAt,
        jobRunId,
      );
      logger.info(`${jobName}: succeeded`, { jobRunId });
      return result;
    } catch (err) {
      const finishedAt = new Date().toISOString();
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
   * Returns the daily-tick interval for the AP expiry worker, in
   * milliseconds. Reads from system_config; clamped to a one-minute floor
   * to prevent a misconfiguration from pinning the worker in a tight loop.
   */
  getActivePlayerExpiryIntervalMs(): number {
    const seconds = readIntConfig('active_player_expiry_check_interval_seconds', 86400);
    const clamped = Math.max(60, seconds);
    return clamped * 1000;
  }

  /**
   * SYS_Batch_Auto_Link cutover job (stage-and-confirm). Scans every Tier 0
   * unlinked member with a verified email and runs the auto-link classifier:
   *
   *   - high / medium → stage a candidate row in auto_link_staged_candidates
   *     plus a `legacy.auto_link_candidate_staged` audit event. NO live-table
   *     mutation, NO email. The member confirms or declines the candidate
   *     from the wizard card at next sign-in.
   *   - low  → admin work queue (`auto_link_match`) with an `admin-alerts`
   *     fan-out, so an administrator can resolve the case manually.
   *   - none / error → counter-only skip.
   *
   * Idempotent. Members already linked are skipped via the candidate-scan
   * filter; on re-run, an existing open staged row for the same member/target
   * pair is a unique-constraint no-op (`skipped_already_staged`), and a pair
   * the member declined is never re-staged.
   *
   * Designed to run once at cutover after the legacy data dump is loaded.
   * Wrapped by recordJobRun for `system_job_runs` lifecycle visibility.
   */
  async runBatchAutoLink(): Promise<{
    scanned:                 number;
    staged_high:             number;
    staged_medium:           number;
    queued_low:              number;
    skipped_low_already_queued: number;
    skipped_already_staged:  number;
    skipped_previously_declined: number;
    skipped_already_linked:  number;
    skipped_no_legacy_for_hp: number;
    skipped_legacy_claimed_by_other: number;
    skipped_none:            number;
    skipped_error:           number;
  }> {
    // Reap any stale 'running' rows from a prior aborted invocation before
    // starting a new one. SIGKILL / OOM / process-replace can leave a row in
    // 'running' indefinitely because markSucceeded / markFailed only fire on
    // a clean callback return / throw. Threshold of 1h is well above the
    // expected runtime for this batch and well below "operator might want to
    // see it as still running."
    const STALE_RUNNING_THRESHOLD_MS = 60 * 60 * 1000;
    const reapCutoffIso = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS).toISOString();
    const reapNowIso = new Date().toISOString();
    systemJobRuns.reapStaleRunning.run(
      reapNowIso,
      reapNowIso,
      'SYS_Batch_Auto_Link',
      reapCutoffIso,
    );

    return this.recordJobRun('SYS_Batch_Auto_Link', () => {
      const result = {
        scanned: 0,
        staged_high: 0,
        staged_medium: 0,
        queued_low: 0,
        skipped_low_already_queued: 0,
        skipped_already_staged: 0,
        skipped_previously_declined: 0,
        skipped_already_linked: 0,
        skipped_no_legacy_for_hp: 0,
        skipped_legacy_claimed_by_other: 0,
        skipped_none: 0,
        skipped_error: 0,
      };
      const candidates = batchAutoLink.listCandidates.all() as Array<{ id: string }>;
      result.scanned = candidates.length;
      for (const c of candidates) {
        let classification;
        try {
          classification = identityAccessService.getAutoLinkClassificationForMember(c.id);
        } catch (err) {
          recordOperationalError({
            actionType: 'legacy.auto_link_candidate_failed',
            category:   'identity',
            entityType: 'member',
            entityId:   c.id,
            reasonText: 'Cutover batch auto-link: classifying a candidate threw',
            cause:      err,
          });
          result.skipped_error += 1;
          continue;
        }
        if (classification.confidence === 'none') {
          result.skipped_none += 1;
          continue;
        }
        if (classification.confidence === 'low') {
          // Low-confidence cases route to admin review via work queue with
          // an admin-alerts fan-out. Idempotent: re-runs collapse onto the
          // existing open work_queue_items row.
          const existing = workQueue.findOpenByEntity.get('auto_link_match', 'member', c.id) as
            | { id: string }
            | undefined;
          if (existing) {
            result.skipped_low_already_queued += 1;
            continue;
          }
          const nowIso = new Date().toISOString();
          const id = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
          transaction(() => {
            workQueue.insertItem.run(
              id,
              nowIso, 'system',
              nowIso, 'system',
              'membership',
              'auto_link_match',
              'member',
              c.id,
              5,
              nowIso,
              `Batch auto-link match (low)`,
              null,
            );
            emailService.sendToAdmins({
              template: 'admin_queue_alert',
              params: { taskType: 'auto_link_match', entityId: c.id },
              idempotencyKeyPrefix: `admin-alerts:auto_link_match:${c.id}`,
            });
          });
          result.queued_low += 1;
          continue;
        }

        // High or medium: stage a candidate for member confirmation.
        let outcome;
        try {
          outcome = identityAccessService.stageAutoLinkCandidate(
            c.id,
            {
              confidence:   classification.confidence,
              personId:     classification.personId,
              personName:   classification.personName,
              anchorSource: classification.anchorSource,
              ...(classification.confidence === 'medium'
                ? { matchedVariantNormalized: classification.matchedVariantNormalized }
                : {}),
            },
            'batch',
          );
        } catch (err) {
          recordOperationalError({
            actionType: 'legacy.auto_link_candidate_failed',
            category:   'identity',
            entityType: 'member',
            entityId:   c.id,
            reasonText: 'Cutover batch auto-link: staging a candidate threw',
            cause:      err,
          });
          result.skipped_error += 1;
          continue;
        }

        switch (outcome.status) {
          case 'staged':
            if (outcome.confidence === 'high') result.staged_high += 1;
            else result.staged_medium += 1;
            break;
          case 'already_staged':
            result.skipped_already_staged += 1;
            break;
          case 'skipped_previously_declined':
            result.skipped_previously_declined += 1;
            break;
          case 'skipped_already_linked':
            result.skipped_already_linked += 1;
            break;
          case 'skipped_no_legacy_for_hp':
            result.skipped_no_legacy_for_hp += 1;
            break;
          case 'skipped_legacy_claimed_by_other':
            result.skipped_legacy_claimed_by_other += 1;
            break;
        }
      }
      logger.info('SYS_Batch_Auto_Link run', result);
      return result;
    });
  }

  /**
   * SYS_Staged_Candidate_Expiry sweep. Marks open auto-link staged
   * candidates whose expiry window has passed as 'expired', emitting one
   * `legacy.auto_link_candidate_expired` audit event per row. Idempotent:
   * the terminal-status guard makes re-sweeping a no-op. Runs on the worker
   * daily tick alongside the other daily jobs.
   */
  async runStagedCandidateExpiry(): Promise<{ expired: number }> {
    return this.recordJobRun('SYS_Staged_Candidate_Expiry', () =>
      identityAccessService.expireStagedCandidates(),
    );
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
   * counted, and the scan continues. Runs on the worker daily tick.
   *
   * A third branch anonymizes payments past the compliance-retention window
   * (member-linking PII stripped, anonymized financial record kept), idempotent
   * via the member_id-not-null marker. Vote ballots are deliberately not
   * touched: their retention window only permits cleanup, and destroying IFPA
   * vote records is an IFPA governance decision rather than an operator job.
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
            category:   'member',
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
            category:   'member',
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
            category:   'payments',
            entityType: 'payment',
            entityId:   id,
            reasonText: 'PII purge scan: compliance-retention anonymization of an aged payment failed',
            cause:      err,
          });
        }
      }

      return { deleted, deceased, payments: paymentsResult };
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
