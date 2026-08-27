/**
 * Honour grants and board standing, from the administrator honour surface.
 *
 * Covers what a grant is required to produce beyond the tier row: the badge
 * every surface reads, the induction year, and a reason on both the ledger row
 * and the audit row. Covers taking back a grant made in error, which clears the
 * badge and its year, leaves the membership tier alone, and lets the honour be
 * granted again afterwards. Covers board standing set and removed, with the tier
 * reverting to the one recorded on the way in, for an entrant from Tier 0 and an
 * entrant from Tier 2.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, createMemberAtTier, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3433');

const ADMIN_ID = 'hb_admin';
const HOF_ID = 'hb_hof';
const BAP_ID = 'hb_bap';
const UNDO_ID = 'hb_undo';
const BOARD_T0_ID = 'hb_board_t0';
const BOARD_T2_ID = 'hb_board_t2';
const CLAIMED_ID = 'hb_claimed';
const CLAIMED_PERSON_ID = 'hb_person';
const LATE_CLAIM_ID = 'hb_late_claim';
const LATE_CLAIM_PERSON_ID = 'hb_late_person';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function honourRow(memberId: string): {
  is_hof: number; is_bap: number; hof_inducted_year: number | null; bap_inducted_year: number | null;
  is_board: number;
} {
  return db((conn) => conn.prepare(
    `SELECT is_hof, is_bap, hof_inducted_year, bap_inducted_year, is_board
     FROM members WHERE id = ?`,
  ).get(memberId)) as ReturnType<typeof honourRow>;
}

function tierOf(memberId: string): string {
  const row = db((conn) => conn.prepare(
    `SELECT tier_status FROM member_tier_current WHERE member_id = ?`,
  ).get(memberId)) as { tier_status: string } | undefined;
  return row?.tier_status ?? 'tier0';
}

function post(path: string, body: Record<string, string>): Promise<{ status: number; text: string }> {
  return request(createApp())
    .post(path).set('Cookie', adminCookie()).type('form').send(body)
    .then((r) => ({ status: r.status, text: r.text }));
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'hb_admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'hb-admin@example.com', is_admin: 1,
  });
  for (const [id, name] of [
    [HOF_ID, 'Hattie Fame'], [BAP_ID, 'Barry Add'], [UNDO_ID, 'Una Undo'],
    [BOARD_T0_ID, 'Bo Zero'],
  ] as const) {
    insertMember(conn, {
      id, slug: id, display_name: name, real_name: name, login_email: `${id}@example.com`,
    });
  }
  // A member whose Hall of Fame honour came from claiming a historical record:
  // the badge and the year are set, and no honour ledger row exists.
  insertHistoricalPerson(conn, {
    person_id: CLAIMED_PERSON_ID, person_name: 'Claire Claimed', hof_member: 1,
    hof_induction_year: 2005,
  });
  insertMember(conn, {
    id: CLAIMED_ID, slug: CLAIMED_ID, display_name: 'Claire Claimed', real_name: 'Claire Claimed',
    login_email: 'hb-claimed@example.com', historical_person_id: CLAIMED_PERSON_ID,
    is_hof: 1, hof_inducted_year: 2005,
  });

  // The record this member claims only after the grant has been made.
  insertHistoricalPerson(conn, {
    person_id: LATE_CLAIM_PERSON_ID, person_name: 'Lyle Late', bap_member: 1,
  });
  insertMember(conn, {
    id: LATE_CLAIM_ID, slug: LATE_CLAIM_ID, display_name: 'Lyle Late', real_name: 'Lyle Late',
    login_email: 'hb-late@example.com',
  });

  createMemberAtTier(conn, {
    id: BOARD_T2_ID, slug: BOARD_T2_ID, tier: 'tier2',
    memberOverrides: {
      display_name: 'Tess Two', real_name: 'Tess Two', login_email: 'hb-t2@example.com',
    },
  });
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const conn = new BetterSqlite3(dbPath);
  conn.prepare(`DELETE FROM outbox_emails`).run();
  conn.close();
});

describe('granting an honour', () => {
  it('sets the badge and the induction year, not only the tier', async () => {
    const res = await post('/admin/honor-grants/grant/confirm', {
      member_key: HOF_ID, honor: 'hof', induction_year: '2019',
    });
    expect(res.status).toBe(303);

    const row = honourRow(HOF_ID);
    expect(row.is_hof).toBe(1);
    expect(row.hof_inducted_year).toBe(2019);
    expect(tierOf(HOF_ID)).toBe('tier2');
  });

  it('records the Big Add Posse year in its own column, for a member with no historical record', async () => {
    const res = await post('/admin/honor-grants/grant/confirm', {
      member_key: BAP_ID, honor: 'bap', induction_year: '2021',
    });
    expect(res.status).toBe(303);

    const row = honourRow(BAP_ID);
    expect(row.is_bap).toBe(1);
    expect(row.bap_inducted_year).toBe(2021);
    expect(row.is_hof).toBe(0);
  });

  it('writes a composed reason on both the ledger row and the audit row', () => {
    const ledger = db((conn) => conn.prepare(
      `SELECT reason_text FROM member_tier_grants
       WHERE member_id = ? AND reason_code = 'honor.hof_tier2_grant'`,
    ).get(HOF_ID)) as { reason_text: string | null };
    const audit = db((conn) => conn.prepare(
      `SELECT reason_text FROM audit_entries WHERE action_type = 'tier.hof_grant' AND entity_id = ?`,
    ).get(HOF_ID)) as { reason_text: string | null };

    expect(ledger.reason_text).toBe('Hall of Fame induction, 2019');
    expect(audit.reason_text).toBe('Hall of Fame induction, 2019');
  });

  it('refuses a year that is not a four-digit year', async () => {
    const res = await post('/admin/honor-grants/grant/confirm', {
      member_key: UNDO_ID, honor: 'hof', induction_year: 'last summer',
    });
    expect(res.status).toBe(422);
    expect(honourRow(UNDO_ID).is_hof).toBe(0);
  });

  it('refuses a year outside the range the sport has existed in', async () => {
    const res = await post('/admin/honor-grants/grant/confirm', {
      member_key: UNDO_ID, honor: 'hof', induction_year: '1812',
    });
    expect(res.status).toBe(422);
    expect(honourRow(UNDO_ID).is_hof).toBe(0);
  });
});

describe('taking back a grant made in error', () => {
  it('clears the badge and its year, and leaves the membership tier alone', async () => {
    expect((await post('/admin/honor-grants/grant/confirm', {
      member_key: UNDO_ID, honor: 'hof', induction_year: '2020',
    })).status).toBe(303);
    expect(honourRow(UNDO_ID).is_hof).toBe(1);
    expect(tierOf(UNDO_ID)).toBe('tier2');

    const res = await post('/admin/honor-grants/remove/confirm', {
      member_key: UNDO_ID, honor: 'hof', reason: 'granted to the wrong member',
    });
    expect(res.status).toBe(303);

    const row = honourRow(UNDO_ID);
    expect(row.is_hof).toBe(0);
    expect(row.hof_inducted_year).toBeNull();
    // The member may hold this tier for reasons unconnected to the honour, so a
    // correction to the honour does not reach into it.
    expect(tierOf(UNDO_ID)).toBe('tier2');
  });

  it('leaves the original grant row in the ledger and adds the withdrawal beside it', () => {
    const rows = db((conn) => conn.prepare(
      `SELECT reason_code FROM member_tier_grants WHERE member_id = ? ORDER BY created_at, id`,
    ).all(UNDO_ID)) as Array<{ reason_code: string }>;
    const codes = rows.map((r) => r.reason_code);
    expect(codes).toContain('honor.hof_tier2_grant');
    expect(codes).toContain('honor.hof_grant_removed');
  });

  it('lets the honour be granted again once the mistake is corrected', async () => {
    const res = await post('/admin/honor-grants/grant/confirm', {
      member_key: UNDO_ID, honor: 'hof', induction_year: '2022',
    });
    expect(res.status).toBe(303);
    expect(honourRow(UNDO_ID).hof_inducted_year).toBe(2022);
  });

  it('refuses to take back an honour the member does not hold', async () => {
    const res = await post('/admin/honor-grants/remove', {
      member_key: BAP_ID, honor: 'hof', reason: 'never granted',
    });
    expect(res.status).toBe(422);
  });
});

describe('an honour that came from a claimed historical record', () => {
  it('is not offered for granting, because there is nothing to grant', async () => {
    const res = await post('/admin/honor-grants/grant/confirm', {
      member_key: CLAIMED_ID, honor: 'hof', induction_year: '2005',
    });
    expect(res.status).toBe(409);
    expect(res.text).toContain('claimed historical record');
    // And no ledger row was written that a later correction could act on.
    const rows = db((conn) => conn.prepare(
      `SELECT COUNT(*) AS c FROM member_tier_grants
       WHERE member_id = ? AND reason_code = 'honor.hof_tier2_grant'`,
    ).get(CLAIMED_ID)) as { c: number };
    expect(rows.c).toBe(0);
  });

  it('keeps the badge when the member later claims a record that backs the same honour', async () => {
    // The reachable ordering: an administrator grants the honour first, and the
    // member afterwards claims a historical record carrying the same one. Taking
    // the grant back corrects the grant, but the archive still says they hold
    // the honour, so the badge stays.
    expect((await post('/admin/honor-grants/grant/confirm', {
      member_key: LATE_CLAIM_ID, honor: 'bap', induction_year: '2018',
    })).status).toBe(303);
    expect(honourRow(LATE_CLAIM_ID).is_bap).toBe(1);

    // The claim lands afterwards, linking a record that carries Big Add Posse.
    db((conn) => conn.prepare(
      `UPDATE members SET historical_person_id = ? WHERE id = ?`,
    ).run(LATE_CLAIM_PERSON_ID, LATE_CLAIM_ID));

    const res = await post('/admin/honor-grants/remove/confirm', {
      member_key: LATE_CLAIM_ID, honor: 'bap', reason: 'granted to the wrong member',
    });
    expect(res.status).toBe(303);

    const row = honourRow(LATE_CLAIM_ID);
    expect(row.is_bap).toBe(1);                 // the archive still backs it
    expect(row.bap_inducted_year).toBe(2018);   // and the year it carries stands

    const meta = JSON.parse(db((conn) => conn.prepare(
      `SELECT metadata_json FROM audit_entries
       WHERE action_type = 'tier.bap_grant_removed' AND entity_id = ?`,
    ).get(LATE_CLAIM_ID) as { metadata_json: string }).metadata_json);
    expect(meta.badge_kept_from_claimed_record).toBe(true);
  });
});

describe('board standing', () => {
  it('puts a Tier 0 member on the board and returns them to Tier 1 on the way out', async () => {
    expect((await post('/admin/honor-grants/board/set/confirm', {
      member_key: BOARD_T0_ID, reason: 'elected at the November meeting',
    })).status).toBe(303);

    expect(tierOf(BOARD_T0_ID)).toBe('tier3');
    expect(honourRow(BOARD_T0_ID).is_board).toBe(1);

    expect((await post('/admin/honor-grants/board/remove/confirm', {
      member_key: BOARD_T0_ID, reason: 'term ended',
    })).status).toBe(303);

    expect(tierOf(BOARD_T0_ID)).toBe('tier1');
    expect(honourRow(BOARD_T0_ID).is_board).toBe(0);
  });

  it('returns a Tier 2 entrant to Tier 2 rather than to Tier 1', async () => {
    expect((await post('/admin/honor-grants/board/set/confirm', {
      member_key: BOARD_T2_ID, reason: 'elected at the November meeting',
    })).status).toBe(303);
    expect(tierOf(BOARD_T2_ID)).toBe('tier3');

    expect((await post('/admin/honor-grants/board/remove/confirm', {
      member_key: BOARD_T2_ID, reason: 'term ended',
    })).status).toBe(303);
    expect(tierOf(BOARD_T2_ID)).toBe('tier2');
    expect(honourRow(BOARD_T2_ID).is_board).toBe(0);
  });

  it('refuses a board change with no reason', async () => {
    const res = await post('/admin/honor-grants/board/set/confirm', {
      member_key: BOARD_T0_ID, reason: '  ',
    });
    expect(res.status).toBe(422);
  });

  it('shows the tier the member will return to before the standing is set', async () => {
    const res = await post('/admin/honor-grants/board/set', {
      member_key: BOARD_T0_ID, reason: 'elected at the November meeting',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Reverts to on leaving the board');
  });

  // The page offers to take a director off the board, keyed on a member id
  // typed by hand. A page that removes a director has to be able to answer who
  // the directors are; a feed of recent grants answers a different question.
  it('lists the sitting directors, with the id the removal form takes', async () => {
    await post('/admin/honor-grants/board/set/confirm', {
      member_key: BOARD_T0_ID, reason: 'elected at the November meeting',
    });

    const page = await request(createApp())
      .get('/admin/honor-grants').set('Cookie', adminCookie());
    expect(page.status).toBe(200);
    expect(page.text).toContain('Sitting Directors (1)');
    expect(page.text).toContain(BOARD_T0_ID);

    await post('/admin/honor-grants/board/remove/confirm', {
      member_key: BOARD_T0_ID, reason: 'term ended',
    });
    const after = await request(createApp())
      .get('/admin/honor-grants').set('Cookie', adminCookie());
    expect(after.text).toContain('Sitting Directors (0)');
    expect(after.text).toContain('No member is recorded as sitting on the board.');
  });
});
