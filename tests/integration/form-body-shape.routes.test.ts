/**
 * A form field posted in a shape no page of the site sends is answered as the
 * form's own validation failure, never as a server error.
 *
 * A browser posts each field once, as text. A hand-crafted request can repeat a
 * field (an array) or, as JSON, send a number or an object. Each sign-in,
 * registration and password form, and the curator's media edit, must answer
 * every such shape with the form re-rendered and nothing written: a repeated
 * field at 422 with a refusal banner; a JSON body with no server error (the
 * site no longer parses JSON on a form route, so it arrives as an empty form).
 * Extra privileged fields posted alongside a real form are ignored.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertMediaItem, insertClub, insertMailingList, insertEmailTemplate, insertHistoricalPerson, insertEvent,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4898');

const MEMBER_ID = 'shape-member-001';
const MEMBER_SLUG = 'shape_member';
const MEMBER_EMAIL = 'shape-member@example.com';
const MEMBER_PASSWORD = 'ShapePassword!1';
const ADMIN_ID = 'shape-admin-001';
const SYSTEM_ID = 'shape-system-001';
let mediaId = '';
let clubId = '';
let listSlug = '';
let personId = '';
let eventId = '';

let app: import('express').Express;

const memberCookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
const adminCookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

function sessionCookieFrom(res: { get(h: string): string[] | undefined }): string | undefined {
  return (res.get('Set-Cookie') ?? []).find(
    (c) => c.startsWith('__Host-footbag_session=') && !/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c),
  );
}

function readDb<T>(sql: string, ...params: unknown[]): T {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare(sql).get(...params) as T;
  } finally {
    db.close();
  }
}

const passwordHashOf = (id: string) =>
  readDb<{ password_hash: string }>('SELECT password_hash FROM members WHERE id = ?', id).password_hash;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Shape Member',
    password_hash: await hashTestPassword(MEMBER_PASSWORD),
    email_verified_at: '2025-01-01T00:00:00.000Z',
  });
  insertMember(db, { id: ADMIN_ID, slug: 'shape_admin', login_email: 'shape-admin@example.com', display_name: 'Shape Admin', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky_shape', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
  mediaId = insertMediaItem(db, { uploader_member_id: SYSTEM_ID, caption: 'Original caption' });
  clubId = insertClub(db, { name: 'Shape Club' });
  listSlug = insertMailingList(db, {});
  insertEmailTemplate(db, { template_key: 'shape_template' });
  personId = insertHistoricalPerson(db, { person_name: 'Shape Person' });
  eventId = insertEvent(db, {});
  db.close();
  const createApp = await importApp();
  app = createApp();
});

afterAll(() => cleanupTestDb(dbPath));

/**
 * Each crash-prone form: where it posts, the text field the wrong shape goes
 * into, the rest of a well-formed body, the cookie it needs, and the form
 * action its re-render must carry.
 */
interface FormCase {
  name: string;
  path: () => string;
  field: string;
  rest: () => Record<string, string>;
  cookie?: () => string;
  formAction: () => string;
}

const FORMS: FormCase[] = [
  { name: 'sign-in', path: () => '/login', field: 'email', rest: () => ({ password: MEMBER_PASSWORD }), formAction: () => '/login' },
  {
    name: 'registration',
    path: () => '/register',
    field: 'email',
    rest: () => ({ givenNames: 'Shape', familyName: 'Visitor', displayName: 'Shape Visitor', password: 'VisitorPass!1', confirmPassword: 'VisitorPass!1' }),
    formAction: () => '/register',
  },
  { name: 'verification resend', path: () => '/verify/resend', field: 'email', rest: () => ({}), formAction: () => '/verify/resend' },
  { name: 'password forgot', path: () => '/password/forgot', field: 'email', rest: () => ({}), formAction: () => '/password/forgot' },
  {
    name: 'password reset',
    path: () => '/password/reset/shape-unknown-token',
    field: 'newPassword',
    rest: () => ({ confirmPassword: 'Another!Pass1' }),
    formAction: () => '/password/reset/shape-unknown-token',
  },
  {
    name: 'change password',
    path: () => `/members/${MEMBER_SLUG}/edit/password`,
    field: 'newPassword',
    rest: () => ({ oldPassword: MEMBER_PASSWORD, confirmPassword: 'Another!Pass1' }),
    cookie: memberCookie,
    formAction: () => `/members/${MEMBER_SLUG}/edit/password`,
  },
  {
    name: 'curator media edit',
    path: () => `/admin/curator/media/${mediaId}/edit`,
    field: 'caption',
    rest: () => ({ tags: '' }),
    cookie: adminCookie,
    formAction: () => `/admin/curator/media/${mediaId}/edit`,
  },
];

describe('a field posted twice is refused as the form\'s own validation failure', () => {
  // Defect caught: a repeated form key reaches code that expects one string
  // and throws, so the visitor gets a server error instead of their form back,
  // or the request changes something.
  it.each(FORMS.map((f) => [f.name, f] as const))('%s', async (_name, f) => {
    const passwordBefore = passwordHashOf(MEMBER_ID);
    const rest = new URLSearchParams(f.rest()).toString();
    const body = `${f.field}=first&${f.field}=second${rest ? `&${rest}` : ''}`;
    let req = request(app).post(f.path()).type('form');
    if (f.cookie) req = req.set('Cookie', f.cookie());
    const res = await req.send(body);

    expect(res.status, res.text.slice(0, 400)).toBe(422);
    expect(res.text).toContain('form-error-banner');
    expect(res.text).toContain(`action="${f.formAction()}"`);
    // The message sits beside the field it names, inside that field's block,
    // so the visitor sees which input to fix.
    const at = res.text.indexOf(`name="${f.field}"`);
    expect(at, 'the refused field is not on the re-rendered form').toBeGreaterThan(-1);
    const fieldBlock = res.text.slice(at, res.text.indexOf('</div>', at));
    expect(fieldBlock, `no inline error beside ${f.field}`).toContain('class="form-field-error"');
    expect(sessionCookieFrom(res), 'a refused form started a session').toBeUndefined();
    expect(passwordHashOf(MEMBER_ID), 'a refused form changed a password').toBe(passwordBefore);
  });
});

describe('a JSON body carrying a number or an object never gives a server error', () => {
  // Defect caught: a JSON-typed post puts a non-string value into a field the
  // code treats as a string, and the TypeError surfaces as a 500.
  for (const f of FORMS) {
    for (const [shape, value] of [['a number', 7], ['an object', { toString: 1 }]] as const) {
      it(`${f.name}, ${shape}`, async () => {
        const passwordBefore = passwordHashOf(MEMBER_ID);
        let req = request(app).post(f.path()).set('Content-Type', 'application/json');
        if (f.cookie) req = req.set('Cookie', f.cookie());
        const res = await req.send({ ...f.rest(), [f.field]: value });

        expect(res.status, res.text.slice(0, 400)).toBeLessThan(500);
        expect(sessionCookieFrom(res)).toBeUndefined();
        expect(passwordHashOf(MEMBER_ID)).toBe(passwordBefore);
      });
    }
  }
});

describe('a refused form comes back holding what was typed', () => {
  // Defect caught: a refusal over one bad field erases every other field the
  // visitor filled in, so a long form has to be typed again.
  it('registration keeps the names typed beside a field posted twice', async () => {
    const res = await request(app)
      .post('/register')
      .type('form')
      .send('givenNames=Keptgiven&familyName=Keptfamily&displayName=Keptgiven%20Keptfamily&email=a%40example.com&email=b%40example.com');
    expect(res.status).toBe(422);
    expect(res.text).toContain('value="Keptgiven"');
    expect(res.text).toContain('value="Keptfamily"');
    expect(res.text).toContain('value="Keptgiven Keptfamily"');
  });
});

describe('a member form with one question refuses a field posted twice with its banner', () => {
  // Defect caught: a hand-made post repeating a field reaches the service as a
  // list and throws, or files a request or flips a subscription on whichever
  // value the code read; or the contact message the member typed is lost.
  it('contact the administrators keeps the message typed', async () => {
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/contact-admin`)
      .set('Cookie', memberCookie())
      .type('form')
      .send('category=other&category=identity_link_issue&message=Kept+typed+message');
    expect(res.status).toBe(422);
    expect(res.text).toContain('form-error-banner');
    expect(res.text).toContain('Kept typed message');
  });

  it('email preferences', async () => {
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/email-preferences`)
      .set('Cookie', memberCookie())
      .type('form')
      .send('slug=news&slug=events&subscribe=1');
    expect(res.status).toBe(422);
    expect(res.text).toContain('form-error-banner');
  });

  it('the unsubscribe button', async () => {
    const res = await request(app)
      .post('/email/unsubscribe?t=shape-token')
      .type('form')
      .send('confirm=1&confirm=1');
    expect(res.status).toBe(422);
  });
});

describe('an administrator form refuses a field posted twice at 422 and changes nothing', () => {
  // Defect caught: a hand-made admin post repeating a field reaches a service
  // as a list and throws a server error, or acts on whichever value it read.
  const clubName = () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      return (db.prepare('SELECT name FROM clubs WHERE id = ?').get(clubId) as { name: string }).name;
    } finally {
      db.close();
    }
  };
  const cases: Array<[string, () => string, string, () => string]> = [
    ['alarm acknowledge', () => '/admin/alarms/shape-alarm/acknowledge', 'note=a&note=b', adminCookie],
    ['email-log review', () => '/admin/email-log/shape-outbox/review', 'note=a&note=b', adminCookie],
    ['bootstrap claim', () => '/admin/bootstrap-claim', 'token=a&token=b', memberCookie],
    ['mailing-list send', () => `/admin/mailing-lists/${listSlug}/compose`, 'subject=a&subject=b&bodyText=x&sendToken=t', adminCookie],
    ['club content preview', () => `/admin/clubs/${clubId}/content`, 'name=a&name=b&reason=r', adminCookie],
    ['club content confirm', () => `/admin/clubs/${clubId}/content/confirm`, 'name=a&name=b&reason=r', adminCookie],
    ['club hashtag preview', () => `/admin/clubs/${clubId}/hashtag`, 'hashtag_slug=a&hashtag_slug=b&reason=r', adminCookie],
    ['club hashtag confirm', () => `/admin/clubs/${clubId}/hashtag/confirm`, 'hashtag_slug=a&hashtag_slug=b&reason=r', adminCookie],
    ['email template edit', () => '/admin/email-templates/shape_template/edit', 'subjectTemplate=a&subjectTemplate=b&bodyTemplate=x&piiClassification=none', adminCookie],
    ['historical record preview', () => `/admin/historical-records/${personId}/correction`, 'name=a&name=b&reason=r', adminCookie],
    ['historical record confirm', () => `/admin/historical-records/${personId}/correction/confirm`, 'name=a&name=b&reason=r', adminCookie],
    ['hashtag retire preview', () => '/admin/tags/retire', 'tag=%23a&tag=%23b&reason=r', adminCookie],
    ['hashtag retire confirm', () => '/admin/tags/retire/confirm', 'tag=%23a&tag=%23b&reason=r', adminCookie],
    ['mailing-list create', () => '/admin/mailing-lists/new', 'name=a&name=b&description=&fromIdentity=x&subjectPrefix=', adminCookie],
    ['mailing-list edit', () => `/admin/mailing-lists/${listSlug}/edit`, 'name=a&name=b&description=&fromIdentity=x&subjectPrefix=', adminCookie],
    ['mailing-list subscription adjust', () => `/admin/mailing-lists/${listSlug}/subscriptions/adjust`, `memberId=${MEMBER_ID}&status=a&status=b&reason=r`, adminCookie],
    ['system parameters save', () => '/admin/system-parameters', 'reason=a&reason=b', adminCookie],
    ['price schedule', () => '/admin/system-parameters/pricing', 'priceKey=a&priceKey=b&amountUsd=1&effectiveStartDate=2030-01-01&reason=r', adminCookie],
    ['admin role grant preview', () => '/admin/admin-roles/grant', `member_key=${MEMBER_SLUG}&member_key=x&reason=r`, adminCookie],
    ['admin role grant confirm', () => '/admin/admin-roles/grant/confirm', `member_key=${MEMBER_SLUG}&member_key=x&reason=r`, adminCookie],
    ['admin role revoke preview', () => `/admin/admin-roles/${ADMIN_ID}/revoke`, 'reason=a&reason=b', adminCookie],
    ['admin role revoke confirm', () => `/admin/admin-roles/${ADMIN_ID}/revoke/confirm`, 'reason=a&reason=b', adminCookie],
    ['organizer assign', () => `/admin/events/${eventId}/organizers/assign`, `member_key=${MEMBER_SLUG}&member_key=x&reason=r`, adminCookie],
    ['organizer remove', () => `/admin/events/${eventId}/organizers/remove`, `member_id=${MEMBER_ID}&member_id=x&reason=r`, adminCookie],
    ['takedown delete', () => `/admin/media-flags/${mediaId}/delete`, 'reason=a&reason=b', adminCookie],
    ['takedown no action', () => `/admin/media-flags/${mediaId}/no-action`, 'reason=a&reason=b', adminCookie],
    ['takedown report as admin', () => `/admin/media-flags/${mediaId}/flag`, 'reason_code=spam&reason_code=other', adminCookie],
    ['takedown clear report', () => '/admin/media-flags/flags/shape-flag/clear', 'reason=a&reason=b', adminCookie],
    ['club leader assign', () => `/admin/clubs/${clubId}/leadership/assign`, `member_key=${MEMBER_SLUG}&member_key=x&reason=r`, adminCookie],
    ['club leader demote preview', () => `/admin/clubs/${clubId}/leadership/demote`, `member_id=${MEMBER_ID}&mode=to_member&mode=remove_affiliation&reason=r`, adminCookie],
    ['club leader demote confirm', () => `/admin/clubs/${clubId}/leadership/demote/confirm`, `member_id=${MEMBER_ID}&member_id=x&mode=to_member&reason=r`, adminCookie],
    ['honor grant preview', () => '/admin/honor-grants/grant', `member_key=${MEMBER_SLUG}&honor=a&honor=b&induction_year=`, adminCookie],
    ['honor grant confirm', () => '/admin/honor-grants/grant/confirm', `member_key=${MEMBER_SLUG}&honor=a&honor=b&induction_year=`, adminCookie],
    ['honor remove preview', () => '/admin/honor-grants/remove', `member_key=${MEMBER_SLUG}&honor=hof&reason=a&reason=b`, adminCookie],
    ['honor remove confirm', () => '/admin/honor-grants/remove/confirm', `member_key=${MEMBER_SLUG}&honor=hof&reason=a&reason=b`, adminCookie],
    ['board set preview', () => '/admin/honor-grants/board/set', `member_key=${MEMBER_SLUG}&member_key=x&reason=r`, adminCookie],
    ['board set confirm', () => '/admin/honor-grants/board/set/confirm', `member_key=${MEMBER_SLUG}&member_key=x&reason=r`, adminCookie],
    ['club cleanup resolve', () => `/admin/club-cleanup/${clubId}/resolve`, 'action=archive&action=dismiss&reasonText=r', adminCookie],
    ['club cleanup claim', () => '/admin/club-cleanup/claim', `itemType=club&itemId=${clubId}&itemId=x`, adminCookie],
    ['club cleanup bulk resolve', () => '/admin/club-cleanup/bulk-resolve', 'group=a&action=park&reasonText=a&reasonText=b', adminCookie],
    ['club cleanup delist residue', () => `/admin/club-cleanup/${clubId}/delist-residue`, 'reasonText=a&reasonText=b', adminCookie],
    ['club cleanup promote candidate', () => '/admin/club-cleanup/candidates/shape-candidate/promote', 'reasonText=r&region=a&region=b', adminCookie],
    ['club cleanup resolve candidate', () => '/admin/club-cleanup/candidates/shape-candidate/resolve', 'action=park&predicate=a&predicate=b', adminCookie],
    ['work queue claim', () => '/admin/work-queue/shape-item/claim', 'kind=a&kind=b', adminCookie],
    ['work queue resolve', () => '/admin/work-queue/shape-item/resolve', 'decision_label=a&decision_label=b&resolution_note=n', adminCookie],
    ['work queue park', () => '/admin/work-queue/shape-item/park', 'note=a&note=b', adminCookie],
    ['work queue unpark', () => '/admin/work-queue/shape-item/unpark', 'kind=a&kind=b', adminCookie],
    ['work queue dismiss', () => '/admin/work-queue/shape-item/dismiss', 'note=a&note=b', adminCookie],
    ['work queue ask member', () => '/admin/work-queue/shape-item/ask-member', 'subject=a&subject=b&body=x&expectedAnswerKind=free_text', adminCookie],
    ['link help approve preview', () => '/admin/work-queue/shape-item/link-help/approve', 'target_legacy_member_id=a&target_legacy_member_id=b', adminCookie],
    ['link help approve confirm', () => '/admin/work-queue/shape-item/link-help/approve/confirm', 'target_legacy_member_id=a&target_legacy_member_id=b', adminCookie],
    ['link help dispute preview', () => '/admin/work-queue/shape-item/link-help/dispute-revert', 'target_legacy_member_id=a&reason=a&reason=b', adminCookie],
    ['link help dispute confirm', () => '/admin/work-queue/shape-item/link-help/dispute-revert/confirm', 'target_legacy_member_id=a&reason=a&reason=b', adminCookie],
    ['link help reject', () => '/admin/work-queue/shape-item/link-help/reject', 'reason=a&reason=b', adminCookie],
    ['announcement approve', () => '/admin/work-queue/shape-item/announcement/approve', 'kind=a&kind=b', adminCookie],
    ['announcement send back', () => '/admin/work-queue/shape-item/announcement/send-back', 'comment=a&comment=b', adminCookie],
  ];
  it.each(cases)('%s', async (_name, path, body, cookie) => {
    const res = await request(app).post(path()).set('Cookie', cookie()).type('form').send(body);
    expect(res.status, res.text.slice(0, 300)).toBe(422);
    expect(clubName()).toBe('Shape Club');
  });
});

describe('JSON is parsed only on the routes code calls with JSON', () => {
  // Defect caught: the app still parses JSON on a form route, so any form
  // field can again arrive as a number or an object.
  it('a sign-in sent as JSON carries no fields, so it signs nobody in', async () => {
    const res = await request(app)
      .post('/login')
      .set('Content-Type', 'application/json')
      .send({ email: MEMBER_EMAIL, password: MEMBER_PASSWORD, 'cf-turnstile-response': 'stub-captcha-pass' });
    expect(res.status).not.toBe(303);
    expect(sessionCookieFrom(res)).toBeUndefined();
  });
});

describe('extra privileged fields posted with a real form are ignored', () => {
  // Defect caught: a registrant posts is_admin or another member's id beside
  // the real fields and the new account comes out privileged or attached to
  // someone else (mass assignment).
  it('registration creates an ordinary account whatever extra fields it carries', async () => {
    const email = 'shape-overpost@example.com';
    const res = await request(app).post('/register').type('form').send({
      givenNames: 'Over', familyName: 'Post', displayName: 'Over Post', email,
      password: 'OverPostPass!1', confirmPassword: 'OverPostPass!1',
      is_admin: '1', role: 'admin', tier: '3', id: MEMBER_ID, member_id: MEMBER_ID, email_verified_at: '2025-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(303);
    const row = readDb<{ id: string; is_admin: number; email_verified_at: string | null }>(
      'SELECT id, is_admin, email_verified_at FROM members WHERE login_email = ?', email,
    );
    expect(row.is_admin).toBe(0);
    expect(row.email_verified_at).toBeNull();
    expect(row.id).not.toBe(MEMBER_ID);
    expect(readDb<{ login_email: string }>('SELECT login_email FROM members WHERE id = ?', MEMBER_ID).login_email)
      .toBe(MEMBER_EMAIL);
  });

  // Defect caught: a member changing their own password posts another
  // member's id and changes that member's password instead.
  it('change password changes only the signed-in member, whatever id is posted', async () => {
    const adminBefore = passwordHashOf(ADMIN_ID);
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/edit/password`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ oldPassword: 'not-the-password', newPassword: 'Another!Pass1', confirmPassword: 'Another!Pass1', memberId: ADMIN_ID, userId: ADMIN_ID });
    expect(res.status).toBe(422);
    expect(passwordHashOf(ADMIN_ID)).toBe(adminBefore);
  });
});
