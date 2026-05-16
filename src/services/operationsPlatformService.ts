import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { health, systemJobRuns, workQueue, batchAutoLink, transaction } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { getCommunicationService, type ProcessBatchResult } from './communicationService';
import { readIntConfig } from './configReader';
import { logger } from '../config/logger';
import {
  runDailyPass as runActivePlayerExpiryDailyPass,
  type RunDailyPassResult,
  type RunOpts as ActivePlayerExpiryRunOpts,
} from './activePlayerExpiryService';
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

// memory.current includes page cache by design; this matches the value
// CWAgent emits as mem_used_percent so the readiness gate aligns with the
// host-side alarm threshold. Do not subtract cache.
export function readContainerMemoryUsedPercent(): number | null {
  const override = process.env.FOOTBAG_TEST_MEMORY_PERCENT;
  if (override !== undefined) {
    return override === 'null' ? null : Number(override);
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
   * SYS_Batch_Auto_Link cutover job (MIGRATION_PLAN §6, G24). Scans every
   * Tier 0 unlinked member with a verified email and runs the auto-link
   * classifier. High-confidence (tier1 / tier2) matches are queued into
   * `work_queue_items` for A_Review_Auto_Link_Matches; tier3 outcomes are
   * skipped (admins handle those via the regular work-queue). Idempotent:
   * a candidate with an existing open `auto_link_match` queue item is not
   * re-queued.
   *
   * Designed to run once at cutover after the legacy data dump is loaded.
   * Wrapped by recordJobRun for `system_job_runs` lifecycle visibility.
   */
  async runBatchAutoLink(): Promise<{
    scanned:     number;
    queued_high: number;
    queued_medium: number;
    skipped_low: number;
    skipped_already_queued: number;
    skipped_none: number;
    skipped_error: number;
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
        queued_high: 0,
        queued_medium: 0,
        skipped_low: 0,
        skipped_already_queued: 0,
        skipped_none: 0,
        skipped_error: 0,
      };
      const candidates = batchAutoLink.listCandidates.all() as Array<{ id: string }>;
      result.scanned = candidates.length;
      const nowIso = new Date().toISOString();
      for (const c of candidates) {
        let confidence: string | null = null;
        try {
          const classification = identityAccessService.getAutoLinkClassificationForMember(c.id);
          confidence = classification.confidence;
        } catch {
          result.skipped_error += 1;
          continue;
        }
        if (confidence === 'none') {
          result.skipped_none += 1;
          continue;
        }
        if (confidence === 'low') {
          result.skipped_low += 1;
          continue;
        }
        const existing = workQueue.findOpenByEntity.get('auto_link_match', 'member', c.id) as
          | { id: string }
          | undefined;
        if (existing) {
          result.skipped_already_queued += 1;
          continue;
        }
        const id = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
        // Per DD §5.4 + US §198: work_queue insert and admin-alerts fan-out
        // commit together.
        transaction(() => {
          workQueue.insertItem.run(
            id,
            nowIso, 'system',
            nowIso, 'system',
            'membership',
            'auto_link_match',
            'member',
            c.id,
            confidence === 'high' ? 10 : 5,
            nowIso,
            `Batch auto-link match (${confidence})`,
          );
          getCommunicationService().enqueueMailingListEmail({
            mailingListSlug:      'admin-alerts',
            subject:              `New admin queue item: auto_link_match`,
            bodyText:             `Task type: auto_link_match\nEntity ID: ${c.id}`,
            idempotencyKeyPrefix: `admin-alerts:auto_link_match:${c.id}`,
          });
        });
        if (confidence === 'high') result.queued_high += 1;
        else if (confidence === 'medium') result.queued_medium += 1;
      }
      logger.info('SYS_Batch_Auto_Link run', result);
      return result;
    });
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
