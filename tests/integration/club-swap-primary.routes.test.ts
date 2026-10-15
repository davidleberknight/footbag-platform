/**
 * Making one of a member's two clubs primary. The form names the club it makes
 * primary, so a member can swap back and forth as often as they like, and a
 * second submit of the same page asks for the state the first one made rather
 * than flipping it back. One partial unique index allows a single primary per
 * member and SQLite checks it per row as a statement walks the table, so the
 * swap must clear before it sets; the member always holds exactly one primary.
 *
 * A repeated submit reports the first outcome on the profile it lands on and
 * writes nothing: the member's own repeat repeats the success, a target that
 * was already primary without their swap reads as informational, and a club
 * they are not in is refused.
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
const REPEATER = 'swap-repeat-001';
const HOLDER   = 'swap-held-001';
const OUTSIDER = 'swap-outsider-001';
const SLUG: Record<string, string> = {
  [MEMBER]:   'swap_member',
  [SOLO]:     'swap_solo',
  [REPEATER]: 'swap_repeat',
  [HOLDER]:   'swap_held',
  [OUTSIDER]: 'swap_outsider',
};
const CLUB_ONE   = 'club-swap-one';
const CLUB_TWO   = 'club-swap-two';
const CLUB_THREE = 'club-swap-three';
const KEY: Record<string, string> = {
  [CLUB_ONE]:   'club_swap_one',
  [CLUB_TWO]:   'club_swap_two',
  [CLUB_THREE]: 'club_swap_three',
};

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

function readDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function primaryClubIds(memberId: string): string[] {
  return readDb((db) => (db.prepare(`
    SELECT club_id FROM member_club_affiliations
     WHERE member_id = ? AND is_current = 1 AND is_primary = 1
     ORDER BY club_id
  `).all(memberId) as Array<{ club_id: string }>).map((r) => r.club_id));
}

/** Everything a swap could write for this member: their affiliation rows'
 *  versions, their swap audit rows, and the outbox. A repeat must leave all
 *  three exactly as they were. */
function writeState(memberId: string): { versions: string; swapAudits: number; outbox: number } {
  return readDb((db) => ({
    versions: (db.prepare(`
      SELECT group_concat(club_id || ':' || version || ':' || is_primary, ',') AS v
        FROM (SELECT club_id, version, is_primary FROM member_club_affiliations
               WHERE member_id = ? ORDER BY club_id)
    `).get(memberId) as { v: string | null }).v ?? '',
    swapAudits: (db.prepare(`
      SELECT COUNT(*) AS n FROM audit_entries
       WHERE action_type = 'club.primary_swapped' AND actor_member_id = ?
    `).get(memberId) as { n: number }).n,
    outbox: (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n,
  }));
}

function swap(memberId: string, clubKey: string) {
  return request(createApp())
    .post('/clubs/swap-primary')
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ club_key: clubKey });
}

/** Follow a swap's redirect the way a browser would, carrying the flash cookie
 *  it set, and return the page the member lands on. */
async function landedOn(memberId: string, res: { headers: Record<string, unknown> }): Promise<string> {
  const setCookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const flash = setCookies.find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
  expect(flash, 'the swap left no outcome for the profile to show').toBeDefined();
  const shown = await request(createApp())
    .get(res.headers.location as string)
    .set('Cookie', [cookieFor(memberId), flash].join('; '));
  expect(shown.status).toBe(200);
  return shown.text;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const id of [MEMBER, SOLO, REPEATER, HOLDER, OUTSIDER]) {
    insertMember(db, { id, slug: SLUG[id], display_name: SLUG[id], login_email: `${SLUG[id]}@example.com` });
    completeOnboarding(db, id);
  }

  for (const [id, name] of [
    [CLUB_ONE,   'Swap Club One'],
    [CLUB_TWO,   'Swap Club Two'],
    [CLUB_THREE, 'Swap Club Three'],
  ] as const) {
    const tag = `#${KEY[id]}`;
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
  for (const id of [MEMBER, REPEATER, HOLDER, OUTSIDER]) {
    insertMemberClubAffiliation(db, id, CLUB_ONE, { is_primary: 1 });
    insertMemberClubAffiliation(db, id, CLUB_TWO, { is_primary: 0 });
  }
  insertMemberClubAffiliation(db, SOLO, CLUB_ONE, { is_primary: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('swapping the primary club', () => {
  // Defect caught: a member cannot move their primary back, or a swap leaves
  // them with two primaries or none.
  it('makes the named club primary each time, back and forth, keeping exactly one primary', async () => {
    for (const target of [CLUB_TWO, CLUB_ONE, CLUB_TWO]) {
      const res = await swap(MEMBER, KEY[target]);
      expect(res.status).toBe(303);
      expect(primaryClubIds(MEMBER)).toEqual([target]);
    }
  });

  it('a member with one club has nothing to swap and nothing changes', async () => {
    const res = await swap(SOLO, KEY[CLUB_ONE]);
    expect(res.status).toBe(303);
    expect(primaryClubIds(SOLO)).toEqual([CLUB_ONE]);
  });

  // Defect caught: the ledger cannot say which club a swap moved the primary
  // from and to, so a disputed primary cannot be reconstructed.
  it('records each swap with the club it moved from and to', () => {
    const moves = readDb((db) => (db.prepare(`
      SELECT metadata_json FROM audit_entries
       WHERE action_type = 'club.primary_swapped' AND actor_member_id = ?
    `).all(MEMBER) as Array<{ metadata_json: string }>)
      .map((r) => JSON.parse(r.metadata_json) as { old_primary_club_id: string; new_primary_club_id: string })
      .map((m) => `${m.old_primary_club_id}>${m.new_primary_club_id}`)
      .sort());
    expect(moves).toEqual([
      `${CLUB_ONE}>${CLUB_TWO}`,
      `${CLUB_ONE}>${CLUB_TWO}`,
      `${CLUB_TWO}>${CLUB_ONE}`,
    ].sort());
  });
});

describe('a swap submitted twice', () => {
  // Defect caught: a double click or a back-button re-post flips the primary
  // straight back, records a second swap, or tells the member it failed.
  it('the member\'s own repeat changes nothing and repeats the first success', async () => {
    const first = await swap(REPEATER, KEY[CLUB_TWO]);
    expect(first.status).toBe(303);
    expect(primaryClubIds(REPEATER)).toEqual([CLUB_TWO]);
    const afterFirst = writeState(REPEATER);
    expect(afterFirst.swapAudits).toBe(1);

    const second = await swap(REPEATER, KEY[CLUB_TWO]);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(primaryClubIds(REPEATER)).toEqual([CLUB_TWO]);
    expect(writeState(REPEATER)).toEqual(afterFirst);

    const page = await landedOn(REPEATER, second);
    expect(page).toContain('<div class="form-success-banner" role="status">Primary club swapped.</div>');
  });

  // Defect caught: a member whose club was already primary is told they
  // swapped it, or is shown a refusal, when nothing needed to change.
  it('a target that is already primary without the member\'s own swap reads as informational', async () => {
    const before = writeState(HOLDER);

    const res = await swap(HOLDER, KEY[CLUB_ONE]);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${SLUG[HOLDER]}`);
    expect(primaryClubIds(HOLDER)).toEqual([CLUB_ONE]);
    expect(writeState(HOLDER)).toEqual(before);

    const page = await landedOn(HOLDER, res);
    expect(page).toContain('<p class="form-notice" role="status">This is already your primary club.</p>');
    expect(page).not.toContain('form-success-banner');
    expect(page).not.toContain('form-error-banner');
  });

  // Defect caught: a crafted or stale form naming a club the member is not in
  // either swaps to whichever other club they hold or reads as a success.
  it('a club the member is not currently in is refused and nothing changes', async () => {
    const before = writeState(OUTSIDER);

    const res = await swap(OUTSIDER, KEY[CLUB_THREE]);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${SLUG[OUTSIDER]}`);
    expect(primaryClubIds(OUTSIDER)).toEqual([CLUB_ONE]);
    expect(writeState(OUTSIDER)).toEqual(before);

    const page = await landedOn(OUTSIDER, res);
    expect(page).toContain('<div class="form-error-banner" role="alert">You are not a member of this club.</div>');
    expect(page).not.toContain('form-success-banner');
  });
});
