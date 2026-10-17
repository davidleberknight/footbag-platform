/**
 * Making one of a member's two clubs primary. The profile offers a Make
 * Primary control beside the club that is not primary, and the form names the
 * club it makes primary, so a member can move their primary back and forth as
 * often as they like, and a second submit of the same page asks for the state
 * the first one made rather than flipping it back. One partial unique index
 * allows a single primary per member and SQLite checks it per row as a
 * statement walks the table, so the change must clear before it sets; the
 * member always holds exactly one primary.
 *
 * A repeated submit reports the first outcome on the profile it lands on and
 * writes nothing: the member's own repeat repeats the success, a target that
 * was already primary without their change reads as informational, and a club
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

const MEMBER   = 'make-primary-member-001';
const SOLO     = 'make-primary-solo-001';
const REPEATER = 'make-primary-repeat-001';
const HOLDER   = 'make-primary-held-001';
const OUTSIDER = 'make-primary-outsider-001';
const VIEWER   = 'make-primary-viewer-001';
const LONE     = 'make-primary-lone-001';
const SLUG: Record<string, string> = {
  [LONE]:     'make_primary_lone',
  [MEMBER]:   'make_primary_member',
  [SOLO]:     'make_primary_solo',
  [REPEATER]: 'make_primary_repeat',
  [HOLDER]:   'make_primary_held',
  [OUTSIDER]: 'make_primary_outsider',
  [VIEWER]:   'make_primary_viewer',
};
const CLUB_ONE   = 'club-make-primary-one';
const CLUB_TWO   = 'club-make-primary-two';
const CLUB_THREE = 'club-make-primary-three';
const KEY: Record<string, string> = {
  [CLUB_ONE]:   'club_make_primary_one',
  [CLUB_TWO]:   'club_make_primary_two',
  [CLUB_THREE]: 'club_make_primary_three',
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

/** Everything a change of primary could write for this member: their
 *  affiliation rows' versions, their audit rows, and the outbox. A repeat must
 *  leave all three exactly as they were. */
function writeState(memberId: string): { versions: string; primaryAudits: number; outbox: number } {
  return readDb((db) => ({
    versions: (db.prepare(`
      SELECT group_concat(club_id || ':' || version || ':' || is_primary, ',') AS v
        FROM (SELECT club_id, version, is_primary FROM member_club_affiliations
               WHERE member_id = ? ORDER BY club_id)
    `).get(memberId) as { v: string | null }).v ?? '',
    primaryAudits: (db.prepare(`
      SELECT COUNT(*) AS n FROM audit_entries
       WHERE action_type = 'club.primary_swapped' AND actor_member_id = ?
    `).get(memberId) as { n: number }).n,
    outbox: (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n,
  }));
}

function makePrimary(memberId: string, clubKey: string) {
  return request(createApp())
    .post('/clubs/make-primary')
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ club_key: clubKey });
}

/** Follow the action's redirect the way a browser would, carrying the flash
 *  cookie it set, and return the page the member lands on. */
async function landedOn(memberId: string, res: { headers: Record<string, unknown> }): Promise<string> {
  const setCookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const flash = setCookies.find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
  expect(flash, 'the action left no outcome for the profile to show').toBeDefined();
  const shown = await request(createApp())
    .get(res.headers.location as string)
    .set('Cookie', [cookieFor(memberId), flash].join('; '));
  expect(shown.status).toBe(200);
  return shown.text;
}

/** The My Clubs section of the member's own profile, and its entries: for each
 *  club shown, the club key its Make Primary form names, or null when that
 *  entry carries no such form. */
async function makePrimaryControls(memberId: string): Promise<{ block: string; controls: Record<string, string | null> }> {
  const res = await request(createApp())
    .get(`/members/${SLUG[memberId]}`)
    .set('Cookie', cookieFor(memberId));
  expect(res.status).toBe(200);
  const start = res.text.indexOf('<div class="my-clubs-block">');
  const end = res.text.indexOf('<div class="my-clubs-ctas', start);
  expect(start, 'the profile renders no My Clubs section').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = res.text.slice(start, end);
  const controls: Record<string, string | null> = {};
  for (const item of block.split('<li class="my-clubs-item">').slice(1)) {
    const club = /<a href="\/clubs\/([^"]+)" class="my-clubs-name">/.exec(item)?.[1];
    expect(club, 'a My Clubs entry names no club').toBeDefined();
    const named = /<form method="POST" action="\/clubs\/make-primary"[^>]*>\s*<input type="hidden" name="club_key" value="([^"]*)">/
      .exec(item)?.[1];
    controls[club!] = named ?? null;
  }
  return { block, controls };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const id of [MEMBER, SOLO, REPEATER, HOLDER, OUTSIDER, VIEWER, LONE]) {
    insertMember(db, { id, slug: SLUG[id], display_name: SLUG[id], login_email: `${SLUG[id]}@example.com` });
    completeOnboarding(db, id);
  }

  for (const [id, name] of [
    [CLUB_ONE,   'Primary Club One'],
    [CLUB_TWO,   'Primary Club Two'],
    [CLUB_THREE, 'Primary Club Three'],
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
  // flipping statement would visit first, which is what makes the second
  // change the failing one.
  for (const id of [MEMBER, REPEATER, HOLDER, OUTSIDER, VIEWER]) {
    insertMemberClubAffiliation(db, id, CLUB_ONE, { is_primary: 1 });
    insertMemberClubAffiliation(db, id, CLUB_TWO, { is_primary: 0 });
  }
  insertMemberClubAffiliation(db, SOLO, CLUB_ONE, { is_primary: 1 });
  // A lone club held as secondary breaks the one-primary rule; the control
  // must still not offer an action the route can only refuse.
  insertMemberClubAffiliation(db, LONE, CLUB_ONE, { is_primary: 0 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the Make Primary control on the member profile', () => {
  // Defect caught: the control sits beside the club that is already primary,
  // or beside both, so the member cannot tell which club pressing it promotes,
  // or the form names the wrong club and pressing it changes nothing.
  it('appears beside the secondary club only, names that club, and moves once it is pressed', async () => {
    const before = await makePrimaryControls(VIEWER);
    expect(before.controls).toEqual({ [KEY[CLUB_ONE]]: null, [KEY[CLUB_TWO]]: KEY[CLUB_TWO] });

    const res = await makePrimary(VIEWER, before.controls[KEY[CLUB_TWO]]!);
    expect(res.status).toBe(303);
    expect(primaryClubIds(VIEWER)).toEqual([CLUB_TWO]);

    const after = await makePrimaryControls(VIEWER);
    expect(after.controls).toEqual({ [KEY[CLUB_ONE]]: KEY[CLUB_ONE], [KEY[CLUB_TWO]]: null });
  });

  // Defect caught: a member with one club is offered a control that can only
  // be refused, or the retired swap button comes back beside the list.
  it('is absent for a member with one club, and no swap control remains', async () => {
    const solo = await makePrimaryControls(SOLO);
    expect(solo.controls).toEqual({ [KEY[CLUB_ONE]]: null });
    expect((await makePrimaryControls(LONE)).controls).toEqual({ [KEY[CLUB_ONE]]: null });

    const twoClubs = await makePrimaryControls(MEMBER);
    for (const shown of [solo.block, twoClubs.block]) {
      expect(shown).not.toContain('/clubs/swap-primary');
      expect(shown).not.toMatch(/swap/i);
    }
  });
});

describe('the controls in a My Clubs entry', () => {
  // Defect caught: a control that acts on the member's club is drawn as
  // underlined text, so it reads as a link to somewhere rather than an act,
  // and sits out of line with the buttons beside it.
  it('are all compact outlined buttons', async () => {
    const { block } = await makePrimaryControls(HOLDER);
    const classes = [...block.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    // Make Primary on one club, Leave Club on each.
    expect(classes.length).toBeGreaterThanOrEqual(3);
    for (const cls of classes) {
      expect(cls, `a My Clubs control is drawn as "${cls}"`).toBe('btn btn-outline btn-sm');
    }
  });
});

describe('making a club primary', () => {
  // Defect caught: a member cannot move their primary back, or a change leaves
  // them with two primaries or none.
  it('makes the named club primary each time, back and forth, keeping exactly one primary', async () => {
    for (const target of [CLUB_TWO, CLUB_ONE, CLUB_TWO]) {
      const res = await makePrimary(MEMBER, KEY[target]);
      expect(res.status).toBe(303);
      expect(primaryClubIds(MEMBER)).toEqual([target]);
    }
  });

  // Defect caught: a member with one club is told they changed something, or
  // loses the primary flag on the only club they hold.
  it('a member with one club is refused and nothing changes', async () => {
    const before = writeState(SOLO);
    const res = await makePrimary(SOLO, KEY[CLUB_ONE]);
    expect(res.status).toBe(303);
    expect(primaryClubIds(SOLO)).toEqual([CLUB_ONE]);
    expect(writeState(SOLO)).toEqual(before);

    const page = await landedOn(SOLO, res);
    expect(page).toContain('<div class="form-error-banner" role="alert">You need two clubs to choose a primary.</div>');
    expect(page).not.toContain('form-success-banner');
  });

  // Defect caught: the ledger cannot say which club a change moved the primary
  // from and to, so a disputed primary cannot be reconstructed.
  it('records each change with the club it moved from and to', () => {
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

describe('Make Primary submitted twice', () => {
  // Defect caught: a double click or a back-button re-post flips the primary
  // straight back, records a second change, or tells the member it failed.
  it('the member\'s own repeat changes nothing and repeats the first success', async () => {
    const first = await makePrimary(REPEATER, KEY[CLUB_TWO]);
    expect(first.status).toBe(303);
    expect(primaryClubIds(REPEATER)).toEqual([CLUB_TWO]);
    const afterFirst = writeState(REPEATER);
    expect(afterFirst.primaryAudits).toBe(1);

    const second = await makePrimary(REPEATER, KEY[CLUB_TWO]);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(primaryClubIds(REPEATER)).toEqual([CLUB_TWO]);
    expect(writeState(REPEATER)).toEqual(afterFirst);

    const page = await landedOn(REPEATER, second);
    expect(page).toContain('<div class="form-success-banner" role="status">Primary club changed.</div>');
  });

  // Defect caught: a member whose club was already primary is told they
  // changed it, or is shown a refusal, when nothing needed to change.
  it('a target that is already primary without the member\'s own change reads as informational', async () => {
    const before = writeState(HOLDER);

    const res = await makePrimary(HOLDER, KEY[CLUB_ONE]);
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
  // either promotes whichever other club they hold or reads as a success.
  it('a club the member is not currently in is refused and nothing changes', async () => {
    const before = writeState(OUTSIDER);

    const res = await makePrimary(OUTSIDER, KEY[CLUB_THREE]);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${SLUG[OUTSIDER]}`);
    expect(primaryClubIds(OUTSIDER)).toEqual([CLUB_ONE]);
    expect(writeState(OUTSIDER)).toEqual(before);

    const page = await landedOn(OUTSIDER, res);
    expect(page).toContain('<div class="form-error-banner" role="alert">You are not a member of this club.</div>');
    expect(page).not.toContain('form-success-banner');
  });
});
