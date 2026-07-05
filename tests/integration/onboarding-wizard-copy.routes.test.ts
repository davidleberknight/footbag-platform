/**
 * Onboarding-wizard copy and affordance contract:
 *  - the old-email and date-of-birth fields carry matching microcopy: the
 *    old email helps confirm a legacy claim; the date of birth matches old
 *    records and stays private;
 *  - adding or removing a declared anchor confirms the save with a
 *    state-independent banner that never leaks whether anything matched;
 *  - a name-coincidence competition-record card frames the possibility of a
 *    same-name stranger before its claim button;
 *  - the no-confident-match banner speaks to members who never had an old
 *    account as well as those who did;
 *  - the completion page ends without an unrelated display-name warning;
 *  - the region field is marked optional;
 *  - the check-email page offers a dead-mailbox recovery path;
 *  - the wizard's country browse link falls back to the all-clubs index when
 *    the member's free-text country matches no country page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3211');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: 'copy-member', slug: 'copy_member', login_email: 'copy-member@example.com',
    real_name: 'Copy Member', display_name: 'Copy Member',
  });
  insertClub(db, { name: 'Copy Test Club', country: 'Freedonia' });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: 'copy-member' })}`;
}

describe('legacy-claim matching microcopy', () => {
  it('the old-email field frames the match as confirming the legacy claim', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('helps confirm your legacy claim is really you');
  });

  it('the date-of-birth field says it matches old records and stays private', async () => {
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Used to match your old footbag.org records.');
    expect(res.text).toContain('never shown publicly');
  });

  it('the region field carries the optional marker', async () => {
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Region \/ State <span class="text-muted">\(optional\)<\/span>/);
  });
});

describe('anchor add/remove feedback banners', () => {
  it('adding an anchor redirects with the saved banner; the banner is state-independent', async () => {
    const add = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/add')
      .set('Cookie', cookie())
      .type('form')
      .send({ anchorType: 'old_email', anchorValue: 'nobody-matches-this@example.com' });
    expect(add.status).toBe(303);
    expect(add.headers.location).toBe('/register/wizard/legacy_claim?anchor=saved');

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim?anchor=saved')
      .set('Cookie', cookie());
    expect(page.status).toBe(200);
    // The banner confirms the save and the re-check, and must not say
    // whether anything matched (anti-enumeration).
    expect(page.text).toContain('Saved. We re-checked for matches with your updated details.');
  });

  it('removing an anchor redirects with the removed banner', async () => {
    const anchor = db.prepare(
      "SELECT id FROM member_declared_anchors WHERE member_id = 'copy-member' LIMIT 1",
    ).get() as { id: string } | undefined;
    expect(anchor).toBeDefined();

    const remove = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/remove')
      .set('Cookie', cookie())
      .type('form')
      .send({ anchorId: anchor!.id });
    expect(remove.status).toBe(303);
    expect(remove.headers.location).toBe('/register/wizard/legacy_claim?anchor=removed');

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim?anchor=removed')
      .set('Cookie', cookie());
    expect(page.status).toBe(200);
    expect(page.text).toContain('Removed. We re-checked for matches with your updated details.');
  });

  it('a garbage anchor query value renders no banner', async () => {
    const page = await request(createApp())
      .get('/register/wizard/legacy_claim?anchor=bogus')
      .set('Cookie', cookie());
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('We re-checked for matches');
  });
});

describe('name-coincidence record card framing', () => {
  it('a surname-matched record card explains same-name coincidences before its claim button', async () => {
    // A historical person sharing only the surname surfaces as a reviewable
    // name candidate; the card must frame that it may belong to a same-name
    // stranger before offering "Claim This Record".
    insertHistoricalPerson(db, {
      person_id: 'hp-copy-namesake', person_name: 'Stranger Member',
    });
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    if (res.text.includes('Claim This Record')) {
      expect(res.text).toContain('same-name coincidences happen');
    }
    // The framing is bound to the card in the template regardless of whether
    // this fixture surfaced a candidate.
    const fs = await import('fs');
    const tpl = fs.readFileSync('src/views/register/wizard/legacy-claim.hbs', 'utf8');
    const cardAt = tpl.indexOf('same-name coincidences happen');
    const buttonAt = tpl.indexOf('Claim This Record');
    expect(cardAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeGreaterThan(cardAt);
  });
});

describe('completion page and check-email recovery copy', () => {
  it('the completion page carries no display-name-permanence warning', async () => {
    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookie());
    // Render or redirect depending on task state; the warning text must be
    // gone from the template either way.
    if (res.status === 200) {
      expect(res.text).not.toContain('display name is permanent');
    }
    const fs = await import('fs');
    const tpl = fs.readFileSync('src/views/register/wizard/complete.hbs', 'utf8');
    expect(tpl).not.toContain('display name is permanent');
  });

  it('the check-email page offers a dead-mailbox recovery path', async () => {
    const res = await request(createApp()).get('/register/check-email');
    expect(res.status).toBe(200);
    expect(res.text).toContain('If that mailbox can no longer receive mail');
  });
});

describe('country browse href fallback', () => {
  it('resolves to the country page when an active club exists there, else the all-clubs index', async () => {
    const { clubService } = await import('../../src/services/clubService');
    expect(clubService.countryBrowseHref('Freedonia')).toBe('/clubs/freedonia');
    expect(clubService.countryBrowseHref('Nowhereistan')).toBe('/clubs');
    expect(clubService.countryBrowseHref(null)).toBe('/clubs');
    expect(clubService.countryBrowseHref('   ')).toBe('/clubs');
  });
});
