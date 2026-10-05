/**
 * Onboarding-wizard copy and affordance contract:
 *  - adding a declared anchor confirms the save with a state-independent
 *    banner that never leaks whether anything matched, and a declared anchor
 *    offers no control to withdraw it;
 *  - a name-coincidence competition-record card frames the possibility of a
 *    same-name stranger before its claim button;
 *  - the no-confident-match banner speaks to members who never had an old
 *    account as well as those who did;
 *  - the completion page ends without an unrelated display-name warning;
 *  - the region field is marked optional;
 *  - the wizard's country browse link falls back to the all-clubs index when
 *    the member's free-text country matches no country page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertOnboardingTask, insertMemberDeclaredAnchor, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3211');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { onboarding: 'none',
    id: 'copy-member', slug: 'copy_member', login_email: 'copy-member@example.com',
    real_name: 'Copy Member', display_name: 'Copy Member',
  });
  // The legacy-claim step is reachable only once personal details are on file.
  insertOnboardingTask(db, 'copy-member', 'personal_details', 'completed');
  // A separate member with personal details still outstanding, so the
  // personal-details form (and its microcopy) renders instead of redirecting.
  insertMember(db, { onboarding: 'none',
    id: 'copy-pd-member', slug: 'copy_pd_member', login_email: 'copy-pd-member@example.com',
    real_name: 'Copy PD Member', display_name: 'Copy PD Member',
  });
  // A second pending member outside the USA and Canada, so the region marker
  // can be checked in both of its states rather than only one.
  insertMember(db, { onboarding: 'none',
    id: 'copy-pd-intl', slug: 'copy_pd_intl', login_email: 'copy-pd-intl@example.com',
    real_name: 'Copy Intl Member', display_name: 'Copy Intl Member', country: 'New Zealand',
  });
  insertClub(db, { id: 'club-copy-real', name: 'Copy Test Club', country: 'Freedonia', publiclyVisible: true });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: 'copy-member' })}`;
}

function pendingDetailsCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: 'copy-pd-member' })}`;
}

describe('personal-details region marker', () => {
  // The marker follows the country: a state or province is part of the address
  // in some countries and meaningless in others, so the form tells the member
  // which case they are in instead of stating one rule for everyone.
  it('the region field is marked required for a member in the USA', async () => {
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', pendingDetailsCookie());
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Region \/ State\s*<span class="fw-600">\(required\)<\/span>/);
    // A US member is offered the state list rather than a free-text box.
    expect(res.text).toContain('Select your state or province');
    expect(res.text).toContain('>Oregon<');
  });

  it('the region field is marked optional for a member outside the USA and Canada', async () => {
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: 'copy-pd-intl' })}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Region \/ State\s*<span class="text-muted">\(optional\)<\/span>/);
    expect(res.text).not.toContain('Select your state or province');
  });
});

describe('anchor add feedback banner', () => {
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

  it('a garbage anchor query value renders no banner, and the retired removed value is garbage', async () => {
    // Declared anchors are add-only, so no action produces a removed notice;
    // a hand-typed query must not draw one either.
    for (const value of ['bogus', 'removed']) {
      const page = await request(createApp())
        .get(`/register/wizard/legacy_claim?anchor=${value}`)
        .set('Cookie', cookie());
      expect(page.status, value).toBe(200);
      expect(page.text, value).not.toContain('We re-checked for matches');
    }
  });

  it('a declared anchor is listed with no control to remove it', async () => {
    insertMemberDeclaredAnchor(db, {
      member_id: 'copy-member', anchor_type: 'former_surname', anchor_value: 'Listedonly',
    });
    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookie());
    expect(page.status).toBe(200);
    expect(page.text).toContain('Listedonly');
    expect(page.text).not.toContain('/register/wizard/legacy_claim/anchors/remove');
  });
});

describe('completion page copy', () => {
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
