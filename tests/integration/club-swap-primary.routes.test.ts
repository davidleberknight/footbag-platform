/**
 * Swapping which of a member's two clubs is primary. One partial unique index
 * allows a single primary per member and SQLite checks it per row as a
 * statement walks the table, so the swap must clear before it sets. The
 * contract is that a member can swap as often as they like and always holds
 * exactly one primary afterwards.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3993');

import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import {
  insertTag,
  insertClub,
  insertMember,
  insertMemberClubAffiliation,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';

const MEMBER   = 'swap-member-001';
const SOLO     = 'swap-solo-001';
const CLUB_ONE = 'club-swap-one';
const CLUB_TWO = 'club-swap-two';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

function primaryClubIds(memberId: string): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare(`
      SELECT club_id FROM member_club_affiliations
       WHERE member_id = ? AND is_current = 1 AND is_primary = 1
       ORDER BY club_id
    `).all(memberId) as Array<{ club_id: string }>).map((r) => r.club_id);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const [id, slug, name] of [
    [MEMBER, 'swap_member', 'Sam Swapper'],
    [SOLO,   'swap_solo',   'Sol Single'],
  ] as const) {
    insertMember(db, { id, slug, display_name: name, login_email: `${slug}@example.com` });
    completeOnboarding(db, id);
  }

  for (const [id, name, tag] of [
    [CLUB_ONE, 'Swap Club One', '#club_swap_one'],
    [CLUB_TWO, 'Swap Club Two', '#club_swap_two'],
  ] as const) {
    insertClub(db, {
      id,
      name,
      city: 'Salem',
      country: 'USA',
      hashtag_tag_id: insertTag(db, { tag_normalized: tag, tag_display: tag, standard_type: 'club' }),
    });
  }

  // Insertion order matters: the row inserted first is the one a single
  // flipping statement would visit first, which is what makes the second swap
  // the failing one.
  insertMemberClubAffiliation(db, MEMBER, CLUB_ONE, { is_primary: 1 });
  insertMemberClubAffiliation(db, MEMBER, CLUB_TWO, { is_primary: 0 });
  insertMemberClubAffiliation(db, SOLO, CLUB_ONE, { is_primary: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('swapping the primary club', () => {
  it('swaps back and forth as often as the member asks, keeping exactly one primary', async () => {
    const app = createApp();

    for (const expected of [CLUB_TWO, CLUB_ONE, CLUB_TWO]) {
      const res = await request(app)
        .post('/clubs/swap-primary')
        .set('Cookie', cookieFor(MEMBER));
      expect(res.status).toBe(303);
      expect(primaryClubIds(MEMBER)).toEqual([expected]);
    }
  });

  it('a member with one club has nothing to swap and nothing changes', async () => {
    const res = await request(createApp())
      .post('/clubs/swap-primary')
      .set('Cookie', cookieFor(SOLO));
    expect(res.status).toBe(303);
    expect(primaryClubIds(SOLO)).toEqual([CLUB_ONE]);
  });

  it('records each swap with the club it moved from and to', () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const rows = db.prepare(`
        SELECT metadata_json FROM audit_entries
         WHERE action_type = 'club.primary_swapped' AND actor_member_id = ?
         ORDER BY created_at ASC, id ASC
      `).all(MEMBER) as Array<{ metadata_json: string }>;
      expect(rows).toHaveLength(3);
      const first = JSON.parse(rows[0].metadata_json);
      expect(first.old_primary_club_id).toBe(CLUB_ONE);
      expect(first.new_primary_club_id).toBe(CLUB_TWO);
    } finally {
      db.close();
    }
  });
});
