/**
 * SystemHealthService -- the operator's read view of platform health.
 *
 * Owns: the view model for the admin system-health page, and the small health
 * summary the admin dashboard shows as badges. Reads only; every number on the
 * page comes from data another service already wrote. Does not own: draining
 * the outbound-email queue (CommunicationService), running the scheduled jobs
 * or their run records (OperationsPlatformService), the per-message email log
 * (EmailLogService), or the alarm lifecycle (SystemAlarmService).
 *
 * Audience: admin only. The page reports volumes, statuses and timings, never
 * a recipient address or a message body: the per-message detail an operator
 * sometimes needs lives on the email log, which applies its own disclosure
 * rules, and this page links there rather than reproducing it.
 *
 * Required patterns:
 *   - The pause switch is reported, never operated. Pausing outbound email is
 *     an emergency lever whose home is the configuration surface; showing its
 *     state here so an operator is not misled by an empty queue is a different
 *     thing from offering the toggle.
 *   - Dead-lettered messages are counted over all time while everything else is
 *     counted over the configured window, because a message that exhausted its
 *     retries still needs attention after the window closes.
 *   - The window is read at request time from the administrator-configurable
 *     setting, floor-clamped so a bad value cannot produce an empty page.
 *   - The release rate and the bulk-stream halt are read from the same
 *     configuration keys and the same evaluation the drain itself uses, never
 *     recomputed here, so the page cannot report a pacing the worker is not
 *     actually applying.
 *
 * Persistence: reads outbox_emails, system_job_runs, system_alarm_events and
 * system_config_current directly, and reaches ses_events only through the
 * drain's own feedback evaluation rather than querying it a second time.
 * Writes nothing.
 *
 * Side effects: none.
 *
 * Service shape: object-literal singleton (`systemHealthService`); no adapters.
 */
import { outbox, systemJobRuns } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { readIntConfig, readHealthWindowHours } from './configReader';
import { systemAlarmService } from './systemAlarmService';
import { evaluateBulkFeedbackHalt } from './communicationService';
import type { PageViewModel } from '../types/page';

const RECENT_RUN_LIMIT = 25;
const HOUR_MS = 60 * 60 * 1000;

// Every status the outbox CHECK constraint admits, in the order an operator
// reads them: what is waiting, what is moving, what arrived, then the three
// kinds of trouble. Listing them here rather than deriving them from the rows
// present means a status with no messages shows as zero instead of vanishing.
const OUTBOX_STATUSES = [
  'pending', 'sending', 'sent', 'failed', 'dead_letter', 'manual_review',
] as const;

interface OutboxStatusViewModel {
  statusLabel: string;
  count: number;
  href: string;
}

interface JobHealthViewModel {
  jobName: string;
  lastStatusLabel: string;
  lastRunDisplay: string | null;
  lastSuccessDisplay: string | null;
  lastSuccessAgeLabel: string;
  runsInWindow: number;
  failuresInWindow: number;
  hasFailures: boolean;
  hasNeverSucceeded: boolean;
}

interface JobRunViewModel {
  jobName: string;
  startedAtDisplay: string;
  finishedAtDisplay: string | null;
  statusLabel: string;
  isFailure: boolean;
  lastError: string | null;
}

export interface SystemHealthContent {
  windowLabel: string;
  outbox: {
    statuses: OutboxStatusViewModel[];
    backlogCount: number;
    hasBacklog: boolean;
    deadLetterCount: number;
    hasDeadLetter: boolean;
    deadLetterHref: string;
    sendingPaused: boolean;
    pausedLabel: string;
  };
  /**
   * How the drain is releasing mail: the per-pass sizes, what is waiting on
   * each stream, and whether the bulk stream is currently stopped on feedback.
   * An operator running a staged send reads this to know whether the run is
   * moving, and an operator who sees a bulk backlog reads it to know why.
   */
  pacing: {
    passLimit: number;
    bulkPassLimit: number;
    pollIntervalSeconds: number;
    throughputNote: string;
    transactionalPending: number;
    bulkPending: number;
    hasBulkPending: boolean;
    bulkPaused: boolean;
    bulkHalted: boolean;
    bulkStateLabel: string;
    bulkHaltNote: string | null;
    bulkPausedNote: string | null;
  };
  delivery: {
    sentInWindow: number;
    bounceCount: number;
    complaintCount: number;
    bounceRateLabel: string;
    complaintRateLabel: string;
    hasSendVolume: boolean;
  };
  jobs: {
    summaries: JobHealthViewModel[];
    hasSummaries: boolean;
    recentRuns: JobRunViewModel[];
    hasRecentRuns: boolean;
  };
  alarms: {
    activeCount: number;
    hasActive: boolean;
    href: string;
  };
}

export interface SystemHealthBadges {
  deadLetterCount: number;
  activeAlarmCount: number;
  sendingPaused: boolean;
  hasUrgent: boolean;
  /** One finished sentence per thing wanting attention, already pluralized, so
   *  the dashboard renders them rather than assembling copy from counts.
   *
   *  Unacknowledged alarms are deliberately absent: `activeAlarmCount` carries
   *  that fact, and the dashboard gives alarms a row of their own with a link
   *  to the surface that acknowledges them. A sentence here as well would put
   *  the same condition in two places, where the second one leads nowhere. */
  attentionNotes: string[];
}

interface StatusCountRow { status: string; n: number }
interface StreamCountRow { stream: string; n: number }

interface JobSummaryRow {
  job_name: string;
  last_started_at: string | null;
  last_success_at: string | null;
  runs_in_window: number;
  failures_in_window: number;
  last_status: string | null;
}

interface JobRunRow {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  last_error: string | null;
}

// Stored timestamps are UTC. This page is read while an incident is being
// reconstructed, so the zone is on the face of the figure rather than assumed.
function tsDisplay(iso: string | null): string | null {
  return iso ? `${iso.slice(0, 19).replace('T', ' ')} UTC` : null;
}

function titleize(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** How long ago a timestamp was, in the coarsest unit that still reads
 *  usefully. An operator scanning this page wants "3 days ago", not a
 *  duration they have to subtract themselves. */
function ageLabel(iso: string | null, nowMs: number): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const minutes = Math.max(0, Math.floor((nowMs - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** A share of the send volume, to one decimal place, or a dash when nothing
 *  was sent in the window: zero out of zero is not a rate of nought. */
function rateLabel(numerator: number, denominator: number): string {
  if (denominator <= 0) return '--';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** A threshold stored in ten-thousandths, read back as the per cent it means. */
function per10kLabel(value: number): string {
  return `${value / 100}%`;
}

function windowLabelFor(hours: number): string {
  return `the last ${hours} hour${hours === 1 ? '' : 's'}`;
}

function windowStartIso(hours: number, nowMs: number): string {
  return new Date(nowMs - hours * HOUR_MS).toISOString();
}


export const systemHealthService = {
  /** The counts the admin dashboard shows as badges, without shaping the whole
   *  health page for them.
   *
   *  Reads run through the shared helper so a contended database renders the
   *  standard temporarily-unavailable page rather than falling to the generic
   *  handler, which shows the same page under a 500. */
  getHealthBadges(): SystemHealthBadges {
    return runSqliteRead('admin dashboard health badges', () => this.readHealthBadges());
  },

  readHealthBadges(): SystemHealthBadges {
    const deadLetterCount = (outbox.countDeadLetterAllTime.get() as { n: number }).n;
    const activeAlarmCount = systemAlarmService.countActiveUnacknowledged();
    const sendingPaused = readIntConfig('email_outbox_paused', 0) === 1;
    const attentionNotes: string[] = [];
    if (sendingPaused) attentionNotes.push('Email sending is paused.');
    if (deadLetterCount > 0) {
      attentionNotes.push(deadLetterCount === 1
        ? 'One message was dead-lettered.'
        : `${deadLetterCount} messages were dead-lettered.`);
    }
    // The scheduled jobs are half of what the health page reports, so the badge
    // reads them too: a job failing, stuck mid-run, or that has never once
    // succeeded is exactly the quiet failure a dashboard exists to surface.
    const windowHours = readHealthWindowHours();
    const since = windowStartIso(windowHours, Date.now());
    const jobRows = systemJobRuns.summarizeByJob.all(since, since) as JobSummaryRow[];
    const failing = jobRows.filter((r) => r.failures_in_window > 0).length;
    if (failing > 0) {
      attentionNotes.push(failing === 1
        ? 'One scheduled job failed recently.'
        : `${failing} scheduled jobs failed recently.`);
    }
    const neverSucceeded = jobRows.filter((r) => r.last_success_at === null).length;
    if (neverSucceeded > 0) {
      attentionNotes.push(neverSucceeded === 1
        ? 'One scheduled job has never succeeded.'
        : `${neverSucceeded} scheduled jobs have never succeeded.`);
    }
    const stuck = jobRows.filter((r) => r.last_status === 'running').length;
    if (stuck > 0) {
      attentionNotes.push(stuck === 1
        ? 'One scheduled job is still marked as running.'
        : `${stuck} scheduled jobs are still marked as running.`);
    }
    // A queue with items in it is normal; one whose oldest message predates the
    // window is a queue that has stopped moving.
    const oldestPending = (outbox.oldestPendingAt.get() as { oldest: string | null }).oldest;
    if (oldestPending !== null && oldestPending < since) {
      attentionNotes.push('Mail has been waiting to go out longer than the health window.');
    }
    return {
      deadLetterCount,
      activeAlarmCount,
      sendingPaused,
      hasUrgent: attentionNotes.length > 0,
      attentionNotes,
    };
  },

  getSystemHealthPage(): PageViewModel<SystemHealthContent> {
    return runSqliteRead('admin system health page', () => this.readSystemHealthPage());
  },

  readSystemHealthPage(): PageViewModel<SystemHealthContent> {
    const nowMs = Date.now();
    const windowHours = readHealthWindowHours();
    const since = windowStartIso(windowHours, nowMs);

    // What was sent is a volume figure and is windowed; what is waiting or in
    // trouble is a backlog figure and is counted over all time, so a queue stuck
    // since before the window reads as stuck rather than as empty.
    const statusCounts = new Map<string, number>();
    for (const row of outbox.countByUnsentStatus.all() as StatusCountRow[]) {
      statusCounts.set(row.status, row.n);
    }
    const backlogCount = (statusCounts.get('pending') ?? 0) + (statusCounts.get('sending') ?? 0);
    const deadLetterCount = (outbox.countDeadLetterAllTime.get() as { n: number }).n;
    const sendingPaused = readIntConfig('email_outbox_paused', 0) === 1;

    // The drain's own evaluation, which already carries the windowed sent count
    // and the feedback counts it judged on. Reading them back from it rather
    // than re-running the same two aggregates is what makes this page report
    // the figures the worker actually acted on, instead of a second set that
    // could differ by whatever landed between the two reads.
    const bulkPaused = readIntConfig('bulk_send_paused', 0) === 1;
    const halt = evaluateBulkFeedbackHalt(nowMs);
    // The two halves are measured over the same window but not over the same
    // messages: the denominator is what was sent inside it, the numerator is
    // the feedback that arrived inside it, which can concern mail sent before
    // it. Nothing links a bounce back to the message that caused it, so a
    // cohort rate is not available; this is a volume comparison, and a busy
    // recovery period can put it above one hundred per cent.
    const sentInWindow = halt.sentInWindow;
    const bounceCount = halt.bounceCount;
    const complaintCount = halt.complaintCount;
    statusCounts.set('sent', sentInWindow);

    // The drain's own view of itself, read from the same places the drain reads
    // it, so the page cannot report a pacing the worker is not using.
    const pendingByStream = new Map<string, number>();
    for (const row of outbox.countPendingByStream.all() as StreamCountRow[]) {
      pendingByStream.set(row.stream, row.n);
    }
    const bulkPending = pendingByStream.get('bulk') ?? 0;
    const passLimit = readIntConfig('outbox_batch_limit', 10);
    const bulkPassLimit = readIntConfig('outbox_bulk_batch_limit', 5);
    const pollIntervalSeconds = readIntConfig('outbox_poll_interval_seconds', 30);
    const haltLimitLabel = halt.reason === 'complaint_rate'
      ? per10kLabel(readIntConfig('complaint_rate_alarm_threshold_per_10k', 25))
      : per10kLabel(readIntConfig('bounce_rate_alarm_threshold_per_10k', 500));
    // Read back from the same ten-thousandths the halt compared, not recomputed
    // from the counts at a coarser precision. Rendering one decimal of percent
    // against a two-decimal threshold produces a notice that contradicts
    // itself: one complaint in 401 sent halts at exactly 25 per ten-thousand
    // and used to display "is 0.2% of what was sent, at or above the 0.25%
    // limit". The number shown has to be the number that decided.
    const haltRateLabel = halt.reason === 'complaint_rate'
      ? per10kLabel(halt.complaintPer10k)
      : per10kLabel(halt.bouncePer10k);
    const haltMeasure = halt.reason === 'complaint_rate' ? 'complaint rate' : 'bounce rate';

    const summaryRows = systemJobRuns.summarizeByJob.all(since, since) as JobSummaryRow[];
    const runRows = systemJobRuns.listRecentRuns.all(RECENT_RUN_LIMIT) as JobRunRow[];
    const activeAlarmCount = systemAlarmService.countActiveUnacknowledged();

    return {
      seo: { title: 'System Health', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_system_health', title: 'System Health' },
      content: {
        windowLabel: windowLabelFor(windowHours),
        outbox: {
          statuses: OUTBOX_STATUSES.map((status) => ({
            statusLabel: titleize(status),
            count: statusCounts.get(status) ?? 0,
            href: `/admin/email-log?status=${status}`,
          })),
          backlogCount,
          hasBacklog: backlogCount > 0,
          deadLetterCount,
          hasDeadLetter: deadLetterCount > 0,
          deadLetterHref: '/admin/email-log?status=dead_letter',
          sendingPaused,
          pausedLabel: sendingPaused ? 'Paused' : 'Draining',
        },
        pacing: {
          passLimit,
          bulkPassLimit,
          pollIntervalSeconds,
          throughputNote:
            `Up to ${passLimit} message${passLimit === 1 ? '' : 's'} every `
            + `${pollIntervalSeconds} second${pollIntervalSeconds === 1 ? '' : 's'}, `
            + `of which at most ${bulkPassLimit} may be bulk. Transactional mail fills `
            + 'each pass first, so a bulk run never delays it.',
          transactionalPending: pendingByStream.get('transactional') ?? 0,
          bulkPending,
          hasBulkPending: bulkPending > 0,
          bulkPaused,
          bulkHalted: halt.halted && !bulkPaused,
          // The operator switch outranks the feedback halt in what it says,
          // because it is the answer to "why has this stopped": somebody
          // stopped it, and no rate falling back will restart it.
          bulkStateLabel: bulkPaused
            ? 'Stopped by operator'
            : (halt.halted ? 'Stopped on feedback' : 'Draining'),
          bulkHaltNote: (halt.halted && !bulkPaused)
            ? `Bulk sending is stopped: the ${haltMeasure} over ${windowLabelFor(windowHours)} `
              + `is ${haltRateLabel} of what was sent, at or above the ${haltLimitLabel} limit. `
              + 'Transactional mail is unaffected and still going out. Sending resumes on its own '
              + 'once the rate falls back inside the window.'
            : null,
          bulkPausedNote: bulkPaused
            ? 'Bulk sending is stopped by an operator. Queued bulk messages are being kept, '
              + 'not discarded, and go out when it is cleared. Transactional mail is unaffected '
              + 'and still going out. This does not clear itself.'
            : null,
        },
        delivery: {
          sentInWindow,
          bounceCount,
          complaintCount,
          bounceRateLabel: rateLabel(bounceCount, sentInWindow),
          complaintRateLabel: rateLabel(complaintCount, sentInWindow),
          hasSendVolume: sentInWindow > 0,
        },
        jobs: {
          summaries: summaryRows.map((row) => ({
            jobName: row.job_name,
            lastStatusLabel: titleize(row.last_status ?? 'unknown'),
            lastRunDisplay: tsDisplay(row.last_started_at),
            lastSuccessDisplay: tsDisplay(row.last_success_at),
            lastSuccessAgeLabel: ageLabel(row.last_success_at, nowMs),
            runsInWindow: row.runs_in_window,
            failuresInWindow: row.failures_in_window,
            hasFailures: row.failures_in_window > 0,
            hasNeverSucceeded: row.last_success_at === null,
          })),
          hasSummaries: summaryRows.length > 0,
          recentRuns: runRows.map((row) => ({
            jobName: row.job_name,
            startedAtDisplay: tsDisplay(row.started_at) ?? row.started_at,
            finishedAtDisplay: tsDisplay(row.finished_at),
            statusLabel: titleize(row.status),
            isFailure: row.status === 'failed' || row.status === 'aborted',
            lastError: row.last_error,
          })),
          hasRecentRuns: runRows.length > 0,
        },
        alarms: {
          activeCount: activeAlarmCount,
          hasActive: activeAlarmCount > 0,
          href: '/admin/alarms',
        },
      },
    };
  },
};
