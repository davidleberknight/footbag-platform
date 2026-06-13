/**
 * Leadership path 2 contract: a Tier 1+ member currently affiliated with a
 * club that has no leadership rows is offered co-leadership on the wizard's
 * club task; accepting writes a co-leader row with the accepted audit
 * event; declining is terminal for the member/club pair; Tier 0 members
 * and clubs that already have any leader get no offer; a stale accept
 * (club gained a leader since render) is a safe no-op.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3082');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

let _n = 0;
function seed(opts: { tier1?: boolean; withLeader?: boolean } = {}): { memberId: string; clubId: string } {
  _n += 1;
  const memberId = `p2-mem-${_n}`;
  const clubId = `p2-club-${_n}`;
  insertMember(db, {
    id: memberId, slug: `p2_mem_${_n}`, login_email: `${memberId}@example.com`,
  });
  insertClub(db, { id: clubId, name: `Path2 Club ${_n}` });
  db.prepare(`
    INSERT INTO member_club_affiliations
      (id, created_at, created_by, updated_at, updated_by, member_id, club_id, is_current, is_primary, source)
    VALUES (?, '2026-01-01T00:00:00.000Z', ?, '2026-01-01T00:00:00.000Z', ?, ?, ?, 1, 1, 'legacy_claim')
  `).run(`p2-aff-${_n}`, memberId, memberId, memberId, clubId);
  if (opts.tier1 !== false) {
    db.prepare(`
      INSERT INTO member_tier_grants
        (id, created_at, created_by, member_id, actor_member_id, change_type,
         old_tier_status, new_tier_status, old_underlying_tier_status, new_underlying_tier_status, reason_code)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', ?, NULL, 'grant',
              'tier0', 'tier1', NULL, NULL, 'legacy.claim_tier_grant')
    `).run(`p2-tier-${_n}`, memberId);
  }
  if (opts.withLeader) {
    insertMember(db, { id: `p2-other-${_n}`, slug: `p2_other_${_n}`, login_email: `other-${_n}@example.com` });
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'co-leader', '2026-01-01T00:00:00.000Z')
    `).run(`p2-cl-${_n}`, clubId, `p2-other-${_n}`);
  }
  // Settle prior wizard tasks so the club task renders.
  for (const [i, taskType] of ['personal_details', 'legacy_claim'].entries()) {
    db.prepare(`
      INSERT INTO member_onboarding_tasks
        (id, created_at, created_by, updated_at, updated_by, member_id, task_type, state, completed_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'completed', '2026-01-01T00:00:00.000Z')
    `).run(`p2-mot-${_n}-${i}`, memberId, taskType);
  }
  return { memberId, clubId };
}

function leaderRows(clubId: string): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM club_leaders WHERE club_id = ?').all(clubId) as Array<Record<string, unknown>>;
}

describe('leadership path 2', () => {
  it('offers co-leadership to a Tier 1+ member of a leaderless club; accept writes the co-leader row', async () => {
    const { memberId, clubId } = seed();

    const page = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(page.status).toBe(200);
    expect(page.text).toContain('has no listed contact');
    expect(page.text).toContain('Yes, make me the contact');

    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/leadership-offer')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ clubId, decision: 'accept' });
    expect(res.status).toBe(303);

    const rows = leaderRows(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].member_id).toBe(memberId);
    expect(rows[0].role).toBe('co-leader');

    // Accept routes through the single volunteer write, which audits the add.
    const audits = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'club.coleader_volunteered' AND actor_member_id = ?`,
    ).get(memberId) as { n: number };
    expect(audits.n).toBe(1);

    // The offer no longer renders.
    const after = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(after.text).not.toContain('has no listed contact');
  });

  it('decline is terminal: the offer never re-renders for that pair', async () => {
    const { memberId, clubId } = seed();
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/leadership-offer')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ clubId, decision: 'decline' });
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);

    const page = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(page.text).not.toContain('has no listed contact');
  });

  it('Tier 0 members get no offer; clubs with an existing leader get no offer', async () => {
    const tier0 = seed({ tier1: false });
    const led = seed({ withLeader: true });

    for (const memberId of [tier0.memberId, led.memberId]) {
      const page = await request(createApp())
        .get('/register/wizard/club_affiliations')
        .set('Cookie', cookieFor(memberId));
      expect(page.text).not.toContain('has no listed contact');
    }
  });

  it('a stale accept after the club gained a leader is a safe no-op', async () => {
    const { memberId, clubId } = seed();
    insertMember(db, { id: `p2-racer-${_n}`, slug: `p2_racer_${_n}`, login_email: `racer-${_n}@example.com` });
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'co-leader', '2026-01-01T00:00:00.000Z')
    `).run(`p2-cl-race-${_n}`, clubId, `p2-racer-${_n}`);

    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/leadership-offer')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ clubId, decision: 'accept' });
    expect(res.status).toBe(303);
    // Only the racer's leader row exists; no co-leader row was added.
    expect(leaderRows(clubId)).toHaveLength(1);
  });
});
