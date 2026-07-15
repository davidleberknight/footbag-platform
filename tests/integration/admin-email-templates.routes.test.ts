/**
 * Admin email-template editor: GET /admin/email-templates, GET and POST
 * /admin/email-templates/:key/edit.
 *
 * An admin-only surface listing every registered outbound email template and
 * editing one template's wording, enabled flag, and PII classification. A save
 * updates the row and appends one audit entry in one transaction, and the very
 * next send renders the edited wording. Validation enforces the logic-less
 * template contract: only the template's declared merge fields may appear, and
 * every declared merge field must appear (an omitted credential-link token
 * would silently send a broken email). There is no create or delete path on
 * this surface. This suite pins the admin gate, the list, the field display,
 * the persisted save with its one audit row, the validation rules, overposting
 * safety, and the edit-to-send round trip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3971');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000et01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000et02';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

function templateRow(key: string): {
  subject_template: string; body_template: string; is_enabled: number;
  pii_classification: string; version: number; updated_by: string; template_key: string;
} {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM email_templates WHERE template_key = ?').get(key) as never;
  db.close();
  return row;
}

function auditRowsFor(key: string): Array<{ action_type: string; actor_member_id: string; metadata_json: string }> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    "SELECT action_type, actor_member_id, metadata_json FROM audit_entries WHERE entity_type = 'email_template' AND entity_id = ?",
  ).all(key) as never;
  db.close();
  return rows;
}

// A complete valid edit body for club_coleader_invite. Individual tests
// override a field.
function validBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    subjectTemplate: 'Co-lead {clubName}?',
    bodyTemplate: 'Hi {inviteeName},\n\nCome co-lead {clubName}.\n\n-- IFPA platform',
    piiClassification: 'confidential',
    isEnabled: '1',
    ...overrides,
  };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'et_admin', display_name: 'ET Admin', login_email: 'et-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'et_member', display_name: 'ET Member', login_email: 'et-member@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /admin/email-templates', () => {
  it('redirects unauthenticated traffic to login', async () => {
    const res = await request(createApp()).get('/admin/email-templates');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('returns 403 for a signed-in non-admin', async () => {
    const res = await request(createApp())
      .get('/admin/email-templates')
      .set('Cookie', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('lists every seeded template with key, subject, and classification', async () => {
    const res = await request(createApp()).get('/admin/email-templates').set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('account_verify');
    expect(res.text).toContain('payment_receipt_failed');
    expect(res.text).toContain('Verify your IFPA Footbag account');
    expect(res.text).toContain('restricted');
  });
});

describe('GET /admin/email-templates/:key/edit', () => {
  it('404s an unknown template key', async () => {
    const res = await request(createApp())
      .get('/admin/email-templates/no_such_template/edit')
      .set('Cookie', admin());
    expect(res.status).toBe(404);
  });

  it('shows the template fields and its allowed merge fields', async () => {
    const res = await request(createApp())
      .get('/admin/email-templates/account_verify/edit')
      .set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('account_verify');
    expect(res.text).toContain('{verifyUrl}');
    expect(res.text).toContain('{ttlPhrase}');
    expect(res.text).toContain('Welcome to IFPA Footbag.');
  });
});

describe('POST /admin/email-templates/:key/edit', () => {
  it('saves an edit, bumps the version, stamps the admin, and appends one audit row', async () => {
    const before = templateRow('club_coleader_invite');
    const res = await request(createApp())
      .post('/admin/email-templates/club_coleader_invite/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/email-templates/club_coleader_invite/edit?saved=1');

    const after = templateRow('club_coleader_invite');
    expect(after.subject_template).toBe('Co-lead {clubName}?');
    expect(after.body_template).toContain('Come co-lead {clubName}.');
    expect(after.version).toBe(before.version + 1);
    expect(after.updated_by).toBe(ADMIN_ID);

    const audits = auditRowsFor('club_coleader_invite');
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action_type).toBe('email_template.updated');
    expect(audits[0]!.actor_member_id).toBe(ADMIN_ID);
    expect(JSON.parse(audits[0]!.metadata_json).changedFields).toContain('subject_template');
  });

  it('the very next send renders the edited wording', async () => {
    const email = await import('../../src/services/emailService');
    email.emailService.send({
      template: 'club_coleader_invite',
      params: { inviteeName: 'Renee', clubName: 'Boulder Footbag' },
      recipientEmail: 'roundtrip@example.com',
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      "SELECT subject, body_text FROM outbox_emails WHERE recipient_email = 'roundtrip@example.com'",
    ).get() as { subject: string; body_text: string };
    db.close();
    expect(row.subject).toBe('Co-lead Boulder Footbag?');
    expect(row.body_text).toContain('Hi Renee,');
    expect(row.body_text).toContain('Come co-lead Boulder Footbag.');
  });

  it('rejects an unknown merge token with a 422 naming the allowed fields, leaving the row unchanged', async () => {
    const before = templateRow('vouch_confirmation');
    const res = await request(createApp())
      .post('/admin/email-templates/vouch_confirmation/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({
        subjectTemplate: 'Vouched',
        bodyTemplate: 'From {voucherName} until {expiryDate}. Extra: {loginEmail}.',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('unknown merge field {loginEmail}');
    expect(res.text).toContain('{voucherName}');
    expect(templateRow('vouch_confirmation').body_template).toBe(before.body_template);
  });

  it('rejects a template that drops a required merge field (a linkless verification email)', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/account_verify/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({
        subjectTemplate: 'Verify your account',
        bodyTemplate: 'Please verify. The link expires in {ttlPhrase}.',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('missing {verifyUrl}');
  });

  it('rejects conditional-syntax braces', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/password_changed/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({ subjectTemplate: 'Changed', bodyTemplate: '{{#if x}}nope{{/if}}' }));
    expect(res.status).toBe(422);
  });

  it('rejects an empty subject and a bad classification with per-field errors', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/password_changed/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({ subjectTemplate: '   ', bodyTemplate: 'b', piiClassification: 'top_secret' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Subject: required.');
    expect(res.text).toContain('Classification: choose one of the listed values.');
  });

  it('an unchecked enabled box disables the template', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/admin_queue_alert/edit')
      .set('Cookie', admin())
      .type('form')
      .send({
        subjectTemplate: 'New admin queue item: {taskType}',
        bodyTemplate: 'Task type: {taskType}\nEntity ID: {entityId}',
        piiClassification: 'internal',
        // isEnabled omitted: an unchecked checkbox posts nothing.
      });
    expect(res.status).toBe(303);
    expect(templateRow('admin_queue_alert').is_enabled).toBe(0);
  });

  it('ignores overposted privileged fields (key, id, version stay server-owned)', async () => {
    const before = templateRow('password_reset_confirm');
    const res = await request(createApp())
      .post('/admin/email-templates/password_reset_confirm/edit')
      .set('Cookie', admin())
      .type('form')
      .send({
        subjectTemplate: 'Your IFPA Footbag password was changed',
        bodyTemplate: 'Reset done.',
        piiClassification: 'internal',
        isEnabled: '1',
        template_key: 'account_verify',
        id: 'evil-id',
        version: '999',
        updated_by: 'someone-else',
      });
    expect(res.status).toBe(303);
    const after = templateRow('password_reset_confirm');
    expect(after.template_key).toBe('password_reset_confirm');
    expect(after.version).toBe(before.version + 1);
    expect(after.updated_by).toBe(ADMIN_ID);
    // The named other template is untouched.
    expect(templateRow('account_verify').subject_template).toBe('Verify your IFPA Footbag account');
  });

  it('404s a save against an unknown key and 403s a non-admin save', async () => {
    const unknown = await request(createApp())
      .post('/admin/email-templates/no_such_template/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody());
    expect(unknown.status).toBe(404);

    const nonAdmin = await request(createApp())
      .post('/admin/email-templates/password_changed/edit')
      .set('Cookie', cookieFor(MEMBER_ID, 'member'))
      .type('form')
      .send(validBody());
    expect(nonAdmin.status).toBe(403);
  });
});
