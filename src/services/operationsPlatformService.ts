import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { health, systemJobRuns, workQueue, batchAutoLink, outbox, transaction } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { getCommunicationService, type ProcessBatchResult } from './communicationService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
import { logger } from '../config/logger';
import {
  runDailyPass as runActivePlayerExpiryDailyPass,
  type RunDailyPassResult,
  type RunOpts as ActivePlayerExpiryRunOpts,
} from './activePlayerExpiryService';
import {
  runDailyPass as runHofBapAdminDigestDailyPass,
  type HofBapDigestRunResult,
  type HofBapDigestRunOpts,
} from './hofBapAdminDigestService';
import { identityAccessService } from './identityAccessService';

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
   * SYS_HoF_BAP_Admin_Digest daily entry point. Delegates the lookback
   * scan + mailing-list enqueue to the digest service; wraps the call
   * with `recordJobRun` so admin tooling sees one `system_job_runs` row
   * per pass.
   */
  async runHofBapAdminDigest(
    opts: HofBapDigestRunOpts = {},
  ): Promise<HofBapDigestRunResult> {
    return this.recordJobRun(
      'SYS_HoF_BAP_Admin_Digest',
      () => runHofBapAdminDigestDailyPass(opts),
      opts.now,
    );
  }

  /**
   * Returns the daily-tick interval for the HoF/BAP digest worker, in
   * milliseconds. Reads from system_config; clamped to a one-minute floor.
   */
  getHofBapAdminDigestIntervalMs(): number {
    const seconds = readIntConfig('hof_bap_digest_check_interval_seconds', 86400);
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
        } catch {
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
            );
            getCommunicationService().enqueueMailingListEmail({
              mailingListSlug:      'admin-alerts',
              subject:              `New admin queue item: auto_link_match`,
              bodyText:             `Task type: auto_link_match\nEntity ID: ${c.id}`,
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
        } catch {
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
