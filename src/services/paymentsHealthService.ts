/**
 * PaymentsHealthService -- the administrator's read view of payments health.
 *
 * Owns: the view model for the admin payments-health page. Reads only; every
 * figure comes from data another service already wrote, or from configuration
 * this process already holds. Does not own: the payment lifecycle
 * (PaymentService), the reconciliation comparison and its issue queue
 * (PaymentReconciliationService), or the per-payment admin lists, which live on
 * the All Payments and Reconciliation Issues views this page links to.
 *
 * Audience: admin only. The page reports modes, timings, counts and volumes,
 * never a payment's own detail and never anything derived from a credential
 * beyond which mode it is in.
 *
 * Required patterns:
 *   - Read-only. The page offers no control at all. Halting payments and
 *     rotating keys are System Administrator actions run by script: the
 *     payments pause flag has no application write path, and disarming
 *     additionally requires the provider's webhook endpoint be disabled first.
 *     Where a panel shows a warning, it names the operator procedure that
 *     clears it rather than offering a button that cannot exist.
 *   - The credential panel reports the mode of the key the running process
 *     actually holds beside the mode the deployment declared. A half-applied
 *     arming change is invisible any other way, because the declared value and
 *     the running value disagree silently. It shows no key identifier, no
 *     fragment of a key, and no key age: an application administrator cannot
 *     act on any of those, and the operator who can has better records at the
 *     provider.
 *   - Webhook failures are counted, not listed. The counter table holds
 *     five-minute buckets per reason; the provider's own dashboard holds the
 *     per-delivery detail this page links to instead of reproducing.
 *   - Silence is a distinct symptom from failure. An endpoint the provider has
 *     disabled produces neither successes nor failures, so the time since the
 *     last processed delivery is its own panel with its own warning.
 *   - Volume is grouped by currency as well as by category. Summing across
 *     currencies would produce a figure true of neither.
 *   - The window is read at request time from the administrator-configurable
 *     setting, clamped so a bad value cannot empty the page or throw it.
 *
 * Persistence: reads stripe_events, stripe_webhook_failures, payments,
 * reconciliation_issues, system_config_current. Writes nothing.
 *
 * Side effects: none.
 *
 * Service shape: object-literal singleton (`paymentsHealthService`). It reaches
 * the payment adapter through the standard accessor for one synchronous
 * question -- which mode the loaded credential is in -- and makes no provider
 * call: a page whose job is reporting whether an external dependency is healthy
 * must not depend on that dependency to render.
 */
import { paymentVolume, stripeEvents, stripeWebhookFailures, systemConfig } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
import { getPaymentAdapter } from '../adapters/paymentAdapter';
import {
  paymentReconciliationService,
  PROVIDER_BOOK_OF_RECORD_LINE,
} from './paymentReconciliationService';
import type { PageViewModel } from '../types/page';

/** The one-line disclosure beside the volume figures, or null when the window
 *  held nothing but real money. Same wording as the All Payments totals. */
function volumeExclusionLineFor(rows: Array<{ mode: string; n: number }>): string | null {
  if (rows.length === 0) return null;
  const testCount = rows.find((r) => r.mode === 'test')?.n ?? 0;
  const unknownCount = rows.find((r) => r.mode === 'unknown')?.n ?? 0;
  const parts: string[] = [];
  if (testCount > 0) parts.push(`${testCount} test-mode payment${testCount === 1 ? '' : 's'}`);
  if (unknownCount > 0) {
    parts.push(
      `${unknownCount} payment${unknownCount === 1 ? '' : 's'} whose provider mode was never recorded`,
    );
  }
  return `These figures count real money only. Set aside: ${parts.join(' and ')}.`;
}

const HOUR_MS = 60 * 60 * 1000;
/** A year. The floor stops a zero or negative configured value emptying the
 *  page; the ceiling stops a large one producing a window start the date
 *  arithmetic cannot express, which would throw the page rather than widen it. */
const MAX_WINDOW_HOURS = 8760;

/** Every reason the counter table admits, in the order an administrator reads
 *  them: the one that means a secret mismatch first. Listing them here rather
 *  than deriving them from the rows present means a reason with no failures
 *  shows as zero instead of vanishing, which is the difference between "none"
 *  and "not measured". */
const FAILURE_REASONS = ['signature', 'recoverable', 'error'] as const;
type FailureReason = (typeof FAILURE_REASONS)[number];

const REASON_LABELS: Record<FailureReason, string> = {
  signature: 'Signature rejected',
  recoverable: 'Processing failed, retry asked for',
  error: 'Unexpected error',
};

/** What an administrator should do about each, since none of the remedies is
 *  theirs to apply. Named on the page so a warning is actionable rather than
 *  alarming. */
const REASON_REMEDIES: Record<FailureReason, string> = {
  signature:
    'Usually a signing secret rotated on one side only. A System Administrator '
    + 'compares the provider endpoint secret with the one in the parameter store.',
  recoverable:
    'The provider will retry. Sustained failures need a System Administrator to '
    + 'read the application log for the reason.',
  error:
    'An unhandled failure. A System Administrator reads the application log; the '
    + 'operator error alarm fires on these too.',
};

/** How long the platform may hear nothing before silence is itself the finding.
 *  A quiet community site legitimately takes no payments overnight, so this is
 *  deliberately generous: it is watching for an endpoint the provider disabled,
 *  not for a slow evening. */
const WEBHOOK_SILENCE_WARNING_HOURS = 72;

interface FailureRow {
  reason: string;
  n: number;
  last_seen_at: string | null;
  last_event_id: string | null;
}

interface VolumeRow {
  payment_type: string;
  currency: string;
  n: number;
  total_cents: number;
}

interface FailureViewModel {
  reasonLabel: string;
  count: number;
  hasFailures: boolean;
  lastSeenDisplay: string | null;
  lastEventId: string | null;
  remedy: string;
}

interface VolumeViewModel {
  categoryLabel: string;
  currency: string;
  count: number;
  totalDisplay: string;
}

export interface PaymentsHealthContent {
  windowLabel: string;
  credential: {
    runningModeLabel: string;
    declaredModeLabel: string;
    /** When the declared mode last changed, from the boot-time record; null
     *  until a process has recorded one. */
    declaredSinceDisplay: string | null;
    isLiveMoney: boolean;
    /** True when the running credential and the declared arming state
     *  disagree, which is what a half-applied arming change looks like. */
    hasModeDisagreement: boolean;
    disagreementNote: string | null;
    paused: boolean;
    pausedNote: string | null;
  };
  webhooks: {
    lastProcessedDisplay: string | null;
    lastProcessedAgeLabel: string;
    hasEverProcessed: boolean;
    isSilent: boolean;
    silenceNote: string;
    failures: FailureViewModel[];
    totalFailures: number;
    hasFailures: boolean;
    providerLogNote: string;
  };
  volume: {
    rows: VolumeViewModel[];
    hasRows: boolean;
    /** What the figures left out, live rows only being counted. */
    exclusionLine: string | null;
    hasExclusion: boolean;
    providerBoundaryLine: string;
  };
  reconciliation: {
    outstandingCount: number;
    hasOutstanding: boolean;
    href: string;
  };
  links: {
    allPaymentsHref: string;
    reconciliationHref: string;
    reportsHref: string;
  };
}

/** Stored timestamps are UTC. This page is read while something is being
 *  worked out, so the zone is on the face of the figure rather than assumed. */
function tsDisplay(iso: string | null): string | null {
  return iso ? `${iso.slice(0, 19).replace('T', ' ')} UTC` : null;
}

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

function categoryLabel(paymentType: string): string {
  switch (paymentType) {
    case 'donation': return 'Donations';
    case 'membership': return 'Membership dues';
    case 'event_registration': return 'Event registrations';
    default: return paymentType.replace(/_/g, ' ');
  }
}

/** Amount with its own currency code and no invented symbol: a dollar sign in
 *  front of a euro total is a false statement about money. */
function amountDisplay(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function readWindowHours(): number {
  const configured = readIntConfig('system_health_window_hours', 24);
  return Math.min(MAX_WINDOW_HOURS, Math.max(1, configured));
}

function runningModeLabel(mode: 'live' | 'test' | 'unknown'): string {
  switch (mode) {
    case 'live': return 'Live';
    case 'test': return 'Test';
    default: return 'Not yet loaded';
  }
}

export const paymentsHealthService = {
  /**
   * The admin payments-health page.
   *
   * Reads run through the shared helper so a contended database renders the
   * standard temporarily-unavailable page rather than falling to the generic
   * handler, which shows the same page under a 500.
   */
  getPaymentsHealthPage(): PageViewModel<PaymentsHealthContent> {
    return runSqliteRead('admin payments health page', () => this.readPaymentsHealthPage());
  },

  readPaymentsHealthPage(): PageViewModel<PaymentsHealthContent> {
    const nowMs = Date.now();
    const windowHours = readWindowHours();
    const windowStart = new Date(nowMs - windowHours * HOUR_MS).toISOString();

    const runningMode = getPaymentAdapter().loadedCredentialMode();
    const declaredArmed = config.paymentsArmed === 'armed';
    const declaredModeLabel = declaredArmed ? 'Armed (live money)' : 'Dark (no money moves)';
    // The boot-time observation of the declared mode; its effective time is
    // when the declaration last changed, read locally rather than from the
    // parameter store this page must never call.
    const declaredRow = systemConfig.getCurrentRowByKey.get('payments_declared_mode') as
      | { value_json: string; effective_start_at: string }
      | undefined;
    const declaredSinceDisplay = declaredRow ? tsDisplay(declaredRow.effective_start_at) : null;
    // A running live credential under a dark declaration, or the reverse, is
    // the half-applied arming state that is otherwise invisible. 'unknown' is
    // not a disagreement: nothing has reached the provider since boot.
    //
    // Production only, because below it the two figures are not comparable:
    // the arming switch has no meaning outside production and defaults to
    // armed, while the adapter is always the stub and always reports test. The
    // comparison there is a default against a constant, so it would warn
    // permanently in development and staging — and a banner that is always on
    // is a banner nobody reads, which is exactly what this one cannot afford
    // to become.
    const hasModeDisagreement =
      config.footbagEnv === 'production'
      && ((runningMode === 'live' && !declaredArmed)
        || (runningMode === 'test' && declaredArmed));

    const paused = readIntConfig('payments_paused', 0) === 1;

    const lastProcessedAt = (stripeEvents.lastProcessedAt.get() as
      { last_processed_at: string | null }).last_processed_at;
    const silentForMs = lastProcessedAt ? nowMs - new Date(lastProcessedAt).getTime() : Infinity;
    const isSilent = silentForMs > WEBHOOK_SILENCE_WARNING_HOURS * HOUR_MS;

    const failureRows = stripeWebhookFailures.countsInWindow.all(
      windowStart, windowStart,
    ) as FailureRow[];
    const byReason = new Map(failureRows.map((r) => [r.reason, r]));
    const failures: FailureViewModel[] = FAILURE_REASONS.map((reason) => {
      const row = byReason.get(reason);
      const count = row?.n ?? 0;
      return {
        reasonLabel: REASON_LABELS[reason],
        count,
        hasFailures: count > 0,
        lastSeenDisplay: tsDisplay(row?.last_seen_at ?? null),
        lastEventId: row?.last_event_id ?? null,
        remedy: REASON_REMEDIES[reason],
      };
    });
    const totalFailures = failures.reduce((sum, f) => sum + f.count, 0);

    const volumeRows = paymentVolume.byTypeSince.all(windowStart) as VolumeRow[];
    const volume = volumeRows.map((row) => ({
      categoryLabel: categoryLabel(row.payment_type),
      currency: row.currency.toUpperCase(),
      count: row.n,
      totalDisplay: amountDisplay(row.total_cents, row.currency),
    }));
    const volumeExclusionLine = volumeExclusionLineFor(
      paymentVolume.excludedSince.all(windowStart) as Array<{ mode: string; n: number }>,
    );

    const outstandingCount = paymentReconciliationService.countOutstandingIssues();

    return {
      seo: { title: 'Payments Health', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_payments_health', title: 'Payments Health' },
      content: {
        windowLabel: `the last ${windowHours} hour${windowHours === 1 ? '' : 's'}`,
        credential: {
          runningModeLabel: runningModeLabel(runningMode),
          declaredModeLabel,
          declaredSinceDisplay,
          isLiveMoney: runningMode === 'live',
          hasModeDisagreement,
          disagreementNote: hasModeDisagreement
            ? 'The credential this process is running with does not match the declared '
              + 'arming state. That is what a half-applied arming change looks like. A '
              + 'System Administrator re-runs the arming script to settle it.'
            : null,
          paused,
          pausedNote: paused
            ? 'New purchases and donations are refused. Webhooks are still processed, so '
              + 'payments already in flight settle normally. A System Administrator clears '
              + 'this with the payments-pause script.'
            : null,
        },
        webhooks: {
          lastProcessedDisplay: tsDisplay(lastProcessedAt),
          lastProcessedAgeLabel: ageLabel(lastProcessedAt, nowMs),
          hasEverProcessed: lastProcessedAt !== null,
          isSilent,
          silenceNote:
            `Nothing has been processed for more than ${WEBHOOK_SILENCE_WARNING_HOURS} hours. `
            + 'A quiet period looks the same as an endpoint the provider has disabled, so '
            + 'a System Administrator checks the endpoint in the provider dashboard.',
          failures,
          totalFailures,
          hasFailures: totalFailures > 0,
          providerLogNote:
            'The provider keeps the request and this platform\'s response for every '
            + 'individual delivery. Read it in the provider dashboard; it is not '
            + 'reproduced here.',
        },
        volume: {
          rows: volume,
          hasRows: volume.length > 0,
          exclusionLine: volumeExclusionLine,
          hasExclusion: volumeExclusionLine !== null,
          providerBoundaryLine: PROVIDER_BOOK_OF_RECORD_LINE,
        },
        reconciliation: {
          outstandingCount,
          hasOutstanding: outstandingCount > 0,
          href: '/admin/payments/reconciliation',
        },
        links: {
          allPaymentsHref: '/admin/payments',
          reconciliationHref: '/admin/payments/reconciliation',
          reportsHref: '/admin/payments/reports',
        },
      },
    };
  },
};
