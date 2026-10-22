import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertAuditEntry, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3134');

const ADMIN_ID    = 'al_admin_001';
const ADMIN_SLUG  = 'al_admin_one';
const MEMBER_ID   = 'al_member_001';
const MEMBER_SLUG = 'al_member_one';
const OTHER_ID    = 'al_member_002';
const OTHER_SLUG  = 'al_member_two';

// Real, recent dates, as live rows carry: the readers default to windows
// ending now, so seeded rows sit where real ones would.
const DAY_MS = 86_400_000;
const dateOnly = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const TODAY = dateOnly(Date.now());
/** An export window covering the last 30 days, ending today. */
const WINDOW = `from=${dateOnly(Date.now() - 30 * DAY_MS)}&to=${TODAY}`;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** A UTC instant in the calendar month `back` months before this one. */
function inMonthsAgo(back: number, day: number): { iso: string; month: string; label: string } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day, 10));
  const month = d.toISOString().slice(0, 7);
  return { iso: d.toISOString(), month, label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
}
// The summary's two months: the earlier one and the later one, both complete.
const EARLIER = (day: number) => inMonthsAgo(2, day);
const LATER = (day: number) => inMonthsAgo(1, day);
/** From the start of three months ago to the end of last month's 28th. */
const SUMMARY_RANGE = { fromDate: inMonthsAgo(3, 1).iso.slice(0, 10), toDate: LATER(28).iso.slice(0, 10) };
const SUMMARY_QUERY = `from=${SUMMARY_RANGE.fromDate}&to=${SUMMARY_RANGE.toDate}`;

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let auditLogService: typeof import('../../src/services/auditLogService').auditLogService;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'AL Admin',  real_name: 'AL Admin',  login_email: 'al-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'AL Member', real_name: 'AL Member', login_email: 'al-member@example.com' });
  insertMember(db, { id: OTHER_ID,  slug: OTHER_SLUG,  display_name: 'AL Other',  real_name: 'AL Other',  login_email: 'al-other@example.com' });
  // The append-only triggers are dropped on this throwaway test DB so each test
  // can reset audit_entries; the app under test only ever inserts, so dropping
  // them does not change the behavior these route tests exercise.
  db.exec(`DROP TRIGGER IF EXISTS trg_audit_no_update; DROP TRIGGER IF EXISTS trg_audit_no_delete;`);
  db.close();
  createApp = await importApp();
  auditLogService = (await import('../../src/services/auditLogService')).auditLogService;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => db.prepare(`DELETE FROM audit_entries`).run());
});

describe('GET /admin/audit-log', () => {
  it('unauthenticated → 302 to /login', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('non-admin → 403', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin, no matching entries → 200 with empty summary', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Audit Log');
    expect(res.text).toContain('No matching audit entries.');
  });

  it('admin, with entries → 200 listing action type and a member profile link', async () => {
    withDb((db) => insertAuditEntry(db, {
      actor_type: 'member', actor_member_id: MEMBER_ID,
      action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: MEMBER_ID,
    }));
    const app = createApp();
    const res = await request(app).get('/admin/audit-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('tier.purchase_grant');
    expect(res.text).toContain(`href="/members/${MEMBER_SLUG}"`);
  });

  it('member filter narrows to rows where the member is the actor OR the affected entity', async () => {
    withDb((db) => {
      // MEMBER as actor.
      insertAuditEntry(db, { actor_type: 'member', actor_member_id: MEMBER_ID, action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: MEMBER_ID });
      // MEMBER as entity, admin as actor (an override on the member).
      insertAuditEntry(db, { actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'tier.admin_override', entity_type: 'member', entity_id: MEMBER_ID });
      // OTHER member, unrelated.
      insertAuditEntry(db, { actor_type: 'member', actor_member_id: OTHER_ID, action_type: 'auth.login', entity_type: 'member', entity_id: OTHER_ID });
    });
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('tier.purchase_grant');  // MEMBER as actor
    expect(res.text).toContain('tier.admin_override');  // MEMBER as entity
    expect(res.text).not.toContain('auth.login');        // OTHER excluded
  });

  it('viewing the log writes nothing to it', async () => {
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    const count = withDb((db) => db.prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as { c: number });
    expect(count.c).toBe(0);
  });

  // A batch write stamps several entries inside the same millisecond, so rows
  // sharing a timestamp are ordinary here. The listing is paged, and a page
  // boundary falling inside a block the database orders however it likes can
  // show one entry twice while another is never reachable at all. Identifiers
  // descend alongside the timestamp. The identifiers below are written in
  // descending order deliberately, so the required result differs from the one
  // the database reaches on its own: with no tiebreaker this listing returns
  // the block in the reverse of the order asserted here.
  it('orders entries sharing one timestamp by identifier, newest first', async () => {
    // One instant shared by all three, a day ago, so only the id can order them.
    const tie = new Date(Date.now() - DAY_MS).toISOString();
    withDb((db) => {
      insertAuditEntry(db, { id: 'al_tie_c', occurred_at: tie, actor_type: 'member', actor_member_id: MEMBER_ID, action_type: 'auth.login', entity_type: 'member', entity_id: MEMBER_ID });
      insertAuditEntry(db, { id: 'al_tie_b', occurred_at: tie, actor_type: 'member', actor_member_id: MEMBER_ID, action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: MEMBER_ID });
      insertAuditEntry(db, { id: 'al_tie_a', occurred_at: tie, actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'tier.admin_override', entity_type: 'member', entity_id: MEMBER_ID });
    });
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?from=${dateOnly(Date.now() - 2 * DAY_MS)}&to=${TODAY}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);

    const idC = res.text.indexOf('auth.login');
    const idB = res.text.indexOf('tier.purchase_grant');
    const idA = res.text.indexOf('tier.admin_override');
    expect(idC).toBeGreaterThan(-1);
    expect(idC).toBeLessThan(idB);
    expect(idB).toBeLessThan(idA);
  });

  it('escapes HTML in reason text (no stored XSS)', async () => {
    withDb((db) => insertAuditEntry(db, {
      actor_type: 'admin', actor_member_id: ADMIN_ID,
      action_type: 'tier.admin_override', entity_type: 'member', entity_id: MEMBER_ID,
      reason_text: '<script>alert(1)</script>',
    }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });
});

// Defect caught: a club's or a member's history in the viewer leaves out the
// rows about something of theirs (a co-leader seat, a payment), which name
// them in metadata rather than as the row's entity, so the history an
// administrator reads is silently incomplete.
describe('entity and member history', () => {
  it('a club history holds the rows on the club and those naming it; a member history those naming the member', () => {
    withDb((db) => {
      insertAuditEntry(db, { id: 'hist-club-own', action_type: 'club.marked_inactive', entity_type: 'club', entity_id: 'club-h1' });
      insertAuditEntry(db, {
        id: 'hist-club-seat', action_type: 'club.coleader_volunteered', entity_type: 'club_leader', entity_id: 'cl-9',
        metadata: { club_id: 'club-h1' },
      });
      insertAuditEntry(db, { id: 'hist-club-other', action_type: 'club.marked_inactive', entity_type: 'club', entity_id: 'club-h2' });
      insertAuditEntry(db, {
        id: 'hist-member-pay', action_type: 'payment.succeeded', entity_type: 'payment', entity_id: 'pay-h1',
        metadata: { member_id: OTHER_ID },
      });
    });
    const ids = (q: Parameters<typeof auditLogService.getAuditLogPage>[0]) =>
      auditLogService.getAuditLogPage(q).content.entries.map((e) => e.entityLabel);

    const club = ids({ entityType: 'club', entityId: 'club-h1' });
    expect(club).toEqual(expect.arrayContaining(['club:club-h1', 'club_leader:cl-9']));
    expect(club).not.toContain('club:club-h2');
    expect(ids({ memberId: OTHER_ID })).toContain('payment:pay-h1');
  });
});


describe('GET /admin/audit-log/export', () => {
  it('non-admin → 403', async () => {
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=csv&${WINDOW}`).set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('CSV export → 200 text/csv attachment with header and rows', async () => {
    withDb((db) => insertAuditEntry(db, {
      actor_type: 'member', actor_member_id: MEMBER_ID,
      action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: MEMBER_ID,
    }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=csv&${WINDOW}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('audit-log.csv');
    expect(res.text).toContain('occurred_at,actor_type');
    expect(res.text).toContain('tier.purchase_grant');
  });

  // The export carries member-chosen display names, and display-name validation
  // constrains only length. A spreadsheet application treats a leading '=', '+',
  // '-' or '@' as the start of a formula, so an unneutralised cell runs member
  // input on the administrator's machine when they open the downloaded file.
  it('CSV export neutralises a display name that would read as a spreadsheet formula', async () => {
    const hostileId = 'al_member_formula';
    withDb((db) => {
      insertMember(db, {
        id: hostileId, slug: 'al_member_formula', display_name: '=HYPERLINK("http://evil.example.com")',
        real_name: 'Formula Person', login_email: 'al-formula@example.com',
      });
      insertAuditEntry(db, {
        actor_type: 'member', actor_member_id: hostileId,
        action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: hostileId,
      });
    });
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=csv&${WINDOW}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`'=HYPERLINK`);
    expect(res.text).not.toMatch(/(^|[,\n"])=HYPERLINK/);
  });

  // A handoff that silently drops rows reads as the complete set. The window,
  // not a row cap, bounds the file, so it holds every row of its dates, and it
  // is plain RFC 4180: the header first, one record per line, CRLF endings.
  it('returns every row of its window, past any former cap, as valid CSV', async () => {
    withDb((db) => {
      const many = db.transaction(() => {
        for (let i = 0; i < 5100; i += 1) {
          insertAuditEntry(db, {
            actor_type: 'member', actor_member_id: MEMBER_ID,
            action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: MEMBER_ID,
          });
        }
      });
      many();
    });
    const inWindow = withDb((db) => (db.prepare(
      'SELECT COUNT(*) AS n FROM audit_entries WHERE occurred_at >= ? AND occurred_at <= ?',
    ).get(dateOnly(Date.now() - 30 * DAY_MS), `${TODAY}T23:59:59.999Z`) as { n: number }).n);

    const res = await request(createApp()).get(`/admin/audit-log/export?format=csv&${WINDOW}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toMatch(/^occurred_at,/);
    expect(lines.at(-1)).toBe('');
    expect(lines.length - 2).toBe(inWindow);
    expect(inWindow).toBeGreaterThan(5000);
  });

  it('refuses a missing, reversed or over-long window, saying what it needs', async () => {
    const app = createApp();
    for (const q of ['', 'from=2025-01-01', 'from=2025-02-01&to=2025-01-01', 'from=2025-01-01&to=2025-04-02']) {
      const res = await request(app).get(`/admin/audit-log/export?format=csv&${q}`).set('Cookie', adminCookie());
      expect(res.status, q).toBe(422);
      expect(res.text, q).toContain('To export, choose From and To dates no more than 90 days apart.');
    }
    const ninety = await request(app).get('/admin/audit-log/export?format=csv&from=2025-01-01&to=2025-04-01')
      .set('Cookie', adminCookie());
    expect(ninety.status).toBe(200);
  });

  // Defect caught: a browse with no dates either lists all history, burying
  // what changed this week, or ends before today and misses the latest rows.
  it('browses the last 90 days ending today by default, shown in the form, and exports that window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
      const vm = auditLogService.getAuditLogPage({});
      expect([vm.content.filters.fromDate, vm.content.filters.toDate]).toEqual(['2026-02-19', '2026-05-20']);
      expect(vm.content.exportCsvHref).toContain('from=2026-02-19');
      expect(vm.content.exportCsvHref).toContain('to=2026-05-20');
      // A member's or an entity's history is a lookup and keeps its whole span.
      const history = auditLogService.getAuditLogPage({ memberId: MEMBER_ID });
      expect([history.content.filters.fromDate, history.content.filters.toDate]).toEqual(['', '']);
    } finally {
      vi.useRealTimers();
    }

    const app = createApp();
    const chosenFrom = dateOnly(Date.now() - 10 * DAY_MS);
    expect(auditLogService.getAuditLogPage({ fromDate: chosenFrom, toDate: TODAY }).content.exportCsvHref)
      .toContain(`from=${chosenFrom}`);

    const tooLong = await request(app).get('/admin/audit-log?from=2024-01-01&to=2025-01-01').set('Cookie', adminCookie());
    expect(tooLong.text).toContain('To export, choose From and To dates no more than 90 days apart.');
    expect(tooLong.text).not.toContain('/admin/audit-log/export?');
  });

  it('JSON export → 200 application/json array', async () => {
    withDb((db) => insertAuditEntry(db, {
      actor_type: 'member', actor_member_id: MEMBER_ID,
      action_type: 'tier.purchase_grant', entity_type: 'member', entity_id: MEMBER_ID,
    }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=json&${WINDOW}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: { action_type: string }) => r.action_type === 'tier.purchase_grant')).toBe(true);
  });

  it('exporting the log writes nothing to it', async () => {
    withDb((db) => insertAuditEntry(db, { actor_type: 'member', actor_member_id: MEMBER_ID, action_type: 'auth.login', entity_type: 'member', entity_id: MEMBER_ID }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=csv&${WINDOW}&member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    const count = withDb((db) => db.prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as { c: number });
    expect(count.c).toBe(1);
  });

  it('CSV quotes a cell containing commas, quotes, and newlines (RFC 4180)', async () => {
    withDb((db) => insertAuditEntry(db, {
      actor_type: 'admin', actor_member_id: ADMIN_ID,
      action_type: 'tier.admin_override', entity_type: 'member', entity_id: MEMBER_ID,
      reason_text: 'has, comma "quote"',
    }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=csv&${WINDOW}&member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('"has, comma ""quote"""');
  });
});

describe('GET /admin/audit-log/summary', () => {
  /**
   * The same category in two different months, plus a second category in one
   * of them. A summary that grouped by category alone, or by month alone,
   * would collapse this into a shape the assertions below reject.
   */
  function seedTwoMonths(): void {
    withDb((db) => {
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'tier.admin_override',
        entity_id: MEMBER_ID, occurred_at: EARLIER(4).iso, data_origin: 'live',
      });
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'tier.admin_override',
        entity_id: OTHER_ID, occurred_at: EARLIER(19).iso, data_origin: 'live',
      });
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'tier.admin_override',
        entity_id: MEMBER_ID, occurred_at: LATER(11).iso, data_origin: 'live',
      });
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'admin.role_granted',
        entity_id: MEMBER_ID, occurred_at: LATER(2).iso, data_origin: 'live',
      });
      // A rehearsal row in the same month, which a count of real activity omits.
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: ADMIN_ID, action_type: 'tier.admin_override',
        entity_id: MEMBER_ID, occurred_at: EARLIER(5).iso, data_origin: 'test',
      });
    });
  }

  // Defect caught: a To date alone is ignored and the window runs back from
  // today, so a report on a past period comes back empty or clipped.
  it('honours a To date alone, counting back from it', () => {
    seedTwoMonths();
    const vm = auditLogService.getAuditLogSummaryPage({ toDate: EARLIER(28).iso.slice(0, 10) });
    expect(vm.content.months.map((m) => m.month)).toEqual([EARLIER(1).month]);
    // The rehearsal row in July is not real activity and is not counted.
    expect(vm.content.months[0].total).toBe(2);
  });

  it('refuses a non-admin and redirects an unauthenticated visitor', async () => {
    const app = createApp();
    const anon = await request(app).get('/admin/audit-log/summary');
    expect(anon.status).toBe(302);
    const member = await request(app).get('/admin/audit-log/summary').set('Cookie', memberCookie());
    expect(member.status).toBe(403);
  });

  it('counts entries per category within each month, not across them', async () => {
    seedTwoMonths();

    const vm = auditLogService.getAuditLogSummaryPage(SUMMARY_RANGE);

    // Newest month first, so the period anyone is reporting on leads.
    expect(vm.content.months.map((m) => m.month)).toEqual([LATER(1).month, EARLIER(1).month]);

    const earlier = vm.content.months.find((m) => m.month === EARLIER(1).month)!;
    expect(earlier.monthLabel).toBe(EARLIER(1).label);
    expect(earlier.total).toBe(2);
    expect(earlier.rows).toEqual([{ category: 'membership', count: 2 }]);

    // The same category in the other month keeps its own count. One figure
    // spanning both months would be a different, less useful report.
    const later = vm.content.months.find((m) => m.month === LATER(1).month)!;
    expect(later.total).toBe(2);
    expect(later.rows).toEqual([
      { category: 'auth', count: 1 },
      { category: 'membership', count: 1 },
    ]);
  });

  it('renders each month with its categories', async () => {
    seedTwoMonths();

    const res = await request(createApp())
      .get(`/admin/audit-log/summary?${SUMMARY_QUERY}`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain(EARLIER(1).label);
    expect(res.text).toContain(LATER(1).label);
    expect(res.text).toContain('<td>membership</td>');
    expect(res.text).toContain('<td>auth</td>');
  });

  it('carries the filters the reader was already using', async () => {
    seedTwoMonths();

    const res = await request(createApp())
      .get(`/admin/audit-log/summary?${SUMMARY_QUERY}&category=auth`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    // The summary is the filtered view aggregated, not a second question with
    // a scope of its own, so a reader who narrowed the list keeps that narrowing.
    expect(res.text).toContain('<td>auth</td>');
    expect(res.text).not.toContain('<td>membership</td>');
    expect(res.text).not.toContain(EARLIER(1).label);
  });

  it('reading the summary writes nothing, like the list', async () => {
    seedTwoMonths();
    const before = withDb((db) => db.prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as { c: number });

    await request(createApp()).get('/admin/audit-log/summary').set('Cookie', adminCookie());

    const after = withDb((db) => db.prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as { c: number });
    expect(after.c).toBe(before.c);
  });

  it('says so plainly when the period holds nothing', async () => {
    const res = await request(createApp())
      .get('/admin/audit-log/summary')
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('No audit entries in this period.');
  });
});
