/**
 * Two dashboard completions:
 *   - The admin dashboard work-queue summary counts open items per kind, every
 *     kind listed in order with empty ones at zero, and flags a Team Alert or
 *     Someone Is Waiting kind that has anything open; resolved items never count.
 *   - A member whose Active Player status has lapsed sees an explanation that
 *     Tier 1 benefits and the Official IFPA Roster listing have ended; a member
 *     who never earned it, or whose status is current, sees no such message.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, createTier0WithActivePlayer, insertWorkQueueItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3074');
const TS = '2025-01-01T00:00:00.000Z';

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let adminWorkQueueService: typeof import('../../src/services/adminWorkQueueService').adminWorkQueueService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberService: typeof import('../../src/services/memberService').memberService;

let _w = 0;
function insertWorkItem(taskType: string, entityType: string, status: 'open' | 'resolved'): void {
  _w += 1;
  insertWorkQueueItem(db, {
    id: `wq-${_w}`,
    task_type: taskType,
    entity_type: entityType,
    entity_id: `ent-${_w}`,
    status,
  });
}

beforeAll(async () => {
  db = createTestDb(dbPath);

  // Work-queue rows for the dashboard summary: two a member is waiting on, one
  // housekeeping item, and a resolved housekeeping item that must not count.
  insertWorkItem('member_contact_request', 'member', 'open');
  insertWorkItem('member_link_help_request', 'member', 'open');
  insertWorkItem('payout_failed', 'stripe_payout', 'open');
  insertWorkItem('payout_failed', 'stripe_payout', 'resolved');

  // Active Player states for the lapsed-explanation tests.
  createTier0WithActivePlayer(db, { id: 'ap-lapsed', slug: 'ap_lapsed', expiresAt: '2020-06-01T00:00:00.000Z' });
  createTier0WithActivePlayer(db, { id: 'ap-current', slug: 'ap_current', expiresAt: '2099-06-01T00:00:00.000Z' });
  insertMember(db, { id: 'ap-never', slug: 'ap_never' });

  db.close();

  adminWorkQueueService = (await import('../../src/services/adminWorkQueueService')).adminWorkQueueService;
  memberService = (await import('../../src/services/memberService')).memberService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('admin dashboard work-queue summary', () => {
  it('counts open items per kind and per area, and never counts a resolved item', () => {
    const summary = adminWorkQueueService.getWorkQueueSummary();
    expect(summary.totalOpen).toBe(3);

    // ordering-is-the-contract: every kind is listed in the registry's order,
    // an empty one at zero, so the dashboard cards never shuffle.
    expect(summary.kinds.map((k) => [k.kind, k.open])).toEqual([
      ['team_alert', 0],
      ['waiting', 2],
      ['housekeeping', 1],
    ]);
    // A contact request is membership's; a link-help request is too.
    expect(summary.kinds[1]!.perArea.map((a) => [a.key, a.open])).toEqual([['membership', 2]]);
    expect(summary.kinds[0]!.oldestDays).toBeNull();
    // Each card leads to its own kind. Sending them all to the queue root
    // makes the administrator find their kind again by eye, which is the work
    // the card was meant to save.
    expect(summary.kinds.map((k) => k.href)).toEqual([
      '/admin/work-queue?kind=team_alert',
      '/admin/work-queue?kind=waiting',
      '/admin/work-queue?kind=housekeeping',
    ]);
  });
});

describe('expired Active Player explanation on the member dashboard', () => {
  function membershipFor(slug: string) {
    return memberService.getOwnProfile(slug).content.membership!;
  }

  it('a lapsed member is told their Tier 1 benefits and roster listing have ended', () => {
    const ap = membershipFor('ap_lapsed').activePlayer!;
    expect(ap.isCurrent).toBe(false);
    expect(ap.hasLapsed).toBe(true);
    expect(ap.lapsedExplanation).toContain('Official IFPA Roster');
  });

  it('offers a lapsed member no route the IFPA rules refuse them', () => {
    // The one-time club-join grant reaches only a member who has never
    // previously been an Active Player, so every reader of a lapse notice is
    // ineligible by construction. Naming it anywhere they read advertises a
    // route the grant refuses, so neither the lapse notice nor the general
    // Tier 0 text offers it to them. The routes they do have are named.
    const membership = membershipFor('ap_lapsed');
    expect(membership.activePlayer!.lapsedExplanation).not.toContain('club-join');
    expect(membership.activePlayer!.lapsedExplanation).toContain('vouch');
    expect(membership.benefitsBlurb).not.toContain('first club');
    expect(membership.benefitsBlurb).toContain('qualifying event');
    expect(membership.benefitsBlurb).toContain('vouch');
  });

  it('offers the club-join route to a member who has never held the status', () => {
    // The mirror of the case above: the grant is real for this member, so the
    // text that withholds it from a lapsed reader must still reach the one
    // member it belongs to.
    expect(membershipFor('ap_never').benefitsBlurb).toContain('first club');
  });

  it('a member who never earned Active Player gets no lapsed explanation', () => {
    const ap = membershipFor('ap_never').activePlayer!;
    expect(ap.isCurrent).toBe(false);
    expect(ap.hasLapsed).toBe(false);
    expect(ap.lapsedExplanation).toBeNull();
  });

  it('a current Active Player gets no lapsed explanation', () => {
    const ap = membershipFor('ap_current').activePlayer!;
    expect(ap.isCurrent).toBe(true);
    expect(ap.hasLapsed).toBe(false);
  });
});
