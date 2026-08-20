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
 *
 * Persistence: reads outbox_emails, ses_events, system_job_runs,
 * system_alarm_events, system_config_current. Writes nothing.
 *
 * Side effects: none.
 *
 * Service shape: object-literal singleton (`systemHealthService`); no adapters.
 */
import { outbox, sesEvents, systemJobRuns } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { readIntConfig } from './configReader';
import { systemAlarmService } from './systemAlarmService';
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
   *  the dashboard renders them rather than assembling copy from counts. */
  attentionNotes: string[];
}

interface StatusCountRow { status: string; n: number }
interface TypeCountRow { event_type: string; n: number }

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

function windowStartIso(hours: number, nowMs: number): string {
  return new Date(nowMs - hours * HOUR_MS).toISOString();
}

// A year. The floor stops a zero or negative value emptying the page; the
// ceiling stops a large one producing a window start the date arithmetic cannot
// express, which throws the whole page rather than showing a wide window.
const MAX_WINDOW_HOURS = 8760;

function readWindowHours(): number {
  const configured = readIntConfig('system_health_window_hours', 24);
  return Math.min(MAX_WINDOW_HOURS, Math.max(1, configured));
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
    if (activeAlarmCount > 0) {
      attentionNotes.push(activeAlarmCount === 1
        ? 'One alarm is waiting for an administrator.'
        : `${activeAlarmCount} alarms are waiting for an administrator.`);
    }
    // The scheduled jobs are half of what the health page reports, so the badge
    // reads them too: a job failing, stuck mid-run, or that has never once
    // succeeded is exactly the quiet failure a dashboard exists to surface.
    const windowHours = readWindowHours();
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
    const windowHours = readWindowHours();
    const since = windowStartIso(windowHours, nowMs);

    // What was sent is a volume figure and is windowed; what is waiting or in
    // trouble is a backlog figure and is counted over all time, so a queue stuck
    // since before the window reads as stuck rather than as empty.
    const statusCounts = new Map<string, number>();
    for (const row of outbox.countByUnsentStatus.all() as StatusCountRow[]) {
      statusCounts.set(row.status, row.n);
    }
    statusCounts.set('sent', (outbox.countSentInWindow.get(since) as { n: number }).n);
    const backlogCount = (statusCounts.get('pending') ?? 0) + (statusCounts.get('sending') ?? 0);
    const deadLetterCount = (outbox.countDeadLetterAllTime.get() as { n: number }).n;
    const sendingPaused = readIntConfig('email_outbox_paused', 0) === 1;

    const feedbackCounts = new Map<string, number>();
    for (const row of sesEvents.countByTypeSince.all(since) as TypeCountRow[]) {
      feedbackCounts.set(row.event_type, row.n);
    }
    // The two halves are measured over the same window but not over the same
    // messages: the denominator is what was sent inside it, the numerator is
    // the feedback that arrived inside it, which can concern mail sent before
    // it. Nothing links a bounce back to the message that caused it, so a
    // cohort rate is not available; this is a volume comparison, and a busy
    // recovery period can put it above one hundred per cent.
    const sentInWindow = statusCounts.get('sent') ?? 0;
    const bounceCount = feedbackCounts.get('bounce') ?? 0;
    const complaintCount = feedbackCounts.get('complaint') ?? 0;

    const summaryRows = systemJobRuns.summarizeByJob.all(since, since) as JobSummaryRow[];
    const runRows = systemJobRuns.listRecentRuns.all(RECENT_RUN_LIMIT) as JobRunRow[];
    const activeAlarmCount = systemAlarmService.countActiveUnacknowledged();

    return {
      seo: { title: 'System Health', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_system_health', title: 'System Health' },
      content: {
        windowLabel: `the last ${windowHours} hour${windowHours === 1 ? '' : 's'}`,
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
