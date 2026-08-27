/**
 * AdminDashboardService -- the administrator's landing page.
 *
 * Owns: the view model for the admin dashboard, and nothing else. Every number
 * on it is computed by the service that owns the underlying queue; this one
 * decides only how those numbers are ranked, worded and linked. Does not own
 * any queue, any count, or any of the surfaces it points at.
 *
 * Audience: admin only, behind the router's own gate. It shows counts and
 * queue names, never a member's personal data: a figure tells an admin where
 * to go, and the surface they arrive at applies its own disclosure rules.
 *
 * Required patterns:
 *   - Counts and doors, never controls. The dashboard is a read-only view and
 *     every state change happens on the surface that owns the work, so nothing
 *     here submits anything and loading the page writes no audit row.
 *   - Needs You Now renders only rows that are non-zero, and disappears
 *     entirely when nothing needs a decision, because its absence is the
 *     fastest way to answer "is anything on fire".
 *   - Work Waiting always renders, zeros included, so the queue inventory is
 *     learned once rather than guessed at from what happens to be showing.
 *   - Only categories something can actually enqueue into appear. A permanent
 *     zero for a queue no producer writes to reads as "nothing waiting" when
 *     the truth is "this cannot happen yet".
 *   - What is yours is decided by the digest's rule, read through the same two
 *     helpers, so this page and the digest email never disagree about it.
 *   - Colour marks only what wants acting on. A healthy platform is stated in
 *     words against the neutral treatment; there is no success colour in this
 *     design system and a green badge announcing that nothing happened teaches
 *     the reader to skip the block.
 *   - The roster is a link here, never a figure. Its summary read is audited
 *     as a roster access, and an admin opening their home page has not looked
 *     at the roster.
 *
 * Persistence: reads nothing directly. Composes the badge reads the club
 * cleanup, admin work-queue, payment reconciliation and system-health services
 * expose. Writes nothing.
 *
 * Side effects: none.
 *
 * Service shape: object-literal singleton (`adminDashboardService`); no
 * adapters.
 */
import type { NavLink, PageViewModel } from '../types/page';
import { clubCleanupService } from './clubCleanupService';
import {
  adminWorkQueueService,
  LIVE_WORK_QUEUE_CATEGORIES,
  WORK_QUEUE_CATEGORY_LABELS,
} from './adminWorkQueueService';
import { paymentReconciliationService } from './paymentReconciliationService';
import { systemHealthService } from './systemHealthService';
import { runSqliteRead } from './sqliteRetry';

/**
 * One queue on the dashboard. The badge treatment is chosen in the template
 * from these two booleans rather than named here, so the stylesheet vocabulary
 * stays in the stylesheet and the template's branch stays a pre-shaped flag.
 */
export interface DashboardQueueRow {
  key: string;
  label: string;
  href: string;
  /** The count as it reads on the badge, already pluralized and unit-bearing. */
  countLabel: string;
  /** A second line where the queue has one: an age, or a split of the count. */
  metaLabel: string | null;
  isUrgent: boolean;
  isZero: boolean;
}

/** One read-only figure in the system-status tile. */
export interface DashboardStatusFact {
  label: string;
  value: string;
}

/**
 * The platform's own state, always shown and always saying which it is, so an
 * administrator arriving to ask "is anything broken" gets a worded answer
 * rather than figures to interpret.
 */
export interface DashboardSystemStatus {
  statusLabel: string;
  isOk: boolean;
  /** What is wrong, in finished sentences. Empty when nothing is. */
  notes: string[];
  /** Only the figures that are themselves the exception. Empty when healthy. */
  facts: DashboardStatusFact[];
  hasFacts: boolean;
  links: NavLink[];
}

/** What this administrator is personally holding. */
export interface DashboardOwnWork {
  countLabel: string;
  detail: string;
  href: string;
  isZero: boolean;
}

/** One column of the tool directory. */
export interface DashboardLinkGroup {
  title: string;
  links: NavLink[];
}

export interface AdminDashboardContent {
  needsYouNow: DashboardQueueRow[];
  hasNeedsYouNow: boolean;
  workWaiting: DashboardQueueRow[];
  ownWork: DashboardOwnWork;
  systemStatus: DashboardSystemStatus;
  toolGroups: DashboardLinkGroup[];
}

/** "3 open" / "1 open", so a badge never reads "1 items". */
function openLabel(n: number): string {
  return `${n} open`;
}

/**
 * The navigation half of the page. Fixed rather than derived: these are
 * destinations an administrator learns the position of, and a list that
 * reorders itself as counts change would defeat that. The queues are absent
 * because they have rows of their own above, which always render.
 */
const TOOL_GROUPS: DashboardLinkGroup[] = [
  {
    title: 'Members and Roster',
    links: [
      { label: 'Members', href: '/admin/members' },
      { label: 'Official IFPA Roster', href: '/ifpa/roster' },
      { label: 'Historical Records', href: '/admin/historical-records' },
      { label: 'Club Leadership', href: '/admin/clubs/leadership' },
    ],
  },
  {
    title: 'Content',
    links: [
      { label: 'Curated Media', href: '/admin/curator/media' },
      { label: 'Upload Media', href: '/admin/curator/upload' },
      { label: 'Galleries', href: '/admin/curator/galleries' },
      { label: 'Freestyle Tricks', href: '/admin/freestyle/tricks' },
      { label: 'Trick Tips', href: '/admin/freestyle/tips' },
      { label: 'Freestyle Records', href: '/admin/freestyle/records' },
      { label: 'Consecutive Records', href: '/admin/freestyle/consecutive-records' },
      { label: 'Freestyle Sources', href: '/admin/freestyle/sources' },
      { label: 'Emerging Vocabulary', href: '/admin/freestyle/emerging-vocabulary' },
    ],
  },
  {
    title: 'Communications',
    links: [
      { label: 'Mailing Lists', href: '/admin/mailing-lists' },
      { label: 'Broadcasts', href: '/admin/broadcasts' },
      { label: 'Email Templates', href: '/admin/email-templates' },
      { label: 'Email Log', href: '/admin/email-log' },
    ],
  },
  {
    title: 'Payments',
    links: [
      { label: 'All Payments', href: '/admin/payments' },
      { label: 'Payments Health', href: '/admin/payments/health' },
      { label: 'Financial Reports', href: '/admin/payments/reports' },
    ],
  },
  {
    title: 'Administration',
    links: [
      { label: 'Admin Roles', href: '/admin/admin-roles' },
      { label: 'Honor Tier Grants', href: '/admin/honor-grants' },
      { label: 'System Health', href: '/admin/system-health' },
      { label: 'Audit Log', href: '/admin/audit-log' },
      { label: 'Audit Summary', href: '/admin/audit-log/summary' },
    ],
  },
];

export const adminDashboardService = {
  /**
   * Reads run through the shared helper so a contended database renders the
   * standard temporarily-unavailable page rather than falling to the generic
   * handler, which shows the same page under a 500.
   */
  getAdminDashboardPage(adminMemberId: string): PageViewModel<AdminDashboardContent> {
    return runSqliteRead('admin dashboard page', () => this.readAdminDashboardPage(adminMemberId));
  },

  readAdminDashboardPage(adminMemberId: string): PageViewModel<AdminDashboardContent> {
    const workQueue = adminWorkQueueService.getWorkQueueSummary();
    const claims = adminWorkQueueService.getClaimSummary(adminMemberId);
    const backlog = clubCleanupService.getBacklogBadge();
    const health = systemHealthService.getHealthBadges();
    const outstandingReconciliation = paymentReconciliationService.countOutstandingIssues();

    const needsYouNow: DashboardQueueRow[] = [];
    const workWaiting: DashboardQueueRow[] = [];

    // Every category a producer can write to gets a row, whether or not it has
    // anything in it today; a category carrying urgent work goes above instead.
    const byCategory = new Map(workQueue.categories.map((c) => [c.category, c]));
    for (const category of LIVE_WORK_QUEUE_CATEGORIES) {
      const summary = byCategory.get(category);
      const count = summary?.count ?? 0;
      const row: DashboardQueueRow = {
        key: `work_queue_${category}`,
        label: WORK_QUEUE_CATEGORY_LABELS[category] ?? category,
        // Built from the category rather than taken from the summary, which
        // carries no entry for a queue that is currently empty. Falling back to
        // the queue root would send a row labelled with one category to a page
        // showing all of them.
        href: `/admin/work-queue?category=${category}`,
        countLabel: openLabel(count),
        metaLabel: null,
        isUrgent: summary?.hasUrgent === true,
        isZero: count === 0,
      };
      if (row.isUrgent) needsYouNow.push(row);
      else workWaiting.push(row);
    }

    if (health.activeAlarmCount > 0) {
      needsYouNow.push({
        key: 'alarms',
        label: 'Platform Alarms',
        href: '/admin/alarms',
        countLabel: `${health.activeAlarmCount} active`,
        metaLabel: null,
        // An unacknowledged alarm is the dashboard story's own example of
        // urgent, so it is never anything else.
        isUrgent: true,
        isZero: false,
      });
    }

    if (health.hasUrgent) {
      needsYouNow.push({
        key: 'system_health',
        label: 'System Health',
        href: '/admin/system-health',
        countLabel: 'Needs attention',
        metaLabel: health.attentionNotes.join(' '),
        isUrgent: true,
        isZero: false,
      });
    }

    workWaiting.push({
      key: 'club_cleanup',
      label: 'Club Cleanup',
      href: '/admin/club-cleanup',
      countLabel: openLabel(backlog.reviewCount),
      metaLabel: clubCleanupMeta(backlog.opportunityCount, backlog.oldestReviewOpenAgeLabel),
      // Club cleanup carries no urgency signal by design: the queue is worked at
      // the administrator's own cadence, with no deadline and no escalation.
      isUrgent: false,
      isZero: backlog.reviewCount === 0,
    });

    workWaiting.push({
      key: 'reconciliation',
      label: 'Reconciliation',
      href: '/admin/payments/reconciliation',
      countLabel: openLabel(outstandingReconciliation),
      metaLabel: null,
      isUrgent: false,
      isZero: outstandingReconciliation === 0,
    });

    return {
      // An administrator's home page is authenticated and has nothing to offer
      // a search engine that reaches it.
      seo: { title: 'Admin Dashboard', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_dashboard', title: 'Admin Dashboard' },
      content: {
        needsYouNow,
        hasNeedsYouNow: needsYouNow.length > 0,
        workWaiting,
        ownWork: ownWork(claims),
        systemStatus: systemStatus(health),
        toolGroups: TOOL_GROUPS,
      },
    };
  },
};

/**
 * The club cleanup row carries two facts the count alone cannot: how many of
 * its items are opportunities rather than work, and how long the oldest actual
 * decision has waited.
 */
function clubCleanupMeta(opportunityCount: number, oldestAgeLabel: string | null): string | null {
  const parts: string[] = [];
  if (opportunityCount > 0) {
    parts.push(opportunityCount === 1
      ? '1 club could use a leader'
      : `${opportunityCount} clubs could use a leader`);
  }
  if (oldestAgeLabel !== null) parts.push(`oldest ${oldestAgeLabel}`);
  return parts.length ? parts.join(', ') : null;
}

/**
 * What this administrator is holding, and what the rest of the team has
 * covered. The second figure is the point of showing the first: an
 * administrator looking at an empty queue wants to know whether that is because
 * there is no work or because a colleague already took it.
 */
function ownWork(claims: { claimedByYou: number; heldByOthers: number }): DashboardOwnWork {
  const detail = claims.heldByOthers === 0
    ? 'No other administrator is holding an item.'
    : claims.heldByOthers === 1
      ? '1 item is held by another administrator.'
      : `${claims.heldByOthers} items are held by other administrators.`;
  return {
    countLabel: claims.claimedByYou === 1 ? '1 item' : `${claims.claimedByYou} items`,
    detail,
    href: '/admin/work-queue',
    isZero: claims.claimedByYou === 0,
  };
}

/**
 * The platform's own state, answered in one word and then, only if that word
 * is bad news, itemised.
 *
 * A healthy platform reports nothing but "All Clear". Listing the figures that
 * are fine spends three lines telling an administrator that nothing happened,
 * and it teaches them to skip the block, which is the block they most need to
 * read on the day one of those figures is not a zero. So a figure appears here
 * only when it is the exception: mail that stopped going out, messages that
 * gave up, alarms nobody has answered.
 */
function systemStatus(
  health: ReturnType<typeof systemHealthService.getHealthBadges>,
): DashboardSystemStatus {
  const isOk = !health.hasUrgent && health.activeAlarmCount === 0;

  const facts: DashboardStatusFact[] = [];
  if (health.sendingPaused) facts.push({ label: 'Email sending', value: 'Paused' });
  if (health.deadLetterCount > 0) {
    facts.push({ label: 'Dead-lettered mail', value: String(health.deadLetterCount) });
  }
  if (health.activeAlarmCount > 0) {
    facts.push({ label: 'Unacknowledged alarms', value: String(health.activeAlarmCount) });
  }

  return {
    statusLabel: isOk ? 'All Clear' : 'Needs Attention',
    isOk,
    notes: health.attentionNotes,
    facts,
    hasFacts: facts.length > 0,
    links: [
      { label: 'System Health', href: '/admin/system-health' },
      { label: 'Platform Alarms', href: '/admin/alarms' },
    ],
  };
}
