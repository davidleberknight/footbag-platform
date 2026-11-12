/**
 * The finance persona's seed: what it promises beyond the story criteria.
 *
 * The Treasurer's view of the money, criterion by criterion, is proved by the
 * finance administrator's persona checks, which build the persona through the
 * persona refresh and run its journey. This suite holds what those checks do
 * not: the fake members' standing follows the dues they paid, only an
 * administrator persona may carry the seed, and the refresh tears every
 * finance row down and rebuilds it exactly.
 */
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4892');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';
import { refreshAllPersonas } from '../../src/testkit/personaRefreshRunner';
import { FINANCE_DEMO_EVENT_ID, financeDemoMemberIds } from '../../src/testkit/financeDemoSeed';

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function rows<T>(sql: string, ...params: unknown[]): T[] {
  const db = openDb();
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

beforeAll(() => {
  const db = createTestDb(dbPath);
  const spec = CANONICAL_PERSONAS.find((s) => s.slug === 'finance_admin');
  if (!spec) throw new Error('the catalog carries the finance persona');
  db.transaction(() => seedPersona(db, spec))();
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('M_Purchase_Tier_1 and M_Purchase_Tier_2: the fake members\' standing', () => {
  it('grants each member the tier their settled dues bought, and none for a failed payment', () => {
    // Defect: a tier held without a settled payment shows the Treasurer a member who never paid.
    const tierOf = (slug: string) => rows<{ tier_status: string }>(
      `SELECT t.tier_status FROM member_tier_current t JOIN members m ON m.id = t.member_id WHERE m.slug = ?`,
      slug,
    )[0]?.tier_status ?? 'tier0';
    expect(tierOf('fin_demo_ada'), 'a settled Tier 1 purchase').toBe('tier1');
    expect(tierOf('fin_demo_cora'), 'an upgrade to Tier 2').toBe('tier2');
    expect(tierOf('fin_demo_pat'), 'a declined card buys nothing').toBe('tier0');
  });
});

describe('who may carry the finance seed', () => {
  it('refuses it on a persona that is not an administrator, writing nothing', () => {
    // Defect: a non-admin finance persona would show finance pages its own account cannot open.
    const spec = CANONICAL_PERSONAS.find((s) => s.slug === 'finance_admin')!;
    const db = openDb();
    try {
      const membersBefore = (db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n;
      expect(() => db.transaction(() => seedPersona(db, { ...spec, slug: 'finance_not_admin', isAdmin: false }))())
        .toThrow(/finance_not_admin.*financeDemo needs an administrator persona/);
      expect((db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n).toBe(membersBefore);
    } finally {
      db.close();
    }
  });
});

describe('the finance persona under the persona refresh', () => {
  it('is torn down and rebuilt in full, with no row left behind or doubled', () => {
    // Defect: a refresh that aborts on the finance rows, or leaves them doubled, breaks every persona reset.
    const counts = () => {
      const db = openDb();
      try {
        const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
        return {
          members: n(`SELECT COUNT(*) AS n FROM members WHERE id GLOB 'member_persona_fin_demo_*'`),
          payments: n(`SELECT COUNT(*) AS n FROM payments WHERE id GLOB 'pay_persona_fin_*'`),
          registrations: n(`SELECT COUNT(*) AS n FROM registrations WHERE event_id = '${FINANCE_DEMO_EVENT_ID}'`),
          issues: n(`SELECT COUNT(*) AS n FROM reconciliation_issues WHERE id GLOB 'recon_persona_fin_*'`),
          audits: n(`SELECT COUNT(*) AS n FROM audit_entries WHERE action_type GLOB 'payment.*'`),
          events: n(`SELECT COUNT(*) AS n FROM stripe_events WHERE event_id GLOB 'evt_persona_fin_*'`),
        };
      } finally {
        db.close();
      }
    };
    const before = counts();
    expect(before.members).toBe(financeDemoMemberIds().length);
    expect(before.issues, 'the outstanding, the resolved and the rehearsal issue').toBe(3);
    const db = openDb();
    try {
      refreshAllPersonas(db);
    } finally {
      db.close();
    }
    expect(counts()).toEqual(before);
  });
});
