/**
 * Where the sign-in gate sends a visitor who is not signed in, and where
 * sign-in returns them afterwards.
 *
 * A GET returns to itself. A form post cannot: after sign-in the browser asks
 * for the return address with a GET, and a post-only address answers that with
 * not-found. A post therefore returns to the page the form was on, read from a
 * same-origin Referer, and falls back to a bare sign-in when there is no usable
 * page to return to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4612');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SLUG = 'login_redirect_member';
// A member-only post whose form lives on a different page.
const AVATAR_POST = `/members/${SLUG}/avatar`;
const EDIT_PAGE = `/members/${SLUG}/edit`;
// A signed-in-only post (the onboarding wizard), behind the other gate.
const WIZARD_POST = '/register/wizard/club_affiliations/none';
const WIZARD_PAGE = '/register/wizard/club_affiliations';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: 'login-redirect-001', slug: SLUG, login_email: 'login-redirect@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('sign-in gate on a form post', () => {
  // Defect caught: a visitor whose session lapsed while a form was open signs
  // in and is sent to the post-only address, which answers not-found, instead
  // of back to the form they were filling in.
  it('returns to the same-origin page the form was on, query included, behind either gate', async () => {
    const cases = [
      { post: AVATAR_POST, page: `${EDIT_PAGE}?tab=photo` },
      { post: WIZARD_POST, page: WIZARD_PAGE },
    ];
    for (const { post, page } of cases) {
      const res = await request(createApp())
        .post(post)
        .set('Referer', `http://127.0.0.1${page}`)
        .type('form')
        .send({});
      expect(res.status, post).toBe(302);
      expect(res.headers.location, post).toBe(`/login?returnTo=${encodeURIComponent(page)}`);
    }
  });

  // Defect caught: with no page to go back to, the gate falls back to the post
  // address itself, so sign-in lands the visitor on a not-found page.
  it('with no Referer, sends to a bare sign-in', async () => {
    const res = await request(createApp()).post(AVATAR_POST).type('form').send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  // Defect caught: a Referer naming an address that answers only a post (a
  // confirmation page a post rendered) is taken as the page to return to, and
  // sign-in lands on not-found.
  it('with a Referer naming an address no GET serves, sends to a bare sign-in', async () => {
    // The club leave confirmation is rendered by a post to this address.
    const LEAVE_POST = '/clubs/club_somewhere/leave';
    const res = await request(createApp())
      .post(LEAVE_POST)
      .set('Referer', `http://127.0.0.1${LEAVE_POST}`)
      .type('form')
      .send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  // Defect caught: a form that posts back to the address that shows it (the
  // profile and password forms) loses its return path, so a member whose
  // session lapsed on it signs in to their profile instead of the form.
  it('returns to a form that posts to its own page', async () => {
    const res = await request(createApp())
      .post(EDIT_PAGE)
      .set('Referer', `http://127.0.0.1${EDIT_PAGE}`)
      .type('form')
      .send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=${encodeURIComponent(EDIT_PAGE)}`);
  });

  // Defect caught: a Referer whose path is protocol-relative becomes the
  // return address, and sign-in redirects the visitor off the site; a Referer
  // that is not a URL at all crashes the gate.
  it('ignores a Referer that is unsafe or not a URL', async () => {
    // The backslash form is the one a browser normalises into '//', so it must
    // be refused by the same rule.
    const referers = ['http://127.0.0.1//evil.example/', 'http://127.0.0.1/\\evil.example/', 'not a url at all'];
    for (const referer of referers) {
      const res = await request(createApp())
        .post(AVATAR_POST)
        .set('Referer', referer)
        .type('form')
        .send({});
      expect(res.status, referer).toBe(302);
      expect(res.headers.location, referer).toBe('/login');
    }
  });
});

describe('sign-in gate on a GET', () => {
  // Defect caught: the post rule leaks into GETs, so a visitor opening a
  // member page while signed out is returned to wherever they came from (or
  // nowhere) instead of the page they asked for.
  it('returns to the requested address itself, whatever the Referer says', async () => {
    const res = await request(createApp())
      .get(`${EDIT_PAGE}?tab=photo`)
      .set('Referer', 'http://127.0.0.1/clubs');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=${encodeURIComponent(`${EDIT_PAGE}?tab=photo`)}`);
  });
});
