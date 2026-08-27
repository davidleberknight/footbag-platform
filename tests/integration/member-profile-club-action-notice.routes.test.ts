/**
 * Club actions a member takes on their own affiliations redirect to their
 * profile, so the profile is the surface that has to report how they went.
 * The contract: the outcome renders on the page the member lands on, a
 * refusal renders in the neutral band rather than the success one, the note is
 * taken exactly once, and it never survives to appear on the next club page
 * the member opens.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3423');

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

const TWO_CLUB = 'can-two-club-member';
const ONE_CLUB = 'can-one-club-member';
const TWO_CLUB_SLUG = 'can_two_club_member';
const ONE_CLUB_SLUG = 'can_one_club_member';
const CLUB_A = 'can-club-a';
const CLUB_B = 'can-club-b';
const CLUB_A_KEY = 'club_can_a';

let createApp: Awaited<ReturnType<typeof importApp>>;

const cookieFor = (id: string) => `__Host-footbag_session=${createTestSessionJwt({ memberId: id, role: 'member' })}`;

/** The flash cookie a response hands back, in `name=value` form, or '' when the
 *  response says nothing about it. */
function flashCookieIn(res: { headers: Record<string, unknown> }): string {
  const setCookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const flash = setCookies.find((c) => c.startsWith('footbag_flash='));
  return flash ? flash.split(';')[0] : '';
}

/** What a browser would still be holding after this response: the value the
 *  response set, or the one it was already carrying if the response left it
 *  alone. Standing in for the cookie jar is the whole point here, because the
 *  leak under test is a note the profile failed to clear reaching a later page. */
function flashCookieAfter(carried: string, res: { headers: Record<string, unknown> }): string {
  return flashCookieIn(res) || carried;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const [id, slug] of [
    [TWO_CLUB, TWO_CLUB_SLUG],
    [ONE_CLUB, ONE_CLUB_SLUG],
  ] as const) {
    insertMember(db, { id, slug, display_name: slug, login_email: `${id}@example.com` });
    completeOnboarding(db, id);
  }

  // Club A carries a hashtag so it has a public key: the leak check needs a
  // club page to visit after the profile has shown the note.
  insertClub(db, {
    id: CLUB_A,
    name: 'Club Can A',
    city: 'Portland',
    country: 'USA',
    hashtag_tag_id: insertTag(db, { tag_normalized: `#${CLUB_A_KEY}`, tag_display: `#${CLUB_A_KEY}`, is_standard: 1, standard_type: 'club' }),
  });
  insertClub(db, { id: CLUB_B, name: 'Club Can B', city: 'Salem', country: 'USA' });

  insertMemberClubAffiliation(db, TWO_CLUB, CLUB_A, { is_primary: 1 });
  insertMemberClubAffiliation(db, TWO_CLUB, CLUB_B, { is_primary: 0 });
  insertMemberClubAffiliation(db, ONE_CLUB, CLUB_A, { is_primary: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** Runs a club action and returns the flash cookie it left for the profile. */
async function swapPrimaryAs(memberId: string): Promise<string> {
  const acted = await request(createApp())
    .post('/clubs/swap-primary')
    .set('Cookie', cookieFor(memberId));
  expect(acted.status).toBe(303);
  const carried = flashCookieIn(acted);
  expect(carried).not.toBe('');
  return carried;
}

describe('a club action outcome on the member profile', () => {
  it('tells the member what happened on the page the action sent them to', async () => {
    const carried = await swapPrimaryAs(TWO_CLUB);

    const shown = await request(createApp())
      .get(`/members/${TWO_CLUB_SLUG}`)
      .set('Cookie', [cookieFor(TWO_CLUB), carried].join('; '));

    expect(shown.status).toBe(200);
    expect(shown.text).toContain('Primary club swapped.');
  });

  it('renders a refusal in the neutral band, not the success one', async () => {
    const carried = await swapPrimaryAs(ONE_CLUB);

    const shown = await request(createApp())
      .get(`/members/${ONE_CLUB_SLUG}`)
      .set('Cookie', [cookieFor(ONE_CLUB), carried].join('; '));

    expect(shown.status).toBe(200);
    expect(shown.text).toContain('<p class="notice mb-6" role="status">You need two clubs to swap primary.</p>');
    // The green success treatment belongs to the profile-updated note, which
    // nothing in this request wrote. A refusal wearing it would tell the
    // member the opposite of what happened.
    expect(shown.text).not.toContain('form-success-banner');
  });

  it('takes the outcome once: the response that shows it clears it, and a reload does not repeat it', async () => {
    const carried = await swapPrimaryAs(TWO_CLUB);

    const shown = await request(createApp())
      .get(`/members/${TWO_CLUB_SLUG}`)
      .set('Cookie', [cookieFor(TWO_CLUB), carried].join('; '));
    expect(shown.text).toContain('Primary club swapped.');
    expect(flashCookieIn(shown)).toBe('footbag_flash=');

    const reloaded = await request(createApp())
      .get(`/members/${TWO_CLUB_SLUG}`)
      .set('Cookie', [cookieFor(TWO_CLUB), flashCookieAfter(carried, shown)].join('; '));
    expect(reloaded.status).toBe(200);
    expect(reloaded.text).not.toContain('Primary club swapped.');
  });

  it('does not resurface on the next club page the member opens', async () => {
    const carried = await swapPrimaryAs(TWO_CLUB);

    const shown = await request(createApp())
      .get(`/members/${TWO_CLUB_SLUG}`)
      .set('Cookie', [cookieFor(TWO_CLUB), carried].join('; '));
    expect(shown.text).toContain('Primary club swapped.');

    // The club page consumes this same kind, so a note the profile left in the
    // cookie would announce a club action there that happened elsewhere.
    const clubPage = await request(createApp())
      .get(`/clubs/${CLUB_A_KEY}`)
      .set('Cookie', [cookieFor(TWO_CLUB), flashCookieAfter(carried, shown)].join('; '));
    expect(clubPage.status).toBe(200);
    expect(clubPage.text).not.toContain('Primary club swapped.');
  });
});
