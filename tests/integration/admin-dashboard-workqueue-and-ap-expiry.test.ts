/**
 * Two dashboard completions:
 *   - The admin dashboard work-queue summary counts open items per category and
 *     flags categories with urgent (non-default priority) items; resolved items
 *     and empty categories do not appear.
 *   - A member whose Active Player status has lapsed sees an explanation that
 *     Tier 1 benefits and the Official IFPA Roster listing have ended; a member
 *     who never earned it, or whose status is current, sees no such message.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, createTier0WithActivePlayer } from '../fixtures/factories';

const { dbPath } = setTestEnv('3074');
const TS = '2025-01-01T00:00:00.000Z';

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let contactRequestService: typeof import('../../src/services/contactRequestService').contactRequestService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberService: typeof import('../../src/services/memberService').memberService;

let _w = 0;
function insertWorkItem(category: string, status: 'open' | 'resolved', priority: number): void {
  _w += 1;
  db.prepare(`
    INSERT INTO work_queue_items (
      id, created_at, created_by, updated_at, updated_by, version,
      queue_category, task_type, entity_type, entity_id, status, priority, opened_at
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, 'generic_task', 'member', ?, ?, ?, ?)
  `).run(`wq-${_w}`, TS, TS, category, `ent-${_w}`, status, priority, TS);
}

beforeAll(async () => {
  db = createTestDb(dbPath);

  // Work-queue rows for the dashboard summary.
  insertWorkItem('membership', 'open', 0);
  insertWorkItem('membership', 'open', 5);   // urgent
  insertWorkItem('events', 'open', 0);
  insertWorkItem('media', 'resolved', 9);     // resolved: must not count

  // Active Player states for the lapsed-explanation tests.
  createTier0WithActivePlayer(db, { id: 'ap-lapsed', slug: 'ap_lapsed', expiresAt: '2020-06-01T00:00:00.000Z' });
  createTier0WithActivePlayer(db, { id: 'ap-current', slug: 'ap_current', expiresAt: '2099-06-01T00:00:00.000Z' });
  insertMember(db, { id: 'ap-never', slug: 'ap_never' });

  db.close();

  contactRequestService = (await import('../../src/services/contactRequestService')).contactRequestService;
  memberService = (await import('../../src/services/memberService')).memberService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('admin dashboard work-queue summary', () => {
  it('counts open items per category, flags urgent, and omits resolved/empty categories', () => {
    const summary = contactRequestService.getWorkQueueSummary();
    expect(summary.hasOpen).toBe(true);
    expect(summary.totalOpen).toBe(3);

    const byCategory = Object.fromEntries(summary.categories.map((c) => [c.category, c]));
    expect(byCategory.membership.count).toBe(2);
    expect(byCategory.membership.hasUrgent).toBe(true);
    expect(byCategory.membership.label).toBe('Membership');
    expect(byCategory.membership.href).toBe('/admin/work-queue');

    expect(byCategory.events.count).toBe(1);
    expect(byCategory.events.hasUrgent).toBe(false);

    // 'media' had only a resolved item, so the category does not appear.
    expect(byCategory.media).toBeUndefined();
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
