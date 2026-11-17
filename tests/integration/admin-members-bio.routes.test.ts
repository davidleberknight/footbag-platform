/**
 * Administrator clearing of a member's biography, from the member record.
 *
 * The biography is the member's own words: an administrator can clear it but
 * never rewrite it. The act takes a mandatory reason, records the text before
 * and after in the audit row, and emails the member, all together; a biography
 * already empty is not an event and writes nothing. The control is offered only
 * on a record that can be corrected and has a biography to clear.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp, seedEmailTemplates } from '../fixtures/testDb';
import { insertMember, completeOnboarding, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3443');

const ADMIN_ID = 'bc_admin';
const TARGET_ID = 'bc_target';
const EMPTY_ID = 'bc_empty';
const DELETED_ID = 'bc_deleted';

const BIO = 'Zqx my own words about my footbag years.';
const REASON = 'The biography carried another member\'s phone number.';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const adminCookie = () => cookie(ADMIN_ID, 'admin');

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function bioOf(memberId: string): string | null {
  return (db((conn) => conn.prepare('SELECT bio FROM members WHERE id = ?').get(memberId)) as
    { bio: string | null }).bio;
}

function corrections(memberId: string): Array<{
  id: string; actor_member_id: string; reason_text: string; metadata_json: string;
}> {
  return db((conn) => conn.prepare(
    "SELECT id, actor_member_id, reason_text, metadata_json FROM audit_entries"
    + " WHERE action_type = 'member.profile_corrected' AND entity_id = ?",
  ).all(memberId)) as Array<{ id: string; actor_member_id: string; reason_text: string; metadata_json: string }>;
}

function notices(memberId: string): Array<{ idempotency_key: string; body_text: string }> {
  return db((conn) => conn.prepare(
    "SELECT idempotency_key, body_text FROM outbox_emails"
    + " WHERE recipient_member_id = ? AND template_key = 'member_record_corrected'",
  ).all(memberId)) as Array<{ idempotency_key: string; body_text: string }>;
}

function post(path: string, body: Record<string, string>, as = adminCookie()) {
  return request(createApp()).post(path).set('Cookie', as).type('form').send(body);
}

/** The bio-clear form on the record, and whether its disclosure is open. */
function bioForm(html: string, memberId: string): { opened: boolean; body: string } | null {
  const at = html.indexOf(`action="/admin/members/${memberId}/bio/clear"`);
  if (at === -1) return null;
  const open = html.lastIndexOf('<details', at);
  return {
    opened: /^<details[^>]* open/.test(html.slice(open, html.indexOf('>', open) + 1)),
    body: html.slice(at, html.indexOf('</form>', at)),
  };
}

/** The record page a redirect lands on, carrying the flash cookie it set. */
async function landed(res: { headers: Record<string, unknown> }, memberId: string): Promise<string> {
  const carried = (res.headers['set-cookie'] as string[] | undefined ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const page = await request(createApp())
    .get(`/admin/members/${memberId}`)
    .set('Cookie', `${carried}; ${adminCookie()}`);
  expect(page.status).toBe(200);
  return page.text;
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  seedEmailTemplates(conn);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'bc-admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'bc-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: TARGET_ID, slug: 'bc-target', display_name: 'Tam Target', real_name: 'Tam Target',
    login_email: 'bc-target@example.com', bio: BIO,
  });
  insertMember(conn, {
    id: EMPTY_ID, slug: 'bc-empty', display_name: 'Em Pty', real_name: 'Em Pty',
    login_email: 'bc-empty@example.com', bio: '',
  });
  insertMember(conn, {
    id: DELETED_ID, slug: 'bc-deleted', display_name: 'Del Eted', real_name: 'Del Eted',
    login_email: 'bc-deleted@example.com', bio: BIO,
  });
  for (const id of [ADMIN_ID, TARGET_ID, EMPTY_ID, DELETED_ID]) completeOnboarding(conn, id);
  conn.prepare("UPDATE members SET deleted_at = '2026-09-01T00:00:00.000Z' WHERE id = ?").run(DELETED_ID);
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the record offers the control only where there is a biography to clear', () => {
  it('offers it on a correctable record with a biography, and not on one without', async () => {
    const withBio = await request(createApp()).get(`/admin/members/${TARGET_ID}`).set('Cookie', adminCookie());
    const without = await request(createApp()).get(`/admin/members/${EMPTY_ID}`).set('Cookie', adminCookie());
    expect(withBio.status).toBe(200);
    expect(without.status).toBe(200);
    // An administrator who cannot reach the control cannot take down abusive words.
    expect(bioForm(withBio.text, TARGET_ID)?.body).toContain('name="reason"');
    // A control offered with nothing to clear is one the server then refuses.
    expect(bioForm(without.text, EMPTY_ID)).toBeNull();
  });

  it('does not offer it on a deleted account', async () => {
    const res = await request(createApp()).get(`/admin/members/${DELETED_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(bioForm(res.text, DELETED_ID)).toBeNull();
  });
});

describe('the preview writes nothing', () => {
  it('renders the confirmation carrying the reason to the confirm address', async () => {
    const res = await post(`/admin/members/${TARGET_ID}/bio/clear`, { reason: REASON });
    expect(res.status).toBe(200);
    // The administrator confirms what is about to go: the text as it stands.
    expect(res.text).toContain(BIO);
    expect(res.text).toContain(`action="/admin/members/${TARGET_ID}/bio/clear/confirm"`);
    expect(res.text).toMatch(/name="reason" value="The biography carried another member&#x27;s phone number\."/);
    expect(bioOf(TARGET_ID)).toBe(BIO);
    expect(corrections(TARGET_ID)).toHaveLength(0);
  });

  it('lists no change to confirm for a biography already empty', async () => {
    const res = await post(`/admin/members/${EMPTY_ID}/bio/clear`, { reason: REASON });
    expect(res.status).toBe(200);
    // A preview listing a change that is not there misstates what the
    // administrator is about to confirm.
    expect(res.text).not.toContain('<dt>');
    expect(corrections(EMPTY_ID)).toHaveLength(0);
  });

  it('refuses a preview with no reason back in the open biography form, and the corrected one goes through', async () => {
    const res = await post(`/admin/members/${TARGET_ID}/bio/clear`, { reason: '   ' });
    expect(res.status).toBe(422);
    const form = bioForm(res.text, TARGET_ID);
    // A refusal that lands in a closed form, or no form, leaves the
    // administrator with no way forward from the page they are on.
    expect(form?.opened).toBe(true);
    expect(res.text).toContain('form-error-banner');

    const fixed = await post(`/admin/members/${TARGET_ID}/bio/clear`, { reason: REASON });
    expect(fixed.status).toBe(200);
    expect(bioOf(TARGET_ID)).toBe(BIO);
  });
});

describe('the confirmation refuses without a reason', () => {
  it('re-renders the record at 422 and leaves the biography', async () => {
    const res = await post(`/admin/members/${TARGET_ID}/bio/clear/confirm`, { reason: '' });
    expect(res.status).toBe(422);
    expect(bioOf(TARGET_ID)).toBe(BIO);
    expect(corrections(TARGET_ID)).toHaveLength(0);
    expect(notices(TARGET_ID)).toHaveLength(0);
  });

  it('refuses a crafted clear on a deleted account, writing nothing', async () => {
    const res = await post(`/admin/members/${DELETED_ID}/bio/clear/confirm`, { reason: REASON });
    expect(res.status).toBe(422);
    expect(bioOf(DELETED_ID)).toBe(BIO);
    expect(corrections(DELETED_ID)).toHaveLength(0);
  });
});

describe('the clear empties the biography, records it, and tells the member', () => {
  it('empties it even when words for it are posted, and returns to the record', async () => {
    const res = await post(`/admin/members/${TARGET_ID}/bio/clear/confirm`, {
      reason: REASON,
      bio: 'Words an administrator put in their mouth.',
    });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/admin/members/${TARGET_ID}`);
    // Cleared, never rewritten: no prose of anyone else's lands under their name.
    expect(bioOf(TARGET_ID)).toBe('');
    // An administrator told nothing changed, after a clear that landed, clears it
    // again or reports a fault.
    const page = await landed(res, TARGET_ID);
    expect(page).toContain('form-success-banner');
    expect(page).not.toContain('class="form-notice"');
  });

  it('audits the text before and after with the reason and the acting administrator', () => {
    const rows = corrections(TARGET_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_member_id).toBe(ADMIN_ID);
    expect(rows[0].reason_text).toBe(REASON);
    // Without the text before, a clear made in error cannot be reviewed or undone.
    expect(JSON.parse(rows[0].metadata_json)).toEqual({
      fields: ['bio'], before: { bio: BIO }, after: { bio: '' },
    });
  });

  it('emails the member the reason, keyed on the correction', () => {
    const [audit] = corrections(TARGET_ID);
    const mail = notices(TARGET_ID);
    expect(mail).toHaveLength(1);
    expect(mail[0].idempotency_key).toBe(`member_record_corrected:${audit.id}:${TARGET_ID}`);
    expect(mail[0].body_text).toContain(REASON);
  });

  it('no longer offers the control once the biography is empty', async () => {
    const res = await request(createApp()).get(`/admin/members/${TARGET_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(bioForm(res.text, TARGET_ID)).toBeNull();
  });

  it('writes nothing more when the clear is confirmed again', async () => {
    const res = await post(`/admin/members/${TARGET_ID}/bio/clear/confirm`, { reason: REASON });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/admin/members/${TARGET_ID}`);
    expect(corrections(TARGET_ID)).toHaveLength(1);
    expect(notices(TARGET_ID)).toHaveLength(1);
    // A repeat that changed nothing claims no change in the success tone.
    const page = await landed(res, TARGET_ID);
    expect(page).toContain('class="form-notice"');
    expect(page).not.toContain('form-success-banner');
  });
});

describe('the route is administrator-only', () => {
  it('refuses an authenticated non-administrator and redirects a visitor to log in', async () => {
    const member = await post(
      `/admin/members/${EMPTY_ID}/bio/clear/confirm`, { reason: REASON }, cookie(EMPTY_ID, 'member'),
    );
    expect(member.status).toBe(403);
    const visitor = await request(createApp())
      .post(`/admin/members/${EMPTY_ID}/bio/clear/confirm`).type('form').send({ reason: REASON });
    expect(visitor.status).toBe(302);
    expect(visitor.headers['location']).toContain('/login');
  });
});
